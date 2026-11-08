import { useEffect, useState } from 'react';
import { BadgeCheck, Calendar, CalendarClock, Clock, User } from 'lucide-react';
import { apiFetch } from '../api';
import { formatearFecha } from '../fecha';
import ThIcono from './ThIcono';
import TituloSeccion from './TituloSeccion';

// Turnos para el administrador: todos los turnos (solo consulta), con filtro por profesor y fecha.
export default function TurnosAdministrador() {
  const [profesores, setProfesores] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [filtros, setFiltros] = useState({ profesor_id: '', fecha: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    apiFetch('/api/profesores')
      .then((data) => !cancelado && setProfesores(data))
      .catch((err) => !cancelado && setError(err.message));
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    let cancelado = false;
    const params = new URLSearchParams();
    if (filtros.profesor_id) params.set('profesor_id', filtros.profesor_id);
    if (filtros.fecha) params.set('fecha', filtros.fecha);
    apiFetch(`/api/turnos/todos?${params}`)
      .then((data) => {
        if (cancelado) return;
        setTurnos(data);
        setError('');
      })
      .catch((err) => !cancelado && setError(err.message));
    return () => { cancelado = true; };
  }, [filtros]);

  const handleChange = (campo) => (e) => setFiltros({ ...filtros, [campo]: e.target.value });

  return (
    <div>
      <TituloSeccion principal icono={CalendarClock}>Turnos</TituloSeccion>

      <div className="card form-card">
        <div className="form-grid">
          <label>
            Profesor
            <select value={filtros.profesor_id} onChange={handleChange('profesor_id')}>
              <option value="">Todos los profesores</option>
              {profesores.map((p) => <option key={p.id} value={p.id}>{p.apellido}, {p.nombre}</option>)}
            </select>
          </label>
          <label>
            Fecha
            <input type="date" value={filtros.fecha} onChange={handleChange('fecha')} />
          </label>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {turnos.length === 0 ? <p>No hay turnos para los filtros seleccionados.</p> : (
        <div className="tabla-scroll">
          <table className="data-table tabla-tarjetas">
            <thead>
              <tr>
                <ThIcono icono={User}>Padre</ThIcono>
                <ThIcono icono={User}>Profesor</ThIcono>
                <ThIcono icono={User}>Alumno</ThIcono>
                <ThIcono icono={Calendar}>Fecha</ThIcono>
                <ThIcono icono={Clock}>Hora</ThIcono>
                <ThIcono icono={BadgeCheck}>Estado</ThIcono>
              </tr>
            </thead>
            <tbody>
              {turnos.map((t) => (
                <tr key={t.id}>
                  <td data-label="Padre">{t.padre_nombre}</td>
                  <td data-label="Profesor">{t.profesor_nombre}</td>
                  <td data-label="Alumno">{t.alumno_nombre}</td>
                  <td data-label="Fecha">{formatearFecha(t.fecha)}</td>
                  <td data-label="Hora">{t.hora_inicio} - {t.hora_fin}</td>
                  <td data-label="Estado"><span className={`badge ${t.estado.toLowerCase()}`}>{t.estado}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
