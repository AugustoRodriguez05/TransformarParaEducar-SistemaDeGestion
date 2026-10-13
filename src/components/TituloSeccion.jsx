export default function TituloSeccion({ icono: Icono, principal = false, nivel = 'h3', children }) {
  const Titulo = principal ? 'h2' : nivel;

  return (
    <div className={principal ? 'page-title' : 'section-title'}>
      <span className="icon-circle">
        <Icono size={principal ? 28 : 22} aria-hidden="true" />
      </span>
      <Titulo>{children}</Titulo>
    </div>
  );
}
