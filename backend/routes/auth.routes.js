import { randomInt } from 'crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import dbPromise from '../db.js';
import { crearToken } from '../token.js';
import { authenticate } from '../middleware/auth.js';
import { enviarMail, mailConfigurado } from '../mailer.js';
import {
  CODIGO_INVALIDO, MINUTOS_VIGENCIA_CODIGO, validarCodigoRecuperacion, vencimientoCodigo
} from '../recuperacion.js';
import { limpiar, validarPasswordNueva } from '../validaciones.js';

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

// ---------- Recuperar contraseña (sin sesión) ----------

// Misma respuesta exista o no el email, para no revelar qué cuentas hay.
const MENSAJE_RECUPERAR = 'Si el email corresponde a un usuario activo, le enviamos un código para restablecer la contraseña.';

// Intentos fallidos por código (id en codigos_recuperacion). La tabla no tiene columna
// para contarlos, así que se llevan en memoria; al llegar al máximo el código se marca
// usado en la base, y eso sí queda aunque el servidor se reinicie.
const intentosFallidos = new Map();

// Crea un código de 6 dígitos (vence en 15 minutos, invalida los anteriores sin usar) y lo manda por mail.
router.post('/recuperar', async (req, res) => {
  if (!mailConfigurado()) {
    return res.status(503).json({ message: 'La recuperación de contraseña no está disponible: el envío de mails no está configurado.' });
  }
  const email = limpiar(req.body?.email);
  if (!email) return res.status(400).json({ message: 'Ingresá el email.' });

  const db = await dbPromise;
  const usuario = await db.get('SELECT id, nombre FROM usuarios WHERE email = ? AND activo = 1', email);
  if (usuario) {
    const codigo = String(randomInt(0, 1000000)).padStart(6, '0');
    await db.transaccion(async (tx) => {
      await tx.run('UPDATE codigos_recuperacion SET usado = 1 WHERE usuario_id = ? AND usado = 0', usuario.id);
      await tx.run(
        'INSERT INTO codigos_recuperacion (usuario_id, codigo, vence) VALUES (?, ?, ?)',
        [usuario.id, codigo, vencimientoCodigo()]
      );
    });
    try {
      await enviarMail({
        para: email,
        asunto: 'Código para restablecer tu contraseña',
        texto: [
          `Hola ${usuario.nombre}:`,
          `Tu código para restablecer la contraseña es ${codigo}. Vence en ${MINUTOS_VIGENCIA_CODIGO} minutos.`,
          'Si no lo pediste, ignorá este mail: tu contraseña sigue igual.',
          'Educar Para Transformar'
        ].join('\n\n')
      });
    } catch (err) {
      // No se avisa al cliente: la respuesta tiene que ser la misma que si el email no existiera.
      console.error('Error al enviar el código de recuperación', err);
    }
  }
  res.json({ message: MENSAJE_RECUPERAR });
});

// Cambia la contraseña con el código recibido. Hasta 5 intentos fallidos por código.
router.post('/restablecer', async (req, res) => {
  const email = limpiar(req.body?.email);
  if (!email) return res.status(400).json({ message: 'Ingresá el email.' });
  const { codigo, nueva } = req.body;
  const errorNueva = validarPasswordNueva(nueva);
  if (errorNueva) return res.status(400).json({ message: errorNueva });

  const db = await dbPromise;
  const usuario = await db.get('SELECT id FROM usuarios WHERE email = ? AND activo = 1', email);
  // Con los anteriores invalidados al pedir uno nuevo, queda a lo sumo un código sin usar.
  const registro = usuario && await db.get(
    'SELECT id, codigo, vence, usado FROM codigos_recuperacion WHERE usuario_id = ? AND usado = 0 ORDER BY id DESC LIMIT 1',
    usuario.id
  );
  const resultado = validarCodigoRecuperacion({
    ingresado: codigo,
    registro: registro || null,
    intentos: registro ? intentosFallidos.get(registro.id) || 0 : 0
  });

  if (!resultado.valido) {
    if (resultado.contarIntento) intentosFallidos.set(registro.id, (intentosFallidos.get(registro.id) || 0) + 1);
    if (resultado.agotado) {
      await db.run('UPDATE codigos_recuperacion SET usado = 1 WHERE id = ?', registro.id);
      intentosFallidos.delete(registro.id);
    }
    return res.status(400).json({ message: CODIGO_INVALIDO });
  }

  await db.transaccion(async (tx) => {
    await tx.run('UPDATE usuarios SET password = ? WHERE id = ?', [bcrypt.hashSync(String(nueva), 8), usuario.id]);
    await tx.run('UPDATE codigos_recuperacion SET usado = 1 WHERE id = ?', registro.id);
  });
  intentosFallidos.delete(registro.id);
  res.json({ message: 'Contraseña restablecida. Ya podés iniciar sesión con la nueva.' });
});

export default router;
