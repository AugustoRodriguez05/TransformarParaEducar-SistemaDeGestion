import express from 'express';
import dbPromise from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import {
  TIPOS_CON_REFERENCIA, TIPOS_TARIFA, accionPrecio, validarImporte, validarPeriodo
} from '../cuotas.js';
import { generarCuotasDelPeriodo, tarifasVigentes } from '../generacion-cuotas.js';
import { esFechaValida, limpiar } from '../validaciones.js';
import { enviarDeudas, enviarRecordatorios } from '../envios.js';

const router = express.Router();

router.use(authenticate);
router.use(requireRole('administrador'));

// ---------- Valores (tarifas) ----------
// Cada precio se guarda con su fecha "vigente desde". Un precio con fecha posterior
// al vigente se agrega y el anterior queda para generar los meses previos; la
// pantalla muestra solo el vigente. Las cuotas ya generadas no cambian: cada ítem guarda su importe.

// Valor actual de la cuota base, el comedor, cada deporte y cada recorrido
// (el último cargado, con su fecha de vigencia; null si todavía no tiene).
async function valores(db) {
  const filas = await tarifasVigentes(db, '9999-12-31');
  const buscar = (tipo, referenciaId = null) => {
    const fila = filas.find((f) => f.tipo === tipo && (f.referencia_id ?? null) === referenciaId);
    return fila ? { importe: fila.importe, vigente_desde: fila.vigente_desde } : null;
  };
  const deportes = await db.all('SELECT id, nombre, nivel, dia, hora_inicio, hora_fin FROM deportes ORDER BY nombre, nivel NULLS FIRST, dia, hora_inicio');
  const recorridos = await db.all('SELECT id, nombre FROM recorridos_transporte ORDER BY id');
  return {
    cuota: buscar('cuota'),
    comedor: buscar('comedor'),
    deportes: deportes.map((d) => ({ ...d, tarifa: buscar('deporte', d.id) })),
    recorridos: recorridos.map((r) => ({ ...r, tarifa: buscar('transporte', r.id) }))
  };
}

router.get('/valores', async (req, res) => {
  const db = await dbPromise;
  res.json(await valores(db));
});

// AAAA-MM-DD → DD/MM/AAAA, para los mensajes.
const fechaTexto = (fecha) => fecha.split('-').reverse().join('/');

// Valida concepto, importe y fecha del cuerpo. Devuelve { status, message } si hay
// un error, o { tipo, referenciaId, importe, vigenteDesde }.
async function leerPrecio(db, body) {
  const { tipo } = body;
  if (!TIPOS_TARIFA.includes(tipo)) return { status: 400, message: 'El concepto no es válido' };

  const errorImporte = validarImporte(body.importe);
  if (errorImporte) return { status: 400, message: errorImporte };

  const vigenteDesde = limpiar(body.vigente_desde) || new Date().toLocaleDateString('sv-SE');
  if (!esFechaValida(vigenteDesde)) return { status: 400, message: 'Vigente desde: ingresá una fecha válida.' };

  let referenciaId = null;
  if (TIPOS_CON_REFERENCIA.includes(tipo)) {
    referenciaId = Number(body.referencia_id);
    const tabla = tipo === 'deporte' ? 'deportes' : 'recorridos_transporte';
    if (!Number.isInteger(referenciaId) || !(await db.get(`SELECT id FROM ${tabla} WHERE id = ?`, referenciaId))) {
      return { status: 404, message: tipo === 'deporte' ? 'Deporte no encontrado' : 'Recorrido no encontrado' };
    }
  }
  return { tipo, referenciaId, importe: Number(String(body.importe).trim()), vigenteDesde };
}

// Filas de tarifas del concepto, de la vigencia más reciente a la más vieja. La primera
// es el precio actual (el que muestra la tabla); las demás quedan para los meses previos.
async function preciosDelConcepto(tx, tipo, referenciaId) {
  return tx.all(
    `SELECT id, vigente_desde FROM tarifas WHERE tipo = ? AND referencia_id IS NOT DISTINCT FROM ?
     ORDER BY vigente_desde DESC, id DESC FOR UPDATE`,
    [tipo, referenciaId]
  );
}

const errorConEstado = (status, message) => Object.assign(new Error(message), { status });

// Guarda el precio de un concepto. Según su fecha frente a la del precio vigente:
// posterior → precio nuevo (fila nueva; el anterior queda para los meses previos);
// igual o anterior → corrige la fila del vigente (importe y fecha); sin precio → lo crea.
// Devuelve los valores actualizados y la acción hecha ('nuevo', 'corregir' o 'crear').
router.put('/valores', async (req, res) => {
  const db = await dbPromise;
  const precio = await leerPrecio(db, req.body);
  if (precio.status) return res.status(precio.status).json({ message: precio.message });

  let accion;
  try {
    accion = await db.transaccion(async (tx) => {
      const filas = await preciosDelConcepto(tx, precio.tipo, precio.referenciaId);
      const [actual, anterior] = filas;
      const resultado = accionPrecio(actual ? actual.vigente_desde : null, precio.vigenteDesde);
      if (resultado !== 'corregir') {
        await tx.run(
          'INSERT INTO tarifas (tipo, referencia_id, importe, vigente_desde) VALUES (?, ?, ?, ?)',
          [precio.tipo, precio.referenciaId, precio.importe, precio.vigenteDesde]
        );
        return resultado;
      }
      if (filas.some((f) => f.id !== actual.id && f.vigente_desde === precio.vigenteDesde)) {
        throw errorConEstado(409, `Ya hay otro precio de este concepto vigente desde el ${fechaTexto(precio.vigenteDesde)}. Elegí otra fecha.`);
      }
      // Si la fecha corregida quedara antes que la del precio anterior, el vigente pasaría a ser otro.
      if (anterior && precio.vigenteDesde < anterior.vigente_desde) {
        throw errorConEstado(400, `La fecha tiene que ser posterior al ${fechaTexto(anterior.vigente_desde)}, la del precio anterior.`);
      }
      await tx.run('UPDATE tarifas SET importe = ?, vigente_desde = ? WHERE id = ?', [precio.importe, precio.vigenteDesde, actual.id]);
      return resultado;
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    throw err;
  }
  res.json({ ...(await valores(db)), accion });
});

// ---------- Generación de cuotas ----------

// Genera las cuotas del período (ver generacion-cuotas.js). Todo en una
// transacción: si falta el valor de algún concepto, no se genera ninguna cuota.
router.post('/generar', async (req, res) => {
  const periodo = limpiar(req.body.periodo);
  const errorPeriodo = validarPeriodo(periodo);
  if (errorPeriodo) return res.status(400).json({ message: errorPeriodo });

  const db = await dbPromise;
  try {
    const resultado = await db.transaccion((tx) => generarCuotasDelPeriodo(tx, periodo));
    res.status(201).json(resultado);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    throw err;
  }
});

// ---------- Facturas y comprobantes ----------

// Facturas del período con el estado de su cuota y los comprobantes de pago cargados.
router.get('/facturas', async (req, res) => {
  const periodo = limpiar(req.query.periodo);
  const errorPeriodo = validarPeriodo(periodo);
  if (errorPeriodo) return res.status(400).json({ message: errorPeriodo });

  const db = await dbPromise;
  const facturas = await db.all(
    `SELECT f.id, f.numero, f.total, f.fecha_emision, c.vencimiento, c.estado,
            a.legajo, a.apellido || ', ' || a.nombre as alumno
     FROM facturas f
     JOIN cuotas c ON c.id = f.cuota_id
     JOIN alumnos a ON a.id = c.alumno_id
     WHERE c.periodo = ?
     ORDER BY f.numero`,
    periodo
  );
  const comprobantes = facturas.length === 0 ? [] : await db.all(
    `SELECT factura_id, importe, fecha_transferencia, numero_operacion FROM comprobantes_pago
     WHERE factura_id = ANY(?::int[])
     ORDER BY fecha_transferencia, id`,
    [facturas.map((f) => f.id)]
  );
  res.json(facturas.map((f) => ({
    ...f,
    comprobantes: comprobantes
      .filter((c) => c.factura_id === f.id)
      .map(({ importe, fecha_transferencia, numero_operacion }) => ({ importe, fecha_transferencia, numero_operacion }))
  })));
});

// ---------- Envíos de mails a padres ----------
// Los mismos envíos que se hacen solos (recordatorio el último día hábil, deuda
// el día 20), lanzados a mano para un período. Lo ya enviado no se repite.

function rutaEnvio(enviar) {
  return async (req, res) => {
    const periodo = limpiar(req.body.periodo);
    const errorPeriodo = validarPeriodo(periodo);
    if (errorPeriodo) return res.status(400).json({ message: errorPeriodo });

    const resultado = await enviar(periodo);
    if (resultado.sinConfigurar) {
      return res.status(503).json({ message: 'El envío de mails no está configurado (faltan SMTP_USER y SMTP_PASS).' });
    }
    if (resultado.enCurso) return res.status(409).json({ message: 'Ya hay un envío en curso para ese período.' });
    res.json(resultado);
  };
}

router.post('/envios/recordatorio', rutaEnvio(enviarRecordatorios));
router.post('/envios/deuda', rutaEnvio(enviarDeudas));

// Estado de cada envío del período.
router.get('/envios', async (req, res) => {
  const periodo = limpiar(req.query.periodo);
  const errorPeriodo = validarPeriodo(periodo);
  if (errorPeriodo) return res.status(400).json({ message: errorPeriodo });

  const db = await dbPromise;
  res.json(await db.all(
    `SELECT e.id, e.tipo, e.estado, e.intentos, e.fecha, u.apellido || ', ' || u.nombre as padre, u.email
     FROM envios_mail e
     JOIN usuarios u ON u.id = e.padre_usuario_id
     WHERE e.periodo = ?
     ORDER BY e.tipo, u.apellido, u.nombre`,
    periodo
  ));
});

export default router;
