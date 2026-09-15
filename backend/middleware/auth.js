import dbPromise from '../db.js';

// Autenticación simple basada en cabeceras: el frontend reenvía el id del
// usuario logueado y el backend siempre vuelve a resolver su rol contra la
// base de datos (nunca confía en el rol que declare el cliente).
export async function authenticate(req, res, next) {
  const userId = parseInt(req.header('x-user-id'), 10);
  if (!userId) {
    return res.status(401).json({ message: 'No autenticado' });
  }

  const db = await dbPromise;
  const usuario = await db.get(
    'SELECT id, nombre, apellido, email, rol, activo FROM usuarios WHERE id = ?',
    userId
  );

  if (!usuario || !usuario.activo) {
    return res.status(401).json({ message: 'Sesión inválida' });
  }

  req.user = usuario;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      return res.status(403).json({ message: 'No autorizado para esta acción' });
    }
    next();
  };
}
