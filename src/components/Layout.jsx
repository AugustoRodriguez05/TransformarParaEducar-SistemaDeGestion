import { useEffect, useState, useSyncExternalStore } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { apiFetch } from '../api';

const NAV_POR_ROL = {
  administrador: [
    { to: '/alumnos', label: 'Alumnos' },
    { to: '/profesores', label: 'Profesores' },
    { to: '/padres', label: 'Padres' },
    { to: '/reportes', label: 'Reportes' },
    { to: '/configuracion', label: 'Configuración' }
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

// Mismo corte que el @media de la barra en App.css. En computadora el botón y el
// menú desplegable no se renderizan, así que la barra queda igual que siempre.
const CONSULTA_CELULAR = '(max-width: 768px)';

// También se escucha resize: algunos navegadores no avisan el "change" de la consulta.
function suscribirCelular(avisar) {
  const consulta = window.matchMedia(CONSULTA_CELULAR);
  consulta.addEventListener('change', avisar);
  window.addEventListener('resize', avisar);
  return () => {
    consulta.removeEventListener('change', avisar);
    window.removeEventListener('resize', avisar);
  };
}

const esCelularAhora = () => window.matchMedia(CONSULTA_CELULAR).matches;

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [noLeidas, setNoLeidas] = useState(0);
  const esCelular = useSyncExternalStore(suscribirCelular, esCelularAhora);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const abierto = esCelular && menuAbierto;

  // Si cambia la página (por ejemplo con "atrás") o se pasa a pantalla de
  // computadora, el menú desplegado se cierra.
  const contexto = `${esCelular}|${pathname}`;
  const [contextoAnterior, setContextoAnterior] = useState(contexto);
  if (contexto !== contextoAnterior) {
    setContextoAnterior(contexto);
    setMenuAbierto(false);
  }

  const tieneNotificaciones = user && user.rol !== 'administrador';

  useEffect(() => {
    if (!tieneNotificaciones) return;
    let cancelado = false;
    apiFetch('/api/notificaciones')
      .then((data) => !cancelado && setNoLeidas(pathname === '/notificaciones' ? 0 : data.noLeidas))
      .catch(() => {});
    return () => { cancelado = true; };
  }, [pathname, tieneNotificaciones]);

  // El menú desplegado se cierra con Esc.
  useEffect(() => {
    if (!abierto) return;
    const alPresionarTecla = (e) => { if (e.key === 'Escape') setMenuAbierto(false); };
    document.addEventListener('keydown', alPresionarTecla);
    return () => document.removeEventListener('keydown', alPresionarTecla);
  }, [abierto]);

  const handleLogout = () => {
    setMenuAbierto(false);
    logout();
    navigate('/login');
  };

  const items = user ? NAV_POR_ROL[user.rol] || [] : [];

  const navegacion = (
    <nav className="nav">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => (isActive ? 'active' : '')}
          onClick={() => setMenuAbierto(false)}
        >
          {item.label}
          {item.conContador && noLeidas > 0 && <span className="contador">{noLeidas}</span>}
        </NavLink>
      ))}
    </nav>
  );

  const bloqueUsuario = (
    <div className="user-menu">
      <span>{user?.nombre} {user?.apellido} · {user?.rol}</span>
      <button onClick={handleLogout}>Salir</button>
    </div>
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img src="/logo.png" alt="Logo Educar Para Transformar" className="brand-logo" />
          <span>Sistema de Gestión · Educar Para Transformar</span>
        </div>
        {user && !esCelular && navegacion}
        {user && !esCelular && bloqueUsuario}
        {user && esCelular && (
          <>
            <button
              type="button"
              className="menu-toggle"
              aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={abierto}
              aria-controls="menu-celular"
              onClick={() => setMenuAbierto(!abierto)}
            >
              {abierto ? <X size={28} aria-hidden="true" /> : <Menu size={28} aria-hidden="true" />}
            </button>
            {abierto && (
              <div id="menu-celular" className="menu-celular">
                {navegacion}
                {bloqueUsuario}
              </div>
            )}
          </>
        )}
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
