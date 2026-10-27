import express from 'express';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import dbPromise from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validarNivel } from '../validaciones.js';

const router = express.Router();

router.use(authenticate);
router.use(requireRole('administrador'));

// Un filtro que falta o un registro que no existe: se responde con este status.
const faltaFiltro = (message) => ({ status: 400, message });
const noEncontrado = (message) => ({ status: 404, message });

async function reportePorCurso(db, { curso_id }) {
  if (!curso_id) return faltaFiltro('Falta seleccionar un curso');
  const curso = await db.get('SELECT * FROM cursos WHERE id = ?', curso_id);
  if (!curso) return noEncontrado('Curso no encontrado');

  const filas = await db.all(
    `SELECT legajo, apellido, nombre FROM alumnos
     WHERE curso_id = ? AND estado = 'Activo'
     ORDER BY apellido, nombre`,
    curso_id
  );
  return {
    titulo: `Alumnos del curso ${curso.nombre}`,
    columnas: [
      { key: 'legajo', label: 'Legajo' },
      { key: 'apellido', label: 'Apellido' },
      { key: 'nombre', label: 'Nombre' }
    ],
    filas
  };
}

async function reportePorMateria(db, { materia_id, curso_id }) {
  if (!materia_id) return faltaFiltro('Falta seleccionar una materia');
  const materia = await db.get('SELECT * FROM materias WHERE id = ?', materia_id);
  if (!materia) return noEncontrado('Materia no encontrada');

  const params = [materia_id];
  let filtroCurso = '';
  if (curso_id) {
    filtroCurso = 'AND asig.curso_id = ?';
    params.push(curso_id);
  }

  const filas = await db.all(
    `SELECT DISTINCT m.nombre as materia,
            p.apellido || ', ' || p.nombre as profesor,
            c.nombre as curso,
            a.apellido || ', ' || a.nombre as alumno,
            a.legajo as legajo
     FROM asignaciones asig
     JOIN materias m ON m.id = asig.materia_id
     JOIN profesores p ON p.id = asig.profesor_id
     JOIN cursos c ON c.id = asig.curso_id
     JOIN alumnos a ON a.curso_id = asig.curso_id AND a.estado = 'Activo'
     WHERE asig.materia_id = ? ${filtroCurso}
     ORDER BY curso, alumno`,
    params
  );
  return {
    titulo: `Alumnos de ${materia.nombre}`,
    columnas: [
      { key: 'materia', label: 'Materia' },
      { key: 'profesor', label: 'Profesor' },
      { key: 'curso', label: 'Curso' },
      { key: 'alumno', label: 'Alumno' },
      { key: 'legajo', label: 'Legajo' }
    ],
    filas
  };
}

async function reporteDocentesPorNivel(db, { nivel }) {
  const error = validarNivel(nivel);
  if (error) return faltaFiltro(error);

  const filas = await db.all(
    `SELECT c.nivel as nivel,
            p.apellido || ', ' || p.nombre as profesor,
            STRING_AGG(DISTINCT m.nombre, ', ' ORDER BY m.nombre) as materias,
            STRING_AGG(DISTINCT c.nombre, ', ' ORDER BY c.nombre) as cursos
     FROM asignaciones asig
     JOIN profesores p ON p.id = asig.profesor_id AND p.estado = 'Activo'
     JOIN materias m ON m.id = asig.materia_id
     JOIN cursos c ON c.id = asig.curso_id
     WHERE c.nivel = ?
     GROUP BY c.nivel, p.id, p.apellido, p.nombre
     ORDER BY p.apellido, p.nombre`,
    nivel
  );
  return {
    titulo: `Docentes del nivel ${nivel}`,
    columnas: [
      { key: 'nivel', label: 'Nivel educativo' },
      { key: 'profesor', label: 'Profesor' },
      { key: 'materias', label: 'Materias a cargo' },
      { key: 'cursos', label: 'Cursos' }
    ],
    filas
  };
}

// Alumnos activos con inscripción deportiva activa; deporte y nivel filtran si vienen.
async function alumnosPorDeporte(db, { deporteId, nivel }) {
  const condiciones = ["i.estado = 'Activa'", "a.estado = 'Activo'"];
  const params = [];
  if (deporteId) {
    condiciones.push('d.id = ?');
    params.push(deporteId);
  }
  if (nivel) {
    condiciones.push('c.nivel = ?');
    params.push(nivel);
  }
  return db.all(
    `SELECT d.nombre as deporte,
            c.nivel as nivel,
            d.dia || ' ' || d.hora_inicio || ' a ' || d.hora_fin as horario,
            COALESCE(p.apellido || ', ' || p.nombre, '') as profesor,
            a.apellido || ', ' || a.nombre as alumno,
            c.nombre as curso
     FROM inscripciones_deportivas i
     JOIN deportes d ON d.id = i.deporte_id
     JOIN alumnos a ON a.id = i.alumno_id
     LEFT JOIN cursos c ON c.id = a.curso_id
     LEFT JOIN profesores p ON p.id = d.profesor_id
     WHERE ${condiciones.join(' AND ')}
     ORDER BY d.nombre, c.nivel, c.nombre, a.apellido, a.nombre`,
    params
  );
}

const COLUMNAS_DEPORTE = [
  { key: 'deporte', label: 'Deporte' },
  { key: 'alumno', label: 'Alumno' },
  { key: 'curso', label: 'Curso' },
  { key: 'nivel', label: 'Nivel educativo' }
];

async function buscarDeporte(db, deporteId) {
  return db.get('SELECT * FROM deportes WHERE id = ?', deporteId);
}

async function reportePorDeporte(db, { deporte_id }) {
  if (!deporte_id) return faltaFiltro('Falta seleccionar un deporte');
  const deporte = await buscarDeporte(db, deporte_id);
  if (!deporte) return noEncontrado('Deporte no encontrado');

  return {
    titulo: `Alumnos de ${deporte.nombre}`,
    columnas: COLUMNAS_DEPORTE,
    filas: await alumnosPorDeporte(db, { deporteId: deporte.id })
  };
}

async function reportePorDeporteYNivel(db, { deporte_id, nivel }) {
  if (!deporte_id) return faltaFiltro('Falta seleccionar un deporte');
  const error = validarNivel(nivel);
  if (error) return faltaFiltro(error);
  const deporte = await buscarDeporte(db, deporte_id);
  if (!deporte) return noEncontrado('Deporte no encontrado');

  return {
    titulo: `Alumnos de ${deporte.nombre} - nivel ${nivel}`,
    columnas: COLUMNAS_DEPORTE,
    filas: await alumnosPorDeporte(db, { deporteId: deporte.id, nivel })
  };
}

// Deporte y nivel son opcionales: sin filtros lista todos los deportes.
async function reporteDeportesDetallado(db, { deporte_id, nivel }) {
  const error = nivel ? validarNivel(nivel) : null;
  if (error) return faltaFiltro(error);
  if (deporte_id && !(await buscarDeporte(db, deporte_id))) return noEncontrado('Deporte no encontrado');

  return {
    titulo: 'Alumnos por deporte, nivel, horario y profesor',
    columnas: [
      { key: 'deporte', label: 'Deporte' },
      { key: 'nivel', label: 'Nivel' },
      { key: 'horario', label: 'Horario' },
      { key: 'profesor', label: 'Profesor a cargo' },
      { key: 'alumno', label: 'Alumno' },
      { key: 'curso', label: 'Curso' }
    ],
    filas: await alumnosPorDeporte(db, { deporteId: deporte_id, nivel })
  };
}

async function reportePorRecorrido(db, { recorrido_id }) {
  if (!recorrido_id) return faltaFiltro('Falta seleccionar un recorrido');
  const recorrido = await db.get('SELECT * FROM recorridos_transporte WHERE id = ?', recorrido_id);
  if (!recorrido) return noEncontrado('Recorrido no encontrado');

  const filas = await db.all(
    `SELECT r.nombre as recorrido,
            a.apellido || ', ' || a.nombre as alumno,
            c.nombre as curso,
            c.nivel as nivel,
            a.legajo as legajo
     FROM inscripciones_transporte i
     JOIN recorridos_transporte r ON r.id = i.recorrido_id
     JOIN alumnos a ON a.id = i.alumno_id AND a.estado = 'Activo'
     LEFT JOIN cursos c ON c.id = a.curso_id
     WHERE i.recorrido_id = ? AND i.estado = 'Activa'
     ORDER BY c.nivel, c.nombre, a.apellido, a.nombre`,
    recorrido.id
  );
  return {
    titulo: `Alumnos del ${recorrido.nombre}`,
    columnas: [
      { key: 'recorrido', label: 'Recorrido' },
      { key: 'alumno', label: 'Alumno' },
      { key: 'curso', label: 'Curso' },
      { key: 'nivel', label: 'Nivel' },
      { key: 'legajo', label: 'Legajo' }
    ],
    filas
  };
}

function enviarPdf(res, reporte, nombreArchivo) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}.pdf"`);

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(res);

  const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const anchoCol = ancho / reporte.columnas.length;
  // Alto de un renglón: el de la celda más alta, porque un texto largo ocupa varias líneas.
  const altoRenglon = (textos) => Math.max(...textos.map((t) => doc.heightOfString(t, { width: anchoCol - 6 })));

  const dibujarEncabezado = () => {
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(10);
    const alto = altoRenglon(reporte.columnas.map((col) => col.label));
    reporte.columnas.forEach((col, i) => {
      doc.text(col.label, doc.page.margins.left + i * anchoCol, y, { width: anchoCol - 6 });
    });
    doc.moveTo(doc.page.margins.left, y + alto + 2).lineTo(doc.page.margins.left + ancho, y + alto + 2).stroke();
    doc.y = y + alto + 8;
    doc.font('Helvetica').fontSize(10);
  };

  doc.font('Helvetica-Bold').fontSize(16).text(reporte.titulo);
  doc.font('Helvetica').fontSize(9).fillColor('#555555')
    .text(`Generado el ${new Date().toLocaleDateString('es-AR')} - ${reporte.filas.length} registro(s)`);
  doc.fillColor('#000000').moveDown();
  dibujarEncabezado();

  for (const fila of reporte.filas) {
    const textos = reporte.columnas.map((col) => String(fila[col.key] ?? ''));
    const alto = altoRenglon(textos);
    if (doc.y + alto > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      dibujarEncabezado();
    }
    const y = doc.y;
    textos.forEach((texto, i) => {
      doc.text(texto, doc.page.margins.left + i * anchoCol, y, { width: anchoCol - 6 });
    });
    doc.y = y + alto + 4;
  }

  doc.end();
}

async function enviarExcel(res, reporte, nombreArchivo) {
  const workbook = new ExcelJS.Workbook();
  const hoja = workbook.addWorksheet('Reporte');
  hoja.columns = reporte.columnas.map((c) => ({ header: c.label, key: c.key, width: 22 }));
  hoja.getRow(1).font = { bold: true };
  reporte.filas.forEach((f) => hoja.addRow(f));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

async function responder(req, res, reporte, nombreArchivo) {
  const { formato } = req.query;
  if (formato === 'pdf') return enviarPdf(res, reporte, nombreArchivo);
  if (formato === 'xlsx') return enviarExcel(res, reporte, nombreArchivo);
  res.json(reporte);
}

// Cada reporte arma { titulo, columnas, filas } con los filtros de la consulta, o
// devuelve { status, message } si falta un filtro o no existe lo pedido. Se
// responde en JSON, PDF o Excel según ?formato=.
function registrarReporte(ruta, armar) {
  router.get(`/${ruta}`, async (req, res) => {
    const db = await dbPromise;
    const reporte = await armar(db, req.query);
    if (reporte.status) return res.status(reporte.status).json({ message: reporte.message });
    await responder(req, res, reporte, `reporte-${ruta}`);
  });
}

// HU7 - Reporte por curso: legajo, apellido y nombre de los alumnos activos
registrarReporte('curso', reportePorCurso);
// HU7 - Reporte por materia: materia, profesor, alumno y legajo
registrarReporte('materia', reportePorMateria);
registrarReporte('docentes-nivel', reporteDocentesPorNivel);
registrarReporte('deporte', reportePorDeporte);
registrarReporte('deporte-nivel', reportePorDeporteYNivel);
registrarReporte('deporte-detalle', reporteDeportesDetallado);
registrarReporte('recorrido', reportePorRecorrido);

export default router;
