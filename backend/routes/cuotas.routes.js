import express from 'express';
import dbPromise from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import {
  TIPOS_CON_REFERENCIA, TIPOS_TARIFA, calcularCuota, numeroFactura, tarifasPorConcepto,
  validarImporte, validarPeriodo, vencimientoDelPeriodo
} from '../cuotas.js';
import { esFechaValida, limpiar } from '../validaciones.js';

const router = express.Router();

router.use(authenticate);
router.use(requireRole('administrador'));

// ---------- Valores (tarifas) ----------
// Cada cambio de valor se guarda como una tarifa nueva con su fecha de vigencia,
// así las cuotas de períodos anteriores conservan el valor que tenían.

// Última tarifa de cada concepto con vigencia hasta la fecha indicada (AAAA-MM-DD).
async function tarifasVigentes(db, hasta) {
  return db.all(
    `SELECT DISTINCT ON (tipo, COALESCE(referencia_id, 0)) tipo, referencia_id, importe, vigente_desde
     FROM tarifas
     WHERE vigente_desde <= ?
     ORDER BY tipo, COALESCE(referencia_id, 0), vigente_desde DESC, id DESC`,
    hasta
  );
}

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

// Carga el valor de un concepto desde una fecha (por defecto, hoy). Si ya había
// un valor para ese concepto con la misma fecha, se reemplaza.
router.put('/valores', async (req, res) => {
  const { tipo } = req.body;
  if (!TIPOS_TARIFA.includes(tipo)) return res.status(400).json({ message: 'El concepto no es válido' });

  const errorImporte = validarImporte(req.body.importe);
  if (errorImporte) return res.status(400).json({ message: errorImporte });

  const vigenteDesde = limpiar(req.body.vigente_desde) || new Date().toLocaleDateString('sv-SE');
  if (!esFechaValida(vigenteDesde)) return res.status(400).json({ message: 'Vigente desde: ingresá una fecha válida.' });

  const db = await dbPromise;
  let referenciaId = null;
  if (TIPOS_CON_REFERENCIA.includes(tipo)) {
    referenciaId = Number(req.body.referencia_id);
    const tabla = tipo === 'deporte' ? 'deportes' : 'recorridos_transporte';
    if (!Number.isInteger(referenciaId) || !(await db.get(`SELECT id FROM ${tabla} WHERE id = ?`, referenciaId))) {
      return res.status(404).json({ message: tipo === 'deporte' ? 'Deporte no encontrado' : 'Recorrido no encontrado' });
    }
  }

  const importe = Number(String(req.body.importe).trim());
  const existente = await db.get(
    'SELECT id FROM tarifas WHERE tipo = ? AND referencia_id IS NOT DISTINCT FROM ? AND vigente_desde = ?',
    [tipo, referenciaId, vigenteDesde]
  );
  if (existente) {
    await db.run('UPDATE tarifas SET importe = ? WHERE id = ?', [importe, existente.id]);
  } else {
    await db.run(
      'INSERT INTO tarifas (tipo, referencia_id, importe, vigente_desde) VALUES (?, ?, ?, ?)',
      [tipo, referenciaId, importe, vigenteDesde]
    );
  }
  res.json(await valores(db));
});

// ---------- Generación de cuotas ----------

// Por cada alumno activo: cuota del período con sus ítems (cuota base, cada
// deporte, recorrido y comedor con inscripción activa), vencimiento el día 10
// y factura con número correlativo. Los alumnos que ya tienen la cuota del
// período se saltean. Todo en una transacción: si falta el valor de algún
// concepto, no se genera ninguna cuota.
router.post('/generar', async (req, res) => {
  const periodo = limpiar(req.body.periodo);
  const errorPeriodo = validarPeriodo(periodo);
  if (errorPeriodo) return res.status(400).json({ message: errorPeriodo });

  const db = await dbPromise;
  try {
    const resultado = await db.transaccion(async (tx) => {
      // Que dos generaciones simultáneas no repitan cuotas ni números de factura.
      await tx.run('LOCK TABLE cuotas, items_cuota, facturas IN SHARE ROW EXCLUSIVE MODE');

      const alumnos = await tx.all("SELECT id FROM alumnos WHERE estado = 'Activo' ORDER BY apellido, nombre, id");
      const conCuota = new Set((await tx.all('SELECT alumno_id FROM cuotas WHERE periodo = ?', periodo)).map((c) => c.alumno_id));
      const pendientes = alumnos.filter((a) => !conCuota.has(a.id));

      // Tarifas vigentes en el período (cargadas con fecha hasta el fin del mes).
      const tarifas = tarifasPorConcepto(await tarifasVigentes(tx, `${periodo}-31`));
      const deportes = await tx.all(
        `SELECT i.alumno_id, d.id, d.nombre FROM inscripciones_deportivas i
         JOIN deportes d ON d.id = i.deporte_id
         WHERE i.estado = 'Activa'
         ORDER BY d.nombre, d.id`
      );
      const recorridos = await tx.all(
        `SELECT i.alumno_id, r.id, r.nombre FROM inscripciones_transporte i
         JOIN recorridos_transporte r ON r.id = i.recorrido_id
         WHERE i.estado = 'Activa'`
      );
      const comedor = new Set((await tx.all("SELECT alumno_id FROM inscripciones_comedor WHERE estado = 'Activa'")).map((c) => c.alumno_id));

      const cuotas = pendientes.map((a) => ({
        alumnoId: a.id,
        ...calcularCuota({
          tarifas,
          deportes: deportes.filter((d) => d.alumno_id === a.id),
          recorrido: recorridos.find((r) => r.alumno_id === a.id) || null,
          comedor: comedor.has(a.id)
        })
      }));
      const faltantes = [...new Set(cuotas.flatMap((c) => c.faltantes))];
      if (faltantes.length > 0) {
        throw Object.assign(new Error(`Falta cargar el valor de: ${faltantes.join(', ')}`), { status: 400 });
      }

      const { ultimo } = await tx.get(
        "SELECT MAX(CAST(SUBSTRING(numero FROM 3) AS INTEGER)) AS ultimo FROM facturas WHERE numero ~ '^F-[0-9]+$'"
      );
      let correlativo = ultimo || 0;
      for (const cuota of cuotas) {
        const cuotaId = (await tx.run(
          'INSERT INTO cuotas (alumno_id, periodo, vencimiento, total) VALUES (?, ?, ?, ?)',
          [cuota.alumnoId, periodo, vencimientoDelPeriodo(periodo), cuota.total]
        )).lastID;
        for (const item of cuota.items) {
          await tx.run(
            'INSERT INTO items_cuota (cuota_id, concepto, referencia_id, descripcion, importe) VALUES (?, ?, ?, ?, ?)',
            [cuotaId, item.concepto, item.referencia_id, item.descripcion, item.importe]
          );
        }
        correlativo += 1;
        await tx.run(
          'INSERT INTO facturas (cuota_id, numero, total) VALUES (?, ?, ?)',
          [cuotaId, numeroFactura(correlativo), cuota.total]
        );
      }
      return { periodo, creadas: cuotas.length, salteadas: alumnos.length - pendientes.length };
    });
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

export default router;
