import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { apiFetch } from '../api';

const NAV_POR_ROL = {
  administrador: [
    { to: '/alumnos', label: 'Alumnos' },
    { to: '/profesores', label: 'Profesores' },
    { to: '/reportes', label: 'Reportes' }
  ],
  profesor: [
    { to: '/profesores', label: 'Mis materias' },
    { to: '/turnos', label: 'Turnos' },
    { to: '/notificaciones', label: 'Notificaciones', conContador: true }
  ],
  padre: [
    { to: '/panel-familia', label: 'Panel de familia' },
    { to: '/turnos', label: 'Turnos' },
    { to: '/notificaciones', label: 'Notificaciones', conContador: true }
  ]
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [noLeidas, setNoLeidas] = useState(0);

  const tieneNotificaciones = user && user.rol !== 'administrador';

  useEffect(() => {
    if (!tieneNotificaciones) return;
    let cancelado = false;
    apiFetch('/api/notificaciones')
      .then((data) => !cancelado && setNoLeidas(pathname === '/notificaciones' ? 0 : data.noLeidas))
      .catch(() => {});
    return () => { cancelado = true; };
  }, [pathname, tieneNotificaciones]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const items = user ? NAV_POR_ROL[user.rol] || [] : [];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">Sistema de Gestión · Educar Para Transformar</div>
        {user && (
          <nav className="nav">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                {item.label}
                {item.conContador && noLeidas > 0 && <span className="contador">{noLeidas}</span>}
              </NavLink>
            ))}
          </nav>
        )}
        {user && (
          <div className="user-menu">
            <span>{user.nombre} {user.apellido} · {user.rol}</span>
            <button onClick={handleLogout}>Salir</button>
          </div>
        )}
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
