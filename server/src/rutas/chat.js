// src/rutas/chat.js
import express from "express";
import crypto from "crypto";
import { dbChat, dbUsers } from "../config/baseDeDatos.js";
import { authRequired } from "../middleware/autenticacion.js";
import { getIO, getUsuariosActivos } from "../config/socket.js";
import { sendPushToTokens } from "../utilidades/pushNotifications.js";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

// Configurar multer para subir archivos
const uploadDir = "uploads/chat";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const uploadDirGrupos = "uploads/grupos";
if (!fs.existsSync(uploadDirGrupos)) {
  fs.mkdirSync(uploadDirGrupos, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, unique + ext);
  },
});

const storageGrupos = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDirGrupos),
  filename: (_req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, unique + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB máximo
});

const uploadFotoGrupo = multer({
  storage: storageGrupos,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB máximo para fotos
});

// Helper: Obtener nickname o name del usuario
const obtenerNombreUsuario = (userId) => {
  const usuarioData = dbUsers
    .prepare("SELECT nickname, name FROM users WHERE id = ?")
    .get(userId);
  
  if (!usuarioData) {
    return null;
  }
  
  // Retornar nickname si existe, si no usar name
  return usuarioData.nickname || usuarioData.name || null;
};

const getNotificacionConfig = (nickname) => {
  try {
    const cfg = dbChat
      .prepare("SELECT * FROM chat_notificaciones_config WHERE usuario_nickname = ?")
      .get(nickname);
    return cfg || {
      notificaciones_activas: 1,
      grupos_activos: 1,
      privados_activos: 1,
      general_activo: 1,
      dispositivo_pc: 1,
      dispositivo_tablet: 1,
      dispositivo_movil: 1,
      notificar_reunion_individual: 1,
      notificar_reunion_grupal: 1,
      sonido_mensaje: "ixora-pulse",
      sonido_video: "ixora-wave",
      sonido_juntas: "ixora-alert",
      sonido_video_individual: "ixora-call",
      sonido_video_grupal: "ixora-call-group",
    };
  } catch (e) {
    return {
      notificaciones_activas: 1,
      grupos_activos: 1,
      privados_activos: 1,
      general_activo: 1,
      dispositivo_pc: 1,
      dispositivo_tablet: 1,
      dispositivo_movil: 1,
      notificar_reunion_individual: 1,
      notificar_reunion_grupal: 1,
      sonido_mensaje: "ixora-pulse",
      sonido_video: "ixora-wave",
      sonido_juntas: "ixora-alert",
      sonido_video_individual: "ixora-call",
      sonido_video_grupal: "ixora-call-group",
    };
  }
};

const getBorradoPrivado = (usuarioNickname, otroUsuario) => {
  try {
    return dbChat
      .prepare(
        "SELECT borrado_en FROM chat_privado_borrados WHERE usuario_nickname = ? AND otro_usuario = ?"
      )
      .get(usuarioNickname, otroUsuario);
  } catch (e) {
    return null;
  }
};

const guardarNotificacionYEnviarPush = (usuarioId, payload, dataExtra = {}, opts = {}) => {
  try {
    const replyToken = crypto.randomBytes(16).toString("hex");
    const dataJson = JSON.stringify(dataExtra || {});

    const result = dbUsers.prepare(`
      INSERT INTO notificaciones 
      (usuario_id, titulo, mensaje, tipo, reply_token, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      usuarioId,
      payload.title,
      payload.body,
      payload.tipo || "info",
      replyToken,
      dataJson
    );

    const notifId = result.lastInsertRowid;

    if (opts.emitSocket) {
      try {
        getIO().emit("nueva_notificacion", {
          userId: usuarioId,
          usuario_id: usuarioId,
          id: notifId,
          titulo: payload.title,
          mensaje: payload.body,
          tipo: payload.tipo || "info",
          admin_only: false,
          data: dataExtra,
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        /* ignorar */
      }
    }

    const tokens = dbUsers
      .prepare("SELECT token FROM push_tokens WHERE usuario_id = ?")
      .all(usuarioId)
      .map((row) => row.token);

    if (tokens.length) {
      const serverUrl = payload.serverUrl;
      sendPushToTokens(tokens, {
        title: payload.title,
        body: payload.body,
        data: {
          notificationId: String(notifId),
          replyToken,
          serverUrl,
          ...dataExtra,
        },
      }).catch(() => {});
    }
  } catch (e) {
    // Silenciar errores de notificación
  }
};

const eliminarNotifsPrioridadMensaje = (tipo, mensajeId, chatTarget) => {
  try {
    console.log(`🗑️ Eliminando notificaciones: tipo=${tipo}, mensajeId=${mensajeId}, chatTarget=${chatTarget}`);
    const filas = dbUsers.prepare("SELECT id, data FROM notificaciones WHERE data IS NOT NULL AND data != ''").all();
    const ids = [];
    for (const r of filas) {
      let d;
      try {
        d = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
      } catch (_) {
        continue;
      }
      if (d?.prioridad !== 1) continue;
      if (d?.mensaje_id == null || Number(d.mensaje_id) !== Number(mensajeId)) continue;
      if (d.chatType !== tipo) continue;
      if (String(d.chatTarget ?? "") !== String(chatTarget ?? "")) {
        console.log(`⚠️ No coincide chatTarget: esperado="${chatTarget}", encontrado="${d.chatTarget}"`);
        continue;
      }
      console.log(`✅ Notificación ${r.id} marcada para eliminación`);
      ids.push(r.id);
    }
    if (ids.length) {
      const del = dbUsers.prepare("DELETE FROM notificaciones WHERE id = ?");
      for (const id of ids) {
        del.run(id);
        console.log(`✅ Notificación ${id} eliminada`);
      }
      console.log(`✅ Total eliminadas: ${ids.length} notificaciones`);
    } else {
      console.log(`⚠️ No se encontraron notificaciones para eliminar`);
    }
  } catch (e) {
    console.error("❌ Error en eliminarNotifsPrioridadMensaje:", e);
  }
};

// ==========================================
// OBTENER TODOS LOS USUARIOS DE IXORA
// ==========================================
router.get("/usuarios", authRequired, (req, res) => {
  try {
    // Obtener TODOS los usuarios (activos e inactivos, con o sin nickname)
    // Excluir usuarios del sistema (es_sistema = 1) para que IXORA sea invisible
    const usuarios = dbUsers
      .prepare(
        "SELECT id, name, nickname, photo, active FROM users WHERE (es_sistema IS NULL OR es_sistema = 0) ORDER BY active DESC, name ASC"
      )
      .all();
    res.json(usuarios);
  } catch (e) {
    console.error("Error obteniendo usuarios:", e);
    res.status(500).json({ error: "Error obteniendo usuarios" });
  }
});

// ==========================================
// OBTENER ESTADOS DE USUARIOS (activo/ausente/offline)
// ==========================================
router.get("/usuarios/estados", authRequired, (req, res) => {
  try {
    // Obtener usuarios con sus estados de sesión
    // Estado: 
    // - 'activo' (verde): En socket (en la app)
    // - 'ausente' (amarillo): No en socket pero tiene sesión activa (menos de 8h) Y (sin last_seen_at O más de 10 min sin actividad)
    // - 'offline' (rojo): Sin sesión activa O más de 8 horas sin actividad (sesión cerrada)
    const usuariosActivosSocket = getUsuariosActivos();
    const nicknamesActivos = new Set(usuariosActivosSocket.map(u => u.nickname));

    // Obtener TODOS los usuarios (no solo los con sesión reciente)
    const todosUsuarios = dbUsers
      .prepare(`
        SELECT DISTINCT u.id, u.name, u.nickname, u.photo, u.active,
               MAX(s.last_seen_at) as last_seen_at
        FROM users u
        LEFT JOIN user_sessions s ON u.id = s.user_id
        WHERE (u.es_sistema IS NULL OR u.es_sistema = 0)
        GROUP BY u.id, u.name, u.nickname, u.photo, u.active
      `)
      .all();

    // Construir mapa de estados
    const estados = {};
    const ahora = new Date();
    
    todosUsuarios.forEach(u => {
      const nickname = u.nickname || u.name;
      if (!nickname) return;
      
      // Verde: Usuario está en socket (en la app)
      if (nicknamesActivos.has(nickname)) {
        estados[nickname] = 'activo';
        return;
      }
      
      // Si no está en socket, verificar sesión
      if (!u.last_seen_at) {
        // Sin sesión activa = rojo
        estados[nickname] = 'offline';
        return;
      }
      
      // Calcular tiempo desde last_seen_at
      const lastSeen = new Date(u.last_seen_at);
      const minutosSinActividad = (ahora - lastSeen) / (1000 * 60);
      const horasSinActividad = minutosSinActividad / 60;
      
      // Rojo: Más de 8 horas sin actividad (sesión cerrada)
      if (horasSinActividad >= 8) {
        estados[nickname] = 'offline';
        return;
      }
      
      // Amarillo: No está en socket (salió de la app) O más de 10 min sin actividad
      // Si tiene sesión activa (< 8h) pero no está en socket = ausente (amarillo)
      estados[nickname] = 'ausente';
    });

    res.json(estados);
  } catch (e) {
    console.error("Error obteniendo estados de usuarios:", e);
    res.status(500).json({ error: "Error obteniendo estados" });
  }
});

// ==========================================
// OBTENER MENSAJES GENERALES
// ==========================================
router.get("/general", authRequired, (req, res) => {
  try {
    const mensajes = dbChat
      .prepare(
        "SELECT * FROM chat_general ORDER BY fecha ASC LIMIT 100"
      )
      .all();
    res.json(mensajes);
  } catch (e) {
    console.error("Error obteniendo mensajes generales:", e);
    res.status(500).json({ error: "Error obteniendo mensajes generales" });
  }
});

// ==========================================
// ENVIAR MENSAJE GENERAL
// ==========================================
router.post("/general", authRequired, (req, res) => {
  try {
    const {
      mensaje,
      tipo_mensaje,
      archivo_id,
      archivo_url,
      archivo_nombre,
      archivo_tipo,
      archivo_tamaño,
      menciona,
      enlace_compartido,
      reply_to_id,
      reply_to_user,
      reply_to_text,
      reenviado_de_usuario,
      reenviado_de_chat,
      reenviado_de_tipo,
    } = req.body;
    const usuario = req.user;

    if (!mensaje || !mensaje.trim()) {
      return res.status(400).json({ error: "Mensaje vacío" });
    }

    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    const usuarioData = dbUsers
      .prepare("SELECT photo FROM users WHERE id = ?")
      .get(usuario.id);

    // Obtener información del archivo si existe
    let archivoInfo = null;
    if (archivo_id) {
      archivoInfo = dbChat
        .prepare("SELECT * FROM chat_archivos WHERE id = ?")
        .get(archivo_id);
      if (archivoInfo) {
        // Actualizar el mensaje_id en el archivo
        dbChat
          .prepare("UPDATE chat_archivos SET mensaje_id = ?, tipo_chat = 'general' WHERE id = ?")
          .run(null, archivo_id); // Se actualizará después de obtener el ID del mensaje
      }
    }

    const resultado = dbChat
      .prepare(
        `INSERT INTO chat_general 
        (usuario_nickname, usuario_photo, mensaje, tipo_mensaje, archivo_url, archivo_nombre, archivo_tipo, archivo_tamaño, menciona, enlace_compartido, reply_to_id, reply_to_user, reply_to_text, reenviado_de_usuario, reenviado_de_chat, reenviado_de_tipo) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        usuarioNickname,
        usuarioData?.photo || null,
        mensaje.trim(),
        tipo_mensaje || "texto",
        archivoInfo ? `/chat/archivo/${archivo_id}` : (archivo_url || null),
        archivoInfo ? archivoInfo.nombre_original : (archivo_nombre || null),
        archivoInfo ? archivoInfo.tipo_mime : (archivo_tipo || null),
        archivoInfo ? archivoInfo.tamaño : (archivo_tamaño || null),
        menciona || null,
        enlace_compartido || null,
        reply_to_id || null,
        reply_to_user || null,
        reply_to_text || null,
        reenviado_de_usuario || null,
        reenviado_de_chat || null,
        reenviado_de_tipo || null
      );

    const nuevoMensaje = dbChat
      .prepare("SELECT * FROM chat_general WHERE id = ?")
      .get(resultado.lastInsertRowid);

    // Actualizar mensaje_id en el archivo
    if (archivoInfo) {
      dbChat
        .prepare("UPDATE chat_archivos SET mensaje_id = ?, tipo_chat = 'general' WHERE id = ?")
        .run(nuevoMensaje.id, archivo_id);
    }

    // Emitir a todos los usuarios conectados
    getIO().emit("chat_general_nuevo", nuevoMensaje);

    // Notificar a todos (excepto al remitente) si tienen notificaciones activas
    try {
      const serverUrl = process.env.SERVER_PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
      const usuarios = dbUsers
        .prepare(
          "SELECT id, nickname, name FROM users WHERE (es_sistema IS NULL OR es_sistema = 0) AND active = 1"
        )
        .all();

      usuarios.forEach((u) => {
        const nickname = u.nickname || u.name;
        if (!nickname || nickname === usuarioNickname) return;
        const cfg = getNotificacionConfig(nickname);
        if (cfg.notificaciones_activas !== 1 || cfg.general_activo !== 1) return;

        guardarNotificacionYEnviarPush(
          u.id,
          {
            title: `Mensaje en General`,
            body: `${usuarioNickname}: ${mensaje.trim()}`,
            tipo: "info",
            serverUrl,
          },
          {
            chatType: "general",
            chatTarget: "general",
            senderNickname: usuarioNickname,
          }
        );
      });
    } catch (e) {
      // Silenciar errores de notificación
    }

    // Si hay mención, notificar al usuario mencionado
    if (menciona) {
      getIO().emit("chat_mention", {
        usuario_mencionado: menciona,
        mensaje: nuevoMensaje,
        tipo: "general",
      });
    }

    res.json({ ok: true, mensaje: nuevoMensaje });
  } catch (e) {
    console.error("Error enviando mensaje general:", e);
    res.status(500).json({ error: "Error enviando mensaje general" });
  }
});

// ==========================================
// OBTENER MENSAJES PRIVADOS CON UN USUARIO
// ==========================================
router.get("/privado/:nickname", authRequired, (req, res) => {
  try {
    const { nickname } = req.params;
    const usuario = req.user;

    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    const borrado = getBorradoPrivado(usuarioNickname, nickname);
    const tieneBorrado = borrado?.borrado_en;
    const params = [
      nickname,
      usuarioNickname,
      nickname,
      nickname,
      usuarioNickname,
    ];
    let query = `SELECT cp.*, cpl.fecha_leido AS fecha_leido_otro
         FROM chat_privado cp
         LEFT JOIN chat_privado_leidos cpl
           ON cp.id = cpl.mensaje_id AND cpl.usuario_nickname = ?
         WHERE ((cp.de_nickname = ? AND cp.para_nickname = ?) 
            OR (cp.de_nickname = ? AND cp.para_nickname = ?))`;
    if (tieneBorrado) {
      query += " AND cp.fecha > ?";
      params.push(borrado.borrado_en);
    }
    query += " ORDER BY cp.fecha ASC";
    const mensajes = dbChat.prepare(query).all(...params);

    res.json(mensajes);
  } catch (e) {
    console.error("Error obteniendo mensajes privados:", e);
    res.status(500).json({ error: "Error obteniendo mensajes privados" });
  }
});

// ==========================================
// OBTENER ARCHIVOS COMPARTIDOS EN CHAT PRIVADO
// ==========================================
router.get("/privado/:nickname/archivos", authRequired, (req, res) => {
  try {
    const { nickname } = req.params;
    const usuario = req.user;

    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    const borrado = getBorradoPrivado(usuarioNickname, nickname);
    const tieneBorrado = borrado?.borrado_en;
    const params = [
      usuarioNickname,
      nickname,
      nickname,
      usuarioNickname,
    ];
    let query = `SELECT id, de_nickname, para_nickname, mensaje, fecha, archivo_url, archivo_nombre, archivo_tipo, archivo_tamaño
      FROM chat_privado
      WHERE ((de_nickname = ? AND para_nickname = ?) OR (de_nickname = ? AND para_nickname = ?))
        AND archivo_url IS NOT NULL`;
    if (tieneBorrado) {
      query += " AND fecha > ?";
      params.push(borrado.borrado_en);
    }
    query += " ORDER BY fecha DESC";

    const archivos = dbChat.prepare(query).all(...params);
    res.json(archivos || []);
  } catch (e) {
    console.error("Error obteniendo archivos compartidos:", e);
    res.status(500).json({ error: "Error obteniendo archivos" });
  }
});

// ==========================================
// OBTENER COMPARTIDOS EN CHAT PRIVADO
// ==========================================
router.get("/privado/:nickname/compartidos", authRequired, (req, res) => {
  try {
    const { nickname } = req.params;
    const usuario = req.user;

    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    const borrado = getBorradoPrivado(usuarioNickname, nickname);
    const tieneBorrado = borrado?.borrado_en;
    const params = [
      usuarioNickname,
      nickname,
      nickname,
      usuarioNickname,
    ];
    let query = `SELECT id, de_nickname, para_nickname, mensaje, fecha, tipo_mensaje, archivo_url, archivo_nombre, archivo_tipo, archivo_tamaño, enlace_compartido
      FROM chat_privado
      WHERE ((de_nickname = ? AND para_nickname = ?) OR (de_nickname = ? AND para_nickname = ?))
        AND (archivo_url IS NOT NULL OR enlace_compartido IS NOT NULL)`;
    if (tieneBorrado) {
      query += " AND fecha > ?";
      params.push(borrado.borrado_en);
    }
    query += " ORDER BY fecha DESC";

    const compartidos = dbChat.prepare(query).all(...params);
    res.json(compartidos || []);
  } catch (e) {
    console.error("Error obteniendo compartidos:", e);
    res.status(500).json({ error: "Error obteniendo compartidos" });
  }
});

// ==========================================
// OBTENER PERFIL PÚBLICO DE USUARIO
// ==========================================
router.get("/usuario/:nickname/perfil", authRequired, (req, res) => {
  try {
    const { nickname } = req.params;
    const usuario = req.user;

    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    const usuarioData = dbUsers
      .prepare("SELECT id, name, phone, nickname, photo, puesto, correo, mostrar_telefono, birthday, active FROM users WHERE nickname = ? OR name = ?")
      .get(nickname, nickname);

    if (!usuarioData) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const esMismoUsuario = usuarioNickname === (usuarioData.nickname || usuarioData.name);
    
    // Verificar mostrar_telefono de forma robusta (puede ser 0, "0", null, undefined, etc.)
    // SQLite puede devolver números o strings, así que normalizamos
    const mostrarTelefonoRaw = usuarioData.mostrar_telefono;
    const mostrarTelefonoNum = typeof mostrarTelefonoRaw === 'string' 
      ? parseInt(mostrarTelefonoRaw, 10) 
      : (mostrarTelefonoRaw ?? 1);
    
    // Solo está activo si es exactamente 1 (no 0, null, undefined, etc.)
    const mostrarTelefonoActivo = mostrarTelefonoNum === 1;
    
    // Solo puede ver el teléfono si es el mismo usuario O si mostrar_telefono está activo
    const puedeVerTelefono = esMismoUsuario || mostrarTelefonoActivo;

    console.log(`📱 Perfil usuario ${nickname}:`, {
      esMismoUsuario,
      mostrar_telefono_raw: mostrarTelefonoRaw,
      mostrar_telefono_num: mostrarTelefonoNum,
      mostrarTelefonoActivo,
      puedeVerTelefono,
      telefono: puedeVerTelefono ? usuarioData.phone : "OCULTO"
    });

    res.json({
      id: usuarioData.id,
      name: usuarioData.name,
      nickname: usuarioData.nickname || null,
      photo: usuarioData.photo || null,
      puesto: usuarioData.puesto || null,
      correo: usuarioData.correo || null,
      birthday: usuarioData.birthday || null,
      mostrar_telefono: mostrarTelefonoNum,
      telefono: puedeVerTelefono ? usuarioData.phone : null,
      telefono_visible: puedeVerTelefono,
      active: usuarioData.active === 1,
    });
  } catch (e) {
    console.error("Error obteniendo perfil de usuario:", e);
    res.status(500).json({ error: "Error obteniendo perfil" });
  }
});

// ==========================================
// ENVIAR MENSAJE PRIVADO
// ==========================================
router.post("/privado", authRequired, (req, res) => {
  try {
    const {
      para_nickname,
      mensaje,
      tipo_mensaje,
      archivo_id,
      archivo_url,
      archivo_nombre,
      archivo_tipo,
      archivo_tamaño,
      menciona,
      enlace_compartido,
      reply_to_id,
      reply_to_user,
      reply_to_text,
      reenviado_de_usuario,
      reenviado_de_chat,
      reenviado_de_tipo,
    } = req.body;
    const usuario = req.user;

    if (!mensaje || !mensaje.trim() || !para_nickname) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    const usuarioData = dbUsers
      .prepare("SELECT photo FROM users WHERE id = ?")
      .get(usuario.id);

    // Obtener información del archivo si existe
    let archivoInfo = null;
    if (archivo_id) {
      archivoInfo = dbChat
        .prepare("SELECT * FROM chat_archivos WHERE id = ?")
        .get(archivo_id);
    }

    const resultado = dbChat
      .prepare(
        `INSERT INTO chat_privado 
        (de_nickname, de_photo, para_nickname, mensaje, tipo_mensaje, archivo_url, archivo_nombre, archivo_tipo, archivo_tamaño, menciona, enlace_compartido, reply_to_id, reply_to_user, reply_to_text, reenviado_de_usuario, reenviado_de_chat, reenviado_de_tipo) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        usuarioNickname,
        usuarioData?.photo || null,
        para_nickname,
        mensaje.trim(),
        tipo_mensaje || "texto",
        archivoInfo ? `/chat/archivo/${archivo_id}` : (archivo_url || null),
        archivoInfo ? archivoInfo.nombre_original : (archivo_nombre || null),
        archivoInfo ? archivoInfo.tipo_mime : (archivo_tipo || null),
        archivoInfo ? archivoInfo.tamaño : (archivo_tamaño || null),
        menciona || null,
        enlace_compartido || null,
        reply_to_id || null,
        reply_to_user || null,
        reply_to_text || null,
        reenviado_de_usuario || null,
        reenviado_de_chat || null,
        reenviado_de_tipo || null
      );

    const nuevoMensaje = dbChat
      .prepare("SELECT * FROM chat_privado WHERE id = ?")
      .get(resultado.lastInsertRowid);

    // Actualizar mensaje_id en el archivo
    if (archivoInfo) {
      dbChat
        .prepare("UPDATE chat_archivos SET mensaje_id = ?, tipo_chat = 'privado' WHERE id = ?")
        .run(nuevoMensaje.id, archivo_id);
    }

    // Si el usuario se envía un mensaje a sí mismo, marcarlo automáticamente como visto
    if (usuarioNickname === para_nickname) {
      try {
        dbChat
          .prepare(
            `INSERT OR IGNORE INTO chat_privado_leidos (mensaje_id, usuario_nickname) VALUES (?, ?)`
          )
          .run(nuevoMensaje.id, usuarioNickname);
        
        // Emitir evento de mensaje leído
        getIO().emit("chat_privado_leidos", {
          de_nickname: para_nickname,
          para_nickname: usuarioNickname,
          mensajes: [{
            mensaje_id: nuevoMensaje.id,
            fecha_leido: new Date().toISOString()
          }],
        });
      } catch (e) {
        // Silenciar errores al marcar como leído
        console.warn("Error marcando mensaje auto-enviado como leído:", e);
      }
    }

    // Emitir al destinatario
    getIO().emit("chat_privado_nuevo", nuevoMensaje);

    // Notificar al destinatario si tiene notificaciones activas
    try {
      const receptor = dbUsers
        .prepare("SELECT id, nickname, name FROM users WHERE nickname = ? OR name = ?")
        .get(para_nickname, para_nickname);

      if (receptor?.id) {
        const nickname = receptor.nickname || receptor.name;
        const cfg = getNotificacionConfig(nickname);
        if (cfg.notificaciones_activas === 1 && cfg.privados_activos === 1) {
          const serverUrl = process.env.SERVER_PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
          guardarNotificacionYEnviarPush(
            receptor.id,
            {
              title: `Mensaje de ${usuarioNickname}`,
              body: mensaje.trim(),
              tipo: "info",
              serverUrl,
            },
            {
              chatType: "privado",
              chatTarget: usuarioNickname,
              senderNickname: usuarioNickname,
            }
          );
        }
      }
    } catch (e) {
      // Silenciar errores de notificación
    }

    // Si hay mención, notificar al usuario mencionado
    if (menciona && menciona === para_nickname) {
      getIO().emit("chat_mention", {
        usuario_mencionado: menciona,
        mensaje: nuevoMensaje,
        tipo: "privado",
      });
    }

    res.json({ ok: true, mensaje: nuevoMensaje });
  } catch (e) {
    console.error("Error enviando mensaje privado:", e);
    res.status(500).json({ error: "Error enviando mensaje privado" });
  }
});

// ==========================================
// OBTENER CHATS ACTIVOS (conversaciones con mensajes)
// ==========================================
router.get("/activos", authRequired, (req, res) => {
  try {
    const usuario = req.user;

    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    // Obtener conversaciones privadas con último mensaje
    // Primero obtener los usuarios únicos con los que hay conversación
    const conversacionesRaw = dbChat
      .prepare(
        `SELECT 
          CASE 
            WHEN de_nickname = ? THEN para_nickname 
            ELSE de_nickname 
          END as otro_usuario,
          MAX(fecha) as ultima_fecha
         FROM chat_privado
         WHERE de_nickname = ? OR para_nickname = ?
         GROUP BY otro_usuario
         ORDER BY ultima_fecha DESC`
      )
      .all(
        usuarioNickname,
        usuarioNickname,
        usuarioNickname
      );

    // Para cada conversación, obtener el último mensaje y quién lo envió
    const conversaciones = conversacionesRaw
      .map((conv) => {
        const borrado = getBorradoPrivado(usuarioNickname, conv.otro_usuario);
        const tieneBorrado = borrado?.borrado_en;

        const ultimoMensajeParams = [
          usuarioNickname,
          conv.otro_usuario,
          conv.otro_usuario,
          usuarioNickname,
        ];
        let ultimoMensajeQuery = `SELECT mensaje, de_nickname, fecha FROM chat_privado 
           WHERE ((de_nickname = ? AND para_nickname = ?) 
                  OR (de_nickname = ? AND para_nickname = ?))`;
        if (tieneBorrado) {
          ultimoMensajeQuery += " AND fecha > ?";
          ultimoMensajeParams.push(borrado.borrado_en);
        }
        ultimoMensajeQuery += " ORDER BY fecha DESC LIMIT 1";

        const ultimoMensaje = dbChat
          .prepare(ultimoMensajeQuery)
          .get(...ultimoMensajeParams);

        if (!ultimoMensaje) {
          return null;
        }

        const mensajesNoLeidosParams = [usuarioNickname, conv.otro_usuario, usuarioNickname];
        let mensajesNoLeidosQuery = `SELECT COUNT(*) as count 
           FROM chat_privado cp
           LEFT JOIN chat_privado_leidos cpl ON cp.id = cpl.mensaje_id AND cpl.usuario_nickname = ?
           WHERE cp.de_nickname = ? AND cp.para_nickname = ? AND cpl.id IS NULL`;
        if (tieneBorrado) {
          mensajesNoLeidosQuery += " AND cp.fecha > ?";
          mensajesNoLeidosParams.push(borrado.borrado_en);
        }

        const mensajesNoLeidos = dbChat
          .prepare(mensajesNoLeidosQuery)
          .get(...mensajesNoLeidosParams);

        return {
          otro_usuario: conv.otro_usuario,
          ultima_fecha: ultimoMensaje?.fecha || conv.ultima_fecha,
          ultimo_mensaje: ultimoMensaje?.mensaje || "",
          ultimo_remitente: ultimoMensaje?.de_nickname || "",
          mensajes_no_leidos: mensajesNoLeidos?.count || 0,
        };
      })
      .filter(Boolean);

    res.json(conversaciones);
  } catch (e) {
    console.error("Error obteniendo chats activos:", e);
    res.status(500).json({ error: "Error obteniendo chats activos" });
  }
});

// ==========================================
// MARCAR MENSAJES COMO LEÍDOS
// ==========================================
router.post("/privado/:nickname/leer", authRequired, (req, res) => {
  try {
    const { nickname } = req.params;
    const usuario = req.user;

    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    // Obtener todos los mensajes del otro usuario hacia ti que aún no has leído
    const borrado = getBorradoPrivado(usuarioNickname, nickname);
    const tieneBorrado = borrado?.borrado_en;
    const params = [usuarioNickname, nickname, usuarioNickname];
    let query = `SELECT cp.id 
         FROM chat_privado cp
         LEFT JOIN chat_privado_leidos cpl ON cp.id = cpl.mensaje_id AND cpl.usuario_nickname = ?
         WHERE cp.de_nickname = ? AND cp.para_nickname = ? AND cpl.id IS NULL`;
    if (tieneBorrado) {
      query += " AND cp.fecha > ?";
      params.push(borrado.borrado_en);
    }
    const mensajesNoLeidos = dbChat.prepare(query).all(...params);

    // Insertar en la tabla de leídos todos los mensajes que aún no están marcados
    const insertLeido = dbChat.prepare(
      `INSERT OR IGNORE INTO chat_privado_leidos (mensaje_id, usuario_nickname) VALUES (?, ?)`
    );

    const insertMany = dbChat.transaction((mensajes) => {
      for (const msg of mensajes) {
        insertLeido.run(msg.id, usuarioNickname);
      }
    });

    insertMany(mensajesNoLeidos);

    if (mensajesNoLeidos.length > 0) {
      const ids = mensajesNoLeidos.map((m) => m.id);
      const marcados = dbChat
        .prepare(
          `SELECT mensaje_id, fecha_leido FROM chat_privado_leidos
           WHERE usuario_nickname = ? AND mensaje_id IN (${ids.map(() => "?").join(",")})`
        )
        .all(usuarioNickname, ...ids);

      getIO().emit("chat_privado_leidos", {
        de_nickname: nickname,
        para_nickname: usuarioNickname,
        mensajes: marcados,
      });
      try {
        getIO().emit("chats_activos_actualizados");
      } catch (err) {}
    }

    res.json({ ok: true, mensajes_marcados: mensajesNoLeidos.length });
  } catch (e) {
    console.error("Error marcando mensajes como leídos:", e);
    res.status(500).json({ error: "Error marcando mensajes como leídos" });
  }
});

// ==========================================
// MARCAR MENSAJES GENERALES COMO LEÍDOS
// ==========================================
router.post("/general/leer", authRequired, (req, res) => {
  try {
    const usuario = req.user;
    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    const mensajesNoLeidos = dbChat
      .prepare(
        `SELECT cg.id
         FROM chat_general cg
         LEFT JOIN chat_general_leidos cgl
           ON cg.id = cgl.mensaje_id AND cgl.usuario_nickname = ?
         WHERE cgl.id IS NULL`
      )
      .all(usuarioNickname);

    const insertLeido = dbChat.prepare(
      `INSERT OR IGNORE INTO chat_general_leidos (mensaje_id, usuario_nickname) VALUES (?, ?)`
    );
    const insertMany = dbChat.transaction((mensajes) => {
      for (const msg of mensajes) {
        insertLeido.run(msg.id, usuarioNickname);
      }
    });
    insertMany(mensajesNoLeidos);

    if (mensajesNoLeidos.length > 0) {
      try {
        getIO().emit("chats_activos_actualizados");
      } catch (err) {}
    }
    res.json({ ok: true, mensajes_marcados: mensajesNoLeidos.length });
  } catch (e) {
    console.error("Error marcando mensajes generales como leídos:", e);
    res.status(500).json({ error: "Error marcando mensajes como leídos" });
  }
});

// ==========================================
// MARCAR MENSAJES GRUPALES COMO LEÍDOS
// ==========================================
router.post("/grupos/:id/leer", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.user;
    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    const mensajesNoLeidos = dbChat
      .prepare(
        `SELECT cg.id
         FROM chat_grupal cg
         LEFT JOIN chat_grupal_leidos cgl
           ON cg.id = cgl.mensaje_id AND cgl.usuario_nickname = ?
         WHERE cg.grupo_id = ? AND cgl.id IS NULL`
      )
      .all(usuarioNickname, id);

    const insertLeido = dbChat.prepare(
      `INSERT OR IGNORE INTO chat_grupal_leidos (mensaje_id, grupo_id, usuario_nickname) VALUES (?, ?, ?)`
    );
    const insertMany = dbChat.transaction((mensajes) => {
      for (const msg of mensajes) {
        insertLeido.run(msg.id, id, usuarioNickname);
      }
    });
    insertMany(mensajesNoLeidos);

    if (mensajesNoLeidos.length > 0) {
      try {
        getIO().emit("chats_activos_actualizados");
      } catch (err) {}
    }
    res.json({ ok: true, mensajes_marcados: mensajesNoLeidos.length });
  } catch (e) {
    console.error("Error marcando mensajes grupales como leídos:", e);
    res.status(500).json({ error: "Error marcando mensajes como leídos" });
  }
});

// ==========================================
// PRIORITARIOS PENDIENTES (recordatorio cada 3 min; solo prioridad=1, sin leídos)
// ==========================================
router.get("/prioritarios-pendientes", authRequired, (req, res) => {
  try {
    const usuario = req.user;
    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) return res.json({ hay: false });

    let g = dbChat
      .prepare(
        `SELECT 1 FROM chat_general WHERE prioridad = 1 AND usuario_nickname != ? LIMIT 1`
      )
      .get(usuarioNickname);
    if (g) return res.json({ hay: true });

    let p = dbChat
      .prepare(
        `SELECT 1 FROM chat_privado WHERE prioridad = 1 AND de_nickname != ?
         AND (para_nickname = ? OR de_nickname = ?) LIMIT 1`
      )
      .get(usuarioNickname, usuarioNickname, usuarioNickname);
    if (p) return res.json({ hay: true });

    const misGrupos = dbChat
      .prepare("SELECT grupo_id FROM chat_grupos_miembros WHERE usuario_nickname = ?")
      .all(usuarioNickname)
      .map((r) => r.grupo_id);
    if (misGrupos.length) {
      const ph = misGrupos.map(() => "?").join(",");
      let gr = dbChat
        .prepare(
          `SELECT 1 FROM chat_grupal WHERE prioridad = 1 AND usuario_nickname != ?
           AND grupo_id IN (${ph}) LIMIT 1`
        )
        .get(usuarioNickname, ...misGrupos);
      if (gr) return res.json({ hay: true });
    }
    res.json({ hay: false });
  } catch (e) {
    console.error("Error prioritarios pendientes:", e);
    res.status(500).json({ hay: false });
  }
});

// ==========================================
// INFO DE MENSAJE (FECHA LLEGADA Y LEÍDO)
// ==========================================
router.get("/mensaje/:tipo/:id/info", authRequired, (req, res) => {
  try {
    const { tipo, id } = req.params;
    const usuario = req.user;
    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    let tabla;
    if (tipo === "general") {
      tabla = "chat_general";
    } else if (tipo === "privado") {
      tabla = "chat_privado";
    } else if (tipo === "grupal") {
      tabla = "chat_grupal";
    } else {
      return res.status(400).json({ error: "Tipo de chat inválido" });
    }

    const mensaje = dbChat.prepare(`SELECT * FROM ${tabla} WHERE id = ?`).get(id);
    if (!mensaje) {
      return res.status(404).json({ error: "Mensaje no encontrado" });
    }

    let leidoPor = usuarioNickname;
    let fechaLeido = null;

    if (tipo === "privado") {
      leidoPor =
        mensaje.de_nickname === usuarioNickname
          ? mensaje.para_nickname
          : usuarioNickname;
      const leido = dbChat
        .prepare(
          "SELECT fecha_leido FROM chat_privado_leidos WHERE mensaje_id = ? AND usuario_nickname = ?"
        )
        .get(id, leidoPor);
      fechaLeido = leido?.fecha_leido || null;
    } else if (tipo === "general") {
      const leido = dbChat
        .prepare(
          "SELECT fecha_leido FROM chat_general_leidos WHERE mensaje_id = ? AND usuario_nickname = ?"
        )
        .get(id, usuarioNickname);
      fechaLeido = leido?.fecha_leido || null;
    } else if (tipo === "grupal") {
      const leido = dbChat
        .prepare(
          "SELECT fecha_leido FROM chat_grupal_leidos WHERE mensaje_id = ? AND usuario_nickname = ?"
        )
        .get(id, usuarioNickname);
      fechaLeido = leido?.fecha_leido || null;
    }

    res.json({
      ok: true,
      fecha_envio: mensaje.fecha,
      leido_por: leidoPor,
      fecha_leido: fechaLeido,
    });
  } catch (e) {
    console.error("Error obteniendo info de mensaje:", e);
    res.status(500).json({ error: "Error obteniendo info de mensaje" });
  }
});

// ==========================================
// FIJAR MENSAJE
// ==========================================
router.get("/pin/:tipo/:chatId", authRequired, (req, res) => {
  try {
    const { tipo, chatId } = req.params;
    const usuario = req.user;
    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    const pin = dbChat
      .prepare(
        "SELECT * FROM chat_pins WHERE usuario_nickname = ? AND tipo_chat = ? AND chat_id = ?"
      )
      .get(usuarioNickname, tipo, chatId);
    if (!pin) return res.json({ ok: true, pin: null });

    let tabla;
    if (tipo === "general") tabla = "chat_general";
    if (tipo === "privado") tabla = "chat_privado";
    if (tipo === "grupal") tabla = "chat_grupal";
    if (!tabla) return res.status(400).json({ error: "Tipo de chat inválido" });

    const mensaje = dbChat.prepare(`SELECT * FROM ${tabla} WHERE id = ?`).get(pin.mensaje_id);
    res.json({ ok: true, pin: mensaje || null });
  } catch (e) {
    console.error("Error obteniendo pin:", e);
    res.status(500).json({ error: "Error obteniendo pin" });
  }
});

router.post("/pin", authRequired, (req, res) => {
  try {
    const { tipo_chat, chat_id, mensaje_id } = req.body || {};
    const usuario = req.user;
    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }
    if (!tipo_chat || !chat_id || !mensaje_id) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    dbChat
      .prepare(
        "DELETE FROM chat_pins WHERE usuario_nickname = ? AND tipo_chat = ? AND chat_id = ?"
      )
      .run(usuarioNickname, tipo_chat, chat_id);
    dbChat
      .prepare(
        "INSERT INTO chat_pins (usuario_nickname, tipo_chat, chat_id, mensaje_id) VALUES (?, ?, ?, ?)"
      )
      .run(usuarioNickname, tipo_chat, chat_id, mensaje_id);

    res.json({ ok: true });
  } catch (e) {
    console.error("Error fijando mensaje:", e);
    res.status(500).json({ error: "Error fijando mensaje" });
  }
});

router.delete("/pin", authRequired, (req, res) => {
  try {
    const { tipo_chat, chat_id } = req.body || {};
    const usuario = req.user;
    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }
    if (!tipo_chat || !chat_id) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    dbChat
      .prepare(
        "DELETE FROM chat_pins WHERE usuario_nickname = ? AND tipo_chat = ? AND chat_id = ?"
      )
      .run(usuarioNickname, tipo_chat, chat_id);

    res.json({ ok: true });
  } catch (e) {
    console.error("Error desfijando mensaje:", e);
    res.status(500).json({ error: "Error desfijando mensaje" });
  }
});

// ==========================================
// DESTACAR MENSAJE
// ==========================================
router.get("/destacados/:tipo/:chatId", authRequired, (req, res) => {
  try {
    const { tipo, chatId } = req.params;
    const usuario = req.user;
    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    const rows = dbChat
      .prepare(
        "SELECT mensaje_id FROM chat_destacados WHERE usuario_nickname = ? AND tipo_chat = ? AND chat_id = ?"
      )
      .all(usuarioNickname, tipo, chatId);
    res.json({ ok: true, destacados: rows.map((r) => r.mensaje_id) });
  } catch (e) {
    console.error("Error obteniendo destacados:", e);
    res.status(500).json({ error: "Error obteniendo destacados" });
  }
});

router.post("/destacados", authRequired, (req, res) => {
  try {
    const { tipo_chat, chat_id, mensaje_id } = req.body || {};
    const usuario = req.user;
    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }
    if (!tipo_chat || !chat_id || !mensaje_id) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    const existente = dbChat
      .prepare(
        "SELECT id FROM chat_destacados WHERE usuario_nickname = ? AND tipo_chat = ? AND chat_id = ? AND mensaje_id = ?"
      )
      .get(usuarioNickname, tipo_chat, chat_id, mensaje_id);

    if (existente) {
      dbChat
        .prepare(
          "DELETE FROM chat_destacados WHERE usuario_nickname = ? AND tipo_chat = ? AND chat_id = ? AND mensaje_id = ?"
        )
        .run(usuarioNickname, tipo_chat, chat_id, mensaje_id);
      return res.json({ ok: true, destacado: false });
    }

    dbChat
      .prepare(
        "INSERT INTO chat_destacados (usuario_nickname, tipo_chat, chat_id, mensaje_id) VALUES (?, ?, ?, ?)"
      )
      .run(usuarioNickname, tipo_chat, chat_id, mensaje_id);
    res.json({ ok: true, destacado: true });
  } catch (e) {
    console.error("Error destacando mensaje:", e);
    res.status(500).json({ error: "Error destacando mensaje" });
  }
});

// ==========================================
// MARCAR MENSAJE COMO PRIORITARIO
// ==========================================
router.post("/mensaje/:tipo/:id/prioridad", authRequired, (req, res) => {
  try {
    const { tipo, id } = req.params;
    const { prioridad } = req.body || {};
    const usuario = req.user;
    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    let tabla;
    if (tipo === "general") {
      tabla = "chat_general";
    } else if (tipo === "privado") {
      tabla = "chat_privado";
    } else if (tipo === "grupal") {
      tabla = "chat_grupal";
    } else {
      return res.status(400).json({ error: "Tipo de chat inválido" });
    }

    // Verificar que el mensaje existe
    const mensaje = dbChat.prepare(`SELECT * FROM ${tabla} WHERE id = ?`).get(id);
    if (!mensaje) {
      return res.status(404).json({ error: "Mensaje no encontrado" });
    }

    // Actualizar prioridad (0 = normal, 1 = alta)
    const nuevaPrioridad = prioridad === 1 ? 1 : 0;
    dbChat
      .prepare(`UPDATE ${tabla} SET prioridad = ? WHERE id = ?`)
      .run(nuevaPrioridad, id);

    const mensajeActualizado = dbChat
      .prepare(`SELECT * FROM ${tabla} WHERE id = ?`)
      .get(id);

    // Emitir actualización a través de socket
    if (tipo === "general") {
      getIO().emit("chat_general_actualizado", mensajeActualizado);
      
      // Si se marca como prioritario, enviar notificaciones push a todos los usuarios
      if (nuevaPrioridad === 1) {
        try {
          const serverUrl = process.env.SERVER_PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
          const usuarios = dbUsers
            .prepare(
              "SELECT id, nickname, name FROM users WHERE (es_sistema IS NULL OR es_sistema = 0) AND active = 1"
            )
            .all();

          usuarios.forEach((u) => {
            const nickname = u.nickname || u.name;
            if (!nickname || nickname === usuarioNickname) return;
            const cfg = getNotificacionConfig(nickname);
            if (cfg.notificaciones_activas !== 1 || cfg.general_activo !== 1) return;

            guardarNotificacionYEnviarPush(
              u.id,
              {
                title: `🔴 Mensaje Prioritario en General`,
                body: `${usuarioNickname} marcó un mensaje como prioritario: ${mensajeActualizado.mensaje?.substring(0, 100) || "Mensaje prioritario"}`,
                tipo: "warning",
                serverUrl,
              },
              {
                chatType: "general",
                chatTarget: "general",
                senderNickname: usuarioNickname,
                prioridad: 1,
                mensaje_id: mensajeActualizado.id,
              },
              { emitSocket: true }
            );
          });
        } catch (e) {
          console.error("Error enviando notificaciones de mensaje prioritario:", e);
        }
      }
    } else if (tipo === "privado") {
      getIO().emit("chat_privado_actualizado", mensajeActualizado);
      
      // Si se marca como prioritario, enviar notificación push al destinatario
      if (nuevaPrioridad === 1) {
        try {
          const serverUrl = process.env.SERVER_PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
          // Determinar el destinatario (el que NO es el que marcó la prioridad)
          const destinatarioNickname = mensajeActualizado.de_nickname === usuarioNickname 
            ? mensajeActualizado.para_nickname 
            : mensajeActualizado.de_nickname;
          
          if (destinatarioNickname && destinatarioNickname !== usuarioNickname) {
            const receptor = dbUsers
              .prepare("SELECT id, nickname, name FROM users WHERE nickname = ? OR name = ?")
              .get(destinatarioNickname, destinatarioNickname);

            if (receptor?.id) {
              const cfg = getNotificacionConfig(destinatarioNickname);
              if (cfg.notificaciones_activas === 1 && cfg.privados_activos === 1) {
                guardarNotificacionYEnviarPush(
                  receptor.id,
                  {
                    title: `🔴 Mensaje Prioritario de ${usuarioNickname}`,
                    body: `${usuarioNickname} marcó un mensaje como prioritario: ${mensajeActualizado.mensaje?.substring(0, 100) || "Mensaje prioritario"}`,
                    tipo: "warning",
                    serverUrl,
                  },
                  {
                    chatType: "privado",
                    chatTarget: usuarioNickname,
                    senderNickname: usuarioNickname,
                    prioridad: 1,
                    mensaje_id: mensajeActualizado.id,
                  },
                  { emitSocket: true }
                );
              }
            }
          }
        } catch (e) {
          console.error("Error enviando notificaciones de mensaje prioritario:", e);
        }
      }
    } else if (tipo === "grupal") {
      getIO().emit("chat_grupal_actualizado", mensajeActualizado);
      
      // Si se marca como prioritario, enviar notificaciones push
      if (nuevaPrioridad === 1) {
        try {
          const serverUrl = process.env.SERVER_PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
          const grupoInfo = dbChat
            .prepare("SELECT nombre FROM chat_grupos WHERE id = ?")
            .get(mensajeActualizado.grupo_id);
          const nombreGrupo = grupoInfo?.nombre || "Grupo";

          const miembros = dbChat
            .prepare("SELECT usuario_nickname FROM chat_grupos_miembros WHERE grupo_id = ?")
            .all(mensajeActualizado.grupo_id);

          // Obtener la etiqueta (menciona) del mensaje
          const { menciona } = req.body || {};
          const tieneEtiqueta = menciona && menciona.trim();

          miembros.forEach((m) => {
            if (!m.usuario_nickname || m.usuario_nickname === usuarioNickname) return;
            
            // Si hay etiqueta, solo notificar a la persona etiquetada
            if (tieneEtiqueta && m.usuario_nickname !== menciona) return;
            
            const cfg = getNotificacionConfig(m.usuario_nickname);
            if (cfg.notificaciones_activas !== 1 || cfg.grupos_activos !== 1) return;

            const receptor = dbUsers
              .prepare("SELECT id FROM users WHERE nickname = ? OR name = ?")
              .get(m.usuario_nickname, m.usuario_nickname);

            if (!receptor?.id) return;

            const mensajeBody = tieneEtiqueta
              ? `@${menciona} ${mensajeActualizado.mensaje?.substring(0, 100) || "Mensaje prioritario"}`
              : mensajeActualizado.mensaje?.substring(0, 100) || "Mensaje prioritario";

            guardarNotificacionYEnviarPush(
              receptor.id,
              {
                title: `🔴 Mensaje Prioritario en ${nombreGrupo}`,
                body: `${usuarioNickname}: ${mensajeBody}`,
                tipo: "warning",
                serverUrl,
              },
              {
                chatType: "grupal",
                chatTarget: String(mensajeActualizado.grupo_id),
                senderNickname: usuarioNickname,
                groupName: nombreGrupo,
                prioridad: 1,
                mensaje_id: mensajeActualizado.id,
                menciona: menciona || null,
              },
              { emitSocket: true }
            );
          });
        } catch (e) {
          console.error("Error enviando notificaciones de mensaje prioritario:", e);
        }
      }
    }

    if (nuevaPrioridad === 0) {
      // Si se quita la prioridad, eliminar notificaciones asociadas
      // Para chat privado, debemos considerar ambos participantes como chatTarget
      if (tipo === "general") {
        eliminarNotifsPrioridadMensaje("general", id, "general");
        try {
          getIO().emit("notificaciones_actualizadas");
        } catch (_) {}
      } else if (tipo === "privado") {
        // Para chat privado, obtener ambos participantes
        const destinatarioNickname = mensajeActualizado.de_nickname === usuarioNickname 
          ? mensajeActualizado.para_nickname 
          : mensajeActualizado.de_nickname;
        
        // Eliminar notificaciones con chatTarget de ambos participantes
        eliminarNotifsPrioridadMensaje("privado", id, usuarioNickname);
        if (destinatarioNickname && destinatarioNickname !== usuarioNickname) {
          eliminarNotifsPrioridadMensaje("privado", id, destinatarioNickname);
        }
        
        try {
          getIO().emit("notificaciones_actualizadas");
        } catch (_) {}
      } else if (tipo === "grupal") {
        eliminarNotifsPrioridadMensaje("grupal", id, String(mensajeActualizado.grupo_id ?? ""));
        try {
          getIO().emit("notificaciones_actualizadas");
        } catch (_) {}
      }
    }

    res.json({ ok: true, success: true, mensaje: mensajeActualizado });
  } catch (e) {
    console.error("Error marcando prioridad:", e);
    res.status(500).json({ error: "Error marcando prioridad" });
  }
});

// ==========================================
// LIMPIAR NOTIFICACIONES DE MENSAJE PRIORITARIO
// ==========================================
router.post("/mensaje/:tipo/:id/limpiar-notificacion", authRequired, (req, res) => {
  try {
    const { tipo, id } = req.params;
    const { grupoId, tieneEtiqueta } = req.body || {};
    
    // Eliminar notificaciones de este mensaje para todos los usuarios
    let chatTarget = null;
    if (tipo === "general") chatTarget = "general";
    else if (tipo === "grupal") chatTarget = String(grupoId || "");
    
    if (chatTarget != null) {
      eliminarNotifsPrioridadMensaje(tipo, id, chatTarget);
      try {
        getIO().emit("notificaciones_actualizadas");
      } catch (_) {}
    }
    
    res.json({ ok: true, success: true });
  } catch (e) {
    console.error("Error limpiando notificaciones:", e);
    res.status(500).json({ error: "Error limpiando notificaciones" });
  }
});

// ==========================================
// BORRAR CONVERSACIÓN PRIVADA
// ==========================================
router.delete("/privado/:nickname", authRequired, (req, res) => {
  try {
    const { nickname } = req.params;
    const usuario = req.user;

    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    dbChat
      .prepare(
        `INSERT INTO chat_privado_borrados (usuario_nickname, otro_usuario, borrado_en)
         VALUES (?, ?, datetime('now', 'localtime'))
         ON CONFLICT(usuario_nickname, otro_usuario)
         DO UPDATE SET borrado_en = datetime('now', 'localtime')`
      )
      .run(usuarioNickname, nickname);

    res.json({ ok: true, borrado_para: usuarioNickname, otro_usuario: nickname });
  } catch (e) {
    console.error("Error borrando conversación:", e);
    res.status(500).json({ error: "Error borrando conversación" });
  }
});

// ==========================================
// VACIAR HISTORIAL GENERAL
// ==========================================
router.delete("/general", authRequired, (req, res) => {
  try {
    // ⚠️ OPERACIÓN CRÍTICA: Elimina TODOS los mensajes del chat general
    // Usar transacción para asegurar atomicidad
    const deleteAllGeneral = dbChat.transaction(() => {
      const info = dbChat.prepare("DELETE FROM chat_general").run();
      return info.changes;
    });
    
    const eliminados = deleteAllGeneral();
    res.json({ ok: true, eliminados });
  } catch (e) {
    console.error("Error vaciando historial general:", e);
    res.status(500).json({ error: "Error vaciando historial general" });
  }
});

// ==========================================
// GRUPOS - CREAR GRUPO
// ==========================================
router.post("/grupos", authRequired, (req, res) => {
  try {
    const { nombre, descripcion, es_publico } = req.body;
    const usuario = req.user;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: "Nombre de grupo requerido" });
    }

    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    const resultado = dbChat
      .prepare(
        "INSERT INTO chat_grupos (nombre, descripcion, creado_por, es_publico) VALUES (?, ?, ?, ?)"
      )
      .run(
        nombre.trim(), 
        descripcion || null, 
        usuarioNickname,
        es_publico !== undefined ? (es_publico ? 1 : 0) : 1
      );

    const grupoId = resultado.lastInsertRowid;

    // Agregar creador como miembro
    dbChat
      .prepare(
        "INSERT INTO chat_grupos_miembros (grupo_id, usuario_nickname) VALUES (?, ?)"
      )
      .run(grupoId, usuarioNickname);

    const nuevoGrupo = dbChat
      .prepare("SELECT * FROM chat_grupos WHERE id = ?")
      .get(grupoId);

    getIO().emit("chat_grupo_creado", nuevoGrupo);

    res.json({ ok: true, grupo: nuevoGrupo });
  } catch (e) {
    console.error("Error creando grupo:", e);
    res.status(500).json({ error: "Error creando grupo" });
  }
});

// ==========================================
// GRUPOS - OBTENER TODOS LOS GRUPOS (todos ven todos; es_miembro por usuario)
// ==========================================
router.get("/grupos", authRequired, (req, res) => {
  try {
    const usuarioNickname = obtenerNombreUsuario(req.user.id);
    const grupos = dbChat
      .prepare("SELECT * FROM chat_grupos ORDER BY fecha_creacion DESC")
      .all();

    const gruposConMiembros = grupos.map((grupo) => {
      const miembros = dbChat
        .prepare(
          "SELECT usuario_nickname FROM chat_grupos_miembros WHERE grupo_id = ?"
        )
        .all(grupo.id);
      const nicknames = miembros.map((m) => m.usuario_nickname);
      const esMiembro = usuarioNickname ? nicknames.includes(usuarioNickname) : false;
      return {
        ...grupo,
        miembros: nicknames,
        es_miembro: esMiembro,
      };
    });

    res.json(gruposConMiembros);
  } catch (e) {
    console.error("Error obteniendo grupos:", e);
    res.status(500).json({ error: "Error obteniendo grupos" });
  }
});

// ==========================================
// GRUPOS - OBTENER GRUPOS DEL USUARIO
// ==========================================
router.get("/grupos/mios", authRequired, (req, res) => {
  try {
    const usuario = req.user;

    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    const grupos = dbChat
      .prepare(
        `SELECT g.* FROM chat_grupos g
         INNER JOIN chat_grupos_miembros m ON g.id = m.grupo_id
         WHERE m.usuario_nickname = ?
         ORDER BY g.fecha_creacion DESC`
      )
      .all(usuarioNickname);

    // Agregar información de miembros
    const gruposConMiembros = grupos.map((grupo) => {
      const miembros = dbChat
        .prepare(
          "SELECT usuario_nickname FROM chat_grupos_miembros WHERE grupo_id = ?"
        )
        .all(grupo.id);
      return {
        ...grupo,
        miembros: miembros.map((m) => m.usuario_nickname),
      };
    });

    res.json(gruposConMiembros);
  } catch (e) {
    console.error("Error obteniendo mis grupos:", e);
    res.status(500).json({ error: "Error obteniendo mis grupos" });
  }
});

// ==========================================
// GRUPOS - AGREGAR MIEMBRO A GRUPO
// ==========================================
router.post("/grupos/:id/miembros", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    const { usuario_nickname } = req.body;

    if (!usuario_nickname) {
      return res.status(400).json({ error: "Nickname requerido" });
    }

    dbChat
      .prepare(
        "INSERT OR IGNORE INTO chat_grupos_miembros (grupo_id, usuario_nickname) VALUES (?, ?)"
      )
      .run(id, usuario_nickname);

    res.json({ ok: true });
  } catch (e) {
    console.error("Error agregando miembro:", e);
    res.status(500).json({ error: "Error agregando miembro" });
  }
});

// ==========================================
// GRUPOS - SOLICITAR ACCESO (grupos privados)
// ==========================================
router.post("/grupos/:id/solicitar-acceso", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.user;
    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    const grupo = dbChat.prepare("SELECT * FROM chat_grupos WHERE id = ?").get(id);
    if (!grupo) return res.status(404).json({ error: "Grupo no encontrado" });
    if (grupo.es_publico === 1) {
      return res.status(400).json({ error: "El grupo es público; puedes unirte directamente" });
    }

    const esMiembro = dbChat
      .prepare("SELECT 1 FROM chat_grupos_miembros WHERE grupo_id = ? AND usuario_nickname = ?")
      .get(id, usuarioNickname);
    if (esMiembro) return res.status(400).json({ error: "Ya eres miembro del grupo" });

    const existente = dbChat
      .prepare(
        "SELECT id, estado FROM chat_grupos_solicitudes WHERE grupo_id = ? AND usuario_nickname = ?"
      )
      .get(id, usuarioNickname);
    if (existente) {
      if (existente.estado === "pendiente") {
        return res.status(400).json({ error: "Ya has solicitado acceso. Espera la respuesta." });
      }
      dbChat
        .prepare("DELETE FROM chat_grupos_solicitudes WHERE grupo_id = ? AND usuario_nickname = ?")
        .run(id, usuarioNickname);
    }

    const ins = dbChat
      .prepare(
        "INSERT INTO chat_grupos_solicitudes (grupo_id, usuario_nickname, estado) VALUES (?, ?, 'pendiente')"
      )
      .run(id, usuarioNickname);
    const solicitudId = ins.lastInsertRowid;
    const nombreGrupo = grupo.nombre || "Grupo";
    const serverUrl = process.env.SERVER_PUBLIC_URL || `${req.protocol}://${req.get("host")}`;

    const admins = [grupo.creado_por];
    const rows = dbChat
      .prepare("SELECT usuario_nickname FROM chat_grupos_administradores WHERE grupo_id = ?")
      .all(id);
    rows.forEach((r) => {
      if (r.usuario_nickname && !admins.includes(r.usuario_nickname)) admins.push(r.usuario_nickname);
    });

    const dataExtra = {
      tipo: "solicitud_grupo",
      solicitud_id: solicitudId,
      grupo_id: Number(id),
      groupName: nombreGrupo,
      solicitante_nickname: usuarioNickname,
      fecha: new Date().toISOString(),
      chatType: "grupal",
      chatTarget: String(id),
    };

    admins.forEach((nick) => {
      const rec = dbUsers.prepare("SELECT id FROM users WHERE nickname = ? OR name = ?").get(nick, nick);
      if (!rec?.id) return;
      const cfg = getNotificacionConfig(nick);
      if (cfg.notificaciones_activas !== 1 || cfg.grupos_activos !== 1) return;
      guardarNotificacionYEnviarPush(
        rec.id,
        {
          title: `Solicitud de acceso al grupo "${nombreGrupo}"`,
          body: `${usuarioNickname} solicita unirse al grupo. Abre el chat del grupo para aceptar o rechazar.`,
          tipo: "info",
          serverUrl,
        },
        { ...dataExtra },
        { emitSocket: true }
      );
    });

    getIO().emit("chat_grupo_solicitud_nueva", { grupo_id: id, solicitud_id: solicitudId });
    res.json({ ok: true, solicitud_id: solicitudId, message: "Solicitud enviada" });
  } catch (e) {
    console.error("Error solicitando acceso al grupo:", e);
    res.status(500).json({ error: "Error solicitando acceso" });
  }
});

// ==========================================
// GRUPOS - OBTENER SOLICITUDES PENDIENTES (solo creador/admins)
// ==========================================
router.get("/grupos/:id/solicitudes", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.user;
    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    const grupo = dbChat.prepare("SELECT creado_por FROM chat_grupos WHERE id = ?").get(id);
    if (!grupo) return res.status(404).json({ error: "Grupo no encontrado" });
    if (grupo.creado_por !== usuarioNickname) {
      const esAdmin = dbChat
        .prepare("SELECT 1 FROM chat_grupos_administradores WHERE grupo_id = ? AND usuario_nickname = ?")
        .get(id, usuarioNickname);
      if (!esAdmin) return res.status(403).json({ error: "Solo el creador o administradores pueden ver solicitudes" });
    }

    const list = dbChat
      .prepare(
        "SELECT id, grupo_id, usuario_nickname, fecha, estado FROM chat_grupos_solicitudes WHERE grupo_id = ? AND estado = 'pendiente' ORDER BY fecha ASC"
      )
      .all(id);
    res.json(list);
  } catch (e) {
    console.error("Error obteniendo solicitudes:", e);
    res.status(500).json({ error: "Error obteniendo solicitudes" });
  }
});

// ==========================================
// GRUPOS - RESPONDER SOLICITUD (aceptar/rechazar)
// ==========================================
router.post("/grupos/:id/solicitudes/:sid/responder", authRequired, (req, res) => {
  try {
    const { id, sid } = req.params;
    const { aceptar } = req.body;
    const usuario = req.user;
    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    const grupo = dbChat.prepare("SELECT * FROM chat_grupos WHERE id = ?").get(id);
    if (!grupo) return res.status(404).json({ error: "Grupo no encontrado" });
    const esAdmin = esAdminOGrupo(id, usuarioNickname);
    if (!esAdmin) return res.status(403).json({ error: "Solo el creador o administradores pueden responder" });

    const sol = dbChat
      .prepare(
        "SELECT * FROM chat_grupos_solicitudes WHERE id = ? AND grupo_id = ? AND estado = 'pendiente'"
      )
      .get(sid, id);
    if (!sol) return res.status(404).json({ error: "Solicitud no encontrada o ya respondida" });

    const ahora = new Date().toISOString();
    if (aceptar) {
      dbChat
        .prepare(
          "INSERT OR IGNORE INTO chat_grupos_miembros (grupo_id, usuario_nickname) VALUES (?, ?)"
        )
        .run(id, sol.usuario_nickname);
      dbChat
        .prepare(
          "UPDATE chat_grupos_solicitudes SET estado = 'aceptada', respondido_por = ?, respondido_en = ? WHERE id = ?"
        )
        .run(usuarioNickname, ahora, sid);
      getIO().emit("chat_grupo_solicitud_respondida", {
        grupo_id: id,
        solicitud_id: Number(sid),
        aceptada: true,
        usuario_nickname: sol.usuario_nickname,
      });
    } else {
      dbChat
        .prepare(
          "UPDATE chat_grupos_solicitudes SET estado = 'rechazada', respondido_por = ?, respondido_en = ? WHERE id = ?"
        )
        .run(usuarioNickname, ahora, sid);
      getIO().emit("chat_grupo_solicitud_respondida", {
        grupo_id: id,
        solicitud_id: Number(sid),
        aceptada: false,
        usuario_nickname: sol.usuario_nickname,
      });
    }

    res.json({ ok: true, aceptada: !!aceptar });
  } catch (e) {
    console.error("Error respondiendo solicitud:", e);
    res.status(500).json({ error: "Error respondiendo solicitud" });
  }
});

// ==========================================
// GRUPOS - OBTENER MENSAJES DE UN GRUPO
// ==========================================
router.get("/grupos/:id/mensajes", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.user;

    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    // Verificar que el usuario es miembro del grupo
    const esMiembro = dbChat
      .prepare(
        "SELECT 1 FROM chat_grupos_miembros WHERE grupo_id = ? AND usuario_nickname = ?"
      )
      .get(id, usuarioNickname);

    if (!esMiembro) {
      return res.status(403).json({ error: "No eres miembro de este grupo" });
    }

    const mensajes = dbChat
      .prepare(
        "SELECT * FROM chat_grupal WHERE grupo_id = ? ORDER BY fecha ASC"
      )
      .all(id);

    res.json(mensajes);
  } catch (e) {
    console.error("Error obteniendo mensajes del grupo:", e);
    res.status(500).json({ error: "Error obteniendo mensajes del grupo" });
  }
});

// ==========================================
// GRUPOS - ENVIAR MENSAJE A GRUPO
// ==========================================
router.post("/grupos/:id/mensajes", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    const {
      mensaje,
      tipo_mensaje,
      archivo_id,
      archivo_url,
      archivo_nombre,
      archivo_tipo,
      archivo_tamaño,
      menciona,
      enlace_compartido,
      reply_to_id,
      reply_to_user,
      reply_to_text,
      reenviado_de_usuario,
      reenviado_de_chat,
      reenviado_de_tipo,
    } = req.body;
    const usuario = req.user;

    if (!mensaje || !mensaje.trim()) {
      return res.status(400).json({ error: "Mensaje vacío" });
    }

    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    const usuarioData = dbUsers
      .prepare("SELECT photo FROM users WHERE id = ?")
      .get(usuario.id);

    // Verificar que el usuario es miembro del grupo
    const esMiembro = dbChat
      .prepare(
        "SELECT 1 FROM chat_grupos_miembros WHERE grupo_id = ? AND usuario_nickname = ?"
      )
      .get(id, usuarioNickname);

    if (!esMiembro) {
      return res.status(403).json({ error: "No eres miembro de este grupo" });
    }

    // Verificar si el usuario tiene restricción activa para enviar mensajes
    const restriccion = dbChat
      .prepare(`
        SELECT * FROM chat_grupos_restricciones 
        WHERE grupo_id = ? AND usuario_nickname = ? AND activa = 1
        ORDER BY fecha_inicio DESC LIMIT 1
      `)
      .get(id, usuarioNickname);

    if (restriccion) {
      // Si tiene fecha_fin, verificar si ya expiró
      if (restriccion.fecha_fin) {
        const fechaFin = new Date(restriccion.fecha_fin);
        const ahora = new Date();
        if (ahora > fechaFin) {
          // La restricción expiró, desactivarla
          dbChat
            .prepare("UPDATE chat_grupos_restricciones SET activa = 0 WHERE id = ?")
            .run(restriccion.id);
        } else {
          // Restricción activa
          const minutosRestantes = Math.ceil((fechaFin - ahora) / (1000 * 60));
          return res.status(403).json({ 
            error: "No puedes enviar mensajes en este grupo",
            restriccion: true,
            minutos_restantes: minutosRestantes,
            fecha_fin: restriccion.fecha_fin
          });
        }
      } else {
        // Restricción indefinida
        return res.status(403).json({ 
          error: "No puedes enviar mensajes en este grupo (restricción indefinida)",
          restriccion: true,
          indefinida: true
        });
      }
    }

    // Obtener información del archivo si existe
    let archivoInfo = null;
    if (archivo_id) {
      archivoInfo = dbChat
        .prepare("SELECT * FROM chat_archivos WHERE id = ?")
        .get(archivo_id);
    }

    const resultado = dbChat
      .prepare(
        `INSERT INTO chat_grupal 
        (grupo_id, usuario_nickname, usuario_photo, mensaje, tipo_mensaje, archivo_url, archivo_nombre, archivo_tipo, archivo_tamaño, menciona, enlace_compartido, reply_to_id, reply_to_user, reply_to_text, reenviado_de_usuario, reenviado_de_chat, reenviado_de_tipo) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        usuarioNickname,
        usuarioData?.photo || null,
        mensaje.trim(),
        tipo_mensaje || "texto",
        archivoInfo ? `/chat/archivo/${archivo_id}` : (archivo_url || null),
        archivoInfo ? archivoInfo.nombre_original : (archivo_nombre || null),
        archivoInfo ? archivoInfo.tipo_mime : (archivo_tipo || null),
        archivoInfo ? archivoInfo.tamaño : (archivo_tamaño || null),
        menciona || null,
        enlace_compartido || null,
        reply_to_id || null,
        reply_to_user || null,
        reply_to_text || null,
        reenviado_de_usuario || null,
        reenviado_de_chat || null,
        reenviado_de_tipo || null
      );

    const nuevoMensaje = dbChat
      .prepare("SELECT * FROM chat_grupal WHERE id = ?")
      .get(resultado.lastInsertRowid);

    // Actualizar mensaje_id en el archivo
    if (archivoInfo) {
      dbChat
        .prepare("UPDATE chat_archivos SET mensaje_id = ?, tipo_chat = 'grupal', grupo_id = ? WHERE id = ?")
        .run(nuevoMensaje.id, id, archivo_id);
    }

    // Emitir a todos los miembros del grupo
    getIO().emit("chat_grupal_nuevo", nuevoMensaje);

    // Notificar a miembros del grupo (excepto remitente)
    try {
      const serverUrl = process.env.SERVER_PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
      const grupoInfo = dbChat
        .prepare("SELECT nombre FROM chat_grupos WHERE id = ?")
        .get(id);
      const nombreGrupo = grupoInfo?.nombre || "Grupo";

      const miembros = dbChat
        .prepare("SELECT usuario_nickname FROM chat_grupos_miembros WHERE grupo_id = ?")
        .all(id);

      miembros.forEach((m) => {
        if (!m.usuario_nickname || m.usuario_nickname === usuarioNickname) return;
        const cfg = getNotificacionConfig(m.usuario_nickname);
        if (cfg.notificaciones_activas !== 1 || cfg.grupos_activos !== 1) return;

        const receptor = dbUsers
          .prepare("SELECT id FROM users WHERE nickname = ? OR name = ?")
          .get(m.usuario_nickname, m.usuario_nickname);

        if (!receptor?.id) return;

        guardarNotificacionYEnviarPush(
          receptor.id,
          {
            title: `Grupo ${nombreGrupo}`,
            body: `${usuarioNickname}: ${mensaje.trim()}`,
            tipo: "info",
            serverUrl,
          },
          {
            chatType: "grupal",
            chatTarget: String(id),
            senderNickname: usuarioNickname,
            groupName: nombreGrupo,
          }
        );
      });
    } catch (e) {
      // Silenciar errores de notificación
    }

    // Si hay mención, notificar al usuario mencionado
    if (menciona) {
      getIO().emit("chat_mention", {
        usuario_mencionado: menciona,
        mensaje: nuevoMensaje,
        tipo: "grupal",
        grupo_id: id,
      });
    }

    res.json({ ok: true, mensaje: nuevoMensaje });
  } catch (e) {
    console.error("Error enviando mensaje grupal:", e);
    res.status(500).json({ error: "Error enviando mensaje grupal" });
  }
});

// ==========================================
// GRUPOS - BORRAR GRUPO (SOLO ADMIN)
// ==========================================
router.delete("/grupos/:id", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.user;

    // Verificar que el usuario es admin
    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    // Verificar si es admin (tiene rol admin)
    const esAdmin = dbUsers
      .prepare(`
        SELECT 1 FROM user_roles ur
        INNER JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = ? AND r.name = 'admin'
      `)
      .get(usuario.id);

    if (!esAdmin) {
      return res.status(403).json({ error: "Solo administradores pueden borrar grupos" });
    }

    const grupo = dbChat
      .prepare("SELECT id FROM chat_grupos WHERE id = ?")
      .get(id);

    if (!grupo) {
      return res.status(404).json({ error: "Grupo no encontrado" });
    }

    dbChat.prepare("DELETE FROM chat_grupos WHERE id = ?").run(id);

    getIO().emit("chat_grupo_borrado", { grupo_id: id });

    res.json({ ok: true });
  } catch (e) {
    console.error("Error borrando grupo:", e);
    res.status(500).json({ error: "Error borrando grupo" });
  }
});

// ==========================================
// SUBIR ARCHIVO
// ==========================================
router.post("/archivo", authRequired, upload.single("archivo"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se proporcionó archivo" });
    }

    const usuario = req.user;
    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      // Eliminar archivo si no se puede obtener el usuario
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    const resultado = dbChat
      .prepare(
        `INSERT INTO chat_archivos 
        (nombre_original, nombre_archivo, tipo_mime, tamaño, ruta, subido_por) 
        VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.file.originalname,
        req.file.filename,
        req.file.mimetype,
        req.file.size,
        req.file.path,
        usuarioNickname
      );

    const archivo = dbChat
      .prepare("SELECT * FROM chat_archivos WHERE id = ?")
      .get(resultado.lastInsertRowid);

    res.json({ ok: true, archivo });
  } catch (e) {
    console.error("Error subiendo archivo:", e);
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkErr) {
        console.error("Error eliminando archivo:", unlinkErr);
      }
    }
    res.status(500).json({ error: "Error subiendo archivo" });
  }
});

// ==========================================
// SERVIR FOTO DE GRUPO
// ==========================================
router.get("/grupos/:id/foto", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    const grupo = dbChat.prepare("SELECT foto FROM chat_grupos WHERE id = ?").get(id);
    
    if (!grupo || !grupo.foto) {
      return res.status(404).json({ error: "Foto no encontrada" });
    }

    const fotoPath = path.join(uploadDirGrupos, grupo.foto);
    if (!fs.existsSync(fotoPath)) {
      return res.status(404).json({ error: "Archivo físico no encontrado" });
    }

    res.sendFile(path.resolve(fotoPath));
  } catch (e) {
    console.error("Error sirviendo foto de grupo:", e);
    res.status(500).json({ error: "Error sirviendo foto" });
  }
});

// ==========================================
// DESCARGAR/VISUALIZAR ARCHIVO
// ==========================================
router.get("/archivo/:id", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    const { download } = req.query; // Si viene ?download=true, forzar descarga
    const archivo = dbChat
      .prepare("SELECT * FROM chat_archivos WHERE id = ?")
      .get(id);

    if (!archivo) {
      return res.status(404).json({ error: "Archivo no encontrado" });
    }

    if (!fs.existsSync(archivo.ruta)) {
      return res.status(404).json({ error: "Archivo físico no encontrado" });
    }

    console.log(`📄 Sirviendo archivo: ${archivo.nombre_original}, tipo: ${archivo.tipo_mime}, download: ${download}`);

    // Headers para permitir visualización en iframe
    // IMPORTANTE: Estos headers deben establecerse ANTES de sendFile
    res.setHeader("Content-Type", archivo.tipo_mime || "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    
    // Solo forzar descarga si se solicita explícitamente
    if (download === "true") {
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(archivo.nombre_original)}"`);
      console.log("⬇️ Forzando descarga del archivo");
    } else {
      // Para vista previa, usar inline para permitir visualización
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(archivo.nombre_original)}"`);
      // Headers para permitir iframe embedding - SOBRESCRIBIR cualquier middleware
      res.removeHeader("X-Frame-Options"); // Remover si existe DENY del middleware
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader("Content-Security-Policy", "frame-ancestors 'self'");
      console.log("👁️ Configurando para vista previa en iframe");
    }
    
    // Enviar el archivo
    res.sendFile(path.resolve(archivo.ruta), (err) => {
      if (err) {
        console.error("❌ Error enviando archivo:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error sirviendo archivo", details: err.message });
        }
      } else {
        console.log("✅ Archivo enviado correctamente");
      }
    });
  } catch (e) {
    console.error("❌ Error sirviendo archivo:", e);
    if (!res.headersSent) {
      res.status(500).json({ error: "Error sirviendo archivo", details: e.message });
    }
  }
});

// ==========================================
// EDITAR MENSAJE
// ==========================================
router.put("/mensaje/:tipo/:id", authRequired, (req, res) => {
  try {
    const { tipo, id } = req.params;
    const { mensaje } = req.body;
    const usuario = req.user;

    if (!mensaje || !mensaje.trim()) {
      return res.status(400).json({ error: "Mensaje vacío" });
    }

    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    let tabla, campoUsuario;
    if (tipo === "general") {
      tabla = "chat_general";
      campoUsuario = "usuario_nickname";
    } else if (tipo === "privado") {
      tabla = "chat_privado";
      campoUsuario = "de_nickname";
    } else if (tipo === "grupal") {
      tabla = "chat_grupal";
      campoUsuario = "usuario_nickname";
    } else {
      return res.status(400).json({ error: "Tipo de chat inválido" });
    }

    // Verificar que el mensaje pertenece al usuario
    const mensajeActual = dbChat
      .prepare(`SELECT * FROM ${tabla} WHERE id = ?`)
      .get(id);

    if (!mensajeActual) {
      return res.status(404).json({ error: "Mensaje no encontrado" });
    }

    if (mensajeActual[campoUsuario] !== usuarioNickname) {
      return res.status(403).json({ error: "Solo puedes editar tus propios mensajes" });
    }

    // Actualizar mensaje
    dbChat
      .prepare(
        `UPDATE ${tabla} 
        SET mensaje = ?, mensaje_editado = 1, fecha_edicion = datetime('now', 'localtime') 
        WHERE id = ?`
      )
      .run(mensaje.trim(), id);

    const mensajeEditado = dbChat
      .prepare(`SELECT * FROM ${tabla} WHERE id = ?`)
      .get(id);

    // Emitir actualización
    if (tipo === "general") {
      getIO().emit("chat_general_editado", mensajeEditado);
    } else if (tipo === "privado") {
      getIO().emit("chat_privado_editado", mensajeEditado);
    } else if (tipo === "grupal") {
      getIO().emit("chat_grupal_editado", mensajeEditado);
    }

    res.json({ ok: true, mensaje: mensajeEditado });
  } catch (e) {
    console.error("Error editando mensaje:", e);
    res.status(500).json({ error: "Error editando mensaje" });
  }
});

// ==========================================
// ELIMINAR MENSAJE
// ==========================================
router.delete("/mensaje/:tipo/:id", authRequired, (req, res) => {
  try {
    const { tipo, id } = req.params;
    const usuario = req.user;

    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    let tabla, campoUsuario;
    if (tipo === "general") {
      tabla = "chat_general";
      campoUsuario = "usuario_nickname";
    } else if (tipo === "privado") {
      tabla = "chat_privado";
      campoUsuario = "de_nickname";
    } else if (tipo === "grupal") {
      tabla = "chat_grupal";
      campoUsuario = "usuario_nickname";
    } else {
      return res.status(400).json({ error: "Tipo de chat inválido" });
    }

    const mensajeActual = dbChat
      .prepare(`SELECT * FROM ${tabla} WHERE id = ?`)
      .get(id);

    if (!mensajeActual) {
      return res.status(404).json({ error: "Mensaje no encontrado" });
    }

    // Normalizar nicknames para comparación (trim y case-insensitive)
    const mensajeNickname = String(mensajeActual[campoUsuario] || "").trim();
    const usuarioNicknameNormalizado = String(usuarioNickname || "").trim();
    
    if (mensajeNickname.toLowerCase() !== usuarioNicknameNormalizado.toLowerCase()) {
      console.log(`⚠️ Intento de eliminar mensaje no propio: mensaje.de_nickname="${mensajeNickname}", usuario="${usuarioNicknameNormalizado}"`);
      return res.status(403).json({ error: "Solo puedes eliminar tus propios mensajes" });
    }

    dbChat.prepare(`DELETE FROM ${tabla} WHERE id = ?`).run(id);

    if (tipo === "general") {
      getIO().emit("chat_general_borrado", {
        id: mensajeActual.id,
        usuario_nickname: mensajeActual.usuario_nickname,
      });
    } else if (tipo === "privado") {
      getIO().emit("chat_privado_borrado", {
        id: mensajeActual.id,
        de_nickname: mensajeActual.de_nickname,
        para_nickname: mensajeActual.para_nickname,
      });
    } else if (tipo === "grupal") {
      getIO().emit("chat_grupal_borrado", {
        id: mensajeActual.id,
        grupo_id: mensajeActual.grupo_id,
        usuario_nickname: mensajeActual.usuario_nickname,
      });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("Error eliminando mensaje:", e);
    res.status(500).json({ error: "Error eliminando mensaje" });
  }
});

// ==========================================
// CONFIGURACIÓN RTC (STUN/TURN)
// ==========================================
router.get("/rtc-config", authRequired, (req, res) => {
  const iceServers = [];
  const stunUrl = process.env.STUN_URL || "stun:stun.l.google.com:19302";
  if (stunUrl) {
    iceServers.push({ urls: stunUrl });
  }

  const turnUrl = process.env.TURN_URL;
  const turnUser = process.env.TURN_USER;
  const turnPass = process.env.TURN_PASS;
  if (turnUrl && turnUser && turnPass) {
    iceServers.push({
      urls: turnUrl,
      username: turnUser,
      credential: turnPass,
    });
  }

  res.json({ iceServers });
});

// ==========================================
// CONFIGURACIÓN DE NOTIFICACIONES
// ==========================================
router.get("/notificaciones/config", authRequired, (req, res) => {
  try {
    const usuario = req.user;
    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    let config = dbChat
      .prepare("SELECT * FROM chat_notificaciones_config WHERE usuario_nickname = ?")
      .get(usuarioNickname);

    if (!config) {
      // Crear configuración por defecto
      dbChat
        .prepare(
          `INSERT INTO chat_notificaciones_config 
          (usuario_nickname) VALUES (?)`
        )
        .run(usuarioNickname);
      config = dbChat
        .prepare("SELECT * FROM chat_notificaciones_config WHERE usuario_nickname = ?")
        .get(usuarioNickname);
    }

    const defaults = {
      notificaciones_activas: 1,
      sonido_activo: 1,
      horario_inicio: "08:00",
      horario_fin: "22:00",
      dias_semana: "1,2,3,4,5,6,7",
      mencionar_siempre: 1,
      grupos_activos: 1,
      privados_activos: 1,
      general_activo: 1,
      dispositivo_pc: 1,
      dispositivo_tablet: 1,
      dispositivo_movil: 1,
      notificar_reunion_individual: 1,
      notificar_reunion_grupal: 1,
      sonido_mensaje: "ixora-pulse",
      sonido_video: "ixora-wave",
      sonido_juntas: "ixora-alert",
      sonido_video_individual: "ixora-call",
      sonido_video_grupal: "ixora-call-group",
      horario_lun_inicio: "08:00",
      horario_lun_fin: "22:00",
      horario_mar_inicio: "08:00",
      horario_mar_fin: "22:00",
      horario_mie_inicio: "08:00",
      horario_mie_fin: "22:00",
      horario_jue_inicio: "08:00",
      horario_jue_fin: "22:00",
      horario_vie_inicio: "08:00",
      horario_vie_fin: "22:00",
      horario_sab_inicio: "08:00",
      horario_sab_fin: "22:00",
      horario_dom_inicio: "08:00",
      horario_dom_fin: "22:00",
    };

    res.json({ ...defaults, ...(config || {}) });
  } catch (e) {
    console.error("Error obteniendo configuración de notificaciones:", e);
    res.status(500).json({ error: "Error obteniendo configuración" });
  }
});

router.put("/notificaciones/config", authRequired, (req, res) => {
  try {
    const usuario = req.user;
    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    const {
      notificaciones_activas,
      sonido_activo,
      horario_inicio,
      horario_fin,
      dias_semana,
      mencionar_siempre,
      grupos_activos,
      privados_activos,
      general_activo,
      dispositivo_pc,
      dispositivo_tablet,
      dispositivo_movil,
      notificar_reunion_individual,
      notificar_reunion_grupal,
      sonido_mensaje,
      sonido_video,
      sonido_juntas,
      sonido_video_individual,
      sonido_video_grupal,
      horario_lun_inicio,
      horario_lun_fin,
      horario_mar_inicio,
      horario_mar_fin,
      horario_mie_inicio,
      horario_mie_fin,
      horario_jue_inicio,
      horario_jue_fin,
      horario_vie_inicio,
      horario_vie_fin,
      horario_sab_inicio,
      horario_sab_fin,
      horario_dom_inicio,
      horario_dom_fin,
    } = req.body;

    // Verificar si existe configuración
    const existe = dbChat
      .prepare("SELECT 1 FROM chat_notificaciones_config WHERE usuario_nickname = ?")
      .get(usuarioNickname);

    if (existe) {
      dbChat
        .prepare(
          `UPDATE chat_notificaciones_config SET
          notificaciones_activas = ?,
          sonido_activo = ?,
          horario_inicio = ?,
          horario_fin = ?,
          dias_semana = ?,
          mencionar_siempre = ?,
          grupos_activos = ?,
          privados_activos = ?,
          general_activo = ?,
          dispositivo_pc = ?,
          dispositivo_tablet = ?,
          dispositivo_movil = ?,
          notificar_reunion_individual = ?,
          notificar_reunion_grupal = ?,
          sonido_mensaje = ?,
          sonido_video = ?,
          sonido_juntas = ?,
          sonido_video_individual = ?,
          sonido_video_grupal = ?,
          horario_lun_inicio = ?,
          horario_lun_fin = ?,
          horario_mar_inicio = ?,
          horario_mar_fin = ?,
          horario_mie_inicio = ?,
          horario_mie_fin = ?,
          horario_jue_inicio = ?,
          horario_jue_fin = ?,
          horario_vie_inicio = ?,
          horario_vie_fin = ?,
          horario_sab_inicio = ?,
          horario_sab_fin = ?,
          horario_dom_inicio = ?,
          horario_dom_fin = ?
          WHERE usuario_nickname = ?`
        )
        .run(
          notificaciones_activas !== undefined ? notificaciones_activas : 1,
          sonido_activo !== undefined ? sonido_activo : 1,
          horario_inicio || "08:00",
          horario_fin || "22:00",
          dias_semana || "1,2,3,4,5,6,7",
          mencionar_siempre !== undefined ? mencionar_siempre : 1,
          grupos_activos !== undefined ? grupos_activos : 1,
          privados_activos !== undefined ? privados_activos : 1,
          general_activo !== undefined ? general_activo : 1,
          dispositivo_pc !== undefined ? dispositivo_pc : 1,
          dispositivo_tablet !== undefined ? dispositivo_tablet : 1,
          dispositivo_movil !== undefined ? dispositivo_movil : 1,
          notificar_reunion_individual !== undefined ? notificar_reunion_individual : 1,
          notificar_reunion_grupal !== undefined ? notificar_reunion_grupal : 1,
          sonido_mensaje || "ixora-pulse",
          sonido_video || "ixora-wave",
          sonido_juntas || "ixora-alert",
          sonido_video_individual || "ixora-call",
          sonido_video_grupal || "ixora-call-group",
          horario_lun_inicio || horario_inicio || "08:00",
          horario_lun_fin || horario_fin || "22:00",
          horario_mar_inicio || horario_inicio || "08:00",
          horario_mar_fin || horario_fin || "22:00",
          horario_mie_inicio || horario_inicio || "08:00",
          horario_mie_fin || horario_fin || "22:00",
          horario_jue_inicio || horario_inicio || "08:00",
          horario_jue_fin || horario_fin || "22:00",
          horario_vie_inicio || horario_inicio || "08:00",
          horario_vie_fin || horario_fin || "22:00",
          horario_sab_inicio || horario_inicio || "08:00",
          horario_sab_fin || horario_fin || "22:00",
          horario_dom_inicio || horario_inicio || "08:00",
          horario_dom_fin || horario_fin || "22:00",
          usuarioNickname
        );
    } else {
      dbChat
        .prepare(
          `INSERT INTO chat_notificaciones_config 
          (usuario_nickname, notificaciones_activas, sonido_activo, horario_inicio, horario_fin, dias_semana, mencionar_siempre, grupos_activos, privados_activos, general_activo, dispositivo_pc, dispositivo_tablet, dispositivo_movil, notificar_reunion_individual, notificar_reunion_grupal, sonido_mensaje, sonido_video, sonido_juntas, sonido_video_individual, sonido_video_grupal, horario_lun_inicio, horario_lun_fin, horario_mar_inicio, horario_mar_fin, horario_mie_inicio, horario_mie_fin, horario_jue_inicio, horario_jue_fin, horario_vie_inicio, horario_vie_fin, horario_sab_inicio, horario_sab_fin, horario_dom_inicio, horario_dom_fin)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          usuarioNickname,
          notificaciones_activas !== undefined ? notificaciones_activas : 1,
          sonido_activo !== undefined ? sonido_activo : 1,
          horario_inicio || "08:00",
          horario_fin || "22:00",
          dias_semana || "1,2,3,4,5,6,7",
          mencionar_siempre !== undefined ? mencionar_siempre : 1,
          grupos_activos !== undefined ? grupos_activos : 1,
          privados_activos !== undefined ? privados_activos : 1,
          general_activo !== undefined ? general_activo : 1,
          dispositivo_pc !== undefined ? dispositivo_pc : 1,
          dispositivo_tablet !== undefined ? dispositivo_tablet : 1,
          dispositivo_movil !== undefined ? dispositivo_movil : 1,
          notificar_reunion_individual !== undefined ? notificar_reunion_individual : 1,
          notificar_reunion_grupal !== undefined ? notificar_reunion_grupal : 1,
          sonido_mensaje || "ixora-pulse",
          sonido_video || "ixora-wave",
          sonido_juntas || "ixora-alert",
          sonido_video_individual || "ixora-call",
          sonido_video_grupal || "ixora-call-group",
          horario_lun_inicio || horario_inicio || "08:00",
          horario_lun_fin || horario_fin || "22:00",
          horario_mar_inicio || horario_inicio || "08:00",
          horario_mar_fin || horario_fin || "22:00",
          horario_mie_inicio || horario_inicio || "08:00",
          horario_mie_fin || horario_fin || "22:00",
          horario_jue_inicio || horario_inicio || "08:00",
          horario_jue_fin || horario_fin || "22:00",
          horario_vie_inicio || horario_inicio || "08:00",
          horario_vie_fin || horario_fin || "22:00",
          horario_sab_inicio || horario_inicio || "08:00",
          horario_sab_fin || horario_fin || "22:00",
          horario_dom_inicio || horario_inicio || "08:00",
          horario_dom_fin || horario_fin || "22:00"
        );
    }

    const config = dbChat
      .prepare("SELECT * FROM chat_notificaciones_config WHERE usuario_nickname = ?")
      .get(usuarioNickname);

    res.json({ ok: true, config });
  } catch (e) {
    console.error("Error actualizando configuración de notificaciones:", e);
    res.status(500).json({ error: "Error actualizando configuración" });
  }
});

// ==========================================
// GRUPOS - ACTUALIZAR (PÚBLICO/PRIVADO)
// ==========================================
router.put("/grupos/:id", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, es_publico } = req.body;
    const usuario = req.user;

    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    const grupo = dbChat
      .prepare("SELECT * FROM chat_grupos WHERE id = ?")
      .get(id);

    if (!grupo) {
      return res.status(404).json({ error: "Grupo no encontrado" });
    }

    // Solo el creador o administradores pueden actualizar
    const esAdmin = esAdminOGrupo(id, usuarioNickname);
    if (grupo.creado_por !== usuarioNickname && !esAdmin) {
      return res.status(403).json({ error: "Solo el creador o administradores pueden actualizar el grupo" });
    }

    const updates = [];
    const values = [];

    if (nombre !== undefined) {
      updates.push("nombre = ?");
      values.push(nombre);
    }
    if (descripcion !== undefined) {
      updates.push("descripcion = ?");
      values.push(descripcion);
    }
    if (es_publico !== undefined) {
      updates.push("es_publico = ?");
      values.push(es_publico ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No hay campos para actualizar" });
    }

    values.push(id);
    dbChat
      .prepare(`UPDATE chat_grupos SET ${updates.join(", ")} WHERE id = ?`)
      .run(...values);

    const grupoActualizado = dbChat
      .prepare("SELECT * FROM chat_grupos WHERE id = ?")
      .get(id);

    getIO().emit("chat_grupo_actualizado", grupoActualizado);

    res.json({ ok: true, grupo: grupoActualizado });
  } catch (e) {
    console.error("Error actualizando grupo:", e);
    res.status(500).json({ error: "Error actualizando grupo" });
  }
});

// Helper: Verificar si usuario es admin o creador del grupo
const esAdminOGrupo = (grupoId, usuarioNickname) => {
  const grupo = dbChat.prepare("SELECT creado_por FROM chat_grupos WHERE id = ?").get(grupoId);
  if (!grupo) return false;
  if (grupo.creado_por === usuarioNickname) return true;
  const esAdmin = dbChat
    .prepare("SELECT 1 FROM chat_grupos_administradores WHERE grupo_id = ? AND usuario_nickname = ?")
    .get(grupoId, usuarioNickname);
  return !!esAdmin;
};

// ==========================================
// GRUPOS - OBTENER PERFIL DEL GRUPO
// ==========================================
router.get("/grupos/:id/perfil", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.user;

    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    // Verificar que el usuario es miembro del grupo
    const esMiembro = dbChat
      .prepare("SELECT 1 FROM chat_grupos_miembros WHERE grupo_id = ? AND usuario_nickname = ?")
      .get(id, usuarioNickname);

    if (!esMiembro) {
      return res.status(403).json({ error: "No eres miembro de este grupo" });
    }

    const grupo = dbChat.prepare("SELECT * FROM chat_grupos WHERE id = ?").get(id);
    if (!grupo) {
      return res.status(404).json({ error: "Grupo no encontrado" });
    }

    // Obtener miembros
    const miembros = dbChat
      .prepare("SELECT usuario_nickname, fecha_union FROM chat_grupos_miembros WHERE grupo_id = ? ORDER BY fecha_union ASC")
      .all(id);

    // Obtener administradores
    const administradores = dbChat
      .prepare("SELECT usuario_nickname FROM chat_grupos_administradores WHERE grupo_id = ?")
      .all(id)
      .map(a => a.usuario_nickname);

    // Obtener restricciones activas de cada miembro
    const restricciones = dbChat
      .prepare(`
        SELECT usuario_nickname, restriccion_tipo, fecha_fin, activa, fecha_inicio
        FROM chat_grupos_restricciones 
        WHERE grupo_id = ? AND activa = 1
      `)
      .all(id);

    // Crear mapa de restricciones por usuario
    const restriccionesPorUsuario = {};
    restricciones.forEach(r => {
      // Verificar si la restricción expiró
      if (r.fecha_fin) {
        const fechaFin = new Date(r.fecha_fin);
        const ahora = new Date();
        if (ahora > fechaFin) {
          // Restricción expirada, no incluir
          return;
        }
      }
      restriccionesPorUsuario[r.usuario_nickname] = {
        tipo: r.restriccion_tipo,
        fecha_fin: r.fecha_fin,
        indefinida: !r.fecha_fin,
        fecha_inicio: r.fecha_inicio
      };
    });

    // Verificar si el usuario es admin o creador
    const esAdmin = esAdminOGrupo(id, usuarioNickname);

    res.json({
      ...grupo,
      miembros: miembros.map(m => m.usuario_nickname),
      administradores,
      restricciones: restriccionesPorUsuario,
      es_admin: esAdmin,
      es_creador: grupo.creado_por === usuarioNickname,
    });
  } catch (e) {
    console.error("Error obteniendo perfil de grupo:", e);
    res.status(500).json({ error: "Error obteniendo perfil" });
  }
});

// ==========================================
// GRUPOS - OBTENER COMPARTIDOS (imágenes, videos, archivos, links)
// ==========================================
router.get("/grupos/:id/compartidos", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    const { tipo } = req.query; // 'imagenes', 'videos', 'archivos', 'links'
    const usuario = req.user;

    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    // Verificar que el usuario es miembro del grupo
    const esMiembro = dbChat
      .prepare("SELECT 1 FROM chat_grupos_miembros WHERE grupo_id = ? AND usuario_nickname = ?")
      .get(id, usuarioNickname);

    if (!esMiembro) {
      return res.status(403).json({ error: "No eres miembro de este grupo" });
    }

    let query = `SELECT id, usuario_nickname, mensaje, fecha, archivo_url, archivo_nombre, archivo_tipo, archivo_tamaño, enlace_compartido
      FROM chat_grupal
      WHERE grupo_id = ? AND (`;

    const params = [id];
    const conditions = [];

    if (!tipo || tipo === 'imagenes') {
      conditions.push("(archivo_url IS NOT NULL AND archivo_tipo LIKE 'image/%')");
    }
    if (!tipo || tipo === 'videos') {
      conditions.push("(archivo_url IS NOT NULL AND archivo_tipo LIKE 'video/%')");
    }
    if (!tipo || tipo === 'archivos') {
      conditions.push("(archivo_url IS NOT NULL AND archivo_tipo NOT LIKE 'image/%' AND archivo_tipo NOT LIKE 'video/%')");
    }
    if (!tipo || tipo === 'links') {
      conditions.push("enlace_compartido IS NOT NULL");
    }

    query += conditions.join(" OR ") + ") ORDER BY fecha DESC";

    const compartidos = dbChat.prepare(query).all(...params);
    res.json(compartidos || []);
  } catch (e) {
    console.error("Error obteniendo compartidos del grupo:", e);
    res.status(500).json({ error: "Error obteniendo compartidos" });
  }
});

// ==========================================
// GRUPOS - CAMBIAR FOTO DEL GRUPO
// ==========================================
router.post("/grupos/:id/foto", authRequired, uploadFotoGrupo.single("foto"), (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.user;

    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    // Verificar que el usuario es admin o creador
    if (!esAdminOGrupo(id, usuarioNickname)) {
      return res.status(403).json({ error: "Solo los administradores pueden cambiar la foto del grupo" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No se envió foto" });
    }

    const grupo = dbChat.prepare("SELECT foto FROM chat_grupos WHERE id = ?").get(id);
    if (!grupo) {
      return res.status(404).json({ error: "Grupo no encontrado" });
    }

    // Eliminar foto anterior si existe
    if (grupo.foto) {
      const rutaFotoAnterior = path.join(uploadDirGrupos, grupo.foto);
      if (fs.existsSync(rutaFotoAnterior)) {
        try {
          fs.unlinkSync(rutaFotoAnterior);
        } catch (e) {
          console.warn("Error eliminando foto anterior:", e);
        }
      }
    }

    const filename = req.file.filename;

    // Actualizar en BD
    dbChat.prepare("UPDATE chat_grupos SET foto = ? WHERE id = ?").run(filename, id);

    getIO().emit("chat_grupo_actualizado", { id, foto: filename });

    res.json({ ok: true, foto: filename });
  } catch (e) {
    console.error("Error cambiando foto del grupo:", e);
    res.status(500).json({ error: "Error cambiando foto" });
  }
});

// ==========================================
// GRUPOS - TRANSFERIR PROPIEDAD DEL GRUPO
// ==========================================
router.post("/grupos/:id/transferir", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    const { nuevo_creador } = req.body;
    const usuario = req.user;

    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    const grupo = dbChat.prepare("SELECT * FROM chat_grupos WHERE id = ?").get(id);
    if (!grupo) {
      return res.status(404).json({ error: "Grupo no encontrado" });
    }

    // Solo el creador actual puede transferir
    if (grupo.creado_por !== usuarioNickname) {
      return res.status(403).json({ error: "Solo el creador puede transferir la propiedad del grupo" });
    }

    // Verificar que el nuevo creador es miembro del grupo
    const esMiembro = dbChat
      .prepare("SELECT 1 FROM chat_grupos_miembros WHERE grupo_id = ? AND usuario_nickname = ?")
      .get(id, nuevo_creador);

    if (!esMiembro) {
      return res.status(400).json({ error: "El nuevo creador debe ser miembro del grupo" });
    }

    // Transferir propiedad
    dbChat.prepare("UPDATE chat_grupos SET creado_por = ? WHERE id = ?").run(nuevo_creador, id);

    // Remover al nuevo creador de administradores si estaba
    dbChat
      .prepare("DELETE FROM chat_grupos_administradores WHERE grupo_id = ? AND usuario_nickname = ?")
      .run(id, nuevo_creador);

    getIO().emit("chat_grupo_actualizado", { id, creado_por: nuevo_creador });

    res.json({ ok: true });
  } catch (e) {
    console.error("Error transfiriendo propiedad:", e);
    res.status(500).json({ error: "Error transfiriendo propiedad" });
  }
});

// ==========================================
// GRUPOS - HACER/REMOVER ADMINISTRADOR
// ==========================================
router.post("/grupos/:id/miembros/:nickname/admin", authRequired, (req, res) => {
  try {
    const { id, nickname } = req.params;
    const { es_admin } = req.body;
    const usuario = req.user;

    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    // Verificar que el usuario es admin o creador
    if (!esAdminOGrupo(id, usuarioNickname)) {
      return res.status(403).json({ error: "Solo los administradores pueden gestionar administradores" });
    }

    const grupo = dbChat.prepare("SELECT creado_por FROM chat_grupos WHERE id = ?").get(id);
    if (!grupo) {
      return res.status(404).json({ error: "Grupo no encontrado" });
    }

    // No se puede remover admin al creador
    if (grupo.creado_por === nickname && !es_admin) {
      return res.status(400).json({ error: "No se puede remover los permisos del creador del grupo" });
    }

    if (es_admin) {
      dbChat
        .prepare("INSERT OR IGNORE INTO chat_grupos_administradores (grupo_id, usuario_nickname) VALUES (?, ?)")
        .run(id, nickname);
    } else {
      dbChat
        .prepare("DELETE FROM chat_grupos_administradores WHERE grupo_id = ? AND usuario_nickname = ?")
        .run(id, nickname);
    }

    getIO().emit("chat_grupo_actualizado", { id });

    res.json({ ok: true, es_admin: !!es_admin });
  } catch (e) {
    console.error("Error gestionando administrador:", e);
    res.status(500).json({ error: "Error gestionando administrador" });
  }
});

// ==========================================
// GRUPOS - RESTRINGIR MENSAJES
// ==========================================
router.post("/grupos/:id/miembros/:nickname/restringir", authRequired, (req, res) => {
  try {
    const { id, nickname } = req.params;
    const { duracion_minutos, remover } = req.body; // null = indefinido, número = minutos, remover = true para quitar restricción
    const usuario = req.user;

    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    // Verificar que el usuario es admin o creador
    if (!esAdminOGrupo(id, usuarioNickname)) {
      return res.status(403).json({ error: "Solo los administradores pueden restringir mensajes" });
    }

    // Si se solicita remover, desactivar todas las restricciones
    if (remover === true) {
      dbChat
        .prepare("UPDATE chat_grupos_restricciones SET activa = 0 WHERE grupo_id = ? AND usuario_nickname = ?")
        .run(id, nickname);
      
      getIO().emit("chat_grupo_actualizado", { id });
      return res.json({ ok: true, removida: true });
    }

    // Desactivar restricciones anteriores
    dbChat
      .prepare("UPDATE chat_grupos_restricciones SET activa = 0 WHERE grupo_id = ? AND usuario_nickname = ?")
      .run(id, nickname);

    // Crear nueva restricción
    let fechaFin = null;
    if (duracion_minutos !== null && duracion_minutos !== undefined) {
      const fechaFinDate = new Date();
      fechaFinDate.setMinutes(fechaFinDate.getMinutes() + duracion_minutos);
      fechaFin = fechaFinDate.toISOString();
    }

    dbChat
      .prepare(`
        INSERT INTO chat_grupos_restricciones 
        (grupo_id, usuario_nickname, restriccion_tipo, duracion_minutos, fecha_fin, activa)
        VALUES (?, ?, 'sin_mensajes', ?, ?, 1)
      `)
      .run(id, nickname, duracion_minutos, fechaFin);

    getIO().emit("chat_grupo_actualizado", { id });

    res.json({ ok: true, fecha_fin: fechaFin });
  } catch (e) {
    console.error("Error restringiendo mensajes:", e);
    res.status(500).json({ error: "Error restringiendo mensajes" });
  }
});

// ==========================================
// GRUPOS - ELIMINAR MIEMBRO DEL GRUPO
// ==========================================
router.delete("/grupos/:id/miembros/:nickname", authRequired, (req, res) => {
  try {
    const { id, nickname } = req.params;
    const usuario = req.user;

    const usuarioNickname = obtenerNombreUsuario(usuario.id);
    if (!usuarioNickname) {
      return res.status(400).json({ error: "Usuario sin nickname ni nombre configurado" });
    }

    const grupo = dbChat.prepare("SELECT creado_por FROM chat_grupos WHERE id = ?").get(id);
    if (!grupo) {
      return res.status(404).json({ error: "Grupo no encontrado" });
    }

    // Solo admin/creador puede eliminar miembros, o el mismo usuario puede salirse
    const puedeEliminar = esAdminOGrupo(id, usuarioNickname) || usuarioNickname === nickname;
    if (!puedeEliminar) {
      return res.status(403).json({ error: "No tienes permiso para eliminar este miembro" });
    }

    // No se puede eliminar al creador
    if (grupo.creado_por === nickname && usuarioNickname !== nickname) {
      return res.status(400).json({ error: "No se puede eliminar al creador del grupo" });
    }

    // Eliminar miembro
    dbChat
      .prepare("DELETE FROM chat_grupos_miembros WHERE grupo_id = ? AND usuario_nickname = ?")
      .run(id, nickname);

    // Eliminar de administradores si estaba
    dbChat
      .prepare("DELETE FROM chat_grupos_administradores WHERE grupo_id = ? AND usuario_nickname = ?")
      .run(id, nickname);

    // Eliminar restricciones
    dbChat
      .prepare("DELETE FROM chat_grupos_restricciones WHERE grupo_id = ? AND usuario_nickname = ?")
      .run(id, nickname);

    getIO().emit("chat_grupo_actualizado", { id });

    res.json({ ok: true });
  } catch (e) {
    console.error("Error eliminando miembro:", e);
    res.status(500).json({ error: "Error eliminando miembro" });
  }
});

export default router;

