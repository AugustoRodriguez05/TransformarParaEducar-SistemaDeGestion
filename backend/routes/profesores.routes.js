import express from 'express';
import bcrypt from 'bcryptjs';
import dbPromise from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { DIAS } from '../constantes.js';
import { COLUMNAS_PROFESOR, COLUMNAS_USUARIO, tieneDatosAsociados } from '../asociados.js';
import { generarLegajo } from '../legajos.js';
import {
  limpiar, primerError, validarDni, validarEmail, validarEspecialidad, validarNombrePersona,
  validarPasswordNueva, validarRangoHorario, validarTelefono
} from '../validaciones.js';

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
    `SELECT asig.*, m.nombre as materia_nombre, c.nombre as curso_nombre, c.nivel as curso_nivel
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
  const { password } = req.body;
  const nombre = limpiar(req.body.nombre);
  const apellido = limpiar(req.body.apellido);
  const dni = limpiar(req.body.dni);
  const email = limpiar(req.body.email);
  const especialidad = limpiar(req.body.especialidad);
  const telefono = limpiar(req.body.telefono);
  if (!nombre || !apellido || !dni || !email || !password) {
    return res.status(400).json({ message: 'Todos los campos son obligatorios' });
  }
  const error = primerError(
    validarNombrePersona(nombre, 'nombre'),
    validarNombrePersona(apellido, 'apellido'),
    validarDni(dni),
    validarEmail(email),
    validarPasswordNueva(password),
    validarEspecialidad(especialidad),
    validarTelefono(telefono)
  );
  if (error) return res.status(400).json({ message: error });

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

  const legajo = await generarLegajo(db, 'profesores');
  const result = await db.run(
    `INSERT INTO profesores (usuario_id, legajo, nombre, apellido, dni, email, especialidad, telefono, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Activo')`,
    [usuarioId, legajo, nombre, apellido, dni, email, especialidad || null, telefono || null]
  );

  const nuevoProfesor = await db.get('SELECT * FROM profesores WHERE id = ?', result.lastID);
  res.status(201).json(nuevoProfesor);
});

// Edición de los datos del profesor y de su cuenta de acceso (la contraseña no se cambia acá)
router.put('/:id', async (req, res) => {
  const db = await dbPromise;
  const profesor = await db.get('SELECT * FROM profesores WHERE id = ?', req.params.id);
  if (!profesor) return res.status(404).json({ message: 'Profesor no encontrado' });

  const nombre = limpiar(req.body.nombre);
  const apellido = limpiar(req.body.apellido);
  const dni = limpiar(req.body.dni);
  const email = limpiar(req.body.email);
  const especialidad = limpiar(req.body.especialidad);
  const telefono = limpiar(req.body.telefono);
  const error = primerError(
    validarNombrePersona(nombre, 'nombre'),
    validarNombrePersona(apellido, 'apellido'),
    validarDni(dni),
    validarEmail(email),
    validarEspecialidad(especialidad),
    validarTelefono(telefono)
  );
  if (error) return res.status(400).json({ message: error });

  if (await db.get('SELECT id FROM profesores WHERE dni = ? AND id != ?', [dni, profesor.id])) {
    return res.status(400).json({ message: 'Ya existe un profesor registrado con ese DNI' });
  }
  if (await db.get('SELECT id FROM usuarios WHERE email = ? AND id != ?', [email, profesor.usuario_id])) {
    return res.status(400).json({ message: 'Ya existe un usuario registrado con ese email' });
  }

  await db.run(
    'UPDATE profesores SET nombre = ?, apellido = ?, dni = ?, email = ?, especialidad = ?, telefono = ? WHERE id = ?',
    [nombre, apellido, dni, email, especialidad || null, telefono || null, profesor.id]
  );
  if (profesor.usuario_id) {
    await db.run(
      'UPDATE usuarios SET nombre = ?, apellido = ?, email = ? WHERE id = ?',
      [nombre, apellido, email, profesor.usuario_id]
    );
  }
  res.json(await db.get('SELECT * FROM profesores WHERE id = ?', profesor.id));
});

// Baja lógica / reactivación: también bloquea o habilita el inicio de sesión.
// Profesor y usuario cambian en la misma transacción, bloqueando primero el
// usuario y después el profesor (mismo orden que usuarios.routes.js).
router.patch('/:id/estado', async (req, res) => {
  const { estado } = req.body;
  if (!['Activo', 'Inactivo'].includes(estado)) {
    return res.status(400).json({ message: "El estado debe ser 'Activo' o 'Inactivo'" });
  }

  const db = await dbPromise;
  const resultado = await db.transaccion(async (tx) => {
    const { usuario_id: usuarioId } = await tx.get('SELECT usuario_id FROM profesores WHERE id = ?', req.params.id) || {};
    if (usuarioId) await tx.get('SELECT id FROM usuarios WHERE id = ? FOR UPDATE', usuarioId);
    const profesor = await tx.get('SELECT * FROM profesores WHERE id = ? FOR UPDATE', req.params.id);
    if (!profesor) return { status: 404, message: 'Profesor no encontrado' };
    if (profesor.usuario_id === req.user.id) {
      return { status: 400, message: 'No podés darte de baja a vos mismo' };
    }

    await tx.run('UPDATE profesores SET estado = ? WHERE id = ?', [estado, profesor.id]);
    if (profesor.usuario_id) {
      await tx.run('UPDATE usuarios SET activo = ? WHERE id = ?', [estado === 'Activo' ? 1 : 0, profesor.usuario_id]);
    }
    return { profesor: await tx.get('SELECT * FROM profesores WHERE id = ?', profesor.id) };
  });

  if (resultado.status) return res.status(resultado.status).json({ message: resultado.message });
  res.json(resultado.profesor);
});

// Eliminación definitiva, solo para profesores cargados por error: si tiene
// cualquier registro asociado se rechaza y corresponde la baja lógica.
router.delete('/:id', async (req, res) => {
  const db = await dbPromise;
  const profesor = await db.get('SELECT * FROM profesores WHERE id = ?', req.params.id);
  if (!profesor) return res.status(404).json({ message: 'Profesor no encontrado' });
  if (profesor.usuario_id === req.user.id) {
    return res.status(400).json({ message: 'No podés eliminarte a vos mismo' });
  }

  // Las notificaciones son avisos para el propio usuario: no cuentan y se borran con él.
  const tieneDatos = await tieneDatosAsociados(db, { tabla: 'profesores', nombres: COLUMNAS_PROFESOR, id: profesor.id })
    || (profesor.usuario_id && await tieneDatosAsociados(db, {
      tabla: 'usuarios', nombres: COLUMNAS_USUARIO, id: profesor.usuario_id, excluir: ['profesores', 'notificaciones']
    }));
  if (tieneDatos) {
    return res.status(409).json({
      message: 'No se puede eliminar: el profesor tiene datos asociados. Usá "Dar de baja".'
    });
  }

  await db.run('DELETE FROM profesores WHERE id = ?', profesor.id);
  if (profesor.usuario_id) {
    await db.run('DELETE FROM notificaciones WHERE usuario_id = ?', profesor.usuario_id);
    await db.run('DELETE FROM usuarios WHERE id = ?', profesor.usuario_id);
  }
  res.json({ message: 'Profesor eliminado' });
});

function solapan(inicioA, finA, inicioB, finB) {
  return inicioA < finB && inicioB < finA;
}

const SELECT_ASIGNACION = `SELECT asig.*, m.nombre as materia_nombre, c.nombre as curso_nombre, c.nivel as curso_nivel
     FROM asignaciones asig
     JOIN materias m ON m.id = asig.materia_id
     JOIN cursos c ON c.id = asig.curso_id
     WHERE asig.id = ?`;

// Validaciones comunes al alta y a la edición de una asignación. Devuelve
// { status, message } si algo falla, o null. Al editar, excluirId deja afuera
// del control de superposición a la propia asignación.
async function validarAsignacion(db, profesorId, body, excluirId = 0) {
  const { materia_id, curso_id, dia, hora_inicio, hora_fin } = body;
  if (!materia_id || !curso_id || !dia || !hora_inicio || !hora_fin) {
    return { status: 400, message: 'Todos los campos son obligatorios' };
  }
  if (!DIAS.includes(dia)) {
    return { status: 400, message: `El día debe ser uno de: ${DIAS.join(', ')}` };
  }
  const errorHorario = validarRangoHorario(hora_inicio, hora_fin);
  if (errorHorario) return { status: 400, message: errorHorario };

  if (!(await db.get('SELECT id FROM materias WHERE id = ?', materia_id))) {
    return { status: 400, message: 'La materia seleccionada no existe' };
  }
  if (!(await db.get('SELECT id FROM cursos WHERE id = ?', curso_id))) {
    return { status: 400, message: 'El curso seleccionado no existe' };
  }

  const asignacionesDelDia = await db.all(
    'SELECT * FROM asignaciones WHERE profesor_id = ? AND dia = ? AND id != ?',
    [profesorId, dia, excluirId]
  );
  const conflicto = asignacionesDelDia.some((a) => solapan(a.hora_inicio, a.hora_fin, hora_inicio, hora_fin));
  if (conflicto) {
    return { status: 409, message: 'El profesor ya tiene una materia asignada en ese día y horario' };
  }
  return null;
}

// HU2 - Asignación de materia/curso a un profesor, con validación de conflicto de horario
router.post('/:id/asignaciones', async (req, res) => {
  const { materia_id, curso_id, dia, hora_inicio, hora_fin } = req.body;
  if (!materia_id || !curso_id || !dia || !hora_inicio || !hora_fin) {
    return res.status(400).json({ message: 'Todos los campos son obligatorios' });
  }

  const db = await dbPromise;
  const profesor = await db.get('SELECT * FROM profesores WHERE id = ?', req.params.id);
  if (!profesor) return res.status(404).json({ message: 'Profesor no encontrado' });

  const error = await validarAsignacion(db, profesor.id, req.body);
  if (error) return res.status(error.status).json({ message: error.message });

  const result = await db.run(
    `INSERT INTO asignaciones (profesor_id, materia_id, curso_id, dia, hora_inicio, hora_fin)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.params.id, materia_id, curso_id, dia, hora_inicio, hora_fin]
  );

  const nuevaAsignacion = await db.get(SELECT_ASIGNACION, result.lastID);
  res.status(201).json(nuevaAsignacion);
});

// La asignación tiene que pertenecer al profesor de la URL.
async function asignacionDelProfesor(db, req, res) {
  const asignacion = await db.get(
    'SELECT * FROM asignaciones WHERE id = ? AND profesor_id = ?',
    [req.params.asignacionId, req.params.id]
  );
  if (!asignacion) res.status(404).json({ message: 'Asignación no encontrada' });
  return asignacion;
}

router.put('/:id/asignaciones/:asignacionId', async (req, res) => {
  const db = await dbPromise;
  const asignacion = await asignacionDelProfesor(db, req, res);
  if (!asignacion) return;

  const error = await validarAsignacion(db, asignacion.profesor_id, req.body, asignacion.id);
  if (error) return res.status(error.status).json({ message: error.message });

  const { materia_id, curso_id, dia, hora_inicio, hora_fin } = req.body;
  await db.run(
    `UPDATE asignaciones SET materia_id = ?, curso_id = ?, dia = ?, hora_inicio = ?, hora_fin = ?
     WHERE id = ?`,
    [materia_id, curso_id, dia, hora_inicio, hora_fin, asignacion.id]
  );
  res.json(await db.get(SELECT_ASIGNACION, asignacion.id));
});

router.delete('/:id/asignaciones/:asignacionId', async (req, res) => {
  const db = await dbPromise;
  const asignacion = await asignacionDelProfesor(db, req, res);
  if (!asignacion) return;

  await db.run('DELETE FROM asignaciones WHERE id = ?', asignacion.id);
  res.json({ message: 'Asignación eliminada' });
});

export default router;
