import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  throw new Error('La variable de entorno JWT_SECRET no está definida. Definila en el archivo .env.');
}
const SECRETO = process.env.JWT_SECRET;
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
