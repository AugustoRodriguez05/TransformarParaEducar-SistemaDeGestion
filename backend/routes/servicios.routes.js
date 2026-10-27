import express from 'express';
import dbPromise from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { DIAS } from '../constantes.js';
import {
  limpiar, validarNivel, validarNivelDelGrupo, validarNombreCatalogo, validarRangoHorario
} from '../validaciones.js';

const router = express.Router();

router.use(authenticate);
router.use(requireRole('administrador', 'padre', 'alumno'));

const MAX_DEPORTES = 2;

function solapan(inicioA, finA, inicioB, finB) {
  return inicioA < finB && inicioB < finA;
}

// Orden de los grupos: por deporte, primero el de todos los niveles, y por día y hora.
const ORDEN_GRUPOS = `d.nombre, d.nivel NULLS FIRST,
  array_position(ARRAY[${DIAS.map((d) => `'${d}'`).join(',')}]::text[], d.dia), d.hora_inicio`;

router.get('/deportes', async (req, res) => {
  const db = await dbPromise;
  res.json(await db.all(
    `SELECT d.*, p.nombre as profesor_nombre, p.apellido as profesor_apellido
     FROM deportes d
     LEFT JOIN profesores p ON p.id = d.profesor_id
     ORDER BY ${ORDEN_GRUPOS}`
  ));
});

router.get('/recorridos', async (req, res) => {
  const db = await dbPromise;
  res.json(await db.all('SELECT * FROM recorridos_transporte ORDER BY id'));
});

// ---------- Administración del catálogo de deportes (solo administrador) ----------

// Cada deporte es un grupo: nombre, nivel (vacío = todos los niveles), día y horario.
function validarDeporte({ nombre, nivel, dia, hora_inicio, hora_fin }) {
  const errorNombre = validarNombreCatalogo(limpiar(nombre));
  if (errorNombre) return errorNombre;
  if (nivel && validarNivel(nivel)) return validarNivel(nivel);
  if (!DIAS.includes(dia)) return `El día debe ser uno de: ${DIAS.join(', ')}`;
  return validarRangoHorario(hora_inicio, hora_fin);
}

// No se repite la combinación nombre + nivel + día + hora de inicio (índice deportes_grupo_unico).
async function grupoRepetido(db, { nombre, nivel, dia, hora_inicio }, excluirId = 0) {
  return db.get(
    `SELECT id FROM deportes
     WHERE nombre = ? AND nivel IS NOT DISTINCT FROM ? AND dia = ? AND hora_inicio = ? AND id != ?`,
    [nombre, nivel, dia, hora_inicio, excluirId]
  );
}

const GRUPO_REPETIDO = 'Ya existe un grupo de ese deporte con el mismo nivel, día y hora de inicio';

// Cada deporte tiene un profesor responsable, que tiene que existir y estar activo.
async function validarProfesorResponsable(db, profesorId) {
  const id = Number(profesorId);
  if (!Number.isInteger(id) || id <= 0) return 'Seleccioná el profesor responsable.';
  const profesor = await db.get('SELECT estado FROM profesores WHERE id = ?', id);
  if (!profesor) return 'El profesor responsable no existe.';
  if (profesor.estado !== 'Activo') return 'El profesor responsable tiene que estar activo.';
  return null;
}

router.post('/deportes', requireRole('administrador'), async (req, res) => {
  const db = await dbPromise;
  const error = validarDeporte(req.body) || await validarProfesorResponsable(db, req.body.profesor_id);
  if (error) return res.status(400).json({ message: error });

  const grupo = { ...req.body, nombre: limpiar(req.body.nombre), nivel: req.body.nivel || null };
  if (await grupoRepetido(db, grupo)) return res.status(409).json({ message: GRUPO_REPETIDO });

  const result = await db.run(
    'INSERT INTO deportes (nombre, nivel, dia, hora_inicio, hora_fin, profesor_id) VALUES (?, ?, ?, ?, ?, ?)',
    [grupo.nombre, grupo.nivel, grupo.dia, grupo.hora_inicio, grupo.hora_fin, Number(grupo.profesor_id)]
  );
  res.status(201).json(await db.get('SELECT * FROM deportes WHERE id = ?', result.lastID));
});

router.put('/deportes/:id', requireRole('administrador'), async (req, res) => {
  const db = await dbPromise;
  const error = validarDeporte(req.body) || await validarProfesorResponsable(db, req.body.profesor_id);
  if (error) return res.status(400).json({ message: error });

  const deporte = await db.get('SELECT * FROM deportes WHERE id = ?', req.params.id);
  if (!deporte) return res.status(404).json({ message: 'Deporte no encontrado' });

  const grupo = { ...req.body, nombre: limpiar(req.body.nombre), nivel: req.body.nivel || null };
  if (await grupoRepetido(db, grupo, deporte.id)) return res.status(409).json({ message: GRUPO_REPETIDO });

  // Con alumnos inscriptos, cambiar el horario podría romper la regla de no superposición,
  // y cambiar el nivel, la de que cada alumno esté en un grupo de su nivel.
  const cambiaGrupo = deporte.dia !== grupo.dia
    || deporte.hora_inicio !== grupo.hora_inicio
    || deporte.hora_fin !== grupo.hora_fin
    || deporte.nivel !== grupo.nivel;
  const inscriptos = await db.all(
    "SELECT alumno_id FROM inscripciones_deportivas WHERE deporte_id = ? AND estado = 'Activa'",
    deporte.id
  );
  if (cambiaGrupo && inscriptos.length > 0) {
    return res.status(409).json({ message: 'No se puede cambiar el nivel ni el horario: hay alumnos inscriptos' });
  }
  // Renombrarlo no puede dejar a un alumno en dos grupos del mismo deporte.
  if (grupo.nombre !== deporte.nombre && inscriptos.length > 0 && await db.get(
    `SELECT i.id FROM inscripciones_deportivas i
     JOIN deportes d ON d.id = i.deporte_id
     WHERE d.nombre = ? AND i.estado = 'Activa' AND i.alumno_id = ANY(?::int[])`,
    [grupo.nombre, inscriptos.map((i) => i.alumno_id)]
  )) {
    return res.status(409).json({ message: `No se puede cambiar el nombre: hay alumnos inscriptos en otro grupo de ${grupo.nombre}` });
  }

  await db.run(
    'UPDATE deportes SET nombre = ?, nivel = ?, dia = ?, hora_inicio = ?, hora_fin = ?, profesor_id = ? WHERE id = ?',
    [grupo.nombre, grupo.nivel, grupo.dia, grupo.hora_inicio, grupo.hora_fin, Number(grupo.profesor_id), deporte.id]
  );
  res.json(await db.get('SELECT * FROM deportes WHERE id = ?', deporte.id));
});

router.delete('/deportes/:id', requireRole('administrador'), async (req, res) => {
  const db = await dbPromise;
  if (!(await db.get('SELECT id FROM deportes WHERE id = ?', req.params.id))) {
    return res.status(404).json({ message: 'Deporte no encontrado' });
  }
  if (await db.get('SELECT id FROM inscripciones_deportivas WHERE deporte_id = ?', req.params.id)) {
    return res.status(409).json({ message: 'No se puede eliminar: tiene inscripciones asociadas' });
  }
  await db.run('DELETE FROM deportes WHERE id = ?', req.params.id);
  res.json({ message: 'Eliminado' });
});

// El administrador opera sobre cualquier alumno; el padre solo sobre sus hijos
// vinculados, y el alumno solo sobre sí mismo (se verifica en la base, no en el frontend).
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
  if (req.user.rol === 'alumno' && alumno.usuario_id !== req.user.id) {
    return res.status(403).json({ message: 'No tenés acceso a la información de este alumno' });
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

// Nivel educativo del alumno: el de su curso (null si no tiene curso o el curso no tiene nivel).
async function nivelDelAlumno(db, alumno) {
  if (!alumno.curso_id) return null;
  const curso = await db.get('SELECT nivel FROM cursos WHERE id = ?', alumno.curso_id);
  return curso?.nivel || null;
}

async function obtenerServicios(db, alumno) {
  const alumnoId = alumno.id;
  const deportes = await db.all(
    `SELECT d.id, d.nombre, d.nivel, d.dia, d.hora_inicio, d.hora_fin
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
  // nivel: para que el frontend ofrezca solo los grupos de deportes que le corresponden.
  return {
    nivel: await nivelDelAlumno(db, alumno),
    deportes,
    transporte: transporte || null,
    comedor: comedor ? true : false
  };
}

router.get('/alumnos/:alumnoId', autorizarAlumno, async (req, res) => {
  const db = await dbPromise;
  res.json(await obtenerServicios(db, req.alumno));
});

// El alumno solo consulta sus servicios: inscribir y dar de baja quedan para el
// administrador y el padre (al alumno se le responde 403).
const puedeModificarServicios = requireRole('administrador', 'padre');

// HU5 - Inscripción a deportes: máximo 2, sin superposición de horarios, un solo grupo
// por deporte y, si el grupo tiene nivel, solo alumnos de ese nivel
router.post('/alumnos/:alumnoId/deportes', puedeModificarServicios, autorizarAlumno, exigirAlumnoActivo, async (req, res) => {
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

  const errorNivel = validarNivelDelGrupo(deporte, await nivelDelAlumno(db, req.alumno));
  if (errorNivel) return res.status(400).json({ message: errorNivel });

  const activas = await db.all(
    `SELECT d.* FROM inscripciones_deportivas i
     JOIN deportes d ON d.id = i.deporte_id
     WHERE i.alumno_id = ? AND i.estado = 'Activa'`,
    req.alumno.id
  );
  if (activas.some((a) => a.nombre === deporte.nombre)) {
    return res.status(409).json({ message: `El alumno ya está inscripto en otro grupo de ${deporte.nombre}` });
  }
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
  res.status(201).json(await obtenerServicios(db, req.alumno));
});

router.delete('/alumnos/:alumnoId/deportes/:deporteId', puedeModificarServicios, autorizarAlumno, async (req, res) => {
  const db = await dbPromise;
  await db.run(
    "UPDATE inscripciones_deportivas SET estado = 'Baja' WHERE alumno_id = ? AND deporte_id = ?",
    [req.alumno.id, req.params.deporteId]
  );
  res.json(await obtenerServicios(db, req.alumno));
});

// HU6 - Transporte: una única inscripción activa por alumno
router.post('/alumnos/:alumnoId/transporte', puedeModificarServicios, autorizarAlumno, exigirAlumnoActivo, async (req, res) => {
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
  res.status(201).json(await obtenerServicios(db, req.alumno));
});

// La baja cambia el estado; el registro se conserva para los reportes.
router.delete('/alumnos/:alumnoId/transporte', puedeModificarServicios, autorizarAlumno, async (req, res) => {
  const db = await dbPromise;
  await db.run(
    "UPDATE inscripciones_transporte SET estado = 'Baja' WHERE alumno_id = ? AND estado = 'Activa'",
    req.alumno.id
  );
  res.json(await obtenerServicios(db, req.alumno));
});

// HU6 - Comedor
router.post('/alumnos/:alumnoId/comedor', puedeModificarServicios, autorizarAlumno, exigirAlumnoActivo, async (req, res) => {
  const db = await dbPromise;
  const activa = await db.get(
    "SELECT id FROM inscripciones_comedor WHERE alumno_id = ? AND estado = 'Activa'",
    req.alumno.id
  );
  if (activa) {
    return res.status(409).json({ message: 'El alumno ya está inscripto al servicio de comedor' });
  }

  await db.run('INSERT INTO inscripciones_comedor (alumno_id) VALUES (?)', req.alumno.id);
  res.status(201).json(await obtenerServicios(db, req.alumno));
});

router.delete('/alumnos/:alumnoId/comedor', puedeModificarServicios, autorizarAlumno, async (req, res) => {
  const db = await dbPromise;
  await db.run(
    "UPDATE inscripciones_comedor SET estado = 'Baja' WHERE alumno_id = ? AND estado = 'Activa'",
    req.alumno.id
  );
  res.json(await obtenerServicios(db, req.alumno));
});

export default router;
