const crypto = require('crypto');

// Genera un código numérico de 6 dígitos (000000 - 999999) de forma criptográficamente segura.
function generateSixDigitCode() {
  const num = crypto.randomInt(0, 1000000);
  return num.toString().padStart(6, '0');
}

// Hashea el código antes de guardarlo en la base de datos (nunca se guarda en texto plano).
function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

module.exports = { generateSixDigitCode, hashCode };
