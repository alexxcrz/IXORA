// 🔒 Geofencing - Bloquear/permitir países específicos
import { getClientIP } from "./antiVPN.js";
import { dbUsers } from "../config/baseDeDatos.js";
import { notifyAdminsSecurityEvent } from "../utilidades/securityNotifications.js";

const CONFIG = {
  // Países permitidos (array de códigos ISO 3166-1 alpha-2)
  // Si está vacío, permite todos excepto los bloqueados
  ALLOWED_COUNTRIES: (process.env.ALLOWED_COUNTRIES || "").split(",").filter(Boolean),
  
  // Países bloqueados (array de códigos ISO 3166-1 alpha-2)
  BLOCKED_COUNTRIES: (process.env.BLOCKED_COUNTRIES || "").split(",").filter(Boolean),
  
  // Modo estricto: true = bloquear si no está en allowed, false = solo bloquear los blocked
  STRICT_MODE: process.env.GEOFENCING_STRICT_MODE === "true",
};

// Cache de verificaciones de países por IP
const countryCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos

/**
 * Obtiene el país de una IP
 */
async function getCountryFromIP(ip) {
  // Verificar cache
  const cached = countryCache.get(ip);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.country;
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,countryCode`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      if (data.status === "success" && data.countryCode) {
        const country = data.countryCode.toUpperCase();
        countryCache.set(ip, { country, timestamp: Date.now() });
        
        // Limpiar cache viejo
        if (countryCache.size > 1000) {
          const now = Date.now();
          for (const [key, value] of countryCache.entries()) {
            if (now - value.timestamp > CACHE_TTL) {
              countryCache.delete(key);
            }
          }
        }
        
        return country;
      }
    }
  } catch (err) {
    // Silenciar errores
  }
  
  return null;
}

/**
 * Verifica si un país está permitido
 */
function isCountryAllowed(countryCode) {
  if (!countryCode) return true; // Si no se puede determinar, permitir (no bloquear por error)
  
  // Si hay países bloqueados específicos
  if (CONFIG.BLOCKED_COUNTRIES.length > 0) {
    if (CONFIG.BLOCKED_COUNTRIES.includes(countryCode)) {
      return false;
    }
  }
  
  // Modo estricto: solo permitir países en la lista
  if (CONFIG.STRICT_MODE && CONFIG.ALLOWED_COUNTRIES.length > 0) {
    return CONFIG.ALLOWED_COUNTRIES.includes(countryCode);
  }
  
  return true;
}

/**
 * Middleware de geofencing
 */
export async function geofencingMiddleware(req, res, next) {
  // Solo aplicar si hay configuración
  if (CONFIG.ALLOWED_COUNTRIES.length === 0 && CONFIG.BLOCKED_COUNTRIES.length === 0) {
    return next();
  }
  
  const ip = getClientIP(req);
  
  // Permitir IPs privadas si están configuradas
  if (process.env.ALLOW_PRIVATE_IPS !== "false") {
    const privateIPs = ["127.", "192.168.", "10.", "172.16.", "172.17.", "172.18.", 
                        "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", 
                        "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", 
                        "172.29.", "172.30.", "172.31."];
    if (privateIPs.some(prefix => ip.startsWith(prefix))) {
      return next();
    }
  }
  
  try {
    const countryCode = await getCountryFromIP(ip);
    
    if (!isCountryAllowed(countryCode)) {
      // Registrar evento
      try {
        dbUsers.prepare(`
          INSERT INTO security_events (ip, event_type, details, user_id)
          VALUES (?, ?, ?, ?)
        `).run(ip, "GEOFENCING_BLOCKED", JSON.stringify({ country: countryCode }), req.user?.id || null);
        
        // Notificar a administradores
        try {
          await notifyAdminsSecurityEvent("GEOFENCING_BLOCKED", {
            ip,
            country: countryCode
          }, req.user?.id || null);
        } catch (notifyErr) {
          // Silenciar errores
        }
      } catch (err) {
        // Silenciar errores de logging
      }
      
      return res.status(403).json({
        error: "Acceso denegado",
        message: "Tu ubicación no está permitida"
      });
    }
  } catch (err) {
    // Si falla la verificación, permitir acceso (no bloquear por error)
    console.error("Error en geofencing:", err);
  }
  
  next();
}

export default geofencingMiddleware;
















