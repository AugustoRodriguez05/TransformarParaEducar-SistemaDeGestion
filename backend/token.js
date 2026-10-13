import jwt from 'jsonwebtoken';

// En desarrollo se usa una clave por defecto; en producción hay que definir JWT_SECRET en el .env.
const SECRETO = process.env.JWT_SECRET || 'clave-de-desarrollo-cambiar-en-produccion';
const DURACION = process.env.JWT_DURACION || '8h';

export function crearToken(usuario) {
  return jwt.sign({ id: usuario.id }, SECRETO, { expiresIn: DURACION });
}

// Devuelve el id del usuario si el token es válido; si no, devuelve null.
export function leerToken(token) {
  try {
    return jwt.verify(token, SECRETO).id;
  } catch {
    return null;
  }
}
