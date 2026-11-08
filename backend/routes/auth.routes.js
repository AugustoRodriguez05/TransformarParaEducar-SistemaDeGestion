import express from 'express';
import bcrypt from 'bcryptjs';
import dbPromise from '../db.js';
import { crearToken } from '../token.js';
import { authenticate } from '../middleware/auth.js';
import { validarPasswordNueva } from '../validaciones.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email y contraseña son obligatorios' });
  }

  const db = await dbPromise;
  const usuario = await db.get('SELECT * FROM usuarios WHERE email = ?', email);

  if (!usuario || !bcrypt.compareSync(password, usuario.password)) {
    return res.status(401).json({ message: 'Credenciales inválidas' });
  }
  if (!usuario.activo) {
    return res.status(403).json({ message: 'Usuario bloqueado' });
  }

  res.json({
    id: usuario.id,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    email: usuario.email,
    rol: usuario.rol,
    token: crearToken(usuario)
  });
});

// Cambio de contraseña del usuario logueado (cualquier rol): verifica la actual.
router.post('/cambiar-password', authenticate, async (req, res) => {
  const { actual, nueva } = req.body;
  if (!actual) return res.status(400).json({ message: 'Ingresá la contraseña actual.' });
  const errorNueva = validarPasswordNueva(nueva);
  if (errorNueva) return res.status(400).json({ message: errorNueva });

  const db = await dbPromise;
  const usuario = await db.get('SELECT password FROM usuarios WHERE id = ?', req.user.id);
  // 400 y no 401: la sesión sigue siendo válida, lo que falló es el dato ingresado.
  if (!bcrypt.compareSync(String(actual), usuario.password)) {
    return res.status(400).json({ message: 'La contraseña actual no es correcta.' });
  }
  if (String(nueva) === String(actual)) {
    return res.status(400).json({ message: 'La contraseña nueva tiene que ser distinta de la actual.' });
  }

  await db.run('UPDATE usuarios SET password = ? WHERE id = ?', [bcrypt.hashSync(String(nueva), 8), req.user.id]);
  res.json({ message: 'Contraseña actualizada.' });
});

export default router;
