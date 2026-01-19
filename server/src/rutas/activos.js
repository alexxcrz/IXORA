import express from "express";
import { dbActivos } from "../config/baseDeDatos.js";
import { requierePermiso } from "../middleware/permisos.js";
import { verificarPermiso } from "../middleware/permisos.js";
import { authRequired } from "../middleware/autenticacion.js";
import { registrarAccion } from "../utilidades/auditoria.js";
import { getIO } from "../config/socket.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import dayjs from "dayjs";
import ExcelJS from "exceljs";
import { Document, Packer, Paragraph, ImageRun, AlignmentType, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } from "docx";
import { generarQRConLogo } from "../utilidades/generarQR.js";

const router = express.Router();

// Configurar multer para importación de archivos
const uploadDir = "uploads/activos";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// Función auxiliar para construir consulta SQL segura de activos
const construirConsultaActivos = (columnasDisponibles) => {
  const tieneTipoEquipo = columnasDisponibles.includes("tipo_equipo");
  const tieneEquipo = columnasDisponibles.includes("equipo");
  const tieneMarcaModelo = columnasDisponibles.includes("marca_modelo");
  const tieneModelo = columnasDisponibles.includes("modelo");
  
  const campos = [];
  if (columnasDisponibles.includes("id")) campos.push("id");
  
  // Manejar tipo_equipo/equipo
  if (tieneTipoEquipo && tieneEquipo) {
    campos.push("COALESCE(tipo_equipo, equipo) as tipo_equipo");
    campos.push("COALESCE(equipo, tipo_equipo) as equipo");
  } else if (tieneTipoEquipo) {
    campos.push("tipo_equipo");
  } else if (tieneEquipo) {
    campos.push("equipo as tipo_equipo");
  }
  
  // Manejar marca_modelo/modelo
  if (tieneMarcaModelo && tieneModelo) {
    campos.push("COALESCE(marca_modelo, modelo) as marca_modelo");
    campos.push("COALESCE(modelo, marca_modelo) as modelo");
  } else if (tieneMarcaModelo) {
    campos.push("marca_modelo");
  } else if (tieneModelo) {
    campos.push("modelo as marca_modelo");
  }
  
  if (columnasDisponibles.includes("numero_serie")) campos.push("numero_serie");
  
  // Construir ORDER BY
  const orderByParts = [];
  if (tieneTipoEquipo && tieneEquipo) {
    orderByParts.push("COALESCE(tipo_equipo, equipo)");
  } else if (tieneTipoEquipo) {
    orderByParts.push("tipo_equipo");
  } else if (tieneEquipo) {
    orderByParts.push("equipo");
  }
  
  if (tieneMarcaModelo && tieneModelo) {
    orderByParts.push("COALESCE(marca_modelo, modelo)");
  } else if (tieneMarcaModelo) {
    orderByParts.push("marca_modelo");
  } else if (tieneModelo) {
    orderByParts.push("modelo");
  }
  
  const orderBy = orderByParts.length > 0 ? ` ORDER BY ${orderByParts.join(", ")}` : "";
  
  return {
    campos: campos.join(", "),
    orderBy
  };
};

// ============================================================
// OBTENER TODOS LOS RESPONSABLES CON SUS ACTIVOS
// ============================================================
router.get("/", authRequired, verificarPermiso("activos.responsables.ver"), (req, res) => {
  try {
    // Verificar si la tabla responsables existe
    const tablaResponsablesExiste = dbActivos.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='responsables'
    `).get();

    if (!tablaResponsablesExiste) {
      console.warn("⚠️ Tabla responsables no existe, retornando array vacío");
      return res.json([]);
    }

    // Verificar columnas de responsables
    const columnasResponsables = dbActivos.prepare("PRAGMA table_info(responsables)").all();
    const nombresColumnasResp = columnasResponsables.map(c => c.name);
    
    // Construir SELECT de forma segura para responsables
    const camposResp = [];
    if (nombresColumnasResp.includes("id")) camposResp.push("r.id");
    if (nombresColumnasResp.includes("unidad")) camposResp.push("r.unidad");
    if (nombresColumnasResp.includes("responsable")) camposResp.push("r.responsable");
    if (nombresColumnasResp.includes("cargo_area")) camposResp.push("r.cargo_area");
    if (nombresColumnasResp.includes("estacion")) {
      camposResp.push("COALESCE(r.estacion, '') as estacion");
    }

    if (camposResp.length === 0) {
      console.warn("⚠️ No se encontraron columnas válidas en tabla responsables");
      return res.json([]);
    }

    let responsables = [];
    try {
      // Ordenar por ID para mantener el orden de creación/importación
      const queryResponsables = `SELECT ${camposResp.join(", ")} FROM responsables r ORDER BY r.id ASC`;
      responsables = dbActivos.prepare(queryResponsables).all();
    } catch (queryErr) {
      console.error("Error ejecutando query de responsables:", queryErr);
      console.error("Query intentada:", `SELECT ${camposResp.join(", ")} FROM responsables r`);
      // Intentar query más simple si falla
      try {
        responsables = dbActivos.prepare("SELECT * FROM responsables").all();
      } catch (simpleErr) {
        console.error("Error con query simple:", simpleErr);
        responsables = [];
      }
    }

    // Verificar si la tabla activos existe
    let tablaActivosExiste = null;
    let consultaActivos = null;
    let nombresColumnasAct = [];
    
    try {
      tablaActivosExiste = dbActivos.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='activos'
      `).get();
      
      if (tablaActivosExiste) {
        // Verificar columnas de activos una sola vez antes del loop
        const columnasActivos = dbActivos.prepare("PRAGMA table_info(activos)").all();
        nombresColumnasAct = columnasActivos.map(c => c.name);
        consultaActivos = construirConsultaActivos(nombresColumnasAct);
      }
    } catch (checkErr) {
      console.warn("⚠️ Error verificando existencia de tabla activos:", checkErr);
      // Continuar sin activos si no se puede verificar
    }

    const responsablesConActivos = responsables.map((resp) => {
      let activos = [];
      
      if (tablaActivosExiste && consultaActivos && nombresColumnasAct.includes("responsable_id")) {
        try {
          const queryActivos = `SELECT ${consultaActivos.campos} FROM activos WHERE responsable_id = ?${consultaActivos.orderBy}`;
          activos = dbActivos.prepare(queryActivos).all(resp.id);
          console.log(`✅ Responsable ${resp.id} (${resp.responsable}): ${activos.length} activo(s) encontrado(s)`);
        } catch (queryErr) {
          console.warn(`⚠️ Error ejecutando query de activos para responsable ${resp.id}:`, queryErr);
          // Intentar query simple
          try {
            activos = dbActivos.prepare("SELECT * FROM activos WHERE responsable_id = ?").all(resp.id);
            console.log(`✅ Responsable ${resp.id} (${resp.responsable}): ${activos.length} activo(s) encontrado(s) (query simple)`);
          } catch (simpleErr) {
            console.warn(`⚠️ Error con query simple de activos para responsable ${resp.id}:`, simpleErr);
            activos = [];
          }
        }
      } else if (tablaActivosExiste && !nombresColumnasAct.includes("responsable_id")) {
        console.warn(`⚠️ No se encontró columna responsable_id para responsable ${resp.id}`);
      }

      return {
        ...resp,
        activos,
      };
    });

    res.json(responsablesConActivos);
  } catch (err) {
    console.error("Error obteniendo responsables:", err);
    console.error("Stack:", err.stack);
    res.status(500).json({ error: "Error obteniendo responsables: " + err.message });
  }
});

// ============================================================
// OBTENER UN RESPONSABLE ESPECÍFICO
// ============================================================
router.get("/responsable/:id", requierePermiso("tab:activos"), (req, res) => {
  try {
    const responsable = dbActivos
      .prepare("SELECT * FROM responsables WHERE id = ?")
      .get(req.params.id);

    if (!responsable) {
      return res.status(404).json({ error: "Responsable no encontrado" });
    }

    const activos = dbActivos
      .prepare(`
        SELECT 
          id,
          COALESCE(tipo_equipo, equipo) as tipo_equipo,
          COALESCE(equipo, tipo_equipo) as equipo,
          COALESCE(marca_modelo, modelo) as marca_modelo,
          COALESCE(modelo, marca_modelo) as modelo,
          numero_serie
        FROM activos
        WHERE responsable_id = ?
        ORDER BY tipo_equipo, marca_modelo
      `)
      .all(req.params.id);

    res.json({
      ...responsable,
      activos,
      total_activos: activos.length,
    });
  } catch (err) {
    console.error("Error obteniendo responsable:", err);
    res.status(500).json({ error: "Error obteniendo responsable" });
  }
});

// ============================================================
// CREAR RESPONSABLE
// ============================================================
router.post("/responsable", authRequired, verificarPermiso("activos.responsables.crear"), (req, res) => {
  try {
    const { unidad, responsable, cargo_area, estacion } = req.body;

    if (!unidad || !responsable) {
      return res.status(400).json({ error: "Faltan campos requeridos" });
    }

    const info = dbActivos
      .prepare("INSERT INTO responsables (unidad, responsable, cargo_area, estacion) VALUES (?, ?, ?, ?)")
      .run(unidad, responsable, cargo_area || null, estacion || null);

    registrarAccion({
      usuario: req.user?.name,
      accion: "CREAR_RESPONSABLE",
      detalle: `${responsable} - ${unidad}`,
      tabla: "responsables",
      registroId: info.lastInsertRowid,
    });

    getIO().emit("activos_actualizados");

    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (err) {
    console.error("Error creando responsable:", err);
    res.status(500).json({ error: "Error creando responsable" });
  }
});

// ============================================================
// ACTUALIZAR RESPONSABLE
// ============================================================
router.put("/responsable/:id", requierePermiso("tab:activos"), (req, res) => {
  try {
    const { unidad, responsable, cargo_area, estacion } = req.body;

    if (!unidad || !responsable) {
      return res.status(400).json({ error: "Faltan campos requeridos" });
    }

    dbActivos
      .prepare("UPDATE responsables SET unidad = ?, responsable = ?, cargo_area = ?, estacion = ?, fecha_actualizacion = datetime('now', 'localtime') WHERE id = ?")
      .run(unidad, responsable, cargo_area || null, estacion || null, req.params.id);

    registrarAccion({
      usuario: req.user?.name,
      accion: "ACTUALIZAR_RESPONSABLE",
      detalle: `${responsable} - ${unidad}`,
      tabla: "responsables",
      registroId: req.params.id,
    });

    getIO().emit("activos_actualizados");

    res.json({ ok: true });
  } catch (err) {
    console.error("Error actualizando responsable:", err);
    res.status(500).json({ error: "Error actualizando responsable" });
  }
});

// ============================================================
// ELIMINAR RESPONSABLE
// ============================================================
router.delete("/responsable/:id", authRequired, verificarPermiso("activos.responsables.eliminar"), (req, res) => {
  try {
    dbActivos.prepare("DELETE FROM responsables WHERE id = ?").run(req.params.id);

    registrarAccion({
      usuario: req.user?.name,
      accion: "ELIMINAR_RESPONSABLE",
      detalle: `ID ${req.params.id}`,
      tabla: "responsables",
      registroId: req.params.id,
    });

    getIO().emit("activos_actualizados");

    res.json({ ok: true });
  } catch (err) {
    console.error("Error eliminando responsable:", err);
    res.status(500).json({ error: "Error eliminando responsable" });
  }
});

// ============================================================
// CREAR ACTIVO
// ============================================================
router.post("/activo", requierePermiso("tab:activos"), (req, res) => {
  try {
    const { responsable_id, tipo_equipo, marca_modelo, numero_serie, equipo, modelo } = req.body;

    if (!responsable_id || (!tipo_equipo && !equipo)) {
      return res.status(400).json({ error: "Faltan campos requeridos" });
    }

    // Verificar qué columnas tiene la tabla para compatibilidad
    const columnasActivos = dbActivos.prepare("PRAGMA table_info(activos)").all();
    const nombresColumnasAct = columnasActivos.map(c => c.name);
    const tieneEquipo = nombresColumnasAct.includes("equipo");
    const tieneTipoEquipo = nombresColumnasAct.includes("tipo_equipo");
    const tieneModelo = nombresColumnasAct.includes("modelo");
    const tieneMarcaModelo = nombresColumnasAct.includes("marca_modelo");
    
    const tipoEquipoFinal = tipo_equipo || equipo || "";
    const marcaModeloFinal = marca_modelo || modelo || null;
    
    // Verificar si equipo es NOT NULL
    const columnaEquipo = columnasActivos.find(c => c.name === "equipo");
    const equipoEsNotNull = columnaEquipo && columnaEquipo.notnull === 1;

    let info;
    if (tieneEquipo && equipoEsNotNull) {
      if (tieneTipoEquipo && tieneMarcaModelo) {
        info = dbActivos
          .prepare("INSERT INTO activos (responsable_id, equipo, tipo_equipo, modelo, marca_modelo, numero_serie) VALUES (?, ?, ?, ?, ?, ?)")
          .run(responsable_id, tipoEquipoFinal, tipoEquipoFinal, marcaModeloFinal, marcaModeloFinal, numero_serie || null);
      } else if (tieneModelo) {
        info = dbActivos
          .prepare("INSERT INTO activos (responsable_id, equipo, modelo, numero_serie) VALUES (?, ?, ?, ?)")
          .run(responsable_id, tipoEquipoFinal, marcaModeloFinal, numero_serie || null);
      } else {
        info = dbActivos
          .prepare("INSERT INTO activos (responsable_id, equipo, numero_serie) VALUES (?, ?, ?)")
          .run(responsable_id, tipoEquipoFinal, numero_serie || null);
      }
    } else if (tieneTipoEquipo && tieneMarcaModelo) {
      info = dbActivos
        .prepare("INSERT INTO activos (responsable_id, tipo_equipo, marca_modelo, numero_serie) VALUES (?, ?, ?, ?)")
        .run(responsable_id, tipoEquipoFinal, marcaModeloFinal, numero_serie || null);
    } else if (tieneEquipo && tieneModelo) {
      info = dbActivos
        .prepare("INSERT INTO activos (responsable_id, equipo, modelo, numero_serie) VALUES (?, ?, ?, ?)")
        .run(responsable_id, tipoEquipoFinal, marcaModeloFinal, numero_serie || null);
    } else {
      throw new Error(`La tabla activos no tiene las columnas esperadas. Columnas disponibles: ${nombresColumnasAct.join(", ")}`);
    }

    registrarAccion({
      usuario: req.user?.name,
      accion: "CREAR_ACTIVO",
      detalle: `${tipoEquipoFinal} - ${numero_serie || "Sin serie"}`,
      tabla: "activos",
      registroId: info.lastInsertRowid,
    });

    getIO().emit("activos_actualizados");

    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (err) {
    console.error("Error creando activo:", err);
    res.status(500).json({ error: "Error creando activo" });
  }
});

// ============================================================
// ACTUALIZAR ACTIVO
// ============================================================
router.put("/activo/:id", authRequired, verificarPermiso("activos.activos.editar"), (req, res) => {
  try {
    const { tipo_equipo, marca_modelo, numero_serie, equipo, modelo } = req.body;

    if (!tipo_equipo && !equipo) {
      return res.status(400).json({ error: "Falta el tipo de equipo" });
    }

    // Verificar qué columnas tiene la tabla para compatibilidad
    const columnasActivos = dbActivos.prepare("PRAGMA table_info(activos)").all();
    const nombresColumnasAct = columnasActivos.map(c => c.name);
    const tieneEquipo = nombresColumnasAct.includes("equipo");
    const tieneTipoEquipo = nombresColumnasAct.includes("tipo_equipo");
    const tieneModelo = nombresColumnasAct.includes("modelo");
    const tieneMarcaModelo = nombresColumnasAct.includes("marca_modelo");
    
    const tipoEquipoFinal = tipo_equipo || equipo || "";
    const marcaModeloFinal = marca_modelo || modelo || null;
    
    // Verificar si equipo es NOT NULL
    const columnaEquipo = columnasActivos.find(c => c.name === "equipo");
    const equipoEsNotNull = columnaEquipo && columnaEquipo.notnull === 1;

    if (tieneEquipo && equipoEsNotNull) {
      if (tieneTipoEquipo && tieneMarcaModelo) {
        dbActivos
          .prepare("UPDATE activos SET equipo = ?, tipo_equipo = ?, modelo = ?, marca_modelo = ?, numero_serie = ?, fecha_actualizacion = datetime('now', 'localtime') WHERE id = ?")
          .run(tipoEquipoFinal, tipoEquipoFinal, marcaModeloFinal, marcaModeloFinal, numero_serie || null, req.params.id);
      } else if (tieneModelo) {
        dbActivos
          .prepare("UPDATE activos SET equipo = ?, modelo = ?, numero_serie = ?, fecha_actualizacion = datetime('now', 'localtime') WHERE id = ?")
          .run(tipoEquipoFinal, marcaModeloFinal, numero_serie || null, req.params.id);
      } else {
        dbActivos
          .prepare("UPDATE activos SET equipo = ?, numero_serie = ?, fecha_actualizacion = datetime('now', 'localtime') WHERE id = ?")
          .run(tipoEquipoFinal, numero_serie || null, req.params.id);
      }
    } else if (tieneTipoEquipo && tieneMarcaModelo) {
      dbActivos
        .prepare("UPDATE activos SET tipo_equipo = ?, marca_modelo = ?, numero_serie = ?, fecha_actualizacion = datetime('now', 'localtime') WHERE id = ?")
        .run(tipoEquipoFinal, marcaModeloFinal, numero_serie || null, req.params.id);
    } else if (tieneEquipo && tieneModelo) {
      dbActivos
        .prepare("UPDATE activos SET equipo = ?, modelo = ?, numero_serie = ?, fecha_actualizacion = datetime('now', 'localtime') WHERE id = ?")
        .run(tipoEquipoFinal, marcaModeloFinal, numero_serie || null, req.params.id);
    } else {
      throw new Error(`La tabla activos no tiene las columnas esperadas. Columnas disponibles: ${nombresColumnasAct.join(", ")}`);
    }

    registrarAccion({
      usuario: req.user?.name,
      accion: "ACTUALIZAR_ACTIVO",
      detalle: `${tipoEquipoFinal} - ${numero_serie || "Sin serie"}`,
      tabla: "activos",
      registroId: req.params.id,
    });

    getIO().emit("activos_actualizados");

    res.json({ ok: true });
  } catch (err) {
    console.error("Error actualizando activo:", err);
    res.status(500).json({ error: "Error actualizando activo" });
  }
});

// ============================================================
// ELIMINAR ACTIVO
// ============================================================
// ============================================================
// ELIMINAR TODOS LOS ACTIVOS Y RESPONSABLES
// ============================================================
router.delete("/todos", authRequired, verificarPermiso("activos.responsables.eliminar"), (req, res) => {
  try {
    let eliminadosActivos = 0;
    let eliminadosResponsables = 0;

    // Eliminar todos los activos
    try {
      const tablaActivosExiste = dbActivos.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='activos'
      `).get();

      if (tablaActivosExiste) {
        const infoActivos = dbActivos.prepare("DELETE FROM activos").run();
        eliminadosActivos = infoActivos.changes;
      }
    } catch (err) {
      console.warn("Error eliminando activos:", err);
    }

    // Eliminar todos los responsables
    try {
      const tablaResponsablesExiste = dbActivos.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='responsables'
      `).get();

      if (tablaResponsablesExiste) {
        const infoResponsables = dbActivos.prepare("DELETE FROM responsables").run();
        eliminadosResponsables = infoResponsables.changes;
      }
    } catch (err) {
      console.warn("Error eliminando responsables:", err);
    }

    registrarAccion({
      usuario: req.user?.name,
      accion: "ELIMINAR_TODOS_ACTIVOS",
      detalle: `Se eliminaron todos los activos (${eliminadosActivos}) y responsables (${eliminadosResponsables})`,
      tabla: "activos,responsables",
    });

    getIO().emit("activos_actualizados");

    res.json({ 
      ok: true, 
      eliminados_activos: eliminadosActivos,
      eliminados_responsables: eliminadosResponsables 
    });
  } catch (err) {
    console.error("Error eliminando todos los activos:", err);
    res.status(500).json({ error: "Error eliminando todos los activos" });
  }
});

router.delete("/activo/:id", requierePermiso("tab:activos"), (req, res) => {
  try {
    dbActivos.prepare("DELETE FROM activos WHERE id = ?").run(req.params.id);

    registrarAccion({
      usuario: req.user?.name,
      accion: "ELIMINAR_ACTIVO",
      detalle: `ID ${req.params.id}`,
      tabla: "activos",
      registroId: req.params.id,
    });

    getIO().emit("activos_actualizados");

    res.json({ ok: true });
  } catch (err) {
    console.error("Error eliminando activo:", err);
    res.status(500).json({ error: "Error eliminando activo" });
  }
});

// ============================================================
// GENERAR QR PARA RESPONSABLE
// ============================================================
router.get("/responsable/:id/qr", authRequired, verificarPermiso("activos.qr"), async (req, res) => {
  try {
    const responsable = dbActivos
      .prepare("SELECT * FROM responsables WHERE id = ?")
      .get(req.params.id);

    if (!responsable) {
      return res.status(404).json({ error: "Responsable no encontrado" });
    }

    // Verificar columnas disponibles
    const columnasActivos = dbActivos.prepare("PRAGMA table_info(activos)").all();
    const nombresColumnasAct = columnasActivos.map(c => c.name);
    const consulta = construirConsultaActivos(nombresColumnasAct);
    
    const activos = dbActivos
      .prepare(`SELECT ${consulta.campos} FROM activos WHERE responsable_id = ?${consulta.orderBy}`)
      .all(req.params.id);

    // Contar activos por tipo
    const conteoActivos = {};
    activos.forEach((activo) => {
      const tipo = activo.tipo_equipo || "Sin especificar";
      conteoActivos[tipo] = (conteoActivos[tipo] || 0) + 1;
    });

    // Crear texto para el QR con toda la información
    const datosQR = {
      responsable: responsable.responsable,
      unidad: responsable.unidad,
      cargo: responsable.cargo_area,
      fecha: dayjs().format("YYYY-MM-DD"),
      totalActivos: activos.length,
      conteo: conteoActivos,
      activos: activos.map((a) => ({
        tipo_equipo: a.tipo_equipo || "N/A",
        marca_modelo: a.marca_modelo || "N/A",
        serie: a.numero_serie || "N/A",
      })),
    };

    const textoQR = JSON.stringify(datosQR, null, 2);

    // Generar QR con logo en el centro
    const qrBuffer = await generarQRConLogo(textoQR, 400);

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `inline; filename="qr-${responsable.responsable.replace(/\s+/g, "-")}.png"`);
    res.send(qrBuffer);
  } catch (err) {
    console.error("Error generando QR:", err);
    res.status(500).json({ error: "Error generando QR" });
  }
});

// ============================================================
// EXPORTAR A EXCEL
// ============================================================
router.get("/exportar", requierePermiso("tab:activos"), async (req, res) => {
  try {
    const responsables = dbActivos
      .prepare(`
        SELECT r.*, 
               COUNT(a.id) as total_activos
        FROM responsables r
        LEFT JOIN activos a ON a.responsable_id = r.id
        GROUP BY r.id
        ORDER BY r.id ASC
      `)
      .all();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Activos Informáticos");

    worksheet.columns = [
      { header: "Unidad", key: "unidad", width: 20 },
      { header: "Responsable", key: "responsable", width: 30 },
      { header: "Cargo / Área", key: "cargo_area", width: 30 },
      { header: "Estación", key: "estacion", width: 20 },
      { header: "Equipo", key: "equipo", width: 25 },
      { header: "Modelo", key: "modelo", width: 25 },
      { header: "No. de Serie", key: "numero_serie", width: 20 },
    ];

    responsables.forEach((resp) => {
      // Verificar qué columnas tiene la tabla activos
      const columnasActivos = dbActivos.prepare("PRAGMA table_info(activos)").all();
      const nombresColumnasAct = columnasActivos.map(c => c.name);
      const tieneEquipo = nombresColumnasAct.includes("equipo");
      const tieneTipoEquipo = nombresColumnasAct.includes("tipo_equipo");
      const tieneModelo = nombresColumnasAct.includes("modelo");
      const tieneMarcaModelo = nombresColumnasAct.includes("marca_modelo");
      
      let queryActivos;
      if (tieneEquipo && tieneTipoEquipo) {
        queryActivos = `
          SELECT 
            COALESCE(tipo_equipo, equipo) as tipo_equipo,
            COALESCE(marca_modelo, modelo) as marca_modelo,
            numero_serie
          FROM activos
          WHERE responsable_id = ?
        `;
      } else if (tieneTipoEquipo) {
        if (tieneMarcaModelo && tieneModelo) {
          queryActivos = `
            SELECT 
              tipo_equipo,
              COALESCE(marca_modelo, modelo) as marca_modelo,
              numero_serie
            FROM activos
            WHERE responsable_id = ?
          `;
        } else if (tieneMarcaModelo) {
          queryActivos = `
            SELECT 
              tipo_equipo,
              marca_modelo,
              numero_serie
            FROM activos
            WHERE responsable_id = ?
          `;
        } else if (tieneModelo) {
          queryActivos = `
            SELECT 
              tipo_equipo,
              modelo as marca_modelo,
              numero_serie
            FROM activos
            WHERE responsable_id = ?
          `;
        } else {
          queryActivos = `
            SELECT 
              tipo_equipo,
              marca_modelo,
              numero_serie
            FROM activos
            WHERE responsable_id = ?
          `;
        }
      } else if (tieneEquipo) {
        if (tieneMarcaModelo && tieneModelo) {
          queryActivos = `
            SELECT 
              equipo as tipo_equipo,
              COALESCE(marca_modelo, modelo) as marca_modelo,
              numero_serie
            FROM activos
            WHERE responsable_id = ?
          `;
        } else if (tieneMarcaModelo) {
          queryActivos = `
            SELECT 
              equipo as tipo_equipo,
              marca_modelo,
              numero_serie
            FROM activos
            WHERE responsable_id = ?
          `;
        } else if (tieneModelo) {
          queryActivos = `
            SELECT 
              equipo as tipo_equipo,
              modelo as marca_modelo,
              numero_serie
            FROM activos
            WHERE responsable_id = ?
          `;
        } else {
          queryActivos = `
            SELECT 
              equipo as tipo_equipo,
              marca_modelo,
              numero_serie
            FROM activos
            WHERE responsable_id = ?
          `;
        }
      } else {
        queryActivos = `
          SELECT 
            tipo_equipo,
            marca_modelo,
            numero_serie
          FROM activos
          WHERE responsable_id = ?
        `;
      }
      
      const activos = dbActivos.prepare(queryActivos).all(resp.id);

      if (activos.length === 0) {
        worksheet.addRow({
          unidad: resp.unidad,
          responsable: resp.responsable,
          cargo_area: resp.cargo_area,
          estacion: resp.estacion,
          equipo: "",
          modelo: "",
          numero_serie: "",
        });
      } else {
        activos.forEach((activo) => {
          worksheet.addRow({
            unidad: resp.unidad,
            responsable: resp.responsable,
            cargo_area: resp.cargo_area,
            estacion: resp.estacion,
            equipo: activo.tipo_equipo || "",
            modelo: activo.marca_modelo || "",
            numero_serie: activo.numero_serie || "",
          });
        });
      }
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Activos_Informaticos_${dayjs().format("YYYY-MM-DD")}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error exportando:", err);
    res.status(500).json({ error: "Error exportando datos" });
  }
});

// ============================================================
// CONTROL DE PDAs
// ============================================================

// Obtener todos los PDAs
router.get("/pdas", authRequired, verificarPermiso("activos.pdas.ver"), (req, res) => {
  try {
    // Verificar si la tabla existe
    const tablaExiste = dbActivos.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='pdas'
    `).get();

    if (!tablaExiste) {
      console.warn("⚠️ Tabla pdas no existe, retornando array vacío");
      return res.json([]);
    }

    // Verificar columnas disponibles
    let columnas = [];
    let nombresColumnas = [];
    
    try {
      columnas = dbActivos.prepare("PRAGMA table_info(pdas)").all();
      nombresColumnas = columnas.map(c => c.name);
    } catch (pragmaErr) {
      console.error("Error obteniendo información de columnas:", pragmaErr);
      // Intentar query simple directamente
      try {
        const pdasSimple = dbActivos.prepare("SELECT * FROM pdas").all();
        return res.json(pdasSimple);
      } catch (simpleErr) {
        console.error("Error con query simple:", simpleErr);
        return res.json([]);
      }
    }
    
    // Construir SELECT de forma segura - solo usar columnas que existen
    const campos = [];
    if (nombresColumnas.includes("id")) campos.push("id");
    if (nombresColumnas.includes("orden")) campos.push("orden");
    
    // Para pda/equipo_pda - usar solo las que existen
    const tienePda = nombresColumnas.includes("pda");
    const tieneEquipoPda = nombresColumnas.includes("equipo_pda");
    if (tienePda && tieneEquipoPda) {
      campos.push("COALESCE(pda, equipo_pda) as pda");
      campos.push("COALESCE(equipo_pda, pda) as equipo_pda");
    } else if (tienePda) {
      campos.push("pda");
      campos.push("pda as equipo_pda");
    } else if (tieneEquipoPda) {
      campos.push("equipo_pda as pda");
      campos.push("equipo_pda");
    }
    
    if (nombresColumnas.includes("imei")) campos.push("imei");
    
    // Para modelo_pda/modelo
    const tieneModeloPda = nombresColumnas.includes("modelo_pda");
    const tieneModelo = nombresColumnas.includes("modelo");
    if (tieneModeloPda && tieneModelo) {
      campos.push("COALESCE(modelo_pda, modelo) as modelo_pda");
    } else if (tieneModeloPda) {
      campos.push("modelo_pda");
    } else if (tieneModelo) {
      campos.push("modelo as modelo_pda");
    }
    
    if (nombresColumnas.includes("android")) campos.push("android");
    
    // Para impresora/complemento
    const tieneImpresora = nombresColumnas.includes("impresora");
    const tieneComplemento = nombresColumnas.includes("complemento");
    if (tieneImpresora && tieneComplemento) {
      campos.push("COALESCE(impresora, complemento) as impresora");
    } else if (tieneImpresora) {
      campos.push("impresora");
    } else if (tieneComplemento) {
      campos.push("complemento as impresora");
    }
    
    // Para serie_pda/serie
    const tieneSeriePda = nombresColumnas.includes("serie_pda");
    const tieneSerie = nombresColumnas.includes("serie");
    if (tieneSeriePda && tieneSerie) {
      campos.push("COALESCE(serie_pda, serie) as serie_pda");
    } else if (tieneSeriePda) {
      campos.push("serie_pda");
    } else if (tieneSerie) {
      campos.push("serie as serie_pda");
    }
    
    // Para modelo_impresora/modelo_complemento
    const tieneModeloImpresora = nombresColumnas.includes("modelo_impresora");
    const tieneModeloComplemento = nombresColumnas.includes("modelo_complemento");
    if (tieneModeloImpresora && tieneModeloComplemento) {
      campos.push("COALESCE(modelo_impresora, modelo_complemento) as modelo_impresora");
    } else if (tieneModeloImpresora) {
      campos.push("modelo_impresora");
    } else if (tieneModeloComplemento) {
      campos.push("modelo_complemento as modelo_impresora");
    }
    
    if (nombresColumnas.includes("encargado")) campos.push("encargado");
    if (nombresColumnas.includes("responsable")) campos.push("COALESCE(responsable, '') as responsable");
    
    // Para area/unidad
    const tieneArea = nombresColumnas.includes("area");
    const tieneUnidad = nombresColumnas.includes("unidad");
    if (tieneArea && tieneUnidad) {
      campos.push("COALESCE(area, unidad) as area");
      campos.push("COALESCE(unidad, area) as unidad");
    } else if (tieneArea) {
      campos.push("area");
      campos.push("area as unidad");
    } else if (tieneUnidad) {
      campos.push("unidad as area");
      campos.push("unidad");
    }
    
    if (nombresColumnas.includes("observaciones")) campos.push("observaciones");

    if (campos.length === 0) {
      console.warn("⚠️ No se encontraron columnas válidas en tabla pdas");
      // Intentar query simple como fallback
      try {
        const pdasSimple = dbActivos.prepare("SELECT * FROM pdas").all();
        return res.json(pdasSimple);
      } catch (simpleErr) {
        console.error("Error con query simple:", simpleErr);
        return res.json([]);
      }
    }

    try {
      // Ordenar por campo 'orden' si existe, sino por ID para mantener el orden de creación/importación
      const tieneOrden = nombresColumnas.includes("orden");
      const orderBy = tieneOrden ? "orden ASC, id ASC" : "id ASC";
      const query = `SELECT ${campos.join(", ")} FROM pdas ORDER BY ${orderBy}`;
      const pdas = dbActivos.prepare(query).all();
      res.json(pdas);
    } catch (queryErr) {
      console.error("Error ejecutando query de PDAs:", queryErr);
      console.error("Query intentada:", `SELECT ${campos.join(", ")} FROM pdas`);
      // Intentar query más simple si falla
      try {
        const pdasSimple = dbActivos.prepare("SELECT * FROM pdas").all();
        res.json(pdasSimple);
      } catch (simpleErr) {
        console.error("Error con query simple:", simpleErr);
        res.json([]);
      }
    }
  } catch (err) {
    console.error("Error obteniendo PDAs:", err);
    console.error("Stack:", err.stack);
    res.status(500).json({ error: "Error obteniendo PDAs: " + err.message });
  }
});

// Crear PDA
router.post("/pdas", authRequired, verificarPermiso("activos.pdas.crear"), (req, res) => {
  try {
    const {
      pda,
      imei,
      modelo_pda,
      android,
      impresora,
      serie_pda,
      modelo_impresora,
      encargado,
      responsable,
      area,
      observaciones,
      unidad,
      equipo_pda,
    } = req.body;

    if (!pda && !equipo_pda) {
      return res.status(400).json({ error: "Falta el identificador del PDA" });
    }

    // Verificar qué columnas tiene la tabla para compatibilidad
    const columnasPDAs = dbActivos.prepare("PRAGMA table_info(pdas)").all();
    const nombresColumnasPDA = columnasPDAs.map(c => c.name);
    const tieneUnidad = nombresColumnasPDA.includes("unidad");
    const tieneArea = nombresColumnasPDA.includes("area");
    const tienePDA = nombresColumnasPDA.includes("pda");
    const tieneEquipoPDA = nombresColumnasPDA.includes("equipo_pda");
    
    const unidadValor = area || unidad || "Sin área";
    const pdaValor = pda || equipo_pda;
    
    // Verificar si unidad es NOT NULL
    const columnaUnidad = columnasPDAs.find(c => c.name === "unidad");
    const unidadEsNotNull = columnaUnidad && columnaUnidad.notnull === 1;
    
    // Verificar si equipo_pda es NOT NULL
    const columnaEquipoPDA = columnasPDAs.find(c => c.name === "equipo_pda");
    const equipoPDAEsNotNull = columnaEquipoPDA && columnaEquipoPDA.notnull === 1;

    // Verificar si existe campo orden
    const tieneOrden = nombresColumnasPDA.includes("orden");
    
    // Obtener el siguiente orden (máximo orden + 1, o usar el siguiente ID)
    let siguienteOrden = 0;
    if (tieneOrden) {
      try {
        const maxOrden = dbActivos.prepare("SELECT MAX(orden) as max FROM pdas").get();
        siguienteOrden = (maxOrden?.max || 0) + 1;
      } catch (e) {
        // Si falla, usar el siguiente ID
        const maxId = dbActivos.prepare("SELECT MAX(id) as max FROM pdas").get();
        siguienteOrden = (maxId?.max || 0) + 1;
      }
    }
    
    let info;
    if (tieneEquipoPDA && equipoPDAEsNotNull) {
      if (tienePDA && tieneUnidad && unidadEsNotNull) {
        if (tieneOrden) {
          info = dbActivos
            .prepare(`
              INSERT INTO pdas (
                pda, equipo_pda, imei, modelo_pda, android, impresora, serie_pda,
                modelo_impresora, encargado, responsable, unidad, area, observaciones, orden
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
              pdaValor,
              pdaValor,
              imei || null,
              modelo_pda || null,
              android || null,
              impresora || null,
              serie_pda || null,
              modelo_impresora || null,
              encargado || null,
              responsable || null,
              unidadValor,
              area || null,
              observaciones || null,
              siguienteOrden
            );
        } else {
          info = dbActivos
            .prepare(`
              INSERT INTO pdas (
                pda, equipo_pda, imei, modelo_pda, android, impresora, serie_pda,
                modelo_impresora, encargado, responsable, unidad, area, observaciones
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
              pdaValor,
              pdaValor,
              imei || null,
              modelo_pda || null,
              android || null,
              impresora || null,
              serie_pda || null,
              modelo_impresora || null,
              encargado || null,
              responsable || null,
              unidadValor,
              area || null,
              observaciones || null
            );
        }
      } else if (tieneEquipoPDA && tieneUnidad) {
        info = dbActivos
          .prepare(`
            INSERT INTO pdas (
              unidad, responsable, equipo_pda, modelo_pda, serie_pda,
              complemento, modelo_complemento, serie_complemento
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            unidadValor,
            responsable || null,
            pdaValor,
            modelo_pda || null,
            serie_pda || null,
            impresora || null,
            modelo_impresora || null,
            null
          );
      } else {
        throw new Error("La tabla pdas tiene equipo_pda NOT NULL pero no se puede insertar");
      }
    } else if (tieneUnidad && unidadEsNotNull) {
      if (tienePDA && tieneArea) {
        info = dbActivos
          .prepare(`
            INSERT INTO pdas (
              pda, imei, modelo_pda, android, impresora, serie_pda,
              modelo_impresora, encargado, responsable, unidad, area, observaciones
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            pdaValor,
            imei || null,
            modelo_pda || null,
            android || null,
            impresora || null,
            serie_pda || null,
            modelo_impresora || null,
            encargado || null,
            responsable || null,
            unidadValor,
            area || null,
            observaciones || null
          );
      } else if (tieneUnidad) {
        info = dbActivos
          .prepare(`
            INSERT INTO pdas (
              unidad, responsable, equipo_pda, modelo_pda, serie_pda,
              complemento, modelo_complemento, serie_complemento
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            unidadValor,
            responsable || null,
            pdaValor,
            modelo_pda || null,
            serie_pda || null,
            impresora || null,
            modelo_impresora || null,
            null
          );
      } else {
        throw new Error("La tabla pdas tiene unidad NOT NULL pero no se puede insertar");
      }
    } else if (tienePDA && tieneArea) {
      info = dbActivos
        .prepare(`
          INSERT INTO pdas (
            pda, imei, modelo_pda, android, impresora, serie_pda,
            modelo_impresora, encargado, responsable, area, observaciones
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          pdaValor,
          imei || null,
          modelo_pda || null,
          android || null,
          impresora || null,
          serie_pda || null,
          modelo_impresora || null,
          encargado || null,
          responsable || null,
          area || null,
          observaciones || null
        );
    } else {
      throw new Error(`La tabla pdas no tiene las columnas esperadas. Columnas disponibles: ${nombresColumnasPDA.join(", ")}`);
    }

    registrarAccion({
      usuario: req.user?.name,
      accion: "CREAR_PDA",
      detalle: `${pdaValor} - ${responsable || "Sin responsable"}`,
      tabla: "pdas",
      registroId: info.lastInsertRowid,
    });

    getIO().emit("activos_actualizados");

    res.json({ ok: true });
  } catch (err) {
    console.error("Error creando PDA:", err);
    res.status(500).json({ error: "Error creando PDA" });
  }
});

// Actualizar orden de PDAs
router.put("/pdas/reordenar", authRequired, verificarPermiso("activos.pdas.editar"), (req, res) => {
  try {
    const { ordenes } = req.body; // Array de { id, orden }
    
    if (!Array.isArray(ordenes)) {
      return res.status(400).json({ error: "Se requiere un array de ordenes" });
    }

    // Verificar si la columna 'orden' existe, si no, crearla
    const columnas = dbActivos.prepare("PRAGMA table_info(pdas)").all();
    const tieneOrden = columnas.some(c => c.name === "orden");
    
    if (!tieneOrden) {
      console.log("📝 Agregando columna 'orden' a tabla pdas...");
      dbActivos.prepare("ALTER TABLE pdas ADD COLUMN orden INTEGER DEFAULT 0").run();
    }

    const updateStmt = dbActivos.prepare("UPDATE pdas SET orden = ? WHERE id = ?");
    const updateMany = dbActivos.transaction((ordenes) => {
      for (const { id, orden } of ordenes) {
        updateStmt.run(orden, id);
      }
    });

    updateMany(ordenes);

    registrarAccion({
      usuario: req.user?.name,
      accion: "REORDENAR_PDAS",
      detalle: `${ordenes.length} PDA(s) reordenado(s)`,
      tabla: "pdas",
    });

    getIO().emit("activos_actualizados");

    res.json({ ok: true });
  } catch (err) {
    console.error("Error reordenando PDAs:", err);
    res.status(500).json({ error: "Error reordenando PDAs" });
  }
});

// Actualizar PDA
router.put("/pdas/:id", requierePermiso("tab:activos"), (req, res) => {
  try {
    const {
      pda,
      imei,
      modelo_pda,
      android,
      impresora,
      serie_pda,
      modelo_impresora,
      encargado,
      responsable,
      area,
      observaciones,
      unidad,
      equipo_pda,
    } = req.body;

    // Verificar qué columnas tiene la tabla para compatibilidad
    const columnasPDAs = dbActivos.prepare("PRAGMA table_info(pdas)").all();
    const nombresColumnasPDA = columnasPDAs.map(c => c.name);
    const tieneUnidad = nombresColumnasPDA.includes("unidad");
    const tieneArea = nombresColumnasPDA.includes("area");
    const tienePDA = nombresColumnasPDA.includes("pda");
    const tieneEquipoPDA = nombresColumnasPDA.includes("equipo_pda");
    
    const unidadValor = area || unidad || "Sin área";
    const pdaValor = pda || equipo_pda;
    
    // Verificar si unidad es NOT NULL
    const columnaUnidad = columnasPDAs.find(c => c.name === "unidad");
    const unidadEsNotNull = columnaUnidad && columnaUnidad.notnull === 1;
    
    // Verificar si equipo_pda es NOT NULL
    const columnaEquipoPDA = columnasPDAs.find(c => c.name === "equipo_pda");
    const equipoPDAEsNotNull = columnaEquipoPDA && columnaEquipoPDA.notnull === 1;

    if (tieneEquipoPDA && equipoPDAEsNotNull) {
      if (tienePDA && tieneUnidad && unidadEsNotNull) {
        dbActivos
          .prepare(`
            UPDATE pdas SET
              pda = ?, equipo_pda = ?, imei = ?, modelo_pda = ?, android = ?,
              impresora = ?, serie_pda = ?, modelo_impresora = ?, encargado = ?,
              responsable = ?, unidad = ?, area = ?, observaciones = ?
            WHERE id = ?
          `)
          .run(
            pdaValor,
            pdaValor,
            imei || null,
            modelo_pda || null,
            android || null,
            impresora || null,
            serie_pda || null,
            modelo_impresora || null,
            encargado || null,
            responsable || null,
            unidadValor,
            area || null,
            observaciones || null,
            req.params.id
          );
      } else if (tieneEquipoPDA && tieneUnidad) {
        dbActivos
          .prepare(`
            UPDATE pdas SET
              unidad = ?, responsable = ?, equipo_pda = ?, modelo_pda = ?,
              serie_pda = ?, complemento = ?, modelo_complemento = ?
            WHERE id = ?
          `)
          .run(
            unidadValor,
            responsable || null,
            pdaValor,
            modelo_pda || null,
            serie_pda || null,
            impresora || null,
            modelo_impresora || null,
            req.params.id
          );
      }
    } else if (tieneUnidad && unidadEsNotNull) {
      if (tienePDA && tieneArea) {
        dbActivos
          .prepare(`
            UPDATE pdas SET
              pda = ?, imei = ?, modelo_pda = ?, android = ?,
              impresora = ?, serie_pda = ?, modelo_impresora = ?, encargado = ?,
              responsable = ?, unidad = ?, area = ?, observaciones = ?
            WHERE id = ?
          `)
          .run(
            pdaValor,
            imei || null,
            modelo_pda || null,
            android || null,
            impresora || null,
            serie_pda || null,
            modelo_impresora || null,
            encargado || null,
            responsable || null,
            unidadValor,
            area || null,
            observaciones || null,
            req.params.id
          );
      } else if (tieneUnidad) {
        dbActivos
          .prepare(`
            UPDATE pdas SET
              unidad = ?, responsable = ?, equipo_pda = ?, modelo_pda = ?,
              serie_pda = ?, complemento = ?, modelo_complemento = ?
            WHERE id = ?
          `)
          .run(
            unidadValor,
            responsable || null,
            pdaValor,
            modelo_pda || null,
            serie_pda || null,
            impresora || null,
            modelo_impresora || null,
            req.params.id
          );
      }
    } else if (tienePDA && tieneArea) {
      dbActivos
        .prepare(`
          UPDATE pdas SET
            pda = ?, imei = ?, modelo_pda = ?, android = ?,
            impresora = ?, serie_pda = ?, modelo_impresora = ?, encargado = ?,
            responsable = ?, area = ?, observaciones = ?
          WHERE id = ?
        `)
        .run(
          pdaValor,
          imei || null,
          modelo_pda || null,
          android || null,
          impresora || null,
          serie_pda || null,
          modelo_impresora || null,
          encargado || null,
          responsable || null,
          area || null,
          observaciones || null,
          req.params.id
        );
    } else {
      throw new Error(`La tabla pdas no tiene las columnas esperadas. Columnas disponibles: ${nombresColumnasPDA.join(", ")}`);
    }

    registrarAccion({
      usuario: req.user?.name,
      accion: "ACTUALIZAR_PDA",
      detalle: `${pdaValor} - ${responsable || "Sin responsable"}`,
      tabla: "pdas",
      registroId: req.params.id,
    });

    getIO().emit("activos_actualizados");

    res.json({ ok: true });
  } catch (err) {
    console.error("Error actualizando PDA:", err);
    res.status(500).json({ error: "Error actualizando PDA" });
  }
});

// Eliminar PDA
// ============================================================
// ELIMINAR TODOS LOS PDAs
// ============================================================
router.delete("/pdas/todos", authRequired, verificarPermiso("activos.pdas.eliminar"), (req, res) => {
  try {
    const tablaExiste = dbActivos.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='pdas'
    `).get();

    if (!tablaExiste) {
      return res.json({ ok: true, mensaje: "No hay tabla de PDAs" });
    }

    const info = dbActivos.prepare("DELETE FROM pdas").run();

    registrarAccion({
      usuario: req.user?.name,
      accion: "ELIMINAR_TODOS_PDAs",
      detalle: `Se eliminaron todos los PDAs (${info.changes} registros)`,
      tabla: "pdas",
    });

    getIO().emit("activos_actualizados");

    res.json({ ok: true, eliminados: info.changes });
  } catch (err) {
    console.error("Error eliminando todos los PDAs:", err);
    res.status(500).json({ error: "Error eliminando todos los PDAs" });
  }
});

router.delete("/pdas/:id", authRequired, verificarPermiso("activos.pdas.eliminar"), (req, res) => {
  try {
    const { id } = req.params;
    
    // Validar que el PDA existe
    const pda = dbActivos.prepare("SELECT id FROM pdas WHERE id = ?").get(id);
    if (!pda) {
      return res.status(404).json({ error: "PDA no encontrado" });
    }
    
    dbActivos.prepare("DELETE FROM pdas WHERE id = ?").run(id);

    registrarAccion({
      usuario: req.user?.name,
      accion: "ELIMINAR_PDA",
      detalle: `ID ${req.params.id}`,
      tabla: "pdas",
      registroId: req.params.id,
    });

    getIO().emit("activos_actualizados");

    res.json({ ok: true });
  } catch (err) {
    console.error("Error eliminando PDA:", err);
    res.status(500).json({ error: "Error eliminando PDA" });
  }
});

// Generar QR para un PDA específico
router.get("/pdas/:id/qr", requierePermiso("tab:activos"), async (req, res) => {
  try {
    const pda = dbActivos
      .prepare("SELECT * FROM pdas WHERE id = ?")
      .get(req.params.id);

    if (!pda) {
      return res.status(404).json({ error: "PDA no encontrado" });
    }

    // Extraer número del equipo
    const extraerNumero = (equipo) => {
      if (!equipo) return "";
      const matchNo = equipo.match(/No\.\s*(\d+)/i);
      if (matchNo) {
        return matchNo[1].padStart(2, "0");
      }
      const matchX = equipo.match(/X(\d+)/i);
      if (matchX) {
        return `X${matchX[1].padStart(2, "0")}`;
      }
      const matchNum = equipo.match(/(\d+)/);
      if (matchNum) {
        return matchNum[1].padStart(2, "0");
      }
      return "";
    };

    const numeroEquipo = extraerNumero(pda.pda || pda.equipo_pda);
    const areaPDA = pda.area || pda.unidad || "";

    // Crear datos para el QR
    const datosQR = {
      pda: pda.pda || pda.equipo_pda || "N/A",
      imei: pda.imei || "N/A",
      modelo_pda: pda.modelo_pda || "N/A",
      android: pda.android || "N/A",
      impresora: pda.impresora || "N/A",
      serie_pda: pda.serie_pda || "N/A",
      modelo_impresora: pda.modelo_impresora || "N/A",
      encargado: pda.encargado || "N/A",
      responsable: pda.responsable || "N/A",
      area: areaPDA,
      observaciones: pda.observaciones || "N/A",
      fecha: dayjs().format("YYYY-MM-DD"),
    };

    const textoQR = JSON.stringify(datosQR, null, 2);

    // Generar QR con logo en el centro
    const qrBuffer = await generarQRConLogo(textoQR, 400);

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `inline; filename="qr-pda-${(pda.pda || pda.equipo_pda || "pda").replace(/\s+/g, "-")}.png"`);
    res.send(qrBuffer);
  } catch (err) {
    console.error("Error generando QR PDA:", err);
    res.status(500).json({ error: "Error generando QR" });
  }
});

// Exportar PDAs a Excel
router.get("/pdas/exportar", authRequired, verificarPermiso("activos.exportar"), async (req, res) => {
  try {
    // Verificar qué columnas tiene la tabla pdas
    const columnasPDAs = dbActivos.prepare("PRAGMA table_info(pdas)").all();
    const nombresColumnasPDA = columnasPDAs.map(c => c.name);
    const tieneArea = nombresColumnasPDA.includes("area");
    const tieneUnidad = nombresColumnasPDA.includes("unidad");
    const tienePDA = nombresColumnasPDA.includes("pda");
    const tieneEquipoPDA = nombresColumnasPDA.includes("equipo_pda");
    
    // Construir ORDER BY según columnas disponibles
    let orderByClause = "";
    if (tieneArea && tieneUnidad) {
      orderByClause = "ORDER BY COALESCE(area, unidad), responsable";
    } else if (tieneArea) {
      orderByClause = "ORDER BY area, responsable";
    } else if (tieneUnidad) {
      orderByClause = "ORDER BY unidad, responsable";
    } else {
      orderByClause = "ORDER BY responsable";
    }
    
    if (tienePDA && tieneEquipoPDA) {
      orderByClause += ", COALESCE(pda, equipo_pda)";
    } else if (tienePDA) {
      orderByClause += ", pda";
    } else if (tieneEquipoPDA) {
      orderByClause += ", equipo_pda";
    }
    
    const pdas = dbActivos
      .prepare(`SELECT * FROM pdas ${orderByClause}`)
      .all();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Control de PDAs");

    worksheet.columns = [
      { header: "PDA", key: "pda", width: 20 },
      { header: "IMEI", key: "imei", width: 20 },
      { header: "MODELO PDA", key: "modelo_pda", width: 20 },
      { header: "ANDROID", key: "android", width: 15 },
      { header: "IMPRESORA", key: "impresora", width: 20 },
      { header: "SERIE PDA", key: "serie_pda", width: 20 },
      { header: "MODELO Impresora", key: "modelo_impresora", width: 25 },
      { header: "Encargado", key: "encargado", width: 25 },
      { header: "Responsable", key: "responsable", width: 25 },
      { header: "AREA", key: "area", width: 20 },
      { header: "OBSERVACIONES PDA", key: "observaciones", width: 30 },
    ];

    pdas.forEach((pda) => {
      worksheet.addRow({
        pda: pda.pda || pda.equipo_pda || "",
        imei: pda.imei || "",
        modelo_pda: pda.modelo_pda || "",
        android: pda.android || "",
        impresora: pda.impresora || "",
        serie_pda: pda.serie_pda || "",
        modelo_impresora: pda.modelo_impresora || "",
        encargado: pda.encargado || "",
        responsable: pda.responsable || "",
        area: pda.area || pda.unidad || "",
        observaciones: pda.observaciones || "",
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Control_PDAs_${dayjs().format("YYYY-MM-DD")}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error exportando PDAs:", err);
    res.status(500).json({ error: "Error exportando datos" });
  }
});

// ============================================================
// DESCARGAR TODOS LOS QR EN DOCUMENTO WORD
// ============================================================
router.get("/todos-qr-doc", requierePermiso("tab:activos"), async (req, res) => {
  try {
    // Obtener todos los responsables
    const responsables = dbActivos
      .prepare(`
        SELECT r.*, 
               COUNT(a.id) as total_activos
        FROM responsables r
        LEFT JOIN activos a ON a.responsable_id = r.id
        GROUP BY r.id
        ORDER BY r.id ASC
      `)
      .all();

    if (responsables.length === 0) {
      return res.status(404).json({ error: "No hay responsables para generar QR" });
    }

    // Generar QR para cada responsable y crear contenido del documento
    const children = [
      new Paragraph({
        text: "Códigos QR - Activos Informáticos",
        heading: "Heading1",
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
    ];

    // Verificar columnas disponibles una sola vez
    const columnasActivos = dbActivos.prepare("PRAGMA table_info(activos)").all();
    const nombresColumnasAct = columnasActivos.map(c => c.name);
    const consulta = construirConsultaActivos(nombresColumnasAct);
    
    // Preparar datos de QRs
    const qrData = [];
    for (const responsable of responsables) {
      // Obtener activos del responsable
      const activos = dbActivos
        .prepare(`SELECT ${consulta.campos} FROM activos WHERE responsable_id = ?${consulta.orderBy}`)
        .all(responsable.id);

      // Contar activos por tipo
      const conteoActivos = {};
      activos.forEach((activo) => {
        const tipo = activo.tipo_equipo || "Sin especificar";
        conteoActivos[tipo] = (conteoActivos[tipo] || 0) + 1;
      });

      // Crear datos para el QR
      const datosQR = {
        responsable: responsable.responsable,
        unidad: responsable.unidad,
        cargo: responsable.cargo_area,
        fecha: dayjs().format("YYYY-MM-DD"),
        totalActivos: activos.length,
        conteo: conteoActivos,
        activos: activos.map((a) => ({
          tipo_equipo: a.tipo_equipo || "N/A",
          marca_modelo: a.marca_modelo || "N/A",
          serie: a.numero_serie || "N/A",
        })),
      };

      const textoQR = JSON.stringify(datosQR, null, 2);

      // Generar QR con logo en el centro
      const qrBuffer = await generarQRConLogo(textoQR, 200);
      
      const nombreTexto = responsable.responsable || "Sin responsable";
      const unidadTexto = responsable.unidad || "Sin unidad";
      const textoCompleto = `${unidadTexto}\n${nombreTexto}`;

      qrData.push({
        qrBuffer,
        texto: textoCompleto,
        nombre: nombreTexto,
        unidad: unidadTexto
      });
    }

    // Organizar QRs en filas de 3
    const qrsPorFila = 3;
    const filas = [];
    for (let i = 0; i < qrData.length; i += qrsPorFila) {
      filas.push(qrData.slice(i, i + qrsPorFila));
    }

    // Crear tabla con QRs
    const tableRows = [];
    for (const fila of filas) {
      const cells = [];
      for (const qrItem of fila) {
        cells.push(
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new ImageRun({
                    data: qrItem.qrBuffer,
                    transformation: {
                      width: 200,
                      height: 200,
                    },
                  }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 100 },
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: qrItem.texto,
                    size: 180, // 18 puntos (180 half-points) - tamaño reducido para que quepa
                    bold: true,
                  }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 0 },
              }),
            ],
            width: {
              size: 33.33,
              type: WidthType.PERCENTAGE,
            },
            margins: {
              top: 200,
              bottom: 200,
              left: 200,
              right: 200,
            },
          })
        );
      }
      
      // Completar fila si tiene menos de 3 elementos
      while (cells.length < qrsPorFila) {
        cells.push(
          new TableCell({
            children: [],
            width: {
              size: 33.33,
              type: WidthType.PERCENTAGE,
            },
          })
        );
      }
      
      tableRows.push(new TableRow({ children: cells }));
    }

    // Agregar tabla al documento
    children.push(
      new Table({
        rows: tableRows,
        width: {
          size: 100,
          type: WidthType.PERCENTAGE,
        },
      })
    );

    // Crear documento
    const doc = new Document({
      sections: [
        {
          children: children,
        },
      ],
    });

    // Generar buffer del documento
    const buffer = await Packer.toBuffer(doc);

    // Enviar documento
    const fecha = dayjs().format("YYYY-MM-DD");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="QR_Activos_Informaticos_${fecha}.docx"`
    );
    res.send(buffer);
  } catch (err) {
    console.error("Error generando documento QR:", err);
    res.status(500).json({ error: "Error generando documento QR: " + err.message });
  }
});

// ============================================================
// DESCARGAR TODOS LOS QR DE PDAs EN DOCUMENTO WORD
// ============================================================
router.get("/pdas/todos-qr-doc", authRequired, verificarPermiso("activos.qr"), async (req, res) => {
  try {
    // Obtener todos los PDAs
    const pdas = dbActivos
      .prepare(`
        SELECT * FROM pdas
        ORDER BY area, responsable, COALESCE(pda, equipo_pda)
      `)
      .all();

    if (pdas.length === 0) {
      return res.status(404).json({ error: "No hay PDAs para generar QR" });
    }

    // Generar QR para cada PDA y crear contenido del documento
    const children = [
      new Paragraph({
        text: "Códigos QR - Control de PDAs",
        heading: "Heading1",
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
    ];

    // Función para extraer número del equipo
    const extraerNumero = (equipo) => {
      if (!equipo) return "";
      const matchNo = equipo.match(/No\.\s*(\d+)/i);
      if (matchNo) {
        return matchNo[1].padStart(2, "0");
      }
      const matchX = equipo.match(/X(\d+)/i);
      if (matchX) {
        return `X${matchX[1].padStart(2, "0")}`;
      }
      const matchNum = equipo.match(/(\d+)/);
      if (matchNum) {
        return matchNum[1].padStart(2, "0");
      }
      return "";
    };

    // Preparar datos de QRs
    const qrData = [];
    for (const pda of pdas) {
      const numeroEquipo = extraerNumero(pda.pda || pda.equipo_pda);
      const areaPDA = pda.area || pda.unidad || "";
      const textoDebajoQR = `${areaPDA} ${numeroEquipo}`;

      // Crear datos para el QR
      const datosQR = {
        pda: pda.pda || pda.equipo_pda || "N/A",
        imei: pda.imei || "N/A",
        modelo_pda: pda.modelo_pda || "N/A",
        android: pda.android || "N/A",
        impresora: pda.impresora || "N/A",
        serie_pda: pda.serie_pda || "N/A",
        modelo_impresora: pda.modelo_impresora || "N/A",
        encargado: pda.encargado || "N/A",
        responsable: pda.responsable || "N/A",
        area: areaPDA,
        observaciones: pda.observaciones || "N/A",
        fecha: dayjs().format("YYYY-MM-DD"),
        texto_identificador: textoDebajoQR,
      };

      const textoQR = JSON.stringify(datosQR, null, 2);

      // Generar QR con logo en el centro
      const qrBuffer = await generarQRConLogo(textoQR, 200);

      qrData.push({
        qrBuffer,
        texto: textoDebajoQR,
      });
    }

    // Organizar QRs en filas de 3
    const qrsPorFila = 3;
    const filas = [];
    for (let i = 0; i < qrData.length; i += qrsPorFila) {
      filas.push(qrData.slice(i, i + qrsPorFila));
    }

    // Crear tabla con QRs
    const tableRows = [];
    for (const fila of filas) {
      const cells = [];
      for (const qrItem of fila) {
        cells.push(
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new ImageRun({
                    data: qrItem.qrBuffer,
                    transformation: {
                      width: 200,
                      height: 200,
                    },
                  }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 100 },
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: qrItem.texto,
                    size: 180, // 18 puntos (180 half-points) - tamaño reducido para que quepa
                    bold: true,
                  }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 0 },
              }),
            ],
            width: {
              size: 33.33,
              type: WidthType.PERCENTAGE,
            },
            margins: {
              top: 200,
              bottom: 200,
              left: 200,
              right: 200,
            },
          })
        );
      }
      
      // Completar fila si tiene menos de 3 elementos
      while (cells.length < qrsPorFila) {
        cells.push(
          new TableCell({
            children: [],
            width: {
              size: 33.33,
              type: WidthType.PERCENTAGE,
            },
          })
        );
      }
      
      tableRows.push(new TableRow({ children: cells }));
    }

    // Agregar tabla al documento
    children.push(
      new Table({
        rows: tableRows,
        width: {
          size: 100,
          type: WidthType.PERCENTAGE,
        },
      })
    );

    // Crear documento
    const doc = new Document({
      sections: [
        {
          children: children,
        },
      ],
    });

    // Generar buffer del documento
    const buffer = await Packer.toBuffer(doc);

    // Enviar documento
    const fecha = dayjs().format("YYYY-MM-DD");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="QR_Control_PDAs_${fecha}.doc"`
    );
    res.send(buffer);
  } catch (err) {
    console.error("Error generando documento QR PDAs:", err);
    res.status(500).json({ error: "Error generando documento QR PDAs: " + err.message });
  }
});

// =====================================================
// CONTROL DE TABLETS
// =====================================================

// Crear tabla tablets si no existe
try {
  dbActivos.exec(`
    CREATE TABLE IF NOT EXISTS tablets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tab TEXT NOT NULL,
      imei TEXT,
      modelo_tab TEXT,
      android TEXT,
      encargado TEXT,
      responsable TEXT,
      area TEXT,
      observaciones TEXT,
      orden INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Agregar columna orden si no existe
  const colsTablets = dbActivos.prepare("PRAGMA table_info(tablets)").all();
  const tieneOrdenTablets = colsTablets.some(c => c.name === "orden");
  if (!tieneOrdenTablets) {
    try {
      dbActivos.exec("ALTER TABLE tablets ADD COLUMN orden INTEGER DEFAULT 0");
    } catch (e) {
      // Ignorar si ya existe
    }
  }
} catch (e) {
  console.log("Tabla tablets ya existe o error creando:", e.message);
}

// GET - Listar todas las tablets
router.get("/tablets", authRequired, verificarPermiso("tab:activos"), (req, res) => {
  try {
    const tablets = dbActivos.prepare(`
      SELECT * FROM tablets ORDER BY COALESCE(orden, id) ASC
    `).all();
    res.json(tablets);
  } catch (err) {
    console.error("Error cargando tablets:", err);
    res.status(500).json({ error: "Error cargando tablets" });
  }
});

// POST - Crear tablet
router.post("/tablets", authRequired, verificarPermiso("tab:activos"), (req, res) => {
  try {
    const {
      tab,
      imei,
      modelo_tab,
      android,
      encargado,
      responsable,
      area,
      observaciones,
    } = req.body;

    if (!tab) {
      return res.status(400).json({ error: "Falta el identificador de la Tablet" });
    }

    // Obtener siguiente orden
    const maxOrden = dbActivos.prepare("SELECT MAX(orden) as max FROM tablets").get();
    const siguienteOrden = (maxOrden?.max || 0) + 1;

    const info = dbActivos.prepare(`
      INSERT INTO tablets (tab, imei, modelo_tab, android, encargado, responsable, area, observaciones, orden)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tab,
      imei || null,
      modelo_tab || null,
      android || null,
      encargado || null,
      responsable || null,
      area || null,
      observaciones || null,
      siguienteOrden
    );

    const nuevaTablet = dbActivos.prepare("SELECT * FROM tablets WHERE id = ?").get(info.lastInsertRowid);
    
    registrarAccion(req.user?.id, "tablets.crear", `Tablet creada: ${tab}`, req);
    getIO().emit("activos_actualizados");
    
    res.json(nuevaTablet);
  } catch (err) {
    console.error("Error creando tablet:", err);
    res.status(500).json({ error: "Error creando tablet: " + err.message });
  }
});

// PUT - Actualizar tablet
router.put("/tablets/:id", authRequired, verificarPermiso("tab:activos"), (req, res) => {
  try {
    const { id } = req.params;
    const {
      tab,
      imei,
      modelo_tab,
      android,
      encargado,
      responsable,
      area,
      observaciones,
    } = req.body;

    dbActivos.prepare(`
      UPDATE tablets SET
        tab = COALESCE(?, tab),
        imei = ?,
        modelo_tab = ?,
        android = ?,
        encargado = ?,
        responsable = ?,
        area = ?,
        observaciones = ?
      WHERE id = ?
    `).run(
      tab,
      imei || null,
      modelo_tab || null,
      android || null,
      encargado || null,
      responsable || null,
      area || null,
      observaciones || null,
      id
    );

    const tabletActualizada = dbActivos.prepare("SELECT * FROM tablets WHERE id = ?").get(id);
    
    registrarAccion(req.user?.id, "tablets.editar", `Tablet editada: ${tab || id}`, req);
    getIO().emit("activos_actualizados");
    
    res.json(tabletActualizada);
  } catch (err) {
    console.error("Error actualizando tablet:", err);
    res.status(500).json({ error: "Error actualizando tablet: " + err.message });
  }
});

// PUT - Reordenar tablets
router.put("/tablets/reordenar", authRequired, verificarPermiso("tab:activos"), (req, res) => {
  try {
    const { ordenes } = req.body;
    
    if (!Array.isArray(ordenes)) {
      return res.status(400).json({ error: "ordenes debe ser un array" });
    }

    const updateStmt = dbActivos.prepare("UPDATE tablets SET orden = ? WHERE id = ?");
    
    dbActivos.transaction(() => {
      for (const { id, orden } of ordenes) {
        updateStmt.run(orden, id);
      }
    })();

    res.json({ ok: true });
  } catch (err) {
    console.error("Error reordenando tablets:", err);
    res.status(500).json({ error: "Error reordenando tablets: " + err.message });
  }
});

// DELETE - Eliminar una tablet
router.delete("/tablets/:id", authRequired, verificarPermiso("tab:activos"), (req, res) => {
  try {
    const { id } = req.params;
    
    const tablet = dbActivos.prepare("SELECT * FROM tablets WHERE id = ?").get(id);
    if (!tablet) {
      return res.status(404).json({ error: "Tablet no encontrada" });
    }

    dbActivos.prepare("DELETE FROM tablets WHERE id = ?").run(id);
    
    registrarAccion(req.user?.id, "tablets.eliminar", `Tablet eliminada: ${tablet.tab || id}`, req);
    getIO().emit("activos_actualizados");
    
    res.json({ ok: true });
  } catch (err) {
    console.error("Error eliminando tablet:", err);
    res.status(500).json({ error: "Error eliminando tablet: " + err.message });
  }
});

// DELETE - Eliminar todas las tablets
router.delete("/tablets/todos", authRequired, verificarPermiso("tab:activos"), (req, res) => {
  try {
    dbActivos.prepare("DELETE FROM tablets").run();
    
    registrarAccion(req.user?.id, "tablets.eliminar_todos", "Todas las tablets eliminadas", req);
    getIO().emit("activos_actualizados");
    
    res.json({ ok: true });
  } catch (err) {
    console.error("Error eliminando todas las tablets:", err);
    res.status(500).json({ error: "Error eliminando todas las tablets: " + err.message });
  }
});

// GET - Generar QR para una tablet
router.get("/tablets/:id/qr", authRequired, verificarPermiso("tab:activos"), async (req, res) => {
  try {
    const { id } = req.params;
    
    const tablet = dbActivos.prepare("SELECT * FROM tablets WHERE id = ?").get(id);
    if (!tablet) {
      return res.status(404).json({ error: "Tablet no encontrada" });
    }

    // Extraer número del equipo
    const equipo = tablet.tab || "";
    let numero = "";
    const matchNo = equipo.match(/No\.\s*(\d+)/i);
    if (matchNo) {
      numero = matchNo[1].padStart(2, "0");
    } else {
      const numMatch = equipo.match(/(\d+)/);
      if (numMatch) {
        numero = numMatch[1].padStart(2, "0");
      }
    }

    const textoQR = `${tablet.area || ""} ${numero}`.trim();
    
    const qrBuffer = await generarQRConLogo(textoQR);
    
    res.setHeader("Content-Type", "image/png");
    res.send(qrBuffer);
  } catch (err) {
    console.error("Error generando QR de tablet:", err);
    res.status(500).json({ error: "Error generando QR: " + err.message });
  }
});

// ============================================================
// DESCARGAR TODOS LOS QR DE TABLETS EN DOCUMENTO WORD
// ============================================================
router.get("/tablets/todos-qr-doc", authRequired, verificarPermiso("activos.qr"), async (req, res) => {
  try {
    // Obtener todas las tablets
    const tablets = dbActivos
      .prepare(`
        SELECT * FROM tablets
        ORDER BY area, tab
      `)
      .all();

    if (tablets.length === 0) {
      return res.status(404).json({ error: "No hay tablets para generar QR" });
    }

    // Generar QR para cada tablet y crear contenido del documento
    const children = [
      new Paragraph({
        text: "Códigos QR - Control de Tablets",
        heading: "Heading1",
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
    ];

    // Preparar datos de QRs
    const qrData = [];
    for (const tablet of tablets) {
      // Extraer número del equipo
      const equipo = tablet.tab || "";
      let numero = "";
      const matchNo = equipo.match(/No\.\s*(\d+)/i);
      if (matchNo) {
        numero = matchNo[1].padStart(2, "0");
      } else {
        const numMatch = equipo.match(/(\d+)/);
        if (numMatch) {
          numero = numMatch[1].padStart(2, "0");
        }
      }

      const textoQR = `${tablet.area || ""} ${numero}`.trim();
      const qrBuffer = await generarQRConLogo(textoQR, 200);
      const textoDebajoQR = textoQR || tablet.tab || "Tablet";

      qrData.push({
        qrBuffer,
        texto: textoDebajoQR,
      });
    }

    // Organizar QRs en filas de 3
    const qrsPorFila = 3;
    const filas = [];
    for (let i = 0; i < qrData.length; i += qrsPorFila) {
      filas.push(qrData.slice(i, i + qrsPorFila));
    }

    // Crear tabla con QRs
    const tableRows = [];
    for (const fila of filas) {
      const cells = [];
      for (const qrItem of fila) {
        cells.push(
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new ImageRun({
                    data: qrItem.qrBuffer,
                    transformation: {
                      width: 200,
                      height: 200,
                    },
                  }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 100 },
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: qrItem.texto,
                    size: 180, // 18 puntos (180 half-points) - tamaño reducido para que quepa
                    bold: true,
                  }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 0 },
              }),
            ],
            width: {
              size: 33.33,
              type: WidthType.PERCENTAGE,
            },
            margins: {
              top: 200,
              bottom: 200,
              left: 200,
              right: 200,
            },
          })
        );
      }
      
      // Completar fila si tiene menos de 3 elementos
      while (cells.length < qrsPorFila) {
        cells.push(
          new TableCell({
            children: [],
            width: {
              size: 33.33,
              type: WidthType.PERCENTAGE,
            },
          })
        );
      }
      
      tableRows.push(new TableRow({ children: cells }));
    }

    // Agregar tabla al documento
    children.push(
      new Table({
        rows: tableRows,
        width: {
          size: 100,
          type: WidthType.PERCENTAGE,
        },
      })
    );

    // Crear documento
    const doc = new Document({
      sections: [
        {
          children: children,
        },
      ],
    });

    // Generar buffer del documento
    const buffer = await Packer.toBuffer(doc);

    // Enviar documento
    const fecha = dayjs().format("YYYY-MM-DD");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="QR_Control_Tablets_${fecha}.docx"`
    );
    res.send(buffer);
  } catch (err) {
    console.error("Error generando documento QR Tablets:", err);
    res.status(500).json({ error: "Error generando documento QR Tablets: " + err.message });
  }
});

export default router;
