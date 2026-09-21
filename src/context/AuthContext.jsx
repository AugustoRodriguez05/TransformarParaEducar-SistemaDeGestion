import { useState } from 'react';
import { getStoredUser, storeUser, clearStoredUser } from '../api';
import { AuthContext } from './auth-context';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => getStoredUser());

  const login = async (email, password) => {
    const sinConexion = new Error('No se pudo conectar con el servidor. Verificá que esté corriendo (npm run dev).');

    let response;
    let data;
    try {
      response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      data = await response.json();
    } catch {
      throw sinConexion;
    }
    if (!response.ok) {
      throw new Error(data.message || 'Credenciales inválidas');
    }

    setUser(data);
    storeUser(data);
    return data;
  };

  const logout = () => {
    setUser(null);
    clearStoredUser();
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
