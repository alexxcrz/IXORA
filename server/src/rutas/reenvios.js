import express from "express";
import dayjs from "dayjs";
import fs from "fs";
import path from "path";
import { dbReenvios, dbUsers } from "../config/baseDeDatos.js";
import { upload, uploadMobile } from "../middleware/cargaArchivos.js";
import { getIO } from "../config/socket.js";
import crypto from "crypto";
import { generarQRConLogo } from "../utilidades/generarQR.js";

import { authRequired } from "../middleware/autenticacion.js";
import { requierePermiso } from "../middleware/permisos.js";
import { registrarAccion } from "../utilidades/auditoria.js";
import { rastrearPaquete } from "../utilidades/rastreoPaquetes.js";

const router = express.Router();

const ESTADOS_VALIDOS = new Set([
  "Listo para enviar",
  "Detenido",
  "Reemplazado",
  "Cancelado",
  "Enviado",
  "En tránsito",
  "Entregado",
]);

function normalizaEstatus(s) {
  if (!s) return null;
  const map = {
    listo: "Listo para enviar",
    detenido: "Detenido",
    reemplazado: "Reemplazado",
    cancelado: "Cancelado",
    enviado: "Enviado",
    pendiente: "Listo para enviar",
    "en transito": "En tránsito",
    "en tránsito": "En tránsito",
    entregado: "Entregado",
  };
  const k = String(s).trim().toLowerCase();
  return map[k] || (ESTADOS_VALIDOS.has(s) ? s : null);
}

// Función para generar enlace de rastreo según la paquetería
function generarEnlaceRastreo(paqueteria, guia) {
  if (!paqueteria || !guia) return null;
  
  const paq = String(paqueteria).trim().toUpperCase();
  const guiaLimpia = String(guia).trim();
  
  // DHL
  if (paq.includes("DHL")) {
    return `https://www.dhl.com/es-es/home/tracking/tracking-express.html?submit=1&tracking-id=${guiaLimpia}`;
  }
  
  // FedEx
  if (paq.includes("FEDEX") || paq.includes("FED")) {
    return `https://www.fedex.com/apps/fedextrack/?tracknumbers=${guiaLimpia}`;
  }
  
  // Estafeta
  if (paq.includes("ESTAFETA")) {
    return `https://www.estafeta.com/Herramientas/Rastreo?Guias=${guiaLimpia}`;
  }
  
  // Paquetexpress
  if (paq.includes("PAQUETEXPRESS") || paq.includes("PAQUET")) {
    return `https://www.paquetexpress.com.mx/rastreo?guia=${guiaLimpia}`;
  }
  
  // Redpack
  if (paq.includes("REDPACK")) {
    return `https://www.redpack.com.mx/rastreo?guia=${guiaLimpia}`;
  }
  
  // Paquete
  if (paq.includes("PAQUETE")) {
    return `https://www.paquete.com.mx/rastreo?guia=${guiaLimpia}`;
  }
  
  // Correos de México
  if (paq.includes("CORREOS") || paq.includes("SEPOMEX")) {
    return `https://www.correosdemexico.gob.mx/SSLServicios/Consultaenvio/Paginas/InformacionEnvio.aspx?guia=${guiaLimpia}`;
  }
  
  // UPS
  if (paq.includes("UPS")) {
    return `https://www.ups.com/track?tracknum=${guiaLimpia}`;
  }
  
  // Paquetería genérica - intentar buscar en Google
  return `https://www.google.com/search?q=rastrear+${paq}+${guiaLimpia}`;
}

// Función para registrar cambio de estado en historial
function registrarCambioEstado(reenvioId, estadoAnterior, estadoNuevo, usuario, observacion = null) {
  const fecha = dayjs().format("YYYY-MM-DD");
  const hora = dayjs().format("HH:mm:ss");
  
  dbReenvios
    .prepare(
      `INSERT INTO reenvios_estados_historial 
       (reenvio_id, estado_anterior, estado_nuevo, fecha, hora, observacion, usuario)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(reenvioId, estadoAnterior, estadoNuevo, fecha, hora, observacion, usuario);
  
  // Actualizar fechas según el estado
  const ahora = dayjs().format("YYYY-MM-DD HH:mm:ss");
  const fechaSolo = dayjs().format("YYYY-MM-DD");
  
  if (estadoNuevo === "Enviado") {
    dbReenvios
      .prepare("UPDATE reenvios SET fecha_enviado = ?, ultima_actualizacion = ? WHERE id = ?")
      .run(fechaSolo, ahora, reenvioId);
  } else if (estadoNuevo === "En tránsito") {
    dbReenvios
      .prepare("UPDATE reenvios SET fecha_en_transito = ?, ultima_actualizacion = ? WHERE id = ?")
      .run(fechaSolo, ahora, reenvioId);
  } else if (estadoNuevo === "Entregado") {
    dbReenvios
      .prepare("UPDATE reenvios SET fecha_entregado = ?, ultima_actualizacion = ? WHERE id = ?")
      .run(fechaSolo, ahora, reenvioId);
  } else {
    dbReenvios
      .prepare("UPDATE reenvios SET ultima_actualizacion = ? WHERE id = ?")
      .run(ahora, reenvioId);
  }
}

router.get("/", (req, res) => {
  const rows = dbReenvios.prepare("SELECT * FROM reenvios ORDER BY id DESC").all();
  res.json(rows);
});

router.post(
  "/",
  requierePermiso("tab:reenvios"),
  (req, res) => {
    const { pedido, paqueteria, guia, observaciones } = req.body;

    if (!pedido) return res.status(400).json({ error: "Pedido requerido" });

    const info = dbReenvios
      .prepare(
        `INSERT INTO reenvios (pedido, fecha, hora, estatus, paqueteria, guia, observaciones)
         VALUES (?, ?, ?, 'Listo para enviar', ?, ?, ?)`
      )
      .run(
        pedido,
        dayjs().format("YYYY-MM-DD"),
        dayjs().format("HH:mm:ss"),
        paqueteria || null,
        guia || null,
        observaciones || ""
      );

    registrarAccion({
      usuario: req.user?.name,
      accion: "CREAR_REENVIO",
      detalle: `Pedido ${pedido}`,
      tabla: "reenvios",
      registroId: info.lastInsertRowid,
    });

    getIO().emit("reenvios_actualizados");
    getIO().emit("reportes_actualizados");

    res.json({ ok: true, id: info.lastInsertRowid });
  }
);

router.put(
  "/:id/envio",
  requierePermiso("tab:reenvios"),
  (req, res) => {
    const { pedido, guia, paqueteria } = req.body;

    dbReenvios
      .prepare(
        `UPDATE reenvios 
         SET pedido = COALESCE(?, pedido),
             guia = COALESCE(?, guia),
             paqueteria = COALESCE(?, paqueteria)
         WHERE id = ?`
      )
      .run(pedido, guia, paqueteria, req.params.id);

    registrarAccion({
      usuario: req.user?.name,
      accion: "EDITAR_REENVIO",
      detalle: `ID ${req.params.id}`,
      tabla: "reenvios",
      registroId: req.params.id,
    });

    getIO().emit("reenvios_actualizados");
    getIO().emit("reportes_actualizados"); // También actualizar reportes

    res.json({ ok: true });
  }
);

// ============================================================
// ============================================================
router.put(
  "/:id/editar-reporte",
  requierePermiso("tab:reenvios"),   // Acceso a reenvíos
  (req, res) => {
    const { pedido, guia, paqueteria, observaciones, estatus } = req.body;

    dbReenvios
      .prepare(
        `UPDATE reenvios 
         SET pedido = COALESCE(?, pedido),
             guia = COALESCE(?, guia),
             paqueteria = COALESCE(?, paqueteria),
             observaciones = COALESCE(?, observaciones),
             estatus = COALESCE(?, estatus)
         WHERE id = ?`
      )
      .run(pedido, guia, paqueteria, observaciones, estatus, req.params.id);

    registrarAccion({
      usuario: req.user?.name,
      accion: "EDITAR_REPORTE_REENVIO",
      detalle: `ID ${req.params.id}`,
      tabla: "reenvios",
      registroId: req.params.id,
    });

    getIO().emit("reenvios_actualizados");
    getIO().emit("reportes_actualizados"); // También actualizar reportes

    res.json({ ok: true });
  }
);

// ============================================================
// ============================================================
router.put(
  "/:id/estatus",
  requierePermiso("tab:reenvios"),   // Acceso a reenvíos
  (req, res) => {
    const estatus = normalizaEstatus(req.body?.estatus);
    if (!estatus) return res.status(400).json({ error: "Estatus inválido" });

    // Obtener estado anterior
    const reenvio = dbReenvios
      .prepare("SELECT estatus FROM reenvios WHERE id=?")
      .get(req.params.id);
    
    const estadoAnterior = reenvio?.estatus || null;

    // Actualizar estado
    dbReenvios
      .prepare("UPDATE reenvios SET estatus=? WHERE id=?")
      .run(estatus, req.params.id);

    // Registrar en historial
    registrarCambioEstado(
      req.params.id,
      estadoAnterior,
      estatus,
      req.user?.name || "Sistema",
      req.body?.observacion || null
    );

    registrarAccion({
      usuario: req.user?.name,
      accion: "CAMBIAR_ESTATUS_REENVIO",
      detalle: `ID ${req.params.id} → ${estatus}`,
      tabla: "reenvios",
      registroId: req.params.id,
    });

    getIO().emit("reenvios_actualizados");
    getIO().emit("reportes_actualizados"); // También actualizar reportes

    res.json({ ok: true });
  }
);

// ============================================================
// ============================================================
router.post(
  "/:id/detener",
  requierePermiso("tab:reenvios"),   // Acceso a reenvíos
  (req, res) => {
    const { motivo } = req.body;

    const row = dbReenvios
      .prepare("SELECT observaciones FROM reenvios WHERE id=?")
      .get(req.params.id);

    const ahora = dayjs().format("YYYY-MM-DD HH:mm:ss");

    const obs = row?.observaciones
      ? `${row.observaciones}\n[${ahora}] DETENIDO: ${motivo}`
      : `[${ahora}] DETENIDO: ${motivo}`;

    dbReenvios
      .prepare(
        "UPDATE reenvios SET estatus='Detenido', observaciones=? WHERE id=?"
      )
      .run(obs, req.params.id);

    registrarAccion({
      usuario: req.user?.name,
      accion: "DETENER_REENVIO",
      detalle: `ID ${req.params.id}: ${motivo}`,
      tabla: "reenvios",
      registroId: req.params.id,
    });

    getIO().emit("reenvios_actualizados");
    getIO().emit("reportes_actualizados");

    res.json({ ok: true });
  }
);

// ============================================================
// ============================================================
router.put(
  "/:id/comentario",
  requierePermiso("tab:reenvios"),   // Acceso a reenvíos
  (req, res) => {
    const { texto } = req.body;

    const row = dbReenvios
      .prepare("SELECT observaciones FROM reenvios WHERE id=?")
      .get(req.params.id);

    const ahora = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const obs = row?.observaciones
      ? `${row.observaciones}\n[${ahora}] ${texto}`
      : `[${ahora}] ${texto}`;

    dbReenvios
      .prepare("UPDATE reenvios SET observaciones=? WHERE id=?")
      .run(obs, req.params.id);

    registrarAccion({
      usuario: req.user?.name,
      accion: "AGREGAR_COMENTARIO_REENVIO",
      detalle: `ID ${req.params.id}`,
      tabla: "reenvios",
      registroId: req.params.id,
    });

    getIO().emit("reenvios_actualizados");

    res.json({ ok: true });
  }
);

// ============================================================
// ============================================================
router.delete(
  "/:id",
  requierePermiso("tab:reenvios"),   // Acceso a reenvíos
  (req, res) => {
    const row = dbReenvios
      .prepare("SELECT estatus FROM reenvios WHERE id=?")
      .get(req.params.id);

    if (!row) return res.status(404).json({ error: "No encontrado" });

    if (row.estatus !== "Cancelado") {
      dbReenvios
        .prepare("UPDATE reenvios SET estatus='Cancelado' WHERE id=?")
        .run(req.params.id);

      registrarAccion({
        usuario: req.user?.name,
        accion: "CANCELAR_REENVIO",
        detalle: `ID ${req.params.id}`,
        tabla: "reenvios",
        registroId: req.params.id,
      });

      // Emitir evento de socket para sincronización en tiempo real
      getIO().emit("reenvios_actualizados");
      getIO().emit("reportes_actualizados");

      return res.json({ ok: true, msg: "Cancelado" });
    }

    dbReenvios.prepare("DELETE FROM reenvios WHERE id=?").run(req.params.id);
    dbReenvios
      .prepare("DELETE FROM reenvios_fotos WHERE reenvio_id=?")
      .run(req.params.id);

    registrarAccion({
      usuario: req.user?.name,
      accion: "ELIMINAR_REENVIO",
      detalle: `ID ${req.params.id}`,
      tabla: "reenvios",
      registroId: req.params.id,
    });

    getIO().emit("reenvios_actualizados");
    getIO().emit("reportes_actualizados");

    res.json({ ok: true, msg: "Eliminado" });
  }
);

// ============================================================
// ============================================================
router.post(
  "/:id/liberar",
  requierePermiso("tab:reenvios"),   // Acceso a reenvíos
  (req, res) => {
    const { nuevoPedido, paqueteria, guia, comentario } = req.body;
    const id = req.params.id;

    const item = dbReenvios.prepare("SELECT * FROM reenvios WHERE id=?").get(id);

    if (!item) return res.status(404).json({ error: "No encontrado" });

    // Mismo pedido
    if (!nuevoPedido) {
      const obs = (item.observaciones || "") + `\n[${dayjs().format()}] Liberado` + (comentario ? `\n${comentario}` : "");
      dbReenvios
        .prepare(
          `UPDATE reenvios 
           SET estatus='Listo para enviar',
               observaciones=?,
               paqueteria=COALESCE(?, paqueteria),
               guia=COALESCE(?, guia)
           WHERE id=?`
        )
        .run(obs, paqueteria || null, guia || null, id);

      registrarAccion({
        usuario: req.user?.name,
        accion: "LIBERAR_REENVIO",
        detalle: `ID ${id}`,
        tabla: "reenvios",
        registroId: id,
      });

      // Emitir evento de socket para sincronización en tiempo real
      getIO().emit("reenvios_actualizados");
      getIO().emit("reportes_actualizados");

      return res.json({ ok: true, type: "mismo" });
    }

    // Reemplazar pedido
    const obsReemplazo = (item.observaciones || "") + `\n[REEMPLAZADO] -> ${nuevoPedido}` + (comentario ? `\n${comentario}` : "");
    dbReenvios
      .prepare(
        "UPDATE reenvios SET estatus='Reemplazado', observaciones=? WHERE id=?"
      )
      .run(
        obsReemplazo,
        id
      );

    const info = dbReenvios
      .prepare(
        "INSERT INTO reenvios (pedido, fecha, hora, estatus, observaciones, paqueteria, guia) VALUES (?,?,?,?,?,?,?)"
      )
      .run(
        nuevoPedido,
        dayjs().format("YYYY-MM-DD"),
        dayjs().format("HH:mm:ss"),
        "Listo para enviar",
        `Reemplazo de ${item.pedido}` + (comentario ? `\n${comentario}` : ""),
        paqueteria || item.paqueteria || null,
        guia || item.guia || null
      );

    registrarAccion({
      usuario: req.user?.name,
      accion: "REEMPLAZAR_REENVIO",
      detalle: `ID ${id} → nuevo ${nuevoPedido}`,
      tabla: "reenvios",
      registroId: info.lastInsertRowid,
    });

    getIO().emit("reenvios_actualizados");
    getIO().emit("reportes_actualizados");

    res.json({ ok: true, type: "nuevo", newId: info.lastInsertRowid });
  }
);

// ============================================================
// FOTOS
// ============================================================

router.get("/foto/:id/:archivo", (req, res) => {
  const id = req.params.id;
  let archivo = decodeURIComponent(req.params.archivo);
  
  // Validar que el nombre del archivo no esté vacío o incompleto
  const archivoTrimmed = archivo?.trim();
  if (!archivoTrimmed || 
      typeof archivo !== 'string' || 
      archivoTrimmed.endsWith('-')) {
    return res.status(404).send("Foto no encontrada");
  }
  
  const reenvio = dbReenvios
    .prepare("SELECT pedido FROM reenvios WHERE id = ?")
    .get(id);

  if (!reenvio) {
    return res.status(404).send("Reenvío no encontrado");
  }

  let file = null;
  
  if (reenvio.pedido) {
    const nombrePedido = (reenvio.pedido || String(id))
      .replace(/[<>:"/\\|?*]/g, '_')
      .trim();
    const filePath = path.join(
      process.cwd(),
      "uploads",
      "reenvios",
      nombrePedido,
      archivo
    );
    if (fs.existsSync(filePath)) {
      file = filePath;
    }
  }
  
  if (!file) {
    const filePath = path.join(
      process.cwd(),
      "uploads",
      "reenvios",
      String(id),
      archivo
    );
    if (fs.existsSync(filePath)) {
      file = filePath;
    }
  }

  if (!file || !fs.existsSync(file)) {
    return res.status(404).send("Foto no encontrada");
  }
  
  // Determinar el Content-Type basado en la extensión
  const ext = path.extname(archivo).toLowerCase();
  const contentTypeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  const contentType = contentTypeMap[ext] || 'image/jpeg';
  
  // Establecer headers apropiados para imágenes
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  
  res.sendFile(path.resolve(file));
});

router.post(
  "/:id/fotos",
  requierePermiso("tab:reenvios"),   // Acceso a reenvíos
  upload.array("fotos", 5),
  (req, res) => {
    const files = req.files || [];
    if (!files.length)
      return res.status(400).json({ error: "Sin archivos" });

    const stmt = dbReenvios.prepare(
      "INSERT INTO reenvios_fotos (reenvio_id, tipo, archivo, fecha, hora) VALUES (?, 'evidencia', ?, ?, ?)"
    );

    for (const f of files) {
      stmt.run(
        req.params.id,
        f.filename,
        dayjs().format("YYYY-MM-DD"),
        dayjs().format("HH:mm:ss")
      );
    }

    dbReenvios
      .prepare("UPDATE reenvios SET evidencia_count = evidencia_count + ? WHERE id=?")
      .run(files.length, req.params.id);

    registrarAccion({
      usuario: req.user?.name,
      accion: "SUBIR_EVIDENCIA_REENVIO",
      detalle: `ID ${req.params.id}, ${files.length} fotos`,
      tabla: "reenvios",
      registroId: req.params.id,
    });

    getIO().emit("reenvios_actualizados");

    res.json({ ok: true, count: files.length });
  }
);

router.get("/:id/fotos", (req, res) => {
  const id = req.params.id;
  
  const reenvio = dbReenvios
    .prepare("SELECT pedido FROM reenvios WHERE id = ?")
    .get(id);

  if (!reenvio) {
    return res.json({ ok: true, urls: [] });
  }

  let folder = null;
  let folderName = null;
  
  if (reenvio.pedido) {
    const nombrePedido = (reenvio.pedido || String(id))
      .replace(/[<>:"/\\|?*]/g, '_')
      .trim();
    const folderPath = path.join(
      process.cwd(),
      "uploads",
      "reenvios",
      nombrePedido
    );
    if (fs.existsSync(folderPath)) {
      folder = folderPath;
      folderName = nombrePedido;
    }
  }
  
  if (!folder) {
    const folderPath = path.join(
      process.cwd(),
      "uploads",
      "reenvios",
      String(id)
    );
    if (fs.existsSync(folderPath)) {
      folder = folderPath;
      folderName = String(id);
    }
  }

  if (!folder || !fs.existsSync(folder)) {
    return res.json({ ok: true, urls: [] });
  }

  // 🔥 PRIMERO: Buscar fotos en la base de datos
  let fotosDB = dbReenvios
    .prepare("SELECT id, archivo FROM reenvios_fotos WHERE reenvio_id = ?")
    .all(id);

  // 🔥 SEGUNDO: Si no hay fotos en BD pero hay archivos físicos, reconstruir registros
  if ((!fotosDB || fotosDB.length === 0) && folder) {
    try {
      const archivos = fs.readdirSync(folder).filter(f => {
        const ext = path.extname(f).toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
      });

      if (archivos.length > 0) {
        console.log(`📸 Reconstruyendo ${archivos.length} fotos para reenvío ${id} desde archivos físicos`);
        const stmt = dbReenvios.prepare(
          "INSERT INTO reenvios_fotos (reenvio_id, tipo, archivo, fecha, hora) VALUES (?, 'evidencia', ?, ?, ?)"
        );

        for (const archivo of archivos) {
          try {
            // Verificar si ya existe en BD (por si acaso)
            const existe = dbReenvios
              .prepare("SELECT id FROM reenvios_fotos WHERE reenvio_id = ? AND archivo = ?")
              .get(id, archivo);
            
            if (!existe) {
              stmt.run(
                id,
                archivo,
                dayjs().format("YYYY-MM-DD"),
                dayjs().format("HH:mm:ss")
              );
            }
          } catch (e) {
            console.warn(`⚠️ Error insertando foto ${archivo}:`, e.message);
          }
        }

        // Actualizar contador de evidencias
        const totalFotos = archivos.length;
        dbReenvios
          .prepare("UPDATE reenvios SET evidencia_count = ? WHERE id = ?")
          .run(totalFotos, id);

        // Volver a consultar después de insertar
        fotosDB = dbReenvios
          .prepare("SELECT id, archivo FROM reenvios_fotos WHERE reenvio_id = ?")
          .all(id);
      }
    } catch (e) {
      console.error(`❌ Error reconstruyendo fotos para reenvío ${id}:`, e);
    }
  }

  // 🔥 TERCERO: Construir URLs de las fotos
  const urls = [];
  for (const foto of fotosDB || []) {
    const archivo = foto.archivo;
    
    // Validar que el nombre del archivo no esté vacío, incompleto o inválido
    const archivoTrimmed = archivo?.trim();
    if (!archivoTrimmed || 
        typeof archivo !== 'string' || 
        archivoTrimmed.endsWith('-')) {
      continue;
    }
    
    const fotoPath = path.join(folder, archivo);
    if (fs.existsSync(fotoPath)) {
      // Construir URL usando el endpoint de fotos
      const url = `${req.protocol}://${req.get("host")}/reenvios/foto/${id}/${encodeURIComponent(archivo)}`;
      urls.push({ url, id: foto.id, archivo });
    }
  }

  res.json({ ok: true, urls });
});

// ============================================================
// 🔥 RECONSTRUIR TODAS LAS FOTOS DE REENVÍOS (una sola vez)
// ============================================================
router.post(
  "/reconstruir-fotos",
  requierePermiso("tab:reenvios"),
  (req, res) => {
    try {
      console.log("🔄 Iniciando reconstrucción de fotos de reenvíos...");
      
      // Obtener todos los reenvíos activos
      const reenvios = dbReenvios
        .prepare("SELECT id, pedido FROM reenvios ORDER BY id")
        .all();
      
      let totalReenvios = 0;
      let totalFotosReconstruidas = 0;
      let reenviosConFotos = 0;
      
      const reenviosDir = path.join(process.cwd(), "uploads", "reenvios");
      
      for (const reenvio of reenvios) {
        let folder = null;
        let folderName = null;
        
        // Buscar carpeta por nombre de pedido
        if (reenvio.pedido) {
          const nombrePedido = (reenvio.pedido || String(reenvio.id))
            .replace(/[<>:"/\\|?*]/g, '_')
            .trim();
          const folderPath = path.join(reenviosDir, nombrePedido);
          if (fs.existsSync(folderPath)) {
            folder = folderPath;
            folderName = nombrePedido;
          }
        }
        
        // Si no se encontró por pedido, buscar por ID
        if (!folder) {
          const folderPath = path.join(reenviosDir, String(reenvio.id));
          if (fs.existsSync(folderPath)) {
            folder = folderPath;
            folderName = String(reenvio.id);
          }
        }
        
        if (!folder || !fs.existsSync(folder)) {
          continue; // No hay carpeta para este reenvío
        }
        
        // Obtener fotos que ya están en BD
        const fotosEnBD = dbReenvios
          .prepare("SELECT archivo FROM reenvios_fotos WHERE reenvio_id = ?")
          .all(reenvio.id)
          .map(f => f.archivo);
        
        // Leer archivos de la carpeta
        let archivos = [];
        try {
          archivos = fs.readdirSync(folder).filter(f => {
            const ext = path.extname(f).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
          });
        } catch (e) {
          console.warn(`⚠️ Error leyendo carpeta ${folderName} para reenvío ${reenvio.id}:`, e.message);
          continue;
        }
        
        if (archivos.length === 0) {
          continue; // No hay fotos en esta carpeta
        }
        
        // Filtrar archivos que no están en BD
        const archivosFaltantes = archivos.filter(archivo => !fotosEnBD.includes(archivo));
        
        if (archivosFaltantes.length === 0) {
          continue; // Todas las fotos ya están en BD
        }
        
        // Insertar fotos faltantes
        const stmt = dbReenvios.prepare(
          "INSERT INTO reenvios_fotos (reenvio_id, tipo, archivo, fecha, hora) VALUES (?, 'evidencia', ?, ?, ?)"
        );
        
        let fotosInsertadas = 0;
        for (const archivo of archivosFaltantes) {
          try {
            stmt.run(
              reenvio.id,
              archivo,
              dayjs().format("YYYY-MM-DD"),
              dayjs().format("HH:mm:ss")
            );
            fotosInsertadas++;
          } catch (e) {
            console.warn(`⚠️ Error insertando foto ${archivo} para reenvío ${reenvio.id}:`, e.message);
          }
        }
        
        if (fotosInsertadas > 0) {
          // Actualizar contador de evidencias con el total real
          dbReenvios
            .prepare("UPDATE reenvios SET evidencia_count = ? WHERE id = ?")
            .run(archivos.length, reenvio.id);
          
          totalFotosReconstruidas += fotosInsertadas;
          reenviosConFotos++;
          console.log(`✅ Reenvío ${reenvio.id} (${reenvio.pedido || 'Sin pedido'}): ${fotosInsertadas} foto(s) reconstruida(s)`);
        }
        
        totalReenvios++;
      }
      
      console.log(`🎉 Reconstrucción completada:`);
      console.log(`   - Reenvíos procesados: ${totalReenvios}`);
      console.log(`   - Reenvíos con fotos: ${reenviosConFotos}`);
      console.log(`   - Total de fotos reconstruidas: ${totalFotosReconstruidas}`);
      
      // Emitir evento para actualizar la UI
      getIO().emit("reenvios_actualizados");
      
      res.json({
        ok: true,
        mensaje: `Reconstrucción completada`,
        reenvios_procesados: totalReenvios,
        reenvios_con_fotos: reenviosConFotos,
        fotos_reconstruidas: totalFotosReconstruidas
      });
    } catch (err) {
      console.error("❌ Error reconstruyendo fotos:", err);
      res.status(500).json({ error: "Error reconstruyendo fotos", details: err.message });
    }
  }
);

// ============================================================
// DELETE - Borrar foto individual
// ============================================================
router.delete(
  "/:id/fotos/:fotoId",
  requierePermiso("tab:reenvios"),
  (req, res) => {
    try {
      const reenvioId = req.params.id;
      const fotoId = req.params.fotoId;

      // Obtener información de la foto
      const foto = dbReenvios
        .prepare("SELECT archivo FROM reenvios_fotos WHERE id = ? AND reenvio_id = ?")
        .get(fotoId, reenvioId);

      if (!foto) {
        return res.status(404).json({ error: "Foto no encontrada" });
      }

      // Obtener información del reenvío para la carpeta
      const reenvio = dbReenvios
        .prepare("SELECT pedido FROM reenvios WHERE id = ?")
        .get(reenvioId);

      if (!reenvio) {
        return res.status(404).json({ error: "Reenvío no encontrado" });
      }

      // Eliminar archivo físico
      const nombrePedido = (reenvio.pedido || String(reenvioId))
        .replace(/[<>:"/\\|?*]/g, '_')
        .trim();
      
      const fotoPath = path.join(
        process.cwd(),
        "uploads",
        "reenvios",
        nombrePedido,
        foto.archivo
      );

      if (fs.existsSync(fotoPath)) {
        try {
          fs.unlinkSync(fotoPath);
        } catch (err) {
          console.warn("⚠️ Error eliminando archivo físico:", err.message);
        }
      }

      // Eliminar registro de la base de datos
      dbReenvios
        .prepare("DELETE FROM reenvios_fotos WHERE id = ?")
        .run(fotoId);

      // Actualizar contador de evidencias
      const currentCount = dbReenvios
        .prepare("SELECT evidencia_count FROM reenvios WHERE id = ?")
        .get(reenvioId)?.evidencia_count || 0;
      const newCount = Math.max(0, currentCount - 1);
      dbReenvios
        .prepare("UPDATE reenvios SET evidencia_count = ? WHERE id = ?")
        .run(newCount, reenvioId);

      registrarAccion({
        usuario: req.user?.name,
        accion: "BORRAR_FOTO_REENVIO",
        detalle: `ID ${reenvioId}, foto: ${foto.archivo}`,
        tabla: "reenvios",
        registroId: reenvioId,
      });

      getIO().emit("reenvios_actualizados");

      res.json({ ok: true });
    } catch (err) {
      console.error("Error borrando foto:", err);
      res.status(500).json({ error: "Error borrando foto" });
    }
  }
);

// ============================================================
// POST — Cerrar reenvíos del día (mover al histórico)
// ============================================================
const handleCerrarReenvios = (req, res) => {
    const fechaCorte = req.body?.fecha || dayjs().format("YYYY-MM-DD");

    const rows = dbReenvios
      .prepare(
        `SELECT * FROM reenvios 
         WHERE estatus IN ('Enviado','Cancelado','Reemplazado')`
      )
      .all();

    if (!rows.length) return res.json({ ok: true, cantidad: 0, fechaCorte });

    // Crear tabla histórica de fotos si no existe
    try {
      dbReenvios.exec(`
        CREATE TABLE IF NOT EXISTS reenvios_fotos_hist (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pedido TEXT NOT NULL,
          archivo TEXT NOT NULL,
          fecha_cierre TEXT,
          fecha TEXT,
          hora TEXT
        )
      `);
    } catch (e) {
      // Tabla ya existe, continuar
    }

    // Guardar fotos en histórico ANTES de eliminar los reenvíos
    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    
    try {
      const fotosDelDia = dbReenvios
        .prepare(`SELECT f.*, r.pedido FROM reenvios_fotos f 
                  JOIN reenvios r ON r.id = f.reenvio_id 
                  WHERE f.reenvio_id IN (${placeholders})`)
        .all(...ids);
      
      if (fotosDelDia.length > 0) {
        const insFotosHist = dbReenvios.prepare(`
          INSERT INTO reenvios_fotos_hist (pedido, archivo, fecha_cierre, fecha, hora)
          VALUES (?, ?, ?, ?, ?)
        `);
        
        for (const foto of fotosDelDia) {
          try {
            insFotosHist.run(
              foto.pedido || "",
              foto.archivo || "",
              fechaCorte,
              foto.fecha || dayjs().format("YYYY-MM-DD"),
              foto.hora || dayjs().format("HH:mm:ss")
            );
            console.log(`📸 Foto de reenvío guardada en histórico: ${foto.archivo} para pedido ${foto.pedido}`);
          } catch (fotoErr) {
            console.error(`❌ Error guardando foto ${foto.archivo} en histórico:`, fotoErr);
          }
        }
        console.log(`📸 ${fotosDelDia.length} fotos de reenvíos guardadas en histórico`);
      }
    } catch (e) {
      console.warn("⚠️ Error guardando fotos de reenvíos en histórico:", e.message);
    }

    const ins = dbReenvios.prepare(`
      INSERT INTO reenvios_historico 
      (pedido, fecha, hora, estatus, paqueteria, guia, observaciones, evidencia_count, fechaCorte,
       fecha_enviado, fecha_en_transito, fecha_entregado, ultima_actualizacion)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = dbReenvios.transaction(() => {
      rows.forEach((r) =>
        ins.run(
          r.pedido,
          r.fecha,
          r.hora,
          r.estatus,
          r.paqueteria,
          r.guia,
          r.observaciones,
          r.evidencia_count,
          fechaCorte,
          r.fecha_enviado || null,
          r.fecha_en_transito || null,
          r.fecha_entregado || null,
          r.ultima_actualizacion || null
        )
      );
    });

    tx();

    // Validar que todos los IDs existen antes de eliminar
    if (ids.length === 0) {
      return res.status(400).json({ error: "No se proporcionaron IDs para eliminar" });
    }

    // Verificar que todos los IDs existen (reutilizamos placeholders ya definido arriba)
    const reenviosExistentes = dbReenvios
      .prepare(`SELECT id FROM reenvios WHERE id IN (${placeholders})`)
      .all(...ids);
    
    if (reenviosExistentes.length !== ids.length) {
      return res.status(400).json({ 
        error: `Algunos IDs no existen. Encontrados: ${reenviosExistentes.length}, Solicitados: ${ids.length}` 
      });
    }

    // Usar transacción para asegurar atomicidad
    const deleteReenvios = dbReenvios.transaction((idsArray) => {
      dbReenvios
        .prepare(`DELETE FROM reenvios WHERE id IN (${idsArray.map(() => "?").join(",")})`)
        .run(...idsArray);
      
      // Eliminar fotos asociadas
      dbReenvios
        .prepare(`DELETE FROM reenvios_fotos WHERE reenvio_id IN (${idsArray.map(() => "?").join(",")})`)
        .run(...idsArray);
    });

    deleteReenvios(ids);

    registrarAccion({
      usuario: req.user?.name,
      accion: "CERRAR_DIA_REENVIOS",
      detalle: `Registros: ${ids.length}`,
      tabla: "reenvios",
      registroId: null,
    });

    // Emitir eventos de socket para sincronización en tiempo real
    // Usar setTimeout para asegurar que la transacción se complete
    const io = getIO();
    setTimeout(() => {
      io.emit("reenvios_actualizados");
      io.emit("reportes_actualizados");
      console.log("📡 Eventos de reenvíos y reportes emitidos después del cierre del día");
    }, 100);
    
    // También emitir inmediatamente
    io.emit("reenvios_actualizados");
    io.emit("reportes_actualizados");

    res.json({ ok: true, cantidad: rows.length, fechaCorte });
};

// Ruta con ambos nombres para compatibilidad
router.post("/cerrar-dia", requierePermiso("tab:reenvios"), handleCerrarReenvios);
router.post("/cerrar-reenvios", requierePermiso("tab:reenvios"), handleCerrarReenvios);

// ============================================================
// BUSCAR EN HISTÓRICO POR PEDIDO
// ============================================================
// ============================================================
// RUTAS DE HISTÓRICO (deben ir antes de otras rutas más generales)
// ============================================================

// GET - Servir foto histórica (ruta más específica primero)
router.get("/historico/foto/:pedido/:archivo", (req, res) => {
  try {
    const pedido = decodeURIComponent(req.params.pedido);
    let archivo = decodeURIComponent(req.params.archivo);
    
    // Validar que el nombre del archivo no esté vacío o incompleto
    const archivoTrimmed = archivo?.trim();
    if (!archivoTrimmed || 
        typeof archivo !== 'string' || 
        archivoTrimmed.endsWith('-')) {
      return res.status(404).send("Foto no encontrada");
    }
    
    const nombrePedido = (pedido || "")
      .replace(/[<>:"/\\|?*]/g, '_')
      .trim();
    
    const fotoPath = path.join(
      process.cwd(),
      "uploads",
      "reenvios",
      nombrePedido,
      archivo
    );
    
    if (!fs.existsSync(fotoPath)) {
      console.warn(`⚠️ Foto histórica no encontrada: ${fotoPath}`);
      return res.status(404).send("Foto no encontrada");
    }
    
    const ext = path.extname(archivo).toLowerCase();
    const contentTypeMap = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    
    res.setHeader('Content-Type', contentTypeMap[ext] || 'image/jpeg');
    res.sendFile(path.resolve(fotoPath));
  } catch (err) {
    console.error("Error sirviendo foto histórica:", err);
    res.status(500).send("Error cargando foto");
  }
});

// GET - Obtener fotos históricas por pedido
router.get("/historico/fotos/:pedido", requierePermiso("tab:reenvios"), (req, res) => {
  try {
    const pedido = decodeURIComponent(req.params.pedido);
    console.log(`📸 Buscando fotos históricas para pedido: ${pedido}`);
    
    // Buscar fotos en histórico
    const fotosHist = dbReenvios
      .prepare(
        `SELECT archivo, fecha_cierre FROM reenvios_fotos_hist 
         WHERE pedido = ? 
         ORDER BY fecha_cierre DESC, fecha DESC, hora DESC`
      )
      .all(pedido);
    
    console.log(`📸 Fotos encontradas en BD: ${fotosHist.length}`);
    
    if (!fotosHist || fotosHist.length === 0) {
      return res.json({ ok: true, urls: [] });
    }
    
    // Buscar las fotos en el sistema de archivos
    const nombrePedido = (pedido || "")
      .replace(/[<>:"/\\|?*]/g, '_')
      .trim();
    
    const uploadsDir = path.join(process.cwd(), "uploads", "reenvios");
    const urls = [];
    
    for (const foto of fotosHist) {
      const archivo = foto.archivo;
      
      // Validar que el nombre del archivo no esté vacío o incompleto
      const archivoTrimmed = archivo?.trim();
      if (!archivoTrimmed || 
          typeof archivo !== 'string' || 
          archivoTrimmed.endsWith('-')) {
        continue;
      }
      
      // Intentar buscar en la carpeta con el nombre del pedido
      const fotoPathPedido = path.join(uploadsDir, nombrePedido, archivo);
      if (fs.existsSync(fotoPathPedido)) {
        // Buscar si hay un reenvío actual con este pedido para obtener el ID
        const reenvioActual = dbReenvios
          .prepare("SELECT id FROM reenvios WHERE pedido = ? LIMIT 1")
          .get(pedido);
        
        if (reenvioActual) {
          const url = `${req.protocol}://${req.get("host")}/reenvios/foto/${reenvioActual.id}/${encodeURIComponent(archivo)}`;
          urls.push({ url, id: null, archivo, esHistorico: true });
        } else {
          // Si no hay reenvío actual, usar una ruta especial para históricos
          const url = `${req.protocol}://${req.get("host")}/reenvios/historico/foto/${encodeURIComponent(pedido)}/${encodeURIComponent(archivo)}`;
          urls.push({ url, id: null, archivo, esHistorico: true });
        }
      } else {
        console.warn(`⚠️ Foto no encontrada en sistema de archivos: ${fotoPathPedido}`);
      }
    }
    
    console.log(`📸 URLs generadas: ${urls.length}`);
    res.json({ ok: true, urls });
  } catch (err) {
    console.error("Error cargando fotos históricas:", err);
    res.status(500).json({ error: "Error cargando fotos históricas" });
  }
});

router.get("/historico/buscar", requierePermiso("tab:reenvios"), (req, res) => {
  try {
    const { pedido } = req.query;
    
    if (!pedido || pedido.trim().length === 0) {
      return res.json([]);
    }

    const pedidoBuscado = `%${pedido.trim()}%`;
    const rows = dbReenvios
      .prepare(
        `SELECT * FROM reenvios_historico
         WHERE pedido LIKE ?
         ORDER BY fechaCorte DESC, id DESC
         LIMIT 50`
      )
      .all(pedidoBuscado);

    res.json(rows);
  } catch (err) {
    console.error("Error buscando en histórico:", err);
    res.status(500).json({ error: "Error buscando en histórico" });
  }
});

// ============================================================
// OBTENER ENLACE DE RASTREO PARA REENVÍO HISTÓRICO
// IMPORTANTE: Esta ruta debe ir ANTES de /historico/:id para que funcione correctamente
// ============================================================
router.get("/historico/:id/rastreo", requierePermiso("tab:reenvios"), (req, res) => {
  try {
    const reenvio = dbReenvios
      .prepare("SELECT paqueteria, guia FROM reenvios_historico WHERE id = ?")
      .get(req.params.id);
    
    if (!reenvio) {
      return res.status(404).json({ error: "Reenvío histórico no encontrado" });
    }
    
    const enlace = generarEnlaceRastreo(reenvio.paqueteria, reenvio.guia);
    
    res.json({
      ok: true,
      enlace,
      paqueteria: reenvio.paqueteria,
      guia: reenvio.guia,
      tieneEnlace: !!enlace
    });
  } catch (err) {
    console.error("Error obteniendo enlace de rastreo histórico:", err);
    res.status(500).json({ error: "Error obteniendo enlace de rastreo" });
  }
});

// ============================================================
// VERIFICAR Y ACTUALIZAR ESTADO DESDE PAQUETERÍA (HISTÓRICO)
// IMPORTANTE: Esta ruta debe ir ANTES de /historico/:id para que funcione correctamente
// ============================================================
router.post(
  "/historico/:id/verificar-estado",
  requierePermiso("tab:reenvios"),
  async (req, res) => {
    try {
      const reenvio = dbReenvios
        .prepare("SELECT * FROM reenvios_historico WHERE id=?")
        .get(req.params.id);
      
      if (!reenvio) {
        return res.status(404).json({ error: "Reenvío histórico no encontrado" });
      }

      if (!reenvio.paqueteria || !reenvio.guia) {
        return res.json({ 
          ok: false,
          error: "Faltan datos de paquetería o guía",
          tieneInfo: false
        });
      }

      // Rastrear el paquete
      const resultado = await rastrearPaquete(reenvio.paqueteria, reenvio.guia);
      
      if (!resultado.tieneInfo) {
        return res.json({
          ok: false,
          mensaje: "No se pudo obtener información del rastreo",
          resultado,
          tieneInfo: false
        });
      }

      // Mapear estados de la paquetería a estados del sistema - SER MÁS PRECISO
      const estadoAnterior = reenvio.estatus || "Desconocido";
      let nuevoEstado = estadoAnterior;
      
      // PRIORIDAD 1: Verificar si el estadoOriginal contiene "ENTREGADO" o "DELIVERED"
      // Esto es más confiable que confiar solo en el estado detectado
      const estadoOriginalUpper = (resultado.estadoOriginal || "").toUpperCase();
      const tieneEntregadoEnOriginal = estadoOriginalUpper.includes("ENTREGADO") || 
                                       estadoOriginalUpper.includes("DELIVERED");
      
      // Si el estadoOriginal contiene "ENTREGADO" o "DELIVERED", siempre es entregado
      if (tieneEntregadoEnOriginal) {
        nuevoEstado = "Entregado";
      } else if (resultado.estado === "Entregado") {
        // Si el resultado es "Entregado", siempre actualizar a "Entregado"
        nuevoEstado = "Entregado";
      } else if (resultado.estado === "En tránsito" || resultado.estado === "En camino") {
        nuevoEstado = "En tránsito";
      } else if (resultado.estado === "Enviado" && estadoAnterior === "Listo para enviar") {
        nuevoEstado = "Enviado";
      } else if (resultado.estado === "En proceso") {
        // Si está "En proceso", mantener el estado actual (no cambiar)
        nuevoEstado = estadoAnterior;
      }

      // Actualizar estado en histórico (aunque sea histórico, podemos actualizar el estatus)
      if (nuevoEstado !== estadoAnterior) {
        dbReenvios
          .prepare("UPDATE reenvios_historico SET estatus=? WHERE id=?")
          .run(nuevoEstado, req.params.id);

        registrarAccion({
          usuario: req.user?.name || "Sistema",
          accion: "VERIFICAR_ESTADO_REENVIO_HISTORICO",
          detalle: `ID Histórico ${req.params.id}: ${estadoAnterior} → ${nuevoEstado} (verificación automática)`,
          tabla: "reenvios_historico",
          registroId: req.params.id,
        });

        getIO().emit("reenvios_actualizados");
        getIO().emit("reportes_actualizados");
      }

      res.json({
        ok: true,
        estadoAnterior,
        estadoNuevo: nuevoEstado,
        actualizado: nuevoEstado !== estadoAnterior,
        resultado: {
          ...resultado,
          estadoOriginal: resultado.estadoOriginal || resultado.estado,
          estadoDetectado: resultado.estado,
          ubicacion: resultado.ubicacion || "No disponible",
          fecha: resultado.fecha || null,
          detalles: resultado.detalles || []
        },
        tieneInfo: true
      });
    } catch (err) {
      console.error("Error verificando estado histórico:", err);
      res.status(500).json({ error: "Error verificando estado" });
    }
  }
);

// ============================================================
// OBTENER REENVÍO HISTÓRICO POR ID
// IMPORTANTE: Esta ruta genérica debe ir DESPUÉS de las rutas específicas
// ============================================================
router.get("/historico/:id", requierePermiso("tab:reenvios"), (req, res) => {
  try {
    const reenvio = dbReenvios
      .prepare("SELECT * FROM reenvios_historico WHERE id = ?")
      .get(req.params.id);
    
    if (!reenvio) {
      return res.status(404).json({ error: "Reenvío histórico no encontrado" });
    }
    
    res.json(reenvio);
  } catch (err) {
    console.error("Error obteniendo reenvío histórico:", err);
    res.status(500).json({ error: "Error obteniendo reenvío histórico" });
  }
});

// ============================================================
// REPORTES
// ============================================================
router.get("/reportes", requierePermiso("tab:rep_reenvios"), (req, res) => {
  const rows = dbReenvios
    .prepare(
      `
        SELECT fechaCorte AS fecha,
               COUNT(*) AS total_envios,
               SUM(evidencia_count) AS total_fotos,
               strftime('%Y-%m', fechaCorte) AS mes
        FROM reenvios_historico
        GROUP BY fechaCorte
        ORDER BY fechaCorte DESC
      `
    )
    .all();

  const map = {};
  rows.forEach((r) => {
    if (!map[r.mes]) map[r.mes] = [];
    map[r.mes].push({
      fecha: r.fecha,
      total_envios: r.total_envios,
      total_fotos: r.total_fotos ?? 0,
    });
  });

  res.json(map);
});

// Día completo
router.get("/dia/:fecha", requierePermiso("tab:rep_reenvios"), (req, res) => {
  const rows = dbReenvios
    .prepare(
      `SELECT * FROM reenvios_historico
         WHERE fechaCorte=?
         ORDER BY id ASC`
    )
    .all(req.params.fecha);

  // Agregar fotos a cada registro
  const rowsConFotos = rows.map((row) => {
    let fotosUrls = [];
    
    // Primero intentar buscar en la tabla principal (si el reenvío aún existe)
    const reenvioOriginal = dbReenvios
      .prepare("SELECT id FROM reenvios WHERE pedido = ? LIMIT 1")
      .get(row.pedido);
    
    if (reenvioOriginal) {
      // Reenvío aún existe, buscar fotos en tabla principal
      const fotos = dbReenvios
        .prepare("SELECT archivo FROM reenvios_fotos WHERE reenvio_id = ?")
        .all(reenvioOriginal.id);
      
      const nombrePedido = (row.pedido || String(reenvioOriginal.id))
        .replace(/[<>:"/\\|?*]/g, '_')
        .trim();
      
      fotosUrls = fotos.map((f) => {
        // Intentar primero con nombre de pedido
        const fotoPathPedido = path.join(process.cwd(), "uploads", "reenvios", nombrePedido, f.archivo);
        if (fs.existsSync(fotoPathPedido)) {
          return `${req.protocol}://${req.get("host")}/reenvios/foto/${reenvioOriginal.id}/${f.archivo}`;
        }
        // Si no existe, usar la ruta con ID (compatibilidad)
        return `${req.protocol}://${req.get("host")}/reenvios/foto/${reenvioOriginal.id}/${f.archivo}`;
      });
    } else {
      // Reenvío ya no existe, buscar fotos en histórico
      try {
        const fotosHist = dbReenvios
          .prepare(
            `SELECT archivo FROM reenvios_fotos_hist 
             WHERE pedido = ? AND fecha_cierre = ?`
          )
          .all(row.pedido, row.fechaCorte);
        
        // Buscar el ID original en la carpeta de uploads
        // Las fotos están en uploads/reenvios/{nombrePedido}/{archivo} o uploads/reenvios/{id}/{archivo}
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
              let fotoEncontrada = false;
              for (const carpeta of carpetas) {
                const carpetaPath = path.join(uploadsDir, carpeta);
                const fotoPath = path.join(carpetaPath, foto.archivo);
                if (fs.existsSync(fotoPath)) {
                  fotosUrls.push(
                    `${req.protocol}://${req.get("host")}/uploads/reenvios/${encodeURIComponent(carpeta)}/${foto.archivo}`
                  );
                  fotoEncontrada = true;
                  break; // Encontramos esta foto, pasar a la siguiente
                }
              }
              if (!fotoEncontrada) {
                console.warn(`⚠️ Foto no encontrada: ${foto.archivo} para pedido ${row.pedido}`);
              }
            }
          }
        }
      } catch (e) {
        console.warn("⚠️ Error obteniendo fotos históricas de reenvíos:", e.message);
      }
    }

    return {
      ...row,
      fotos: fotosUrls,
    };
  });

  res.json(rowsConFotos);
});

// Exportar día
router.get(
  "/exportar-dia/:fecha",
  requierePermiso("tab:rep_reenvios"),   // Acceso a reportes de reenvíos
  async (req, res) => {
    const fecha = req.params.fecha;

    const rows = dbReenvios
      .prepare(
        `SELECT * FROM reenvios_historico
         WHERE fechaCorte=?
         ORDER BY id ASC`
      )
      .all(fecha);

    if (!rows.length) return res.status(404).json({ error: "Sin registros" });

    const ExcelJS = (await import("exceljs")).default;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`Día_${fecha}`);

    ws.columns = [
      { header: "Pedido", key: "pedido", width: 20 },
      { header: "Paquetería", key: "paqueteria", width: 15 },
      { header: "Guía", key: "guia", width: 25 },
      { header: "Estatus", key: "estatus", width: 20 },
      { header: "Observaciones", key: "observaciones", width: 40 },
      { header: "Fecha", key: "fecha", width: 12 },
      { header: "Hora", key: "hora", width: 12 },
    ];

    ws.addRows(rows);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Reenvios_${fecha}.xlsx`
    );

    await wb.xlsx.write(res);
    res.end();
  }
);

// Exportar mes
router.get(
  "/exportar-mes/:mes",
  requierePermiso("tab:rep_reenvios"),   // Acceso a reportes de reenvíos
  async (req, res) => {
    const mes = req.params.mes;

    const rows = dbReenvios
      .prepare(
        `SELECT * FROM reenvios_historico
         WHERE fechaCorte LIKE ?
         ORDER BY fechaCorte ASC, id ASC`
      )
      .all(`${mes}%`);

    if (!rows.length)
      return res.status(404).json({ error: "Sin registros de ese mes" });

    const ExcelJS = (await import("exceljs")).default;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`Mes_${mes}`);

    ws.columns = [
      { header: "Fecha", key: "fechaCorte", width: 12 },
      { header: "Pedido", key: "pedido", width: 20 },
      { header: "Paquetería", key: "paqueteria", width: 15 },
      { header: "Guía", key: "guia", width: 25 },
      { header: "Estatus", key: "estatus", width: 20 },
      { header: "Observaciones", key: "observaciones", width: 40 },
      { header: "Hora", key: "hora", width: 12 },
    ];

    ws.addRows(rows);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Reenvios_Mes_${mes}.xlsx`
    );

    await wb.xlsx.write(res);
    res.end();
  }
);

// Mover día de reporte
router.put(
  "/reportes/mover-dia",
  requierePermiso("tab:rep_reenvios"),
  (req, res) => {
    const { fecha_original, nueva_fecha } = req.body || {};
    if (!fecha_original || !nueva_fecha) {
      return res.status(400).json({ error: "Faltan datos" });
    }

    const existe = dbReenvios
      .prepare(
        "SELECT 1 FROM reenvios_historico WHERE fechaCorte=? LIMIT 1"
      )
      .get(nueva_fecha);

    if (existe) {
      return res.status(409).json({
        error: `Ya existe un reporte en ${nueva_fecha}. Elige otra fecha.`,
      });
    }

    const info = dbReenvios
      .prepare(
        "UPDATE reenvios_historico SET fechaCorte=? WHERE fechaCorte=?"
      )
      .run(nueva_fecha, fecha_original);

    // También actualizar las fotos históricas
    try {
      dbReenvios
        .prepare(
          "UPDATE reenvios_fotos_hist SET fecha_cierre=? WHERE fecha_cierre=?"
        )
        .run(nueva_fecha, fecha_original);
    } catch (e) {
      console.warn("⚠️ Error actualizando fotos históricas:", e.message);
    }

    res.json({
      success: true,
      modificados: info.changes,
      mensaje: `Reporte movido de ${fecha_original} a ${nueva_fecha}`,
    });
  }
);

// Borrar día completo del histórico
router.delete(
  "/reportes/borrar-dia",
  requierePermiso("tab:rep_reenvios"),
  (req, res) => {
    const { fecha } = req.body || {};
    if (!fecha) {
      return res.status(400).json({ error: "Falta la fecha" });
    }

    try {
      // Eliminar fotos históricas del día
      try {
        dbReenvios
          .prepare("DELETE FROM reenvios_fotos_hist WHERE fecha_cierre = ?")
          .run(fecha);
      } catch (e) {
        console.warn("⚠️ Error eliminando fotos históricas:", e.message);
      }

      // Eliminar registros del histórico
      const info = dbReenvios
        .prepare("DELETE FROM reenvios_historico WHERE fechaCorte = ?")
        .run(fecha);

      registrarAccion({
        usuario: req.user?.name,
        accion: "BORRAR_DIA_REENVIOS",
        detalle: `Fecha: ${fecha}, Registros eliminados: ${info.changes}`,
        tabla: "reenvios_historico",
        registroId: null,
      });

      // Emitir eventos de socket
      const io = getIO();
      io.emit("reenvios_actualizados");
      io.emit("reportes_actualizados");

      res.json({
        success: true,
        eliminados: info.changes,
        mensaje: `Día ${fecha} eliminado correctamente`,
      });
    } catch (e) {
      console.error("❌ Error borrando día:", e);
      res.status(500).json({ error: "Error al borrar el día", details: e.message });
    }
  }
);

// ============================================================
// ACCESO MÓVIL PARA SUBIR FOTOS
// ============================================================

// POST - Generar token temporal para acceso móvil
router.post(
  "/:id/mobile-token",
  requierePermiso("tab:reenvios"),
  (req, res) => {
    try {
      const reenvioId = parseInt(req.params.id);
      const usuarioId = req.user?.id;

      // Verificar que el reenvío existe
      const reenvio = dbReenvios
        .prepare("SELECT id, pedido FROM reenvios WHERE id = ?")
        .get(reenvioId);

      if (!reenvio) {
        return res.status(404).json({ error: "Reenvío no encontrado" });
      }

      // Generar token único
      const token = crypto.randomBytes(32).toString("hex");
      
      // Token expira en 5 minutos
      const expiraEn = dayjs().add(5, "minutes").format("YYYY-MM-DD HH:mm:ss");

      // Guardar token en BD
      dbUsers
        .prepare(`
          INSERT INTO mobile_upload_tokens (token, tipo, registro_id, usuario_id, expira_en)
          VALUES (?, 'reenvio', ?, ?, ?)
        `)
        .run(token, reenvioId, usuarioId || null, expiraEn);

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
      
      const mobileUrl = `${protocol}://${host}/reenvios/mobile/upload/${token}`;

      res.json({
        ok: true,
        token,
        mobileUrl,
        expiraEn,
        pedido: reenvio.pedido,
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

    // Obtener info del reenvío
    const reenvio = dbReenvios
      .prepare("SELECT id, pedido FROM reenvios WHERE id = ?")
      .get(tokenData.registro_id);

    if (!reenvio) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reenvío no encontrado</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
            .error { color: #d32f2f; }
          </style>
        </head>
        <body>
          <h1 class="error">❌ Reenvío no encontrado</h1>
        </body>
        </html>
      `);
    }

    // Enviar página HTML móvil
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>Subir fotos - ${reenvio.pedido}</title>
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
          <div class="pedido-info">Pedido: <strong>${reenvio.pedido}</strong></div>
          
          <div class="upload-area" id="uploadArea">
            <div class="upload-icon">📷</div>
            <div class="upload-text">Toca para tomar o seleccionar fotos</div>
            <div class="upload-hint">Máximo 5 fotos</div>
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
          const maxFiles = 5;

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
              img.alt = 'Foto ' + (index + 1);
              
              // Generar preview compatible (DataURL primero, fallback a ObjectURL)
              const reader = new FileReader();
              reader.onload = () => {
                img.dataset.previewSource = 'data';
                img.src = reader.result;
              };
              reader.onerror = () => {
                try {
                  img.dataset.previewSource = 'object';
                  img.dataset.objectUrl = URL.createObjectURL(file);
                  img.src = img.dataset.objectUrl;
                } catch (_) {
                  img.dataset.previewSource = 'error';
                  img.src = '';
                }
              };
              reader.readAsDataURL(file);

              img.onerror = function() {
                // Si DataURL falló, intentar ObjectURL como fallback
                if (this.dataset.previewSource === 'data') {
                  try {
                    this.dataset.previewSource = 'object';
                    this.dataset.objectUrl = URL.createObjectURL(file);
                    this.src = this.dataset.objectUrl;
                    return;
                  } catch (_) {}
                }
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
                if (img.dataset.objectUrl) {
                  URL.revokeObjectURL(img.dataset.objectUrl);
                }
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
              formData.append('fotos', file);
            });

            try {
              const response = await fetch('/reenvios/mobile/upload/' + token, {
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
  uploadMobile.array("fotos", 5),
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

      // Verificar que el reenvío existe
      const reenvio = dbReenvios
        .prepare("SELECT id, pedido FROM reenvios WHERE id = ?")
        .get(tokenData.registro_id);

      if (!reenvio) {
        return res.status(404).json({ error: "Reenvío no encontrado" });
      }

      // Guardar fotos
      const stmt = dbReenvios.prepare(
        "INSERT INTO reenvios_fotos (reenvio_id, tipo, archivo, fecha, hora) VALUES (?, 'evidencia', ?, ?, ?)"
      );

      for (const f of files) {
        stmt.run(
          tokenData.registro_id,
          f.filename,
          dayjs().format("YYYY-MM-DD"),
          dayjs().format("HH:mm:ss")
        );
      }

      dbReenvios
        .prepare("UPDATE reenvios SET evidencia_count = evidencia_count + ? WHERE id=?")
        .run(files.length, tokenData.registro_id);

      // Marcar token como usado (opcional, podríamos permitir múltiples usos)
      // dbUsers.prepare("UPDATE mobile_upload_tokens SET usado = 1 WHERE token = ?").run(token);

      // Emitir evento de socket para sincronización en tiempo real
      getIO().emit("reenvios_actualizados");

      res.json({ ok: true, count: files.length });
    } catch (err) {
      console.error("Error subiendo fotos desde móvil:", err);
      res.status(500).json({ error: "Error subiendo fotos" });
    }
  }
);

// Endpoint para recibir logs del OCR desde el cliente
router.post("/ocr-log", (req, res) => {
  const { nivel, mensaje, datos } = req.body;
  
  // Mostrar en consola del servidor con formato
  const timestamp = new Date().toLocaleTimeString('es-MX');
  const icono = nivel === 'error' ? '❌' : nivel === 'warn' ? '⚠️' : nivel === 'info' ? 'ℹ️' : '📝';
  
  console.log(`\n${icono} [OCR] [${timestamp}] ${mensaje}`);
  if (datos) {
    console.log(`   Datos:`, datos);
  }
  
  res.json({ ok: true });
});

// ============================================================
// OBTENER HISTORIAL DE ESTADOS DE UN REENVÍO
// ============================================================
router.get("/:id/historial", requierePermiso("tab:reenvios"), (req, res) => {
  try {
    const historial = dbReenvios
      .prepare(
        `SELECT * FROM reenvios_estados_historial 
         WHERE reenvio_id = ? 
         ORDER BY fecha DESC, hora DESC`
      )
      .all(req.params.id);
    
    res.json(historial);
  } catch (err) {
    console.error("Error obteniendo historial:", err);
    res.status(500).json({ error: "Error obteniendo historial" });
  }
});

// ============================================================
// OBTENER ENLACE DE RASTREO
// ============================================================
router.get("/:id/rastreo", requierePermiso("tab:reenvios"), (req, res) => {
  try {
    const reenvio = dbReenvios
      .prepare("SELECT paqueteria, guia FROM reenvios WHERE id = ?")
      .get(req.params.id);
    
    if (!reenvio) {
      return res.status(404).json({ error: "Reenvío no encontrado" });
    }
    
    const enlace = generarEnlaceRastreo(reenvio.paqueteria, reenvio.guia);
    
    res.json({
      ok: true,
      enlace,
      paqueteria: reenvio.paqueteria,
      guia: reenvio.guia,
      tieneEnlace: !!enlace
    });
  } catch (err) {
    console.error("Error obteniendo enlace de rastreo:", err);
    res.status(500).json({ error: "Error obteniendo enlace de rastreo" });
  }
});

// ============================================================
// ACTUALIZAR ESTADO CON OBSERVACIÓN (endpoint mejorado)
// ============================================================
router.put(
  "/:id/estado",
  requierePermiso("tab:reenvios"),
  (req, res) => {
    try {
      const { estado, observacion } = req.body;
      const estatus = normalizaEstatus(estado);
      
      if (!estatus) {
        return res.status(400).json({ error: "Estado inválido" });
      }

      // Obtener estado anterior
      const reenvio = dbReenvios
        .prepare("SELECT estatus FROM reenvios WHERE id=?")
        .get(req.params.id);
      
      if (!reenvio) {
        return res.status(404).json({ error: "Reenvío no encontrado" });
      }
      
      const estadoAnterior = reenvio.estatus;

      // Actualizar estado
      dbReenvios
        .prepare("UPDATE reenvios SET estatus=? WHERE id=?")
        .run(estatus, req.params.id);

      // Registrar en historial
      registrarCambioEstado(
        req.params.id,
        estadoAnterior,
        estatus,
        req.user?.name || "Sistema",
        observacion || null
      );

      registrarAccion({
        usuario: req.user?.name,
        accion: "CAMBIAR_ESTADO_REENVIO",
        detalle: `ID ${req.params.id}: ${estadoAnterior} → ${estatus}${observacion ? ` - ${observacion}` : ''}`,
        tabla: "reenvios",
        registroId: req.params.id,
      });

      getIO().emit("reenvios_actualizados");
      getIO().emit("reportes_actualizados");

      res.json({ ok: true, estado: estatus });
    } catch (err) {
      console.error("Error actualizando estado:", err);
      res.status(500).json({ error: "Error actualizando estado" });
    }
  }
);

// ============================================================
// VERIFICAR Y ACTUALIZAR ESTADO DESDE PAQUETERÍA
// ============================================================
router.post(
  "/:id/verificar-estado",
  requierePermiso("tab:reenvios"),
  async (req, res) => {
    try {
      const reenvio = dbReenvios
        .prepare("SELECT * FROM reenvios WHERE id=?")
        .get(req.params.id);
      
      if (!reenvio) {
        return res.status(404).json({ error: "Reenvío no encontrado" });
      }

      if (!reenvio.paqueteria || !reenvio.guia) {
        return res.status(400).json({ 
          error: "Faltan datos de paquetería o guía",
          tieneInfo: false
        });
      }

      // Rastrear el paquete
      const resultado = await rastrearPaquete(reenvio.paqueteria, reenvio.guia);
      
      if (!resultado.tieneInfo) {
        return res.json({
          ok: false,
          mensaje: "No se pudo obtener información del rastreo",
          resultado,
          tieneInfo: false
        });
      }

      // Mapear estados de la paquetería a estados del sistema - SER MÁS PRECISO
      const estadoAnterior = reenvio.estatus;
      let nuevoEstado = estadoAnterior;
      
      // PRIORIDAD 1: Verificar si el estadoOriginal contiene "ENTREGADO" o "DELIVERED"
      // Esto es más confiable que confiar solo en el estado detectado
      const estadoOriginalUpper = (resultado.estadoOriginal || "").toUpperCase();
      const tieneEntregadoEnOriginal = estadoOriginalUpper.includes("ENTREGADO") || 
                                       estadoOriginalUpper.includes("DELIVERED");
      
      // Si el estadoOriginal contiene "ENTREGADO" o "DELIVERED", siempre es entregado
      if (tieneEntregadoEnOriginal) {
        nuevoEstado = "Entregado";
      } else if (resultado.estado === "Entregado") {
        // Si el resultado es "Entregado", siempre actualizar a "Entregado"
        nuevoEstado = "Entregado";
      } else if (resultado.estado === "En tránsito" || resultado.estado === "En camino") {
        nuevoEstado = "En tránsito";
      } else if (resultado.estado === "Enviado" && estadoAnterior === "Listo para enviar") {
        nuevoEstado = "Enviado";
      } else if (resultado.estado === "En proceso") {
        // Si está "En proceso", mantener el estado actual (no cambiar)
        nuevoEstado = estadoAnterior;
      }

      // Solo actualizar si el estado cambió
      if (nuevoEstado !== estadoAnterior) {
        dbReenvios
          .prepare("UPDATE reenvios SET estatus=? WHERE id=?")
          .run(nuevoEstado, req.params.id);

        // Registrar en historial
        const observacion = `Verificación automática: ${resultado.estadoOriginal || resultado.estado}${resultado.ubicacion ? ` - ${resultado.ubicacion}` : ''}`;
        registrarCambioEstado(
          req.params.id,
          estadoAnterior,
          nuevoEstado,
          req.user?.name || "Sistema",
          observacion
        );

        registrarAccion({
          usuario: req.user?.name || "Sistema",
          accion: "VERIFICAR_ESTADO_REENVIO",
          detalle: `ID ${req.params.id}: ${estadoAnterior} → ${nuevoEstado} (verificación automática)`,
          tabla: "reenvios",
          registroId: req.params.id,
        });

        getIO().emit("reenvios_actualizados");
        getIO().emit("reportes_actualizados");
      }

      res.json({
        ok: true,
        estadoAnterior,
        estadoNuevo: nuevoEstado,
        actualizado: nuevoEstado !== estadoAnterior,
        resultado,
        tieneInfo: true
      });
    } catch (err) {
      console.error("Error verificando estado:", err);
      res.status(500).json({ 
        error: "Error verificando estado",
        detalle: err.message,
        tieneInfo: false
      });
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
