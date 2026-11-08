import { useEffect, useState } from 'react';
import {
  AlertTriangle, BadgeCheck, Calendar, DollarSign, FilePlus, Hash, Mail, Receipt, Save, Search, Send, Table, Tags, User,
  Wallet
} from 'lucide-react';
import { apiFetch } from '../api';
import ThIcono from '../components/ThIcono';
import TituloSeccion from '../components/TituloSeccion';
import { textoGrupo } from '../deportes';
import { formatearFecha, hoyISO } from '../fecha';

const PESTANAS = [
  { id: 'valores', etiqueta: 'Valores', icono: Tags },
  { id: 'generar', etiqueta: 'Generar cuotas', icono: FilePlus },
  { id: 'facturas', etiqueta: 'Facturas y comprobantes', icono: Receipt },
  { id: 'envios', etiqueta: 'Envíos', icono: Mail }
];

const formatearImporte = (importe) =>
  `$ ${Number(importe).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Período del mes actual (AAAA-MM), el que propone el formulario.
const periodoActual = () => hoyISO().slice(0, 7);

export default function Cuotas() {
  const [pestana, setPestana] = useState('valores');

  return (
    <div>
      <TituloSeccion principal icono={Wallet}>Cuotas</TituloSeccion>

      <div className="form-actions" role="tablist" aria-label="Secciones de cuotas">
        {PESTANAS.map(({ id, etiqueta, icono: Icono }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pestana === id}
            className={pestana === id ? '' : 'secondary'}
            onClick={() => setPestana(id)}
          >
            <Icono size={18} aria-hidden="true" />{etiqueta}
          </button>
        ))}
      </div>

      {pestana === 'valores' && <Valores />}
      {pestana === 'generar' && <Generar />}
      {pestana === 'facturas' && <Facturas />}
      {pestana === 'envios' && <Envios />}
    </div>
  );
}

// ---------- Valores: cuota base, comedor, cada deporte y cada recorrido ----------

// Cada concepto se identifica en el formulario como "tipo:referencia".
function conceptos(valores) {
  return [
    { clave: 'cuota:', tipo: 'cuota', referencia_id: null, nombre: 'Cuota mensual', tarifa: valores.cuota },
    { clave: 'comedor:', tipo: 'comedor', referencia_id: null, nombre: 'Comedor', tarifa: valores.comedor },
    ...valores.deportes.map((d) => ({
      clave: `deporte:${d.id}`, tipo: 'deporte', referencia_id: d.id, nombre: `Deporte: ${textoGrupo(d)}`, tarifa: d.tarifa
    })),
    ...valores.recorridos.map((r) => ({
      clave: `transporte:${r.id}`, tipo: 'transporte', referencia_id: r.id, nombre: `Transporte: ${r.nombre}`, tarifa: r.tarifa
    }))
  ];
}

const VALOR_VACIO = { clave: '', importe: '', vigente_desde: '' };

function Valores() {
  const [valores, setValores] = useState(null);
  const [form, setForm] = useState({ ...VALOR_VACIO, vigente_desde: hoyISO() });
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    apiFetch('/api/cuotas/valores')
      .then((data) => !cancelado && setValores(data))
      .catch((err) => !cancelado && setError(err.message));
    return () => { cancelado = true; };
  }, []);

  const lista = valores ? conceptos(valores) : [];
  const handleChange = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    const concepto = lista.find((c) => c.clave === form.clave);
    if (!concepto) return;
    try {
      setValores(await apiFetch('/api/cuotas/valores', {
        method: 'PUT',
        body: JSON.stringify({
          tipo: concepto.tipo,
          referencia_id: concepto.referencia_id,
          importe: form.importe,
          vigente_desde: form.vigente_desde
        })
      }));
      setForm({ ...VALOR_VACIO, vigente_desde: hoyISO() });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <form className="card form-card" onSubmit={guardar}>
        <div className="form-grid">
          <label>
            Concepto
            <select value={form.clave} onChange={handleChange('clave')} required>
              <option value="">Seleccionar…</option>
              {lista.map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}
            </select>
          </label>
          <label>
            Importe
            <input inputMode="decimal" value={form.importe} onChange={handleChange('importe')} required />
          </label>
          <label>
            Vigente desde
            <input type="date" value={form.vigente_desde} onChange={handleChange('vigente_desde')} required />
          </label>
        </div>
        <div className="form-actions">
          <button type="submit"><Save size={18} aria-hidden="true" />Guardar valor</button>
        </div>
      </form>

      {error && <p className="error">{error}</p>}

      {valores && (
        <div className="tabla-scroll">
          <table className="data-table tabla-tarjetas">
            <thead>
              <tr>
                <ThIcono icono={Tags}>Concepto</ThIcono>
                <ThIcono icono={DollarSign}>Valor</ThIcono>
                <ThIcono icono={Calendar}>Vigente desde</ThIcono>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.clave}>
                  <td data-label="Concepto">{c.nombre}</td>
                  <td data-label="Valor">{c.tarifa ? formatearImporte(c.tarifa.importe) : '—'}</td>
                  <td data-label="Vigente desde">{c.tarifa ? formatearFecha(c.tarifa.vigente_desde) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------- Generar cuotas de un período ----------

function Generar() {
  const [periodo, setPeriodo] = useState(periodoActual());
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');

  const generar = async (e) => {
    e.preventDefault();
    setError('');
    setResultado(null);
    try {
      setResultado(await apiFetch('/api/cuotas/generar', { method: 'POST', body: JSON.stringify({ periodo }) }));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <form className="card form-card" onSubmit={generar}>
        <div className="form-grid">
          <label>
            Período
            <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} required />
          </label>
        </div>
        <div className="form-actions">
          <button type="submit"><FilePlus size={18} aria-hidden="true" />Generar cuotas</button>
        </div>
      </form>

      {error && <p className="error">{error}</p>}
      {resultado && (
        <p className="success">
          Período {resultado.periodo}: {resultado.creadas} cuota(s) creada(s) y {resultado.salteadas} salteada(s) porque ya existían.
        </p>
      )}
    </>
  );
}

// ---------- Facturas y comprobantes de un período ----------

function Facturas() {
  const [periodo, setPeriodo] = useState(periodoActual());
  const [facturas, setFacturas] = useState(null);
  const [error, setError] = useState('');

  const buscar = async (e) => {
    e.preventDefault();
    setError('');
    try {
      setFacturas(await apiFetch(`/api/cuotas/facturas?periodo=${encodeURIComponent(periodo)}`));
    } catch (err) {
      setFacturas(null);
      setError(err.message);
    }
  };

  return (
    <>
      <form className="card form-card" onSubmit={buscar}>
        <div className="form-grid">
          <label>
            Período
            <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} required />
          </label>
        </div>
        <div className="form-actions">
          <button type="submit"><Search size={18} aria-hidden="true" />Ver facturas</button>
        </div>
      </form>

      {error && <p className="error">{error}</p>}

      {facturas && (facturas.length === 0 ? <p>No hay facturas para el período seleccionado.</p> : (
        <div className="tabla-scroll">
          <table className="data-table tabla-tarjetas">
            <thead>
              <tr>
                <ThIcono icono={User}>Alumno</ThIcono>
                <ThIcono icono={Hash}>Número</ThIcono>
                <ThIcono icono={DollarSign}>Total</ThIcono>
                <ThIcono icono={BadgeCheck}>Estado</ThIcono>
                <ThIcono icono={Table}>Comprobantes</ThIcono>
              </tr>
            </thead>
            <tbody>
              {facturas.map((f) => (
                <tr key={f.id}>
                  <td data-label="Alumno">{f.alumno} ({f.legajo})</td>
                  <td data-label="Número">{f.numero}</td>
                  <td data-label="Total">{formatearImporte(f.total)}</td>
                  <td data-label="Estado"><span className={`badge ${f.estado.toLowerCase()}`}>{f.estado}</span></td>
                  <td data-label="Comprobantes">
                    {f.comprobantes.length === 0 ? '—' : (
                      <ul className="ficha-lista">
                        {f.comprobantes.map((c) => (
                          <li key={c.numero_operacion}>
                            {formatearImporte(c.importe)} — {formatearFecha(c.fecha_transferencia)} — Op. {c.numero_operacion}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

// ---------- Envíos de mails a padres ----------

const TIPOS_ENVIO = { recordatorio: 'Recordatorio', deuda: 'Deuda' };
// Estado del envío → clase de badge existente.
const BADGE_ENVIO = { Enviado: 'confirmado', Error: 'cancelado', Pendiente: 'pendiente' };

// "AAAA-MM-DD HH:MM:SS" → "DD/MM/AAAA HH:MM"
const formatearFechaHora = (fecha) => `${formatearFecha(fecha.slice(0, 10))} ${fecha.slice(11, 16)}`;

function Envios() {
  const [periodo, setPeriodo] = useState(periodoActual());
  const [envios, setEnvios] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  const cargar = (p) => apiFetch(`/api/cuotas/envios?periodo=${encodeURIComponent(p)}`);

  useEffect(() => {
    if (!periodo) return;
    let cancelado = false;
    cargar(periodo)
      .then((data) => !cancelado && setEnvios(data))
      .catch((err) => !cancelado && setError(err.message));
    return () => { cancelado = true; };
  }, [periodo]);

  const cambiarPeriodo = (valor) => {
    setPeriodo(valor);
    setEnvios(null);
    setMensaje('');
    setError('');
  };

  const enviar = async (tipo) => {
    if (!periodo) return;
    setError('');
    setMensaje('');
    setEnviando(true);
    try {
      const r = await apiFetch(`/api/cuotas/envios/${tipo}`, { method: 'POST', body: JSON.stringify({ periodo }) });
      setMensaje(`${TIPOS_ENVIO[tipo]} de ${r.periodo}: ${r.enviados} enviado(s), ${r.errores} con error y ${r.salteados} salteado(s) porque ya se habían enviado.`);
      setEnvios(await cargar(periodo));
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <div className="card form-card">
        <div className="form-grid">
          <label>
            Período
            <input type="month" value={periodo} onChange={(e) => cambiarPeriodo(e.target.value)} required />
          </label>
        </div>
        <div className="form-actions">
          <button type="button" disabled={enviando || !periodo} onClick={() => enviar('recordatorio')}>
            <Send size={18} aria-hidden="true" />Enviar recordatorio
          </button>
          <button type="button" disabled={enviando || !periodo} onClick={() => enviar('deuda')}>
            <AlertTriangle size={18} aria-hidden="true" />Enviar deuda
          </button>
        </div>
      </div>

      {enviando && <p>Enviando mails…</p>}
      {mensaje && <p className="success">{mensaje}</p>}
      {error && <p className="error">{error}</p>}

      {envios && (envios.length === 0 ? <p>No hay envíos para el período seleccionado.</p> : (
        <div className="tabla-scroll">
          <table className="data-table tabla-tarjetas">
            <thead>
              <tr>
                <ThIcono icono={User}>Padre</ThIcono>
                <ThIcono icono={Mail}>Tipo</ThIcono>
                <ThIcono icono={BadgeCheck}>Estado</ThIcono>
                <ThIcono icono={Calendar}>Fecha</ThIcono>
              </tr>
            </thead>
            <tbody>
              {envios.map((e) => (
                <tr key={e.id}>
                  <td data-label="Padre">{e.padre} ({e.email})</td>
                  <td data-label="Tipo">{TIPOS_ENVIO[e.tipo]}</td>
                  <td data-label="Estado">
                    <span className={`badge ${BADGE_ENVIO[e.estado]}`}>{e.estado}</span>
                    {e.intentos > 1 && ` (${e.intentos} intentos)`}
                  </td>
                  <td data-label="Fecha">{formatearFechaHora(e.fecha)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
