import React, { useState, useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { LocalNotifications } from "@capacitor/local-notifications";
import "./Notifications.css";
import { useAuth, authFetch } from "../AuthContext";
import { getServerUrl, getServerUrlSync } from "../config/server";

export const NotificationContext = React.createContext();

export function NotificationProvider({ children }) {
  const { user, perms } = useAuth();
  const [serverUrl, setServerUrl] = useState(getServerUrlSync());
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const isNative = Capacitor.isNativePlatform();
  
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

  // Solo administradores pueden ver notificaciones
  const isAdmin = perms?.includes("tab:admin");
  // CEO/Desarrollador: tiene permisos senior o junior
  const isDeveloper = perms?.includes("admin.senior") || perms?.includes("admin.junior");

  // Cargar notificaciones desde el servidor
  const cargarNotificaciones = async () => {
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
  };

  const mostrarNotificacionDispositivo = async ({ id, titulo, mensaje, data }) => {
    if (!isNative) return;
    try {
      const notifId = Number(id) || Date.now();
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notifId,
            title: titulo || "IXORA",
            body: mensaje || "",
            actionTypeId: "ixora_reply",
            extra: {
              notificationId: String(id || notifId),
              ...data,
            },
          },
        ],
      });
    } catch (err) {
      console.warn("Error mostrando notificación local:", err);
    }
  };

  // ===== SONIDOS ÚNICOS DE PINA PARA NOTIFICACIONES =====
  // Sonidos generados con Web Audio API (igual que en picking)
  const audioContextRef = useRef(null);
  
  const crearSonidoNotificacion = (audioCtx) => {
    try {
      const now = audioCtx.currentTime;
      
      // Sonido único para notificaciones: doble beep distintivo y profesional
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc1.type = "sine";
      osc2.type = "sine";
      
      // Primer beep: 500Hz -> 700Hz (grave a medio)
      osc1.frequency.setValueAtTime(500, now);
      osc1.frequency.exponentialRampToValueAtTime(700, now + 0.15);
      
      // Segundo beep: 800Hz -> 1100Hz (medio a agudo, más distintivo)
      osc2.frequency.setValueAtTime(800, now + 0.18);
      osc2.frequency.exponentialRampToValueAtTime(1100, now + 0.35);
      
      // Envolvente profesional y distintiva (volumen aumentado para mejor audibilidad)
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.6, now + 0.08);
      gain.gain.linearRampToValueAtTime(0.0001, now + 0.15);
      gain.gain.linearRampToValueAtTime(0.7, now + 0.18);
      gain.gain.linearRampToValueAtTime(0.0001, now + 0.35);
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc1.start(now);
      osc1.stop(now + 0.15);
      osc2.start(now + 0.18);
      osc2.stop(now + 0.35);
    } catch (err) {
      console.warn("Error creando sonido Notificación:", err);
    }
  };

  // Función para reproducir sonido único de PINA
  const reproducirSonidoPINA = () => {
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
      
      // Si está suspendido, intentar resumirlo (puede fallar si no hay gesto del usuario)
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
          crearSonidoNotificacion(audioCtx);
        }).catch(() => {
          // Si falla, intentar crear el sonido de todas formas (puede funcionar en algunos casos)
          try {
            crearSonidoNotificacion(audioCtx);
          } catch (e) {
            // Si falla completamente, simplemente no reproducir (el usuario necesita interactuar primero)
          }
        });
        return;
      }
      
      crearSonidoNotificacion(audioCtx);
    } catch (err) {
      // Ignorar errores silenciosamente (el AudioContext puede no estar disponible aún)
    }
  };

  // Función para activar el AudioContext (reutilizable)
  const activarAudioContextFn = useRef(() => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      
      if (!audioContextRef.current) {
        const audioCtx = new AudioContextClass();
        audioContextRef.current = audioCtx;
      }
      
      // Si está suspendido, intentar resumirlo
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {
          // Ignorar errores silenciosamente
        });
      }
    } catch (err) {
      // Ignorar errores silenciosamente
    }
  }).current;

  // Activar AudioContext en la primera interacción del usuario (requerido por navegadores)
  useEffect(() => {
    let activado = false;
    
    const activarEnInteraccion = () => {
      if (activado) return;
      activado = true;
      activarAudioContextFn();
    };

    // Activar en cualquier interacción del usuario (solo una vez)
    const eventos = ['click', 'touchstart', 'keydown', 'mousedown'];
    eventos.forEach(evento => {
      document.addEventListener(evento, activarEnInteraccion, { once: true, passive: true });
    });

    return () => {
      eventos.forEach(evento => {
        document.removeEventListener(evento, activarEnInteraccion);
      });
    };
  }, [activarAudioContextFn]);

  // Cargar notificaciones al iniciar y cuando cambia el usuario
  useEffect(() => {
    if (user) {
      cargarNotificaciones();
    } else {
      setNotifications([]);
    }
  }, [user, serverUrl]);

  // Configurar Push + Local Notifications para app nativa
  useEffect(() => {
    if (!user || !isNative || !serverUrl) return;

    const setupNativeNotifications = async () => {
      try {
        await LocalNotifications.requestPermissions();
        await LocalNotifications.registerActionTypes({
          types: [
            {
              id: "ixora_reply",
              actions: [
                {
                  id: "reply",
                  title: "Responder",
                  input: {
                    type: "text",
                    placeholder: "Escribe tu respuesta",
                  },
                },
              ],
            },
          ],
        });
        await LocalNotifications.createChannel({
          id: "ixora_default",
          name: "IXORA",
          description: "Notificaciones de IXORA",
          importance: 5,
          visibility: 1,
          sound: "default",
          vibration: true,
          lights: true,
        });
      } catch (err) {
        console.warn("Error configurando LocalNotifications:", err);
      }

      try {
        const permiso = await PushNotifications.requestPermissions();
        if (permiso.receive !== "granted") {
          return;
        }

        await PushNotifications.register();
      } catch (err) {
        console.warn("Error solicitando permisos push:", err);
      }
    };

    setupNativeNotifications();

    const registrationHandler = PushNotifications.addListener("registration", async (token) => {
      try {
        await authFetch(`${serverUrl}/notificaciones/push/registrar`, {
          method: "POST",
          body: JSON.stringify({
            token: token.value,
            plataforma: Capacitor.getPlatform(),
          }),
        });
      } catch (err) {
        console.warn("Error registrando token push:", err);
      }
    });

    const pushReceivedHandler = PushNotifications.addListener("pushNotificationReceived", () => {
      cargarNotificaciones();
    });

    const pushActionHandler = PushNotifications.addListener("pushNotificationActionPerformed", () => {
      setIsOpen(true);
    });

    const localActionHandler = LocalNotifications.addListener("localNotificationActionPerformed", async (event) => {
      const actionId = event.actionId;
      const respuesta = event?.inputValue;
      const notifId = event?.notification?.extra?.notificationId || event?.notification?.id;

      if (actionId === "reply" && respuesta && notifId) {
        try {
          await authFetch(`${serverUrl}/notificaciones/${notifId}/respuesta`, {
            method: "POST",
            body: JSON.stringify({ respuesta }),
          });
          await cargarNotificaciones();
        } catch (err) {
          console.warn("Error enviando respuesta:", err);
        }
      }
    });

    return () => {
      registrationHandler?.remove();
      pushReceivedHandler?.remove();
      pushActionHandler?.remove();
      localActionHandler?.remove();
    };
  }, [user, isNative, serverUrl]);

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
      // Solo procesar si es para este usuario
      if (data.usuario_id === user.id) {
        cargarNotificaciones();
        // Reproducir sonido único de PINA
        reproducirSonidoPINA();
        // Mostrar en barra del dispositivo (solo app nativa)
        mostrarNotificacionDispositivo({
          id: data.id,
          titulo: data.titulo,
          mensaje: data.mensaje,
          data: data.data || {},
        });
      }
    };

    socket.on("nueva_notificacion", handleNuevaNotificacion);

    return () => {
      if (socket) {
        socket.off("nueva_notificacion", handleNuevaNotificacion);
      }
    };
  }, [user]);

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
      
      // Reproducir sonido único de PINA cuando se agrega una notificación
      reproducirSonidoPINA();

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
      // Actualizar estado local
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      // Si la notificación no existe (404), es válido - ya fue eliminada
      // Solo loguear si no es un 404
      if (err.status !== 404 && !err.isNotFound) {
        console.error("Error eliminando notificación:", err);
      }
      // En cualquier caso, eliminar del estado local (puede que ya no exista en el servidor)
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }
  };

  const clearAll = async () => {
    try {
      await authFetch(`${serverUrl}/notificaciones`, {
        method: "DELETE",
      });
      // Recargar para obtener solo confirmaciones activas
      await cargarNotificaciones();
    } catch (err) {
      console.error("Error limpiando notificaciones:", err);
      // Si falla, limpiar solo en memoria
      setNotifications([]);
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
      {user && (
        <>
        {/* Botón superior oculto - ahora está en el menú inferior */}
        <div className="notifications-container" style={{ display: 'none' }}>
        <button
          className="notifications-bell"
          onClick={() => {
            activarAudioContextFn();
            setIsOpen(!isOpen);
          }}
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
              {notifications.filter((n) => {
                if (n.adminOnly && !isAdmin) return false;
                if (n.codeError && !isDeveloper) return false;
                return true;
              }).length > 0 && (
                <button
                  className="notifications-clear"
                  onClick={clearAll}
                  title="Limpiar todas"
                >
                  🗑️
                </button>
              )}
            </div>
            <div className="notifications-list">
              {loading ? (
                <div className="notifications-empty">Cargando...</div>
              ) : (
                (() => {
                  const filteredNotifications = notifications.filter((notification) => {
                  // Mostrar todas las notificaciones excepto:
                  // - Las marcadas como adminOnly si no es admin
                  // - Las marcadas como codeError si no es developer
                  if (notification.adminOnly && !isAdmin) return false;
                  if (notification.codeError && !isDeveloper) return false;
                  return true;
                });

                return filteredNotifications.length === 0 ? (
                  <div className="notifications-empty">
                    No hay notificaciones
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
                      // Marcar como leída en el servidor
                      try {
                        await authFetch(`${serverUrl}/notificaciones/${notification.id}/leida`, {
                          method: "PUT",
                        });
                        setNotifications((prev) =>
                          prev.map((n) =>
                            n.id === notification.id ? { ...n, read: true } : n
                          )
                        );
                      } catch (err) {
                        console.error("Error marcando notificación como leída:", err);
                        // Si falla, marcar solo en memoria
                        setNotifications((prev) =>
                          prev.map((n) =>
                            n.id === notification.id ? { ...n, read: true } : n
                          )
                        );
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
