import { useEffect, useState } from 'react';
import { apiFetch } from '../api';

const PADRE_VACIO = { nombre: '', apellido: '', email: '', password: '' };

export default function Padres() {
  const [padres, setPadres] = useState([]);
  const [alumnos, setAlumnos] = useState([]);
  const [formVisible, setFormVisible] = useState(false);
  const [formData, setFormData] = useState(PADRE_VACIO);
  const [alumnoAVincular, setAlumnoAVincular] = useState({});
  const [error, setError] = useState('');
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
    if (await ejecutar('/api/padres', 'POST', formData)) {
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
        <h2>Padres y tutores</h2>
        <button onClick={() => { setFormVisible(true); setError(''); setMensaje(''); }}>Nuevo padre/tutor</button>
      </div>

      {formVisible && (
        <form className="card form-card" onSubmit={crearPadre}>
          <h3>Alta de padre/tutor</h3>
          <div className="form-grid">
            <label>Nombre<input value={formData.nombre} onChange={handleChange('nombre')} required /></label>
            <label>Apellido<input value={formData.apellido} onChange={handleChange('apellido')} required /></label>
            <label>Email<input type="email" value={formData.email} onChange={handleChange('email')} required /></label>
            <label>Contraseña de acceso<input type="password" value={formData.password} onChange={handleChange('password')} required /></label>
          </div>
          <div className="form-actions">
            <button type="submit">Guardar</button>
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
            <h3>{p.apellido}, {p.nombre} <small>{p.email}</small></h3>

            {p.hijos.length === 0 ? <p>Sin alumnos vinculados.</p> : (
              <ul className="servicios-lista">
                {p.hijos.map((h) => (
                  <li key={h.id}>
                    <span>{h.apellido}, {h.nombre} — legajo {h.legajo}</span>
                    <button className="link" onClick={() => ejecutar(`/api/padres/${p.id}/alumnos/${h.id}`, 'DELETE')}>Quitar</button>
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
              <button disabled={!alumnoAVincular[p.id]} onClick={() => vincular(p)}>Vincular</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
