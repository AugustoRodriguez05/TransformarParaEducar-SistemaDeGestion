import express from 'express';
import dbPromise from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.use(requireRole('padre'));

// HU3 - Listado de hijos vinculados al padre/tutor autenticado
router.get('/hijos', async (req, res) => {
  const db = await dbPromise;
  const hijos = await db.all(
    `SELECT a.*, c.nombre as curso_nombre FROM padre_alumno pa
     JOIN alumnos a ON a.id = pa.alumno_id
     LEFT JOIN cursos c ON c.id = a.curso_id
     WHERE pa.padre_usuario_id = ?
     ORDER BY a.apellido, a.nombre`,
    req.user.id
  );
  res.json(hijos);
});

// HU3 - Detalle académico de un hijo: materias y profesores de su curso.
// Antes de responder se verifica el vínculo padre-alumno en la base de datos,
// nunca se confía en que el frontend solo pida ids propios.
router.get('/hijos/:alumnoId', async (req, res) => {
  const db = await dbPromise;
  const vinculo = await db.get(
    'SELECT * FROM padre_alumno WHERE padre_usuario_id = ? AND alumno_id = ?',
    [req.user.id, req.params.alumnoId]
  );
  if (!vinculo) {
    return res.status(403).json({ message: 'No tenés acceso a la información de este alumno' });
  }

  const alumno = await db.get(
    `SELECT a.*, c.nombre as curso_nombre FROM alumnos a
     LEFT JOIN cursos c ON c.id = a.curso_id
     WHERE a.id = ?`,
    req.params.alumnoId
  );
  if (!alumno) return res.status(404).json({ message: 'Alumno no encontrado' });

  const materias = alumno.curso_id
    ? await db.all(
        `SELECT m.nombre as materia_nombre, p.nombre as profesor_nombre, p.apellido as profesor_apellido,
                asig.dia, asig.hora_inicio, asig.hora_fin
         FROM asignaciones asig
         JOIN materias m ON m.id = asig.materia_id
         JOIN profesores p ON p.id = asig.profesor_id
         WHERE asig.curso_id = ?
         ORDER BY asig.dia, asig.hora_inicio`,
        alumno.curso_id
      )
    : [];

  res.json({ alumno, materias });
});

// HU3 (tarea 5) - Inscripción al ciclo lectivo
router.post('/hijos/:alumnoId/inscripcion', async (req, res) => {
  const db = await dbPromise;
  const vinculo = await db.get(
    'SELECT * FROM padre_alumno WHERE padre_usuario_id = ? AND alumno_id = ?',
    [req.user.id, req.params.alumnoId]
  );
  if (!vinculo) {
    return res.status(403).json({ message: 'No tenés acceso a la información de este alumno' });
  }

  await db.run('UPDATE alumnos SET inscripto_ciclo_lectivo = 1 WHERE id = ?', req.params.alumnoId);
  const alumno = await db.get('SELECT * FROM alumnos WHERE id = ?', req.params.alumnoId);
  res.json(alumno);
});

export default router;
