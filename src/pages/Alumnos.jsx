import { useEffect, useState } from 'react';
import {
  ArrowDown, BadgeCheck, ClipboardList, Eye, FileText, GraduationCap, Hash, IdCard, KeyRound,
  Pencil, RotateCcw, Save, Search, Trash2, User, UserPlus, Users
} from 'lucide-react';
import { apiFetch } from '../api';
import FichaAlumno from '../components/FichaAlumno';
import Modal from '../components/Modal';
import ServiciosAlumno from '../components/ServiciosAlumno';
import ThIcono from '../components/ThIcono';
import TituloSeccion from '../components/TituloSeccion';
import {
  limpiar, soloErrores, validarDni, validarDomicilio, validarEmail, validarFechaNacimiento,
  validarNombrePersona, validarPasswordNueva, validarTelefono
} from '../validaciones';

const ALUMNO_VACIO = {
  nombre: '', apellido: '', dni: '', fecha_nacimiento: '', curso_id: '', domicilio: '', telefono: '', email: ''
};

export default function Alumnos() {
  const [query, setQuery] = useState('');
  const [alumnos, setAlumnos] = useState([]);
  const [cursos, setCursos] = useState([]);
  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(ALUMNO_VACIO);
  const [error, setError] = useState('');
  const [errores, setErrores] = useState({});
  const [message, setMessage] = useState('');
  const [buscado, setBuscado] = useState(false);
  const [alumnoServicios, setAlumnoServicios] = useState(null);
  const [alumnoFicha, setAlumnoFicha] = useState(null);
  // Formulario "Crear acceso" de la ficha: null mientras está cerrado.
  const [acceso, setAcceso] = useState(null);
  const [erroresAcceso, setErroresAcceso] = useState({});

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
    setErrores({});
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
      curso_id: alumno.curso_id || '',
      domicilio: alumno.domicilio || '',
      telefono: alumno.telefono || '',
      email: alumno.email || ''
    });
    setError('');
    setErrores({});
    setMessage('');
    setFormVisible(true);
  };

  const handleChange = (campo) => (e) => setFormData({ ...formData, [campo]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    const datos = {
      ...formData,
      nombre: limpiar(formData.nombre),
      apellido: limpiar(formData.apellido),
      dni: limpiar(formData.dni),
      domicilio: limpiar(formData.domicilio),
      telefono: limpiar(formData.telefono),
      email: limpiar(formData.email)
    };
    const encontrados = soloErrores({
      nombre: validarNombrePersona(datos.nombre, 'nombre'),
      apellido: validarNombrePersona(datos.apellido, 'apellido'),
      dni: validarDni(datos.dni),
      fecha_nacimiento: validarFechaNacimiento(datos.fecha_nacimiento),
      domicilio: validarDomicilio(datos.domicilio),
      telefono: validarTelefono(datos.telefono),
      email: datos.email ? validarEmail(datos.email) : null
    });
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    try {
      if (editingId) {
        await apiFetch(`/api/alumnos/${editingId}`, { method: 'PUT', body: JSON.stringify(datos) });
        setMessage('Legajo actualizado correctamente.');
      } else {
        await apiFetch('/api/alumnos', { method: 'POST', body: JSON.stringify(datos) });
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
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  const eliminar = async (alumno) => {
    if (!window.confirm(`¿Eliminar a ${alumno.apellido}, ${alumno.nombre}? Esta acción no se puede deshacer.`)) return false;
    setError('');
    setMessage('');
    try {
      await apiFetch(`/api/alumnos/${alumno.id}`, { method: 'DELETE' });
      if (alumnoServicios?.id === alumno.id) setAlumnoServicios(null);
      setMessage('Alumno eliminado.');
      await cargarAlumnos(query);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  // Ficha del alumno: sus acciones reutilizan las mismas funciones que la tabla.
  const abrirFicha = (alumno) => {
    setError('');
    setAcceso(null);
    setAlumnoFicha(alumno);
  };

  // Crea el usuario del alumno con su email; si no tiene, se pide en el formulario.
  const abrirAcceso = () => {
    setError('');
    setErroresAcceso({});
    setAcceso({ email: '', password: '' });
  };

  const crearAcceso = async (e) => {
    e.preventDefault();
    const email = limpiar(acceso.email);
    const encontrados = soloErrores({
      email: alumnoFicha.email ? null : validarEmail(email),
      password: validarPasswordNueva(acceso.password)
    });
    setErroresAcceso(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    setError('');
    try {
      const actualizado = await apiFetch(`/api/alumnos/${alumnoFicha.id}/acceso`, {
        method: 'POST',
        body: JSON.stringify({ email, password: acceso.password })
      });
      setAlumnoFicha(actualizado);
      setAcceso(null);
      await cargarAlumnos(query);
    } catch (err) {
      setError(err.message);
    }
  };

  const editarDesdeFicha = () => {
    const alumno = alumnoFicha;
    setAlumnoFicha(null);
    abrirEdicion(alumno);
  };

  const cambiarEstadoDesdeFicha = async () => {
    const alumno = alumnoFicha;
    setError('');
    if (await cambiarEstado(alumno)) {
      setAlumnoFicha({ ...alumno, estado: alumno.estado === 'Activo' ? 'Inactivo' : 'Activo' });
    }
  };

  const eliminarDesdeFicha = async () => {
    if (await eliminar(alumnoFicha)) setAlumnoFicha(null);
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
          Fecha de nacimiento
          <input type="date" value={formData.fecha_nacimiento} onChange={handleChange('fecha_nacimiento')} required />
          {errores.fecha_nacimiento && <small className="error">{errores.fecha_nacimiento}</small>}
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
        <label>
          Domicilio
          <input value={formData.domicilio} onChange={handleChange('domicilio')} />
          {errores.domicilio && <small className="error">{errores.domicilio}</small>}
        </label>
        <label>
          Teléfono
          <input type="tel" inputMode="tel" value={formData.telefono} onChange={handleChange('telefono')} />
          {errores.telefono && <small className="error">{errores.telefono}</small>}
        </label>
        <label>
          Email
          <input type="email" value={formData.email} onChange={handleChange('email')} />
          {errores.email && <small className="error">{errores.email}</small>}
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="form-actions">
        <button type="submit"><Save size={18} aria-hidden="true" />{editingId ? 'Guardar cambios' : 'Guardar alumno'}</button>
        <button type="button" className="secondary" onClick={() => setFormVisible(false)}>Cancelar</button>
      </div>
    </>
  );

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

      {formVisible && !editingId && (
        <form className="card form-card" onSubmit={handleSubmit}>
          <TituloSeccion icono={UserPlus}>Alta de alumno</TituloSeccion>
          {contenidoFormulario}
        </form>
      )}

      {message && <p className="success">{message}</p>}

      {buscado && alumnos.length === 0 && <p>No se encontraron alumnos.</p>}

      {alumnos.length > 0 && (
        <div className="tabla-scroll">
          <table className="data-table tabla-tarjetas">
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
                  <td data-label="Legajo">{a.legajo}</td>
                  <td data-label="Apellido y Nombre">
                    <button type="button" className="btn-texto" onClick={() => abrirFicha(a)}>{a.apellido}, {a.nombre}</button>
                  </td>
                  <td data-label="DNI">{a.dni}</td>
                  <td data-label="Curso">{a.curso_nombre ? <span className="badge curso">{a.curso_nombre}</span> : '—'}</td>
                  <td data-label="Estado"><span className={`badge ${a.estado.toLowerCase()}`}>{a.estado}</span></td>
                  <td>
                    <div className="actions">
                      <button
                        type="button"
                        className="btn-accion btn-ver btn-icono"
                        aria-label="Ver ficha"
                        title="Ver ficha"
                        onClick={() => abrirFicha(a)}
                      >
                        <Eye size={16} aria-hidden="true" />
                      </button>
                      <button className="btn-accion btn-editar" onClick={() => abrirEdicion(a)}><Pencil size={16} aria-hidden="true" />Editar</button>
                      {a.estado === 'Activo' && (
                        <button className="btn-accion btn-ver" onClick={() => setAlumnoServicios(a)}><IdCard size={16} aria-hidden="true" />Servicios</button>
                      )}
                      <button className={a.estado === 'Activo' ? 'btn-accion btn-baja' : 'btn-accion btn-reactivar'} onClick={() => cambiarEstado(a)}>
                        {a.estado === 'Activo'
                          ? <><ArrowDown size={16} aria-hidden="true" />Dar de baja</>
                          : <><RotateCcw size={16} aria-hidden="true" />Reactivar</>}
                      </button>
                      <button className="btn-accion btn-eliminar" onClick={() => eliminar(a)}><Trash2 size={16} aria-hidden="true" />Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {alumnoServicios && (
        <Modal
          icono={ClipboardList}
          titulo={<>Servicios de {alumnoServicios.nombre} {alumnoServicios.apellido}</>}
          onClose={() => setAlumnoServicios(null)}
        >
          <ServiciosAlumno key={alumnoServicios.id} alumnoId={alumnoServicios.id} />
        </Modal>
      )}

      {alumnoFicha && (
        <Modal
          icono={User}
          titulo={<>Ficha de {alumnoFicha.apellido}, {alumnoFicha.nombre}</>}
          onClose={() => setAlumnoFicha(null)}
          anchoMaximo={820}
          subtitulo={<span className={`badge ${alumnoFicha.estado.toLowerCase()}`}>{alumnoFicha.estado}</span>}
          acciones={(
            <>
              <button className="btn-accion btn-editar" onClick={editarDesdeFicha}><Pencil size={16} aria-hidden="true" />Editar</button>
              <button className={alumnoFicha.estado === 'Activo' ? 'btn-accion btn-baja' : 'btn-accion btn-reactivar'} onClick={cambiarEstadoDesdeFicha}>
                {alumnoFicha.estado === 'Activo'
                  ? <><ArrowDown size={16} aria-hidden="true" />Dar de baja</>
                  : <><RotateCcw size={16} aria-hidden="true" />Reactivar</>}
              </button>
              <button className="btn-accion btn-eliminar" onClick={eliminarDesdeFicha}><Trash2 size={16} aria-hidden="true" />Eliminar</button>
              {!alumnoFicha.usuario_id && !acceso && (
                <button className="btn-accion btn-confirmar" onClick={abrirAcceso}><KeyRound size={16} aria-hidden="true" />Crear acceso</button>
              )}
            </>
          )}
        >
          {acceso && (
            <form onSubmit={crearAcceso}>
              <div className="form-grid">
                {!alumnoFicha.email && (
                  <label>
                    Email
                    <input
                      type="email"
                      value={acceso.email}
                      onChange={(e) => setAcceso({ ...acceso, email: e.target.value })}
                      required
                    />
                    {erroresAcceso.email && <small className="error">{erroresAcceso.email}</small>}
                  </label>
                )}
                <label>
                  Contraseña de acceso
                  <input
                    type="password"
                    value={acceso.password}
                    onChange={(e) => setAcceso({ ...acceso, password: e.target.value })}
                    required
                  />
                  {erroresAcceso.password && <small className="error">{erroresAcceso.password}</small>}
                </label>
              </div>
              <div className="form-actions">
                <button type="submit"><KeyRound size={18} aria-hidden="true" />Crear acceso</button>
                <button type="button" className="secondary" onClick={() => setAcceso(null)}>Cancelar</button>
              </div>
            </form>
          )}
          {error && <p className="error">{error}</p>}
          <FichaAlumno key={alumnoFicha.id} alumno={alumnoFicha} />
        </Modal>
      )}

      {formVisible && editingId && (
        <Modal
          icono={Pencil}
          titulo="Editar legajo"
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
