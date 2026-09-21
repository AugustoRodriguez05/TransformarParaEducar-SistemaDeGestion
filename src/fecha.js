export function formatearFecha(fecha) {
  return fecha.split('-').reverse().join('/');
}

export function hoyISO() {
  return new Date().toLocaleDateString('sv-SE');
}
