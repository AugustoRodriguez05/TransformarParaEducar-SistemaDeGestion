import { useEffect, useState } from 'react';
import {
  ArrowDown, BadgeCheck, BookOpen, Calendar, Clock, FileText, GraduationCap, IdCard, Mail,
  Pencil, Plus, RotateCcw, Save, Trash2, User, UserPlus
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { apiFetch } from '../api';
import { useConfig } from '../useConfig';
import Modal from '../components/Modal';
import ThIcono from '../components/ThIcono';
import TituloSeccion from '../components/TituloSeccion';
import {
  limpiar, soloErrores, validarDni, validarEmail, validarEspecialidad, validarNombrePersona,
  validarPasswordNueva, validarRangoHorario, validarTelefono
} from '../validaciones';
import './Profesores.css';

const PROFESOR_VACIO = { nombre: '', apellido: '', dni: '', email: '', password: '', especialidad: '', telefono: '' };
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
        <div className="tabla-scroll">
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
        </div>
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
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(PROFESOR_VACIO);
  const [error, setError] = useState('');
  const [errores, setErrores] = useState({});
  const [message, setMessage] = useState('');

  const [seleccionado, setSeleccionado] = useState(null);
  const [asignaciones, setAsignaciones] = useState([]);
  const [asigForm, setAsigForm] = useState(ASIGNACION_VACIA);
  const [asigEditandoId, setAsigEditandoId] = useState(null);
  const [asigError, setAsigError] = useState('');

  const cargarProfesores = () => apiFetch('/api/profesores').then(setProfesores);

  useEffect(() => {
    cargarProfesores();
    apiFetch('/api/cursos').then(setCursos);
    apiFetch('/api/materias').then(setMaterias);
  }, []);

  const handleChange = (campo) => (e) => setFormData({ ...formData, [campo]: e.target.value });

  const abrirNuevo = () => {
    setEditingId(null);
    setFormData(PROFESOR_VACIO);
    setError('');
    setErrores({});
    setMessage('');
    setFormVisible(true);
  };

  const abrirEdicion = (profesor) => {
    setEditingId(profesor.id);
    setFormData({
      nombre: profesor.nombre,
      apellido: profesor.apellido,
      dni: profesor.dni,
      email: profesor.email,
      password: '',
      especialidad: profesor.especialidad || '',
      telefono: profesor.telefono || ''
    });
    setError('');
    setErrores({});
    setMessage('');
    setFormVisible(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    const datos = {
      ...formData,
      nombre: limpiar(formData.nombre),
      apellido: limpiar(formData.apellido),
      dni: limpiar(formData.dni),
      email: limpiar(formData.email),
      especialidad: limpiar(formData.especialidad),
      telefono: limpiar(formData.telefono)
    };
    const encontrados = soloErrores({
      nombre: validarNombrePersona(datos.nombre, 'nombre'),
      apellido: validarNombrePersona(datos.apellido, 'apellido'),
      dni: validarDni(datos.dni),
      email: validarEmail(datos.email),
      password: editingId ? null : validarPasswordNueva(datos.password),
      especialidad: validarEspecialidad(datos.especialidad),
      telefono: validarTelefono(datos.telefono)
    });
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    try {
      if (editingId) {
        await apiFetch(`/api/profesores/${editingId}`, { method: 'PUT', body: JSON.stringify(datos) });
        setMessage('Profesor actualizado correctamente.');
      } else {
        await apiFetch('/api/profesores', { method: 'POST', body: JSON.stringify(datos) });
        setMessage('Profesor dado de alta correctamente.');
      }
      setFormVisible(false);
      setFormData(PROFESOR_VACIO);
      await cargarProfesores();
    } catch (err) {
      setError(err.message);
    }
  };

  const cambiarEstado = async (profesor) => {
    const nuevoEstado = profesor.estado === 'Activo' ? 'Inactivo' : 'Activo';
    setError('');
    setMessage('');
    try {
      await apiFetch(`/api/profesores/${profesor.id}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({ estado: nuevoEstado })
      });
      await cargarProfesores();
    } catch (err) {
      setError(err.message);
    }
  };

  const eliminar = async (profesor) => {
    if (!window.confirm(`¿Eliminar a ${profesor.apellido}, ${profesor.nombre}? Esta acción no se puede deshacer.`)) return;
    setError('');
    setMessage('');
    try {
      await apiFetch(`/api/profesores/${profesor.id}`, { method: 'DELETE' });
      setMessage('Profesor eliminado.');
      await cargarProfesores();
    } catch (err) {
      setError(err.message);
    }
  };

  const verAsignaciones = async (profesor) => {
    setSeleccionado(profesor);
    setAsigError('');
    setAsigForm(ASIGNACION_VACIA);
    setAsigEditandoId(null);
    const data = await apiFetch(`/api/profesores/${profesor.id}/asignaciones`);
    setAsignaciones(data);
  };

  const handleAsigChange = (campo) => (e) => setAsigForm({ ...asigForm, [campo]: e.target.value });

  const recargarAsignaciones = async () => {
    const data = await apiFetch(`/api/profesores/${seleccionado.id}/asignaciones`);
    setAsignaciones(data);
  };

  const cancelarEdicionAsignacion = () => {
    setAsigEditandoId(null);
    setAsigForm(ASIGNACION_VACIA);
    setAsigError('');
  };

  const editarAsignacion = (asignacion) => {
    setAsigEditandoId(asignacion.id);
    setAsigForm({
      materia_id: String(asignacion.materia_id),
      curso_id: String(asignacion.curso_id),
      dia: asignacion.dia,
      hora_inicio: asignacion.hora_inicio,
      hora_fin: asignacion.hora_fin
    });
    setAsigError('');
  };

  const eliminarAsignacion = async (asignacion) => {
    setAsigError('');
    try {
      await apiFetch(`/api/profesores/${seleccionado.id}/asignaciones/${asignacion.id}`, { method: 'DELETE' });
      if (asigEditandoId === asignacion.id) cancelarEdicionAsignacion();
      await recargarAsignaciones();
    } catch (err) {
      setAsigError(err.message);
    }
  };

  const handleAsigSubmit = async (e) => {
    e.preventDefault();
    setAsigError('');
    const errorHorario = validarRangoHorario(asigForm.hora_inicio, asigForm.hora_fin);
    if (errorHorario) {
      setAsigError(errorHorario);
      return;
    }
    try {
      if (asigEditandoId) {
        await apiFetch(`/api/profesores/${seleccionado.id}/asignaciones/${asigEditandoId}`, {
          method: 'PUT',
          body: JSON.stringify(asigForm)
        });
        setAsigEditandoId(null);
      } else {
        await apiFetch(`/api/profesores/${seleccionado.id}/asignaciones`, {
          method: 'POST',
          body: JSON.stringify(asigForm)
        });
      }
      setAsigForm(ASIGNACION_VACIA);
      await recargarAsignaciones();
    } catch (err) {
      setAsigError(err.message);
    }
  };

  // Campos, error y botones del formulario. Los usan el alta (arriba de la tabla)
  // y la edición (en una ventana emergente).
  const contenidoFormulario = (
    <>
      <div className="form-grid">
        <label>
          Nombre
          <input value={formData.nombre} onChange={handleChange('nombre')} required />
          {errores.nombre && <small className="error">{errores.nombre}</small>}
        </label>
        <label>
          Apellido
          <input value={formData.apellido} onChange={handleChange('apellido')} required />
          {errores.apellido && <small className="error">{errores.apellido}</small>}
        </label>
        <label>
          DNI
          <input inputMode="numeric" value={formData.dni} onChange={handleChange('dni')} required />
          {errores.dni && <small className="error">{errores.dni}</small>}
        </label>
        <label>
          Email
          <input type="email" value={formData.email} onChange={handleChange('email')} required />
          {errores.email && <small className="error">{errores.email}</small>}
        </label>
        {!editingId && (
          <label>
            Contraseña de acceso
            <input type="password" value={formData.password} onChange={handleChange('password')} required />
            {errores.password && <small className="error">{errores.password}</small>}
          </label>
        )}
        <label>
          Especialidad
          <input value={formData.especialidad} onChange={handleChange('especialidad')} />
          {errores.especialidad && <small className="error">{errores.especialidad}</small>}
        </label>
        <label>
          Teléfono
          <input type="tel" inputMode="tel" value={formData.telefono} onChange={handleChange('telefono')} />
          {errores.telefono && <small className="error">{errores.telefono}</small>}
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="submit"><Save size={18} aria-hidden="true" />{editingId ? 'Guardar cambios' : 'Guardar profesor'}</button>
        <button type="button" className="secondary" onClick={() => setFormVisible(false)}>Cancelar</button>
      </div>
    </>
  );

  return (
    <div>
      <div className="page-header">
        <TituloSeccion principal icono={GraduationCap}>Profesores</TituloSeccion>
        <button onClick={abrirNuevo}><UserPlus size={18} aria-hidden="true" />Nuevo profesor</button>
      </div>

      {error && !formVisible && <p className="error">{error}</p>}

      {formVisible && !editingId && (
        <form className="card form-card" onSubmit={handleSubmit}>
          <TituloSeccion icono={UserPlus}>Alta de profesor</TituloSeccion>
          {contenidoFormulario}
        </form>
      )}

      {message && <p className="success">{message}</p>}

      <div className="tabla-scroll">
        <table className="data-table tabla-profesores">
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
              <tr key={p.id} className={p.estado === 'Inactivo' ? 'row-inactivo' : ''}>
                <td>
                  {p.apellido}, {p.nombre}
                  <span className="profesor-detalle">
                    {p.especialidad ? `${p.legajo} · ${p.especialidad}` : p.legajo}
                  </span>
                </td>
                <td>{p.dni}</td>
                <td>{p.email}</td>
                <td><span className={`badge ${p.estado.toLowerCase()}`}>{p.estado}</span></td>
                <td>
                  <div className="actions">
                    <button className="btn-accion btn-ver" onClick={() => verAsignaciones(p)}><IdCard size={16} aria-hidden="true" />Ver / asignar materias</button>
                    <button className="btn-accion btn-editar" onClick={() => abrirEdicion(p)}><Pencil size={16} aria-hidden="true" />Editar</button>
                    <button className={p.estado === 'Activo' ? 'btn-accion btn-baja' : 'btn-accion btn-reactivar'} onClick={() => cambiarEstado(p)}>
                      {p.estado === 'Activo'
                        ? <><ArrowDown size={16} aria-hidden="true" />Dar de baja</>
                        : <><RotateCcw size={16} aria-hidden="true" />Reactivar</>}
                    </button>
                    <button className="btn-accion btn-eliminar" onClick={() => eliminar(p)}><Trash2 size={16} aria-hidden="true" />Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {seleccionado && (
        <Modal
          icono={BookOpen}
          titulo={<>Materias asignadas a {seleccionado.nombre} {seleccionado.apellido}</>}
          onClose={() => setSeleccionado(null)}
          anchoMaximo={740}
        >

          {asignaciones.length === 0 && <p>Sin materias asignadas todavía.</p>}
          {asignaciones.length > 0 && (
            <div className="tabla-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <ThIcono icono={BookOpen}>Materia</ThIcono>
                    <ThIcono icono={GraduationCap}>Curso</ThIcono>
                    <ThIcono icono={Calendar}>Día</ThIcono>
                    <ThIcono icono={Clock}>Horario</ThIcono>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {asignaciones.map((a) => (
                    <tr key={a.id}>
                      <td>{a.materia_nombre}</td>
                      <td><span className="badge curso">{a.curso_nombre}</span></td>
                      <td>{a.dia}</td>
                      <td>{a.hora_inicio} - {a.hora_fin}</td>
                      <td>
                        <div className="actions actions-derecha">
                          <button
                            type="button"
                            className="btn-accion btn-editar btn-icono"
                            aria-label="Editar"
                            title="Editar"
                            onClick={() => editarAsignacion(a)}
                          >
                            <Pencil size={16} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="btn-accion btn-eliminar btn-icono"
                            aria-label="Eliminar"
                            title="Eliminar"
                            onClick={() => eliminarAsignacion(a)}
                          >
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
              {asigEditandoId ? (
                <>
                  <button type="submit"><Save size={18} aria-hidden="true" />Guardar cambios</button>
                  <button type="button" className="secondary" onClick={cancelarEdicionAsignacion}>Cancelar</button>
                </>
              ) : (
                <button type="submit"><Plus size={18} aria-hidden="true" />Asignar</button>
              )}
            </div>
          </form>
          {asigError && <p className="error">{asigError}</p>}
        </Modal>
      )}

      {formVisible && editingId && (
        <Modal
          icono={Pencil}
          titulo="Editar profesor"
          onClose={() => setFormVisible(false)}
          anchoMaximo={720}
        >
          <form onSubmit={handleSubmit}>
            {contenidoFormulario}
          </form>
        </Modal>
      )}
    </div>
  );
}
