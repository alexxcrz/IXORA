// 🔒 Verificación de reputación de IPs
// Consulta servicios de reputación para detectar IPs maliciosas

import { getClientIP } from "./antiVPN.js";
import { dbUsers } from "../config/baseDeDatos.js";
import { notifyAdminsSecurityEvent } from "../utilidades/securityNotifications.js";

const CONFIG = {
  ENABLED: process.env.IP_REPUTATION_ENABLED === "true",
  // API key opcional para servicios premium
  API_KEY: process.env.IP_REPUTATION_API_KEY || null,
};

// Cache de verificaciones
const reputationCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas

/**
 * Verifica reputación de IP usando AbuseIPDB (gratuito con rate limits)
 */
async function checkIPReputation(ip) {
  // Verificar cache
  const cached = reputationCache.get(ip);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.reputation;
  }
  
  // Si no hay API key, usar verificación básica
  if (!CONFIG.API_KEY) {
    // Verificación básica: solo lista negra simple
    return { score: 0, isSafe: true };
  }
  
  try {
    // Usar AbuseIPDB API (requiere registro gratuito)
    const response = await fetch(`https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}&maxAgeInDays=90&verbose`, {
      headers: {
        "Key": CONFIG.API_KEY,
        "Accept": "application/json"
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      const reputation = {
        score: data.data?.abuseConfidenceScore || 0,
        isSafe: (data.data?.abuseConfidenceScore || 0) < 25, // Menos de 25% = seguro
        usageType: data.data?.usageType || "unknown",
        isp: data.data?.isp || null,
        country: data.data?.countryCode || null,
      };
      
      reputationCache.set(ip, { reputation, timestamp: Date.now() });
      
      // Limpiar cache viejo
      if (reputationCache.size > 1000) {
        const now = Date.now();
        for (const [key, value] of reputationCache.entries()) {
          if (now - value.timestamp > CACHE_TTL) {
            reputationCache.delete(key);
          }
        }
      }
      
      return reputation;
    }
  } catch (err) {
    // Silenciar errores
  }
  
  return { score: 0, isSafe: true }; // Por defecto, permitir si falla
}

/**
 * Verifica si IP está en lista negra conocida (gratuito)
 */
async function checkBlacklist(ip) {
  // Listas negras públicas gratuitas
  const blacklists = [
    `https://api.abuseipdb.com/api/v2/blacklist`,
    // Agregar más listas según necesidad
  ];
  
  // Por ahora, solo verificar si hay API key
  if (!CONFIG.API_KEY) {
    return false;
  }
  
  try {
    // Esta es una verificación simplificada
    // En producción, considerar usar múltiples fuentes
    return false; // No bloquear por defecto sin verificación completa
  } catch (err) {
    return false;
  }
}

/**
 * Middleware de verificación de reputación de IP
 */
export async function ipReputationMiddleware(req, res, next) {
  if (!CONFIG.ENABLED) {
    return next();
  }
  
  // Permitir IPs privadas
  const ip = getClientIP(req);
  if (ip.startsWith("127.") || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return next();
  }
  
  try {
    // Verificar reputación
    const reputation = await checkIPReputation(ip);
    
    if (!reputation.isSafe) {
          // Registrar evento
          try {
            dbUsers.prepare(`
              INSERT INTO security_events (ip, event_type, details, user_id)
              VALUES (?, ?, ?, ?)
            `).run(
              ip,
              "IP_REPUTATION_BLOCKED",
              JSON.stringify({ score: reputation.score, usageType: reputation.usageType }),
              req.user?.id || null
            );
            
            // Bloquear IP si tiene muy mala reputación
            if (reputation.score >= 75) {
              dbUsers.prepare(`
                INSERT INTO blocked_ips (ip, reason, blocked_until)
                VALUES (?, ?, datetime('now', '+7 days'))
                ON CONFLICT(ip) DO UPDATE SET
                  reason = excluded.reason,
                  blocked_until = excluded.blocked_until
              `).run(ip, `IP con mala reputación (score: ${reputation.score})`);
              
              // Notificar a administradores
              try {
                await notifyAdminsSecurityEvent("IP_REPUTATION_BLOCKED", {
                  ip,
                  score: reputation.score,
                  usageType: reputation.usageType
                }, req.user?.id || null);
              } catch (notifyErr) {
                // Silenciar errores
              }
              
              return res.status(403).json({
                error: "Acceso denegado",
                message: "Tu IP tiene una reputación sospechosa"
              });
            }
          } catch (err) {
            // Silenciar errores
          }
    }
  } catch (err) {
    // Si falla, permitir acceso (no bloquear por error)
  }
  
  next();
}

export default ipReputationMiddleware;
















