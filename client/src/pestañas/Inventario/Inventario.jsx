import React, { useState, useMemo, useEffect, useRef } from "react";
import "./Inventario.css";
import { authFetch, useAuth } from "../../AuthContext";
import { useAlert } from "../../components/AlertModal";
import { Document, Packer, Paragraph, AlignmentType, TextRun, ImageRun, PageOrientation } from "docx";
import ExcelJS from "exceljs";

// Plugin de impresión Android deshabilitado (web-only)
let AndroidPrinterPlugin = {
  printToBluetooth: async () => ({ result: 'ERROR: Plugin no disponible' }),
  printZPL: async () => ({ result: 'ERROR: Plugin no disponible' }),
  findBluetoothPrinters: async () => ({ devices: [] })
};

export default function Inventario({
  SERVER_URL,
  CATEGORIAS,
  pushToast,
  cargarInventario,
  obtenerLotes,
  lotesCache,
  setLotesCache,
  inventario,
  setInventario,
  socket,
}) {
  const { perms } = useAuth();
  const { showAlert, showConfirm } = useAlert();
  const can = (perm) => perms?.includes(perm);
  const CATS_SAFE = CATEGORIAS || { "Sin categoría": [] };

  // Referencias para sincronizar scroll horizontal
  const scrollArribaRef = useRef(null);
  const tablaContainerRef = useRef(null);

  // Sincronizar scroll horizontal arriba <-> tabla
  useEffect(() => {
    const arriba = scrollArribaRef.current;
    const tabla = tablaContainerRef.current;
    if (!arriba || !tabla) return;
    const syncArriba = () => { tabla.scrollLeft = arriba.scrollLeft; };
    const syncTabla = () => { arriba.scrollLeft = tabla.scrollLeft; };
    arriba.addEventListener('scroll', syncArriba);
    tabla.addEventListener('scroll', syncTabla);
    return () => {
      arriba.removeEventListener('scroll', syncArriba);
      tabla.removeEventListener('scroll', syncTabla);
    };
  }, []);
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
    
    // Si no la contiene, agregarla
    return `${nombreTrim} - ${presentacionTrim}`;
  };

  const [invQuery, setInvQuery] = useState("");
  const [showAddInv, setShowAddInv] = useState(false);
  const [showEditInv, setShowEditInv] = useState(false);
  const [mostrarSoloAgotados, setMostrarSoloAgotados] = useState(false);
  
  // Estados para múltiples inventarios
  const [inventarios, setInventarios] = useState([]); // Lista de todos los inventarios
  const [inventarioActivo, setInventarioActivo] = useState(null); // ID del inventario activo
  const [showMenuBotones, setShowMenuBotones] = useState(false); // Menú desplegable de botones
  const [showModalNuevoInventario, setShowModalNuevoInventario] = useState(false); // Modal crear inventario
  const [formNuevoInventario, setFormNuevoInventario] = useState({ 
    nombre: "", 
    alias: "", 
    tipo: "nuevo", // "nuevo" o "copia"
    inventario_origen_id: null 
  }); // Formulario nuevo inventario
  const [showModalEliminarInventario, setShowModalEliminarInventario] = useState(false); // Modal eliminar inventario
  const [inventarioAEliminar, setInventarioAEliminar] = useState(null); // Inventario seleccionado para eliminar
  const [passwordEliminar, setPasswordEliminar] = useState(""); // Contraseña para eliminar
  const [productoTransferir, setProductoTransferir] = useState(null); // Producto seleccionado para transferir
  const [showMenuTransferir, setShowMenuTransferir] = useState(false); // Menú de transferencia
  const [lotesProductoTransferir, setLotesProductoTransferir] = useState([]); // Lotes del producto a transferir
  const [inventarioDestinoSeleccionado, setInventarioDestinoSeleccionado] = useState(null); // Inventario destino seleccionado
  const [lotesSeleccionados, setLotesSeleccionados] = useState({}); // { loteId: cantidad a transferir }

  const [formInv, setFormInv] = useState({
    codigo: "",
    nombre: "",
    presentacion: "",
    categoria: Object.keys(CATS_SAFE)[0],
    subcategoria: "",
    lote: "",
    piezasPorCaja: "",
    descripcion: "",
    precio: "",
    precio_compra: "",
    proveedor: "",
    marca: "",
    codigo_barras: "",
    sku: "",
    stock_minimo: "",
    stock_maximo: "",
    ubicacion: "",
    unidad_medida: "",
    peso: "",
    dimensiones: "",
    fecha_vencimiento: "",
  });

  const [editInv, setEditInv] = useState({
    id: null,
    codigo: "",
    nombre: "",
    presentacion: "",
    categoria: Object.keys(CATS_SAFE)[0],
    subcategoria: "",
    lote: "",
    nuevoLote: "",
    descripcion: "",
    precio: "",
    precio_compra: "",
    proveedor: "",
    marca: "",
    codigo_barras: "",
    sku: "",
    stock_minimo: "",
    stock_maximo: "",
    ubicacion: "",
    unidad_medida: "",
    peso: "",
    dimensiones: "",
    fecha_vencimiento: "",
    activo: true,
    inventario_id: null,
  });

  const [modalCodigos, setModalCodigos] = useState(false);
  const [codigosProd, setCodigosProd] = useState([]);
  const [codigoNuevo, setCodigoNuevo] = useState("");
  const [codigoEditando, setCodigoEditando] = useState(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrModalCodigo, setQrModalCodigo] = useState("");
  const [qrModalNombre, setQrModalNombre] = useState("");
  // eslint-disable-next-line no-unused-vars
  const [qrModalPresentacion, setQrModalPresentacion] = useState("");
  const [qrModalUrl, setQrModalUrl] = useState("");
  const [qrModalLoading, setQrModalLoading] = useState(false);

  // 👉 piezasActual controla TODOS los inputs de piezas
  const [modalPiezas, setModalPiezas] = useState(false);
  const [pendientesPiezas, setPendientesPiezas] = useState([]);
  const [indexPendiente, setIndexPendiente] = useState(0);
  const [piezasActual, setPiezasActual] = useState("");

  // Estados para modal de edición mejorado
  const [tabActivaModal, setTabActivaModal] = useState("informacion");
  const [fotosProducto, setFotosProducto] = useState([]);
  const [imagenPrincipal, setImagenPrincipal] = useState(null);
  
  // Estados para gestión de lotes
  const [lotesProducto, setLotesProducto] = useState([]);
  const [nuevoLote, setNuevoLote] = useState({ lote: "", cantidad_piezas: "", laboratorio: "", caducidad: "" });
  const [cargandoLotes, setCargandoLotes] = useState(false);
  const [loteEditando, setLoteEditando] = useState(null);
  const [showModalEditarLote, setShowModalEditarLote] = useState(false);
  const [showModalHistorialLote, setShowModalHistorialLote] = useState(false);
  const [loteHistorial, setLoteHistorial] = useState(null);
  const [historialLote, setHistorialLote] = useState([]);

  // Estados para importar/exportar
  const [showModalImportar, setShowModalImportar] = useState(false);
  const [archivoImportar, setArchivoImportar] = useState(null);
  const [datosImportar, setDatosImportar] = useState([]);
  const [columnasArchivo, setColumnasArchivo] = useState([]);
  const [columnasNuevas, setColumnasNuevas] = useState([]);
  const [mapeoColumnas, setMapeoColumnas] = useState({});
  const [opcionImportar, setOpcionImportar] = useState("crear"); // "crear", "actualizar", "ambos"
  const [vistaPrevia, setVistaPrevia] = useState([]);
  const [erroresValidacion, setErroresValidacion] = useState([]);
  const [importando, setImportando] = useState(false);
  const [progresoImportacion, setProgresoImportacion] = useState({ actual: 0, total: 0, exitosos: 0, errores: 0 });
  const fileInputRef = useRef(null);


  // Funciones para manejar fotos
  const handleFileUpload = (files) => {
    const nuevasFotos = files
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => ({
        file,
        preview: URL.createObjectURL(file),
        url: null,
      }));

    setFotosProducto([...fotosProducto, ...nuevasFotos]);
    if (imagenPrincipal === null && nuevasFotos.length > 0) {
      setImagenPrincipal(fotosProducto.length);
    }
  };

  const eliminarFoto = (index) => {
    const nuevasFotos = fotosProducto.filter((_, i) => i !== index);
    setFotosProducto(nuevasFotos);
    
    if (imagenPrincipal === index) {
      setImagenPrincipal(nuevasFotos.length > 0 ? 0 : null);
    } else if (imagenPrincipal > index) {
      setImagenPrincipal(imagenPrincipal - 1);
    }
    
    // Liberar URL del objeto
    if (fotosProducto[index].preview) {
      URL.revokeObjectURL(fotosProducto[index].preview);
    }
  };

  // Función para cargar lotes del producto desde el servidor
  const cargarLotesDelProducto = async (codigo, invId) => {
    if (!codigo) return;
    
    try {
      const inventarioIdQuery = invId || inventarioActivo || "";
      const lotes = await authFetch(`${SERVER_URL}/inventario/lotes/${codigo}/completo${inventarioIdQuery ? `?inventario_id=${inventarioIdQuery}` : ""}`);
      if (Array.isArray(lotes)) {
        setLotesProducto(lotes);
      } else {
        setLotesProducto([]);
      }
    } catch (err) {
      console.error(`❌ Error cargando lotes para ${codigo}:`, err);
      // Si el producto no existe o no tiene lotes, inicializar vacío
      setLotesProducto([]);
    }
  };

  // Función para cerrar el modal y resetear estados
  const handleCloseModal = () => {
    // Liberar todas las URLs de preview
    fotosProducto.forEach((foto) => {
      if (foto.preview) {
        URL.revokeObjectURL(foto.preview);
      }
    });
    setShowEditInv(false);
    setTabActivaModal("informacion");
    setFotosProducto([]);
    setImagenPrincipal(null);
    setPiezasActual("");
    setLotesProducto([]);
    setNuevoLote({ lote: "", cantidad_piezas: "", laboratorio: "", caducidad: "" });
  };

  // Variable para controlar advertencias (una sola vez)
  const advertenciaFiltradoRef = useRef(false);

  // Función helper para filtrar productos del inventario activo (BARRERA DE SEGURIDAD)
  const filtrarProductosPorInventario = (productos) => {
    if (!Array.isArray(productos) || !inventarioActivo) return productos;
    
    const productosFiltrados = productos.filter(p => {
      const productoInventarioId = p.inventario_id || p.inventarioId || 1;
      return productoInventarioId === inventarioActivo;
    });
    
    // Advertencia solo una vez si se detectan productos de otros inventarios
    if (!advertenciaFiltradoRef.current && productos.length !== productosFiltrados.length) {
      advertenciaFiltradoRef.current = true;
    }
    
    return productosFiltrados;
  };

  // Cargar inventarios múltiples al montar
  useEffect(() => {
    const cargarInventarios = async () => {
      try {
        const data = await authFetch(`${SERVER_URL}/inventario/inventarios`);
        if (Array.isArray(data) && data.length > 0) {
          setInventarios(data);
          // Si no hay inventario activo, usar el primero
          if (!inventarioActivo) {
            setInventarioActivo(data[0].id);
          }
        } else {
          // Si no hay inventarios, crear el por defecto
          const inventarioDefault = { id: 1, nombre: "Inventario", alias: "CEDIS" };
          setInventarios([inventarioDefault]);
          setInventarioActivo(1);
        }
      } catch (err) {
        console.error("❌ Error cargando inventarios:", err);
        // En caso de error, usar inventario por defecto
        const inventarioDefault = { id: 1, nombre: "Inventario", alias: "CEDIS" };
        setInventarios([inventarioDefault]);
        setInventarioActivo(1);
      }
    };
    cargarInventarios();
  }, [SERVER_URL]);

  // BARRERA: Filtrar el prop inventario inicial si viene con productos mezclados
  useEffect(() => {
    if (inventario && inventario.length > 0 && inventarioActivo) {
      const productosFiltrados = inventario.filter(p => {
        const productoInventarioId = p.inventario_id || p.inventarioId || 1;
        return productoInventarioId === inventarioActivo;
      });
      // Solo actualizar si hay diferencia (productos mezclados)
      if (productosFiltrados.length !== inventario.length) {
        setInventario(productosFiltrados);
      }
    } else if (inventario && inventario.length > 0 && !inventarioActivo) {
      // Si hay productos pero no hay inventario activo, limpiar
      setInventario([]);
    }
  }, []); // Solo al montar

  // Cargar productos cuando cambia el inventario activo
  useEffect(() => {
    if (inventarioActivo) {
      // Resetear la advertencia cuando cambia el inventario activo
      advertenciaFiltradoRef.current = false;
      
      const cargarProductosInventario = async () => {
        try {
          // Limpiar inventario primero para evitar mostrar productos del inventario anterior
          setInventario([]);
          
          const data = await authFetch(`${SERVER_URL}/inventario/inventarios/${inventarioActivo}/productos`);
          if (Array.isArray(data)) {
            // BARRERA: Filtrar solo productos del inventario activo (doble verificación)
            const productosFiltrados = data.filter(p => {
              const productoInventarioId = p.inventario_id || p.inventarioId || 1;
              return productoInventarioId === inventarioActivo;
            });
            setInventario(productosFiltrados);
          }
        } catch (err) {
          console.error("❌ Error cargando productos del inventario:", err);
          // No usar cargarInventario() porque mezcla inventarios
          setInventario([]);
        }
      };
      cargarProductosInventario();
    } else {
      // Si no hay inventario activo, limpiar el estado
      setInventario([]);
    }
  }, [inventarioActivo, SERVER_URL]);

  // Cerrar menú de botones al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showMenuBotones && !e.target.closest('.inventario-header')) {
        setShowMenuBotones(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showMenuBotones]);

  // Escuchar actualizaciones en tiempo real de inventarios
  useEffect(() => {
    if (!socket) return;

    const handleProductoAgregado = async (data) => {
      if (!data?.producto || !data?.inventario_id) return;
      
      // BARRERA: Solo agregar si pertenece al inventario activo
      if (data.inventario_id === inventarioActivo) {
        setInventario(prev => {
          // Verificar que el producto pertenezca al inventario activo
          const productoInventarioId = data.producto.inventario_id || data.producto.inventarioId || 1;
          if (productoInventarioId !== inventarioActivo) return prev;
          
          // Verificar si ya existe para evitar duplicados
          const existe = prev.find(p => p.id === data.producto.id && (p.inventario_id || p.inventarioId || 1) === inventarioActivo);
          if (existe) return prev;
          return [...prev, data.producto].sort((a, b) =>
            (a.nombre || "").localeCompare(b.nombre || "", "es")
          );
        });
      }
      
      // Si hay inventarios vinculados (copias), también actualizar sus listas si están activos
      const inventariosVinculados = inventarios.filter(inv => 
        inv.sincronizar_productos === 1 && 
        inv.inventario_origen_id === data.inventario_id
      );
      
      for (const invVinculado of inventariosVinculados) {
        if (invVinculado.id === inventarioActivo) {
          // Recargar productos del inventario vinculado activo
          try {
            const productosData = await authFetch(`${SERVER_URL}/inventario/inventarios/${inventarioActivo}/productos`);
            if (Array.isArray(productosData)) {
              setInventario(filtrarProductosPorInventario(productosData));
            }
          } catch (err) {
            console.error("❌ Error recargando inventario vinculado:", err);
          }
        }
      }
    };

    const handleProductoEliminado = (data) => {
      if (!data?.producto_id || !data?.inventario_id) return;
      
      // Si el producto se eliminó del inventario activo, quitarlo del estado local
      if (data.inventario_id === inventarioActivo) {
        setInventario(prev => prev.filter(p => p.id !== parseInt(data.producto_id)));
      }
      
      // Si hay inventarios vinculados, también actualizar sus listas si están activos
      const inventariosVinculados = inventarios.filter(inv => 
        inv.sincronizar_productos === 1 && 
        inv.inventario_origen_id === data.inventario_id
      );
      
      for (const invVinculado of inventariosVinculados) {
        if (invVinculado.id === inventarioActivo) {
          setInventario(prev => prev.filter(p => p.id !== parseInt(data.producto_id)));
        }
      }
    };

    const handleProductoActualizado = (data) => {
      if (!data?.producto || !data?.inventario_id) return;
      
      // BARRERA: Solo actualizar si pertenece al inventario activo
      if (data.inventario_id === inventarioActivo) {
        setInventario(prev => {
          const productoInventarioId = data.producto.inventario_id || data.producto.inventarioId || 1;
          // Si el producto actualizado no pertenece al inventario activo, no hacer nada
          if (productoInventarioId !== inventarioActivo) {
            // Si estaba en la lista pero ahora pertenece a otro inventario, eliminarlo
            return prev.filter(p => {
              const pInvId = p.inventario_id || p.inventarioId || 1;
              return !(p.id === data.producto.id && pInvId !== inventarioActivo);
            });
          }
          
          const idx = prev.findIndex(p => {
            const pInvId = p.inventario_id || p.inventarioId || 1;
            return p.id === data.producto.id && pInvId === inventarioActivo;
          });
          if (idx === -1) {
            // Si no existe, agregarlo
            return [...prev, data.producto].sort((a, b) =>
              (a.nombre || "").localeCompare(b.nombre || "", "es")
            );
          }
          // Si existe, actualizarlo
          const copy = [...prev];
          copy[idx] = data.producto;
          return copy;
        });
      }
      
      // Si hay inventarios vinculados, también actualizar sus listas si están activos
      const inventariosVinculados = inventarios.filter(inv => 
        inv.sincronizar_productos === 1 && 
        inv.inventario_origen_id === data.inventario_id
      );
      
      for (const invVinculado of inventariosVinculados) {
        if (invVinculado.id === inventarioActivo) {
          setInventario(prev => {
            const idx = prev.findIndex(p => p.id === data.producto.id);
            if (idx === -1) {
              return [...prev, data.producto].sort((a, b) =>
                (a.nombre || "").localeCompare(b.nombre || "", "es")
              );
            }
            const copy = [...prev];
            copy[idx] = data.producto;
            return copy;
          });
        }
      }
    };

    const handleInventarioActualizado = async () => {
      // Si hay inventarios vinculados activos, recargar sus productos
      if (inventarioActivo) {
        const invActivo = inventarios.find(inv => inv.id === inventarioActivo);
        if (invActivo?.sincronizar_productos === 1) {
          try {
            const productosData = await authFetch(`${SERVER_URL}/inventario/inventarios/${inventarioActivo}/productos`);
            if (Array.isArray(productosData)) {
              setInventario(filtrarProductosPorInventario(productosData));
            }
          } catch (err) {
            console.error("❌ Error recargando inventario vinculado:", err);
          }
        }
      }
    };

    socket.on("producto_agregado_inventario", handleProductoAgregado);
    socket.on("producto_eliminado_inventario", handleProductoEliminado);
    socket.on("producto_actualizado_inventario", handleProductoActualizado);
    socket.on("inventario_actualizado", handleInventarioActualizado);

    return () => {
      socket.off("producto_agregado_inventario", handleProductoAgregado);
      socket.off("producto_eliminado_inventario", handleProductoEliminado);
      socket.off("producto_actualizado_inventario", handleProductoActualizado);
      socket.off("inventario_actualizado", handleInventarioActualizado);
    };
  }, [socket, inventarioActivo, inventarios, SERVER_URL]);

  // detectar cápsulas/polvos sin piezasPorCaja
  useEffect(() => {
    if (!inventario || inventario.length === 0) return;

    const pendientes = inventario.filter((p) => {
      const cat = (p.categoria || "").toLowerCase();
      const esCapsOPolvo =
        cat === "capsulas" ||
        cat === "cápsulas" ||
        cat === "capsula" ||
        cat === "cápsula" ||
        cat === "polvos" ||
        cat === "polvo";

      const sinPiezas =
        p.piezas_por_caja === null ||
        p.piezas_por_caja === undefined ||
        p.piezas_por_caja === 0 ||
        p.piezas_por_caja === "";

      return esCapsOPolvo && sinPiezas;
    });

    if (pendientes.length > 0 && !modalPiezas) {
      setPendientesPiezas(pendientes);
      setIndexPendiente(0);
      setPiezasActual("");
      setModalPiezas(true);
    }
  }, [inventario, modalPiezas]);

  // ====== COMPARTIR POR CHAT ======
  const [compartirOpen, setCompartirOpen] = useState(false);
  const [compartirProducto, setCompartirProducto] = useState(null);
  const [compartirUsuarios, setCompartirUsuarios] = useState([]);
  const [compartirDestino, setCompartirDestino] = useState("");
  const [compartiendo, setCompartiendo] = useState(false);

  const cargarUsuariosChat = async () => {
    try {
      const data = await authFetch(`${SERVER_URL}/chat/usuarios`);
      setCompartirUsuarios(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Error cargando usuarios de chat:", e);
      setCompartirUsuarios([]);
    }
  };

  const abrirCompartir = async (producto) => {
    setCompartirProducto(producto);
    setCompartirDestino("");
    setCompartirOpen(true);
    await cargarUsuariosChat();
  };

  const construirMensajeCompartir = (producto) => {
    if (!producto) return "Producto compartido.";
    const base = new URL(window.location.origin);
    base.pathname = '/inventario';
    base.searchParams.set("share", "producto");
    if (producto.codigo) base.searchParams.set("codigo", String(producto.codigo));
    if (producto.id) base.searchParams.set("id", String(producto.id));
    return base.toString();
  };

  const enviarCompartir = async () => {
    if (!compartirDestino || !compartirProducto) {
      pushToast("Selecciona un usuario para compartir.", "warn");
      return;
    }
    try {
      setCompartiendo(true);
      await authFetch(`${SERVER_URL}/chat/privado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          para_nickname: compartirDestino,
          mensaje: construirMensajeCompartir(compartirProducto),
          tipo_mensaje: "texto",
        }),
      });
      pushToast("Producto compartido por chat.", "ok");
      setCompartirOpen(false);
    } catch (e) {
      console.error("Error compartiendo producto:", e);
      pushToast("No se pudo compartir el producto.", "err");
    } finally {
      setCompartiendo(false);
    }
  };

  // Función para compartir por Web Share API (otras apps)
  const compartirPorOtrasApps = async (producto) => {
    if (!producto || !producto.codigo) {
      pushToast("❌ No hay información del producto para compartir", "err");
      return;
    }

    const nombreCompleto = obtenerNombreCompleto(producto.nombre || "", producto.presentacion || "");
    const enlace = construirMensajeCompartir(producto);
    
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Producto: ${nombreCompleto || producto.codigo}`,
          text: `📦 ${nombreCompleto || producto.codigo}\n🔖 Código: ${producto.codigo}`,
          url: enlace
        });
        pushToast("✅ Producto compartido exitosamente", "ok");
      } else {
        // Fallback: copiar enlace al portapapeles
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(enlace);
          pushToast("✅ Enlace copiado al portapapeles", "ok");
        } else {
          pushToast("⚠️ Compartir no disponible en este dispositivo", "warn");
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        return; // Usuario canceló
      }
      console.error("Error compartiendo:", err);
      pushToast("❌ Error al compartir", "err");
    }
  };

  // Función para generar y descargar QR individual con código (no usada - compartir por QR eliminado)
  // eslint-disable-next-line no-unused-vars
  async function generarQRIndividual(codigo, nombre, presentacion) {
    if (!codigo) {
      pushToast("❌ No hay código para generar QR", "err");
      return;
    }

    try {
      const nombreCompleto = obtenerNombreCompleto(nombre || "", presentacion || "");
      
      // Usar endpoint del servidor para generar QR con logo
      const token = localStorage.getItem("token");
      const qrUrl = `${SERVER_URL}/inventario/qr/${encodeURIComponent(codigo)}?t=${Date.now()}`;
      
      const response = await fetch(qrUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`Error al cargar QR: ${response.status}`);
      }
      
      const blob = await response.blob();
      
      // Crear un canvas para agregar código y nombre debajo del QR con bordes redondeados
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const qrSize = 400;
        const paddingBottom = 180; // Espacio extra para nombre (2 líneas) y presentación
        const borderRadius = 20; // Bordes redondeados
        canvas.width = qrSize;
        canvas.height = qrSize + paddingBottom;
        const ctx = canvas.getContext("2d");
        
        // Función helper para dibujar rectángulo redondeado
        const drawRoundedRect = (x, y, width, height, radius) => {
          ctx.beginPath();
          ctx.moveTo(x + radius, y);
          ctx.lineTo(x + width - radius, y);
          ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
          ctx.lineTo(x + width, y + height - radius);
          ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
          ctx.lineTo(x + radius, y + height);
          ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
          ctx.lineTo(x, y + radius);
          ctx.quadraticCurveTo(x, y, x + radius, y);
          ctx.closePath();
        };
        
        // Fondo blanco con bordes redondeados
        ctx.fillStyle = "#FFFFFF";
        drawRoundedRect(0, 0, canvas.width, canvas.height, borderRadius);
        ctx.fill();
        
        // Dibujar QR (con logo integrado) con bordes redondeados
        ctx.save();
        drawRoundedRect(0, 0, qrSize, qrSize, borderRadius);
        ctx.clip();
        ctx.drawImage(img, 0, 0, qrSize, qrSize);
        ctx.restore();
        
        // Agregar nombre del producto debajo del QR (negro, máximo 2 líneas si es necesario)
        const nombreProducto = (nombre || "").trim();
        if (nombreProducto && nombreProducto.length > 0) {
          ctx.fillStyle = "#000000"; // Negro
          ctx.textAlign = "center";
          
          const maxWidth = qrSize * 1.15; // Permitir que sea un poco más ancho que el QR
          let fontSize = 24; // Tamaño inicial más pequeño
          let text = nombreProducto;
          
          // Función para dividir texto en líneas
          const wrapText = (text, maxWidth, fontSize) => {
            if (!text || text.trim().length === 0) return [];
            ctx.font = `bold ${fontSize}px Arial, sans-serif`;
            const words = text.trim().split(' ').filter(w => w.length > 0);
            if (words.length === 0) return [];
            const lines = [];
            let currentLine = words[0] || "";
            
            for (let i = 1; i < words.length; i++) {
              const word = words[i];
              const testLine = currentLine + ' ' + word;
              const metrics = ctx.measureText(testLine);
              
              if (metrics.width > maxWidth && currentLine.length > 0) {
                lines.push(currentLine);
                currentLine = word;
              } else {
                currentLine = testLine;
              }
            }
            lines.push(currentLine);
            return lines;
          };
          
          // Función para verificar que las líneas quepan en el ancho
          const checkLinesFit = (lines, maxWidth, fontSize) => {
            ctx.font = `bold ${fontSize}px Arial, sans-serif`;
            return lines.every(line => ctx.measureText(line).width <= maxWidth);
          };
          
          // Intentar con tamaño inicial
          let lines = wrapText(text, maxWidth, fontSize);
          
          // Si necesita más de 2 líneas, reducir el tamaño de fuente
          while (lines.length > 2 && fontSize > 14) {
            fontSize -= 1;
            lines = wrapText(text, maxWidth, fontSize);
          }
          
          // Si aún necesita más de 2 líneas, forzar a 2 líneas dividiendo por la mitad
          if (lines.length > 2) {
            const midPoint = Math.floor(text.length / 2);
            // Buscar el espacio más cercano al punto medio
            let splitIndex = midPoint;
            for (let i = 0; i < text.length; i++) {
              if (text[i] === ' ' && Math.abs(i - midPoint) < Math.abs(splitIndex - midPoint)) {
                splitIndex = i;
              }
            }
            lines = [
              text.substring(0, splitIndex).trim(),
              text.substring(splitIndex).trim()
            ];
          }
          
          // Verificar que las líneas quepan, reducir tamaño si es necesario
          while (!checkLinesFit(lines, maxWidth, fontSize) && fontSize > 14) {
            fontSize -= 1;
            ctx.font = `bold ${fontSize}px Arial, sans-serif`;
            // Re-dividir con el nuevo tamaño si es necesario
            if (lines.some(line => ctx.measureText(line).width > maxWidth)) {
              lines = wrapText(text, maxWidth, fontSize);
              // Si vuelve a ser más de 2 líneas, forzar a 2 de nuevo
              if (lines.length > 2) {
                const midPoint = Math.floor(text.length / 2);
                let splitIndex = midPoint;
                for (let i = 0; i < text.length; i++) {
                  if (text[i] === ' ' && Math.abs(i - midPoint) < Math.abs(splitIndex - midPoint)) {
                    splitIndex = i;
                  }
                }
                lines = [
                  text.substring(0, splitIndex).trim(),
                  text.substring(splitIndex).trim()
                ];
              }
            }
          }
          
          // Dibujar las líneas del nombre y guardar dónde termina
          ctx.font = `bold ${fontSize}px Arial, sans-serif`;
          const lineHeight = fontSize * 1.2;
          let startY = qrSize + 60;
          
          lines.forEach((line, index) => {
            ctx.fillText(line, qrSize / 2, startY + (index * lineHeight));
          });
          
          // Calcular dónde terminó el nombre para la presentación
          const nombreEndY = startY + (lines.length * lineHeight);
          
          // Agregar presentación debajo del nombre (negro, más pequeño)
          const presentacionProducto = (presentacion || "").trim();
          if (presentacionProducto && presentacionProducto.length > 0) {
            try {
              ctx.fillStyle = "#000000"; // Negro
              ctx.textAlign = "center";
              
              const maxWidth = qrSize * 1.15;
              let fontSizePres = 28;
              let text = presentacionProducto;
              
              // Si la presentación es muy larga, reducir el tamaño
              ctx.font = `bold ${fontSizePres}px Arial, sans-serif`;
              while (ctx.measureText(text).width > maxWidth && fontSizePres > 16) {
                fontSizePres -= 1;
                ctx.font = `bold ${fontSizePres}px Arial, sans-serif`;
              }
              
              // Posición Y después del nombre con un poco de espacio
              const presentacionY = nombreEndY + 15;
              
              ctx.fillText(text, qrSize / 2, presentacionY);
            } catch (err) {
              console.error("Error dibujando presentación:", err);
            }
          }
        } else {
          // Si no hay nombre, mostrar solo la presentación
          const presentacionProducto = (presentacion || "").trim();
          if (presentacionProducto && presentacionProducto.length > 0) {
            try {
              ctx.fillStyle = "#000000"; // Negro
              ctx.textAlign = "center";
              ctx.font = "bold 28px Arial, sans-serif";
              
              const maxWidth = qrSize * 1.15;
              let fontSizePres = 28;
              let text = presentacionProducto;
              
              ctx.font = `bold ${fontSizePres}px Arial, sans-serif`;
              while (ctx.measureText(text).width > maxWidth && fontSizePres > 16) {
                fontSizePres -= 1;
                ctx.font = `bold ${fontSizePres}px Arial, sans-serif`;
              }
              
              ctx.fillText(text, qrSize / 2, qrSize + 60);
            } catch (err) {
              console.error("Error dibujando presentación sin nombre:", err);
            }
          }
        }
        
        // Convertir a blob y descargar
        canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `QR_${codigo}_${nombreCompleto.replace(/[^a-z0-9]/gi, "_").substring(0, 30)}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          pushToast("✅ QR descargado correctamente", "ok");
        }, "image/png");
      };
      
      img.onerror = () => {
        pushToast("❌ Error al generar el QR", "err");
      };
      
      img.src = URL.createObjectURL(blob);
    } catch (err) {
      console.error("Error generando QR:", err);
      pushToast("❌ Error al generar QR: " + err.message, "err");
    }
  }

  const abrirQrModal = async (codigo, nombre, presentacion) => {
    if (!codigo) {
      pushToast?.("❌ No hay código para generar QR", "err");
      return;
    }
    setQrModalCodigo(codigo);
    setQrModalNombre(nombre || "");
    setQrModalPresentacion(presentacion || "");
    setQrModalOpen(true);
    setQrModalLoading(true);

    try {
      const token = localStorage.getItem("token");
      const qrUrl = `${SERVER_URL}/inventario/qr/${encodeURIComponent(codigo)}?t=${Date.now()}`;
      const response = await fetch(qrUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Error al cargar QR: ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      setQrModalUrl(objectUrl);
    } catch (err) {
      console.error("Error cargando QR:", err);
      setQrModalUrl("");
      pushToast?.("❌ Error al cargar QR: " + err.message, "err");
    } finally {
      setQrModalLoading(false);
    }
  };

  const cerrarQrModal = () => {
    if (qrModalUrl) {
      URL.revokeObjectURL(qrModalUrl);
    }
    setQrModalUrl("");
    setQrModalCodigo("");
    setQrModalNombre("");
    setQrModalPresentacion("");
    setQrModalLoading(false);
    setQrModalOpen(false);
  };

  // Función para descargar solo QRs individuales con código
  async function descargarQRsIndividuales() {
    if (!inventario || inventario.length === 0) {
      pushToast("❌ No hay productos para generar QRs", "err");
      return;
    }

    try {
      pushToast("⏳ Generando QRs individuales, por favor espera...", "info");
      
      const productos = inventario.map(p => ({
        codigo: p.codigo || "",
        nombre: p.nombre || "",
        presentacion: p.presentacion || "",
        nombreCompleto: obtenerNombreCompleto(p.nombre || "", p.presentacion || "")
      }));

      // Generar y descargar cada QR
      for (const producto of productos) {
        if (!producto.codigo) continue;
        
        // Usar endpoint del servidor para generar QR con logo
        const token = localStorage.getItem("token");
        const qrUrl = `${SERVER_URL}/inventario/qr/${encodeURIComponent(producto.codigo)}?t=${Date.now()}`;
        
        try {
          const response = await fetch(qrUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          
          if (!response.ok) {
            throw new Error(`Error al cargar QR: ${response.status}`);
          }
          
          const blob = await response.blob();
          
          // Crear canvas para agregar código debajo
          const img = new Image();
          img.crossOrigin = "anonymous";
          
          await new Promise((resolve, reject) => {
            img.onload = () => {
              const canvas = document.createElement("canvas");
              canvas.width = 400;
              canvas.height = 480; // Espacio extra para el código
              const ctx = canvas.getContext("2d");
              
              // Fondo blanco
              ctx.fillStyle = "#FFFFFF";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              
              // Dibujar QR
              ctx.drawImage(img, 0, 0, 400, 400);
              
              // Agregar código debajo (más grande)
              ctx.fillStyle = "#000000";
              ctx.font = "bold 28px Arial";
              ctx.textAlign = "center";
              ctx.fillText(producto.codigo, 200, 440);
              
              // Convertir a blob y descargar
              canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `QR_${producto.codigo}_${producto.nombreCompleto.replace(/[^a-z0-9]/gi, "_").substring(0, 30)}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                resolve();
              }, "image/png");
            };
            
            img.onerror = reject;
            img.src = URL.createObjectURL(blob);
          });
          
          // Pequeña pausa entre descargas
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          console.error(`Error generando QR para ${producto.codigo}:`, err);
        }
      }
      
      pushToast("✅ Todos los QRs descargados correctamente", "ok");
    } catch (err) {
      console.error("Error generando QRs:", err);
      pushToast("❌ Error al generar QRs: " + err.message, "err");
    }
  }

  // Función para generar documento Word con todos los productos (nombre, presentación y QR)
  async function generarDocumentoCompleto() {
    if (!inventario || inventario.length === 0) {
      pushToast("❌ No hay productos para generar el documento", "err");
      return;
    }

    try {
      pushToast("⏳ Generando documento con QRs, por favor espera...", "info");
      
      const productos = inventario.map(p => ({
        codigo: p.codigo || "",
        nombre: p.nombre || "",
        presentacion: p.presentacion || ""
      }));

      // Convertir URLs de QR a imágenes base64 con código incluido
      const productosConQR = await Promise.all(
        productos.map(async (producto) => {
          if (!producto.codigo) return { ...producto, qrBase64: null };
          
          // Usar endpoint del servidor para generar QR con logo
          const token = localStorage.getItem("token");
          const qrUrl = `${SERVER_URL}/inventario/qr/${encodeURIComponent(producto.codigo)}?t=${Date.now()}`;
          
          try {
            const response = await fetch(qrUrl, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });
            
            if (!response.ok) {
              throw new Error(`Error al cargar QR: ${response.status}`);
            }
            
            const blob = await response.blob();
            
            const img = new Image();
            img.crossOrigin = "anonymous";
            
            const base64 = await new Promise((resolve, reject) => {
              img.onload = () => {
                // Calcular el ancho necesario para el código (más grande)
                const tempCanvas = document.createElement("canvas");
                const tempCtx = tempCanvas.getContext("2d");
                tempCtx.font = "bold 24px Arial"; // Tamaño 24 para el código (más visible)
                const textWidth = tempCtx.measureText(producto.codigo).width;
                
                // El ancho será el mayor entre el QR (80) y el ancho del texto + padding
                const canvasWidth = Math.max(80, textWidth + 30);
                const canvasHeight = 80 + 40; // 80 para QR + 40 para código más grande
                
                const canvas = document.createElement("canvas");
                canvas.width = canvasWidth;
                canvas.height = canvasHeight;
                const ctx = canvas.getContext("2d");
                
                ctx.fillStyle = "#FFFFFF";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Centrar el QR horizontalmente
                const qrX = (canvasWidth - 80) / 2;
                ctx.drawImage(img, qrX, 0, 80, 80);
                
                // Dibujar código centrado debajo del QR (tamaño 24, más visible)
                ctx.fillStyle = "#000000";
                ctx.font = "bold 24px Arial"; // Tamaño 24 para el código (más grande)
                ctx.textAlign = "center";
                ctx.fillText(producto.codigo, canvasWidth / 2, 105);
                
                resolve(canvas.toDataURL("image/png"));
              };
              
              img.onerror = reject;
              img.src = URL.createObjectURL(blob);
            });
            
            return { ...producto, qrBase64: base64 };
          } catch (err) {
            console.error(`Error cargando QR para ${producto.codigo}:`, err);
            return { ...producto, qrBase64: null };
          }
        })
      );

      // Crear lista simple: una línea por producto
      const children = productosConQR.map((producto) => {
        const paragraphChildren = [
          new TextRun({
            text: producto.nombre || "Sin nombre",
            bold: true,
            size: 22,
          }),
          new TextRun({ text: "  " }),
          new TextRun({
            text: producto.presentacion || "",
            size: 22,
            color: "666666",
          }),
          new TextRun({ text: "  " }),
        ];
        
        if (producto.qrBase64) {
          // Calcular dimensiones dinámicas basadas en el código
          // Usar un ancho estimado (el QR se ajustará automáticamente)
          paragraphChildren.push(
            new ImageRun({
              data: producto.qrBase64.split(",")[1],
              transformation: {
                width: 140, // Ancho suficiente para códigos largos
                height: 120, // 80 para QR + 40 para código más grande
              },
            })
          );
        } else {
          paragraphChildren.push(
            new TextRun({
              text: "QR no disponible",
              italics: true,
              size: 16,
            })
          );
        }
        
        return new Paragraph({
          children: paragraphChildren,
          alignment: AlignmentType.LEFT,
          spacing: { after: 400 },
        });
      });

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                size: {
                  orientation: PageOrientation.LANDSCAPE,
                  width: 11906,
                  height: 8420,
                },
                margin: {
                  top: 500,
                  right: 500,
                  bottom: 500,
                  left: 500,
                },
              },
            },
            children: children,
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Inventario_QR_${new Date().toISOString().split("T")[0]}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      pushToast("✅ Documento generado correctamente", "ok");
    } catch (err) {
      console.error("Error generando documento:", err);
      pushToast("❌ Error al generar documento: " + err.message, "err");
    }
  }

  // Función para exportar inventario a Excel
  async function exportarInventario() {
    if (!inventario || inventario.length === 0) {
      pushToast("❌ No hay productos para exportar", "err");
      return;
    }

    try {
      pushToast("⏳ Generando archivo Excel, por favor espera...", "info");
      
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Inventario");

      // Definir columnas
      worksheet.columns = [
        { header: "Código", key: "codigo", width: 15 },
        { header: "Nombre", key: "nombre", width: 30 },
        { header: "Presentación", key: "presentacion", width: 20 },
        { header: "Categoría", key: "categoria", width: 15 },
        { header: "Subcategoría", key: "subcategoria", width: 20 },
        { header: "Lote", key: "lote", width: 15 },
        { header: "Piezas por Caja", key: "piezas_por_caja", width: 15 },
        { header: "Descripción", key: "descripcion", width: 40 },
        { header: "Precio", key: "precio", width: 12 },
        { header: "Precio Compra", key: "precio_compra", width: 15 },
        { header: "Proveedor", key: "proveedor", width: 20 },
        { header: "Marca", key: "marca", width: 15 },
        { header: "Código de Barras", key: "codigo_barras", width: 18 },
        { header: "SKU", key: "sku", width: 15 },
        { header: "Stock Mínimo", key: "stock_minimo", width: 15 },
        { header: "Stock Máximo", key: "stock_maximo", width: 15 },
        { header: "Ubicación", key: "ubicacion", width: 15 },
        { header: "Unidad de Medida", key: "unidad_medida", width: 18 },
        { header: "Peso", key: "peso", width: 12 },
        { header: "Dimensiones", key: "dimensiones", width: 20 },
        { header: "Fecha Vencimiento", key: "fecha_vencimiento", width: 18 },
        { header: "Activo", key: "activo", width: 10 },
      ];

      // Estilizar encabezados
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // Agregar datos
      inventario.forEach(producto => {
        worksheet.addRow({
          codigo: producto.codigo || "",
          nombre: producto.nombre || "",
          presentacion: producto.presentacion || "",
          categoria: producto.categoria || "",
          subcategoria: producto.subcategoria || "",
          lote: producto.lote || "",
          piezas_por_caja: producto.piezas_por_caja || "",
          descripcion: producto.descripcion || "",
          precio: producto.precio || "",
          precio_compra: producto.precio_compra || "",
          proveedor: producto.proveedor || "",
          marca: producto.marca || "",
          codigo_barras: producto.codigo_barras || "",
          sku: producto.sku || "",
          stock_minimo: producto.stock_minimo || "",
          stock_maximo: producto.stock_maximo || "",
          ubicacion: producto.ubicacion || "",
          unidad_medida: producto.unidad_medida || "",
          peso: producto.peso || "",
          dimensiones: producto.dimensiones || "",
          fecha_vencimiento: producto.fecha_vencimiento || "",
          activo: producto.activo !== undefined ? (producto.activo ? "Sí" : "No") : "Sí",
        });
      });

      // Generar archivo
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Inventario_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      pushToast("✅ Inventario exportado correctamente", "ok");
    } catch (err) {
      console.error("Error exportando inventario:", err);
      pushToast("❌ Error al exportar inventario: " + err.message, "err");
    }
  }

  // Función para crear nuevo inventario
  const crearNuevoInventario = async () => {
    if (!formNuevoInventario.nombre.trim()) {
      await showAlert("El nombre del inventario es requerido", "warning");
      return;
    }

    if (formNuevoInventario.tipo === "copia" && !formNuevoInventario.inventario_origen_id) {
      await showAlert("Debes seleccionar un inventario origen para copiar", "warning");
      return;
    }

    // BARRERA: Si es copia, solo permitir copia de CEDIS
    if (formNuevoInventario.tipo === "copia" && formNuevoInventario.inventario_origen_id !== 1) {
      await showAlert("Solo se pueden crear inventarios como copia de CEDIS", "warning");
      return;
    }

    try {
      const payload = {
        nombre: formNuevoInventario.nombre.trim(),
        alias: formNuevoInventario.alias.trim() || null,
        es_copia: formNuevoInventario.tipo === "copia",
        inventario_origen_id: formNuevoInventario.tipo === "copia" ? formNuevoInventario.inventario_origen_id : null
      };

      const data = await authFetch(`${SERVER_URL}/inventario/inventarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      // Recargar lista de inventarios
      const inventariosData = await authFetch(`${SERVER_URL}/inventario/inventarios`);
      setInventarios(inventariosData);
      
      // Cambiar al nuevo inventario
      setInventarioActivo(data.id);
      
      // Recargar productos del nuevo inventario
      const productosData = await authFetch(`${SERVER_URL}/inventario/inventarios/${data.id}/productos`);
      if (Array.isArray(productosData)) {
        setInventario(filtrarProductosPorInventario(productosData));
      }
      
      // Cerrar modal y limpiar formulario
      setShowModalNuevoInventario(false);
      setFormNuevoInventario({ nombre: "", alias: "", tipo: "nuevo", inventario_origen_id: null });
      
      await showAlert(
        `✅ Inventario "${data.nombre}"${data.alias ? ` (${data.alias})` : ""} ${data.es_copia ? "copiado" : "creado"} exitosamente`, 
        "success"
      );
    } catch (err) {
      await showAlert(err.message || "Error creando inventario", "error");
    }
  };

  // Función para eliminar inventario
  const eliminarInventario = async () => {
    if (!passwordEliminar.trim()) {
      await showAlert("Debes ingresar tu contraseña de administrador", "warning");
      return;
    }

    if (!inventarioAEliminar) {
      await showAlert("No se ha seleccionado un inventario para eliminar", "error");
      return;
    }

    try {
      const data = await authFetch(`${SERVER_URL}/inventario/inventarios/${inventarioAEliminar.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordEliminar })
      });

      // Recargar lista de inventarios
      const inventariosData = await authFetch(`${SERVER_URL}/inventario/inventarios`);
      setInventarios(inventariosData);
      
      // Si el inventario eliminado era el activo, cambiar al primero disponible
      if (inventarioAEliminar.id === inventarioActivo) {
        if (inventariosData.length > 0) {
          setInventarioActivo(inventariosData[0].id);
        } else {
          setInventarioActivo(null);
          setInventario([]);
        }
      }
      
      // Cerrar modal y limpiar
      setShowModalEliminarInventario(false);
      setInventarioAEliminar(null);
      setPasswordEliminar("");
      
      await showAlert(
        `✅ Inventario "${inventarioAEliminar.nombre}" eliminado exitosamente (${data.productos_eliminados || 0} productos eliminados)`, 
        "success"
      );
    } catch (err) {
      await showAlert(err.message || "Error eliminando inventario", "error");
      setPasswordEliminar(""); // Limpiar contraseña en caso de error
    }
  };

  // Función para transferir producto entre inventarios
  const transferirProducto = async (productoId, inventarioDestinoId, lotesATransferir) => {
    try {
      await authFetch(`${SERVER_URL}/inventario/inventarios/transferir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          producto_id: productoId,
          inventario_origen_id: inventarioActivo,
          inventario_destino_id: inventarioDestinoId,
          lotes: lotesATransferir || []
        })
      });

      // Recargar productos del inventario actual
      const data = await authFetch(`${SERVER_URL}/inventario/inventarios/${inventarioActivo}/productos`);
      if (Array.isArray(data)) {
        setInventario(filtrarProductosPorInventario(data));
      }

      // Cerrar menú de transferencia
      setShowMenuTransferir(false);
      setProductoTransferir(null);
      setLotesProductoTransferir([]);
      setInventarioDestinoSeleccionado(null);
      setLotesSeleccionados({});
      
      await showAlert("✅ Producto transferido exitosamente", "success");
    } catch (err) {
      await showAlert(err.message || "Error transfiriendo producto", "error");
    }
  };

  // Función para leer archivo Excel/CSV
  async function leerArchivo(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const data = e.target.result;
          const workbook = new ExcelJS.Workbook();
          
          if (file.name.endsWith('.csv')) {
            // Leer CSV como texto y convertir (manejar comas dentro de comillas)
            const text = data;
            const lines = text.split(/\r?\n/).filter(line => line.trim());
            if (lines.length === 0) {
              reject(new Error("El archivo CSV está vacío"));
              return;
            }
            
            // Función para parsear línea CSV respetando comillas
            const parseCSVLine = (line) => {
              const result = [];
              let current = '';
              let inQuotes = false;
              
              for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                  inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                  result.push(current.trim());
                  current = '';
                } else {
                  current += char;
                }
              }
              result.push(current.trim());
              return result;
            };
            
            const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ''));
            const rows = lines.slice(1).map(line => {
              const values = parseCSVLine(line).map(v => v.replace(/^"|"$/g, ''));
              const row = {};
              headers.forEach((header, index) => {
                row[header] = values[index] || "";
              });
              return row;
            }).filter(row => {
              // Filtrar filas completamente vacías
              return Object.values(row).some(val => val && val.toString().trim());
            });
            
            resolve({ headers, rows });
          } else {
            // Leer Excel
            await workbook.xlsx.load(data);
            const worksheet = workbook.worksheets[0];
            
            if (worksheet.rowCount === 0) {
              reject(new Error("El archivo Excel está vacío"));
              return;
            }
            
            // Obtener encabezados de la primera fila
            const headerRow = worksheet.getRow(1);
            const headers = [];
            headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
              headers.push(cell.value?.toString() || `Columna${colNumber}`);
            });
            
            // Obtener datos
            const rows = [];
            for (let i = 2; i <= worksheet.rowCount; i++) {
              const row = worksheet.getRow(i);
              const rowData = {};
              headers.forEach((header, index) => {
                const cell = row.getCell(index + 1);
                rowData[header] = cell.value?.toString() || "";
              });
              
              // Solo agregar si tiene al menos código o nombre
              if (rowData[headers[0]] || rowData[headers[1]]) {
                rows.push(rowData);
              }
            }
            
            resolve({ headers, rows });
          }
        } catch (err) {
          reject(err);
        }
      };
      
      reader.onerror = reject;
      
      if (file.name.endsWith('.csv')) {
        reader.readAsText(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    });
  }

  // Función para detectar columnas nuevas y mapear
  function detectarColumnasYMapear(headers) {
    // Columnas estándar del sistema
    const columnasSistema = {
      "codigo": ["código", "codigo", "code", "sku"],
      "nombre": ["nombre", "name", "producto", "descripción", "descripcion"],
      "presentacion": ["presentación", "presentacion", "presentation"],
      "categoria": ["categoría", "categoria", "category"],
      "subcategoria": ["subcategoría", "subcategoria", "subcategory"],
      "lote": ["lote", "lot", "batch"],
      "piezas_por_caja": ["piezas por caja", "piezas_por_caja", "piezas/caja", "pieces per box"],
      "descripcion": ["descripción", "descripcion", "description"],
      "precio": ["precio", "price"],
      "precio_compra": ["precio compra", "precio_compra", "cost", "costo"],
      "proveedor": ["proveedor", "supplier", "vendor"],
      "marca": ["marca", "brand"],
      "codigo_barras": ["código de barras", "codigo_barras", "barcode", "ean"],
      "sku": ["sku"],
      "stock_minimo": ["stock mínimo", "stock_minimo", "min stock", "minimo"],
      "stock_maximo": ["stock máximo", "stock_maximo", "max stock", "maximo"],
      "ubicacion": ["ubicación", "ubicacion", "location", "ubic"],
      "unidad_medida": ["unidad de medida", "unidad_medida", "unit"],
      "peso": ["peso", "weight"],
      "dimensiones": ["dimensiones", "dimensions"],
      "fecha_vencimiento": ["fecha vencimiento", "fecha_vencimiento", "expiry", "vencimiento"],
      "activo": ["activo", "active", "enabled"],
    };

    const mapeo = {};
    const columnasNuevas = [];
    const columnasMapeadas = new Set();

    headers.forEach(header => {
      const headerLower = header.toLowerCase().trim();
      let mapeado = false;

      // Buscar en columnas del sistema
      for (const [campoSistema, variantes] of Object.entries(columnasSistema)) {
        if (variantes.some(v => headerLower.includes(v) || v.includes(headerLower))) {
          mapeo[header] = campoSistema;
          columnasMapeadas.add(campoSistema);
          mapeado = true;
          break;
        }
      }

      // Si no se mapeó, es una columna nueva
      if (!mapeado) {
        columnasNuevas.push(header);
        mapeo[header] = null; // Se asignará después
      }
    });

    return { mapeo, columnasNuevas };
  }

  // Función para validar datos antes de importar
  function validarDatos(rows, mapeo) {
    const errores = [];
    
    rows.forEach((row, index) => {
      const numFila = index + 2; // +2 porque la fila 1 es encabezado
      
      // Validar código (obligatorio)
      const codigoKey = Object.keys(mapeo).find(k => mapeo[k] === "codigo");
      if (!codigoKey || !row[codigoKey] || !row[codigoKey].toString().trim()) {
        errores.push(`Fila ${numFila}: Falta el código del producto`);
      }

      // Validar nombre (obligatorio)
      const nombreKey = Object.keys(mapeo).find(k => mapeo[k] === "nombre");
      if (!nombreKey || !row[nombreKey] || !row[nombreKey].toString().trim()) {
        errores.push(`Fila ${numFila}: Falta el nombre del producto`);
      }

      // Validar números
      const piezasKey = Object.keys(mapeo).find(k => mapeo[k] === "piezas_por_caja");
      if (piezasKey && row[piezasKey] && isNaN(parseFloat(row[piezasKey]))) {
        errores.push(`Fila ${numFila}: "Piezas por caja" debe ser un número`);
      }
    });

    return errores;
  }

  // Función para manejar selección de archivo
  async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls') && !file.name.endsWith('.csv')) {
      pushToast("❌ Por favor selecciona un archivo Excel (.xlsx, .xls) o CSV", "err");
      return;
    }

    try {
      setArchivoImportar(file);
      pushToast("⏳ Leyendo archivo, por favor espera...", "info");
      
      const { headers, rows } = await leerArchivo(file);
      
      if (rows.length === 0) {
        pushToast("❌ El archivo no contiene datos", "err");
        return;
      }

      // Detectar columnas y mapear
      const { mapeo, columnasNuevas } = detectarColumnasYMapear(headers);
      
      setColumnasArchivo(headers);
      setColumnasNuevas(columnasNuevas);
      setMapeoColumnas(mapeo);
      setDatosImportar(rows);
      
      // Validar datos
      const errores = validarDatos(rows, mapeo);
      setErroresValidacion(errores);
      
      // Mostrar vista previa (primeros 5 productos)
      setVistaPrevia(rows.slice(0, 5));
      
      pushToast(`✅ Archivo leído: ${rows.length} productos encontrados`, "ok");
    } catch (err) {
      console.error("Error leyendo archivo:", err);
      pushToast("❌ Error al leer el archivo: " + err.message, "err");
    }
  }

  // Función para procesar importación
  async function procesarImportacion() {
    
    // Verificar que tenemos datos
    if (!datosImportar || datosImportar.length === 0) {
      console.error("❌ [IMPORTACIÓN] No hay datos para importar");
      pushToast("❌ No hay datos para importar", "err");
      return;
    }

    // Manejar errores de validación
    if (erroresValidacion && erroresValidacion.length > 0) {
      const confirmado = await showConfirm(
        `Hay ${erroresValidacion.length} error(es) de validación. ¿Deseas continuar de todos modos?`,
        "Errores de validación"
      );
      if (!confirmado) {
        return;
      }
    }

    try {
      
      // CRÍTICO: Establecer estado ANTES de cualquier await
      setImportando(true);
      setProgresoImportacion({ actual: 0, total: datosImportar.length, exitosos: 0, errores: 0 });
      
      
      // Pausa más larga para asegurar que React renderice
      await new Promise(resolve => setTimeout(resolve, 200));
      
      
      let exitosos = 0;
      let errores = 0;
      const erroresDetalle = [];
      let procesados = 0;

      for (const row of datosImportar) {
        try {
          // Construir payload según el mapeo (solo campos que el sistema acepta)
          const payload = {};
          
          // Campos aceptados por el sistema actualmente
          const camposAceptados = ["codigo", "nombre", "presentacion", "categoria", "subcategoria", "piezas_por_caja", "lote"];
          
          // Debug: Verificar mapeo
          const mapeoCodigo = Object.entries(mapeoColumnas).find(([col, campo]) => campo === "codigo");
          if (!mapeoCodigo && datosImportar.length > 0) {
          }
          
          // IMPORTANTE: Procesar TODAS las columnas del archivo, no solo las mapeadas
          // Esto asegura que se capturen todos los valores correctamente
          Object.keys(row).forEach(columnaArchivo => {
            // Buscar si esta columna está mapeada
            const campoSistema = mapeoColumnas[columnaArchivo];
            const columnaLower = columnaArchivo.toLowerCase().trim();
            
            // Si está mapeada y es un campo aceptado, usarla
            if (campoSistema && camposAceptados.includes(campoSistema)) {
              let valor = row[columnaArchivo];
              
              // Si no se encuentra con el nombre exacto, intentar buscar sin importar mayúsculas/minúsculas
              if (valor === undefined || valor === null) {
                const columnaEncontrada = Object.keys(row).find(
                  key => key.toLowerCase().trim() === columnaArchivo.toLowerCase().trim()
                );
                if (columnaEncontrada) {
                  valor = row[columnaEncontrada];
                }
              }
              
              if (valor !== undefined && valor !== null) {
                const valorStr = valor.toString().trim();
                
                // Convertir tipos según el campo
                if (campoSistema === "piezas_por_caja") {
                  payload[campoSistema] = valorStr ? parseInt(valorStr, 10) : 0;
                } else {
                  // IMPORTANTE: Para categoría, subcategoría y presentación, guardar incluso si está vacío
                  if (campoSistema === "categoria" || campoSistema === "subcategoria" || campoSistema === "presentacion") {
                    payload[campoSistema] = valorStr || "";
                  } else {
                    payload[campoSistema] = valorStr || null;
                  }
                }
              }
            } else {
              // Si no está mapeada, intentar detectarla automáticamente por el nombre de la columna
              // PRIORIDAD: Categoría primero (es muy importante)
              if ((columnaLower.includes("categoría") || columnaLower.includes("categoria") || columnaLower === "category") && 
                  !columnaLower.includes("subcategoría") && !columnaLower.includes("subcategoria") && !columnaLower.includes("subcategory") && 
                  !payload.categoria) {
                const valor = row[columnaArchivo];
                if (valor !== undefined && valor !== null) {
                  const valorStr = valor.toString().trim();
                  if (valorStr) {
                    payload.categoria = valorStr;
                  }
                }
              } else if ((columnaLower.includes("subcategoría") || columnaLower.includes("subcategoria") || columnaLower === "subcategory") && !payload.subcategoria) {
                const valor = row[columnaArchivo];
                if (valor !== undefined && valor !== null) {
                  const valorStr = valor.toString().trim();
                  if (valorStr) {
                    payload.subcategoria = valorStr;
                  }
                }
              } else if ((columnaLower.includes("código") || columnaLower === "codigo" || columnaLower === "code") && !payload.codigo) {
                const valor = row[columnaArchivo];
                if (valor !== undefined && valor !== null) {
                  const valorStr = valor.toString().trim();
                  if (valorStr) {
                    payload.codigo = valorStr;
                  }
                }
              } else if ((columnaLower.includes("nombre") || columnaLower === "name" || columnaLower === "producto") && 
                         !payload.nombre && !columnaLower.includes("código") && !columnaLower.includes("codigo")) {
                const valor = row[columnaArchivo];
                if (valor !== undefined && valor !== null) {
                  const valorStr = valor.toString().trim();
                  if (valorStr) {
                    payload.nombre = valorStr;
                  }
                }
              } else if ((columnaLower.includes("presentación") || columnaLower.includes("presentacion") || columnaLower === "presentation") && !payload.presentacion) {
                const valor = row[columnaArchivo];
                if (valor !== undefined && valor !== null) {
                  const valorStr = valor.toString().trim();
                  if (valorStr) {
                    payload.presentacion = valorStr;
                  }
                }
              } else if ((columnaLower.includes("lote") || columnaLower === "lot" || columnaLower === "batch") && !payload.lote) {
                const valor = row[columnaArchivo];
                if (valor !== undefined && valor !== null) {
                  const valorStr = valor.toString().trim();
                  if (valorStr) {
                    payload.lote = valorStr;
                  }
                }
              } else if ((columnaLower.includes("piezas") && columnaLower.includes("caja")) && !payload.piezas_por_caja) {
                const valor = row[columnaArchivo];
                if (valor !== undefined && valor !== null) {
                  payload.piezas_por_caja = valor ? parseInt(valor.toString().trim(), 10) : 0;
                }
              }
            }
          });

          // Validar código (obligatorio)
          // El nombre puede estar vacío, pero si no hay código, no se puede procesar
          if (!payload.codigo || !payload.codigo.trim()) {
            // Intentar encontrar el código manualmente si el mapeo falló
            let codigoEncontrado = null;
            
            // Buscar en todas las columnas que contengan "codigo" o "código"
            for (const [key, value] of Object.entries(row)) {
              if (key && value !== undefined && value !== null) {
                const keyLower = key.toLowerCase().trim();
                if (keyLower.includes("codigo") || keyLower.includes("código") || keyLower === "code") {
                  const valorStr = value.toString().trim();
                  if (valorStr) {
                    codigoEncontrado = valorStr;
                    break;
                  }
                }
              }
            }
            
            if (codigoEncontrado) {
              // Si encontramos el código, usarlo
              payload.codigo = codigoEncontrado;
            } else {
              errores++;
              erroresDetalle.push(`Producto sin código: ${JSON.stringify(row)}`);
              continue;
            }
          }
          
          // IMPORTANTE: NO usar el código como nombre si el nombre está vacío
          // El nombre debe venir del archivo, no generarse automáticamente
          // Si no hay nombre en el archivo, dejarlo vacío o null, pero NO usar el código
          if (!payload.nombre || !payload.nombre.trim()) {
            // Buscar el nombre en el archivo de forma más agresiva
            for (const [key, value] of Object.entries(row)) {
              if (key && value !== undefined && value !== null) {
                const keyLower = key.toLowerCase().trim();
                if ((keyLower.includes("nombre") || keyLower === "name" || keyLower === "producto") && !keyLower.includes("código") && !keyLower.includes("codigo")) {
                  const valorStr = value.toString().trim();
                  if (valorStr) {
                    payload.nombre = valorStr;
                    break;
                  }
                }
              }
            }
            
            // Si después de buscar no hay nombre, dejarlo como cadena vacía (no usar código)
            if (!payload.nombre || !payload.nombre.trim()) {
              payload.nombre = ""; // Cadena vacía, no el código
            }
          }
          
          // IMPORTANTE: Buscar categoría de forma más agresiva si no se encontró
          if (!payload.categoria || !payload.categoria.trim()) {
            // Buscar la categoría en el archivo de forma más agresiva
            for (const [key, value] of Object.entries(row)) {
              if (key && value !== undefined && value !== null) {
                const keyLower = key.toLowerCase().trim();
                // Buscar columnas que contengan "categoría" o "categoria" (con o sin tilde)
                if ((keyLower.includes("categoría") || keyLower.includes("categoria") || keyLower === "category") && !keyLower.includes("subcategoría") && !keyLower.includes("subcategoria") && !keyLower.includes("subcategory")) {
                  const valorStr = value.toString().trim();
                  if (valorStr) {
                    payload.categoria = valorStr;
                    break;
                  }
                }
              }
            }
          }
          
          // IMPORTANTE: Buscar subcategoría de forma más agresiva si no se encontró
          if (!payload.subcategoria || !payload.subcategoria.trim()) {
            // Buscar la subcategoría en el archivo de forma más agresiva
            for (const [key, value] of Object.entries(row)) {
              if (key && value !== undefined && value !== null) {
                const keyLower = key.toLowerCase().trim();
                // Buscar columnas que contengan "subcategoría" o "subcategoria"
                if (keyLower.includes("subcategoría") || keyLower.includes("subcategoria") || keyLower === "subcategory") {
                  const valorStr = value.toString().trim();
                  if (valorStr) {
                    payload.subcategoria = valorStr;
                    break;
                  }
                }
              }
            }
          }
          
          // IMPORTANTE: Buscar presentación de forma más agresiva si no se encontró
          if (!payload.presentacion || !payload.presentacion.trim()) {
            // Buscar la presentación en el archivo de forma más agresiva
            for (const [key, value] of Object.entries(row)) {
              if (key && value !== undefined && value !== null) {
                const keyLower = key.toLowerCase().trim();
                // Buscar columnas que contengan "presentación" o "presentacion"
                if (keyLower.includes("presentación") || keyLower.includes("presentacion") || keyLower === "presentation") {
                  const valorStr = value.toString().trim();
                  if (valorStr) {
                    payload.presentacion = valorStr;
                    break;
                  }
                }
              }
            }
          }
          
          // Debug: Log para productos con categoría/subcategoría de importación
          if (payload.categoria && (payload.categoria.toLowerCase().includes("importación") || payload.categoria.toLowerCase().includes("importacion"))) {
          }

          // IMPORTANTE: Asignar inventario_id al inventario activo
          payload.inventario_id = inventarioActivo || 1;

          // Buscar si el producto ya existe
          const productoExistente = inventario.find(p => p.codigo === payload.codigo);

          if (productoExistente) {
            if (opcionImportar === "crear") {
              // Saltar si solo crear nuevos
              procesados++;
              setProgresoImportacion({ actual: procesados, total: datosImportar.length, exitosos, errores });
              continue;
            }
            
            // Actualizar producto existente
            await authFetch(`${SERVER_URL}/inventario/${productoExistente.id}`, {
              method: "PUT",
              body: JSON.stringify(payload),
            });
          } else {
            if (opcionImportar === "actualizar") {
              // Saltar si solo actualizar
              procesados++;
              setProgresoImportacion({ actual: procesados, total: datosImportar.length, exitosos, errores });
              continue;
            }
            
            // Crear nuevo producto
            await authFetch(`${SERVER_URL}/inventario`, {
              method: "POST",
              body: JSON.stringify(payload),
            });
          }

          exitosos++;
          procesados++;
          // Actualizar progreso después de procesar cada producto
          setProgresoImportacion({ actual: procesados, total: datosImportar.length, exitosos, errores });
          
          // Pequeña pausa para permitir que React actualice la UI
          if (procesados % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        } catch (err) {
          errores++;
          procesados++;
          erroresDetalle.push(`Error procesando producto: ${err.message}`);
          // Actualizar progreso incluso si hay error
          setProgresoImportacion({ actual: procesados, total: datosImportar.length, exitosos, errores });
          
          // Pequeña pausa para permitir que React actualice la UI
          if (procesados % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }
      }

      // Actualizar progreso final
      setProgresoImportacion({ actual: datosImportar.length, total: datosImportar.length, exitosos, errores });

      // Esperar un momento para que el usuario vea el progreso completo
      await new Promise(resolve => setTimeout(resolve, 500));

      // Cerrar modal y recargar inventario
      setImportando(false);
      setShowModalImportar(false);
      setArchivoImportar(null);
      setDatosImportar([]);
      setColumnasArchivo([]);
      setColumnasNuevas([]);
      setMapeoColumnas({});
      setVistaPrevia([]);
      setErroresValidacion([]);
      setProgresoImportacion({ actual: 0, total: 0, exitosos: 0, errores: 0 });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      // Recargar productos del inventario activo
      if (inventarioActivo) {
        const productosData = await authFetch(`${SERVER_URL}/inventario/inventarios/${inventarioActivo}/productos`);
        if (Array.isArray(productosData)) {
          setInventario(filtrarProductosPorInventario(productosData));
        }
      }
      
      pushToast(
        `✅ Importación completada: ${exitosos} productos procesados${errores > 0 ? `, ${errores} errores` : ""}`,
        exitosos > 0 ? "ok" : "err"
      );

      if (erroresDetalle.length > 0) {
        console.error("Errores de importación:", erroresDetalle);
      }
    } catch (err) {
      console.error("Error en importación:", err);
      setImportando(false);
      setProgresoImportacion({ actual: 0, total: 0, exitosos: 0, errores: 0 });
      pushToast("❌ Error al importar: " + err.message, "err");
    }
  }

  // Función para imprimir QR Code (PDA/Android - Bluetooth automático)
  async function imprimirCodigo(codigo) {
    if (!codigo) {
      pushToast("❌ No hay código para imprimir", "err");
      return;
    }

    // ZPL para QR Code de 4x4 cm
    // ^XA = Inicio de etiqueta
    // ^FO100,50 = Field Origin (posición X=100, Y=50)
    // ^BQN,2,8 = QR Code Normal, modelo 2, módulo 8 (tamaño)
    //   Modelo 2 = versión del código QR (más común)
    //   Módulo 8 = tamaño del módulo (ajustable, 8 es aproximadamente 4x4 cm)
    // ^FD = Field Data (datos del QR)
    //   A = modo de codificación automático
    //   ,${codigo} = el código a codificar
    // ^FS = Field Separator (fin del campo)
    // ^FO100,320 = Posición del texto debajo del QR
    // ^A0N,30,30 = Font A, orientación normal, altura 30, ancho 30
    // ^FD${codigo}^FS = Texto del código
    // ^XZ = Fin de etiqueta
    // CPCL basado en la estructura de ZPL que no causaba desconexiones
    // ZPL usaba formato limpio sin comandos problemáticos
    // Aplicando mismo principio a CPCL: formato simple, sin PRINT al final
    // El comando PRINT puede ser lo que causa la desconexión
    const zpl = `! 0 200 200 600 1
B QR 50 100 M 2 U 6
MA,${codigo}
ENDQR
T 4 0 10 350 ${codigo}
`;

    // Detectar si es Android PDA
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isAndroidNative = false;
    const isSecureContext = window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const hasWebBluetooth = typeof navigator !== 'undefined' && navigator.bluetooth && typeof navigator.bluetooth.requestDevice === 'function';

    // Si estás en HTTP (IP) en Android (pero NO en Android nativo), intentar métodos alternativos
    // Web Bluetooth NO funciona sin HTTPS, pero podemos intentar otras formas
    // En Android nativo, el plugin de Capacitor tiene prioridad
    if (isAndroid && !isSecureContext && !isAndroidNative) {
      // MÉTODO 1: Intentar Web Share API para compartir directamente con apps de impresión
      if (navigator.share && navigator.canShare) {
        try {
          const blob = new Blob([zpl], { type: 'application/octet-stream' });
          const file = new File([blob], `QR_${codigo}.cpcl`, { type: 'application/octet-stream' });
          
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `QR Code ${codigo}`,
              text: 'Imprimir código QR en ZQ210'
            });
            pushToast("✅ Archivo compartido. Selecciona tu app de impresión (PrintShare, Bluetooth Printer, etc.)", "ok");
            return;
          }
        } catch (e) {
          if (e.name !== 'AbortError') {
          } else {
            return; // Usuario canceló
          }
        }
      }

      // MÉTODO 2: Descargar archivo CPCL (siempre funciona)
      try {
        // Asegurar que el contenido tenga formato correcto para Printer Setup
        // Limpiar espacios y agregar salto de línea final
        const contenidoLimpio = zpl.trim() + '\n';
        
        // Crear blob como texto plano UTF-8 (compatible con ASCII)
        const blob = new Blob([contenidoLimpio], { 
          type: 'text/plain;charset=utf-8'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `QR_${codigo}.cpcl`; // Extensión .cpcl para archivos CPCL
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
        
        pushToast("📥 Archivo .cpcl descargado. Ábrelo con Printer Setup y envíalo a la impresora.", "info");
        return;
      } catch (e) {
        pushToast("❌ Error al descargar archivo. Intenta nuevamente.", "err");
        return;
      }
    }

    // PRIORIDAD 3: Intentar con Web Bluetooth API (solo si está en HTTPS o localhost y NO es Android nativo)
    // En Android nativo, el plugin de Capacitor tiene prioridad
    if (!isAndroidNative && hasWebBluetooth && isSecureContext) {
      try {
        await imprimirViaWebBluetooth(zpl);
        pushToast("✅ QR Code enviado a ZQ210 vía Bluetooth", "ok");
        return;
      } catch (e) {
        // Si el usuario cancela la selección, no mostrar error
        if (e.message && (e.message.includes("cancelled") || e.message.includes("canceled") || e.message.includes("No device selected"))) {
          return;
        }
        // Continuar con otros métodos
      }
    }

    // PRIORIDAD 2: Descargar archivo ZPL directamente (fallback para Android sin HTTPS)
    // Esta es la solución más confiable cuando Web Bluetooth no está disponible
    if (isAndroid) {
      try {
        // Crear archivo CPCL y descargarlo con extensión correcta
        const blob = new Blob([zpl], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `QR_${codigo}.cpcl`; // Extensión .cpcl para archivos CPCL
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        
        // Limpiar después de un breve delay
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
        
        pushToast("📥 Archivo .cpcl descargado. Ábrelo con Printer Setup y envíalo a la impresora.", "info");
        return;
      } catch (e) {
        pushToast("❌ Error al descargar archivo. Intenta nuevamente.", "err");
      }
    }

    // PRIORIDAD 1 (Android Nativo): Usar plugin de Capacitor AndroidPrinter
    if (isAndroidNative) {
      try {
        pushToast("🔵 Conectando a impresora ZQ210...", "info");
        const result = await AndroidPrinterPlugin.printToBluetooth({ 
          deviceName: "ZQ210", 
          zpl: zpl 
        });
        
        if (result && result.result && result.result.startsWith("OK")) {
          pushToast("✅ QR Code enviado a ZQ210 vía Bluetooth", "ok");
          return;
        } else {
          // Continuar con otros métodos
        }
      } catch (e) {
        // Continuar con otros métodos
      }
    }

    // PRIORIDAD 2: Intentar con window.AndroidPrinter (compatibilidad legacy)
    if (window.AndroidPrinter && window.AndroidPrinter.printToBluetooth) {
      try {
        const result = await window.AndroidPrinter.printToBluetooth("ZQ210", zpl);
        if (result && result.startsWith("OK")) {
          pushToast("✅ QR Code enviado a ZQ210 vía Bluetooth", "ok");
          return;
        } else {
        }
      } catch (e) {
      }
    }

    // Mensaje final de ayuda
    if (!hasWebBluetooth) {
      if (isAndroid) {
        pushToast("⚠️ Tu navegador no soporta Web Bluetooth. Se descargará el archivo CPCL.", "warn");
        // Intentar descargar como último recurso
        try {
          const blob = new Blob([zpl], { type: 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `QR_${codigo}.cpcl`; // Extensión .cpcl para archivos CPCL
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          pushToast("📥 Archivo .cpcl descargado. Ábrelo con Printer Setup y envíalo a la impresora.", "info");
        } catch (e) {
          console.error("Error descargando archivo:", e);
        }
      } else {
        pushToast("⚠️ Web Bluetooth no está disponible en este navegador. Usa Chrome o Edge.", "warn");
      }
      return;
    }

    if (!isSecureContext) {
      pushToast("⚠️ Web Bluetooth requiere HTTPS. Descargando archivo CPCL como alternativa...", "warn");
      try {
        const blob = new Blob([zpl], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `QR_${codigo}.cpcl`; // Extensión .cpcl para archivos CPCL
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        pushToast("📥 Archivo .cpcl descargado. Ábrelo con Printer Setup y envíalo a la impresora.", "info");
      } catch (e) {
        console.error("Error descargando archivo:", e);
      }
      return;
    }

    pushToast("⚠️ No se pudo conectar a la impresora ZQ210. Asegúrate de que esté emparejada vía Bluetooth.", "warn");
  }

  // Función auxiliar para imprimir vía Web Bluetooth API (funciona en navegador de PDA)
  async function imprimirViaWebBluetooth(zpl) {
    try {
      // Primero intentar buscar la impresora ZQ210 por nombre
      let device;
      
      try {
        // Intentar buscar por nombre exacto o prefijo
        device = await navigator.bluetooth.requestDevice({
          filters: [
            { namePrefix: "ZQ" },
            { namePrefix: "Zebra" },
            { name: "ZQ210" }
          ],
          optionalServices: ['00001101-0000-1000-8000-00805f9b34fb'] // Serial Port Profile
        });
      } catch (err) {
        // Si no encuentra por nombre, intentar por servicio
        try {
          device = await navigator.bluetooth.requestDevice({
            filters: [
              { services: ['00001101-0000-1000-8000-00805f9b34fb'] } // Serial Port Profile
            ],
            optionalServices: ['00001101-0000-1000-8000-00805f9b34fb']
          });
        } catch (err2) {
          throw new Error("No se encontró ninguna impresora Bluetooth. Asegúrate de que la ZQ210 esté encendida y emparejada.");
        }
      }

      if (!device) {
        throw new Error("No se seleccionó ningún dispositivo");
      }

      pushToast("🔵 Conectando a " + (device.name || "impresora") + "...", "info");

      // Conectar al dispositivo
      const server = await device.gatt.connect();
      
      // Obtener el servicio Serial Port Profile
      const service = await server.getPrimaryService('00001101-0000-1000-8000-00805f9b34fb');
      
      // Obtener la característica para escribir datos
      const characteristic = await service.getCharacteristic('00001102-0000-1000-8000-00805f9b34fb');
      
      pushToast("📤 Enviando QR Code...", "info");
      
      // Convertir ZPL a bytes y enviar
      const encoder = new TextEncoder();
      const data = encoder.encode(zpl);
      
      // Enviar en chunks si es muy grande (algunas impresoras tienen límites)
      const chunkSize = 100;
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        await characteristic.writeValue(chunk);
        // Pequeña pausa entre chunks
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Desconectar
      device.gatt.disconnect();
      
    } catch (error) {
      if (error.message && (error.message.includes("cancelled") || error.message.includes("canceled") || error.message.includes("No device selected"))) {
        throw error; // Re-lanzar para que el código superior lo maneje
      }
      throw new Error("Error en Web Bluetooth: " + (error.message || error.toString()));
    }
  }


  // Eliminado: mostrar_en_pagina y switches relacionados

  const invFiltrado = useMemo(() => {
    // BARRERA DE SEGURIDAD: Filtrar SOLO productos del inventario activo
    const inventarioFiltrado = inventario.filter(p => {
      const productoInventarioId = p.inventario_id || p.inventarioId || 1;
      return productoInventarioId === inventarioActivo;
    });

    // Filtrar por agotados si está activo
    const inventarioFiltradoPorAgotados = mostrarSoloAgotados
      ? inventarioFiltrado.filter(p => Number(p.activo ?? 1) === 0)
      : inventarioFiltrado;

    const q = invQuery.trim().toLowerCase();

    const base = q
      ? inventarioFiltradoPorAgotados.filter(
          (p) =>
            (p.nombre || "").toLowerCase().includes(q) ||
            (p.presentacion || "").toLowerCase().includes(q) ||
            (p.codigo || "").toLowerCase().includes(q) ||
            (p.categoria || "").toLowerCase().includes(q) ||
            (p.subcategoria || "").toLowerCase().includes(q)
        )
      : inventarioFiltradoPorAgotados.slice();

    const grupos = {};

    for (const p of base) {
      const cat = p.categoria?.trim() || "Sin categoría";
      const sub = p.subcategoria?.trim() || "__NO_SUB__";

      if (!grupos[cat]) grupos[cat] = {};
      if (!grupos[cat][sub]) grupos[cat][sub] = [];

      grupos[cat][sub].push(p);
    }

    return {
      cats: Object.keys(grupos).sort((a, b) => a.localeCompare(b, "es")),
      grupos,
    };

  }, [inventario, invQuery, inventarioActivo, mostrarSoloAgotados]);

  const abrirAddInv = () => {
    const codigoInicial = invQuery.trim();
    setFormInv({
      codigo: codigoInicial || "",
      nombre: "",
      presentacion: "",
      categoria: Object.keys(CATS_SAFE)[0],
      subcategoria: "",
      lote: "",
      piezasPorCaja: "",
      descripcion: "",
      precio: "",
      precio_compra: "",
      proveedor: "",
      marca: "",
      codigo_barras: "",
      sku: "",
      stock_minimo: "",
      stock_maximo: "",
      ubicacion: "",
      unidad_medida: "",
      peso: "",
      dimensiones: "",
      fecha_vencimiento: "",
    });
    setShowAddInv(true);
  };

  // Función para activar mostrar_en_pagina solo para productos con piezas disponibles

  return (
    <>
    <div className="card inventario-card">
      {/* HEADER: Clases agregadas, style eliminado */}
      <div className="inventario-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: "15px" }}>
          <h2 className="header-title">
            {(() => {
              if (!inventarioActivo || inventarios.length === 0) return "Inventario";
              const inv = inventarios.find((i) => i.id === inventarioActivo);
              if (!inv) return "Inventario";
              // Mostrar alias si existe, de lo contrario el nombre
              const etiqueta = inv.alias?.trim() ? inv.alias.trim() : (inv.nombre || "Inventario");
              return `Inventario - ${etiqueta}`;
            })()}
          </h2>
          
          {/* Menú de botones en esquina superior derecha */}
          <div style={{ position: "relative", display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              onClick={() => setShowMenuBotones(!showMenuBotones)}
              style={{
                padding: "8px 16px",
                background: "var(--azul-primario, #3b82f6)",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "0.9rem",
                fontWeight: "500",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              ⚙️ Menú
              {showMenuBotones ? " ▲" : " ▼"}
            </button>
            
            {showMenuBotones && (
              <div style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: "8px",
                background: "var(--fondo-card)",
                border: "1px solid var(--borde-sutil)",
                borderRadius: "8px",
                boxShadow: "var(--sombra-md)",
                padding: "8px",
                zIndex: 1000,
                minWidth: "200px",
                display: "flex",
                flexDirection: "column",
                gap: "4px"
              }}>
                <button
                  className="btn-generar-doc"
                  onClick={() => {
                    descargarQRsIndividuales();
                    setShowMenuBotones(false);
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "var(--color-secundario, #1e40af)",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                    fontWeight: "500",
                    textAlign: "left"
                  }}
                >
                  📤 Descargar QRs
                </button>
                <button
                  className="btn-generar-doc"
                  onClick={() => {
                    generarDocumentoCompleto();
                    setShowMenuBotones(false);
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "var(--color-primario, #3b82f6)",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                    fontWeight: "500",
                    textAlign: "left"
                  }}
                >
                  📄 Generar Documento
                </button>
                <button
                  className="btn-generar-doc"
                  onClick={() => {
                    exportarInventario();
                    setShowMenuBotones(false);
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "var(--color-success, #10b981)",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                    fontWeight: "500",
                    textAlign: "left"
                  }}
                >
                  📥 Exportar Inventario
                </button>
                <button
                  className="btn-generar-doc"
                  onClick={() => {
                    setShowModalImportar(true);
                    setShowMenuBotones(false);
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "var(--color-warning, #f59e0b)",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                    fontWeight: "500",
                    textAlign: "left"
                  }}
                >
                  📤 Importar Inventario
                </button>
                {can("inventario.crear_inventario") && (
                  <button
                    onClick={() => {
                      setShowModalNuevoInventario(true);
                      setShowMenuBotones(false);
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "var(--azul-secundario, #2563eb)",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "0.9rem",
                      fontWeight: "500",
                      textAlign: "left",
                      marginTop: "4px"
                    }}
                  >
                    ➕ Agregar Inventario
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Pestañas de inventarios */}
        {inventarios.length > 0 && (
          <div style={{
            display: "flex",
            gap: "8px",
            marginBottom: "15px",
            flexWrap: "wrap",
            borderBottom: "2px solid var(--borde-sutil)",
            paddingBottom: "8px"
          }}>
            {inventarios.map((inv) => (
              <div
                key={inv.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  position: "relative"
                }}
              >
                <button
                  onClick={() => setInventarioActivo(inv.id)}
                  style={{
                    padding: "8px 16px",
                    background: inventarioActivo === inv.id ? "transparent" : "var(--fondo-input)",
                    color: "var(--texto-principal)",
                    border: `2px solid ${inventarioActivo === inv.id ? "var(--borde-visible)" : "var(--borde-sutil)"}`,
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                    fontWeight: inventarioActivo === inv.id ? "600" : "500",
                    transition: "all 0.2s ease"
                  }}
                >
                  {inv.nombre}{inv.alias ? ` - ${inv.alias}` : ""}
                </button>
                {can("inventario.crear_inventario") && inventarios.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setInventarioAEliminar(inv);
                      setShowModalEliminarInventario(true);
                    }}
                    style={{
                      padding: "4px 8px",
                      background: "transparent",
                      color: "var(--color-danger, #ef4444)",
                      border: "1px solid var(--color-danger, #ef4444)",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: "24px",
                      height: "24px"
                    }}
                    title="Eliminar inventario"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Contadores de productos y piezas */}
        <div style={{ 
          display: "flex", 
          gap: "20px", 
          marginBottom: "15px",
          padding: "10px 15px",
          background: "var(--fondo-card, #ffffff)",
          borderRadius: "8px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "0.9rem", color: "var(--texto-secundario, #666)", fontWeight: "500" }}>
              Total Productos:
            </span>
            <span style={{ fontSize: "1.1rem", color: "var(--color-primario, #3b82f6)", fontWeight: "600" }}>
              {filtrarProductosPorInventario(inventario).length}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "0.9rem", color: "var(--texto-secundario, #666)", fontWeight: "500" }}>
              Total Piezas:
            </span>
            <span style={{ fontSize: "1.1rem", color: "var(--color-success, #10b981)", fontWeight: "600" }}>
              {filtrarProductosPorInventario(inventario).reduce((sum, p) => sum + (p.total_piezas_general || 0), 0).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Switches discretos y estéticos */}



        <div className="search-container" style={{ display: 'flex', gap: '10px', alignItems: 'center', position: 'relative' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              className="search-input"
              placeholder="Buscar (código, nombre, presentación, categoría o subcategoría)"
              value={invQuery}
              onChange={(e) => setInvQuery(e.target.value)}
              style={{ width: '100%', paddingRight: '2em' }}
            />
            {!!invQuery && (
              <span
                onClick={() => setInvQuery("")}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  cursor: 'pointer',
                  fontSize: '1.3em',
                  color: '#888',
                  zIndex: 2
                }}
                title="Limpiar búsqueda"
              >
                ×
              </span>
            )}
          </div>
          <button
            onClick={() => setMostrarSoloAgotados(!mostrarSoloAgotados)}
            style={{
              padding: '10px 16px',
              background: mostrarSoloAgotados ? '#ef4444' : 'var(--fondo-input)',
              color: mostrarSoloAgotados ? '#fff' : 'var(--texto-principal)',
              border: `1px solid ${mostrarSoloAgotados ? '#ef4444' : 'var(--borde-medio)'}`,
              borderRadius: 'var(--radio-full)',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: '500',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s ease'
            }}
            title={mostrarSoloAgotados ? "Mostrar todos los productos" : "Mostrar solo productos agotados"}
          >
            {mostrarSoloAgotados ? '✅ Agotados' : '⚠️ Agotados'}
          </button>
        </div>

        <button className="btn-add" onClick={abrirAddInv}>
          +
        </button>
      </div>

      {/* TABLA: Scroll horizontal arriba sincronizado */}
      <div ref={scrollArribaRef} style={{overflowX: 'auto', width: '100%', marginBottom: 4}}>
        <div style={{width: 2000, height: 1}}></div>
      </div>
      <div className="tabla-container" ref={tablaContainerRef} style={{overflowX: 'auto'}}>
        {invFiltrado.cats.length === 0 ? (
          <p className="empty-msg">
            {inventario.length === 0
              ? "Aún no hay productos."
              : "Sin resultados."}
          </p>
        ) : (
          invFiltrado.cats.map((cat) => (
            <div key={cat} className="categoria-block">
              <h3>{cat}</h3>

              {Object.keys(invFiltrado.grupos[cat]).map((sub) => (
                <div key={sub} className="subcategoria-block">
                  {sub !== "__NO_SUB__" && (
                    <h4 className="subcategoria-title">
                      {sub} ({invFiltrado.grupos[cat][sub].length})
                    </h4>
                  )}

                  <table>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "center" }}>Activo</th>
                        <th>Print</th>
                        <th>Código</th>
                        <th>Nombre</th>
                        <th>Presentación</th>
                        <th>Categoría</th>
                        <th>Pzs/Caja</th>
                        <th>Lote</th>
                        <th style={{ textAlign: "center" }}>Pzs Lote Activo</th>
                        <th style={{ textAlign: "center" }}>Total Pzs General</th>
                        {/* <th style={{ textAlign: "center" }}>Mostrar</th> */}
                        <th>Códigos</th>
                        <th>Editar</th>
                        <th>Borrar</th>
                      </tr>
                    </thead>

                    <tbody>
                      {invFiltrado.grupos[cat][sub].map((p) => (
                        <tr key={p.id}>
                          <td style={{ textAlign: "center" }}>
                            <label className="switch" style={{ opacity: !can("inventario.activar_productos") ? 0.5 : 1, display: "inline-flex", cursor: can("inventario.activar_productos") ? "pointer" : "not-allowed" }}>
                              <input
                                type="checkbox"
                                checked={Number(p.activo ?? 1) === 1}
                                onChange={async (e) => {
                                  const nuevoEstado = e.target.checked;
                                  if (!can("inventario.activar_productos")) {
                                    pushToast("⚠️ No tienes autorización para activar/desactivar productos", "warn");
                                    return;
                                  }
                                  try {
                                    await authFetch(`${SERVER_URL}/inventario/${p.id}`, {
                                      method: "PUT",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                      body: JSON.stringify({
                                        activo: nuevoEstado
                                      }),
                                    });
                                    
                                    // Actualizar estado local SIN recargar (evita salto de scroll)
                                    setInventario(prev => prev.map(prod => 
                                      prod.id === p.id 
                                        ? { ...prod, activo: nuevoEstado ? 1 : 0 }
                                        : prod
                                    ));
                                    
                                    // Toast verde si se activa, rojo si se desactiva
                                    pushToast(
                                      nuevoEstado 
                                        ? "✅ Producto activado" 
                                        : "⚠️ Producto desactivado (agotado)",
                                      nuevoEstado ? "ok" : "err"
                                    );
                                  } catch (err) {
                                    console.error("Error actualizando activo:", err);
                                    pushToast("❌ Error actualizando", "err");
                                  }
                                }}
                                disabled={!can("inventario.activar_productos")}
                                title={!can("inventario.activar_productos") ? "No tienes autorización para activar/desactivar productos" : (Number(p.activo ?? 1) === 1 ? "Desactivar producto" : "Activar producto")}
                              />
                              <span className="slider"></span>
                            </label>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: "5px", justifyContent: "center" }}>
                              <button
                                className="btn-print"
                                onClick={() => imprimirCodigo(p.codigo)}
                                title="Imprimir QR"
                              >
                                🖨️
                              </button>
                              <button
                                className="btn-print"
                                onClick={() => abrirCompartir(p)}
                                title="Compartir producto"
                                style={{
                                  background: "var(--color-success, #10b981)",
                                }}
                              >
                                📤
                              </button>
                            </div>
                          </td>

                          <td>
                            <button
                              type="button"
                              className="codigo-qr-btn"
                              onClick={() => abrirQrModal(p.codigo, p.nombre, p.presentacion)}
                              title="Ver QR del producto"
                            >
                              {p.codigo}
                            </button>
                          </td>
                          <td 
                            onClick={async () => {
                              if (inventarios.length > 1) {
                                setProductoTransferir(p);
                                // Cargar lotes del producto
                                try {
                        const lotes = await authFetch(`${SERVER_URL}/inventario/lotes/${p.codigo}/completo?inventario_id=${inventarioActivo}`);
                                  setLotesProductoTransferir(Array.isArray(lotes) ? lotes : []);
                                } catch (err) {
                                  console.error("Error cargando lotes:", err);
                                  setLotesProductoTransferir([]);
                                }
                                setInventarioDestinoSeleccionado(null);
                                setLotesSeleccionados({});
                                setShowMenuTransferir(true);
                              }
                            }}
                            style={{
                              cursor: inventarios.length > 1 ? "pointer" : "default",
                              color: inventarios.length > 1 ? "var(--azul-primario, #3b82f6)" : "inherit",
                              textDecoration: inventarios.length > 1 ? "underline" : "none",
                              fontWeight: inventarios.length > 1 ? "600" : "normal"
                            }}
                            title={inventarios.length > 1 ? "Clic para transferir producto a otro inventario" : ""}
                          >
                            {p.nombre}
                          </td>
                          <td>{p.presentacion || "-"}</td>
                          <td>{p.categoria}</td>
                          <td>{p.piezas_por_caja || "-"}</td>

                          <td>
                            <div 
                              className="lote-display-cell"
                              onClick={async () => {
                                // Abrir modal de editar y cambiar a pestaña de lotes
                                setEditInv({
                                  id: p.id,
                                  codigo: p.codigo,
                                  nombre: p.nombre || "",
                                  presentacion: p.presentacion || "",
                                  categoria: p.categoria || "",
                                  subcategoria: p.subcategoria || "",
                                  lote: p.lote || "",
                                  nuevoLote: "",
                                  descripcion: p.descripcion || "",
                                  precio: p.precio || "",
                                  precio_compra: p.precio_compra || "",
                                  proveedor: p.proveedor || "",
                                  marca: p.marca || "",
                                  codigo_barras: p.codigo_barras || "",
                                  sku: p.sku || "",
                                  stock_minimo: p.stock_minimo || "",
                                  stock_maximo: p.stock_maximo || "",
                                  ubicacion: p.ubicacion || "",
                                  unidad_medida: p.unidad_medida || "",
                                  peso: p.peso || "",
                                  dimensiones: p.dimensiones || "",
                                  fecha_vencimiento: p.fecha_vencimiento || "",
                                  activo: p.activo !== undefined ? p.activo : true,
                                  inventario_id: p.inventario_id || inventarioActivo || 1,
                                });

                                setPiezasActual(
                                  p.piezas_por_caja > 0
                                    ? p.piezas_por_caja.toString()
                                    : ""
                                );

                                // Cambiar directamente a la pestaña de lotes
                                setTabActivaModal("lotes");
                                setFotosProducto([]);
                                setImagenPrincipal(null);
                                setNuevoLote({ lote: "", cantidad_piezas: "", laboratorio: "", caducidad: "" });
                                setLotesProducto([]);
                                setShowEditInv(true);
                                
                                // Cargar lotes del servidor automáticamente
                                await cargarLotesDelProducto(p.codigo, inventarioActivo);
                              }}
                              style={{ cursor: "pointer", userSelect: "none" }}
                              title="Clic para ver/editar lotes"
                            >
                              {p.lote || "- Sin lote -"}
                            </div>
                          </td>
                          <td style={{ textAlign: "center", fontWeight: "600", color: "var(--color-primario, #3b82f6)", fontSize: "0.95rem" }}>
                            {p.piezas_lote_activo || 0}
                          </td>
                          <td style={{ textAlign: "center", fontWeight: "600", color: "var(--texto-principal, #333)", fontSize: "0.95rem" }}>
                            {p.total_piezas_general || 0}
                          </td>

                          {/* <td style={{ textAlign: "center" }}>Mostrar switch</td> */}

                          <td>
                            <button
                              className="btn-codigos"
                              onClick={async () => {
                                try {
                                  setCodigoEditando(p);
                                  const list = await authFetch(
                                    `${SERVER_URL}/inventario/codigos/${p.codigo}`
                                  );
                                  setCodigosProd(Array.isArray(list) ? list : []);
                                  setModalCodigos(true);
                                } catch (err) {
                                  // Si el producto no tiene códigos alternos, mostrar array vacío
                                  if (err.isNotFound || err.message?.includes('404')) {
                                    setCodigosProd([]);
                                    setModalCodigos(true);
                                  } else {
                                    console.error('Error cargando códigos alternos:', err);
                                    pushToast('⚠️ Error cargando códigos alternos', 'err');
                                  }
                                }
                              }}
                            >
                              🔢
                            </button>
                          </td>

                          <td>
                            <button
                              className="btn-editar"
                              onClick={() => {
                                setEditInv({
                                  id: p.id,
                                  codigo: p.codigo,
                                  nombre: p.nombre,
                                  presentacion: p.presentacion || "",
                                  categoria: p.categoria || Object.keys(CATS_SAFE)[0],
                                  subcategoria: p.subcategoria || "",
                                  lote: p.lote || "",
                                  nuevoLote: "",
                                  descripcion: p.descripcion || "",
                                  precio: p.precio || "",
                                  precio_compra: p.precio_compra || "",
                                  proveedor: p.proveedor || "",
                                  marca: p.marca || "",
                                  codigo_barras: p.codigo_barras || "",
                                  sku: p.sku || "",
                                  stock_minimo: p.stock_minimo || "",
                                  stock_maximo: p.stock_maximo || "",
                                  ubicacion: p.ubicacion || "",
                                  unidad_medida: p.unidad_medida || "",
                                  peso: p.peso || "",
                                  dimensiones: p.dimensiones || "",
                                  fecha_vencimiento: p.fecha_vencimiento || "",
                                  activo: p.activo !== undefined ? p.activo : true,
                                  inventario_id: p.inventario_id || inventarioActivo || 1,
                                });

                                setPiezasActual(
                                  p.piezas_por_caja > 0
                                    ? p.piezas_por_caja.toString()
                                    : ""
                                );

                                setTabActivaModal("informacion");
                                setFotosProducto([]);
                                setImagenPrincipal(null);
                                setNuevoLote({ lote: "", cantidad_piezas: "", laboratorio: "" });
                                setLotesProducto([]); // Inicializar vacío, se cargarán del servidor
                                setShowEditInv(true);
                                
                                // Cargar lotes del servidor automáticamente
                                cargarLotesDelProducto(p.codigo, inventarioActivo);
                              }}
                            >
                              Editar
                            </button>
                          </td>

                          <td>
                            <button
                              className="btn-borrar"
                              onClick={async () => {
                                const confirmado = await showConfirm("¿Borrar producto?", "Confirmar eliminación");
                                if (!confirmado) return;
                                try {
                                  await authFetch(`${SERVER_URL}/inventario/${p.id}`, {
                                    method: "DELETE",
                                  });
                                  // Eliminar del estado local SIN recargar (evita salto de scroll)
                                  setInventario(prev => prev.filter(prod => prod.id !== p.id));
                                  pushToast?.("✅ Producto eliminado", "ok");
                                } catch (err) {
                                  pushToast?.("❌ Error eliminando producto: " + err.message, "err");
                                }
                              }}
                            >
                              Borrar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* ========== MODAL Piezas por Caja ========== */}
      {modalPiezas && pendientesPiezas.length > 0 && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (pendientesPiezas.length === 0) setModalPiezas(false);
          }}
        >
          <div
            className="modal-content"
            style={{
              borderRadius: 14,
              maxWidth: 520,
              width: '100%',
              minWidth: 340,
              padding: '36px 32px',
              boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
              background: '#f9fafc',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 20
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const prod = pendientesPiezas[indexPendiente];

              return (
                <>
                  <h3>Capturar piezas por caja</h3>

                  <p className="modal-subtitle">
                    Producto {indexPendiente + 1} de {pendientesPiezas.length}
                  </p>

                  <div className="product-summary-box">
                    <div>
                      <strong>{obtenerNombreCompleto(prod?.nombre, prod?.presentacion)}</strong>
                    </div>
                    <div>Código: {prod?.codigo}</div>
                    <div>Categoría: {prod?.categoria}</div>
                    <div>Lote actual: {prod?.lote || "-"}</div>
                  </div>

                  <input
                    type="number"
                    min="1"
                    placeholder="Piezas por caja"
                    value={piezasActual}
                    onChange={(e) => setPiezasActual(e.target.value)}
                  />

                  <div className="modal-actions">
                    <button
                      onClick={async () => {
                        const valor = parseInt(piezasActual, 10);
                        if (!valor || valor <= 0) {
                          showAlert("Ingresa un número válido de piezas.", "warning");
                          return;
                        }

                        try {
                          await authFetch(`${SERVER_URL}/api/inventario/${prod.id}`, {
                            method: "PUT",
                            body: JSON.stringify({
                              codigo: prod.codigo,
                              nombre: prod.nombre,
                              categoria: prod.categoria,
                              subcategoria: prod.subcategoria || "",
                              lote: prod.lote || "",
                              piezas_por_caja: valor,
                            }),
                          });

                          setInventario((prev) =>
                            prev.map((x) =>
                              x.id === prod.id
                                ? { ...x, piezas_por_caja: valor }
                                : x
                            )
                          );

                          const restantes = pendientesPiezas.filter(
                            (x) => x.id !== prod.id
                          );

                          if (restantes.length > 0) {
                            setPendientesPiezas(restantes);
                            setIndexPendiente(0);
                            setPiezasActual("");
                          } else {
                            setModalPiezas(false);
                            setPendientesPiezas([]);
                            setPiezasActual("");
                          }
                        } catch (err) {
                          console.error(err);
                          showAlert("Error al guardar piezas por caja.", "error");
                        }
                      }}
                    >
                      Guardar
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ========== MODAL QR Producto ========== */}
      {qrModalOpen && (
        <div className="modal-overlay" onClick={cerrarQrModal}>
          <div className="modal-content modal-qr" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>QR del producto</h3>
              <button className="modal-close" onClick={cerrarQrModal}>
                ×
              </button>
            </div>
            <div className="modal-body modal-qr-body">
              <div className="modal-qr-box">
                {qrModalLoading ? (
                  <div className="modal-qr-loading">Generando QR…</div>
                ) : qrModalUrl ? (
                  <img src={qrModalUrl} alt={`QR ${qrModalCodigo}`} />
                ) : (
                  <div className="modal-qr-error">No se pudo cargar el QR</div>
                )}
              </div>
              <div className="modal-qr-info">
                <div className="modal-qr-codigo">{qrModalCodigo}</div>
                {qrModalNombre && <div className="modal-qr-nombre">{qrModalNombre}</div>}
              </div>
              {qrModalUrl && (
                <button
                  className="btn-primary"
                  onClick={async () => {
                    try {
                      // Crear canvas con QR, código y nombre
                      const img = new Image();
                      img.crossOrigin = "anonymous";
                      
                      await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                        img.src = qrModalUrl;
                      });
                      
                      const canvas = document.createElement("canvas");
                      const qrSize = 400;
                      const paddingBottom = 180; // Espacio extra para nombre (2 líneas) y presentación
                      const borderRadius = 20; // Bordes redondeados
                      canvas.width = qrSize;
                      canvas.height = qrSize + paddingBottom;
                      const ctx = canvas.getContext("2d");
                      
                      // Función helper para dibujar rectángulo redondeado
                      const drawRoundedRect = (x, y, width, height, radius) => {
                        ctx.beginPath();
                        ctx.moveTo(x + radius, y);
                        ctx.lineTo(x + width - radius, y);
                        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
                        ctx.lineTo(x + width, y + height - radius);
                        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
                        ctx.lineTo(x + radius, y + height);
                        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
                        ctx.lineTo(x, y + radius);
                        ctx.quadraticCurveTo(x, y, x + radius, y);
                        ctx.closePath();
                      };
                      
                      // Fondo blanco con bordes redondeados
                      ctx.fillStyle = "#FFFFFF";
                      drawRoundedRect(0, 0, canvas.width, canvas.height, borderRadius);
                      ctx.fill();
                      
                      // Dibujar QR con bordes redondeados
                      ctx.save();
                      drawRoundedRect(0, 0, qrSize, qrSize, borderRadius);
                      ctx.clip();
                      ctx.drawImage(img, 0, 0, qrSize, qrSize);
                      ctx.restore();
                      
                      // Agregar nombre del producto debajo del QR (negro, máximo 2 líneas si es necesario)
                      const nombreModal = (qrModalNombre || "").trim();
                      if (nombreModal && nombreModal.length > 0) {
                        ctx.fillStyle = "#000000";
                        ctx.textAlign = "center";
                        
                        const maxWidth = qrSize * 1.15; // Permitir que sea un poco más ancho que el QR
                        let fontSize = 24; // Tamaño inicial más pequeño
                        let text = nombreModal;
                        
                        // Función para dividir texto en líneas
                        const wrapText = (text, maxWidth, fontSize) => {
                          if (!text || text.trim().length === 0) return [];
                          ctx.font = `bold ${fontSize}px Arial, sans-serif`;
                          const words = text.trim().split(' ').filter(w => w.length > 0);
                          if (words.length === 0) return [];
                          const lines = [];
                          let currentLine = words[0] || "";
                          
                          for (let i = 1; i < words.length; i++) {
                            const word = words[i];
                            const testLine = currentLine + ' ' + word;
                            const metrics = ctx.measureText(testLine);
                            
                            if (metrics.width > maxWidth && currentLine.length > 0) {
                              lines.push(currentLine);
                              currentLine = word;
                            } else {
                              currentLine = testLine;
                            }
                          }
                          lines.push(currentLine);
                          return lines;
                        };
                        
                        // Función para verificar que las líneas quepan en el ancho
                        const checkLinesFit = (lines, maxWidth, fontSize) => {
                          ctx.font = `bold ${fontSize}px Arial, sans-serif`;
                          return lines.every(line => ctx.measureText(line).width <= maxWidth);
                        };
                        
                        // Intentar con tamaño inicial
                        let lines = wrapText(text, maxWidth, fontSize);
                        
                        // Si necesita más de 2 líneas, reducir el tamaño de fuente
                        while (lines.length > 2 && fontSize > 14) {
                          fontSize -= 1;
                          lines = wrapText(text, maxWidth, fontSize);
                        }
                        
                        // Si aún necesita más de 2 líneas, forzar a 2 líneas dividiendo por la mitad
                        if (lines.length > 2) {
                          const midPoint = Math.floor(text.length / 2);
                          // Buscar el espacio más cercano al punto medio
                          let splitIndex = midPoint;
                          for (let i = 0; i < text.length; i++) {
                            if (text[i] === ' ' && Math.abs(i - midPoint) < Math.abs(splitIndex - midPoint)) {
                              splitIndex = i;
                            }
                          }
                          lines = [
                            text.substring(0, splitIndex).trim(),
                            text.substring(splitIndex).trim()
                          ];
                        }
                        
                        // Verificar que las líneas quepan, reducir tamaño si es necesario
                        while (!checkLinesFit(lines, maxWidth, fontSize) && fontSize > 14) {
                          fontSize -= 1;
                          ctx.font = `bold ${fontSize}px Arial, sans-serif`;
                          // Re-dividir con el nuevo tamaño si es necesario
                          if (lines.some(line => ctx.measureText(line).width > maxWidth)) {
                            lines = wrapText(text, maxWidth, fontSize);
                            // Si vuelve a ser más de 2 líneas, forzar a 2 de nuevo
                            if (lines.length > 2) {
                              const midPoint = Math.floor(text.length / 2);
                              let splitIndex = midPoint;
                              for (let i = 0; i < text.length; i++) {
                                if (text[i] === ' ' && Math.abs(i - midPoint) < Math.abs(splitIndex - midPoint)) {
                                  splitIndex = i;
                                }
                              }
                              lines = [
                                text.substring(0, splitIndex).trim(),
                                text.substring(splitIndex).trim()
                              ];
                            }
                          }
                        }
                        
                        // Dibujar las líneas del nombre y guardar dónde termina
                        ctx.font = `bold ${fontSize}px Arial, sans-serif`;
                        const lineHeight = fontSize * 1.2;
                        let startY = qrSize + 60;
                        
                        lines.forEach((line, index) => {
                          ctx.fillText(line, qrSize / 2, startY + (index * lineHeight));
                        });
                        
                        // Calcular dónde terminó el nombre para la presentación
                        const nombreEndY = startY + (lines.length * lineHeight);
                        
                        // Agregar presentación debajo del nombre (negro, más pequeño)
                        const presentacionModal = (qrModalPresentacion || "").trim();
                        if (presentacionModal && presentacionModal.length > 0) {
                          try {
                            ctx.fillStyle = "#000000"; // Negro
                            ctx.textAlign = "center";
                            
                            const maxWidth = qrSize * 1.15;
                            let fontSizePres = 28;
                            let text = presentacionModal;
                            
                            // Si la presentación es muy larga, reducir el tamaño
                            ctx.font = `bold ${fontSizePres}px Arial, sans-serif`;
                            while (ctx.measureText(text).width > maxWidth && fontSizePres > 16) {
                              fontSizePres -= 1;
                              ctx.font = `bold ${fontSizePres}px Arial, sans-serif`;
                            }
                            
                            // Posición Y después del nombre con un poco de espacio
                            const presentacionY = nombreEndY + 15;
                            
                            ctx.fillText(text, qrSize / 2, presentacionY);
                          } catch (err) {
                            console.error("Error dibujando presentación en modal:", err);
                          }
                        }
                      } else {
                        // Si no hay nombre, mostrar solo la presentación
                        const presentacionModal = (qrModalPresentacion || "").trim();
                        if (presentacionModal && presentacionModal.length > 0) {
                          try {
                            ctx.fillStyle = "#000000"; // Negro
                            ctx.textAlign = "center";
                            ctx.font = "bold 28px Arial, sans-serif";
                            
                            const maxWidth = qrSize * 1.15;
                            let fontSizePres = 28;
                            let text = presentacionModal;
                            
                            ctx.font = `bold ${fontSizePres}px Arial, sans-serif`;
                            while (ctx.measureText(text).width > maxWidth && fontSizePres > 16) {
                              fontSizePres -= 1;
                              ctx.font = `bold ${fontSizePres}px Arial, sans-serif`;
                            }
                            
                            ctx.fillText(text, qrSize / 2, qrSize + 60);
                          } catch (err) {
                            console.error("Error dibujando presentación sin nombre en modal:", err);
                          }
                        }
                      }
                      
                      // Descargar
                      canvas.toBlob((blob) => {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `QR_${qrModalCodigo}.png`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        pushToast("✅ QR descargado correctamente", "ok");
                      }, "image/png");
                    } catch (err) {
                      console.error("Error generando QR con texto:", err);
                      pushToast("❌ Error al generar QR", "err");
                    }
                  }}
                >
                  Descargar QR
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========== MODAL AGREGAR ========== */}
      {showAddInv && (
        <ModalAgregar 
          formInv={formInv}
          setFormInv={setFormInv}
          CATS_SAFE={CATS_SAFE}
          SERVER_URL={SERVER_URL}
          authFetch={authFetch}
          setInventario={setInventario}
          pushToast={pushToast}
          setShowAddInv={setShowAddInv}
          inventarioActivo={inventarioActivo}
        />
      )}

      {/* ========== MODAL EDITAR ========== */}
      {showEditInv && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content modal-edit-inventario" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Editar producto - {editInv.nombre ? obtenerNombreCompleto(editInv.nombre, editInv.presentacion) : editInv.codigo}</h3>
              <button className="modal-close" onClick={handleCloseModal}>×</button>
            </div>
            
            <div className="modal-tabs">
              <button
                className={`modal-tab ${tabActivaModal === "informacion" ? "active" : ""}`}
                onClick={() => setTabActivaModal("informacion")}
              >
                📋 Información General
              </button>
              <button
                className={`modal-tab ${tabActivaModal === "lotes" ? "active" : ""}`}
                onClick={() => {
                  setTabActivaModal("lotes");
                  // Cargar lotes del servidor cuando se abre la pestaña
                  if (editInv.codigo) {
                    cargarLotesDelProducto(editInv.codigo);
                  }
                }}
              >
                📦 Lotes
              </button>
              <button
                className={`modal-tab ${tabActivaModal === "fotos" ? "active" : ""}`}
                onClick={() => setTabActivaModal("fotos")}
              >
                📸 Fotos
              </button>
            </div>
            
            <div className="modal-body">
              {/* PESTAÑA: INFORMACIÓN GENERAL */}
              {tabActivaModal === "informacion" && (
                <div className="modal-tab-content active">
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Código</label>
                      <input
                        placeholder="Código"
                        value={editInv.codigo}
                        onChange={(e) =>
                          setEditInv({ ...editInv, codigo: e.target.value })
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label>Nombre</label>
                      <input
                        placeholder="Nombre del producto"
                        value={editInv.nombre}
                        onChange={(e) =>
                          setEditInv({ ...editInv, nombre: e.target.value })
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label>Presentación</label>
                      <input
                        placeholder="Presentación del producto (ej: 120 caps, 500ml)"
                        value={editInv.presentacion || ""}
                        onChange={(e) =>
                          setEditInv({ ...editInv, presentacion: e.target.value })
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label>Categoría</label>
                      <select
                        value={editInv.categoria}
                        onChange={(e) =>
                          setEditInv({ ...editInv, categoria: e.target.value })
                        }
                      >
                        {Object.keys(CATS_SAFE).map((opt) => (
                          <option key={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>

                    {CATS_SAFE[editInv.categoria]?.length > 0 && (
                      <div className="form-group">
                        <label>Subcategoría</label>
                        <select
                          value={editInv.subcategoria}
                          onChange={(e) =>
                            setEditInv({
                              ...editInv,
                              subcategoria: e.target.value,
                            })
                          }
                        >
                          <option value="">Seleccione subcategoría</option>
                          {CATS_SAFE[editInv.categoria].map((sub) => (
                            <option key={sub}>{sub}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="form-group">
                      <label>Piezas por caja</label>
                      <input
                        type="number"
                        min="1"
                        placeholder="Piezas por caja"
                        value={piezasActual}
                        onChange={(e) => setPiezasActual(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label>Descripción</label>
                      <textarea
                        placeholder="Descripción del producto"
                        value={editInv.descripcion || ""}
                        onChange={(e) =>
                          setEditInv({ ...editInv, descripcion: e.target.value })
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label>Precio</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={editInv.precio || ""}
                        onChange={(e) =>
                          setEditInv({ ...editInv, precio: e.target.value })
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label>Proveedor</label>
                      <input
                        placeholder="Nombre del proveedor"
                        value={editInv.proveedor || ""}
                        onChange={(e) =>
                          setEditInv({ ...editInv, proveedor: e.target.value })
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label>Marca</label>
                      <input
                        placeholder="Marca del producto"
                        value={editInv.marca || ""}
                        onChange={(e) =>
                          setEditInv({ ...editInv, marca: e.target.value })
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label>Código de barras</label>
                      <input
                        placeholder="Código de barras"
                        value={editInv.codigo_barras || ""}
                        onChange={(e) =>
                          setEditInv({ ...editInv, codigo_barras: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* PESTAÑA: LOTES */}
              {tabActivaModal === "lotes" && (
                <div className="modal-tab-content active">
                  <div style={{ marginBottom: "20px" }}>
                    <h4 style={{ marginBottom: "15px" }}>Gestión de Lotes</h4>
                    {editInv.codigo && (
                      <p style={{ fontSize: "0.85rem", opacity: 0.7, marginBottom: "10px" }}>
                        Código del producto: <strong>{editInv.codigo}</strong> | Lotes cargados: {lotesProducto.length}
                      </p>
                    )}
                    
                    {/* Formulario para agregar nuevo lote */}
                    <div className="form-group" style={{ marginBottom: "20px", padding: "15px", background: "var(--fondo-card)", borderRadius: "8px" }}>
                      <h5 style={{ marginBottom: "10px" }}>Agregar nuevo lote</h5>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: "10px", alignItems: "end" }}>
                        <div>
                          <label>Lote:</label>
                          <input
                            type="text"
                            placeholder="Ej: L001"
                            value={nuevoLote.lote || ""}
                            onChange={(e) => setNuevoLote({ ...nuevoLote, lote: e.target.value || "" })}
                          />
                        </div>
                        <div>
                          <label>Caducidad:</label>
                          <input
                            type="date"
                            value={nuevoLote.caducidad || ""}
                            onChange={(e) => setNuevoLote({ ...nuevoLote, caducidad: e.target.value || "" })}
                          />
                        </div>
                        <div>
                          <label>Laboratorio:</label>
                          <input
                            type="text"
                            placeholder="Laboratorio"
                            value={nuevoLote.laboratorio || ""}
                            onChange={(e) => setNuevoLote({ ...nuevoLote, laboratorio: e.target.value || "" })}
                          />
                        </div>
                        <div>
                          <label>Piezas:</label>
                          <input
                            type="number"
                            placeholder="Cantidad"
                            min="0"
                            value={nuevoLote.cantidad_piezas || ""}
                            onChange={(e) => setNuevoLote({ ...nuevoLote, cantidad_piezas: e.target.value || "" })}
                          />
                        </div>
                        <button
                          className="btn-primary"
                          onClick={async () => {
                            if (!nuevoLote.lote.trim()) {
                              pushToast("❌ Ingresa un lote", "err");
                              return;
                            }
                            
                            try {
                              setCargandoLotes(true);
                              // Guardar el valor del lote antes de resetear
                              const loteAgregado = nuevoLote.lote.trim();
                              const cantidadPiezas = parseInt(nuevoLote.cantidad_piezas) || 0;
                              await authFetch(`${SERVER_URL}/inventario/lotes/${editInv.codigo}/nuevo`, {
                                method: "POST",
                                body: JSON.stringify({
                                  lote: loteAgregado,
                                  cantidad_piezas: cantidadPiezas,
                                  caducidad: (nuevoLote.caducidad && nuevoLote.caducidad.trim()) || null,
                                  laboratorio: (nuevoLote.laboratorio && nuevoLote.laboratorio.trim()) || null,
                                  activo: true, // Al agregar desde aquí, se marca como activo
                                  inventario_id: inventarioActivo || editInv?.inventario_id || 1,
                                }),
                              });
                              
                              pushToast("✅ Lote agregado y marcado como activo", "ok");
                              
                              // Recargar todos los lotes del servidor para asegurar que tenemos los datos correctos
          await cargarLotesDelProducto(editInv.codigo, editInv?.inventario_id || inventarioActivo);
                              
                              // Recargar productos del inventario activo
                              if (inventarioActivo) {
      const productosData = await authFetch(`${SERVER_URL}/inventario/inventarios/${inventarioActivo}/productos`);
      if (Array.isArray(productosData)) {
        setInventario(filtrarProductosPorInventario(productosData));
      }
                              }
                              
                              // Limpiar el formulario
                              setNuevoLote({ lote: "", cantidad_piezas: "", laboratorio: "", caducidad: "" });
                              
                              // Actualizar el lote en editInv usando el valor guardado
                              setEditInv({ ...editInv, lote: loteAgregado });
                              
                              // Asegurarse de que la pestaña de lotes esté activa para ver el nuevo lote
                              setTabActivaModal("lotes");
                            } catch (err) {
                              console.error("Error agregando lote:", err);
                              pushToast("❌ Error al agregar lote: " + (err.message || "Error desconocido"), "err");
                            } finally {
                              setCargandoLotes(false);
                            }
                          }}
                          disabled={cargandoLotes || !nuevoLote.lote.trim()}
                        >
                          {cargandoLotes ? "Guardando..." : "+ Agregar"}
                        </button>
                      </div>
                    </div>

                    {/* Lista de lotes existentes */}
                    <div className="lotes-container">
                      <div className="lotes-header">
                        <h5>Lotes registrados</h5>
                        <span className="lotes-count">{lotesProducto.length} lote{lotesProducto.length !== 1 ? 's' : ''}</span>
                      </div>
                      {lotesProducto.length === 0 ? (
                        <div className="lotes-empty">
                          <div className="empty-icon">📦</div>
                          <p>No hay lotes registrados para este producto</p>
                        </div>
                      ) : (
                        <div className="lotes-table-modern">
                          <table className="lotes-table">
                            <thead>
                              <tr>
                                <th>Lote</th>
                                <th>Activo</th>
                                <th>Cantidad</th>
                                <th>Caducidad</th>
                                <th>Laboratorio</th>
                                <th>Fecha ingreso</th>
                                <th>Acciones</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lotesProducto.map((l) => (
                                <tr key={l.id} className={l.activo === 1 ? 'lote-row-active' : ''}>
                                  <td className="lote-name-cell">
                                    <div className="lote-badge-inline">
                                      <span>{l.lote}</span>
                                    </div>
                                  </td>
                                  <td className="lote-switch-cell">
                                    <label className="switch-lote-row" style={{ opacity: !can("action:activar-productos") ? 0.5 : 1 }}>
                                      <input
                                        type="checkbox"
                                        checked={l.activo === 1 || l.activo === "1" || l.activo === true}
                                        disabled={cargandoLotes || !can("action:activar-productos")}
                                        title={!can("action:activar-productos") ? "No tienes autorización para activar/desactivar lotes" : ""}
                                        onChange={async () => {
                                          // Verificar permiso para activar/desactivar lotes
                                          if (!can("action:activar-productos")) {
                                            pushToast("⚠️ No tienes autorización para activar o desactivar lotes", "warn");
                                            return;
                                          }

                                          try {
                                            setCargandoLotes(true);
                                            // Determinar el nuevo estado: si está activo (1, "1", o true), desactivar; si no, activar
                                            const estaActivo = l.activo === 1 || l.activo === "1" || l.activo === true;
                                            const nuevoEstado = !estaActivo; // Alternar estado
                                            await authFetch(`${SERVER_URL}/inventario/lotes/${editInv.codigo}/${l.id}/activo`, {
                                              method: "PUT",
                                              body: JSON.stringify({ activo: nuevoEstado }),
                                            });
                                            
                                            pushToast(`✅ Lote ${nuevoEstado ? 'activado' : 'desactivado'} correctamente`, "ok");
                                            
                                            // Recargar lotes del servidor para asegurar sincronización
                              await cargarLotesDelProducto(editInv.codigo, editInv?.inventario_id || inventarioActivo);
                                            
                                            // Recargar productos del inventario activo
                                            if (inventarioActivo) {
      const productosData = await authFetch(`${SERVER_URL}/inventario/inventarios/${inventarioActivo}/productos`);
      if (Array.isArray(productosData)) {
        setInventario(filtrarProductosPorInventario(productosData));
      }
                                            }
                                          } catch (err) {
                                            console.error("Error actualizando lote:", err);
                                            const errorMsg = err.message || "Error al actualizar lote";
                                            if (errorMsg.includes("Sin permiso") || errorMsg.includes("403") || errorMsg.includes("No tienes autorización")) {
                                              pushToast("⚠️ No tienes autorización para activar o desactivar lotes", "warn");
                                            } else {
                                              pushToast(`❌ Error al actualizar lote: ${errorMsg}`, "err");
                                            }
                                          } finally {
                                            setCargandoLotes(false);
                                          }
                                        }}
                                      />
                                      <span className="slider-lote-row"></span>
                                    </label>
                                  </td>
                                  <td className="lote-cantidad-cell">
                                    <input
                                      type="number"
                                      min="0"
                                      value={l.cantidad_piezas ?? ""}
                                      onChange={(e) => {
                                        const valor = e.target.value;
                                        // Permitir campo vacío
                                        const nuevaCantidad = valor === "" ? null : Number(valor);
                                        // Actualizar estado local inmediatamente
                                        setLotesProducto(prev => prev.map(item => 
                                          item.id === l.id ? { ...item, cantidad_piezas: nuevaCantidad } : item
                                        ));
                                      }}
                                      onBlur={async (e) => {
                                        const valor = e.target.value.trim();
                                        const nuevaCantidad = valor === "" ? 0 : Number(valor);
                                        
                                        if (isNaN(nuevaCantidad) || nuevaCantidad < 0) {
                                          pushToast("❌ La cantidad debe ser un número válido", "err");
                                          // Restaurar valor original
                                          setLotesProducto(prev => prev.map(item => 
                                            item.id === l.id ? { ...item, cantidad_piezas: l.cantidad_piezas } : item
                                          ));
                                          return;
                                        }
                                        
                                        // Obtener el valor original del lote (el que tenía cuando se cargó)
                                        // Normalizar ambos valores para comparar correctamente
                                        const cantidadOriginal = l.cantidad_piezas ?? 0;
                                        const cantidadOriginalNormalizada = cantidadOriginal === null || cantidadOriginal === undefined ? 0 : Number(cantidadOriginal);
                                        
                                        // Comparar: solo evitar guardar si el valor realmente no cambió
                                        // IMPORTANTE: Siempre permitir guardar cuando el usuario borra el campo (establece a 0)
                                        // porque puede estar confirmando que quiere 0
                                        if (nuevaCantidad === cantidadOriginalNormalizada && cantidadOriginalNormalizada !== 0) {
                                          // Solo saltar si no cambió Y no es 0 (permitir siempre establecer/confirmar 0)
                                          return;
                                        }
                                        
                                        // Si el valor cambió o es 0, siempre guardar
                                        try {
                                          await authFetch(`${SERVER_URL}/inventario/lotes/${editInv.codigo}/${l.id}`, {
                                            method: "PUT",
                                            body: JSON.stringify({
                                              lote: l.lote,
                                              cantidad_piezas: nuevaCantidad,
                                              caducidad: l.caducidad || null,
                                              laboratorio: l.laboratorio || null,
                                              activo: l.activo === 1,
                                              inventario_id: editInv?.inventario_id || inventarioActivo || 1,
                                            }),
                                          });
                                          
                                          // Recargar lotes desde el servidor para asegurar sincronización
                                          await cargarLotesDelProducto(editInv.codigo, editInv?.inventario_id || inventarioActivo);
                                          
                                          // Recargar productos del inventario activo
                                          if (inventarioActivo) {
      const productosData = await authFetch(`${SERVER_URL}/inventario/inventarios/${inventarioActivo}/productos`);
      if (Array.isArray(productosData)) {
        setInventario(filtrarProductosPorInventario(productosData));
      }
                                          }
                                          
                                          pushToast("✅ Cantidad actualizada", "ok");
                                        } catch (err) {
                                          console.error("Error actualizando cantidad:", err);
                                          pushToast("❌ Error al actualizar cantidad", "err");
                                          // Restaurar valor original en caso de error
                                          setLotesProducto(prev => prev.map(item => 
                                            item.id === l.id ? { ...item, cantidad_piezas: l.cantidad_piezas } : item
                                          ));
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.target.blur(); // Disparar onBlur
                                        }
                                      }}
                                      className="input-cantidad-inline"
                                      disabled={cargandoLotes}
                                      style={{ width: '85px', fontSize: '1rem', padding: '7px 10px', fontWeight: '600' }}
                                      placeholder="0"
                                    />
                                  </td>
                                  <td className="lote-caducidad-cell">
                                    <input
                                      type="date"
                                      value={l.caducidad ? l.caducidad.split('T')[0] : ""}
                                      onChange={(e) => {
                                        const nuevaCaducidad = e.target.value;
                                        setLotesProducto(prev => prev.map(item => 
                                          item.id === l.id ? { ...item, caducidad: nuevaCaducidad } : item
                                        ));
                                      }}
                                      onBlur={async (e) => {
                                        const nuevaCaducidad = e.target.value.trim();
                                        const caducidadActual = l.caducidad ? l.caducidad.split('T')[0] : "";
                                        if (nuevaCaducidad === caducidadActual) return;
                                        
                                        try {
                                          await authFetch(`${SERVER_URL}/inventario/lotes/${editInv.codigo}/${l.id}`, {
                                            method: "PUT",
                                            body: JSON.stringify({
                                              lote: l.lote,
                                              cantidad_piezas: l.cantidad_piezas || 0,
                                              caducidad: nuevaCaducidad || null,
                                              laboratorio: l.laboratorio || null,
                                              activo: l.activo === 1,
                                            }),
                                          });
                                          pushToast("✅ Caducidad actualizada", "ok");
                                          
                                          // Actualizar el estado local
                                          setLotesProducto(prev => prev.map(item => 
                                            item.id === l.id ? { ...item, caducidad: nuevaCaducidad || null } : item
                                          ));
                                          
                                          // Recargar para sincronizar
                                          await cargarLotesDelProducto(editInv.codigo, editInv?.inventario_id || inventarioActivo);
                                          
                                          // Recargar productos del inventario activo
                                          if (inventarioActivo) {
      const productosData = await authFetch(`${SERVER_URL}/inventario/inventarios/${inventarioActivo}/productos`);
      if (Array.isArray(productosData)) {
        setInventario(filtrarProductosPorInventario(productosData));
      }
                                          }
                                        } catch (err) {
                                          console.error("Error actualizando caducidad:", err);
                                          pushToast("❌ Error al actualizar caducidad", "err");
                                          
                                          // Restaurar valor original
                                          setLotesProducto(prev => prev.map(item => 
                                            item.id === l.id ? { ...item, caducidad: l.caducidad } : item
                                          ));
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.target.blur();
                                        }
                                      }}
                                      className="input-caducidad-inline"
                                      disabled={cargandoLotes}
                                      style={{ width: '140px', fontSize: '0.9rem', padding: '7px 10px' }}
                                      placeholder="Caducidad"
                                    />
                                  </td>
                                  <td className="lote-laboratorio-cell">
                                    <input
                                      type="text"
                                      value={l.laboratorio || ""}
                                      onChange={(e) => {
                                        const nuevoLaboratorio = e.target.value;
                                        setLotesProducto(prev => prev.map(item => 
                                          item.id === l.id ? { ...item, laboratorio: nuevoLaboratorio } : item
                                        ));
                                      }}
                                      onBlur={async (e) => {
                                        const nuevoLaboratorio = e.target.value.trim();
                                        if (nuevoLaboratorio === (l.laboratorio || "")) return;
                                        
                                        try {
                                          await authFetch(`${SERVER_URL}/inventario/lotes/${editInv.codigo}/${l.id}`, {
                                            method: "PUT",
                                            body: JSON.stringify({
                                              lote: l.lote,
                                              cantidad_piezas: l.cantidad_piezas || 0,
                                              caducidad: l.caducidad || null,
                                              laboratorio: nuevoLaboratorio,
                                              activo: l.activo === 1,
                                            }),
                                          });
                                          pushToast("✅ Laboratorio actualizado", "ok");
                                          
                                          // Actualizar el estado local sin recargar del servidor
                                          setLotesProducto(prev => prev.map(item => 
                                            item.id === l.id ? { ...item, laboratorio: nuevoLaboratorio } : item
                                          ));
                                        } catch (err) {
                                          console.error("Error actualizando laboratorio:", err);
                                          pushToast("❌ Error al actualizar laboratorio", "err");
                                          
                                          // Restaurar valor original en caso de error
                                          setLotesProducto(prev => prev.map(item => 
                                            item.id === l.id ? { ...item, laboratorio: l.laboratorio } : item
                                          ));
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.target.blur();
                                        }
                                      }}
                                      className="input-laboratorio-inline"
                                      disabled={cargandoLotes}
                                      placeholder="Laboratorio"
                                    />
                                  </td>
                                  <td className="lote-fecha-cell">
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: '0.9rem', color: 'var(--texto-secundario)', lineHeight: '1.3' }}>
                                      <span style={{ fontSize: '0.85rem', opacity: 0.5 }}>📅</span>
                                      <span style={{ fontSize: '0.9rem' }}>{l.fecha_ingreso ? new Date(l.fecha_ingreso).toLocaleDateString("es-MX", {
                                        year: "numeric",
                                        month: "short",
                                        day: "numeric"
                                      }) : "-"}</span>
                                    </div>
                                  </td>
                                  <td className="lote-acciones-cell">
                                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                      <button
                                        className="btn-edit-row"
                                        onClick={() => {
                                          setLoteEditando({ ...l });
                                          setShowModalEditarLote(true);
                                        }}
                                        disabled={cargandoLotes}
                                        title="Editar lote"
                                        style={{ padding: "6px 10px", fontSize: "0.85rem" }}
                                      >
                                        ✏️ Editar
                                      </button>
                                      <button
                                        className="btn-info-row"
                                        onClick={async () => {
                                          setLoteHistorial(l);
                                          try {
                                            const historial = await authFetch(`${SERVER_URL}/inventario/lotes/${l.id}/historial`);
                                            setHistorialLote(historial || []);
                                            setShowModalHistorialLote(true);
                                          } catch (err) {
                                            console.error("Error cargando historial:", err);
                                            pushToast("❌ Error al cargar historial", "err");
                                          }
                                        }}
                                        disabled={cargandoLotes}
                                        title="Ver historial"
                                        style={{ padding: "6px 10px", fontSize: "0.85rem" }}
                                      >
                                        📋 Historial
                                      </button>
                                      <button
                                        className="btn-delete-row"
                                        onClick={async () => {
                                          const confirmado = await showConfirm(`¿Eliminar el lote "${l.lote}"?`, "Confirmar eliminación");
                                          if (!confirmado) return;
                                          
                                          try {
                                            setCargandoLotes(true);
                                            await authFetch(`${SERVER_URL}/inventario/lotes/${editInv.codigo}/${l.id}/eliminar`, {
                                              method: "DELETE",
                                            });
                                            
                                            pushToast("✅ Lote eliminado", "ok");
                                            
                                            // Recargar lotes del servidor para asegurar sincronización
                                            await cargarLotesDelProducto(editInv.codigo);
                                          } catch (err) {
                                            console.error("Error eliminando lote:", err);
                                            pushToast("❌ Error al eliminar lote", "err");
                                          } finally {
                                            setCargandoLotes(false);
                                          }
                                        }}
                                        disabled={cargandoLotes}
                                        title="Eliminar lote"
                                      >
                                        🗑️
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* PESTAÑA: FOTOS */}
              {tabActivaModal === "fotos" && (
                <div className="modal-tab-content active">
                  <div
                    className="fotos-upload-area"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.add("dragover");
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.classList.remove("dragover");
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove("dragover");
                      const files = Array.from(e.dataTransfer.files);
                      handleFileUpload(files);
                    }}
                    onClick={() => document.getElementById("file-input-fotos").click()}
                  >
                    <input
                      id="file-input-fotos"
                      type="file"
                      multiple
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => handleFileUpload(Array.from(e.target.files))}
                    />
                    <p>📸 Arrastra imágenes aquí o haz clic para seleccionar</p>
                    <p style={{ fontSize: "0.85rem", opacity: 0.7 }}>
                      Puedes subir múltiples imágenes
                    </p>
                  </div>

                  {fotosProducto.length > 0 && (
                    <div className="fotos-grid">
                      {fotosProducto.map((foto, index) => (
                        <div
                          key={index}
                          className={`foto-item ${imagenPrincipal === index ? "principal" : ""}`}
                          onClick={() => setImagenPrincipal(index)}
                        >
                          {imagenPrincipal === index && (
                            <div className="foto-badge">Principal</div>
                          )}
                          <img src={foto.preview || foto.url} alt={`Foto ${index + 1}`} />
                          <div className="foto-actions">
                            <button
                              className="foto-action-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                eliminarFoto(index);
                              }}
                            >
                              🗑️ Eliminar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                onClick={async () => {
                  // ⚠️ El lote se gestiona SOLO desde la pestaña de Lotes (productos_lotes)
                  // NO enviar lote en el payload - se guarda automáticamente en productos_lotes
                  const payload = {
                    ...editInv,
                    // NO incluir lote - se gestiona desde productos_lotes
                    piezas_por_caja:
                      piezasActual?.trim() !== ""
                        ? parseInt(piezasActual, 10)
                        : null,
                  };

                  try {
                    await authFetch(`${SERVER_URL}/inventario/${editInv.id}`, {
                      method: "PUT",
                      body: JSON.stringify(payload),
                    });

                    // Subir fotos si hay
                    if (fotosProducto.length > 0) {
                      for (let i = 0; i < fotosProducto.length; i++) {
                        const foto = fotosProducto[i];
                        if (foto.file) {
                          const formData = new FormData();
                          formData.append("foto", foto.file);
                          formData.append("productoId", editInv.id);
                          formData.append("principal", imagenPrincipal === i ? "1" : "0");

                          await authFetch(`${SERVER_URL}/api/inventario/${editInv.id}/fotos`, {
                            method: "POST",
                            body: formData,
                          });
                        }
                      }
                    }

                    // Actualizar estado local SIN recargar (evita salto de scroll)
                    setInventario(prev => prev.map(prod => 
                      prod.id === editInv.id 
                        ? { 
                            ...prod, 
                            ...payload,
                            piezas_por_caja: payload.piezas_por_caja
                          }
                        : prod
                    ));
                    
                    handleCloseModal();
                    pushToast?.("✅ Producto actualizado", "ok");
                  } catch (err) {
                    pushToast?.("❌ Error actualizando producto: " + err.message, "err");
                  }
                }}
              >
                Guardar
              </button>

              <button onClick={handleCloseModal}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ========== MODAL Códigos alternos ========== */}

      {modalCodigos && (
        <div className="modal-overlay" onClick={() => setModalCodigos(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 2, textAlign: 'center', color: '#222' }}>Códigos alternos</h3>
            <div style={{ fontSize: '0.92rem', color: '#888', marginBottom: 18, textAlign: 'center', fontWeight: 500 }}>
              {obtenerNombreCompleto(codigoEditando?.nombre, codigoEditando?.presentacion)}
            </div>
            <ul style={{ listStyle: 'disc', paddingLeft: 18, marginBottom: 18, width: '100%' }}>
              {codigosProd.map((c) => (
                <li
                  key={c}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                    padding: '4px 0',
                    fontSize: '1rem',
                    fontWeight: 500
                  }}
                >
                  <span style={{ color: '#333' }}>{c}</span>
                  <span
                    style={{ color: '#d32f2f', fontSize: '1.2em', cursor: 'pointer', userSelect: 'none', padding: '0 6px' }}
                    title="Eliminar código"
                    onClick={async () => {
                      try {
                        await authFetch(
                          `${SERVER_URL}/api/inventario/codigos/${codigoEditando.codigo}/${c}`,
                          { method: "DELETE" }
                        );
                        setCodigosProd((prev) => prev.filter((x) => x !== c));
                        pushToast?.("✅ Código eliminado", "ok");
                      } catch (err) {
                        pushToast?.("❌ Error eliminando código: " + err.message, "err");
                      }
                    }}
                  >
                    ×
                  </span>
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginTop: 6 }}>
              <input
                placeholder="Nuevo código"
                value={codigoNuevo}
                onChange={(e) => setCodigoNuevo(e.target.value)}
                style={{ fontSize: '0.95rem', padding: '7px 12px', borderRadius: 6, border: '1px solid #bcd', flex: 1, background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
              />
              <button
                style={{ fontSize: '0.9rem', padding: '7px 16px', borderRadius: 6, background: '#1976d2', color: '#fff', border: 'none', fontWeight: 500, cursor: 'pointer', boxShadow: '0 1px 4px rgba(25,118,210,0.08)' }}
                onClick={async () => {
                  if (!codigoNuevo.trim()) return;
                  try {
                    await authFetch(
                      `${SERVER_URL}/inventario/codigos/${codigoEditando.codigo}`,
                      { method: "POST", body: JSON.stringify({ codigo: codigoNuevo }) }
                    );
                    setCodigosProd((prev) => [...prev, codigoNuevo]);
                    setCodigoNuevo("");
                  } catch (err) {
                    pushToast?.("❌ Error agregando código: " + err.message, "err");
                  }
                }}
              >Agregar</button>
            </div>
          </div>
        </div>
      )}

      {/* ========== MODAL EDITAR LOTE ========== */}
      {showModalEditarLote && loteEditando && (
        <div className="modal-overlay" onClick={() => {
          setShowModalEditarLote(false);
          setLoteEditando(null);
        }}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>✏️ Editar Lote: {loteEditando.lote}</h3>
              <button className="modal-close" onClick={() => {
                setShowModalEditarLote(false);
                setLoteEditando(null);
              }}>×</button>
            </div>
            <div className="modal-body">
              <label>
                Cantidad de Piezas Actual:
                <input
                  type="number"
                  min="0"
                  value={loteEditando.cantidad_piezas || 0}
                  onChange={(e) => setLoteEditando({
                    ...loteEditando,
                    cantidad_piezas: parseInt(e.target.value) || 0
                  })}
                  style={{ width: "100%", padding: "8px", marginTop: "8px" }}
                />
              </label>
              <label style={{ marginTop: "15px" }}>
                Motivo del Cambio *
                <select
                  value={loteEditando.motivo || ""}
                  onChange={(e) => setLoteEditando({
                    ...loteEditando,
                    motivo: e.target.value
                  })}
                  style={{ width: "100%", padding: "8px", marginTop: "8px" }}
                >
                  <option value="">Selecciona un motivo</option>
                  <option value="Agregar piezas">Agregar piezas</option>
                  <option value="Descontar piezas">Descontar piezas</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Ajuste">Ajuste</option>
                  <option value="Corrección">Corrección</option>
                </select>
              </label>
              <label style={{ marginTop: "15px" }}>
                Observaciones (opcional)
                <textarea
                  value={loteEditando.observaciones || ""}
                  onChange={(e) => setLoteEditando({
                    ...loteEditando,
                    observaciones: e.target.value
                  })}
                  placeholder="Notas adicionales sobre el cambio..."
                  style={{ width: "100%", padding: "8px", marginTop: "8px", minHeight: "80px", resize: "vertical" }}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button onClick={() => {
                setShowModalEditarLote(false);
                setLoteEditando(null);
              }}>Cancelar</button>
              <button
                className="btn-primary"
                onClick={async () => {
                  if (!loteEditando.motivo) {
                    pushToast("❌ Debes seleccionar un motivo", "err");
                    return;
                  }
                  
                  try {
                    setCargandoLotes(true);
                    const cantidadAnterior = lotesProducto.find(l => l.id === loteEditando.id)?.cantidad_piezas || 0;
                    const cantidadNueva = loteEditando.cantidad_piezas || 0;
                    
                    await authFetch(`${SERVER_URL}/inventario/lotes/${editInv.codigo}/${loteEditando.id}`, {
                      method: "PUT",
                      body: JSON.stringify({
                        lote: loteEditando.lote,
                        cantidad_piezas: cantidadNueva,
                        caducidad: loteEditando.caducidad || null,
                        laboratorio: loteEditando.laboratorio || null,
                        activo: loteEditando.activo === 1,
                        inventario_id: editInv?.inventario_id || inventarioActivo || 1,
                        motivo: loteEditando.motivo,
                        observaciones: loteEditando.observaciones || null
                      }),
                    });
                    
                    pushToast(`✅ Lote actualizado (${cantidadAnterior} → ${cantidadNueva} piezas)`, "ok");
                    
                    // Recargar lotes del servidor
                    await cargarLotesDelProducto(editInv.codigo, editInv?.inventario_id || inventarioActivo);
                    
                    // Recargar productos del inventario activo
                    if (inventarioActivo) {
      const productosData = await authFetch(`${SERVER_URL}/inventario/inventarios/${inventarioActivo}/productos`);
      if (Array.isArray(productosData)) {
        setInventario(filtrarProductosPorInventario(productosData));
      }
                    }
                    
                    setShowModalEditarLote(false);
                    setLoteEditando(null);
                  } catch (err) {
                    console.error("Error actualizando lote:", err);
                    pushToast("❌ Error al actualizar lote: " + (err.message || "Error desconocido"), "err");
                  } finally {
                    setCargandoLotes(false);
                  }
                }}
                disabled={cargandoLotes || !loteEditando.motivo}
              >
                {cargandoLotes ? "Guardando..." : "Guardar Cambios"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== MODAL HISTORIAL LOTE ========== */}
      {showModalHistorialLote && loteHistorial && (
        <div className="modal-overlay" onClick={() => {
          setShowModalHistorialLote(false);
          setLoteHistorial(null);
          setHistorialLote([]);
        }}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📋 Historial del Lote: {loteHistorial.lote}</h3>
              <button className="modal-close" onClick={() => {
                setShowModalHistorialLote(false);
                setLoteHistorial(null);
                setHistorialLote([]);
              }}>×</button>
            </div>
            <div className="modal-body">
              {historialLote.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: "var(--texto-secundario)" }}>
                  <p>No hay historial registrado para este lote</p>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "var(--fondo-secundario)" }}>
                        <th style={{ padding: "10px", textAlign: "left", borderBottom: "2px solid var(--borde-sutil)" }}>Fecha</th>
                        <th style={{ padding: "10px", textAlign: "left", borderBottom: "2px solid var(--borde-sutil)" }}>Hora</th>
                        <th style={{ padding: "10px", textAlign: "left", borderBottom: "2px solid var(--borde-sutil)" }}>Usuario</th>
                        <th style={{ padding: "10px", textAlign: "left", borderBottom: "2px solid var(--borde-sutil)" }}>Motivo</th>
                        <th style={{ padding: "10px", textAlign: "center", borderBottom: "2px solid var(--borde-sutil)" }}>Cantidad Anterior</th>
                        <th style={{ padding: "10px", textAlign: "center", borderBottom: "2px solid var(--borde-sutil)" }}>Cantidad Nueva</th>
                        <th style={{ padding: "10px", textAlign: "center", borderBottom: "2px solid var(--borde-sutil)" }}>Diferencia</th>
                        <th style={{ padding: "10px", textAlign: "left", borderBottom: "2px solid var(--borde-sutil)" }}>Observaciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historialLote.map((h, idx) => (
                        <tr key={h.id || idx} style={{ borderBottom: "1px solid var(--borde-sutil)" }}>
                          <td style={{ padding: "10px" }}>{h.fecha || "-"}</td>
                          <td style={{ padding: "10px" }}>{h.hora || "-"}</td>
                          <td style={{ padding: "10px" }}>{h.usuario || "-"}</td>
                          <td style={{ padding: "10px" }}>{h.motivo || "-"}</td>
                          <td style={{ padding: "10px", textAlign: "center", fontWeight: "600" }}>{h.cantidad_anterior ?? 0}</td>
                          <td style={{ padding: "10px", textAlign: "center", fontWeight: "600", color: "var(--azul-primario)" }}>{h.cantidad_nueva ?? 0}</td>
                          <td style={{ 
                            padding: "10px", 
                            textAlign: "center", 
                            fontWeight: "600",
                            color: h.diferencia > 0 ? "var(--exito)" : h.diferencia < 0 ? "var(--color-danger, #ef4444)" : "var(--texto-secundario)"
                          }}>
                            {h.diferencia > 0 ? `+${h.diferencia}` : h.diferencia}
                          </td>
                          <td style={{ padding: "10px", fontSize: "0.9rem", color: "var(--texto-secundario)" }}>{h.observaciones || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button onClick={() => {
                setShowModalHistorialLote(false);
                setLoteHistorial(null);
                setHistorialLote([]);
              }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ========== MODAL IMPORTAR INVENTARIO ========== */}
      {showModalImportar && (
        <div className="modal-overlay" onClick={() => {
          // No permitir cerrar el modal mientras se está importando
          if (!importando) {
            setShowModalImportar(false);
            setArchivoImportar(null);
            setDatosImportar([]);
            setColumnasArchivo([]);
            setColumnasNuevas([]);
            setMapeoColumnas({});
            setVistaPrevia([]);
            setErroresValidacion([]);
            if (fileInputRef.current) {
              fileInputRef.current.value = "";
            }
          }
        }}>
          <div className="modal-content modal-importar modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Importar Inventario</h3>
              <button 
                className="modal-close" 
                onClick={() => {
                  // No permitir cerrar el modal mientras se está importando
                  if (!importando) {
                    setShowModalImportar(false);
                    setArchivoImportar(null);
                    setDatosImportar([]);
                    setColumnasArchivo([]);
                    setColumnasNuevas([]);
                    setMapeoColumnas({});
                    setVistaPrevia([]);
                    setErroresValidacion([]);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }
                }}
                disabled={importando}
                style={importando ? { opacity: 0.5, cursor: "not-allowed" } : {}}
              >×</button>
            </div>

            <div className="modal-body">
              {/* Paso 1: Seleccionar archivo */}
              {!archivoImportar && (
                <div>
                  <p style={{ marginBottom: "15px" }}>
                    Selecciona un archivo Excel (.xlsx, .xls) o CSV para importar el inventario.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileSelect}
                    style={{ marginBottom: "15px" }}
                  />
                  <p style={{ fontSize: "0.85rem", color: "var(--texto-secundario)", marginTop: "10px" }}>
                    El archivo debe tener al menos las columnas: Código y Nombre. 
                    Las demás columnas se mapearán automáticamente o podrás configurarlas.
                  </p>
                </div>
              )}

              {/* Paso 2: Columnas nuevas detectadas */}
              {archivoImportar && columnasNuevas.length > 0 && (
                <div style={{ marginBottom: "20px", padding: "15px", background: "#fff3cd", borderRadius: "8px", border: "1px solid #ffc107" }}>
                  <h4 style={{ marginBottom: "10px" }}>📋 Columnas Nuevas Detectadas</h4>
                  <p style={{ fontSize: "0.9rem", marginBottom: "15px", color: "#856404" }}>
                    Se encontraron {columnasNuevas.length} columna(s) que no existen en el sistema. 
                    Estas columnas se pueden mapear manualmente a campos del sistema o se ignorarán durante la importación.
                    <br />
                    <strong>Nota:</strong> El sistema actualmente acepta: Código, Nombre, Presentación, Categoría, Subcategoría, Piezas por Caja y Lote.
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {columnasNuevas.map((col) => (
                      <span
                        key={col}
                        style={{
                          padding: "6px 12px",
                          background: "var(--color-primario)",
                          color: "white",
                          borderRadius: "6px",
                          fontSize: "0.85rem",
                        }}
                      >
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Paso 3: Mapeo de columnas */}
              {archivoImportar && columnasArchivo.length > 0 && (
                <div style={{ marginBottom: "20px" }}>
                  <h4 style={{ marginBottom: "15px" }}>🔗 Mapeo de Columnas</h4>
                  <div style={{ maxHeight: "200px", overflow: "auto", border: "1px solid var(--borde-medio)", borderRadius: "8px", padding: "10px" }}>
                    <table style={{ width: "100%", fontSize: "0.9rem" }}>
                      <thead>
                        <tr style={{ background: "var(--fondo-secundario)" }}>
                          <th style={{ padding: "8px", textAlign: "left" }}>Columna del Archivo</th>
                          <th style={{ padding: "8px", textAlign: "left" }}>Campo del Sistema</th>
                        </tr>
                      </thead>
                      <tbody>
                        {columnasArchivo.map((col) => (
                          <tr key={col}>
                            <td style={{ padding: "8px" }}>{col}</td>
                            <td style={{ padding: "8px" }}>
                              <select
                                value={mapeoColumnas[col] || ""}
                                onChange={(e) => {
                                  setMapeoColumnas(prev => ({
                                    ...prev,
                                    [col]: e.target.value || null,
                                  }));
                                }}
                                style={{
                                  width: "100%",
                                  padding: "6px",
                                  border: "1px solid var(--borde-medio)",
                                  borderRadius: "4px",
                                  background: "var(--fondo-input)",
                                  color: "var(--texto-principal)",
                                }}
                              >
                                <option value="">-- Campo personalizado --</option>
                                <option value="codigo">Código</option>
                                <option value="nombre">Nombre</option>
                                <option value="presentacion">Presentación</option>
                                <option value="categoria">Categoría</option>
                                <option value="subcategoria">Subcategoría</option>
                                <option value="lote">Lote</option>
                                <option value="piezas_por_caja">Piezas por Caja</option>
                                <option value="descripcion">Descripción</option>
                                <option value="precio">Precio</option>
                                <option value="precio_compra">Precio Compra</option>
                                <option value="proveedor">Proveedor</option>
                                <option value="marca">Marca</option>
                                <option value="codigo_barras">Código de Barras</option>
                                <option value="sku">SKU</option>
                                <option value="stock_minimo">Stock Mínimo</option>
                                <option value="stock_maximo">Stock Máximo</option>
                                <option value="ubicacion">Ubicación</option>
                                <option value="unidad_medida">Unidad de Medida</option>
                                <option value="peso">Peso</option>
                                <option value="dimensiones">Dimensiones</option>
                                <option value="fecha_vencimiento">Fecha Vencimiento</option>
                                <option value="activo">Activo</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Paso 4: Vista previa */}
              {archivoImportar && vistaPrevia.length > 0 && (
                <div style={{ marginBottom: "20px" }}>
                  <h4 style={{ marginBottom: "15px" }}>👁️ Vista Previa (primeros 5 productos)</h4>
                  <div style={{ maxHeight: "300px", overflow: "auto", border: "1px solid var(--borde-medio)", borderRadius: "8px" }}>
                    <table style={{ width: "100%", fontSize: "0.85rem" }}>
                      <thead>
                        <tr style={{ background: "var(--fondo-secundario)", position: "sticky", top: 0 }}>
                          {columnasArchivo.slice(0, 6).map((col) => (
                            <th key={col} style={{ padding: "8px", textAlign: "left", borderBottom: "2px solid var(--borde-medio)" }}>
                              {col}
                            </th>
                          ))}
                          {columnasArchivo.length > 6 && <th style={{ padding: "8px" }}>...</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {vistaPrevia.map((row, idx) => (
                          <tr key={idx}>
                            {columnasArchivo.slice(0, 6).map((col) => (
                              <td key={col} style={{ padding: "6px 8px", borderBottom: "1px solid var(--borde-sutil)" }}>
                                {row[col]?.toString().substring(0, 30) || ""}
                              </td>
                            ))}
                            {columnasArchivo.length > 6 && <td style={{ padding: "6px 8px" }}>...</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p style={{ fontSize: "0.85rem", color: "var(--texto-secundario)", marginTop: "10px" }}>
                    Total de productos en archivo: {datosImportar.length}
                  </p>
                </div>
              )}

              {/* Errores de validación */}
              {erroresValidacion.length > 0 && (
                <div style={{ marginBottom: "20px", padding: "15px", background: "#fee2e2", borderRadius: "8px", border: "1px solid #fca5a5" }}>
                  <h4 style={{ marginBottom: "10px", color: "#dc2626" }}>⚠️ Errores de Validación ({erroresValidacion.length})</h4>
                  <div style={{ maxHeight: "150px", overflow: "auto", fontSize: "0.85rem" }}>
                    {erroresValidacion.slice(0, 10).map((error, idx) => (
                      <div key={idx} style={{ marginBottom: "5px", color: "#991b1b" }}>
                        {error}
                      </div>
                    ))}
                    {erroresValidacion.length > 10 && (
                      <div style={{ color: "#991b1b", fontStyle: "italic" }}>
                        ... y {erroresValidacion.length - 10} error(es) más
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Opciones de importación */}
              {archivoImportar && datosImportar.length > 0 && (
                <div style={{ marginBottom: "20px", padding: "15px", background: "var(--fondo-secundario)", borderRadius: "8px" }}>
                  <h4 style={{ marginBottom: "10px" }}>⚙️ Opciones de Importación</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="opcionImportar"
                        value="crear"
                        checked={opcionImportar === "crear"}
                        onChange={(e) => setOpcionImportar(e.target.value)}
                      />
                      <span>Crear solo productos nuevos (ignorar existentes)</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="opcionImportar"
                        value="actualizar"
                        checked={opcionImportar === "actualizar"}
                        onChange={(e) => setOpcionImportar(e.target.value)}
                      />
                      <span>Actualizar solo productos existentes (ignorar nuevos)</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="opcionImportar"
                        value="ambos"
                        checked={opcionImportar === "ambos"}
                        onChange={(e) => setOpcionImportar(e.target.value)}
                      />
                      <span>Crear nuevos y actualizar existentes</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Indicador de progreso durante la importación */}
            {null}

            <div className="modal-footer">
              <button
                onClick={() => {
                  if (!importando) {
                    setShowModalImportar(false);
                    setArchivoImportar(null);
                    setDatosImportar([]);
                    setColumnasArchivo([]);
                    setColumnasNuevas([]);
                    setMapeoColumnas({});
                    setVistaPrevia([]);
                    setErroresValidacion([]);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }
                }}
                disabled={importando}
                style={importando ? { opacity: 0.5, cursor: "not-allowed" } : {}}
              >
                {importando ? "Importando..." : "Cancelar"}
              </button>
              {archivoImportar && datosImportar.length > 0 && (
                <button
                  onClick={() => {
                    procesarImportacion();
                  }}
                  disabled={importando}
                  style={{
                    background: importando ? "#9ca3af" : "var(--color-primario, #3b82f6)",
                    color: "white",
                    cursor: importando ? "not-allowed" : "pointer",
                    opacity: importando ? 0.7 : 1
                  }}
                >
                  {importando 
                    ? `Importando... (${progresoImportacion.actual}/${progresoImportacion.total})`
                    : `Importar ${datosImportar.length} Producto(s)`
                  }
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Indicador de carga durante importación - estilo Activos Informáticos */}
      {importando && (
        <div className="importacion-overlay-inv">
          <div className="importacion-loader-inv">
            <div className="logo-loader-container-inv">
              <div 
                className="logo-loader-progress-inv" 
                style={{ height: `${100 - (progresoImportacion.total > 0 ? (progresoImportacion.actual / progresoImportacion.total) * 100 : 0)}%` }}
              ></div>
              <img 
                src={`${SERVER_URL}/uploads/personalizacion/logos/logo.png?t=${Date.now()}`}
                alt="Logo"
                className="logo-loader-inv"
                onError={(e) => {
                  e.target.style.display = 'none';
                  const fallback = e.target.parentElement.querySelector('.logo-loader-fallback-inv');
                  if (fallback) fallback.style.display = 'block';
                }}
              />
              <div className="logo-loader-fallback-inv" style={{ display: 'none' }}>
                <div className="logo-loader-placeholder-inv">PINA</div>
              </div>
            </div>
            <div className="importacion-texto-inv">
              <p>Importando productos...</p>
              <p className="importacion-porcentaje-inv">
                {progresoImportacion.total > 0 ? Math.round((progresoImportacion.actual / progresoImportacion.total) * 100) : 0}%
              </p>
              <p className="importacion-detalle-inv">
                {progresoImportacion.actual} de {progresoImportacion.total} • 
                <span className="exitosos-inv"> ✓ {progresoImportacion.exitosos}</span>
                {progresoImportacion.errores > 0 && <span className="errores-inv"> ✗ {progresoImportacion.errores}</span>}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal para crear nuevo inventario */}
      {showModalNuevoInventario && (
        <div className="modal-overlay" onClick={() => setShowModalNuevoInventario(false)}>
          <div className="modal modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>➕ Crear Nuevo Inventario</h3>
              <button className="modal-close" onClick={() => setShowModalNuevoInventario(false)}>×</button>
            </div>
            <div className="modal-body">
              <label>
                Tipo de Inventario *
                <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="tipoInventario"
                      value="nuevo"
                      checked={formNuevoInventario.tipo === "nuevo"}
                      onChange={(e) => setFormNuevoInventario({ ...formNuevoInventario, tipo: e.target.value, inventario_origen_id: null })}
                    />
                    <span>Nuevo (Vacío)</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="tipoInventario"
                      value="copia"
                      checked={formNuevoInventario.tipo === "copia"}
                      onChange={(e) => setFormNuevoInventario({ ...formNuevoInventario, tipo: e.target.value, inventario_origen_id: 1 })}
                    />
                    <span>Copia de CEDIS (Sincronizado)</span>
                  </label>
                </div>
                <p style={{ fontSize: "0.85rem", color: "var(--texto-secundario)", marginTop: "8px" }}>
                  {formNuevoInventario.tipo === "copia" 
                    ? "⚠️ Los productos agregados a CEDIS se sincronizarán automáticamente con este inventario."
                    : "✅ Inventario independiente y vacío. Podrás agregar productos manualmente."}
                </p>
              </label>

              {formNuevoInventario.tipo === "copia" && (
                <label>
                  Inventario Origen (CEDIS)
                  <input
                    type="text"
                    value="Inventario (CEDIS)"
                    readOnly
                    disabled
                    style={{
                      width: "100%",
                      padding: "8px",
                      marginTop: "8px",
                      background: "var(--fondo-secundario)",
                      color: "var(--texto-secundario)",
                      cursor: "not-allowed",
                      borderRadius: "8px",
                      border: "1px solid var(--borde-sutil)"
                    }}
                  />
                </label>
              )}

              <label>
                Nombre del Inventario *
                <input
                  type="text"
                  value={formNuevoInventario.nombre}
                  onChange={(e) => setFormNuevoInventario({ ...formNuevoInventario, nombre: e.target.value })}
                  placeholder="Ej: Inventario 1"
                  autoFocus
                />
              </label>
              <label>
                Alias (Opcional)
                <input
                  type="text"
                  value={formNuevoInventario.alias}
                  onChange={(e) => setFormNuevoInventario({ ...formNuevoInventario, alias: e.target.value })}
                  placeholder="Ej: Sucursal Centro"
                />
              </label>
            </div>
            <div className="modal-actions">
              <button onClick={() => {
                setShowModalNuevoInventario(false);
                setFormNuevoInventario({ nombre: "", alias: "", tipo: "nuevo", inventario_origen_id: null });
              }}>Cancelar</button>
              <button className="btn-primary" onClick={crearNuevoInventario}>
                {formNuevoInventario.tipo === "copia" ? "Crear Inventario Copia de CEDIS" : "Crear Inventario Nuevo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para eliminar inventario */}
      {showModalEliminarInventario && inventarioAEliminar && (
        <div className="modal-overlay" onClick={() => {
          setShowModalEliminarInventario(false);
          setInventarioAEliminar(null);
          setPasswordEliminar("");
        }}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🗑️ Eliminar Inventario</h3>
              <button className="modal-close" onClick={() => {
                setShowModalEliminarInventario(false);
                setInventarioAEliminar(null);
                setPasswordEliminar("");
              }}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: "15px", color: "var(--color-warning, #f59e0b)", fontWeight: "600" }}>
                ⚠️ Esta acción no se puede deshacer
              </p>
              <p style={{ marginBottom: "15px" }}>
                Estás a punto de eliminar el inventario: <strong>{inventarioAEliminar.nombre}{inventarioAEliminar.alias ? ` (${inventarioAEliminar.alias})` : ""}</strong>
              </p>
              <p style={{ marginBottom: "20px", fontSize: "0.9rem", color: "var(--texto-secundario)" }}>
                Todos los productos de este inventario también serán eliminados permanentemente.
              </p>
              <label>
                Contraseña de Administrador *
                <input
                  type="password"
                  value={passwordEliminar}
                  onChange={(e) => setPasswordEliminar(e.target.value)}
                  placeholder="Ingresa tu contraseña para confirmar"
                  autoFocus
                  style={{ width: "100%", padding: "8px", marginTop: "8px" }}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button onClick={() => {
                setShowModalEliminarInventario(false);
                setInventarioAEliminar(null);
                setPasswordEliminar("");
              }}>Cancelar</button>
              <button 
                className="btn-primary" 
                onClick={eliminarInventario}
                style={{ background: "var(--color-danger, #ef4444)" }}
              >
                Eliminar Inventario
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Menú de transferencia de productos */}
      {showMenuTransferir && productoTransferir && (
        <div className="modal-overlay" onClick={() => {
          setShowMenuTransferir(false);
          setProductoTransferir(null);
          setLotesProductoTransferir([]);
          setInventarioDestinoSeleccionado(null);
          setLotesSeleccionados({});
        }}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔄 Transferir Producto</h3>
              <button className="modal-close" onClick={() => {
                setShowMenuTransferir(false);
                setProductoTransferir(null);
                setLotesProductoTransferir([]);
                setInventarioDestinoSeleccionado(null);
                setLotesSeleccionados({});
              }}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: "15px" }}>
                <strong>Producto:</strong> {productoTransferir.nombre} ({productoTransferir.codigo})
              </p>

              {!inventarioDestinoSeleccionado ? (
                <>
                  <p style={{ marginBottom: "15px", fontSize: "0.9rem", color: "var(--texto-secundario)" }}>
                    Selecciona el inventario destino:
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {inventarios
                      .filter(inv => inv.id !== inventarioActivo)
                      .map((inv) => (
                        <button
                          key={inv.id}
                          onClick={() => setInventarioDestinoSeleccionado(inv)}
                          style={{
                            padding: "12px 16px",
                            background: "var(--fondo-input)",
                            border: "1px solid var(--borde-sutil)",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "0.9rem",
                            fontWeight: "500",
                            textAlign: "left",
                            transition: "all 0.2s ease"
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.background = "var(--azul-primario)";
                            e.target.style.color = "white";
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.background = "var(--fondo-input)";
                            e.target.style.color = "var(--texto-principal)";
                          }}
                        >
                          {inv.nombre}{inv.alias ? ` - ${inv.alias}` : ""}
                        </button>
                      ))}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                    <p style={{ fontSize: "0.9rem", color: "var(--texto-secundario)" }}>
                      Inventario destino: <strong>{inventarioDestinoSeleccionado.nombre}{inventarioDestinoSeleccionado.alias ? ` (${inventarioDestinoSeleccionado.alias})` : ""}</strong>
                    </p>
                    <button
                      onClick={() => setInventarioDestinoSeleccionado(null)}
                      style={{
                        padding: "6px 12px",
                        background: "transparent",
                        border: "1px solid var(--borde-sutil)",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "0.85rem"
                      }}
                    >
                      Cambiar
                    </button>
                  </div>

                  {lotesProductoTransferir.length > 0 ? (
                    <>
                      <p style={{ marginBottom: "15px", fontSize: "0.9rem", color: "var(--texto-secundario)" }}>
                        Selecciona los lotes y cantidad de piezas a transferir:
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "15px" }}>
                        {lotesProductoTransferir.map((lote) => {
                          const cantidadSeleccionada = lotesSeleccionados[lote.id] || 0;
                          const tieneVigenciaProxima = lote.caducidad && new Date(lote.caducidad) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                          
                          return (
                            <div
                              key={lote.id}
                              style={{
                                padding: "12px",
                                background: tieneVigenciaProxima ? "var(--color-warning, #fef3c7)" : "var(--fondo-input)",
                                border: `1px solid ${tieneVigenciaProxima ? "var(--color-warning, #f59e0b)" : "var(--borde-sutil)"}`,
                                borderRadius: "6px"
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                                <div>
                                  <strong>Lote:</strong> {lote.lote || "Sin lote"}
                                  {lote.caducidad && (
                                    <span style={{ marginLeft: "8px", fontSize: "0.85rem", color: tieneVigenciaProxima ? "var(--color-danger, #ef4444)" : "var(--texto-secundario)" }}>
                                      (Cad: {new Date(lote.caducidad).toLocaleDateString()})
                                      {tieneVigenciaProxima && " ⚠️ Próxima"}
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: "0.9rem", color: "var(--texto-secundario)" }}>
                                  Disponible: <strong>{lote.cantidad_piezas || 0} pz</strong>
                                </div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <input
                                  type="number"
                                  min="0"
                                  max={lote.cantidad_piezas || 0}
                                  value={cantidadSeleccionada}
                                  onChange={(e) => {
                                    const cantidad = parseInt(e.target.value) || 0;
                                    setLotesSeleccionados(prev => ({
                                      ...prev,
                                      [lote.id]: Math.min(cantidad, lote.cantidad_piezas || 0)
                                    }));
                                  }}
                                  style={{
                                    width: "100px",
                                    padding: "6px 8px",
                                    border: "1px solid var(--borde-sutil)",
                                    borderRadius: "4px"
                                  }}
                                  placeholder="0"
                                />
                                <span style={{ fontSize: "0.85rem", color: "var(--texto-secundario)" }}>piezas</span>
                                <button
                                  onClick={() => {
                                    setLotesSeleccionados(prev => ({
                                      ...prev,
                                      [lote.id]: lote.cantidad_piezas || 0
                                    }));
                                  }}
                                  style={{
                                    padding: "4px 8px",
                                    background: "var(--fondo-secundario)",
                                    border: "1px solid var(--borde-sutil)",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    fontSize: "0.8rem"
                                  }}
                                >
                                  Todo
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <p style={{ marginBottom: "15px", fontSize: "0.9rem", color: "var(--texto-secundario)" }}>
                      Este producto no tiene lotes registrados. Se transferirá el producto completo.
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="modal-actions">
              <button onClick={() => {
                setShowMenuTransferir(false);
                setProductoTransferir(null);
                setLotesProductoTransferir([]);
                setInventarioDestinoSeleccionado(null);
                setLotesSeleccionados({});
              }}>Cancelar</button>
              {inventarioDestinoSeleccionado && (
                <button
                  className="btn-primary"
                  onClick={() => {
                    const lotesATransferir = Object.entries(lotesSeleccionados)
                      .filter(([_, cantidad]) => cantidad > 0)
                      .map(([loteId, cantidad]) => {
                        const lote = lotesProductoTransferir.find(l => l.id === parseInt(loteId));
                        return {
                          lote_id: parseInt(loteId),
                          lote: lote?.lote || "",
                          cantidad_piezas: cantidad,
                          caducidad: lote?.caducidad || null,
                          laboratorio: lote?.laboratorio || null,
                          activo: lote?.activo || 0
                        };
                      });
                    transferirProducto(productoTransferir.id, inventarioDestinoSeleccionado.id, lotesATransferir);
                  }}
                  disabled={lotesProductoTransferir.length > 0 && Object.values(lotesSeleccionados).every(c => c === 0 || !c)}
                >
                  {lotesProductoTransferir.length > 0 
                    ? `Transferir ${Object.values(lotesSeleccionados).reduce((sum, c) => sum + (c || 0), 0)} piezas`
                    : "Transferir Producto"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>

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
            <h3>📤 Compartir producto por chat</h3>
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
                wordBreak: "break-word",
                overflowWrap: "break-word",
                maxWidth: "100%",
              }}
            >
              {construirMensajeCompartir(compartirProducto)}
            </pre>

            <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
              <button
                className="btn-secondary"
                onClick={() => compartirPorOtrasApps(compartirProducto)}
                style={{ flex: 1 }}
              >
                📱 Compartir por otras apps
              </button>
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={() => setCompartirOpen(false)}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={enviarCompartir} disabled={compartiendo}>
              {compartiendo ? "Enviando..." : "Enviar al chat"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// Componente Modal Agregar
function ModalAgregar({ formInv, setFormInv, CATS_SAFE, SERVER_URL, authFetch, setInventario, pushToast, setShowAddInv, inventarioActivo }) {

  return (
    <div className="modal-overlay" onClick={() => setShowAddInv(false)}>
      <div className="modal-content modal-edit-inventario" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Agregar producto</h3>
          <button className="modal-close" onClick={() => setShowAddInv(false)}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="modal-tab-content active">
            <div className="form-grid">
              <div className="form-group">
                <label>Código</label>
                <input
                  placeholder="Código"
                  value={formInv.codigo}
                  onChange={(e) => setFormInv({ ...formInv, codigo: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Nombre</label>
                <input
                  placeholder="Nombre del producto"
                  value={formInv.nombre}
                  onChange={(e) => setFormInv({ ...formInv, nombre: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Presentación</label>
                <input
                  placeholder="Presentación del producto (ej: 120 caps, 500ml)"
                  value={formInv.presentacion || ""}
                  onChange={(e) => setFormInv({ ...formInv, presentacion: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Categoría</label>
                <select
                  value={formInv.categoria}
                  onChange={(e) => setFormInv({
                    ...formInv,
                    categoria: e.target.value,
                    subcategoria: "",
                  })}
                >
                  {Object.keys(CATS_SAFE).map((opt) => (
                    <option key={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              {CATS_SAFE[formInv.categoria]?.length > 0 && (
                <div className="form-group">
                  <label>Subcategoría</label>
                  <select
                    value={formInv.subcategoria}
                    onChange={(e) =>
                      setFormInv({
                        ...formInv,
                        subcategoria: e.target.value,
                      })
                    }
                  >
                    <option value="">Seleccione subcategoría</option>
                    {CATS_SAFE[formInv.categoria].map((sub) => (
                      <option key={sub}>{sub}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label>Piezas por caja</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Piezas por caja"
                  value={formInv.piezasPorCaja}
                  onChange={(e) => setFormInv({
                    ...formInv,
                    piezasPorCaja: e.target.value,
                  })}
                />
              </div>

              <div className="form-group">
                <label>Lote</label>
                <input
                  placeholder="Lote"
                  value={formInv.lote || ""}
                  onChange={(e) => setFormInv({ ...formInv, lote: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Descripción</label>
                <textarea
                  placeholder="Descripción del producto"
                  value={formInv.descripcion || ""}
                  onChange={(e) =>
                    setFormInv({ ...formInv, descripcion: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label>Precio</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formInv.precio || ""}
                  onChange={(e) =>
                    setFormInv({ ...formInv, precio: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label>Precio de compra</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formInv.precio_compra || ""}
                  onChange={(e) =>
                    setFormInv({ ...formInv, precio_compra: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label>Proveedor</label>
                <input
                  placeholder="Nombre del proveedor"
                  value={formInv.proveedor || ""}
                  onChange={(e) =>
                    setFormInv({ ...formInv, proveedor: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label>Marca</label>
                <input
                  placeholder="Marca del producto"
                  value={formInv.marca || ""}
                  onChange={(e) =>
                    setFormInv({ ...formInv, marca: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label>Código de barras</label>
                <input
                  placeholder="Código de barras"
                  value={formInv.codigo_barras || ""}
                  onChange={(e) =>
                    setFormInv({ ...formInv, codigo_barras: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label>SKU</label>
                <input
                  placeholder="SKU"
                  value={formInv.sku || ""}
                  onChange={(e) =>
                    setFormInv({ ...formInv, sku: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label>Stock mínimo</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={formInv.stock_minimo || ""}
                  onChange={(e) =>
                    setFormInv({ ...formInv, stock_minimo: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label>Stock máximo</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={formInv.stock_maximo || ""}
                  onChange={(e) =>
                    setFormInv({ ...formInv, stock_maximo: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label>Ubicación</label>
                <input
                  placeholder="Ubicación del producto"
                  value={formInv.ubicacion || ""}
                  onChange={(e) =>
                    setFormInv({ ...formInv, ubicacion: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label>Unidad de medida</label>
                <input
                  placeholder="Ej: kg, litros, unidades"
                  value={formInv.unidad_medida || ""}
                  onChange={(e) =>
                    setFormInv({ ...formInv, unidad_medida: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label>Peso</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formInv.peso || ""}
                  onChange={(e) =>
                    setFormInv({ ...formInv, peso: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label>Dimensiones</label>
                <input
                  placeholder="Ej: 10x20x30 cm"
                  value={formInv.dimensiones || ""}
                  onChange={(e) =>
                    setFormInv({ ...formInv, dimensiones: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label>Fecha de vencimiento</label>
                <input
                  type="date"
                  value={formInv.fecha_vencimiento || ""}
                  onChange={(e) =>
                    setFormInv({ ...formInv, fecha_vencimiento: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            onClick={async () => {
              const { codigo, nombre, piezasPorCaja, ...restFormInv } = formInv;
              if (!codigo || !nombre) return pushToast?.("Completa código y nombre", "err");

              const payload = {
                ...restFormInv,
                codigo,
                nombre,
                piezas_por_caja: piezasPorCaja ? parseInt(piezasPorCaja, 10) : null,
                inventario_id: inventarioActivo || 1, // Asignar al inventario activo
              };

              try {
                const nuevoProducto = await authFetch(`${SERVER_URL}/inventario`, {
                  method: "POST",
                  body: JSON.stringify(payload),
                });
                
                // Si el producto tiene lote, agregarlo también a la pestaña de lotes
                if (formInv.lote && formInv.lote.trim()) {
                  try {
                    await authFetch(`${SERVER_URL}/inventario/lotes/${formInv.codigo}/nuevo`, {
                      method: "POST",
                      body: JSON.stringify({
                        lote: formInv.lote.trim(),
                        cantidad_piezas: 0,
                        laboratorio: null,
                        activo: true, // Marcar como activo al agregar desde nuevo producto
                      }),
                    });
                  } catch (loteErr) {
                    // Si falla agregar el lote, no es crítico, solo loguear
                  }
                }
                
                // Agregar al estado local SIN recargar (evita salto de scroll)
                // IMPORTANTE: Solo agregar si el producto pertenece al inventario activo
                if (nuevoProducto && nuevoProducto.id) {
                  // Verificar que el producto pertenezca al inventario activo
                  const productoInventarioId = nuevoProducto.inventario_id || nuevoProducto.inventarioId || 1;
                  if (productoInventarioId === inventarioActivo) {
                    setInventario(prev => [...prev, nuevoProducto].sort((a, b) =>
                      (a.nombre || "").localeCompare(b.nombre || "", "es")
                    ));
                  }
                } else {
                  // Si no se recibe el producto, crear uno básico con el payload
                  // Solo agregar si pertenece al inventario activo
                  const productoInventarioId = payload.inventario_id || inventarioActivo || 1;
                  if (productoInventarioId === inventarioActivo) {
                    setInventario(prev => [...prev, { 
                      ...payload, 
                      id: Date.now(), // ID temporal
                      mostrar_en_pagina: 0
                    }].sort((a, b) =>
                      (a.nombre || "").localeCompare(b.nombre || "", "es")
                    ));
                  }
                }
                
                setShowAddInv(false);
                pushToast?.("✅ Producto agregado", "ok");
              } catch (err) {
                pushToast?.("❌ Error agregando producto: " + err.message, "err");
              }
            }}
          >
            Guardar
          </button>
          <button onClick={() => setShowAddInv(false)}>Cancelar</button>
        </div>
      </div>
    </div>
      )}