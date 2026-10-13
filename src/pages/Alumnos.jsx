import { useEffect, useState } from 'react';
import {
  ArrowDown, BadgeCheck, ClipboardList, FileText, GraduationCap, Hash, IdCard,
  Pencil, RotateCcw, Save, Search, User, UserPlus, Users
} from 'lucide-react';
import { apiFetch } from '../api';
import ServiciosAlumno from '../components/ServiciosAlumno';
import ThIcono from '../components/ThIcono';
import TituloSeccion from '../components/TituloSeccion';

const ALUMNO_VACIO = { nombre: '', apellido: '', dni: '', fecha_nacimiento: '', curso_id: '' };

export default function Alumnos() {
  const [query, setQuery] = useState('');
  const [alumnos, setAlumnos] = useState([]);
  const [cursos, setCursos] = useState([]);
  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(ALUMNO_VACIO);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [buscado, setBuscado] = useState(false);
  const [alumnoServicios, setAlumnoServicios] = useState(null);

  const cargarAlumnos = async (q = '') => {
    const params = q ? `?q=${encodeURIComponent(q)}` : '';
    const data = await apiFetch(`/api/alumnos${params}`);
    setAlumnos(data);
    setBuscado(true);
  };

  useEffect(() => {
    let cancelado = false;
    apiFetch('/api/cursos').then(setCursos).catch(() => setCursos([]));
    apiFetch('/api/alumnos').then((data) => {
      if (cancelado) return;
      setAlumnos(data);
      setBuscado(true);
    });
    return () => { cancelado = true; };
  }, []);

  const handleBuscar = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await cargarAlumnos(query);
    } catch (err) {
      setError(err.message);
    }
  };

  const abrirNuevo = () => {
    setEditingId(null);
    setFormData(ALUMNO_VACIO);
    setError('');
    setMessage('');
    setFormVisible(true);
  };

  const abrirEdicion = (alumno) => {
    setEditingId(alumno.id);
    setFormData({
      nombre: alumno.nombre,
      apellido: alumno.apellido,
      dni: alumno.dni,
      fecha_nacimiento: alumno.fecha_nacimiento,
      curso_id: alumno.curso_id || ''
    });
    setError('');
    setMessage('');
    setFormVisible(true);
  };

  const handleChange = (campo) => (e) => setFormData({ ...formData, [campo]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      if (editingId) {
        await apiFetch(`/api/alumnos/${editingId}`, { method: 'PUT', body: JSON.stringify(formData) });
        setMessage('Legajo actualizado correctamente.');
      } else {
        await apiFetch('/api/alumnos', { method: 'POST', body: JSON.stringify(formData) });
        setMessage('Alumno dado de alta correctamente.');
      }
      setFormVisible(false);
      await cargarAlumnos(query);
    } catch (err) {
      setError(err.message);
    }
  };

  const cambiarEstado = async (alumno) => {
    const nuevoEstado = alumno.estado === 'Activo' ? 'Inactivo' : 'Activo';
    try {
      await apiFetch(`/api/alumnos/${alumno.id}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({ estado: nuevoEstado })
      });
      await cargarAlumnos(query);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <TituloSeccion principal icono={Users}>Legajo de alumnos</TituloSeccion>
        <button onClick={abrirNuevo}><UserPlus size={18} aria-hidden="true" />Nuevo alumno</button>
      </div>

      <form className="search-bar" onSubmit={handleBuscar}>
        <span className="search-field">
          <Search size={20} aria-hidden="true" />
          <input
            type="text"
            placeholder="Buscar por DNI, apellido o legajo…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </span>
        <button type="submit"><Search size={18} aria-hidden="true" />Buscar</button>
        {query && (
          <button
            type="button"
            className="secondary"
            onClick={() => { setQuery(''); cargarAlumnos(''); }}
          >
            Limpiar
          </button>
        )}
      </form>

      {error && !formVisible && <p className="error">{error}</p>}

      {formVisible && (
        <form className="card form-card" onSubmit={handleSubmit}>
          <TituloSeccion icono={editingId ? Pencil : UserPlus}>{editingId ? 'Editar legajo' : 'Alta de alumno'}</TituloSeccion>
          <div className="form-grid">
            <label>
              Nombre
              <input value={formData.nombre} onChange={handleChange('nombre')} required />
            </label>
            <label>
              Apellido
              <input value={formData.apellido} onChange={handleChange('apellido')} required />
            </label>
            <label>
              DNI
              <input value={formData.dni} onChange={handleChange('dni')} required />
            </label>
            <label>
              Fecha de nacimiento
              <input type="date" value={formData.fecha_nacimiento} onChange={handleChange('fecha_nacimiento')} required />
            </label>
            <label>
              Curso
              <select value={formData.curso_id} onChange={handleChange('curso_id')}>
                <option value="">Sin asignar</option>
                {cursos.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </label>
          </div>

          {error && <p className="error">{error}</p>}

          <div className="form-actions">
            <button type="submit"><Save size={18} aria-hidden="true" />{editingId ? 'Guardar cambios' : 'Guardar alumno'}</button>
            <button type="button" className="secondary" onClick={() => setFormVisible(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {message && <p className="success">{message}</p>}

      {buscado && alumnos.length === 0 && <p>No se encontraron alumnos.</p>}

      {alumnos.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <ThIcono icono={Hash}>Legajo</ThIcono>
              <ThIcono icono={User}>Apellido y Nombre</ThIcono>
              <ThIcono icono={FileText}>DNI</ThIcono>
              <ThIcono icono={GraduationCap}>Curso</ThIcono>
              <ThIcono icono={BadgeCheck}>Estado</ThIcono>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {alumnos.map((a) => (
              <tr key={a.id} className={a.estado === 'Inactivo' ? 'row-inactivo' : ''}>
                <td>{a.legajo}</td>
                <td>{a.apellido}, {a.nombre}</td>
                <td>{a.dni}</td>
                <td>{a.curso_nombre ? <span className="badge curso">{a.curso_nombre}</span> : '—'}</td>
                <td><span className={`badge ${a.estado.toLowerCase()}`}>{a.estado}</span></td>
                <td className="actions">
                  <button className="accion accion-editar" onClick={() => abrirEdicion(a)}><Pencil size={16} aria-hidden="true" />Editar</button>
                  {a.estado === 'Activo' && (
                    <button className="accion accion-ver" onClick={() => setAlumnoServicios(a)}><IdCard size={16} aria-hidden="true" />Servicios</button>
                  )}
                  <button className={a.estado === 'Activo' ? 'accion accion-baja' : 'accion accion-confirmar'} onClick={() => cambiarEstado(a)}>
                    {a.estado === 'Activo'
                      ? <><ArrowDown size={16} aria-hidden="true" />Dar de baja</>
                      : <><RotateCcw size={16} aria-hidden="true" />Reactivar</>}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {alumnoServicios && (
        <div className="card">
          <div className="page-header">
            <TituloSeccion icono={ClipboardList}>Servicios de {alumnoServicios.nombre} {alumnoServicios.apellido}</TituloSeccion>
            <button className="secondary" onClick={() => setAlumnoServicios(null)}>Cerrar</button>
          </div>
          <ServiciosAlumno key={alumnoServicios.id} alumnoId={alumnoServicios.id} />
        </div>
      )}
    </div>
  );
}
