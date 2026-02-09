// Sistema de logging estructurado para IXORA
// Los logs de archivo han sido desactivados para evitar errores de carpetas

// Niveles de log
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const CURRENT_LOG_LEVEL = process.env.LOG_LEVEL || "INFO";

function getLogLevel() {
  return LOG_LEVELS[CURRENT_LOG_LEVEL.toUpperCase()] || LOG_LEVELS.INFO;
}

function shouldLog(level) {
  return LOG_LEVELS[level] <= getLogLevel();
}

// Logger principal (solo consola, sin archivos)
export const logger = {
  error: (message, metadata = {}) => {
    if (shouldLog("ERROR")) {
      console.error(`[ERROR] ${message}`, metadata);
    }
  },

  warn: (message, metadata = {}) => {
    if (shouldLog("WARN")) {
      console.warn(`[WARN] ${message}`, metadata);
    }
  },

  info: (message, metadata = {}) => {
    if (shouldLog("INFO")) {
      console.log(`[INFO] ${message}`, metadata);
    }
  },

  debug: (message, metadata = {}) => {
    if (shouldLog("DEBUG")) {
      console.debug(`[DEBUG] ${message}`, metadata);
    }
  },

  // Logs específicos para seguridad (desactivados para reducir ruido)
  security: {
    loginAttempt: (username, success, ip, reason = null) => {
      // Desactivado
    },

    loginBlocked: (username, ip, minutesLeft) => {
      // Desactivado
    },

    unauthorizedAccess: (path, user, ip) => {
      // Desactivado
    }
  },

  // Logs específicos para operaciones (desactivados para reducir ruido)
  operation: {
    create: (resource, id, userId) => {
      // Desactivado
    },

    update: (resource, id, userId) => {
      // Desactivado
    },

    delete: (resource, id, userId) => {
      // Desactivado
    }
  }
};

export default logger;
















