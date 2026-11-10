import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { initDb } from './db.js';
import { cargarDatosDemo } from './demo.js';
import {
  enviarDeudas, enviarRecordatorios, esDiaDeDeuda, esUltimoDiaHabil, feriadosDelPeriodo, hoyEnArgentina, periodoDeFecha
} from './envios.js';

import authRouter from './routes/auth.routes.js';
import alumnosRouter from './routes/alumnos.routes.js';
import profesoresRouter from './routes/profesores.routes.js';
import familiaRouter from './routes/familia.routes.js';
import catalogosRouter from './routes/catalogos.routes.js';
import padresRouter from './routes/padres.routes.js';
import configRouter from './routes/config.routes.js';
import serviciosRouter from './routes/servicios.routes.js';
import reportesRouter from './routes/reportes.routes.js';
import turnosRouter from './routes/turnos.routes.js';
import notificacionesRouter from './routes/notificaciones.routes.js';
import usuariosRouter from './routes/usuarios.routes.js';
import miPanelRouter from './routes/mi-panel.routes.js';
import cuotasRouter from './routes/cuotas.routes.js';
import pagosRouter from './routes/pagos.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
// Pagos va antes del express.json() general: lee su propio JSON, y la carga de
// comprobantes acepta hasta 5 MB (el general corta en 100 KB).
app.use('/api/pagos', pagosRouter);
app.use(express.json());

const baseLista = initDb().then(() => {
  console.log('Base de datos PostgreSQL inicializada correctamente.');
}).catch((err) => {
  console.error('Error al inicializar la base de datos', err);
});

// Datos de ejemplo de cuotas y pagos: solo si todavía no hay ninguna cuota (ver demo.js).
// Si fallan, se registra el error y el servidor sigue funcionando.
baseLista.then(async () => {
  try {
    await cargarDatosDemo(db);
  } catch (err) {
    console.error('Error al cargar los datos de ejemplo', err);
  }
});

app.use('/api/auth', authRouter);
app.use('/api/alumnos', alumnosRouter);
app.use('/api/profesores', profesoresRouter);
app.use('/api/familia', familiaRouter);
app.use('/api/padres', padresRouter);
app.use('/api/config', configRouter);
app.use('/api/servicios', serviciosRouter);
app.use('/api/reportes', reportesRouter);
app.use('/api/turnos', turnosRouter);
app.use('/api/notificaciones', notificacionesRouter);
app.use('/api/usuarios', usuariosRouter);
app.use('/api/mi-panel', miPanelRouter);
app.use('/api/cuotas', cuotasRouter);
app.use('/api', catalogosRouter);

if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(__dirname, '..', 'dist');
  app.use(express.static(distDir));
  app.get('{*path}', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

// Mails automáticos a padres: el último día hábil del mes, el recordatorio de
// pago; el día 20, el aviso de deuda (los dos del mes actual). Lo que ya se
// envió no se repite, así que revisar varias veces el mismo día no duplica mails.
const UNA_HORA = 60 * 60 * 1000;

async function revisarEnvios() {
  try {
    await baseLista;
    const hoy = hoyEnArgentina();
    const periodo = periodoDeFecha(hoy);
    const resultados = [];
    const opciones = { automatico: true };
    if (esUltimoDiaHabil(hoy, await feriadosDelPeriodo(periodo))) {
      resultados.push(['recordatorio', await enviarRecordatorios(periodo, opciones)]);
    }
    if (esDiaDeDeuda(hoy)) resultados.push(['deuda', await enviarDeudas(periodo, opciones)]);
    for (const [tipo, r] of resultados) {
      if (r.enviados || r.errores) console.log(`Mails de ${tipo} de ${periodo}: ${r.enviados} enviado(s), ${r.errores} con error.`);
    }
  } catch (err) {
    console.error('Error al revisar los mails automáticos', err);
  }
}

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Backend de gestión corriendo en http://localhost:${PORT}`);
  void revisarEnvios();
  setInterval(revisarEnvios, UNA_HORA);
});

