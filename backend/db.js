import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPromise = open({
  filename: path.join(__dirname, 'gestion.sqlite'),
  driver: sqlite3.Database
});

function hash(plain) {
  return bcrypt.hashSync(plain, 8);
}

export async function initDb() {
  const db = await dbPromise;
  await db.exec('PRAGMA foreign_keys = ON;');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      apellido TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      rol TEXT NOT NULL CHECK (rol IN ('administrador', 'profesor', 'padre')),
      activo INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS cursos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS materias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profesores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER UNIQUE REFERENCES usuarios(id),
      nombre TEXT NOT NULL,
      apellido TEXT NOT NULL,
      dni TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo'))
    );

    CREATE TABLE IF NOT EXISTS alumnos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legajo TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      apellido TEXT NOT NULL,
      dni TEXT UNIQUE NOT NULL,
      fecha_nacimiento TEXT NOT NULL,
      curso_id INTEGER REFERENCES cursos(id),
      estado TEXT NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo')),
      inscripto_ciclo_lectivo INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS asignaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profesor_id INTEGER NOT NULL REFERENCES profesores(id),
      materia_id INTEGER NOT NULL REFERENCES materias(id),
      curso_id INTEGER NOT NULL REFERENCES cursos(id),
      dia TEXT NOT NULL CHECK (dia IN ('Lunes','Martes','Miercoles','Jueves','Viernes')),
      hora_inicio TEXT NOT NULL,
      hora_fin TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS padre_alumno (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      padre_usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      alumno_id INTEGER NOT NULL REFERENCES alumnos(id),
      UNIQUE (padre_usuario_id, alumno_id)
    );

    CREATE INDEX IF NOT EXISTS idx_alumnos_dni ON alumnos(dni);
    CREATE INDEX IF NOT EXISTS idx_alumnos_legajo ON alumnos(legajo);
    CREATE INDEX IF NOT EXISTS idx_alumnos_apellido ON alumnos(apellido);
  `);

  const countUsuarios = await db.get('SELECT COUNT(*) as count FROM usuarios');
  if (countUsuarios.count === 0) {
    const adminId = (await db.run(
      'INSERT INTO usuarios (nombre, apellido, email, password, rol) VALUES (?, ?, ?, ?, ?)',
      ['Admin', 'Gestión', 'admin@gestion.com', hash('admin123'), 'administrador']
    )).lastID;

    const prof1UserId = (await db.run(
      'INSERT INTO usuarios (nombre, apellido, email, password, rol) VALUES (?, ?, ?, ?, ?)',
      ['Carla', 'Gómez', 'carla.gomez@gestion.com', hash('prof123'), 'profesor']
    )).lastID;

    const prof2UserId = (await db.run(
      'INSERT INTO usuarios (nombre, apellido, email, password, rol) VALUES (?, ?, ?, ?, ?)',
      ['Martín', 'Díaz', 'martin.diaz@gestion.com', hash('prof123'), 'profesor']
    )).lastID;

    const padre1Id = (await db.run(
      'INSERT INTO usuarios (nombre, apellido, email, password, rol) VALUES (?, ?, ?, ?, ?)',
      ['Laura', 'Fernández', 'laura.fernandez@gestion.com', hash('padre123'), 'padre']
    )).lastID;

    const padre2Id = (await db.run(
      'INSERT INTO usuarios (nombre, apellido, email, password, rol) VALUES (?, ?, ?, ?, ?)',
      ['Jorge', 'Ibáñez', 'jorge.ibanez@gestion.com', hash('padre123'), 'padre']
    )).lastID;

    const cursoA = (await db.run('INSERT INTO cursos (nombre) VALUES (?)', ['1° A'])).lastID;
    const cursoB = (await db.run('INSERT INTO cursos (nombre) VALUES (?)', ['1° B'])).lastID;
    await db.run('INSERT INTO cursos (nombre) VALUES (?)', ['2° A']);

    const matMate = (await db.run('INSERT INTO materias (nombre) VALUES (?)', ['Matemática'])).lastID;
    const matLengua = (await db.run('INSERT INTO materias (nombre) VALUES (?)', ['Lengua'])).lastID;
    await db.run('INSERT INTO materias (nombre) VALUES (?)', ['Historia']);
    await db.run('INSERT INTO materias (nombre) VALUES (?)', ['Biología']);

    const prof1Id = (await db.run(
      'INSERT INTO profesores (usuario_id, nombre, apellido, dni, email) VALUES (?, ?, ?, ?, ?)',
      [prof1UserId, 'Carla', 'Gómez', '30111222', 'carla.gomez@gestion.com']
    )).lastID;

    const prof2Id = (await db.run(
      'INSERT INTO profesores (usuario_id, nombre, apellido, dni, email) VALUES (?, ?, ?, ?, ?)',
      [prof2UserId, 'Martín', 'Díaz', '30333444', 'martin.diaz@gestion.com']
    )).lastID;

    await db.run(
      'INSERT INTO asignaciones (profesor_id, materia_id, curso_id, dia, hora_inicio, hora_fin) VALUES (?, ?, ?, ?, ?, ?)',
      [prof1Id, matMate, cursoA, 'Lunes', '08:00', '09:30']
    );
    await db.run(
      'INSERT INTO asignaciones (profesor_id, materia_id, curso_id, dia, hora_inicio, hora_fin) VALUES (?, ?, ?, ?, ?, ?)',
      [prof2Id, matLengua, cursoA, 'Lunes', '09:30', '11:00']
    );
    await db.run(
      'INSERT INTO asignaciones (profesor_id, materia_id, curso_id, dia, hora_inicio, hora_fin) VALUES (?, ?, ?, ?, ?, ?)',
      [prof1Id, matMate, cursoB, 'Martes', '08:00', '09:30']
    );

    const alumno1Id = (await db.run(
      'INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES (?, ?, ?, ?, ?, ?)',
      ['2026-0001', 'Sofía', 'Fernández', '45111222', '2015-03-12', cursoA]
    )).lastID;

    const alumno2Id = (await db.run(
      'INSERT INTO alumnos (legajo, nombre, apellido, dni, fecha_nacimiento, curso_id) VALUES (?, ?, ?, ?, ?, ?)',
      ['2026-0002', 'Bruno', 'Ibáñez', '45333444', '2015-07-22', cursoB]
    )).lastID;

    await db.run(
      'INSERT INTO padre_alumno (padre_usuario_id, alumno_id) VALUES (?, ?)',
      [padre1Id, alumno1Id]
    );
    await db.run(
      'INSERT INTO padre_alumno (padre_usuario_id, alumno_id) VALUES (?, ?)',
      [padre2Id, alumno2Id]
    );

    void adminId;
  }
}

export default dbPromise;
