import { useEffect, useState } from 'react';
import { ArrowDown, BadgeCheck, Mail, RotateCcw, Settings, Shield, User, UsersRound } from 'lucide-react';
import { apiFetch } from '../api';
import ThIcono from './ThIcono';
import TituloSeccion from './TituloSeccion';

const ETIQUETA_ROL = { administrador: 'Administrador', profesor: 'Profesor', padre: 'Padre/tutor' };

// Usuarios del sistema: se crean al dar de alta profesores y padres; acá solo se activan o desactivan.
export default function UsuariosEditor() {
  const [usuarios, setUsuarios] = useState([]);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelado = false;
    apiFetch('/api/usuarios')
      .then((data) => !cancelado && setUsuarios(data))
      .catch((err) => !cancelado && setError(err.message));
    return () => { cancelado = true; };
  }, [version]);

  const cambiarEstado = async (usuario) => {
    setError('');
    try {
      await apiFetch(`/api/usuarios/${usuario.id}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({ estado: usuario.activo ? 'Inactivo' : 'Activo' })
      });
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="card">
      <TituloSeccion icono={UsersRound}>Usuarios</TituloSeccion>

      {error && <p className="error">{error}</p>}

      <div className="tabla-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <ThIcono icono={User}>Apellido y Nombre</ThIcono>
              <ThIcono icono={Mail}>Email</ThIcono>
              <ThIcono icono={Shield}>Rol</ThIcono>
              <ThIcono icono={BadgeCheck}>Estado</ThIcono>
              <ThIcono icono={Settings}>Acciones</ThIcono>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className={u.activo ? '' : 'row-inactivo'}>
                <td>{u.apellido}, {u.nombre}</td>
                <td>{u.email}</td>
                <td><span className="badge curso">{ETIQUETA_ROL[u.rol] || u.rol}</span></td>
                <td><span className={`badge ${u.activo ? 'activo' : 'inactivo'}`}>{u.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                  <div className="actions">
                    <button className={u.activo ? 'btn-accion btn-baja' : 'btn-accion btn-reactivar'} onClick={() => cambiarEstado(u)}>
                      {u.activo
                        ? <><ArrowDown size={16} aria-hidden="true" />Desactivar</>
                        : <><RotateCcw size={16} aria-hidden="true" />Activar</>}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
