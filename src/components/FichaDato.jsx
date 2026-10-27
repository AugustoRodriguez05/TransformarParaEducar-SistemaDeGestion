// Un dato de una ficha: ícono a la izquierda, etiqueta arriba y valor abajo.
export default function FichaDato({ icono: Icono, titulo, children }) {
  return (
    <div className="ficha-dato">
      <dt><Icono size={20} aria-hidden="true" />{titulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}
