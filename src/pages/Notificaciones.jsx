import { useEffect, useState } from 'react';
import { apiFetch } from '../api';

export default function Notificaciones() {
  const [notificaciones, setNotificaciones] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    apiFetch('/api/notificaciones')
      .then((data) => {
        if (cancelado) return;
        setNotificaciones(data.notificaciones);
        return apiFetch('/api/notificaciones/leer', { method: 'POST' });
      })
      .catch((err) => !cancelado && setError(err.message));
    return () => { cancelado = true; };
  }, []);

  return (
    <div>
      <h2>Notificaciones</h2>
      {error && <p className="error">{error}</p>}
      {notificaciones.length === 0 && !error && <p>No tenés notificaciones.</p>}
      <ul className="servicios-lista">
        {notificaciones.map((n) => (
          <li key={n.id} className={n.leida ? '' : 'noti-nueva'}>
            <span>{n.mensaje}</span>
            <small>{n.fecha}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
