// Generación de cuotas, compartida por POST /api/cuotas/generar y los datos de ejemplo (demo.js).
import { calcularCuota, numeroFactura, tarifasPorConcepto, vencimientoDelPeriodo } from './cuotas.js';

// Última tarifa de cada concepto con vigencia hasta la fecha indicada (AAAA-MM-DD).
export async function tarifasVigentes(db, hasta) {
  return db.all(
    `SELECT DISTINCT ON (tipo, COALESCE(referencia_id, 0)) tipo, referencia_id, importe, vigente_desde
     FROM tarifas
     WHERE vigente_desde <= ?
     ORDER BY tipo, COALESCE(referencia_id, 0), vigente_desde DESC, id DESC`,
    hasta
  );
}

// Por cada alumno activo: cuota del período con sus ítems (cuota base, cada
// deporte, recorrido y comedor con inscripción activa), vencimiento el día 10
// y factura con número correlativo. Los alumnos que ya tienen la cuota del
// período se saltean. tx tiene que ser una transacción: si falta el valor de
// algún concepto lanza un error con status 400 y no se genera ninguna cuota.
export async function generarCuotasDelPeriodo(tx, periodo) {
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
}
