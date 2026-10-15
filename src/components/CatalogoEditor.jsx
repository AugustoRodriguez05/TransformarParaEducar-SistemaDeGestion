import { useEffect, useState } from 'react';
import { Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { apiFetch } from '../api';
import TituloSeccion from './TituloSeccion';
import { limpiar, validarNombreCatalogo } from '../validaciones';

export default function CatalogoEditor({ titulo, ruta, icono }) {
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
    const nombre = limpiar(nuevo);
    const errorNombre = validarNombreCatalogo(nombre);
    if (errorNombre) {
      setError(errorNombre);
      return;
    }
    if (await ejecutar(`/api/${ruta}`, 'POST', nombre)) setNuevo('');
  };

  const guardarEdicion = async (id) => {
    const nombre = limpiar(nombreEditado);
    const errorNombre = validarNombreCatalogo(nombre);
    if (errorNombre) {
      setError(errorNombre);
      return;
    }
    if (await ejecutar(`/api/${ruta}/${id}`, 'PUT', nombre)) setEditandoId(null);
  };

  return (
    <div className="card">
      <TituloSeccion icono={icono}>{titulo}</TituloSeccion>

      <form className="servicios-form" onSubmit={agregar}>
        <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nombre nuevo" required />
        <button type="submit"><Plus size={18} aria-hidden="true" />Agregar</button>
      </form>

      {error && <p className="error">{error}</p>}

      {items.length === 0 ? <p>No hay elementos cargados.</p> : (
        <ul className="servicios-lista lista-catalogo">
          {items.map((item) => (
            <li key={item.id}>
              {editandoId === item.id ? (
                <>
                  <input value={nombreEditado} onChange={(e) => setNombreEditado(e.target.value)} />
                  <span className="actions">
                    <button className="btn-accion btn-confirmar" onClick={() => guardarEdicion(item.id)}><Save size={16} aria-hidden="true" />Guardar</button>
                    <button className="btn-accion btn-cancelar" onClick={() => setEditandoId(null)}><X size={16} aria-hidden="true" />Cancelar</button>
                  </span>
                </>
              ) : (
                <>
                  <span>{item.nombre}</span>
                  <span className="actions">
                    <button className="btn-accion btn-editar" onClick={() => { setEditandoId(item.id); setNombreEditado(item.nombre); setError(''); }}><Pencil size={16} aria-hidden="true" />Editar</button>
                    <button className="btn-accion btn-eliminar" onClick={() => ejecutar(`/api/${ruta}/${item.id}`, 'DELETE')}><Trash2 size={16} aria-hidden="true" />Eliminar</button>
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
