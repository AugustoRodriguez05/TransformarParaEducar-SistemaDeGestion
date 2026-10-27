// Reglas de validación compartidas por las rutas que crean o editan datos.
// Cada validar* devuelve un mensaje de error para responder con 400, o null si
// el dato es válido. Los valores se validan ya recortados con limpiar().
// Los mensajes nombran el campo porque en la respuesta no se ven junto a él.

import { NIVELES } from './constantes.js';

const NOMBRE_PERSONA = /^\p{L}[\p{L} '’]*$/u;
const FORMATO_DNI = /^\d{7,8}$/;
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const FORMATO_TELEFONO = /^\+?\d{7,15}$/;

export const MAX_NOMBRE_CATALOGO = 60;
export const MAX_MOTIVO = 200;
export const MIN_PASSWORD = 6;
export const MAX_DOMICILIO = 100;
export const MAX_ESPECIALIDAD = 60;

export function limpiar(valor) {
  return valor === undefined || valor === null ? '' : String(valor).trim();
}

export function primerError(...errores) {
  return errores.find((e) => e) || null;
}

// campo: 'nombre' o 'apellido'
export function validarNombrePersona(valor, campo) {
  const titulo = campo.charAt(0).toUpperCase() + campo.slice(1);
  if (!valor) return `Ingresá el ${campo}.`;
  if (!NOMBRE_PERSONA.test(valor)) return `${titulo}: usá solo letras.`;
  if (valor.length < 2 || valor.length > 50) return `${titulo}: tiene que tener entre 2 y 50 letras.`;
  return null;
}

export function validarDni(valor) {
  if (!valor) return 'Ingresá el DNI.';
  if (!FORMATO_DNI.test(valor)) return 'DNI: ingresá 7 u 8 números, sin puntos.';
  return null;
}

export function validarEmail(valor) {
  if (!valor) return 'Ingresá el email.';
  if (valor.length > 100 || !FORMATO_EMAIL.test(valor)) {
    return 'Email: ingresá un email válido, por ejemplo nombre@correo.com.';
  }
  return null;
}

// Solo para contraseñas nuevas: las ya guardadas no se vuelven a validar.
export function validarPasswordNueva(valor) {
  const texto = valor === undefined || valor === null ? '' : String(valor);
  if (!texto.trim()) return 'Ingresá la contraseña.';
  if (texto.length < MIN_PASSWORD) return `Contraseña: usá al menos ${MIN_PASSWORD} caracteres.`;
  return null;
}

// Formato AAAA-MM-DD y que el día exista en el calendario (rechaza 2026-02-31).
export function esFechaValida(valor) {
  if (!FORMATO_FECHA.test(valor || '')) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

export function esHoraValida(valor) {
  return FORMATO_HORA.test(valor || '');
}

export function validarFechaNacimiento(valor) {
  if (!valor) return 'Ingresá la fecha de nacimiento.';
  if (!esFechaValida(valor)) return 'Fecha de nacimiento: ingresá una fecha válida.';
  const hoy = new Date().toLocaleDateString('sv-SE');
  if (valor > hoy) return 'Fecha de nacimiento: la fecha no puede ser posterior a hoy.';
  if (valor < '1900-01-01') return 'Fecha de nacimiento: la fecha no puede ser anterior a 1900.';
  return null;
}

export function validarRangoHorario(horaInicio, horaFin) {
  if (!esHoraValida(horaInicio) || !esHoraValida(horaFin)) {
    return 'Ingresá la hora de inicio y la de fin.';
  }
  if (horaInicio >= horaFin) return 'Horario: la hora de fin tiene que ser posterior a la de inicio.';
  return null;
}

// Cursos, materias, deportes y recorridos: pueden llevar números ("1° A").
export function validarNombreCatalogo(valor) {
  if (!valor) return 'Ingresá el nombre.';
  if (valor.length > MAX_NOMBRE_CATALOGO) return `Nombre: usá como máximo ${MAX_NOMBRE_CATALOGO} caracteres.`;
  return null;
}

export function validarMotivo(valor) {
  if (valor.length > MAX_MOTIVO) return `Motivo: usá como máximo ${MAX_MOTIVO} caracteres.`;
  return null;
}

// Teléfono, domicilio y especialidad son opcionales: vacío es válido.
export function validarTelefono(valor) {
  if (valor && !FORMATO_TELEFONO.test(valor)) {
    return 'Teléfono: ingresá entre 7 y 15 números, sin espacios ni guiones (puede empezar con +).';
  }
  return null;
}

export function validarDomicilio(valor) {
  if (valor.length > MAX_DOMICILIO) return `Domicilio: usá como máximo ${MAX_DOMICILIO} caracteres.`;
  return null;
}

export function validarEspecialidad(valor) {
  if (valor.length > MAX_ESPECIALIDAD) return `Especialidad: usá como máximo ${MAX_ESPECIALIDAD} caracteres.`;
  return null;
}

// Nivel educativo de un curso.
export function validarNivel(valor) {
  if (!valor) return 'Seleccioná el nivel.';
  if (!NIVELES.includes(valor)) return `Nivel: elegí ${NIVELES.slice(0, -1).join(', ')} o ${NIVELES.at(-1)}.`;
  return null;
}
