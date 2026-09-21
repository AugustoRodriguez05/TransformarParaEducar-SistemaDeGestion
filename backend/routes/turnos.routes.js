import express from 'express';
import dbPromise from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { notificar } from '../notificaciones.js';

const router = express.Router();

router.use(authenticate);

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const SELECT_TURNO = `
  SELECT t.*, d.fecha, d.hora_inicio, d.hora_fin, d.profesor_id,
         p.nombre || ' ' || p.apellido as profesor_nombre,
         a.nombre || ' ' || a.apellido as alumno_nombre,
         u.nombre || ' ' || u.apellido as padre_nombre
  FROM turnos t
  JOIN disponibilidad_profesor d ON d.id = t.disponibilidad_id
  JOIN profesores p ON p.id = d.profesor_id
  JOIN alumnos a ON a.id = t.alumno_id
  JOIN usuarios u ON u.id = t.padre_usuario_id`;

function solapan(inicioA, finA, inicioB, finB) {
  return inicioA < finB && inicioB < finA;
}

function esFutura(fecha, horaInicio) {
  const ahora = new Date();
  const hoy = ahora.toLocaleDateString('sv-SE');
  const horaActual = ahora.toTimeString().slice(0, 5);
  return fecha > hoy || (fecha === hoy && horaInicio > horaActual);
}

function describirFranja(t) {
  return `${t.fecha.split('-').reverse().join('/')} de ${t.hora_inicio} a ${t.hora_fin}`;
}

async function profesorDelUsuario(db, usuarioId) {
  return db.get('SELECT * FROM profesores WHERE usuario_id = ?', usuarioId);
}

// Regla: un profesor no puede tener dos turnos confirmados en el mismo horario.
async function hayTurnoConfirmadoEnHorario(db, profesorId, fecha, horaInicio, horaFin, excluirTurnoId = 0) {
  const confirmados = await db.all(
    `SELECT d.hora_inicio, d.hora_fin FROM turnos t
     JOIN disponibilidad_profesor d ON d.id = t.disponibilidad_id
     WHERE d.profesor_id = ? AND d.fecha = ? AND t.estado = 'Confirmado' AND t.id != ?`,
    [profesorId, fecha, excluirTurnoId]
  );
  return confirmados.some((c) => solapan(c.hora_inicio, c.hora_fin, horaInicio, horaFin));
}

// ---------- Profesor ----------

// HU8 tarea 1 - Disponibilidad horaria del profesor
router.get('/disponibilidad', requireRole('profesor'), async (req, res) => {
  const db = await dbPromise;
  const profesor = await profesorDelUsuario(db, req.user.id);
  if (!profesor) return res.status(404).json({ message: 'No se encontró tu legajo de profesor' });

  const franjas = await db.all(
    `SELECT d.*,
       EXISTS (SELECT 1 FROM turnos t WHERE t.disponibilidad_id = d.id AND t.estado = 'Confirmado') as ocupada
     FROM disponibilidad_profesor d
     WHERE d.profesor_id = ?
     ORDER BY d.fecha, d.hora_inicio`,
    profesor.id
  );
  res.json(franjas.map((f) => ({ ...f, ocupada: f.ocupada === 1 })));
});

router.post('/disponibilidad', requireRole('profesor'), async (req, res) => {
  const { fecha, hora_inicio, hora_fin } = req.body;
  if (!FORMATO_FECHA.test(fecha || '') || !FORMATO_HORA.test(hora_inicio || '') || !FORMATO_HORA.test(hora_fin || '')) {
    return res.status(400).json({ message: 'Fecha y horarios son obligatorios y deben tener formato válido' });
  }
  if (hora_inicio >= hora_fin) {
    return res.status(400).json({ message: 'El horario de inicio debe ser anterior al de fin' });
  }
  if (!esFutura(fecha, hora_inicio)) {
    return res.status(400).json({ message: 'La franja debe ser posterior al momento actual' });
  }

  const db = await dbPromise;
  const profesor = await profesorDelUsuario(db, req.user.id);
  if (!profesor) return res.status(404).json({ message: 'No se encontró tu legajo de profesor' });

  const delDia = await db.all(
    'SELECT * FROM disponibilidad_profesor WHERE profesor_id = ? AND fecha = ?',
    [profesor.id, fecha]
  );
  if (delDia.some((f) => solapan(f.hora_inicio, f.hora_fin, hora_inicio, hora_fin))) {
    return res.status(409).json({ message: 'La franja se superpone con otra que ya cargaste' });
  }

  const result = await db.run(
    'INSERT INTO disponibilidad_profesor (profesor_id, fecha, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)',
    [profesor.id, fecha, hora_inicio, hora_fin]
  );
  res.status(201).json(await db.get('SELECT * FROM disponibilidad_profesor WHERE id = ?', result.lastID));
});

router.delete('/disponibilidad/:id', requireRole('profesor'), async (req, res) => {
  const db = await dbPromise;
  const profesor = await profesorDelUsuario(db, req.user.id);
  const franja = profesor && await db.get(
    'SELECT * FROM disponibilidad_profesor WHERE id = ? AND profesor_id = ?',
    [req.params.id, profesor.id]
  );
  if (!franja) return res.status(404).json({ message: 'Franja no encontrada' });

  const activo = await db.get(
    "SELECT id FROM turnos WHERE disponibilidad_id = ? AND estado IN ('Pendiente', 'Confirmado')",
    franja.id
  );
  if (activo) {
    return res.status(409).json({ message: 'La franja tiene turnos pendientes o confirmados; cancelalos o reprogramalos primero' });
  }

  await db.run('DELETE FROM turnos WHERE disponibilidad_id = ?', franja.id);
  await db.run('DELETE FROM disponibilidad_profesor WHERE id = ?', franja.id);
  res.json({ message: 'Franja eliminada' });
});

router.get('/recibidos', requireRole('profesor'), async (req, res) => {
  const db = await dbPromise;
  const profesor = await profesorDelUsuario(db, req.user.id);
  if (!profesor) return res.status(404).json({ message: 'No se encontró tu legajo de profesor' });

  res.json(await db.all(
    `${SELECT_TURNO} WHERE d.profesor_id = ? ORDER BY d.fecha, d.hora_inicio`,
    profesor.id
  ));
});

async function turnoDelProfesor(db, req, res) {
  const profesor = await profesorDelUsuario(db, req.user.id);
  const turno = profesor && await db.get(
    `${SELECT_TURNO} WHERE t.id = ? AND d.profesor_id = ?`,
    [req.params.id, profesor.id]
  );
  if (!turno) {
    res.status(404).json({ message: 'Turno no encontrado' });
    return null;
  }
  return turno;
}

// HU8 tarea 3 - Confirmación
router.patch('/:id/confirmar', requireRole('profesor'), async (req, res) => {
  const db = await dbPromise;
  const turno = await turnoDelProfesor(db, req, res);
  if (!turno) return;

  if (turno.estado !== 'Pendiente') {
    return res.status(400).json({ message: 'Solo se pueden confirmar turnos pendientes' });
  }
  if (!esFutura(turno.fecha, turno.hora_inicio)) {
    return res.status(400).json({ message: 'La franja de este turno ya pasó' });
  }
  if (await hayTurnoConfirmadoEnHorario(db, turno.profesor_id, turno.fecha, turno.hora_inicio, turno.hora_fin, turno.id)) {
    return res.status(409).json({ message: 'Ya tenés otro turno confirmado en ese horario' });
  }

  await db.run("UPDATE turnos SET estado = 'Confirmado' WHERE id = ?", turno.id);
  await notificar(db, turno.padre_usuario_id,
    `Tu turno con ${turno.profesor_nombre} (${turno.alumno_nombre}) fue confirmado para el ${describirFranja(turno)}.`);
  res.json(await db.get(`${SELECT_TURNO} WHERE t.id = ?`, turno.id));
});

// HU8 tarea 3 - Reprogramación a otra franja libre del mismo profesor
router.patch('/:id/reprogramar', requireRole('profesor'), async (req, res) => {
  const db = await dbPromise;
  const turno = await turnoDelProfesor(db, req, res);
  if (!turno) return;

  if (turno.estado === 'Cancelado') {
    return res.status(400).json({ message: 'No se puede reprogramar un turno cancelado' });
  }
  const { disponibilidad_id } = req.body;
  const franja = await db.get(
    'SELECT * FROM disponibilidad_profesor WHERE id = ? AND profesor_id = ?',
    [disponibilidad_id, turno.profesor_id]
  );
  if (!franja) return res.status(404).json({ message: 'Franja no encontrada' });
  if (franja.id === turno.disponibilidad_id) {
    return res.status(400).json({ message: 'Elegí una franja distinta a la actual' });
  }
  if (!esFutura(franja.fecha, franja.hora_inicio)) {
    return res.status(400).json({ message: 'La nueva franja debe ser posterior al momento actual' });
  }
  if (await hayTurnoConfirmadoEnHorario(db, turno.profesor_id, franja.fecha, franja.hora_inicio, franja.hora_fin, turno.id)) {
    return res.status(409).json({ message: 'Ya tenés otro turno confirmado en ese horario' });
  }

  await db.run("UPDATE turnos SET disponibilidad_id = ?, estado = 'Confirmado' WHERE id = ?", [franja.id, turno.id]);
  await notificar(db, turno.padre_usuario_id,
    `Tu turno con ${turno.profesor_nombre} (${turno.alumno_nombre}) fue reprogramado para el ${describirFranja(franja)}.`);
  res.json(await db.get(`${SELECT_TURNO} WHERE t.id = ?`, turno.id));
});

// ---------- Padre / tutor ----------

async function alumnoDelPadre(db, req, res, alumnoId) {
  const alumno = await db.get(
    `SELECT a.* FROM alumnos a
     JOIN padre_alumno pa ON pa.alumno_id = a.id
     WHERE a.id = ? AND pa.padre_usuario_id = ?`,
    [alumnoId, req.user.id]
  );
  if (!alumno) {
    res.status(403).json({ message: 'No tenés acceso a la información de este alumno' });
    return null;
  }
  return alumno;
}

// Solo los profesores que dan clase al curso del hijo
router.get('/profesores', requireRole('padre'), async (req, res) => {
  const db = await dbPromise;
  const alumno = await alumnoDelPadre(db, req, res, req.query.alumno_id);
  if (!alumno) return;

  res.json(await db.all(
    `SELECT DISTINCT p.id, p.nombre, p.apellido FROM asignaciones asig
     JOIN profesores p ON p.id = asig.profesor_id
     WHERE asig.curso_id = ? AND p.estado = 'Activo'
     ORDER BY p.apellido, p.nombre`,
    alumno.curso_id
  ));
});

// Solo se muestran las franjas que el profesor configuró y que siguen libres
router.get('/profesores/:profesorId/disponibilidad', requireRole('padre'), async (req, res) => {
  const db = await dbPromise;
  const alumno = await alumnoDelPadre(db, req, res, req.query.alumno_id);
  if (!alumno) return;

  const dictaClase = await db.get(
    'SELECT id FROM asignaciones WHERE profesor_id = ? AND curso_id = ?',
    [req.params.profesorId, alumno.curso_id]
  );
  if (!dictaClase) {
    return res.status(403).json({ message: 'Ese profesor no da clase al curso de tu hijo' });
  }

  const franjas = await db.all(
    `SELECT d.* FROM disponibilidad_profesor d
     WHERE d.profesor_id = ?
       AND NOT EXISTS (SELECT 1 FROM turnos t WHERE t.disponibilidad_id = d.id AND t.estado = 'Confirmado')
     ORDER BY d.fecha, d.hora_inicio`,
    req.params.profesorId
  );
  res.json(franjas.filter((f) => esFutura(f.fecha, f.hora_inicio)));
});

// HU8 tarea 2 - Solicitud de turno (queda Pendiente)
router.post('/', requireRole('padre'), async (req, res) => {
  const { disponibilidad_id, alumno_id, motivo } = req.body;
  if (!disponibilidad_id || !alumno_id) {
    return res.status(400).json({ message: 'Faltan datos para solicitar el turno' });
  }

  const db = await dbPromise;
  const alumno = await alumnoDelPadre(db, req, res, alumno_id);
  if (!alumno) return;
  if (alumno.estado !== 'Activo') {
    return res.status(400).json({ message: 'El legajo del alumno está inactivo' });
  }

  const franja = await db.get('SELECT * FROM disponibilidad_profesor WHERE id = ?', disponibilidad_id);
  if (!franja) return res.status(404).json({ message: 'Franja no encontrada' });

  const dictaClase = await db.get(
    'SELECT id FROM asignaciones WHERE profesor_id = ? AND curso_id = ?',
    [franja.profesor_id, alumno.curso_id]
  );
  if (!dictaClase) {
    return res.status(403).json({ message: 'Solo podés reservar con profesores de tu hijo' });
  }
  if (!esFutura(franja.fecha, franja.hora_inicio)) {
    return res.status(400).json({ message: 'Esa franja ya pasó' });
  }

  const ocupada = await db.get(
    "SELECT id FROM turnos WHERE disponibilidad_id = ? AND estado = 'Confirmado'",
    franja.id
  );
  if (ocupada) return res.status(409).json({ message: 'Esa franja ya no está disponible' });

  const duplicado = await db.get(
    "SELECT id FROM turnos WHERE disponibilidad_id = ? AND padre_usuario_id = ? AND estado != 'Cancelado'",
    [franja.id, req.user.id]
  );
  if (duplicado) return res.status(409).json({ message: 'Ya solicitaste un turno en esa franja' });

  const result = await db.run(
    'INSERT INTO turnos (disponibilidad_id, padre_usuario_id, alumno_id, motivo) VALUES (?, ?, ?, ?)',
    [franja.id, req.user.id, alumno.id, motivo || null]
  );
  const turno = await db.get(`${SELECT_TURNO} WHERE t.id = ?`, result.lastID);

  const profesor = await db.get('SELECT usuario_id FROM profesores WHERE id = ?', franja.profesor_id);
  if (profesor?.usuario_id) {
    await notificar(db, profesor.usuario_id,
      `${turno.padre_nombre} solicitó un turno por ${turno.alumno_nombre} para el ${describirFranja(turno)}.`);
  }
  res.status(201).json(turno);
});

router.get('/mios', requireRole('padre'), async (req, res) => {
  const db = await dbPromise;
  res.json(await db.all(
    `${SELECT_TURNO} WHERE t.padre_usuario_id = ? ORDER BY d.fecha, d.hora_inicio`,
    req.user.id
  ));
});

// ---------- Cancelación (profesor o padre, cada uno solo sus turnos) ----------

router.patch('/:id/cancelar', requireRole('profesor', 'padre'), async (req, res) => {
  const db = await dbPromise;
  const turno = await db.get(`${SELECT_TURNO} WHERE t.id = ?`, req.params.id);
  if (!turno) return res.status(404).json({ message: 'Turno no encontrado' });

  let destinatario;
  if (req.user.rol === 'padre') {
    if (turno.padre_usuario_id !== req.user.id) {
      return res.status(403).json({ message: 'No podés cancelar este turno' });
    }
    const profesor = await db.get('SELECT usuario_id FROM profesores WHERE id = ?', turno.profesor_id);
    destinatario = profesor?.usuario_id;
  } else {
    const profesor = await profesorDelUsuario(db, req.user.id);
    if (!profesor || profesor.id !== turno.profesor_id) {
      return res.status(403).json({ message: 'No podés cancelar este turno' });
    }
    destinatario = turno.padre_usuario_id;
  }

  if (turno.estado === 'Cancelado') {
    return res.status(400).json({ message: 'El turno ya estaba cancelado' });
  }

  await db.run("UPDATE turnos SET estado = 'Cancelado' WHERE id = ?", turno.id);
  if (destinatario) {
    const quien = req.user.rol === 'padre' ? turno.padre_nombre : turno.profesor_nombre;
    await notificar(db, destinatario,
      `${quien} canceló el turno del ${describirFranja(turno)} (${turno.alumno_nombre}).`);
  }
  res.json(await db.get(`${SELECT_TURNO} WHERE t.id = ?`, turno.id));
});

export default router;
