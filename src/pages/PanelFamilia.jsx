import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import ServiciosAlumno from '../components/ServiciosAlumno';

export default function PanelFamilia() {
  const [hijos, setHijos] = useState([]);
  const [seleccionado, setSeleccionado] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    apiFetch('/api/familia/hijos').then(setHijos).catch((err) => setError(err.message));
  }, []);

  const verDetalle = async (hijo) => {
    setSeleccionado(hijo);
    setDetalle(null);
    setError('');
    setMensaje('');
    try {
      const data = await apiFetch(`/api/familia/hijos/${hijo.id}`);
      setDetalle(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const inscribir = async () => {
    setMensaje('');
    setError('');
    try {
      await apiFetch(`/api/familia/hijos/${seleccionado.id}/inscripcion`, { method: 'POST' });
      setMensaje('Inscripción al ciclo lectivo registrada.');
      const data = await apiFetch(`/api/familia/hijos/${seleccionado.id}`);
      setDetalle(data);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h2>Panel de familia</h2>

      {hijos.length === 0 && <p>No tenés alumnos vinculados a tu cuenta.</p>}

      <div className="hijos-grid">
        {hijos.map((h) => (
          <button
            key={h.id}
            className={`hijo-card ${seleccionado?.id === h.id ? 'selected' : ''}`}
            onClick={() => verDetalle(h)}
          >
            <strong>{h.nombre} {h.apellido}</strong>
            <span>{h.curso_nombre || 'Sin curso asignado'}</span>
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      {detalle && (
        <div className="card">
          <h3>{detalle.alumno.nombre} {detalle.alumno.apellido} — Legajo {detalle.alumno.legajo}</h3>
          <p>Curso: {detalle.alumno.curso_nombre || 'Sin asignar'}</p>
          <p>Estado del legajo: <span className={`badge ${detalle.alumno.estado.toLowerCase()}`}>{detalle.alumno.estado}</span></p>

          <h4>Materias y profesores</h4>
          {detalle.materias.length === 0 && <p>Todavía no hay materias asignadas a este curso.</p>}
          {detalle.materias.length > 0 && (
            <table className="data-table">
              <thead><tr><th>Materia</th><th>Profesor</th><th>Día</th><th>Horario</th></tr></thead>
              <tbody>
                {detalle.materias.map((m, idx) => (
                  <tr key={idx}>
                    <td>{m.materia_nombre}</td>
                    <td>{m.profesor_apellido}, {m.profesor_nombre}</td>
                    <td>{m.dia}</td>
                    <td>{m.hora_inicio} - {m.hora_fin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h4>Servicios del alumno</h4>
          {detalle.alumno.estado === 'Activo'
            ? <ServiciosAlumno key={detalle.alumno.id} alumnoId={detalle.alumno.id} />
            : <p>El legajo está inactivo: no se pueden gestionar servicios.</p>}

          <div className="form-actions">
            {detalle.alumno.inscripto_ciclo_lectivo ? (
              <span className="success">Ya inscripto al ciclo lectivo 2026.</span>
            ) : (
              <button onClick={inscribir}>Inscribir al ciclo lectivo 2026</button>
            )}
          </div>
          {mensaje && <p className="success">{mensaje}</p>}
        </div>
      )}
    </div>
  );
}
