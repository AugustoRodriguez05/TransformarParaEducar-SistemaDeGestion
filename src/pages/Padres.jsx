import { useEffect, useState } from 'react';
import { Link, Save, User, UserPlus, UsersRound, X } from 'lucide-react';
import { apiFetch } from '../api';
import TituloSeccion from '../components/TituloSeccion';
import {
  limpiar, soloErrores, validarEmail, validarNombrePersona, validarPasswordNueva
} from '../validaciones';

const PADRE_VACIO = { nombre: '', apellido: '', email: '', password: '' };

export default function Padres() {
  const [padres, setPadres] = useState([]);
  const [alumnos, setAlumnos] = useState([]);
  const [formVisible, setFormVisible] = useState(false);
  const [formData, setFormData] = useState(PADRE_VACIO);
  const [alumnoAVincular, setAlumnoAVincular] = useState({});
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
      password: validarPasswordNueva(datos.password)
    });
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    if (await ejecutar('/api/padres', 'POST', datos)) {
      setMensaje('Padre/tutor dado de alta correctamente.');
      setFormVisible(false);
      setFormData(PADRE_VACIO);
    }
  };

  const vincular = async (padre) => {
    const alumnoId = alumnoAVincular[padre.id];
    if (!alumnoId) return;
    if (await ejecutar(`/api/padres/${padre.id}/alumnos`, 'POST', { alumno_id: alumnoId })) {
      setAlumnoAVincular({ ...alumnoAVincular, [padre.id]: '' });
    }
  };

  return (
    <div>
      <div className="page-header">
        <TituloSeccion principal icono={UsersRound}>Padres y tutores</TituloSeccion>
        <button onClick={() => { setFormVisible(true); setError(''); setErrores({}); setMensaje(''); }}><UserPlus size={18} aria-hidden="true" />Nuevo padre/tutor</button>
      </div>

      {formVisible && (
        <form className="card form-card" onSubmit={crearPadre}>
          <TituloSeccion icono={UserPlus}>Alta de padre/tutor</TituloSeccion>
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
            <label>
              Contraseña de acceso
              <input type="password" value={formData.password} onChange={handleChange('password')} required />
              {errores.password && <small className="error">{errores.password}</small>}
            </label>
          </div>
          <div className="form-actions">
            <button type="submit"><Save size={18} aria-hidden="true" />Guardar</button>
            <button type="button" className="secondary" onClick={() => setFormVisible(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {error && <p className="error">{error}</p>}
      {mensaje && <p className="success">{mensaje}</p>}

      {padres.length === 0 ? <p>No hay padres o tutores cargados.</p> : padres.map((p) => {
        const disponibles = alumnos.filter((a) => !p.hijos.some((h) => h.id === a.id));
        return (
          <div className="card" key={p.id}>
            <TituloSeccion icono={User}>{p.apellido}, {p.nombre} <small>{p.email}</small></TituloSeccion>

            {p.hijos.length === 0 ? <p>Sin alumnos vinculados.</p> : (
              <ul className="servicios-lista">
                {p.hijos.map((h) => (
                  <li key={h.id}>
                    <span>{h.apellido}, {h.nombre} — legajo {h.legajo}</span>
                    <button className="accion accion-cancelar" onClick={() => ejecutar(`/api/padres/${p.id}/alumnos/${h.id}`, 'DELETE')}><X size={16} aria-hidden="true" />Quitar</button>
                  </li>
                ))}
              </ul>
            )}

            <div className="servicios-form">
              <select
                value={alumnoAVincular[p.id] || ''}
                onChange={(e) => setAlumnoAVincular({ ...alumnoAVincular, [p.id]: e.target.value })}
              >
                <option value="">Vincular alumno…</option>
                {disponibles.map((a) => (
                  <option key={a.id} value={a.id}>{a.apellido}, {a.nombre} ({a.legajo})</option>
                ))}
              </select>
              <button disabled={!alumnoAVincular[p.id]} onClick={() => vincular(p)}><Link size={18} aria-hidden="true" />Vincular</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
