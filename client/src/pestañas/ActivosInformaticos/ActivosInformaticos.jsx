import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../../AuthContext";
import { useAlert } from "../../components/AlertModal";
import ControlPDAs from "./ControlPDAs";
import ControlTablets from "./ControlTablets";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import { applyPlugin } from "jspdf-autotable";
import "./ActivosInformaticos.css";

applyPlugin(jsPDF);

export default function ActivosInformaticos({ serverUrl, socket }) {
  const [tabActiva, setTabActiva] = useState("activos"); // 'activos', 'pdas' o 'tablets'
  const { authFetch } = useAuth();
  const { showConfirm, showAlert } = useAlert();
  const [responsables, setResponsables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modalTipo, setModalTipo] = useState(null); // 'responsable' o 'activo'
  const [editarId, setEditarId] = useState(null);
  const [responsableSeleccionado, setResponsableSeleccionado] = useState(null);
  
  // Formulario responsable
  const [formUnidad, setFormUnidad] = useState("");
  const [formResponsable, setFormResponsable] = useState("");
  const [formCargo, setFormCargo] = useState("");
  
  // Formulario activo
  const [formEquipo, setFormEquipo] = useState("");
  const [formModelo, setFormModelo] = useState("");
  const [formSerie, setFormSerie] = useState("");
  
  // Modal QR
  const [modalQR, setModalQR] = useState(false);
  const [qrResponsable, setQrResponsable] = useState(null);
  const [qrImage, setQrImage] = useState(null);
  
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
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  // Cargar datos
  const cargar = async () => {
    try {
      setLoading(true);
      const data = await authFetch(`${serverUrl}/activos`);
      setResponsables(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Error cargando activos:", e);
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
  }, [serverUrl]);

  // ───────────────────────────
  // SOCKET.IO - ACTUALIZACIONES EN TIEMPO REAL
  // ───────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleUpdate = () => {
      if (importandoRef && !importandoRef.current) {
        cargar();
      }
    };

    socket.on("activos_actualizados", handleUpdate);

    return () => {
      socket.off("activos_actualizados", handleUpdate);
    };
  }, [socket, serverUrl]);

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

  // Abrir modal para crear responsable
  const abrirModalResponsable = (responsable = null) => {
    if (responsable) {
      setEditarId(responsable.id);
      setFormUnidad(responsable.unidad);
      setFormResponsable(responsable.responsable);
      setFormCargo(responsable.cargo_area);
    } else {
      setEditarId(null);
      setFormUnidad("");
      setFormResponsable("");
      setFormCargo("");
    }
    setModalTipo("responsable");
    setModalAbierto(true);
  };

  // Abrir modal para crear activo
  const abrirModalActivo = (responsableId, activo = null) => {
    setResponsableSeleccionado(responsableId);
    if (activo) {
      setEditarId(activo.id);
      setFormEquipo(activo.equipo);
      setFormModelo(activo.modelo || "");
      setFormSerie(activo.numero_serie || "");
    } else {
      setEditarId(null);
      setFormEquipo("");
      setFormModelo("");
      setFormSerie("");
    }
    setModalTipo("activo");
    setModalAbierto(true);
  };

  // Guardar responsable
  const guardarResponsable = async () => {
    if (!formUnidad || !formResponsable || !formCargo) {
      await showAlert("Por favor completa todos los campos", "warning");
      return;
    }

    try {
      if (editarId) {
        await authFetch(`${serverUrl}/activos/responsable/${editarId}`, {
          method: "PUT",
          body: JSON.stringify({
            unidad: formUnidad,
            responsable: formResponsable,
            cargo_area: formCargo,
          }),
        });
        // Actualizar estado local SIN recargar (evita salto de scroll)
        setResponsables(prev => prev.map(r => 
          r.id === editarId 
            ? { ...r, unidad: formUnidad, responsable: formResponsable, cargo_area: formCargo }
            : r
        ));
        await showAlert("Responsable actualizado correctamente", "success");
      } else {
        const nuevo = await authFetch(`${serverUrl}/activos/responsable`, {
          method: "POST",
          body: JSON.stringify({
            unidad: formUnidad,
            responsable: formResponsable,
            cargo_area: formCargo,
          }),
        });
        // Agregar al estado local SIN recargar
        if (nuevo && nuevo.id) {
          setResponsables(prev => [...prev, { ...nuevo, activos: [] }]);
        } else {
          // Fallback: recargar si no devuelve el objeto
          await cargar();
        }
        await showAlert("Responsable creado correctamente", "success");
      }
      setModalAbierto(false);
    } catch (e) {
      console.error("Error guardando responsable:", e);
      await showAlert("Error al guardar responsable", "error");
    }
  };

  // Guardar activo
  const guardarActivo = async () => {
    if (!formEquipo) {
      await showAlert("Por favor ingresa el nombre del equipo", "warning");
      return;
    }

    try {
      if (editarId) {
        await authFetch(`${serverUrl}/activos/activo/${editarId}`, {
          method: "PUT",
          body: JSON.stringify({
            equipo: formEquipo,
            modelo: formModelo,
            numero_serie: formSerie,
          }),
        });
        // Actualizar estado local SIN recargar (evita salto de scroll)
        setResponsables(prev => prev.map(r => ({
          ...r,
          activos: (r.activos || []).map(a => 
            a.id === editarId 
              ? { ...a, equipo: formEquipo, modelo: formModelo, numero_serie: formSerie }
              : a
          )
        })));
        await showAlert("Activo actualizado correctamente", "success");
      } else {
        const nuevo = await authFetch(`${serverUrl}/activos/activo`, {
          method: "POST",
          body: JSON.stringify({
            responsable_id: responsableSeleccionado,
            equipo: formEquipo,
            modelo: formModelo,
            numero_serie: formSerie,
          }),
        });
        // Agregar al estado local SIN recargar
        if (nuevo && nuevo.id) {
          setResponsables(prev => prev.map(r => 
            r.id === responsableSeleccionado
              ? { ...r, activos: [...(r.activos || []), nuevo] }
              : r
          ));
        } else {
          // Fallback: recargar si no devuelve el objeto
          await cargar();
        }
        await showAlert("Activo creado correctamente", "success");
      }
      setModalAbierto(false);
    } catch (e) {
      console.error("Error guardando activo:", e);
      await showAlert("Error al guardar activo", "error");
    }
  };

  // Eliminar responsable
  const eliminarResponsable = async (id) => {
    const confirmado = await showConfirm(
      "¿Eliminar responsable?",
      "Esto eliminará también todos sus activos. ¿Estás seguro?"
    );
    if (!confirmado) return;

    try {
      await authFetch(`${serverUrl}/activos/responsable/${id}`, {
        method: "DELETE",
      });
      // Eliminar del estado local SIN recargar (evita salto de scroll)
      setResponsables(prev => prev.filter(r => r.id !== id));
      await showAlert("Responsable eliminado correctamente", "success");
    } catch (e) {
      console.error("Error eliminando responsable:", e);
      await showAlert("Error al eliminar responsable", "error");
    }
  };

  // Eliminar activo
  const eliminarActivo = async (id) => {
    const confirmado = await showConfirm(
      "¿Eliminar activo?",
      "¿Estás seguro de eliminar este activo?"
    );
    if (!confirmado) return;

    try {
      await authFetch(`${serverUrl}/activos/activo/${id}`, {
        method: "DELETE",
      });
      // Eliminar del estado local SIN recargar (evita salto de scroll)
      setResponsables(prev => prev.map(r => ({
        ...r,
        activos: (r.activos || []).filter(a => a.id !== id)
      })));
      await showAlert("Activo eliminado correctamente", "success");
    } catch (e) {
      console.error("Error eliminando activo:", e);
      await showAlert("Error al eliminar activo", "error");
    }
  };

  // Generar QR
  const generarQR = async (responsable) => {
    try {
      // Cargar datos completos del responsable antes de mostrar QR
      const responsableCompleto = await authFetch(`${serverUrl}/activos/responsable/${responsable.id}`);
      
      // Cargar QR como blob y convertir a base64 para que funcione con autenticación
      const qrUrl = `${serverUrl}/activos/responsable/${responsable.id}/qr?t=${Date.now()}`;
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
      
      setQrResponsable(responsableCompleto);
      setQrImage(base64Image);
      setModalQR(true);
    } catch (e) {
      console.error("Error generando QR:", e);
      await showAlert("Error al generar QR: " + (e.message || "Error desconocido"), "error");
    }
  };

  // Exportar a PDF
  const exportarPDF = async () => {
    if (!responsables || responsables.length === 0) {
      await showAlert("No hay datos para exportar", "warning");
      return;
    }

    try {
      // Preparar datos de la tabla desde responsables y sus activos
      const tableData = [];
      responsables.forEach(resp => {
        const activos = resp.activos || [];
        if (activos.length > 0) {
          activos.forEach(activo => {
            tableData.push([
              resp.unidad || "-",
              resp.responsable || "-",
              resp.cargo_area || "-",
              activo.tipo_equipo || activo.equipo || "-",
              activo.marca_modelo || activo.modelo || "-",
              activo.numero_serie || "-"
            ]);
          });
        } else {
          // Si no tiene activos, mostrar solo el responsable
          tableData.push([
            resp.unidad || "-",
            resp.responsable || "-",
            resp.cargo_area || "-",
            "-",
            "-",
            "-"
          ]);
        }
      });

      if (tableData.length === 0) {
        await showAlert("No hay datos para exportar", "warning");
        return;
      }

      const doc = new jsPDF("landscape", "mm", "a4");
      
      // Título
      doc.setFontSize(16);
      doc.setFont(undefined, "bold");
      doc.text("Activos Informáticos", 14, 15);
      
      // Fecha de generación
      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      const fechaGen = new Date().toLocaleString("es-MX");
      doc.text(`Generado el: ${fechaGen}`, 14, 22);
      
      // Crear tabla
      doc.autoTable({
        startY: 28,
        head: [["Unidad", "Responsable", "Cargo / Área", "Equipo", "Modelo", "No. de Serie"]],
        body: tableData,
        styles: { 
          fontSize: 8,
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
      doc.save(`Activos_Informaticos_${fechaArchivo}.pdf`);
      await showAlert("PDF generado correctamente", "success");
    } catch (err) {
      console.error("Error generando PDF:", err);
      await showAlert("Error al generar el PDF", "error");
    }
  };

  // Exportar a Excel
  const exportarExcel = async () => {
    try {
      const response = await fetch(`${serverUrl}/activos/exportar`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Activos_Informaticos_${new Date().toISOString().split("T")[0]}.xlsx`;
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
            // Leer CSV
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
              
              // Solo agregar si tiene al menos algún dato
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
      "unidad": ["unidad", "unit", "departamento", "depto"],
      "responsable": ["responsable", "nombre", "name", "persona"],
      "cargo_area": ["cargo", "área", "area", "cargo / área", "cargo/área", "cargo_area", "puesto", "position"],
      "equipo": ["equipo", "tipo", "tipo de equipo", "tipo_equipo", "tipo equipo", "device", "dispositivo"],
      "modelo": ["modelo", "model", "marca_modelo", "marca modelo"],
      "numero_serie": ["no. de serie", "numero de serie", "número de serie", "numero_serie", "número_serie", "serie", "serial", "serial number", "no serie", "no. serie"]
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
        mapeo[header] = null;
      }
    });

    return { mapeo, columnasNuevas };
  }

  // Función para validar datos antes de importar
  function validarDatos(rows, mapeo) {
    const errores = [];
    
    rows.forEach((row, index) => {
      const numFila = index + 2; // +2 porque la fila 1 es encabezado
      
      // Validar unidad (obligatorio)
      const unidadKey = Object.keys(mapeo).find(k => mapeo[k] === "unidad");
      if (!unidadKey || !row[unidadKey] || !row[unidadKey].toString().trim()) {
        errores.push(`Fila ${numFila}: Falta la unidad`);
      }

      // Validar responsable (obligatorio)
      const responsableKey = Object.keys(mapeo).find(k => mapeo[k] === "responsable");
      if (!responsableKey || !row[responsableKey] || !row[responsableKey].toString().trim()) {
        errores.push(`Fila ${numFila}: Falta el responsable`);
      }

      // Validar equipo (obligatorio)
      const equipoKey = Object.keys(mapeo).find(k => mapeo[k] === "equipo");
      if (!equipoKey || !row[equipoKey] || !row[equipoKey].toString().trim()) {
        errores.push(`Fila ${numFila}: Falta el equipo`);
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

      // Detectar columnas y mapear
      const { mapeo } = detectarColumnasYMapear(headers);
      
      setColumnasArchivo(headers);
      setMapeoColumnas(mapeo);
      setDatosImportar(rows);
      
      // Validar datos
      const errores = validarDatos(rows, mapeo);
      setErroresValidacion(errores);
      
      // Mostrar vista previa (primeros 5 registros)
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

      // Procesar en el orden EXACTO del archivo, fila por fila
      // Mantener contexto del responsable actual (para filas que no tienen unidad/responsable)
      let responsableActual = {
        unidad: null,
        responsable: null,
        cargo_area: null
      };
      
      // Cache de responsables creados durante la importación (SOLO para esta importación)
      // Esto mantiene el orden de primera aparición en el archivo
      const responsablesCache = new Map();
      const responsablesOrdenCreacion = []; // Array para mantener el orden de creación
      
      const totalFilas = datosImportar.length;
      
      // Procesar cada fila en orden exacto del archivo
      for (let idx = 0; idx < datosImportar.length; idx++) {
        const row = datosImportar[idx];
        try {
          // Actualizar progreso
          setProgresoImportacion(Math.round(((idx + 1) / totalFilas) * 100));
          
          // Función helper para buscar valor en el row de forma robusta
          const buscarValor = (campoSistema, variantes = []) => {
            // Primero intentar por mapeo directo
            const mapeoKey = Object.keys(mapeoColumnas).find(k => mapeoColumnas[k] === campoSistema);
            if (mapeoKey && row[mapeoKey]) {
              const valor = row[mapeoKey]?.toString().trim();
              if (valor) return valor;
            }
            
            // Buscar en todas las columnas del row (búsqueda flexible y case-insensitive)
            for (const [key, value] of Object.entries(row)) {
              if (!key || value === null || value === undefined) continue;
              
              const keyLower = key.toLowerCase().trim();
              const valorStr = value?.toString().trim();
              
              if (!valorStr) continue;
              
              // Verificar si la columna coincide con alguna variante
              const coincide = variantes.some(v => {
                const vLower = v.toLowerCase();
                return keyLower === vLower || keyLower.includes(vLower) || vLower.includes(keyLower);
              });
              
              if (coincide) {
                return valorStr;
              }
            }
            
            return null;
          };
          
          // Buscar valores con variantes específicas
          let unidad = buscarValor("unidad", ["unidad", "unit", "departamento", "depto"]);
          let responsable = buscarValor("responsable", ["responsable", "nombre", "name", "persona"]);
          let cargo_area = buscarValor("cargo_area", ["cargo", "área", "area", "cargo / área", "cargo/área", "cargo_area", "puesto", "position"]);
          let equipo = buscarValor("equipo", ["equipo", "tipo", "tipo de equipo", "tipo_equipo", "tipo equipo", "device", "dispositivo"]);
          let modelo = buscarValor("modelo", ["modelo", "model", "marca_modelo", "marca modelo"]);
          let numero_serie = buscarValor("numero_serie", ["no. de serie", "numero de serie", "número de serie", "numero_serie", "número_serie", "serie", "serial", "serial number", "no serie", "no. serie"]);
          
          // Si no se encontró unidad o responsable, usar el contexto del responsable anterior
          if (!unidad && responsableActual.unidad) {
            unidad = responsableActual.unidad;
          }
          if (!responsable && responsableActual.responsable) {
            responsable = responsableActual.responsable;
          }
          if (!cargo_area && responsableActual.cargo_area) {
            cargo_area = responsableActual.cargo_area;
          }
          
          // Validar campos obligatorios
          if (!unidad || !responsable || !equipo) {
            errores++;
            erroresDetalle.push(`Fila ${idx + 2}: Faltan campos obligatorios (Unidad: ${unidad || "FALTA"}, Responsable: ${responsable || "FALTA"}, Equipo: ${equipo || "FALTA"})`);
            continue;
          }
          
          // Actualizar contexto del responsable actual
          responsableActual = {
            unidad: unidad.trim(),
            responsable: responsable.trim(),
            cargo_area: cargo_area ? cargo_area.trim() : null
          };
          
          // Normalizar valores
          const unidadNorm = responsableActual.unidad;
          const responsableNorm = responsableActual.responsable;
          const cargoNorm = responsableActual.cargo_area || "";
          
          // Crear clave única para el responsable
          const claveResponsable = `${unidadNorm.toLowerCase()}|${responsableNorm.toLowerCase()}|${cargoNorm.toLowerCase()}`;
          
          // Obtener o crear responsable (en orden de primera aparición en el archivo)
          let responsableId = responsablesCache.get(claveResponsable);
          
          if (!responsableId) {
            // Crear nuevo responsable INMEDIATAMENTE (en orden exacto del archivo)
            // NO buscar en existentes para mantener el orden exacto
            const nuevoResponsable = await authFetch(`${serverUrl}/activos/responsable`, {
              method: "POST",
              body: JSON.stringify({
                unidad: unidadNorm,
                responsable: responsableNorm,
                cargo_area: cargoNorm || null
              }),
            });
            responsableId = nuevoResponsable.id;
            responsablesCache.set(claveResponsable, responsableId);
            responsablesOrdenCreacion.push({
              id: responsableId,
              unidad: unidadNorm,
              responsable: responsableNorm,
              cargo_area: cargoNorm
            });
          }
          
          // Crear activo INMEDIATAMENTE (en orden exacto del archivo)
          const equipoTrim = equipo.trim();
          if (equipoTrim) {
            try {
              await authFetch(`${serverUrl}/activos/activo`, {
                method: "POST",
                body: JSON.stringify({
                  responsable_id: responsableId,
                  equipo: equipoTrim,
                  tipo_equipo: equipoTrim,
                  modelo: modelo ? modelo.trim() : null,
                  marca_modelo: modelo ? modelo.trim() : null,
                  numero_serie: numero_serie ? numero_serie.trim() : null
                }),
              });
              exitosos++;
            } catch (err) {
              errores++;
              erroresDetalle.push(`Fila ${idx + 2}: Error creando activo ${equipoTrim}: ${err.message}`);
            }
          }
        } catch (err) {
          errores++;
          erroresDetalle.push(`Fila ${idx + 2}: Error procesando fila: ${err.message}`);
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
        `Importación completada: ${exitosos} activo(s) procesado(s)${errores > 0 ? `, ${errores} error(es)` : ""}`,
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

  // Agrupar por unidad manteniendo el orden original (por ID de creación)
  const agruparPorUnidad = () => {
    const grupos = {};
    const ordenUnidades = []; // Mantener orden de primera aparición
    
    const busquedaLower = busqueda.trim() ? busqueda.toLowerCase() : "";
    
    // Filtrar y procesar responsables
    responsables.forEach((resp) => {
      let respConActivos = resp;
      let debeIncluir = true;
      
      // Si hay búsqueda, filtrar
      if (busquedaLower) {
        const unidad = (resp.unidad || "").toLowerCase();
        const responsable = (resp.responsable || "").toLowerCase();
        const cargo = (resp.cargo_area || "").toLowerCase();
        
        // Verificar si el responsable mismo coincide
        const responsableCoincide = 
          unidad.includes(busquedaLower) ||
          responsable.includes(busquedaLower) ||
          cargo.includes(busquedaLower);
        
        // Si el responsable coincide, mostrar TODOS sus activos
        // Si no coincide, filtrar solo los activos que coinciden
        if (responsableCoincide) {
          // Mostrar todos los activos del responsable
          respConActivos = resp;
        } else {
          // Filtrar solo los activos que coinciden
          const activosFiltrados = (resp.activos || []).filter((activo) => {
            const equipo = ((activo.tipo_equipo || activo.equipo) || "").toLowerCase();
            return equipo.includes(busquedaLower);
          });
          
          // Solo incluir si tiene activos que coinciden
          if (activosFiltrados.length > 0) {
            respConActivos = { ...resp, activos: activosFiltrados };
          } else {
            debeIncluir = false;
          }
        }
      }
      
      // Agregar a grupos si debe incluirse
      if (debeIncluir) {
        if (!grupos[respConActivos.unidad]) {
          grupos[respConActivos.unidad] = [];
          ordenUnidades.push(respConActivos.unidad);
        }
        grupos[respConActivos.unidad].push(respConActivos);
      }
    });
    
    // Retornar grupos ordenados por primera aparición
    const gruposOrdenados = {};
    ordenUnidades.forEach(unidad => {
      gruposOrdenados[unidad] = grupos[unidad].sort((a, b) => (a.id || 0) - (b.id || 0));
    });
    
    return gruposOrdenados;
  };

  // Contar activos por tipo
  const contarActivosPorTipo = (activos) => {
    const conteo = {};
    activos.forEach((activo) => {
      const tipo = activo.tipo_equipo || activo.equipo || "Sin especificar";
      conteo[tipo] = (conteo[tipo] || 0) + 1;
    });
    return conteo;
  };

  // Función para dividir texto en 3 líneas
  const dividirEnTresLineas = (texto) => {
    if (!texto) return ["", "", ""];
    const palabras = texto.trim().split(/\s+/);
    const totalPalabras = palabras.length;
    
    if (totalPalabras === 0) return ["", "", ""];
    if (totalPalabras === 1) return [palabras[0], "", ""];
    if (totalPalabras === 2) return [palabras[0], palabras[1], ""];
    
    // Dividir en 3 líneas aproximadamente iguales
    const palabrasPorLinea = Math.ceil(totalPalabras / 3);
    const linea1 = palabras.slice(0, palabrasPorLinea).join(" ");
    const linea2 = palabras.slice(palabrasPorLinea, palabrasPorLinea * 2).join(" ");
    const linea3 = palabras.slice(palabrasPorLinea * 2).join(" ");
    
    return [linea1, linea2, linea3];
  };

  const grupos = agruparPorUnidad();

  if (loading) {
    return <div className="activos-loading">Cargando activos...</div>;
  }

  return (
    <div className="activos-container">
      <div className="activos-header">
        <div className="activos-tabs">
          <button
            className={`tab-button ${tabActiva === "activos" ? "active" : ""}`}
            onClick={() => setTabActiva("activos")}
          >
            💻 Activos Informáticos
          </button>
          <button
            className={`tab-button ${tabActiva === "pdas" ? "active" : ""}`}
            onClick={() => setTabActiva("pdas")}
          >
            📱 Control de PDAs
          </button>
          <button
            className={`tab-button ${tabActiva === "tablets" ? "active" : ""}`}
            onClick={() => setTabActiva("tablets")}
            style={{ background: tabActiva === "tablets" ? "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)" : undefined }}
          >
            📱 Control de Tablets
          </button>
        </div>
      </div>

      {tabActiva === "pdas" ? (
        <ControlPDAs serverUrl={serverUrl} />
      ) : tabActiva === "tablets" ? (
        <ControlTablets serverUrl={serverUrl} />
      ) : (
        <>
          <div className="activos-header-actions">
            <h2 style={{ margin: 0 }}>Activos Informáticos</h2>
            <div className="activos-actions">
              <button
                className="btn btn-primary"
                onClick={() => abrirModalResponsable()}
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
                          const response = await fetch(`${serverUrl}/activos/todos-qr-doc`, {
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
                          a.download = `QR_Activos_Informaticos_${new Date().toISOString().split("T")[0]}.docx`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          window.URL.revokeObjectURL(url);
                          await showAlert("Documento con todos los QR descargado correctamente", "success");
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
                          "¿Eliminar TODOS los activos y responsables?",
                          "Esta acción eliminará TODOS los activos informáticos y responsables. Esta acción NO se puede deshacer."
                        );
                        if (!confirmado) return;

                        try {
                          await authFetch(`${serverUrl}/activos/todos`, {
                            method: "DELETE",
                          });
                          setResponsables([]);
                          await showAlert("Todos los activos y responsables han sido eliminados", "success");
                        } catch (e) {
                          console.error("Error eliminando todos los activos:", e);
                          await showAlert("Error al eliminar todos los activos", "error");
                        }
                      }}
                    >
                      🗑️ Borrar Todo
                    </button>
                  </div>
                )}
              </div>
            </div>
      </div>

      {/* Buscador */}
      <div className="activos-buscador">
        <input
          type="text"
          placeholder="🔍 Buscar por responsable, equipo, cargo o área..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <div className="activos-tabla-container">
        <table className="activos-tabla">
          <thead>
            <tr>
              <th>Unidad</th>
              <th>Responsable</th>
              <th>Cargo / Área</th>
              <th>Equipo</th>
              <th>Modelo</th>
              <th>No. de Serie</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(grupos).length === 0 ? (
              <tr>
                <td colSpan="7" style={{ padding: "40px", textAlign: "center", color: "#9ca3af", fontStyle: "italic" }}>
                  {busqueda.trim() ? "No se encontraron resultados para la búsqueda" : "No hay responsables registrados"}
                </td>
              </tr>
            ) : (
              Object.keys(grupos).map((unidad) => {
                const responsablesUnidad = grupos[unidad];
                return responsablesUnidad.map((resp, idx) => {
                  const activos = resp.activos || [];
                  const filas = activos.length || 1; // Al menos una fila

                return (
                  <React.Fragment key={resp.id}>
                    {activos.length > 0 ? (
                      activos.map((activo, actIdx) => {
                        const activoId = activo.id || `activo-${resp.id}-${actIdx}`;
                        const equipo = activo.tipo_equipo || activo.equipo || "–";
                        const modelo = activo.marca_modelo || activo.modelo || "–";
                        const serie = activo.numero_serie || "–";
                        
                        return (
                          <tr key={`${resp.id}-${activoId}`}>
                            {actIdx === 0 && (
                              <>
                                <td rowSpan={filas} className="celda-unidad">
                                  {(() => {
                                    const lineas = dividirEnTresLineas(resp.unidad || "");
                                    return (
                                      <>
                                        <span className="texto-linea">{lineas[0]}</span>
                                        <span className="texto-linea">{lineas[1]}</span>
                                        <span className="texto-linea">{lineas[2]}</span>
                                      </>
                                    );
                                  })()}
                                </td>
                                <td rowSpan={filas} className="celda-responsable">
                                  {(() => {
                                    const lineas = dividirEnTresLineas(resp.responsable || "");
                                    return (
                                      <>
                                        <span className="texto-linea">{lineas[0]}</span>
                                        <span className="texto-linea">{lineas[1]}</span>
                                        <span className="texto-linea">{lineas[2]}</span>
                                      </>
                                    );
                                  })()}
                                </td>
                                <td rowSpan={filas} className="celda-cargo">
                                  {(() => {
                                    const lineas = dividirEnTresLineas(resp.cargo_area || "");
                                    return (
                                      <>
                                        <span className="texto-linea">{lineas[0]}</span>
                                        <span className="texto-linea">{lineas[1]}</span>
                                        <span className="texto-linea">{lineas[2]}</span>
                                      </>
                                    );
                                  })()}
                                </td>
                              </>
                            )}
                            <td>{equipo}</td>
                            <td>{modelo}</td>
                            <td>{serie}</td>
                          <td className="celda-acciones-activo">
                            <div className="acciones-activo-fila">
                              <button
                                className="btn-icon-small"
                                onClick={() => abrirModalActivo(resp.id, activo)}
                                title={`Editar: ${activo.tipo_equipo || activo.equipo || "Activo"}`}
                              >
                                ✏️
                              </button>
                              <button
                                className="btn-icon-small btn-danger"
                                onClick={() => eliminarActivo(activo.id)}
                                title={`Eliminar: ${activo.tipo_equipo || activo.equipo || "Activo"}`}
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                          {actIdx === 0 && (
                            <td rowSpan={filas} className="celda-acciones-responsable">
                              <div className="acciones-responsable">
                                <button
                                  className="btn-icon"
                                  onClick={() => generarQR(resp)}
                                  title="Generar QR del responsable"
                                >
                                  📱
                                </button>
                                <button
                                  className="btn-icon"
                                  onClick={() => abrirModalActivo(resp.id)}
                                  title="Agregar activo"
                                >
                                  ➕
                                </button>
                                <button
                                  className="btn-icon"
                                  onClick={() => abrirModalResponsable(resp)}
                                  title="Editar responsable"
                                >
                                  ✏️
                                </button>
                                <button
                                  className="btn-icon btn-danger"
                                  onClick={() => eliminarResponsable(resp.id)}
                                  title="Eliminar responsable"
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td className="celda-unidad">
                          {(() => {
                            const lineas = dividirEnTresLineas(resp.unidad || "");
                            return (
                              <>
                                <span className="texto-linea">{lineas[0]}</span>
                                <span className="texto-linea">{lineas[1]}</span>
                                <span className="texto-linea">{lineas[2]}</span>
                              </>
                            );
                          })()}
                        </td>
                        <td className="celda-responsable">
                          {(() => {
                            const lineas = dividirEnTresLineas(resp.responsable || "");
                            return (
                              <>
                                <span className="texto-linea">{lineas[0]}</span>
                                <span className="texto-linea">{lineas[1]}</span>
                                <span className="texto-linea">{lineas[2]}</span>
                              </>
                            );
                          })()}
                        </td>
                        <td className="celda-cargo">
                          {(() => {
                            const lineas = dividirEnTresLineas(resp.cargo_area || "");
                            return (
                              <>
                                <span className="texto-linea">{lineas[0]}</span>
                                <span className="texto-linea">{lineas[1]}</span>
                                <span className="texto-linea">{lineas[2]}</span>
                              </>
                            );
                          })()}
                        </td>
                        <td colSpan="3" className="sin-activos">
                          Sin activos asignados
                        </td>
                        <td className="celda-acciones-activo">
                          <span style={{ color: "#9ca3af", fontStyle: "italic", fontSize: "0.8rem" }}>–</span>
                        </td>
                        <td className="celda-acciones-responsable">
                          <div className="acciones-responsable">
                            <button
                              className="btn-icon"
                              onClick={() => generarQR(resp)}
                              title="Generar QR del responsable"
                            >
                              📱
                            </button>
                            <button
                              className="btn-icon"
                              onClick={() => abrirModalActivo(resp.id)}
                              title="Agregar activo"
                            >
                              ➕
                            </button>
                            <button
                              className="btn-icon"
                              onClick={() => abrirModalResponsable(resp)}
                              title="Editar responsable"
                            >
                              ✏️
                            </button>
                            <button
                              className="btn-icon btn-danger"
                              onClick={() => eliminarResponsable(resp.id)}
                              title="Eliminar responsable"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              });
            })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal para Responsable o Activo */}
      {modalAbierto && (
        <div className="modal-overlay" onClick={() => setModalAbierto(false)}>
          <div 
            className="modal modal-sm" 
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: window.innerWidth <= 768 ? 'calc(100vw - 20px)' : undefined,
              width: window.innerWidth <= 768 ? 'calc(100vw - 20px)' : undefined
            }}
          >
            <div className="modal-header">
              <h3>
                {modalTipo === "responsable"
                  ? editarId
                    ? "Editar Responsable"
                    : "Nuevo Responsable"
                  : editarId
                  ? "Editar Activo"
                  : "Nuevo Activo"}
              </h3>
              <button
                className="modal-close"
                onClick={() => setModalAbierto(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {modalTipo === "responsable" ? (
                <>
                  <label>Unidad</label>
                  <input
                    type="text"
                    value={formUnidad}
                    onChange={(e) => setFormUnidad(e.target.value)}
                    placeholder="Ej: Operaciones"
                  />
                  <label>Responsable</label>
                  <input
                    type="text"
                    value={formResponsable}
                    onChange={(e) => setFormResponsable(e.target.value)}
                    placeholder="Nombre completo"
                  />
                  <label>Cargo / Área</label>
                  <input
                    type="text"
                    value={formCargo}
                    onChange={(e) => setFormCargo(e.target.value)}
                    placeholder="Ej: Delegado de Operaciones"
                  />
                </>
              ) : (
                <>
                  <label>Equipo</label>
                  <input
                    type="text"
                    value={formEquipo}
                    onChange={(e) => setFormEquipo(e.target.value)}
                    placeholder="Ej: HP Laptop"
                    required
                  />
                  <label>Modelo</label>
                  <input
                    type="text"
                    value={formModelo}
                    onChange={(e) => setFormModelo(e.target.value)}
                    placeholder="Ej: 15-ef2500la"
                  />
                  <label>No. de Serie</label>
                  <input
                    type="text"
                    value={formSerie}
                    onChange={(e) => setFormSerie(e.target.value)}
                    placeholder="Ej: CND4150R2G"
                  />
                </>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setModalAbierto(false)}>
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={
                  modalTipo === "responsable" ? guardarResponsable : guardarActivo
                }
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal QR */}
      {modalQR && qrResponsable && (
        <div className="modal-overlay" onClick={() => setModalQR(false)}>
          <div className="modal modal-qr" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>QR - {qrResponsable.responsable}</h3>
              <button className="modal-close" onClick={() => setModalQR(false)}>
                ×
              </button>
            </div>
            <div className="modal-body qr-body">
              <div className="qr-container">
                {qrImage && (
                  <img 
                    src={qrImage} 
                    alt="QR Code" 
                    className="qr-image"
                    onError={(e) => {
                      console.error("Error cargando QR:", qrImage?.substring(0, 100));
                      e.target.style.display = "none";
                    }}
                    onLoad={() => {
                      console.log("✅ QR cargado exitosamente");
                    }}
                  />
                )}
                {!qrImage && (
                  <div className="qr-loading">Cargando QR...</div>
                )}
                <div className="qr-nombre">{qrResponsable.responsable}</div>
                <div className="qr-info">
                  <div>
                    <strong>Unidad:</strong> {qrResponsable.unidad}
                  </div>
                  <div>
                    <strong>Cargo:</strong> {qrResponsable.cargo_area}
                  </div>
                  <div>
                    <strong>Total Activos:</strong> {qrResponsable.total_activos || 0}
                  </div>
                </div>
                {qrResponsable.activos && qrResponsable.activos.length > 0 && (
                  <div className="qr-conteo">
                    <strong>Conteo por tipo:</strong>
                    <ul>
                      {Object.entries(
                        contarActivosPorTipo(qrResponsable.activos)
                      ).map(([tipo, cantidad]) => (
                        <li key={tipo}>
                          {tipo}: {cantidad}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="btn-primary"
                onClick={() => {
                  // Descargar QR
                  const link = document.createElement("a");
                  link.href = qrImage;
                  const nombreResponsable = (qrResponsable.responsable || "Responsable").replace(/\s+/g, "_");
                  link.download = `QR_${nombreResponsable}.png`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
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
        </>
      )}

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
              <p>Importando activos...</p>
              <p className="importacion-progreso">{progresoImportacion}%</p>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Importación */}
      {showModalImportar && (
        <div className="modal-overlay" onClick={() => setShowModalImportar(false)}>
          <div className="modal modal-importar" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Importar Activos Informáticos</h3>
              <button className="modal-close" onClick={() => setShowModalImportar(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {!archivoImportar ? (
                <>
                  <p>Selecciona un archivo Excel (.xlsx, .xls) o CSV con las siguientes columnas:</p>
                  <ul style={{ textAlign: "left", margin: "15px 0" }}>
                    <li><strong>Unidad</strong> (obligatorio)</li>
                    <li><strong>Responsable</strong> (obligatorio)</li>
                    <li><strong>Cargo / Área</strong> (opcional)</li>
                    <li><strong>Equipo</strong> (obligatorio)</li>
                    <li><strong>Modelo</strong> (opcional)</li>
                    <li><strong>No. de Serie</strong> (opcional)</li>
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
                        {columnasArchivo.map((col) => (
                          <div key={col} style={{ marginBottom: "8px", display: "flex", alignItems: "center", gap: "10px" }}>
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
                              <option value="unidad">Unidad</option>
                              <option value="responsable">Responsable</option>
                              <option value="cargo_area">Cargo / Área</option>
                              <option value="equipo">Equipo</option>
                              <option value="modelo">Modelo</option>
                              <option value="numero_serie">No. de Serie</option>
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
