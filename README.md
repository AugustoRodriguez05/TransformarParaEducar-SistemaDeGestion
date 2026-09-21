# Sistema de Gestión — Educar Para Transformar

Módulo de gestión académica del Centro Educativo "Transformar para Educar",
desarrollado como Proyecto de la asignatura **Metodología de Sistemas II**
(Tecnicatura Universitaria en Programación).

Repositorio independiente del sitio institucional
([EducarParaTransformar](https://github.com/AugustoRodriguez05/EducarParaTransformar)),
pensado para integrarse a futuro con esa base (mismos roles, misma
convención de API REST y de capas).

## Alcance — Sprint 1 (Módulo 1, mandatorio)

| HU | Descripción |
|----|-------------|
| HU1 | Alta de legajo de alumnos |
| HU2 | Gestión de profesores y asignación de materias/cursos |
| HU3 | Consulta de información académica por parte de los padres |
| HU4 | Consulta y modificación de legajo de alumnos |

## Alcance — Sprint 2 (Módulo 2)

| HU | Descripción |
|----|-------------|
| HU5 | Inscripción de alumnos a actividades deportivas |
| HU6 | Inscripción a transporte y comedor |
| HU7 | Reportes por curso y por materia (exportables a PDF y Excel) |

## Alcance — Sprint 3 (Módulo 3)

| HU | Descripción |
|----|-------------|
| HU8 | Reserva de turnos entre padres/tutores y profesores (Desafío) |

## Stack

- Frontend: React 19 + Vite, React Router
- Backend: Node.js + Express 5
- Base de datos: SQLite en desarrollo (`backend/gestion.sqlite`, se crea sola), PostgreSQL en producción (`database/schema.sql`)
- Autenticación: usuario/contraseña con hash bcrypt y control de acceso por rol (administrador, profesor, padre)

## Cómo correr el proyecto

```bash
npm install
npm run seed   # opcional: carga datos de ejemplo en una base vacía
npm run dev
```

Para empezar sin datos de ejemplo, creá el primer administrador y cargá el resto
(cursos, materias, deportes, alumnos, etc.) desde la aplicación:

```bash
npm run crear-admin -- admin@escuela.com una-contraseña Nombre Apellido
```

Esto levanta el backend en `http://localhost:3002` y el frontend (Vite) con
proxy de `/api` hacia el backend. Al iniciar por primera vez, la base SQLite
se crea vacía (solo las tablas). `npm run seed` carga datos de ejemplo y no
hace nada si la base ya tiene datos.

### Configuración (opcional)

Copiá `.env.example` como `.env` para cambiar el puerto del backend (`PORT`),
el archivo de la base (`DB_FILE`), el puerto del frontend (`FRONTEND_PORT`) o la
URL del backend a la que apunta el proxy de Vite (`API_URL`). Sin `.env` se usan
los valores por defecto. Requiere Node 22.9 o superior.

### Usuarios de ejemplo (los crea `npm run seed`)

| Rol | Email | Contraseña |
|-----|-------|------------|
| Administrador | admin@gestion.com | admin123 |
| Profesor | carla.gomez@gestion.com | prof123 |
| Profesor | martin.diaz@gestion.com | prof123 |
| Padre/Tutor | laura.fernandez@gestion.com | padre123 |
| Padre/Tutor | jorge.ibanez@gestion.com | padre123 |

## Estructura

```
backend/
  server.js          # entrypoint Express
  db.js              # conexión SQLite y esquema
  seed.js            # datos de ejemplo (npm run seed)
  crear-admin.js     # crea el primer administrador (npm run crear-admin)
  middleware/auth.js # autenticación por header + control de rol
  routes/            # alumnos, profesores, familia, auth, catálogos
database/
  schema.sql         # esquema equivalente para PostgreSQL (producción)
src/
  context/AuthContext.jsx
  components/        # Layout, ProtectedRoute
  pages/             # Login, Dashboard, Alumnos, Profesores, PanelFamilia
```

## Backlog

Ver el plan de trabajo del grupo para el detalle de HU5 a HU8 (Sprint 2 y 3).
