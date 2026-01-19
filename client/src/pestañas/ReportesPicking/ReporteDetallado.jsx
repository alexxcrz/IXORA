import React, { useState, useEffect } from "react";
import { authFetch } from "../../AuthContext";
import { useAlert } from "../../components/AlertModal";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import jsPDF from "jspdf";
import { applyPlugin } from "jspdf-autotable";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType } from "docx";
import ExcelJS from "exceljs";
import "./ReporteDetallado.css";

applyPlugin(jsPDF);

export default function ReporteDetallado({ tipo, mes, SERVER_URL, onClose }) {
  const { showAlert } = useAlert();
  const [loading, setLoading] = useState(true);
  const [datos, setDatos] = useState(null);
  const [tabActiva, setTabActiva] = useState("todo");
  const [descargando, setDescargando] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, [tipo, mes]);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      let endpoint = "";
      if (tipo === "q1") endpoint = `/reportes/detallado-q1/${mes}`;
      else if (tipo === "q2") endpoint = `/reportes/detallado-q2/${mes}`;
      else if (tipo === "mes") endpoint = `/reportes/detallado-mes/${mes}`;
      
      const data = await authFetch(`${SERVER_URL}${endpoint}`);
      setDatos(data);
    } catch (err) {
      console.error("Error cargando reporte detallado:", err);
      showAlert("Error al cargar el reporte detallado", "error");
    } finally {
      setLoading(false);
    }
  };

  const getDatosActuales = () => {
    if (!datos) return null;
    if (tabActiva === "todo") return datos.todo;
    if (tabActiva === "importacion") return datos.importacion;
    if (tabActiva === "devoluciones") return datos.devoluciones;
    return null;
  };

  const descargarPDF = async () => {
    const datosActuales = getDatosActuales();
    if (!datosActuales) {
      showAlert("No hay datos para descargar", "warning");
      return;
    }

    setDescargando(true);
    try {
      const doc = new jsPDF();
      
      if (typeof doc.autoTable !== 'function') {
        console.error("autoTable no está disponible en jsPDF");
        throw new Error("Error: jspdf-autotable no se cargó correctamente. Por favor, recarga la página.");
      }
      let yPos = 20;
      const pageHeight = doc.internal.pageSize.height;
      const margin = 14;

      doc.setFontSize(18);
      doc.setFont(undefined, "bold");
      doc.text(`Reporte Detallado - ${datos.periodo}`, margin, yPos);
      yPos += 10;
      doc.setFontSize(12);
      doc.setFont(undefined, "normal");
      const tipoTexto = tabActiva === "todo" ? "Picking" : tabActiva === "importacion" ? "Importación" : "Devoluciones";
      doc.text(`Tipo: ${tipoTexto}`, margin, yPos);
      yPos += 15;

      doc.setFontSize(14);
      doc.text("1. Totales Generales", 14, yPos);
      yPos += 8;
      doc.setFontSize(10);
      if (tabActiva === "devoluciones") {
        doc.text(`Total de piezas devueltas: ${datosActuales.totales.piezas}`, 20, yPos);
        yPos += 6;
      } else {
        doc.text(`Total de registros procesados: ${datosActuales.totales.registros}`, 20, yPos);
        yPos += 6;
        doc.text(`Total de cajas surtidas: ${datosActuales.totales.cajas}`, 20, yPos);
        yPos += 6;
        doc.text(`Total de piezas surtidas: ${datosActuales.totales.piezas}`, 20, yPos);
        yPos += 6;
      }
      yPos += 4;

      doc.setFontSize(14);
      if (tabActiva === "devoluciones") {
        doc.text("2. Tiempo de Dilación en Importar a Picking", 14, yPos);
      } else {
        doc.text("2. Métrica Real de Tiempos de Surtido", 14, yPos);
      }
      yPos += 8;
      doc.setFontSize(10);
      doc.text(`Tiempo promedio: ${datosActuales.metricasTiempos.promedio.toFixed(2)} minutos`, 20, yPos);
      yPos += 6;
      doc.text(`Tiempo mínimo: ${datosActuales.metricasTiempos.minimo.toFixed(2)} minutos`, 20, yPos);
      yPos += 6;
      doc.text(`Tiempo máximo: ${datosActuales.metricasTiempos.maximo.toFixed(2)} minutos`, 20, yPos);
      yPos += 6;
      if (tabActiva === "devoluciones") {
        doc.text("Este tiempo representa la diferencia entre cuando se agregó la devolución (hora_solicitud) y cuando se importó a picking (hora_surtido).", 20, yPos);
        yPos += 6;
      }
      yPos += 4;

      if (datosActuales.topProductos.length > 0) {
        doc.setFontSize(14);
        if (tabActiva === "devoluciones") {
          doc.text("3. Productos Más Devueltos (por Piezas)", 14, yPos);
        } else {
          doc.text("3. Top 10 Productos Más Surtidos (por Piezas)", 14, yPos);
        }
        yPos += 8;
        
        const topData = tabActiva === "devoluciones"
          ? datosActuales.topProductos.map((p, idx) => [
              idx + 1,
              p.codigo,
              p.nombre.substring(0, 40),
              p.piezas_totales,
              p.veces_surtido
            ])
          : datosActuales.topProductos.map((p, idx) => [
              idx + 1,
              p.codigo,
              p.nombre.substring(0, 40),
              p.piezas_totales,
              p.cajas_totales,
              p.veces_surtido,
              p.lotes_distintos
            ]);

        doc.autoTable({
          startY: yPos,
          head: tabActiva === "devoluciones"
            ? [["#", "Código", "Producto", "Piezas", "Veces devuelto"]]
            : [["#", "Código", "Producto", "Piezas", "Cajas", "Veces", "Lotes"]],
          body: topData,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [66, 139, 202] }
        });
        yPos = doc.lastAutoTable.finalY + 10;
      }

      if (tabActiva !== "devoluciones" && datosActuales.productosAgotados.length > 0) {
        doc.setFontSize(14);
        doc.text("4. Productos con Mayor Frecuencia de Agotamiento", 14, yPos);
        yPos += 8;
        
        const agotadosData = datosActuales.productosAgotados.map(p => [
          p.codigo,
          p.nombre.substring(0, 50),
          p.veces_agotado
        ]);

        doc.autoTable({
          startY: yPos,
          head: [["Código", "Producto", "Veces agotado"]],
          body: agotadosData,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [220, 53, 69] }
        });
        yPos = doc.lastAutoTable.finalY + 10;
      }

      if (tabActiva !== "devoluciones" && datosActuales.productosNoSurtidos.length > 0) {
        doc.setFontSize(14);
        doc.text("5. Productos No Surtidos", 14, yPos);
        yPos += 8;
        
        const noSurtidosData = datosActuales.productosNoSurtidos.map(p => [
          p.codigo,
          p.nombre.substring(0, 50),
          p.ocasiones_no_surtido
        ]);

        doc.autoTable({
          startY: yPos,
          head: [["Código", "Producto", "Ocasiones no surtido"]],
          body: noSurtidosData,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [255, 193, 7] }
        });
        yPos = doc.lastAutoTable.finalY + 10;
      }

      if (tabActiva !== "devoluciones" && datosActuales.cambiosLote.length > 0) {
        if (yPos > pageHeight - 40) {
          doc.addPage();
          yPos = 20;
        }
        doc.setFontSize(14);
        doc.setFont(undefined, "bold");
        doc.text("6. Productos con Mayor Cantidad de Cambios de Lote", margin, yPos);
        yPos += 8;
        
        const lotesData = datosActuales.cambiosLote.map(p => [
          p.codigo,
          p.nombre.substring(0, 50),
          p.lotes_distintos
        ]);

        doc.autoTable({
          startY: yPos,
          head: [["Código", "Producto", "Lotes distintos"]],
          body: lotesData,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [40, 167, 69] },
          margin: { left: margin }
        });
        yPos = doc.lastAutoTable.finalY + 10;
      }

      if (datosActuales.listaConsolidada.length > 0) {
        if (yPos > pageHeight - 40) {
          doc.addPage();
          yPos = 20;
        }
        doc.setFontSize(14);
        doc.setFont(undefined, "bold");
        if (tabActiva === "devoluciones") {
          doc.text("4. Lista Consolidada de Productos Devueltos (Resumen)", margin, yPos);
        } else {
          doc.text("7. Lista Consolidada de Productos (Resumen)", margin, yPos);
        }
        yPos += 8;
        doc.setFontSize(10);
        doc.setFont(undefined, "normal");
        if (tabActiva === "devoluciones") {
          doc.text("A continuación se presenta el consolidado de todos los productos devueltos, ordenados de mayor a menor volumen de piezas. Solo se muestran piezas totales.", margin, yPos);
        } else {
          doc.text("A continuación se presenta el consolidado de todos los productos, ordenados de mayor a menor volumen.", margin, yPos);
        }
        yPos += 10;
        
        const listaLimitada = datosActuales.listaConsolidada.slice(0, 50);
        const listaData = tabActiva === "devoluciones"
          ? listaLimitada.map(p => [
              p.codigo,
              p.nombre.substring(0, 40),
              p.piezas.toLocaleString(),
              p.veces_surtido
            ])
          : listaLimitada.map(p => [
              p.codigo,
              p.nombre.substring(0, 40),
              p.piezas.toLocaleString(),
              p.cajas,
              p.veces_surtido,
              p.lotes_distintos
            ]);

        doc.autoTable({
          startY: yPos,
          head: tabActiva === "devoluciones"
            ? [["Código", "Producto", "Piezas", "Veces Devuelto"]]
            : [["Código", "Producto", "Piezas", "Cajas", "Veces", "Lotes"]],
          body: listaData,
          styles: { fontSize: 7 },
          headStyles: { fillColor: [59, 130, 246] },
          margin: { left: margin }
        });
        yPos = doc.lastAutoTable.finalY + 10;
        
        if (datosActuales.listaConsolidada.length > 50) {
          doc.setFontSize(10);
          doc.text(`(Mostrando primeros 50 de ${datosActuales.listaConsolidada.length} productos)`, margin, yPos);
          yPos += 8;
        }
      }

      if (tabActiva !== "devoluciones") {
        yPos += 10;
        if (yPos > pageHeight - 80) {
          doc.addPage();
          yPos = 20;
        }
        doc.setFontSize(14);
        doc.setFont(undefined, "bold");
        doc.text("8. Conclusiones Operativas", margin, yPos);
        yPos += 15;
        doc.setFontSize(10);
        doc.setFont(undefined, "normal");
        
        const top3 = datosActuales.topProductos.slice(0, 3).map(p => p.nombre).join(", ");
        const conclusiones = [
          `Los productos con mayor volumen de piezas (${top3}) concentran la mayor parte de la carga operativa del almacén.`,
          `Existen productos con alta frecuencia de agotamiento y no surtido, lo que sugiere revisar políticas de reabasto, puntos de pedido y exactitud del inventario.`,
          `Los cambios frecuentes de lote en ciertos productos incrementan el tiempo y la complejidad del picking; puede ser conveniente consolidar ubicaciones o mejorar la señalización y mapeo dentro del almacén.`,
          `La métrica de tiempos muestra un promedio de ${datosActuales.metricasTiempos.promedio.toFixed(2)} minutos, pero con algunos casos extremos que valdría la pena analizar puntualmente (órdenes atípicas, productos de difícil acceso, errores, etc.).`
        ];

        conclusiones.forEach((texto, idx) => {
          if (yPos > pageHeight - 20) {
            doc.addPage();
            yPos = 20;
          }
          const lines = doc.splitTextToSize(texto, doc.internal.pageSize.width - (margin * 2));
          lines.forEach((line) => {
            if (yPos > pageHeight - 15) {
              doc.addPage();
              yPos = 20;
            }
            doc.text(line, margin, yPos);
            yPos += 6;
          });
          yPos += 4;
        });
      }

      doc.save(`Reporte_${datos.periodo}_${tabActiva}.pdf`);
    } catch (err) {
      console.error("Error generando PDF:", err);
      showAlert("Error al generar PDF", "error");
    } finally {
      setDescargando(false);
    }
  };

  const descargarExcel = async () => {
    const datosActuales = getDatosActuales();
    if (!datosActuales) return;

    setDescargando(true);
    try {
      const workbook = new ExcelJS.Workbook();
      
      const sheet1 = workbook.addWorksheet("Resumen");
      const tipoTexto = tabActiva === "todo" ? "Picking" : tabActiva === "importacion" ? "Importación" : "Devoluciones";
      
      sheet1.addRow(["Reporte Detallado", datos.periodo]);
      sheet1.getRow(1).font = { bold: true, size: 14 };
      sheet1.addRow(["Tipo", tipoTexto]);
      sheet1.addRow([]);
      sheet1.addRow(["1. Totales Generales"]);
      sheet1.getRow(4).font = { bold: true };
      if (tabActiva === "devoluciones") {
        sheet1.addRow(["Total de piezas devueltas", datosActuales.totales.piezas]);
      } else {
        sheet1.addRow(["Total de registros procesados", datosActuales.totales.registros]);
        sheet1.addRow(["Total de cajas surtidas", datosActuales.totales.cajas]);
        sheet1.addRow(["Total de piezas surtidas", datosActuales.totales.piezas]);
      }
      sheet1.addRow([]);
      if (tabActiva === "devoluciones") {
        sheet1.addRow(["2. Tiempo de Dilación en Importar a Picking"]);
      } else {
        sheet1.addRow(["2. Métricas de Tiempos de Surtido"]);
      }
      sheet1.getRow(tabActiva === "devoluciones" ? 6 : 9).font = { bold: true };
      sheet1.addRow(["Tiempo promedio (minutos)", datosActuales.metricasTiempos.promedio.toFixed(2)]);
      sheet1.addRow(["Tiempo mínimo (minutos)", datosActuales.metricasTiempos.minimo.toFixed(2)]);
      sheet1.addRow(["Tiempo máximo (minutos)", datosActuales.metricasTiempos.maximo.toFixed(2)]);
      sheet1.addRow([]);
      sheet1.addRow(["Nota sobre tiempos extremos:", "Los tiempos extremos (máximos) se presentaron principalmente porque, aunque ya se trabajaba con PINA (app), no se llevaba un control adecuado ni estandarizado. Esto provocaba registros abiertos por productos agotados, no surtidos en rack o pendientes por cambio de lote. Con la creación formal del proceso operativo dentro de PINA y la correcta implementación del control diario, estos comportamientos han mejorado significativamente."]);
      sheet1.getRow(13).height = 60;
        sheet1.getCell("B13").alignment = { wrapText: true };

      if (datosActuales.topProductos.length > 0) {
        const sheet2 = workbook.addWorksheet(tabActiva === "devoluciones" ? "Productos Más Devueltos" : "Top 10 Productos");
        if (tabActiva === "devoluciones") {
          sheet2.addRow(["3. Productos Más Devueltos (por Piezas)"]);
        } else {
          sheet2.addRow(["3. Top 10 Productos Más Surtidos (por Piezas)"]);
        }
        sheet2.getRow(1).font = { bold: true, size: 12 };
        sheet2.addRow([]);
        const headerRow = tabActiva === "devoluciones"
          ? sheet2.addRow(["#", "Código", "Producto", "Piezas totales", "Veces devuelto"])
          : sheet2.addRow(["#", "Código", "Producto", "Piezas totales", "Cajas totales", "Veces surtido", "Lotes distintos"]);
        headerRow.font = { bold: true };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4285F4' }
        };
        headerRow.alignment = { horizontal: 'center' };
        datosActuales.topProductos.forEach((p, idx) => {
          const row = tabActiva === "devoluciones"
            ? sheet2.addRow([idx + 1, p.codigo, p.nombre, p.piezas_totales, p.veces_surtido])
            : sheet2.addRow([idx + 1, p.codigo, p.nombre, p.piezas_totales, p.cajas_totales, p.veces_surtido, p.lotes_distintos]);
          if (idx % 2 === 0) {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF8F9FA' }
            };
          }
        });
        sheet2.columns.forEach(column => {
          column.width = 20;
        });
        sheet2.getColumn(3).width = 50;
      }

      if (tabActiva !== "devoluciones" && datosActuales.productosAgotados.length > 0) {
        const sheet3 = workbook.addWorksheet("Productos Agotados");
        sheet3.addRow(["4. Productos con Mayor Frecuencia de Agotamiento (Disponible = 0)"]);
        sheet3.getRow(1).font = { bold: true, size: 12 };
        sheet3.addRow([]);
        const headerRow3 = sheet3.addRow(["Código", "Producto", "Veces agotado"]);
        headerRow3.font = { bold: true };
        headerRow3.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFDC3545' }
        };
        datosActuales.productosAgotados.forEach((p, idx) => {
          const row = sheet3.addRow([p.codigo, p.nombre, p.veces_agotado]);
          if (idx % 2 === 0) {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF8F9FA' }
            };
          }
        });
        sheet3.columns.forEach(column => {
          column.width = 30;
        });
        sheet3.getColumn(2).width = 60;
      }

      if (tabActiva !== "devoluciones" && datosActuales.productosNoSurtidos.length > 0) {
        const sheet4 = workbook.addWorksheet("Productos No Surtidos");
        sheet4.addRow(["5. Productos No Surtidos (Surtido = 0)"]);
        sheet4.getRow(1).font = { bold: true, size: 12 };
        sheet4.addRow([]);
        const headerRow4 = sheet4.addRow(["Código", "Producto", "Ocasiones no surtido"]);
        headerRow4.font = { bold: true };
        headerRow4.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFC107' }
        };
        datosActuales.productosNoSurtidos.forEach((p, idx) => {
          const row = sheet4.addRow([p.codigo, p.nombre, p.ocasiones_no_surtido]);
          if (idx % 2 === 0) {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF8F9FA' }
            };
          }
        });
        sheet4.columns.forEach(column => {
          column.width = 30;
        });
        sheet4.getColumn(2).width = 60;
      }

      if (tabActiva !== "devoluciones" && datosActuales.cambiosLote.length > 0) {
        const sheet5 = workbook.addWorksheet("Cambios de Lote");
        sheet5.addRow(["6. Productos con Mayor Cantidad de Cambios de Lote"]);
        sheet5.getRow(1).font = { bold: true, size: 12 };
        sheet5.addRow([]);
        const headerRow5 = sheet5.addRow(["Código", "Producto", "Lotes distintos en el " + datos.periodo]);
        headerRow5.font = { bold: true };
        headerRow5.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF28A745' }
        };
        datosActuales.cambiosLote.forEach((p, idx) => {
          const row = sheet5.addRow([p.codigo, p.nombre, p.lotes_distintos]);
          if (idx % 2 === 0) {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF8F9FA' }
            };
          }
        });
        sheet5.columns.forEach(column => {
          column.width = 30;
        });
        sheet5.getColumn(2).width = 60;
      }

      if (datosActuales.listaConsolidada.length > 0) {
        const sheet6 = workbook.addWorksheet("Lista Consolidada");
        if (tabActiva === "devoluciones") {
          sheet6.addRow(["4. Lista Consolidada de Productos Devueltos (Resumen " + datos.periodo + ")"]);
          sheet6.addRow(["A continuación se presenta el consolidado de todos los productos devueltos del " + datos.periodo + ", ordenados de mayor a menor volumen de piezas. Solo se muestran piezas totales."]);
        } else {
          sheet6.addRow(["7. Lista Consolidada de Productos (Resumen " + datos.periodo + ")"]);
          sheet6.addRow(["A continuación se presenta el consolidado de todos los productos del " + datos.periodo + ", ordenados de mayor a menor volumen de piezas surtidas."]);
        }
        sheet6.getRow(1).font = { bold: true, size: 12 };
        sheet6.getRow(2).font = { italic: true };
        sheet6.addRow([]);
        const headerRow6 = tabActiva === "devoluciones"
          ? sheet6.addRow(["Código", "Producto", "Piezas", "Veces Devuelto"])
          : sheet6.addRow(["Código", "Producto", "Piezas", "Cajas", "Veces Surtido", "Lotes"]);
        headerRow6.font = { bold: true };
        headerRow6.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4285F4' }
        };
        datosActuales.listaConsolidada.forEach((p, idx) => {
          const row = tabActiva === "devoluciones"
            ? sheet6.addRow([p.codigo, p.nombre, p.piezas, p.veces_surtido])
            : sheet6.addRow([p.codigo, p.nombre, p.piezas, p.cajas, p.veces_surtido, p.lotes_distintos]);
          if (idx % 2 === 0) {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF8F9FA' }
            };
          }
        });
        sheet6.columns.forEach(column => {
          column.width = 20;
        });
        sheet6.getColumn(2).width = 50;
      }

      if (tabActiva !== "devoluciones") {
        const sheet7 = workbook.addWorksheet("Conclusiones");
        sheet7.addRow(["8. Conclusiones Operativas"]);
        sheet7.getRow(1).font = { bold: true, size: 14 };
        sheet7.addRow([]);
        
        const top3 = datosActuales.topProductos.slice(0, 3).map(p => p.nombre).join(", ");
        const conclusiones = [
          `Los productos con mayor volumen de piezas (${top3}) concentran la mayor parte de la carga operativa del almacén.`,
          `Existen productos con alta frecuencia de agotamiento y no surtido, lo que sugiere revisar políticas de reabasto, puntos de pedido y exactitud del inventario.`,
          `Los cambios frecuentes de lote en ciertos productos incrementan el tiempo y la complejidad del picking; puede ser conveniente consolidar ubicaciones o mejorar la señalización y mapeo dentro del almacén.`,
          `La métrica de tiempos muestra un promedio de ${datosActuales.metricasTiempos.promedio.toFixed(2)} minutos, pero con algunos casos extremos que valdría la pena analizar puntualmente (órdenes atípicas, productos de difícil acceso, errores, etc.).`
        ];

        conclusiones.forEach((texto, idx) => {
          const row = sheet7.addRow([texto]);
          row.height = 30;
          sheet7.getCell(`A${idx + 3}`).alignment = { wrapText: true, vertical: 'top' };
        });
        sheet7.getColumn(1).width = 100;
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const nombreArchivo = `Reporte_${datos.periodo}_${tabActiva}.xlsx`.replace(/[^a-zA-Z0-9._-]/g, '_');
      link.download = nombreArchivo;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error generando Excel:", err);
      console.error("Stack:", err.stack);
      showAlert(`Error al generar Excel: ${err.message || "Error desconocido"}`, "error");
    } finally {
      setDescargando(false);
    }
  };

  const descargarWord = async () => {
    const datosActuales = getDatosActuales();
    if (!datosActuales) return;

    setDescargando(true);
    try {
      const children = [];

      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Reporte Detallado - ${datos.periodo}`,
              bold: true,
              size: 32
            })
          ]
        })
      );

      const tipoTexto = tabActiva === "todo" ? "Picking" : tabActiva === "importacion" ? "Importación" : "Devoluciones";
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Tipo: ${tipoTexto}`,
              size: 24
            })
          ]
        })
      );

      children.push(
        new Paragraph({
          children: [new TextRun({ text: "1. Totales Generales", bold: true, size: 28 })]
        })
      );
      if (tabActiva === "devoluciones") {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `Total de piezas devueltas: ${datosActuales.totales.piezas}`, size: 22 })]
          })
        );
      } else {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `Total de registros procesados: ${datosActuales.totales.registros}`, size: 22 })]
          })
        );
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `Total de cajas surtidas: ${datosActuales.totales.cajas}`, size: 22 })]
          })
        );
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `Total de piezas surtidas: ${datosActuales.totales.piezas}`, size: 22 })]
          })
        );
      }

      children.push(
        new Paragraph({
          children: [new TextRun({ 
            text: tabActiva === "devoluciones" 
              ? "2. Tiempo de Dilación en Importar a Picking" 
              : "2. Métrica Real de Tiempos de Surtido", 
            bold: true, 
            size: 28 
          })]
        })
      );
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `Tiempo promedio: ${datosActuales.metricasTiempos.promedio.toFixed(2)} minutos`, size: 22 })]
        })
      );
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `Tiempo mínimo: ${datosActuales.metricasTiempos.minimo.toFixed(2)} minutos`, size: 22 })]
        })
      );
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `Tiempo máximo: ${datosActuales.metricasTiempos.maximo.toFixed(2)} minutos`, size: 22 })]
        })
      );

      if (datosActuales.topProductos.length > 0) {
        children.push(
          new Paragraph({
            children: [new TextRun({ 
              text: tabActiva === "devoluciones" 
                ? "3. Productos Más Devueltos (por Piezas)" 
                : "3. Top 10 Productos Más Surtidos", 
              bold: true, 
              size: 28 
            })]
          })
        );

        const topRows = tabActiva === "devoluciones"
          ? datosActuales.topProductos.map((p, idx) => 
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph(`${idx + 1}`)] }),
                  new TableCell({ children: [new Paragraph(p.codigo)] }),
                  new TableCell({ children: [new Paragraph(p.nombre)] }),
                  new TableCell({ children: [new Paragraph(p.piezas_totales.toString())] }),
                  new TableCell({ children: [new Paragraph(p.veces_surtido.toString())] })
                ]
              })
            )
          : datosActuales.topProductos.map((p, idx) => 
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph(`${idx + 1}`)] }),
                  new TableCell({ children: [new Paragraph(p.codigo)] }),
                  new TableCell({ children: [new Paragraph(p.nombre)] }),
                  new TableCell({ children: [new Paragraph(p.piezas_totales.toString())] }),
                  new TableCell({ children: [new Paragraph(p.cajas_totales.toString())] }),
                  new TableCell({ children: [new Paragraph(p.veces_surtido.toString())] }),
                  new TableCell({ children: [new Paragraph(p.lotes_distintos.toString())] })
                ]
              })
            );

        children.push(
          new Table({
            rows: [
              new TableRow({
                children: tabActiva === "devoluciones"
                  ? [
                      new TableCell({ children: [new Paragraph("#")] }),
                      new TableCell({ children: [new Paragraph("Código")] }),
                      new TableCell({ children: [new Paragraph("Producto")] }),
                      new TableCell({ children: [new Paragraph("Piezas")] }),
                      new TableCell({ children: [new Paragraph("Veces devuelto")] })
                    ]
                  : [
                      new TableCell({ children: [new Paragraph("#")] }),
                      new TableCell({ children: [new Paragraph("Código")] }),
                      new TableCell({ children: [new Paragraph("Producto")] }),
                      new TableCell({ children: [new Paragraph("Piezas")] }),
                      new TableCell({ children: [new Paragraph("Cajas")] }),
                      new TableCell({ children: [new Paragraph("Veces")] }),
                      new TableCell({ children: [new Paragraph("Lotes")] })
                    ]
              }),
              ...topRows
            ],
            width: { size: 100, type: WidthType.PERCENTAGE }
          })
        );
      }

      if (tabActiva !== "devoluciones" && datosActuales.productosAgotados.length > 0) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: "4. Productos con Mayor Frecuencia de Agotamiento (Disponible = 0)", bold: true, size: 28 })]
          })
        );

        const agotadosRows = datosActuales.productosAgotados.map(p => 
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(p.codigo)] }),
              new TableCell({ children: [new Paragraph(p.nombre)] }),
              new TableCell({ children: [new Paragraph(p.veces_agotado.toString())] })
            ]
          })
        );

        children.push(
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Código")] }),
                  new TableCell({ children: [new Paragraph("Producto")] }),
                  new TableCell({ children: [new Paragraph("Veces agotado")] })
                ]
              }),
              ...agotadosRows
            ],
            width: { size: 100, type: WidthType.PERCENTAGE }
          })
        );
      }

      if (tabActiva !== "devoluciones" && datosActuales.productosNoSurtidos.length > 0) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: "5. Productos No Surtidos (Surtido = 0)", bold: true, size: 28 })]
          })
        );

        const noSurtidosRows = datosActuales.productosNoSurtidos.map(p => 
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(p.codigo)] }),
              new TableCell({ children: [new Paragraph(p.nombre)] }),
              new TableCell({ children: [new Paragraph(p.ocasiones_no_surtido.toString())] })
            ]
          })
        );

        children.push(
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Código")] }),
                  new TableCell({ children: [new Paragraph("Producto")] }),
                  new TableCell({ children: [new Paragraph("Ocasiones no surtido")] })
                ]
              }),
              ...noSurtidosRows
            ],
            width: { size: 100, type: WidthType.PERCENTAGE }
          })
        );
      }

      if (tabActiva !== "devoluciones" && datosActuales.cambiosLote.length > 0) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: "6. Productos con Mayor Cantidad de Cambios de Lote", bold: true, size: 28 })]
          })
        );

        const lotesRows = datosActuales.cambiosLote.map(p => 
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(p.codigo)] }),
              new TableCell({ children: [new Paragraph(p.nombre)] }),
              new TableCell({ children: [new Paragraph(p.lotes_distintos.toString())] })
            ]
          })
        );

        children.push(
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Código")] }),
                  new TableCell({ children: [new Paragraph("Producto")] }),
                  new TableCell({ children: [new Paragraph("Lotes distintos en el " + datos.periodo)] })
                ]
              }),
              ...lotesRows
            ],
            width: { size: 100, type: WidthType.PERCENTAGE }
          })
        );
      }

      if (datosActuales.listaConsolidada.length > 0) {
        if (tabActiva === "devoluciones") {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: "4. Lista Consolidada de Productos Devueltos (Resumen " + datos.periodo + ")", bold: true, size: 28 })]
            })
          );
          children.push(
            new Paragraph({
              children: [new TextRun({ 
                text: "A continuación se presenta el consolidado de todos los productos devueltos del " + datos.periodo + ", ordenados de mayor a menor volumen de piezas. Solo se muestran piezas totales.",
                size: 22 
              })]
            })
          );
        } else {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: "7. Lista Consolidada de Productos (Resumen " + datos.periodo + ")", bold: true, size: 28 })]
            })
          );
          children.push(
            new Paragraph({
              children: [new TextRun({ 
                text: "A continuación se presenta el consolidado de todos los productos del " + datos.periodo + ", ordenados de mayor a menor volumen de piezas surtidas. Esto sirve como base para análisis más profundos, planeación de compras y ajustes de inventario.",
                size: 22 
              })]
          })
        );
      }

        const listaLimitada = datosActuales.listaConsolidada.slice(0, 100);
        const listaRows = tabActiva === "devoluciones"
          ? listaLimitada.map(p => 
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph(p.codigo)] }),
                  new TableCell({ children: [new Paragraph(p.nombre)] }),
                  new TableCell({ children: [new Paragraph(p.piezas.toLocaleString())] }),
                  new TableCell({ children: [new Paragraph(p.veces_surtido.toString())] })
                ]
              })
            )
          : listaLimitada.map(p => 
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph(p.codigo)] }),
                  new TableCell({ children: [new Paragraph(p.nombre)] }),
                  new TableCell({ children: [new Paragraph(p.piezas.toLocaleString())] }),
                  new TableCell({ children: [new Paragraph(p.cajas.toString())] }),
                  new TableCell({ children: [new Paragraph(p.veces_surtido.toString())] }),
                  new TableCell({ children: [new Paragraph(p.lotes_distintos.toString())] })
                ]
              })
            );

        children.push(
          new Table({
            rows: [
              new TableRow({
                children: tabActiva === "devoluciones"
                  ? [
                      new TableCell({ children: [new Paragraph("Código")] }),
                      new TableCell({ children: [new Paragraph("Producto")] }),
                      new TableCell({ children: [new Paragraph("Piezas")] }),
                      new TableCell({ children: [new Paragraph("Veces Devuelto")] })
                    ]
                  : [
                      new TableCell({ children: [new Paragraph("Código")] }),
                      new TableCell({ children: [new Paragraph("Producto")] }),
                      new TableCell({ children: [new Paragraph("Piezas")] }),
                      new TableCell({ children: [new Paragraph("Cajas")] }),
                      new TableCell({ children: [new Paragraph("Veces Surtido")] }),
                      new TableCell({ children: [new Paragraph("Lotes")] })
                    ]
              }),
              ...listaRows
            ],
            width: { size: 100, type: WidthType.PERCENTAGE }
          })
        );

        if (datosActuales.listaConsolidada.length > 100) {
          children.push(
            new Paragraph({
              children: [new TextRun({ 
                text: `(Mostrando primeros 100 de ${datosActuales.listaConsolidada.length} productos)`,
                size: 20,
                italics: true
              })]
            })
          );
        }
      }

      // 8. Conclusiones (solo si no es devoluciones)
      if (tabActiva !== "devoluciones") {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: "8. Conclusiones Operativas", bold: true, size: 28 })]
          })
        );

        const top3 = datosActuales.topProductos.slice(0, 3).map(p => p.nombre).join(", ");
        const conclusiones = [
          `Los productos con mayor volumen de piezas (${top3}) concentran la mayor parte de la carga operativa del almacén.`,
          `Existen productos con alta frecuencia de agotamiento y no surtido, lo que sugiere revisar políticas de reabasto, puntos de pedido y exactitud del inventario.`,
          `Los cambios frecuentes de lote en ciertos productos incrementan el tiempo y la complejidad del picking; puede ser conveniente consolidar ubicaciones o mejorar la señalización y mapeo dentro del almacén.`,
          `La métrica de tiempos muestra un promedio de ${datosActuales.metricasTiempos.promedio.toFixed(2)} minutos, pero con algunos casos extremos que valdría la pena analizar puntualmente (órdenes atípicas, productos de difícil acceso, errores, etc.).`
        ];

        conclusiones.forEach(texto => {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: texto, size: 22 })]
            })
          );
        });
      }


      const doc = new Document({
        sections: [{
          children
        }]
      });

      const blob = await Packer.toBlob(doc);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const nombreArchivo = `Reporte_${datos.periodo}_${tabActiva}.docx`.replace(/[^a-zA-Z0-9._-]/g, '_');
      link.download = nombreArchivo;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error generando Word:", err);
      console.error("Stack:", err.stack);
      showAlert(`Error al generar Word: ${err.message || "Error desconocido"}`, "error");
    } finally {
      setDescargando(false);
    }
  };

  if (loading) {
    return (
      <div className="reporte-detallado-container">
        <div className="reporte-loading">Cargando reporte detallado...</div>
      </div>
    );
  }

  if (!datos) {
    return (
      <div className="reporte-detallado-container">
        <div className="reporte-error">No se pudieron cargar los datos</div>
      </div>
    );
  }

  const datosActuales = getDatosActuales();

  return (
    <div className="reporte-detallado-container">
      <div className="reporte-header">
        <h1>Reporte Detallado - {datos.periodo}</h1>
        {onClose && (
          <button className="btn-cerrar" onClick={onClose}>
            ✕
          </button>
        )}
      </div>

      <div className="reporte-tabs">
        <button
          className={`reporte-tab ${tabActiva === "todo" ? "active" : ""}`}
          onClick={() => setTabActiva("todo")}
        >
          ✅ Picking
        </button>
        <button
          className={`reporte-tab ${tabActiva === "importacion" ? "active" : ""}`}
          onClick={() => setTabActiva("importacion")}
        >
          🌎 Importación
        </button>
        <button
          className={`reporte-tab ${tabActiva === "devoluciones" ? "active" : ""}`}
          onClick={() => setTabActiva("devoluciones")}
        >
          🔄 Devoluciones
        </button>
      </div>

      <div className="reporte-descargas">
        <button
          className="btn-descargar"
          onClick={descargarPDF}
          disabled={descargando}
        >
          {descargando ? "⏳" : "📄"} PDF
        </button>
        <button
          className="btn-descargar"
          onClick={descargarExcel}
          disabled={descargando}
        >
          {descargando ? "⏳" : "📊"} Excel
        </button>
        <button
          className="btn-descargar"
          onClick={descargarWord}
          disabled={descargando}
        >
          {descargando ? "⏳" : "📝"} Word
        </button>
      </div>

      {datosActuales && (
        <div className="reporte-content">
          {tabActiva === "devoluciones" ? (
            <>
              <section className="reporte-section">
                <h2>1. Totales Generales del {datos.periodo}</h2>
                <div className="metricas-grid">
                  <div className="metrica-card">
                    <div className="metrica-valor">{datosActuales.totales.piezas.toLocaleString()}</div>
                    <div className="metrica-label">Total de piezas devueltas</div>
                  </div>
                </div>
              </section>

              <section className="reporte-section">
                <h2>2. Tiempo de Dilación en Importar a Picking</h2>
                <div className="metricas-grid">
                  <div className="metrica-card">
                    <div className="metrica-valor">{datosActuales.metricasTiempos.promedio.toFixed(2)}</div>
                    <div className="metrica-label">Tiempo promedio (minutos)</div>
                  </div>
                  <div className="metrica-card">
                    <div className="metrica-valor">{datosActuales.metricasTiempos.minimo.toFixed(2)}</div>
                    <div className="metrica-label">Tiempo mínimo (minutos)</div>
                  </div>
                  <div className="metrica-card">
                    <div className="metrica-valor">{datosActuales.metricasTiempos.maximo.toFixed(2)}</div>
                    <div className="metrica-label">Tiempo máximo (minutos)</div>
                  </div>
                </div>
                <p className="nota-tiempos">
                  Este tiempo representa la diferencia entre cuando se agregó la devolución (hora_solicitud) 
                  y cuando se importó a picking (hora_surtido). Mide la eficiencia del proceso de importación de devoluciones.
                </p>
              </section>

              <section className="reporte-section">
                <h2>3. Productos Más Devueltos (por Piezas)</h2>
                {datosActuales.topProductos.length > 0 ? (
                  <>
                    <table className="reporte-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Código</th>
                          <th>Producto</th>
                          <th>Piezas totales</th>
                          <th>Veces devuelto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datosActuales.topProductos.map((p, idx) => (
                          <tr key={p.codigo}>
                            <td>{idx + 1}</td>
                            <td>{p.codigo}</td>
                            <td>{p.nombre}</td>
                            <td>{p.piezas_totales.toLocaleString()}</td>
                            <td>{p.veces_surtido}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={datosActuales.topProductos.slice(0, 10)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="codigo" angle={-45} textAnchor="end" height={100} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="piezas_totales" fill="#8884d8" name="Piezas" />
                      </BarChart>
                    </ResponsiveContainer>
                  </>
                ) : (
                  <p>No hay productos devueltos para mostrar</p>
                )}
              </section>

              <section className="reporte-section">
                <h2>4. Lista Consolidada de Productos Devueltos (Resumen {datos.periodo})</h2>
                <p className="nota-tabla">
                  A continuación se presenta el consolidado de todos los productos devueltos del {datos.periodo}, 
                  ordenados de mayor a menor volumen de piezas. Solo se muestran piezas totales.
                </p>
                {datosActuales.listaConsolidada.length > 0 ? (
                  <div className="lista-consolidada">
                    {datosActuales.listaConsolidada.map((p) => (
                      <div key={p.codigo} className="producto-item">
                        <strong>{p.codigo}</strong> - {p.nombre}
                        <br />
                        <span className="producto-metricas">
                          Piezas: {p.piezas.toLocaleString()} | Veces devuelto: {p.veces_surtido}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No hay productos devueltos para mostrar</p>
                )}
              </section>
            </>
          ) : (
            <>
              <section className="reporte-section">
                <h2>1. Totales Generales del {datos.periodo}</h2>
                <div className="metricas-grid">
                  <div className="metrica-card">
                    <div className="metrica-valor">{datosActuales.totales.registros}</div>
                    <div className="metrica-label">Total de registros procesados</div>
                  </div>
                  <div className="metrica-card">
                    <div className="metrica-valor">{datosActuales.totales.cajas}</div>
                    <div className="metrica-label">Total de cajas surtidas</div>
                  </div>
                  <div className="metrica-card">
                    <div className="metrica-valor">{datosActuales.totales.piezas.toLocaleString()}</div>
                    <div className="metrica-label">Total de piezas surtidas</div>
                  </div>
                </div>
              </section>

              <section className="reporte-section">
                <h2>2. Métrica Real de Tiempos de Surtido</h2>
                <div className="metricas-grid">
                  <div className="metrica-card">
                    <div className="metrica-valor">{datosActuales.metricasTiempos.promedio.toFixed(2)}</div>
                    <div className="metrica-label">Tiempo promedio (minutos)</div>
                  </div>
                  <div className="metrica-card">
                    <div className="metrica-valor">{datosActuales.metricasTiempos.minimo.toFixed(2)}</div>
                    <div className="metrica-label">Tiempo mínimo (minutos)</div>
                  </div>
                  <div className="metrica-card">
                    <div className="metrica-valor">{datosActuales.metricasTiempos.maximo.toFixed(2)}</div>
                    <div className="metrica-label">Tiempo máximo (minutos)</div>
                  </div>
                </div>
                <p className="nota-tiempos">
                  Los tiempos extremos (máximos) se presentaron principalmente porque, aunque ya se trabajaba con PINA (app), 
                  no se llevaba un control adecuado ni estandarizado. Esto provocaba registros abiertos por productos agotados, 
                  no surtidos en rack o pendientes por cambio de lote. Con la creación formal del proceso operativo dentro de PINA 
                  y la correcta implementación del control diario, estos comportamientos han mejorado significativamente.
                </p>
              </section>

              {datosActuales.graficasPorDia && datosActuales.graficasPorDia.length > 0 && (
                <section className="reporte-section">
                  <h2>Tiempo Promedio de Surtido por Día</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={datosActuales.graficasPorDia}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="fecha" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="tiempo_promedio" stroke="#8884d8" name="Tiempo Promedio (min)" />
                    </LineChart>
                  </ResponsiveContainer>
                </section>
              )}

              <section className="reporte-section">
                <h2>3. Top 10 Productos Más Surtidos (por Piezas)</h2>
                {datosActuales.topProductos.length > 0 ? (
                  <>
                    <table className="reporte-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Código</th>
                          <th>Producto</th>
                          <th>Piezas totales</th>
                          <th>Cajas totales</th>
                          <th>Veces surtido</th>
                          <th>Lotes distintos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datosActuales.topProductos.map((p, idx) => (
                          <tr key={p.codigo}>
                            <td>{idx + 1}</td>
                            <td>{p.codigo}</td>
                            <td>{p.nombre}</td>
                            <td>{p.piezas_totales.toLocaleString()}</td>
                            <td>{p.cajas_totales}</td>
                            <td>{p.veces_surtido}</td>
                            <td>{p.lotes_distintos}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="nota-tabla">
                      En esta tabla se muestran los productos que más piezas movieron durante el {datos.periodo}, 
                      junto con el número de veces que fueron surtidos y cuántos lotes diferentes se manejaron para cada uno. 
                      Esto permite identificar no solo el volumen, sino también la complejidad operativa asociada a cambios de lote.
                    </p>
                    
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={datosActuales.topProductos.slice(0, 10)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="codigo" angle={-45} textAnchor="end" height={100} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="piezas_totales" fill="#8884d8" name="Piezas" />
                      </BarChart>
                    </ResponsiveContainer>
                  </>
                ) : (
                  <p>No hay productos para mostrar</p>
                )}
              </section>

              <section className="reporte-section">
                <h2>4. Productos con Mayor Frecuencia de Agotamiento (Disponible = 0)</h2>
                {datosActuales.productosAgotados.length > 0 ? (
                  <>
                    <table className="reporte-table">
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Producto</th>
                          <th>Veces agotado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datosActuales.productosAgotados.map((p) => (
                          <tr key={p.codigo}>
                            <td>{p.codigo}</td>
                            <td>{p.nombre}</td>
                            <td>{p.veces_agotado}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="nota-tabla">
                      Estos productos representan riesgo de ruptura de stock. Una alta frecuencia de agotamiento indica 
                      que la demanda supera al reabasto o que existe desajuste entre el inventario físico y el registrado en sistema.
                    </p>
                  </>
                ) : (
                  <p>No hay productos agotados registrados</p>
                )}
              </section>

              <section className="reporte-section">
                <h2>5. Productos No Surtidos (Surtido = 0)</h2>
                {datosActuales.productosNoSurtidos.length > 0 ? (
                  <>
                    <table className="reporte-table">
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Producto</th>
                          <th>Ocasiones no surtido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datosActuales.productosNoSurtidos.map((p) => (
                          <tr key={p.codigo}>
                            <td>{p.codigo}</td>
                            <td>{p.nombre}</td>
                            <td>{p.ocasiones_no_surtido}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="nota-tabla">
                      Las líneas no surtidas pueden deberse a producto agotado, ubicaciones incorrectas, diferencias de inventario 
                      o errores en la solicitud. Analizar estos casos ayuda a reducir reprocesos y reclamos.
                    </p>
                  </>
                ) : (
                  <p>No hay productos no surtidos registrados</p>
                )}
              </section>

              <section className="reporte-section">
                <h2>6. Productos con Mayor Cantidad de Cambios de Lote</h2>
                {datosActuales.cambiosLote.length > 0 ? (
                  <>
                    <table className="reporte-table">
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Producto</th>
                          <th>Lotes distintos en el {datos.periodo}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datosActuales.cambiosLote.map((p) => (
                          <tr key={p.codigo}>
                            <td>{p.codigo}</td>
                            <td>{p.nombre}</td>
                            <td>{p.lotes_distintos}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="nota-tabla">
                      Un número alto de lotes distintos para un mismo producto incrementa la complejidad del picking, 
                      especialmente si los lotes se encuentran en diferentes ubicaciones físicas. Esto impacta el tiempo de surtido y el riesgo de errores.
                    </p>
                  </>
                ) : (
                  <p>No hay productos con cambios de lote registrados</p>
                )}
              </section>

              <section className="reporte-section">
                <h2>7. Lista Consolidada de Productos (Resumen {datos.periodo})</h2>
                <p className="nota-tabla">
                  A continuación se presenta el consolidado de todos los productos del {datos.periodo}, 
                  ordenados de mayor a menor volumen de piezas surtidas. Esto sirve como base para análisis más profundos, 
                  planeación de compras y ajustes de inventario.
                </p>
                {datosActuales.listaConsolidada.length > 0 ? (
                  <div className="lista-consolidada">
                    {datosActuales.listaConsolidada.map((p) => (
                      <div key={p.codigo} className="producto-item">
                        <strong>{p.codigo}</strong> - {p.nombre}
                        <br />
                        <span className="producto-metricas">
                          Piezas: {p.piezas.toLocaleString()} | Cajas: {p.cajas} | Veces surtido: {p.veces_surtido} | Lotes distintos: {p.lotes_distintos}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No hay productos para mostrar</p>
                )}
              </section>

              <section className="reporte-section">
                <h2>8. Conclusiones Operativas</h2>
                <div className="conclusiones">
                  <p>
                    Los productos con mayor volumen de piezas ({datosActuales.topProductos.slice(0, 3).map(p => p.nombre).join(", ")}) 
                    concentran la mayor parte de la carga operativa del almacén.
                  </p>
                  <p>
                    Existen productos con alta frecuencia de agotamiento y no surtido, lo que sugiere revisar políticas de reabasto, 
                    puntos de pedido y exactitud del inventario.
                  </p>
                  <p>
                    Los cambios frecuentes de lote en ciertos productos incrementan el tiempo y la complejidad del picking; 
                    puede ser conveniente consolidar ubicaciones o mejorar la señalización y mapeo dentro del almacén.
                  </p>
                  <p>
                    La métrica de tiempos muestra un promedio de {datosActuales.metricasTiempos.promedio.toFixed(2)} minutos, 
                    pero con algunos casos extremos que valdría la pena analizar puntualmente (órdenes atípicas, productos de difícil acceso, errores, etc.).
                  </p>
                </div>
              </section>

              {datosActuales.graficasPorDia && datosActuales.graficasPorDia.length > 0 && (
                <section className="reporte-section">
                  <h2>Cajas Surtidas por Día</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={datosActuales.graficasPorDia}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="fecha" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="cajas" fill="#82ca9d" name="Cajas" />
                    </BarChart>
                  </ResponsiveContainer>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

