export default function ThIcono({ icono: Icono, children }) {
  return (
    <th>
      <span className="th-icono">
        <Icono size={16} aria-hidden="true" />
        {children}
      </span>
    </th>
  );
}
