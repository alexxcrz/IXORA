import React, { useState, useRef, useEffect, useCallback } from 'react';
import './WidgetsMenu.css';
import ChatPro from './ChatPro';
import { useNotifications } from './Notifications';
import { useAuth } from '../AuthContext';
import { reproducirSonidoIxora } from '../utils/sonidoIxora';

export default function WidgetsMenu({ serverUrl, pushToast, socket, user, inTopBar = false }) {
  const [widgetAbierto, setWidgetAbierto] = useState(null); // 'chat', 'notificaciones'
  const [solicitudPending, setSolicitudPending] = useState(null); // { grupoId, solicitudId, solicitanteNickname, fecha, groupName }
  const [mensajePrioritarioPending, setMensajePrioritarioPending] = useState(null); // { chatType, chatTarget, mensaje_id }
  const menuRef = useRef(null);
  const { authFetch } = useAuth();
  const notificationsContext = useNotifications();
  const [chatPrivadosNoLeidos, setChatPrivadosNoLeidos] = useState(0);
  const [chatExtrasNoLeidos, setChatExtrasNoLeidos] = useState(0);
  const [configChat, setConfigChat] = useState(null);
  const refreshPrivadosTimeoutRef = useRef(null);

  const notificacionesNoLeidas = notificationsContext?.unreadCount || 0;
  const chatNoLeidosTotal = chatPrivadosNoLeidos + chatExtrasNoLeidos;
  const [hayPrioritariosPendientes, setHayPrioritariosPendientes] = useState(false);
  const hayPendientesChat = chatNoLeidosTotal > 0 || hayPrioritariosPendientes;

  const cargarConfigChat = useCallback(async () => {
    if (!user || !serverUrl) return;
    try {
      const c = await authFetch(`${serverUrl}/chat/notificaciones/config`);
      setConfigChat(c || null);
    } catch {
      setConfigChat(null);
    }
  }, [user, serverUrl, authFetch]);

  useEffect(() => {
    if (user && serverUrl) cargarConfigChat();
  }, [user, serverUrl, cargarConfigChat]);

  useEffect(() => {
    const handler = () => { cargarConfigChat(); };
    window.addEventListener("config-notificaciones-guardada", handler);
    return () => window.removeEventListener("config-notificaciones-guardada", handler);
  }, [cargarConfigChat]);

  const reproducirSonidoChat = useCallback(() => {
    if (!configChat || configChat.sonido_activo === 0) return;
    const key = configChat.sonido_mensaje || "ixora-pulse";
    reproducirSonidoIxora(key);
  }, [configChat]);

  const estaDentroHorario = useCallback((cfg) => {
    if (!cfg || cfg.notificaciones_activas === 0) return false;
    const day = new Date().getDay();
    const diaId = day === 0 ? "7" : String(day);
    const dias = (cfg.dias_semana || "1,2,3,4,5,6,7").split(",").map((d) => d.trim()).filter(Boolean);
    if (!dias.includes(diaId)) return false;
    const mapa = { "1": "lun", "2": "mar", "3": "mie", "4": "jue", "5": "vie", "6": "sab", "7": "dom" };
    const key = mapa[diaId];
    const inicio = cfg[`horario_${key}_inicio`] || cfg.horario_inicio || "08:00";
    const fin = cfg[`horario_${key}_fin`] || cfg.horario_fin || "22:00";
    const [hi, mi] = inicio.split(":").map(Number);
    const [hf, mf] = fin.split(":").map(Number);
    const ahora = new Date();
    const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
    const inicioMin = hi * 60 + mi;
    const finMin = hf * 60 + mf;
    if (Number.isNaN(inicioMin) || Number.isNaN(finMin)) return true;
    if (finMin < inicioMin) return ahoraMin >= inicioMin || ahoraMin <= finMin;
    return ahoraMin >= inicioMin && ahoraMin <= finMin;
  }, []);

  const cargarChatPrivadosNoLeidos = useCallback(async () => {
    if (!user || !authFetch || !serverUrl) return;
    try {
      const data = await authFetch(`${serverUrl}/chat/activos`);
      const total = Array.isArray(data)
        ? data.reduce((sum, chat) => sum + (chat.mensajes_no_leidos || 0), 0)
        : 0;
      setChatPrivadosNoLeidos(total);
    } catch (err) {
    }
  }, [user, authFetch, serverUrl]);

  const programarActualizacionPrivados = useCallback(() => {
    if (refreshPrivadosTimeoutRef.current) {
      clearTimeout(refreshPrivadosTimeoutRef.current);
    }
    refreshPrivadosTimeoutRef.current = setTimeout(() => {
      cargarChatPrivadosNoLeidos();
    }, 400);
  }, [cargarChatPrivadosNoLeidos]);

  useEffect(() => {
    if (user) {
      cargarChatPrivadosNoLeidos();
    } else {
      setChatPrivadosNoLeidos(0);
      setChatExtrasNoLeidos(0);
    }
  }, [user, cargarChatPrivadosNoLeidos]);

  useEffect(() => {
    if (!socket || !user) return;
    
    const userDisplayName = user.nickname || user.name;
    
    const handleGeneral = (mensaje) => {
      if (mensaje.usuario_nickname === userDisplayName) return;
      if (widgetAbierto !== 'chat') {
        setChatExtrasNoLeidos((n) => n + 1);
        reproducirSonidoChat();
      }
    };

    const handlePrivado = (mensaje) => {
      if (widgetAbierto !== 'chat') {
        reproducirSonidoChat();
      }
      programarActualizacionPrivados();
    };

    const handleGrupal = (mensaje) => {
      if (mensaje.usuario_nickname === userDisplayName) return;
      if (widgetAbierto !== 'chat') {
        setChatExtrasNoLeidos((n) => n + 1);
        reproducirSonidoChat();
      }
    };

    socket.on("chat_general_nuevo", handleGeneral);
    socket.on("chat_privado_nuevo", handlePrivado);
    socket.on("chat_grupal_nuevo", handleGrupal);

    return () => {
      socket.off("chat_general_nuevo", handleGeneral);
      socket.off("chat_privado_nuevo", handlePrivado);
      socket.off("chat_grupal_nuevo", handleGrupal);
    };
  }, [socket, user, widgetAbierto, reproducirSonidoChat, programarActualizacionPrivados]);

  useEffect(() => {
    if (widgetAbierto === 'chat') {
      setChatExtrasNoLeidos(0);
      cargarChatPrivadosNoLeidos();
    }
  }, [widgetAbierto, cargarChatPrivadosNoLeidos]);

  // Sincronizar cuando se marcan mensajes como leídos en otro dispositivo
  useEffect(() => {
    if (!socket || !user) return;
    const handlePrivadoLeidos = () => {
      programarActualizacionPrivados();
    };
    const handleChatsActivosActualizados = () => {
      programarActualizacionPrivados();
      setChatExtrasNoLeidos(0);
    };
    socket.on("chat_privado_leidos", handlePrivadoLeidos);
    socket.on("chats_activos_actualizados", handleChatsActivosActualizados);
    return () => {
      socket.off("chat_privado_leidos", handlePrivadoLeidos);
      socket.off("chats_activos_actualizados", handleChatsActivosActualizados);
    };
  }, [socket, user, programarActualizacionPrivados]);

  useEffect(() => {
    const handler = (e) => {
      const d = e.detail || {};
      if (d.grupoId != null) {
        setSolicitudPending({
          grupoId: d.grupoId,
          solicitudId: d.solicitudId,
          solicitanteNickname: d.solicitanteNickname || d.solicitante_nickname,
          fecha: d.fecha,
          groupName: d.groupName,
        });
        setWidgetAbierto("chat");
      }
    };
    window.addEventListener("ixora-abrir-chat-solicitud", handler);
    return () => window.removeEventListener("ixora-abrir-chat-solicitud", handler);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      const d = e.detail || {};
      if (d.chatType && d.chatTarget != null && d.mensaje_id != null) {
        setMensajePrioritarioPending({
          chatType: d.chatType,
          chatTarget: d.chatTarget,
          mensaje_id: d.mensaje_id,
        });
        setWidgetAbierto("chat");
      }
    };
    window.addEventListener("ixora-abrir-chat-mensaje-prioritario", handler);
    return () => window.removeEventListener("ixora-abrir-chat-mensaje-prioritario", handler);
  }, []);

  useEffect(() => {
    if (!user || !serverUrl) return;
    const check = async () => {
      try {
        const r = await authFetch(`${serverUrl}/chat/prioritarios-pendientes`);
        setHayPrioritariosPendientes(!!r?.hay);
      } catch (_) {
        setHayPrioritariosPendientes(false);
      }
    };
    const t0 = setTimeout(check, 2000);
    const interval = setInterval(check, 60 * 1000);
    return () => {
      clearTimeout(t0);
      clearInterval(interval);
    };
  }, [user, serverUrl, authFetch]);

  useEffect(() => {
    if (!user || !serverUrl) return;
    if (configChat && !estaDentroHorario(configChat)) return;

    const check = async () => {
      try {
        const r = await authFetch(`${serverUrl}/chat/prioritarios-pendientes`);
        if (r?.hay) {
          const key = configChat?.sonido_mensaje || "ixora-pulse";
          reproducirSonidoIxora(key);
        }
      } catch (_) {}
    };

    const t0 = setTimeout(check, 4000);
    const interval = setInterval(check, 3 * 60 * 1000);
    return () => {
      clearTimeout(t0);
      clearInterval(interval);
    };
  }, [user, serverUrl, configChat, authFetch, estaDentroHorario]);

  const abrirWidget = (tipo) => {
    if (tipo === 'notificaciones') {
      // Abrir panel de notificaciones usando el contexto
      if (notificationsContext && typeof notificationsContext.setIsOpen === 'function') {
        notificationsContext.setIsOpen(true);
      }
    } else {
      setWidgetAbierto(tipo);
    }
  };

  const cerrarWidget = () => {
    setWidgetAbierto(null);
  };

  return (
    <>
      {inTopBar ? (
        // Botón de notificaciones para la barra superior
        <button
          className="widgets-notifications-button top-bar-button"
          onClick={() => abrirWidget("notificaciones")}
          title="Notificaciones"
        >
          <span className="widget-menu-item-icon">🔔</span>
          {notificacionesNoLeidas > 0 && (
            <span className="widgets-menu-badge">
              {notificacionesNoLeidas > 99 ? "99+" : notificacionesNoLeidas}
            </span>
          )}
        </button>
      ) : (
        <>
          <div
            className={`widgets-notifications-container top-right ${
              widgetAbierto === "chat" ? "chat-open" : ""
            }`}
          >
            <button
              className="widgets-notifications-button"
              onClick={() => abrirWidget("notificaciones")}
              title="Notificaciones"
            >
              <span className="widget-menu-item-icon">🔔</span>
              {notificacionesNoLeidas > 0 && (
                <span className="widgets-menu-badge">
                  {notificacionesNoLeidas > 99 ? "99+" : notificacionesNoLeidas}
                </span>
              )}
            </button>
          </div>

          <div
            className={`widgets-menu-container ${
              widgetAbierto === "chat" ? "chat-open" : ""
            } ${hayPendientesChat ? "has-chat-pending" : ""}`}
            ref={menuRef}
          >
            {/* Botón principal circular; anillo parpadeante cuando hay mensajes nuevos */}
            <button 
              className="widgets-menu-button"
              onClick={() => abrirWidget('chat')}
              title="Chat"
            >
              <span className="widgets-menu-icon">💬</span>
            </button>
          </div>
        </>
      )}

      {/* Renderizar widgets cuando están abiertos */}
      {widgetAbierto === 'chat' && socket && user && (
        <ChatPro
          socket={socket}
          user={user}
          onClose={cerrarWidget}
          solicitudPending={solicitudPending}
          onSolicitudConsumida={() => setSolicitudPending(null)}
          mensajePrioritarioPending={mensajePrioritarioPending}
          onMensajePrioritarioConsumido={() => setMensajePrioritarioPending(null)}
        />
      )}
    </>
  );
}
