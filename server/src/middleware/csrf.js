// 🔒 Protección CSRF (Cross-Site Request Forgery)
import crypto from "crypto";
import { dbUsers } from "../config/baseDeDatos.js";

// Crear tabla para tokens CSRF si no existe
try {
  dbUsers.exec(`
    CREATE TABLE IF NOT EXISTS csrf_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      user_id INTEGER,
      session_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_csrf_tokens_token ON csrf_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_csrf_tokens_expires_at ON csrf_tokens(expires_at);
  `);
} catch (err) {
  console.error("Error creando tabla csrf_tokens:", err);
}

// Tiempo de expiración de tokens CSRF (2 horas)
const CSRF_TOKEN_TTL = 2 * 60 * 60 * 1000;

/**
 * Genera un token CSRF
 */
export function generateCSRFToken(userId = null, sessionId = null) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + CSRF_TOKEN_TTL).toISOString();
  
  try {
    dbUsers.prepare(`
      INSERT INTO csrf_tokens (token, user_id, session_id, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(token, userId, sessionId, expiresAt);
  } catch (err) {
    console.error("Error guardando token CSRF:", err);
    return null;
  }
  
  return token;
}

/**
 * Valida un token CSRF
 */
export function validateCSRFToken(token, userId = null) {
  if (!token) return false;
  
  // Limpiar tokens expirados
  dbUsers.prepare(`
    DELETE FROM csrf_tokens WHERE expires_at < datetime('now')
  `).run();
  
  // Verificar token
  const tokenRecord = dbUsers.prepare(`
    SELECT * FROM csrf_tokens 
    WHERE token = ? AND expires_at > datetime('now')
  `).get(token);
  
  if (!tokenRecord) return false;
  
  // Si hay userId, verificar que coincida
  if (userId && tokenRecord.user_id && tokenRecord.user_id !== userId) {
    return false;
  }
  
  // Eliminar token usado (one-time use)
  dbUsers.prepare(`DELETE FROM csrf_tokens WHERE token = ?`).run(token);
  
  return true;
}

/**
 * Middleware CSRF para rutas protegidas
 */
export function csrfProtection(req, res, next) {
  // Solo aplicar a métodos que modifican datos
  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  if (safeMethods.includes(req.method)) {
    return next();
  }
  
  // Obtener token del header o del body
  const token = req.headers["x-csrf-token"] || req.body?.csrf_token;
  const userId = req.user?.id || null;
  
  if (!token || !validateCSRFToken(token, userId)) {
    return res.status(403).json({
      error: "Token CSRF inválido o faltante",
      message: "Por favor, recarga la página e intenta nuevamente"
    });
  }
  
  next();
}

/**
 * Middleware para generar y exponer token CSRF
 */
export function csrfTokenGenerator(req, res, next) {
  // Generar token para requests que lo necesiten
  if (req.method === "GET" && req.path.includes("/auth")) {
    const userId = req.user?.id || null;
    const sessionId = req.sessionID || req.headers["x-session-id"];
    const token = generateCSRFToken(userId, sessionId);
    
    if (token) {
      res.setHeader("X-CSRF-Token", token);
      res.locals.csrfToken = token;
    }
  }
  
  next();
}

export default { generateCSRFToken, validateCSRFToken, csrfProtection, csrfTokenGenerator };
















