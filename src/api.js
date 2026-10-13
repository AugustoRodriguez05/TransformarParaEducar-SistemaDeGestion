const STORAGE_KEY = 'gestion_user';

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const user = raw ? JSON.parse(raw) : null;
    // Una sesión guardada antes del cambio a token no sirve: hay que volver a iniciar sesión.
    return user && user.token ? user : null;
  } catch {
    return null;
  }
}

export function storeUser(user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function clearStoredUser() {
  localStorage.removeItem(STORAGE_KEY);
}

async function conectar(path, options) {
  let res;
  try {
    res = await fetch(path, options);
  } catch {
    throw new Error('No se pudo conectar con el servidor. Verificá que esté corriendo (npm run dev).');
  }
  // Token vencido o inválido: se cierra la sesión y se vuelve al login.
  if (res.status === 401 && getStoredUser()) {
    clearStoredUser();
    window.location.href = '/login';
  }
  return res;
}

export async function apiDownload(path, nombreArchivo) {
  const user = getStoredUser();
  const res = await conectar(path, {
    headers: user ? { Authorization: `Bearer ${user.token}` } : {}
  });
  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      message = (await res.json()).message || message;
    } catch {
      // sin cuerpo JSON en la respuesta de error
    }
    throw new Error(message);
  }

  const url = URL.createObjectURL(await res.blob());
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}

export async function apiFetch(path, options = {}) {
  const user = getStoredUser();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (user) {
    headers.Authorization = `Bearer ${user.token}`;
  }

  const res = await conectar(path, { ...options, headers });

  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const data = await res.json();
      message = data.message || message;
    } catch {
      // sin cuerpo JSON en la respuesta de error
    }
    throw new Error(message);
  }

  if (res.status === 204) return null;
  return res.json();
}
