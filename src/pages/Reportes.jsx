import { useEffect, useState } from 'react';
import { Download, FileBarChart, Table } from 'lucide-react';
import { apiFetch, apiDownload } from '../api';
import TituloSeccion from '../components/TituloSeccion';
import { textoGrupo } from '../deportes';
import { NIVELES } from '../validaciones';

// Cada reporte: su ruta en /api/reportes y sus filtros, [parámetro, obligatorio].
const REPORTES = [
  { tipo: 'curso', etiqueta: 'Alumnos por curso', filtros: [['curso_id', true]] },
  { tipo: 'materia', etiqueta: 'Alumnos por materia', filtros: [['materia_id', true], ['curso_id', false]] },
  { tipo: 'docentes-nivel', etiqueta: 'Docentes por nivel educativo', filtros: [['nivel', true]] },
  { tipo: 'deporte', etiqueta: 'Alumnos por deporte', filtros: [['deporte_id', true]] },
  { tipo: 'deporte-nivel', etiqueta: 'Alumnos por deporte y nivel', filtros: [['deporte_id', true], ['nivel', true]] },
  {
    tipo: 'deporte-detalle',
    etiqueta: 'Alumnos por deporte, nivel, horario y profesor',
    filtros: [['deporte_id', false], ['nivel', false]]
  },
  { tipo: 'recorrido', etiqueta: 'Alumnos por recorrido de transporte', filtros: [['recorrido_id', true]] }
];

// Etiqueta de cada filtro y, si alguno de los reportes lo usa como opcional, el texto de la opción vacía.
const FILTROS = {
  curso_id: { etiqueta: 'Curso', todos: 'Todos los cursos' },
  materia_id: { etiqueta: 'Materia' },
  nivel: { etiqueta: 'Nivel', todos: 'Todos los niveles' },
  deporte_id: { etiqueta: 'Deporte', todos: 'Todos los deportes' },
  recorrido_id: { etiqueta: 'Recorrido' }
};

const aOpciones = (lista, texto = (x) => x.nombre) => lista.map((x) => ({ valor: x.id, texto: texto(x) }));

export default function Reportes() {
  const [tipo, setTipo] = useState('curso');
  const [opciones, setOpciones] = useState({ nivel: NIVELES.map((n) => ({ valor: n, texto: n })) });
  const [valores, setValores] = useState({});
  const [reporte, setReporte] = useState(null);
  const [consulta, setConsulta] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    const cargar = (campo, path, texto) => apiFetch(path)
      .then((lista) => !cancelado && setOpciones((o) => ({ ...o, [campo]: aOpciones(lista, texto) })))
      .catch((err) => !cancelado && setError(err.message));
    void cargar('curso_id', '/api/cursos');
    void cargar('materia_id', '/api/materias');
    // Cada deporte es un grupo: la opción muestra nombre, nivel y horario.
    void cargar('deporte_id', '/api/servicios/deportes', textoGrupo);
    void cargar('recorrido_id', '/api/servicios/recorridos');
    return () => { cancelado = true; };
  }, []);

  const { filtros } = REPORTES.find((r) => r.tipo === tipo);

  const cambiarTipo = (nuevo) => {
    setTipo(nuevo);
    setValores({});
    setReporte(null);
    setError('');
  };

  const generar = async (e) => {
    e.preventDefault();
    setError('');
    if (filtros.some(([campo, obligatorio]) => obligatorio && !valores[campo])) return;
    const params = new URLSearchParams();
    filtros.forEach(([campo]) => valores[campo] && params.set(campo, valores[campo]));
    const path = `/api/reportes/${tipo}?${params}`;
    try {
      setReporte(await apiFetch(path));
      setConsulta(path);
    } catch (err) {
      setReporte(null);
      setError(err.message);
    }
  };

  const exportar = async (formato) => {
    setError('');
    try {
      await apiDownload(`${consulta}&formato=${formato}`, `reporte-${tipo}.${formato}`);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <TituloSeccion principal icono={FileBarChart}>Reportes</TituloSeccion>

      <form className="card form-card" onSubmit={generar}>
        <div className="form-grid">
          <label>
            Tipo de reporte
            <select value={tipo} onChange={(e) => cambiarTipo(e.target.value)}>
              {REPORTES.map((r) => <option key={r.tipo} value={r.tipo}>{r.etiqueta}</option>)}
            </select>
          </label>

          {filtros.map(([campo, obligatorio]) => (
            <label key={campo}>
              {obligatorio ? FILTROS[campo].etiqueta : `${FILTROS[campo].etiqueta} (opcional)`}
              <select
                value={valores[campo] || ''}
                onChange={(e) => setValores({ ...valores, [campo]: e.target.value })}
                required={obligatorio}
              >
                <option value="">{obligatorio ? 'Seleccionar…' : FILTROS[campo].todos}</option>
                {(opciones[campo] || []).map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
              </select>
            </label>
          ))}
        </div>
        <div className="form-actions">
          <button type="submit"><FileBarChart size={18} aria-hidden="true" />Generar reporte</button>
        </div>
      </form>

      {error && <p className="error">{error}</p>}

      {reporte && (
        <div>
          <div className="page-header">
            <TituloSeccion icono={Table}>{reporte.titulo}</TituloSeccion>
            {reporte.filas.length > 0 && (
              <div className="form-actions">
                <button className="secondary" onClick={() => exportar('pdf')}><Download size={18} aria-hidden="true" />Exportar PDF</button>
                <button className="secondary" onClick={() => exportar('xlsx')}><Download size={18} aria-hidden="true" />Exportar Excel</button>
              </div>
            )}
          </div>

          {reporte.filas.length === 0 ? (
            <p>No hay resultados para los filtros seleccionados.</p>
          ) : (
            <div className="tabla-scroll">
              <table className="data-table tabla-tarjetas">
                <thead>
                  <tr>{reporte.columnas.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
                </thead>
                <tbody>
                  {reporte.filas.map((f, i) => (
                    <tr key={i}>
                      {reporte.columnas.map((c) => <td key={c.key} data-label={c.label}>{f[c.key]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
