// Envío de correos transaccionales usando la API HTTP de Brevo (antes Sendinblue).
// Documentación: https://developers.brevo.com/reference/sendtransacemail

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

async function sendEmail({ to, cc, subject, html, attachments }) {
  if (!process.env.BREVO_API_KEY) {
    throw new Error('Falta la variable de entorno BREVO_API_KEY');
  }

  const body = {
    sender: {
      name: process.env.BREVO_SENDER_NAME || 'USS Sello Editorial',
      email: process.env.BREVO_SENDER_EMAIL,
    },
    to: [{ email: to }],
    subject,
    htmlContent: html,
  };

  if (cc) {
    body.cc = [{ email: cc }];
  }

  if (attachments && attachments.length > 0) {
    // Brevo espera el contenido del archivo en base64 (sin el prefijo data:...;base64,)
    body.attachment = attachments.map((a) => ({ name: a.name, content: a.content }));
  }

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'api-key': process.env.BREVO_API_KEY,
    },
    body: JSON.stringify(body),
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

async function sendInvoiceEmail({ to, cc, customerName, invoiceNumber, total, pdfBuffer }) {
  return sendEmail({
    to,
    cc,
    subject: `Tu factura ${invoiceNumber} - USS Fondo Editorial`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#046C3B;">¡Gracias por tu compra, ${customerName}!</h2>
        <p>Tu pedido fue confirmado y ya generamos tu factura electrónica.</p>
        <p style="font-size: 14px; color:#333;">
          <strong>Número de factura:</strong> ${invoiceNumber}<br>
          <strong>Total pagado:</strong> S/ ${Number(total).toFixed(2)}
        </p>
        <p>Adjuntamos el PDF de tu factura en este correo.</p>
        <p style="font-size: 12px; color:#777; margin-top: 24px;">
          Si tienes alguna duda sobre tu pedido, puedes responder a este correo o escribirnos a través de nuestro canal de contacto.
        </p>
      </div>
    `,
    attachments: [
      {
        name: `${invoiceNumber}.pdf`,
        content: pdfBuffer.toString('base64'),
      },
    ],
  });
}

module.exports = { sendEmail, sendAdminCodeEmail, sendInvoiceEmail };