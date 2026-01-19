import express from "express";
import { dbAud, dbInv } from "../config/baseDeDatos.js";
import { requierePermiso, verificarPermisos, tienePermiso } from "../middleware/permisos.js";
import { authRequired } from "../middleware/autenticacion.js";
import { registrarAccion } from "../utilidades/auditoria.js";
import { getIO } from "../config/socket.js";

const router = express.Router();

// Listar todas las auditorías
router.get("/listar", authRequired, requierePermiso("tab:auditoria"), async (req, res) => {
  try {
    const auditorias = dbAud
      .prepare(`
        SELECT * FROM auditorias_inventario 
        ORDER BY fecha_inicio DESC
      `)
      .all();
    
    res.json(auditorias);
  } catch (err) {
    console.error("Error listando auditorías:", err);
    res.status(500).json({ error: "Error listando auditorías" });
  }
});

// Crear nueva auditoría
router.post("/crear", authRequired, requierePermiso("tab:auditoria"), async (req, res) => {
  try {
    const { nombre } = req.body || {};
    
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: "El nombre es requerido" });
    }

    const usuario = req.user?.name || req.user?.username || "Usuario desconocido";

    const result = dbAud
      .prepare(`
        INSERT INTO auditorias_inventario (nombre, usuario, estado)
        VALUES (?, ?, 'en_proceso')
      `)
      .run(nombre.trim(), usuario);

    const nuevaAuditoria = dbAud
      .prepare("SELECT * FROM auditorias_inventario WHERE id = ?")
      .get(result.lastInsertRowid);

    // Registrar en auditoría
    registrarAccion({
      usuario,
      accion: "CREAR_AUDITORIA",
      detalle: `Auditoría creada: ${nombre}`,
      tabla: "auditorias_inventario",
      registroId: nuevaAuditoria.id,
    });

    // Emitir evento Socket.IO para sincronizar en todos los dispositivos
    const io = getIO();
    if (io) {
      io.emit("auditoria_creada", nuevaAuditoria);
      io.emit("auditorias_actualizadas");
    }

    res.json(nuevaAuditoria);
  } catch (err) {
    console.error("Error creando auditoría:", err);
    res.status(500).json({ error: "Error creando auditoría" });
  }
});

// Ruta de diagnóstico para verificar datos del inventario (DEBE ESTAR ANTES DE /:id)
router.get("/diagnostico-inventario", authRequired, requierePermiso("tab:auditoria"), async (req, res) => {
  try {
    // Información detallada del inventario
    const totalProductos = dbInv.prepare("SELECT COUNT(*) as total FROM productos_ref WHERE codigo IS NOT NULL AND codigo != ''").get()?.total || 0;
    const totalLotesActivos = dbInv.prepare("SELECT COUNT(*) as total FROM productos_lotes WHERE activo = 1").get()?.total || 0;
    const totalLotesConPiezas = dbInv.prepare("SELECT COUNT(*) as total FROM productos_lotes WHERE activo = 1 AND cantidad_piezas > 0").get()?.total || 0;
    const sumaTotalPiezas = dbInv.prepare("SELECT COALESCE(SUM(cantidad_piezas), 0) as total FROM productos_lotes WHERE activo = 1 AND cantidad_piezas > 0").get()?.total || 0;
    
    // Obtener todos los lotes activos con piezas para mostrar de dónde viene el total
    const todosLotes = dbInv
      .prepare(`
        SELECT codigo_producto, lote, cantidad_piezas 
        FROM productos_lotes 
        WHERE activo = 1 AND cantidad_piezas > 0 
        ORDER BY cantidad_piezas DESC
      `)
      .all();
    
    // Agrupar por código de producto para ver cuántos lotes tiene cada producto
    const productosConLotes = {};
    todosLotes.forEach(lote => {
      if (!productosConLotes[lote.codigo_producto]) {
        productosConLotes[lote.codigo_producto] = {
          codigo: lote.codigo_producto,
          lotes: [],
          totalPiezas: 0
        };
      }
      productosConLotes[lote.codigo_producto].lotes.push({
        lote: lote.lote,
        cantidad_piezas: lote.cantidad_piezas
      });
      productosConLotes[lote.codigo_producto].totalPiezas += lote.cantidad_piezas;
    });
    
    const diagnostico = {
      explicacion: {
        totalPiezas: `El total de ${sumaTotalPiezas} piezas viene de SUMAR todas las piezas de TODOS los lotes activos.`,
        detalle: `Tienes ${totalLotesConPiezas} lotes activos con piezas > 0. Cada lote tiene su cantidad de piezas, y se suman todas.`,
        ejemplo: `Si un producto tiene lote "A001" con 100 piezas y lote "A002" con 50 piezas, ese producto contribuye con 150 piezas al total.`
      },
      resumen: {
        totalProductos: totalProductos,
        totalLotesActivos: totalLotesActivos,
        totalLotesConPiezas: totalLotesConPiezas,
        sumaTotalPiezas: sumaTotalPiezas
      },
      lotes: {
        todos: todosLotes,
        top10: todosLotes.slice(0, 10), // Los 10 lotes con más piezas
        productosConMultiplesLotes: Object.values(productosConLotes).filter(p => p.lotes.length > 1).slice(0, 10) // Productos con múltiples lotes
      }
    };
    
    res.json(diagnostico);
  } catch (err) {
    console.error("Error en diagnóstico de inventario:", err);
    res.status(500).json({ error: "Error en diagnóstico" });
  }
});

// Obtener estadísticas del inventario (DEBE ESTAR ANTES DE /:id)
router.get("/estadisticas-inventario", authRequired, requierePermiso("tab:auditoria"), async (req, res) => {
  try {
    // Total de productos registrados (productos únicos con código válido)
    const totalProductos = dbInv
      .prepare("SELECT COUNT(*) as total FROM productos_ref WHERE codigo IS NOT NULL AND codigo != ''")
      .get();
    
    // Total de piezas: SUMA todas las piezas de TODOS los lotes activos
    // Esto significa que si un producto tiene múltiples lotes, se suman todas sus piezas
    // Ejemplo: Producto A tiene lote 1 con 100 piezas y lote 2 con 50 piezas = 150 piezas totales
    const totalPiezas = dbInv
      .prepare(`
        SELECT COALESCE(SUM(cantidad_piezas), 0) as total 
        FROM productos_lotes 
        WHERE activo = 1 AND cantidad_piezas > 0 AND cantidad_piezas IS NOT NULL
      `)
      .get();
    
    // NO loguear cada vez que se llama (solo en caso de error)
    res.json({
      totalProductos: totalProductos?.total || 0,
      totalPiezas: totalPiezas?.total || 0,
    });
  } catch (err) {
    console.error("Error obteniendo estadísticas de inventario:", err);
    res.status(500).json({ error: "Error obteniendo estadísticas" });
  }
});

// Obtener una auditoría específica
router.get("/:id", authRequired, requierePermiso("tab:auditoria"), async (req, res) => {
  try {
    const { id } = req.params;
    
    const auditoria = dbAud
      .prepare("SELECT * FROM auditorias_inventario WHERE id = ?")
      .get(id);

    if (!auditoria) {
      return res.status(404).json({ error: "Auditoría no encontrada" });
    }

    res.json(auditoria);
  } catch (err) {
    console.error("Error obteniendo auditoría:", err);
    res.status(500).json({ error: "Error obteniendo auditoría" });
  }
});

// Obtener items de una auditoría
router.get("/:id/items", authRequired, requierePermiso("tab:auditoria"), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const usuarioNombre = req.user?.name || req.user?.username || "Usuario desconocido";
    
    // Verificar si el usuario es admin o tiene permiso para ver todo
    // Admin tiene acceso automático, también usuarios con permiso de inventario
    const esAdmin = tienePermiso(userId, "admin");
    const tienePermisoInventario = tienePermiso(userId, "tab:inventario");
    const puedeVerTodo = esAdmin || tienePermisoInventario;
    
    let items;
    if (puedeVerTodo) {
      // Admin o auditor puede ver todos los items
      items = dbAud
        .prepare(`
          SELECT * FROM auditorias_inventario_items 
          WHERE auditoria_id = ?
          ORDER BY fecha_escaneo DESC
        `)
        .all(id);
    } else {
      // Usuario normal solo ve sus propios items
      items = dbAud
        .prepare(`
          SELECT * FROM auditorias_inventario_items 
          WHERE auditoria_id = ? AND usuario = ?
          ORDER BY fecha_escaneo DESC
        `)
        .all(id, usuarioNombre);
    }

    res.json(items);
  } catch (err) {
    console.error("Error obteniendo items:", err);
    res.status(500).json({ error: "Error obteniendo items" });
  }
});

// Agregar item a una auditoría
router.post("/:id/agregar-item", authRequired, requierePermiso("tab:auditoria"), async (req, res) => {
  try {
    const { id } = req.params;
    const { codigo, nombre, lote, cantidad_sistema, cantidad_fisica, piezas_no_aptas, diferencia, tipo_diferencia, observaciones } = req.body || {};

    if (!codigo || cantidad_fisica === undefined) {
      return res.status(400).json({ error: "Código y cantidad física son requeridos" });
    }

    const piezasNoAptas = parseInt(piezas_no_aptas) || 0;

    // Verificar que la auditoría existe y está en proceso
    const auditoria = dbAud
      .prepare("SELECT * FROM auditorias_inventario WHERE id = ?")
      .get(id);

    if (!auditoria) {
      return res.status(404).json({ error: "Auditoría no encontrada" });
    }

    if (auditoria.estado !== "en_proceso") {
      return res.status(400).json({ error: "Esta auditoría ya está finalizada" });
    }

    // Verificar si ya existe un item con el mismo código y lote
    const itemExistente = dbAud
      .prepare(`
        SELECT * FROM auditorias_inventario_items 
        WHERE auditoria_id = ? AND codigo = ? AND lote = ?
      `)
      .get(id, codigo, lote || "");

    const usuario = req.user?.name || req.user?.username || "Usuario desconocido";
    
    let item;
    if (itemExistente) {
      // Solo permitir actualizar si el item es del mismo usuario o si es admin/auditor
      const userId = req.user?.id;
      const esAdmin = tienePermiso(userId, "admin");
      const tienePermisoInventario = tienePermiso(userId, "tab:inventario");
      const puedeVerTodo = esAdmin || tienePermisoInventario;
      
      if (!puedeVerTodo && itemExistente.usuario !== usuario) {
        return res.status(403).json({ error: "No puedes modificar items de otros usuarios" });
      }
      
      // Actualizar item existente
      dbAud
        .prepare(`
          UPDATE auditorias_inventario_items 
          SET cantidad_sistema = ?, cantidad_fisica = ?, piezas_no_aptas = ?, diferencia = ?, 
              tipo_diferencia = ?, observaciones = ?, fecha_escaneo = datetime('now', 'localtime'),
              usuario = ?
          WHERE id = ?
        `)
        .run(cantidad_sistema || 0, cantidad_fisica, piezasNoAptas, diferencia || 0, tipo_diferencia || "coincide", observaciones || null, usuario, itemExistente.id);

      item = dbAud
        .prepare("SELECT * FROM auditorias_inventario_items WHERE id = ?")
        .get(itemExistente.id);
    } else {
      // Crear nuevo item
      const result = dbAud
        .prepare(`
          INSERT INTO auditorias_inventario_items 
          (auditoria_id, codigo, nombre, lote, cantidad_sistema, cantidad_fisica, piezas_no_aptas, diferencia, tipo_diferencia, observaciones, usuario)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          id,
          codigo,
          nombre || "",
          lote || "",
          cantidad_sistema || 0,
          cantidad_fisica,
          piezasNoAptas,
          diferencia || 0,
          tipo_diferencia || "coincide",
          observaciones || null,
          usuario
        );

      item = dbAud
        .prepare("SELECT * FROM auditorias_inventario_items WHERE id = ?")
        .get(result.lastInsertRowid);
    }

    // Actualizar estadísticas de la auditoría (solo admin/auditor ve todas las estadísticas)
    const userId = req.user?.id;
    const esAdmin = tienePermiso(userId, "admin");
    const tienePermisoInventario = tienePermiso(userId, "tab:inventario");
    const puedeVerTodo = esAdmin || tienePermisoInventario;
    
    const items = dbAud
      .prepare("SELECT * FROM auditorias_inventario_items WHERE auditoria_id = ?")
      .all(id);

    const totalProductos = items.length;
    const productosEscaneados = items.length;
    const diferenciasEncontradas = items.filter(i => i.diferencia !== 0).length;

    dbAud
      .prepare(`
        UPDATE auditorias_inventario 
        SET total_productos = ?, productos_escaneados = ?, diferencias_encontradas = ?
        WHERE id = ?
      `)
      .run(totalProductos, productosEscaneados, diferenciasEncontradas, id);

    // Descontar piezas no aptas del inventario si hay
    if (piezasNoAptas > 0) {
      try {
        // Buscar el lote correspondiente
        const loteEncontrado = dbInv
          .prepare(`
            SELECT id, cantidad_piezas 
            FROM productos_lotes 
            WHERE codigo_producto = ? AND lote = ? AND activo = 1
            LIMIT 1
          `)
          .get(codigo, lote || "");
        
        if (loteEncontrado) {
          // Descontar las piezas no aptas del inventario
          const nuevaCantidad = Math.max(0, (loteEncontrado.cantidad_piezas || 0) - piezasNoAptas);
          
          dbInv
            .prepare(`
              UPDATE productos_lotes 
              SET cantidad_piezas = ? 
              WHERE id = ?
            `)
            .run(nuevaCantidad, loteEncontrado.id);
          
          // Registrar acción de ajuste de inventario
          registrarAccion({
            usuario,
            accion: "AJUSTE_INVENTARIO_PIEZAS_NO_APTAS",
            detalle: `Descontadas ${piezasNoAptas} piezas no aptas de ${codigo} (Lote: ${lote || "N/A"}) - Cantidad anterior: ${loteEncontrado.cantidad_piezas}, Nueva cantidad: ${nuevaCantidad}`,
            tabla: "productos_lotes",
            registroId: loteEncontrado.id,
          });
        } else {
          console.warn(`⚠️ No se encontró lote activo para ${codigo} (Lote: ${lote || "N/A"}) para descontar piezas no aptas`);
        }
      } catch (err) {
        console.error("Error descontando piezas no aptas del inventario:", err);
        // No fallar la auditoría si hay error al descontar, solo loguear
      }
    }

    // Registrar en auditoría
    registrarAccion({
      usuario,
      accion: "AGREGAR_ITEM_AUDITORIA",
      detalle: `Item agregado: ${codigo} - Físico: ${cantidad_fisica}, Sistema: ${cantidad_sistema}${piezasNoAptas > 0 ? `, No Aptas: ${piezasNoAptas}` : ""}`,
      tabla: "auditorias_inventario_items",
      registroId: item.id,
    });

    // Emitir evento Socket.IO para sincronizar en todos los dispositivos
    const io = getIO();
    if (io) {
      io.emit("auditoria_item_agregado", { auditoriaId: id, item });
      io.emit("auditoria_actualizada", { auditoriaId: id });
      // También actualizar inventario si se descontaron piezas no aptas
      if (piezasNoAptas > 0) {
        io.emit("inventario_actualizado");
        io.emit("auditoria_estadisticas_inventario_actualizadas");
      }
    }

    res.json(item);
  } catch (err) {
    console.error("Error agregando item:", err);
    res.status(500).json({ error: "Error agregando item" });
  }
});

// Eliminar item de una auditoría
router.delete("/item/:id/eliminar", authRequired, requierePermiso("tab:auditoria"), async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.user?.name || req.user?.username || "Usuario desconocido";
    const userId = req.user?.id;

    const item = dbAud
      .prepare("SELECT * FROM auditorias_inventario_items WHERE id = ?")
      .get(id);

    if (!item) {
      return res.status(404).json({ error: "Item no encontrado" });
    }

    // Verificar que la auditoría está en proceso
    const auditoria = dbAud
      .prepare("SELECT * FROM auditorias_inventario WHERE id = ?")
      .get(item.auditoria_id);

    if (auditoria.estado !== "en_proceso") {
      return res.status(400).json({ error: "No se pueden eliminar items de auditorías finalizadas" });
    }

    // Verificar que el usuario puede eliminar este item (solo suyo o admin/auditor)
    const esAdmin = tienePermiso(userId, "admin");
    const tienePermisoInventario = tienePermiso(userId, "tab:inventario");
    const puedeVerTodo = esAdmin || tienePermisoInventario;
    
    if (!puedeVerTodo && item.usuario !== usuario) {
      return res.status(403).json({ error: "No puedes eliminar items de otros usuarios" });
    }

    dbAud
      .prepare("DELETE FROM auditorias_inventario_items WHERE id = ?")
      .run(id);

    // Actualizar estadísticas
    const items = dbAud
      .prepare("SELECT * FROM auditorias_inventario_items WHERE auditoria_id = ?")
      .all(item.auditoria_id);

    const totalProductos = items.length;
    const productosEscaneados = items.length;
    const diferenciasEncontradas = items.filter(i => i.diferencia !== 0).length;

    dbAud
      .prepare(`
        UPDATE auditorias_inventario 
        SET total_productos = ?, productos_escaneados = ?, diferencias_encontradas = ?
        WHERE id = ?
      `)
      .run(totalProductos, productosEscaneados, diferenciasEncontradas, item.auditoria_id);

    // Registrar en auditoría
    registrarAccion({
      usuario,
      accion: "ELIMINAR_ITEM_AUDITORIA",
      detalle: `Item eliminado: ${item.codigo}`,
      tabla: "auditorias_inventario_items",
      registroId: item.id,
    });

    // Emitir evento Socket.IO para sincronizar en todos los dispositivos
    const io = getIO();
    if (io) {
      io.emit("auditoria_item_eliminado", { auditoriaId: item.auditoria_id, itemId: id });
      io.emit("auditoria_actualizada", { auditoriaId: item.auditoria_id });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Error eliminando item:", err);
    res.status(500).json({ error: "Error eliminando item" });
  }
});

// Finalizar auditoría
router.post("/:id/finalizar", authRequired, requierePermiso("tab:auditoria"), async (req, res) => {
  try {
    const { id } = req.params;

    const auditoria = dbAud
      .prepare("SELECT * FROM auditorias_inventario WHERE id = ?")
      .get(id);

    if (!auditoria) {
      return res.status(404).json({ error: "Auditoría no encontrada" });
    }

    if (auditoria.estado === "finalizada") {
      return res.status(400).json({ error: "Esta auditoría ya está finalizada" });
    }

    dbAud
      .prepare(`
        UPDATE auditorias_inventario 
        SET estado = 'finalizada', fecha_fin = datetime('now', 'localtime')
        WHERE id = ?
      `)
      .run(id);

    const auditoriaFinalizada = dbAud
      .prepare("SELECT * FROM auditorias_inventario WHERE id = ?")
      .get(id);

    // Registrar en auditoría
    const usuario = req.user?.name || req.user?.username || "Usuario desconocido";
    registrarAccion({
      usuario,
      accion: "FINALIZAR_AUDITORIA",
      detalle: `Auditoría finalizada: ${auditoria.nombre}`,
      tabla: "auditorias_inventario",
      registroId: id,
    });

    // Emitir evento Socket.IO para sincronizar en todos los dispositivos
    const io = getIO();
    if (io) {
      io.emit("auditoria_finalizada", auditoriaFinalizada);
      io.emit("auditorias_actualizadas");
    }

    res.json(auditoriaFinalizada);
  } catch (err) {
    console.error("Error finalizando auditoría:", err);
    res.status(500).json({ error: "Error finalizando auditoría" });
  }
});

export default router;

