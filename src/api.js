const STORAGE_KEY = 'gestion_user';

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
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

export async function apiFetch(path, options = {}) {
  const user = getStoredUser();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (user) {
    headers['x-user-id'] = user.id;
    headers['x-user-role'] = user.rol;
  }

  const res = await fetch(path, { ...options, headers });

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
