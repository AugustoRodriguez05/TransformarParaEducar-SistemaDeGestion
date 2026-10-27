import { obtenerCicloLectivo } from './configuracion.js';

// Legajo AAAA-NNNN: año del ciclo lectivo y número correlativo dentro de ese año.
// tabla: 'alumnos' o 'profesores' (cada una lleva su propia numeración).
export async function generarLegajo(db, tabla) {
  const anio = await obtenerCicloLectivo(db);
  // Se toma el número más alto usado en el año (no la cantidad de registros), para
  // que eliminar uno no haga repetir un legajo existente.
  const prefijo = `${anio}-`;
  const { ultimo } = await db.get(
    `SELECT MAX(CAST(SUBSTRING(legajo FROM ${prefijo.length + 1}) AS INTEGER)) as ultimo FROM ${tabla} WHERE legajo LIKE ?`,
    [`${prefijo}%`]
  );
  const secuencia = String((ultimo || 0) + 1).padStart(4, '0');
  return `${prefijo}${secuencia}`;
}
