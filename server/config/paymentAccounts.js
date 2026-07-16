// Datos de las cuentas/números de la institución a los que el CLIENTE debe
// pagar cuando el admin marca un pedido como "Pendiente a pagar".
// Estos son los datos de USS Fondo Editorial (no del cliente).
//
// IMPORTANTE: reemplaza los valores de ejemplo por los reales antes de
// producción. Puedes editarlos aquí directamente o, si prefieres no tocar
// código, muévelos a variables de entorno (PAYMENT_YAPE_NUMBER, etc.) y
// léelas con process.env.

const PAYMENT_ACCOUNTS = {
  yape: {
    label: 'Yape',
    handle: process.env.PAYMENT_YAPE_NUMBER || '+51 999 999 999',
    holder: process.env.PAYMENT_YAPE_HOLDER || 'USS Fondo Editorial',
  },
  plin: {
    label: 'Plin',
    handle: process.env.PAYMENT_PLIN_NUMBER || '+51 999 999 999',
    holder: process.env.PAYMENT_PLIN_HOLDER || 'USS Fondo Editorial',
  },
  bcp: {
    label: 'BCP - Cuenta corriente',
    handle: process.env.PAYMENT_BCP_ACCOUNT || '193-XXXXXXX-0-XX',
    cci: process.env.PAYMENT_BCP_CCI || '002-193-XXXXXXXXXXXX-XX',
    holder: process.env.PAYMENT_BCP_HOLDER || 'Universidad Señor de Sipán S.A.C.',
  },
  bbva: {
    label: 'BBVA - Cuenta corriente',
    handle: process.env.PAYMENT_BBVA_ACCOUNT || '0011-XXXX-XXXXXXXXXXXX',
    cci: process.env.PAYMENT_BBVA_CCI || '011-XXX-XXXXXXXXXXXXX-XX',
    holder: process.env.PAYMENT_BBVA_HOLDER || 'Universidad Señor de Sipán S.A.C.',
  },
};

// Mastercard/Visa no aplican aquí: son el medio de pago propio del cliente,
// no una cuenta de la institución a la que se le pueda pedir que transfiera.
const REQUESTABLE_METHODS = ['yape', 'plin', 'bcp', 'bbva'];

function getPaymentAccount(methodKey) {
  return PAYMENT_ACCOUNTS[methodKey] || null;
}

module.exports = { PAYMENT_ACCOUNTS, REQUESTABLE_METHODS, getPaymentAccount };
