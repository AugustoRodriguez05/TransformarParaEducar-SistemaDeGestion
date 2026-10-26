// Detecta si un registro tiene datos asociados en otras tablas, para decidir si
// se puede eliminar. Usa information_schema de PostgreSQL en lugar de PRAGMA de SQLite.

async function columnasQueApuntan(db, tablaDestino, nombres) {
  // 1. Columnas que tienen FK declarada hacia tablaDestino
  const fks = await db.all(
    `SELECT kcu.table_name AS tabla, kcu.column_name AS columna
     FROM information_schema.referential_constraints rc
     JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_name = rc.constraint_name
       AND kcu.constraint_schema = rc.constraint_schema
     JOIN information_schema.key_column_usage rku
       ON rku.constraint_name = rc.unique_constraint_name
       AND rku.constraint_schema = rc.unique_constraint_schema
     WHERE rku.table_name = ?
       AND kcu.table_schema = 'public'`,
    tablaDestino
  );

  // 2. Columnas que coinciden con el patrón de nombre (alumno_id, padre_usuario_id, etc.)
  const porNombre = await db.all(
    `SELECT table_name AS tabla, column_name AS columna
     FROM information_schema.columns
     WHERE table_schema = 'public'`,
  );

  const resultado = new Map(); // clave "tabla.columna" para deduplicar

  for (const { tabla, columna } of fks) {
    resultado.set(`${tabla}.${columna}`, { tabla, columna });
  }
  for (const { tabla, columna } of porNombre) {
    if (nombres.test(columna)) {
      resultado.set(`${tabla}.${columna}`, { tabla, columna });
    }
  }

  return [...resultado.values()];
}

// tabla: la tabla del registro; nombres: patrón de las columnas que lo referencian;
// excluir: tablas que no cuentan como datos asociados.
export async function tieneDatosAsociados(db, { tabla, nombres, id, excluir = [] }) {
  for (const { tabla: otra, columna } of await columnasQueApuntan(db, tabla, nombres)) {
    if (excluir.includes(otra)) continue;
    if (await db.get(`SELECT 1 FROM "${otra}" WHERE "${columna}" = ? LIMIT 1`, id)) return true;
  }
  return false;
}

export const COLUMNAS_ALUMNO = /(^|_)alumno_id$/;
export const COLUMNAS_PROFESOR = /(^|_)profesor_id$/;
export const COLUMNAS_USUARIO = /(^|_)usuario_id$/;
