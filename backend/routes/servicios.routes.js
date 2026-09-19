import express from 'express';
import dbPromise from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.use(requireRole('administrador', 'padre'));

const MAX_DEPORTES = 2;

function solapan(inicioA, finA, inicioB, finB) {
  return inicioA < finB && inicioB < finA;
}

router.get('/deportes', async (req, res) => {
  const db = await dbPromise;
  res.json(await db.all('SELECT * FROM deportes ORDER BY nombre'));
});

router.get('/recorridos', async (req, res) => {
  const db = await dbPromise;
  res.json(await db.all('SELECT * FROM recorridos_transporte ORDER BY id'));
});

// El administrador opera sobre cualquier alumno; el padre solo sobre sus hijos
// vinculados (se verifica en la base, no en el frontend).
async function autorizarAlumno(req, res, next) {
  const db = await dbPromise;
  const alumno = await db.get('SELECT * FROM alumnos WHERE id = ?', req.params.alumnoId);
  if (!alumno) return res.status(404).json({ message: 'Alumno no encontrado' });

  if (req.user.rol === 'padre') {
    const vinculo = await db.get(
      'SELECT id FROM padre_alumno WHERE padre_usuario_id = ? AND alumno_id = ?',
      [req.user.id, alumno.id]
    );
    if (!vinculo) {
      return res.status(403).json({ message: 'No tenés acceso a la información de este alumno' });
    }
  }

  req.alumno = alumno;
  next();
}

function exigirAlumnoActivo(req, res, next) {
  if (req.alumno.estado !== 'Activo') {
    return res.status(400).json({ message: 'El alumno está inactivo y no puede inscribirse a servicios' });
  }
  next();
}

async function obtenerServicios(db, alumnoId) {
  const deportes = await db.all(
    `SELECT d.id, d.nombre, d.dia, d.hora_inicio, d.hora_fin
     FROM inscripciones_deportivas i
     JOIN deportes d ON d.id = i.deporte_id
     WHERE i.alumno_id = ? AND i.estado = 'Activa'
     ORDER BY d.dia, d.hora_inicio`,
    alumnoId
  );
  const transporte = await db.get(
    `SELECT i.id, r.id as recorrido_id, r.nombre as recorrido_nombre
     FROM inscripciones_transporte i
     JOIN recorridos_transporte r ON r.id = i.recorrido_id
     WHERE i.alumno_id = ? AND i.estado = 'Activa'`,
    alumnoId
  );
  const comedor = await db.get(
    "SELECT id FROM inscripciones_comedor WHERE alumno_id = ? AND estado = 'Activa'",
    alumnoId
  );
  return { deportes, transporte: transporte || null, comedor: comedor ? true : false };
}

router.get('/alumnos/:alumnoId', autorizarAlumno, async (req, res) => {
  const db = await dbPromise;
  res.json(await obtenerServicios(db, req.alumno.id));
});

// HU5 - Inscripción a deportes: máximo 2, sin superposición de horarios
router.post('/alumnos/:alumnoId/deportes', autorizarAlumno, exigirAlumnoActivo, async (req, res) => {
  const db = await dbPromise;
  const { deporte_id } = req.body;
  if (!deporte_id) return res.status(400).json({ message: 'Falta seleccionar un deporte' });

  const deporte = await db.get('SELECT * FROM deportes WHERE id = ?', deporte_id);
  if (!deporte) return res.status(404).json({ message: 'Deporte no encontrado' });

  const existente = await db.get(
    'SELECT * FROM inscripciones_deportivas WHERE alumno_id = ? AND deporte_id = ?',
    [req.alumno.id, deporte.id]
  );
  if (existente && existente.estado === 'Activa') {
    return res.status(409).json({ message: 'El alumno ya está inscripto en ese deporte' });
  }

  const activas = await db.all(
    `SELECT d.* FROM inscripciones_deportivas i
     JOIN deportes d ON d.id = i.deporte_id
     WHERE i.alumno_id = ? AND i.estado = 'Activa'`,
    req.alumno.id
  );
  if (activas.length >= MAX_DEPORTES) {
    return res.status(400).json({ message: `El alumno ya alcanzó el máximo de ${MAX_DEPORTES} deportes` });
  }
  const choque = activas.find(
    (a) => a.dia === deporte.dia && solapan(a.hora_inicio, a.hora_fin, deporte.hora_inicio, deporte.hora_fin)
  );
  if (choque) {
    return res.status(409).json({ message: `El horario se superpone con ${choque.nombre}` });
  }

  if (existente) {
    await db.run("UPDATE inscripciones_deportivas SET estado = 'Activa' WHERE id = ?", existente.id);
  } else {
    await db.run(
      'INSERT INTO inscripciones_deportivas (alumno_id, deporte_id) VALUES (?, ?)',
      [req.alumno.id, deporte.id]
    );
  }
  res.status(201).json(await obtenerServicios(db, req.alumno.id));
});

router.delete('/alumnos/:alumnoId/deportes/:deporteId', autorizarAlumno, async (req, res) => {
  const db = await dbPromise;
  await db.run(
    "UPDATE inscripciones_deportivas SET estado = 'Baja' WHERE alumno_id = ? AND deporte_id = ?",
    [req.alumno.id, req.params.deporteId]
  );
  res.json(await obtenerServicios(db, req.alumno.id));
});

// HU6 - Transporte: una única inscripción activa por alumno
router.post('/alumnos/:alumnoId/transporte', autorizarAlumno, exigirAlumnoActivo, async (req, res) => {
  const db = await dbPromise;
  const { recorrido_id } = req.body;
  if (!recorrido_id) return res.status(400).json({ message: 'Falta seleccionar un recorrido' });

  const recorrido = await db.get('SELECT id FROM recorridos_transporte WHERE id = ?', recorrido_id);
  if (!recorrido) return res.status(404).json({ message: 'Recorrido no encontrado' });

  const activa = await db.get(
    "SELECT id FROM inscripciones_transporte WHERE alumno_id = ? AND estado = 'Activa'",
    req.alumno.id
  );
  if (activa) {
    return res.status(409).json({ message: 'El alumno ya está inscripto al servicio de transporte' });
  }

  await db.run(
    'INSERT INTO inscripciones_transporte (alumno_id, recorrido_id) VALUES (?, ?)',
    [req.alumno.id, recorrido.id]
  );
  res.status(201).json(await obtenerServicios(db, req.alumno.id));
});

// La baja cambia el estado; el registro se conserva para los reportes.
router.delete('/alumnos/:alumnoId/transporte', autorizarAlumno, async (req, res) => {
  const db = await dbPromise;
  await db.run(
    "UPDATE inscripciones_transporte SET estado = 'Baja' WHERE alumno_id = ? AND estado = 'Activa'",
    req.alumno.id
  );
  res.json(await obtenerServicios(db, req.alumno.id));
});

// HU6 - Comedor
router.post('/alumnos/:alumnoId/comedor', autorizarAlumno, exigirAlumnoActivo, async (req, res) => {
  const db = await dbPromise;
  const activa = await db.get(
    "SELECT id FROM inscripciones_comedor WHERE alumno_id = ? AND estado = 'Activa'",
    req.alumno.id
  );
  if (activa) {
    return res.status(409).json({ message: 'El alumno ya está inscripto al servicio de comedor' });
  }

  await db.run('INSERT INTO inscripciones_comedor (alumno_id) VALUES (?)', req.alumno.id);
  res.status(201).json(await obtenerServicios(db, req.alumno.id));
});

router.delete('/alumnos/:alumnoId/comedor', autorizarAlumno, async (req, res) => {
  const db = await dbPromise;
  await db.run(
    "UPDATE inscripciones_comedor SET estado = 'Baja' WHERE alumno_id = ? AND estado = 'Activa'",
    req.alumno.id
  );
  res.json(await obtenerServicios(db, req.alumno.id));
});

export default router;
