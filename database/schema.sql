-- Base de datos del Sistema de Gestión Académica
-- Centro Educativo "Transformar para Educar"
-- Motor de producción: PostgreSQL (en desarrollo local se usa SQLite, ver backend/db.js)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role AS ENUM ('administrador', 'profesor', 'padre');
CREATE TYPE estado_legajo AS ENUM ('Activo', 'Inactivo');
CREATE TYPE dia_semana AS ENUM ('Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes');

-- Usuarios del sistema de gestión (control de acceso basado en roles, RNF-01)
CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol user_role NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cursos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE materias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(100) UNIQUE NOT NULL
);

-- Requerimiento 03: gestión de profesores
CREATE TABLE profesores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID UNIQUE REFERENCES usuarios(id) ON DELETE SET NULL,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    dni VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(150) NOT NULL,
    estado estado_legajo DEFAULT 'Activo'
);

-- Requerimiento 01: legajo de alumnos
CREATE TABLE alumnos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    legajo VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    dni VARCHAR(20) UNIQUE NOT NULL,
    fecha_nacimiento DATE NOT NULL,
    curso_id UUID REFERENCES cursos(id),
    estado estado_legajo DEFAULT 'Activo',
    inscripto_ciclo_lectivo INTEGER DEFAULT 0 -- año del ciclo lectivo en que se inscribió (0 = nunca)
);

-- Requerimiento 03: asignación de materias/cursos a profesores
CREATE TABLE asignaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profesor_id UUID NOT NULL REFERENCES profesores(id) ON DELETE CASCADE,
    materia_id UUID NOT NULL REFERENCES materias(id),
    curso_id UUID NOT NULL REFERENCES cursos(id),
    dia dia_semana NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    CONSTRAINT chk_horario CHECK (hora_inicio < hora_fin)
);

-- Requerimiento 05: vínculo entre padres/tutores y sus hijos
CREATE TABLE padre_alumno (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    padre_usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    alumno_id UUID NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
    UNIQUE (padre_usuario_id, alumno_id)
);

-- Requerimiento 02: actividades deportivas
CREATE TABLE deportes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(100) UNIQUE NOT NULL,
    dia dia_semana NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    CONSTRAINT chk_horario_deporte CHECK (hora_inicio < hora_fin)
);

CREATE TYPE estado_inscripcion AS ENUM ('Activa', 'Baja');

CREATE TABLE inscripciones_deportivas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alumno_id UUID NOT NULL REFERENCES alumnos(id),
    deporte_id UUID NOT NULL REFERENCES deportes(id),
    estado estado_inscripcion DEFAULT 'Activa',
    UNIQUE (alumno_id, deporte_id)
);

-- Requerimiento 04: transporte y comedor
CREATE TABLE recorridos_transporte (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE inscripciones_transporte (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alumno_id UUID NOT NULL REFERENCES alumnos(id),
    recorrido_id UUID NOT NULL REFERENCES recorridos_transporte(id),
    estado estado_inscripcion DEFAULT 'Activa'
);

CREATE TABLE inscripciones_comedor (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alumno_id UUID NOT NULL REFERENCES alumnos(id),
    estado estado_inscripcion DEFAULT 'Activa'
);

-- Una sola inscripción activa por alumno y servicio
CREATE UNIQUE INDEX uq_transporte_activa ON inscripciones_transporte(alumno_id) WHERE estado = 'Activa';
CREATE UNIQUE INDEX uq_comedor_activa ON inscripciones_comedor(alumno_id) WHERE estado = 'Activa';

-- Configuración general (ciclo lectivo vigente, etc.)
CREATE TABLE configuracion (
    clave VARCHAR(50) PRIMARY KEY,
    valor VARCHAR(255) NOT NULL
);

-- Requerimiento 15: reserva de turnos entre padres y profesores
CREATE TYPE estado_turno AS ENUM ('Pendiente', 'Confirmado', 'Cancelado');

CREATE TABLE disponibilidad_profesor (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profesor_id UUID NOT NULL REFERENCES profesores(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    CONSTRAINT chk_horario_disponibilidad CHECK (hora_inicio < hora_fin)
);

CREATE TABLE turnos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    disponibilidad_id UUID NOT NULL REFERENCES disponibilidad_profesor(id),
    padre_usuario_id UUID NOT NULL REFERENCES usuarios(id),
    alumno_id UUID NOT NULL REFERENCES alumnos(id),
    motivo TEXT,
    estado estado_turno DEFAULT 'Pendiente',
    fecha_solicitud TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Un profesor no puede tener dos turnos confirmados en la misma franja
CREATE UNIQUE INDEX uq_turno_confirmado_franja ON turnos(disponibilidad_id) WHERE estado = 'Confirmado';

CREATE TABLE notificaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    mensaje TEXT NOT NULL,
    leida BOOLEAN DEFAULT FALSE,
    fecha TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_alumnos_dni ON alumnos(dni);
CREATE INDEX idx_alumnos_legajo ON alumnos(legajo);
CREATE INDEX idx_alumnos_apellido ON alumnos(apellido);
CREATE INDEX idx_asignaciones_profesor_dia ON asignaciones(profesor_id, dia);
