import db from './db.js';
import { enviarMail, mailConfigurado } from './mailer.js';
import { formatearImporte, generarFacturaPdf } from './factura-pdf.js';

// Mails a padres: recordatorio de pago (último día hábil del mes) y aviso de
// deuda (día 20). Cada envío queda en envios_mail, una fila por padre, tipo y
// período: lo que ya está Enviado no se vuelve a mandar y lo que dio Error se
// reintenta en la próxima pasada (la automática, hasta MAX_INTENTOS_AUTOMATICOS;
// el envío manual lo reintenta siempre).

const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';
export const DIA_AVISO_DEUDA = 20;
export const MAX_INTENTOS_AUTOMATICOS = 3;

// ---------- Fechas: funciones puras, probadas en envios.test.js ----------
// Las fechas son textos AAAA-MM-DD y los períodos AAAA-MM.

// Fecha de hoy en la Argentina (el servidor puede estar en otra zona horaria).
export function hoyEnArgentina(ahora = new Date()) {
  return ahora.toLocaleDateString('sv-SE', { timeZone: ZONA_HORARIA });
}

// Fecha y hora en la Argentina (AAAA-MM-DD HH:MM:SS), la que se guarda en cada envío.
export function ahoraEnArgentina(ahora = new Date()) {
  return ahora.toLocaleString('sv-SE', { timeZone: ZONA_HORARIA });
}

export const periodoDeFecha = (fecha) => fecha.slice(0, 7);

function partes(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return { anio, mes, dia };
}

const aTexto = (anio, mes, dia) => `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

export function esFinDeSemana(fecha) {
  const { anio, mes, dia } = partes(fecha);
  const diaSemana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return diaSemana === 0 || diaSemana === 6;
}

// Último día del período que no sea sábado, domingo ni feriado (feriados: fechas AAAA-MM-DD).
export function ultimoDiaHabil(periodo, feriados = []) {
  const [anio, mes] = periodo.split('-').map(Number);
  for (let dia = new Date(Date.UTC(anio, mes, 0)).getUTCDate(); dia >= 1; dia -= 1) {
    const fecha = aTexto(anio, mes, dia);
    if (!esFinDeSemana(fecha) && !feriados.includes(fecha)) return fecha;
  }
  return null;
}

export function esUltimoDiaHabil(fecha, feriados = []) {
  return ultimoDiaHabil(periodoDeFecha(fecha), feriados) === fecha;
}

export function esDiaDeDeuda(fecha) {
  return partes(fecha).dia === DIA_AVISO_DEUDA;
}

// ---------- Consultas ----------

export async function feriadosDelPeriodo(periodo) {
  const filas = await db.all('SELECT fecha FROM feriados WHERE fecha LIKE ?', `${periodo}-%`);
  return filas.map((f) => f.fecha);
}

// Padres activos con las cuotas del período de sus hijos (soloImpagas: las que no están 'Pagada'),
// cada cuota con su factura y sus ítems.
async function padresConCuotas(periodo, soloImpagas) {
  const filas = await db.all(
    `SELECT u.id as padre_id, u.nombre as padre_nombre, u.email,
            c.id as cuota_id, c.vencimiento, c.total, c.estado,
            a.legajo, a.apellido || ', ' || a.nombre as alumno, f.numero as factura
     FROM padre_alumno pa
     JOIN usuarios u ON u.id = pa.padre_usuario_id
     JOIN alumnos a ON a.id = pa.alumno_id
     JOIN cuotas c ON c.alumno_id = a.id
     LEFT JOIN facturas f ON f.cuota_id = c.id
     WHERE u.rol = 'padre' AND u.activo = 1 AND c.periodo = ?
       ${soloImpagas ? "AND c.estado <> 'Pagada'" : ''}
     ORDER BY u.id, a.apellido, a.nombre, c.id`,
    periodo
  );
  const items = filas.length === 0 ? [] : await db.all(
    'SELECT cuota_id, descripcion, importe, estado FROM items_cuota WHERE cuota_id = ANY(?::int[]) ORDER BY id',
    [[...new Set(filas.map((f) => f.cuota_id))]]
  );

  const padres = new Map();
  for (const f of filas) {
    if (!padres.has(f.padre_id)) {
      padres.set(f.padre_id, { id: f.padre_id, nombre: f.padre_nombre, email: f.email, cuotas: [] });
    }
    padres.get(f.padre_id).cuotas.push({
      ...f,
      periodo,
      items: items.filter((i) => i.cuota_id === f.cuota_id)
    });
  }
  return [...padres.values()];
}

// ---------- Armado de los mails ----------

const aCentavos = (importe) => Math.round(Number(importe) * 100);
const sumar = (importes) => importes.reduce((suma, importe) => suma + aCentavos(importe), 0) / 100;
const formatearFecha = (fecha) => fecha.split('-').reverse().join('/');

async function mailRecordatorio(padre, periodo) {
  const total = sumar(padre.cuotas.map((c) => c.total));
  const bloques = padre.cuotas.map((c) => [
    `${c.alumno}${c.factura ? ` - Factura ${c.factura}` : ''} - vence el ${formatearFecha(c.vencimiento)}`,
    ...c.items.map((i) => `  ${i.descripcion}: ${formatearImporte(i.importe)}`),
    `  Subtotal: ${formatearImporte(c.total)}`
  ].join('\n'));
  const adjuntos = [];
  for (const c of padre.cuotas.filter((cuota) => cuota.factura)) {
    adjuntos.push({
      filename: `factura-${c.factura}.pdf`,
      content: await generarFacturaPdf({ ...c, numero: c.factura })
    });
  }
  return {
    asunto: `Recordatorio de pago - Período ${periodo}`,
    texto: [
      `Hola ${padre.nombre}:`,
      `Te recordamos el total a pagar del período ${periodo}: ${formatearImporte(total)}.`,
      ...bloques,
      adjuntos.length > 0 ? 'Adjuntamos la factura de cada alumno.' : null,
      'Educar Para Transformar'
    ].filter(Boolean).join('\n\n'),
    adjuntos
  };
}

// Deuda: los ítems que no están 'Pagado'. Si ningún hijo debe nada, no hay mail (null).
function mailDeuda(padre, periodo) {
  const conDeuda = padre.cuotas
    .map((c) => ({ ...c, items: c.items.filter((i) => i.estado !== 'Pagado') }))
    .filter((c) => c.items.length > 0);
  if (conDeuda.length === 0) return null;

  const bloques = conDeuda.map((c) => [
    `${c.alumno} - venció el ${formatearFecha(c.vencimiento)}`,
    ...c.items.map((i) => `  ${i.descripcion}: ${formatearImporte(i.importe)} (${i.estado})`),
    `  Deuda: ${formatearImporte(sumar(c.items.map((i) => i.importe)))}`
  ].join('\n'));
  const total = sumar(conDeuda.flatMap((c) => c.items.map((i) => i.importe)));
  return {
    asunto: `Aviso de deuda - Período ${periodo}`,
    texto: [
      `Hola ${padre.nombre}:`,
      `Registramos una deuda de ${formatearImporte(total)} en las cuotas del período ${periodo}.`,
      ...bloques,
      'Si ya realizaste el pago, podés cargar el comprobante desde el Panel de familia.',
      'Educar Para Transformar'
    ].join('\n\n'),
    adjuntos: []
  };
}

// ---------- Envío y registro ----------

async function registrarEnvio(padreId, tipo, periodo, estado) {
  await db.run(
    `INSERT INTO envios_mail (padre_usuario_id, tipo, periodo, estado, intentos, fecha)
     VALUES (?, ?, ?, ?, 1, ?)
     ON CONFLICT (padre_usuario_id, tipo, periodo)
     DO UPDATE SET estado = EXCLUDED.estado, intentos = envios_mail.intentos + 1, fecha = EXCLUDED.fecha`,
    [padreId, tipo, periodo, estado, ahoraEnArgentina()]
  );
}

// Envíos en curso en este servidor ("tipo:período"): que el automático y uno
// manual no manden el mismo mail a la vez.
const enCurso = new Set();

/**
 * Manda el mail de cada padre (armar(padre, periodo) → { asunto, texto, adjuntos } o null).
 * automatico: no reintenta los que ya tienen MAX_INTENTOS_AUTOMATICOS intentos con Error.
 * Devuelve { periodo, enviados, errores, salteados, agotados } (salteados: ya estaban
 * Enviado; agotados: no se reintentaron por el límite), { sinConfigurar: true } si falta
 * el mail o { enCurso: true } si ya se está enviando.
 */
async function enviar(tipo, periodo, soloImpagas, armar, automatico) {
  if (!mailConfigurado()) {
    console.warn(`Mail no configurado (faltan SMTP_USER y SMTP_PASS): no se enviaron los mails de ${tipo} de ${periodo}.`);
    return { sinConfigurar: true };
  }
  const clave = `${tipo}:${periodo}`;
  if (enCurso.has(clave)) return { enCurso: true };
  enCurso.add(clave);
  try {
    const resultado = { periodo, enviados: 0, errores: 0, salteados: 0, agotados: 0 };
    const previos = await db.all(
      'SELECT padre_usuario_id, estado, intentos FROM envios_mail WHERE tipo = ? AND periodo = ?',
      [tipo, periodo]
    );
    const idsCon = (condicion) => new Set(previos.filter(condicion).map((e) => e.padre_usuario_id));
    const enviados = idsCon((e) => e.estado === 'Enviado');
    const agotados = automatico
      ? idsCon((e) => e.estado === 'Error' && e.intentos >= MAX_INTENTOS_AUTOMATICOS)
      : new Set();

    for (const padre of await padresConCuotas(periodo, soloImpagas)) {
      if (enviados.has(padre.id)) {
        resultado.salteados += 1;
        continue;
      }
      if (agotados.has(padre.id)) {
        resultado.agotados += 1;
        continue;
      }
      try {
        const mail = await armar(padre, periodo);
        if (!mail) continue;
        await enviarMail({ para: padre.email, ...mail });
        await registrarEnvio(padre.id, tipo, periodo, 'Enviado');
        resultado.enviados += 1;
      } catch (err) {
        console.error(`Error al enviar el mail de ${tipo} de ${periodo} a ${padre.email}`, err);
        await registrarEnvio(padre.id, tipo, periodo, 'Error');
        resultado.errores += 1;
      }
    }
    return resultado;
  } finally {
    enCurso.delete(clave);
  }
}

// A cada padre: el total del período de sus hijos, el detalle por ítem y la factura de cada uno.
export function enviarRecordatorios(periodo, { automatico = false } = {}) {
  return enviar('recordatorio', periodo, false, mailRecordatorio, automatico);
}

// A cada padre con cuotas del período que no están 'Pagada': la deuda por alumno e ítem.
export function enviarDeudas(periodo, { automatico = false } = {}) {
  return enviar('deuda', periodo, true, mailDeuda, automatico);
}
