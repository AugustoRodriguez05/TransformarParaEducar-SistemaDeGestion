import dbPromise from '../db.js';
import { leerToken } from '../token.js';

// Autenticación con token (JWT): el login entrega un token firmado y el cliente
// lo envía en la cabecera "Authorization: Bearer <token>". El backend vuelve a
// buscar al usuario en la base para obtener su rol (nunca confía en el cliente).
export async function authenticate(req, res, next) {
  const cabecera = req.header('authorization') || '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;
  const userId = token ? leerToken(token) : null;
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
