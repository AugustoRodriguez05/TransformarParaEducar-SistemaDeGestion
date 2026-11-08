import express from 'express';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import dbPromise from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { DIAS } from '../constantes.js';
import { esFechaValida, validarNivel } from '../validaciones.js';

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
    `SELECT c.nivel as nivel, c.nombre as curso, a.legajo, a.apellido, a.nombre
     FROM alumnos a
     JOIN cursos c ON c.id = a.curso_id
     WHERE a.curso_id = ? AND a.estado = 'Activo'
     ORDER BY a.apellido, a.nombre`,
    curso_id
  );
  return {
    titulo: `Alumnos del curso ${curso.nombre}`,
    columnas: [
      { key: 'nivel', label: 'Nivel educativo' },
      { key: 'curso', label: 'Curso' },
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
    `SELECT DISTINCT c.nivel as nivel,
            m.nombre as materia,
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
      { key: 'nivel', label: 'Nivel educativo' },
      { key: 'curso', label: 'Curso' },
      { key: 'materia', label: 'Materia' },
      { key: 'profesor', label: 'Profesor a cargo' },
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

// Cada deporte es un grupo (nombre, nivel y horario): "Fútbol (Primario, Martes 16:00 a 17:30)".
// Un grupo sin nivel es para todos los niveles.
const TODOS_LOS_NIVELES = 'Todos los niveles';
const SQL_NIVEL_GRUPO = `COALESCE(d.nivel, '${TODOS_LOS_NIVELES}')`;
const SQL_GRUPO = `d.nombre || ' (' || ${SQL_NIVEL_GRUPO} || ', ' || d.dia || ' ' || d.hora_inicio || ' a ' || d.hora_fin || ')'`;
const SQL_ORDEN_DIA = `array_position(ARRAY[${DIAS.map((d) => `'${d}'`).join(',')}]::text[], d.dia)`;

function textoGrupo(d) {
  return `${d.nombre} (${d.nivel || TODOS_LOS_NIVELES}, ${d.dia} ${d.hora_inicio} a ${d.hora_fin})`;
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
  // deporte identifica el grupo completo; grupo, solo nombre y nivel (para cuando el
  // horario va en su propia columna).
  return db.all(
    `SELECT ${SQL_GRUPO} as deporte,
            d.nombre || ' (' || ${SQL_NIVEL_GRUPO} || ')' as grupo,
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
     ORDER BY d.nombre, d.nivel NULLS FIRST, ${SQL_ORDEN_DIA}, d.hora_inicio, c.nivel, c.nombre, a.apellido, a.nombre`,
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
    titulo: `Alumnos de ${textoGrupo(deporte)}`,
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
    titulo: `Alumnos de ${textoGrupo(deporte)} - nivel ${nivel}`,
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
      { key: 'grupo', label: 'Deporte' },
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

// ---------- Reportes de pagos ----------
// Todos piden desde y hasta (AAAA-MM-DD). Los de cuotas e ítems toman las cuotas
// cuyo período (AAAA-MM) cae en el rango: del mes de "desde" al mes de "hasta".

function validarRangoFechas({ desde, hasta }) {
  if (!desde) return 'Falta seleccionar la fecha desde';
  if (!hasta) return 'Falta seleccionar la fecha hasta';
  if (!esFechaValida(desde)) return 'Desde: ingresá una fecha válida (AAAA-MM-DD).';
  if (!esFechaValida(hasta)) return 'Hasta: ingresá una fecha válida (AAAA-MM-DD).';
  if (desde > hasta) return 'La fecha desde no puede ser posterior a la fecha hasta.';
  return null;
}

const periodosDelRango = ({ desde, hasta }) => [desde.slice(0, 7), hasta.slice(0, 7)];
const textoRango = ({ desde, hasta }) => `del ${formatearFecha(desde)} al ${formatearFecha(hasta)}`;
const formatearFecha = (fecha) => fecha.split('-').reverse().join('/');

// Importes: se suman en centavos y se muestran como "$ 1.234,50" (pantalla, PDF y Excel).
const aCentavos = (importe) => Math.round(Number(importe) * 100);
const formatearImporte = (centavos) =>
  `$ ${(centavos / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// 1. Ingresos: comprobantes de pago con fecha de transferencia en el rango, y total general.
async function reporteIngresos(db, filtros) {
  const error = validarRangoFechas(filtros);
  if (error) return faltaFiltro(error);

  const comprobantes = await db.all(
    `SELECT cp.fecha_transferencia, a.apellido || ', ' || a.nombre as alumno, f.numero as factura,
            cp.numero_operacion, cp.importe
     FROM comprobantes_pago cp
     JOIN facturas f ON f.id = cp.factura_id
     JOIN cuotas c ON c.id = f.cuota_id
     JOIN alumnos a ON a.id = c.alumno_id
     WHERE cp.fecha_transferencia BETWEEN ? AND ?
     ORDER BY cp.fecha_transferencia, cp.id`,
    [filtros.desde, filtros.hasta]
  );
  const total = comprobantes.reduce((suma, c) => suma + aCentavos(c.importe), 0);
  const filas = comprobantes.map((c) => ({
    fecha: formatearFecha(c.fecha_transferencia),
    alumno: c.alumno,
    factura: c.factura,
    numero_operacion: c.numero_operacion,
    importe: formatearImporte(aCentavos(c.importe))
  }));
  if (filas.length > 0) filas.push({ fecha: 'Total general', importe: formatearImporte(total) });

  return {
    titulo: `Ingresos ${textoRango(filtros)}`,
    columnas: [
      { key: 'fecha', label: 'Fecha' },
      { key: 'alumno', label: 'Alumno' },
      { key: 'factura', label: 'Factura' },
      { key: 'numero_operacion', label: 'N.º de operación' },
      { key: 'importe', label: 'Importe' }
    ],
    filas
  };
}

// Cuotas del rango con los estados indicados, agrupadas por año y por alumno.
// pagado: lo ya cobrado de cada cuota (sus ítems en estado 'Pagado').
async function cuotasPorAnioYAlumno(db, filtros, estados) {
  return db.all(
    `SELECT SUBSTRING(c.periodo FROM 1 FOR 4) as anio,
            a.apellido || ', ' || a.nombre as alumno, a.legajo,
            STRING_AGG(c.periodo, ', ' ORDER BY c.periodo) as periodos,
            SUM(c.total) as total,
            SUM(COALESCE(p.pagado, 0)) as pagado
     FROM cuotas c
     JOIN alumnos a ON a.id = c.alumno_id
     LEFT JOIN (
       SELECT cuota_id, SUM(importe) as pagado FROM items_cuota WHERE estado = 'Pagado' GROUP BY cuota_id
     ) p ON p.cuota_id = c.id
     WHERE c.estado = ANY(?::text[]) AND c.periodo BETWEEN ? AND ?
     GROUP BY anio, a.id, a.apellido, a.nombre, a.legajo
     ORDER BY anio, a.apellido, a.nombre`,
    [estados, ...periodosDelRango(filtros)]
  );
}

// 2. Pagos completos: cuotas 'Pagada' del rango, por año y alumno, con su total.
async function reportePagosCompletos(db, filtros) {
  const error = validarRangoFechas(filtros);
  if (error) return faltaFiltro(error);

  const grupos = await cuotasPorAnioYAlumno(db, filtros, ['Pagada']);
  const total = grupos.reduce((suma, g) => suma + aCentavos(g.total), 0);
  const filas = grupos.map((g) => ({
    anio: g.anio, alumno: g.alumno, legajo: g.legajo, periodos: g.periodos, total: formatearImporte(aCentavos(g.total))
  }));
  if (filas.length > 0) filas.push({ anio: 'Total general', total: formatearImporte(total) });

  return {
    titulo: `Pagos completos ${textoRango(filtros)}`,
    columnas: [
      { key: 'anio', label: 'Año' },
      { key: 'alumno', label: 'Alumno' },
      { key: 'legajo', label: 'Legajo' },
      { key: 'periodos', label: 'Períodos' },
      { key: 'total', label: 'Total' }
    ],
    filas
  };
}

// 3. Pagos incompletos: cuotas 'Pendiente', 'Pago parcial' o 'Vencida' del rango,
// por año y alumno, con total, pagado y saldo.
async function reportePagosIncompletos(db, filtros) {
  const error = validarRangoFechas(filtros);
  if (error) return faltaFiltro(error);

  const grupos = await cuotasPorAnioYAlumno(db, filtros, ['Pendiente', 'Pago parcial', 'Vencida']);
  const sumas = { total: 0, pagado: 0 };
  const filas = grupos.map((g) => {
    const total = aCentavos(g.total);
    const pagado = aCentavos(g.pagado);
    sumas.total += total;
    sumas.pagado += pagado;
    return {
      anio: g.anio, alumno: g.alumno, legajo: g.legajo, periodos: g.periodos,
      total: formatearImporte(total), pagado: formatearImporte(pagado), saldo: formatearImporte(total - pagado)
    };
  });
  if (filas.length > 0) {
    filas.push({
      anio: 'Total general',
      total: formatearImporte(sumas.total),
      pagado: formatearImporte(sumas.pagado),
      saldo: formatearImporte(sumas.total - sumas.pagado)
    });
  }

  return {
    titulo: `Pagos incompletos ${textoRango(filtros)}`,
    columnas: [
      { key: 'anio', label: 'Año' },
      { key: 'alumno', label: 'Alumno' },
      { key: 'legajo', label: 'Legajo' },
      { key: 'periodos', label: 'Períodos' },
      { key: 'total', label: 'Total' },
      { key: 'pagado', label: 'Pagado' },
      { key: 'saldo', label: 'Saldo' }
    ],
    filas
  };
}

// 4. Pagos de deportes: ítems 'deporte' de las cuotas del rango. Deporte y nivel
// (el del curso del alumno) filtran si vienen.
async function reportePagosDeporte(db, filtros) {
  const error = validarRangoFechas(filtros) || (filtros.nivel ? validarNivel(filtros.nivel) : null);
  if (error) return faltaFiltro(error);
  if (filtros.deporte_id && !(await buscarDeporte(db, filtros.deporte_id))) return noEncontrado('Deporte no encontrado');

  const condiciones = ["i.concepto = 'deporte'", 'c.periodo BETWEEN ? AND ?'];
  const params = periodosDelRango(filtros);
  if (filtros.deporte_id) {
    condiciones.push('i.referencia_id = ?');
    params.push(filtros.deporte_id);
  }
  if (filtros.nivel) {
    condiciones.push('cu.nivel = ?');
    params.push(filtros.nivel);
  }
  // Si el deporte ya no existe, se muestra la descripción guardada en el ítem.
  const items = await db.all(
    `SELECT c.periodo,
            COALESCE(d.nombre || ' (' || ${SQL_NIVEL_GRUPO} || ')', i.descripcion) as deporte,
            cu.nivel as nivel,
            d.dia || ' ' || d.hora_inicio || ' a ' || d.hora_fin as horario,
            COALESCE(p.apellido || ', ' || p.nombre, '') as profesor,
            a.apellido || ', ' || a.nombre as alumno,
            i.importe, i.estado
     FROM items_cuota i
     JOIN cuotas c ON c.id = i.cuota_id
     JOIN alumnos a ON a.id = c.alumno_id
     LEFT JOIN cursos cu ON cu.id = a.curso_id
     LEFT JOIN deportes d ON d.id = i.referencia_id
     LEFT JOIN profesores p ON p.id = d.profesor_id
     WHERE ${condiciones.join(' AND ')}
     ORDER BY c.periodo, d.nombre, d.nivel NULLS FIRST, ${SQL_ORDEN_DIA}, d.hora_inicio, a.apellido, a.nombre`,
    params
  );

  return {
    titulo: `Pagos de deportes ${textoRango(filtros)}`,
    columnas: [
      { key: 'periodo', label: 'Período' },
      { key: 'deporte', label: 'Deporte' },
      { key: 'nivel', label: 'Nivel' },
      { key: 'horario', label: 'Horario' },
      { key: 'profesor', label: 'Profesor a cargo' },
      { key: 'alumno', label: 'Alumno' },
      { key: 'importe', label: 'Importe' },
      { key: 'estado', label: 'Estado' }
    ],
    filas: items.map((i) => ({ ...i, importe: formatearImporte(aCentavos(i.importe)) }))
  };
}

// 5. Pagos de transporte: ítems 'transporte' de las cuotas del rango; el recorrido filtra si viene.
async function reportePagosRecorrido(db, filtros) {
  const error = validarRangoFechas(filtros);
  if (error) return faltaFiltro(error);
  if (filtros.recorrido_id
    && !(await db.get('SELECT id FROM recorridos_transporte WHERE id = ?', filtros.recorrido_id))) {
    return noEncontrado('Recorrido no encontrado');
  }

  const condiciones = ["i.concepto = 'transporte'", 'c.periodo BETWEEN ? AND ?'];
  const params = periodosDelRango(filtros);
  if (filtros.recorrido_id) {
    condiciones.push('i.referencia_id = ?');
    params.push(filtros.recorrido_id);
  }
  // Si el recorrido ya no existe, se muestra la descripción guardada en el ítem.
  const items = await db.all(
    `SELECT c.periodo,
            COALESCE(r.nombre, i.descripcion) as recorrido,
            a.apellido || ', ' || a.nombre as alumno,
            i.importe, i.estado
     FROM items_cuota i
     JOIN cuotas c ON c.id = i.cuota_id
     JOIN alumnos a ON a.id = c.alumno_id
     LEFT JOIN recorridos_transporte r ON r.id = i.referencia_id
     WHERE ${condiciones.join(' AND ')}
     ORDER BY c.periodo, r.id, a.apellido, a.nombre`,
    params
  );

  return {
    titulo: `Pagos de transporte ${textoRango(filtros)}`,
    columnas: [
      { key: 'periodo', label: 'Período' },
      { key: 'recorrido', label: 'Recorrido' },
      { key: 'alumno', label: 'Alumno' },
      { key: 'importe', label: 'Importe' },
      { key: 'estado', label: 'Estado' }
    ],
    filas: items.map((i) => ({ ...i, importe: formatearImporte(aCentavos(i.importe)) }))
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
registrarReporte('ingresos', reporteIngresos);
registrarReporte('pagos-completos', reportePagosCompletos);
registrarReporte('pagos-incompletos', reportePagosIncompletos);
registrarReporte('pagos-deporte', reportePagosDeporte);
registrarReporte('pagos-recorrido', reportePagosRecorrido);

export default router;
