const express = require('express');
const pool = require('../config/db');
const { requireUser } = require('../middleware/auth');

const router = express.Router();

router.use(requireUser);

function serializeOrder(row) {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    total: Number(row.total),
    items: row.items,
    createdAt: row.created_at,
  };
}

// POST /api/orders  -> genera una factura a partir del carrito actual del usuario
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cartResult = await client.query(
      'SELECT * FROM cart_items WHERE user_id = $1 ORDER BY added_at ASC',
      [req.session.userId]
    );

    if (cartResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'Tu carrito está vacío.' });
    }

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
      `INSERT INTO orders (id, user_id, invoice_number, total, items)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [nextId, req.session.userId, invoiceNumber, total, JSON.stringify(items)]
    );

    await client.query('DELETE FROM cart_items WHERE user_id = $1', [req.session.userId]);

    await client.query('COMMIT');

    res.status(201).json({ ok: true, order: serializeOrder(insertResult.rows[0]) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[orders/post]', err);
    res.status(500).json({ ok: false, message: 'Error generando la factura.' });
  } finally {
    client.release();
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
