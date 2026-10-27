import express from 'express';
import dbPromise from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validarDesactivacion } from '../validaciones.js';

const router = express.Router();

router.use(authenticate);
router.use(requireRole('administrador'));

// Nunca se selecciona la contraseña.
const SELECT_USUARIO = 'SELECT id, nombre, apellido, email, rol, activo FROM usuarios';

router.get('/', async (req, res) => {
  const db = await dbPromise;
  res.json(await db.all(`${SELECT_USUARIO} ORDER BY apellido, nombre`));
});

// Activar o desactivar: un usuario inactivo no puede iniciar sesión.
router.patch('/:id/estado', async (req, res) => {
  const { estado } = req.body;
  if (!['Activo', 'Inactivo'].includes(estado)) {
    return res.status(400).json({ message: "El estado debe ser 'Activo' o 'Inactivo'" });
  }

  const db = await dbPromise;
  const usuario = await db.get(`${SELECT_USUARIO} WHERE id = ?`, req.params.id);
  if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });

  if (estado === 'Inactivo') {
    const { cantidad } = await db.get(
      "SELECT COUNT(*)::int as cantidad FROM usuarios WHERE rol = 'administrador' AND activo = 1"
    );
    const error = validarDesactivacion(usuario, req.user.id, cantidad);
    if (error) return res.status(400).json({ message: error });
  }

  await db.run('UPDATE usuarios SET activo = ? WHERE id = ?', [estado === 'Activo' ? 1 : 0, usuario.id]);
  res.json(await db.get(`${SELECT_USUARIO} WHERE id = ?`, usuario.id));
});

export default router;
