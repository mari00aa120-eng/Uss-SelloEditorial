// Crea/actualiza automáticamente las tablas que el código necesita para
// funcionar, al arrancar el servidor. Así no dependemos de que alguien
// entre a mano al SQL Editor de Neon a correr el script de DATABASE.md
// (si se les olvida, el panel de admin se rompe con errores 500 raros).
// Todo usa "IF NOT EXISTS" / "ADD COLUMN IF NOT EXISTS", así que es
// seguro correrlo en cada arranque, incluso si las tablas ya existen.

const pool = require('./db');

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

  console.log('[migrate] Esquema verificado/actualizado correctamente.');
}

module.exports = { runMigrations };
