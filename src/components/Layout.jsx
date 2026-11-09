import { useEffect, useState, useSyncExternalStore } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, Bell, BookOpen, Calendar, CreditCard, GraduationCap, Home, LogOut, Menu, Presentation, Settings, User, Users, X
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { apiFetch } from '../api';

const NAV_POR_ROL = {
  administrador: [
    { to: '/alumnos', label: 'Alumnos', icono: GraduationCap },
    { to: '/profesores', label: 'Profesores', icono: Presentation },
    { to: '/padres', label: 'Padres', icono: Users },
    { to: '/turnos', label: 'Turnos', icono: Calendar },
    { to: '/reportes', label: 'Reportes', icono: BarChart3 },
    { to: '/cuotas', label: 'Cuotas', icono: CreditCard },
    { to: '/configuracion', label: 'Configuración', icono: Settings }
  ],
  profesor: [
    { to: '/profesores', label: 'Mis materias', icono: BookOpen },
    { to: '/turnos', label: 'Turnos', icono: Calendar },
    { to: '/notificaciones', label: 'Notificaciones', icono: Bell, conContador: true }
  ],
  padre: [
    { to: '/panel-familia', label: 'Panel de familia', icono: Home },
    { to: '/turnos', label: 'Turnos', icono: Calendar },
    { to: '/notificaciones', label: 'Notificaciones', icono: Bell, conContador: true }
  ],
  alumno: [
    { to: '/mi-panel', label: 'Mi panel', icono: Home }
  ]
};

// Cuándo la barra usa el menú hamburguesa (mismos cortes que en App.css): en celular
// y, si el menú tiene muchas opciones (administrador), también en pantallas que no
// alcanzan para mostrarlas en una fila con sus íconos. En computadora el botón y el
// menú desplegable no se renderizan, así que la barra queda igual que siempre.
const CONSULTA_CELULAR = '(max-width: 768px)';
const CONSULTA_MENU_LARGO = '(max-width: 899px)';
const MAX_OPCIONES_MENU_CORTO = 4;

// También se escucha resize: algunos navegadores no avisan el "change" de la consulta.
function suscribirAncho(avisar) {
  const consultas = [CONSULTA_CELULAR, CONSULTA_MENU_LARGO].map((c) => window.matchMedia(c));
  consultas.forEach((c) => c.addEventListener('change', avisar));
  window.addEventListener('resize', avisar);
  return () => {
    consultas.forEach((c) => c.removeEventListener('change', avisar));
    window.removeEventListener('resize', avisar);
  };
}

// 'celular', 'mediana' (hasta 899 px) o 'computadora'
function anchoAhora() {
  if (window.matchMedia(CONSULTA_CELULAR).matches) return 'celular';
  return window.matchMedia(CONSULTA_MENU_LARGO).matches ? 'mediana' : 'computadora';
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [noLeidas, setNoLeidas] = useState(0);
  const items = user ? NAV_POR_ROL[user.rol] || [] : [];
  const ancho = useSyncExternalStore(suscribirAncho, anchoAhora);
  const esCelular = ancho === 'celular' || (ancho === 'mediana' && items.length > MAX_OPCIONES_MENU_CORTO);
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

  const tieneNotificaciones = user && ['profesor', 'padre'].includes(user.rol);

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

  const navegacion = (
    <nav className="nav">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => (isActive ? 'active' : '')}
          onClick={() => setMenuAbierto(false)}
        >
          <item.icono size={18} aria-hidden="true" />
          {item.label}
          {item.conContador && noLeidas > 0 && <span className="contador">{noLeidas}</span>}
        </NavLink>
      ))}
    </nav>
  );

  const bloqueUsuario = (
    <div className="user-menu">
      <span className="user-nombre">
        <User size={18} aria-hidden="true" />
        <span className="user-nombre-texto" title={`${user?.nombre} ${user?.apellido}`}>{user?.nombre} {user?.apellido}</span>
      </span>
      <button onClick={handleLogout}><LogOut size={18} aria-hidden="true" />Salir</button>
    </div>
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img src="/logo.png" alt="Logo Educar Para Transformar" className="brand-logo" />
          <span className="brand-texto">
            <span>Sistema de Gestión ·</span>
            <span>Educar Para Transformar</span>
          </span>
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
