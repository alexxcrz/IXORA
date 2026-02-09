import express from "express";
import { dbUsers, dbAud, dbRRHH, dbInv, dbHist, dbDia, dbDevol, dbChat } from "../config/baseDeDatos.js";
import { authRequired, permit, hashPassword } from "../middleware/autenticacion.js";
import { getIO, getUsuariosActivos } from "../config/socket.js";
import { registrarAccion } from "../utilidades/auditoria.js";
import multer from "multer";
import path from "path";
import sharp from "sharp";

const router = express.Router();

const checkAdmin = [authRequired, permit("tab:admin")];

const storage = multer.diskStorage({
  destination: "uploads/perfiles",
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `user_${req.params.id}${ext}`);
  },
});
const upload = multer({ storage });

import fs from "fs";

const crearSubcarpetas = () => {
  const baseDir = path.join(process.cwd(), "uploads/personalizacion");
  const subcarpetas = ["logos", "favicons", "fondos", "fondos-login", "fondos-login-branding", "tienda-banners"];
  
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  
  subcarpetas.forEach(subcarpeta => {
    const rutaCompleta = path.join(baseDir, subcarpeta);
    if (!fs.existsSync(rutaCompleta)) {
      fs.mkdirSync(rutaCompleta, { recursive: true });
    }
  });
};

const storagePersonalizacion = multer.diskStorage({
  destination: (req, file, cb) => {
    // Detectar tipo desde la URL/ruta (más confiable que req.body en multer)
    const pathUrl = req.originalUrl || req.url || req.path || "";
    let tipo = "archivo";
    
    // Detectar tipo desde la ruta (importante: verificar rutas más específicas primero)
    if (pathUrl.includes("/fondo-login-branding")) {
      tipo = "fondoLoginBranding";
    } else if (pathUrl.includes("/fondo-login")) {
      tipo = "fondoLogin";
    } else if (pathUrl.includes("/logo")) {
      tipo = "logo";
    } else if (pathUrl.includes("/favicon")) {
      tipo = "favicon";
    } else if (pathUrl.includes("/fondo")) {
      tipo = "fondo";
    }
    
    // Fallback: intentar desde req.customTipo o req.body (si está disponible)
    if (tipo === "archivo" && req.customTipo) {
      tipo = req.customTipo;
    } else if (tipo === "archivo" && req.body?.tipo) {
      tipo = req.body.tipo;
    }
    
    let destino = path.join(process.cwd(), "uploads/personalizacion");
    
    if (tipo === "logo") {
      destino = path.join(process.cwd(), "uploads/personalizacion", "logos");
    } else if (tipo === "favicon") {
      destino = path.join(process.cwd(), "uploads/personalizacion", "favicons");
    } else if (tipo === "fondo") {
      destino = path.join(process.cwd(), "uploads/personalizacion", "fondos");
    } else if (tipo === "fondoLogin") {
      destino = path.join(process.cwd(), "uploads/personalizacion", "fondos-login");
    } else if (tipo === "fondoLoginBranding") {
      destino = path.join(process.cwd(), "uploads/personalizacion", "fondos-login-branding");
    }
    
    if (!fs.existsSync(destino)) {
      fs.mkdirSync(destino, { recursive: true });
    }
    
    cb(null, destino);
  },
  filename: (req, file, cb) => {
    // Detectar tipo desde la URL/ruta (más confiable que req.body en multer)
    const pathUrl = req.originalUrl || req.url || req.path || "";
    let tipo = "archivo";
    
    // Detectar tipo desde la ruta (importante: verificar rutas más específicas primero)
    if (pathUrl.includes("/fondo-login-branding")) {
      tipo = "fondoLoginBranding";
    } else if (pathUrl.includes("/fondo-login")) {
      tipo = "fondoLogin";
    } else if (pathUrl.includes("/logo")) {
      tipo = "logo";
    } else if (pathUrl.includes("/favicon")) {
      tipo = "favicon";
    } else if (pathUrl.includes("/fondo")) {
      tipo = "fondo";
    }
    
    // Fallback: intentar desde req.customTipo o req.body (si está disponible)
    if (tipo === "archivo" && req.customTipo) {
      tipo = req.customTipo;
    } else if (tipo === "archivo" && req.body?.tipo) {
      tipo = req.body.tipo;
    }
    
    let nombre = "";
    let ext = path.extname(file.originalname).toLowerCase();
    
    if (tipo === "logo") {
      if (file.mimetype === "image/gif") {
        ext = ".gif";
      } else if (ext === ".svg") {
        ext = ".svg";
      } else if (ext === ".jpg" || ext === ".jpeg") {
        ext = ".jpg";
      } else {
        ext = ".png";
      }
      nombre = `logo${ext}`;
    } else if (tipo === "favicon") {
      if (file.mimetype === "image/gif") {
        ext = ".gif";
      } else if (ext === ".svg") {
        ext = ".svg";
      } else if (ext === ".png") {
        ext = ".png";
      } else {
        ext = ".ico";
      }
      nombre = `favicon${ext}`;
    } else if (tipo === "fondo") {
      if (file.mimetype.startsWith("video/")) {
        ext = ".mp4";
      } else if (file.mimetype === "image/gif") {
        ext = ".gif";
      } else {
        ext = ".png";
      }
      nombre = `fondo${ext}`;
    } else if (tipo === "fondoLogin") {
      if (file.mimetype.startsWith("video/")) {
        ext = ".mp4";
      } else if (file.mimetype === "image/gif") {
        ext = ".gif";
      } else {
        ext = ".png";
      }
      nombre = `fondo-login${ext}`;
    } else if (tipo === "fondoLoginBranding") {
      if (file.mimetype.startsWith("video/")) {
        ext = ".mp4";
      } else if (file.mimetype === "image/gif") {
        ext = ".gif";
      } else {
        ext = ".png";
      }
      nombre = `fondo-login-branding${ext}`;
    } else {
      // Si no se detectó tipo, usar timestamp (no debería pasar)
      const timestamp = Date.now();
      nombre = `${timestamp}_${file.originalname}`;
    }
    
    cb(null, nombre);
  },
});

const uploadPersonalizacion = multer({ 
  storage: storagePersonalizacion,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB máximo
});

/* ============================================================
   🔵 SESIONES — TABLA: user_sessions
   ============================================================ */

// Obtener sesiones abiertas
router.get(
  "/admin/users/:id/sessions",
  checkAdmin,
  permit("admin.sesiones.ver"),
  (req, res) => {
    const { id } = req.params;
    const sessions = dbUsers
      .prepare(
        `SELECT id, token, created_at 
         FROM user_sessions 
         WHERE user_id = ?
         ORDER BY id DESC`
      )
      .all(id);

    res.json(sessions);
  }
);

// Cerrar sesión específica
router.delete(
  "/admin/sessions/:sessionId",
  checkAdmin,
  permit("admin.sesiones.cerrar"),
  (req, res) => {
    try {
      const { sessionId } = req.params;
      
      // Validar que la sesión existe
      const session = dbUsers.prepare("SELECT id FROM user_sessions WHERE id=?").get(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Sesión no encontrada" });
      }
      
      dbUsers.prepare(`DELETE FROM user_sessions WHERE id=?`).run(sessionId);
      res.json({ ok: true });
    } catch (err) {
      console.error("Error cerrando sesión:", err);
      res.status(500).json({ error: "Error cerrando sesión" });
    }
  }
);

// Cerrar TODAS las sesiones de un usuario
router.delete(
  "/admin/users/:id/sessions",
  checkAdmin,
  permit("admin.sesiones.cerrar_todas"),
  (req, res) => {
    try {
      const { id } = req.params;
      
      // Validar que el usuario existe
      const usuario = dbUsers.prepare("SELECT id FROM users WHERE id=?").get(id);
      if (!usuario) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
      
      dbUsers.prepare(`DELETE FROM user_sessions WHERE user_id=?`).run(id);
      res.json({ ok: true });
    } catch (err) {
      console.error("Error cerrando sesiones:", err);
      res.status(500).json({ error: "Error cerrando sesiones" });
    }
  }
);

/* ============================================================
   🔵 FOTO DE PERFIL
   ============================================================ */
router.post(
  "/admin/users/:id/photo",
  checkAdmin,
  permit("admin.fotos.subir"),
  upload.single("photo"),
  (req, res) => {
    const { id } = req.params;

    if (!req.file)
      return res.status(400).json({ error: "No se envió foto" });

    try {
      // 🔥 Obtener foto anterior para eliminarla si tiene extensión diferente
      const userAnterior = dbUsers.prepare(`SELECT photo FROM users WHERE id=?`).get(id);
      const fotoAnterior = userAnterior?.photo;
      
      const filename = req.file.filename;
      dbUsers.prepare(`UPDATE users SET photo=? WHERE id=?`).run(filename, id);

      // 🔥 Eliminar foto anterior si existe y tiene extensión diferente
      if (fotoAnterior && fotoAnterior !== filename) {
        const rutaFotoAnterior = path.join("uploads/perfiles", fotoAnterior);
        if (fs.existsSync(rutaFotoAnterior)) {
          try {
            fs.unlinkSync(rutaFotoAnterior);
            console.log(`🗑️ [ADMIN] Foto anterior eliminada: ${fotoAnterior}`);
          } catch (e) {
            console.warn(`⚠️ [ADMIN] No se pudo eliminar foto anterior: ${e.message}`);
          }
        }
      }

      // Emitir evento de actualización
      getIO().emit("usuarios_actualizados");
      getIO().emit("usuario_foto_actualizada", { id, photo: filename });

      res.json({ ok: true, photo: filename });
    } catch (err) {
      console.error("Error guardando foto:", err);
      res.status(500).json({ error: "Error al guardar foto" });
    }
  }
);

/* ============================================================
   🔵 RUTA DE VISTA (sin cambios, solo vista)
   ============================================================ */
router.get("/admin/usuarios", authRequired, (req, res) => {
  try {
    const rows = dbUsers.prepare(`
      SELECT u.id, u.name AS nombre, u.phone AS telefono, u.es_sistema, u.photo,
            (SELECT r.name
             FROM roles r
             JOIN user_roles ur ON ur.role_id=r.id
             WHERE ur.user_id=u.id LIMIT 1) AS rol
      FROM users u
      ORDER BY u.es_sistema DESC, u.id ASC
    `).all();

    res.json(rows);
  } catch (err) {
    console.error("GET /admin/usuarios:", err);
    res.status(500).json({ error: "Error cargando usuarios" });
  }
});

/* ============================================================
   🔵 CRUD USERS
   ============================================================ */

// GET usuarios
router.get(
  "/admin/users",
  checkAdmin,
  (_req, res) => {
    try {
      // Verificar si la columna username existe
      const tableInfo = dbUsers.prepare(`PRAGMA table_info(users)`).all();
      const hasUsername = tableInfo.some(col => col.name === 'username');
      const hasPasswordHash = tableInfo.some(col => col.name === 'password_hash');
      const hasPasswordTemp = tableInfo.some(col => col.name === 'password_temporary');

      // Agregar columnas si no existen
      if (!hasUsername) {
        try {
          dbUsers.exec(`ALTER TABLE users ADD COLUMN username TEXT;`);
        } catch (e) {
          // Error agregando username
        }
      }
      if (!hasPasswordHash) {
        try {
          dbUsers.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT;`);
        } catch (e) {
          // Error agregando password_hash
        }
      }
      if (!hasPasswordTemp) {
        try {
          dbUsers.exec(`ALTER TABLE users ADD COLUMN password_temporary INTEGER DEFAULT 0;`);
        } catch (e) {
          // Error agregando password_temporary
        }
      }

      // Construir query dinámicamente según las columnas disponibles
      const selectColumns = ['id', 'name', 'phone', 'active', 'nickname', 'photo', 'created_at', 'es_sistema'];
      if (hasUsername || tableInfo.some(col => col.name === 'username')) {
        selectColumns.push('username');
      }
      
      const query = `SELECT ${selectColumns.join(',')} FROM users ORDER BY es_sistema DESC, name ASC`;
      const rows = dbUsers.prepare(query).all();

      res.json(rows);
    } catch (err) {
      console.error("Error en GET /admin/users:", err);
      res.status(500).json({ error: "Error cargando usuarios" });
    }
  }
);

// GET usuario individual por ID
router.get(
  "/admin/users/:id",
  checkAdmin,
  (req, res) => {
    try {
      const { id } = req.params;
      
      // Verificar si la columna username existe
      const tableInfo = dbUsers.prepare(`PRAGMA table_info(users)`).all();
      const hasUsername = tableInfo.some(col => col.name === 'username');
      
      // Construir query dinámicamente según las columnas disponibles
      const selectColumns = ['id', 'name', 'phone', 'active', 'nickname', 'photo', 'created_at', 'es_sistema'];
      if (hasUsername || tableInfo.some(col => col.name === 'username')) {
        selectColumns.push('username');
      }
      
      const query = `SELECT ${selectColumns.join(',')} FROM users WHERE id=?`;
      const usuario = dbUsers.prepare(query).get(id);
      
      if (!usuario) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
      
      res.json(usuario);
    } catch (err) {
      console.error("Error en GET /admin/users/:id:", err);
      res.status(500).json({ error: "Error cargando usuario" });
    }
  }
);

// Crear usuario
router.post(
  "/admin/users",
  checkAdmin,
  (req, res) => {
    const { name, phone, active = 1, nickname, username } = req.body || {};
    if (!name || !phone)
      return res.status(400).json({ error: "Faltan name/phone" });

    try {
      // Verificar si la columna username existe
      const tableInfo = dbUsers.prepare(`PRAGMA table_info(users)`).all();
      const hasUsername = tableInfo.some(col => col.name === 'username');
      
      let query, params;
      if (hasUsername) {
        query = "INSERT INTO users (name,phone,active,nickname,username) VALUES (?,?,?,?,?)";
        params = [name, phone, active ? 1 : 0, nickname || null, username || null];
      } else {
        query = "INSERT INTO users (name,phone,active,nickname) VALUES (?,?,?,?)";
        params = [name, phone, active ? 1 : 0, nickname || null];
      }
      
      const info = dbUsers.prepare(query).run(...params);
      const userId = info.lastInsertRowid;

      // Crear empleado en RRHH automáticamente con todos los datos disponibles
      try {
        const nombreCompleto = name.split(' ');
        const nombre = nombreCompleto[0] || name;
        const apellidos = nombreCompleto.slice(1).join(' ') || '';
        const codigo = `EMP${String(userId).padStart(4, '0')}`;
        const fechaIngreso = new Date().toISOString().split('T')[0];
        
        // Verificar si ya existe un empleado con este código
        const empleadoExistente = dbRRHH
          .prepare("SELECT id FROM empleados WHERE codigo = ?")
          .get(codigo);
        
        if (!empleadoExistente) {
          dbRRHH.prepare(`
            INSERT INTO empleados (
              codigo, nombre, apellidos, telefono, fecha_ingreso, 
              activo, fecha_creacion
            ) VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
          `).run(codigo, nombre, apellidos, phone, fechaIngreso, active ? 1 : 0);
        }
      } catch (e) {
        console.error("Error creando empleado en RRHH:", e);
        // No fallar si no se puede crear el empleado, solo loguear
      }

      // Incluir username en el SELECT si existe
      let selectQuery;
      if (hasUsername) {
        selectQuery = "SELECT id,name,phone,active,nickname,photo,username,created_at FROM users WHERE id=?";
      } else {
        selectQuery = "SELECT id,name,phone,active,nickname,photo,created_at FROM users WHERE id=?";
      }
      
      const nuevo = dbUsers.prepare(selectQuery).get(userId);

      // Emitir evento de actualización
      getIO().emit("usuarios_actualizados");
      getIO().emit("usuario_creado", nuevo);

      res.json(nuevo);
    } catch (e) {
      if (String(e.message).includes("UNIQUE"))
        return res.status(400).json({ error: "Ese phone ya existe o ese username ya está en uso" });

      res.status(500).json({ error: "Error creando usuario" });
    }
  }
);

// Editar usuario
router.put(
  "/admin/users/:id",
  checkAdmin,
  (req, res) => {
    const { id } = req.params;
    const u = dbUsers.prepare("SELECT * FROM users WHERE id=?").get(id);

    if (!u) return res.status(404).json({ error: "No encontrado" });

    const { name, phone, active, nickname, username } = req.body || {};

    try {
      // Si nickname está presente en el body (incluso si es null o cadena vacía), usarlo
      // Si no está presente, mantener el valor anterior
      const nicknameFinal = 'nickname' in req.body 
        ? (nickname === "" || nickname === null ? null : nickname)
        : u.nickname;

      const usernameFinal = 'username' in req.body 
        ? (username === "" || username === null ? null : username)
        : u.username;

      const activeValue = typeof active === "number" ? (active ? 1 : 0) : u.active;
      const finalName = name ?? u.name;
      
      dbUsers
        .prepare(
          "UPDATE users SET name=?, phone=?, active=?, nickname=?, username=? WHERE id=?"
        )
        .run(
          finalName,
          phone ?? u.phone,
          activeValue,
          nicknameFinal,
          usernameFinal,
          id
        );

      // Actualizar empleado en RRHH si existe (buscar por código que contiene el user_id)
      try {
        const codigoEmpleado = `EMP${String(id).padStart(4, '0')}`;
        const empleadoExistente = dbRRHH
          .prepare("SELECT id FROM empleados WHERE codigo = ?")
          .get(codigoEmpleado);
        
        if (empleadoExistente) {
          const nombreCompleto = finalName.split(' ');
          const nombre = nombreCompleto[0] || finalName;
          const apellidos = nombreCompleto.slice(1).join(' ') || '';
          const telefonoFinal = phone ?? u.phone;
          
          dbRRHH.prepare(`
            UPDATE empleados 
            SET nombre = ?, apellidos = ?, telefono = ?, activo = ?, fecha_actualizacion = datetime('now', 'localtime')
            WHERE codigo = ?
          `).run(nombre, apellidos, telefonoFinal, activeValue, codigoEmpleado);
        } else {
          // Crear empleado si no existe para mantener sincronización
          const nombreCompleto = finalName.split(' ');
          const nombre = nombreCompleto[0] || finalName;
          const apellidos = nombreCompleto.slice(1).join(' ') || '';
          const telefonoFinal = phone ?? u.phone;
          
          dbRRHH.prepare(`
            INSERT INTO empleados (
              codigo, nombre, apellidos, telefono, fecha_ingreso, 
              activo, fecha_creacion
            ) VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
          `).run(
            codigoEmpleado, 
            nombre, 
            apellidos, 
            telefonoFinal, 
            new Date().toISOString().split('T')[0], 
            activeValue
          );
        }
      } catch (e) {
        console.error("Error actualizando empleado en RRHH:", e);
        // No fallar si no se puede actualizar el empleado
      }

      const updated = dbUsers
        .prepare(
          "SELECT id,name,phone,active,nickname,photo,username,created_at FROM users WHERE id=?"
        )
        .get(id);

      // Emitir evento de actualización
      getIO().emit("usuarios_actualizados");
      getIO().emit("usuario_actualizado", updated);

      res.json({ ok: true, user: updated });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Error actualizando usuario" });
    }
  }
);

// Borrar usuario
router.delete(
  "/admin/users/:id",
  checkAdmin,
  (req, res) => {
    try {
      const { id } = req.params;
      
      // Validar que el usuario existe antes de eliminar
      const usuario = dbUsers.prepare("SELECT id, es_sistema, nickname FROM users WHERE id=?").get(id);
      if (!usuario) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
      
      // No permitir eliminar usuarios del sistema
      if (usuario.es_sistema) {
        return res.status(400).json({ error: "No puedes eliminar un usuario del sistema" });
      }
      
      // No permitir auto-eliminación
      const currentUserId = req.user?.id;
      if (currentUserId && parseInt(id) === parseInt(currentUserId)) {
        return res.status(400).json({ error: "No puedes eliminar tu propio usuario" });
      }
      
      // Usar transacción para asegurar atomicidad
      const deleteUser = dbUsers.transaction((userId, userNickname) => {
        // Eliminar permisos, roles y sesiones del usuario
        dbUsers.prepare("DELETE FROM user_permissions WHERE user_id=?").run(userId);
        dbUsers.prepare("DELETE FROM user_roles WHERE user_id=?").run(userId);
        dbUsers.prepare("DELETE FROM user_sessions WHERE user_id=?").run(userId);
        
        // Eliminar al usuario de todos los grupos de chat
        if (userNickname) {
          try {
            dbChat.prepare("DELETE FROM chat_grupos_miembros WHERE usuario_nickname=?").run(userNickname);
            console.log(`✅ Usuario ${userNickname} eliminado de todos los grupos de chat`);
          } catch (err) {
            console.error(`⚠️ Error al eliminar usuario ${userNickname} de grupos de chat:`, err);
          }
        }
        
        // Eliminar el usuario
        dbUsers.prepare("DELETE FROM users WHERE id=?").run(userId);
      });
      
      deleteUser(id, usuario.nickname);
      
      registrarAccion({
        usuario: req.user?.name || req.user?.username || "Admin",
        accion: "ELIMINAR_USUARIO",
        detalle: `Usuario eliminado: ID ${id}, Nickname: ${usuario.nickname}`,
        tabla: "users",
        registroId: id,
      });
      
      // Emitir evento de actualización
      getIO().emit("usuarios_actualizados");
      getIO().emit("usuario_eliminado", { id, nickname: usuario.nickname });
      getIO().emit("grupos_actualizados"); // Notificar actualización de grupos
      
      res.json({ ok: true });
    } catch (err) {
      console.error("Error eliminando usuario:", err);
      res.status(500).json({ error: "Error eliminando usuario" });
    }
  }
);

/* ============================================================
   🔵 RESTABLECER CONTRASEÑA (solo admin)
   ============================================================ */
router.post(
  "/admin/users/:id/reset-password",
  checkAdmin,
  permit("admin.usuarios.editar"),
  async (req, res) => {
    const { id } = req.params;
    const { temporaryPassword } = req.body || {};

    if (!temporaryPassword || temporaryPassword.length < 6) {
      return res.status(400).json({ 
        error: "La contraseña temporal debe tener al menos 6 caracteres" 
      });
    }

    try {
      const user = dbUsers.prepare("SELECT id FROM users WHERE id=?").get(id);
      if (!user) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      const passwordHash = await hashPassword(temporaryPassword);

      // Actualizar contraseña y marcar como temporal
      const result = dbUsers.prepare(`
        UPDATE users 
        SET password_hash = ?, password_temporary = 1 
        WHERE id = ?
      `).run(passwordHash, id);

      // Verificar que se actualizó correctamente
      const updated = dbUsers.prepare("SELECT id, username, password_hash IS NOT NULL as has_password FROM users WHERE id=?").get(id);

      // Cerrar todas las sesiones del usuario para forzar nuevo login
      dbUsers.prepare("DELETE FROM user_sessions WHERE user_id=?").run(id);

      res.json({ 
        ok: true, 
        message: "Contraseña restablecida. El usuario deberá cambiarla en el próximo login." 
      });
    } catch (err) {
      console.error("Error restableciendo contraseña:", err);
      res.status(500).json({ error: "Error al restablecer contraseña" });
    }
  }
);

/* ============================================================
   🔵 ROLES / PERMISOS
   ============================================================ */

// Obtener roles de usuario
router.get(
  "/admin/users/:id/roles",
  checkAdmin,
  permit("admin.roles.ver"),
  (req, res) => {
    const { id } = req.params;

    const roles = dbUsers
      .prepare(
        `SELECT r.name 
         FROM roles r 
         JOIN user_roles ur ON ur.role_id=r.id
         WHERE ur.user_id=?`
      )
      .all(id)
      .map((r) => r.name);

    res.json(roles);
  }
);

// Obtener permisos del usuario (directos + por roles)
router.get(
  "/admin/users/:id/perms",
  checkAdmin,
  permit("admin.permisos.ver"),
  (req, res) => {
    const { id } = req.params;

    // Obtener permisos directos y por roles (igual que en autenticación)
    const perms = dbUsers
      .prepare(
        `SELECT DISTINCT p.perm 
         FROM permissions p
         WHERE EXISTS (
           SELECT 1 FROM user_permissions up 
           WHERE up.perm_id = p.id AND up.user_id = ?
         ) OR EXISTS (
           SELECT 1 FROM user_roles ur
           JOIN role_permissions rp ON rp.role_id = ur.role_id
           WHERE ur.user_id = ? AND rp.perm_id = p.id
         )`
      )
      .all(id, id)
      .map((p) => p.perm);

    res.json(perms);
  }
);

// Asignar roles
router.put(
  "/admin/users/:id/roles",
  checkAdmin,
  permit("admin.roles.crear"),
  (req, res) => {
    const { roles = [] } = req.body || {};
    const u = dbUsers.prepare("SELECT id FROM users WHERE id=?").get(req.params.id);

    if (!u) return res.status(404).json({ error: "Usuario no encontrado" });

    // Usar transacción para asegurar atomicidad
    const updateRoles = dbUsers.transaction((userId, rolesArray) => {
      dbUsers.prepare("DELETE FROM user_roles WHERE user_id=?").run(userId);

      const getId = dbUsers.prepare("SELECT id FROM roles WHERE name=?");
      const insert = dbUsers.prepare(
        "INSERT OR IGNORE INTO user_roles (user_id,role_id) VALUES (?,?)"
      );

      for (const r of rolesArray) {
        const rr = getId.get(r);
        if (rr) insert.run(userId, rr.id);
      }
    });

    updateRoles(u.id, roles);

    // ⚠️ NO invalidar sesiones - los permisos se consultan en tiempo real desde la BD
    // Solo invalidar si el usuario editado es diferente al que está haciendo la acción
    // Esto evita que el admin pierda su sesión al editar sus propios permisos
    const currentUserId = req.user?.id;
    if (currentUserId && u.id !== currentUserId) {
      dbUsers.prepare("DELETE FROM user_sessions WHERE user_id=?").run(u.id);
    }

    // Emitir evento de actualización
    getIO().emit("usuarios_actualizados");
    getIO().emit("usuario_roles_actualizados", { userId: u.id });

    res.json({ ok: true });
  }
);

// Asignar permisos
router.put(
  "/admin/users/:id/perms",
  checkAdmin,
  permit("admin.permisos.asignar"),
  (req, res) => {
    const { perms = [] } = req.body || {};
    const u = dbUsers.prepare("SELECT id FROM users WHERE id=?").get(req.params.id);

    if (!u) return res.status(404).json({ error: "Usuario no encontrado" });

    // Usar transacción para asegurar atomicidad
    const updatePerms = dbUsers.transaction((userId, permsArray) => {
      dbUsers.prepare("DELETE FROM user_permissions WHERE user_id=?").run(userId);

      const getPid = dbUsers.prepare("SELECT id FROM permissions WHERE perm=?");
      const ins = dbUsers.prepare(
        "INSERT OR IGNORE INTO user_permissions (user_id,perm_id) VALUES (?,?)"
      );

      for (const p of permsArray) {
        const pid = getPid.get(p);
        if (pid) ins.run(userId, pid.id);
      }
    });

    updatePerms(u.id, perms);

    // ⚠️ NO invalidar sesiones - los permisos se consultan en tiempo real desde la BD
    // Solo invalidar si el usuario editado es diferente al que está haciendo la acción
    // Esto evita que el admin pierda su sesión al editar sus propios permisos
    const currentUserId = req.user?.id;
    if (currentUserId && u.id !== currentUserId) {
      dbUsers.prepare("DELETE FROM user_sessions WHERE user_id=?").run(u.id);
    }

    // Emitir evento de actualización
    getIO().emit("usuarios_actualizados");
    getIO().emit("usuario_permisos_actualizados", { userId: u.id });

    res.json({ ok: true });
  }
);

// Listar roles
router.get(
  "/admin/roles",
  checkAdmin,
  permit("admin.roles.ver"),
  (_req, res) => {
    const roles = dbUsers
      .prepare("SELECT id,name FROM roles ORDER BY name ASC")
      .all();
    res.json(roles);
  }
);

// Obtener permisos de un rol
router.get(
  "/admin/roles/:id/perms",
  checkAdmin,
  permit("admin.roles.ver"),
  (req, res) => {
    try {
      const { id } = req.params;
      
      const perms = dbUsers
        .prepare(`
          SELECT p.perm 
          FROM permissions p 
          JOIN role_permissions rp ON rp.perm_id = p.id
          WHERE rp.role_id = ?
        `)
        .all(id)
        .map((p) => p.perm);
      
      res.json(perms);
    } catch (err) {
      console.error("Error obteniendo permisos del rol:", err);
      res.status(500).json({ error: "Error obteniendo permisos del rol" });
    }
  }
);

// Crear nuevo rol
router.post(
  "/admin/roles",
  checkAdmin,
  permit("admin.roles.crear"),
  (req, res) => {
    try {
      const { name, perms = [] } = req.body || {};
      
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "El nombre del rol es requerido" });
      }

      // No permitir crear otro rol llamado CEO
      if (name.trim().toUpperCase() === "CEO") {
        return res.status(400).json({ error: "No se puede crear un rol con el nombre 'CEO' - es el rol principal del sistema" });
      }

      // Verificar si el rol ya existe
      const rolExistente = dbUsers
        .prepare("SELECT id FROM roles WHERE name = ?")
        .get(name.trim());
      
      if (rolExistente) {
        return res.status(400).json({ error: "El rol ya existe" });
      }

      const result = dbUsers
        .prepare("INSERT INTO roles (name) VALUES (?)")
        .run(name.trim());

      const nuevoRol = dbUsers
        .prepare("SELECT id, name FROM roles WHERE id = ?")
        .get(result.lastInsertRowid);

      // Asignar permisos al rol si se proporcionaron
      if (Array.isArray(perms) && perms.length > 0) {
        const getPermId = dbUsers.prepare("SELECT id FROM permissions WHERE perm = ?");
        const insertPerm = dbUsers.prepare(
          "INSERT OR IGNORE INTO role_permissions (role_id, perm_id) VALUES (?, ?)"
        );
        
        for (const perm of perms) {
          const permObj = getPermId.get(perm);
          if (permObj) {
            insertPerm.run(nuevoRol.id, permObj.id);
          }
        }
      }

      registrarAccion({
        usuario: req.user?.name || req.user?.username || "Admin",
        accion: "CREAR_ROL",
        detalle: `Rol creado: ${name.trim()}${perms.length > 0 ? ` con ${perms.length} permisos` : ""}`,
        tabla: "roles",
        registroId: nuevoRol.id,
      });

      // Emitir evento de actualización
      getIO().emit("roles_actualizados");
      getIO().emit("rol_creado", nuevoRol);

      res.json(nuevoRol);
    } catch (err) {
      console.error("Error creando rol:", err);
      res.status(500).json({ error: "Error creando rol" });
    }
  }
);

// Editar rol
router.put(
  "/admin/roles/:id",
  checkAdmin,
  permit("admin.roles.editar"),
  (req, res) => {
    try {
      const { id } = req.params;
      const { name, perms } = req.body || {};
      
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "El nombre del rol es requerido" });
      }

      // Verificar que el rol existe
      const rol = dbUsers
        .prepare("SELECT id, name FROM roles WHERE id = ?")
        .get(id);
      
      if (!rol) {
        return res.status(404).json({ error: "Rol no encontrado" });
      }

      // El rol CEO no puede cambiar de nombre
      const nombreFinal = rol.name === "CEO" ? "CEO" : name.trim();
      
      // No permitir crear otro rol llamado CEO
      if (nombreFinal.toUpperCase() === "CEO" && rol.name !== "CEO") {
        return res.status(400).json({ error: "No se puede usar el nombre 'CEO' para otro rol" });
      }

      // Verificar si el nuevo nombre ya existe (excepto el mismo rol)
      const rolExistente = dbUsers
        .prepare("SELECT id FROM roles WHERE name = ? AND id != ?")
        .get(nombreFinal, id);
      
      if (rolExistente) {
        return res.status(400).json({ error: "Ya existe otro rol con ese nombre" });
      }

      dbUsers
        .prepare("UPDATE roles SET name = ? WHERE id = ?")
        .run(nombreFinal, id);

      // Actualizar permisos si se proporcionaron
      if (perms !== undefined) {
        // Usar transacción para asegurar atomicidad
        const updateRolePerms = dbUsers.transaction((roleId, permsArray) => {
          // Eliminar permisos actuales del rol
          dbUsers.prepare("DELETE FROM role_permissions WHERE role_id = ?").run(roleId);
          
          // Asignar nuevos permisos
          if (Array.isArray(permsArray) && permsArray.length > 0) {
            const getPermId = dbUsers.prepare("SELECT id FROM permissions WHERE perm = ?");
            const insertPerm = dbUsers.prepare(
              "INSERT OR IGNORE INTO role_permissions (role_id, perm_id) VALUES (?, ?)"
            );
            
            for (const perm of permsArray) {
              const permObj = getPermId.get(perm);
              if (permObj) {
                insertPerm.run(roleId, permObj.id);
              }
            }
          }
        });

        updateRolePerms(id, perms);
      }

      registrarAccion({
        usuario: req.user?.name || req.user?.username || "Admin",
        accion: "EDITAR_ROL",
        detalle: `Rol editado: ${rol.name}${rol.name !== nombreFinal ? ` -> ${nombreFinal}` : ""}${perms !== undefined ? ` (${Array.isArray(perms) ? perms.length : 0} permisos)` : ""}`,
        tabla: "roles",
        registroId: id,
      });

      const rolActualizado = dbUsers
        .prepare("SELECT id, name FROM roles WHERE id = ?")
        .get(id);

      // Emitir evento de actualización
      getIO().emit("roles_actualizados");
      getIO().emit("rol_actualizado", rolActualizado);
      getIO().emit("usuarios_actualizados"); // También actualizar usuarios porque pueden tener este rol

      res.json(rolActualizado);
    } catch (err) {
      console.error("Error editando rol:", err);
      res.status(500).json({ error: "Error editando rol" });
    }
  }
);

// Eliminar rol
router.delete(
  "/admin/roles/:id",
  checkAdmin,
  permit("admin.roles.eliminar"),
  (req, res) => {
    try {
      const { id } = req.params;

      // Verificar que el rol existe
      const rol = dbUsers
        .prepare("SELECT id, name FROM roles WHERE id = ?")
        .get(id);
      
      if (!rol) {
        return res.status(404).json({ error: "Rol no encontrado" });
      }

      // No permitir eliminar el rol "CEO" (rol principal del sistema)
      if (rol.name === "CEO") {
        return res.status(400).json({ error: "No se puede eliminar el rol 'CEO' - es el rol principal del sistema" });
      }

      // Verificar si hay usuarios con este rol
      const usuariosConRol = dbUsers
        .prepare(`
          SELECT COUNT(*) as count 
          FROM user_roles ur 
          JOIN roles r ON ur.role_id = r.id 
          WHERE r.id = ?
        `)
        .get(id);
      
      if (usuariosConRol.count > 0) {
        return res.status(400).json({ 
          error: `No se puede eliminar el rol porque ${usuariosConRol.count} usuario(s) lo tienen asignado` 
        });
      }

      // Usar transacción para asegurar atomicidad
      const deleteRole = dbUsers.transaction((roleId) => {
        // Eliminar permisos del rol
        dbUsers
          .prepare("DELETE FROM role_permissions WHERE role_id = ?")
          .run(roleId);

        // Eliminar el rol
        dbUsers
          .prepare("DELETE FROM roles WHERE id = ?")
          .run(roleId);
      });

      deleteRole(id);

      registrarAccion({
        usuario: req.user?.name || req.user?.username || "Admin",
        accion: "ELIMINAR_ROL",
        detalle: `Rol eliminado: ${rol.name}`,
        tabla: "roles",
        registroId: id,
      });

      // Emitir evento de actualización
      getIO().emit("roles_actualizados");
      getIO().emit("rol_eliminado", { id });
      getIO().emit("usuarios_actualizados"); // También actualizar usuarios porque pueden tener este rol

      res.json({ ok: true });
    } catch (err) {
      console.error("Error eliminando rol:", err);
      res.status(500).json({ error: "Error eliminando rol" });
    }
  }
);

// NOTA: El endpoint POST /admin/roles está implementado arriba (línea 739)
// Este endpoint duplicado ha sido eliminado para evitar confusión y mantener una sola implementación completa


// Listar permisos (requiere admin)
router.get(
  "/admin/perms",
  checkAdmin,
  permit("admin.permisos.ver"),
  (_req, res) => {
    const all = dbUsers
      .prepare("SELECT perm, visible_tablet, visible_celular FROM permissions ORDER BY perm ASC")
      .all();

    res.json(all);
  }
);

// Obtener visibilidad de pestañas (público - para todos los usuarios)
router.get(
  "/admin/perms/visibilidad",
  authRequired,
  (_req, res) => {
    try {
      const tabs = dbUsers
        .prepare("SELECT perm, visible_tablet, visible_celular FROM permissions WHERE perm LIKE 'tab:%' ORDER BY perm ASC")
        .all();

      res.json(tabs);
    } catch (err) {
      console.error("Error obteniendo visibilidad:", err);
      res.status(500).json({ error: "Error obteniendo visibilidad" });
    }
  }
);

// Actualizar visibilidad de pestaña en dispositivos
router.put(
  "/admin/perms/:perm/visibilidad",
  checkAdmin,
  permit("admin.permisos.asignar"),
  (req, res) => {
    const { perm } = req.params;
    const { visible_tablet, visible_celular } = req.body || {};

    try {
      const permRecord = dbUsers.prepare("SELECT id FROM permissions WHERE perm=?").get(perm);
      if (!permRecord) {
        return res.status(404).json({ error: "Permiso no encontrado" });
      }

      const updates = [];
      const params = [];

      if (visible_tablet !== undefined) {
        updates.push("visible_tablet = ?");
        params.push(visible_tablet ? 1 : 0);
      }

      if (visible_celular !== undefined) {
        updates.push("visible_celular = ?");
        params.push(visible_celular ? 1 : 0);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: "No se proporcionaron valores para actualizar" });
      }

      params.push(perm);
      const query = `UPDATE permissions SET ${updates.join(", ")} WHERE perm=?`;
      dbUsers.prepare(query).run(...params);

      res.json({ ok: true });
    } catch (err) {
      console.error("Error actualizando visibilidad:", err);
      res.status(500).json({ error: "Error actualizando visibilidad" });
    }
  }
);


// Migrar usuarios existentes a empleados
router.post(
  "/admin/migrar-usuarios-a-empleados",
  checkAdmin,
  (req, res) => {
    try {
      const usuarios = dbUsers
        .prepare("SELECT id, name, phone, active, nickname FROM users WHERE (es_sistema IS NULL OR es_sistema = 0)")
        .all();
      
      let migrados = 0;
      let actualizados = 0;
      let errores = 0;

      for (const usuario of usuarios) {
        try {
          const nombreCompleto = usuario.name.split(' ');
          const nombre = nombreCompleto[0] || usuario.name;
          const apellidos = nombreCompleto.slice(1).join(' ') || '';
          const codigo = `EMP${String(usuario.id).padStart(4, '0')}`;
          const fechaIngreso = new Date().toISOString().split('T')[0];
          
          // Verificar si ya existe
          const empleadoExistente = dbRRHH
            .prepare("SELECT id FROM empleados WHERE codigo = ?")
            .get(codigo);
          
          if (empleadoExistente) {
            // Actualizar datos existentes
            dbRRHH.prepare(`
              UPDATE empleados 
              SET nombre = ?, apellidos = ?, telefono = ?, activo = ?, 
                  fecha_actualizacion = datetime('now', 'localtime')
              WHERE codigo = ?
            `).run(nombre, apellidos, usuario.phone, usuario.active ? 1 : 0, codigo);
            actualizados++;
          } else {
            // Crear nuevo empleado
            dbRRHH.prepare(`
              INSERT INTO empleados (
                codigo, nombre, apellidos, telefono, fecha_ingreso, 
                activo, fecha_creacion
              ) VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
            `).run(codigo, nombre, apellidos, usuario.phone, fechaIngreso, usuario.active ? 1 : 0);
            migrados++;
          }
        } catch (e) {
          console.error(`Error migrando usuario ${usuario.id}:`, e);
          errores++;
        }
      }

      res.json({
        ok: true,
        total: usuarios.length,
        migrados,
        actualizados,
        errores
      });
    } catch (err) {
      console.error("Error en migración:", err);
      res.status(500).json({ error: "Error migrando usuarios" });
    }
  }
);

/* ============================================================
   SOCKET PRUEBA
   ============================================================ */
router.get(
  "/emitir-prueba",
  checkAdmin,
  permit("admin.actividad.registrar"),
  (_req, res) => {
    getIO().emit("productos_actualizados", [
      { id: 1, nombre: "Prueba de socket" },
    ]);
    res.json({ ok: true });
  }
);

/* ============================================================
   🔵 AUDITORÍA — HISTORIAL DE ACCIONES
   ============================================================ */

// Obtener historial de auditoría
router.get(
  "/admin/auditoria",
  checkAdmin,
  permit("admin.actividad.registrar"),
  (req, res) => {
    try {
      const { usuario, accion, fecha, limite = 500, offset = 0 } = req.query;

      let query = "SELECT * FROM auditoria WHERE 1=1";
      const params = [];

      if (usuario) {
        query += " AND usuario LIKE ?";
        params.push(`%${usuario}%`);
      }

      if (accion) {
        query += " AND accion LIKE ?";
        params.push(`%${accion}%`);
      }

      // Filtrar por fecha (formato YYYY-MM-DD)
      if (fecha) {
        // Usar STRFTIME para extraer solo la fecha y comparar correctamente
        query += " AND STRFTIME('%Y-%m-%d', fecha) = ?";
        params.push(fecha);
      } else {
        // Por defecto, solo mostrar el día actual (usar fecha local de JavaScript)
        const hoy = new Date();
        const año = hoy.getFullYear();
        const mes = String(hoy.getMonth() + 1).padStart(2, '0');
        const dia = String(hoy.getDate()).padStart(2, '0');
        const fechaHoy = `${año}-${mes}-${dia}`;
        query += " AND STRFTIME('%Y-%m-%d', fecha) = ?";
        params.push(fechaHoy);
      }

      query += " ORDER BY fecha DESC LIMIT ? OFFSET ?";
      params.push(Number(limite), Number(offset));

      const rows = dbAud.prepare(query).all(...params);

      // Obtener total para paginación
      let countQuery = "SELECT COUNT(*) as total FROM auditoria WHERE 1=1";
      const countParams = [];
      if (usuario) {
        countQuery += " AND usuario LIKE ?";
        countParams.push(`%${usuario}%`);
      }
      if (accion) {
        countQuery += " AND accion LIKE ?";
        countParams.push(`%${accion}%`);
      }
      if (fecha) {
        countQuery += " AND STRFTIME('%Y-%m-%d', fecha) = ?";
        countParams.push(fecha);
      } else {
        const hoy = new Date();
        const año = hoy.getFullYear();
        const mes = String(hoy.getMonth() + 1).padStart(2, '0');
        const dia = String(hoy.getDate()).padStart(2, '0');
        const fechaHoy = `${año}-${mes}-${dia}`;
        countQuery += " AND STRFTIME('%Y-%m-%d', fecha) = ?";
        countParams.push(fechaHoy);
      }
      const total = dbAud.prepare(countQuery).get(...countParams)?.total || 0;

      res.json({ registros: rows, total });
    } catch (err) {
      console.error("Error obteniendo auditoría:", err);
      res.status(500).json({ error: "Error obteniendo auditoría" });
    }
  }
);

// ============================================================
// 🔒 EVENTOS DE SEGURIDAD
// ============================================================

// Obtener eventos de seguridad
router.get(
  "/admin/eventos-seguridad",
  authRequired,
  permit("tab:admin"),
  (req, res) => {
    try {
      const { tipo, ip, limite = 500, offset = 0 } = req.query;

      let query = "SELECT * FROM security_events WHERE 1=1";
      const params = [];

      if (tipo) {
        query += " AND event_type LIKE ?";
        params.push(`%${tipo}%`);
      }

      if (ip) {
        query += " AND ip LIKE ?";
        params.push(`%${ip}%`);
      }

      query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
      params.push(Number(limite), Number(offset));

      const rows = dbUsers.prepare(query).all(...params);

      // Parsear detalles JSON
      const rowsParsed = rows.map(row => {
        let details = null;
        if (row.details) {
          try {
            details = JSON.parse(row.details);
          } catch (parseErr) {
            // Si no se puede parsear, mantener como string
            details = row.details;
          }
        }
        return {
          ...row,
          details
        };
      });

      // Obtener total para paginación
      let countQuery = "SELECT COUNT(*) as total FROM security_events WHERE 1=1";
      const countParams = [];
      if (tipo) {
        countQuery += " AND event_type LIKE ?";
        countParams.push(`%${tipo}%`);
      }
      if (ip) {
        countQuery += " AND ip LIKE ?";
        countParams.push(`%${ip}%`);
      }
      const total = dbUsers.prepare(countQuery).get(...countParams)?.total || 0;

      res.json({ eventos: rowsParsed, total });
    } catch (err) {
      console.error("Error obteniendo eventos de seguridad:", err);
      res.status(500).json({ error: "Error obteniendo eventos de seguridad" });
    }
  }
);

// Obtener estadísticas de seguridad
router.get(
  "/admin/estadisticas-seguridad",
  authRequired,
  permit("tab:admin"),
  (req, res) => {
    try {
      const stats = {
        totalEventos: dbUsers.prepare("SELECT COUNT(*) as count FROM security_events").get().count,
        eventosPorTipo: dbUsers.prepare(`
          SELECT event_type, COUNT(*) as count
          FROM security_events
          GROUP BY event_type
          ORDER BY count DESC
        `).all(),
        eventosRecientes: dbUsers.prepare(`
          SELECT COUNT(*) as count
          FROM security_events
          WHERE datetime(created_at, '+24 hours') > datetime('now')
        `).get().count,
        ipsBloqueadas: dbUsers.prepare("SELECT COUNT(*) as count FROM blocked_ips").get().count,
        verificacionesIP: dbUsers.prepare("SELECT COUNT(*) as count FROM ip_checks").get().count
      };

      res.json(stats);
    } catch (err) {
      console.error("Error obteniendo estadísticas de seguridad:", err);
      res.status(500).json({ error: "Error obteniendo estadísticas" });
    }
  }
);

// Obtener usuarios activos (desde sockets)
router.get(
  "/admin/usuarios-activos",
  checkAdmin,
  permit("admin.actividad.registrar"),
  (_req, res) => {
    try {
      const activos = getUsuariosActivos();
      
      // También obtener sesiones de la BD para más información
      const sesiones = dbUsers
        .prepare(`
          SELECT u.id, u.name, u.nickname, u.phone, u.photo,
                 s.created_at, s.last_seen_at
          FROM user_sessions s
          JOIN users u ON u.id = s.user_id
          WHERE u.active = 1
          ORDER BY s.last_seen_at DESC
        `)
        .all();

      res.json({ 
        activosSocket: activos,
        sesiones: sesiones 
      });
    } catch (err) {
      console.error("Error obteniendo usuarios activos:", err);
      res.status(500).json({ error: "Error obteniendo usuarios activos" });
    }
  }
);

/* ============================================================
   🎨 PERSONALIZACIÓN
   ============================================================ */

// Obtener configuración de personalización (público - accesible sin autenticación para mostrar en login)
router.get("/admin/personalizacion", async (req, res) => {
  try {
    const configs = dbUsers
      .prepare("SELECT clave, valor FROM personalizacion")
      .all();

    const config = {};
    configs.forEach((c) => {
      try {
        config[c.clave] = JSON.parse(c.valor);
      } catch {
        config[c.clave] = c.valor;
      }
    });

    // Verificar si existen archivos - usar rutas absolutas
    const fs = (await import("fs")).default;
    const uploadsDir = "uploads/personalizacion";
    const uploadsDirAbs = path.join(process.cwd(), uploadsDir);
    
    try {
      // Verificar logo - buscar primero en la carpeta logos, luego en la raíz como fallback
      let logoArchivo = null;
      let logoEncontrado = false;
      
      const carpetaLogos = path.join(uploadsDirAbs, "logos");
      if (fs.existsSync(carpetaLogos)) {
        try {
          const archivosLogos = fs.readdirSync(carpetaLogos);
          logoArchivo = archivosLogos.find(f => f.toLowerCase().startsWith("logo."));
          if (logoArchivo) {
            logoEncontrado = true;
          }
        } catch (err) {
          // Error buscando logo en carpeta logos
        }
      }
      
      // Fallback: buscar en la raíz si no se encontró en la subcarpeta
      if (!logoEncontrado && fs.existsSync(uploadsDirAbs)) {
        try {
          const archivosRaiz = fs.readdirSync(uploadsDirAbs);
          logoArchivo = archivosRaiz.find(f => f.toLowerCase().includes("logo") && (f.toLowerCase().endsWith(".png") || f.toLowerCase().endsWith(".gif") || f.toLowerCase().endsWith(".svg") || f.toLowerCase().endsWith(".jpg")));
          if (logoArchivo) {
            logoEncontrado = true;
          }
        } catch (err) {
          // Error buscando logo en raíz
        }
      }
      
      if (logoEncontrado && logoArchivo) {
        const ext = path.extname(logoArchivo).toLowerCase();
        config.logo = true;
        if (ext === ".gif") config.logoTipo = "gif";
        else if (ext === ".svg") config.logoTipo = "svg";
        else if (ext === ".jpg" || ext === ".jpeg") config.logoTipo = "imagen";
        else config.logoTipo = "imagen";
      }

      // Verificar favicon - buscar primero en la carpeta favicons, luego en la raíz como fallback
      let faviconArchivo = null;
      let faviconEncontrado = false;
      
      const carpetaFavicons = path.join(uploadsDirAbs, "favicons");
      if (fs.existsSync(carpetaFavicons)) {
        try {
          const archivosFavicons = fs.readdirSync(carpetaFavicons);
          faviconArchivo = archivosFavicons.find(f => f.toLowerCase().startsWith("favicon."));
          if (faviconArchivo) {
            faviconEncontrado = true;
          }
        } catch (err) {
          // Error buscando favicon en carpeta favicons
        }
      }
      
      // Fallback: buscar en la raíz si no se encontró en la subcarpeta
      if (!faviconEncontrado && fs.existsSync(uploadsDirAbs)) {
        try {
          const archivosRaiz = fs.readdirSync(uploadsDirAbs);
          faviconArchivo = archivosRaiz.find(f => f.toLowerCase().includes("favicon") && (f.toLowerCase().endsWith(".ico") || f.toLowerCase().endsWith(".png") || f.toLowerCase().endsWith(".gif") || f.toLowerCase().endsWith(".svg")));
          if (faviconArchivo) {
            faviconEncontrado = true;
          }
        } catch (err) {
          // Error buscando favicon en raíz
        }
      }
      
      if (faviconEncontrado && faviconArchivo) {
        const ext = path.extname(faviconArchivo).toLowerCase();
        config.favicon = true;
        if (ext === ".gif") config.faviconTipo = "gif";
        else if (ext === ".svg") config.faviconTipo = "svg";
        else config.faviconTipo = "imagen";
      }

      // Verificar fondo - buscar primero en la carpeta fondos, luego en la raíz como fallback
      let fondoArchivo = null;
      let fondoEncontrado = false;
      
      const carpetaFondos = path.join(uploadsDirAbs, "fondos");
      if (fs.existsSync(carpetaFondos)) {
        try {
          const archivosFondos = fs.readdirSync(carpetaFondos);
          fondoArchivo = archivosFondos.find(f => f.toLowerCase().startsWith("fondo."));
          if (fondoArchivo) {
            fondoEncontrado = true;
          }
        } catch (err) {
          // Error buscando fondo en carpeta fondos
        }
      }
      
      // Fallback: buscar en la raíz si no se encontró en la subcarpeta
      if (!fondoEncontrado && fs.existsSync(uploadsDirAbs)) {
        try {
          const archivosRaiz = fs.readdirSync(uploadsDirAbs);
          fondoArchivo = archivosRaiz.find(f => f.toLowerCase().includes("fondo") && (f.toLowerCase().endsWith(".png") || f.toLowerCase().endsWith(".gif") || f.toLowerCase().endsWith(".mp4") || f.toLowerCase().endsWith(".jpg")));
          if (fondoArchivo) {
            fondoEncontrado = true;
          }
        } catch (err) {
          // Error buscando fondo en raíz
        }
      }
      
      if (fondoEncontrado && fondoArchivo) {
        const ext = path.extname(fondoArchivo).toLowerCase();
        config.fondo = true;
        if (ext === ".mp4") config.fondoTipo = "video";
        else if (ext === ".gif") config.fondoTipo = "gif";
        else config.fondoTipo = "imagen";
      }

      // Verificar fondo login - buscar solo en la carpeta fondos-login
      const carpetaFondosLogin = path.join(uploadsDirAbs, "fondos-login");
      if (fs.existsSync(carpetaFondosLogin)) {
        try {
          const archivosFondosLogin = fs.readdirSync(carpetaFondosLogin);
          const fondoLoginArchivo = archivosFondosLogin.find(f => f.toLowerCase().startsWith("fondo-login."));
          if (fondoLoginArchivo) {
            const ext = path.extname(fondoLoginArchivo).toLowerCase();
            config.fondoLogin = true;
            if (ext === ".mp4") config.fondoLoginTipo = "video";
            else if (ext === ".gif") config.fondoLoginTipo = "gif";
            else config.fondoLoginTipo = "imagen";
          }
        } catch (err) {
          // Error buscando fondo login en carpeta fondos-login
        }
      }

      // Verificar fondo login branding - buscar solo en la carpeta fondos-login-branding
      const carpetaFondosLoginBranding = path.join(uploadsDirAbs, "fondos-login-branding");
      if (fs.existsSync(carpetaFondosLoginBranding)) {
        try {
          const archivosFondosLoginBranding = fs.readdirSync(carpetaFondosLoginBranding);
          const fondoLoginBrandingArchivo = archivosFondosLoginBranding.find(f => f.toLowerCase().startsWith("fondo-login-branding."));
          if (fondoLoginBrandingArchivo) {
            const ext = path.extname(fondoLoginBrandingArchivo).toLowerCase();
            config.fondoLoginBranding = true;
            if (ext === ".mp4") config.fondoLoginBrandingTipo = "video";
            else if (ext === ".gif") config.fondoLoginBrandingTipo = "gif";
            else config.fondoLoginBrandingTipo = "imagen";
          }
        } catch (err) {
          // Error buscando fondo login branding en carpeta fondos-login-branding
        }
      }
    } catch (fsErr) {
      // Si no existe el directorio, no hay archivos
      console.error("❌ Error verificando archivos:", fsErr);
    }

    res.json(config);
  } catch (err) {
    console.error("❌ Error obteniendo personalización:", err);
    res.status(500).json({ error: "Error obteniendo personalización" });
  }
});

// Guardar configuración de personalización
router.post("/admin/personalizacion", checkAdmin, (req, res) => {
  try {
    const { 
      mensajeBienvenida, mensajeBienvenidaAncho, mensajeBienvenidaAlto, mensajeBienvenidaPosX, mensajeBienvenidaPosY, 
      mensajeBienvenidaTamañoFuente, mensajeBienvenidaAlineacionTexto, mensajeBienvenidaAlineacionVertical, 
      fondoTransparencia, fondoTipo, logoTipo, faviconTipo, 
      colorPrimario, colorSecundario, colorFondoPrincipal, nombreApp, nombre_tienda, tema,
      tienda_color_primario, tienda_color_secundario, tienda_color_fondo,
      tienda_descripcion, tienda_telefono, tienda_email, tienda_direccion, tienda_redes_sociales
    } = req.body;

    const guardarConfig = (clave, valor) => {
      const valorStr = typeof valor === "string" ? valor : JSON.stringify(valor);
      dbUsers
        .prepare(
          `INSERT INTO personalizacion (clave, valor) 
           VALUES (?, ?) 
           ON CONFLICT(clave) DO UPDATE SET valor = ?, actualizado_at = datetime('now', 'localtime')`
        )
        .run(clave, valorStr, valorStr);
    };

    if (mensajeBienvenida !== undefined) guardarConfig("mensajeBienvenida", mensajeBienvenida);
    if (mensajeBienvenidaAncho !== undefined) guardarConfig("mensajeBienvenidaAncho", mensajeBienvenidaAncho);
    if (mensajeBienvenidaAlto !== undefined) guardarConfig("mensajeBienvenidaAlto", mensajeBienvenidaAlto);
    if (mensajeBienvenidaPosX !== undefined) guardarConfig("mensajeBienvenidaPosX", mensajeBienvenidaPosX);
    if (mensajeBienvenidaPosY !== undefined) guardarConfig("mensajeBienvenidaPosY", mensajeBienvenidaPosY);
    if (mensajeBienvenidaTamañoFuente !== undefined) guardarConfig("mensajeBienvenidaTamañoFuente", mensajeBienvenidaTamañoFuente);
    if (mensajeBienvenidaAlineacionTexto !== undefined) guardarConfig("mensajeBienvenidaAlineacionTexto", mensajeBienvenidaAlineacionTexto);
    if (mensajeBienvenidaAlineacionVertical !== undefined) guardarConfig("mensajeBienvenidaAlineacionVertical", mensajeBienvenidaAlineacionVertical);
    if (fondoTransparencia !== undefined) guardarConfig("fondoTransparencia", fondoTransparencia);
    if (fondoTipo !== undefined) guardarConfig("fondoTipo", fondoTipo);
    if (logoTipo !== undefined) guardarConfig("logoTipo", logoTipo);
    if (faviconTipo !== undefined) guardarConfig("faviconTipo", faviconTipo);
    if (colorPrimario !== undefined) guardarConfig("colorPrimario", colorPrimario);
    if (colorSecundario !== undefined) guardarConfig("colorSecundario", colorSecundario);
    if (colorFondoPrincipal !== undefined) guardarConfig("colorFondoPrincipal", colorFondoPrincipal);
    if (nombreApp !== undefined) guardarConfig("nombreApp", nombreApp);
    if (nombre_tienda !== undefined) {
      guardarConfig("nombre_tienda", nombre_tienda);
      // Emitir evento de socket para actualizar la tienda en tiempo real
      const io = getIO();
      if (io) {
        io.emit("tienda_personalizacion_actualizada");
      }
    }
    if (tienda_color_primario !== undefined) guardarConfig("tienda_color_primario", tienda_color_primario);
    if (tienda_color_secundario !== undefined) guardarConfig("tienda_color_secundario", tienda_color_secundario);
    if (tienda_color_fondo !== undefined) guardarConfig("tienda_color_fondo", tienda_color_fondo);
    if (tienda_descripcion !== undefined) guardarConfig("tienda_descripcion", tienda_descripcion);
    if (tienda_telefono !== undefined) guardarConfig("tienda_telefono", tienda_telefono);
    if (tienda_email !== undefined) guardarConfig("tienda_email", tienda_email);
    if (tienda_direccion !== undefined) guardarConfig("tienda_direccion", tienda_direccion);
    if (tienda_redes_sociales !== undefined) guardarConfig("tienda_redes_sociales", JSON.stringify(tienda_redes_sociales));
    if (tema !== undefined) {
      guardarConfig("tema", tema);
      // Emitir evento de socket para sincronizar el tema global en todos los dispositivos
      const io = getIO();
      if (io) {
        io.emit("tema_global_actualizado", { tema });
      }
    }
    // Emitir evento de actualización de personalización de tienda
    const io = getIO();
    if (io && (tienda_color_primario !== undefined || tienda_color_secundario !== undefined || tienda_color_fondo !== undefined || tienda_descripcion !== undefined || tienda_telefono !== undefined || tienda_email !== undefined || tienda_direccion !== undefined || tienda_redes_sociales !== undefined)) {
      io.emit("tienda_personalizacion_actualizada");
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error guardando personalización:", err);
    res.status(500).json({ error: "Error guardando personalización" });
  }
});

// Listar imágenes guardadas por tipo
router.get("/admin/personalizacion/galeria/:tipo", checkAdmin, async (req, res) => {
  try {
    const { tipo } = req.params;
    
    if (!["fondos", "favicons", "logos", "fondos-login", "fondos-login-branding"].includes(tipo)) {
      return res.status(400).json({ error: "Tipo inválido. Use: fondos, favicons, logos, fondos-login o fondos-login-branding" });
    }
    
    const carpeta = path.join(process.cwd(), "uploads/personalizacion", tipo);
    const raizPersonalizacion = path.join(process.cwd(), "uploads/personalizacion");
    const archivos = [];
    
    const asegurarCarpeta = (dir) => {
      try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      } catch (e) {}
    };

    asegurarCarpeta(carpeta);

    const agregarArchivos = (dir, opciones) => {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const rutaCompleta = path.join(dir, file);
        const stats = fs.statSync(rutaCompleta);

        const nombre = file.toLowerCase();
        if (opciones.extensiones && !opciones.extensiones.some((ext) => nombre.endsWith(ext))) continue;

        archivos.push({
          nombre: file,
          fecha: stats.mtime,
          tamaño: stats.size,
          esActual: opciones.esActual(file),
          ruta: opciones.rutaPrefix ? `${opciones.rutaPrefix}/${file}` : file,
        });
      }
    };

    const filtros = {
      fondos: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp4"],
      "fondos-login": [".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp4"],
      "fondos-login-branding": [".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp4"],
      logos: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"],
      favicons: [".ico", ".png", ".gif", ".svg"],
    };

    // Archivos históricos en la carpeta dedicada del tipo
    agregarArchivos(carpeta, {
      extensiones: filtros[tipo],
      esActual: () => false,
      rutaPrefix: path.basename(carpeta),
    });

    // El archivo actual también está en la misma carpeta con nombre normalizado
    const actualesMap = {
      fondos: ["fondo.png", "fondo.jpg", "fondo.jpeg", "fondo.gif", "fondo.webp", "fondo.mp4"],
      "fondos-login": ["fondo-login.png", "fondo-login.jpg", "fondo-login.jpeg", "fondo-login.gif", "fondo-login.webp", "fondo-login.mp4"],
      "fondos-login-branding": ["fondo-login-branding.png", "fondo-login-branding.jpg", "fondo-login-branding.jpeg", "fondo-login-branding.gif", "fondo-login-branding.webp", "fondo-login-branding.mp4"],
      logos: ["logo.png", "logo.jpg", "logo.jpeg", "logo.gif", "logo.webp", "logo.svg"],
      favicons: ["favicon.ico", "favicon.png", "favicon.gif", "favicon.svg"],
    };

    const actuales = actualesMap[tipo] || [];
    for (const file of actuales) {
      const rutaCompleta = path.join(carpeta, file);
      if (fs.existsSync(rutaCompleta)) {
        const stats = fs.statSync(rutaCompleta);
        archivos.push({
          nombre: file,
          fecha: stats.mtime,
          tamaño: stats.size,
          esActual: true,
          ruta: `${path.basename(carpeta)}/${file}`,
        });
      }
    }

    // Ordenar por fecha (más reciente primero)
    archivos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
    res.json({ archivos });
  } catch (err) {
    console.error("Error listando galería:", err);
    res.status(500).json({ error: "Error listando galería" });
  }
});

// Seleccionar imagen de la galería como actual
router.post("/admin/personalizacion/seleccionar/:tipo", checkAdmin, async (req, res) => {
  try {
    const { tipo } = req.params;
    const { nombreArchivo } = req.body;
    
    if (!["fondos", "favicons", "logos", "fondos-login", "fondos-login-branding"].includes(tipo)) {
      return res.status(400).json({ error: "Tipo inválido" });
    }
    
    if (!nombreArchivo) {
      return res.status(400).json({ error: "Nombre de archivo requerido" });
    }
    
    const carpetaTipo = path.join(process.cwd(), "uploads/personalizacion", tipo);
    const rutaOrigen = path.join(carpetaTipo, nombreArchivo);
    
    if (!fs.existsSync(rutaOrigen)) {
      return res.status(404).json({ error: "Archivo no encontrado" });
    }
    
    // Determinar nombre de destino según el tipo (mantener en la misma carpeta)
    let nombreDestino = "";
    const ext = path.extname(nombreArchivo);
    if (tipo === "logos") {
      nombreDestino = `logo${ext}`;
    } else if (tipo === "favicons") {
      nombreDestino = `favicon${ext}`;
    } else if (tipo === "fondos") {
      nombreDestino = `fondo${ext}`;
    } else if (tipo === "fondos-login") {
      nombreDestino = `fondo-login${ext}`;
    } else if (tipo === "fondos-login-branding") {
      nombreDestino = `fondo-login-branding${ext}`;
    } else {
      nombreDestino = nombreArchivo;
    }
    
    const rutaDestino = path.join(carpetaTipo, nombreDestino);
    
    // Si el archivo ya tiene el nombre correcto, no necesitamos copiarlo
    if (rutaOrigen !== rutaDestino) {
      // Copiar/renombrar el archivo
      fs.copyFileSync(rutaOrigen, rutaDestino);
      // Si el archivo original tiene un nombre diferente, eliminarlo
      if (nombreArchivo !== nombreDestino) {
        try {
          fs.unlinkSync(rutaOrigen);
        } catch (err) {
          // Error eliminando archivo original
        }
      }
    }
    
    // Actualizar tipo en configuración
    let tipoConfig = "imagen";
    if (nombreArchivo.includes(".gif")) tipoConfig = "gif";
    else if (nombreArchivo.includes(".svg")) tipoConfig = tipo === "favicons" || tipo === "logos" ? "svg" : "imagen";
    else if (nombreArchivo.includes(".mp4")) tipoConfig = "video";
    
    let claveTipo = "fondoTipo";
    if (tipo === "logos") claveTipo = "logoTipo";
    else if (tipo === "favicons") claveTipo = "faviconTipo";
    else if (tipo === "fondos-login") claveTipo = "fondoLoginTipo";
    else if (tipo === "fondos-login-branding") claveTipo = "fondoLoginBrandingTipo";
    
    dbUsers
      .prepare(
        `INSERT INTO personalizacion (clave, valor) 
         VALUES (?, ?) 
         ON CONFLICT(clave) DO UPDATE SET valor = ?, actualizado_at = datetime('now', 'localtime')`
      )
      .run(claveTipo, JSON.stringify(tipoConfig), JSON.stringify(tipoConfig));
    
    res.json({ success: true, archivo: nombreDestino });
  } catch (err) {
    console.error("Error seleccionando archivo:", err);
    res.status(500).json({ error: "Error seleccionando archivo" });
  }
});

// Middleware para establecer tipo basado en la ruta
const establecerTipoDesdeRuta = (req, res, next) => {
  const pathUrl = req.path || req.url || "";
  let tipo = "archivo";
  
  if (pathUrl.includes("/logo")) {
    tipo = "logo";
  } else if (pathUrl.includes("/favicon")) {
    tipo = "favicon";
  } else if (pathUrl.includes("/fondo-login-branding")) {
    tipo = "fondoLoginBranding";
  } else if (pathUrl.includes("/fondo-login")) {
    tipo = "fondoLogin";
  } else if (pathUrl.includes("/fondo")) {
    tipo = "fondo";
  }
  
  // Guardar en req.body y también en req.customTipo para acceso directo
  if (req.body) {
    req.body.tipo = tipo;
  }
  req.customTipo = tipo;
  
  next();
};

// Subir logo
router.post("/admin/personalizacion/logo", checkAdmin, establecerTipoDesdeRuta, uploadPersonalizacion.single("archivo"), (req, res) => {
  try {
    
    if (!req.file) {
      console.error("❌ No se recibió archivo");
      return res.status(400).json({ error: "No se recibió archivo" });
    }
    
    const tipoLogo = req.file.filename.includes(".gif") ? "gif" : 
                    req.file.filename.includes(".svg") ? "svg" :
                    req.file.filename.includes(".jpg") ? "imagen" : "imagen";
    
    // El archivo ya está guardado en uploads/personalizacion/logos/logo.{ext}
    
    // Guardar tipo en configuración y marcar logo como existente
    dbUsers
      .prepare(
        `INSERT INTO personalizacion (clave, valor) 
         VALUES ('logoTipo', ?) 
         ON CONFLICT(clave) DO UPDATE SET valor = ?, actualizado_at = datetime('now', 'localtime')`
      )
      .run(JSON.stringify(tipoLogo), JSON.stringify(tipoLogo));
    
    // Marcar logo como existente
    dbUsers
      .prepare(
        `INSERT INTO personalizacion (clave, valor) 
         VALUES ('logo', ?) 
         ON CONFLICT(clave) DO UPDATE SET valor = ?, actualizado_at = datetime('now', 'localtime')`
      )
      .run(JSON.stringify(true), JSON.stringify(true));
    
    res.json({ success: true, filename: req.file.filename, tipo: tipoLogo });
  } catch (err) {
    console.error("❌ Error subiendo logo:", err);
    console.error("Stack:", err.stack);
    res.status(500).json({ error: "Error subiendo logo", details: err.message });
  }
});

// Subir favicon
router.post("/admin/personalizacion/favicon", checkAdmin, establecerTipoDesdeRuta, (req, res) => {
  // Asegurar que las carpetas existan antes de subir
  crearSubcarpetas();
  
  uploadPersonalizacion.single("archivo")(req, res, async (err) => {
    try {
      if (err) {
        console.error("❌ Error en upload:", err);
        return res.status(500).json({ error: "Error subiendo archivo", details: err.message });
      }
      
      if (!req.file) {
        console.error("❌ No se recibió archivo");
        return res.status(400).json({ error: "No se recibió archivo" });
      }
    
      let tipoFavicon = req.file.filename.includes(".gif") ? "gif" : 
                       req.file.filename.includes(".svg") ? "svg" :
                       req.file.filename.includes(".png") ? "imagen" : "imagen";
    
      // Procesar favicon para hacerlo circular (excepto SVG y GIF animados)
      if (tipoFavicon !== "svg" && tipoFavicon !== "gif") {
        try {
          const inputPath = req.file.path;
          const metadata = await sharp(inputPath).metadata();
          
          // Tamaño estándar para favicon (32x32 es común, pero usaremos el tamaño original o mínimo 64x64)
          const targetSize = Math.max(64, Math.min(metadata.width || 64, metadata.height || 64));
          
          // Usar siempre PNG para el favicon circular con fondo transparente
          const outputPath = inputPath.replace(/\.[^.]+$/, '.png');
          
          // Crear máscara circular SVG
          const radius = targetSize / 2;
          const svgMask = Buffer.from(
            `<svg width="${targetSize}" height="${targetSize}">
              <circle cx="${radius}" cy="${radius}" r="${radius}" fill="white"/>
            </svg>`
          );
          
          // Procesar imagen: redimensionar a cuadrado perfecto
          const resizedImage = await sharp(inputPath)
            .resize(targetSize, targetSize, {
              fit: 'cover',
              position: 'center'
            })
            .ensureAlpha()
            .toBuffer();
          
          // Aplicar máscara circular usando dest-in (solo muestra lo que está dentro del círculo)
          await sharp(resizedImage)
            .composite([
              {
                input: svgMask,
                blend: 'dest-in'
              }
            ])
            .png({ 
              quality: 100,
              compressionLevel: 6,
              adaptiveFiltering: true,
              force: true
            })
            .toFile(outputPath);
          
          // Reemplazar el archivo original con el procesado
          if (inputPath !== outputPath) {
            try {
              if (fs.existsSync(inputPath)) {
                fs.unlinkSync(inputPath);
              }
              // Actualizar el path del archivo para que apunte al PNG
              req.file.path = outputPath;
              req.file.filename = req.file.filename.replace(/\.[^.]+$/, '.png');
            } catch (err) {
              console.warn("⚠️ No se pudo eliminar archivo original:", err.message);
            }
          }
          
          // Verificar que el archivo se haya creado correctamente
          if (fs.existsSync(outputPath)) {
            // Verificar las dimensiones del archivo resultante
            await sharp(outputPath).metadata();
          } else {
            console.error(`❌ Error: El archivo ${outputPath} no se creó correctamente`);
          }
          
          // Actualizar el tipo a "imagen" (PNG) después del procesamiento
          tipoFavicon = "imagen";
        } catch (processError) {
          console.error("❌ Error procesando favicon como circular:", processError);
          console.error("Stack:", processError.stack);
          // Continuar con el archivo original si falla el procesamiento
        }
      }
      
      // Guardar tipo en configuración y marcar favicon como existente
      // Si fue procesado, siempre será "imagen" (PNG circular)
      const tipoFinal = tipoFavicon === "gif" || tipoFavicon === "svg" ? tipoFavicon : "imagen";
      dbUsers
        .prepare(
          `INSERT INTO personalizacion (clave, valor) 
           VALUES ('faviconTipo', ?) 
           ON CONFLICT(clave) DO UPDATE SET valor = ?, actualizado_at = datetime('now', 'localtime')`
        )
        .run(JSON.stringify(tipoFinal), JSON.stringify(tipoFinal));
      
      // Marcar favicon como existente
      dbUsers
        .prepare(
          `INSERT INTO personalizacion (clave, valor) 
           VALUES ('favicon', ?) 
           ON CONFLICT(clave) DO UPDATE SET valor = ?, actualizado_at = datetime('now', 'localtime')`
        )
        .run(JSON.stringify(true), JSON.stringify(true));
      
      res.json({ success: true, filename: req.file.filename, tipo: tipoFinal });
    } catch (err) {
      console.error("❌ Error subiendo favicon:", err);
      console.error("Stack:", err.stack);
      res.status(500).json({ error: "Error subiendo favicon", details: err.message });
    }
  });
});

// Ruta GET para servir el favicon directamente
router.get("/admin/personalizacion/favicon", (req, res) => {
  try {
    const faviconsDir = path.join(process.cwd(), "uploads", "personalizacion", "favicons");
    
    // Buscar favicon con diferentes extensiones
    const extensiones = ["png", "ico", "svg", "gif", "jpg", "jpeg"];
    let faviconPath = null;
    
    for (const ext of extensiones) {
      const posiblePath = path.join(faviconsDir, `favicon.${ext}`);
      if (fs.existsSync(posiblePath)) {
        faviconPath = posiblePath;
        break;
      }
    }
    
    if (!faviconPath) {
      return res.status(404).json({ error: "Favicon no encontrado" });
    }
    
    const ext = path.extname(faviconPath).toLowerCase();
    const contentType = ext === ".svg" ? "image/svg+xml" : 
                       ext === ".gif" ? "image/gif" : 
                       ext === ".png" ? "image/png" : 
                       ext === ".ico" ? "image/x-icon" : "image/png";
    
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400"); // Cache por 1 día
    res.sendFile(path.resolve(faviconPath));
  } catch (err) {
    console.error("❌ Error sirviendo favicon:", err);
    res.status(500).json({ error: "Error sirviendo favicon" });
  }
});

// Eliminar fondo
router.delete("/admin/personalizacion/fondo", checkAdmin, async (req, res) => {
  try {
    // No borrar archivos físicos, solo limpiar configuración para dejar de usar el fondo
    dbUsers.prepare(`DELETE FROM personalizacion WHERE clave IN ('fondo', 'fondoTipo', 'fondoTransparencia')`).run();
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error eliminando fondo:", err);
    res.status(500).json({ error: "Error eliminando fondo", details: err.message });
  }
});

// Subir fondo login
router.post("/admin/personalizacion/fondo-login", checkAdmin, establecerTipoDesdeRuta, uploadPersonalizacion.single("archivo"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se recibió archivo" });
    }
    
    let fondoLoginTipo = "imagen";
    if (req.file.mimetype.startsWith("video/")) fondoLoginTipo = "video";
    else if (req.file.mimetype === "image/gif") fondoLoginTipo = "gif";

    // El archivo ya está guardado en uploads/personalizacion/fondos-login/fondo-login.{ext}

    dbUsers
      .prepare(
        `INSERT INTO personalizacion (clave, valor) 
         VALUES ('fondoLoginTipo', ?) 
         ON CONFLICT(clave) DO UPDATE SET valor = ?, actualizado_at = datetime('now', 'localtime')`
      )
      .run(JSON.stringify(fondoLoginTipo), JSON.stringify(fondoLoginTipo));

    // Marcar fondo login como existente
    dbUsers
      .prepare(
        `INSERT INTO personalizacion (clave, valor) 
         VALUES ('fondoLogin', ?) 
         ON CONFLICT(clave) DO UPDATE SET valor = ?, actualizado_at = datetime('now', 'localtime')`
      )
      .run(JSON.stringify(true), JSON.stringify(true));

    res.json({ success: true, filename: req.file.filename, tipo: fondoLoginTipo });
  } catch (err) {
    console.error("Error subiendo fondo login:", err);
    res.status(500).json({ error: "Error subiendo fondo login" });
  }
});

// Subir fondo login branding
router.post("/admin/personalizacion/fondo-login-branding", checkAdmin, establecerTipoDesdeRuta, uploadPersonalizacion.single("archivo"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se recibió archivo" });
    }
    
    let fondoLoginBrandingTipo = "imagen";
    if (req.file.mimetype.startsWith("video/")) fondoLoginBrandingTipo = "video";
    else if (req.file.mimetype === "image/gif") fondoLoginBrandingTipo = "gif";

    // El archivo ya está guardado en uploads/personalizacion/fondos-login-branding/fondo-login-branding.{ext}

    dbUsers
      .prepare(
        `INSERT INTO personalizacion (clave, valor) 
         VALUES ('fondoLoginBrandingTipo', ?) 
         ON CONFLICT(clave) DO UPDATE SET valor = ?, actualizado_at = datetime('now', 'localtime')`
      )
      .run(JSON.stringify(fondoLoginBrandingTipo), JSON.stringify(fondoLoginBrandingTipo));

    // Marcar fondo login branding como existente
    dbUsers
      .prepare(
        `INSERT INTO personalizacion (clave, valor) 
         VALUES ('fondoLoginBranding', ?) 
         ON CONFLICT(clave) DO UPDATE SET valor = ?, actualizado_at = datetime('now', 'localtime')`
      )
      .run(JSON.stringify(true), JSON.stringify(true));

    res.json({ success: true, filename: req.file.filename, tipo: fondoLoginBrandingTipo });
  } catch (err) {
    console.error("Error subiendo fondo login branding:", err);
    res.status(500).json({ error: "Error subiendo fondo login branding" });
  }
});

// Eliminar fondo login
router.delete("/admin/personalizacion/fondo-login", checkAdmin, async (req, res) => {
  try {
    const carpetaFondosLogin = path.join(process.cwd(), "uploads/personalizacion/fondos-login");
    let eliminados = 0;
    
    if (fs.existsSync(carpetaFondosLogin)) {
      try {
        const archivos = fs.readdirSync(carpetaFondosLogin);
        const archivosFondo = archivos.filter(f => f.toLowerCase().startsWith("fondo-login."));
        
        for (const archivo of archivosFondo) {
          const rutaArchivo = path.join(carpetaFondosLogin, archivo);
          try {
            fs.unlinkSync(rutaArchivo);
            eliminados++;
          } catch (err) {
            // Error eliminando archivo
          }
        }
      } catch (err) {
        // Error leyendo carpeta
      }
    }

    dbUsers.prepare(`DELETE FROM personalizacion WHERE clave IN ('fondoLogin', 'fondoLoginTipo')`).run();
    res.json({ success: true, eliminados });
  } catch (err) {
    console.error("Error eliminando fondo login:", err);
    res.status(500).json({ error: "Error eliminando fondo login" });
  }
});

// Eliminar fondo login branding
router.delete("/admin/personalizacion/fondo-login-branding", checkAdmin, async (req, res) => {
  try {
    const carpetaFondosLoginBranding = path.join(process.cwd(), "uploads/personalizacion/fondos-login-branding");
    let eliminados = 0;
    
    if (fs.existsSync(carpetaFondosLoginBranding)) {
      try {
        const archivos = fs.readdirSync(carpetaFondosLoginBranding);
        const archivosFondo = archivos.filter(f => f.toLowerCase().startsWith("fondo-login-branding."));
        
        for (const archivo of archivosFondo) {
          const rutaArchivo = path.join(carpetaFondosLoginBranding, archivo);
          try {
            fs.unlinkSync(rutaArchivo);
            eliminados++;
          } catch (err) {
            // Error eliminando archivo
          }
        }
      } catch (err) {
        // Error leyendo carpeta
      }
    }

    dbUsers.prepare(`DELETE FROM personalizacion WHERE clave IN ('fondoLoginBranding', 'fondoLoginBrandingTipo')`).run();
    res.json({ success: true, eliminados });
  } catch (err) {
    console.error("Error eliminando fondo login branding:", err);
    res.status(500).json({ error: "Error eliminando fondo login branding" });
  }
});

// Subir fondo
router.post("/admin/personalizacion/fondo", checkAdmin, establecerTipoDesdeRuta, uploadPersonalizacion.single("archivo"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se recibió archivo" });
    }
    
    // Determinar tipo de fondo
    let fondoTipo = "imagen";
    if (req.file.mimetype.startsWith("video/")) fondoTipo = "video";
    else if (req.file.mimetype === "image/gif") fondoTipo = "gif";

    // El archivo ya está guardado en uploads/personalizacion/fondos/fondo.{ext}

    // Guardar tipo en configuración
    dbUsers
      .prepare(
        `INSERT INTO personalizacion (clave, valor) 
         VALUES ('fondoTipo', ?) 
         ON CONFLICT(clave) DO UPDATE SET valor = ?, actualizado_at = datetime('now', 'localtime')`
      )
      .run(JSON.stringify(fondoTipo), JSON.stringify(fondoTipo));

    // Guardar fondo = true para indicar que existe un fondo
    dbUsers
      .prepare(
        `INSERT INTO personalizacion (clave, valor) 
         VALUES ('fondo', ?) 
         ON CONFLICT(clave) DO UPDATE SET valor = ?, actualizado_at = datetime('now', 'localtime')`
      )
      .run(JSON.stringify(true), JSON.stringify(true));

    res.json({ success: true, filename: req.file.filename, tipo: fondoTipo });
  } catch (err) {
    console.error("❌ Error subiendo fondo:", err);
    console.error("Stack:", err.stack);
    res.status(500).json({ error: "Error subiendo fondo", details: err.message });
  }
});

// Eliminar imagen de la galería
router.delete("/admin/personalizacion/galeria/:tipo/:archivo", checkAdmin, async (req, res) => {
  try {
    const { tipo, archivo } = req.params;
    
    if (!["fondos", "favicons", "logos", "fondos-login", "fondos-login-branding"].includes(tipo)) {
      return res.status(400).json({ error: "Tipo inválido" });
    }

    if (!archivo) {
      return res.status(400).json({ error: "Archivo requerido" });
    }

    const carpeta = path.join(process.cwd(), "uploads/personalizacion", tipo);
    const rutaArchivo = path.join(carpeta, archivo);

    if (!rutaArchivo.startsWith(carpeta)) {
      return res.status(400).json({ error: "Ruta inválida" });
    }

    if (!fs.existsSync(rutaArchivo)) {
      return res.status(404).json({ error: "Archivo no encontrado" });
    }

    fs.unlinkSync(rutaArchivo);

    res.json({ ok: true });
  } catch (err) {
    console.error("Error eliminando archivo de galería:", err);
    res.status(500).json({ error: "Error eliminando archivo" });
  }
});

/* ============================================================
   CORREGIR LOTES: CAMBIAR "N-A" A "N/A"
   ============================================================ */
router.post("/admin/corregir-lotes", checkAdmin, async (req, res) => {
  try {
    const resultados = {
      productos_ref: 0,
      productos_lotes: 0,
      productos_historico: 0,
      devoluciones_productos: 0,
      devoluciones_historico: 0,
      productos_dia: 0,
    };

    // ⚠️ productos_ref ya no tiene columna lote - los lotes están en productos_lotes
    resultados.productos_ref = 0;

    // 1. productos_lotes (inventario.db)
    try {
      const result2 = dbInv
        .prepare("UPDATE productos_lotes SET lote = 'N/A' WHERE lote = 'N-A'")
        .run();
      resultados.productos_lotes = result2.changes || 0;
    } catch (e) {
      console.error("Error corrigiendo productos_lotes:", e);
    }

    // 3. productos_historico (productos.db)
    try {
      const result3 = dbHist
        .prepare("UPDATE productos_historico SET lote = 'N/A' WHERE lote = 'N-A'")
        .run();
      resultados.productos_historico = result3.changes || 0;
    } catch (e) {
      console.error("Error corrigiendo productos_historico:", e);
    }

    // 4. devoluciones_productos (devoluciones.db)
    try {
      const result4 = dbDevol
        .prepare("UPDATE devoluciones_productos SET lote = 'N/A' WHERE lote = 'N-A'")
        .run();
      resultados.devoluciones_productos = result4.changes || 0;
    } catch (e) {
      console.error("Error corrigiendo devoluciones_productos:", e);
    }

    // 5. devoluciones_historico (productos.db)
    try {
      const result5 = dbHist
        .prepare("UPDATE devoluciones_historico SET lote = 'N/A' WHERE lote = 'N-A'")
        .run();
      resultados.devoluciones_historico = result5.changes || 0;
    } catch (e) {
      console.error("Error corrigiendo devoluciones_historico:", e);
    }

    // 6. productos (productos_dia.db) - tabla del picking diario
    try {
      const result6 = dbDia
        .prepare("UPDATE productos SET lote = 'N/A' WHERE lote = 'N-A'")
        .run();
      resultados.productos_dia = result6.changes || 0;
    } catch (e) {
      console.error("Error corrigiendo productos_dia:", e);
    }

    const total = Object.values(resultados).reduce((sum, val) => sum + val, 0);

    // Emitir actualización de inventario
    getIO().emit("inventario_actualizado");

    // Registrar en auditoría
    try {
      dbAud
        .prepare(
          `INSERT INTO auditoria (usuario, accion, detalle, timestamp) 
           VALUES (?, ?, ?, datetime('now', 'localtime'))`
        )
        .run(
          req.user?.name || "Sistema",
          "CORREGIR_LOTES",
          `Corrección masiva de lotes: ${total} registros actualizados de "N-A" a "N/A" - ${JSON.stringify(resultados)}`
        );
    } catch (e) {
      console.error("Error registrando auditoría:", e);
    }

    res.json({
      ok: true,
      total: total,
      detalles: resultados,
      mensaje: `Se corrigieron ${total} registros de "N-A" a "N/A"`,
    });
  } catch (err) {
    console.error("Error corrigiendo lotes:", err);
    res.status(500).json({ error: "Error corrigiendo lotes: " + err.message });
  }
});

// ============================================================
// BANNERS DE TIENDA
// ============================================================

crearSubcarpetas();

const storageBannersTienda = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.cwd(), "uploads/personalizacion/tienda-banners");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const nombre = `${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
    cb(null, nombre);
  },
});

const uploadBannerTienda = multer({
  storage: storageBannersTienda,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const esVideo = file.mimetype.startsWith("video/");
    const esGif = file.mimetype === "image/gif";
    const esImagen = file.mimetype.startsWith("image/");
    
    if (esVideo || esGif || esImagen) {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten imágenes, GIFs o videos"));
    }
  },
});

// Obtener banners de la tienda (público para la tienda, pero requiere auth para admin)
router.get("/tienda/banners", async (req, res) => {
  try {
    const bannersDir = path.join(process.cwd(), "uploads/personalizacion/tienda-banners");
    
    if (!fs.existsSync(bannersDir)) {
      return res.json([]);
    }

    const archivos = fs.readdirSync(bannersDir);
    const banners = archivos
      .filter(archivo => {
        const ext = path.extname(archivo).toLowerCase();
        return [".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".webm", ".mov"].includes(ext);
      })
      .map((archivo, index) => {
        const ext = path.extname(archivo).toLowerCase();
        const esVideo = [".mp4", ".webm", ".mov"].includes(ext);
        const esGif = ext === ".gif";
        
        return {
          id: index + 1,
          nombre: archivo,
          url: `/uploads/personalizacion/tienda-banners/${archivo}`,
          tipo: esVideo ? "video" : esGif ? "gif" : "imagen",
          fecha: fs.statSync(path.join(bannersDir, archivo)).mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    res.json(banners);
  } catch (err) {
    console.error("Error obteniendo banners:", err);
    res.status(500).json({ error: "Error obteniendo banners" });
  }
});

// Subir banner de la tienda
router.post("/admin/tienda/banners", authRequired, uploadBannerTienda.single("banner"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se proporcionó archivo" });
    }

    const ext = path.extname(req.file.filename).toLowerCase();
    const esVideo = [".mp4", ".webm", ".mov"].includes(ext);
    const esGif = ext === ".gif";

    // Emitir evento de actualización en tiempo real
    const io = getIO();
    if (io) {
      io.emit("tienda_banners_actualizados");
    }

    res.json({
      id: Date.now(),
      nombre: req.file.filename,
      url: `/uploads/personalizacion/tienda-banners/${req.file.filename}`,
      tipo: esVideo ? "video" : esGif ? "gif" : "imagen",
      mensaje: "Banner subido correctamente",
    });
  } catch (err) {
    console.error("Error subiendo banner:", err);
    res.status(500).json({ error: err.message || "Error subiendo banner" });
  }
});

// ============================================================
// FAVICON DE TIENDA
// ============================================================

const storageFaviconTienda = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.cwd(), "uploads/personalizacion/tienda-favicon");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // Guardar como favicon.extension para facilitar su obtención
    const nombre = `favicon${ext}`;
    cb(null, nombre);
  },
});

const uploadFaviconTienda = multer({
  storage: storageFaviconTienda,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const esImagen = file.mimetype.startsWith("image/");
    if (esImagen) {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten imágenes para el favicon"));
    }
  },
});

// Obtener favicon de la tienda (público)
router.get("/tienda/favicon", async (req, res) => {
  try {
    const faviconDir = path.join(process.cwd(), "uploads/personalizacion/tienda-favicon");
    
    if (!fs.existsSync(faviconDir)) {
      return res.status(404).json({ error: "Favicon no encontrado" });
    }

    const extensiones = ["png", "ico", "svg", "gif", "jpg", "jpeg", "webp"];
    let faviconPath = null;

    for (const ext of extensiones) {
      const posiblePath = path.join(faviconDir, `favicon.${ext}`);
      if (fs.existsSync(posiblePath)) {
        faviconPath = posiblePath;
        break;
      }
    }

    if (!faviconPath) {
      return res.status(404).json({ error: "Favicon no encontrado" });
    }

    const ext = path.extname(faviconPath).toLowerCase();
    const mimeTypes = {
      ".ico": "image/x-icon",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".gif": "image/gif",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
    };

    res.setHeader("Content-Type", mimeTypes[ext] || "image/png");
    res.sendFile(path.resolve(faviconPath));
  } catch (err) {
    console.error("Error obteniendo favicon de tienda:", err);
    res.status(500).json({ error: "Error obteniendo favicon" });
  }
});

// Subir favicon de la tienda
router.post("/admin/tienda/favicon", authRequired, uploadFaviconTienda.single("favicon"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se proporcionó archivo" });
    }

    // Emitir evento de actualización en tiempo real
    const io = getIO();
    if (io) {
      io.emit("tienda_favicon_actualizado");
    }

    res.json({
      ok: true,
      url: `/uploads/personalizacion/tienda-favicon/${req.file.filename}`,
      mensaje: "Favicon subido correctamente",
    });
  } catch (err) {
    console.error("Error subiendo favicon:", err);
    res.status(500).json({ error: err.message || "Error subiendo favicon" });
  }
});

// Eliminar favicon de la tienda
router.delete("/admin/tienda/favicon", authRequired, async (req, res) => {
  try {
    const faviconDir = path.join(process.cwd(), "uploads/personalizacion/tienda-favicon");
    
    if (!fs.existsSync(faviconDir)) {
      return res.status(404).json({ error: "Favicon no encontrado" });
    }

    const extensiones = ["png", "ico", "svg", "gif", "jpg", "jpeg", "webp"];
    let eliminado = false;

    for (const ext of extensiones) {
      const faviconPath = path.join(faviconDir, `favicon.${ext}`);
      if (fs.existsSync(faviconPath)) {
        fs.unlinkSync(faviconPath);
        eliminado = true;
        break;
      }
    }

    if (!eliminado) {
      return res.status(404).json({ error: "Favicon no encontrado" });
    }

    // Emitir evento de actualización en tiempo real
    const io = getIO();
    if (io) {
      io.emit("tienda_favicon_actualizado");
    }

    res.json({ ok: true, mensaje: "Favicon eliminado correctamente" });
  } catch (err) {
    console.error("Error eliminando favicon:", err);
    res.status(500).json({ error: "Error eliminando favicon" });
  }
});

// Eliminar banner de la tienda
router.delete("/admin/tienda/banners/:id", authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Obtener todos los banners para encontrar el archivo
    const bannersDir = path.join(process.cwd(), "uploads/personalizacion/tienda-banners");
    
    if (!fs.existsSync(bannersDir)) {
      return res.status(404).json({ error: "No se encontró el banner" });
    }

    const archivos = fs.readdirSync(bannersDir)
      .filter(archivo => {
        const ext = path.extname(archivo).toLowerCase();
        return [".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".webm", ".mov"].includes(ext);
      })
      .sort((a, b) => {
        const statA = fs.statSync(path.join(bannersDir, a));
        const statB = fs.statSync(path.join(bannersDir, b));
        return statB.mtime - statA.mtime;
      });

    const bannerIndex = parseInt(id) - 1;
    if (bannerIndex < 0 || bannerIndex >= archivos.length) {
      return res.status(404).json({ error: "Banner no encontrado" });
    }

    const archivoAEliminar = archivos[bannerIndex];
    const rutaArchivo = path.join(bannersDir, archivoAEliminar);

    if (fs.existsSync(rutaArchivo)) {
      fs.unlinkSync(rutaArchivo);
      
      // Emitir evento de actualización en tiempo real
      const io = getIO();
      if (io) {
        io.emit("tienda_banners_actualizados");
      }
      
      res.json({ mensaje: "Banner eliminado correctamente" });
    } else {
      res.status(404).json({ error: "Archivo no encontrado" });
    }
  } catch (err) {
    console.error("Error eliminando banner:", err);
    res.status(500).json({ error: "Error eliminando banner" });
  }
});

export default router;
