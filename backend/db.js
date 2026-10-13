import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { DIAS } from './constantes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPromise = open({
  filename: process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(__dirname, 'gestion.sqlite'),
  driver: sqlite3.Database
});

const SQL_DIAS = DIAS.map((d) => `'${d}'`).join(',');

// Agrega una columna solo si todavía no existe (las bases que ya tienen datos no la tienen).
async function agregarColumna(db, tabla, columna, definicion) {
  const columnas = await db.all(`PRAGMA table_info(${tabla})`);
  if (!columnas.some((c) => c.name === columna)) {
    await db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
  }
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
      dia TEXT NOT NULL CHECK (dia IN (${SQL_DIAS})),
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
      dia TEXT NOT NULL CHECK (dia IN (${SQL_DIAS})),
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

    CREATE TABLE IF NOT EXISTS configuracion (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_alumnos_dni ON alumnos(dni);
    CREATE INDEX IF NOT EXISTS idx_alumnos_legajo ON alumnos(legajo);
    CREATE INDEX IF NOT EXISTS idx_alumnos_apellido ON alumnos(apellido);
  `);

  await db.run(
    "INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('ciclo_lectivo', ?)",
    String(new Date().getFullYear())
  );

  // Migración: antes este campo era un 0/1; ahora guarda el año del ciclo en que se inscribió.
  const { valor } = await db.get("SELECT valor FROM configuracion WHERE clave = 'ciclo_lectivo'");
  await db.run('UPDATE alumnos SET inscripto_ciclo_lectivo = ? WHERE inscripto_ciclo_lectivo = 1', Number(valor));
  // ---------- Parte 3: cuotas, facturas y pagos ----------

  // Columnas nuevas en tablas existentes
  await agregarColumna(db, 'cursos', 'nivel', 'TEXT');
  await agregarColumna(db, 'deportes', 'profesor_id', 'INTEGER REFERENCES profesores(id)');
  for (const tabla of ['inscripciones_deportivas', 'inscripciones_transporte', 'inscripciones_comedor']) {
    await agregarColumna(db, tabla, 'fecha_alta', 'TEXT');
    await agregarColumna(db, tabla, 'fecha_baja', 'TEXT');
  }

  // Tablas nuevas
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tarifas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL CHECK (tipo IN ('cuota', 'deporte', 'transporte', 'comedor')),
      referencia_id INTEGER,
      importe REAL NOT NULL CHECK (importe >= 0),
      vigente_desde TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cuotas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alumno_id INTEGER NOT NULL REFERENCES alumnos(id),
      periodo TEXT NOT NULL,
      vencimiento TEXT NOT NULL,
      total REAL NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Pago parcial', 'Pagada', 'Vencida')),
      UNIQUE (alumno_id, periodo)
    );

    CREATE TABLE IF NOT EXISTS items_cuota (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cuota_id INTEGER NOT NULL REFERENCES cuotas(id),
      concepto TEXT NOT NULL CHECK (concepto IN ('cuota', 'deporte', 'transporte', 'comedor')),
      referencia_id INTEGER,
      descripcion TEXT NOT NULL,
      importe REAL NOT NULL CHECK (importe >= 0),
      estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Pago informado', 'Pagado'))
    );

    CREATE TABLE IF NOT EXISTS facturas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cuota_id INTEGER UNIQUE NOT NULL REFERENCES cuotas(id),
      numero TEXT UNIQUE NOT NULL,
      fecha_emision TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      total REAL NOT NULL,
      archivo_pdf TEXT
    );

    CREATE TABLE IF NOT EXISTS ordenes_pago (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT UNIQUE NOT NULL,
      factura_id INTEGER NOT NULL REFERENCES facturas(id),
      padre_usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orden_pago_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orden_pago_id INTEGER NOT NULL REFERENCES ordenes_pago(id),
      item_cuota_id INTEGER NOT NULL REFERENCES items_cuota(id),
      UNIQUE (orden_pago_id, item_cuota_id)
    );

    CREATE TABLE IF NOT EXISTS comprobantes_pago (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      factura_id INTEGER NOT NULL REFERENCES facturas(id),
      padre_usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      numero_operacion TEXT UNIQUE NOT NULL,
      importe REAL NOT NULL CHECK (importe > 0),
      fecha_transferencia TEXT NOT NULL,
      archivo TEXT NOT NULL,
      fecha_carga TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS codigos_recuperacion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      codigo TEXT NOT NULL,
      vence TEXT NOT NULL,
      usado INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS envios_mail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      padre_usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      tipo TEXT NOT NULL CHECK (tipo IN ('recordatorio', 'deuda')),
      periodo TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Enviado', 'Error')),
      intentos INTEGER NOT NULL DEFAULT 0,
      fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (padre_usuario_id, tipo, periodo)
    );

    CREATE TABLE IF NOT EXISTS feriados (
      fecha TEXT PRIMARY KEY,
      descripcion TEXT NOT NULL
    );
  `);
}

export default dbPromise;
