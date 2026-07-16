// Crea/actualiza automáticamente las tablas que el código necesita para
// funcionar, al arrancar el servidor. Así no dependemos de que alguien
// entre a mano al SQL Editor de Neon a correr el script de DATABASE.md
// (si se les olvida, el panel de admin se rompe con errores 500 raros).
// Todo usa "IF NOT EXISTS" / "ADD COLUMN IF NOT EXISTS", así que es
// seguro correrlo en cada arranque, incluso si las tablas ya existen.

const pool = require('./db');
const { PAYMENT_ACCOUNTS: DEFAULT_ACCOUNTS, REQUESTABLE_METHODS } = require('./paymentAccounts');

async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_tickets (
        id               SERIAL PRIMARY KEY,
        user_id          INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        status           VARCHAR(20) NOT NULL DEFAULT 'pendiente',
        order_status     VARCHAR(30),
        last_message     TEXT,
        payment_method   VARCHAR(50),
        payment_amount   NUMERIC(10, 2),
        claimed_by       VARCHAR(255),
        claimed_at       TIMESTAMPTZ,
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Por si la tabla ya existía de antes de agregar el sistema de "tomado por".
  await pool.query(`ALTER TABLE admin_tickets ADD COLUMN IF NOT EXISTS claimed_by VARCHAR(255);`);
  await pool.query(`ALTER TABLE admin_tickets ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;`);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_admin_tickets_user ON admin_tickets (user_id);
  `);

  // Cuentas/números de pago de la institución (Yape, Plin, BCP, BBVA).
  // Editables desde el panel de admin -> "Configurar cuentas de pago".
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_accounts (
        key         VARCHAR(30) PRIMARY KEY,
        label       VARCHAR(100) NOT NULL,
        handle      VARCHAR(255) NOT NULL,
        cci         VARCHAR(255),
        holder      VARCHAR(255) NOT NULL,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Siembra los valores por defecto SOLO si la fila todavía no existe,
  // para no pisar ediciones que ya haya hecho el admin desde el panel.
  for (const key of REQUESTABLE_METHODS) {
    const def = DEFAULT_ACCOUNTS[key];
    await pool.query(
      `INSERT INTO payment_accounts (key, label, handle, cci, holder)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (key) DO NOTHING`,
      [key, def.label, def.handle, def.cci || null, def.holder]
    );
  }

  // ---------------------------------------------------------------------
  // Panel de catálogo (actualización de catalogo.html) - acceso separado
  // del panel de administración general (/admin). Solo correos incluidos
  // en CATALOG_ADMIN_EMAILS pueden crear su contraseña y entrar aquí.
  // ---------------------------------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_admins (
        id               SERIAL PRIMARY KEY,
        email            VARCHAR(255) NOT NULL UNIQUE,
        password_hash    VARCHAR(255),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_books (
        id                  SERIAL PRIMARY KEY,
        title               VARCHAR(500) NOT NULL,
        authors             JSONB NOT NULL DEFAULT '[]',
        image_url           TEXT,
        price               NUMERIC(10, 2) NOT NULL,
        has_discount        BOOLEAN NOT NULL DEFAULT FALSE,
        discount_percent    NUMERIC(5, 2),
        review_text         TEXT,
        isbn                VARCHAR(100),
        publisher           VARCHAR(255),
        cover_type          VARCHAR(50),
        size_dimensions     VARCHAR(100),
        publication_year    VARCHAR(20),
        pages               VARCHAR(20),
        edition             VARCHAR(100),
        category            VARCHAR(150),
        tags                JSONB NOT NULL DEFAULT '[]',
        language            VARCHAR(80),
        is_active           BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order          INTEGER NOT NULL DEFAULT 0,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_catalog_books_active ON catalog_books (is_active, sort_order);
  `);

  // Siembra el/los correo(s) autorizados para el panel de catálogo, sin
  // password_hash todavía (se crea la primera vez que el correo entra a
  // "Crear contraseña" en catalog-admin-login.html).
  const catalogAuthorizedEmails = (process.env.CATALOG_ADMIN_EMAILS || 'isabellacastrocamacho117@outlook.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  for (const email of catalogAuthorizedEmails) {
    await pool.query(
      `INSERT INTO catalog_admins (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`,
      [email]
    );
  }

  console.log('[migrate] Esquema verificado/actualizado correctamente.');
}

module.exports = { runMigrations };
