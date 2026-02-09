// src/rutas/picking.js
import express from "express";
import dayjs from "dayjs";
import crypto from "crypto";
import { dbDia, dbInv, dbHist, dbDevol } from "../config/baseDeDatos.js";
import { getIO } from "../config/socket.js";
import { getFechaActual, setFechaActual } from "../utilidades/estado.js";

// ⭐ AGREGADO (sin modificar nada tuyo)
import { requierePermiso, tienePermiso } from "../middleware/permisos.js";
import { permit, authRequired, verifyPassword } from "../middleware/autenticacion.js";
import { registrarAccion } from "../utilidades/auditoria.js";
import { dbUsers } from "../config/baseDeDatos.js";

// ============================================================
// TIPOS DE DEVOLUCIONES (IXORA) — NECESARIO PARA cerrar-dia
// ============================================================
const DEV_TIPOS = {
  clientes: {
    tablaDia: "devoluciones_clientes",
    tablaHist: "devoluciones_clientes_hist",
  },
  calidad: {
    tablaDia: "devoluciones_calidad",
    tablaHist: "devoluciones_calidad_hist",
  },
  reacondicionados: {
    tablaDia: "devoluciones_reacondicionados",
    tablaHist: "devoluciones_reacondicionados_hist",
  },
  retail: {
    tablaDia: "devoluciones_retail",
    tablaHist: "devoluciones_retail_hist",
  },
  cubbo: {
    tablaDia: "devoluciones_cubbo",
    tablaHist: "devoluciones_cubbo_hist",
  },
  regulatorio: {
    tablaDia: "devoluciones_regulatorio",
    tablaHist: "devoluciones_regulatorio_hist",
  },
};

// Función para obtener las tablas correctas
function getTablasDevoluciones(tipo) {
  return DEV_TIPOS[tipo] || null;
}

const parseActivoValue = (value, fallback = 0) => {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value ? 1 : 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true") return 1;
    if (normalized === "0" || normalized === "false") return 0;
  }
  return fallback ? 1 : 0;
};

const normalizeLoteValue = (value) => {
  const trimmed = (value ?? "").toString().trim();
  return trimmed.length ? trimmed : null;
};

const router = express.Router();

// Log para verificar que el router se carga

const CANALES_VALIDOS = new Set(["picking", "retail", "fulfillment"]);
const normalizarCanal = (value) => {
  const canal = (value || "").toString().trim().toLowerCase();
  if (CANALES_VALIDOS.has(canal)) return canal;
  return "picking";
};

/* ============================================================
   PRODUCTOS DEL DÍA
   ============================================================ */

router.get("/productos", (_req, res) => {
  const canalParam = _req.query?.canal;
  if (canalParam === "all") {
    res.json(dbDia.prepare("SELECT * FROM productos").all());
    return;
  }
  const canal = normalizarCanal(canalParam);
  res.json(dbDia.prepare("SELECT * FROM productos WHERE canal=?").all(canal));
});

router.get("/surtido/tiempo/:codigo", (req, res) => {
  const row = dbDia
    .prepare("SELECT ultimo_surtido FROM surtidos_tiempo WHERE codigo=?")
    .get(req.params.codigo);

  if (!row) return res.json({ minutos: null });

  const minutos = Math.floor((Date.now() - row.ultimo_surtido) / 60000);
  res.json({ minutos });
});

router.get("/productos/existe/:codigo", (req, res) => {
  const codigoEscaneado = req.params.codigo;
  const canal = normalizarCanal(req.query?.canal);
  
  // Buscar por código exacto
  let producto = dbDia
    .prepare("SELECT id, surtido, hora_solicitud, hora_surtido FROM productos WHERE codigo=? AND canal=? LIMIT 1")
    .get(codigoEscaneado, canal);
  
  // Si no se encuentra, verificar si es un alias
  if (!producto) {
    const alias = dbInv
      .prepare(`SELECT codigo_principal FROM codigos_alias WHERE codigo_extra=?`)
      .get(codigoEscaneado);
    
    if (alias?.codigo_principal) {
      // Buscar productos con el código principal
      producto = dbDia
        .prepare("SELECT id, surtido, hora_solicitud, hora_surtido FROM productos WHERE codigo=? AND canal=? LIMIT 1")
        .get(alias.codigo_principal, canal);
      
      // Si no se encuentra, buscar por codigo_principal
      if (!producto) {
        producto = dbDia
          .prepare("SELECT id, surtido, hora_solicitud, hora_surtido FROM productos WHERE codigo_principal=? AND canal=? LIMIT 1")
          .get(alias.codigo_principal, canal);
      }
    } else {
      // El código escaneado es un código principal, buscar productos que lo tengan como codigo_principal
      producto = dbDia
        .prepare("SELECT id, surtido, hora_solicitud, hora_surtido FROM productos WHERE codigo_principal=? AND canal=? LIMIT 1")
        .get(codigoEscaneado, canal);
      
      // Si no se encuentra, buscar productos que sean alias de este código principal
      if (!producto) {
        const todosProductos = dbDia
          .prepare("SELECT id, surtido, hora_solicitud, hora_surtido, codigo FROM productos WHERE canal=?")
          .all(canal);
        for (const prod of todosProductos) {
          const aliasDelProd = dbInv
            .prepare(`SELECT codigo_principal FROM codigos_alias WHERE codigo_extra=?`)
            .get(prod.codigo);
          
          if (aliasDelProd?.codigo_principal === codigoEscaneado) {
            producto = prod;
            break;
          }
        }
      }
    }
  }
  
  if (!producto) {
    return res.json({ existe: false, surtido: false, hora_solicitud: null, hora_surtido: null });
  }
  
  res.json({ 
    existe: true, 
    surtido: producto.surtido === 1,
    hora_solicitud: producto.hora_solicitud || null,
    hora_surtido: producto.hora_surtido || null
  });
});

// Endpoint para obtener productos NO disponibles del día
// Muestra todos los productos marcados como no disponible (cambio de lote, agotados, etc.)
router.get("/productos/no-disponibles", (req, res) => {
  try {
    const canal = normalizarCanal(req.query?.canal);
    const productos = dbDia
      .prepare("SELECT * FROM productos WHERE disponible = 0 AND canal = ? ORDER BY hora_solicitud DESC")
      .all(canal);
    res.json(productos);
  } catch (err) {
    console.error("Error obteniendo productos no disponibles:", err);
    res.status(500).json({ error: "Error obteniendo productos no disponibles" });
  }
});

// Endpoint para buscar producto del día por código o alias (para surtido)
// Retorna toda la información del código principal (lote, piezas_por_caja, presentación, etc.)
router.get("/productos/buscar/:codigo", (req, res) => {
  const codigoEscaneado = (req.params.codigo || "").trim();
  const canal = normalizarCanal(req.query?.canal);
  if (!codigoEscaneado) {
    return res.status(400).json({ error: "Falta código" });
  }

  let codigoPrincipal = codigoEscaneado;
  let producto = null;

  // Primero buscar por código exacto
  producto = dbDia
    .prepare("SELECT * FROM productos WHERE codigo=? AND canal=? LIMIT 1")
    .get(codigoEscaneado, canal);

  // Si se encuentra, determinar el código principal
  if (producto) {
    // Si el producto tiene codigo_principal guardado, usarlo
    if (producto.codigo_principal) {
      codigoPrincipal = producto.codigo_principal;
    } else {
      // Verificar si el código del producto es un alias
      const aliasDelProducto = dbInv
        .prepare(`SELECT codigo_principal FROM codigos_alias WHERE codigo_extra=?`)
        .get(producto.codigo);
      if (aliasDelProducto?.codigo_principal) {
        codigoPrincipal = aliasDelProducto.codigo_principal;
      } else {
        // El código del producto es el código principal
        codigoPrincipal = producto.codigo;
      }
    }
  } else {
    // Si no se encuentra por código exacto, verificar si el código escaneado es un alias
    const alias = dbInv
      .prepare(`SELECT codigo_principal FROM codigos_alias WHERE codigo_extra=?`)
      .get(codigoEscaneado);

    if (alias?.codigo_principal) {
      codigoPrincipal = alias.codigo_principal;
      
      // Buscar productos que tengan el código principal como código
      producto = dbDia
        .prepare("SELECT * FROM productos WHERE codigo=? AND canal=? LIMIT 1")
        .get(codigoPrincipal, canal);
      
      // Si no se encuentra, buscar productos que tengan codigo_principal igual al código principal
      if (!producto) {
        producto = dbDia
          .prepare("SELECT * FROM productos WHERE codigo_principal=? AND canal=? LIMIT 1")
          .get(codigoPrincipal, canal);
      }
      
      // Si aún no se encuentra, buscar productos que sean alias del mismo código principal
      if (!producto) {
        const todosProductos = dbDia
          .prepare("SELECT * FROM productos WHERE canal=?")
          .all(canal);
        for (const prod of todosProductos) {
          // Verificar si este producto es un alias del código principal
          const aliasDelProd = dbInv
            .prepare(`SELECT codigo_principal FROM codigos_alias WHERE codigo_extra=?`)
            .get(prod.codigo);
          
          if (aliasDelProd?.codigo_principal === codigoPrincipal) {
            producto = prod;
            break;
          }
          
          // También verificar si el producto tiene codigo_principal guardado
          if (prod.codigo_principal === codigoPrincipal) {
            producto = prod;
            break;
          }
        }
      }
    } else {
      // El código escaneado es un código principal, buscar productos que lo tengan como código o codigo_principal
      codigoPrincipal = codigoEscaneado;
      
      // Buscar por código exacto (ya lo hicimos arriba, pero por si acaso)
      producto = dbDia
        .prepare("SELECT * FROM productos WHERE codigo=? AND canal=? LIMIT 1")
        .get(codigoPrincipal, canal);
      
      // Si no se encuentra, buscar productos que tengan este código como codigo_principal
      if (!producto) {
        producto = dbDia
          .prepare("SELECT * FROM productos WHERE codigo_principal=? AND canal=? LIMIT 1")
          .get(codigoPrincipal, canal);
      }
      
      // Si aún no se encuentra, buscar productos que sean alias de este código principal
      if (!producto) {
        const todosProductos = dbDia
          .prepare("SELECT * FROM productos WHERE canal=?")
          .all(canal);
        for (const prod of todosProductos) {
          const aliasDelProd = dbInv
            .prepare(`SELECT codigo_principal FROM codigos_alias WHERE codigo_extra=?`)
            .get(prod.codigo);
          
          if (aliasDelProd?.codigo_principal === codigoPrincipal) {
            producto = prod;
            break;
          }
        }
      }
    }
  }

  if (!producto) {
    return res.json({ encontrado: false, producto: null });
  }

  // Obtener información completa del inventario del código principal
  const infoInventario = dbInv
    .prepare(`
      SELECT codigo, nombre, presentacion, categoria, subcategoria, piezas_por_caja, COALESCE(activo,1) AS activo
      FROM productos_ref
      WHERE codigo=?
    `)
    .get(codigoPrincipal);

  // Obtener lote activo del código principal
  const loteActivo = dbInv
    .prepare(`SELECT lote FROM productos_lotes WHERE codigo_producto = ? AND activo = 1 LIMIT 1`)
    .get(codigoPrincipal);

  // Obtener todos los alias del código principal
  const todosAlias = dbInv
    .prepare(`SELECT codigo_extra FROM codigos_alias WHERE codigo_principal=?`)
    .all(codigoPrincipal);

  // Enriquecer el producto con toda la información del código principal
  // IMPORTANTE: NO sobrescribir el lote si el producto ya tiene uno asignado
  const productoEnriquecido = {
    ...producto,
    // Solo usar el lote del código principal si el producto NO tiene lote
    // Esto permite que se pueda asignar un lote diferente al del código principal
    lote: (producto.lote && producto.lote.trim()) ? producto.lote : (loteActivo?.lote || null),
    // Información del inventario del código principal (siempre usar la del principal si no está en el producto)
    presentacion: producto.presentacion || infoInventario?.presentacion || null,
    categoria: producto.categoria || infoInventario?.categoria || null,
    subcategoria: producto.subcategoria || infoInventario?.subcategoria || null,
    piezas_por_caja: producto.piezas_por_caja || infoInventario?.piezas_por_caja || 0,
    activo: infoInventario?.activo ?? 1,
    // Mantener el código original del producto (puede ser alias o principal)
    codigo_original: producto.codigo,
    // Agregar el código principal para referencia (importante para validaciones de lote)
    codigo_principal: codigoPrincipal,
    // Agregar todos los alias del código principal
    alias_codigos: todosAlias.map(a => a.codigo_extra),
  };

  res.json({ encontrado: true, producto: productoEnriquecido });
});

router.post(
  "/productos",
  requierePermiso("tab:escaneo"),   // Solo necesita acceso a escaneo
  (req, res) => {
    const { codigo, nombre, cajas, lote } = req.body || {};
    const canal = normalizarCanal(req.body?.canal);
    const hora_solicitud = dayjs().format("HH:mm:ss");

    let codigoReal = codigo;
    let esAlias = false;

    // Alias - verificar si el código escaneado es un alias
    const alias = dbInv
      .prepare(`SELECT codigo_principal FROM codigos_alias WHERE codigo_extra=?`)
      .get(codigo);

    if (alias?.codigo_principal) {
      codigoReal = alias.codigo_principal;
      esAlias = true;
    }

    // Obtener información completa del código principal desde inventario
    const infoInventario = dbInv
      .prepare(`
        SELECT codigo, nombre, presentacion, categoria, subcategoria, piezas_por_caja, COALESCE(activo,1) AS activo
        FROM productos_ref
        WHERE codigo=?
      `)
      .get(codigoReal);

    // ⚠️ Verificar si el producto está agotado (activo = 0)
    // Esto solo aplica cuando el producto fue marcado como "Agotado" (no con otros motivos)
    if (infoInventario && Number(infoInventario.activo ?? 1) === 0) {
      return res.status(400).json({ 
        error: "Producto agotado",
        mensaje: "Agotado",
        codigo: codigoReal
      });
    }

    // Usar nombre del inventario si está disponible (más completo)
    const nombreFinal = infoInventario?.nombre || nombre;

    // Lote - solo usar el del código principal si NO se proporcionó uno explícitamente
    // Esto permite que se pueda asignar un lote diferente al del código principal
    let loteFinal = lote ?? null;
    if (!loteFinal) {
      const loteActivo = dbInv
        .prepare(`SELECT lote FROM productos_lotes WHERE codigo_producto = ? AND activo = 1 LIMIT 1`)
        .get(codigoReal);
      loteFinal = loteActivo?.lote ?? null;
    }

    // Obtener información del código principal si está disponible
    const piezasPorCaja = infoInventario?.piezas_por_caja || 0;
    const presentacion = infoInventario?.presentacion || null;
    const categoria = infoInventario?.categoria || null;
    const subcategoria = infoInventario?.subcategoria || null;
    
    // Determinar si es de importación basándose en la categoría/subcategoría
    // Esto ayuda a mantener la columna importacion actualizada
    const esImportacion = categoria && (
      categoria.trim().toLowerCase() === "importación" ||
      categoria.trim().toLowerCase() === "importacion" ||
      categoria.trim().toLowerCase().includes("importación") ||
      categoria.trim().toLowerCase().includes("importacion") ||
      (subcategoria && ["Biodegradables", "Botellas", "Cuidado Personal", "Esencias", "Sport", "Velas"].includes(subcategoria.trim()))
    ) ? 1 : 0;

    // Verificar si las columnas existen antes de insertar (compatibilidad)
    try {
      const info = dbDia
        .prepare(
          `
        INSERT INTO productos (codigo,nombre,cajas,hora_solicitud,lote,piezas_por_caja,presentacion,categoria,subcategoria,codigo_principal,importacion,canal)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `
        )
        .run(codigo, nombreFinal, cajas, hora_solicitud, loteFinal, piezasPorCaja, presentacion, categoria, subcategoria, codigoReal, esImportacion, canal);
      
      const nuevo = dbDia
        .prepare("SELECT * FROM productos WHERE id=?")
        .get(info.lastInsertRowid);

      // Anti doble surtido
      try {
        if (codigo) {
          dbDia
            .prepare(
              `
            INSERT INTO surtidos_tiempo (codigo, ultimo_surtido)
            VALUES (?, ?)
            ON CONFLICT(codigo)
            DO UPDATE SET ultimo_surtido = excluded.ultimo_surtido
          `
            )
            .run(codigo, Date.now());
        }
      } catch (e) {}

      getIO().emit(
        "productos_actualizados",
        dbDia.prepare("SELECT * FROM productos").all()
      );

    // ⭐ AUDITORÍA AGREGADA
    registrarAccion({
      usuario: req.user,
      accion: "AGREGAR_PRODUCTO_DIA",
      detalle: `Agregó producto "${nombreFinal}"`,
      tabla: "productos",
      registroId: info.lastInsertRowid,
      cambios: {
        codigo: codigo + (esAlias ? ` [Alias de ${codigoReal}]` : ''),
        nombre: nombreFinal,
        cajas: cajas,
        lote: loteFinal || 'N/A',
        piezas_por_caja: piezasPorCaja
      }
    });

      return res.json(nuevo);
    } catch (e) {
      // Si falla por columnas faltantes, intentar sin presentacion/categoria/subcategoria pero con codigo_principal e importacion
      const info = dbDia
        .prepare(
          `
        INSERT INTO productos (codigo,nombre,cajas,hora_solicitud,lote,piezas_por_caja,codigo_principal,importacion,canal)
        VALUES (?,?,?,?,?,?,?,?,?)
      `
        )
        .run(codigo, nombreFinal, cajas, hora_solicitud, loteFinal, piezasPorCaja, codigoReal, esImportacion, canal);

      // Anti doble surtido
      try {
        if (codigo) {
          dbDia
            .prepare(
              `
            INSERT INTO surtidos_tiempo (codigo, ultimo_surtido)
            VALUES (?, ?)
            ON CONFLICT(codigo)
            DO UPDATE SET ultimo_surtido = excluded.ultimo_surtido
          `
            )
            .run(codigo, Date.now());
        }
      } catch (e2) {}

      getIO().emit(
        "productos_actualizados",
        dbDia.prepare("SELECT * FROM productos").all()
      );

      const nuevo = dbDia
        .prepare("SELECT * FROM productos WHERE id=?")
        .get(info.lastInsertRowid);

    // ⭐ AUDITORÍA AGREGADA
    registrarAccion({
      usuario: req.user,
      accion: "AGREGAR_PRODUCTO_DIA",
      detalle: `Agregó producto "${nombreFinal}"`,
      tabla: "productos",
      registroId: info.lastInsertRowid,
      cambios: {
        codigo: codigo + (esAlias ? ` [Alias de ${codigoReal}]` : ''),
        nombre: nombreFinal,
        cajas: cajas,
        lote: loteFinal || 'N/A',
        piezas_por_caja: piezasPorCaja
      }
    });

      res.json(nuevo);
    }
  }
);

router.put(
  "/productos/:id",
  requierePermiso("tab:registros"),   // Editar productos en registros
  (req, res) => {
    const { id } = req.params;
    const actual = dbDia.prepare("SELECT * FROM productos WHERE id=?").get(id);
    if (!actual) return res.status(404).json({ error: "No encontrado" });

    const {
      codigo,
      nombre,
      cajas,
      piezas,
      extras,
      piezas_por_caja,
      observaciones,
      surtido,
      disponible,
      lote,
    } = req.body || {};

    const hora_surtido =
      surtido === 1 && !actual.hora_surtido
        ? dayjs().format("HH:mm:ss")
        : actual.hora_surtido;

    dbDia
      .prepare(
        `
      UPDATE productos SET 
        codigo=?, nombre=?, cajas=?, piezas=?, extras=?, piezas_por_caja=?, 
        observaciones=?, surtido=?, disponible=?, lote=?, hora_surtido=?
      WHERE id=?
    `
      )
      .run(
        codigo ?? actual.codigo,
        nombre ?? actual.nombre,
        cajas ?? actual.cajas,
        piezas ?? actual.piezas,
        extras ?? actual.extras,
        piezas_por_caja ?? actual.piezas_por_caja,
        observaciones ?? actual.observaciones,
        typeof surtido === "number" ? surtido : actual.surtido,
        typeof disponible === "number" ? disponible : actual.disponible,
        lote ?? actual.lote,
        hora_surtido,
        id
      );

    if (
      (typeof surtido === "number" ? surtido : actual.surtido) === 1 &&
      actual.surtido !== 1
    ) {
      try {
        dbDia
          .prepare(
            `
          INSERT INTO surtidos_tiempo (codigo, ultimo_surtido)
          VALUES (?, ?)
          ON CONFLICT(codigo)
          DO UPDATE SET ultimo_surtido=excluded.ultimo_surtido
        `
          )
          .run(codigo ?? actual.codigo, Date.now());
      } catch (e) {}
    }

    const actualizado = dbDia
      .prepare("SELECT * FROM productos WHERE id=?")
      .get(id);

    getIO().emit("producto_actualizado", actualizado);

    // Obtener producto actualizado para auditoría
    const productoActualizado = dbDia.prepare("SELECT * FROM productos WHERE id=?").get(id);

    // ⭐ AUDITORÍA - Detectar cambios específicos
    const cambios = [];
    const campos = {
      codigo: 'Código',
      nombre: 'Nombre',
      cajas: 'Cajas',
      piezas: 'Piezas',
      extras: 'Extras',
      piezas_por_caja: 'Piezas por caja',
      observaciones: 'Observaciones',
      surtido: 'Surtido',
      disponible: 'Disponible',
      lote: 'Lote'
    };

    for (const [campo, nombreCampo] of Object.entries(campos)) {
      let valorAnterior = actual[campo];
      let valorNuevo = req.body[campo];
      
      // Manejar valores especiales
      if (campo === 'surtido' || campo === 'disponible') {
        valorAnterior = typeof valorAnterior === "number" ? valorAnterior : (valorAnterior ? 1 : 0);
        valorNuevo = req.body.hasOwnProperty(campo) 
          ? (typeof valorNuevo === "number" ? valorNuevo : (valorNuevo ? 1 : 0))
          : valorAnterior;
      } else {
        valorAnterior = valorAnterior ?? null;
        valorNuevo = req.body.hasOwnProperty(campo) ? (valorNuevo ?? null) : valorAnterior;
      }
      
      // Solo registrar si el valor cambió y se envió en el body
      if (req.body.hasOwnProperty(campo) && valorAnterior !== valorNuevo) {
        const anterior = valorAnterior === null || valorAnterior === '' ? '(vacío)' : valorAnterior;
        const nuevo = valorNuevo === null || valorNuevo === '' ? '(vacío)' : valorNuevo;
        cambios.push(`${nombreCampo}: "${anterior}" → "${nuevo}"`);
      }
    }

    const detalleCambios = cambios.length > 0 
      ? `Cambios: ${cambios.join(' | ')}`
      : 'Sin cambios detectados';

    // ⭐ AUDITORÍA AGREGADA
    registrarAccion({
      usuario: req.user,
      accion: "EDITAR_PRODUCTO_DIA",
      detalle: `Editó producto "${productoActualizado?.nombre || 'N/A'}" (Código: ${productoActualizado?.codigo || 'N/A'})`,
      tabla: "productos",
      registroId: id,
      cambios: cambios.length > 0 ? { cambios: cambios.join(' | ') } : null
    });

    res.json({ success: true });
  }
);

router.put(
  "/productos/:id/surtir",
  requierePermiso("tab:registros"),   // Surtir productos en registros
  (req, res) => {
    const { id } = req.params;
    const { piezas, cajas, lote, observaciones } = req.body || {};
    const hora = dayjs().format("HH:mm:ss");

    dbDia
      .prepare(
        `UPDATE productos SET piezas=?, cajas=?, lote=?, observaciones=?, surtido=1, hora_surtido=? WHERE id=?`
      )
      .run(piezas ?? 0, cajas ?? 0, lote ?? "", observaciones ?? "", hora, id);

    const actualizado = dbDia
      .prepare("SELECT * FROM productos WHERE id=?")
      .get(id);

    try {
      dbDia
        .prepare(
          `
        INSERT INTO surtidos_tiempo (codigo, ultimo_surtido)
        VALUES (?, ?)
        ON CONFLICT(codigo)
        DO UPDATE SET ultimo_surtido=excluded.ultimo_surtido
      `
        )
        .run(actualizado.codigo, Date.now());
    } catch (e) {}

    getIO().emit("producto_actualizado", actualizado);

    // ⭐ AUDITORÍA AGREGADA
    registrarAccion({
      usuario: req.user,
      accion: "SURTIR_PRODUCTO",
      detalle: `Surtió producto "${actualizado?.nombre || 'N/A'}"`,
      tabla: "productos",
      registroId: id,
      cambios: {
        codigo: actualizado?.codigo || 'N/A',
        piezas: piezas || 0,
        cajas: cajas || 0,
        lote: lote || 'N/A'
      }
    });

    res.json({ success: true });
  }
);
router.put(
  "/productos/:id/disponible",
  requierePermiso("tab:registros"),   // Acceso a registros
  (req, res) => {
    dbDia
      .prepare("UPDATE productos SET disponible=1 WHERE id=?")
      .run(req.params.id);

    const producto = dbDia
      .prepare("SELECT * FROM productos WHERE id=?")
      .get(req.params.id);

    getIO().emit("producto_actualizado", producto);

    // ⭐ AUDITORÍA
    registrarAccion({
      usuario: req.user,
      accion: "PRODUCTO_DISPONIBLE",
      detalle: `Marcó como disponible producto "${producto?.nombre || 'N/A'}"`,
      tabla: "productos",
      registroId: req.params.id,
      cambios: { codigo: producto?.codigo || 'N/A' }
    });

    res.json({ success: true });
  }
);

router.put(
  "/productos/:id/no-disponible",
  requierePermiso("tab:registros"),   // Acceso a registros
  (req, res) => {
    const { id } = req.params;
    const { motivo } = req.body;
    const actual = dbDia.prepare("SELECT * FROM productos WHERE id=?").get(id);

    // Reemplazar completamente las observaciones (no concatenar)
    // Solo guardar el motivo exacto que se envía, sin agregar nada más
    const nuevaObs = (motivo && motivo.trim()) ? motivo.trim() : "No disponible";

    dbDia
      .prepare(
        "UPDATE productos SET disponible=0, observaciones=? WHERE id=?"
      )
      .run(nuevaObs, id);

    const actualizado = dbDia
      .prepare("SELECT * FROM productos WHERE id=?")
      .get(id);

    // Si el motivo es "Agotado", desactivar el producto en inventario
    if (nuevaObs === "Agotado" && actualizado?.codigo) {
      try {
        // Convertir alias a código principal si es necesario
        let codigoReal = actualizado.codigo;
        const alias = dbInv
          .prepare(`SELECT codigo_principal FROM codigos_alias WHERE codigo_extra=?`)
          .get(actualizado.codigo);
        
        if (alias?.codigo_principal) {
          codigoReal = alias.codigo_principal;
        }

        // Obtener el producto en inventario por código
        const productoInv = dbInv
          .prepare("SELECT id FROM productos_ref WHERE codigo=?")
          .get(codigoReal);
        
        if (productoInv) {
          // Desactivar el producto en inventario
          dbInv
            .prepare("UPDATE productos_ref SET activo = 0 WHERE id = ?")
            .run(productoInv.id);
          
          getIO().emit("inventario_actualizado");
        }
      } catch (err) {
        // No fallar si no se puede actualizar inventario, solo loguear
        console.error("⚠️ Error desactivando producto en inventario:", err);
      }
    }

    getIO().emit("producto_actualizado", actualizado);

    // ⭐ NOTIFICACIÓN - Notificar SOLO cuando se marca como "Agotado" desde picking
    // Para "No surtido en rack" y "Cambio de lote" NO se envía notificación
    if (nuevaObs === "Agotado") {
      try {
        const usuarioActual = req.user?.name || req.user?.nickname || "Usuario";
        
        // Obtener todos los usuarios activos
        const usuarios = dbUsers
          .prepare(
            "SELECT id, nickname, name FROM users WHERE active = 1"
          )
          .all();

        const nombreProducto = actualizado?.nombre || actualizado?.codigo || "Producto";
        const codigoProducto = actualizado?.codigo || "N/A";
        const titulo = "⚠️ Producto Marcado Agotado";
        const mensaje = `${nombreProducto} (${codigoProducto}) ha sido marcado como agotado desde surtido de picking por ${usuarioActual}`;
        const tipo = "warning";

      // Notificar a todos los usuarios
      usuarios.forEach((u) => {
        try {
          const replyToken = crypto.randomBytes(16).toString("hex");
          const dataJson = JSON.stringify({
            tipo: "picking",
            producto_id: actualizado?.id,
            codigo: codigoProducto,
            motivo: nuevaObs
          });

          // Guardar notificación en BD
          const result = dbUsers.prepare(`
            INSERT INTO notificaciones 
            (usuario_id, titulo, mensaje, tipo, es_confirmacion, admin_only, reply_token, data)
            VALUES (?, ?, ?, ?, 0, 0, ?, ?)
          `).run(
            u.id,
            titulo,
            mensaje,
            tipo,
            replyToken,
            dataJson
          );

          // Enviar notificación en tiempo real vía Socket.IO
          try {
            const io = getIO();
            if (io && typeof io.emit === "function") {
              io.emit("nueva_notificacion", {
                userId: u.id,
                usuario_id: u.id,
                id: result.lastInsertRowid,
                titulo,
                mensaje,
                tipo,
                admin_only: false,
                data: JSON.parse(dataJson),
                timestamp: new Date().toISOString()
              });
            }
          } catch (err) {
            // Silent error handling
          }
        } catch (err) {
          // Silent error handling
        }
      });
      } catch (err) {
        // Silent error handling - no fallar si hay error en notificaciones
      }
    }

    // ⭐ AUDITORÍA
    registrarAccion({
      usuario: req.user,
      accion: "PRODUCTO_NO_DISPONIBLE",
      detalle: `Marcó como NO disponible producto "${actualizado?.nombre || 'N/A'}"`,
      tabla: "productos",
      registroId: id,
      cambios: { codigo: actualizado?.codigo || 'N/A', motivo: motivo || 'N/A' }
    });

    res.json({ success: true });
  }
);

router.delete(
  "/productos/:id/borrar",
  requierePermiso("tab:registros"),   // Borrar productos en registros
  (req, res) => {
    const { id } = req.params;
    
    // Obtener el producto ANTES de borrarlo (para validación y auditoría)
    const producto = dbDia.prepare("SELECT * FROM productos WHERE id=?").get(id);
    if (!producto) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }
    
    // Borrar el producto
    dbDia.prepare("DELETE FROM productos WHERE id=?").run(id);

    // Emitir evento de actualización
    getIO().emit(
      "productos_actualizados",
      dbDia.prepare("SELECT * FROM productos").all()
    );

    // ⭐ AUDITORÍA
    registrarAccion({
      usuario: req.user,
      accion: "BORRAR_PRODUCTO_DIA",
      detalle: `Eliminó producto "${producto?.nombre || 'N/A'}"`,
      tabla: "productos",
      registroId: id,
      cambios: { codigo: producto?.codigo || 'N/A' }
    });

    res.json({ success: true });
  }
);

/* ============================================================
   DEVOLUCIONES POR TIPO
   ============================================================ */

const handleCrearDevolucion = (req, res) => {
  const cfg = getTablasDevoluciones(req.params.tipo);
  if (!cfg)
    return res.status(400).json({ error: "Tipo de devolución inválido" });

  const { codigo, nombre, presentacion, lote, cantidad, activo, area } = req.body || {};
  const loteFinal = normalizeLoteValue(lote);
  const hora = dayjs().format("HH:mm:ss");
  const activoBD = parseActivoValue(activo, 0);

  // Para calidad, agregar columna area si no existe
  if (req.params.tipo === "calidad") {
    try {
      dbDia.exec(`ALTER TABLE ${cfg.tablaDia} ADD COLUMN area TEXT`);
    } catch (e) {
      // Columna ya existe, continuar
    }
  }

  const existente = dbDia
    .prepare(`SELECT * FROM ${cfg.tablaDia} WHERE codigo=? AND lote IS ?`)
    .get(codigo, loteFinal);

  if (existente) {
    // Si es calidad y tiene área, actualizar también el área
    if (req.params.tipo === "calidad" && area) {
      dbDia
        .prepare(
          `
        UPDATE ${cfg.tablaDia}
        SET cantidad=cantidad + ?, hora_ultima=?, area=?
        WHERE id=?
      `
        )
        .run(Number(cantidad) || 0, hora, area, existente.id);
    } else {
      dbDia
        .prepare(
          `
        UPDATE ${cfg.tablaDia}
        SET cantidad=cantidad + ?, hora_ultima=?
        WHERE id=?
      `
        )
        .run(Number(cantidad) || 0, hora, existente.id);
    }

    const actualizado = dbDia
      .prepare(`SELECT * FROM ${cfg.tablaDia} WHERE id=?`)
      .get(existente.id);

    getIO().emit("devolucion_actualizada", {
      ...actualizado,
      tipo: req.params.tipo,
    });

    const tipoLabel = {
      'calidad': 'Control de Calidad',
      'reacondicionados': 'Reacondicionados',
      'retail': 'Retail',
      'cubbo': 'Cubbo',
      'regulatorio': 'Regulatorio'
    }[req.params.tipo] || req.params.tipo;
    
    registrarAccion({
      usuario: req.user,
      accion: "EDITAR_DEVOLUCION",
      detalle: `Actualizó cantidad de producto "${nombre}" en pestaña ${tipoLabel}`,
      tabla: cfg.tablaDia,
      registroId: existente.id,
      cambios: {
        codigo: codigo,
        lote: loteFinal || 'N/A',
        cantidad_anterior: existente.cantidad || 0,
        cantidad_nueva: Number(cantidad) || 0
      }
    });

    return res.json(actualizado);
  }

  // Insertar nuevo registro
  if (req.params.tipo === "calidad" && area) {
    const info = dbDia
      .prepare(
        `
      INSERT INTO ${cfg.tablaDia} (codigo, nombre, presentacion, lote, cantidad, hora_ultima, activo, area)
      VALUES (?,?,?,?,?,?,?,?)
    `
      )
      .run(codigo, nombre, presentacion || "", loteFinal, Number(cantidad) || 0, hora, activoBD, area);
    
    const nuevo = dbDia
      .prepare(`SELECT * FROM ${cfg.tablaDia} WHERE id=?`)
      .get(info.lastInsertRowid);

    getIO().emit("devolucion_agregada", { ...nuevo, tipo: req.params.tipo });

    const tipoLabel = {
      'calidad': 'Control de Calidad',
      'reacondicionados': 'Reacondicionados',
      'retail': 'Retail',
      'cubbo': 'Cubbo',
      'regulatorio': 'Regulatorio'
    }[req.params.tipo] || req.params.tipo;
    
    registrarAccion({
      usuario: req.user,
      accion: "AGREGAR_DEVOLUCION",
      detalle: `Agregó producto "${nombre}" en pestaña ${tipoLabel}`,
      tabla: cfg.tablaDia,
      registroId: info.lastInsertRowid,
      cambios: {
        codigo: codigo,
        lote: loteFinal || 'N/A',
        cantidad: cantidad || 0,
        area: area
      }
    });

    return res.json(nuevo);
  } else {
    const info = dbDia
      .prepare(
        `
      INSERT INTO ${cfg.tablaDia} (codigo, nombre, presentacion, lote, cantidad, hora_ultima, activo)
      VALUES (?,?,?,?,?,?,?)
    `
      )
      .run(codigo, nombre, presentacion || "", loteFinal, Number(cantidad) || 0, hora, activoBD);

    const nuevo = dbDia
      .prepare(`SELECT * FROM ${cfg.tablaDia} WHERE id=?`)
      .get(info.lastInsertRowid);

    getIO().emit("devolucion_agregada", { ...nuevo, tipo: req.params.tipo });

    const tipoLabel = {
      'calidad': 'Control de Calidad',
      'reacondicionados': 'Reacondicionados',
      'retail': 'Retail',
      'cubbo': 'Cubbo',
      'regulatorio': 'Regulatorio'
    }[req.params.tipo] || req.params.tipo;
    
    registrarAccion({
      usuario: req.user,
      accion: "AGREGAR_DEVOLUCION",
      detalle: `Agregó producto "${nombre}" en pestaña ${tipoLabel}`,
      tabla: cfg.tablaDia,
      registroId: info.lastInsertRowid,
      cambios: {
        codigo: codigo,
        lote: loteFinal || 'N/A',
        cantidad: cantidad || 0
      }
    });

    return res.json(nuevo);
  }
};

const handleActualizarDevolucion = (req, res) => {
  const cfg = getTablasDevoluciones(req.params.tipo);
  if (!cfg)
    return res.status(400).json({ error: "Tipo de devolución inválido" });

  const actual = dbDia
    .prepare(`SELECT * FROM ${cfg.tablaDia} WHERE id=?`)
    .get(req.params.id);

  if (!actual)
    return res.status(404).json({ error: "Devolución no encontrada" });

  const { lote, cantidad, activo } = req.body || {};

  const activoBD =
    typeof activo === "undefined"
      ? typeof actual.activo === "number"
        ? actual.activo
        : 0
      : parseActivoValue(activo, actual.activo ?? 0);

  const cantidadFinal =
    typeof cantidad === "number" || typeof cantidad === "string"
      ? Number(cantidad)
      : actual.cantidad;

  const loteFinal =
    typeof lote === "undefined" ? actual.lote : normalizeLoteValue(lote);

  dbDia
    .prepare(
      `
    UPDATE ${cfg.tablaDia}
    SET lote=?, cantidad=?, hora_ultima=?, activo=?
    WHERE id=?
  `
    )
    .run(
      loteFinal,
      Number.isNaN(cantidadFinal) ? actual.cantidad : cantidadFinal,
      dayjs().format("HH:mm:ss"),
      activoBD,
      req.params.id
    );

  const upd = dbDia
    .prepare(`SELECT * FROM ${cfg.tablaDia} WHERE id=?`)
    .get(req.params.id);

  getIO().emit("devolucion_actualizada", {
    ...upd,
    tipo: req.params.tipo,
  });

  // Crear descripción específica de los cambios
  const cambios = [];
  if (lote !== undefined && loteFinal !== actual.lote) {
    cambios.push(`Lote: ${actual.lote || 'N/A'} → ${loteFinal || 'N/A'}`);
  }
  if (cantidad !== undefined && cantidadFinal !== actual.cantidad) {
    cambios.push(`Cantidad: ${actual.cantidad || 0} → ${cantidadFinal || 0}`);
  }
  if (activo !== undefined && activoBD !== actual.activo) {
    cambios.push(`Activo: ${actual.activo ? 'Sí' : 'No'} → ${activoBD ? 'Sí' : 'No'}`);
  }
  
  const tipoLabel = {
    'calidad': 'Control de Calidad',
    'reacondicionados': 'Reacondicionados',
    'retail': 'Retail',
    'cubbo': 'Cubbo',
    'regulatorio': 'Regulatorio'
  }[req.params.tipo] || req.params.tipo;
  
  registrarAccion({
    usuario: req.user,
    accion: "EDITAR_DEVOLUCION",
    detalle: `Editó producto "${actual.nombre || 'N/A'}" en pestaña ${tipoLabel}`,
    tabla: cfg.tablaDia,
    registroId: req.params.id,
    cambios: cambios.length > 0 ? { cambios: cambios.join(", ") } : null
  });

  res.json({ ok: true, registro: upd });
};

const handleBorrarDevolucion = (req, res) => {
  const cfg = getTablasDevoluciones(req.params.tipo);
  if (!cfg)
    return res.status(400).json({ error: "Tipo de devolución inválido" });

  // Obtener producto antes de borrarlo para auditoría
  const producto = dbDia.prepare(`SELECT * FROM ${cfg.tablaDia} WHERE id=?`).get(req.params.id);

  dbDia.prepare(`DELETE FROM ${cfg.tablaDia} WHERE id=?`).run(req.params.id);

  getIO().emit("devolucion_borrada", {
    id: Number(req.params.id),
    tipo: req.params.tipo,
  });

  const tipoLabel = {
    'calidad': 'Control de Calidad',
    'reacondicionados': 'Reacondicionados',
    'retail': 'Retail',
    'cubbo': 'Cubbo',
    'regulatorio': 'Regulatorio'
  }[req.params.tipo] || req.params.tipo;

  registrarAccion({
    usuario: req.user,
    accion: "BORRAR_DEVOLUCION",
    detalle: `Eliminó producto "${producto?.nombre || 'N/A'}" en pestaña ${tipoLabel}`,
    tabla: cfg.tablaDia,
    registroId: req.params.id,
    cambios: { codigo: producto?.codigo || 'N/A' }
  });

  res.json({ ok: true });
};

router.post(
  "/devoluciones/:tipo",
  requierePermiso("tab:devoluciones"),   // Crear devoluciones
  handleCrearDevolucion
);
router.post(
  "/dia/devoluciones/:tipo",
  requierePermiso("tab:devoluciones"),
  handleCrearDevolucion
);

// ⚠️ IMPORTANTE: Las rutas más específicas deben ir ANTES de las genéricas
// Esta ruta debe ir ANTES de /dia/devoluciones/:tipo/:id para que "activar" no sea capturado como :id
router.put(
  "/dia/devoluciones/:tipo/activar",
  requierePermiso("tab:devoluciones", "action:activar-productos"),
  (req, res) => {
    const cfg = getTablasDevoluciones(req.params.tipo);
    if (!cfg) {
      console.error("❌ Tipo de devolución inválido:", req.params.tipo);
      return res.status(400).json({ error: "Tipo de devolución inválido" });
    }

    // Si viene nombre, activar todos los productos con ese nombre
    if (req.body?.nombre) {
      const nombre = req.body.nombre;
      const activoBD = parseActivoValue(req.body?.activo, 1);
      const hora = dayjs().format("HH:mm:ss");

      const result = dbDia
        .prepare(
          `UPDATE ${cfg.tablaDia} SET activo=?, hora_ultima=? WHERE nombre = ?`
        )
        .run(activoBD, hora, nombre);

      const actualizados = dbDia
        .prepare(`SELECT * FROM ${cfg.tablaDia} WHERE nombre = ?`)
        .all(nombre);

      const io = getIO();
      actualizados.forEach((row) =>
        io.emit("devolucion_actualizada", { ...row, tipo: req.params.tipo })
      );

      // Emitir eventos para actualización en tiempo real
      io.emit("devoluciones_actualizadas");
      io.emit("productos_actualizados", []);
      // Si se activaron productos, también actualizar picking
      if (activoBD === 1) {
        io.emit("picking_actualizado");
      }

      registrarAccion({
        usuario: req.user,
        accion: "ACTIVAR_DEVOLUCION",
        detalle: `Actualizó estado de productos con nombre "${nombre}"`,
        tabla: cfg.tablaDia,
        registroId: actualizados.map((r) => r.id).join(","),
        cambios: { tipo: req.params.tipo, activo: activoBD === 1 ? 'activado' : 'desactivado' }
      });

      return res.json({ ok: true, registros: actualizados });
    }

    // Si viene ids, activar por IDs (compatibilidad hacia atrás)
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map((id) => Number(id)).filter(Boolean)
      : [];
    if (!ids.length) {
      console.error("❌ Sin IDs o nombre para actualizar");
      return res.status(400).json({ error: "Sin IDs o nombre para actualizar" });
    }

    console.log("🔵 IDs a actualizar:", ids, "activo:", req.body?.activo);

    const activoBD = parseActivoValue(req.body?.activo, 1);
    const hora = dayjs().format("HH:mm:ss");
    const placeholders = ids.map(() => "?").join(",");

    dbDia
      .prepare(
        `UPDATE ${cfg.tablaDia} SET activo=?, hora_ultima=? WHERE id IN (${placeholders})`
      )
      .run(activoBD, hora, ...ids);

    const actualizados = dbDia
      .prepare(`SELECT * FROM ${cfg.tablaDia} WHERE id IN (${placeholders})`)
      .all(...ids);

    const io = getIO();
    actualizados.forEach((row) =>
      io.emit("devolucion_actualizada", { ...row, tipo: req.params.tipo })
    );
    
    // Emitir eventos para actualización en tiempo real
    io.emit("devoluciones_actualizadas");
    io.emit("productos_actualizados", []);
    // Si se activaron productos, también actualizar picking
    if (activoBD === 1) {
      io.emit("picking_actualizado");
    }

    registrarAccion({
      usuario: req.user,
      accion: "ACTIVAR_DEVOLUCION",
      detalle: `Actualizó estado de ${ids.length} devoluciones`,
      tabla: cfg.tablaDia,
      registroId: ids.join(","),
      cambios: { tipo: req.params.tipo, activo: activoBD === 1 ? 'activado' : 'desactivado', cantidad: ids.length }
    });

    res.json({ ok: true, registros: actualizados });
  }
);

router.put(
  "/devoluciones/:tipo/:id",
  requierePermiso("tab:devoluciones"),   // Actualizar devoluciones
  handleActualizarDevolucion
);
router.put(
  "/dia/devoluciones/:tipo/:id",
  requierePermiso("tab:devoluciones"),
  (req, res, next) => {
    // Si se está intentando cambiar el activo, verificar permiso adicional
    if (req.body?.activo !== undefined) {
      // Verificar permisos usando permit (ya está autenticado por requierePermiso anterior)
      return permit("action:activar-productos")(req, res, next);
    }
    // Si no se está cambiando activo, continuar normalmente
    next();
  },
  handleActualizarDevolucion
);

router.delete(
  "/devoluciones/:tipo/:id",
  requierePermiso("tab:devoluciones"),   // Borrar devoluciones
  handleBorrarDevolucion
);
router.delete(
  "/dia/devoluciones/:tipo/:id",
  requierePermiso("tab:devoluciones"),
  handleBorrarDevolucion
);

router.get("/dia/devoluciones/:tipo", (req, res) => {
  const cfg = getTablasDevoluciones(req.params.tipo);
  if (!cfg)
    return res.status(400).json({ error: "Tipo de devolución inválido" });

  const rows = dbDia
    .prepare(`SELECT * FROM ${cfg.tablaDia} ORDER BY id DESC`)
    .all();

  res.json(rows);
});

router.get("/dia/devoluciones/:tipo/resumen", (req, res) => {
  const cfg = getTablasDevoluciones(req.params.tipo);
  if (!cfg)
    return res.status(400).json({ error: "Tipo de devolución inválido" });

  const resumen = dbDia
    .prepare(
      `
    SELECT 
      COALESCE(nombre, '') AS nombre,
      SUM(cantidad) AS total,
      MIN(activo) AS min_activo,
      MAX(activo) AS max_activo,
      GROUP_CONCAT(DISTINCT id) AS ids,
      GROUP_CONCAT(DISTINCT codigo) AS codigos,
      GROUP_CONCAT(DISTINCT lote) AS lotes
    FROM ${cfg.tablaDia}
    WHERE nombre IS NOT NULL AND nombre != ''
    GROUP BY nombre
    ORDER BY nombre
  `
    )
    .all();

  const data = resumen.map((row) => ({
    nombre: row.nombre,
    codigo: (row.codigos || "").split(",").filter(Boolean)[0] || "—",
    lote: (row.lotes || "").split(",").filter(Boolean).join(", ") || "—",
    total: row.total,
    ids: (row.ids || "")
      .split(",")
      .map((id) => Number(id))
      .filter(Boolean),
    todosActivos: Number(row.min_activo) === 1,
    algunoActivo: Number(row.max_activo) === 1,
  }));

  res.json(data);
});

/* ============================================================
   FECHA ACTUAL
   ============================================================ */

router.get("/fecha-actual", (_req, res) =>
  res.json({ fecha: getFechaActual() || "" })
);

// Endpoint para validar contraseña de admin
router.post("/fecha-actual/validar-password", authRequired, async (req, res) => {
  const { password } = req.body;
  const userId = req.user?.id;

  if (!password) {
    return res.status(400).json({ error: "Falta contraseña" });
  }

  if (!userId) {
    return res.status(401).json({ error: "Usuario no autenticado" });
  }

  // Verificar que el usuario es admin
  if (!tienePermiso(userId, "tab:admin")) {
    return res.status(403).json({ error: "Solo administradores pueden cambiar la fecha" });
  }

  // Obtener el usuario y su contraseña
  const user = dbUsers.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!user) {
    return res.status(404).json({ error: "Usuario no encontrado" });
  }

  // Verificar contraseña
  if (!user.password_hash) {
    return res.status(400).json({ error: "El usuario no tiene contraseña configurada" });
  }

  const passwordValida = await verifyPassword(password, user.password_hash);
  if (!passwordValida) {
    return res.status(401).json({ error: "Contraseña incorrecta" });
  }

  res.json({ success: true });
});

router.post("/fecha-actual", authRequired, async (req, res) => {
  const { fecha, confirmationCode } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: "Usuario no autenticado" });
  }

  // Guardar fecha anterior antes de cambiarla
  const fechaAnterior = getFechaActual();

  // Si NO hay fecha activa, cualquiera puede establecer una (sin código)
  if (!fechaAnterior || fechaAnterior === "") {
    if (!fecha || fecha === "") {
      return res.status(400).json({ error: "Debes proporcionar una fecha" });
    }

    // Establecer fecha sin requerir código
    setFechaActual(fecha, userId);
    getIO().emit("fecha_actualizada", fecha);

    // Registrar en auditoría
    try {
      registrarAccion({
        usuario: userId,
        accion: "FECHA_ESTABLECIDA",
        detalle: `Estableció fecha: ${fecha}`,
        tabla: "sistema",
        registroId: null,
        cambios: { fecha_nueva: fecha }
      });
    } catch (err) {
      console.error("Error registrando establecimiento de fecha:", err);
    }

    return res.json({ success: true, fecha });
  }

  // Si YA hay fecha activa, se requiere código temporal de admin para cambiarla
  // Verificar que el usuario es admin
  if (!tienePermiso(userId, "tab:admin")) {
    return res.status(403).json({ error: "Solo administradores pueden cambiar la fecha cuando ya hay una activa" });
  }

  // Verificar código de confirmación
  if (!confirmationCode) {
    return res.status(400).json({ error: "Se requiere código de confirmación para cambiar la fecha activa", requiresCode: true });
  }

  // Validar el código de confirmación
  console.log(`\n🔍 [FECHA] Validando código...`);
  console.log(`   Usuario ID: ${userId}`);
  console.log(`   Código: ${confirmationCode}`);

  const codigo = dbUsers.prepare(`
    SELECT * FROM confirmation_codes 
    WHERE codigo = ? AND accion = 'cambiar_fecha' AND usado = 0
    ORDER BY creado_en DESC LIMIT 1
  `).get(confirmationCode);

  if (!codigo) {
    console.log(`   ❌ Código no encontrado`);
    return res.status(401).json({ error: "Código inválido o ya utilizado" });
  }

  console.log(`   ✓ Código encontrado (Usuario: ${codigo.usuario_id})`);

  // Verificar que no haya expirado (10 minutos)
  const ahora = new Date();
  const expiracion = new Date(codigo.expira_en);
  if (ahora > expiracion) {
    console.log(`   ❌ Código expirado`);
    return res.status(401).json({ error: "El código ha expirado" });
  }

  console.log(`   ✓ Código válido`);

  // Marcar código como usado
  dbUsers.prepare(`
    UPDATE confirmation_codes 
    SET usado = 1 
    WHERE id = ?
  `).run(codigo.id);

  // Si se está eliminando la fecha (cadena vacía), permitirlo con código
  if (fecha === "" || fecha === null) {
    setFechaActual("", userId);
    getIO().emit("fecha_actualizada", "");
    
    // Registrar en auditoría
    try {
      registrarAccion({
        usuario: userId,
        accion: "FECHA_ELIMINADA",
        detalle: `Eliminó fecha: ${fechaAnterior}`,
        tabla: "sistema",
        registroId: null,
        cambios: { fecha_anterior: fechaAnterior }
      });
    } catch (err) {
      console.error("Error registrando eliminación de fecha:", err);
    }
    
    return res.json({ success: true, fecha: "" });
  }

  // Cambiar a una fecha diferente (requiere código)
  setFechaActual(fecha, userId);
  getIO().emit("fecha_actualizada", fecha);

  // Registrar en auditoría
  try {
    registrarAccion({
      usuario: userId,
      accion: "FECHA_CAMBIADA",
      detalle: `Cambió fecha de ${fechaAnterior} a ${fecha}`,
      tabla: "sistema",
      registroId: null,
      cambios: { fecha_anterior: fechaAnterior, fecha_nueva: fecha }
    });
  } catch (err) {
    console.error("Error registrando cambio de fecha:", err);
  }

  res.json({ success: true, fecha });
});

/* ============================================================
   CERRAR DÍA
   ============================================================ */

router.post(
  "/cerrar-dia",
  requierePermiso("tab:escaneo"),   // Cerrar día desde escaneo
  (req, res) => {
    try {
      const f = req.body?.fecha || getFechaActual();
      if (!f) return res.status(400).json({ error: "Falta fecha" });

    // ⚠️ VERIFICAR SI HAY PRODUCTOS SIN SURTIR
    const productosSinSurtir = dbDia.prepare("SELECT COUNT(*) as count FROM productos WHERE surtido = 0").get();
    
    if (productosSinSurtir.count > 0 && !req.body?.confirmarEliminacion) {
      return res.status(200).json({ 
        requireConfirmation: true,
        sinSurtir: productosSinSurtir.count,
        message: `Hay ${productosSinSurtir.count} producto(s) sin surtir. ¿Desea eliminarlos o dejarlos para el siguiente día?`
      });
    }

    /* ----- PASAR PRODUCTOS AL HISTÓRICO ----- */
    let registros;
    
    // Si eligió dejar los sin surtir, solo tomar los surtidos
    if (productosSinSurtir.count > 0 && req.body?.dejarSinSurtir) {
      registros = dbDia.prepare("SELECT * FROM productos WHERE surtido = 1").all();
    } else {
      // Si no hay sin surtir o eligió eliminarlos, tomar todos
      registros = dbDia.prepare("SELECT * FROM productos").all();
    }

    // Capturar la hora actual del traspaso
    const horaTraspaso = dayjs().format("HH:mm:ss");

    const insProd = dbHist.prepare(`
      INSERT INTO productos_historico
      (codigo, nombre, cajas, piezas, extras, piezas_por_caja, observaciones, surtido,
       disponible, hora_solicitud, hora_surtido, fecha, lote, origen, devolucion_producto_id, importacion, canal)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    const txProd = dbHist.transaction((arr) => {
      for (const r of arr)
        insProd.run(
          r.codigo,
          r.nombre,
          r.cajas,
          r.piezas,
          r.extras ?? 0,
          r.piezas_por_caja ?? 0,
          r.observaciones,
          r.surtido,
          r.disponible,
          r.hora_solicitud,
          // Usar hora del traspaso para productos surtidos, mantener original para no surtidos
          r.surtido === 1 ? horaTraspaso : r.hora_surtido,
          f,
          r.lote ?? null,
          r.origen || 'normal',
          r.devolucion_producto_id || null,
          r.importacion || 0,
          r.canal || "picking"
        );
    });

    txProd(registros);

    /* ----- DEVOLUCIONES YA NO SE CIERRAN DESDE AQUÍ ----- */
    /* Las devoluciones tienen su propio endpoint de cierre: /devoluciones/cerrar-dia */
    /* Esto permite cerrar escaneo sin afectar devoluciones */

    // Limpiar productos según la decisión del usuario
    // ⚠️ OPERACIÓN CRÍTICA: Solo elimina productos que se movieron al histórico
    const deleteProductos = dbDia.transaction(() => {
      let info;
      if (productosSinSurtir.count > 0 && req.body?.dejarSinSurtir) {
        // Solo eliminar productos surtidos
        info = dbDia.prepare("DELETE FROM productos WHERE surtido = 1").run();
      } else {
        // Eliminar TODOS los productos del día
        info = dbDia.prepare("DELETE FROM productos").run();
      }
      return info.changes;
    });
    
    const eliminados = deleteProductos();
    
    // Emitir eventos solo para picking DESPUÉS de completar todas las operaciones
    const io = getIO();
    
    // ⚠️ IMPORTANTE: Ya NO limpiar la fecha al cerrar el día
    // La fecha debe permanecer fija y continuar con el tiempo real
    // Solo se puede cambiar manualmente desde la interfaz
    // const userId = req.user?.id;
    // setFechaActual("", userId);

    // ⚠️ IMPORTANTE: NO eliminar devoluciones desde aquí
    // Las devoluciones tienen su propio endpoint de cierre: /devoluciones/cerrar-dia
    // Cada módulo debe cerrar su día de forma independiente
    
    // Sincronizar productos de picking
    io.emit("productos_actualizados", []);
    io.emit("picking_actualizado");
    io.emit("cerrar_dia");
    
    // IMPORTANTE: Emitir reportes_actualizados DESPUÉS de que el reporte esté en la BD
    // Usar setTimeout para asegurar que la transacción se complete
    setTimeout(() => {
      io.emit("reportes_actualizados");
    }, 300);
    
    // También emitir inmediatamente
    io.emit("reportes_actualizados");

      // ⭐ AUDITORÍA
      const detalleAuditoria = productosSinSurtir.count > 0 && req.body?.dejarSinSurtir
        ? `Cerró el día ${f} de PICKING (dejó ${productosSinSurtir.count} sin surtir)`
        : `Cerró el día ${f} de PICKING`;
      
      registrarAccion({
        usuario: req.user,
        accion: "CERRAR_DIA_PICKING",
        detalle: detalleAuditoria,
        tabla: "productos",
        registroId: 0,
      });

      res.json({ success: true });
    } catch (err) {
      console.error("Error en cerrar-dia:", err);
      console.error("Stack:", err.stack);
      res.status(500).json({ 
        error: "Error cerrando día",
        message: err.message 
      });
    }
  }
);

export default router;
