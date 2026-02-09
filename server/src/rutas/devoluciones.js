import express from "express";
import { authRequired } from "../middleware/autenticacion.js";
import { requierePermiso } from "../middleware/permisos.js";
import dayjs from "dayjs";
import { dbDevol, dbInv, dbDia, dbHist, dbUsers } from "../config/baseDeDatos.js";
import { getIO } from "../config/socket.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import { registrarAccion } from "../utilidades/auditoria.js";
import crypto from "crypto";
import { generarQRConLogo } from "../utilidades/generarQR.js";

const router = express.Router();

const DEV_TABLAS_DIA = {
  clientes: "devoluciones_clientes",
  calidad: "devoluciones_calidad",
  reacondicionados: "devoluciones_reacondicionados",
  retail: "devoluciones_retail",
  cubbo: "devoluciones_cubbo",
  regulatorio: "devoluciones_regulatorio",
};

const MAPEO_TIPO_AREA = {
  "clientes": "Clientes",
  "calidad": "Calidad",
  "reacondicionados": "Reacondicionados",
  "retail": "Retail",
  "cubbo": "Cubbo",
  "regulatorio": "Regulatorio"
};

const getTablaDia = (tipo) => DEV_TABLAS_DIA[tipo] || null;

const normalizeLote = (value) => {
  if (value === null || typeof value === "undefined") return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
};

const obtenerNombreCompleto = (nombre, presentacion) => {
  if (!nombre) return "";
  if (!presentacion || !presentacion.trim()) return nombre;
  
  const nombreTrim = nombre.trim();
  const presentacionTrim = presentacion.trim();
  
  const nombreLower = nombreTrim.toLowerCase();
  const presentacionLower = presentacionTrim.toLowerCase();
  
  if (nombreLower.endsWith(presentacionLower) || 
      nombreLower.endsWith(` - ${presentacionLower}`) ||
      nombreLower.endsWith(`- ${presentacionLower}`)) {
    return nombreTrim;
  }
  
  if (nombreTrim.includes(" - ")) {
    const nombreBase = nombreTrim.split(" - ")[0].trim();
    if (nombreBase.toLowerCase().endsWith(presentacionLower)) {
      return nombreBase;
    }
    return `${nombreBase} - ${presentacionTrim}`;
  }
  
  return `${nombreTrim} - ${presentacionTrim}`;
};

const groupProductos = (productos = []) => {
  const map = new Map();

  for (const raw of productos) {
    if (!raw) continue;
    const codigo = raw.codigo || "";
    const lote = raw.lote || "";
    const apto = raw.apto !== null && raw.apto !== undefined ? (raw.apto ? 1 : 0) : 1;
    const key = `${codigo}@@${lote}@@${apto}`;

    const cantidadNum = Number(raw.cantidad || 0);

    if (!map.has(key)) {
      map.set(key, {
        ...raw,
        codigo,
        lote,
        cantidad: cantidadNum,
        apto: apto === 1,
      });
    } else {
      const current = map.get(key);
      current.cantidad += cantidadNum;
      map.set(key, current);
    }
  }

  return Array.from(map.values());
};

const parseActivoValue = (value, fallback = 0) => {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value ? 1 : 0;
  if (typeof value === "string")
    return value === "1" || value.toLowerCase() === "true" ? 1 : 0;
  return fallback;
};

const uploadDir = "uploads/devoluciones";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || ".jpg");
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({ storage });

router.get("/areas", authRequired, (req, res) => {
  try {
    const rows = dbDevol.prepare("SELECT * FROM devoluciones_areas ORDER BY nombre").all();
    res.json(rows);
  } catch (err) {
    console.error("GET /devoluciones/areas:", err);
    res.status(500).json({ error: "Error cargando áreas" });
  }
});

router.post("/areas", authRequired, (req, res) => {
  const { nombre } = req.body;
  if (!nombre) {
    return res.status(400).json({ error: "El nombre es requerido" });
  }
  try {
    const info = dbDevol.prepare("INSERT INTO devoluciones_areas (nombre) VALUES (?)").run(nombre);
    res.status(201).json({ id: info.lastInsertRowid, nombre });
  } catch (err) {
    console.error("POST /devoluciones/areas:", err);
    res.status(500).json({ error: "Error guardando el área" });
  }
});

router.get("/calidad/areas", authRequired, (req, res) => {
  try {
    dbDevol.exec(`
      CREATE TABLE IF NOT EXISTS calidad_areas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL UNIQUE
      )
    `);
    
    const areasDefault = ["Pedidos", "Plataformas", "Retail"];
    for (const area of areasDefault) {
      try {
        dbDevol.prepare("INSERT INTO calidad_areas (nombre) VALUES (?)").run(area);
      } catch (e) {
      }
    }
    
    try {
      dbDevol.prepare("DELETE FROM calidad_areas WHERE nombre = ?").run("Plataformas Retail");
    } catch (e) {
    }
    
    const rows = dbDevol.prepare("SELECT * FROM calidad_areas ORDER BY nombre").all();
    res.json(rows);
  } catch (err) {
    console.error("GET /devoluciones/calidad/areas:", err);
    res.status(500).json({ error: "Error cargando áreas de calidad" });
  }
});

router.post("/calidad/areas", authRequired, (req, res) => {
  const { nombre } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: "El nombre es requerido" });
  }
  try {
    // Crear tabla si no existe
    dbDevol.exec(`
      CREATE TABLE IF NOT EXISTS calidad_areas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL UNIQUE
      )
    `);
    
    const info = dbDevol.prepare("INSERT INTO calidad_areas (nombre) VALUES (?)").run(nombre.trim());
    res.status(201).json({ id: info.lastInsertRowid, nombre: nombre.trim() });
  } catch (err) {
    if (err.message.includes("UNIQUE")) {
      return res.status(400).json({ error: "Esta área ya existe" });
    }
    console.error("POST /devoluciones/calidad/areas:", err);
    res.status(500).json({ error: "Error guardando el área" });
  }
});

router.get("/calidad", authRequired, (req, res) => {
  try {
    const rows = dbDevol.prepare(`
        SELECT 
            dp.id,
            dp.nombre as nombre_producto,
            dp.cantidad,
            dp.codigo_calidad,
            dp.activo,
            d.area
        FROM devoluciones_productos dp
        JOIN devoluciones_pedidos d ON dp.devolucion_id = d.id
        WHERE d.area = 'Calidad'
        ORDER BY d.fecha DESC
    `).all();
    res.json(rows);
  } catch (err) {
    console.error("GET /devoluciones/calidad:", err);
    res.status(500).json({ error: "Error cargando devoluciones de calidad" });
  }
});

router.get("/noaptos", authRequired, (req, res) => {
  try {
    const rows = dbDevol.prepare(`
        SELECT 
            dp.id,
            dp.codigo,
            dp.nombre as nombre_producto,
            dp.lote,
            dp.cantidad,
            dp.caducidad,
            dp.apto,
            dp.activo,
            d.pedido,
            d.area,
            d.fecha
        FROM devoluciones_productos dp
        JOIN devoluciones_pedidos d ON dp.devolucion_id = d.id
        WHERE dp.apto = 0
        ORDER BY d.fecha DESC, dp.id DESC
    `).all();
    res.json(rows);
  } catch (err) {
    console.error("GET /devoluciones/noaptos:", err);
    res.status(500).json({ error: "Error cargando productos no aptos" });
  }
});

router.put("/producto/:id/apto", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    const { apto } = req.body;

    // Obtener información del producto antes de actualizar
    const producto = dbDevol
      .prepare(
        `SELECT dp.*, d.area, d.pedido, d.fecha
         FROM devoluciones_productos dp
         JOIN devoluciones_pedidos d ON d.id = dp.devolucion_id
         WHERE dp.id = ?`
      )
      .get(id);

    if (!producto) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    // Normalizar apto: convertir boolean a número si es necesario
    let aptoNormalizado = apto;
    if (apto !== undefined) {
      if (typeof apto === 'boolean') {
        aptoNormalizado = apto ? 1 : 0;
      } else if (typeof apto === 'string') {
        aptoNormalizado = (apto === 'true' || apto === '1') ? 1 : 0;
      } else {
        aptoNormalizado = apto ? 1 : 0;
      }
    }

    // Verificar si el producto cambió de apto a no apto (para copia automática)
    const aptoActual = producto.apto === 1 || producto.apto === '1' ? 1 : 0;
    const cambioAptoANoApto = aptoNormalizado === 0 && aptoActual === 1;

    // Actualizar el campo apto
    dbDevol
      .prepare("UPDATE devoluciones_productos SET apto = ? WHERE id = ?")
      .run(aptoNormalizado !== undefined ? aptoNormalizado : (apto ? 1 : 0), id);

    // Si se marca como apto, también mover el área a "Calidad" si no está ya ahí
    if (aptoNormalizado === 1 && producto.area !== "Calidad") {
      dbDevol
        .prepare("UPDATE devoluciones_pedidos SET area = 'Calidad' WHERE id = ?")
        .run(producto.devolucion_id);
    }

    // Si se marcó como "no apto" (cambió de apto a no apto), 
    // copiar automáticamente a Control de Calidad - Área de Proceso - Devoluciones
    if (cambioAptoANoApto) {
      try {
        const fechaActual = dayjs().format("YYYY-MM-DD");
        
        // Verificar si ya existe un registro similar en calidad_registros para evitar duplicados
        const existeRegistro = dbDevol
          .prepare(`
            SELECT id FROM calidad_registros 
            WHERE area = 'Devoluciones' 
            AND codigo = ? 
            AND pedido = ? 
            AND lote = ?
            AND cantidad = ?
          `)
          .get(
            producto.codigo || '',
            producto.pedido || '',
            producto.lote || '',
            producto.cantidad || 0
          );
        
        if (!existeRegistro) {
          // Crear registro en calidad_registros
          const info = dbDevol.prepare(`
            INSERT INTO calidad_registros 
            (area, fecha, pedido, codigo, producto, presentacion, cantidad, lote, caducidad, 
             recibido_calidad, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).run(
            'Devoluciones', // Área de Proceso dentro de Control de Calidad
            fechaActual,
            producto.pedido || '',
            producto.codigo || '',
            producto.nombre || '',
            producto.presentacion || '',
            producto.cantidad || 0,
            producto.lote || '',
            producto.caducidad || ''
          );
          
          // Emitir evento para actualizar Control de Calidad en tiempo real
          const io = getIO();
          if (io) {
            io.emit("calidad_registros_actualizados");
          }
        }
      } catch (err) {
        console.error("❌ Error copiando producto a Control de Calidad:", err);
        // No fallar la actualización principal si falla la copia
      }
      }

      registrarAccion({
      usuario: req.user?.name || req.user?.nickname,
      accion: apto ? "MARCAR_APTO_DEVOLUCIONES" : "MARCAR_NO_APTO_DEVOLUCIONES",
      detalle: `${apto ? 'Marcó como apto' : 'Marcó como no apto'} el producto "${producto.nombre || 'N/A'}" (Código: ${producto.codigo || 'N/A'}) en pestaña Control de Calidad - No Aptos`,
      tabla: "devoluciones_productos",
      registroId: id,
    });

    // Emitir evento de actualización en tiempo real
    const io = getIO();
    if (io) {
      io.emit("devoluciones_actualizadas");
    }

    res.json({ ok: true, message: apto ? "Producto marcado como apto" : "Producto marcado como no apto" });
  } catch (err) {
    console.error("❌ Error actualizando apto del producto:", err);
    res.status(500).json({ error: "Error al actualizar producto" });
  }
});

router.put("/calidad/:id", authRequired, (req, res) => {
    const { id } = req.params;
    const { area, codigo } = req.body;

    try {
        // Primero, actualizamos el código de calidad en la tabla de productos
        dbDevol.prepare("UPDATE devoluciones_productos SET codigo_calidad = ? WHERE id = ?").run(codigo, id);

        // Luego, si el área se está cambiando, actualizamos el área en el pedido asociado
        if (area) {
            const row = dbDevol.prepare("SELECT devolucion_id FROM devoluciones_productos WHERE id = ?").get(id);
            if (row && row.devolucion_id) {
                dbDevol.prepare("UPDATE devoluciones_pedidos SET area = ? WHERE id = ?").run(area, row.devolucion_id);
            }
        }
        
        const updatedRecord = dbDevol.prepare(`
            SELECT 
                dp.id,
                dp.nombre as nombre_producto,
                dp.cantidad,
                dp.codigo_calidad,
                dp.activo,
                d.area
            FROM devoluciones_productos dp
            JOIN devoluciones_pedidos d ON dp.devolucion_id = d.id
            WHERE dp.id = ?
        `).get(id);

        res.json(updatedRecord);
    } catch (err) {
        console.error(`PUT /devoluciones/calidad/${id}:`, err);
        res.status(500).json({ error: "Error actualizando la devolución" });
    }
});

dbDevol.exec(`
  CREATE TABLE IF NOT EXISTS calidad_registros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    area TEXT NOT NULL,
    fecha TEXT,
    pedido TEXT,
    codigo TEXT,
    producto TEXT,
    presentacion TEXT,
    cantidad INTEGER,
    lote TEXT,
    caducidad TEXT,
    laboratorio TEXT,
    clasificacion_etiqueta TEXT,
    defecto TEXT,
    recibido_calidad INTEGER DEFAULT 0,
    destino TEXT,
    comentarios_calidad TEXT,
    evidencias TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS calidad_opciones_laboratorio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS calidad_opciones_clasificacion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS calidad_opciones_defecto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS calidad_opciones_destino (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Insertar opciones por defecto
const opcionesDefault = {
  laboratorio: ['GCE', 'ZUMA'],
  clasificacion: ['B', 'C', 'D', 'Importación'],
  defecto: ['Lote borrado', 'Impresión incorrecta', 'Abierto', 'Sin lote y caducidad', 'Caducidad borrada', 'Caducidad incompleta', 'Etiqueta cortada', 'Frasco abollado', 'Frasco cortado', 'Bote abollado', 'Bote roto', 'Empaque abollado', 'Mala impresión de lote', 'Sin sello externo'],
  destino: ['Reacondicionamiento', 'Outlet', 'Merma']
};

Object.entries(opcionesDefault).forEach(([tipo, opciones]) => {
  const tabla = `calidad_opciones_${tipo}`;
  opciones.forEach(nombre => {
    try {
      dbDevol.prepare(`INSERT INTO ${tabla} (nombre) VALUES (?)`).run(nombre);
    } catch (e) {
      // Ya existe, continuar
    }
  });
});

// Migración: Agregar columna codigo si no existe
try {
  // Verificar si la columna codigo existe
  const tableInfo = dbDevol.prepare(`PRAGMA table_info(calidad_registros)`).all();
  const tieneCodigo = tableInfo.some(col => col.name === 'codigo');
  
  if (!tieneCodigo) {
    console.log('📝 Agregando columna codigo a calidad_registros...');
    dbDevol.exec(`ALTER TABLE calidad_registros ADD COLUMN codigo TEXT`);
  }
} catch (e) {
  // Si hay error, probablemente la tabla no existe aún, se creará con el CREATE TABLE
  console.log('⚠️ No se pudo agregar columna codigo (la tabla se creará con la columna):', e.message);
}

router.get("/calidad/registros", authRequired, (req, res) => {
  try {
    const area = req.query.area || 'Devoluciones';
    const rows = dbDevol.prepare(`
      SELECT * FROM calidad_registros 
      WHERE area = ? 
      ORDER BY fecha DESC, id DESC
    `).all(area);
    
    // Parsear evidencias si es JSON
    const registros = rows.map(row => ({
      ...row,
      evidencias: row.evidencias ? (() => {
        try {
          return JSON.parse(row.evidencias);
        } catch {
          return [];
        }
      })() : []
    }));
    
    res.json(registros);
  } catch (err) {
    console.error("GET /devoluciones/calidad/registros:", err);
    res.status(500).json({ error: "Error cargando registros" });
  }
});

router.get("/calidad/registros/:id", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📥 GET /devoluciones/calidad/registros/${id} - Solicitando registro`);
    
    const registro = dbDevol.prepare("SELECT * FROM calidad_registros WHERE id = ?").get(id);
    
    if (!registro) {
      console.log(`❌ Registro ID ${id} no encontrado`);
      return res.status(404).json({ error: "Registro no encontrado" });
    }
    
    
    // Parsear evidencias si es JSON
    if (registro.evidencias) {
      try {
        registro.evidencias = JSON.parse(registro.evidencias);
      } catch {
        registro.evidencias = [];
      }
    } else {
      registro.evidencias = [];
    }
    
    res.json(registro);
  } catch (err) {
    console.error("❌ GET /devoluciones/calidad/registros/:id:", err);
    res.status(500).json({ error: "Error cargando registro" });
  }
});

router.post("/calidad/registros", authRequired, (req, res) => {
  try {
    // Log removido para evitar saturar la consola
    
    const { area, fecha, pedido, codigo, producto, presentacion, cantidad, lote, caducidad } = req.body;
    
    if (!area) {
      console.error("❌ Error: El área es requerida");
      return res.status(400).json({ error: "El área es requerida" });
    }
    
    const fechaFinal = fecha || dayjs().format("YYYY-MM-DD");
    
    const info = dbDevol.prepare(`
      INSERT INTO calidad_registros 
      (area, fecha, pedido, codigo, producto, presentacion, cantidad, lote, caducidad, 
       recibido_calidad, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      area,
      fechaFinal,
      pedido || '',
      codigo || '',
      producto || '',
      presentacion || '',
      cantidad || 0,
      lote || '',
      caducidad || ''
    );
    
    
    const nuevoRegistro = dbDevol.prepare("SELECT * FROM calidad_registros WHERE id = ?").get(info.lastInsertRowid);
    
    // Parsear evidencias
    if (nuevoRegistro.evidencias) {
      try {
        nuevoRegistro.evidencias = JSON.parse(nuevoRegistro.evidencias);
      } catch {
        nuevoRegistro.evidencias = [];
      }
    } else {
      nuevoRegistro.evidencias = [];
    }
    
    res.status(201).json(nuevoRegistro);
  } catch (err) {
    console.error("❌ POST /devoluciones/calidad/registros:", err);
    res.status(500).json({ error: "Error creando registro", details: err.message });
  }
});

router.delete("/calidad/registros/:id", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    
    const registro = dbDevol.prepare("SELECT * FROM calidad_registros WHERE id = ?").get(id);
    
    if (!registro) {
      return res.status(404).json({ error: "Registro no encontrado" });
    }
    
    dbDevol.prepare("DELETE FROM calidad_registros WHERE id = ?").run(id);
    
    registrarAccion({
      usuario: req.user?.name || req.user?.nickname,
      accion: "ELIMINAR_REGISTRO_CALIDAD",
      detalle: `Eliminó registro de calidad (ID: ${id}, Área: ${registro.area || 'N/A'}, Producto: ${registro.producto || 'N/A'})`,
      tabla: "calidad_registros",
      registroId: id,
    });
    
    res.json({ ok: true, message: "Registro eliminado" });
  } catch (err) {
    console.error("DELETE /devoluciones/calidad/registros/:id:", err);
    res.status(500).json({ error: "Error eliminando registro" });
  }
});

router.put("/calidad/registros/:id", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    const campos = req.body;
    
    const camposPermitidos = [
      'area', 'fecha', 'pedido', 'codigo', 'producto', 'presentacion', 'cantidad', 'lote', 'caducidad',
      'laboratorio', 'clasificacion_etiqueta', 'defecto', 'recibido_calidad',
      'destino', 'comentarios_calidad', 'evidencias'
    ];
    
    const updates = [];
    const values = [];
    
    Object.entries(campos).forEach(([key, value]) => {
      if (camposPermitidos.includes(key)) {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    });
    
    if (updates.length === 0) {
      return res.status(400).json({ error: "No hay campos válidos para actualizar" });
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    
    dbDevol.prepare(`
      UPDATE calidad_registros 
      SET ${updates.join(', ')} 
      WHERE id = ?
    `).run(...values);
    
    const updated = dbDevol.prepare("SELECT * FROM calidad_registros WHERE id = ?").get(id);
    
    // Parsear evidencias
    if (updated.evidencias) {
      try {
        updated.evidencias = JSON.parse(updated.evidencias);
      } catch {
        updated.evidencias = [];
      }
    } else {
      updated.evidencias = [];
    }
    
    res.json(updated);
  } catch (err) {
    console.error("PUT /devoluciones/calidad/registros/:id:", err);
    res.status(500).json({ error: "Error actualizando registro" });
  }
});

router.post(
  "/calidad/registros/:id/evidencias",
  authRequired,
  upload.array("evidencias", 20),
  (req, res) => {
    try {
      const { id } = req.params;
      // Log removido para evitar saturar la consola
      
      // Verificar que el registro existe
      const registro = dbDevol
        .prepare("SELECT * FROM calidad_registros WHERE id = ?")
        .get(id);
      
      if (!registro) {
        console.log(`❌ Registro ID ${id} no encontrado al intentar subir evidencias`);
        return res.status(404).json({ error: "Registro no encontrado" });
      }
      
      const files = req.files || [];
      if (files.length === 0) {
        console.log(`⚠️ No se recibieron archivos para registro ID ${id}`);
        return res.status(400).json({ error: "No se recibieron archivos" });
      }
      
      // Log removido para evitar saturar la consola
      
      // Construir array de evidencias
      const evidenciasPaths = files.map((file, idx) => ({
        id: Date.now() + idx,
        path: file.filename,
        nombre: file.originalname || `Evidencia ${idx + 1}`
      }));
      
      // Obtener evidencias existentes
      let evidenciasExistentes = [];
      if (registro.evidencias) {
        try {
          evidenciasExistentes = JSON.parse(registro.evidencias);
        } catch {
          evidenciasExistentes = [];
        }
      }
      
      // Combinar con las nuevas
      const todasLasEvidencias = [...evidenciasExistentes, ...evidenciasPaths];
      
      // Actualizar registro
      dbDevol.prepare(`
        UPDATE calidad_registros 
        SET evidencias = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(JSON.stringify(todasLasEvidencias), id);
      
      registrarAccion({
        usuario: req.user?.name || req.user?.nickname,
        accion: "SUBIR_EVIDENCIAS_CALIDAD",
        detalle: `Subió ${files.length} evidencia(s) para registro de calidad ${id}`,
        tabla: "calidad_registros",
        registroId: id,
      });
      
      // Emitir eventos de actualización en tiempo real
      const io = getIO();
      if (io) {
        io.emit("calidad_registros_actualizados");
        io.emit("devoluciones_actualizadas");
      }
      
      res.json({ ok: true, count: files.length, paths: evidenciasPaths.map(e => e.path) });
    } catch (err) {
      console.error("❌ Error guardando evidencias de calidad:", err);
      res.status(500).json({ error: "Error al guardar evidencias", details: err.message });
    }
  }
);

router.get("/calidad/buscar-producto/:codigo", authRequired, (req, res) => {
  try {
    const { codigo } = req.params;
    
    if (!codigo) {
      return res.status(400).json({ error: "El código es requerido" });
    }
    
    // Buscar en el inventario
    const producto = dbInv.prepare(`
      SELECT codigo, nombre, COALESCE(presentacion, '') AS presentacion
      FROM productos_ref 
      WHERE codigo = ?
    `).get(codigo);
    
    if (!producto) {
      return res.status(404).json({ error: "Producto no encontrado en inventario" });
    }
    
    // Usar el campo presentacion directamente si existe, sino intentar extraer del nombre
    let nombreProducto = producto.nombre || '';
    let presentacionProducto = producto.presentacion || '';
    
    // Si no hay presentación en la BD pero el nombre tiene formato "Nombre - Presentación", extraer
    if (!presentacionProducto && nombreProducto) {
      const separadores = [' - ', ' | ', ' / ', '(', '['];
      let indiceSeparador = -1;
      let separadorEncontrado = null;
      
      for (const sep of separadores) {
        const index = nombreProducto.lastIndexOf(sep);
        if (index > 0 && index > indiceSeparador) {
          indiceSeparador = index;
          separadorEncontrado = sep;
        }
      }
      
      if (indiceSeparador > 0 && separadorEncontrado) {
        const nombreTemp = nombreProducto.substring(0, indiceSeparador).trim();
        presentacionProducto = nombreProducto.substring(indiceSeparador + separadorEncontrado.length).trim();
        
        if (separadorEncontrado === '(' || separadorEncontrado === '[') {
          presentacionProducto = presentacionProducto.replace(/[)\]]$/, '').trim();
        }
        
        nombreProducto = nombreTemp;
      }
    }
    
    const nombreCompleto = obtenerNombreCompleto(nombreProducto, presentacionProducto);
    
    res.json({
      codigo: producto.codigo,
      nombre: nombreProducto,
      presentacion: presentacionProducto,
      nombreCompleto: nombreCompleto
    });
  } catch (err) {
    console.error("GET /devoluciones/calidad/buscar-producto/:codigo:", err);
    res.status(500).json({ error: "Error buscando producto" });
  }
});

router.get("/calidad/opciones/:tipo", authRequired, (req, res) => {
  try {
    const { tipo } = req.params;
    const tiposValidos = ['laboratorio', 'clasificacion', 'defecto', 'destino'];
    
    if (!tiposValidos.includes(tipo)) {
      return res.status(400).json({ error: "Tipo inválido" });
    }
    
    const tabla = `calidad_opciones_${tipo}`;
    const rows = dbDevol.prepare(`SELECT * FROM ${tabla} ORDER BY nombre`).all();
    res.json(rows);
  } catch (err) {
    console.error(`GET /devoluciones/calidad/opciones/${req.params.tipo}:`, err);
    res.status(500).json({ error: "Error cargando opciones" });
  }
});

router.delete("/calidad/opciones/:tipo/:id", authRequired, (req, res) => {
  try {
    const { tipo, id } = req.params;
    const tabla = `calidad_${tipo}`;
    
    // Verificar que la tabla existe
    const tableExists = dbDevol.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name=?
    `).get(tabla);
    
    if (!tableExists) {
      return res.status(404).json({ error: "Tipo de opción no encontrado" });
    }
    
    dbDevol.prepare(`DELETE FROM ${tabla} WHERE id = ?`).run(id);
    
    registrarAccion({
      usuario: req.user?.name || req.user?.nickname,
      accion: "ELIMINAR_OPCION_CALIDAD",
      detalle: `Eliminó opción de ${tipo} (ID: ${id})`,
      tabla: tabla,
      registroId: id,
    });
    
    res.json({ ok: true, message: "Opción eliminada" });
  } catch (err) {
    console.error(`DELETE /devoluciones/calidad/opciones/${req.params.tipo}/${req.params.id}:`, err);
    res.status(500).json({ error: "Error eliminando opción" });
  }
});

router.put("/calidad/opciones/:tipo/:id", authRequired, (req, res) => {
  try {
    const { tipo, id } = req.params;
    const { nombre } = req.body;
    const tabla = `calidad_${tipo}`;
    
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: "El nombre es requerido" });
    }
    
    // Verificar que la tabla existe
    const tableExists = dbDevol.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name=?
    `).get(tabla);
    
    if (!tableExists) {
      return res.status(404).json({ error: "Tipo de opción no encontrado" });
    }
    
    dbDevol.prepare(`UPDATE ${tabla} SET nombre = ? WHERE id = ?`).run(nombre.trim(), id);
    
    registrarAccion({
      usuario: req.user?.name || req.user?.nickname,
      accion: "ACTUALIZAR_OPCION_CALIDAD",
      detalle: `Actualizó opción de ${tipo} (ID: ${id}) a "${nombre.trim()}"`,
      tabla: tabla,
      registroId: id,
    });
    
    res.json({ ok: true, message: "Opción actualizada" });
  } catch (err) {
    console.error(`PUT /devoluciones/calidad/opciones/${req.params.tipo}/${req.params.id}:`, err);
    res.status(500).json({ error: "Error actualizando opción" });
  }
});

router.post("/calidad/opciones/:tipo", authRequired, (req, res) => {
  try {
    const { tipo } = req.params;
    const { nombre } = req.body;
    
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: "El nombre es requerido" });
    }
    
    const tiposValidos = ['laboratorio', 'clasificacion', 'defecto', 'destino'];
    if (!tiposValidos.includes(tipo)) {
      return res.status(400).json({ error: "Tipo inválido" });
    }
    
    const tabla = `calidad_opciones_${tipo}`;
    const info = dbDevol.prepare(`INSERT INTO ${tabla} (nombre) VALUES (?)`).run(nombre.trim());
    
    res.status(201).json({ id: info.lastInsertRowid, nombre: nombre.trim() });
  } catch (err) {
    if (err.message.includes("UNIQUE")) {
      return res.status(400).json({ error: "Esta opción ya existe" });
    }
    console.error(`POST /devoluciones/calidad/opciones/${req.params.tipo}:`, err);
    res.status(500).json({ error: "Error guardando la opción" });
  }
});

// =====================================================
// DEVOLUCIONES DE CLIENTES
// =====================================================

router.post(
  "/clientes",
  upload.array("evidencias", 20),
  (req, res) => {
    try {
      const { pedido, guia, paqueteria, motivo, area, usuario, productos } =
        req.body;

      // Log removido para evitar saturar la consola

      if (!pedido || pedido.trim() === "")
        return res.status(400).json({ error: "Falta número de pedido" });

      let productosParsed = [];
      if (productos) {
        try {
          const productosData = typeof productos === 'string' ? JSON.parse(productos) : productos;
          productosParsed = groupProductos(Array.isArray(productosData) ? productosData : []);
        } catch (parseErr) {
          console.error("❌ Error parseando productos:", parseErr);
          return res.status(400).json({ error: "Error en formato de productos: " + parseErr.message });
        }
      }

      const horaPedido = dayjs().format("HH:mm:ss");
      const insertDev = dbDevol.prepare(`
        INSERT INTO devoluciones_pedidos 
          (pedido, guia, paqueteria, motivo, area, usuario, hora)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const infoDev = insertDev.run(
        pedido,
        guia || null,
        paqueteria || null,
        motivo || null,
        area || "Clientes",
        usuario || null,
        horaPedido
      );

      const devolucionId = infoDev.lastInsertRowid;

      const insertProd = dbDevol.prepare(`
        INSERT INTO devoluciones_productos
          (devolucion_id, codigo, nombre, presentacion, lote, cantidad, caducidad, apto, activo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Insertar también en productos_general (copia independiente)
      const insertProdGeneral = dbDevol.prepare(`
        INSERT INTO devoluciones_productos_general
          (codigo, nombre, presentacion, lote, cantidad, caducidad, apto, activo, pedido, fecha)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const fechaActual = dayjs().format("YYYY-MM-DD");

      for (const p of productosParsed) {
        insertProd.run(
          devolucionId,
          p.codigo || "",
          p.nombre || "",
          p.presentacion || "",
          p.lote || "",
          Number(p.cantidad || 0),
          p.caducidad || null,
          p.apto ? 1 : 0,
          0  // Los productos se agregan DESACTIVADOS por defecto
        );
        
        // Copiar a productos_general (copia independiente)
        insertProdGeneral.run(
          p.codigo || "",
          p.nombre || "",
          p.presentacion || "",
          p.lote || "",
          Number(p.cantidad || 0),
          p.caducidad || null,
          p.apto ? 1 : 0,
          0,  // Los productos se agregan DESACTIVADOS por defecto
          pedido,
          fechaActual
        );
      }

      const nombrePedido = (pedido || String(devolucionId))
        .replace(/[<>:"/\\|?*]/g, '_')
        .trim();
      
      const carpetaPedido = path.join(uploadDir, nombrePedido);
      if (!fs.existsSync(carpetaPedido)) {
        fs.mkdirSync(carpetaPedido, { recursive: true });
      }

      const insertFoto = dbDevol.prepare(`
        INSERT INTO devoluciones_fotos (devolucion_id, path)
        VALUES (?, ?)
      `);

      // Logs removidos para evitar saturar la consola
      if (!fs.existsSync(carpetaPedido)) {
        fs.mkdirSync(carpetaPedido, { recursive: true });
      }
      
      for (const file of req.files || []) {
        let filePathOriginal = file.path;
        if (!filePathOriginal) {
          filePathOriginal = path.join(uploadDir, file.filename);
        }
        if (!path.isAbsolute(filePathOriginal)) {
          filePathOriginal = path.resolve(filePathOriginal);
        }
        
        const nuevoPath = path.join(carpetaPedido, file.filename);
        const finalPath = `${nombrePedido}/${file.filename}`;
        
        
        try {
          if (fs.existsSync(filePathOriginal)) {
            if (!filePathOriginal.includes(nombrePedido)) {
              if (!fs.existsSync(carpetaPedido)) {
                fs.mkdirSync(carpetaPedido, { recursive: true });
                console.log(`📁 Carpeta creada: ${carpetaPedido}`);
              }
              
              fs.renameSync(filePathOriginal, nuevoPath);
              if (!fs.existsSync(nuevoPath)) {
                console.error(`❌ ERROR: Archivo no existe después de mover`);
              }
            }
          } else if (fs.existsSync(nuevoPath)) {
            console.log(`ℹ️ Foto ya está en carpeta del pedido`);
          } else {
            console.error(`❌ ERROR: Archivo no encontrado en ${filePathOriginal} ni en ${nuevoPath}`);
            const posiblesRutas = [
              path.join(uploadDir, file.filename),
              path.join(uploadDir, "_temp", file.filename),
              path.resolve(uploadDir, file.filename),
            ];
            let encontrado = false;
            for (const ruta of posiblesRutas) {
              if (fs.existsSync(ruta)) {
                console.log(`ℹ️ Archivo encontrado en ubicación alternativa: ${ruta}`);
                try {
                  if (!fs.existsSync(carpetaPedido)) {
                    fs.mkdirSync(carpetaPedido, { recursive: true });
                  }
                  fs.renameSync(ruta, nuevoPath);
                  encontrado = true;
                  break;
                } catch (e) {
                  console.error(`⚠️ Error moviendo desde ${ruta}:`, e);
                }
              }
            }
            if (!encontrado) {
              console.error(`❌ No se encontró el archivo en ninguna ubicación`);
            }
          }
          
          insertFoto.run(devolucionId, finalPath);
          
        } catch (moveErr) {
          console.error(`⚠️ Error procesando foto ${file.filename}:`, moveErr);
          console.error(`⚠️ Stack:`, moveErr.stack);
          insertFoto.run(devolucionId, finalPath);
        }
      }

      const fotosGuardadas = dbDevol
        .prepare("SELECT * FROM devoluciones_fotos WHERE devolucion_id = ?")
        .all(devolucionId);

      const io = getIO();
      if (io) {
        io.emit("devoluciones_actualizadas");
        io.emit("pedido_agregado", { id: devolucionId, pedido, area });
        // También emitir evento para actualizar productos general en tiempo real
        io.emit("productos_general_actualizados");
      }

      const productosInfo = productosParsed.map(p => 
        `"${p.nombre || 'N/A'}" (Código: ${p.codigo || 'N/A'}, Lote: ${p.lote || 'N/A'}, Cantidad: ${p.cantidad || 0})`
      ).join(", ");
      
      registrarAccion({
        usuario: req.user?.name || req.user?.nickname,
        accion: "AGREGAR_PEDIDO_DEVOLUCIONES",
        detalle: `Agregó pedido "${pedido}" (Guía: ${guia || 'N/A'}, Paquetería: ${paqueteria || 'N/A'}) con ${productosParsed.length} productos en pestaña Devoluciones - Clientes: ${productosInfo}`,
        tabla: "devoluciones_pedidos",
        registroId: devolucionId,
      });

      res.json({ ok: true, id: devolucionId, fotosGuardadas: fotosGuardadas.length });
    } catch (err) {
      console.error("❌ Error guardando devolución:", err);
      res.status(500).json({ error: "Error al guardar devolución" });
    }
  }
);

router.get("/clientes/pedidos", (req, res) => {
  try {
    const { area, incluir_historicos } = req.query;
    const areaFiltro = area || "Clientes";
    const incluirHist = incluir_historicos === "true" || incluir_historicos === "1";
    
    // SIEMPRE obtener pedidos actuales (sin fecha_cierre)
    // Usar GROUP BY para evitar duplicados del mismo pedido
    let queryActual = `
      SELECT 
        MAX(id) as id,
        pedido,
        MAX(guia) as guia,
        MAX(paqueteria) as paqueteria,
        MAX(motivo) as motivo,
        area,
        MAX(usuario) as usuario,
        MAX(fecha) as fecha,
        MAX(hora) as hora,
        'actual' AS origen
      FROM devoluciones_pedidos 
      WHERE area = ? 
      GROUP BY pedido, area
      ORDER BY MAX(fecha) DESC, MAX(id) DESC
    `;
    const paramsActual = [areaFiltro];
    
    const pedidosActuales = dbDevol
      .prepare(queryActual)
      .all(...paramsActual);
    
    // Solo incluir históricos si se solicita explícitamente (para reportes)
    let pedidosHistoricos = [];
    if (incluirHist) {
      try {
        const tableExists = dbHist.prepare(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name='devoluciones_pedidos_hist'
        `).get();
        
        if (tableExists) {
          pedidosHistoricos = dbHist
            .prepare(`
              SELECT *, 'historico' AS origen 
              FROM devoluciones_pedidos_hist 
              WHERE area = ?
              ORDER BY COALESCE(fecha_cierre, fecha) DESC, id DESC
            `)
            .all(areaFiltro);
        }
      } catch (e) {
        console.warn("⚠️ No se pudieron obtener pedidos históricos:", e.message);
      }
    }
    
    // Si se solicitan históricos, combinarlos; si no, solo devolver actuales
    const todosLosPedidos = incluirHist ? [...pedidosActuales, ...pedidosHistoricos] : pedidosActuales;
    
    // Solo ordenar si hay históricos incluidos
    if (incluirHist && pedidosHistoricos.length > 0) {
      todosLosPedidos.sort((a, b) => {
        const fechaA = a.fecha_cierre || a.fecha || '';
        const fechaB = b.fecha_cierre || b.fecha || '';
        if (fechaA !== fechaB) {
          return fechaB.localeCompare(fechaA);
        }
        return (b.id || 0) - (a.id || 0);
      });
    }
    
    res.json(todosLosPedidos);
  } catch (err) {
    console.error("❌ Error listando pedidos:", err);
    res.status(500).json({ error: "Error listando pedidos" });
  }
});

// =====================================================
// PRODUCTOS GENERAL (Copia independiente)
// ⚠️ IMPORTANTE: Esta ruta debe ir ANTES de /clientes/productos/:id
// para evitar que Express la capture como parámetro
// =====================================================

router.get("/clientes/productos-general", (req, res) => {
  try {
    // Verificar si la tabla existe
    const tableExists = dbDevol
      .prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='devoluciones_productos_general'
      `)
      .get();
    
    if (!tableExists) {
      console.log("ℹ️ Tabla devoluciones_productos_general no existe aún, devolviendo array vacío");
      return res.json([]);
    }
    
    const productos = dbDevol
      .prepare(`
        SELECT 
          id,
          codigo,
          nombre,
          COALESCE(presentacion, '') AS presentacion,
          lote,
          cantidad,
          caducidad,
          activo,
          apto,
          pedido,
          fecha
        FROM devoluciones_productos_general
        ORDER BY fecha DESC, id DESC
      `)
      .all();
    
    res.json(productos);
  } catch (err) {
    console.error("❌ Error listando productos general:", err);
    // Si la tabla no existe, devolver array vacío en lugar de error
    if (err.message && (err.message.includes("no such table") || err.message.includes("does not exist"))) {
      console.log("ℹ️ Tabla devoluciones_productos_general no existe aún, devolviendo array vacío");
      return res.json([]);
    }
    res.status(500).json({ error: "Error listando productos general" });
  }
});

router.put("/clientes/productos-general/:id/activo", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;
    
    const activoValue = activo === true || activo === 1 || activo === "1" ? 1 : 0;
    
    // Si se intenta activar, verificar que el producto sea apto
    if (activoValue === 1) {
      const producto = dbDevol
        .prepare(`SELECT apto FROM devoluciones_productos_general WHERE id = ?`)
        .get(id);
      
      if (!producto) {
        return res.status(404).json({ error: "Producto no encontrado" });
      }
      
      // Verificar si el producto es "no apto"
      const esNoApto = producto.apto !== 1 && producto.apto !== true && producto.apto !== '1';
      if (esNoApto) {
        return res.status(400).json({ error: "Los productos no aptos no se pueden activar" });
      }
    }
    
    dbDevol
      .prepare(`UPDATE devoluciones_productos_general SET activo = ? WHERE id = ?`)
      .run(activoValue, id);
    
    getIO().emit("productos_general_actualizados");
    
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error actualizando activo:", err);
    res.status(500).json({ error: "Error actualizando activo" });
  }
});

router.put("/clientes/productos-general/:id", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    const { codigo, nombre, presentacion, lote, cantidad, caducidad, apto, activo } = req.body;
    
    const updates = [];
    const params = [];
    
    if (codigo !== undefined) {
      updates.push("codigo = ?");
      params.push(codigo);
    }
    if (nombre !== undefined) {
      updates.push("nombre = ?");
      params.push(nombre);
    }
    if (presentacion !== undefined) {
      updates.push("presentacion = ?");
      params.push(presentacion);
    }
    if (lote !== undefined) {
      updates.push("lote = ?");
      params.push(lote);
    }
    if (cantidad !== undefined) {
      updates.push("cantidad = ?");
      params.push(Number(cantidad));
    }
    if (caducidad !== undefined) {
      updates.push("caducidad = ?");
      params.push(caducidad);
    }
    if (apto !== undefined) {
      updates.push("apto = ?");
      params.push(apto === true || apto === 1 || apto === "1" ? 1 : 0);
    }
    if (activo !== undefined) {
      updates.push("activo = ?");
      params.push(activo === true || activo === 1 || activo === "1" ? 1 : 0);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: "No hay campos para actualizar" });
    }
    
    params.push(id);
    
    dbDevol
      .prepare(`UPDATE devoluciones_productos_general SET ${updates.join(", ")} WHERE id = ?`)
      .run(...params);
    
    getIO().emit("productos_general_actualizados");
    
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error actualizando producto general:", err);
    res.status(500).json({ error: "Error actualizando producto general" });
  }
});

router.delete("/clientes/productos-general/:id", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    
    // Validar que el producto existe
    const producto = dbDevol
      .prepare(`SELECT id FROM devoluciones_productos_general WHERE id = ?`)
      .get(id);
    
    if (!producto) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }
    
    dbDevol
      .prepare(`DELETE FROM devoluciones_productos_general WHERE id = ?`)
      .run(id);
    
    getIO().emit("productos_general_actualizados");
    
    res.json({ ok: true, message: "Producto eliminado correctamente" });
  } catch (err) {
    console.error("❌ Error eliminando producto general:", err);
    res.status(500).json({ error: "Error eliminando producto general" });
  }
});

router.get("/clientes/pedidos/:id/productos", (req, res) => {
  try {
    const { id } = req.params;
    const rows = dbDevol
      .prepare(
        `SELECT p.*, d.pedido, d.fecha
         FROM devoluciones_productos p
         JOIN devoluciones_pedidos d ON d.id = p.devolucion_id
         WHERE d.id = ? AND d.area = 'Clientes'
         ORDER BY p.id ASC`
      )
      .all(id);
    res.json(rows);
  } catch (err) {
    console.error("❌ Error listando productos del pedido:", err);
    res.status(500).json({ error: "Error listando productos del pedido" });
  }
});

router.delete("/clientes/pedidos/:id", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    
    
    // Verificar si el pedido existe en DEVOLUCIONES (no reenvíos)
    // Buscar primero en tabla actual, luego en histórica
    let pedido = dbDevol
      .prepare("SELECT * FROM devoluciones_pedidos WHERE id = ?")
      .get(id);
    
    let esHistorico = false;
    
    // Si no está en la tabla actual, buscar en histórica
    if (!pedido) {
      try {
        const tableExists = dbHist.prepare(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name='devoluciones_pedidos_hist'
        `).get();
        
        if (tableExists) {
          pedido = dbHist
            .prepare("SELECT * FROM devoluciones_pedidos_hist WHERE id = ?")
            .get(id);
          esHistorico = !!pedido;
        }
      } catch (e) {
        console.warn("⚠️ Error buscando en tabla histórica:", e.message);
      }
    }
    
    if (!pedido) {
      console.log(`❌ Pedido ID ${id} no encontrado en devoluciones_pedidos ni en histórica`);
      return res.status(404).json({ error: "Pedido no encontrado en devoluciones" });
    }
    
    
    // Eliminar pedido de DEVOLUCIONES (actual o histórico)
    
    if (esHistorico) {
      // Eliminar de tabla histórica
      dbHist.pragma("foreign_keys = OFF");
      
      // Eliminar productos históricos del pedido
      try {
        dbHist.prepare("DELETE FROM devoluciones_clientes_hist WHERE devolucion_id = ?").run(id);
      } catch (e) {
        console.warn("⚠️ No se pudieron eliminar productos históricos:", e.message);
      }
      
      // Eliminar el pedido histórico
      const resultado = dbHist
        .prepare("DELETE FROM devoluciones_pedidos_hist WHERE id = ?")
        .run(id);
      
      dbHist.pragma("foreign_keys = ON");
      
      // Emitir eventos
      getIO().emit("devoluciones_actualizadas", []);
      getIO().emit("pedido_eliminado", { id, pedido: pedido.pedido });
      
      // Auditoría
      registrarAccion({
        usuario: req.user?.name || req.user?.nickname,
        accion: "ELIMINAR_PEDIDO_DEVOLUCIONES_HIST",
        detalle: `Eliminó pedido histórico "${pedido.pedido}" (ID: ${id}) de devoluciones`,
        tabla: "devoluciones_pedidos_hist",
        registroId: id,
      });
      
      return res.json({ 
        success: true, 
        message: `Pedido histórico eliminado correctamente.`,
      });
    }
    
    // Eliminar de tabla actual
    // Desactivar temporalmente las restricciones de clave foránea
    dbDevol.pragma("foreign_keys = OFF");
    
    // Eliminar productos del pedido
    const productosEliminados = dbDevol
      .prepare("DELETE FROM devoluciones_productos WHERE devolucion_id = ?")
      .run(id);
    
    // Eliminar fotos del pedido (si existen)
    try {
      dbDevol.prepare("DELETE FROM devoluciones_fotos WHERE devolucion_id = ?").run(id);
    } catch (e) {
      console.warn("⚠️ No se pudieron eliminar fotos:", e.message);
    }
    
    // Eliminar el pedido
    const resultado = dbDevol
      .prepare("DELETE FROM devoluciones_pedidos WHERE id = ?")
      .run(id);
    
    // Reactivar las restricciones de clave foránea
    dbDevol.pragma("foreign_keys = ON");
    
    // Emitir eventos para actualizar frontend en tiempo real
    getIO().emit("devoluciones_actualizadas", []);
    getIO().emit("pedido_eliminado", { id, pedido: pedido.pedido });
    
    // Auditoría
    registrarAccion({
      usuario: req.user?.name || req.user?.nickname,
      accion: "ELIMINAR_PEDIDO_DEVOLUCIONES",
      detalle: `Eliminó pedido "${pedido.pedido}" (Guía: ${pedido.guia || 'N/A'}, Paquetería: ${pedido.paqueteria || 'N/A'}) con ${productosEliminados.changes} productos en pestaña Devoluciones - ${pedido.area || 'Clientes'}`,
      tabla: "devoluciones_pedidos",
      registroId: id,
    });
    
    res.json({ 
      success: true, 
      message: `Pedido eliminado. ${productosEliminados.changes} productos eliminados.`,
      productosEliminados: productosEliminados.changes
    });
  } catch (err) {
    console.error("❌ Error eliminando pedido:", err);
    // Asegurar que las restricciones se reactiven
    try {
      dbDevol.pragma("foreign_keys = ON");
    } catch (e) {}
    res.status(500).json({ error: "Error eliminando pedido", details: err.message });
  }
});

// Eliminar todos los productos sin pedido asociado
router.delete("/clientes/productos/sin-pedido", authRequired, (req, res) => {
  try {
    // Eliminar todos los productos sin pedido válido
    // Primero los que no tienen devolucion_id
    const resultado1 = dbDevol
      .prepare("DELETE FROM devoluciones_productos WHERE devolucion_id IS NULL")
      .run();
    
    // Luego los que tienen devolucion_id pero el pedido no existe o está vacío
    const resultado2 = dbDevol
      .prepare(`
        DELETE FROM devoluciones_productos 
        WHERE devolucion_id IS NOT NULL 
          AND devolucion_id NOT IN (
            SELECT id FROM devoluciones_pedidos 
            WHERE pedido IS NOT NULL AND pedido != '' AND area = 'Clientes'
          )
      `)
      .run();
    
    const totalEliminados = resultado1.changes + resultado2.changes;
    
    if (totalEliminados > 0) {
      // Emitir eventos para actualizar frontend en tiempo real
      getIO().emit("devoluciones_actualizadas", []);
      getIO().emit("productos_eliminados", { cantidad: totalEliminados });
      
      // Auditoría
      registrarAccion({
        usuario: req.user?.name || req.user?.nickname,
        accion: "ELIMINAR_PRODUCTOS_SIN_PEDIDO",
        detalle: `Eliminó ${totalEliminados} producto(s) sin pedido asociado en pestaña Devoluciones - Clientes`,
        tabla: "devoluciones_productos",
        registroId: null,
      });
    }
    
    res.json({ 
      success: true, 
      message: totalEliminados > 0 ? `Se eliminaron ${totalEliminados} producto(s) sin pedido asociado` : "No hay productos sin pedido asociado",
      eliminados: totalEliminados
    });
  } catch (err) {
    console.error("❌ Error eliminando productos sin pedido:", err);
    res.status(500).json({ error: "Error eliminando productos sin pedido", details: err.message });
  }
});

router.delete("/clientes/productos/:id", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar que el producto existe
    // Primero intentar buscar con JOIN (si tiene devolucion_id)
    let producto = dbDevol
      .prepare(`
        SELECT p.*, d.area 
        FROM devoluciones_productos p
        LEFT JOIN devoluciones_pedidos d ON d.id = p.devolucion_id
        WHERE p.id = ?
      `)
      .get(id);
    
    // Si no se encontró con JOIN, buscar directamente (productos sin pedido)
    if (!producto) {
      console.log(`⚠️ Producto no encontrado con JOIN, buscando directamente...`);
      producto = dbDevol
        .prepare("SELECT * FROM devoluciones_productos WHERE id = ?")
        .get(id);
    }
    
    if (!producto) {
      console.log(`❌ Producto ID ${id} no encontrado en devoluciones_productos`);
      // Verificar si existe en alguna otra tabla para dar un mensaje más útil
      const existeEnHist = dbHist.prepare("SELECT id FROM devoluciones_clientes_hist WHERE id = ?").get(id);
      if (existeEnHist) {
        return res.status(404).json({ error: "El producto ya fue movido al histórico y no puede eliminarse desde aquí" });
      }
      return res.status(404).json({ error: "Producto no encontrado" });
    }
    
    
    // Si el producto tiene devolucion_id, verificar que el pedido sea de Clientes
    if (producto.devolucion_id) {
      const pedido = dbDevol
        .prepare("SELECT area FROM devoluciones_pedidos WHERE id = ?")
        .get(producto.devolucion_id);
      
      if (pedido && pedido.area !== 'Clientes') {
        console.log(`⚠️ Producto ID ${id} pertenece a pedido de área "${pedido.area}", no Clientes`);
        return res.status(403).json({ error: "El producto no pertenece a la pestaña Clientes" });
      }
      
      // ⚠️ IMPORTANTE: Si el producto tiene devolucion_id (pertenece a un pedido),
      // NO eliminarlo físicamente para mantener las tarjetas completas.
      // En su lugar, marcarlo como eliminado usando un campo especial o simplemente
      // no mostrarlo en la tabla de productos, pero mantenerlo en la base de datos.
      // Para esto, agregamos un campo 'eliminado' o usamos 'activo = 0' y 'apto = 0' como marcador.
      // Como solución temporal, simplemente NO eliminamos productos con devolucion_id.
      console.log(`⚠️ Producto ID ${id} pertenece a pedido ${producto.devolucion_id}. No se eliminará físicamente para mantener la tarjeta completa.`);
      console.log(`ℹ️ El producto se ocultará de la tabla de productos pero permanecerá en la base de datos asociado al pedido.`);
      
      // Marcar como no activo y no apto para ocultarlo de la tabla, pero mantenerlo en la base de datos
      const resultado = dbDevol
        .prepare("UPDATE devoluciones_productos SET activo = 0, apto = 0 WHERE id = ?")
        .run(id);
      
      if (resultado.changes === 0) {
        console.log(`❌ No se pudo actualizar producto ID ${id} (resultado.changes = 0)`);
        return res.status(404).json({ error: "Producto no encontrado" });
      }
      
      console.log(`✅ Producto ID ${id} marcado como eliminado (oculto de tabla pero mantenido en pedido)`);
      
      // Emitir eventos para actualizar frontend en tiempo real
      getIO().emit("devoluciones_actualizadas", []);
      getIO().emit("producto_eliminado", { id, devolucion_id: producto.devolucion_id || null });
      
      // Auditoría
      registrarAccion({
        usuario: req.user?.name || req.user?.nickname,
        accion: "OCULTAR_PRODUCTO_DEVOLUCIONES",
        detalle: `Ocultó producto "${producto.nombre || 'N/A'}" (Código: ${producto.codigo || 'N/A'}, Lote: ${producto.lote || 'N/A'}) del pedido ${producto.devolucion_id} en pestaña Devoluciones - Clientes. El producto permanece en la tarjeta del pedido.`,
        tabla: "devoluciones_productos",
        registroId: id,
      });
      
      return res.json({ 
        success: true, 
        message: "Producto oculto de la tabla (permanece en el pedido)"
      });
    }
    
    // Si el producto NO tiene devolucion_id (no pertenece a un pedido), sí puede eliminarse físicamente
    const resultado = dbDevol
      .prepare("DELETE FROM devoluciones_productos WHERE id = ?")
      .run(id);
    
    if (resultado.changes === 0) {
      console.log(`❌ No se pudo eliminar producto ID ${id} (resultado.changes = 0)`);
      return res.status(404).json({ error: "Producto no encontrado" });
    }
    
    
    // Emitir eventos para actualizar frontend en tiempo real
    getIO().emit("devoluciones_actualizadas", []);
    getIO().emit("producto_eliminado", { id, devolucion_id: null });
    
    // Auditoría
    registrarAccion({
      usuario: req.user?.name || req.user?.nickname,
      accion: "ELIMINAR_PRODUCTO_DEVOLUCIONES",
      detalle: `Eliminó producto "${producto.nombre || 'N/A'}" (Código: ${producto.codigo || 'N/A'}, Lote: ${producto.lote || 'N/A'})${producto.devolucion_id ? ` del pedido ${producto.devolucion_id}` : ' (sin pedido asociado)'} en pestaña Devoluciones - Clientes`,
      tabla: "devoluciones_productos",
      registroId: id,
    });
    
    res.json({ 
      success: true, 
      message: "Producto eliminado correctamente"
    });
  } catch (err) {
    console.error("❌ Error eliminando producto:", err);
    res.status(500).json({ error: "Error eliminando producto", details: err.message });
  }
});

router.get("/foto-debug/:id", (req, res) => {
  try {
    const { id } = req.params;
    const devolucion = dbDevol
      .prepare("SELECT pedido FROM devoluciones_pedidos WHERE id = ?")
      .get(id);
    
    if (!devolucion) {
      return res.json({ error: "Devolución no encontrada" });
    }
    
    const fotos = dbDevol
      .prepare("SELECT * FROM devoluciones_fotos WHERE devolucion_id = ?")
      .all(id);
    
    const nombrePedido = (devolucion.pedido || String(id))
      .replace(/[<>:"/\\|?*]/g, '_')
      .trim();
    
    const carpetaPedido = path.join(uploadDir, nombrePedido);
    const raiz = uploadDir;
    
    const archivosEnCarpeta = fs.existsSync(carpetaPedido) 
      ? fs.readdirSync(carpetaPedido) 
      : [];
    
    const archivosEnRaiz = fs.existsSync(raiz)
      ? fs.readdirSync(raiz).filter(f => {
          const fullPath = path.join(raiz, f);
          try {
            return fs.statSync(fullPath).isFile();
          } catch {
            return false;
          }
        })
      : [];
    
    res.json({
      devolucion: {
        id,
        pedido: devolucion.pedido,
        nombrePedido
      },
      fotosEnBD: fotos,
      carpetaPedido: {
        ruta: carpetaPedido,
        existe: fs.existsSync(carpetaPedido),
        archivos: archivosEnCarpeta
      },
      raiz: {
        ruta: raiz,
        existe: fs.existsSync(raiz),
        archivos: archivosEnRaiz.slice(0, 20)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/clientes/fotos/:id", (req, res) => {
  try {
    const { id } = req.params;
    
    // Obtener el pedido para saber el nombre de la carpeta
    const pedido = dbDevol
      .prepare("SELECT pedido FROM devoluciones_pedidos WHERE id = ?")
      .get(id);
    
    if (!pedido) {
      return res.json([]);
    }
    
    const rows = dbDevol
      .prepare(
        `SELECT * FROM devoluciones_fotos 
         WHERE devolucion_id = ?
         ORDER BY id DESC`
      )
      .all(id);
    
    
    // Agregar URLs completas usando el endpoint de fotos
    const fotosConUrls = rows.map(foto => {
      // El path puede venir como "NOMBRE_PEDIDO/archivo.jpg" o solo "archivo.jpg"
      let archivo = foto.path;
      
      // Si el path incluye la carpeta, extraer solo el nombre del archivo
      if (archivo.includes('/')) {
        archivo = archivo.split('/').pop();
      }
      
      // Construir URL usando el endpoint de fotos
      const url = `${req.protocol}://${req.get("host")}/devoluciones/foto/${id}/${encodeURIComponent(archivo)}`;
      
      
      return {
        ...foto,
        url
      };
    });
    
    res.json(fotosConUrls);
  } catch (err) {
    console.error("❌ Error listando fotos:", err);
    res.status(500).json({ error: "Error listando fotos" });
  }
});

router.get("/foto/:id/:archivo", (req, res) => {
  try {
    const { id, archivo } = req.params;
    const archivoDecodificado = decodeURIComponent(archivo);
    
    
    // Obtener el pedido desde la base de datos
    const devolucion = dbDevol
      .prepare("SELECT pedido FROM devoluciones_pedidos WHERE id = ?")
      .get(id);

    if (!devolucion) {
      console.error(`❌ Devolución no encontrada: ID ${id}`);
      return res.status(404).send("Devolución no encontrada");
    }

    console.log(`📦 Pedido encontrado: ${devolucion.pedido}`);

    let file = null;
    const rutasIntentadas = [];
    
    // Intentar con el nombre del pedido
    if (devolucion.pedido) {
      const nombrePedido = (devolucion.pedido || String(id))
        .replace(/[<>:"/\\|?*]/g, '_')
        .trim();
      const filePath = path.join(
        uploadDir,
        nombrePedido,
        archivoDecodificado
      );
      rutasIntentadas.push(filePath);
      console.log(`📁 Intentando ruta 1 (carpeta pedido): ${filePath}`);
      if (fs.existsSync(filePath)) {
        file = filePath;
      } else {
        console.log(`❌ No existe en: ${filePath}`);
      }
    }
    
    // Si no se encontró, intentar en la raíz (compatibilidad con fotos antiguas)
    if (!file) {
      const filePath = path.join(
        uploadDir,
        archivoDecodificado
      );
      rutasIntentadas.push(filePath);
      console.log(`📁 Intentando ruta 2 (raíz): ${filePath}`);
      if (fs.existsSync(filePath)) {
        file = filePath;
      } else {
        console.log(`❌ No existe en: ${filePath}`);
      }
    }
    
    // Intentar también con el ID como nombre de carpeta (compatibilidad)
    if (!file) {
      const filePath = path.join(
        uploadDir,
        String(id),
        archivoDecodificado
      );
      rutasIntentadas.push(filePath);
      console.log(`📁 Intentando ruta 3 (carpeta ID): ${filePath}`);
      if (fs.existsSync(filePath)) {
        file = filePath;
      } else {
        console.log(`❌ No existe en: ${filePath}`);
      }
    }

    if (!file || !fs.existsSync(file)) {
      console.error(`❌ Foto no encontrada después de intentar ${rutasIntentadas.length} rutas:`);
      rutasIntentadas.forEach((ruta, i) => {
        console.error(`  ${i + 1}. ${ruta}`);
      });
      
      // Intentar listar archivos en la carpeta del pedido para debug
      if (devolucion.pedido) {
        const nombrePedido = (devolucion.pedido || String(id))
          .replace(/[<>:"/\\|?*]/g, '_')
          .trim();
        const carpetaPedido = path.join(uploadDir, nombrePedido);
        if (fs.existsSync(carpetaPedido)) {
          const archivos = fs.readdirSync(carpetaPedido);
          console.log(`📂 Archivos en carpeta ${nombrePedido}: ${archivos.join(', ')}`);
        } else {
          console.log(`📂 Carpeta ${nombrePedido} no existe`);
        }
      }
      
      // Listar archivos en la raíz
      const raiz = uploadDir;
      if (fs.existsSync(raiz)) {
        const archivos = fs.readdirSync(raiz).filter(f => {
          const fullPath = path.join(raiz, f);
          try {
            return fs.statSync(fullPath).isFile();
          } catch {
            return false;
          }
        });
        console.log(`📂 Archivos en raíz: ${archivos.slice(0, 10).join(', ')}${archivos.length > 10 ? '...' : ''}`);
      }
      
      return res.status(404).json({ error: "Foto no encontrada", rutasIntentadas });
    }
    
    console.log(`✅ Sirviendo foto desde: ${file}`);
    
    // Establecer headers correctos para imágenes
    const ext = path.extname(file).toLowerCase();
    const contentType = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    }[ext] || 'image/jpeg';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    
    // Listener para detectar cuando la conexión se cierra
    let connectionClosed = false;
    
    req.on('close', () => {
      connectionClosed = true;
      console.warn(`⚠️ Conexión cerrada por cliente al servir foto`);
    });
    
    req.on('aborted', () => {
      connectionClosed = true;
      console.warn(`⚠️ Conexión abortada por cliente al servir foto`);
    });
    
    res.sendFile(file, { root: process.cwd() }, (err) => {
      if (err) {
        // Ignorar errores de conexión abortada (ECONNABORTED, EPIPE)
        if (err.code === 'ECONNABORTED' || err.code === 'EPIPE' || err.code === 'ERR_HTTP_REQUEST_TIMEOUT') {
          console.warn(`⚠️ Conexión interrumpida al servir foto: ${err.code}`);
          return;
        }
        
        console.error(`❌ Error enviando archivo:`, err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error enviando archivo", details: err.message });
        }
      } else {
        console.log(`✅ Archivo enviado correctamente`);
      }
    });
  } catch (err) {
    console.error("❌ Error sirviendo foto de devoluciones:", err);
    res.status(500).send("Error cargando foto");
  }
});

// =====================================================
// 🔁 ACTIVAR / DESACTIVAR UN PRODUCTO DE DEVOLUCIONES
// =====================================================
router.put("/producto/:id/activo", authRequired, requierePermiso("action:activar-productos"), (req, res) => {
  const { id } = req.params;
  const raw = req.body?.activo;
  let activo = 0;

  if (typeof raw === "boolean") activo = raw ? 1 : 0;
  else if (typeof raw === "number") activo = raw ? 1 : 0;
  else if (typeof raw === "string")
    activo = raw === "1" || raw.toLowerCase() === "true" ? 1 : 0;

  // Verificar si el producto es apto antes de activar
  if (activo === 1) {
    const producto = dbDevol
      .prepare(`SELECT apto FROM devoluciones_productos WHERE id = ?`)
      .get(id);
    
    if (!producto) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }
    
    if (producto.apto === 0) {
      return res.status(400).json({ error: "Este producto no es apto y no se puede activar" });
    }
  }

  // Obtener información completa del producto antes de actualizar
  const productoCompleto = dbDevol
    .prepare(
      `
      SELECT dp.*, d.area, d.pedido, d.fecha
      FROM devoluciones_productos dp
      JOIN devoluciones_pedidos d ON d.id = dp.devolucion_id
      WHERE dp.id = ?
    `
    )
    .get(id);

  if (!productoCompleto) {
    return res.status(404).json({ error: "Producto no encontrado" });
  }

  const result = dbDevol
    .prepare(`UPDATE devoluciones_productos SET activo=? WHERE id=?`)
    .run(activo, id);

  if (!result.changes) {
    return res.status(404).json({ error: "Producto no encontrado" });
  }

  // Si se activa el producto, crear registro en picking (productos)
  if (activo === 1) {
    try {
      // Verificar si ya existe un registro en productos para este código/lote de devoluciones
      const existe = dbDia
        .prepare(
          `SELECT id FROM productos 
           WHERE codigo = ? AND lote = ? AND origen = 'devoluciones' AND devolucion_producto_id = ?`
        )
        .get(
          productoCompleto.codigo || "",
          productoCompleto.lote || null,
          id
        );

      if (!existe) {
        // Obtener TODA la información del inventario (categoría, presentación, etc.)
        const invInfo = dbInv
          .prepare("SELECT categoria, subcategoria, presentacion FROM productos_ref WHERE codigo = ?")
          .get(productoCompleto.codigo || "");

        let categoria = invInfo?.categoria || null;
        // Si no hay categoría en inventario, intentar inferirla del nombre
        if (!categoria && productoCompleto.nombre) {
          const nombreLower = productoCompleto.nombre.toLowerCase();
          if (nombreLower.includes("capsula") || nombreLower.includes("cápsula")) {
            categoria = "Capsulas";
          } else if (nombreLower.includes("tableta") || nombreLower.includes("tablet")) {
            categoria = "Tabletas";
          } else if (nombreLower.includes("polvo") || nombreLower.includes("polvos")) {
            categoria = "Polvos";
          }
        }
        
        const cantidad = Number(productoCompleto.cantidad || 0);
        // ⚠️ IMPORTANTE: La cantidad de devoluciones se convierte en piezas_por_caja
        const piezasPorCaja = cantidad;  // Usar la cantidad de devoluciones como piezas por caja
        // Calcular cajas aproximadas (redondeo hacia arriba)
        const cajas = piezasPorCaja > 0 ? Math.ceil(cantidad / piezasPorCaja) : cantidad;
        const piezas = cantidad;
        const hora = dayjs().format("HH:mm:ss");

        // Combinar nombre y presentación si existe
        const presentacion = invInfo?.presentacion || productoCompleto.presentacion || "";
        const nombreCompleto = obtenerNombreCompleto(productoCompleto.nombre || "", presentacion);

        // Insertar en productos con origen 'devoluciones' - incluir TODA la información del inventario
        dbDia
          .prepare(
            `INSERT INTO productos 
             (codigo, nombre, presentacion, lote, cajas, piezas, piezas_por_caja, extras, 
              surtido, disponible, hora_solicitud, hora_surtido, origen, devolucion_producto_id, observaciones, categoria)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            productoCompleto.codigo || "",
            nombreCompleto,
            presentacion || '',
            productoCompleto.lote || null,
            cajas,
            piezas,
            piezasPorCaja,  // ⚠️ La cantidad de devoluciones se convierte en piezas_por_caja
            0, // extras
            1, // surtido = 1 (ya está surtido porque viene de devoluciones)
            1, // disponible = 1
            hora,
            hora, // hora_surtido = hora_solicitud (se surte inmediatamente)
            "devoluciones", // origen
            id, // devolucion_producto_id
            `Devolución: ${productoCompleto.pedido || "N/A"} - Área: ${productoCompleto.area || "N/A"}`,
            categoria || null  // ⚠️ Categoría del inventario
          );

        
        // Emitir evento para actualizar picking en tiempo real
        const io = getIO();
        if (io) {
          io.emit("picking_actualizado");
          io.emit("productos_actualizados", []);
        }
      }
    } catch (err) {
      console.error("❌ Error creando registro en picking:", err);
      // No fallar la activación si hay error al crear el registro en picking
    }
  } else if (activo === 0) {
    // Si se desactiva, marcar como no disponible en picking (pero no eliminar)
    try {
      dbDia
        .prepare(
          `UPDATE productos 
           SET disponible = 0 
           WHERE origen = 'devoluciones' AND devolucion_producto_id = ?`
        )
        .run(id);
    } catch (err) {
      console.error("❌ Error actualizando registro en picking:", err);
    }
  }

  const updated = dbDevol
    .prepare(
      `
    SELECT dp.*, d.area, d.pedido, d.fecha
    FROM devoluciones_productos dp
    JOIN devoluciones_pedidos d ON d.id = dp.devolucion_id
    WHERE dp.id = ?
  `
    )
    .get(id);

  // Emitir eventos de actualización en tiempo real
  const io = getIO();
  if (io) {
    io.emit("devoluciones_actualizadas");
    io.emit("producto_actualizado", updated);
    // Si se activó un producto, también actualizar picking
    if (activo === 1) {
      io.emit("picking_actualizado");
      io.emit("productos_actualizados", []);
    }
  }

  res.json(updated);
});

router.put("/producto/:id", authRequired, (req, res, next) => {
  // Si se está intentando cambiar el activo, verificar permiso primero
  if (req.body?.activo !== undefined) {
    return requierePermiso("action:activar-productos")(req, res, next);
  }
  // Si no se está cambiando activo, continuar normalmente
  next();
}, (req, res) => {
  try {
    const { id } = req.params;
    let { nombre, lote, cantidad, caducidad, apto, activo } = req.body;

    // Normalizar apto: convertir boolean a número si es necesario
    if (apto !== undefined) {
      if (typeof apto === 'boolean') {
        apto = apto ? 1 : 0;
      } else if (typeof apto === 'string') {
        apto = (apto === 'true' || apto === '1') ? 1 : 0;
      } else {
        apto = apto ? 1 : 0;
      }
    }

    // Verificar el producto actual antes de hacer cambios (incluyendo área)
    const productoActual = dbDevol
      .prepare(`
        SELECT dp.apto, dp.codigo, dp.nombre, dp.presentacion, dp.cantidad, dp.lote, dp.caducidad, 
               d.area, d.pedido, d.fecha
        FROM devoluciones_productos dp
        JOIN devoluciones_pedidos d ON d.id = dp.devolucion_id
        WHERE dp.id = ?
      `)
      .get(id);
    
    if (!productoActual) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    // Verificar si el producto cambió de apto a no apto (para copia automática)
    // productoActual.apto puede ser 1, 0, null, undefined, o string
    const aptoActual = (productoActual.apto === 1 || productoActual.apto === '1' || productoActual.apto === true) ? 1 : 0;
    const cambioAptoANoApto = apto !== undefined && apto === 0 && aptoActual === 1;

    // Si se intenta activar un producto no apto, rechazar
    if (activo === 1 && productoActual.apto === 0) {
      return res.status(400).json({ error: "Este producto no es apto y no se puede activar" });
    }

    // Si se cambia apto a 0 y el producto está activo, desactivarlo
    let activoFinal = activo;
    if (apto === 0 && productoActual.apto === 1 && activo === undefined) {
      // Si se marca como no apto y está activo, desactivarlo automáticamente
      activoFinal = 0;
    }

    const updates = [];
    const values = [];

    if (nombre !== undefined) {
      updates.push("nombre = ?");
      values.push(nombre);
    }
    if (lote !== undefined) {
      updates.push("lote = ?");
      values.push(lote);
    }
    if (cantidad !== undefined) {
      updates.push("cantidad = ?");
      values.push(Number(cantidad));
    }
    if (caducidad !== undefined) {
      updates.push("caducidad = ?");
      values.push(caducidad || null);
    }
    if (apto !== undefined) {
      updates.push("apto = ?");
      values.push(apto ? 1 : 0);
    }
    if (activo !== undefined) {
      updates.push("activo = ?");
      values.push(activoFinal ? 1 : 0);
    } else if (apto !== undefined && apto === 0 && aptoActual === 1) {
      // Si se cambia a no apto, desactivar automáticamente
      updates.push("activo = ?");
      values.push(0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No hay campos para actualizar" });
    }

    values.push(id);

    const sql = `UPDATE devoluciones_productos SET ${updates.join(", ")} WHERE id = ?`;
    const result = dbDevol.prepare(sql).run(...values);

    if (!result.changes) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    const updated = dbDevol
      .prepare(
        `SELECT dp.*, d.area, d.pedido, d.fecha
         FROM devoluciones_productos dp
         JOIN devoluciones_pedidos d ON d.id = dp.devolucion_id
         WHERE dp.id = ?`
      )
      .get(id);

    // Si se marcó como "no apto" (cambió de apto a no apto), 
    // copiar automáticamente a Control de Calidad - Área de Proceso - Devoluciones
    // Esto funciona para TODAS las áreas, no solo Clientes
    if (cambioAptoANoApto) {
      try {
        const fechaActual = dayjs().format("YYYY-MM-DD");
        
        // Usar los datos del producto actualizado
        const datosProducto = updated || productoActual;
        
        // Verificar si ya existe un registro similar en calidad_registros para evitar duplicados
        const existeRegistro = dbDevol
          .prepare(`
            SELECT id FROM calidad_registros 
            WHERE area = 'Devoluciones' 
            AND codigo = ? 
            AND pedido = ? 
            AND lote = ?
            AND cantidad = ?
          `)
          .get(
            datosProducto.codigo || '',
            datosProducto.pedido || '',
            datosProducto.lote || '',
            datosProducto.cantidad || 0
          );
        
        if (!existeRegistro) {
          // Crear registro en calidad_registros
          const info = dbDevol.prepare(`
            INSERT INTO calidad_registros 
            (area, fecha, pedido, codigo, producto, presentacion, cantidad, lote, caducidad, 
             recibido_calidad, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).run(
            'Devoluciones', // Área de Proceso dentro de Control de Calidad
            fechaActual,
            datosProducto.pedido || '',
            datosProducto.codigo || '',
            datosProducto.nombre || '',
            datosProducto.presentacion || '',
            datosProducto.cantidad || 0,
            datosProducto.lote || '',
            datosProducto.caducidad || ''
          );
          
          // Emitir evento para actualizar Control de Calidad en tiempo real
          const io = getIO();
          if (io) {
            io.emit("calidad_registros_actualizados");
          }
        }
      } catch (err) {
        console.error("❌ Error copiando producto a Control de Calidad:", err);
        // No fallar la actualización principal si falla la copia
      }
    }

    // Auditoría - registrar qué se editó específicamente
    const cambios = [];
    const productoAnterior = dbDevol.prepare("SELECT * FROM devoluciones_productos WHERE id=?").get(id);
    
    const campos = {
      nombre: 'Nombre',
      lote: 'Lote',
      cantidad: 'Cantidad',
      caducidad: 'Caducidad',
      apto: 'Apto',
      activo: 'Activo'
    };

    for (const [campo, nombreCampo] of Object.entries(campos)) {
      let valorAnterior = productoAnterior?.[campo];
      let valorNuevo = req.body[campo];
      
      // Manejar valores especiales
      if (campo === 'apto' || campo === 'activo') {
        valorAnterior = valorAnterior ? 'Sí' : 'No';
        valorNuevo = valorNuevo !== undefined ? (valorNuevo ? 'Sí' : 'No') : valorAnterior;
      } else {
        valorAnterior = valorAnterior ?? null;
        valorNuevo = valorNuevo !== undefined ? (valorNuevo ?? null) : valorAnterior;
      }
      
      if (req.body.hasOwnProperty(campo) && valorAnterior !== valorNuevo) {
        const anterior = valorAnterior === null || valorAnterior === '' ? '(vacío)' : valorAnterior;
        const nuevo = valorNuevo === null || valorNuevo === '' ? '(vacío)' : valorNuevo;
        cambios.push(`${nombreCampo}: "${anterior}" → "${nuevo}"`);
      }
    }

    const detalleCambios = cambios.length > 0 
      ? `Cambios: ${cambios.join(' | ')}`
      : 'Sin cambios detectados';
    
    registrarAccion({
      usuario: req.user?.name || req.user?.nickname,
      accion: "EDITAR_PRODUCTO_DEVOLUCIONES",
      detalle: `Editó producto "${updated?.nombre || 'N/A'}" (Código: ${updated?.codigo || 'N/A'}) | ${detalleCambios}`,
      tabla: "devoluciones_productos",
      registroId: id,
    });

    res.json(updated);
  } catch (err) {
    console.error("❌ Error editando producto:", err);
    res.status(500).json({ error: "Error al editar producto" });
  }
});

router.get("/clientes/productos/resumen", authRequired, (req, res) => {
  try {
    const area = req.query.area || "Clientes"; // Permite filtrar por área
    const soloActivos = req.query.soloActivos === "true";
    
    // Si se solicita solo activos para importar, devolver productos individuales
    // IMPORTANTE: Buscar en productos_general donde se gestionan las activaciones
    if (soloActivos) {
      const productos = dbDevol
        .prepare(
          `
          SELECT 
            p.id,
            COALESCE(p.codigo, '') AS codigo,
            COALESCE(p.nombre, '') AS nombre,
            COALESCE(p.presentacion, '') AS presentacion,
            COALESCE(p.lote, '') AS lote,
            p.cantidad,
            p.activo,
            p.apto,
            COALESCE(p.pedido, '') AS pedido
          FROM devoluciones_productos_general p
          WHERE p.nombre IS NOT NULL 
            AND p.nombre != '' 
            AND (p.apto = 1 OR p.apto = true OR p.apto = '1')
            AND (p.activo = 1 OR p.activo = true OR p.activo = '1')
          ORDER BY p.nombre, p.codigo, p.lote
        `
        )
        .all();
      
      res.json(productos);
      return;
    }
    
    // Para el resumen del modal, agrupar por nombre (comportamiento original)
    const rows = dbDevol
      .prepare(
        `
        SELECT 
          COALESCE(p.nombre, '') AS nombre,
          SUM(p.cantidad) AS total,
          MIN(p.activo) AS min_activo,
          MAX(p.activo) AS max_activo,
          GROUP_CONCAT(DISTINCT p.id) AS ids,
          GROUP_CONCAT(DISTINCT p.codigo) AS codigos,
          GROUP_CONCAT(DISTINCT p.lote) AS lotes
        FROM devoluciones_productos p
        JOIN devoluciones_pedidos d ON d.id = p.devolucion_id
        WHERE d.area = ? AND p.nombre IS NOT NULL AND p.nombre != '' AND p.apto = 1
        GROUP BY p.nombre
        ORDER BY p.nombre
      `
      )
      .all(area);

    const resumen = rows.map((row) => ({
      codigo: (row.codigos || "").split(",").filter(Boolean)[0] || "—",
      nombre: row.nombre,
      lote: (row.lotes || "").split(",").filter(Boolean).join(", ") || "—",
      total: row.total,
      ids: (row.ids || "")
        .split(",")
        .map((id) => Number(id))
        .filter(Boolean),
      todosActivos: Number(row.min_activo) === 1,
      algunoActivo: Number(row.max_activo) === 1,
      min_activo: Number(row.min_activo) || 0,
      max_activo: Number(row.max_activo) || 0,
    }));

    res.json(resumen);
  } catch (err) {
    console.error("GET /devoluciones/clientes/productos/resumen:", err);
    res.status(500).json({ error: "Error generando resumen" });
  }
});

router.put("/clientes/productos/estado", authRequired, requierePermiso("action:activar-productos"), (req, res) => {
  // Si viene nombre, activar todos los productos con ese nombre
  if (req.body?.nombre) {
    const nombre = req.body.nombre;
    const activoBD = parseActivoValue(req.body?.activo, 1);
    const cantidad = req.body?.cantidad ? Number(req.body.cantidad) : null;
    const caducidad = req.body?.caducidad || null;

    try {
      // Si se intenta activar, verificar que existan productos aptos con ese nombre
      if (activoBD === 1) {
        const productosAptos = dbDevol
          .prepare(
            `SELECT COUNT(*) as count FROM devoluciones_productos 
             WHERE nombre = ? 
             AND devolucion_id IN (SELECT id FROM devoluciones_pedidos WHERE area = 'Clientes')
             AND apto = 1`
          )
          .get(nombre);
        
        if (!productosAptos || productosAptos.count === 0) {
          return res.status(400).json({ 
            error: `No se pueden activar productos con nombre "${nombre}" porque no hay productos aptos con ese nombre` 
          });
        }
      }
      
      // Solo actualizar productos aptos (apto = 1)
      // El modal solo muestra productos aptos, así que solo actualizamos esos
      const updateWhere = `WHERE nombre = ? AND devolucion_id IN (
        SELECT id FROM devoluciones_pedidos WHERE area = 'Clientes'
      ) AND apto = 1`;

      if (cantidad !== null && caducidad) {
        // Actualizar activo, cantidad y caducidad (solo productos aptos)
        const result = dbDevol
          .prepare(
            `UPDATE devoluciones_productos SET activo=?, cantidad=?, caducidad=? ${updateWhere}`
          )
          .run(activoBD, cantidad, caducidad, nombre);
        console.log(`✅ Actualizados ${result.changes} productos aptos con nombre "${nombre}"`);
      } else if (cantidad !== null) {
        // Actualizar activo y cantidad (solo productos aptos)
        const result = dbDevol
          .prepare(
            `UPDATE devoluciones_productos SET activo=?, cantidad=? ${updateWhere}`
          )
          .run(activoBD, cantidad, nombre);
        console.log(`✅ Actualizados ${result.changes} productos aptos con nombre "${nombre}"`);
      } else if (caducidad) {
        // Actualizar activo y caducidad (solo productos aptos)
        const result = dbDevol
          .prepare(
            `UPDATE devoluciones_productos SET activo=?, caducidad=? ${updateWhere}`
          )
          .run(activoBD, caducidad, nombre);
        console.log(`✅ Actualizados ${result.changes} productos aptos con nombre "${nombre}"`);
      } else {
        // Solo actualizar activo (solo productos aptos)
        const result = dbDevol
          .prepare(
            `UPDATE devoluciones_productos SET activo=? ${updateWhere}`
          )
          .run(activoBD, nombre);
        console.log(`✅ Actualizados ${result.changes} productos aptos con nombre "${nombre}"`);
      }

      const registros = dbDevol
        .prepare(
          `SELECT dp.*, d.area, d.pedido, d.fecha
           FROM devoluciones_productos dp
           JOIN devoluciones_pedidos d ON d.id = dp.devolucion_id
           WHERE dp.nombre = ?
           ORDER BY d.fecha DESC`
        )
        .all(nombre);

      // Emitir eventos de actualización en tiempo real
      const io = getIO();
      if (io) {
        io.emit("devoluciones_actualizadas");
        io.emit("productos_actualizados", []);
        io.emit("productos_general_actualizados"); // Actualizar productos general también
        // Si se activaron productos, también actualizar picking
        if (activoBD === 1) {
          io.emit("picking_actualizado");
        }
      }

      return res.json({ ok: true, registros });
    } catch (err) {
      console.error("PUT /devoluciones/clientes/productos/estado (por nombre):", err);
      return res.status(500).json({ error: "Error actualizando estado" });
    }
  }

  // Si viene ids, activar por IDs (compatibilidad hacia atrás)
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map((id) => Number(id)).filter(Boolean)
    : [];

  if (!ids.length) {
    return res.status(400).json({ error: "Sin IDs o nombre para actualizar" });
  }

  const activoBD = parseActivoValue(req.body?.activo, 1);
  const placeholders = ids.map(() => "?").join(",");

  try {
    // Si se intenta activar, verificar que todos los productos sean aptos
    if (activoBD === 1) {
      const productosNoAptos = dbDevol
        .prepare(
          `SELECT id FROM devoluciones_productos 
           WHERE id IN (${placeholders}) 
           AND (apto IS NULL OR apto = 0 OR apto = '0' OR apto = false)`
        )
        .all(...ids);
      
      if (productosNoAptos.length > 0) {
        return res.status(400).json({ 
          error: `No se pueden activar ${productosNoAptos.length} producto(s) porque están marcados como no aptos` 
        });
      }
    }
    
    dbDevol
      .prepare(
        `UPDATE devoluciones_productos SET activo=? WHERE id IN (${placeholders})`
      )
      .run(activoBD, ...ids);

    const registros = dbDevol
      .prepare(
        `SELECT dp.*, d.area, d.pedido, d.fecha
         FROM devoluciones_productos dp
         JOIN devoluciones_pedidos d ON d.id = dp.devolucion_id
         WHERE dp.id IN (${placeholders})
         ORDER BY d.fecha DESC`
      )
      .all(...ids);

    res.json({ ok: true, registros });
  } catch (err) {
    console.error("PUT /devoluciones/clientes/productos/estado:", err);
    res.status(500).json({ error: "Error actualizando estado" });
  }
});

// =====================================================
// ENDPOINT DE DIAGNÓSTICO - Buscar pedidos en todas las tablas
// =====================================================
router.get("/clientes/diagnostico", authRequired, (req, res) => {
  try {
    const diagnostico = {
      pedidosActuales: [],
      pedidosHistoricos: [],
      productosActuales: { total: 0 },
      productosHistoricos: { total: 0 },
      tablasExistentes: [],
      errores: []
    };

    try {
      const tablas = dbDevol.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'devoluciones%'`).all();
      diagnostico.tablasExistentes = tablas.map(t => t.name);
      diagnostico.pedidosActuales = dbDevol.prepare(`SELECT * FROM devoluciones_pedidos WHERE area = 'Clientes'`).all();
      const count = dbDevol.prepare(`SELECT COUNT(*) as total FROM devoluciones_productos`).get();
      diagnostico.productosActuales = count || { total: 0 };
    } catch (e) {
      diagnostico.errores.push(`Error accediendo a base de datos devoluciones: ${e.message}`);
    }

    try {
      const tablasHist = dbHist.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'devoluciones%'`).all();
      diagnostico.tablasExistentes.push(...tablasHist.map(t => `${t.name} (histórica)`));
      const exists = dbHist.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='devoluciones_pedidos_hist'`).get();
      if (exists) {
        diagnostico.pedidosHistoricos = dbHist.prepare(`SELECT * FROM devoluciones_pedidos_hist WHERE area = 'Clientes'`).all();
      }
      const existsProd = dbHist.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='devoluciones_clientes_hist'`).get();
      if (existsProd) {
        const count = dbHist.prepare(`SELECT COUNT(*) as total FROM devoluciones_clientes_hist`).get();
        diagnostico.productosHistoricos = count || { total: 0 };
      }
    } catch (e) {
      diagnostico.errores.push(`Error accediendo a base de datos histórica: ${e.message}`);
    }

    res.json(diagnostico);
  } catch (err) {
    console.error("❌ Error en diagnóstico:", err);
    res.status(500).json({ error: "Error en diagnóstico", details: err.message });
  }
});

// =====================================================
// CERRAR DÍA DE DEVOLUCIONES (TODAS LAS PESTAÑAS)
// Funciona como picking: TODO pasa a histórico y se limpian las tablas
// =====================================================
router.post("/cerrar-dia", authRequired, (req, res) => {
  try {
    const fecha = req.body?.fecha || dayjs().format("YYYY-MM-DD");
    

    // Función helper para verificar si una tabla existe
    const tableExists = (db, tableName) => {
      try {
        const result = db.prepare(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name=?
        `).get(tableName);
        return !!result;
      } catch {
        return false;
      }
    };

    // Mapeo de áreas a tablas históricas
    const AREAS_MAP = {
      "Clientes": "devoluciones_clientes_hist",
      "Calidad": "devoluciones_calidad_hist",
      "Reacondicionados": "devoluciones_reacondicionados_hist",
      "Retail": "devoluciones_retail_hist",
      "Cubbo": "devoluciones_cubbo_hist",
      "Regulatorio": "devoluciones_regulatorio_hist"
    };

    const areas = Object.keys(AREAS_MAP);
    let totalMovidos = 0;
    let totalPedidosMovidos = 0;
    const resumenPorArea = {};
    const resumenPedidosPorArea = {};

    // Crear tabla histórica de pedidos una sola vez (compartida para todas las áreas)
    const tablaPedidosHist = "devoluciones_pedidos_hist";
    if (!tableExists(dbHist, tablaPedidosHist)) {
      console.log(`📝 Creando tabla histórica ${tablaPedidosHist}...`);
      dbHist.exec(`
        CREATE TABLE IF NOT EXISTS ${tablaPedidosHist} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pedido TEXT NOT NULL,
          guia TEXT,
          paqueteria TEXT,
          motivo TEXT,
          area TEXT,
          usuario TEXT,
          fecha TEXT,
          fecha_cierre TEXT
        )
      `);
      console.log(`✅ Tabla ${tablaPedidosHist} creada exitosamente`);
    } else {
      // Agregar columnas si no existen
      const columns = [
        { name: "guia", type: "TEXT" },
        { name: "paqueteria", type: "TEXT" },
        { name: "motivo", type: "TEXT" },
        { name: "area", type: "TEXT" },
        { name: "usuario", type: "TEXT" },
        { name: "fecha", type: "TEXT" },
        { name: "fecha_cierre", type: "TEXT" }
      ];
      
      for (const col of columns) {
        try {
          dbHist.exec(`ALTER TABLE ${tablaPedidosHist} ADD COLUMN ${col.name} ${col.type};`);
        } catch (e) {
          if (!String(e.message).includes("duplicate") && !String(e.message).includes("exists")) {
            console.warn(`⚠️ No se pudo agregar columna ${col.name} a ${tablaPedidosHist}:`, e.message);
          }
        }
      }
    }

    // Crear tabla histórica de fotos
    const tablaFotosHist = "devoluciones_fotos_hist";
    if (!tableExists(dbHist, tablaFotosHist)) {
      console.log(`📝 Creando tabla histórica ${tablaFotosHist}...`);
      dbHist.exec(`
        CREATE TABLE IF NOT EXISTS ${tablaFotosHist} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pedido TEXT NOT NULL,
          path TEXT NOT NULL,
          fecha_cierre TEXT,
          area TEXT
        )
      `);
      console.log(`✅ Tabla ${tablaFotosHist} creada exitosamente`);
    }

    // Procesar cada área
    for (const area of areas) {
      const tablaHist = AREAS_MAP[area];
      
      // Crear tabla histórica de productos si no existe
      if (!tableExists(dbHist, tablaHist)) {
        console.log(`📝 Creando tabla histórica ${tablaHist}...`);
        // Para calidad, estructura completa con todos los campos
        if (area === "Calidad") {
          dbHist.exec(`
            CREATE TABLE IF NOT EXISTS ${tablaHist} (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              area TEXT NOT NULL,
              fecha TEXT,
              pedido TEXT,
              codigo TEXT,
              producto TEXT,
              presentacion TEXT,
              cantidad INTEGER,
              lote TEXT,
              caducidad TEXT,
              laboratorio TEXT,
              clasificacion_etiqueta TEXT,
              defecto TEXT,
              recibido_calidad INTEGER DEFAULT 0,
              destino TEXT,
              comentarios_calidad TEXT,
              evidencias TEXT,
              fecha_cierre TEXT,
              created_at DATETIME,
              updated_at DATETIME
            )
          `);
        } else {
          dbHist.exec(`
            CREATE TABLE IF NOT EXISTS ${tablaHist} (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              devolucion_id INTEGER,
              codigo TEXT,
              nombre TEXT,
              lote TEXT,
              cantidad INTEGER,
              caducidad TEXT,
              apto INTEGER DEFAULT 1,
              activo INTEGER DEFAULT 1,
              pedido TEXT,
              guia TEXT,
              paqueteria TEXT,
              motivo TEXT,
              area TEXT,
              usuario TEXT,
              fecha TEXT,
              fecha_cierre TEXT
            )
          `);
        }
      } else {
        // Agregar columnas si no existen
        if (area === "Calidad") {
          // Columnas específicas para calidad
          const columnsCalidad = [
            { name: "area", type: "TEXT" },
            { name: "fecha", type: "TEXT" },
            { name: "pedido", type: "TEXT" },
            { name: "codigo", type: "TEXT" },
            { name: "producto", type: "TEXT" },
            { name: "presentacion", type: "TEXT" },
            { name: "cantidad", type: "INTEGER" },
            { name: "lote", type: "TEXT" },
            { name: "caducidad", type: "TEXT" },
            { name: "laboratorio", type: "TEXT" },
            { name: "clasificacion_etiqueta", type: "TEXT" },
            { name: "defecto", type: "TEXT" },
            { name: "recibido_calidad", type: "INTEGER" },
            { name: "destino", type: "TEXT" },
            { name: "comentarios_calidad", type: "TEXT" },
            { name: "evidencias", type: "TEXT" },
            { name: "fecha_cierre", type: "TEXT" },
            { name: "created_at", type: "DATETIME" },
            { name: "updated_at", type: "DATETIME" }
          ];
          
          for (const col of columnsCalidad) {
            try {
              dbHist.exec(`ALTER TABLE ${tablaHist} ADD COLUMN ${col.name} ${col.type};`);
            } catch (e) {
              if (!String(e.message).includes("duplicate") && !String(e.message).includes("exists")) {
                console.warn(`⚠️ No se pudo agregar columna ${col.name} a ${tablaHist}:`, e.message);
              }
            }
          }
        } else {
          // Columnas para otras áreas
          const columns = [
            { name: "devolucion_id", type: "INTEGER" },
            { name: "caducidad", type: "TEXT" },
            { name: "apto", type: "INTEGER" },
            { name: "activo", type: "INTEGER" },
            { name: "pedido", type: "TEXT" },
            { name: "guia", type: "TEXT" },
            { name: "paqueteria", type: "TEXT" },
            { name: "motivo", type: "TEXT" },
            { name: "area", type: "TEXT" },
            { name: "usuario", type: "TEXT" },
            { name: "fecha", type: "TEXT" },
            { name: "fecha_cierre", type: "TEXT" }
          ];

          for (const col of columns) {
            try {
              dbHist.exec(`ALTER TABLE ${tablaHist} ADD COLUMN ${col.name} ${col.type};`);
            } catch (e) {
              if (!String(e.message).includes("duplicate") && !String(e.message).includes("exists")) {
                console.warn(`⚠️ No se pudo agregar columna ${col.name} a ${tablaHist}:`, e.message);
              }
            }
          }
        }
      }

      // Para Calidad, obtener registros de calidad_registros
      // Para Clientes, obtener de devoluciones_productos
      // Para otras áreas (Retail, Reacondicionados, Cubbo, Regulatorio), obtener de las tablas del día
      let productosDelDia = [];
      try {
        if (area === "Calidad") {
          // Obtener TODOS los registros de calidad_registros (todas las áreas: Devoluciones, Fulfilment, Inventario, Pedidos)
          // Verificar si la columna fecha_cierre existe antes de usarla
          try {
            const tableInfo = dbDevol.prepare(`PRAGMA table_info(calidad_registros)`).all();
            const hasFechaCierre = tableInfo.some(col => col.name === 'fecha_cierre');
            
            if (hasFechaCierre) {
              productosDelDia = dbDevol
                .prepare(`
                  SELECT 
                    *
                  FROM calidad_registros
                  WHERE fecha_cierre IS NULL
                `)
                .all();
            } else {
              // Si no tiene fecha_cierre, obtener todos los registros
              productosDelDia = dbDevol
                .prepare(`
                  SELECT 
                    *
                  FROM calidad_registros
                `)
                .all();
            }
            } catch (err) {
            console.error(`❌ Error consultando calidad_registros:`, err);
            productosDelDia = [];
          }
        } else if (area === "Clientes") {
          // Obtener TODOS los productos de devoluciones_productos para Clientes (sin filtrar por activo/apto)
          // Las tarjetas deben mantenerse completas tal cual fueron creadas
          productosDelDia = dbDevol
            .prepare(`
              SELECT 
                p.*,
                d.pedido,
                d.guia,
                d.paqueteria,
                d.motivo,
                d.area,
                d.usuario,
                d.fecha
              FROM devoluciones_productos p
              JOIN devoluciones_pedidos d ON d.id = p.devolucion_id
              WHERE d.area = ?
            `)
            .all(area);
        } else {
          // Para Retail, Reacondicionados, Cubbo, Regulatorio: obtener de las tablas del día
          const tablaDia = getTablaDia(area.toLowerCase());
          if (tablaDia && tableExists(dbDia, tablaDia)) {
            // Verificar qué columnas tiene la tabla antes de consultar
            try {
              const tableInfo = dbDia.prepare(`PRAGMA table_info(${tablaDia})`).all();
              const hasApto = tableInfo.some(col => col.name === 'apto');
              const hasActivo = tableInfo.some(col => col.name === 'activo');
              
              // Construir la consulta dinámicamente según las columnas disponibles
              // Las tablas del día (retail, reacondicionados, etc.) NO tienen 'apto', solo 'activo'
              let query = '';
              if (hasActivo) {
                query = `
                  SELECT 
                    *,
                    '' AS pedido,
                    '' AS guia,
                    '' AS paqueteria,
                    '' AS motivo,
                    ? AS area,
                    '' AS usuario,
                    DATE('now', 'localtime') AS fecha,
                    1 AS apto
                  FROM ${tablaDia}
                  WHERE activo = 1
                `;
              } else {
                // Si no tiene activo, obtener todos los registros
                query = `
                  SELECT 
                    *,
                    '' AS pedido,
                    '' AS guia,
                    '' AS paqueteria,
                    '' AS motivo,
                    ? AS area,
                    '' AS usuario,
                    DATE('now', 'localtime') AS fecha,
                    1 AS apto
                  FROM ${tablaDia}
                `;
              }
              
              productosDelDia = dbDia.prepare(query).all(area);
            } catch (err) {
              console.error(`❌ Error consultando ${tablaDia}:`, err);
              console.error(`❌ Stack:`, err.stack);
              productosDelDia = [];
            }
          } else {
            console.warn(`⚠️ Tabla ${tablaDia} no existe para área ${area}`);
            resumenPorArea[area] = 0;
            continue;
          }
        }
      } catch (queryErr) {
        console.error(`❌ Error consultando productos de ${area}:`, queryErr);
        console.error(`❌ Stack:`, queryErr.stack);
        // Continuar con otras áreas en lugar de fallar completamente
        resumenPorArea[area] = 0;
        continue;
      }

      if (productosDelDia.length > 0) {
        // Para Calidad, usar estructura completa con todos los campos
        if (area === "Calidad") {
          const insHist = dbHist.prepare(`
            INSERT INTO ${tablaHist}
            (area, fecha, pedido, codigo, producto, presentacion, cantidad, lote, caducidad,
             laboratorio, clasificacion_etiqueta, defecto, recibido_calidad, destino,
             comentarios_calidad, evidencias, fecha_cierre, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          const txHist = dbHist.transaction((arr) => {
            for (const p of arr) {
              try {
                // Parsear evidencias si es JSON
                let evidenciasStr = '';
                if (p.evidencias) {
                  if (typeof p.evidencias === 'string') {
                    evidenciasStr = p.evidencias;
                  } else {
                    evidenciasStr = JSON.stringify(p.evidencias);
                  }
                }
                
                insHist.run(
                  p.area || "",
                  p.fecha || fecha,
                  p.pedido || "",
                  p.codigo || "",
                  p.producto || "",
                  p.presentacion || "",
                  p.cantidad || 0,
                  p.lote || "",
                  p.caducidad || "",
                  p.laboratorio || "",
                  p.clasificacion_etiqueta || "",
                  p.defecto || "",
                  p.recibido_calidad !== null && p.recibido_calidad !== undefined ? p.recibido_calidad : 0,
                  p.destino || "",
                  p.comentarios_calidad || "",
                  evidenciasStr,
                  fecha, // fecha_cierre
                  p.created_at || new Date().toISOString(),
                  p.updated_at || new Date().toISOString()
                );
              } catch (insertErr) {
                console.error(`❌ Error insertando registro ${p.id} en histórico:`, insertErr);
                // Continuar con el siguiente registro en lugar de fallar
                console.warn(`⚠️ Se omitió el registro ${p.id} debido a error`);
              }
            }
          });

          try {
            txHist(productosDelDia);
          } catch (txErr) {
            console.error(`❌ Error en transacción de productos para ${area}:`, txErr);
            // Continuar con otras áreas
            resumenPorArea[area] = 0;
            continue;
          }
        } else if (area === "Clientes") {
          // Para Clientes: NO copiar aquí, se hará después con TODOS los productos
          // Solo contar los productos activos para el resumen
          console.log(`📦 ${productosDelDia.length} productos activos encontrados en ${area} (se copiarán todos después)`);
        } else {
          // Para otras áreas (Retail, Reacondicionados, etc.)
          const insHist = dbHist.prepare(`
            INSERT INTO ${tablaHist}
            (devolucion_id, codigo, nombre, lote, cantidad, caducidad, apto, activo,
             pedido, guia, paqueteria, motivo, area, usuario, fecha, fecha_cierre)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          const txHist = dbHist.transaction((arr) => {
            for (const p of arr) {
              try {
                insHist.run(
                  p.devolucion_id || null,
                  p.codigo || "",
                  p.nombre || "",
                  p.lote || "",
                  p.cantidad || 0,
                  p.caducidad || null,
                  p.apto !== null && p.apto !== undefined ? p.apto : 1,
                  p.activo !== null && p.activo !== undefined ? p.activo : 1,
                  p.pedido || "",
                  p.guia || "",
                  p.paqueteria || "",
                  p.motivo || "",
                  p.area || area,
                  p.usuario || "",
                  p.fecha || fecha,
                  fecha  // fecha_cierre = fecha del cierre
                );
              } catch (insertErr) {
                console.error(`❌ Error insertando producto ${p.id} en histórico:`, insertErr);
                console.error(`❌ Producto:`, JSON.stringify(p, null, 2));
                // Continuar con el siguiente producto en lugar de fallar
                console.warn(`⚠️ Se omitió el producto ${p.id} debido a error`);
              }
            }
          });

          try {
            txHist(productosDelDia);
          } catch (txErr) {
            console.error(`❌ Error en transacción de productos para ${area}:`, txErr);
            // Continuar con otras áreas
            resumenPorArea[area] = 0;
            continue;
          }
        }

        // Limpiar las tablas después de mover a histórico
        if (area === "Calidad") {
          // Marcar todos los registros como cerrados
          const idsParaCerrar = productosDelDia.map(p => p.id);
          
          if (idsParaCerrar.length > 0) {
            // Verificar si la columna fecha_cierre existe
            try {
              const tableInfo = dbDevol.prepare(`PRAGMA table_info(calidad_registros)`).all();
              const hasFechaCierre = tableInfo.some(col => col.name === 'fecha_cierre');
              
              if (!hasFechaCierre) {
                // Crear la columna si no existe
                console.log('📝 Agregando columna fecha_cierre a calidad_registros...');
                dbDevol.exec(`ALTER TABLE calidad_registros ADD COLUMN fecha_cierre TEXT`);
                console.log('✅ Columna fecha_cierre agregada exitosamente');
              }
              
              const placeholders = idsParaCerrar.map(() => '?').join(',');
              dbDevol.prepare(`
                UPDATE calidad_registros 
                SET fecha_cierre = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE id IN (${placeholders})
              `).run(fecha, ...idsParaCerrar);
              console.log(`✅ ${idsParaCerrar.length} registros de calidad marcados como cerrados`);
            } catch (err) {
              console.error(`❌ Error marcando registros como cerrados:`, err);
              // Continuar aunque falle, ya que los registros ya se movieron al histórico
            }
          }
        } else if (area === "Clientes") {
          // Para Clientes, los productos se copiarán después de mover los pedidos
          // para mantener la relación devolucion_id con el pedido histórico
          resumenPorArea[area] = 0;
        } else {
          // Para Retail, Reacondicionados, Cubbo, Regulatorio: LIMPIAR la tabla del día completamente
          const tablaDia = getTablaDia(area.toLowerCase());
          if (tablaDia && tableExists(dbDia, tablaDia)) {
            // Eliminar TODOS los productos de la tabla del día (ya fueron movidos a histórico)
            const eliminados = dbDia.prepare(`DELETE FROM ${tablaDia}`).run();
          }
        }

        // Para áreas que no son Clientes, actualizar el resumen
        if (area !== "Clientes") {
          totalMovidos += productosDelDia.length;
          resumenPorArea[area] = productosDelDia.length;
        }
      } else {
        if (area !== "Clientes") {
          resumenPorArea[area] = 0;
        }
      }

      // Mover TODOS los pedidos al histórico SOLO para el área "Clientes"
      // Las otras áreas (Calidad, Reacondicionados, Retail, Cubbo, Regulatorio) NO manejan pedidos
      // Solo los PRODUCTOS tienen reglas (activo = 1 OR apto = 0)
      if (area === "Clientes") {
        let pedidosDelDia = [];
        try {
          // Mover TODOS los pedidos de Clientes, tengan o no productos
          pedidosDelDia = dbDevol
            .prepare(`
              SELECT DISTINCT id, pedido, guia, paqueteria, motivo, area, usuario, fecha
              FROM devoluciones_pedidos
              WHERE area = ?
            `)
            .all(area);
          if (pedidosDelDia.length > 0) {
          }
        } catch (queryErr) {
          console.error(`❌ Error consultando pedidos de ${area}:`, queryErr);
          console.error(`❌ Stack:`, queryErr.stack);
          pedidosDelDia = [];
        }
        
        // Mover TODOS los pedidos al histórico (sin importar si tienen productos o no)
        // Similar a reenvíos: todos pasan al histórico y se eliminan de la tabla actual
        if (pedidosDelDia.length > 0) {
          
          // 1. Guardar fotos en histórico ANTES de eliminarlas (como en reenvíos)
          const pedidosIds = pedidosDelDia.map(p => p.id);
          const placeholders = pedidosIds.map(() => '?').join(',');
          
          try {
            const fotosDelDia = dbDevol
              .prepare(`SELECT f.*, d.pedido, d.id as devolucion_id FROM devoluciones_fotos f 
                        JOIN devoluciones_pedidos d ON d.id = f.devolucion_id 
                        WHERE f.devolucion_id IN (${placeholders})`)
              .all(...pedidosIds);
            
            if (fotosDelDia.length > 0) {
              const insFotosHist = dbHist.prepare(`
                INSERT INTO devoluciones_fotos_hist (pedido, path, fecha_cierre, area)
                VALUES (?, ?, ?, ?)
              `);
              
              for (const foto of fotosDelDia) {
                try {
                  insFotosHist.run(
                    foto.pedido || "",
                    foto.path || "",
                    fecha,
                    area
                  );
                  console.log(`📸 Foto guardada en histórico: ${foto.path} para pedido ${foto.pedido}`);
                } catch (fotoErr) {
                  console.error(`❌ Error guardando foto ${foto.path} en histórico:`, fotoErr);
                }
              }
            }
          } catch (e) {
            console.warn("⚠️ Error guardando fotos en histórico:", e.message);
          }
          
          // 2. Insertar TODOS los pedidos en histórico y crear mapeo de IDs
          const insPedidosHist = dbHist.prepare(`
            INSERT INTO ${tablaPedidosHist}
            (pedido, guia, paqueteria, motivo, area, usuario, fecha, fecha_cierre)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);

          // Mapeo de ID antiguo -> ID nuevo del pedido en histórico
          const mapeoPedidos = new Map();
          let pedidosInsertados = 0;

          for (const pedido of pedidosDelDia) {
            try {
              const result = insPedidosHist.run(
                pedido.pedido || "",
                pedido.guia || null,
                pedido.paqueteria || null,
                pedido.motivo || null,
                pedido.area || area,
                pedido.usuario || null,
                fecha,
                fecha
              );
              // Guardar el mapeo: ID antiguo -> ID nuevo
              mapeoPedidos.set(pedido.id, result.lastInsertRowid);
              pedidosInsertados++;
            } catch (insertErr) {
              // Si es error de duplicado, buscar el ID existente
              if (String(insertErr.message).includes("UNIQUE") || String(insertErr.message).includes("duplicate")) {
                try {
                  const pedidoExistente = dbHist
                    .prepare(`SELECT id FROM ${tablaPedidosHist} WHERE pedido = ? AND area = ?`)
                    .get(pedido.pedido, pedido.area || area);
                  
                  if (pedidoExistente) {
                    mapeoPedidos.set(pedido.id, pedidoExistente.id);
                    // Actualizar el pedido existente
                    dbHist.prepare(`
                      UPDATE ${tablaPedidosHist}
                      SET fecha_cierre = ?, guia = ?, paqueteria = ?, motivo = ?, usuario = ?, fecha = ?
                      WHERE pedido = ? AND area = ?
                    `).run(
                      fecha,
                      pedido.guia || null,
                      pedido.paqueteria || null,
                      pedido.motivo || null,
                      pedido.usuario || null,
                      fecha,
                      pedido.pedido,
                      pedido.area || area
                    );
                    pedidosInsertados++;
                  }
                } catch (updateErr) {
                  console.error(`❌ Error actualizando pedido ${pedido.pedido}:`, updateErr);
                }
              } else {
                console.error(`❌ Error insertando pedido ${pedido.pedido} (ID: ${pedido.id}):`, insertErr);
              }
            }
          }

          console.log(`✅ ${pedidosInsertados} pedidos de ${area} insertados/actualizados en histórico`);

          // 3. Copiar TODOS los productos al histórico asociados a los pedidos históricos
          if (productosDelDia.length > 0 && mapeoPedidos.size > 0) {
            console.log(`📦 Copiando ${productosDelDia.length} productos al histórico...`);
            
            // Crear tabla histórica de productos si no existe
            const tablaProductosHist = "devoluciones_clientes_hist";
            if (!tableExists(dbHist, tablaProductosHist)) {
              console.log(`📝 Creando tabla histórica ${tablaProductosHist}...`);
              dbHist.exec(`
                CREATE TABLE IF NOT EXISTS ${tablaProductosHist} (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  devolucion_id INTEGER,
                  codigo TEXT,
                  nombre TEXT,
                  presentacion TEXT,
                  lote TEXT,
                  cantidad INTEGER,
                  caducidad TEXT,
                  apto INTEGER DEFAULT 1,
                  activo INTEGER DEFAULT 1,
                  pedido TEXT,
                  guia TEXT,
                  paqueteria TEXT,
                  motivo TEXT,
                  area TEXT,
                  usuario TEXT,
                  fecha TEXT,
                  fecha_cierre TEXT
                )
              `);
              console.log(`✅ Tabla ${tablaProductosHist} creada exitosamente`);
            }
            
            // SIEMPRE verificar y agregar columna presentacion si no existe (tanto si la tabla es nueva como si ya existe)
            try {
              const tableInfo = dbHist.prepare(`PRAGMA table_info(${tablaProductosHist})`).all();
              const hasPresentacion = tableInfo.some(col => col.name === 'presentacion');
              if (!hasPresentacion) {
                console.log(`📝 Agregando columna presentacion a ${tablaProductosHist}...`);
                dbHist.exec(`ALTER TABLE ${tablaProductosHist} ADD COLUMN presentacion TEXT;`);
                console.log(`✅ Columna presentacion agregada a ${tablaProductosHist}`);
              }
            } catch (e) {
              if (!String(e.message).includes("duplicate") && !String(e.message).includes("exists")) {
                console.warn(`⚠️ No se pudo agregar columna presentacion a ${tablaProductosHist}:`, e.message);
              }
            }
            
            // Preparar la consulta INSERT DESPUÉS de asegurar que la tabla tiene todas las columnas
            const insProductosHist = dbHist.prepare(`
              INSERT INTO ${tablaProductosHist}
              (devolucion_id, codigo, nombre, presentacion, lote, cantidad, caducidad, apto, activo,
               pedido, guia, paqueteria, motivo, area, usuario, fecha, fecha_cierre)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            let productosCopiados = 0;
            for (const producto of productosDelDia) {
              try {
                // Obtener el nuevo ID del pedido histórico usando el mapeo
                const nuevoPedidoId = mapeoPedidos.get(producto.devolucion_id);
                if (!nuevoPedidoId) {
                  console.warn(`⚠️ No se encontró mapeo para pedido ID ${producto.devolucion_id}, omitiendo producto ${producto.id}`);
                  continue;
                }
                
                // Preparar valores con validación
                const valores = [
                  nuevoPedidoId, // devolucion_id en histórico
                  producto.codigo || "",
                  producto.nombre || "",
                  producto.presentacion || null,
                  producto.lote || "",
                  Number(producto.cantidad) || 0,
                  producto.caducidad || null,
                  producto.apto !== null && producto.apto !== undefined ? Number(producto.apto) : 1,
                  producto.activo !== null && producto.activo !== undefined ? Number(producto.activo) : 1,
                  producto.pedido || "",
                  producto.guia || null,
                  producto.paqueteria || null,
                  producto.motivo || null,
                  producto.area || area,
                  producto.usuario || null,
                  producto.fecha || fecha,
                  fecha  // fecha_cierre
                ];
                
                if (valores.length !== 17) {
                  console.error(`❌ Error: número incorrecto de valores (${valores.length} en lugar de 17) para producto ${producto.id}`);
                  continue;
                }
                
                insProductosHist.run(...valores);
                productosCopiados++;
              } catch (insertErr) {
                console.error(`❌ Error insertando producto ${producto.id} en histórico:`, insertErr);
                console.error(`❌ Mensaje:`, insertErr.message);
                console.error(`❌ Código:`, insertErr.code);
                console.error(`❌ Producto:`, JSON.stringify(producto, null, 2));
                console.warn(`⚠️ Se omitió el producto ${producto.id} debido a error`);
              }
            }
            
            resumenPorArea[area] = productosCopiados;
            totalMovidos += productosCopiados;
          } else {
            resumenPorArea[area] = 0;
            totalMovidos += 0;
          }

          totalPedidosMovidos += pedidosInsertados;
          resumenPedidosPorArea[area] = pedidosInsertados;

          // 4. Eliminar TODOS los productos y pedidos de la tabla actual (como en reenvíos)
          // Verificar que placeholders y pedidosIds estén definidos
          if (pedidosIds && pedidosIds.length > 0 && placeholders) {
            // Desactivar temporalmente las restricciones de clave foránea
            dbDevol.pragma("foreign_keys = OFF");
            
            // Eliminar productos de estos pedidos de la tabla principal (ya están guardados en histórico)
            try {
              const productosEliminados = dbDevol
                .prepare(`DELETE FROM devoluciones_productos WHERE devolucion_id IN (${placeholders})`)
                .run(...pedidosIds);
            } catch (e) {
              console.warn("⚠️ Error eliminando productos:", e.message);
            }
            
            // Eliminar fotos de estos pedidos de la tabla principal (ya están guardadas en histórico)
            try {
              const fotosEliminadas = dbDevol
                .prepare(`DELETE FROM devoluciones_fotos WHERE devolucion_id IN (${placeholders})`)
                .run(...pedidosIds);
              console.log(`🗑️ ${fotosEliminadas.changes} fotos eliminadas de tabla principal`);
            } catch (e) {
              console.warn("⚠️ Error eliminando fotos:", e.message);
            }
            
            // Eliminar TODOS los pedidos (ya se movieron al histórico)
            try {
              const pedidosEliminados = dbDevol
                .prepare(`DELETE FROM devoluciones_pedidos WHERE id IN (${placeholders})`)
                .run(...pedidosIds);
            } catch (e) {
              console.error("❌ Error eliminando pedidos:", e);
              throw e; // Re-lanzar el error para que se capture en el catch principal
            }
            
            // Reactivar las restricciones
            dbDevol.pragma("foreign_keys = ON");
          } else {
            console.warn(`⚠️ No hay pedidos para eliminar en área ${area}`);
          }
        } else {
          resumenPedidosPorArea[area] = 0;
        }
      } else {
        // Las otras áreas no manejan pedidos, solo productos
        resumenPedidosPorArea[area] = 0;
      }
    }

    // Emitir eventos para actualizar frontend
    // Usar setTimeout para asegurar que la transacción se complete
    const io = getIO();
    setTimeout(() => {
      io.emit("devoluciones_actualizadas", []);
      io.emit("reportes_actualizados");
      console.log("📡 Eventos de devoluciones y reportes emitidos después del cierre del día");
    }, 100);
    
    // También emitir inmediatamente
    io.emit("devoluciones_actualizadas", []);
    io.emit("reportes_actualizados");

    // Auditoría
    registrarAccion({
      usuario: req.user?.name || req.user?.nickname,
      accion: "CERRAR_DIA_DEVOLUCIONES",
      detalle: `Cerró el día de devoluciones ${fecha}. ${totalMovidos} productos y ${totalPedidosMovidos} pedidos movidos al histórico. Tablas limpiadas.`,
      tabla: "devoluciones_productos",
      registroId: 0,
    });


    res.json({ 
      success: true,
      movidos: totalMovidos,
      pedidosMovidos: totalPedidosMovidos,
      resumen: resumenPorArea,
      resumenPedidos: resumenPedidosPorArea,
      fecha
    });
  } catch (err) {
    console.error("❌ Error cerrando día de devoluciones:", err);
    console.error("❌ Mensaje de error:", err.message);
    console.error("❌ Stack trace:", err.stack);
    if (err.code) {
      console.error("❌ Código de error SQLite:", err.code);
    }
    
    // Asegurar que las restricciones se reactiven en caso de error
    try {
      dbDevol.pragma("foreign_keys = ON");
      dbHist.pragma("foreign_keys = ON");
    } catch (e) {
      console.warn("⚠️ Error reactivando foreign_keys:", e.message);
    }
    
    res.status(500).json({ 
      error: "Error cerrando día de devoluciones",
      message: err.message || "Error desconocido",
      details: err.toString(),
      code: err.code || undefined,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// =========================================================
// POST - Importar productos NO APTOS de Clientes a Control de Calidad
// =========================================================
router.post("/clientes/importar-no-aptos", authRequired, requierePermiso("action:activar-productos"), (req, res) => {
  try {
    // Obtener todos los productos NO APTOS de Clientes
    const productosNoAptos = dbDevol
      .prepare(`
        SELECT 
          p.*,
          d.pedido,
          d.guia,
          d.paqueteria,
          d.motivo,
          d.area,
          d.usuario,
          d.fecha
        FROM devoluciones_productos p
        JOIN devoluciones_pedidos d ON d.id = p.devolucion_id
        WHERE d.area = 'Clientes'
          AND COALESCE(p.apto, 1) = 0
      `)
      .all();
    
    if (productosNoAptos.length === 0) {
      return res.json({ 
        success: true, 
        message: "No hay productos no aptos para importar",
        importados: 0 
      });
    }
    
    
    // Insertar en calidad_registros
    const insCalidad = dbDevol.prepare(`
      INSERT INTO calidad_registros 
      (area, fecha, pedido, codigo, producto, presentacion, cantidad, lote, caducidad, 
       recibido_calidad, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    
    let importados = 0;
    const idsParaEliminar = [];
    
    const tx = dbDevol.transaction(() => {
      for (const p of productosNoAptos) {
        try {
          // Insertar en calidad_registros
          insCalidad.run(
            'Devoluciones', // area
            p.fecha || dayjs().format('YYYY-MM-DD'),
            p.pedido || '',
            p.codigo || '',
            p.nombre || '',
            p.presentacion || '',
            p.cantidad || 0,
            p.lote || '',
            p.caducidad || ''
          );
          importados++;
          idsParaEliminar.push(p.id);
        } catch (err) {
          console.error(`❌ Error importando producto ${p.id}:`, err);
        }
      }
    });
    
    tx();
    
    // ⚠️ IMPORTANTE: NO eliminar productos de devoluciones_productos
    // Solo se crean copias en calidad_registros, las tarjetas deben mantenerse completas
    // Los productos permanecen en las tarjetas tal cual fueron creados
    
    // Eliminar de productos_general SOLO los productos NO APTOS importados
    // IMPORTANTE: Solo eliminar productos que sean NO APTOS para no afectar productos activos o no activos
    let eliminadosGeneral = 0;
    try {
      for (const p of productosNoAptos) {
        // Verificar que el producto en productos_general sea realmente NO APTO antes de eliminar
        const productoEnGeneral = dbDevol
          .prepare(`
            SELECT id, apto FROM devoluciones_productos_general 
            WHERE codigo = ? 
              AND COALESCE(lote, '') = COALESCE(?, '')
              AND cantidad = ?
              AND pedido = ?
          `)
          .get(p.codigo || '', p.lote || '', p.cantidad || 0, p.pedido || '');
        
        // Solo eliminar si existe y es NO APTO
        if (productoEnGeneral) {
          const esNoApto = productoEnGeneral.apto !== 1 && productoEnGeneral.apto !== true && productoEnGeneral.apto !== '1';
          if (esNoApto) {
            const eliminado = dbDevol
              .prepare(`DELETE FROM devoluciones_productos_general WHERE id = ?`)
              .run(productoEnGeneral.id);
            if (eliminado.changes > 0) {
              eliminadosGeneral++;
            }
          } else {
            console.log(`⚠️ Producto ${productoEnGeneral.id} no se elimina porque es apto (apto=${productoEnGeneral.apto})`);
          }
        }
      }
    } catch (err) {
      console.error("⚠️ Error eliminando de productos_general:", err);
    }
    
    // Emitir eventos
    getIO().emit("calidad_registros_actualizados");
    getIO().emit("devoluciones_actualizadas", []);
    getIO().emit("productos_general_actualizados");
    
    // Auditoría
    registrarAccion({
      usuario: req.user?.name || req.user?.nickname,
      accion: "IMPORTAR_NO_APTOS_CALIDAD",
      detalle: `Importó ${importados} productos no aptos de Clientes a Control de Calidad`,
      tabla: "calidad_registros",
      registroId: 0,
    });
    
    res.json({ 
      success: true, 
      message: `${importados} productos no aptos importados a Control de Calidad`,
      importados 
    });
  } catch (err) {
    console.error("❌ Error importando productos no aptos:", err);
    res.status(500).json({ error: "Error al importar productos no aptos", details: err.message });
  }
});

// =========================================================
// POST - Importar productos de devoluciones a picking
// Desde TODAS las pestañas de devoluciones
// =========================================================
router.post("/importar", authRequired, requierePermiso("action:activar-productos"), async (req, res) => {
  try {
    const { grupos, area, tipo } = req.body;

    if (!Array.isArray(grupos) || grupos.length === 0) {
      return res.status(400).json({ error: "No hay grupos para importar" });
    }

    // Determinar el tipo y área objetivo
    let tipoNormalizado = (tipo || "").toLowerCase();
    let areaObjetivo = area || "";
    
    // Si no viene área pero viene tipo, mapear tipo a área
    if (!areaObjetivo && tipoNormalizado) {
      areaObjetivo = MAPEO_TIPO_AREA[tipoNormalizado] || tipo;
    }
    
    // Normalizar nombre del área (capitalizar primera letra)
    if (areaObjetivo) {
      areaObjetivo = areaObjetivo.charAt(0).toUpperCase() + areaObjetivo.slice(1).toLowerCase();
    }
    
    // Si es "Clientes", usar la estructura de pedidos. Para otras áreas, usar tablas en dbDia
    const esClientes = tipoNormalizado === "clientes" || areaObjetivo === "Clientes";
    

    const hora = dayjs().format("HH:mm:ss");
    let productosImportados = 0;
    let totalCajas = 0;
    let totalPiezas = 0;

    // Agrupar productos por código + presentación + lote para sumar cantidades correctamente
    const productosAgrupados = new Map();

    // ⚠️ IMPORTANTE: Usar los datos que vienen del frontend directamente
    // El frontend ya agrupa y calcula las piezas correctamente
    for (const grupo of grupos) {
      try {
        const codigo = grupo.codigo || "";
        const presentacion = grupo.presentacion || "";
        const lote = grupo.lote || null;
        // Cambiar "cantidad" por "piezas" para mayor claridad
        const piezas = Number(grupo.cantidad || grupo.total || grupo.piezas || 0);
        
        // Validar que las piezas sean válidas
        if (piezas <= 0 || !grupo.nombre) {
          continue;
        }

        // ⚠️ IMPORTANTE: Agrupar por código + presentación + lote para evitar duplicados
        const key = `${codigo}@@${presentacion}@@${lote}`;
        
        if (!productosAgrupados.has(key)) {
          productosAgrupados.set(key, {
            codigo: codigo,
            nombre: grupo.nombre || "",
            presentacion: presentacion,
            lote: lote,
            piezas: 0,  // Cambiar "cantidad" por "piezas"
            pedidos: new Set()
          });
        }

        const agrupado = productosAgrupados.get(key);
        agrupado.piezas += piezas; // ⚠️ Sumar las piezas tal cual vienen del frontend
      } catch (err) {
        console.error(`❌ Error procesando grupo "${grupo.nombre}":`, err);
      }
    }


    // Insertar cada producto agrupado
    for (const [key, productoAgrupado] of productosAgrupados) {
      try {
        const codigo = productoAgrupado.codigo;
        const nombre = productoAgrupado.nombre;
        const presentacion = productoAgrupado.presentacion || "";
        const lote = productoAgrupado.lote;
        // Cambiar "cantidadTotal" por "piezasTotal" para mayor claridad
        const piezasTotal = Number(productoAgrupado.piezas || productoAgrupado.cantidad || 0);


        // Validar que haya piezas válidas
        if (!piezasTotal || piezasTotal <= 0) {
          console.log(`⚠️ Producto "${nombre}" tiene piezas totales ${piezasTotal}, saltando...`);
          continue;
        }

        // Obtener TODA la información del inventario (categoría, subcategoría, presentación, etc.)
        const invInfo = dbInv
          .prepare("SELECT categoria, subcategoria, presentacion, piezas_por_caja FROM productos_ref WHERE codigo = ?")
          .get(codigo);

        // Asegurar que se obtenga la categoría - si no existe en inventario, intentar obtenerla de otra forma
        let categoria = invInfo?.categoria || null;
        const subcategoria = invInfo?.subcategoria || null;
        
        // Si no hay categoría en inventario, intentar obtenerla del nombre del producto o usar un valor por defecto
        if (!categoria && nombre) {
          // Intentar inferir categoría del nombre (ej: si contiene "capsula" o "capsulas")
          const nombreLower = nombre.toLowerCase();
          if (nombreLower.includes("capsula") || nombreLower.includes("cápsula")) {
            categoria = "Capsulas";
          } else if (nombreLower.includes("tableta") || nombreLower.includes("tablet")) {
            categoria = "Tabletas";
          } else if (nombreLower.includes("polvo") || nombreLower.includes("polvos")) {
            categoria = "Polvos";
          }
        }
        
        // Buscar la fecha/hora más antigua cuando se agregó a devoluciones
        let horaSolicitud = hora; // Por defecto, usar hora actual
        try {
          // Para "clientes", buscar en devoluciones_pedidos (verificar si tiene columna hora)
          if (esClientes) {
            // Primero verificar si existe la columna hora
            const columnInfo = dbDevol.prepare(`
              SELECT name FROM pragma_table_info('devoluciones_pedidos') WHERE name = 'hora'
            `).get();
            
            if (columnInfo) {
              // Si existe la columna hora, usarla
              const productoDevolucion = dbDevol
                .prepare(`
                  SELECT MIN(COALESCE(NULLIF(d.hora, ''), '00:00:00')) as hora_minima
                  FROM devoluciones_productos p
                  JOIN devoluciones_pedidos d ON d.id = p.devolucion_id
                  WHERE p.codigo = ? AND (p.lote = ? OR (p.lote IS NULL AND ? IS NULL))
                  AND d.area = 'Clientes'
                `)
                .get(codigo, lote, lote);
              
              if (productoDevolucion?.hora_minima && productoDevolucion.hora_minima !== "00:00:00") {
                horaSolicitud = productoDevolucion.hora_minima;
              }
            } else {
              // Si no existe la columna hora, usar fecha con hora inicial
              const productoDevolucion = dbDevol
                .prepare(`
                  SELECT MIN(d.fecha) as fecha_minima
                  FROM devoluciones_productos p
                  JOIN devoluciones_pedidos d ON d.id = p.devolucion_id
                  WHERE p.codigo = ? AND (p.lote = ? OR (p.lote IS NULL AND ? IS NULL))
                  AND d.area = 'Clientes'
                `)
                .get(codigo, lote, lote);
              
              if (productoDevolucion?.fecha_minima) {
                horaSolicitud = "00:00:00"; // Usar hora inicial del día
              }
            }
          } else {
            // Para otras áreas, buscar en la tabla correspondiente (tienen hora_ultima)
            const tablaDia = getTablaDia(tipoNormalizado);
            if (tablaDia) {
              const productoDevolucion = dbDia
                .prepare(`
                  SELECT MIN(hora_ultima) as hora_minima
                  FROM ${tablaDia}
                  WHERE codigo = ? AND (lote = ? OR (lote IS NULL AND ? IS NULL))
                  AND activo = 1
                `)
                .get(codigo, lote, lote);
              
              if (productoDevolucion?.hora_minima) {
                horaSolicitud = productoDevolucion.hora_minima;
              }
            }
          }
        } catch (err) {
          console.log(`⚠️ No se pudo obtener hora de solicitud para ${codigo}, usando hora actual:`, err.message);
          // Si hay error, usar hora actual
        }
        
        
        // ⚠️ LÓGICA CLARA: Pasar piezas TAL CUAL - SIN CONVERSIONES
        // Ejemplo: Si hay 10 piezas de resveratrol en devoluciones
        //          → Pasa a picking: 1 caja, 10 piezas, total 10
        //          → NO se convierte: las 10 piezas siguen siendo 10 piezas
        //          → NO se calculan cajas a partir de piezas
        //          → SIEMPRE se agrega 1 caja automáticamente
        let cajas = 1;  // ⚠️ SIEMPRE 1 caja automáticamente (fijo, no calculado)
        let piezas = piezasTotal;  // ⚠️ Piezas TAL CUAL - pasan exactamente como están (10 pz = 10 pz, sin conversión)
        
        // ⚠️ IMPORTANTE: La cantidad de devoluciones se convierte en piezas_por_caja
        // Ejemplo: Si en devoluciones hay cantidad = 9, entonces piezas_por_caja = 9
        const piezasPorCaja = piezasTotal;  // Usar la cantidad de devoluciones como piezas por caja
        
        
        // Combinar nombre y presentación si existe
        const nombreCompleto = obtenerNombreCompleto(nombre, presentacion);

        // ⚠️ IMPORTANTE: SIEMPRE crear un nuevo registro, NO actualizar existentes
        // Esto evita sumar cajas y mantiene cada importación como registro separado
        
        // Determinar el texto de observación según el tipo
        const tipoObservacion = areaObjetivo || tipo || "Devoluciones";
        const observacion = `Devolución ${tipoObservacion}`;
        
        
        // SIEMPRE insertar nuevo registro (no verificar si existe)
        const result = dbDia
          .prepare(`
            INSERT INTO productos 
            (codigo, nombre, presentacion, lote, cajas, piezas, piezas_por_caja, extras, 
             surtido, disponible, hora_solicitud, hora_surtido, origen, devolucion_producto_id, observaciones, importacion, categoria)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            codigo,
            nombreCompleto,
            presentacion || '',  // ⚠️ Incluir presentación
            lote || null,
            cajas,  // ⚠️ SIEMPRE 1 caja (fijo, no calculado)
            piezas,  // ⚠️ Piezas TAL CUAL - pasan exactamente como están (10 pz = 10 pz)
            piezasPorCaja || 0,  // ⚠️ La cantidad de devoluciones se convierte en piezas_por_caja
            0, // extras
            1, // ⚠️ surtido = 1 (marcar como surtido automáticamente)
            1, // disponible = 1 (siempre disponible)
            horaSolicitud,  // ⚠️ hora_solicitud = cuando se agregó a devoluciones
            hora, // ⚠️ hora_surtido = hora actual (cuando se importa)
            "devoluciones", // origen
            null, // devolucion_producto_id (null porque agrupamos múltiples)
            observacion,  // ⚠️ Observación simplificada: "Devolución Retail", "Devolución Clientes", etc.
            0, // importacion = 0 (no es importación, es devolución)
            categoria || null  // ⚠️ Categoría del inventario
          );
        
        totalCajas += cajas;
        totalPiezas += piezas;

        productosImportados++;
      } catch (err) {
        console.error(`❌ Error insertando producto "${productoAgrupado.nombre}":`, err);
      }
    }


    // Eliminar de productos_general los productos importados (solo si es Clientes y son activos)
    let eliminadosGeneral = 0;
    if (esClientes) {
      try {
        // Obtener los productos activos que se importaron
        for (const productoAgrupado of productosAgrupados.values()) {
          // Buscar productos en productos_general que coincidan
          const productosEnGeneral = dbDevol
            .prepare(`
              SELECT id FROM devoluciones_productos_general
              WHERE codigo = ?
                AND COALESCE(lote, '') = COALESCE(?, '')
                AND activo = 1
            `)
            .all(productoAgrupado.codigo || '', productoAgrupado.lote || '');
          
          // Eliminar los productos encontrados
          for (const prod of productosEnGeneral) {
            const eliminado = dbDevol
              .prepare(`DELETE FROM devoluciones_productos_general WHERE id = ?`)
              .run(prod.id);
            if (eliminado.changes > 0) {
              eliminadosGeneral++;
            }
          }
        }
      } catch (err) {
        console.error("⚠️ Error eliminando de productos_general:", err);
      }
    }

    // Emitir eventos para actualizar picking en tiempo real
    const io = getIO();
    io.emit("picking_actualizado");
    io.emit("productos_actualizados", []); // Forzar recarga de productos
    if (esClientes) {
      io.emit("productos_general_actualizados");
    }

    // Registrar en auditoría
    registrarAccion({
      usuario: req.user?.name || req.user?.nickname,
      accion: "IMPORTAR_DEVOLUCIONES_PICKING",
      detalle: `Importados ${productosImportados} producto(s) desde Devoluciones (${areaObjetivo}) a Picking. Total: ${totalCajas} cajas, ${totalPiezas} piezas. Productos: ${Array.from(productosAgrupados.values()).map(p => `${p.nombre} (${p.piezas} pzs)`).join(", ")}`,
      tabla: "productos",
      registroId: null,
    });

    res.json({ 
      ok: true, 
      productosImportados,
      totalCajas,
      totalPiezas,
      mensaje: `${productosImportados} producto(s) importado(s) exitosamente (${totalCajas} cajas, ${totalPiezas} piezas)`
    });
  } catch (err) {
    console.error("❌ Error importando productos:", err);
    res.status(500).json({ error: "Error importando productos", details: err.message });
  }
});

router.post(
  "/:tipo/:id/evidencias",
  authRequired,
  upload.array("evidencias", 20),
  (req, res) => {
    try {
      const { tipo, id } = req.params;
      const tabla = getTablaDia(tipo);
      
      if (!tabla) {
        return res.status(400).json({ error: "Tipo de devolución inválido" });
      }
      
      // Verificar que el registro existe
      const registro = dbDia
        .prepare(`SELECT * FROM ${tabla} WHERE id = ?`)
        .get(id);
      
      if (!registro) {
        return res.status(404).json({ error: "Registro no encontrado" });
      }
      
      // Crear tabla de evidencias si no existe
      try {
        dbDia.exec(`
          CREATE TABLE IF NOT EXISTS devoluciones_evidencias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL,
            registro_id INTEGER NOT NULL,
            path TEXT NOT NULL,
            fecha TEXT DEFAULT (datetime('now', 'localtime'))
          );
          CREATE INDEX IF NOT EXISTS idx_evidencias_tipo_registro ON devoluciones_evidencias(tipo, registro_id);
        `);
      } catch (e) {
        // Tabla ya existe, continuar
      }
      
      const files = req.files || [];
      if (files.length === 0) {
        return res.status(400).json({ error: "No se recibieron archivos" });
      }
      
      const insertEvidencia = dbDia.prepare(`
        INSERT INTO devoluciones_evidencias (tipo, registro_id, path, fecha)
        VALUES (?, ?, ?, datetime('now', 'localtime'))
      `);
      
      const paths = [];
      for (const file of files) {
        const filePath = file.filename;
        insertEvidencia.run(tipo, id, filePath);
        paths.push(filePath);
      }
      
      registrarAccion({
        usuario: req.user?.name || req.user?.nickname,
        accion: "SUBIR_EVIDENCIAS_DEVOLUCIONES",
        detalle: `Subió ${files.length} evidencia(s) para registro ${id} en área ${tipo}`,
        tabla: tabla,
        registroId: id,
      });
      
      res.json({ ok: true, count: files.length, paths });
    } catch (err) {
      console.error("❌ Error guardando evidencias:", err);
      res.status(500).json({ error: "Error al guardar evidencias", details: err.message });
    }
  }
);

router.get("/:tipo/:id/evidencias", authRequired, (req, res) => {
  try {
    const { tipo, id } = req.params;
    
    const evidencias = dbDia
      .prepare(`
        SELECT * FROM devoluciones_evidencias 
        WHERE tipo = ? AND registro_id = ?
        ORDER BY fecha DESC
      `)
      .all(tipo, id);
    
    res.json(evidencias);
  } catch (err) {
    console.error("❌ Error obteniendo evidencias:", err);
    res.status(500).json({ error: "Error al obtener evidencias", details: err.message });
  }
});

// ============================================================
// ACCESO MÓVIL PARA SUBIR FOTOS EN DEVOLUCIONES
// ============================================================

// POST - Generar token temporal para acceso móvil
router.post(
  "/clientes/:id/mobile-token",
  requierePermiso("tab:devoluciones"),
  (req, res) => {
    try {
      const devolucionId = parseInt(req.params.id);
      const usuarioId = req.user?.id;

      // Verificar que la devolución existe
      const devolucion = dbDevol
        .prepare("SELECT id, pedido FROM devoluciones_pedidos WHERE id = ?")
        .get(devolucionId);

      if (!devolucion) {
        return res.status(404).json({ error: "Devolución no encontrada" });
      }

      // Generar token único
      const token = crypto.randomBytes(32).toString("hex");
      
      // Token expira en 30 minutos
      const expiraEn = dayjs().add(30, "minutes").format("YYYY-MM-DD HH:mm:ss");

      // Guardar token en BD
      dbUsers
        .prepare(`
          INSERT INTO mobile_upload_tokens (token, tipo, registro_id, usuario_id, expira_en)
          VALUES (?, 'devolucion', ?, ?, ?)
        `)
        .run(token, devolucionId, usuarioId || null, expiraEn);

      // Obtener la URL base del servidor usando la IP real
      const protocol = req.protocol || "http";
      // Intentar obtener la IP real del servidor desde los headers o usar la IP local
      let host = req.get("host");
      
      // Si el host es localhost o contiene localhost, usar la IP real del servidor
      if (!host || host.includes("localhost") || host.includes("127.0.0.1")) {
        // Obtener la IP local del servidor
        const os = require("os");
        const interfaces = os.networkInterfaces();
        let localIP = "172.16.30.12"; // IP por defecto
        
        for (const name of Object.keys(interfaces)) {
          for (const iface of interfaces[name]) {
            if (iface.family === "IPv4" && !iface.internal) {
              localIP = iface.address;
              break;
            }
          }
          if (localIP !== "172.16.30.12") break;
        }
        
        host = `${localIP}:3001`; // Puerto del servidor backend
      }
      
      const mobileUrl = `${protocol}://${host}/devoluciones/mobile/upload/${token}`;

      res.json({
        ok: true,
        token,
        mobileUrl,
        expiraEn,
        pedido: devolucion.pedido,
      });
    } catch (err) {
      console.error("Error generando token móvil:", err);
      res.status(500).json({ error: "Error generando token" });
    }
  }
);

// GET - Página HTML móvil para subir fotos
router.get("/mobile/upload/:token", (req, res) => {
  try {
    const token = req.params.token;

    // Validar token
    const tokenData = dbUsers
      .prepare(`
        SELECT token, tipo, registro_id, expira_en, usado
        FROM mobile_upload_tokens
        WHERE token = ?
      `)
      .get(token);

    if (!tokenData) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Token inválido</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
            .error { color: #d32f2f; }
          </style>
        </head>
        <body>
          <h1 class="error">❌ Token inválido o expirado</h1>
          <p>Este enlace ya no es válido.</p>
        </body>
        </html>
      `);
    }

    // Verificar expiración
    const ahora = dayjs();
    const expira = dayjs(tokenData.expira_en);
    if (ahora.isAfter(expira)) {
      return res.status(410).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Token expirado</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
            .error { color: #d32f2f; }
          </style>
        </head>
        <body>
          <h1 class="error">⏰ Token expirado</h1>
          <p>Este enlace expiró. Solicita uno nuevo desde la computadora.</p>
        </body>
        </html>
      `);
    }

    // Obtener info de la devolución
    const devolucion = dbDevol
      .prepare("SELECT id, pedido FROM devoluciones_pedidos WHERE id = ?")
      .get(tokenData.registro_id);

    if (!devolucion) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Devolución no encontrada</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
            .error { color: #d32f2f; }
          </style>
        </head>
        <body>
          <h1 class="error">❌ Devolución no encontrada</h1>
        </body>
        </html>
      `);
    }

    // Enviar página HTML móvil (mismo código que reenvios, solo cambiar la ruta)
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>Subir fotos - ${devolucion.pedido}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
          .container {
            background: white;
            border-radius: 20px;
            padding: 30px;
            max-width: 500px;
            width: 100%;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          }
          h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 24px;
            text-align: center;
          }
          .pedido-info {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
            font-size: 16px;
          }
          .upload-area {
            border: 3px dashed #667eea;
            border-radius: 15px;
            padding: 40px 20px;
            text-align: center;
            margin-bottom: 20px;
            background: #f8f9ff;
            cursor: pointer;
            transition: all 0.3s;
          }
          .upload-area:hover, .upload-area.dragover {
            background: #eef0ff;
            border-color: #764ba2;
          }
          .upload-icon {
            font-size: 48px;
            margin-bottom: 15px;
          }
          .upload-text {
            color: #667eea;
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 10px;
          }
          .upload-hint {
            color: #999;
            font-size: 14px;
          }
          input[type="file"] {
            display: none;
          }
          .btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
            margin-bottom: 15px;
            transition: transform 0.2s;
          }
          .btn:active {
            transform: scale(0.98);
          }
          .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
          .preview-container {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin-top: 20px;
            width: 100%;
          }
          .preview-item {
            position: relative;
            border-radius: 10px;
            overflow: hidden;
            aspect-ratio: 1;
            background: #f0f0f0;
            width: 100%;
            min-height: 120px;
            border: 2px solid #e0e0e0;
          }
          .preview-item img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
            min-height: 120px;
          }
          .preview-item .remove {
            position: absolute;
            top: 5px;
            right: 5px;
            background: rgba(255,0,0,0.8);
            color: white;
            border: none;
            border-radius: 50%;
            width: 30px;
            height: 30px;
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .status {
            text-align: center;
            padding: 15px;
            border-radius: 10px;
            margin-top: 20px;
            font-weight: 600;
          }
          .status.success {
            background: #d4edda;
            color: #155724;
          }
          .status.error {
            background: #f8d7da;
            color: #721c24;
          }
          .status.loading {
            background: #d1ecf1;
            color: #0c5460;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📸 Subir Fotos</h1>
          <div class="pedido-info">Pedido: <strong>${devolucion.pedido}</strong></div>
          
          <div class="upload-area" id="uploadArea">
            <div class="upload-icon">📷</div>
            <div class="upload-text">Toca para tomar o seleccionar fotos</div>
            <div class="upload-hint">Máximo 20 fotos</div>
          </div>
          
          <div style="display: flex; gap: 10px; margin-bottom: 15px;">
            <button class="btn" id="cameraBtn" style="flex: 1; background: #3b82f6;">
              📷 Tomar Foto
            </button>
            <button class="btn" id="galleryBtn" style="flex: 1; background: #6b7280;">
              🖼️ Galería
            </button>
          </div>
          
          <input type="file" id="fileInputCamera" accept="image/*" capture="environment" multiple style="display: none;">
          <input type="file" id="fileInputGallery" accept="image/*" multiple style="display: none;">
          <button class="btn" id="submitBtn" disabled>Subir Fotos</button>
          
          <div id="previewContainer" class="preview-container"></div>
          <div id="status"></div>
        </div>

        <script>
          const token = '${token}';
          const fileInputCamera = document.getElementById('fileInputCamera');
          const fileInputGallery = document.getElementById('fileInputGallery');
          const cameraBtn = document.getElementById('cameraBtn');
          const galleryBtn = document.getElementById('galleryBtn');
          const uploadArea = document.getElementById('uploadArea');
          const submitBtn = document.getElementById('submitBtn');
          const previewContainer = document.getElementById('previewContainer');
          const statusDiv = document.getElementById('status');
          
          let selectedFiles = [];
          const maxFiles = 20;

          cameraBtn.addEventListener('click', () => fileInputCamera.click());
          galleryBtn.addEventListener('click', () => fileInputGallery.click());
          uploadArea.addEventListener('click', () => fileInputGallery.click());
          
          uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
          });
          
          uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
          });
          
          uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            handleFiles(e.dataTransfer.files);
          });

          fileInputCamera.addEventListener('change', (e) => {
            handleFiles(e.target.files);
            e.target.value = ''; // Limpiar para permitir seleccionar de nuevo
          });

          fileInputGallery.addEventListener('change', (e) => {
            handleFiles(e.target.files);
            e.target.value = ''; // Limpiar para permitir seleccionar de nuevo
          });

          function handleFiles(files) {
            const newFiles = Array.from(files).slice(0, maxFiles - selectedFiles.length);
            selectedFiles = [...selectedFiles, ...newFiles].slice(0, maxFiles);
            updatePreview();
            submitBtn.disabled = selectedFiles.length === 0;
          }

          function updatePreview() {
            previewContainer.innerHTML = '';
            if (selectedFiles.length === 0) {
              previewContainer.style.display = 'none';
              return;
            }
            previewContainer.style.display = 'grid';
            selectedFiles.forEach((file, index) => {
              const div = document.createElement('div');
              div.className = 'preview-item';
              const img = document.createElement('img');
              img.src = URL.createObjectURL(file);
              img.alt = 'Foto ' + (index + 1);
              img.onerror = function() {
                this.style.display = 'none';
                div.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999;">Error cargando</div>';
              };
              img.onload = function() {
                this.style.display = 'block';
              };
              const removeBtn = document.createElement('button');
              removeBtn.className = 'remove';
              removeBtn.innerHTML = '×';
              removeBtn.onclick = () => {
                selectedFiles.splice(index, 1);
                URL.revokeObjectURL(img.src);
                updatePreview();
                submitBtn.disabled = selectedFiles.length === 0;
              };
              div.appendChild(img);
              div.appendChild(removeBtn);
              previewContainer.appendChild(div);
            });
          }

          submitBtn.addEventListener('click', async () => {
            if (selectedFiles.length === 0) return;
            
            submitBtn.disabled = true;
            submitBtn.textContent = 'Subiendo...';
            statusDiv.className = 'status loading';
            statusDiv.textContent = '⏳ Subiendo fotos...';

            const formData = new FormData();
            selectedFiles.forEach(file => {
              formData.append('evidencias', file);
            });

            try {
              const response = await fetch('/devoluciones/mobile/upload/' + token, {
                method: 'POST',
                body: formData
              });

              const data = await response.json();

              if (data.ok) {
                statusDiv.className = 'status success';
                statusDiv.textContent = '✅ ' + data.count + ' foto(s) subida(s) correctamente';
                selectedFiles = [];
                updatePreview();
                submitBtn.textContent = 'Subir Fotos';
                
                setTimeout(() => {
                  statusDiv.textContent = '';
                  statusDiv.className = '';
                }, 3000);
              } else {
                throw new Error(data.error || 'Error subiendo fotos');
              }
            } catch (error) {
              statusDiv.className = 'status error';
              statusDiv.textContent = '❌ Error: ' + error.message;
              submitBtn.disabled = false;
              submitBtn.textContent = 'Subir Fotos';
            }
          });
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error("Error mostrando página móvil:", err);
    res.status(500).send("Error cargando página");
  }
});

// POST - Subir fotos desde móvil (sin autenticación, solo con token)
router.post(
  "/mobile/upload/:token",
  upload.array("evidencias", 20),
  (req, res) => {
    try {
      const token = req.params.token;
      const files = req.files || [];

      if (files.length === 0) {
        return res.status(400).json({ error: "No se enviaron fotos" });
      }

      // Validar token
      const tokenData = dbUsers
        .prepare(`
          SELECT token, tipo, registro_id, expira_en, usado
          FROM mobile_upload_tokens
          WHERE token = ?
        `)
        .get(token);

      if (!tokenData) {
        return res.status(404).json({ error: "Token inválido" });
      }

      // Verificar expiración
      const ahora = dayjs();
      const expira = dayjs(tokenData.expira_en);
      if (ahora.isAfter(expira)) {
        return res.status(410).json({ error: "Token expirado" });
      }

      // Verificar que la devolución existe
      const devolucion = dbDevol
        .prepare("SELECT id, pedido FROM devoluciones_pedidos WHERE id = ?")
        .get(tokenData.registro_id);

      if (!devolucion) {
        return res.status(404).json({ error: "Devolución no encontrada" });
      }

      // Obtener el nombre del pedido para la carpeta
      const nombrePedido = (devolucion.pedido || String(tokenData.registro_id))
        .replace(/[<>:"/\\|?*]/g, '_')
        .trim();
      
      const carpetaPedido = path.join(uploadDir, nombrePedido);
      if (!fs.existsSync(carpetaPedido)) {
        fs.mkdirSync(carpetaPedido, { recursive: true });
      }

      // Asegurar que la carpeta del pedido existe
      if (!fs.existsSync(carpetaPedido)) {
        fs.mkdirSync(carpetaPedido, { recursive: true });
        console.log(`📁 Carpeta creada: ${carpetaPedido}`);
      }

      // Guardar fotos
      const insertFoto = dbDevol.prepare(`
        INSERT INTO devoluciones_fotos (devolucion_id, path)
        VALUES (?, ?)
      `);

      for (const f of files) {
        // Los archivos se guardan en uploadDir (raíz) por multer
        const filePathOriginal = f.path || path.join(uploadDir, f.filename);
        const nuevoPath = path.join(carpetaPedido, f.filename);
        const finalPath = `${nombrePedido}/${f.filename}`;
        
        // Logs removidos para evitar saturar la consola
        console.log(`📸 Ruta destino: ${nuevoPath}`);
        
        try {
          // Mover el archivo de la raíz a la carpeta del pedido
          if (fs.existsSync(filePathOriginal)) {
            if (!filePathOriginal.includes(nombrePedido)) {
              fs.renameSync(filePathOriginal, nuevoPath);
              console.log(`✅ Foto móvil movida: ${f.filename} → ${carpetaPedido}`);
            }
          } else if (fs.existsSync(nuevoPath)) {
            console.log(`ℹ️ Foto móvil ya está en carpeta del pedido`);
          } else {
            console.error(`❌ ERROR: Archivo móvil no encontrado`);
          }
          
          // Guardar en BD con el path relativo a la carpeta del pedido
          insertFoto.run(tokenData.registro_id, finalPath);
          console.log(`✅ Foto móvil guardada en BD: path=${finalPath}`);
          
        } catch (moveErr) {
          console.error(`⚠️ Error procesando foto móvil ${f.filename}:`, moveErr);
          // Intentar guardar en BD de todas formas
          insertFoto.run(tokenData.registro_id, finalPath);
        }
      }

      // Emitir evento de socket para sincronización en tiempo real
      getIO().emit("devoluciones_actualizadas");
      getIO().emit("pedido_agregado", { id: tokenData.registro_id, pedido: devolucion.pedido, area: "Clientes" });

      res.json({ ok: true, count: files.length });
    } catch (err) {
      console.error("Error subiendo fotos desde móvil:", err);
      res.status(500).json({ error: "Error subiendo fotos" });
    }
  }
);

// ============================================================
// GENERAR QR CON LOGO PARA URL
// ============================================================
// Este endpoint NO requiere autenticación porque se usa en <img> tags
router.get("/qr", async (req, res) => {
  try {
    const { data } = req.query;
    
    if (!data) {
      return res.status(400).json({ error: "Falta el dato para generar QR" });
    }

    // Decodificar la URL si viene codificada
    let urlDecodificada;
    try {
      urlDecodificada = decodeURIComponent(data);
    } catch (e) {
      // Si falla la decodificación, usar el valor original
      urlDecodificada = data;
    }
    
    // Generar QR con logo integrado
    const qrBuffer = await generarQRConLogo(urlDecodificada, 400);

    if (!qrBuffer || qrBuffer.length === 0) {
      return res.status(500).json({ error: "Error generando QR: buffer vacío" });
    }

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `inline; filename="qr.png"`);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(qrBuffer);
  } catch (err) {
    console.error("❌ Error generando QR:", err.message);
    res.status(500).json({ error: "Error generando QR: " + err.message });
  }
});

export default router;
