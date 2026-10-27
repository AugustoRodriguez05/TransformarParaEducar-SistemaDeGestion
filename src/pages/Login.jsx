import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../context/useAuth';

// Al iniciar sesión, el alumno entra directo a su panel; el resto, al inicio.
const paginaInicial = (usuario) => (usuario.rol === 'alumno' ? '/mi-panel' : '/dashboard');

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to={paginaInicial(user)} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const usuario = await login(email, password);
      navigate(paginaInicial(usuario));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={handleSubmit}>
        <img src="/logo.png" alt="Logo Educar Para Transformar" className="login-logo" />
        <h1>Sistema de Gestión</h1>
        <p className="subtitle">Educar Para Transformar</p>

        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>

        <label>
          Contraseña
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={loading}><LogIn size={18} aria-hidden="true" />{loading ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </div>
  );
}
