import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPromise = open({
  filename: process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(__dirname, 'gestion.sqlite'),
  driver: sqlite3.Database
});

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

    CREATE TABLE IF NOT EXISTS deportes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT UNIQUE NOT NULL,
      dia TEXT NOT NULL CHECK (dia IN ('Lunes','Martes','Miercoles','Jueves','Viernes')),
      hora_inicio TEXT NOT NULL,
      hora_fin TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inscripciones_deportivas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alumno_id INTEGER NOT NULL REFERENCES alumnos(id),
      deporte_id INTEGER NOT NULL REFERENCES deportes(id),
      estado TEXT NOT NULL DEFAULT 'Activa' CHECK (estado IN ('Activa', 'Baja')),
      UNIQUE (alumno_id, deporte_id)
    );

    CREATE TABLE IF NOT EXISTS recorridos_transporte (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inscripciones_transporte (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alumno_id INTEGER NOT NULL REFERENCES alumnos(id),
      recorrido_id INTEGER NOT NULL REFERENCES recorridos_transporte(id),
      estado TEXT NOT NULL DEFAULT 'Activa' CHECK (estado IN ('Activa', 'Baja'))
    );

    CREATE TABLE IF NOT EXISTS inscripciones_comedor (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alumno_id INTEGER NOT NULL REFERENCES alumnos(id),
      estado TEXT NOT NULL DEFAULT 'Activa' CHECK (estado IN ('Activa', 'Baja'))
    );

    CREATE TABLE IF NOT EXISTS disponibilidad_profesor (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profesor_id INTEGER NOT NULL REFERENCES profesores(id),
      fecha TEXT NOT NULL,
      hora_inicio TEXT NOT NULL,
      hora_fin TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS turnos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      disponibilidad_id INTEGER NOT NULL REFERENCES disponibilidad_profesor(id),
      padre_usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      alumno_id INTEGER NOT NULL REFERENCES alumnos(id),
      motivo TEXT,
      estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Confirmado', 'Cancelado')),
      fecha_solicitud TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notificaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      mensaje TEXT NOT NULL,
      leida INTEGER NOT NULL DEFAULT 0,
      fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_alumnos_dni ON alumnos(dni);
    CREATE INDEX IF NOT EXISTS idx_alumnos_legajo ON alumnos(legajo);
    CREATE INDEX IF NOT EXISTS idx_alumnos_apellido ON alumnos(apellido);
  `);
}

export default dbPromise;
