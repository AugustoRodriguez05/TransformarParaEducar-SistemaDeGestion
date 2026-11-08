import PDFDocument from 'pdfkit';

// Importe en pesos con formato argentino: $ 1.234,50
export const formatearImporte = (importe) =>
  `$ ${Number(importe).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// AAAA-MM-DD → DD/MM/AAAA
const formatearFecha = (fecha) => fecha.split('-').reverse().join('/');

/**
 * PDF de una factura.
 * factura: { numero, alumno, legajo, periodo, vencimiento, total, items: [{ descripcion, importe }] }
 * Devuelve una promesa con el PDF en un Buffer.
 */
export function generarFacturaPdf(factura) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const partes = [];
    doc.on('data', (parte) => partes.push(parte));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const izquierda = doc.page.margins.left;
    const ancho = doc.page.width - izquierda - doc.page.margins.right;
    const anchoImporte = 120;
    const renglon = (descripcion, importe) => {
      const y = doc.y;
      doc.text(descripcion, izquierda, y, { width: ancho - anchoImporte - 10 });
      const yFin = doc.y;
      doc.text(importe, izquierda + ancho - anchoImporte, y, { width: anchoImporte, align: 'right' });
      doc.y = Math.max(yFin, doc.y) + 4;
    };
    const linea = () => {
      doc.moveTo(izquierda, doc.y).lineTo(izquierda + ancho, doc.y).stroke();
      doc.y += 6;
    };

    doc.font('Helvetica-Bold').fontSize(16).text(`Factura ${factura.numero}`);
    doc.font('Helvetica').fontSize(10).fillColor('#555555').text('Educar Para Transformar');
    doc.fillColor('#000000').moveDown();

    doc.fontSize(11);
    doc.text(`Alumno: ${factura.alumno} (legajo ${factura.legajo})`);
    doc.text(`Período: ${factura.periodo}`);
    doc.text(`Vencimiento: ${formatearFecha(factura.vencimiento)}`);
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(10);
    renglon('Concepto', 'Importe');
    linea();
    doc.font('Helvetica');
    for (const item of factura.items) renglon(item.descripcion, formatearImporte(item.importe));
    linea();
    doc.font('Helvetica-Bold');
    renglon('Total', formatearImporte(factura.total));

    doc.end();
  });
}
