# TODO

## Sacar lo hardcodeado

- [x] **Datos de ejemplo**: movidos a `backend/seed.js` (`npm run seed`); la app ya no carga datos de prueba al iniciar.
- [x] **Usuarios de prueba en el login** (`src/pages/Login.jsx`): eliminado el bloque "Usuarios de prueba". Las credenciales de ejemplo siguen documentadas en el README.
- [ ] **Cursos y materias**: crear pantallas de alta/edición (hoy solo existen en el seed).
- [ ] **Padres/tutores**: pantalla para dar de alta padres y vincularlos a alumnos (`padre_alumno`); hoy solo existen en el seed.
- [ ] **Días de la semana** (`src/pages/Profesores.jsx` y el `CHECK` de `asignaciones` en `backend/db.js` / `database/schema.sql`): definirlos en un solo lugar, o dejarlos configurables.
- [ ] **Ciclo lectivo "2026"** (`src/pages/PanelFamilia.jsx`): tomarlo de una tabla/configuración en vez de escribirlo en el texto.
- [x] **Puertos y URLs**: `PORT`, `DB_FILE`, `FRONTEND_PORT` y `API_URL` se leen del `.env` (ver `.env.example`).
- [ ] **Legajo** (`backend/routes/alumnos.routes.js`): el formato `AAAA-NNNN` está fijo en el código; evaluar hacerlo configurable.
