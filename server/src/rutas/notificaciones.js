// src/rutas/notificaciones.js
import express from "express";
import crypto from "crypto";
import { authRequired } from "../middleware/autenticacion.js";
import { dbChat, dbUsers } from "../config/baseDeDatos.js";
import { getIO } from "../config/socket.js";
import { sendPushToTokens } from "../utilidades/pushNotifications.js";

const obtenerNombreUsuario = (userId) => {
  const usuarioData = dbUsers
    .prepare("SELECT nickname, name FROM users WHERE id = ?")
    .get(userId);

  if (!usuarioData) return null;
  return usuarioData.nickname || usuarioData.name || null;
};

const mensajeSigueConPrioridad = (d) => {
  if (!d || d.prioridad !== 1 || d.mensaje_id == null || !d.chatType) return false;
  let tabla;
  if (d.chatType === "general") tabla = "chat_general";
  else if (d.chatType === "privado") tabla = "chat_privado";
  else if (d.chatType === "grupal") tabla = "chat_grupal";
  else return false;
  try {
    const row = dbChat.prepare(`SELECT prioridad FROM ${tabla} WHERE id = ?`).get(d.mensaje_id);
    return row?.prioridad === 1;
  } catch {
    return false;
  }
};

const router = express.Router();

// GET: Obtener todas las notificaciones del usuario (no leídas primero)
router.get("/", authRequired, (req, res) => {
  try {
    const userId = req.user.id;
    const { incluir_leidas } = req.query; // Opcional: incluir también las leídas
    
    let query = `
      SELECT * FROM notificaciones 
      WHERE usuario_id = ?
    `;
    
    if (incluir_leidas !== 'true') {
      query += ` AND leida = 0`;
    }
    
    query += ` ORDER BY leida ASC, timestamp DESC LIMIT 100`;
    
    const notificaciones = dbUsers.prepare(query).all(userId);
    
    // Parsear data JSON si existe
    const notificacionesParsed = notificaciones.map(n => ({
      ...n,
      data: n.data ? JSON.parse(n.data) : null,
      read: n.leida === 1,
      timestamp: new Date(n.timestamp),
    }));
    
    res.json(notificacionesParsed);
  } catch (err) {
    console.error("Error obteniendo notificaciones:", err);
    res.status(500).json({ error: "Error obteniendo notificaciones" });
  }
});

// POST: Crear una notificación
router.post("/", authRequired, (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      titulo, 
      mensaje, 
      tipo = 'info', 
      es_confirmacion = false,
      admin_only = false,
      code_error = false,
      data = null
    } = req.body;
    
    if (!titulo || !mensaje) {
      return res.status(400).json({ error: "Título y mensaje son requeridos" });
    }
    
    const dataJson = data ? JSON.stringify(data) : null;
    
    const replyToken = crypto.randomBytes(16).toString("hex");

    const result = dbUsers.prepare(`
      INSERT INTO notificaciones 
      (usuario_id, titulo, mensaje, tipo, es_confirmacion, admin_only, code_error, reply_token, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      titulo,
      mensaje,
      tipo,
      es_confirmacion ? 1 : 0,
      admin_only ? 1 : 0,
      code_error ? 1 : 0,
      replyToken,
      dataJson
    );
    
    const notificationId = result.lastInsertRowid;

    try {
      const io = getIO();
      if (io && typeof io.emit === "function") {
        io.emit("nueva_notificacion", {
          userId: userId,
          usuario_id: userId,
          id: notificationId,
          titulo: titulo,
          mensaje: mensaje,
          tipo: tipo || "info",
          admin_only: admin_only || false,
          data: data || null,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (socketErr) {
      console.warn("Error emitiendo notificación por socket:", socketErr?.message);
    }

    try {
      const tokens = dbUsers
        .prepare("SELECT token FROM push_tokens WHERE usuario_id = ?")
        .all(userId)
        .map((row) => row.token);

      if (tokens.length) {
        const serverUrl =
          process.env.SERVER_PUBLIC_URL ||
          `${req.protocol}://${req.get("host")}`;
        sendPushToTokens(tokens, {
          title: titulo,
          body: mensaje,
          data: {
            notificationId: String(notificationId),
            tipo: tipo || "info",
            es_confirmacion: es_confirmacion ? "1" : "0",
            replyToken: replyToken,
            serverUrl: serverUrl,
          },
        }).catch(() => {});
      }
    } catch (pushErr) {
      console.warn("Error enviando push:", pushErr.message);
    }

    res.json({
      ok: true,
      id: notificationId,
      message: "Notificación creada",
    });
  } catch (err) {
    console.error("Error creando notificación:", err);
    res.status(500).json({ error: "Error creando notificación" });
  }
});

// POST: Registrar token push del dispositivo
router.post("/push/registrar", authRequired, (req, res) => {
  try {
    const userId = req.user.id;
    const { token, plataforma = "android", device_id = null } = req.body || {};

    if (!token) {
      return res.status(400).json({ error: "Token requerido" });
    }

    dbUsers
      .prepare(
        `
        INSERT INTO push_tokens (usuario_id, token, plataforma, device_id, actualizado_en)
        VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
        ON CONFLICT(token) DO UPDATE SET
          usuario_id = excluded.usuario_id,
          plataforma = excluded.plataforma,
          device_id = excluded.device_id,
          actualizado_en = datetime('now', 'localtime')
      `
      )
      .run(userId, token, plataforma, device_id);

    res.json({ ok: true });
  } catch (err) {
    console.error("Error registrando token push:", err);
    res.status(500).json({ error: "Error registrando token push" });
  }
});

// PUT: Marcar notificación como leída
router.put("/:id/leida", authRequired, (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const idNum = Number(id);
    
    const result = dbUsers.prepare(`
      UPDATE notificaciones 
      SET leida = 1 
      WHERE id = ? AND usuario_id = ?
    `).run(idNum, userId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: "Notificación no encontrada" });
    }

    try {
      getIO().emit("notificacion_leida", {
        userId,
        id: idNum,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      /* ignorar errores de socket */
    }
    
    res.json({ ok: true, message: "Notificación marcada como leída" });
  } catch (err) {
    console.error("Error marcando notificación como leída:", err);
    res.status(500).json({ error: "Error marcando notificación" });
  }
});

// DELETE: Eliminar una notificación
// ⚠️ IMPORTANTE: Esta ruta debe ir ANTES de DELETE "/" para evitar conflictos
router.delete("/:id", authRequired, (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    
    if (!userId) {
      return res.status(401).json({ error: "Usuario no autenticado" });
    }
    
    // Verificar si la notificación existe antes de intentar eliminarla
    const notificacion = dbUsers.prepare(`
      SELECT * FROM notificaciones 
      WHERE id = ? AND usuario_id = ?
    `).get(id, userId);
    
    if (!notificacion) {
      console.log(`⚠️ Notificación ${id} no encontrada para usuario ${userId}`);
      return res.status(404).json({ error: "Notificación no encontrada" });
    }

    let dataParsed = null;
    try {
      dataParsed = notificacion.data ? JSON.parse(notificacion.data) : null;
    } catch (_) {}
    if (dataParsed?.prioridad === 1 && dataParsed?.mensaje_id != null && dataParsed?.chatType) {
      if (mensajeSigueConPrioridad(dataParsed)) {
        return res.status(403).json({
          error: "No se puede eliminar hasta que se quite la prioridad al mensaje",
        });
      }
    }

    const result = dbUsers.prepare(`
      DELETE FROM notificaciones 
      WHERE id = ? AND usuario_id = ?
    `).run(id, userId);
    
    if (result.changes === 0) {
      console.log(`⚠️ No se pudo eliminar notificación ${id} para usuario ${userId}`);
      return res.status(404).json({ error: "Notificación no encontrada o ya eliminada" });
    }
    
    console.log(`✅ Notificación ${id} eliminada para usuario ${userId}`);
    res.json({ ok: true, message: "Notificación eliminada" });
  } catch (err) {
    console.error("❌ Error eliminando notificación:", err);
    res.status(500).json({ error: "Error eliminando notificación", details: err.message });
  }
});

// DELETE: Eliminar todas las notificaciones (excepto confirmaciones activas y prioritarias con mensaje aún prioritario)
router.delete("/", authRequired, (req, res) => {
  try {
    const userId = req.user.id;
    const todas = dbUsers.prepare(`
      SELECT id, data, es_confirmacion, leida FROM notificaciones WHERE usuario_id = ?
    `).all(userId);
    const aEliminar = [];
    for (const n of todas) {
      if (n.es_confirmacion === 1 && n.leida === 0) continue;
      let d = null;
      try {
        d = n.data ? JSON.parse(n.data) : null;
      } catch (_) {}
      if (d?.prioridad === 1 && d?.mensaje_id != null && d?.chatType && mensajeSigueConPrioridad(d)) continue;
      aEliminar.push(n.id);
    }
    let cambios = 0;
    const del = dbUsers.prepare("DELETE FROM notificaciones WHERE id = ? AND usuario_id = ?");
    for (const id of aEliminar) {
      const r = del.run(id, userId);
      if (r.changes) cambios += r.changes;
    }
    res.json({ ok: true, message: `${cambios} notificaciones eliminadas`, eliminadas: cambios });
  } catch (err) {
    console.error("Error eliminando notificaciones:", err);
    res.status(500).json({ error: "Error eliminando notificaciones" });
  }
});

// PUT: Confirmar o rechazar una notificación de confirmación
router.put("/:id/confirmar", authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { accion } = req.body; // 'aceptar' o 'rechazar'
    
    if (!accion || !['aceptar', 'rechazar'].includes(accion)) {
      return res.status(400).json({ error: "Acción debe ser 'aceptar' o 'rechazar'" });
    }
    
    // Primero verificar si la notificación existe (sin filtro de es_confirmacion)
    const notificacionExiste = dbUsers.prepare(`
      SELECT * FROM notificaciones 
      WHERE id = ? AND usuario_id = ?
    `).get(id, userId);
    
    if (!notificacionExiste) {
      return res.status(404).json({ error: "Notificación no encontrada" });
    }
    
    // Verificar si es de tipo confirmación
    // Aceptar tanto si es_confirmacion = 1 como si tiene data.tipo === "importacion"
    const esConfirmacion = notificacionExiste.es_confirmacion === 1 || 
                           notificacionExiste.es_confirmacion === true;
    
    let dataParsed = null;
    try {
      dataParsed = notificacionExiste.data ? JSON.parse(notificacionExiste.data) : null;
    } catch (e) {
      // Si no se puede parsear, dejar como null
    }
    
    const esImportacion = dataParsed && dataParsed.tipo === "importacion";
    
    // Si no es confirmación ni importación, devolver error
    if (!esConfirmacion && !esImportacion) {
      return res.status(400).json({ 
        error: "Esta notificación no es de tipo confirmación",
        es_confirmacion: notificacionExiste.es_confirmacion,
        tiene_data_importacion: esImportacion
      });
    }
    
    // Eliminar la notificación (las confirmaciones se borran al confirmar/rechazar)
    dbUsers.prepare(`
      DELETE FROM notificaciones 
      WHERE id = ? AND usuario_id = ?
    `).run(id, userId);
    
    res.json({ 
      ok: true, 
      message: `Notificación ${accion === 'aceptar' ? 'aceptada' : 'rechazada'}`,
      accion,
      data: dataParsed
    });
  } catch (err) {
    console.error("Error confirmando notificación:", err);
    res.status(500).json({ error: "Error confirmando notificación" });
  }
});

// POST: Responder una notificación desde la barra del dispositivo
router.post("/:id/respuesta", authRequired, (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { respuesta } = req.body || {};

    if (!respuesta || !String(respuesta).trim()) {
      return res.status(400).json({ error: "Respuesta requerida" });
    }

    const existe = dbUsers
      .prepare("SELECT id FROM notificaciones WHERE id = ? AND usuario_id = ?")
      .get(id, userId);

    if (!existe) {
      return res.status(404).json({ error: "Notificación no encontrada" });
    }

    dbUsers
      .prepare(
        `
        INSERT INTO notificaciones_respuestas (notificacion_id, usuario_id, respuesta)
        VALUES (?, ?, ?)
      `
      )
      .run(id, userId, String(respuesta).trim());

    dbUsers
      .prepare("UPDATE notificaciones SET leida = 1 WHERE id = ? AND usuario_id = ?")
      .run(id, userId);

    res.json({ ok: true, message: "Respuesta guardada" });
  } catch (err) {
    console.error("Error guardando respuesta:", err);
    res.status(500).json({ error: "Error guardando respuesta" });
  }
});

// POST: Responder notificación desde push (sin auth, usando reply_token)
router.post("/responder-push", (req, res) => {
  try {
    const { reply_token, respuesta, notification_id } = req.body || {};
    const token = String(reply_token || "").trim();
    const reply = String(respuesta || "").trim();

    if (!token || !reply) {
      return res.status(400).json({ error: "reply_token y respuesta son requeridos" });
    }

    const notificacion = dbUsers
      .prepare("SELECT id, usuario_id, data FROM notificaciones WHERE reply_token = ?")
      .get(token);

    if (!notificacion) {
      return res.status(404).json({ error: "Notificación no encontrada" });
    }

    let dataParsed = null;
    try {
      dataParsed = notificacion.data ? JSON.parse(notificacion.data) : null;
    } catch (e) {
      dataParsed = null;
    }

    dbUsers
      .prepare(
        `
        INSERT INTO notificaciones_respuestas (notificacion_id, usuario_id, respuesta)
        VALUES (?, ?, ?)
      `
      )
      .run(notificacion.id, notificacion.usuario_id, reply);

    dbUsers
      .prepare("UPDATE notificaciones SET leida = 1 WHERE id = ?")
      .run(notificacion.id);

    const chatType = dataParsed?.chatType || "general";
    const chatTarget = dataParsed?.chatTarget || null;
    const usuarioNickname = obtenerNombreUsuario(notificacion.usuario_id);

    if (!usuarioNickname) {
      return res.json({
        ok: true,
        notificationId: notificacion.id,
        userId: notificacion.usuario_id,
        message: "Respuesta guardada (sin usuario)",
      });
    }

    if (chatType === "privado" && chatTarget) {
      const resultado = dbChat
        .prepare(
          `INSERT INTO chat_privado 
          (de_nickname, de_photo, para_nickname, mensaje, tipo_mensaje) 
          VALUES (?, ?, ?, ?, ?)`
        )
        .run(
          usuarioNickname,
          null,
          chatTarget,
          reply,
          "texto"
        );

      const nuevoMensaje = dbChat
        .prepare("SELECT * FROM chat_privado WHERE id = ?")
        .get(resultado.lastInsertRowid);

      getIO().emit("chat_privado_nuevo", nuevoMensaje);
    } else if (chatType === "grupal" && chatTarget) {
      const resultado = dbChat
        .prepare(
          `INSERT INTO chat_grupal 
          (grupo_id, usuario_nickname, usuario_photo, mensaje, tipo_mensaje) 
          VALUES (?, ?, ?, ?, ?)`
        )
        .run(
          chatTarget,
          usuarioNickname,
          null,
          reply,
          "texto"
        );

      const nuevoMensaje = dbChat
        .prepare("SELECT * FROM chat_grupal WHERE id = ?")
        .get(resultado.lastInsertRowid);

      getIO().emit("chat_grupal_nuevo", nuevoMensaje);
    } else {
      const resultado = dbChat
        .prepare(
          `INSERT INTO chat_general 
          (usuario_nickname, usuario_photo, mensaje, tipo_mensaje) 
          VALUES (?, ?, ?, ?)`
        )
        .run(
          usuarioNickname,
          null,
          reply,
          "texto"
        );

      const nuevoMensaje = dbChat
        .prepare("SELECT * FROM chat_general WHERE id = ?")
        .get(resultado.lastInsertRowid);

      getIO().emit("chat_general_nuevo", nuevoMensaje);
    }

    res.json({
      ok: true,
      notificationId: notificacion.id,
      userId: notificacion.usuario_id,
      message: "Respuesta guardada",
    });
  } catch (err) {
    console.error("Error guardando respuesta push:", err);
    res.status(500).json({ error: "Error guardando respuesta push" });
  }
});

export default router;

