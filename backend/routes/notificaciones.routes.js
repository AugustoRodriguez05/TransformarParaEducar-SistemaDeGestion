import express from 'express';
import dbPromise from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/', async (req, res) => {
  const db = await dbPromise;
  const notificaciones = await db.all(
    'SELECT * FROM notificaciones WHERE usuario_id = ? ORDER BY id DESC LIMIT 50',
    req.user.id
  );
  const { noLeidas } = await db.get(
    'SELECT COUNT(*) as noLeidas FROM notificaciones WHERE usuario_id = ? AND leida = 0',
    req.user.id
  );
  res.json({ notificaciones, noLeidas });
});

router.post('/leer', async (req, res) => {
  const db = await dbPromise;
  await db.run('UPDATE notificaciones SET leida = 1 WHERE usuario_id = ?', req.user.id);
  res.json({ message: 'Notificaciones marcadas como leídas' });
});

export default router;
