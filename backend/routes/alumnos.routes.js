import express from 'express';
import bcrypt from 'bcryptjs';
import dbPromise from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { COLUMNAS_ALUMNO, COLUMNAS_USUARIO, tieneDatosAsociados } from '../asociados.js';
import { generarLegajo } from '../legajos.js';
import { materiasDelCurso } from '../materias.js';
import {
  limpiar, primerError, validarDni, validarDomicilio, validarEmail, validarFechaNacimiento,
  validarNombrePersona, validarPasswordNueva, validarTelefono
} from '../validaciones.js';

const router = express.Router();

router.use(authenticate);
router.use(requireRole('administrador'));

const REQUIRED_FIELDS = ['nombre', 'apellido', 'dni', 'fecha_nacimiento'];

function validarCamposObligatorios(body) {
  return REQUIRED_FIELDS.filter((campo) => !body[campo] || String(body[campo]).trim() === '');
}

// Devuelve los datos ya recortados y, si alguno es inválido, el mensaje de error.
async function validarAlumno(db, body) {
  const datos = {
    nombre: limpiar(body.nombre),
    apellido: limpiar(body.apellido),
    dni: limpiar(body.dni),
    fecha_nacimiento: limpiar(body.fecha_nacimiento),
    curso_id: body.curso_id || null,
    domicilio: limpiar(body.domicilio),
    telefono: limpiar(body.telefono),
    email: limpiar(body.email)
  };
  let error = primerError(
    validarNombrePersona(datos.nombre, 'nombre'),
    validarNombrePersona(datos.apellido, 'apellido'),
    validarDni(datos.dni),
    validarFechaNacimiento(datos.fecha_nacimiento),
    validarDomicilio(datos.domicilio),
    validarTelefono(datos.telefono),
    datos.email ? validarEmail(datos.email) : null
  );
  if (!error && datos.curso_id && !(await db.get('SELECT id FROM cursos WHERE id = ?', datos.curso_id))) {
    error = 'El curso seleccionado no existe';
  }
  return { datos, error };
}

// HU4 - Búsqueda por DNI, apellido o legajo (o listado completo sin filtro)
router.get('/', async (req, res) => {
  const db = await dbPromise;
  const { q } = req.query;

  let alumnos;
  if (q && q.trim() !== '') {
    const like = `%${q.trim()}%`;
    alumnos = await db.all(
      `SELECT a.*, c.nombre as curso_nombre, c.nivel as curso_nivel FROM alumnos a
       LEFT JOIN cursos c ON c.id = a.curso_id
       WHERE a.dni LIKE ? OR a.apellido LIKE ? OR a.legajo LIKE ?
       ORDER BY a.apellido, a.nombre`,
      [like, like, like]
    );
  } else {
    alumnos = await db.all(
      `SELECT a.*, c.nombre as curso_nombre, c.nivel as curso_nivel FROM alumnos a
       LEFT JOIN cursos c ON c.id = a.curso_id
       ORDER BY a.apellido, a.nombre`
    );
  }

  res.json(alumnos);
});

router.get('/:id', async (req, res) => {
  const db = await dbPromise;
  const alumno = await db.get(
    `SELECT a.*, c.nombre as curso_nombre, c.nivel as curso_nivel FROM alumnos a
     LEFT JOIN cursos c ON c.id = a.curso_id
     WHERE a.id = ?`,
    req.params.id
  );
  if (!alumno) return res.status(404).json({ message: 'Alumno no encontrado' });
  res.json(alumno);
});

// Padres o tutores vinculados a un alumno (para la ficha del alumno)
router.get('/:id/padres', async (req, res) => {
  const db = await dbPromise;
  if (!(await db.get('SELECT id FROM alumnos WHERE id = ?', req.params.id))) {
    return res.status(404).json({ message: 'Alumno no encontrado' });
  }
  const padres = await db.all(
    `SELECT u.id, u.nombre, u.apellido, u.email FROM padre_alumno pa
     JOIN usuarios u ON u.id = pa.padre_usuario_id
     WHERE pa.alumno_id = ?
     ORDER BY u.apellido, u.nombre`,
    req.params.id
  );
  res.json(padres);
});

// Materias y profesores del curso del alumno (para la ficha del alumno)
router.get('/:id/materias', async (req, res) => {
  const db = await dbPromise;
  const alumno = await db.get('SELECT curso_id FROM alumnos WHERE id = ?', req.params.id);
  if (!alumno) return res.status(404).json({ message: 'Alumno no encontrado' });
  res.json(await materiasDelCurso(db, alumno.curso_id));
});

// HU1 - Alta de legajo de alumnos
router.post('/', async (req, res) => {
  const faltantes = validarCamposObligatorios(req.body);
  if (faltantes.length > 0) {
    return res.status(400).json({ message: `Faltan campos obligatorios: ${faltantes.join(', ')}` });
  }

  const db = await dbPromise;
  const { datos, error } = await validarAlumno(db, req.body);
  if (error) return res.status(400).json({ message: error });
  const { nombre, apellido, dni, fecha_nacimiento, curso_id, domicilio, telefono, email } = datos;

  const existente = await db.get('SELECT id FROM alumnos WHERE dni = ?', dni);
  if (existente) {
    return res.status(400).json({ message: 'Ya existe un alumno registrado con ese DNI' });
  }

  const legajo = await generarLegajo(db, 'alumnos');

  const result = await db.run(
    `INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id, domicilio, telefono, email, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Activo')`,
    [legajo, nombre, apellido, dni, fecha_nacimiento, curso_id || null, domicilio || null, telefono || null, email || null]
  );

  const nuevoAlumno = await db.get(
    `SELECT a.*, c.nombre as curso_nombre, c.nivel as curso_nivel FROM alumnos a
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

  const { datos, error } = await validarAlumno(db, req.body);
  if (error) return res.status(400).json({ message: error });
  const { nombre, apellido, dni, fecha_nacimiento, curso_id, domicilio, telefono, email } = datos;

  const otroConMismoDni = await db.get('SELECT id FROM alumnos WHERE dni = ? AND id != ?', [dni, req.params.id]);
  if (otroConMismoDni) {
    return res.status(400).json({ message: 'Ya existe otro alumno registrado con ese DNI' });
  }

  // Con acceso al sistema, el email del alumno es el de su usuario: es obligatorio y único.
  if (alumno.usuario_id) {
    if (!email) return res.status(400).json({ message: 'El alumno tiene acceso al sistema: ingresá el email.' });
    if (await db.get('SELECT id FROM usuarios WHERE email = ? AND id != ?', [email, alumno.usuario_id])) {
      return res.status(400).json({ message: 'Ya existe un usuario registrado con ese email' });
    }
  }

  await db.run(
    `UPDATE alumnos SET nombre = ?, apellido = ?, dni = ?, fecha_nacimiento = ?, curso_id = ?,
       domicilio = ?, telefono = ?, email = ?
     WHERE id = ?`,
    [nombre, apellido, dni, fecha_nacimiento, curso_id || null, domicilio || null, telefono || null, email || null, req.params.id]
  );
  if (alumno.usuario_id) {
    await db.run(
      'UPDATE usuarios SET nombre = ?, apellido = ?, email = ? WHERE id = ?',
      [nombre, apellido, email, alumno.usuario_id]
    );
  }

  const actualizado = await db.get(
    `SELECT a.*, c.nombre as curso_nombre, c.nivel as curso_nivel FROM alumnos a
     LEFT JOIN cursos c ON c.id = a.curso_id
     WHERE a.id = ?`,
    req.params.id
  );
  res.json(actualizado);
});

// HU4 - Baja lógica / reactivación (no elimina el historial). Si el alumno tiene
// acceso al sistema, también bloquea o habilita su inicio de sesión. Alumno y
// usuario cambian en la misma transacción, bloqueando primero el usuario y
// después el alumno (mismo orden que usuarios.routes.js).
router.patch('/:id/estado', async (req, res) => {
  const { estado } = req.body;
  if (!['Activo', 'Inactivo'].includes(estado)) {
    return res.status(400).json({ message: "El estado debe ser 'Activo' o 'Inactivo'" });
  }

  const db = await dbPromise;
  const actualizado = await db.transaccion(async (tx) => {
    const { usuario_id: usuarioId } = await tx.get('SELECT usuario_id FROM alumnos WHERE id = ?', req.params.id) || {};
    if (usuarioId) await tx.get('SELECT id FROM usuarios WHERE id = ? FOR UPDATE', usuarioId);
    const alumno = await tx.get('SELECT * FROM alumnos WHERE id = ? FOR UPDATE', req.params.id);
    if (!alumno) return null;

    await tx.run('UPDATE alumnos SET estado = ? WHERE id = ?', [estado, alumno.id]);
    if (alumno.usuario_id) {
      await tx.run('UPDATE usuarios SET activo = ? WHERE id = ?', [estado === 'Activo' ? 1 : 0, alumno.usuario_id]);
    }
    return tx.get('SELECT * FROM alumnos WHERE id = ?', alumno.id);
  });

  if (!actualizado) return res.status(404).json({ message: 'Alumno no encontrado' });
  res.json(actualizado);
});

// Acceso del alumno al sistema: crea su usuario (rol alumno) con el email del
// alumno. Si el alumno no tiene email, se usa el que se envía y queda guardado.
router.post('/:id/acceso', async (req, res) => {
  const { password } = req.body;
  const errorPassword = validarPasswordNueva(password);
  if (errorPassword) return res.status(400).json({ message: errorPassword });

  const db = await dbPromise;
  const resultado = await db.transaccion(async (tx) => {
    const alumno = await tx.get('SELECT * FROM alumnos WHERE id = ? FOR UPDATE', req.params.id);
    if (!alumno) return { status: 404, message: 'Alumno no encontrado' };
    if (alumno.usuario_id) return { status: 409, message: 'El alumno ya tiene acceso al sistema' };

    const email = alumno.email || limpiar(req.body.email);
    const errorEmail = validarEmail(email);
    if (errorEmail) return { status: 400, message: errorEmail };
    if (await tx.get('SELECT id FROM usuarios WHERE email = ?', email)) {
      return { status: 400, message: 'Ya existe un usuario registrado con ese email' };
    }

    const usuarioId = (await tx.run(
      'INSERT INTO usuarios (nombre, apellido, email, password, rol, activo) VALUES (?, ?, ?, ?, ?, ?)',
      [alumno.nombre, alumno.apellido, email, bcrypt.hashSync(password, 8), 'alumno', alumno.estado === 'Activo' ? 1 : 0]
    )).lastID;
    await tx.run('UPDATE alumnos SET usuario_id = ?, email = ? WHERE id = ?', [usuarioId, email, alumno.id]);
    return {
      alumno: await tx.get(
        `SELECT a.*, c.nombre as curso_nombre, c.nivel as curso_nivel FROM alumnos a
         LEFT JOIN cursos c ON c.id = a.curso_id
         WHERE a.id = ?`,
        alumno.id
      )
    };
  });

  if (resultado.status) return res.status(resultado.status).json({ message: resultado.message });
  res.status(201).json(resultado.alumno);
});

// Eliminación definitiva, solo para alumnos cargados por error: si tiene
// cualquier registro asociado se rechaza y corresponde la baja lógica.
// Su usuario, si tiene, se elimina con él.
router.delete('/:id', async (req, res) => {
  const db = await dbPromise;
  const alumno = await db.get('SELECT id, usuario_id FROM alumnos WHERE id = ?', req.params.id);
  if (!alumno) return res.status(404).json({ message: 'Alumno no encontrado' });

  // Las notificaciones son avisos para el propio usuario: no cuentan y se borran con él.
  const tieneDatos = await tieneDatosAsociados(db, { tabla: 'alumnos', nombres: COLUMNAS_ALUMNO, id: alumno.id })
    || (alumno.usuario_id && await tieneDatosAsociados(db, {
      tabla: 'usuarios', nombres: COLUMNAS_USUARIO, id: alumno.usuario_id, excluir: ['alumnos', 'notificaciones']
    }));
  if (tieneDatos) {
    return res.status(409).json({
      message: 'No se puede eliminar: el alumno tiene datos asociados. Usá "Dar de baja".'
    });
  }

  await db.transaccion(async (tx) => {
    await tx.run('DELETE FROM alumnos WHERE id = ?', alumno.id);
    if (alumno.usuario_id) {
      await tx.run('DELETE FROM notificaciones WHERE usuario_id = ?', alumno.usuario_id);
      await tx.run('DELETE FROM usuarios WHERE id = ?', alumno.usuario_id);
    }
  });
  res.json({ message: 'Alumno eliminado' });
});

export default router;
