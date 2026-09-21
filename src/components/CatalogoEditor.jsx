import { useEffect, useState } from 'react';
import { apiFetch } from '../api';

export default function CatalogoEditor({ titulo, ruta }) {
  const [items, setItems] = useState([]);
  const [nuevo, setNuevo] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [nombreEditado, setNombreEditado] = useState('');
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelado = false;
    apiFetch(`/api/${ruta}`)
      .then((data) => !cancelado && setItems(data))
      .catch((err) => !cancelado && setError(err.message));
    return () => { cancelado = true; };
  }, [ruta, version]);

  const ejecutar = async (path, method, nombre) => {
    setError('');
    try {
      await apiFetch(path, { method, body: nombre === undefined ? undefined : JSON.stringify({ nombre }) });
      setVersion((v) => v + 1);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  const agregar = async (e) => {
    e.preventDefault();
    if (await ejecutar(`/api/${ruta}`, 'POST', nuevo)) setNuevo('');
  };

  const guardarEdicion = async (id) => {
    if (await ejecutar(`/api/${ruta}/${id}`, 'PUT', nombreEditado)) setEditandoId(null);
  };

  return (
    <div className="card">
      <h3>{titulo}</h3>

      <form className="servicios-form" onSubmit={agregar}>
        <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nombre nuevo" required />
        <button type="submit">Agregar</button>
      </form>

      {error && <p className="error">{error}</p>}

      {items.length === 0 ? <p>No hay elementos cargados.</p> : (
        <ul className="servicios-lista">
          {items.map((item) => (
            <li key={item.id}>
              {editandoId === item.id ? (
                <>
                  <input value={nombreEditado} onChange={(e) => setNombreEditado(e.target.value)} />
                  <span className="actions">
                    <button className="link" onClick={() => guardarEdicion(item.id)}>Guardar</button>
                    <button className="link" onClick={() => setEditandoId(null)}>Cancelar</button>
                  </span>
                </>
              ) : (
                <>
                  <span>{item.nombre}</span>
                  <span className="actions">
                    <button className="link" onClick={() => { setEditandoId(item.id); setNombreEditado(item.nombre); setError(''); }}>Editar</button>
                    <button className="link" onClick={() => ejecutar(`/api/${ruta}/${item.id}`, 'DELETE')}>Eliminar</button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
