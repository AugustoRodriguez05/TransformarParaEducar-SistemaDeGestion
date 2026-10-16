import { useEffect, useState } from 'react';
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

function Dato({ titulo, children }) {
  return (
    <div className="ficha-dato">
      <dt>{titulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// Ficha completa de un alumno: datos del legajo, padres o tutores vinculados y servicios.
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
        <Dato titulo="Legajo">{alumno.legajo}</Dato>
        <Dato titulo="Apellido y nombre">{alumno.apellido}, {alumno.nombre}</Dato>
        <Dato titulo="DNI">{alumno.dni}</Dato>
        <Dato titulo="Fecha de nacimiento">{formatearFecha(alumno.fecha_nacimiento)}</Dato>
        <Dato titulo="Edad">{edad} {edad === 1 ? 'año' : 'años'}</Dato>
        <Dato titulo="Curso">
          {alumno.curso_nombre ? <span className="badge curso">{alumno.curso_nombre}</span> : '—'}
        </Dato>
        <Dato titulo="Estado">
          <span className={`badge ${alumno.estado.toLowerCase()}`}>{alumno.estado}</span>
        </Dato>
      </dl>

      {error && <p className="error">{error}</p>}

      <section className="ficha-seccion">
        <h4>Padres o tutores vinculados</h4>
        {padres && (padres.length === 0 ? <p>Sin padres vinculados.</p> : (
          <ul className="ficha-lista">
            {padres.map((p) => (
              <li key={p.id}>
                <strong>{p.apellido}, {p.nombre}</strong>{' '}
                <span className="ficha-email">{p.email}</span>
              </li>
            ))}
          </ul>
        ))}
      </section>

      <section className="ficha-seccion">
        <h4>Servicios</h4>
        {servicios && (
          <dl className="ficha-datos">
            <Dato titulo="Deportes">
              {servicios.deportes.length === 0 ? 'Sin inscripción.' : (
                <ul className="ficha-lista">
                  {servicios.deportes.map((d) => (
                    <li key={d.id}>{d.nombre} — {d.dia} {d.hora_inicio} a {d.hora_fin}</li>
                  ))}
                </ul>
              )}
            </Dato>
            <Dato titulo="Transporte">
              {servicios.transporte ? servicios.transporte.recorrido_nombre : 'Sin inscripción.'}
            </Dato>
            <Dato titulo="Comedor">{servicios.comedor ? 'Sí' : 'No'}</Dato>
          </dl>
        )}
      </section>
    </div>
  );
}
