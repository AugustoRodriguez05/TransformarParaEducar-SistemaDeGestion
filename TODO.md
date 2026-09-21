# TODO

## Sacar lo hardcodeado

- [x] **Datos de ejemplo**: movidos a `backend/seed.js` (`npm run seed`); la app ya no carga datos de prueba al iniciar.
- [x] **Usuarios de prueba en el login** (`src/pages/Login.jsx`): eliminado el bloque "Usuarios de prueba". Las credenciales de ejemplo siguen documentadas en el README.
- [x] **Cursos y materias**: pantalla "Configuración" (alta, edición y baja; no deja borrar lo que está en uso) y edición del ciclo lectivo.
- [x] **Padres/tutores**: pantalla "Padres" para dar de alta padres y vincular/desvincular alumnos (`padre_alumno`).
- [x] **Días de la semana**: definidos una sola vez en `backend/constantes.js`; el `CHECK` de SQLite, la validación del backend y el selector del frontend (vía `GET /api/config`) los toman de ahí. Queda el enum de `database/schema.sql`, que es SQL aparte.
- [x] **Ciclo lectivo**: sale de la tabla `configuracion` (`GET /api/config`) en vez de estar escrito en el texto. La inscripción guarda el año del ciclo, así que al cambiarlo los alumnos figuran sin inscribir en el nuevo ciclo.
- [x] **Puertos y URLs**: `PORT`, `DB_FILE`, `FRONTEND_PORT` y `API_URL` se leen del `.env` (ver `.env.example`).
- [x] **Legajo**: se mantiene el formato `AAAA-NNNN` (convención estable, no se justifica hacerlo configurable); el año ahora sale del ciclo lectivo configurado.

## Pendiente (detectado al terminar lo anterior)

- [x] **Deportes y recorridos de transporte**: se administran desde la pantalla "Configuración" (alta, edición y baja). No se borra lo que tiene inscripciones, y no se cambia el horario de un deporte con alumnos inscriptos.

## Mejoras respecto al plan de trabajo

- [ ] **Autenticación simplificada** (`backend/middleware/auth.js`, `src/api.js`): después del login el frontend manda el id del usuario en el header `x-user-id` y el backend confía en él, sin token ni sesión; quien conozca el id de otro usuario podría hacerse pasar por él. Reemplazar por un token firmado (JWT) o una sesión que el backend emita en el login y verifique en cada petición.
- [ ] **Patrones de diseño del plan** (MVC y Repository): hoy las rutas (`backend/routes/*.js`) mezclan validación, lógica de negocio y consultas SQL. Separar en controladores, servicios/lógica y una capa Repository para el acceso a datos. El Context Provider (`AuthContext`) ya está aplicado.
- [ ] **Proceso de trabajo del plan**: se trabajó todo sobre `main`. Usar una rama por Historia de Usuario con Pull Request de revisión al cierre de cada sprint, proteger la rama principal y llevar el tablero Kanban en GitHub Projects (issues por tarea, tablero del equipo y uno por integrante).
