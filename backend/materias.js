// Materias de un curso con su profesor, día y horario (sin curso, no hay materias).
// La usan el panel de familia y la ficha del alumno del administrador.
export async function materiasDelCurso(db, cursoId) {
  if (!cursoId) return [];
  return db.all(
    `SELECT m.nombre as materia_nombre, p.nombre as profesor_nombre, p.apellido as profesor_apellido,
            asig.dia, asig.hora_inicio, asig.hora_fin
     FROM asignaciones asig
     JOIN materias m ON m.id = asig.materia_id
     JOIN profesores p ON p.id = asig.profesor_id
     WHERE asig.curso_id = ?
     ORDER BY asig.dia, asig.hora_inicio`,
    cursoId
  );
}
