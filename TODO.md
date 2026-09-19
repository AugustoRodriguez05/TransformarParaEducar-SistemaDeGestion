# TODO

## Sacar lo hardcodeado

- [ ] **Datos de ejemplo** (`backend/db.js`): mover el seed a un script aparte (`npm run seed`) para que la app no cargue usuarios/alumnos/profesores de prueba automáticamente.
- [ ] **Usuarios de prueba en el login** (`src/pages/Login.jsx`): eliminar el bloque "Usuarios de prueba" antes de una entrega/producción.
- [ ] **Cursos y materias**: crear pantallas de alta/edición (hoy solo existen en el seed).
- [ ] **Padres/tutores**: pantalla para dar de alta padres y vincularlos a alumnos (`padre_alumno`); hoy solo existen en el seed.
- [ ] **Días de la semana** (`src/pages/Profesores.jsx` y el `CHECK` de `asignaciones` en `backend/db.js` / `database/schema.sql`): definirlos en un solo lugar, o dejarlos configurables.
- [ ] **Ciclo lectivo "2026"** (`src/pages/PanelFamilia.jsx`): tomarlo de una tabla/configuración en vez de escribirlo en el texto.
- [ ] **Puertos y URLs** (`backend/server.js` 3002, `vite.config.js` proxy): pasarlos a variables de entorno (`.env`).
- [ ] **Legajo** (`backend/routes/alumnos.routes.js`): el formato `AAAA-NNNN` está fijo en el código; evaluar hacerlo configurable.
