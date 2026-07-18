// Envío de correos transaccionales usando la API HTTP de Brevo (antes Sendinblue).
// Documentación: https://developers.brevo.com/reference/sendtransacemail

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

async function sendEmail({ to, cc, subject, html, attachments, replyTo, senderName }) {
  if (!process.env.BREVO_API_KEY) {
    throw new Error('Falta la variable de entorno BREVO_API_KEY');
  }

  const body = {
    sender: {
      name: senderName || process.env.BREVO_SENDER_NAME || 'USS Sello Editorial',
      email: process.env.BREVO_SENDER_EMAIL,
    },
    to: [{ email: to }],
    subject,
    htmlContent: html,
  };

  // Brevo solo puede ENVIAR realmente desde un correo verificado en la
  // cuenta (BREVO_SENDER_EMAIL). Para que las respuestas del admin
  // "parezcan" venir de fondoeditorial@uss.edu.pe y que si el cliente
  // presiona "Responder" le llegue ahí, usamos replyTo en vez de sender.
  if (replyTo) {
    body.replyTo = { email: replyTo };
  }

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

// Correo con el que "responde" el administrador desde el panel /admin.
// orderStatus: 'procesando' | 'pagado' | 'pendiente_pago'
// paymentInfo (solo si orderStatus === 'pendiente_pago'): { label, handle, cci, holder, amount }
async function sendAdminResponseEmail({ to, customerName, message, orderStatus, paymentInfo }) {
  const REPLY_TO = 'fondoeditorial@uss.edu.pe';

  const statusBadges = {
    procesando: { text: 'Su pedido está siendo procesado', color: '#B45309', bg: '#FEF3C7' },
    pagado: { text: 'Pedido pagado', color: '#046C3B', bg: '#DCFCE7' },
    pendiente_pago: { text: 'Pendiente a pagar', color: '#B91C1C', bg: '#FEE2E2' },
  };
  const badge = statusBadges[orderStatus] || statusBadges.procesando;

  let paymentBlock = '';
  if (orderStatus === 'pendiente_pago' && paymentInfo) {
    paymentBlock = `
      <div style="margin-top:16px; padding:16px; background:#FFF7ED; border:1px solid #FDBA74; border-radius:8px;">
        <p style="margin:0 0 8px; font-weight:700; color:#9A3412;">Datos para completar tu pago</p>
        <p style="margin:0; font-size:14px; color:#333;">
          <strong>Monto a pagar:</strong> S/ ${Number(paymentInfo.amount).toFixed(2)}<br>
          <strong>Método:</strong> ${paymentInfo.label}<br>
          <strong>${paymentInfo.cci ? 'Cuenta' : 'Número / @'}:</strong> ${paymentInfo.handle}<br>
          ${paymentInfo.cci ? `<strong>CCI:</strong> ${paymentInfo.cci}<br>` : ''}
          <strong>Titular:</strong> ${paymentInfo.holder}
        </p>
      </div>
    `;
  }

  return sendEmail({
    to,
    replyTo: REPLY_TO,
    senderName: 'USS Fondo Editorial',
    subject: `Actualización de tu pedido - USS Fondo Editorial`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#1a1a1a;">Hola${customerName ? ', ' + customerName : ''}</h2>
        <span style="display:inline-block; padding:6px 12px; border-radius:999px; font-size:13px; font-weight:700; color:${badge.color}; background:${badge.bg};">${badge.text}</span>
        ${message ? `<p style="font-size:14px; color:#333; margin-top:16px; white-space:pre-line;">${message}</p>` : ''}
        ${paymentBlock}
        <p style="font-size:12px; color:#777; margin-top:24px;">
          Si tienes alguna duda, puedes responder directamente a este correo y llegará a fondoeditorial@uss.edu.pe.
        </p>
      </div>
    `,
  });
}

// ---------------------------------------------------------------------
// Formulario de contacto (QA.html)
// ---------------------------------------------------------------------

// Se envía al VISITANTE apenas llena el formulario de contacto, confirmando
// que su mensaje llegó a USS Sello Editorial.
async function sendContactConfirmationEmail({ to, name, subject }) {
  return sendEmail({
    to,
    subject: 'Recibimos tu mensaje - USS Sello Editorial',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#046C3B;">¡Gracias por escribirnos, ${name}!</h2>
        <p>Tu mensaje fue enviado correctamente a <strong>USS Sello Editorial</strong> y ya está en manos de nuestro equipo.</p>
        <p style="font-size: 14px; color:#333;"><strong>Asunto:</strong> ${subject}</p>
        <p>Te responderemos a este mismo correo apenas revisemos tu consulta.</p>
      </div>
    `,
  });
}

// Se envía al EQUIPO (correos autorizados, ej. isabellacastrocamacho117@outlook.com)
// para avisar que llegó un mensaje de contacto nuevo.
async function sendContactNotificationEmail({ to, name, phone, email, subject, message }) {
  return sendEmail({
    to,
    replyTo: email,
    subject: `Nuevo mensaje de contacto: ${subject}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;">
        <h2 style="color:#1a1a1a;">Nuevo mensaje de contacto</h2>
        <p style="font-size: 14px; color:#333;">
          <strong>Nombre:</strong> ${name}<br>
          <strong>Correo:</strong> ${email}<br>
          <strong>Teléfono:</strong> ${phone}<br>
          <strong>Asunto:</strong> ${subject}
        </p>
        <p style="margin-top:16px; padding:14px; background:#f4f4f4; border-radius:8px; white-space:pre-line; font-size:14px; color:#333;">${message}</p>
        <p style="font-size:12px; color:#777; margin-top:20px;">
          Puedes responder a este correo directamente, o gestionar este mensaje desde el panel "Actualizar Contacto" en /admin.
        </p>
      </div>
    `,
  });
}

// Se envía al VISITANTE cuando un admin responde su mensaje desde el panel de contacto.
async function sendContactResponseEmail({ to, name, subject, originalMessage, responseText, status }) {
  const statusLabel = status === 'resuelto' ? 'Resuelto' : 'Respondido';
  const statusColor = status === 'resuelto' ? '#046C3B' : '#B45309';
  const statusBg = status === 'resuelto' ? '#DCFCE7' : '#FEF3C7';

  return sendEmail({
    to,
    replyTo: 'fondoeditorial@uss.edu.pe',
    senderName: 'USS Sello Editorial',
    subject: `Respuesta a tu consulta: ${subject}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#1a1a1a;">Hola${name ? ', ' + name : ''}</h2>
        <span style="display:inline-block; padding:6px 12px; border-radius:999px; font-size:13px; font-weight:700; color:${statusColor}; background:${statusBg};">${statusLabel}</span>
        <p style="font-size:14px; color:#333; margin-top:16px;">Este es un mensaje de USS Sello Editorial en respuesta a tu consulta:</p>
        <p style="margin:8px 0; padding:12px; background:#f4f4f4; border-radius:8px; font-size:13px; color:#555; white-space:pre-line;">"${originalMessage}"</p>
        <p style="font-size:14px; color:#333; margin-top:16px; white-space:pre-line;">${responseText}</p>
        <p style="font-size:12px; color:#777; margin-top:24px;">
          Si tienes alguna otra duda, puedes responder directamente a este correo.
        </p>
      </div>
    `,
  });
}

module.exports = {
  sendEmail,
  sendAdminCodeEmail,
  sendInvoiceEmail,
  sendAdminResponseEmail,
  sendContactConfirmationEmail,
  sendContactNotificationEmail,
  sendContactResponseEmail,
};