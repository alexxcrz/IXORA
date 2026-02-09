// src/tabs/Reenvios.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./Reenvios.css";
import { useAuth } from "../../AuthContext";
import { useAlert } from "../../components/AlertModal";

export default function Reenvios({ serverUrl, pushToast, fecha, socket }) {
  const { authFetch } = useAuth();
  const { showConfirm, showAlert } = useAlert();
  const [reenvios, setReenvios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busquedaPedido, setBusquedaPedido] = useState("");
  const [reenviosHistoricos, setReenviosHistoricos] = useState([]);
  const [mostrarHistoricos, setMostrarHistoricos] = useState(false);
  
  // Detectar si es dispositivo móvil
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // Wizard
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [modoLiberacion, setModoLiberacion] = useState(false);
  const [libSourceId, setLibSourceId] = useState(null);

  // Detalle
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [detalleItem, setDetalleItem] = useState(null);

  // Viewer de fotos (modal aparte)
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerFotos, setViewerFotos] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  // Modal pequeño para EDITAR envío
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [editPedido, setEditPedido] = useState("");
  const [editGuia, setEditGuia] = useState("");
  const [editPaq, setEditPaq] = useState("");
  const [editFotos, setEditFotos] = useState([]);
  const [editPreviews, setEditPreviews] = useState([]);
  const [editFotosData, setEditFotosData] = useState([]); // Guardar datos completos de fotos (url, id, archivo)
  const editFileInputRef = useRef(null);

  // Formulario wizard
  const [pedido, setPedido] = useState("");
  const [guia, setGuia] = useState("");
  const [paqueteria, setPaqueteria] = useState("");
  const [motivo, setMotivo] = useState("");
  const [motivosPersonalizados, setMotivosPersonalizados] = useState([]);
  const [mostrarInputMotivo, setMostrarInputMotivo] = useState(false);
  const [nuevoMotivo, setNuevoMotivo] = useState("");

  const [libData, setLibData] = useState({
    pedidoAnterior: "",
    motivoDetencion: "",
    fechaLiberacion: "",
  });

  // Fotos
  const [fotos, setFotos] = useState([]);
  const [previews, setPreviews] = useState([]);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // Refs para inputs del wizard
  const pedidoInputRef = useRef(null);
  const motivoInputRef = useRef(null);
  const guiaInputRef = useRef(null);
  const paqueteriaInputRef = useRef(null);
  
  // Ref para rastrear si la paquetería fue detectada automáticamente
  const paqueteriaAutoDetectada = useRef(false);
  const timeoutGuardadoAuto = useRef(null);
  const finalizarRef = useRef(null);
  const guiaAnterior = useRef("");

  // Estado para modal de cámara
  const [camModalOpen, setCamModalOpen] = useState(false);
  const [camStream, setCamStream] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Modal QR para móvil
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const [qrPedido, setQrPedido] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [qrExpiraEn, setQrExpiraEn] = useState(null);
  
  // ID temporal del reenvío si se creó solo para el token móvil
  const [reenvioTemporalId, setReenvioTemporalId] = useState(null);

  // ====== MODAL CIERRE DE DÍA ======
  const [cerrarModalOpen, setCerrarModalOpen] = useState(false);
  const [cerrarLoading, setCerrarLoading] = useState(false);
  const [cerrarResumen, setCerrarResumen] = useState(null);

  // ====== FILTRO POR PAQUETERÍA ======
  const [filtroPaqueteria, setFiltroPaqueteria] = useState("TOTAL");

  // ====== TARJETAS EXPANDIDAS EN MÓVIL ======
  const [tarjetaExpandida, setTarjetaExpandida] = useState(null);

  // ====== COMPARTIR POR CHAT ======
  const [compartirOpen, setCompartirOpen] = useState(false);
  const [compartirItem, setCompartirItem] = useState(null);
  const [compartirUsuarios, setCompartirUsuarios] = useState([]);
  const [compartirDestino, setCompartirDestino] = useState("");
  const [compartiendo, setCompartiendo] = useState(false);

  // ====== REENVÍOS EN PROCESO (INDICADOR EN TIEMPO REAL) ======
  const [reenviosEnProceso, setReenviosEnProceso] = useState([]);

  const cargarUsuariosChat = async () => {
    try {
      const data = await authFetch(`${serverUrl}/chat/usuarios`);
      setCompartirUsuarios(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Error cargando usuarios de chat:", e);
      setCompartirUsuarios([]);
    }
  };

  const abrirCompartir = async (item) => {
    setCompartirItem(item);
    setCompartirDestino("");
    setCompartirOpen(true);
    await cargarUsuariosChat();
  };

  const construirMensajeCompartir = (item) => {
    if (!item) return "Reenvío compartido.";
    const base = new URL(window.location.origin);
    base.pathname = '/reenvios';
    base.searchParams.set("share", "reenvio");
    if (item.id) base.searchParams.set("id", String(item.id));
    if (item.pedido) base.searchParams.set("pedido", String(item.pedido));
    return base.toString();
  };

  const enviarCompartir = async () => {
    if (!compartirDestino || !compartirItem) {
      showAlert("Selecciona un usuario para compartir.", "warning");
      return;
    }
    try {
      setCompartiendo(true);
      await authFetch(`${serverUrl}/chat/privado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          para_nickname: compartirDestino,
          mensaje: construirMensajeCompartir(compartirItem),
          tipo_mensaje: "texto",
        }),
      });
      showAlert("Reenvío compartido por chat.", "success");
      setCompartirOpen(false);
    } catch (e) {
      console.error("Error compartiendo reenvío:", e);
      showAlert("No se pudo compartir el reenvío.", "error");
    } finally {
      setCompartiendo(false);
    }
  };

  // ====== HISTORIAL Y RASTREO ======
  const [historialEstados, setHistorialEstados] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [enlaceRastreo, setEnlaceRastreo] = useState(null);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [modalActualizarEstado, setModalActualizarEstado] = useState(false);
  const [nuevoEstado, setNuevoEstado] = useState("");
  const [observacionEstado, setObservacionEstado] = useState("");
  const [verificandoEstado, setVerificandoEstado] = useState(false);
  const [infoRastreo, setInfoRastreo] = useState(null);

  // ============================================================
  // CARGAR TODOS LOS REENVÍOS
  // ============================================================
  const cargar = async () => {
    try {
      setLoading(true);
      const data = await authFetch(`${serverUrl}/reenvios`);
      const reenviosArray = Array.isArray(data) ? data : [];
      
      // Ordenar: primero los que NO están "Enviado", luego los "Enviado" al final
      const reenviosOrdenados = reenviosArray.sort((a, b) => {
        const aEnviado = (a.estatus || "").toUpperCase() === "ENVIADO";
        const bEnviado = (b.estatus || "").toUpperCase() === "ENVIADO";
        
        // Si ambos tienen el mismo estatus (ambos enviados o ambos no enviados), mantener orden por ID DESC
        if (aEnviado === bEnviado) {
          return (b.id || 0) - (a.id || 0);
        }
        
        // Si uno es enviado y el otro no, el enviado va al final
        return aEnviado ? 1 : -1;
      });
      
      setReenvios(reenviosOrdenados);
    } catch (e) {
      console.error("GET /reenvios", e);
      pushToast?.("❌ Error cargando reenvíos", "err");
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    cargar();
    // Cargar procesos guardados en localStorage
    try {
      const procesosGuardados = localStorage.getItem('reenvios_en_proceso');
      if (procesosGuardados) {
        const procesos = JSON.parse(procesosGuardados);
        setReenviosEnProceso(procesos);
      }
    } catch (error) {
      console.error('Error cargando procesos guardados:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refs para evitar loops infinitos en socket listeners
  const detalleItemRef = useRef(detalleItem);
  useEffect(() => {
    detalleItemRef.current = detalleItem;
  }, [detalleItem]);

  const shareHandledRef = useRef(false);

  const abrirDetalleReenvio = async (item, esHistorico = false) => {
    if (!item) return;
    setModalOpen(false);
    setDetalleItem(null);
    setDetalleOpen(false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const payload = esHistorico ? { ...item, esHistorico: true } : item;
    const fotosDetalle = await cargarFotosDetalle(payload);
    const fotosDataCompleto = await cargarFotosDetalleCompleto(payload);
    setDetalleItem({
      ...payload,
      fotos: fotosDetalle,
      fotosData: fotosDataCompleto,
    });
    setDetalleOpen(true);
  };

  useEffect(() => {
    if (loading || shareHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("share") !== "reenvio") return;
    const id = Number(params.get("id"));
    const pedido = params.get("pedido") || "";
    let encontrado = null;
    let esHistorico = false;

    if (id) {
      encontrado = reenvios.find((r) => r.id === id);
    }
    if (!encontrado && pedido) {
      encontrado = reenvios.find((r) => String(r.pedido) === String(pedido));
    }
    if (!encontrado && pedido && Array.isArray(reenviosHistoricos)) {
      const hist = reenviosHistoricos.find((r) => String(r.pedido) === String(pedido));
      if (hist) {
        encontrado = hist;
        esHistorico = true;
      }
    }

    if (encontrado) {
      shareHandledRef.current = true;
      abrirDetalleReenvio(encontrado, esHistorico).catch(() => {});
    }
  }, [loading, reenvios, reenviosHistoricos]);

  // Auto-guardar progreso cuando cambian las fotos (con delay para no saturar)
  useEffect(() => {
    if (!modalOpen || !pedido.trim()) return;
    
    const timeoutId = setTimeout(() => {
      guardarProgresoLocal(pedido.trim());
    }, 1000); // Guardar 1 segundo después del último cambio
    
    return () => clearTimeout(timeoutId);
  }, [fotos, modalOpen, pedido]);

  // ============================================================
  // SOCKET.IO - SINCRONIZACIÓN EN TIEMPO REAL (SIN RECARGAS)
  // ============================================================
  // Actualizar SOLO los reenvíos individuales que cambiaron sin recargar la lista completa
  useEffect(() => {
    if (!socket) return;

    const handleReenvioActualizado = (reenvioData) => {
      if (!reenvioData || !reenvioData.id) return;
      
      setReenvios((prevReenvios) => {
        // Verificar si el reenvío existe
        const existe = prevReenvios.find((r) => r.id === reenvioData.id);
        
        if (existe) {
          // Actualizar reenvío existente
          return prevReenvios.map((r) =>
            r.id === reenvioData.id ? { ...r, ...reenvioData } : r
          );
        } else {
          // Si no existe, agregarlo al principio (es nuevo)
          return [reenvioData, ...prevReenvios];
        }
      });
      
      // Si el detalle está abierto y es este reenvío, actualizarlo también
      if (detalleItemRef.current && detalleItemRef.current.id === reenvioData.id) {
        setDetalleItem((prev) => ({ ...prev, ...reenvioData }));
      }
    };

    const handleReenvioAgregado = (reenvioData) => {
      if (!reenvioData || !reenvioData.id) return;
      
      setReenvios((prevReenvios) => {
        const yaExiste = prevReenvios.find((r) => r.id === reenvioData.id);
        if (yaExiste) return prevReenvios; // No duplicar
        
        // Agregar al principio
        return [reenvioData, ...prevReenvios];
      });
    };

    const handleReenvioEliminado = (reenvioId) => {
      if (!reenvioId) return;
      
      setReenvios((prevReenvios) =>
        prevReenvios.filter((r) => r.id !== reenvioId)
      );
      
      // Si estaba abierto en detalle, cerrar
      if (detalleItemRef.current && detalleItemRef.current.id === reenvioId) {
        setDetalleOpen(false);
        setDetalleItem(null);
      }
    };

    socket.on("reenvio_actualizado", handleReenvioActualizado);
    socket.on("reenvio_agregado", handleReenvioAgregado);
    socket.on("reenvio_eliminado", handleReenvioEliminado);

    // Eventos para reenvíos en proceso
    const handleReenvioEnProceso = (data) => {
      // data = { pedido, usuario, accion: "crear" | "editar" }
      if (!data || !data.pedido) return;
      
      setReenviosEnProceso((prev) => {
        // Evitar duplicados
        const existe = prev.find((p) => p.pedido === data.pedido);
        if (existe) return prev;
        const nuevaLista = [...prev, data];
        
        // Guardar en localStorage
        try {
          localStorage.setItem('reenvios_en_proceso', JSON.stringify(nuevaLista));
        } catch (error) {
          console.error('Error guardando procesos:', error);
        }
        
        return nuevaLista;
      });
    };

    const handleReenvioProcesoTerminado = (data) => {
      // data = { pedido }
      if (!data || !data.pedido) return;
      
      setReenviosEnProceso((prev) => {
        const nuevaLista = prev.filter((p) => p.pedido !== data.pedido);
        
        // Actualizar localStorage
        try {
          localStorage.setItem('reenvios_en_proceso', JSON.stringify(nuevaLista));
        } catch (error) {
          console.error('Error actualizando procesos:', error);
        }
        
        return nuevaLista;
      });
    };

    socket.on("reenvio_en_proceso", handleReenvioEnProceso);
    socket.on("reenvio_proceso_terminado", handleReenvioProcesoTerminado);

    return () => {
      socket.off("reenvio_actualizado", handleReenvioActualizado);
      socket.off("reenvio_agregado", handleReenvioAgregado);
      socket.off("reenvio_eliminado", handleReenvioEliminado);
      socket.off("reenvio_en_proceso", handleReenvioEnProceso);
      socket.off("reenvio_proceso_terminado", handleReenvioProcesoTerminado);
    };
  }, [socket]);

  // ============================================================
  // DETECTAR PAQUETERÍA POR FORMATO DE GUÍA
  // ============================================================
  const detectarPaqueteria = (texto) => {
    if (!texto) return "";
    const s = String(texto).trim();

    if (/^JJD\w+/i.test(s)) return "DHL"; // DHL
    if (/^\d{30,40}$/.test(s)) return "FEDEX"; // FedEx (muchos dígitos)
    if (/^[A-Z0-9]{20,30}$/i.test(s)) return "ESTAFETA"; // Estafeta

    return "";
  };

  // El guardado automático ahora se maneja directamente en el onChange del input de guía
  // Este useEffect solo actualiza el ref de guiaAnterior para referencia
  useEffect(() => {
    guiaAnterior.current = guia;
  }, [guia]);

  // Helpers para previews (mejor compatibilidad en móvil)
  const revocarPreview = (src) => {
    if (src && typeof src === "string" && src.startsWith("blob:")) {
      URL.revokeObjectURL(src);
    }
  };

  const leerArchivoComoDataUrl = (file) =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result || "");
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });

  const generarPreviews = async (files) => {
    if (isMobileDevice) {
      return Promise.all(files.map((file) => leerArchivoComoDataUrl(file)));
    }
    return files.map((file) => URL.createObjectURL(file));
  };

  // ============================================================
  // NOTIFICAR PROCESO
  // ============================================================
  const { user } = useAuth();
  
  const notificarInicioProceso = (pedidoNum, accion = "crear") => {
    if (socket && pedidoNum) {
      socket.emit("reenvio_iniciado", {
        pedido: pedidoNum,
        usuario: user?.name || "Usuario",
        accion
      });
    }
  };

  const notificarFinProceso = (pedidoNum) => {
    if (socket && pedidoNum) {
      socket.emit("reenvio_finalizado", {
        pedido: pedidoNum
      });
    }
  };

  // Guardar progreso en localStorage
  const guardarProgresoLocal = async (pedidoKey) => {
    if (!pedidoKey) return;
    
    try {
      // Convertir fotos a base64 para guardar en localStorage
      const fotosBase64 = await Promise.all(
        fotos.map(async (foto) => {
          try {
            // Si ya es una URL base64, usarla directamente
            if (foto.preview && foto.preview.startsWith('data:')) {
              return { preview: foto.preview, idTemp: foto.idTemp };
            }
            // Si es un objeto File, convertirlo a base64
            if (foto.file) {
              return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  resolve({ preview: reader.result, idTemp: foto.idTemp });
                };
                reader.readAsDataURL(foto.file);
              });
            }
            // Si solo tiene preview (blob URL), usarlo
            return { preview: foto.preview, idTemp: foto.idTemp };
          } catch (err) {
            console.error('Error convirtiendo foto:', err);
            return null;
          }
        })
      );
      
      const progreso = {
        pedido,
        step,
        guia,
        paqueteria,
        motivo,
        fotos: fotosBase64.filter(f => f !== null),
        timestamp: Date.now()
      };
      
      localStorage.setItem(`reenvio_progreso_${pedidoKey}`, JSON.stringify(progreso));
    } catch (error) {
      console.error("Error guardando progreso:", error);
    }
  };

  // Cargar progreso desde localStorage
  const cargarProgresoLocal = (pedidoKey) => {
    if (!pedidoKey) return null;
    
    try {
      const stored = localStorage.getItem(`reenvio_progreso_${pedidoKey}`);
      if (!stored) return null;
      
      const progreso = JSON.parse(stored);
      
      // Verificar que no sea muy antiguo (más de 24 horas)
      const horasTranscurridas = (Date.now() - progreso.timestamp) / (1000 * 60 * 60);
      if (horasTranscurridas > 24) {
        localStorage.removeItem(`reenvio_progreso_${pedidoKey}`);
        return null;
      }
      
      return progreso;
    } catch (error) {
      console.error("Error cargando progreso:", error);
      return null;
    }
  };

  // Limpiar progreso guardado
  const limpiarProgresoLocal = (pedidoKey) => {
    if (!pedidoKey) return;
    try {
      localStorage.removeItem(`reenvio_progreso_${pedidoKey}`);
    } catch (error) {
      console.error("Error limpiando progreso:", error);
    }
  };

  // Regresar a un reenvío en proceso (clickeando el indicador)
  const regresarAProceso = async (pedidoNumero) => {
    try {
      // Buscar el reenvío en la lista actual
      const reenvio = reenvios.find((r) => r.pedido === pedidoNumero);
      
      if (reenvio) {
        // Si existe en la lista, abrir en modo edición
        editarEnvio(reenvio);
      } else {
        // Intentar cargar progreso guardado
        const progreso = cargarProgresoLocal(pedidoNumero);
        
        if (progreso) {
          // Restaurar progreso
          setPedido(progreso.pedido);
          setStep(progreso.step);
          setGuia(progreso.guia || "");
          setPaqueteria(progreso.paqueteria || "");
          setMotivo(progreso.motivo || "");
          
          // Restaurar fotos desde base64
          if (progreso.fotos && Array.isArray(progreso.fotos) && progreso.fotos.length > 0) {
            const fotosRestauradas = progreso.fotos.map((f) => ({
              preview: f.preview,
              idTemp: f.idTemp || Date.now() + Math.random(),
              file: null // No podemos restaurar el File original, pero tenemos el preview
            }));
            setFotos(fotosRestauradas);
            pushToast?.(`✅ Progreso restaurado con ${progreso.fotos.length} foto(s)`, "ok");
          } else {
            setFotos([]);
            pushToast?.(`✅ Progreso restaurado`, "ok");
          }
          
          setModalOpen(true);
        } else {
          // Si no hay progreso, crear uno nuevo
          resetWizard();
          setPedido(pedidoNumero);
          setModalOpen(true);
          setStep(1);
        }
      }
    } catch (error) {
      console.error("Error regresando al proceso:", error);
      pushToast?.("❌ Error al regresar al proceso", "err");
    }
  };

  // ============================================================
  // RESET DEL WIZARD
  // ============================================================
  const resetWizard = () => {
    setStep(1);
    setModoLiberacion(false);
    setLibSourceId(null);
    setPedido("");
    setGuia("");
    setPaqueteria("");
    setMotivo("");
    setMostrarInputMotivo(false);
    setNuevoMotivo("");

    setLibData({
      pedidoAnterior: "",
      motivoDetencion: "",
      fechaLiberacion: "",
    });

    previews.forEach(revocarPreview);
    setPreviews([]);
    setFotos([]);
    setReenvioTemporalId(null); // Limpiar ID temporal
    
    // Limpiar refs y timeouts
    paqueteriaAutoDetectada.current = false;
    if (timeoutGuardadoAuto.current) {
      clearTimeout(timeoutGuardadoAuto.current);
      timeoutGuardadoAuto.current = null;
    }
  };

  const abrirNuevo = () => {
    resetWizard();
    setDetalleOpen(false);
    setModalOpen(true);
  };

  // Notificar cuando se ABRE el wizard (después de que el usuario ingrese el pedido)
  useEffect(() => {
    if (modalOpen && step === 1 && pedido && pedido.trim()) {
      // Iniciar notificación de proceso
      notificarInicioProceso(pedido, "crear");
    }
  }, [modalOpen, step, pedido]);

  // Ocultar banner de bienvenida cuando se abre el modal de edición
  useEffect(() => {
    const mensajeBienvenida = document.getElementById("mensaje-bienvenida-editable");
    const mensajeBienvenidaClass = document.querySelector(".mensaje-bienvenida");
    
    if (editOpen) {
      // Ocultar el banner cuando se abre el modal de edición
      if (mensajeBienvenida) {
        mensajeBienvenida.style.display = "none";
        mensajeBienvenida.style.visibility = "hidden";
        mensajeBienvenida.style.opacity = "0";
      }
      if (mensajeBienvenidaClass) {
        mensajeBienvenidaClass.style.display = "none";
        mensajeBienvenidaClass.style.visibility = "hidden";
        mensajeBienvenidaClass.style.opacity = "0";
      }
    } else {
      // Restaurar el banner cuando se cierra el modal de edición
      if (mensajeBienvenida) {
        mensajeBienvenida.style.display = "flex";
        mensajeBienvenida.style.visibility = "visible";
        mensajeBienvenida.style.opacity = "0.95";
      }
      if (mensajeBienvenidaClass) {
        mensajeBienvenidaClass.style.display = "flex";
        mensajeBienvenidaClass.style.visibility = "visible";
        mensajeBienvenidaClass.style.opacity = "0.95";
      }
    }
  }, [editOpen]);

  // Enfocar el input del paso actual cuando se abre el modal o cambia el paso
  useEffect(() => {
    if (modalOpen) {
      // Pequeño delay para asegurar que el DOM esté listo
      setTimeout(() => {
        if (step === 1 && pedidoInputRef.current) {
          pedidoInputRef.current.focus();
        } else if (step === 2 && motivoInputRef.current) {
          motivoInputRef.current.focus();
        } else if (step === 3) {
          // Paso 3 es fotos, no hay input para enfocar
        } else if (step === 4 && guiaInputRef.current) {
          guiaInputRef.current.focus();
        }
      }, 100);
    }
  }, [modalOpen, step]);

  const abrirLiberacion = (item) => {
    resetWizard();
    setModoLiberacion(true);
    setLibSourceId(item.id);

    setLibData({
      pedidoAnterior: item.pedido || "",
      motivoDetencion: (item.observaciones || "").split("\n").pop() || "",
      fechaLiberacion: new Date().toISOString().slice(0, 19).replace("T", " "),
    });

    setModalOpen(true);
  };

  // ============================================================
  // BÚSQUEDA DE PEDIDOS
  // ============================================================
  const buscarEnHistorico = async (pedidoBuscado) => {
    if (!pedidoBuscado || pedidoBuscado.trim().length === 0) {
      setReenviosHistoricos([]);
      setMostrarHistoricos(false);
      return;
    }

    try {
      // Buscar en histórico por pedido
      const historicos = await authFetch(`${serverUrl}/reenvios/historico/buscar?pedido=${encodeURIComponent(pedidoBuscado.trim())}`);
      if (historicos && Array.isArray(historicos)) {
        setReenviosHistoricos(historicos);
        // Mostrar histórico siempre que haya una búsqueda activa, incluso si no hay resultados
        setMostrarHistoricos(true);
      } else {
        setReenviosHistoricos([]);
        setMostrarHistoricos(true); // Mostrar sección incluso si está vacía
      }
    } catch (err) {
      console.error("Error buscando en histórico:", err);
      setReenviosHistoricos([]);
      setMostrarHistoricos(true); // Mostrar sección incluso si hay error
    }
  };

  // Filtrar reenvíos actuales por pedido (se calcula en el render)



  // ============================================================
  // SUBIR FOTOS (previews en wizard)
  // ============================================================
  const onPickFotos = async (e) => {
    const files = Array.from(e.target.files || []);
    const mezclado = [...fotos, ...files].slice(0, 5); // máx 5 fotos
    setFotos(mezclado);

    const newPrev = await generarPreviews(mezclado);
    previews.forEach(revocarPreview);
    setPreviews(newPrev);
    
    // Limpiar el input para permitir seleccionar el mismo archivo otra vez
    if (e.target) {
      e.target.value = '';
    }
  };

  // Abrir modal de cámara
  const abrirModalCamara = async () => {
    try {
      // Verificar si getUserMedia está disponible
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        // Si no está disponible, usar directamente el método fallback
        if (cameraInputRef.current) {
          cameraInputRef.current.click();
        }
        return;
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      setCamStream(stream);
      setCamModalOpen(true);
    } catch (err) {
      console.error("Error accediendo a la cámara:", err);
      
      // Usar directamente el método fallback sin mostrar error si es un problema de permisos
      // Solo mostrar error si es algo más grave
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        pushToast?.("❌ Permiso de cámara denegado. Usando método alternativo.", "warn");
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        pushToast?.("❌ No se encontró cámara. Usando método alternativo.", "warn");
      } else {
        pushToast?.("❌ Error con cámara. Usando método alternativo.", "warn");
      }
      
      // Fallback al método anterior (input file con capture)
      setTimeout(() => {
        if (cameraInputRef.current) {
          cameraInputRef.current.click();
        }
      }, 300);
    }
  };

  // Cerrar modal de cámara
  const cerrarModalCamara = () => {
    if (camStream) {
      camStream.getTracks().forEach(track => track.stop());
      setCamStream(null);
    }
    setCamModalOpen(false);
  };

  // Capturar foto desde el video
  const capturarFoto = async () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Verificar que el video esté listo
      if (video.readyState < 2) {
        pushToast?.("⏳ Espera a que la cámara esté lista", "warn");
        return;
      }
      
      const ctx = canvas.getContext('2d');
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      
      canvas.toBlob(async (blob) => {
        if (blob) {
          const file = new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' });
          const mezclado = [...fotos, file].slice(0, 5); // máx 5 fotos
          setFotos(mezclado);
          
          const newPrev = await generarPreviews(mezclado);
          previews.forEach(revocarPreview);
          setPreviews(newPrev);
          
          pushToast?.(`✅ Foto capturada (${mezclado.length}/5)`, "ok");
        } else {
          pushToast?.("❌ Error al capturar la foto", "err");
        }
      }, 'image/jpeg', 0.9);
    } else {
      pushToast?.("❌ La cámara no está lista", "err");
    }
  };

  // Inicializar video cuando se abre el modal
  useEffect(() => {
    if (camModalOpen && camStream && videoRef.current) {
      const video = videoRef.current;
      video.srcObject = camStream;
      
      // Asegurarse de que el video se reproduzca
      video.onloadedmetadata = () => {
        video.play().catch(err => {
          console.error("Error reproduciendo video:", err);
        });
      };
    }
    
    return () => {
      // No detener el stream aquí, solo cuando se cierra el modal
    };
  }, [camModalOpen, camStream]);

  // Abrir galería para seleccionar fotos
  const abrirGaleria = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const borrarPreview = (i) => {
    const nf = fotos.slice();
    const np = previews.slice();
    revocarPreview(np[i]);
    nf.splice(i, 1);
    np.splice(i, 1);
    setFotos(nf);
    setPreviews(np);
  };

  // ============================================================
  // GENERAR TOKEN MÓVIL Y MOSTRAR QR
  // ============================================================
  const generarTokenMovil = async (reenvioId, pedidoNombre) => {
    try {
      setQrLoading(true);
      const response = await authFetch(`${serverUrl}/reenvios/${reenvioId}/mobile-token`, {
        method: "POST",
      });

      if (response.ok && response.mobileUrl) {
        setQrUrl(response.mobileUrl);
        setQrPedido(pedidoNombre || response.pedido || "");
        setQrExpiraEn(response.expiraEn || null);
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

  const qrExpiraTs = useMemo(() => {
    if (!qrExpiraEn) return null;
    const ts = Date.parse(qrExpiraEn.replace(" ", "T"));
    return Number.isFinite(ts) ? ts : null;
  }, [qrExpiraEn]);

  const qrVigente = qrUrl && qrExpiraTs && Date.now() < qrExpiraTs;

  useEffect(() => {
    if (!qrExpiraTs) return;
    const ms = qrExpiraTs - Date.now();
    if (ms <= 0) return;
    const timer = setTimeout(() => {
      setQrExpiraEn(null);
      setQrUrl("");
      setQrPedido("");
    }, ms);
    return () => clearTimeout(timer);
  }, [qrExpiraTs]);

  // ============================================================
  // MODAL VIEWER DE FOTOS (DETALLE)
  // ============================================================
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
    setViewerIndex((idx) =>
      idx === viewerFotos.length - 1 ? 0 : idx + 1
    );
  };

  // ============================================================
  // CARGAR FOTOS DEL DETALLE DESDE EL SERVER
  // ============================================================
  const cargarFotosDetalle = async (item) => {
    try {
      // Si es un reenvío histórico (no tiene id o tiene fechaCorte), buscar fotos históricas
      if (item.esHistorico || item.fechaCorte || !item.id) {
        const pedido = item.pedido;
        if (!pedido) return [];
        
        const j = await authFetch(`${serverUrl}/reenvios/historico/fotos/${encodeURIComponent(pedido)}`);
        const fotosData = j.urls || [];
        return fotosData.map(f => typeof f === 'string' ? f : f.url);
      } else {
        // Reenvío normal
        const j = await authFetch(`${serverUrl}/reenvios/${item.id}/fotos`);
        const fotosData = j.urls || [];
        // Si las fotos vienen con estructura {url, id, archivo}, devolver solo las URLs para compatibilidad
        // Pero también devolver los datos completos si están disponibles
        return fotosData.map(f => typeof f === 'string' ? f : f.url);
      }
    } catch (error) {
      console.error("Error cargando fotos:", error);
      return [];
    }
  };

  const cargarFotosDetalleCompleto = async (item) => {
    try {
      // Si es un reenvío histórico (no tiene id o tiene fechaCorte), buscar fotos históricas
      if (item.esHistorico || item.fechaCorte || !item.id) {
        const pedido = item.pedido;
        if (!pedido) return [];
        
        const j = await authFetch(`${serverUrl}/reenvios/historico/fotos/${encodeURIComponent(pedido)}`);
        const fotosData = j.urls || [];
        return fotosData.map(f => typeof f === 'string' ? { url: f, id: null, archivo: null, esHistorico: true } : f);
      } else {
        // Reenvío normal
        const j = await authFetch(`${serverUrl}/reenvios/${item.id}/fotos`);
        const fotosData = j.urls || [];
        // Devolver datos completos con id, url, archivo
        return fotosData.map(f => typeof f === 'string' ? { url: f, id: null, archivo: null } : f);
      }
    } catch (error) {
      console.error("Error cargando fotos:", error);
      return [];
    }
  };

  const borrarFoto = async (reenvioId, fotoId, fotoIndex, esEnModalEdicion = false) => {
    try {
      await authFetch(`${serverUrl}/reenvios/${reenvioId}/fotos/${fotoId}`, {
        method: "DELETE",
      });

      pushToast?.("✅ Foto eliminada", "ok");

      if (esEnModalEdicion) {
        // Actualizar estado del modal de edición
        const nuevasFotos = editFotosData.filter((_, i) => i !== fotoIndex);
        setEditFotosData(nuevasFotos);
        setEditPreviews(nuevasFotos.map(f => f.url));
      } else {
        // Recargar fotos del detalle
        if (detalleItem) {
          const fotosActualizadas = await cargarFotosDetalleCompleto(detalleItem);
          setDetalleItem({ ...detalleItem, fotos: fotosActualizadas.map(f => f.url), fotosData: fotosActualizadas });
        }
      }

      // Actualizar estado local SIN recargar
      if (detalleItem && detalleItem.id === reenvioId) {
        // Si estamos viendo el detalle, actualizar las fotos ahí
        const fotosActualizadas = await cargarFotosDetalleCompleto(detalleItem);
        setDetalleItem({ ...detalleItem, fotos: fotosActualizadas.map(f => f.url), fotosData: fotosActualizadas });
      }
      
      // Actualizar en la lista principal
      setReenvios((prevReenvios) =>
        prevReenvios.map((r) => {
          if (r.id === reenvioId) {
            // Actualizar el contador de evidencias
            const nuevoCount = Math.max(0, (r.evidencia_count || 0) - 1);
            return { ...r, evidencia_count: nuevoCount };
          }
          return r;
        })
      );
    } catch (error) {
      console.error("Error borrando foto:", error);
      pushToast?.("❌ Error al borrar foto", "err");
    }
  };

  // ============================================================
  // ACCIONES RÁPIDAS (estatus, detener, editar, eliminar)
  // ============================================================
  // ============================================================
  // CARGAR HISTORIAL DE ESTADOS
  // ============================================================
  const cargarHistorial = async (reenvioId) => {
    if (!reenvioId) return;
    try {
      setCargandoHistorial(true);
      const historial = await authFetch(`${serverUrl}/reenvios/${reenvioId}/historial`);
      setHistorialEstados(Array.isArray(historial) ? historial : []);
    } catch (error) {
      console.error("Error cargando historial:", error);
      setHistorialEstados([]);
    } finally {
      setCargandoHistorial(false);
    }
  };

  // ============================================================
  // OBTENER ENLACE DE RASTREO
  // ============================================================
  const obtenerEnlaceRastreo = async (reenvioId, esHistorico = false) => {
    if (!reenvioId) return;
    try {
      const endpoint = esHistorico 
        ? `${serverUrl}/reenvios/historico/${reenvioId}/rastreo`
        : `${serverUrl}/reenvios/${reenvioId}/rastreo`;
      const data = await authFetch(endpoint);
      setEnlaceRastreo(data);
    } catch (error) {
      console.error("Error obteniendo enlace de rastreo:", error);
      setEnlaceRastreo(null);
    }
  };

  // ============================================================
  // ACTUALIZAR ESTADO CON OBSERVACIÓN
  // ============================================================
  const actualizarEstadoConObservacion = async () => {
    if (!detalleItem?.id || !nuevoEstado) {
      pushToast?.("⚠️ Selecciona un estado", "warn");
      return;
    }

    try {
      await authFetch(`${serverUrl}/reenvios/${detalleItem.id}/estado`, {
        method: "PUT",
        body: JSON.stringify({
          estado: nuevoEstado,
          observacion: observacionEstado || null,
        }),
      });

      // Actualizar estado local SIN recargar
      setReenvios((prevReenvios) =>
        prevReenvios.map((r) =>
          r.id === detalleItem.id ? { ...r, estatus: nuevoEstado } : r
        )
      );
      
      // Actualizar detalleItem localmente
      setDetalleItem({ ...detalleItem, estatus: nuevoEstado });
      
      // Recargar solo el historial (no toda la lista)
      await cargarHistorial(detalleItem.id);

      pushToast?.("✅ Estado actualizado", "ok");
      setModalActualizarEstado(false);
      setNuevoEstado("");
      setObservacionEstado("");
    } catch (error) {
      console.error("Error actualizando estado:", error);
      pushToast?.("❌ Error actualizando estado", "err");
    }
  };

  // Cargar historial y enlace cuando se abre el detalle
  useEffect(() => {
    if (detalleOpen && detalleItem?.id) {
      const esHistorico = detalleItem.esHistorico || detalleItem.fechaCorte;
      if (!esHistorico) {
        cargarHistorial(detalleItem.id);
      }
      obtenerEnlaceRastreo(detalleItem.id, esHistorico);
    } else {
      setHistorialEstados([]);
      setEnlaceRastreo(null);
      setMostrarHistorial(false);
      setInfoRastreo(null); // Limpiar información de rastreo al cerrar
    }
  }, [detalleOpen, detalleItem?.id]);

  // ============================================================
  // VERIFICAR ESTADO DESDE PAQUETERÍA
  // ============================================================
  const verificarEstadoPaqueteria = async () => {
    if (!detalleItem?.id || !detalleItem.paqueteria || !detalleItem.guia) {
      pushToast?.("⚠️ Faltan datos de paquetería o guía", "warn");
      return;
    }

    const esHistorico = detalleItem.esHistorico || detalleItem.fechaCorte;
    
    try {
      setVerificandoEstado(true);
      const endpoint = esHistorico
        ? `${serverUrl}/reenvios/historico/${detalleItem.id}/verificar-estado`
        : `${serverUrl}/reenvios/${detalleItem.id}/verificar-estado`;
      const resultado = await authFetch(endpoint, {
        method: "POST",
      });
      
      // Guardar información de rastreo para mostrar
      if (resultado.ok && resultado.resultado) {
        setInfoRastreo(resultado.resultado);
      }
      
      if (resultado.ok && resultado.actualizado) {
        pushToast?.(
          `✅ Estado actualizado: ${resultado.estadoAnterior} → ${resultado.estadoNuevo}`,
          "ok"
        );
        
        // Actualizar estado local SIN recargar toda la lista
        if (!esHistorico) {
          // Obtener solo el reenvío actualizado
          const reenvioActualizado = await authFetch(`${serverUrl}/reenvios/${detalleItem.id}`);
          
          // Actualizar en la lista
          setReenvios((prevReenvios) =>
            prevReenvios.map((r) =>
              r.id === detalleItem.id ? reenvioActualizado : r
            )
          );
          
          // Actualizar detalleItem
          setDetalleItem({ ...detalleItem, ...reenvioActualizado });
          
          // Recargar solo el historial
          await cargarHistorial(detalleItem.id);
        } else {
          // Para históricos, recargar el reenvío específico
          const reenvioActualizado = await authFetch(`${serverUrl}/reenvios/historico/${detalleItem.id}`);
          if (reenvioActualizado) {
            setDetalleItem({ ...detalleItem, ...reenvioActualizado });
          }
        }
      } else if (resultado.ok && !resultado.actualizado) {
        pushToast?.(
          `ℹ️ Estado sin cambios: ${resultado.estadoNuevo}${resultado.resultado?.estadoOriginal ? ` (${resultado.resultado.estadoOriginal})` : ''}`,
          "info"
        );
      } else {
        pushToast?.(
          resultado.mensaje || "⚠️ No se pudo obtener información del rastreo",
          "warn"
        );
      }
    } catch (error) {
      console.error("Error verificando estado:", error);
      pushToast?.("❌ Error verificando estado del paquete", "err");
    } finally {
      setVerificandoEstado(false);
    }
  };

  const cambiarEstatus = async (item, estatus, cerrarModal = false) => {
    // Actualizar estado local inmediatamente para respuesta instantánea
    if (estatus === "Enviado") {
        setReenvios((prevReenvios) => {
          const reenvioActualizado = prevReenvios.find((r) => r.id === item.id);
          if (!reenvioActualizado) return prevReenvios;
          
          // Actualizar el estatus del reenvío
          const reenvioConEstatus = { ...reenvioActualizado, estatus: "Enviado" };
          
          // Separar los reenvíos: los que no son el actualizado
          const otrosReenvios = prevReenvios.filter((r) => r.id !== item.id);
          
          // Ordenar: primero los no enviados (ordenados por ID DESC), luego los enviados (ordenados por ID DESC)
          const noEnviados = otrosReenvios.filter((r) => (r.estatus || "").toUpperCase() !== "ENVIADO");
          const enviados = otrosReenvios.filter((r) => (r.estatus || "").toUpperCase() === "ENVIADO");
          
          // Ordenar cada grupo por ID DESC
          noEnviados.sort((a, b) => (b.id || 0) - (a.id || 0));
          enviados.sort((a, b) => (b.id || 0) - (a.id || 0));
          
          // Mover el reenvío actualizado al final de los enviados
          return [...noEnviados, ...enviados, reenvioConEstatus];
        });
      } else if (estatus === "Listo para enviar" && item.estatus === "Enviado") {
        // Si se cambia de "Enviado" a "Listo para enviar", moverlo de vuelta al principio
        setReenvios((prevReenvios) => {
          const reenvioActualizado = prevReenvios.find((r) => r.id === item.id);
          if (!reenvioActualizado) return prevReenvios;
          
          // Actualizar el estatus del reenvío
          const reenvioConEstatus = { ...reenvioActualizado, estatus: "Listo para enviar" };
          
          // Separar los reenvíos: los que no son el actualizado
          const otrosReenvios = prevReenvios.filter((r) => r.id !== item.id);
          
          // Ordenar: primero los no enviados (ordenados por ID DESC), luego los enviados (ordenados por ID DESC)
          const noEnviados = otrosReenvios.filter((r) => (r.estatus || "").toUpperCase() !== "ENVIADO");
          const enviados = otrosReenvios.filter((r) => (r.estatus || "").toUpperCase() === "ENVIADO");
          
          // Ordenar cada grupo por ID DESC
          noEnviados.sort((a, b) => (b.id || 0) - (a.id || 0));
          enviados.sort((a, b) => (b.id || 0) - (a.id || 0));
          
          // Mover el reenvío actualizado al principio de los no enviados (manteniendo orden por ID)
          return [reenvioConEstatus, ...noEnviados, ...enviados];
        });
      } else {
        // Para otros estatus, actualizar localmente y mantener el orden
        setReenvios((prevReenvios) => {
          const actualizados = prevReenvios.map((r) =>
            r.id === item.id ? { ...r, estatus } : r
          );
          
          // Reordenar después de actualizar
          return actualizados.sort((a, b) => {
            const aEnviado = (a.estatus || "").toUpperCase() === "ENVIADO";
            const bEnviado = (b.estatus || "").toUpperCase() === "ENVIADO";
            
            if (aEnviado === bEnviado) {
              return (b.id || 0) - (a.id || 0);
            }
            
            return aEnviado ? 1 : -1;
          });
        });
      }
      
    // Feedback inmediato
    pushToast?.("✅ Estatus actualizado", "ok");
    if (cerrarModal) {
      setDetalleOpen(false);
    }
    
    // Llamada al servidor en segundo plano sin bloquear
    authFetch(`${serverUrl}/reenvios/${item.id}/estatus`, {
      method: "PUT",
      body: JSON.stringify({ estatus }),
    }).catch((e) => {
      console.error("cambiarEstatus", e);
      pushToast?.("❌ Error actualizando estatus", "err");
      // Revertir cambio local si falla
      setReenvios((prevReenvios) => {
        return prevReenvios.map((r) =>
          r.id === item.id ? { ...r, estatus: item.estatus } : r
        );
      });
    });
  };

  const detener = async (item) => {
    const motivoDet = window.prompt("Motivo de detención:") || "";
    if (!motivoDet.trim()) return;

    try {
      await authFetch(`${serverUrl}/reenvios/${item.id}/detener`, {
        method: "POST",
        body: JSON.stringify({ motivo: motivoDet }),
      });
      // Actualizar estado local SIN recargar
      setReenvios((prevReenvios) =>
        prevReenvios.map((r) =>
          r.id === item.id ? { ...r, estatus: "Detenido" } : r
        )
      );
      pushToast?.("✅ Reenvío detenido", "ok");
    } catch (e) {
      console.error("detener", e);
      pushToast?.("❌ Error deteniendo reenvío", "err");
    }
  };

  const editarEnvio = async (item) => {
    setEditItem(item);
    setEditPedido(item.pedido || "");
    setEditGuia(item.guia || "");
    setEditPaq(item.paqueteria || "");
    
    // Notificar inicio de proceso de edición
    if (item.pedido) {
      notificarInicioProceso(item.pedido, "editar");
    }
    
    // Cargar fotos existentes con datos completos
    try {
      const fotosData = await cargarFotosDetalleCompleto(item);
      setEditFotosData(fotosData || []);
      setEditPreviews(fotosData.map(f => f.url) || []);
      setEditFotos([]); // Las fotos existentes no se pueden editar, solo agregar nuevas
    } catch (err) {
      console.error("Error cargando fotos:", err);
      setEditFotosData([]);
      setEditPreviews([]);
      setEditFotos([]);
    }
    
    // Cerrar modal de detalle
    setDetalleOpen(false);
    
    setEditOpen(true);
  };

  const guardarEdicion = async () => {
    try {
      // Actualizar datos del reenvío
      await authFetch(`${serverUrl}/reenvios/${editItem.id}/envio`, {
        method: "PUT",
        body: JSON.stringify({
          pedido: editPedido,
          guia: editGuia,
          paqueteria: editPaq,
        }),
      });

      // Subir nuevas fotos si hay
      if (editFotos.length > 0) {
        const fd = new FormData();
        editFotos.forEach((f) => fd.append("fotos", f, f.name));
        await authFetch(`${serverUrl}/reenvios/${editItem.id}/fotos`, {
          method: "POST",
          body: fd,
        });
      }

      // Actualizar estado local SIN recargar
      setReenvios((prevReenvios) =>
        prevReenvios.map((r) =>
          r.id === editItem.id
            ? {
                ...r,
                pedido: editPedido,
                guia: editGuia,
                paqueteria: editPaq,
              }
            : r
        )
      );

      pushToast?.("✅ Reenvío actualizado", "ok");
      
      // Notificar fin del proceso y limpiar progreso
      if (editPedido) {
        notificarFinProceso(editPedido);
        limpiarProgresoLocal(editPedido.trim());
      }
      
      setEditOpen(false);
      // Limpiar fotos
      editFotos.forEach((f) => {
        const preview = editPreviews.find((p, i) => i === editFotos.indexOf(f));
        if (preview && preview.startsWith('blob:')) {
          URL.revokeObjectURL(preview);
        }
      });
      setEditFotos([]);
      setEditPreviews([]);
    } catch (e) {
      pushToast?.("❌ Error actualizando envío", "err");
      // Notificar fin del proceso aunque haya error y limpiar progreso
      if (editPedido) {
        notificarFinProceso(editPedido);
        limpiarProgresoLocal(editPedido.trim());
      }
    }
  };

  const onPickEditFotos = async (e) => {
    const files = Array.from(e.target.files || []);
    const mezclado = [...editFotos, ...files].slice(0, 5); // máx 5 fotos nuevas
    setEditFotos(mezclado);
    
    // Crear previews solo para las nuevas fotos
    const newPrev = mezclado.map((f) => URL.createObjectURL(f));
    const allPreviews = [...editPreviews, ...newPrev];
    setEditPreviews(allPreviews);
    
    // Limpiar el input
    if (e.target) {
      e.target.value = '';
    }
  };

  const borrarEditPreview = (i) => {
    // Si es una foto nueva (después de las existentes)
    const existingCount = editPreviews.length - editFotos.length;
    if (i >= existingCount) {
      const nf = editFotos.slice();
      const np = editPreviews.slice();
      const fotoIndex = i - existingCount;
      
      // Revocar URL del preview
      if (np[i] && np[i].startsWith('blob:')) {
        URL.revokeObjectURL(np[i]);
      }
      
      nf.splice(fotoIndex, 1);
      np.splice(i, 1);
      setEditFotos(nf);
      setEditPreviews(np);
    }
    // No permitir borrar fotos existentes desde aquí
  };

  const eliminarOCancelar = async (item) => {
    const confirmado = await showConfirm("¿Eliminar/Cancelar este reenvío?", "Confirmar eliminación");
    if (!confirmado) return;
    try {
      const j = await authFetch(`${serverUrl}/reenvios/${item.id}`, {
        method: "DELETE",
      }).catch(() => ({}));
      // Actualizar estado local SIN recargar
      setReenvios((prevReenvios) => prevReenvios.filter((r) => r.id !== item.id));
      pushToast?.(j.msg || "Reenvío eliminado", "ok");
    } catch (e) {
      console.error("eliminarOCancelar", e);
      pushToast?.("❌ Error eliminando/cancelando reenvío", "err");
    }
  };

  // ============================================================
  // FINALIZAR WIZARD (CREAR / LIBERAR + FOTOS) - OPTIMIZADO
  // ============================================================
  const finalizar = async () => {
    // Cancelar guardado automático si se llama manualmente
    if (timeoutGuardadoAuto.current) {
      clearTimeout(timeoutGuardadoAuto.current);
      timeoutGuardadoAuto.current = null;
    }
    try {
      let targetReenvioId = null;

      if (modoLiberacion && libSourceId) {
        const jLib = await authFetch(
          `${serverUrl}/reenvios/${libSourceId}/liberar`,
          {
            method: "POST",
            body: JSON.stringify({
              nuevoPedido: pedido || undefined,
              paqueteria: paqueteria || undefined,
              guia: guia || undefined,
              comentario: motivo || undefined,
            }),
          }
        );
        
        if (!jLib.ok) {
          throw new Error(jLib.error || "Error liberando reenvío");
        }

        if (jLib.type === "nuevo" && jLib.newId) {
          targetReenvioId = jLib.newId;
        } else {
          targetReenvioId = libSourceId;
        }

        // Hacer comentario y fotos en paralelo si es posible
        const promesas = [];
        
        if (motivo.trim() && targetReenvioId) {
          promesas.push(
            authFetch(
              `${serverUrl}/reenvios/${targetReenvioId}/comentario`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ texto: motivo.trim() }),
              }
            )
          );
        }

        if (targetReenvioId && fotos.length > 0) {
          const fd = new FormData();
          fotos.forEach((f) => fd.append("fotos", f, f.name));
          promesas.push(
            authFetch(
              `${serverUrl}/reenvios/${targetReenvioId}/fotos`,
              {
                method: "POST",
                body: fd,
              }
            )
          );
        }

        // Ejecutar en paralelo
        if (promesas.length > 0) {
          await Promise.all(promesas);
        }
      } else {
        // Si hay un reenvío temporal (creado solo para el token móvil), actualizarlo
        if (reenvioTemporalId) {
          // Actualizar el reenvío temporal con todos los datos
          await authFetch(`${serverUrl}/reenvios/${reenvioTemporalId}/envio`, {
            method: "PUT",
            body: JSON.stringify({
              pedido,
              paqueteria: paqueteria || null,
              guia: guia || null,
            }),
          });
          
          // Actualizar observaciones
          if (motivo.trim()) {
            await authFetch(
              `${serverUrl}/reenvios/${reenvioTemporalId}/comentario`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ texto: motivo.trim().replace("[En proceso - Fotos desde móvil]", "").trim() }),
              }
            );
          }
          
          targetReenvioId = reenvioTemporalId;
          setReenvioTemporalId(null); // Limpiar el ID temporal
        } else {
          // Crear nuevo reenvío normalmente
          const j = await authFetch(`${serverUrl}/reenvios`, {
            method: "POST",
            body: JSON.stringify({
              pedido,
              paqueteria: paqueteria || null,
              guia: guia || null,
              observaciones: motivo || "",
            }),
          });
          
          if (!j.ok) throw new Error(j.error || "Error creando reenvío");
          targetReenvioId = j.id;
        }

        // Subir fotos de forma asíncrona (no bloquear)
        if (targetReenvioId && fotos.length > 0) {
          const fd = new FormData();
          fotos.forEach((f) => fd.append("fotos", f, f.name));

          // No esperar la respuesta de fotos para mostrar el toast más rápido
          authFetch(
            `${serverUrl}/reenvios/${targetReenvioId}/fotos`,
            {
              method: "POST",
              body: fd,
            }
          ).catch(() => {}); // Silenciar errores de fotos
        }
      }

      // Actualizar estado local SIN recargar
      if (targetReenvioId) {
        // Obtener el reenvío actualizado del servidor solo para este item
        try {
          const reenvioActualizado = await authFetch(`${serverUrl}/reenvios/${targetReenvioId}`);
          setReenvios((prevReenvios) => {
            // Si ya existe, actualizarlo; si no, agregarlo al principio
            const existe = prevReenvios.find((r) => r.id === targetReenvioId);
            if (existe) {
              return prevReenvios.map((r) =>
                r.id === targetReenvioId ? reenvioActualizado : r
              );
            } else {
              // Agregar al principio y mantener orden (no enviados primero)
              const noEnviados = prevReenvios.filter(
                (r) => (r.estatus || "").toUpperCase() !== "ENVIADO"
              );
              const enviados = prevReenvios.filter(
                (r) => (r.estatus || "").toUpperCase() === "ENVIADO"
              );
              return [reenvioActualizado, ...noEnviados, ...enviados];
            }
          });
        } catch (err) {
          console.error("Error obteniendo reenvío actualizado:", err);
          // Si falla, solo mostrar toast pero no recargar
        }
      }

      // Cerrar modal inmediatamente para respuesta instantánea
      setModalOpen(false);
      
      // Feedback inmediato
      pushToast?.("✅ Reenvío guardado", "ok");
      
      // Notificar fin del proceso y limpiar progreso guardado
      if (pedido) {
        notificarFinProceso(pedido);
        limpiarProgresoLocal(pedido.trim());
      }
      
      // Limpiar formulario inmediatamente
      setPedido("");
      setGuia("");
      setPaqueteria("");
      setMotivo("");
      setFotos([]);
      setPreviews([]);
      setStep(1);
      setModoLiberacion(false);
      setLibSourceId(null);
    } catch (e) {
      console.error("finalizar", e);
      pushToast?.("❌ " + e.message, "err");
      // Notificar fin del proceso aunque haya error y limpiar progreso
      if (pedido) {
        notificarFinProceso(pedido);
        limpiarProgresoLocal(pedido.trim());
      }
    }
  };

  // Actualizar el ref de finalizar cuando cambie
  useEffect(() => {
    finalizarRef.current = finalizar;
  }, [pedido, guia, paqueteria, motivo, fotos, modoLiberacion, libSourceId, reenvioTemporalId]);

  // ============================================================
  // CIERRE DE DÍA (MODAL + LLAMADA API)
  // ============================================================
  const confirmarCierre = async () => {
    try {
      setCerrarLoading(true);
      setCerrarResumen(null);

      // 🚨 Primera petición: verificar si hay reenvíos pendientes
      const checkResponse = await authFetch(`${serverUrl}/reenvios/cerrar-reenvios`, {
        method: "POST",
        body: JSON.stringify({
          fecha: fecha || undefined,
        }),
      });

      // Si hay reenvíos pendientes, preguntar qué hacer
      if (checkResponse.requireConfirmation) {
        const decision = await showAlert(
          checkResponse.message,
          "warning",
          {
            showCancel: true,
            confirmText: "Eliminar",
            cancelText: "Dejar para mañana",
            title: "Reenvíos pendientes"
          }
        );

        // Segunda petición con la decisión
        const data = await authFetch(`${serverUrl}/reenvios/cerrar-reenvios`, {
          method: "POST",
          body: JSON.stringify({
            fecha: fecha || undefined,
            confirmarEliminacion: true,
            dejarPendientes: !decision // true = dejar, false = eliminar
          }),
        });

        setCerrarResumen({
          cantidad: data.cantidad ?? 0,
          fechaCierre: data.fechaCierre,
        });
      } else {
        // No hay pendientes, solo mostrar el resumen
        setCerrarResumen({
          cantidad: checkResponse.cantidad ?? 0,
          fechaCierre: checkResponse.fechaCierre,
        });
      }

      pushToast?.(
        `✔ Cierre realizado (${checkResponse.cantidad || 0} movidos al histórico)`,
        "ok"
      );

      await cargar();
    } catch (e) {
      console.error("cerrar día", e);
      pushToast?.("❌ Error cerrando reenvíos", "err");
    } finally {
      setCerrarLoading(false);
    }
  };

  // ============================================================
  // CONTAR REENVÍOS POR PAQUETERÍA
  // ============================================================
  const contarPorPaqueteria = () => {
    const contadores = {
      DHL: { total: 0, listoParaEnviar: 0 },
      ESTAFETA: { total: 0, listoParaEnviar: 0 },
      FEDEX: { total: 0, listoParaEnviar: 0 },
      TOTAL: { total: reenvios.length, listoParaEnviar: 0 },
    };

    reenvios.forEach((r) => {
      const paq = (r.paqueteria || "").toUpperCase().trim();
      const estatus = (r.estatus || "").toUpperCase().trim();
      // Detectar "listo para enviar" de diferentes formas
      const esListoParaEnviar = 
        (estatus.includes("LISTO") && estatus.includes("ENVIAR")) ||
        estatus === "LISTO PARA ENVIAR" ||
        estatus === "LISTO-para-ENVIAR";
      
      if (paq.includes("DHL")) {
        contadores.DHL.total++;
        if (esListoParaEnviar) {
          contadores.DHL.listoParaEnviar++;
        }
      } else if (paq.includes("ESTAFETA")) {
        contadores.ESTAFETA.total++;
        if (esListoParaEnviar) {
          contadores.ESTAFETA.listoParaEnviar++;
        }
      } else if (paq.includes("FEDEX") || paq.includes("FED EX")) {
        contadores.FEDEX.total++;
        if (esListoParaEnviar) {
          contadores.FEDEX.listoParaEnviar++;
        }
      }
      
      // Contar total de listo para enviar
      if (esListoParaEnviar) {
        contadores.TOTAL.listoParaEnviar++;
      }
    });

    return contadores;
  };

  const contadores = contarPorPaqueteria();

  // ============================================================
  // FILTRAR REENVÍOS POR PAQUETERÍA
  // ============================================================
  const filtrarReenvios = (reenviosList) => {
    if (filtroPaqueteria === "TOTAL") {
      return reenviosList;
    }

    return reenviosList.filter((r) => {
      const paq = (r.paqueteria || "").toUpperCase().trim();
      if (filtroPaqueteria === "DHL") {
        return paq.includes("DHL");
      } else if (filtroPaqueteria === "ESTAFETA") {
        return paq.includes("ESTAFETA");
      } else if (filtroPaqueteria === "FEDEX") {
        return paq.includes("FEDEX") || paq.includes("FED EX");
      }
      return true;
    });
  };

  // ============================================================
  // MANEJAR CLICK EN CONTADOR (FILTRO)
  // ============================================================
  const handleFiltroClick = (paqueteria) => {
    setFiltroPaqueteria(paqueteria);
  };

  // ===========================================================
  // RENDER
  // ===========================================================
  return (
    <div className="card reenvios-card">
      <div className="reenvios-header">
        <h2>Reenvíos</h2>

        <div className="reenvios-buscador-container">
          <input
            type="text"
            placeholder="🔍 Buscar pedido..."
            value={busquedaPedido}
            onChange={(e) => {
              const valor = e.target.value;
              setBusquedaPedido(valor);
              // Buscar en histórico cuando el usuario escribe
              buscarEnHistorico(valor);
            }}
            className="reenvios-buscador-input"
          />
        </div>

        {/* Indicador de reenvíos en proceso */}
        {reenviosEnProceso.length > 0 && (
          <div className="reenvios-en-proceso-indicador">
            {reenviosEnProceso.map((proceso, idx) => (
              <div 
                key={idx} 
                className="proceso-item"
                onClick={() => regresarAProceso(proceso.pedido)}
                title="Click para regresar al reenvío en proceso"
              >
                <span className="proceso-icon">📦</span>
                <span className="proceso-texto">
                  {proceso.accion === "crear" ? "Creando" : "Editando"} reenvío: 
                  <strong> {proceso.pedido}</strong>
                  {proceso.usuario && ` (${proceso.usuario})`}
                </span>
                <span className="proceso-loading">
                  <span className="dot">.</span>
                  <span className="dot">.</span>
                  <span className="dot">.</span>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="reenvios-header-actions">
          <button className="btn-primary btn-agregar-reenvio" onClick={abrirNuevo}>
            + Agregar reenvío
          </button>
          {/* Botón para abrir modal de cierre de día */}
          <button
            className="btn btn-cerrar-dia"
            onClick={() => {
              setCerrarResumen(null);
              setCerrarModalOpen(true);
            }}
          >
            Cerrar día
          </button>
        </div>
      </div>

      {/* Contador de reenvíos por paquetería */}
      <div className="reenvios-contador">
        <div 
          className={`contador-item dhl ${filtroPaqueteria === "DHL" ? "activo" : ""}`}
          onClick={() => handleFiltroClick("DHL")}
          style={{ cursor: "pointer" }}
        >
          <span className="contador-label">DHL:</span>
          <span className="contador-valor">
            {contadores.DHL.total} / {contadores.DHL.listoParaEnviar}
          </span>
        </div>
        <div 
          className={`contador-item estafeta ${filtroPaqueteria === "ESTAFETA" ? "activo" : ""}`}
          onClick={() => handleFiltroClick("ESTAFETA")}
          style={{ cursor: "pointer" }}
        >
          <span className="contador-label">ESTAFETA:</span>
          <span className="contador-valor">
            {contadores.ESTAFETA.total} / {contadores.ESTAFETA.listoParaEnviar}
          </span>
        </div>
        <div 
          className={`contador-item fedex ${filtroPaqueteria === "FEDEX" ? "activo" : ""}`}
          onClick={() => handleFiltroClick("FEDEX")}
          style={{ cursor: "pointer" }}
        >
          <span className="contador-label">FEDEX:</span>
          <span className="contador-valor">
            {contadores.FEDEX.total} / {contadores.FEDEX.listoParaEnviar}
          </span>
        </div>
        <div 
          className={`contador-item contador-total ${filtroPaqueteria === "TOTAL" ? "activo" : ""}`}
          onClick={() => handleFiltroClick("TOTAL")}
          style={{ cursor: "pointer" }}
        >
          <span className="contador-label">TOTAL:</span>
          <span className="contador-valor">
            {contadores.TOTAL.total} / {contadores.TOTAL.listoParaEnviar}
          </span>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 8, opacity: 0.7 }}>Cargando…</div>
      ) : (
        <>
          {/* Mostrar resultados de búsqueda en histórico */}
          {busquedaPedido.trim() && mostrarHistoricos && (
            <div style={{ marginBottom: "20px", padding: "12px", backgroundColor: "var(--fondo-card)", borderRadius: "8px", border: "2px solid #fbbf24" }}>
              <h3 style={{ margin: "0 0 10px 0", fontSize: "1rem", color: "#92400e", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px" }}>
                📜 Reenvíos Históricos (Días Pasados)
                {reenviosHistoricos.length > 0 && (
                  <span style={{ fontSize: "0.85rem", color: "var(--texto-secundario)", fontWeight: "normal" }}>
                    ({reenviosHistoricos.length} encontrado{reenviosHistoricos.length !== 1 ? 's' : ''})
                  </span>
                )}
              </h3>
              {reenviosHistoricos.length > 0 ? (
                <div className="reenvios-grid">
                  {reenviosHistoricos.map((r) => {
                    const paqClass = (r.paqueteria || "").toUpperCase();
                    const paquetClass = 
                      paqClass.includes("ESTAFETA") ? "paqueteria-estafeta" :
                      paqClass.includes("DHL") ? "paqueteria-dhl" :
                      paqClass.includes("FEDEX") || paqClass.includes("FED EX") ? "paqueteria-fedex" :
                      "";

                    // Formatear fecha de cierre
                    const fechaCierre = r.fechaCorte || r.fecha || "N/A";
                    const fechaFormateada = fechaCierre !== "N/A" 
                      ? new Date(fechaCierre).toLocaleDateString('es-MX', { 
                          year: 'numeric', 
                          month: 'short', 
                          day: 'numeric' 
                        })
                      : "N/A";

                    return (
                      <div
                        key={`hist-${r.id}`}
                        className={`reenvio-card ${paquetClass}`}
                        style={{ 
                          opacity: 0.85, 
                          border: "2px dashed #f59e0b",
                          backgroundColor: "rgba(251, 191, 36, 0.05)",
                          cursor: "pointer"
                        }}
                        onClick={async () => {
                          setModalOpen(false);
                          // Limpiar fotos anteriores antes de cargar nuevas
                          setDetalleItem(null);
                          setDetalleOpen(false);
                          // Pequeño delay para asegurar que el estado se limpie
                          await new Promise(resolve => setTimeout(resolve, 50));
                          const fotosDetalle = await cargarFotosDetalle({ ...r, esHistorico: true });
                          const fotosDataCompleto = await cargarFotosDetalleCompleto({ ...r, esHistorico: true });
                          setDetalleItem({ ...r, fotos: fotosDetalle, fotosData: fotosDataCompleto, esHistorico: true });
                          setDetalleOpen(true);
                        }}
                      >
                        <div style={{ 
                          position: "absolute", 
                          top: "8px", 
                          right: "8px", 
                          background: "#f59e0b", 
                          color: "white", 
                          padding: "4px 8px", 
                          borderRadius: "4px", 
                          fontSize: "0.7rem", 
                          fontWeight: "bold" 
                        }}>
                          HISTÓRICO
                        </div>
                        <div className="card-row" style={{ marginTop: "25px" }}>
                          <span className="badge-estatus" style={{ background: "#6b7280" }}>
                            {r.estatus || "–"}
                          </span>
                          <span className="fecha" style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                            Cerrado: {fechaFormateada}
                          </span>
                        </div>

                        <div className="pedido" style={{ marginTop: "8px", marginBottom: "8px" }}>
                          {r.pedido || "–"}
                        </div>

                        <div className="info">
                          <div><strong>Paquetería:</strong> {r.paqueteria || "–"}</div>
                          <div><strong>Guía:</strong> {r.guia || "–"}</div>
                          <div><strong>Evidencias:</strong> {r.evidencia_count ?? 0}</div>
                          {r.observaciones && (
                            <div style={{ marginTop: "8px", fontSize: "0.85rem", color: "var(--texto-secundario)" }}>
                              <strong>Observaciones:</strong> {r.observaciones}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: "20px", textAlign: "center", color: "var(--texto-secundario)", fontSize: "0.9rem" }}>
                  No se encontraron reenvíos históricos con el pedido "{busquedaPedido.trim()}"
                </div>
              )}
            </div>
          )}

          <div className="reenvios-grid">
            {(() => {
              // Primero filtrar por paquetería
              const reenviosPorPaqueteria = filtrarReenvios(reenvios);
              
              // Luego filtrar por búsqueda de pedido
              const reenviosFiltrados = busquedaPedido.trim()
                ? reenviosPorPaqueteria.filter((r) => 
                    (r.pedido || "").toUpperCase().includes(busquedaPedido.trim().toUpperCase())
                  )
                : reenviosPorPaqueteria;
              
              if (reenviosFiltrados.length === 0 && (!busquedaPedido.trim() || (busquedaPedido.trim() && reenviosHistoricos.length === 0))) {
                return (
                  <div className="vacio">
                    {busquedaPedido.trim()
                      ? `No se encontraron reenvíos actuales con el pedido "${busquedaPedido.trim()}"`
                      : filtroPaqueteria === "TOTAL" 
                        ? "No hay reenvíos registrados." 
                        : `No hay reenvíos de ${filtroPaqueteria} registrados.`}
                  </div>
                );
              }
              
              return reenviosFiltrados.map((r) => {
                // Determinar clase de paquetería
                const paqClass = (r.paqueteria || "").toUpperCase();
                const paquetClass = 
                  paqClass.includes("ESTAFETA") ? "paqueteria-estafeta" :
                  paqClass.includes("DHL") ? "paqueteria-dhl" :
                  paqClass.includes("FEDEX") || paqClass.includes("FED EX") ? "paqueteria-fedex" :
                  "";

                const estaExpandida = tarjetaExpandida === r.id;
                
                return (
              <div
                key={r.id}
                className={`reenvio-card estatus-${(r.estatus || "")
                  .toLowerCase()
                  .replace(/\s+/g, "-")} ${paquetClass} ${estaExpandida ? "expandida-movil" : "colapsada-movil"}`}
                onClick={async (e) => {
                  // En móviles, expandir/colapsar en lugar de abrir modal
                  if (window.innerWidth <= 520) {
                    e.stopPropagation();
                    if (estaExpandida) {
                      setTarjetaExpandida(null);
                    } else {
                      setTarjetaExpandida(r.id);
                    }
                    return;
                  }
                  
                  // En desktop, comportamiento normal
                  setModalOpen(false);
                  // Limpiar fotos anteriores antes de cargar nuevas
                  setDetalleItem(null);
                  setDetalleOpen(false);
                  // Pequeño delay para asegurar que el estado se limpie
                  await new Promise(resolve => setTimeout(resolve, 50));
                  const fotosDetalle = await cargarFotosDetalle(r);
                  const fotosDataCompleto = await cargarFotosDetalleCompleto(r);
                  setDetalleItem({ ...r, fotos: fotosDetalle, fotosData: fotosDataCompleto });
                  setDetalleOpen(true);
                }}
              >
                <button
                  className="card-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    // En móviles, también colapsar si está expandida
                    if (window.innerWidth <= 520 && estaExpandida) {
                      setTarjetaExpandida(null);
                    }
                    eliminarOCancelar(r);
                  }}
                >
                  ×
                </button>

                {/* Pestaña visible cuando está colapsada en móvil */}
                <div className="tarjeta-pestana-movil">
                  <div className="pedido-pestana" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {r.pedido}
                    {r.estatus === "Enviado" && (
                      <span className="badge-enviado-movil" title="Enviado">✓</span>
                    )}
                    {r.estatus !== "Enviado" && window.innerWidth <= 520 && (
                      <button
                        className="btn-enviado-discreto-movil"
                        onClick={(e) => {
                          e.stopPropagation();
                          cambiarEstatus(r, "Enviado", false);
                        }}
                        title="Marcar como enviado"
                        style={{
                          background: 'rgba(76, 175, 80, 0.1)',
                          border: '1px solid rgba(76, 175, 80, 0.3)',
                          borderRadius: '4px',
                          color: '#4CAF50',
                          fontSize: '0.7rem',
                          padding: '1px 4px',
                          cursor: 'pointer',
                          opacity: 0.6,
                          transition: 'all 0.2s',
                          marginLeft: '4px',
                          lineHeight: '1.2'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.opacity = '1';
                          e.target.style.background = 'rgba(76, 175, 80, 0.2)';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.opacity = '0.6';
                          e.target.style.background = 'rgba(76, 175, 80, 0.1)';
                        }}
                      >
                        ✓
                      </button>
                    )}
                  </div>
                  <div className="icono-expandir">{estaExpandida ? "▼" : "▶"}</div>
                </div>

                {/* Contenido completo (oculto cuando está colapsada en móvil) */}
                <div className="tarjeta-contenido-movil">
                  <div className="card-row">
                    <span className="badge-estatus">{r.estatus || ""}</span>
                    <span className="fecha">
                      {r.fecha} {r.hora}
                    </span>
                  </div>

                  <div className="pedido">{r.pedido}</div>

                  <div className="info">
                    <div><strong>Paquetería:</strong> {r.paqueteria || "–"}</div>
                    <div><strong>Guía:</strong> {r.guia || "–"}</div>
                    <div><strong>Evidencias:</strong> {r.evidencia_count ?? 0}</div>
                  </div>

                  {/* Botón "Marcar como enviado" en la esquina inferior derecha (solo en desktop) */}
                  {window.innerWidth > 520 && (
                    <button
                      className="btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirCompartir(r);
                      }}
                    >
                      📤
                    </button>
                  )}
                  {r.estatus !== "Enviado" && window.innerWidth > 520 && (
                    <button
                      className="btn-marcar-enviado"
                      onClick={(e) => {
                        e.stopPropagation();
                        cambiarEstatus(r, "Enviado", false);
                      }}
                    >
                      ✓ Enviado
                    </button>
                  )}

                  {/* Botones de acción en móvil cuando está expandida */}
                  {estaExpandida && window.innerWidth <= 520 && (
                    <div className="tarjeta-acciones-movil">
                      <button
                        className="btn"
                        onClick={async (e) => {
                          e.stopPropagation();
                          setModalOpen(false);
                          setDetalleItem(null);
                          setDetalleOpen(false);
                          await new Promise(resolve => setTimeout(resolve, 50));
                          const fotosDetalle = await cargarFotosDetalle(r);
                          const fotosDataCompleto = await cargarFotosDetalleCompleto(r);
                          setDetalleItem({ ...r, fotos: fotosDetalle, fotosData: fotosDataCompleto });
                          setDetalleOpen(true);
                          setTarjetaExpandida(null);
                        }}
                      >
                        Ver detalles
                      </button>
                      <button
                        className="btn"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await editarEnvio(r);
                          setTarjetaExpandida(null);
                        }}
                      >
                        Editar
                      </button>
                      <button
                        className="btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          abrirCompartir(r);
                          setTarjetaExpandida(null);
                        }}
                      >
                        📤
                      </button>
                      {r.estatus !== "Enviado" && (
                        <button
                          className="btn btn-marcar-enviado-movil"
                          onClick={(e) => {
                            e.stopPropagation();
                            cambiarEstatus(r, "Enviado", false);
                            setTarjetaExpandida(null);
                          }}
                        >
                          ✓ Enviado
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
                );
              });
            })()}
          </div>
        </>
      )}

      {/* ===========================================================
          MODAL PEQUEÑO PARA EDITAR ENVÍO
      =========================================================== */}
      {editOpen && (
        <div className="modal-overlay edit-modal-overlay" onClick={() => setEditOpen(false)}>)
          <div className="modal edit-modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header edit-modal-header">
              <h3>✏️ Editar Reenvío</h3>
              <button className="modal-close" onClick={() => setEditOpen(false)}>×</button>
            </div>

            <div className="modal-body">
              <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Pedido:</label>
                  <input
                    type="text"
                    value={editPedido}
                    onChange={(e) => setEditPedido(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px",
                      fontSize: "1rem",
                      borderRadius: "6px",
                      border: "1px solid #ccc",
                      backgroundColor: "var(--fondo-card)",
                      color: "var(--texto-principal)"
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Guía:</label>
                  <input
                    type="text"
                    value={editGuia}
                    onChange={(e) => setEditGuia(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px",
                      fontSize: "1rem",
                      borderRadius: "6px",
                      border: "1px solid #ccc",
                      backgroundColor: "var(--fondo-card)",
                      color: "var(--texto-principal)"
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Paquetería:</label>
                  <input
                    type="text"
                    value={editPaq}
                    onChange={(e) => setEditPaq(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px",
                      fontSize: "1rem",
                      borderRadius: "6px",
                      border: "1px solid #ccc",
                      backgroundColor: "var(--fondo-card)",
                      color: "var(--texto-principal)"
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "10px", fontWeight: "bold" }}>Fotos:</label>
                  
                  {/* Fotos existentes */}
                  {editFotosData.length > 0 && (
                    <div style={{ marginBottom: "15px" }}>
                      <div style={{ fontSize: "0.85rem", color: "var(--texto-secundario)", marginBottom: "8px" }}>
                        Fotos existentes ({editFotosData.length}):
                      </div>
                      <div className="thumbs" style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                        {editFotosData.map((fotoData, i) => (
                          <div key={`existing-${i}`} className="thumb" style={{ position: "relative" }}>
                            <img 
                              src={fotoData.url} 
                              alt={`Foto ${i + 1}`} 
                              onClick={() => abrirViewer(editFotosData.map(f => f.url), i)}
                              style={{ 
                                width: "100px", 
                                height: "100px", 
                                objectFit: "cover", 
                                borderRadius: "6px",
                                cursor: "pointer"
                              }} 
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (fotoData.id && editItem) {
                                  borrarFoto(editItem.id, fotoData.id, i, true);
                                }
                              }}
                              style={{
                                position: "absolute",
                                top: "4px",
                                right: "4px",
                                background: "rgba(239, 68, 68, 0.9)",
                                color: "white",
                                border: "none",
                                borderRadius: "50%",
                                width: "24px",
                                height: "24px",
                                cursor: "pointer",
                                fontSize: "16px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: "bold"
                              }}
                              title="Borrar foto"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Nuevas fotos */}
                  {editFotos.length > 0 && (
                    <div style={{ marginBottom: "15px" }}>
                      <div style={{ fontSize: "0.85rem", color: "var(--texto-secundario)", marginBottom: "8px" }}>
                        Nuevas fotos ({editFotos.length}):
                      </div>
                      <div className="thumbs" style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                        {editPreviews.slice(editPreviews.length - editFotos.length).map((src, i) => {
                          const allFotosUrls = editPreviews;
                          const fotoIndex = editPreviews.length - editFotos.length + i;
                          return (
                            <div key={`new-${i}`} className="thumb" style={{ position: "relative" }}>
                              <img 
                                src={src} 
                                alt={`Nueva foto ${i + 1}`} 
                                onClick={() => abrirViewer(allFotosUrls, fotoIndex)}
                                style={{ 
                                  width: "100px", 
                                  height: "100px", 
                                  objectFit: "cover", 
                                  borderRadius: "6px",
                                  cursor: "pointer"
                                }} 
                              />
                              <button
                                className="thumb-del"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  borrarEditPreview(fotoIndex);
                                }}
                                style={{
                                  position: "absolute",
                                  top: "4px",
                                  right: "4px",
                                  background: "rgba(239, 68, 68, 0.9)",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "50%",
                                  width: "24px",
                                  height: "24px",
                                  cursor: "pointer",
                                  fontSize: "16px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontWeight: "bold"
                                }}
                                title="Borrar foto"
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Botón para agregar fotos */}
                  {editFotos.length < 5 && (
                    <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                      <input
                        ref={editFileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={onPickEditFotos}
                        style={{ display: "none" }}
                      />
                      <button
                        className="btn"
                        onClick={() => editFileInputRef.current?.click()}
                        style={{
                          padding: "10px 20px",
                          backgroundColor: "#3b82f6",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "0.9rem"
                        }}
                      >
                        📷 Agregar fotos ({editFotos.length}/5)
                      </button>
                    </div>
                  )}

                  {editFotos.length === 0 && editPreviews.length === 0 && (
                    <div style={{ padding: "20px", textAlign: "center", color: "var(--texto-secundario)", fontSize: "0.9rem" }}>
                      Sin fotos. Haz clic en "Agregar fotos" para subir evidencias.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="btn"
                onClick={() => {
                  if (editPedido.trim()) {
                    notificarFinProceso(editPedido);
                    limpiarProgresoLocal(editPedido.trim());
                  }
                  setEditOpen(false);
                  // Limpiar fotos
                  editFotos.forEach((f, i) => {
                    const previewIndex = editPreviews.length - editFotos.length + i;
                    if (editPreviews[previewIndex] && editPreviews[previewIndex].startsWith('blob:')) {
                      URL.revokeObjectURL(editPreviews[previewIndex]);
                    }
                  });
                  setEditFotos([]);
                  setEditPreviews([]);
                }}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={guardarEdicion}
                style={{
                  backgroundColor: "#10b981",
                  color: "white"
                }}
              >
                💾 Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===========================================================
          MODAL COMPARTIR POR CHAT
      =========================================================== */}
      {compartirOpen && (
        <div className="modal-overlay" onClick={() => setCompartirOpen(false)}>
          <div
            className="modal modal-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>📤 Compartir reenvío por chat</h3>
              <button className="modal-close" onClick={() => setCompartirOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <label style={{ display: "block", marginBottom: "8px", fontWeight: "600" }}>
                Enviar a
              </label>
              <select
                value={compartirDestino}
                onChange={(e) => setCompartirDestino(e.target.value)}
                style={{ width: "100%" }}
              >
                <option value="">Selecciona un usuario</option>
                {compartirUsuarios.map((u) => {
                  const value = u.nickname || u.name;
                  if (!value) return null;
                  const nombre = value || `Usuario ${u.id}`;
                  return (
                    <option key={u.id} value={value}>
                      {nombre}
                    </option>
                  );
                })}
              </select>

              <div style={{ marginTop: "12px", fontSize: "0.85rem", color: "var(--texto-secundario)" }}>
                Vista previa:
              </div>
              <pre
                style={{
                  marginTop: "6px",
                  background: "var(--fondo-input)",
                  border: "1px solid var(--borde-sutil)",
                  borderRadius: "8px",
                  padding: "10px",
                  fontSize: "0.85rem",
                  whiteSpace: "pre-wrap",
                }}
              >
                {construirMensajeCompartir(compartirItem)}
              </pre>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setCompartirOpen(false)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={enviarCompartir} disabled={compartiendo}>
                {compartiendo ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}

          {/* ===========================================
              MODAL WIZARD
          =========================================== */}
          {modalOpen && (
            <div
              className="modal-overlay"
              onClick={() => setModalOpen(false)}
            >
              <div
                className={`modal ${!modoLiberacion ? "nuevo-reenvio-modal" : ""}`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h3>
                    {modoLiberacion 
                      ? "Liberación de pedido" 
                      : pedido.trim() 
                        ? `Nuevo reenvío - ${pedido.trim()}` 
                        : "Nuevo reenvío"}
                  </h3>
                  <button
                    className="modal-close"
                    onClick={() => setModalOpen(false)}
                  >
                    ×
                  </button>
                </div>

                <div className="steps">
                  {[1, 2, 3, 4].map((n) => (
                    <div
                      key={n}
                      className={`step ${step === n ? "active" : ""}`}
                    >
                      {n}
                    </div>
                  ))}
                </div>

                {step === 1 && (
                  <div className="modal-body">
                    <label>
                      {modoLiberacion
                        ? "Nuevo número de pedido (opcional)"
                        : "Número de pedido"}
                    </label>
                    <input
                      ref={pedidoInputRef}
                      value={pedido}
                      onChange={(e) => {
                        const nuevoValor = e.target.value;
                        setPedido(nuevoValor);
                        
                        // Avanzar automáticamente al siguiente paso cuando se escanee (tiene contenido y no está en modo liberación)
                        if (!modoLiberacion && nuevoValor.trim().length > 0) {
                          // Pequeño delay para asegurar que el valor se actualizó
                          setTimeout(() => {
                            setStep(2);
                            // Enfocar el select de motivo después de cambiar de paso
                            setTimeout(() => {
                              if (motivoInputRef.current) {
                                motivoInputRef.current.focus();
                              }
                            }, 100);
                          }, 100);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          if (!modoLiberacion && !pedido.trim()) return;
                          e.preventDefault();
                          setStep(2);
                        }
                      }}
                      placeholder={
                        modoLiberacion
                          ? "Déjalo vacío para usar el mismo pedido"
                          : "Escanea o escribe el pedido"
                      }
                    />

                    <div className="modal-actions">
                      <button
                        className="btn"
                        onClick={() => {
                          if (pedido.trim()) {
                            notificarFinProceso(pedido);
                            limpiarProgresoLocal(pedido.trim());
                          }
                          setModalOpen(false);
                        }}
                      >
                        Cancelar
                      </button>
                      <button
                        className="btn-primary"
                        disabled={!modoLiberacion && !pedido.trim()}
                        onClick={async () => {
                          if (pedido.trim()) await guardarProgresoLocal(pedido.trim());
                          setStep(2);
                        }}
                      >
                        Siguiente →
                      </button>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="modal-body">
                    {!modoLiberacion ? (
                      <>
                        <label>Motivo (opcional)</label>
                        <select
                          ref={motivoInputRef}
                          value={motivo}
                          onChange={(e) => {
                            const valor = e.target.value;
                            if (valor === "+") {
                              // Mostrar input para agregar nuevo motivo
                              setMostrarInputMotivo(true);
                              setMotivo("");
                            } else if (valor && valor.trim() !== "") {
                              // Si se selecciona un motivo válido, avanzar automáticamente al siguiente paso
                              setMotivo(valor);
                              setMostrarInputMotivo(false);
                              // Avanzar al siguiente paso después de un pequeño delay
                              setTimeout(() => {
                                setStep(3);
                              }, 100);
                            } else {
                              setMotivo(valor);
                              setMostrarInputMotivo(false);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              setStep(3);
                            }
                          }}
                          style={{
                            width: "100%",
                            padding: "10px",
                            fontSize: "1rem",
                            borderRadius: "8px",
                            border: "1px solid #ccc",
                            backgroundColor: "var(--fondo-card)",
                            color: "var(--texto-principal)"
                          }}
                        >
                          <option value="">Selecciona un motivo</option>
                          <option value="CUBBO">CUBBO</option>
                          <option value="NO ESPECIFICA">NO ESPECIFICA</option>
                          <option value="RETORNO FEDEX">RETORNO FEDEX</option>
                          <option value="RETORNO DHL">RETORNO DHL</option>
                          <option value="RETORNO ESTAFETA">RETORNO ESTAFETA</option>
                          {motivosPersonalizados.map((mot, idx) => (
                            <option key={idx} value={mot}>{mot}</option>
                          ))}
                          <option value="+">+ Agregar nuevo motivo</option>
                        </select>
                        
                        {mostrarInputMotivo && (
                          <div style={{ marginTop: "10px", display: "flex", gap: "8px" }}>
                            <input
                              type="text"
                              value={nuevoMotivo}
                              onChange={(e) => setNuevoMotivo(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && nuevoMotivo.trim()) {
                                  e.preventDefault();
                                  // Agregar el nuevo motivo a la lista
                                  const nuevo = nuevoMotivo.trim().toUpperCase();
                                  if (!motivosPersonalizados.includes(nuevo) && nuevo !== "CUBBO" && nuevo !== "NO ESPECIFICA" && nuevo !== "RETORNO FEDEX" && nuevo !== "RETORNO DHL" && nuevo !== "RETORNO ESTAFETA") {
                                    setMotivosPersonalizados([...motivosPersonalizados, nuevo]);
                                    setMotivo(nuevo);
                                  } else {
                                    setMotivo(nuevo);
                                  }
                                  setNuevoMotivo("");
                                  setMostrarInputMotivo(false);
                                  // Avanzar automáticamente al siguiente paso
                                  setTimeout(() => {
                                    setStep(3);
                                  }, 100);
                                } else if (e.key === "Escape") {
                                  setMostrarInputMotivo(false);
                                  setNuevoMotivo("");
                                }
                              }}
                              placeholder="Escribe el nuevo motivo y presiona Enter"
                              style={{
                                flex: 1,
                                padding: "8px",
                                fontSize: "0.9rem",
                                borderRadius: "6px",
                                border: "1px solid #ccc",
                                backgroundColor: "var(--fondo-card)",
                                color: "var(--texto-principal)"
                              }}
                              autoFocus
                            />
                            <button
                              onClick={() => {
                                if (nuevoMotivo.trim()) {
                                  const nuevo = nuevoMotivo.trim().toUpperCase();
                                  if (!motivosPersonalizados.includes(nuevo) && nuevo !== "CUBBO" && nuevo !== "NO ESPECIFICA" && nuevo !== "RETORNO FEDEX" && nuevo !== "RETORNO DHL" && nuevo !== "RETORNO ESTAFETA") {
                                    setMotivosPersonalizados([...motivosPersonalizados, nuevo]);
                                    setMotivo(nuevo);
                                  } else {
                                    setMotivo(nuevo);
                                  }
                                  setNuevoMotivo("");
                                  setMostrarInputMotivo(false);
                                  // Avanzar automáticamente al siguiente paso
                                  setTimeout(() => {
                                    setStep(3);
                                  }, 100);
                                }
                              }}
                              style={{
                                padding: "8px 16px",
                                backgroundColor: "#10b981",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                cursor: "pointer",
                                fontSize: "0.9rem"
                              }}
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => {
                                setMostrarInputMotivo(false);
                                setNuevoMotivo("");
                              }}
                              style={{
                                padding: "8px 16px",
                                backgroundColor: "#ef4444",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                cursor: "pointer",
                                fontSize: "0.9rem"
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="lib-box">
                          <div>
                            <strong>Pedido anterior:</strong>{" "}
                            {libData.pedidoAnterior}
                          </div>
                          <div>
                            <strong>Motivo detención:</strong>{" "}
                            {libData.motivoDetencion}
                          </div>
                          <div>
                            <strong>Fecha liberación:</strong>{" "}
                            {libData.fechaLiberacion}
                          </div>
                        </div>

                        <label>Notas adicionales (opcional)</label>
                        <textarea
                          ref={motivoInputRef}
                          rows={3}
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              // Enter sin Shift para avanzar
                              e.preventDefault();
                              setStep(3);
                            }
                            // Shift+Enter permite nueva línea (comportamiento por defecto)
                          }}
                          placeholder="Notas adicionales (se guardan como comentario). Presiona Enter para avanzar, Shift+Enter para nueva línea."
                        />
                      </>
                    )}

                    <div className="modal-actions">
                      <button
                        className="btn"
                        onClick={() => setStep(1)}
                      >
                        ← Atrás
                      </button>
                      <button
                        className="btn-primary"
                        onClick={async () => {
                          if (pedido.trim()) await guardarProgresoLocal(pedido.trim());
                          setStep(3);
                        }}
                      >
                        Siguiente →
                      </button>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="modal-body">
                    <label>Fotos (máx 5)</label>

                    {/* Input oculto para galería */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={onPickFotos}
                      style={{ display: 'none' }}
                    />

                    {/* Input oculto para cámara */}
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={onPickFotos}
                      style={{ display: 'none' }}
                    />

                    {/* Botones para agregar fotos */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={abrirModalCamara}
                        className="btn"
                        style={{ 
                          flex: '1',
                          minWidth: '140px',
                          maxWidth: '100%',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          fontSize: '0.9rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        📷 Cámara
                      </button>
                      <button
                        type="button"
                        onClick={abrirGaleria}
                        className="btn"
                        style={{ 
                          flex: '1',
                          minWidth: '140px',
                          maxWidth: '100%',
                          backgroundColor: '#6b7280',
                          color: 'white',
                          border: 'none',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          fontSize: '0.9rem',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        🖼️ Galería
                      </button>
                      {!isMobileDevice && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (qrVigente) {
                            setQrModalOpen(true);
                            return;
                          }
                          if (!pedido.trim() && !modoLiberacion) {
                            pushToast?.("⚠️ Primero ingresa el número de pedido", "warn");
                            setStep(1);
                            return;
                          }
                          
                          try {
                            let reenvioId = null;
                            
                            if (modoLiberacion && libSourceId) {
                              // Si es liberación, usar el ID existente
                              reenvioId = libSourceId;
                            } else {
                              // Verificar si ya existe un reenvío con este pedido (puede ser de una sesión anterior)
                              const reenviosExistentes = await authFetch(`${serverUrl}/reenvios`);
                              const existente = reenviosExistentes.find(r => r.pedido === pedido && r.estatus !== "Cancelado" && r.estatus !== "Enviado");
                              
                              if (existente) {
                                reenvioId = existente.id;
                              } else {
                                // Guardar solo un registro mínimo (solo pedido) para generar el token
                                // Se actualizará cuando termine el proceso
                                const j = await authFetch(`${serverUrl}/reenvios`, {
                                  method: "POST",
                                  body: JSON.stringify({
                                    pedido,
                                    paqueteria: null,
                                    guia: null,
                                    observaciones: "[En proceso - Fotos desde móvil]",
                                  }),
                                });
                                
                                if (j.ok) {
                                  reenvioId = j.id;
                                  // Guardar el ID para actualizarlo después
                                  setReenvioTemporalId(reenvioId);
                                }
                              }
                            }
                            
                            if (reenvioId) {
                              await generarTokenMovil(reenvioId, pedido);
                            } else {
                              pushToast?.("❌ Error generando código", "err");
                            }
                          } catch (error) {
                            console.error("Error generando token móvil:", error);
                            pushToast?.("❌ Error generando código", "err");
                          }
                        }}
                        className="btn"
                        style={{ 
                          flex: '1',
                          minWidth: '140px',
                          maxWidth: '100%',
                          backgroundColor: '#10b981',
                          color: 'white',
                          border: 'none',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          fontSize: '0.9rem',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        📱 {qrVigente ? "Ver QR" : "Generar QR"}
                      </button>
                      )}
                    </div>

                    <div className="thumbs">
                      {previews.map((src, i) => (
                        <div key={i} className="thumb">
                          <img src={src} alt="" />
                          <button
                            className="thumb-del"
                            onClick={() => borrarPreview(i)}
                          >
                            ×
                          </button>
                        </div>
                      ))}

                      {!previews.length && (
                        <div className="empty-thumbs">Sin fotos</div>
                      )}
                    </div>

                    <div className="modal-actions">
                      <button
                        className="btn"
                        onClick={() => setStep(2)}
                      >
                        ← Atrás
                      </button>
                      <button
                        className="btn-primary"
                        onClick={async () => {
                          if (pedido.trim()) await guardarProgresoLocal(pedido.trim());
                          setStep(4);
                        }}
                      >
                        Siguiente →
                      </button>
                    </div>
                  </div>
                )}

                {step === 4 && (
                  <div className="modal-body">
                    <label>Guía</label>
                    <input
                      ref={guiaInputRef}
                      value={guia}
                      onChange={(e) => {
                        const nuevaGuia = e.target.value;
                        setGuia(nuevaGuia);
                        
                        // Detectar paquetería automáticamente
                        const auto = detectarPaqueteria(nuevaGuia);
                        if (auto && nuevaGuia.trim().length > 0) {
                          setPaqueteria(auto);
                          paqueteriaAutoDetectada.current = true;
                          
                          // Guardar automáticamente después de un delay
                          if (timeoutGuardadoAuto.current) {
                            clearTimeout(timeoutGuardadoAuto.current);
                          }
                          
                          timeoutGuardadoAuto.current = setTimeout(() => {
                            if (step === 4 && modalOpen && paqueteriaAutoDetectada.current && finalizarRef.current) {
                              finalizarRef.current();
                            }
                          }, 500);
                        } else {
                          paqueteriaAutoDetectada.current = false;
                          if (timeoutGuardadoAuto.current) {
                            clearTimeout(timeoutGuardadoAuto.current);
                            timeoutGuardadoAuto.current = null;
                          }
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          // Cancelar guardado automático si el usuario presiona Enter
                          if (timeoutGuardadoAuto.current) {
                            clearTimeout(timeoutGuardadoAuto.current);
                            timeoutGuardadoAuto.current = null;
                          }
                          paqueteriaInputRef.current?.focus();
                        }
                      }}
                      placeholder="Escanea la guía (PDA) o escríbela"
                    />

                    <label>Paquetería (auto o manual)</label>
                    <input
                      ref={paqueteriaInputRef}
                      value={paqueteria}
                      onChange={(e) => {
                        setPaqueteria(e.target.value);
                        // Si el usuario modifica manualmente, no guardar automáticamente
                        paqueteriaAutoDetectada.current = false;
                        if (timeoutGuardadoAuto.current) {
                          clearTimeout(timeoutGuardadoAuto.current);
                          timeoutGuardadoAuto.current = null;
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          // Cancelar guardado automático si el usuario presiona Enter manualmente
                          if (timeoutGuardadoAuto.current) {
                            clearTimeout(timeoutGuardadoAuto.current);
                            timeoutGuardadoAuto.current = null;
                          }
                          finalizar();
                        }
                      }}
                      placeholder="DHL / Estafeta / FedEx"
                    />

                    <div className="modal-actions">
                      <button
                        className="btn"
                        onClick={() => setStep(3)}
                      >
                        ← Atrás
                      </button>
                      <button className="btn-ok" onClick={finalizar}>
                        {modoLiberacion
                          ? "Cerrar liberación"
                          : "Cerrar reenvío"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===========================================
              DETALLE DEL PEDIDO
          =========================================== */}
          {detalleOpen && detalleItem && (
            <div className="modal-overlay" onClick={() => setDetalleOpen(false)}>
              <div
                className="modal detalle-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h3>
                    {detalleItem.esHistorico ? (
                      <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        📜 Detalle del pedido (Histórico)
                      </span>
                    ) : (
                      "Detalle del pedido"
                    )}
                  </h3>
                  <button
                    className="modal-close"
                    onClick={() => setDetalleOpen(false)}
                  >
                    ×
                  </button>
                </div>

                <div className="modal-body">
                  {detalleItem.esHistorico && detalleItem.fechaCorte && (
                    <div style={{ 
                      padding: "10px", 
                      marginBottom: "15px", 
                      backgroundColor: "#fef3c7", 
                      border: "1px solid #f59e0b", 
                      borderRadius: "6px",
                      color: "#92400e"
                    }}>
                      <strong>⚠️ Este reenvío está en histórico</strong>
                      <div style={{ fontSize: "0.9rem", marginTop: "5px" }}>
                        Fecha de cierre: {new Date(detalleItem.fechaCorte).toLocaleDateString('es-MX', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <strong>Pedido:</strong> {detalleItem.pedido}
                  </div>
                  <div>
                    <strong>Paquetería:</strong>{" "}
                    {detalleItem.paqueteria || "–"}
                  </div>
                  <div>
                    <strong>Guía:</strong> {detalleItem.guia || "–"}
                  </div>
                  <div>
                    <strong>Estatus:</strong> {detalleItem.estatus}
                  </div>
                  {detalleItem.fecha_enviado && (
                    <div>
                      <strong>Fecha enviado:</strong> {new Date(detalleItem.fecha_enviado).toLocaleDateString('es-MX')}
                    </div>
                  )}
                  {detalleItem.fecha_en_transito && (
                    <div>
                      <strong>Fecha en tránsito:</strong> {new Date(detalleItem.fecha_en_transito).toLocaleDateString('es-MX')}
                    </div>
                  )}
                  {detalleItem.fecha_entregado && (
                    <div style={{ color: '#10b981', fontWeight: 'bold' }}>
                      <strong>✅ Fecha entregado:</strong> {new Date(detalleItem.fecha_entregado).toLocaleDateString('es-MX')}
                    </div>
                  )}
                  <div>
                    <strong>Fecha:</strong> {detalleItem.fecha}{" "}
                    {detalleItem.hora}
                  </div>
                  {detalleItem.paqueteria && detalleItem.guia && (
                    <div>
                      <div style={{ marginTop: "10px", marginBottom: "10px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        {enlaceRastreo?.enlace ? (
                          <a
                            href={enlaceRastreo.enlace}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "8px",
                              padding: "8px 16px",
                              backgroundColor: "#3b82f6",
                              color: "white",
                              textDecoration: "none",
                              borderRadius: "6px",
                              fontSize: "0.9rem",
                              fontWeight: "500"
                            }}
                          >
                            🔍 Rastrear en {enlaceRastreo.paqueteria}
                          </a>
                        ) : (
                          <button
                            onClick={() => obtenerEnlaceRastreo(detalleItem.id, detalleItem.esHistorico || detalleItem.fechaCorte)}
                            style={{
                              padding: "8px 16px",
                              backgroundColor: "#6b7280",
                              color: "white",
                              border: "none",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontSize: "0.9rem"
                            }}
                          >
                            🔍 Obtener enlace de rastreo
                          </button>
                        )}
                        
                        <button
                          onClick={verificarEstadoPaqueteria}
                          disabled={verificandoEstado}
                          style={{
                            padding: "8px 16px",
                            backgroundColor: verificandoEstado ? "#9ca3af" : "#10b981",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            cursor: verificandoEstado ? "not-allowed" : "pointer",
                            fontSize: "0.9rem",
                            fontWeight: "500",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px"
                          }}
                        >
                          {verificandoEstado ? "⏳ Verificando..." : "🔄 Verificar Estado"}
                        </button>
                      </div>
                      
                      {infoRastreo && (
                        <div style={{ 
                          marginTop: "15px", 
                          padding: "12px", 
                          backgroundColor: "var(--fondo-card)", 
                          border: "1px solid rgba(255, 255, 255, 0.1)",
                          borderRadius: "8px",
                          fontSize: "0.9rem"
                        }}>
                          <div style={{ fontWeight: "bold", marginBottom: "8px", color: "var(--texto-principal)" }}>
                            📦 Estado en {detalleItem.paqueteria}:
                          </div>
                          <div style={{ color: "var(--texto-secundario)", marginBottom: "4px" }}>
                            <strong>Estado:</strong> {infoRastreo.estadoOriginal || infoRastreo.estado || "No disponible"}
                          </div>
                          {infoRastreo.ubicacion && infoRastreo.ubicacion !== "No disponible" && (
                            <div style={{ color: "var(--texto-secundario)", marginBottom: "4px" }}>
                              <strong>Ubicación:</strong> {infoRastreo.ubicacion}
                            </div>
                          )}
                          {infoRastreo.fecha && (
                            <div style={{ color: "var(--texto-secundario)", marginBottom: "4px" }}>
                              <strong>Fecha:</strong> {infoRastreo.fecha}
                            </div>
                          )}
                          {infoRastreo.detalles && infoRastreo.detalles.length > 0 && (
                            <div style={{ marginTop: "8px" }}>
                              <strong style={{ color: "var(--texto-principal)" }}>Últimos eventos:</strong>
                              <ul style={{ marginTop: "4px", paddingLeft: "20px", color: "var(--texto-secundario)" }}>
                                {infoRastreo.detalles.slice(0, 3).map((detalle, idx) => (
                                  <li key={idx} style={{ marginBottom: "2px", fontSize: "0.85rem" }}>
                                    {detalle}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {detalleItem.esHistorico && detalleItem.fechaCorte && (
                    <div>
                      <strong>Fecha de cierre:</strong>{" "}
                      {new Date(detalleItem.fechaCorte).toLocaleDateString('es-MX', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </div>
                  )}
                  <div>
                    <strong>Motivo:</strong>{" "}
                    {detalleItem.observaciones || "–"}
                  </div>

                  <hr style={{ opacity: 0.3 }} />

                  <strong>Fotos:</strong>
                  <div className="thumbs" style={{ marginTop: 6 }}>
                    {(detalleItem.fotos || []).map((src, i) => {
                      // Validar que la URL no esté vacía o incompleta
                      const urlValida = src && 
                        typeof src === 'string' && 
                        src.trim() && 
                        !src.endsWith('-') &&
                        src.length > 5; // Longitud mínima razonable
                      
                      const fotoData = detalleItem.fotosData?.[i];
                      
                      return (
                        <div key={i} className="thumb" style={{ position: "relative" }}>
                          {urlValida ? (
                            <>
                              <img
                                src={src}
                                alt={`Foto ${i + 1}`}
                                onClick={() =>
                                  abrirViewer(detalleItem.fotos, i)
                                }
                                onError={(e) => {
                                  // Manejar error de carga de imagen de forma silenciosa
                                  e.target.style.display = 'none';
                                  // Verificar si ya existe un placeholder para evitar duplicados
                                  if (!e.target.parentElement.querySelector('.image-placeholder')) {
                                    const placeholder = document.createElement('div');
                                    placeholder.className = 'image-placeholder';
                                    placeholder.style.cssText = 'display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; color: #999; font-size: 0.8rem; background: #f5f5f5; border-radius: 4px;';
                                    placeholder.textContent = `Foto ${i + 1} no disponible`;
                                    e.target.parentElement.appendChild(placeholder);
                                  }
                                }}
                                style={{ cursor: 'pointer', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                              />
                              {!detalleItem.esHistorico && fotoData?.id && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (fotoData.id && detalleItem.id) {
                                      borrarFoto(detalleItem.id, fotoData.id, i, false);
                                    }
                                  }}
                                  style={{
                                    position: "absolute",
                                    top: "4px",
                                    right: "4px",
                                    background: "rgba(239, 68, 68, 0.9)",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "50%",
                                    width: "24px",
                                    height: "24px",
                                    cursor: "pointer",
                                    fontSize: "16px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontWeight: "bold",
                                    zIndex: 10
                                  }}
                                  title="Borrar foto"
                                >
                                  ×
                                </button>
                              )}
                            </>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', color: '#999', fontSize: '0.8rem', background: '#f5f5f5', borderRadius: '4px' }}>
                              Foto {i + 1} no disponible
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {!detalleItem.fotos?.length && (
                      <div className="empty-thumbs">Sin fotos</div>
                    )}
                  </div>

                  {!detalleItem.esHistorico && (
                    <>
                      <hr style={{ opacity: 0.3, margin: "15px 0" }} />
                      
                      <div style={{ marginBottom: "15px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                          <strong>Historial de Estados</strong>
                          <button
                            onClick={() => {
                              setMostrarHistorial(!mostrarHistorial);
                              if (!mostrarHistorial && detalleItem.id) {
                                cargarHistorial(detalleItem.id);
                              }
                            }}
                            style={{
                              padding: "6px 12px",
                              backgroundColor: "#6b7280",
                              color: "white",
                              border: "none",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontSize: "0.85rem"
                            }}
                          >
                            {mostrarHistorial ? "Ocultar" : "Ver historial"}
                          </button>
                        </div>
                        
                        {mostrarHistorial && (
                          <div style={{
                            maxHeight: "200px",
                            overflowY: "auto",
                            border: "1px solid #e5e7eb",
                            borderRadius: "6px",
                            padding: "10px",
                            backgroundColor: "#f9fafb"
                          }}>
                            {cargandoHistorial ? (
                              <div style={{ textAlign: "center", padding: "20px", color: "#6b7280" }}>
                                Cargando historial...
                              </div>
                            ) : historialEstados.length > 0 ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                {historialEstados.map((h, idx) => (
                                  <div
                                    key={h.id || idx}
                                    style={{
                                      padding: "8px",
                                      backgroundColor: "white",
                                      borderRadius: "4px",
                                      borderLeft: "3px solid #3b82f6",
                                      fontSize: "0.85rem"
                                    }}
                                  >
                                    <div style={{ fontWeight: "600", color: "#1f2937" }}>
                                      {h.estado_anterior ? `${h.estado_anterior} → ${h.estado_nuevo}` : h.estado_nuevo}
                                    </div>
                                    <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "4px" }}>
                                      {h.fecha} {h.hora}
                                      {h.usuario && ` • Por: ${h.usuario}`}
                                    </div>
                                    {h.observacion && (
                                      <div style={{ fontSize: "0.8rem", color: "#4b5563", marginTop: "4px", fontStyle: "italic" }}>
                                        {h.observacion}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div style={{ textAlign: "center", padding: "20px", color: "#6b7280" }}>
                                No hay historial de estados
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div style={{ marginTop: "15px", marginBottom: "15px" }}>
                        <button
                          className="btn"
                          onClick={() => {
                            setNuevoEstado(detalleItem.estatus || "");
                            setObservacionEstado("");
                            setModalActualizarEstado(true);
                          }}
                          style={{
                            backgroundColor: "#8b5cf6",
                            color: "white",
                            border: "none",
                            padding: "10px 20px",
                            borderRadius: "8px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px",
                            width: "100%",
                            fontSize: "0.95rem"
                          }}
                        >
                          ✏️ Actualizar Estado
                        </button>
                      </div>

                      <div style={{ marginTop: "15px", marginBottom: "15px" }}>
                        <button
                          className="btn"
                          onClick={() => generarTokenMovil(detalleItem.id, detalleItem.pedido)}
                          style={{
                            backgroundColor: "#10b981",
                            color: "white",
                            border: "none",
                            padding: "10px 20px",
                            borderRadius: "8px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px",
                            width: "100%",
                            fontSize: "0.95rem"
                          }}
                        >
                          📱 Agregar fotos desde celular
                        </button>
                      </div>
                    </>
                  )}

                  <div className="modal-actions">
                    {!detalleItem.esHistorico && detalleItem.estatus !== "Enviado" && (
                      <button
                        className="btn-ok"
                        onClick={() =>
                          cambiarEstatus(detalleItem, "Enviado", true)
                        }
                      >
                        Marcar enviado
                      </button>
                    )}

                    {!detalleItem.esHistorico && detalleItem.estatus === "Enviado" && (
                      <button
                        className="btn-warn"
                        onClick={() =>
                          cambiarEstatus(detalleItem, "Listo para enviar", true)
                        }
                      >
                        Volver a listo para enviar
                      </button>
                    )}

                    {detalleItem.estatus === "Detenido" ? (
                      <button
                        className="btn-warn"
                        onClick={() => abrirLiberacion(detalleItem)}
                      >
                        Liberar…
                      </button>
                    ) : detalleItem.estatus !== "Enviado" ? (
                      <button
                        className="btn-warn"
                        onClick={() => detener(detalleItem)}
                      >
                        Detener…
                      </button>
                    ) : null}

                    {!detalleItem.esHistorico && (
                      <button
                        className="btn"
                        onClick={() => editarEnvio(detalleItem)}
                      >
                        Editar envío
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===========================================
              MODAL ACTUALIZAR ESTADO
          =========================================== */}
          {modalActualizarEstado && detalleItem && (
            <div className="modal-overlay" onClick={() => setModalActualizarEstado(false)}>
              <div
                className="modal modal-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h3>Actualizar Estado del Reenvío</h3>
                  <button
                    className="modal-close"
                    onClick={() => setModalActualizarEstado(false)}
                  >
                    ×
                  </button>
                </div>

                <div className="modal-body">
                  <div style={{ marginBottom: "15px" }}>
                    <label>
                      <strong>Pedido:</strong> {detalleItem.pedido}
                    </label>
                  </div>

                  <div style={{ marginBottom: "15px" }}>
                    <label>
                      <strong>Estado Actual:</strong> {detalleItem.estatus}
                    </label>
                  </div>

                  <div style={{ marginBottom: "15px" }}>
                    <label>
                      <strong>Nuevo Estado:</strong>
                    </label>
                    <select
                      value={nuevoEstado}
                      onChange={(e) => setNuevoEstado(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px",
                        borderRadius: "6px",
                        border: "1px solid #d1d5db",
                        fontSize: "0.95rem"
                      }}
                    >
                      <option value="">Selecciona un estado</option>
                      <option value="Listo para enviar">Listo para enviar</option>
                      <option value="Enviado">Enviado</option>
                      <option value="En tránsito">En tránsito</option>
                      <option value="Entregado">Entregado</option>
                      <option value="Detenido">Detenido</option>
                      <option value="Cancelado">Cancelado</option>
                    </select>
                  </div>

                  <div style={{ marginBottom: "15px" }}>
                    <label>
                      <strong>Observación (opcional):</strong>
                    </label>
                    <textarea
                      value={observacionEstado}
                      onChange={(e) => setObservacionEstado(e.target.value)}
                      placeholder="Ej: Llegó a sucursal, entregado al cliente, etc."
                      rows={3}
                      style={{
                        width: "100%",
                        padding: "8px",
                        borderRadius: "6px",
                        border: "1px solid #d1d5db",
                        fontSize: "0.95rem",
                        fontFamily: "inherit",
                        resize: "vertical"
                      }}
                    />
                  </div>

                  <div className="modal-actions">
                    <button
                      className="btn"
                      onClick={() => setModalActualizarEstado(false)}
                    >
                      Cancelar
                    </button>
                    <button
                      className="btn-primary"
                      onClick={actualizarEstadoConObservacion}
                      disabled={!nuevoEstado}
                    >
                      Actualizar Estado
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===========================================
              MODAL VIEWER DE FOTOS GRANDES
          =========================================== */}
          {viewerOpen && (
            <div
              className="modal-overlay"
              onClick={cerrarViewer}
            >
              <div
                className="modal viewer-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h3>Fotos del reenvío</h3>
                  <button
                    className="modal-close"
                    onClick={cerrarViewer}
                  >
                    ×
                  </button>
                </div>

                <div className="modal-body viewer-body">
                  {viewerFotos.length > 0 && (
                    <>
                      <div className="viewer-img-wrap">
                        <img
                          src={viewerFotos[viewerIndex]}
                          alt=""
                          className="viewer-img"
                        />
                      </div>

                      <div className="viewer-controls">
                        <button className="btn" onClick={viewerPrev}>
                          ◀
                        </button>
                        <span>
                          {viewerIndex + 1} / {viewerFotos.length}
                        </span>
                        <button className="btn" onClick={viewerNext}>
                          ▶
                        </button>
                      </div>

                      <div className="viewer-actions">
                        <a
                          className="btn-primary"
                          href={viewerFotos[viewerIndex]}
                          download
                          target="_blank"
                          rel="noreferrer"
                        >
                          Descargar
                        </a>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ===========================================
              MODAL CIERRE DE DÍA
          =========================================== */}
          {cerrarModalOpen && (
            <div
              className="modal-overlay"
              onClick={() => !cerrarLoading && setCerrarModalOpen(false)}
            >
              <div
                className="modal modal-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h3>Cierre de reenvíos del día</h3>
                  <button
                    className="modal-close"
                    onClick={() => !cerrarLoading && setCerrarModalOpen(false)}
                  >
                    ×
                  </button>
                </div>
                <div className="modal-body">
                  {!cerrarResumen && (
                    <>
                      <p>
                        Esto moverá todos los reenvíos con estatus{" "}
                        <strong>Enviado / Cancelado / Reemplazado</strong>{" "}
                        al histórico y los quitará de esta lista.
                      </p>
                      <p>¿Seguro que quieres continuar?</p>

                      <div className="modal-actions">
                        <button
                          className="btn"
                          onClick={() => setCerrarModalOpen(false)}
                          disabled={cerrarLoading}
                        >
                          Cancelar
                        </button>
                        <button
                          className="btn-ok"
                          onClick={confirmarCierre}
                          disabled={cerrarLoading}
                        >
                          {cerrarLoading ? "Cerrando..." : "Cerrar día ahora"}
                        </button>
                      </div>
                    </>
                  )}

                  {cerrarResumen && (
                    <>
                      <p>
                        ✅ Cierre realizado para la fecha{" "}
                        <strong>{cerrarResumen.fechaCierre}</strong>.
                      </p>
                      <p>
                        Se movieron{" "}
                        <strong>{cerrarResumen.cantidad}</strong>{" "}
                        reenvíos al histórico.
                      </p>

                      <div className="modal-actions">
                        <button
                          className="btn-ok"
                          onClick={() => setCerrarModalOpen(false)}
                        >
                          Listo
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ===========================================
              MODAL QR PARA MÓVIL
          =========================================== */}
          {qrModalOpen && (
            <div
              className="modal-overlay"
              onClick={() => setQrModalOpen(false)}
            >
              <div
                className="modal modal-qr"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h2>📱 Tomar foto desde celular</h2>
                  <button
                    className="modal-close"
                    onClick={() => setQrModalOpen(false)}
                  >
                    ×
                  </button>
                </div>

                <div className="modal-body" style={{ textAlign: "center", padding: "30px" }}>
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
                        padding: "12px",
                        backgroundColor: "var(--fondo-card)",
                        borderRadius: "12px",
                        border: "1px solid var(--borde-sutil)"
                      }}>
                        <img
                          src={`${serverUrl}/reenvios/qr?data=${encodeURIComponent(qrUrl)}&t=${Date.now()}`}
                          alt="QR Code"
                          style={{ 
                            width: "220px",
                            height: "220px",
                            maxWidth: "70vw",
                            maxHeight: "70vw",
                            borderRadius: "8px",
                            background: "var(--fondo-secundario)",
                            padding: "6px"
                          }}
                        />
                      </div>
                      <p style={{ marginBottom: "20px", fontSize: "14px", color: "var(--texto-secundario)" }}>
                        O copia este enlace:
                      </p>
                      <div style={{ 
                        backgroundColor: "var(--fondo-input)", 
                        padding: "10px 12px", 
                        borderRadius: "10px",
                        border: "1px solid var(--borde-sutil)",
                        marginBottom: "20px",
                        wordBreak: "break-all",
                        fontSize: "12px",
                        color: "var(--texto-principal)"
                      }}>
                        {qrUrl}
                      </div>
                      <button
                        className="btn-primary"
                        onClick={() => {
                          navigator.clipboard.writeText(qrUrl);
                          pushToast?.("✅ Enlace copiado al portapapeles", "ok");
                        }}
                        style={{ marginBottom: "15px" }}
                      >
                        📋 Copiar enlace
                      </button>
                      <p style={{ fontSize: "12px", color: "var(--texto-secundario)", marginTop: "20px" }}>
                        ⏰ Este código expira en 5 minutos
                      </p>
                    </>
                  )}
                </div>

                <div className="modal-actions">
                  <button
                    className="btn"
                    onClick={() => setQrModalOpen(false)}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===========================================
              MODAL DE CÁMARA (PERMANENTE)
          =========================================== */}
          {camModalOpen && (
            <div
              className="modal-overlay"
              onClick={cerrarModalCamara}
              style={{ 
                zIndex: 10000,
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0, 0, 0, 0.7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <div
                className="modal modal-lg"
                onClick={(e) => e.stopPropagation()}
                style={{ 
                  maxWidth: "90%", 
                  width: "100%", 
                  maxHeight: "90vh",
                  backgroundColor: "white",
                  borderRadius: "8px",
                  overflow: "auto"
                }}
              >
                <div className="modal-header">
                  <h3>📷 Cámara</h3>
                  <button
                    className="modal-close"
                    onClick={cerrarModalCamara}
                  >
                    ×
                  </button>
                </div>

                <div className="modal-body" style={{ padding: "20px" }}>
                  {/* Video de la cámara */}
                  {camStream ? (
                    <div style={{ 
                      position: "relative", 
                      width: "100%", 
                      maxWidth: "100%",
                      marginBottom: "20px",
                      backgroundColor: "#000",
                      borderRadius: "8px",
                      overflow: "hidden",
                      minHeight: "300px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{
                          width: "100%",
                          height: "auto",
                          display: "block",
                          maxHeight: "500px"
                        }}
                      />
                      <canvas ref={canvasRef} style={{ display: "none" }} />
                    </div>
                  ) : (
                    <div style={{ 
                      padding: "40px", 
                      textAlign: "center",
                      backgroundColor: "#f5f5f5",
                      borderRadius: "8px",
                      marginBottom: "20px"
                    }}>
                      <p>Cargando cámara...</p>
                    </div>
                  )}

                  {/* Miniaturas de fotos tomadas */}
                  {previews.length > 0 && (
                    <div style={{ marginBottom: "20px" }}>
                      <label style={{ display: "block", marginBottom: "10px", fontWeight: "600" }}>
                        Fotos tomadas ({previews.length}/5):
                      </label>
                      <div className="thumbs" style={{ 
                        display: "flex", 
                        gap: "10px", 
                        flexWrap: "wrap",
                        maxHeight: "150px",
                        overflowY: "auto"
                      }}>
                        {previews.map((src, i) => (
                          <div key={i} className="thumb" style={{ position: "relative" }}>
                            <img src={src} alt={`Foto ${i + 1}`} />
                            <button
                              className="thumb-del"
                              onClick={() => borrarPreview(i)}
                              style={{
                                position: "absolute",
                                top: "5px",
                                right: "5px",
                                background: "rgba(255, 0, 0, 0.8)",
                                color: "white",
                                border: "none",
                                borderRadius: "50%",
                                width: "24px",
                                height: "24px",
                                cursor: "pointer",
                                fontSize: "16px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center"
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Botones de acción */}
                  <div style={{ 
                    display: "flex", 
                    gap: "10px", 
                    justifyContent: "center",
                    flexWrap: "wrap"
                  }}>
                    <button
                      className="btn-primary"
                      onClick={capturarFoto}
                      disabled={previews.length >= 5}
                      style={{
                        padding: "15px 30px",
                        fontSize: "1.1rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px"
                      }}
                    >
                      ✓ Capturar foto
                    </button>
                    <button
                      className="btn"
                      onClick={cerrarModalCamara}
                      style={{
                        padding: "15px 30px",
                        fontSize: "1rem"
                      }}
                    >
                      Cerrar cámara
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
    </div>
  );
}
