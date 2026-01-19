import React, { useState, useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { authFetch, useAuth } from "../AuthContext";
import "./ChatPro.css";
import { useAlert } from "./AlertModal";
import { getServerUrl, getServerUrlSync } from "../config/server";

export default function ChatPro({ socket, user, onClose }) {
  const [serverUrl, setServerUrl] = useState(null);
  const { perms, token } = useAuth();
  
  // Cargar URL del servidor de forma asíncrona
  useEffect(() => {
    const loadServerUrl = async () => {
      const url = await getServerUrl();
      setServerUrl(url);
    };
    loadServerUrl();
  }, []);
  
  const SERVER_URL = serverUrl || getServerUrlSync();
  const { showAlert, showConfirm } = useAlert();
  const esAdmin = perms?.includes("tab:admin");
  const [open, setOpen] = useState(onClose ? true : false); // Si viene del menú, abrir automáticamente
  
  // Si viene del menú, abrir automáticamente
  useEffect(() => {
    if (onClose) {
      setOpen(true);
    }
  }, [onClose]);
  const [tabPrincipal, setTabPrincipal] = useState("usuarios");
  const [tipoChat, setTipoChat] = useState(null);
  const [chatActual, setChatActual] = useState(null);

  const [usuariosIxora, setUsuariosIxora] = useState([]);
  const [usuariosActivos, setUsuariosActivos] = useState([]);
  const [chatsActivos, setChatsActivos] = useState([]);
  const [grupos, setGrupos] = useState([]);

  const [mensajesGeneral, setMensajesGeneral] = useState([]);
  const [mensajesPrivado, setMensajesPrivado] = useState({});
  const [mensajesGrupal, setMensajesGrupal] = useState({});

  const [mensajeInput, setMensajeInput] = useState("");
  const [noLeidos, setNoLeidos] = useState(0);
  const [filtroUsuarios, setFiltroUsuarios] = useState("");
  const [perfilAbierto, setPerfilAbierto] = useState(false);
  const [perfilTab, setPerfilTab] = useState("info");
  const [perfilData, setPerfilData] = useState(null);
  const [perfilCompartidos, setPerfilCompartidos] = useState([]);
  const [perfilCargando, setPerfilCargando] = useState(false);
  const [perfilError, setPerfilError] = useState(null);
  const [perfilCompartidosTab, setPerfilCompartidosTab] = useState("imagenes");
  const [previewItem, setPreviewItem] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewTextContent, setPreviewTextContent] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  const [nuevoGrupoNombre, setNuevoGrupoNombre] = useState("");
  const [nuevoGrupoDesc, setNuevoGrupoDesc] = useState("");
  const [nuevoGrupoEsPublico, setNuevoGrupoEsPublico] = useState(true);
  const [mostrarCrearGrupo, setMostrarCrearGrupo] = useState(false);
  const [mostrarAgregarMiembros, setMostrarAgregarMiembros] = useState(false);
  const [grupoAgregarMiembros, setGrupoAgregarMiembros] = useState(null);
  const [grupoMenuAbierto, setGrupoMenuAbierto] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [editandoGrupo, setEditandoGrupo] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [grupoEditNombre, setGrupoEditNombre] = useState("");
  // eslint-disable-next-line no-unused-vars
  const [grupoEditDesc, setGrupoEditDesc] = useState("");
  // eslint-disable-next-line no-unused-vars
  const [grupoEditPublico, setGrupoEditPublico] = useState(true);

  // Estados para funcionalidades avanzadas tipo Slack
  const [archivoAdjunto, setArchivoAdjunto] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [archivoSubiendo, setArchivoSubiendo] = useState(false);
  const [editandoMensaje, setEditandoMensaje] = useState(null);
  const [textoEdicion, setTextoEdicion] = useState("");
  const [mostrarSugerenciasMencion, setMostrarSugerenciasMencion] = useState(false);
  const [sugerenciasMencion, setSugerenciasMencion] = useState([]);
  const [posicionMencion, setPosicionMencion] = useState(0);
  const [configNotificaciones, setConfigNotificaciones] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [reacciones, setReacciones] = useState({});
  const [mostrarToolbarFormato, setMostrarToolbarFormato] = useState(true);
  const [mostrarAdjuntosMobile, setMostrarAdjuntosMobile] = useState(false);
  const [galeriaThumbs, setGaleriaThumbs] = useState([]);
  const [menuMensaje, setMenuMensaje] = useState(null);
  const [lecturasPrivadas, setLecturasPrivadas] = useState({});
  const [respondiendoMensaje, setRespondiendoMensaje] = useState(null);
  const [reenviarMensaje, setReenviarMensaje] = useState(null);
  const [mostrarReenvio, setMostrarReenvio] = useState(false);
  const [mensajeFijado, setMensajeFijado] = useState(null);
  const [mensajesDestacados, setMensajesDestacados] = useState(new Set());
  const [emojiUso, setEmojiUso] = useState({});
  const [menuEmojiAbierto, setMenuEmojiAbierto] = useState(false);
  const [inputEmojiAbierto, setInputEmojiAbierto] = useState(false);
  const [seleccionModo, setSeleccionModo] = useState(false);
  const [seleccionMensajes, setSeleccionMensajes] = useState(new Set());
  const [modalLinkAbierto, setModalLinkAbierto] = useState(false);
  const [modalLinkTexto, setModalLinkTexto] = useState("");
  const [modalLinkUrl, setModalLinkUrl] = useState("");
  const [callActivo, setCallActivo] = useState(false);
  const [callIncoming, setCallIncoming] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [callMuted, setCallMuted] = useState(false);
  const [callVideoOff, setCallVideoOff] = useState(false);
  const [rtcConfig, setRtcConfig] = useState({ iceServers: [] });

  const chatBodyRef = useRef(null);
  const audioContextRef = useRef(null);
  const cargandoChatsActivosRef = useRef(false);
  const mensajeInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const gifInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const longPressTimeoutRef = useRef(null);
  const touchMovedRef = useRef(false);
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const remoteStreamsRef = useRef({});
  const pendingCandidatesRef = useRef({});
  const callRoomRef = useRef(null);

  // ===== SONIDOS ÚNICOS DE IXORA PARA CHAT =====
  const sonidoPatterns = {
    "ixora-pulse": { type: "sine", notes: [{ f: 520, d: 0.12 }, { f: 650, d: 0.12 }, { f: 520, d: 0.12 }] },
    "ixora-wave": { type: "triangle", notes: [{ f: 440, d: 0.18 }, { f: 520, d: 0.18 }] },
    "ixora-alert": { type: "square", notes: [{ f: 740, d: 0.1 }, { f: 740, d: 0.1 }, { f: 880, d: 0.18 }] },
    "ixora-call": { type: "sine", notes: [{ f: 620, d: 0.45 }, { f: 540, d: 0.45 }, { f: 620, d: 0.45 }] },
    "ixora-call-group": { type: "sine", notes: [{ f: 600, d: 0.5 }, { f: 520, d: 0.5 }, { f: 600, d: 0.5 }] },
    "ixora-soft": { type: "sine", notes: [{ f: 360, d: 0.2 }, { f: 420, d: 0.2 }] },
    "ixora-digital": { type: "square", notes: [{ f: 880, d: 0.08 }, { f: 990, d: 0.08 }, { f: 880, d: 0.08 }, { f: 1180, d: 0.12 }] },
    "ixora-picking": { type: "triangle", notes: [{ f: 500, d: 0.1 }, { f: 600, d: 0.1 }, { f: 500, d: 0.1 }] },
    "ixora-surtido": { type: "sine", notes: [{ f: 660, d: 0.16 }, { f: 780, d: 0.16 }, { f: 720, d: 0.18 }] },
  };

  const reproducirSonido = (soundKey = "ixora-pulse") => {
    if (soundKey === "silencio") return;
    const pattern = sonidoPatterns[soundKey] || sonidoPatterns["ixora-pulse"];
    if (!pattern) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      let audioCtx = audioContextRef.current;
      if (!audioCtx || audioCtx.state === "closed") {
        audioCtx = new AudioContextClass();
        audioContextRef.current = audioCtx;
      }
      const play = () => {
        const ctx = audioCtx;
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        gain.connect(ctx.destination);
        let t = ctx.currentTime + 0.02;
        pattern.notes.forEach((note, idx) => {
          const osc = ctx.createOscillator();
          osc.type = pattern.type;
          osc.frequency.setValueAtTime(note.f, t);
          osc.connect(gain);
          const attack = 0.02;
          const release = 0.08;
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.linearRampToValueAtTime(0.18, t + attack);
          gain.gain.linearRampToValueAtTime(0.0001, t + note.d - release);
          osc.start(t);
          osc.stop(t + note.d);
          t += note.d + (idx === pattern.notes.length - 1 ? 0 : 0.04);
        });
      };
      if (audioCtx.state === "suspended") {
        audioCtx.resume().then(play).catch(() => {});
        return;
      }
      play();
    } catch (_) {
      // Ignorar errores silenciosamente
    }
  };

  const getAvatarUrl = (usuarioObj) => {
    if (!usuarioObj) {
      return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23e0e0e0'/%3E%3Ctext x='16' y='22' font-size='20' text-anchor='middle' fill='%23999'%3E👤%3C/text%3E%3C/svg%3E";
    }
    
    if (usuarioObj.photo) {
      const serverUrl = SERVER_URL;
      // 🔥 Cache-busting para evitar fotos antiguas
      const cacheKey = usuarioObj.photoTimestamp || usuarioObj.id || Date.now();
      
      if (usuarioObj.photo.startsWith("http")) {
        return `${usuarioObj.photo}?t=${cacheKey}`;
      }
      
      // Si empieza con /uploads, agregar el serverUrl
      if (usuarioObj.photo.startsWith("/uploads")) {
        return `${serverUrl}${usuarioObj.photo}?t=${cacheKey}`;
      }
      
      // Si es solo el nombre del archivo (ej: "user_1.jpg"), construir la ruta completa
      // Las fotos se guardan en uploads/perfiles/
      return `${serverUrl}/uploads/perfiles/${usuarioObj.photo}?t=${cacheKey}`;
    }
    
    // Avatar por defecto si no hay foto
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23e0e0e0'/%3E%3Ctext x='16' y='22' font-size='20' text-anchor='middle' fill='%23999'%3E👤%3C/text%3E%3C/svg%3E";
  };

  const getColorForName = (nickname) => {
    if (!nickname || typeof nickname !== 'string') {
      return "#666"; // Color por defecto si nickname es null/undefined
    }
    const colors = ["#0aa36c", "#007bff", "#9b59b6", "#e67e22", "#16a085"];
    let hash = 0;
    for (let i = 0; i < nickname.length; i++) {
      hash = nickname.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // Función para activar el AudioContext (reutilizable)
  const activarAudioContext = useRef(() => {
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
      activarAudioContext();
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
  }, [activarAudioContext]);

  // ============================
  // 👤 Cargar usuarios de IXORA
  // ============================
  useEffect(() => {
    if (!open) return;

    const cargarUsuarios = async () => {
      try {
        const data = await authFetch(`${SERVER_URL}/chat/usuarios`);
        setUsuariosIxora(data || []);
      } catch (e) {
        console.error("Error cargando usuarios:", e);
      }
    };

    cargarUsuarios();
  }, [open]);

  // ============================
  // 👤 Usuarios activos (socket)
  // ============================
  useEffect(() => {
    if (!socket || !user) return;
    
    // Usar nickname si existe, si no usar name
    const userDisplayName = user.nickname || user.name;
    if (!userDisplayName) return;

    socket.emit("login_chat", {
      nickname: userDisplayName,
      photo: user.photo || null,
    });

    const handleUsuarios = (lista) => {
      const filtrados = lista.filter((u) => u.nickname !== userDisplayName);
      setUsuariosActivos(filtrados);
    };

    socket.on("usuarios_activos", handleUsuarios);

    // Cargar chats activos y mensajes de IXORA cuando el usuario se loguea
    // Esto asegura que los mensajes de OTP aparezcan aunque no estuviera conectado cuando se enviaron
    const cargarChatsYOTP = async () => {
      // Evitar solicitudes duplicadas simultáneas
      if (cargandoChatsActivosRef.current) {
        return;
      }
      
      cargandoChatsActivosRef.current = true;
      
      try {
        const data = await authFetch(`${SERVER_URL}/chat/activos`);
        setChatsActivos(data || []);
        
        // Si hay un chat con IXORA, cargar los mensajes automáticamente
        const chatIxora = data?.find(c => c.otro_usuario === "IXORA");
        if (chatIxora) {
          try {
            const mensajesIxora = await authFetch(`${SERVER_URL}/chat/privado/IXORA`);
            const mensajesOrdenados = (mensajesIxora || []).sort((a, b) => {
              const fechaA = new Date(a.fecha || 0);
              const fechaB = new Date(b.fecha || 0);
              return fechaA - fechaB;
            });
            setMensajesPrivado((prev) => ({
              ...prev,
              "IXORA": mensajesOrdenados,
            }));
            
            // Si hay mensajes de IXORA y el usuario es admin, mostrar notificación
            if (mensajesOrdenados.length > 0 && esAdmin) {
              const ultimoMensaje = mensajesOrdenados[mensajesOrdenados.length - 1];
              // Verificar si el mensaje es reciente (últimos 10 minutos) para evitar notificaciones de mensajes antiguos
              const fechaMensaje = new Date(ultimoMensaje.fecha || 0);
              const ahora = new Date();
              const minutosDiferencia = (ahora - fechaMensaje) / (1000 * 60);
              
              if (ultimoMensaje && ultimoMensaje.mensaje.includes("código de acceso") && minutosDiferencia < 10) {
                // Mostrar notificación del navegador
                if ("Notification" in window && Notification.permission === "granted") {
                  new Notification("📱 Mensaje de IXORA", {
                    body: ultimoMensaje.mensaje || "Tienes un nuevo mensaje de IXORA",
                    icon: "/favicon.ico",
                    tag: "ixora-otp",
                    requireInteraction: false
                  });
                } else if ("Notification" in window && Notification.permission === "default") {
                  Notification.requestPermission().then((permission) => {
                    if (permission === "granted") {
                      new Notification("📱 Mensaje de IXORA", {
                        body: ultimoMensaje.mensaje || "Tienes un nuevo mensaje de IXORA",
                        icon: "/favicon.ico",
                        tag: "ixora-otp"
                      });
                    }
                  });
                }
                
                // Incrementar contador de no leídos
                setNoLeidos((n) => n + 1);
              }
            }
          } catch (e) {
            // Si es 404, simplemente no hay mensajes aún (normal)
            if (e.status !== 404 && !e.isNotFound) {
              console.error("Error cargando mensajes de IXORA al iniciar sesión:", e);
            }
          }
        }
      } catch (e) {
        console.error("Error cargando chats activos al iniciar sesión:", e);
      } finally {
        cargandoChatsActivosRef.current = false;
      }
    };

    // Cargar después de un pequeño delay para asegurar que el socket esté completamente configurado
    setTimeout(cargarChatsYOTP, 1000);

    return () => socket.off("usuarios_activos", handleUsuarios);
  }, [socket, user, esAdmin]);

  // ============================
  // 💬 Cargar mensajes generales
  // ============================
  useEffect(() => {
    if (!open || tipoChat !== "general") return;

    const cargarMensajes = async () => {
      try {
        const data = await authFetch(`${SERVER_URL}/chat/general`);
        // Simplemente establecer los mensajes del servidor (sin temporales)
        setMensajesGeneral((data || []).sort((a, b) => {
          const fechaA = new Date(a.fecha || 0);
          const fechaB = new Date(b.fecha || 0);
          return fechaA - fechaB;
        }));
      } catch (e) {
        console.error("Error cargando mensajes generales:", e);
      }
    };

    cargarMensajes();
  }, [open, tipoChat]);

  // ============================
  // 💬 Cargar mensajes privados
  // ============================
  useEffect(() => {
    if (!open || tipoChat !== "privado" || !chatActual) return;

    const cargarMensajes = async () => {
      try {
        const data = await authFetch(`/chat/privado/${chatActual}`);
        // Simplemente establecer los mensajes del servidor (sin temporales)
        const mensajesOrdenados = (data || []).sort((a, b) => {
          const fechaA = new Date(a.fecha || 0);
          const fechaB = new Date(b.fecha || 0);
          return fechaA - fechaB;
        });
        setMensajesPrivado((prev) => ({
          ...prev,
          [chatActual]: mensajesOrdenados,
        }));
        // Cargar lecturas
        const lecturas = {};
        mensajesOrdenados.forEach((m) => {
          if (m.fecha_leido_otro) {
            lecturas[String(m.id)] = m.fecha_leido_otro;
          }
        });
        if (Object.keys(lecturas).length > 0) {
          setLecturasPrivadas((prev) => ({ ...prev, ...lecturas }));
        }
      } catch (e) {
        console.error("Error cargando mensajes privados:", e);
      }
    };

    cargarMensajes();
  }, [open, tipoChat, chatActual]);

  // ============================
  // 💬 Cargar mensajes grupales
  // ============================
  useEffect(() => {
    if (!open || tipoChat !== "grupal" || !chatActual) return;

    const cargarMensajes = async () => {
      try {
        const data = await authFetch(`/chat/grupos/${chatActual}/mensajes`);
        // Simplemente establecer los mensajes del servidor (sin temporales)
        const mensajesOrdenados = (data || []).sort((a, b) => {
          const fechaA = new Date(a.fecha || 0);
          const fechaB = new Date(b.fecha || 0);
          return fechaA - fechaB;
        });
        setMensajesGrupal((prev) => ({
          ...prev,
          [chatActual]: mensajesOrdenados,
        }));
      } catch (e) {
        console.error("Error cargando mensajes grupales:", e);
      }
    };

    cargarMensajes();
  }, [open, tipoChat, chatActual]);

  // ============================
  // 💬 Cargar chats activos (cuando el chat está abierto)
  // ============================
  useEffect(() => {
    if (!open) return;

    const cargarChatsActivos = async (force = false) => {
      // Evitar solicitudes duplicadas simultáneas
      if (cargandoChatsActivosRef.current && !force) {
        return;
      }
      
      cargandoChatsActivosRef.current = true;
      
      try {
        const data = await authFetch(`${SERVER_URL}/chat/activos`);
        setChatsActivos(data || []);
        
        // Si hay un chat con IXORA, SIEMPRE cargar los mensajes automáticamente
        const chatIxora = data?.find(c => c.otro_usuario === "IXORA");
        if (chatIxora) {
          try {
            const mensajesIxora = await authFetch(`${SERVER_URL}/chat/privado/IXORA`);
            const mensajesOrdenados = (mensajesIxora || []).sort((a, b) => {
              const fechaA = new Date(a.fecha || 0);
              const fechaB = new Date(b.fecha || 0);
              return fechaA - fechaB;
            });
            setMensajesPrivado((prev) => ({
              ...prev,
              "IXORA": mensajesOrdenados,
            }));
            console.log(`✅ [Chat] Mensajes de IXORA cargados: ${mensajesOrdenados.length} mensajes`);
          } catch (e) {
            // Si es 404, simplemente no hay mensajes aún (normal)
            if (e.status !== 404 && !e.isNotFound) {
              console.error("Error cargando mensajes de IXORA:", e);
            }
          }
        }
      } catch (e) {
        console.error("Error cargando chats activos:", e);
      } finally {
        cargandoChatsActivosRef.current = false;
      }
    };

    // Cargar al abrir el chat
    cargarChatsActivos(true);
    
    // Recargar cada 30 segundos para actualizar contadores (reducido de 5 segundos)
    const interval = setInterval(() => cargarChatsActivos(false), 30000);
    return () => clearInterval(interval);
  }, [open]);

  // ============================
  // 💬 Cargar grupos
  // ============================
  useEffect(() => {
    if (!open || tabPrincipal !== "grupos") return;

    const cargarGrupos = async () => {
      try {
        const data = await authFetch("/chat/grupos/mios");
        setGrupos(data || []);
      } catch (e) {
        console.error("Error cargando grupos:", e);
      }
    };

    cargarGrupos();
  }, [open, tabPrincipal]);

  useEffect(() => {
    if (!open) return;
    const cargarConfigNotificaciones = async () => {
      try {
        const config = await authFetch(`${SERVER_URL}/chat/notificaciones/config`);
        setConfigNotificaciones(config || null);
      } catch (err) {
        console.error("Error cargando configuración de notificaciones:", err);
      }
    };
    cargarConfigNotificaciones();
  }, [open, SERVER_URL]);

  useEffect(() => {
    if (!open) return;
    const cargarRtcConfig = async () => {
      try {
        const data = await authFetch(`${SERVER_URL}/chat/rtc-config`);
        if (data?.iceServers?.length) {
          setRtcConfig(data);
        } else {
          setRtcConfig({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        }
      } catch (err) {
        setRtcConfig({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      }
    };
    cargarRtcConfig();
  }, [open, SERVER_URL]);

  // ============================
  // 📨 Recibir mensajes (socket)
  // ============================
  useEffect(() => {
    if (!socket) return;
    
    // Obtener el nombre de usuario una vez al inicio
    const userDisplayName = user?.nickname || user?.name;

    // Limpiar listeners anteriores antes de registrar nuevos
    socket.off("chat_general_nuevo");
    socket.off("chat_privado_nuevo");
    socket.off("chat_grupal_nuevo");
    socket.off("chat_grupo_creado");
    socket.off("chats_activos_actualizados");

    // Handler para actualizar chats activos cuando hay cambios (definir primero)
    const handleChatsActivosActualizados = async () => {
      // Evitar solicitudes duplicadas simultáneas
      if (cargandoChatsActivosRef.current) {
        return;
      }
      
      cargandoChatsActivosRef.current = true;
      
      try {
        const data = await authFetch(`${SERVER_URL}/chat/activos`);
        setChatsActivos(data || []);
        
        // Si hay un mensaje de IXORA y el chat está abierto y estamos viendo IXORA, 
        // recargar los mensajes para asegurar que se muestren todos
        const chatIxora = data?.find(c => c.otro_usuario === "IXORA");
        if (chatIxora && open && tipoChat === "privado" && chatActual === "IXORA") {
          try {
            const mensajesIxora = await authFetch(`${SERVER_URL}/chat/privado/IXORA`);
            const mensajesOrdenados = (mensajesIxora || []).sort((a, b) => {
              const fechaA = new Date(a.fecha || 0);
              const fechaB = new Date(b.fecha || 0);
              return fechaA - fechaB;
            });
            setMensajesPrivado((prev) => ({
              ...prev,
              "IXORA": mensajesOrdenados,
            }));
          } catch (e) {
            console.error("Error recargando mensajes de IXORA:", e);
          }
        }
      } catch (e) {
        console.error("Error recargando chats activos:", e);
      } finally {
        cargandoChatsActivosRef.current = false;
      }
    };

    // Mensaje general
    const handleGeneral = (mensaje) => {
      console.log("[Chat] Mensaje general recibido:", mensaje);
      setMensajesGeneral((prev) => {
        // Evitar duplicados: verificar si el mensaje ya existe por ID
        const existe = prev.some((m) => m.id === mensaje.id);
        if (existe) {
          console.log("[Chat] Mensaje ya existe, ignorando");
          return prev;
        }
        
        // Verificar si es un mensaje nuestro (optimistic update) que debemos reemplazar
        const esNuestroMensaje = mensaje.usuario_nickname === userDisplayName;
        
        // Si es nuestro mensaje, simplemente agregarlo (ya no hay temporales)
        if (esNuestroMensaje) {
          console.log("[Chat] Agregando nuestro mensaje real");
          return [...prev, mensaje].sort((a, b) => {
            const fechaA = new Date(a.fecha || 0).getTime();
            const fechaB = new Date(b.fecha || 0).getTime();
            return fechaA - fechaB;
          });
        }
        
        // Si no es nuestro mensaje, simplemente agregarlo
        return [...prev, mensaje];
      });
      const esNuestroMensaje = mensaje.usuario_nickname === userDisplayName;
      if (!esNuestroMensaje && (!open || tipoChat !== "general")) {
        setNoLeidos((n) => n + 1);
        if (
          configNotificaciones?.sonido_activo !== 0 &&
          estaDentroHorario(configNotificaciones)
        ) {
          reproducirSonido(configNotificaciones?.sonido_mensaje || "ixora-pulse");
        }
      }
    };

    // Mensaje privado
    const handlePrivado = (mensaje) => {
      console.log("[Chat] Mensaje privado recibido:", mensaje);
      const otroUsuario =
        mensaje.de_nickname === userDisplayName
          ? mensaje.para_nickname
          : mensaje.de_nickname;

      setMensajesPrivado((prev) => {
        const mensajesExistentes = prev[otroUsuario] || [];
        
        // Evitar duplicados: verificar si el mensaje ya existe por ID
        if (mensajesExistentes.some((m) => m.id === mensaje.id)) {
          console.log("[Chat] Mensaje privado ya existe, ignorando");
          return prev;
        }
        
        // Verificar si es un mensaje nuestro (optimistic update) que debemos reemplazar
        const esNuestroMensaje = mensaje.de_nickname === userDisplayName;
        
        // Si es nuestro mensaje, simplemente agregarlo (ya no hay temporales)
        if (esNuestroMensaje) {
          console.log("[Chat] Agregando nuestro mensaje privado real");
          return {
            ...prev,
            [otroUsuario]: [...mensajesExistentes, mensaje].sort((a, b) => {
              const fechaA = new Date(a.fecha || 0).getTime();
              const fechaB = new Date(b.fecha || 0).getTime();
              return fechaA - fechaB;
            }),
          };
        }
        
        // Si no es nuestro mensaje, simplemente agregarlo
        const nuevos = [...mensajesExistentes, mensaje].sort((a, b) => {
          const fechaA = new Date(a.fecha || 0).getTime();
          const fechaB = new Date(b.fecha || 0).getTime();
          return fechaA - fechaB;
        });
        return {
          ...prev,
          [otroUsuario]: nuevos,
        };
      });

      // Si es un mensaje de IXORA, SIEMPRE recargar chats activos y cambiar a pestaña "chats"
      if (mensaje.de_nickname === "IXORA") {
        // Recargar chats activos para asegurar que IXORA aparezca en la lista
        if (!cargandoChatsActivosRef.current) {
          cargandoChatsActivosRef.current = true;
          authFetch(`${SERVER_URL}/chat/activos`)
            .then((data) => {
              setChatsActivos(data || []);
            })
            .catch((e) => {
              console.error("Error recargando chats activos:", e);
            })
            .finally(() => {
              cargandoChatsActivosRef.current = false;
            });
        }
        
        // Si el chat está abierto pero no estamos en el chat con IXORA, cambiar a ese chat
        if (open && chatActual !== "IXORA") {
          setTabPrincipal("chats");
          setTipoChat("privado");
          setChatActual("IXORA");
        } else if (!open) {
          // Si el chat no está abierto, cambiar a pestaña chats cuando se abra
          setTabPrincipal("chats");
        }
        
        // SIEMPRE mostrar notificación para mensajes de IXORA (todos los usuarios)
        // Reproducir sonido de notificación
        if (
          configNotificaciones?.sonido_activo !== 0 &&
          estaDentroHorario(configNotificaciones)
        ) {
          reproducirSonido(configNotificaciones?.sonido_mensaje || "ixora-pulse");
        }
        
        // Mostrar notificación del navegador si está disponible
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("📱 Mensaje de IXORA", {
            body: mensaje.mensaje || "Tienes un nuevo mensaje de IXORA",
            icon: "/favicon.ico",
            tag: "ixora-otp",
            requireInteraction: false
          });
        } else if ("Notification" in window && Notification.permission === "default") {
          // Solicitar permiso para notificaciones
          Notification.requestPermission().then((permission) => {
            if (permission === "granted") {
              new Notification("📱 Mensaje de IXORA", {
                body: mensaje.mensaje || "Tienes un nuevo mensaje de IXORA",
                icon: "/favicon.ico",
                tag: "ixora-otp"
              });
            }
          });
        }
        
        // Incrementar contador de no leídos si el chat no está abierto o no estamos viendo IXORA
        if (!open || chatActual !== "IXORA") {
          setNoLeidos((n) => n + 1);
        }
      }

      // Actualizar chats activos
      setChatsActivos((prev) => {
        const existe = prev.some((c) => c.otro_usuario === otroUsuario);
        const esMioMensaje = mensaje.de_nickname === userDisplayName;
        const viendoEste = open && tipoChat === "privado" && chatActual === otroUsuario;
        // Si es mensaje de IXORA para admin, siempre contar como no leído hasta que se abra
        const esMensajeIXORAAdmin = mensaje.de_nickname === "IXORA" && esAdmin && mensaje.es_admin;
        
        if (existe) {
          return prev.map((c) => {
            if (c.otro_usuario === otroUsuario) {
              // Si estás viendo este chat, limpiar contador a 0 (excepto si es IXORA para admin)
              // Si es tu mensaje, también poner a 0
              const nuevosNoLeidos = (viendoEste && !esMensajeIXORAAdmin) || (esMioMensaje && !esMensajeIXORAAdmin)
                ? 0  // Limpiar a 0 si estás viendo el chat o es tu mensaje
                : (c.mensajes_no_leidos || 0) + 1;
              return {
                ...c,
                ultimo_mensaje: mensaje.mensaje,
                ultima_fecha: mensaje.fecha,
                ultimo_remitente: mensaje.de_nickname,
                mensajes_no_leidos: nuevosNoLeidos,
              };
            }
            return c;
          });
        }
        // Si no existe el chat en la lista, agregarlo
        return [
          {
            otro_usuario: otroUsuario,
            ultimo_mensaje: mensaje.mensaje,
            ultima_fecha: mensaje.fecha,
            ultimo_remitente: mensaje.de_nickname,
            mensajes_no_leidos: (viendoEste && !esMensajeIXORAAdmin) || (esMioMensaje && !esMensajeIXORAAdmin) ? 0 : 1,
          },
          ...prev,
        ];
      });

      const viendoEste = open && tipoChat === "privado" && chatActual === otroUsuario;
      // Solo reproducir sonido e incrementar contador si NO estás viendo el chat
      // Y si es mensaje de IXORA para admin, siempre notificar
      const esMensajeIXORAAdmin = mensaje.de_nickname === "IXORA" && esAdmin && mensaje.es_admin;
      
      // Si estás viendo este chat, marcar el mensaje como leído inmediatamente en el servidor
      if (viendoEste && !esMensajeIXORAAdmin) {
        authFetch(`${SERVER_URL}/chat/privado/${otroUsuario}/leer`, {
          method: "POST",
        }).catch((e) => {
          console.error("Error marcando mensaje como leído:", e);
        });
      }
      
      if (!viendoEste || esMensajeIXORAAdmin) {
        if (esMensajeIXORAAdmin || !viendoEste) {
          setNoLeidos((n) => n + 1);
          if (
            configNotificaciones?.sonido_activo !== 0 &&
            estaDentroHorario(configNotificaciones)
          ) {
            reproducirSonido(configNotificaciones?.sonido_mensaje || "ixora-pulse");
          }
        }
      }
    };

    // Mensaje grupal
    const handleGrupal = (mensaje) => {
      console.log("[Chat] Mensaje grupal recibido:", mensaje);
      setMensajesGrupal((prev) => {
        const mensajesExistentes = prev[mensaje.grupo_id] || [];
        
        // Evitar duplicados: verificar si el mensaje ya existe por ID
        const existe = mensajesExistentes.some((m) => m.id === mensaje.id);
        if (existe) {
          console.log("[Chat] Mensaje grupal ya existe, ignorando");
          return prev;
        }
        
        // Verificar si es un mensaje nuestro (optimistic update) que debemos reemplazar
        const esNuestroMensaje = mensaje.usuario_nickname === userDisplayName;
        
        // Si es nuestro mensaje, simplemente agregarlo (ya no hay temporales)
        if (esNuestroMensaje) {
          console.log("[Chat] Agregando nuestro mensaje grupal real");
          return {
            ...prev,
            [mensaje.grupo_id]: [...mensajesExistentes, mensaje].sort((a, b) => {
              const fechaA = new Date(a.fecha || 0).getTime();
              const fechaB = new Date(b.fecha || 0).getTime();
              return fechaA - fechaB;
            }),
          };
        }
        
        // Si no es nuestro mensaje, simplemente agregarlo
        const nuevos = [...mensajesExistentes, mensaje].sort((a, b) => {
          const fechaA = new Date(a.fecha || 0).getTime();
          const fechaB = new Date(b.fecha || 0).getTime();
          return fechaA - fechaB;
        });
        return {
          ...prev,
          [mensaje.grupo_id]: nuevos,
        };
      });

      const viendoEste = open && tipoChat === "grupal" && chatActual === String(mensaje.grupo_id);
      const esNuestroMensaje = mensaje.usuario_nickname === userDisplayName;
      if (!esNuestroMensaje && !viendoEste) {
        setNoLeidos((n) => n + 1);
        if (
          configNotificaciones?.sonido_activo !== 0 &&
          estaDentroHorario(configNotificaciones)
        ) {
          reproducirSonido(configNotificaciones?.sonido_mensaje || "ixora-pulse");
        }
      }
    };

    // Actualizar grupos cuando se crea uno nuevo
    const handleGrupoCreado = async (grupo) => {
      // Recargar grupos
      try {
        const data = await authFetch("/chat/grupos/mios");
        setGrupos(data || []);
      } catch (e) {
        console.error("Error recargando grupos:", e);
      }
    };

    const handleGeneralBorrado = (payload) => {
      if (!payload?.id) return;
      setMensajesGeneral((prev) => prev.filter((m) => m.id !== payload.id));
    };

    const handlePrivadoBorrado = (payload) => {
      if (!payload?.id) return;
      const userDisplayName = user?.nickname || user?.name;
      const otroUsuario =
        payload.de_nickname === userDisplayName ? payload.para_nickname : payload.de_nickname;
      if (!otroUsuario) return;
      setMensajesPrivado((prev) => ({
        ...prev,
        [otroUsuario]: (prev[otroUsuario] || []).filter((m) => m.id !== payload.id),
      }));
    };

    const handleGrupalBorrado = (payload) => {
      if (!payload?.id || !payload?.grupo_id) return;
      const grupoId = String(payload.grupo_id);
      setMensajesGrupal((prev) => ({
        ...prev,
        [grupoId]: (prev[grupoId] || []).filter((m) => m.id !== payload.id),
      }));
    };

    const handlePrivadoLeidos = (payload) => {
      if (!payload?.mensajes || !Array.isArray(payload.mensajes)) return;
      const userDisplayName = user?.nickname || user?.name;
      if (payload.de_nickname !== userDisplayName) return;
      setLecturasPrivadas((prev) => {
        const next = { ...prev };
        payload.mensajes.forEach((m) => {
          if (!m?.mensaje_id) return;
          next[String(m.mensaje_id)] = m.fecha_leido || true;
        });
        return next;
      });
    };

    socket.on("chat_general_nuevo", handleGeneral);
    socket.on("chat_privado_nuevo", handlePrivado);
    socket.on("chat_grupal_nuevo", handleGrupal);
    socket.on("chat_grupo_creado", handleGrupoCreado);
    socket.on("chats_activos_actualizados", handleChatsActivosActualizados);
    socket.on("chat_general_borrado", handleGeneralBorrado);
    socket.on("chat_privado_borrado", handlePrivadoBorrado);
    socket.on("chat_grupal_borrado", handleGrupalBorrado);
    socket.on("chat_privado_leidos", handlePrivadoLeidos);

    return () => {
      socket.off("chat_general_nuevo", handleGeneral);
      socket.off("chat_privado_nuevo", handlePrivado);
      socket.off("chat_grupal_nuevo", handleGrupal);
      socket.off("chat_grupo_creado", handleGrupoCreado);
      socket.off("chats_activos_actualizados", handleChatsActivosActualizados);
      socket.off("chat_general_borrado", handleGeneralBorrado);
      socket.off("chat_privado_borrado", handlePrivadoBorrado);
      socket.off("chat_grupal_borrado", handleGrupalBorrado);
      socket.off("chat_privado_leidos", handlePrivadoLeidos);
    };
  }, [socket, open, tipoChat, chatActual, tabPrincipal, user, SERVER_URL, esAdmin, configNotificaciones]);

  useEffect(() => {
    if (!socket) return;
    const userDisplayName = user?.nickname || user?.name || "usuario";

    const handleInvite = (payload) => {
      if (!payload?.room) return;
      if (callActivo && callRoomRef.current === payload.room) return;
      setCallIncoming({
        room: payload.room,
        fromNickname: payload.fromNickname || "Usuario",
      });
    };

    const handleUsers = (payload) => {
      if (!payload?.room || callRoomRef.current !== payload.room) return;
      if (Array.isArray(payload.users)) {
        payload.users.forEach((u) => {
          if (u.socketId && u.socketId !== socket.id) {
            if (!peerConnectionsRef.current[u.socketId]) {
              peerConnectionsRef.current[u.socketId] = { pc: null, nickname: u.nickname || "Usuario" };
            } else if (u.nickname) {
              peerConnectionsRef.current[u.socketId].nickname = u.nickname;
            }
          }
        });
      }
    };

    const handleUserJoined = async (payload) => {
      if (!payload?.room || callRoomRef.current !== payload.room) return;
      if (!callActivo || payload.socketId === socket.id) return;
      const pc = crearPeerConnection(payload.socketId, payload.nickname || "Usuario");
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("call_offer", {
        to: payload.socketId,
        room: payload.room,
        sdp: offer,
        nickname: userDisplayName,
      });
    };

    const handleOffer = async (payload) => {
      if (!payload?.room || callRoomRef.current !== payload.room) return;
      if (!callActivo) return;
      const pc = crearPeerConnection(payload.from, payload.nickname || "Usuario");
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("call_answer", { to: payload.from, room: payload.room, sdp: answer });
    };

    const handleAnswer = async (payload) => {
      if (!payload?.room || callRoomRef.current !== payload.room) return;
      const pc = peerConnectionsRef.current[payload.from]?.pc;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    };

    const handleIce = async (payload) => {
      if (!payload?.room || callRoomRef.current !== payload.room) return;
      const candidate = new RTCIceCandidate(payload.candidate);
      const pc = peerConnectionsRef.current[payload.from]?.pc;
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(candidate).catch(() => {});
      } else {
        if (!pendingCandidatesRef.current[payload.from]) {
          pendingCandidatesRef.current[payload.from] = [];
        }
        pendingCandidatesRef.current[payload.from].push(candidate);
      }
    };

    const handleUserLeft = (payload) => {
      if (!payload?.room || callRoomRef.current !== payload.room) return;
      if (payload.socketId) limpiarPeer(payload.socketId);
    };

    socket.on("call_invite", handleInvite);
    socket.on("call_users", handleUsers);
    socket.on("call_user_joined", handleUserJoined);
    socket.on("call_offer", handleOffer);
    socket.on("call_answer", handleAnswer);
    socket.on("call_ice", handleIce);
    socket.on("call_user_left", handleUserLeft);

    return () => {
      socket.off("call_invite", handleInvite);
      socket.off("call_users", handleUsers);
      socket.off("call_user_joined", handleUserJoined);
      socket.off("call_offer", handleOffer);
      socket.off("call_answer", handleAnswer);
      socket.off("call_ice", handleIce);
      socket.off("call_user_left", handleUserLeft);
    };
  }, [socket, user, callActivo]);

  // ============================
  // ⬇ Scroll automático y marcar mensajes como leídos cuando se ven mensajes
  // ============================
  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
    
    // Marcar mensajes como leídos cuando se está viendo el chat
    // Esto asegura que el badge desaparezca cuando se abre el chat
    if (open && tipoChat === "privado" && chatActual) {
      // Limpiar contador localmente primero
      setChatsActivos((prev) =>
        prev.map((c) =>
          c.otro_usuario === chatActual ? { ...c, mensajes_no_leidos: 0 } : c
        )
      );
      
      // Marcar como leídos en el servidor
      authFetch(`${SERVER_URL}/chat/privado/${chatActual}/leer`, {
        method: "POST",
      })
        .then(() => {
          // Recargar chats activos para sincronizar
          return authFetch(`${SERVER_URL}/chat/activos`);
        })
        .then((data) => {
          setChatsActivos(data || []);
        })
        .catch((e) => {
          console.error("Error marcando mensajes como leídos:", e);
        });
    }

    if (open && tipoChat === "general") {
      authFetch(`${SERVER_URL}/chat/general/leer`, { method: "POST" }).catch(() => {});
    }

    if (open && tipoChat === "grupal" && chatActual) {
      authFetch(`${SERVER_URL}/chat/grupos/${chatActual}/leer`, { method: "POST" }).catch(() => {});
    }
  }, [mensajesGeneral, mensajesPrivado, mensajesGrupal, tipoChat, chatActual, open]);

  useEffect(() => {
    return () => {
      limpiarLlamada();
    };
  }, []);

  useEffect(() => {
    if (open && tipoChat) {
      cargarPinYDestacados();
    }
  }, [open, tipoChat, chatActual]);

  // ============================
  // 🟢 Abrir / Cerrar chat
  // ============================
  const abrirCerrarChat = () => {
    // Activar AudioContext cuando el usuario abre el chat (gesto del usuario)
    // Esto permite que los sonidos funcionen automáticamente cuando lleguen mensajes
    activarAudioContext();
    
    // Solicitar permiso para notificaciones del navegador (solo para admins)
    if (esAdmin && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {
        // Ignorar errores de solicitud de permiso
      });
    }
    
    if (!open) setNoLeidos(0);
    setOpen(!open);
    if (!open) {
      setTabPrincipal("usuarios");
      setTipoChat(null);
      setChatActual(null);
    }
  };

  // ============================
  // 📎 Funciones para archivos
  // ============================
  const subirArchivo = async (archivo) => {
    try {
      setArchivoSubiendo(true);
      const formData = new FormData();
      formData.append("archivo", archivo);

      const token = localStorage.getItem("token");
      const response = await fetch(`${SERVER_URL}/chat/archivo`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Error al subir archivo");
      }

      const data = await response.json();
      return data.archivo;
    } catch (err) {
      console.error("Error subiendo archivo:", err);
      showAlert("Error al subir el archivo", "error");
      return null;
    } finally {
      setArchivoSubiendo(false);
    }
  };


  // ============================
  // @ Detectar menciones
  // ============================
  const detectarMenciones = (texto) => {
    const mencionRegex = /@(\w+)/g;
    const menciones = [];
    let match;
    while ((match = mencionRegex.exec(texto)) !== null) {
      menciones.push(match[1]);
    }
    return menciones;
  };

  const escapeHtml = (texto = "") =>
    texto
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const formatearMensaje = (texto = "") => {
    let html = escapeHtml(texto);
    
    // Convertir URLs en enlaces clickeables (debe ir antes de otros reemplazos)
    // Regex mejorado para detectar URLs con o sin protocolo
    const urlRegex = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}[^\s<>"']*)/gi;
    html = html.replace(urlRegex, (url) => {
      try {
        // Agregar protocolo si no lo tiene
        let urlCompleta = url;
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          urlCompleta = `https://${url}`;
        }
        const urlObj = new URL(urlCompleta);
        const esExterno = urlObj.origin !== window.location.origin;
        return `<a href="${urlCompleta}" ${esExterno ? 'target="_blank" rel="noopener noreferrer"' : ''} class="msg-link-externo">${url}</a>`;
      } catch {
        return url; // Si no es una URL válida, dejarlo como está
      }
    });
    
    // Formato markdown
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__([^_]+)__/g, "<u>$1</u>");
    html = html.replace(/~~([^~]+)~~/g, "<s>$1</s>");
    html = html.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
    html = html.replace(/\n/g, "<br/>");
    return html;
  };

  const aplicarFormato = (prefijo, sufijo = prefijo) => {
    const input = mensajeInputRef.current;
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const seleccionado = mensajeInput.slice(start, end);
    const nuevo =
      mensajeInput.slice(0, start) +
      prefijo +
      seleccionado +
      sufijo +
      mensajeInput.slice(end);
    setMensajeInput(nuevo);
    requestAnimationFrame(() => {
      input.focus();
      const cursorStart = start + prefijo.length;
      const cursorEnd = cursorStart + seleccionado.length;
      input.setSelectionRange(cursorStart, cursorEnd);
    });
  };

  const insertarTexto = (texto) => {
    const input = mensajeInputRef.current;
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const nuevo =
      mensajeInput.slice(0, start) + texto + mensajeInput.slice(end);
    setMensajeInput(nuevo);
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + texto.length;
      input.setSelectionRange(pos, pos);
    });
  };

  const insertarLink = () => {
    const input = mensajeInputRef.current;
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const seleccionado = mensajeInput.slice(start, end) || "";
    setModalLinkTexto(seleccionado);
    setModalLinkUrl("");
    setModalLinkAbierto(true);
  };

  const insertarLista = (ordenada = false) => {
    insertarTexto(ordenada ? "1. " : "- ");
  };

  const insertarCita = () => {
    insertarTexto("> ");
  };

  const insertarLinkConfirmado = () => {
    const texto = modalLinkTexto.trim() || "enlace";
    const url = modalLinkUrl.trim();
    if (!url) {
      showAlert("Escribe un link válido.", "warning");
      return;
    }
    const input = mensajeInputRef.current;
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const nuevo =
      mensajeInput.slice(0, start) +
      `[${texto}](${url})` +
      mensajeInput.slice(end);
    setMensajeInput(nuevo);
    setModalLinkAbierto(false);
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + texto.length + url.length + 4;
      input.setSelectionRange(pos, pos);
    });
  };

  const manejarEnterLista = (e) => {
    const input = mensajeInputRef.current;
    if (!input) return false;
    const start = input.selectionStart || 0;
    const textoHastaCursor = mensajeInput.slice(0, start);
    const ultimaLinea = textoHastaCursor.split("\n").pop() || "";
    const matchOrdenada = ultimaLinea.match(/^(\d+)\.\s/);
    const matchNoOrdenada = ultimaLinea.match(/^-\s/);
    if (matchOrdenada) {
      e.preventDefault();
      const siguiente = Number(matchOrdenada[1]) + 1;
      insertarTexto(`\n${siguiente}. `);
      return true;
    }
    if (matchNoOrdenada) {
      e.preventDefault();
      insertarTexto("\n- ");
      return true;
    }
    return false;
  };

  const esMovil = () => {
    return window.innerWidth <= 767 || Capacitor.isNativePlatform();
  };

  const abrirAdjuntosMobile = () => {
    setMostrarAdjuntosMobile(true);
  };

  const cerrarAdjuntosMobile = () => {
    setMostrarAdjuntosMobile(false);
  };

  const adjuntarArchivo = (file) => {
    if (!file) return;
    setArchivoAdjunto(file);
    if (!mensajeInput.trim()) {
      setMensajeInput(`📎 ${file.name}\n`);
    }
  };

  const manejarGaleria = (files) => {
    if (!files || files.length === 0) return;
    const seleccion = Array.from(files);
    const thumbs = seleccion.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setGaleriaThumbs(thumbs);
    adjuntarArchivo(seleccion[0]);
  };

  const abrirGaleriaDispositivo = () => {
    imageInputRef.current?.click();
  };

  const abrirGrabacionVideo = () => {
    videoInputRef.current?.click();
  };

  const agregarGif = () => {
    gifInputRef.current?.click();
  };

  const abrirCamara = async () => {
    try {
      const foto = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
      });
      if (!foto?.webPath) return;
      const response = await fetch(foto.webPath);
      const blob = await response.blob();
      const file = new File([blob], `foto-${Date.now()}.jpg`, { type: blob.type });
      const thumb = { file, url: foto.webPath };
      setGaleriaThumbs([thumb]);
      setArchivoAdjunto(file);
      if (!mensajeInput.trim()) {
        setMensajeInput(`📎 ${file.name}\n`);
      }
    } catch (err) {
      showAlert("No se pudo abrir la cámara.", "error");
    }
  };

  const iniciarGrabacionVoz = async () => {
    if (isRecording) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        showAlert("Tu navegador no soporta notas de voz.", "warning");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `nota-voz-${Date.now()}.webm`, {
          type: blob.type,
        });
        setArchivoAdjunto(file);
        stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);
      };
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      recorder.start();
    } catch (err) {
      setIsRecording(false);
      showAlert("No se pudo iniciar la grabación de voz.", "error");
    }
  };

  const detenerGrabacionVoz = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  const emojiReacciones = ["👍", "❤️", "😂", "😮", "😢", "🎉"];
  const emojiExtra = [
    "😀", "😃", "😄", "😁", "😅", "🤣", "😊", "😍",
    "😘", "😎", "🤔", "😴", "😡", "😇", "🤩", "🥳",
    "😮", "😢", "😤", "😱", "🤯", "😵", "🥶", "🥵",
    "👍", "👎", "🙏", "👏", "💪", "🤝", "🤍", "💙",
    "💚", "💛", "🧡", "❤️", "💜", "🖤", "💔", "💯",
    "🔥", "✨", "⭐", "✅", "❗", "❓", "🎉", "🎯",
  ];

  const ordenarEmojis = (lista) =>
    [...lista].sort(
      (a, b) => (emojiUso[b] || 0) - (emojiUso[a] || 0)
    );

  const emojiOrdenados = ordenarEmojis(emojiReacciones);

  const toggleReaccion = (msgId, emoji) => {
    setReacciones((prev) => {
      const actual = prev[msgId] || {};
      const nuevo = { ...actual, [emoji]: !actual[emoji] };
      return { ...prev, [msgId]: nuevo };
    });
    setEmojiUso((prev) => ({ ...prev, [emoji]: (prev[emoji] || 0) + 1 }));
  };

  const obtenerIdDiaSemana = (date = new Date()) => {
    const day = date.getDay(); // 0 domingo, 1 lunes
    return day === 0 ? "7" : String(day);
  };

  const getChatIdActual = () => {
    if (tipoChat === "general") return "general";
    if (tipoChat === "privado") return chatActual || "";
    if (tipoChat === "grupal") return String(chatActual || "");
    return "";
  };

  const cargarPinYDestacados = async () => {
    const chatId = getChatIdActual();
    if (!tipoChat || !chatId) return;
    try {
      const pinRes = await authFetch(`${SERVER_URL}/chat/pin/${tipoChat}/${encodeURIComponent(chatId)}`);
      setMensajeFijado(pinRes?.pin || null);
    } catch (e) {
      setMensajeFijado(null);
    }
    try {
      const destRes = await authFetch(
        `${SERVER_URL}/chat/destacados/${tipoChat}/${encodeURIComponent(chatId)}`
      );
      const ids = Array.isArray(destRes?.destacados) ? destRes.destacados : [];
      setMensajesDestacados(new Set(ids.map((id) => String(id))));
    } catch (e) {
      setMensajesDestacados(new Set());
    }
  };

  const estaDentroHorario = (config) => {
    if (!config || config.notificaciones_activas === 0) return false;
    const diaId = obtenerIdDiaSemana();
    const dias = (config.dias_semana || "1,2,3,4,5,6,7")
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    if (!dias.includes(diaId)) return false;

    const mapa = {
      "1": "lun",
      "2": "mar",
      "3": "mie",
      "4": "jue",
      "5": "vie",
      "6": "sab",
      "7": "dom",
    };
    const key = mapa[diaId];
    const inicio = config[`horario_${key}_inicio`] || config.horario_inicio || "08:00";
    const fin = config[`horario_${key}_fin`] || config.horario_fin || "22:00";
    const [hi, mi] = inicio.split(":").map(Number);
    const [hf, mf] = fin.split(":").map(Number);
    const ahora = new Date();
    const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
    const inicioMin = hi * 60 + mi;
    const finMin = hf * 60 + mf;
    if (Number.isNaN(inicioMin) || Number.isNaN(finMin)) return true;
    if (finMin < inicioMin) {
      return ahoraMin >= inicioMin || ahoraMin <= finMin;
    }
    return ahoraMin >= inicioMin && ahoraMin <= finMin;
  };

  const abrirMenuMensaje = (event, payload, opciones = {}) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!payload?.mensaje) return;
    setMenuEmojiAbierto(false);
    const isMobile =
      window.innerWidth <= 767 ||
      (Capacitor?.isNativePlatform && Capacitor.isNativePlatform());
    const baseX = event?.clientX ?? window.innerWidth / 2;
    const baseY = event?.clientY ?? window.innerHeight / 2;
    const maxX = window.innerWidth - 260;
    const maxY = window.innerHeight - 360;
    const x = isMobile ? window.innerWidth / 2 : Math.max(12, Math.min(baseX, maxX));
    const y = isMobile ? window.innerHeight / 2 : Math.max(12, Math.min(baseY, maxY));
    setMenuMensaje({
      ...payload,
      x,
      y,
      isMobile,
      desdeLongPress: opciones.desdeLongPress || (!event && isMobile),
    });
  };

  const cerrarMenuMensaje = () => {
    setMenuMensaje(null);
    setMenuEmojiAbierto(false);
  };

  const activarSeleccion = (mensaje) => {
    if (!mensaje?.id) return;
    setSeleccionModo(true);
    setSeleccionMensajes(new Set([mensaje.id]));
  };

  const toggleSeleccionMensaje = (mensajeId) => {
    if (!mensajeId) return;
    setSeleccionMensajes((prev) => {
      const next = new Set(prev);
      if (next.has(mensajeId)) {
        next.delete(mensajeId);
      } else {
        next.add(mensajeId);
      }
      return next;
    });
  };

  const salirSeleccion = () => {
    setSeleccionModo(false);
    setSeleccionMensajes(new Set());
  };

  const eliminarMensajesSeleccionados = async () => {
    if (!seleccionMensajes.size) return;
    const confirmado = await showConfirm(
      `¿Eliminar ${seleccionMensajes.size} mensajes seleccionados?`,
      "Eliminar mensajes"
    );
    if (!confirmado) return;
    const tipo = tipoChat === "general" ? "general" : tipoChat === "privado" ? "privado" : "grupal";
    const ids = Array.from(seleccionMensajes);
    // Solo eliminar mensajes con IDs reales (no temporales)
    const idsReales = ids.filter((id) => id && !id.toString().startsWith("temp-"));
    for (const id of idsReales) {
      try {
        await authFetch(`${SERVER_URL}/chat/mensaje/${tipo}/${id}`, { method: "DELETE" });
      } catch (_) {}
    }
    // Normalizar IDs para comparación (string)
    const idsSet = new Set(idsReales.map((id) => String(id)));
    if (tipo === "general") {
      setMensajesGeneral((prev) => prev.filter((m) => !m.id || !idsSet.has(String(m.id))));
    } else if (tipo === "privado") {
      setMensajesPrivado((prev) => ({
        ...prev,
        [chatActual]: (prev[chatActual] || []).filter((m) => !m.id || !idsSet.has(String(m.id))),
      }));
    } else if (tipo === "grupal") {
      setMensajesGrupal((prev) => ({
        ...prev,
        [chatActual]: (prev[chatActual] || []).filter((m) => !m.id || !idsSet.has(String(m.id))),
      }));
    }
    showAlert("Mensajes eliminados", "success");
    salirSeleccion();
  };

  const iniciarPress = (payload) => {
    touchMovedRef.current = false;
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
    }
    longPressTimeoutRef.current = setTimeout(() => {
      if (!touchMovedRef.current) {
        abrirMenuMensaje(null, payload, { desdeLongPress: true });
      }
    }, 550);
  };

  const cancelarPress = () => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
    }
  };

  const marcarMovimiento = () => {
    touchMovedRef.current = true;
    cancelarPress();
  };

  const copiarMensaje = async (texto) => {
    if (!texto) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto);
      } else {
        const temp = document.createElement("textarea");
        temp.value = texto;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand("copy");
        document.body.removeChild(temp);
      }
      showAlert("Mensaje copiado", "success");
    } catch (err) {
      showAlert("No se pudo copiar el mensaje", "error");
    }
  };

  const eliminarMensaje = async (mensaje) => {
    if (!mensaje?.id) {
      showAlert("Este mensaje aún no se puede borrar.", "warning");
      return;
    }
    const confirmado = await showConfirm(
      "¿Quieres eliminar este mensaje?",
      "Confirmar eliminación"
    );
    if (!confirmado) return;

    try {
      const tipo = tipoChat === "general" ? "general" : tipoChat === "privado" ? "privado" : "grupal";
      await authFetch(`${SERVER_URL}/chat/mensaje/${tipo}/${mensaje.id}`, {
        method: "DELETE",
      });

      if (tipo === "general") {
        setMensajesGeneral((prev) => prev.filter((m) => m.id !== mensaje.id));
      } else if (tipo === "privado") {
        setMensajesPrivado((prev) => ({
          ...prev,
          [chatActual]: (prev[chatActual] || []).filter((m) => m.id !== mensaje.id),
        }));
      } else if (tipo === "grupal") {
        setMensajesGrupal((prev) => ({
          ...prev,
          [chatActual]: (prev[chatActual] || []).filter((m) => m.id !== mensaje.id),
        }));
      }
      showAlert("Mensaje eliminado", "success");
    } catch (err) {
      showAlert("No se pudo borrar el mensaje", "error");
    }
  };

  const mostrarInfoMensaje = async (mensaje) => {
    if (!mensaje?.id) {
      showAlert("Este mensaje aún no tiene info disponible.", "warning");
      return;
    }
    try {
      const tipo = tipoChat === "general" ? "general" : tipoChat === "privado" ? "privado" : "grupal";
      const info = await authFetch(`${SERVER_URL}/chat/mensaje/${tipo}/${mensaje.id}/info`);
      const fechaEnvio = info?.fecha_envio
        ? new Date(info.fecha_envio).toLocaleString("es-MX")
        : "No disponible";
      const fechaLeido = info?.fecha_leido
        ? new Date(info.fecha_leido).toLocaleString("es-MX")
        : "Aún no leído";
      const por = info?.leido_por ? ` por ${info.leido_por}` : "";
      showAlert(`Llegó: ${fechaEnvio}\nLeído${por}: ${fechaLeido}`, "info");
    } catch (e) {
      showAlert("No se pudo obtener la info del mensaje.", "error");
    }
  };

  const responderMensaje = (mensaje, otroNickname) => {
    if (!mensaje) return;
    setRespondiendoMensaje({
      id: mensaje.id,
      texto: mensaje.mensaje || mensaje.archivo_nombre || "Mensaje",
      usuario: otroNickname || "Usuario",
    });
    mensajeInputRef.current?.focus();
  };

  const abrirReenvio = (mensaje) => {
    if (!mensaje) return;
    setReenviarMensaje(mensaje);
    setMostrarReenvio(true);
  };

  const reenviarMensajeA = async (tipo, destino) => {
    if (!reenviarMensaje) return;
    const textoBase =
      reenviarMensaje.mensaje ||
      reenviarMensaje.archivo_nombre ||
      reenviarMensaje.enlace_compartido ||
      "Mensaje reenviado";
    const userDisplayName = user?.nickname || user?.name || "Usuario";
    const nombreGrupoOrigen =
      tipoChat === "grupal"
        ? (Array.isArray(grupos) &&
            grupos.find((g) => String(g.id) === String(chatActual))?.nombre) ||
          `Grupo ${chatActual}`
        : null;
    const origenChat =
      tipoChat === "general"
        ? "General"
        : tipoChat === "privado"
        ? chatActual
        : nombreGrupoOrigen;

    const bodyData = {
      mensaje: textoBase,
      tipo_mensaje: reenviarMensaje.archivo_url ? "archivo" : "texto",
      archivo_url: reenviarMensaje.archivo_url || null,
      archivo_nombre: reenviarMensaje.archivo_nombre || null,
      archivo_tipo: reenviarMensaje.archivo_tipo || null,
      archivo_tamaño: reenviarMensaje.archivo_tamaño || null,
      reenviado_de_usuario:
        reenviarMensaje.usuario_nickname || reenviarMensaje.de_nickname || userDisplayName,
      reenviado_de_chat: origenChat,
      reenviado_de_tipo: tipoChat || "general",
    };

    try {
      if (tipo === "general") {
        await authFetch(`${SERVER_URL}/chat/general`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyData),
        });
      } else if (tipo === "privado") {
        await authFetch(`${SERVER_URL}/chat/privado`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...bodyData, para_nickname: destino }),
        });
      } else if (tipo === "grupal") {
        await authFetch(`${SERVER_URL}/chat/grupos/${destino}/mensajes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyData),
        });
      }
      showAlert("Mensaje reenviado", "success");
      setMostrarReenvio(false);
      setReenviarMensaje(null);
    } catch (e) {
      showAlert("No se pudo reenviar el mensaje.", "error");
    }
  };

  const fijarMensaje = async (mensaje) => {
    if (!mensaje?.id) {
      showAlert("Este mensaje aún no se puede fijar.", "warning");
      return;
    }
    const chatId = getChatIdActual();
    if (!chatId) return;
    try {
      await authFetch(`${SERVER_URL}/chat/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo_chat: tipoChat,
          chat_id: chatId,
          mensaje_id: mensaje.id,
        }),
      });
      setMensajeFijado(mensaje);
      showAlert("Mensaje fijado", "success");
    } catch (e) {
      showAlert("No se pudo fijar el mensaje.", "error");
    }
  };

  const desfijarMensaje = async () => {
    const chatId = getChatIdActual();
    if (!chatId || !tipoChat) return;
    try {
      await authFetch(`${SERVER_URL}/chat/pin`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo_chat: tipoChat, chat_id: chatId }),
      });
      setMensajeFijado(null);
      showAlert("Mensaje desfijado", "success");
    } catch (e) {
      showAlert("No se pudo desfijar el mensaje.", "error");
    }
  };

  const toggleDestacarMensaje = async (mensaje) => {
    if (!mensaje?.id) return;
    const chatId = getChatIdActual();
    if (!chatId) return;
    try {
      const res = await authFetch(`${SERVER_URL}/chat/destacados`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo_chat: tipoChat,
          chat_id: chatId,
          mensaje_id: mensaje.id,
        }),
      });
      setMensajesDestacados((prev) => {
        const next = new Set(Array.from(prev).map(String));
        if (res?.destacado) {
          next.add(String(mensaje.id));
        } else {
          next.delete(String(mensaje.id));
        }
        return next;
      });
    } catch (e) {
      showAlert("No se pudo destacar el mensaje.", "error");
    }
  };

  const renderMenuPreview = (mensaje, esMio, otroNickname) => {
    if (!mensaje) return null;
    return (
      <div className={`msg-menu-bubble ${esMio ? "out" : "in"}`}>
        {(tipoChat !== "privado" || !esMio) && (
          <div className="msg-menu-nombre">{esMio ? "Tú" : otroNickname}</div>
        )}
        <div className="msg-menu-texto">
          {mensaje.menciona && (
            <button
              type="button"
              className="msg-mention-link"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                abrirChat("privado", mensaje.menciona);
              }}
            >
              @{mensaje.menciona}
            </button>
          )}
          {mensaje.enlace_compartido && (
            <a
              href={mensaje.enlace_compartido.startsWith("http") ? mensaje.enlace_compartido : `#${mensaje.enlace_compartido}`}
              className="msg-enlace"
              target={esEnlaceExterno(mensaje.enlace_compartido) ? "_blank" : undefined}
              rel={esEnlaceExterno(mensaje.enlace_compartido) ? "noopener noreferrer" : undefined}
              onClick={(e) => {
                if (!mensaje.enlace_compartido.startsWith("http")) {
                  e.preventDefault();
                  abrirEnApp(mensaje.enlace_compartido);
                }
              }}
            >
              {mensaje.enlace_compartido}
            </a>
          )}
          {(!mensaje.enlace_compartido || mensaje.mensaje !== mensaje.enlace_compartido) && (
            <span
              className="msg-texto-html"
              dangerouslySetInnerHTML={{ __html: formatearMensaje(mensaje.mensaje || "") }}
            />
          )}
          {mensaje.archivo_nombre && (
            <span className="msg-menu-archivo">📎 {mensaje.archivo_nombre}</span>
          )}
        </div>
      </div>
    );
  };


  // ============================
  // ✏️ Editar mensaje
  // ============================
  const iniciarEdicion = (mensaje) => {
    setEditandoMensaje(mensaje.id);
    setTextoEdicion(mensaje.mensaje);
  };

  const cancelarEdicion = () => {
    setEditandoMensaje(null);
    setTextoEdicion("");
  };

  const guardarEdicion = async () => {
    if (!textoEdicion.trim() || !editandoMensaje) return;

    try {
      const tipo = tipoChat === "general" ? "general" : tipoChat === "privado" ? "privado" : "grupal";
      const response = await authFetch(`${SERVER_URL}/chat/mensaje/${tipo}/${editandoMensaje}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: textoEdicion.trim() }),
      });

      if (response && response.mensaje) {
        // Actualizar mensaje localmente con la respuesta del servidor
        if (tipo === "general") {
          setMensajesGeneral((prev) =>
            prev.map((m) => (m.id === editandoMensaje ? response.mensaje : m))
          );
        } else if (tipo === "privado") {
          setMensajesPrivado((prev) => ({
            ...prev,
            [chatActual]: (prev[chatActual] || []).map((m) =>
              m.id === editandoMensaje ? response.mensaje : m
            ),
          }));
        } else if (tipo === "grupal") {
          setMensajesGrupal((prev) => ({
            ...prev,
            [chatActual]: (prev[chatActual] || []).map((m) =>
              m.id === editandoMensaje ? response.mensaje : m
            ),
          }));
        }
        cancelarEdicion();
        showAlert("Mensaje editado correctamente", "success");
      }
    } catch (err) {
      console.error("Error editando mensaje:", err);
      showAlert("Error al editar el mensaje: " + (err.message || "Error desconocido"), "error");
    }
  };

  // ============================
  // ➤ Enviar mensaje
  // ============================
  const enviarMensaje = async () => {
    const texto = mensajeInput.trim();
    if (!texto && !archivoAdjunto) return;

    // Usar nickname si existe, si no usar name
    const userDisplayName = user?.nickname || user?.name;
    if (!userDisplayName) {
      showAlert("No se puede enviar mensajes sin nickname o nombre. Por favor configura tu nickname en tu perfil.", "warning");
      return;
    }

    // Subir archivo si existe
    let archivoId = null;
    if (archivoAdjunto) {
      const archivoSubido = await subirArchivo(archivoAdjunto);
      if (archivoSubido) {
        archivoId = archivoSubido.id;
      } else {
        return; // Si falla la subida, no enviar mensaje
      }
    }

    // Detectar menciones y enlaces
    const menciones = detectarMenciones(texto);
    const menciona = menciones.length > 0 ? menciones[0] : null;
    const enlaceCompartido = detectarEnlacesApp(texto);

    const tipoMensaje = archivoAdjunto ? "archivo" : "texto";
    const replyInfo = respondiendoMensaje
      ? {
          reply_to_id: respondiendoMensaje.id || null,
          reply_to_user: respondiendoMensaje.usuario || null,
          reply_to_text: respondiendoMensaje.texto || null,
        }
      : {};

    // Limpiar inputs antes de enviar
    setMensajeInput("");
    setArchivoAdjunto(null);
    setRespondiendoMensaje(null);

    try {
      const bodyData = {
        mensaje: texto || archivoAdjunto?.name || "Archivo",
        tipo_mensaje: tipoMensaje,
        archivo_id: archivoId,
        menciona,
        enlace_compartido: enlaceCompartido,
        ...replyInfo,
      };

      console.log("[Chat] Enviando mensaje:", { tipoChat, chatActual, bodyData });

      let respuesta;
      if (tipoChat === "general") {
        respuesta = await authFetch(`${SERVER_URL}/chat/general`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyData),
        });
        console.log("[Chat] Respuesta del servidor (general):", respuesta);
        // Agregar el mensaje real directamente
        if (respuesta?.mensaje) {
          setMensajesGeneral((prev) => {
            // Evitar duplicados
            const existe = prev.some((m) => m.id === respuesta.mensaje.id);
            if (existe) return prev;
            return [...prev, respuesta.mensaje].sort((a, b) => {
              const fechaA = new Date(a.fecha || 0).getTime();
              const fechaB = new Date(b.fecha || 0).getTime();
              return fechaA - fechaB;
            });
          });
        }
      } else if (tipoChat === "privado") {
        respuesta = await authFetch(`${SERVER_URL}/chat/privado`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...bodyData, para_nickname: chatActual }),
        });
        console.log("[Chat] Respuesta del servidor (privado):", respuesta);
        // Agregar el mensaje real directamente
        if (respuesta?.mensaje) {
          setMensajesPrivado((prev) => {
            const mensajesExistentes = prev[chatActual] || [];
            // Evitar duplicados
            const existe = mensajesExistentes.some((m) => m.id === respuesta.mensaje.id);
            if (existe) return prev;
            return {
              ...prev,
              [chatActual]: [...mensajesExistentes, respuesta.mensaje].sort((a, b) => {
                const fechaA = new Date(a.fecha || 0).getTime();
                const fechaB = new Date(b.fecha || 0).getTime();
                return fechaA - fechaB;
              }),
            };
          });
        }
      } else if (tipoChat === "grupal") {
        respuesta = await authFetch(`${SERVER_URL}/chat/grupos/${chatActual}/mensajes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyData),
        });
        console.log("[Chat] Respuesta del servidor (grupal):", respuesta);
        // Agregar el mensaje real directamente
        if (respuesta?.mensaje) {
          setMensajesGrupal((prev) => {
            const mensajesExistentes = prev[chatActual] || [];
            // Evitar duplicados
            const existe = mensajesExistentes.some((m) => m.id === respuesta.mensaje.id);
            if (existe) return prev;
            return {
              ...prev,
              [chatActual]: [...mensajesExistentes, respuesta.mensaje].sort((a, b) => {
                const fechaA = new Date(a.fecha || 0).getTime();
                const fechaB = new Date(b.fecha || 0).getTime();
                return fechaA - fechaB;
              }),
            };
          });
        }
      }
    } catch (e) {
      console.error("Error enviando mensaje:", e);
      showAlert("No se pudo enviar el mensaje. Por favor intenta de nuevo.", "error");
    }
  };

  // ============================
  // 🗑 Limpiar chat (SOLO ADMIN)
  // ============================
  const limpiarChat = async () => {
    if (tipoChat === "general" && !esAdmin) {
      showAlert("Solo los administradores pueden borrar chats generales", "warning");
      return;
    }

    const mensajeConfirmacion =
      tipoChat === "privado"
        ? "¿Borrar esta conversación solo para ti?"
        : "¿Borrar esta conversación? (Solo admin)";
    const confirmado = await showConfirm(mensajeConfirmacion, "Confirmar eliminación");
    if (!confirmado) return;

    try {
      if (tipoChat === "general") {
        await authFetch(`${SERVER_URL}/chat/general`, { method: "DELETE" });
        setMensajesGeneral([]);
      } else if (tipoChat === "privado") {
        await authFetch(`/chat/privado/${chatActual}`, { method: "DELETE" });
        setMensajesPrivado((prev) => {
          const copia = { ...prev };
          delete copia[chatActual];
          return copia;
        });
        setTipoChat(null);
        setChatActual(null);
      }
    } catch (e) {
      console.error("Error borrando chat:", e);
      showAlert("Error borrando chat: " + (e.message || "Error desconocido"), "error");
    }
  };

  // ============================
  // 🗑 Borrar grupo (SOLO ADMIN)
  // ============================
  const borrarGrupo = async (grupoId) => {
    if (!esAdmin) {
      showAlert("Solo los administradores pueden borrar grupos", "warning");
      return;
    }

    const confirmado = await showConfirm("¿Borrar este grupo? (Solo admin)", "Confirmar eliminación");
    if (!confirmado) return;

    try {
      await authFetch(`/chat/grupos/${grupoId}`, { method: "DELETE" });
      // Recargar grupos
      const data = await authFetch("/chat/grupos/mios");
      setGrupos(data || []);
      // Si estaba viendo ese grupo, cerrarlo
      if (tipoChat === "grupal" && String(chatActual) === String(grupoId)) {
        setTipoChat(null);
        setChatActual(null);
        setTabPrincipal("grupos");
      }
    } catch (e) {
      console.error("Error borrando grupo:", e);
      showAlert("Error borrando grupo: " + (e.message || "Error desconocido"), "error");
    }
  };

  // ============================
  // ➕ Crear grupo
  // ============================
  const crearGrupo = async () => {
    if (!nuevoGrupoNombre.trim()) return;

    try {
      await authFetch(`${SERVER_URL}/chat/grupos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nuevoGrupoNombre.trim(),
          descripcion: nuevoGrupoDesc.trim() || null,
          es_publico: nuevoGrupoEsPublico ? 1 : 0,
        }),
      });
      setNuevoGrupoNombre("");
      setNuevoGrupoDesc("");
      setNuevoGrupoEsPublico(true);
      setMostrarCrearGrupo(false);
      // Recargar grupos
      const data = await authFetch("/chat/grupos/mios");
      setGrupos(data || []);
    } catch (e) {
      console.error("Error creando grupo:", e);
    }
  };


  // ============================
  // 🔗 Detectar y compartir enlaces de la app
  // ============================
  const detectarEnlacesApp = (texto) => {
    // Detectar URLs completas
    const urlRegex = /https?:\/\/[^\s]+/gi;
    const urlMatch = texto.match(urlRegex);
    if (urlMatch && urlMatch.length > 0) {
      return urlMatch[0];
    }
    
    // Detectar rutas de la misma app (ej: /inventario, /picking, etc.)
    const rutasApp = [
      'inventario', 'picking', 'activaciones', 'activos', 'reportes', 
      'admin', 'administrador', 'reenvios', 'devoluciones', 'auditoria',
      'rep_picking', 'rep_reenvios', 'rep_devoluciones', 'rep_activaciones'
    ];
    
    for (const ruta of rutasApp) {
      const regex = new RegExp(`(?:^|\\s)(/${ruta}|${ruta})(?:\\s|$)`, 'gi');
      const match = texto.match(regex);
      if (match) {
        const rutaEncontrada = match[0].trim();
        // Convertir a URL completa de la app
        const baseUrl = window.location.origin;
        return rutaEncontrada.startsWith('/') 
          ? `${baseUrl}${rutaEncontrada}` 
          : `${baseUrl}/${rutaEncontrada}`;
      }
    }
    
    return null;
  };

  const obtenerPreviewEnlace = (link) => {
    if (!link || typeof link !== "string") return null;
    let url;
    try {
      // Si no tiene protocolo, agregarlo
      const linkConProtocolo = link.startsWith("http://") || link.startsWith("https://") 
        ? link 
        : `https://${link}`;
      url = new URL(linkConProtocolo);
    } catch {
      // Si no es una URL válida, retornar null
      return null;
    }
    
    const esInterno = url.origin === window.location.origin;
    const share = url.searchParams.get("share");
    const tab = url.searchParams.get("tab");
    
    // Si es un enlace interno con share o tab, generar preview especial
    if (esInterno && (share || tab)) {
      const pedido = url.searchParams.get("pedido");
      const tipo = url.searchParams.get("tipo");
      const titulo =
        share === "reenvio"
          ? "Reenvío compartido"
          : share === "devolucion"
          ? `Devolución ${tipo ? `(${tipo})` : ""}`.trim()
          : "Enlace compartido";
      const subtitulo = pedido ? `Pedido: ${pedido}` : url.pathname;

      const qrEndpoint =
        share === "devolucion"
          ? `${SERVER_URL}/devoluciones/qr`
          : `${SERVER_URL}/reenvios/qr`;
      const imageUrl = `${qrEndpoint}?data=${encodeURIComponent(link)}`;

      return {
        titulo,
        subtitulo,
        imageUrl,
        link: url.href,
        esInterno: true,
      };
    }
    
    // Para URLs externas o internas sin share/tab, generar preview genérico
    const dominio = url.hostname.replace('www.', '');
    const titulo = dominio || "Enlace compartido";
    const pathYQuery = (url.pathname + url.search).substring(0, 100);
    const subtitulo = pathYQuery || link;
    
    // Intentar obtener favicon del sitio
    const faviconUrl = `${url.origin}/favicon.ico`;
    
    return {
      titulo,
      subtitulo,
      imageUrl: faviconUrl,
      link: url.href,
      esInterno: esInterno,
    };
  };

  const esEnlaceExterno = (link) => {
    if (!link || typeof link !== "string") return false;
    try {
      // Si no tiene protocolo, agregarlo para validar
      const linkConProtocolo = link.startsWith("http://") || link.startsWith("https://") 
        ? link 
        : `https://${link}`;
      const url = new URL(linkConProtocolo);
      return url.origin !== window.location.origin;
    } catch {
      return false;
    }
  };

  // Función para calcular la edad desde una fecha
  const calcularEdad = (fecha) => {
    if (!fecha) return null;
    try {
      const fechaNac = new Date(`${fecha}T00:00:00`);
      if (Number.isNaN(fechaNac.getTime())) return null;
      const hoy = new Date();
      let edad = hoy.getFullYear() - fechaNac.getFullYear();
      const m = hoy.getMonth() - fechaNac.getMonth();
      if (m < 0 || (m === 0 && hoy.getDate() < fechaNac.getDate())) {
        edad -= 1;
      }
      return edad >= 0 ? edad : null;
    } catch (e) {
      return null;
    }
  };

  const abrirPerfilUsuario = async (nickname) => {
    if (!nickname) return;
    setPerfilAbierto(true);
    setPerfilTab("info");
    setPerfilData(null);
    setPerfilCompartidos([]);
    setPerfilError(null);
    setPerfilCargando(true);

    try {
      const [perfil, compartidos] = await Promise.all([
        authFetch(`${SERVER_URL}/chat/usuario/${encodeURIComponent(nickname)}/perfil`),
        authFetch(`${SERVER_URL}/chat/privado/${encodeURIComponent(nickname)}/compartidos`),
      ]);

      setPerfilData(perfil || null);
      setPerfilCompartidos(Array.isArray(compartidos) ? compartidos : []);
    } catch (err) {
      setPerfilError(err?.message || "Error cargando información del usuario");
    } finally {
      setPerfilCargando(false);
    }
  };

  const cerrarPerfilUsuario = () => {
    setPerfilAbierto(false);
  };

  // Función auxiliar para obtener token de forma robusta
  const obtenerToken = () => {
    if (token) return token;
    try {
      return localStorage.getItem("token");
    } catch (e) {
      return null;
    }
  };

  const abrirArchivoPrivado = async (archivo) => {
    if (!archivo) return;
    setPreviewItem(archivo);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setPreviewTextContent(null);
    setPreviewError(null);
    
    if (archivo.archivo_url) {
      setPreviewLoading(true);
      try {
        // Extraer el ID del archivo de la URL si es una URL de chat
        const archivoIdMatch = archivo.archivo_url.match(/\/chat\/archivo\/(\d+)/);
        let url;
        
        // Obtener token de autenticación
        const authToken = obtenerToken();
        
        if (!authToken) {
          throw new Error("No se encontró token de autenticación. Por favor, recarga la página.");
        }
        
        if (archivoIdMatch) {
          // Es un archivo del chat, usar la ruta del endpoint
          const archivoId = archivoIdMatch[1];
          url = `${SERVER_URL}/chat/archivo/${archivoId}`;
        } else {
          // Es una URL directa (por ejemplo, uploads/perfiles)
          if (archivo.archivo_url.startsWith("http")) {
            url = archivo.archivo_url;
          } else {
            url = `${SERVER_URL}${archivo.archivo_url.startsWith("/") ? archivo.archivo_url : `/${archivo.archivo_url}`}`;
          }
        }
        
        console.log("🔍 Cargando archivo:", { 
          urlOriginal: archivo.archivo_url,
          urlFinal: url, 
          tipo: archivo.archivo_tipo, 
          nombre: archivo.archivo_nombre,
          SERVER_URL: SERVER_URL,
          tieneToken: !!authToken
        });
        
        // Para imágenes y videos, usar la URL directamente con token en query (para que funcione en <img> y <video>)
        if (archivo.archivo_tipo?.startsWith("image/") || archivo.archivo_tipo?.startsWith("video/")) {
          const urlConToken = `${url}?token=${encodeURIComponent(authToken)}`;
          setPreviewUrl(urlConToken);
          setPreviewLoading(false);
          console.log("✅ Imagen/Video cargado directamente");
        } else {
          // Para otros archivos (PDFs, documentos, etc.), cargar como blob
          console.log("📥 Descargando archivo como blob...");
          
          const response = await fetch(url, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
            credentials: "include",
          });
          
          console.log("📡 Respuesta del servidor:", { 
            ok: response.ok, 
            status: response.status, 
            statusText: response.statusText,
            contentType: response.headers.get("content-type"),
            contentLength: response.headers.get("content-length"),
            url: url
          });
          
          if (!response.ok) {
            let errorText = "";
            try {
              errorText = await response.text();
            } catch (e) {
              errorText = response.statusText || "Error desconocido";
            }
            
            console.error("❌ Error en respuesta:", { 
              status: response.status, 
              statusText: response.statusText,
              errorText: errorText.substring(0, 200)
            });
            
            // Si es 401, puede ser problema de autenticación
            if (response.status === 401) {
              throw new Error("Error de autenticación. Por favor, recarga la página e inicia sesión nuevamente.");
            }
            
            // Si es 404, el archivo no existe
            if (response.status === 404) {
              throw new Error("El archivo no se encontró en el servidor.");
            }
            
            throw new Error(`Error ${response.status}: ${response.statusText || "No se pudo cargar el archivo"}`);
          }
          
          const blob = await response.blob();
          console.log("✅ Blob creado:", { size: blob.size, type: blob.type });
          
          if (blob.size === 0) {
            throw new Error("El archivo está vacío o no se pudo descargar correctamente");
          }
          
          setPreviewBlob(blob);
          
          // Para archivos de texto, leer el contenido como texto
          if (archivo.archivo_tipo?.startsWith("text/")) {
            try {
              const text = await blob.text();
              console.log("✅ Contenido de texto leído:", text.length, "caracteres");
              setPreviewTextContent(text);
            } catch (e) {
              console.warn("⚠️ No se pudo leer como texto:", e);
            }
          }
          
          // Crear URL del blob para mostrar en iframe/embed (sin descargar)
          const blobUrl = URL.createObjectURL(blob);
          console.log("✅ Blob URL creada:", blobUrl);
          setPreviewUrl(blobUrl);
          setPreviewLoading(false);
        }
      } catch (err) {
        console.error("❌ Error completo cargando archivo:", err);
        const errorMsg = err.message || "Error desconocido al cargar el archivo";
        setPreviewError(errorMsg);
        showAlert(`No se pudo cargar el archivo: ${errorMsg}`, "error");
        setPreviewLoading(false);
      }
    } else {
      setPreviewError("No hay URL de archivo disponible");
      setPreviewLoading(false);
    }
  };

  const cerrarPreview = () => {
    // Liberar blob URL si existe para evitar memory leaks
    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewItem(null);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setPreviewTextContent(null);
    setPreviewError(null);
  };

  const abrirEnApp = async (url) => {
    if (!url) return;
    if (Capacitor.isNativePlatform()) {
      try {
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url });
      } catch (e) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const obtenerRoomLlamada = () => {
    const normalizar = (valor) =>
      String(valor || "usuario")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-_]/g, "");
    const yo = normalizar(user?.nickname || user?.name || "usuario");
    if (tipoChat === "privado") {
      const otro = normalizar(chatActual || "usuario");
      return `ixora-${[yo, otro].sort().join("-")}`;
    }
    if (tipoChat === "grupal") {
      return `ixora-grupo-${normalizar(chatActual || "grupo")}`;
    }
    return `ixora-general-${yo}`;
  };

  const getIceServers = () => {
    if (rtcConfig?.iceServers?.length) return rtcConfig.iceServers;
    return [{ urls: "stun:stun.l.google.com:19302" }];
  };

  const actualizarRemoteStreams = () => {
    const lista = Object.entries(remoteStreamsRef.current).map(([id, stream]) => ({
      id,
      stream,
      nickname: peerConnectionsRef.current[id]?.nickname || "Usuario",
    }));
    setRemoteStreams(lista);
  };

  const limpiarPeer = (socketId) => {
    const pc = peerConnectionsRef.current[socketId]?.pc;
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.close();
    }
    delete peerConnectionsRef.current[socketId];
    delete remoteStreamsRef.current[socketId];
    delete pendingCandidatesRef.current[socketId];
    actualizarRemoteStreams();
  };

  const limpiarLlamada = () => {
    Object.keys(peerConnectionsRef.current).forEach(limpiarPeer);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    localStreamRef.current = null;
    setLocalStream(null);
    setCallActivo(false);
    setCallIncoming(null);
    setCallMuted(false);
    setCallVideoOff(false);
    callRoomRef.current = null;
  };

  const crearPeerConnection = (socketId, nickname) => {
    if (peerConnectionsRef.current[socketId]?.pc) {
      return peerConnectionsRef.current[socketId].pc;
    }
    const pc = new RTCPeerConnection({ iceServers: getIceServers() });
    const local = localStreamRef.current;
    if (local) {
      local.getTracks().forEach((track) => pc.addTrack(track, local));
    }
    pc.onicecandidate = (event) => {
      if (event.candidate && socket && callRoomRef.current) {
        socket.emit("call_ice", {
          to: socketId,
          room: callRoomRef.current,
          candidate: event.candidate,
        });
      }
    };
    pc.ontrack = (event) => {
      if (!remoteStreamsRef.current[socketId]) {
        remoteStreamsRef.current[socketId] = new MediaStream();
      }
      event.streams[0].getTracks().forEach((track) => {
        remoteStreamsRef.current[socketId].addTrack(track);
      });
      actualizarRemoteStreams();
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        limpiarPeer(socketId);
      }
    };
    peerConnectionsRef.current[socketId] = { pc, nickname };
    const pendientes = pendingCandidatesRef.current[socketId];
    if (pendientes?.length) {
      pendientes.forEach((c) => {
        pc.addIceCandidate(c).catch(() => {});
      });
      delete pendingCandidatesRef.current[socketId];
    }
    return pc;
  };

  const asegurarLocalStream = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      showAlert("Tu dispositivo no soporta videollamadas.", "warning");
      throw new Error("getUserMedia no disponible");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  };

  const iniciarLlamada = async () => {
    if (!socket) return;
    if (tipoChat !== "privado" && tipoChat !== "grupal") {
      showAlert("La videollamada solo está disponible en chats privados y grupos.", "warning");
      return;
    }
    try {
      await asegurarLocalStream();
      const room = obtenerRoomLlamada();
      const userDisplayName = user?.nickname || user?.name || "usuario";
      const destinatarios = [];
      if (tipoChat === "privado") {
        if (chatActual) destinatarios.push(chatActual);
      } else if (tipoChat === "grupal") {
        const grupo = Array.isArray(grupos)
          ? grupos.find((g) => String(g.id) === String(chatActual))
          : null;
        if (grupo?.miembros?.length) {
          destinatarios.push(...grupo.miembros);
        }
      }
      const unicos = Array.from(new Set(destinatarios)).filter(
        (n) => n && n !== userDisplayName
      );
      setCallActivo(true);
      callRoomRef.current = room;
      socket.emit("call_invite", {
        room,
        fromNickname: userDisplayName,
        toNicknames: unicos,
        tipo: tipoChat,
      });
      socket.emit("call_join", { room, nickname: userDisplayName });
    } catch (err) {
      showAlert("No se pudo iniciar la videollamada.", "error");
      limpiarLlamada();
    }
  };

  const aceptarLlamada = async () => {
    if (!socket || !callIncoming) return;
    try {
      await asegurarLocalStream();
      const userDisplayName = user?.nickname || user?.name || "usuario";
      const room = callIncoming.room;
      setCallActivo(true);
      callRoomRef.current = room;
      socket.emit("call_join", { room, nickname: userDisplayName });
      setCallIncoming(null);
    } catch (err) {
      showAlert("No se pudo aceptar la videollamada.", "error");
      limpiarLlamada();
    }
  };

  const rechazarLlamada = () => {
    setCallIncoming(null);
  };

  const colgarLlamada = () => {
    if (socket && callRoomRef.current) {
      socket.emit("call_leave", { room: callRoomRef.current });
    }
    limpiarLlamada();
  };

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setCallMuted(stream.getAudioTracks().some((t) => !t.enabled));
  };

  const toggleVideo = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setCallVideoOff(stream.getVideoTracks().some((t) => !t.enabled));
  };

  const abrirVideollamada = async () => {
    await iniciarLlamada();
  };

  const blobToBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const solicitarPermisoAlmacenamiento = async () => {
    if (!Capacitor.isNativePlatform()) return true;
    try {
      const { Filesystem } = await import("@capacitor/filesystem");
      const perm = await Filesystem.requestPermissions();
      return (
        perm?.publicStorage === "granted" ||
        perm?.publicStorage === "limited" ||
        perm?.storage === "granted"
      );
    } catch (e) {
      return false;
    }
  };

  const descargarArchivoPrivado = async (archivo) => {
    if (!archivo?.archivo_url) return;
    try {
      let blob = previewBlob;
      if (!blob) {
        const response = await fetch(`${SERVER_URL}${archivo.archivo_url}`, {
          method: "GET",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) {
          throw new Error("No se pudo descargar el archivo");
        }
        blob = await response.blob();
      }

      if (Capacitor.isNativePlatform()) {
        const permitido = await solicitarPermisoAlmacenamiento();
        if (!permitido) {
          showAlert("Necesitas dar permiso de almacenamiento.", "warning");
          return;
        }
        const { Filesystem, Directory } = await import("@capacitor/filesystem");
        const base64 = await blobToBase64(blob);
        const nombre = archivo.archivo_nombre || `archivo-${Date.now()}`;
        await Filesystem.writeFile({
          path: nombre,
          data: base64,
          directory: Directory.Documents,
        });
        showAlert("✅ Archivo guardado en Documentos", "success");
        return;
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = archivo.archivo_nombre || "archivo";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showAlert("No se pudo descargar el archivo.", "error");
    }
  };


  // ============================
  // ➕ Agregar miembro a grupo
  // ============================
  const agregarMiembroAGrupo = async (grupoId, usuarioNickname) => {
    try {
      await authFetch(`/chat/grupos/${grupoId}/miembros`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario_nickname: usuarioNickname }),
      });
      
      // Recargar grupos para actualizar la lista de miembros
      const data = await authFetch("/chat/grupos/mios");
      setGrupos(data || []);
      
      // Si estamos viendo ese grupo, recargar también los mensajes
      if (tipoChat === "grupal" && String(chatActual) === String(grupoId)) {
        const mensajesData = await authFetch(`/chat/grupos/${grupoId}/mensajes`);
        setMensajesGrupal((prev) => ({
          ...prev,
          [grupoId]: mensajesData || [],
        }));
      }
    } catch (e) {
      console.error("Error agregando miembro:", e);
      showAlert("Error agregando miembro: " + (e.message || "Error desconocido"), "error");
    }
  };

  // ============================
  // 🎯 Abrir chat
  // ============================
  const abrirChat = async (tipo, destino) => {
    salirSeleccion();
    setTipoChat(tipo);
    setChatActual(destino);
    setTabPrincipal("chat");
    setNoLeidos(0);
    setMostrarAgregarMiembros(false);
    setGrupoMenuAbierto(null);
    setPerfilAbierto(false);
    setPerfilTab("info");
    setPerfilData(null);
    setPerfilCompartidos([]);
    setPerfilError(null);
    setPerfilCargando(false);
    
    // Limpiar contador de mensajes no leídos para este chat privado inmediatamente
    if (tipo === "privado" && destino) {
      // Limpiar localmente primero para respuesta inmediata
      setChatsActivos((prev) =>
        prev.map((c) =>
          c.otro_usuario === destino ? { ...c, mensajes_no_leidos: 0 } : c
        )
      );
      
      // Marcar mensajes como leídos en el servidor
      try {
        await authFetch(`${SERVER_URL}/chat/privado/${destino}/leer`, {
          method: "POST",
        });
        // Recargar chats activos para sincronizar con el servidor
        const data = await authFetch(`${SERVER_URL}/chat/activos`);
        setChatsActivos(data || []);
      } catch (e) {
        console.error("Error marcando mensajes como leídos:", e);
        // Si falla, mantener el estado local limpio
      }
    }
  };

  // Obtener mensajes actuales
  const mensajesActuales =
    tipoChat === "general"
      ? mensajesGeneral
      : tipoChat === "privado"
      ? mensajesPrivado[chatActual] || []
      : tipoChat === "grupal"
      ? mensajesGrupal[chatActual] || []
      : [];

  const compartidosImagenes = perfilCompartidos.filter(
    (item) => item.archivo_url && item.archivo_tipo?.startsWith("image/")
  );
  const compartidosVideos = perfilCompartidos.filter(
    (item) => item.archivo_url && item.archivo_tipo?.startsWith("video/")
  );
  const compartidosArchivos = perfilCompartidos.filter(
    (item) =>
      item.archivo_url &&
      !item.archivo_tipo?.startsWith("image/") &&
      !item.archivo_tipo?.startsWith("video/")
  );
  const compartidosEnlaces = perfilCompartidos.filter(
    (item) => item.enlace_compartido
  );
  const previewTipo = previewItem?.enlace_compartido
    ? "enlace"
    : previewItem?.archivo_tipo?.startsWith("image/")
    ? "imagen"
    : previewItem?.archivo_tipo?.startsWith("video/")
    ? "video"
    : previewItem?.archivo_url
    ? "archivo"
    : null;

  return (
    <>
      {/* BOTÓN FLOTANTE - OCULTAR si viene del menú inferior */}
      {!open && !onClose && (
        <button className="chat-boton-pro" onClick={abrirCerrarChat}>
          💬
          {noLeidos > 0 && (
            <span className="chat-badge">{noLeidos > 9 ? "9+" : noLeidos}</span>
          )}
        </button>
      )}

      {/* OVERLAY */}
      {open && <div className="chat-overlay" onClick={abrirCerrarChat} />}

      {/* PANEL */}
      {open && (
        <div className={`chat-pro-ventana ${tipoChat && window.innerWidth <= 767 ? 'mobile-chat-open' : ''}`}>
          {/* Botón volver en móvil */}
          {tipoChat && window.innerWidth <= 767 && (
            <button 
              className="chat-back-button"
              onClick={() => {
                setTipoChat(null);
                setChatActual(null);
                setTabPrincipal("usuarios");
              }}
            >
              ←
            </button>
          )}
          
          {/* CONTENEDOR PRINCIPAL CON VISTA DIVIDIDA */}
          <div className="chat-container-main">
            {/* SIDEBAR IZQUIERDO - LISTA DE CHATS */}
            {(!tipoChat || window.innerWidth > 767) && (
              <div className="chat-sidebar">
                {/* HEADER DEL SIDEBAR */}
                <div className="chat-sidebar-header">
                  <h2 className="chat-sidebar-title">💬 Mensajes</h2>
                  <button 
                    className="chat-close-btn"
                    onClick={() => {
                      abrirCerrarChat();
                      if (onClose) {
                        onClose();
                      }
                    }}
                    title="Cerrar chat"
                  >
                    ✕
                  </button>
                </div>
                
                {/* TABS PRINCIPALES */}
                <div className="chat-tabs">
            <div
              className={`tab ${tabPrincipal === "usuarios" ? "active" : ""}`}
              onClick={() => {
                setTabPrincipal("usuarios");
                setTipoChat(null);
                setChatActual(null);
              }}
            >
              Usuarios
            </div>
            <div
              className={`tab ${tabPrincipal === "chats" ? "active" : ""}`}
              onClick={() => setTabPrincipal("chats")}
            >
              Chats
            </div>
            <div
              className={`tab ${tabPrincipal === "grupos" ? "active" : ""}`}
              onClick={() => setTabPrincipal("grupos")}
            >
              Grupos
            </div>
                </div>
                
                {/* CONTENIDO DEL SIDEBAR */}
                <div className="chat-sidebar-content">
                  {/* USUARIOS */}
                  {tabPrincipal === "usuarios" && (
                    <div className="usuarios-list-pro">
                      <div className="chat-buscador-usuarios">
                        <input
                          type="text"
                          value={filtroUsuarios}
                          onChange={(e) => setFiltroUsuarios(e.target.value)}
                          placeholder="Buscar usuario..."
                        />
                      </div>
              <div
                className="usuario-item-pro general-chat"
                onClick={() => abrirChat("general", null)}
              >
                <span className="grupo-icon">🌐</span>
                <span>Chat General</span>
              </div>
              {usuariosIxora
                .filter((u) => {
                  const displayName = (u.nickname || u.name || "").toLowerCase();
                  const query = filtroUsuarios.trim().toLowerCase();
                  return !query || displayName.includes(query);
                })
                .map((u) => {
                  const displayName = u.nickname || u.name || "Usuario";
                  // Verificar si está activo: busca por nickname o por name
                  const isActive = usuariosActivos.some(
                    (ua) => 
                      (u.nickname && ua.nickname === u.nickname) ||
                      (!u.nickname && ua.nickname === u.name)
                  );
                  const isUserActive = u.active === 1;
                  
                  return (
                    <div
                      key={u.id}
                      className={`usuario-item-pro ${!isUserActive ? 'usuario-inactivo' : ''}`}
                      onClick={() => {
                        // Usar nickname si existe, si no usar name
                        const destinoNombre = u.nickname || u.name;
                        if (destinoNombre) {
                          abrirChat("privado", destinoNombre);
                        } else {
                          showAlert("Este usuario no tiene nickname ni nombre configurado.", "warning");
                        }
                      }}
                    >
                      <div className="avatar-container">
                        <img
                          src={getAvatarUrl(u)}
                          alt={displayName}
                          className="chat-avatar"
                          onError={(e) => {
                            e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23e0e0e0'/%3E%3Ctext x='16' y='22' font-size='20' text-anchor='middle' fill='%23999'%3E👤%3C/text%3E%3C/svg%3E";
                          }}
                        />
                        {isActive && (
                          <span className="status-online-dot" title="Activo en IXORA"></span>
                        )}
                      </div>
                      <span style={{ color: getColorForName(displayName) }}>
                        {displayName}
                      </span>
                      {!isUserActive && (
                        <span className="status-inactivo" title="Usuario inactivo">⚫</span>
                      )}
                    </div>
                  );
                })}
                    </div>
                  )}

                  {/* CHATS ACTIVOS */}
                  {tabPrincipal === "chats" && (
                    <div className="usuarios-list-pro">
                      <div
                        className="usuario-item-pro general-chat"
                        onClick={() => abrirChat("general", null)}
                      >
                        <span className="grupo-icon">🌐</span>
                        <span>Chat General</span>
                      </div>
                      {chatsActivos.map((chat) => {
                const userDisplayName = user?.nickname || user?.name;
                const esMioUltimoMensaje = chat.ultimo_remitente === userDisplayName;
                // Verificar si el usuario está en línea
                const usuarioEnLinea = usuariosActivos.some(
                  (ua) => ua.nickname === chat.otro_usuario
                );
                
                return (
                  <div
                    key={chat.otro_usuario}
                    className="usuario-item-pro"
                    onClick={() => abrirChat("privado", chat.otro_usuario)}
                  >
                    <div className="chat-item-header">
                      <div className="avatar-container" style={{ position: 'relative', display: 'inline-block' }}>
                        <img
                          src={getAvatarUrl(
                            usuariosIxora.find((u) => u.nickname === chat.otro_usuario)
                          )}
                          alt={chat.otro_usuario}
                          className="chat-avatar"
                          style={{ width: '28px', height: '28px', borderRadius: '50%' }}
                          onError={(e) => {
                            e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23e0e0e0'/%3E%3Ctext x='16' y='22' font-size='20' text-anchor='middle' fill='%23999'%3E👤%3C/text%3E%3C/svg%3E";
                          }}
                        />
                        {usuarioEnLinea && (
                          <span className="status-online-dot" title="Activo en IXORA"></span>
                        )}
                      </div>
                      <span style={{ color: getColorForName(chat.otro_usuario || "Usuario"), fontWeight: '600', fontSize: '13px' }}>
                        {chat.otro_usuario}
                      </span>
                      {/* Mostrar badge solo cuando hay mensajes no leídos */}
                      {chat.mensajes_no_leidos > 0 && (
                        <span className="chat-badge-small">
                          {chat.mensajes_no_leidos > 99 ? "99+" : chat.mensajes_no_leidos}
                        </span>
                      )}
                    </div>
                    {chat.ultimo_mensaje && (
                      <div className="ultimo-mensaje-container">
                        {esMioUltimoMensaje ? (
                          <span className="ultimo-mensaje-indicador" style={{ color: '#0aa36c', fontWeight: '600' }}>Tú:</span>
                        ) : chat.ultimo_remitente ? (
                          <span className="ultimo-mensaje-indicador" style={{ color: '#666', fontWeight: '600' }}>
                            {chat.ultimo_remitente}:
                          </span>
                        ) : (
                          <span className="ultimo-mensaje-indicador" style={{ color: '#666', fontWeight: '600' }}>
                            {chat.otro_usuario}:
                          </span>
                        )}
                        <span className="ultimo-mensaje">{chat.ultimo_mensaje}</span>
                      </div>
                    )}
                  </div>
                );
                      })}
                      {chatsActivos.length === 0 && (
                        <div className="chat-empty-pro">No hay chats activos</div>
                      )}
                    </div>
                  )}

                  {/* GRUPOS */}
                  {tabPrincipal === "grupos" && (
                    <div className="usuarios-list-pro">
                      {mostrarCrearGrupo ? (
                        <div className="crear-grupo-form">
                          <input
                            type="text"
                            placeholder="Nombre del grupo"
                            value={nuevoGrupoNombre}
                            onChange={(e) => setNuevoGrupoNombre(e.target.value)}
                            className="input-grupo"
                          />
                          <input
                            type="text"
                            placeholder="Descripción (opcional)"
                            value={nuevoGrupoDesc}
                            onChange={(e) => setNuevoGrupoDesc(e.target.value)}
                            className="input-grupo"
                          />
                          <div className="config-switch" style={{ marginTop: "8px" }}>
                            <input
                              type="checkbox"
                              checked={nuevoGrupoEsPublico}
                              onChange={(e) => setNuevoGrupoEsPublico(e.target.checked)}
                              id="grupo-publico"
                            />
                            <label htmlFor="grupo-publico" style={{ cursor: "pointer", margin: 0 }}>
                              {nuevoGrupoEsPublico ? "🌐 Grupo Público" : "🔒 Grupo Privado"}
                            </label>
                          </div>
                          <div className="botones-grupo">
                            <button onClick={crearGrupo} className="btn-crear">
                              Crear
                            </button>
                            <button
                              onClick={() => {
                                setMostrarCrearGrupo(false);
                                setNuevoGrupoNombre("");
                                setNuevoGrupoDesc("");
                              }}
                              className="btn-cancelar"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="usuario-item-pro crear-grupo-btn"
                          onClick={() => setMostrarCrearGrupo(true)}
                        >
                          <span className="grupo-icon">➕</span>
                          <span>Crear Grupo</span>
                        </div>
                      )}
                      {Array.isArray(grupos) && grupos.map((g) => {
                        const esCreador = g.creado_por === (user?.nickname || user?.name);
                        const esPublico = g.es_publico !== 0;
                        return (
                          <div
                            key={g.id}
                            className="usuario-item-pro grupo-item"
                            onClick={() => abrirChat("grupal", g.id)}
                          >
                            <span className="grupo-icon">👥</span>
                            <div className="grupo-info">
                              <div className="grupo-header-row">
                                <span className="grupo-nombre">{g.nombre}</span>
                                <span className={`grupo-badge ${esPublico ? "publico" : "privado"}`}>
                                  {esPublico ? "Público" : "Privado"}
                                </span>
                              </div>
                              {g.descripcion && (
                                <div className="grupo-desc">{g.descripcion}</div>
                              )}
                              <div className="grupo-miembros">
                                {g.miembros?.length || 0} miembros
                              </div>
                            </div>
                            <div className="grupo-actions">
                              <button
                                className="grupo-menu-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setGrupoMenuAbierto(grupoMenuAbierto === g.id ? null : g.id);
                                }}
                                title="Opciones del grupo"
                              >
                                ⋯
                              </button>
                              {grupoMenuAbierto === g.id && (
                                <div className="grupo-menu" onClick={(e) => e.stopPropagation()}>
                                  <button onClick={() => abrirChat("grupal", g.id)}>Abrir</button>
                                  <button
                                    onClick={() => {
                                      showAlert(
                                        `${g.nombre}\n\n${g.descripcion || "Sin descripción"}\n\n${g.miembros?.length || 0} miembros`,
                                        "info"
                                      );
                                      setGrupoMenuAbierto(null);
                                    }}
                                  >
                                    Ver info
                                  </button>
                                  <button
                                    onClick={() => {
                                      setGrupoAgregarMiembros(g.id);
                                      setMostrarAgregarMiembros(true);
                                      setGrupoMenuAbierto(null);
                                    }}
                                  >
                                    Agregar miembros
                                  </button>
                                  {esCreador && (
                                    <button
                                      onClick={() => {
                                        setEditandoGrupo(g);
                                        setGrupoEditNombre(g.nombre);
                                        setGrupoEditDesc(g.descripcion || "");
                                        setGrupoEditPublico(esPublico);
                                        setGrupoMenuAbierto(null);
                                      }}
                                    >
                                      Editar
                                    </button>
                                  )}
                                  {esAdmin && (
                                    <button
                                      onClick={() => {
                                        borrarGrupo(g.id);
                                        setGrupoMenuAbierto(null);
                                      }}
                                      className="menu-danger"
                                    >
                                      Borrar
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {Array.isArray(grupos) && grupos.length === 0 && !mostrarCrearGrupo && (
                        <div className="chat-empty-pro">No tienes grupos</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PANEL PRINCIPAL - CHAT ABIERTO */}
            {tipoChat && (
              <div className="chat-main-panel">
                <div className="chat-inner">
                  {perfilAbierto ? (
                    <div className="chat-profile-panel">
                      <div className="chat-profile-panel-header">
                        <button
                          className="chat-profile-back"
                          onClick={cerrarPerfilUsuario}
                          title="Volver al chat"
                        >
                          ←
                        </button>
                        <span>Perfil</span>
                      </div>
                      <div className="chat-profile-tabs">
                        <button
                          className={`chat-profile-tab ${perfilTab === "info" ? "active" : ""}`}
                          onClick={() => setPerfilTab("info")}
                        >
                          Información
                        </button>
                        <button
                          className={`chat-profile-tab ${perfilTab === "archivos" ? "active" : ""}`}
                          onClick={() => setPerfilTab("archivos")}
                        >
                          Compartidos
                        </button>
                      </div>
                      <div className="chat-profile-modal-body">
                        {perfilCargando && <div className="chat-empty-pro">Cargando...</div>}
                        {!perfilCargando && perfilError && (
                          <div className="chat-empty-pro">{perfilError}</div>
                        )}
                        {!perfilCargando && !perfilError && perfilTab === "info" && (
                          <div className="chat-profile-info">
                            <div className="chat-profile-hero-card">
                              <div className="chat-profile-hero-photo">
                                <img
                                  src={getAvatarUrl({
                                    photo: perfilData?.photo,
                                    id: perfilData?.id,
                                  })}
                                  alt={perfilData?.name || "Usuario"}
                                />
                              </div>
                              <div className="chat-profile-hero-data">
                                <div className="chat-profile-hero-name">
                                  {perfilData?.name || "No definido"}
                                </div>
                                <div className="chat-profile-hero-subtitle">
                                  {perfilData?.puesto || "Puesto no definido"}
                                </div>
                                <div className="chat-profile-hero-nick">
                                  @{perfilData?.nickname || "sin-nickname"}
                                </div>
                                <div className="chat-profile-hero-status">
                                  <span
                                    className={`chat-profile-status-dot ${
                                      estaDentroHorario(configNotificaciones) ? "active" : "inactive"
                                    }`}
                                  />
                                  <span>
                                    {estaDentroHorario(configNotificaciones)
                                      ? "Disponible"
                                      : "Notificaciones pospuestas"}
                                  </span>
                                </div>
                                <div className="chat-profile-hero-time">
                                  {new Date().toLocaleTimeString("es-MX", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}{" "}
                                  hora local
                                </div>
                              </div>
                            </div>

                            <div className="chat-profile-section">
                              <div className="chat-profile-section-title">Información de contacto</div>
                              <div className="chat-profile-card">
                                <span>Correo</span>
                                <strong>{perfilData?.correo || "No definido"}</strong>
                              </div>
                            </div>

                            <div className="chat-profile-section">
                              <div className="chat-profile-section-title">Acerca de mí</div>
                              <div className="chat-profile-card">
                                <span>Teléfono</span>
                                <strong>
                                  {perfilData?.telefono_visible
                                    ? perfilData?.telefono || "No definido"
                                    : "No visible"}
                                </strong>
                              </div>
                              <div className="chat-profile-card">
                                <span>Cumpleaños</span>
                                <strong>
                                  {perfilData?.birthday 
                                    ? `${perfilData.birthday}${calcularEdad(perfilData.birthday) ? ` (${calcularEdad(perfilData.birthday)} años)` : ""}`
                                    : "No definido"}
                                </strong>
                              </div>
                            </div>
                          </div>
                        )}
                        {!perfilCargando && !perfilError && perfilTab === "archivos" && (
                          <div className="chat-profile-files">
                            <div className="chat-profile-subtabs">
                              <button
                                className={`chat-profile-subtab ${perfilCompartidosTab === "imagenes" ? "active" : ""}`}
                                onClick={() => setPerfilCompartidosTab("imagenes")}
                              >
                                Imágenes
                              </button>
                              <button
                                className={`chat-profile-subtab ${perfilCompartidosTab === "videos" ? "active" : ""}`}
                                onClick={() => setPerfilCompartidosTab("videos")}
                              >
                                Videos
                              </button>
                              <button
                                className={`chat-profile-subtab ${perfilCompartidosTab === "archivos" ? "active" : ""}`}
                                onClick={() => setPerfilCompartidosTab("archivos")}
                              >
                                Archivos
                              </button>
                              <button
                                className={`chat-profile-subtab ${perfilCompartidosTab === "enlaces" ? "active" : ""}`}
                                onClick={() => setPerfilCompartidosTab("enlaces")}
                              >
                                Enlaces
                              </button>
                            </div>
                            {perfilCompartidosTab === "imagenes" && (
                              <>
                                {compartidosImagenes.length === 0 ? (
                                  <div className="chat-empty-pro">No hay imágenes</div>
                                ) : (
                                  compartidosImagenes.map((archivo) => (
                                    <button
                                      key={`img-${archivo.id}`}
                                      className="chat-profile-file"
                                      onClick={() => abrirArchivoPrivado(archivo)}
                                    >
                                      <div className="chat-profile-file-name">
                                        🖼️ {archivo.archivo_nombre || "Imagen"}
                                      </div>
                                      <div className="chat-profile-file-meta">
                                        {archivo.de_nickname} · {new Date(archivo.fecha).toLocaleDateString("es-MX")}
                                      </div>
                                    </button>
                                  ))
                                )}
                              </>
                            )}
                            {perfilCompartidosTab === "videos" && (
                              <>
                                {compartidosVideos.length === 0 ? (
                                  <div className="chat-empty-pro">No hay videos</div>
                                ) : (
                                  compartidosVideos.map((archivo) => (
                                    <button
                                      key={`vid-${archivo.id}`}
                                      className="chat-profile-file"
                                      onClick={() => abrirArchivoPrivado(archivo)}
                                    >
                                      <div className="chat-profile-file-name">
                                        🎞️ {archivo.archivo_nombre || "Video"}
                                      </div>
                                      <div className="chat-profile-file-meta">
                                        {archivo.de_nickname} · {new Date(archivo.fecha).toLocaleDateString("es-MX")}
                                      </div>
                                    </button>
                                  ))
                                )}
                              </>
                            )}
                            {perfilCompartidosTab === "archivos" && (
                              <>
                                {compartidosArchivos.length === 0 ? (
                                  <div className="chat-empty-pro">No hay archivos</div>
                                ) : (
                                  compartidosArchivos.map((archivo) => (
                                    <button
                                      key={`file-${archivo.id}`}
                                      className="chat-profile-file"
                                      onClick={() => abrirArchivoPrivado(archivo)}
                                    >
                                      <div className="chat-profile-file-name">
                                        📎 {archivo.archivo_nombre || "Archivo"}
                                      </div>
                                      <div className="chat-profile-file-meta">
                                        {archivo.de_nickname} ·{" "}
                                        {archivo.archivo_tamaño
                                          ? `${(archivo.archivo_tamaño / 1024).toFixed(1)} KB`
                                          : "Tamaño desconocido"}{" "}
                                        · {new Date(archivo.fecha).toLocaleDateString("es-MX")}
                                      </div>
                                    </button>
                                  ))
                                )}
                              </>
                            )}
                            {perfilCompartidosTab === "enlaces" && (
                              <>
                                {compartidosEnlaces.length === 0 ? (
                                  <div className="chat-empty-pro">No hay enlaces</div>
                                ) : (
                                  compartidosEnlaces.map((item) => (
                                    <a
                                      key={`link-${item.id}`}
                                      href={item.enlace_compartido}
                                      className="chat-profile-file"
                                      target={esEnlaceExterno(item.enlace_compartido) ? "_blank" : undefined}
                                      rel={esEnlaceExterno(item.enlace_compartido) ? "noopener noreferrer" : undefined}
                                    >
                                      <div className="chat-profile-file-name">
                                        🔗 {item.enlace_compartido}
                                      </div>
                                      <div className="chat-profile-file-meta">
                                        {item.de_nickname} · {new Date(item.fecha).toLocaleDateString("es-MX")}
                                      </div>
                                    </a>
                                  ))
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="chat-panel-body">
                      <div className="chat-header-pro">
                        {tipoChat === "general" ? (
                          <>
                            <div className="chat-header-left">
                              <span className="grupo-icon">🌐</span>
                              <span className="chat-header-title">
                                <strong>Chat General</strong>
                              </span>
                            </div>
                            {esAdmin && (
                              <button
                                className="chat-delete-btn"
                                onClick={limpiarChat}
                                title="Vaciar historial (Solo admin)"
                              >
                                🗑
                              </button>
                            )}
                          </>
                        ) : tipoChat === "privado" ? (
                          <>
                            <div className="chat-header-left">
                              <img
                                src={getAvatarUrl(
                                  usuariosIxora.find((u) => u.nickname === chatActual)
                                )}
                                alt={chatActual}
                                className="chat-avatar header-avatar"
                                onError={(e) => {
                                  e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23e0e0e0'/%3E%3Ctext x='16' y='22' font-size='20' text-anchor='middle' fill='%23999'%3E👤%3C/text%3E%3C/svg%3E";
                                }}
                              />
                              <span className="chat-header-title">
                                <button
                                  className="chat-header-name-button"
                                  onClick={() => abrirPerfilUsuario(chatActual)}
                                  title="Ver información y archivos"
                                  type="button"
                                >
                                  <strong style={{ color: getColorForName(chatActual || "Usuario") }}>
                                    {chatActual}
                                  </strong>
                                </button>
                              </span>
                            </div>
                            <button
                              className="chat-delete-btn"
                              onClick={limpiarChat}
                              title="Borrar conversación"
                            >
                              🗑
                            </button>
                          </>
                        ) : tipoChat === "grupal" ? (
                          <>
                            <div className="chat-header-left">
                              <span className="grupo-icon">👥</span>
                              <span className="chat-header-title">
                                <strong>
                                  {(Array.isArray(grupos) && grupos.find((g) => String(g.id) === String(chatActual))?.nombre) ||
                                    "Grupo"}
                                </strong>
                              </span>
                            </div>
                            <div className="chat-header-actions">
                              <button
                                className="chat-add-member-btn"
                                onClick={() => {
                                  setGrupoAgregarMiembros(chatActual);
                                  setMostrarAgregarMiembros(true);
                                }}
                                title="Agregar miembros"
                              >
                                ➕
                              </button>
                            </div>
                          </>
                        ) : null}
                      </div>
                      {mensajeFijado && (
                        <div className="chat-pinned-bar">
                          <span className="chat-pinned-icon">📌</span>
                          <span className="chat-pinned-text">
                            {mensajeFijado.mensaje ||
                              mensajeFijado.archivo_nombre ||
                              "Mensaje fijado"}
                          </span>
                          <button
                            className="chat-pinned-close"
                            onClick={desfijarMensaje}
                            title="Desfijar"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                      {seleccionModo && (
                        <div className="chat-selection-bar">
                          <span>{seleccionMensajes.size} seleccionados</span>
                          <div className="chat-selection-actions">
                            <button onClick={eliminarMensajesSeleccionados}>Eliminar</button>
                            <button onClick={salirSeleccion}>Cancelar</button>
                          </div>
                        </div>
                      )}

                      <div className="chat-body-pro" ref={chatBodyRef}>
                        {mensajesActuales.length === 0 && (
                          <div className="chat-empty-pro">No hay mensajes</div>
                        )}

                        {mensajesActuales.map((m, i) => {
                          const userDisplayName = user?.nickname || user?.name;
                          const esMio =
                            m.usuario_nickname === userDisplayName ||
                            m.de_nickname === userDisplayName;
                          const msgKey = m.id || i;
                          const mensajeId = m.id || null;
                          const estaSeleccionado = mensajeId
                            ? seleccionMensajes.has(mensajeId)
                            : false;
                          const msgIdStr = String(m.id || "");
                          const estaDestacado = msgIdStr && mensajesDestacados.has(msgIdStr);
                          const fueLeido =
                            tipoChat === "privado" &&
                            esMio &&
                            !!lecturasPrivadas[msgIdStr];
                          const fueEntregado =
                            tipoChat === "privado" && esMio;

                          // Calcular el nombre del remitente correctamente
                          let otroNickname = "Usuario";
                          if (tipoChat === "general") {
                            otroNickname = m.usuario_nickname || "Usuario";
                          } else if (tipoChat === "privado") {
                            // En chat privado, el remitente es quien envió el mensaje
                            otroNickname = m.de_nickname || chatActual || "Usuario";
                          } else if (tipoChat === "grupal") {
                            otroNickname = m.usuario_nickname || "Usuario";
                          }

                          return (
                            <div
                              key={i}
                              className={
                                esMio ? "msg-row msg-row-out" : "msg-row msg-row-in"
                              }
                            >
                              {!esMio && (
                                <img
                                  src={
                                    m.usuario_photo
                                      ? (m.usuario_photo.startsWith("http") || m.usuario_photo.startsWith("/uploads")
                                          ? (m.usuario_photo.startsWith("http")
                                              ? m.usuario_photo
                                              : `${SERVER_URL}${m.usuario_photo}`)
                                          : `${SERVER_URL}/uploads/perfiles/${m.usuario_photo}`)
                                      : m.de_photo
                                      ? (m.de_photo.startsWith("http") || m.de_photo.startsWith("/uploads")
                                          ? (m.de_photo.startsWith("http")
                                              ? m.de_photo
                                              : `${SERVER_URL}${m.de_photo}`)
                                          : `${SERVER_URL}/uploads/perfiles/${m.de_photo}`)
                                      : getAvatarUrl({})
                                  }
                                  alt=""
                                  className="chat-avatar msg-avatar"
                                  onError={(e) => {
                                    e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23e0e0e0'/%3E%3Ctext x='16' y='22' font-size='20' text-anchor='middle' fill='%23999'%3E👤%3C/text%3E%3C/svg%3E";
                                  }}
                                />
                              )}

                              <div
                                className={`${esMio ? "msg-yo-pro" : "msg-otro-pro"} ${
                                  estaSeleccionado ? "msg-selected" : ""
                                }`}
                                style={{
                                  borderColor: esMio
                                    ? getColorForName(userDisplayName || "Usuario")
                                    : getColorForName(otroNickname),
                                }}
                                onClick={(e) => {
                                  if (!seleccionModo || !mensajeId) return;
                                  if (
                                    e.target.closest("button") ||
                                    e.target.closest("a") ||
                                    e.target.closest(".msg-archivo-link")
                                  ) {
                                    return;
                                  }
                                  toggleSeleccionMensaje(mensajeId);
                                }}
                                onContextMenu={(e) =>
                                  abrirMenuMensaje(e, {
                                    mensaje: m,
                                    msgKey,
                                    esMio,
                                    otroNickname,
                                  })
                                }
                                onTouchStart={() =>
                                  iniciarPress({
                                    mensaje: m,
                                    msgKey,
                                    esMio,
                                    otroNickname,
                                  })
                                }
                                onTouchEnd={cancelarPress}
                                onTouchMove={marcarMovimiento}
                              >
                                {tipoChat === "privado" && (
                                  <div className={`msg-usuario-nombre ${esMio ? "msg-yo-label" : "msg-otro-label"}`}>
                                    {esMio ? "Tú" : otroNickname}
                                  </div>
                                )}
                                {tipoChat !== "privado" && !esMio && (
                                  <div className="msg-usuario-nombre">{otroNickname}</div>
                                )}
                                {(m.reenviado_de_usuario || m.reenviado_de_chat) && (
                                  <div className="msg-forwarded">
                                    Reenviado · {m.reenviado_de_usuario || "Usuario"} ·{" "}
                                    {m.reenviado_de_chat || "Chat"}
                                  </div>
                                )}
                                {m.reply_to_text && (
                                  <div className="msg-reply">
                                    <span className="msg-reply-user">
                                      {m.reply_to_user || "Usuario"}
                                    </span>
                                    <span className="msg-reply-text">
                                      {m.reply_to_text}
                                    </span>
                                  </div>
                                )}
                                <div className="msg-contenido">
                                  {editandoMensaje === m.id ? (
                                    <div className="msg-editar-form">
                                      <input
                                        type="text"
                                        value={textoEdicion}
                                        onChange={(e) => setTextoEdicion(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            guardarEdicion();
                                          } else if (e.key === "Escape") {
                                            cancelarEdicion();
                                          }
                                        }}
                                        autoFocus
                                      />
                                      <button onClick={guardarEdicion} className="btn-guardar-edicion">✓</button>
                                      <button onClick={cancelarEdicion} className="btn-cancelar-edicion">✕</button>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="msg-texto">
                                        {m.menciona && (
                                          <button
                                            type="button"
                                            className="msg-mention-link"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              abrirChat("privado", m.menciona);
                                            }}
                                          >
                                            @{m.menciona}
                                          </button>
                                        )}
                                        {m.enlace_compartido && (
                                          <a
                                            href={m.enlace_compartido.startsWith("http") ? m.enlace_compartido : `#${m.enlace_compartido}`}
                                            className="msg-enlace"
                                            target={esEnlaceExterno(m.enlace_compartido) ? "_blank" : undefined}
                                            rel={esEnlaceExterno(m.enlace_compartido) ? "noopener noreferrer" : undefined}
                                          >
                                            {m.enlace_compartido}
                                          </a>
                                        )}
                                        {(!m.enlace_compartido || m.mensaje !== m.enlace_compartido) && (
                                          <span
                                            className="msg-texto-html"
                                            dangerouslySetInnerHTML={{
                                              __html: formatearMensaje(m.mensaje || ""),
                                            }}
                                          />
                                        )}
                                        {m.mensaje_editado === 1 && (
                                          <span className="msg-editado-indicador" title={`Editado el ${new Date(m.fecha_edicion).toLocaleString("es-MX")}`}>
                                            (editado)
                                          </span>
                                        )}
                                      </div>
                                      {m.enlace_compartido && (
                                        (() => {
                                          const preview = obtenerPreviewEnlace(m.enlace_compartido);
                                          if (preview) {
                                            return (
                                              <a
                                                href={preview.link}
                                                className="msg-link-preview"
                                                target={preview.esInterno ? undefined : "_blank"}
                                                rel={preview.esInterno ? undefined : "noopener noreferrer"}
                                                onClick={(e) => {
                                                  if (!preview.link.startsWith("http")) {
                                                    e.preventDefault();
                                                    abrirEnApp(preview.link);
                                                  }
                                                }}
                                              >
                                                <img 
                                                  src={preview.imageUrl} 
                                                  alt={preview.titulo}
                                                  onError={(e) => {
                                                    // Si falla la imagen, ocultarla
                                                    e.target.style.display = 'none';
                                                  }}
                                                />
                                                <div className="msg-link-preview-content">
                                                  <div className="msg-link-preview-title">{preview.titulo}</div>
                                                  <div className="msg-link-preview-subtitle">{preview.subtitulo}</div>
                                                </div>
                                              </a>
                                            );
                                          }
                                          // Si no hay preview, mostrar el enlace como link clickeable
                                          return (
                                            <a
                                              href={m.enlace_compartido.startsWith("http") ? m.enlace_compartido : `#${m.enlace_compartido}`}
                                              className="msg-enlace"
                                              target={esEnlaceExterno(m.enlace_compartido) ? "_blank" : undefined}
                                              rel={esEnlaceExterno(m.enlace_compartido) ? "noopener noreferrer" : undefined}
                                              onClick={(e) => {
                                                if (!m.enlace_compartido.startsWith("http")) {
                                                  e.preventDefault();
                                                  abrirEnApp(m.enlace_compartido);
                                                }
                                              }}
                                            >
                                              🔗 {m.enlace_compartido}
                                            </a>
                                          );
                                        })()
                                      )}
                                      {m.archivo_url && (
                                        <div className="msg-archivo">
                                          <button
                                            type="button"
                                            className="msg-archivo-link"
                                            onClick={() =>
                                              abrirArchivoPrivado({
                                                archivo_url: m.archivo_url,
                                                archivo_nombre: m.archivo_nombre,
                                                archivo_tamaño: m.archivo_tamaño,
                                                archivo_tipo: m.archivo_tipo,
                                              })
                                            }
                                          >
                                            📎 {m.archivo_nombre || "Archivo"}
                                            {m.archivo_tamaño && (
                                              <span className="msg-archivo-tamaño">
                                                {" "}({(m.archivo_tamaño / 1024).toFixed(1)} KB)
                                              </span>
                                            )}
                                          </button>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                                <div className="msg-footer">
                                  <div className="msg-hora">
                                    {new Date(m.fecha).toLocaleTimeString("es-MX", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </div>
                                  {estaDestacado && <span className="msg-star">⭐</span>}
                                  {fueEntregado && (
                                    <span
                                      className={`msg-read-indicator ${
                                        fueLeido ? "read" : "delivered"
                                      }`}
                                      title={fueLeido ? "Leído" : "Recibido"}
                                    />
                                  )}
                                </div>
                                {reacciones[msgKey] && (
                                  <div className="msg-reacciones">
                                    <div className="msg-reaccion-picker">
                                      {emojiOrdenados.map((emoji) => (
                                        <button
                                          key={`${msgKey}-${emoji}`}
                                          className={`msg-reaccion-btn ${
                                            reacciones[msgKey]?.[emoji] ? "active" : ""
                                          }`}
                                          onClick={() => toggleReaccion(msgKey, emoji)}
                                        >
                                          {emoji}
                                        </button>
                                      ))}
                                    </div>
                                    <div className="msg-reaccion-list">
                                      {emojiOrdenados
                                        .filter((emoji) => reacciones[msgKey]?.[emoji])
                                        .map((emoji) => (
                                          <span key={`${msgKey}-r-${emoji}`} className="msg-reaccion-pill">
                                            {emoji} 1
                                          </span>
                                        ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="chat-input-pro">
                        {respondiendoMensaje && (
                          <div className="chat-reply-bar">
                            <div className="chat-reply-info">
                              <span>Respondiendo a {respondiendoMensaje.usuario}</span>
                              <strong>{respondiendoMensaje.texto}</strong>
                            </div>
                            <button
                              className="chat-reply-cancel"
                              onClick={() => setRespondiendoMensaje(null)}
                            >
                              ✕
                            </button>
                          </div>
                        )}
                        {archivoAdjunto && (
                          <div className="archivo-adjunto-preview">
                            <span>📎 {archivoAdjunto.name}</span>
                            <button
                              className="btn-remover-archivo"
                              onClick={() => setArchivoAdjunto(null)}
                            >
                              ✕
                            </button>
                          </div>
                        )}
                        {mostrarToolbarFormato && (
                          <div className="chat-input-toolbar">
                            <div className="chat-toolbar-left">
                              <button className="chat-btn-tool" title="Negrita" onClick={() => aplicarFormato("**")}>
                                <strong>B</strong>
                              </button>
                              <button className="chat-btn-tool" title="Itálica" onClick={() => aplicarFormato("*")}>
                                <em>I</em>
                              </button>
                              <button className="chat-btn-tool" title="Subrayado" onClick={() => aplicarFormato("__")}>
                                <u>U</u>
                              </button>
                              <button className="chat-btn-tool" title="Tachado" onClick={() => aplicarFormato("~~")}>
                                <s>S</s>
                              </button>
                              <button className="chat-btn-tool" title="Código" onClick={() => aplicarFormato("`")}>
                                {"</>"}
                              </button>
                              <button className="chat-btn-tool" title="Link" onClick={insertarLink}>
                                🔗
                              </button>
                              <button className="chat-btn-tool" title="Lista" onClick={() => insertarLista(false)}>
                                •
                              </button>
                              <button className="chat-btn-tool" title="Lista numerada" onClick={() => insertarLista(true)}>
                                1.
                              </button>
                              <button className="chat-btn-tool" title="Cita" onClick={insertarCita}>
                                ""
                              </button>
                            </div>
                          </div>
                        )}
                        <input
                          type="file"
                          style={{ display: "none" }}
                          ref={fileInputRef}
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              const file = e.target.files[0];
                              adjuntarArchivo(file);
                            }
                          }}
                        />
                        <input
                          type="file"
                          style={{ display: "none" }}
                          ref={imageInputRef}
                          accept="image/*"
                          multiple
                          onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              manejarGaleria(e.target.files);
                            }
                          }}
                        />
                        <input
                          type="file"
                          style={{ display: "none" }}
                          ref={videoInputRef}
                          accept="video/*"
                          capture="environment"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              adjuntarArchivo(e.target.files[0]);
                            }
                          }}
                        />
                        <input
                          type="file"
                          style={{ display: "none" }}
                          ref={gifInputRef}
                          accept="image/gif"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              adjuntarArchivo(e.target.files[0]);
                            }
                          }}
                        />
                        <div className="chat-input-quick">
                          <button
                            className="chat-btn-quick"
                            onClick={() => (esMovil() ? abrirAdjuntosMobile() : fileInputRef.current?.click())}
                            title="Adjuntar archivo"
                          >
                            ➕
                          </button>
                          <button
                            className={`chat-btn-quick ${mostrarToolbarFormato ? "active" : ""}`}
                            onClick={() => setMostrarToolbarFormato((prev) => !prev)}
                            title="Formato"
                          >
                            Aa
                          </button>
                          <button
                            className="chat-btn-quick"
                            title="Emoji"
                            onClick={() => setInputEmojiAbierto((prev) => !prev)}
                          >
                            😄
                          </button>
                          <button
                            className="chat-btn-quick"
                            title="Mención"
                            onClick={() => insertarTexto("@")}
                          >
                            @
                          </button>
                          <button
                            className="chat-btn-quick"
                            title="Videollamada"
                            onClick={abrirVideollamada}
                          >
                            📹
                          </button>
                          <button
                            className={`chat-btn-quick ${isRecording ? "grabando" : ""}`}
                            onClick={isRecording ? detenerGrabacionVoz : iniciarGrabacionVoz}
                            title={isRecording ? "Detener grabación" : "Nota de voz"}
                          >
                            {isRecording ? "⏹️" : "🎤"}
                          </button>
                        </div>
                        {inputEmojiAbierto && (
                          <div className="chat-input-emoji-picker">
                            {emojiExtra.map((emoji) => (
                              <button
                                key={`input-emoji-${emoji}`}
                                className="msg-emoji-btn"
                                onClick={() => {
                                  insertarTexto(emoji);
                                  setEmojiUso((prev) => ({
                                    ...prev,
                                    [emoji]: (prev[emoji] || 0) + 1,
                                  }));
                                  setInputEmojiAbierto(false);
                                }}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="chat-input-row">
                          <textarea
                            ref={mensajeInputRef}
                            value={mensajeInput}
                            onChange={(e) => {
                              const texto = e.target.value;
                              setMensajeInput(texto);

                              // Detectar @mentions
                              const ultimoArroba = texto.lastIndexOf("@");
                              if (ultimoArroba !== -1) {
                                const textoDespuesArroba = texto.substring(ultimoArroba + 1);
                                const espacioSiguiente = textoDespuesArroba.indexOf(" ");
                                if (espacioSiguiente === -1 || espacioSiguiente > 0) {
                                  const busqueda = espacioSiguiente === -1
                                    ? textoDespuesArroba
                                    : textoDespuesArroba.substring(0, espacioSiguiente);
                                  const sugerencias = usuariosIxora
                                    .filter((u) => {
                                      const nombre = u.nickname || u.name || "";
                                      return nombre.toLowerCase().includes(busqueda.toLowerCase()) &&
                                             nombre !== (user?.nickname || user?.name);
                                    })
                                    .slice(0, 5);
                                  if (sugerencias.length > 0) {
                                    setMostrarSugerenciasMencion(true);
                                    setSugerenciasMencion(sugerencias);
                                    setPosicionMencion(ultimoArroba);
                                  } else {
                                    setMostrarSugerenciasMencion(false);
                                  }
                                } else {
                                  setMostrarSugerenciasMencion(false);
                                }
                              } else {
                                setMostrarSugerenciasMencion(false);
                              }
                            }}
                            placeholder={
                              tipoChat === "privado" && chatActual
                                ? `Mensaje @${chatActual}`
                                : "Escribe un mensaje..."
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                              if (manejarEnterLista(e)) return;
                              e.preventDefault();
                              enviarMensaje();
                              } else if (e.key === "Escape") {
                                setMostrarSugerenciasMencion(false);
                              }
                            }}
                            className="chat-input-textarea"
                            rows={2}
                          />
                          <button onClick={enviarMensaje} className="chat-btn-enviar">➤</button>
                        </div>
                        {mostrarSugerenciasMencion && sugerenciasMencion.length > 0 && (
                          <div className="sugerencias-mention">
                            {sugerenciasMencion.map((u) => (
                              <div
                                key={u.id}
                                className="sugerencia-item"
                                onClick={() => {
                                  const nombre = u.nickname || u.name || "";
                                  const textoAntes = mensajeInput.substring(0, posicionMencion);
                                  const textoDespues = mensajeInput.substring(
                                    posicionMencion + 1 + (mensajeInput.substring(posicionMencion + 1).split(" ")[0] || "").length
                                  );
                                  setMensajeInput(`${textoAntes}@${nombre} ${textoDespues}`);
                                  setMostrarSugerenciasMencion(false);
                                  mensajeInputRef.current?.focus();
                                }}
                              >
                                <img
                                  src={getAvatarUrl(u)}
                                  alt={u.nickname || u.name || ""}
                                  className="chat-avatar-small"
                                />
                                <span>{u.nickname || u.name || ""}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {previewItem && (
        <div className="chat-preview-overlay">
          <div className="chat-preview-content">
            <div className="chat-preview-header">
              <button className="chat-preview-back" onClick={cerrarPreview}>
                ←
              </button>
              <span className="chat-preview-title">
                {previewItem.archivo_nombre || previewItem.enlace_compartido || "Contenido compartido"}
              </span>
              <button className="chat-preview-close" onClick={cerrarPreview}>
                ✕
              </button>
            </div>
            <div className="chat-preview-body">
              {previewLoading && <div className="chat-empty-pro">Cargando...</div>}
              {!previewLoading && previewTipo === "imagen" && previewUrl && (
                <img src={previewUrl} alt={previewItem.archivo_nombre || "Imagen"} />
              )}
              {!previewLoading && previewTipo === "video" && previewUrl && (
                <video src={previewUrl} controls />
              )}
              {!previewLoading && previewTipo === "archivo" && (
                <div className="chat-preview-file">
                  <div style={{ fontSize: "1.1rem", fontWeight: "600", marginBottom: "8px" }}>
                    📎 {previewItem.archivo_nombre || "Archivo"}
                  </div>
                  {previewItem.archivo_tamaño && (
                    <div className="chat-preview-meta" style={{ marginBottom: "12px" }}>
                      Tamaño: {(previewItem.archivo_tamaño / 1024).toFixed(1)} KB
                    </div>
                  )}
                  {previewItem.archivo_tipo && (
                    <div className="chat-preview-meta" style={{ marginBottom: "12px", fontSize: "0.85rem" }}>
                      Tipo: {previewItem.archivo_tipo}
                    </div>
                  )}
                  {previewError ? (
                    <div style={{ 
                      width: "100%", 
                      padding: "20px", 
                      textAlign: "center",
                      color: "var(--error)",
                      background: "var(--fondo-input)",
                      borderRadius: "var(--radio-md)",
                      border: "1px solid var(--error)"
                    }}>
                      <div style={{ fontSize: "2rem", marginBottom: "12px" }}>⚠️</div>
                      <div style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "8px" }}>
                        Error al cargar la vista previa
                      </div>
                      <div style={{ fontSize: "0.85rem", marginBottom: "16px" }}>
                        {previewError}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--chat-muted)" }}>
                        Puedes intentar descargar el archivo usando el botón de abajo
                      </div>
                    </div>
                  ) : previewUrl || previewTextContent ? (
                    <div style={{ marginBottom: "12px", width: "100%", height: "60vh", minHeight: "400px" }}>
                      {previewItem.archivo_tipo === "application/pdf" ? (
                        <div style={{ width: "100%", height: "100%", position: "relative" }}>
                          <iframe
                            title="Vista previa PDF"
                            src={`${previewUrl}#toolbar=1&navpanes=1&scrollbar=1`}
                            className="chat-preview-iframe"
                            style={{ 
                              width: "100%", 
                              height: "100%", 
                              border: "1px solid var(--chat-border)",
                              borderRadius: "var(--radio-md)"
                            }}
                            onLoad={() => {
                              console.log("✅ PDF cargado en iframe");
                            }}
                            onError={(e) => {
                              console.error("❌ Error cargando PDF en iframe:", e);
                              setPreviewError("No se pudo cargar el PDF en el visor. Intenta descargarlo.");
                            }}
                          />
                        </div>
                      ) : previewItem.archivo_tipo?.startsWith("text/") && previewTextContent ? (
                        <div style={{
                          width: "100%",
                          height: "100%",
                          border: "1px solid var(--chat-border)",
                          borderRadius: "var(--radio-md)",
                          background: "var(--fondo-input)",
                          padding: "16px",
                          overflow: "auto",
                          fontFamily: "monospace",
                          fontSize: "0.9rem",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          color: "var(--chat-text)",
                          lineHeight: "1.5"
                        }}>
                          {previewTextContent}
                        </div>
                      ) : previewItem.archivo_tipo?.startsWith("text/") ? (
                        <div style={{ width: "100%", height: "100%", position: "relative" }}>
                          <iframe
                            title="Vista previa texto"
                            src={previewUrl}
                            className="chat-preview-iframe"
                            style={{ 
                              width: "100%", 
                              height: "100%", 
                              border: "1px solid var(--chat-border)",
                              borderRadius: "var(--radio-md)"
                            }}
                            onLoad={() => {
                              console.log("✅ Texto cargado en iframe");
                            }}
                            onError={(e) => {
                              console.error("❌ Error cargando texto en iframe:", e);
                              setPreviewError("No se pudo cargar el archivo de texto en el visor.");
                            }}
                          />
                        </div>
                      ) : previewItem.archivo_tipo?.includes("html") ? (
                        <div style={{ width: "100%", height: "100%", position: "relative" }}>
                          <iframe
                            title="Vista previa HTML"
                            src={previewUrl}
                            className="chat-preview-iframe"
                            sandbox="allow-same-origin allow-scripts"
                            style={{ 
                              width: "100%", 
                              height: "100%", 
                              border: "1px solid var(--chat-border)",
                              borderRadius: "var(--radio-md)"
                            }}
                            onLoad={() => {
                              console.log("✅ HTML cargado en iframe");
                            }}
                            onError={(e) => {
                              console.error("❌ Error cargando HTML en iframe:", e);
                              setPreviewError("No se pudo cargar el archivo HTML en el visor.");
                            }}
                          />
                        </div>
                      ) : (
                        <div style={{ 
                          width: "100%", 
                          height: "100%", 
                          display: "flex", 
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "1px solid var(--chat-border)",
                          borderRadius: "var(--radio-md)",
                          background: "var(--fondo-input)",
                          padding: "20px",
                          textAlign: "center"
                        }}>
                          <div style={{ fontSize: "3rem", marginBottom: "12px" }}>📄</div>
                          <div style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "8px" }}>
                            {previewItem.archivo_nombre || "Archivo"}
                          </div>
                          <div style={{ fontSize: "0.85rem", color: "var(--chat-muted)", marginBottom: "16px" }}>
                            Este tipo de archivo no se puede previsualizar en el navegador
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "var(--chat-muted)" }}>
                            Usa el botón "Descargar" para abrirlo con una aplicación externa
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="chat-preview-meta" style={{ marginBottom: "12px" }}>
                      Vista previa no disponible. Puedes descargarlo usando el botón de abajo.
                    </div>
                  )}
                </div>
              )}
              {!previewLoading && previewTipo === "enlace" && (
                <div className="chat-preview-link">
                  {(() => {
                    const preview = obtenerPreviewEnlace(previewItem.enlace_compartido);
                    if (preview) {
                      return (
                        <div className="chat-preview-link-content">
                          <div className="chat-preview-link-header">
                            {preview.imageUrl && (
                              <img 
                                src={preview.imageUrl} 
                                alt={preview.titulo}
                                className="chat-preview-link-icon"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                }}
                              />
                            )}
                            <div className="chat-preview-link-info">
                              <div className="chat-preview-link-title">{preview.titulo}</div>
                              <div className="chat-preview-link-subtitle">{preview.subtitulo}</div>
                              <div className="chat-preview-link-url">{preview.link}</div>
                            </div>
                          </div>
                          <button
                            className="chat-preview-open"
                            onClick={() => abrirEnApp(previewItem.enlace_compartido)}
                          >
                            🔗 Abrir enlace
                          </button>
                        </div>
                      );
                    }
                    // Fallback si no hay preview
                    return (
                      <div className="chat-preview-link-content">
                        <div className="chat-preview-link-info">
                          <div className="chat-preview-link-title">Enlace compartido</div>
                          <div className="chat-preview-link-url">{previewItem.enlace_compartido}</div>
                        </div>
                        <button
                          className="chat-preview-open"
                          onClick={() => abrirEnApp(previewItem.enlace_compartido)}
                        >
                          🔗 Abrir enlace
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
            {previewItem.archivo_url && (
              <button
                className="chat-preview-download"
                onClick={() => descargarArchivoPrivado(previewItem)}
              >
                Descargar
              </button>
            )}
          </div>
        </div>
      )}

      {callIncoming && !callActivo && (
        <div className="call-overlay">
          <div className="call-incoming-card">
            <div className="call-title">Videollamada entrante</div>
            <div className="call-user">{callIncoming.fromNickname || "Usuario"}</div>
            <div className="call-actions">
              <button className="call-btn accept" onClick={aceptarLlamada}>
                Aceptar
              </button>
              <button className="call-btn reject" onClick={rechazarLlamada}>
                Rechazar
              </button>
            </div>
          </div>
        </div>
      )}

      {callActivo && (
        <div className="call-overlay">
          <div className="call-window">
            <div className="call-header">
              <div className="call-title">
                Videollamada {tipoChat === "grupal" ? "Grupal" : "Privada"}
              </div>
              <button className="call-close" onClick={colgarLlamada}>
                ✕
              </button>
            </div>
            <div className="call-videos">
              <div className="call-video-box local">
                <video
                  className="call-video"
                  muted
                  autoPlay
                  playsInline
                  ref={(el) => {
                    if (el && localStream) {
                      el.srcObject = localStream;
                    }
                  }}
                />
                <span className="call-label">Tú</span>
              </div>
              {remoteStreams.length === 0 && (
                <div className="call-empty">Esperando participantes...</div>
              )}
              {remoteStreams.map((item) => (
                <div key={item.id} className="call-video-box">
                  <video
                    className="call-video"
                    autoPlay
                    playsInline
                    ref={(el) => {
                      if (el && item.stream) {
                        el.srcObject = item.stream;
                      }
                    }}
                  />
                  <span className="call-label">{item.nickname || "Usuario"}</span>
                </div>
              ))}
            </div>
            <div className="call-controls">
              <button
                className={`call-control ${callMuted ? "active" : ""}`}
                onClick={toggleMute}
              >
                {callMuted ? "🔇" : "🎤"}
              </button>
              <button
                className={`call-control ${callVideoOff ? "active" : ""}`}
                onClick={toggleVideo}
              >
                {callVideoOff ? "📷✖" : "📷"}
              </button>
              <button className="call-control hangup" onClick={colgarLlamada}>
                Colgar
              </button>
            </div>
          </div>
        </div>
      )}

      {menuMensaje && (
        <div
          className={`msg-menu-backdrop ${menuMensaje.desdeLongPress ? "mobile" : ""}`}
          onClick={cerrarMenuMensaje}
        >
          {menuMensaje.desdeLongPress && (
            <div className="msg-menu-preview" onClick={(e) => e.stopPropagation()}>
              {renderMenuPreview(
                menuMensaje.mensaje,
                menuMensaje.esMio,
                menuMensaje.otroNickname
              )}
            </div>
          )}
          <div
            className={`msg-menu ${menuMensaje.desdeLongPress ? "mobile" : ""}`}
            style={
              menuMensaje.desdeLongPress
                ? undefined
                : { left: menuMensaje.x, top: menuMensaje.y }
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="msg-menu-reacciones">
              {emojiOrdenados.map((emoji) => (
                <button
                  key={`menu-${menuMensaje.msgKey}-${emoji}`}
                  className={`msg-reaccion-btn ${
                    reacciones[menuMensaje.msgKey]?.[emoji] ? "active" : ""
                  }`}
                  onClick={() => {
                    toggleReaccion(menuMensaje.msgKey, emoji);
                    cerrarMenuMensaje();
                  }}
                >
                  {emoji}
                </button>
              ))}
              <button
                className="msg-reaccion-btn"
                onClick={() => {
                  setMenuEmojiAbierto((prev) => !prev);
                }}
              >
                ➕
              </button>
            </div>
            {menuEmojiAbierto && (
              <div className="msg-emoji-picker">
                {emojiExtra.map((emoji) => (
                  <button
                    key={`extra-${menuMensaje.msgKey}-${emoji}`}
                    className="msg-emoji-btn"
                    onClick={() => {
                      toggleReaccion(menuMensaje.msgKey, emoji);
                      setMenuEmojiAbierto(false);
                      cerrarMenuMensaje();
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            <div className="msg-menu-list">
              <button
                className="msg-menu-item"
                onClick={() => {
                  mostrarInfoMensaje(menuMensaje.mensaje);
                  cerrarMenuMensaje();
                }}
              >
                ℹ️ Info. del mensaje
              </button>
              <button
                className="msg-menu-item"
                onClick={() => {
                  responderMensaje(menuMensaje.mensaje, menuMensaje.otroNickname);
                  cerrarMenuMensaje();
                }}
              >
                ↩️ Responder
              </button>
              {menuMensaje.esMio && !editandoMensaje && (
                <button
                  className="msg-menu-item"
                  onClick={() => {
                    iniciarEdicion(menuMensaje.mensaje);
                    cerrarMenuMensaje();
                  }}
                >
                  ✏️ Editar
                </button>
              )}
              <button
                className="msg-menu-item"
                onClick={() => {
                  copiarMensaje(menuMensaje.mensaje?.mensaje || "");
                  cerrarMenuMensaje();
                }}
              >
                📋 Copiar
              </button>
              <button
                className="msg-menu-item"
                onClick={() => {
                  abrirReenvio(menuMensaje.mensaje);
                  cerrarMenuMensaje();
                }}
              >
                📤 Reenviar
              </button>
              <button
                className="msg-menu-item"
                onClick={() => {
                  if (mensajeFijado?.id === menuMensaje.mensaje?.id) {
                    desfijarMensaje();
                  } else {
                    fijarMensaje(menuMensaje.mensaje);
                  }
                  cerrarMenuMensaje();
                }}
              >
                {mensajeFijado?.id === menuMensaje.mensaje?.id ? "📌 Desfijar" : "📌 Fijar"}
              </button>
              <button
                className="msg-menu-item"
                onClick={() => {
                  toggleDestacarMensaje(menuMensaje.mensaje);
                  cerrarMenuMensaje();
                }}
              >
                ⭐ Destacar
              </button>
              <button
                className="msg-menu-item"
                onClick={() => {
                  activarSeleccion(menuMensaje.mensaje);
                  cerrarMenuMensaje();
                }}
              >
                ✅ Seleccionar
              </button>
              <button
                className="msg-menu-item danger"
                onClick={() => {
                  eliminarMensaje(menuMensaje.mensaje);
                  cerrarMenuMensaje();
                }}
              >
                🗑️ Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalLinkAbierto && (
        <div className="chat-link-modal-backdrop" onClick={() => setModalLinkAbierto(false)}>
          <div className="chat-link-modal" onClick={(e) => e.stopPropagation()}>
            <div className="chat-link-modal-title">Insertar enlace</div>
            <label>
              Texto
              <input
                type="text"
                value={modalLinkTexto}
                onChange={(e) => setModalLinkTexto(e.target.value)}
                placeholder="Texto del enlace"
              />
            </label>
            <label>
              Link
              <input
                type="url"
                value={modalLinkUrl}
                onChange={(e) => setModalLinkUrl(e.target.value)}
                placeholder="https://..."
              />
            </label>
            <div className="chat-link-modal-actions">
              <button onClick={() => setModalLinkAbierto(false)}>Cancelar</button>
              <button onClick={insertarLinkConfirmado}>Insertar</button>
            </div>
          </div>
        </div>
      )}

      {mostrarReenvio && (
        <div className="chat-forward-backdrop" onClick={() => setMostrarReenvio(false)}>
          <div className="chat-forward-modal" onClick={(e) => e.stopPropagation()}>
            <div className="chat-forward-header">
              <span>Reenviar mensaje</span>
              <button
                className="chat-forward-close"
                onClick={() => setMostrarReenvio(false)}
              >
                ✕
              </button>
            </div>
            <div className="chat-forward-section">
              <div className="chat-forward-title">General</div>
              <button
                className="chat-forward-item"
                onClick={() => reenviarMensajeA("general")}
              >
                🌐 Chat General
              </button>
            </div>
            <div className="chat-forward-section">
              <div className="chat-forward-title">Privados</div>
              <div className="chat-forward-list">
                {usuariosIxora.map((u) => {
                  const name = u.nickname || u.name;
                  if (!name) return null;
                  return (
                    <button
                      key={`fw-${u.id}`}
                      className="chat-forward-item"
                      onClick={() => reenviarMensajeA("privado", name)}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="chat-forward-section">
              <div className="chat-forward-title">Grupos</div>
              <div className="chat-forward-list">
                {grupos.map((g) => (
                  <button
                    key={`fw-g-${g.id}`}
                    className="chat-forward-item"
                    onClick={() => reenviarMensajeA("grupal", g.id)}
                  >
                    👥 {g.nombre}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {mostrarAdjuntosMobile && (
        <div className="chat-attach-overlay" onClick={cerrarAdjuntosMobile}>
          <div className="chat-attach-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="chat-attach-handle"></div>
            <div className="chat-attach-header">
              <span>Fotos y videos</span>
              <button className="chat-attach-link" onClick={abrirGaleriaDispositivo}>
                Ver galería
              </button>
            </div>
            <div className="chat-attach-gallery">
              <button className="chat-attach-camera" onClick={abrirCamara} title="Tomar foto">
                📷
              </button>
              {galeriaThumbs.map((thumb) => (
                <button
                  key={thumb.url}
                  className="chat-attach-thumb"
                  onClick={() => manejarGaleria([thumb.file])}
                >
                  <img src={thumb.url} alt="preview" />
                </button>
              ))}
            </div>
            <div className="chat-attach-actions">
              <button onClick={iniciarGrabacionVoz}>🎙️ Grabar un clip de audio</button>
              <button
                onClick={() => {
                  abrirGrabacionVideo();
                  cerrarAdjuntosMobile();
                }}
              >
                🎥 Grabar un clip de video
              </button>
              <button
                onClick={() => {
                  fileInputRef.current?.click();
                  cerrarAdjuntosMobile();
                }}
              >
                📁 Subir un archivo
              </button>
              <button
                onClick={() => {
                  agregarGif();
                  cerrarAdjuntosMobile();
                }}
              >
                🖼️ Agregar un GIF
              </button>
              <button onClick={() => insertarLista(false)}>📝 Crear un elemento de lista</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AGREGAR MIEMBROS */}
          {mostrarAgregarMiembros && grupoAgregarMiembros && (
            <div className="modal-agregar-miembros">
              <div className="modal-agregar-miembros-content">
                <div className="modal-agregar-miembros-header">
                  <h3>Agregar miembros al grupo</h3>
                  <button
                    className="modal-close-btn"
                    onClick={() => {
                      setMostrarAgregarMiembros(false);
                      setGrupoAgregarMiembros(null);
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div className="modal-agregar-miembros-list">
                  {usuariosIxora
                    .filter((u) => {
                      const grupoActual = Array.isArray(grupos) ? grupos.find(
                        (g) => String(g.id) === String(grupoAgregarMiembros)
                      ) : null;
                      return (
                        u.nickname &&
                        u.nickname !== (user?.nickname || user?.name) &&
                        grupoActual &&
                        !grupoActual?.miembros?.includes(u.nickname)
                      );
                    })
                    .map((u) => (
                      <div
                        key={u.id}
                        className="usuario-item-agregar"
                        onClick={() => {
                          agregarMiembroAGrupo(grupoAgregarMiembros, u.nickname);
                          setMostrarAgregarMiembros(false);
                          setGrupoAgregarMiembros(null);
                        }}
                      >
                        <img
                          src={getAvatarUrl(u)}
                          alt={u.nickname}
                          className="chat-avatar"
                          onError={(e) => {
                            e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23e0e0e0'/%3E%3Ctext x='16' y='22' font-size='20' text-anchor='middle' fill='%23999'%3E👤%3C/text%3E%3C/svg%3E";
                          }}
                        />
                        <span style={{ color: getColorForName(u.nickname || u.name || "Usuario") }}>
                          {u.nickname || u.name}
                        </span>
                        <span className="agregar-icon">➕</span>
                      </div>
                    ))}
                  {usuariosIxora.filter((u) => {
                    const grupoActual = Array.isArray(grupos) ? grupos.find(
                      (g) => String(g.id) === String(grupoAgregarMiembros)
                    ) : null;
                    return (
                      u.nickname &&
                      u.nickname !== (user?.nickname || user?.name) &&
                      grupoActual &&
                      !grupoActual?.miembros?.includes(u.nickname)
                    );
                  }).length === 0 && (
                    <div className="chat-empty-pro">
                      No hay usuarios disponibles para agregar
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

    </>
  );
}
