const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../config/db');
const { sendAdminCodeEmail } = require('../config/brevo');
const { generateSixDigitCode, hashCode } = require('../utils/codes');
const { requireAdmin } = require('../middleware/auth');

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
      pool.query(
        'SELECT first_name, last_name, email, created_at FROM users ORDER BY created_at DESC LIMIT 10'
      ),
    ]);

    res.json({
      ok: true,
      stats: {
        totalUsers: userCountRows[0].count,
        totalCartLines: cartCountRows[0].count,
        totalCartUnits: cartCountRows[0].units,
      },
      recentUsers: recentUsers.rows,
    });
  } catch (err) {
    console.error('[admin/stats]', err);
    res.status(500).json({ ok: false, message: 'Error obteniendo estadísticas.' });
  }
});

module.exports = router;
