export async function obtenerCicloLectivo(db) {
  const fila = await db.get("SELECT valor FROM configuracion WHERE clave = 'ciclo_lectivo'");
  return Number(fila.valor);
}
