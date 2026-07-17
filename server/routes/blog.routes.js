const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const pool = require('../config/db');
const { requireBlogAdmin } = require('../middleware/auth');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------
// Subida de imágenes (testimonio / fotos de autores) desde el explorador
// de archivos del panel de blog.
// ---------------------------------------------------------------------
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'assets', 'blog');
const ALLOWED_IMAGE_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
};

const imageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const ext = ALLOWED_IMAGE_MIME[file.mimetype] || path.extname(file.originalname || '').toLowerCase();
    const unique = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
    cb(null, 'blog-' + unique + ext);
  },
});

const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: function (req, file, cb) {
    if (!ALLOWED_IMAGE_MIME[file.mimetype]) {
      return cb(new Error('INVALID_FILE_TYPE'));
    }
    cb(null, true);
  },
});

// POST /api/blog/admin/upload-image { image: <archivo> } -> sube imagen (testimonio o foto de autor)
router.post('/admin/upload-image', requireBlogAdmin, function (req, res) {
  uploadImage.single('image')(req, res, function (err) {
    if (err) {
      if (err.message === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ ok: false, message: 'Formato no permitido. Sube una imagen PNG, JPG, WEBP o SVG.' });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ ok: false, message: 'La imagen es demasiado pesada. Máximo 5 MB.' });
      }
      console.error('[blog/admin/upload-image]', err);
      return res.status(500).json({ ok: false, message: 'Error subiendo la imagen.' });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, message: 'No se recibió ningún archivo.' });
    }
    const url = '/assets/blog/' + req.file.filename;
    res.json({ ok: true, url: url });
  });
});

// Correos autorizados a usar el panel de blog.
function getAuthorizedBlogEmails() {
  return (process.env.BLOG_ADMIN_EMAILS || 'isabellacastrocamacho117@outlook.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isStrongPassword(password) {
  return (
    typeof password === 'string' &&
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
});

const publicLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
});

// ---------------------------------------------------------------------
// Autenticación del panel de blog (correo + contraseña propios)
// ---------------------------------------------------------------------

router.get('/auth/status', authLimiter, async (req, res) => {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ ok: false, message: 'Correo inválido.' });
    }
    const authorized = getAuthorizedBlogEmails();
    if (!authorized.includes(email)) {
      return res.status(403).json({ ok: false, message: 'Este correo no está autorizado para el panel de blog.' });
    }
    const { rows } = await pool.query('SELECT password_hash FROM blog_admins WHERE email = $1', [email]);
    const hasPassword = rows.length > 0 && !!rows[0].password_hash;
    res.json({ ok: true, hasPassword });
  } catch (err) {
    console.error('[blog/auth/status]', err);
    res.status(500).json({ ok: false, message: 'Error verificando el correo.' });
  }
});

router.post('/auth/create-password', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ ok: false, message: 'Correo inválido.' });
    }
    const authorized = getAuthorizedBlogEmails();
    if (!authorized.includes(normalizedEmail)) {
      return res.status(403).json({ ok: false, message: 'Este correo no está autorizado para el panel de blog.' });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        ok: false,
        message: 'La contraseña debe tener 8+ caracteres, una mayúscula, un número y un símbolo.',
      });
    }

    const existing = await pool.query('SELECT id, password_hash FROM blog_admins WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0 && existing.rows[0].password_hash) {
      return res.status(409).json({ ok: false, message: 'Este correo ya tiene una contraseña creada. Inicia sesión.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    if (existing.rows.length > 0) {
      await pool.query(
        'UPDATE blog_admins SET password_hash = $1, updated_at = NOW() WHERE email = $2',
        [passwordHash, normalizedEmail]
      );
    } else {
      await pool.query(
        'INSERT INTO blog_admins (email, password_hash) VALUES ($1, $2)',
        [normalizedEmail, passwordHash]
      );
    }

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ ok: false, message: 'Error creando la sesión.' });
      req.session.isBlogAdmin = true;
      req.session.blogAdminEmail = normalizedEmail;
      res.json({ ok: true, message: 'Contraseña creada. Acceso concedido.' });
    });
  } catch (err) {
    console.error('[blog/auth/create-password]', err);
    res.status(500).json({ ok: false, message: 'Error creando la contraseña.' });
  }
});

router.post('/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ ok: false, message: 'Correo y contraseña son obligatorios.' });
    }
    const authorized = getAuthorizedBlogEmails();
    if (!authorized.includes(normalizedEmail)) {
      return res.status(403).json({ ok: false, message: 'Este correo no está autorizado para el panel de blog.' });
    }

    const { rows } = await pool.query('SELECT password_hash FROM blog_admins WHERE email = $1', [normalizedEmail]);
    if (rows.length === 0 || !rows[0].password_hash) {
      return res.status(404).json({ ok: false, message: 'Este correo todavía no tiene contraseña creada.' });
    }

    const matches = await bcrypt.compare(password, rows[0].password_hash);
    if (!matches) {
      return res.status(401).json({ ok: false, message: 'Contraseña incorrecta.' });
    }

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ ok: false, message: 'Error creando la sesión.' });
      req.session.isBlogAdmin = true;
      req.session.blogAdminEmail = normalizedEmail;
      res.json({ ok: true, message: 'Acceso concedido.' });
    });
  } catch (err) {
    console.error('[blog/auth/login]', err);
    res.status(500).json({ ok: false, message: 'Error iniciando sesión.' });
  }
});

router.get('/auth/session', (req, res) => {
  const isBlogAdmin = Boolean(req.session && req.session.isBlogAdmin);
  res.json({ ok: true, isBlogAdmin, email: isBlogAdmin ? req.session.blogAdminEmail : null });
});

router.post('/auth/logout', (req, res) => {
  req.session.isBlogAdmin = false;
  req.session.blogAdminEmail = null;
  req.session.destroy(() => {
    res.clearCookie('uss.sid');
    res.json({ ok: true });
  });
});

// ---------------------------------------------------------------------
// CRUD de reseñas del blog
// ---------------------------------------------------------------------

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function formatFechaEtiqueta(dateValue) {
  const d = new Date(dateValue);
  return d.getDate() + ' ' + MESES[d.getMonth()] + ' ' + d.getFullYear();
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

function serializeReview(row, extra) {
  extra = extra || {};
  return {
    id: row.id,
    catalogBookId: row.catalog_book_id,
    bookTitle: row.book_title,
    bookAuthors: row.book_authors || [],
    slug: row.slug,
    category: row.category,
    reviewText: row.review_text,
    quoteText: row.quote_text,
    keywords: row.keywords,
    testimonialImageUrl: row.testimonial_image_url,
    authorName: row.author_name,
    authorInviteText: row.author_invite_text,
    authorsAbout: row.authors_about || [],
    country: row.country,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    dateLabel: formatFechaEtiqueta(row.created_at),
    avgRating: extra.avgRating || 0,
    ratingCount: extra.ratingCount || 0,
    commentCount: extra.commentCount || 0,
  };
}

async function attachStats(rows) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const { rows: ratingRows } = await pool.query(
    `SELECT review_id, AVG(value)::float AS avg, COUNT(*)::int AS count
     FROM blog_review_ratings WHERE review_id = ANY($1) GROUP BY review_id`,
    [ids]
  );
  const { rows: commentRows } = await pool.query(
    `SELECT review_id, COUNT(*)::int AS count
     FROM blog_review_comments WHERE review_id = ANY($1) GROUP BY review_id`,
    [ids]
  );
  const ratingMap = {};
  ratingRows.forEach((r) => { ratingMap[r.review_id] = { avg: r.avg, count: r.count }; });
  const commentMap = {};
  commentRows.forEach((r) => { commentMap[r.review_id] = r.count; });

  return rows.map((row) =>
    serializeReview(row, {
      avgRating: ratingMap[row.id] ? Number(ratingMap[row.id].avg.toFixed(2)) : 0,
      ratingCount: ratingMap[row.id] ? ratingMap[row.id].count : 0,
      commentCount: commentMap[row.id] || 0,
    })
  );
}

// GET /api/blog/reviews -> PÚBLICO, lista paginada para Blog.html (9 por página, más recientes primero)
router.get('/reviews', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = 9;
    const offset = (page - 1) * pageSize;

    const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS total FROM blog_reviews WHERE is_active = TRUE');
    const total = countRows[0].total;

    const { rows } = await pool.query(
      `SELECT * FROM blog_reviews WHERE is_active = TRUE ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );
    const reviews = await attachStats(rows);
    res.json({ ok: true, reviews, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
  } catch (err) {
    console.error('[blog/reviews/get]', err);
    res.status(500).json({ ok: false, message: 'Error obteniendo las reseñas.' });
  }
});

// GET /api/blog/reviews/latest?limit=4 -> PÚBLICO, para el carrusel de Blog.html y recomendaciones
router.get('/reviews/latest', async (req, res) => {
  try {
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 4));
    const { rows } = await pool.query(
      `SELECT * FROM blog_reviews WHERE is_active = TRUE ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    const reviews = await attachStats(rows);
    res.json({ ok: true, reviews });
  } catch (err) {
    console.error('[blog/reviews/latest]', err);
    res.status(500).json({ ok: false, message: 'Error obteniendo las reseñas recientes.' });
  }
});

// GET /api/blog/reviews/random?limit=3&exclude=ID -> PÚBLICO, para "Recomendaciones" dentro de resena.html
router.get('/reviews/random', async (req, res) => {
  try {
    const limit = Math.min(10, Math.max(1, parseInt(req.query.limit, 10) || 3));
    const exclude = parseInt(req.query.exclude, 10) || 0;
    const { rows } = await pool.query(
      `SELECT * FROM blog_reviews WHERE is_active = TRUE AND id != $1 ORDER BY RANDOM() LIMIT $2`,
      [exclude, limit]
    );
    const reviews = await attachStats(rows);
    res.json({ ok: true, reviews });
  } catch (err) {
    console.error('[blog/reviews/random]', err);
    res.status(500).json({ ok: false, message: 'Error obteniendo recomendaciones.' });
  }
});

// GET /api/blog/reviews/:id -> PÚBLICO, para resena.html
router.get('/reviews/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM blog_reviews WHERE id = $1 AND is_active = TRUE', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Reseña no encontrada.' });
    }
    const [review] = await attachStats(rows);
    res.json({ ok: true, review });
  } catch (err) {
    console.error('[blog/reviews/:id/get]', err);
    res.status(500).json({ ok: false, message: 'Error obteniendo la reseña.' });
  }
});

// ---------- A partir de aquí, todo requiere sesión del panel de blog ----------

// GET /api/blog/admin/reviews -> lista TODAS las reseñas (activas e inactivas) para el panel
router.get('/admin/reviews', requireBlogAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM blog_reviews ORDER BY created_at DESC`);
    const reviews = await attachStats(rows);
    res.json({ ok: true, reviews, total: reviews.length });
  } catch (err) {
    console.error('[blog/admin/reviews/get]', err);
    res.status(500).json({ ok: false, message: 'Error obteniendo las reseñas.' });
  }
});

function validateReviewPayload(body) {
  const errors = [];
  const bookTitle = String(body.bookTitle || '').trim();
  if (!bookTitle) errors.push('El título del libro es obligatorio.');

  let bookAuthors = body.bookAuthors;
  if (!Array.isArray(bookAuthors)) bookAuthors = [];
  bookAuthors = bookAuthors.map((a) => String(a || '').trim()).filter(Boolean);
  if (bookAuthors.length === 0) errors.push('Debes ingresar al menos un autor.');

  let authorsAbout = body.authorsAbout;
  if (!Array.isArray(authorsAbout)) authorsAbout = [];
  authorsAbout = authorsAbout
    .map((a) => ({
      name: String((a && a.name) || '').trim(),
      description: String((a && a.description) || '').trim(),
      imageUrl: a && a.imageUrl ? String(a.imageUrl).trim() : null,
    }))
    .filter((a) => a.name || a.description);

  return {
    errors,
    data: {
      catalogBookId: body.catalogBookId ? Number(body.catalogBookId) : null,
      bookTitle,
      bookAuthors,
      category: body.category ? String(body.category).trim() : null,
      reviewText: body.reviewText ? String(body.reviewText).trim() : null,
      quoteText: body.quoteText ? String(body.quoteText).trim() : null,
      keywords: body.keywords ? String(body.keywords).trim() : null,
      testimonialImageUrl: body.testimonialImageUrl ? String(body.testimonialImageUrl).trim() : null,
      authorName: body.authorName ? String(body.authorName).trim() : (bookAuthors[0] || null),
      authorInviteText: body.authorInviteText ? String(body.authorInviteText).trim() : null,
      authorsAbout,
      country: body.country ? String(body.country).trim() : 'Perú',
      isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    },
  };
}

// POST /api/blog/admin/reviews -> crear reseña
router.post('/admin/reviews', requireBlogAdmin, async (req, res) => {
  try {
    const { errors, data } = validateReviewPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ ok: false, message: errors.join(' ') });
    }

    const slugBase = slugify(data.bookTitle) || 'resena';
    const slug = slugBase + '-' + crypto.randomBytes(3).toString('hex');

    const result = await pool.query(
      `INSERT INTO blog_reviews
        (catalog_book_id, book_title, book_authors, slug, category, review_text, quote_text,
         keywords, testimonial_image_url, author_name, author_invite_text, authors_about, country, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        data.catalogBookId,
        data.bookTitle,
        JSON.stringify(data.bookAuthors),
        slug,
        data.category,
        data.reviewText,
        data.quoteText,
        data.keywords,
        data.testimonialImageUrl,
        data.authorName,
        data.authorInviteText,
        JSON.stringify(data.authorsAbout),
        data.country,
        data.isActive,
      ]
    );

    res.status(201).json({ ok: true, review: serializeReview(result.rows[0]) });
  } catch (err) {
    console.error('[blog/admin/reviews/post]', err);
    res.status(500).json({ ok: false, message: 'Error creando la reseña.' });
  }
});

// PUT /api/blog/admin/reviews/:id -> editar reseña
router.put('/admin/reviews/:id', requireBlogAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { errors, data } = validateReviewPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ ok: false, message: errors.join(' ') });
    }

    const result = await pool.query(
      `UPDATE blog_reviews SET
        catalog_book_id = $1, book_title = $2, book_authors = $3, category = $4, review_text = $5,
        quote_text = $6, keywords = $7, testimonial_image_url = $8, author_name = $9,
        author_invite_text = $10, authors_about = $11, country = $12, is_active = $13, updated_at = NOW()
       WHERE id = $14
       RETURNING *`,
      [
        data.catalogBookId,
        data.bookTitle,
        JSON.stringify(data.bookAuthors),
        data.category,
        data.reviewText,
        data.quoteText,
        data.keywords,
        data.testimonialImageUrl,
        data.authorName,
        data.authorInviteText,
        JSON.stringify(data.authorsAbout),
        data.country,
        data.isActive,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Reseña no encontrada.' });
    }

    res.json({ ok: true, review: serializeReview(result.rows[0]) });
  } catch (err) {
    console.error('[blog/admin/reviews/put]', err);
    res.status(500).json({ ok: false, message: 'Error actualizando la reseña.' });
  }
});

// DELETE /api/blog/admin/reviews/:id
router.delete('/admin/reviews/:id', requireBlogAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM blog_reviews WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Reseña no encontrada.' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[blog/admin/reviews/delete]', err);
    res.status(500).json({ ok: false, message: 'Error eliminando la reseña.' });
  }
});

// PATCH /api/blog/admin/reviews/:id/toggle -> activar/desactivar
router.patch('/admin/reviews/:id/toggle', requireBlogAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE blog_reviews SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Reseña no encontrada.' });
    }
    res.json({ ok: true, review: serializeReview(result.rows[0]) });
  } catch (err) {
    console.error('[blog/admin/reviews/toggle]', err);
    res.status(500).json({ ok: false, message: 'Error cambiando el estado de la reseña.' });
  }
});

// ---------------------------------------------------------------------
// Comentarios y calificaciones (PÚBLICO: cualquier visitante, con o sin sesión)
// ---------------------------------------------------------------------

function serializeComment(row) {
  return {
    id: row.id,
    reviewId: row.review_id,
    parentId: row.parent_id,
    name: row.name,
    text: row.text,
    createdAt: row.created_at,
    dateLabel: formatFechaEtiqueta(row.created_at),
    avgRating: row.avg_rating ? Number(Number(row.avg_rating).toFixed(2)) : 0,
    ratingCount: row.rating_count ? Number(row.rating_count) : 0,
  };
}

// GET /api/blog/reviews/:id/comments -> PÚBLICO, árbol de comentarios + respuestas
router.get('/reviews/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT c.*,
              COALESCE(r.avg, 0) AS avg_rating,
              COALESCE(r.count, 0) AS rating_count
       FROM blog_review_comments c
       LEFT JOIN (
         SELECT comment_id, AVG(value) AS avg, COUNT(*) AS count
         FROM blog_comment_ratings GROUP BY comment_id
       ) r ON r.comment_id = c.id
       WHERE c.review_id = $1
       ORDER BY c.created_at ASC`,
      [id]
    );

    const byId = {};
    rows.forEach((row) => { byId[row.id] = Object.assign(serializeComment(row), { replies: [] }); });
    const top = [];
    rows.forEach((row) => {
      const node = byId[row.id];
      if (row.parent_id && byId[row.parent_id]) {
        byId[row.parent_id].replies.push(node);
      } else {
        top.push(node);
      }
    });
    top.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ ok: true, comments: top });
  } catch (err) {
    console.error('[blog/reviews/:id/comments/get]', err);
    res.status(500).json({ ok: false, message: 'Error obteniendo los comentarios.' });
  }
});

// POST /api/blog/reviews/:id/comments -> PÚBLICO, publicar comentario o respuesta
router.post('/reviews/:id/comments', publicLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const name = String((req.body && req.body.name) || '').trim().slice(0, 120);
    const text = String((req.body && req.body.text) || '').trim().slice(0, 600);
    const parentId = req.body && req.body.parentId ? Number(req.body.parentId) : null;

    if (!name || !text) {
      return res.status(400).json({ ok: false, message: 'Nombre y comentario son obligatorios.' });
    }

    const review = await pool.query('SELECT id FROM blog_reviews WHERE id = $1', [id]);
    if (review.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Reseña no encontrada.' });
    }

    const result = await pool.query(
      `INSERT INTO blog_review_comments (review_id, parent_id, name, text) VALUES ($1,$2,$3,$4) RETURNING *`,
      [id, parentId, name, text]
    );

    res.status(201).json({ ok: true, comment: serializeComment(result.rows[0]) });
  } catch (err) {
    console.error('[blog/reviews/:id/comments/post]', err);
    res.status(500).json({ ok: false, message: 'Error publicando el comentario.' });
  }
});

// POST /api/blog/reviews/:id/rating -> PÚBLICO, calificar el libro con estrellas { voterKey, value }
router.post('/reviews/:id/rating', publicLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const voterKey = String((req.body && req.body.voterKey) || '').trim().slice(0, 100);
    const value = Number(req.body && req.body.value);

    if (!voterKey || !Number.isInteger(value) || value < 1 || value > 5) {
      return res.status(400).json({ ok: false, message: 'Calificación inválida.' });
    }

    await pool.query(
      `INSERT INTO blog_review_ratings (review_id, voter_key, value) VALUES ($1,$2,$3)
       ON CONFLICT (review_id, voter_key) DO UPDATE SET value = EXCLUDED.value`,
      [id, voterKey, value]
    );

    const { rows } = await pool.query(
      `SELECT AVG(value)::float AS avg, COUNT(*)::int AS count FROM blog_review_ratings WHERE review_id = $1`,
      [id]
    );

    res.json({ ok: true, avgRating: Number((rows[0].avg || 0).toFixed(2)), ratingCount: rows[0].count });
  } catch (err) {
    console.error('[blog/reviews/:id/rating/post]', err);
    res.status(500).json({ ok: false, message: 'Error guardando la calificación.' });
  }
});

// POST /api/blog/comments/:commentId/rating -> PÚBLICO, calificar un comentario { voterKey, value }
router.post('/comments/:commentId/rating', publicLimiter, async (req, res) => {
  try {
    const { commentId } = req.params;
    const voterKey = String((req.body && req.body.voterKey) || '').trim().slice(0, 100);
    const value = Number(req.body && req.body.value);

    if (!voterKey || !Number.isInteger(value) || value < 1 || value > 5) {
      return res.status(400).json({ ok: false, message: 'Calificación inválida.' });
    }

    await pool.query(
      `INSERT INTO blog_comment_ratings (comment_id, voter_key, value) VALUES ($1,$2,$3)
       ON CONFLICT (comment_id, voter_key) DO UPDATE SET value = EXCLUDED.value`,
      [commentId, voterKey, value]
    );

    const { rows } = await pool.query(
      `SELECT AVG(value)::float AS avg, COUNT(*)::int AS count FROM blog_comment_ratings WHERE comment_id = $1`,
      [commentId]
    );

    res.json({ ok: true, avgRating: Number((rows[0].avg || 0).toFixed(2)), ratingCount: rows[0].count });
  } catch (err) {
    console.error('[blog/comments/:commentId/rating/post]', err);
    res.status(500).json({ ok: false, message: 'Error guardando la calificación.' });
  }
});

module.exports = router;
