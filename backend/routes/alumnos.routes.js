import express from 'express';
import dbPromise from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { obtenerCicloLectivo } from '../configuracion.js';
import { COLUMNAS_ALUMNO, tieneDatosAsociados } from '../asociados.js';
import {
  limpiar, primerError, validarDni, validarFechaNacimiento, validarNombrePersona
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
    curso_id: body.curso_id || null
  };
  let error = primerError(
    validarNombrePersona(datos.nombre, 'nombre'),
    validarNombrePersona(datos.apellido, 'apellido'),
    validarDni(datos.dni),
    validarFechaNacimiento(datos.fecha_nacimiento)
  );
  if (!error && datos.curso_id && !(await db.get('SELECT id FROM cursos WHERE id = ?', datos.curso_id))) {
    error = 'El curso seleccionado no existe';
  }
  return { datos, error };
}

async function generarLegajo(db) {
  const anio = await obtenerCicloLectivo(db);
  // Se toma el número más alto usado en el año (no la cantidad de alumnos), para
  // que eliminar un alumno no haga repetir un legajo existente.
  const prefijo = `${anio}-`;
  const { ultimo } = await db.get(
    'SELECT MAX(CAST(SUBSTR(legajo, ?) AS INTEGER)) as ultimo FROM alumnos WHERE legajo LIKE ?',
    [prefijo.length + 1, `${prefijo}%`]
  );
  const secuencia = String((ultimo || 0) + 1).padStart(4, '0');
  return `${prefijo}${secuencia}`;
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

// HU1 - Alta de legajo de alumnos
router.post('/', async (req, res) => {
  const faltantes = validarCamposObligatorios(req.body);
  if (faltantes.length > 0) {
    return res.status(400).json({ message: `Faltan campos obligatorios: ${faltantes.join(', ')}` });
  }

  const db = await dbPromise;
  const { datos, error } = await validarAlumno(db, req.body);
  if (error) return res.status(400).json({ message: error });
  const { nombre, apellido, dni, fecha_nacimiento, curso_id } = datos;

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

  const { datos, error } = await validarAlumno(db, req.body);
  if (error) return res.status(400).json({ message: error });
  const { nombre, apellido, dni, fecha_nacimiento, curso_id } = datos;

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

// Eliminación definitiva, solo para alumnos cargados por error: si tiene
// cualquier registro asociado se rechaza y corresponde la baja lógica.
router.delete('/:id', async (req, res) => {
  const db = await dbPromise;
  const alumno = await db.get('SELECT id FROM alumnos WHERE id = ?', req.params.id);
  if (!alumno) return res.status(404).json({ message: 'Alumno no encontrado' });

  if (await tieneDatosAsociados(db, { tabla: 'alumnos', nombres: COLUMNAS_ALUMNO, id: alumno.id })) {
    return res.status(409).json({
      message: 'No se puede eliminar: el alumno tiene datos asociados. Usá "Dar de baja".'
    });
  }

  await db.run('DELETE FROM alumnos WHERE id = ?', alumno.id);
  res.json({ message: 'Alumno eliminado' });
});

export default router;
