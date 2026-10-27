import { BookOpen, Calendar, Clock, User } from 'lucide-react';
import ThIcono from './ThIcono';

// Materias del curso de un alumno con su profesor, día y horario.
// La usan el panel de familia y la ficha del alumno.
export default function MateriasCurso({ materias }) {
  if (materias.length === 0) return <p>Todavía no hay materias asignadas a este curso.</p>;

  return (
    <div className="tabla-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <ThIcono icono={BookOpen}>Materia</ThIcono>
            <ThIcono icono={User}>Profesor</ThIcono>
            <ThIcono icono={Calendar}>Día</ThIcono>
            <ThIcono icono={Clock}>Horario</ThIcono>
          </tr>
        </thead>
        <tbody>
          {materias.map((m, idx) => (
            <tr key={idx}>
              <td>{m.materia_nombre}</td>
              <td>{m.profesor_apellido}, {m.profesor_nombre}</td>
              <td>{m.dia}</td>
              <td>{m.hora_inicio} - {m.hora_fin}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
