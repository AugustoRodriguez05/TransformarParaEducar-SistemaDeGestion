// Datos de ejemplo para mostrar el módulo de cuotas: si todavía no hay ninguna cuota,
// carga precios desde agosto de 2026, genera las cuotas de agosto a noviembre y
// registra pagos (agosto y septiembre pagadas, octubre con pago parcial, noviembre pendiente).
// Si ya hay cuotas pero ningún comprobante, carga solo los pagos sobre las cuotas existentes.
import { estadoSegunComprobantes } from './cuotas.js';
import { generarCuotasDelPeriodo } from './generacion-cuotas.js';

export const PERIODOS_DEMO = ['2026-08', '2026-09', '2026-10', '2026-11'];
export const FECHA_PRECIOS_DEMO = '2026-08-01';
// Importe de cada concepto que todavía no tiene ningún precio.
export const IMPORTES_DEMO = { cuota: 42000, comedor: 18000, deporte: 6500, transporte: 7000 };
export const DIA_TRANSFERENCIA_DEMO = 8;
// PNG de 1x1 píxel: el archivo de cada comprobante de ejemplo.
const PNG_DEMO = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const aCentavos = (importe) => Math.round(Number(importe) * 100);

// ---------- Partes puras, probadas en demo.test.js ----------

// Importe del precio de ejemplo: el del precio actual del concepto o, si no tiene, el de IMPORTES_DEMO.
export function importeDemo(tipo, importeActual) {
  return importeActual === undefined || importeActual === null ? IMPORTES_DEMO[tipo] : Number(importeActual);
}

/**
 * Pago de ejemplo de una cuota según su período, y el estado en que queda.
 * Agosto y septiembre: un comprobante por el total; octubre: por la mitad; noviembre: sin pago.
 * Devuelve { pago: { importe, fecha } o null, estadoCuota, itemsPagados }.
 */
export function pagoDemo(periodo, total) {
  let importe = null;
  if (periodo === '2026-08' || periodo === '2026-09') importe = aCentavos(total) / 100;
  else if (periodo === '2026-10') importe = Math.round(aCentavos(total) / 2) / 100;
  if (importe === null || importe <= 0) return { pago: null, estadoCuota: 'Pendiente', itemsPagados: false };

  const fecha = `${periodo}-${String(DIA_TRANSFERENCIA_DEMO).padStart(2, '0')}`;
  return { pago: { importe, fecha }, ...estadoSegunComprobantes(total, [importe]) };
}

/**
 * Qué carga de ejemplo corresponde: 'todo' si no hay ninguna cuota; 'pagos' si hay cuotas
 * pero ningún comprobante; null si ya hay comprobantes (no se hace nada).
 */
export function accionDemo({ hayCuotas, hayComprobantes }) {
  if (!hayCuotas) return 'todo';
  return hayComprobantes ? null : 'pagos';
}

// ---------- Carga en la base ----------

// Conceptos con precio: cuota base, comedor, cada deporte y cada recorrido.
async function conceptos(tx) {
  const deportes = await tx.all('SELECT id FROM deportes ORDER BY id');
  const recorridos = await tx.all('SELECT id FROM recorridos_transporte ORDER BY id');
  return [
    { tipo: 'cuota', referenciaId: null },
    { tipo: 'comedor', referenciaId: null },
    ...deportes.map((d) => ({ tipo: 'deporte', referenciaId: d.id })),
    ...recorridos.map((r) => ({ tipo: 'transporte', referenciaId: r.id }))
  ];
}

// A cada concepto sin precio vigente al 01/08/2026 le carga uno desde esa fecha.
async function cargarPrecios(tx) {
  let creados = 0;
  for (const { tipo, referenciaId } of await conceptos(tx)) {
    const vigente = await tx.get(
      'SELECT id FROM tarifas WHERE tipo = ? AND referencia_id IS NOT DISTINCT FROM ? AND vigente_desde <= ?',
      [tipo, referenciaId, FECHA_PRECIOS_DEMO]
    );
    if (vigente) continue;
    const actual = await tx.get(
      `SELECT importe FROM tarifas WHERE tipo = ? AND referencia_id IS NOT DISTINCT FROM ?
       ORDER BY vigente_desde DESC, id DESC LIMIT 1`,
      [tipo, referenciaId]
    );
    await tx.run(
      'INSERT INTO tarifas (tipo, referencia_id, importe, vigente_desde) VALUES (?, ?, ?, ?)',
      [tipo, referenciaId, importeDemo(tipo, actual?.importe), FECHA_PRECIOS_DEMO]
    );
    creados += 1;
  }
  return creados;
}

// Comprobantes de ejemplo de las cuotas de agosto a octubre y el estado de cada cuota.
async function cargarPagos(tx) {
  const cuotas = await tx.all(
    `SELECT c.id, c.alumno_id, c.periodo, c.total, f.id as factura_id
     FROM cuotas c JOIN facturas f ON f.cuota_id = c.id
     WHERE c.periodo = ANY(?::text[])
     ORDER BY c.periodo, c.id`,
    [PERIODOS_DEMO]
  );
  // Quién figura cargando el comprobante: un padre del alumno o, si no tiene, el primer administrador.
  const padres = new Map((await tx.all(
    'SELECT DISTINCT ON (alumno_id) alumno_id, padre_usuario_id FROM padre_alumno ORDER BY alumno_id, id'
  )).map((p) => [p.alumno_id, p.padre_usuario_id]));
  const admin = await tx.get("SELECT id FROM usuarios WHERE rol = 'administrador' ORDER BY id LIMIT 1");

  let comprobantes = 0;
  for (const cuota of cuotas) {
    const { pago, estadoCuota, itemsPagados } = pagoDemo(cuota.periodo, cuota.total);
    if (!pago) continue;
    const padreId = padres.get(cuota.alumno_id) ?? admin?.id;
    if (!padreId) throw new Error('No hay un padre ni un administrador para registrar los comprobantes de ejemplo.');
    await tx.run(
      `INSERT INTO comprobantes_pago (factura_id, padre_usuario_id, numero_operacion, importe, fecha_transferencia, archivo)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [cuota.factura_id, padreId, `DEMO-${cuota.id}`, pago.importe, pago.fecha, PNG_DEMO]
    );
    await tx.run('UPDATE cuotas SET estado = ? WHERE id = ?', [estadoCuota, cuota.id]);
    if (itemsPagados) await tx.run("UPDATE items_cuota SET estado = 'Pagado' WHERE cuota_id = ?", cuota.id);
    comprobantes += 1;
  }
  return comprobantes;
}

async function estadoActual(db) {
  return {
    hayCuotas: Boolean(await db.get('SELECT id FROM cuotas LIMIT 1')),
    hayComprobantes: Boolean(await db.get('SELECT id FROM comprobantes_pago LIMIT 1'))
  };
}

// Carga los datos de ejemplo que correspondan (ver accionDemo) en una sola transacción.
// Devuelve { accion, precios, cuotas, comprobantes } o null si no hizo nada.
export async function cargarDatosDemo(db) {
  if (!accionDemo(await estadoActual(db))) return null;

  const resultado = await db.transaccion(async (tx) => {
    // Que otra carga, una generación o un comprobante simultáneos no se crucen;
    // se vuelve a mirar con el bloqueo tomado.
    await tx.run('LOCK TABLE cuotas, items_cuota, facturas, comprobantes_pago IN SHARE ROW EXCLUSIVE MODE');
    const accion = accionDemo(await estadoActual(tx));
    if (!accion) return null;
    if (accion === 'pagos') return { accion, precios: 0, cuotas: 0, comprobantes: await cargarPagos(tx) };

    const precios = await cargarPrecios(tx);
    let cuotas = 0;
    for (const periodo of PERIODOS_DEMO) cuotas += (await generarCuotasDelPeriodo(tx, periodo)).creadas;
    const comprobantes = await cargarPagos(tx);
    return { accion, precios, cuotas, comprobantes };
  });

  if (resultado?.accion === 'todo') {
    console.log(
      `Datos de ejemplo: ${resultado.cuotas} cuota(s) y ${resultado.comprobantes} comprobante(s) creados` +
      ` (${resultado.precios} precio(s) desde el ${FECHA_PRECIOS_DEMO.split('-').reverse().join('/')}).`
    );
  } else if (resultado) {
    console.log(`Datos de ejemplo: ${resultado.comprobantes} comprobante(s) creados sobre las cuotas existentes.`);
  }
  return resultado;
}
