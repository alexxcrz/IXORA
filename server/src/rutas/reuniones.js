// src/rutas/reuniones.js
import express from "express";
import { authRequired } from "../middleware/autenticacion.js";
import { dbChat, dbUsers } from "../config/baseDeDatos.js";
import { getIO } from "../config/socket.js";
import { sendPushToTokens } from "../utilidades/pushNotifications.js";

const router = express.Router();

// GET: Obtener todas las reuniones del usuario (como creador o participante)
router.get("/", authRequired, (req, res) => {
  try {
    const userNickname = req.user.nickname || req.user.name;
    console.log(`🔍 Obteniendo todas las reuniones para ${userNickname}`);
    
    const reuniones = dbChat.prepare(`
      SELECT DISTINCT
        r.*,
        GROUP_CONCAT(rp.usuario_nickname, ',') as participantes_nicknames
      FROM reuniones r
      LEFT JOIN reuniones_participantes rp ON r.id = rp.reunion_id
      WHERE r.creador_nickname = ? OR rp.usuario_nickname = ?
      GROUP BY r.id
      ORDER BY r.fecha ASC, r.hora ASC
    `).all(userNickname, userNickname);
    
    // Formatear resultados
    const reunionesFormateadas = reuniones.map(reunion => {
      const participantes = reunion.participantes_nicknames 
        ? reunion.participantes_nicknames.split(',')
        : [];
      
      return {
        id: reunion.id,
        titulo: reunion.titulo,
        descripcion: reunion.descripcion,
        fecha: reunion.fecha,
        hora: reunion.hora,
        lugar: reunion.lugar,
        es_videollamada: reunion.es_videollamada === 1,
        creador_nickname: reunion.creador_nickname,
        creada: reunion.creada,
        estado: reunion.estado,
        participantes: participantes
      };
    });
    
    res.json(reunionesFormateadas);
  } catch (error) {
    console.error("Error obteniendo reuniones:", error);
    res.status(500).json({ error: "Error al obtener reuniones" });
  }
});

// GET: Obtener reuniones próximas (futuras)
router.get("/proximas", authRequired, (req, res) => {
  try {
    const userNickname = req.user.nickname || req.user.name;
    const ahora = new Date().toISOString().split('T')[0];
    const horaActual = new Date().toTimeString().split(' ')[0].substring(0, 5);
    
    // Obtener todas las reuniones activas del usuario
    const todasReuniones = dbChat.prepare(`
      SELECT DISTINCT
        r.*,
        GROUP_CONCAT(rp.usuario_nickname, ',') as participantes_nicknames
      FROM reuniones r
      LEFT JOIN reuniones_participantes rp ON r.id = rp.reunion_id
      WHERE (r.creador_nickname = ? OR rp.usuario_nickname = ?)
        AND r.estado = 'activa'
      GROUP BY r.id
      ORDER BY r.fecha ASC, r.hora ASC
    `).all(userNickname, userNickname);
    
    // Filtrar reuniones futuras o del día actual con hora futura
    const reuniones = todasReuniones.filter(reunion => {
      const fechaReunion = reunion.fecha;
      const horaReunion = reunion.hora;
      
      // Si la fecha es mayor, definitivamente es futura
      if (fechaReunion > ahora) {
        return true;
      }
      
      // Si es la misma fecha, comparar hora
      if (fechaReunion === ahora) {
        return horaReunion >= horaActual;
      }
      
      // Fecha pasada - excluir
      return false;
    });
    
    const reunionesFormateadas = reuniones.map(reunion => {
      const participantes = reunion.participantes_nicknames 
        ? reunion.participantes_nicknames.split(',').filter(p => p && p.trim())
        : [];
      
      return {
        id: reunion.id,
        titulo: reunion.titulo,
        descripcion: reunion.descripcion,
        fecha: reunion.fecha,
        hora: reunion.hora,
        lugar: reunion.lugar,
        es_videollamada: reunion.es_videollamada === 1,
        link_videollamada: reunion.link_videollamada || null,
        creador_nickname: reunion.creador_nickname,
        creada: reunion.creada,
        estado: reunion.estado,
        participantes: participantes
      };
    });
    
    res.json(reunionesFormateadas);
  } catch (error) {
    console.error("❌ Error obteniendo reuniones próximas:", error);
    res.status(500).json({ error: "Error al obtener reuniones próximas" });
  }
});

// POST: Crear nueva reunión
router.post("/", authRequired, async (req, res) => {
  try {
    const userNickname = req.user.nickname || req.user.name;
    const { titulo, descripcion, fecha, hora, lugar, es_videollamada, link_videollamada, participantes } = req.body;
    
    if (!titulo || !fecha || !hora) {
      return res.status(400).json({ error: "Título, fecha y hora son obligatorios" });
    }
    
    // Verificar conflictos de horario con los participantes
    const conflictos = [];
    if (participantes && participantes.length > 0) {
      const participantesList = Array.isArray(participantes) ? participantes : [participantes];
      
      for (const participanteNickname of participantesList) {
        const reunionesExistentes = dbChat.prepare(`
          SELECT DISTINCT r.*
          FROM reuniones r
          LEFT JOIN reuniones_participantes rp ON r.id = rp.reunion_id
          WHERE (r.creador_nickname = ? OR rp.usuario_nickname = ?)
            AND r.estado = 'activa'
            AND r.fecha = ?
            AND r.hora = ?
        `).all(participanteNickname, participanteNickname, fecha, hora);
        
        if (reunionesExistentes.length > 0) {
          conflictos.push({
            usuario: participanteNickname,
            reunion: reunionesExistentes[0]
          });
        }
      }
    }
    
    // Si hay conflictos, devolver información pero permitir crear (el cliente decidirá)
    if (conflictos.length > 0) {
      return res.status(409).json({ 
        error: "Conflicto de horario detectado",
        conflictos: conflictos.map(c => ({
          usuario: c.usuario,
          reunion_id: c.reunion.id,
          reunion_titulo: c.reunion.titulo,
          reunion_creador: c.reunion.creador_nickname
        }))
      });
    }
    
    // Crear la reunión
    const resultado = dbChat.prepare(`
      INSERT INTO reuniones (titulo, descripcion, fecha, hora, lugar, es_videollamada, link_videollamada, creador_nickname)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(titulo, descripcion || null, fecha, hora, lugar || null, es_videollamada ? 1 : 0, link_videollamada || null, userNickname);
    
    const reunionId = resultado.lastInsertRowid;
    
    // Agregar participantes
    if (participantes && participantes.length > 0) {
      const participantesList = Array.isArray(participantes) ? participantes : [participantes];
      const insertParticipante = dbChat.prepare(`
        INSERT OR IGNORE INTO reuniones_participantes (reunion_id, usuario_nickname)
        VALUES (?, ?)
      `);
      
      for (const participanteNickname of participantesList) {
        if (participanteNickname !== userNickname) {
          insertParticipante.run(reunionId, participanteNickname);
          
          // Intentar enviar notificación (no crítico, si falla se ignora)
          // Hacer esto de forma asíncrona para no bloquear la creación de la reunión
          (async () => {
            try {
              let usuarioData = null;
              let pushTokens = [];
              try {
                // Obtener datos del usuario
                usuarioData = dbUsers.prepare("SELECT id FROM users WHERE nickname = ? OR name = ?").get(participanteNickname, participanteNickname);
                
                // Si el usuario existe, obtener sus push tokens
                if (usuarioData && usuarioData.id) {
                  const tokens = dbUsers.prepare("SELECT token FROM push_tokens WHERE usuario_id = ?").all(usuarioData.id);
                  pushTokens = tokens.map(t => t.token);
                }
              } catch (dbError) {
                // Si falla, simplemente no enviar notificación
                console.warn(`No se pudo obtener datos del usuario ${participanteNickname} para notificación:`, dbError.message);
                return;
              }
              
              if (usuarioData && usuarioData.id) {
                // Crear notificación en la base de datos (notificaciones está en dbUsers)
                try {
                  dbUsers.prepare(`
                    INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, data)
                    VALUES (?, ?, ?, ?, ?)
                  `).run(
                    usuarioData.id,
                    'reunion',
                    'Nueva reunión',
                    `Has sido invitado a la reunión "${titulo}" el ${fecha} a las ${hora}`,
                    JSON.stringify({ reunion_id: reunionId, creador: userNickname })
                  );
                } catch (notifError) {
                  // Si falla la notificación, solo registrar el error pero no bloquear
                  console.warn(`Error creando notificación para ${participanteNickname}:`, notifError.message);
                }
                
                // Enviar notificación push si tiene tokens
                if (pushTokens.length > 0) {
                  try {
                    await sendPushToTokens(pushTokens, {
                      title: 'Nueva reunión',
                      body: `Has sido invitado a la reunión "${titulo}"`,
                      data: { tipo: 'reunion', reunion_id: reunionId }
                    });
                  } catch (e) {
                    console.error("Error enviando push notification:", e);
                  }
                }
                
                // Emitir evento socket
                const io = getIO();
                if (io) {
                  io.emit('nueva_reunion', {
                    reunion_id: reunionId,
                    usuario: participanteNickname
                  });
                }
              }
            } catch (error) {
              // Ignorar errores de notificaciones, no son críticos
              console.warn(`Error procesando notificación para ${participanteNickname}:`, error.message);
            }
          })();
        }
      }
    }
    
    // Obtener la reunión creada con participantes
    let reunionCreada;
    try {
      reunionCreada = dbChat.prepare(`
        SELECT r.*, GROUP_CONCAT(rp.usuario_nickname, ',') as participantes_nicknames
        FROM reuniones r
        LEFT JOIN reuniones_participantes rp ON r.id = rp.reunion_id
        WHERE r.id = ?
        GROUP BY r.id
      `).get(reunionId);
      
      if (!reunionCreada) {
        console.error(`❌ No se pudo recuperar la reunión con ID ${reunionId} después de crearla`);
        return res.status(500).json({ error: "Error al recuperar la reunión creada" });
      }
      
      console.log(`✅ Reunión recuperada: ${JSON.stringify(reunionCreada)}`);
    } catch (dbError) {
      console.error("❌ Error recuperando reunión creada:", dbError);
      return res.status(500).json({ error: "Error al recuperar la reunión creada" });
    }
    
    const participantesList = reunionCreada.participantes_nicknames 
      ? reunionCreada.participantes_nicknames.split(',').filter(p => p && p.trim())
      : [];
    
    const respuesta = {
      id: reunionCreada.id,
      titulo: reunionCreada.titulo,
      descripcion: reunionCreada.descripcion,
      fecha: reunionCreada.fecha,
      hora: reunionCreada.hora,
      lugar: reunionCreada.lugar,
      es_videollamada: reunionCreada.es_videollamada === 1,
      link_videollamada: reunionCreada.link_videollamada || null,
      creador_nickname: reunionCreada.creador_nickname,
      creada: reunionCreada.creada,
      estado: reunionCreada.estado,
      participantes: participantesList
    };
    
    console.log(`✅ Enviando respuesta de reunión creada: ${JSON.stringify(respuesta)}`);
    res.status(201).json(respuesta);
  } catch (error) {
    console.error("Error creando reunión:", error);
    res.status(500).json({ error: "Error al crear reunión" });
  }
});

// PUT: Actualizar reunión
router.put("/:id", authRequired, async (req, res) => {
  try {
    const userNickname = req.user.nickname || req.user.name;
    const reunionId = req.params.id;
    const { titulo, descripcion, fecha, hora, lugar, es_videollamada, link_videollamada, participantes } = req.body;
    
    // Verificar que el usuario es el creador
    const reunion = dbChat.prepare("SELECT * FROM reuniones WHERE id = ?").get(reunionId);
    if (!reunion) {
      return res.status(404).json({ error: "Reunión no encontrada" });
    }
    
    if (reunion.creador_nickname !== userNickname) {
      return res.status(403).json({ error: "Solo el creador puede modificar la reunión" });
    }
    
    // Verificar conflictos si se cambió fecha/hora
    if ((fecha && fecha !== reunion.fecha) || (hora && hora !== reunion.hora)) {
      const fechaFinal = fecha || reunion.fecha;
      const horaFinal = hora || reunion.hora;
      
      const participantesActuales = dbChat.prepare(`
        SELECT usuario_nickname FROM reuniones_participantes WHERE reunion_id = ?
      `).all(reunionId).map(r => r.usuario_nickname);
      
      const participantesList = participantes && participantes.length > 0
        ? (Array.isArray(participantes) ? participantes : [participantes])
        : participantesActuales;
      
      const conflictos = [];
      for (const participanteNickname of participantesList) {
        const reunionesExistentes = dbChat.prepare(`
          SELECT DISTINCT r.*
          FROM reuniones r
          LEFT JOIN reuniones_participantes rp ON r.id = rp.reunion_id
          WHERE (r.creador_nickname = ? OR rp.usuario_nickname = ?)
            AND r.estado = 'activa'
            AND r.id != ?
            AND r.fecha = ?
            AND r.hora = ?
        `).all(participanteNickname, participanteNickname, reunionId, fechaFinal, horaFinal);
        
        if (reunionesExistentes.length > 0) {
          conflictos.push({
            usuario: participanteNickname,
            reunion: reunionesExistentes[0]
          });
        }
      }
      
      if (conflictos.length > 0) {
        return res.status(409).json({ 
          error: "Conflicto de horario detectado",
          conflictos: conflictos.map(c => ({
            usuario: c.usuario,
            reunion_id: c.reunion.id,
            reunion_titulo: c.reunion.titulo,
            reunion_creador: c.reunion.creador_nickname
          }))
        });
      }
    }
    
    // Actualizar reunión
    dbChat.prepare(`
      UPDATE reuniones 
      SET titulo = COALESCE(?, titulo),
          descripcion = COALESCE(?, descripcion),
          fecha = COALESCE(?, fecha),
          hora = COALESCE(?, hora),
          lugar = COALESCE(?, lugar),
          es_videollamada = COALESCE(?, es_videollamada)
      WHERE id = ?
    `).run(titulo, descripcion, fecha, hora, lugar, es_videollamada ? 1 : 0, reunionId);
    
    // Actualizar participantes si se proporcionaron
    if (participantes !== undefined) {
      // Eliminar participantes actuales
      dbChat.prepare("DELETE FROM reuniones_participantes WHERE reunion_id = ?").run(reunionId);
      
      // Agregar nuevos participantes
      if (participantes && participantes.length > 0) {
        const participantesList = Array.isArray(participantes) ? participantes : [participantes];
        const insertParticipante = dbChat.prepare(`
          INSERT OR IGNORE INTO reuniones_participantes (reunion_id, usuario_nickname)
          VALUES (?, ?)
        `);
        
        for (const participanteNickname of participantesList) {
          if (participanteNickname !== userNickname) {
            insertParticipante.run(reunionId, participanteNickname);
          }
        }
      }
    }
    
    // Obtener reunión actualizada
    const reunionActualizada = dbChat.prepare(`
      SELECT r.*, GROUP_CONCAT(rp.usuario_nickname, ',') as participantes_nicknames
      FROM reuniones r
      LEFT JOIN reuniones_participantes rp ON r.id = rp.reunion_id
      WHERE r.id = ?
      GROUP BY r.id
    `).get(reunionId);
    
    const participantesList = reunionActualizada.participantes_nicknames 
      ? reunionActualizada.participantes_nicknames.split(',')
      : [];
    
    res.json({
      id: reunionActualizada.id,
      titulo: reunionActualizada.titulo,
      descripcion: reunionActualizada.descripcion,
      fecha: reunionActualizada.fecha,
      hora: reunionActualizada.hora,
      lugar: reunionActualizada.lugar,
      es_videollamada: reunionActualizada.es_videollamada === 1,
      creador_nickname: reunionActualizada.creador_nickname,
      creada: reunionActualizada.creada,
      estado: reunionActualizada.estado,
      participantes: participantesList
    });
  } catch (error) {
    console.error("Error actualizando reunión:", error);
    res.status(500).json({ error: "Error al actualizar reunión" });
  }
});

// DELETE: Cancelar/Eliminar reunión
router.delete("/:id", authRequired, async (req, res) => {
  try {
    const userNickname = req.user.nickname || req.user.name;
    const reunionId = parseInt(req.params.id);
    const { accion } = req.query; // 'cancelar' o 'salir'
    
    console.log(`🗑️ Usuario ${userNickname} intentando ${accion || 'eliminar'} reunión ${reunionId}`);
    
    // Verificar que la reunión existe
    const reunion = dbChat.prepare("SELECT * FROM reuniones WHERE id = ?").get(reunionId);
    if (!reunion) {
      return res.status(404).json({ error: "Reunión no encontrada" });
    }
    
    const esCreador = reunion.creador_nickname === userNickname;
    
    // Si es el creador, cancelar la reunión (eliminar para todos)
    if (esCreador || accion === 'cancelar') {
      console.log(`✅ Cancelando reunión ${reunionId} (creador: ${userNickname})`);
      
      // Marcar como cancelada
      dbChat.prepare("UPDATE reuniones SET estado = 'cancelada' WHERE id = ?").run(reunionId);
      
      // Obtener todos los participantes para eliminar sus notificaciones
      const participantes = dbChat.prepare(`
        SELECT usuario_nickname FROM reuniones_participantes WHERE reunion_id = ?
      `).all(reunionId).map(p => p.usuario_nickname);
      
      // Eliminar notificaciones de todos los participantes
      for (const participanteNickname of participantes) {
        try {
          const usuarioData = dbUsers.prepare("SELECT id FROM users WHERE nickname = ? OR name = ?").get(participanteNickname, participanteNickname);
          if (usuarioData && usuarioData.id) {
            dbUsers.prepare(`
              DELETE FROM notificaciones 
              WHERE usuario_id = ? 
              AND tipo = 'reunion' 
              AND data LIKE ?
            `).run(usuarioData.id, `%reunion_id":${reunionId}%`);
            console.log(`  ✅ Notificaciones eliminadas para ${participanteNickname}`);
          }
        } catch (e) {
          console.warn(`  ⚠️ Error eliminando notificaciones para ${participanteNickname}:`, e.message);
        }
      }
      
      // Emitir evento socket
      const io = getIO();
      if (io) {
        io.emit('reunion_cancelada', { reunion_id: reunionId });
      }
      
      return res.json({ mensaje: "Reunión cancelada exitosamente. Se eliminaron las notificaciones de todos los participantes." });
    }
    
    // Si es participante, solo salir de la reunión
    const esParticipante = dbChat.prepare(`
      SELECT 1 FROM reuniones_participantes 
      WHERE reunion_id = ? AND usuario_nickname = ?
    `).get(reunionId, userNickname);
    
    if (!esParticipante) {
      return res.status(403).json({ error: "No eres participante de esta reunión" });
    }
    
    console.log(`✅ Usuario ${userNickname} saliendo de reunión ${reunionId}`);
    
    // Eliminar de participantes
    dbChat.prepare(`
      DELETE FROM reuniones_participantes 
      WHERE reunion_id = ? AND usuario_nickname = ?
    `).run(reunionId, userNickname);
    
    // Eliminar notificaciones del usuario
    try {
      const usuarioData = dbUsers.prepare("SELECT id FROM users WHERE nickname = ? OR name = ?").get(userNickname, userNickname);
      if (usuarioData && usuarioData.id) {
        dbUsers.prepare(`
          DELETE FROM notificaciones 
          WHERE usuario_id = ? 
          AND tipo = 'reunion' 
          AND data LIKE ?
        `).run(usuarioData.id, `%reunion_id":${reunionId}%`);
        console.log(`  ✅ Notificaciones eliminadas para ${userNickname}`);
      }
    } catch (e) {
      console.warn(`  ⚠️ Error eliminando notificaciones:`, e.message);
    }
    
    res.json({ mensaje: "Has salido de la reunión exitosamente" });
  } catch (error) {
    console.error("❌ Error procesando eliminación de reunión:", error);
    res.status(500).json({ error: "Error al procesar la solicitud" });
  }
});

// GET: Verificar conflictos de horario antes de crear
router.post("/verificar-conflictos", authRequired, (req, res) => {
  try {
    const { fecha, hora, participantes, reunion_id_excluir } = req.body;
    
    if (!fecha || !hora || !participantes || participantes.length === 0) {
      return res.json({ conflictos: [] });
    }
    
    const participantesList = Array.isArray(participantes) ? participantes : [participantes];
    const conflictos = [];
    
    for (const participanteNickname of participantesList) {
      let query = `
        SELECT DISTINCT r.*
        FROM reuniones r
        LEFT JOIN reuniones_participantes rp ON r.id = rp.reunion_id
        WHERE (r.creador_nickname = ? OR rp.usuario_nickname = ?)
          AND r.estado = 'activa'
          AND r.fecha = ?
          AND r.hora = ?
      `;
      
      const params = [participanteNickname, participanteNickname, fecha, hora];
      
      if (reunion_id_excluir) {
        query += ` AND r.id != ?`;
        params.push(reunion_id_excluir);
      }
      
      const reunionesExistentes = dbChat.prepare(query).all(...params);
      
      if (reunionesExistentes.length > 0) {
        conflictos.push({
          usuario: participanteNickname,
          reunion: reunionesExistentes[0]
        });
      }
    }
    
    res.json({ 
      conflictos: conflictos.map(c => ({
        usuario: c.usuario,
        reunion_id: c.reunion.id,
        reunion_titulo: c.reunion.titulo,
        reunion_creador: c.reunion.creador_nickname,
        reunion_fecha: c.reunion.fecha,
        reunion_hora: c.reunion.hora
      }))
    });
  } catch (error) {
    console.error("Error verificando conflictos:", error);
    res.status(500).json({ error: "Error al verificar conflictos" });
  }
});

// GET: Obtener historial de reuniones (pasadas o terminadas)
router.get("/historial", authRequired, (req, res) => {
  try {
    const userNickname = req.user.nickname || req.user.name;
    const ahora = new Date().toISOString().split('T')[0];
    const horaActual = new Date().toTimeString().split(' ')[0].substring(0, 5);
    
    const todasReuniones = dbChat.prepare(`
      SELECT DISTINCT
        r.*,
        GROUP_CONCAT(rp.usuario_nickname, ',') as participantes_nicknames
      FROM reuniones r
      LEFT JOIN reuniones_participantes rp ON r.id = rp.reunion_id
      WHERE (r.creador_nickname = ? OR rp.usuario_nickname = ?)
        AND (r.estado = 'terminada' OR r.estado = 'cancelada' OR 
             (r.estado = 'activa' AND (r.fecha < ? OR (r.fecha = ? AND r.hora < ?))))
      GROUP BY r.id
      ORDER BY r.fecha DESC, r.hora DESC
    `).all(userNickname, userNickname, ahora, ahora, horaActual);
    
    const reunionesFormateadas = todasReuniones.map(reunion => {
      const participantes = reunion.participantes_nicknames 
        ? reunion.participantes_nicknames.split(',').filter(p => p && p.trim())
        : [];
      
      return {
        id: reunion.id,
        titulo: reunion.titulo,
        descripcion: reunion.descripcion,
        fecha: reunion.fecha,
        hora: reunion.hora,
        lugar: reunion.lugar,
        es_videollamada: reunion.es_videollamada === 1,
        link_videollamada: reunion.link_videollamada || null,
        creador_nickname: reunion.creador_nickname,
        creada: reunion.creada,
        estado: reunion.estado,
        observaciones: reunion.observaciones,
        fecha_terminada: reunion.fecha_terminada,
        participantes: participantes
      };
    });
    
    res.json(reunionesFormateadas);
  } catch (error) {
    console.error("Error obteniendo historial de reuniones:", error);
    res.status(500).json({ error: "Error al obtener historial" });
  }
});

// PUT: Terminar reunión y agregar observaciones
router.put("/:id/terminar", authRequired, (req, res) => {
  try {
    const userNickname = req.user.nickname || req.user.name;
    const reunionId = parseInt(req.params.id);
    const { observaciones } = req.body;
    
    // Verificar que la reunión existe
    const reunion = dbChat.prepare("SELECT * FROM reuniones WHERE id = ?").get(reunionId);
    if (!reunion) {
      return res.status(404).json({ error: "Reunión no encontrada" });
    }
    
    // Verificar que el usuario es el creador o participante
    const esCreador = reunion.creador_nickname === userNickname;
    const esParticipante = dbChat.prepare(`
      SELECT 1 FROM reuniones_participantes 
      WHERE reunion_id = ? AND usuario_nickname = ?
    `).get(reunionId, userNickname);
    
    if (!esCreador && !esParticipante) {
      return res.status(403).json({ error: "No tienes permiso para terminar esta reunión" });
    }
    
    // Actualizar reunión
    dbChat.prepare(`
      UPDATE reuniones 
      SET estado = 'terminada', 
          observaciones = ?,
          fecha_terminada = datetime('now', 'localtime')
      WHERE id = ?
    `).run(observaciones || null, reunionId);
    
    // Emitir evento socket
    const io = getIO();
    if (io) {
      io.emit('reunion_terminada', { reunion_id: reunionId });
    }
    
    res.json({ mensaje: "Reunión terminada exitosamente" });
  } catch (error) {
    console.error("Error terminando reunión:", error);
    res.status(500).json({ error: "Error al terminar reunión" });
  }
});

export default router;
