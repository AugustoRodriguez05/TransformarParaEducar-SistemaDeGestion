import { useEffect, useState } from 'react';
import { BadgeCheck, Calendar, CalendarCheck, CalendarClock, CalendarPlus, Clock, Send, User, X } from 'lucide-react';
import { apiFetch } from '../api';
import { formatearFecha } from '../fecha';
import ThIcono from './ThIcono';
import TituloSeccion from './TituloSeccion';
import { MAX_MOTIVO } from '../validaciones';

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
      <TituloSeccion principal icono={CalendarClock}>Turnos con profesores</TituloSeccion>

      <div className="card">
        <TituloSeccion icono={CalendarPlus}>Solicitar un turno</TituloSeccion>
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
            <input maxLength={MAX_MOTIVO} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </label>
        </div>

        {profesorId && franjas.length === 0 && <p>Este profesor no tiene franjas disponibles por el momento.</p>}
        {franjas.length > 0 && (
          <ul className="servicios-lista">
            {franjas.map((f) => (
              <li key={f.id}>
                <span>{formatearFecha(f.fecha)} — {f.hora_inicio} a {f.hora_fin}</span>
                <button onClick={() => solicitar(f.id)}><Send size={18} aria-hidden="true" />Solicitar</button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="error">{error}</p>}
        {mensaje && <p className="success">{mensaje}</p>}
      </div>

      <TituloSeccion icono={CalendarCheck}>Mis turnos</TituloSeccion>
      {misTurnos.length === 0 ? <p>No tenés turnos solicitados.</p> : (
        <table className="data-table">
          <thead>
            <tr>
              <ThIcono icono={Calendar}>Fecha</ThIcono>
              <ThIcono icono={Clock}>Horario</ThIcono>
              <ThIcono icono={User}>Profesor</ThIcono>
              <ThIcono icono={User}>Alumno</ThIcono>
              <ThIcono icono={BadgeCheck}>Estado</ThIcono>
              <th></th>
            </tr>
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
                  {t.estado !== 'Cancelado' && <button className="accion accion-cancelar" onClick={() => cancelar(t.id)}><X size={16} aria-hidden="true" />Cancelar</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
