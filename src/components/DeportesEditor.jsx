import { useEffect, useState } from 'react';
import { Pencil, Plus, Save, Trash2, Volleyball } from 'lucide-react';
import { apiFetch } from '../api';
import { useConfig } from '../useConfig';
import TituloSeccion from './TituloSeccion';
import { textoGrupo, TODOS_LOS_NIVELES } from '../deportes';
import { limpiar, NIVELES, soloErrores, validarNombreCatalogo, validarRangoHorario } from '../validaciones';

// Cada deporte es un grupo; nivel vacío = todos los niveles.
const DEPORTE_VACIO = { nombre: '', nivel: '', dia: '', hora_inicio: '', hora_fin: '', profesor_id: '' };

export default function DeportesEditor() {
  const config = useConfig();
  const dias = config ? config.dias : [];
  const [deportes, setDeportes] = useState([]);
  const [profesores, setProfesores] = useState([]);
  const [form, setForm] = useState(DEPORTE_VACIO);
  const [editandoId, setEditandoId] = useState(null);
  const [error, setError] = useState('');
  const [errores, setErrores] = useState({});
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelado = false;
    apiFetch('/api/servicios/deportes')
      .then((data) => !cancelado && setDeportes(data))
      .catch((err) => !cancelado && setError(err.message));
    return () => { cancelado = true; };
  }, [version]);

  // Solo un profesor activo puede quedar como responsable de un deporte.
  useEffect(() => {
    let cancelado = false;
    apiFetch('/api/profesores')
      .then((data) => !cancelado && setProfesores(data.filter((p) => p.estado === 'Activo')))
      .catch((err) => !cancelado && setError(err.message));
    return () => { cancelado = true; };
  }, []);

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
    const datos = { ...form, nombre: limpiar(form.nombre) };
    const encontrados = soloErrores({
      nombre: validarNombreCatalogo(datos.nombre),
      hora_fin: validarRangoHorario(datos.hora_inicio, datos.hora_fin)
    });
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    const ok = editandoId
      ? await ejecutar(`/api/servicios/deportes/${editandoId}`, 'PUT', datos)
      : await ejecutar('/api/servicios/deportes', 'POST', datos);
    if (ok) {
      setForm(DEPORTE_VACIO);
      setEditandoId(null);
    }
  };

  const editar = (d) => {
    setEditandoId(d.id);
    setForm({
      nombre: d.nombre,
      nivel: d.nivel || '',
      dia: d.dia,
      hora_inicio: d.hora_inicio,
      hora_fin: d.hora_fin,
      profesor_id: d.profesor_id ? String(d.profesor_id) : ''
    });
    setError('');
    setErrores({});
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setForm(DEPORTE_VACIO);
    setError('');
    setErrores({});
  };

  return (
    <div className="card">
      <TituloSeccion icono={Volleyball}>Deportes</TituloSeccion>

      <form className="form-grid" onSubmit={guardar}>
        <label>
          Nombre
          <input value={form.nombre} onChange={handleChange('nombre')} required />
          {errores.nombre && <small className="error">{errores.nombre}</small>}
        </label>
        <label>
          Nivel
          <select value={form.nivel} onChange={handleChange('nivel')}>
            <option value="">{TODOS_LOS_NIVELES}</option>
            {NIVELES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>
          Día
          <select value={form.dia} onChange={handleChange('dia')} required>
            <option value="">Seleccionar…</option>
            {dias.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label>Desde<input type="time" value={form.hora_inicio} onChange={handleChange('hora_inicio')} required /></label>
        <label>
          Hasta
          <input type="time" value={form.hora_fin} onChange={handleChange('hora_fin')} required />
          {errores.hora_fin && <small className="error">{errores.hora_fin}</small>}
        </label>
        <label>
          Profesor responsable
          <select value={form.profesor_id} onChange={handleChange('profesor_id')} required>
            <option value="">Seleccionar…</option>
            {profesores.map((p) => <option key={p.id} value={p.id}>{p.apellido}, {p.nombre}</option>)}
          </select>
        </label>
        <div className="form-actions">
          <button type="submit">{editandoId ? <><Save size={18} aria-hidden="true" />Guardar cambios</> : <><Plus size={18} aria-hidden="true" />Agregar</>}</button>
          {editandoId && <button type="button" className="secondary" onClick={cancelarEdicion}>Cancelar</button>}
        </div>
      </form>

      {error && <p className="error">{error}</p>}

      {deportes.length === 0 ? <p>No hay deportes cargados.</p> : (
        <ul className="servicios-lista lista-catalogo">
          {deportes.map((d) => (
            <li key={d.id}>
              <span>
                {textoGrupo(d)}
                {d.profesor_id ? ` — ${d.profesor_apellido}, ${d.profesor_nombre}` : ''}
              </span>
              <span className="actions">
                <button className="btn-accion btn-editar" onClick={() => editar(d)}><Pencil size={16} aria-hidden="true" />Editar</button>
                <button className="btn-accion btn-eliminar" onClick={() => ejecutar(`/api/servicios/deportes/${d.id}`, 'DELETE')}><Trash2 size={16} aria-hidden="true" />Eliminar</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
