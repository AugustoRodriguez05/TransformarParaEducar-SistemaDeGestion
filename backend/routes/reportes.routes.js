import express from 'express';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import dbPromise from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.use(requireRole('administrador'));

async function reportePorCurso(db, cursoId) {
  const curso = await db.get('SELECT * FROM cursos WHERE id = ?', cursoId);
  if (!curso) return null;

  const filas = await db.all(
    `SELECT legajo, apellido, nombre FROM alumnos
     WHERE curso_id = ? AND estado = 'Activo'
     ORDER BY apellido, nombre`,
    cursoId
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

async function reportePorMateria(db, materiaId, cursoId) {
  const materia = await db.get('SELECT * FROM materias WHERE id = ?', materiaId);
  if (!materia) return null;

  const params = [materiaId];
  let filtroCurso = '';
  if (cursoId) {
    filtroCurso = 'AND asig.curso_id = ?';
    params.push(cursoId);
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
     ORDER BY c.nombre, a.apellido, a.nombre`,
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

function enviarPdf(res, reporte, nombreArchivo) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}.pdf"`);

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(res);

  const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const anchoCol = ancho / reporte.columnas.length;

  const dibujarEncabezado = () => {
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(10);
    reporte.columnas.forEach((col, i) => {
      doc.text(col.label, doc.page.margins.left + i * anchoCol, y, { width: anchoCol - 6 });
    });
    doc.moveTo(doc.page.margins.left, y + 14).lineTo(doc.page.margins.left + ancho, y + 14).stroke();
    doc.y = y + 20;
    doc.font('Helvetica').fontSize(10);
  };

  doc.font('Helvetica-Bold').fontSize(16).text(reporte.titulo);
  doc.font('Helvetica').fontSize(9).fillColor('#555555')
    .text(`Generado el ${new Date().toLocaleDateString('es-AR')} - ${reporte.filas.length} registro(s)`);
  doc.fillColor('#000000').moveDown();
  dibujarEncabezado();

  for (const fila of reporte.filas) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 20) {
      doc.addPage();
      dibujarEncabezado();
    }
    const y = doc.y;
    reporte.columnas.forEach((col, i) => {
      doc.text(String(fila[col.key] ?? ''), doc.page.margins.left + i * anchoCol, y, { width: anchoCol - 6 });
    });
    doc.y = y + 16;
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

// HU7 - Reporte por curso: legajo, apellido y nombre de los alumnos activos
router.get('/curso', async (req, res) => {
  const { curso_id } = req.query;
  if (!curso_id) return res.status(400).json({ message: 'Falta seleccionar un curso' });

  const db = await dbPromise;
  const reporte = await reportePorCurso(db, curso_id);
  if (!reporte) return res.status(404).json({ message: 'Curso no encontrado' });
  await responder(req, res, reporte, 'reporte-curso');
});

// HU7 - Reporte por materia: materia, profesor, alumno y legajo
router.get('/materia', async (req, res) => {
  const { materia_id, curso_id } = req.query;
  if (!materia_id) return res.status(400).json({ message: 'Falta seleccionar una materia' });

  const db = await dbPromise;
  const reporte = await reportePorMateria(db, materia_id, curso_id);
  if (!reporte) return res.status(404).json({ message: 'Materia no encontrada' });
  await responder(req, res, reporte, 'reporte-materia');
});

export default router;
