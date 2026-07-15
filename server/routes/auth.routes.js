const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const pool = require('../config/db');

const router = express.Router();

// Limita intentos de login para mitigar fuerza bruta.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isStrongPassword(password) {
  return (
    typeof password === 'string' &&
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ ok: false, message: 'Todos los campos son obligatorios.' });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ ok: false, message: 'Correo electrónico inválido.' });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        ok: false,
        message: 'La contraseña debe tener 8+ caracteres, una mayúscula, un número y un símbolo.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ ok: false, message: 'Ya existe una cuenta con ese correo.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, first_name, last_name, email`,
      [firstName.trim(), lastName.trim(), normalizedEmail, passwordHash]
    );

    const user = result.rows[0];

    // Regenerar sesión para prevenir session fixation.
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ ok: false, message: 'Error creando la sesión.' });
      req.session.userId = user.id;
      req.session.userEmail = user.email;
      return res.status(201).json({
        ok: true,
        user: { firstName: user.first_name, lastName: user.last_name, email: user.email },
      });
    });
  } catch (err) {
    console.error('[auth/register]', err);
    res.status(500).json({ ok: false, message: 'Error del servidor al registrar la cuenta.' });
  }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ ok: false, message: 'Correo y contraseña son obligatorios.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const result = await pool.query(
      'SELECT id, first_name, last_name, email, password_hash FROM users WHERE email = $1',
      [normalizedEmail]
    );

    // Mensaje genérico para no revelar si el correo existe o no.
    const genericError = { ok: false, message: 'Correo o contraseña incorrectos.' };
    if (result.rows.length === 0) {
      return res.status(401).json(genericError);
    }

    const user = result.rows[0];
    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      return res.status(401).json(genericError);
    }

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ ok: false, message: 'Error creando la sesión.' });
      req.session.userId = user.id;
      req.session.userEmail = user.email;
      return res.json({
        ok: true,
        user: { firstName: user.first_name, lastName: user.last_name, email: user.email },
      });
    });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ ok: false, message: 'Error del servidor al iniciar sesión.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ ok: false, message: 'No se pudo cerrar sesión.' });
    res.clearCookie('uss.sid');
    res.json({ ok: true });
  });
});

// GET /api/auth/me  -> usado por el frontend para decidir qué mostrar en el navbar
router.get('/me', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.json({ ok: true, authenticated: false });
  }
  try {
    const result = await pool.query(
      'SELECT first_name, last_name, email FROM users WHERE id = $1',
      [req.session.userId]
    );
    if (result.rows.length === 0) {
      return res.json({ ok: true, authenticated: false });
    }
    const user = result.rows[0];
    res.json({
      ok: true,
      authenticated: true,
      user: { firstName: user.first_name, lastName: user.last_name, email: user.email },
    });
  } catch (err) {
    console.error('[auth/me]', err);
    res.status(500).json({ ok: false, message: 'Error del servidor.' });
  }
});

module.exports = router;
