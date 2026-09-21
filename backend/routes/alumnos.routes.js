import express from 'express';
import dbPromise from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { obtenerCicloLectivo } from '../configuracion.js';

const router = express.Router();

router.use(authenticate);
router.use(requireRole('administrador'));

const REQUIRED_FIELDS = ['nombre', 'apellido', 'dni', 'fecha_nacimiento'];

function validarCamposObligatorios(body) {
  return REQUIRED_FIELDS.filter((campo) => !body[campo] || String(body[campo]).trim() === '');
}

async function generarLegajo(db) {
  const anio = await obtenerCicloLectivo(db);
  const { count } = await db.get(
    "SELECT COUNT(*) as count FROM alumnos WHERE legajo LIKE ?",
    `${anio}-%`
  );
  const secuencia = String(count + 1).padStart(4, '0');
  return `${anio}-${secuencia}`;
}

// HU4 - Búsqueda por DNI, apellido o legajo (o listado completo sin filtro)
router.get('/', async (req, res) => {
  const db = await dbPromise;
  const { q } = req.query;

  let alumnos;
  if (q && q.trim() !== '') {
    const like = `%${q.trim()}%`;
    alumnos = await db.all(
      `SELECT a.*, c.nombre as curso_nombre FROM alumnos a
       LEFT JOIN cursos c ON c.id = a.curso_id
       WHERE a.dni LIKE ? OR a.apellido LIKE ? OR a.legajo LIKE ?
       ORDER BY a.apellido, a.nombre`,
      [like, like, like]
    );
  } else {
    alumnos = await db.all(
      `SELECT a.*, c.nombre as curso_nombre FROM alumnos a
       LEFT JOIN cursos c ON c.id = a.curso_id
       ORDER BY a.apellido, a.nombre`
    );
  }

  res.json(alumnos);
});

router.get('/:id', async (req, res) => {
  const db = await dbPromise;
  const alumno = await db.get(
    `SELECT a.*, c.nombre as curso_nombre FROM alumnos a
     LEFT JOIN cursos c ON c.id = a.curso_id
     WHERE a.id = ?`,
    req.params.id
  );
  if (!alumno) return res.status(404).json({ message: 'Alumno no encontrado' });
  res.json(alumno);
});

// HU1 - Alta de legajo de alumnos
router.post('/', async (req, res) => {
  const faltantes = validarCamposObligatorios(req.body);
  if (faltantes.length > 0) {
    return res.status(400).json({ message: `Faltan campos obligatorios: ${faltantes.join(', ')}` });
  }

  const db = await dbPromise;
  const { nombre, apellido, dni, fecha_nacimiento, curso_id } = req.body;

  const existente = await db.get('SELECT id FROM alumnos WHERE dni = ?', dni);
  if (existente) {
    return res.status(400).json({ message: 'Ya existe un alumno registrado con ese DNI' });
  }

  const legajo = await generarLegajo(db);

  const result = await db.run(
    `INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id, estado)
     VALUES (?, ?, ?, ?, ?, ?, 'Activo')`,
    [legajo, nombre, apellido, dni, fecha_nacimiento, curso_id || null]
  );

  const nuevoAlumno = await db.get(
    `SELECT a.*, c.nombre as curso_nombre FROM alumnos a
     LEFT JOIN cursos c ON c.id = a.curso_id
     WHERE a.id = ?`,
    result.lastID
  );
  res.status(201).json(nuevoAlumno);
});

// HU4 - Modificación de legajo
router.put('/:id', async (req, res) => {
  const db = await dbPromise;
  const alumno = await db.get('SELECT * FROM alumnos WHERE id = ?', req.params.id);
  if (!alumno) return res.status(404).json({ message: 'Alumno no encontrado' });

  const faltantes = validarCamposObligatorios(req.body);
  if (faltantes.length > 0) {
    return res.status(400).json({ message: `Faltan campos obligatorios: ${faltantes.join(', ')}` });
  }

  const { nombre, apellido, dni, fecha_nacimiento, curso_id } = req.body;

  const otroConMismoDni = await db.get('SELECT id FROM alumnos WHERE dni = ? AND id != ?', [dni, req.params.id]);
  if (otroConMismoDni) {
    return res.status(400).json({ message: 'Ya existe otro alumno registrado con ese DNI' });
  }

  await db.run(
    `UPDATE alumnos SET nombre = ?, apellido = ?, dni = ?, fecha_nacimiento = ?, curso_id = ?
     WHERE id = ?`,
    [nombre, apellido, dni, fecha_nacimiento, curso_id || null, req.params.id]
  );

  const actualizado = await db.get(
    `SELECT a.*, c.nombre as curso_nombre FROM alumnos a
     LEFT JOIN cursos c ON c.id = a.curso_id
     WHERE a.id = ?`,
    req.params.id
  );
  res.json(actualizado);
});

// HU4 - Baja lógica / reactivación (no elimina el historial)
router.patch('/:id/estado', async (req, res) => {
  const { estado } = req.body;
  if (!['Activo', 'Inactivo'].includes(estado)) {
    return res.status(400).json({ message: "El estado debe ser 'Activo' o 'Inactivo'" });
  }

  const db = await dbPromise;
  const alumno = await db.get('SELECT * FROM alumnos WHERE id = ?', req.params.id);
  if (!alumno) return res.status(404).json({ message: 'Alumno no encontrado' });

  await db.run('UPDATE alumnos SET estado = ? WHERE id = ?', [estado, req.params.id]);
  const actualizado = await db.get('SELECT * FROM alumnos WHERE id = ?', req.params.id);
  res.json(actualizado);
});

export default router;
