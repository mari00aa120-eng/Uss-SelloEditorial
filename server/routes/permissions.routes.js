const express = require('express');
const pool = require('../config/db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function serializePermittedUser(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    canAdmin: row.can_admin,
    canCatalog: row.can_catalog,
    canBlog: row.can_blog,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Mantiene sincronizadas catalog_admins / blog_admins con lo que el panel
// de Permisos decida. Nunca borra la fila si ya tenía password_hash creado
// (para no perder la contraseña si luego se le vuelve a dar el permiso);
// simplemente se inserta si falta, y no se elimina si se le quita el
// permiso -- en su lugar, la comprobación de acceso vive en
// isEmailCatalogAuthorized / isEmailBlogAuthorized, que consultan
// permitted_users como fuente de la verdad para ENTRAR, no solo para tener
// contraseña. Por eso además reflejamos el estado quitando la fila de
// catalog_admins/blog_admins solo si el correo nunca creó contraseña ahí.
async function syncCatalogAccess(email, shouldHaveAccess) {
  if (shouldHaveAccess) {
    await pool.query(
      `INSERT INTO catalog_admins (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`,
      [email]
    );
  } else {
    await pool.query(
      `DELETE FROM catalog_admins WHERE email = $1 AND password_hash IS NULL`,
      [email]
    );
  }
}

async function syncBlogAccess(email, shouldHaveAccess) {
  if (shouldHaveAccess) {
    await pool.query(
      `INSERT INTO blog_admins (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`,
      [email]
    );
  } else {
    await pool.query(
      `DELETE FROM blog_admins WHERE email = $1 AND password_hash IS NULL`,
      [email]
    );
  }
}

// GET /api/permissions -> lista todos los correos con permisos y qué tienen
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM permitted_users ORDER BY created_at ASC`
    );
    res.json({ ok: true, users: rows.map(serializePermittedUser) });
  } catch (err) {
    console.error('[permissions/get]', err);
    res.status(500).json({ ok: false, message: 'Error obteniendo los permisos.' });
  }
});

// POST /api/permissions -> crear un nuevo correo con permisos
// body: { firstName, lastName, email, canAdmin, canCatalog, canBlog }
router.post('/', requireAdmin, async (req, res) => {
  try {
    const firstName = String((req.body && req.body.firstName) || '').trim();
    const lastName = String((req.body && req.body.lastName) || '').trim();
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    const canAdmin = Boolean(req.body && req.body.canAdmin);
    const canCatalog = Boolean(req.body && req.body.canCatalog);
    const canBlog = Boolean(req.body && req.body.canBlog);

    const errors = [];
    if (!firstName) errors.push('El nombre es obligatorio.');
    if (!lastName) errors.push('El apellido es obligatorio.');
    if (!email || !EMAIL_REGEX.test(email)) errors.push('Ingresa un correo electrónico válido.');
    if (!canAdmin && !canCatalog && !canBlog) errors.push('Selecciona al menos un tipo de permiso.');

    if (errors.length > 0) {
      return res.status(400).json({ ok: false, message: errors.join(' ') });
    }

    const existing = await pool.query('SELECT id FROM permitted_users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ ok: false, message: 'Ese correo ya tiene permisos asignados. Edítalo en vez de crear uno nuevo.' });
    }

    const result = await pool.query(
      `INSERT INTO permitted_users (first_name, last_name, email, can_admin, can_catalog, can_blog)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [firstName, lastName, email, canAdmin, canCatalog, canBlog]
    );

    await syncCatalogAccess(email, canCatalog);
    await syncBlogAccess(email, canBlog);

    res.status(201).json({ ok: true, user: serializePermittedUser(result.rows[0]) });
  } catch (err) {
    console.error('[permissions/post]', err);
    res.status(500).json({ ok: false, message: 'Error creando el permiso.' });
  }
});

// PUT /api/permissions/:id -> editar nombre/apellido/permisos de un correo existente
// (el correo en sí no se puede editar; para cambiarlo, elimina y crea uno nuevo)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const firstName = String((req.body && req.body.firstName) || '').trim();
    const lastName = String((req.body && req.body.lastName) || '').trim();
    const canAdmin = Boolean(req.body && req.body.canAdmin);
    const canCatalog = Boolean(req.body && req.body.canCatalog);
    const canBlog = Boolean(req.body && req.body.canBlog);

    const errors = [];
    if (!firstName) errors.push('El nombre es obligatorio.');
    if (!lastName) errors.push('El apellido es obligatorio.');
    if (!canAdmin && !canCatalog && !canBlog) errors.push('Selecciona al menos un tipo de permiso.');

    if (errors.length > 0) {
      return res.status(400).json({ ok: false, message: errors.join(' ') });
    }

    const existing = await pool.query('SELECT * FROM permitted_users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Este permiso no existe.' });
    }
    const email = existing.rows[0].email;

    const result = await pool.query(
      `UPDATE permitted_users SET
        first_name = $1, last_name = $2, can_admin = $3, can_catalog = $4, can_blog = $5, updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [firstName, lastName, canAdmin, canCatalog, canBlog, id]
    );

    await syncCatalogAccess(email, canCatalog);
    await syncBlogAccess(email, canBlog);

    res.json({ ok: true, user: serializePermittedUser(result.rows[0]) });
  } catch (err) {
    console.error('[permissions/put]', err);
    res.status(500).json({ ok: false, message: 'Error actualizando el permiso.' });
  }
});

// DELETE /api/permissions/:id -> revocar todos los accesos de un correo
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT email FROM permitted_users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Este permiso no existe.' });
    }
    const email = existing.rows[0].email;

    await pool.query('DELETE FROM permitted_users WHERE id = $1', [id]);
    await syncCatalogAccess(email, false);
    await syncBlogAccess(email, false);

    res.json({ ok: true });
  } catch (err) {
    console.error('[permissions/delete]', err);
    res.status(500).json({ ok: false, message: 'Error eliminando el permiso.' });
  }
});

module.exports = router;
