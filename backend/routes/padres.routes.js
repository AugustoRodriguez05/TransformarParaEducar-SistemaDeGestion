import express from 'express';
import bcrypt from 'bcryptjs';
import dbPromise from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { COLUMNAS_USUARIO, tieneDatosAsociados } from '../asociados.js';
import {
  limpiar, primerError, validarEmail, validarNombrePersona, validarPasswordNueva
} from '../validaciones.js';

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
  const { password } = req.body;
  const nombre = limpiar(req.body.nombre);
  const apellido = limpiar(req.body.apellido);
  const email = limpiar(req.body.email);
  if (!nombre || !apellido || !email || !password) {
    return res.status(400).json({ message: 'Todos los campos son obligatorios' });
  }
  const error = primerError(
    validarNombrePersona(nombre, 'nombre'),
    validarNombrePersona(apellido, 'apellido'),
    validarEmail(email),
    validarPasswordNueva(password)
  );
  if (error) return res.status(400).json({ message: error });

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

// Edición de los datos del padre/tutor (la contraseña no se cambia acá)
router.put('/:id', async (req, res) => {
  const db = await dbPromise;
  const padre = await db.get(`${SELECT_PADRE} AND id = ?`, req.params.id);
  if (!padre) return res.status(404).json({ message: 'Padre/tutor no encontrado' });

  const nombre = limpiar(req.body.nombre);
  const apellido = limpiar(req.body.apellido);
  const email = limpiar(req.body.email);
  const error = primerError(
    validarNombrePersona(nombre, 'nombre'),
    validarNombrePersona(apellido, 'apellido'),
    validarEmail(email)
  );
  if (error) return res.status(400).json({ message: error });

  if (await db.get('SELECT id FROM usuarios WHERE email = ? AND id != ?', [email, padre.id])) {
    return res.status(400).json({ message: 'Ya existe un usuario registrado con ese email' });
  }

  await db.run(
    'UPDATE usuarios SET nombre = ?, apellido = ?, email = ? WHERE id = ?',
    [nombre, apellido, email, padre.id]
  );
  res.json(await padreConHijos(db, await db.get(`${SELECT_PADRE} AND id = ?`, padre.id)));
});

// Baja lógica / reactivación: bloquea o habilita el inicio de sesión
router.patch('/:id/estado', async (req, res) => {
  const { estado } = req.body;
  if (!['Activo', 'Inactivo'].includes(estado)) {
    return res.status(400).json({ message: "El estado debe ser 'Activo' o 'Inactivo'" });
  }

  const db = await dbPromise;
  const padre = await db.get(`${SELECT_PADRE} AND id = ?`, req.params.id);
  if (!padre) return res.status(404).json({ message: 'Padre/tutor no encontrado' });
  if (padre.id === req.user.id) {
    return res.status(400).json({ message: 'No podés darte de baja a vos mismo' });
  }

  await db.run('UPDATE usuarios SET activo = ? WHERE id = ?', [estado === 'Activo' ? 1 : 0, padre.id]);
  res.json(await padreConHijos(db, await db.get(`${SELECT_PADRE} AND id = ?`, padre.id)));
});

// Eliminación definitiva, solo para padres/tutores cargados por error: si tiene
// cualquier registro asociado se rechaza y corresponde la baja lógica.
router.delete('/:id', async (req, res) => {
  const db = await dbPromise;
  const padre = await db.get(`${SELECT_PADRE} AND id = ?`, req.params.id);
  if (!padre) return res.status(404).json({ message: 'Padre/tutor no encontrado' });
  if (padre.id === req.user.id) {
    return res.status(400).json({ message: 'No podés eliminarte a vos mismo' });
  }

  // Las notificaciones son avisos para el propio usuario: no cuentan y se borran con él.
  if (await tieneDatosAsociados(db, {
    tabla: 'usuarios', nombres: COLUMNAS_USUARIO, id: padre.id, excluir: ['notificaciones']
  })) {
    return res.status(409).json({
      message: 'No se puede eliminar: el padre/tutor tiene datos asociados. Usá "Dar de baja".'
    });
  }

  await db.run('DELETE FROM notificaciones WHERE usuario_id = ?', padre.id);
  await db.run('DELETE FROM usuarios WHERE id = ?', padre.id);
  res.json({ message: 'Padre/tutor eliminado' });
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
