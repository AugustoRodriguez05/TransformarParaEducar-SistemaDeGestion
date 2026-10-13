// Detecta si un registro tiene datos asociados en otras tablas, para decidir si
// se puede eliminar. Las columnas se buscan en el momento: por clave foránea
// declarada hacia la tabla o por nombre (alumno_id, padre_usuario_id, ...). Así
// las tablas que se agreguen más adelante quedan cubiertas sin tocar las rutas.

async function columnasQueApuntan(db, tablaDestino, nombres) {
  const tablas = await db.all(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
  );
  const resultado = [];
  for (const { name } of tablas) {
    const columnas = new Set();
    for (const fk of await db.all(`PRAGMA foreign_key_list("${name}")`)) {
      if (fk.table === tablaDestino) columnas.add(fk.from);
    }
    for (const columna of await db.all(`PRAGMA table_info("${name}")`)) {
      if (nombres.test(columna.name)) columnas.add(columna.name);
    }
    for (const columna of columnas) resultado.push({ tabla: name, columna });
  }
  return resultado;
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
