import express from 'express';
import bcrypt from 'bcryptjs';
import dbPromise from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.use(requireRole('administrador'));

async function padreConHijos(db, padre) {
  const hijos = await db.all(
    `SELECT a.id, a.legajo, a.nombre, a.apellido FROM padre_alumno pa
     JOIN alumnos a ON a.id = pa.alumno_id
     WHERE pa.padre_usuario_id = ?
     ORDER BY a.apellido, a.nombre`,
    padre.id
  );
  return { ...padre, hijos };
}

const SELECT_PADRE = "SELECT id, nombre, apellido, email, activo FROM usuarios WHERE rol = 'padre'";

router.get('/', async (req, res) => {
  const db = await dbPromise;
  const padres = await db.all(`${SELECT_PADRE} ORDER BY apellido, nombre`);
  res.json(await Promise.all(padres.map((p) => padreConHijos(db, p))));
});

router.post('/', async (req, res) => {
  const { nombre, apellido, email, password } = req.body;
  if (!nombre || !apellido || !email || !password) {
    return res.status(400).json({ message: 'Todos los campos son obligatorios' });
  }

  const db = await dbPromise;
  if (await db.get('SELECT id FROM usuarios WHERE email = ?', email)) {
    return res.status(400).json({ message: 'Ya existe un usuario registrado con ese email' });
  }

  const result = await db.run(
    'INSERT INTO usuarios (nombre, apellido, email, password, rol) VALUES (?, ?, ?, ?, ?)',
    [nombre, apellido, email, bcrypt.hashSync(password, 8), 'padre']
  );
  const padre = await db.get(`${SELECT_PADRE} AND id = ?`, result.lastID);
  res.status(201).json(await padreConHijos(db, padre));
});

router.post('/:id/alumnos', async (req, res) => {
  const { alumno_id } = req.body;
  if (!alumno_id) return res.status(400).json({ message: 'Falta seleccionar un alumno' });

  const db = await dbPromise;
  const padre = await db.get(`${SELECT_PADRE} AND id = ?`, req.params.id);
  if (!padre) return res.status(404).json({ message: 'Padre/tutor no encontrado' });
  if (!(await db.get('SELECT id FROM alumnos WHERE id = ?', alumno_id))) {
    return res.status(404).json({ message: 'Alumno no encontrado' });
  }
  if (await db.get('SELECT id FROM padre_alumno WHERE padre_usuario_id = ? AND alumno_id = ?', [padre.id, alumno_id])) {
    return res.status(409).json({ message: 'El alumno ya está vinculado a este padre/tutor' });
  }

  await db.run('INSERT INTO padre_alumno (padre_usuario_id, alumno_id) VALUES (?, ?)', [padre.id, alumno_id]);
  res.status(201).json(await padreConHijos(db, padre));
});

router.delete('/:id/alumnos/:alumnoId', async (req, res) => {
  const db = await dbPromise;
  const padre = await db.get(`${SELECT_PADRE} AND id = ?`, req.params.id);
  if (!padre) return res.status(404).json({ message: 'Padre/tutor no encontrado' });

  await db.run(
    'DELETE FROM padre_alumno WHERE padre_usuario_id = ? AND alumno_id = ?',
    [padre.id, req.params.alumnoId]
  );
  res.json(await padreConHijos(db, padre));
});

export default router;
