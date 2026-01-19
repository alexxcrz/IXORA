import React, { useState, useMemo, useEffect, useRef } from "react";
import "./Inventario.css";
import { authFetch, useAuth } from "../../AuthContext";
import { useAlert } from "../../components/AlertModal";
import { Document, Packer, Paragraph, AlignmentType, TextRun, ImageRun, PageOrientation } from "docx";
import ExcelJS from "exceljs";
import { Capacitor } from "@capacitor/core";
import { registerPlugin } from '@capacitor/core';

// Definir el plugin directamente aquí para evitar problemas de importación TypeScript
const AndroidPrinterPlugin = registerPlugin('AndroidPrinter', {
  web: () => Promise.resolve({
    printToBluetooth: async () => ({ result: 'ERROR: No disponible en web' }),
    printZPL: async () => ({ result: 'ERROR: No disponible en web' }),
    findBluetoothPrinters: async () => ({ devices: [] })
  })
});

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
}) {
  const { perms } = useAuth();
  const { showAlert, showConfirm } = useAlert();
  const can = (perm) => perms?.includes(perm);
  const CATS_SAFE = CATEGORIAS || { "Sin categoría": [] };

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
    
    // Si no la contiene, agregarla
    return `${nombreTrim} - ${presentacionTrim}`;
  };

  const [invQuery, setInvQuery] = useState("");
  const [showAddInv, setShowAddInv] = useState(false);
  const [showEditInv, setShowEditInv] = useState(false);

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
  });

  const [modalCodigos, setModalCodigos] = useState(false);
  const [codigosProd, setCodigosProd] = useState([]);
  const [codigoNuevo, setCodigoNuevo] = useState("");
  const [codigoEditando, setCodigoEditando] = useState(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrModalCodigo, setQrModalCodigo] = useState("");
  const [qrModalNombre, setQrModalNombre] = useState("");
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
  const [nuevoLote, setNuevoLote] = useState({ lote: "", cantidad_piezas: "", laboratorio: "" });
  const [cargandoLotes, setCargandoLotes] = useState(false);

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

  // Debug: Monitorear cambios en el estado de importación
  useEffect(() => {
    console.log("🔵 [ESTADO] importando cambió a:", importando);
    console.log("🔵 [ESTADO] progresoImportacion:", progresoImportacion);
  }, [importando, progresoImportacion]);

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
  const cargarLotesDelProducto = async (codigo) => {
    if (!codigo) return;
    
    try {
      const lotes = await authFetch(`${SERVER_URL}/inventario/lotes/${codigo}/completo`);
      if (Array.isArray(lotes)) {
        setLotesProducto(lotes);
        console.log(`✅ Lotes cargados para ${codigo}:`, lotes.length);
      } else {
        console.warn(`⚠️ Respuesta inesperada al cargar lotes para ${codigo}:`, lotes);
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
    setNuevoLote({ lote: "", cantidad_piezas: "" });
  };

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

  // Función para generar y descargar QR individual con código
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
      
      // Crear un canvas para agregar código debajo del QR
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 480; // Espacio extra para el código
        const ctx = canvas.getContext("2d");
        
        // Fondo blanco
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Dibujar QR (con logo integrado)
        ctx.drawImage(img, 0, 0, 400, 400);
        
        // Agregar código debajo (más grande)
        ctx.fillStyle = "#000000";
        ctx.font = "bold 28px Arial";
        ctx.textAlign = "center";
        ctx.fillText(codigo, 200, 440);
        
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
    const nombreCompleto = obtenerNombreCompleto(nombre || "", presentacion || "");
    setQrModalCodigo(codigo);
    setQrModalNombre(nombreCompleto);
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
    console.log("🟢 [IMPORTACIÓN] ===== INICIANDO PROCESO DE IMPORTACIÓN =====");
    console.log("🟢 [IMPORTACIÓN] Total de productos a importar:", datosImportar.length);
    console.log("🟢 [IMPORTACIÓN] Opción de importación:", opcionImportar);
    console.log("🟢 [IMPORTACIÓN] Errores de validación:", erroresValidacion.length);
    
    // Verificar que tenemos datos
    if (!datosImportar || datosImportar.length === 0) {
      console.error("❌ [IMPORTACIÓN] No hay datos para importar");
      pushToast("❌ No hay datos para importar", "err");
      return;
    }

    // Manejar errores de validación
    if (erroresValidacion && erroresValidacion.length > 0) {
      console.log("⚠️ [IMPORTACIÓN] Hay errores de validación, preguntando al usuario...");
      const confirmado = await showConfirm(
        `Hay ${erroresValidacion.length} error(es) de validación. ¿Deseas continuar de todos modos?`,
        "Errores de validación"
      );
      if (!confirmado) {
        console.log("❌ [IMPORTACIÓN] Usuario canceló por errores de validación");
        return;
      }
      console.log("✅ [IMPORTACIÓN] Usuario confirmó continuar a pesar de errores");
    }

    try {
      console.log("🟡 [IMPORTACIÓN] Estableciendo estado de importación...");
      
      // CRÍTICO: Establecer estado ANTES de cualquier await
      setImportando(true);
      setProgresoImportacion({ actual: 0, total: datosImportar.length, exitosos: 0, errores: 0 });
      
      console.log("🟡 [IMPORTACIÓN] Estado establecido - importando debería ser true ahora");
      console.log("🟡 [IMPORTACIÓN] Esperando 200ms para que React renderice...");
      
      // Pausa más larga para asegurar que React renderice
      await new Promise(resolve => setTimeout(resolve, 200));
      
      console.log("🟢 [IMPORTACIÓN] Comenzando procesamiento de productos...");
      
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
            console.warn("⚠️ No se encontró mapeo para 'codigo'. Mapeos disponibles:", mapeoColumnas);
            console.warn("⚠️ Primera fila de datos:", Object.keys(datosImportar[0] || {}));
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
            console.log(`[DEBUG Importación] Importando producto: Código: ${payload.codigo}, Categoría: "${payload.categoria}", Subcategoría: "${payload.subcategoria || 'N/A'}"`);
          }

          // Buscar si el producto ya existe
          const productoExistente = inventario.find(p => p.codigo === payload.codigo);

          if (productoExistente) {
            if (opcionImportar === "crear") {
              // Saltar si solo crear nuevos
              console.log(`[IMPORTACIÓN] Saltando producto existente (solo crear): ${payload.codigo}`);
              procesados++;
              setProgresoImportacion({ actual: procesados, total: datosImportar.length, exitosos, errores });
              continue;
            }
            
            // Actualizar producto existente
            console.log(`[IMPORTACIÓN] Actualizando producto existente: ${payload.codigo}`);
            await authFetch(`${SERVER_URL}/inventario/${productoExistente.id}`, {
              method: "PUT",
              body: JSON.stringify(payload),
            });
          } else {
            if (opcionImportar === "actualizar") {
              // Saltar si solo actualizar
              console.log(`[IMPORTACIÓN] Saltando producto nuevo (solo actualizar): ${payload.codigo}`);
              procesados++;
              setProgresoImportacion({ actual: procesados, total: datosImportar.length, exitosos, errores });
              continue;
            }
            
            // Crear nuevo producto
            console.log(`[IMPORTACIÓN] Creando nuevo producto: ${payload.codigo}`);
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

      await cargarInventario(true);
      
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
    const isAndroidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
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
            console.log("Web Share falló, intentando siguiente método:", e);
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
        console.log("Descarga falló:", e);
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
        console.log("Web Bluetooth falló, intentando métodos alternativos:", e);
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
        console.log("Descarga falló:", e);
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
          const errorMsg = result?.result || "Error desconocido";
          console.log("AndroidPrinter.printToBluetooth falló:", errorMsg);
          // Continuar con otros métodos
        }
      } catch (e) {
        console.log("Error con AndroidPrinter plugin:", e);
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
          console.log("window.AndroidPrinter.printToBluetooth falló:", result);
        }
      } catch (e) {
        console.log("Error con window.AndroidPrinter.printToBluetooth:", e);
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


  // Calcular si todos los productos están marcados para mostrar
  const todosMarcados = useMemo(() => {
    if (inventario.length === 0) return false;
    return inventario.every(p => {
      const valor = Number(p.mostrar_en_pagina || 0);
      return valor === 1;
    });
  }, [inventario]);

  const invFiltrado = useMemo(() => {
    const q = invQuery.trim().toLowerCase();

    const base = q
      ? inventario.filter(
        (p) =>
          (p.nombre || "").toLowerCase().includes(q) ||
          (p.presentacion || "").toLowerCase().includes(q) ||
          (p.codigo || "").toLowerCase().includes(q) ||
          (p.categoria || "").toLowerCase().includes(q) ||
          (p.subcategoria || "").toLowerCase().includes(q)
      )
      : inventario.slice();

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

  }, [inventario, invQuery]);

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
    <div className="card">
      {/* HEADER: Clases agregadas, style eliminado */}
      <div className="inventario-header">
        <h2 className="header-title">Inventario</h2>

        {/* Switches discretos y estéticos */}
        <div className="inventario-switches-container">
          <div className="inventario-switch-item">
            <label className="inventario-switch-label">
              <div className="inventario-switch-content">
                <span className="inventario-switch-text">Mostrar todo</span>
                <div className="switch switch-elegant">
                  <input
                    type="checkbox"
                    checked={todosMarcados}
                    onChange={async (e) => {
                      try {
                        const activar = e.target.checked;
                        
                        // Filtrar productos que necesitan actualización
                        const productosParaActualizar = inventario.filter(p => {
                          const estadoActual = Number(p.mostrar_en_pagina || 0);
                          const estadoDeseado = activar ? 1 : 0;
                          return estadoActual !== estadoDeseado;
                        });
                        
                        if (productosParaActualizar.length === 0) {
                          // Si no hay productos para actualizar, actualizar el estado local para reflejar el cambio
                          if (activar && inventario.some(p => Number(p.mostrar_en_pagina || 0) !== 1)) {
                            // Si se activa pero hay productos desactivados, activarlos todos
                            const todosIds = inventario.map(p => p.id);
                            await authFetch(`${SERVER_URL}/inventario/masivo/mostrar-en-pagina`, {
                              method: "PUT",
                              headers: {
                                "Content-Type": "application/json",
                              },
                              body: JSON.stringify({
                                ids: todosIds,
                                mostrar: true
                              }),
                            });
                            setInventario(prev => prev.map(p => ({ ...p, mostrar_en_pagina: 1 })));
                            pushToast(`✅ ${inventario.length} productos mostrados en página`, "ok");
                          } else if (!activar && inventario.some(p => Number(p.mostrar_en_pagina || 0) === 1)) {
                            // Si se desactiva pero hay productos activados, desactivarlos todos
                            const todosIds = inventario.map(p => p.id);
                            await authFetch(`${SERVER_URL}/inventario/masivo/mostrar-en-pagina`, {
                              method: "PUT",
                              headers: {
                                "Content-Type": "application/json",
                              },
                              body: JSON.stringify({
                                ids: todosIds,
                                mostrar: false
                              }),
                            });
                            setInventario(prev => prev.map(p => ({ ...p, mostrar_en_pagina: 0 })));
                            pushToast(`⚠️ ${inventario.length} productos ocultos de la página`, "err");
                          } else {
                            pushToast("No hay productos para actualizar", "info");
                          }
                          return;
                        }

                        // Usar endpoint masivo para mayor eficiencia
                        const ids = productosParaActualizar.map(p => p.id);
                        await authFetch(`${SERVER_URL}/inventario/masivo/mostrar-en-pagina`, {
                          method: "PUT",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            ids,
                            mostrar: activar ? 1 : 0
                          }),
                        });

                        // Actualizar estado local SIN recargar (evita salto de scroll)
                        // Asegurar que el estado se actualice correctamente usando función de actualización
                        setInventario(prev => {
                          const actualizado = prev.map(p => {
                            if (ids.includes(p.id)) {
                              return { ...p, mostrar_en_pagina: activar ? 1 : 0 };
                            }
                            return p;
                          });
                          return actualizado;
                        });

                        // Toast verde si se muestran, rojo si se ocultan
                        pushToast(
                          activar 
                            ? `✅ ${productosParaActualizar.length} productos mostrados en página` 
                            : `⚠️ ${productosParaActualizar.length} productos ocultos de la página`,
                          activar ? "ok" : "err"
                        );
                      } catch (err) {
                        console.error("Error actualizando productos:", err);
                        pushToast("❌ Error actualizando productos: " + (err.message || "Error desconocido"), "err");
                        // Revertir el estado del switch en caso de error
                        e.target.checked = !e.target.checked;
                      }
                    }}
                  />
                  <span className="slider"></span>
                </div>
              </div>
            </label>
          </div>
        </div>

        <div className="search-container">
          <input
            className="search-input"
            placeholder="Buscar (código, nombre, presentación, categoría o subcategoría)"
            value={invQuery}
            onChange={(e) => setInvQuery(e.target.value)}
          />
          {!!invQuery && (
            <button onClick={() => setInvQuery("")} className="btn-limpiar">
              ×
            </button>
          )}
          <button
            className="btn-generar-doc"
            onClick={descargarQRsIndividuales}
            title="Descargar todos los QRs individuales con código"
            style={{
              marginLeft: "10px",
              padding: "8px 16px",
              background: "var(--color-secundario, #1e40af)",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: "500",
            }}
          >
            📱 Descargar QRs
          </button>
          <button
            className="btn-generar-doc"
            onClick={generarDocumentoCompleto}
            title="Generar documento Word con todos los productos (nombre, presentación y QR)"
            style={{
              marginLeft: "10px",
              padding: "8px 16px",
              background: "var(--color-primario, #3b82f6)",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: "500",
            }}
          >
            📄 Generar Documento
          </button>
          <button
            className="btn-generar-doc"
            onClick={exportarInventario}
            title="Exportar inventario a Excel"
            style={{
              marginLeft: "10px",
              padding: "8px 16px",
              background: "var(--color-success, #10b981)",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: "500",
            }}
          >
            📥 Exportar Inventario
          </button>
          <button
            className="btn-generar-doc"
            onClick={() => setShowModalImportar(true)}
            title="Importar inventario desde Excel o CSV"
            style={{
              marginLeft: "10px",
              padding: "8px 16px",
              background: "var(--color-warning, #f59e0b)",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: "500",
            }}
          >
            📤 Importar Inventario
          </button>
        </div>

        <button className="btn-add" onClick={abrirAddInv}>
          +
        </button>
      </div>

      {/* TABLA: Margin movido al CSS */}
      <div className="tabla-container">
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
                        <th style={{ textAlign: "center" }}>Mostrar</th>
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
                                onClick={() => generarQRIndividual(p.codigo, p.nombre, p.presentacion)}
                                title="Generar y descargar QR"
                                style={{
                                  background: "var(--color-secundario, #1e40af)",
                                }}
                              >
                                📱
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
                          <td>{p.nombre}</td>
                          <td>{p.presentacion || "-"}</td>
                          <td>{p.categoria}</td>
                          <td>{p.piezas_por_caja || "-"}</td>

                          <td>
                            <div className="lote-display-cell">
                              {p.lote || "- Sin lote -"}
                            </div>
                          </td>

                          <td style={{ textAlign: "center" }}>
                            <label
                              className="switch"
                              style={{
                                opacity: !can("tab:inventario") ? 0.5 : 1,
                                display: "inline-flex",
                                cursor: can("tab:inventario") ? "pointer" : "not-allowed",
                              }}
                              title={
                                !can("tab:inventario")
                                  ? "No tienes autorización para mostrar/ocultar productos"
                                  : Number(p.mostrar_en_pagina || 0) === 1
                                  ? "Ocultar producto en página"
                                  : "Mostrar producto en página"
                              }
                            >
                              <input
                                type="checkbox"
                                checked={Number(p.mostrar_en_pagina || 0) === 1}
                                onChange={async (e) => {
                                  const nuevoEstado = e.target.checked;
                                  const valorAnterior = Number(p.mostrar_en_pagina || 0);
                                  
                                  // Actualizar estado local INMEDIATAMENTE para feedback visual
                                  setInventario(prev => prev.map(prod => {
                                    if (prod.id === p.id) {
                                      return { ...prod, mostrar_en_pagina: nuevoEstado ? 1 : 0 };
                                    }
                                    return prod;
                                  }));
                                  
                                  try {
                                    // Actualizar en el servidor
                                    const response = await authFetch(`${SERVER_URL}/inventario/${p.id}`, {
                                      method: "PUT",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                      body: JSON.stringify({
                                        mostrar_en_pagina: nuevoEstado ? 1 : 0
                                      }),
                                    });
                                    
                                    // Si el servidor devuelve el producto actualizado, usarlo para asegurar sincronización
                                    if (response && response.mostrar_en_pagina !== undefined) {
                                      setInventario(prev => prev.map(prod => {
                                        if (prod.id === p.id) {
                                          return { ...prod, mostrar_en_pagina: Number(response.mostrar_en_pagina) };
                                        }
                                        return prod;
                                      }));
                                    }
                                    
                                    // Toast verde si se muestra, rojo si se oculta
                                    pushToast(
                                      nuevoEstado 
                                        ? "✅ Producto mostrado en página" 
                                        : "⚠️ Producto oculto de la página",
                                      nuevoEstado ? "ok" : "err"
                                    );
                                  } catch (err) {
                                    console.error("Error actualizando mostrar_en_pagina:", err);
                                    pushToast("❌ Error actualizando: " + (err.message || "Error desconocido"), "err");
                                    
                                    // Revertir el estado local en caso de error
                                    setInventario(prev => prev.map(prod => {
                                      if (prod.id === p.id) {
                                        return { ...prod, mostrar_en_pagina: valorAnterior };
                                      }
                                      return prod;
                                    }));
                                  }
                                }}
                                disabled={!can("tab:inventario")}
                              />
                              <span className="slider"></span>
                            </label>
                          </td>

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
                                cargarLotesDelProducto(p.codigo);
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
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
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
              <div className="modal-qr-info">
                <div className="modal-qr-codigo">{qrModalCodigo}</div>
                {qrModalNombre && <div className="modal-qr-nombre">{qrModalNombre}</div>}
              </div>
              <div className="modal-qr-box">
                {qrModalLoading ? (
                  <div className="modal-qr-loading">Generando QR…</div>
                ) : qrModalUrl ? (
                  <img src={qrModalUrl} alt={`QR ${qrModalCodigo}`} />
                ) : (
                  <div className="modal-qr-error">No se pudo cargar el QR</div>
                )}
              </div>
              {qrModalUrl && (
                <button
                  className="btn-primary"
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = qrModalUrl;
                    a.download = `QR_${qrModalCodigo}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
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
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "10px", alignItems: "end" }}>
                        <div>
                          <label>Lote:</label>
                          <input
                            type="text"
                            placeholder="Ej: L001"
                            value={nuevoLote.lote}
                            onChange={(e) => setNuevoLote({ ...nuevoLote, lote: e.target.value })}
                          />
                        </div>
                        <div>
                          <label>Laboratorio:</label>
                          <input
                            type="text"
                            placeholder="Laboratorio"
                            value={nuevoLote.laboratorio}
                            onChange={(e) => setNuevoLote({ ...nuevoLote, laboratorio: e.target.value })}
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
                              // 🔥 SOLO AGREGAR EL LOTE SIN PIEZAS (como pidió el usuario)
                              await authFetch(`${SERVER_URL}/inventario/lotes/${editInv.codigo}/nuevo`, {
                                method: "POST",
                                body: JSON.stringify({
                                  lote: loteAgregado,
                                  cantidad_piezas: 0, // 🔥 Siempre 0 - solo agregar el lote, no piezas
                                  laboratorio: (nuevoLote.laboratorio && nuevoLote.laboratorio.trim()) || null,
                                  activo: true, // Al agregar desde aquí, se marca como activo
                                }),
                              });
                              
                              pushToast("✅ Lote agregado y marcado como activo", "ok");
                              
                              // Recargar todos los lotes del servidor para asegurar que tenemos los datos correctos
                              await cargarLotesDelProducto(editInv.codigo);
                              
                              // Limpiar el formulario
                              setNuevoLote({ lote: "", cantidad_piezas: "", laboratorio: "" });
                              
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
                                            await cargarLotesDelProducto(editInv.codigo);
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
                                              activo: l.activo === 1,
                                            }),
                                          });
                                          
                                          // Recargar lotes desde el servidor para asegurar sincronización
                                          await cargarLotesDelProducto(editInv.codigo);
                                          
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
            <h3>Códigos alternos de: {obtenerNombreCompleto(codigoEditando?.nombre, codigoEditando?.presentacion)}</h3>

            <div className="codigos-list">
              {codigosProd.map((c) => (
                <div key={c} className="codigo-item">
                  <span>{c}</span>

                  <button
                    className="btn-borrar"
                    onClick={async () => {
                      try {
                        await authFetch(
                          `${SERVER_URL}/api/inventario/codigos/${codigoEditando.codigo}/${c}`,
                          {
                            method: "DELETE",
                          }
                        );
                        setCodigosProd((prev) =>
                          prev.filter((x) => x !== c)
                        );
                        pushToast?.("✅ Código eliminado", "ok");
                      } catch (err) {
                        pushToast?.("❌ Error eliminando código: " + err.message, "err");
                      }
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <input
              placeholder="Nuevo código"
              value={codigoNuevo}
              onChange={(e) => setCodigoNuevo(e.target.value)}
            />

            <button
              className="btn-editar mt-8"
              onClick={async () => {
                if (!codigoNuevo.trim()) return;

                try {
                  await authFetch(
                    `${SERVER_URL}/inventario/codigos/${codigoEditando.codigo}`,
                    {
                      method: "POST",
                      body: JSON.stringify({ codigo: codigoNuevo }),
                    }
                  );

                  setCodigosProd((prev) => [...prev, codigoNuevo]);
                  setCodigoNuevo("");
                  pushToast?.("✅ Código agregado", "ok");
                } catch (err) {
                  pushToast?.("❌ Error agregando código: " + err.message, "err");
                }
              }}
            >
              Agregar
            </button>
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
          <div className="modal-content modal-importar" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "900px", maxHeight: "90vh", overflow: "auto" }}>
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
                    console.log("🔵 BOTÓN CLICKEADO - Iniciando importación");
                    console.log("🔵 Estado actual - importando:", importando);
                    console.log("🔵 Datos a importar:", datosImportar.length);
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
    </div>
  );
}

// Componente Modal Agregar
function ModalAgregar({ formInv, setFormInv, CATS_SAFE, SERVER_URL, authFetch, setInventario, pushToast, setShowAddInv }) {

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
                    console.warn("⚠️ No se pudo agregar el lote automáticamente:", loteErr);
                  }
                }
                
                // Agregar al estado local SIN recargar (evita salto de scroll)
                if (nuevoProducto && nuevoProducto.id) {
                  setInventario(prev => [...prev, nuevoProducto].sort((a, b) =>
                    (a.nombre || "").localeCompare(b.nombre || "", "es")
                  ));
                } else {
                  // Si no se recibe el producto, crear uno básico con el payload
                  setInventario(prev => [...prev, { 
                    ...payload, 
                    id: Date.now(), // ID temporal
                    mostrar_en_pagina: 0
                  }].sort((a, b) =>
                    (a.nombre || "").localeCompare(b.nombre || "", "es")
                  ));
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
  );
}