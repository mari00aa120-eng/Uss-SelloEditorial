const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const pool = require('../config/db');
const { requireCatalogAdmin } = require('../middleware/auth');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------
// Subida de portadas (imagen) desde el explorador de archivos del admin
// ---------------------------------------------------------------------
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'assets', 'catalog');
const ALLOWED_IMAGE_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/svg+xml': '.svg',
};

const imageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const ext = ALLOWED_IMAGE_MIME[file.mimetype] || path.extname(file.originalname || '').toLowerCase();
    const unique = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
    cb(null, 'libro-' + unique + ext);
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

// POST /api/catalog/admin/upload-image { image: <archivo> } -> sube portada desde el computador
// Acepta PNG, JPG/JPEG o SVG (máx. 5 MB). Devuelve la URL pública ya lista para guardar el libro.
router.post('/admin/upload-image', requireCatalogAdmin, function (req, res) {
  uploadImage.single('image')(req, res, function (err) {
    if (err) {
      if (err.message === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ ok: false, message: 'Formato no permitido. Sube una imagen PNG, JPG o SVG.' });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ ok: false, message: 'La imagen es demasiado pesada. Máximo 5 MB.' });
      }
      console.error('[catalog/admin/upload-image]', err);
      return res.status(500).json({ ok: false, message: 'Error subiendo la imagen.' });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, message: 'No se recibió ningún archivo.' });
    }
    const url = '/assets/catalog/' + req.file.filename;
    res.json({ ok: true, url: url });
  });
});

// Correos autorizados a usar el panel de actualización de catálogo.
// NO es la misma autorización que /admin: aquí solo se permite crear
// contraseña y entrar si el correo ya existe (sembrado) en catalog_admins.
function getAuthorizedCatalogEmails() {
  return (process.env.CATALOG_ADMIN_EMAILS || 'isabellacastrocamacho117@outlook.com')
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

// ---------------------------------------------------------------------
// Autenticación del panel de catálogo (correo + contraseña propios)
// ---------------------------------------------------------------------

// GET /api/catalog/auth/status?email=... -> saber si ese correo ya tiene
// contraseña creada (para mostrar "Crear contraseña" o "Iniciar sesión").
router.get('/auth/status', authLimiter, async (req, res) => {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ ok: false, message: 'Correo inválido.' });
    }
    const authorized = getAuthorizedCatalogEmails();
    if (!authorized.includes(email)) {
      return res.status(403).json({ ok: false, message: 'Este correo no está autorizado para el panel de catálogo.' });
    }
    const { rows } = await pool.query('SELECT password_hash FROM catalog_admins WHERE email = $1', [email]);
    const hasPassword = rows.length > 0 && !!rows[0].password_hash;
    res.json({ ok: true, hasPassword });
  } catch (err) {
    console.error('[catalog/auth/status]', err);
    res.status(500).json({ ok: false, message: 'Error verificando el correo.' });
  }
});

// POST /api/catalog/auth/create-password { email, password }
// Solo permitido si el correo está autorizado y todavía no tiene contraseña.
router.post('/auth/create-password', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ ok: false, message: 'Correo inválido.' });
    }
    const authorized = getAuthorizedCatalogEmails();
    if (!authorized.includes(normalizedEmail)) {
      return res.status(403).json({ ok: false, message: 'Este correo no está autorizado para el panel de catálogo.' });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        ok: false,
        message: 'La contraseña debe tener 8+ caracteres, una mayúscula, un número y un símbolo.',
      });
    }

    const existing = await pool.query('SELECT id, password_hash FROM catalog_admins WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0 && existing.rows[0].password_hash) {
      return res.status(409).json({ ok: false, message: 'Este correo ya tiene una contraseña creada. Inicia sesión.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    if (existing.rows.length > 0) {
      await pool.query(
        'UPDATE catalog_admins SET password_hash = $1, updated_at = NOW() WHERE email = $2',
        [passwordHash, normalizedEmail]
      );
    } else {
      await pool.query(
        'INSERT INTO catalog_admins (email, password_hash) VALUES ($1, $2)',
        [normalizedEmail, passwordHash]
      );
    }

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ ok: false, message: 'Error creando la sesión.' });
      req.session.isCatalogAdmin = true;
      req.session.catalogAdminEmail = normalizedEmail;
      res.json({ ok: true, message: 'Contraseña creada. Acceso concedido.' });
    });
  } catch (err) {
    console.error('[catalog/auth/create-password]', err);
    res.status(500).json({ ok: false, message: 'Error creando la contraseña.' });
  }
});

// POST /api/catalog/auth/login { email, password }
router.post('/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ ok: false, message: 'Correo y contraseña son obligatorios.' });
    }
    const authorized = getAuthorizedCatalogEmails();
    if (!authorized.includes(normalizedEmail)) {
      return res.status(403).json({ ok: false, message: 'Este correo no está autorizado para el panel de catálogo.' });
    }

    const { rows } = await pool.query('SELECT password_hash FROM catalog_admins WHERE email = $1', [normalizedEmail]);
    if (rows.length === 0 || !rows[0].password_hash) {
      return res.status(404).json({ ok: false, message: 'Este correo todavía no tiene contraseña creada.' });
    }

    const matches = await bcrypt.compare(password, rows[0].password_hash);
    if (!matches) {
      return res.status(401).json({ ok: false, message: 'Contraseña incorrecta.' });
    }

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ ok: false, message: 'Error creando la sesión.' });
      req.session.isCatalogAdmin = true;
      req.session.catalogAdminEmail = normalizedEmail;
      res.json({ ok: true, message: 'Acceso concedido.' });
    });
  } catch (err) {
    console.error('[catalog/auth/login]', err);
    res.status(500).json({ ok: false, message: 'Error iniciando sesión.' });
  }
});

// GET /api/catalog/auth/session
router.get('/auth/session', (req, res) => {
  const isCatalogAdmin = Boolean(req.session && req.session.isCatalogAdmin);
  res.json({ ok: true, isCatalogAdmin, email: isCatalogAdmin ? req.session.catalogAdminEmail : null });
});

// POST /api/catalog/auth/logout
router.post('/auth/logout', (req, res) => {
  req.session.isCatalogAdmin = false;
  req.session.catalogAdminEmail = null;
  req.session.destroy(() => {
    res.clearCookie('uss.sid');
    res.json({ ok: true });
  });
});

// ---------------------------------------------------------------------
// CRUD de libros del catálogo
// ---------------------------------------------------------------------

function serializeBook(row) {
  return {
    id: row.id,
    title: row.title,
    authors: row.authors || [],
    imageUrl: row.image_url,
    price: row.price !== null ? Number(row.price) : null,
    hasDiscount: row.has_discount,
    discountPercent: row.discount_percent !== null ? Number(row.discount_percent) : null,
    reviewText: row.review_text,
    isbn: row.isbn,
    publisher: row.publisher,
    coverType: row.cover_type,
    sizeDimensions: row.size_dimensions,
    publicationYear: row.publication_year,
    pages: row.pages,
    edition: row.edition,
    category: row.category,
    tags: row.tags || [],
    language: row.language,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/catalog/books -> PÚBLICO, lo consume catalogo.html / descripcionLibro.html
// Solo devuelve libros activos, ordenados.
router.get('/books', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM catalog_books WHERE is_active = TRUE ORDER BY sort_order ASC, created_at DESC`
    );
    res.json({ ok: true, books: rows.map(serializeBook), total: rows.length });
  } catch (err) {
    console.error('[catalog/books/get]', err);
    res.status(500).json({ ok: false, message: 'Error obteniendo el catálogo.' });
  }
});

// GET /api/catalog/books/:id -> PÚBLICO, para descripcionLibro.html
router.get('/books/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM catalog_books WHERE id = $1 AND is_active = TRUE', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Libro no encontrado.' });
    }
    res.json({ ok: true, book: serializeBook(rows[0]) });
  } catch (err) {
    console.error('[catalog/books/:id/get]', err);
    res.status(500).json({ ok: false, message: 'Error obteniendo el libro.' });
  }
});

// ---------- A partir de aquí, todo requiere sesión del panel de catálogo ----------

// GET /api/catalog/admin/books -> lista TODOS los libros (activos e inactivos) para el panel
router.get('/admin/books', requireCatalogAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM catalog_books ORDER BY sort_order ASC, created_at DESC`);
    res.json({ ok: true, books: rows.map(serializeBook), total: rows.length });
  } catch (err) {
    console.error('[catalog/admin/books/get]', err);
    res.status(500).json({ ok: false, message: 'Error obteniendo los libros.' });
  }
});

function validateBookPayload(body) {
  const errors = [];
  const title = String(body.title || '').trim();
  if (!title) errors.push('El título es obligatorio.');

  let authors = body.authors;
  if (!Array.isArray(authors)) authors = [];
  authors = authors.map((a) => String(a || '').trim()).filter(Boolean);
  if (authors.length === 0) errors.push('Debes ingresar al menos un autor.');

  const price = Number(body.price);
  if (Number.isNaN(price) || price <= 0) errors.push('El precio debe ser un número mayor a 0.');

  const hasDiscount = Boolean(body.hasDiscount);
  let discountPercent = null;
  if (hasDiscount) {
    discountPercent = Number(body.discountPercent);
    if (Number.isNaN(discountPercent) || discountPercent <= 0 || discountPercent >= 100) {
      errors.push('El porcentaje de descuento debe estar entre 1 y 99.');
    }
  }

  let tags = body.tags;
  if (!Array.isArray(tags)) tags = [];
  tags = tags.map((t) => String(t || '').trim()).filter(Boolean);

  return {
    errors,
    data: {
      title,
      authors,
      imageUrl: body.imageUrl ? String(body.imageUrl).trim() : null,
      price,
      hasDiscount,
      discountPercent,
      reviewText: body.reviewText ? String(body.reviewText).trim() : null,
      isbn: body.isbn ? String(body.isbn).trim() : null,
      publisher: body.publisher ? String(body.publisher).trim() : null,
      coverType: body.coverType ? String(body.coverType).trim() : null,
      sizeDimensions: body.sizeDimensions ? String(body.sizeDimensions).trim() : null,
      publicationYear: body.publicationYear ? String(body.publicationYear).trim() : null,
      pages: body.pages ? String(body.pages).trim() : null,
      edition: body.edition ? String(body.edition).trim() : null,
      category: body.category ? String(body.category).trim() : null,
      tags,
      language: body.language ? String(body.language).trim() : null,
      isActive: body.isActive === undefined ? true : Boolean(body.isActive),
      sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
    },
  };
}

// POST /api/catalog/admin/books -> crear libro
router.post('/admin/books', requireCatalogAdmin, async (req, res) => {
  try {
    const { errors, data } = validateBookPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ ok: false, message: errors.join(' ') });
    }

    const result = await pool.query(
      `INSERT INTO catalog_books
        (title, authors, image_url, price, has_discount, discount_percent, review_text,
         isbn, publisher, cover_type, size_dimensions, publication_year, pages, edition,
         category, tags, language, is_active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        data.title,
        JSON.stringify(data.authors),
        data.imageUrl,
        data.price,
        data.hasDiscount,
        data.discountPercent,
        data.reviewText,
        data.isbn,
        data.publisher,
        data.coverType,
        data.sizeDimensions,
        data.publicationYear,
        data.pages,
        data.edition,
        data.category,
        JSON.stringify(data.tags),
        data.language,
        data.isActive,
        data.sortOrder,
      ]
    );

    res.status(201).json({ ok: true, book: serializeBook(result.rows[0]) });
  } catch (err) {
    console.error('[catalog/admin/books/post]', err);
    res.status(500).json({ ok: false, message: 'Error creando el libro.' });
  }
});

// PUT /api/catalog/admin/books/:id -> editar libro
router.put('/admin/books/:id', requireCatalogAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { errors, data } = validateBookPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ ok: false, message: errors.join(' ') });
    }

    const result = await pool.query(
      `UPDATE catalog_books SET
        title = $1, authors = $2, image_url = $3, price = $4, has_discount = $5,
        discount_percent = $6, review_text = $7, isbn = $8, publisher = $9, cover_type = $10,
        size_dimensions = $11, publication_year = $12, pages = $13, edition = $14,
        category = $15, tags = $16, language = $17, is_active = $18, sort_order = $19,
        updated_at = NOW()
       WHERE id = $20
       RETURNING *`,
      [
        data.title,
        JSON.stringify(data.authors),
        data.imageUrl,
        data.price,
        data.hasDiscount,
        data.discountPercent,
        data.reviewText,
        data.isbn,
        data.publisher,
        data.coverType,
        data.sizeDimensions,
        data.publicationYear,
        data.pages,
        data.edition,
        data.category,
        JSON.stringify(data.tags),
        data.language,
        data.isActive,
        data.sortOrder,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Libro no encontrado.' });
    }

    res.json({ ok: true, book: serializeBook(result.rows[0]) });
  } catch (err) {
    console.error('[catalog/admin/books/put]', err);
    res.status(500).json({ ok: false, message: 'Error actualizando el libro.' });
  }
});

// DELETE /api/catalog/admin/books/:id -> quitar libro del catálogo (borrado real)
router.delete('/admin/books/:id', requireCatalogAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM catalog_books WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Libro no encontrado.' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[catalog/admin/books/delete]', err);
    res.status(500).json({ ok: false, message: 'Error eliminando el libro.' });
  }
});

// PATCH /api/catalog/admin/books/:id/toggle -> activar/desactivar (quitar sin borrar)
router.patch('/admin/books/:id/toggle', requireCatalogAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE catalog_books SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Libro no encontrado.' });
    }
    res.json({ ok: true, book: serializeBook(result.rows[0]) });
  } catch (err) {
    console.error('[catalog/admin/books/toggle]', err);
    res.status(500).json({ ok: false, message: 'Error cambiando el estado del libro.' });
  }
});

module.exports = router;
