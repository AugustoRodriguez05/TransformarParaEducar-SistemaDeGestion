import { useEffect, useState } from 'react';
import { apiFetch } from './api';

// Configuración general del backend: días de la semana y ciclo lectivo vigente.
export function useConfig() {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    let cancelado = false;
    apiFetch('/api/config')
      .then((data) => !cancelado && setConfig(data))
      .catch(() => {});
    return () => { cancelado = true; };
  }, []);

  return config;
}
