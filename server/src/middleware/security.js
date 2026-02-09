// 🔒 Middleware de seguridad adicional - Headers, fingerprinting, etc.

/**
 * Añade headers de seguridad HTTP
 */
export function securityHeaders(req, res, next) {
  // Prevenir clickjacking
  res.setHeader("X-Frame-Options", "DENY");
  
  // Prevenir MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  
  // XSS Protection (legacy pero útil)
  res.setHeader("X-XSS-Protection", "1; mode=block");
  
  // Referrer Policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  
  // Permissions Policy (antes Feature-Policy)
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  
  // Content Security Policy básico - permitir CDNs necesarios
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https: blob:; font-src 'self' data: https://cdn.jsdelivr.net; connect-src 'self' https: wss:; media-src 'self' blob:;"
  );
  
  // Strict Transport Security deshabilitado (usando HTTP)
  // if (req.secure || req.headers["x-forwarded-proto"] === "https") {
  if (false) { // HTTPS deshabilitado
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  
  next();
}

/**
 * Detecta anomalías en el request
 */
export function detectAnomalies(req, res, next) {
  const anomalies = [];
  
  // Detectar user-agent sospechoso o ausente
  // PERMITIR apps móviles que pueden no tener User-Agent o tener uno muy corto
  const userAgent = req.headers["user-agent"] || "";
  const isMobileApp = !req.headers.origin; // Apps móviles no tienen origin
  if (!isMobileApp && (!userAgent || userAgent.length < 10)) {
    anomalies.push("USER_AGENT_MISSING_OR_SUSPICIOUS");
  }
  
  // Detectar user-agents conocidos de bots/scrapers
  const botPatterns = [
    /bot/i, /crawler/i, /spider/i, /scraper/i, /curl/i, /wget/i,
    /python-requests/i, /postman/i, /insomnia/i, /httpie/i
  ];
  
  if (botPatterns.some(pattern => pattern.test(userAgent))) {
    // Permitir algunos bots conocidos (Google, Bing) pero registrar otros
    if (!/googlebot|bingbot|slurp/i.test(userAgent)) {
      anomalies.push("BOT_USER_AGENT");
    }
  }
  
  // Detectar headers inconsistentes
  const hasOrigin = req.headers.origin;
  const hasReferer = req.headers.referer;
  
  if (hasOrigin && hasReferer) {
    try {
      const originUrl = new URL(req.headers.origin);
      const refererUrl = new URL(req.headers.referer);
      
      if (originUrl.hostname !== refererUrl.hostname) {
        anomalies.push("ORIGIN_REFERER_MISMATCH");
      }
    } catch (e) {
      // Ignorar errores de parsing
    }
  }
  
  // Detectar tamaño de payload sospechoso
  const contentLength = parseInt(req.headers["content-length"] || "0", 10);
  if (contentLength > 100 * 1024 * 1024) { // > 100MB
    anomalies.push("LARGE_PAYLOAD");
  }
  
  // Si hay muchas anomalías, registrar pero no bloquear (solo alertar)
  if (anomalies.length > 2) {
    // Registrar para análisis posterior
    console.warn(`⚠️ Múltiples anomalías detectadas en IP ${req.ip}:`, anomalies);
  }
  
  req.securityAnomalies = anomalies;
  next();
}

/**
 * Valida fingerprinting básico del cliente
 */
export function validateFingerprint(req, res, next) {
  // Solo aplicar en rutas sensibles (login, registro, etc.)
  if (!req.path.includes("/auth")) {
    return next();
  }
  
  const fingerprint = {
    userAgent: req.headers["user-agent"] || "",
    acceptLanguage: req.headers["accept-language"] || "",
    acceptEncoding: req.headers["accept-encoding"] || "",
    screenResolution: req.headers["x-screen-resolution"] || null,
    timezone: req.headers["x-timezone"] || null
  };
  
  // Validaciones básicas
  // PERMITIR apps móviles que pueden no tener User-Agent o tener uno muy corto
  const isMobileApp = !req.headers.origin; // Apps móviles no tienen origin
  if (!isMobileApp && (!fingerprint.userAgent || fingerprint.userAgent.length < 10)) {
    console.warn(`⚠️ [SECURITY] Request bloqueado - User-Agent inválido: ${fingerprint.userAgent || 'none'}`);
    return res.status(400).json({
      error: "Solicitud inválida",
      message: "User-Agent requerido"
    });
  }
  
  // Log para apps móviles
  if (isMobileApp) {
    console.log(`📱 [SECURITY] Request desde app móvil - User-Agent: ${fingerprint.userAgent || 'none'}`);
  }
  
  // Almacenar fingerprint para validación posterior
  req.fingerprint = fingerprint;
  next();
}

export default { securityHeaders, detectAnomalies, validateFingerprint };
















