import express from 'express';
import dbPromise from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { materiasDelCurso } from '../materias.js';

const router = express.Router();

router.use(authenticate);
router.use(requireRole('alumno'));

// Panel del alumno: sus propios datos (curso y nivel) y las materias de su curso
// con profesor, día y horario. El alumno se busca por el usuario autenticado, nunca
// por un id que mande el frontend. Sus servicios se gestionan en /api/servicios.
router.get('/', async (req, res) => {
  const db = await dbPromise;
  const alumno = await db.get(
    `SELECT a.id, a.legajo, a.nombre, a.apellido, a.estado, a.curso_id,
            c.nombre as curso_nombre, c.nivel as curso_nivel
     FROM alumnos a
     LEFT JOIN cursos c ON c.id = a.curso_id
     WHERE a.usuario_id = ?`,
    req.user.id
  );
  if (!alumno) return res.status(404).json({ message: 'No se encontró tu legajo de alumno' });

  res.json({ alumno, materias: await materiasDelCurso(db, alumno.curso_id) });
});

export default router;
