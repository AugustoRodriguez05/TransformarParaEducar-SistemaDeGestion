# TODO

## Sacar lo hardcodeado

- [x] **Datos de ejemplo**: movidos a `backend/seed.js` (`npm run seed`); la app ya no carga datos de prueba al iniciar.
- [x] **Usuarios de prueba en el login** (`src/pages/Login.jsx`): eliminado el bloque "Usuarios de prueba". Las credenciales de ejemplo siguen documentadas en el README.
- [ ] **Cursos y materias**: crear pantallas de alta/edición (hoy solo existen en el seed).
- [ ] **Padres/tutores**: pantalla para dar de alta padres y vincularlos a alumnos (`padre_alumno`); hoy solo existen en el seed.
- [x] **Días de la semana**: definidos una sola vez en `backend/constantes.js`; el `CHECK` de SQLite, la validación del backend y el selector del frontend (vía `GET /api/config`) los toman de ahí. Queda el enum de `database/schema.sql`, que es SQL aparte.
- [x] **Ciclo lectivo**: sale de la tabla `configuracion` (`GET /api/config`) en vez de estar escrito en el texto. La inscripción guarda el año del ciclo, así que al cambiarlo los alumnos figuran sin inscribir en el nuevo ciclo.
- [x] **Puertos y URLs**: `PORT`, `DB_FILE`, `FRONTEND_PORT` y `API_URL` se leen del `.env` (ver `.env.example`).
- [x] **Legajo**: se mantiene el formato `AAAA-NNNN` (convención estable, no se justifica hacerlo configurable); el año ahora sale del ciclo lectivo configurado.
