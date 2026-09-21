import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

const NAV_POR_ROL = {
  administrador: [
    { to: '/alumnos', label: 'Alumnos' },
    { to: '/profesores', label: 'Profesores' },
    { to: '/reportes', label: 'Reportes' }
  ],
  profesor: [
    { to: '/profesores', label: 'Mis materias' }
  ],
  padre: [
    { to: '/panel-familia', label: 'Panel de familia' }
  ]
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
