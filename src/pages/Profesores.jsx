import { useEffect, useState } from 'react';
import {
  BadgeCheck, BookOpen, Calendar, Clock, FileText, GraduationCap, IdCard, Mail,
  Plus, Save, User, UserPlus
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { apiFetch } from '../api';
import { useConfig } from '../useConfig';
import ThIcono from '../components/ThIcono';
import TituloSeccion from '../components/TituloSeccion';

const PROFESOR_VACIO = { nombre: '', apellido: '', dni: '', email: '', password: '' };
const ASIGNACION_VACIA = { materia_id: '', curso_id: '', dia: '', hora_inicio: '', hora_fin: '' };

export default function Profesores() {
  const { user } = useAuth();
  return user.rol === 'administrador' ? <VistaAdministrador /> : <VistaProfesor />;
}

function VistaProfesor() {
  const [asignaciones, setAsignaciones] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const profesor = await apiFetch('/api/profesores/me');
        const data = await apiFetch(`/api/profesores/${profesor.id}/asignaciones`);
        setAsignaciones(data);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, []);

  return (
    <div>
      <TituloSeccion principal icono={GraduationCap}>Mis materias asignadas</TituloSeccion>
      {error && <p className="error">{error}</p>}
      {asignaciones.length === 0 && !error && <p>Todavía no tenés materias asignadas.</p>}
      {asignaciones.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <ThIcono icono={BookOpen}>Materia</ThIcono>
              <ThIcono icono={GraduationCap}>Curso</ThIcono>
              <ThIcono icono={Calendar}>Día</ThIcono>
              <ThIcono icono={Clock}>Horario</ThIcono>
            </tr>
          </thead>
          <tbody>
            {asignaciones.map((a) => (
              <tr key={a.id}>
                <td>{a.materia_nombre}</td>
                <td><span className="badge curso">{a.curso_nombre}</span></td>
                <td>{a.dia}</td>
                <td>{a.hora_inicio} - {a.hora_fin}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function VistaAdministrador() {
  const config = useConfig();
  const dias = config ? config.dias : [];
  const [profesores, setProfesores] = useState([]);
  const [cursos, setCursos] = useState([]);
  const [materias, setMaterias] = useState([]);

  const [formVisible, setFormVisible] = useState(false);
  const [formData, setFormData] = useState(PROFESOR_VACIO);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [seleccionado, setSeleccionado] = useState(null);
  const [asignaciones, setAsignaciones] = useState([]);
  const [asigForm, setAsigForm] = useState(ASIGNACION_VACIA);
  const [asigError, setAsigError] = useState('');

  const cargarProfesores = () => apiFetch('/api/profesores').then(setProfesores);

  useEffect(() => {
    cargarProfesores();
    apiFetch('/api/cursos').then(setCursos);
    apiFetch('/api/materias').then(setMaterias);
  }, []);

  const handleChange = (campo) => (e) => setFormData({ ...formData, [campo]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await apiFetch('/api/profesores', { method: 'POST', body: JSON.stringify(formData) });
      setMessage('Profesor dado de alta correctamente.');
      setFormVisible(false);
      setFormData(PROFESOR_VACIO);
      await cargarProfesores();
    } catch (err) {
      setError(err.message);
    }
  };

  const verAsignaciones = async (profesor) => {
    setSeleccionado(profesor);
    setAsigError('');
    setAsigForm(ASIGNACION_VACIA);
    const data = await apiFetch(`/api/profesores/${profesor.id}/asignaciones`);
    setAsignaciones(data);
  };

  const handleAsigChange = (campo) => (e) => setAsigForm({ ...asigForm, [campo]: e.target.value });

  const handleAsigSubmit = async (e) => {
    e.preventDefault();
    setAsigError('');
    try {
      await apiFetch(`/api/profesores/${seleccionado.id}/asignaciones`, {
        method: 'POST',
        body: JSON.stringify(asigForm)
      });
      setAsigForm(ASIGNACION_VACIA);
      const data = await apiFetch(`/api/profesores/${seleccionado.id}/asignaciones`);
      setAsignaciones(data);
    } catch (err) {
      setAsigError(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <TituloSeccion principal icono={GraduationCap}>Profesores</TituloSeccion>
        <button onClick={() => { setFormVisible(true); setError(''); setMessage(''); }}><UserPlus size={18} aria-hidden="true" />Nuevo profesor</button>
      </div>

      {formVisible && (
        <form className="card form-card" onSubmit={handleSubmit}>
          <TituloSeccion icono={UserPlus}>Alta de profesor</TituloSeccion>
          <div className="form-grid">
            <label>Nombre<input value={formData.nombre} onChange={handleChange('nombre')} required /></label>
            <label>Apellido<input value={formData.apellido} onChange={handleChange('apellido')} required /></label>
            <label>DNI<input value={formData.dni} onChange={handleChange('dni')} required /></label>
            <label>Email<input type="email" value={formData.email} onChange={handleChange('email')} required /></label>
            <label>Contraseña de acceso<input type="password" value={formData.password} onChange={handleChange('password')} required /></label>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="submit"><Save size={18} aria-hidden="true" />Guardar profesor</button>
            <button type="button" className="secondary" onClick={() => setFormVisible(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {message && <p className="success">{message}</p>}

      <table className="data-table">
        <thead>
          <tr>
            <ThIcono icono={User}>Apellido y Nombre</ThIcono>
            <ThIcono icono={FileText}>DNI</ThIcono>
            <ThIcono icono={Mail}>Email</ThIcono>
            <ThIcono icono={BadgeCheck}>Estado</ThIcono>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {profesores.map((p) => (
            <tr key={p.id}>
              <td>{p.apellido}, {p.nombre}</td>
              <td>{p.dni}</td>
              <td>{p.email}</td>
              <td><span className="badge activo">{p.estado}</span></td>
              <td className="actions"><button className="accion accion-ver" onClick={() => verAsignaciones(p)}><IdCard size={16} aria-hidden="true" />Ver / asignar materias</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {seleccionado && (
        <div className="card">
          <TituloSeccion icono={BookOpen}>Materias asignadas a {seleccionado.nombre} {seleccionado.apellido}</TituloSeccion>

          {asignaciones.length === 0 && <p>Sin materias asignadas todavía.</p>}
          {asignaciones.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <ThIcono icono={BookOpen}>Materia</ThIcono>
                  <ThIcono icono={GraduationCap}>Curso</ThIcono>
                  <ThIcono icono={Calendar}>Día</ThIcono>
                  <ThIcono icono={Clock}>Horario</ThIcono>
                </tr>
              </thead>
              <tbody>
                {asignaciones.map((a) => (
                  <tr key={a.id}>
                    <td>{a.materia_nombre}</td>
                    <td><span className="badge curso">{a.curso_nombre}</span></td>
                    <td>{a.dia}</td>
                    <td>{a.hora_inicio} - {a.hora_fin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <form className="form-grid asig-form" onSubmit={handleAsigSubmit}>
            <label>
              Materia
              <select value={asigForm.materia_id} onChange={handleAsigChange('materia_id')} required>
                <option value="">Seleccionar…</option>
                {materias.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </label>
            <label>
              Curso
              <select value={asigForm.curso_id} onChange={handleAsigChange('curso_id')} required>
                <option value="">Seleccionar…</option>
                {cursos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
            <label>
              Día
              <select value={asigForm.dia} onChange={handleAsigChange('dia')} required>
                <option value="">Seleccionar…</option>
                {dias.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label>Desde<input type="time" value={asigForm.hora_inicio} onChange={handleAsigChange('hora_inicio')} required /></label>
            <label>Hasta<input type="time" value={asigForm.hora_fin} onChange={handleAsigChange('hora_fin')} required /></label>
            <div className="form-actions">
              <button type="submit"><Plus size={18} aria-hidden="true" />Asignar</button>
            </div>
          </form>
          {asigError && <p className="error">{asigError}</p>}
        </div>
      )}
    </div>
  );
}
