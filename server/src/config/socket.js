// src/config/socket.js
import { Server } from "socket.io";
import { dbDia } from "./baseDeDatos.js";
import { getFechaActual } from "../utilidades/estado.js";

let io;

// 🟢 SISTEMA NUEVO DE USUARIOS ACTIVOS
// un usuario = un nombre, pero con varios sockets
// ejemplo:
// {
//   "Juan": ["socket1", "socket2"],
//   "Ana": ["socketA"]
// }
const usuariosActivos = {};

export const initSocket = (httpServer) => {
  io = new Server(httpServer, { cors: { origin: "*" } });

  io.engine.on("connection_error", (err) => {
    console.error("❌ Socket.IO error:", err.req?.url, err.code, err.message);
  });

  io.on("connection", (socket) => {

    let usuarioNickname = null;

    // =======================================================
    // 🟦 CHAT PRO — LOGIN CHAT
    // =======================================================
    socket.on("login_chat", ({ nickname, photo }) => {
      usuarioNickname = nickname;
      socket.data.nickname = nickname;

      // Crear lista si no existe
      if (!usuariosActivos[nickname]) {
        usuariosActivos[nickname] = {
          sockets: [],
          photo: photo || null,
        };
      }

      // Agregar socket si no está
      if (!usuariosActivos[nickname].sockets.includes(socket.id)) {
        usuariosActivos[nickname].sockets.push(socket.id);
      }

      // Actualizar foto si se proporciona
      if (photo) {
        usuariosActivos[nickname].photo = photo;
      }

      enviarUsuariosActivos();
    });

    // =======================================================
    // 📞 VIDEOLLAMADAS INTERNAS (WebRTC)
    // =======================================================
    socket.on("call_invite", ({ room, fromNickname, toNicknames }) => {
      if (!room || !Array.isArray(toNicknames)) return;
      toNicknames.forEach((nick) => {
        const sockets = getSocketsByNickname(nick);
        sockets.forEach((socketId) => {
          io.to(socketId).emit("call_invite", {
            room,
            fromNickname: fromNickname || socket.data.nickname || "Usuario",
          });
        });
      });
    });

    socket.on("call_join", ({ room, nickname }) => {
      if (!room) return;
      socket.data.nickname = socket.data.nickname || nickname;
      socket.join(room);

      const roomSet = io.sockets.adapter.rooms.get(room) || new Set();
      const users = Array.from(roomSet).map((id) => {
        const s = io.sockets.sockets.get(id);
        return {
          socketId: id,
          nickname: s?.data?.nickname || "Usuario",
        };
      });

      socket.emit("call_users", { room, users });
      socket.to(room).emit("call_user_joined", {
        room,
        socketId: socket.id,
        nickname: socket.data.nickname || "Usuario",
      });
    });

    socket.on("call_leave", ({ room }) => {
      if (!room) return;
      socket.leave(room);
      socket.to(room).emit("call_user_left", {
        room,
        socketId: socket.id,
      });
    });

    socket.on("call_offer", ({ to, room, sdp, nickname }) => {
      if (!to || !room || !sdp) return;
      io.to(to).emit("call_offer", {
        from: socket.id,
        room,
        sdp,
        nickname: nickname || socket.data.nickname || "Usuario",
      });
    });

    socket.on("call_answer", ({ to, room, sdp }) => {
      if (!to || !room || !sdp) return;
      io.to(to).emit("call_answer", {
        from: socket.id,
        room,
        sdp,
      });
    });

    socket.on("call_ice", ({ to, room, candidate }) => {
      if (!to || !room || !candidate) return;
      io.to(to).emit("call_ice", {
        from: socket.id,
        room,
        candidate,
      });
    });

    // =======================================================
    // 🟦 CHAT PRO — MENSAJES PRIVADOS
    // =======================================================
    socket.on("chat_privado", ({ de, para, mensaje }) => {

      // Si el usuario destino tiene sockets activos, mandar a todos
      if (usuariosActivos[para] && usuariosActivos[para].sockets) {
        usuariosActivos[para].sockets.forEach((socketId) => {
          io.to(socketId).emit("chat_privado_nuevo", { de, mensaje });
        });
      }
    });

    // =======================================================
    // 📦 ENVÍO DE ESTADO INICIAL (PRODUCTOS, FECHA, ETC)
    // =======================================================
    try {
      socket.emit(
        "productos_actualizados",
        dbDia.prepare("SELECT * FROM productos").all()
      );
      socket.emit(
        "devoluciones_actualizadas",
        dbDia.prepare("SELECT * FROM devoluciones").all()
      );
      socket.emit("fecha_actualizada", getFechaActual() || "");
    } catch (e) {
      console.error("Error enviando datos iniciales al socket:", e);
    }

    // =======================================================
    // ❌ DESCONECTAR SOCKET DEL USUARIO
    // =======================================================
    socket.on("disconnect", () => {

      try {
        socket.rooms.forEach((room) => {
          if (room !== socket.id && room.startsWith("ixora-")) {
            socket.to(room).emit("call_user_left", {
              room,
              socketId: socket.id,
            });
          }
        });
      } catch (e) {
        // Ignorar errores al limpiar salas
      }

      if (usuarioNickname && usuariosActivos[usuarioNickname]) {
        // quitar este socket de la lista
        usuariosActivos[usuarioNickname].sockets = usuariosActivos[usuarioNickname].sockets.filter(
          (id) => id !== socket.id
        );

        // si ya no tiene sockets → eliminar usuario
        if (usuariosActivos[usuarioNickname].sockets.length === 0) {
          delete usuariosActivos[usuarioNickname];
        }

        enviarUsuariosActivos();
      }
    });
  });

  return io;
};

// =======================================================
// 🔵 ENVÍA LA LISTA FINAL DE USUARIOS (UNA VEZ POR NOMBRE)
// =======================================================
function enviarUsuariosActivos() {
  // Excluir IXORA de la lista de usuarios activos (invisible)
  const lista = Object.keys(usuariosActivos)
    .filter(nickname => nickname !== "IXORA")
    .map((nickname) => ({
      nickname,
      photo: usuariosActivos[nickname].photo || null,
    }));

  io.emit("usuarios_activos", lista);
  
  // Emitir evento para actualizar estados (para que los clientes recarguen estados)
  io.emit("estados_actualizados");
}

export const getIO = () => io;

// Obtener lista de usuarios activos (para admin)
export const getUsuariosActivos = () => {
  return Object.keys(usuariosActivos).map((nickname) => ({
    nickname,
    photo: usuariosActivos[nickname].photo || null,
    sockets: usuariosActivos[nickname].sockets.length,
  }));
};

// Obtener sockets de un usuario por nickname
export const getSocketsByNickname = (nickname) => {
  if (usuariosActivos[nickname] && usuariosActivos[nickname].sockets) {
    return usuariosActivos[nickname].sockets;
  }
  return [];
};