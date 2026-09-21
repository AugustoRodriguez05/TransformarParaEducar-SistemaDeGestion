import { useState } from 'react';
import { apiFetch } from '../api';
import { useConfig } from '../useConfig';
import CatalogoEditor from '../components/CatalogoEditor';

function CicloLectivo() {
  const config = useConfig();
  const [nuevoCiclo, setNuevoCiclo] = useState('');
  const [vigente, setVigente] = useState(null);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const cicloActual = vigente ?? (config ? config.cicloLectivo : '');

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    setMensaje('');
    try {
      const data = await apiFetch('/api/config/ciclo-lectivo', {
        method: 'PUT',
        body: JSON.stringify({ ciclo_lectivo: nuevoCiclo })
      });
      setVigente(data.cicloLectivo);
      setNuevoCiclo('');
      setMensaje('Ciclo lectivo actualizado.');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="card">
      <h3>Ciclo lectivo</h3>
      <p>Ciclo vigente: <strong>{cicloActual}</strong>. Define el año de los nuevos legajos y de la inscripción de las familias.</p>
      <form className="servicios-form" onSubmit={guardar}>
        <input
          type="number"
          min="2000"
          max="2100"
          value={nuevoCiclo}
          onChange={(e) => setNuevoCiclo(e.target.value)}
          placeholder="Nuevo año"
          required
        />
        <button type="submit">Cambiar</button>
      </form>
      {error && <p className="error">{error}</p>}
      {mensaje && <p className="success">{mensaje}</p>}
    </div>
  );
}

export default function Configuracion() {
  return (
    <div>
      <h2>Configuración</h2>
      <CicloLectivo />
      <CatalogoEditor titulo="Cursos" ruta="cursos" />
      <CatalogoEditor titulo="Materias" ruta="materias" />
    </div>
  );
}
