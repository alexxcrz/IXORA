import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../../AuthContext";
import { temas, aplicarTema, obtenerTemaActual } from "../../utils/temas";
import "./Personalizacion.css";

// Función helper para recargar (siempre recarga en web)
const recargarSeguro = () => {
  window.location.reload();
};

export default function Personalizacion({ serverUrl, pushToast }) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState({
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
    fondoTipo: "imagen", // imagen, gif, video
    colorPrimario: "#3b82f6",
    colorSecundario: "#1e40af",
    colorFondoPrincipal: "#15192e",
    nombreApp: "IXORA",
    nombre_tienda: "Nuestra Tienda",
    tienda_fondo: null,
    tienda_fondo_tipo: "imagen",
    tienda_color_primario: "#3b82f6",
    tienda_color_secundario: "#1e40af",
    tienda_color_fondo: "#f8f9fa",
    tienda_descripcion: "",
    tienda_telefono: "",
    tienda_email: "",
    tienda_direccion: "",
    tienda_redes_sociales: {
      facebook: "",
      instagram: "",
      twitter: "",
      whatsapp: ""
    },
  });

  const [previewLogo, setPreviewLogo] = useState(null);
  const [previewFavicon, setPreviewFavicon] = useState(null);
  const [previewFondo, setPreviewFondo] = useState(null);
  const [previewFondoLogin, setPreviewFondoLogin] = useState(null);
  const [previewFondoLoginBranding, setPreviewFondoLoginBranding] = useState(null);
  const [mostrandoVistaPrevia, setMostrandoVistaPrevia] = useState(false);
  const [transparenciaTemporal, setTransparenciaTemporal] = useState(null);
  const [mostrandoGaleria, setMostrandoGaleria] = useState(null); // "fondos", "favicons", "logos" o null
  const [mostrandoEditorMensaje, setMostrandoEditorMensaje] = useState(false);
  const [mostrarTemas, setMostrarTemas] = useState(true);
  const [paginaTemas, setPaginaTemas] = useState(0);
  const [configOriginalMensaje, setConfigOriginalMensaje] = useState(null);
  const [configTemporalMensaje, setConfigTemporalMensaje] = useState(null);
  const [temaActual, setTemaActual] = useState(obtenerTemaActual());
  const [bannersTienda, setBannersTienda] = useState([]);
  const [cargandoBanners, setCargandoBanners] = useState(false);
  const [pestañaActivaPersonalizacion, setPestañaActivaPersonalizacion] = useState("general");
  // eslint-disable-next-line no-unused-vars
  const [faviconTienda, setFaviconTienda] = useState(null);
  const [previewFaviconTienda, setPreviewFaviconTienda] = useState(null);
  
  // Actualizar colores cuando cambia el tema
  useEffect(() => {
    const tema = temas[temaActual];
    if (tema) {
      setConfig((prev) => ({
        ...prev,
        colorPrimario: tema.colores["--azul-primario"],
        colorSecundario: tema.colores["--azul-secundario"],
        colorFondoPrincipal: tema.colores["--fondo-principal"],
      }));
    }
  }, [temaActual]);
  
  // Efecto para hacer visible el mensaje sobre el modal cuando se abre
  useEffect(() => {
    const mensajeEl = document.getElementById('mensaje-bienvenida-editable');
    if (mostrandoEditorMensaje && mensajeEl) {
      // Aplicar z-index alto para que esté sobre el modal
      mensajeEl.style.zIndex = '10001';
      mensajeEl.style.position = 'relative';
      
      return () => {
        // Restaurar z-index cuando se cierre el modal
        mensajeEl.style.zIndex = '';
        mensajeEl.style.position = '';
      };
    }
  }, [mostrandoEditorMensaje]);

  // Cargar banners y favicon de la tienda
  useEffect(() => {
    if (pestañaActivaPersonalizacion === "tienda") {
      cargarBannersTienda();
      cargarFaviconTienda();
    }
  }, [pestañaActivaPersonalizacion]);

  // Escuchar actualizaciones en tiempo real de banners y favicon
  useEffect(() => {
    if (window.socket && pestañaActivaPersonalizacion === "tienda") {
      const socket = window.socket;
      
      socket.on("tienda_banners_actualizados", () => {
        cargarBannersTienda();
      });

      socket.on("tienda_favicon_actualizado", () => {
        cargarFaviconTienda();
      });

      return () => {
        socket.off("tienda_banners_actualizados");
        socket.off("tienda_favicon_actualizado");
      };
    }
  }, [pestañaActivaPersonalizacion]);

  const cargarBannersTienda = async () => {
    try {
      setCargandoBanners(true);
      const response = await fetch(`${serverUrl}/tienda/banners`);
      if (response.ok) {
        const data = await response.json();
        setBannersTienda(data || []);
      }
    } catch (error) {
      console.error("Error cargando banners:", error);
      pushToast("❌ Error cargando banners", "err");
    } finally {
      setCargandoBanners(false);
    }
  };

  const subirBannerTienda = async (archivo) => {
    try {
      const formData = new FormData();
      formData.append("banner", archivo);

      const response = await fetch(`${serverUrl}/admin/tienda/banners`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error subiendo banner");
      }

      pushToast("✅ Banner subido correctamente", "ok");
      cargarBannersTienda();
    } catch (error) {
      console.error("Error subiendo banner:", error);
      pushToast(`❌ ${error.message}`, "err");
    }
  };

  const eliminarBannerTienda = async (id) => {
    if (!window.confirm("¿Estás seguro de eliminar este banner?")) return;

    try {
      const response = await fetch(`${serverUrl}/admin/tienda/banners/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error eliminando banner");
      }

      pushToast("✅ Banner eliminado correctamente", "ok");
      cargarBannersTienda();
    } catch (error) {
      console.error("Error eliminando banner:", error);
      pushToast(`❌ ${error.message}`, "err");
    }
  };

  const cargarFaviconTienda = async () => {
    try {
      // Intentar cargar el favicon directamente
      const img = new Image();
      img.onload = () => {
        setPreviewFaviconTienda(`${serverUrl}/tienda/favicon?t=${Date.now()}`);
      };
      img.onerror = () => {
        setPreviewFaviconTienda(null);
      };
      img.src = `${serverUrl}/tienda/favicon?t=${Date.now()}`;
    } catch (error) {
      console.error("Error cargando favicon de tienda:", error);
      setPreviewFaviconTienda(null);
    }
  };

  const subirFaviconTienda = async (archivo) => {
    try {
      const formData = new FormData();
      formData.append("favicon", archivo);

      const response = await fetch(`${serverUrl}/admin/tienda/favicon`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error subiendo favicon");
      }

      pushToast("✅ Favicon subido correctamente", "ok");
      cargarFaviconTienda();
    } catch (error) {
      console.error("Error subiendo favicon:", error);
      pushToast(`❌ ${error.message}`, "err");
    }
  };

  const eliminarFaviconTienda = async () => {
    if (!window.confirm("¿Estás seguro de eliminar el favicon de la tienda?")) return;

    try {
      const response = await fetch(`${serverUrl}/admin/tienda/favicon`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error eliminando favicon");
      }

      pushToast("✅ Favicon eliminado correctamente", "ok");
      setPreviewFaviconTienda(null);
    } catch (error) {
      console.error("Error eliminando favicon:", error);
      pushToast(`❌ ${error.message}`, "err");
    }
  };

  // Función para abrir el editor y guardar estado original
  const abrirEditorMensaje = () => {
    // Guardar configuración original
    const original = {
      mensajeBienvenidaAncho: config.mensajeBienvenidaAncho,
      mensajeBienvenidaAlto: config.mensajeBienvenidaAlto,
      mensajeBienvenidaPosX: config.mensajeBienvenidaPosX,
      mensajeBienvenidaPosY: config.mensajeBienvenidaPosY,
      mensajeBienvenidaTamañoFuente: config.mensajeBienvenidaTamañoFuente,
      mensajeBienvenidaAlineacionTexto: config.mensajeBienvenidaAlineacionTexto,
      mensajeBienvenidaAlineacionVertical: config.mensajeBienvenidaAlineacionVertical,
    };
    setConfigOriginalMensaje(original);
    setConfigTemporalMensaje({ ...original });
    setMostrandoEditorMensaje(true);
    
    // Scroll al recuadro después de un pequeño delay para que el modal se abra
    setTimeout(() => {
      const mensajeEl = document.getElementById('mensaje-bienvenida-editable');
      if (mensajeEl) {
        mensajeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Resaltar el elemento con un borde más visible
        mensajeEl.style.outline = '4px solid rgba(59, 130, 246, 0.8)';
        mensajeEl.style.outlineOffset = '6px';
        mensajeEl.style.boxShadow = '0 0 20px rgba(59, 130, 246, 0.5), 0 0 40px rgba(59, 130, 246, 0.3)';
        setTimeout(() => {
          mensajeEl.style.outline = '';
          mensajeEl.style.outlineOffset = '';
          mensajeEl.style.boxShadow = '';
        }, 3000);
      }
    }, 150);
  };

  // Función para cancelar y restaurar valores originales
  const cancelarEditorMensaje = () => {
    if (configOriginalMensaje) {
      // Restaurar valores originales en el estado
      setConfig((prev) => ({
        ...prev,
        ...configOriginalMensaje,
      }));
      
      // Restaurar valores originales en el DOM del mensaje
      const mensajeEl = document.getElementById('mensaje-bienvenida-editable');
      if (mensajeEl) {
        mensajeEl.style.width = typeof configOriginalMensaje.mensajeBienvenidaAncho === 'number' 
          ? `${configOriginalMensaje.mensajeBienvenidaAncho}px` 
          : configOriginalMensaje.mensajeBienvenidaAncho || "500px";
        mensajeEl.style.height = configOriginalMensaje.mensajeBienvenidaAlto === "auto" 
          ? "auto" 
          : typeof configOriginalMensaje.mensajeBienvenidaAlto === 'number'
          ? `${configOriginalMensaje.mensajeBienvenidaAlto}px`
          : configOriginalMensaje.mensajeBienvenidaAlto || "auto";
        mensajeEl.style.transform = `translate(${configOriginalMensaje.mensajeBienvenidaPosX || 0}px, ${configOriginalMensaje.mensajeBienvenidaPosY || 0}px)`;
        mensajeEl.style.fontSize = `${configOriginalMensaje.mensajeBienvenidaTamañoFuente || 0.7}rem`;
        mensajeEl.style.textAlign = configOriginalMensaje.mensajeBienvenidaAlineacionTexto || "center";
        mensajeEl.style.justifyContent = configOriginalMensaje.mensajeBienvenidaAlineacionTexto === "left" ? "flex-start" : 
                                         configOriginalMensaje.mensajeBienvenidaAlineacionTexto === "right" ? "flex-end" : "center";
        mensajeEl.style.alignItems = configOriginalMensaje.mensajeBienvenidaAlineacionVertical || "center";
      }
    }
    setConfigOriginalMensaje(null);
    setConfigTemporalMensaje(null);
    setMostrandoEditorMensaje(false);
  };

  // Función para actualizar configuración temporal (cambios en tiempo real)
  const actualizarConfigTemporal = (nuevosValores) => {
    const nuevaConfigTemporal = { ...configTemporalMensaje, ...nuevosValores };
    setConfigTemporalMensaje(nuevaConfigTemporal);
    
    // Aplicar cambios en tiempo real al estado principal
    setConfig((prev) => ({
      ...prev,
      ...nuevosValores,
    }));
    
    // Aplicar cambios directamente al DOM del mensaje en tiempo real
    const mensajeEl = document.getElementById('mensaje-bienvenida-editable');
    if (mensajeEl) {
      const valoresFinales = { ...configTemporalMensaje, ...nuevosValores };
      
      // Aplicar ancho
      if (nuevosValores.mensajeBienvenidaAncho !== undefined) {
        mensajeEl.style.width = typeof valoresFinales.mensajeBienvenidaAncho === 'number' 
          ? `${valoresFinales.mensajeBienvenidaAncho}px` 
          : valoresFinales.mensajeBienvenidaAncho || "500px";
      }
      
      // Aplicar alto
      if (nuevosValores.mensajeBienvenidaAlto !== undefined) {
        mensajeEl.style.height = valoresFinales.mensajeBienvenidaAlto === "auto" 
          ? "auto" 
          : typeof valoresFinales.mensajeBienvenidaAlto === 'number'
          ? `${valoresFinales.mensajeBienvenidaAlto}px`
          : valoresFinales.mensajeBienvenidaAlto || "auto";
      }
      
      // Aplicar posición X
      if (nuevosValores.mensajeBienvenidaPosX !== undefined) {
        const posX = valoresFinales.mensajeBienvenidaPosX || 0;
        const posY = valoresFinales.mensajeBienvenidaPosY !== undefined ? valoresFinales.mensajeBienvenidaPosY : (configTemporalMensaje?.mensajeBienvenidaPosY ?? 0);
        mensajeEl.style.transform = `translate(${posX}px, ${posY}px)`;
      }
      
      // Aplicar posición Y
      if (nuevosValores.mensajeBienvenidaPosY !== undefined) {
        const posX = valoresFinales.mensajeBienvenidaPosX !== undefined ? valoresFinales.mensajeBienvenidaPosX : (configTemporalMensaje?.mensajeBienvenidaPosX ?? 0);
        const posY = valoresFinales.mensajeBienvenidaPosY || 0;
        mensajeEl.style.transform = `translate(${posX}px, ${posY}px)`;
      }
      
      // Aplicar tamaño de fuente
      if (nuevosValores.mensajeBienvenidaTamañoFuente !== undefined) {
        mensajeEl.style.fontSize = `${valoresFinales.mensajeBienvenidaTamañoFuente || 0.7}rem`;
      }
      
      // Aplicar alineación de texto horizontal
      if (nuevosValores.mensajeBienvenidaAlineacionTexto !== undefined) {
        mensajeEl.style.textAlign = valoresFinales.mensajeBienvenidaAlineacionTexto || "center";
        mensajeEl.style.justifyContent = valoresFinales.mensajeBienvenidaAlineacionTexto === "left" ? "flex-start" : 
                                         valoresFinales.mensajeBienvenidaAlineacionTexto === "right" ? "flex-end" : "center";
      }
      
      // Aplicar alineación de texto vertical
      if (nuevosValores.mensajeBienvenidaAlineacionVertical !== undefined) {
        mensajeEl.style.alignItems = valoresFinales.mensajeBienvenidaAlineacionVertical || "center";
      }
    }
  };
  
  // Efecto para aplicar valores temporales al recuadro cuando cambian
  useEffect(() => {
    if (mostrandoEditorMensaje && configTemporalMensaje) {
      const mensajeEl = document.getElementById('mensaje-bienvenida-editable');
      if (mensajeEl) {
        mensajeEl.style.width = typeof configTemporalMensaje.mensajeBienvenidaAncho === 'number' 
          ? `${configTemporalMensaje.mensajeBienvenidaAncho}px` 
          : configTemporalMensaje.mensajeBienvenidaAncho || "500px";
        mensajeEl.style.height = configTemporalMensaje.mensajeBienvenidaAlto === "auto" 
          ? "auto" 
          : typeof configTemporalMensaje.mensajeBienvenidaAlto === 'number'
          ? `${configTemporalMensaje.mensajeBienvenidaAlto}px`
          : configTemporalMensaje.mensajeBienvenidaAlto || "auto";
        mensajeEl.style.transform = `translate(${configTemporalMensaje.mensajeBienvenidaPosX || 0}px, ${configTemporalMensaje.mensajeBienvenidaPosY || 0}px)`;
        mensajeEl.style.fontSize = `${configTemporalMensaje.mensajeBienvenidaTamañoFuente || 0.7}rem`;
        mensajeEl.style.textAlign = configTemporalMensaje.mensajeBienvenidaAlineacionTexto || "center";
        mensajeEl.style.justifyContent = configTemporalMensaje.mensajeBienvenidaAlineacionTexto === "left" ? "flex-start" : 
                                         configTemporalMensaje.mensajeBienvenidaAlineacionTexto === "right" ? "flex-end" : "center";
        mensajeEl.style.alignItems = configTemporalMensaje.mensajeBienvenidaAlineacionVertical || "center";
      }
    }
  }, [configTemporalMensaje, mostrandoEditorMensaje]);
  const [galeriaArchivos, setGaleriaArchivos] = useState([]);
  const [cargandoGaleria, setCargandoGaleria] = useState(false);
  
  const logoInputRef = useRef(null);
  const faviconInputRef = useRef(null);
  const fondoInputRef = useRef(null);
  const fondoLoginInputRef = useRef(null);
  const fondoLoginBrandingInputRef = useRef(null);

  const authFetch = async (url, options = {}) => {
    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    };
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      // Incluir detalles del error si están disponibles
      const errorMsg = data.error || `Error HTTP ${res.status}`;
      const errorDetails = data.details ? ` - Detalles: ${JSON.stringify(data.details)}` : "";
      // Crear un error con el status code como propiedad para facilitar el manejo
      const error = new Error(errorMsg + errorDetails);
      error.status = res.status;
      error.statusCode = res.status;
      throw error;
    }
    return res.json();
  };

  // Cargar configuración actual
  useEffect(() => {
    const cargarConfig = async () => {
      try {
        const data = await authFetch(`${serverUrl}/admin/personalizacion`);
        if (data) {
          const resolverArchivo = async (nombres, subfolder) => {
            // Solo intentar el primer candidato para evitar múltiples solicitudes
            if (nombres.length === 0) return null;
            
            const nombre = nombres[0];
            // Los archivos ahora están en sus respectivas subcarpetas
            const url = `${serverUrl}/uploads/personalizacion/${subfolder}/${nombre}`;
            
            try {
              const resp = await fetch(url, { 
                method: "HEAD", 
                cache: "force-cache", // Usar caché del navegador
                signal: AbortSignal.timeout(5000)
              });
              
              if (resp.ok && resp.status !== 404) {
                return url;
              }
              
              // Error al cargar preview
              if (!resp.ok) {
                return null;
              }
            } catch (err) {
              // Ignorar errores silenciosamente
              console.warn("⚠️ Error cargando preview:", err.message);
            }
            
            return null;
          };

          setConfig((prev) => ({ 
            ...prev, 
            ...data,
            nombre_tienda: data.nombre_tienda || "Nuestra Tienda",
            tienda_color_primario: data.tienda_color_primario || "#3b82f6",
            tienda_color_secundario: data.tienda_color_secundario || "#1e40af",
            tienda_color_fondo: data.tienda_color_fondo || "#f8f9fa",
            tienda_descripcion: data.tienda_descripcion || "",
            tienda_telefono: data.tienda_telefono || "",
            tienda_email: data.tienda_email || "",
            tienda_direccion: data.tienda_direccion || "",
            tienda_redes_sociales: data.tienda_redes_sociales ? (typeof data.tienda_redes_sociales === 'string' ? JSON.parse(data.tienda_redes_sociales) : data.tienda_redes_sociales) : { facebook: "", instagram: "", twitter: "", whatsapp: "" },
            colorFondoPrincipal: data.colorFondoPrincipal || "#15192e",
            mensajeBienvenidaAncho: data.mensajeBienvenidaAncho || 500,
            mensajeBienvenidaAlto: data.mensajeBienvenidaAlto || "auto",
            mensajeBienvenidaPosX: data.mensajeBienvenidaPosX || 0,
            mensajeBienvenidaPosY: data.mensajeBienvenidaPosY || 0,
            mensajeBienvenidaTamañoFuente: data.mensajeBienvenidaTamañoFuente || 0.7,
            mensajeBienvenidaAlineacionTexto: data.mensajeBienvenidaAlineacionTexto || "center",
            mensajeBienvenidaAlineacionVertical: data.mensajeBienvenidaAlineacionVertical || "center",
          }));
          
          // Cargar tema guardado
          if (data.tema) {
            setTemaActual(data.tema);
            aplicarTema(data.tema);
            // Actualizar colores del tema
            const tema = temas[data.tema];
            if (tema) {
              setConfig((prev) => ({
                ...prev,
                colorPrimario: tema.colores["--azul-primario"],
                colorSecundario: tema.colores["--azul-secundario"],
                colorFondoPrincipal: tema.colores["--fondo-principal"],
              }));
            }
          } else {
            // Si no hay tema guardado en el servidor, usar el de localStorage o el predeterminado
            const temaGuardado = obtenerTemaActual();
            setTemaActual(temaGuardado);
            aplicarTema(temaGuardado);
            // Actualizar colores del tema
            const tema = temas[temaGuardado];
            if (tema) {
              setConfig((prev) => ({
                ...prev,
                colorPrimario: tema.colores["--azul-primario"],
                colorSecundario: tema.colores["--azul-secundario"],
                colorFondoPrincipal: tema.colores["--fondo-principal"],
              }));
            }
          }
          
          if (data.logo) {
            const logoTipo = data.logoTipo || "imagen";
            const logoExt = logoTipo === "gif" ? "gif" : "png";
            setPreviewLogo(`${serverUrl}/uploads/personalizacion/logos/logo.${logoExt}?t=${Date.now()}`);
            setConfig((prev) => ({ ...prev, logoTipo }));
          }
          if (data.favicon) {
            const faviconTipo = data.faviconTipo || "imagen";
            const faviconExt = faviconTipo === "gif" ? "gif" : "ico";
            setPreviewFavicon(`${serverUrl}/uploads/personalizacion/favicons/favicon.${faviconExt}?t=${Date.now()}`);
            setConfig((prev) => ({ ...prev, faviconTipo }));
          }
          if (data.fondo) {
            // Usar SOLO el tipo específico que viene del servidor para evitar múltiples solicitudes
            let candidatos = [];
            if (data.fondoTipo === "video") {
              candidatos = ["fondo.mp4"];
            } else if (data.fondoTipo === "gif") {
              candidatos = ["fondo.gif"];
            } else {
              // Para imágenes, intentar solo PNG (el más común) para evitar múltiples solicitudes
              candidatos = ["fondo.png"];
            }
            // Solo resolver si hay candidatos
            if (candidatos.length > 0) {
              const url = await resolverArchivo(candidatos, "fondos");
              if (url) setPreviewFondo(url);
            }
          }
          if (data.fondoLogin) {
            const tipo = data.fondoLoginTipo || "imagen";
            if (tipo === "video") {
              setPreviewFondoLogin(`${serverUrl}/uploads/personalizacion/fondos-login/fondo-login.mp4?t=${Date.now()}`);
            } else if (tipo === "gif") {
              setPreviewFondoLogin(`${serverUrl}/uploads/personalizacion/fondos-login/fondo-login.gif?t=${Date.now()}`);
            } else {
              setPreviewFondoLogin(`${serverUrl}/uploads/personalizacion/fondos-login/fondo-login.png?t=${Date.now()}`);
            }
          }
          if (data.fondoLoginBranding) {
            const tipo = data.fondoLoginBrandingTipo || "imagen";
            if (tipo === "video") {
              setPreviewFondoLoginBranding(`${serverUrl}/uploads/personalizacion/fondos-login-branding/fondo-login-branding.mp4?t=${Date.now()}`);
            } else if (tipo === "gif") {
              setPreviewFondoLoginBranding(`${serverUrl}/uploads/personalizacion/fondos-login-branding/fondo-login-branding.gif?t=${Date.now()}`);
            } else {
              setPreviewFondoLoginBranding(`${serverUrl}/uploads/personalizacion/fondos-login-branding/fondo-login-branding.png?t=${Date.now()}`);
            }
          }
        }
      } catch (err) {
        console.error("Error cargando configuración:", err);
      }
    };
    cargarConfig();
  }, [serverUrl, token]);

  const handleFileChange = (tipo, e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (tipo === "logo") {
      if (!file.type.startsWith("image/")) {
        pushToast("❌ Solo se permiten imágenes para el logo", "err");
        return;
      }
      const esGif = file.type === "image/gif";
      setConfig((prev) => ({ ...prev, logo: file, logoTipo: esGif ? "gif" : "imagen" }));
      const reader = new FileReader();
      reader.onload = (e) => setPreviewLogo(e.target.result);
      reader.readAsDataURL(file);
    } else if (tipo === "favicon") {
      if (!file.type.startsWith("image/")) {
        pushToast("❌ Solo se permiten imágenes para el favicon", "err");
        return;
      }
      const esGif = file.type === "image/gif";
      setConfig((prev) => ({ ...prev, favicon: file, faviconTipo: esGif ? "gif" : "imagen" }));
      const reader = new FileReader();
      reader.onload = (e) => setPreviewFavicon(e.target.result);
      reader.readAsDataURL(file);
    } else if (tipo === "fondo") {
      const esVideo = file.type.startsWith("video/");
      const esGif = file.type === "image/gif";
      const esImagen = file.type.startsWith("image/");

      if (!esVideo && !esGif && !esImagen) {
        pushToast("❌ Solo se permiten imágenes, GIFs o videos para el fondo", "err");
        return;
      }

      const tipoFondo = esVideo ? "video" : esGif ? "gif" : "imagen";
      setConfig((prev) => ({ ...prev, fondo: file, fondoTipo: tipoFondo }));

      if (esVideo) {
        const url = URL.createObjectURL(file);
        setPreviewFondo(url);
      } else {
        const reader = new FileReader();
        reader.onload = (e) => setPreviewFondo(e.target.result);
        reader.readAsDataURL(file);
      }
    } else if (tipo === "fondoLogin") {
      const esVideo = file.type.startsWith("video/");
      const esGif = file.type === "image/gif";
      const esImagen = file.type.startsWith("image/");

      if (!esVideo && !esGif && !esImagen) {
        pushToast("❌ Solo se permiten imágenes, GIFs o videos para el fondo de login", "err");
        return;
      }

      const tipoFondo = esVideo ? "video" : esGif ? "gif" : "imagen";
      setConfig((prev) => ({ ...prev, fondoLogin: file, fondoLoginTipo: tipoFondo }));

      if (esVideo) {
        const url = URL.createObjectURL(file);
        setPreviewFondoLogin(url);
      } else {
        const reader = new FileReader();
        reader.onload = (e) => setPreviewFondoLogin(e.target.result);
        reader.readAsDataURL(file);
      }
    } else if (tipo === "fondoLoginBranding") {
      const esVideo = file.type.startsWith("video/");
      const esGif = file.type === "image/gif";
      const esImagen = file.type.startsWith("image/");

      if (!esVideo && !esGif && !esImagen) {
        pushToast("❌ Solo se permiten imágenes, GIFs o videos para el fondo de branding", "err");
        return;
      }

      const tipoFondo = esVideo ? "video" : esGif ? "gif" : "imagen";
      setConfig((prev) => ({ ...prev, fondoLoginBranding: file, fondoLoginBrandingTipo: tipoFondo }));

      if (esVideo) {
        const url = URL.createObjectURL(file);
        setPreviewFondoLoginBranding(url);
      } else {
        const reader = new FileReader();
        reader.onload = (e) => setPreviewFondoLoginBranding(e.target.result);
        reader.readAsDataURL(file);
      }
    }
  };

  const subirArchivo = async (tipo, archivo) => {
    try {
    const formData = new FormData();
    formData.append("archivo", archivo);
      formData.append("tipo", tipo); // Enviar tipo en el FormData

    let endpoint = "";
    if (tipo === "logo") endpoint = "/admin/personalizacion/logo";
    else if (tipo === "favicon") endpoint = "/admin/personalizacion/favicon";
    else if (tipo === "fondo") endpoint = "/admin/personalizacion/fondo";
      else if (tipo === "fondoLogin") endpoint = "/admin/personalizacion/fondo-login";
      else if (tipo === "fondoLoginBranding") endpoint = "/admin/personalizacion/fondo-login-branding";

      const res = await fetch(`${serverUrl}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        console.error(`❌ Error en respuesta:`, data);
      throw new Error(data.error || `Error subiendo ${tipo}`);
    }

      return data;
    } catch (err) {
      console.error(`❌ Error subiendo archivo ${tipo}:`, err);
      throw err;
    }
  };

  const eliminarFondo = async () => {
    try {
      setLoading(true);
      
      // Eliminar fondo del servidor
      await authFetch(`${serverUrl}/admin/personalizacion/fondo`, {
        method: "DELETE",
      });

      // Limpiar estado local
      setPreviewFondo(null);
      setConfig((prev) => ({
        ...prev,
        fondo: null,
        fondoTipo: null,
        fondoTransparencia: 0.3,
      }));

      pushToast("✅ Fondo eliminado correctamente", "ok");
      
      // Recargar página para aplicar cambios
      setTimeout(() => {
        recargarSeguro();
      }, 1000);
    } catch (err) {
      console.error("Error eliminando fondo:", err);
      pushToast(`❌ Error: ${err.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  const eliminarFondoLogin = async () => {
    try {
      setLoading(true);
      await authFetch(`${serverUrl}/admin/personalizacion/fondo-login`, {
        method: "DELETE",
      });
      setPreviewFondoLogin(null);
      setConfig((prev) => ({
        ...prev,
        fondoLogin: null,
        fondoLoginTipo: null,
      }));
      pushToast("✅ Fondo de login eliminado correctamente", "ok");
      setTimeout(() => {
        recargarSeguro();
      }, 1000);
    } catch (err) {
      console.error("Error eliminando fondo login:", err);
      pushToast(`❌ Error: ${err.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  const eliminarFondoLoginBranding = async () => {
    try {
      setLoading(true);
      await authFetch(`${serverUrl}/admin/personalizacion/fondo-login-branding`, {
        method: "DELETE",
      });
      setPreviewFondoLoginBranding(null);
      setConfig((prev) => ({
        ...prev,
        fondoLoginBranding: null,
        fondoLoginBrandingTipo: null,
      }));
      pushToast("✅ Fondo de branding eliminado correctamente", "ok");
      setTimeout(() => {
        recargarSeguro();
      }, 1000);
    } catch (err) {
      console.error("Error eliminando fondo login branding:", err);
      pushToast(`❌ Error: ${err.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  const guardarConfiguracion = async () => {
    try {
      setLoading(true);

      // Subir archivos si hay nuevos
      if (config.logo instanceof File) {
        const resultLogo = await subirArchivo("logo", config.logo);
        // Actualizar el estado para que no se intente subir de nuevo
        setConfig((prev) => ({ ...prev, logo: true, logoTipo: resultLogo.tipo }));
      }
      if (config.favicon instanceof File) {
        const resultFavicon = await subirArchivo("favicon", config.favicon);
        // Actualizar el estado para que no se intente subir de nuevo
        setConfig((prev) => ({ ...prev, favicon: true, faviconTipo: resultFavicon.tipo }));
      }
      if (config.fondo instanceof File) {
        const resultFondo = await subirArchivo("fondo", config.fondo);
        // Actualizar el estado con el tipo de fondo y marcar como subido
        setConfig((prev) => ({ 
          ...prev, 
          fondo: true, 
          fondoTipo: resultFondo.tipo || prev.fondoTipo 
        }));
      }
      if (config.fondoLogin instanceof File) {
        await subirArchivo("fondoLogin", config.fondoLogin);
      }
      if (config.fondoLoginBranding instanceof File) {
        await subirArchivo("fondoLoginBranding", config.fondoLoginBranding);
      }

      // Guardar configuración
      const dataToSave = {
        mensajeBienvenida: config.mensajeBienvenida,
        mensajeBienvenidaAncho: config.mensajeBienvenidaAncho,
        mensajeBienvenidaAlto: config.mensajeBienvenidaAlto,
        mensajeBienvenidaPosX: config.mensajeBienvenidaPosX,
        mensajeBienvenidaPosY: config.mensajeBienvenidaPosY,
        mensajeBienvenidaTamañoFuente: config.mensajeBienvenidaTamañoFuente,
        mensajeBienvenidaAlineacionTexto: config.mensajeBienvenidaAlineacionTexto,
        mensajeBienvenidaAlineacionVertical: config.mensajeBienvenidaAlineacionVertical,
        fondoTransparencia: config.fondoTransparencia,
        fondoTipo: config.fondoTipo,
        logoTipo: config.logoTipo,
        faviconTipo: config.faviconTipo,
        colorPrimario: config.colorPrimario,
        colorSecundario: config.colorSecundario,
        colorFondoPrincipal: config.colorFondoPrincipal,
        nombreApp: config.nombreApp,
        nombre_tienda: config.nombre_tienda,
        tema: temaActual,
      };

      await authFetch(`${serverUrl}/admin/personalizacion`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dataToSave),
      });

      // Recargar la configuración desde el servidor
      const data = await authFetch(`${serverUrl}/admin/personalizacion`);
      if (data) {
        setConfig((prev) => ({ 
          ...prev, 
          ...data,
          colorFondoPrincipal: data.colorFondoPrincipal || "#15192e"
        }));
        if (data.logo) {
          const logoTipo = data.logoTipo || "imagen";
          const logoExt = logoTipo === "gif" ? "gif" : logoTipo === "svg" ? "svg" : logoTipo === "jpg" ? "jpg" : "png";
          setPreviewLogo(`${serverUrl}/uploads/personalizacion/logos/logo.${logoExt}?t=${Date.now()}`);
        }
        if (data.favicon) {
          const faviconTipo = data.faviconTipo || "imagen";
          const faviconExt = faviconTipo === "gif" ? "gif" : faviconTipo === "svg" ? "svg" : faviconTipo === "png" ? "png" : "ico";
          setPreviewFavicon(`${serverUrl}/uploads/personalizacion/favicons/favicon.${faviconExt}?t=${Date.now()}`);
        }
        // Actualizar preview del fondo si existe
        if (data.fondo && data.fondoTipo) {
          let fondoUrl = "";
          if (data.fondoTipo === "video") {
            fondoUrl = `${serverUrl}/uploads/personalizacion/fondos/fondo.mp4?t=${Date.now()}`;
          } else if (data.fondoTipo === "gif") {
            fondoUrl = `${serverUrl}/uploads/personalizacion/fondos/fondo.gif?t=${Date.now()}`;
          } else {
            fondoUrl = `${serverUrl}/uploads/personalizacion/fondos/fondo.png?t=${Date.now()}`;
          }
          setPreviewFondo(fondoUrl);
        }
      }

      pushToast("✅ Configuración guardada correctamente", "ok");
      
      // Recargar página para aplicar cambios (logo y favicon en toda la app)
      setTimeout(() => {
        recargarSeguro();
      }, 1500);
    } catch (err) {
      console.error("Error guardando configuración:", err);
      pushToast(`❌ Error: ${err.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  // Manejar el inicio del control de transparencia
  const iniciarVistaPreviaTransparencia = () => {
    setTransparenciaTemporal(config.fondoTransparencia);
    setMostrandoVistaPrevia(true);
  };

  // Manejar el cambio de transparencia con vista previa
  const cambiarTransparencia = (valor) => {
    const nuevaTransparencia = parseFloat(valor);
    setTransparenciaTemporal(nuevaTransparencia);
    setConfig((prev) => ({
      ...prev,
      fondoTransparencia: nuevaTransparencia,
    }));
    // Notificar en vivo al app para actualizar el fondo sin recargar
    try {
      window.dispatchEvent(
        new CustomEvent("personalizacion_preview", {
          detail: { fondoTransparencia: nuevaTransparencia },
        })
      );
    } catch (e) {}
  };

  // Finalizar vista previa y aplicar
  const finalizarVistaPreviaTransparencia = () => {
    setMostrandoVistaPrevia(false);
    setTransparenciaTemporal(null);
  };

  // Cargar galería de imágenes
  const cargarGaleria = async (tipo) => {
    try {
      setCargandoGaleria(true);
      setMostrandoGaleria(tipo);
      const data = await authFetch(`${serverUrl}/admin/personalizacion/galeria/${tipo}`);
      setGaleriaArchivos((data.archivos || []).map((a) => {
        // Si viene con subcarpeta, solo mostrar nombre limpio
        const partes = a.nombre.split("/");
        const nombreLimpio = partes[partes.length - 1];
        return { ...a, nombre: nombreLimpio, ruta: a.ruta || a.nombre };
      }));
    } catch (err) {
      console.error("Error cargando galería:", err);
      pushToast(`❌ Error cargando galería: ${err.message}`, "err");
    } finally {
      setCargandoGaleria(false);
    }
  };

  // Seleccionar imagen de la galería
  const seleccionarDeGaleria = async (tipo, nombreArchivo) => {
    try {
      setLoading(true);
      await authFetch(`${serverUrl}/admin/personalizacion/seleccionar/${tipo}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ nombreArchivo }),
      });

      // Actualizar preview
      const tipoArchivo = nombreArchivo.split(".").pop();
      let url = "";
      if (tipo === "fondos") {
        if (tipoArchivo === "mp4") {
          url = `${serverUrl}/uploads/personalizacion/fondos/fondo.mp4?t=${Date.now()}`;
          setConfig((prev) => ({ ...prev, fondoTipo: "video" }));
        } else if (tipoArchivo === "gif") {
          url = `${serverUrl}/uploads/personalizacion/fondos/fondo.gif?t=${Date.now()}`;
          setConfig((prev) => ({ ...prev, fondoTipo: "gif" }));
        } else {
          url = `${serverUrl}/uploads/personalizacion/fondos/fondo.png?t=${Date.now()}`;
          setConfig((prev) => ({ ...prev, fondoTipo: "imagen" }));
        }
        setPreviewFondo(url);
      } else if (tipo === "fondos-login") {
        if (tipoArchivo === "mp4") {
          url = `${serverUrl}/uploads/personalizacion/fondos-login/fondo-login.mp4?t=${Date.now()}`;
          setConfig((prev) => ({ ...prev, fondoLoginTipo: "video" }));
        } else if (tipoArchivo === "gif") {
          url = `${serverUrl}/uploads/personalizacion/fondos-login/fondo-login.gif?t=${Date.now()}`;
          setConfig((prev) => ({ ...prev, fondoLoginTipo: "gif" }));
        } else {
          url = `${serverUrl}/uploads/personalizacion/fondos-login/fondo-login.png?t=${Date.now()}`;
          setConfig((prev) => ({ ...prev, fondoLoginTipo: "imagen" }));
        }
        setPreviewFondoLogin(url);
      } else if (tipo === "fondos-login-branding") {
        if (tipoArchivo === "mp4") {
          url = `${serverUrl}/uploads/personalizacion/fondos-login-branding/fondo-login-branding.mp4?t=${Date.now()}`;
          setConfig((prev) => ({ ...prev, fondoLoginBrandingTipo: "video" }));
        } else if (tipoArchivo === "gif") {
          url = `${serverUrl}/uploads/personalizacion/fondos-login-branding/fondo-login-branding.gif?t=${Date.now()}`;
          setConfig((prev) => ({ ...prev, fondoLoginBrandingTipo: "gif" }));
        } else {
          url = `${serverUrl}/uploads/personalizacion/fondos-login-branding/fondo-login-branding.png?t=${Date.now()}`;
          setConfig((prev) => ({ ...prev, fondoLoginBrandingTipo: "imagen" }));
        }
        setPreviewFondoLoginBranding(url);
      } else if (tipo === "logos") {
        url = `${serverUrl}/uploads/personalizacion/logos/logo.${tipoArchivo}?t=${Date.now()}`;
        setPreviewLogo(url);
        setConfig((prev) => ({ 
          ...prev, 
          logoTipo: tipoArchivo === "gif" ? "gif" : tipoArchivo === "svg" ? "svg" : "imagen" 
        }));
      } else if (tipo === "favicons") {
        url = `${serverUrl}/uploads/personalizacion/favicons/favicon.${tipoArchivo}?t=${Date.now()}`;
        setPreviewFavicon(url);
        setConfig((prev) => ({ 
          ...prev, 
          faviconTipo: tipoArchivo === "gif" ? "gif" : tipoArchivo === "svg" ? "svg" : "imagen" 
        }));
      }

      setMostrandoGaleria(null);
      pushToast("✅ Imagen seleccionada correctamente", "ok");
      
      // Recargar página para aplicar cambios
      setTimeout(() => {
        recargarSeguro();
      }, 1000);
    } catch (err) {
      console.error("Error seleccionando imagen:", err);
      pushToast(`❌ Error: ${err.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`personalizacion-container ${mostrandoVistaPrevia ? 'vista-previa-transparencia' : ''}`}>
      {/* Overlay de vista previa de transparencia */}
      {mostrandoVistaPrevia && previewFondo && (
        <div className="vista-previa-overlay" onClick={finalizarVistaPreviaTransparencia}>
          <div className="vista-previa-contenido" onClick={(e) => e.stopPropagation()}>
            <div className="vista-previa-header">
              <h3>👁️ Vista Previa de Transparencia</h3>
              <button className="cerrar-vista-previa" onClick={finalizarVistaPreviaTransparencia}>✕</button>
            </div>
            <div className="vista-previa-fondo-container">
              {config.fondoTipo === "video" ? (
                <video 
                  src={previewFondo} 
                  autoPlay 
                  loop 
                  muted 
                  style={{ opacity: transparenciaTemporal ?? config.fondoTransparencia }}
                  className="vista-previa-fondo"
                />
              ) : (
                <img 
                  src={previewFondo} 
                  alt="Vista previa fondo" 
                  style={{ opacity: transparenciaTemporal ?? config.fondoTransparencia }}
                  className="vista-previa-fondo"
                />
              )}
              <div className="vista-previa-control">
                <label>
                  Transparencia: {Math.round((transparenciaTemporal ?? config.fondoTransparencia) * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={transparenciaTemporal ?? config.fondoTransparencia}
                  onChange={(e) => cambiarTransparencia(e.target.value)}
                />
                <div className="vista-previa-info">
                  <p>💡 Mueve el control deslizante para ver la transparencia en tiempo real</p>
                  <p>💡 Haz clic fuera de esta ventana o presiona ✕ para cerrar</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Galería */}
      {mostrandoGaleria && (
        <div className="galeria-overlay" onClick={() => setMostrandoGaleria(null)}>
          <div className="galeria-modal" onClick={(e) => e.stopPropagation()}>
            <div className="galeria-header">
              <h3>🖼️ Galería de {
                mostrandoGaleria === "fondos" ? "Fondos" : 
                mostrandoGaleria === "fondos-login" ? "Fondos de Login" :
                mostrandoGaleria === "fondos-login-branding" ? "Fondos de Branding" :
                mostrandoGaleria === "logos" ? "Logos" : 
                "Favicons"
              }</h3>
              <button className="cerrar-galeria" onClick={() => setMostrandoGaleria(null)}>✕</button>
            </div>
            <div className="galeria-contenido">
              {cargandoGaleria ? (
                <div className="galeria-loading">Cargando galería...</div>
              ) : galeriaArchivos.length === 0 ? (
                <div className="galeria-vacia">
                  <p>No hay imágenes guardadas en la galería</p>
                  <p className="galeria-hint">Sube una imagen para que se guarde en el historial</p>
                </div>
              ) : (
                <div className="galeria-grid">
                  {galeriaArchivos.map((archivo, idx) => {
                    const tipoArchivo = archivo.nombre.split(".").pop();
                    const esVideo = tipoArchivo === "mp4";
                    let url = `${serverUrl}/uploads/personalizacion/${mostrandoGaleria}/${archivo.nombre}`;
                    if (archivo.ruta?.includes("/")) {
                      url = `${serverUrl}/uploads/personalizacion/${archivo.ruta}`;
                    } else if (archivo.esActual) {
                      // El archivo actual también está en la subcarpeta
                      url = `${serverUrl}/uploads/personalizacion/${mostrandoGaleria}/${archivo.nombre}`;
                    }
                    const fecha = new Date(archivo.fecha).toLocaleDateString("es-ES", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    });
                    
                    return (
                      <div key={idx} className="galeria-item">
                        <div className="galeria-item-preview">
                          {esVideo ? (
                            <video src={url} muted />
                          ) : (
                            <img src={url} alt={archivo.nombre} />
                          )}
                          {archivo.esActual && (
                            <div className="galeria-item-badge">Actual</div>
                          )}
                        </div>
                        <div className="galeria-item-info">
                          <p className="galeria-item-nombre" title={archivo.nombre}>
                            {archivo.nombre.length > 25 
                              ? archivo.nombre.substring(0, 25) + "..." 
                              : archivo.nombre}
                          </p>
                          <p className="galeria-item-fecha">{fecha}</p>
                          <p className="galeria-item-tamaño">
                            {(archivo.tamaño / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        <div className="galeria-item-acciones">
                          <button
                            className="btn-seleccionar-galeria"
                            onClick={() => seleccionarDeGaleria(mostrandoGaleria, archivo.nombre)}
                            disabled={loading || archivo.esActual}
                          >
                            {archivo.esActual ? "✓ Seleccionado" : "Seleccionar"}
                          </button>
                          <button
                            className="btn-eliminar-galeria"
                            onClick={async () => {
                              const confirmado = window.confirm(`¿Eliminar "${archivo.nombre}" de la galería?`);
                              if (!confirmado) return;
                              
                              try {
                                setLoading(true);
                                await authFetch(`${serverUrl}/admin/personalizacion/galeria/${mostrandoGaleria}/${encodeURIComponent(archivo.nombre)}`, {
                                  method: "DELETE",
                                });
                                setGaleriaArchivos((prev) => prev.filter((_, i) => i !== idx));
                                if (archivo.esActual) {
                                  pushToast("🗑️ Imagen eliminada. Elige otro fondo para seguir mostrando.", "ok");
                                } else {
                                  pushToast("🗑️ Imagen eliminada de la galería", "ok");
                                }
                              } catch (err) {
                                // Manejar específicamente el error 404
                                const statusCode = err.status || err.statusCode;
                                const errorMsg = err.message || "";
                                const is404 = statusCode === 404 || 
                                             errorMsg.includes("404") || 
                                             errorMsg.toLowerCase().includes("no encontrado") || 
                                             errorMsg.includes("Not Found") ||
                                             errorMsg.includes("not found");
                                
                                if (is404) {
                                  // El archivo ya no existe, actualizar la lista localmente
                                  // Nota: El 404 en la consola del navegador es normal y esperado
                                  setGaleriaArchivos((prev) => prev.filter((_, i) => i !== idx));
                                  pushToast("ℹ️ El archivo ya no existe en el servidor. Se ha actualizado la lista.", "ok");
                                  // Recargar la galería para asegurar sincronización
                                  try {
                                    await cargarGaleria(mostrandoGaleria);
                                  } catch (reloadErr) {
                                    // Solo loguear si no es un error esperado
                                    if (reloadErr.status !== 404 && reloadErr.statusCode !== 404) {
                                      console.warn("Error recargando galería:", reloadErr);
                                    }
                                  }
                                } else {
                                  console.error("Error eliminando imagen:", err);
                                  pushToast(`❌ Error eliminando: ${errorMsg || "Error desconocido"}`, "err");
                                }
                              } finally {
                                setLoading(false);
                              }
                            }}
                            title="Eliminar de la galería"
                            disabled={loading}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="personalizacion-header">
        <h2>🎨 Personalización</h2>
        <p>Personaliza la apariencia de tu aplicación</p>
      </div>

      {/* Pestañas de navegación */}
      <div className="personalizacion-tabs">
        <button
          className={pestañaActivaPersonalizacion === "general" ? "active" : ""}
          onClick={() => setPestañaActivaPersonalizacion("general")}
        >
          🎨 General
        </button>
        <button
          className={pestañaActivaPersonalizacion === "tienda" ? "active" : ""}
          onClick={() => setPestañaActivaPersonalizacion("tienda")}
        >
          🛍️ Tienda
        </button>
      </div>

      {pestañaActivaPersonalizacion === "general" && (
        <div className="personalizacion-grid">
        {/* LOGO */}
        <div className="personalizacion-card">
          <h3>🖼️ Logo</h3>
          <div className="personalizacion-upload">
            {previewLogo && (
              <div className="personalizacion-preview">
                <img src={previewLogo} alt="Logo preview" />
              </div>
            )}
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleFileChange("logo", e)}
              style={{ display: "none" }}
            />
            <div className="personalizacion-upload-actions">
            <button
              className="btn-upload"
              onClick={() => logoInputRef.current?.click()}
            >
              {previewLogo ? "🔄 Cambiar Logo" : "📤 Subir Logo"}
            </button>
              <button
                className="btn-galeria"
                onClick={() => cargarGaleria("logos")}
                title="Ver galería de logos guardados"
              >
                🖼️ Galería
              </button>
            </div>
            <p className="personalizacion-hint">
              Soporta: Imágenes (PNG, JPG, SVG) y GIFs animados
            </p>
          </div>
        </div>

        {/* FAVICON */}
        <div className="personalizacion-card">
          <h3>🔖 Favicon</h3>
          <div className="personalizacion-upload">
            {previewFavicon && (
              <div className="personalizacion-preview favicon-preview">
                <img src={previewFavicon} alt="Favicon preview" />
              </div>
            )}
            <input
              ref={faviconInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleFileChange("favicon", e)}
              style={{ display: "none" }}
            />
            <p className="personalizacion-hint">
              Soporta: Imágenes (ICO, PNG, SVG) y GIFs animados
            </p>
            <div className="personalizacion-upload-actions">
            <button
              className="btn-upload"
              onClick={() => faviconInputRef.current?.click()}
            >
              {previewFavicon ? "🔄 Cambiar Favicon" : "📤 Subir Favicon"}
            </button>
              <button
                className="btn-galeria"
                onClick={() => cargarGaleria("favicons")}
                title="Ver galería de favicons guardados"
              >
                🖼️ Galería
              </button>
            </div>
          </div>
        </div>

        {/* FONDO */}
        <div className="personalizacion-card fondo-card">
          <h3>🖼️ Fondo</h3>
          <div className="personalizacion-upload">
            {previewFondo && (
              <div className="personalizacion-preview fondo-preview">
                {config.fondoTipo === "video" ? (
                  <video
                    src={previewFondo}
                    autoPlay
                    loop
                    muted
                    style={{ opacity: config.fondoTransparencia ?? 1 }}
                  />
                ) : (
                  <img
                    src={previewFondo}
                    alt="Fondo preview"
                    style={{ opacity: config.fondoTransparencia ?? 1 }}
                  />
                )}
              </div>
            )}
            <input
              ref={fondoInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={(e) => handleFileChange("fondo", e)}
              style={{ display: "none" }}
            />
            <div className="personalizacion-upload-actions">
            <button
              className="btn-upload"
              onClick={() => fondoInputRef.current?.click()}
            >
              {previewFondo ? "🔄 Cambiar Fondo" : "📤 Subir Fondo"}
            </button>
              <button
                className="btn-galeria"
                onClick={() => cargarGaleria("fondos")}
                title="Ver galería de fondos guardados"
              >
                🖼️ Galería
              </button>
            </div>
            <p className="personalizacion-hint">
              Soporta: Imágenes (PNG, JPG), GIFs animados y Videos (MP4)
            </p>
          </div>
          {previewFondo && (
            <div className="personalizacion-control">
              <label>
                Transparencia: {Math.round(config.fondoTransparencia * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={config.fondoTransparencia}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    fondoTransparencia: parseFloat(e.target.value),
                  }))
                }
                onMouseDown={iniciarVistaPreviaTransparencia}
                onTouchStart={iniciarVistaPreviaTransparencia}
              />
              <div className="personalizacion-control-actions">
                <button
                  className="btn-vista-previa"
                  onClick={iniciarVistaPreviaTransparencia}
                  title="Ver vista previa de la transparencia"
                >
                  👁️ Vista Previa
                </button>
                <button
                  className="btn-eliminar-fondo"
                  onClick={eliminarFondo}
                  disabled={loading}
                  title="Eliminar fondo completamente"
                >
                  🗑️ Eliminar Fondo
                </button>
              </div>
            </div>
          )}
        </div>

        {/* FONDO LOGIN */}
        <div className="personalizacion-card fondo-card">
          <h3>🖼️ Fondo de Login</h3>
          <div className="personalizacion-upload">
            {previewFondoLogin && (
              <div className="personalizacion-preview fondo-preview">
                {config.fondoLoginTipo === "video" ? (
                  <video src={previewFondoLogin} autoPlay loop muted />
                ) : (
                  <img src={previewFondoLogin} alt="Fondo login preview" />
                )}
              </div>
            )}
            <input
              ref={fondoLoginInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={(e) => handleFileChange("fondoLogin", e)}
              style={{ display: "none" }}
            />
            <div className="personalizacion-upload-actions">
              <button
                className="btn-upload"
                onClick={() => fondoLoginInputRef.current?.click()}
              >
                {previewFondoLogin ? "🔄 Cambiar Fondo" : "📤 Subir Fondo"}
              </button>
              <button
                className="btn-galeria"
                onClick={() => cargarGaleria("fondos-login")}
                title="Ver galería de fondos de login guardados"
              >
                🖼️ Galería
              </button>
            </div>
            <p className="personalizacion-hint">
              Soporta: Imágenes (PNG, JPG), GIFs animados y Videos (MP4)
            </p>
          </div>
          {previewFondoLogin && (
            <div className="personalizacion-control">
              <div className="personalizacion-control-actions">
                <button
                  className="btn-eliminar-fondo"
                  onClick={eliminarFondoLogin}
                  disabled={loading}
                  title="Eliminar fondo de login"
                >
                  🗑️ Eliminar Fondo
                </button>
              </div>
            </div>
          )}
        </div>

        {/* FONDO LOGIN BRANDING */}
        <div className="personalizacion-card fondo-card">
          <h3>🖼️ Fondo de Branding (Login)</h3>
          <div className="personalizacion-upload">
            {previewFondoLoginBranding && (
              <div className="personalizacion-preview fondo-preview">
                {config.fondoLoginBrandingTipo === "video" ? (
                  <video src={previewFondoLoginBranding} autoPlay loop muted />
                ) : (
                  <img src={previewFondoLoginBranding} alt="Fondo login branding preview" />
                )}
              </div>
            )}
            <input
              ref={fondoLoginBrandingInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={(e) => handleFileChange("fondoLoginBranding", e)}
              style={{ display: "none" }}
            />
            <div className="personalizacion-upload-actions">
              <button
                className="btn-upload"
                onClick={() => fondoLoginBrandingInputRef.current?.click()}
              >
                {previewFondoLoginBranding ? "🔄 Cambiar Fondo" : "📤 Subir Fondo"}
              </button>
              <button
                className="btn-galeria"
                onClick={() => cargarGaleria("fondos-login-branding")}
                title="Ver galería de fondos de branding guardados"
              >
                🖼️ Galería
              </button>
            </div>
            <p className="personalizacion-hint">
              Soporta: Imágenes (PNG, JPG), GIFs animados y Videos (MP4)
            </p>
          </div>
          {previewFondoLoginBranding && (
            <div className="personalizacion-control">
              <div className="personalizacion-control-actions">
                <button
                  className="btn-eliminar-fondo"
                  onClick={eliminarFondoLoginBranding}
                  disabled={loading}
                  title="Eliminar fondo de branding"
                >
                  🗑️ Eliminar Fondo
                </button>
              </div>
            </div>
          )}
        </div>

        {/* MENSAJE DE BIENVENIDA */}
        <div className="personalizacion-card mensaje-card">
          <h3>💬 Mensaje de Bienvenida</h3>
          <textarea
            className="personalizacion-textarea"
            value={config.mensajeBienvenida}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                mensajeBienvenida: e.target.value,
              }))
            }
            placeholder="Escribe un mensaje de bienvenida que se mostrará en toda la aplicación..."
            rows={3}
          />
          <div style={{ marginTop: "10px" }}>
            <button
              className="btn-editar-mensaje"
              onClick={abrirEditorMensaje}
              disabled={!config.mensajeBienvenida}
            >
              ✏️ Editar Tamaño y Posición
            </button>
          </div>
          <p className="personalizacion-hint" style={{ marginTop: "10px" }}>
            Este mensaje aparecerá en la parte superior de todas las pantallas
          </p>
        </div>

        {/* Modal Editor de Mensaje */}
        {mostrandoEditorMensaje && (
          <div className="editor-mensaje-overlay" onClick={cancelarEditorMensaje}>
            <div className="editor-mensaje-modal" onClick={(e) => e.stopPropagation()}>
              <div className="editor-mensaje-header">
                <h3>✏️ Editar Mensaje de Bienvenida</h3>
                <button className="cerrar-editor" onClick={cancelarEditorMensaje}>✕</button>
              </div>
              
              <div className="editor-mensaje-content">
                <div className="editor-mensaje-info">
                  <p>💡 Ajusta los controles y observa cómo cambia el recuadro en la aplicación</p>
                  <button 
                    className="btn-ir-recadro"
                    onClick={() => {
                      const mensajeEl = document.getElementById('mensaje-bienvenida-editable');
                      if (mensajeEl) {
                        mensajeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        mensajeEl.style.outline = '4px solid rgba(59, 130, 246, 0.8)';
                        mensajeEl.style.outlineOffset = '6px';
                        mensajeEl.style.boxShadow = '0 0 20px rgba(59, 130, 246, 0.5), 0 0 40px rgba(59, 130, 246, 0.3)';
                        setTimeout(() => {
                          mensajeEl.style.outline = '';
                          mensajeEl.style.outlineOffset = '';
                          mensajeEl.style.boxShadow = '';
                        }, 2000);
                      }
                    }}
                  >
                    📍 Ir al Recuadro
                  </button>
                </div>

                {/* Tamaño de Fuente */}
                <div className="control-group">
                  <label>
                    Tamaño de Fuente: {configTemporalMensaje?.mensajeBienvenidaTamañoFuente || config.mensajeBienvenidaTamañoFuente || 0.7}rem
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={configTemporalMensaje?.mensajeBienvenidaTamañoFuente || config.mensajeBienvenidaTamañoFuente || 0.7}
                    onChange={(e) =>
                      actualizarConfigTemporal({ mensajeBienvenidaTamañoFuente: parseFloat(e.target.value) })
                    }
                  />
                  <div className="control-buttons">
                    <button
                      className="btn-control-small"
                      onClick={() =>
                        actualizarConfigTemporal({ 
                          mensajeBienvenidaTamañoFuente: Math.max(0.5, (configTemporalMensaje?.mensajeBienvenidaTamañoFuente || config.mensajeBienvenidaTamañoFuente || 0.7) - 0.1)
                        })
                      }
                    >
                      -0.1rem
                    </button>
                    <button
                      className="btn-control-small"
                      onClick={() =>
                        actualizarConfigTemporal({ 
                          mensajeBienvenidaTamañoFuente: Math.min(2, (configTemporalMensaje?.mensajeBienvenidaTamañoFuente || config.mensajeBienvenidaTamañoFuente || 0.7) + 0.1)
                        })
                      }
                    >
                      +0.1rem
                    </button>
                  </div>
                </div>

                {/* Ancho */}
                <div className="control-group">
                  <label>
                    Ancho: {typeof (configTemporalMensaje?.mensajeBienvenidaAncho ?? config.mensajeBienvenidaAncho) === 'number' 
                      ? `${configTemporalMensaje?.mensajeBienvenidaAncho ?? config.mensajeBienvenidaAncho ?? 500}px` 
                      : (configTemporalMensaje?.mensajeBienvenidaAncho ?? config.mensajeBienvenidaAncho)}
                  </label>
                  <input
                    type="range"
                    min="200"
                    max="1200"
                    step="10"
                    value={typeof (configTemporalMensaje?.mensajeBienvenidaAncho ?? config.mensajeBienvenidaAncho) === 'number' 
                      ? (configTemporalMensaje?.mensajeBienvenidaAncho ?? config.mensajeBienvenidaAncho ?? 500) 
                      : 500}
                    onChange={(e) =>
                      actualizarConfigTemporal({ mensajeBienvenidaAncho: parseInt(e.target.value) })
                    }
                  />
                  <div className="control-buttons">
                    <button
                      className="btn-control-small"
                      onClick={() =>
                        actualizarConfigTemporal({ 
                          mensajeBienvenidaAncho: Math.max(200, ((configTemporalMensaje?.mensajeBienvenidaAncho ?? config.mensajeBienvenidaAncho ?? 500) - 10))
                        })
                      }
                    >
                      -10px
                    </button>
                    <button
                      className="btn-control-small"
                      onClick={() =>
                        actualizarConfigTemporal({ 
                          mensajeBienvenidaAncho: Math.min(1200, ((configTemporalMensaje?.mensajeBienvenidaAncho ?? config.mensajeBienvenidaAncho ?? 500) + 10))
                        })
                      }
                    >
                      +10px
                    </button>
                  </div>
                </div>

                {/* Alto */}
                <div className="control-group">
                  <label>
                    Alto: {(configTemporalMensaje?.mensajeBienvenidaAlto ?? config.mensajeBienvenidaAlto) === "auto" 
                      ? "Automático" 
                      : typeof (configTemporalMensaje?.mensajeBienvenidaAlto ?? config.mensajeBienvenidaAlto) === 'number'
                      ? `${configTemporalMensaje?.mensajeBienvenidaAlto ?? config.mensajeBienvenidaAlto}px`
                      : (configTemporalMensaje?.mensajeBienvenidaAlto ?? config.mensajeBienvenidaAlto)}
                  </label>
                  <input
                    type="range"
                    min="30"
                    max="500"
                    step="10"
                    value={(configTemporalMensaje?.mensajeBienvenidaAlto ?? config.mensajeBienvenidaAlto) === "auto" 
                      ? 100 
                      : (typeof (configTemporalMensaje?.mensajeBienvenidaAlto ?? config.mensajeBienvenidaAlto) === 'number' 
                        ? (configTemporalMensaje?.mensajeBienvenidaAlto ?? config.mensajeBienvenidaAlto) 
                        : 100)}
                    onChange={(e) =>
                      actualizarConfigTemporal({ mensajeBienvenidaAlto: parseInt(e.target.value) })
                    }
                  />
                  <div className="control-buttons">
                    <button
                      className="btn-control-small"
                      onClick={() => {
                        const altoActual = configTemporalMensaje?.mensajeBienvenidaAlto ?? config.mensajeBienvenidaAlto;
                        const nuevoAlto = altoActual === "auto" ? 100 : Math.max(30, (typeof altoActual === 'number' ? altoActual : 100) - 10);
                        actualizarConfigTemporal({ mensajeBienvenidaAlto: nuevoAlto });
                      }}
                    >
                      -10px
                    </button>
                    <button
                      className="btn-control-small"
                      onClick={() => {
                        const altoActual = configTemporalMensaje?.mensajeBienvenidaAlto ?? config.mensajeBienvenidaAlto;
                        const nuevoAlto = altoActual === "auto" ? 100 : Math.min(500, (typeof altoActual === 'number' ? altoActual : 100) + 10);
                        actualizarConfigTemporal({ mensajeBienvenidaAlto: nuevoAlto });
                      }}
                    >
                      +10px
                    </button>
                    <button
                      className="btn-control-small"
                      onClick={() =>
                        actualizarConfigTemporal({ mensajeBienvenidaAlto: "auto" })
                      }
                    >
                      Auto
                    </button>
                  </div>
                </div>

                {/* Posición X */}
                <div className="control-group">
                  <label>
                    Posición Horizontal (X): {configTemporalMensaje?.mensajeBienvenidaPosX ?? config.mensajeBienvenidaPosX ?? 0}px
                    {(configTemporalMensaje?.mensajeBienvenidaPosX ?? config.mensajeBienvenidaPosX ?? 0) > 0 ? " → Derecha" : (configTemporalMensaje?.mensajeBienvenidaPosX ?? config.mensajeBienvenidaPosX ?? 0) < 0 ? " ← Izquierda" : " ↕ Centro"}
                  </label>
                  <input
                    type="range"
                    min="-400"
                    max="400"
                    step="10"
                    value={configTemporalMensaje?.mensajeBienvenidaPosX ?? config.mensajeBienvenidaPosX ?? 0}
                    onChange={(e) =>
                      actualizarConfigTemporal({ mensajeBienvenidaPosX: parseInt(e.target.value) })
                    }
                  />
                  <div className="control-buttons">
                    <button
                      className="btn-control-small"
                      onClick={() =>
                        actualizarConfigTemporal({ 
                          mensajeBienvenidaPosX: Math.max(-400, ((configTemporalMensaje?.mensajeBienvenidaPosX ?? config.mensajeBienvenidaPosX ?? 0) - 10))
                        })
                      }
                    >
                      ← -10px
                    </button>
                    <button
                      className="btn-control-small"
                      onClick={() =>
                        actualizarConfigTemporal({ mensajeBienvenidaPosX: 0 })
                      }
                    >
                      ↕ Centro
                    </button>
                    <button
                      className="btn-control-small"
                      onClick={() =>
                        actualizarConfigTemporal({ 
                          mensajeBienvenidaPosX: Math.min(400, ((configTemporalMensaje?.mensajeBienvenidaPosX ?? config.mensajeBienvenidaPosX ?? 0) + 10))
                        })
                      }
                    >
                      +10px →
                    </button>
                  </div>
                </div>

                {/* Posición Y */}
                <div className="control-group">
                  <label>
                    Posición Vertical (Y): {configTemporalMensaje?.mensajeBienvenidaPosY ?? config.mensajeBienvenidaPosY ?? 0}px
                    {(configTemporalMensaje?.mensajeBienvenidaPosY ?? config.mensajeBienvenidaPosY ?? 0) > 0 ? " ↓ Abajo" : (configTemporalMensaje?.mensajeBienvenidaPosY ?? config.mensajeBienvenidaPosY ?? 0) < 0 ? " ↑ Arriba" : " ↔ Centro"}
                  </label>
                  <input
                    type="range"
                    min="-200"
                    max="200"
                    step="10"
                    value={configTemporalMensaje?.mensajeBienvenidaPosY ?? config.mensajeBienvenidaPosY ?? 0}
                    onChange={(e) =>
                      actualizarConfigTemporal({ mensajeBienvenidaPosY: parseInt(e.target.value) })
                    }
                  />
                  <div className="control-buttons">
                    <button
                      className="btn-control-small"
                      onClick={() =>
                        actualizarConfigTemporal({ 
                          mensajeBienvenidaPosY: Math.max(-200, ((configTemporalMensaje?.mensajeBienvenidaPosY ?? config.mensajeBienvenidaPosY ?? 0) - 10))
                        })
                      }
                    >
                      ↑ -10px
                    </button>
                    <button
                      className="btn-control-small"
                      onClick={() =>
                        actualizarConfigTemporal({ mensajeBienvenidaPosY: 0 })
                      }
                    >
                      ↔ Centro
                    </button>
                    <button
                      className="btn-control-small"
                      onClick={() =>
                        actualizarConfigTemporal({ 
                          mensajeBienvenidaPosY: Math.min(200, ((configTemporalMensaje?.mensajeBienvenidaPosY ?? config.mensajeBienvenidaPosY ?? 0) + 10))
                        })
                      }
                    >
                      +10px ↓
                    </button>
                  </div>
                </div>

                {/* Alineación de Texto Horizontal */}
                <div className="control-group">
                  <label>Alineación Horizontal del Texto</label>
                  <div className="control-buttons">
                    <button
                      className={`btn-alineacion ${(configTemporalMensaje?.mensajeBienvenidaAlineacionTexto ?? config.mensajeBienvenidaAlineacionTexto ?? "center") === "left" ? "active" : ""}`}
                      onClick={() =>
                        actualizarConfigTemporal({ mensajeBienvenidaAlineacionTexto: "left" })
                      }
                    >
                      ← Izquierda
                    </button>
                    <button
                      className={`btn-alineacion ${(configTemporalMensaje?.mensajeBienvenidaAlineacionTexto ?? config.mensajeBienvenidaAlineacionTexto ?? "center") === "center" ? "active" : ""}`}
                      onClick={() =>
                        actualizarConfigTemporal({ mensajeBienvenidaAlineacionTexto: "center" })
                      }
                    >
                      ↕ Centro
                    </button>
                    <button
                      className={`btn-alineacion ${(configTemporalMensaje?.mensajeBienvenidaAlineacionTexto ?? config.mensajeBienvenidaAlineacionTexto ?? "center") === "right" ? "active" : ""}`}
                      onClick={() =>
                        actualizarConfigTemporal({ mensajeBienvenidaAlineacionTexto: "right" })
                      }
                    >
                      Derecha →
                    </button>
                  </div>
                </div>

                {/* Alineación de Texto Vertical */}
                <div className="control-group">
                  <label>Alineación Vertical del Texto</label>
                  <div className="control-buttons">
                    <button
                      className={`btn-alineacion ${(configTemporalMensaje?.mensajeBienvenidaAlineacionVertical ?? config.mensajeBienvenidaAlineacionVertical ?? "center") === "flex-start" ? "active" : ""}`}
                      onClick={() =>
                        actualizarConfigTemporal({ mensajeBienvenidaAlineacionVertical: "flex-start" })
                      }
                    >
                      ↑ Arriba
                    </button>
                    <button
                      className={`btn-alineacion ${(configTemporalMensaje?.mensajeBienvenidaAlineacionVertical ?? config.mensajeBienvenidaAlineacionVertical ?? "center") === "center" ? "active" : ""}`}
                      onClick={() =>
                        actualizarConfigTemporal({ mensajeBienvenidaAlineacionVertical: "center" })
                      }
                    >
                      ↔ Centro
                    </button>
                    <button
                      className={`btn-alineacion ${(configTemporalMensaje?.mensajeBienvenidaAlineacionVertical ?? config.mensajeBienvenidaAlineacionVertical ?? "center") === "flex-end" ? "active" : ""}`}
                      onClick={() =>
                        actualizarConfigTemporal({ mensajeBienvenidaAlineacionVertical: "flex-end" })
                      }
                    >
                      ↓ Abajo
                    </button>
                  </div>
                </div>
              </div>

              <div className="editor-mensaje-footer">
                <button
                  className="btn-guardar-editor"
                  onClick={async () => {
                    // Guardar la configuración actual (que ya está aplicada en tiempo real)
                    await guardarConfiguracion();
                    setConfigOriginalMensaje(null);
                    setConfigTemporalMensaje(null);
                    setMostrandoEditorMensaje(false);
                  }}
                  disabled={loading}
                >
                  {loading ? "💾 Guardando..." : "💾 Guardar y Cerrar"}
                </button>
                <button
                  className="btn-cerrar-editor"
                  onClick={cancelarEditorMensaje}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* NOMBRE DE LA APP */}
        <div className="personalizacion-card nombre-app-card">
          <h3>📱 Nombre de la Aplicación</h3>
          <div className="nombre-app-input-wrapper">
            <input
              type="text"
              className="personalizacion-input nombre-app-input"
              value={config.nombreApp}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, nombreApp: e.target.value }))
              }
              placeholder="Nombre de la aplicación"
            />
          </div>
        </div>

        {/* TEMA */}
        <div className="personalizacion-card tema-card">
          <div className="tema-header-row">
            <h3>🎨 Tema</h3>
            <button
              className="tema-toggle"
              onClick={() => setMostrarTemas((v) => !v)}
              title={mostrarTemas ? "Ocultar temas" : "Mostrar temas"}
            >
              {mostrarTemas ? "▲" : "▼"}
            </button>
          </div>
          <p className="personalizacion-hint tema-descripcion">
            Selecciona un tema para cambiar completamente el diseño de colores de la aplicación
          </p>
          {mostrarTemas && (() => {
            const TEMAS_POR_PAGINA = 6;
            const entries = Object.entries(temas);
            const totalPaginas = Math.max(1, Math.ceil(entries.length / TEMAS_POR_PAGINA));
            const pagina = Math.min(paginaTemas, totalPaginas - 1);
            const slice = entries.slice(pagina * TEMAS_POR_PAGINA, (pagina + 1) * TEMAS_POR_PAGINA);
            const cambiarPagina = (dir) => {
              setPaginaTemas((p) => {
                const next = p + dir;
                if (next < 0) return 0;
                if (next >= totalPaginas) return totalPaginas - 1;
                return next;
              });
            };

            return (
              <>
                <div className="temas-grid">
                  {slice.map(([key, tema]) => (
              <div
                key={key}
                className={`tema-option ${temaActual === key ? "tema-activo" : ""}`}
                onClick={async () => {
                  // Aplicar tema inmediatamente
                  aplicarTema(key);
                  setTemaActual(key);
                  
                  // Actualizar colores del tema en el config
                  const temaSeleccionado = temas[key];
                  if (temaSeleccionado) {
                    setConfig((prev) => ({
                      ...prev,
                      colorPrimario: temaSeleccionado.colores["--azul-primario"],
                      colorSecundario: temaSeleccionado.colores["--azul-secundario"],
                      colorFondoPrincipal: temaSeleccionado.colores["--fondo-principal"],
                      tema: key,
                    }));
                  }
                  
                  // Guardar inmediatamente en el servidor
                  try {
                    const temaSeleccionado = temas[key];
                    
                    // Extraer color del gradiente si es necesario
                    let colorFondo = temaSeleccionado?.colores["--fondo-principal"] || config.colorFondoPrincipal || "#15192e";
                    // Si es un gradiente, extraer el primer color o usar un color por defecto
                    if (typeof colorFondo === "string" && colorFondo.startsWith("linear-gradient")) {
                      // Intentar extraer el primer color del gradiente
                      const match = colorFondo.match(/#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}/);
                      colorFondo = match ? match[0] : "#15192e";
                    }
                    
                    // Preparar datos asegurando que todos los valores sean válidos y seguros
                    // Limpiar y validar cada campo antes de enviarlo
                    const limpiarString = (str) => {
                      if (!str || typeof str !== "string") return "";
                      // Remover caracteres peligrosos pero mantener valores válidos
                      return str.trim();
                    };
                    
                    const datosParaEnviar = {
                      mensajeBienvenida: limpiarString(config.mensajeBienvenida),
                      mensajeBienvenidaAncho: Number(config.mensajeBienvenidaAncho) || 500,
                      mensajeBienvenidaAlto: limpiarString(config.mensajeBienvenidaAlto || "auto"),
                      mensajeBienvenidaPosX: Number(config.mensajeBienvenidaPosX) || 0,
                      mensajeBienvenidaPosY: Number(config.mensajeBienvenidaPosY) || 0,
                      mensajeBienvenidaTamañoFuente: Number(config.mensajeBienvenidaTamañoFuente) || 0.7,
                      mensajeBienvenidaAlineacionTexto: limpiarString(config.mensajeBienvenidaAlineacionTexto || "center"),
                      mensajeBienvenidaAlineacionVertical: limpiarString(config.mensajeBienvenidaAlineacionVertical || "center"),
                      fondoTransparencia: Number(config.fondoTransparencia) || 0.3,
                      fondoTipo: limpiarString(config.fondoTipo || "imagen"),
                      colorPrimario: limpiarString(temaSeleccionado?.colores["--azul-primario"] || config.colorPrimario || "#3b82f6"),
                      colorSecundario: limpiarString(temaSeleccionado?.colores["--azul-secundario"] || config.colorSecundario || "#1e40af"),
                      colorFondoPrincipal: limpiarString(colorFondo),
                      nombreApp: limpiarString(config.nombreApp || "IXORA"),
                      nombre_tienda: limpiarString(config.nombre_tienda || "Nuestra Tienda"),
                      tema: limpiarString(key),
                    };
                    
                    // Solo agregar logoTipo y faviconTipo si tienen valores válidos
                    if (config.logoTipo && typeof config.logoTipo === "string") {
                      datosParaEnviar.logoTipo = limpiarString(config.logoTipo);
                    }
                    if (config.faviconTipo && typeof config.faviconTipo === "string") {
                      datosParaEnviar.faviconTipo = limpiarString(config.faviconTipo);
                    }
                    
                    // Enviar solo los campos que el servidor espera
                    await authFetch(`${serverUrl}/admin/personalizacion`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify(datosParaEnviar),
                    });
                    
                    // Guardar en localStorage como tema global
                    localStorage.setItem("tema-actual", key);
                    
                    // Disparar evento para que todos los componentes se actualicen con el tema global
                    window.dispatchEvent(new CustomEvent('tema-global-actualizado', { detail: key }));
                    
                    pushToast(`✅ Tema "${tema.nombre}" aplicado correctamente para todos los usuarios`, "ok");
                  } catch (err) {
                    console.error("Error guardando tema:", err);
                    // Mostrar detalles del error si están disponibles
                    const errorMsg = err.message || "Error desconocido";
                    pushToast(`⚠️ Tema aplicado, pero error al guardar: ${errorMsg}`, "err");
                  }
                }}
              >
                <div className="tema-preview">
                  <div 
                    className="tema-preview-color" 
                    style={{ 
                      background: `linear-gradient(135deg, ${tema.colores["--azul-primario"]}, ${tema.colores["--azul-secundario"]})`,
                      borderColor: tema.colores["--borde-visible"]
                    }}
                  />
                  <div 
                    className="tema-preview-fondo" 
                    style={{ backgroundColor: tema.colores["--fondo-card"] }}
                  />
                  <div 
                    className="tema-preview-texto" 
                    style={{ 
                      color: tema.colores["--texto-principal"],
                      backgroundColor: tema.colores["--fondo-card"]
                    }}
                  >
                    Aa
                  </div>
                </div>
                <div className="tema-info">
                  <h4>{tema.nombre}</h4>
                  <p>{tema.descripcion}</p>
                </div>
                {temaActual === key && (
                  <div className="tema-check">
                    ✓
                  </div>
                )}
              </div>
            ))}
                </div>
                <div className="tema-paginador">
                  <button onClick={() => cambiarPagina(-1)} disabled={pagina === 0}>⬅</button>
                  <span>{pagina + 1} / {totalPaginas}</span>
                  <button onClick={() => cambiarPagina(1)} disabled={pagina >= totalPaginas - 1}>➡</button>
                </div>
              </>
            );
          })()}
        </div>

        {/* COLORES */}
        <div className="personalizacion-card colores-card">
          <h3>🎨 Colores</h3>
          <div className="personalizacion-colores">
            <div className="personalizacion-color-input">
              <label>Color Primario</label>
              <div className="color-picker-wrapper">
                <input
                  type="color"
                  value={config.colorPrimario}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      colorPrimario: e.target.value,
                    }))
                  }
                />
                <input
                  type="text"
                  value={config.colorPrimario}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      colorPrimario: e.target.value,
                    }))
                  }
                  className="color-text-input"
                />
              </div>
            </div>
            <div className="personalizacion-color-input">
              <label>Color Secundario</label>
              <div className="color-picker-wrapper">
                <input
                  type="color"
                  value={config.colorSecundario}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      colorSecundario: e.target.value,
                    }))
                  }
                />
                <input
                  type="text"
                  value={config.colorSecundario}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      colorSecundario: e.target.value,
                    }))
                  }
                  className="color-text-input"
                />
              </div>
            </div>
            <div className="personalizacion-color-input">
              <label>Color de Fondo Principal</label>
              <div className="color-picker-wrapper">
                <input
                  type="color"
                  value={config.colorFondoPrincipal}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      colorFondoPrincipal: e.target.value,
                    }))
                  }
                />
                <input
                  type="text"
                  value={config.colorFondoPrincipal}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      colorFondoPrincipal: e.target.value,
                    }))
                  }
                  className="color-text-input"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {pestañaActivaPersonalizacion === "general" && (
        <div className="personalizacion-actions">
          <button
            className="btn-guardar"
            onClick={guardarConfiguracion}
            disabled={loading}
          >
            {loading ? "💾 Guardando..." : "💾 Guardar Cambios"}
          </button>
        </div>
      )}

      {pestañaActivaPersonalizacion === "tienda" && (
        <div className="personalizacion-tienda">
          {/* Nombre de la Tienda */}
          <div className="personalizacion-card">
            <h3>🏷️ Información General</h3>
            <div className="personalizacion-input-group">
              <label>Nombre de la Tienda</label>
              <input
                type="text"
                value={config.nombre_tienda || "Nuestra Tienda"}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, nombre_tienda: e.target.value }))
                }
                placeholder="Nombre de la tienda"
                className="personalizacion-input"
              />
              <p className="personalizacion-hint">
                Este nombre se mostrará en la página de la tienda.
              </p>
            </div>
          </div>

          {/* Favicon de la Tienda */}
          <div className="personalizacion-card">
            <h3>🎯 Favicon de la Tienda</h3>
            <p className="personalizacion-hint">
              El favicon se mostrará en la pestaña del navegador cuando los usuarios visiten la tienda.
            </p>
            <div className="personalizacion-upload">
              {previewFaviconTienda && (
                <div className="personalizacion-preview">
                  <img src={previewFaviconTienda} alt="Favicon preview" style={{ maxWidth: "64px", maxHeight: "64px" }} />
                </div>
              )}
              <input
                type="file"
                id="favicon-tienda-upload"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    subirFaviconTienda(file);
                    e.target.value = "";
                  }
                }}
                style={{ display: "none" }}
              />
              <button
                className="btn-upload"
                onClick={() => document.getElementById("favicon-tienda-upload")?.click()}
              >
                📤 Subir Favicon
              </button>
              {previewFaviconTienda && (
                <button
                  className="btn-eliminar"
                  onClick={eliminarFaviconTienda}
                  style={{ marginLeft: "10px" }}
                >
                  🗑️ Eliminar Favicon
                </button>
              )}
            </div>
          </div>

          {/* Banners de la Tienda */}
          <div className="personalizacion-card">
            <h3>🛍️ Banners de la Tienda</h3>
            <p className="personalizacion-hint">
              Sube videos, GIFs o imágenes para mostrar en la página de la tienda. Los banners se mostrarán en orden.
            </p>

            <div className="banners-upload-section">
              <input
                type="file"
                id="banner-upload"
                accept="image/*,video/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    subirBannerTienda(file);
                    e.target.value = "";
                  }
                }}
                style={{ display: "none" }}
              />
              <button
                className="btn-upload"
                onClick={() => document.getElementById("banner-upload")?.click()}
              >
                📤 Subir Banner
              </button>
            </div>

            {cargandoBanners ? (
              <div className="banners-loading">Cargando banners...</div>
            ) : bannersTienda.length === 0 ? (
              <div className="banners-empty">
                <p>No hay banners subidos aún. Sube tu primer banner para comenzar.</p>
              </div>
            ) : (
              <div className="banners-grid">
                {bannersTienda.map((banner, index) => (
                  <div key={banner.id || index} className="banner-item">
                    <div className="banner-preview">
                      {banner.tipo === "video" ? (
                        <video
                          src={`${serverUrl}${banner.url}`}
                          controls
                          muted
                          style={{ maxWidth: "100%", maxHeight: "200px" }}
                        />
                      ) : (
                        <img
                          src={`${serverUrl}${banner.url}`}
                          alt={`Banner ${index + 1}`}
                          style={{ maxWidth: "100%", maxHeight: "200px" }}
                        />
                      )}
                    </div>
                    <div className="banner-actions">
                      <button
                        className="btn-eliminar"
                        onClick={() => eliminarBannerTienda(banner.id)}
                      >
                        🗑️ Eliminar
                      </button>
                      <span className="banner-info">
                        {banner.tipo === "video" ? "🎥 Video" : banner.tipo === "gif" ? "🎬 GIF" : "🖼️ Imagen"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fondo de la Tienda */}
          <div className="personalizacion-card">
            <h3>🎨 Fondo de la Tienda</h3>
            <p className="personalizacion-hint">
              Sube una imagen, GIF o video para usar como fondo de la página de la tienda.
            </p>
            <div className="personalizacion-upload">
              {config.tienda_fondo && (
                <div className="personalizacion-preview">
                  {config.tienda_fondo_tipo === "video" ? (
                    <video src={config.tienda_fondo} controls muted style={{ maxWidth: "200px", maxHeight: "200px" }} />
                  ) : (
                    <img src={config.tienda_fondo} alt="Fondo preview" style={{ maxWidth: "200px", maxHeight: "200px" }} />
                  )}
                </div>
              )}
              <input
                type="file"
                id="fondo-tienda-upload"
                accept="image/*,video/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const esVideo = file.type.startsWith("video/");
                    const esGif = file.type === "image/gif";
                    const tipoFondo = esVideo ? "video" : esGif ? "gif" : "imagen";
                    setConfig((prev) => ({ ...prev, tienda_fondo_tipo: tipoFondo }));
                    if (esVideo) {
                      const url = URL.createObjectURL(file);
                      setConfig((prev) => ({ ...prev, tienda_fondo: url }));
                    } else {
                      const reader = new FileReader();
                      reader.onload = (e) => setConfig((prev) => ({ ...prev, tienda_fondo: e.target.result }));
                      reader.readAsDataURL(file);
                    }
                    e.target.value = "";
                  }
                }}
                style={{ display: "none" }}
              />
              <button
                className="btn-upload"
                onClick={() => document.getElementById("fondo-tienda-upload")?.click()}
              >
                📤 Subir Fondo
              </button>
            </div>
          </div>

          {/* Colores de la Tienda */}
          <div className="personalizacion-card">
            <h3>🎨 Colores de la Tienda</h3>
            <div className="personalizacion-input-group">
              <label>Color Primario</label>
              <input
                type="color"
                value={config.tienda_color_primario || "#3b82f6"}
                onChange={(e) => setConfig((prev) => ({ ...prev, tienda_color_primario: e.target.value }))}
                className="personalizacion-input"
              />
            </div>
            <div className="personalizacion-input-group">
              <label>Color Secundario</label>
              <input
                type="color"
                value={config.tienda_color_secundario || "#1e40af"}
                onChange={(e) => setConfig((prev) => ({ ...prev, tienda_color_secundario: e.target.value }))}
                className="personalizacion-input"
              />
            </div>
            <div className="personalizacion-input-group">
              <label>Color de Fondo</label>
              <input
                type="color"
                value={config.tienda_color_fondo || "#f8f9fa"}
                onChange={(e) => setConfig((prev) => ({ ...prev, tienda_color_fondo: e.target.value }))}
                className="personalizacion-input"
              />
            </div>
          </div>

          {/* Información de Contacto */}
          <div className="personalizacion-card">
            <h3>📞 Información de Contacto</h3>
            <div className="personalizacion-input-group">
              <label>Descripción de la Tienda</label>
              <textarea
                value={config.tienda_descripcion || ""}
                onChange={(e) => setConfig((prev) => ({ ...prev, tienda_descripcion: e.target.value }))}
                placeholder="Descripción breve de tu tienda"
                className="personalizacion-input"
                rows="3"
              />
            </div>
            <div className="personalizacion-input-group">
              <label>Teléfono</label>
              <input
                type="text"
                value={config.tienda_telefono || ""}
                onChange={(e) => setConfig((prev) => ({ ...prev, tienda_telefono: e.target.value }))}
                placeholder="Teléfono de contacto"
                className="personalizacion-input"
              />
            </div>
            <div className="personalizacion-input-group">
              <label>Email</label>
              <input
                type="email"
                value={config.tienda_email || ""}
                onChange={(e) => setConfig((prev) => ({ ...prev, tienda_email: e.target.value }))}
                placeholder="Email de contacto"
                className="personalizacion-input"
              />
            </div>
            <div className="personalizacion-input-group">
              <label>Dirección</label>
              <textarea
                value={config.tienda_direccion || ""}
                onChange={(e) => setConfig((prev) => ({ ...prev, tienda_direccion: e.target.value }))}
                placeholder="Dirección física de la tienda"
                className="personalizacion-input"
                rows="2"
              />
            </div>
          </div>

          {/* Redes Sociales */}
          <div className="personalizacion-card">
            <h3>🌐 Redes Sociales</h3>
            <div className="personalizacion-input-group">
              <label>Facebook</label>
              <input
                type="url"
                value={config.tienda_redes_sociales?.facebook || ""}
                onChange={(e) => setConfig((prev) => ({
                  ...prev,
                  tienda_redes_sociales: { ...prev.tienda_redes_sociales, facebook: e.target.value }
                }))}
                placeholder="https://facebook.com/tu-tienda"
                className="personalizacion-input"
              />
            </div>
            <div className="personalizacion-input-group">
              <label>Instagram</label>
              <input
                type="url"
                value={config.tienda_redes_sociales?.instagram || ""}
                onChange={(e) => setConfig((prev) => ({
                  ...prev,
                  tienda_redes_sociales: { ...prev.tienda_redes_sociales, instagram: e.target.value }
                }))}
                placeholder="https://instagram.com/tu-tienda"
                className="personalizacion-input"
              />
            </div>
            <div className="personalizacion-input-group">
              <label>Twitter/X</label>
              <input
                type="url"
                value={config.tienda_redes_sociales?.twitter || ""}
                onChange={(e) => setConfig((prev) => ({
                  ...prev,
                  tienda_redes_sociales: { ...prev.tienda_redes_sociales, twitter: e.target.value }
                }))}
                placeholder="https://twitter.com/tu-tienda"
                className="personalizacion-input"
              />
            </div>
            <div className="personalizacion-input-group">
              <label>WhatsApp</label>
              <input
                type="text"
                value={config.tienda_redes_sociales?.whatsapp || ""}
                onChange={(e) => setConfig((prev) => ({
                  ...prev,
                  tienda_redes_sociales: { ...prev.tienda_redes_sociales, whatsapp: e.target.value }
                }))}
                placeholder="Número de WhatsApp (ej: 2221234567)"
                className="personalizacion-input"
              />
            </div>
          </div>
        </div>
      )}

      {pestañaActivaPersonalizacion === "tienda" && (
        <div className="personalizacion-actions">
          <button
            className="btn-guardar"
            onClick={async () => {
              try {
                setLoading(true);
                await authFetch(`${serverUrl}/admin/personalizacion`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    nombre_tienda: config.nombre_tienda,
                    tienda_color_primario: config.tienda_color_primario,
                    tienda_color_secundario: config.tienda_color_secundario,
                    tienda_color_fondo: config.tienda_color_fondo,
                    tienda_descripcion: config.tienda_descripcion,
                    tienda_telefono: config.tienda_telefono,
                    tienda_email: config.tienda_email,
                    tienda_direccion: config.tienda_direccion,
                    tienda_redes_sociales: config.tienda_redes_sociales,
                  }),
                });
                pushToast("✅ Configuración de la tienda guardada correctamente", "ok");
              } catch (err) {
                console.error("Error guardando configuración de tienda:", err);
                pushToast(`❌ Error: ${err.message}`, "err");
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
          >
            {loading ? "💾 Guardando..." : "💾 Guardar Cambios"}
          </button>
        </div>
      )}
    </div>
  );
}

