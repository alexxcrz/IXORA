import React, { useState, useEffect, useRef, useCallback } from "react";
import "./RegistrosPicking.css";
import { authFetch } from "../../AuthContext";
import { useAlert } from "../../components/AlertModal";
import { useVoiceRecognition } from "../../hooks/useVoiceRecognition";

// Subcategorías de Importación (debe coincidir con App.jsx)
const SUBCATEGORIAS_IMPORTACION = [
  "Biodegradables",
  "Botellas",
  "Cuidado Personal",
  "Esencias",
  "Sport",
  "Velas",
];

// Función helper para determinar si un producto es de importación
const esProductoImportacion = (categoria, subcategoria) => {
  // Si no hay categoría ni subcategoría, no es de importación
  if (!categoria && !subcategoria) {
    return false;
  }
  
  // Normalizar categoría (quitar espacios y convertir a minúsculas para comparación)
  const categoriaNormalizada = categoria ? categoria.trim() : "";
  const categoriaLower = categoriaNormalizada.toLowerCase();
  
  // Verificar si la categoría contiene "importación" o "importacion" (más flexible)
  // Esto cubre casos como "Importación", "Importacion", "IMPORTACIÓN", etc.
  if (categoriaNormalizada && (
      categoriaNormalizada === "Importación" || 
      categoriaNormalizada === "Importacion" ||
      categoriaLower === "importación" || 
      categoriaLower === "importacion" ||
      categoriaLower.includes("importación") ||
      categoriaLower.includes("importacion")
    )) {
    return true;
  }
  
  // Verificar si la subcategoría está en la lista de subcategorías de Importación
  // PRIORIDAD: Si tiene subcategoría, verificar primero si está en la lista
  if (subcategoria) {
    const subcategoriaNormalizada = subcategoria.trim();
    const subcategoriaLower = subcategoriaNormalizada.toLowerCase();
    
    // Primero: Comparación exacta case-insensitive con la lista
    for (const subcat of SUBCATEGORIAS_IMPORTACION) {
      const subcatNormalizada = subcat.trim();
      const subcatLower = subcatNormalizada.toLowerCase();
      
      // Comparación exacta (case-insensitive)
      if (subcategoriaLower === subcatLower) {
        return true;
      }
      
      // Comparación exacta con formato original (por si hay espacios)
      if (subcategoriaNormalizada === subcatNormalizada) {
        return true;
      }
    }
    
    // Segundo: Comparación exacta original (sin normalizar, por compatibilidad)
    if (SUBCATEGORIAS_IMPORTACION.includes(subcategoriaNormalizada)) {
      return true;
    }
    
    // Tercero: Verificar si alguna subcategoría de importación está contenida
    // (por si hay espacios extra o formato diferente)
    for (const subcat of SUBCATEGORIAS_IMPORTACION) {
      const subcatLower = subcat.toLowerCase().trim();
      if (subcategoriaLower.includes(subcatLower) || subcatLower.includes(subcategoriaLower)) {
        return true;
      }
    }
  }
  
  return false;
};

export default function RegistrosPicking({
  SERVER_URL,
  productos,
  setProductos,
  cargarProductos,
  pushToast,
  inventario,
  cambiarModulo,
  canal,
  moduloPicking,
}) {
  const { showAlert, showConfirm } = useAlert();
  const [filtro, setFiltro] = useState("pendientes"); // pendientes, surtido, importacion, devoluciones, no-disponibles
  const [busqueda, setBusqueda] = useState("");
  const canalActual = (canal || "picking").toString().trim().toLowerCase();

  const productosFiltrados = (productos || []).filter(
    (p) => (p.canal || "picking") === canalActual
  );

  const productosConCategoria = productosFiltrados.map((p) => {
    const codigoParaBuscar = p.codigo_principal || p.codigo;
    let info = inventario?.find((i) => i.codigo === codigoParaBuscar);
    if (!info) {
      info = inventario?.find((i) => i.codigo === p.codigo);
    }

    // Obtener categoría y subcategoría: primero del producto, luego del inventario
    const categoria = (p.categoria && p.categoria.trim()) || (info?.categoria && info.categoria.trim()) || "";
    const subcategoria = (p.subcategoria && p.subcategoria.trim()) || (info?.subcategoria && info.subcategoria.trim()) || "";
    
    // Determinar si es de importación:
    // 1. Primero verificar si tiene la columna importacion = 1 (para compatibilidad con datos antiguos)
    // 2. Luego verificar por categoría/subcategoría
    // IMPORTANTE: La verificación por subcategoría tiene prioridad si existe
    const esImportacionPorColumna = p.importacion === 1 || p.importacion === true;
    const esImportacionPorCategoria = esProductoImportacion(categoria, subcategoria);
    const esImportacion = esImportacionPorColumna || esImportacionPorCategoria;
    

    return {
      ...p,
      categoria,
      subcategoria,
      piezas_por_caja:
        p.piezas_por_caja != null
          ? Number(p.piezas_por_caja)
          : Number(info?.piezas_por_caja) || 0,
      extras: Number(p.extras) || 0,
      codigo_principal: p.codigo_principal || (p.codigo === codigoParaBuscar ? null : codigoParaBuscar),
      esImportacion, // Flag para facilitar filtrado
    };
  });

  const [scan, setScan] = useState("");
  const scanRef = useRef(null);
  const refCajas = useRef(null);
  const refPXC = useRef(null);
  const refExtras = useRef(null);
  const refBtnSurtir = useRef(null);
  const scanTimeoutRef = useRef(null);
  const scanBufferRef = useRef("");
  const SCAN_DELAY = 40;

  const [modalAbierto, setModalAbierto] = useState(false);
  const [prodModal, setProdModal] = useState(null);

  const [mCajas, setMCajas] = useState("");
  const [mPXC, setMPXC] = useState("");
  const [mExtras, setMExtras] = useState("");
  const [mNuevoLote, setMNuevoLote] = useState("");
  const [mostrarND, setMostrarND] = useState(false);
  const [tieneLotesRegistrados, setTieneLotesRegistrados] = useState(false);

  const audioContextRef = useRef(null);
  
  const crearSonidoRegistros = (audioCtx, tipo) => {
    try {
      const now = audioCtx.currentTime;
      
      if (tipo === 'success') {
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        const gain2 = audioCtx.createGain();
        
        osc1.type = "sine";
        osc2.type = "sine";
        
        osc1.frequency.setValueAtTime(500, now);
        osc1.frequency.exponentialRampToValueAtTime(800, now + 0.12);
        osc2.frequency.setValueAtTime(600, now + 0.08);
        osc2.frequency.exponentialRampToValueAtTime(900, now + 0.18);
        
        gain1.gain.setValueAtTime(0.0001, now);
        gain1.gain.linearRampToValueAtTime(0.35, now + 0.06);
        gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
        
        gain2.gain.setValueAtTime(0.0001, now + 0.08);
        gain2.gain.linearRampToValueAtTime(0.25, now + 0.13);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        
        osc1.connect(gain1);
        osc2.connect(gain2);
        gain1.connect(audioCtx.destination);
        gain2.connect(audioCtx.destination);
        
        osc1.start(now);
        osc1.stop(now + 0.12);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.18);
        
      } else if (tipo === 'error') {
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc1.type = "sawtooth";
        osc2.type = "sawtooth";
        
        osc1.frequency.setValueAtTime(700, now);
        osc1.frequency.exponentialRampToValueAtTime(300, now + 0.25);
        osc2.frequency.setValueAtTime(500, now);
        osc2.frequency.exponentialRampToValueAtTime(250, now + 0.25);
        
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.45, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc1.start(now);
        osc1.stop(now + 0.25);
        osc2.start(now);
        osc2.stop(now + 0.25);
        
      } else if (tipo === 'alerta') {
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        const gain2 = audioCtx.createGain();
        
        osc1.type = "triangle";
        osc2.type = "triangle";
        
        osc1.frequency.setValueAtTime(550, now);
        osc1.frequency.setValueAtTime(550, now + 0.1);
        osc2.frequency.setValueAtTime(650, now + 0.12);
        osc2.frequency.setValueAtTime(650, now + 0.22);
        
        gain1.gain.setValueAtTime(0.0001, now);
        gain1.gain.linearRampToValueAtTime(0.3, now + 0.05);
        gain1.gain.setValueAtTime(0.3, now + 0.1);
        gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
        
        gain2.gain.setValueAtTime(0.0001, now + 0.12);
        gain2.gain.linearRampToValueAtTime(0.3, now + 0.17);
        gain2.gain.setValueAtTime(0.3, now + 0.22);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
        
        osc1.connect(gain1);
        osc2.connect(gain2);
        gain1.connect(audioCtx.destination);
        gain2.connect(audioCtx.destination);
        
        osc1.start(now);
        osc1.stop(now + 0.12);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.25);
      }
    } catch (err) {
      console.warn("Error creando sonido Registros:", err);
    }
  };

  const sonidoRegistros = (tipo) => {
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
          crearSonidoRegistros(audioCtx, tipo);
        }).catch(() => {
          crearSonidoRegistros(audioCtx, tipo);
        });
        return;
      }
      
      crearSonidoRegistros(audioCtx, tipo);
    } catch (err) {
      console.warn("Error reproduciendo sonido Registros:", err);
    }
  };

  const beepError = () => sonidoRegistros('error');
  const beepSuccess = () => sonidoRegistros('success');
  const beepAlerta = () => sonidoRegistros('alerta');

  useEffect(() => {
    if (filtro === "pendientes") {
      // Solo enfocar si no hay un input activo
      setTimeout(() => {
        const activeElement = document.activeElement;
        const isInputActive = activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.tagName === 'SELECT' ||
          activeElement.isContentEditable
        );
        
        if (!isInputActive) {
          scanRef.current?.focus();
        }
      }, 100);
    }
  }, [filtro]);

  const productosUnicosSurtidos = new Set(
    productosConCategoria
      .filter((p) => p.surtido === 1)
      .map((p) => p.codigo)
  ).size;

  const totalCajasSurtidas = productosConCategoria
    .filter((p) => p.surtido === 1)
    .reduce((sum, p) => sum + (Number(p.cajas) || 0), 0);

  const totalPiezasSurtidas = productosConCategoria
    .filter((p) => p.surtido === 1)
    .reduce((sum, p) => sum + (Number(p.piezas) || 0), 0);

  const surtirFila = async (p) => {
    try {
      const loteActual = (p.lote || "").trim();
      if (!loteActual) {
        beepError();
        await showAlert("⚠️ No se puede surtir sin lote. Por favor, agrega un lote antes de surtir.", "warning");
        return;
      }

      const piezasCalculadas = p.origen === 'devoluciones'
        ? (Number(p.piezas) || 0) + (Number(p.extras) || 0)
        : (Number(p.cajas) || 0) * (Number(p.piezas_por_caja) || 0) + (Number(p.extras) || 0);

      const codigoParaLote = p.codigo_principal || p.codigo;
      
      try {
        const { existe } = await authFetch(
          `${SERVER_URL}/inventario/lotes/${encodeURIComponent(codigoParaLote)}/verificar/${encodeURIComponent(loteActual)}`
        );
        
        if (!existe) {
          try {
            await authFetch(
              `${SERVER_URL}/inventario/lotes/${encodeURIComponent(codigoParaLote)}/nuevo`,
              {
                method: "POST",
                body: JSON.stringify({
                  lote: loteActual,
                  cantidad_piezas: 0, // Solo agregar el lote sin piezas
                  activo: true,
                }),
              }
            );
            pushToast(`✅ Lote "${loteActual}" registrado automáticamente`, "ok");
          } catch (err) {
            console.error("Error creando lote automáticamente:", err);
            beepError();
            await showAlert(
              `❌ Error al registrar el lote "${loteActual}". Por favor, intenta nuevamente.`,
              "error"
            );
            return;
          }
        }
      } catch (err) {
        console.error("Error verificando lote:", err);
        beepError();
        await showAlert("❌ Error al verificar el lote. Por favor, intenta nuevamente.", "error");
        return;
      }

      try {
        await authFetch(`${SERVER_URL}/inventario/lote-por-codigo`, {
          method: "PUT",
          body: JSON.stringify({
            codigo: p.codigo,
            lote: loteActual,
          }),
        });
      } catch (err) {
        console.error("Error guardando lote en inventario:", err);
      }

      const body = {
        codigo: p.codigo || "",
        nombre: p.nombre || "",
        cajas: Number(p.cajas) || 0,
        piezas: piezasCalculadas,
        piezas_por_caja: Number(p.piezas_por_caja) || 0,
        observaciones: p.observaciones || "",
        lote: loteActual,
        extras: Number(p.extras) || 0,
        surtido: 1,
        disponible: 1,
      };

      await authFetch(`${SERVER_URL}/productos/${p.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });

      cargarProductos();
      pushToast(`✅ Producto ${p.codigo} surtido`, "ok");
      beepSuccess();
    } catch (err) {
      console.error("❌ Error al surtir:", err);
      pushToast("❌ Error al surtir", "err");
      beepError();
    }
  };

  const abrirModal = async (p) => {
    // Actualizar estado inmediatamente para respuesta instantánea
    setProdModal(p);
    setMCajas(p.cajas > 0 ? p.cajas : "");
    setMPXC(p.piezas_por_caja > 0 ? p.piezas_por_caja : "");
    setMExtras("");
    setMNuevoLote("");
    setTieneLotesRegistrados(false);
    setModalAbierto(true);

    // Cargar lotes en segundo plano sin bloquear la UI
    authFetch(
      `${SERVER_URL}/inventario/lotes/${encodeURIComponent(p.codigo)}/completo`
    ).then((lotes) => {
      const tieneLotes = Array.isArray(lotes) && lotes.length > 0;
      setTieneLotesRegistrados(tieneLotes);
    }).catch((err) => {
      console.error("Error verificando lotes del producto:", err);
      setTieneLotesRegistrados(false);
    });

    // Focus inmediato sin delay
    requestAnimationFrame(() => {
      refPXC.current?.focus();
    });
  };

  const surtirModal = async () => {
    if (!prodModal) return;

    const loteFinal = mNuevoLote.trim() !== "" ? mNuevoLote.trim() : (prodModal.lote || "").trim();
    if (!loteFinal || loteFinal === "") {
      beepError();
      await showAlert("⚠️ No se puede surtir sin lote. Por favor, ingresa un lote antes de surtir.", "warning");
      return;
    }

    const cajas = Number(mCajas) || 0;
    const pxc = Number(mPXC) || 0;
    const extras = Number(mExtras) || 0;
    const total = cajas * pxc + extras;

    const codigoParaLoteModal = prodModal.codigo_principal || prodModal.codigo;
    
    // Cerrar modal INMEDIATAMENTE para respuesta instantánea
    setModalAbierto(false);
    
    // Feedback visual inmediato
    pushToast(`✔ ${prodModal.codigo} surtido correctamente`, "ok");
    beepSuccess();
    
    // Actualizar estado local inmediatamente
    setProductos((prev) =>
      prev.map((x) =>
        x.id === prodModal.id
          ? {
              ...x,
              cajas,
              piezas: total,
              extras,
              piezas_por_caja: pxc,
              surtido: 1,
              disponible: 1,
              lote: loteFinal,
            }
          : x
      )
    );
    
    setScan("");

    // Operaciones del servidor en segundo plano (sin bloquear UI)
    (async () => {
      try {
        const { existe } = await authFetch(
          `${SERVER_URL}/inventario/lotes/${encodeURIComponent(codigoParaLoteModal)}/verificar/${encodeURIComponent(loteFinal)}`
        );
          
        if (!existe) {
          try {
            // ⭐ Solo agregar el lote, sin cantidad_piezas ni activo
            await authFetch(
              `${SERVER_URL}/inventario/lotes/${encodeURIComponent(codigoParaLoteModal)}/nuevo`,
              {
                method: "POST",
                body: JSON.stringify({
                  lote: loteFinal,
                  // No enviar cantidad_piezas ni activo - solo el lote
                }),
              }
            );
            pushToast(`✅ Lote "${loteFinal}" registrado automáticamente`, "ok");
          } catch (err) {
            console.error("Error creando lote automáticamente:", err);
          }
        }
      } catch (err) {
        console.error("Error verificando lote:", err);
      }

      try {
        await authFetch(`${SERVER_URL}/inventario/lote-por-codigo`, {
          method: "PUT",
          body: JSON.stringify({
            codigo: codigoParaLoteModal,
            lote: loteFinal,
          }),
        });
      } catch (err) {
        console.error("Error guardando lote en inventario:", err);
      }
      
      // Llamada al servidor para surtir
      await authFetch(`${SERVER_URL}/productos/${prodModal.id}`, {
        method: "PUT",
        body: JSON.stringify({
          codigo: prodModal.codigo,
          nombre: prodModal.nombre,
          cajas,
          piezas: total,
          extras,
          piezas_por_caja: pxc,
          observaciones: prodModal.observaciones || "",
          lote: loteFinal,
          surtido: 1,
          disponible: 1,
        }),
      });
      
      // Cargar productos después de surtir
      cargarProductos();
    })().catch((err) => {
      console.error("Error al surtir:", err);
      pushToast("❌ Error al surtir", "err");
      beepError();
      // Revertir cambio local si falla
      setProductos((prev) =>
        prev.map((x) =>
          x.id === prodModal.id ? prodModal : x
        )
      );
    });

    // Focus inmediato sin delay
    requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      const isInputActive = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.tagName === 'SELECT' ||
        activeElement.isContentEditable
      );
      
      if (!isInputActive) {
        scanRef.current?.focus();
      }
    });
  };

  const surtirFilaRef = useRef(null);
  const abrirModalRef = useRef(null);
  const surtirModalRef = useRef(null);

  const buscarProductoPorCodigoOAlias = useCallback(async (codigoEscaneado) => {
    let prod = productosConCategoria.find(
      (p) => p.codigo === codigoEscaneado && p.surtido === 0 && p.disponible !== 0
    );
    
    if (!prod) {
      prod = productosConCategoria.find(
        (p) => p.codigo_principal === codigoEscaneado && p.surtido === 0 && p.disponible !== 0
      );
      
      if (!prod) {
        prod = productosConCategoria.find(
          (p) => {
            const alias = p.alias_codigos || [];
            return alias.includes(codigoEscaneado) && p.surtido === 0 && p.disponible !== 0;
          }
        );
      }
    }

    if (!prod) {
      try {
        const respuesta = await authFetch(
          `${SERVER_URL}/productos/buscar/${encodeURIComponent(codigoEscaneado)}?canal=${encodeURIComponent(canalActual)}`
        );
        
        if (respuesta.encontrado && respuesta.producto) {
          prod = productosConCategoria.find(
            (p) => 
              p.id === respuesta.producto.id &&
              p.surtido === 0 &&
              p.disponible !== 0
          );
          
          if (!prod && respuesta.producto.codigo_original) {
            prod = productosConCategoria.find(
              (p) => 
                p.codigo === respuesta.producto.codigo_original &&
                p.surtido === 0 &&
                p.disponible !== 0
            );
          }
          
          if (!prod && respuesta.producto.codigo_principal) {
            prod = productosConCategoria.find(
              (p) => 
                (p.codigo === respuesta.producto.codigo_principal || p.codigo_principal === respuesta.producto.codigo_principal) &&
                p.surtido === 0 &&
                p.disponible !== 0
            );
          }

          if (prod) {
            prod = {
              ...prod,
              lote: prod.lote || respuesta.producto.lote || null,
              presentacion: respuesta.producto.presentacion || prod.presentacion || null,
              categoria: respuesta.producto.categoria || prod.categoria || "",
              subcategoria: respuesta.producto.subcategoria || prod.subcategoria || "",
              piezas_por_caja: respuesta.producto.piezas_por_caja || prod.piezas_por_caja || 0,
              codigo_principal: respuesta.producto.codigo_principal || prod.codigo_principal,
              alias_codigos: respuesta.producto.alias_codigos || prod.alias_codigos || [],
            };
          } else {
            await cargarProductos();
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            prod = productosConCategoria.find(
              (p) => 
                p.id === respuesta.producto.id &&
                p.surtido === 0 &&
                p.disponible !== 0
            );
            
            if (!prod) {
              prod = productosConCategoria.find(
                (p) => 
                  (p.codigo === respuesta.producto.codigo || 
                   p.codigo === respuesta.producto.codigo_principal ||
                   p.codigo_principal === respuesta.producto.codigo_principal) &&
                  p.surtido === 0 &&
                  p.disponible !== 0
              );
            }
            
            if (prod && respuesta.producto.codigo_principal) {
              prod = {
                ...prod,
                lote: prod.lote || respuesta.producto.lote || null,
                presentacion: respuesta.producto.presentacion || prod.presentacion || null,
                categoria: respuesta.producto.categoria || prod.categoria || "",
                subcategoria: respuesta.producto.subcategoria || prod.subcategoria || "",
                piezas_por_caja: respuesta.producto.piezas_por_caja || prod.piezas_por_caja || 0,
                codigo_principal: respuesta.producto.codigo_principal,
                alias_codigos: respuesta.producto.alias_codigos || [],
              };
            }
          }
        }
      } catch (err) {
        console.error("Error buscando producto por alias:", err);
      }
    } else {
      try {
        const respuesta = await authFetch(
          `${SERVER_URL}/productos/buscar/${encodeURIComponent(codigoEscaneado)}?canal=${encodeURIComponent(canalActual)}`
        );
        
        if (respuesta.encontrado && respuesta.producto && respuesta.producto.codigo_principal) {
          prod = {
            ...prod,
            lote: prod.lote || respuesta.producto.lote || null,
            presentacion: prod.presentacion || respuesta.producto.presentacion || null,
            categoria: prod.categoria || respuesta.producto.categoria || "",
            subcategoria: prod.subcategoria || respuesta.producto.subcategoria || "",
            piezas_por_caja: prod.piezas_por_caja || respuesta.producto.piezas_por_caja || 0,
            codigo_principal: respuesta.producto.codigo_principal,
            alias_codigos: respuesta.producto.alias_codigos || [],
          };
        }
      } catch (err) {
        console.error("Error enriqueciendo información del producto:", err);
      }
    }

    return prod;
  }, [productosConCategoria, SERVER_URL, canalActual]);

  const handleSurtirPorVoz = useCallback(async (codigo) => {
    const prod = await buscarProductoPorCodigoOAlias(codigo);

    if (!prod) {
      pushToast(`❌ Código ${codigo} no encontrado en pendientes`, "err");
      return;
    }

    pushToast(`🎤 Surtiendo producto ${codigo}...`, "ok");
    
    if (surtirFilaRef.current) {
      await surtirFilaRef.current(prod);
      pushToast(`✅ Producto ${codigo} surtido por voz`, "ok");
    }
  }, [buscarProductoPorCodigoOAlias, pushToast]);

  const handleComandoVoz = useCallback(async (transcript, normalizado) => {
    if (modalAbierto && prodModal) {
      const patronLote = /pina\s+cambia\s+lote\s+(.+)/i;
      const matchLote = normalizado.match(patronLote);
      if (matchLote) {
        const nuevoLote = matchLote[1].trim();
        setMNuevoLote(nuevoLote);
        pushToast(`✅ Lote cambiado a: ${nuevoLote}`, "ok");
        return;
      }
      
      const patronExtra = /pina\s+agrega\s+extra\s+de?\s*(\d+)/i;
      const matchExtra = normalizado.match(patronExtra);
      if (matchExtra) {
        const cantidad = parseInt(matchExtra[1]);
        setMExtras(cantidad);
        pushToast(`✅ Extras cambiados a: ${cantidad}`, "ok");
        return;
      }
      
      const patronPiezas = /pina\s+cambia\s+a\s+(\d+)\s+piezas?/i;
      const matchPiezas = normalizado.match(patronPiezas);
      if (matchPiezas) {
        const piezas = parseInt(matchPiezas[1]);
        setMPXC(piezas);
        pushToast(`✅ Piezas por caja cambiadas a: ${piezas}`, "ok");
        return;
      }
      
      if (/pina\s+surte/i.test(normalizado)) {
        if (surtirModalRef.current) {
          await surtirModalRef.current();
          pushToast(`✅ Producto surtido por voz`, "ok");
        }
        return;
      }
    }
    
    const patronSurteNombre = /pina\s+surte\s+(.+)/i;
    const matchSurteNombre = normalizado.match(patronSurteNombre);
    if (matchSurteNombre) {
      const nombreProducto = matchSurteNombre[1].trim();
      pushToast(`🔍 Buscando "${nombreProducto}" en pendientes...`, "ok");
      
      const prod = productosConCategoria.find(
        (p) => {
          const nombreLower = (p.nombre || "").toLowerCase();
          const nombreBuscado = nombreProducto.toLowerCase();
          return (nombreLower.includes(nombreBuscado) || nombreBuscado.includes(nombreLower)) &&
                 p.surtido === 0 && p.disponible !== 0;
        }
      );
      
      if (prod) {
        pushToast(`✅ Producto encontrado: ${prod.nombre}`, "ok");
        if (surtirFilaRef.current) {
          await surtirFilaRef.current(prod);
          pushToast(`✅ ${prod.nombre} surtido por voz`, "ok");
        }
      } else {
        pushToast(`❌ Producto "${nombreProducto}" no encontrado en pendientes`, "err");
      }
      return;
    }
    
    const patronAbrir = /pina\s+(.+)/i;
    const matchAbrir = normalizado.match(patronAbrir);
    if (matchAbrir) {
      const nombreProducto = matchAbrir[1].trim();
      
      if (/^\d+$/.test(nombreProducto)) {
        const prod = await buscarProductoPorCodigoOAlias(nombreProducto);
        if (prod && abrirModalRef.current) {
          abrirModalRef.current(prod);
          pushToast(`📦 ${prod.nombre} abierto`, "ok");
        } else {
          pushToast(`❌ Código ${nombreProducto} no encontrado`, "err");
        }
        return;
      }
      
      pushToast(`🔍 Buscando "${nombreProducto}" en pendientes...`, "ok");
      const prod = productosConCategoria.find(
        (p) => {
          const nombreLower = (p.nombre || "").toLowerCase();
          const nombreBuscado = nombreProducto.toLowerCase();
          return (nombreLower.includes(nombreBuscado) || nombreBuscado.includes(nombreLower)) &&
                 p.surtido === 0 && p.disponible !== 0;
        }
      );
      
      if (prod && abrirModalRef.current) {
        abrirModalRef.current(prod);
        pushToast(`📦 ${prod.nombre} abierto`, "ok");
      } else {
        pushToast(`❌ Producto "${nombreProducto}" no encontrado en pendientes`, "err");
      }
      return;
    }
  }, [modalAbierto, prodModal, productosConCategoria, pushToast, buscarProductoPorCodigoOAlias, abrirModalRef]);

  useEffect(() => {
    surtirFilaRef.current = surtirFila;
    abrirModalRef.current = abrirModal;
    surtirModalRef.current = surtirModal;
  }, [surtirFila, abrirModal, surtirModal]);

  const { isListening: vozEscuchando, error: vozError, toggle: toggleVoz } = useVoiceRecognition({
    onRegistrar: null, // No se usa en RegistrosPicking
    onSurtir: handleSurtirPorVoz,
    onComando: handleComandoVoz,
    enabled: filtro === "pendientes",
    wakeWords: ["pina", "ixora"],
    requireWakeWord: true
  });

  const handleScanKey = async (e) => {
    // Capturar Enter de DataWedge (puede venir como Enter, Return, o keyCode 13)
    const isEnter = e.key === "Enter" || 
                    e.key === "Return" || 
                    e.keyCode === 13 || 
                    e.which === 13;
    
    if (!isEnter) return;

    e.preventDefault();
    e.stopPropagation();

    const code = scan.trim() || scanBufferRef.current.trim();
    if (!code || code.length < 3) return;

    // Cancelar timeout pendiente
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    scanBufferRef.current = "";

    console.log("📱 [DataWedge] Enter detectado en RegistrosPicking, procesando código:", code);

    const prod = await buscarProductoPorCodigoOAlias(code);

    if (!prod) {
      pushToast(`❌ Código "${code}" no encontrado en pendientes. Verifica que el producto esté registrado en picking.`, "err");
      beepError();
      setScan("");
      return;
    }

    abrirModal(prod);
    beepSuccess();
    setScan("");

    // No enfocar aquí porque el modal está abierto
  };

  const handleScanRegistro = (value) => {
    scanBufferRef.current = value;

    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);

    // Usar delay para detectar escaneo rápido
    const delay = SCAN_DELAY;

    scanTimeoutRef.current = setTimeout(() => {
      const finalCode = scanBufferRef.current.trim();
      scanBufferRef.current = "";

      if (finalCode.length > 3) {
        procesarScanRegistro(finalCode);
      }
    }, delay);
  };

  const procesarScanRegistro = async (codigoEscaneado) => {
    try {
      const prod = await buscarProductoPorCodigoOAlias(codigoEscaneado);

      if (!prod) {
        pushToast(`❌ Código "${codigoEscaneado}" no encontrado en pendientes. Verifica que el producto esté registrado en picking.`, "err");
        beepError();

        setScan("");

        // Solo enfocar si no hay un input activo
        setTimeout(() => {
          const activeElement = document.activeElement;
          const isInputActive = activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.tagName === 'SELECT' ||
            activeElement.isContentEditable
          );
          
          if (!isInputActive) {
            scanRef.current?.focus({ preventScroll: true });
          }
        }, 100);

        return;
      }

      // Verificar si el producto está agotado (activo = 0)
      const codigoParaBuscar = prod.codigo_principal || prod.codigo;
      const productoInventario = inventario?.find((i) => i.codigo === codigoParaBuscar);
      const estaAgotado = productoInventario && Number(productoInventario.activo ?? 1) === 0;
      
      if (estaAgotado) {
        pushToast("Agotado", "warn");
        beepAlerta();
        setScan("");
        setTimeout(() => {
          const activeElement = document.activeElement;
          const isInputActive = activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.tagName === 'SELECT' ||
            activeElement.isContentEditable
          );
          
          if (!isInputActive) {
            scanRef.current?.focus({ preventScroll: true });
          }
        }, 100);
        return;
      }

      setProdModal(prod);
      setMCajas(prod.cajas || "");
      setMPXC(prod.piezas_por_caja || "");
      setMExtras(prod.extras || "");
      setMNuevoLote("");
      setTieneLotesRegistrados(false);
      setModalAbierto(true);
      
      try {
        const lotes = await authFetch(
          `${SERVER_URL}/inventario/lotes/${encodeURIComponent(prod.codigo)}/completo`
        );
        const tieneLotes = Array.isArray(lotes) && lotes.length > 0;
        setTieneLotesRegistrados(tieneLotes);
      } catch (err) {
        console.error("Error verificando lotes del producto:", err);
        setTieneLotesRegistrados(false);
      }
      
      pushToast(`📦 ${prod.nombre} detectado`, "ok");
      beepSuccess();

    } catch (err) {
      console.error("Error procesando scan en registros:", err);
    }
  };

  const marcarNoDisponible = async (motivo) => {
    if (!prodModal) return;

    // Asegurarse de que el motivo sea solo el texto limpio, sin concatenaciones
    const motivoLimpio = motivo.trim();

    // Actualizar el estado local inmediatamente con solo el motivo limpio
    setProductos((prev) =>
      prev.map((x) =>
        x.id === prodModal.id
          ? { ...x, observaciones: motivoLimpio, disponible: 0 }
          : x
      )
    );

    // Enviar al backend solo el motivo limpio
    await authFetch(`${SERVER_URL}/productos/${prodModal.id}/no-disponible`, {
      method: "PUT",
      body: JSON.stringify({ motivo: motivoLimpio }),
    });

    // Recargar productos para asegurar que se actualice desde el servidor
    await cargarProductos();
    
    // Mostrar mensaje específico según el motivo
    let mensaje = "";
    if (motivoLimpio === "Agotado") {
      mensaje = `❌ ${prodModal.codigo} se marcó como agotado`;
    } else if (motivoLimpio === "No surtido en batería" || motivoLimpio === "No surtido en rack") {
      mensaje = `⚠️ ${prodModal.codigo} marcado como no surtido en rack`;
    } else if (motivoLimpio === "Cambio de lote") {
      mensaje = `🔄 ${prodModal.codigo} marcado con cambio de lote`;
    } else {
      mensaje = `🚫 ${prodModal.codigo} marcado como NO disponible`;
    }
    
    pushToast(mensaje, "err");
    beepAlerta();

    setModalAbierto(false);
    setMostrarND(false);
    setScan("");
    
    // Solo enfocar después de un breve delay, pero no si el usuario está en otro input
    setTimeout(() => {
      const activeElement = document.activeElement;
      const isInputActive = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.tagName === 'SELECT' ||
        activeElement.isContentEditable
      );
      
      if (!isInputActive) {
        scanRef.current?.focus();
      }
    }, 200);
  };

  useEffect(() => {
    const handleScanFocus = (e) => {
      // Solo enfocar si no hay un input activo y no está en el modal
      if (!modalAbierto) {
        const activeElement = document.activeElement;
        const isInputActive = activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.tagName === 'SELECT' ||
          activeElement.isContentEditable
        );
        
        // Solo enfocar si no hay un input activo y la tecla no es Tab o Enter
        if (!isInputActive && e.key !== 'Tab' && e.key !== 'Enter') {
          scanRef.current?.focus({ preventScroll: true });
        }
      }
    };

    window.addEventListener("keydown", handleScanFocus);
    return () => window.removeEventListener("keydown", handleScanFocus);
  }, [modalAbierto]);

  return (
    <div className="card">
      <div className="registros-header">
        <h2 className="registros-titulo">Registros del día</h2>
        <div className="registros-acciones">
          {cambiarModulo && (
            <button
              onClick={() => cambiarModulo(moduloPicking || "escaneo")}
              className="btn-picking"
              title="Ir a Picking"
            >
              ✓ <span className="btn-picking-texto">Picking</span>
            </button>
          )}
          {filtro === "pendientes" && (
            <>
              <button
                onClick={toggleVoz}
                className={`btn-microfono ${vozEscuchando ? 'activo' : ''}`}
                title={vozEscuchando ? 'Micrófono activo - Click para desactivar' : 'Micrófono inactivo - Click para activar'}
              >
                🎤
              </button>
              {vozError && (
                <span style={{ fontSize: '12px', color: '#f44336' }}>
                  ⚠️ {vozError}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <input
        type="text"
        className="scan-input-reg"
        placeholder="Codigo"
        value={scan}
        inputMode="none"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        onFocus={() => {
          const el = scanRef.current;
          if (el) el.setSelectionRange(el.value.length, el.value.length);
        }}

        onChange={(e) => {
          const val = e.target.value;
          setScan(val);
          handleScanRegistro(val);
        }}
        onKeyDown={handleScanKey}
        onKeyPress={(e) => {
          // Capturar también keyPress para DataWedge
          if (e.key === "Enter" || e.charCode === 13) {
            e.preventDefault();
            handleScanKey(e);
          }
        }}
        ref={scanRef}
      />

      <div className="registros-tabs">
        <button
          className={filtro === "pendientes" ? "tab-activa" : ""}
          onClick={() => setFiltro("pendientes")}
        >
          <span className="tab-icon">🕒</span>
          <span className="tab-label">Por surtir</span>
        </button>

        <button
          className={filtro === "surtido" ? "tab-activa" : ""}
          onClick={() => setFiltro("surtido")}
        >
          <span className="tab-icon">✅</span>
          <span className="tab-label">Surtido</span>
        </button>

        <button
          className={filtro === "devoluciones" ? "tab-activa" : ""}
          onClick={() => setFiltro("devoluciones")}
        >
          <span className="tab-icon">🔄</span>
          <span className="tab-label">Devoluciones</span>
        </button>

        <button
          className={filtro === "importacion" ? "tab-activa" : ""}
          onClick={() => setFiltro("importacion")}
        >
          <span className="tab-icon">🌎</span>
          <span className="tab-label">Importación</span>
        </button>

        <button
          className={filtro === "no-disponibles" ? "tab-activa" : ""}
          onClick={() => setFiltro("no-disponibles")}
        >
          <span className="tab-icon">🚫</span>
          <span className="tab-label">No disponibles</span>
        </button>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <input
          type="text"
          placeholder="🔍 Buscar por código, nombre o lote..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 15px',
            fontSize: '0.95rem',
            border: '2px solid var(--borde-sutil)',
            borderRadius: '8px',
            background: 'var(--fondo-card)',
            color: 'var(--texto-principal)',
            transition: 'border-color 0.2s ease',
          }}
          onFocus={(e) => e.target.style.borderColor = 'var(--azul-primario)'}
          onBlur={(e) => e.target.style.borderColor = 'var(--borde-sutil)'}
        />
      </div>

      <div className="registros-contadores">
        <div className="contador-card">
          <span className="contador-icon">🗳️</span>
          <span className="contador-titulo">Productos surtidos</span>
          <span className="contador-valor">{productosUnicosSurtidos}</span>
        </div>

        <div className="contador-card">
          <span className="contador-icon">📦</span>
          <span className="contador-titulo">Cajas surtidas</span>
          <span className="contador-valor">{totalCajasSurtidas}</span>
        </div>

        <div className="contador-card">
          <span className="contador-icon">🔢</span>
          <span className="contador-titulo">Piezas surtidas</span>
          <span className="contador-valor">{totalPiezasSurtidas}</span>
        </div>
      </div>

      <div className="tabla-container registros-tabla">
        <table className="tabla-registros">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Código</th>
              <th>Nombre</th>
              <th>Lote</th>
              <th>Cajas</th>
              <th>Piezas</th>
              <th>Extras</th>
              <th>Total</th>
              <th>Observaciones</th>
              <th>Surtido</th>
              <th>Disponible</th>
              <th>Hora Solicitud</th>
              <th>Hora Surtido</th>
              <th>Categoría</th>
              <th>Acción</th>
            </tr>
          </thead>

          <tbody>
            {productosConCategoria
              .filter((p) => {
                if (filtro === "pendientes") {
                  return p.surtido === 0 && p.disponible !== 0;
                }

                if (filtro === "surtido") {
                  const esDevolucion = p.origen === 'devoluciones';
                  const esImportado = p.esImportacion === true;
                  // Solo mostrar productos surtidos (excluir devoluciones e importación)
                  return p.surtido === 1 && !esDevolucion && !esImportado;
                }

                if (filtro === "devoluciones") {
                  return p.origen === 'devoluciones';
                }

                if (filtro === "importacion") {
                  // SOLO mostrar productos de importación que estén surtidos
                  const esImportado = p.esImportacion === true;
                  return p.surtido === 1 && esImportado;
                }

                if (filtro === "no-disponibles") {
                  // Mostrar productos marcados como no disponibles
                  return p.disponible === 0;
                }

                return true;
              })
              .filter((p) => {
                // Filtro de búsqueda
                if (!busqueda.trim()) return true;
                
                const terminoBusqueda = busqueda.toLowerCase().trim();
                const codigo = (p.codigo || '').toLowerCase();
                const nombre = (p.nombre || '').toLowerCase();
                const lote = (p.lote || '').toLowerCase();
                
                return codigo.includes(terminoBusqueda) || 
                       nombre.includes(terminoBusqueda) || 
                       lote.includes(terminoBusqueda);
              })
              .sort((a, b) => {
                // Ordenar: NO surtidos (0) primero, surtidos (1) después
                return a.surtido - b.surtido;
              })
              .map((p) => {
                const filaRoja = p.disponible === 0;
                const filaVerde = p.surtido === 1 && p.disponible === 1;

                const total = p.origen === 'devoluciones'
                  ? (Number(p.piezas) || 0) + (Number(p.extras) || 0)
                  : (Number(p.cajas) || 0) * (Number(p.piezas_por_caja) || 0) + (Number(p.extras) || 0);

                const formId = `form-piezas-${p.id}`;

                return (
                  <tr
                    key={p.id}
                    className={
                      filaRoja ? "fila-roja" : filaVerde ? "fila-verde" : ""
                    }
                  >
                    <td>
                      {p.fecha ||
                        p.fecha_solicitud ||
                        new Date().toLocaleDateString("es-MX", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                    </td>

                    <td>
                      {!p.surtido && p.disponible !== 0 ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            abrirModal(p);
                          }}
                          style={{ 
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--texto-principal)',
                            cursor: 'pointer',
                            padding: 0,
                            fontSize: 'inherit',
                            fontWeight: 'inherit',
                            textDecoration: 'underline',
                            textAlign: 'left'
                          }}
                          title="Click para surtir"
                          onMouseEnter={(e) => {
                            e.target.style.color = 'var(--azul-primario)';
                            e.target.style.fontWeight = 'bold';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.color = 'var(--texto-principal)';
                            e.target.style.fontWeight = 'inherit';
                          }}
                        >
                          {p.codigo}
                        </button>
                      ) : (
                        <span>{p.codigo}</span>
                      )}
                    </td>

                    <td>
                      <div className="nombre-reg">
                        {(() => {
                          const nombre = (p.nombre || "").trim();
                          const info = inventario?.find((i) => i.codigo === p.codigo);
                          const presentacionInventario = (info?.presentacion || "").trim();
                          
                          if (!presentacionInventario) {
                            return nombre;
                          }
                          
                          const patronPresentacion = new RegExp(`\\s*-\\s*${presentacionInventario.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
                          if (patronPresentacion.test(nombre)) {
                            return nombre;
                          }
                          
                          if (nombre.includes(" - ")) {
                            const nombreBase = nombre.split(" - ")[0].trim();
                            return `${nombreBase} - ${presentacionInventario}`;
                          }
                          
                          return `${nombre} - ${presentacionInventario}`;
                        })()}
                      </div>
                    </td>

                    <td>
                      <input
                        type="text"
                        value={p.lote || ""}
                        disabled={p.surtido || p.disponible === 0}
                        onChange={(e) =>
                          setProductos((prev) =>
                            prev.map((x) =>
                              x.id === p.id
                                ? { ...x, lote: e.target.value }
                                : x
                            )
                          )
                        }
                        onBlur={async (e) => {
                          const nuevo = (e.target.value || "").trim();
                          try {
                            await authFetch(
                              `${SERVER_URL}/inventario/lote-por-codigo`,
                              {
                                method: "PUT",
                                body: JSON.stringify({
                                  codigo: p.codigo,
                                  lote: nuevo || null,
                                }),
                              }
                            );
                          } catch { }
                        }}
                        className="input-lote"
                      />
                    </td>

                    <td>
                      <input
                        type="number"
                        value={p.cajas}
                        disabled={p.surtido || p.disponible === 0}
                        onChange={(e) =>
                          setProductos((prev) =>
                            prev.map((x) =>
                              x.id === p.id
                                ? { ...x, cajas: e.target.value }
                                : x
                            )
                          )
                        }
                        className="input-numero"
                      />
                    </td>

                    <td>
                      <form
                        id={formId}
                        onSubmit={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!p.surtido && p.disponible !== 0) {
                            await surtirFila(p);
                          }
                        }}
                      >
                        <input
                          type="number"
                          value={p.piezas_por_caja ?? ""}
                          disabled={p.surtido || p.disponible === 0}
                          onChange={(e) =>
                            setProductos((prev) =>
                              prev.map((x) =>
                                x.id === p.id
                                  ? {
                                    ...x,
                                    piezas_por_caja:
                                      Number(e.target.value) || 0,
                                    piezas:
                                      Number(x.cajas || 0) *
                                      (Number(e.target.value) || 0) +
                                      Number(x.extras || 0),
                                  }
                                  : x
                              )
                            )
                          }
                          className="input-numero"
                        />

                        <button
                          type="submit"
                          style={{ display: "none" }}
                          aria-hidden="true"
                        />
                      </form>
                    </td>

                    <td>
                      <input
                        type="number"
                        value={p.extras || ""}
                        disabled={p.surtido || p.disponible === 0}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          setProductos((prev) =>
                            prev.map((x) =>
                              x.id === p.id
                                ? {
                                    ...x,
                                    extras: val,
                                    piezas:
                                      Number(x.cajas || 0) *
                                      Number(x.piezas_por_caja || 0) +
                                      val,
                                  }
                                : x
                            )
                          );
                        }}
                        className="input-numero"
                      />
                    </td>

                    <td>{total}</td>

                    <td>
                      <input
                        type="text"
                        value={p.observaciones || ""}
                        disabled={p.surtido || p.disponible === 0}
                        onChange={(e) =>
                          setProductos((prev) =>
                            prev.map((x) =>
                              x.id === p.id
                                ? { ...x, observaciones: e.target.value }
                                : x
                            )
                          )
                        }
                        className="input-observaciones"
                      />
                    </td>

                    <td>{p.surtido ? "✅" : "❌"}</td>

                    <td>
                      {p.disponible === 0 ? (
                        <button
                          className="btn-surtir"
                          onClick={async () => {
                            await authFetch(
                              `${SERVER_URL}/productos/${p.id}/disponible`,
                              { method: "PUT" }
                            );
                            cargarProductos();
                            beepSuccess();
                          }}
                        >
                          Disponible
                        </button>
                      ) : (
                        <select
                          onChange={async (e) => {
                            const motivo = e.target.value;
                            if (!motivo) return;

                            // Asegurarse de que el motivo sea solo el texto limpio
                            const motivoLimpio = motivo.trim();

                            // Reemplazar completamente las observaciones (no agregar)
                            setProductos((prev) =>
                              prev.map((x) =>
                                x.id === p.id
                                  ? { ...x, observaciones: motivoLimpio, disponible: 0 }
                                  : x
                              )
                            );

                            await authFetch(
                              `${SERVER_URL}/productos/${p.id}/no-disponible`,
                              {
                                method: "PUT",
                                body: JSON.stringify({ motivo: motivoLimpio }),
                              }
                            );

                            await cargarProductos();
                            
                            // Mostrar mensaje específico según el motivo
                            let mensaje = "";
                            if (motivoLimpio === "Agotado") {
                              mensaje = `❌ ${p.codigo} se marcó como agotado`;
                            } else if (motivoLimpio === "No surtido en batería") {
                              mensaje = `⚠️ ${p.codigo} marcado como no surtido en rack`;
                            } else if (motivoLimpio === "Cambio de lote") {
                              mensaje = `🔄 ${p.codigo} marcado con cambio de lote`;
                            } else {
                              mensaje = `🚫 ${p.codigo} marcado como NO disponible`;
                            }
                            
                            pushToast(mensaje, "err");
                            beepAlerta();
                          }}
                          defaultValue=""
                          style={{
                            borderRadius: "8px",
                            padding: "4px",
                            background: "#ffb347",
                            color: "#000",
                          }}
                        >
                          <option value="" disabled>
                            No disponible
                          </option>
                          <option value="Agotado">Agotado</option>
                          <option value="No surtido en batería">
                            No surtido en batería
                          </option>
                          <option value="Cambio de lote">
                            Cambio de lote
                          </option>
                        </select>
                      )}
                    </td>

                    <td>{p.hora_solicitud || "-"}</td>
                    <td>{p.hora_surtido || "-"}</td>
                    <td>{p.categoria || "-"}</td>

                    <td>
                      {p.surtido || p.disponible === 0 ? (
                        <button
                          className="btn-corregir"
                          onClick={async () => {
                            const { cajas, piezas, observaciones } = p;

                            await authFetch(`${SERVER_URL}/productos/${p.id}`, {
                              method: "PUT",
                              body: JSON.stringify({
                                cajas,
                                piezas,
                                observaciones,
                                surtido: 0,
                                disponible: 1,
                              }),
                            });

                            cargarProductos();
                            beepSuccess();
                          }}
                        >
                          Corregir
                        </button>
                      ) : (
                        <button
                          className="btn-borrar"
                          onClick={async () => {
                            const confirmado = await showConfirm("¿Borrar registro del día permanentemente?", "Confirmar eliminación");
                            if (!confirmado) return;

                            try {
                              await authFetch(
                                `${SERVER_URL}/productos/${p.id}/borrar`,
                                { method: "DELETE" }
                              );

                              cargarProductos();
                              await showAlert("✅ Registro eliminado permanentemente", "success");
                              beepSuccess();
                            } catch {
                              showAlert("❌ Error al eliminar el registro", "error");
                              beepError();
                            }
                          }}
                        >
                          Borrar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

            {productosConCategoria.length === 0 && (
              <tr>
                <td colSpan={15} style={{ opacity: 0.7 }}>
                  No hay registros hoy.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAbierto && prodModal && (
        <div
          className="reg-modal-backdrop"
          onClick={() => setModalAbierto(false)}
        >
          <div
            className="reg-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Surtir producto</h3>

            <p>
              <strong>{prodModal.codigo}</strong>
            </p>
            <p>{prodModal.nombre}</p>

            <div className="reg-modal-row">
              <div className="reg-modal-col">
                <label>Lote actual:</label>
                <input type="text" value={prodModal.lote || ""} disabled />
              </div>
              <div className="reg-modal-col">
                <label>
                  {prodModal.lote?.trim()
                    ? "Nuevo lote (opcional):"
                    : "Nuevo lote (requerido):"}
                </label>
                <input
                  type="text"
                  value={mNuevoLote}
                  onChange={(e) => setMNuevoLote(e.target.value)}
                  placeholder={
                    prodModal.lote?.trim()
                      ? "Nuevo lote"
                      : "Ingresa un lote (obligatorio)"
                  }
                  style={{
                    borderColor:
                      !prodModal.lote?.trim() && !mNuevoLote.trim()
                        ? "#ff6b6b"
                        : undefined,
                  }}
                />
                {!tieneLotesRegistrados && (
                  <div
                    style={{
                      marginTop: "4px",
                      padding: "3px 6px",
                      backgroundColor: "rgba(245, 158, 11, 0.08)",
                      border: "1px solid rgba(245, 158, 11, 0.25)",
                      borderRadius: "3px",
                      fontSize: "10px",
                      color: "var(--advertencia, #f59e0b)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "3px",
                      lineHeight: "1.2",
                      width: "100%",
                    }}
                  >
                    <span style={{ fontSize: "10px", opacity: 0.7, flexShrink: 0 }}>⚠️</span>
                    <span style={{ opacity: 0.9 }}>
                      Sin lotes registrados. El lote ingresado se registrará automáticamente al surtir.
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="reg-modal-row-three">
              <div className="reg-modal-col-three">
                <label>Cajas:</label>
                <input
                  type="number"
                  value={mCajas}
                  ref={refCajas}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      refPXC.current?.focus();
                      e.preventDefault();
                    }
                  }}
                  onChange={(e) =>
                    setMCajas(e.target.value === "" ? "" : Number(e.target.value))
                  }
                />
              </div>
              <div className="reg-modal-col-three">
                <label>Piezas por caja:</label>
                <input
                  type="number"
                  value={mPXC}
                  ref={refPXC}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      refExtras.current?.focus();
                      e.preventDefault();
                    }
                  }}
                  onChange={(e) =>
                    setMPXC(e.target.value === "" ? "" : Number(e.target.value))
                  }
                />
              </div>
              <div className="reg-modal-col-three">
                <label>Extras (pz):</label>
                <input
                  type="number"
                  value={mExtras}
                  ref={refExtras}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      surtirModal();
                      e.preventDefault();
                    }
                  }}
                  onChange={(e) =>
                    setMExtras(e.target.value === "" ? "" : Number(e.target.value))
                  }
                />
              </div>
            </div>

            <div className="total-box">
              Total piezas:{" "}
              <strong>
                {(Number(mCajas) || 0) * (Number(mPXC) || 0) +
                  (Number(mExtras) || 0)}
              </strong>
            </div>

            <div style={{ textAlign: "center", marginBottom: "10px" }}>
              <button
                className="btn-bloqueo"
                onClick={() => setMostrarND(!mostrarND)}
                style={{
                  padding: "8px 12px",
                  background: "#ffcc00",
                  borderRadius: "10px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "16px",
                  marginBottom: "5px",
                }}
              >
                🚫
              </button>

              {mostrarND && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    marginTop: "8px",
                  }}
                >
                  <button
                    onClick={() => marcarNoDisponible("Agotado")}
                    style={{
                      padding: "6px",
                      borderRadius: "8px",
                      border: "1px solid #aaa",
                      cursor: "pointer",
                      background: "#f4f4f4",
                    }}
                  >
                    ❌ A
                  </button>

                  <button
                    onClick={() => marcarNoDisponible("No surtido en batería")}
                    style={{
                      padding: "6px",
                      borderRadius: "8px",
                      border: "1px solid #aaa",
                      cursor: "pointer",
                      background: "#f4f4f4",
                    }}
                  >
                    ⛔ NSR
                  </button>

                  <button
                    onClick={() => marcarNoDisponible("Cambio de lote")}
                    style={{
                      padding: "6px",
                      borderRadius: "8px",
                      border: "1px solid #aaa",
                      cursor: "pointer",
                      background: "#f4f4f4",
                    }}
                  >
                    🔄 CL
                  </button>
                </div>
              )}
            </div>

            <div className="modal-buttons">
              <button
                className="btn-cancelar"
                onClick={() => setModalAbierto(false)}
              >
                Cancelar
              </button>

              <button
                className="btn-surtir"
                ref={refBtnSurtir}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!prodModal || (!mNuevoLote.trim() && !prodModal.lote?.trim())) {
                    return;
                  }
                  surtirModal();
                }}
                disabled={
                  !prodModal ||
                  (!mNuevoLote.trim() && !prodModal.lote?.trim())
                }
                style={{
                  opacity:
                    !prodModal ||
                    (!mNuevoLote.trim() && !prodModal.lote?.trim())
                      ? 0.5
                      : 1,
                  cursor:
                    !prodModal ||
                    (!mNuevoLote.trim() && !prodModal.lote?.trim())
                      ? "not-allowed"
                      : "pointer",
                  pointerEvents: 
                    !prodModal ||
                    (!mNuevoLote.trim() && !prodModal.lote?.trim())
                      ? "none"
                      : "auto",
                }}
                title={
                  !prodModal ||
                  (!mNuevoLote.trim() && !prodModal.lote?.trim())
                    ? "Debes ingresar un lote antes de surtir"
                    : "Surtir producto"
                }
              >
                Surtir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


