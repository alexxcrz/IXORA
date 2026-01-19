import React, { useState, useEffect } from "react";
import { authFetch } from "../../AuthContext";
import { useAlert } from "../../components/AlertModal";
import jsPDF from "jspdf";
import { applyPlugin } from "jspdf-autotable";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType } from "docx";
import ExcelJS from "exceljs";
import "./ReporteDetalladoDevoluciones.css";

// Aplicar el plugin a jsPDF
applyPlugin(jsPDF);

export default function ReporteDetalladoDevoluciones({ tipo, periodo, SERVER_URL, onClose }) {
  const { showAlert } = useAlert();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [datos, setDatos] = useState(null);
  const [descargando, setDescargando] = useState(false);

  useEffect(() => {
    const cargarDatos = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await authFetch(`${SERVER_URL}/reportes-devoluciones/detallado/${tipo}/${periodo}`);
        setDatos(response);
      } catch (err) {
        console.error("Error cargando reporte:", err);
        setError("No se pudieron cargar los datos del reporte");
      } finally {
        setLoading(false);
      }
    };

    cargarDatos();
  }, [tipo, periodo, SERVER_URL]);

  const descargarPDF = async () => {
    if (!datos) return;

    setDescargando(true);
    try {
      const doc = new jsPDF();
      let yPos = 20;
      const pageHeight = doc.internal.pageSize.height;
      const margin = 14;

      // Título
      doc.setFontSize(18);
      doc.setFont(undefined, "bold");
      doc.text(`Reporte Detallado de Devoluciones - ${datos.periodo}`, margin, yPos);
      yPos += 15;

      // 1. Resumen General
      doc.setFontSize(14);
      doc.setFont(undefined, "bold");
      doc.text("1. Resumen General", margin, yPos);
      yPos += 8;
      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      doc.text(`Total de pedidos devueltos: ${datos.resumen.total_pedidos}`, 20, yPos);
      yPos += 6;
      doc.text(`Total de piezas devueltas: ${datos.resumen.total_piezas.toLocaleString()}`, 20, yPos);
      yPos += 6;
      doc.text(`Total de productos únicos: ${datos.resumen.total_productos}`, 20, yPos);
      yPos += 15;

      // 2. Pedidos por Tipo
      if (datos.pedidosPorTipo.length > 0) {
        doc.setFontSize(14);
        doc.setFont(undefined, "bold");
        doc.text("2. Pedidos Devueltos por Tipo", margin, yPos);
        yPos += 8;

        const tipoData = datos.pedidosPorTipo.map(t => [
          t.tipo,
          t.cantidad_pedidos,
          t.cantidad_piezas.toLocaleString()
        ]);

        doc.autoTable({
          startY: yPos,
          head: [["Tipo de Pedido", "Cantidad de Pedidos", "Piezas Devueltas"]],
          body: tipoData,
          styles: { fontSize: 10 },
          headStyles: { fillColor: [66, 139, 202] }
        });
        yPos = doc.lastAutoTable.finalY + 15;
      }

      // 3. Productos Más Devueltos
      if (datos.productosMasDevueltos.length > 0) {
        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = 20;
        }
        doc.setFontSize(14);
        doc.setFont(undefined, "bold");
        doc.text("3. Productos Más Devueltos (Top 20)", margin, yPos);
        yPos += 8;

        const productosData = datos.productosMasDevueltos.map((p, idx) => [
          idx + 1,
          p.codigo,
          p.nombre.substring(0, 40),
          p.cantidad_total.toLocaleString(),
          p.veces_devuelto
        ]);

        doc.autoTable({
          startY: yPos,
          head: [["#", "Código", "Producto", "Piezas Devueltas", "Veces Devuelto"]],
          body: productosData,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [220, 53, 69] }
        });
        yPos = doc.lastAutoTable.finalY + 15;
      }

      // 4. Motivos de Devolución
      if (datos.motivosDevolucion.length > 0) {
        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = 20;
        }
        doc.setFontSize(14);
        doc.setFont(undefined, "bold");
        doc.text("4. Motivos de Devolución", margin, yPos);
        yPos += 8;

        const motivosData = datos.motivosDevolucion.map(m => [
          m.motivo.substring(0, 60),
          m.cantidad_pedidos,
          m.cantidad_piezas.toLocaleString()
        ]);

        doc.autoTable({
          startY: yPos,
          head: [["Motivo", "Pedidos", "Piezas"]],
          body: motivosData,
          styles: { fontSize: 9 },
          headStyles: { fillColor: [255, 193, 7] }
        });
        yPos = doc.lastAutoTable.finalY + 15;
      }

      // 5. Resumen por Área
      if (datos.resumenPorArea.length > 0) {
        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = 20;
        }
        doc.setFontSize(14);
        doc.setFont(undefined, "bold");
        doc.text("5. Resumen por Área", margin, yPos);
        yPos += 8;

        const areaData = datos.resumenPorArea.map(a => [
          a.area,
          a.cantidad_pedidos,
          a.cantidad_piezas.toLocaleString()
        ]);

        doc.autoTable({
          startY: yPos,
          head: [["Área", "Pedidos", "Piezas"]],
          body: areaData,
          styles: { fontSize: 10 },
          headStyles: { fillColor: [40, 167, 69] }
        });
      }

      const nombreArchivo = `Reporte_Devoluciones_${datos.periodo.replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`;
      doc.save(nombreArchivo);
    } catch (err) {
      console.error("Error generando PDF:", err);
      showAlert(`Error al generar PDF: ${err.message || "Error desconocido"}`, "error");
    } finally {
      setDescargando(false);
    }
  };

  const descargarExcel = async () => {
    if (!datos) return;

    setDescargando(true);
    try {
      const workbook = new ExcelJS.Workbook();

      // Hoja 1: Resumen
      const sheet1 = workbook.addWorksheet("Resumen");
      sheet1.addRow(["Reporte Detallado de Devoluciones", datos.periodo]);
      sheet1.addRow([]);
      sheet1.addRow(["Resumen General"]);
      sheet1.addRow(["Total Pedidos", datos.resumen.total_pedidos]);
      sheet1.addRow(["Total Piezas", datos.resumen.total_piezas]);
      sheet1.addRow(["Total Productos", datos.resumen.total_productos]);

      // Hoja 2: Pedidos por Tipo
      if (datos.pedidosPorTipo.length > 0) {
        const sheet2 = workbook.addWorksheet("Pedidos por Tipo");
        sheet2.addRow(["Tipo de Pedido", "Cantidad de Pedidos", "Piezas Devueltas"]);
        datos.pedidosPorTipo.forEach(t => {
          sheet2.addRow([t.tipo, t.cantidad_pedidos, t.cantidad_piezas]);
        });
      }

      // Hoja 3: Productos Más Devueltos
      if (datos.productosMasDevueltos.length > 0) {
        const sheet3 = workbook.addWorksheet("Productos Más Devueltos");
        sheet3.addRow(["#", "Código", "Producto", "Piezas Devueltas", "Veces Devuelto"]);
        datos.productosMasDevueltos.forEach((p, idx) => {
          sheet3.addRow([idx + 1, p.codigo, p.nombre, p.cantidad_total, p.veces_devuelto]);
        });
      }

      // Hoja 4: Motivos
      if (datos.motivosDevolucion.length > 0) {
        const sheet4 = workbook.addWorksheet("Motivos de Devolución");
        sheet4.addRow(["Motivo", "Pedidos", "Piezas"]);
        datos.motivosDevolucion.forEach(m => {
          sheet4.addRow([m.motivo, m.cantidad_pedidos, m.cantidad_piezas]);
        });
      }

      // Hoja 5: Resumen por Área
      if (datos.resumenPorArea.length > 0) {
        const sheet5 = workbook.addWorksheet("Resumen por Área");
        sheet5.addRow(["Área", "Pedidos", "Piezas"]);
        datos.resumenPorArea.forEach(a => {
          sheet5.addRow([a.area, a.cantidad_pedidos, a.cantidad_piezas]);
        });
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const nombreArchivo = `Reporte_Devoluciones_${datos.periodo.replace(/[^a-zA-Z0-9._-]/g, '_')}.xlsx`;
      link.download = nombreArchivo;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error generando Excel:", err);
      showAlert(`Error al generar Excel: ${err.message || "Error desconocido"}`, "error");
    } finally {
      setDescargando(false);
    }
  };

  const descargarWord = async () => {
    if (!datos) return;

    setDescargando(true);
    try {
      const children = [];

      // Título
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Reporte Detallado de Devoluciones - ${datos.periodo}`,
              bold: true,
              size: 32
            })
          ],
          alignment: 1 // CENTER
        })
      );
      children.push(new Paragraph({ children: [new TextRun({ text: "" })] }));

      // 1. Resumen General
      children.push(
        new Paragraph({
          children: [new TextRun({ text: "1. Resumen General", bold: true, size: 28 })]
        })
      );
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `Total de pedidos devueltos: ${datos.resumen.total_pedidos}`, size: 22 })]
        })
      );
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `Total de piezas devueltas: ${datos.resumen.total_piezas.toLocaleString()}`, size: 22 })]
        })
      );
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `Total de productos únicos: ${datos.resumen.total_productos}`, size: 22 })]
        })
      );
      children.push(new Paragraph({ children: [new TextRun({ text: "" })] }));

      // 2. Pedidos por Tipo
      if (datos.pedidosPorTipo.length > 0) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: "2. Pedidos Devueltos por Tipo", bold: true, size: 28 })]
          })
        );
        children.push(new Paragraph({ children: [new TextRun({ text: "" })] }));

        const tipoRows = datos.pedidosPorTipo.map(t => 
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(t.tipo)] }),
              new TableCell({ children: [new Paragraph(String(t.cantidad_pedidos))] }),
              new TableCell({ children: [new Paragraph(t.cantidad_piezas.toLocaleString())] })
            ]
          })
        );

        children.push(
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Tipo de Pedido")] }),
                  new TableCell({ children: [new Paragraph("Cantidad de Pedidos")] }),
                  new TableCell({ children: [new Paragraph("Piezas Devueltas")] })
                ]
              }),
              ...tipoRows
            ],
            width: { size: 100, type: WidthType.PERCENTAGE }
          })
        );
        children.push(new Paragraph({ children: [new TextRun({ text: "" })] }));
      }

      // 3. Productos Más Devueltos
      if (datos.productosMasDevueltos.length > 0) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: "3. Productos Más Devueltos (Top 20)", bold: true, size: 28 })]
          })
        );
        children.push(new Paragraph({ children: [new TextRun({ text: "" })] }));

        const productosRows = datos.productosMasDevueltos.map((p, idx) => 
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(String(idx + 1))] }),
              new TableCell({ children: [new Paragraph(p.codigo)] }),
              new TableCell({ children: [new Paragraph(p.nombre)] }),
              new TableCell({ children: [new Paragraph(p.cantidad_total.toLocaleString())] }),
              new TableCell({ children: [new Paragraph(String(p.veces_devuelto))] })
            ]
          })
        );

        children.push(
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("#")] }),
                  new TableCell({ children: [new Paragraph("Código")] }),
                  new TableCell({ children: [new Paragraph("Producto")] }),
                  new TableCell({ children: [new Paragraph("Piezas Devueltas")] }),
                  new TableCell({ children: [new Paragraph("Veces Devuelto")] })
                ]
              }),
              ...productosRows
            ],
            width: { size: 100, type: WidthType.PERCENTAGE }
          })
        );
        children.push(new Paragraph({ children: [new TextRun({ text: "" })] }));
      }

      // 4. Motivos
      if (datos.motivosDevolucion.length > 0) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: "4. Motivos de Devolución", bold: true, size: 28 })]
          })
        );
        children.push(new Paragraph({ children: [new TextRun({ text: "" })] }));

        const motivosRows = datos.motivosDevolucion.map(m => 
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(m.motivo)] }),
              new TableCell({ children: [new Paragraph(String(m.cantidad_pedidos))] }),
              new TableCell({ children: [new Paragraph(m.cantidad_piezas.toLocaleString())] })
            ]
          })
        );

        children.push(
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Motivo")] }),
                  new TableCell({ children: [new Paragraph("Pedidos")] }),
                  new TableCell({ children: [new Paragraph("Piezas")] })
                ]
              }),
              ...motivosRows
            ],
            width: { size: 100, type: WidthType.PERCENTAGE }
          })
        );
        children.push(new Paragraph({ children: [new TextRun({ text: "" })] }));
      }

      // 5. Resumen por Área
      if (datos.resumenPorArea.length > 0) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: "5. Resumen por Área", bold: true, size: 28 })]
          })
        );
        children.push(new Paragraph({ children: [new TextRun({ text: "" })] }));

        const areaRows = datos.resumenPorArea.map(a => 
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(a.area)] }),
              new TableCell({ children: [new Paragraph(String(a.cantidad_pedidos))] }),
              new TableCell({ children: [new Paragraph(a.cantidad_piezas.toLocaleString())] })
            ]
          })
        );

        children.push(
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Área")] }),
                  new TableCell({ children: [new Paragraph("Pedidos")] }),
                  new TableCell({ children: [new Paragraph("Piezas")] })
                ]
              }),
              ...areaRows
            ],
            width: { size: 100, type: WidthType.PERCENTAGE }
          })
        );
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
      const nombreArchivo = `Reporte_Devoluciones_${datos.periodo.replace(/[^a-zA-Z0-9._-]/g, '_')}.docx`;
      link.download = nombreArchivo;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error generando Word:", err);
      showAlert(`Error al generar Word: ${err.message || "Error desconocido"}`, "error");
    } finally {
      setDescargando(false);
    }
  };

  if (loading) {
    return (
      <div className="reporte-detallado-container">
        <div className="reporte-loading">Cargando reporte detallado de devoluciones...</div>
      </div>
    );
  }

  if (error || !datos) {
    return (
      <div className="reporte-detallado-container">
        <div className="reporte-error">{error || "No se pudieron cargar los datos"}</div>
      </div>
    );
  }

  return (
    <div className="reporte-detallado-container">
      <div className="reporte-header">
        <h1>Reporte Detallado de Devoluciones - {datos.periodo}</h1>
        {onClose && (
          <button className="btn-cerrar" onClick={onClose}>
            ✕
          </button>
        )}
      </div>

      {/* Botones de descarga */}
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

      <div className="reporte-content">
        {/* 1. Resumen General */}
        <section className="reporte-section">
          <h2>1. Resumen General</h2>
          <div className="metricas-grid">
            <div className="metrica-card">
              <div className="metrica-valor">{datos.resumen.total_pedidos}</div>
              <div className="metrica-label">Total de pedidos devueltos</div>
            </div>
            <div className="metrica-card">
              <div className="metrica-valor">{datos.resumen.total_piezas.toLocaleString()}</div>
              <div className="metrica-label">Total de piezas devueltas</div>
            </div>
            <div className="metrica-card">
              <div className="metrica-valor">{datos.resumen.total_productos}</div>
              <div className="metrica-label">Total de productos únicos</div>
            </div>
          </div>
        </section>

        {/* 2. Pedidos por Tipo */}
        {datos.pedidosPorTipo.length > 0 && (
          <section className="reporte-section">
            <h2>2. Pedidos Devueltos por Tipo</h2>
            <table className="reporte-table">
              <thead>
                <tr>
                  <th>Tipo de Pedido</th>
                  <th>Cantidad de Pedidos</th>
                  <th>Piezas Devueltas</th>
                </tr>
              </thead>
              <tbody>
                {datos.pedidosPorTipo.map((tipo, idx) => (
                  <tr key={idx}>
                    <td>{tipo.tipo}</td>
                    <td>{tipo.cantidad_pedidos}</td>
                    <td>{tipo.cantidad_piezas.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* 3. Productos Más Devueltos */}
        {datos.productosMasDevueltos.length > 0 && (
          <section className="reporte-section">
            <h2>3. Productos Más Devueltos (Top 20)</h2>
            <table className="reporte-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Piezas Devueltas</th>
                  <th>Veces Devuelto</th>
                </tr>
              </thead>
              <tbody>
                {datos.productosMasDevueltos.map((prod, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td>{prod.codigo}</td>
                    <td>{prod.nombre}</td>
                    <td>{prod.cantidad_total.toLocaleString()}</td>
                    <td>{prod.veces_devuelto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* 4. Motivos de Devolución */}
        {datos.motivosDevolucion.length > 0 && (
          <section className="reporte-section">
            <h2>4. Motivos de Devolución</h2>
            <table className="reporte-table">
              <thead>
                <tr>
                  <th>Motivo</th>
                  <th>Cantidad de Pedidos</th>
                  <th>Piezas Devueltas</th>
                </tr>
              </thead>
              <tbody>
                {datos.motivosDevolucion.map((motivo, idx) => (
                  <tr key={idx}>
                    <td>{motivo.motivo}</td>
                    <td>{motivo.cantidad_pedidos}</td>
                    <td>{motivo.cantidad_piezas.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* 5. Resumen por Área */}
        {datos.resumenPorArea.length > 0 && (
          <section className="reporte-section">
            <h2>5. Resumen por Área</h2>
            <table className="reporte-table">
              <thead>
                <tr>
                  <th>Área</th>
                  <th>Cantidad de Pedidos</th>
                  <th>Piezas Devueltas</th>
                </tr>
              </thead>
              <tbody>
                {datos.resumenPorArea.map((area, idx) => (
                  <tr key={idx}>
                    <td>{area.area}</td>
                    <td>{area.cantidad_pedidos}</td>
                    <td>{area.cantidad_piezas.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}

