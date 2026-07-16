const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../config/db');
const { sendAdminCodeEmail, sendAdminResponseEmail } = require('../config/brevo');
const { generateSixDigitCode, hashCode } = require('../utils/codes');
const { requireAdmin } = require('../middleware/auth');
const {
  getAllPaymentAccounts,
  getPaymentAccount,
  updatePaymentAccount,
  REQUESTABLE_METHODS,
} = require('../config/paymentAccountsStore');

const ORDER_STATUSES = ['procesando', 'pagado', 'pendiente_pago'];
const FONDO_EDITORIAL_EMAIL = 'fondoeditorial@uss.edu.pe';

// Cuánto tiempo se considera "tomado" un usuario después de que un admin le
// dio clic a Responder, por si cierra la pestaña sin cancelar/enviar y deja
// el usuario bloqueado para los demás para siempre.
const CLAIM_STALE_MINUTES = 15;

function isClaimActive(claimedAt) {
  if (!claimedAt) return false;
  const ageMs = Date.now() - new Date(claimedAt).getTime();
  return ageMs < CLAIM_STALE_MINUTES * 60 * 1000;
}

const router = express.Router();

const CODE_TTL_MINUTES = 10;

const requestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiadas solicitudes de código. Intenta más tarde.' },
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiados intentos. Intenta más tarde.' },
});

// POST /api/admin/request-code  { email }
// Solo el correo definido en ADMIN_EMAIL puede recibir un código válido.
router.post('/request-code', requestLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ ok: false, message: 'El correo es obligatorio.' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const authorizedEmails = (process.env.ADMIN_EMAIL || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (authorizedEmails.length === 0 || !authorizedEmails.includes(normalizedEmail)) {
      // No revelamos si el correo existe o no en el sistema, solo negamos el acceso.
      return res.status(403).json({ ok: false, message: 'Este correo no está autorizado para acceder al panel.' });
    }

    const code = generateSixDigitCode();
    const codeHash = hashCode(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

    // Invalida códigos anteriores no usados de este correo.
    await pool.query(
      'UPDATE admin_auth_codes SET used = TRUE WHERE email = $1 AND used = FALSE',
      [normalizedEmail]
    );

    await pool.query(
      `INSERT INTO admin_auth_codes (email, code_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [normalizedEmail, codeHash, expiresAt]
    );

    await sendAdminCodeEmail(normalizedEmail, code);

    res.json({ ok: true, message: 'Código enviado. Revisa tu correo (vence en 10 minutos).' });
  } catch (err) {
    console.error('[admin/request-code]', err);
    res.status(500).json({ ok: false, message: 'Error enviando el código. Intenta nuevamente.' });
  }
});

// POST /api/admin/verify-code  { email, code }
router.post('/verify-code', verifyLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ ok: false, message: 'Correo y código son obligatorios.' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const authorizedEmails = (process.env.ADMIN_EMAIL || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (authorizedEmails.length === 0 || !authorizedEmails.includes(normalizedEmail)) {
      return res.status(403).json({ ok: false, message: 'Correo no autorizado.' });
    }

    const codeHash = hashCode(String(code).trim());

    const result = await pool.query(
      `SELECT id FROM admin_auth_codes
       WHERE email = $1 AND code_hash = $2 AND used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [normalizedEmail, codeHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ ok: false, message: 'Código incorrecto o expirado.' });
    }

    await pool.query('UPDATE admin_auth_codes SET used = TRUE WHERE id = $1', [result.rows[0].id]);

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ ok: false, message: 'Error creando la sesión de administrador.' });
      req.session.isAdmin = true;
      req.session.adminEmail = normalizedEmail;
      res.json({ ok: true, message: 'Acceso concedido.' });
    });
  } catch (err) {
    console.error('[admin/verify-code]', err);
    res.status(500).json({ ok: false, message: 'Error verificando el código.' });
  }
});

// GET /api/admin/session -> saber si la sesión actual ya es admin
router.get('/session', (req, res) => {
  const isAdmin = Boolean(req.session && req.session.isAdmin);
  res.json({ ok: true, isAdmin, email: isAdmin ? req.session.adminEmail : null });
});

// POST /api/admin/logout
router.post('/logout', (req, res) => {
  req.session.isAdmin = false;
  req.session.adminEmail = null;
  req.session.destroy(() => {
    res.clearCookie('uss.sid');
    res.json({ ok: true });
  });
});

// ---------- Rutas protegidas del dashboard (requieren sesión admin) ----------

// GET /api/admin/stats
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const [{ rows: userCountRows }, { rows: cartCountRows }, { rows: recentUsers }] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM users'),
      pool.query('SELECT COUNT(*)::int AS count, COALESCE(SUM(quantity),0)::int AS units FROM cart_items'),
      pool.query(`
        SELECT
          u.id, u.first_name, u.last_name, u.email, u.created_at,
          t.status AS ticket_status,
          t.order_status AS ticket_order_status,
          t.last_message AS ticket_last_message,
          t.payment_method AS ticket_payment_method,
          t.payment_amount AS ticket_payment_amount,
          t.claimed_by AS ticket_claimed_by,
          t.claimed_at AS ticket_claimed_at,
          t.updated_at AS ticket_updated_at,
          o.id AS order_id,
          o.invoice_number AS order_invoice_number,
          o.total AS order_total,
          o.payment_method AS order_payment_method,
          o.email_sent AS order_email_sent,
          o.created_at AS order_created_at
        FROM users u
        LEFT JOIN admin_tickets t ON t.user_id = u.id
        LEFT JOIN LATERAL (
          SELECT * FROM orders WHERE orders.user_id = u.id ORDER BY created_at DESC LIMIT 1
        ) o ON TRUE
        ORDER BY u.created_at DESC
        LIMIT 10
      `),
    ]);

    res.json({
      ok: true,
      stats: {
        totalUsers: userCountRows[0].count,
        totalCartLines: cartCountRows[0].count,
        totalCartUnits: cartCountRows[0].units,
      },
      recentUsers: recentUsers.map(serializeUserRow),
    });
  } catch (err) {
    console.error('[admin/stats]', err);
    res.status(500).json({ ok: false, message: 'Error obteniendo estadísticas.' });
  }
});

function serializeUserRow(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    createdAt: row.created_at,
    ticket: {
      status: row.ticket_status || 'pendiente', // pendiente | esperando | respondido
      orderStatus: row.ticket_order_status,
      lastMessage: row.ticket_last_message,
      paymentMethod: row.ticket_payment_method,
      paymentAmount: row.ticket_payment_amount !== null ? Number(row.ticket_payment_amount) : null,
      claimedBy: isClaimActive(row.ticket_claimed_at) ? row.ticket_claimed_by : null,
      claimedAt: isClaimActive(row.ticket_claimed_at) ? row.ticket_claimed_at : null,
      updatedAt: row.ticket_updated_at,
    },
    latestOrder: row.order_id
      ? {
          id: row.order_id,
          invoiceNumber: row.order_invoice_number,
          total: Number(row.order_total),
          paymentMethod: row.order_payment_method,
          emailSent: row.order_email_sent,
          createdAt: row.order_created_at,
        }
      : null,
  };
}

// GET /api/admin/users/:id/detail -> info completa de un usuario para el panel de "Responder"
router.get('/users/:id/detail', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `
        SELECT
          u.id, u.first_name, u.last_name, u.email, u.created_at,
          t.status AS ticket_status,
          t.order_status AS ticket_order_status,
          t.last_message AS ticket_last_message,
          t.payment_method AS ticket_payment_method,
          t.payment_amount AS ticket_payment_amount,
          t.claimed_by AS ticket_claimed_by,
          t.claimed_at AS ticket_claimed_at,
          t.updated_at AS ticket_updated_at,
          o.id AS order_id,
          o.invoice_number AS order_invoice_number,
          o.total AS order_total,
          o.payment_method AS order_payment_method,
          o.email_sent AS order_email_sent,
          o.created_at AS order_created_at
        FROM users u
        LEFT JOIN admin_tickets t ON t.user_id = u.id
        LEFT JOIN LATERAL (
          SELECT * FROM orders WHERE orders.user_id = u.id ORDER BY created_at DESC LIMIT 1
        ) o ON TRUE
        WHERE u.id = $1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    }

    res.json({
      ok: true,
      user: serializeUserRow(rows[0]),
      fondoEditorialEmail: FONDO_EDITORIAL_EMAIL,
      paymentMethods: await getAllPaymentAccounts(),
    });
  } catch (err) {
    console.error('[admin/users/:id/detail]', err);
    res.status(500).json({ ok: false, message: 'Error obteniendo el detalle del usuario.' });
  }
});

// POST /api/admin/users/:id/claim -> intenta "tomar" al usuario antes de abrir el modal de Responder.
// Si otro admin ya lo tiene tomado (y el claim sigue vigente), devuelve 409 con el correo que lo tomó.
router.post('/users/:id/claim', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const myEmail = req.session.adminEmail;

    const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    }

    const existing = await pool.query(
      'SELECT claimed_by, claimed_at FROM admin_tickets WHERE user_id = $1',
      [id]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (row.claimed_by && row.claimed_by !== myEmail && isClaimActive(row.claimed_at)) {
        return res.status(409).json({
          ok: false,
          taken: true,
          claimedBy: row.claimed_by,
          message: 'Este usuario ya fue tomado por ' + row.claimed_by + '. Elige a otro usuario.',
        });
      }
    }

    await pool.query(
      `INSERT INTO admin_tickets (user_id, claimed_by, claimed_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         claimed_by = EXCLUDED.claimed_by,
         claimed_at = NOW()`,
      [id, myEmail]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/users/:id/claim]', err);
    res.status(500).json({ ok: false, message: 'Error al tomar al usuario.' });
  }
});

// POST /api/admin/users/:id/release -> suelta al usuario (al cancelar/cerrar el modal, o tras responder).
// Solo libera si el que lo pide es quien lo tomó, para no pisar el claim de otro admin por una carrera de clics.
router.post('/users/:id/release', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const myEmail = req.session.adminEmail;
    await pool.query(
      `UPDATE admin_tickets SET claimed_by = NULL, claimed_at = NULL
       WHERE user_id = $1 AND claimed_by = $2`,
      [id, myEmail]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/users/:id/release]', err);
    res.status(500).json({ ok: false, message: 'Error al soltar al usuario.' });
  }
});

// POST /api/admin/users/:id/respond
// body: { message, orderStatus: 'procesando'|'pagado'|'pendiente_pago', paymentMethodKey?, amount? }
router.post('/users/:id/respond', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { message, orderStatus, paymentMethodKey, amount } = req.body;

    if (!orderStatus || !ORDER_STATUSES.includes(orderStatus)) {
      return res.status(400).json({ ok: false, message: 'Selecciona un estado de pedido válido.' });
    }

    const userResult = await pool.query(
      'SELECT id, first_name, last_name, email FROM users WHERE id = $1',
      [id]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    }
    const customer = userResult.rows[0];

    let paymentInfo = null;
    let paymentMethodLabel = null;
    let paymentAmount = null;

    if (orderStatus === 'pendiente_pago') {
      if (!paymentMethodKey || !REQUESTABLE_METHODS.includes(paymentMethodKey)) {
        return res.status(400).json({ ok: false, message: 'Selecciona un medio de pago válido para solicitar el cobro.' });
      }
      const account = await getPaymentAccount(paymentMethodKey);
      if (!account) {
        return res.status(400).json({ ok: false, message: 'No hay una cuenta configurada para ese medio de pago.' });
      }
      if (amount === undefined || amount === null || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({ ok: false, message: 'Indica un monto válido a cobrar.' });
      }
      paymentAmount = Number(amount);
      paymentMethodLabel = account.label;
      paymentInfo = { ...account, amount: paymentAmount };
    }

    // El nuevo estado del "semáforo" del botón Responder:
    //   pendiente_pago -> esperando (amarillo, esperando que el usuario pague)
    //   procesando / pagado -> respondido (verde, ya se le respondió)
    const newStatus = orderStatus === 'pendiente_pago' ? 'esperando' : 'respondido';

    await sendAdminResponseEmail({
      to: customer.email,
      customerName: customer.first_name,
      message: message || '',
      orderStatus,
      paymentInfo,
    });

    const upsertResult = await pool.query(
      `INSERT INTO admin_tickets (user_id, status, order_status, last_message, payment_method, payment_amount, claimed_by, claimed_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         status = EXCLUDED.status,
         order_status = EXCLUDED.order_status,
         last_message = EXCLUDED.last_message,
         payment_method = EXCLUDED.payment_method,
         payment_amount = EXCLUDED.payment_amount,
         claimed_by = NULL,
         claimed_at = NULL,
         updated_at = NOW()
       RETURNING *`,
      [id, newStatus, orderStatus, message || null, paymentMethodLabel, paymentAmount]
    );

    res.json({ ok: true, ticket: upsertResult.rows[0] });
  } catch (err) {
    console.error('[admin/users/:id/respond]', err);
    res.status(500).json({ ok: false, message: 'Error enviando la respuesta al usuario.' });
  }
});

// GET /api/admin/dashboard -> métricas agregadas para el panel "Dashboard"
// Una "venta confirmada" = un admin_ticket con order_status = 'pagado'.
// Se usa el pedido más reciente del usuario (misma lógica que /stats) como
// la orden asociada a esa venta, y se desglosan sus "items" (JSONB) para
// sacar libros más vendidos / categorías más vendidas cruzando con catalog_books.
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const [
      { rows: paidOrders },
      { rows: usersByMonth },
      { rows: catalogRows },
      { rows: totals },
    ] = await Promise.all([
      // Todas las "ventas confirmadas" (pedido con estado pagado), con su fecha,
      // total, monto solicitado por el admin (si aplica) e items comprados.
      pool.query(`
        SELECT
          t.user_id,
          t.updated_at AS confirmed_at,
          o.id AS order_id,
          o.invoice_number,
          o.total AS order_total,
          o.items AS order_items,
          o.payment_method,
          t.payment_amount AS ticket_amount,
          u.first_name, u.last_name, u.email
        FROM admin_tickets t
        JOIN users u ON u.id = t.user_id
        LEFT JOIN LATERAL (
          SELECT * FROM orders WHERE orders.user_id = t.user_id ORDER BY created_at DESC LIMIT 1
        ) o ON TRUE
        WHERE t.order_status = 'pagado'
        ORDER BY t.updated_at DESC
      `),
      // Usuarios registrados, para el histórico de registros por mes/año.
      pool.query(`SELECT id, first_name, last_name, email, created_at FROM users ORDER BY created_at ASC`),
      // Catálogo completo (para "libros subidos por mes/año" y cruce de tags/categoría).
      pool.query(`SELECT id, title, category, tags, is_active, created_at FROM catalog_books ORDER BY created_at ASC`),
      pool.query(`
        SELECT
          (SELECT COUNT(*)::int FROM users) AS total_users,
          (SELECT COUNT(*)::int FROM catalog_books) AS total_books,
          (SELECT COUNT(*)::int FROM catalog_books WHERE is_active) AS active_books,
          (SELECT COUNT(*)::int FROM catalog_books WHERE NOT is_active) AS inactive_books
      `),
    ]);

    // Cada "venta" real: usamos payment_amount si el admin lo indicó al marcar
    // "Pedido pagado" (viene del flujo pendiente_pago -> pagado), si no, el
    // total del último pedido (o.total) generado por el propio usuario.
    const sales = paidOrders.map((row) => {
      const amount = row.ticket_amount !== null && row.ticket_amount !== undefined
        ? Number(row.ticket_amount)
        : (row.order_total !== null ? Number(row.order_total) : 0);
      return {
        userId: row.user_id,
        customerName: [row.first_name, row.last_name].filter(Boolean).join(' '),
        email: row.email,
        confirmedAt: row.confirmed_at,
        invoiceNumber: row.invoice_number,
        amount,
        paymentMethod: row.payment_method,
        items: Array.isArray(row.order_items) ? row.order_items : [],
      };
    });

    const catalogById = new Map(catalogRows.map((b) => [b.id, b]));

    // ---- Ventas por día/mes (serie temporal) ----
    const salesByDay = {};
    const salesByMonth = {};
    let totalRevenue = 0;
    sales.forEach((s) => {
      const d = new Date(s.confirmedAt);
      const dayKey = d.toISOString().slice(0, 10); // YYYY-MM-DD
      const monthKey = d.toISOString().slice(0, 7); // YYYY-MM
      salesByDay[dayKey] = salesByDay[dayKey] || { date: dayKey, count: 0, revenue: 0 };
      salesByDay[dayKey].count += 1;
      salesByDay[dayKey].revenue += s.amount;
      salesByMonth[monthKey] = salesByMonth[monthKey] || { month: monthKey, count: 0, revenue: 0 };
      salesByMonth[monthKey].count += 1;
      salesByMonth[monthKey].revenue += s.amount;
      totalRevenue += s.amount;
    });

    // ---- Libros más vendidos y categorías/etiquetas más vendidas ----
    // Cuando la orden no trae "items" desglosados (o el producto ya no existe
    // en catálogo), igual contamos la venta a nivel general.
    const bookSales = {}; // productId -> { title, qty, revenue }
    const categorySales = {}; // category -> { qty, revenue }
    const tagSales = {}; // tag -> { qty, revenue }

    sales.forEach((s) => {
      s.items.forEach((item) => {
        const qty = Number(item.quantity) || 0;
        const rev = Number(item.subtotal) || (Number(item.price) || 0) * qty;
        const key = item.productId != null ? String(item.productId) : ('name:' + item.name);
        bookSales[key] = bookSales[key] || { title: item.name || 'Libro eliminado', qty: 0, revenue: 0 };
        bookSales[key].qty += qty;
        bookSales[key].revenue += rev;

        const catalogBook = item.productId != null ? catalogById.get(Number(item.productId)) : null;
        const category = catalogBook && catalogBook.category ? catalogBook.category : 'Sin categoría';
        categorySales[category] = categorySales[category] || { qty: 0, revenue: 0 };
        categorySales[category].qty += qty;
        categorySales[category].revenue += rev;

        const tags = catalogBook && Array.isArray(catalogBook.tags) ? catalogBook.tags : [];
        tags.forEach((tag) => {
          tagSales[tag] = tagSales[tag] || { qty: 0, revenue: 0 };
          tagSales[tag].qty += qty;
          tagSales[tag].revenue += rev;
        });
      });
    });

    const topBooks = Object.values(bookSales).sort((a, b) => b.qty - a.qty).slice(0, 10);
    const topCategories = Object.entries(categorySales)
      .map(([category, v]) => ({ category, qty: v.qty, revenue: v.revenue }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);
    const topTags = Object.entries(tagSales)
      .map(([tag, v]) => ({ tag, qty: v.qty, revenue: v.revenue }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 12);

    // ---- Usuarios registrados por mes ----
    const usersByMonthMap = {};
    usersByMonth.forEach((u) => {
      const monthKey = new Date(u.created_at).toISOString().slice(0, 7);
      usersByMonthMap[monthKey] = (usersByMonthMap[monthKey] || 0) + 1;
    });

    // ---- Libros subidos al catálogo por mes ----
    const booksByMonthMap = {};
    catalogRows.forEach((b) => {
      const monthKey = new Date(b.created_at).toISOString().slice(0, 7);
      booksByMonthMap[monthKey] = (booksByMonthMap[monthKey] || 0) + 1;
    });

    // ---- Medios de pago usados en ventas confirmadas ----
    const paymentMethodCounts = {};
    sales.forEach((s) => {
      const label = s.paymentMethod || 'No especificado';
      paymentMethodCounts[label] = (paymentMethodCounts[label] || 0) + 1;
    });

    const last30 = sales.filter((s) => (Date.now() - new Date(s.confirmedAt).getTime()) < 30 * 24 * 60 * 60 * 1000);
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    const usersThisMonth = usersByMonthMap[currentMonthKey] || 0;
    const booksThisMonth = booksByMonthMap[currentMonthKey] || 0;

    res.json({
      ok: true,
      totals: {
        totalUsers: totals[0].total_users,
        totalBooks: totals[0].total_books,
        activeBooks: totals[0].active_books,
        inactiveBooks: totals[0].inactive_books,
        totalSales: sales.length,
        totalRevenue,
        salesLast30Days: last30.length,
        revenueLast30Days: last30.reduce((sum, s) => sum + s.amount, 0),
        usersThisMonth,
        booksThisMonth,
      },
      salesByDay: Object.values(salesByDay).sort((a, b) => a.date.localeCompare(b.date)),
      salesByMonth: Object.values(salesByMonth).sort((a, b) => a.month.localeCompare(b.month)),
      usersByMonth: Object.entries(usersByMonthMap).map(([month, count]) => ({ month, count })).sort((a, b) => a.month.localeCompare(b.month)),
      booksByMonth: Object.entries(booksByMonthMap).map(([month, count]) => ({ month, count })).sort((a, b) => a.month.localeCompare(b.month)),
      topBooks,
      topCategories,
      topTags,
      paymentMethods: Object.entries(paymentMethodCounts).map(([method, count]) => ({ method, count })).sort((a, b) => b.count - a.count),
      recentSales: sales.slice(0, 15),
    });
  } catch (err) {
    console.error('[admin/dashboard]', err);
    res.status(500).json({ ok: false, message: 'Error obteniendo el dashboard.' });
  }
});

// ---------- Configuración editable de cuentas de pago (Yape/Plin/BCP/BBVA) ----------

// GET /api/admin/payment-accounts -> lista los 4 medios con sus datos actuales
router.get('/payment-accounts', requireAdmin, async (req, res) => {
  try {
    const accounts = await getAllPaymentAccounts();
    res.json({ ok: true, accounts });
  } catch (err) {
    console.error('[admin/payment-accounts/get]', err);
    res.status(500).json({ ok: false, message: 'Error obteniendo las cuentas de pago.' });
  }
});

// PUT /api/admin/payment-accounts/:key  body: { handle, cci?, holder }
router.put('/payment-accounts/:key', requireAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const { handle, cci, holder } = req.body;

    if (!REQUESTABLE_METHODS.includes(key)) {
      return res.status(400).json({ ok: false, message: 'Medio de pago inválido.' });
    }

    const account = await updatePaymentAccount(key, { handle, cci, holder });
    res.json({ ok: true, account });
  } catch (err) {
    console.error('[admin/payment-accounts/put]', err);
    res.status(400).json({ ok: false, message: err.message || 'Error actualizando la cuenta de pago.' });
  }
});

module.exports = router;
