import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Alumnos from './pages/Alumnos';
import Profesores from './pages/Profesores';
import PanelFamilia from './pages/PanelFamilia';
import Reportes from './pages/Reportes';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route
              path="dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="alumnos"
              element={
                <ProtectedRoute roles={['administrador']}>
                  <Alumnos />
                </ProtectedRoute>
              }
            />
            <Route
              path="profesores"
              element={
                <ProtectedRoute roles={['administrador', 'profesor']}>
                  <Profesores />
                </ProtectedRoute>
              }
            />
            <Route
              path="reportes"
              element={
                <ProtectedRoute roles={['administrador']}>
                  <Reportes />
                </ProtectedRoute>
              }
            />
            <Route
              path="panel-familia"
              element={
                <ProtectedRoute roles={['padre']}>
                  <PanelFamilia />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
