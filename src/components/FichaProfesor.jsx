import { BadgeCheck, BookUser, Briefcase, IdCard, Mail, Phone, User } from 'lucide-react';
import Dato from './FichaDato';

// Ficha de un profesor con los datos de su legajo.
export default function FichaProfesor({ profesor }) {
  return (
    <div className="ficha">
      <dl className="ficha-datos">
        <Dato icono={BookUser} titulo="Legajo">{profesor.legajo || '—'}</Dato>
        <Dato icono={User} titulo="Apellido y nombre">{profesor.apellido}, {profesor.nombre}</Dato>
        <Dato icono={IdCard} titulo="DNI">{profesor.dni}</Dato>
        <Dato icono={Briefcase} titulo="Especialidad">{profesor.especialidad || '—'}</Dato>
        <Dato icono={Phone} titulo="Teléfono">{profesor.telefono || '—'}</Dato>
        <Dato icono={Mail} titulo="Email">{profesor.email || '—'}</Dato>
        <Dato icono={BadgeCheck} titulo="Estado">
          <span className={`badge ${profesor.estado.toLowerCase()}`}>{profesor.estado}</span>
        </Dato>
      </dl>
    </div>
  );
}
