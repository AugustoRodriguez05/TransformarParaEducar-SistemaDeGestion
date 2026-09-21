import express from 'express';
import dbPromise from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { DIAS } from '../constantes.js';
import { obtenerCicloLectivo } from '../configuracion.js';

const router = express.Router();

router.use(authenticate);

router.get('/', async (req, res) => {
  const db = await dbPromise;
  res.json({ dias: DIAS, cicloLectivo: await obtenerCicloLectivo(db) });
});

router.put('/ciclo-lectivo', requireRole('administrador'), async (req, res) => {
  const ciclo = Number(req.body.ciclo_lectivo);
  if (!Number.isInteger(ciclo) || ciclo < 2000 || ciclo > 2100) {
    return res.status(400).json({ message: 'El ciclo lectivo debe ser un año válido (entre 2000 y 2100)' });
  }

  const db = await dbPromise;
  await db.run("UPDATE configuracion SET valor = ? WHERE clave = 'ciclo_lectivo'", String(ciclo));
  res.json({ dias: DIAS, cicloLectivo: ciclo });
});

export default router;
