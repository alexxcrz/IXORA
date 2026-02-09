import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { useAlert } from "./components/AlertModal";
import ModalTemasPersonal from "./components/ModalTemasPersonal";
import ModalReuniones from "./components/ModalReuniones";
import { 
  getEncryptedItem, 
  setEncryptedItem, 
  removeEncryptedItem 
} from "./utils/encryptedStorage";
import { getServerUrl, getServerUrlSync } from "./config/server";
import logger from "./utils/logger";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

/* ======================================================
   🔵 AUTH FETCH GLOBAL — ÚNICO Y REAL
====================================================== */
// Variable global para almacenar el token actual (más rápido que leer de storage cada vez)
let currentToken = null;

export const authFetch = async (url, options = {}) => {
  // 🔥 CRÍTICO: Usar token del estado/global PRIMERO, luego localStorage, luego cifrado
  let token = currentToken;
  
  // Si no hay token en memoria, leer de localStorage (más rápido que cifrado)
  if (!token) {
    try {
      token = localStorage.getItem("token");
      if (token) {
        currentToken = token; // Cachear en memoria
      }
    } catch (err) {
    }
  }
  
  // Si aún no hay token, intentar cifrado como último recurso
  if (!token) {
    try {
      token = await getEncryptedItem("token");
      if (token) {
        // Guardar en localStorage y memoria para próxima vez
        localStorage.setItem("token", token);
        currentToken = token;
      }
    } catch (err) {
    }
  }

  // Si la URL es relativa (empieza con /), convertirla a URL completa usando SERVER_URL
  let finalUrl = url;
  if (url.startsWith("/")) {
    // Usar versión síncrona para evitar problemas con Promises
    const serverUrl = getServerUrlSync();
    finalUrl = `${serverUrl}${url}`;
  }

  // Si el body es FormData, no establecer Content-Type (el navegador lo hará con el boundary)
  const isFormData = options.body instanceof FormData;
  
  // Evitar ruido en consola cuando son endpoints públicos (se pueden consumir sin token)
  const esEndpointPublico = (() => {
    try {
      const u = new URL(finalUrl);
      const path = u.pathname || "";
      return [
        "/productos",
        "/inventario",
        "/reportes/dias",
        "/fecha-actual",
        "/admin/personalizacion",
        "/dia/devoluciones",
      ].some((p) => path.startsWith(p));
    } catch {
      return false;
    }
  })();

  // Solo mostrar error si falta token en endpoints que sí requieren autenticación
  if (!token && !esEndpointPublico) {
    console.error(`❌ [authFetch] NO HAY TOKEN! URL: ${url}`);
  }
  
  const headers = {
    // Solo establecer Content-Type si NO es FormData
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  try {
    const res = await fetch(finalUrl, { ...options, headers });

    // Detectar si la respuesta es audio
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.startsWith('audio/')) {
      if (!res.ok) {
        // Si hay error en respuesta de audio, intentar leer como JSON
        try {
          const errorData = await res.json();
          throw new Error(errorData.error || errorData.mensaje || `HTTP ${res.status}`);
        } catch (e) {
          throw new Error(`Error HTTP ${res.status}`);
        }
      }
      // Devolver Blob directamente para audio
      return await res.blob();
    }

    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      // Si no hay JSON, usar el texto de respuesta o un mensaje por defecto
      // No mostrar warning para errores 404 (not found) ya que es esperado
      if (res.status !== 404) {
      }
    }

    // Solo cerrar sesión si es un 401 explícito de autenticación
    // No cerrar por 404, 403, 500, etc.
    // IMPORTANTE: No cerrar sesión en endpoints no críticos como tema-personal
    if (res.status === 401) {
      const errorMsg = data?.error || "";
      const esEndpointNoCritico = url.includes("/usuario/tema-personal") || 
                                  url.includes("/auth/user") ||
                                  url.includes("/chat/notificaciones/config") ||
                                  url.includes("/admin/personalizacion") ||
                                  url.includes("/admin/perms/visibilidad") ||
                                  url.includes("/productos") ||
                                  url.includes("/inventario") ||
                                  url.includes("/devoluciones") ||
                                  url.includes("/reportes/dias") ||
                                  url.includes("/fecha-actual");
      
      // Si es un endpoint no crítico, NO cerrar sesión, solo lanzar error
      if (esEndpointNoCritico) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      
      // Verificar que el error sea realmente de autenticación
      // Solo cerrar sesión si es un endpoint crítico Y el error es de autenticación
      // IMPORTANTE: Solo cerrar si el error explícitamente menciona token/sesión
      if (errorMsg && (errorMsg.includes("token") || 
          errorMsg.includes("Token") || 
          errorMsg.includes("Sesión") ||
          errorMsg.includes("Sin token") ||
          errorMsg.includes("Token inválido") ||
          errorMsg.includes("Sesión cerrada"))) {
        // Limpiar todo
        currentToken = null;
        try {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          localStorage.removeItem("perms");
        } catch (e) {
        }
        try {
          removeEncryptedItem("token");
          removeEncryptedItem("user");
          removeEncryptedItem("perms");
        } catch (e) {
        }
        
        // Usar window.location para redireccionar en web
        window.location.href = "/";
        // En Android, el componente AppProtegida detectará que no hay user y mostrará Login
        return;
      }
      // Si es 401 pero no es de token, lanzar error normal
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    if (!res.ok) {
      const error = new Error(data.error || data.message || `HTTP ${res.status}`);
      // Agregar status al error para facilitar verificación
      error.status = res.status;
      // Incluir datos adicionales del error (para restricciones, etc.)
      if (data.restriccion) {
        error.restriccion = true;
        error.indefinida = data.indefinida;
        error.minutos_restantes = data.minutos_restantes;
        error.fecha_fin = data.fecha_fin;
      }
      // Incluir toda la información adicional del servidor (tiempoEspera, reintentarEn, details, etc.)
      if (data.tiempoEspera) error.tiempoEspera = data.tiempoEspera;
      if (data.reintentarEn) error.reintentarEn = data.reintentarEn;
      if (data.details) error.details = data.details;
      if (data.tipoError) error.tipoError = data.tipoError;
      if (data.esCuotaDiaria !== undefined) error.esCuotaDiaria = data.esCuotaDiaria;
      if (data.esCuotaPorMinuto !== undefined) error.esCuotaPorMinuto = data.esCuotaPorMinuto;
      // Marcar errores 404 como "no críticos" para manejo silencioso
      if (res.status === 404) {
        error.isNotFound = true;
      }
      throw error;
    }

    return data;
  } catch (err) {
    // Si es un error de red, no cerrar sesión
    if (err.name === "TypeError" && err.message.includes("fetch")) {
      console.error("❌ Error de red:", url);
      throw new Error("Error de conexión. Verifica tu internet.");
    }
    // Re-lanzar otros errores
    throw err;
  }
};

// Usar configuración centralizada del servidor (versión síncrona para inicialización)
// NOTA: Para obtener la URL actualizada, usa getServerUrl() que es async
const SERVER_URL = getServerUrlSync();

/* ======================================================
   🔵 PROVIDER
====================================================== */
export function AuthProvider({ children }) {
  // PROTECCIÓN: Manejar caso donde useAlert puede no estar disponible
  let showAlert;
  try {
    const alertHook = useAlert();
    showAlert = alertHook?.showAlert || (() => Promise.resolve());
  } catch (error) {
    showAlert = () => Promise.resolve();
  }
  
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [perms, setPerms] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Cargar datos cifrados al montar el componente
  useEffect(() => {
    const loadEncryptedData = async () => {
      try {
        // PROTECCIÓN: Verificar que localStorage esté disponible
        if (typeof localStorage === 'undefined') {
          setIsLoading(false);
          return;
        }
        
        // Cargar token - usar localStorage PRIMERO (más rápido y confiable)
        try {
          // Siempre intentar localStorage primero (funciona en móvil y desktop)
          let token = null;
          try {
            token = localStorage.getItem("token");
          } catch (e) {
          }
          
          if (token) {
            currentToken = token; // Actualizar variable global
            setToken(token);
          } else {
            // Si no está en localStorage, intentar cifrado como fallback
            try {
              token = await getEncryptedItem("token");
              if (token) {
                currentToken = token; // Actualizar variable global
                setToken(token);
                // Migrar a localStorage para próxima vez
                try {
                  localStorage.setItem("token", token);
                } catch (e) {
                }
              }
            } catch (e) {
            }
          }
          
          // Cargar usuario de localStorage primero
          try {
            const localUser = localStorage.getItem("user");
            if (localUser) {
              try {
                setUser(JSON.parse(localUser));
              } catch (e) {
                // Si falla, intentar cifrado
                try {
                  const encryptedUser = await getEncryptedItem("user");
                  if (encryptedUser) {
                    setUser(JSON.parse(encryptedUser));
                    try {
                      localStorage.setItem("user", encryptedUser);
                    } catch (e2) {}
                  }
                } catch (e2) {}
              }
            } else {
              // Intentar cifrado
              try {
                const encryptedUser = await getEncryptedItem("user");
                if (encryptedUser) {
                  setUser(JSON.parse(encryptedUser));
                  try {
                    localStorage.setItem("user", encryptedUser);
                  } catch (e) {}
                }
              } catch (e) {}
            }
          } catch (e) {
          }
          
          // Cargar permisos de localStorage primero
          try {
            const localPerms = localStorage.getItem("perms");
            if (localPerms) {
              try {
                setPerms(JSON.parse(localPerms));
              } catch (e) {
                // Si falla, intentar cifrado
                try {
                  const encryptedPerms = await getEncryptedItem("perms");
                  if (encryptedPerms) {
                    setPerms(JSON.parse(encryptedPerms));
                    try {
                      localStorage.setItem("perms", encryptedPerms);
                    } catch (e2) {}
                  }
                } catch (e2) {}
              }
            } else {
              // Intentar cifrado
              try {
                const encryptedPerms = await getEncryptedItem("perms");
                if (encryptedPerms) {
                  setPerms(JSON.parse(encryptedPerms));
                  try {
                    localStorage.setItem("perms", encryptedPerms);
                  } catch (e) {}
                }
              } catch (e) {}
            }
          } catch (e) {
          }
        } catch (error) {
          // Error ya manejado, solo continuar
        }
      } catch (error) {
        console.error("❌ Error inesperado cargando datos cifrados:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadEncryptedData();
  }, []);

  // 🔥 REESCRITO DESDE CERO: Sistema de sesión que NUNCA cierra la app
  // La sesión se mantiene SIEMPRE si hay datos en localStorage
  // NO se verifica con el servidor hasta después de restaurar la sesión local
  useEffect(() => {
    // Solo ejecutar cuando termine de cargar
    if (isLoading) {
      return;
    }

    const restaurarSesionLocal = async () => {
      // 🔥 CRÍTICO: Verificar inmediatamente si hay sesión en localStorage
      // Esto se ejecuta después del login para sincronizar inmediatamente
      try {
        // CRÍTICO: Cargar TODO desde localStorage PRIMERO
        const tokenLocal = typeof localStorage !== 'undefined' ? localStorage.getItem("token") : null;
        const userLocal = typeof localStorage !== 'undefined' ? localStorage.getItem("user") : null;
        const permsLocal = typeof localStorage !== 'undefined' ? localStorage.getItem("perms") : null;

        // 🔥 CRÍTICO: Si hay token Y usuario en localStorage pero NO en el estado, restaurar INMEDIATAMENTE
        // Esto incluye el caso después del login donde localStorage tiene datos pero el estado aún no se ha sincronizado
        if (tokenLocal && userLocal) {
          // Verificar si el estado actual NO coincide con localStorage (puede pasar después del login)
          const necesitaRestaurar = !user || !token || 
            (user && userLocal && JSON.stringify(user) !== userLocal);
          
          if (necesitaRestaurar) {
            try {
              const userParsed = JSON.parse(userLocal);
              let permsParsed = [];
              
              if (permsLocal) {
                try {
                  permsParsed = JSON.parse(permsLocal);
                } catch (e) {
                }
              }


              // Restaurar sesión COMPLETAMENTE desde localStorage
              currentToken = tokenLocal;
              setToken(tokenLocal);
              setUser(userParsed);
              setPerms(permsParsed);

              
              // Verificar con el servidor EN SEGUNDO PLANO (OPCIONAL)
              // Si falla, NO pasa nada - la sesión local ya está activa
              setTimeout(async () => {
                try {
                  const serverUrl = await getServerUrl();
                  const response = await fetch(`${serverUrl}/auth/user`, {
                    method: 'GET',
                    headers: {
                      'Authorization': `Bearer ${tokenLocal}`,
                      'Content-Type': 'application/json'
                    },
                    signal: AbortSignal.timeout(5000)
                  });

                  if (response.ok) {
                    const data = await response.json();
                    if (data && data.user) {
                      // Actualizar con datos del servidor (opcional)
                      setUser(data.user);
                      setPerms(data.perms || []);
                      localStorage.setItem("user", JSON.stringify(data.user));
                      if (data.perms) {
                        localStorage.setItem("perms", JSON.stringify(data.perms));
                      }
                    }
                  }
                  // Si hay error, NO hacer nada - la sesión local sigue activa
                } catch (verifyError) {
                  // Error de red - NO hacer nada, sesión local sigue activa
                }
              }, 1000); // Esperar 1 segundo antes de verificar

              return; // Salir - sesión ya restaurada
            } catch (parseError) {
              console.error('[IXORA] ❌ Error parseando sesión local:', parseError);
              // Si no se puede parsear, continuar (pero NO cerrar sesión)
            }
          } else {
            // Ya está sincronizado, no hacer nada
          }
        }

        // Si solo hay token pero no usuario, intentar verificar con servidor
        // PERO NO cerrar sesión si falla
        if (tokenLocal && !userLocal && !user) {
          try {
            const serverUrl = await getServerUrl();
            const response = await fetch(`${serverUrl}/auth/user`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${tokenLocal}`,
                'Content-Type': 'application/json'
              },
              signal: AbortSignal.timeout(8000)
            });

            if (response.ok) {
              const data = await response.json();
              if (data && data.user) {
                // Restaurar desde servidor
                currentToken = tokenLocal;
                setToken(tokenLocal);
                setUser(data.user);
                setPerms(data.perms || []);
                
                // Guardar en localStorage
                localStorage.setItem("token", tokenLocal);
                localStorage.setItem("user", JSON.stringify(data.user));
                if (data.perms) {
                  localStorage.setItem("perms", JSON.stringify(data.perms));
                }
              }
            }
            // Si hay error (401/403), NO cerrar - solo loggear
            // El usuario puede tener sesión expirada pero la app no se cierra
          } catch (error) {
            // Error de red - NO cerrar sesión, solo loggear
          }
        }
      } catch (error) {
        console.error('[IXORA] Error restaurando sesión:', error);
        // NO cerrar sesión por ningún error
      }
    };

    // CRÍTICO: Siempre verificar localStorage, incluso si hay user en el estado
    // Esto asegura que después del login, la sesión se mantenga sincronizada
    restaurarSesionLocal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, user, token]);

  // Estados para modal de editar perfil
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const [puestoInput, setPuestoInput] = useState("");
  const [correoInput, setCorreoInput] = useState("");
  const [birthdayInput, setBirthdayInput] = useState("");
  const [mostrarTelefonoInput, setMostrarTelefonoInput] = useState(true);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  
  // Estado para modal de temas personal
  const [showTemasPersonalModal, setShowTemasPersonalModal] = useState(false);
  
  // Estado para modal de configuración de notificaciones
  const [showNotificacionesModal, setShowNotificacionesModal] = useState(false);
  const [configNotificaciones, setConfigNotificaciones] = useState(null);
  
  // Estado para modal de reuniones
  const [showReunionesModal, setShowReunionesModal] = useState(false);
  
  // Escuchar evento para abrir modal de reuniones desde el perfil
  useEffect(() => {
    const handleAbrirModalReuniones = () => {
      setShowReunionesModal(true);
    };
    
    window.addEventListener('abrir-modal-reuniones', handleAbrirModalReuniones);
    return () => {
      window.removeEventListener('abrir-modal-reuniones', handleAbrirModalReuniones);
    };
  }, []);
  
  const sonidosIxora = [
    { value: "ixora-pulse", label: "Ixora Pulse" },
    { value: "ixora-wave", label: "Ixora Wave" },
    { value: "ixora-alert", label: "Ixora Alert" },
    { value: "ixora-call", label: "Ixora Call" },
    { value: "ixora-call-group", label: "Ixora Call Group" },
    { value: "ixora-soft", label: "Ixora Soft" },
    { value: "ixora-digital", label: "Ixora Digital" },
    { value: "ixora-picking", label: "Ixora Picking" },
    { value: "ixora-surtido", label: "Ixora Surtido" },
    { value: "silencio", label: "Silencio" },
  ];

  const defaultConfigNotificaciones = {
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
  const previewAudioRef = useRef(null);
  const sonidoPatterns = {
    "ixora-pulse": {
      type: "sine",
      notes: [
        { f: 520, d: 0.12 },
        { f: 650, d: 0.12 },
        { f: 520, d: 0.12 },
      ],
    },
    "ixora-wave": {
      type: "triangle",
      notes: [
        { f: 440, d: 0.18 },
        { f: 520, d: 0.18 },
      ],
    },
    "ixora-alert": {
      type: "square",
      notes: [
        { f: 740, d: 0.1 },
        { f: 740, d: 0.1 },
        { f: 880, d: 0.18 },
      ],
    },
    "ixora-call": {
      type: "sine",
      notes: [
        { f: 620, d: 0.45 },
        { f: 540, d: 0.45 },
        { f: 620, d: 0.45 },
      ],
    },
    "ixora-call-group": {
      type: "sine",
      notes: [
        { f: 600, d: 0.5 },
        { f: 520, d: 0.5 },
        { f: 600, d: 0.5 },
      ],
    },
    "ixora-soft": {
      type: "sine",
      notes: [
        { f: 360, d: 0.2 },
        { f: 420, d: 0.2 },
      ],
    },
    "ixora-digital": {
      type: "square",
      notes: [
        { f: 880, d: 0.08 },
        { f: 990, d: 0.08 },
        { f: 880, d: 0.08 },
        { f: 1180, d: 0.12 },
      ],
    },
    "ixora-picking": {
      type: "triangle",
      notes: [
        { f: 500, d: 0.1 },
        { f: 600, d: 0.1 },
        { f: 500, d: 0.1 },
      ],
    },
    "ixora-surtido": {
      type: "sine",
      notes: [
        { f: 660, d: 0.16 },
        { f: 780, d: 0.16 },
        { f: 720, d: 0.18 },
      ],
    },
  };

  const reproducirPreviewSonido = async (soundKey) => {
    if (!soundKey || soundKey === "silencio") return;
    const pattern = sonidoPatterns[soundKey];
    if (!pattern) return;
    try {
      if (previewAudioRef.current?.ctx) {
        previewAudioRef.current.ctx.close().catch(() => {});
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
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

      previewAudioRef.current = { ctx };
      setTimeout(() => {
        ctx.close().catch(() => {});
      }, 2000);
    } catch (_) {
      // Evitar errores de autoplay
    }
  };

  // Estados para modal de cambiar contraseña temporal
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  /* ======================================================
     🔵 LOGIN — GUARDA TODO (CIFRADO)
  ====================================================== */
  const login = async (userObj, jwtToken, permisos) => {
    try {
      logger.auth.info('Iniciando proceso de login');
      
      // 🔥 CRÍTICO: Actualizar variable global PRIMERO (antes que todo)
      // Esto asegura que authFetch use el token nuevo inmediatamente
      currentToken = jwtToken;
      logger.auth.debug('Token global actualizado');
      
      // 🔥 CRÍTICO: Actualizar estado SEGUNDO
      setToken(jwtToken);
      setUser(userObj);
      setPerms(permisos || []);
      logger.auth.debug('Estados actualizados');
      
      // 🔥 CRÍTICO: Guardar en localStorage SIN CIFRAR (más confiable y rápido)
      // Esto funciona tanto en móvil como en desktop
      let savedSuccessfully = false;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (!savedSuccessfully && retryCount < maxRetries) {
        try {
          localStorage.setItem("token", jwtToken);
          localStorage.setItem("user", JSON.stringify(userObj));
          localStorage.setItem("perms", JSON.stringify(permisos || []));
          
          // Verificar inmediatamente que se guardó
          const verifyToken = localStorage.getItem("token");
          const verifyUser = localStorage.getItem("user");
          const verifyPerms = localStorage.getItem("perms");
          
          if (verifyToken !== jwtToken) {
            // Capturar el valor actual de retryCount para evitar referencias inseguras
            const currentRetry = retryCount;
            logger.session.warn(`Token no coincide después de guardar (intento ${currentRetry + 1})`);
            retryCount++;
            if (retryCount < maxRetries) {
              // Usar el valor capturado en lugar de retryCount directamente
              await new Promise(resolve => setTimeout(resolve, 100 * (currentRetry + 1))); // Delay progresivo
              continue;
            }
          } else if (!verifyUser || !verifyPerms) {
            // Capturar el valor actual de retryCount para evitar referencias inseguras
            const currentRetry = retryCount;
            logger.session.warn(`Usuario o permisos no guardados correctamente (intento ${currentRetry + 1})`);
            retryCount++;
            if (retryCount < maxRetries) {
              // Usar el valor capturado en lugar de retryCount directamente
              await new Promise(resolve => setTimeout(resolve, 100 * (currentRetry + 1)));
              continue;
            }
          } else {
            savedSuccessfully = true;
            logger.session.info('Sesión guardada correctamente en localStorage');
          }
        } catch (localError) {
          // Capturar el valor actual de retryCount para evitar referencias inseguras
          const currentRetry = retryCount;
          logger.session.error(`Error guardando en localStorage (DESKTOP)`, {
            error: localError,
            retryCount: currentRetry,
          });
          retryCount++;
          if (retryCount < maxRetries) {
            // Usar el valor capturado en lugar de retryCount directamente
            await new Promise(resolve => setTimeout(resolve, 100 * (currentRetry + 1)));
            continue;
          }
        }
      }
      
      if (!savedSuccessfully) {
        logger.session.error('No se pudo guardar sesión después de múltiples intentos', {
          retryCount,
        });
        // NO lanzar error - la sesión ya está en memoria, continuar
        logger.session.warn('⚠️ Continuando con sesión en memoria aunque localStorage falló');
      }
      
      // También intentar guardar cifrado como respaldo (opcional, no bloqueante)
      try {
        await Promise.all([
          setEncryptedItem("token", jwtToken),
          setEncryptedItem("user", JSON.stringify(userObj)),
          setEncryptedItem("perms", JSON.stringify(permisos || [])),
        ]);
        logger.session.debug('Sesión también guardada en storage cifrado');
      } catch (tokenError) {
        // No es crítico si falla, ya está guardado en localStorage
        logger.session.debug('Error guardando token cifrado (no crítico)', { error: tokenError });
      }

      // 🔥 VERIFICACIÓN FINAL MÁXIMA - Asegurar que TODO esté guardado
      try {
        // Esperar un momento para que localStorage se actualice
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const finalVerify = localStorage.getItem("token");
        const finalUser = localStorage.getItem("user");
        const finalPerms = localStorage.getItem("perms");
        
        
        // Si algo falta, intentar guardar nuevamente
        if (finalVerify !== jwtToken) {
          localStorage.setItem("token", jwtToken);
          localStorage.setItem("user", JSON.stringify(userObj));
          localStorage.setItem("perms", JSON.stringify(permisos || []));
        }
        
        if (!finalUser) {
          localStorage.setItem("user", JSON.stringify(userObj));
        }
        
        if (!finalPerms) {
          localStorage.setItem("perms", JSON.stringify(permisos || []));
        }
        
        // Verificación final después de corregir
        const verifyFinal = localStorage.getItem("token");
        const verifyUserFinal = localStorage.getItem("user");
        
        if (verifyFinal && verifyUserFinal) {
        } else {
          console.error('[IXORA] ❌ ERROR: Sesión no se pudo guardar completamente');
        }
      } catch (verifyError) {
        console.error('[IXORA] ❌ Error en verificación final:', verifyError);
        // NO lanzar error - la sesión ya está en memoria
      }

      // 🔥 CRÍTICO: Disparar evento personalizado para forzar actualización inmediata
      // Esto asegura que App.jsx y otros componentes detecten la sesión inmediatamente
      try {
        window.dispatchEvent(new CustomEvent('ixora-sesion-actualizada', {
          detail: { user: userObj, token: jwtToken, perms: permisos }
        }));
      } catch (eventError) {
        console.error('[IXORA] Error disparando evento de sesión:', eventError);
      }
      
      // Si la contraseña es temporal, mostrar modal
      if (userObj.password_temporary) {
        setTimeout(() => {
          setShowChangePasswordModal(true);
        }, 500);
      }
      
      logger.auth.info('✅✅✅ LOGIN COMPLETADO EXITOSAMENTE - SESIÓN GUARDADA Y VERIFICADA');
    } catch (error) {
      logger.auth.error('Error crítico en login', {
        error: error.message,
        stack: error.stack,
        userId: userObj?.id,
      });
      
      // Solo mostrar alerta si es un error realmente crítico
      if (error.message && error.message.includes("Error al guardar")) {
        await showAlert("Error al guardar sesión. El token puede no persistir después de recargar la página.", "warning", { title: "Advertencia" });
      } else {
        await showAlert("Error al guardar sesión. Intenta nuevamente.", "error");
      }
      // NO re-lanzar el error para que el login pueda continuar
    }
  };

  /* ======================================================
     🔵 CARGAR TEMA PERSONAL DEL USUARIO
     DESACTIVADO: Causa problemas de rendimiento y cierre de sesión
     Función mantenida por si se necesita en el futuro
  ====================================================== */
  // eslint-disable-next-line no-unused-vars
  const cargarTemaPersonalUsuario = async (userId) => {
    if (!userId) return;
    
    try {
      const serverUrl = await getServerUrl();
      const data = await authFetch(`${serverUrl}/usuario/tema-personal`);
      if (data && data.tema) {
        // Importar y aplicar el tema
        const { aplicarTema } = await import("./utils/temas");
        aplicarTema(data.tema);
        
        // Guardar en múltiples lugares para redundancia
        localStorage.setItem("tema-actual", data.tema);
        localStorage.setItem(`tema-personal-${userId}`, data.tema);
        
        
        // Disparar evento para que otros componentes se actualicen
        window.dispatchEvent(new CustomEvent('tema-personal-actualizado', { detail: data.tema }));
      } else {
        // Si no hay tema personal, cargar tema global o del localStorage
        const temaGlobal = localStorage.getItem("tema-actual") || "azul";
        const { aplicarTema } = await import("./utils/temas");
        aplicarTema(temaGlobal);
      }
    } catch (err) {
      // NO es crítico si falla, solo usar fallback
      // NO lanzar error para evitar que se cierre la sesión
      // Fallback: usar tema del localStorage
      const temaFallback = localStorage.getItem("tema-actual") || "azul";
      try {
        const { aplicarTema } = await import("./utils/temas");
        aplicarTema(temaFallback);
      } catch (e) {
        // Si todo falla, continuar sin tema personal (no es crítico)
      }
    }
  };

  /* ======================================================
     🔵 LOGOUT LIMPIO (CIFRADO)
  ====================================================== */
  const logout = async () => {
    // Limpiar variable global
    currentToken = null;
    
    setToken(null);
    setUser(null);
    setPerms([]);

    // Limpiar localStorage (síncrono)
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("perms");
    
    // Limpiar storage cifrado (asíncrono) - ESPERAR A QUE TERMINE
    try {
      await Promise.all([
        removeEncryptedItem("token"),
        removeEncryptedItem("user"),
        removeEncryptedItem("perms")
      ]);
    } catch (err) {
      console.warn('Error limpiando storage cifrado en logout:', err);
      // No es crítico si falla, ya limpió localStorage
    }
  };

  /* ======================================================
     🔵 ABRIR MODAL DE EDITAR PERFIL
  ====================================================== */
  const abrirEditarPerfil = async () => {
    // Si el modal ya está abierto, no hacer nada para evitar resetear los valores
    if (showEditProfileModal) {
      return;
    }
    
    // 🔥 Obtener datos actualizados del servidor
    let usuarioActual = user;
    try {
      const userNickname = user?.nickname || user?.name;
      if (userNickname) {
        const perfil = await authFetch(`/chat/usuario/${encodeURIComponent(userNickname)}/perfil`);
        if (perfil) {
          usuarioActual = { ...user, ...perfil };
          console.log("📋 Datos del perfil cargados:", usuarioActual);
        }
      }
    } catch (err) {
      console.error("Error cargando perfil actualizado:", err);
      // Si falla, usar los datos del estado/localStorage
      usuarioActual = user || (() => {
        try {
          const userLocal = localStorage.getItem("user");
          return userLocal ? JSON.parse(userLocal) : null;
        } catch (e) {
          return null;
        }
      })();
    }
    
    // Establecer valores siempre cuando se abre el modal (solo se ejecuta si el modal está cerrado)
    setNicknameInput(usuarioActual?.nickname || "");
    setPuestoInput(usuarioActual?.puesto || "");
    setCorreoInput(usuarioActual?.correo || "");
    
    // Asegurar que birthday esté en formato YYYY-MM-DD para el input type="date"
    let birthdayFormatted = "";
    if (usuarioActual?.birthday) {
      const birthdayStr = String(usuarioActual.birthday).trim();
      // Si está en formato dd/mm/aaaa, convertirlo
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(birthdayStr)) {
        const [day, month, year] = birthdayStr.split('/');
        birthdayFormatted = `${year}-${month}-${day}`;
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(birthdayStr)) {
        birthdayFormatted = birthdayStr;
      } else {
        birthdayFormatted = "";
      }
    }
    setBirthdayInput(birthdayFormatted);
    
    // Normalizar mostrar_telefono: puede ser 0, "0", 1, "1", null, undefined, etc.
    const mostrarTelefonoValue = usuarioActual?.mostrar_telefono;
    const mostrarTelefonoBool = mostrarTelefonoValue === 0 || 
                                 mostrarTelefonoValue === "0" || 
                                 mostrarTelefonoValue === false || 
                                 mostrarTelefonoValue === null ? false : true;
    setMostrarTelefonoInput(mostrarTelefonoBool);
    
    setPhotoFile(null);
    // 🔥 Agregar timestamp para evitar caché del navegador
    setPhotoPreview(usuarioActual?.photo ? `${SERVER_URL}/uploads/perfiles/${usuarioActual.photo}?t=${Date.now()}` : null);
    setShowEditProfileModal(true);
  };

  /* ======================================================
     🔵 GUARDAR PERFIL (FOTO Y SOBRENOMBRE)
  ====================================================== */
  const guardarPerfil = async () => {
    if (!nicknameInput.trim()) {
      await showAlert("Escribe un sobrenombre", "warning", { title: "Campo requerido" });
      return;
    }

    try {
      setSavingProfile(true);

      // 1. Guardar nickname
      const nicknameRes = await fetch(`${SERVER_URL}/auth/nickname`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nickname: nicknameInput.trim() }),
      });

      const nicknameData = await nicknameRes.json();
      if (!nicknameRes.ok) {
        throw new Error(nicknameData.error || "Error al guardar sobrenombre");
      }

      // 2. Guardar información adicional del perfil
      try {
        // Asegurar que birthday sea una cadena válida en formato YYYY-MM-DD o null
        let birthdayValue = null;
        if (birthdayInput && birthdayInput.trim()) {
          const birthdayStr = birthdayInput.trim();
          // Si el formato es dd/mm/aaaa, convertirlo a YYYY-MM-DD
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(birthdayStr)) {
            const [day, month, year] = birthdayStr.split('/');
            birthdayValue = `${year}-${month}-${day}`;
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(birthdayStr)) {
            // Ya está en formato correcto
            birthdayValue = birthdayStr;
          } else {
            birthdayValue = null;
          }
        }
        
        // Preparar datos para enviar
        const datosPerfil = {
          puesto: puestoInput.trim() || null,
          correo: correoInput.trim() || null,
          birthday: birthdayValue,
          mostrar_telefono: mostrarTelefonoInput ? 1 : 0,
        };
        
        
        const perfilRes = await authFetch(`${SERVER_URL}/auth/perfil-info`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(datosPerfil),
        });
        
        
        // Verificar que la respuesta sea correcta
        // authFetch devuelve directamente el JSON, no un objeto Response
        if (!perfilRes) {
          throw new Error("No se recibió respuesta del servidor al guardar perfil");
        }
        
        // Si hay error en la respuesta
        if (perfilRes.error) {
          throw new Error(perfilRes.error || "Error en la respuesta del servidor al guardar perfil");
        }
        
        // Verificar que la respuesta tenga ok: true y user
        if (!perfilRes.ok) {
          throw new Error(perfilRes.error || "Error al guardar perfil en el servidor");
        }
        
        if (perfilRes && perfilRes.user) {
          // Normalizar mostrar_telefono: puede venir como 0, 1, "0", "1", etc.
          const mostrarTelefonoValue = perfilRes.user.mostrar_telefono;
          const mostrarTelefonoNormalized = (mostrarTelefonoValue === 0 || 
                                             mostrarTelefonoValue === "0" || 
                                             mostrarTelefonoValue === false || 
                                             mostrarTelefonoValue === null) ? 0 : 1;
          
          // Usar los datos del servidor (que acabamos de guardar) como fuente de verdad
          const updatedPerfil = {
            ...(user || {}),
            puesto: perfilRes.user.puesto || null,
            correo: perfilRes.user.correo || null,
            mostrar_telefono: mostrarTelefonoNormalized,
            birthday: perfilRes.user.birthday || null,
          };
          
          // Actualizar estado inmediatamente
          setUser(updatedPerfil);
          localStorage.setItem("user", JSON.stringify(updatedPerfil));
          try {
            await setEncryptedItem("user", JSON.stringify(updatedPerfil));
          } catch (e) {
            console.error("Error guardando en storage cifrado:", e);
          }
          
          console.log("✅ Perfil guardado correctamente:", {
            puesto: updatedPerfil.puesto,
            correo: updatedPerfil.correo,
            birthday: updatedPerfil.birthday
          });
        } else {
          throw new Error("No se recibieron datos del usuario actualizado");
        }
      } catch (err) {
        console.error("Error guardando información adicional:", err);
        throw err; // Re-lanzar para que se muestre el error al usuario
      }

      // 3. Si hay foto, subirla
      if (photoFile) {
        const formData = new FormData();
        formData.append("photo", photoFile);

        const photoRes = await fetch(`${SERVER_URL}/auth/photo`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        const photoData = await photoRes.json();
        if (!photoRes.ok) {
          throw new Error(photoData.error || "Error al subir foto");
        }
      }

      // 4. NO refrescar inmediatamente después de guardar para evitar sobrescribir datos
      // Los datos ya están actualizados en el estado y localStorage desde el paso anterior
      // El refresh se hará automáticamente cuando sea necesario (login, etc.)
      
      // Guardar los datos actuales como referencia para verificación posterior
      const usuarioGuardadoFinal = JSON.parse(localStorage.getItem("user") || "{}");
      console.log("✅ Datos finales guardados en localStorage:", {
        puesto: usuarioGuardadoFinal.puesto,
        correo: usuarioGuardadoFinal.correo,
        birthday: usuarioGuardadoFinal.birthday
      });

      setShowEditProfileModal(false);
      setPhotoFile(null);
      setPhotoPreview(null);
    } catch (err) {
      await showAlert(err.message || "Error al guardar perfil", "error", { title: "Error" });
    } finally {
      setSavingProfile(false);
    }
  };

  /* ======================================================
     🔵 REFRESCAR PERMISOS (sin cerrar sesión)
  ====================================================== */
  const refrescarPermisos = async () => {
    try {
      const res = await authFetch(`${SERVER_URL}/auth/refresh-perms`);
      
      if (res && res.perms) {
        const nuevosPermisos = res.perms || [];
        setPerms(nuevosPermisos);
        
        // Guardar en localStorage
        localStorage.setItem("perms", JSON.stringify(nuevosPermisos));
        
        // Guardar en storage cifrado también
        try {
          await setEncryptedItem("perms", JSON.stringify(nuevosPermisos));
        } catch (e) {
        }
        
        await showAlert("Permisos actualizados correctamente", "success", { title: "Éxito" });
        return true;
      }
      return false;
    } catch (err) {
      console.error("Error refrescando permisos:", err);
      await showAlert(err.message || "Error al actualizar permisos", "error", { title: "Error" });
      return false;
    }
  };

  /* ======================================================
     🔵 REFRESCAR DATOS DEL USUARIO DESDE EL SERVIDOR
  ====================================================== */
  const refrescarUsuario = async () => {
    try {
      // Guardar datos locales actuales antes de refrescar para preservar información
      const usuarioLocalActual = JSON.parse(localStorage.getItem("user") || "{}");
      
      const res = await authFetch(`${SERVER_URL}/auth/user`);
      
      if (res && res.user) {
        const usuarioActualizado = res.user;
        
        // MERGE INTELIGENTE: Preservar datos locales si el servidor no los tiene o están vacíos
        // Esto evita perder información que se guardó recientemente
        const usuarioMergeado = {
          ...usuarioActualizado,
          // Preservar puesto si el servidor no lo tiene o está vacío
          puesto: (usuarioActualizado.puesto && usuarioActualizado.puesto.trim()) 
            ? usuarioActualizado.puesto 
            : (usuarioLocalActual.puesto && usuarioLocalActual.puesto.trim() 
                ? usuarioLocalActual.puesto 
                : null),
          // Preservar correo si el servidor no lo tiene o está vacío
          correo: (usuarioActualizado.correo && usuarioActualizado.correo.trim()) 
            ? usuarioActualizado.correo 
            : (usuarioLocalActual.correo && usuarioLocalActual.correo.trim() 
                ? usuarioLocalActual.correo 
                : null),
          // Preservar birthday si el servidor no lo tiene o está vacío
          birthday: (usuarioActualizado.birthday && usuarioActualizado.birthday.trim()) 
            ? usuarioActualizado.birthday 
            : (usuarioLocalActual.birthday && usuarioLocalActual.birthday.trim() 
                ? usuarioLocalActual.birthday 
                : null),
        };
        
        setUser(usuarioMergeado);
        setPerms(res.perms || []);
        
        // Guardar en localStorage
        localStorage.setItem("user", JSON.stringify(usuarioMergeado));
        localStorage.setItem("perms", JSON.stringify(res.perms || []));
        
        // Guardar en storage cifrado también
        try {
          await setEncryptedItem("user", JSON.stringify(usuarioMergeado));
          await setEncryptedItem("perms", JSON.stringify(res.perms || []));
        } catch (e) {
          console.error("Error guardando en storage cifrado:", e);
        }
        
        return true;
      }
      return false;
    } catch (err) {
      // NO es crítico si falla el refresh, solo loggear
      // NO limpiar sesión si falla
      console.error("Error refrescando usuario:", err);
      return false;
    }
  };

  // 🔥 Refrescar usuario desde el servidor cuando hay token (para sincronizar foto de perfil entre dispositivos)
  // DESACTIVADO TEMPORALMENTE: Causa problemas de rendimiento y cierre de sesión
  // useEffect(() => {
  //   if (token && user?.id) {
  //     // Esperar un poco antes de refrescar para asegurar que el token esté completamente propagado
  //     const timeoutId = setTimeout(() => {
  //       // Refrescar usuario en segundo plano (sin bloquear la UI)
  //       refrescarUsuario().catch(err => {
  //         // No es crítico si falla, solo loggear
  //         console.debug("Error refrescando usuario al cargar (no crítico):", err);
  //         // NO limpiar sesión si falla el refresh
  //       });
  //     }, 1000); // Esperar 1 segundo después del login
  //     
  //     return () => clearTimeout(timeoutId);
  //   }
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [token]); // Solo cuando cambia el token

  /* ======================================================
     🔵 CAMBIAR CONTRASEÑA TEMPORAL
  ====================================================== */
  const cambiarContraseñaTemporal = async () => {
    if (!newPasswordInput || newPasswordInput.length < 6) {
      await showAlert("La contraseña debe tener al menos 6 caracteres", "warning", { title: "Contraseña inválida" });
      return;
    }

    if (newPasswordInput !== confirmPasswordInput) {
      await showAlert("Las contraseñas no coinciden", "error", { title: "Error de validación" });
      return;
    }

    try {
      setChangingPassword(true);

      // Si la contraseña es temporal, no enviar currentPassword
      const isTemporary = user?.password_temporary === 1 || user?.password_temporary === true;
      const body = isTemporary 
        ? { newPassword: newPasswordInput }
        : { currentPassword: currentPasswordInput, newPassword: newPasswordInput };

      const res = await authFetch(`${SERVER_URL}/auth/change-password`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (res.ok !== false) {
        // Actualizar usuario para quitar flag de temporal
        const updated = { ...(user || {}), password_temporary: 0 };
        setUser(updated);
        await setEncryptedItem("user", JSON.stringify(updated));

        setShowChangePasswordModal(false);
        setCurrentPasswordInput("");
        setNewPasswordInput("");
        setConfirmPasswordInput("");
        await showAlert("Contraseña actualizada correctamente", "success", { title: "Éxito" });
      }
    } catch (err) {
      await showAlert(err.message || "Error al cambiar contraseña", "error", { title: "Error" });
    } finally {
      setChangingPassword(false);
    }
  };

  /* ======================================================
     🔵 CONTEXTO EXPUESTO
  ====================================================== */
  // Mostrar loading mientras se cargan los datos cifrados
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#1a1a1a',
        color: '#fff'
      }}>
        <div>Cargando...</div>
      </div>
    );
  }

  const todosDispositivos =
    configNotificaciones &&
    configNotificaciones.dispositivo_pc === 1 &&
    configNotificaciones.dispositivo_tablet === 1 &&
    configNotificaciones.dispositivo_movil === 1;

  const actualizarTodosDispositivos = (checked) => {
    setConfigNotificaciones((prev) => ({
      ...prev,
      dispositivo_pc: checked ? 1 : 0,
      dispositivo_tablet: checked ? 1 : 0,
      dispositivo_movil: checked ? 1 : 0,
    }));
  };

  const diasSemanaSeleccionados = (configNotificaciones?.dias_semana || "1,2,3,4,5,6,7")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  const toggleDiaSemana = (dia) => {
    setConfigNotificaciones((prev) => {
      const current = new Set(
        (prev?.dias_semana || "1,2,3,4,5,6,7")
          .split(",")
          .map((d) => d.trim())
          .filter(Boolean)
      );
      if (current.has(dia)) current.delete(dia);
      else current.add(dia);
      const ordenados = Array.from(current).sort((a, b) => Number(a) - Number(b));
      return { ...prev, dias_semana: ordenados.join(",") };
    });
  };

  const diasConfig = [
    { id: "1", label: "Lunes", key: "lun" },
    { id: "2", label: "Martes", key: "mar" },
    { id: "3", label: "Miércoles", key: "mie" },
    { id: "4", label: "Jueves", key: "jue" },
    { id: "5", label: "Viernes", key: "vie" },
    { id: "6", label: "Sábado", key: "sab" },
    { id: "7", label: "Domingo", key: "dom" },
  ];

  const getHorarioDia = (key, tipo, fallback) =>
    configNotificaciones?.[`horario_${key}_${tipo}`] || fallback;

  const calcularEdad = (fecha) => {
    if (!fecha) return null;
    const fechaNac = new Date(`${fecha}T00:00:00`);
    if (Number.isNaN(fechaNac.getTime())) return null;
    const hoy = new Date();
    
    let años = hoy.getFullYear() - fechaNac.getFullYear();
    let meses = hoy.getMonth() - fechaNac.getMonth();
    let días = hoy.getDate() - fechaNac.getDate();
    
    // Ajustar si aún no ha cumplido años
    if (meses < 0 || (meses === 0 && días < 0)) {
      años -= 1;
      meses += 12;
    }
    
    // Ajustar meses si el día aún no ha llegado este mes
    if (días < 0) {
      meses -= 1;
      if (meses < 0) {
        meses += 12;
        años -= 1;
      }
    }
    
    return años >= 0 ? { años, meses } : null;
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        perms,
        setUser,
        setPerms,
        login,
        logout,
        authFetch, // ← EL BUENO, ÚNICO Y GLOBAL
        abrirEditarPerfil, // Función para abrir modal de editar perfil
        refrescarPermisos, // Función para refrescar permisos sin cerrar sesión
        refrescarUsuario, // Función para refrescar datos del usuario desde el servidor
        can: (perm) => perms?.includes(perm), // Función helper para verificar permisos
      }}
    >
      {children}

      {/* ======================================================
         🔵 MODAL EDITAR PERFIL - REDISEÑO PROFESIONAL
      ====================================================== */}
      {showEditProfileModal && (
        <div 
          className="profile-modal-backdrop" 
          onClick={() => setShowEditProfileModal(false)}
          style={{ zIndex: 10000 }}
        >
          <div 
            className="profile-modal-container" 
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Modal */}
            <div className="profile-modal-header">
              <div className="profile-modal-header-content">
                <h2 className="profile-modal-title">
                  <span className="profile-modal-icon">👤</span>
                  Editar Perfil
                </h2>
                <button 
                  className="profile-modal-close"
                  onClick={() => setShowEditProfileModal(false)}
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Contenido del Modal */}
            <div className="profile-modal-body">
              <div className="profile-photo-top">
                <div className="profile-photo-card">
                  <div className="profile-photo-container">
                    <div className="profile-photo-wrapper">
                      {photoPreview ? (
                        <img
                          src={photoPreview}
                          alt="Preview"
                          className="profile-photo-preview"
                        />
                      ) : (
                        <div className="profile-photo-placeholder">
                          <span className="profile-photo-icon">👤</span>
                        </div>
                      )}
                      <div className="profile-photo-overlay">
                        <label className="profile-photo-upload-btn">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files[0];
                              if (file) {
                                setPhotoFile(file);
                                setPhotoPreview(URL.createObjectURL(file));
                              }
                            }}
                            style={{ display: "none" }}
                          />
                          <span className="profile-upload-icon">📤</span>
                          <span className="profile-upload-text">Cambiar</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="profile-modal-grid">
                <div className="profile-form-col">
                  <div className="profile-form-grid">
                    <div className="profile-field">
                      <label className="profile-section-label">
                        <span className="profile-label-icon">✏️</span>
                        Nickname
                      </label>
                      <div className="profile-input-wrapper">
                        <input
                          type="text"
                          value={nicknameInput}
                          onChange={(e) => setNicknameInput(e.target.value)}
                          placeholder="Escribe tu nickname..."
                          className="profile-input"
                        />
                      </div>
                    </div>

                    <div className="profile-field">
                      <label className="profile-section-label">
                        <span className="profile-label-icon">💼</span>
                        Puesto
                      </label>
                      <div className="profile-input-wrapper">
                        <input
                          type="text"
                          value={puestoInput}
                          onChange={(e) => setPuestoInput(e.target.value)}
                          placeholder="Puesto o área"
                          className="profile-input"
                        />
                      </div>
                    </div>

                    <div className="profile-field">
                      <label className="profile-section-label">
                        <span className="profile-label-icon">📧</span>
                        Correo
                      </label>
                      <div className="profile-input-wrapper">
                        <input
                          type="email"
                          value={correoInput}
                          onChange={(e) => setCorreoInput(e.target.value)}
                          placeholder="correo@empresa.com"
                          className="profile-input"
                        />
                      </div>
                    </div>

                    <div className="profile-field">
                      <label className="profile-section-label">
                        <span className="profile-label-icon">📱</span>
                        Teléfono visible para otros
                      </label>
                      <div className="profile-switch-row">
                        <span>Mostrar mi número</span>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={mostrarTelefonoInput}
                            onChange={(e) => setMostrarTelefonoInput(e.target.checked)}
                          />
                          <span className="slider round"></span>
                        </label>
                      </div>
                    </div>

                    <div className="profile-field">
                      <label className="profile-section-label">
                        <span className="profile-label-icon">🎂</span>
                        Cumpleaños
                      </label>
                      <div className="profile-input-wrapper profile-input-birthday">
                        <input
                          type="date"
                          value={birthdayInput}
                          onChange={(e) => setBirthdayInput(e.target.value)}
                          className="profile-input"
                        />
                        <span className="profile-age">
                          {(() => {
                            const edad = calcularEdad(birthdayInput);
                            if (!edad) return "—";
                            const edadTexto = edad.meses > 0 
                              ? `${edad.años} años y ${edad.meses} ${edad.meses === 1 ? 'mes' : 'meses'}`
                              : `${edad.años} años`;
                            return edadTexto;
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="profile-actions-row">
                    <button
                      onClick={() => {
                        setShowEditProfileModal(false);
                        setShowTemasPersonalModal(true);
                      }}
                      className="profile-theme-btn"
                    >
                      <span className="profile-theme-icon">🎨</span>
                      <span className="profile-theme-text">Tema</span>
                      <span className="profile-theme-arrow">→</span>
                    </button>
                    <button
                      onClick={async () => {
                        setShowEditProfileModal(false);
                        // Cargar configuración de notificaciones
                        try {
                          const serverUrl = await getServerUrl();
                          const config = await authFetch(`${serverUrl}/chat/notificaciones/config`);
                          setConfigNotificaciones({
                            ...defaultConfigNotificaciones,
                            ...(config || {})
                          });
                          setShowNotificacionesModal(true);
                        } catch (error) {
                          console.error("Error cargando configuración de notificaciones:", error);
                          setConfigNotificaciones({ ...defaultConfigNotificaciones });
                          setShowNotificacionesModal(true);
                        }
                      }}
                      className="profile-theme-btn"
                    >
                      <span className="profile-theme-icon">🔔</span>
                      <span className="profile-theme-text">Notificaciones</span>
                      <span className="profile-theme-arrow">→</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowEditProfileModal(false);
                        setShowReunionesModal(true);
                      }}
                      className="profile-theme-btn"
                    >
                      <span className="profile-theme-icon">📅</span>
                      <span className="profile-theme-text">Reuniones</span>
                      <span className="profile-theme-arrow">→</span>
                    </button>
                  </div>
                </div>

                <div className="profile-side-col">
                  <div className="profile-summary-card">
                    <div className="profile-summary-title">Resumen</div>
                    <div className="profile-summary-row">
                      <span className="profile-summary-label">Nombre</span>
                      <span className="profile-summary-value">{user?.name || "No definido"}</span>
                    </div>
                    <div className="profile-summary-row">
                      <span className="profile-summary-label">Nickname</span>
                      <span className="profile-summary-value">{user?.nickname || nicknameInput || "No definido"}</span>
                    </div>
                    <div className="profile-summary-row">
                      <span className="profile-summary-label">Puesto</span>
                      <span className="profile-summary-value">{user?.puesto || puestoInput || "No definido"}</span>
                    </div>
                    <div className="profile-summary-row">
                      <span className="profile-summary-label">Correo</span>
                      <span className="profile-summary-value">{user?.correo || correoInput || "No definido"}</span>
                    </div>
                    <div className="profile-summary-row">
                      <span className="profile-summary-label">Teléfono visible</span>
                      <span className="profile-summary-value">{mostrarTelefonoInput ? "Sí" : "No"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer del Modal */}
            <div className="profile-modal-footer">
              <button 
                className="profile-btn profile-btn-secondary" 
                onClick={() => setShowEditProfileModal(false)}
              >
                Cancelar
              </button>
              <button 
                className="profile-btn profile-btn-primary" 
                onClick={guardarPerfil}
                disabled={savingProfile}
              >
                {savingProfile ? (
                  <>
                    <span className="profile-btn-spinner">⏳</span>
                    Guardando...
                  </>
                ) : (
                  <>
                    <span className="profile-btn-icon">💾</span>
                    Guardar Cambios
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================
         🔵 MODAL CAMBIAR CONTRASEÑA TEMPORAL
      ====================================================== */}
      {showChangePasswordModal && (
        <div 
          className="admin-modal-backdrop" 
          onClick={(e) => {
            // No permitir cerrar si es contraseña temporal
            if (user?.password_temporary) {
              e.stopPropagation();
            } else {
              setShowChangePasswordModal(false);
            }
          }}
          style={{ zIndex: 10001 }}
        >
          <div 
            className="admin-modal" 
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "450px", width: "90%" }}
          >
            <h3 style={{ color: "#90ffae", marginBottom: "20px" }}>
              🔐 Cambiar Contraseña
            </h3>
            
            {user?.password_temporary && (
              <div style={{
                background: "rgba(255, 193, 7, 0.1)",
                border: "1px solid rgba(255, 193, 7, 0.3)",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "20px",
                color: "#ffc107",
                fontSize: "0.9rem",
              }}>
                ⚠️ Tu contraseña es temporal. Por favor, establece una contraseña personal.
              </div>
            )}

            <div className="admin-modal-content">
              {!user?.password_temporary && (
                <div className="form-row">
                  <label>Contraseña Actual</label>
                  <input
                    type="password"
                    value={currentPasswordInput}
                    onChange={(e) => setCurrentPasswordInput(e.target.value)}
                    placeholder="Ingresa tu contraseña actual"
                    style={{
                      width: "100%",
                      padding: "10px",
                      background: "rgba(45, 45, 45, 0.9)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "10px",
                      color: "#fff",
                    }}
                  />
                </div>
              )}

              <div className="form-row">
                <label>Nueva Contraseña</label>
                <input
                  type="password"
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: "rgba(45, 45, 45, 0.9)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "10px",
                    color: "#fff",
                  }}
                />
              </div>

              <div className="form-row">
                <label>Confirmar Nueva Contraseña</label>
                <input
                  type="password"
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  placeholder="Confirma tu nueva contraseña"
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: "rgba(45, 45, 45, 0.9)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "10px",
                    color: "#fff",
                  }}
                />
              </div>
            </div>

            <div className="modal-actions">
              <button 
                className="btn-primary" 
                onClick={cambiarContraseñaTemporal}
                disabled={changingPassword || !user?.password_temporary}
                style={{
                  opacity: user?.password_temporary ? 1 : 0.5,
                  cursor: user?.password_temporary ? "pointer" : "not-allowed"
                }}
              >
                {changingPassword ? "Guardando..." : "Cambiar Contraseña"}
              </button>
              {!user?.password_temporary && (
                <button 
                  className="btn-danger" 
                  onClick={() => {
                    setShowChangePasswordModal(false);
                    setCurrentPasswordInput("");
                    setNewPasswordInput("");
                    setConfirmPasswordInput("");
                  }}
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================
         🔵 MODAL TEMAS PERSONAL
      ====================================================== */}
      <ModalTemasPersonal
        mostrar={showTemasPersonalModal}
        cerrar={() => setShowTemasPersonalModal(false)}
        serverUrl={SERVER_URL}
      />

      {/* ======================================================
         🔔 MODAL CONFIGURACIÓN DE NOTIFICACIONES
      ====================================================== */}
      {showNotificacionesModal && configNotificaciones && (
        <div 
          className="admin-modal-backdrop" 
          onClick={() => setShowNotificacionesModal(false)}
          style={{ zIndex: 10002 }}
        >
          <div 
            className="admin-modal" 
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "600px", width: "90%", maxHeight: "90vh" }}
          >
            <div className="admin-modal-content">
              <div className="notif-modal-header">
                <h3>🔔 Configuración de Notificaciones</h3>
                <p>Personaliza tu experiencia de alertas, sonidos y dispositivos.</p>
              </div>

              <div className="notif-modal-grid">
              <section className="notif-section">
                <h4>Estado</h4>
                <div className="notif-row">
                  <span>Notificaciones activas</span>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={configNotificaciones.notificaciones_activas === 1}
                      onChange={(e) =>
                        setConfigNotificaciones({
                          ...configNotificaciones,
                          notificaciones_activas: e.target.checked ? 1 : 0,
                        })
                      }
                    />
                    <span className="slider round"></span>
                  </label>
                </div>
                <div className="notif-row">
                  <span>Sonido activo</span>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={configNotificaciones.sonido_activo === 1}
                      onChange={(e) =>
                        setConfigNotificaciones({
                          ...configNotificaciones,
                          sonido_activo: e.target.checked ? 1 : 0,
                        })
                      }
                    />
                    <span className="slider round"></span>
                  </label>
                </div>
                <div className="notif-row">
                  <span>Notificar siempre cuando me mencionen</span>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={configNotificaciones.mencionar_siempre === 1}
                      onChange={(e) =>
                        setConfigNotificaciones({
                          ...configNotificaciones,
                          mencionar_siempre: e.target.checked ? 1 : 0,
                        })
                      }
                    />
                    <span className="slider round"></span>
                  </label>
                </div>
              </section>

              <section className="notif-section">
                <h4>Canales</h4>
                <div className="notif-row">
                  <span>Notificaciones de grupos</span>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={configNotificaciones.grupos_activos === 1}
                      onChange={(e) =>
                        setConfigNotificaciones({
                          ...configNotificaciones,
                          grupos_activos: e.target.checked ? 1 : 0,
                        })
                      }
                    />
                    <span className="slider round"></span>
                  </label>
                </div>
                <div className="notif-row">
                  <span>Mensajes privados</span>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={configNotificaciones.privados_activos === 1}
                      onChange={(e) =>
                        setConfigNotificaciones({
                          ...configNotificaciones,
                          privados_activos: e.target.checked ? 1 : 0,
                        })
                      }
                    />
                    <span className="slider round"></span>
                  </label>
                </div>
                <div className="notif-row">
                  <span>Chat general</span>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={configNotificaciones.general_activo === 1}
                      onChange={(e) =>
                        setConfigNotificaciones({
                          ...configNotificaciones,
                          general_activo: e.target.checked ? 1 : 0,
                        })
                      }
                    />
                    <span className="slider round"></span>
                  </label>
                </div>
              </section>

              <section className="notif-section notif-section-wide">
                <h4>Dispositivos</h4>
                <div className="notif-device-grid">
                  <div className="notif-row">
                    <span>Todos</span>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={!!todosDispositivos}
                        onChange={(e) => actualizarTodosDispositivos(e.target.checked)}
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>
                  <div className="notif-row">
                    <span>PC</span>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={configNotificaciones.dispositivo_pc === 1}
                        onChange={(e) =>
                          setConfigNotificaciones({
                            ...configNotificaciones,
                            dispositivo_pc: e.target.checked ? 1 : 0,
                          })
                        }
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>
                  <div className="notif-row">
                    <span>Tablet</span>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={configNotificaciones.dispositivo_tablet === 1}
                        onChange={(e) =>
                          setConfigNotificaciones({
                            ...configNotificaciones,
                            dispositivo_tablet: e.target.checked ? 1 : 0,
                          })
                        }
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>
                  <div className="notif-row">
                    <span>Móvil</span>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={configNotificaciones.dispositivo_movil === 1}
                        onChange={(e) =>
                          setConfigNotificaciones({
                            ...configNotificaciones,
                            dispositivo_movil: e.target.checked ? 1 : 0,
                          })
                        }
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>
                </div>
              </section>

              <section className="notif-section notif-section-wide">
                <h4>Horario y días</h4>
                <div className="notif-days-list">
                  {diasConfig.map((dia) => {
                    const activo = diasSemanaSeleccionados.includes(dia.id);
                    return (
                      <div key={dia.id} className="notif-day-row">
                        <div className="notif-day-info">
                          <span>{dia.label}</span>
                          <label className="switch">
                            <input
                              type="checkbox"
                              checked={activo}
                              onChange={() => toggleDiaSemana(dia.id)}
                            />
                            <span className="slider round"></span>
                          </label>
                        </div>
                        <div className="notif-day-times">
                          <label>
                            <span>Inicio</span>
                            <input
                              type="time"
                              value={getHorarioDia(dia.key, "inicio", configNotificaciones.horario_inicio || "08:00")}
                              onChange={(e) =>
                                setConfigNotificaciones({
                                  ...configNotificaciones,
                                  [`horario_${dia.key}_inicio`]: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            <span>Fin</span>
                            <input
                              type="time"
                              value={getHorarioDia(dia.key, "fin", configNotificaciones.horario_fin || "22:00")}
                              onChange={(e) =>
                                setConfigNotificaciones({
                                  ...configNotificaciones,
                                  [`horario_${dia.key}_fin`]: e.target.value,
                                })
                              }
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="notif-section">
                <h4>Sonidos</h4>
                <p className="notif-sonidos-desc">Los sonidos elegidos se aplican en todo el sistema (chat, notificaciones, campanita).</p>
                <div className="notif-sound-grid">
                  <label>
                    <span>Mensajes y notificaciones (campanita)</span>
                    <select
                      value={configNotificaciones.sonido_mensaje || "ixora-pulse"}
                      onChange={(e) => {
                        setConfigNotificaciones({
                          ...configNotificaciones,
                          sonido_mensaje: e.target.value,
                        });
                        reproducirPreviewSonido(e.target.value);
                      }}
                    >
                      {sonidosIxora.map((s) => (
                        <option key={`mensaje-${s.value}`} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Videos</span>
                    <select
                      value={configNotificaciones.sonido_video || "ixora-wave"}
                      onChange={(e) => {
                        setConfigNotificaciones({
                          ...configNotificaciones,
                          sonido_video: e.target.value,
                        });
                        reproducirPreviewSonido(e.target.value);
                      }}
                    >
                      {sonidosIxora.map((s) => (
                        <option key={`video-${s.value}`} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Juntas</span>
                    <select
                      value={configNotificaciones.sonido_juntas || "ixora-alert"}
                      onChange={(e) => {
                        setConfigNotificaciones({
                          ...configNotificaciones,
                          sonido_juntas: e.target.value,
                        });
                        reproducirPreviewSonido(e.target.value);
                      }}
                    >
                      {sonidosIxora.map((s) => (
                        <option key={`juntas-${s.value}`} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>

              <section className="notif-section">
                <h4>Reuniones (videollamadas)</h4>
                <div className="notif-sound-grid">
                  <div className="notif-row">
                    <span>Videollamada individual</span>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={configNotificaciones.notificar_reunion_individual === 1}
                        onChange={(e) =>
                          setConfigNotificaciones({
                            ...configNotificaciones,
                            notificar_reunion_individual: e.target.checked ? 1 : 0,
                          })
                        }
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>
                  <select
                    value={configNotificaciones.sonido_video_individual || "ixora-call"}
                    onChange={(e) => {
                      setConfigNotificaciones({
                        ...configNotificaciones,
                        sonido_video_individual: e.target.value,
                      });
                      reproducirPreviewSonido(e.target.value);
                    }}
                  >
                    {sonidosIxora.map((s) => (
                      <option key={`call-ind-${s.value}`} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <div className="notif-row">
                    <span>Videollamada grupal</span>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={configNotificaciones.notificar_reunion_grupal === 1}
                        onChange={(e) =>
                          setConfigNotificaciones({
                            ...configNotificaciones,
                            notificar_reunion_grupal: e.target.checked ? 1 : 0,
                          })
                        }
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>
                  <select
                    value={configNotificaciones.sonido_video_grupal || "ixora-call-group"}
                    onChange={(e) => {
                      setConfigNotificaciones({
                        ...configNotificaciones,
                        sonido_video_grupal: e.target.value,
                      });
                      reproducirPreviewSonido(e.target.value);
                    }}
                  >
                    {sonidosIxora.map((s) => (
                      <option key={`call-grp-${s.value}`} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </section>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: "0", display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button 
                className="btn-secondary" 
                onClick={() => setShowNotificacionesModal(false)}
                style={{ padding: "10px 20px" }}
              >
                Cancelar
              </button>
              <button 
                className="btn-primary" 
                onClick={async () => {
                  try {
                    const serverUrl = await getServerUrl();
                    const response = await authFetch(`${serverUrl}/chat/notificaciones/config`, {
                      method: "PUT",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify(configNotificaciones),
                    });
                    if (response && (response.ok || response.config)) {
                      showAlert("✅ Configuración de notificaciones guardada", "success");
                      setShowNotificacionesModal(false);
                      window.dispatchEvent(new CustomEvent("config-notificaciones-guardada"));
                    } else {
                      showAlert("❌ Error al guardar configuración", "error");
                    }
                  } catch (error) {
                    console.error("Error guardando configuración de notificaciones:", error);
                    showAlert("❌ Error al guardar configuración", "error");
                  }
                }}
                style={{ padding: "10px 20px" }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Reuniones */}
      <ModalReuniones
        mostrar={showReunionesModal}
        cerrar={() => setShowReunionesModal(false)}
      />
    </AuthContext.Provider>
  );
}
