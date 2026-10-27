import { useEffect, useState } from 'react';
import {
  ArrowDown, GraduationCap, Link, Mail, Pencil, Plus, RotateCcw, Save, Trash2, User, UserPlus, UsersRound, X
} from 'lucide-react';
import { apiFetch } from '../api';
import Modal from '../components/Modal';
import TituloSeccion from '../components/TituloSeccion';
import {
  limpiar, soloErrores, validarEmail, validarNombrePersona, validarPasswordNueva
} from '../validaciones';
import './Padres.css';

const PADRE_VACIO = { nombre: '', apellido: '', email: '', password: '' };

export default function Padres() {
  const [padres, setPadres] = useState([]);
  const [alumnos, setAlumnos] = useState([]);
  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(PADRE_VACIO);
  const [alumnoAVincular, setAlumnoAVincular] = useState({});
  // Padres con el selector de vincular abierto (por id)
  const [vinculando, setVinculando] = useState({});
  const [error, setError] = useState('');
  const [errores, setErrores] = useState({});
  const [mensaje, setMensaje] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelado = false;
    Promise.all([apiFetch('/api/padres'), apiFetch('/api/alumnos')])
      .then(([p, a]) => {
        if (cancelado) return;
        setPadres(p);
        setAlumnos(a);
      })
      .catch((err) => !cancelado && setError(err.message));
    return () => { cancelado = true; };
  }, [version]);

  const handleChange = (campo) => (e) => setFormData({ ...formData, [campo]: e.target.value });

  const ejecutar = async (path, method, body) => {
    setError('');
    setMensaje('');
    try {
      await apiFetch(path, { method, body: body ? JSON.stringify(body) : undefined });
      setVersion((v) => v + 1);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  const abrirNuevo = () => {
    setEditingId(null);
    setFormData(PADRE_VACIO);
    setError('');
    setErrores({});
    setMensaje('');
    setFormVisible(true);
  };

  const abrirEdicion = (padre) => {
    setEditingId(padre.id);
    setFormData({ nombre: padre.nombre, apellido: padre.apellido, email: padre.email, password: '' });
    setError('');
    setErrores({});
    setMensaje('');
    setFormVisible(true);
  };

  const cambiarEstado = async (padre) => {
    await ejecutar(`/api/padres/${padre.id}/estado`, 'PATCH', { estado: padre.activo ? 'Inactivo' : 'Activo' });
  };

  const eliminar = async (padre) => {
    if (!window.confirm(`¿Eliminar a ${padre.apellido}, ${padre.nombre}? Esta acción no se puede deshacer.`)) return;
    if (await ejecutar(`/api/padres/${padre.id}`, 'DELETE')) {
      if (editingId === padre.id) setFormVisible(false);
      setMensaje('Padre/tutor eliminado.');
    }
  };

  const crearPadre = async (e) => {
    e.preventDefault();
    const datos = {
      ...formData,
      nombre: limpiar(formData.nombre),
      apellido: limpiar(formData.apellido),
      email: limpiar(formData.email)
    };
    const encontrados = soloErrores({
      nombre: validarNombrePersona(datos.nombre, 'nombre'),
      apellido: validarNombrePersona(datos.apellido, 'apellido'),
      email: validarEmail(datos.email),
      password: editingId ? null : validarPasswordNueva(datos.password)
    });
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    const ok = editingId
      ? await ejecutar(`/api/padres/${editingId}`, 'PUT', datos)
      : await ejecutar('/api/padres', 'POST', datos);
    if (ok) {
      setMensaje(editingId ? 'Padre/tutor actualizado correctamente.' : 'Padre/tutor dado de alta correctamente.');
      setFormVisible(false);
      setFormData(PADRE_VACIO);
    }
  };

  const vincular = async (padre) => {
    const alumnoId = alumnoAVincular[padre.id];
    if (!alumnoId) return;
    if (await ejecutar(`/api/padres/${padre.id}/alumnos`, 'POST', { alumno_id: alumnoId })) {
      cerrarVincular(padre);
    }
  };

  const cerrarVincular = (padre) => {
    setAlumnoAVincular({ ...alumnoAVincular, [padre.id]: '' });
    setVinculando({ ...vinculando, [padre.id]: false });
  };

  // Campos y botones del formulario. Los usan el alta (arriba de la lista)
  // y la edición (en una ventana emergente).
  const camposFormulario = (
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
    </div>
  );

  const accionesFormulario = (
    <div className="form-actions">
      <button type="submit"><Save size={18} aria-hidden="true" />{editingId ? 'Guardar cambios' : 'Guardar'}</button>
      <button type="button" className="secondary" onClick={() => setFormVisible(false)}>Cancelar</button>
    </div>
  );

  return (
    <div className="padres">
      {formVisible && editingId && (
        <Modal
          icono={Pencil}
          titulo="Editar padre/tutor"
          onClose={() => setFormVisible(false)}
          anchoMaximo={720}
        >
          <form onSubmit={crearPadre}>
            {camposFormulario}
            {/* En la pantalla el error se muestra debajo del formulario; acá, dentro de la ventana */}
            {error && <p className="error">{error}</p>}
            {accionesFormulario}
          </form>
        </Modal>
      )}

      <div className="page-header">
        <TituloSeccion principal icono={UsersRound}>Padres y tutores</TituloSeccion>
        <button onClick={abrirNuevo}><UserPlus size={18} aria-hidden="true" />Nuevo padre/tutor</button>
      </div>

      {formVisible && !editingId && (
        <form className="card form-card" onSubmit={crearPadre}>
          <TituloSeccion icono={UserPlus}>Alta de padre/tutor</TituloSeccion>
          {camposFormulario}
          {accionesFormulario}
        </form>
      )}

      {error && <p className="error">{error}</p>}
      {mensaje && <p className="success">{mensaje}</p>}

      {padres.length === 0 ? <p>No hay padres o tutores cargados.</p> : padres.map((p) => {
        const disponibles = alumnos.filter((a) => !p.hijos.some((h) => h.id === a.id));
        return (
          <div className="card padre-card" key={p.id}>
            <div className="padre-encabezado">
              <div className="padre-identidad">
                <span className="padre-avatar"><User size={24} aria-hidden="true" /></span>
                <div className="padre-datos">
                  <h3>
                    <span className="padre-nombre">{p.apellido}, {p.nombre}</span>
                    <span className={`badge ${p.activo ? 'activo' : 'inactivo'}`}>{p.activo ? 'Activo' : 'Inactivo'}</span>
                  </h3>
                  <span className="padre-email"><Mail size={16} aria-hidden="true" />{p.email}</span>
                </div>
              </div>
              <div className="actions">
                <button className="btn-accion btn-editar" onClick={() => abrirEdicion(p)}><Pencil size={16} aria-hidden="true" />Editar</button>
                <button className={p.activo ? 'btn-accion btn-baja' : 'btn-accion btn-reactivar'} onClick={() => cambiarEstado(p)}>
                  {p.activo
                    ? <><ArrowDown size={16} aria-hidden="true" />Dar de baja</>
                    : <><RotateCcw size={16} aria-hidden="true" />Reactivar</>}
                </button>
                <button className="btn-accion btn-eliminar" onClick={() => eliminar(p)}><Trash2 size={16} aria-hidden="true" />Eliminar</button>
              </div>
            </div>

            <h4 className="padre-subtitulo">
              <UsersRound size={18} aria-hidden="true" />Alumnos vinculados ({p.hijos.length})
            </h4>

            {p.hijos.length === 0 ? <p>Sin alumnos vinculados.</p> : (
              <ul className="padre-hijos">
                {p.hijos.map((h) => (
                  <li key={h.id}>
                    <span className="padre-hijo">
                      <span className="padre-hijo-icono"><GraduationCap size={16} aria-hidden="true" /></span>
                      <span className="padre-hijo-nombre">{h.apellido}, {h.nombre}</span>
                      <span className="padre-hijo-legajo">Legajo {h.legajo}</span>
                    </span>
                    <button className="btn-accion btn-cancelar" onClick={() => ejecutar(`/api/padres/${p.id}/alumnos/${h.id}`, 'DELETE')}><X size={16} aria-hidden="true" />Quitar</button>
                  </li>
                ))}
              </ul>
            )}

            {!vinculando[p.id] ? (
              <button className="padre-vincular-abrir" onClick={() => setVinculando({ ...vinculando, [p.id]: true })}>
                <Plus size={18} aria-hidden="true" />Vincular alumno
              </button>
            ) : (
              <div className="padre-vincular">
                <span className="padre-select">
                  <GraduationCap size={18} aria-hidden="true" />
                  <select
                    aria-label="Vincular alumno"
                    value={alumnoAVincular[p.id] || ''}
                    onChange={(e) => setAlumnoAVincular({ ...alumnoAVincular, [p.id]: e.target.value })}
                  >
                    <option value="">Vincular alumno…</option>
                    {disponibles.map((a) => (
                      <option key={a.id} value={a.id}>{a.apellido}, {a.nombre} ({a.legajo})</option>
                    ))}
                  </select>
                </span>
                <button disabled={!alumnoAVincular[p.id]} onClick={() => vincular(p)}><Link size={18} aria-hidden="true" />Vincular</button>
                <button className="secondary" onClick={() => cerrarVincular(p)}>Cancelar</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
