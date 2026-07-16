// =========================================================
//  invoice.js
//  Genera el PDF de la factura electrónica usando pdfkit
//  (librería open-source, sin costo ni API externa).
//  No se guarda el PDF en disco: se genera en memoria (Buffer)
//  cada vez que se necesita, a partir de los datos ya guardados
//  en la tabla "orders" (columna items en JSONB + total, etc).
// =========================================================

const PDFDocument = require('pdfkit');

const GREEN = '#046C3B';
const INK = '#1a1a1a';
const GRAY = '#666666';
const BORDER = '#e0ddd6';

function formatSoles(value) {
  return 'S/ ' + Number(value).toFixed(2);
}

function formatDateEs(date) {
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  const d = new Date(date);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = meses[d.getMonth()];
  const anio = d.getFullYear();
  let horas = d.getHours();
  const minutos = String(d.getMinutes()).padStart(2, '0');
  const ampm = horas >= 12 ? 'pm' : 'am';
  horas = horas % 12;
  if (horas === 0) horas = 12;
  return `${dia} de ${mes.charAt(0).toUpperCase() + mes.slice(1)} de ${anio} - ${horas}:${minutos} ${ampm}`;
}

/**
 * Genera el PDF de una factura y devuelve un Buffer.
 * @param {Object} order
 * @param {string} order.invoiceNumber
 * @param {string|Date} order.createdAt
 * @param {number} order.total
 * @param {Array} order.items  [{ name, author, price, quantity, subtotal }]
 * @param {string} order.paymentMethod
 * @param {Object} order.customer { firstName, lastName, email }
 */
function generateInvoicePdf(order) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      // ---------- Encabezado ----------
      doc
        .fillColor(GREEN)
        .fontSize(20)
        .font('Helvetica-Bold')
        .text('USS Fondo Editorial', 50, 50);

      doc
        .fillColor(GRAY)
        .fontSize(9)
        .font('Helvetica')
        .text('Universidad Señor de Sipán', 50, 74)
        .text('Km 5 Carretera a Pimentel, Chiclayo, Perú', 50, 87);

      doc
        .fillColor(INK)
        .fontSize(16)
        .font('Helvetica-Bold')
        .text('Factura Electrónica', 50, 120);

      doc
        .fillColor(GREEN)
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(order.invoiceNumber, 50, 142);

      doc.moveTo(50, 168).lineTo(50 + pageWidth, 168).strokeColor(BORDER).lineWidth(1).stroke();

      // ---------- Datos del pedido ----------
      let y = 184;
      const rows = [
        ['Número de pedido', '#' + order.invoiceNumber],
        ['Fecha', formatDateEs(order.createdAt)],
        ['Cliente', `${order.customer.firstName} ${order.customer.lastName}`],
        ['Correo', order.customer.email],
        ['Método de pago', order.paymentMethod || 'No especificado'],
        ['Estado', 'Confirmado'],
      ];
      rows.forEach(([label, value]) => {
        doc.fillColor(GRAY).fontSize(10).font('Helvetica').text(label, 50, y, { width: 150 });
        doc.fillColor(INK).fontSize(10).font('Helvetica-Bold').text(value, 210, y, { width: pageWidth - 160 });
        y += 20;
      });

      y += 10;
      doc.moveTo(50, y).lineTo(50 + pageWidth, y).strokeColor(BORDER).lineWidth(1).stroke();
      y += 20;

      // ---------- Tabla de productos ----------
      doc.fillColor(GRAY).fontSize(9).font('Helvetica-Bold');
      doc.text('PRODUCTO', 50, y, { width: 230 });
      doc.text('CANT.', 280, y, { width: 50, align: 'center' });
      doc.text('PRECIO', 335, y, { width: 80, align: 'right' });
      doc.text('SUBTOTAL', 420, y, { width: 80, align: 'right' });
      y += 16;
      doc.moveTo(50, y).lineTo(50 + pageWidth, y).strokeColor(BORDER).lineWidth(1).stroke();
      y += 10;

      order.items.forEach((item) => {
        const nameHeight = doc.heightOfString(item.name, { width: 230, font: 'Helvetica', fontSize: 10 });
        doc.fillColor(INK).fontSize(10).font('Helvetica').text(item.name, 50, y, { width: 230 });
        if (item.author) {
          doc.fillColor(GRAY).fontSize(8).font('Helvetica').text(item.author, 50, y + nameHeight + 1, { width: 230 });
        }
        doc.fillColor(INK).fontSize(10).font('Helvetica').text(String(item.quantity), 280, y, { width: 50, align: 'center' });
        doc.fillColor(INK).fontSize(10).font('Helvetica').text(formatSoles(item.price), 335, y, { width: 80, align: 'right' });
        doc.fillColor(INK).fontSize(10).font('Helvetica-Bold').text(formatSoles(item.subtotal), 420, y, { width: 80, align: 'right' });

        y += Math.max(24, nameHeight + (item.author ? 14 : 0) + 10);
        doc.moveTo(50, y - 6).lineTo(50 + pageWidth, y - 6).strokeColor('#f0eee8').lineWidth(0.5).stroke();

        if (y > 680) {
          doc.addPage();
          y = 50;
        }
      });

      y += 10;

      // ---------- Total ----------
      doc.moveTo(300, y).lineTo(50 + pageWidth, y).strokeColor(BORDER).lineWidth(1).stroke();
      y += 14;
      doc.fillColor(INK).fontSize(12).font('Helvetica-Bold').text('Total', 335, y, { width: 80, align: 'right' });
      doc.fillColor(GREEN).fontSize(14).font('Helvetica-Bold').text(formatSoles(order.total), 420, y - 2, { width: 80, align: 'right' });

      // ---------- Pie de página ----------
      const footerY = 760;
      doc.moveTo(50, footerY).lineTo(50 + pageWidth, footerY).strokeColor(BORDER).lineWidth(1).stroke();
      doc
        .fillColor(GRAY)
        .fontSize(8)
        .font('Helvetica')
        .text(
          'Esta es una factura electrónica generada automáticamente por USS Fondo Editorial. Gracias por tu compra.',
          50,
          footerY + 10,
          { width: pageWidth, align: 'center' }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateInvoicePdf, formatSoles, formatDateEs };
