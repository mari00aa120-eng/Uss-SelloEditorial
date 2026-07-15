// Envío de correos transaccionales usando la API HTTP de Brevo (antes Sendinblue).
// Documentación: https://developers.brevo.com/reference/sendtransacemail

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

async function sendEmail({ to, subject, html }) {
  if (!process.env.BREVO_API_KEY) {
    throw new Error('Falta la variable de entorno BREVO_API_KEY');
  }

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'api-key': process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: {
        name: process.env.BREVO_SENDER_NAME || 'USS Sello Editorial',
        email: process.env.BREVO_SENDER_EMAIL,
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Brevo respondió con error ${response.status}: ${errorBody}`);
  }

  const result = await response.json();
  console.log('[Brevo] Respuesta:', result); // 👈 para ver si Brevo aceptó el envío (messageId, etc.)
  return result;
}

async function sendAdminCodeEmail(email, code) {
  return sendEmail({
    to: email,
    subject: 'Código de acceso al panel de administración - USS Sello Editorial',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#1a1a1a;">Código de verificación</h2>
        <p>Alguien solicitó acceso al panel de administración de <strong>USS Sello Editorial</strong>.</p>
        <p>Tu código de acceso es:</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; background:#f4f4f4; padding: 16px; text-align:center; border-radius: 8px;">${code}</p>
        <p>Este código expira en <strong>10 minutos</strong>. Si tú no solicitaste este código, ignora este correo.</p>
      </div>
    `,
  });
}

module.exports = { sendEmail, sendAdminCodeEmail };