const express = require('express');
const pool = require('../config/db');
const { requireUser } = require('../middleware/auth');
const { generateInvoicePdf } = require('../utils/invoice');
const { sendInvoiceEmail } = require('../config/brevo');

const router = express.Router();

router.use(requireUser);

function serializeOrder(row) {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    total: Number(row.total),
    items: row.items,
    paymentMethod: row.payment_method,
    emailSent: row.email_sent,
    createdAt: row.created_at,
  };
}

// POST /api/orders  -> genera una factura a partir del carrito actual del usuario
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { paymentMethod } = req.body;

    const cartResult = await client.query(
      'SELECT * FROM cart_items WHERE user_id = $1 ORDER BY added_at ASC',
      [req.session.userId]
    );

    if (cartResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'Tu carrito está vacío.' });
    }

    const userResult = await client.query(
      'SELECT first_name, last_name, email FROM users WHERE id = $1',
      [req.session.userId]
    );
    const customer = userResult.rows[0];

    const items = cartResult.rows.map((row) => ({
      productId: row.product_id,
      name: row.product_name,
      author: row.product_author,
      price: Number(row.product_price),
      image: row.product_image,
      quantity: row.quantity,
      subtotal: Number(row.product_price) * row.quantity,
    }));
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);

    // Número de factura correlativo simple basado en el próximo id de la secuencia.
    const seqResult = await client.query("SELECT nextval(pg_get_serial_sequence('orders', 'id')) AS next_id");
    const nextId = seqResult.rows[0].next_id;
    const invoiceNumber = 'FE-' + String(nextId).padStart(7, '0');

    const insertResult = await client.query(
      `INSERT INTO orders (id, user_id, invoice_number, total, items, payment_method, email_sent)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE)
       RETURNING *`,
      [nextId, req.session.userId, invoiceNumber, total, JSON.stringify(items), paymentMethod || 'No especificado']
    );

    await client.query('DELETE FROM cart_items WHERE user_id = $1', [req.session.userId]);

    await client.query('COMMIT');

    const order = insertResult.rows[0];

    // Responder de inmediato con el pedido creado; el envío de la factura
    // por correo se intenta a continuación y no debe bloquear ni tumbar
    // la respuesta si Brevo falla (el usuario igual puede descargar el PDF).
    res.status(201).json({ ok: true, order: serializeOrder(order) });

    try {
      const pdfBuffer = await generateInvoicePdf({
        invoiceNumber: order.invoice_number,
        createdAt: order.created_at,
        total: Number(order.total),
        items: order.items,
        paymentMethod: order.payment_method,
        customer: { firstName: customer.first_name, lastName: customer.last_name, email: customer.email },
      });

      await sendInvoiceEmail({
        to: customer.email,
        cc: process.env.ADMIN_EMAIL,
        customerName: customer.first_name,
        invoiceNumber: order.invoice_number,
        total: order.total,
        pdfBuffer,
      });

      await pool.query('UPDATE orders SET email_sent = TRUE WHERE id = $1', [order.id]);
    } catch (emailErr) {
      console.error('[orders/post] Error enviando la factura por correo:', emailErr.message);
      // No hacemos nada más: email_sent queda en FALSE y el usuario puede
      // descargar el PDF manualmente desde confirmacionPago.html.
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[orders/post]', err);
    res.status(500).json({ ok: false, message: 'Error generando la factura.' });
  } finally {
    client.release();
  }
});

// GET /api/orders/:id/invoice.pdf -> descarga el PDF de una factura del usuario
router.get('/:id/invoice.pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT o.*, u.first_name, u.last_name, u.email
       FROM orders o
       JOIN users u ON u.id = o.user_id
       WHERE o.id = $1 AND o.user_id = $2`,
      [id, req.session.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Factura no encontrada.' });
    }
    const order = result.rows[0];

    const pdfBuffer = await generateInvoicePdf({
      invoiceNumber: order.invoice_number,
      createdAt: order.created_at,
      total: Number(order.total),
      items: order.items,
      paymentMethod: order.payment_method,
      customer: { firstName: order.first_name, lastName: order.last_name, email: order.email },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${order.invoice_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[orders/invoice.pdf]', err);
    res.status(500).json({ ok: false, message: 'Error generando el PDF de la factura.' });
  }
});

// GET /api/orders -> lista las facturas/pedidos del usuario (más reciente primero)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
      [req.session.userId]
    );
    res.json({ ok: true, orders: result.rows.map(serializeOrder) });
  } catch (err) {
    console.error('[orders/get]', err);
    res.status(500).json({ ok: false, message: 'Error obteniendo tus productos.' });
  }
});

module.exports = router;
