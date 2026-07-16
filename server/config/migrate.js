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
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

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

  console.log('[migrate] Esquema verificado/actualizado correctamente.');
}

module.exports = { runMigrations };
