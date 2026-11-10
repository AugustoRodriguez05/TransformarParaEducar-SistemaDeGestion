import express from 'express';
import dbPromise from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import {
  TIPOS_CON_REFERENCIA, TIPOS_TARIFA, accionPrecio, estadoSegunComprobantes, itemsCubiertos,
  numeroOperacionOriginal, numeroOperacionRechazado, validarImporte, validarPeriodo
} from '../cuotas.js';
import { generarCuotasDelPeriodo, tarifasVigentes } from '../generacion-cuotas.js';
import { esFechaValida, limpiar } from '../validaciones.js';
import { enviarDeudas, enviarRecordatorios } from '../envios.js';
import { notificar } from '../notificaciones.js';

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

// Facturas del período con el estado de su cuota y los comprobantes de pago cargados
// (con su estado de revisión).
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
    `SELECT id, factura_id, importe, fecha_transferencia, numero_operacion, estado, motivo_rechazo FROM comprobantes_pago
     WHERE factura_id = ANY(?::int[])
     ORDER BY fecha_transferencia, id`,
    [facturas.map((f) => f.id)]
  );
  res.json(facturas.map((f) => ({
    ...f,
    comprobantes: comprobantes
      .filter((c) => c.factura_id === f.id)
      .map((c) => ({
        id: c.id,
        importe: c.importe,
        fecha_transferencia: c.fecha_transferencia,
        numero_operacion: numeroOperacionOriginal(c.numero_operacion, c.id),
        estado: c.estado,
        motivo_rechazo: c.motivo_rechazo
      }))
  })));
});

// ---------- Revisión de comprobantes ----------
// El padre carga el comprobante desde la app y queda 'En revisión'. Al aprobarlo se
// recalcula la cuota con los comprobantes aprobados y pasan a 'Pagado' los ítems
// informados que esos comprobantes cubren; al rechazarlo, los ítems informados que
// ya no quedan cubiertos vuelven a 'Pendiente'. En los dos casos se avisa al padre.

const ESTADOS_COMPROBANTE = ['En revisión', 'Aprobado', 'Rechazado'];
const MAX_MOTIVO_RECHAZO = 500;

// Comprobantes (sin el archivo, que se ve con GET /api/pagos/comprobantes/:id/archivo).
// estado: opcional, uno de ESTADOS_COMPROBANTE. Del más viejo al más nuevo.
router.get('/comprobantes', async (req, res) => {
  const estado = limpiar(req.query.estado);
  if (estado && !ESTADOS_COMPROBANTE.includes(estado)) return res.status(400).json({ message: 'El estado no es válido.' });

  const db = await dbPromise;
  const comprobantes = await db.all(
    `SELECT cp.id, cp.factura_id, f.numero as factura, c.periodo,
            a.apellido || ', ' || a.nombre as alumno, a.legajo,
            u.apellido || ', ' || u.nombre as padre,
            cp.importe, cp.fecha_transferencia, cp.numero_operacion, cp.fecha_carga, cp.estado, cp.motivo_rechazo
     FROM comprobantes_pago cp
     JOIN facturas f ON f.id = cp.factura_id
     JOIN cuotas c ON c.id = f.cuota_id
     JOIN alumnos a ON a.id = c.alumno_id
     JOIN usuarios u ON u.id = cp.padre_usuario_id
     ${estado ? 'WHERE cp.estado = ?' : ''}
     ORDER BY cp.fecha_carga, cp.id`,
    estado ? [estado] : []
  );
  res.json(comprobantes.map((c) => ({ ...c, numero_operacion: numeroOperacionOriginal(c.numero_operacion, c.id) })));
});

// Comprobante a revisar con su factura, bloqueados hasta el fin de la transacción.
// 404 si no existe; 409 si ya no está 'En revisión'.
async function comprobanteEnRevision(tx, valor) {
  const id = Number(valor);
  const comprobante = Number.isInteger(id) && id > 0 && id <= 2147483647 ? await tx.get(
    `SELECT cp.id, cp.estado, cp.numero_operacion, cp.padre_usuario_id,
            f.id as factura_id, f.numero as factura, f.total, f.cuota_id
     FROM comprobantes_pago cp JOIN facturas f ON f.id = cp.factura_id
     WHERE cp.id = ? FOR UPDATE OF cp, f`,
    id
  ) : null;
  if (!comprobante) throw errorConEstado(404, 'Comprobante no encontrado');
  if (comprobante.estado !== 'En revisión') {
    throw errorConEstado(409, `Este comprobante ya fue ${comprobante.estado === 'Aprobado' ? 'aprobado' : 'rechazado'}.`);
  }
  return comprobante;
}

// Importes de los comprobantes de la factura en los estados indicados.
async function importesDeComprobantes(tx, facturaId, estados) {
  const filas = await tx.all(
    'SELECT importe FROM comprobantes_pago WHERE factura_id = ? AND estado = ANY(?::text[])',
    [facturaId, estados]
  );
  return filas.map((c) => c.importe);
}

// Ítems de la cuota (bloqueados) y órdenes de pago de la factura con sus ítems, en orden.
async function itemsYOrdenes(tx, comprobante) {
  const items = await tx.all(
    'SELECT id, importe, estado FROM items_cuota WHERE cuota_id = ? ORDER BY id FOR UPDATE',
    comprobante.cuota_id
  );
  const filas = await tx.all(
    `SELECT op.id as orden_id, opi.item_cuota_id
     FROM ordenes_pago op JOIN orden_pago_items opi ON opi.orden_pago_id = op.id
     WHERE op.factura_id = ?
     ORDER BY op.id, opi.item_cuota_id`,
    comprobante.factura_id
  );
  const porId = new Map(items.map((i) => [i.id, i]));
  const ordenes = new Map();
  for (const f of filas) {
    if (!ordenes.has(f.orden_id)) ordenes.set(f.orden_id, { items: [] });
    if (porId.has(f.item_cuota_id)) ordenes.get(f.orden_id).items.push(porId.get(f.item_cuota_id));
  }
  return {
    items,
    ordenes: [...ordenes.values()],
    pagados: items.filter((i) => i.estado === 'Pagado').map((i) => i.importe)
  };
}

function rutaRevision(revisar) {
  return async (req, res) => {
    const db = await dbPromise;
    try {
      res.json(await db.transaccion(async (tx) => revisar(tx, await comprobanteEnRevision(tx, req.params.id), req.body)));
    } catch (err) {
      if (err.status) return res.status(err.status).json({ message: err.message });
      throw err;
    }
  };
}

router.post('/comprobantes/:id/aprobar', rutaRevision(async (tx, comprobante) => {
  await tx.run("UPDATE comprobantes_pago SET estado = 'Aprobado' WHERE id = ?", comprobante.id);

  const aprobados = await importesDeComprobantes(tx, comprobante.factura_id, ['Aprobado']);
  const { estadoCuota, itemsPagados } = estadoSegunComprobantes(comprobante.total, aprobados);
  await tx.run('UPDATE cuotas SET estado = ? WHERE id = ?', [estadoCuota, comprobante.cuota_id]);
  if (itemsPagados) {
    await tx.run("UPDATE items_cuota SET estado = 'Pagado' WHERE cuota_id = ?", comprobante.cuota_id);
  } else {
    const { ordenes, pagados } = await itemsYOrdenes(tx, comprobante);
    const cubiertos = itemsCubiertos({ importes: aprobados, pagados, ordenes });
    if (cubiertos.length > 0) {
      await tx.run("UPDATE items_cuota SET estado = 'Pagado' WHERE id = ANY(?::int[])", [cubiertos]);
    }
  }

  await notificar(tx, comprobante.padre_usuario_id, `Se aprobó tu pago de la factura ${comprobante.factura}.`);
  return { id: comprobante.id, estado: 'Aprobado', estado_cuota: estadoCuota };
}));

// motivo: obligatorio, se guarda y se le manda al padre. El número de operación pasa a
// "<número>-RECH-<id>" para que el padre pueda volver a cargar el comprobante con ese número.
router.post('/comprobantes/:id/rechazar', rutaRevision(async (tx, comprobante, body) => {
  const motivo = limpiar(body?.motivo);
  if (!motivo) throw errorConEstado(400, 'Ingresá el motivo del rechazo.');
  if (motivo.length > MAX_MOTIVO_RECHAZO) {
    throw errorConEstado(400, `Motivo: usá hasta ${MAX_MOTIVO_RECHAZO} caracteres.`);
  }
  await tx.run(
    "UPDATE comprobantes_pago SET estado = 'Rechazado', motivo_rechazo = ?, numero_operacion = ? WHERE id = ?",
    [motivo, numeroOperacionRechazado(comprobante.numero_operacion, comprobante.id), comprobante.id]
  );

  // Si los aprobados ya cubren la factura no hay nada que devolver. Si no, vuelven a
  // 'Pendiente' los ítems informados que no cubren los aprobados ni los comprobantes que
  // siguen en revisión (esos pueden ser de otra orden, todavía sin revisar).
  const aprobados = await importesDeComprobantes(tx, comprobante.factura_id, ['Aprobado']);
  if (!estadoSegunComprobantes(comprobante.total, aprobados)?.itemsPagados) {
    const enRevision = await importesDeComprobantes(tx, comprobante.factura_id, ['En revisión']);
    const { items, ordenes, pagados } = await itemsYOrdenes(tx, comprobante);
    const cubiertos = new Set(itemsCubiertos({ importes: [...aprobados, ...enRevision], pagados, ordenes }));
    const pendientes = items.filter((i) => i.estado === 'Pago informado' && !cubiertos.has(i.id)).map((i) => i.id);
    if (pendientes.length > 0) {
      await tx.run("UPDATE items_cuota SET estado = 'Pendiente' WHERE id = ANY(?::int[])", [pendientes]);
    }
  }

  await notificar(
    tx,
    comprobante.padre_usuario_id,
    `Se rechazó tu comprobante de pago de la factura ${comprobante.factura} (operación ${comprobante.numero_operacion}). Motivo: ${motivo}`
  );
  return { id: comprobante.id, estado: 'Rechazado', motivo_rechazo: motivo };
}));

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
