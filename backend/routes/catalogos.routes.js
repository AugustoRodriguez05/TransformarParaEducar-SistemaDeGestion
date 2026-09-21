import express from 'express';
import dbPromise from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

// Catálogos simples (cursos y materias): cualquier usuario autenticado los lee,
// solo el administrador los modifica. No se puede borrar lo que está en uso.
function registrarCatalogo({ ruta, tabla, etiqueta, usos }) {
  router.get(`/${ruta}`, async (req, res) => {
    const db = await dbPromise;
    res.json(await db.all(`SELECT * FROM ${tabla} ORDER BY nombre`));
  });

  router.post(`/${ruta}`, requireRole('administrador'), async (req, res) => {
    const nombre = String(req.body.nombre || '').trim();
    if (!nombre) return res.status(400).json({ message: 'El nombre es obligatorio' });

    const db = await dbPromise;
    if (await db.get(`SELECT id FROM ${tabla} WHERE nombre = ?`, nombre)) {
      return res.status(409).json({ message: `Ya existe ${etiqueta} con ese nombre` });
    }
    const result = await db.run(`INSERT INTO ${tabla} (nombre) VALUES (?)`, nombre);
    res.status(201).json(await db.get(`SELECT * FROM ${tabla} WHERE id = ?`, result.lastID));
  });

  router.put(`/${ruta}/:id`, requireRole('administrador'), async (req, res) => {
    const nombre = String(req.body.nombre || '').trim();
    if (!nombre) return res.status(400).json({ message: 'El nombre es obligatorio' });

    const db = await dbPromise;
    if (!(await db.get(`SELECT id FROM ${tabla} WHERE id = ?`, req.params.id))) {
      return res.status(404).json({ message: 'No encontrado' });
    }
    if (await db.get(`SELECT id FROM ${tabla} WHERE nombre = ? AND id != ?`, [nombre, req.params.id])) {
      return res.status(409).json({ message: `Ya existe ${etiqueta} con ese nombre` });
    }
    await db.run(`UPDATE ${tabla} SET nombre = ? WHERE id = ?`, [nombre, req.params.id]);
    res.json(await db.get(`SELECT * FROM ${tabla} WHERE id = ?`, req.params.id));
  });

  router.delete(`/${ruta}/:id`, requireRole('administrador'), async (req, res) => {
    const db = await dbPromise;
    if (!(await db.get(`SELECT id FROM ${tabla} WHERE id = ?`, req.params.id))) {
      return res.status(404).json({ message: 'No encontrado' });
    }
    for (const sql of usos) {
      if (await db.get(sql, req.params.id)) {
        return res.status(409).json({ message: 'No se puede eliminar: está en uso (tiene datos asociados)' });
      }
    }
    await db.run(`DELETE FROM ${tabla} WHERE id = ?`, req.params.id);
    res.json({ message: 'Eliminado' });
  });
}

registrarCatalogo({
  ruta: 'cursos',
  tabla: 'cursos',
  etiqueta: 'un curso',
  usos: [
    'SELECT id FROM alumnos WHERE curso_id = ?',
    'SELECT id FROM asignaciones WHERE curso_id = ?'
  ]
});

registrarCatalogo({
  ruta: 'materias',
  tabla: 'materias',
  etiqueta: 'una materia',
  usos: ['SELECT id FROM asignaciones WHERE materia_id = ?']
});

registrarCatalogo({
  ruta: 'recorridos',
  tabla: 'recorridos_transporte',
  etiqueta: 'un recorrido',
  usos: ['SELECT id FROM inscripciones_transporte WHERE recorrido_id = ?']
});

export default router;
