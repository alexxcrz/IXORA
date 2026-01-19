// 🔒 Sistema de notificaciones de seguridad para administradores
import { dbUsers } from "../config/baseDeDatos.js";
import { getIO } from "../config/socket.js";
import { sendPushToTokens } from "./pushNotifications.js";
import crypto from "crypto";

/**
 * Obtiene todos los IDs de usuarios administradores
 */
function getAdminUserIds() {
  try {
    // Buscar usuarios con rol admin o con permiso tab:admin
    const admins = dbUsers.prepare(`
      SELECT DISTINCT u.id
      FROM users u
      WHERE EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = u.id AND r.name = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM user_permissions up
        JOIN permissions p ON p.id = up.perm_id
        WHERE up.user_id = u.id AND (p.perm = 'tab:admin' OR p.perm = 'admin.senior' OR p.perm = 'admin.junior')
      )
    `).all();
    
    return admins.map(a => a.id);
  } catch (err) {
    console.error("Error obteniendo administradores:", err);
    return [];
  }
}

/**
 * Mapeo de tipos de eventos a títulos y tipos de notificación
 */
const EVENT_TYPE_MAPPING = {
  // Anti-VPN
  "VPN_DETECTED": {
    titulo: "🔒 VPN Detectada",
    tipo: "warning",
    mensaje: (details) => `Se detectó una conexión mediante VPN desde IP ${details.ip || "desconocida"}. ISP: ${details.isp || "N/A"}. País: ${details.country || "N/A"}`
  },
  "PROXY_DETECTED": {
    titulo: "🔒 Proxy Detectado",
    tipo: "warning",
    mensaje: (details) => `Se detectó una conexión mediante proxy desde IP ${details.ip || "desconocida"}`
  },
  "TOR_DETECTED": {
    titulo: "🔒 Conexión Tor Detectada",
    tipo: "warning",
    mensaje: (details) => `Se detectó una conexión mediante Tor desde IP ${details.ip || "desconocida"}`
  },
  "BLOCKED_CACHED": {
    titulo: "🚫 IP Bloqueada",
    tipo: "error",
    mensaje: (details) => `Se bloqueó el acceso desde IP ${details.ip || "desconocida"}. Razón: ${details.reason || "Desconocida"}`
  },
  "BLOCKED_BLACKLIST": {
    titulo: "🚫 IP en Blacklist",
    tipo: "error",
    mensaje: (details) => `Intento de acceso desde IP bloqueada: ${details.ip || "desconocida"}`
  },
  
  // Geofencing
  "GEOFENCING_BLOCKED": {
    titulo: "🌍 Acceso Bloqueado por Ubicación",
    tipo: "warning",
    mensaje: (details) => `Acceso bloqueado desde país ${details.country || "desconocido"}. IP: ${details.ip || "desconocida"}`
  },
  
  // Honeypot
  "HONEYPOT_TRIGGERED": {
    titulo: "🤖 Bot Detectado",
    tipo: "warning",
    mensaje: (details) => `Se detectó un bot/honeypot desde IP ${details.ip || "desconocida"}`
  },
  
  // Restricciones de tiempo
  "TIME_RESTRICTION_VIOLATION": {
    titulo: "⏰ Acceso Fuera de Horario",
    tipo: "warning",
    mensaje: (details) => `Intento de acceso fuera del horario permitido. Hora: ${details.hours || "N/A"}:00. Día: ${details.dayName || "N/A"}`
  },
  
  // Reputación de IPs
  "IP_REPUTATION_BLOCKED": {
    titulo: "⚠️ IP con Mala Reputación",
    tipo: "error",
    mensaje: (details) => `Se bloqueó IP con mala reputación. Score: ${details.score || "N/A"}/100. IP: ${details.ip || "desconocida"}`
  },
  
  // Dispositivos
  "SUSPICIOUS_DEVICE_ACTIVITY": {
    titulo: "📱 Actividad Sospechosa de Dispositivo",
    tipo: "warning",
    mensaje: (details) => `Actividad sospechosa detectada: ${details.reason || "Múltiples dispositivos nuevos"}. Usuario ID: ${details.userId || "N/A"}`
  },
  
  // Fuerza bruta
  "BRUTE_FORCE_LOCKED": {
    titulo: "🔐 Cuenta Bloqueada por Fuerza Bruta",
    tipo: "error",
    mensaje: (details) => `Cuenta bloqueada después de ${details.attempts || "N/A"} intentos fallidos. Identificador: ${details.identifier || "desconocido"}`
  },
  
  // Otros
  "SECURITY_EVENT": {
    titulo: "🔒 Evento de Seguridad",
    tipo: "info",
    mensaje: (details) => details.message || "Evento de seguridad detectado"
  }
};

/**
 * Notifica a todos los administradores sobre un evento de seguridad
 */
export async function notifyAdminsSecurityEvent(eventType, details = {}, userId = null) {
  try {
    const adminIds = getAdminUserIds();
    
    if (adminIds.length === 0) {
      console.warn("⚠️ No hay administradores para notificar");
      return;
    }
    
    // Obtener mapeo del evento
    const mapping = EVENT_TYPE_MAPPING[eventType] || EVENT_TYPE_MAPPING["SECURITY_EVENT"];
    
    // Construir mensaje
    const mensaje = typeof mapping.mensaje === "function" 
      ? mapping.mensaje({ ...details, ip: details.ip, userId })
      : mapping.mensaje;
    
    // Agregar IP a details si no está
    if (!details.ip) {
      details.ip = "desconocida";
    }
    
    // Preparar datos adicionales
    const data = {
      eventType,
      ...details,
      timestamp: new Date().toISOString()
    };
    
    // Notificar a cada administrador
    for (const adminId of adminIds) {
      try {
        const replyToken = crypto.randomBytes(16).toString("hex");
        const result = dbUsers.prepare(`
          INSERT INTO notificaciones 
          (usuario_id, titulo, mensaje, tipo, admin_only, reply_token, data)
          VALUES (?, ?, ?, ?, 1, ?, ?)
        `).run(
          adminId,
          mapping.titulo,
          mensaje,
          mapping.tipo,
          replyToken,
          JSON.stringify(data)
        );
        
        // Enviar notificación en tiempo real vía Socket.IO
        try {
          const io = getIO();
          if (io && typeof io.emit === "function") {
            io.emit("nueva_notificacion", {
              userId: adminId,
              id: result.lastInsertRowid,
              titulo: mapping.titulo,
              mensaje: mensaje,
              tipo: mapping.tipo,
              admin_only: true,
              data: data,
              timestamp: new Date().toISOString()
            });
          }
        } catch (socketErr) {
          // Silenciar errores de socket (puede que socket aún no esté inicializado)
        }

        try {
          const tokens = dbUsers
            .prepare("SELECT token FROM push_tokens WHERE usuario_id = ?")
            .all(adminId)
            .map((row) => row.token);
          if (tokens.length) {
            sendPushToTokens(tokens, {
              title: mapping.titulo,
              body: mensaje,
              data: {
                notificationId: String(result.lastInsertRowid),
                tipo: mapping.tipo || "info",
                es_confirmacion: "0",
                replyToken: replyToken,
                serverUrl: process.env.SERVER_PUBLIC_URL || "http://172.16.30.12:3001",
              },
            }).catch(() => {});
          }
        } catch (pushErr) {
          // Ignorar errores de push
        }
        
      } catch (err) {
        console.error(`Error notificando a administrador ${adminId}:`, err);
      }
    }
    
    console.log(`✅ Notificación de seguridad enviada a ${adminIds.length} administrador(es): ${eventType}`);
    
  } catch (err) {
    console.error("Error en notifyAdminsSecurityEvent:", err);
  }
}

/**
 * Notifica cuando una IP es bloqueada automáticamente
 */
export async function notifyIPBlocked(ip, reason, details = {}) {
  await notifyAdminsSecurityEvent("BLOCKED_CACHED", {
    ip,
    reason,
    ...details
  });
}

/**
 * Notifica cuando se detecta VPN/Proxy/Tor
 */
export async function notifyVPNDetected(ip, type, details = {}) {
  const eventType = type === "vpn" ? "VPN_DETECTED" 
                  : type === "proxy" ? "PROXY_DETECTED"
                  : "TOR_DETECTED";
  
  await notifyAdminsSecurityEvent(eventType, {
    ip,
    ...details
  });
}

export default {
  notifyAdminsSecurityEvent,
  notifyIPBlocked,
  notifyVPNDetected
};
















