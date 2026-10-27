import pg from 'pg';
import { DIAS, NIVELES } from './constantes.js';
import { generarLegajo } from './legajos.js';

const { Pool } = pg;

// Conexión via DATABASE_URL (formato: postgres://user:pass@host:5432/dbname)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

// ---------- Compatibilidad con la API de sqlite ----------
// Las rutas usan db.get / db.all / db.run con parámetros posicionales (?).
// Este wrapper convierte los ? en $1, $2, $3... y adapta el resultado.

function convertirPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function normalizar(params) {
  if (params === undefined || params === null) return [];
  return Array.isArray(params) ? params : [params];
}

// Normaliza booleans de PostgreSQL (true/false) a enteros (1/0) para mantener
// compatibilidad con el código del frontend que compara activo === 1, leida === 0, etc.
function normalizarFila(fila) {
  if (!fila) return fila;
  const out = {};
  for (const [k, v] of Object.entries(fila)) {
    if (v === true) out[k] = 1;
    else if (v === false) out[k] = 0;
    else out[k] = v;
  }
  return out;
}

// get / all / run sobre un ejecutor: el pool (cualquier conexión libre) o una
// conexión fija dentro de una transacción.
function crearConsultas(ejecutor) {
  return {
    /** Devuelve la primera fila o undefined */
    async get(sql, params) {
      const res = await ejecutor.query(convertirPlaceholders(sql), normalizar(params));
      return res.rows[0] ? normalizarFila(res.rows[0]) : undefined;
    },

    /** Devuelve todas las filas */
    async all(sql, params) {
      const res = await ejecutor.query(convertirPlaceholders(sql), normalizar(params));
      return res.rows.map(normalizarFila);
    },

    /**
     * Ejecuta INSERT/UPDATE/DELETE.
     * Para INSERT devuelve { lastID } usando RETURNING id.
     * Para UPDATE/DELETE devuelve { changes }.
     */
    async run(sql, params) {
      const isInsert = /^\s*INSERT/i.test(sql);
      let finalSql = convertirPlaceholders(sql);
      if (isInsert && !/RETURNING/i.test(sql)) {
        finalSql += ' RETURNING id';
      }
      const res = await ejecutor.query(finalSql, normalizar(params));
      return {
        lastID: res.rows[0]?.id ?? null,
        changes: res.rowCount
      };
    }
  };
}

const db = {
  ...crearConsultas(pool),

  /** Ejecuta SQL multilínea (DDL, múltiples statements) */
  async exec(sql) {
    await pool.query(sql);
  },

  /**
   * Ejecuta fn(tx) en una transacción: tx tiene get / all / run sobre una misma
   * conexión. Si fn termina bien se confirma; si lanza un error no queda nada aplicado.
   */
  async transaccion(fn) {
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      const resultado = await fn(crearConsultas(cliente));
      await cliente.query('COMMIT');
      return resultado;
    } catch (err) {
      await cliente.query('ROLLBACK');
      throw err;
    } finally {
      cliente.release();
    }
  },

  /** Acceso al pool crudo */
  get pool() { return pool; }
};

export default db;

// ---------- Inicialización del esquema ----------

const SQL_DIAS = DIAS.map((d) => `'${d}'`).join(',');
const SQL_NIVELES = NIVELES.map((n) => `'${n}'`).join(',');

export async function initDb() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      apellido TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      rol TEXT NOT NULL CHECK (rol IN ('administrador', 'profesor', 'padre')),
      activo INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS cursos (
      id SERIAL PRIMARY KEY,
      nombre TEXT UNIQUE NOT NULL,
      nivel TEXT
    );

    CREATE TABLE IF NOT EXISTS materias (
      id SERIAL PRIMARY KEY,
      nombre TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profesores (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER UNIQUE REFERENCES usuarios(id),
      nombre TEXT NOT NULL,
      apellido TEXT NOT NULL,
      dni TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo'))
    );

    CREATE TABLE IF NOT EXISTS alumnos (
      id SERIAL PRIMARY KEY,
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
      id SERIAL PRIMARY KEY,
      profesor_id INTEGER NOT NULL REFERENCES profesores(id),
      materia_id INTEGER NOT NULL REFERENCES materias(id),
      curso_id INTEGER NOT NULL REFERENCES cursos(id),
      dia TEXT NOT NULL CHECK (dia IN (${SQL_DIAS})),
      hora_inicio TEXT NOT NULL,
      hora_fin TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS padre_alumno (
      id SERIAL PRIMARY KEY,
      padre_usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      alumno_id INTEGER NOT NULL REFERENCES alumnos(id),
      UNIQUE (padre_usuario_id, alumno_id)
    );

    CREATE TABLE IF NOT EXISTS deportes (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      dia TEXT NOT NULL CHECK (dia IN (${SQL_DIAS})),
      hora_inicio TEXT NOT NULL,
      hora_fin TEXT NOT NULL,
      profesor_id INTEGER REFERENCES profesores(id)
    );

    CREATE TABLE IF NOT EXISTS inscripciones_deportivas (
      id SERIAL PRIMARY KEY,
      alumno_id INTEGER NOT NULL REFERENCES alumnos(id),
      deporte_id INTEGER NOT NULL REFERENCES deportes(id),
      estado TEXT NOT NULL DEFAULT 'Activa' CHECK (estado IN ('Activa', 'Baja')),
      fecha_alta TEXT,
      fecha_baja TEXT,
      UNIQUE (alumno_id, deporte_id)
    );

    CREATE TABLE IF NOT EXISTS recorridos_transporte (
      id SERIAL PRIMARY KEY,
      nombre TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inscripciones_transporte (
      id SERIAL PRIMARY KEY,
      alumno_id INTEGER NOT NULL REFERENCES alumnos(id),
      recorrido_id INTEGER NOT NULL REFERENCES recorridos_transporte(id),
      estado TEXT NOT NULL DEFAULT 'Activa' CHECK (estado IN ('Activa', 'Baja')),
      fecha_alta TEXT,
      fecha_baja TEXT
    );

    CREATE TABLE IF NOT EXISTS inscripciones_comedor (
      id SERIAL PRIMARY KEY,
      alumno_id INTEGER NOT NULL REFERENCES alumnos(id),
      estado TEXT NOT NULL DEFAULT 'Activa' CHECK (estado IN ('Activa', 'Baja')),
      fecha_alta TEXT,
      fecha_baja TEXT
    );

    CREATE TABLE IF NOT EXISTS disponibilidad_profesor (
      id SERIAL PRIMARY KEY,
      profesor_id INTEGER NOT NULL REFERENCES profesores(id),
      fecha TEXT NOT NULL,
      hora_inicio TEXT NOT NULL,
      hora_fin TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS turnos (
      id SERIAL PRIMARY KEY,
      disponibilidad_id INTEGER NOT NULL REFERENCES disponibilidad_profesor(id),
      padre_usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      alumno_id INTEGER NOT NULL REFERENCES alumnos(id),
      motivo TEXT,
      estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Confirmado', 'Cancelado')),
      fecha_solicitud TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notificaciones (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      mensaje TEXT NOT NULL,
      leida INTEGER NOT NULL DEFAULT 0,
      fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS configuracion (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tarifas (
      id SERIAL PRIMARY KEY,
      tipo TEXT NOT NULL CHECK (tipo IN ('cuota', 'deporte', 'transporte', 'comedor')),
      referencia_id INTEGER,
      importe NUMERIC(12,2) NOT NULL CHECK (importe >= 0),
      vigente_desde TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cuotas (
      id SERIAL PRIMARY KEY,
      alumno_id INTEGER NOT NULL REFERENCES alumnos(id),
      periodo TEXT NOT NULL,
      vencimiento TEXT NOT NULL,
      total NUMERIC(12,2) NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Pago parcial', 'Pagada', 'Vencida')),
      UNIQUE (alumno_id, periodo)
    );

    CREATE TABLE IF NOT EXISTS items_cuota (
      id SERIAL PRIMARY KEY,
      cuota_id INTEGER NOT NULL REFERENCES cuotas(id),
      concepto TEXT NOT NULL CHECK (concepto IN ('cuota', 'deporte', 'transporte', 'comedor')),
      referencia_id INTEGER,
      descripcion TEXT NOT NULL,
      importe NUMERIC(12,2) NOT NULL CHECK (importe >= 0),
      estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Pago informado', 'Pagado'))
    );

    CREATE TABLE IF NOT EXISTS facturas (
      id SERIAL PRIMARY KEY,
      cuota_id INTEGER UNIQUE NOT NULL REFERENCES cuotas(id),
      numero TEXT UNIQUE NOT NULL,
      fecha_emision TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      total NUMERIC(12,2) NOT NULL,
      archivo_pdf TEXT
    );

    CREATE TABLE IF NOT EXISTS ordenes_pago (
      id SERIAL PRIMARY KEY,
      numero TEXT UNIQUE NOT NULL,
      factura_id INTEGER NOT NULL REFERENCES facturas(id),
      padre_usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      total NUMERIC(12,2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orden_pago_items (
      id SERIAL PRIMARY KEY,
      orden_pago_id INTEGER NOT NULL REFERENCES ordenes_pago(id),
      item_cuota_id INTEGER NOT NULL REFERENCES items_cuota(id),
      UNIQUE (orden_pago_id, item_cuota_id)
    );

    CREATE TABLE IF NOT EXISTS comprobantes_pago (
      id SERIAL PRIMARY KEY,
      factura_id INTEGER NOT NULL REFERENCES facturas(id),
      padre_usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      numero_operacion TEXT UNIQUE NOT NULL,
      importe NUMERIC(12,2) NOT NULL CHECK (importe > 0),
      fecha_transferencia TEXT NOT NULL,
      archivo TEXT NOT NULL,
      fecha_carga TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS codigos_recuperacion (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      codigo TEXT NOT NULL,
      vence TEXT NOT NULL,
      usado INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS envios_mail (
      id SERIAL PRIMARY KEY,
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

  // Columnas agregadas después de crear las tablas: solo se suman si faltan,
  // sin tocar los datos que ya existen.
  await db.exec(`
    ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS domicilio TEXT;
    ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS telefono TEXT;
    ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE profesores ADD COLUMN IF NOT EXISTS legajo TEXT UNIQUE;
    ALTER TABLE profesores ADD COLUMN IF NOT EXISTS especialidad TEXT;
    ALTER TABLE profesores ADD COLUMN IF NOT EXISTS telefono TEXT;
    ALTER TABLE deportes ADD COLUMN IF NOT EXISTS nivel TEXT CHECK (nivel IN (${SQL_NIVELES}));
  `);

  // Grupos de deportes: el mismo deporte puede tener varios grupos según nivel y
  // horario. No se repite la combinación nombre + nivel + día + hora de inicio
  // (nivel vacío = todos los niveles, y cuenta como un valor más). Primero se crea
  // el índice nuevo y después se quita el nombre único, en la misma transacción.
  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS deportes_grupo_unico
      ON deportes (nombre, COALESCE(nivel, ''), dia, hora_inicio);
    ALTER TABLE deportes DROP CONSTRAINT IF EXISTS deportes_nombre_key;
  `);

  // Índices (IF NOT EXISTS evita errores en reinicios)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_alumnos_dni ON alumnos(dni);
    CREATE INDEX IF NOT EXISTS idx_alumnos_legajo ON alumnos(legajo);
    CREATE INDEX IF NOT EXISTS idx_alumnos_apellido ON alumnos(apellido);
  `);

  // Ciclo lectivo inicial
  await db.exec(`
    INSERT INTO configuracion (clave, valor)
    VALUES ('ciclo_lectivo', '${new Date().getFullYear()}')
    ON CONFLICT (clave) DO NOTHING;
  `);

  // Migración: inscripto_ciclo_lectivo = 1 → año actual
  const fila = await db.get("SELECT valor FROM configuracion WHERE clave = 'ciclo_lectivo'");
  if (fila) {
    await db.run(
      'UPDATE alumnos SET inscripto_ciclo_lectivo = $1 WHERE inscripto_ciclo_lectivo = 1',
      [Number(fila.valor)]
    );
  }

  // Migración: legajo para los profesores cargados antes de que existiera el campo
  const sinLegajo = await db.all('SELECT id FROM profesores WHERE legajo IS NULL ORDER BY id');
  for (const { id } of sinLegajo) {
    const legajo = await generarLegajo(db, 'profesores');
    await db.run('UPDATE profesores SET legajo = ? WHERE id = ? AND legajo IS NULL', [legajo, id]);
  }
}
