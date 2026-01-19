// 🔒 Protección avanzada contra fuerza bruta
import { dbUsers } from "../config/baseDeDatos.js";
import { getClientIP } from "./antiVPN.js";
import { notifyAdminsSecurityEvent } from "../utilidades/securityNotifications.js";

const CONFIG = {
  // Máximo de intentos fallidos por IP
  MAX_ATTEMPTS_PER_IP: parseInt(process.env.MAX_ATTEMPTS_PER_IP || "10", 10),
  
  // Máximo de intentos fallidos por cuenta
  MAX_ATTEMPTS_PER_ACCOUNT: parseInt(process.env.MAX_ATTEMPTS_PER_ACCOUNT || "5", 10),
  
  // Duración del bloqueo (minutos)
  LOCKOUT_DURATION_MINUTES: parseInt(process.env.LOCKOUT_DURATION_MINUTES || "30", 10),
  
  // Ventana de tiempo para contar intentos (minutos)
  ATTEMPT_WINDOW_MINUTES: parseInt(process.env.ATTEMPT_WINDOW_MINUTES || "15", 10),
};

// Crear tabla si no existe
try {
  dbUsers.exec(`
    CREATE TABLE IF NOT EXISTS brute_force_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier TEXT NOT NULL,
      attempts INTEGER DEFAULT 1,
      locked_until TEXT,
      first_attempt_at TEXT DEFAULT (datetime('now')),
      last_attempt_at TEXT DEFAULT (datetime('now')),
      UNIQUE(identifier)
    );
    
    CREATE INDEX IF NOT EXISTS idx_brute_force_identifier ON brute_force_attempts(identifier);
    CREATE INDEX IF NOT EXISTS idx_brute_force_locked_until ON brute_force_attempts(locked_until);
  `);
} catch (err) {
  // Tabla ya existe o error
}

/**
 * Registra un intento fallido
 */
export async function recordFailedAttempt(identifier) {
  const windowStart = new Date(Date.now() - CONFIG.ATTEMPT_WINDOW_MINUTES * 60 * 1000).toISOString();
  
  // Limpiar intentos fuera de la ventana
  dbUsers.prepare(`
    DELETE FROM brute_force_attempts
    WHERE last_attempt_at < ?
  `).run(windowStart);
  
  // Obtener intentos actuales
  const existing = dbUsers.prepare(`
    SELECT * FROM brute_force_attempts WHERE identifier = ?
  `).get(identifier);
  
  if (!existing) {
    // Primer intento
    dbUsers.prepare(`
      INSERT INTO brute_force_attempts (identifier, attempts, first_attempt_at, last_attempt_at)
      VALUES (?, 1, datetime('now'), datetime('now'))
    `).run(identifier);
    return { locked: false, attempts: 1 };
  }
  
  // Verificar si está bloqueado
  if (existing.locked_until) {
    const lockedUntil = new Date(existing.locked_until);
    const now = new Date();
    if (lockedUntil > now) {
      const minutesLeft = Math.ceil((lockedUntil - now) / 1000 / 60);
      return {
        locked: true,
        attempts: existing.attempts,
        minutesLeft,
        message: `Demasiados intentos fallidos. Intenta nuevamente en ${minutesLeft} minuto(s).`
      };
    }
    // El bloqueo expiró, resetear
    dbUsers.prepare(`
      UPDATE brute_force_attempts
      SET attempts = 1, locked_until = NULL, first_attempt_at = datetime('now'), last_attempt_at = datetime('now')
      WHERE identifier = ?
    `).run(identifier);
    return { locked: false, attempts: 1 };
  }
  
  // Incrementar intentos
  const newAttempts = existing.attempts + 1;
  const maxAttempts = identifier.startsWith("ip:") 
    ? CONFIG.MAX_ATTEMPTS_PER_IP 
    : CONFIG.MAX_ATTEMPTS_PER_ACCOUNT;
  
  let lockedUntil = null;
  if (newAttempts >= maxAttempts) {
    lockedUntil = new Date(Date.now() + CONFIG.LOCKOUT_DURATION_MINUTES * 60 * 1000).toISOString();
    
    // Bloquear también la IP en el sistema anti-VPN
    if (identifier.startsWith("ip:")) {
      const ip = identifier.replace("ip:", "");
      try {
        dbUsers.prepare(`
          INSERT INTO blocked_ips (ip, reason, blocked_until)
          VALUES (?, ?, ?)
          ON CONFLICT(ip) DO UPDATE SET
            reason = excluded.reason,
            blocked_until = excluded.blocked_until
        `).run(ip, "Demasiados intentos fallidos de autenticación", lockedUntil);
        
        // Notificar a administradores
        try {
          await notifyAdminsSecurityEvent("BRUTE_FORCE_LOCKED", {
            ip,
            identifier,
            attempts: newAttempts
          }, null);
        } catch (notifyErr) {
          // Silenciar errores
        }
      } catch (err) {
        // Silenciar errores
      }
    }
  }
  
  dbUsers.prepare(`
    UPDATE brute_force_attempts
    SET attempts = ?, locked_until = ?, last_attempt_at = datetime('now')
    WHERE identifier = ?
  `).run(newAttempts, lockedUntil, identifier);
  
  if (lockedUntil) {
    return {
      locked: true,
      attempts: newAttempts,
      minutesLeft: CONFIG.LOCKOUT_DURATION_MINUTES,
      message: `Demasiados intentos fallidos. Bloqueado por ${CONFIG.LOCKOUT_DURATION_MINUTES} minutos.`
    };
  }
  
  return { locked: false, attempts: newAttempts, remaining: maxAttempts - newAttempts };
}

/**
 * Limpia intentos exitosos
 * También limpia locked_until para asegurar que se desbloquee completamente
 * Busca y elimina todas las variantes posibles del identificador
 */
export function clearAttempts(identifier) {
  try {
    if (!identifier) return false;
    
    // Primero actualizar locked_until a NULL para desbloquear
    const updated = dbUsers.prepare(`
      UPDATE brute_force_attempts 
      SET locked_until = NULL, attempts = 0
      WHERE identifier = ?
    `).run(identifier);
    
    // Luego eliminar completamente el registro
    const deleted = dbUsers.prepare(`
      DELETE FROM brute_force_attempts WHERE identifier = ?
    `).run(identifier);
    
    // Si es account:xxx, también limpiar variantes
    if (identifier.startsWith("account:")) {
      const accountId = identifier.replace("account:", "");
      // Limpiar sin prefijo
      dbUsers.prepare(`
        UPDATE brute_force_attempts 
        SET locked_until = NULL, attempts = 0
        WHERE identifier = ?
      `).run(accountId);
      dbUsers.prepare(`
        DELETE FROM brute_force_attempts WHERE identifier = ?
      `).run(accountId);
      
      // Si es un teléfono, limpiar también la versión normalizada
      if (/^\d+$/.test(accountId)) {
        // Ya está normalizado, pero intentar también con account: por si acaso
        dbUsers.prepare(`
          DELETE FROM brute_force_attempts 
          WHERE identifier = ? OR identifier LIKE ?
        `).run(accountId, `account:${accountId}%`);
      }
    }
    
    const totalDeleted = deleted.changes + (updated.changes > 0 ? 1 : 0);
    if (totalDeleted > 0) {
      console.log(`✅ clearAttempts: ${identifier} eliminado (${totalDeleted} registros)`);
    }
    return totalDeleted > 0;
  } catch (err) {
    console.error("Error en clearAttempts:", err);
    return false;
  }
}

/**
 * Verifica si está bloqueado
 */
export function checkBruteForceLock(identifier) {
  const windowStart = new Date(Date.now() - CONFIG.ATTEMPT_WINDOW_MINUTES * 60 * 1000).toISOString();
  
  const attempt = dbUsers.prepare(`
    SELECT * FROM brute_force_attempts
    WHERE identifier = ? AND last_attempt_at >= ?
  `).get(identifier, windowStart);
  
  if (!attempt) return { locked: false };
  
  if (attempt.locked_until) {
    const lockedUntil = new Date(attempt.locked_until);
    const now = new Date();
    if (lockedUntil > now) {
      const minutesLeft = Math.ceil((lockedUntil - now) / 1000 / 60);
      return {
        locked: true,
        minutesLeft,
        attempts: attempt.attempts
      };
    }
  }
  
  return { locked: false, attempts: attempt.attempts };
}

/**
 * Middleware de protección contra fuerza bruta
 */
export function bruteForceProtection(req, res, next) {
  // Crear identificador (IP o cuenta)
  const ip = getClientIP(req);
  const account = req.body?.phone || req.body?.username || null;
  
  const identifiers = [`ip:${ip}`];
  if (account) {
    identifiers.push(`account:${account}`);
  }
  
  // Verificar si alguno está bloqueado
  for (const identifier of identifiers) {
    const check = checkBruteForceLock(identifier);
    if (check.locked) {
      return res.status(429).json({
        error: "Demasiados intentos",
        message: `Demasiados intentos fallidos. Intenta nuevamente en ${check.minutesLeft} minuto(s).`,
        retryAfter: check.minutesLeft * 60
      });
    }
  }
  
  // Guardar identificadores en request para uso posterior
  req.bruteForceIdentifiers = identifiers;
  
  next();
}

/**
 * Middleware para registrar éxito (limpiar intentos)
 */
export function recordSuccess(req, res, next) {
  if (req.bruteForceIdentifiers) {
    req.bruteForceIdentifiers.forEach(identifier => {
      clearAttempts(identifier);
    });
  }
  next();
}

export default { recordFailedAttempt, clearAttempts, checkBruteForceLock, bruteForceProtection, recordSuccess };



