// ============================================================
// 📧 MÓDULO DE ENVÍO DE EMAILS
// ============================================================

import nodemailer from "nodemailer";

// Configuración del transporter (se inicializa lazy)
let transporter = null;

/**
 * Inicializa el transporter de nodemailer con la configuración SMTP
 * @returns {Object|null} Transporter configurado o null si no hay configuración
 */
function getTransporter() {
  // Si ya está inicializado y hay configuración, retornar
  if (transporter) return transporter;

  // Obtener configuración SMTP de variables de entorno
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
  const smtpSecure = process.env.SMTP_SECURE === "true" || process.env.SMTP_PORT === "465";
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || smtpUser;

  // Si no hay configuración SMTP, retornar null
  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn("⚠️ SMTP no configurado. Variables requeridas: SMTP_HOST, SMTP_USER, SMTP_PASS");
    return null;
  }

  try {
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure, // true para 465, false para otros puertos
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    return transporter;
  } catch (error) {
    console.error("❌ Error creando transporter de email:", error);
    return null;
  }
}

/**
 * Envía un email
 * @param {string} to - Dirección de correo destino
 * @param {string} subject - Asunto del correo
 * @param {string} html - Contenido HTML del correo
 * @param {string} text - Contenido de texto plano (opcional)
 * @returns {Promise<boolean>} true si se envió correctamente, false en caso contrario
 */
export async function enviarEmail(to, subject, html, text = null) {
  try {
    const emailTransporter = getTransporter();
    if (!emailTransporter) {
      console.error("❌ No se puede enviar email: SMTP no configurado");
      return false;
    }

    const smtpFrom = process.env.SMTP_FROM || process.env.SMTP_USER;

    const mailOptions = {
      from: smtpFrom,
      to: to,
      subject: subject,
      html: html,
      text: text || html.replace(/<[^>]*>/g, ""), // Convertir HTML a texto si no se proporciona
    };

    const info = await emailTransporter.sendMail(mailOptions);
    console.log(`✅ Email enviado correctamente a ${to}. MessageId: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`❌ Error enviando email a ${to}:`, error);
    return false;
  }
}

/**
 * Envía un código de recuperación de contraseña
 * @param {string} email - Email del cliente
 * @param {string} codigo - Código de 6 dígitos
 * @param {string} nombreTienda - Nombre de la tienda (opcional)
 * @returns {Promise<boolean>} true si se envió correctamente
 */
export async function enviarCodigoRecuperacion(email, codigo, nombreTienda = "Nuestra Tienda") {
  const subject = `Código de recuperación de contraseña - ${nombreTienda}`;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .container {
      background-color: #f9f9f9;
      border-radius: 8px;
      padding: 30px;
      border: 1px solid #e0e0e0;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .header h1 {
      color: #3b82f6;
      margin: 0;
    }
    .code-box {
      background-color: #ffffff;
      border: 2px dashed #3b82f6;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      margin: 30px 0;
    }
    .code {
      font-size: 32px;
      font-weight: bold;
      color: #3b82f6;
      letter-spacing: 8px;
      font-family: 'Courier New', monospace;
    }
    .message {
      margin: 20px 0;
      padding: 15px;
      background-color: #fff3cd;
      border-left: 4px solid #ffc107;
      border-radius: 4px;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      font-size: 12px;
      color: #666;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${nombreTienda}</h1>
    </div>
    
    <h2>Recuperación de Contraseña</h2>
    
    <p>Hola,</p>
    
    <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta. Utiliza el siguiente código para continuar:</p>
    
    <div class="code-box">
      <div class="code">${codigo}</div>
    </div>
    
    <div class="message">
      <strong>⚠️ Importante:</strong> Este código es válido por 15 minutos. Si no solicitaste este código, puedes ignorar este email.
    </div>
    
    <p>Si no solicitaste este código, por favor ignora este mensaje.</p>
    
    <div class="footer">
      <p>Este es un email automático, por favor no respondas a este mensaje.</p>
      <p>&copy; ${new Date().getFullYear()} ${nombreTienda}</p>
    </div>
  </div>
</body>
</html>
  `;

  return await enviarEmail(email, subject, html);
}

/**
 * Reinicializa el transporter (útil si se cambian las credenciales SMTP)
 */
export function reinicializarTransporter() {
  transporter = null;
  return getTransporter();
}
