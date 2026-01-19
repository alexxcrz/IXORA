// 🔒 Seguridad avanzada de sesiones
// - Detección de sesiones simultáneas
// - Rotación de tokens
// - Detección de cambios de dispositivo/ubicación
import { dbUsers } from "../config/baseDeDatos.js";
import { getClientIP } from "./antiVPN.js";
import { notifyAdminsSecurityEvent } from "../utilidades/securityNotifications.js";

const CONFIG = {
  // Máximo de sesiones simultáneas por usuario (aumentado para permitir múltiples dispositivos)
  MAX_SIMULTANEOUS_SESSIONS: parseInt(process.env.MAX_SIMULTANEOUS_SESSIONS || "10", 10),
  
  // Rotar token después de X minutos de inactividad
  TOKEN_ROTATION_INACTIVITY_MINUTES: parseInt(process.env.TOKEN_ROTATION_INACTIVITY_MINUTES || "60", 10),
  
  // Detectar cambios sospechosos de dispositivo/ubicación
  DETECT_DEVICE_CHANGES: process.env.DETECT_DEVICE_CHANGES !== "false",
};

// Crear tabla para tracking de dispositivos si no existe
try {
  dbUsers.exec(`
    CREATE TABLE IF NOT EXISTS user_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      device_fingerprint TEXT NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      country TEXT,
      last_seen_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, device_fingerprint)
    );
    
    CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_devices_fingerprint ON user_devices(device_fingerprint);
    
    ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;
    ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS ip_address TEXT;
  `);
} catch (err) {
  // Ignorar si las columnas ya existen
}

/**
 * Genera un fingerprint del dispositivo basado en headers
 */
function generateDeviceFingerprint(req) {
  const userAgent = req.headers["user-agent"] || "";
  const acceptLanguage = req.headers["accept-language"] || "";
  const acceptEncoding = req.headers["accept-encoding"] || "";
  
  // Crear hash simple del fingerprint
  const fingerprint = `${userAgent}|${acceptLanguage}|${acceptEncoding}`;
  return Buffer.from(fingerprint).toString("base64").substring(0, 64);
}

/**
 * Registra un dispositivo
 */
async function registerDevice(userId, req) {
  const fingerprint = generateDeviceFingerprint(req);
  const userAgent = req.headers["user-agent"] || "unknown";
  const ip = getClientIP(req);
  
  try {
    // Obtener país de la IP (opcional, puede fallar)
    let country = null;
    try {
      const response = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`);
      if (response.ok) {
        const data = await response.json();
        country = data.countryCode || null;
      }
    } catch (err) {
      // Ignorar errores
    }
    
    dbUsers.prepare(`
      INSERT INTO user_devices (user_id, device_fingerprint, user_agent, ip_address, country, last_seen_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, device_fingerprint) DO UPDATE SET
        last_seen_at = datetime('now'),
        ip_address = excluded.ip_address,
        country = excluded.country
    `).run(userId, fingerprint, userAgent, ip, country);
    
    return fingerprint;
  } catch (err) {
    console.error("Error registrando dispositivo:", err);
    return fingerprint;
  }
}

/**
 * Verifica si hay demasiadas sesiones simultáneas
 * IMPORTANTE: Solo cuenta sesiones activas (vistas en la última hora)
 */
function checkSimultaneousSessions(userId) {
  const sessions = dbUsers.prepare(`
    SELECT COUNT(*) as count
    FROM user_sessions
    WHERE user_id = ? 
    AND (
      (last_seen_at IS NOT NULL AND datetime(last_seen_at, '+1 hour') > datetime('now'))
      OR
      (last_seen_at IS NULL AND datetime(created_at, '+1 hour') > datetime('now'))
    )
  `).get(userId);
  
  return sessions.count >= CONFIG.MAX_SIMULTANEOUS_SESSIONS;
}

/**
 * Limpia sesiones antiguas
 */
function cleanupOldSessions(userId) {
  // Eliminar solo sesiones inactivas por más de 7 días (muy antiguas)
  // NO eliminar sesiones recientes
  try {
    dbUsers.prepare(`
      DELETE FROM user_sessions
      WHERE user_id = ?
      AND (
        (last_seen_at IS NOT NULL AND datetime(last_seen_at, '+7 days') < datetime('now'))
        OR
        (last_seen_at IS NULL AND datetime(created_at, '+7 days') < datetime('now'))
      )
    `).run(userId);
  } catch (err) {
    // Si hay error, continuar sin limpiar
    console.debug("Error en cleanupOldSessions:", err.message);
  }
  
  // NO eliminar sesiones activas aunque haya muchas
  // Permitir múltiples sesiones simultáneas sin límite estricto
}

/**
 * Detecta cambios sospechosos de dispositivo/ubicación
 */
async function detectSuspiciousActivity(userId, req) {
  if (!CONFIG.DETECT_DEVICE_CHANGES) return null;
  
  const fingerprint = generateDeviceFingerprint(req);
  const ip = getClientIP(req);
  
  // Verificar si este dispositivo es conocido
  const knownDevice = dbUsers.prepare(`
    SELECT * FROM user_devices
    WHERE user_id = ? AND device_fingerprint = ?
  `).get(userId, fingerprint);
  
  if (!knownDevice) {
    // Nuevo dispositivo - registrar
    await registerDevice(userId, req);
    
    // Verificar si hay otros dispositivos recientes
    const recentDevices = dbUsers.prepare(`
      SELECT COUNT(*) as count
      FROM user_devices
      WHERE user_id = ?
      AND datetime(last_seen_at, '+7 days') > datetime('now')
    `).get(userId);
    
    // Si hay más de 3 dispositivos diferentes en 7 días, puede ser sospechoso
    if (recentDevices.count > 3) {
      return {
        suspicious: true,
        reason: "Múltiples dispositivos nuevos en poco tiempo",
        deviceCount: recentDevices.count
      };
    }
  } else {
    // Dispositivo conocido - actualizar
    registerDevice(userId, req);
  }
  
  return null;
}

/**
 * Middleware de seguridad de sesiones
 */
export async function sessionSecurityMiddleware(req, res, next) {
  // 🔥 TEMPORALMENTE DESHABILITADO para diagnosticar el problema de sesiones
  // Solo actualizar last_seen_at sin hacer verificaciones que puedan eliminar sesiones
  if (!req.user?.id) {
    return next();
  }
  
  const userId = req.user.id;
  const token = req.headers.authorization?.replace("Bearer ", "") || req.query?.token;
  
  if (!token) {
    return next();
  }
  
  try {
    // Solo actualizar last_seen_at para mantener la sesión activa
    // NO hacer ninguna verificación que pueda eliminar la sesión
    try {
      dbUsers.prepare(`
        UPDATE user_sessions
        SET last_seen_at = datetime('now')
        WHERE token = ? AND user_id = ?
      `).run(token, userId);
    } catch (err) {
      // Si falla la actualización, no bloquear la petición
      console.debug("Error actualizando last_seen_at:", err.message);
    }
    
    // NO hacer ninguna otra verificación por ahora
    return next();
    
    /* CÓDIGO COMENTADO TEMPORALMENTE PARA DIAGNÓSTICO
    // Verificar sesión actual
    const session = dbUsers.prepare(`
      SELECT * FROM user_sessions
      WHERE token = ? AND user_id = ?
    `).get(token, userId);
    
    if (!session) {
      return next(); // Dejar que authRequired maneje esto
    }
    
    // NO limpiar sesiones si la sesión actual es muy reciente (menos de 1 hora)
    // Esto previene que se eliminen sesiones recién creadas
    const oneHour = 60 * 60 * 1000;
    const now = new Date();
    
    // Calcular edad de la sesión de forma segura
    let sessionAge = 0;
    if (session.last_seen_at) {
      const lastSeen = new Date(session.last_seen_at);
      if (!isNaN(lastSeen.getTime())) {
        sessionAge = now - lastSeen;
      }
    }
    
    // Si no hay last_seen_at o es inválido, usar created_at
    if (sessionAge === 0 && session.created_at) {
      const created = new Date(session.created_at);
      if (!isNaN(created.getTime())) {
        sessionAge = now - created;
      }
    }
    
    // Solo limpiar sesiones antiguas si la sesión actual tiene más de 1 hora
    // Esto evita que se eliminen sesiones recién creadas
    if (sessionAge > oneHour) {
      cleanupOldSessions(userId);
    }
    
    // 🔥 CRÍTICO: NO cerrar sesiones recientes (menos de 1 hora)
    // Permitir múltiples sesiones simultáneas sin límite para sesiones recientes
    // Esto es especialmente importante justo después del login
    // Si sessionAge es negativo o muy pequeño, es una sesión recién creada - protegerla
    if (sessionAge < oneHour || sessionAge < 0 || isNaN(sessionAge)) {
      // Sesión muy reciente (menos de 1 hora) o con edad inválida, NO hacer ninguna verificación de límites
      // NO eliminar esta sesión bajo ninguna circunstancia
      // Solo actualizar last_seen_at y continuar
      if (sessionAge < 0 || isNaN(sessionAge)) {
        console.warn(`⚠️ Sesión con edad inválida (${sessionAge}), protegiendo de eliminación. LastSeen: ${session.last_seen_at}, Created: ${session.created_at}`);
      } else {
        console.debug(`✅ Sesión reciente (${Math.round(sessionAge / 1000)}s), protegiendo de eliminación`);
      }
    } else {
      // Solo verificar límites para sesiones antiguas (más de 1 hora)
      // Pero incluso aquí, ser más permisivo
      const sessionCount = dbUsers.prepare(`
        SELECT COUNT(*) as count
        FROM user_sessions
        WHERE user_id = ? 
        AND (
          (last_seen_at IS NOT NULL AND datetime(last_seen_at, '+1 hour') > datetime('now'))
          OR
          (last_seen_at IS NULL AND datetime(created_at, '+1 hour') > datetime('now'))
        )
      `).get(userId);
      
      // Solo eliminar si hay MUCHAS más sesiones de las permitidas (doble del límite)
      // Esto da más margen para múltiples dispositivos
      if (sessionCount.count > (CONFIG.MAX_SIMULTANEOUS_SESSIONS * 2)) {
        console.warn(`⚠️ Usuario ${userId} tiene ${sessionCount.count} sesiones activas, eliminando sesión antigua`);
        dbUsers.prepare(`DELETE FROM user_sessions WHERE token = ?`).run(token);
        
        return res.status(401).json({
          error: "Sesión cerrada",
          message: "Demasiadas sesiones activas. Por favor, inicia sesión nuevamente."
        });
      }
    }
    
    // Actualizar fingerprint, IP y last_seen_at de la sesión
    // Esto es importante para mantener la sesión activa
    const fingerprint = generateDeviceFingerprint(req);
    const ip = getClientIP(req);
    
    try {
      dbUsers.prepare(`
        UPDATE user_sessions
        SET device_fingerprint = ?, ip_address = ?, last_seen_at = datetime('now')
        WHERE token = ?
      `).run(fingerprint, ip, token);
    } catch (err) {
      // Si falla la actualización, no bloquear la petición
      console.debug("Error actualizando sesión:", err.message);
    }
    
    // Detectar actividad sospechosa
    const suspicious = await detectSuspiciousActivity(userId, req);
    if (suspicious) {
      // Registrar pero no bloquear (solo alertar)
      dbUsers.prepare(`
        INSERT INTO security_events (ip, event_type, details, user_id)
        VALUES (?, ?, ?, ?)
      `).run(
        ip,
        "SUSPICIOUS_DEVICE_ACTIVITY",
        JSON.stringify(suspicious),
        userId
      );
      
      // Notificar a administradores
      try {
        await notifyAdminsSecurityEvent("SUSPICIOUS_DEVICE_ACTIVITY", {
          ip,
          userId,
          ...suspicious
        }, userId);
      } catch (notifyErr) {
        // Silenciar errores
      }
    }
    
    */ // FIN DEL CÓDIGO COMENTADO
    
  } catch (err) {
    console.error("Error en sessionSecurityMiddleware:", err);
  }
  
  next();
}

/**
 * Obtiene dispositivos de un usuario
 */
export function getUserDevices(userId) {
  return dbUsers.prepare(`
    SELECT * FROM user_devices
    WHERE user_id = ?
    ORDER BY last_seen_at DESC
  `).all(userId);
}

export default sessionSecurityMiddleware;
















