import express from 'express';
import dbPromise from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/cursos', async (req, res) => {
  const db = await dbPromise;
  const cursos = await db.all('SELECT * FROM cursos ORDER BY nombre');
  res.json(cursos);
});

router.get('/materias', async (req, res) => {
  const db = await dbPromise;
  const materias = await db.all('SELECT * FROM materias ORDER BY nombre');
  res.json(materias);
});

export default router;
