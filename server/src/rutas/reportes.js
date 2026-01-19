import express from "express";
import ExcelJS from "exceljs";
import dayjs from "dayjs";
import { dbHist, dbDevol, dbReenvios, dbDia } from "../config/baseDeDatos.js";
import { getIO } from "../config/socket.js";
import fs from "fs";
import path from "path";

const router = express.Router();

router.get("/reportes/dias", (req, res) => {
  const canal = (req.query?.canal || "").toString().trim().toLowerCase();
  if (canal && canal !== "all") {
    const rows = dbHist.prepare(`
      SELECT fecha,
             COUNT(*) AS total_productos,
             SUM(COALESCE(piezas,0)) AS total_piezas
      FROM productos_historico
      WHERE COALESCE(canal, 'picking') = ?
      GROUP BY fecha
      ORDER BY fecha ASC
    `).all(canal);
    res.json(rows);
    return;
  }

  const rows = dbHist.prepare(`
    SELECT fecha,
           COUNT(*) AS total_productos,
           SUM(COALESCE(piezas,0)) AS total_piezas
    FROM productos_historico
    GROUP BY fecha
    ORDER BY fecha ASC
  `).all();
  res.json(rows);
});

router.get("/reportes/dia/:fecha", (req, res) => {
  const rows = dbHist.prepare(`
    SELECT
      h.id,
      h.fecha,
      h.codigo,
      h.nombre,
      h.cajas,
      h.piezas,
      h.piezas_por_caja,
      h.extras,
      h.observaciones,
      h.surtido,
      h.disponible,
      h.hora_solicitud,
      h.hora_surtido,
      h.lote,
      COALESCE(h.origen, 'normal') AS origen,
      COALESCE(h.canal, 'picking') AS canal,
      COALESCE(r.categoria, '') AS categoria,
      h.devolucion_producto_id
    FROM productos_historico h
    LEFT JOIN productos_ref r ON r.codigo = h.codigo
    WHERE h.fecha=?
    ORDER BY h.id ASC
  `).all(req.params.fecha);

  res.json(rows);
});

router.get("/reportes/devoluciones-pedidos/:fecha", (req, res) => {
  try {
    const { fecha } = req.params;
    console.log("📦 Buscando pedidos de devoluciones para fecha:", fecha);

    const construirPedidosFallback = (productos, fechaBase) => {
      if (!Array.isArray(productos) || productos.length === 0) {
        return [];
      }

      const grupos = new Map();
      let idx = 0;

      for (const prod of productos) {
        const observacionRaw = (prod.observaciones || "").trim();
        const etiqueta = observacionRaw || "Devoluciones";
        if (!grupos.has(etiqueta)) {
          idx += 1;
          grupos.set(etiqueta, {
            id: `fallback-${fechaBase}-${idx}`,
            pedido: etiqueta,
            guia: null,
            paqueteria: null,
            motivo: null,
            area: etiqueta.replace(/^Devoluci[oó]n\s+/i, "") || null,
            usuario: null,
            fecha: fechaBase,
            fecha_cierre: fechaBase,
            total_productos: 0,
            total_piezas: 0,
            total_cajas: 0,
            productos_surtidos: 0,
            productos_agotados: 0,
            productos_no_surtidos: 0,
            productos: []
          });
        }

        const grupo = grupos.get(etiqueta);
        grupo.productos.push(prod);
        grupo.total_productos += 1;
        grupo.total_piezas += prod.total_piezas || 0;
        grupo.total_cajas += prod.cajas || 0;
        grupo.productos_surtidos += prod.surtido === 1 ? 1 : 0;
        grupo.productos_agotados += prod.disponible === 0 ? 1 : 0;
        grupo.productos_no_surtidos += prod.surtido === 0 ? 1 : 0;
      }

      return Array.from(grupos.values());
    };

    const obtenerProductosFallback = () => {
      let productosFallback = [];
      try {
        productosFallback = dbHist.prepare(`
          SELECT
            h.id,
            h.codigo,
            h.nombre,
            h.cajas,
            h.piezas,
            h.piezas_por_caja,
            h.extras,
            h.lote,
            h.surtido,
            h.disponible,
            h.hora_solicitud,
            h.hora_surtido,
            h.observaciones,
            (COALESCE(h.cajas, 0) * COALESCE(h.piezas_por_caja, h.piezas, 0) + COALESCE(h.extras, 0)) AS total_piezas
          FROM productos_historico h
          WHERE h.fecha = ?
            AND h.origen = 'devoluciones'
          ORDER BY h.id ASC
        `).all(fecha);
      } catch (e) {
        console.warn("⚠️ Error buscando productos fallback en histórico:", e.message);
      }

      if (productosFallback.length === 0) {
        try {
          productosFallback = dbDia.prepare(`
            SELECT
              h.id,
              h.codigo,
              h.nombre,
              h.cajas,
              h.piezas,
              h.piezas_por_caja,
              h.extras,
              h.lote,
              h.surtido,
              h.disponible,
              h.hora_solicitud,
              h.hora_surtido,
              h.observaciones,
              (COALESCE(h.cajas, 0) * COALESCE(h.piezas_por_caja, h.piezas, 0) + COALESCE(h.extras, 0)) AS total_piezas
            FROM productos h
            WHERE h.origen = 'devoluciones'
            ORDER BY h.id ASC
          `).all();
        } catch (e) {
          console.warn("⚠️ Error buscando productos fallback en tabla actual:", e.message);
        }
      }

      return productosFallback;
    };
    
    let productosDevoluciones = dbHist.prepare(`
      SELECT DISTINCT
        devolucion_producto_id
      FROM productos_historico
      WHERE fecha = ? 
        AND origen = 'devoluciones'
        AND devolucion_producto_id IS NOT NULL
    `).all(fecha);
    
    if (productosDevoluciones.length === 0) {
      console.log("🔍 No hay productos en histórico, buscando en tabla actual...");
      try {
        productosDevoluciones = dbDia.prepare(`
          SELECT DISTINCT
            devolucion_producto_id
          FROM productos
          WHERE origen = 'devoluciones'
            AND devolucion_producto_id IS NOT NULL
        `).all();
        console.log("✅ Productos encontrados en tabla actual:", productosDevoluciones.length);
      } catch (e) {
        console.warn("⚠️ Error buscando en tabla actual:", e.message);
      }
    }
    
    console.log("🔍 Productos de devoluciones encontrados:", productosDevoluciones.length);
    
    if (productosDevoluciones.length === 0) {
      console.log("⚠️ No hay productos de devoluciones para esta fecha");
      const productosFallback = obtenerProductosFallback();
      if (productosFallback.length > 0) {
        return res.json(construirPedidosFallback(productosFallback, fecha));
      }
      return res.json([]);
    }
    
    const idsProductos = productosDevoluciones.map(p => p.devolucion_producto_id).filter(Boolean);
    console.log("📋 IDs de productos:", idsProductos);

    if (idsProductos.length === 0) {
      console.log("⚠️ No hay IDs de productos; usando fallback por histórico");
      const productosFallback = obtenerProductosFallback();
      if (productosFallback.length > 0) {
        return res.json(construirPedidosFallback(productosFallback, fecha));
      }
      return res.json([]);
    }
    
    // Obtener los devolucion_id de esos productos (buscar en ambas bases)
    const devolucionIds = new Set();
    
    // Buscar en dbDevol (actuales)
    try {
      const productosActuales = dbDevol.prepare(`
        SELECT DISTINCT devolucion_id
        FROM devoluciones_productos
        WHERE id IN (${idsProductos.map(() => '?').join(',')})
      `).all(...idsProductos);
      
      productosActuales.forEach(p => {
        if (p.devolucion_id) devolucionIds.add(p.devolucion_id);
      });
      console.log("✅ Devolucion IDs encontrados en dbDevol:", productosActuales.length);
    } catch (e) {
      console.warn("⚠️ Error buscando en dbDevol:", e.message);
    }
    
    // Si no encontramos nada, puede que los productos estén en histórico
    // Pero los productos históricos no tienen la relación directa, así que usamos los IDs que ya tenemos
    
    if (devolucionIds.size === 0) {
      console.log("⚠️ No se encontraron devolucion_ids");
      const productosFallback = obtenerProductosFallback();
      if (productosFallback.length > 0) {
        return res.json(construirPedidosFallback(productosFallback, fecha));
      }
      return res.json([]);
    }
    
    console.log("📦 Total de devolucion_ids únicos:", devolucionIds.size);

    // Para cada pedido, obtener información completa
    const pedidosCompletos = [];
    
    for (const devolucionId of devolucionIds) {
      
      // Intentar obtener pedido de tabla histórica primero
      let pedidoInfo = null;
      try {
        pedidoInfo = dbHist.prepare(`
          SELECT 
            id,
            pedido,
            guia,
            paqueteria,
            motivo,
            area,
            usuario,
            fecha_cierre,
            fecha
          FROM devoluciones_pedidos_hist
          WHERE id = ?
        `).get(devolucionId);
      } catch (e) {
        // Si no existe en histórico, buscar en actual
        try {
          pedidoInfo = dbDevol.prepare(`
            SELECT 
              id,
              pedido,
              guia,
              paqueteria,
              motivo,
              area,
              usuario,
              NULL AS fecha_cierre,
              fecha
            FROM devoluciones_pedidos
            WHERE id = ?
          `).get(devolucionId);
        } catch (e2) {
          console.warn(`No se encontró pedido ${devolucionId}`);
          continue;
        }
      }
      
      if (!pedidoInfo) continue;
      
      // Obtener los IDs de productos de devoluciones que pertenecen a este pedido
      let productosIdsDelPedido = [];
      try {
        const productosDelPedido = dbDevol.prepare(`
          SELECT id
          FROM devoluciones_productos
          WHERE devolucion_id = ?
        `).all(devolucionId);
        productosIdsDelPedido = productosDelPedido.map(p => p.id);
      } catch (e) {
        console.warn(`⚠️ Error obteniendo productos del pedido ${devolucionId}:`, e.message);
      }
      
      if (productosIdsDelPedido.length === 0) {
        console.warn(`⚠️ No se encontraron productos para el pedido ${devolucionId}`);
        continue;
      }
      
      // Obtener productos de picking relacionados con este pedido
      // Primero intentar en histórico, luego en tabla actual
      let productos = [];
      try {
        productos = dbHist.prepare(`
          SELECT
            h.id,
            h.codigo,
            h.nombre,
            h.cajas,
            h.piezas,
            h.piezas_por_caja,
            h.extras,
            h.lote,
            h.surtido,
            h.disponible,
            h.hora_solicitud,
            h.hora_surtido,
            h.observaciones,
            (COALESCE(h.cajas, 0) * COALESCE(h.piezas_por_caja, h.piezas, 0) + COALESCE(h.extras, 0)) AS total_piezas
          FROM productos_historico h
          WHERE h.fecha = ?
            AND h.origen = 'devoluciones'
            AND h.devolucion_producto_id IN (${productosIdsDelPedido.map(() => '?').join(',')})
          ORDER BY h.id ASC
        `).all(fecha, ...productosIdsDelPedido);
      } catch (e) {
        console.warn("⚠️ Error buscando en histórico, intentando tabla actual...");
      }
      
      // Si no hay productos en histórico, buscar en tabla actual
      if (productos.length === 0) {
        try {
          productos = dbDia.prepare(`
            SELECT
              h.id,
              h.codigo,
              h.nombre,
              h.cajas,
              h.piezas,
              h.piezas_por_caja,
              h.extras,
              h.lote,
              h.surtido,
              h.disponible,
              h.hora_solicitud,
              h.hora_surtido,
              h.observaciones,
              (COALESCE(h.cajas, 0) * COALESCE(h.piezas_por_caja, h.piezas, 0) + COALESCE(h.extras, 0)) AS total_piezas
            FROM productos h
            WHERE h.origen = 'devoluciones'
              AND h.devolucion_producto_id IN (${productosIdsDelPedido.map(() => '?').join(',')})
            ORDER BY h.id ASC
          `).all(...productosIdsDelPedido);
          console.log(`✅ Productos encontrados en tabla actual para pedido ${devolucionId}:`, productos.length);
        } catch (e) {
          console.warn(`⚠️ Error buscando productos en tabla actual:`, e.message);
        }
      }

      // Calcular estadísticas del pedido
      const totalProductos = productos.length;
      const totalPiezas = productos.reduce((sum, p) => sum + (p.total_piezas || 0), 0);
      const totalCajas = productos.reduce((sum, p) => sum + (p.cajas || 0), 0);
      const productosSurtidos = productos.filter(p => p.surtido === 1).length;
      const productosAgotados = productos.filter(p => p.disponible === 0).length;
      const productosNoSurtidos = productos.filter(p => p.surtido === 0).length;

      pedidosCompletos.push({
        id: devolucionId,
        pedido: pedidoInfo.pedido,
        guia: pedidoInfo.guia,
        paqueteria: pedidoInfo.paqueteria,
        motivo: pedidoInfo.motivo,
        area: pedidoInfo.area,
        usuario: pedidoInfo.usuario,
        fecha: pedidoInfo.fecha,
        fecha_cierre: pedidoInfo.fecha_cierre,
        total_productos: totalProductos,
        total_piezas: totalPiezas,
        total_cajas: totalCajas,
        productos_surtidos: productosSurtidos,
        productos_agotados: productosAgotados,
        productos_no_surtidos: productosNoSurtidos,
        productos: productos
      });
    }

    console.log("✅ Total de pedidos completos:", pedidosCompletos.length);
    res.json(pedidosCompletos);
  } catch (err) {
    console.error("❌ Error obteniendo pedidos de devoluciones:", err);
    console.error("❌ Stack:", err.stack);
    res.status(500).json({ error: "Error obteniendo pedidos de devoluciones: " + err.message });
  }
});

router.put("/reportes/mover-dia", (req, res) => {
  const { fecha_original, nueva_fecha } = req.body || {};
  if (!fecha_original || !nueva_fecha) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  const existe = dbHist.prepare(
    `SELECT 1 FROM productos_historico WHERE fecha=? LIMIT 1`
  ).get(nueva_fecha);

  if (existe) {
    return res
      .status(409)
      .json({ error: `Ya existe un reporte en ${nueva_fecha}. Elige otra fecha.` });
  }

  // Para devoluciones, actualizar fecha_cierre si existe, sino actualizar fecha
  // Primero intentar actualizar fecha_cierre
  const info1 = dbHist
    .prepare(`UPDATE devoluciones_clientes_hist SET fecha_cierre=? WHERE fecha_cierre=?`)
    .run(nueva_fecha, fecha_original);
  
  const info2 = dbHist
    .prepare(`UPDATE devoluciones_calidad_hist SET fecha_cierre=? WHERE fecha_cierre=?`)
    .run(nueva_fecha, fecha_original);
  
  const info3 = dbHist
    .prepare(`UPDATE devoluciones_reacondicionados_hist SET fecha_cierre=? WHERE fecha_cierre=?`)
    .run(nueva_fecha, fecha_original);
  
  const info4 = dbHist
    .prepare(`UPDATE devoluciones_retail_hist SET fecha_cierre=? WHERE fecha_cierre=?`)
    .run(nueva_fecha, fecha_original);
  
  const info5 = dbHist
    .prepare(`UPDATE devoluciones_cubbo_hist SET fecha_cierre=? WHERE fecha_cierre=?`)
    .run(nueva_fecha, fecha_original);
  
  const info6 = dbHist
    .prepare(`UPDATE devoluciones_regulatorio_hist SET fecha_cierre=? WHERE fecha_cierre=?`)
    .run(nueva_fecha, fecha_original);
  
  // También actualizar fecha si no hay fecha_cierre
  const info7 = dbHist
    .prepare(`UPDATE devoluciones_clientes_hist SET fecha=? WHERE fecha=? AND fecha_cierre IS NULL`)
    .run(nueva_fecha, fecha_original);
  
  const totalModificados = info1.changes + info2.changes + info3.changes + info4.changes + info5.changes + info6.changes + info7.changes;
  
  // Para productos_historico (picking)
  const info = dbHist
    .prepare("UPDATE productos_historico SET fecha=? WHERE fecha=?")
    .run(nueva_fecha, fecha_original);

  getIO().emit("reportes_actualizados");
  res.json({
    success: true,
    modificados: info.changes,
    mensaje: `Reporte movido de ${fecha_original} a ${nueva_fecha}`,
  });
});

router.delete("/reportes/dia/:fecha", (req, res) => {
  const { fecha } = req.params;

  const existe = dbHist
    .prepare(
      "SELECT COUNT(*) AS total FROM productos_historico WHERE fecha=?"
    )
    .get(fecha);

  if (!existe || existe.total === 0) {
    return res
      .status(404)
      .json({ error: "No hay registros con esa fecha" });
  }

  dbHist.prepare("DELETE FROM productos_historico WHERE fecha=?").run(fecha);

  getIO().emit("reportes_actualizados");
  res.json({
    success: true,
    message: `Registros del ${fecha} eliminados permanentemente.`,
  });
});

router.get("/reportes/preview", (req, res) => {
  try {
    const { tipo, mes, quincena } = req.query;
    if (!tipo || !mes) {
      return res.status(400).json({ error: "Faltan parámetros" });
    }

    let desde, hasta, titulo;

    if (tipo === "quincenal") {
      if (!quincena) {
        return res.status(400).json({ error: "Falta quincena" });
      }

      const [year, month] = mes.split("-").map(Number);
      const startDay = quincena === "1" ? 1 : 16;
      const endDay =
        quincena === "1"
          ? 15
          : dayjs(`${year}-${String(month).padStart(2, "0")}-01`).daysInMonth();

      desde = `${mes}-${String(startDay).padStart(2, "0")}`;
      hasta = `${mes}-${String(endDay).padStart(2, "0")}`;
      titulo = `Reporte de surtido ${mes} del ${startDay} al ${endDay}`;
    } else {
      const endDay = dayjs(`${mes}-01`).daysInMonth();
      desde = `${mes}-01`;
      hasta = `${mes}-${String(endDay).padStart(2, "0")}`;
      titulo = `Reporte de surtido ${mes} Mensual`;
    }

    const rows = dbHist.prepare(
      `
      SELECT * 
      FROM productos_historico 
      WHERE fecha BETWEEN ? AND ? 
      ORDER BY fecha ASC, id ASC
    `
    ).all(desde, hasta);

    res.json({
      titulo,
      total_filas: rows.length,
      filas: rows.slice(0, 200),
    });
  } catch (err) {
    console.error("Error preview:", err);
    res.status(500).json({ error: "Error generando vista previa" });
  }
});

// Quincenal picking
router.get("/reportes/quincenal", async (req, res) => {
  try {
    const { mes, quincena } = req.query;
    if (!mes || !quincena) {
      return res
        .status(400)
        .json({ error: "Faltan parámetros mes/quincena" });
    }

    const [year, month] = mes.split("-").map(Number);
    const startDay = quincena === "1" ? 1 : 16;
    const endDay =
      quincena === "1"
        ? 15
        : dayjs(`${year}-${String(month).padStart(2, "0")}-01`).daysInMonth();

    const desde = `${mes}-${String(startDay).padStart(2, "0")}`;
    const hasta = `${mes}-${String(endDay).padStart(2, "0")}`;

    const rows = dbHist.prepare(
      `
      SELECT * 
      FROM productos_historico 
      WHERE fecha BETWEEN ? AND ? 
      ORDER BY fecha ASC, id ASC
    `
    ).all(desde, hasta);

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet(`Quincena ${quincena} - ${mes}`);

    sheet.columns = [
      { header: "Código", key: "codigo" },
      { header: "Nombre", key: "nombre" },
      { header: "Presentación", key: "presentacion" },
      { header: "Cajas", key: "cajas" },
      { header: "Piezas", key: "piezas" },
      { header: "Observaciones", key: "observaciones" },
      { header: "Surtido", key: "surtido" },
      { header: "Disponible", key: "disponible" },
      { header: "Hora Solicitud", key: "hora_solicitud" },
      { header: "Hora Surtido", key: "hora_surtido" },
      { header: "Fecha", key: "fecha" },
      { header: "Lote", key: "lote" },
    ];

    sheet.addRows(rows);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Reporte_de_surtido_${mes}_Quincena_${quincena}.xlsx`
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error quincenal:", err);
    res.status(500).json({ error: "Error generando excel" });
  }
});

// Mensual picking
router.get("/reportes/mensual", async (req, res) => {
  try {
    const { mes } = req.query;
    if (!mes) {
      return res.status(400).json({ error: "Falta parámetro mes" });
    }

    const endDay = dayjs(`${mes}-01`).daysInMonth();
    const desde = `${mes}-01`;
    const hasta = `${mes}-${String(endDay).padStart(2, "0")}`;

    const rows = dbHist.prepare(
      `
      SELECT * 
      FROM productos_historico 
      WHERE fecha BETWEEN ? AND ? 
      ORDER BY fecha ASC, id ASC
    `
    ).all(desde, hasta);

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet(`Mensual ${mes}`);

    sheet.columns = [
      { header: "Código", key: "codigo" },
      { header: "Nombre", key: "nombre" },
      { header: "Presentación", key: "presentacion" },
      { header: "Cajas", key: "cajas" },
      { header: "Piezas", key: "piezas" },
      { header: "Observaciones", key: "observaciones" },
      { header: "Surtido", key: "surtido" },
      { header: "Disponible", key: "disponible" },
      { header: "Hora Solicitud", key: "hora_solicitud" },
      { header: "Hora Surtido", key: "hora_surtido" },
      { header: "Fecha", key: "fecha" },
      { header: "Lote", key: "lote" },
    ];

    sheet.addRows(rows);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Reporte_de_surtido_${mes}_Mensual.xlsx`
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error mensual:", err);
    res.status(500).json({ error: "Error generando excel" });
  }
});

// Exportar día específico picking (con 3 hojas: Todo, Importación, Devoluciones)
router.get("/reportes/exportar-dia/:fecha", async (req, res) => {
  const { fecha } = req.params;

  try {
    const allRows = dbHist.prepare(
      `
      SELECT
      h.codigo,
      h.nombre,
      COALESCE(r.presentacion, '') AS presentacion,
      h.lote,
        h.cajas,
        COALESCE(h.piezas_por_caja, h.piezas, 0) AS piezas_por_caja,
        h.extras,
        (COALESCE(h.cajas,0) * COALESCE(h.piezas_por_caja, h.piezas, 0)
          + COALESCE(h.extras,0)) AS total,
        h.observaciones,
        h.surtido,
        h.disponible,
        h.hora_solicitud,
        h.hora_surtido,
        COALESCE(r.categoria, '') AS categoria,
        COALESCE(h.origen, 'normal') AS origen
      FROM productos_historico h
      LEFT JOIN productos_ref r ON r.codigo = h.codigo
      WHERE h.fecha = ? AND h.surtido = 1
      ORDER BY h.id ASC
    `
    ).all(fecha);

    if (!allRows.length) {
      return res
        .status(404)
        .json({ error: "No hay registros para esa fecha" });
    }

    // Separar en 3 categorías
    const todoRows = allRows.filter((r) => {
      const esDevolucion = r.origen === 'devoluciones';
      const categoria = (r.categoria || "").toLowerCase();
      const esImportado = categoria.includes("import") || categoria.includes("importación");
      const esOrganico = categoria.includes("orgánico") || categoria.includes("organico");
      return !esDevolucion && !esImportado && !esOrganico;
    });

    const importacionRows = allRows.filter((r) => {
      const categoria = (r.categoria || "").toLowerCase();
      const esImportado = categoria.includes("import") || categoria.includes("importación");
      const esOrganico = categoria.includes("orgánico") || categoria.includes("organico");
      return esImportado || esOrganico;
    });

    const devolucionesRows = allRows.filter((r) => r.origen === 'devoluciones');

    const wb = new ExcelJS.Workbook();
    
    // Función para crear una hoja
    const crearHoja = (nombre, datos) => {
      const ws = wb.addWorksheet(nombre);
      ws.addRow(["Fecha", fecha]);
      ws.addRow([]);

      ws.columns = [
        { header: "Código", key: "codigo", width: 15 },
        { header: "Nombre", key: "nombre", width: 30 },
        { header: "Presentación", key: "presentacion", width: 20 },
        { header: "Lote", key: "lote", width: 15 },
        { header: "Cajas", key: "cajas", width: 10 },
        { header: "Piezas_por_caja", key: "piezas_por_caja", width: 15 },
        { header: "Extras", key: "extras", width: 10 },
        { header: "Total", key: "total", width: 12 },
        { header: "Observaciones", key: "observaciones", width: 25 },
        { header: "Surtido", key: "surtido", width: 10 },
        { header: "Disponible", key: "disponible", width: 12 },
        { header: "Hora Solicitud", key: "hora_solicitud", width: 15 },
        { header: "Hora Surtido", key: "hora_surtido", width: 15 },
        { header: "Categoria", key: "categoria", width: 18 },
      ];

      if (datos.length > 0) {
        ws.addRows(datos);
      } else {
        ws.addRow(["No hay registros en esta sección"]);
      }
    };

    // Crear las 3 hojas
    crearHoja("Todo", todoRows);
    crearHoja("Importación", importacionRows);
    crearHoja("Devoluciones", devolucionesRows);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Picking_${fecha}.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error Excel día:", err);
    res.status(500).json({ error: "Error generando excel" });
  }
});

// Exportar mes completo picking
router.get("/reportes/exportar-mes/:mes", async (req, res) => {
  const mes = req.params.mes; // YYYY-MM

  try {
    const rows = dbHist.prepare(
      `
      SELECT
        h.fecha,
      h.codigo,
      h.nombre,
      COALESCE(r.presentacion, '') AS presentacion,
      h.lote,
        h.cajas,
        COALESCE(h.piezas_por_caja, h.piezas, 0) AS piezas_por_caja,
        h.extras,
        (COALESCE(h.cajas,0) * COALESCE(h.piezas_por_caja, h.piezas, 0)
          + COALESCE(h.extras,0)) AS total,
        h.observaciones,
        h.surtido,
        h.disponible,
        h.hora_solicitud,
        h.hora_surtido,
        COALESCE(r.categoria,'') AS categoria
      FROM productos_historico h
      LEFT JOIN productos_ref r ON r.codigo = h.codigo
      WHERE h.fecha LIKE ?
      ORDER BY h.fecha ASC, h.id ASC
    `
    ).all(`${mes}%`);

    if (!rows.length) {
      return res
        .status(404)
        .json({ error: "No hay registros ese mes" });
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`Mes_${mes}`);

    ws.columns = [
      { key: "codigo", width: 15 },
      { key: "nombre", width: 30 },
      { key: "presentacion", width: 20 },
      { key: "lote", width: 15 },
      { key: "cajas", width: 10 },
      { key: "piezas_por_caja", width: 15 },
      { key: "extras", width: 10 },
      { key: "total", width: 12 },
      { key: "observaciones", width: 25 },
      { key: "surtido", width: 10 },
      { key: "disponible", width: 12 },
      { key: "hora_solicitud", width: 15 },
      { key: "hora_surtido", width: 15 },
      { key: "categoria", width: 18 },
    ];

    let fechaActual = null;

    for (const r of rows) {
      if (r.fecha !== fechaActual) {
        if (fechaActual !== null) ws.addRow([]);
        fechaActual = r.fecha;
        ws.addRow([`Fecha: ${fechaActual}`]);
        ws.addRow([
          "Código",
          "Nombre",
          "Lote",
          "Cajas",
          "Piezas_por_caja",
          "Extras",
          "Total",
          "Observaciones",
          "Surtido",
          "Disponible",
          "Hora Solicitud",
          "Hora Surtido",
          "Categoria",
        ]);
      }
      ws.addRow([
        r.codigo,
        r.nombre,
        r.lote,
        r.cajas,
        r.piezas_por_caja,
        r.extras,
        r.total,
        r.observaciones,
        r.surtido,
        r.disponible,
        r.hora_solicitud,
        r.hora_surtido,
        r.categoria,
      ]);
    }

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Picking_${mes}_Mensual.xlsx`
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error Excel mensual:", err);
    res.status(500).json({ error: "Error generando excel" });
  }
});

// Función helper para calcular tiempo en minutos entre dos horas
const calcularTiempoMinutos = (horaSolicitud, horaSurtido) => {
  if (!horaSolicitud || !horaSurtido) return null;
  
  try {
    const [h1, m1, s1] = horaSolicitud.split(':').map(Number);
    const [h2, m2, s2] = horaSurtido.split(':').map(Number);
    
    const minutos1 = h1 * 60 + m1 + s1 / 60;
    const minutos2 = h2 * 60 + m2 + s2 / 60;
    
    // Si la hora de surtido es menor, asumimos que es del día siguiente
    let diferencia = minutos2 - minutos1;
    if (diferencia < 0) diferencia += 24 * 60; // Día siguiente
    
    return Math.round(diferencia * 100) / 100; // Redondear a 2 decimales
  } catch (e) {
    return null;
  }
};

// Función para filtrar productos por tipo
const filtrarPorTipo = (rows, tipo) => {
  if (tipo === 'todo') {
    return rows.filter((r) => {
      const esDevolucion = r.origen === 'devoluciones';
      const categoria = (r.categoria || "").toLowerCase();
      const esImportado = categoria.includes("import") || categoria.includes("importación");
      const esOrganico = categoria.includes("orgánico") || categoria.includes("organico");
      return !esDevolucion && !esImportado && !esOrganico;
    });
  } else if (tipo === 'importacion') {
    return rows.filter((r) => {
      const categoria = (r.categoria || "").toLowerCase();
      const esImportado = categoria.includes("import") || categoria.includes("importación");
      const esOrganico = categoria.includes("orgánico") || categoria.includes("organico");
      return esImportado || esOrganico;
    });
  } else if (tipo === 'devoluciones') {
    return rows.filter((r) => r.origen === 'devoluciones');
  }
  return rows;
};

// Función para generar reporte detallado
const generarReporteDetallado = (rows, tipo, periodo) => {
  const datosFiltrados = filtrarPorTipo(rows, tipo);
  
  if (datosFiltrados.length === 0) {
    return {
      periodo,
      tipo,
      totales: {
        registros: 0,
        cajas: 0,
        piezas: 0
      },
      metricasTiempos: {
        promedio: 0,
        minimo: 0,
        maximo: 0,
        totales: 0
      },
      topProductos: [],
      productosAgotados: [],
      productosNoSurtidos: [],
      cambiosLote: [],
      listaConsolidada: []
    };
  }

  // Calcular tiempos y agregar a cada registro
  const datosConTiempo = datosFiltrados.map(r => {
    const tiempo = calcularTiempoMinutos(r.hora_solicitud, r.hora_surtido);
    return { ...r, tiempo_minutos: tiempo };
  });

  // 1. TOTALES GENERALES
  const totales = {
    registros: datosFiltrados.length,
    cajas: datosFiltrados.reduce((sum, r) => sum + (Number(r.cajas) || 0), 0),
    piezas: datosFiltrados.reduce((sum, r) => {
      const total = (Number(r.cajas) || 0) * (Number(r.piezas_por_caja) || Number(r.piezas) || 0) + (Number(r.extras) || 0);
      return sum + total;
    }, 0)
  };

  // 2. MÉTRICAS DE TIEMPOS
  const tiemposValidos = datosConTiempo.filter(r => r.tiempo_minutos !== null).map(r => r.tiempo_minutos);
  const metricasTiempos = {
    promedio: tiemposValidos.length > 0 
      ? Math.round((tiemposValidos.reduce((a, b) => a + b, 0) / tiemposValidos.length) * 100) / 100
      : 0,
    minimo: tiemposValidos.length > 0 ? Math.min(...tiemposValidos) : 0,
    maximo: tiemposValidos.length > 0 ? Math.max(...tiemposValidos) : 0,
    totales: tiemposValidos.length
  };

  // 3. TOP PRODUCTOS (por piezas)
  const productosMap = {};
  datosFiltrados.forEach(r => {
    const codigo = r.codigo;
    const totalPiezas = (Number(r.cajas) || 0) * (Number(r.piezas_por_caja) || Number(r.piezas) || 0) + (Number(r.extras) || 0);
    
    if (!productosMap[codigo]) {
      productosMap[codigo] = {
        codigo,
        nombre: r.nombre,
        piezas_totales: 0,
        cajas_totales: 0,
        veces_surtido: 0,
        lotes_distintos: new Set()
      };
    }
    
    productosMap[codigo].piezas_totales += totalPiezas;
    productosMap[codigo].cajas_totales += (Number(r.cajas) || 0);
    productosMap[codigo].veces_surtido += 1;
    if (r.lote) productosMap[codigo].lotes_distintos.add(r.lote);
  });

  const topProductos = Object.values(productosMap)
    .map(p => ({
      ...p,
      lotes_distintos: p.lotes_distintos.size
    }))
    .sort((a, b) => b.piezas_totales - a.piezas_totales)
    .slice(0, 10);

  // 4. PRODUCTOS AGOTADOS (disponible = 0)
  const agotadosMap = {};
  datosFiltrados.filter(r => r.disponible === 0).forEach(r => {
    if (!agotadosMap[r.codigo]) {
      agotadosMap[r.codigo] = {
        codigo: r.codigo,
        nombre: r.nombre,
        veces_agotado: 0
      };
    }
    agotadosMap[r.codigo].veces_agotado += 1;
  });

  const productosAgotados = Object.values(agotadosMap)
    .sort((a, b) => b.veces_agotado - a.veces_agotado);

  // 5. PRODUCTOS NO SURTIDOS (surtido = 0)
  const noSurtidosMap = {};
  datosFiltrados.filter(r => r.surtido === 0).forEach(r => {
    if (!noSurtidosMap[r.codigo]) {
      noSurtidosMap[r.codigo] = {
        codigo: r.codigo,
        nombre: r.nombre,
        ocasiones_no_surtido: 0
      };
    }
    noSurtidosMap[r.codigo].ocasiones_no_surtido += 1;
  });

  const productosNoSurtidos = Object.values(noSurtidosMap)
    .sort((a, b) => b.ocasiones_no_surtido - a.ocasiones_no_surtido);

  // 6. CAMBIOS DE LOTE
  const cambiosLote = Object.values(productosMap)
    .filter(p => p.lotes_distintos.size > 1)
    .map(p => ({
      codigo: p.codigo,
      nombre: p.nombre,
      lotes_distintos: p.lotes_distintos.size
    }))
    .sort((a, b) => b.lotes_distintos - a.lotes_distintos);

  // 7. LISTA CONSOLIDADA (todos los productos ordenados por piezas)
  const listaConsolidada = Object.values(productosMap)
    .map(p => ({
      codigo: p.codigo,
      nombre: p.nombre,
      piezas: p.piezas_totales,
      cajas: p.cajas_totales,
      veces_surtido: p.veces_surtido,
      lotes_distintos: p.lotes_distintos.size
    }))
    .sort((a, b) => b.piezas - a.piezas);

  // 8. DATOS POR DÍA (para gráficas)
  const datosPorDia = {};
  datosFiltrados.forEach(r => {
    if (!datosPorDia[r.fecha]) {
      datosPorDia[r.fecha] = {
        fecha: r.fecha,
        cajas: 0,
        piezas: 0,
        tiempos: [],
        productos: 0
      };
    }
    datosPorDia[r.fecha].cajas += (Number(r.cajas) || 0);
    const totalPiezas = (Number(r.cajas) || 0) * (Number(r.piezas_por_caja) || Number(r.piezas) || 0) + (Number(r.extras) || 0);
    datosPorDia[r.fecha].piezas += totalPiezas;
    datosPorDia[r.fecha].productos += 1;
    const tiempo = calcularTiempoMinutos(r.hora_solicitud, r.hora_surtido);
    if (tiempo !== null) datosPorDia[r.fecha].tiempos.push(tiempo);
  });

  const graficasPorDia = Object.values(datosPorDia).map(d => ({
    fecha: d.fecha,
    cajas: d.cajas,
    piezas: d.piezas,
    productos: d.productos,
    tiempo_promedio: d.tiempos.length > 0 
      ? Math.round((d.tiempos.reduce((a, b) => a + b, 0) / d.tiempos.length) * 100) / 100
      : 0
  })).sort((a, b) => a.fecha.localeCompare(b.fecha));

  return {
    periodo,
    tipo,
    totales,
    metricasTiempos,
    topProductos,
    productosAgotados,
    productosNoSurtidos,
    cambiosLote,
    listaConsolidada,
    graficasPorDia,
    datosCompletos: datosConTiempo
  };
};

// Exportar Q1 picking
router.get("/reportes/exportar-q1/:mes", async (req, res) => {
  const mes = req.params.mes;

  try {
    const rows = dbHist.prepare(
      `
      SELECT
        h.fecha,
      h.codigo,
      h.nombre,
      COALESCE(r.presentacion, '') AS presentacion,
      h.lote,
        h.cajas,
        COALESCE(h.piezas_por_caja, h.piezas, 0) AS piezas_por_caja,
        h.extras,
        (COALESCE(h.cajas,0) * COALESCE(h.piezas_por_caja, h.piezas, 0)
          + COALESCE(h.extras,0)) AS total,
        h.observaciones,
        h.surtido,
        h.disponible,
        h.hora_solicitud,
        h.hora_surtido,
        COALESCE(r.categoria,'') AS categoria,
        COALESCE(h.origen, 'normal') AS origen
      FROM productos_historico h
      LEFT JOIN productos_ref r ON r.codigo = h.codigo
      WHERE h.fecha BETWEEN ? AND ?
      ORDER BY h.fecha ASC, h.id ASC
    `
    ).all(`${mes}-01`, `${mes}-15`);

    if (!rows.length) {
      return res
        .status(404)
        .json({ error: "No hay registros en Q1" });
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`Q1_${mes}`);

    ws.columns = [
      { key: "codigo", width: 15 },
      { key: "nombre", width: 30 },
      { key: "presentacion", width: 20 },
      { key: "lote", width: 15 },
      { key: "cajas", width: 10 },
      { key: "piezas_por_caja", width: 15 },
      { key: "extras", width: 10 },
      { key: "total", width: 12 },
      { key: "observaciones", width: 25 },
      { key: "surtido", width: 10 },
      { key: "disponible", width: 12 },
      { key: "hora_solicitud", width: 15 },
      { key: "hora_surtido", width: 15 },
      { key: "categoria", width: 18 },
    ];

    let fechaActual = null;

    for (const r of rows) {
      if (r.fecha !== fechaActual) {
        if (fechaActual !== null) ws.addRow([]);
        fechaActual = r.fecha;
        ws.addRow([`Fecha: ${fechaActual}`]);
        ws.addRow([
          "Código",
          "Nombre",
          "Lote",
          "Cajas",
          "Piezas_por_caja",
          "Extras",
          "Total",
          "Observaciones",
          "Surtido",
          "Disponible",
          "Hora Solicitud",
          "Hora Surtido",
          "Categoria",
        ]);
      }

      ws.addRow([
        r.codigo,
        r.nombre,
        r.lote,
        r.cajas,
        r.piezas_por_caja,
        r.extras,
        r.total,
        r.observaciones,
        r.surtido,
        r.disponible,
        r.hora_solicitud,
        r.hora_surtido,
        r.categoria,
      ]);
    }

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Picking_${mes}_Q1.xlsx`
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error Excel Q1:", err);
    res.status(500).json({ error: "Error generando excel" });
  }
});

// Exportar Q2 picking
router.get("/reportes/exportar-q2/:mes", async (req, res) => {
  const mes = req.params.mes;
  const [year, month] = mes.split("-").map(Number);
  const endMonth = dayjs(`${year}-${String(month).padStart(2, "0")}-01`).daysInMonth();

  try {
    const rows = dbHist.prepare(
      `
      SELECT
        h.fecha,
      h.codigo,
      h.nombre,
      COALESCE(r.presentacion, '') AS presentacion,
      h.lote,
        h.cajas,
        COALESCE(h.piezas_por_caja, h.piezas, 0) AS piezas_por_caja,
        h.extras,
        (COALESCE(h.cajas,0) * COALESCE(h.piezas_por_caja, h.piezas, 0)
          + COALESCE(h.extras,0)) AS total,
        h.observaciones,
        h.surtido,
        h.disponible,
        h.hora_solicitud,
        h.hora_surtido,
        COALESCE(r.categoria,'') AS categoria,
        COALESCE(h.origen, 'normal') AS origen
      FROM productos_historico h
      LEFT JOIN productos_ref r ON r.codigo = h.codigo
      WHERE h.fecha BETWEEN ? AND ?
      ORDER BY h.fecha ASC, h.id ASC
    `
    ).all(`${mes}-16`, `${mes}-${String(endMonth).padStart(2, "0")}`);

    if (!rows.length) {
      return res
        .status(404)
        .json({ error: "No hay registros en Q2" });
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`Q2_${mes}`);

    ws.columns = [
      { key: "codigo", width: 15 },
      { key: "nombre", width: 30 },
      { key: "presentacion", width: 20 },
      { key: "lote", width: 15 },
      { key: "cajas", width: 10 },
      { key: "piezas_por_caja", width: 15 },
      { key: "extras", width: 10 },
      { key: "total", width: 12 },
      { key: "observaciones", width: 25 },
      { key: "surtido", width: 10 },
      { key: "disponible", width: 12 },
      { key: "hora_solicitud", width: 15 },
      { key: "hora_surtido", width: 15 },
      { key: "categoria", width: 18 },
    ];

    let fechaActual = null;

    for (const r of rows) {
      if (r.fecha !== fechaActual) {
        if (fechaActual !== null) ws.addRow([]);
        fechaActual = r.fecha;
        ws.addRow([`Fecha: ${fechaActual}`]);
        ws.addRow([
          "Código",
          "Nombre",
          "Lote",
          "Cajas",
          "Piezas_por_caja",
          "Extras",
          "Total",
          "Observaciones",
          "Surtido",
          "Disponible",
          "Hora Solicitud",
          "Hora Surtido",
          "Categoria",
        ]);
      }

      ws.addRow([
        r.codigo,
        r.nombre,
        r.lote,
        r.cajas,
        r.piezas_por_caja,
        r.extras,
        r.total,
        r.observaciones,
        r.surtido,
        r.disponible,
        r.hora_solicitud,
        r.hora_surtido,
        r.categoria,
      ]);
    }

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Picking_${mes}_Q2.xlsx`
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error Excel Q2:", err);
    res.status(500).json({ error: "Error generando excel" });
  }
});

// ============================================================
// REPORTES DETALLADOS (JSON) - Q1, Q2, MES
// ============================================================

// Reporte detallado Q1
router.get("/reportes/detallado-q1/:mes", async (req, res) => {
  const mes = req.params.mes;
  
  try {
    const rows = dbHist.prepare(
      `
      SELECT
        h.fecha,
        h.codigo,
        h.nombre,
        COALESCE(r.presentacion, '') AS presentacion,
        h.lote,
        h.cajas,
        COALESCE(h.piezas_por_caja, h.piezas, 0) AS piezas_por_caja,
        h.extras,
        (COALESCE(h.cajas,0) * COALESCE(h.piezas_por_caja, h.piezas, 0)
          + COALESCE(h.extras,0)) AS total,
        h.observaciones,
        h.surtido,
        h.disponible,
        h.hora_solicitud,
        h.hora_surtido,
        COALESCE(r.categoria,'') AS categoria,
        COALESCE(h.origen, 'normal') AS origen
      FROM productos_historico h
      LEFT JOIN productos_ref r ON r.codigo = h.codigo
      WHERE h.fecha BETWEEN ? AND ?
      ORDER BY h.fecha ASC, h.id ASC
    `
    ).all(`${mes}-01`, `${mes}-15`);

    if (!rows.length) {
      return res.json({
        periodo: `Q1 ${mes}`,
        todo: generarReporteDetallado([], 'todo', `Q1 ${mes}`),
        importacion: generarReporteDetallado([], 'importacion', `Q1 ${mes}`),
        devoluciones: generarReporteDetallado([], 'devoluciones', `Q1 ${mes}`)
      });
    }

    res.json({
      periodo: `Q1 ${mes}`,
      todo: generarReporteDetallado(rows, 'todo', `Q1 ${mes}`),
      importacion: generarReporteDetallado(rows, 'importacion', `Q1 ${mes}`),
      devoluciones: generarReporteDetallado(rows, 'devoluciones', `Q1 ${mes}`)
    });
  } catch (err) {
    console.error("Error reporte detallado Q1:", err);
    res.status(500).json({ error: "Error generando reporte detallado" });
  }
});

// Reporte detallado Q2
router.get("/reportes/detallado-q2/:mes", async (req, res) => {
  const mes = req.params.mes;
  const [year, month] = mes.split("-").map(Number);
  const endMonth = dayjs(`${year}-${String(month).padStart(2, "0")}-01`).daysInMonth();
  
  try {
    const rows = dbHist.prepare(
      `
      SELECT
        h.fecha,
        h.codigo,
        h.nombre,
        COALESCE(r.presentacion, '') AS presentacion,
        h.lote,
        h.cajas,
        COALESCE(h.piezas_por_caja, h.piezas, 0) AS piezas_por_caja,
        h.extras,
        (COALESCE(h.cajas,0) * COALESCE(h.piezas_por_caja, h.piezas, 0)
          + COALESCE(h.extras,0)) AS total,
        h.observaciones,
        h.surtido,
        h.disponible,
        h.hora_solicitud,
        h.hora_surtido,
        COALESCE(r.categoria,'') AS categoria,
        COALESCE(h.origen, 'normal') AS origen
      FROM productos_historico h
      LEFT JOIN productos_ref r ON r.codigo = h.codigo
      WHERE h.fecha BETWEEN ? AND ?
      ORDER BY h.fecha ASC, h.id ASC
    `
    ).all(`${mes}-16`, `${mes}-${String(endMonth).padStart(2, "0")}`);

    if (!rows.length) {
      return res.json({
        periodo: `Q2 ${mes}`,
        todo: generarReporteDetallado([], 'todo', `Q2 ${mes}`),
        importacion: generarReporteDetallado([], 'importacion', `Q2 ${mes}`),
        devoluciones: generarReporteDetallado([], 'devoluciones', `Q2 ${mes}`)
      });
    }

    res.json({
      periodo: `Q2 ${mes}`,
      todo: generarReporteDetallado(rows, 'todo', `Q2 ${mes}`),
      importacion: generarReporteDetallado(rows, 'importacion', `Q2 ${mes}`),
      devoluciones: generarReporteDetallado(rows, 'devoluciones', `Q2 ${mes}`)
    });
  } catch (err) {
    console.error("Error reporte detallado Q2:", err);
    res.status(500).json({ error: "Error generando reporte detallado" });
  }
});

// Reporte detallado MES
router.get("/reportes/detallado-mes/:mes", async (req, res) => {
  const mes = req.params.mes;
  const endDay = dayjs(`${mes}-01`).daysInMonth();
  
  try {
    const rows = dbHist.prepare(
      `
      SELECT
        h.fecha,
        h.codigo,
        h.nombre,
        COALESCE(r.presentacion, '') AS presentacion,
        h.lote,
        h.cajas,
        COALESCE(h.piezas_por_caja, h.piezas, 0) AS piezas_por_caja,
        h.extras,
        (COALESCE(h.cajas,0) * COALESCE(h.piezas_por_caja, h.piezas, 0)
          + COALESCE(h.extras,0)) AS total,
        h.observaciones,
        h.surtido,
        h.disponible,
        h.hora_solicitud,
        h.hora_surtido,
        COALESCE(r.categoria,'') AS categoria,
        COALESCE(h.origen, 'normal') AS origen
      FROM productos_historico h
      LEFT JOIN productos_ref r ON r.codigo = h.codigo
      WHERE h.fecha LIKE ?
      ORDER BY h.fecha ASC, h.id ASC
    `
    ).all(`${mes}%`);

    if (!rows.length) {
      return res.json({
        periodo: `Mes ${mes}`,
        todo: generarReporteDetallado([], 'todo', `Mes ${mes}`),
        importacion: generarReporteDetallado([], 'importacion', `Mes ${mes}`),
        devoluciones: generarReporteDetallado([], 'devoluciones', `Mes ${mes}`)
      });
    }

    res.json({
      periodo: `Mes ${mes}`,
      todo: generarReporteDetallado(rows, 'todo', `Mes ${mes}`),
      importacion: generarReporteDetallado(rows, 'importacion', `Mes ${mes}`),
      devoluciones: generarReporteDetallado(rows, 'devoluciones', `Mes ${mes}`)
    });
  } catch (err) {
    console.error("Error reporte detallado Mes:", err);
    res.status(500).json({ error: "Error generando reporte detallado" });
  }
});

/* ============================================================
   2. REPORTES DEVOLUCIONES (devoluciones_historico)
   ============================================================ */

router.get("/reportes-devoluciones/preview", (req, res) => {
  try {
    const { tipo, mes, quincena } = req.query;
    if (!tipo || !mes) {
      return res.status(400).json({ error: "Faltan parámetros" });
    }

    let desde, hasta, titulo;

    if (tipo === "quincenal") {
      if (!quincena) {
        return res.status(400).json({ error: "Falta quincena" });
      }

      const [year, month] = mes.split("-").map(Number);
      const endOfMonth = dayjs(
        `${year}-${String(month).padStart(2, "0")}-01`
      ).daysInMonth();
      const startDay = quincena === "1" ? 1 : 16;
      const endDay = quincena === "1" ? 15 : endOfMonth;

      desde = `${mes}-${String(startDay).padStart(2, "0")}`;
      hasta = `${mes}-${String(endDay).padStart(2, "0")}`;
      titulo = `Devoluciones ${mes} del ${String(startDay).padStart(
        2,
        "0"
      )} al ${String(endDay).padStart(2, "0")}`;
    } else {
      const endDay = dayjs(`${mes}-01`).daysInMonth();
      desde = `${mes}-01`;
      hasta = `${mes}-${String(endDay).padStart(2, "0")}`;
      titulo = `Devoluciones ${mes} (Mensual)`;
    }

    // Obtener solo las tablas que existen
    const tablasExistentes = getTablasExistentes();
    
    if (tablasExistentes.length === 0) {
      return res.json({ titulo, total_filas: 0, filas: [] });
    }
    
    const queries = tablasExistentes.map((tabla) => {
      return `
        SELECT codigo,nombre,lote,cantidad,fecha,hora_ultima
        FROM ${tabla}
        WHERE fecha BETWEEN ? AND ?
      `;
    }).join(" UNION ALL ");
    
    const finalQuery = `
      ${queries}
      ORDER BY fecha ASC, id ASC
    `;
    
    const params = Array(tablasExistentes.length * 2).fill(null).map((_, i) => i % 2 === 0 ? desde : hasta);
    const rows = dbHist.prepare(finalQuery).all(...params);

    res.json({
      titulo,
      total_filas: rows.length,
      filas: rows.slice(0, 200),
    });
  } catch (err) {
    console.error("Error /reportes-devoluciones/preview:", err);
    res.status(500).json({ error: "Error generando vista previa" });
  }
});

router.get("/reportes-devoluciones/quincenal", async (req, res) => {
  try {
    const { mes, quincena } = req.query;
    if (!mes || !quincena) {
      return res
        .status(400)
        .json({ error: "Faltan parámetros mes/quincena" });
    }

    const [year, month] = mes.split("-").map(Number);
    const endOfMonth = dayjs(
      `${year}-${String(month).padStart(2, "0")}-01`
    ).daysInMonth();
    const startDay = quincena === "1" ? 1 : 16;
    const endDay = quincena === "1" ? 15 : endOfMonth;

    const desde = `${mes}-${String(startDay).padStart(2, "0")}`;
    const hasta = `${mes}-${String(endDay).padStart(2, "0")}`;

    // Obtener solo las tablas que existen
    const tablasExistentes = getTablasExistentes();
    
    if (tablasExistentes.length === 0) {
      return res.json({ titulo, total_filas: 0, filas: [] });
    }
    
    const queries = tablasExistentes.map((tabla) => {
      return `
        SELECT codigo,nombre,lote,cantidad,fecha,hora_ultima
        FROM ${tabla}
        WHERE fecha BETWEEN ? AND ?
      `;
    }).join(" UNION ALL ");
    
    const finalQuery = `
      ${queries}
      ORDER BY fecha ASC, id ASC
    `;
    
    const params = Array(tablasExistentes.length * 2).fill(null).map((_, i) => i % 2 === 0 ? desde : hasta);
    const rows = dbHist.prepare(finalQuery).all(...params);

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet(`Q${quincena} ${mes}`);

    sheet.columns = [
      { header: "Código", key: "codigo" },
      { header: "Nombre", key: "nombre" },
      { header: "Presentación", key: "presentacion" },
      { header: "Lote", key: "lote" },
      { header: "Cantidad", key: "cantidad" },
      { header: "Fecha", key: "fecha" },
      { header: "Hora Última", key: "hora_ultima" },
    ];

    sheet.addRows(rows);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Devoluciones_${mes}_Q${quincena}.xlsx`
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error Excel quincenal devoluciones:", err);
    res.status(500).json({ error: "Error generando excel" });
  }
});

router.get("/reportes-devoluciones/mensual", async (req, res) => {
  try {
    const { mes } = req.query;
    if (!mes) {
      return res.status(400).json({ error: "Falta parámetro mes" });
    }

    const endDay = dayjs(`${mes}-01`).daysInMonth();
    const desde = `${mes}-01`;
    const hasta = `${mes}-${String(endDay).padStart(2, "0")}`;

    // Obtener solo las tablas que existen
    const tablasExistentes = getTablasExistentes();
    
    if (tablasExistentes.length === 0) {
      return res.json({ titulo, total_filas: 0, filas: [] });
    }
    
    const queries = tablasExistentes.map((tabla) => {
      return `
        SELECT codigo,nombre,lote,cantidad,fecha,hora_ultima
        FROM ${tabla}
        WHERE fecha BETWEEN ? AND ?
      `;
    }).join(" UNION ALL ");
    
    const finalQuery = `
      ${queries}
      ORDER BY fecha ASC, id ASC
    `;
    
    const params = Array(tablasExistentes.length * 2).fill(null).map((_, i) => i % 2 === 0 ? desde : hasta);
    const rows = dbHist.prepare(finalQuery).all(...params);

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet(`Mensual ${mes}`);

    sheet.columns = [
      { header: "Código", key: "codigo" },
      { header: "Nombre", key: "nombre" },
      { header: "Presentación", key: "presentacion" },
      { header: "Lote", key: "lote" },
      { header: "Cantidad", key: "cantidad" },
      { header: "Fecha", key: "fecha" },
      { header: "Hora Última", key: "hora_ultima" },
    ];

    sheet.addRows(rows);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Devoluciones_${mes}_Mensual.xlsx`
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error Excel mensual devoluciones:", err);
    res.status(500).json({ error: "Error generando excel" });
  }
});

router.delete("/reportes-devoluciones/dia/:fecha", (req, res) => {
  const info = dbHist
    .prepare("DELETE FROM devoluciones_historico WHERE fecha=?")
    .run(req.params.fecha);

  // Emitir evento de socket para sincronización en tiempo real
  getIO().emit("reportes_actualizados");

  res.json({
    success: true,
    eliminados: info.changes,
    mensaje: `Día ${req.params.fecha} eliminado`,
  });
});

router.put("/reportes-devoluciones/mover-dia", (req, res) => {
  const { fecha_original, nueva_fecha } = req.body || {};
  if (!fecha_original || !nueva_fecha) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  const existe = dbHist
    .prepare(
      "SELECT 1 FROM devoluciones_historico WHERE fecha=? LIMIT 1"
    )
    .get(nueva_fecha);

  if (existe) {
    return res.status(409).json({
      error: `Ya existe un reporte en ${nueva_fecha}. Elige otra fecha.`,
    });
  }

  const info = dbHist
    .prepare(
      "UPDATE devoluciones_historico SET fecha=? WHERE fecha=?"
    )
    .run(nueva_fecha, fecha_original);

  // Emitir evento de socket para sincronización en tiempo real
  getIO().emit("reportes_actualizados");

  res.json({
    success: true,
    modificados: info.changes,
    mensaje: `Reporte movido de ${fecha_original} a ${nueva_fecha}`,
  });
});

/* ============================================================
   2.B SISTEMA DINÁMICO POR TIPO (DEVOLUCIONES TABS)
   ============================================================ */

const DEV_TIPOS_HIST = {
  clientes: "devoluciones_clientes_hist",
  calidad: "devoluciones_calidad_hist",
  reacondicionados: "devoluciones_reacondicionados_hist",
  retail: "devoluciones_retail_hist",
  cubbo: "devoluciones_cubbo_hist",
  regulatorio: "devoluciones_regulatorio_hist",
};

// Función para verificar si una tabla existe
function tableExists(db, tableName) {
  try {
    const result = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name=?
    `).get(tableName);
    return !!result;
  } catch {
    return false;
  }
}

// Función para obtener solo las tablas que existen
function getTablasExistentes() {
  const todasLasTablas = [
    "devoluciones_historico", // Tabla antigua genérica
    ...Object.values(DEV_TIPOS_HIST) // Tablas nuevas específicas
  ];
  
  const existentes = todasLasTablas.filter(tabla => {
    const existe = tableExists(dbHist, tabla);
    if (existe) {
      // Verificar si tiene datos
      try {
        const count = dbHist.prepare(`SELECT COUNT(*) as count FROM ${tabla}`).get();
      } catch (e) {
        console.warn(`⚠️ Error contando registros en ${tabla}:`, e.message);
      }
    }
    return existe;
  });
  
  return existentes;
}

// Función helper para consultar todas las tablas históricas de devoluciones
function consultarTodasDevolucionesHist(queryBase, params = []) {
  const todasLasTablas = Object.values(DEV_TIPOS_HIST);
  const queries = todasLasTablas.map((tabla) => {
    return queryBase.replace("{{TABLA}}", tabla);
  }).join(" UNION ALL ");
  
  // Si hay parámetros, repetirlos para cada tabla
  const paramsRepetidos = todasLasTablas.flatMap(() => params);
  return { query: queries, params: paramsRepetidos };
}

function tablaDev(tipo) {
  const tabla = DEV_TIPOS_HIST[tipo];
  if (!tabla) return null;

  dbHist
    .prepare(
      `
      CREATE TABLE IF NOT EXISTS ${tabla} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT,
        nombre TEXT,
        lote TEXT,
        cantidad INTEGER,
        fecha TEXT,
        hora_ultima TEXT
      )
    `
    )
    .run();

  return tabla;
}

// ⚠️ IMPORTANTE: Estas rutas específicas deben ir ANTES de las rutas genéricas /:tipo/*
// para que no sean capturadas por rutas más genéricas

// GET: Obtener fotos de un pedido histórico
router.get("/reportes-devoluciones/pedidos/:id/fotos", (req, res) => {
  try {
    const { id } = req.params;
    
    // Buscar el pedido en el histórico para obtener el número de pedido
    const pedidoHist = dbHist.prepare(`
      SELECT pedido, fecha_cierre 
      FROM devoluciones_pedidos_hist 
      WHERE id = ?
    `).get(id);
    
    if (!pedidoHist) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }
    
    // Buscar fotos en el histórico primero
    let fotos = [];
    
    try {
      // Primero intentar buscar en la tabla principal (si el pedido aún existe)
      const pedidoOriginal = dbDevol.prepare(`
        SELECT id FROM devoluciones_pedidos 
        WHERE pedido = ? 
        LIMIT 1
      `).get(pedidoHist.pedido);
      
      if (pedidoOriginal) {
        // Pedido aún existe, buscar fotos en tabla principal
        const fotosRows = dbDevol.prepare(`
          SELECT * FROM devoluciones_fotos 
          WHERE devolucion_id = ?
          ORDER BY id DESC
        `).all(pedidoOriginal.id);
        
        fotos = fotosRows.map(foto => {
          const url = `${req.protocol}://${req.get("host")}/uploads/devoluciones/${foto.path}`;
          return {
            ...foto,
            url: url
          };
        });
      } else {
        // Pedido ya no existe, buscar fotos en histórico
        const fotosHistExiste = dbHist.prepare(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name='devoluciones_fotos_hist'
        `).get();
        
        if (fotosHistExiste) {
          const fotosRows = dbHist.prepare(`
            SELECT * FROM devoluciones_fotos_hist 
            WHERE pedido = ? AND fecha_cierre = ?
            ORDER BY id DESC
          `).all(pedidoHist.pedido, pedidoHist.fecha_cierre);
          
          
          fotos = fotosRows.map(foto => {
            // El path en el histórico es solo el nombre del archivo
            // Las fotos se guardan directamente en uploads/devoluciones/{filename}
            const url = `${req.protocol}://${req.get("host")}/uploads/devoluciones/${foto.path}`;
            return {
              ...foto,
              url: url
            };
          });
        } else {
        }
      }
    } catch (e) {
      console.warn("⚠️ Error obteniendo fotos:", e.message);
    }
    
    res.json(fotos);
  } catch (err) {
    console.error("❌ Error obteniendo fotos del pedido histórico:", err);
    res.status(500).json({ error: "Error obteniendo fotos" });
  }
});

// GET: Obtener productos de un pedido histórico
router.get("/reportes-devoluciones/pedidos/:id/productos", (req, res) => {
  try {
    const { id } = req.params;
    
    // Buscar el pedido en el histórico
    const pedidoHist = dbHist.prepare(`
      SELECT pedido, fecha_cierre, area
      FROM devoluciones_pedidos_hist 
      WHERE id = ?
    `).get(id);
    
    if (!pedidoHist) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }
    
    // Buscar productos en la tabla histórica correspondiente usando el pedido
    const tabla = tablaDev(pedidoHist.area?.toLowerCase() || "clientes");
    if (!tabla) {
      return res.status(400).json({ error: "Tipo inválido" });
    }
    
    // Buscar productos que pertenecen a este pedido (usando el campo pedido)
    const productos = dbHist.prepare(`
      SELECT 
        id,
        codigo,
        nombre,
        lote,
        cantidad,
        caducidad,
        COALESCE(activo, 1) AS activo,
        COALESCE(apto, 1) AS apto,
        pedido,
        devolucion_id
      FROM ${tabla}
      WHERE pedido = ? AND COALESCE(fecha_cierre, fecha) = ?
      ORDER BY id ASC
    `).all(pedidoHist.pedido, pedidoHist.fecha_cierre);
    
    res.json(productos);
  } catch (err) {
    console.error("❌ Error obteniendo productos del pedido histórico:", err);
    res.status(500).json({ error: "Error obteniendo productos" });
  }
});

router.get("/reportes-devoluciones/:tipo/dias", (req, res) => {
  const tipo = req.params.tipo;
  
  // Para calidad, usar estructura nueva
  if (tipo === "calidad") {
    try {
      const productos = dbHist.prepare(
        `
        SELECT COALESCE(fecha_cierre, fecha) AS fecha,
               COUNT(*) AS total_productos,
               SUM(COALESCE(cantidad,0)) AS total_piezas
        FROM devoluciones_calidad_hist
        GROUP BY COALESCE(fecha_cierre, fecha)
        ORDER BY COALESCE(fecha_cierre, fecha) ASC
      `
      ).all();
      
      return res.json(productos);
    } catch (err) {
      console.error("❌ Error obteniendo días de calidad:", err);
      return res.status(500).json({ error: "Error obteniendo días de calidad", details: err.message });
    }
  }
  
  // Para otras áreas, usar estructura original
  const tabla = tablaDev(tipo);
  
  if (!tabla) {
    console.error(`❌ Tipo inválido: ${tipo}`);
    return res
      .status(400)
      .json({ error: `Tipo de devolución inválido: ${tipo}` });
  }

  try {
    // Consultar tabla nueva
    let productos = [];
    try {
      productos = dbHist.prepare(
        `
        SELECT COALESCE(fecha_cierre, fecha) AS fecha,
               COUNT(*) AS total_productos,
               SUM(COALESCE(cantidad,0)) AS total_piezas
        FROM ${tabla}
        GROUP BY COALESCE(fecha_cierre, fecha)
        ORDER BY COALESCE(fecha_cierre, fecha) ASC
      `
      ).all();
    } catch (err) {
      console.warn(`⚠️ Error consultando tabla ${tabla}:`, err.message);
      productos = [];
    }
    
    // Para clientes, también consultar tabla antigua devoluciones_historico (solo si es clientes)
    // Para otros tipos, NO consultar tabla antigua para evitar mezclar datos
    let productosAntiguos = [];
    if (tipo === "clientes") {
      try {
        const tablaAntiguaExiste = dbHist.prepare(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name='devoluciones_historico'
        `).get();
        
        if (tablaAntiguaExiste) {
          productosAntiguos = dbHist.prepare(
            `
            SELECT fecha AS fecha,
                   COUNT(*) AS total_productos,
                   SUM(COALESCE(cantidad,0)) AS total_piezas
            FROM devoluciones_historico
            GROUP BY fecha
            ORDER BY fecha ASC
          `
          ).all();
        }
      } catch (err) {
        console.warn(`⚠️ Error consultando tabla antigua devoluciones_historico:`, err.message);
        productosAntiguos = [];
      }
    }
    
    // Combinar datos solo si hay productos antiguos (solo para clientes)
    const productosPorFecha = {};
    
    // Agregar datos de tabla nueva
    productos.forEach(p => {
      productosPorFecha[p.fecha] = {
        fecha: p.fecha,
        total_productos: (productosPorFecha[p.fecha]?.total_productos || 0) + (p.total_productos || 0),
        total_piezas: (productosPorFecha[p.fecha]?.total_piezas || 0) + (p.total_piezas || 0)
      };
    });
    
    // Agregar datos de tabla antigua SOLO para clientes
    if (tipo === "clientes" && productosAntiguos.length > 0) {
      productosAntiguos.forEach(p => {
        productosPorFecha[p.fecha] = {
          fecha: p.fecha,
          total_productos: (productosPorFecha[p.fecha]?.total_productos || 0) + (p.total_productos || 0),
          total_piezas: (productosPorFecha[p.fecha]?.total_piezas || 0) + (p.total_piezas || 0)
        };
      });
    }
    
    // Convertir a array y ordenar
    productos = Object.values(productosPorFecha).sort((a, b) => a.fecha.localeCompare(b.fecha));

    // Obtener pedidos solo para Clientes
    let pedidosPorFecha = {};
    if (tipo === "clientes") {
      try {
        const pedidosExiste = dbHist.prepare(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name='devoluciones_pedidos_hist'
        `).get();
        
        if (pedidosExiste) {
          // Contar pedidos ÚNICOS por fecha (usando DISTINCT pedido)
          const pedidos = dbHist.prepare(`
            SELECT fecha_cierre AS fecha,
                   COUNT(DISTINCT pedido) AS total_pedidos
            FROM devoluciones_pedidos_hist
            WHERE area = 'Clientes' AND fecha_cierre IS NOT NULL
            GROUP BY fecha_cierre
          `).all();
          
          pedidos.forEach(p => {
            pedidosPorFecha[p.fecha] = p.total_pedidos;
          });
        }
      } catch (e) {
        console.warn("⚠️ No se pudieron obtener pedidos:", e.message);
      }
    }

    // Combinar productos con pedidos
    const rows = productos.map(p => ({
      ...p,
      total_pedidos: pedidosPorFecha[p.fecha] || 0
    }));

    res.json(rows);
  } catch (err) {
    console.error(`❌ Error consultando tabla ${tabla}:`, err);
    return res.status(500).json({ error: `Error consultando tabla ${tabla}`, details: err.message });
  }
});

router.get("/reportes-devoluciones/:tipo/dia/:fecha", (req, res) => {
  const tipo = req.params.tipo;
  const fecha = req.params.fecha;
  const areaFiltro = req.query.area; // Filtro opcional por área para calidad
  
  // Para calidad, usar estructura nueva
  if (tipo === "calidad") {
    try {
      let query = `
        SELECT 
          id,
          area,
          fecha,
          pedido,
          codigo,
          producto,
          presentacion,
          cantidad,
          lote,
          caducidad,
          laboratorio,
          clasificacion_etiqueta,
          defecto,
          recibido_calidad,
          destino,
          comentarios_calidad,
          evidencias,
          fecha_cierre,
          created_at,
          updated_at
        FROM devoluciones_calidad_hist
        WHERE COALESCE(fecha_cierre, fecha) = ?
      `;
      
      const params = [fecha];
      
      // Si hay filtro por área, agregarlo
      if (areaFiltro) {
        query += ` AND area = ?`;
        params.push(areaFiltro);
      }
      
      query += ` ORDER BY id ASC`;
      
      const productos = dbHist.prepare(query).all(...params);
      
      // Parsear evidencias si es JSON string
      const productosConEvidencias = productos.map(p => {
        let evidenciasParsed = [];
        if (p.evidencias) {
          try {
            evidenciasParsed = typeof p.evidencias === 'string' 
              ? JSON.parse(p.evidencias) 
              : p.evidencias;
          } catch (e) {
            // Si no es JSON válido, tratar como string simple
            evidenciasParsed = [p.evidencias];
          }
        }
        return {
          ...p,
          evidencias: evidenciasParsed
        };
      });
      
      return res.json({ productos: productosConEvidencias, pedidos: [] });
    } catch (err) {
      console.error("❌ Error obteniendo reporte de calidad:", err);
      return res.status(500).json({ error: "Error obteniendo reporte de calidad" });
    }
  }
  
  // Para otras áreas, usar estructura original
  const tabla = tablaDev(tipo);
  if (!tabla) {
    return res.status(400).json({ error: "Tipo inválido" });
  }

  // Consultar tabla nueva - incluir TODOS los campos incluyendo evidencias
  let productos = [];
  try {
    // Verificar si la tabla tiene columna evidencias
    const tableInfo = dbHist.prepare(`PRAGMA table_info(${tabla})`).all();
    const hasEvidencias = tableInfo.some(col => col.name === 'evidencias');
    const hasPresentacion = tableInfo.some(col => col.name === 'presentacion');
    
    let query = `
      SELECT 
        id,
        codigo,
        nombre,
        ${hasPresentacion ? 'presentacion,' : "'' AS presentacion,"}
        lote,
        cantidad,
        COALESCE(fecha_cierre, fecha) AS fecha,
        hora_ultima,
        COALESCE(activo,1) AS activo,
        COALESCE(caducidad,'') AS caducidad,
        COALESCE(pedido,'') AS pedido,
        COALESCE(guia,'') AS guia,
        COALESCE(paqueteria,'') AS paqueteria,
        COALESCE(motivo,'') AS motivo,
        COALESCE(area,'') AS area,
        COALESCE(usuario,'') AS usuario,
        ${hasEvidencias ? 'evidencias,' : "'' AS evidencias,"}
        devolucion_id
      FROM ${tabla}
      WHERE COALESCE(fecha_cierre, fecha)=?
      ORDER BY id ASC
    `;
    
    productos = dbHist.prepare(query).all(fecha);
    
    // Parsear evidencias si existen
    productos = productos.map(p => {
      if (p.evidencias) {
        try {
          p.evidencias = typeof p.evidencias === 'string' 
            ? JSON.parse(p.evidencias) 
            : p.evidencias;
        } catch (e) {
          p.evidencias = [];
        }
      } else {
        p.evidencias = [];
      }
      return p;
    });
  } catch (err) {
    console.warn(`⚠️ Error consultando tabla ${tabla}:`, err.message);
    productos = [];
  }
  
  // Para clientes, también consultar tabla antigua devoluciones_historico (solo si es clientes)
  // Para otros tipos, NO consultar tabla antigua para evitar mezclar datos
  let productosAntiguos = [];
  if (tipo === "clientes") {
    try {
      const tablaAntiguaExiste = dbHist.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='devoluciones_historico'
      `).get();
      
      if (tablaAntiguaExiste) {
        productosAntiguos = dbHist.prepare(
          `
          SELECT 
            id,
            codigo,
            nombre,
            lote,
            cantidad,
            fecha,
            hora_ultima,
            1 AS activo,
            '' AS caducidad,
            '' AS pedido,
            '' AS guia,
            '' AS paqueteria,
            '' AS motivo,
            '' AS area,
            '' AS usuario,
            NULL AS devolucion_id
          FROM devoluciones_historico
          WHERE fecha=?
          ORDER BY id ASC
        `
        ).all(fecha);
      }
    } catch (err) {
      console.warn(`⚠️ Error consultando tabla antigua devoluciones_historico:`, err.message);
      productosAntiguos = [];
    }
  }
  
  // Combinar productos SOLO si hay productos antiguos (solo para clientes)
  if (tipo === "clientes" && productosAntiguos.length > 0) {
    productos = [...productos, ...productosAntiguos];
  }
  
  // Para calidad, el área viene del campo 'area' de cada producto
  // Para otras áreas, el área es el nombre del área (Clientes, Retail, etc.)

  // Obtener pedidos solo para Clientes
  let pedidos = [];
  if (tipo === "clientes") {
    try {
      const pedidosExiste = dbHist.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='devoluciones_pedidos_hist'
      `).get();
      
      if (pedidosExiste) {
        pedidos = dbHist.prepare(`
          SELECT 
            id,
            pedido,
            guia,
            paqueteria,
            motivo,
            area,
            usuario,
            fecha,
            fecha_cierre
          FROM devoluciones_pedidos_hist
          WHERE area = 'Clientes' AND fecha_cierre = ?
          ORDER BY id ASC
        `).all(fecha);
      }
    } catch (e) {
      console.warn("⚠️ No se pudieron obtener pedidos históricos:", e.message);
    }
  }

  res.json({ productos, pedidos });
});

router.get("/reportes-devoluciones/:tipo/:fecha/export", async (req, res) => {
  const tipo = req.params.tipo;
  const fecha = req.params.fecha;
  const areaFiltro = req.query.area; // Filtro opcional por área para calidad
  
  // Para calidad, usar estructura nueva
  if (tipo === "calidad") {
    try {
      let query = `
        SELECT 
          area,
          fecha,
          pedido,
          codigo,
          producto,
          presentacion,
          cantidad,
          lote,
          caducidad,
          laboratorio,
          clasificacion_etiqueta,
          defecto,
          recibido_calidad,
          destino,
          comentarios_calidad,
          evidencias
        FROM devoluciones_calidad_hist
        WHERE COALESCE(fecha_cierre, fecha) = ?
      `;
      
      const params = [fecha];
      
      // Si hay filtro por área, agregarlo
      if (areaFiltro) {
        query += ` AND area = ?`;
        params.push(areaFiltro);
      }
      
      query += ` ORDER BY id ASC`;
      
      const rows = dbHist.prepare(query).all(...params);
      
      if (!rows.length) {
        return res.status(404).json({ error: "Sin datos para esa fecha" });
      }
      
      const wb = new ExcelJS.Workbook();
      const sheet = wb.addWorksheet(`Control de Calidad ${fecha}`);
      
      sheet.columns = [
        { header: "Área", key: "area", width: 15 },
        { header: "Fecha", key: "fecha", width: 12 },
        { header: "Pedido", key: "pedido", width: 15 },
        { header: "Código", key: "codigo", width: 15 },
        { header: "Producto", key: "producto", width: 30 },
        { header: "Presentación", key: "presentacion", width: 20 },
        { header: "Cantidad", key: "cantidad", width: 10 },
        { header: "Lote", key: "lote", width: 15 },
        { header: "Caducidad", key: "caducidad", width: 12 },
        { header: "Laboratorio", key: "laboratorio", width: 20 },
        { header: "Clasificación de Etiqueta", key: "clasificacion_etiqueta", width: 25 },
        { header: "Defecto", key: "defecto", width: 20 },
        { header: "Recibido por Calidad", key: "recibido_calidad", width: 20 },
        { header: "Destino", key: "destino", width: 15 },
        { header: "Comentarios Calidad", key: "comentarios_calidad", width: 30 },
        { header: "Evidencias", key: "evidencias", width: 30 }
      ];
      
      // Procesar evidencias para mostrar en Excel
      const rowsProcessed = rows.map(row => ({
        ...row,
        recibido_calidad: row.recibido_calidad ? "Sí" : "No",
        evidencias: row.evidencias ? (typeof row.evidencias === 'string' ? row.evidencias : JSON.stringify(row.evidencias)) : ""
      }));
      
      sheet.addRows(rowsProcessed);
      
      const filename = areaFiltro 
        ? `Control_Calidad_${areaFiltro}_${fecha}.xlsx`
        : `Control_Calidad_${fecha}.xlsx`;
      
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
      await wb.xlsx.write(res);
      res.end();
      return;
    } catch (err) {
      console.error("❌ Error exportando reporte de calidad:", err);
      return res.status(500).json({ error: "Error exportando reporte de calidad" });
    }
  }
  
  // Para otras áreas, usar estructura original
  const tabla = tablaDev(tipo);
  if (!tabla) {
    return res.status(400).json({ error: "Tipo inválido" });
  }

  // Verificar qué columnas tiene la tabla
  const tableInfo = dbHist.prepare(`PRAGMA table_info(${tabla})`).all();
  const hasEvidencias = tableInfo.some(col => col.name === 'evidencias');
  const hasPresentacion = tableInfo.some(col => col.name === 'presentacion');
  const hasPedido = tableInfo.some(col => col.name === 'pedido');
  const hasGuia = tableInfo.some(col => col.name === 'guia');
  const hasPaqueteria = tableInfo.some(col => col.name === 'paqueteria');
  const hasMotivo = tableInfo.some(col => col.name === 'motivo');
  const hasCaducidad = tableInfo.some(col => col.name === 'caducidad');
  
  let query = `
    SELECT 
      codigo, 
      nombre, 
      ${hasPresentacion ? 'presentacion,' : "'' AS presentacion,"}
      lote, 
      cantidad, 
      hora_ultima,
      ${hasPedido ? 'pedido,' : "'' AS pedido,"}
      ${hasGuia ? 'guia,' : "'' AS guia,"}
      ${hasPaqueteria ? 'paqueteria,' : "'' AS paqueteria,"}
      ${hasMotivo ? 'motivo,' : "'' AS motivo,"}
      ${hasCaducidad ? 'caducidad,' : "'' AS caducidad,"}
      ${hasEvidencias ? 'evidencias' : "'' AS evidencias"}
    FROM ${tabla}
    WHERE COALESCE(fecha_cierre, fecha) = ?
    ORDER BY id ASC
  `;
  
  const rows = dbHist.prepare(query).all(fecha);

  if (!rows.length) {
    return res
      .status(404)
      .json({ error: "Sin datos para esa fecha" });
  }

  // Procesar evidencias para Excel
  const rowsProcessed = rows.map(row => {
    let evidenciasStr = "";
    if (row.evidencias) {
      try {
        const evidencias = typeof row.evidencias === 'string' 
          ? JSON.parse(row.evidencias) 
          : row.evidencias;
        if (Array.isArray(evidencias)) {
          evidenciasStr = evidencias.map(ev => {
            const path = typeof ev === 'string' ? ev : (ev.path || ev.url || ev);
            return path;
          }).join("; ");
        } else if (typeof evidencias === 'string') {
          evidenciasStr = evidencias;
        }
      } catch (e) {
        evidenciasStr = row.evidencias || "";
      }
    }
    return {
      ...row,
      evidencias: evidenciasStr
    };
  });

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(`Devoluciones ${tipo} ${fecha}`);

  const columns = [
    { header: "Código", key: "codigo", width: 15 },
    { header: "Nombre", key: "nombre", width: 30 },
    { header: "Presentación", key: "presentacion", width: 20 },
    { header: "Lote", key: "lote", width: 15 },
    { header: "Cantidad", key: "cantidad", width: 10 },
    { header: "Hora Última", key: "hora_ultima", width: 15 },
  ];
  
  // Agregar columnas opcionales si existen
  if (hasPedido) columns.push({ header: "Pedido", key: "pedido", width: 15 });
  if (hasGuia) columns.push({ header: "Guía", key: "guia", width: 15 });
  if (hasPaqueteria) columns.push({ header: "Paquetería", key: "paqueteria", width: 15 });
  if (hasMotivo) columns.push({ header: "Motivo", key: "motivo", width: 20 });
  if (hasCaducidad) columns.push({ header: "Caducidad", key: "caducidad", width: 12 });
  if (hasEvidencias) columns.push({ header: "Evidencias", key: "evidencias", width: 50 });
  
  sheet.columns = columns;
  sheet.addRows(rowsProcessed);

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=Devoluciones_${tipo}_${fecha}.xlsx`
  );
  await wb.xlsx.write(res);
  res.end();
});

router.get("/reportes-devoluciones/:tipo/quincenal", (req, res) => {
  const tabla = tablaDev(req.params.tipo);
  if (!tabla) {
    return res.status(400).json({ error: "Tipo inválido" });
  }

  const { mes, quincena } = req.query;
  if (!mes || !quincena) {
    return res
      .status(400)
      .json({ error: "Parámetros faltantes" });
  }

  const endMonth = dayjs(`${mes}-01`).daysInMonth();
  const desde = `${mes}-${quincena === "1" ? "01" : "16"}`;
  const hasta = `${mes}-${
    quincena === "1" ? "15" : String(endMonth).padStart(2, "0")
  }`;

  const rows = dbHist.prepare(
    `
    SELECT codigo,nombre,lote,cantidad,fecha,hora_ultima
    FROM ${tabla}
    WHERE fecha BETWEEN ? AND ?
    ORDER BY fecha ASC, id ASC
  `
  ).all(desde, hasta);

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(`Q${quincena} ${mes}`);

  sheet.columns = [
    { header: "Código", key: "codigo" },
    { header: "Nombre", key: "nombre" },
    { header: "Lote", key: "lote" },
    { header: "Cantidad", key: "cantidad" },
    { header: "Fecha", key: "fecha" },
    { header: "Hora Última", key: "hora_ultima" },
  ];

  sheet.addRows(rows);

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=Dev_${req.params.tipo}_${mes}_Q${quincena}.xlsx`
  );
  wb.xlsx.write(res).then(() => res.end());
});

router.get("/reportes-devoluciones/:tipo/mensual", (req, res) => {
  const tabla = tablaDev(req.params.tipo);
  if (!tabla) {
    return res.status(400).json({ error: "Tipo inválido" });
  }

  const { mes } = req.query;
  if (!mes) {
    return res.status(400).json({ error: "Falta mes" });
  }

  const endMonth = dayjs(`${mes}-01`).daysInMonth();
  const desde = `${mes}-01`;
  const hasta = `${mes}-${String(endMonth).padStart(2, "0")}`;

  const rows = dbHist.prepare(
    `
    SELECT codigo,nombre,lote,cantidad,fecha,hora_ultima
    FROM ${tabla}
    WHERE fecha BETWEEN ? AND ?
    ORDER BY fecha ASC, id ASC
  `
  ).all(desde, hasta);

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(`Mensual ${mes}`);

  sheet.columns = [
    { header: "Código", key: "codigo" },
    { header: "Nombre", key: "nombre" },
    { header: "Lote", key: "lote" },
    { header: "Cantidad", key: "cantidad" },
    { header: "Fecha", key: "fecha" },
    { header: "Hora Última", key: "hora_ultima" },
  ];

  sheet.addRows(rows);

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=Dev_${req.params.tipo}_${mes}.xlsx`
  );
  wb.xlsx.write(res).then(() => res.end());
});

router.delete("/reportes-devoluciones/:tipo/dia/:fecha", (req, res) => {
  const tabla = tablaDev(req.params.tipo);
  if (!tabla) {
    return res.status(400).json({ error: "Tipo inválido" });
  }

  // Eliminar usando fecha_cierre si existe, sino usar fecha
  const info = dbHist
    .prepare(`DELETE FROM ${tabla} WHERE COALESCE(fecha_cierre, fecha)=?`)
    .run(req.params.fecha);

  // Emitir evento de socket para sincronización en tiempo real
  getIO().emit("reportes_actualizados");

  res.json({
    success: true,
    eliminados: info.changes,
    mensaje: `Eliminado día ${req.params.fecha} (${req.params.tipo})`,
  });
});

router.put("/reportes-devoluciones/:tipo/mover-dia", (req, res) => {
  const tabla = tablaDev(req.params.tipo);
  if (!tabla) {
    return res.status(400).json({ error: "Tipo inválido" });
  }

  const { fecha_original, nueva_fecha } = req.body || {};
  if (!fecha_original || !nueva_fecha) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  const existe = dbHist
    .prepare(`SELECT 1 FROM ${tabla} WHERE COALESCE(fecha_cierre, fecha)=? LIMIT 1`)
    .get(nueva_fecha);

  if (existe) {
    return res.status(409).json({
      error: `Ya existe un reporte en ${nueva_fecha}.`,
    });
  }

  // Actualizar fecha_cierre si existe, sino actualizar fecha
  const info1 = dbHist
    .prepare(`UPDATE ${tabla} SET fecha_cierre=? WHERE fecha_cierre=?`)
    .run(nueva_fecha, fecha_original);
  
  const info2 = dbHist
    .prepare(`UPDATE ${tabla} SET fecha=? WHERE fecha=? AND fecha_cierre IS NULL`)
    .run(nueva_fecha, fecha_original);
  
  const totalModificados = info1.changes + info2.changes;

  // Si es tipo "clientes", también actualizar los pedidos históricos
  let pedidosActualizados = 0;
  if (req.params.tipo === "clientes") {
    try {
      const tableExists = dbHist.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='devoluciones_pedidos_hist'
      `).get();
      
      if (tableExists) {
        // Actualizar fecha_cierre de pedidos si existe
        const infoPedidos1 = dbHist
          .prepare(`UPDATE devoluciones_pedidos_hist SET fecha_cierre=? WHERE fecha_cierre=?`)
          .run(nueva_fecha, fecha_original);
        
        // Actualizar fecha de pedidos si no hay fecha_cierre
        const infoPedidos2 = dbHist
          .prepare(`UPDATE devoluciones_pedidos_hist SET fecha=? WHERE fecha=? AND fecha_cierre IS NULL`)
          .run(nueva_fecha, fecha_original);
        
        pedidosActualizados = infoPedidos1.changes + infoPedidos2.changes;
      }
    } catch (e) {
      console.warn("⚠️ Error actualizando pedidos históricos:", e.message);
    }
  }

  // Emitir evento de socket para sincronización en tiempo real
  getIO().emit("reportes_actualizados");

  res.json({
    success: true,
    modificados: totalModificados,
    pedidosActualizados: pedidosActualizados,
    mensaje: `Reporte movido de ${fecha_original} a ${nueva_fecha}`,
  });
});

/* ============================================================
   3. REPORTES REENVÍOS (usa tablas reenvios_historico / reenvios_fotos_hist en dbReenvios)
   ============================================================ */

router.get("/reenvios/reportes", (req, res) => {
  try {
    
    // Primero, verificar cuántos registros hay en total
    const totalRegistros = dbReenvios.prepare(
      `SELECT COUNT(*) as total FROM reenvios_historico`
    ).get();
    
    // Buscar en reenvios_historico en dbReenvios (donde realmente están los datos)
    const rows = dbReenvios.prepare(
      `
      SELECT
        fechaCorte AS fecha,
        COUNT(*) AS total_envios
      FROM reenvios_historico
      WHERE fechaCorte IS NOT NULL AND fechaCorte != ''
      GROUP BY fechaCorte
      ORDER BY fechaCorte DESC
    `
    ).all();

    // Obtener cantidad por paquetería específica (FedEx, DHL, Estafeta) para cada fecha
    const paqueteriasPorDia = dbReenvios.prepare(
      `
      SELECT
        fechaCorte AS fecha,
        paqueteria,
        COUNT(*) AS cantidad
      FROM reenvios_historico
      WHERE fechaCorte IS NOT NULL AND fechaCorte != ''
        AND paqueteria IS NOT NULL AND paqueteria != ''
      GROUP BY fechaCorte, paqueteria
      ORDER BY fechaCorte DESC, cantidad DESC
    `
    ).all();

    // Crear un mapa de cantidades por paquetería específica para cada fecha
    const mapPaqueterias = {};
    
    // Inicializar todas las fechas con valores en 0
    rows.forEach((r) => {
      if (r.fecha && r.fecha.trim() !== '') {
        if (!mapPaqueterias[r.fecha]) {
          mapPaqueterias[r.fecha] = {
            fedex: 0,
            dhl: 0,
            estafeta: 0
          };
        }
      }
    });
    
    console.log(`🔧 Fechas inicializadas en mapPaqueterias: ${Object.keys(mapPaqueterias).length}`);
    if (Object.keys(mapPaqueterias).length > 0) {
      const primeraFecha = Object.keys(mapPaqueterias)[0];
      console.log(`   Ejemplo de primera fecha (${primeraFecha}):`, mapPaqueterias[primeraFecha]);
    }
    
    // Procesar cada paquetería encontrada
    console.log(`📦 Total de registros de paqueterías encontrados: ${paqueteriasPorDia.length}`);
    
    paqueteriasPorDia.forEach((p) => {
      if (!p.fecha || p.fecha.trim() === '') return;
      
      if (!mapPaqueterias[p.fecha]) {
        mapPaqueterias[p.fecha] = {
          fedex: 0,
          dhl: 0,
          estafeta: 0
        };
      }
      
      const paq = String(p.paqueteria || '').toUpperCase().trim();
      
      // Debug: mostrar las primeras 10 paqueterías encontradas
      if (paqueteriasPorDia.indexOf(p) < 10) {
        console.log(`   Paquetería encontrada: "${p.paqueteria}" -> "${paq}" (cantidad: ${p.cantidad}, fecha: ${p.fecha})`);
      }
      
      // Contar por paquetería (buscando coincidencias más flexibles)
      // IMPORTANTE: Verificar Estafeta PRIMERO porque "ESTAF" podría coincidir con otras palabras
      // Estafeta: busca ESTAFETA, ESTAF, etc.
      if (paq.includes('ESTAFETA') || paq === 'ESTAFETA' || paq.startsWith('ESTAFETA') || paq.startsWith('ESTAF')) {
        mapPaqueterias[p.fecha].estafeta += p.cantidad;
        if (paqueteriasPorDia.indexOf(p) < 10) {
          console.log(`      ✅ Clasificado como Estafeta (${p.cantidad} reenvíos)`);
        }
      } 
      // FedEx: busca FEDEX, FED, FED EX, etc. (pero NO si ya fue clasificado como Estafeta)
      else if (paq.includes('FEDEX') || paq.includes('FED EX') || 
               (paq.includes('FED') && !paq.includes('ESTAF')) || 
               paq === 'FEDEX' || (paq.startsWith('FED') && !paq.startsWith('ESTAF')) || paq === 'FED') {
        mapPaqueterias[p.fecha].fedex += p.cantidad;
        if (paqueteriasPorDia.indexOf(p) < 10) {
          console.log(`      ✅ Clasificado como FedEx (${p.cantidad} reenvíos)`);
        }
      } 
      // DHL: busca DHL exacto o que contenga DHL
      else if (paq.includes('DHL') || paq === 'DHL' || paq.startsWith('DHL')) {
        mapPaqueterias[p.fecha].dhl += p.cantidad;
        if (paqueteriasPorDia.indexOf(p) < 10) {
          console.log(`      ✅ Clasificado como DHL (${p.cantidad} reenvíos)`);
        }
      } else {
        if (paqueteriasPorDia.indexOf(p) < 10) {
          console.log(`      ⚠️ No clasificado: "${paq}" (no coincide con FedEx, DHL o Estafeta)`);
        }
      }
    });
    
    // Debug: mostrar algunas paqueterías encontradas
    const fechasConDatos = Object.keys(mapPaqueterias).slice(0, 3);
    if (fechasConDatos.length > 0) {
      console.log("📦 Paqueterías encontradas:");
      fechasConDatos.forEach(fecha => {
        console.log(`   ${fecha}:`, mapPaqueterias[fecha]);
      });
    }
    
    // Debug: mostrar todas las paqueterías únicas encontradas
    const paqueteriasUnicas = [...new Set(paqueteriasPorDia.map(p => p.paqueteria))];
    if (paqueteriasUnicas.length > 0) {
      console.log("📋 Paqueterías únicas en BD:", paqueteriasUnicas.slice(0, 10));
    }


    // Contar fotos desde reenvios_fotos_hist
    const fotosPorDia = dbReenvios.prepare(
      `
      SELECT
        fecha_cierre AS fecha,
        COUNT(*) AS total_fotos
      FROM reenvios_fotos_hist
      WHERE fecha_cierre IS NOT NULL AND fecha_cierre != ''
      GROUP BY fecha_cierre
    `
    ).all();


    const mapFotos = {};
    fotosPorDia.forEach((f) => {
      mapFotos[f.fecha] = f.total_fotos || 0;
    });

    const result = {};
    rows.forEach((r) => {
      if (!r.fecha || r.fecha.trim() === '') {
        return;
      }
      const [y, m] = r.fecha.split("-");
      const mes = `${y}-${m}`;
      if (!result[mes]) result[mes] = [];
      
      // Asegurar que siempre tengamos un objeto con las propiedades necesarias
      let paqData = mapPaqueterias[r.fecha];
      if (!paqData || typeof paqData !== 'object') {
        paqData = { fedex: 0, dhl: 0, estafeta: 0 };
      }
      
      // Asegurar que las propiedades existan y sean números
      const fedex = typeof paqData.fedex === 'number' ? paqData.fedex : 0;
      const dhl = typeof paqData.dhl === 'number' ? paqData.dhl : 0;
      const estafeta = typeof paqData.estafeta === 'number' ? paqData.estafeta : 0;
      
      // Debug: mostrar datos para algunas fechas
      if (result[mes].length < 2) {
        console.log(`📊 Fecha ${r.fecha}:`, {
          total_envios: r.total_envios,
          paqData: paqData,
          fedex: fedex,
          dhl: dhl,
          estafeta: estafeta,
          mapPaqueterias_has_data: !!mapPaqueterias[r.fecha],
          mapPaqueterias_value: mapPaqueterias[r.fecha],
          tipo_fedex: typeof paqData.fedex,
          tipo_dhl: typeof paqData.dhl,
          tipo_estafeta: typeof paqData.estafeta
        });
      }
      
      // Crear el objeto con todas las propiedades explícitamente
      // Asegurar que todos los valores sean números válidos
      const item = {};
      item.fecha = String(r.fecha || '');
      item.total_envios = Number(r.total_envios) || 0;
      item.total_fotos = Number(mapFotos[r.fecha] || 0) || 0;
      item.fedex = Number(fedex) || 0;
      item.dhl = Number(dhl) || 0;
      item.estafeta = Number(estafeta) || 0;
      
      // Verificar que todas las propiedades estén definidas
      if (typeof item.fedex !== 'number' || isNaN(item.fedex)) item.fedex = 0;
      if (typeof item.dhl !== 'number' || isNaN(item.dhl)) item.dhl = 0;
      if (typeof item.estafeta !== 'number' || isNaN(item.estafeta)) item.estafeta = 0;
      
      // Debug: verificar que el item tenga todas las propiedades
      if (result[mes].length < 2) {
        console.log(`   ✅ Item creado:`, item);
        console.log(`   ✅ Propiedades del item:`, Object.keys(item));
      }
      
      result[mes].push(item);
    });
    
    // Debug final: mostrar resumen
    console.log("📈 Resumen de paqueterías por mes:");
    Object.keys(result).forEach(mes => {
      const dias = result[mes];
      const totalFedex = dias.reduce((sum, d) => sum + (d.fedex || 0), 0);
      const totalDhl = dias.reduce((sum, d) => sum + (d.dhl || 0), 0);
      const totalEstafeta = dias.reduce((sum, d) => sum + (d.estafeta || 0), 0);
      console.log(`   ${mes}: FedEx=${totalFedex}, DHL=${totalDhl}, Estafeta=${totalEstafeta}`);
      
      // Debug: verificar estructura del primer día
      if (dias.length > 0) {
        const primerDia = dias[0];
        console.log(`   🔍 Primer día de ${mes}:`, {
          fecha: primerDia.fecha,
          tiene_fedex: 'fedex' in primerDia,
          fedex_value: primerDia.fedex,
          tiene_dhl: 'dhl' in primerDia,
          dhl_value: primerDia.dhl,
          tiene_estafeta: 'estafeta' in primerDia,
          estafeta_value: primerDia.estafeta,
          todas_las_propiedades: Object.keys(primerDia)
        });
      }
    });

    // Debug final: verificar que el objeto result tenga las propiedades correctas
    console.log("🔍 Verificando objeto final antes de enviar:");
    console.log("   Total de meses:", Object.keys(result).length);
    
    Object.keys(result).forEach(mes => {
      const dias = result[mes];
      console.log(`   Mes ${mes}: ${dias.length} días`);
      
      if (dias.length > 0) {
        // Verificar TODOS los días, no solo el primero
        dias.forEach((dia, idx) => {
          if (idx < 3) { // Solo mostrar los primeros 3 para no saturar
            console.log(`      Día ${idx + 1} (${dia.fecha}):`, {
              total_envios: dia.total_envios,
              total_fotos: dia.total_fotos,
              fedex: dia.fedex,
              dhl: dia.dhl,
              estafeta: dia.estafeta,
              tiene_fedex: 'fedex' in dia,
              tiene_dhl: 'dhl' in dia,
              tiene_estafeta: 'estafeta' in dia,
              todas_propiedades: Object.keys(dia)
            });
          }
        });
      }
    });

    // Asegurar que TODOS los items tengan las propiedades necesarias
    // Reconstruir completamente el objeto para evitar problemas de serialización
    const resultFinal = {};
    Object.keys(result).forEach(mes => {
      resultFinal[mes] = result[mes].map(dia => {
        // Crear un nuevo objeto limpio con todas las propiedades
        const nuevoDia = {
          fecha: String(dia.fecha || ''),
          total_envios: Number(dia.total_envios) || 0,
          total_fotos: Number(dia.total_fotos) || 0,
          fedex: Number(dia.fedex) || 0,
          dhl: Number(dia.dhl) || 0,
          estafeta: Number(dia.estafeta) || 0,
        };
        
        // Verificación final
        if (isNaN(nuevoDia.fedex)) nuevoDia.fedex = 0;
        if (isNaN(nuevoDia.dhl)) nuevoDia.dhl = 0;
        if (isNaN(nuevoDia.estafeta)) nuevoDia.estafeta = 0;
        
        return nuevoDia;
      });
    });
    
    // Debug final: verificar el objeto reconstruido
    console.log("🔍 Verificando objeto FINAL reconstruido:");
    const primerMesFinal = Object.keys(resultFinal)[0];
    if (primerMesFinal && resultFinal[primerMesFinal] && resultFinal[primerMesFinal].length > 0) {
      const primerItemFinal = resultFinal[primerMesFinal][0];
      console.log("   Primer item FINAL:", JSON.stringify(primerItemFinal));
      console.log("   Propiedades FINALES:", Object.keys(primerItemFinal));
      console.log("   fedex FINAL:", primerItemFinal.fedex, typeof primerItemFinal.fedex);
      console.log("   dhl FINAL:", primerItemFinal.dhl, typeof primerItemFinal.dhl);
      console.log("   estafeta FINAL:", primerItemFinal.estafeta, typeof primerItemFinal.estafeta);
    }

    res.json(resultFinal);
  } catch (err) {
    console.error("❌ Error en /reenvios/reportes:", err);
    res.status(500).json({ error: "Error generando reporte", details: err.message });
  }
});

router.get("/reenvios/dia/:fecha", (req, res) => {
  try {
    
    const rows = dbReenvios.prepare(
      `
      SELECT *
      FROM reenvios_historico
      WHERE fechaCorte = ?
      ORDER BY hora DESC
    `
    ).all(req.params.fecha);


    // Agregar fotos a cada registro
    const rowsConFotos = rows.map((row) => {
      let fotosUrls = [];
      
      try {
        const fotosHist = dbReenvios
          .prepare(
            `SELECT archivo FROM reenvios_fotos_hist 
             WHERE pedido = ? AND fecha_cierre = ?`
          )
          .all(row.pedido, row.fechaCorte);
        
        const uploadsDir = path.join(process.cwd(), "uploads", "reenvios");
        if (fs.existsSync(uploadsDir)) {
          const nombrePedido = (row.pedido || "")
            .replace(/[<>:"/\\|?*]/g, '_')
            .trim();
          
          // Primero intentar buscar en la carpeta con el nombre del pedido
          const carpetaPedido = path.join(uploadsDir, nombrePedido);
          if (fs.existsSync(carpetaPedido)) {
            for (const foto of fotosHist) {
              const fotoPath = path.join(carpetaPedido, foto.archivo);
              if (fs.existsSync(fotoPath)) {
                fotosUrls.push(
                  `${req.protocol}://${req.get("host")}/uploads/reenvios/${encodeURIComponent(nombrePedido)}/${foto.archivo}`
                );
              }
            }
          } else {
            // Si no existe la carpeta con nombre de pedido, buscar en todas las carpetas (compatibilidad)
            const carpetas = fs.readdirSync(uploadsDir, { withFileTypes: true })
              .filter(dirent => dirent.isDirectory())
              .map(dirent => dirent.name);
            
            for (const foto of fotosHist) {
              for (const carpeta of carpetas) {
                const fotoPath = path.join(uploadsDir, carpeta, foto.archivo);
                if (fs.existsSync(fotoPath)) {
                  fotosUrls.push(
                    `${req.protocol}://${req.get("host")}/uploads/reenvios/${encodeURIComponent(carpeta)}/${foto.archivo}`
                  );
                  break;
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn("⚠️ Error obteniendo fotos:", e.message);
      }

      return {
        ...row,
        fotos: fotosUrls,
      };
    });

    res.json(rowsConFotos);
  } catch (e) {
    console.error("❌ Error en /reenvios/dia:", e);
    console.error("Stack:", e.stack);
    res.status(500).json({ error: "Error obteniendo día", details: e.message });
  }
});

router.get("/reenvios/exportar-dia/:fecha", async (req, res) => {
  try {
    const { fecha } = req.params;

    const rows = dbReenvios
      .prepare(
        `
        SELECT *
        FROM reenvios_historico
        WHERE fechaCorte = ?
        ORDER BY hora DESC
      `
      )
      .all(fecha);

    if (!rows.length) {
      return res
        .status(404)
        .json({ error: "No hay registros para ese día" });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Reenvíos ${fecha}`);

    sheet.columns = [
      { header: "Pedido", key: "pedido" },
      { header: "Paquetería", key: "paqueteria" },
      { header: "Guía", key: "guia" },
      { header: "Motivo", key: "observaciones" },
      { header: "Estatus", key: "estatus" },
      { header: "Fecha envío", key: "fecha" },
      { header: "Fecha cierre", key: "fechaCorte" },
      { header: "Hora", key: "hora" },
    ];

    sheet.addRows(rows);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=reenvios_${fecha}.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error("❌ Error exportando día:", e);
    res.status(500).json({ error: "Error exportando día" });
  }
});

router.get("/reenvios/exportar-mes/:mes", async (req, res) => {
  try {
    const { mes } = req.params;

    const rows = dbReenvios
      .prepare(
        `
        SELECT *
        FROM reenvios_historico
        WHERE fechaCorte LIKE ?
        ORDER BY fechaCorte DESC, hora DESC
      `
      )
      .all(`${mes}%`);

    if (!rows.length) {
      return res
        .status(404)
        .json({ error: "No hay registros ese mes" });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Reenvíos ${mes}`);

    sheet.columns = [
      { header: "Pedido", key: "pedido" },
      { header: "Paquetería", key: "paqueteria" },
      { header: "Guía", key: "guia" },
      { header: "Motivo", key: "observaciones" },
      { header: "Estatus", key: "estatus" },
      { header: "Fecha envío", key: "fecha" },
      { header: "Fecha cierre", key: "fechaCorte" },
      { header: "Hora", key: "hora" },
    ];

    sheet.addRows(rows);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=reenvios_${mes}.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error("❌ Error exportando mes:", e);
    res.status(500).json({ error: "Error exportando mes" });
  }
});

router.get("/reenvios/exportar-q1/:mes", async (req, res) => {
  try {
    const { mes } = req.params;
    const [year, month] = mes.split("-").map(Number);
    const endMonth = dayjs(`${year}-${String(month).padStart(2, "0")}-01`).daysInMonth();
    
    const desde = `${mes}-01`;
    const hasta = `${mes}-15`;

    const rows = dbReenvios
      .prepare(
        `
        SELECT *
        FROM reenvios_historico
        WHERE fechaCorte BETWEEN ? AND ?
        ORDER BY fechaCorte DESC, hora DESC
      `
      )
      .all(desde, hasta);

    if (!rows.length) {
      return res
        .status(404)
        .json({ error: "No hay registros en Q1 de ese mes" });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Reenvíos Q1 ${mes}`);

    sheet.columns = [
      { header: "Pedido", key: "pedido" },
      { header: "Paquetería", key: "paqueteria" },
      { header: "Guía", key: "guia" },
      { header: "Motivo", key: "observaciones" },
      { header: "Estatus", key: "estatus" },
      { header: "Fecha envío", key: "fecha" },
      { header: "Fecha cierre", key: "fechaCorte" },
      { header: "Hora", key: "hora" },
    ];

    sheet.addRows(rows);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=reenvios_${mes}_Q1.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error("❌ Error exportando Q1:", e);
    res.status(500).json({ error: "Error exportando Q1" });
  }
});

router.get("/reenvios/exportar-q2/:mes", async (req, res) => {
  try {
    const { mes } = req.params;
    const [year, month] = mes.split("-").map(Number);
    const endMonth = dayjs(`${year}-${String(month).padStart(2, "0")}-01`).daysInMonth();
    
    const desde = `${mes}-16`;
    const hasta = `${mes}-${String(endMonth).padStart(2, "0")}`;

    const rows = dbReenvios
      .prepare(
        `
        SELECT *
        FROM reenvios_historico
        WHERE fechaCorte BETWEEN ? AND ?
        ORDER BY fechaCorte DESC, hora DESC
      `
      )
      .all(desde, hasta);

    if (!rows.length) {
      return res
        .status(404)
        .json({ error: "No hay registros en Q2 de ese mes" });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Reenvíos Q2 ${mes}`);

    sheet.columns = [
      { header: "Pedido", key: "pedido" },
      { header: "Paquetería", key: "paqueteria" },
      { header: "Guía", key: "guia" },
      { header: "Motivo", key: "observaciones" },
      { header: "Estatus", key: "estatus" },
      { header: "Fecha envío", key: "fecha" },
      { header: "Fecha cierre", key: "fechaCorte" },
      { header: "Hora", key: "hora" },
    ];

    sheet.addRows(rows);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=reenvios_${mes}_Q2.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error("❌ Error exportando Q2:", e);
    res.status(500).json({ error: "Error exportando Q2" });
  }
});

// Función para extraer tipo de pedido del número de pedido
const extraerTipoPedido = (pedido) => {
  if (!pedido) return "Sin especificar";
  const pedidoStr = String(pedido).toLowerCase().trim();
  
  if (pedidoStr.startsWith("p") || /^p\d+/i.test(pedidoStr)) {
    return "Pedidos (P)";
  } else if (pedidoStr.includes("retail") || /^retail/i.test(pedidoStr)) {
    return "Retail";
  } else if (pedidoStr.includes("fulfillment") || /^fulfillment/i.test(pedidoStr) || pedidoStr.includes("fulfil")) {
    return "Fulfillment";
  } else if (pedidoStr.includes("marketplace") || pedidoStr.includes("mercado")) {
    return "Marketplace";
  } else if (pedidoStr.includes("web") || pedidoStr.includes("online")) {
    return "Web/Online";
  } else {
    // Si no coincide con ningún patrón, verificar si tiene formato de pedido estándar
    return "Otro";
  }
};

// Endpoint para reporte detallado de devoluciones
router.get("/reportes-devoluciones/detallado/:tipo/:periodo", (req, res) => {
  try {
    const { tipo, periodo } = req.params; // tipo: "dia", "mes", "q1", "q2", periodo: fecha o mes
    
    // Determinar rango de fechas
    let desde, hasta, periodoTexto;
    if (tipo === "dia") {
      desde = periodo;
      hasta = periodo;
      periodoTexto = periodo;
    } else if (tipo === "mes") {
      const [year, month] = periodo.split("-").map(Number);
      const endDay = dayjs(`${year}-${String(month).padStart(2, "0")}-01`).daysInMonth();
      desde = `${periodo}-01`;
      hasta = `${periodo}-${String(endDay).padStart(2, "0")}`;
      periodoTexto = dayjs(desde).format("MMMM YYYY");
    } else if (tipo === "q1") {
      const [year, month] = periodo.split("-").map(Number);
      desde = `${periodo}-01`;
      hasta = `${periodo}-15`;
      periodoTexto = `Q1 ${dayjs(desde).format("MMMM YYYY")}`;
    } else if (tipo === "q2") {
      const [year, month] = periodo.split("-").map(Number);
      const endDay = dayjs(`${year}-${String(month).padStart(2, "0")}-01`).daysInMonth();
      desde = `${periodo}-16`;
      hasta = `${periodo}-${String(endDay).padStart(2, "0")}`;
      periodoTexto = `Q2 ${dayjs(desde).format("MMMM YYYY")}`;
    } else {
      return res.status(400).json({ error: "Tipo inválido. Use: dia, mes, q1, q2" });
    }

    // Obtener todos los pedidos históricos en el rango de fechas
    const pedidosHist = dbHist.prepare(`
      SELECT 
        id,
        pedido,
        motivo,
        area,
        COALESCE(fecha_cierre, fecha) AS fecha
      FROM devoluciones_pedidos_hist
      WHERE COALESCE(fecha_cierre, fecha) BETWEEN ? AND ?
      ORDER BY fecha ASC
    `).all(desde, hasta);

    // Obtener todos los productos históricos de todas las áreas
    const DEV_TIPOS_HIST = {
      clientes: "devoluciones_clientes_hist",
      calidad: "devoluciones_calidad_hist",
      reacondicionados: "devoluciones_reacondicionados_hist",
      retail: "devoluciones_retail_hist",
      cubbo: "devoluciones_cubbo_hist",
      regulatorio: "devoluciones_regulatorio_hist",
    };

    const productosPorArea = {};
    
    // Obtener productos de cada área
    for (const [area, tabla] of Object.entries(DEV_TIPOS_HIST)) {
      try {
        const existe = dbHist.prepare(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name=?
        `).get(tabla);
        
        if (existe) {
          productosPorArea[area] = dbHist.prepare(`
            SELECT 
              codigo,
              nombre,
              cantidad,
              pedido,
              COALESCE(fecha_cierre, fecha) AS fecha
            FROM ${tabla}
            WHERE COALESCE(fecha_cierre, fecha) BETWEEN ? AND ?
          `).all(desde, hasta);
        }
      } catch (err) {
        console.warn(`⚠️ Error consultando tabla ${tabla}:`, err.message);
        productosPorArea[area] = [];
      }
    }

    // Combinar todos los productos
    const todosProductos = [];
    Object.values(productosPorArea).forEach(prods => {
      todosProductos.push(...prods);
    });

    // 1. AGRUPAR POR TIPO DE PEDIDO
    const pedidosPorTipo = {};
    const piezasPorTipo = {};
    
    pedidosHist.forEach(p => {
      const tipoPedido = extraerTipoPedido(p.pedido);
      if (!pedidosPorTipo[tipoPedido]) {
        pedidosPorTipo[tipoPedido] = 0;
        piezasPorTipo[tipoPedido] = 0;
      }
      pedidosPorTipo[tipoPedido] += 1;
      
      // Sumar piezas de productos relacionados con este pedido
      const productosDelPedido = todosProductos.filter(prod => prod.pedido === p.pedido);
      productosDelPedido.forEach(prod => {
        piezasPorTipo[tipoPedido] += Number(prod.cantidad || 0);
      });
    });

    const resumenPorTipo = Object.keys(pedidosPorTipo).map(tipo => ({
      tipo,
      cantidad_pedidos: pedidosPorTipo[tipo],
      cantidad_piezas: piezasPorTipo[tipo]
    })).sort((a, b) => b.cantidad_pedidos - a.cantidad_pedidos);

    // 2. PRODUCTOS MÁS DEVUELTOS
    const productosMap = {};
    todosProductos.forEach(p => {
      const key = `${p.codigo}_${p.nombre}`;
      if (!productosMap[key]) {
        productosMap[key] = {
          codigo: p.codigo,
          nombre: p.nombre,
          cantidad_total: 0,
          veces_devuelto: 0
        };
      }
      productosMap[key].cantidad_total += Number(p.cantidad || 0);
      productosMap[key].veces_devuelto += 1;
    });

    const productosMasDevueltos = Object.values(productosMap)
      .sort((a, b) => b.cantidad_total - a.cantidad_total)
      .slice(0, 20);

    // 3. MOTIVOS DE DEVOLUCIÓN
    const motivosMap = {};
    pedidosHist.forEach(p => {
      const motivo = p.motivo || "Sin motivo especificado";
      if (!motivosMap[motivo]) {
        motivosMap[motivo] = {
          motivo,
          cantidad_pedidos: 0,
          cantidad_piezas: 0
        };
      }
      motivosMap[motivo].cantidad_pedidos += 1;
      
      const productosDelPedido = todosProductos.filter(prod => prod.pedido === p.pedido);
      productosDelPedido.forEach(prod => {
        motivosMap[motivo].cantidad_piezas += Number(prod.cantidad || 0);
      });
    });

    const motivosDevolucion = Object.values(motivosMap)
      .sort((a, b) => b.cantidad_pedidos - a.cantidad_pedidos);

    // 4. RESUMEN GENERAL
    const totalPedidos = pedidosHist.length;
    const totalPiezas = todosProductos.reduce((sum, p) => sum + Number(p.cantidad || 0), 0);
    const totalProductos = todosProductos.length;

    // 5. AGRUPAR POR ÁREA
    const resumenPorArea = {};
    pedidosHist.forEach(p => {
      const area = p.area || "Sin área";
      if (!resumenPorArea[area]) {
        resumenPorArea[area] = {
          area,
          cantidad_pedidos: 0,
          cantidad_piezas: 0
        };
      }
      resumenPorArea[area].cantidad_pedidos += 1;
      
      const productosDelPedido = todosProductos.filter(prod => prod.pedido === p.pedido);
      productosDelPedido.forEach(prod => {
        resumenPorArea[area].cantidad_piezas += Number(prod.cantidad || 0);
      });
    });

    const resumenArea = Object.values(resumenPorArea)
      .sort((a, b) => b.cantidad_pedidos - a.cantidad_pedidos);

    res.json({
      periodo: periodoTexto,
      tipo,
      fechaDesde: desde,
      fechaHasta: hasta,
      resumen: {
        total_pedidos: totalPedidos,
        total_piezas: totalPiezas,
        total_productos: totalProductos
      },
      pedidosPorTipo: resumenPorTipo,
      productosMasDevueltos,
      motivosDevolucion,
      resumenPorArea: resumenArea
    });

  } catch (err) {
    console.error("❌ Error generando reporte detallado de devoluciones:", err);
    res.status(500).json({ error: "Error generando reporte", details: err.message });
  }
});

export default router;
