import { useEffect, useState } from 'react';
import { apiFetch, apiDownload } from '../api';

export default function Reportes() {
  const [tipo, setTipo] = useState('curso');
  const [cursos, setCursos] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [cursoId, setCursoId] = useState('');
  const [materiaId, setMateriaId] = useState('');
  const [reporte, setReporte] = useState(null);
  const [consulta, setConsulta] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    apiFetch('/api/cursos').then((c) => !cancelado && setCursos(c));
    apiFetch('/api/materias').then((m) => !cancelado && setMaterias(m));
    return () => { cancelado = true; };
  }, []);

  const armarConsulta = () => {
    if (tipo === 'curso') {
      return cursoId ? `/api/reportes/curso?curso_id=${cursoId}` : null;
    }
    if (!materiaId) return null;
    return `/api/reportes/materia?materia_id=${materiaId}${cursoId ? `&curso_id=${cursoId}` : ''}`;
  };

  const cambiarTipo = (nuevo) => {
    setTipo(nuevo);
    setCursoId('');
    setMateriaId('');
    setReporte(null);
    setError('');
  };

  const generar = async (e) => {
    e.preventDefault();
    setError('');
    const path = armarConsulta();
    if (!path) return;
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
      <h2>Reportes</h2>

      <form className="card form-card" onSubmit={generar}>
        <div className="form-grid">
          <label>
            Tipo de reporte
            <select value={tipo} onChange={(e) => cambiarTipo(e.target.value)}>
              <option value="curso">Alumnos por curso</option>
              <option value="materia">Alumnos por materia</option>
            </select>
          </label>

          {tipo === 'materia' && (
            <label>
              Materia
              <select value={materiaId} onChange={(e) => setMateriaId(e.target.value)} required>
                <option value="">Seleccionar…</option>
                {materias.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </label>
          )}

          <label>
            {tipo === 'materia' ? 'Curso (opcional)' : 'Curso'}
            <select value={cursoId} onChange={(e) => setCursoId(e.target.value)} required={tipo === 'curso'}>
              <option value="">{tipo === 'materia' ? 'Todos los cursos' : 'Seleccionar…'}</option>
              {cursos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
        </div>
        <div className="form-actions">
          <button type="submit">Generar reporte</button>
        </div>
      </form>

      {error && <p className="error">{error}</p>}

      {reporte && (
        <div>
          <div className="page-header">
            <h3>{reporte.titulo}</h3>
            {reporte.filas.length > 0 && (
              <div className="form-actions">
                <button className="secondary" onClick={() => exportar('pdf')}>Exportar PDF</button>
                <button className="secondary" onClick={() => exportar('xlsx')}>Exportar Excel</button>
              </div>
            )}
          </div>

          {reporte.filas.length === 0 ? (
            <p>No hay resultados para los filtros seleccionados.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>{reporte.columnas.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {reporte.filas.map((f, i) => (
                  <tr key={i}>{reporte.columnas.map((c) => <td key={c.key}>{f[c.key]}</td>)}</tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
