// 🔒 Restricciones de tiempo/horario
// Permite bloquear accesos fuera de horarios permitidos

import { dbUsers } from "../config/baseDeDatos.js";
import { getClientIP } from "./antiVPN.js";
import { notifyAdminsSecurityEvent } from "../utilidades/securityNotifications.js";

const CONFIG = {
  // Horarios permitidos (formato 24h)
  ALLOWED_HOURS_START: parseInt(process.env.ALLOWED_HOURS_START || "0", 10),
  ALLOWED_HOURS_END: parseInt(process.env.ALLOWED_HOURS_END || "23", 10),
  
  // Días de la semana permitidos (0 = Domingo, 6 = Sábado)
  // Ejemplo: "1,2,3,4,5" = Lunes a Viernes
  ALLOWED_DAYS: (process.env.ALLOWED_DAYS || "").split(",").map(d => parseInt(d.trim(), 10)).filter(d => !isNaN(d)),
  
  // Zona horaria (por defecto sistema)
  TIMEZONE: process.env.TIMEZONE || "UTC",
  
  // Activar restricciones
  ENABLED: process.env.TIME_RESTRICTIONS_ENABLED === "true",
};

/**
 * Obtiene la hora actual en la zona horaria configurada
 */
function getCurrentTime() {
  const now = new Date();
  
  // Convertir a la zona horaria configurada
  // Nota: En producción, usar una librería como date-fns-tz para mejor soporte de timezones
  let hours = now.getUTCHours();
  let day = now.getUTCDay();
  
  // Ajustar según timezone (simplificado)
  if (CONFIG.TIMEZONE !== "UTC") {
    // Aquí podrías agregar lógica más compleja para diferentes timezones
    // Por ahora, asumimos que TIMEZONE es un offset como "UTC-5"
    const match = CONFIG.TIMEZONE.match(/UTC([+-]\d+)/);
    if (match) {
      const offset = parseInt(match[1], 10);
      hours = (hours + offset + 24) % 24;
    }
  }
  
  return { hours, day };
}

/**
 * Verifica si el acceso está permitido en este momento
 */
function isAccessAllowed() {
  if (!CONFIG.ENABLED) return true;
  
  const { hours, day } = getCurrentTime();
  
  // Verificar día de la semana
  if (CONFIG.ALLOWED_DAYS.length > 0) {
    if (!CONFIG.ALLOWED_DAYS.includes(day)) {
      return false;
    }
  }
  
  // Verificar hora
  if (CONFIG.ALLOWED_HOURS_START > CONFIG.ALLOWED_HOURS_END) {
    // Rango que cruza medianoche (ej: 22:00 - 06:00)
    return hours >= CONFIG.ALLOWED_HOURS_START || hours <= CONFIG.ALLOWED_HOURS_END;
  } else {
    // Rango normal (ej: 09:00 - 17:00)
    return hours >= CONFIG.ALLOWED_HOURS_START && hours <= CONFIG.ALLOWED_HOURS_END;
  }
}

/**
 * Middleware de restricciones de tiempo
 */
export async function timeRestrictionsMiddleware(req, res, next) {
  if (!CONFIG.ENABLED) {
    return next();
  }
  
  // Permitir en rutas de salud y administración
  if (req.path === "/health" || req.path.startsWith("/api/seguridad")) {
    return next();
  }
  
  if (!isAccessAllowed()) {
    const { hours, day } = getCurrentTime();
    const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    
    // Registrar evento
    try {
      const ip = getClientIP(req);
      
      dbUsers.prepare(`
        INSERT INTO security_events (ip, event_type, details, user_id)
        VALUES (?, ?, ?, ?)
      `).run(
        ip,
        "TIME_RESTRICTION_VIOLATION",
        JSON.stringify({ hours, day, dayName: days[day] }),
        req.user?.id || null
      );
      
      // Notificar a administradores
      try {
        await notifyAdminsSecurityEvent("TIME_RESTRICTION_VIOLATION", {
          ip,
          hours,
          day,
          dayName: days[day]
        }, req.user?.id || null);
      } catch (notifyErr) {
        // Silenciar errores
      }
    } catch (err) {
      // Silenciar errores
    }
    
    return res.status(403).json({
      error: "Acceso fuera de horario",
      message: `El acceso está permitido de ${CONFIG.ALLOWED_HOURS_START}:00 a ${CONFIG.ALLOWED_HOURS_END}:00`,
      currentTime: `${hours}:00`,
      currentDay: days[day]
    });
  }
  
  next();
}

export default timeRestrictionsMiddleware;
















