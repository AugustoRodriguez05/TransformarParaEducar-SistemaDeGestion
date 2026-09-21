import express from 'express';
import cors from 'cors';
import { initDb } from './db.js';

import authRouter from './routes/auth.routes.js';
import alumnosRouter from './routes/alumnos.routes.js';
import profesoresRouter from './routes/profesores.routes.js';
import familiaRouter from './routes/familia.routes.js';
import catalogosRouter from './routes/catalogos.routes.js';
import serviciosRouter from './routes/servicios.routes.js';
import reportesRouter from './routes/reportes.routes.js';
import turnosRouter from './routes/turnos.routes.js';
import notificacionesRouter from './routes/notificaciones.routes.js';

const app = express();
app.use(cors());
app.use(express.json());

initDb().then(() => {
  console.log('Base de datos SQLite inicializada correctamente.');
}).catch((err) => {
  console.error('Error al inicializar la base de datos', err);
});

app.use('/api/auth', authRouter);
app.use('/api/alumnos', alumnosRouter);
app.use('/api/profesores', profesoresRouter);
app.use('/api/familia', familiaRouter);
app.use('/api/servicios', serviciosRouter);
app.use('/api/reportes', reportesRouter);
app.use('/api/turnos', turnosRouter);
app.use('/api/notificaciones', notificacionesRouter);
app.use('/api', catalogosRouter);

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Backend de gestión corriendo en http://localhost:${PORT}`);
});
