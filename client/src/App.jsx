import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import io from "socket.io-client";
import "./App.css";
import "./estilos/tema.css";
import "./estilos/global.css";
import { NotificationProvider } from "./components/Notifications";
import WidgetsMenu from "./components/WidgetsMenu";
import { AlertModalProvider, useAlert } from "./components/AlertModal";
import logger from "./utils/logger";

import Picking from "./pestañas/Picking/Picking";
import RegistrosPicking from "./pestañas/RegistrosPicking/RegistrosPicking";
import ReportesPicking from "./pestañas/ReportesPicking/ReportesPicking";
import Inventario from "./pestañas/Inventario/Inventario";
import Auditoria from "./pestañas/Auditoria/Auditoria";
import Devoluciones from "./pestañas/Devoluciones/Devoluciones";
import ReportesDevoluciones from "./pestañas/ReportesDevoluciones/ReportesDevoluciones";
import Administrador from "./pestañas/Administrador/Administrador";
import Reenvios from "./pestañas/Reenvios/Reenvios";
import ReportesReenvios from "./pestañas/ReportesReenvios/ReportesReenvios";
import IxoraIA from "./pestañas/IxoraIA/IxoraIA";
import Tienda from "./pestañas/Tienda/Tienda";
import ActivosInformaticos from "./pestañas/ActivosInformaticos/ActivosInformaticos";
import Activaciones from "./pestañas/Activaciones/Activaciones";
import ReportesActivaciones from "./pestañas/ReportesActivaciones/ReportesActivaciones";

import { AuthProvider, useAuth } from "./AuthContext";
import Login from "./Login";
import { SERVER_URL, getServerUrl, getServerUrlSync } from "./config/server";

// Socket.io siempre usa la IP del servidor IXORA
// Inicializar con URL síncrona, se actualizará después
// PROTECCIÓN: Envolver en try-catch para evitar crashes en Android
let socket = null;
try {
  const serverUrl = getServerUrlSync();
  if (serverUrl) {
    socket = io(serverUrl, { 
      transports: ["websocket", "polling"], // Permitir fallback a polling si websocket falla
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      timeout: 10000, // Timeout de 10 segundos
      autoConnect: false, // No conectar automáticamente, esperar a que la app esté lista
    });
    
    // Manejar errores del socket para evitar crashes
    socket.on('connect_error', (error) => {
      console.warn('⚠️ Error de conexión socket:', error);
    });
    
    socket.on('error', (error) => {
      console.warn('⚠️ Error socket:', error);
    });
  }
} catch (error) {
  console.error("Error inicializando socket:", error);
  // Crear socket dummy para evitar crashes
  socket = {
    connected: false,
    disconnect: () => {},
    connect: () => {},
    on: () => {},
    emit: () => {},
    io: { uri: "" }
  };
}

// Exponer socket globalmente para que otros componentes puedan usarlo
window.socket = socket;

const CATEGORIAS = {
  Alimentos: [],
  Capsulas: [],
  Gotas: [],
  Importación: [
    "Biodegradables",
    "Botellas",
    "Cuidado Personal",
    "Esencias",
    "Sport",
    "Velas",
  ],
  Mascotas: [],
  Orgánico: [],
  Polvos: [],
};

function AppProtegida() {
  const { user, isLoading } = useAuth();
  
  // PROTECCIÓN: Usar useMemo para evitar re-renders innecesarios
  // IMPORTANTE: Los hooks deben estar al inicio, no condicionalmente
  const tokenEnStorage = useMemo(() => {
    try {
      return localStorage.getItem("token");
    } catch (e) {
      return null;
    }
  }, []);
  
  const urlParams = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search);
    } catch (e) {
      return new URLSearchParams();
    }
  }, []);
  
  const tabFromURL = urlParams.get('tab');
  const esTienda = tabFromURL === 'tienda';
  
  // Mostrar loading mientras se carga la sesión
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
  
  // Si es tienda, permitir acceso sin login
  if (esTienda) {
    return <App />;
  }
  
  // Para otras pestañas, requerir login
  // PROTECCIÓN: Verificar token en localStorage también para evitar re-renders innecesarios
  // IMPORTANTE: En Android, dar más tiempo para que la sesión se cargue
  if (!user && !tokenEnStorage) {
    return <Login />;
  }
  
  if (!user && tokenEnStorage) {
    // Si hay token pero no user, esperar un momento (puede estar cargando)
    // PROTECCIÓN: En Android, dar más tiempo antes de mostrar error
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#1a1a1a',
        color: '#fff'
      }}>
        <div>Cargando sesión...</div>
      </div>
    );
  }
  
  // Si hay user, renderizar la app
  if (user) {
    return <App />;
  }
  
  // Fallback: mostrar login
  return <Login />;
}

const TITULO_TABS = {
  escaneo: "Picking",
  escaneo_retail: "Picking Retail",
  escaneo_fulfillment: "Picking Fulfillment",
  registros: "Registros Picking",
  registros_retail: "Registros Retail",
  registros_fulfillment: "Registros Fulfillment",
  devoluciones: "Devoluciones",
  reenvios: "Reenvíos",
  reportes: "Reportes Picking",
  rep_devol: "Reportes Devoluciones",
  rep_reenvios: "Reportes Reenvíos",
  inventario: "Inventario",
  activaciones: "Activaciones",
  rep_activaciones: "Reportes Activaciones",
  auditoria: "Auditoría",
  admin: "Administrador",
  ixora_ia: "IXORA IA",
  tienda: "Tienda",
  activos: "Activos Informáticos",
};

const DEV_TIPOS = [
  "clientes",
  "calidad",
  "reacondicionados",
  "retail",
  "cubbo",
  "regulatorio",
];

function App() {
  const { logout, user, perms, authFetch, abrirEditarPerfil, refrescarPermisos } = useAuth();
  const { showAlert } = useAlert();


  const can = (perm) => perms?.includes(perm);

  const detectarDispositivo = () => {
    const width = window.innerWidth;
    const userAgent = navigator.userAgent.toLowerCase();
    const esTablet = (width >= 600 && width < 1024) || 
                     /tablet|ipad|playbook|silk/i.test(userAgent);
    const esCelular = width < 600 || 
                      (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent) && !esTablet);
    const esPC = !esTablet && !esCelular;
    
    return { esPC, esTablet, esCelular };
  };

  const [visibilidadPestañas, setVisibilidadPestañas] = useState({});

  // Efecto para detectar y actualizar la IP del servidor al iniciar
  useEffect(() => {
    const actualizarIPServidor = async () => {
      try {
        // Limpiar IP antigua del localStorage si existe
        const savedUrl = localStorage.getItem('server_url');
        if (savedUrl && savedUrl.includes('172.16.30.160')) {
          localStorage.removeItem('server_url');
        }
        
        // En desarrollo, usar la IP actual con puerto 3001
        let nuevaUrl;
        if (process.env.NODE_ENV === 'development') {
          const currentHost = window.location.hostname;
          if (currentHost && currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
            nuevaUrl = `http://${currentHost}:3001`;
          } else {
            nuevaUrl = 'http://172.16.30.12:3001';
          }
        } else {
          nuevaUrl = await getServerUrl();
        }
        
        // Guardar en localStorage
        localStorage.setItem('server_url', nuevaUrl);
        
        // Si la URL cambió, reconectar el socket
        // PROTECCIÓN: Verificar que socket existe y es válido
        if (socket && socket.io) {
          if (socket.io.uri !== nuevaUrl) {
            try {
              socket.disconnect();
              socket.io.uri = nuevaUrl;
              setTimeout(() => {
                if (socket && socket.connect && !socket.connected) {
                  socket.connect();
                }
              }, 500);
            } catch (error) {
              console.warn("Error reconectando socket:", error);
            }
          } else if (!socket.connected && socket.connect) {
            // Si no está conectado, conectar después de un delay
            setTimeout(() => {
              try {
                if (socket && socket.connect && !socket.connected) {
                  socket.connect();
                }
              } catch (error) {
                console.warn("Error conectando socket:", error);
              }
            }, 1000);
          }
        }
      } catch (err) {
        console.warn('⚠️ [App] Error actualizando IP del servidor:', err);
        // Fallback a IP por defecto
        const fallbackUrl = 'http://172.16.30.12:3001';
        localStorage.setItem('server_url', fallbackUrl);
        if (socket.io) {
          socket.io.uri = fallbackUrl;
          if (!socket.connected) {
            socket.connect();
          }
        }
      }
    };
    
    actualizarIPServidor();
  }, []);

  useEffect(() => {
    const cargarVisibilidad = async () => {
      try {
        // Obtener URL actualizada del servidor
        const currentServerUrl = await getServerUrl();
        const permisos = await authFetch(`${currentServerUrl}/admin/perms/visibilidad`);
        const visibilidad = {};
        if (Array.isArray(permisos)) {
          permisos.forEach(perm => {
            if (typeof perm === 'object' && perm.perm && perm.perm.startsWith('tab:')) {
              visibilidad[perm.perm] = {
                visible_tablet: perm.visible_tablet !== undefined ? perm.visible_tablet : 1,
                visible_celular: perm.visible_celular !== undefined ? perm.visible_celular : 1
              };
            }
          });
        }
        setVisibilidadPestañas(visibilidad);
      } catch (err) {
        if (!err.message?.includes("403") && !err.message?.includes("permiso")) {
          console.error("Error cargando visibilidad de pestañas:", err);
        }
      }
    };
    
    if (user) {
      cargarVisibilidad();
    }
  }, [user, authFetch]);

  const debeMostrarPestaña = (tabPerm) => {
    const { esPC, esTablet, esCelular } = detectarDispositivo();
    if (esPC) return true;
    const visibilidad = visibilidadPestañas[tabPerm];
    if (!visibilidad) return true;
    if (esTablet) {
      return visibilidad.visible_tablet === 1;
    }
    if (esCelular) {
      return visibilidad.visible_celular === 1;
    }
    return true;
  };

  const getFirstAllowedTab = useCallback(() => {
    const tabs = [
      { tab: "escaneo", perm: "tab:escaneo" },
      { tab: "registros", perm: "tab:registros" },
      { tab: "devoluciones", perm: "tab:devoluciones" },
      { tab: "reenvios", perm: "tab:reenvios" },
      { tab: "reportes", perm: "tab:reportes" },
      { tab: "rep_devol", perm: "tab:rep_devol" },
      { tab: "rep_reenvios", perm: "tab:rep_reenvios" },
      { tab: "inventario", perm: "tab:inventario" },
      { tab: "activaciones", perm: "tab:activaciones" },
      { tab: "rep_activaciones", perm: "tab:rep_activaciones" },
      { tab: "auditoria", perm: "tab:auditoria" },
      { tab: "tienda", perm: "tab:tienda" },
      { tab: "activos", perm: "tab:activos" },
      { tab: "admin", perm: "tab:admin" },
      { tab: "ixora_ia", perm: "tab:ixora_ia" },
    ];

    for (const { tab, perm } of tabs) {
      if (can(perm) && debeMostrarPestaña(perm)) {
        return tab;
      }
    }
    return "escaneo";
  }, [can, debeMostrarPestaña]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [logoViewerOpen, setLogoViewerOpen] = useState(false);
  const [categoriasColapsadas, setCategoriasColapsadas] = useState({
    operaciones: true,
    gestion: true,
    reportes: true,
    inventario: true,
    negocios: true,
    administracion: true,
  });

  // Agregar/remover clase al body cuando el menú esté abierto
  useEffect(() => {
    if (menuOpen) {
      document.body.classList.add("menu-abierto");
    } else {
      document.body.classList.remove("menu-abierto");
    }
    return () => {
      document.body.classList.remove("menu-abierto");
    };
  }, [menuOpen]);

  const getTabFromURL = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabFromURL = urlParams.get('tab');
    if (tabFromURL && TITULO_TABS[tabFromURL]) {
      return tabFromURL;
    }
    return "escaneo";
  };

  const initialTab = getTabFromURL();
  const [activeTab, setActiveTab] = useState(initialTab);

  // Historial de pestañas para navegación con botón de regreso
  const tabHistoryRef = useRef([initialTab || 'escaneo']);
  
  // Inicializar historial cuando cambia la pestaña inicial
  useEffect(() => {
    if (initialTab && tabHistoryRef.current.length === 1 && tabHistoryRef.current[0] !== initialTab) {
      tabHistoryRef.current = [initialTab];
    }
  }, [initialTab]);

  const cambiarModulo = useCallback((tab) => {
    // Optimización: evitar re-renders innecesarios
    if (activeTab === tab) return;
    
    // Agregar la pestaña actual al historial antes de cambiar (si no es la misma)
    if (activeTab && activeTab !== tab) {
      // Solo agregar si no está ya en el historial o si es diferente a la última
      const lastTab = tabHistoryRef.current[tabHistoryRef.current.length - 1];
      if (activeTab !== lastTab) {
        tabHistoryRef.current.push(activeTab);
        // Limitar el historial a máximo 10 pestañas para evitar problemas de memoria
        if (tabHistoryRef.current.length > 10) {
          tabHistoryRef.current.shift();
        }
      }
    }
    
    setActiveTab(tab);
    setMenuOpen(false);
    const url = new URL(window.location);
    url.searchParams.set('tab', tab);
    // Usar pushState para permitir navegación con botón de regreso
    window.history.pushState({ tab }, '', url);
  }, [activeTab]);

  // Manejar botón de regreso de Android
  useEffect(() => {
    // Detectar si estamos en Android nativo
    const isNativeAndroid = typeof window !== 'undefined' && 
      window.Capacitor && 
      window.Capacitor.isNativePlatform && 
      window.Capacitor.isNativePlatform() &&
      window.Capacitor.getPlatform() === 'android';

    if (!isNativeAndroid) return;

    let backButtonListener = null;

    // Manejar el botón de regreso de Android
    const handleBackButton = async () => {
      try {
        // Intentar importar dinámicamente el plugin de App
        let App;
        try {
          const appModule = await import('@capacitor/app');
          App = appModule.App;
        } catch (importError) {
          console.warn('Plugin @capacitor/app no disponible, usando método alternativo');
          // Fallback: usar window.history.back() si el plugin no está disponible
          document.addEventListener('backbutton', (e) => {
            e.preventDefault();
            if (tabHistoryRef.current.length > 1) {
              window.history.back();
            }
          }, false);
          return;
        }
        
        // Escuchar el evento de botón de regreso
        backButtonListener = await App.addListener('backButton', ({ canGoBack }) => {
          // Si el menú está abierto, cerrarlo primero
          if (menuOpen) {
            setMenuOpen(false);
            return;
          }

          // Si hay historial de pestañas, navegar a la anterior usando window.history.back()
          if (tabHistoryRef.current.length > 1) {
            window.history.back();
          } else {
            // Si no hay historial, salir de la app
            if (App && App.exitApp) {
              App.exitApp();
            }
          }
        });
      } catch (error) {
        console.warn('Error configurando botón de regreso:', error);
        // Fallback: usar evento personalizado de Android
        document.addEventListener('backbutton', (e) => {
          e.preventDefault();
          if (menuOpen) {
            setMenuOpen(false);
            return;
          }
          if (tabHistoryRef.current.length > 1) {
            window.history.back();
          }
        }, false);
      }
    };

    handleBackButton();

    // Limpiar listener al desmontar
    return () => {
      if (backButtonListener) {
        backButtonListener.remove();
      }
    };
  }, [activeTab, menuOpen, setMenuOpen]);

  useLayoutEffect(() => {
    const tabFromURL = getTabFromURL();
    const initialTab = tabFromURL || "escaneo";
    
    // Si es tienda, permitir acceso sin permisos (pública)
    if (initialTab === "tienda") {
      if (initialTab !== activeTab) {
        setActiveTab(initialTab);
        const url = new URL(window.location);
        url.searchParams.set('tab', initialTab);
        window.history.replaceState({ tab: initialTab }, '', url);
      }
      return; // No verificar permisos para tienda
    }
    
    // Para otras pestañas, verificar permisos
    if (!perms || perms.length === 0) return;
    
    const tabsWithPerms = {
      escaneo: "tab:escaneo",
      registros: "tab:registros",
      devoluciones: "tab:devoluciones",
      reenvios: "tab:reenvios",
      reportes: "tab:reportes",
      rep_devol: "tab:rep_devol",
      rep_reenvios: "tab:rep_reenvios",
      inventario: "tab:inventario",
      activaciones: "tab:activaciones",
      rep_activaciones: "tab:rep_activaciones",
      auditoria: "tab:auditoria",
      tienda: "tab:tienda",
      activos: "tab:activos",
      admin: "tab:admin",
      ixora_ia: "tab:ixora_ia",
    };

    const requiredPerm = tabsWithPerms[initialTab];
    
    if (requiredPerm && can(requiredPerm)) {
      if (initialTab !== activeTab) {
        setActiveTab(initialTab);
        const url = new URL(window.location);
        url.searchParams.set('tab', initialTab);
        window.history.replaceState({ tab: initialTab }, '', url);
      }
    } else {
      const firstAllowedTab = getFirstAllowedTab();
      if (firstAllowedTab && firstAllowedTab !== activeTab) {
        setActiveTab(firstAllowedTab);
        const url = new URL(window.location);
        url.searchParams.set('tab', firstAllowedTab);
        window.history.replaceState({ tab: firstAllowedTab }, '', url);
      }
    }
  }, [perms]);

  const [productos, setProductos] = useState([]);
  const [devoluciones, setDevoluciones] = useState([]);
  const [diasCerrados, setDiasCerrados] = useState([]);
  const [detalleDia, setDetalleDia] = useState([]);
  const [fecha, setFecha] = useState("");
  const [horaActual, setHoraActual] = useState(new Date());
  const [inventario, setInventario] = useState([]);
  const [lotesCache, setLotesCache] = useState({});
  const [personalizacion, setPersonalizacion] = useState({
    mensajeBienvenida: "",
    mensajeBienvenidaAncho: 500,
    mensajeBienvenidaAlto: "auto",
    mensajeBienvenidaPosX: 0,
    mensajeBienvenidaPosY: 0,
    mensajeBienvenidaTamañoFuente: 0.7,
    mensajeBienvenidaAlineacionTexto: "center",
    mensajeBienvenidaAlineacionVertical: "center",
    logo: null,
    favicon: null,
    fondo: null,
    fondoTransparencia: 0.3,
    fondoTipo: null,
    colorPrimario: "#3b82f6",
    colorSecundario: "#1e40af",
    colorFondoPrincipal: "#15192e",
    nombreApp: "IXORA",
  });

  const [toasts, setToasts] = useState([]);
  const pushToast = useCallback((text, type = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    // Errores y advertencias duran más tiempo para que se puedan leer
    const duration = type === "err" || type === "error" || type === "warn" ? 8000 : 5000;
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  useEffect(() => {
    // Si estamos en la tienda, no cambiar el título (la tienda maneja su propio título)
    if (activeTab === "tienda") {
      const nombreTienda = localStorage.getItem('tienda_nombre');
      if (nombreTienda) {
        document.title = nombreTienda;
        return; // No hacer nada más, dejar que la tienda maneje su título
      }
    }
    
    // Usar requestAnimationFrame para evitar parpadeos al cambiar título
    requestAnimationFrame(() => {
      const tituloBase = personalizacion.nombreApp || "IXORA";
      const tituloTab = TITULO_TABS[activeTab] || "";
      document.title = tituloTab ? `${tituloBase} - ${tituloTab}` : tituloBase;
    });
  }, [activeTab, personalizacion.nombreApp]);

  useEffect(() => {
    const handlePopState = (event) => {
      const tabFromURL = getTabFromURL();
      
      // Si hay historial de pestañas, usar el historial en lugar de la URL
      if (tabHistoryRef.current.length > 1) {
        tabHistoryRef.current.pop();
        const previousTab = tabHistoryRef.current[tabHistoryRef.current.length - 1];
        
        if (previousTab && previousTab !== activeTab) {
          const tabsWithPerms = {
            escaneo: "tab:escaneo",
            registros: "tab:registros",
            devoluciones: "tab:devoluciones",
            reenvios: "tab:reenvios",
            reportes: "tab:reportes",
            rep_devol: "tab:rep_devol",
            rep_reenvios: "tab:rep_reenvios",
            inventario: "tab:inventario",
            activaciones: "tab:activaciones",
            rep_activaciones: "tab:rep_activaciones",
            auditoria: "tab:auditoria",
            admin: "tab:admin",
            ixora_ia: "tab:ixora_ia",
            tienda: "tab:tienda",
            activos: "tab:activos",
          };
          
          const requiredPerm = tabsWithPerms[previousTab];
          if (!requiredPerm || can(requiredPerm) || previousTab === 'tienda') {
            setActiveTab(previousTab);
            const url = new URL(window.location);
            url.searchParams.set('tab', previousTab);
            window.history.replaceState({ tab: previousTab }, '', url);
            return;
          }
        }
      }
      
      // Fallback al comportamiento original si no hay historial
      if (tabFromURL && tabFromURL !== activeTab) {
        // Si es tienda, permitir acceso sin permisos (pública)
        if (tabFromURL === "tienda") {
          setActiveTab(tabFromURL);
          return;
        }
        
        // Para otras pestañas, verificar permisos
        if (!perms || perms.length === 0) return;
        
        const tabsWithPerms = {
          escaneo: "tab:escaneo",
          registros: "tab:registros",
          devoluciones: "tab:devoluciones",
          reenvios: "tab:reenvios",
          reportes: "tab:reportes",
          rep_devol: "tab:rep_devol",
          rep_reenvios: "tab:rep_reenvios",
          inventario: "tab:inventario",
          activaciones: "tab:activaciones",
          rep_activaciones: "tab:rep_activaciones",
          auditoria: "tab:auditoria",
          admin: "tab:admin",
          ixora_ia: "tab:ixora_ia",
          tienda: "tab:tienda",
          activos: "tab:activos",
        };
        
        const requiredPerm = tabsWithPerms[tabFromURL];
        if (requiredPerm && can(requiredPerm)) {
          setActiveTab(tabFromURL);
        } else {
          const firstAllowedTab = getFirstAllowedTab();
          if (firstAllowedTab) {
            cambiarModulo(firstAllowedTab);
          }
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeTab, perms, can, cambiarModulo, getFirstAllowedTab]);

  useEffect(() => {
    // Optimización: actualizar hora cada segundo pero sin causar re-renders innecesarios
    // Usar ref para minimizar re-renders del componente completo
    const interval = setInterval(() => {
      setHoraActual(prev => {
        const now = new Date();
        // Solo actualizar si realmente cambió el segundo
        if (prev.getSeconds() !== now.getSeconds()) {
          return now;
        }
        return prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  
  // Memoizar formatearHora para evitar recalcular en cada render
  const horaFormateada = useMemo(() => formatearHora(horaActual), [horaActual, formatearHora]);
  
  // Memoizar fecha formateada
  const fechaCompletaFormateada = useMemo(() => fecha ? formatearFechaCompleta(fecha) : "", [fecha, formatearFechaCompleta]);

  // Detectar y aplicar modo oscuro del sistema
  useEffect(() => {
    const { watchDarkMode, applySystemDarkMode } = require("./utils/darkMode");
    
    // Aplicar modo oscuro inicial
    applySystemDarkMode();
    
    // Escuchar cambios en el modo oscuro del sistema
    const unsubscribe = watchDarkMode((isDark) => {
      applySystemDarkMode();
      // Si no hay tema personal guardado, aplicar modo oscuro automáticamente
      const tieneTemaPersonal = user && user.id && localStorage.getItem(`tema-personal-${user.id}`);
      if (!tieneTemaPersonal && isDark) {
        // Si el sistema está en modo oscuro, aplicar tema oscuro si no hay preferencia guardada
        const temaActual = localStorage.getItem("tema-actual");
        if (!temaActual || temaActual === "azul") {
          import("./utils/temas").then(({ aplicarTema }) => {
            aplicarTema("modoOscuro");
            localStorage.setItem("tema-actual", "modoOscuro");
          });
        }
      }
    });
    
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    let temaGuardado = null;
    if (user && user.id) {
      const temaPersonal = localStorage.getItem(`tema-personal-${user.id}`);
      if (temaPersonal) {
        temaGuardado = temaPersonal;
      } else {
        temaGuardado = localStorage.getItem("tema-actual");
      }
    } else {
      temaGuardado = localStorage.getItem("tema-actual");
    }
    
    // Si no hay tema guardado, verificar modo oscuro del sistema
    if (!temaGuardado) {
      const { isDarkMode } = require("./utils/darkMode");
      if (isDarkMode()) {
        temaGuardado = "modoOscuro";
        localStorage.setItem("tema-actual", "modoOscuro");
      } else {
        temaGuardado = "azul";
        localStorage.setItem("tema-actual", "azul");
      }
    }
    
    if (temaGuardado) {
      import("./utils/temas").then(({ aplicarTema }) => {
        aplicarTema(temaGuardado);
      });
    } else {
      import("./utils/temas").then(({ aplicarTema }) => {
        aplicarTema("azul");
        if (!user || !user.id || !localStorage.getItem(`tema-personal-${user.id}`)) {
          localStorage.setItem("tema-actual", "azul");
        }
      });
    }
  }, [user]);

  useEffect(() => {
    const handleTemaActualizado = (event) => {
      const nuevoTema = event.detail;
      import("./utils/temas").then(({ aplicarTema }) => {
        aplicarTema(nuevoTema);
        if (user && user.id) {
          localStorage.setItem(`tema-personal-${user.id}`, nuevoTema);
          localStorage.setItem("tema-actual", nuevoTema);
        } else {
          localStorage.setItem("tema-actual", nuevoTema);
        }
      });
    };

    window.addEventListener('tema-personal-actualizado', handleTemaActualizado);
    return () => {
      window.removeEventListener('tema-personal-actualizado', handleTemaActualizado);
    };
  }, [user]);

  const cargasInicialesRef = useRef(false);
  
  useEffect(() => {
    const tokenEnStorage = localStorage.getItem("token");
    // Evitar disparar peticiones protegidas si no hay sesión
    if (!tokenEnStorage) return;
    if (cargasInicialesRef.current) return;
    cargasInicialesRef.current = true;
    
    // Cargar datos con delay para evitar sobrecarga inicial y mejorar rendimiento
    setTimeout(() => {
      cargarProductos();
      cargarInventario();
      cargarDevoluciones();
      cargarDiasCerrados();
      cargarFecha();
      // Cargar personalización con más delay para evitar conflictos
      setTimeout(() => {
        cargarPersonalizacion();
      }, 500);
    }, 500); // Aumentar delay a 500ms para mejor rendimiento
  }, [user]);

  const cargarPersonalizacion = useCallback(async () => {
    try {
      let temaPersonalLocal = null;
      if (user && user.id) {
        temaPersonalLocal = localStorage.getItem(`tema-personal-${user.id}`);
      }
      
      let temaPersonal = null;
      let usuarioTieneTemaPersonal = false;
      // DESACTIVADO: Cargar tema personal desde servidor causa problemas de rendimiento
      // Usar solo tema del localStorage (más rápido y confiable)
      if (user && user.id && temaPersonalLocal) {
        temaPersonal = temaPersonalLocal;
        usuarioTieneTemaPersonal = true;
      }
      
      const data = await authFetch(`${SERVER_URL}/admin/personalizacion`);
      if (data) {
        let temaAAplicar = null;
        
        if (usuarioTieneTemaPersonal && temaPersonal) {
          temaAAplicar = temaPersonal;
        } else {
          temaAAplicar = data.tema || localStorage.getItem("tema-actual") || "azul";
        }
        
        if (temaAAplicar) {
          const { aplicarTema } = await import("./utils/temas");
          aplicarTema(temaAAplicar);
          
          if (!usuarioTieneTemaPersonal) {
            localStorage.setItem("tema-actual", temaAAplicar);
          }
        }
        
        if (!usuarioTieneTemaPersonal && data.colorFondoPrincipal) {
          document.documentElement.style.setProperty('--fondo-principal', data.colorFondoPrincipal);
        }
        
        // Actualizar personalización directamente (sin requestAnimationFrame para mejor rendimiento)
        setPersonalizacion((prev) => {
          const nueva = { 
            ...prev, 
            ...data,
            fondo: data.fondo !== undefined && data.fondo !== null ? data.fondo : (prev.fondo !== undefined ? prev.fondo : data.fondo),
            fondoTipo: data.fondoTipo || prev.fondoTipo || data.fondoTipo,
            fondoTransparencia: data.fondoTransparencia !== undefined ? data.fondoTransparencia : (prev.fondoTransparencia !== undefined ? prev.fondoTransparencia : 0.3),
            mensajeBienvenidaAncho: data.mensajeBienvenidaAncho || 500,
            mensajeBienvenidaAlto: data.mensajeBienvenidaAlto || "auto",
            mensajeBienvenidaPosX: data.mensajeBienvenidaPosX || 0,
            mensajeBienvenidaPosY: data.mensajeBienvenidaPosY || 0,
            mensajeBienvenidaTamañoFuente: data.mensajeBienvenidaTamañoFuente || 0.7,
            mensajeBienvenidaAlineacionTexto: data.mensajeBienvenidaAlineacionTexto || "center",
            mensajeBienvenidaAlineacionVertical: data.mensajeBienvenidaAlineacionVertical || "center",
          };
          // Solo actualizar si realmente cambió algo
          if (JSON.stringify(prev) === JSON.stringify(nueva)) return prev;
          return nueva;
        });
        
        if (data.favicon) {
          const faviconTipo = data.faviconTipo || "imagen";
          
          // Eliminar todos los favicons existentes
          document.querySelectorAll("link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']").forEach(el => el.remove());
          
          // Usar la ruta GET del servidor que busca automáticamente el favicon
          const timestamp = Date.now();
          const faviconUrl = `${SERVER_URL}/admin/personalizacion/favicon?t=${timestamp}`;
          
          // Intentar también con la ruta estática directa como fallback
          const posiblesExtensiones = faviconTipo === "gif" ? ["gif"] : 
                                     faviconTipo === "svg" ? ["svg"] : 
                                     ["png", "ico", "jpg", "jpeg"];
          
          // Primero intentar con la ruta GET del servidor
          const link = document.createElement("link");
          link.rel = "icon";
          link.type = faviconTipo === "svg" ? "image/svg+xml" : faviconTipo === "gif" ? "image/gif" : "image/png";
          link.href = faviconUrl;
          link.onerror = () => {
            // Si falla, intentar con rutas estáticas directas
            console.warn("⚠️ Favicon no encontrado en ruta GET, intentando rutas estáticas...");
            posiblesExtensiones.forEach((ext, index) => {
              const fallbackLink = document.createElement("link");
              fallbackLink.rel = index === 0 ? "icon" : "alternate icon";
              fallbackLink.type = ext === "svg" ? "image/svg+xml" : ext === "gif" ? "image/gif" : ext === "png" ? "image/png" : "image/x-icon";
              fallbackLink.href = `${SERVER_URL}/uploads/personalizacion/favicons/favicon.${ext}?t=${timestamp}`;
              document.head.appendChild(fallbackLink);
            });
          };
          document.head.appendChild(link);
          
          // Agregar shortcut icon
          const shortcutLink = document.createElement("link");
          shortcutLink.rel = "shortcut icon";
          shortcutLink.href = faviconUrl;
          document.head.appendChild(shortcutLink);
          
          // Agregar también apple-touch-icon para mejor compatibilidad
          const appleLink = document.createElement("link");
          appleLink.rel = "apple-touch-icon";
          appleLink.href = faviconUrl;
          document.head.appendChild(appleLink);
          
          console.log(`✅ Favicon cargado desde: ${faviconUrl}`);
        } else {
          document.querySelectorAll("link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']").forEach(el => {
            if (el.href.includes('personalizacion')) {
              el.remove();
            }
          });
        }
      }
    } catch (err) {
      console.error("❌ Error cargando personalización:", err);
      const temaFallback = localStorage.getItem("tema-actual") || "azul";
      import("./utils/temas").then(({ aplicarTema }) => {
        aplicarTema(temaFallback);
      });
    }
  }, [SERVER_URL, user]);

  useEffect(() => {
    const tieneTemaPersonal = user && user.id && localStorage.getItem(`tema-personal-${user.id}`);
    
    if (tieneTemaPersonal) {
      return;
    }
    
    if (personalizacion.colorFondoPrincipal) {
      document.documentElement.style.setProperty('--fondo-principal', personalizacion.colorFondoPrincipal);
    } else {
      const temaActualNombre = localStorage.getItem("tema-actual") || "azul";
      const { temas } = require("./utils/temas");
      const temaActual = temas[temaActualNombre];
      if (temaActual && temaActual.colores["--fondo-principal"]) {
        document.documentElement.style.setProperty('--fondo-principal', temaActual.colores["--fondo-principal"]);
      }
    }
  }, [personalizacion.colorFondoPrincipal, user]);

  const cargarProductos = useCallback(async () => {
    try {
      const data = await authFetch(`${SERVER_URL}/productos?canal=all`);
      setProductos(data);
    } catch (err) {
      console.error("❌ Error al cargar productos:", err);
    }
  }, [SERVER_URL]);

  const cargandoInventarioRef = useRef(false);
  
  const cargarInventario = useCallback(async (force = false) => {
    if (cargandoInventarioRef.current && !force) {
      return;
    }
    
    cargandoInventarioRef.current = true;
    
    try {
      const data = await authFetch(`${SERVER_URL}/inventario`);
      data.sort((a, b) =>
        (a.nombre || "").localeCompare(b.nombre || "", "es")
      );
      setInventario(data);
    } catch (err) {
      console.error("❌ Error al cargar inventario:", err);
    } finally {
      cargandoInventarioRef.current = false;
    }
  }, [SERVER_URL]);

  const cargarDevoluciones = useCallback(async () => {
    try {
      const acumulado = [];
      for (const tipo of DEV_TIPOS) {
        const data = await authFetch(
          `${SERVER_URL}/dia/devoluciones/${tipo}`
        );
        if (Array.isArray(data)) {
          data.forEach((row) => acumulado.push({ ...row, tipo }));
        }
      }
      setDevoluciones(acumulado);
    } catch (err) {
      console.error("❌ Error al cargar devoluciones:", err);
    }
  }, [SERVER_URL]);

  const cargarDiasCerrados = useCallback(async () => {
    try {
      const data = await authFetch(`${SERVER_URL}/reportes/dias`);
      setDiasCerrados(data);
    } catch (err) {
      console.error("❌ Error al cargar días cerrados:", err);
    }
  }, [SERVER_URL]);

  const cargarFecha = useCallback(async () => {
    try {
      const data = await authFetch(`${SERVER_URL}/fecha-actual`);
      setFecha(data.fecha || "");
    } catch (err) {
      console.error("❌ Error al cargar fecha actual:", err);
    }
  }, [SERVER_URL]);

  const cargarProductosRef = useRef(null);
  const cargarInventarioRef = useRef(null);
  const cargarDevolucionesRef = useRef(null);
  const cargarDiasCerradosRef = useRef(null);

  useEffect(() => {
    cargarProductosRef.current = cargarProductos;
    cargarInventarioRef.current = cargarInventario;
    cargarDevolucionesRef.current = cargarDevoluciones;
    cargarDiasCerradosRef.current = cargarDiasCerrados;
  }, []);

  useEffect(() => {
    // Guardar referencias para usar en los listeners de socket
    const currentUser = user;
    const currentAuthFetch = authFetch;

    socket.on("productos_actualizados", (data) => {
      if (Array.isArray(data) && data.length > 0) {
        setProductos(data);
      } else {
        if (cargarProductosRef.current) cargarProductosRef.current();
      }
    });

    socket.on("picking_actualizado", () => {
      if (cargarProductosRef.current) cargarProductosRef.current();
    });

    socket.on("producto_actualizado", (p) => {
      setProductos((prev) => {
        const idx = prev.findIndex((x) => x.id === p.id);
        if (idx === -1) return [...prev, p];
        const copy = [...prev];
        copy[idx] = p;
        return copy;
      });
    });

    socket.on("producto_borrado", (id) =>
      setProductos((prev) => prev.filter((x) => x.id !== id))
    );

    // DESACTIVADO: Las actualizaciones automáticas causaban saltos de scroll
    // Los datos se actualizan localmente cuando el usuario hace cambios
    // let inventarioDebounceTimeout = null;
    // socket.on("inventario_actualizado", () => {
    //   if (inventarioDebounceTimeout) {
    //     clearTimeout(inventarioDebounceTimeout);
    //   }
    //   inventarioDebounceTimeout = setTimeout(() => {
    //     if (cargarInventarioRef.current) {
    //       cargarInventarioRef.current(0, true);
    //     }
    //     inventarioDebounceTimeout = null;
    //   }, 3000);
    // });

    socket.on("devoluciones_actualizadas", (arr) => {
      if (Array.isArray(arr)) setDevoluciones(arr);
      else if (cargarDevolucionesRef.current) cargarDevolucionesRef.current();
      window.dispatchEvent(new CustomEvent("devoluciones_actualizadas", { detail: arr }));
    });

    socket.on("pedido_eliminado", (data) => {
      window.dispatchEvent(new CustomEvent("pedido_eliminado", { detail: data }));
    });

    socket.on("producto_eliminado", (data) => {
      window.dispatchEvent(new CustomEvent("producto_eliminado", { detail: data }));
    });

    socket.on("devolucion_agregada", (d) => {
      setDevoluciones((prev) => [...prev, d]);
    });

    socket.on("devolucion_actualizada", (d) => {
      setDevoluciones((prev) => prev.map((x) => (x.id === d.id ? d : x)));
    });

    socket.on("devolucion_borrada", (id) => {
      setDevoluciones((prev) => prev.filter((x) => x.id !== id));
    });

    socket.on("reenvios_actualizados", () =>
      window.dispatchEvent(new Event("recargarReenvios"))
    );

    socket.on("reportes_actualizados", () => {
      if (cargarDiasCerradosRef.current) {
        cargarDiasCerradosRef.current();
      }
    });


    socket.on("fecha_actualizada", (nueva) => {
      setFecha(nueva || "");
    });

    // Escuchar cambios en el tema personal del usuario
    socket.on("tema_personal_actualizado", async (data) => {
      // Solo aplicar si es para el usuario actual
      if (data && data.userId && currentUser && currentUser.id && data.userId === currentUser.id) {
        console.log("🎨 Tema personal actualizado desde otro dispositivo:", data.tema);
        try {
          // Recargar el tema personal desde el servidor
          const SERVER_URL = getServerUrl();
          const temaData = await currentAuthFetch(`${SERVER_URL}/usuario/tema-personal`);
          
          if (temaData && temaData.tema) {
            // Aplicar el nuevo tema
            const { aplicarTema } = await import("./utils/temas");
            aplicarTema(temaData.tema);
            localStorage.setItem(`tema-personal-${currentUser.id}`, temaData.tema);
            localStorage.setItem("tema-actual", temaData.tema);
            console.log("✅ Tema personal aplicado automáticamente:", temaData.tema);
          } else {
            // Si se eliminó el tema personal, usar el tema global
            const dataGlobal = await currentAuthFetch(`${SERVER_URL}/admin/personalizacion`);
            const temaAAplicar = dataGlobal.tema || localStorage.getItem("tema-actual") || "azul";
            const { aplicarTema } = await import("./utils/temas");
            aplicarTema(temaAAplicar);
            localStorage.removeItem(`tema-personal-${currentUser.id}`);
            localStorage.setItem("tema-actual", temaAAplicar);
            console.log("✅ Tema personal eliminado, aplicando tema global:", temaAAplicar);
          }
        } catch (err) {
          console.error("Error recargando tema personal:", err);
        }
      }
    });

    // Escuchar cambios en el tema global (predeterminado) desde administrador
    socket.on("tema_global_actualizado", async (data) => {
      if (data && data.tema) {
        console.log("🎨 Tema global actualizado desde administrador:", data.tema);
        try {
          // Solo aplicar si el usuario NO tiene tema personal
          if (currentUser && currentUser.id) {
            const SERVER_URL = getServerUrl();
            const temaData = await currentAuthFetch(`${SERVER_URL}/usuario/tema-personal`);
            
            // Si el usuario no tiene tema personal, aplicar el tema global
            if (!temaData || !temaData.tema) {
              const { aplicarTema } = await import("./utils/temas");
              aplicarTema(data.tema);
              localStorage.setItem("tema-actual", data.tema);
              console.log("✅ Tema global aplicado automáticamente:", data.tema);
            } else {
              console.log("ℹ️ Usuario tiene tema personal, no se aplica tema global");
            }
          } else {
            // Si no hay usuario, aplicar directamente
            const { aplicarTema } = await import("./utils/temas");
            aplicarTema(data.tema);
            localStorage.setItem("tema-actual", data.tema);
            console.log("✅ Tema global aplicado automáticamente:", data.tema);
          }
        } catch (err) {
          console.error("Error aplicando tema global:", err);
        }
      }
    });

    return () => socket.removeAllListeners();
  }, [user, authFetch, perms, SERVER_URL]);

  const formatearFechaCompleta = (fechaString) => {
    if (!fechaString) {
      return ""; // No mostrar fecha si no está seleccionada
    }
    const fecha = new Date(fechaString + 'T00:00:00');
    const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
                   'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${diasSemana[fecha.getDay()]} ${fecha.getDate()} de ${meses[fecha.getMonth()]} del ${fecha.getFullYear()}`;
  };

  const formatearHora = (fecha) => {
    const horas = fecha.getHours().toString().padStart(2, '0');
    const minutos = fecha.getMinutes().toString().padStart(2, '0');
    const segundos = fecha.getSeconds().toString().padStart(2, '0');
    return `${horas}:${minutos}:${segundos}`;
  };

  const inputFechaRef = useRef(null);
  const [mostrarModalPassword, setMostrarModalPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [fechaPendiente, setFechaPendiente] = useState(null);
  const [cambiandoFecha, setCambiandoFecha] = useState(false);

  const solicitarPasswordYCambiarFecha = async (nuevaFecha) => {
    if (!perms || !perms.includes("tab:admin")) {
      await showAlert("Solo los administradores pueden cambiar la fecha cuando ya hay una activa", "warning", { title: "Acceso denegado" });
      return;
    }

    setFechaPendiente(nuevaFecha);
    setPasswordInput("");
    setMostrarModalPassword(true);
  };

  const confirmarCambioFecha = async () => {
    if (!passwordInput.trim()) {
      await showAlert("Debes ingresar tu contraseña de administrador", "warning", { title: "Contraseña requerida" });
      return;
    }

    if (!fechaPendiente) {
      setMostrarModalPassword(false);
      return;
    }

    try {
      setCambiandoFecha(true);

      const body = fechaPendiente === "" 
        ? { fecha: "", password: passwordInput.trim() }
        : { fecha: fechaPendiente, password: passwordInput.trim() };

      const data = await authFetch(`${SERVER_URL}/fecha-actual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      setFecha(data.fecha || fechaPendiente || "");
      if (fechaPendiente === "" || fechaPendiente === null) {
        pushToast("✅ Fecha eliminada correctamente");
      } else {
        pushToast("✅ Fecha establecida correctamente");
      }
      await cargarProductos();
      setMostrarModalPassword(false);
      setPasswordInput("");
      setFechaPendiente(null);
    } catch (err) {
      console.error("Error cambiando fecha:", err);
      const mensaje = err.message || err.error || "Error al cambiar la fecha";
      await showAlert(mensaje, "error", { title: "Error" });
    } finally {
      setCambiandoFecha(false);
    }
  };

  const handleFechaChange = async (e) => {
    const nueva = e.target.value;
    
    if (!fecha || fecha === "") {
      if (!nueva) {
        if (inputFechaRef.current) {
          inputFechaRef.current.value = "";
        }
          return;
        }

      try {
        setCambiandoFecha(true);
        const data = await authFetch(`${SERVER_URL}/fecha-actual`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fecha: nueva }),
        });

        setFecha(data.fecha || nueva);
        pushToast("✅ Fecha establecida correctamente");
        await cargarProductos();
      } catch (err) {
        console.error("Error estableciendo fecha:", err);
        const mensaje = err.message || err.error || "Error al establecer la fecha";
        await showAlert(mensaje, "error", { title: "Error" });
        if (inputFechaRef.current) {
          inputFechaRef.current.value = "";
        }
      } finally {
        setCambiandoFecha(false);
      }
      return;
    }

    if (!nueva) {
      const confirmado = await showAlert(
        "¿Estás seguro de que deseas eliminar la fecha?",
        "confirm",
        { 
          title: "Eliminar fecha",
          showCancel: true,
          confirmText: "Eliminar",
          cancelText: "Cancelar"
        }
      );
      
      if (!confirmado) {
        // Restaurar el valor anterior del input
        if (inputFechaRef.current) {
          inputFechaRef.current.value = fecha || "";
        }
        return;
      }

      await solicitarPasswordYCambiarFecha("");
      if (inputFechaRef.current) {
        inputFechaRef.current.value = fecha || "";
      }
      return;
    }

    if (fecha !== nueva) {
      await solicitarPasswordYCambiarFecha(nueva);
      if (inputFechaRef.current) {
        inputFechaRef.current.value = fecha || "";
      }
    }
  }, [fecha, SERVER_URL, authFetch, showAlert, pushToast, cargarProductos, solicitarPasswordYCambiarFecha]);

  const diasPorMes = useMemo(() => {
    const map = {};
    for (const d of diasCerrados || []) {
      const fecha = d.fecha || d;
      const mes = fecha.slice(0, 7);
      if (!map[mes]) map[mes] = [];
      map[mes].push(d);
    }
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""))
    );
    return map;
  }, [diasCerrados]);

  const verDetalleDia = async (f) => {
    try {
      const data = await authFetch(`${SERVER_URL}/reportes/dia/${f}`);
      setDetalleDia(data);
      cambiarModulo("reportes");
    } catch (err) {
      console.error("❌ Error al cargar detalle día:", err);
      pushToast("❌ Error al cargar detalle del día", "err");
    }
  };



  const getPhotoUrl = () => {
    if (user?.photo) {
      // 🔥 Agregar timestamp para evitar caché del navegador cuando la foto se actualiza
      const cacheKey = user?.photoTimestamp || Date.now();
      return `${SERVER_URL}/uploads/perfiles/${user.photo}?t=${cacheKey}`;
    }
    return null;
  };

  const logoUrlRef = useRef(null);
  const logoCacheRef = useRef(null);
  
  const getLogoUrl = () => {
    if (personalizacion.logo) {
      const logoTipo = personalizacion.logoTipo || "imagen";
      const logoExt = logoTipo === "gif" ? "gif" : logoTipo === "svg" ? "svg" : logoTipo === "jpg" ? "jpg" : "png";
      const baseUrl = `${SERVER_URL}/uploads/personalizacion/logos/logo.${logoExt}`;
      
      if (logoCacheRef.current && logoCacheRef.current === baseUrl) {
        return logoCacheRef.current;
      }
      
      const url = `${baseUrl}?t=${Date.now()}`;
      logoCacheRef.current = baseUrl;
      logoUrlRef.current = url;
      
      const img = new Image();
      img.src = url;
      
      return url;
    }
    return `${SERVER_URL}/uploads/personalizacion/logos/logo.png?t=${Date.now()}`;
  };

  const tieneFondo =
    personalizacion.fondo === true ||
    personalizacion.fondo === "true" ||
    personalizacion.fondo === 1 ||
    personalizacion.fondo === "1" ||
    !!personalizacion.fondoTipo;

  const colorFondo = personalizacion.colorFondoPrincipal || "#15192e";

  const [fondoResuelto, setFondoResuelto] = useState({ url: null, tipo: null });
  const fondoCacheRef = useRef({ url: null, tipo: null, key: null });

  useEffect(() => {
    if (tieneFondo) {
      document.body.classList.add("tiene-fondo-personalizado");
    } else {
      document.body.classList.remove("tiene-fondo-personalizado");
    }
  }, [tieneFondo]);

  useEffect(() => {
    let cancelado = false;
    let timeoutId = null;
    let isResolving = false;
    
    const resolver = async () => {
      if (isResolving) return;
      
      if (timeoutId) clearTimeout(timeoutId);
      
      // Aumentar delay para evitar parpadeos frecuentes
      timeoutId = setTimeout(async () => {
        if (isResolving || cancelado) return;
        isResolving = true;
        
        try {
          if (!tieneFondo) {
            if (!cancelado && fondoResuelto.url !== null) {
              setFondoResuelto({ url: null, tipo: null });
              fondoCacheRef.current = { url: null, tipo: null, key: null, lastCheck: null };
            }
            isResolving = false;
            return;
          }
          
          const cacheKey = `${SERVER_URL}-${personalizacion.fondoTipo || "imagen"}-${personalizacion.fondo}`;
          const ahora = Date.now();
          const tiempoCache = 60 * 60 * 1000; // Aumentar cache a 1 hora para mejor rendimiento
          
          if (fondoCacheRef.current.key === cacheKey && 
              fondoCacheRef.current.url && 
              fondoCacheRef.current.lastCheck && 
              (ahora - fondoCacheRef.current.lastCheck) < tiempoCache) {
            // Solo actualizar si es diferente
            if (fondoResuelto.url !== fondoCacheRef.current.url && !cancelado) {
              setFondoResuelto({ url: fondoCacheRef.current.url, tipo: fondoCacheRef.current.tipo });
            }
            isResolving = false;
            return;
          }
          
          const tipoBase = personalizacion.fondoTipo || "imagen";
          const base = `${SERVER_URL}/uploads/personalizacion/`;
          let nombre = "";
          if (tipoBase === "video") {
            nombre = "fondos/fondo.mp4";
          } else if (tipoBase === "gif") {
            nombre = "fondos/fondo.gif";
          } else {
            nombre = "fondos/fondo.png";
          }

          if (nombre && !cancelado) {
            const url = `${base}${nombre}`;
            
            try {
              // Optimización: usar cache más agresivo y timeout más corto
              const resp = await fetch(url, { 
                method: "HEAD", 
                cache: "force-cache",
                signal: AbortSignal.timeout(1000) // Reducir timeout a 1 segundo
              });
              
              if (cancelado) return;
              
              if (resp.ok && resp.status !== 404) {
                const tipoFinal = nombre.endsWith(".mp4")
                  ? "video"
                  : nombre.endsWith(".gif")
                  ? "gif"
                  : "imagen";
                
                const resultado = { url, tipo: tipoFinal };
                if (!cancelado) {
                  setFondoResuelto(resultado);
                }
                fondoCacheRef.current = { 
                  ...resultado, 
                  key: cacheKey, 
                  lastCheck: ahora
                };
                isResolving = false;
                return;
              }
              
            } catch (err) {
              // Usar cache si existe, sin bloquear
              if (fondoCacheRef.current.url && !cancelado) {
                setFondoResuelto({ url: fondoCacheRef.current.url, tipo: fondoCacheRef.current.tipo });
              }
            }
          }
          
          if (!cancelado) {
            setFondoResuelto({ url: null, tipo: null });
            fondoCacheRef.current = { url: null, tipo: null, key: cacheKey, lastCheck: ahora };
          }
        } finally {
          isResolving = false;
        }
      }, 2000); // Aumentar delay a 2 segundos para evitar parpadeos y mejorar rendimiento
    };
    
    resolver();
    
    return () => {
      cancelado = true;
      isResolving = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [tieneFondo, personalizacion.fondoTipo, personalizacion.fondo, SERVER_URL]);

  useEffect(() => {
    const handler = (e) => {
      const { fondoTransparencia } = e.detail || {};
      if (fondoTransparencia !== undefined) {
        // Actualizar directamente sin requestAnimationFrame para mejor rendimiento
        setPersonalizacion((prev) => {
          if (prev.fondoTransparencia === fondoTransparencia) return prev; // Evitar re-render si no cambió
          return {
            ...prev,
            fondoTransparencia,
          };
        });
      }
    };
    window.addEventListener("personalizacion_preview", handler);
    return () => window.removeEventListener("personalizacion_preview", handler);
  }, []);

  return (
    <>
      {tieneFondo && fondoResuelto.url && (() => {
        const opacity = personalizacion.fondoTransparencia ?? 0.3;
        return (
          <div className="app-fondo-personalizado">
            {fondoResuelto.tipo === "video" ? (
              (() => {
                const src = fondoResuelto.url || "";
                return (
              <video
                key={`${fondoResuelto.url}`}
                autoPlay
                loop
                muted
                playsInline
                preload="metadata" // Cambiar de "auto" a "metadata" para carga más rápida
                onLoadedData={(e) => {
                  // Forzar play cuando esté listo
                  try {
                    e.target.play().catch(() => {});
                  } catch (_) {}
                }}
                onEnded={(e) => {
                  try {
                    e.target.currentTime = 0;
                    e.target.play();
                  } catch (_) {}
                }}
                onPause={(e) => {
                  try {
                    e.target.play();
                  } catch (_) {}
                }}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  zIndex: -1,
                  opacity: opacity,
                }}
              >
                <source src={src} type="video/mp4" />
              </video>
                );
              })()
            ) : (
              <img
                key={`${fondoResuelto.url}`}
                src={
                  fondoResuelto.url || ""
                }
                alt=""
                loading="lazy" // Carga diferida para mejor rendimiento
                decoding="async" // Decodificación asíncrona
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  zIndex: -1,
                  opacity: opacity,
                }}
              />
            )}
          </div>
        );
      })()}
      <div 
        className={`app ${tieneFondo ? 'con-fondo-personalizado' : ''}`}
        style={{
          background: tieneFondo 
            ? "transparent" 
            : colorFondo
        }}
      >

      {personalizacion.mensajeBienvenida && (
        <div 
          className="mensaje-bienvenida"
          id="mensaje-bienvenida-editable"
          style={{
            width: typeof personalizacion.mensajeBienvenidaAncho === 'number' 
              ? `${personalizacion.mensajeBienvenidaAncho}px` 
              : personalizacion.mensajeBienvenidaAncho || "500px",
            height: personalizacion.mensajeBienvenidaAlto === "auto" 
              ? "auto" 
              : typeof personalizacion.mensajeBienvenidaAlto === 'number'
              ? `${personalizacion.mensajeBienvenidaAlto}px`
              : personalizacion.mensajeBienvenidaAlto || "auto",
            transform: `translate(${personalizacion.mensajeBienvenidaPosX || 0}px, ${personalizacion.mensajeBienvenidaPosY || 0}px)`,
            fontSize: `${personalizacion.mensajeBienvenidaTamañoFuente || 0.7}rem`,
            textAlign: personalizacion.mensajeBienvenidaAlineacionTexto || "center",
            display: 'flex',
            alignItems: personalizacion.mensajeBienvenidaAlineacionVertical || "center",
            justifyContent: personalizacion.mensajeBienvenidaAlineacionTexto === "left" ? "flex-start" : 
                          personalizacion.mensajeBienvenidaAlineacionTexto === "right" ? "flex-end" : "center",
            '--mensaje-pos-y': `${personalizacion.mensajeBienvenidaPosY || 0}px`,
            '--mensaje-font-size': `${personalizacion.mensajeBienvenidaTamañoFuente || 0.7}rem`,
          }}
        >
          {personalizacion.mensajeBienvenida}
        </div>
      )}

      {activeTab !== "tienda" && can("tab:escaneo") && (
        <header className={`header-flex ${activeTab === "escaneo" ? "mostrar-fecha-movil" : "ocultar-fecha-movil"}`}>
          <div className="fecha-reporte">
            <input
              ref={inputFechaRef}
              type="date"
              value={fecha || ""}
              onChange={handleFechaChange}
              disabled={false}
              className="fecha-input-hidden"
            />
            <div className="fecha-display" onClick={() => inputFechaRef.current?.showPicker?.()}>
              {fecha ? (
                <>
                  <div className="fecha-texto">
                    <span className="fecha-calendario">📅</span>
                    <span className="fecha-completa">{fechaCompletaFormateada}</span>
                  </div>
                  <div className="fecha-hora">
                    <span className="hora-reloj">🕐</span>
                    <span className="hora-texto">{horaFormateada}</span>
                  </div>
                </>
              ) : (
                <div className="fecha-texto">
                  <span className="fecha-calendario">📅</span>
                  <span className="fecha-completa" style={{ opacity: 0.6, fontStyle: 'italic' }}>
                    Haz clic para seleccionar fecha
                  </span>
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      {activeTab === "escaneo" && can("tab:escaneo") && (
        <Picking
          SERVER_URL={SERVER_URL}
          fecha={fecha}
          cargarProductos={cargarProductos}
          pushToast={pushToast}
          cambiarModulo={cambiarModulo}
        />
      )}

      {activeTab === "escaneo_retail" && can("tab:escaneo") && (
        <Picking
          SERVER_URL={SERVER_URL}
          fecha={fecha}
          cargarProductos={cargarProductos}
          pushToast={pushToast}
          cambiarModulo={cambiarModulo}
          canal="retail"
          titulo="Picking Retail"
          mostrarBusquedaNombre
          moduloRegistros="registros_retail"
        />
      )}

      {activeTab === "escaneo_fulfillment" && can("tab:escaneo") && (
        <Picking
          SERVER_URL={SERVER_URL}
          fecha={fecha}
          cargarProductos={cargarProductos}
          pushToast={pushToast}
          cambiarModulo={cambiarModulo}
          canal="fulfillment"
          titulo="Picking Fulfillment"
          mostrarBusquedaNombre
          moduloRegistros="registros_fulfillment"
        />
      )}

      {activeTab === "registros" && can("tab:registros") && (
        <RegistrosPicking
          SERVER_URL={SERVER_URL}
          productos={productos}
          setProductos={setProductos}
          cargarProductos={cargarProductos}
          pushToast={pushToast}
          inventario={inventario}
          cambiarModulo={cambiarModulo}
        />
      )}

      {activeTab === "registros_retail" && can("tab:registros") && (
        <RegistrosPicking
          SERVER_URL={SERVER_URL}
          productos={productos}
          setProductos={setProductos}
          cargarProductos={cargarProductos}
          pushToast={pushToast}
          inventario={inventario}
          cambiarModulo={cambiarModulo}
          canal="retail"
          moduloPicking="escaneo_retail"
        />
      )}

      {activeTab === "registros_fulfillment" && can("tab:registros") && (
        <RegistrosPicking
          SERVER_URL={SERVER_URL}
          productos={productos}
          setProductos={setProductos}
          cargarProductos={cargarProductos}
          pushToast={pushToast}
          inventario={inventario}
          cambiarModulo={cambiarModulo}
          canal="fulfillment"
          moduloPicking="escaneo_fulfillment"
        />
      )}

      {activeTab === "reportes" && can("tab:reportes") && (
        <ReportesPicking
          diasPorMes={diasPorMes}
          verDetalleDia={verDetalleDia}
          SERVER_URL={SERVER_URL}
          detalleDia={detalleDia}
        />
      )}

      {activeTab === "auditoria" && can("tab:auditoria") && (
        <Auditoria SERVER_URL={SERVER_URL} />
      )}

      {activeTab === "inventario" && can("tab:inventario") && (
        <Inventario
          SERVER_URL={SERVER_URL}
          CATEGORIAS={CATEGORIAS}
          pushToast={pushToast}
          cargarInventario={cargarInventario}
          obtenerLotes={async (codigo) => {
            if (!codigo) return [];
            if (lotesCache[codigo]) return lotesCache[codigo];
            try {
              const data = await authFetch(`${SERVER_URL}/lotes/${codigo}`);
              setLotesCache((prev) => ({ ...prev, [codigo]: data || [] }));
              return data || [];
            } catch {
              return [];
            }
          }}
          lotesCache={lotesCache}
          setLotesCache={setLotesCache}
          inventario={inventario}
          setInventario={setInventario}
        />
      )}

      {activeTab === "devoluciones" && can("tab:devoluciones") && (
        <Devoluciones
          serverUrl={SERVER_URL}
          fecha={fecha}
          devoluciones={devoluciones}
          setDevoluciones={setDevoluciones}
          pushToast={pushToast}
          socket={socket}
        />
      )}

      {activeTab === "reenvios" && can("tab:reenvios") && (
        <Reenvios serverUrl={SERVER_URL} pushToast={pushToast} fecha={fecha} />
      )}

      {activeTab === "rep_devol" && can("tab:rep_devol") && (
        <ReportesDevoluciones serverUrl={SERVER_URL} pushToast={pushToast} />
      )}

      {activeTab === "rep_reenvios" && can("tab:rep_reenvios") && (
        <ReportesReenvios serverUrl={SERVER_URL} pushToast={pushToast} />
      )}

      {activeTab === "admin" && can("tab:admin") && (
        <Administrador serverUrl={SERVER_URL} pushToast={pushToast} />
      )}

      {activeTab === "ixora_ia" && can("tab:ixora_ia") && (
        <IxoraIA serverUrl={SERVER_URL} pushToast={pushToast} />
      )}


      {activeTab === "tienda" && (
        <Tienda />
      )}

      {activeTab === "activos" && can("tab:activos") && (
        <ActivosInformaticos serverUrl={SERVER_URL} />
      )}

      {activeTab === "activaciones" && can("tab:activaciones") && (
        <Activaciones SERVER_URL={SERVER_URL} />
      )}

      {activeTab === "rep_activaciones" && can("tab:rep_activaciones") && (
        <ReportesActivaciones SERVER_URL={SERVER_URL} />
      )}

      {activeTab !== "tienda" && (
        <>
          <button className="menu-trigger" onClick={() => setMenuOpen(true)}>
            ⋮
          </button>
        </>
      )}

      {menuOpen && (
        <div className="menu-overlay" onClick={() => setMenuOpen(false)}></div>
      )}

      {menuOpen && (
        <div className="menu-panel">
          <button
            className="menu-trigger-inside"
            onClick={() => setMenuOpen(false)}
          >
            ×
          </button>

          {/* LOGO Y PERFIL EN LA ESQUINA SUPERIOR IZQUIERDA */}
          <div className="menu-logo-section">
            <div className="menu-logo-wrapper">
              <img 
                src={getLogoUrl()} 
                alt="Logo" 
                className="menu-logo"
                loading="eager"
                decoding="async"
                onClick={() => setLogoViewerOpen(true)}
                style={{ cursor: "pointer" }}
              />
            </div>
            <div className="menu-user-profile-top">
              <div className="menu-user-profile-content" onClick={abrirEditarPerfil}>
                <div className="menu-user-avatar">
                  {user?.photo ? (
                    <img
                      src={getPhotoUrl()}
                      alt="Perfil"
                      className="menu-user-img"
                    />
                  ) : (
                    <span className="menu-user-initial">
                      {user?.nickname?.[0]?.toUpperCase() || user?.nombre?.[0]?.toUpperCase() || "U"}
                    </span>
                  )}
                </div>
                <div className="menu-user-name-top">
                  {user?.nickname || user?.nombre || "Usuario"}
                </div>
                <button
                  className="menu-refresh-perms-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    refrescarPermisos();
                  }}
                  title="Actualizar permisos"
                >
                  🔄
                </button>
              </div>
            </div>
          </div>

          <div className="menu-separator"></div>


          {can("tab:escaneo") && debeMostrarPestaña("tab:escaneo") && (
            <>
              <div 
                className="menu-category menu-category-clickable"
                onClick={() => setCategoriasColapsadas({...categoriasColapsadas, operaciones: !categoriasColapsadas.operaciones})}
              >
                <span>OPERACIONES</span>
                <span className="menu-category-arrow">{categoriasColapsadas.operaciones ? "▼" : "▶"}</span>
              </div>
              {!categoriasColapsadas.operaciones && (
                <>
                  {can("tab:escaneo") && debeMostrarPestaña("tab:escaneo") && (
                    <a
                      className={`menu-item ${
                        activeTab === "escaneo" ? "active" : ""
                      }`}
                      href="#escaneo"
                      onClick={(e) => {
                        e.preventDefault();
                        cambiarModulo("escaneo");
                        setMenuOpen(false);
                      }}
                    >
                      <span className="menu-icon">🔎</span>
                      Picking
                    </a>
                  )}
                  {can("tab:escaneo") && debeMostrarPestaña("tab:escaneo") && (
                    <a
                      className={`menu-item ${
                        activeTab === "escaneo_retail" ? "active" : ""
                      }`}
                      href="#escaneo_retail"
                      onClick={(e) => {
                        e.preventDefault();
                        cambiarModulo("escaneo_retail");
                        setMenuOpen(false);
                      }}
                    >
                      <span className="menu-icon">🛍️</span>
                      Picking Retail
                    </a>
                  )}
                  {can("tab:escaneo") && debeMostrarPestaña("tab:escaneo") && (
                    <a
                      className={`menu-item ${
                        activeTab === "escaneo_fulfillment" ? "active" : ""
                      }`}
                      href="#escaneo_fulfillment"
                      onClick={(e) => {
                        e.preventDefault();
                        cambiarModulo("escaneo_fulfillment");
                        setMenuOpen(false);
                      }}
                    >
                      <span className="menu-icon">📦</span>
                      Picking Fulfillment
                    </a>
                  )}
                </>
              )}
              </>
          )}

          {can("tab:escaneo") && debeMostrarPestaña("tab:escaneo") && <div className="menu-separator"></div>}

          {((can("tab:devoluciones") && debeMostrarPestaña("tab:devoluciones")) || (can("tab:reenvios") && debeMostrarPestaña("tab:reenvios"))) && (
            <>
              <div 
                className="menu-category menu-category-clickable"
                onClick={() => setCategoriasColapsadas({...categoriasColapsadas, gestion: !categoriasColapsadas.gestion})}
              >
                <span>GESTIÓN</span>
                <span className="menu-category-arrow">{categoriasColapsadas.gestion ? "▼" : "▶"}</span>
              </div>
              {!categoriasColapsadas.gestion && (
                <>
                  {can("tab:devoluciones") && debeMostrarPestaña("tab:devoluciones") && (
                    <a
                      className={`menu-item ${
                        activeTab === "devoluciones" ? "active" : ""
                      }`}
                      href="#devoluciones"
                      onClick={(e) => {
                        e.preventDefault();
                        cambiarModulo("devoluciones");
                        setMenuOpen(false);
                      }}
                    >
                      <span className="menu-icon">🚚</span>
                      Devoluciones
                    </a>
                  )}

                  {can("tab:reenvios") && debeMostrarPestaña("tab:reenvios") && (
                    <a
                      className={`menu-item ${
                        activeTab === "reenvios" ? "active" : ""
                      }`}
                      href="#reenvios"
                      onClick={(e) => {
                        e.preventDefault();
                        cambiarModulo("reenvios");
                        setMenuOpen(false);
                      }}
                    >
                      <span className="menu-icon">📨</span>
                      Reenvíos
                    </a>
                  )}
                </>
              )}
              </>
          )}

          {((can("tab:devoluciones") && debeMostrarPestaña("tab:devoluciones")) || (can("tab:reenvios") && debeMostrarPestaña("tab:reenvios"))) && <div className="menu-separator"></div>}

          {((can("tab:reportes") && debeMostrarPestaña("tab:reportes")) || (can("tab:rep_devol") && debeMostrarPestaña("tab:rep_devol")) || (can("tab:rep_reenvios") && debeMostrarPestaña("tab:rep_reenvios")) || (can("tab:rep_activaciones") && debeMostrarPestaña("tab:rep_activaciones"))) && (
            <>
              <div 
                className="menu-category menu-category-clickable"
                onClick={() => setCategoriasColapsadas({...categoriasColapsadas, reportes: !categoriasColapsadas.reportes})}
              >
                <span>REPORTES</span>
                <span className="menu-category-arrow">{categoriasColapsadas.reportes ? "▼" : "▶"}</span>
              </div>
              {!categoriasColapsadas.reportes && (
                <>
                  {can("tab:reportes") && debeMostrarPestaña("tab:reportes") && (
                    <a
                      className={`menu-item ${
                        activeTab === "reportes" ? "active" : ""
                      }`}
                      href="#reportes"
                      onClick={(e) => {
                        e.preventDefault();
                        cambiarModulo("reportes");
                        setMenuOpen(false);
                      }}
                    >
                      <span className="menu-icon">📝</span>
                      Reportes Picking
                    </a>
                  )}

                  {can("tab:rep_devol") && debeMostrarPestaña("tab:rep_devol") && (
                    <a
                      className={`menu-item ${
                        activeTab === "rep_devol" ? "active" : ""
                      }`}
                      href="#rep_devol"
                      onClick={(e) => {
                        e.preventDefault();
                        cambiarModulo("rep_devol");
                        setMenuOpen(false);
                      }}
                    >
                      <span className="menu-icon">📝</span>
                      Reportes de Devoluciones
                    </a>
                  )}

                  {can("tab:rep_reenvios") && debeMostrarPestaña("tab:rep_reenvios") && (
                    <a
                      className={`menu-item ${
                        activeTab === "rep_reenvios" ? "active" : ""
                      }`}
                      href="#rep_reenvios"
                      onClick={(e) => {
                        e.preventDefault();
                        cambiarModulo("rep_reenvios");
                        setMenuOpen(false);
                      }}
                    >
                      <span className="menu-icon">📝</span>
                      Reportes de Reenvíos
                    </a>
                  )}

                  {can("tab:rep_activaciones") && debeMostrarPestaña("tab:rep_activaciones") && (
                    <a
                      className={`menu-item ${
                        activeTab === "rep_activaciones" ? "active" : ""
                      }`}
                      href="#rep_activaciones"
                      onClick={(e) => {
                        e.preventDefault();
                        cambiarModulo("rep_activaciones");
                        setMenuOpen(false);
                      }}
                    >
                      <span className="menu-icon">📝</span>
                      Reportes de Activaciones
                    </a>
                  )}
                </>
              )}
              </>
          )}

          {((can("tab:reportes") && debeMostrarPestaña("tab:reportes")) || (can("tab:rep_devol") && debeMostrarPestaña("tab:rep_devol")) || (can("tab:rep_reenvios") && debeMostrarPestaña("tab:rep_reenvios")) || (can("tab:rep_activaciones") && debeMostrarPestaña("tab:rep_activaciones"))) && <div className="menu-separator"></div>}

          {((can("tab:inventario") && debeMostrarPestaña("tab:inventario")) || (can("tab:activaciones") && debeMostrarPestaña("tab:activaciones")) || (can("tab:activos") && debeMostrarPestaña("tab:activos"))) && (
            <>
              <div 
                className="menu-category menu-category-clickable"
                onClick={() => setCategoriasColapsadas({...categoriasColapsadas, inventario: !categoriasColapsadas.inventario})}
              >
                <span>INVENTARIO</span>
                <span className="menu-category-arrow">{categoriasColapsadas.inventario ? "▼" : "▶"}</span>
              </div>
              {!categoriasColapsadas.inventario && (
                <>
                  {can("tab:inventario") && debeMostrarPestaña("tab:inventario") && (
                    <a
                      className={`menu-item ${
                        activeTab === "inventario" ? "active" : ""
                      }`}
                      href="#inventario"
                      onClick={(e) => {
                        e.preventDefault();
                        cambiarModulo("inventario");
                        setMenuOpen(false);
                      }}
                    >
                      <span className="menu-icon">📋</span>
                      Inventario
                    </a>
                  )}
                  {can("tab:activaciones") && debeMostrarPestaña("tab:activaciones") && (
                    <a
                      className={`menu-item ${
                        activeTab === "activaciones" ? "active" : ""
                      }`}
                      href="#activaciones"
                      onClick={(e) => {
                        e.preventDefault();
                        cambiarModulo("activaciones");
                        setMenuOpen(false);
                      }}
                    >
                      <span className="menu-icon">⚡</span>
                      Activaciones
                    </a>
                  )}
                  {can("tab:auditoria") && debeMostrarPestaña("tab:auditoria") && (
                    <a
                      className={`menu-item ${
                        activeTab === "auditoria" ? "active" : ""
                      }`}
                      href="#auditoria"
                      onClick={(e) => {
                        e.preventDefault();
                        cambiarModulo("auditoria");
                        setMenuOpen(false);
                      }}
                    >
                      <span className="menu-icon">🔍</span>
                      Auditoría
                    </a>
                  )}
                  {can("tab:activos") && debeMostrarPestaña("tab:activos") && (
                    <a
                      className={`menu-item ${activeTab === "activos" ? "active" : ""}`}
                      href="#activos"
                      onClick={(e) => {
                        e.preventDefault();
                        cambiarModulo("activos");
                        setMenuOpen(false);
                      }}
                    >
                      <span className="menu-icon">💻</span>
                      Activos Informáticos
                    </a>
                  )}
                </>
              )}
              <div className="menu-separator"></div>
            </>
          )}



          {can("tab:tienda") && debeMostrarPestaña("tab:tienda") && (
            <>
              <div 
                className="menu-category menu-category-clickable"
                onClick={() => setCategoriasColapsadas({...categoriasColapsadas, negocios: !categoriasColapsadas.negocios})}
              >
                <span>NEGOCIOS</span>
                <span className="menu-category-arrow">{categoriasColapsadas.negocios ? "▼" : "▶"}</span>
              </div>
              {!categoriasColapsadas.negocios && (
                <>
                  {can("tab:tienda") && debeMostrarPestaña("tab:tienda") && (
                    <a
                      className={`menu-item ${activeTab === "tienda" ? "active" : ""}`}
                      href="#tienda"
                      onClick={(e) => {
                        e.preventDefault();
                        cambiarModulo("tienda");
                        setMenuOpen(false);
                      }}
                    >
                      <span className="menu-icon">🛍️</span>
                      Tienda
                    </a>
                  )}
                </>
              )}
              <div className="menu-separator"></div>
            </>
          )}

          {((can("tab:admin") && debeMostrarPestaña("tab:admin")) || (can("tab:ixora_ia") && debeMostrarPestaña("tab:ixora_ia"))) && (
            <>
              <div 
                className="menu-category menu-category-clickable"
                onClick={() => setCategoriasColapsadas({...categoriasColapsadas, administracion: !categoriasColapsadas.administracion})}
              >
                <span>ADMINISTRACIÓN</span>
                <span className="menu-category-arrow">{categoriasColapsadas.administracion ? "▼" : "▶"}</span>
              </div>
              {!categoriasColapsadas.administracion && (
                <>
                  {can("tab:ixora_ia") && debeMostrarPestaña("tab:ixora_ia") && (
                    <a
                      className={`menu-item ${
                        activeTab === "ixora_ia" ? "active" : ""
                      }`}
                      href="#ixora_ia"
                      onClick={(e) => {
                        e.preventDefault();
                        cambiarModulo("ixora_ia");
                        setMenuOpen(false);
                      }}
                    >
                      <span className="menu-icon">✨</span>
                      IXORA IA
                    </a>
                  )}

                  {can("tab:admin") && debeMostrarPestaña("tab:admin") && (
                    <a
                      className={`menu-item ${
                        activeTab === "admin" ? "active" : ""
                      }`}
                      href="#admin"
                      onClick={(e) => {
                        e.preventDefault();
                        cambiarModulo("admin");
                        setMenuOpen(false);
                      }}
                    >
                      <span className="menu-icon">👑</span>
                      Administrador
                    </a>
                  )}
                </>
              )}
              <div className="menu-separator"></div>
            </>
          )}

          <div className="menu-logout-container">
            <button
              className="menu-logout"
              onClick={logout}
              title="Cerrar Sesión"
            >
              🚶
            </button>
          </div>
        </div>
      )}

      {/* Modal para visualizar el logo */}
      {logoViewerOpen && (
        <div 
          className="logo-viewer-overlay"
          onClick={() => setLogoViewerOpen(false)}
        >
          <div 
            className="logo-viewer-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="logo-viewer-close"
              onClick={() => setLogoViewerOpen(false)}
            >
              ×
            </button>
            <img 
              src={getLogoUrl()} 
              alt="Logo" 
              className="logo-viewer-image"
            />
          </div>
        </div>
      )}

      <div
        style={{
          position: "fixed",
          right: 16,
          bottom: 90, // Mover más arriba para no chocar con el chat (56px altura + 14px bottom + 20px espacio)
          display: "flex",
          flexDirection: "column",
          gap: 8,
          zIndex: 4001, // Por encima del chat (z-index 5000) pero debajo de modales
          maxWidth: "calc(100vw - 100px)", // Asegurar que no se salga de la pantalla
        }}
      >
        {toasts.map((t) => {
          const isError = t.type === "err" || t.type === "error";
          const isWarning = t.type === "warn" || t.type === "warning";
          const isSuccess = t.type === "ok" || t.type === "success";
          const isInfo = t.type === "info";
          
          // Colores con mejor contraste para todos los temas
          const errorBg = isError ? "#ff4444" : null;
          const errorText = isError ? "#ffffff" : null;
          const errorBorder = isError ? "#cc0000" : null;
          
          const warningBg = isWarning ? "#ffaa00" : null;
          const warningText = isWarning ? "#000000" : null;
          const warningBorder = isWarning ? "#ff8800" : null;
          
          const successBg = isSuccess ? "#22c55e" : null;
          const successText = isSuccess ? "#ffffff" : null;
          const successBorder = isSuccess ? "#16a34a" : null;
          
          const infoBg = isInfo ? "#3b82f6" : null;
          const infoText = isInfo ? "#ffffff" : null;
          const infoBorder = isInfo ? "#2563eb" : null;
          
          return (
            <div
              key={t.id}
              className="toast"
              style={{
                background: errorBg || warningBg || successBg || infoBg || "var(--fondo-card, #ffffff)",
                color: errorText || warningText || successText || infoText || "var(--texto-principal, #000000)",
                border: `2px solid ${errorBorder || warningBorder || successBorder || infoBorder || "var(--borde-sutil, #e0e0e0)"}`,
                padding: "14px 18px",
                borderRadius: "var(--radio-xl, 12px)",
                boxShadow: "var(--sombra-xl, 0 8px 24px rgba(0,0,0,0.3))",
                minWidth: "280px",
                maxWidth: "min(500px, calc(100vw - 100px))", // No más ancho que la pantalla menos espacio
                width: "auto", // Ajustar al contenido pero respetar maxWidth
                wordWrap: "break-word",
                wordBreak: "break-word",
                whiteSpace: "normal",
                overflowWrap: "break-word",
                overflow: "visible",
                textOverflow: "clip", // No truncar con ellipsis
                fontSize: "0.95rem",
                lineHeight: "1.5",
                fontWeight: isError ? "700" : isWarning ? "600" : "500",
                zIndex: 10001,
                position: "relative",
              }}
            >
              {t.text}
            </div>
          );
        })}
      </div>

      {mostrarModalPassword && (
        <div 
          className="alert-modal-overlay" 
          onClick={() => {
            setMostrarModalPassword(false);
            setPasswordInput("");
            setFechaPendiente(null);
          }}
        >
          <div className="alert-modal" onClick={(e) => e.stopPropagation()}>
            <div className="alert-modal-header">
              <h3>Confirmar cambio de fecha</h3>
            </div>
            <div className="alert-modal-body">
              <div className="alert-modal-icon alert-modal-icon-warning">
                🔒
              </div>
              <p className="alert-modal-message">
                {fechaPendiente && fechaPendiente !== ""
                  ? `Se requiere contraseña de administrador para cambiar la fecha a: ${fechaPendiente ? formatearFechaCompleta(fechaPendiente) : ''}`
                  : fecha
                    ? `Se requiere contraseña de administrador para eliminar la fecha actual: ${formatearFechaCompleta(fecha)}`
                    : "Se requiere contraseña de administrador para establecer una nueva fecha"}
              </p>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Contraseña de administrador"
                style={{
                  width: "100%",
                  padding: "12px",
                  marginTop: "12px",
                  border: "1px solid var(--borde-medio)",
                  borderRadius: "var(--radio-full)",
                  background: "var(--fondo-input)",
                  color: "var(--texto-principal)",
                  fontSize: "1rem",
                  outline: "none",
                }}
                onKeyPress={(e) => {
                  if (e.key === "Enter" && !cambiandoFecha) {
                    confirmarCambioFecha();
                  }
                }}
                autoFocus
              />
            </div>
            <div className="alert-modal-actions">
              <button
                className="alert-modal-btn alert-modal-btn-cancel"
                onClick={() => {
                  setMostrarModalPassword(false);
                  setPasswordInput("");
                  setFechaPendiente(null);
                }}
                disabled={cambiandoFecha}
              >
                Cancelar
              </button>
              <button
                className="alert-modal-btn alert-modal-btn-confirm"
                onClick={confirmarCambioFecha}
                disabled={cambiandoFecha || !passwordInput.trim()}
              >
                {cambiandoFecha ? "Cambiando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab !== "tienda" && (
        <>
          {/* Chat y widgets ahora están en el menú inferior */}
          <WidgetsMenu 
            serverUrl={SERVER_URL} 
            pushToast={pushToast} 
            socket={socket}
            user={user}
          />
        </>
      )}
    </div>
    </>
  );
}

export default function Wrapper() {
  return (
      <AlertModalProvider>
      <AuthProvider>
        <NotificationProvider>
          <AppProtegida />
        </NotificationProvider>
    </AuthProvider>
    </AlertModalProvider>
  );
}
