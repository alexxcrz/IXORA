// 🔒 Middleware Anti-VPN - Sistema de seguridad avanzado
// Detecta y bloquea VPNs, proxies, Tor, y conexiones sospechosas

import { dbUsers } from "../config/baseDeDatos.js";
import { notifyIPBlocked, notifyVPNDetected } from "../utilidades/securityNotifications.js";

// =====================================================
// 🔹 CONFIGURACIÓN
// =====================================================

const CONFIG = {
  // Estrictitud del bloqueo (true = bloquear todo, false = solo registrar)
  BLOCK_VPN: process.env.BLOCK_VPN !== "false",
  BLOCK_PROXY: process.env.BLOCK_PROXY !== "false",
  BLOCK_TOR: process.env.BLOCK_TOR !== "false",
  
  // Timeout para verificaciones API (ms)
  API_TIMEOUT: 5000,
  
  // Cache de verificaciones (minutos)
  CACHE_TTL: 30,
  
  // IPs permitidas (whitelist) - ej: ['192.168.1.1', '10.0.0.1']
  WHITELIST_IPS: (process.env.WHITELIST_IPS || "").split(",").filter(Boolean),
  
  // IPs bloqueadas manualmente (blacklist)
  BLACKLIST_IPS: (process.env.BLACKLIST_IPS || "").split(",").filter(Boolean),
  
  // Permitir localhost/IPs privadas
  ALLOW_PRIVATE_IPS: process.env.ALLOW_PRIVATE_IPS !== "false",
};

// =====================================================
// 🔹 CREAR TABLAS DE BASE DE DATOS
// =====================================================

try {
  dbUsers.exec(`
    CREATE TABLE IF NOT EXISTS ip_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      is_vpn INTEGER DEFAULT 0,
      is_proxy INTEGER DEFAULT 0,
      is_tor INTEGER DEFAULT 0,
      country TEXT,
      isp TEXT,
      checked_at TEXT DEFAULT (datetime('now')),
      UNIQUE(ip)
    );
    
    CREATE TABLE IF NOT EXISTS blocked_ips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL UNIQUE,
      reason TEXT,
      blocked_at TEXT DEFAULT (datetime('now')),
      blocked_until TEXT,
      attempts INTEGER DEFAULT 1
    );
    
    CREATE TABLE IF NOT EXISTS security_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      event_type TEXT NOT NULL,
      details TEXT,
      user_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    
    CREATE INDEX IF NOT EXISTS idx_ip_checks_ip ON ip_checks(ip);
    CREATE INDEX IF NOT EXISTS idx_ip_checks_checked_at ON ip_checks(checked_at);
    CREATE INDEX IF NOT EXISTS idx_blocked_ips_ip ON blocked_ips(ip);
    CREATE INDEX IF NOT EXISTS idx_security_events_ip ON security_events(ip);
    CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at);
  `);
} catch (err) {
  console.error("❌ Error creando tablas anti-VPN:", err);
}

// =====================================================
// 🔹 HELPERS DE UTILIDAD
// =====================================================

/**
 * Obtiene la IP real del cliente considerando proxies y load balancers
 */
export function getClientIP(req) {
  // Prioridad: x-forwarded-for (primera IP), x-real-ip, conexión directa
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = forwarded.split(",").map(ip => ip.trim());
    return ips[0] || "unknown";
  }
  
  return req.headers["x-real-ip"] || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress || 
         req.ip ||
         "unknown";
}

/**
 * Verifica si una IP es privada/localhost
 */
function isPrivateIP(ip) {
  if (!ip || ip === "unknown" || ip === "::1" || ip === "::ffff:127.0.0.1") {
    return true;
  }
  
  // IPv4 privadas
  if (ip.startsWith("127.") || 
      ip.startsWith("192.168.") || 
      ip.startsWith("10.") ||
      ip.startsWith("172.16.") || ip.startsWith("172.17.") ||
      ip.startsWith("172.18.") || ip.startsWith("172.19.") ||
      ip.startsWith("172.20.") || ip.startsWith("172.21.") ||
      ip.startsWith("172.22.") || ip.startsWith("172.23.") ||
      ip.startsWith("172.24.") || ip.startsWith("172.25.") ||
      ip.startsWith("172.26.") || ip.startsWith("172.27.") ||
      ip.startsWith("172.28.") || ip.startsWith("172.29.") ||
      ip.startsWith("172.30.") || ip.startsWith("172.31.")) {
    return true;
  }
  
  // IPv6 local
  if (ip.startsWith("fe80:") || ip.startsWith("fc00:") || ip.startsWith("fd00:")) {
    return true;
  }
  
  return false;
}

/**
 * Verifica si una IP está bloqueada
 */
function isIPBlocked(ip) {
  const blocked = dbUsers.prepare(`
    SELECT * FROM blocked_ips WHERE ip = ?
  `).get(ip);
  
  if (!blocked) return false;
  
  // Si tiene fecha de bloqueo temporal, verificar si ya expiró
  if (blocked.blocked_until) {
    const blockedUntil = new Date(blocked.blocked_until);
    const now = new Date();
    if (now > blockedUntil) {
      // Desbloquear automáticamente
      dbUsers.prepare(`DELETE FROM blocked_ips WHERE ip = ?`).run(ip);
      return false;
    }
  }
  
  return true;
}

/**
 * Verifica si una IP está en cache reciente
 */
function getCachedCheck(ip) {
  const cached = dbUsers.prepare(`
    SELECT * FROM ip_checks 
    WHERE ip = ? 
    AND datetime(checked_at, '+' || ? || ' minutes') > datetime('now')
  `).get(ip, CONFIG.CACHE_TTL);
  
  return cached || null;
}

/**
 * Guarda resultado de verificación en cache
 */
function cacheIPCheck(ip, result) {
  try {
    dbUsers.prepare(`
      INSERT INTO ip_checks (ip, is_vpn, is_proxy, is_tor, country, isp, checked_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(ip) DO UPDATE SET
        is_vpn = excluded.is_vpn,
        is_proxy = excluded.is_proxy,
        is_tor = excluded.is_tor,
        country = excluded.country,
        isp = excluded.isp,
        checked_at = datetime('now')
    `).run(
      ip,
      result.is_vpn ? 1 : 0,
      result.is_proxy ? 1 : 0,
      result.is_tor ? 1 : 0,
      result.country || null,
      result.isp || null
    );
  } catch (err) {
    console.error("Error guardando cache IP:", err);
  }
}

/**
 * Registra evento de seguridad
 */
function logSecurityEvent(ip, eventType, details = {}, userId = null) {
  try {
    dbUsers.prepare(`
      INSERT INTO security_events (ip, event_type, details, user_id)
      VALUES (?, ?, ?, ?)
    `).run(ip, eventType, JSON.stringify(details), userId);
  } catch (err) {
    console.error("Error registrando evento de seguridad:", err);
  }
}

/**
 * Bloquea una IP
 */
async function blockIP(ip, reason, durationMinutes = null) {
  try {
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
    `).run(ip, reason, blockedUntil);
    
    console.warn(`🚫 IP bloqueada: ${ip} - Razón: ${reason}`);
    
    // Notificar a administradores
    try {
      await notifyIPBlocked(ip, reason, { durationMinutes, blockedUntil });
    } catch (notifyErr) {
      // Silenciar errores de notificación
    }
  } catch (err) {
    console.error("Error bloqueando IP:", err);
  }
}

// =====================================================
// 🔹 DETECCIÓN DE VPN/PROXY/TOR
// =====================================================

/**
 * Detecta VPN usando múltiples técnicas
 */
async function detectVPN(ip) {
  // 1. Verificar cache primero
  const cached = getCachedCheck(ip);
  if (cached) {
    return {
      is_vpn: cached.is_vpn === 1,
      is_proxy: cached.is_proxy === 1,
      is_tor: cached.is_tor === 1,
      country: cached.country,
      isp: cached.isp,
      cached: true
    };
  }
  
  const result = {
    is_vpn: false,
    is_proxy: false,
    is_tor: false,
    country: null,
    isp: null,
    cached: false
  };
  
  try {
    // API gratuita 1: ip-api.com (sin key, rate limit: 45 req/min)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);
      
      const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,isp,proxy,hosting`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === "success") {
          result.country = data.country;
          result.isp = data.isp;
          
          // Detectar hosting/VPS (sospechoso de VPN)
          if (data.hosting === true) {
            result.is_vpn = true;
          }
          
          // Detectar proxy
          if (data.proxy === true) {
            result.is_proxy = true;
          }
        }
      }
    } catch (err) {
      // Silenciar errores de timeout/red
      if (err.name !== "AbortError") {
        console.debug(`Error verificando con ip-api.com: ${err.message}`);
      }
    }
    
    // API gratuita 2: ipwho.is (sin key)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);
      
      const response = await fetch(`https://ipwho.is/${ip}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          result.country = result.country || data.country;
          result.isp = result.isp || data.org;
          
          // Verificar si es conexión anónima
          if (data.connection?.type === "hosting" || data.connection?.type === "business") {
            result.is_vpn = true;
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.debug(`Error verificando con ipwho.is: ${err.message}`);
      }
    }
    
    // Detección heurística: ISPs conocidos de VPN
    if (result.isp) {
      const vpnKeywords = [
        "vpn", "proxy", "hosting", "datacenter", "server", "cloud",
        "nordvpn", "expressvpn", "surfshark", "cyberghost", "hotspot shield",
        "private internet access", "pia", "tunnelbear", "vyprvpn",
        "windscribe", "protonvpn", "purevpn", "ipvanish", "hidemyass",
        "digitalocean", "aws", "azure", "google cloud", "vultr",
        "linode", "hetzner", "ovh", "contabo", "scaleway"
      ];
      
      const ispLower = result.isp.toLowerCase();
      if (vpnKeywords.some(keyword => ispLower.includes(keyword))) {
        result.is_vpn = true;
      }
    }
    
    // Guardar en cache
    cacheIPCheck(ip, result);
    
  } catch (err) {
    console.error("Error en detección VPN:", err);
  }
  
  return result;
}

/**
 * Detecta conexiones Tor
 */
async function detectTor(ip) {
  try {
    // Lista de nodos de salida de Tor (actualizada periódicamente)
    // En producción, deberías usar la API oficial de Tor: https://check.torproject.org/exit-addresses
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(`https://check.torproject.org/cgi-bin/TorBulkExitList.py?ip=${ip}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const text = await response.text();
      const lines = text.split("\n");
      return lines.some(line => line.trim() === ip);
    }
  } catch (err) {
    // Silenciar errores
    if (err.name !== "AbortError") {
      console.debug(`Error verificando Tor: ${err.message}`);
    }
  }
  
  return false;
}

/**
 * Detecta proxies mediante análisis de headers
 */
function detectProxyFromHeaders(req) {
  const suspiciousHeaders = [
    "x-forwarded-for",
    "x-real-ip",
    "via",
    "x-proxy-id",
    "x-proxy-agent",
    "forwarded",
    "client-ip",
    "cf-connecting-ip" // Cloudflare (legítimo en muchos casos)
  ];
  
  let proxyScore = 0;
  const foundHeaders = [];
  
  for (const header of suspiciousHeaders) {
    if (req.headers[header.toLowerCase()]) {
      foundHeaders.push(header);
      proxyScore++;
    }
  }
  
  // Si hay muchos headers de proxy, es sospechoso
  // Cloudflare es una excepción común
  const hasCloudflare = req.headers["cf-connecting-ip"] || req.headers["cf-ray"];
  if (hasCloudflare && proxyScore === 1) {
    return false; // Probablemente Cloudflare legítimo
  }
  
  return proxyScore >= 2;
}

// =====================================================
// 🔹 MIDDLEWARE PRINCIPAL
// =====================================================

/**
 * Middleware anti-VPN - Verifica y bloquea conexiones sospechosas
 */
export async function antiVPNMiddleware(req, res, next) {
  const ip = getClientIP(req);
  const userId = req.user?.id || null;
  
  // 1. Verificar whitelist
  if (CONFIG.WHITELIST_IPS.includes(ip)) {
    return next();
  }
  
  // 2. Verificar blacklist
  if (CONFIG.BLACKLIST_IPS.includes(ip)) {
    logSecurityEvent(ip, "BLOCKED_BLACKLIST", { path: req.path }, userId);
    return res.status(403).json({
      error: "Acceso denegado",
      message: "Tu IP está bloqueada"
    });
  }
  
  // 3. Verificar IPs bloqueadas en BD
  if (isIPBlocked(ip)) {
    const blocked = dbUsers.prepare(`SELECT reason FROM blocked_ips WHERE ip = ?`).get(ip);
    logSecurityEvent(ip, "BLOCKED_CACHED", { reason: blocked?.reason }, userId);
    return res.status(403).json({
      error: "Acceso denegado",
      message: blocked?.reason || "Tu IP está bloqueada temporalmente"
    });
  }
  
  // 4. Permitir IPs privadas si está configurado
  if (CONFIG.ALLOW_PRIVATE_IPS && isPrivateIP(ip)) {
    return next();
  }
  
  // 5. Detectar proxy por headers (rápido)
  const isProxyFromHeaders = detectProxyFromHeaders(req);
  if (isProxyFromHeaders && CONFIG.BLOCK_PROXY) {
    logSecurityEvent(ip, "PROXY_DETECTED_HEADERS", { headers: Object.keys(req.headers) }, userId);
    
    if (CONFIG.BLOCK_PROXY) {
      blockIP(ip, "Proxy detectado (headers)", 60); // Bloqueo de 1 hora
      return res.status(403).json({
        error: "Acceso denegado",
        message: "Las conexiones mediante proxy no están permitidas"
      });
    }
  }
  
  // 6. Verificación asíncrona de VPN/Proxy/Tor (no bloquea el request inmediatamente)
  // Ejecutar en background para no ralentizar
  (async () => {
    try {
      // Detectar Tor
      const isTor = await detectTor(ip);
      if (isTor) {
        logSecurityEvent(ip, "TOR_DETECTED", {}, userId);
        if (CONFIG.BLOCK_TOR) {
          blockIP(ip, "Conexión Tor detectada", 1440); // Bloqueo de 24 horas
        }
      }
      
      // Detectar VPN/Proxy
      const vpnResult = await detectVPN(ip);
      if (vpnResult.is_vpn || vpnResult.is_proxy) {
        const reason = vpnResult.is_vpn ? "VPN detectada" : "Proxy detectado";
        const eventType = vpnResult.is_vpn ? "VPN_DETECTED" : "PROXY_DETECTED";
        
        logSecurityEvent(ip, eventType, {
          country: vpnResult.country,
          isp: vpnResult.isp
        }, userId);
        
        // Notificar a administradores
        try {
          await notifyVPNDetected(ip, vpnResult.is_vpn ? "vpn" : "proxy", {
            country: vpnResult.country,
            isp: vpnResult.isp
          });
        } catch (notifyErr) {
          // Silenciar errores
        }
        
        if ((vpnResult.is_vpn && CONFIG.BLOCK_VPN) || (vpnResult.is_proxy && CONFIG.BLOCK_PROXY)) {
          await blockIP(ip, reason, 1440); // Bloqueo de 24 horas
        }
      }
      
      // Notificar Tor
      if (isTor) {
        try {
          await notifyVPNDetected(ip, "tor", {});
        } catch (notifyErr) {
          // Silenciar errores
        }
      }
    } catch (err) {
      console.error("Error en verificación anti-VPN:", err);
    }
  })();
  
  // Continuar con el request (verificación asíncrona)
  next();
}

/**
 * Middleware anti-VPN estricto - Bloquea inmediatamente
 * Usar solo en rutas críticas (login, registro, etc.)
 */
export async function strictAntiVPNMiddleware(req, res, next) {
  const ip = getClientIP(req);
  const userId = req.user?.id || null;
  
  // 1. Verificar whitelist
  if (CONFIG.WHITELIST_IPS.includes(ip)) {
    return next();
  }
  
  // 2. Verificar blacklist
  if (CONFIG.BLACKLIST_IPS.includes(ip)) {
    logSecurityEvent(ip, "BLOCKED_BLACKLIST", { path: req.path }, userId);
    return res.status(403).json({
      error: "Acceso denegado",
      message: "Tu IP está bloqueada"
    });
  }
  
  // 3. Verificar IPs bloqueadas
  if (isIPBlocked(ip)) {
    const blocked = dbUsers.prepare(`SELECT reason FROM blocked_ips WHERE ip = ?`).get(ip);
    logSecurityEvent(ip, "BLOCKED_CACHED", { reason: blocked?.reason }, userId);
    return res.status(403).json({
      error: "Acceso denegado",
      message: blocked?.reason || "Tu IP está bloqueada temporalmente"
    });
  }
  
  // 4. Permitir IPs privadas
  if (CONFIG.ALLOW_PRIVATE_IPS && isPrivateIP(ip)) {
    return next();
  }
  
  // 5. Detectar proxy por headers
  const isProxyFromHeaders = detectProxyFromHeaders(req);
  if (isProxyFromHeaders && CONFIG.BLOCK_PROXY) {
    logSecurityEvent(ip, "PROXY_DETECTED_HEADERS", {}, userId);
    blockIP(ip, "Proxy detectado", 60);
    return res.status(403).json({
      error: "Acceso denegado",
      message: "Las conexiones mediante proxy no están permitidas"
    });
  }
  
  // 6. Verificar VPN/Proxy de forma síncrona (más lento pero seguro)
  try {
    const vpnResult = await detectVPN(ip);
    const isTor = await detectTor(ip);
    
    if (isTor && CONFIG.BLOCK_TOR) {
      logSecurityEvent(ip, "TOR_DETECTED", {}, userId);
      
      // Notificar
      try {
        await notifyVPNDetected(ip, "tor", {});
      } catch (notifyErr) {}
      
      await blockIP(ip, "Conexión Tor detectada", 1440);
      return res.status(403).json({
        error: "Acceso denegado",
        message: "Las conexiones mediante Tor no están permitidas"
      });
    }
    
    if (vpnResult.is_vpn && CONFIG.BLOCK_VPN) {
      logSecurityEvent(ip, "VPN_DETECTED", {
        country: vpnResult.country,
        isp: vpnResult.isp
      }, userId);
      
      // Notificar
      try {
        await notifyVPNDetected(ip, "vpn", {
          country: vpnResult.country,
          isp: vpnResult.isp
        });
      } catch (notifyErr) {}
      
      await blockIP(ip, "VPN detectada", 1440);
      return res.status(403).json({
        error: "Acceso denegado",
        message: "Las conexiones mediante VPN no están permitidas"
      });
    }
    
    if (vpnResult.is_proxy && CONFIG.BLOCK_PROXY) {
      logSecurityEvent(ip, "PROXY_DETECTED", {
        country: vpnResult.country,
        isp: vpnResult.isp
      }, userId);
      
      // Notificar
      try {
        await notifyVPNDetected(ip, "proxy", {
          country: vpnResult.country,
          isp: vpnResult.isp
        });
      } catch (notifyErr) {}
      
      await blockIP(ip, "Proxy detectado", 1440);
      return res.status(403).json({
        error: "Acceso denegado",
        message: "Las conexiones mediante proxy no están permitidas"
      });
    }
  } catch (err) {
    console.error("Error en verificación estricta anti-VPN:", err);
    // En caso de error, permitir acceso pero registrar
    logSecurityEvent(ip, "ANTIVPN_ERROR", { error: err.message }, userId);
  }
  
  next();
}

// =====================================================
// 🔹 UTILIDADES PARA ADMINISTRADORES
// =====================================================

/**
 * Desbloquea una IP
 */
export function unblockIP(ip) {
  try {
    dbUsers.prepare(`DELETE FROM blocked_ips WHERE ip = ?`).run(ip);
    return true;
  } catch (err) {
    console.error("Error desbloqueando IP:", err);
    return false;
  }
}

/**
 * Obtiene estadísticas de seguridad
 */
export function getSecurityStats() {
  try {
    const stats = {
      totalBlocked: dbUsers.prepare(`SELECT COUNT(*) as count FROM blocked_ips`).get().count,
      totalChecks: dbUsers.prepare(`SELECT COUNT(*) as count FROM ip_checks`).get().count,
      recentEvents: dbUsers.prepare(`
        SELECT * FROM security_events 
        ORDER BY created_at DESC 
        LIMIT 100
      `).all(),
      topBlocked: dbUsers.prepare(`
        SELECT ip, reason, attempts, blocked_at 
        FROM blocked_ips 
        ORDER BY attempts DESC 
        LIMIT 20
      `).all()
    };
    return stats;
  } catch (err) {
    console.error("Error obteniendo estadísticas:", err);
    return null;
  }
}

export default antiVPNMiddleware;
















