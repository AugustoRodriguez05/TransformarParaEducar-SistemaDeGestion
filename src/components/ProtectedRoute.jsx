import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

export default function ProtectedRoute({ roles, children }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.rol)) {
    return (
      <div className="card">
        <h2>No autorizado</h2>
        <p>Tu rol ({user.rol}) no tiene acceso a esta sección.</p>
      </div>
    );
  }

  return children;
}
