export async function notificar(db, usuarioId, mensaje) {
  await db.run('INSERT INTO notificaciones (usuario_id, mensaje) VALUES (?, ?)', [usuarioId, mensaje]);
}
