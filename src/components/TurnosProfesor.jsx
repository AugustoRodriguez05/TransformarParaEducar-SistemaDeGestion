import { useEffect, useState } from 'react';
import {
  BadgeCheck, Calendar, CalendarClock, Check, Clock, Inbox, MessageSquare, Plus, Trash2, User, X
} from 'lucide-react';
import { apiFetch } from '../api';
import { formatearFecha, hoyISO } from '../fecha';
import ThIcono from './ThIcono';
import TituloSeccion from './TituloSeccion';

const FRANJA_VACIA = { fecha: '', hora_inicio: '', hora_fin: '' };

export default function TurnosProfesor() {
  const [franjas, setFranjas] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [form, setForm] = useState(FRANJA_VACIA);
  const [reprogramando, setReprogramando] = useState(null);
  const [nuevaFranja, setNuevaFranja] = useState('');
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelado = false;
    Promise.all([apiFetch('/api/turnos/disponibilidad'), apiFetch('/api/turnos/recibidos')])
      .then(([f, t]) => {
        if (cancelado) return;
        setFranjas(f);
        setTurnos(t);
      })
      .catch((err) => !cancelado && setError(err.message));
    return () => { cancelado = true; };
  }, [version]);

  const recargar = () => setVersion((v) => v + 1);

  const ejecutar = async (path, method, body) => {
    setError('');
    try {
      await apiFetch(path, { method, body: body ? JSON.stringify(body) : undefined });
      recargar();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  const agregarFranja = async (e) => {
    e.preventDefault();
    if (await ejecutar('/api/turnos/disponibilidad', 'POST', form)) setForm(FRANJA_VACIA);
  };

  const reprogramar = async (turnoId) => {
    if (await ejecutar(`/api/turnos/${turnoId}/reprogramar`, 'PATCH', { disponibilidad_id: nuevaFranja })) {
      setReprogramando(null);
      setNuevaFranja('');
    }
  };

  const handleChange = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  return (
    <div>
      <TituloSeccion principal icono={CalendarClock}>Turnos con familias</TituloSeccion>
      {error && <p className="error">{error}</p>}

      <div className="card">
        <TituloSeccion icono={Clock}>Mi disponibilidad</TituloSeccion>
        <form className="form-grid" onSubmit={agregarFranja}>
          <label>Fecha<input type="date" min={hoyISO()} value={form.fecha} onChange={handleChange('fecha')} required /></label>
          <label>Desde<input type="time" value={form.hora_inicio} onChange={handleChange('hora_inicio')} required /></label>
          <label>Hasta<input type="time" value={form.hora_fin} onChange={handleChange('hora_fin')} required /></label>
          <div className="form-actions"><button type="submit"><Plus size={18} aria-hidden="true" />Agregar franja</button></div>
        </form>

        {franjas.length === 0 ? <p>Todavía no cargaste franjas de disponibilidad.</p> : (
          <ul className="servicios-lista">
            {franjas.map((f) => (
              <li key={f.id}>
                <span>{formatearFecha(f.fecha)} — {f.hora_inicio} a {f.hora_fin} {f.ocupada && <span className="badge activo sin-punto">Ocupada</span>}</span>
                <button className="accion accion-eliminar" onClick={() => ejecutar(`/api/turnos/disponibilidad/${f.id}`, 'DELETE')}><Trash2 size={16} aria-hidden="true" />Eliminar</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <TituloSeccion icono={Inbox}>Solicitudes de turno</TituloSeccion>
      {turnos.length === 0 ? <p>No tenés solicitudes de turno.</p> : (
        <table className="data-table">
          <thead>
            <tr>
              <ThIcono icono={Calendar}>Fecha</ThIcono>
              <ThIcono icono={Clock}>Horario</ThIcono>
              <ThIcono icono={User}>Familia</ThIcono>
              <ThIcono icono={User}>Alumno</ThIcono>
              <ThIcono icono={MessageSquare}>Motivo</ThIcono>
              <ThIcono icono={BadgeCheck}>Estado</ThIcono>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {turnos.map((t) => (
              <tr key={t.id}>
                <td>{formatearFecha(t.fecha)}</td>
                <td>{t.hora_inicio} - {t.hora_fin}</td>
                <td>{t.padre_nombre}</td>
                <td>{t.alumno_nombre}</td>
                <td>{t.motivo || '—'}</td>
                <td><span className={`badge ${t.estado.toLowerCase()}`}>{t.estado}</span></td>
                <td className="actions">
                  {t.estado === 'Pendiente' && (
                    <button className="accion accion-confirmar" onClick={() => ejecutar(`/api/turnos/${t.id}/confirmar`, 'PATCH')}><Check size={16} aria-hidden="true" />Confirmar</button>
                  )}
                  {t.estado !== 'Cancelado' && (
                    <>
                      <button className="accion accion-ver" onClick={() => { setReprogramando(t.id); setNuevaFranja(''); }}><CalendarClock size={16} aria-hidden="true" />Reprogramar</button>
                      <button className="accion accion-cancelar" onClick={() => ejecutar(`/api/turnos/${t.id}/cancelar`, 'PATCH')}><X size={16} aria-hidden="true" />Cancelar</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {reprogramando && (
        <div className="card">
          <TituloSeccion icono={CalendarClock}>Reprogramar turno</TituloSeccion>
          <div className="servicios-form">
            <select value={nuevaFranja} onChange={(e) => setNuevaFranja(e.target.value)}>
              <option value="">Elegir nueva franja…</option>
              {franjas.filter((f) => !f.ocupada).map((f) => (
                <option key={f.id} value={f.id}>{formatearFecha(f.fecha)} — {f.hora_inicio} a {f.hora_fin}</option>
              ))}
            </select>
            <button disabled={!nuevaFranja} onClick={() => reprogramar(reprogramando)}>Reprogramar</button>
            <button className="secondary" onClick={() => setReprogramando(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
