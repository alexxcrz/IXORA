/**
 * Sistema de logging estructurado para debugging
 * Funciona tanto en desarrollo como en producción
 */

const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG',
};

const isDev = process.env.NODE_ENV === 'development';
const isAndroid = false;

/**
 * Logger principal con contexto y timestamp
 */
export const logger = {
  /**
   * Log de error crítico
   */
  error: (message, data = null, context = 'APP') => {
    const logData = {
      level: LOG_LEVELS.ERROR,
      timestamp: new Date().toISOString(),
      context,
      message,
      data,
      platform: isAndroid ? 'ANDROID' : 'WEB',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    };
    
    console.error(`❌ [${context}] ${message}`, data || '');
    
    // En Android, también guardar en localStorage para recuperar después
    if (isAndroid && typeof localStorage !== 'undefined') {
      try {
        const logs = JSON.parse(localStorage.getItem('error_logs') || '[]');
        logs.push(logData);
        // Mantener solo los últimos 50 errores
        if (logs.length > 50) {
          logs.shift();
        }
        localStorage.setItem('error_logs', JSON.stringify(logs));
      } catch (e) {
        console.error('Error guardando log:', e);
      }
    }
    
    // En desarrollo, también mostrar stack trace
    if (isDev && data && data.stack) {
      console.error('Stack:', data.stack);
    }
  },

  /**
   * Log de advertencia
   */
  warn: (message, data = null, context = 'APP') => {
    console.warn(`⚠️ [${context}] ${message}`, data || '');
  },

  /**
   * Log de información
   */
  info: (message, data = null, context = 'APP') => {
    if (isDev) {
      console.log(`ℹ️ [${context}] ${message}`, data || '');
    }
  },

  /**
   * Log de debug (solo en desarrollo)
   */
  debug: (message, data = null, context = 'APP') => {
    if (isDev) {
      console.debug(`🔍 [${context}] ${message}`, data || '');
    }
  },

  /**
   * Log específico de autenticación
   */
  auth: {
    error: (message, data) => logger.error(message, data, 'AUTH'),
    warn: (message, data) => logger.warn(message, data, 'AUTH'),
    info: (message, data) => logger.info(message, data, 'AUTH'),
    debug: (message, data) => logger.debug(message, data, 'AUTH'),
  },

  /**
   * Log específico de sesión
   */
  session: {
    error: (message, data) => logger.error(message, data, 'SESSION'),
    warn: (message, data) => logger.warn(message, data, 'SESSION'),
    info: (message, data) => logger.info(message, data, 'SESSION'),
    debug: (message, data) => logger.debug(message, data, 'SESSION'),
  },

  /**
   * Obtener logs guardados (útil para debugging en Android)
   */
  getStoredLogs: () => {
    try {
      if (typeof localStorage !== 'undefined') {
        return JSON.parse(localStorage.getItem('error_logs') || '[]');
      }
    } catch (e) {
      console.error('Error obteniendo logs:', e);
    }
    return [];
  },

  /**
   * Limpiar logs guardados
   */
  clearStoredLogs: () => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('error_logs');
      }
    } catch (e) {
      console.error('Error limpiando logs:', e);
    }
  },
};

export default logger;
