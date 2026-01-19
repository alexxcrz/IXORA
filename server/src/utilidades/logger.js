// Sistema de logging estructurado para IXORA
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directorio de logs
const LOGS_DIR = path.join(__dirname, "../../logs");
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

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

function formatTimestamp() {
  return new Date().toISOString();
}

function formatLogEntry(level, message, metadata = {}) {
  const entry = {
    timestamp: formatTimestamp(),
    level,
    message,
    ...metadata
  };
  return JSON.stringify(entry);
}

function writeToFile(level, message, metadata = {}) {
  const today = new Date().toISOString().split("T")[0];
  const logFile = path.join(LOGS_DIR, `ixora-${today}.log`);
  
  try {
    const entry = formatLogEntry(level, message, metadata);
    fs.appendFileSync(logFile, entry + "\n", "utf8");
  } catch (err) {
    console.error("Error escribiendo log:", err);
  }
}

function shouldLog(level) {
  return LOG_LEVELS[level] <= getLogLevel();
}

// Limpiar logs antiguos (mantener solo últimos 30 días)
function cleanupOldLogs() {
  try {
    const files = fs.readdirSync(LOGS_DIR);
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 días

    files.forEach(file => {
      if (file.startsWith("ixora-") && file.endsWith(".log")) {
        const filePath = path.join(LOGS_DIR, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;

        if (age > maxAge) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Log eliminado: ${file}`);
        }
      }
    });
  } catch (err) {
    console.error("Error limpiando logs antiguos:", err);
  }
}

// Ejecutar limpieza al iniciar
cleanupOldLogs();

// Logger principal
export const logger = {
  error: (message, metadata = {}) => {
    if (shouldLog("ERROR")) {
      console.error(`[ERROR] ${message}`, metadata);
      writeToFile("ERROR", message, { ...metadata, stack: metadata.error?.stack });
    }
  },

  warn: (message, metadata = {}) => {
    if (shouldLog("WARN")) {
      console.warn(`[WARN] ${message}`, metadata);
      writeToFile("WARN", message, metadata);
    }
  },

  info: (message, metadata = {}) => {
    if (shouldLog("INFO")) {
      console.log(`[INFO] ${message}`, metadata);
      writeToFile("INFO", message, metadata);
    }
  },

  debug: (message, metadata = {}) => {
    if (shouldLog("DEBUG")) {
      console.debug(`[DEBUG] ${message}`, metadata);
      writeToFile("DEBUG", message, metadata);
    }
  },

  // Logs específicos para seguridad
  security: {
    loginAttempt: (username, success, ip, reason = null) => {
      logger.info("Intento de login", {
        type: "security",
        event: "login_attempt",
        username,
        success,
        ip,
        reason
      });
    },

    loginBlocked: (username, ip, minutesLeft) => {
      logger.warn("Login bloqueado por intentos fallidos", {
        type: "security",
        event: "login_blocked",
        username,
        ip,
        minutesLeft
      });
    },

    unauthorizedAccess: (path, user, ip) => {
      logger.warn("Acceso no autorizado", {
        type: "security",
        event: "unauthorized_access",
        path,
        userId: user?.id,
        username: user?.username,
        ip
      });
    }
  },

  // Logs específicos para operaciones
  operation: {
    create: (resource, id, userId) => {
      logger.info("Recurso creado", {
        type: "operation",
        event: "create",
        resource,
        id,
        userId
      });
    },

    update: (resource, id, userId) => {
      logger.info("Recurso actualizado", {
        type: "operation",
        event: "update",
        resource,
        id,
        userId
      });
    },

    delete: (resource, id, userId) => {
      logger.info("Recurso eliminado", {
        type: "operation",
        event: "delete",
        resource,
        id,
        userId
      });
    }
  }
};

export default logger;
















