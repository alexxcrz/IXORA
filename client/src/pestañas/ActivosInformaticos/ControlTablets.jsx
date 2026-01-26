import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../../AuthContext";
import { useAlert } from "../../components/AlertModal";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import { applyPlugin } from "jspdf-autotable";
import "./ActivosInformaticos.css";

applyPlugin(jsPDF);

export default function ControlTablets({ serverUrl }) {
  const { authFetch } = useAuth();
  const { showConfirm, showAlert } = useAlert();
  const [tablets, setTablets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editarId, setEditarId] = useState(null);
  
  // Formulario (sin impresora, serie_pda, modelo_impresora)
  const [formTAB, setFormTAB] = useState("");
  const [formIMEI, setFormIMEI] = useState("");
  const [formModeloTAB, setFormModeloTAB] = useState("");
  const [formAndroid, setFormAndroid] = useState("");
  const [formEncargado, setFormEncargado] = useState("");
  const [formResponsable, setFormResponsable] = useState("");
  const [formArea, setFormArea] = useState("");
  const [formObservaciones, setFormObservaciones] = useState("");
  
  // Modal QR
  const [modalQR, setModalQR] = useState(false);
  const [qrTablet, setQrTablet] = useState(null);
  const [qrImage, setQrImage] = useState(null);
  const [textoQR, setTextoQR] = useState("");
  
  // Estados para importación
  const [showModalImportar, setShowModalImportar] = useState(false);
  const [datosImportar, setDatosImportar] = useState([]);
  const [columnasArchivo, setColumnasArchivo] = useState([]);
  const [mapeoColumnas, setMapeoColumnas] = useState({});
  const [vistaPrevia, setVistaPrevia] = useState([]);
  const [importando, setImportando] = useState(false);
  const [progresoImportacion, setProgresoImportacion] = useState(0);
  // eslint-disable-next-line no-unused-vars
  const [archivoImportar, setArchivoImportar] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [erroresValidacion, setErroresValidacion] = useState([]);
  const fileInputRef = useRef(null);
  const importandoRef = useRef(false);
  
  // Estados para drag and drop
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  // Cargar datos
  const cargar = async () => {
    try {
      setLoading(true);
      const data = await authFetch(`${serverUrl}/activos/tablets`);
      setTablets(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Error cargando Tablets:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    importandoRef.current = importando;
  }, [importando]);

  useEffect(() => {
    cargar();
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
    
    const matchNo = equipo.match(/No\.\s*(\d+)/i);
    if (matchNo) {
      return matchNo[1].padStart(2, "0");
    }
    
    const matchX = equipo.match(/[X](\d+)/i);
    if (matchX) {
      return "X" + matchX[1];
    }
    
    const numMatch = equipo.match(/(\d+)/);
    if (numMatch) {
      const num = numMatch[1];
      if (equipo.trim().endsWith(num)) {
        return num.padStart(2, "0");
      }
      return num;
    }
    
    return equipo;
  };

  // Abrir modal
  const abrirModal = (tablet = null) => {
    if (tablet) {
      setEditarId(tablet.id);
      setFormTAB(tablet.tab || tablet.equipo_tab || "");
      setFormIMEI(tablet.imei || "");
      setFormModeloTAB(tablet.modelo_tab || "");
      setFormAndroid(tablet.android || "");
      setFormEncargado(tablet.encargado || "");
      setFormResponsable(tablet.responsable || "");
      setFormArea(tablet.area || "");
      setFormObservaciones(tablet.observaciones || "");
    } else {
      setEditarId(null);
      setFormTAB("");
      setFormIMEI("");
      setFormModeloTAB("");
      setFormAndroid("");
      setFormEncargado("");
      setFormResponsable("");
      setFormArea("");
      setFormObservaciones("");
    }
    setModalAbierto(true);
  };

  // Guardar Tablet
  const guardarTablet = async () => {
    if (!formTAB) {
      await showAlert("Por favor ingresa el identificador de la Tablet", "warning");
      return;
    }

    const datosForm = {
      tab: formTAB,
      imei: formIMEI,
      modelo_tab: formModeloTAB,
      android: formAndroid,
      encargado: formEncargado,
      responsable: formResponsable,
      area: formArea,
      observaciones: formObservaciones,
    };

    try {
      if (editarId) {
        await authFetch(`${serverUrl}/activos/tablets/${editarId}`, {
          method: "PUT",
          body: JSON.stringify(datosForm),
        });
        setTablets(prev => prev.map(t => 
          t.id === editarId 
            ? { ...t, ...datosForm }
            : t
        ));
        await showAlert("Tablet actualizada correctamente", "success");
      } else {
        const nuevo = await authFetch(`${serverUrl}/activos/tablets`, {
          method: "POST",
          body: JSON.stringify(datosForm),
        });
        if (nuevo && nuevo.id) {
          setTablets(prev => [...prev, nuevo]);
        } else {
          await cargar();
        }
        await showAlert("Tablet creada correctamente", "success");
      }
      setModalAbierto(false);
    } catch (e) {
      console.error("Error guardando Tablet:", e);
      await showAlert("Error al guardar Tablet", "error");
    }
  };

  // Eliminar Tablet
  const eliminarTablet = async (id) => {
    const confirmado = await showConfirm(
      "¿Eliminar Tablet?",
      "¿Estás seguro de eliminar esta Tablet?"
    );
    if (!confirmado) return;

    try {
      await authFetch(`${serverUrl}/activos/tablets/${id}`, {
        method: "DELETE",
      });
      setTablets(prev => prev.filter(t => t.id !== id));
      await showAlert("Tablet eliminada correctamente", "success");
    } catch (e) {
      console.error("Error eliminando Tablet:", e);
      await showAlert("Error al eliminar Tablet", "error");
    }
  };

  // Generar QR
  const generarQR = async (tablet) => {
    try {
      const numeroEquipo = extraerNumeroEquipo(tablet.tab || tablet.equipo_tab);
      const areaTablet = tablet.area || tablet.unidad || "";
      const texto = `${areaTablet} ${numeroEquipo}`;
      
      let qrUrl = `${serverUrl}/activos/tablets/${tablet.id}/qr?t=${Date.now()}`;
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
      
      const base64Image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      
      setQrTablet(tablet);
      setQrImage(base64Image);
      setTextoQR(texto);
      setModalQR(true);
    } catch (e) {
      console.error("Error generando QR:", e);
      await showAlert("Error al generar QR: " + (e.message || "Error desconocido"), "error");
    }
  };

  // Filtrar y ordenar tablets
  const tabletsFiltrados = busqueda.trim()
    ? tablets.filter((tablet) => {
        const busquedaLower = busqueda.toLowerCase();
        const tab = (tablet.tab || "").toLowerCase();
        const responsable = (tablet.responsable || "").toLowerCase();
        const area = (tablet.area || "").toLowerCase();
        return tab.includes(busquedaLower) || 
               responsable.includes(busquedaLower) || 
               area.includes(busquedaLower);
      })
    : tablets;

  // Ordenar tablets
  const tabletsOrdenados = [...tabletsFiltrados].sort((a, b) => {
    if (a.orden !== undefined && b.orden !== undefined) {
      return a.orden - b.orden;
    }
    return (a.id || 0) - (b.id || 0);
  });

  // Drag and drop handlers
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleRowDragOver = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleRowDragLeave = (e) => {
    e.preventDefault();
    setDragOverIndex(null);
  };

  const handleDrop = async (e, dropIndex) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const nuevaLista = [...tabletsOrdenados];
    const [removed] = nuevaLista.splice(draggedIndex, 1);
    nuevaLista.splice(dropIndex, 0, removed);
    
    const ordenes = nuevaLista.map((tablet, idx) => ({
      id: tablet.id,
      orden: idx + 1
    }));
    
    try {
      await authFetch(`${serverUrl}/activos/tablets/reordenar`, {
        method: "PUT",
        body: JSON.stringify({ ordenes }),
      });
      setTablets(nuevaLista.map((tablet, idx) => ({ ...tablet, orden: idx + 1 })));
    } catch (err) {
      console.error("Error reordenando:", err);
      await showAlert("Error al reordenar: " + err.message, "error");
    }
    
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = (e) => {
    const row = e.currentTarget.closest('tr');
    if (row) {
      row.style.opacity = "1";
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Importación desde Excel
  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setArchivoImportar(file);
    setErroresValidacion([]);
    
    try {
      const workbook = new ExcelJS.Workbook();
      const buffer = await file.arrayBuffer();
      await workbook.xlsx.load(buffer);
      
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        await showAlert("No se encontró ninguna hoja en el archivo", "error");
        return;
      }
      
      const rows = [];
      const headers = [];
      
      worksheet.eachRow((row, rowNumber) => {
        const rowData = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const value = cell.value;
          if (typeof value === 'object' && value !== null) {
            if (value.text) rowData.push(value.text);
            else if (value.result) rowData.push(value.result);
            else rowData.push(String(value));
          } else {
            rowData.push(value || "");
          }
        });
        
        if (rowNumber === 1) {
          rowData.forEach((h, i) => {
            headers.push(String(h || `Columna ${i + 1}`).trim());
          });
        } else {
          rows.push(rowData);
        }
      });
      
      setColumnasArchivo(headers);
      setDatosImportar(rows);
      
      // Mapeo automático
      const mapeoAuto = {};
      
      headers.forEach((header, idx) => {
        const headerLower = header.toLowerCase().trim();
        
        if (headerLower.includes("tab") && !headerLower.includes("modelo")) {
          mapeoAuto.tab = idx;
        } else if (headerLower.includes("imei")) {
          mapeoAuto.imei = idx;
        } else if (headerLower.includes("modelo") && headerLower.includes("tab")) {
          mapeoAuto.modelo_tab = idx;
        } else if (headerLower.includes("modelo")) {
          mapeoAuto.modelo_tab = idx;
        } else if (headerLower.includes("android")) {
          mapeoAuto.android = idx;
        } else if (headerLower.includes("encargado")) {
          mapeoAuto.encargado = idx;
        } else if (headerLower.includes("responsable")) {
          mapeoAuto.responsable = idx;
        } else if (headerLower.includes("area") || headerLower.includes("área") || headerLower.includes("unidad")) {
          mapeoAuto.area = idx;
        } else if (headerLower.includes("observ")) {
          mapeoAuto.observaciones = idx;
        }
      });
      
      setMapeoColumnas(mapeoAuto);
      setVistaPrevia(rows.slice(0, 5));
      setShowModalImportar(true);
      
    } catch (err) {
      console.error("Error leyendo archivo:", err);
      await showAlert("Error al leer el archivo: " + err.message, "error");
    }
  };

  const ejecutarImportacion = async () => {
    if (!mapeoColumnas.tab && mapeoColumnas.tab !== 0) {
      await showAlert("Debes mapear al menos la columna TAB", "error");
      return;
    }

    setImportando(true);
    importandoRef.current = true;
    setProgresoImportacion({ actual: 0, total: datosImportar.length });
    
    let exitosos = 0;
    let errores = 0;
    const erroresDetalle = [];
    
    try {
      for (let i = 0; i < datosImportar.length; i++) {
        const row = datosImportar[i];
        
        const tabletData = {
          tab: row[mapeoColumnas.tab] || "",
          imei: mapeoColumnas.imei !== undefined ? (row[mapeoColumnas.imei] || "") : "",
          modelo_tab: mapeoColumnas.modelo_tab !== undefined ? (row[mapeoColumnas.modelo_tab] || "") : "",
          android: mapeoColumnas.android !== undefined ? (row[mapeoColumnas.android] || "") : "",
          encargado: mapeoColumnas.encargado !== undefined ? (row[mapeoColumnas.encargado] || "") : "",
          responsable: mapeoColumnas.responsable !== undefined ? (row[mapeoColumnas.responsable] || "") : "",
          area: mapeoColumnas.area !== undefined ? (row[mapeoColumnas.area] || "") : "",
          observaciones: mapeoColumnas.observaciones !== undefined ? (row[mapeoColumnas.observaciones] || "") : "",
        };
        
        if (!tabletData.tab || !String(tabletData.tab).trim()) {
          errores++;
          erroresDetalle.push(`Fila ${i + 2}: TAB vacío`);
          continue;
        }
        
        try {
          await authFetch(`${serverUrl}/activos/tablets`, {
            method: "POST",
            body: JSON.stringify(tabletData),
          });
          exitosos++;
        } catch (err) {
          errores++;
          erroresDetalle.push(`Fila ${i + 2}: ${err.message}`);
        }
        
        setProgresoImportacion({ actual: i + 1, total: datosImportar.length });
      }
      
      setShowModalImportar(false);
      setArchivoImportar(null);
      setDatosImportar([]);
      setColumnasArchivo([]);
      setMapeoColumnas({});
      setVistaPrevia([]);
      
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setImportando(false);
      setProgresoImportacion(0);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      await cargar();
      
      await showAlert(
        `Importación completada: ${exitosos} tablet(s) procesada(s)${errores > 0 ? `, ${errores} error(es)` : ""}`,
        exitosos > 0 ? "success" : "error"
      );

    } catch (err) {
      console.error("Error en importación:", err);
      setImportando(false);
      importandoRef.current = false;
      setProgresoImportacion(0);
      await showAlert("Error al importar: " + err.message, "error");
    }
  };

  // Exportar a PDF
  const exportarPDF = async () => {
    if (tabletsOrdenados.length === 0) {
      await showAlert("No hay datos para exportar", "warning");
      return;
    }

    try {
      const doc = new jsPDF("landscape", "mm", "a4");
      
      // Título
      doc.setFontSize(16);
      doc.setFont(undefined, "bold");
      doc.text("Control de Tablets", 14, 15);
      
      // Fecha de generación
      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      const fechaGen = new Date().toLocaleString("es-MX");
      doc.text(`Generado el: ${fechaGen}`, 14, 22);
      
      // Preparar datos de la tabla
      const tableData = tabletsOrdenados.map(tablet => [
        tablet.tab || tablet.equipo_tab || "-",
        tablet.imei || "-",
        tablet.modelo_tab || "-",
        tablet.android || "-",
        tablet.encargado || "-",
        tablet.responsable || "-",
        tablet.area || tablet.unidad || "-",
        tablet.observaciones || "-"
      ]);

      // Crear tabla
      doc.autoTable({
        startY: 28,
        head: [["TAB", "IMEI", "MODELO TAB", "ANDROID", "Encargado", "Responsable", "AREA", "Observaciones"]],
        body: tableData,
        styles: { 
          fontSize: 8,
          cellPadding: 2
        },
        headStyles: { 
          fillColor: [13, 148, 136],
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
      doc.save(`Control_Tablets_${fechaArchivo}.pdf`);
      await showAlert("PDF generado correctamente", "success");
    } catch (err) {
      console.error("Error generando PDF:", err);
      await showAlert("Error al generar el PDF", "error");
    }
  };

  // Exportar a Excel
  const exportarExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Tablets");
      
      worksheet.columns = [
        { header: "TAB", key: "tab", width: 20 },
        { header: "IMEI", key: "imei", width: 20 },
        { header: "MODELO TAB", key: "modelo_tab", width: 15 },
        { header: "ANDROID", key: "android", width: 10 },
        { header: "Encargado", key: "encargado", width: 20 },
        { header: "Responsable", key: "responsable", width: 20 },
        { header: "AREA", key: "area", width: 15 },
        { header: "Observaciones", key: "observaciones", width: 30 },
      ];
      
      tabletsOrdenados.forEach(tablet => {
        worksheet.addRow({
          tab: tablet.tab || tablet.equipo_tab || "",
          imei: tablet.imei || "",
          modelo_tab: tablet.modelo_tab || "",
          android: tablet.android || "",
          encargado: tablet.encargado || "",
          responsable: tablet.responsable || "",
          area: tablet.area || tablet.unidad || "",
          observaciones: tablet.observaciones || "",
        });
      });
      
      // Estilo del header
      worksheet.getRow(1).eachCell(cell => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF0D9488" }
        };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      });
      
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tablets_${new Date().toISOString().split("T")[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      
    } catch (err) {
      console.error("Error exportando:", err);
      await showAlert("Error al exportar: " + err.message, "error");
    }
  };

  if (loading) {
    return <div className="activos-loading">Cargando tablets...</div>;
  }

  return (
    <div className="control-pdas-container">
      {/* Overlay de importación */}
      {importando && (
        <div className="importacion-overlay">
          <div className="importacion-loader">
            <div className="logo-loader-container">
              <img
                src="/logo.png"
                alt="Logo"
                className="logo-loader"
                onError={(e) => {
                  e.target.style.display = "none";
                  e.target.nextSibling.style.display = "flex";
                }}
              />
              <div className="logo-loader-fallback" style={{ display: "none" }}>
                <span>📱</span>
              </div>
              <div
                className="logo-loader-progress"
                style={{ height: `${100 - Math.round((progresoImportacion.actual / progresoImportacion.total) * 100)}%` }}
              ></div>
            </div>
            <div className="importacion-texto">
              <p>Importando tablets...</p>
              <p className="importacion-progreso">
                {progresoImportacion.actual} / {progresoImportacion.total}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="activos-header-actions">
        <h2>📱 Control de Tablets</h2>
        <div className="activos-actions">
          <button className="btn btn-primary" onClick={() => abrirModal()}>
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
                    fileInputRef.current?.click();
                    setMenuAbierto(false);
                  }}
                >
                  📥 Importar Excel
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
                      const response = await fetch(`${serverUrl}/activos/tablets/todos-qr-doc`, {
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
                      a.download = `QR_Control_Tablets_${new Date().toISOString().split("T")[0]}.docx`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      window.URL.revokeObjectURL(url);
                      await showAlert("Documento con todos los QR de Tablets descargado correctamente", "success");
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
                      "¿Eliminar TODAS las Tablets?",
                      "Esta acción eliminará TODAS las Tablets registradas. Esta acción NO se puede deshacer."
                    );
                    if (!confirmado) return;

                    try {
                      await authFetch(`${serverUrl}/activos/tablets/todos`, {
                        method: "DELETE",
                      });
                      setTablets([]);
                      await showAlert("Todas las Tablets han sido eliminadas", "success");
                    } catch (e) {
                      console.error("Error eliminando todas las Tablets:", e);
                      await showAlert("Error al eliminar todas las Tablets", "error");
                    }
                  }}
                >
                  🗑️ Eliminar Todas
                </button>
              </div>
            )}
          </div>
          <input
            type="file"
            ref={fileInputRef}
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
        </div>
      </div>

      {/* Buscador */}
      <div style={{ marginBottom: "20px", padding: "0 20px" }}>
        <input
          type="text"
          placeholder="🔍 Buscar por TAB, responsable o área..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{
            width: "100%",
            padding: "12px 16px",
            fontSize: "16px",
            border: "2px solid #e5e7eb",
            borderRadius: "8px",
            outline: "none",
            transition: "border-color 0.2s",
          }}
          onFocus={(e) => e.target.style.borderColor = "#0d9488"}
          onBlur={(e) => e.target.style.borderColor = "#e5e7eb"}
        />
      </div>

      <div className="activos-tabla-container" style={{ overflowX: "auto" }}>
        <table className="activos-tabla" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ background: "#0d9488", color: "#ffffff", position: "sticky", top: 0, zIndex: 10 }}>
              <th style={{ padding: "12px 3px", border: "1px solid #0f766e", textAlign: "center", fontWeight: "600", whiteSpace: "nowrap", width: "20px" }}></th>
              <th style={{ padding: "12px 8px", border: "1px solid #0f766e", textAlign: "left", fontWeight: "600", whiteSpace: "nowrap" }}>TAB</th>
              <th style={{ padding: "12px 8px", border: "1px solid #0f766e", textAlign: "left", fontWeight: "600", whiteSpace: "nowrap" }}>IMEI</th>
              <th style={{ padding: "12px 8px", border: "1px solid #0f766e", textAlign: "left", fontWeight: "600", whiteSpace: "nowrap" }}>MODELO TAB</th>
              <th style={{ padding: "12px 8px", border: "1px solid #0f766e", textAlign: "left", fontWeight: "600", whiteSpace: "nowrap" }}>ANDROID</th>
              <th style={{ padding: "12px 8px", border: "1px solid #0f766e", textAlign: "left", fontWeight: "600", whiteSpace: "nowrap" }}>Encargado</th>
              <th style={{ padding: "12px 8px", border: "1px solid #0f766e", textAlign: "left", fontWeight: "600", whiteSpace: "nowrap" }}>Responsable</th>
              <th style={{ padding: "12px 8px", border: "1px solid #0f766e", textAlign: "left", fontWeight: "600", whiteSpace: "nowrap" }}>AREA</th>
              <th style={{ padding: "12px 8px", border: "1px solid #0f766e", textAlign: "center", fontWeight: "600", whiteSpace: "nowrap" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {tabletsOrdenados.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ padding: "40px", textAlign: "center", color: "#9ca3af", fontStyle: "italic" }}>
                  No hay Tablets registradas
                </td>
              </tr>
            ) : (
              tabletsOrdenados.map((tablet, index) => (
                <tr 
                  key={tablet.id} 
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
                    backgroundColor: dragOverIndex === index ? "rgba(13, 148, 136, 0.1)" : "transparent"
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
                    {tablet.tab || tablet.equipo_tab || "–"}
                  </td>
                  <td style={{ padding: "10px 8px", border: "1px solid var(--borde-sutil)", verticalAlign: "top" }}>
                    {tablet.imei || "–"}
                  </td>
                  <td style={{ padding: "10px 8px", border: "1px solid var(--borde-sutil)", verticalAlign: "top" }}>
                    {tablet.modelo_tab || "–"}
                  </td>
                  <td style={{ padding: "10px 8px", border: "1px solid var(--borde-sutil)", verticalAlign: "top" }}>
                    {tablet.android || "–"}
                  </td>
                  <td style={{ padding: "10px 8px", border: "1px solid var(--borde-sutil)", verticalAlign: "top" }}>
                    {tablet.encargado || "–"}
                  </td>
                  <td style={{ padding: "10px 8px", border: "1px solid var(--borde-sutil)", verticalAlign: "top" }}>
                    {tablet.responsable || "–"}
                  </td>
                  <td style={{ padding: "10px 8px", border: "1px solid var(--borde-sutil)", verticalAlign: "top" }}>
                    {tablet.area || tablet.unidad || "–"}
                  </td>
                  <td style={{ padding: "10px 8px", border: "1px solid var(--borde-sutil)", verticalAlign: "top", textAlign: "center" }}>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "center", flexWrap: "wrap" }}>
                      <button
                        className="btn-icon"
                        onClick={() => generarQR(tablet)}
                        title={`Generar QR - ${tablet.tab || tablet.equipo_tab}`}
                        style={{ padding: "6px 10px", fontSize: "0.85rem" }}
                      >
                        📱 QR
                      </button>
                      <button
                        className="btn-icon-small"
                        onClick={() => abrirModal(tablet)}
                        title="Editar Tablet"
                        style={{ padding: "6px 8px" }}
                      >
                        ✏️
                      </button>
                      <button
                        className="btn-icon-small btn-danger"
                        onClick={() => eliminarTablet(tablet.id)}
                        title="Eliminar Tablet"
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

      {/* Modal para Tablet */}
      {modalAbierto && (
        <div className="modal-overlay" onClick={() => setModalAbierto(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editarId ? "Editar Tablet" : "Nueva Tablet"}</h3>
              <button
                className="modal-close"
                onClick={() => setModalAbierto(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <label>TAB *</label>
              <input
                type="text"
                value={formTAB}
                onChange={(e) => setFormTAB(e.target.value)}
                placeholder="Ej: TAB No. 1"
                required
              />
              <label>IMEI</label>
              <input
                type="text"
                value={formIMEI}
                onChange={(e) => setFormIMEI(e.target.value)}
                placeholder="Ej: 352714114318744"
              />
              <label>MODELO TAB</label>
              <input
                type="text"
                value={formModeloTAB}
                onChange={(e) => setFormModeloTAB(e.target.value)}
                placeholder="Ej: Samsung Tab A8"
              />
              <label>ANDROID</label>
              <input
                type="text"
                value={formAndroid}
                onChange={(e) => setFormAndroid(e.target.value)}
                placeholder="Ej: 11"
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
              <label>OBSERVACIONES TABLET</label>
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
              <button className="btn-primary" onClick={guardarTablet}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal QR */}
      {modalQR && qrTablet && (
        <div className="modal-overlay" onClick={() => setModalQR(false)}>
          <div className="modal modal-qr" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>QR - {qrTablet.tab || qrTablet.equipo_tab}</h3>
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
                    <strong>TAB:</strong> {qrTablet.tab || qrTablet.equipo_tab || "N/A"}
                  </div>
                  <div>
                    <strong>IMEI:</strong> {qrTablet.imei || "N/A"}
                  </div>
                  <div>
                    <strong>Modelo TAB:</strong> {qrTablet.modelo_tab || "N/A"}
                  </div>
                  <div>
                    <strong>Android:</strong> {qrTablet.android || "N/A"}
                  </div>
                  <div>
                    <strong>Encargado:</strong> {qrTablet.encargado || "N/A"}
                  </div>
                  <div>
                    <strong>Responsable:</strong> {qrTablet.responsable || "N/A"}
                  </div>
                  <div>
                    <strong>Área:</strong> {qrTablet.area || qrTablet.unidad || "N/A"}
                  </div>
                  {qrTablet.observaciones && (
                    <div>
                      <strong>Observaciones:</strong> {qrTablet.observaciones}
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
                    const img = new Image();
                    
                    await new Promise((resolve, reject) => {
                      img.onload = resolve;
                      img.onerror = reject;
                      if (qrImage.startsWith('data:')) {
                        img.src = qrImage;
                      } else {
                        const url = new URL(qrImage, window.location.href);
                        url.protocol = window.location.protocol;
                        img.src = url.toString();
                      }
                    });
                    
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d");
                    const padding = 40;
                    const textHeight = 60;
                    
                    canvas.width = img.width + (padding * 2);
                    canvas.height = img.height + (padding * 2) + textHeight;
                    
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    
                    ctx.drawImage(img, padding, padding);
                    
                    ctx.font = "bold 32px Arial";
                    ctx.fillStyle = "#000000";
                    ctx.textAlign = "center";
                    ctx.fillText(textoQR, canvas.width / 2, img.height + padding + textHeight - 15);
                    
                    const link = document.createElement("a");
                    link.download = `QR_${(qrTablet.tab || qrTablet.equipo_tab || "tablet").replace(/[^a-zA-Z0-9]/g, "_")}.png`;
                    link.href = canvas.toDataURL("image/png");
                    link.click();
                  } catch (err) {
                    console.error("Error descargando QR:", err);
                    await showAlert("Error al descargar QR: " + err.message, "error");
                  }
                }}
              >
                📥 Descargar QR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Importar */}
      {showModalImportar && (
        <div className="modal-overlay" onClick={() => setShowModalImportar(false)}>
          <div className="modal modal-importar" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Importar Tablets desde Excel</h3>
              <button className="modal-close" onClick={() => setShowModalImportar(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: "15px", color: "#666" }}>
                Mapea las columnas del archivo a los campos de Tablet:
              </p>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "20px" }}>
                {["tab", "imei", "modelo_tab", "android", "encargado", "responsable", "area", "observaciones"].map(campo => (
                  <div key={campo} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <label style={{ minWidth: "120px", fontWeight: "500" }}>
                      {campo === "tab" ? "TAB *" : 
                       campo === "modelo_tab" ? "MODELO TAB" :
                       campo.charAt(0).toUpperCase() + campo.slice(1)}:
                    </label>
                    <select
                      value={mapeoColumnas[campo] ?? ""}
                      onChange={(e) => setMapeoColumnas(prev => ({
                        ...prev,
                        [campo]: e.target.value === "" ? undefined : parseInt(e.target.value)
                      }))}
                      style={{ flex: 1, padding: "8px", borderRadius: "4px", border: "1px solid #ddd" }}
                    >
                      <option value="">-- No mapear --</option>
                      {columnasArchivo.map((col, idx) => (
                        <option key={idx} value={idx}>{col}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              
              {vistaPrevia.length > 0 && (
                <>
                  <h4 style={{ marginBottom: "10px" }}>Vista previa (primeras 5 filas):</h4>
                  <div style={{ overflowX: "auto", maxHeight: "200px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                      <thead>
                        <tr>
                          {columnasArchivo.map((col, idx) => (
                            <th key={idx} style={{ padding: "8px", background: "#f3f4f6", border: "1px solid #ddd", whiteSpace: "nowrap" }}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {vistaPrevia.map((row, rowIdx) => (
                          <tr key={rowIdx}>
                            {row.map((cell, cellIdx) => (
                              <td key={cellIdx} style={{ padding: "6px 8px", border: "1px solid #ddd" }}>
                                {String(cell || "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              
              <p style={{ marginTop: "15px", fontSize: "0.9rem", color: "#666" }}>
                Total de filas a importar: <strong>{datosImportar.length}</strong>
              </p>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowModalImportar(false)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={ejecutarImportacion}>
                Importar {datosImportar.length} tablets
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
