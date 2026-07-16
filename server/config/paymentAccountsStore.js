// Lee y actualiza las cuentas de pago de la institución (Yape, Plin, BCP,
// BBVA) desde la base de datos, para que el admin pueda editarlas desde el
// panel sin tocar código. server/config/paymentAccounts.js solo se usa como
// valor por defecto para la siembra inicial (ver migrate.js).

const pool = require('./db');
const { PAYMENT_ACCOUNTS: DEFAULTS, REQUESTABLE_METHODS } = require('./paymentAccounts');

async function getAllPaymentAccounts() {
  const { rows } = await pool.query(
    'SELECT key, label, handle, cci, holder, updated_at FROM payment_accounts'
  );
  const byKey = {};
  rows.forEach((r) => {
    byKey[r.key] = r;
  });

  // Si por alguna razón la tabla está vacía (p. ej. migración no corrió
  // todavía), igual devolvemos los 4 métodos con los valores por defecto
  // para que el panel no se rompa.
  return REQUESTABLE_METHODS.map((key) => {
    const row = byKey[key];
    const def = DEFAULTS[key];
    return {
      key,
      label: (row && row.label) || def.label,
      handle: (row && row.handle) || def.handle,
      cci: row ? row.cci : def.cci || null,
      holder: (row && row.holder) || def.holder,
      updatedAt: row ? row.updated_at : null,
    };
  });
}

async function getPaymentAccount(key) {
  const all = await getAllPaymentAccounts();
  return all.find((a) => a.key === key) || null;
}

async function updatePaymentAccount(key, { handle, cci, holder }) {
  if (!REQUESTABLE_METHODS.includes(key)) {
    throw new Error('Medio de pago inválido: ' + key);
  }
  if (!handle || !handle.trim()) {
    throw new Error('El número/@ es obligatorio.');
  }
  if (!holder || !holder.trim()) {
    throw new Error('El titular es obligatorio.');
  }

  const def = DEFAULTS[key];
  await pool.query(
    `INSERT INTO payment_accounts (key, label, handle, cci, holder, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (key) DO UPDATE SET
       handle = EXCLUDED.handle,
       cci = EXCLUDED.cci,
       holder = EXCLUDED.holder,
       updated_at = NOW()`,
    [key, def.label, handle.trim(), cci ? cci.trim() : null, holder.trim()]
  );

  return getPaymentAccount(key);
}

module.exports = { getAllPaymentAccounts, getPaymentAccount, updatePaymentAccount, REQUESTABLE_METHODS };
