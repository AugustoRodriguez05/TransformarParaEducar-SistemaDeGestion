import { useAuth } from '../context/useAuth';
import TurnosAdministrador from '../components/TurnosAdministrador';
import TurnosProfesor from '../components/TurnosProfesor';
import TurnosPadre from '../components/TurnosPadre';

export default function Turnos() {
  const { user } = useAuth();
  if (user.rol === 'administrador') return <TurnosAdministrador />;
  return user.rol === 'profesor' ? <TurnosProfesor /> : <TurnosPadre />;
}
