import { useEffect, useState } from 'react';
import { Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { apiFetch } from '../api';
import TituloSeccion from './TituloSeccion';
import { NIVELES, limpiar, validarNivel, validarNombreCatalogo } from '../validaciones';

// conNivel: el catálogo tiene además nivel educativo (solo cursos).
export default function CatalogoEditor({ titulo, ruta, icono, conNivel = false }) {
  const [items, setItems] = useState([]);
  const [nuevo, setNuevo] = useState('');
  const [nuevoNivel, setNuevoNivel] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [nombreEditado, setNombreEditado] = useState('');
  const [nivelEditado, setNivelEditado] = useState('');
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelado = false;
    apiFetch(`/api/${ruta}`)
      .then((data) => !cancelado && setItems(data))
      .catch((err) => !cancelado && setError(err.message));
    return () => { cancelado = true; };
  }, [ruta, version]);

  const ejecutar = async (path, method, datos) => {
    setError('');
    try {
      await apiFetch(path, { method, body: datos === undefined ? undefined : JSON.stringify(datos) });
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
    const errorDatos = validarNombreCatalogo(nombre) || (conNivel ? validarNivel(nuevoNivel) : null);
    if (errorDatos) {
      setError(errorDatos);
      return;
    }
    const datos = conNivel ? { nombre, nivel: nuevoNivel } : { nombre };
    if (await ejecutar(`/api/${ruta}`, 'POST', datos)) {
      setNuevo('');
      setNuevoNivel('');
    }
  };

  // Un curso cargado antes de que existiera el nivel se puede guardar sin elegirlo.
  const guardarEdicion = async (id) => {
    const nombre = limpiar(nombreEditado);
    const errorDatos = validarNombreCatalogo(nombre) || (conNivel && nivelEditado ? validarNivel(nivelEditado) : null);
    if (errorDatos) {
      setError(errorDatos);
      return;
    }
    const datos = conNivel ? { nombre, nivel: nivelEditado } : { nombre };
    if (await ejecutar(`/api/${ruta}/${id}`, 'PUT', datos)) setEditandoId(null);
  };

  const editar = (item) => {
    setEditandoId(item.id);
    setNombreEditado(item.nombre);
    setNivelEditado(item.nivel || '');
    setError('');
  };

  return (
    <div className="card">
      <TituloSeccion icono={icono}>{titulo}</TituloSeccion>

      <form className="servicios-form" onSubmit={agregar}>
        <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nombre nuevo" required />
        {conNivel && (
          <select value={nuevoNivel} onChange={(e) => setNuevoNivel(e.target.value)} aria-label="Nivel" required>
            <option value="">Nivel</option>
            {NIVELES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
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
                  {conNivel && (
                    <select value={nivelEditado} onChange={(e) => setNivelEditado(e.target.value)} aria-label="Nivel">
                      {!item.nivel && <option value="">—</option>}
                      {NIVELES.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  )}
                  <span className="actions">
                    <button className="btn-accion btn-confirmar" onClick={() => guardarEdicion(item.id)}><Save size={16} aria-hidden="true" />Guardar</button>
                    <button className="btn-accion btn-cancelar" onClick={() => setEditandoId(null)}><X size={16} aria-hidden="true" />Cancelar</button>
                  </span>
                </>
              ) : (
                <>
                  <span>{item.nombre}{conNivel && <small>{item.nivel || '—'}</small>}</span>
                  <span className="actions">
                    <button className="btn-accion btn-editar" onClick={() => editar(item)}><Pencil size={16} aria-hidden="true" />Editar</button>
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
