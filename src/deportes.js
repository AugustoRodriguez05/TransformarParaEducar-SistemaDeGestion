// Cada deporte es un grupo: nombre, nivel (vacío = todos los niveles), día y horario.
export const TODOS_LOS_NIVELES = 'Todos los niveles';

// "Fútbol — Primario — Martes 16:00 a 17:30"
export function textoGrupo(deporte) {
  return `${deporte.nombre} — ${deporte.nivel || TODOS_LOS_NIVELES} — ${deporte.dia} ${deporte.hora_inicio} a ${deporte.hora_fin}`;
}
