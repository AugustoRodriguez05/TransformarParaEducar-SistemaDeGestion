import { LayoutDashboard } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import TituloSeccion from '../components/TituloSeccion';

const MENSAJES = {
  administrador: 'Desde acá gestionás el legajo de alumnos y la planta de profesores.',
  profesor: 'Desde acá consultás las materias y horarios que tenés asignados.',
  padre: 'Desde acá consultás la información académica de tus hijos.'
};

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div className="card">
      <TituloSeccion principal icono={LayoutDashboard}>Hola, {user.nombre}</TituloSeccion>
      <p>{MENSAJES[user.rol]}</p>
    </div>
  );
}
