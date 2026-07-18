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
  mastercard: {
    label: 'Mastercard',
    // Aquí no va un número de cuenta bancaria: va el enlace de pago (pasarela
    // tipo Niubiz/Culqi/etc.) o el código que el cliente debe usar para pagar
    // con su tarjeta Mastercard cuando el admin marca el pedido como
    // "Pendiente a pagar".
    handle: process.env.PAYMENT_MASTERCARD_LINK || 'Pendiente de configurar',
    holder: process.env.PAYMENT_MASTERCARD_HOLDER || 'USS Fondo Editorial',
  },
  visa: {
    label: 'Visa',
    handle: process.env.PAYMENT_VISA_LINK || 'Pendiente de configurar',
    holder: process.env.PAYMENT_VISA_HOLDER || 'USS Fondo Editorial',
  },
};

// Los 6 medios de pago que el admin puede configurar y solicitar al cliente
// desde el panel ("Configurar cuentas de pago" y "Medio de pago a
// solicitar"). Para Mastercard/Visa el campo "handle" se usa para el enlace
// de pago o código de cobro (no hay número de cuenta ni CCI).
const REQUESTABLE_METHODS = ['yape', 'plin', 'bcp', 'bbva', 'mastercard', 'visa'];

function getPaymentAccount(methodKey) {
  return PAYMENT_ACCOUNTS[methodKey] || null;
}

module.exports = { PAYMENT_ACCOUNTS, REQUESTABLE_METHODS, getPaymentAccount };
