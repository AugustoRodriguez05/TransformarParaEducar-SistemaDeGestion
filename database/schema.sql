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
    inscripto_ciclo_lectivo BOOLEAN DEFAULT FALSE
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

CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_alumnos_dni ON alumnos(dni);
CREATE INDEX idx_alumnos_legajo ON alumnos(legajo);
CREATE INDEX idx_alumnos_apellido ON alumnos(apellido);
CREATE INDEX idx_asignaciones_profesor_dia ON asignaciones(profesor_id, dia);
