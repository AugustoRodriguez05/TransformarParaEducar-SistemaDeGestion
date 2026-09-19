import { useEffect, useState } from 'react';
import { apiFetch } from '../api';

export default function ServiciosAlumno({ alumnoId }) {
  const [deportes, setDeportes] = useState([]);
  const [recorridos, setRecorridos] = useState([]);
  const [servicios, setServicios] = useState(null);
  const [deporteSel, setDeporteSel] = useState('');
  const [recorridoSel, setRecorridoSel] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    apiFetch('/api/servicios/deportes').then((d) => !cancelado && setDeportes(d));
    apiFetch('/api/servicios/recorridos').then((r) => !cancelado && setRecorridos(r));
    apiFetch(`/api/servicios/alumnos/${alumnoId}`)
      .then((s) => !cancelado && setServicios(s))
      .catch((err) => !cancelado && setError(err.message));
    return () => { cancelado = true; };
  }, [alumnoId]);

  const ejecutar = async (path, method, body) => {
    setError('');
    try {
      const data = await apiFetch(`/api/servicios/alumnos/${alumnoId}${path}`, {
        method,
        body: body ? JSON.stringify(body) : undefined
      });
      setServicios(data);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!servicios) {
    return error ? <p className="error">{error}</p> : <p>Cargando servicios…</p>;
  }

  return (
    <div className="servicios">
      <h4>Actividades deportivas (máximo 2)</h4>
      {servicios.deportes.length === 0 && <p>Sin deportes inscriptos.</p>}
      <ul className="servicios-lista">
        {servicios.deportes.map((d) => (
          <li key={d.id}>
            <span>{d.nombre} — {d.dia} {d.hora_inicio} a {d.hora_fin}</span>
            <button className="link" onClick={() => ejecutar(`/deportes/${d.id}`, 'DELETE')}>Dar de baja</button>
          </li>
        ))}
      </ul>
      <div className="servicios-form">
        <select value={deporteSel} onChange={(e) => setDeporteSel(e.target.value)}>
          <option value="">Elegir deporte…</option>
          {deportes.map((d) => (
            <option key={d.id} value={d.id}>{d.nombre} — {d.dia} {d.hora_inicio} a {d.hora_fin}</option>
          ))}
        </select>
        <button
          disabled={!deporteSel}
          onClick={() => { ejecutar('/deportes', 'POST', { deporte_id: deporteSel }); setDeporteSel(''); }}
        >
          Inscribir
        </button>
      </div>

      <h4>Transporte</h4>
      {servicios.transporte ? (
        <ul className="servicios-lista">
          <li>
            <span>{servicios.transporte.recorrido_nombre}</span>
            <button className="link" onClick={() => ejecutar('/transporte', 'DELETE')}>Dar de baja</button>
          </li>
        </ul>
      ) : (
        <div className="servicios-form">
          <select value={recorridoSel} onChange={(e) => setRecorridoSel(e.target.value)}>
            <option value="">Elegir recorrido…</option>
            {recorridos.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
          <button
            disabled={!recorridoSel}
            onClick={() => { ejecutar('/transporte', 'POST', { recorrido_id: recorridoSel }); setRecorridoSel(''); }}
          >
            Inscribir
          </button>
        </div>
      )}

      <h4>Comedor</h4>
      {servicios.comedor ? (
        <ul className="servicios-lista">
          <li>
            <span>Inscripto al comedor</span>
            <button className="link" onClick={() => ejecutar('/comedor', 'DELETE')}>Dar de baja</button>
          </li>
        </ul>
      ) : (
        <button onClick={() => ejecutar('/comedor', 'POST')}>Inscribir al comedor</button>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
