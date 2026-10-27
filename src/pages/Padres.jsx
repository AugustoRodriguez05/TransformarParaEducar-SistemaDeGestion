import { useEffect, useState } from 'react';
import {
  ArrowDown, GraduationCap, Mail, Pencil, Plus, RotateCcw, Save, Search, Trash2, User, UserPlus, UsersRound, X
} from 'lucide-react';
import { apiFetch } from '../api';
import Modal from '../components/Modal';
import TituloSeccion from '../components/TituloSeccion';
import {
  limpiar, soloErrores, validarEmail, validarNombrePersona, validarPasswordNueva
} from '../validaciones';
import './Padres.css';

const PADRE_VACIO = { nombre: '', apellido: '', email: '', password: '' };

const MIN_BUSQUEDA = 2;
const MAX_RESULTADOS = 10;

// Minúsculas y sin tildes, para que la búsqueda no los distinga.
const normalizar = (texto) => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// Buscador para vincular un alumno: filtra en el navegador los alumnos ya cargados
// por apellido, nombre, legajo o DNI. Con el teclado: flechas para moverse por los
// resultados, Enter para elegir y Esc para cerrar.
function BuscadorAlumno({ id, alumnos, onElegir, onCancelar }) {
  const [texto, setTexto] = useState('');
  const [activo, setActivo] = useState(0);
  const [enviando, setEnviando] = useState(false);

  const buscando = texto.trim().length >= MIN_BUSQUEDA;
  const palabras = normalizar(texto.trim()).split(/\s+/);
  const resultados = buscando
    ? alumnos
      .filter((a) => {
        const datos = normalizar(`${a.apellido} ${a.nombre} ${a.legajo} ${a.dni}`);
        return palabras.every((p) => datos.includes(p));
      })
      .slice(0, MAX_RESULTADOS)
    : [];
  const listaId = `buscador-alumno-${id}`;
  const opcionId = (i) => `${listaId}-${i}`;

  // Si el vínculo falla, el buscador queda abierto para volver a intentar.
  const elegir = async (alumno) => {
    if (enviando) return;
    setEnviando(true);
    if (!(await onElegir(alumno))) setEnviando(false);
  };

  const manejarTeclas = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancelar();
    } else if (e.key === 'ArrowDown' && resultados.length > 0) {
      e.preventDefault();
      setActivo((i) => (i + 1) % resultados.length);
    } else if (e.key === 'ArrowUp' && resultados.length > 0) {
      e.preventDefault();
      setActivo((i) => (i - 1 + resultados.length) % resultados.length);
    } else if (e.key === 'Enter' && resultados[activo]) {
      e.preventDefault();
      elegir(resultados[activo]);
    }
  };

  return (
    <div className="padre-buscador">
      <div className="padre-buscador-fila">
        <span className="padre-buscador-campo">
          <Search size={18} aria-hidden="true" />
          <input
            autoFocus
            role="combobox"
            aria-label="Buscar alumno"
            aria-autocomplete="list"
            aria-expanded={buscando && resultados.length > 0}
            aria-controls={listaId}
            aria-activedescendant={resultados[activo] ? opcionId(activo) : undefined}
            placeholder="Buscar por apellido, nombre, legajo o DNI"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setActivo(0);
            }}
            onKeyDown={manejarTeclas}
          />
        </span>
        <button type="button" className="secondary" onClick={onCancelar}>Cancelar</button>
      </div>

      {buscando && (resultados.length === 0 ? <p className="padre-buscador-vacio">Sin resultados</p> : (
        <ul className="padre-buscador-resultados" id={listaId} role="listbox" aria-label="Alumnos encontrados">
          {resultados.map((a, i) => (
            <li
              key={a.id}
              id={opcionId(i)}
              role="option"
              aria-selected={i === activo}
              className={i === activo ? 'activo' : ''}
              // El foco queda en el campo de texto para seguir usando el teclado
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActivo(i)}
              onClick={() => elegir(a)}
            >
              <span className="padre-buscador-nombre">{a.apellido}, {a.nombre}</span>
              {' '}<span className="padre-buscador-detalle">· {a.legajo}</span>
              {a.curso_nombre && <>{' '}<span className="padre-buscador-detalle">· {a.curso_nombre}</span></>}
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

export default function Padres() {
  const [padres, setPadres] = useState([]);
  const [alumnos, setAlumnos] = useState([]);
  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(PADRE_VACIO);
  // Padres con el buscador de vincular abierto (por id)
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

  const vincular = async (padre, alumno) => {
    const ok = await ejecutar(`/api/padres/${padre.id}/alumnos`, 'POST', { alumno_id: alumno.id });
    if (ok) cerrarVincular(padre);
    return ok;
  };

  const cerrarVincular = (padre) => setVinculando((v) => ({ ...v, [padre.id]: false }));

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
        const disponibles = alumnos.filter((a) => a.estado === 'Activo' && !p.hijos.some((h) => h.id === a.id));
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
              <BuscadorAlumno
                id={p.id}
                alumnos={disponibles}
                onElegir={(alumno) => vincular(p, alumno)}
                onCancelar={() => cerrarVincular(p)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
