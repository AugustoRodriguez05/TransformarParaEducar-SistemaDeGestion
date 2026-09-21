import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { formatearFecha, hoyISO } from '../fecha';

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
      <h2>Turnos con familias</h2>
      {error && <p className="error">{error}</p>}

      <div className="card">
        <h3>Mi disponibilidad</h3>
        <form className="form-grid" onSubmit={agregarFranja}>
          <label>Fecha<input type="date" min={hoyISO()} value={form.fecha} onChange={handleChange('fecha')} required /></label>
          <label>Desde<input type="time" value={form.hora_inicio} onChange={handleChange('hora_inicio')} required /></label>
          <label>Hasta<input type="time" value={form.hora_fin} onChange={handleChange('hora_fin')} required /></label>
          <div className="form-actions"><button type="submit">Agregar franja</button></div>
        </form>

        {franjas.length === 0 ? <p>Todavía no cargaste franjas de disponibilidad.</p> : (
          <ul className="servicios-lista">
            {franjas.map((f) => (
              <li key={f.id}>
                <span>{formatearFecha(f.fecha)} — {f.hora_inicio} a {f.hora_fin} {f.ocupada && <span className="badge activo">Ocupada</span>}</span>
                <button className="link" onClick={() => ejecutar(`/api/turnos/disponibilidad/${f.id}`, 'DELETE')}>Eliminar</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h3>Solicitudes de turno</h3>
      {turnos.length === 0 ? <p>No tenés solicitudes de turno.</p> : (
        <table className="data-table">
          <thead>
            <tr><th>Fecha</th><th>Horario</th><th>Familia</th><th>Alumno</th><th>Motivo</th><th>Estado</th><th></th></tr>
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
                    <button className="link" onClick={() => ejecutar(`/api/turnos/${t.id}/confirmar`, 'PATCH')}>Confirmar</button>
                  )}
                  {t.estado !== 'Cancelado' && (
                    <>
                      <button className="link" onClick={() => { setReprogramando(t.id); setNuevaFranja(''); }}>Reprogramar</button>
                      <button className="link" onClick={() => ejecutar(`/api/turnos/${t.id}/cancelar`, 'PATCH')}>Cancelar</button>
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
          <h3>Reprogramar turno</h3>
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
