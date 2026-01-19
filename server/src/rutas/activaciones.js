import express from "express";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { authRequired } from "../middleware/autenticacion.js";
import { getIO } from "../config/socket.js";
import { dbUsers } from "../config/baseDeDatos.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Crear o abrir la base de datos de activaciones
const dbPath = path.join(__dirname, "../../databases/activaciones.db");
const db = new Database(dbPath);

// Crear tablas si no existen
db.exec(`
  CREATE TABLE IF NOT EXISTS activaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    hora_solicitud TEXT NOT NULL,
    pedido TEXT NOT NULL,
    fecha_pedido TEXT NOT NULL,
    codigo_producto TEXT,
    producto TEXT NOT NULL,
    presentacion TEXT,
    piezas INTEGER DEFAULT 1,
    area TEXT DEFAULT 'APP',
    corroborando INTEGER DEFAULT 0,
    activacion INTEGER DEFAULT 0,
    estado_activacion TEXT DEFAULT 'Pendiente',
    hora_activacion TEXT,
    estatus TEXT DEFAULT 'Pendiente',
    usuario TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activaciones_historico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha_cierre TEXT NOT NULL,
    fecha_original TEXT NOT NULL,
    hora_solicitud TEXT,
    pedido TEXT NOT NULL,
    fecha_pedido TEXT,
    codigo_producto TEXT,
    producto TEXT NOT NULL,
    presentacion TEXT,
    piezas INTEGER DEFAULT 1,
    area TEXT,
    corroborando INTEGER DEFAULT 0,
    activacion INTEGER DEFAULT 0,
    estado_activacion TEXT,
    hora_activacion TEXT,
    estatus TEXT,
    usuario TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_activaciones_fecha ON activaciones(fecha);
  CREATE INDEX IF NOT EXISTS idx_activaciones_pedido ON activaciones(pedido);
  CREATE INDEX IF NOT EXISTS idx_activaciones_historico_fecha ON activaciones_historico(fecha_cierre);
`);

// Función para obtener fecha actual
const getFechaActual = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Función para obtener hora actual
const getHoraActual = () => {
  const now = new Date();
  return now.toTimeString().split(" ")[0];
};

// GET - Obtener todas las activaciones del día actual (o pendientes)
router.get("/", authRequired, (req, res) => {
  try {
    const registros = db.prepare(`
      SELECT * FROM activaciones 
      ORDER BY id DESC
    `).all();
    
    // Obtener todos los usuarios para mapeo eficiente
    const usuarios = dbUsers.prepare("SELECT name, nickname, phone FROM users").all();
    const mapaUsuarios = new Map();
    
    // Crear mapa: nickname -> name, phone -> name, name -> name
    usuarios.forEach(u => {
      if (u.name) {
        mapaUsuarios.set(u.name, u.name);
        if (u.nickname) mapaUsuarios.set(u.nickname, u.name);
        if (u.phone) mapaUsuarios.set(u.phone, u.name);
      }
    });
    
    // Actualizar nombres de usuario a nombre completo
    const stmtUpdate = db.prepare("UPDATE activaciones SET usuario = ? WHERE id = ?");
    const registrosActualizados = registros.map(registro => {
      if (registro.usuario) {
        const nombreCompleto = mapaUsuarios.get(registro.usuario);
        if (nombreCompleto && nombreCompleto !== registro.usuario) {
          // Actualizar en la base de datos
          stmtUpdate.run(nombreCompleto, registro.id);
          // Actualizar en el objeto que se retorna
          registro.usuario = nombreCompleto;
        }
      }
      return registro;
    });
    
    res.json(registrosActualizados);
  } catch (err) {
    console.error("Error obteniendo activaciones:", err);
    res.status(500).json({ error: "Error al obtener activaciones" });
  }
});

// POST - Crear nuevos registros de activaciones
router.post("/", authRequired, (req, res) => {
  try {
    const { registros } = req.body;
    
    if (!Array.isArray(registros) || registros.length === 0) {
      return res.status(400).json({ error: "Se requieren registros para guardar" });
    }

    const fechaActual = getFechaActual();
    const horaActual = getHoraActual();

    // Obtener nombre completo del usuario desde la base de datos (SIEMPRE usar name, nunca nickname)
    let nombreUsuario = "Sistema";
    if (req.user?.id) {
      try {
        const usuario = dbUsers.prepare("SELECT name FROM users WHERE id = ?").get(req.user.id);
        if (usuario && usuario.name) {
          nombreUsuario = usuario.name;
        }
      } catch (err) {
        console.warn("Error obteniendo nombre de usuario:", err.message);
      }
    }

    const stmt = db.prepare(`
      INSERT INTO activaciones (
        fecha, hora_solicitud, pedido, fecha_pedido, codigo_producto,
        producto, presentacion, piezas, area, corroborando,
        activacion, estado_activacion, hora_activacion, estatus, usuario
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertados = [];
    const transaction = db.transaction(() => {
      for (const registro of registros) {
        // SIEMPRE usar el nombre del usuario obtenido de la BD (name), nunca el que viene en el registro
        const usuarioFinal = nombreUsuario;
        
        const result = stmt.run(
          fechaActual,
          horaActual,
          registro.pedido,
          registro.fecha_pedido,
          registro.codigo_producto || null,
          registro.producto,
          registro.presentacion || null,
          registro.piezas || 1,
          registro.area || "APP",
          registro.corroborando || 0,
          0, // activacion
          "Pendiente", // estado_activacion
          null, // hora_activacion
          "Pendiente", // estatus
          usuarioFinal
        );
        insertados.push(result.lastInsertRowid);
      }
    });

    transaction();

    // Emitir evento de socket para actualización en tiempo real
    try {
      const io = getIO();
      if (io) {
        io.emit("activaciones_actualizadas");
      }
    } catch (e) {
      console.warn("Socket no disponible:", e.message);
    }

    res.json({ 
      success: true, 
      mensaje: `${insertados.length} registros creados`,
      ids: insertados
    });
  } catch (err) {
    console.error("Error creando activaciones:", err);
    res.status(500).json({ error: "Error al crear activaciones" });
  }
});

// PUT - Actualizar un registro
router.put("/:id", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Construir query dinámico
    const campos = Object.keys(updates);
    const valores = Object.values(updates);

    if (campos.length === 0) {
      return res.status(400).json({ error: "No hay datos para actualizar" });
    }

    const setClause = campos.map(c => `${c} = ?`).join(", ");
    
    const stmt = db.prepare(`
      UPDATE activaciones 
      SET ${setClause}
      WHERE id = ?
    `);

    stmt.run(...valores, id);

    // Emitir evento de socket
    try {
      const io = getIO();
      if (io) {
        io.emit("activaciones_actualizadas");
      }
    } catch (e) {
      console.warn("Socket no disponible:", e.message);
    }

    res.json({ success: true, mensaje: "Registro actualizado" });
  } catch (err) {
    console.error("Error actualizando activación:", err);
    res.status(500).json({ error: "Error al actualizar" });
  }
});

// DELETE - Eliminar un registro
router.delete("/:id", authRequired, (req, res) => {
  try {
    const { id } = req.params;
    
    db.prepare("DELETE FROM activaciones WHERE id = ?").run(id);

    try {
      const io = getIO();
      if (io) {
        io.emit("activaciones_actualizadas");
      }
    } catch (e) {
      console.warn("Socket no disponible:", e.message);
    }

    res.json({ success: true, mensaje: "Registro eliminado" });
  } catch (err) {
    console.error("Error eliminando activación:", err);
    res.status(500).json({ error: "Error al eliminar" });
  }
});

// POST - Cerrar día (mover activados/agotados/no aplica al histórico)
router.post("/cerrar-dia", authRequired, (req, res) => {
  try {
    const fechaCierre = getFechaActual();

    // Obtener registros que se deben mover (activados, agotados o no aplica)
    const registrosParaMover = db.prepare(`
      SELECT * FROM activaciones 
      WHERE activacion = 1 
         OR estado_activacion = 'Agotado' 
         OR estado_activacion = 'No Aplica'
    `).all();

    if (registrosParaMover.length === 0) {
      return res.json({ 
        success: true, 
        mensaje: "No hay registros para cerrar",
        movidos: 0
      });
    }

    // Mover al histórico
    const stmtInsert = db.prepare(`
      INSERT INTO activaciones_historico (
        fecha_cierre, fecha_original, hora_solicitud, pedido, fecha_pedido,
        codigo_producto, producto, presentacion, piezas, area,
        corroborando, activacion, estado_activacion, hora_activacion,
        estatus, usuario
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const stmtDelete = db.prepare("DELETE FROM activaciones WHERE id = ?");

    const transaction = db.transaction(() => {
      for (const r of registrosParaMover) {
        stmtInsert.run(
          fechaCierre,
          r.fecha,
          r.hora_solicitud,
          r.pedido,
          r.fecha_pedido,
          r.codigo_producto,
          r.producto,
          r.presentacion,
          r.piezas,
          r.area,
          r.corroborando,
          r.activacion,
          r.estado_activacion,
          r.hora_activacion,
          r.estatus,
          r.usuario
        );
        stmtDelete.run(r.id);
      }
    });

    transaction();

    try {
      const io = getIO();
      if (io) {
        io.emit("activaciones_actualizadas");
        io.emit("reportes_activaciones_actualizados");
      }
    } catch (e) {
      console.warn("Socket no disponible:", e.message);
    }

    res.json({ 
      success: true, 
      mensaje: `${registrosParaMover.length} registros movidos al histórico`,
      movidos: registrosParaMover.length
    });
  } catch (err) {
    console.error("Error cerrando día de activaciones:", err);
    res.status(500).json({ error: "Error al cerrar el día" });
  }
});

// ==========================================
// RUTAS PARA REPORTES
// ==========================================

// GET - Obtener días cerrados agrupados por mes
router.get("/reportes/dias", authRequired, (req, res) => {
  try {
    const dias = db.prepare(`
      SELECT 
        fecha_cierre as fecha,
        COUNT(*) as total_registros,
        SUM(piezas) as total_piezas
      FROM activaciones_historico
      GROUP BY fecha_cierre
      ORDER BY fecha_cierre DESC
    `).all();
    
    res.json(dias);
  } catch (err) {
    console.error("Error obteniendo días de reportes:", err);
    res.status(500).json({ error: "Error al obtener reportes" });
  }
});

// GET - Obtener detalle de un día específico
router.get("/reportes/dia/:fecha", authRequired, (req, res) => {
  try {
    const { fecha } = req.params;
    
    const registros = db.prepare(`
      SELECT * FROM activaciones_historico 
      WHERE fecha_cierre = ?
      ORDER BY id DESC
    `).all(fecha);
    
    res.json(registros);
  } catch (err) {
    console.error("Error obteniendo detalle del día:", err);
    res.status(500).json({ error: "Error al obtener detalle" });
  }
});

// DELETE - Eliminar un día del histórico
router.delete("/reportes/dia/:fecha", authRequired, (req, res) => {
  try {
    const { fecha } = req.params;
    
    const result = db.prepare("DELETE FROM activaciones_historico WHERE fecha_cierre = ?").run(fecha);

    try {
      const io = getIO();
      if (io) {
        io.emit("reportes_activaciones_actualizados");
      }
    } catch (e) {
      console.warn("Socket no disponible:", e.message);
    }

    res.json({ 
      success: true, 
      mensaje: `Día ${fecha} eliminado`,
      eliminados: result.changes
    });
  } catch (err) {
    console.error("Error eliminando día del histórico:", err);
    res.status(500).json({ error: "Error al eliminar" });
  }
});

export default router;
