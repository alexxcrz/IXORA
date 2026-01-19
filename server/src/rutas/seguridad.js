// 🔒 Rutas administrativas de seguridad - Gestionar IPs bloqueadas, ver estadísticas, etc.
import express from "express";
import { authRequired, permit } from "../middleware/autenticacion.js";
import { unblockIP, getSecurityStats, getClientIP } from "../middleware/antiVPN.js";
import { clearAttempts, checkBruteForceLock } from "../middleware/bruteForce.js";
import { dbUsers } from "../config/baseDeDatos.js";

const router = express.Router();

// Todas las rutas requieren autenticación y permisos de administrador
router.use(authRequired);
router.use(permit("tab:admin"));

/**
 * GET /api/seguridad/stats
 * Obtiene estadísticas de seguridad
 */
router.get("/stats", (req, res) => {
  try {
    const stats = getSecurityStats();
    res.json(stats);
  } catch (err) {
    console.error("Error obteniendo estadísticas:", err);
    res.status(500).json({ error: "Error obteniendo estadísticas" });
  }
});

/**
 * GET /api/seguridad/blocked-ips
 * Lista todas las IPs bloqueadas
 */
router.get("/blocked-ips", (req, res) => {
  try {
    const blocked = dbUsers.prepare(`
      SELECT ip, reason, blocked_at, blocked_until, attempts
      FROM blocked_ips
      ORDER BY blocked_at DESC
    `).all();
    
    res.json(blocked);
  } catch (err) {
    console.error("Error listando IPs bloqueadas:", err);
    res.status(500).json({ error: "Error listando IPs bloqueadas" });
  }
});

/**
 * DELETE /api/seguridad/blocked-ips/:ip
 * Desbloquea una IP
 */
router.delete("/blocked-ips/:ip", (req, res) => {
  try {
    const { ip } = req.params;
    const success = unblockIP(ip);
    
    if (success) {
      res.json({ ok: true, message: `IP ${ip} desbloqueada` });
    } else {
      res.status(500).json({ error: "Error desbloqueando IP" });
    }
  } catch (err) {
    console.error("Error desbloqueando IP:", err);
    res.status(500).json({ error: "Error desbloqueando IP" });
  }
});

/**
 * GET /api/seguridad/events
 * Lista eventos de seguridad recientes
 */
router.get("/events", (req, res) => {
  try {
    const limit = parseInt(req.query.limit || "100", 10);
    const events = dbUsers.prepare(`
      SELECT id, ip, event_type, details, user_id, created_at
      FROM security_events
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
    
    res.json(events.map(event => ({
      ...event,
      details: JSON.parse(event.details || "{}")
    })));
  } catch (err) {
    console.error("Error listando eventos:", err);
    res.status(500).json({ error: "Error listando eventos" });
  }
});

/**
 * POST /api/seguridad/block-ip
 * Bloquea manualmente una IP
 */
router.post("/block-ip", (req, res) => {
  try {
    const { ip, reason, durationMinutes } = req.body;
    
    if (!ip) {
      return res.status(400).json({ error: "IP requerida" });
    }
    
    const blockedUntil = durationMinutes 
      ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
      : null;
    
    dbUsers.prepare(`
      INSERT INTO blocked_ips (ip, reason, blocked_until, attempts)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(ip) DO UPDATE SET
        reason = excluded.reason,
        blocked_until = excluded.blocked_until,
        attempts = attempts + 1
    `).run(ip, reason || "Bloqueo manual", blockedUntil);
    
    res.json({ ok: true, message: `IP ${ip} bloqueada` });
  } catch (err) {
    console.error("Error bloqueando IP:", err);
    res.status(500).json({ error: "Error bloqueando IP" });
  }
});

/**
 * GET /api/seguridad/my-ip
 * Obtiene la IP actual del cliente
 */
router.get("/my-ip", (req, res) => {
  const ip = getClientIP(req);
  res.json({ ip });
});

/**
 * GET /api/seguridad/brute-force-attempts
 * Lista todos los intentos fallidos de brute force
 * Incluye tanto brute_force_attempts como login_attempts
 * Muestra información del usuario cuando es posible
 */
router.get("/brute-force-attempts", (req, res) => {
  try {
    // Obtener bloqueos de brute_force_attempts
    // Mostrar todos los que tienen bloqueo activo O que tienen 3+ intentos (riesgo)
    const bruteForceAttempts = dbUsers.prepare(`
      SELECT 
        identifier,
        attempts,
        locked_until,
        first_attempt_at,
        last_attempt_at,
        CASE 
          WHEN locked_until IS NOT NULL AND datetime(locked_until) > datetime('now') 
          THEN CAST((julianday(locked_until) - julianday('now')) * 24 * 60 AS INTEGER)
          ELSE NULL
        END AS minutes_left,
        'brute_force' AS source
      FROM brute_force_attempts
      WHERE (locked_until IS NOT NULL AND datetime(locked_until) > datetime('now'))
         OR attempts >= 3
         OR datetime(last_attempt_at, '+15 minutes') > datetime('now')
      ORDER BY 
        CASE WHEN locked_until IS NOT NULL AND datetime(locked_until) > datetime('now') THEN 0 ELSE 1 END,
        attempts DESC,
        last_attempt_at DESC
    `).all();
    
    // Obtener bloqueos de login_attempts (sistema de login tradicional)
    let loginAttempts = [];
    try {
      // Verificar primero si la tabla existe y qué columnas tiene
      const tableInfo = dbUsers.prepare(`PRAGMA table_info(login_attempts)`).all();
      if (tableInfo.length > 0) {
        // La tabla existe, consultar con las columnas correctas
        // login_attempts tiene: identifier, ip_address, attempts, last_attempt, locked_until
        loginAttempts = dbUsers.prepare(`
          SELECT 
            identifier,
            attempts,
            locked_until,
            ip_address,
            last_attempt AS last_attempt_at,
            last_attempt AS first_attempt_at,
            CASE 
              WHEN locked_until IS NOT NULL AND datetime(locked_until) > datetime('now') 
              THEN CAST((julianday(locked_until) - julianday('now')) * 24 * 60 AS INTEGER)
              ELSE NULL
            END AS minutes_left,
            'login_attempts' AS source
          FROM login_attempts
          WHERE (locked_until IS NOT NULL AND datetime(locked_until) > datetime('now'))
             OR attempts >= 3
             OR datetime(last_attempt, '+15 minutes') > datetime('now')
          ORDER BY 
            CASE WHEN locked_until IS NOT NULL AND datetime(locked_until) > datetime('now') THEN 0 ELSE 1 END,
            attempts DESC,
            last_attempt DESC
        `).all();
      }
    } catch (err) {
      // Si la tabla no existe o hay error, continuar sin error
      console.debug("Tabla login_attempts no existe o error al consultar:", err.message);
    }
    
    // Función helper para obtener información del usuario
    const getUserInfo = (identifier) => {
      try {
        if (identifier?.startsWith("account:")) {
          const accountId = identifier.replace("account:", "");
          
          // Intentar buscar por teléfono (formato numérico)
          if (/^\d+$/.test(accountId)) {
            const user = dbUsers.prepare(`
              SELECT id, name, phone, username, active
              FROM users
              WHERE phone = ?
            `).get(accountId);
            
            if (user) {
              return {
                userId: user.id,
                userName: user.name || user.username || "Sin nombre",
                userPhone: user.phone,
                userUsername: user.username || null,
                userActive: user.active
              };
            }
          }
          
          // Intentar buscar por username
          const user = dbUsers.prepare(`
            SELECT id, name, phone, username, active
            FROM users
            WHERE username = ? OR LOWER(username) = LOWER(?)
          `).get(accountId, accountId);
          
          if (user) {
            return {
              userId: user.id,
              userName: user.name || user.username || "Sin nombre",
              userPhone: user.phone,
              userUsername: user.username || null,
              userActive: user.active
            };
          }
        }
      } catch (err) {
        console.debug("Error obteniendo info de usuario:", err.message);
      }
      return null;
    };
    
    // Combinar ambos resultados y enriquecer con información del usuario
    const allAttempts = [
      ...bruteForceAttempts.map(a => {
        const userInfo = getUserInfo(a.identifier);
        return {
          ...a,
          identifier: a.identifier,
          tipo: a.identifier?.startsWith("account:") ? "Cuenta" : a.identifier?.startsWith("ip:") ? "IP" : "Desconocido",
          ...(userInfo || {}),
          displayName: userInfo 
            ? `${userInfo.userName} (${userInfo.userPhone || userInfo.userUsername || a.identifier})`
            : a.identifier?.replace("account:", "").replace("ip:", "") || a.identifier
        };
      }),
      ...loginAttempts.map(a => {
        const identifier = `account:${a.identifier}`;
        const userInfo = getUserInfo(identifier);
        return {
          ...a,
          identifier: identifier,
          tipo: "Cuenta",
          ...(userInfo || {}),
          displayName: userInfo 
            ? `${userInfo.userName} (${userInfo.userPhone || userInfo.userUsername || a.identifier})`
            : a.identifier
        };
      })
    ];
    
    res.json(allAttempts);
  } catch (err) {
    console.error("Error listando intentos de brute force:", err);
    res.status(500).json({ error: "Error listando intentos" });
  }
});

/**
 * DELETE /api/seguridad/brute-force-attempts/:identifier
 * Desbloquea una cuenta o IP bloqueada por brute force
 */
router.delete("/brute-force-attempts/:identifier", (req, res) => {
  try {
    const { identifier } = req.params;
    // Decodificar el identificador (puede venir codificado)
    const decodedIdentifier = decodeURIComponent(identifier);
    
    console.log(`🔓 Desbloqueando: ${decodedIdentifier}`);
    
    // Limpiar de brute_force_attempts - intentar todas las variantes posibles
    let bruteForceCleared = false;
    try {
      // Limpiar con el identificador exacto (clearAttempts ya maneja variantes)
      clearAttempts(decodedIdentifier);
      
      // Si es account:xxx, también limpiar variantes adicionales
      if (decodedIdentifier.startsWith("account:")) {
        const accountId = decodedIdentifier.replace("account:", "");
        // Limpiar sin prefijo
        clearAttempts(accountId);
        
        // Si es un teléfono (solo números), normalizar y limpiar
        if (/^\d+$/.test(accountId)) {
          // Ya está normalizado, pero asegurar que se limpie
          clearAttempts(`account:${accountId}`);
        } else {
          // Es un username, limpiar en minúsculas también
          clearAttempts(accountId.toLowerCase());
          clearAttempts(`account:${accountId.toLowerCase()}`);
        }
      }
      
      // Verificar que se limpió - buscar todas las variantes posibles
      let searchPatterns = [decodedIdentifier];
      if (decodedIdentifier.startsWith("account:")) {
        const accountId = decodedIdentifier.replace("account:", "");
        searchPatterns.push(accountId, `account:${accountId}`);
        if (/^\d+$/.test(accountId)) {
          // Es teléfono, ya está normalizado
        } else {
          // Es username, buscar también en minúsculas
          searchPatterns.push(accountId.toLowerCase(), `account:${accountId.toLowerCase()}`);
        }
      }
      
      // Contar registros restantes con todas las variantes
      const placeholders = searchPatterns.map(() => "?").join(",");
      const stillBlocked = dbUsers.prepare(`
        SELECT COUNT(*) as count FROM brute_force_attempts 
        WHERE identifier IN (${placeholders})
      `).get(...searchPatterns);
      
      bruteForceCleared = stillBlocked.count === 0;
      console.log(`✅ brute_force_attempts: ${bruteForceCleared ? 'limpiado completamente' : `aún hay ${stillBlocked.count} registros`}`);
    } catch (err) {
      console.error("Error limpiando brute_force_attempts:", err);
    }
    
    // Limpiar de login_attempts - intentar todas las variantes
    let loginAttemptsCleared = false;
    try {
      if (decodedIdentifier.startsWith("account:")) {
        const accountId = decodedIdentifier.replace("account:", "");
        
        // Normalizar teléfono (solo números)
        const phoneClean = accountId.replace(/\D/g, "");
        const usernameClean = accountId.toLowerCase().trim();
        
        // Intentar con todas las variantes posibles
        const variants = [
          accountId,
          phoneClean,
          usernameClean,
          accountId.toLowerCase(),
          accountId.toUpperCase()
        ];
        
        for (const variant of variants) {
          if (!variant) continue;
          
          // Actualizar locked_until a NULL
          dbUsers.prepare(`
            UPDATE login_attempts 
            SET locked_until = NULL, attempts = 0
            WHERE identifier = ? OR identifier = ? OR identifier = ?
          `).run(variant, phoneClean, usernameClean);
          
          // Eliminar completamente
          dbUsers.prepare(`
            DELETE FROM login_attempts 
            WHERE identifier = ? OR identifier = ? OR identifier = ?
          `).run(variant, phoneClean, usernameClean);
        }
        
        // Verificar que se limpió
        const stillBlocked = dbUsers.prepare(`
          SELECT COUNT(*) as count FROM login_attempts 
          WHERE identifier = ? OR identifier = ? OR identifier = ?
        `).get(accountId, phoneClean, usernameClean);
        
        loginAttemptsCleared = stillBlocked.count === 0;
        console.log(`✅ login_attempts: ${loginAttemptsCleared ? 'limpiado' : 'aún hay registros'}`);
      } else {
        // Para IPs u otros identificadores
        dbUsers.prepare(`
          UPDATE login_attempts 
          SET locked_until = NULL, attempts = 0
          WHERE identifier = ?
        `).run(decodedIdentifier);
        
        const deleted = dbUsers.prepare(`
          DELETE FROM login_attempts WHERE identifier = ?
        `).run(decodedIdentifier);
        
        loginAttemptsCleared = deleted.changes > 0;
      }
    } catch (err) {
      console.error("Error limpiando login_attempts:", err);
    }
    
    // Si es una IP, también desbloquearla de blocked_ips
    if (decodedIdentifier.startsWith("ip:")) {
      const ip = decodedIdentifier.replace("ip:", "");
      const unblocked = unblockIP(ip);
      console.log(`✅ IP desbloqueada de blocked_ips: ${ip} (${unblocked ? 'éxito' : 'fallo'})`);
    }
    
    // Verificación final
    const finalCheckBrute = dbUsers.prepare(`
      SELECT COUNT(*) as count FROM brute_force_attempts 
      WHERE identifier = ? OR identifier LIKE ?
    `).get(
      decodedIdentifier,
      decodedIdentifier.startsWith("account:") ? `account:${decodedIdentifier.replace("account:", "")}%` : `%${decodedIdentifier}%`
    );
    
    const finalCheckLogin = decodedIdentifier.startsWith("account:") 
      ? dbUsers.prepare(`
          SELECT COUNT(*) as count FROM login_attempts 
          WHERE identifier = ? OR identifier = ? OR identifier = ?
        `).get(
          decodedIdentifier.replace("account:", ""),
          decodedIdentifier.replace("account:", "").replace(/\D/g, ""),
          decodedIdentifier.replace("account:", "").toLowerCase()
        )
      : { count: 0 };
    
    const allCleared = finalCheckBrute.count === 0 && finalCheckLogin.count === 0;
    
    if (!allCleared) {
      console.warn(`⚠️ Aún hay bloqueos para ${decodedIdentifier}: brute_force=${finalCheckBrute.count}, login_attempts=${finalCheckLogin.count}`);
    }
    
    res.json({ 
      ok: true, 
      message: allCleared 
        ? `${decodedIdentifier} desbloqueado exitosamente`
        : `${decodedIdentifier} parcialmente desbloqueado (puede requerir reiniciar sesión)`,
      details: {
        bruteForceCleared: finalCheckBrute.count === 0,
        loginAttemptsCleared: finalCheckLogin.count === 0,
        allCleared
      }
    });
  } catch (err) {
    console.error("Error desbloqueando:", err);
    res.status(500).json({ error: "Error desbloqueando", details: err.message });
  }
});

/**
 * POST /api/seguridad/brute-force-attempts/clear-all
 * Limpia todos los intentos fallidos (desbloquea todo)
 */
router.post("/brute-force-attempts/clear-all", (req, res) => {
  try {
    // Limpiar brute_force_attempts
    dbUsers.prepare(`DELETE FROM brute_force_attempts`).run();
    
    // También limpiar login_attempts
    try {
      dbUsers.prepare(`DELETE FROM login_attempts`).run();
    } catch (err) {
      console.debug("Error limpiando login_attempts:", err.message);
    }
    
    res.json({ ok: true, message: "Todos los bloqueos han sido eliminados" });
  } catch (err) {
    console.error("Error limpiando intentos:", err);
    res.status(500).json({ error: "Error limpiando intentos" });
  }
});

/**
 * GET /api/seguridad/blocked-accounts
 * Obtiene cuentas bloqueadas (no IPs)
 */
router.get("/blocked-accounts", (req, res) => {
  try {
    const accounts = dbUsers.prepare(`
      SELECT 
        identifier,
        attempts,
        locked_until,
        first_attempt_at,
        last_attempt_at,
        CASE 
          WHEN locked_until IS NOT NULL AND datetime(locked_until) > datetime('now') 
          THEN CAST((julianday(locked_until) - julianday('now')) * 24 * 60 AS INTEGER)
          ELSE NULL
        END AS minutes_left
      FROM brute_force_attempts
      WHERE identifier LIKE 'account:%'
      ORDER BY last_attempt_at DESC
    `).all();
    
    res.json(accounts);
  } catch (err) {
    console.error("Error listando cuentas bloqueadas:", err);
    res.status(500).json({ error: "Error listando cuentas bloqueadas" });
  }
});

export default router;
















