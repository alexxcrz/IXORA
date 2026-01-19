import express from "express";
import { dbInv, dbHist, dbAud } from "../config/baseDeDatos.js";
import { getIO } from "../config/socket.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import { generarQRConLogo } from "../utilidades/generarQR.js";

import { requierePermiso, verificarPermisos } from "../middleware/permisos.js";
import { permit, authRequired } from "../middleware/autenticacion.js";
import { registrarAccion } from "../utilidades/auditoria.js";

const uploadDir = "uploads/inventario";
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

const router = express.Router();

router.get("/validar-codigo/:codigo", (req, res) => {
  const code = (req.params.codigo || "").trim();

  if (!code) return res.status(400).json({ error: "Código vacío" });

  const principal = dbInv
    .prepare(`SELECT codigo FROM productos_ref WHERE codigo=?`)
    .get(code);

  if (principal) {
    return res.json({
      existe: true,
      tipo: "principal",
      codigo_principal: code,
    });
  }

  const alias = dbInv
    .prepare(`SELECT codigo_principal FROM codigos_alias WHERE codigo_extra=?`)
    .get(code);

  if (alias?.codigo_principal) {
    return res.json({
      existe: true,
      tipo: "alias",
      codigo_principal: alias.codigo_principal,
    });
  }

  res.json({
    existe: false,
    tipo: "ninguno",
    codigo_principal: null,
  });
});

router.post(
  "/alias/crear",
  requierePermiso("tab:inventario"),
  (req, res) => {
    const { nuevo_codigo, codigo_principal } = req.body || {};

    if (!nuevo_codigo || !codigo_principal) {
      return res.status(400).json({ error: "Faltan datos" });
    }

    const principal = dbInv
      .prepare("SELECT codigo FROM productos_ref WHERE codigo=?")
      .get(codigo_principal);

    if (!principal) {
      return res
        .status(404)
        .json({ error: "El código principal no existe en inventario" });
    }

    try {
      dbInv
        .prepare(
          "INSERT INTO codigos_alias (codigo_extra, codigo_principal) VALUES (?,?)"
        )
        .run(nuevo_codigo, codigo_principal);

      // ⭐️ AUDITORÍA
      registrarAccion({
        usuario: req.user?.name,
        accion: "CREAR_ALIAS",
        detalle: `Alias ${nuevo_codigo} → ${codigo_principal}`,
        tabla: "codigos_alias",
        registroId: 0,
      });

      res.json({ ok: true });
    } catch (e) {
      if (String(e.message).includes("UNIQUE"))
        return res
          .status(400)
          .json({ error: "Ese código ya está registrado como alterno" });

      res.status(500).json({ error: "Error guardando alias" });
    }
  }
);

/* ============================================================
   🔍 BÚSQUEDA DE PRODUCTO (con alias)
   ============================================================ */
router.get("/producto/:codigo", (req, res) => {
  const raw = (req.params.codigo || "").trim();
  if (!raw) return res.status(400).json({ error: "Falta código" });

  let prod = dbInv.prepare(`
        SELECT codigo,nombre,presentacion,categoria,subcategoria,piezas_por_caja,COALESCE(activo,1) AS activo
        FROM productos_ref
        WHERE codigo=?
      `).get(raw);

  if (!prod) {
    const alias = dbInv
      .prepare(
        `SELECT codigo_principal FROM codigos_alias WHERE codigo_extra=?`
      )
      .get(raw);

    if (alias?.codigo_principal) {
      prod = dbInv.prepare(`
              SELECT codigo,nombre,presentacion,categoria,subcategoria,piezas_por_caja,COALESCE(activo,1) AS activo
              FROM productos_ref
              WHERE codigo=?
            `).get(alias.codigo_principal);

      if (prod) prod.alias_de = raw;
    }
  }

  if (!prod) return res.status(404).json({ error: "No existe en inventario" });
  
  // Obtener el lote activo desde productos_lotes
  const loteActivo = dbInv
    .prepare(`
      SELECT lote FROM productos_lotes 
      WHERE codigo_producto = ? AND activo = 1 
      LIMIT 1
    `)
    .get(prod.codigo);
  
  prod.lote = loteActivo?.lote || '';
  
  res.json(prod);
});

/* ============================================================
   🔍 BÚSQUEDA DE PRODUCTO POR NOMBRE (flexible)
   ============================================================ */
router.get("/buscar-por-nombre/:nombre", (req, res) => {
  const nombreBuscado = (req.params.nombre || "").trim();
  if (!nombreBuscado) return res.status(400).json({ error: "Falta nombre" });

  // Normalizar el texto de búsqueda
  const normalizarTexto = (texto = "") => {
    return texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // quitar acentos
      .replace(/[^a-z0-9\s]/g, " ") // quitar caracteres raros
      .replace(/\s+/g, " ")
      .trim();
  };

  const nombreNormalizado = normalizarTexto(nombreBuscado);
  if (!nombreNormalizado) return res.status(400).json({ error: "Nombre inválido" });

  // Traer todo el inventario
  const productos = dbInv
    .prepare(`SELECT codigo, nombre, presentacion, categoria, subcategoria, piezas_por_caja, COALESCE(activo,1) AS activo FROM productos_ref`)
    .all();

  if (!productos || productos.length === 0) {
    return res.status(404).json({ error: "No hay productos en inventario" });
  }

  const palabras = nombreNormalizado.split(" ").filter((p) => p.length > 2);

  const candidatos = productos.map((prod) => {
    const nombreProd = normalizarTexto(prod.nombre || "");
    let coincidencias = 0;

    for (const w of palabras) {
      if (nombreProd.includes(w)) coincidencias++;
    }

    const incluyeCompleto =
      nombreProd.includes(nombreNormalizado) || nombreNormalizado.includes(nombreProd);

    return {
      prod,
      nombreProd,
      coincidencias,
      incluyeCompleto,
      len: nombreProd.length,
    };
  });

  // 1) primero, los que incluyen el nombre completo
  let mejores = candidatos.filter((c) => c.incluyeCompleto);
  if (mejores.length > 0) {
    mejores.sort((a, b) => a.len - b.len);
    // Si se solicita múltiples resultados (query param), devolver array
    if (req.query.multiples === 'true') {
      return res.json(mejores.slice(0, 10).map(c => c.prod));
    }
    return res.json(mejores[0].prod);
  }

  // 2) luego, por # de palabras que coinciden
  mejores = candidatos.filter((c) => c.coincidencias > 0);
  if (mejores.length === 0) {
    return res.status(404).json({ error: "Producto no encontrado" });
  }

  mejores.sort((a, b) => {
    if (b.coincidencias !== a.coincidencias) {
      return b.coincidencias - a.coincidencias;
    }
    return a.len - b.len;
  });

  // Si se solicita múltiples resultados, devolver array
  if (req.query.multiples === 'true') {
    return res.json(mejores.slice(0, 10).map(c => c.prod));
  }

  res.json(mejores[0].prod);
});

/* ============================================================
   INVENTARIO CRUD
   ============================================================ */
router.get("/", (_req, res) => {
  try {
    const rows = dbInv
      .prepare(
        `
          SELECT
            id, codigo, nombre,
            COALESCE(presentacion,'') AS presentacion,
            COALESCE(categoria,'') AS categoria,
            COALESCE(subcategoria,'') AS subcategoria,
            COALESCE(piezas_por_caja,0) AS piezas_por_caja,
            COALESCE(mostrar_en_pagina,0) AS mostrar_en_pagina,
            COALESCE(activo,1) AS activo
          FROM productos_ref
          ORDER BY nombre ASC, presentacion ASC
        `
      )
      .all();
    
    // Para cada producto, obtener el lote activo de productos_lotes
    const productosConLoteActivo = rows.map(producto => {
      const loteActivo = dbInv
        .prepare(`
          SELECT lote FROM productos_lotes 
          WHERE codigo_producto = ? AND activo = 1 
          LIMIT 1
        `)
        .get(producto.codigo);
      
      return {
        ...producto,
        lote: loteActivo?.lote || ''
      };
    });
    
    res.json(productosConLoteActivo);
  } catch (error) {
    console.error("❌ Error obteniendo inventario:", error);
    console.error("   Detalles:", error.message);
    console.error("   Stack:", error.stack);
    res.status(500).json({ error: "Error obteniendo inventario", detalles: error.message });
  }
});

router.post(
  "/",
  requierePermiso("tab:inventario"),   // Acceso a inventario
  (req, res) => {
    const {
      codigo,
      nombre,
      presentacion,
      categoria,
      subcategoria,
      lote,
      piezas_por_caja,
    } = req.body || {};

    if (!codigo || !nombre) {
      return res.status(400).json({ error: "Faltan datos" });
    }

    // ⚠️ IMPORTANTE: NO guardar lote en productos_ref.lote
    // El lote se guarda SOLO en productos_lotes (pestaña de lotes)
    const info = dbInv
      .prepare(
        `
         INSERT INTO productos_ref
         (codigo, nombre, presentacion, categoria, subcategoria, piezas_por_caja)
         VALUES (?,?,?,?,?,?)
      `
      )
      .run(
        codigo,
        nombre,
        presentacion ?? null,
        // IMPORTANTE: Guardar categoría y subcategoría exactamente como vienen
        // NO validar ni transformar, solo guardar el valor tal cual (puede ser null si no viene)
        categoria !== undefined ? (categoria || null) : null,
        subcategoria !== undefined ? (subcategoria || null) : null,
        piezas_por_caja ?? 0
      );

    // Si viene un lote, guardarlo automáticamente en productos_lotes
    if (lote && lote.trim()) {
      try {
        const loteTrim = lote.trim();
        const cantidad = 0; // Cantidad por defecto
        const esActivo = true; // Marcar como activo al crear producto nuevo
        
        // Desactivar otros lotes si este será activo
        dbInv
          .prepare("UPDATE productos_lotes SET activo = 0 WHERE codigo_producto = ?")
          .run(codigo);
        
        // ⚠️ NO actualizar productos_ref.lote - el lote se guarda SOLO en productos_lotes
        
        // Insertar o actualizar el lote en productos_lotes
        try {
          dbInv
            .prepare(`
              INSERT INTO productos_lotes (codigo_producto, lote, cantidad_piezas, laboratorio, activo, fecha_ingreso)
              VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
            `)
            .run(codigo, loteTrim, cantidad, null, esActivo ? 1 : 0);
        } catch (e) {
          // Si ya existe, actualizarlo
          if (String(e.message).includes("UNIQUE")) {
            dbInv
              .prepare(`
                UPDATE productos_lotes
                SET cantidad_piezas = ?, activo = ?, fecha_ingreso = datetime('now', 'localtime')
                WHERE codigo_producto = ? AND lote = ?
              `)
              .run(cantidad, esActivo ? 1 : 0, codigo, loteTrim);
          } else {
            console.error(`❌ Error guardando lote en productos_lotes:`, e);
          }
        }
      } catch (loteErr) {
        console.error(`❌ Error guardando lote automáticamente:`, loteErr);
        // No fallar la creación del producto si falla el lote
      }
    }

    getIO().emit("inventario_actualizado");

    const nuevo = dbInv
      .prepare("SELECT * FROM productos_ref WHERE id=?")
      .get(info.lastInsertRowid);

    // ⭐️ AUDITORÍA - Registrar TODA la información del producto
    registrarAccion({
      usuario: req.user?.name,
      accion: "AGREGAR_PRODUCTO_INVENTARIO",
      detalle: `Agregó producto "${nombre}" | Código: ${codigo} | Presentación: ${presentacion || 'N/A'} | Categoría: ${categoria || 'N/A'} | Subcategoría: ${subcategoria || 'N/A'} | Lote: ${lote || 'N/A'} (guardado en productos_lotes) | Piezas por caja: ${piezas_por_caja || 0}`,
      tabla: "productos_ref",
      registroId: info.lastInsertRowid,
    });

    res.json(nuevo);
  }
);

/* ============================================================
   PUT: Actualizar lote por código (para compatibilidad con modal de surtido)
   ⚠️ CRÍTICO: Esta ruta DEBE estar ANTES de router.put("/:id") para evitar conflictos
   Los lotes se guardan SOLO en productos_lotes, NO en productos_ref.lote
   ============================================================ */
router.put(
  "/lote-por-codigo",
  authRequired,
  verificarPermisos(["tab:inventario", "tab:registros"]),
  (req, res) => {
    try {
      const { codigo, lote, cantidad_piezas } = req.body || {};

      if (!codigo || !lote) {
        return res.status(400).json({ error: "Faltan código o lote" });
      }

      // Convertir alias a código principal si es necesario
      let codigoReal = codigo;
      const alias = dbInv
        .prepare(`SELECT codigo_principal FROM codigos_alias WHERE codigo_extra=?`)
        .get(codigo);
      
      if (alias?.codigo_principal) {
        codigoReal = alias.codigo_principal;
      }

      // Verificar que el producto existe usando el código principal
      const producto = dbInv
        .prepare("SELECT codigo FROM productos_ref WHERE codigo=?")
        .get(codigoReal);

      if (!producto) {
        return res.status(404).json({ error: "Producto no encontrado" });
      }

      // Desactivar todos los lotes existentes usando el código principal
      dbInv
        .prepare("UPDATE productos_lotes SET activo = 0 WHERE codigo_producto = ?")
        .run(codigoReal);

      // Verificar si el lote ya existe para mantener su cantidad
      const loteExistente = dbInv
        .prepare("SELECT cantidad_piezas FROM productos_lotes WHERE codigo_producto = ? AND lote = ?")
        .get(codigoReal, lote);

      const cantidadAMantener = loteExistente ? loteExistente.cantidad_piezas : 0;

      // Insertar o actualizar el lote como activo (solo marca como activo, NO actualiza cantidad)
      // Usar el código principal para guardar el lote
      let resultado;
      try {
        resultado = dbInv
          .prepare(`
            INSERT INTO productos_lotes (codigo_producto, lote, cantidad_piezas, laboratorio, activo, fecha_ingreso)
            VALUES (?, ?, ?, ?, 1, datetime('now', 'localtime'))
          `)
          .run(codigoReal, lote, cantidadAMantener, null);
      } catch (e) {
        // Si ya existe, solo marcarlo como activo (NO actualizar cantidad)
        if (String(e.message).includes("UNIQUE")) {
          resultado = dbInv
            .prepare(`
              UPDATE productos_lotes
              SET activo = 1, fecha_ingreso = datetime('now', 'localtime')
              WHERE codigo_producto = ? AND lote = ?
            `)
            .run(codigoReal, lote);
        } else {
          throw e;
        }
      }
      
      // Verificar que se guardó correctamente usando el código principal
      const loteVerificado = dbInv
        .prepare("SELECT * FROM productos_lotes WHERE codigo_producto = ? AND lote = ?")
        .get(codigoReal, lote);
      
      if (!loteVerificado) {
        return res.status(500).json({ error: "Error: El lote no se guardó correctamente" });
      }

      // ⚠️ NO actualizar productos_ref.lote - el lote se guarda SOLO en productos_lotes

      // ⭐️ AUDITORÍA
      registrarAccion({
        usuario: req.user?.name,
        accion: "ACTUALIZAR_LOTE_POR_CODIGO",
        detalle: `Lote '${lote}' registrado/marcado como activo para producto ${codigoReal}${codigo !== codigoReal ? ` (alias de ${codigo})` : ''} (sin actualizar cantidad)`,
        tabla: "productos_lotes",
        registroId: codigoReal,
      });

      getIO().emit("inventario_actualizado");

      res.json({ ok: true });
    } catch (err) {
      console.error("❌ Error actualizando lote por código:", err);
      res.status(500).json({ error: "Error actualizando lote" });
    }
  }
);

router.put(
  "/:id",
  requierePermiso("tab:inventario"),   // Acceso a inventario
  (req, res, next) => {
    // Si se está intentando cambiar activo, verificar permiso adicional
    if (req.body?.activo !== undefined) {
      return permit("inventario.activar_productos")(req, res, next);
    }
    // Si no se está cambiando activo, continuar normalmente
    next();
  },
  (req, res) => {
    try {
      const { id } = req.params;
      
      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ error: "ID inválido" });
      }

      const actual = dbInv
        .prepare("SELECT * FROM productos_ref WHERE id=?")
        .get(id);
      if (!actual) return res.status(404).json({ error: "No encontrado" });

      const {
        codigo,
        nombre,
        presentacion,
        categoria,
        subcategoria,
        lote,
        piezas_por_caja,
        mostrar_en_pagina: mostrarEnPaginaRaw,
        activo: activoRaw,
      } = req.body || {};
      
      // Normalizar mostrar_en_pagina: convertir a booleano y luego a 1/0
      let mostrarEnPagina = undefined;
      if (mostrarEnPaginaRaw !== undefined) {
        if (typeof mostrarEnPaginaRaw === 'boolean') {
          mostrarEnPagina = mostrarEnPaginaRaw ? 1 : 0;
        } else if (typeof mostrarEnPaginaRaw === 'string') {
          mostrarEnPagina = (mostrarEnPaginaRaw === 'true' || mostrarEnPaginaRaw === '1') ? 1 : 0;
        } else if (typeof mostrarEnPaginaRaw === 'number') {
          mostrarEnPagina = mostrarEnPaginaRaw ? 1 : 0;
        } else {
          mostrarEnPagina = 0;
        }
      }

      // Normalizar activo: convertir a booleano y luego a 1/0
      let activo = undefined;
      if (activoRaw !== undefined) {
        if (typeof activoRaw === 'boolean') {
          activo = activoRaw ? 1 : 0;
        } else if (typeof activoRaw === 'string') {
          activo = (activoRaw === 'true' || activoRaw === '1') ? 1 : 0;
        } else if (typeof activoRaw === 'number') {
          activo = activoRaw ? 1 : 0;
        } else {
          activo = 1; // Por defecto activo
        }
      }

      // ⚠️ IMPORTANTE: NO guardar lote en productos_ref.lote
      // El lote se debe gestionar SOLO desde la pestaña de lotes (productos_lotes)
      // La columna lote ya no existe en productos_ref

      // Validar que código y nombre no estén vacíos si se proporcionan
      if (codigo !== undefined && (!codigo || codigo.trim() === '')) {
        return res.status(400).json({ error: "El código no puede estar vacío" });
      }
      if (nombre !== undefined && (!nombre || nombre.trim() === '')) {
        return res.status(400).json({ error: "El nombre no puede estar vacío" });
      }

      // Validar que piezas_por_caja sea un número válido si se proporciona
      let piezasPorCajaValue = piezas_por_caja ?? actual.piezas_por_caja;
      if (piezas_por_caja !== undefined) {
        if (piezas_por_caja === null || piezas_por_caja === '') {
          piezasPorCajaValue = null;
        } else {
          const piezasNum = parseInt(piezas_por_caja, 10);
          if (isNaN(piezasNum) || piezasNum < 0) {
            return res.status(400).json({ error: "Piezas por caja debe ser un número válido mayor o igual a 0" });
          }
          piezasPorCajaValue = piezasNum;
        }
      }

      // Verificar si el código ya existe en otro producto (si se está cambiando)
      const codigoAnterior = actual.codigo;
      const codigoNuevo = codigo ?? actual.codigo;
      const codigoCambiado = codigo !== undefined && codigo !== codigoAnterior;

      if (codigoCambiado) {
        const codigoExistente = dbInv
          .prepare("SELECT id FROM productos_ref WHERE codigo=? AND id!=?")
          .get(codigoNuevo, id);
        if (codigoExistente) {
          return res.status(400).json({ error: "El código ya existe en otro producto" });
        }
      }

      // Si se está cambiando el código, necesitamos deshabilitar temporalmente
      // las verificaciones de clave foránea para poder actualizar las referencias
      if (codigoCambiado) {
        // Verificar estado actual de foreign keys
        const fkState = dbInv.prepare("PRAGMA foreign_keys").get();
        const fkWasEnabled = fkState && fkState.foreign_keys === 1;
        
        // Deshabilitar verificaciones de clave foránea ANTES de la transacción
        dbInv.exec("PRAGMA foreign_keys = OFF");
        
        try {
          // Usar una transacción para asegurar atomicidad de todas las actualizaciones
          const transaction = dbInv.transaction(() => {
            // Actualizar el código en productos_ref primero
            dbInv
              .prepare(
                `
              UPDATE productos_ref
              SET codigo=?, nombre=?, presentacion=?, categoria=?, subcategoria=?, piezas_por_caja=?, mostrar_en_pagina=?, activo=?
              WHERE id=?
            `
              )
              .run(
                codigoNuevo,
                nombre ?? actual.nombre,
                presentacion ?? actual.presentacion,
                // IMPORTANTE: Guardar categoría y subcategoría exactamente como vienen
                // NO validar ni transformar, solo guardar el valor tal cual
                categoria !== undefined ? categoria : actual.categoria,
                subcategoria !== undefined ? subcategoria : actual.subcategoria,
                piezasPorCajaValue,
                mostrarEnPagina !== undefined ? mostrarEnPagina : (actual.mostrar_en_pagina || 0),
                activo !== undefined ? activo : (actual.activo ?? 1),
                id
              );

            // Actualizar productos_lotes que referencian el código anterior
            dbInv
              .prepare("UPDATE productos_lotes SET codigo_producto = ? WHERE codigo_producto = ?")
              .run(codigoNuevo, codigoAnterior);

            // Actualizar codigos_alias donde el código anterior es codigo_principal
            dbInv
              .prepare("UPDATE codigos_alias SET codigo_principal = ? WHERE codigo_principal = ?")
              .run(codigoNuevo, codigoAnterior);

            // Actualizar codigos_alias donde el código anterior es codigo_extra (si es que existe)
            const aliasComoExtra = dbInv
              .prepare("SELECT id FROM codigos_alias WHERE codigo_extra = ?")
              .get(codigoAnterior);
            
            if (aliasComoExtra) {
              // Si el código anterior es un alias, eliminarlo ya que el código principal cambió
              dbInv
                .prepare("DELETE FROM codigos_alias WHERE codigo_extra = ?")
                .run(codigoAnterior);
            }
          });
          
          // Ejecutar la transacción
          transaction();
          
          // Rehabilitar verificaciones de clave foránea DESPUÉS de la transacción
          if (fkWasEnabled) {
            dbInv.exec("PRAGMA foreign_keys = ON");
          }
        } catch (error) {
          // Si hay error, asegurarse de reactivar las claves foráneas al estado original
          try {
            if (fkWasEnabled) {
              dbInv.exec("PRAGMA foreign_keys = ON");
            }
          } catch (e) {
            // Ignorar errores al reactivar
          }
          throw error;
        }
      } else {
        // Si no se cambia el código, actualizar normalmente
        dbInv
          .prepare(
            `
          UPDATE productos_ref
          SET codigo=?, nombre=?, presentacion=?, categoria=?, subcategoria=?, piezas_por_caja=?, mostrar_en_pagina=?, activo=?
          WHERE id=?
        `
          )
          .run(
            codigoNuevo,
            nombre ?? actual.nombre,
            presentacion ?? actual.presentacion,
            // IMPORTANTE: Guardar categoría y subcategoría exactamente como vienen
            // NO validar ni transformar, solo guardar el valor tal cual
            categoria !== undefined ? categoria : actual.categoria,
            subcategoria !== undefined ? subcategoria : actual.subcategoria,
            piezasPorCajaValue,
            mostrarEnPagina !== undefined ? mostrarEnPagina : (actual.mostrar_en_pagina || 0),
            activo !== undefined ? activo : (actual.activo ?? 1),
            id
          );
      }

      getIO().emit("inventario_actualizado");

      // Obtener producto actualizado para auditoría
      const productoActualizado = dbInv.prepare("SELECT * FROM productos_ref WHERE id=?").get(id);

      // ⭐️ AUDITORÍA - Detectar cambios específicos
      const cambios = [];
      const campos = {
        codigo: 'Código',
        nombre: 'Nombre',
        presentacion: 'Presentación',
        categoria: 'Categoría',
        subcategoria: 'Subcategoría',
        piezas_por_caja: 'Piezas por caja',
        mostrar_en_pagina: 'Mostrar en página',
        activo: 'Activo'
      };

      for (const [campo, nombreCampo] of Object.entries(campos)) {
        const valorAnterior = actual[campo] ?? null;
        let valorNuevo = req.body[campo] ?? null;
        
        // Para mostrar_en_pagina, usar el valor normalizado
        if (campo === 'mostrar_en_pagina' && mostrarEnPagina !== undefined) {
          valorNuevo = mostrarEnPagina;
        }
        
        // Para activo, usar el valor normalizado
        if (campo === 'activo' && activo !== undefined) {
          valorNuevo = activo;
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

      // ⭐️ AUDITORÍA - Registrar con cambios específicos (con manejo de errores)
      try {
        registrarAccion({
          usuario: req.user?.name,
          accion: "EDITAR_PRODUCTO_INVENTARIO",
          detalle: `Editó producto "${productoActualizado?.nombre || 'N/A'}" (Código: ${productoActualizado?.codigo || 'N/A'}) | ${detalleCambios}`,
          tabla: "productos_ref",
          registroId: id,
        });
      } catch (auditError) {
        // No fallar la actualización si la auditoría falla, solo loguear
        console.error("⚠️ Error en auditoría (no crítico):", auditError);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("❌ Error actualizando producto en inventario:", error);
      console.error("   ID:", req.params.id);
      console.error("   Body:", req.body);
      console.error("   Stack:", error.stack);
      res.status(500).json({ 
        error: "Error actualizando producto", 
        detalles: error.message 
      });
    }
  }
);

router.delete(
  "/:id",
  requierePermiso("tab:inventario"),   // Acceso a inventario
  (req, res) => {
    // Obtener producto antes de borrarlo para auditoría
    const producto = dbInv.prepare("SELECT * FROM productos_ref WHERE id=?").get(req.params.id);
    
    dbInv.prepare("DELETE FROM productos_ref WHERE id=?").run(req.params.id);
    getIO().emit("inventario_actualizado");

    // ⭐️ AUDITORÍA
    registrarAccion({
      usuario: req.user?.name,
      accion: "BORRAR_PRODUCTO_INVENTARIO",
      detalle: `Eliminó producto "${producto?.nombre || 'N/A'}" (Código: ${producto?.codigo || 'N/A'}) en pestaña Inventario`,
      tabla: "productos_ref",
      registroId: req.params.id,
    });

    res.json({ success: true });
  }
);

/* ============================================================
   ACTUALIZACIÓN MASIVA DE MOSTRAR EN PÁGINA
   ============================================================ */
router.put(
  "/masivo/mostrar-en-pagina",
  requierePermiso("tab:inventario"),
  (req, res) => {
    try {
      const { ids, mostrar } = req.body;
      
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "Se requiere un array de IDs" });
      }
      
      const valorMostrar = mostrar ? 1 : 0;
      
      // Usar transacción para eficiencia
      const actualizarMasivo = dbInv.transaction((idsArray, valor) => {
        const stmt = dbInv.prepare("UPDATE productos_ref SET mostrar_en_pagina = ? WHERE id = ?");
        let actualizados = 0;
        
        for (const id of idsArray) {
          const result = stmt.run(valor, id);
          if (result.changes > 0) actualizados++;
        }
        
        return actualizados;
      });
      
      const actualizados = actualizarMasivo(ids, valorMostrar);
      
      // Emitir evento de actualización
      getIO().emit("inventario_actualizado");
      
      // Auditoría
      registrarAccion({
        usuario: req.user?.name,
        accion: valorMostrar ? "MOSTRAR_PRODUCTOS_MASIVO" : "OCULTAR_PRODUCTOS_MASIVO",
        detalle: `${actualizados} productos ${valorMostrar ? "mostrados" : "ocultos"} en página`,
        tabla: "productos_ref",
        registroId: null,
      });
      
      res.json({ 
        success: true, 
        actualizados,
        mensaje: `${actualizados} productos ${valorMostrar ? "mostrados" : "ocultos"} en página`
      });
    } catch (error) {
      console.error("❌ Error en actualización masiva:", error);
      res.status(500).json({ error: "Error actualizando productos" });
    }
  }
);

/* ============================================================
   ALIAS CRUD
   ============================================================ */
router.post(
  "/alias",
  requierePermiso("tab:inventario"),   // Acceso a inventario
  (req, res) => {
    const { codigo_extra, codigo_principal } = req.body || {};
    if (!codigo_extra || !codigo_principal)
      return res.status(400).json({ error: "Faltan datos" });

    const principal = dbInv
      .prepare("SELECT codigo FROM productos_ref WHERE codigo=?")
      .get(codigo_principal);

    if (!principal)
      return res
        .status(404)
        .json({ error: "Código principal no existe" });

    try {
      dbInv
        .prepare(
          "INSERT INTO codigos_alias (codigo_extra,codigo_principal) VALUES (?,?)"
        )
        .run(codigo_extra, codigo_principal);

      // ⭐️ AUDITORÍA
      registrarAccion({
        usuario: req.user?.name,
        accion: "CREAR_ALIAS",
        detalle: `Alias ${codigo_extra} → ${codigo_principal}`,
        tabla: "codigos_alias",
        registroId: 0,
      });

      res.json({ ok: true });
    } catch (e) {
      if (String(e.message).includes("UNIQUE"))
        return res
          .status(400)
          .json({ error: "Ese código extra ya está registrado" });
      res.status(500).json({ error: "Error guardando alias" });
    }
  }
);

/* ============================================================
   ALTERNOS POR PRODUCTO
   ============================================================ */
router.get("/codigos/:codigo", (req, res) => {
  const principal = (req.params.codigo || "").trim();
  if (!principal)
    return res.status(400).json({ error: "Falta código" });

  const rows = dbInv
    .prepare(
      "SELECT codigo_extra FROM codigos_alias WHERE codigo_principal=? ORDER BY id ASC"
    )
    .all(principal);

  res.json(rows.map((r) => r.codigo_extra));
});

router.post(
  "/codigos/:codigo",
  requierePermiso("tab:inventario"),   // Acceso a inventario
  (req, res) => {
    const principal = (req.params.codigo || "").trim();
    const { codigo } = req.body || {};
    const alterno = (codigo || "").trim();

    if (!principal || !alterno)
      return res.status(400).json({ error: "Faltan datos" });

    if (principal === alterno)
      return res
        .status(400)
        .json({ error: "El código alterno no puede ser igual al principal" });

    const prod = dbInv
      .prepare("SELECT codigo FROM productos_ref WHERE codigo=?")
      .get(principal);
    if (!prod)
      return res
        .status(404)
        .json({ error: "Código principal no existe en inventario" });

    const count = dbInv
      .prepare(
        "SELECT COUNT(*) AS total FROM codigos_alias WHERE codigo_principal=?"
      )
      .get(principal);

    if (count.total >= 4)
      return res
        .status(400)
        .json({ error: "Máximo ४ códigos alternos por producto" });

    try {
      dbInv
        .prepare(
          "INSERT INTO codigos_alias (codigo_extra,codigo_principal) VALUES (?,?)"
        )
        .run(alterno, principal);

      // ⭐️ AUDITORÍA
      registrarAccion({
        usuario: req.user?.name,
        accion: "AGREGAR_CODIGO_ALTERNO",
        detalle: `${alterno} agregado como alterno de ${principal}`,
        tabla: "codigos_alias",
        registroId: 0,
      });

      res.json({ ok: true });
    } catch (e) {
      if (String(e.message).includes("UNIQUE"))
        return res
          .status(400)
          .json({ error: "Ese código alterno ya está registrado" });
      res.status(500).json({ error: "Error guardando código alterno" });
    }
  }
);

router.delete(
  "/codigos/:codigo/:alterno",
  requierePermiso("tab:inventario"),   // Acceso a inventario
  (req, res) => {
    const principal = (req.params.codigo || "").trim();
    const alterno = (req.params.alterno || "").trim();

    if (!principal || !alterno)
      return res.status(400).json({ error: "Faltan datos" });

    const info = dbInv
      .prepare(
        "DELETE FROM codigos_alias WHERE codigo_principal=? AND codigo_extra=?"
      )
      .run(principal, alterno);

    if (info.changes === 0)
      return res
        .status(404)
        .json({ error: "No se encontró ese código alterno" });

    // ⭐️ AUDITORÍA
    registrarAccion({
      usuario: req.user?.name,
      accion: "BORRAR_ALIAS",
      detalle: `Alias ${alterno} de ${principal} eliminado`,
      tabla: "codigos_alias",
      registroId: 0,
    });

    res.json({ ok: true });
  }
);

/* ============================================================
   LOTES
   ============================================================ */
// Endpoint de prueba para verificar que la ruta está disponible
router.get("/lote-por-codigo/test", (req, res) => {
  console.log("✅ [GET /inventario/lote-por-codigo/test] Ruta de prueba accesible");
  res.json({ ok: true, mensaje: "Ruta /lote-por-codigo está disponible" });
});

// ⚠️ CRÍTICO: Esta ruta DEBE estar ANTES de router.get("/lotes/:codigo") para evitar conflictos
// GET: Verificar si un lote específico está registrado para un código
router.get("/lotes/:codigo/verificar/:lote", (req, res) => {
  try {
    const codigo = (req.params.codigo || "").trim();
    const lote = (req.params.lote || "").trim();
    
    if (!codigo || !lote) {
      return res.status(400).json({ error: "Faltan código o lote" });
    }
    
    // Convertir alias a código principal si es necesario
    let codigoReal = codigo;
    const alias = dbInv
      .prepare(`SELECT codigo_principal FROM codigos_alias WHERE codigo_extra=?`)
      .get(codigo);
    
    if (alias?.codigo_principal) {
      codigoReal = alias.codigo_principal;
    }
    
    // Buscar el lote usando el código principal
    const loteEncontrado = dbInv
      .prepare("SELECT * FROM productos_lotes WHERE codigo_producto = ? AND lote = ?")
      .get(codigoReal, lote);

    res.json({ existe: !!loteEncontrado });
  } catch (err) {
    console.error(`❌ [GET /lotes/${req.params.codigo}/verificar/${req.params.lote}] Error:`, err);
    res.status(500).json({ error: "Error verificando lote", details: err.message });
  }
});

router.get("/lotes/:codigo", (req, res) => {
  const { codigo } = req.params;

  const lotesHist = dbHist
    .prepare(
      `SELECT DISTINCT lote FROM productos_historico
         WHERE codigo=? AND lote IS NOT NULL AND lote!=''`
    )
    .all(codigo)
    .map((r) => r.lote);

  // Obtener lote activo desde productos_lotes
  const loteActivo = dbInv
    .prepare("SELECT lote FROM productos_lotes WHERE codigo_producto = ? AND activo = 1 LIMIT 1")
    .get(codigo)?.lote;

  const lotesUnicos = Array.from(
    new Set([...(loteActivo ? [loteActivo] : []), ...lotesHist])
  );

  res.json(lotesUnicos);
});

router.delete(
  "/lotes/:codigo/:lote",
  requierePermiso("tab:inventario"),   // Acceso a inventario
  (req, res) => {
    const { codigo, lote } = req.params;

    // ⚠️ NO usar productos_ref.lote - el lote se guarda SOLO en productos_lotes

    getIO().emit("inventario_actualizado");

    // ⭐️ AUDITORÍA
    registrarAccion({
      usuario: req.user?.name,
      accion: "BORRAR_LOTE",
      detalle: `Lote '${lote}' borrado del producto ${codigo}`,
      tabla: "productos_ref",
      registroId: codigo,
    });

    res.json({ success: true });
  }
);

/* ============================================================
   GESTIÓN DE LOTES POR PRODUCTO
   ============================================================ */

// GET: Obtener todos los lotes de un producto (nueva tabla productos_lotes)
// ⚠️ NOTA: Esta ruta usa "/lotes/:codigo" pero se prioriza sobre la antigua
// La ruta antigua devuelve strings, esta devuelve objetos completos
router.get("/lotes/:codigo/completo", (req, res) => {
  try {
    const codigo = (req.params.codigo || "").trim();
    if (!codigo) {
      return res.status(400).json({ error: "Falta código de producto" });
    }

    // Convertir alias a código principal si es necesario
    let codigoReal = codigo;
    const alias = dbInv
      .prepare(`SELECT codigo_principal FROM codigos_alias WHERE codigo_extra=?`)
      .get(codigo);
    
    if (alias?.codigo_principal) {
      codigoReal = alias.codigo_principal;
    }

    // Verificar que el producto existe usando el código principal
    const producto = dbInv
      .prepare("SELECT codigo, nombre FROM productos_ref WHERE codigo=?")
      .get(codigoReal);

    if (!producto) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    // Buscar lotes usando el código principal
    const lotes = dbInv
      .prepare(`
        SELECT 
          id,
          codigo_producto,
          lote,
          cantidad_piezas,
          laboratorio,
          fecha_ingreso,
          activo
        FROM productos_lotes
        WHERE codigo_producto = ?
        ORDER BY activo DESC, fecha_ingreso DESC
      `)
      .all(codigoReal);

    res.json(lotes);
  } catch (err) {
    console.error(`❌ [GET /lotes/${req.params.codigo}/completo] Error obteniendo lotes:`, err);
    res.status(500).json({ error: "Error obteniendo lotes", details: err.message });
  }
});

// POST: Agregar un nuevo lote
router.post(
  "/lotes/:codigo/nuevo",
  requierePermiso("tab:inventario"),
  (req, res) => {
    try {
      const codigo = (req.params.codigo || "").trim();
      const { lote, cantidad_piezas, laboratorio, activo } = req.body || {};

      if (!codigo || !lote) {
        return res.status(400).json({ error: "Faltan código o lote" });
      }


      // Convertir alias a código principal si es necesario
      let codigoReal = codigo;
      const alias = dbInv
        .prepare(`SELECT codigo_principal FROM codigos_alias WHERE codigo_extra=?`)
        .get(codigo);
      
      if (alias?.codigo_principal) {
        codigoReal = alias.codigo_principal;
      }

      // Verificar que el producto existe usando el código principal
      const productoVerificar = dbInv
        .prepare("SELECT codigo, nombre FROM productos_ref WHERE codigo=?")
        .get(codigoReal);

      if (!productoVerificar) {
        const productosSimilares = dbInv
          .prepare("SELECT codigo FROM productos_ref WHERE UPPER(TRIM(codigo)) = UPPER(TRIM(?))")
          .all(codigoReal);
        
        if (productosSimilares.length > 0) {
          return res.status(400).json({ 
            error: `Producto no encontrado. ¿Quisiste decir: ${productosSimilares[0].codigo}?` 
          });
        }
        
        return res.status(404).json({ error: "Producto no encontrado. Asegúrate de que el producto exista en el inventario antes de agregar lotes." });
      }
      

      // ⭐ Si no se envía cantidad_piezas ni activo, solo agregar el lote (desde modal de surtir)
      const soloLote = cantidad_piezas === undefined && activo === undefined;
      
      const cantidad = soloLote ? 0 : Number(cantidad_piezas || 0);
      const esActivo = soloLote ? false : (activo === true || activo === 1);

      // Si este lote será activo, desactivar los demás usando el código principal
      if (esActivo) {
        dbInv
          .prepare(
            "UPDATE productos_lotes SET activo = 0 WHERE codigo_producto = ?"
          )
          .run(codigoReal);
        
        // ⚠️ NO actualizar productos_ref.lote - el lote se obtiene desde productos_lotes
      }

      let resultado;
      try {
        resultado = dbInv
          .prepare(`
            INSERT INTO productos_lotes (codigo_producto, lote, cantidad_piezas, laboratorio, activo, fecha_ingreso)
            VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
          `)
          .run(codigoReal, lote, cantidad, laboratorio || null, esActivo ? 1 : 0);
      } catch (e) {
        if (String(e.message).includes("UNIQUE")) {
          resultado = dbInv
            .prepare(`
              UPDATE productos_lotes
              SET cantidad_piezas = ?, laboratorio = ?, activo = ?, fecha_ingreso = datetime('now', 'localtime')
              WHERE codigo_producto = ? AND lote = ?
            `)
            .run(cantidad, laboratorio || null, esActivo ? 1 : 0, codigoReal, lote);
        } else {
          console.error(`❌ [POST /lotes/${codigo}/nuevo] Error insertando/actualizando lote:`, e);
          throw e;
        }
      }
      
      // Verificar que se guardó correctamente usando el código principal
      const loteVerificado = dbInv
        .prepare("SELECT * FROM productos_lotes WHERE codigo_producto = ? AND lote = ?")
        .get(codigoReal, lote);
      
      if (!loteVerificado) {
        console.error(`❌ [POST /lotes/${codigo}/nuevo] ERROR: El lote no se guardó correctamente para ${codigoReal} - ${lote}`);
        
        // Verificar si hay algún problema con la tabla
        const tablaExiste = dbInv
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='productos_lotes'")
          .get();
        
        if (!tablaExiste) {
          console.error(`❌ [POST /lotes/${codigo}/nuevo] ERROR CRÍTICO: La tabla productos_lotes no existe!`);
        }
        
        return res.status(500).json({ error: "Error: El lote no se guardó correctamente" });
      }
      

      // Calcular total de piezas disponibles del producto (solo lotes activos)
      const totalPiezas = dbInv
        .prepare(`
          SELECT COALESCE(SUM(cantidad_piezas), 0) as total 
          FROM productos_lotes 
          WHERE codigo_producto = ? AND activo = 1
        `)
        .get(codigoReal);

      const tienePiezas = (totalPiezas?.total || 0) > 0;

      // Obtener el producto para actualizar mostrar_en_pagina
      const productoParaActualizar = dbInv
        .prepare("SELECT id, mostrar_en_pagina FROM productos_ref WHERE codigo = ?")
        .get(codigoReal);

      if (productoParaActualizar) {
        // Activar mostrar_en_pagina si tiene piezas, desactivar si no tiene
        const nuevoEstadoMostrar = tienePiezas ? 1 : 0;
        
        // Solo actualizar si el estado cambió
        if (productoParaActualizar.mostrar_en_pagina !== nuevoEstadoMostrar) {
          dbInv
            .prepare("UPDATE productos_ref SET mostrar_en_pagina = ? WHERE id = ?")
            .run(nuevoEstadoMostrar, productoParaActualizar.id);
        }
      }

      // ⭐️ AUDITORÍA
      registrarAccion({
        usuario: req.user,
        accion: soloLote ? "AGREGAR_LOTE_SIMPLE" : "AGREGAR_LOTE",
        detalle: soloLote 
          ? `Agregó lote '${lote}' al producto ${codigoReal}${codigo !== codigoReal ? ` (alias de ${codigo})` : ''}`
          : `Lote '${lote}' (${cantidad} pzs) agregado al producto ${codigoReal}${codigo !== codigoReal ? ` (alias de ${codigo})` : ''}${esActivo ? ' - Marcado como activo' : ''}${tienePiezas ? ' - Producto activado automáticamente' : ' - Producto desactivado automáticamente (sin piezas)'}`,
        tabla: "productos_lotes",
        registroId: codigoReal,
        cambios: soloLote 
          ? { lote: lote, codigo: codigoReal }
          : { lote: lote, codigo: codigoReal, cantidad_piezas: cantidad, activo: esActivo ? 'sí' : 'no' }
      });

      getIO().emit("inventario_actualizado");

      // Devolver el lote recién creado/actualizado para confirmación
      const loteGuardado = dbInv
        .prepare("SELECT * FROM productos_lotes WHERE codigo_producto = ? AND lote = ?")
        .get(codigo, lote);
      
      res.json({ 
        ok: true, 
        lote: loteGuardado,
        mensaje: `Lote '${lote}' guardado correctamente`
      });
    } catch (err) {
      console.error("❌ Error agregando lote:", err);
      res.status(500).json({ error: "Error agregando lote" });
    }
  }
);

// PUT: Actualizar un lote (cantidad, lote, activo)
router.put(
  "/lotes/:codigo/:id",
  requierePermiso("tab:inventario"),
  (req, res, next) => {
    // Si se está intentando cambiar el activo, verificar permiso adicional
    if (req.body?.activo !== undefined) {
      // Verificar permisos usando permit (ya está autenticado por requierePermiso anterior)
      return permit("action:activar-productos")(req, res, next);
    }
    // Si no se está cambiando activo, continuar normalmente
    next();
  },
  (req, res) => {
    try {
      const codigo = (req.params.codigo || "").trim();
      const id = Number(req.params.id);
      const { lote, cantidad_piezas, laboratorio, activo } = req.body || {};

      if (!codigo || !id) {
        return res.status(400).json({ error: "Faltan código o ID de lote" });
      }

      // Verificar que el lote existe
      const loteActual = dbInv
        .prepare("SELECT * FROM productos_lotes WHERE id = ? AND codigo_producto = ?")
        .get(id, codigo);

      if (!loteActual) {
        return res.status(404).json({ error: "Lote no encontrado" });
      }

      // Manejar cantidad_piezas: si viene en el body, actualizarla (incluso si es 0 o null)
      // Si no viene en el body, mantener el valor actual
      let nuevaCantidad;
      if (cantidad_piezas !== undefined) {
        // Si viene explícitamente, convertir a número (null/undefined/"" se convierten a 0)
        nuevaCantidad = cantidad_piezas === null || cantidad_piezas === "" ? 0 : Number(cantidad_piezas) || 0;
      } else {
        // Si no viene en el body, mantener el valor actual
        nuevaCantidad = loteActual.cantidad_piezas;
      }
             const nuevoLote = lote || loteActual.lote;
             const nuevoLaboratorio = laboratorio !== undefined ? (laboratorio || null) : loteActual.laboratorio;
             const esActivo = activo !== undefined ? (activo === true || activo === 1) : loteActual.activo === 1;

      // Si este lote será activo, desactivar los demás
      if (esActivo) {
        dbInv
          .prepare(
            "UPDATE productos_lotes SET activo = 0 WHERE codigo_producto = ? AND id != ?"
          )
          .run(codigo, id);
        
        // ⚠️ NO actualizar productos_ref.lote - el lote se obtiene desde productos_lotes
      }

      // Actualizar el lote
      dbInv
        .prepare(`
          UPDATE productos_lotes
          SET lote = ?, cantidad_piezas = ?, laboratorio = ?, activo = ?
          WHERE id = ? AND codigo_producto = ?
        `)
        .run(nuevoLote, nuevaCantidad, nuevoLaboratorio, esActivo ? 1 : 0, id, codigo);

      // Verificar que se actualizó correctamente
      const loteActualizado = dbInv
        .prepare("SELECT * FROM productos_lotes WHERE id = ? AND codigo_producto = ?")
        .get(id, codigo);

      if (!loteActualizado) {
        return res.status(500).json({ error: "Error: El lote no se actualizó correctamente" });
      }

      // Calcular total de piezas disponibles del producto (solo lotes activos)
      const totalPiezas = dbInv
        .prepare(`
          SELECT COALESCE(SUM(cantidad_piezas), 0) as total 
          FROM productos_lotes 
          WHERE codigo_producto = ? AND activo = 1
        `)
        .get(codigo);

      const tienePiezas = (totalPiezas?.total || 0) > 0;

      // Obtener el producto para actualizar mostrar_en_pagina
      const productoParaActualizar = dbInv
        .prepare("SELECT id, mostrar_en_pagina FROM productos_ref WHERE codigo = ?")
        .get(codigo);

      if (productoParaActualizar) {
        // Activar mostrar_en_pagina si tiene piezas, desactivar si no tiene
        const nuevoEstadoMostrar = tienePiezas ? 1 : 0;
        
        // Solo actualizar si el estado cambió
        if (productoParaActualizar.mostrar_en_pagina !== nuevoEstadoMostrar) {
          dbInv
            .prepare("UPDATE productos_ref SET mostrar_en_pagina = ? WHERE id = ?")
            .run(nuevoEstadoMostrar, productoParaActualizar.id);
        }
      }

      // ⭐️ AUDITORÍA
      registrarAccion({
        usuario: req.user,
        accion: "EDITAR_LOTE",
        detalle: `Lote actualizado: '${nuevoLote}'`,
        tabla: "productos_lotes",
        registroId: id,
        cambios: {
          lote: nuevoLote,
          cantidad_piezas: nuevaCantidad,
          activo: esActivo ? 'sí' : 'no',
          codigo: codigo,
          producto_activado: tienePiezas ? 'sí' : 'no'
        }
      });

      getIO().emit("inventario_actualizado");

      res.json({ 
        ok: true, 
        lote: loteActualizado,
        mensaje: `Lote '${nuevoLote}' actualizado correctamente`,
        tienePiezas,
        mostrarEnPaginaActualizado: productoParaActualizar && productoParaActualizar.mostrar_en_pagina !== (tienePiezas ? 1 : 0)
      });
    } catch (err) {
      console.error("❌ Error actualizando lote:", err);
      res.status(500).json({ error: "Error actualizando lote" });
    }
  }
);

// PUT: Marcar un lote como activo/inactivo
router.put(
  "/lotes/:codigo/:id/activo",
  requierePermiso("tab:inventario", "action:activar-productos"),
  (req, res) => {
    try {
      const codigo = (req.params.codigo || "").trim();
      const id = Number(req.params.id);
      const { activo } = req.body || {};

      if (!codigo || !id) {
        return res.status(400).json({ error: "Faltan código o ID de lote" });
      }

      // Verificar que el lote existe
      const lote = dbInv
        .prepare("SELECT * FROM productos_lotes WHERE id = ? AND codigo_producto = ?")
        .get(id, codigo);

      if (!lote) {
        return res.status(404).json({ error: "Lote no encontrado" });
      }

      // Determinar el nuevo estado: si viene activo en el body, usarlo; si no, alternar
      const nuevoEstado = activo !== undefined 
        ? (activo === true || activo === 1 || activo === "1") 
        : (lote.activo !== 1);

      if (nuevoEstado) {
        // Si se activa, desactivar todos los demás lotes del producto
        dbInv
          .prepare(
            "UPDATE productos_lotes SET activo = 0 WHERE codigo_producto = ? AND id != ?"
          )
          .run(codigo, id);

        // Activar el lote seleccionado
        dbInv
          .prepare(
            "UPDATE productos_lotes SET activo = 1 WHERE id = ? AND codigo_producto = ?"
          )
          .run(id, codigo);

        // ⚠️ NO actualizar productos_ref.lote - el lote se obtiene desde productos_lotes

        // ⭐️ AUDITORÍA
        registrarAccion({
          usuario: req.user?.name,
          accion: "ACTIVAR_LOTE",
          detalle: `Lote '${lote.lote}' activado para producto ${codigo}`,
          tabla: "productos_lotes",
          registroId: id,
        });
      } else {
        // Si se desactiva, solo desactivar este lote
        dbInv
          .prepare(
            "UPDATE productos_lotes SET activo = 0 WHERE id = ? AND codigo_producto = ?"
          )
          .run(id, codigo);

        // ⚠️ NO actualizar productos_ref.lote - el lote se obtiene desde productos_lotes

        // ⭐️ AUDITORÍA
        registrarAccion({
          usuario: req.user?.name,
          accion: "DESACTIVAR_LOTE",
          detalle: `Lote '${lote.lote}' desactivado para producto ${codigo}`,
          tabla: "productos_lotes",
          registroId: id,
        });
      }

      // Calcular total de piezas disponibles del producto (solo lotes activos)
      const totalPiezas = dbInv
        .prepare(`
          SELECT COALESCE(SUM(cantidad_piezas), 0) as total 
          FROM productos_lotes 
          WHERE codigo_producto = ? AND activo = 1
        `)
        .get(codigo);

      const tienePiezas = (totalPiezas?.total || 0) > 0;

      // Obtener el producto para actualizar mostrar_en_pagina
      const productoParaActualizar = dbInv
        .prepare("SELECT id, mostrar_en_pagina FROM productos_ref WHERE codigo = ?")
        .get(codigo);

      if (productoParaActualizar) {
        // Activar mostrar_en_pagina si tiene piezas, desactivar si no tiene
        const nuevoEstadoMostrar = tienePiezas ? 1 : 0;
        
        // Solo actualizar si el estado cambió
        if (productoParaActualizar.mostrar_en_pagina !== nuevoEstadoMostrar) {
          dbInv
            .prepare("UPDATE productos_ref SET mostrar_en_pagina = ? WHERE id = ?")
            .run(nuevoEstadoMostrar, productoParaActualizar.id);
        }
      }

      getIO().emit("inventario_actualizado");

      res.json({ ok: true, activo: nuevoEstado ? 1 : 0 });
    } catch (err) {
      console.error("❌ Error actualizando estado del lote:", err);
      res.status(500).json({ error: "Error actualizando estado del lote" });
    }
  }
);

// DELETE: Eliminar un lote
router.delete(
  "/lotes/:codigo/:id/eliminar",
  requierePermiso("tab:inventario"),
  (req, res) => {
    try {
      const codigo = (req.params.codigo || "").trim();
      const id = Number(req.params.id);

      if (!codigo || !id) {
        return res.status(400).json({ error: "Faltan código o ID de lote" });
      }

      // Verificar que el lote existe
      const lote = dbInv
        .prepare("SELECT * FROM productos_lotes WHERE id = ? AND codigo_producto = ?")
        .get(id, codigo);

      if (!lote) {
        return res.status(404).json({ error: "Lote no encontrado" });
      }

      // Eliminar el lote
      dbInv
        .prepare("DELETE FROM productos_lotes WHERE id = ? AND codigo_producto = ?")
        .run(id, codigo);

      // ⚠️ NO actualizar productos_ref.lote - el lote se obtiene desde productos_lotes

      // ⭐️ AUDITORÍA
      registrarAccion({
        usuario: req.user?.name,
        accion: "ELIMINAR_LOTE",
        detalle: `Lote '${lote.lote}' eliminado del producto ${codigo}`,
        tabla: "productos_lotes",
        registroId: id,
      });

      getIO().emit("inventario_actualizado");

      res.json({ ok: true });
    } catch (err) {
      console.error("❌ Error eliminando lote:", err);
      res.status(500).json({ error: "Error eliminando lote" });
    }
  }
);

// POST: Subir fotos de un producto
router.post(
  "/:id/fotos",
  requierePermiso("tab:inventario"),
  upload.single("foto"),
  (req, res) => {
    try {
      const { id } = req.params;
      const { principal } = req.body || {};

      if (!req.file) {
        return res.status(400).json({ error: "No se envió foto" });
      }

      // Verificar que el producto existe
      const producto = dbInv
        .prepare("SELECT * FROM productos_ref WHERE id = ?")
        .get(id);

      if (!producto) {
        // Eliminar el archivo si el producto no existe
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: "Producto no encontrado" });
      }

      // Guardar la foto en la base de datos (si existe tabla de fotos)
      // Por ahora, solo guardamos el nombre del archivo en algún campo o tabla
      // Si no existe tabla de fotos, podemos crear una o usar un campo JSON
      const filename = req.file.filename;

      // Intentar insertar en tabla de fotos si existe, sino solo guardar el nombre
      try {
        // Verificar si existe la tabla productos_fotos
        const tableExists = dbInv
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='productos_fotos'")
          .get();

        if (tableExists) {
          // Si existe la tabla, insertar la foto
          const esPrincipal = principal === "1" || principal === 1 || principal === true;
          
          // Si esta foto es principal, marcar las demás como no principales
          if (esPrincipal) {
            dbInv
              .prepare("UPDATE productos_fotos SET principal = 0 WHERE producto_id = ?")
              .run(id);
          }

          dbInv
            .prepare(`
              INSERT INTO productos_fotos (producto_id, archivo, principal, fecha)
              VALUES (?, ?, ?, datetime('now', 'localtime'))
            `)
            .run(id, filename, esPrincipal ? 1 : 0);
        }
      } catch (err) {
        // Si no existe la tabla, no hacer nada (solo guardamos el archivo)
        console.log("⚠️ Tabla productos_fotos no existe, solo se guardó el archivo");
      }

      // ⭐️ AUDITORÍA
      registrarAccion({
        usuario: req.user?.name,
        accion: "SUBIR_FOTO_PRODUCTO",
        detalle: `Foto "${filename}" subida para producto ${producto.codigo} (${producto.nombre})`,
        tabla: "productos_ref",
        registroId: id,
      });

      getIO().emit("inventario_actualizado");

      res.json({ ok: true, archivo: filename });
    } catch (err) {
      console.error("❌ Error subiendo foto:", err);
      // Eliminar el archivo si hubo error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: "Error subiendo foto" });
    }
  }
);

/* ============================================================
   🔄 RECUPERAR INVENTARIO DESDE AUDITORÍA (TEMPORAL)
   ============================================================ */
router.post(
  "/recuperar-desde-auditoria",
  requierePermiso("tab:inventario"),
  (req, res) => {
    try {
      console.log("🔄 Iniciando recuperación de inventario desde auditoría...");
      
      // Buscar todos los registros de auditoría relacionados con productos_ref
      const registros = dbAud
        .prepare(`
          SELECT detalle, fecha, accion, registro_id
          FROM auditoria
          WHERE tabla_afectada = 'productos_ref'
            AND (accion LIKE '%AGREGAR%' OR accion LIKE '%EDITAR%')
          ORDER BY fecha ASC
        `)
        .all();
      
      console.log(`📊 Encontrados ${registros.length} registros de auditoría relacionados con productos`);
      
      // Extraer información de productos desde los detalles
      const productosRecuperados = new Map(); // Usar Map para evitar duplicados por código
      
      for (const registro of registros) {
        const detalle = registro.detalle || "";
        
      // Buscar patrón nuevo: "Agregó producto "nombre" | Código: XXX | Presentación: YYY | Categoría: ZZZ | ..."
      // O patrón antiguo: "Agregó producto "nombre" (Código: XXX, Categoría: YYY, ...)"
      
      // Extraer nombre del producto (puede estar entre comillas o después de "producto")
      let matchNombre = detalle.match(/producto\s+"([^"]+)"/i);
      if (!matchNombre) {
        matchNombre = detalle.match(/producto\s+([^|(]+)/i);
      }
      
      // Extraer código (buscar después de "Código:")
      let matchCodigo = detalle.match(/Código:\s*([^|,)]+)/i);
      if (!matchCodigo) {
        matchCodigo = detalle.match(/Código:\s*([^,)]+)/i);
      }
      
      // Extraer presentación (buscar después de "Presentación:")
      let matchPresentacion = detalle.match(/Presentación:\s*([^|,)]+)/i);
      if (!matchPresentacion) {
        matchPresentacion = detalle.match(/presentacion[^:]*:\s*([^|,)]+)/i);
      }
      if (!matchPresentacion) {
        matchPresentacion = detalle.match(/presentacion[^:]*:\s*([^,)]+)/i);
      }
      
      // Extraer categoría (buscar después de "Categoría:")
      let matchCategoria = detalle.match(/Categoría:\s*([^|,)]+)/i);
      if (!matchCategoria) {
        matchCategoria = detalle.match(/Categoría:\s*([^,)]+)/i);
      }
      
      // Extraer subcategoría (buscar después de "Subcategoría:")
      let matchSubcategoria = detalle.match(/Subcategoría:\s*([^|,)]+)/i);
      if (!matchSubcategoria) {
        matchSubcategoria = detalle.match(/Subcategoría:\s*([^,)]+)/i);
      }
      
      // Extraer lote (buscar después de "Lote:")
      let matchLote = detalle.match(/Lote:\s*([^|,)]+)/i);
      if (!matchLote) {
        matchLote = detalle.match(/Lote:\s*([^,)]+)/i);
      }
      
      // Extraer piezas por caja
      let matchPiezas = detalle.match(/Piezas por caja:\s*(\d+)/i);
      if (!matchPiezas) {
        matchPiezas = detalle.match(/piezas[^:]*:\s*(\d+)/i);
      }
      
      if (matchCodigo && matchNombre) {
        const codigo = matchCodigo[1].trim();
        const nombre = matchNombre[1].trim();
        
        // Extraer y limpiar valores
        let categoria = matchCategoria ? matchCategoria[1].trim() : null;
        let subcategoria = matchSubcategoria ? matchSubcategoria[1].trim() : null;
        let presentacion = matchPresentacion ? matchPresentacion[1].trim() : null;
        let lote = matchLote ? matchLote[1].trim() : null;
        const piezas_por_caja = matchPiezas ? parseInt(matchPiezas[1]) : 0;
        
        // Limpiar valores "N/A", "null", "undefined" o vacíos
        if (!categoria || categoria === 'N/A' || categoria === 'null' || categoria === 'undefined' || categoria === '') categoria = null;
        if (!subcategoria || subcategoria === 'N/A' || subcategoria === 'null' || subcategoria === 'undefined' || subcategoria === '') subcategoria = null;
        if (!presentacion || presentacion === 'N/A' || presentacion === 'null' || presentacion === 'undefined' || presentacion === '') presentacion = null;
        if (!lote || lote === 'N/A' || lote === 'null' || lote === 'undefined' || lote === '') lote = null;
          
          // Si es una edición, actualizar el producto existente
          // Si es una adición y no existe, agregarlo
          if (!productosRecuperados.has(codigo) || registro.accion.includes('EDITAR')) {
            productosRecuperados.set(codigo, {
              codigo,
              nombre,
              categoria: categoria || null,
              subcategoria: subcategoria || null,
              presentacion: presentacion || null,
              lote: lote || null,
              piezas_por_caja: piezas_por_caja || 0,
              fecha_registro: registro.fecha
            });
          }
        }
      }
      
      console.log(`✅ Extraídos ${productosRecuperados.size} productos únicos desde auditoría`);
      
      // Insertar productos recuperados en inventario
      let insertados = 0;
      let actualizados = 0;
      let errores = 0;
      
      const insert = dbInv.prepare(`
        INSERT INTO productos_ref 
        (codigo, nombre, presentacion, categoria, subcategoria, lote, piezas_por_caja)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      const update = dbInv.prepare(`
        UPDATE productos_ref
        SET nombre = ?, presentacion = ?, categoria = ?, subcategoria = ?, lote = ?, piezas_por_caja = ?
        WHERE codigo = ?
      `);
      
      for (const [codigo, producto] of productosRecuperados) {
        try {
          // Verificar si ya existe
          const existe = dbInv.prepare("SELECT codigo FROM productos_ref WHERE codigo = ?").get(codigo);
          
          if (existe) {
            // Actualizar producto existente
            update.run(
              producto.nombre,
              producto.presentacion,
              producto.categoria,
              producto.subcategoria,
              producto.lote,
              producto.piezas_por_caja,
              codigo
            );
            actualizados++;
          } else {
            // Insertar nuevo producto
            insert.run(
              producto.codigo,
              producto.nombre,
              producto.presentacion,
              producto.categoria,
              producto.subcategoria,
              producto.lote,
              producto.piezas_por_caja
            );
            insertados++;
          }
        } catch (err) {
          console.error(`❌ Error procesando producto ${codigo}:`, err.message);
          errores++;
        }
      }
      
      getIO().emit("inventario_actualizado");
      
      console.log(`✅ Recuperación completada: ${insertados} insertados, ${actualizados} actualizados, ${errores} errores`);
      
      res.json({
        success: true,
        mensaje: `Recuperación completada: ${insertados} productos insertados, ${actualizados} actualizados`,
        insertados,
        actualizados,
        errores,
        total: productosRecuperados.size
      });
    } catch (error) {
      console.error("❌ Error recuperando inventario desde auditoría:", error);
      res.status(500).json({ 
        error: "Error recuperando inventario", 
        detalles: error.message 
      });
    }
  }
);

/* ============================================================
   PRODUCTOS DISPONIBLES PARA VENTA (PÁGINA PÚBLICA)
   ============================================================ */

// GET: Obtener productos disponibles para venta en la página pública
// No requiere autenticación (página pública)
router.get("/productos-venta", (req, res) => {
  try {
    // Obtener productos con mostrar_en_pagina = 1
    const productos = dbInv
      .prepare(`
        SELECT
          id, codigo, nombre,
          COALESCE(presentacion,'') AS presentacion,
          COALESCE(categoria,'') AS categoria,
          COALESCE(subcategoria,'') AS subcategoria,
          COALESCE(piezas_por_caja,0) AS piezas_por_caja,
          COALESCE(precio,0) AS precio,
          foto
        FROM productos_ref
        WHERE mostrar_en_pagina = 1
        ORDER BY categoria ASC, nombre ASC
      `)
      .all();

    // Para cada producto, calcular piezas disponibles y determinar disponibilidad
    const productosConDisponibilidad = productos.map(producto => {
      // Sumar todas las piezas de lotes activos
      const lotesActivos = dbInv
        .prepare(`
          SELECT SUM(cantidad_piezas) as total_piezas
          FROM productos_lotes
          WHERE codigo_producto = ? AND activo = 1
        `)
        .get(producto.codigo);

      const piezasDisponibles = lotesActivos?.total_piezas || 0;
      const disponible = piezasDisponibles >= 50; // Disponible si tiene 50 o más piezas

      // Obtener foto principal si existe
      let foto = producto.foto;
      if (!foto) {
        const fotoPrincipal = dbInv
          .prepare(`
            SELECT archivo FROM productos_fotos
            WHERE producto_id = ? AND principal = 1
            LIMIT 1
          `)
          .get(producto.id);
        if (fotoPrincipal) {
          foto = `/uploads/productos/${fotoPrincipal.archivo}`;
        }
      } else if (!foto.startsWith('http') && !foto.startsWith('/')) {
        foto = `/uploads/productos/${foto}`;
      }

      return {
        ...producto,
        piezas_disponibles: piezasDisponibles,
        disponible: disponible,
        foto: foto || null,
        precio: producto.precio || 0
      };
    });

    res.json(productosConDisponibilidad);
  } catch (error) {
    console.error("❌ Error obteniendo productos para venta:", error);
    res.status(500).json({ error: "Error obteniendo productos", detalles: error.message });
  }
});

// GET: Obtener un producto específico para venta (con más detalles)
router.get("/productos-venta/:codigo", (req, res) => {
  try {
    const codigo = (req.params.codigo || "").trim();
    
    // Convertir alias a código principal si es necesario
    let codigoReal = codigo;
    const alias = dbInv
      .prepare(`SELECT codigo_principal FROM codigos_alias WHERE codigo_extra=?`)
      .get(codigo);
    
    if (alias?.codigo_principal) {
      codigoReal = alias.codigo_principal;
    }

    const producto = dbInv
      .prepare(`
        SELECT
          id, codigo, nombre,
          COALESCE(presentacion,'') AS presentacion,
          COALESCE(categoria,'') AS categoria,
          COALESCE(subcategoria,'') AS subcategoria,
          COALESCE(piezas_por_caja,0) AS piezas_por_caja
        FROM productos_ref
        WHERE codigo = ? AND mostrar_en_pagina = 1
      `)
      .get(codigoReal);

    if (!producto) {
      return res.status(404).json({ error: "Producto no encontrado o no disponible para venta" });
    }

    // Calcular piezas disponibles
    const lotesActivos = dbInv
      .prepare(`
        SELECT SUM(cantidad_piezas) as total_piezas
        FROM productos_lotes
        WHERE codigo_producto = ? AND activo = 1
      `)
      .get(codigoReal);

      const piezasDisponibles = lotesActivos?.total_piezas || 0;
      const disponible = piezasDisponibles >= 50;

      // Obtener fotos del producto
      let fotos = [];
      try {
        const fotosProducto = dbInv
          .prepare(`
            SELECT archivo, principal
            FROM productos_fotos
            WHERE producto_id = ?
            ORDER BY principal DESC, fecha DESC
          `)
          .all(producto.id);
        
        fotos = fotosProducto.map(f => ({
          url: `/uploads/inventario/${f.archivo}`,
          principal: f.principal === 1
        }));
      } catch (e) {
        // Si la tabla no existe aún, no hay fotos
      }

    res.json({
      ...producto,
      piezas_disponibles: piezasDisponibles,
      disponible: disponible,
      fotos: fotos,
      foto: fotos.length > 0 ? fotos[0].url : null
    });
  } catch (error) {
    console.error("❌ Error obteniendo producto para venta:", error);
    res.status(500).json({ error: "Error obteniendo producto", detalles: error.message });
  }
});

// ============================================================
// GENERAR QR CON LOGO PARA PRODUCTO
// ============================================================
router.get("/qr/:codigo", authRequired, async (req, res) => {
  try {
    const { codigo } = req.params;
    
    if (!codigo) {
      return res.status(400).json({ error: "Falta el código del producto" });
    }

    // Generar QR con logo integrado
    const qrBuffer = await generarQRConLogo(codigo, 400);

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `inline; filename="qr-${codigo}.png"`);
    res.send(qrBuffer);
  } catch (err) {
    console.error("Error generando QR:", err);
    res.status(500).json({ error: "Error generando QR" });
  }
});

export default router;
