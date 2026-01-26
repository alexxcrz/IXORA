import express from "express";
import { dbAud, dbInv, dbUsers } from "../config/baseDeDatos.js";
import { requierePermiso, verificarPermisos, tienePermiso } from "../middleware/permisos.js";
import { authRequired, verifyPassword } from "../middleware/autenticacion.js";
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
    const { nombre, inventario_id } = req.body || {};
    
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: "El nombre es requerido" });
    }

    if (!inventario_id) {
      return res.status(400).json({ error: "Debes seleccionar un inventario para la auditoría" });
    }

    // Verificar que el inventario existe
    const inventario = dbInv
      .prepare("SELECT id, nombre FROM inventarios WHERE id = ?")
      .get(inventario_id);
    
    if (!inventario) {
      return res.status(400).json({ error: "El inventario seleccionado no existe" });
    }

    // BARRERA: Verificar que no haya otra auditoría activa
    const auditoriasActivas = dbAud
      .prepare("SELECT id, nombre FROM auditorias_inventario WHERE estado = 'en_proceso'")
      .all();
    
    if (auditoriasActivas.length > 0) {
      return res.status(400).json({ 
        error: `Ya existe una auditoría en proceso: "${auditoriasActivas[0].nombre}". Solo puede haber una auditoría activa a la vez. Por favor, finaliza la auditoría actual antes de crear una nueva.` 
      });
    }

    const usuario = req.user?.name || req.user?.username || "Usuario desconocido";

    const result = dbAud
      .prepare(`
        INSERT INTO auditorias_inventario (nombre, usuario, estado, inventario_id)
        VALUES (?, ?, 'en_proceso', ?)
      `)
      .run(nombre.trim(), usuario, inventario_id);

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
    const inventarioId = req.query?.inventario_id ? parseInt(req.query.inventario_id) : null;
    
    let totalProductos, totalPiezas;
    
    if (inventarioId) {
      // Filtrar por inventario específico
      totalProductos = dbInv
        .prepare("SELECT COUNT(*) as total FROM productos_ref WHERE codigo IS NOT NULL AND codigo != '' AND inventario_id = ?")
        .get(inventarioId);
      
      totalPiezas = dbInv
        .prepare(`
          SELECT COALESCE(SUM(cantidad_piezas), 0) as total 
          FROM productos_lotes 
          WHERE activo = 1 AND cantidad_piezas > 0 AND cantidad_piezas IS NOT NULL AND inventario_id = ?
        `)
        .get(inventarioId);
    } else {
      // Estadísticas generales (todos los inventarios)
      totalProductos = dbInv
        .prepare("SELECT COUNT(*) as total FROM productos_ref WHERE codigo IS NOT NULL AND codigo != ''")
        .get();
      
      totalPiezas = dbInv
        .prepare(`
          SELECT COALESCE(SUM(cantidad_piezas), 0) as total 
          FROM productos_lotes 
          WHERE activo = 1 AND cantidad_piezas > 0 AND cantidad_piezas IS NOT NULL
        `)
        .get();
    }
    
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
    const { codigo, nombre, lote, lotes, cantidad_sistema, cantidad_fisica, piezas_no_aptas, lote_piezas_no_aptas, diferencia, tipo_diferencia, observaciones } = req.body || {};

    if (!codigo || cantidad_fisica === undefined) {
      return res.status(400).json({ error: "Código y cantidad física son requeridos" });
    }

    // Validar que haya lotes (obligatorio)
    let lotesArray = [];
    if (lotes) {
      try {
        // Si es un array, usarlo directamente
        if (Array.isArray(lotes)) {
          lotesArray = lotes;
        } 
        // Si es string, parsearlo
        else if (typeof lotes === 'string') {
          // Si el string tiene entidades HTML escapadas, decodificarlas primero
          let lotesStr = lotes;
          if (lotesStr.includes('&quot;')) {
            // Decodificar entidades HTML comunes
            lotesStr = lotesStr
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>');
          }
          
          // Intentar parsear el JSON
          lotesArray = JSON.parse(lotesStr);
          
          // Asegurar que sea un array
          if (!Array.isArray(lotesArray)) {
            lotesArray = [];
          }
        }
        // Si es un objeto, convertirlo a array
        else if (typeof lotes === 'object') {
          lotesArray = [lotes];
        }
      } catch (e) {
        // Si falla el parse, intentar crear un lote básico con los datos disponibles
        console.warn("⚠️ Error parseando lotes JSON, intentando recuperar:", e.message);
        console.warn("⚠️ Tipo recibido:", typeof lotes);
        console.warn("⚠️ Valor recibido (primeros 200 chars):", String(lotes).substring(0, 200));
        lotesArray = [];
      }
    } else if (lote) {
      // Compatibilidad con formato antiguo (un solo lote)
      lotesArray = [{ lote: lote.trim(), cantidad: cantidad_fisica || 0, caducidad: "" }];
    }

    if (!lotesArray || lotesArray.length === 0) {
      return res.status(400).json({ error: "Debes agregar al menos un lote (obligatorio)" });
    }

    // Validar solo que haya al menos un lote con número de lote (sin restricciones de formato)
    const lotesValidos = lotesArray.filter(l => l && l.lote && l.lote.trim());
    if (lotesValidos.length === 0) {
      return res.status(400).json({ error: "Debes agregar al menos un lote con número de lote" });
    }
    
    // Normalizar lotes: asegurar que todos tengan los campos necesarios con valores por defecto
    lotesArray = lotesValidos.map(l => ({
      lote: (l.lote || "").trim(),
      cantidad: parseInt(l.cantidad) || 0,
      caducidad: (l.caducidad || "").trim(),
      piezasNoAptas: parseInt(l.piezasNoAptas) || 0
    }));

    // Lote principal (primer lote) para compatibilidad
    const lotePrincipal = lotesArray[0]?.lote || "";

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
          SET lote = ?, lotes = ?, cantidad_sistema = ?, cantidad_fisica = ?, piezas_no_aptas = ?, lote_piezas_no_aptas = ?, diferencia = ?, 
              tipo_diferencia = ?, observaciones = ?, fecha_escaneo = datetime('now', 'localtime'),
              usuario = ?
          WHERE id = ?
        `)
        .run(lotePrincipal, JSON.stringify(lotesArray), cantidad_sistema || 0, cantidad_fisica, piezasNoAptas, lote_piezas_no_aptas || null, diferencia || 0, tipo_diferencia || "coincide", observaciones || null, usuario, itemExistente.id);

      item = dbAud
        .prepare("SELECT * FROM auditorias_inventario_items WHERE id = ?")
        .get(itemExistente.id);
    } else {
      // Crear nuevo item
      const result = dbAud
        .prepare(`
          INSERT INTO auditorias_inventario_items 
          (auditoria_id, codigo, nombre, lote, lotes, cantidad_sistema, cantidad_fisica, piezas_no_aptas, lote_piezas_no_aptas, diferencia, tipo_diferencia, observaciones, usuario)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          id,
          codigo,
          nombre || "",
          lotePrincipal,
          JSON.stringify(lotesArray),
          cantidad_sistema || 0,
          cantidad_fisica,
          piezasNoAptas,
          lote_piezas_no_aptas || null,
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

    // NO descontar piezas no aptas aquí - se hará al finalizar la auditoría
    // Las piezas no aptas se descontarán después de que los lotes se guarden en inventario

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

    // BARRERA: Verificar que la auditoría tenga inventario_id
    if (!auditoria.inventario_id) {
      return res.status(400).json({ error: "Esta auditoría no tiene un inventario asociado. No se puede finalizar." });
    }

    const inventarioId = auditoria.inventario_id;

    // Obtener todos los items de la auditoría antes de finalizarla
    const itemsAuditoria = dbAud
      .prepare("SELECT * FROM auditorias_inventario_items WHERE auditoria_id = ?")
      .all(id);

    const usuario = req.user?.name || req.user?.username || "Usuario desconocido";

    // Procesar todos los lotes de todos los items y guardarlos en productos_lotes
    // SOLO del inventario seleccionado
    for (const item of itemsAuditoria) {
      try {
        let lotesDelItem = [];
        
        // Intentar obtener lotes del campo JSON
        if (item.lotes) {
          try {
            lotesDelItem = typeof item.lotes === 'string' ? JSON.parse(item.lotes) : item.lotes;
          } catch (e) {
            console.warn(`⚠️ Error parseando lotes JSON para item ${item.id}:`, e);
            // Si falla, intentar usar el lote único (compatibilidad con formato antiguo)
            if (item.lote) {
              lotesDelItem = [{ lote: item.lote, cantidad: item.cantidad_fisica || 0, caducidad: "" }];
            }
          }
        } else if (item.lote) {
          // Compatibilidad con formato antiguo (un solo lote sin caducidad)
          lotesDelItem = [{ lote: item.lote, cantidad: item.cantidad_fisica || 0, caducidad: "" }];
        }

        // Guardar cada lote en productos_lotes
        for (const loteData of lotesDelItem) {
          if (!loteData.lote || !loteData.lote.trim()) continue;

          const codigoProducto = item.codigo;
          const numeroLote = loteData.lote.trim();
          const cantidadLote = parseInt(loteData.cantidad) || 0;
          const caducidadLote = loteData.caducidad || null;

          // BARRERA: Verificar si el lote ya existe en el inventario específico
          const loteExistente = dbInv
            .prepare("SELECT * FROM productos_lotes WHERE codigo_producto = ? AND lote = ? AND inventario_id = ?")
            .get(codigoProducto, numeroLote, inventarioId);

          // Obtener piezas no aptas de este lote (desde item.lotes JSON)
          const piezasNoAptasLote = parseInt(loteData.piezasNoAptas) || 0;
          
          // Calcular cantidad real: cantidad del lote menos piezas no aptas
          const cantidadReal = Math.max(0, cantidadLote - piezasNoAptasLote);

          if (loteExistente) {
            // BARRERA: Actualizar lote existente SOLO en el inventario específico
            dbInv
              .prepare(`
                UPDATE productos_lotes 
                SET cantidad_piezas = ?, caducidad = ?, fecha_ingreso = datetime('now', 'localtime')
                WHERE codigo_producto = ? AND lote = ? AND inventario_id = ?
              `)
              .run(cantidadReal, caducidadLote, codigoProducto, numeroLote, inventarioId);
            
            // Registrar acción si hay piezas no aptas
            if (piezasNoAptasLote > 0) {
              registrarAccion({
                usuario,
                accion: "AJUSTE_INVENTARIO_PIEZAS_NO_APTAS",
                detalle: `Lote actualizado con ${cantidadLote} piezas, descontadas ${piezasNoAptasLote} no aptas = ${cantidadReal} piezas finales para ${codigoProducto} (Lote: ${numeroLote})`,
                tabla: "productos_lotes",
                registroId: loteExistente.id,
              });
            }
          } else {
            // BARRERA: Crear nuevo lote SOLO en el inventario específico
            const result = dbInv
              .prepare(`
                INSERT INTO productos_lotes 
                (codigo_producto, lote, cantidad_piezas, caducidad, activo, fecha_ingreso, inventario_id)
                VALUES (?, ?, ?, ?, 0, datetime('now', 'localtime'), ?)
              `)
              .run(codigoProducto, numeroLote, cantidadReal, caducidadLote, inventarioId);
            
            // Registrar acción si hay piezas no aptas
            if (piezasNoAptasLote > 0) {
              registrarAccion({
                usuario,
                accion: "AJUSTE_INVENTARIO_PIEZAS_NO_APTAS",
                detalle: `Lote creado con ${cantidadLote} piezas, descontadas ${piezasNoAptasLote} no aptas = ${cantidadReal} piezas finales para ${codigoProducto} (Lote: ${numeroLote})`,
                tabla: "productos_lotes",
                registroId: result.lastInsertRowid,
              });
            }
          }
        }

        // BARRERA: Después de guardar todos los lotes del producto, activar el lote con caducidad más próxima
        // SOLO en el inventario específico
        const todosLotesProducto = dbInv
          .prepare(`
            SELECT * FROM productos_lotes 
            WHERE codigo_producto = ? AND inventario_id = ? AND caducidad IS NOT NULL AND caducidad != ''
            ORDER BY caducidad ASC
          `)
          .all(item.codigo, inventarioId);

        if (todosLotesProducto.length > 0) {
          // Desactivar todos los lotes del producto en este inventario
          dbInv
            .prepare("UPDATE productos_lotes SET activo = 0 WHERE codigo_producto = ? AND inventario_id = ?")
            .run(item.codigo, inventarioId);

          // Activar el lote con caducidad más próxima (el primero después de ordenar)
          const loteMasProximo = todosLotesProducto[0];
          dbInv
            .prepare("UPDATE productos_lotes SET activo = 1 WHERE id = ?")
            .run(loteMasProximo.id);
        } else {
          // Si no hay lotes con caducidad, activar el primer lote sin caducidad o activar el más reciente
          // SOLO en el inventario específico
          const lotesSinCaducidad = dbInv
            .prepare(`
              SELECT * FROM productos_lotes 
              WHERE codigo_producto = ? AND inventario_id = ?
              ORDER BY fecha_ingreso DESC
              LIMIT 1
            `)
            .all(item.codigo, inventarioId);

          if (lotesSinCaducidad.length > 0) {
            // Desactivar todos primero en este inventario
            dbInv
              .prepare("UPDATE productos_lotes SET activo = 0 WHERE codigo_producto = ? AND inventario_id = ?")
              .run(item.codigo, inventarioId);

            // Activar el más reciente
            dbInv
              .prepare("UPDATE productos_lotes SET activo = 1 WHERE id = ?")
              .run(lotesSinCaducidad[0].id);
          }
        }
      } catch (err) {
        console.error(`❌ Error procesando lotes para item ${item.id} (${item.codigo}):`, err);
        // Continuar con el siguiente item aunque falle uno
      }
    }

    // Finalizar la auditoría
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
    registrarAccion({
      usuario,
      accion: "FINALIZAR_AUDITORIA",
      detalle: `Auditoría finalizada: ${auditoria.nombre} - Lotes procesados y guardados`,
      tabla: "auditorias_inventario",
      registroId: id,
    });

    // Emitir eventos Socket.IO para sincronizar en todos los dispositivos
    const io = getIO();
    if (io) {
      io.emit("inventario_actualizado");
      io.emit("auditoria_finalizada", auditoriaFinalizada);
      io.emit("auditorias_actualizadas");
    }

    res.json(auditoriaFinalizada);
  } catch (err) {
    console.error("Error finalizando auditoría:", err);
    res.status(500).json({ error: "Error finalizando auditoría" });
  }
});

// Eliminar auditoría (requiere permiso y contraseña de admin o superior)
router.delete(
  "/:id",
  authRequired,
  requierePermiso("tab:auditoria"),
  async (req, res) => {
    try {
      const auditoriaId = parseInt(req.params.id);
      const { password } = req.body || {};

      if (!auditoriaId) {
        return res.status(400).json({ error: "ID de auditoría inválido" });
      }

      if (!password) {
        return res.status(400).json({ error: "Se requiere contraseña de administrador para eliminar auditorías" });
      }

      // Verificar que la auditoría existe
      const auditoria = dbAud
        .prepare("SELECT id, nombre, estado FROM auditorias_inventario WHERE id = ?")
        .get(auditoriaId);

      if (!auditoria) {
        return res.status(404).json({ error: "Auditoría no encontrada" });
      }

      // Verificar que el usuario es admin o superior
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuario no autenticado" });
      }

      // Verificar permisos de admin o superior (al menos uno de los permisos)
      const tienePermisoAdmin = tienePermiso(userId, "tab:admin") || tienePermiso(userId, "admin.usuarios.eliminar");
      if (!tienePermisoAdmin) {
        return res.status(403).json({ error: "Solo administradores o usuarios superiores pueden eliminar auditorías" });
      }

      // Obtener el usuario y verificar contraseña
      const user = dbUsers.prepare("SELECT * FROM users WHERE id = ?").get(userId);
      if (!user) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      if (!user.password_hash) {
        return res.status(400).json({ error: "El usuario no tiene contraseña configurada" });
      }

      const passwordValida = await verifyPassword(password, user.password_hash);
      if (!passwordValida) {
        return res.status(401).json({ error: "Contraseña incorrecta" });
      }

      // Contar items de la auditoría
      const cantidadItems = dbAud
        .prepare("SELECT COUNT(*) as total FROM auditorias_inventario_items WHERE auditoria_id = ?")
        .get(auditoriaId);

      // Eliminar items de la auditoría
      dbAud
        .prepare("DELETE FROM auditorias_inventario_items WHERE auditoria_id = ?")
        .run(auditoriaId);

      // Eliminar la auditoría
      dbAud
        .prepare("DELETE FROM auditorias_inventario WHERE id = ?")
        .run(auditoriaId);

      const usuario = req.user?.name || req.user?.username || "Usuario desconocido";

      // Registrar en auditoría
      registrarAccion({
        usuario,
        accion: "ELIMINAR_AUDITORIA",
        detalle: `Auditoría eliminada: ${auditoria.nombre} - ${cantidadItems?.total || 0} items eliminados`,
        tabla: "auditorias_inventario",
        registroId: auditoriaId,
      });

      // Emitir eventos Socket.IO para sincronizar en todos los dispositivos
      const io = getIO();
      if (io) {
        io.emit("auditorias_actualizadas");
      }

      res.json({
        ok: true,
        mensaje: `Auditoría "${auditoria.nombre}" eliminada exitosamente`,
        items_eliminados: cantidadItems?.total || 0
      });
    } catch (error) {
      console.error("❌ Error eliminando auditoría:", error);
      res.status(500).json({ error: "Error eliminando auditoría", detalles: error.message });
    }
  }
);

export default router;

