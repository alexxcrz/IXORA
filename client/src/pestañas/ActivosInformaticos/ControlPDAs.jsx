import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../../AuthContext";
import { useAlert } from "../../components/AlertModal";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import { applyPlugin } from "jspdf-autotable";
import "./ActivosInformaticos.css";

applyPlugin(jsPDF);

export default function ControlPDAs({ serverUrl }) {
  const { authFetch } = useAuth();
  const { showConfirm, showAlert } = useAlert();
  const [pdas, setPdas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editarId, setEditarId] = useState(null);
  
  // Formulario
  const [formPDA, setFormPDA] = useState("");
  const [formIMEI, setFormIMEI] = useState("");
  const [formModeloPDA, setFormModeloPDA] = useState("");
  const [formAndroid, setFormAndroid] = useState("");
  const [formImpresora, setFormImpresora] = useState("");
  const [formSeriePDA, setFormSeriePDA] = useState("");
  const [formModeloImpresora, setFormModeloImpresora] = useState("");
  const [formEncargado, setFormEncargado] = useState("");
  const [formResponsable, setFormResponsable] = useState("");
  const [formArea, setFormArea] = useState("");
  const [formObservaciones, setFormObservaciones] = useState("");
  
  // Modal QR
  const [modalQR, setModalQR] = useState(false);
  const [qrPDA, setQrPDA] = useState(null);
  const [qrImage, setQrImage] = useState(null);
  const [textoQR, setTextoQR] = useState("");
  
  // Estados para importación
  const [showModalImportar, setShowModalImportar] = useState(false);
  const [archivoImportar, setArchivoImportar] = useState(null);
  const [datosImportar, setDatosImportar] = useState([]);
  const [columnasArchivo, setColumnasArchivo] = useState([]);
  const [mapeoColumnas, setMapeoColumnas] = useState({});
  const [vistaPrevia, setVistaPrevia] = useState([]);
  const [erroresValidacion, setErroresValidacion] = useState([]);
  const [importando, setImportando] = useState(false);
  const [progresoImportacion, setProgresoImportacion] = useState(0);
  const fileInputRef = useRef(null);
  const importandoRef = useRef(false);
  
  // Estados para drag and drop
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [menuAbierto, setMenuAbierto] = useState(false);

  // Cargar datos
  const cargar = async () => {
    try {
      setLoading(true);
      const data = await authFetch(`${serverUrl}/activos/pdas`);
      setPdas(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Error cargando PDAs:", e);
    } finally {
      setLoading(false);
    }
  };

  // Sincronizar ref con estado (debe estar antes del useEffect que lo usa)
  useEffect(() => {
    importandoRef.current = importando;
  }, [importando]);

  useEffect(() => {
    cargar();
    
    // DESACTIVADO: Las actualizaciones de socket causaban recargas y saltos de scroll
    // Los datos se actualizan localmente cuando el usuario hace cambios
    
    // const socket = window.socket;
    // const handleUpdate = () => {
    //   if (importandoRef && !importandoRef.current) {
    //     cargar();
    //   }
    // };
    // socket.on("activos_actualizados", handleUpdate);
    // return () => {
    //   socket.off("activos_actualizados", handleUpdate);
    // };
  }, [serverUrl]);

  // Cerrar menú al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuAbierto && !event.target.closest('.menu-desplegable-activos')) {
        setMenuAbierto(false);
      }
    };
    if (menuAbierto) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuAbierto]);

  // Extraer número del equipo para el texto del QR
  const extraerNumeroEquipo = (equipo) => {
    if (!equipo) return "";
    
    // Caso 1: "PDA No. 1", "PDA No. 2", etc. -> "01", "02"
    const matchNo = equipo.match(/No\.\s*(\d+)/i);
    if (matchNo) {
      return matchNo[1].padStart(2, "0");
    }
    
    // Caso 2: "PDA X01", "PDA X02" -> "X01", "X02"
    const matchX = equipo.match(/[X](\d+)/i);
    if (matchX) {
      return "X" + matchX[1];
    }
    
    // Caso 3: "PDA Mayoreo 1", "PDA Mayoreo 2" -> "01", "02"
    const matchMayoreo = equipo.match(/(?:Mayoreo|mayoreo)\s*(\d+)/i);
    if (matchMayoreo) {
      return matchMayoreo[1].padStart(2, "0");
    }
    
    // Caso 4: Cualquier número al final o en el texto
    const numMatch = equipo.match(/(\d+)/);
    if (numMatch) {
      const num = numMatch[1];
      // Si el número está al final y es corto, formatearlo
      if (equipo.trim().endsWith(num)) {
        return num.padStart(2, "0");
      }
      return num;
    }
    
    return "";
  };

  // Abrir modal para crear/editar PDA
  const abrirModal = (pda = null) => {
    if (pda) {
      setEditarId(pda.id);
      setFormPDA(pda.pda || "");
      setFormIMEI(pda.imei || "");
      setFormModeloPDA(pda.modelo_pda || "");
      setFormAndroid(pda.android || "");
      setFormImpresora(pda.impresora || "");
      setFormSeriePDA(pda.serie_pda || "");
      setFormModeloImpresora(pda.modelo_impresora || "");
      setFormEncargado(pda.encargado || "");
      setFormResponsable(pda.responsable || "");
      setFormArea(pda.area || "");
      setFormObservaciones(pda.observaciones || "");
    } else {
      setEditarId(null);
      setFormPDA("");
      setFormIMEI("");
      setFormModeloPDA("");
      setFormAndroid("");
      setFormImpresora("");
      setFormSeriePDA("");
      setFormModeloImpresora("");
      setFormEncargado("");
      setFormResponsable("");
      setFormArea("");
      setFormObservaciones("");
    }
    setModalAbierto(true);
  };

  // Guardar PDA
  const guardarPDA = async () => {
    if (!formPDA) {
      await showAlert("Por favor ingresa el identificador del PDA", "warning");
      return;
    }

    const datosForm = {
      pda: formPDA,
      imei: formIMEI,
      modelo_pda: formModeloPDA,
      android: formAndroid,
      impresora: formImpresora,
      serie_pda: formSeriePDA,
      modelo_impresora: formModeloImpresora,
      encargado: formEncargado,
      responsable: formResponsable,
      area: formArea,
      observaciones: formObservaciones,
    };

    try {
      if (editarId) {
        await authFetch(`${serverUrl}/activos/pdas/${editarId}`, {
          method: "PUT",
          body: JSON.stringify(datosForm),
        });
        // Actualizar estado local SIN recargar (evita salto de scroll)
        setPdas(prev => prev.map(p => 
          p.id === editarId 
            ? { ...p, ...datosForm }
            : p
        ));
        await showAlert("PDA actualizado correctamente", "success");
      } else {
        const nuevo = await authFetch(`${serverUrl}/activos/pdas`, {
          method: "POST",
          body: JSON.stringify(datosForm),
        });
        // Agregar al estado local SIN recargar
        if (nuevo && nuevo.id) {
          setPdas(prev => [...prev, nuevo]);
        } else {
          // Fallback: recargar si no devuelve el objeto
          await cargar();
        }
        await showAlert("PDA creado correctamente", "success");
      }
      setModalAbierto(false);
    } catch (e) {
      console.error("Error guardando PDA:", e);
      await showAlert("Error al guardar PDA", "error");
    }
  };

  // Eliminar PDA
  const eliminarPDA = async (id) => {
    const confirmado = await showConfirm(
      "¿Eliminar PDA?",
      "¿Estás seguro de eliminar este PDA y su complemento?"
    );
    if (!confirmado) return;

    try {
      await authFetch(`${serverUrl}/activos/pdas/${id}`, {
        method: "DELETE",
      });
      // Eliminar del estado local SIN recargar (evita salto de scroll)
      setPdas(prev => prev.filter(p => p.id !== id));
      await showAlert("PDA eliminado correctamente", "success");
    } catch (e) {
      console.error("Error eliminando PDA:", e);
      await showAlert("Error al eliminar PDA", "error");
    }
  };

  // Generar QR
  const generarQR = async (pda) => {
    try {
      const numeroEquipo = extraerNumeroEquipo(pda.pda || pda.equipo_pda);
      const areaPDA = pda.area || pda.unidad || "";
      const texto = `${areaPDA} ${numeroEquipo}`;
      
      // Cargar QR como blob y convertir a base64 para que funcione con autenticación
      // Asegurar que la URL use el mismo protocolo que la página actual
      let qrUrl = `${serverUrl}/activos/pdas/${pda.id}/qr?t=${Date.now()}`;
      // Si la página está en HTTPS pero serverUrl es HTTP, usar HTTPS
      if (window.location.protocol === 'https:' && qrUrl.startsWith('http://')) {
        qrUrl = qrUrl.replace('http://', 'https://');
      }
      
      const token = localStorage.getItem("token");
      
      if (!token) {
        throw new Error("No hay token de autenticación");
      }
      
      const response = await fetch(qrUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error al cargar QR: ${response.status} - ${errorText}`);
      }
      
      const blob = await response.blob();
      
      // Convertir blob a base64
      const base64Image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      
      setQrPDA(pda);
      setQrImage(base64Image);
      setTextoQR(texto);
      setModalQR(true);
    } catch (e) {
      console.error("Error generando QR:", e);
      await showAlert("Error al generar QR: " + (e.message || "Error desconocido"), "error");
    }
  };


  // ============================================================
  // FUNCIONES DE IMPORTACIÓN
  // ============================================================

  // Función para leer archivo Excel o CSV
  async function leerArchivo(file) {
    return new Promise((resolve, reject) => {
      const workbook = new ExcelJS.Workbook();
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const data = e.target.result;

          if (file.name.endsWith('.csv')) {
            const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
            const lines = text.split('\n').filter(line => line.trim());
            
            if (lines.length === 0) {
              reject(new Error("El archivo CSV está vacío"));
              return;
            }

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
              return Object.values(row).some(val => val && val.toString().trim());
            });
            
            resolve({ headers, rows });
          } else {
            await workbook.xlsx.load(data);
            const worksheet = workbook.worksheets[0];
            
            if (worksheet.rowCount === 0) {
              reject(new Error("El archivo Excel está vacío"));
              return;
            }
            
            const headerRow = worksheet.getRow(1);
            const headers = [];
            headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
              headers.push(cell.value?.toString() || `Columna${colNumber}`);
            });
            
            const rows = [];
            for (let i = 2; i <= worksheet.rowCount; i++) {
              const row = worksheet.getRow(i);
              const rowData = {};
              headers.forEach((header, index) => {
                const cell = row.getCell(index + 1);
                rowData[header] = cell.value?.toString() || "";
              });
              
              if (Object.values(rowData).some(val => val && val.toString().trim())) {
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

  // Función para detectar columnas y mapear
  function detectarColumnasYMapear(headers) {
    const columnasSistema = {
      "area": ["area", "área", "unidad", "unit", "departamento"],
      "responsable": ["responsable", "nombre", "name", "persona"],
      "pda": ["pda", "equipo", "equipo_pda", "dispositivo"],
      "imei": ["imei", "imei pda"],
      "modelo_pda": ["modelo pda", "modelo_pda", "modelo", "model"],
      "android": ["android", "versión android", "version android"],
      "impresora": ["impresora", "complemento"],
      "serie_pda": ["serie pda", "serie_pda", "serie", "serial pda"],
      "modelo_impresora": ["modelo impresora", "modelo_impresora", "modelo complemento"],
      "encargado": ["encargado", "asignado a"],
      "observaciones": ["observaciones", "observaciones pda", "notas", "comentarios"]
    };

    const mapeo = {};
    headers.forEach(header => {
      const headerLower = header.toLowerCase().trim();
      let mapeado = false;

      for (const [campoSistema, variantes] of Object.entries(columnasSistema)) {
        if (variantes.some(v => headerLower.includes(v) || v.includes(headerLower))) {
          mapeo[header] = campoSistema;
          mapeado = true;
          break;
        }
      }

      if (!mapeado) {
        mapeo[header] = null;
      }
    });

    return { mapeo };
  }

  // Función para validar datos (solo valida PDA, área y responsable se mantienen del contexto en procesarImportacion)
  function validarDatos(rows, mapeo) {
    const errores = [];
    
    rows.forEach((row, index) => {
      const numFila = index + 2;
      
      const areaKey = Object.keys(mapeo).find(k => mapeo[k] === "area");
      const pdaKey = Object.keys(mapeo).find(k => mapeo[k] === "pda");
      
      // Obtener valores
      const area = areaKey ? (row[areaKey]?.toString().trim() || null) : null;
      const pda = pdaKey ? (row[pdaKey]?.toString().trim() || null) : null;
      
      // Solo validar PDA (obligatorio), área y responsable pueden venir del contexto en procesarImportacion
      if (!pda) {
        errores.push(`Fila ${numFila}: Falta el PDA`);
      }
      
      // Solo marcar error de área si es la primera fila y no hay área
      if (index === 0 && !area) {
        errores.push(`Fila ${numFila}: Falta el área`);
      }
    });

    return errores;
  }

  // Función para manejar selección de archivo
  async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls') && !file.name.endsWith('.csv')) {
      await showAlert("Por favor selecciona un archivo Excel (.xlsx, .xls) o CSV", "warning");
      return;
    }

    try {
      setArchivoImportar(file);
      await showAlert("⏳ Leyendo archivo, por favor espera...", "info");
      
      const { headers, rows } = await leerArchivo(file);
      
      if (rows.length === 0) {
        await showAlert("El archivo no contiene datos", "warning");
        return;
      }

      const { mapeo } = detectarColumnasYMapear(headers);
      
      setColumnasArchivo(headers);
      setMapeoColumnas(mapeo);
      setDatosImportar(rows);
      
      const errores = validarDatos(rows, mapeo);
      setErroresValidacion(errores);
      
      setVistaPrevia(rows.slice(0, 5));
      
      await showAlert(`Archivo leído: ${rows.length} registro(s) encontrado(s)`, "success");
    } catch (err) {
      console.error("Error leyendo archivo:", err);
      await showAlert("Error al leer el archivo: " + err.message, "error");
    }
  }

  // Función para procesar importación
  async function procesarImportacion() {
    if (datosImportar.length === 0) {
      await showAlert("No hay datos para importar", "warning");
      return;
    }

    if (erroresValidacion.length > 0) {
      const confirmado = await showConfirm(
        `Hay ${erroresValidacion.length} error(es) de validación. ¿Deseas continuar de todos modos?`,
        "Errores de validación"
      );
      if (!confirmado) return;
    }

    try {
      setImportando(true);
      importandoRef.current = true;
      setProgresoImportacion(0);
      
      let exitosos = 0;
      let errores = 0;
      const erroresDetalle = [];
      
      // Mantener contexto del área y responsable actual (para filas que no tienen estos campos)
      let areaActual = null;
      let responsableActual = null;
      let encargadoActual = null;

      const totalFilas = datosImportar.length;

      // Procesar cada fila en orden exacto del archivo
      for (let idx = 0; idx < datosImportar.length; idx++) {
        const row = datosImportar[idx];
        try {
          // Actualizar progreso
          setProgresoImportacion(Math.round(((idx + 1) / totalFilas) * 100));
          const areaKey = Object.keys(mapeoColumnas).find(k => mapeoColumnas[k] === "area");
          const responsableKey = Object.keys(mapeoColumnas).find(k => mapeoColumnas[k] === "responsable");
          const pdaKey = Object.keys(mapeoColumnas).find(k => mapeoColumnas[k] === "pda");
          const imeiKey = Object.keys(mapeoColumnas).find(k => mapeoColumnas[k] === "imei");
          const modeloPDAKey = Object.keys(mapeoColumnas).find(k => mapeoColumnas[k] === "modelo_pda");
          const androidKey = Object.keys(mapeoColumnas).find(k => mapeoColumnas[k] === "android");
          const impresoraKey = Object.keys(mapeoColumnas).find(k => mapeoColumnas[k] === "impresora");
          const seriePDAKey = Object.keys(mapeoColumnas).find(k => mapeoColumnas[k] === "serie_pda");
          const modeloImpresoraKey = Object.keys(mapeoColumnas).find(k => mapeoColumnas[k] === "modelo_impresora");
          const encargadoKey = Object.keys(mapeoColumnas).find(k => mapeoColumnas[k] === "encargado");
          const observacionesKey = Object.keys(mapeoColumnas).find(k => mapeoColumnas[k] === "observaciones");

          // Buscar valores usando el mapeo exacto (sin modificar los valores)
          let area = areaKey ? (row[areaKey]?.toString().trim() || null) : null;
          let responsable = responsableKey ? (row[responsableKey]?.toString().trim() || null) : null;
          let pda = pdaKey ? (row[pdaKey]?.toString().trim() || null) : null;
          let imei = imeiKey ? (row[imeiKey]?.toString().trim() || null) : null;
          let modelo_pda = modeloPDAKey ? (row[modeloPDAKey]?.toString().trim() || null) : null;
          let android = androidKey ? (row[androidKey]?.toString().trim() || null) : null;
          let impresora = impresoraKey ? (row[impresoraKey]?.toString().trim() || null) : null;
          let serie_pda = seriePDAKey ? (row[seriePDAKey]?.toString().trim() || null) : null;
          let modelo_impresora = modeloImpresoraKey ? (row[modeloImpresoraKey]?.toString().trim() || null) : null;
          let encargado = encargadoKey ? (row[encargadoKey]?.toString().trim() || null) : null;
          let observaciones = observacionesKey ? (row[observacionesKey]?.toString().trim() || null) : null;
          
          // Si no se encontró área o responsable, usar el contexto del anterior
          if (!area && areaActual) {
            area = areaActual;
          }
          if (!responsable && responsableActual) {
            responsable = responsableActual;
          }
          if (!encargado && encargadoActual) {
            encargado = encargadoActual;
          }
          
          // Actualizar contexto si hay valores nuevos
          if (area) areaActual = area;
          if (responsable) responsableActual = responsable;
          if (encargado) encargadoActual = encargado;
          
          // Búsqueda flexible si no se encontró por mapeo (solo para campos obligatorios)
          if (!area) {
            for (const [key, value] of Object.entries(row)) {
              if (key && value && (key.toLowerCase().includes("area") || key.toLowerCase().includes("área") || key.toLowerCase().includes("unidad"))) {
                area = value.toString().trim();
                areaActual = area;
                break;
              }
            }
          }

          if (!pda) {
            for (const [key, value] of Object.entries(row)) {
              if (key && value && (key.toLowerCase().includes("pda") || key.toLowerCase().includes("equipo"))) {
                pda = value.toString().trim();
                break;
              }
            }
          }

          // Búsqueda específica para modelo_impresora PRIMERO (prioridad)
          if (!modelo_impresora) {
            for (const [key, value] of Object.entries(row)) {
              if (key && value) {
                const keyLower = key.toLowerCase();
                // Debe contener "impresora" o "complemento" Y "modelo"
                if ((keyLower.includes("impresora") || keyLower.includes("complemento")) && 
                    (keyLower.includes("modelo") || keyLower.includes("model"))) {
                  modelo_impresora = value.toString().trim();
                  break;
                }
              }
            }
          }

          // Búsqueda específica para modelo_pda (debe contener "pda" y "modelo", pero NO "impresora" ni "complemento")
          if (!modelo_pda) {
            for (const [key, value] of Object.entries(row)) {
              if (key && value) {
                const keyLower = key.toLowerCase();
                // Debe contener "pda" y "modelo", pero NO "impresora" ni "complemento"
                if ((keyLower.includes("modelo") || keyLower.includes("model")) && 
                    keyLower.includes("pda") && 
                    !keyLower.includes("impresora") && 
                    !keyLower.includes("complemento")) {
                  modelo_pda = value.toString().trim();
                  break;
                }
              }
            }
          }

          // Solo validar PDA (obligatorio), área puede venir del contexto
          if (!pda) {
            errores++;
            erroresDetalle.push(`Fila ${idx + 2}: Falta el PDA`);
            continue;
          }
          
          // Solo validar área si es la primera fila y no hay área
          if (idx === 0 && !area) {
            errores++;
            erroresDetalle.push(`Fila ${idx + 2}: Falta el área en la primera fila`);
            continue;
          }

          await authFetch(`${serverUrl}/activos/pdas`, {
            method: "POST",
            body: JSON.stringify({
              area: area,
              unidad: area,
              responsable: responsable || null,
              pda: pda,
              equipo_pda: pda,
              imei: imei || null,
              modelo_pda: modelo_pda || null,
              android: android || null,
              impresora: impresora || null,
              serie_pda: serie_pda || null,
              modelo_impresora: modelo_impresora || null,
              encargado: encargado || null,
              observaciones: observaciones || null
            }),
          });
          exitosos++;
        } catch (err) {
          errores++;
          erroresDetalle.push(`Error procesando fila: ${err.message}`);
        }
      }

      // Cerrar modal y limpiar estados ANTES de recargar
      setShowModalImportar(false);
      setArchivoImportar(null);
      setDatosImportar([]);
      setColumnasArchivo([]);
      setMapeoColumnas({});
      setVistaPrevia([]);
      setErroresValidacion([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      // IMPORTANTE: Desactivar importando ANTES de recargar para evitar parpadeos
      setImportando(false);
      setProgresoImportacion(0);
      
      // Pequeño delay para asegurar que el estado se actualice
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Recargar datos solo al final (después de desactivar importando)
      await cargar();
      
      await showAlert(
        `Importación completada: ${exitosos} PDA(s) procesado(s)${errores > 0 ? `, ${errores} error(es)` : ""}`,
        exitosos > 0 ? "success" : "error"
      );

      if (erroresDetalle.length > 0) {
        console.error("Errores de importación:", erroresDetalle);
      }
    } catch (err) {
      console.error("Error en importación:", err);
      setImportando(false);
      importandoRef.current = false;
      setProgresoImportacion(0);
      await showAlert("Error al importar: " + err.message, "error");
    }
  }

  // Exportar a PDF
  const exportarPDF = async () => {
    if (pdasOrdenados.length === 0) {
      await showAlert("No hay datos para exportar", "warning");
      return;
    }

    try {
      const doc = new jsPDF("landscape", "mm", "a4");
      
      // Título
      doc.setFontSize(16);
      doc.setFont(undefined, "bold");
      doc.text("Control de PDAs", 14, 15);
      
      // Fecha de generación
      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      const fechaGen = new Date().toLocaleString("es-MX");
      doc.text(`Generado el: ${fechaGen}`, 14, 22);
      
      // Preparar datos de la tabla
      const tableData = pdasOrdenados.map(pda => [
        pda.pda || pda.equipo_pda || "-",
        pda.imei || "-",
        pda.modelo_pda || "-",
        pda.android || "-",
        pda.impresora || "-",
        pda.serie_pda || "-",
        pda.modelo_impresora || "-",
        pda.encargado || "-",
        pda.responsable || "-",
        pda.area || pda.unidad || "-",
        pda.observaciones || "-"
      ]);

      // Crear tabla
      doc.autoTable({
        startY: 28,
        head: [["PDA", "IMEI", "MODELO PDA", "ANDROID", "IMPRESORA", "SERIE PDA", "MODELO Impresora", "Encargado", "Responsable", "AREA", "OBSERVACIONES PDA"]],
        body: tableData,
        styles: { 
          fontSize: 7,
          cellPadding: 2
        },
        headStyles: { 
          fillColor: [59, 130, 246],
          textColor: 255,
          fontStyle: "bold"
        },
        alternateRowStyles: {
          fillColor: [245, 247, 250]
        },
        margin: { left: 14, right: 14 },
        tableWidth: "auto"
      });

      // Guardar PDF
      const fechaArchivo = new Date().toISOString().split("T")[0];
      doc.save(`Control_PDAs_${fechaArchivo}.pdf`);
      await showAlert("PDF generado correctamente", "success");
    } catch (err) {
      console.error("Error generando PDF:", err);
      await showAlert("Error al generar el PDF", "error");
    }
  };

  // Exportar a Excel
  const exportarExcel = async () => {
    try {
      const response = await fetch(`${serverUrl}/activos/pdas/exportar`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Control_PDAs_${new Date().toISOString().split("T")[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        await showAlert("Archivo exportado correctamente", "success");
      } else {
        await showAlert("Error al exportar el archivo", "error");
      }
    } catch (e) {
      console.error("Error exportando:", e);
      await showAlert("Error al exportar", "error");
    }
  };

  // Ordenar PDAs por campo 'orden' si existe, sino por área y responsable
  const pdasOrdenados = [...pdas].sort((a, b) => {
    // Si ambos tienen campo orden, usar ese
    if (a.orden !== undefined && a.orden !== null && b.orden !== undefined && b.orden !== null) {
      if (a.orden !== b.orden) {
        return a.orden - b.orden;
      }
      // Si tienen el mismo orden, usar ID como desempate
      return (a.id || 0) - (b.id || 0);
    }
    // Si solo uno tiene orden, ese va primero
    if (a.orden !== undefined && a.orden !== null) return -1;
    if (b.orden !== undefined && b.orden !== null) return 1;
    // Si ninguno tiene orden, ordenar por área y responsable
    const areaA = (a.area || a.unidad || "").toLowerCase();
    const areaB = (b.area || b.unidad || "").toLowerCase();
    if (areaA !== areaB) {
      return areaA.localeCompare(areaB);
    }
    const respA = (a.responsable || "").toLowerCase();
    const respB = (b.responsable || "").toLowerCase();
    return respA.localeCompare(respB);
  });

  // Manejar inicio del arrastre
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.target.style.opacity = "0.5";
  };

  // Manejar arrastre sobre una fila
  const handleRowDragOver = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  // Manejar salida del arrastre de una fila
  const handleRowDragLeave = () => {
    setDragOverIndex(null);
  };

  // Manejar soltar
  const handleDrop = async (e, dropIndex) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const nuevaLista = [...pdasOrdenados];
    const [removed] = nuevaLista.splice(draggedIndex, 1);
    nuevaLista.splice(dropIndex, 0, removed);
    
    // Actualizar ordenes
    const ordenes = nuevaLista.map((pda, idx) => ({
      id: pda.id,
      orden: idx + 1
    }));
    
    try {
      await authFetch(`${serverUrl}/activos/pdas/reordenar`, {
        method: "PUT",
        body: JSON.stringify({ ordenes }),
      });
      // Actualizar estado local SIN recargar (evita salto de scroll)
      setPdas(nuevaLista.map((pda, idx) => ({ ...pda, orden: idx + 1 })));
    } catch (err) {
      console.error("Error reordenando:", err);
      await showAlert("Error al reordenar: " + err.message, "error");
    }
    
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Manejar fin del arrastre
  const handleDragEnd = (e) => {
    // Restaurar opacidad de todas las filas
    const row = e.currentTarget.closest('tr');
    if (row) {
      row.style.opacity = "1";
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  if (loading) {
    return <div className="activos-loading">Cargando PDAs...</div>;
  }

  return (
    <div className="activos-container">
      <div className="activos-header">
        <h2>Control de PDAs</h2>
        <div className="activos-actions">
          <button
            className="btn btn-primary"
            onClick={() => abrirModal()}
          >
            ➕ Agregar
          </button>
          <div className="menu-desplegable-activos" style={{ position: "relative" }}>
            <button 
              className="btn btn-secondary"
              onClick={() => setMenuAbierto(!menuAbierto)}
            >
              ⋮ Menú
            </button>
            {menuAbierto && (
              <div className="menu-opciones-activos">
                <button 
                  className="menu-item-activos"
                  onClick={() => {
                    setShowModalImportar(true);
                    setMenuAbierto(false);
                  }}
                >
                  📥 Importar Excel/CSV
                </button>
                <button 
                  className="menu-item-activos"
                  onClick={() => {
                    exportarExcel();
                    setMenuAbierto(false);
                  }}
                >
                  📤 Exportar Excel
                </button>
                <button 
                  className="menu-item-activos"
                  onClick={() => {
                    exportarPDF();
                    setMenuAbierto(false);
                  }}
                >
                  📄 PDF
                </button>
                <button 
                  className="menu-item-activos"
                  onClick={async () => {
                    setMenuAbierto(false);
                    try {
                      const token = localStorage.getItem("token");
                      const response = await fetch(`${serverUrl}/activos/pdas/todos-qr-doc`, {
                        headers: {
                          Authorization: `Bearer ${token}`,
                        },
                      });

                      if (!response.ok) {
                        throw new Error(`Error al descargar QR: ${response.status}`);
                      }

                      const blob = await response.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `QR_Control_PDAs_${new Date().toISOString().split("T")[0]}.docx`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      window.URL.revokeObjectURL(url);
                      await showAlert("Documento con todos los QR de PDAs descargado correctamente", "success");
                    } catch (e) {
                      console.error("Error descargando QR:", e);
                      await showAlert("Error al descargar documento QR: " + (e.message || "Error desconocido"), "error");
                    }
                  }}
                >
                  📋 Descargar Todos los QR (.doc)
                </button>
                <button 
                  className="menu-item-activos menu-item-danger"
                  onClick={async () => {
                    setMenuAbierto(false);
                    const confirmado = await showConfirm(
                      "¿Eliminar TODOS los PDAs?",
                      "Esta acción eliminará TODOS los PDAs registrados. Esta acción NO se puede deshacer."
                    );
                    if (!confirmado) return;

                    try {
                      await authFetch(`${serverUrl}/activos/pdas/eliminar-todos`, {
                        method: "DELETE",
                      });
                      setPdas([]);
                      await showAlert("Todos los PDAs han sido eliminados", "success");
                    } catch (e) {
                      console.error("Error eliminando todos los PDAs:", e);
                      await showAlert("Error al eliminar todos los PDAs", "error");
                    }
                  }}
                >
                  🗑️ Eliminar Todos
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="activos-tabla-container" style={{ overflowX: "auto" }}>
        <table className="activos-tabla" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ background: "#dc2626", color: "#ffffff", position: "sticky", top: 0, zIndex: 10 }}>
              <th style={{ padding: "12px 3px", border: "1px solid #b91c1c", textAlign: "center", fontWeight: "600", whiteSpace: "nowrap", width: "20px" }}></th>
              <th style={{ padding: "12px 8px", border: "1px solid #b91c1c", textAlign: "left", fontWeight: "600", whiteSpace: "nowrap" }}>PDA</th>
              <th style={{ padding: "12px 8px", border: "1px solid #b91c1c", textAlign: "left", fontWeight: "600", whiteSpace: "nowrap" }}>IMEI</th>
              <th style={{ padding: "12px 8px", border: "1px solid #b91c1c", textAlign: "left", fontWeight: "600", whiteSpace: "nowrap" }}>MODELO PDA</th>
              <th style={{ padding: "12px 8px", border: "1px solid #b91c1c", textAlign: "left", fontWeight: "600", whiteSpace: "nowrap" }}>ANDROID</th>
              <th style={{ padding: "12px 8px", border: "1px solid #b91c1c", textAlign: "left", fontWeight: "600", whiteSpace: "nowrap" }}>IMPRESORA</th>
              <th style={{ padding: "12px 8px", border: "1px solid #b91c1c", textAlign: "left", fontWeight: "600", whiteSpace: "nowrap" }}>SERIE</th>
              <th style={{ padding: "12px 8px", border: "1px solid #b91c1c", textAlign: "left", fontWeight: "600", whiteSpace: "nowrap" }}>MODELO IMP</th>
              <th style={{ padding: "12px 8px", border: "1px solid #b91c1c", textAlign: "left", fontWeight: "600", whiteSpace: "nowrap" }}>Encargado</th>
              <th style={{ padding: "12px 8px", border: "1px solid #b91c1c", textAlign: "left", fontWeight: "600", whiteSpace: "nowrap" }}>Responsable</th>
              <th style={{ padding: "12px 8px", border: "1px solid #b91c1c", textAlign: "left", fontWeight: "600", whiteSpace: "nowrap" }}>AREA</th>
              <th style={{ padding: "12px 8px", border: "1px solid #b91c1c", textAlign: "center", fontWeight: "600", whiteSpace: "nowrap" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {pdasOrdenados.length === 0 ? (
              <tr>
                <td colSpan="11" style={{ padding: "40px", textAlign: "center", color: "#9ca3af", fontStyle: "italic" }}>
                  No hay PDAs registrados
                </td>
              </tr>
            ) : (
              pdasOrdenados.map((pda, index) => (
                <tr 
                  key={pda.id} 
                  onDragOver={(e) => handleRowDragOver(e, index)}
                  onDragLeave={handleRowDragLeave}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (draggedIndex !== null && draggedIndex !== index) {
                      handleDrop(e, index);
                    }
                  }}
                  style={{ 
                    borderBottom: "1px solid var(--borde-sutil)",
                    opacity: draggedIndex === index ? 0.5 : 1,
                    backgroundColor: dragOverIndex === index ? "rgba(102, 126, 234, 0.1)" : "transparent"
                  }}
                >
                  <td 
                    draggable
                    onDragStart={(e) => {
                      handleDragStart(e, index);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={handleDragEnd}
                    style={{ 
                      padding: "8px 3px", 
                      border: "1px solid var(--borde-sutil)", 
                      verticalAlign: "middle", 
                      textAlign: "center",
                      cursor: "grab",
                      width: "20px",
                      backgroundColor: "rgba(0, 0, 0, 0.02)",
                      userSelect: "none"
                    }}
                    title="Arrastra para reordenar"
                  >
                    <div 
                      style={{ 
                        display: "flex", 
                        flexDirection: "column", 
                        gap: "0px", 
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "grab",
                        userSelect: "none",
                        width: "12px",
                        height: "20px"
                      }}
                    >
                      <span style={{ fontSize: "8px", color: "#999", lineHeight: "0.5" }}>⋮</span>
                      <span style={{ fontSize: "8px", color: "#999", lineHeight: "0.5" }}>⋮</span>
                      <span style={{ fontSize: "8px", color: "#999", lineHeight: "0.5" }}>⋮</span>
                    </div>
                  </td>
                  <td style={{ padding: "10px 8px", border: "1px solid var(--borde-sutil)", verticalAlign: "top" }}>
                    {pda.pda || pda.equipo_pda || "–"}
                  </td>
                  <td style={{ padding: "10px 8px", border: "1px solid var(--borde-sutil)", verticalAlign: "top" }}>
                    {pda.imei || "–"}
                  </td>
                  <td style={{ padding: "10px 8px", border: "1px solid var(--borde-sutil)", verticalAlign: "top" }}>
                    {pda.modelo_pda || "–"}
                  </td>
                  <td style={{ padding: "10px 8px", border: "1px solid var(--borde-sutil)", verticalAlign: "top" }}>
                    {pda.android || "–"}
                  </td>
                  <td style={{ padding: "10px 8px", border: "1px solid var(--borde-sutil)", verticalAlign: "top" }}>
                    {pda.impresora || "–"}
                  </td>
                  <td style={{ padding: "10px 8px", border: "1px solid var(--borde-sutil)", verticalAlign: "top" }}>
                    {pda.serie_pda || "–"}
                  </td>
                  <td style={{ padding: "10px 8px", border: "1px solid var(--borde-sutil)", verticalAlign: "top" }}>
                    {pda.modelo_impresora || "–"}
                  </td>
                  <td style={{ padding: "10px 8px", border: "1px solid var(--borde-sutil)", verticalAlign: "top" }}>
                    {pda.encargado || "–"}
                  </td>
                  <td style={{ padding: "10px 8px", border: "1px solid var(--borde-sutil)", verticalAlign: "top" }}>
                    {pda.responsable || "–"}
                  </td>
                  <td style={{ padding: "10px 8px", border: "1px solid var(--borde-sutil)", verticalAlign: "top" }}>
                    {pda.area || pda.unidad || "–"}
                  </td>
                  <td style={{ padding: "10px 8px", border: "1px solid var(--borde-sutil)", verticalAlign: "top", textAlign: "center" }}>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "center", flexWrap: "wrap" }}>
                      <button
                        className="btn-icon"
                        onClick={() => generarQR(pda)}
                        title={`Generar QR - ${pda.pda || pda.equipo_pda}`}
                        style={{ padding: "6px 10px", fontSize: "0.85rem" }}
                      >
                        📱 QR
                      </button>
                      <button
                        className="btn-icon-small"
                        onClick={() => abrirModal(pda)}
                        title="Editar PDA"
                        style={{ padding: "6px 8px" }}
                      >
                        ✏️
                      </button>
                      <button
                        className="btn-icon-small btn-danger"
                        onClick={() => eliminarPDA(pda.id)}
                        title="Eliminar PDA"
                        style={{ padding: "6px 8px" }}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal para PDA */}
      {modalAbierto && (
        <div className="modal-overlay" onClick={() => setModalAbierto(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editarId ? "Editar PDA" : "Nuevo PDA"}</h3>
              <button
                className="modal-close"
                onClick={() => setModalAbierto(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <label>PDA *</label>
              <input
                type="text"
                value={formPDA}
                onChange={(e) => setFormPDA(e.target.value)}
                placeholder="Ej: PDA No. 1"
                required
              />
              <label>IMEI</label>
              <input
                type="text"
                value={formIMEI}
                onChange={(e) => setFormIMEI(e.target.value)}
                placeholder="Ej: 352714114318744"
              />
              <label>MODELO PDA</label>
              <input
                type="text"
                value={formModeloPDA}
                onChange={(e) => setFormModeloPDA(e.target.value)}
                placeholder="Ej: TC26"
              />
              <label>ANDROID</label>
              <input
                type="text"
                value={formAndroid}
                onChange={(e) => setFormAndroid(e.target.value)}
                placeholder="Ej: 11"
              />
              <label>IMPRESORA</label>
              <input
                type="text"
                value={formImpresora}
                onChange={(e) => setFormImpresora(e.target.value)}
                placeholder="Ej: Impresora No. 1"
              />
              <label>SERIE IMPRESORA</label>
              <input
                type="text"
                value={formSeriePDA}
                onChange={(e) => setFormSeriePDA(e.target.value)}
                placeholder="Ej: 352714114318744"
              />
              <label>MODELO Impresora</label>
              <input
                type="text"
                value={formModeloImpresora}
                onChange={(e) => setFormModeloImpresora(e.target.value)}
                placeholder="Ej: ZQ210"
              />
              <label>Encargado</label>
              <input
                type="text"
                value={formEncargado}
                onChange={(e) => setFormEncargado(e.target.value)}
                placeholder="Nombre del encargado"
              />
              <label>Responsable</label>
              <input
                type="text"
                value={formResponsable}
                onChange={(e) => setFormResponsable(e.target.value)}
                placeholder="Nombre completo"
              />
              <label>AREA</label>
              <input
                type="text"
                value={formArea}
                onChange={(e) => setFormArea(e.target.value)}
                placeholder="Ej: Pedidos"
              />
              <label>OBSERVACIONES PDA</label>
              <textarea
                value={formObservaciones}
                onChange={(e) => setFormObservaciones(e.target.value)}
                placeholder="Observaciones adicionales"
                rows={3}
              />
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setModalAbierto(false)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={guardarPDA}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal QR */}
      {modalQR && qrPDA && (
        <div className="modal-overlay" onClick={() => setModalQR(false)}>
          <div className="modal modal-qr" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>QR - {qrPDA.pda || qrPDA.equipo_pda}</h3>
              <button className="modal-close" onClick={() => setModalQR(false)}>
                ×
              </button>
            </div>
            <div className="modal-body qr-body">
              <div className="qr-container">
                <img 
                  src={qrImage || ''} 
                  alt="QR Code" 
                  className="qr-image"
                  onError={(e) => {
                    console.error("Error cargando QR:", qrImage);
                    e.target.style.display = "none";
                  }}
                />
                <div className="qr-nombre">
                  {textoQR}
                </div>
                <div className="qr-info">
                  <div>
                    <strong>PDA:</strong> {qrPDA.pda || qrPDA.equipo_pda || "N/A"}
                  </div>
                  <div>
                    <strong>IMEI:</strong> {qrPDA.imei || "N/A"}
                  </div>
                  <div>
                    <strong>Modelo PDA:</strong> {qrPDA.modelo_pda || "N/A"}
                  </div>
                  <div>
                    <strong>Android:</strong> {qrPDA.android || "N/A"}
                  </div>
                  <div>
                    <strong>Impresora:</strong> {qrPDA.impresora || "N/A"}
                  </div>
                  <div>
                    <strong>Serie Impresora:</strong> {qrPDA.serie_pda || "N/A"}
                  </div>
                  <div>
                    <strong>Modelo Impresora:</strong> {qrPDA.modelo_impresora || "N/A"}
                  </div>
                  <div>
                    <strong>Encargado:</strong> {qrPDA.encargado || "N/A"}
                  </div>
                  <div>
                    <strong>Responsable:</strong> {qrPDA.responsable || "N/A"}
                  </div>
                  <div>
                    <strong>Área:</strong> {qrPDA.area || qrPDA.unidad || "N/A"}
                  </div>
                  {qrPDA.observaciones && (
                    <div>
                      <strong>Observaciones:</strong> {qrPDA.observaciones}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="btn-primary"
                onClick={async () => {
                  try {
                    // Crear canvas para combinar QR con título
                    const img = new Image();
                    // No usar crossOrigin para imágenes base64
                    
                    await new Promise((resolve, reject) => {
                      img.onload = resolve;
                      img.onerror = (err) => {
                        console.error("Error cargando imagen QR:", err);
                        reject(err);
                      };
                      // Si es base64, usar directamente; si es URL, verificar protocolo
                      if (qrImage.startsWith('data:')) {
                        img.src = qrImage;
                      } else {
                        // Asegurar que la URL use el mismo protocolo que la página
                        const url = new URL(qrImage, window.location.href);
                        url.protocol = window.location.protocol;
                        img.src = url.toString();
                      }
                    });
                    
                    // Crear canvas con espacio para QR y texto
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d");
                    
                    // Tamaño del QR (usar el tamaño real de la imagen)
                    const qrSize = img.width;
                    const padding = 20;
                    const textHeight = qrSize; // Mismo tamaño que el QR para el texto
                    
                    // Configurar tamaño del canvas
                    canvas.width = qrSize + (padding * 2);
                    canvas.height = qrSize + textHeight + (padding * 3);
                    
                    // Fondo blanco
                    ctx.fillStyle = "#FFFFFF";
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    
                    // Dibujar QR
                    ctx.drawImage(img, padding, padding, qrSize, qrSize);
                    
                    // Dibujar texto debajo del QR con el mismo tamaño que el QR
                    ctx.fillStyle = "#000000";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "top";
                    
                    // Calcular tamaño de fuente para que el texto tenga el mismo tamaño que el QR
                    const fontSize = qrSize * 0.3; // Ajustar según necesidad
                    ctx.font = `bold ${fontSize}px Arial`;
                    
                    const textY = qrSize + (padding * 2);
                    const textX = canvas.width / 2;
                    
                    ctx.fillText(textoQR, textX, textY);
                    
                    // Convertir a blob y descargar
                    canvas.toBlob((blob) => {
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.href = url;
                      const nombrePDA = (qrPDA.pda || qrPDA.equipo_pda || "PDA").replace(/\s+/g, "_");
                      link.download = `QR_${nombrePDA}.png`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(url);
                    }, "image/png");
                  } catch (err) {
                    console.error("Error descargando QR:", err);
                    await showAlert("Error al descargar QR: " + err.message, "error");
                  }
                }}
              >
                📥 Descargar QR
              </button>
              <button className="btn" onClick={() => setModalQR(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Importación */}
      {/* Indicador de carga durante importación */}
      {importando && (
        <div className="importacion-overlay">
          <div className="importacion-loader">
            <div className="logo-loader-container">
              <div 
                className="logo-loader-progress" 
                style={{ height: `${100 - progresoImportacion}%` }}
              ></div>
              <img 
                src={`${serverUrl}/uploads/personalizacion/logos/logo.png?t=${Date.now()}`}
                alt="Logo"
                className="logo-loader"
                onError={(e) => {
                  e.target.style.display = 'none';
                  const fallback = e.target.parentElement.querySelector('.logo-loader-fallback');
                  if (fallback) {
                    fallback.style.display = 'block';
                  }
                }}
              />
              <div className="logo-loader-fallback" style={{ display: 'none' }}>
                <div className="logo-loader-placeholder">PINA</div>
              </div>
            </div>
            <div className="importacion-texto">
              <p>Importando PDAs...</p>
              <p className="importacion-progreso">{progresoImportacion}%</p>
            </div>
          </div>
        </div>
      )}

      {showModalImportar && (
        <div className="modal-overlay" onClick={() => !importando && setShowModalImportar(false)}>
          <div className="modal modal-importar" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "800px", width: "90vw" }}>
            <div className="modal-header">
              <h3>Importar PDAs</h3>
              <button className="modal-close" onClick={() => !importando && setShowModalImportar(false)} disabled={importando}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {!archivoImportar ? (
                <>
                  <p>Selecciona un archivo Excel (.xlsx, .xls) o CSV con las siguientes columnas:</p>
                  <ul style={{ textAlign: "left", margin: "15px 0" }}>
                    <li><strong>AREA</strong> (obligatorio)</li>
                    <li><strong>Responsable</strong> (opcional)</li>
                    <li><strong>PDA</strong> (obligatorio)</li>
                    <li><strong>IMEI</strong> (opcional)</li>
                    <li><strong>MODELO PDA</strong> (opcional)</li>
                    <li><strong>ANDROID</strong> (opcional)</li>
                    <li><strong>IMPRESORA</strong> (opcional)</li>
                    <li><strong>SERIE IMPRESORA</strong> (opcional)</li>
                    <li><strong>MODELO Impresora</strong> (opcional)</li>
                    <li><strong>Encargado</strong> (opcional)</li>
                    <li><strong>OBSERVACIONES PDA</strong> (opcional)</li>
                  </ul>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileSelect}
                    style={{ margin: "20px 0" }}
                  />
                </>
              ) : (
                <>
                  <div style={{ marginBottom: "20px" }}>
                    <p><strong>Archivo:</strong> {archivoImportar.name}</p>
                    <p><strong>Registros encontrados:</strong> {datosImportar.length}</p>
                  </div>

                  {erroresValidacion.length > 0 && (
                    <div style={{ 
                      background: "rgba(239, 68, 68, 0.1)", 
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                      borderRadius: "8px",
                      padding: "15px",
                      marginBottom: "20px",
                      maxHeight: "200px",
                      overflowY: "auto"
                    }}>
                      <strong style={{ color: "#ef4444" }}>Errores de validación ({erroresValidacion.length}):</strong>
                      <ul style={{ marginTop: "10px", paddingLeft: "20px" }}>
                        {erroresValidacion.slice(0, 10).map((error, idx) => (
                          <li key={idx} style={{ fontSize: "0.9rem", marginBottom: "5px" }}>{error}</li>
                        ))}
                        {erroresValidacion.length > 10 && (
                          <li style={{ fontSize: "0.9rem", fontStyle: "italic" }}>
                            ... y {erroresValidacion.length - 10} error(es) más
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {vistaPrevia.length > 0 && (
                    <div style={{ marginBottom: "20px" }}>
                      <strong>Vista previa (primeros 5 registros):</strong>
                      <div style={{ 
                        marginTop: "10px",
                        overflowX: "auto",
                        maxHeight: "300px",
                        overflowY: "auto"
                      }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                          <thead>
                            <tr style={{ background: "var(--fondo-secundario)", position: "sticky", top: 0 }}>
                              {columnasArchivo.map((col, idx) => (
                                <th key={idx} style={{ padding: "8px", border: "1px solid var(--borde-sutil)", textAlign: "left" }}>
                                  {col}
                                  {mapeoColumnas[col] && (
                                    <div style={{ fontSize: "0.7rem", color: "#3b82f6", marginTop: "2px" }}>
                                      → {mapeoColumnas[col]}
                                    </div>
                                  )}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {vistaPrevia.map((row, rowIdx) => (
                              <tr key={rowIdx}>
                                {columnasArchivo.map((col, colIdx) => (
                                  <td key={colIdx} style={{ padding: "6px", border: "1px solid var(--borde-sutil)" }}>
                                    {row[col] || "–"}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {columnasArchivo.length > 0 && (
                    <div style={{ marginBottom: "20px" }}>
                      <strong>Mapeo de columnas:</strong>
                      <div style={{ marginTop: "10px" }}>
                        {columnasArchivo.map((col, colIdx) => (
                          <div key={`col-${colIdx}-${col}`} style={{ marginBottom: "8px", display: "flex", alignItems: "center", gap: "10px" }}>
                            <span style={{ flex: "0 0 200px" }}>{col}</span>
                            <select
                              value={mapeoColumnas[col] || ""}
                              onChange={(e) => {
                                setMapeoColumnas(prev => ({
                                  ...prev,
                                  [col]: e.target.value || null
                                }));
                              }}
                              style={{ flex: 1, padding: "6px", borderRadius: "4px" }}
                            >
                              <option value="">-- No mapear --</option>
                              <option value="pda">PDA</option>
                              <option value="imei">IMEI</option>
                              <option value="modelo_pda">MODELO PDA</option>
                              <option value="android">ANDROID</option>
                              <option value="impresora">IMPRESORA</option>
                              <option value="serie_pda">SERIE</option>
                              <option value="modelo_impresora">MODELO IMP</option>
                              <option value="encargado">Encargado</option>
                              <option value="responsable">Responsable</option>
                              <option value="area">AREA</option>
                              <option value="observaciones">OBSERVACIONES PDA</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => {
                setShowModalImportar(false);
                setArchivoImportar(null);
                setDatosImportar([]);
                setColumnasArchivo([]);
                setMapeoColumnas({});
                setVistaPrevia([]);
                setErroresValidacion([]);
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }}>
                Cancelar
              </button>
              {archivoImportar && (
                <button className="btn-primary" onClick={procesarImportacion} disabled={importando}>
                  {importando ? `Importando... ${progresoImportacion}%` : `Importar ${datosImportar.length} Registro(s)`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
