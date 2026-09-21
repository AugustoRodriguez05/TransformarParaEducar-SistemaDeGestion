// Carga datos de ejemplo para desarrollo y demostración: npm run seed
// Solo actúa sobre una base vacía; nunca pisa datos existentes.
import bcrypt from 'bcryptjs';
import dbPromise, { initDb } from './db.js';

const hash = (plain) => bcrypt.hashSync(plain, 8);

async function insertar(db, sql, params) {
  return (await db.run(sql, params)).lastID;
}

async function sembrar() {
  await initDb();
  const db = await dbPromise;

  const { count } = await db.get('SELECT COUNT(*) as count FROM usuarios');
  if (count > 0) {
    console.log('La base ya tiene datos: no se carga nada. Borrá backend/gestion.sqlite para empezar de cero.');
    return;
  }

  const SQL_USUARIO = 'INSERT INTO usuarios (nombre, apellido, email, password, rol) VALUES (?, ?, ?, ?, ?)';
  await insertar(db, SQL_USUARIO, ['Admin', 'Gestión', 'admin@gestion.com', hash('admin123'), 'administrador']);
  const prof1UserId = await insertar(db, SQL_USUARIO, ['Carla', 'Gómez', 'carla.gomez@gestion.com', hash('prof123'), 'profesor']);
  const prof2UserId = await insertar(db, SQL_USUARIO, ['Martín', 'Díaz', 'martin.diaz@gestion.com', hash('prof123'), 'profesor']);
  const padre1Id = await insertar(db, SQL_USUARIO, ['Laura', 'Fernández', 'laura.fernandez@gestion.com', hash('padre123'), 'padre']);
  const padre2Id = await insertar(db, SQL_USUARIO, ['Jorge', 'Ibáñez', 'jorge.ibanez@gestion.com', hash('padre123'), 'padre']);

  const cursoA = await insertar(db, 'INSERT INTO cursos (nombre) VALUES (?)', ['1° A']);
  const cursoB = await insertar(db, 'INSERT INTO cursos (nombre) VALUES (?)', ['1° B']);
  await insertar(db, 'INSERT INTO cursos (nombre) VALUES (?)', ['2° A']);

  const matMate = await insertar(db, 'INSERT INTO materias (nombre) VALUES (?)', ['Matemática']);
  const matLengua = await insertar(db, 'INSERT INTO materias (nombre) VALUES (?)', ['Lengua']);
  await insertar(db, 'INSERT INTO materias (nombre) VALUES (?)', ['Historia']);
  await insertar(db, 'INSERT INTO materias (nombre) VALUES (?)', ['Biología']);

  const SQL_PROFESOR = 'INSERT INTO profesores (usuario_id, nombre, apellido, dni, email) VALUES (?, ?, ?, ?, ?)';
  const prof1Id = await insertar(db, SQL_PROFESOR, [prof1UserId, 'Carla', 'Gómez', '30111222', 'carla.gomez@gestion.com']);
  const prof2Id = await insertar(db, SQL_PROFESOR, [prof2UserId, 'Martín', 'Díaz', '30333444', 'martin.diaz@gestion.com']);

  const SQL_ASIGNACION = 'INSERT INTO asignaciones (profesor_id, materia_id, curso_id, dia, hora_inicio, hora_fin) VALUES (?, ?, ?, ?, ?, ?)';
  await insertar(db, SQL_ASIGNACION, [prof1Id, matMate, cursoA, 'Lunes', '08:00', '09:30']);
  await insertar(db, SQL_ASIGNACION, [prof2Id, matLengua, cursoA, 'Lunes', '09:30', '11:00']);
  await insertar(db, SQL_ASIGNACION, [prof1Id, matMate, cursoB, 'Martes', '08:00', '09:30']);

  const anio = new Date().getFullYear();
  const SQL_ALUMNO = 'INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES (?, ?, ?, ?, ?, ?)';
  const alumno1Id = await insertar(db, SQL_ALUMNO, [`${anio}-0001`, 'Sofía', 'Fernández', '45111222', '2015-03-12', cursoA]);
  const alumno2Id = await insertar(db, SQL_ALUMNO, [`${anio}-0002`, 'Bruno', 'Ibáñez', '45333444', '2015-07-22', cursoB]);

  const SQL_VINCULO = 'INSERT INTO padre_alumno (padre_usuario_id, alumno_id) VALUES (?, ?)';
  await insertar(db, SQL_VINCULO, [padre1Id, alumno1Id]);
  await insertar(db, SQL_VINCULO, [padre2Id, alumno2Id]);

  const deportes = [
    ['Fútbol', 'Martes', '16:00', '17:30'],
    ['Vóley', 'Martes', '17:00', '18:30'],
    ['Básquet', 'Miercoles', '16:00', '17:30'],
    ['Natación', 'Jueves', '15:00', '16:30'],
    ['Handball', 'Viernes', '16:00', '17:30']
  ];
  for (const d of deportes) {
    await insertar(db, 'INSERT INTO deportes (nombre, dia, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)', d);
  }

  for (const nombre of ['Recorrido 1 - Zona Norte', 'Recorrido 2 - Zona Sur', 'Recorrido 3 - Zona Este', 'Recorrido 4 - Zona Oeste']) {
    await insertar(db, 'INSERT INTO recorridos_transporte (nombre) VALUES (?)', [nombre]);
  }

  console.log('Datos de ejemplo cargados. Usuarios: admin@gestion.com / admin123, carla.gomez@gestion.com / prof123, laura.fernandez@gestion.com / padre123');
}

sembrar()
  .catch((err) => {
    console.error('Error al cargar los datos de ejemplo', err);
    process.exitCode = 1;
  });
