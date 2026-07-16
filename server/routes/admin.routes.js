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
