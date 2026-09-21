import express from 'express';
import bcrypt from 'bcryptjs';
import dbPromise from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { DIAS } from '../constantes.js';

const router = express.Router();

router.use(authenticate);

// Un profesor consulta su propio legajo para luego pedir sus asignaciones.
router.get('/me', requireRole('profesor'), async (req, res) => {
  const db = await dbPromise;
  const profesor = await db.get('SELECT * FROM profesores WHERE usuario_id = ?', req.user.id);
  if (!profesor) return res.status(404).json({ message: 'No se encontró tu legajo de profesor' });
  res.json(profesor);
});

// Un profesor puede consultar su propia planta de materias asignadas.
router.get('/:id/asignaciones', requireRole('administrador', 'profesor'), async (req, res) => {
  const db = await dbPromise;
  const profesor = await db.get('SELECT * FROM profesores WHERE id = ?', req.params.id);
  if (!profesor) return res.status(404).json({ message: 'Profesor no encontrado' });

  if (req.user.rol === 'profesor' && profesor.usuario_id !== req.user.id) {
    return res.status(403).json({ message: 'Solo podés consultar tus propias materias asignadas' });
  }

  const asignaciones = await db.all(
    `SELECT asig.*, m.nombre as materia_nombre, c.nombre as curso_nombre
     FROM asignaciones asig
     JOIN materias m ON m.id = asig.materia_id
     JOIN cursos c ON c.id = asig.curso_id
     WHERE asig.profesor_id = ?
     ORDER BY asig.dia, asig.hora_inicio`,
    req.params.id
  );
  res.json(asignaciones);
});

router.use(requireRole('administrador'));

router.get('/', async (req, res) => {
  const db = await dbPromise;
  const profesores = await db.all('SELECT * FROM profesores ORDER BY apellido, nombre');
  res.json(profesores);
});

// HU2 - Alta de profesor (crea también su cuenta de acceso)
router.post('/', async (req, res) => {
  const { nombre, apellido, dni, email, password } = req.body;
  if (!nombre || !apellido || !dni || !email || !password) {
    return res.status(400).json({ message: 'Todos los campos son obligatorios' });
  }

  const db = await dbPromise;
  const dniExistente = await db.get('SELECT id FROM profesores WHERE dni = ?', dni);
  if (dniExistente) {
    return res.status(400).json({ message: 'Ya existe un profesor registrado con ese DNI' });
  }
  const emailExistente = await db.get('SELECT id FROM usuarios WHERE email = ?', email);
  if (emailExistente) {
    return res.status(400).json({ message: 'Ya existe un usuario registrado con ese email' });
  }

  const usuarioId = (await db.run(
    'INSERT INTO usuarios (nombre, apellido, email, password, rol) VALUES (?, ?, ?, ?, ?)',
    [nombre, apellido, email, bcrypt.hashSync(password, 8), 'profesor']
  )).lastID;

  const result = await db.run(
    `INSERT INTO profesores (usuario_id, nombre, apellido, dni, email, estado)
     VALUES (?, ?, ?, ?, ?, 'Activo')`,
    [usuarioId, nombre, apellido, dni, email]
  );

  const nuevoProfesor = await db.get('SELECT * FROM profesores WHERE id = ?', result.lastID);
  res.status(201).json(nuevoProfesor);
});

function solapan(inicioA, finA, inicioB, finB) {
  return inicioA < finB && inicioB < finA;
}

// HU2 - Asignación de materia/curso a un profesor, con validación de conflicto de horario
router.post('/:id/asignaciones', async (req, res) => {
  const { materia_id, curso_id, dia, hora_inicio, hora_fin } = req.body;
  if (!materia_id || !curso_id || !dia || !hora_inicio || !hora_fin) {
    return res.status(400).json({ message: 'Todos los campos son obligatorios' });
  }
  if (!DIAS.includes(dia)) {
    return res.status(400).json({ message: `El día debe ser uno de: ${DIAS.join(', ')}` });
  }
  if (hora_inicio >= hora_fin) {
    return res.status(400).json({ message: 'El horario de inicio debe ser anterior al de fin' });
  }

  const db = await dbPromise;
  const profesor = await db.get('SELECT * FROM profesores WHERE id = ?', req.params.id);
  if (!profesor) return res.status(404).json({ message: 'Profesor no encontrado' });

  const asignacionesDelDia = await db.all(
    'SELECT * FROM asignaciones WHERE profesor_id = ? AND dia = ?',
    [req.params.id, dia]
  );
  const conflicto = asignacionesDelDia.some((a) => solapan(a.hora_inicio, a.hora_fin, hora_inicio, hora_fin));
  if (conflicto) {
    return res.status(409).json({ message: 'El profesor ya tiene una materia asignada en ese día y horario' });
  }

  const result = await db.run(
    `INSERT INTO asignaciones (profesor_id, materia_id, curso_id, dia, hora_inicio, hora_fin)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.params.id, materia_id, curso_id, dia, hora_inicio, hora_fin]
  );

  const nuevaAsignacion = await db.get(
    `SELECT asig.*, m.nombre as materia_nombre, c.nombre as curso_nombre
     FROM asignaciones asig
     JOIN materias m ON m.id = asig.materia_id
     JOIN cursos c ON c.id = asig.curso_id
     WHERE asig.id = ?`,
    result.lastID
  );
  res.status(201).json(nuevaAsignacion);
});

export default router;
