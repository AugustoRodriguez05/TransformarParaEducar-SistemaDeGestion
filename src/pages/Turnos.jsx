import { useAuth } from '../context/useAuth';
import TurnosProfesor from '../components/TurnosProfesor';
import TurnosPadre from '../components/TurnosPadre';

export default function Turnos() {
  const { user } = useAuth();
  return user.rol === 'profesor' ? <TurnosProfesor /> : <TurnosPadre />;
}
