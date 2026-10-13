// Mismas reglas que backend/validaciones.js, para avisar antes de enviar.
// Cada validar* devuelve un mensaje de error o null si el dato es válido.

const NOMBRE_PERSONA = /^\p{L}[\p{L} '’-]*$/u;
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

// etiqueta: 'El nombre' o 'El apellido'
export function validarNombrePersona(valor, etiqueta) {
  if (!valor) return `${etiqueta} es obligatorio`;
  if (valor.length < 2 || valor.length > 50) return `${etiqueta} debe tener entre 2 y 50 caracteres`;
  if (!NOMBRE_PERSONA.test(valor)) return `${etiqueta} solo puede tener letras, espacios, apóstrofo y guion`;
  return null;
}

export function validarDni(valor) {
  if (!valor) return 'El DNI es obligatorio';
  if (!FORMATO_DNI.test(valor)) return 'El DNI debe tener solo números, entre 7 y 8 dígitos';
  return null;
}

export function validarEmail(valor) {
  if (!valor) return 'El email es obligatorio';
  if (valor.length > 100 || !FORMATO_EMAIL.test(valor)) return 'El email no tiene un formato válido';
  return null;
}

export function validarPasswordNueva(valor) {
  const texto = valor === undefined || valor === null ? '' : String(valor);
  if (!texto.trim()) return 'La contraseña es obligatoria';
  if (texto.length < MIN_PASSWORD) return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`;
  return null;
}

// Formato AAAA-MM-DD y que el día exista en el calendario (rechaza 2026-02-31).
export function esFechaValida(valor) {
  if (!FORMATO_FECHA.test(valor || '')) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

export function validarFechaNacimiento(valor) {
  if (!valor) return 'La fecha de nacimiento es obligatoria';
  if (!esFechaValida(valor)) return 'La fecha de nacimiento no es una fecha válida';
  const hoy = new Date().toLocaleDateString('sv-SE');
  if (valor > hoy) return 'La fecha de nacimiento no puede ser futura';
  if (valor < '1900-01-01') return 'La fecha de nacimiento no puede ser anterior a 1900';
  return null;
}

export function validarFecha(valor) {
  if (!valor) return 'La fecha es obligatoria';
  if (!esFechaValida(valor)) return 'La fecha no es una fecha válida';
  return null;
}

export function validarRangoHorario(horaInicio, horaFin) {
  if (!FORMATO_HORA.test(horaInicio || '') || !FORMATO_HORA.test(horaFin || '')) {
    return 'Los horarios son obligatorios y deben tener formato HH:MM';
  }
  if (horaInicio >= horaFin) return 'El horario de inicio debe ser anterior al de fin';
  return null;
}

// Cursos, materias, deportes y recorridos: pueden llevar números ("1° A").
export function validarNombreCatalogo(valor) {
  if (!valor) return 'El nombre es obligatorio';
  if (valor.length > MAX_NOMBRE_CATALOGO) {
    return `El nombre no puede tener más de ${MAX_NOMBRE_CATALOGO} caracteres`;
  }
  return null;
}
