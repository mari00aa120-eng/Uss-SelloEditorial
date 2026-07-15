// Conexión a la base de datos PostgreSQL alojada en Neon.
// Neon requiere SSL, por eso forzamos { rejectUnauthorized: false }.
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('[DB] Falta la variable de entorno DATABASE_URL. Revisa tu archivo .env');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[DB] Error inesperado en el pool de PostgreSQL:', err.message);
});

module.exports = pool;
