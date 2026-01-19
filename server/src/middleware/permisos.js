// Middleware para verificar permisos específicos
import { authRequired } from "./autenticacion.js";
import { dbUsers } from "../config/baseDeDatos.js";

// Consulta optimizada para verificar si un usuario tiene un permiso específico
const qTienePermiso = dbUsers.prepare(`
  SELECT COUNT(*) as count
  FROM permissions p
  WHERE p.perm = ?
  AND (
    EXISTS (
      SELECT 1 FROM user_permissions up 
      WHERE up.perm_id = p.id AND up.user_id = ?
    ) OR EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      WHERE ur.user_id = ? AND rp.perm_id = p.id
    )
  )
`);

// Consulta para verificar si un usuario tiene el rol admin
const qEsAdmin = dbUsers.prepare(`
  SELECT COUNT(*) as count
  FROM user_roles ur
  JOIN roles r ON ur.role_id = r.id
  WHERE ur.user_id = ? AND r.name = 'admin'
`);

/**
 * Verifica si el usuario actual tiene un permiso específico
 */
export const tienePermiso = (userId, permiso) => {
  if (!userId || !permiso) return false;
  
  try {
    // Si el usuario es admin, tiene todos los permisos
    const esAdmin = qEsAdmin.get(userId);
    if (esAdmin?.count > 0) {
      return true;
    }
    
    // Si no es admin, verificar permiso específico
    const result = qTienePermiso.get(permiso, userId, userId);
    return result?.count > 0;
  } catch (error) {
    console.error(`Error verificando permiso ${permiso}:`, error);
    return false;
  }
};

/**
 * Middleware para verificar que el usuario tiene un permiso específico
 * Uso: router.get("/ruta", authRequired, verificarPermiso("compras.proveedores.ver"), handler)
 * O: router.get("/ruta", verificarPermiso("compras.proveedores.ver"), handler) - authRequired ya aplicado en router.use
 */
export const verificarPermiso = (permiso) => {
  return (req, res, next) => {
    // Verificar que el usuario está autenticado (debe estar establecido por authRequired)
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "Usuario no autenticado" });
    }

    // Verificar permiso
    if (!tienePermiso(req.user.id, permiso)) {
      return res.status(403).json({ 
        error: "No tienes permiso para realizar esta acción",
        permiso_requerido: permiso
      });
    }

    next();
  };
};

/**
 * Middleware para verificar múltiples permisos (OR - al menos uno)
 * Uso: router.get("/ruta", verificarPermisos(["permiso1", "permiso2"]), handler)
 */
export const verificarPermisos = (permisos) => {
  return (req, res, next) => {
    // Verificar que el usuario está autenticado
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "Usuario no autenticado" });
    }

    // Verificar si tiene al menos uno de los permisos
    const tieneAlguno = permisos.some(perm => tienePermiso(req.user.id, perm));
    
    if (!tieneAlguno) {
      return res.status(403).json({ 
        error: "No tienes permiso para realizar esta acción",
        permisos_requeridos: permisos
      });
    }

    next();
  };
};

/**
 * Helper para verificar permisos en el código (no middleware)
 */
export const puede = (userId, permiso) => {
  return tienePermiso(userId, permiso);
};

/**
 * Middleware para verificar acceso a pestaña (compatibilidad con código existente)
 * Acepta uno o más permisos (todos deben cumplirse - AND)
 * Si req.user no está establecido, usa authRequired primero
 * Uso: router.get("/ruta", requierePermiso("tab:inventario"), handler)
 * O: router.get("/ruta", authRequired, requierePermiso("tab:inventario", "action:activar-productos"), handler)
 */
export const requierePermiso = (...permisos) => {
  return (req, res, next) => {
    // Si no hay usuario autenticado, usar authRequired primero
    if (!req.user || !req.user.id) {
      return authRequired(req, res, () => {
        // Después de autenticación, verificar permisos
        if (!req.user || !req.user.id) {
          return res.status(401).json({ error: "Usuario no autenticado" });
        }

        // Verificar que tiene TODOS los permisos requeridos
        const tieneTodos = permisos.every(perm => tienePermiso(req.user.id, perm));
        
        if (!tieneTodos) {
          return res.status(403).json({ 
            error: "No tienes permiso para realizar esta acción",
            permisos_requeridos: permisos
          });
        }

        next();
      });
    }

    // Si ya está autenticado, solo verificar permisos
    const tieneTodos = permisos.every(perm => tienePermiso(req.user.id, perm));
    
    if (!tieneTodos) {
      return res.status(403).json({ 
        error: "No tienes permiso para realizar esta acción",
        permisos_requeridos: permisos
      });
    }

    next();
  };
};
