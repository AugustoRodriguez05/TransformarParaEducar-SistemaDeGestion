import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { useConfig } from '../useConfig';

const DEPORTE_VACIO = { nombre: '', dia: '', hora_inicio: '', hora_fin: '' };

export default function DeportesEditor() {
  const config = useConfig();
  const dias = config ? config.dias : [];
  const [deportes, setDeportes] = useState([]);
  const [form, setForm] = useState(DEPORTE_VACIO);
  const [editandoId, setEditandoId] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelado = false;
    apiFetch('/api/servicios/deportes')
      .then((data) => !cancelado && setDeportes(data))
      .catch((err) => !cancelado && setError(err.message));
    return () => { cancelado = true; };
  }, [version]);

  const handleChange = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  const ejecutar = async (path, method, body) => {
    setError('');
    try {
      await apiFetch(path, { method, body: body ? JSON.stringify(body) : undefined });
      setVersion((v) => v + 1);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  const guardar = async (e) => {
    e.preventDefault();
    const ok = editandoId
      ? await ejecutar(`/api/servicios/deportes/${editandoId}`, 'PUT', form)
      : await ejecutar('/api/servicios/deportes', 'POST', form);
    if (ok) {
      setForm(DEPORTE_VACIO);
      setEditandoId(null);
    }
  };

  const editar = (d) => {
    setEditandoId(d.id);
    setForm({ nombre: d.nombre, dia: d.dia, hora_inicio: d.hora_inicio, hora_fin: d.hora_fin });
    setError('');
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setForm(DEPORTE_VACIO);
    setError('');
  };

  return (
    <div className="card">
      <h3>Deportes</h3>

      <form className="form-grid" onSubmit={guardar}>
        <label>Nombre<input value={form.nombre} onChange={handleChange('nombre')} required /></label>
        <label>
          Día
          <select value={form.dia} onChange={handleChange('dia')} required>
            <option value="">Seleccionar…</option>
            {dias.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label>Desde<input type="time" value={form.hora_inicio} onChange={handleChange('hora_inicio')} required /></label>
        <label>Hasta<input type="time" value={form.hora_fin} onChange={handleChange('hora_fin')} required /></label>
        <div className="form-actions">
          <button type="submit">{editandoId ? 'Guardar cambios' : 'Agregar'}</button>
          {editandoId && <button type="button" className="secondary" onClick={cancelarEdicion}>Cancelar</button>}
        </div>
      </form>

      {error && <p className="error">{error}</p>}

      {deportes.length === 0 ? <p>No hay deportes cargados.</p> : (
        <ul className="servicios-lista">
          {deportes.map((d) => (
            <li key={d.id}>
              <span>{d.nombre} — {d.dia} {d.hora_inicio} a {d.hora_fin}</span>
              <span className="actions">
                <button className="link" onClick={() => editar(d)}>Editar</button>
                <button className="link" onClick={() => ejecutar(`/api/servicios/deportes/${d.id}`, 'DELETE')}>Eliminar</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
