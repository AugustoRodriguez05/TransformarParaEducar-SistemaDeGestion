import express from 'express';
import dbPromise from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { numeroOperacionOriginal, numeroOrdenPago, validarImporte, validarPeriodo } from '../cuotas.js';
import { ahoraEnArgentina, hoyEnArgentina } from '../envios.js';
import { esFechaValida, limpiar } from '../validaciones.js';

// Pagos del padre (app móvil): cuotas, facturas y deuda de sus hijos, órdenes de
// pago y comprobantes de transferencia. El padre solo ve a los hijos que tiene
// asociados en padre_alumno; con cualquier otro alumno la respuesta es 403.
//
// Este router se registra antes del express.json() general del servidor: cada
// ruta con cuerpo lee su propio JSON, y la de comprobantes acepta hasta 5 MB.

const router = express.Router();

router.use(authenticate);

const MAX_ARCHIVO = 3 * 1024 * 1024;
const MAX_NUMERO_OPERACION = 50;
// Tipos de archivo aceptados, reconocidos por sus primeros bytes.
const FIRMAS = [
  { tipo: 'image/jpeg', extension: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { tipo: 'image/png', extension: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { tipo: 'application/pdf', extension: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46] }
];
const FORMATO_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_ID = 2147483647;

const firmaDe = (archivo) => FIRMAS.find((f) => f.bytes.every((b, i) => archivo[i] === b)) || null;

// Id entero positivo (INTEGER de PostgreSQL) o null.
function aId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 && id <= MAX_ID ? id : null;
}

const aCentavos = (importe) => Math.round(Number(importe) * 100);
const sumar = (importes) => importes.reduce((suma, importe) => suma + aCentavos(importe), 0) / 100;

const errorConEstado = (status, message) => Object.assign(new Error(message), { status });

// Datos de un comprobante que ve el padre (todo menos el archivo).
const CAMPOS_COMPROBANTE = `cp.id, cp.factura_id, cp.numero_operacion, cp.importe, cp.fecha_transferencia,
  cp.fecha_carga, cp.estado, cp.motivo_rechazo`;
const datosComprobante = (c) => ({
  id: c.id,
  numero_operacion: numeroOperacionOriginal(c.numero_operacion, c.id),
  importe: c.importe,
  fecha_transferencia: c.fecha_transferencia,
  fecha_carga: c.fecha_carga,
  estado: c.estado,
  motivo_rechazo: c.motivo_rechazo
});

async function esHijo(db, padreId, alumnoId) {
  return Boolean(await db.get(
    'SELECT id FROM padre_alumno WHERE padre_usuario_id = ? AND alumno_id = ?',
    [padreId, alumnoId]
  ));
}

// Factura con su cuota y el alumno (null si no existe). bloquear: la toma con
// FOR UPDATE para que dos pagos simultáneos de la misma factura se hagan de a uno.
async function buscarFactura(db, id, bloquear = false) {
  return db.get(
    `SELECT f.id, f.numero, f.total, c.id as cuota_id, c.alumno_id, c.periodo
     FROM facturas f JOIN cuotas c ON c.id = f.cuota_id
     WHERE f.id = ?${bloquear ? ' FOR UPDATE OF f' : ''}`,
    id
  );
}

// ---------- Archivo de un comprobante (padre del alumno o administrador) ----------

router.get('/comprobantes/:id/archivo', requireRole('padre', 'administrador'), async (req, res) => {
  const id = aId(req.params.id);
  if (!id) return res.status(404).json({ message: 'Comprobante no encontrado' });

  const db = await dbPromise;
  const comprobante = await db.get(
    `SELECT cp.id, cp.numero_operacion, cp.archivo, c.alumno_id
     FROM comprobantes_pago cp
     JOIN facturas f ON f.id = cp.factura_id
     JOIN cuotas c ON c.id = f.cuota_id
     WHERE cp.id = ?`,
    id
  );
  if (!comprobante) return res.status(404).json({ message: 'Comprobante no encontrado' });
  if (req.user.rol === 'padre' && !(await esHijo(db, req.user.id, comprobante.alumno_id))) {
    return res.status(403).json({ message: 'No autorizado para esta acción' });
  }

  const archivo = Buffer.from(comprobante.archivo, 'base64');
  const firma = firmaDe(archivo);
  res.setHeader('Content-Type', firma ? firma.tipo : 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="comprobante-${encodeURIComponent(numeroOperacionOriginal(comprobante.numero_operacion, comprobante.id))}.${firma ? firma.extension : 'bin'}"`
  );
  res.send(archivo);
});

// Todo lo que sigue es solo para padres.
router.use(requireRole('padre'));

// Las rutas /hijos/:alumnoId/... solo responden por hijos del padre.
router.param('alumnoId', async (req, res, next, valor) => {
  const alumnoId = aId(valor);
  const db = await dbPromise;
  if (!alumnoId || !(await esHijo(db, req.user.id, alumnoId))) {
    return res.status(403).json({ message: 'No autorizado para esta acción' });
  }
  req.alumnoId = alumnoId;
  next();
});

// ---------- Consultas de un hijo ----------

// Cuotas del hijo, de la más reciente a la más antigua, con su factura, sus ítems,
// lo pagado (suma de los comprobantes aprobados de la factura), el saldo (total - pagado,
// mínimo 0) y en_revision (si tiene algún comprobante que el administrador todavía no revisó).
router.get('/hijos/:alumnoId/cuotas', async (req, res) => {
  const db = await dbPromise;
  const cuotas = await db.all(
    `SELECT c.id, c.periodo, c.vencimiento, c.total, c.estado, f.id as factura_id, f.numero as factura_numero,
            COALESCE((SELECT SUM(cp.importe) FROM comprobantes_pago cp
                      WHERE cp.factura_id = f.id AND cp.estado = 'Aprobado'), 0) as pagado,
            EXISTS (SELECT 1 FROM comprobantes_pago cp
                    WHERE cp.factura_id = f.id AND cp.estado = 'En revisión') as en_revision
     FROM cuotas c LEFT JOIN facturas f ON f.cuota_id = c.id
     WHERE c.alumno_id = ?
     ORDER BY c.periodo DESC, c.id DESC`,
    req.alumnoId
  );
  const items = cuotas.length === 0 ? [] : await db.all(
    `SELECT id, cuota_id, concepto, descripcion, importe, estado FROM items_cuota
     WHERE cuota_id = ANY(?::int[]) ORDER BY id`,
    [cuotas.map((c) => c.id)]
  );
  res.json(cuotas.map(({ factura_id: facturaId, factura_numero: facturaNumero, pagado, en_revision: enRevision, ...c }) => ({
    ...c,
    en_revision: Boolean(enRevision),
    pagado: aCentavos(pagado) / 100,
    saldo: Math.max(0, aCentavos(c.total) - aCentavos(pagado)) / 100,
    factura: facturaId ? { id: facturaId, numero: facturaNumero } : null,
    items: items.filter((i) => i.cuota_id === c.id).map((i) => ({
      id: i.id, concepto: i.concepto, descripcion: i.descripcion, importe: i.importe, estado: i.estado
    }))
  })));
});

// Facturas del hijo con sus comprobantes (sin el archivo, con su estado de revisión).
// desde / hasta: períodos AAAA-MM, opcionales.
router.get('/hijos/:alumnoId/facturas', async (req, res) => {
  const desde = limpiar(req.query.desde);
  const hasta = limpiar(req.query.hasta);
  const errorPeriodo = (desde && validarPeriodo(desde)) || (hasta && validarPeriodo(hasta));
  if (errorPeriodo) return res.status(400).json({ message: errorPeriodo });
  if (desde && hasta && desde > hasta) {
    return res.status(400).json({ message: 'El período "desde" no puede ser posterior al período "hasta".' });
  }

  const condiciones = ['c.alumno_id = ?'];
  const params = [req.alumnoId];
  if (desde) {
    condiciones.push('c.periodo >= ?');
    params.push(desde);
  }
  if (hasta) {
    condiciones.push('c.periodo <= ?');
    params.push(hasta);
  }

  const db = await dbPromise;
  const facturas = await db.all(
    `SELECT f.id, f.numero, f.fecha_emision, f.total, c.periodo, c.vencimiento, c.estado
     FROM facturas f JOIN cuotas c ON c.id = f.cuota_id
     WHERE ${condiciones.join(' AND ')}
     ORDER BY c.periodo DESC, f.id DESC`,
    params
  );
  const comprobantes = facturas.length === 0 ? [] : await db.all(
    `SELECT ${CAMPOS_COMPROBANTE} FROM comprobantes_pago cp
     WHERE cp.factura_id = ANY(?::int[]) ORDER BY cp.fecha_transferencia, cp.id`,
    [facturas.map((f) => f.id)]
  );
  res.json(facturas.map((f) => ({
    ...f,
    comprobantes: comprobantes.filter((c) => c.factura_id === f.id).map(datosComprobante)
  })));
});

// Deuda del hijo: los ítems de todas sus cuotas que no están 'Pagado' (también los
// 'Pago informado', que siguen sin comprobante aprobado que los cubra), con el total
// adeudado, y los comprobantes de esas cuotas con su estado de revisión.
router.get('/hijos/:alumnoId/deuda', async (req, res) => {
  const db = await dbPromise;
  const items = await db.all(
    `SELECT i.id, i.cuota_id, c.periodo, c.vencimiento, i.concepto, i.descripcion, i.importe, i.estado
     FROM items_cuota i JOIN cuotas c ON c.id = i.cuota_id
     WHERE c.alumno_id = ? AND i.estado <> 'Pagado'
     ORDER BY c.periodo, i.id`,
    req.alumnoId
  );
  const comprobantes = items.length === 0 ? [] : await db.all(
    `SELECT ${CAMPOS_COMPROBANTE}, f.numero as factura, c.periodo
     FROM comprobantes_pago cp
     JOIN facturas f ON f.id = cp.factura_id
     JOIN cuotas c ON c.id = f.cuota_id
     WHERE c.id = ANY(?::int[])
     ORDER BY c.periodo, cp.fecha_transferencia, cp.id`,
    [[...new Set(items.map((i) => i.cuota_id))]]
  );
  res.json({
    items: items.map((i) => ({
      id: i.id, periodo: i.periodo, vencimiento: i.vencimiento, concepto: i.concepto,
      descripcion: i.descripcion, importe: i.importe, estado: i.estado
    })),
    total_adeudado: sumar(items.map((i) => i.importe)),
    comprobantes: comprobantes.map((c) => ({ factura: c.factura, periodo: c.periodo, ...datosComprobante(c) }))
  });
});

// ---------- Orden de pago ----------

// El padre elige ítems pendientes de una factura: se crea la orden con número
// correlativo, los ítems pasan a 'Pago informado' y se devuelve el comprobante de la orden.
router.post('/ordenes', express.json(), async (req, res) => {
  const facturaId = aId(req.body?.factura_id);
  if (!facturaId) return res.status(400).json({ message: 'Indicá la factura.' });
  const lista = req.body?.items;
  if (!Array.isArray(lista) || lista.length === 0) return res.status(400).json({ message: 'Elegí al menos un ítem.' });
  const ids = [...new Set(lista.map(aId))];
  if (ids.includes(null)) return res.status(400).json({ message: 'Hay ítems que no son válidos.' });

  const db = await dbPromise;
  try {
    const orden = await db.transaccion(async (tx) => {
      // Que dos órdenes simultáneas no repitan número.
      await tx.run('LOCK TABLE ordenes_pago IN SHARE ROW EXCLUSIVE MODE');

      const factura = await buscarFactura(tx, facturaId, true);
      if (!factura) throw errorConEstado(404, 'Factura no encontrada');
      if (!(await esHijo(tx, req.user.id, factura.alumno_id))) throw errorConEstado(403, 'No autorizado para esta acción');

      const items = await tx.all(
        `SELECT id, descripcion, importe, estado FROM items_cuota
         WHERE cuota_id = ? AND id = ANY(?::int[]) ORDER BY id FOR UPDATE`,
        [factura.cuota_id, ids]
      );
      if (items.length !== ids.length) throw errorConEstado(400, 'Hay ítems que no son de esta factura.');
      const noPendiente = items.find((i) => i.estado !== 'Pendiente');
      if (noPendiente) {
        throw errorConEstado(400, `El ítem "${noPendiente.descripcion}" ya está ${noPendiente.estado === 'Pagado' ? 'pagado' : 'informado'}.`);
      }

      const { ultimo } = await tx.get(
        "SELECT MAX(CAST(SUBSTRING(numero FROM 4) AS INTEGER)) AS ultimo FROM ordenes_pago WHERE numero ~ '^OP-[0-9]+$'"
      );
      const numero = numeroOrdenPago((ultimo || 0) + 1);
      const fecha = ahoraEnArgentina();
      const total = sumar(items.map((i) => i.importe));
      const ordenId = (await tx.run(
        'INSERT INTO ordenes_pago (numero, factura_id, padre_usuario_id, fecha, total) VALUES (?, ?, ?, ?, ?)',
        [numero, factura.id, req.user.id, fecha, total]
      )).lastID;
      for (const item of items) {
        await tx.run('INSERT INTO orden_pago_items (orden_pago_id, item_cuota_id) VALUES (?, ?)', [ordenId, item.id]);
      }
      await tx.run("UPDATE items_cuota SET estado = 'Pago informado' WHERE id = ANY(?::int[])", [ids]);

      const alumno = await tx.get(
        "SELECT apellido || ', ' || nombre as nombre, legajo FROM alumnos WHERE id = ?",
        factura.alumno_id
      );
      return {
        id: ordenId,
        numero,
        fecha,
        alumno: alumno.nombre,
        legajo: alumno.legajo,
        periodo: factura.periodo,
        factura: factura.numero,
        items: items.map(({ id, descripcion, importe }) => ({ id, descripcion, importe })),
        total
      };
    });
    res.status(201).json(orden);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    throw err;
  }
});

// ---------- Comprobante de transferencia ----------

// Valida el cuerpo del comprobante; devuelve { error } o los datos listos para guardar.
function leerComprobante(body) {
  const numeroOperacion = limpiar(body?.numero_operacion);
  if (!numeroOperacion) return { error: 'Ingresá el número de operación.' };
  if (numeroOperacion.length > MAX_NUMERO_OPERACION) {
    return { error: `Número de operación: usá hasta ${MAX_NUMERO_OPERACION} caracteres.` };
  }

  const errorImporte = validarImporte(body?.importe);
  if (errorImporte) return { error: errorImporte };
  const importe = Number(String(body.importe).trim());
  if (importe <= 0) return { error: 'Importe: tiene que ser mayor a 0.' };

  const fechaTransferencia = limpiar(body?.fecha_transferencia);
  if (!esFechaValida(fechaTransferencia)) return { error: 'Fecha de transferencia: ingresá una fecha válida.' };
  if (fechaTransferencia > hoyEnArgentina()) {
    return { error: 'Fecha de transferencia: la fecha no puede ser posterior a hoy.' };
  }

  const tipo = limpiar(body?.tipo);
  if (!FIRMAS.some((f) => f.tipo === tipo)) return { error: 'El archivo tiene que ser una imagen JPG o PNG, o un PDF.' };
  // Se acepta el base64 solo o como data URL (data:<tipo>;base64,...).
  const base64 = limpiar(body?.archivo).replace(/^data:[^,]*;base64,/, '').replace(/\s/g, '');
  if (!base64) return { error: 'Adjuntá el archivo del comprobante.' };
  if (base64.length % 4 !== 0 || !FORMATO_BASE64.test(base64)) return { error: 'El archivo no es un base64 válido.' };
  const archivo = Buffer.from(base64, 'base64');
  if (archivo.length > MAX_ARCHIVO) return { error: 'El archivo es demasiado grande: el máximo es 3 MB.' };
  if (firmaDe(archivo)?.tipo !== tipo) return { error: 'El contenido del archivo no coincide con el tipo indicado.' };

  return { numeroOperacion, importe, fechaTransferencia, base64 };
}

// Carga un comprobante en una factura (admite varios). Queda 'En revisión' hasta que el
// administrador lo apruebe o lo rechace: hasta entonces la cuota y sus ítems no cambian.
// pagado y saldo cuentan solo los comprobantes aprobados.
router.post('/facturas/:id/comprobantes', express.json({ limit: '5mb' }), async (req, res) => {
  const facturaId = aId(req.params.id);
  if (!facturaId) return res.status(404).json({ message: 'Factura no encontrada' });
  const datos = leerComprobante(req.body);
  if (datos.error) return res.status(400).json({ message: datos.error });

  const db = await dbPromise;
  try {
    const resultado = await db.transaccion(async (tx) => {
      const factura = await buscarFactura(tx, facturaId, true);
      if (!factura) throw errorConEstado(404, 'Factura no encontrada');
      if (!(await esHijo(tx, req.user.id, factura.alumno_id))) throw errorConEstado(403, 'No autorizado para esta acción');
      if (await tx.get('SELECT id FROM comprobantes_pago WHERE numero_operacion = ?', datos.numeroOperacion)) {
        throw errorConEstado(409, 'Ya hay un comprobante cargado con ese número de operación.');
      }

      const id = (await tx.run(
        `INSERT INTO comprobantes_pago
           (factura_id, padre_usuario_id, numero_operacion, importe, fecha_transferencia, archivo, fecha_carga, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'En revisión')`,
        [factura.id, req.user.id, datos.numeroOperacion, datos.importe, datos.fechaTransferencia, datos.base64, ahoraEnArgentina()]
      )).lastID;

      const aprobados = await tx.all(
        "SELECT importe FROM comprobantes_pago WHERE factura_id = ? AND estado = 'Aprobado'",
        factura.id
      );
      const { estado: estadoCuota } = await tx.get('SELECT estado FROM cuotas WHERE id = ?', factura.cuota_id);
      const pagado = sumar(aprobados.map((c) => c.importe));
      return {
        id,
        numero_operacion: datos.numeroOperacion,
        importe: datos.importe,
        fecha_transferencia: datos.fechaTransferencia,
        estado: 'En revisión',
        estado_cuota: estadoCuota,
        total_factura: Number(factura.total),
        pagado,
        saldo: Math.max(0, aCentavos(factura.total) - aCentavos(pagado)) / 100
      };
    });
    res.status(201).json(resultado);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    // Otro comprobante con el mismo número se cargó al mismo tiempo.
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Ya hay un comprobante cargado con ese número de operación.' });
    }
    throw err;
  }
});

// Errores al leer el JSON de las rutas de este router.
router.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'El archivo es demasiado grande: el máximo es 3 MB.' });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'El cuerpo de la solicitud no es un JSON válido.' });
  next(err);
});

export default router;
