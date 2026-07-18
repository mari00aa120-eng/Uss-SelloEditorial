const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../config/db');
const { requireAdmin } = require('../middleware/auth');
const {
  sendContactConfirmationEmail,
  sendContactNotificationEmail,
  sendContactResponseEmail,
} = require('../config/brevo');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+\s()-]{6,20}$/;
const CONTACT_STATUSES = ['pendiente', 'respondido', 'resuelto'];

function getContactNotifyEmails() {
  return (process.env.CONTACT_NOTIFY_EMAILS || 'isabellacastrocamacho117@outlook.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function serializeMessage(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    subject: row.subject,
    message: row.message,
    status: row.status, // pendiente | respondido | resuelto
    responseText: row.response_text,
    respondedBy: row.responded_by,
    respondedAt: row.responded_at,
    createdAt: row.created_at,
  };
}

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Enviaste demasiados mensajes. Intenta de nuevo en unos minutos.' },
});

// ---------------------------------------------------------------------
// POST /api/contact -> PÚBLICO. Formulario "Envíanos un Mensaje" de QA.html
// ---------------------------------------------------------------------
router.post('/', submitLimiter, async (req, res) => {
  try {
    const name = String((req.body && req.body.name) || '').trim().slice(0, 200);
    const phone = String((req.body && req.body.phone) || '').trim().slice(0, 40);
    const email = String((req.body && req.body.email) || '').trim().toLowerCase().slice(0, 255);
    const subject = String((req.body && req.body.subject) || '').trim().slice(0, 300);
    const message = String((req.body && req.body.message) || '').trim();

    const errors = [];
    if (!name) errors.push('El nombre es obligatorio.');
    if (!phone || !PHONE_REGEX.test(phone)) errors.push('Ingresa un número de teléfono válido.');
    if (!email || !EMAIL_REGEX.test(email)) errors.push('Ingresa un correo electrónico válido.');
    if (!subject) errors.push('El asunto es obligatorio.');
    if (!message) errors.push('El mensaje es obligatorio.');

    if (errors.length > 0) {
      return res.status(400).json({ ok: false, message: errors.join(' ') });
    }

    const result = await pool.query(
      `INSERT INTO contact_messages (name, phone, email, subject, message, status)
       VALUES ($1, $2, $3, $4, $5, 'pendiente')
       RETURNING *`,
      [name, phone, email, subject, message]
    );
    const saved = result.rows[0];

    // Confirmación al visitante + notificación al equipo. Si Brevo falla,
    // el mensaje ya quedó guardado en la base de datos igual (no se pierde).
    try {
      await sendContactConfirmationEmail({ to: email, name, subject });
    } catch (mailErr) {
      console.error('[contact/confirmation-email]', mailErr);
    }

    const notifyEmails = getContactNotifyEmails();
    for (const notifyTo of notifyEmails) {
      try {
        await sendContactNotificationEmail({ to: notifyTo, name, phone, email, subject, message });
      } catch (mailErr) {
        console.error('[contact/notification-email]', mailErr);
      }
    }

    res.status(201).json({ ok: true, message: serializeMessage(saved) });
  } catch (err) {
    console.error('[contact/post]', err);
    res.status(500).json({ ok: false, message: 'Error enviando tu mensaje. Intenta nuevamente.' });
  }
});

// ---------------------------------------------------------------------
// A partir de aquí, todo requiere sesión de administrador (panel /admin
// -> "Actualizar Contacto", mismo login que "Usuarios y pedidos").
// ---------------------------------------------------------------------

// GET /api/contact/admin/messages -> lista para la tabla del panel
router.get('/admin/messages', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 200`
    );
    const { rows: countRows } = await pool.query(
      `SELECT status, COUNT(*)::int AS count FROM contact_messages GROUP BY status`
    );
    const counts = { pendiente: 0, respondido: 0, resuelto: 0 };
    countRows.forEach((r) => { counts[r.status] = r.count; });

    res.json({
      ok: true,
      messages: rows.map(serializeMessage),
      counts,
      total: rows.length,
    });
  } catch (err) {
    console.error('[contact/admin/messages/get]', err);
    res.status(500).json({ ok: false, message: 'Error obteniendo los mensajes de contacto.' });
  }
});

// GET /api/contact/admin/messages/:id -> detalle de un mensaje puntual
router.get('/admin/messages/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM contact_messages WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Mensaje no encontrado.' });
    }
    res.json({ ok: true, message: serializeMessage(rows[0]) });
  } catch (err) {
    console.error('[contact/admin/messages/:id/get]', err);
    res.status(500).json({ ok: false, message: 'Error obteniendo el mensaje.' });
  }
});

// POST /api/contact/admin/messages/:id/respond
// body: { responseText, status: 'respondido' | 'resuelto' }
// El remitente (De/Para) queda fijo: responde USS Sello Editorial -> el
// correo del visitante que llenó el formulario. Envía el correo real y
// actualiza el estado del mensaje en el panel.
router.post('/admin/messages/:id/respond', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { responseText, status } = req.body;
    const adminEmail = req.session.adminEmail;

    if (!responseText || !responseText.trim()) {
      return res.status(400).json({ ok: false, message: 'Escribe una respuesta antes de enviarla.' });
    }
    if (!status || !['respondido', 'resuelto'].includes(status)) {
      return res.status(400).json({ ok: false, message: 'Selecciona un estado válido: Respondido o Resuelto.' });
    }

    const existing = await pool.query('SELECT * FROM contact_messages WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Mensaje no encontrado.' });
    }
    const original = existing.rows[0];

    // Envía primero el correo; si Brevo falla, no marcamos el mensaje como respondido.
    await sendContactResponseEmail({
      to: original.email,
      name: original.name,
      subject: original.subject,
      originalMessage: original.message,
      responseText: responseText.trim(),
      status,
    });

    const result = await pool.query(
      `UPDATE contact_messages SET
         status = $1, response_text = $2, responded_by = $3, responded_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, responseText.trim(), adminEmail, id]
    );

    res.json({ ok: true, message: serializeMessage(result.rows[0]) });
  } catch (err) {
    console.error('[contact/admin/messages/:id/respond]', err);
    res.status(500).json({ ok: false, message: 'No se pudo enviar la respuesta. Intenta nuevamente.' });
  }
});

// PATCH /api/contact/admin/messages/:id/status -> cambiar estado sin reenviar correo
// (por ejemplo, marcar como "Resuelto" después de ya haber respondido).
router.patch('/admin/messages/:id/status', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !CONTACT_STATUSES.includes(status)) {
      return res.status(400).json({ ok: false, message: 'Estado inválido.' });
    }

    const result = await pool.query(
      `UPDATE contact_messages SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Mensaje no encontrado.' });
    }

    res.json({ ok: true, message: serializeMessage(result.rows[0]) });
  } catch (err) {
    console.error('[contact/admin/messages/:id/status]', err);
    res.status(500).json({ ok: false, message: 'Error actualizando el estado.' });
  }
});

module.exports = router;
