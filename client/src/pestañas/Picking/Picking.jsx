import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import "./Picking.css";
import { useAuth } from "../../AuthContext";
import { safeFocus, puedeHacerFocus } from "../../utils/focusHelper";
import { useAlert } from "../../components/AlertModal";
import { useVoiceRecognition } from "../../hooks/useVoiceRecognition";

export default function Picking({
  SERVER_URL,
  fecha,
  cargarProductos,
  pushToast,
  cambiarModulo,
  canal,
  titulo,
  mostrarBusquedaNombre,
  moduloRegistros
}) {
  const { authFetch } = useAuth();
  const { showAlert, showConfirm } = useAlert();
  const canalActual = (canal || "picking").toString().trim().toLowerCase();
  
  // Función helper para evitar duplicar la presentación si ya está en el nombre
  const obtenerNombreCompleto = (nombre, presentacion) => {
    if (!nombre) return "";
    if (!presentacion || !presentacion.trim()) return nombre;
    
    const nombreTrim = nombre.trim();
    const presentacionTrim = presentacion.trim();
    
    // Verificar si el nombre ya termina con la presentación (con o sin guión)
    const nombreLower = nombreTrim.toLowerCase();
    const presentacionLower = presentacionTrim.toLowerCase();
    
    // Verificar si el nombre ya contiene la presentación al final
    if (nombreLower.endsWith(presentacionLower) || 
        nombreLower.endsWith(` - ${presentacionLower}`) ||
        nombreLower.endsWith(`- ${presentacionLower}`)) {
      return nombreTrim; // Ya contiene la presentación, no agregar
    }
    
    // Si el nombre contiene " - " pero no termina con la presentación, limpiar duplicados
    if (nombreTrim.includes(" - ")) {
      // Extraer solo el nombre base (antes del primer " - ")
      const nombreBase = nombreTrim.split(" - ")[0].trim();
      // Verificar si el nombre base ya termina con la presentación
      if (nombreBase.toLowerCase().endsWith(presentacionLower)) {
        return nombreBase; // Ya tiene la presentación, no agregar
      }
      // Agregar la presentación solo una vez
      return `${nombreBase} - ${presentacionTrim}`;
    }
    
    // Si no la contiene, agregarla
    return `${nombreTrim} - ${presentacionTrim}`;
  };
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [presentacion, setPresentacion] = useState("");
  const [cajas, setCajas] = useState(0);
  const [pxc, setPXC] = useState("");
  const [mensaje, setMensaje] = useState("");

  // Estados para autocompletado de nombre
  const [sugerenciasNombre, setSugerenciasNombre] = useState([]);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const [buscandoNombre, setBuscandoNombre] = useState(false);
  const busquedaNombreTimeoutRef = useRef(null);
  const nombreInputRef = useRef(null);
  const sugerenciasRef = useRef(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

  // Modal duplicado — ahora incluye PXC y estado de surtido
  const [modalDuplicado, setModalDuplicado] = useState({
    open: false,
    codigo: "",
    nombre: "",
    cajas: "",
    pxc: "",
    mensajeExtra: "",
    esSurtido: false // true = surtido (bloquear), false = no surtido (permitir)
  });


  // Modal productos agotados
  const [modalAgotadosOpen, setModalAgotadosOpen] = useState(false);
  const [productosAgotados, setProductosAgotados] = useState([]);
  const [cargandoAgotados, setCargandoAgotados] = useState(false);

  // Protección contra procesamiento simultáneo
  const procesandoRef = useRef(false);
  const ultimoGuardadoRef = useRef({ codigo: "", timestamp: 0 });
  
  // Refs para auto-guardado (evitar problemas con closures)
  const ultimoCodigoRef = useRef("");
  const nombreRef = useRef("");
  const presentacionRef = useRef("");
  const cajasRef = useRef(0);
  const pxcRef = useRef("");
  
  // Cache de validaciones para evitar llamadas repetidas
  const validacionCacheRef = useRef(new Map());
  
  // Cache de productos para mostrar nombre inmediatamente
  const productosCacheRef = useRef(new Map());

  // Ref para controlar si el usuario está interactuando manualmente
  const usuarioInteractuandoRef = useRef(false);

  /* ========================================================
     FOCO AL ENTRAR A LA PESTAÑA (solo una vez al montar)
     Y QUITAR SCROLL EN PDA
  ======================================================== */
  useEffect(() => {
    const el = document.getElementById("inputCodigo");
    if (el && puedeHacerFocus()) {
      setTimeout(() => {
        if (!usuarioInteractuandoRef.current) {
          safeFocus(el, 0);
        }
      }, 200);
    }
    
    // En Android nativo, asegurar que el input esté siempre listo para recibir escaneos
    const isAndroidNative = typeof window !== 'undefined' && 
      window.Capacitor && 
      window.Capacitor.isNativePlatform && 
      window.Capacitor.isNativePlatform() &&
      window.Capacitor.getPlatform() === 'android';
    
    if (isAndroidNative && el) {
      // Enfocar el input cada vez que se monte el componente (para DataWedge)
      const focusInterval = setInterval(() => {
        if (el && document.activeElement !== el && !usuarioInteractuandoRef.current) {
          safeFocus(el, 0);
        }
      }, 1000); // Verificar cada segundo
      
      return () => {
        clearInterval(focusInterval);
      };
    }
    
    // Quitar scroll en PDA
    const isPDA = window.innerWidth <= 768;
    if (isPDA) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }
    
    return () => {
      // Restaurar scroll al salir
      if (isPDA) {
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
      }
    };
  }, []);

  /* ========================================================
   PDA: Solo forzar foco dentro del componente Picking
   cuando realmente se está escaneando (no cuando el usuario hace click manual)
  ======================================================== */
  useEffect(() => {
    const container = document.querySelector('.picking-container');
    if (!container) return;

    const handleMouseDown = (e) => {
      // Si el usuario hace click en cualquier input/textarea editable fuera del inputCodigo
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.target.id !== 'inputCodigo' && !e.target.readOnly) {
          usuarioInteractuandoRef.current = true;
          // Reset después de 3 segundos de inactividad
          setTimeout(() => {
            usuarioInteractuandoRef.current = false;
          }, 3000);
        }
      }
    };

    const handleKeyDown = (e) => {
      // Solo procesar si estamos dentro del componente Picking
      if (!container.contains(e.target) && e.target !== container) {
        return;
      }

      const activeEl = document.activeElement;
      
      // Verificar si hay modales abiertos (cualquier modal visible, no solo en Picking)
      const modales = document.querySelectorAll('.modal-overlay, .modal-overlay-picking, .devModalFondo, .modal-content, [class*="modal"]');
      const hayModalAbierto = Array.from(modales).some(modal => {
        const style = window.getComputedStyle(modal);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      });
      
      if (hayModalAbierto) {
        return; // No interferir si hay cualquier modal abierto
      }

      // Si el usuario está escribiendo en otro input editable, no interferir
      const esInputActivo = activeEl && (
        (activeEl.tagName === 'INPUT' && activeEl.id !== 'inputCodigo' && !activeEl.readOnly) ||
        (activeEl.tagName === 'TEXTAREA' && !activeEl.readOnly)
      );

      // Si el elemento activo está dentro de un modal (aunque no esté visible en el selector)
      const estaEnModal = activeEl?.closest('.modal-overlay, .modal-overlay-picking, .modal-content, [class*="modal"]');
      if (estaEnModal) {
        return; // No interferir si está dentro de cualquier modal
      }

      if (esInputActivo || usuarioInteractuandoRef.current) {
        return;
      }

      // Solo forzar foco si es una tecla de carácter (probable escaneo rápido)
      // y estamos dentro del componente Picking
      const esTeclaEscaneo = e.key.length === 1 && 
                            !e.ctrlKey && !e.metaKey && !e.altKey &&
                            container.contains(activeEl);
      
      if (esTeclaEscaneo && activeEl?.id !== 'inputCodigo') {
        const el = document.getElementById("inputCodigo");
        if (el && puedeHacerFocus() && container.contains(el)) {
          safeFocus(el, 0);
        }
      }
    };

    container.addEventListener("mousedown", handleMouseDown);
    container.addEventListener("keydown", handleKeyDown);
    
    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
      container.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  /* ========================================================
     SOCKETS
  ======================================================== */
  useEffect(() => {
    const socket = window.socket;

    const handleProductos = () => {
      if (typeof cargarProductos === "function") cargarProductos();
    };

    const handleCierre = () => {
      if (typeof cargarProductos === "function") cargarProductos();
      if (typeof pushToast === "function")
        pushToast("📅 Día cerrado (actualizado en tiempo real)", "ok");
    };

    const handlePickingActualizado = () => {
      if (typeof cargarProductos === "function") cargarProductos();
    };

    socket.on("productos_actualizados", handleProductos);
    socket.on("picking_actualizado", handlePickingActualizado);
    socket.on("cerrar_dia", handleCierre);

    return () => {
      socket.off("productos_actualizados", handleProductos);
      socket.off("picking_actualizado", handlePickingActualizado);
      socket.off("cerrar_dia", handleCierre);
    };
  }, [SERVER_URL, cargarProductos, pushToast]);

  /* ========================================================
     LIMPIEZA DE TIMEOUTS AL DESMONTAR
  ======================================================== */
  const scanTimeoutRef = useRef(null);
  const autoSaveTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    };
  }, []);

  /* ========================================================
     SONIDOS OPTIMIZADOS (más ligeros para PDA)
     Con soporte para contexto de audio suspendido
     Última actualización: 2024-12-19
  ======================================================== */
  // Contexto de audio global para reutilizar
  const audioContextRef = useRef(null);
  
  // ===== SONIDOS NUEVOS PARA PICKING =====
  // Sonidos más agudos y rápidos, tipo "beep" de escáner
  
  const crearSonidoPicking = (audioCtx, tipo) => {
    try {
      const now = audioCtx.currentTime;
      
      if (tipo === 'success') {
        // Doble beep ascendente alegre (tipo escáner exitoso)
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc1.type = "sine";
        osc2.type = "sine";
        
        // Primer beep: 800Hz -> 1200Hz
        osc1.frequency.setValueAtTime(800, now);
        osc1.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
        
        // Segundo beep: 1000Hz -> 1500Hz (más agudo)
        osc2.frequency.setValueAtTime(1000, now + 0.1);
        osc2.frequency.exponentialRampToValueAtTime(1500, now + 0.18);
        
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.4, now + 0.05);
        gain.gain.linearRampToValueAtTime(0.0001, now + 0.08);
        gain.gain.linearRampToValueAtTime(0.4, now + 0.1);
        gain.gain.linearRampToValueAtTime(0.0001, now + 0.18);
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc1.start(now);
        osc1.stop(now + 0.08);
        osc2.start(now + 0.1);
        osc2.stop(now + 0.18);
        
      } else if (tipo === 'error') {
        // Beep descendente grave (tipo error de escáner)
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(1000, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.2);
        
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.5, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start(now);
        osc.stop(now + 0.2);
        
      } else if (tipo === 'alerta') {
        // Beep medio con vibración (tipo advertencia)
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = "square";
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.setValueAtTime(600, now + 0.1);
        osc.frequency.setValueAtTime(800, now + 0.15);
        
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
        gain.gain.setValueAtTime(0.3, now + 0.1);
        gain.gain.linearRampToValueAtTime(0.4, now + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (err) {
      console.warn("Error creando sonido Picking:", err);
    }
  };

  const sonidoPicking = (tipo) => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      
      let audioCtx = audioContextRef.current;
      if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new AudioContextClass();
        audioContextRef.current = audioCtx;
      }
      
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
          crearSonidoPicking(audioCtx, tipo);
        }).catch(() => {
          crearSonidoPicking(audioCtx, tipo);
        });
        return;
      }
      
      crearSonidoPicking(audioCtx, tipo);
    } catch (err) {
      console.warn("Error reproduciendo sonido Picking:", err);
    }
  };

  const beepError = () => sonidoPicking('error');
  const beepSuccess = () => sonidoPicking('success');
  const beepAlerta = () => sonidoPicking('alerta');

  /* ========================================================
     VALIDACIÓN DE NO SURTIDO (5 MIN) Y DUPLICADOS EN DÍA
     OPTIMIZADA: Cache y validación en paralelo
     REGLAS: 
     - Si existe pero NO está surtido → permitir agregar (modal informativo)
     - Si fue surtido hace menos de 5 min → bloquear
     - Si fue surtido hace más de 5 min → permitir agregar
  ======================================================== */
  // Helper: Calcular minutos desde una hora (HH:mm:ss) hasta ahora
  const calcularMinutosDesdeHora = (hora) => {
    if (!hora) return null;
    try {
      const ahora = new Date();
      const [horas, minutos, segundos] = hora.split(':').map(Number);
      const horaProducto = new Date();
      horaProducto.setHours(horas, minutos, segundos || 0, 0);
      
      // Si la hora del producto es mayor que la hora actual, significa que fue ayer
      if (horaProducto > ahora) {
        horaProducto.setDate(horaProducto.getDate() - 1);
      }
      
      const diffMs = ahora - horaProducto;
      return Math.floor(diffMs / 60000); // Convertir a minutos
    } catch (e) {
      return null;
    }
  };

  const validarDuplicado = async (codigoValidar, nombreP, cajasP) => {
    // Verificar cache primero (válido por 2 segundos)
    const cacheKey = codigoValidar;
    const cached = validacionCacheRef.current.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < 2000) {
      if (!cached.valido) {
        beepError();
        setModalDuplicado({
          open: true,
          codigo: codigoValidar,
          nombre: nombreP,
          cajas: cajasP,
          pxc: pxcRef.current,
          mensajeExtra: cached.mensaje,
          esSurtido: cached.esSurtido
        });
        return false;
      }
      return true;
    }

    try {
      // Obtener información del producto (si existe, hora_solicitud, hora_surtido)
      const existeRes = await authFetch(`${SERVER_URL}/productos/existe/${codigoValidar}?canal=${encodeURIComponent(canalActual)}`).catch(() => ({ 
        existe: false, 
        surtido: false, 
        hora_solicitud: null, 
        hora_surtido: null 
      }));

      if (!existeRes.existe) {
        // No existe, permitir agregar sin alerta
        validacionCacheRef.current.set(cacheKey, { valido: true, timestamp: Date.now() });
        return true;
      }

      // Calcular minutos desde que se agregó (hora_solicitud)
      const minutosDesdeAgregado = calcularMinutosDesdeHora(existeRes.hora_solicitud);
      
      // Calcular minutos desde que se surtió (hora_surtido) si está surtido
      const minutosDesdeSurtido = existeRes.surtido && existeRes.hora_surtido 
        ? calcularMinutosDesdeHora(existeRes.hora_surtido)
        : null;

      // Si fue agregado hace menos de 5 minutos → BLOQUEAR
      if (minutosDesdeAgregado !== null && minutosDesdeAgregado < 5) {
        const mensaje = `🚨 Este producto se agregó hace ${minutosDesdeAgregado} minuto(s).\nDebe esperarse 5 minutos para evitar duplicados.`;
        validacionCacheRef.current.set(cacheKey, { valido: false, mensaje, timestamp: Date.now(), esSurtido: false });
        beepError();
        setModalDuplicado({
          open: true,
          codigo: codigoValidar,
          nombre: nombreP,
          cajas: cajasP,
          pxc: pxcRef.current,
          mensajeExtra: mensaje,
          esSurtido: false
        });
        return false;
      }

      // Si fue surtido hace menos de 5 minutos → BLOQUEAR
      if (minutosDesdeSurtido !== null && minutosDesdeSurtido < 5) {
        const mensaje = `🚨 Este producto se surtió hace ${minutosDesdeSurtido} minuto(s).\nDebe esperarse 5 minutos para evitar duplicados.`;
        validacionCacheRef.current.set(cacheKey, { valido: false, mensaje, timestamp: Date.now(), esSurtido: true });
        beepError();
        setModalDuplicado({
          open: true,
          codigo: codigoValidar,
          nombre: nombreP,
          cajas: cajasP,
          pxc: pxcRef.current,
          mensajeExtra: mensaje,
          esSurtido: true
        });
        return false;
      }

      // Si pasaron más de 5 minutos desde que se agregó Y (no está surtido O pasaron más de 5 minutos desde que se surtió) → permitir agregar sin modal
      validacionCacheRef.current.set(cacheKey, { valido: true, timestamp: Date.now() });
      return true;
    } catch (err) {
      // Si falla la validación, permitir continuar (no bloquear)
      return true;
    }
  };

  /* ========================================================
     GUARDAR AUTOMÁTICO AL CAMBIAR DE PRODUCTO
     OPTIMIZADO: Validación más rápida y menos bloqueos
  ======================================================== */
  const guardarProductoActual = async (codigoP, nombreP, cajasP) => {
    // Usar refs si no se pasan parámetros (para auto-guardado)
    const cod = codigoP || ultimoCodigoRef.current;
    const nom = nombreP || nombreRef.current;
    const pres = presentacionRef.current || "";
    const caj = cajasP !== undefined ? cajasP : cajasRef.current;
    const piezasCaja = pxcRef.current ? parseInt(pxcRef.current) : 0; 
    
    // Validaciones básicas
    if (!cod || !cod.trim()) {
      console.log("⚠️ No se puede guardar: código vacío");
      return;
    }
    
    if (caj <= 0) {
      console.log("⚠️ No se puede guardar: cajas <= 0");
      return;
    }
    
    if (!nom || !nom.trim()) {
      console.log("⚠️ No se puede guardar: nombre vacío");
      return;
    }
    
    // Combinar nombre y presentación
    const nombreCompleto = obtenerNombreCompleto(nom, pres);

    // Evitar guardar el mismo producto múltiples veces en menos de 2 segundos
    const ahora = Date.now();
    if (ultimoGuardadoRef.current.codigo === cod && 
        (ahora - ultimoGuardadoRef.current.timestamp) < 2000) {
      console.log("⚠️ Ya se guardó recientemente, evitando duplicado:", cod);
      return; // Ya se guardó recientemente, evitar duplicado
    }

    // Verificar que no haya modal abierto
    if (modalDuplicado.open) {
      console.log("⚠️ Modal abierto, no se puede guardar");
      return;
    }

    // Validación en paralelo con el guardado (no bloquear)
    const validacionPromise = validarDuplicado(cod, nombreCompleto, caj);
    
    // Limpiar cache antiguo (mantener solo últimos 50)
    if (validacionCacheRef.current.size > 50) {
      const entries = Array.from(validacionCacheRef.current.entries());
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      validacionCacheRef.current.clear();
      entries.slice(0, 50).forEach(([key, value]) => {
        validacionCacheRef.current.set(key, value);
      });
    }

    const ok = await validacionPromise;
    if (!ok) {
      console.log("⚠️ Validación falló, no se guarda");
      return;
    }

    // Verificar nuevamente que el código sigue siendo el mismo (evitar race conditions)
    if (ultimoCodigoRef.current !== cod) {
      console.log("⚠️ Código cambió durante la validación, no se guarda");
      return;
    }

    try {
      console.log("💾 Guardando producto:", { cod, nombreCompleto, cajas: caj });
      
      // Guardar sin esperar respuesta de cargarProductos (más rápido)
      const savePromise = authFetch(`${SERVER_URL}/productos`, {
        method: "POST",
        body: JSON.stringify({
          codigo: cod,
          nombre: nombreCompleto,
          cajas: parseInt(caj),
          piezas_por_caja: piezasCaja,
          canal: canalActual
        })
      });
      
      // Actualizar referencia de último guardado ANTES de guardar (para evitar duplicados)
      ultimoGuardadoRef.current = { codigo: cod, timestamp: ahora };
      
      // Limpiar cache de validación para este código
      validacionCacheRef.current.delete(cod);
      
      await savePromise;
      
      // Cargar productos de forma asíncrona (no bloquear)
      setTimeout(() => {
        if (typeof cargarProductos === "function") cargarProductos();
      }, 50);
      
      pushToast(`${nombreCompleto} agregado (${caj}) ✔`);
      beepSuccess();
    } catch (e) {
      console.error("❌ Error guardando producto:", e);
      
      // Verificar si el error es porque el producto está agotado
      if (e.mensaje === "Agotado" || (e.error && e.error === "Producto agotado")) {
        pushToast("Agotado", "warn");
        beepAlerta();
        setMensaje("Agotado");
        limpiarEstadosCompletamente();
        setTimeout(() => {
          const el = document.getElementById("inputCodigo");
          if (el) safeFocus(el, 0);
        }, 100);
        return;
      }
      
      pushToast("❌ Error al guardar producto", "err");
      beepError();
      return;
    }
  };

  /* ========================================================
     FUNCIÓN DE LIMPIEZA COMPLETA DE ESTADOS
  ======================================================== */
  const limpiarEstadosCompletamente = () => {
    setCodigo("");
    setNombre("");
    setPresentacion("");
    setPXC("");
    setCajas(0);
    setMensaje("");
    
    // Limpiar refs también
    ultimoCodigoRef.current = "";
    nombreRef.current = "";
    presentacionRef.current = "";
    cajasRef.current = 0;
    pxcRef.current = "";
    
    // Cancelar auto-guardado pendiente
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
  };

  /* ========================================================
     BÚSQUEDA POR NOMBRE (autocompletado con sugerencias)
  ======================================================== */
  // Buscar sugerencias mientras se escribe
  useEffect(() => {
    const termino = (nombre || "").trim();
    
    // Limpiar timeout anterior
    if (busquedaNombreTimeoutRef.current) {
      clearTimeout(busquedaNombreTimeoutRef.current);
    }

    // Si el término es muy corto, no buscar
    if (termino.length < 2) {
      setSugerenciasNombre([]);
      setMostrarSugerencias(false);
      return;
    }

    // Si hay un código activo y el nombre coincide con el nombre del producto activo,
    // no mostrar sugerencias (está procesando un escaneo)
    if (ultimoCodigoRef.current && nombreRef.current && nombreRef.current === termino) {
      setSugerenciasNombre([]);
      setMostrarSugerencias(false);
      return;
    }

    // Si se está procesando un escaneo, no buscar sugerencias
    if (procesandoRef.current) {
      setSugerenciasNombre([]);
      setMostrarSugerencias(false);
      return;
    }

    setBuscandoNombre(true);
    
    // Debounce: esperar 300ms después de que el usuario deje de escribir
    busquedaNombreTimeoutRef.current = setTimeout(async () => {
      // Verificar nuevamente antes de buscar (puede haber cambiado el estado)
      if (procesandoRef.current || (ultimoCodigoRef.current && nombreRef.current === termino)) {
        setSugerenciasNombre([]);
        setMostrarSugerencias(false);
        setBuscandoNombre(false);
        return;
      }

      try {
        // Buscar productos (el servidor ya filtra solo CEDIS - inventario_id = 1)
        let data = await authFetch(
          `${SERVER_URL}/inventario/buscar-por-nombre/${encodeURIComponent(termino)}?multiples=true`
        );

        // El servidor ya devuelve solo productos de CEDIS, pero verificamos por seguridad
        let resultadosCEDIS = [];
        
        if (Array.isArray(data)) {
          // Filtrar estrictamente solo CEDIS (por seguridad, aunque el servidor ya lo hace)
          resultadosCEDIS = data.filter(p => {
            const inventarioId = p.inventario_id || p.inventarioId || 1;
            return inventarioId === 1;
          });
        } else if (data && data.codigo) {
          // Si es un solo producto, verificar que sea de CEDIS
          const inventarioId = data.inventario_id || data.inventarioId || 1;
          if (inventarioId === 1) {
            resultadosCEDIS = [data];
          }
        }

        // Verificar una vez más después de la búsqueda
        if (procesandoRef.current || (ultimoCodigoRef.current && nombreRef.current === termino)) {
          setSugerenciasNombre([]);
          setMostrarSugerencias(false);
          setBuscandoNombre(false);
          return;
        }

        // Mostrar SOLO resultados de CEDIS
        if (resultadosCEDIS.length > 0) {
          setSugerenciasNombre(resultadosCEDIS.slice(0, 10));
          setMostrarSugerencias(true);
        } else {
          // No hay resultados en CEDIS, no mostrar nada
          setSugerenciasNombre([]);
          setMostrarSugerencias(false);
        }
      } catch (err) {
        console.error("Error buscando sugerencias:", err);
        setSugerenciasNombre([]);
        setMostrarSugerencias(false);
      } finally {
        setBuscandoNombre(false);
      }
    }, 300);

    return () => {
      if (busquedaNombreTimeoutRef.current) {
        clearTimeout(busquedaNombreTimeoutRef.current);
      }
    };
  }, [nombre, SERVER_URL]);

  // Seleccionar un producto de las sugerencias
  const seleccionarProducto = async (producto) => {
    if (!producto || !producto.codigo) return;

    // Ocultar sugerencias
    setMostrarSugerencias(false);
    setSugerenciasNombre([]);
    
    // Limpiar el input de nombre
    setNombre("");

    // Procesar como si fuera un escaneo
    await procesarScan(producto.codigo);
    beepSuccess();
    
    // Enfocar de vuelta al input de código
    setTimeout(() => {
      const el = document.getElementById("inputCodigo");
      if (el) safeFocus(el, 0);
    }, 100);
  };

  // Calcular posición del dropdown cuando se muestre
  useEffect(() => {
    if (mostrarSugerencias && nombreInputRef.current) {
      const updatePosition = () => {
        if (nombreInputRef.current) {
          const inputRect = nombreInputRef.current.getBoundingClientRect();
          // Hacer el dropdown solo un poco más ancho que el input para que quepa código y presentación
          const anchoDropdown = Math.max(inputRect.width * 1.15, inputRect.width + 50);
          setDropdownPosition({
            top: inputRect.bottom + 4, // Usar getBoundingClientRect que ya incluye scroll
            left: inputRect.left,
            width: anchoDropdown
          });
        }
      };
      
      updatePosition();
      
      // Actualizar posición en scroll y resize
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [mostrarSugerencias, sugerenciasNombre]);

  // Cerrar sugerencias al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        nombreInputRef.current &&
        !nombreInputRef.current.contains(event.target) &&
        sugerenciasRef.current &&
        !sugerenciasRef.current.contains(event.target)
      ) {
        setMostrarSugerencias(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  /* ========================================================
     PROCESAR ESCANEO
  ======================================================== */
  const procesarScan = async (codigoEscaneado) => {
    if (!codigoEscaneado || !codigoEscaneado.trim()) return;

    // Protección contra procesamiento simultáneo
    if (procesandoRef.current) {
      console.log("⚠️ Ya se está procesando un escaneo, ignorando:", codigoEscaneado);
      return;
    }
    procesandoRef.current = true;

    try {
      const codigoLimpio = codigoEscaneado.trim();
      
      // MISMO CÓDIGO → ACUMULAR CAJAS
      if (ultimoCodigoRef.current === codigoLimpio && nombreRef.current) {
        setCajas((prev) => {
          const nuevas = prev + 1;
          cajasRef.current = nuevas;
          beepSuccess();
          // Reiniciar auto-guardado con las nuevas cajas
          iniciarAutoGuardado(codigoLimpio, nombreRef.current, nuevas);
          return nuevas;
        });
        // Limpiar código inmediatamente
        setCodigo("");
        setTimeout(() => {
          const el = document.getElementById("inputCodigo");
          if (el) safeFocus(el, 0);
        }, 50);
        return;
      }

      // DISTINTO CÓDIGO → GUARDAR EL ANTERIOR PRIMERO (solo si hay datos válidos)
      if (ultimoCodigoRef.current && ultimoCodigoRef.current !== codigoLimpio && cajasRef.current > 0 && nombreRef.current) {
        console.log("💾 Guardando producto anterior antes de cambiar:", ultimoCodigoRef.current);
        // Cancelar auto-guardado pendiente del anterior
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
          autoSaveTimeoutRef.current = null;
        }
        // Guardar el anterior inmediatamente
        await guardarProductoActual();
      }

      // Limpiar estados del anterior antes de procesar el nuevo
      limpiarEstadosCompletamente();

      // Ocultar sugerencias cuando se procesa un escaneo
      setMostrarSugerencias(false);
      setSugerenciasNombre([]);

      // Buscar el nuevo producto - OPTIMIZADO: mostrar desde cache inmediatamente
      const cachedProduct = productosCacheRef.current.get(codigoLimpio);
      
      // Mostrar datos del cache inmediatamente si existen
      if (cachedProduct) {
        ultimoCodigoRef.current = codigoLimpio;
        setNombre(cachedProduct.nombre || "");
        nombreRef.current = cachedProduct.nombre || "";
        setPresentacion(cachedProduct.presentacion || "");
        presentacionRef.current = cachedProduct.presentacion || "";
        setPXC(cachedProduct.piezas_por_caja || "");
        pxcRef.current = cachedProduct.piezas_por_caja || "";
        setCajas(1);
        cajasRef.current = 1;
        setMensaje("");
        beepSuccess();
        
        // Limpiar código inmediatamente
        setCodigo("");
        setTimeout(() => {
          const el = document.getElementById("inputCodigo");
          if (el) safeFocus(el, 0);
        }, 50);
      }

      try {
        // Hacer la llamada al servidor en paralelo
        const data = await authFetch(`${SERVER_URL}/inventario/producto/${codigoLimpio}`);
        
        // ⚠️ Verificar si el producto está agotado (activo = 0)
        // Esto solo aplica cuando el producto fue marcado como "Agotado" (no con otros motivos)
        if (data && Number(data.activo ?? 1) === 0) {
          setMensaje("Agotado");
          beepAlerta();
          pushToast("Agotado", "warn");
          
          // Limpiar código inmediatamente
          setCodigo("");
          setTimeout(() => {
            const el = document.getElementById("inputCodigo");
            if (el) safeFocus(el, 0);
          }, 100);
          
          // Liberar el flag
          setTimeout(() => {
            procesandoRef.current = false;
          }, 200);
          return;
        }
        
        // Verificar que el código sigue siendo el mismo (no se escaneó otro mientras tanto)
        if (ultimoCodigoRef.current && ultimoCodigoRef.current !== codigoLimpio) {
          console.log("⚠️ Código cambió durante la búsqueda, ignorando resultado");
          return;
        }
        
        // Guardar en cache (mantener solo últimos 200 productos)
        if (productosCacheRef.current.size > 200) {
          const entries = Array.from(productosCacheRef.current.entries());
          productosCacheRef.current.clear();
          entries.slice(-150).forEach(([key, value]) => {
            productosCacheRef.current.set(key, value);
          });
        }
        productosCacheRef.current.set(codigoLimpio, data);

        const nombreCompleto = obtenerNombreCompleto(data.nombre || "", data.presentacion || "");

        // Actualizar estados y refs (puede actualizar si el cache estaba desactualizado)
        ultimoCodigoRef.current = codigoLimpio;
        
        setNombre(data.nombre || "");
        nombreRef.current = data.nombre || "";
        
        setPresentacion(data.presentacion || "");
        presentacionRef.current = data.presentacion || "";
        
        setPXC(data.piezas_por_caja || "");
        pxcRef.current = data.piezas_por_caja || "";
        
        setCajas(1);
        cajasRef.current = 1;
        
        setMensaje("");

        if (!cachedProduct) {
          beepSuccess();
        }
        
        // Iniciar auto-guardado solo si el código sigue siendo el mismo
        if (ultimoCodigoRef.current === codigoLimpio) {
          iniciarAutoGuardado(codigoLimpio, nombreCompleto, 1);
        }

        // Limpiar código inmediatamente
        setCodigo("");
        setTimeout(() => {
          const el = document.getElementById("inputCodigo");
          if (el) safeFocus(el, 0);
        }, 50);
      } catch {
        // Verificar que el código sigue siendo el mismo
        if (ultimoCodigoRef.current && ultimoCodigoRef.current !== codigoLimpio) {
          console.log("⚠️ Código cambió durante el error, ignorando");
          return;
        }
        
        limpiarEstadosCompletamente();
        setMensaje("❌ Código no encontrado");
        beepError();

        // Limpiar código inmediatamente
        setCodigo("");
        setTimeout(() => {
          const el = document.getElementById("inputCodigo");
          if (el) safeFocus(el, 0);
        }, 100);
      }
    } finally {
      // Liberar el flag después de un pequeño delay para evitar race conditions
      setTimeout(() => {
        procesandoRef.current = false;
      }, 200);
    }
  };

  /* ========================================================
     AUTO-DETECCIÓN DE ESCANEO (Zebra) OPTIMIZADA
  ======================================================== */
  const scanBufferRef = useRef("");
  const SCAN_DELAY = 100; // Aumentado a 100ms para escáneres Zebra más lentos

  const procesarCodigoEscaneado = (codigoCompleto) => {
    // Si hay modal abierto, no procesar escaneos
    if (modalDuplicado.open) {
      return;
    }
    
    const finalCode = codigoCompleto.trim();
    
    // Cancelar timeout pendiente
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    
    // Limpiar buffer
    scanBufferRef.current = "";

    if (finalCode.length > 3) {
      // Limpiar input ANTES de procesar (para que se vea limpio inmediatamente)
      setCodigo("");
      
      // Procesar el escaneo
      procesarScan(finalCode);
    }
  };

  const handleScanInput = (value) => {
    // Si hay modal abierto, no procesar escaneos
    if (modalDuplicado.open) {
      return;
    }
    
    // Actualizar el buffer con el valor completo del escaneo
    scanBufferRef.current = value;

    // Cancelar timeout anterior
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }

    // Detectar si estamos en la app móvil Android usando Capacitor
    const isMobileApp = typeof window !== 'undefined' && 
      window.Capacitor && 
      window.Capacitor.isNativePlatform && 
      window.Capacitor.isNativePlatform() &&
      window.Capacitor.getPlatform() === 'android';

    // En Android nativo (DataWedge), esperar a que llegue el Enter
    // Si no llega Enter en 500ms, procesar automáticamente (fallback)
    // En web, usar el delay normal
    const delay = isMobileApp ? 500 : SCAN_DELAY;

    // Crear nuevo timeout como fallback (solo si no llega Enter de DataWedge)
    scanTimeoutRef.current = setTimeout(() => {
      const codigoFinal = scanBufferRef.current.trim();
      if (codigoFinal && codigoFinal.length > 3) {
        console.log("⏱️ [Fallback] Timeout alcanzado, procesando código:", codigoFinal);
        scanBufferRef.current = "";
        procesarCodigoEscaneado(codigoFinal);
      }
    }, delay);
  };

  // Handler para capturar Enter del escáner Zebra/DataWedge
  const handleInputKeyDown = (e) => {
    // Capturar Enter de DataWedge (puede venir como Enter, Return, o keyCode 13)
    const isEnter = e.key === "Enter" || 
                    e.key === "Return" || 
                    e.keyCode === 13 || 
                    e.which === 13;
    
    if (isEnter) {
      e.preventDefault();
      e.stopPropagation();
      
      // Obtener el código actual del input o del buffer
      const codigoActual = (codigo.trim() || scanBufferRef.current.trim());
      
      if (codigoActual.length > 3) {
        // Cancelar timeout pendiente (si existe)
        if (scanTimeoutRef.current) {
          clearTimeout(scanTimeoutRef.current);
          scanTimeoutRef.current = null;
        }
        
        // Limpiar el buffer
        scanBufferRef.current = "";
        
        // Procesar inmediatamente el código escaneado
        console.log("📱 [DataWedge] Enter detectado, procesando código:", codigoActual);
        procesarCodigoEscaneado(codigoActual);
        
        // Limpiar el input después de procesar
        setTimeout(() => {
          setCodigo("");
          const el = document.getElementById("inputCodigo");
          if (el) {
            el.value = "";
            safeFocus(el, 0);
          }
        }, 100);
      }
    }
  };

  /* ========================================================
     AUTO-GUARDADO
  ======================================================== */
  const iniciarAutoGuardado = (codigoP, nombreP, cajasP) => {
    // Cancelar auto-guardado anterior si existe
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }

    autoSaveTimeoutRef.current = setTimeout(async () => {
      // Verificar que el código sigue siendo el mismo antes de guardar (usar ref para evitar closure)
      // También verificar que no hay modal abierto
      const hayModalAbierto = modalDuplicado.open;
      
      if (!hayModalAbierto && ultimoCodigoRef.current === codigoP && cajasRef.current > 0 && nombreRef.current) {
        console.log("💾 Auto-guardando producto:", codigoP);
        await guardarProductoActual(codigoP, nombreP, cajasP);

        // Limpiar estados y refs completamente
        limpiarEstadosCompletamente();

        // Enfocar input para siguiente escaneo
        setTimeout(() => {
          const el = document.getElementById("inputCodigo");
          if (el) safeFocus(el, 0);
        }, 100);
      } else {
        console.log("⚠️ Auto-guardado cancelado:", { 
          hayModal: hayModalAbierto, 
          codigoMatch: ultimoCodigoRef.current === codigoP,
          tieneCajas: cajasRef.current > 0,
          tieneNombre: !!nombreRef.current
        });
      }
      
      autoSaveTimeoutRef.current = null;
    }, 5000);
  };

  /* ========================================================
     CERRAR DÍA
  ======================================================== */
  const cerrarDia = async () => {
    if (!fecha) {
      await showAlert("Selecciona fecha", "warning");
      return;
    }
    const confirmado = await showConfirm(`¿Cerrar el día ${fecha}?`, "Confirmar cierre");
    if (!confirmado) return;

    try {
      await authFetch(`${SERVER_URL}/cerrar-dia`, {
        method: "POST",
        body: JSON.stringify({ fecha })
      });

      // Los eventos de socket se emitirán desde el servidor
      // y los listeners actualizarán automáticamente la UI
      pushToast("📅 Día cerrado");
      beepSuccess();
      
      // Recargar productos inmediatamente (los eventos de socket también lo harán)
      if (typeof cargarProductos === "function") {
        setTimeout(() => cargarProductos(), 300);
      }
    } catch (err) {
      console.error("Error cerrando día:", err);
      pushToast("❌ Error cerrando día", "err");
      beepError();
    }
  };

  // Refs para funciones de voz (se actualizan después de definirlas)
  const procesarScanRef = useRef(null);
  const guardarProductoActualRef = useRef(null);

  /* ========================================================
     RECONOCIMIENTO DE VOZ (después de definir funciones)
  ======================================================== */
  const handleRegistrarPorVoz = useCallback(async (codigo) => {
    console.log('🎤 Comando de voz REGISTRAR recibido para código:', codigo);
    pushToast(`🎤 Registrando producto ${codigo}...`, "ok");
    
    // Procesar el código como si fuera un escaneo
    if (procesarScanRef.current) {
      await procesarScanRef.current(codigo);
    }
    
    // Esperar un momento y luego guardar automáticamente
    setTimeout(async () => {
      if (ultimoCodigoRef.current === codigo && cajasRef.current > 0) {
        if (guardarProductoActualRef.current) {
          await guardarProductoActualRef.current(codigo, nombreRef.current, cajasRef.current);
          pushToast(`✅ Producto ${codigo} registrado por voz`, "ok");
        }
      }
    }, 1500);
  }, [pushToast]);

  // Procesar comandos complejos de voz
  const handleComandoVoz = useCallback(async (transcript, normalizado) => {
    console.log('🎤 Comando complejo recibido:', transcript);
    
    // Patrón: "PINA agrega [número] cajas de [nombre producto]"
    const patronAgregar = /pina\s+agrega\s+(\d+)\s+cajas?\s+de\s+(.+)/i;
    const matchAgregar = normalizado.match(patronAgregar);
    
    if (matchAgregar) {
      const cantidadCajas = parseInt(matchAgregar[1]);
      const nombreProducto = matchAgregar[2].trim();
      
      if (cantidadCajas > 0 && nombreProducto) {
        pushToast(`🔍 Buscando "${nombreProducto}" en inventario...`, "ok");
        
        try {
          // Buscar producto por nombre (el servidor ya filtra solo CEDIS - inventario_id = 1)
          const producto = await authFetch(`${SERVER_URL}/inventario/buscar-por-nombre/${encodeURIComponent(nombreProducto)}`);
          
          // Filtrar SOLO productos de CEDIS (por seguridad, aunque el servidor ya lo hace)
          let productoFinal = null;
          if (producto) {
            if (Array.isArray(producto)) {
              // Si es array, buscar SOLO en CEDIS
              productoFinal = producto.find(p => {
                const inventarioId = p.inventario_id || p.inventarioId || 1;
                return inventarioId === 1;
              });
            } else if (producto.codigo) {
              // Si es un solo producto, verificar que sea de CEDIS
              const inventarioId = producto.inventario_id || producto.inventarioId || 1;
              if (inventarioId === 1) {
                productoFinal = producto;
              }
            }
          }
          
          if (productoFinal && productoFinal.codigo) {
            pushToast(`✅ Producto encontrado: ${productoFinal.nombre}`, "ok");
            
            // Procesar como escaneo
            if (procesarScanRef.current) {
              await procesarScanRef.current(productoFinal.codigo);
            }
            
            // Esperar y establecer las cajas
            setTimeout(async () => {
              if (ultimoCodigoRef.current === productoFinal.codigo) {
                setCajas(cantidadCajas);
                cajasRef.current = cantidadCajas;
                
                // Guardar automáticamente
                if (guardarProductoActualRef.current) {
                  await guardarProductoActualRef.current(
                    productoFinal.codigo,
                    productoFinal.nombre,
                    cantidadCajas
                  );
                  pushToast(`✅ ${cantidadCajas} cajas de ${productoFinal.nombre} agregadas`, "ok");
                }
              }
            }, 1000);
          } else {
            pushToast(`❌ Producto "${nombreProducto}" no encontrado en inventario`, "err");
          }
        } catch (err) {
          console.error('Error buscando producto:', err);
          pushToast(`❌ Error buscando producto: ${err.message || 'No encontrado'}`, "err");
          beepError();
        }
        return;
      }
    }
    
    // Si no coincide con ningún patrón, intentar con el comando simple
    // Extraer código numérico si existe
    const codigoMatch = normalizado.match(/(\d+)/);
    if (codigoMatch && handleRegistrarPorVoz) {
      handleRegistrarPorVoz(codigoMatch[1]);
    }
  }, [pushToast, authFetch, SERVER_URL, handleRegistrarPorVoz]);

  // Actualizar refs cuando las funciones estén definidas
  useEffect(() => {
    procesarScanRef.current = procesarScan;
    guardarProductoActualRef.current = guardarProductoActual;
  }, [procesarScan, guardarProductoActual]);

  const { isListening: vozEscuchando, error: vozError, toggle: toggleVoz } = useVoiceRecognition({
    onRegistrar: handleRegistrarPorVoz,
    onSurtir: null, // No se usa en Picking
    onComando: handleComandoVoz,
    enabled: true,
    wakeWords: ["ixora", "pina"],
    requireWakeWord: true
  });

  /* ========================================================
     DETECCIÓN DE PC (para layout diferente)
  ======================================================== */
  const [isPC, setIsPC] = useState(typeof window !== 'undefined' && window.innerWidth > 768);

  useEffect(() => {
    const handleResize = () => {
      setIsPC(window.innerWidth > 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /* ========================================================
     RENDER
  ======================================================== */

  return (
    <div className="card picking-container">
      <div className="picking-header" style={isPC ? { flexDirection: 'column', gap: '12px' } : {}}>
        <h2 className="picking-titulo" style={isPC ? { width: '100%', textAlign: 'center' } : {}}>{titulo || "Picking"}</h2>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '10px',
          ...(isPC && { justifyContent: 'center', width: '100%' })
        }}>
          {cambiarModulo && (
            <button
              onClick={() => cambiarModulo(moduloRegistros || "registros")}
              style={{
                fontSize: '24px',
                background: 'var(--color-primario, #3b82f6)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '8px',
                fontWeight: '500',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                height: '44px',
                minHeight: '44px',
                minWidth: '44px',
                width: '44px'
              }}
              title="Ir a Surtido Picking"
            >
              🗃️
            </button>
          )}
          <button
            onClick={toggleVoz}
            style={{
              fontSize: '20px',
              background: vozEscuchando ? 'rgba(76, 175, 80, 0.1)' : 'var(--fondo-input)',
              border: vozEscuchando ? '2px solid rgba(76, 175, 80, 0.5)' : '1px solid var(--borde-medio)',
              cursor: 'pointer',
              color: vozEscuchando ? '#4CAF50' : 'var(--texto-principal)',
              transition: 'all 0.3s ease',
              position: 'relative',
              padding: '8px 12px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '44px',
              width: '44px',
              height: '44px',
              minHeight: '44px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              ...(vozEscuchando && {
                boxShadow: '0 0 20px rgba(76, 175, 80, 0.9), 0 0 40px rgba(76, 175, 80, 0.6), 0 0 60px rgba(76, 175, 80, 0.3)',
                animation: 'pulse-glow 2s ease-in-out infinite'
              })
            }}
            title={vozEscuchando ? 'Micrófono activo - Click para desactivar' : 'Micrófono inactivo - Click para activar'}
          >
            🎤
          </button>
          {vozError && (
            <span style={{ fontSize: '12px', color: '#f44336' }}>
              ⚠️ {vozError}
            </span>
          )}
        {canalActual === "picking" && (
          <button className="btn-corte-picking" onClick={cerrarDia}>🔒</button>
        )}
        <button
          onClick={async () => {
            setModalAgotadosOpen(true);
            setCargandoAgotados(true);
            try {
              const productos = await authFetch(`${SERVER_URL}/inventario/agotados`);
              setProductosAgotados(Array.isArray(productos) ? productos : []);
            } catch (err) {
              console.error("Error cargando productos agotados:", err);
              setProductosAgotados([]);
              await showAlert("Error al cargar productos agotados", "error");
            } finally {
              setCargandoAgotados(false);
            }
          }}
          style={{
            fontSize: '24px',
            background: '#ef4444',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '8px',
            fontWeight: '500',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            height: '44px',
            minHeight: '44px',
            minWidth: '44px',
            width: '44px'
          }}
          title="Ver productos agotados"
        >
          ⚠️
        </button>
        </div>
      </div>

      <div className="picking-form">
        <input
          id="inputCodigo"
          placeholder="Código"
          value={codigo}
          inputMode="none"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          onFocus={() => {
            const el = document.getElementById("inputCodigo");
            if (el) el.setSelectionRange(el.value.length, el.value.length);
          }}
          onChange={(e) => {
            const val = e.target.value;
            setCodigo(val);
            handleScanInput(val);
          }}
          onKeyDown={handleInputKeyDown}
          onKeyPress={(e) => {
            // Capturar también keyPress para DataWedge (algunos dispositivos lo usan)
            if (e.key === "Enter" || e.charCode === 13) {
              e.preventDefault();
              handleInputKeyDown(e);
            }
          }}
          className="picking-input-codigo"
        />

        <div className="picking-nombre-container" style={{ position: 'relative' }} ref={nombreInputRef}>
          <input
            placeholder="Nombre"
            value={nombre}
            onChange={(e) => {
              const valor = e.target.value;
              setNombre(valor);
              // Mostrar sugerencias si hay texto
              if (valor.trim().length >= 2) {
                setMostrarSugerencias(true);
              } else {
                setMostrarSugerencias(false);
              }
            }}
            onKeyDown={(e) => {
              // Si hay sugerencias y presiona Enter, seleccionar la primera
              if (e.key === "Enter" && sugerenciasNombre.length > 0) {
                e.preventDefault();
                seleccionarProducto(sugerenciasNombre[0]);
              } else if (e.key === "Escape") {
                setMostrarSugerencias(false);
              }
            }}
            onFocus={() => {
              // Mostrar sugerencias si hay texto
              if (nombre.trim().length >= 2 && sugerenciasNombre.length > 0) {
                setMostrarSugerencias(true);
              }
            }}
            className="picking-input-nombre"
            style={{ position: 'relative' }}
          />
        </div>
        
        {/* Dropdown de sugerencias renderizado fuera del contenedor usando Portal */}
        {mostrarSugerencias && sugerenciasNombre.length > 0 && dropdownPosition.width > 0 && createPortal(
          <div
            ref={sugerenciasRef}
            style={{
              position: 'fixed',
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`,
              zIndex: 10000,
              backgroundColor: 'var(--fondo-card)',
              border: '1px solid var(--borde-medio)',
              borderRadius: '2px',
              maxHeight: '300px',
              overflowY: 'auto',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}
          >
            {buscandoNombre && (
              <div style={{ padding: '8px', textAlign: 'center', color: 'var(--texto-secundario)', fontSize: '0.8rem' }}>
                Buscando...
              </div>
            )}
            {!buscandoNombre && sugerenciasNombre.map((prod, index) => (
              <button
                key={prod.codigo || index}
                onClick={() => seleccionarProducto(prod)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: index < sugerenciasNombre.length - 1 ? '1px solid var(--borde-sutil)' : 'none',
                  cursor: 'pointer',
                  color: 'var(--texto-principal)',
                  transition: 'background 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                  borderRadius: '0',
                  whiteSpace: 'normal',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = 'var(--fondo-input)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                }}
              >
                <div style={{ 
                  fontWeight: '600', 
                  fontSize: '0.8rem',
                  lineHeight: '1.3',
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word'
                }}>
                  {prod.nombre || 'Sin nombre'}
                </div>
                <div style={{ 
                  fontSize: '0.7rem', 
                  color: 'var(--texto-secundario)', 
                  display: 'flex', 
                  gap: '6px',
                  flexWrap: 'nowrap',
                  lineHeight: '1.2',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  <span>Código: {prod.codigo || 'N/A'}</span>
                  {prod.presentacion && <span>· {prod.presentacion}</span>}
                </div>
              </button>
            ))}
          </div>,
          document.body
        )}

        <input
          placeholder="Presentación"
          value={presentacion}
          readOnly
          className="picking-input-presentacion"
        />

        <div className="picking-pxc-cajas-container">
          <div className="picking-pxc-container">
            <input
              placeholder="PXC"
              value={pxc}
              readOnly
              className="picking-input-pxc"
            />
          </div>

          <input
            id="inputCajas"
            type="number"
            placeholder="Cajas"
            value={cajas}
            readOnly
            className="picking-input-cajas"
          />
        </div>
      </div>

      {mensaje && <p className="picking-mensaje">{mensaje}</p>}


      {/* MODAL DUPLICADO */}
      {modalDuplicado.open && (
        <div
          className="modal-overlay-picking"
          onClick={() => {
            setModalDuplicado({ open: false, esSurtido: false, codigo: "", nombre: "", cajas: "", pxc: "", mensajeExtra: "" });
            limpiarEstadosCompletamente();
            setTimeout(() => {
              const el = document.getElementById("inputCodigo");
              if (el) safeFocus(el, 0);
            }, 80);
          }}
        >
          <div className="modal-duplicado-picking" onClick={(e) => e.stopPropagation()}>
            {modalDuplicado.esSurtido ? (
              <>
                <h3>🚨 Producto ya surtido</h3>
                <p>Este producto fue surtido recientemente.</p>
              </>
            ) : (
              <>
                <h3>⚠️ Código ya registrado</h3>
                <p>Este código existe pero NO está surtido.</p>
              </>
            )}

            {modalDuplicado.mensajeExtra && (
              <p className="modal-mensaje-extra">
                {modalDuplicado.mensajeExtra}
              </p>
            )}

            {modalDuplicado.esSurtido ? (
              <p className="modal-pregunta" style={{ color: '#ff6b6b', fontWeight: 'bold' }}>
                Debes esperar 5 minutos desde el último surtido para agregar nuevamente.
              </p>
            ) : (
              <p className="modal-pregunta">
                ¿Agregar de todos modos?
              </p>
            )}

            <div className="modal-buttons-picking">
              {modalDuplicado.esSurtido ? (
                <button
                  className="btn-no-picking"
                  onClick={() => {
                    setModalDuplicado({ open: false, esSurtido: false, codigo: "", nombre: "", cajas: "", pxc: "", mensajeExtra: "" });
                    beepAlerta();
                    if (navigator.vibrate) navigator.vibrate(300);
                    limpiarEstadosCompletamente();
                    setTimeout(() => {
                      const el = document.getElementById("inputCodigo");
                      if (el) safeFocus(el, 0);
                    }, 80);
                  }}
                  style={{ width: '100%' }}
                >
                  Cerrar
                </button>
              ) : (
                <>
                  <button
                    className="btn-yes-picking"
                    onClick={async () => {
                      if (!modalDuplicado.nombre.trim()) {
                        beepError();
                        pushToast("No se puede guardar sin nombre", "error");
                        return;
                      }

                      try {
                        await authFetch(`${SERVER_URL}/productos`, {
                          method: "POST",
                          body: JSON.stringify({
                            codigo: modalDuplicado.codigo,
                            nombre: modalDuplicado.nombre,
                            cajas: parseInt(modalDuplicado.cajas),
                            piezas_por_caja: modalDuplicado.pxc
                              ? parseInt(modalDuplicado.pxc)
                              : 0,
                            canal: canalActual
                          })
                        });

                        setModalDuplicado({ open: false, esSurtido: false, codigo: "", nombre: "", cajas: "", pxc: "", mensajeExtra: "" });
                        limpiarEstadosCompletamente();

                        if (navigator.vibrate) navigator.vibrate(80);
                        cargarProductos();
                        pushToast("Producto agregado ✔");
                        beepSuccess();

                        setTimeout(() => {
                          const el = document.getElementById("inputCodigo");
                          if (el) safeFocus(el, 0);
                        }, 60);
                      } catch (err) {
                        console.error("Error guardando desde modal:", err);
                        beepError();
                        pushToast("❌ Error al guardar producto", "err");
                      }
                    }}
                  >
                    ✔
                  </button>

                  <button
                    className="btn-no-picking"
                    onClick={() => {
                      setModalDuplicado({ open: false, esSurtido: false, codigo: "", nombre: "", cajas: "", pxc: "", mensajeExtra: "" });
                      beepAlerta();
                      if (navigator.vibrate) navigator.vibrate(300);
                      limpiarEstadosCompletamente();
                      setTimeout(() => {
                        const el = document.getElementById("inputCodigo");
                        if (el) safeFocus(el, 0);
                      }, 80);
                    }}
                  >
                    ✖
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Productos Agotados */}
      {modalAgotadosOpen && (
        <div className="modal-overlay-picking" onClick={() => setModalAgotadosOpen(false)}>
          <div className="modal-busqueda-picking" onClick={(e) => e.stopPropagation()}>
            <h3>Productos Agotados</h3>
            
            {cargandoAgotados ? (
              <div style={{ textAlign: 'center', padding: '12px', fontSize: '0.85rem' }}>
                <p>Cargando productos agotados...</p>
              </div>
            ) : productosAgotados.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '12px', fontSize: '0.85rem' }}>
                <p>No hay productos agotados</p>
              </div>
            ) : (
              <div className="busqueda-resultados" style={{ maxHeight: '450px', overflowY: 'auto' }}>
                {productosAgotados.map((producto) => (
                  <div
                    key={producto.id}
                    className="busqueda-item"
                    onClick={async () => {
                      try {
                        // Agregar el producto a la lista de picking
                        await guardarProductoActual(
                          producto.codigo,
                          producto.nombre,
                          1 // Cajas por defecto
                        );
                        setModalAgotadosOpen(false);
                        pushToast(`✅ ${producto.nombre} agregado a la lista`, "ok");
                        beepSuccess();
                      } catch (err) {
                        console.error("Error agregando producto agotado:", err);
                        await showAlert("Error al agregar producto", "error");
                      }
                    }}
                  >
                    <div className="busqueda-item-nombre">
                      {producto.codigo} - {producto.nombre}
                    </div>
                    <div className="busqueda-item-detalle">
                      {producto.presentacion && <span>📦 {producto.presentacion}</span>}
                      {producto.categoria && <span>🏷️ {producto.categoria}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="modal-buttons-picking">
              <button
                className="btn-no-picking"
                onClick={() => setModalAgotadosOpen(false)}
                style={{ width: 'auto', padding: '10px 20px' }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

