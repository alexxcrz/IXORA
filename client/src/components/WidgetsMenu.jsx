import React, { useState, useRef, useEffect, useCallback } from 'react';
import './WidgetsMenu.css';
import ChatPro from './ChatPro';
import { useNotifications } from './Notifications';
import { useAuth } from '../AuthContext';

export default function WidgetsMenu({ serverUrl, pushToast, socket, user }) {
  const [widgetAbierto, setWidgetAbierto] = useState(null); // 'chat', 'notificaciones'
  const menuRef = useRef(null);
  const { authFetch } = useAuth();
  const notificationsContext = useNotifications();
  const [chatPrivadosNoLeidos, setChatPrivadosNoLeidos] = useState(0);
  const [chatExtrasNoLeidos, setChatExtrasNoLeidos] = useState(0);
  const audioContextRef = useRef(null);
  const refreshPrivadosTimeoutRef = useRef(null);

  const notificacionesNoLeidas = notificationsContext?.unreadCount || 0;
  const chatNoLeidosTotal = chatPrivadosNoLeidos + chatExtrasNoLeidos;
  const hayPendientes = chatNoLeidosTotal > 0 || notificacionesNoLeidas > 0;

  const activarAudioContext = useRef(() => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      
      if (!audioContextRef.current) {
        const audioCtx = new AudioContextClass();
        audioContextRef.current = audioCtx;
      }
      
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
    } catch (err) {
      // Ignorar errores silenciosamente
    }
  }).current;

  const crearSonidoChat = (audioCtx) => {
    try {
      const now = audioCtx.currentTime;
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const osc3 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc1.type = "sine";
      osc2.type = "sine";
      osc3.type = "sine";
      
      osc1.frequency.setValueAtTime(600, now);
      osc1.frequency.exponentialRampToValueAtTime(800, now + 0.1);
      
      osc2.frequency.setValueAtTime(700, now + 0.12);
      osc2.frequency.exponentialRampToValueAtTime(1000, now + 0.22);
      
      osc3.frequency.setValueAtTime(900, now + 0.24);
      osc3.frequency.exponentialRampToValueAtTime(1200, now + 0.34);
      
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.05);
      gain.gain.linearRampToValueAtTime(0.0001, now + 0.1);
      gain.gain.linearRampToValueAtTime(0.6, now + 0.12);
      gain.gain.linearRampToValueAtTime(0.0001, now + 0.22);
      gain.gain.linearRampToValueAtTime(0.7, now + 0.24);
      gain.gain.linearRampToValueAtTime(0.0001, now + 0.34);
      
      osc1.connect(gain);
      osc2.connect(gain);
      osc3.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc1.start(now);
      osc1.stop(now + 0.1);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.22);
      osc3.start(now + 0.24);
      osc3.stop(now + 0.34);
    } catch (err) {
      console.warn("Error creando sonido Chat:", err);
    }
  };

  const reproducirSonidoChat = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return;
      }
      
      let audioCtx = audioContextRef.current;
      if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new AudioContextClass();
        audioContextRef.current = audioCtx;
      }
      
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
          crearSonidoChat(audioCtx);
        }).catch(() => {
          try {
            crearSonidoChat(audioCtx);
          } catch (_) {}
        });
        return;
      }
      
      crearSonidoChat(audioCtx);
    } catch (err) {
      // Ignorar errores silenciosamente
    }
  }, []);

  useEffect(() => {
    let activado = false;
    const activarEnInteraccion = () => {
      if (activado) return;
      activado = true;
      activarAudioContext();
    };
    const eventos = ['click', 'touchstart', 'keydown', 'mousedown'];
    eventos.forEach(evento => {
      document.addEventListener(evento, activarEnInteraccion, { once: true, passive: true });
    });
    return () => {
      eventos.forEach(evento => {
        document.removeEventListener(evento, activarEnInteraccion);
      });
    };
  }, [activarAudioContext]);

  const cargarChatPrivadosNoLeidos = useCallback(async () => {
    if (!user || !authFetch || !serverUrl) return;
    try {
      const data = await authFetch(`${serverUrl}/chat/activos`);
      const total = Array.isArray(data)
        ? data.reduce((sum, chat) => sum + (chat.mensajes_no_leidos || 0), 0)
        : 0;
      setChatPrivadosNoLeidos(total);
    } catch (err) {
      console.warn("Error cargando no leídos del chat:", err);
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

  const abrirWidget = (tipo) => {
    activarAudioContext();
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
        }`}
        ref={menuRef}
      >
        {/* Botón principal circular */}
        <button 
          className="widgets-menu-button"
          onClick={() => abrirWidget('chat')}
          title="Chat"
        >
          <span className="widgets-menu-icon">💬</span>
          {hayPendientes && <span className="widgets-menu-dot" aria-hidden="true" />}
        </button>
      </div>

      {/* Renderizar widgets cuando están abiertos */}
      {widgetAbierto === 'chat' && socket && user && (
        <ChatPro socket={socket} user={user} onClose={cerrarWidget} />
      )}
    </>
  );
}
