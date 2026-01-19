// 🔒 Validación y sanitización de entrada
// Protección contra XSS, SQL Injection, y otros ataques de entrada

/**
 * Sanitiza string para prevenir XSS
 */
export function sanitizeString(input) {
  if (typeof input !== "string") return input;
  
  return input
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
    // Nota: No codificamos "/" porque no es peligrosa para XSS y causa problemas con valores legítimos como "N/A"
}

/**
 * Sanitiza objeto completo recursivamente
 */
export function sanitizeObject(obj) {
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === "string") {
    return sanitizeString(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  if (typeof obj === "object") {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[sanitizeString(key)] = sanitizeObject(value);
    }
    return sanitized;
  }
  
  return obj;
}

/**
 * Valida email
 */
export function validateEmail(email) {
  if (typeof email !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * Valida teléfono
 */
export function validatePhone(phone) {
  if (typeof phone !== "string") return false;
  const cleaned = phone.replace(/\D/g, "");
  return cleaned.length === 10 || cleaned.length === 11;
}

/**
 * Valida que no contenga patrones SQL injection
 */
export function validateNoSQLInjection(input) {
  if (typeof input !== "string") return true;
  
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/i,
    /(\b(UNION|OR|AND)\b.*\b(SELECT|INSERT|UPDATE|DELETE)\b)/i,
    /(--|#|\/\*|\*\/|;)/,
    /(\b(script|javascript|onerror|onload)\b)/i,
  ];
  
  return !sqlPatterns.some(pattern => pattern.test(input));
}

/**
 * Valida que no contenga patrones XSS
 */
export function validateNoXSS(input) {
  if (typeof input !== "string") return true;
  
  const xssPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /on\w+\s*=/gi,
    /javascript:/gi,
    /<img[^>]+src[^>]*=.*javascript:/gi,
  ];
  
  return !xssPatterns.some(pattern => pattern.test(input));
}

/**
 * Valida longitud de string
 */
export function validateLength(input, min = 0, max = Infinity) {
  if (typeof input !== "string") return false;
  const length = input.length;
  return length >= min && length <= max;
}

/**
 * Middleware de validación y sanitización
 */
export function inputValidationMiddleware(req, res, next) {
  // Excluir rutas que manejan datos complejos o JSON estructurado
  const rutasExcluidas = [
    "/admin/personalizacion",
    "/notificaciones",
    "/devoluciones/importar",
    "/devoluciones/clientes/importar-no-aptos",
    "/devoluciones/scan",
    "/devoluciones/scan/ia",
    "/chat/grupos",
  ];
  
  const esRutaExcluida = rutasExcluidas.some(ruta => {
    // Verificar si el path coincide exactamente o comienza con la ruta
    return req.path === ruta || req.path.startsWith(ruta + "/");
  });
  
  if (esRutaExcluida) {
    // Para rutas de escaneo, no sanitizar nada (base64 no debe ser HTML-encoded)
    // Para otras rutas excluidas, sanitizar pero no validar estrictamente
    const rutasSinSanitizar = [
      "/devoluciones/scan",
      "/devoluciones/scan/ia",
    ];
    
    const esRutaSinSanitizar = rutasSinSanitizar.some(ruta => {
      return req.path === ruta || req.path.startsWith(ruta + "/");
    });
    
    if (!esRutaSinSanitizar) {
      // Solo sanitizar, no validar estrictamente
      if (req.body && typeof req.body === "object") {
        if (!req.headers["content-type"]?.includes("multipart/form-data")) {
          req.body = sanitizeObject(req.body);
        }
      }
    }
    return next();
  }
  
  // Sanitizar body
  if (req.body && typeof req.body === "object") {
    // No sanitizar archivos (multipart/form-data)
    if (!req.headers["content-type"]?.includes("multipart/form-data")) {
      req.body = sanitizeObject(req.body);
    }
  }
  
  // Sanitizar query params
  if (req.query && typeof req.query === "object") {
    req.query = sanitizeObject(req.query);
  }
  
  // Validar campos comunes
  const validations = [];
  
  if (req.body?.email) {
    if (!validateEmail(req.body.email)) {
      validations.push("Email inválido");
    }
    if (!validateNoSQLInjection(req.body.email) || !validateNoXSS(req.body.email)) {
      validations.push("Email contiene caracteres no permitidos");
    }
  }
  
  if (req.body?.phone) {
    if (!validatePhone(req.body.phone)) {
      validations.push("Teléfono inválido");
    }
  }
  
  // Validar todos los strings en body contra SQL injection y XSS
  // Pero ser más permisivo con datos JSON estructurados
  function validateAllStrings(obj, path = "", depth = 0) {
    // Limitar profundidad para evitar validar objetos JSON muy anidados
    if (depth > 5) return;
    
    for (const [key, value] of Object.entries(obj || {})) {
      const currentPath = path ? `${path}.${key}` : key;
      
      // Ignorar campos que son comúnmente JSON estructurado
      if (key === "data" && typeof value === "object") {
        continue; // No validar campos "data" que suelen ser JSON
      }
      
      if (typeof value === "string") {
        // Solo validar strings largos o que parezcan código
        if (value.length > 1000) {
          if (!validateNoSQLInjection(value)) {
            validations.push(`Campo ${currentPath} contiene patrones sospechosos`);
          }
          if (!validateNoXSS(value)) {
            validations.push(`Campo ${currentPath} contiene código potencialmente peligroso`);
          }
        } else {
          // Para strings cortos, solo validar patrones obviamente peligrosos
          if (value.includes("<script") || value.includes("javascript:") || value.includes("onerror=")) {
            validations.push(`Campo ${currentPath} contiene código potencialmente peligroso`);
          }
        }
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        validateAllStrings(value, currentPath, depth + 1);
      } else if (Array.isArray(value)) {
        // Solo validar arrays pequeños para evitar falsos positivos
        if (value.length <= 100) {
          value.forEach((item, index) => {
            if (typeof item === "string" && item.length > 1000) {
              if (!validateNoSQLInjection(item)) {
                validations.push(`Campo ${currentPath}[${index}] contiene patrones sospechosos`);
              }
              if (!validateNoXSS(item)) {
                validations.push(`Campo ${currentPath}[${index}] contiene código potencialmente peligroso`);
              }
            } else if (typeof item === "object") {
              validateAllStrings(item, `${currentPath}[${index}]`, depth + 1);
            }
          });
        }
      }
    }
  }
  
  if (req.body) {
    validateAllStrings(req.body);
  }
  
  if (validations.length > 0) {
    return res.status(400).json({
      error: "Validación fallida",
      details: validations
    });
  }
  
  next();
}

export default {
  sanitizeString,
  sanitizeObject,
  validateEmail,
  validatePhone,
  validateNoSQLInjection,
  validateNoXSS,
  validateLength,
  inputValidationMiddleware
};




