import { useEffect, useState } from 'react';
import { ArrowDown, Bus, Plus, Utensils, Volleyball } from 'lucide-react';
import { apiFetch } from '../api';
import { textoGrupo } from '../deportes';
import { validarNivelDelGrupo } from '../validaciones';
import TituloSeccion from './TituloSeccion';

// soloLectura: muestra los servicios sin selects ni botones para inscribir o dar
// de baja (el panel del alumno; el backend tampoco se lo permite).
export default function ServiciosAlumno({ alumnoId, soloLectura = false }) {
  const [deportes, setDeportes] = useState([]);
  const [recorridos, setRecorridos] = useState([]);
  const [servicios, setServicios] = useState(null);
  const [deporteSel, setDeporteSel] = useState('');
  const [recorridoSel, setRecorridoSel] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    // Los catálogos solo hacen falta para elegir en los selects.
    if (!soloLectura) {
      apiFetch('/api/servicios/deportes').then((d) => !cancelado && setDeportes(d));
      apiFetch('/api/servicios/recorridos').then((r) => !cancelado && setRecorridos(r));
    }
    apiFetch(`/api/servicios/alumnos/${alumnoId}`)
      .then((s) => !cancelado && setServicios(s))
      .catch((err) => !cancelado && setError(err.message));
    return () => { cancelado = true; };
  }, [alumnoId, soloLectura]);

  const ejecutar = async (path, method, body) => {
    setError('');
    try {
      const data = await apiFetch(`/api/servicios/alumnos/${alumnoId}${path}`, {
        method,
        body: body ? JSON.stringify(body) : undefined
      });
      setServicios(data);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!servicios) {
    return error ? <p className="error">{error}</p> : <p>Cargando servicios…</p>;
  }

  // Solo los grupos del nivel del alumno (o para todos los niveles).
  const gruposDelNivel = deportes.filter((d) => !validarNivelDelGrupo(d, servicios.nivel));

  return (
    <div className="servicios">
      <TituloSeccion nivel="h4" icono={Volleyball}>Actividades deportivas (máximo 2)</TituloSeccion>
      {servicios.deportes.length === 0 && <p>Sin deportes inscriptos.</p>}
      <ul className="servicios-lista">
        {servicios.deportes.map((d) => (
          <li key={d.id}>
            <span>{textoGrupo(d)}</span>
            {!soloLectura && (
              <button className="btn-accion btn-baja" onClick={() => ejecutar(`/deportes/${d.id}`, 'DELETE')}><ArrowDown size={16} aria-hidden="true" />Dar de baja</button>
            )}
          </li>
        ))}
      </ul>
      {!soloLectura && (
        <div className="servicios-form">
          <select value={deporteSel} onChange={(e) => setDeporteSel(e.target.value)}>
            <option value="">Elegir deporte…</option>
            {gruposDelNivel.map((d) => (
              <option key={d.id} value={d.id}>{textoGrupo(d)}</option>
            ))}
          </select>
          <button
            disabled={!deporteSel}
            onClick={() => { ejecutar('/deportes', 'POST', { deporte_id: deporteSel }); setDeporteSel(''); }}
          >
            <Plus size={18} aria-hidden="true" />
            Inscribir
          </button>
        </div>
      )}

      <TituloSeccion nivel="h4" icono={Bus}>Transporte</TituloSeccion>
      {servicios.transporte ? (
        <ul className="servicios-lista">
          <li>
            <span>{servicios.transporte.recorrido_nombre}</span>
            {!soloLectura && (
              <button className="btn-accion btn-baja" onClick={() => ejecutar('/transporte', 'DELETE')}><ArrowDown size={16} aria-hidden="true" />Dar de baja</button>
            )}
          </li>
        </ul>
      ) : soloLectura ? <p>Sin inscripción.</p> : (
        <div className="servicios-form">
          <select value={recorridoSel} onChange={(e) => setRecorridoSel(e.target.value)}>
            <option value="">Elegir recorrido…</option>
            {recorridos.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
          <button
            disabled={!recorridoSel}
            onClick={() => { ejecutar('/transporte', 'POST', { recorrido_id: recorridoSel }); setRecorridoSel(''); }}
          >
            <Plus size={18} aria-hidden="true" />
            Inscribir
          </button>
        </div>
      )}

      <TituloSeccion nivel="h4" icono={Utensils}>Comedor</TituloSeccion>
      {servicios.comedor ? (
        <ul className="servicios-lista">
          <li>
            <span>Inscripto al comedor</span>
            {!soloLectura && (
              <button className="btn-accion btn-baja" onClick={() => ejecutar('/comedor', 'DELETE')}><ArrowDown size={16} aria-hidden="true" />Dar de baja</button>
            )}
          </li>
        </ul>
      ) : soloLectura ? <p>Sin inscripción.</p> : (
        <button onClick={() => ejecutar('/comedor', 'POST')}><Plus size={18} aria-hidden="true" />Inscribir al comedor</button>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
