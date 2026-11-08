import nodemailer from 'nodemailer';

// Envío de mails por Gmail con la cuenta de SMTP_USER y su contraseña de aplicación
// (SMTP_PASS). Si faltan, no se envía nada: se avisa en consola y el servidor sigue andando.

let transporte = null;

export function mailConfigurado() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function obtenerTransporte() {
  if (!transporte) {
    transporte = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return transporte;
}

/**
 * Envía un mail. adjuntos: [{ filename, content (Buffer) }].
 * Devuelve false sin enviar si el mail no está configurado; si el envío falla, lanza el error.
 */
export async function enviarMail({ para, asunto, texto, adjuntos = [] }) {
  if (!mailConfigurado()) {
    console.warn('Mail no configurado (faltan SMTP_USER y SMTP_PASS): no se envió el mail a', para);
    return false;
  }
  await obtenerTransporte().sendMail({
    from: process.env.SMTP_USER,
    to: para,
    subject: asunto,
    text: texto,
    attachments: adjuntos
  });
  return true;
}
