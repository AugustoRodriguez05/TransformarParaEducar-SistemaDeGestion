// Mismas reglas que backend/validaciones.js, para avisar antes de enviar.
// Cada validar* devuelve un mensaje de error o null si el dato es válido.
// Los mensajes se muestran junto al campo, por eso no lo nombran.

const NOMBRE_PERSONA = /^\p{L}[\p{L} '’]*$/u;
const FORMATO_DNI = /^\d{7,8}$/;
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export const MAX_NOMBRE_CATALOGO = 60;
export const MAX_MOTIVO = 200;
export const MIN_PASSWORD = 6;

export function limpiar(valor) {
  return valor === undefined || valor === null ? '' : String(valor).trim();
}

// Recibe { campo: error o null } y deja solo los campos con error.
export function soloErrores(errores) {
  return Object.fromEntries(Object.entries(errores).filter(([, error]) => error));
}

// campo: 'nombre' o 'apellido'
export function validarNombrePersona(valor, campo) {
  if (!valor) return `Ingresá el ${campo}.`;
  if (!NOMBRE_PERSONA.test(valor)) return 'Usá solo letras.';
  if (valor.length < 2 || valor.length > 50) return 'Tiene que tener entre 2 y 50 letras.';
  return null;
}

export function validarDni(valor) {
  if (!valor) return 'Ingresá el DNI.';
  if (!FORMATO_DNI.test(valor)) return 'Ingresá 7 u 8 números, sin puntos.';
  return null;
}

export function validarEmail(valor) {
  if (!valor) return 'Ingresá el email.';
  if (valor.length > 100 || !FORMATO_EMAIL.test(valor)) {
    return 'Ingresá un email válido, por ejemplo nombre@correo.com.';
  }
  return null;
}

export function validarPasswordNueva(valor) {
  const texto = valor === undefined || valor === null ? '' : String(valor);
  if (!texto.trim()) return 'Ingresá la contraseña.';
  if (texto.length < MIN_PASSWORD) return `Usá al menos ${MIN_PASSWORD} caracteres.`;
  return null;
}

// Formato AAAA-MM-DD y que el día exista en el calendario (rechaza 2026-02-31).
export function esFechaValida(valor) {
  if (!FORMATO_FECHA.test(valor || '')) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

export function validarFechaNacimiento(valor) {
  if (!valor) return 'Ingresá la fecha de nacimiento.';
  if (!esFechaValida(valor)) return 'Ingresá una fecha válida.';
  const hoy = new Date().toLocaleDateString('sv-SE');
  if (valor > hoy) return 'La fecha no puede ser posterior a hoy.';
  if (valor < '1900-01-01') return 'La fecha no puede ser anterior a 1900.';
  return null;
}

export function validarFecha(valor) {
  if (!valor) return 'Ingresá la fecha.';
  if (!esFechaValida(valor)) return 'Ingresá una fecha válida.';
  return null;
}

export function validarRangoHorario(horaInicio, horaFin) {
  if (!FORMATO_HORA.test(horaInicio || '') || !FORMATO_HORA.test(horaFin || '')) {
    return 'Ingresá la hora de inicio y la de fin.';
  }
  if (horaInicio >= horaFin) return 'La hora de fin tiene que ser posterior a la de inicio.';
  return null;
}

// Cursos, materias, deportes y recorridos: pueden llevar números ("1° A").
export function validarNombreCatalogo(valor) {
  if (!valor) return 'Ingresá el nombre.';
  if (valor.length > MAX_NOMBRE_CATALOGO) return `Usá como máximo ${MAX_NOMBRE_CATALOGO} caracteres.`;
  return null;
}
