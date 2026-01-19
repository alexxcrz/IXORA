import React, { useState, useEffect, useRef } from "react";
import "./Auditoria.css";
import { useAuth } from "../../AuthContext";
import { useAlert } from "../../components/AlertModal";
import { safeFocus, puedeHacerFocus } from "../../utils/focusHelper";
import ExcelJS from "exceljs";
import { Document, Packer, Paragraph, AlignmentType, TextRun, Table, TableRow, TableCell, WidthType } from "docx";
import { getServerUrl } from "../../config/server";

export default function Auditoria({ SERVER_URL }) {
  const { authFetch, can } = useAuth();
  const { showAlert, showConfirm } = useAlert();
  
  const [auditorias, setAuditorias] = useState([]);
  const [auditoriaActual, setAuditoriaActual] = useState(null);
  const [itemsEscaneados, setItemsEscaneados] = useState([]);
  
  // Verificar si el usuario puede ver todos los items (admin o tiene permiso de inventario)
  const puedeVerTodo = can("admin") || can("tab:inventario");
  const [codigoInput, setCodigoInput] = useState("");
  const [cantidadInput, setCantidadInput] = useState("");
  const [piezasNoAptasInput, setPiezasNoAptasInput] = useState("");
  const [loteInput, setLoteInput] = useState("");
  const [mostrarNuevaAuditoria, setMostrarNuevaAuditoria] = useState(false);
  const [nombreAuditoria, setNombreAuditoria] = useState("");
  const [filtroDiferencias, setFiltroDiferencias] = useState("todos"); // todos, diferencias, coincidencias
  const [busqueda, setBusqueda] = useState("");
  const [exportando, setExportando] = useState(false);
  const [estadisticasInventario, setEstadisticasInventario] = useState({ totalProductos: 0, totalPiezas: 0 });
  
  const codigoInputRef = useRef(null);
  const cantidadInputRef = useRef(null);
  const procesandoRef = useRef(false);

  // Cargar auditorías y estadísticas del inventario al montar
  useEffect(() => {
    cargarAuditorias();
    cargarEstadisticasInventario();
  }, []);

  // Sincronización en tiempo real con Socket.IO
  useEffect(() => {
    const socket = window.socket;
    
    const handleAuditoriaCreada = (nuevaAuditoria) => {
      setAuditorias(prev => {
        // Evitar duplicados
        if (prev.find(a => a.id === nuevaAuditoria.id)) {
          return prev;
        }
        return [nuevaAuditoria, ...prev];
      });
    };

    const handleAuditoriasActualizadas = async () => {
      try {
        const data = await authFetch(`${SERVER_URL}/api/auditoria/listar`);
        setAuditorias(data || []);
      } catch (err) {
        console.error("Error cargando auditorías:", err);
      }
    };

    const handleAuditoriaActualizada = async ({ auditoriaId }) => {
      // Si la auditoría actual es la que se actualizó, recargar sus items
      if (auditoriaActual && auditoriaActual.id === auditoriaId) {
        try {
          const data = await authFetch(`${SERVER_URL}/api/auditoria/${auditoriaId}/items`);
          setItemsEscaneados(data || []);
        } catch (err) {
          console.error("Error recargando items de auditoría:", err);
        }
      }
      // También recargar la lista de auditorías
      handleAuditoriasActualizadas();
    };

    const handleItemAgregado = ({ auditoriaId, item }) => {
      // Si la auditoría actual es la que se actualizó, agregar el item
      if (auditoriaActual && auditoriaActual.id === auditoriaId) {
        setItemsEscaneados(prev => {
          // Evitar duplicados
          if (prev.find(i => i.id === item.id)) {
            return prev.map(i => i.id === item.id ? item : i);
          }
          return [item, ...prev];
        });
      }
    };

    const handleItemEliminado = ({ auditoriaId, itemId }) => {
      // Si la auditoría actual es la que se actualizó, eliminar el item
      if (auditoriaActual && auditoriaActual.id === auditoriaId) {
        setItemsEscaneados(prev => prev.filter(i => i.id !== itemId));
      }
    };

    const handleAuditoriaFinalizada = (auditoriaFinalizada) => {
      setAuditorias(prev => prev.map(a => a.id === auditoriaFinalizada.id ? auditoriaFinalizada : a));
      // Si la auditoría actual es la que se finalizó, actualizarla
      if (auditoriaActual && auditoriaActual.id === auditoriaFinalizada.id) {
        setAuditoriaActual(auditoriaFinalizada);
      }
    };

    const handleEstadisticasInventarioActualizadas = async () => {
      try {
        const data = await authFetch(`${SERVER_URL}/api/auditoria/estadisticas-inventario`);
        setEstadisticasInventario(data || { totalProductos: 0, totalPiezas: 0 });
      } catch (err) {
        console.error("Error cargando estadísticas de inventario:", err);
      }
    };

    socket.on("auditoria_creada", handleAuditoriaCreada);
    socket.on("auditorias_actualizadas", handleAuditoriasActualizadas);
    socket.on("auditoria_actualizada", handleAuditoriaActualizada);
    socket.on("auditoria_item_agregado", handleItemAgregado);
    socket.on("auditoria_item_eliminado", handleItemEliminado);
    socket.on("auditoria_finalizada", handleAuditoriaFinalizada);
    socket.on("auditoria_estadisticas_inventario_actualizadas", handleEstadisticasInventarioActualizadas);
    socket.on("inventario_actualizado", handleEstadisticasInventarioActualizadas);

    return () => {
      socket.off("auditoria_creada", handleAuditoriaCreada);
      socket.off("auditorias_actualizadas", handleAuditoriasActualizadas);
      socket.off("auditoria_actualizada", handleAuditoriaActualizada);
      socket.off("auditoria_item_agregado", handleItemAgregado);
      socket.off("auditoria_item_eliminado", handleItemEliminado);
      socket.off("auditoria_finalizada", handleAuditoriaFinalizada);
      socket.off("auditoria_estadisticas_inventario_actualizadas", handleEstadisticasInventarioActualizadas);
      socket.off("inventario_actualizado", handleEstadisticasInventarioActualizadas);
    };
  }, [auditoriaActual, authFetch, SERVER_URL]);

  const cargarEstadisticasInventario = async () => {
    try {
      const data = await authFetch(`${SERVER_URL}/api/auditoria/estadisticas-inventario`);
      setEstadisticasInventario(data || { totalProductos: 0, totalPiezas: 0 });
    } catch (err) {
      console.error("Error cargando estadísticas de inventario:", err);
    }
  };

  // Auto-focus en el input de código
  useEffect(() => {
    if (auditoriaActual && auditoriaActual.estado === "en_proceso") {
      setTimeout(() => {
        if (codigoInputRef.current && puedeHacerFocus()) {
          safeFocus(codigoInputRef.current, 0);
        }
      }, 200);
    }
  }, [auditoriaActual]);

  const cargarAuditorias = async () => {
    try {
      const data = await authFetch(`${SERVER_URL}/api/auditoria/listar`);
      setAuditorias(data || []);
    } catch (err) {
      console.error("Error cargando auditorías:", err);
    }
  };

  const crearNuevaAuditoria = async () => {
    if (!nombreAuditoria.trim()) {
      await showAlert("Debes ingresar un nombre para la auditoría", "warning");
      return;
    }

    try {
      const data = await authFetch(`${SERVER_URL}/api/auditoria/crear`, {
        method: "POST",
        body: JSON.stringify({ nombre: nombreAuditoria.trim() }),
      });

      setAuditoriaActual(data);
      setItemsEscaneados([]);
      setMostrarNuevaAuditoria(false);
      setNombreAuditoria("");
      await cargarAuditorias();
      await showAlert("Auditoría creada exitosamente", "success");
    } catch (err) {
      await showAlert(err.message || "Error creando auditoría", "error");
    }
  };

  const abrirAuditoria = async (auditoria) => {
    try {
      const data = await authFetch(`${SERVER_URL}/api/auditoria/${auditoria.id}/items`);
      setAuditoriaActual(auditoria);
      setItemsEscaneados(data || []);
    } catch (err) {
      await showAlert(err.message || "Error cargando auditoría", "error");
    }
  };

  const procesarCodigo = async () => {
    if (procesandoRef.current) return;
    
    const codigo = codigoInput.trim();
    if (!codigo) return;

    if (!auditoriaActual) {
      await showAlert("Debes seleccionar o crear una auditoría primero", "warning");
      return;
    }

    if (auditoriaActual.estado !== "en_proceso") {
      await showAlert("Esta auditoría ya está finalizada", "warning");
      return;
    }

    procesandoRef.current = true;

    try {
      // Validar código en el sistema
      const validacion = await authFetch(`${SERVER_URL}/inventario/validar-codigo/${codigo}`);
      
      if (!validacion.existe) {
        await showAlert(`Código ${codigo} no existe en el sistema`, "warning");
        setCodigoInput("");
        procesandoRef.current = false;
        if (codigoInputRef.current) safeFocus(codigoInputRef.current, 0);
        return;
      }

      const codigoPrincipal = validacion.codigo_principal;
      
      // Obtener información del producto del sistema
      const producto = await authFetch(`${SERVER_URL}/inventario/producto/${codigoPrincipal}`);
      
      // Obtener cantidad física (si no se ingresó, usar 0)
      const cantidadFisica = parseInt(cantidadInput) || 0;
      const piezasNoAptas = parseInt(piezasNoAptasInput) || 0;
      const lote = loteInput.trim() || producto.lote || "";

      // Obtener cantidad del sistema (suma de lotes activos)
      const lotes = await authFetch(`${SERVER_URL}/inventario/lotes/${codigoPrincipal}`);
      const cantidadSistema = lotes.reduce((sum, l) => sum + (l.cantidad_piezas || 0), 0);

      // Calcular diferencia (la cantidad física ya incluye las piezas no aptas, pero las descontamos del inventario)
      // La diferencia se calcula como: cantidad_fisica - cantidad_sistema
      // Pero las piezas no aptas se descontarán del inventario
      const diferencia = cantidadFisica - cantidadSistema;
      const tipoDiferencia = diferencia > 0 ? "sobrante" : diferencia < 0 ? "faltante" : "coincide";

      // Agregar o actualizar item en la auditoría
      const itemData = {
        codigo: codigoPrincipal,
        nombre: producto.nombre,
        lote: lote,
        cantidad_sistema: cantidadSistema,
        cantidad_fisica: cantidadFisica,
        piezas_no_aptas: piezasNoAptas,
        diferencia: diferencia,
        tipo_diferencia: tipoDiferencia,
      };

      const resultado = await authFetch(`${SERVER_URL}/api/auditoria/${auditoriaActual.id}/agregar-item`, {
        method: "POST",
        body: JSON.stringify(itemData),
      });

      // Actualizar lista local
      const itemExistente = itemsEscaneados.find(i => i.codigo === codigoPrincipal && i.lote === lote);
      if (itemExistente) {
        setItemsEscaneados(itemsEscaneados.map(i => 
          i.id === itemExistente.id ? resultado : i
        ));
      } else {
        setItemsEscaneados([...itemsEscaneados, resultado]);
      }

      // Limpiar inputs
      setCodigoInput("");
      setCantidadInput("");
      setPiezasNoAptasInput("");
      setLoteInput("");
      
      // Actualizar estadísticas de la auditoría
      await cargarAuditorias();
      const auditoriaActualizada = await authFetch(`${SERVER_URL}/api/auditoria/${auditoriaActual.id}`);
      setAuditoriaActual(auditoriaActualizada);

      // Focus de vuelta al input
      setTimeout(() => {
        if (codigoInputRef.current) safeFocus(codigoInputRef.current, 0);
      }, 100);

    } catch (err) {
      await showAlert(err.message || "Error procesando código", "error");
    } finally {
      procesandoRef.current = false;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.target.id === "codigoInput") {
        if (cantidadInputRef.current) {
          cantidadInputRef.current.focus();
        } else {
          procesarCodigo();
        }
      } else if (e.target.id === "cantidadInput") {
        procesarCodigo();
      }
    }
  };

  const finalizarAuditoria = async () => {
    const confirmado = await showConfirm(
      "¿Estás seguro de finalizar esta auditoría? No podrás agregar más productos.",
      "Finalizar Auditoría"
    );
    
    if (!confirmado) return;

    try {
      await authFetch(`${SERVER_URL}/api/auditoria/${auditoriaActual.id}/finalizar`, {
        method: "POST",
      });

      await cargarAuditorias();
      const auditoriaActualizada = await authFetch(`${SERVER_URL}/api/auditoria/${auditoriaActual.id}`);
      setAuditoriaActual(auditoriaActualizada);
      
      await showAlert("Auditoría finalizada exitosamente", "success");
    } catch (err) {
      await showAlert(err.message || "Error finalizando auditoría", "error");
    }
  };

  const eliminarItem = async (itemId) => {
    const confirmado = await showConfirm(
      "¿Estás seguro de eliminar este item de la auditoría?",
      "Eliminar Item"
    );
    
    if (!confirmado) return;

    try {
      await authFetch(`${SERVER_URL}/api/auditoria/item/${itemId}/eliminar`, {
        method: "DELETE",
      });

      setItemsEscaneados(itemsEscaneados.filter(i => i.id !== itemId));
      await cargarAuditorias();
      const auditoriaActualizada = await authFetch(`${SERVER_URL}/api/auditoria/${auditoriaActual.id}`);
      setAuditoriaActual(auditoriaActualizada);
    } catch (err) {
      await showAlert(err.message || "Error eliminando item", "error");
    }
  };

  // Filtrar items según filtros
  const itemsFiltrados = itemsEscaneados.filter(item => {
    // Filtro de diferencias
    if (filtroDiferencias === "diferencias" && item.diferencia === 0) return false;
    if (filtroDiferencias === "coincidencias" && item.diferencia !== 0) return false;
    
    // Filtro de búsqueda
    if (busqueda) {
      const busquedaLower = busqueda.toLowerCase();
      return (
        item.codigo?.toLowerCase().includes(busquedaLower) ||
        item.nombre?.toLowerCase().includes(busquedaLower) ||
        item.lote?.toLowerCase().includes(busquedaLower)
      );
    }
    
    return true;
  });

  // Estadísticas
  const estadisticas = {
    total: itemsEscaneados.length,
    coincidencias: itemsEscaneados.filter(i => i.diferencia === 0).length,
    sobrantes: itemsEscaneados.filter(i => i.diferencia > 0).length,
    faltantes: itemsEscaneados.filter(i => i.diferencia < 0).length,
    diferenciaTotal: itemsEscaneados.reduce((sum, i) => sum + i.diferencia, 0),
  };

  // Exportar a Excel
  const exportarExcel = async () => {
    if (!auditoriaActual || itemsEscaneados.length === 0) {
      await showAlert("No hay datos para exportar", "warning");
      return;
    }

    setExportando(true);
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Auditoría de Inventario");

      // Título
      worksheet.mergeCells("A1:H1");
      worksheet.getCell("A1").value = `AUDITORÍA DE INVENTARIO - ${auditoriaActual.nombre}`;
      worksheet.getCell("A1").font = { size: 16, bold: true };
      worksheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };

      // Información de la auditoría
      worksheet.getCell("A2").value = "Información de la Auditoría";
      worksheet.getCell("A2").font = { bold: true, size: 12 };
      worksheet.addRow(["Usuario:", auditoriaActual.usuario]);
      worksheet.addRow(["Fecha Inicio:", new Date(auditoriaActual.fecha_inicio).toLocaleString()]);
      if (auditoriaActual.fecha_fin) {
        worksheet.addRow(["Fecha Fin:", new Date(auditoriaActual.fecha_fin).toLocaleString()]);
      }
      worksheet.addRow(["Estado:", auditoriaActual.estado === "en_proceso" ? "En Proceso" : "Finalizada"]);
      worksheet.addRow([]);

      // Estadísticas
      const rowInicioStats = worksheet.rowCount + 1;
      worksheet.getCell(`A${rowInicioStats}`).value = "Estadísticas";
      worksheet.getCell(`A${rowInicioStats}`).font = { bold: true, size: 12 };
      worksheet.addRow(["Total Escaneados:", estadisticas.total]);
      worksheet.addRow(["Coincidencias:", estadisticas.coincidencias]);
      worksheet.addRow(["Sobrantes:", estadisticas.sobrantes]);
      worksheet.addRow(["Faltantes:", estadisticas.faltantes]);
      worksheet.addRow(["Diferencia Total:", estadisticas.diferenciaTotal]);
      worksheet.addRow([]);

      // Encabezados de la tabla
      const headerRow = worksheet.addRow([
        "Código",
        "Nombre",
        "Lote",
        "Cantidad Sistema",
        "Cantidad Física",
        "Diferencia",
        "Tipo Diferencia",
        "Observaciones"
      ]);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF3B82F6" }
      };
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.alignment = { horizontal: "center", vertical: "middle" };

      // Datos
      itemsEscaneados.forEach(item => {
        const row = worksheet.addRow([
          item.codigo,
          item.nombre,
          item.lote || "-",
          item.cantidad_sistema,
          item.cantidad_fisica,
          item.piezas_no_aptas || 0,
          item.diferencia,
          item.tipo_diferencia === "sobrante" ? "Sobrante" :
          item.tipo_diferencia === "faltante" ? "Faltante" : "Coincide",
          item.observaciones || "-"
        ]);

        // Colorear filas según diferencia
        if (item.diferencia > 0) {
          row.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFDBEAFE" }
          };
        } else if (item.diferencia < 0) {
          row.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFEE2E2" }
          };
        } else {
          row.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFD1FAE5" }
          };
        }

        // Colorear columna de piezas no aptas
        const noAptasCell = row.getCell(6);
        if (item.piezas_no_aptas > 0) {
          noAptasCell.font = { color: { argb: "FFEF4444" }, bold: true };
        }

        // Colorear columna de diferencia
        const diferenciaCell = row.getCell(7);
        if (item.diferencia > 0) {
          diferenciaCell.font = { color: { argb: "FF3B82F6" }, bold: true };
        } else if (item.diferencia < 0) {
          diferenciaCell.font = { color: { argb: "FFEF4444" }, bold: true };
        } else {
          diferenciaCell.font = { color: { argb: "FF22C55E" }, bold: true };
        }
      });

      // Ajustar ancho de columnas
      worksheet.columns.forEach((column, index) => {
        if (index === 1) { // Nombre
          column.width = 40;
        } else if (index === 7) { // Observaciones
          column.width = 30;
        } else {
          column.width = 18;
        }
      });

      // Generar archivo
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Auditoria_${auditoriaActual.nombre.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);

      await showAlert("Reporte exportado exitosamente", "success");
    } catch (err) {
      console.error("Error exportando a Excel:", err);
      await showAlert("Error al exportar el reporte", "error");
    } finally {
      setExportando(false);
    }
  };

  // Exportar a Word (PDF)
  const exportarPDF = async () => {
    if (!auditoriaActual || itemsEscaneados.length === 0) {
      await showAlert("No hay datos para exportar", "warning");
      return;
    }

    setExportando(true);
    try {
      const children = [];

      // Título
      children.push(
        new Paragraph({
          text: `AUDITORÍA DE INVENTARIO - ${auditoriaActual.nombre}`,
          heading: "Heading1",
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        })
      );

      // Información de la auditoría
      children.push(
        new Paragraph({
          text: "Información de la Auditoría",
          heading: "Heading2",
          spacing: { before: 200, after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Usuario: ", bold: true }),
            new TextRun({ text: auditoriaActual.usuario }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Fecha Inicio: ", bold: true }),
            new TextRun({ text: new Date(auditoriaActual.fecha_inicio).toLocaleString() }),
          ],
        }),
        ...(auditoriaActual.fecha_fin ? [
          new Paragraph({
            children: [
              new TextRun({ text: "Fecha Fin: ", bold: true }),
              new TextRun({ text: new Date(auditoriaActual.fecha_fin).toLocaleString() }),
            ],
          })
        ] : []),
        new Paragraph({
          children: [
            new TextRun({ text: "Estado: ", bold: true }),
            new TextRun({ text: auditoriaActual.estado === "en_proceso" ? "En Proceso" : "Finalizada" }),
          ],
        }),
        new Paragraph({ text: "", spacing: { after: 400 } })
      );

      // Estadísticas
      children.push(
        new Paragraph({
          text: "Estadísticas",
          heading: "Heading2",
          spacing: { before: 200, after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Total Escaneados: ", bold: true }),
            new TextRun({ text: estadisticas.total.toString() }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Coincidencias: ", bold: true }),
            new TextRun({ text: estadisticas.coincidencias.toString() }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Sobrantes: ", bold: true }),
            new TextRun({ text: estadisticas.sobrantes.toString() }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Faltantes: ", bold: true }),
            new TextRun({ text: estadisticas.faltantes.toString() }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Diferencia Total: ", bold: true }),
            new TextRun({ text: estadisticas.diferenciaTotal.toString() }),
          ],
        }),
        new Paragraph({ text: "", spacing: { after: 400 } })
      );

      // Tabla de productos
      children.push(
        new Paragraph({
          text: "Productos Escaneados",
          heading: "Heading2",
          spacing: { before: 200, after: 200 },
        })
      );

      // Crear tabla
      const tableRows = [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph("Código")] }),
            new TableCell({ children: [new Paragraph("Nombre")] }),
            new TableCell({ children: [new Paragraph("Lote")] }),
            new TableCell({ children: [new Paragraph("Sistema")] }),
            new TableCell({ children: [new Paragraph("Físico")] }),
            new TableCell({ children: [new Paragraph("Diferencia")] }),
            new TableCell({ children: [new Paragraph("Estado")] }),
          ],
        }),
        ...itemsEscaneados.map(item => 
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(item.codigo || "-")] }),
              new TableCell({ children: [new Paragraph(item.nombre || "-")] }),
              new TableCell({ children: [new Paragraph(item.lote || "-")] }),
              new TableCell({ children: [new Paragraph(item.cantidad_sistema?.toString() || "0")] }),
              new TableCell({ children: [new Paragraph(item.cantidad_fisica?.toString() || "0")] }),
              new TableCell({ 
                children: [new Paragraph({
                  children: [
                    new TextRun({ 
                      text: (item.piezas_no_aptas || 0).toString(),
                      color: item.piezas_no_aptas > 0 ? "EF4444" : "666666",
                      bold: item.piezas_no_aptas > 0,
                    }),
                  ],
                })],
              }),
              new TableCell({ 
                children: [new Paragraph({
                  children: [
                    new TextRun({ 
                      text: item.diferencia > 0 ? `+${item.diferencia}` : item.diferencia.toString(),
                      color: item.diferencia > 0 ? "3B82F6" : item.diferencia < 0 ? "EF4444" : "22C55E",
                      bold: true,
                    }),
                  ],
                })],
              }),
              new TableCell({ 
                children: [new Paragraph(
                  item.tipo_diferencia === "sobrante" ? "Sobrante" :
                  item.tipo_diferencia === "faltante" ? "Faltante" : "Coincide"
                )],
              }),
            ],
          })
        ),
      ];

      const table = new Table({
        rows: tableRows,
        width: { size: 100, type: WidthType.PERCENTAGE },
      });

      children.push(table);

      // Crear documento
      const doc = new Document({
        sections: [{
          children: children,
        }],
      });

      // Generar y descargar
      const blob = await Packer.toBlob(doc);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Auditoria_${auditoriaActual.nombre.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.docx`;
      link.click();
      window.URL.revokeObjectURL(url);

      await showAlert("Reporte exportado exitosamente", "success");
    } catch (err) {
      console.error("Error exportando a Word:", err);
      await showAlert("Error al exportar el reporte", "error");
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="auditoria-container">
      {/* Modal Nueva Auditoría */}
      {mostrarNuevaAuditoria && (
        <div className="modal-overlay" onClick={() => setMostrarNuevaAuditoria(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Nueva Auditoría</h3>
              <button className="modal-close" onClick={() => setMostrarNuevaAuditoria(false)}>×</button>
            </div>
            <div className="modal-body">
              <label>
                Nombre de la Auditoría
                <input
                  type="text"
                  value={nombreAuditoria}
                  onChange={(e) => setNombreAuditoria(e.target.value)}
                  placeholder="Ej: Auditoría Enero 2025"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      crearNuevaAuditoria();
                    }
                  }}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setMostrarNuevaAuditoria(false)}>Cancelar</button>
              <button className="btn-primary" onClick={crearNuevaAuditoria}>Crear</button>
            </div>
          </div>
        </div>
      )}

      <div className="auditoria-card-wrapper">
        <div className="auditoria-header">
          <h2>📊 Auditoría de Inventario</h2>
          <button 
            className="btn-primary"
            onClick={() => setMostrarNuevaAuditoria(true)}
          >
            + Nueva Auditoría
          </button>
        </div>

        {/* Lista de Auditorías */}
        {!auditoriaActual && (
          <div className="auditorias-lista">
            <h3>Auditorías Existentes</h3>
            {auditorias.length === 0 ? (
              <p className="sin-datos">No hay auditorías creadas aún</p>
            ) : (
              <div className="auditorias-grid">
                {auditorias.map(aud => (
                  <div 
                    key={aud.id} 
                    className="auditoria-card"
                    onClick={() => abrirAuditoria(aud)}
                  >
                    <div className="auditoria-card-header">
                      <h4>{aud.nombre}</h4>
                      <span className={`auditoria-estado ${aud.estado}`}>
                        {aud.estado === "en_proceso" ? "🟢 En Proceso" : "✅ Finalizada"}
                      </span>
                    </div>
                    <div className="auditoria-card-info">
                      <p><strong>Usuario:</strong> {aud.usuario}</p>
                      <p><strong>Fecha:</strong> {new Date(aud.fecha_inicio).toLocaleDateString()}</p>
                      <p><strong>Productos:</strong> {aud.productos_escaneados} / {aud.total_productos}</p>
                      {aud.diferencias_encontradas > 0 && (
                        <p className="diferencias-badge">
                          ⚠️ {aud.diferencias_encontradas} diferencia(s)
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Vista de Auditoría Activa */}
        {auditoriaActual && (
        <div className="auditoria-activa">
          <div className="auditoria-activa-header">
            <div>
              <h3>{auditoriaActual.nombre}</h3>
              <p className="auditoria-meta">
                {auditoriaActual.estado === "en_proceso" ? "🟢 En Proceso" : "✅ Finalizada"} • 
                Creada por: {auditoriaActual.usuario} • 
                Fecha: {new Date(auditoriaActual.fecha_inicio).toLocaleString()}
              </p>
            </div>
            <div className="auditoria-actions">
              <div className="auditoria-actions-group">
                <button 
                  className="btn btn-export" 
                  onClick={exportarExcel}
                  disabled={exportando || itemsEscaneados.length === 0}
                >
                  {exportando ? "⏳ Exportando..." : "📊 Excel"}
                </button>
                <button 
                  className="btn btn-export" 
                  onClick={exportarPDF}
                  disabled={exportando || itemsEscaneados.length === 0}
                >
                  {exportando ? "⏳ Exportando..." : "📄 Word"}
                </button>
              </div>
              <div className="auditoria-actions-group">
                {auditoriaActual.estado === "en_proceso" && (
                  <button className="btn-primary" onClick={finalizarAuditoria}>
                    Finalizar Auditoría
                  </button>
                )}
                <button className="btn" onClick={() => {
                  setAuditoriaActual(null);
                  setItemsEscaneados([]);
                }}>
                  Volver
                </button>
              </div>
            </div>
          </div>

          {/* Estadísticas del Inventario */}
          <div className="auditoria-stats" style={{ marginBottom: "20px", borderBottom: "2px solid var(--borde-sutil)", paddingBottom: "20px" }}>
            <div className="stat-card" style={{ background: "linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.05))", border: "1px solid rgba(59, 130, 246, 0.3)" }}>
              <div className="stat-value" style={{ color: "var(--azul-primario)", fontSize: "1.8rem" }}>
                {estadisticasInventario.totalProductos.toLocaleString()}
              </div>
              <div className="stat-label">Total Productos Registrados</div>
            </div>
            <div className="stat-card" style={{ background: "linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.05))", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
              <div className="stat-value" style={{ color: "#10b981", fontSize: "1.8rem" }}>
                {estadisticasInventario.totalPiezas.toLocaleString()}
              </div>
              <div className="stat-label">Total Piezas en Inventario</div>
            </div>
          </div>

          {/* Estadísticas de la Auditoría */}
          <div className="auditoria-stats">
            <div className="stat-card">
              <div className="stat-value">{estadisticas.total}</div>
              <div className="stat-label">
                {puedeVerTodo ? "Total Escaneados" : "Mis Escaneados"}
              </div>
            </div>
            <div className="stat-card stat-coincide">
              <div className="stat-value">{estadisticas.coincidencias}</div>
              <div className="stat-label">Coinciden</div>
            </div>
            <div className="stat-card stat-sobrante">
              <div className="stat-value">{estadisticas.sobrantes}</div>
              <div className="stat-label">Sobrantes</div>
            </div>
            <div className="stat-card stat-faltante">
              <div className="stat-value">{estadisticas.faltantes}</div>
              <div className="stat-label">Faltantes</div>
            </div>
            <div className="stat-card stat-diferencia">
              <div className="stat-value">{estadisticas.diferenciaTotal > 0 ? "+" : ""}{estadisticas.diferenciaTotal}</div>
              <div className="stat-label">Diferencia Total</div>
            </div>
          </div>
          
          {/* Indicador de vista */}
          {!puedeVerTodo && (
            <div style={{ 
              padding: "12px", 
              background: "rgba(59, 130, 246, 0.1)", 
              border: "1px solid rgba(59, 130, 246, 0.3)", 
              borderRadius: "8px", 
              marginBottom: "16px",
              textAlign: "center",
              fontSize: "0.9rem",
              color: "var(--texto-principal)"
            }}>
              👤 Estás viendo solo tus escaneos. Los administradores pueden ver todos los escaneos.
            </div>
          )}

          {/* Formulario de Escaneo */}
          {auditoriaActual.estado === "en_proceso" && (
            <div className="auditoria-escaneo">
              <h4>Escanear Producto</h4>
              <div className="escaneo-inputs">
                <div className="input-group">
                  <label>Código</label>
                  <input
                    id="codigoInput"
                    ref={codigoInputRef}
                    type="text"
                    value={codigoInput}
                    onChange={(e) => setCodigoInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Escanear o escribir código..."
                    autoFocus
                  />
                </div>
                <div className="input-group">
                  <label>Cantidad Física</label>
                  <input
                    id="cantidadInput"
                    ref={cantidadInputRef}
                    type="number"
                    value={cantidadInput}
                    onChange={(e) => setCantidadInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Cantidad encontrada..."
                    min="0"
                  />
                </div>
                <div className="input-group">
                  <label>Piezas No Aptas</label>
                  <input
                    type="number"
                    value={piezasNoAptasInput}
                    onChange={(e) => setPiezasNoAptasInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        procesarCodigo();
                      }
                    }}
                    placeholder="Piezas dañadas..."
                    min="0"
                  />
                </div>
                <div className="input-group">
                  <label>Lote (Opcional)</label>
                  <input
                    type="text"
                    value={loteInput}
                    onChange={(e) => setLoteInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        procesarCodigo();
                      }
                    }}
                    placeholder="Lote..."
                  />
                </div>
                <button className="btn-primary btn-escaneo" onClick={procesarCodigo}>
                  Agregar
                </button>
              </div>
            </div>
          )}

          {/* Filtros y Búsqueda */}
          <div className="auditoria-filtros">
            <div className="filtros-group">
              <label>Filtrar:</label>
              <select value={filtroDiferencias} onChange={(e) => setFiltroDiferencias(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="diferencias">Solo Diferencias</option>
                <option value="coincidencias">Solo Coincidencias</option>
              </select>
            </div>
            <div className="busqueda-group">
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="🔍 Buscar por código, nombre o lote..."
              />
            </div>
          </div>

          {/* Lista de Items */}
          <div className="auditoria-items">
            <h4>
              {puedeVerTodo ? "Productos Escaneados" : "Mis Productos Escaneados"} ({itemsFiltrados.length})
            </h4>
            {itemsFiltrados.length === 0 ? (
              <p className="sin-datos">No hay productos escaneados aún</p>
            ) : (
              <div className="items-table">
                <table>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Nombre</th>
                      <th>Lote</th>
                      <th>Sistema</th>
                      <th>Físico</th>
                      <th>No Aptas</th>
                      <th>Diferencia</th>
                      <th>Estado</th>
                      {puedeVerTodo && <th>Usuario</th>}
                      {auditoriaActual.estado === "en_proceso" && <th>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {itemsFiltrados.map(item => (
                      <tr key={item.id} className={item.diferencia !== 0 ? "con-diferencia" : ""}>
                        <td>{item.codigo}</td>
                        <td>{item.nombre}</td>
                        <td>{item.lote || "-"}</td>
                        <td>{item.cantidad_sistema}</td>
                        <td>{item.cantidad_fisica}</td>
                        <td style={{ color: item.piezas_no_aptas > 0 ? "#ef4444" : "var(--texto-secundario)", fontWeight: item.piezas_no_aptas > 0 ? 600 : 400 }}>
                          {item.piezas_no_aptas || 0}
                        </td>
                        <td className={item.diferencia > 0 ? "sobrante" : item.diferencia < 0 ? "faltante" : "coincide"}>
                          {item.diferencia > 0 ? "+" : ""}{item.diferencia}
                        </td>
                        <td>
                          <span className={`badge-${item.tipo_diferencia}`}>
                            {item.tipo_diferencia === "sobrante" ? "📈 Sobrante" :
                             item.tipo_diferencia === "faltante" ? "📉 Faltante" :
                             "✅ Coincide"}
                          </span>
                        </td>
                        {puedeVerTodo && (
                          <td style={{ fontSize: "0.85rem", color: "var(--texto-secundario)" }}>
                            {item.usuario || "-"}
                          </td>
                        )}
                        {auditoriaActual.estado === "en_proceso" && (
                          <td>
                            <button 
                              className="btn-danger btn-sm"
                              onClick={() => eliminarItem(item.id)}
                            >
                              Eliminar
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

