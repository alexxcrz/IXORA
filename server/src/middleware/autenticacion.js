// src/middleware/autenticacion.js
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { dbUsers } from "../config/baseDeDatos.js";

// 🔒 JWT_SECRET desde variable de entorno (crítico para seguridad)
export const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn("⚠️ ADVERTENCIA: JWT_SECRET no está definido en variables de entorno. Usando valor por defecto (INSEGURO para producción).");
  return "MI_SECRETO_SUPER_SEGURO";
})();
export const TOKEN_TTL_HRS = parseInt(process.env.TOKEN_TTL_HRS || "8", 10);

export const signToken = (payload) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: `${TOKEN_TTL_HRS}h` });

// Helpers para Auth (login) - Definidos primero para poder usarlos en los middlewares
export const qUserByPhone = dbUsers.prepare("SELECT * FROM users WHERE phone=?");

// qUserByUsername se crea de forma lazy para evitar errores si la columna no existe aún
let qUserByUsernamePrepared = null;
export const qUserByUsername = {
  get: (username) => {
    if (!qUserByUsernamePrepared) {
      try {
        // Verificar si la columna username existe antes de crear la consulta
        const tableInfo = dbUsers.prepare(`PRAGMA table_info(users)`).all();
        const hasUsername = tableInfo.some(col => col.name === 'username');
        if (!hasUsername) {
          console.warn("⚠️ Columna username no existe en la tabla users");
          return null;
        }
        qUserByUsernamePrepared = dbUsers.prepare("SELECT * FROM users WHERE username = ?");
      } catch (e) {
        console.error("Error preparando consulta por username:", e);
        return null;
      }
    }
    if (!username || username.trim() === "") {
      return null;
    }
    const user = qUserByUsernamePrepared.get(username.trim());
    if (!user) {
      console.log(`⚠️ Usuario no encontrado por username: "${username.trim()}"`);
    }
    return user;
  }
};

export const qRolesByUser = dbUsers.prepare(`
  SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?
`);
// Consulta optimizada para obtener permisos de un usuario (directos + por roles)
export const qPermsByUser = dbUsers.prepare(`
  SELECT DISTINCT p.perm 
  FROM permissions p
  WHERE EXISTS (
    SELECT 1 FROM user_permissions up 
    WHERE up.perm_id = p.id AND up.user_id = ?
  ) OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = ? AND rp.perm_id = p.id
  )
`);

// Helper para hashear contraseñas
export const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

// Helper para verificar contraseñas
export const verifyPassword = async (password, hash) => {
  if (!hash) return false;
  return await bcrypt.compare(password, hash);
};

// Función helper para obtener permisos actuales de un usuario
function getCurrentUserPerms(userId) {
  try {
    if (!userId) {
      console.error("getCurrentUserPerms: userId es undefined o null");
      return [];
    }
    const result = qPermsByUser.all(userId, userId);
    if (!result || !Array.isArray(result)) {
      console.error("getCurrentUserPerms: resultado no es un array", result);
      return [];
    }
    return result.map(p => p?.perm).filter(Boolean);
  } catch (err) {
    console.error("Error obteniendo permisos del usuario:", err);
    console.error("Stack:", err.stack);
    return [];
  }
}

export const authRequired = (req, res, next) => {
  // Buscar token en header Authorization o en query parameter
  const hdr = req.headers.authorization || "";
  let token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  
  // Si no hay token en el header, buscar en query parameter (útil para iframes y nuevas pestañas)
  if (!token && req.query && req.query.token) {
    token = req.query.token;
    // Agregar al header para que esté disponible en el proxy
    req.headers.authorization = `Bearer ${token}`;
  }
  
  if (!token) return res.status(401).json({ error: "Sin token" });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // 🔵 Verificar que la sesión siga activa en la BD
    // IMPORTANTE: Dar un pequeño margen de tiempo después de crear la sesión
    let sess = dbUsers.prepare(`
      SELECT id, user_id, token, last_seen_at, created_at FROM user_sessions WHERE token = ?
    `).get(token);
    
    // Sesión encontrada, continuar sin logs innecesarios

    if (!sess) {
      // Si no se encuentra la sesión, verificar si se acaba de crear (últimos 30 segundos)
      // Esto puede pasar si hay un problema de timing entre crear la sesión y verificar
      const recentSession = dbUsers.prepare(`
        SELECT id, token, user_id, created_at FROM user_sessions 
        WHERE user_id = ? 
        AND datetime(created_at, '+30 seconds') > datetime('now')
        ORDER BY created_at DESC 
        LIMIT 1
      `).get(decoded.id);
      
      if (recentSession) {
        // Verificar si el token coincide
        if (recentSession.token === token) {
          // La sesión existe pero puede haber un problema de timing
          // Permitir la petición y actualizar last_seen_at
          console.warn(`⚠️ Sesión recién creada encontrada por user_id, permitiendo acceso. Session ID: ${recentSession.id}`);
          try {
            dbUsers.prepare(`
              UPDATE user_sessions
              SET last_seen_at = datetime('now')
              WHERE token = ?
            `).run(token);
          } catch (err) {
            console.debug("Error actualizando last_seen_at:", err.message);
          }
          req.user = decoded;
          return next();
        } else {
          // El token no coincide, pero hay una sesión reciente
          // Esto puede pasar si el cliente está usando un token viejo
          console.warn(`⚠️ Token no coincide con sesión reciente. Token buscado: ${token.substring(0, 20)}..., Sesión reciente: ${recentSession.token?.substring(0, 20)}...`);
        }
      }
      // Log más detallado para debugging
      const userId = decoded?.id;
      if (userId) {
        const userSessions = dbUsers.prepare(`
          SELECT id, token, last_seen_at, created_at FROM user_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5
        `).all(userId);
        console.error(`\n❌ [AUTH ERROR] Sesión no encontrada para token. Usuario ${userId} tiene ${userSessions.length} sesiones activas:`);
        userSessions.forEach(s => {
          const tokenMatch = s.token === token ? "✅ MATCH" : "❌ NO MATCH";
          console.error(`  ${tokenMatch} - Session ID: ${s.id}, Token: ${s.token?.substring(0, 30)}..., Created: ${s.created_at}, Last seen: ${s.last_seen_at}`);
        });
        console.error(`  - Token buscado: ${token.substring(0, 30)}...`);
        console.error(`  - Longitud del token buscado: ${token.length}`);
        console.error(`  - Longitud de tokens en BD: ${userSessions.map(s => s.token?.length || 0).join(', ')}`);
        console.error(`  - IP del cliente: ${req.ip || req.connection.remoteAddress}`);
        console.error(`  - User-Agent: ${req.headers['user-agent']?.substring(0, 50)}...`);
        console.error(``);
        
        // Verificar si hay alguna sesión con el token exacto (comparación byte a byte)
        const exactMatch = userSessions.find(s => s.token === token);
        if (exactMatch) {
          console.error(`  ⚠️ PROBLEMA: Se encontró una sesión con token exacto pero la consulta SQL no la devolvió. Session ID: ${exactMatch.id}`);
          // Usar esta sesión de todas formas
          sess = exactMatch;
        } else {
          // Verificar si el token existe en alguna sesión (puede haber un problema de formato)
          const allSessions = dbUsers.prepare(`
            SELECT id, token, user_id, created_at FROM user_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10
          `).all(userId);
          console.error(`  - Todas las sesiones del usuario:`);
          allSessions.forEach(s => {
            const tokenMatch = s.token === token ? "✅ MATCH EXACTO" : "❌ NO MATCH";
            console.error(`    ${tokenMatch} - Session ID: ${s.id}, Token: ${s.token?.substring(0, 30)}...`);
          });
        }
      }
      
      // Si encontramos una sesión con match exacto, usarla
      if (sess) {
        console.warn(`⚠️ Usando sesión encontrada después de búsqueda detallada. Session ID: ${sess.id}`);
      } else {
        return res.status(401).json({ error: "Sesión cerrada" });
      }
    }
    
    // Log de éxito para debugging (solo en desarrollo)
    // Comentado temporalmente para reducir ruido en logs
    // if (process.env.NODE_ENV !== 'production') {
    //   let sessionAge = 0;
    //   if (sess.last_seen_at) {
    //     const lastSeen = new Date(sess.last_seen_at);
    //     if (!isNaN(lastSeen.getTime())) {
    //       sessionAge = Date.now() - lastSeen.getTime();
    //     }
    //   }
    //   if (sessionAge === 0 && sess.created_at) {
    //     const created = new Date(sess.created_at);
    //     if (!isNaN(created.getTime())) {
    //       sessionAge = Date.now() - created.getTime();
    //     }
    //   }
    //   console.debug(`✅ Sesión válida encontrada: ID=${sess.id}, Age=${Math.round(sessionAge / 1000)}s, LastSeen=${sess.last_seen_at || 'NULL'}, Created=${sess.created_at}`);
    // }

    // 🔵 Actualizar último uso (si last_seen_at es NULL, establecerlo también)
    // IMPORTANTE: Usar datetime('now') que es UTC y consistente
    try {
      const updateResult = dbUsers.prepare(`
        UPDATE user_sessions
        SET last_seen_at = datetime('now')
        WHERE token = ?
      `).run(token);
      
      // Verificar que se actualizó correctamente
      if (updateResult.changes === 0) {
        console.warn(`⚠️ No se pudo actualizar last_seen_at para token (sesión no encontrada o ya actualizada)`);
      }
    } catch (err) {
      // Si falla la actualización, no bloquear la petición
      console.debug("Error actualizando last_seen_at:", err.message);
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido" });
  }
};

export const permit = (...need) => (req, res, next) => {
  try {
    // 🔥 FIX: Consultar permisos actuales de la BD, no solo del token JWT
    // Esto asegura que los permisos actualizados se reflejen inmediatamente
    const userId = req.user?.id;
    if (!userId) {
      console.error("permit: req.user o req.user.id no existe", { user: req.user });
      return res.status(401).json({ error: "Usuario no identificado" });
    }

    // Obtener permisos actuales de la BD (directos + por roles)
    const currentPerms = getCurrentUserPerms(userId);
    
    const ok = need.every(p => currentPerms.includes(p));
    if (!ok) {
      console.warn("Permiso denegado:", { userId, required: need, has: currentPerms });
      return res.status(403).json({ 
        error: "Sin permiso",
        required: need,
        has: currentPerms 
      });
    }
    next();
  } catch (err) {
    console.error("Error en middleware permit:", err);
    console.error("Stack:", err.stack);
    return res.status(500).json({ 
      error: "Error verificando permisos",
      message: err.message 
    });
  }
};

export function getUserBundleByPhone(phone) {
  const user = qUserByPhone.get(phone);
  if (!user) return null;
  const roles = qRolesByUser.all(user.id).map(r => r.name);
  const perms = qPermsByUser.all(user.id, user.id).map(p => p.perm);
  return { user, roles, perms };
}

export function getUserBundleByUsername(username) {
  const user = qUserByUsername.get(username);
  if (!user) return null;
  const roles = qRolesByUser.all(user.id).map(r => r.name);
  const perms = qPermsByUser.all(user.id, user.id).map(p => p.perm);
  return { user, roles, perms };
}

export function getUserBundleById(userId) {
  const user = dbUsers.prepare("SELECT * FROM users WHERE id=?").get(userId);
  if (!user) return null;
  const roles = qRolesByUser.all(user.id).map(r => r.name);
  const perms = qPermsByUser.all(user.id, user.id).map(p => p.perm);
  return { user, roles, perms };
}