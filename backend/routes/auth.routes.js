import express from 'express';
import bcrypt from 'bcryptjs';
import dbPromise from '../db.js';

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
    rol: usuario.rol
  });
});

export default router;
