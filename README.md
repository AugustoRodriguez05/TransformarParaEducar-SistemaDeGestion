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

## Stack

- Frontend: React 19 + Vite, React Router
- Backend: Node.js + Express 5
- Base de datos: SQLite en desarrollo (`backend/gestion.sqlite`, se crea sola), PostgreSQL en producción (`database/schema.sql`)
- Autenticación: usuario/contraseña con hash bcrypt y control de acceso por rol (administrador, profesor, padre)

## Cómo correr el proyecto

```bash
npm install
npm run dev
```

Esto levanta el backend en `http://localhost:3002` y el frontend (Vite) con
proxy de `/api` hacia el backend. Al iniciar por primera vez, la base SQLite
se crea con datos de ejemplo.

### Usuarios de prueba

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
  db.js              # conexión SQLite + seed de datos
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
