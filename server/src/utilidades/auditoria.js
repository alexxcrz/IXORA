// src/utilidades/auditoria.js
import { dbAud, dbUsers } from "../config/baseDeDatos.js";

/**
 * Obtiene la fecha y hora actual en formato local (México)
 */
function getFechaLocal() {
  const now = new Date();
  
  // Obtener componentes de fecha/hora en zona local
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  // Formato: YYYY-MM-DD HH:MM:SS (hora local)
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Obtiene el nombre del usuario desde la base de datos usando el user_id
 * @param {number|string} userId - ID del usuario
 * @returns {string} Nombre del usuario o "Sistema" si no se encuentra
 */
function obtenerNombreUsuario(userId) {
  if (!userId) return "Sistema";
  
  try {
    const usuario = dbUsers.prepare("SELECT name, phone, username FROM users WHERE id = ?").get(userId);
    if (usuario) {
      // Priorizar name, luego username, luego phone
      return usuario.name || usuario.username || usuario.phone || `Usuario ${userId}`;
    }
  } catch (error) {
    console.error("❌ Error obteniendo nombre de usuario para auditoría:", error);
  }
  
  return `Usuario ${userId}`;
}

/**
 * Registra una acción en la auditoría
 * 
 * @param {Object} params 
 * @param {string|number} params.usuario - Nombre del usuario, user_id, o objeto req.user
 * @param {string} params.accion - Acción realizada (BORRAR, EDITAR, SURTIR, etc.)
 * @param {string} params.detalle - Descripción más detallada
 * @param {string} params.tabla - Nombre de la tabla afectada
 * @param {number|null} params.registroId - ID del registro afectado
 * @param {Object} params.cambios - Objeto con los cambios específicos (opcional)
 */
export function registrarAccion({ usuario, accion, detalle, tabla, registroId = null, cambios = null }) {
  try {
    // Si usuario es un objeto req.user, obtener el ID
    let nombreUsuario = "Sistema";
    if (usuario) {
      if (typeof usuario === 'object' && usuario.id) {
        // Es un objeto req.user
        nombreUsuario = obtenerNombreUsuario(usuario.id);
      } else if (typeof usuario === 'number' || (typeof usuario === 'string' && /^\d+$/.test(usuario))) {
        // Es un ID numérico
        nombreUsuario = obtenerNombreUsuario(Number(usuario));
      } else {
        // Es un string (nombre directo)
        nombreUsuario = String(usuario);
      }
    }
    
    // Si hay cambios específicos, agregarlos al detalle
    let detalleFinal = detalle;
    if (cambios && typeof cambios === 'object' && Object.keys(cambios).length > 0) {
      const cambiosTexto = Object.entries(cambios)
        .map(([campo, valor]) => `${campo}: ${valor}`)
        .join(' | ');
      detalleFinal = `${detalle} | Cambios: ${cambiosTexto}`;
    }
    
    const fechaLocal = getFechaLocal();
    const stmt = dbAud.prepare(`
      INSERT INTO auditoria (usuario, accion, detalle, tabla_afectada, registro_id, fecha)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(nombreUsuario, accion, detalleFinal, tabla, registroId, fechaLocal);
  } catch (error) {
    console.error("❌ Error registrando auditoría:", error);
  }
}
