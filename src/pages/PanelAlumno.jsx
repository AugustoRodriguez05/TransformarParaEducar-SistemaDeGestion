import { useEffect, useState } from 'react';
import { BookOpen, ClipboardList, LayoutDashboard, User } from 'lucide-react';
import { apiFetch } from '../api';
import MateriasCurso from '../components/MateriasCurso';
import ServiciosAlumno from '../components/ServiciosAlumno';
import TituloSeccion from '../components/TituloSeccion';

// Panel del alumno: sus datos, las materias de su curso y sus servicios.
// Usa los mismos componentes que el panel de familia.
export default function PanelAlumno() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    apiFetch('/api/mi-panel')
      .then((data) => !cancelado && setDatos(data))
      .catch((err) => !cancelado && setError(err.message));
    return () => { cancelado = true; };
  }, []);

  const alumno = datos?.alumno;

  return (
    <div>
      <TituloSeccion principal icono={LayoutDashboard}>Mi panel</TituloSeccion>

      {error && <p className="error">{error}</p>}

      {alumno && (
        <div className="card">
          <TituloSeccion icono={User}>{alumno.nombre} {alumno.apellido} — Legajo {alumno.legajo}</TituloSeccion>
          <p>Curso: {alumno.curso_nombre || 'Sin asignar'}</p>
          <p>Nivel: {alumno.curso_nivel || 'Sin asignar'}</p>

          <TituloSeccion nivel="h4" icono={BookOpen}>Materias y profesores</TituloSeccion>
          <MateriasCurso materias={datos.materias} />

          <TituloSeccion nivel="h4" icono={ClipboardList}>Servicios del alumno</TituloSeccion>
          <ServiciosAlumno key={alumno.id} alumnoId={alumno.id} />
        </div>
      )}
    </div>
  );
}
