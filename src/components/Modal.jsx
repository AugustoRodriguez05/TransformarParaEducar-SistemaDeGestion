import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import TituloSeccion from './TituloSeccion';

const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Ventana emergente. Se cierra con el botón, con Esc o con un clic en el fondo.
// anchoMaximo: ancho máximo de esta ventana (número en px o valor CSS); por defecto 640px.
// subtitulo y acciones (opcionales): contenido debajo del título y botones a su derecha.
export default function Modal({ icono, titulo, onClose, anchoMaximo = 640, subtitulo, acciones, children }) {
  const tituloId = useId();
  const ventanaRef = useRef(null);

  // Al abrir: el foco pasa a la ventana y la página de fondo deja de desplazarse.
  // Al cerrar: se restaura el desplazamiento y el foco vuelve a donde estaba.
  useEffect(() => {
    const focoAnterior = document.activeElement;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ventanaRef.current.focus();

    return () => {
      document.body.style.overflow = overflowAnterior;
      if (focoAnterior && document.contains(focoAnterior)) focoAnterior.focus();
    };
  }, []);

  useEffect(() => {
    const alPresionarTecla = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      // La tecla Tab recorre solo los controles de la ventana.
      const ventana = ventanaRef.current;
      const enfocables = ventana.querySelectorAll(ENFOCABLES);
      if (enfocables.length === 0) {
        e.preventDefault();
        return;
      }
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      const actual = document.activeElement;

      if (!ventana.contains(actual) || (e.shiftKey && (actual === primero || actual === ventana))) {
        e.preventDefault();
        (e.shiftKey ? ultimo : primero).focus();
      } else if (!e.shiftKey && actual === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };

    document.addEventListener('keydown', alPresionarTecla);
    return () => document.removeEventListener('keydown', alPresionarTecla);
  }, [onClose]);

  return (
    <div className="modal-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="modal-ventana"
        style={{ maxWidth: anchoMaximo }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        ref={ventanaRef}
      >
        <div className={acciones ? 'modal-encabezado con-acciones' : 'modal-encabezado'}>
          <div className="modal-titulo">
            <div id={tituloId}>
              <TituloSeccion icono={icono}>{titulo}</TituloSeccion>
            </div>
            {subtitulo && <div className="modal-subtitulo">{subtitulo}</div>}
          </div>
          {acciones && <div className="modal-acciones actions">{acciones}</div>}
          <button type="button" className="modal-cerrar" aria-label="Cerrar" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
