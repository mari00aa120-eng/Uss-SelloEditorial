const express = require('express');
const pool = require('../config/db');
const { requireUser } = require('../middleware/auth');

const router = express.Router();

// Todas las rutas de carrito requieren que el usuario haya iniciado sesión.
router.use(requireUser);

function serializeItem(row) {
  return {
    id: row.id,
    productId: row.product_id,
    name: row.product_name,
    author: row.product_author,
    price: Number(row.product_price),
    image: row.product_image,
    quantity: row.quantity,
    subtotal: Number(row.product_price) * row.quantity,
  };
}

// GET /api/cart
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM cart_items WHERE user_id = $1 ORDER BY added_at ASC',
      [req.session.userId]
    );
    const items = result.rows.map(serializeItem);
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    res.json({ ok: true, items, total, count: items.reduce((n, i) => n + i.quantity, 0) });
  } catch (err) {
    console.error('[cart/get]', err);
    res.status(500).json({ ok: false, message: 'Error obteniendo el carrito.' });
  }
});

// POST /api/cart  -> agrega un producto (o incrementa su cantidad si ya existe)
router.post('/', async (req, res) => {
  try {
    const { productId, name, author, price, image, quantity } = req.body;
    if (!productId || !name || price === undefined) {
      return res.status(400).json({ ok: false, message: 'Datos del producto incompletos.' });
    }
    const qty = Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
    const numericPrice = Number(price);
    if (Number.isNaN(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ ok: false, message: 'Precio inválido.' });
    }

    const result = await pool.query(
      `INSERT INTO cart_items (user_id, product_id, product_name, product_author, product_price, product_image, quantity)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
       RETURNING *`,
      [req.session.userId, productId, name, author || null, numericPrice, image || null, qty]
    );

    res.status(201).json({ ok: true, item: serializeItem(result.rows[0]) });
  } catch (err) {
    console.error('[cart/post]', err);
    res.status(500).json({ ok: false, message: 'Error agregando el producto al carrito.' });
  }
});

// PATCH /api/cart/:itemId  -> actualiza la cantidad
router.patch('/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ ok: false, message: 'Cantidad inválida.' });
    }
    const result = await pool.query(
      `UPDATE cart_items SET quantity = $1
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [quantity, itemId, req.session.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Producto no encontrado en tu carrito.' });
    }
    res.json({ ok: true, item: serializeItem(result.rows[0]) });
  } catch (err) {
    console.error('[cart/patch]', err);
    res.status(500).json({ ok: false, message: 'Error actualizando el carrito.' });
  }
});

// DELETE /api/cart/:itemId
router.delete('/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const result = await pool.query(
      'DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING id',
      [itemId, req.session.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Producto no encontrado en tu carrito.' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[cart/delete]', err);
    res.status(500).json({ ok: false, message: 'Error eliminando el producto.' });
  }
});

module.exports = router;
