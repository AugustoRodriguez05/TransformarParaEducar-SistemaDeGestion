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

// Activar o desactivar: un usuario inactivo no puede iniciar sesión. Si es un
// profesor o un alumno, el estado de su legajo cambia en la misma transacción.
// Orden de bloqueo (igual en profesores.routes.js y alumnos.routes.js):
// administradores, usuario, profesor o alumno.
router.patch('/:id/estado', async (req, res) => {
  const { estado } = req.body;
  if (!['Activo', 'Inactivo'].includes(estado)) {
    return res.status(400).json({ message: "El estado debe ser 'Activo' o 'Inactivo'" });
  }

  const db = await dbPromise;
  const resultado = await db.transaccion(async (tx) => {
    // Se bloquean los administradores activos para que dos bajas simultáneas
    // no dejen el sistema sin ninguno.
    const admins = estado === 'Inactivo'
      ? await tx.all("SELECT id FROM usuarios WHERE rol = 'administrador' AND activo = 1 ORDER BY id FOR UPDATE")
      : [];
    const usuario = await tx.get(`${SELECT_USUARIO} WHERE id = ? FOR UPDATE`, req.params.id);
    if (!usuario) return { status: 404, message: 'Usuario no encontrado' };

    if (estado === 'Inactivo') {
      const error = validarDesactivacion(usuario, req.user.id, admins.length);
      if (error) return { status: 400, message: error };
    }

    await tx.run('UPDATE usuarios SET activo = ? WHERE id = ?', [estado === 'Activo' ? 1 : 0, usuario.id]);
    if (usuario.rol === 'profesor') {
      await tx.run('UPDATE profesores SET estado = ? WHERE usuario_id = ?', [estado, usuario.id]);
    }
    if (usuario.rol === 'alumno') {
      await tx.run('UPDATE alumnos SET estado = ? WHERE usuario_id = ?', [estado, usuario.id]);
    }
    return { usuario: await tx.get(`${SELECT_USUARIO} WHERE id = ?`, usuario.id) };
  });

  if (resultado.status) return res.status(resultado.status).json({ message: resultado.message });
  res.json(resultado.usuario);
});

export default router;
