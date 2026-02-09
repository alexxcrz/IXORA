import React, { useState, useEffect, useRef } from "react";
import "./Notifications.css";
import { useAuth, authFetch } from "../AuthContext";
import { getServerUrl, getServerUrlSync } from "../config/server";
import { reproducirSonidoIxora } from "../utils/sonidoIxora";
import { useAlert } from "./AlertModal";

// Versión web-only del componente Notifications
// Las notificaciones push móviles han sido removidas

export const NotificationContext = React.createContext();

export function NotificationProvider({ children }) {
  const { user, perms } = useAuth();
  const { showAlert } = useAlert();
  const [serverUrl, setServerUrl] = useState(getServerUrlSync());
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toastVisible, setToastVisible] = useState(null);
  const [activeTab, setActiveTab] = useState('nuevas'); // 'nuevas' o 'historial'
  // isNative removida (no usada en web-only)
  
  // Solo administradores pueden ver notificaciones
  const isAdmin = React.useMemo(() => perms?.includes("tab:admin"), [perms]);
  // CEO/Desarrollador: tiene permisos senior o junior
  const isDeveloper = React.useMemo(() => perms?.includes("admin.senior") || perms?.includes("admin.junior"), [perms]);
  
  // Resetear a pestaña "Nuevas" cuando se abre el panel si hay notificaciones nuevas
  useEffect(() => {
    if (isOpen) {
      const hasUnread = notifications.some((n) => {
        const isRead = n.read || n.leida === 1;
        if (n.adminOnly && !isAdmin) return false;
        if (n.codeError && !isDeveloper) return false;
        return !isRead;
      });
      if (hasUnread) {
        setActiveTab('nuevas');
      }
    }
  }, [isOpen, notifications, isAdmin, isDeveloper]);
  
  useEffect(() => {
    let activo = true;
    getServerUrl()
      .then((url) => {
        if (activo && url) {
          setServerUrl(url);
        }
      })
      .catch(() => {});
    return () => {
      activo = false;
    };
  }, []);

  // Exponer función para abrir desde fuera
  React.useImperativeHandle(React.useRef(), () => ({
    open: () => setIsOpen(true),
    close: () => setIsOpen(false)
  }));
  // Mapa para guardar callbacks de notificaciones (no se pueden serializar)
  const callbacksRef = useRef(new Map());
  const [configNotif, setConfigNotif] = useState(null);

  const cargarConfigNotif = React.useCallback(async () => {
    if (!user || !serverUrl) return;
    try {
      const c = await authFetch(`${serverUrl}/chat/notificaciones/config`);
      setConfigNotif(c || null);
    } catch {
      setConfigNotif(null);
    }
  }, [user, serverUrl]);

  useEffect(() => {
    if (user && serverUrl) cargarConfigNotif();
  }, [user, serverUrl, cargarConfigNotif]);

  useEffect(() => {
    const handler = () => { cargarConfigNotif(); };
    window.addEventListener("config-notificaciones-guardada", handler);
    return () => window.removeEventListener("config-notificaciones-guardada", handler);
  }, [cargarConfigNotif]);

  const reproducirSonidoNotif = React.useCallback(() => {
    if (!configNotif || configNotif.sonido_activo === 0) return;
    const key = configNotif.sonido_mensaje || "ixora-pulse";
    reproducirSonidoIxora(key);
  }, [configNotif]);

  // Cargar notificaciones desde el servidor
  const cargarNotificaciones = React.useCallback(async () => {
    if (!user || !serverUrl) return;
    try {
      setLoading(true);
      const data = await authFetch(`${serverUrl}/notificaciones?incluir_leidas=true`);
      setNotifications(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error cargando notificaciones:", err);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [user, serverUrl]);

  const mostrarNotificacionDispositivo = async ({ id, titulo, mensaje, data }) => {
    // Las notificaciones de dispositivo móvil han sido deshabilitadas (web-only)
    return;
  };

  // Cargar notificaciones al iniciar y cuando cambia el usuario
  useEffect(() => {
    if (user) {
      cargarNotificaciones();
    } else {
      setNotifications([]);
    }
  }, [user, serverUrl]);

  // Refrescar al abrir el panel para tener siempre datos en tiempo real
  useEffect(() => {
    if (isOpen && user && serverUrl) {
      cargarNotificaciones();
    }
  }, [isOpen, user, serverUrl, cargarNotificaciones]);

  // Las notificaciones push nativas han sido deshabilitadas (web-only)
  // useEffect removido

  // Escuchar eventos de socket para nuevas notificaciones
  useEffect(() => {
    if (!user) return;

    // Obtener socket desde window (se crea en App.jsx)
    const socket = window.socket;
    if (!socket) {
      console.warn("Socket no disponible para notificaciones");
      return;
    }

    const handleNuevaNotificacion = (data) => {
      const uid = user?.id;
      if (uid == null) return;
      const a = Number(data.userId ?? data.usuario_id);
      const b = Number(uid);
      const esParaEsteUsuario = !Number.isNaN(a) && !Number.isNaN(b) && a === b;
      if (esParaEsteUsuario) {
        // Actualizar notificaciones inmediatamente
        cargarNotificaciones();
        const esPrioritaria = (data?.data?.prioridad === 1) && (data?.data?.mensaje_id != null);
        const esReunion = data?.tipo === 'reunion' || data?.data?.tipo === 'reunion';
        
        // Reproducir sonido para notificaciones prioritarias o de reuniones
        if (esPrioritaria) {
          reproducirSonidoIxora(configNotif?.sonido_mensaje || "ixora-pulse");
        } else if (esReunion) {
          // Reproducir sonido especial para reuniones (usar sonido de llamada)
          reproducirSonidoIxora("ixora-call");
        } else {
          reproducirSonidoNotif();
        }
        // Mostrar en barra del dispositivo (solo app nativa)
        mostrarNotificacionDispositivo({
          id: data.id,
          titulo: data.titulo,
          mensaje: data.mensaje,
          data: data.data || {},
        });
        
        // Agregar notificación al estado local inmediatamente para respuesta instantánea
        const nuevaNotif = {
          id: data.id,
          titulo: data.titulo,
          mensaje: data.mensaje,
          tipo: data.tipo || "info",
          read: false,
          timestamp: data.timestamp || new Date().toISOString(),
          data: data.data || {},
        };
        setNotifications((prev) => [nuevaNotif, ...prev].slice(0, 50));
        
        // Mostrar toast visual para todas las notificaciones (especialmente inventario)
        setToastVisible({
          titulo: data.titulo,
          mensaje: data.mensaje,
          tipo: data.tipo || "info"
        });
        // Ocultar toast después de 6 segundos
        setTimeout(() => {
          setToastVisible(null);
        }, 6000);
      }
    };

    socket.on("nueva_notificacion", handleNuevaNotificacion);

    return () => {
      if (socket) {
        socket.off("nueva_notificacion", handleNuevaNotificacion);
      }
    };
  }, [user, configNotif, reproducirSonidoNotif, cargarNotificaciones]);

  // Sincronizar "leída" cuando se marca en otro dispositivo
  useEffect(() => {
    if (!user) return;
    const socket = window.socket;
    if (!socket) return;

    const handleNotificacionLeida = (data) => {
      const esParaEsteUsuario = data.userId === user.id;
      if (!esParaEsteUsuario) return;
      const id = data.id != null ? Number(data.id) : null;
      if (id == null) return;
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, read: true, leida: 1 } : n
        )
      );
    };

    socket.on("notificacion_leida", handleNotificacionLeida);
    return () => {
      if (socket) socket.off("notificacion_leida", handleNotificacionLeida);
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const socket = window.socket;
    if (!socket) return;
    const handler = () => { cargarNotificaciones(); };
    socket.on("notificaciones_actualizadas", handler);
    return () => { socket.off("notificaciones_actualizadas", handler); };
  }, [user, cargarNotificaciones]);

  const addNotification = async (notification) => {
    // Si la notificación es de tipo "admin" (específica de administrador), solo agregar si es admin
    // Los errores de código solo van al desarrollador/CEO
    if (notification.adminOnly && !isAdmin) {
      return null;
    }
    
    // Errores de código solo para desarrollador/CEO
    if (notification.codeError && !isDeveloper) {
      return null;
    }

    try {
      // Validar que tenga título y mensaje (requeridos por el servidor)
      const titulo = notification.title || notification.titulo || "";
      const mensaje = notification.message || notification.mensaje || "";
      
      if (!titulo || !mensaje) {
        console.warn("⚠️ Notificación sin título o mensaje, usando fallback");
        // Si no tiene título o mensaje, no intentar guardar en servidor
        const id = Date.now() + Math.random();
        const newNotification = {
          id,
          ...notification,
          titulo: titulo || "Notificación",
          mensaje: mensaje || "Sin mensaje",
          timestamp: new Date(),
          read: false,
        };
        setNotifications((prev) => [newNotification, ...prev].slice(0, 50));
        return id;
      }
      
      // Guardar en el servidor
      const response = await authFetch(`${serverUrl}/notificaciones`, {
        method: "POST",
        body: JSON.stringify({
          titulo: titulo,
          mensaje: mensaje,
          tipo: notification.type || "info",
          es_confirmacion: notification.es_confirmacion || false,
          admin_only: notification.adminOnly || false,
          code_error: notification.codeError || false,
          data: notification.data || null,
        }),
      });

      // Guardar callbacks en memoria si existen (no se pueden serializar)
      if (notification.onAccept || notification.onReject) {
        callbacksRef.current.set(response.id, {
          onAccept: notification.onAccept,
          onReject: notification.onReject
        });
        console.log("✅ Callbacks guardados para notificación ID:", response.id);
      }

      // Recargar notificaciones desde el servidor
      await cargarNotificaciones();
      
      reproducirSonidoNotif();

      mostrarNotificacionDispositivo({
        id: response.id,
        titulo: titulo || "Notificación",
        mensaje: mensaje || "",
        data: notification.data || {},
      });
      
      return response.id;
    } catch (err) {
      console.error("Error guardando notificación:", err);
      // Si falla, agregar en memoria como fallback
      const id = Date.now() + Math.random();
      const newNotification = {
        id,
        ...notification,
        timestamp: new Date(),
        read: false,
      };
      setNotifications((prev) => [newNotification, ...prev].slice(0, 50));
      mostrarNotificacionDispositivo({
        id,
        titulo: notification.title || notification.titulo || "Notificación",
        mensaje: notification.message || notification.mensaje || "",
        data: notification.data || {},
      });
      return id;
    }
  };

  const removeNotification = async (id) => {
    try {
      await authFetch(`${serverUrl}/notificaciones/${id}`, {
        method: "DELETE",
      });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      if (err?.status === 403) {
        showAlert?.(err?.message || "No se puede eliminar hasta que se quite la prioridad al mensaje.", "warning");
        return;
      }
      if (err?.status !== 404 && !err?.isNotFound) {
        console.error("Error eliminando notificación:", err);
      }
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }
  };

  const clearAll = async () => {
    try {
      // Si estamos en la pestaña "Nuevas", marcar todas las no leídas como leídas
      if (activeTab === 'nuevas') {
        const unreadNotifications = notifications.filter((n) => {
          const isRead = n.read || n.leida === 1;
          if (n.adminOnly && !isAdmin) return false;
          if (n.codeError && !isDeveloper) return false;
          const prioritaria = (n.data?.prioridad === 1) && (n.data?.mensaje_id != null);
          if (prioritaria) return false;
          return !isRead;
        });
        
        await Promise.all(
          unreadNotifications.map((n) =>
            authFetch(`${serverUrl}/notificaciones/${n.id}/leida`, {
              method: "PUT",
            }).catch(() => {})
          )
        );
        
        setNotifications((prev) =>
          prev.map((n) => {
            const isUnread = !(n.read || n.leida === 1);
            const shouldMark = unreadNotifications.some((un) => un.id === n.id);
            if (shouldMark && isUnread) {
              return { ...n, read: true, leida: 1 };
            }
            return n;
          })
        );
      } else {
        // Si estamos en historial, eliminar todas las leídas
        await authFetch(`${serverUrl}/notificaciones`, {
          method: "DELETE",
        });
        // Recargar notificaciones
        await cargarNotificaciones();
      }
    } catch (err) {
      console.error("Error limpiando notificaciones:", err);
      // Si falla, limpiar solo en memoria
      if (activeTab === 'nuevas') {
        setNotifications((prev) =>
          prev.map((n) => {
            const isRead = n.read || n.leida === 1;
            if (!isRead) {
              return { ...n, read: true, leida: 1 };
            }
            return n;
          })
        );
      } else {
        setNotifications((prev) => prev.filter((n) => {
          const isRead = n.read || n.leida === 1;
          return !isRead; // Mantener solo no leídas
        }));
      }
    }
  };

  const unreadCount = notifications.filter((n) => {
    const isRead = n.read || n.leida === 1;
    // Filtrar por permisos también
    if (n.admin_only && !isAdmin) return false;
    if (n.code_error && !isDeveloper) return false;
    if (n.adminOnly && !isAdmin) return false;
    if (n.codeError && !isDeveloper) return false;
    return !isRead;
  }).length;

  // Capturar errores globales solo para CEO/Desarrollador
  useEffect(() => {
    if (!isDeveloper || !isAdmin) return;

    const handleError = (event) => {
      const error = event.error || event.reason || event.message || "Error desconocido";
      const errorMessage = error?.message || String(error);
      const errorStack = error?.stack || "";
      
      // Obtener información del error
      const fileName = event.filename || event.source || "desconocido";
      const lineNumber = event.lineno || event.line || "desconocido";
      const columnNumber = event.colno || event.column || "desconocido";

      // Extraer solo el nombre del archivo (sin ruta completa)
      const fileNameShort = fileName.split('/').pop().split('\\').pop();

      const fullMessage = `Archivo: ${fileNameShort}\nLínea: ${lineNumber}:${columnNumber}\n\n${errorMessage}${errorStack ? `\n\n${errorStack.split('\n').slice(0, 3).join('\n')}` : ''}`;

      // Guardar en servidor usando addNotification (async, no esperar)
      addNotification({
        title: "🐛 Error de Código",
        message: fullMessage,
        type: "error",
        codeError: true,
        data: {
          error: errorMessage,
          stack: errorStack,
          file: fileName,
          line: lineNumber,
          column: columnNumber,
        },
      }).catch(err => console.error("Error guardando notificación de error:", err));
    };

    const handleUnhandledRejection = (event) => {
      const reason = event.reason || "Promise rechazada sin razón";
      const errorMessage = reason?.message || String(reason);
      const errorStack = reason?.stack || "";

      // Guardar en servidor usando addNotification (async, no esperar)
      addNotification({
        title: "🐛 Promise Rechazada",
        message: `${errorMessage}${errorStack ? `\n\n${errorStack.split('\n').slice(0, 3).join('\n')}` : ''}`,
        type: "error",
        codeError: true,
        data: {
          error: errorMessage,
          stack: errorStack,
        },
      }).catch(err => console.error("Error guardando notificación de promise:", err));
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [isDeveloper, isAdmin, user]); // Agregar user a dependencias

  return (
    <NotificationContext.Provider
      value={{ addNotification, removeNotification, clearAll, notifications, setIsOpen, isOpen, unreadCount }}
    >
      {children}
      
      {/* Toast visual para notificaciones de inventario */}
      {toastVisible && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: toastVisible.tipo === 'warning' 
              ? 'linear-gradient(135deg, #f59e0b, #d97706)'
              : toastVisible.tipo === 'success'
              ? 'linear-gradient(135deg, #22c55e, #16a34a)'
              : 'linear-gradient(135deg, #3b82f6, #2563eb)',
            color: '#ffffff',
            padding: '16px 20px',
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4), 0 0 20px rgba(59, 130, 246, 0.5)',
            zIndex: 100002,
            minWidth: '300px',
            maxWidth: '500px',
            animation: 'slideInRight 0.3s ease-out',
            border: '2px solid rgba(255, 255, 255, 0.3)'
          }}
          onClick={() => setToastVisible(null)}
        >
          <div style={{ fontWeight: '700', fontSize: '1.1rem', marginBottom: '6px' }}>
            {toastVisible.titulo}
          </div>
          <div style={{ fontSize: '0.95rem', opacity: 0.95 }}>
            {toastVisible.mensaje}
          </div>
        </div>
      )}
      
      {user && (
        <>
        {/* Botón superior oculto - ahora está en el menú inferior */}
        <div className="notifications-container" style={{ display: 'none' }}>
        <button
          className="notifications-bell"
          onClick={() => setIsOpen(!isOpen)}
          title="Notificaciones"
        >
          🔔
          {unreadCount > 0 && (
            <span className="notifications-badge">{unreadCount}</span>
          )}
        </button>
        </div>
        
        {/* Panel de notificaciones - mostrar cuando isOpen es true */}
        {isOpen && (
          <>
            <div className="notifications-overlay" onClick={() => setIsOpen(false)}></div>
            <div className="notifications-panel">
            <div className="notifications-header">
              <h3>Notificaciones</h3>
              {activeTab === 'nuevas' && notifications.filter((n) => {
                const isRead = n.read || n.leida === 1;
                if (n.adminOnly && !isAdmin) return false;
                if (n.codeError && !isDeveloper) return false;
                return !isRead;
              }).length > 0 && (
                <button
                  className="notifications-clear"
                  onClick={clearAll}
                  title="Marcar todas como leídas"
                >
                  🗑️
                </button>
              )}
              {activeTab === 'historial' && notifications.filter((n) => {
                const isRead = n.read || n.leida === 1;
                if (n.adminOnly && !isAdmin) return false;
                if (n.codeError && !isDeveloper) return false;
                return isRead;
              }).length > 0 && (
                <button
                  className="notifications-clear"
                  onClick={clearAll}
                  title="Eliminar historial"
                >
                  🗑️
                </button>
              )}
            </div>
            
            {/* Pestañas */}
            <div className="notifications-tabs">
              <button
                className={`notifications-tab ${activeTab === 'nuevas' ? 'active' : ''}`}
                onClick={() => setActiveTab('nuevas')}
              >
                Nuevas
                {(() => {
                  const unreadCount = notifications.filter((n) => {
                    const isRead = n.read || n.leida === 1;
                    if (n.adminOnly && !isAdmin) return false;
                    if (n.codeError && !isDeveloper) return false;
                    return !isRead;
                  }).length;
                  return unreadCount > 0 ? (
                    <span className="notifications-tab-badge">{unreadCount}</span>
                  ) : null;
                })()}
              </button>
              <button
                className={`notifications-tab ${activeTab === 'historial' ? 'active' : ''}`}
                onClick={() => setActiveTab('historial')}
              >
                Historial
              </button>
            </div>
            
            <div className="notifications-list">
              {loading ? (
                <div className="notifications-empty">Cargando...</div>
              ) : (
                (() => {
                  // Filtrar notificaciones según la pestaña activa
                  let filteredNotifications = notifications.filter((notification) => {
                    // Filtrar por permisos
                    if (notification.adminOnly && !isAdmin) return false;
                    if (notification.codeError && !isDeveloper) return false;
                    
                    // Filtrar por pestaña: nuevas (no leídas) o historial (leídas)
                    const isRead = notification.read || notification.leida === 1;
                    if (activeTab === 'nuevas') {
                      return !isRead; // Solo no leídas en pestaña "Nuevas"
                    } else {
                      return isRead; // Solo leídas en pestaña "Historial"
                    }
                  });
                  
                  // Ordenar: más recientes primero
                  filteredNotifications = filteredNotifications.sort((a, b) => {
                    const timeA = new Date(a.timestamp || a.created_at || 0).getTime();
                    const timeB = new Date(b.timestamp || b.created_at || 0).getTime();
                    return timeB - timeA;
                  });

                return filteredNotifications.length === 0 ? (
                  <div className="notifications-empty">
                    {activeTab === 'nuevas' 
                      ? 'No hay notificaciones nuevas' 
                      : 'No hay notificaciones en el historial'}
                  </div>
                ) : (
                  filteredNotifications.map((notification) => {
                    // Normalizar propiedades (pueden venir como leida o read)
                    const isRead = notification.read || notification.leida === 1;
                    // Es confirmación si está marcado o si tiene data.tipo === "importacion"
                    const isConfirmacion = notification.es_confirmacion === 1 || 
                                          notification.es_confirmacion === true ||
                                          (notification.data && notification.data.tipo === "importacion");
                    
                    return (
                  <div
                    key={notification.id}
                    className={`notification-item ${
                      !isRead ? "unread" : ""
                    }`}
                    onClick={async () => {
                      if (notification.onClick) {
                        notification.onClick();
                      }

                      const d = notification.data || {};
                      if (d.tipo === "solicitud_grupo" && d.grupo_id != null) {
                        setIsOpen(false);
                        window.dispatchEvent(new CustomEvent("ixora-abrir-chat-solicitud", {
                          detail: {
                            grupoId: d.grupo_id,
                            solicitudId: d.solicitud_id,
                            solicitanteNickname: d.solicitante_nickname,
                            fecha: d.fecha,
                            groupName: d.groupName,
                          },
                        }));
                      } else if (d.prioridad === 1 && d.chatType && d.chatTarget != null && d.mensaje_id != null) {
                        setIsOpen(false);
                        window.dispatchEvent(new CustomEvent("ixora-abrir-chat-mensaje-prioritario", {
                          detail: {
                            chatType: d.chatType,
                            chatTarget: d.chatTarget,
                            mensaje_id: Number(d.mensaje_id),
                          },
                        }));
                      }

                      const esPrioritaria = (d.prioridad === 1) && (d.mensaje_id != null);
                      if (activeTab === 'nuevas' && !isRead && !esPrioritaria) {
                        try {
                          await authFetch(`${serverUrl}/notificaciones/${notification.id}/leida`, {
                            method: "PUT",
                          });
                          setNotifications((prev) =>
                            prev.map((n) =>
                              n.id === notification.id ? { ...n, read: true, leida: 1 } : n
                            )
                          );
                        } catch (err) {
                          console.error("Error marcando notificación como leída:", err);
                          setNotifications((prev) =>
                            prev.map((n) =>
                              n.id === notification.id ? { ...n, read: true, leida: 1 } : n
                            )
                          );
                        }
                      }
                    }}
                  >
                    <div className="notification-content">
                      <div className="notification-title">
                        {notification.type === "error" && "🐛"}
                        {notification.type === "success" && "✅"}
                        {notification.type === "warning" && "⚠️"}
                        {notification.type === "info" && "ℹ️"}
                        {!notification.type && "📢"}
                        <span>{notification.titulo || notification.title}</span>
                      </div>
                      <div className="notification-message">
                        {notification.mensaje || notification.message}
                      </div>
                      {(isConfirmacion || (notification.data && notification.data.tipo === "importacion")) && (
                        <div className="notification-actions">
                          <button
                            className="notification-btn-accept"
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                // Si es confirmación, usar el endpoint especial
                                if (isConfirmacion) {
                                  try {
                                    await authFetch(`${serverUrl}/notificaciones/${notification.id}/confirmar`, {
                                      method: "PUT",
                                      body: JSON.stringify({ accion: "aceptar" }),
                                    });
                                  } catch (confirmError) {
                                    // Si la notificación ya no existe (404), es válido - puede que ya fue procesada
                                    if (confirmError.status === 404 || confirmError.isNotFound) {
                                      console.debug("Notificación ya procesada o eliminada");
                                    } else {
                                      throw confirmError;
                                    }
                                  }
                                  // Ejecutar el callback onAccept si existe (buscarlo en el mapa de callbacks)
                                  const callbacks = callbacksRef.current.get(notification.id);
                                  console.log("🔍 Buscando callbacks para notificación ID:", notification.id, "Callbacks encontrados:", !!callbacks);
                                  if (callbacks?.onAccept) {
                                    console.log("✅ Ejecutando callback onAccept desde mapa");
                                    await callbacks.onAccept();
                                  } else if (notification.onAccept) {
                                    console.log("✅ Ejecutando callback onAccept desde notificación");
                                    await notification.onAccept();
                                  } else {
                                    console.warn("⚠️ No se encontró callback onAccept para notificación ID:", notification.id);
                                  }
                                  // Limpiar callbacks después de usar
                                  callbacksRef.current.delete(notification.id);
                                  // Las confirmaciones se borran automáticamente en el servidor
                                  await cargarNotificaciones();
                                } else {
                                  // Para notificaciones de importación, buscar callbacks en el mapa
                                  const callbacks = callbacksRef.current.get(notification.id);
                                  if (callbacks?.onAccept) {
                                    await callbacks.onAccept();
                                  } else if (notification.onAccept) {
                                    await notification.onAccept();
                                  } else if (notification.onClick) {
                                    await notification.onClick();
                                  }
                                  // Limpiar callbacks después de usar
                                  if (callbacks) {
                                    callbacksRef.current.delete(notification.id);
                                  }
                                  // Solo eliminar manualmente si no es confirmación
                                  await removeNotification(notification.id);
                                }
                              } catch (err) {
                                console.error("Error aceptando notificación:", err);
                              }
                            }}
                          >
                            ✓ Aceptar
                          </button>
                          <button
                            className="notification-btn-reject"
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                // Si es confirmación, usar el endpoint especial
                                if (isConfirmacion) {
                                  try {
                                    await authFetch(`${serverUrl}/notificaciones/${notification.id}/confirmar`, {
                                      method: "PUT",
                                      body: JSON.stringify({ accion: "rechazar" }),
                                    });
                                  } catch (confirmError) {
                                    // Si la notificación ya no existe (404), es válido - puede que ya fue procesada
                                    if (confirmError.status === 404 || confirmError.isNotFound) {
                                      console.debug("Notificación ya procesada o eliminada");
                                    } else {
                                      throw confirmError;
                                    }
                                  }
                                  // Ejecutar el callback onReject si existe (buscarlo en el mapa de callbacks)
                                  const callbacks = callbacksRef.current.get(notification.id);
                                  if (callbacks?.onReject) {
                                    callbacks.onReject();
                                  } else if (notification.onReject) {
                                    notification.onReject();
                                  }
                                  // Limpiar callbacks después de usar
                                  callbacksRef.current.delete(notification.id);
                                  // Las confirmaciones se borran automáticamente en el servidor
                                  await cargarNotificaciones();
                                } else {
                                  // Para notificaciones de importación, buscar callbacks en el mapa
                                  const callbacks = callbacksRef.current.get(notification.id);
                                  if (callbacks?.onReject) {
                                    callbacks.onReject();
                                  } else if (notification.onReject) {
                                    notification.onReject();
                                  }
                                  // Limpiar callbacks después de usar
                                  if (callbacks) {
                                    callbacksRef.current.delete(notification.id);
                                  }
                                  // Solo eliminar manualmente si no es confirmación
                                  await removeNotification(notification.id);
                                }
                              } catch (err) {
                                console.error("Error rechazando notificación:", err);
                              }
                            }}
                          >
                            ✕ Rechazar
                          </button>
                        </div>
                      )}
                      {notification.timestamp && (
                        <div className="notification-time">
                          {new Date(notification.timestamp).toLocaleTimeString('es-MX', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </div>
                      )}
                    </div>
                    {!((notification.data?.prioridad === 1) && (notification.data?.mensaje_id != null)) && (
                    <button
                      className="notification-close"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeNotification(notification.id);
                      }}
                      title="Cerrar"
                    >
                      ✕
                    </button>
                    )}
                  </div>
                  );
                  })
                );
                })()
              )}
            </div>
            </div>
          </>
        )}
        </>
      )}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = React.useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotifications must be used within NotificationProvider"
    );
  }
  return context;
}

// Hook para abrir notificaciones desde fuera del componente
export function useOpenNotifications() {
  const [isOpen, setIsOpen] = useState(false);
  
  const openNotifications = () => {
    setIsOpen(true);
  };
  
  const closeNotifications = () => {
    setIsOpen(false);
  };
  
  return { isOpen, openNotifications, closeNotifications };
}
