// Cálculo de cuotas: funciones puras (sin base de datos), probadas en cuotas.test.js.
// Los importes se suman en centavos para no arrastrar errores de redondeo.

const FORMATO_PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;
const FORMATO_IMPORTE = /^\d+(\.\d{1,2})?$/;
// NUMERIC(12,2): hasta 10 dígitos enteros.
export const IMPORTE_MAXIMO = 9999999999.99;
export const DIA_VENCIMIENTO = 10;

// Conceptos con tarifa: cuota base y comedor son únicos; deporte y transporte
// tienen una tarifa por cada deporte (grupo) y por cada recorrido.
export const TIPOS_TARIFA = ['cuota', 'deporte', 'transporte', 'comedor'];
export const TIPOS_CON_REFERENCIA = ['deporte', 'transporte'];

const aCentavos = (importe) => Math.round(Number(importe) * 100);
const aPesos = (centavos) => centavos / 100;

export function validarPeriodo(periodo) {
  if (!periodo) return 'Ingresá el período.';
  if (!FORMATO_PERIODO.test(periodo)) return 'Período: usá el formato AAAA-MM, por ejemplo 2026-03.';
  return null;
}

// Vencimiento: el día 10 del período (AAAA-MM-10).
export function vencimientoDelPeriodo(periodo) {
  return `${periodo}-${String(DIA_VENCIMIENTO).padStart(2, '0')}`;
}

// Importe en pesos: número mayor o igual a 0, con hasta 2 decimales.
export function validarImporte(valor) {
  const texto = valor === undefined || valor === null ? '' : String(valor).trim();
  if (!texto) return 'Ingresá el importe.';
  if (!FORMATO_IMPORTE.test(texto)) return 'Importe: ingresá un número mayor o igual a 0, con hasta 2 decimales.';
  if (Number(texto) > IMPORTE_MAXIMO) return 'Importe: el valor es demasiado grande.';
  return null;
}

// Número de factura correlativo: F-00000001, F-00000002, ...
export function numeroFactura(correlativo) {
  return `F-${String(correlativo).padStart(8, '0')}`;
}

/**
 * Ítems y total de la cuota de un alumno.
 * tarifas: { cuota, comedor, deporte: { [deporteId]: importe }, transporte: { [recorridoId]: importe } }
 *   (importe en pesos, número o texto; undefined/null si no hay tarifa cargada)
 * deportes: [{ id, nombre }] con inscripción activa; recorrido: { id, nombre } o null; comedor: boolean.
 * Devuelve { items, total, faltantes }: faltantes nombra los conceptos sin tarifa
 * (si hay alguno, la cuota no se debe generar).
 */
export function calcularCuota({ tarifas, deportes = [], recorrido = null, comedor = false }) {
  const items = [];
  const faltantes = [];
  const agregar = (concepto, referenciaId, descripcion, importe) => {
    if (importe === undefined || importe === null) {
      faltantes.push(descripcion);
      return;
    }
    items.push({ concepto, referencia_id: referenciaId, descripcion, importe: aPesos(aCentavos(importe)) });
  };

  agregar('cuota', null, 'Cuota mensual', tarifas.cuota);
  for (const d of deportes) agregar('deporte', d.id, `Deporte: ${d.nombre}`, tarifas.deporte?.[d.id]);
  if (recorrido) agregar('transporte', recorrido.id, `Transporte: ${recorrido.nombre}`, tarifas.transporte?.[recorrido.id]);
  if (comedor) agregar('comedor', null, 'Comedor', tarifas.comedor);

  const total = aPesos(items.reduce((suma, item) => suma + aCentavos(item.importe), 0));
  return { items, total, faltantes };
}

// Arma el objeto tarifas de calcularCuota a partir de filas { tipo, referencia_id, importe }.
export function tarifasPorConcepto(filas) {
  const tarifas = { cuota: null, comedor: null, deporte: {}, transporte: {} };
  for (const { tipo, referencia_id: referenciaId, importe } of filas) {
    if (TIPOS_CON_REFERENCIA.includes(tipo)) tarifas[tipo][referenciaId] = importe;
    else tarifas[tipo] = importe;
  }
  return tarifas;
}

// Número de orden de pago correlativo: OP-00000001, OP-00000002, ...
export function numeroOrdenPago(correlativo) {
  return `OP-${String(correlativo).padStart(8, '0')}`;
}

/**
 * Estado de la cuota según los comprobantes de pago cargados en su factura.
 * total: total de la factura; importes: importe de cada comprobante (pesos, número o texto).
 * Devuelve { estadoCuota, itemsPagados }: si la suma cubre el total, 'Pagada' y todos los
 * ítems pasan a 'Pagado'; si no llega, 'Pago parcial' y los ítems quedan como están.
 * Sin comprobantes devuelve null (no hay nada que recalcular).
 */
export function estadoSegunComprobantes(total, importes) {
  if (importes.length === 0) return null;
  const pagado = importes.reduce((suma, importe) => suma + aCentavos(importe), 0);
  return pagado >= aCentavos(total)
    ? { estadoCuota: 'Pagada', itemsPagados: true }
    : { estadoCuota: 'Pago parcial', itemsPagados: false };
}

/**
 * Qué hacer al guardar un precio con fecha "fecha" (AAAA-MM-DD), frente a la fecha del
 * precio vigente del concepto (null si todavía no tiene): 'crear' si no tiene precio,
 * 'nuevo' si la fecha es posterior (se agrega y el anterior queda para los meses previos)
 * o 'corregir' si es igual o anterior (se modifica el vigente).
 */
export function accionPrecio(vigenteActual, fecha) {
  if (!vigenteActual) return 'crear';
  return fecha > vigenteActual ? 'nuevo' : 'corregir';
}
