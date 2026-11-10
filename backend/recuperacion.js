// Recuperación de contraseña con un código de 6 dígitos enviado por mail.
// Funciones puras (sin base de datos), probadas en recuperacion.test.js.

export const MINUTOS_VIGENCIA_CODIGO = 15;
export const MAX_INTENTOS_CODIGO = 5;
const FORMATO_CODIGO = /^\d{6}$/;

// Mensaje único para todo código rechazado: no se dice si venció, si es otro o si no existe.
export const CODIGO_INVALIDO = 'El código no es válido o venció. Pedí uno nuevo.';

// Fecha y hora de vencimiento (ISO, UTC) de un código creado en "ahora".
export function vencimientoCodigo(ahora = new Date()) {
  return new Date(ahora.getTime() + MINUTOS_VIGENCIA_CODIGO * 60 * 1000).toISOString();
}

/**
 * Verifica el código ingresado contra el último código del usuario.
 * registro: { codigo, vence (ISO), usado } o null si no tiene ninguno pendiente.
 * intentos: intentos fallidos anteriores con ese código.
 * Devuelve { valido: true } o { valido: false, contarIntento, agotado }:
 * contarIntento indica si este intento suma a los fallidos (un código equivocado sobre
 * un registro vigente) y agotado si con este intento se llegó al máximo.
 */
export function validarCodigoRecuperacion({ ingresado, registro, intentos = 0, ahora = new Date() }) {
  const rechazo = { valido: false, contarIntento: false, agotado: false };
  if (!registro || registro.usado) return rechazo;
  if (new Date(registro.vence).getTime() <= ahora.getTime()) return rechazo;
  if (intentos >= MAX_INTENTOS_CODIGO) return { ...rechazo, agotado: true };

  const codigo = ingresado === undefined || ingresado === null ? '' : String(ingresado).trim();
  if (FORMATO_CODIGO.test(codigo) && codigo === registro.codigo) return { valido: true };
  return { valido: false, contarIntento: true, agotado: intentos + 1 >= MAX_INTENTOS_CODIGO };
}
