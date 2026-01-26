import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import "./DevolucionesProceso.css";
import { useAuth } from "../../AuthContext";
import { safeFocus } from "../../utils/focusHelper";
import { useAlert } from "../../components/AlertModal";

export default function DevolucionesProceso({ serverUrl, pushToast, user, onProductoEditado, socket }) {
  const { authFetch } = useAuth();
  const { showConfirm } = useAlert();
  const inputPedidoRef = useRef(null);

  const [numeroPedido, setNumeroPedido] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [fase, setFase] = useState(1);

  const [guia, setGuia] = useState("");
  const [paqueteria, setPaqueteria] = useState("");
  const [motivo, setMotivo] = useState("");

  const [evidenciasPaquete, setEvidenciasPaquete] = useState([]);
  const fileInputPaqueteRef = useRef(null);
  const cameraInputPaqueteRef = useRef(null);
  const [showCamModalPaquete, setShowCamModalPaquete] = useState(false);
  const [camStreamPaquete, setCamStreamPaquete] = useState(null);
  const videoRefPaquete = useRef(null);

  const fileInputEvidenciasRef = useRef(null);
  const cameraInputEvidenciasRef = useRef(null);
  const [showCamModalEvidencias, setShowCamModalEvidencias] = useState(false);
  const [camStreamEvidencias, setCamStreamEvidencias] = useState(null);
  const videoRefEvidencias = useRef(null);

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  const [productoActual, setProductoActual] = useState({
    codigo: "",
    nombre: "",
    presentacion: "",
    lote: "",
    cantidad: "",
    caducidad: "",
  });
  
  const timeoutEscaneo = useRef(null);
  const codigoAnterior = useRef("");
  const [productos, setProductos] = useState([]);

  const [evidencias, setEvidencias] = useState([]);
  const [fotoGrande, setFotoGrande] = useState(null);

  const [subTab, setSubTab] = useState("pedidos");
  const [listaPedidos, setListaPedidos] = useState([]);
  const [listaProductosGeneral, setListaProductosGeneral] = useState([]);

  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const [qrPedido, setQrPedido] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  
  const [devolucionTemporalId, setDevolucionTemporalId] = useState(null);
  
  const [detallePedido, setDetallePedido] = useState(null);
  const [detalleOpen, setDetalleOpen] = useState(false);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerFotos, setViewerFotos] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  
  const [resumenModal, setResumenModal] = useState({
    open: false,
    loading: false,
    data: []
  });
  
  const [productosPedidoModal, setProductosPedidoModal] = useState({
    open: false,
    pedido: null,
    productos: [],
    loading: false
  });
  const [editandoProducto, setEditandoProducto] = useState({});

  // ==========================
  // MODAL NUEVO CÓDIGO
  // ==========================
  const [showModalNuevoCodigo, setShowModalNuevoCodigo] = useState(false);
  const [codigoNuevoDetectado, setCodigoNuevoDetectado] = useState("");
  const [inventarioBusqueda, setInventarioBusqueda] = useState("");
  const [resultadosInv, setResultadosInv] = useState([]);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);

  const [inventarioRef, setInventarioRef] = useState([]);

  // ==========================
  // Cargar inventario (para nuevo código)
  // ==========================
  useEffect(() => {
    const load = async () => {
      try {
        const d = await authFetch(`${serverUrl}/inventario`);
        setInventarioRef(Array.isArray(d) ? d : []);
      } catch (err) {
        console.error(err);
      }
    };
    load();
  }, [serverUrl]);

  // ==========================
  // BÚSQUEDA PARA MODAL DE NUEVO CÓDIGO
  // ==========================
  useEffect(() => {
    if (!inventarioBusqueda.trim()) {
      setResultadosInv([]);
      return;
    }

    const txt = inventarioBusqueda.toLowerCase();
    const filtrados = inventarioRef.filter(
      (p) =>
        p.nombre.toLowerCase().includes(txt) ||
        p.codigo.toLowerCase().includes(txt)
    );

    setResultadosInv(filtrados);
  }, [inventarioBusqueda, inventarioRef]);

  // ==========================
  // ENFOCAR INPUT PRINCIPAL
  // ==========================
  useEffect(() => {
    if (!showModal && inputPedidoRef.current) {
      inputPedidoRef.current.focus();
      inputPedidoRef.current.select?.();
    }
  }, [showModal]);

  // ==========================
  // CARGAR PEDIDOS
  // ==========================
  const cargarPedidos = useCallback(async () => {
    try {
      // Cargar SOLO pedidos de DEVOLUCIONES (no reenvíos)
      const d = await authFetch(`${serverUrl}/devoluciones/clientes/pedidos?area=Clientes`);
      // Filtrar solo pedidos de devoluciones por si acaso
      const pedidosDevoluciones = (d || []).filter(p => p && !p.esReenvio);
      setListaPedidos(pedidosDevoluciones);
    } catch (err) {
      console.error("Error cargando pedidos de devoluciones:", err);
      setListaPedidos([]);
    }
  }, [serverUrl, authFetch]);

  const cargarProductosGeneral = useCallback(async () => {
    try {
      const d = await authFetch(`${serverUrl}/devoluciones/clientes/productos-general`);
      setListaProductosGeneral(Array.isArray(d) ? d : []);
    } catch (err) {
      console.error("Error cargando productos general:", err);
      setListaProductosGeneral([]);
    }
  }, [serverUrl, authFetch]);

  // Cargar fotos de un pedido
  const cargarFotosPedido = async (pedidoId, origen = "actual") => {
    try {
      const fotos = await authFetch(`${serverUrl}/devoluciones/clientes/fotos/${pedidoId}?origen=actual`);
      console.log("📸 Fotos recibidas del servidor:", fotos);
      // Usar la URL que viene del servidor (ya incluye la ruta completa)
      const urls = (fotos || []).map(f => {
        if (f.url) {
          return f.url;
        }
        // Fallback: construir URL manualmente
        const url = `${serverUrl}/devoluciones/foto/${pedidoId}/${encodeURIComponent(f.path.split('/').pop() || f.path)}`;
        console.log("📸 URL construida:", url);
        return url;
      });
      console.log("📸 URLs finales:", urls);
      return urls;
    } catch (err) {
      console.error("❌ Error cargando fotos:", err);
      return [];
    }
  };
  
  // Abrir detalle de pedido
  const abrirDetallePedido = async (pedido) => {
    const fotos = await cargarFotosPedido(pedido.id, "actual");
    setDetallePedido({ ...pedido, fotos });
    setDetalleOpen(true);
  };
  
  // Abrir modal de productos de un pedido
  const abrirProductosPedido = async (pedido, e) => {
    if (e) {
      e.stopPropagation();
    }
    setProductosPedidoModal({ open: true, pedido, productos: [], loading: true });
    try {
      // Cargar TODOS los productos del pedido sin filtrar por origen
      // Esto asegura que las tarjetas mantengan todos los productos originales
      const productos = await authFetch(`${serverUrl}/devoluciones/clientes/pedidos/${pedido.id}/productos`);
      // NO filtrar por origen - mostrar TODOS los productos del pedido
      setProductosPedidoModal({ open: true, pedido, productos: Array.isArray(productos) ? productos : [], loading: false });
    } catch (err) {
      console.error("Error cargando productos:", err);
      setProductosPedidoModal({ open: true, pedido, productos: [], loading: false });
      pushToast?.("❌ Error cargando productos", "error");
    }
  };

  // Eliminar pedido
  const eliminarPedido = async (pedido, e) => {
    if (e) {
      e.stopPropagation();
    }
    
    const confirmado = await showConfirm(`¿Estás seguro de eliminar el pedido ${pedido.pedido}? Esto eliminará también todos sus productos.`);
    if (!confirmado) {
      return;
    }
    
    // Eliminar de la lista local INMEDIATAMENTE (antes de la petición)
    // Esto asegura que el pedido desaparezca de la vista aunque falle la petición
    const pedidoId = pedido.id;
    setListaPedidos(prev => {
      const nuevaLista = prev.filter(p => p.id !== pedidoId);
      return nuevaLista;
    });
    
    try {
      const data = await authFetch(`${serverUrl}/devoluciones/clientes/pedidos/${pedidoId}`, {
        method: 'DELETE'
      });
      
      // Actualizar estado local SIN recargar
      setListaPedidos((prevPedidos) => prevPedidos.filter((p) => p.id !== pedido.id));
      pushToast?.(data.message || "✅ Pedido eliminado correctamente", "ok");
    } catch (err) {
      // Si es un error 404 (not found), el pedido ya fue eliminado de la lista
      // NO recargar la lista para evitar que vuelva a aparecer
      if (err.isNotFound || err.message?.includes("404") || err.message?.includes("no encontrado") || err.message?.includes("Not Found") || err.message?.includes("Pedido no encontrado")) {
        pushToast?.("ℹ️ El pedido ya no existe en el servidor. Se eliminó de la lista.", "info");
        // NO recargar para evitar que vuelva a aparecer si está en otra fuente
        return; // Salir silenciosamente sin loguear error
      }
      
      // Si hay otro error, mostrar el mensaje pero el pedido ya fue eliminado de la lista
      console.error("Error eliminando pedido:", err);
      const errorMessage = err.message || err.toString() || "";
      pushToast?.(`⚠️ Error al eliminar el pedido en el servidor, pero se eliminó de la lista. ${errorMessage}`, "info");
      // Recargar para sincronizar después de un pequeño delay
      setTimeout(() => {
        cargarPedidos();
      }, 100);
    }
  };


  // ============================================================
  // GENERAR TOKEN MÓVIL Y MOSTRAR QR
  // ============================================================
  const generarTokenMovil = async (devolucionId, pedidoNombre) => {
    try {
      setQrLoading(true);
      const response = await authFetch(`${serverUrl}/devoluciones/clientes/${devolucionId}/mobile-token`, {
        method: "POST",
      });

      if (response.ok && response.mobileUrl) {
        setQrUrl(response.mobileUrl);
        setQrPedido(pedidoNombre || response.pedido || "");
        setQrModalOpen(true);
      } else {
        pushToast?.("❌ Error generando código QR", "err");
      }
    } catch (error) {
      console.error("Error generando token móvil:", error);
      pushToast?.("❌ Error generando código QR", "err");
    } finally {
      setQrLoading(false);
    }
  };

  // Recargar modal de activación si está abierto
  const recargarResumenModal = async () => {
    if (resumenModal.open) {
      setResumenModal(prev => ({ ...prev, loading: true }));
      try {
        const data = await authFetch(`${serverUrl}/devoluciones/clientes/productos/resumen?area=Clientes`);
        setResumenModal({
          open: true,
          loading: false,
          data: Array.isArray(data) ? data : []
        });
      } catch (err) {
        console.error("Error recargando resumen:", err);
        setResumenModal(prev => ({ ...prev, loading: false }));
      }
    }
  };
  
  // Viewer de fotos
  const abrirViewer = (fotosArray, index = 0) => {
    if (!Array.isArray(fotosArray) || !fotosArray.length) return;
    setViewerFotos(fotosArray);
    setViewerIndex(index);
    setViewerOpen(true);
  };
  
  const cerrarViewer = () => {
    setViewerOpen(false);
    setViewerFotos([]);
    setViewerIndex(0);
  };
  
  const viewerPrev = () => {
    if (!viewerFotos.length) return;
    setViewerIndex((idx) => (idx === 0 ? viewerFotos.length - 1 : idx - 1));
  };
  
  const viewerNext = () => {
    if (!viewerFotos.length) return;
    setViewerIndex((idx) => (idx === viewerFotos.length - 1 ? 0 : idx + 1));
  };

  useEffect(() => {
    cargarPedidos();
    cargarProductosGeneral();
  }, [serverUrl]);

  // Contadores de productos general: NO APTOS, ACTIVOS y NO ACTIVOS
  const contadores = useMemo(() => {
    // NO APTOS: productos que NO son aptos (apto !== 1, true, '1')
    const noAptos = listaProductosGeneral.filter(p => {
      const apto = p.apto;
      return apto !== 1 && apto !== true && apto !== '1';
    }).length;
    
    // ACTIVOS: productos que están activos (activo === 1, true, '1')
    const activos = listaProductosGeneral.filter(p => {
      const activo = p.activo;
      return activo === 1 || activo === true || activo === '1';
    }).length;
    
    // NO ACTIVOS: productos que NO están activos PERO SÍ son aptos (pueden activarse)
    // Excluir los productos no aptos de este contador
    const noActivos = listaProductosGeneral.filter(p => {
      const activo = p.activo;
      const apto = p.apto;
      const esApto = apto === 1 || apto === true || apto === '1';
      const noEstaActivo = activo !== 1 && activo !== true && activo !== '1';
      // Solo contar los que son aptos Y no están activos (pueden activarse)
      return esApto && noEstaActivo;
    }).length;
    
    return { noAptos, activos, noActivos };
  }, [listaProductosGeneral]);

  // Escuchar eventos de actualización de productos general
  useEffect(() => {
    if (!socket) return;

    const handleProductosGeneralActualizados = () => {
      cargarProductosGeneral();
    };

    socket.on('productos_general_actualizados', handleProductosGeneralActualizados);
    
    return () => {
      socket.off('productos_general_actualizados', handleProductosGeneralActualizados);
    };
  }, [socket, cargarProductosGeneral]);

  // Escuchar eventos de socket para actualización en tiempo real
  useEffect(() => {
    if (!socket) return;

    // Limpiar listeners anteriores antes de registrar nuevos
    socket.off('pedido_eliminado');
    socket.off('devoluciones_actualizadas');
    socket.off('pedido_agregado');

    const handlePedidoEliminado = (data) => {
      cargarPedidos();
    };
    
    const handleDevolucionesActualizadas = () => {
      console.log('📡 Evento devoluciones_actualizadas recibido, recargando pedidos...');
      cargarPedidos();
    };

    const handlePedidoAgregado = (data) => {
      cargarPedidos();
      // También recargar productos general cuando se agrega un pedido
      cargarProductosGeneral();
    };
    
    // Eventos de socket
    socket.on('pedido_eliminado', handlePedidoEliminado);
    socket.on('devoluciones_actualizadas', handleDevolucionesActualizadas);
    socket.on('pedido_agregado', handlePedidoAgregado);
    
    return () => {
      socket.off('pedido_eliminado', handlePedidoEliminado);
      socket.off('devoluciones_actualizadas', handleDevolucionesActualizadas);
      socket.off('pedido_agregado', handlePedidoAgregado);
    };
  }, [socket, cargarPedidos, cargarProductosGeneral]);

  // ==========================
  // DETECTAR PAQUETERÍA REAL
  // ==========================
  const detectarPaqueteria = (valor) => {
    if (!valor) return "";

    const v = valor.toUpperCase().trim();

    // DHL - Códigos que empiezan con JJD o JD seguido de números
    if (v.startsWith("JJD") || /^JD[0-9]{14,}/.test(v)) return "DHL";
    
    // FedEx - Números de 10-15 dígitos (formato común de FedEx)
    if (/^\d{10,15}$/.test(v)) return "FedEx";
    
    // Estafeta - Códigos alfanuméricos de 10-30 caracteres o números de 10+ dígitos
    if (/^[A-Z0-9]{10,30}$/.test(v) || (/^[0-9]{10,}$/.test(v) && v.length <= 15)) return "Estafeta";

    return "Desconocida";
  };

  // ==========================
  // ABRIR MODAL DEL PEDIDO
  // ==========================
  const abrirModalPedido = () => {
    if (!numeroPedido.trim()) return;

    // Limpiar previews antes de resetear estados
    evidenciasPaquete.forEach((ev) => {
      if (ev.preview) {
        URL.revokeObjectURL(ev.preview);
      }
    });
    evidencias.forEach((ev) => {
      if (ev.preview) {
        URL.revokeObjectURL(ev.preview);
      }
    });

    // Cerrar cámaras si están abiertas
    if (camStreamPaquete) {
      camStreamPaquete.getTracks().forEach((t) => t.stop());
      setCamStreamPaquete(null);
    }
    if (camStreamEvidencias) {
      camStreamEvidencias.getTracks().forEach((t) => t.stop());
      setCamStreamEvidencias(null);
    }
    setShowCamModalPaquete(false);
    setShowCamModalEvidencias(false);

    setGuia("");
    setPaqueteria("");
    setMotivo("");
    setEvidenciasPaquete([]);
    setProductoActual({ codigo: "", nombre: "", lote: "", cantidad: "", caducidad: "" });
    setProductos([]);
    setEvidencias([]);

    setFase(1);
    setShowModal(true);
  };

  const handleKeyPedido = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      abrirModalPedido();
    }
  };

  // ==========================
  // FASE 1 → FASE 2 (EVIDENCIAS PAQUETE)
  // ==========================
  const irAFaseEvidenciasPaquete = () => {
    if (!guia.trim()) {
      pushToast?.("Captura la guía", "error");
      return;
    }
    setFase(2);
  };

  // ==========================
  // FASE 2 → FASE 3 (PRODUCTOS)
  // ==========================
  const irAFaseProductos = () => {
    setFase(3);
  };

  // ==========================
  // BUSCAR PRODUCTO POR CÓDIGO
  // ==========================
  const buscarProductoPorCodigo = async (codigo) => {
    if (!codigo || !codigo.trim() || codigo.trim().length < 3) return; // Evitar búsquedas de códigos muy cortos
    const codigoLimpio = codigo.trim();
    
    try {
      const d = await authFetch(`${serverUrl}/inventario/producto/${codigoLimpio}`);
      setProductoActual((p) => ({
        ...p,
        codigo: codigoLimpio || "",
        nombre: d?.nombre || "",
        presentacion: d?.presentacion || "",
        lote: d?.lote || "",
        cantidad: p.cantidad || "",
        caducidad: p.caducidad || "",
      }));
      
      // Mover el foco al campo de lote después de detectar el producto
      setTimeout(() => {
        const inputLote = document.querySelector('input[placeholder="Lote"]');
        if (inputLote) {
          safeFocus(inputLote, 50);
          // Si el lote ya está completo, seleccionarlo para que se pueda reemplazar fácilmente
          if (d.lote) {
            inputLote.select();
          }
        }
      }, 150);
    } catch (err) {
      // Manejar errores 404 silenciosamente (producto no encontrado es esperado)
      if (!err.isNotFound && !err.message?.includes('404') && !err.message?.includes('No existe')) {
        console.error('Error buscando producto:', err);
      }
      // Si no existe, mostrar modal para agregar código
      setCodigoNuevoDetectado(codigoLimpio);
      setShowModalNuevoCodigo(true);
    }
  };


  // ==========================
  // AGREGAR PRODUCTO
  // ==========================
  const agregarProducto = () => {
    if (!productoActual.codigo.trim()) {
      pushToast?.("Falta código", "error");
      return;
    }
    if (!productoActual.cantidad) {
      pushToast?.("Falta cantidad", "error");
      return;
    }

    // Guardar nombre y presentación por separado
    setProductos((p) => [
      ...p,
      {
        idTemp: Date.now(),
        codigo: productoActual.codigo,
        nombre: productoActual.nombre || "",
        presentacion: productoActual.presentacion || "",
        lote: productoActual.lote,
        cantidad: Number(productoActual.cantidad),
        caducidad: productoActual.caducidad || null,
        apto: true,
      },
    ]);

    // Limpiar todos los campos, incluyendo el código
    setProductoActual({ 
      codigo: "",
      nombre: "", 
      presentacion: "",
      lote: "", 
      cantidad: "", 
      caducidad: "" 
    });
    
    // Volver a enfocar el input de código y limpiarlo
    setTimeout(() => {
      const inputCodigo = document.querySelector('input[placeholder="Escanea código"]');
      if (inputCodigo) {
        safeFocus(inputCodigo, 50);
        inputCodigo.value = "";
      }
    }, 100);
  };

  const toggleApto = (id) => {
    setProductos((p) =>
      p.map((prod) =>
        prod.idTemp === id ? { ...prod, apto: !prod.apto } : prod
      )
    );
  };

  const editarProducto = (id) => {
    const producto = productos.find(p => p.idTemp === id);
    if (producto) {
      setProductoActual({
        codigo: producto.codigo,
        nombre: producto.nombre || "",
        presentacion: producto.presentacion || "",
        lote: producto.lote || "",
        cantidad: producto.cantidad || "",
        caducidad: producto.caducidad || "",
      });
      // Eliminar el producto de la lista para que se pueda agregar con los cambios
      setProductos((p) => p.filter(prod => prod.idTemp !== id));
      // Enfocar el input de código
      setTimeout(() => {
        const inputCodigo = document.querySelector('input[placeholder="Escanea código"]');
        if (inputCodigo) {
          safeFocus(inputCodigo, 50);
        }
      }, 100);
    }
  };

  const borrarProducto = async (id) => {
    const confirmado = await showConfirm("¿Estás seguro de eliminar este producto de la lista?");
    if (confirmado) {
      setProductos((p) => p.filter(prod => prod.idTemp !== id));
    }
  };

  // ==========================
  // FASE 3 → FASE 4 (EVIDENCIAS FINALES)
  // ==========================
  const irAFaseEvidenciasFinales = () => {
    if (productos.length === 0) {
      pushToast?.("Agrega al menos un producto", "error");
      return;
    }
    setFase(4);
  };

  // ==========================
  // EVIDENCIAS DEL PAQUETE
  // ==========================
  const agregarEvidenciasPaquete = (e) => {
    const files = Array.from(e.target.files || []);
    const nuevos = files.map((file) => ({
      idTemp: Date.now() + "-" + Math.random(),
      file,
      preview: URL.createObjectURL(file),
    }));
    setEvidenciasPaquete((prev) => [...prev, ...nuevos]);
    // Limpiar el input para permitir seleccionar el mismo archivo otra vez
    if (e.target) {
      e.target.value = '';
    }
  };

  const tomarFotoCamaraPaquete = async () => {
    // En móvil, usar el input con capture
    if (isMobile && cameraInputPaqueteRef.current) {
      cameraInputPaqueteRef.current.click();
      return;
    }
    
    // En PC, usar getUserMedia para abrir cámara directamente
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      setCamStreamPaquete(stream);
      setShowCamModalPaquete(true);

      setTimeout(() => {
        if (videoRefPaquete.current) {
          videoRefPaquete.current.srcObject = stream;
          videoRefPaquete.current.onloadedmetadata = () =>
            videoRefPaquete.current.play();
        }
      }, 200);
    } catch (err) {
      pushToast?.("❌ No se pudo abrir la cámara", "error");
      console.error(err);
    }
  };

  const cerrarCamaraPaquete = () => {
    try {
      if (camStreamPaquete) {
        camStreamPaquete.getTracks().forEach((t) => t.stop());
      }
      if (videoRefPaquete.current) videoRefPaquete.current.srcObject = null;
      setCamStreamPaquete(null);
      setShowCamModalPaquete(false);
    } catch (e) {
      console.error(e);
    }
  };

  const capturarFotoPaquete = () => {
    const video = videoRefPaquete.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `foto-paquete-${Date.now()}.jpg`, { type: "image/jpeg" });
        const nuevaEvidencia = {
          idTemp: Date.now() + "-" + Math.random(),
          file,
          preview: URL.createObjectURL(blob),
        };
        setEvidenciasPaquete((prev) => [...prev, nuevaEvidencia]);
        cerrarCamaraPaquete();
        pushToast?.("✅ Foto tomada", "ok");
      }
    }, "image/jpeg", 0.9);
  };

  const abrirGaleriaPaquete = () => {
    if (fileInputPaqueteRef.current) {
      fileInputPaqueteRef.current.click();
    }
  };

  const borrarEvidenciaPaquete = (idTemp) => {
    setEvidenciasPaquete((prev) => {
      const evidencia = prev.find(e => e.idTemp === idTemp);
      if (evidencia && evidencia.preview) {
        URL.revokeObjectURL(evidencia.preview);
      }
      return prev.filter(e => e.idTemp !== idTemp);
    });
  };

  // ==========================
  // EVIDENCIAS (FINALES)
  // ==========================
  const agregarEvidencias = (e) => {
    const files = Array.from(e.target.files || []);
    const nuevos = files.map((file) => ({
      idTemp: Date.now() + "-" + Math.random(),
      file,
      preview: URL.createObjectURL(file),
    }));
    setEvidencias((prev) => [...prev, ...nuevos]);
    // Limpiar el input para permitir seleccionar el mismo archivo otra vez
    if (e.target) {
      e.target.value = '';
    }
  };

  const tomarFotoCamaraEvidencias = async () => {
    // En móvil, usar el input con capture
    if (isMobile && cameraInputEvidenciasRef.current) {
      cameraInputEvidenciasRef.current.click();
      return;
    }
    
    // En PC, usar getUserMedia para abrir cámara directamente
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      setCamStreamEvidencias(stream);
      setShowCamModalEvidencias(true);

      setTimeout(() => {
        if (videoRefEvidencias.current) {
          videoRefEvidencias.current.srcObject = stream;
          videoRefEvidencias.current.onloadedmetadata = () =>
            videoRefEvidencias.current.play();
        }
      }, 200);
    } catch (err) {
      pushToast?.("❌ No se pudo abrir la cámara", "error");
      console.error(err);
    }
  };

  const cerrarCamaraEvidencias = () => {
    try {
      if (camStreamEvidencias) {
        camStreamEvidencias.getTracks().forEach((t) => t.stop());
      }
      if (videoRefEvidencias.current) videoRefEvidencias.current.srcObject = null;
      setCamStreamEvidencias(null);
      setShowCamModalEvidencias(false);
    } catch (e) {
      console.error(e);
    }
  };

  const capturarFotoEvidencias = () => {
    const video = videoRefEvidencias.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `foto-evidencias-${Date.now()}.jpg`, { type: "image/jpeg" });
        const nuevaEvidencia = {
          idTemp: Date.now() + "-" + Math.random(),
          file,
          preview: URL.createObjectURL(blob),
        };
        setEvidencias((prev) => [...prev, nuevaEvidencia]);
        cerrarCamaraEvidencias();
        pushToast?.("✅ Foto tomada", "ok");
      }
    }, "image/jpeg", 0.9);
  };

  const abrirGaleriaEvidencias = () => {
    if (fileInputEvidenciasRef.current) {
      fileInputEvidenciasRef.current.click();
    }
  };

  // ==========================
  // GUARDAR DEVOLUCIÓN
  // ==========================
  const guardarDevolucion = async () => {
    // Si hay un pedido temporal, eliminarlo primero
    if (devolucionTemporalId) {
      try {
        await authFetch(`${serverUrl}/devoluciones/clientes/pedidos/${devolucionTemporalId}`, {
          method: "DELETE"
        });
        setDevolucionTemporalId(null); // Limpiar el ID temporal
      } catch (err) {
        console.warn("⚠️ No se pudo eliminar el pedido temporal:", err);
        // Continuar de todas formas
      }
    }
    
    // Guardar TODOS los productos en "Clientes" (aptos y no aptos)
    // El campo apto se guarda en la base de datos para llevar control
    const guardar = async (area, prods) => {
      if (prods.length === 0) return true;

      try {
        // Validar que numeroPedido no esté vacío
        if (!numeroPedido || numeroPedido.trim() === "") {
          pushToast?.("❌ El número de pedido es requerido", "error");
          return false;
        }

        const fd = new FormData();
        fd.append("pedido", numeroPedido.trim());
        fd.append("guia", guia || "");
        fd.append("paqueteria", paqueteria || "");
        fd.append("motivo", motivo || "");
        fd.append("area", area);
        fd.append("usuario", user?.nickname || "");
        fd.append("productos", JSON.stringify(prods.map(p => ({
          codigo: p.codigo || "",
          nombre: p.nombre || "",
          presentacion: p.presentacion || "",
          lote: p.lote || "",
          cantidad: p.cantidad || 0,
          caducidad: p.caducidad || null,
          apto: p.apto ? 1 : 0,
        }))));

        // Agregar evidencias del paquete
        if (evidenciasPaquete.length > 0) {
          evidenciasPaquete.forEach((ev) => {
            if (ev.file) {
              fd.append("evidencias", ev.file);
            }
          });
        }

        // Agregar evidencias finales
        if (evidencias.length > 0) {
          evidencias.forEach((ev) => {
            if (ev.file) {
              fd.append("evidencias", ev.file);
            }
          });
        }

                const d = await authFetch(`${serverUrl}/devoluciones/clientes`, {
          method: "POST",
          body: fd,
        });
        
        if (!d || !d.ok) {
          const errorMsg = d?.error || `Error guardando en ${area}`;
          console.error("❌ Error respuesta:", errorMsg);
          throw new Error(errorMsg);
        }
        
        return true;
      } catch (err) {
        console.error("❌ Error guardando devolución:", err);
        pushToast?.(`❌ Error guardando en ${area}: ${err.message}`, "error");
        return false;
      }
    };

    // Guardar TODOS los productos en "Clientes" (aptos y no aptos)
    // El campo apto se guarda en la base de datos para llevar control
    const ok = await guardar("Clientes", productos);

    if (ok) {
      pushToast?.("Devolución guardada", "success");
      setShowModal(false);
      setNumeroPedido("");
      cargarPedidos();
    }
  };

  // ==========================
  // GUARDAR NUEVO CÓDIGO
  // ==========================
  const guardarNuevoCodigo = async () => {
    if (!productoSeleccionado) {
      pushToast("Selecciona un producto", "error");
      return;
    }

    try {
      await authFetch(`${serverUrl}/alias/crear`, {
        method: "POST",
        body: JSON.stringify({
          nuevo_codigo: codigoNuevoDetectado,
          codigo_principal: productoSeleccionado.codigo,
        }),
      });

      setProductoActual({
        codigo: codigoNuevoDetectado,
        nombre: productoSeleccionado.nombre,
        lote: productoActual.lote,
        cantidad: "",
      });

      setShowModalNuevoCodigo(false);
      pushToast("Código agregado", "success");
    } catch (err) {
      console.error(err);
      pushToast("Error guardando código", "error");
    }
  };

  // ==========================
  // RENDER
  // ==========================
  return (
    <div className="devProceso">

      {/* ======================= */}
      {/*     INPUT PRINCIPAL     */}
      {/* ======================= */}
      <div className="devPrincipalBox">
        <label>
          <span>Número de Pedido</span>
        </label>
        <input
          ref={inputPedidoRef}
          type="text"
          value={numeroPedido}
          onChange={(e) => setNumeroPedido(e.target.value)}
          onKeyDown={handleKeyPedido}
          className="devInputPedido"
          placeholder=""
          style={{ maxWidth: '312px', width: '50%' }}
        />
      </div>

      {/* ======================= */}
      {/*      SUBTABS            */}
      {/* ======================= */}

      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div className="devSubTabs" style={{ marginBottom: 0 }}>
          <button
            className={subTab === "pedidos" ? "active" : ""}
            onClick={() => setSubTab("pedidos")}
          >
            Pedidos
          </button>

          <button
            className={subTab === "productos" ? "active" : ""}
            onClick={() => setSubTab("productos")}
          >
            Productos General
          </button>
        </div>

        {/* Contadores de productos general - extrema derecha, arriba del botón */}
        {subTab === "productos" && (
          <div style={{ 
            display: 'flex', 
            gap: '8px', 
            flexWrap: 'wrap',
            alignItems: 'center',
            marginLeft: 'auto'
          }}>
            <div className="dev-contador-badge" style={{ 
              display: 'flex', 
              flexDirection: 'row',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              background: 'var(--error)',
              borderRadius: 'var(--radio-sm)',
              color: '#ffffff'
            }}>
              <span className="dev-contador-badge" style={{ fontSize: '0.7rem', opacity: 0.9, color: '#ffffff' }}>No Aptos:</span>
              <span className="dev-contador-badge" style={{ fontSize: '0.95rem', fontWeight: '700', color: '#ffffff' }}>{contadores.noAptos}</span>
            </div>
            <div className="dev-contador-badge" style={{ 
              display: 'flex', 
              flexDirection: 'row',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              background: 'var(--exito)',
              borderRadius: 'var(--radio-sm)',
              color: '#ffffff'
            }}>
              <span className="dev-contador-badge" style={{ fontSize: '0.7rem', opacity: 0.9, color: '#ffffff' }}>Activos:</span>
              <span className="dev-contador-badge" style={{ fontSize: '0.95rem', fontWeight: '700', color: '#ffffff' }}>{contadores.activos}</span>
            </div>
            <div className="dev-contador-badge" style={{ 
              display: 'flex', 
              flexDirection: 'row',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              background: '#1a1a1a',
              borderRadius: 'var(--radio-sm)',
              color: '#ffffff'
            }}>
              <span className="dev-contador-badge" style={{ fontSize: '0.7rem', opacity: 0.9, color: '#ffffff' }}>No Activados:</span>
              <span className="dev-contador-badge" style={{ fontSize: '0.95rem', fontWeight: '700', color: '#ffffff' }}>{contadores.noActivos}</span>
            </div>
            <div className="dev-contador-badge" style={{ 
              display: 'flex', 
              flexDirection: 'row',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              background: 'var(--azul-primario)',
              borderRadius: 'var(--radio-sm)',
              color: '#ffffff'
            }}>
              <span className="dev-contador-badge" style={{ fontSize: '0.7rem', opacity: 0.9, color: '#ffffff' }}>Total:</span>
              <span className="dev-contador-badge" style={{ fontSize: '0.95rem', fontWeight: '700', color: '#ffffff' }}>{listaProductosGeneral.length}</span>
            </div>
          </div>
        )}
      </div>

      {/* ======================= */}
      {/*     CONTENIDO TABS      */}
      {/* ======================= */}
      <div className="devSubContent">
        {subTab === "pedidos" && (
          <div className="devoluciones-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', padding: '16px' }}>
            {listaPedidos.filter(p => p.origen !== "historico").length === 0 && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--texto-secundario)' }}>
                No hay pedidos registrados
              </div>
            )}
            {listaPedidos.filter(p => p.origen !== "historico").map((p) => (
              <div
                key={p.id}
                className="devolucion-card"
                onClick={() => abrirDetallePedido(p)}
                style={{
                  background: 'var(--fondo-card)',
                  borderRadius: 'var(--radio-lg)',
                  padding: '14px',
                  boxShadow: 'var(--sombra-sm)',
                  cursor: 'pointer',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  borderLeft: '4px solid var(--azul-primario)',
                  border: '1px solid var(--borde-sutil)',
                  transition: 'all var(--transicion-media)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.background = 'var(--fondo-card-hover)';
                  e.currentTarget.style.boxShadow = 'var(--sombra-md)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.background = 'var(--fondo-card)';
                  e.currentTarget.style.boxShadow = 'var(--sombra-sm)';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span 
                    className="devolucion-badge-pedido"
                    style={{ 
                      padding: '2px 8px', 
                      borderRadius: 'var(--radio-md)', 
                      fontSize: '0.75rem', 
                      fontWeight: '600', 
                      textTransform: 'uppercase', 
                      color: '#ffffff', 
                      background: '#2563eb' 
                    }}
                  >
                    Pedido
                  </span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--texto-secundario)' }}>
                    {p.fecha}
                  </span>
                </div>
                
                <div style={{ fontSize: '1.05rem', fontWeight: '600', color: 'var(--texto-principal)', marginTop: '4px' }}>
                  {p.pedido}
                </div>
                
                <div style={{ fontSize: '0.9rem', color: 'var(--texto-secundario)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div><strong style={{ color: 'var(--texto-principal)' }}>Guía:</strong> {p.guia || "–"}</div>
                  <div><strong style={{ color: 'var(--texto-principal)' }}>Paquetería:</strong> {p.paqueteria || "–"}</div>
                  <div><strong style={{ color: 'var(--texto-principal)' }}>Motivo:</strong> {p.motivo || "–"}</div>
                </div>
                
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={(e) => abrirProductosPedido(p, e)}
                    style={{
                      padding: '6px 12px',
                      background: 'var(--exito)',
                      color: 'var(--texto-principal)',
                      border: 'none',
                      borderRadius: 'var(--radio-md)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: '600',
                      flex: 1,
                      minWidth: '120px',
                      transition: 'all var(--transicion-media)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = 'var(--sombra-sm)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    📦 Ver Productos
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      generarTokenMovil(p.id, p.pedido);
                    }}
                    style={{
                      padding: '6px 12px',
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: 'var(--radio-md)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: '600',
                      flex: 1,
                      minWidth: '120px',
                      transition: 'all var(--transicion-media)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = 'var(--sombra-sm)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    📱 Agregar Fotos
                  </button>
                  <button
                    onClick={(e) => eliminarPedido(p, e)}
                    disabled={p.origen === "historico"}
                    title={p.origen === "historico" ? "No se puede eliminar desde histórico. Solo se puede acceder desde reportes." : "Eliminar pedido"}
                    style={{
                      padding: '6px 12px',
                      background: p.origen === "historico" ? '#ccc' : 'var(--error)',
                      color: 'var(--texto-principal)',
                      border: 'none',
                      borderRadius: 'var(--radio-md)',
                      cursor: p.origen === "historico" ? 'not-allowed' : 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: '600',
                      transition: 'all var(--transicion-media)',
                      opacity: p.origen === "historico" ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (p.origen !== "historico") {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = 'var(--sombra-sm)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {subTab === "productos" && (
          <table className="devTabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Pedido</th>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Presentación</th>
                  <th>Lote</th>
                  <th>Cantidad</th>
                  <th>Apto</th>
                  <th>Activo</th>
                  <th>Acción</th>
                </tr>
              </thead>
            <tbody>
              {listaProductosGeneral.length === 0 && (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '40px', color: 'var(--texto-secundario)' }}>
                    No hay productos registrados
                  </td>
                </tr>
              )}
              {listaProductosGeneral.map((p) => (
                <tr key={p.id}>
                  <td>{p.fecha}</td>
                  <td>{p.pedido}</td>
                  <td>{p.codigo}</td>
                  <td>{p.nombre}</td>
                  <td>{p.presentacion || "—"}</td>
                  <td>{p.lote}</td>
                  <td>{p.cantidad}</td>
                  <td>{p.apto ? "Apto" : "No apto"}</td>
                  <td style={{ textAlign: 'center' }}>
                    {(() => {
                      // Verificar si el producto es "no apto"
                      const esNoApto = p.apto !== 1 && p.apto !== true && p.apto !== '1';
                      const puedeActivar = !esNoApto; // Solo se puede activar si NO es no apto
                      
                      return (
                        <label 
                          className="switch" 
                          style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            cursor: puedeActivar ? 'pointer' : 'not-allowed',
                            opacity: puedeActivar ? 1 : 0.5
                          }}
                          title={esNoApto ? "Los productos no aptos no se pueden activar" : ""}
                        >
                          <input
                            type="checkbox"
                            checked={p.activo === 1}
                            disabled={!puedeActivar}
                            onChange={async (e) => {
                              // Doble verificación por seguridad
                              if (esNoApto && e.target.checked) {
                                pushToast?.("⚠️ Los productos no aptos no se pueden activar", "warning");
                                // Revertir el checkbox
                                e.target.checked = false;
                                return;
                              }
                              
                              try {
                                const response = await authFetch(`${serverUrl}/devoluciones/clientes/productos-general/${p.id}/activo`, {
                                  method: 'PUT',
                                  body: JSON.stringify({ activo: e.target.checked ? 1 : 0 })
                                });
                                
                                // Si hay error en la respuesta
                                if (response && response.error) {
                                  pushToast?.(response.error, "error");
                                  // Revertir el checkbox
                                  e.target.checked = !e.target.checked;
                                  return;
                                }
                                
                                cargarProductosGeneral();
                                pushToast?.("✅ Estado actualizado", "success");
                              } catch (err) {
                                console.error(err);
                                const errorMessage = err?.message || err?.error || "Error actualizando estado";
                                pushToast?.(`❌ ${errorMessage}`, "error");
                                // Revertir el checkbox en caso de error
                                e.target.checked = !e.target.checked;
                              }
                            }}
                          />
                          <span className="slider"></span>
                        </label>
                      );
                    })()}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      onClick={async () => {
                        const confirmado = await showConfirm(`¿Estás seguro de eliminar el producto ${p.codigo} - ${p.nombre}?`);
                        if (!confirmado) return;
                        
                        try {
                          await authFetch(`${serverUrl}/devoluciones/clientes/productos-general/${p.id}`, {
                            method: 'DELETE'
                          });
                          cargarProductosGeneral();
                          pushToast?.("✅ Producto eliminado", "success");
                        } catch (err) {
                          console.error(err);
                          pushToast?.("❌ Error eliminando producto", "error");
                        }
                      }}
                      style={{
                        padding: '4px 8px',
                        background: 'var(--error)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ======================= */}
      {/*         MODAL           */}
      {/* ======================= */}
      {showModal && (
        <div className="devModalFondo">
          <div className="devModal">

            {/* HEADER */}
            <div className="devModalHeader">
              <h3>Devolución – Pedido {numeroPedido}</h3>
              <button onClick={() => {
                // Si hay un pedido temporal y se cierra sin guardar, eliminarlo
                if (devolucionTemporalId) {
                  authFetch(`${serverUrl}/devoluciones/clientes/pedidos/${devolucionTemporalId}`, {
                    method: "DELETE"
                  }).catch(() => {});
                  setDevolucionTemporalId(null);
                }
                setShowModal(false);
              }}>✕</button>
            </div>

            {/* ============ FASE 1 ============= */}
            {fase === 1 && (
              <div className="devModalBody">
                <h4>1. Datos de Guía</h4>

                <label>Guía</label>
                <input
                  value={guia}
                  onChange={(e) => {
                    setGuia(e.target.value);
                    setPaqueteria(detectarPaqueteria(e.target.value));
                  }}
                  placeholder=""
                />

                <label>Paquetería</label>
                <input
                  value={paqueteria}
                  onChange={(e) => setPaqueteria(e.target.value)}
                  placeholder=""
                />

                <label>Motivo de Devolución</label>
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder=""
                />

                <div className="devModalFooter">
                  <button onClick={() => {
                    // Si hay un pedido temporal y se cancela, eliminarlo
                    if (devolucionTemporalId) {
                      authFetch(`${serverUrl}/devoluciones/clientes/pedidos/${devolucionTemporalId}`, {
                        method: "DELETE"
                      }).catch(() => {});
                      setDevolucionTemporalId(null);
                    }
                    setShowModal(false);
                  }}>Cancelar</button>
                  <button onClick={irAFaseEvidenciasPaquete}>Continuar → Evidencia del Paquete</button>
                </div>
              </div>
            )}

            {/* ============ FASE 2 - EVIDENCIAS DEL PAQUETE ============= */}
            {fase === 2 && (
              <div className="devModalBody">
                <h4>1.5. Evidencia del Paquete</h4>

                {/* Input oculto para galería */}
                <input
                  ref={fileInputPaqueteRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={agregarEvidenciasPaquete}
                  style={{ display: 'none' }}
                />

                {/* Input oculto para cámara */}
                <input
                  ref={cameraInputPaqueteRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={agregarEvidenciasPaquete}
                  style={{ display: 'none' }}
                />

                {/* Botones para agregar fotos */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={tomarFotoCamaraPaquete}
                    className="btn"
                    style={{ 
                      flex: '1',
                      minWidth: '140px',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      padding: '10px 15px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      fontSize: '0.95rem'
                    }}
                  >
                    📷 Tomar Foto
                  </button>
                  <button
                    type="button"
                    onClick={abrirGaleriaPaquete}
                    className="btn"
                    style={{ 
                      flex: '1',
                      minWidth: '140px',
                      backgroundColor: '#6b7280',
                      color: 'white',
                      border: 'none',
                      padding: '10px 15px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      fontSize: '0.95rem'
                    }}
                  >
                    🖼️ Subir desde Galería
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!numeroPedido.trim()) {
                        pushToast?.("⚠️ Primero ingresa el número de pedido", "warn");
                        return;
                      }
                      
                      try {
                        let devolucionId = null;
                        // Verificar si el pedido ya existe
                        const pedidosExistentes = await authFetch(`${serverUrl}/devoluciones/clientes/pedidos?area=Clientes`);
                        const pedidoExistente = pedidosExistentes.find(p => p.pedido === numeroPedido && p.origen !== "historico");
                        
                        if (pedidoExistente) {
                          devolucionId = pedidoExistente.id;
                        } else {
                          // Guardar solo un registro mínimo (solo pedido) para generar el token
                          // Se actualizará cuando termine el proceso
                          const fd = new FormData();
                          fd.append("pedido", numeroPedido.trim());
                          fd.append("guia", "");
                          fd.append("paqueteria", "");
                          fd.append("motivo", "[En proceso - Fotos desde móvil]");
                          fd.append("area", "Clientes");
                          fd.append("usuario", user?.nickname || "");
                          fd.append("productos", JSON.stringify([])); // Sin productos aún
                          
                          const response = await authFetch(`${serverUrl}/devoluciones/clientes`, {
                            method: "POST",
                            body: fd,
                          });
                          
                          if (response.ok && response.id) {
                            devolucionId = response.id;
                            setDevolucionTemporalId(devolucionId); // Guardar el ID para actualizarlo después
                          } else {
                            throw new Error("Error generando código");
                          }
                        }
                        
                        if (devolucionId) {
                          await generarTokenMovil(devolucionId, numeroPedido);
                        }
                      } catch (error) {
                        console.error("Error generando token móvil:", error);
                        pushToast?.("❌ Error: " + (error.message || "Error generando código"), "err");
                      }
                    }}
                    className="btn"
                    style={{ 
                      flex: '1',
                      minWidth: '140px',
                      backgroundColor: '#10b981',
                      color: 'white',
                      border: 'none',
                      padding: '10px 15px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      fontSize: '0.95rem'
                    }}
                  >
                    📱 Tomar desde Celular
                  </button>
                </div>

                <div className="devMiniaturas">
                  {evidenciasPaquete.map((ev) => (
                    <div key={ev.idTemp} style={{ position: 'relative', display: 'inline-block' }}>
                      <img
                        src={ev.preview}
                        className="devFotoMini"
                        onClick={() => setFotoGrande(ev.preview)}
                        alt=""
                      />
                      <button
                        onClick={() => borrarEvidenciaPaquete(ev.idTemp)}
                        style={{
                          position: 'absolute',
                          top: '4px',
                          right: '4px',
                          background: 'var(--error)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '50%',
                          width: '24px',
                          height: '24px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '14px',
                          padding: 0
                        }}
                        title="Eliminar"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                {evidenciasPaquete.length === 0 && (
                  <div style={{ padding: '20px', textAlign: 'center', opacity: 0.6 }}>
                    Sin fotos del paquete
                  </div>
                )}

                <div className="devModalFooter">
                  <button onClick={() => setFase(1)}>← Regresar</button>
                  <button onClick={irAFaseProductos}>Continuar → Productos</button>
                </div>
              </div>
            )}

            {/* ============ FASE 3 - PRODUCTOS ============= */}
            {fase === 3 && (
              <div className="devModalBody">
                <h4>2. Productos</h4>

                <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                {/* Primera línea: Código (1/4) y Nombre (3/4) */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <div style={{ flex: '0 0 25%', minWidth: 0 }}>
                    <label>Código</label>
                    <input
                      ref={(input) => {
                        if (input && fase === 2) {
                          // Auto-focus solo si es seguro hacerlo (no hay modales/chat abierto)
                          safeFocus(input, 100);
                        }
                      }}
                      value={productoActual.codigo || ""}
                      onChange={(e) => {
                        const nuevoCodigo = e.target.value;
                        setProductoActual((prev) => ({ ...prev, codigo: nuevoCodigo }));
                        
                        // Detectar escaneo automático (cuando se escribe rápido y se detiene)
                        if (timeoutEscaneo.current) {
                          clearTimeout(timeoutEscaneo.current);
                        }
                        
                        // Si el código cambió significativamente (escaneo rápido), esperar a que termine
                        timeoutEscaneo.current = setTimeout(() => {
                          const codigoLimpio = nuevoCodigo.trim();
                          // Si el código tiene al menos 3 caracteres y no es igual al anterior
                          if (codigoLimpio.length >= 3 && codigoLimpio !== codigoAnterior.current) {
                            codigoAnterior.current = codigoLimpio;
                            // Solo buscar el producto para completar nombre y lote (sin agregar a la lista)
                            buscarProductoPorCodigo(codigoLimpio);
                          }
                        }, 300); // Esperar 300ms después de que el usuario deja de escribir
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          // Limpiar timeout si se presiona Enter
                          if (timeoutEscaneo.current) {
                            clearTimeout(timeoutEscaneo.current);
                          }
                          // Solo buscar el producto para completar nombre y lote (sin agregar a la lista)
                          buscarProductoPorCodigo(productoActual.codigo);
                        }
                      }}
                      placeholder=""
                      autoFocus={fase === 2}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ flex: '0 0 75%', minWidth: 0 }}>
                    <label>Nombre</label>
                    <input
                      value={productoActual.nombre || ""}
                      onChange={(e) =>
                        setProductoActual({ ...productoActual, nombre: e.target.value })
                      }
                      placeholder=""
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                {/* Segunda línea: Presentación, Cantidad y Lote */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <div style={{ flex: '0 0 200px', minWidth: '180px', maxWidth: '200px' }}>
                    <label>Presentación</label>
                    <input
                      value={productoActual.presentacion || ""}
                      onChange={(e) =>
                        setProductoActual({ ...productoActual, presentacion: e.target.value })
                      }
                      placeholder=""
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ flex: '0 0 70px', minWidth: 0 }}>
                    <label>Cantidad</label>
                    <input
                      type="number"
                      value={productoActual.cantidad || ""}
                      onChange={(e) =>
                        setProductoActual({
                          ...productoActual,
                          cantidad: e.target.value,
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") agregarProducto();
                      }}
                      placeholder=""
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ flex: '0 0 110px', minWidth: 0 }}>
                    <label>Lote</label>
                    <input
                      value={productoActual.lote || ""}
                      onChange={(e) =>
                        setProductoActual({ ...productoActual, lote: e.target.value })
                      }
                      placeholder=""
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                {/* Tercera línea: Caducidad y Botón */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                  <div style={{ flex: '0 0 160px', minWidth: 0 }}>
                    <label>Caducidad</label>
                    <input
                      type="date"
                      value={productoActual.caducidad || ""}
                      onChange={(e) =>
                        setProductoActual({
                          ...productoActual,
                          caducidad: e.target.value,
                        })
                      }
                      placeholder=""
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ flex: '0 0 auto', marginLeft: 'auto' }}>
                    <button className="btnAdd" onClick={agregarProducto} style={{ marginTop: '0', padding: '5px 7px', minWidth: '30px', fontSize: '0.9rem', height: '38px' }}>
                      <span style={{ fontSize: '0.9rem' }}>➕</span>
                    </button>
                  </div>
                </div>
                </div>

                <div className="devProductosList">
                  <table>
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Nombre</th>
                        <th>Presentación</th>
                        <th>Lote</th>
                        <th>Cantidad</th>
                        <th>Caducidad</th>
                        <th>Apto</th>
                        <th>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productos.map((p) => (
                        <tr key={p.idTemp}>
                          <td style={{ fontWeight: '500' }}>{p.codigo}</td>
                          <td style={{ fontWeight: '500', color: 'var(--texto-principal)' }}>{p.nombre || "—"}</td>
                          <td style={{ color: 'var(--texto-secundario)', fontSize: '0.9em' }}>{p.presentacion || "—"}</td>
                          <td>{p.lote || "—"}</td>
                          <td style={{ textAlign: 'center', fontWeight: '500' }}>{p.cantidad}</td>
                          <td>{p.caducidad || "—"}</td>
                          <td>
                            <label className="switch">
                              <input
                                type="checkbox"
                                checked={p.apto}
                                onChange={() => toggleApto(p.idTemp)}
                              />
                              <span className="slider" />
                            </label>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              onClick={() => editarProducto(p.idTemp)}
                              style={{
                                padding: '4px 8px',
                                background: '#2563eb',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                marginRight: '4px'
                              }}
                              title="Editar producto"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => borrarProducto(p.idTemp)}
                              style={{
                                padding: '4px 8px',
                                background: 'var(--error)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                              }}
                              title="Borrar producto"
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="devModalFooter">
                  <button onClick={() => setFase(2)}>← Regresar</button>
                  <button onClick={irAFaseEvidenciasFinales}>Continuar → Evidencias Finales</button>
                </div>
              </div>
            )}

            {/* ============ FASE 4 - EVIDENCIAS FINALES ============= */}
            {fase === 4 && (
              <div className="devModalBody">
                <h4>3. Evidencias Finales</h4>

                {/* Input oculto para galería */}
                <input
                  ref={fileInputEvidenciasRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={agregarEvidencias}
                  style={{ display: 'none' }}
                />

                {/* Input oculto para cámara */}
                <input
                  ref={cameraInputEvidenciasRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={agregarEvidencias}
                  style={{ display: 'none' }}
                />

                {/* Botones para agregar fotos */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={tomarFotoCamaraEvidencias}
                    className="btn"
                    style={{ 
                      flex: '1',
                      minWidth: '140px',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      padding: '10px 15px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      fontSize: '0.95rem'
                    }}
                  >
                    📷 Tomar Foto
                  </button>
                  <button
                    type="button"
                    onClick={abrirGaleriaEvidencias}
                    className="btn"
                    style={{ 
                      flex: '1',
                      minWidth: '140px',
                      backgroundColor: '#6b7280',
                      color: 'white',
                      border: 'none',
                      padding: '10px 15px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      fontSize: '0.95rem'
                    }}
                  >
                    🖼️ Subir desde Galería
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!numeroPedido.trim()) {
                        pushToast?.("⚠️ Primero ingresa el número de pedido", "warn");
                        return;
                      }
                      
                      try {
                        let devolucionId = null;
                        // Verificar si el pedido ya existe
                        const pedidosExistentes = await authFetch(`${serverUrl}/devoluciones/clientes/pedidos?area=Clientes`);
                        const pedidoExistente = pedidosExistentes.find(p => p.pedido === numeroPedido && p.origen !== "historico");
                        
                        if (pedidoExistente) {
                          devolucionId = pedidoExistente.id;
                        } else {
                          // Guardar solo un registro mínimo (solo pedido) para generar el token
                          // Se actualizará cuando termine el proceso
                          const fd = new FormData();
                          fd.append("pedido", numeroPedido.trim());
                          fd.append("guia", "");
                          fd.append("paqueteria", "");
                          fd.append("motivo", "[En proceso - Fotos desde móvil]");
                          fd.append("area", "Clientes");
                          fd.append("usuario", user?.nickname || "");
                          fd.append("productos", JSON.stringify([])); // Sin productos aún
                          
                          const response = await authFetch(`${serverUrl}/devoluciones/clientes`, {
                            method: "POST",
                            body: fd,
                          });
                          
                          if (response.ok && response.id) {
                            devolucionId = response.id;
                            setDevolucionTemporalId(devolucionId); // Guardar el ID para actualizarlo después
                          } else {
                            throw new Error("Error generando código");
                          }
                        }
                        
                        if (devolucionId) {
                          await generarTokenMovil(devolucionId, numeroPedido);
                        }
                      } catch (error) {
                        console.error("Error generando token móvil:", error);
                        pushToast?.("❌ Error: " + (error.message || "Error generando código"), "err");
                      }
                    }}
                    className="btn"
                    style={{ 
                      flex: '1',
                      minWidth: '140px',
                      backgroundColor: '#10b981',
                      color: 'white',
                      border: 'none',
                      padding: '10px 15px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      fontSize: '0.95rem'
                    }}
                  >
                    📱 Tomar desde Celular
                  </button>
                </div>

                <div className="devMiniaturas">
                  {evidencias.map((ev) => (
                    <div key={ev.idTemp} style={{ position: 'relative', display: 'inline-block' }}>
                      <img
                        src={ev.preview}
                        className="devFotoMini"
                        onClick={() => setFotoGrande(ev.preview)}
                        alt=""
                      />
                      <button
                        onClick={() => {
                          setEvidencias((prev) => {
                            const evidencia = prev.find(e => e.idTemp === ev.idTemp);
                            if (evidencia && evidencia.preview) {
                              URL.revokeObjectURL(evidencia.preview);
                            }
                            return prev.filter(e => e.idTemp !== ev.idTemp);
                          });
                        }}
                        style={{
                          position: 'absolute',
                          top: '4px',
                          right: '4px',
                          background: 'var(--error)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '50%',
                          width: '24px',
                          height: '24px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '14px',
                          padding: 0
                        }}
                        title="Eliminar"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                {evidencias.length === 0 && (
                  <div style={{ padding: '20px', textAlign: 'center', opacity: 0.6 }}>
                    Sin evidencias finales
                  </div>
                )}

                <div className="devModalFooter">
                  <button onClick={() => setFase(3)}>← Regresar</button>
                  <button onClick={guardarDevolucion}>Guardar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FOTO GRANDE - Fuera del modal principal para evitar restricciones */}
      {fotoGrande && (
        <div
          className="devFotoGrandeFondo"
          onClick={() => setFotoGrande(null)}
        >
          <img src={fotoGrande} className="devFotoGrande" alt="" />
        </div>
      )}

      {/* ========================================= */}
      {/*        MODAL NUEVO CÓDIGO (REGRESADO)     */}
      {/* ========================================= */}
      {showModalNuevoCodigo && (
        <div className="devModalFondo">
          <div className="devModal">
            <div className="devModalHeader">
              <h3>Agregar Código Nuevo</h3>
              <button onClick={() => setShowModalNuevoCodigo(false)}>✕</button>
            </div>

            <div className="devModalBody">
              <label>Código detectado</label>
              <input value={codigoNuevoDetectado} readOnly />

              <label>Buscar producto</label>
              <input
                value={inventarioBusqueda}
                onChange={(e) => setInventarioBusqueda(e.target.value)}
                placeholder=""
              />

              <div className="devResultadosInv">
                {resultadosInv.map((p) => (
                  <div
                    key={p.codigo}
                    className={`devResultadoItem ${
                      productoSeleccionado?.codigo === p.codigo ? "activo" : ""
                    }`}
                    onClick={() => setProductoSeleccionado(p)}
                  >
                    <b>{p.codigo}</b> – {p.nombre}
                  </div>
                ))}
              </div>

              <label>Lote</label>
              <input
                value={productoActual.lote || ""}
                onChange={(e) =>
                  setProductoActual((prev) => ({ ...prev, lote: e.target.value }))
                }
                placeholder=""
              />

              <div className="devModalFooter">
                <button onClick={() => setShowModalNuevoCodigo(false)}>
                  Cancelar
                </button>
                <button onClick={guardarNuevoCodigo}>Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===========================================
          MODAL DETALLE DE PEDIDO
      =========================================== */}
      {detalleOpen && detallePedido && (
        <div 
          className="devModalFondo" 
          onClick={() => setDetalleOpen(false)}
        >
          <div 
            className="devModal"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(500px, 90vw)',
              maxWidth: '500px'
            }}
          >
            <div className="devModalHeader">
              <h3>Pedido {detallePedido.pedido}</h3>
              <button onClick={() => setDetalleOpen(false)}>✕</button>
            </div>
            
            <div className="devModalBody" style={{ overflow: 'auto' }}>
              <div style={{ marginBottom: '6px' }}>
                <strong>Fecha:</strong> {detallePedido.fecha}
              </div>
              <div style={{ marginBottom: '6px' }}>
                <strong>Guía:</strong> {detallePedido.guia || "–"}
              </div>
              <div style={{ marginBottom: '6px' }}>
                <strong>Paquetería:</strong> {detallePedido.paqueteria || "–"}
              </div>
              <div style={{ marginBottom: '6px' }}>
                <strong>Motivo:</strong> {detallePedido.motivo || "–"}
              </div>
              
              <hr style={{ opacity: 0.3, margin: '12px 0' }} />
              
              <strong>Fotos:</strong>
              <div className="thumbs" style={{ marginTop: 6, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {(detallePedido.fotos || []).map((src, i) => (
                  <div 
                    key={i} 
                    className="thumb"
                    onClick={() => abrirViewer(detallePedido.fotos, i)}
                    style={{
                      width: '80px',
                      height: '80px',
                      position: 'relative',
                      borderRadius: 'var(--radio-md)',
                      overflow: 'hidden',
                      boxShadow: 'var(--sombra-xs)',
                      cursor: 'pointer',
                      border: '1px solid var(--borde-sutil)',
                      backgroundColor: '#f0f0f0'
                    }}
                  >
                    <img 
                      src={src} 
                      alt={`Foto ${i + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        console.error("❌ Error cargando imagen:", src);
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; color: #999; font-size: 0.7rem;">Foto ${i + 1}</div>`;
                      }}
                      onLoad={() => {
                        console.log("✅ Imagen cargada correctamente:", src);
                      }}
                    />
                  </div>
                ))}
                {(!detallePedido.fotos || detallePedido.fotos.length === 0) && (
                  <div style={{ padding: '10px', opacity: 0.7 }}>Sin fotos</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===========================================
          MODAL VIEWER DE FOTOS
      =========================================== */}
      {viewerOpen && (
        <div 
          className="devModalFondo"
          onClick={cerrarViewer}
          style={{ zIndex: 4000 }}
        >
          <div 
            className="devModal"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(95vw, 1200px)',
              maxWidth: '95vw'
            }}
          >
            <div className="devModalHeader">
              <h3>Fotos del pedido</h3>
              <button onClick={cerrarViewer}>✕</button>
            </div>
            
            <div className="devModalBody" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px', gap: '16px', maxHeight: 'calc(100vh - 120px)', overflow: 'auto' }}>
              {viewerFotos.length > 0 && (
                <>
                  <div style={{ width: '100%', maxHeight: 'calc(100vh - 250px)', overflow: 'auto', borderRadius: 'var(--radio-lg)', boxShadow: 'var(--sombra-md)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', backgroundColor: 'var(--fondo-secundario)', padding: '10px' }}>
                    <img
                      src={viewerFotos[viewerIndex]}
                      alt={`Foto ${viewerIndex + 1}`}
                      style={{ 
                        maxWidth: '100%', 
                        maxHeight: 'calc(100vh - 270px)', 
                        width: 'auto', 
                        height: 'auto', 
                        display: 'block',
                        objectFit: 'contain',
                        objectPosition: 'center',
                        margin: '0 auto'
                      }}
                    />
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                    <button 
                      onClick={viewerPrev}
                      style={{
                        padding: '8px 16px',
                        border: '1px solid var(--borde-medio)',
                        background: 'var(--fondo-input)',
                        borderRadius: 'var(--radio-md)',
                        cursor: 'pointer',
                        color: 'var(--texto-principal)'
                      }}
                    >
                      ◀
                    </button>
                    <span style={{ fontWeight: '600', minWidth: '60px', textAlign: 'center' }}>
                      {viewerIndex + 1} / {viewerFotos.length}
                    </span>
                    <button 
                      onClick={viewerNext}
                    style={{
                      padding: '8px 16px',
                      border: '1px solid var(--borde-medio)',
                      background: 'var(--fondo-input)',
                      borderRadius: 'var(--radio-md)',
                      cursor: 'pointer',
                      color: 'var(--texto-principal)'
                    }}
                    >
                      ▶
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===========================================
          MODAL ACTIVACIÓN MASIVA
      =========================================== */}
      {resumenModal.open && (
        <div 
          className="devModalFondo"
          onClick={() => setResumenModal({ open: false, loading: false, data: [] })}
        >
          <div 
            className="devModal"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(600px, 90vw)',
              maxWidth: '600px'
            }}
          >
            <div className="devModalHeader">
              <h3>Activación Masiva - Productos Clientes</h3>
              <button onClick={() => setResumenModal({ open: false, loading: false, data: [] })}>✕</button>
            </div>
            
            <div className="devModalBody" style={{ overflow: 'auto' }}>
              {resumenModal.loading ? (
                <div className="devModalMensaje">Cargando...</div>
              ) : resumenModal.data.length === 0 ? (
                <div className="devModalMensaje">No hay productos</div>
              ) : (
                <table className="devModalTable" style={{ fontSize: '0.9rem', minWidth: 'auto' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '10px' }}>Nombre</th>
                      <th style={{ padding: '10px' }}>Total</th>
                      <th style={{ padding: '10px', textAlign: 'center' }}>Activo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumenModal.data.map((grupo, i) => (
                      <tr key={i}>
                        <td style={{ padding: '10px' }}>{grupo.nombre}</td>
                        <td style={{ padding: '10px' }}>{grupo.total}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <label className="switch" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={grupo.todosActivos}
                              onChange={async (e) => {
                                try {
                                  const response = await authFetch(`${serverUrl}/devoluciones/clientes/productos/estado`, {
                                    method: 'PUT',
                                    body: JSON.stringify({
                                      nombre: grupo.nombre,
                                      activo: e.target.checked ? 1 : 0
                                    })
                                  });
                                  
                                  // Si hay error en la respuesta
                                  if (response && response.error) {
                                    pushToast?.(response.error, "error");
                                    // Revertir el checkbox
                                    e.target.checked = !e.target.checked;
                                    return;
                                  }
                                  
                                  setResumenModal(prev => ({
                                    ...prev,
                                    data: prev.data.map(g =>
                                      g.nombre === grupo.nombre
                                        ? { ...g, todosActivos: e.target.checked, algunoActivo: e.target.checked }
                                        : g
                                    )
                                  }));
                                  pushToast?.("✅ Grupo actualizado", "success");
                                } catch (err) {
                                  console.error(err);
                                  const errorMessage = err?.message || err?.error || "Error actualizando grupo";
                                  pushToast?.(`❌ ${errorMessage}`, "error");
                                  // Revertir el checkbox en caso de error
                                  e.target.checked = !e.target.checked;
                                }
                              }}
                            />
                            <span className="slider"></span>
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            
            <div className="devModalFooter">
              <button 
                onClick={() => setResumenModal({ open: false, loading: false, data: [] })}
                className="btn-secundario"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===========================================
          MODAL PRODUCTOS DE UN PEDIDO
      =========================================== */}
      {productosPedidoModal.open && (
        <div 
          className="devModalFondo" 
          onClick={() => {
            setProductosPedidoModal({ open: false, pedido: null, productos: [], loading: false });
            setEditandoProducto({});
          }}
        >
          <div 
            className="devModal"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(900px, 95vw)',
              maxWidth: '900px'
            }}
          >
            <div className="devModalHeader">
              <h3>Productos - Pedido {productosPedidoModal.pedido?.pedido}</h3>
              <button onClick={() => {
                setProductosPedidoModal({ open: false, pedido: null, productos: [], loading: false });
                setEditandoProducto({});
              }}>✕</button>
            </div>
            
            <div className="devModalBody devModalBodyScroll" style={{ 
              overflow: 'hidden', 
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0
            }}>
              {productosPedidoModal.loading ? (
                <div className="devModalMensaje">Cargando productos...</div>
              ) : productosPedidoModal.productos.length === 0 ? (
                <div className="devModalMensaje">No hay productos en este pedido</div>
              ) : (
                <div style={{ 
                  overflowX: 'auto', 
                  overflowY: 'auto', 
                  flex: 1,
                  width: '100%',
                  minHeight: 0
                }}>
                  <table className="devModalTable">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Nombre</th>
                      <th>Presentación</th>
                      <th>Lote</th>
                      <th>Cantidad</th>
                      <th>Caducidad</th>
                      <th style={{ textAlign: 'center', minWidth: '80px' }}>Apto</th>
                      <th style={{ textAlign: 'center', minWidth: '100px' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosPedidoModal.productos.map((p, i) => {
                      const editando = editandoProducto[p.id];
                      return (
                        <tr key={i}>
                          <td>{p.codigo || "–"}</td>
                          <td>
                            {editando ? (
                              <input
                                type="text"
                                value={editando.nombre ?? (p.nombre ?? "")}
                                onChange={(e) => setEditandoProducto(prev => ({
                                  ...prev,
                                  [p.id]: { ...prev[p.id], nombre: e.target.value }
                                }))}
                                className="devModalTableInput"
                              />
                            ) : (
                              p.nombre || "–"
                            )}
                          </td>
                          <td>{p.presentacion || "–"}</td>
                          <td>
                            {editando ? (
                              <input
                                type="text"
                                value={editando.lote ?? (p.lote ?? "")}
                                onChange={(e) => setEditandoProducto(prev => ({
                                  ...prev,
                                  [p.id]: { ...prev[p.id], lote: e.target.value }
                                }))}
                                className="devModalTableInput"
                              />
                            ) : (
                              p.lote || "–"
                            )}
                          </td>
                          <td>
                            {editando ? (
                              <input
                                type="number"
                                value={editando.cantidad !== undefined ? editando.cantidad : (p.cantidad ?? 0)}
                                onChange={(e) => setEditandoProducto(prev => ({
                                  ...prev,
                                  [p.id]: { ...prev[p.id], cantidad: e.target.value }
                                }))}
                                className="devModalTableInput"
                              />
                            ) : (
                              p.cantidad ?? 0
                            )}
                          </td>
                          <td>
                            {editando ? (
                              <input
                                type="date"
                                value={editando.caducidad ?? (p.caducidad ?? "")}
                                onChange={(e) => setEditandoProducto(prev => ({
                                  ...prev,
                                  [p.id]: { ...prev[p.id], caducidad: e.target.value }
                                }))}
                                className="devModalTableInput"
                              />
                            ) : (
                              p.caducidad || "–"
                            )}
                          </td>
                          <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                            {editando ? (
                              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                                <label 
                                  className="switch" 
                                  style={{ 
                                    display: 'inline-block',
                                    cursor: 'pointer',
                                    margin: '0 auto'
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={editando.apto !== undefined ? (editando.apto === 1) : (p.apto === 1)}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      setEditandoProducto(prev => ({
                                        ...prev,
                                        [p.id]: { ...prev[p.id], apto: e.target.checked ? 1 : 0 }
                                      }));
                                    }}
                                  />
                                  <span className="slider"></span>
                                </label>
                              </div>
                            ) : (
                              p.apto === 1 ? (
                                <span style={{ color: 'var(--exito)', fontWeight: '600', fontSize: '0.75rem' }}>Apto</span>
                              ) : (
                                <span style={{ color: 'var(--error)', fontWeight: '600', fontSize: '0.75rem' }}>No apto</span>
                              )
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {editando ? (
                              <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                <button
                                  onClick={async () => {
                                    try {
                                      await authFetch(`${serverUrl}/devoluciones/producto/${p.id}`, {
                                        method: 'PUT',
                                        body: JSON.stringify({
                                          nombre: editando.nombre !== undefined ? editando.nombre : p.nombre,
                                          lote: editando.lote !== undefined ? editando.lote : p.lote,
                                          cantidad: editando.cantidad !== undefined ? editando.cantidad : p.cantidad,
                                          caducidad: editando.caducidad !== undefined ? editando.caducidad : p.caducidad,
                                          apto: editando.apto !== undefined ? editando.apto : p.apto
                                        })
                                      });
                                      setProductosPedidoModal(prev => ({
                                        ...prev,
                                        productos: prev.productos.map(prod =>
                                          prod.id === p.id
                                            ? {
                                                ...prod,
                                                nombre: editando.nombre !== undefined ? editando.nombre : prod.nombre,
                                                lote: editando.lote !== undefined ? editando.lote : prod.lote,
                                                cantidad: editando.cantidad !== undefined ? editando.cantidad : prod.cantidad,
                                                caducidad: editando.caducidad !== undefined ? editando.caducidad : prod.caducidad,
                                                apto: editando.apto !== undefined ? editando.apto : prod.apto
                                              }
                                            : prod
                                        )
                                      }));
                                      setEditandoProducto(prev => {
                                        const nuevo = { ...prev };
                                        delete nuevo[p.id];
                                        return nuevo;
                                      });
                                      // Recargar modal de activación si está abierto
                                      await recargarResumenModal();
                                      // Emitir evento para recargar modal de activación en BotonActivacionClientes
                                      window.dispatchEvent(new CustomEvent('productoEditado'));
                                      pushToast?.("✅ Producto actualizado", "success");
                                    } catch (err) {
                                      console.error(err);
                                      pushToast?.("❌ Error actualizando producto", "error");
                                    }
                                  }}
                                  className="devModalBtnAceptar"
                                >
                                  ✓
                                </button>
                                <button
                                  onClick={() => {
                                    setEditandoProducto(prev => {
                                      const nuevo = { ...prev };
                                      delete nuevo[p.id];
                                      return nuevo;
                                    });
                                  }}
                                  className="devModalBtnCancelar"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setEditandoProducto(prev => ({
                                  ...prev,
                                  [p.id]: {
                                    nombre: p.nombre,
                                    lote: p.lote,
                                    cantidad: p.cantidad,
                                    caducidad: p.caducidad,
                                    apto: p.apto === 1
                                  }
                                }))}
                                className="devModalBtnEditar"
                              >
                                ✏️
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  </table>
                </div>
              )}
            </div>
            
            <div className="devModalFooter">
              <button 
                onClick={() => {
                  setProductosPedidoModal({ open: false, pedido: null, productos: [], loading: false });
                  setEditandoProducto({});
                }}
                className="btn-secundario"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===========================================
          MODAL CÁMARA PARA EVIDENCIAS DEL PAQUETE
      =========================================== */}
      {showCamModalPaquete && (
        <div 
          className="devModalFondo"
          onClick={cerrarCamaraPaquete}
          style={{ zIndex: 5000 }}
        >
          <div 
            className="devModal"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(600px, 95vw)',
              maxWidth: '600px'
            }}
          >
            <div className="devModalHeader">
              <h3>Tomar Foto del Paquete</h3>
              <button onClick={cerrarCamaraPaquete}>✕</button>
            </div>
            
            <div className="devModalBody" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px', gap: '16px' }}>
              <div style={{ width: '100%', maxHeight: '400px', overflow: 'hidden', borderRadius: 'var(--radio-lg)', boxShadow: 'var(--sombra-md)', backgroundColor: '#000' }}>
                <video
                  ref={videoRefPaquete}
                  autoPlay
                  playsInline
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </div>
              
              <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                <button
                  onClick={cerrarCamaraPaquete}
                  style={{
                    flex: 1,
                    padding: '12px',
                    border: '1px solid var(--borde-medio)',
                    background: 'var(--fondo-input)',
                    borderRadius: 'var(--radio-md)',
                    cursor: 'pointer',
                    color: 'var(--texto-principal)',
                    fontSize: '1rem',
                    fontWeight: '600'
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={capturarFotoPaquete}
                  style={{
                    flex: 1,
                    padding: '12px',
                    border: 'none',
                    background: '#3b82f6',
                    borderRadius: 'var(--radio-md)',
                    cursor: 'pointer',
                    color: 'white',
                    fontSize: '1rem',
                    fontWeight: '600'
                  }}
                >
                  📷 Capturar Foto
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===========================================
          MODAL CÁMARA PARA EVIDENCIAS FINALES
      =========================================== */}
      {showCamModalEvidencias && (
        <div 
          className="devModalFondo"
          onClick={cerrarCamaraEvidencias}
          style={{ zIndex: 5000 }}
        >
          <div 
            className="devModal"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(600px, 95vw)',
              maxWidth: '600px'
            }}
          >
            <div className="devModalHeader">
              <h3>Tomar Foto de Evidencias</h3>
              <button onClick={cerrarCamaraEvidencias}>✕</button>
            </div>
            
            <div className="devModalBody" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px', gap: '16px' }}>
              <div style={{ width: '100%', maxHeight: '400px', overflow: 'hidden', borderRadius: 'var(--radio-lg)', boxShadow: 'var(--sombra-md)', backgroundColor: '#000' }}>
                <video
                  ref={videoRefEvidencias}
                  autoPlay
                  playsInline
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </div>
              
              <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                <button
                  onClick={cerrarCamaraEvidencias}
                  style={{
                    flex: 1,
                    padding: '12px',
                    border: '1px solid var(--borde-medio)',
                    background: 'var(--fondo-input)',
                    borderRadius: 'var(--radio-md)',
                    cursor: 'pointer',
                    color: 'var(--texto-principal)',
                    fontSize: '1rem',
                    fontWeight: '600'
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={capturarFotoEvidencias}
                  style={{
                    flex: 1,
                    padding: '12px',
                    border: 'none',
                    background: '#3b82f6',
                    borderRadius: 'var(--radio-md)',
                    cursor: 'pointer',
                    color: 'white',
                    fontSize: '1rem',
                    fontWeight: '600'
                  }}
                >
                  📷 Capturar Foto
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===========================================
          MODAL QR PARA MÓVIL
      =========================================== */}
      {qrModalOpen && (
        <div
          className="devModalFondo"
          onClick={() => setQrModalOpen(false)}
          style={{ zIndex: 6000 }}
        >
          <div
            className="devModal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "500px", width: "90%" }}
          >
            <div style={{ padding: "20px", borderBottom: "1px solid var(--borde-medio)" }}>
              <h3 style={{ margin: 0 }}>📱 Tomar foto desde celular</h3>
              <button
                onClick={() => setQrModalOpen(false)}
                style={{
                  position: "absolute",
                  top: "20px",
                  right: "20px",
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  color: "var(--texto-secundario)"
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "30px", textAlign: "center" }}>
              {qrLoading ? (
                <div style={{ padding: "40px" }}>
                  <div style={{ fontSize: "48px", marginBottom: "20px" }}>⏳</div>
                  <p>Generando código...</p>
                </div>
              ) : (
                <>
                  <p style={{ marginBottom: "20px", fontSize: "16px", color: "#666" }}>
                    Escanea este código QR con tu celular para tomar y subir fotos
                  </p>
                  {qrPedido && (
                    <p style={{ marginBottom: "20px", fontSize: "18px", fontWeight: "600" }}>
                      Pedido: <strong>{qrPedido}</strong>
                    </p>
                  )}
                  <div style={{ 
                    display: "flex", 
                    justifyContent: "center", 
                    marginBottom: "20px",
                    padding: "20px",
                    backgroundColor: "#f5f5f5",
                    borderRadius: "10px"
                  }}>
                    <img
                      src={`${serverUrl}/devoluciones/qr?data=${encodeURIComponent(qrUrl)}&t=${Date.now()}`}
                      alt="QR Code"
                      style={{ 
                        maxWidth: "100%", 
                        height: "auto",
                        border: "5px solid white",
                        borderRadius: "10px"
                      }}
                    />
                  </div>
                  <p style={{ marginBottom: "20px", fontSize: "14px", color: "#999" }}>
                    O copia este enlace:
                  </p>
                  <div style={{ 
                    backgroundColor: "#f0f0f0", 
                    padding: "10px", 
                    borderRadius: "8px",
                    marginBottom: "20px",
                    wordBreak: "break-all",
                    fontSize: "12px"
                  }}>
                    {qrUrl}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(qrUrl);
                      pushToast?.("✅ Enlace copiado al portapapeles", "ok");
                    }}
                    style={{
                      width: "100%",
                      padding: "12px",
                      background: "#3b82f6",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontSize: "1rem",
                      fontWeight: "600",
                      marginBottom: "15px"
                    }}
                  >
                    📋 Copiar enlace
                  </button>
                  <p style={{ fontSize: "12px", color: "#999", marginTop: "20px" }}>
                    ⏰ Este código expira en 30 minutos
                  </p>
                </>
              )}
            </div>

            <div style={{ padding: "20px", borderTop: "1px solid var(--borde-medio)", display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setQrModalOpen(false)}
                style={{
                  padding: "10px 20px",
                  background: "var(--borde-medio)",
                  color: "var(--texto-principal)",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "0.95rem"
                }}
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
