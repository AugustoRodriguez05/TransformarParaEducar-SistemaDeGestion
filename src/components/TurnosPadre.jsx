import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { formatearFecha } from '../fecha';

export default function TurnosPadre() {
  const [hijos, setHijos] = useState([]);
  const [misTurnos, setMisTurnos] = useState([]);
  const [alumnoId, setAlumnoId] = useState('');
  const [profesores, setProfesores] = useState([]);
  const [profesorId, setProfesorId] = useState('');
  const [franjas, setFranjas] = useState([]);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelado = false;
    Promise.all([apiFetch('/api/familia/hijos'), apiFetch('/api/turnos/mios')])
      .then(([h, t]) => {
        if (cancelado) return;
        setHijos(h);
        setMisTurnos(t);
      })
      .catch((err) => !cancelado && setError(err.message));
    return () => { cancelado = true; };
  }, [version]);

  const elegirHijo = async (id) => {
    setAlumnoId(id);
    setProfesorId('');
    setFranjas([]);
    setProfesores([]);
    setError('');
    setMensaje('');
    if (!id) return;
    try {
      setProfesores(await apiFetch(`/api/turnos/profesores?alumno_id=${id}`));
    } catch (err) {
      setError(err.message);
    }
  };

  const cargarFranjas = async (profId, alumno = alumnoId) => {
    setFranjas([]);
    if (!profId) return;
    try {
      setFranjas(await apiFetch(`/api/turnos/profesores/${profId}/disponibilidad?alumno_id=${alumno}`));
    } catch (err) {
      setError(err.message);
    }
  };

  const elegirProfesor = (id) => {
    setProfesorId(id);
    setError('');
    setMensaje('');
    cargarFranjas(id);
  };

  const solicitar = async (franjaId) => {
    setError('');
    setMensaje('');
    try {
      await apiFetch('/api/turnos', {
        method: 'POST',
        body: JSON.stringify({ disponibilidad_id: franjaId, alumno_id: alumnoId, motivo })
      });
      setMensaje('Turno solicitado. El profesor debe confirmarlo y te vamos a avisar.');
      setMotivo('');
      setVersion((v) => v + 1);
      cargarFranjas(profesorId);
    } catch (err) {
      setError(err.message);
    }
  };

  const cancelar = async (turnoId) => {
    setError('');
    setMensaje('');
    try {
      await apiFetch(`/api/turnos/${turnoId}/cancelar`, { method: 'PATCH' });
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h2>Turnos con profesores</h2>

      <div className="card">
        <h3>Solicitar un turno</h3>
        <div className="form-grid">
          <label>
            Alumno
            <select value={alumnoId} onChange={(e) => elegirHijo(e.target.value)}>
              <option value="">Seleccionar…</option>
              {hijos.map((h) => <option key={h.id} value={h.id}>{h.nombre} {h.apellido}</option>)}
            </select>
          </label>
          <label>
            Profesor
            <select value={profesorId} onChange={(e) => elegirProfesor(e.target.value)} disabled={!alumnoId}>
              <option value="">Seleccionar…</option>
              {profesores.map((p) => <option key={p.id} value={p.id}>{p.apellido}, {p.nombre}</option>)}
            </select>
          </label>
          <label>
            Motivo (opcional)
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </label>
        </div>

        {profesorId && franjas.length === 0 && <p>Este profesor no tiene franjas disponibles por el momento.</p>}
        {franjas.length > 0 && (
          <ul className="servicios-lista">
            {franjas.map((f) => (
              <li key={f.id}>
                <span>{formatearFecha(f.fecha)} — {f.hora_inicio} a {f.hora_fin}</span>
                <button onClick={() => solicitar(f.id)}>Solicitar</button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="error">{error}</p>}
        {mensaje && <p className="success">{mensaje}</p>}
      </div>

      <h3>Mis turnos</h3>
      {misTurnos.length === 0 ? <p>No tenés turnos solicitados.</p> : (
        <table className="data-table">
          <thead>
            <tr><th>Fecha</th><th>Horario</th><th>Profesor</th><th>Alumno</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {misTurnos.map((t) => (
              <tr key={t.id}>
                <td>{formatearFecha(t.fecha)}</td>
                <td>{t.hora_inicio} - {t.hora_fin}</td>
                <td>{t.profesor_nombre}</td>
                <td>{t.alumno_nombre}</td>
                <td><span className={`badge ${t.estado.toLowerCase()}`}>{t.estado}</span></td>
                <td>
                  {t.estado !== 'Cancelado' && <button className="link" onClick={() => cancelar(t.id)}>Cancelar</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
