// 🔒 Honeypot - Trampas para detectar bots y scrapers
// Campos ocultos que los bots llenan pero los humanos no ven

import { dbUsers } from "../config/baseDeDatos.js";
import { getClientIP } from "./antiVPN.js";
import { notifyAdminsSecurityEvent } from "../utilidades/securityNotifications.js";

/**
 * Middleware honeypot - Detecta bots que llenan campos ocultos
 */
export async function honeypotMiddleware(req, res, next) {
  // Solo aplicar a POST/PUT/PATCH
  if (!["POST", "PUT", "PATCH"].includes(req.method)) {
    return next();
  }
  
  // Nombres comunes de campos honeypot (los bots suelen llenar campos con estos nombres)
  const honeypotFields = [
    "website", "url", "homepage", "email_confirm", "phone_confirm",
    "captcha", "verify", "check", "confirm_field", "hidden_field",
    "bot_trap", "spam_check", "verification"
  ];
  
  // Verificar si algún campo honeypot tiene valor
  const body = req.body || {};
  const hasHoneypotValue = honeypotFields.some(field => {
    const value = body[field] || body[`_${field}`] || body[`${field}_hidden`];
    return value && value.toString().trim().length > 0;
  });
  
  if (hasHoneypotValue) {
    // Registrar como bot
    try {
      const ip = getClientIP(req);
      
      dbUsers.prepare(`
        INSERT INTO security_events (ip, event_type, details, user_id)
        VALUES (?, ?, ?, ?)
      `).run(
        ip,
        "HONEYPOT_TRIGGERED",
        JSON.stringify({ fields: honeypotFields.filter(f => body[f]) }),
        req.user?.id || null
      );
      
        // Notificar a administradores
        try {
          await notifyAdminsSecurityEvent("HONEYPOT_TRIGGERED", {
            ip,
            fields: honeypotFields.filter(f => body[f])
          }, req.user?.id || null);
        } catch (notifyErr) {
          // Silenciar errores
        }
    } catch (err) {
      // Silenciar errores
    }
    
    // Responder como si fuera exitoso (no alertar al bot)
    // Pero no procesar el request
    return res.status(200).json({ ok: true, message: "Procesado" });
  }
  
  next();
}

/**
 * Genera campos honeypot para formularios (para uso en frontend)
 */
export function generateHoneypotFields() {
  const fields = [
    { name: "website", type: "hidden", style: "display: none; position: absolute; left: -9999px;" },
    { name: "email_confirm", type: "hidden", style: "display: none;" },
    { name: "phone_confirm", type: "text", style: "opacity: 0; position: absolute; height: 0; width: 0;" },
  ];
  
  return fields;
}

export default honeypotMiddleware;
















