import { useEffect, useState } from 'react';
import {
  BookUser, Bus, Cake, CalendarDays, GraduationCap, House, IdCard, Mail, Phone, Settings, User, Users,
  Utensils, Volleyball
} from 'lucide-react';
import { apiFetch } from '../api';
import { formatearFecha } from '../fecha';

function calcularEdad(fechaNacimiento) {
  const [anio, mes, dia] = fechaNacimiento.split('-').map(Number);
  const hoy = new Date();
  let edad = hoy.getFullYear() - anio;
  const mesActual = hoy.getMonth() + 1;
  if (mesActual < mes || (mesActual === mes && hoy.getDate() < dia)) edad -= 1;
  return edad;
}

// Un dato de la ficha: ícono a la izquierda, etiqueta arriba y valor abajo.
function Dato({ icono: Icono, titulo, children }) {
  return (
    <div className="ficha-dato">
      <dt><Icono size={20} aria-hidden="true" />{titulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// Ficha completa de un alumno: datos del legajo, padres o tutores vinculados y servicios.
// El estado y las acciones se muestran en el encabezado de la ventana.
export default function FichaAlumno({ alumno }) {
  const [padres, setPadres] = useState(null);
  const [servicios, setServicios] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      apiFetch(`/api/alumnos/${alumno.id}/padres`),
      apiFetch(`/api/servicios/alumnos/${alumno.id}`)
    ])
      .then(([p, s]) => {
        if (cancelado) return;
        setPadres(p);
        setServicios(s);
      })
      .catch((err) => !cancelado && setError(err.message));
    return () => { cancelado = true; };
  }, [alumno.id]);

  const edad = calcularEdad(alumno.fecha_nacimiento);

  return (
    <div className="ficha">
      <dl className="ficha-datos">
        <Dato icono={BookUser} titulo="Legajo">{alumno.legajo}</Dato>
        <Dato icono={User} titulo="Apellido y nombre">{alumno.apellido}, {alumno.nombre}</Dato>
        <Dato icono={IdCard} titulo="DNI">{alumno.dni}</Dato>
        <Dato icono={Cake} titulo="Edad">{edad} {edad === 1 ? 'año' : 'años'}</Dato>
        <Dato icono={CalendarDays} titulo="Fecha de nacimiento">{formatearFecha(alumno.fecha_nacimiento)}</Dato>
        <Dato icono={GraduationCap} titulo="Curso">
          {alumno.curso_nombre ? <span className="badge curso">{alumno.curso_nombre}</span> : '—'}
        </Dato>
        <Dato icono={House} titulo="Domicilio">{alumno.domicilio || '—'}</Dato>
        <Dato icono={Phone} titulo="Teléfono">{alumno.telefono || '—'}</Dato>
        <Dato icono={Mail} titulo="Email">{alumno.email || '—'}</Dato>
      </dl>

      {error && <p className="error">{error}</p>}

      <section className="ficha-seccion">
        <h4 className="ficha-titulo"><Users size={20} aria-hidden="true" />Padres o tutores vinculados</h4>
        {padres && (padres.length === 0 ? <p>Sin padres vinculados.</p> : (
          <ul className="ficha-padres">
            {padres.map((p) => (
              <li key={p.id} className="ficha-padre">
                <User size={20} aria-hidden="true" />
                <span>
                  <strong>{p.apellido}, {p.nombre}</strong>
                  <span className="ficha-email">{p.email}</span>
                </span>
              </li>
            ))}
          </ul>
        ))}
      </section>

      <section className="ficha-seccion">
        <h4 className="ficha-titulo"><Settings size={20} aria-hidden="true" />Servicios</h4>
        {servicios && (
          <dl className="ficha-servicios">
            <Dato icono={Volleyball} titulo="Deportes">
              {servicios.deportes.length === 0 ? 'Sin inscripción.' : (
                <ul className="ficha-lista">
                  {servicios.deportes.map((d) => (
                    <li key={d.id}>{d.nombre} — {d.dia} {d.hora_inicio} a {d.hora_fin}</li>
                  ))}
                </ul>
              )}
            </Dato>
            <Dato icono={Bus} titulo="Transporte">
              {servicios.transporte ? servicios.transporte.recorrido_nombre : 'Sin inscripción.'}
            </Dato>
            <Dato icono={Utensils} titulo="Comedor">{servicios.comedor ? 'Sí' : 'No'}</Dato>
          </dl>
        )}
      </section>
    </div>
  );
}
