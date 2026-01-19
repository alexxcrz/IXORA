import express from "express";
import { dbVentas } from "../config/db.js";
import { dbUsers } from "../config/baseDeDatos.js";
import { authRequired, hashPassword, verifyPassword, JWT_SECRET } from "../middleware/autenticacion.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const router = express.Router();

// ============================================================
// SUSCRIPCIÓN PÚBLICA
// ============================================================

// Suscribirse a newsletter (público)
router.post("/tienda/suscripcion", async (req, res) => {
  try {
    const { email, nombre } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ error: "El email es requerido" });
    }

    const emailLimpio = email.trim().toLowerCase();

    // Validar formato de email básico
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailLimpio)) {
      return res.status(400).json({ error: "Email inválido" });
    }

    // Verificar si ya existe
    const existente = dbVentas
      .prepare("SELECT id, activo FROM tienda_suscripciones WHERE email = ?")
      .get(emailLimpio);

    if (existente) {
      if (existente.activo === 1) {
        return res.status(400).json({ error: "Este email ya está suscrito" });
      } else {
        // Reactivar suscripción
        dbVentas
          .prepare("UPDATE tienda_suscripciones SET activo = 1, fecha_suscripcion = datetime('now', 'localtime') WHERE id = ?")
          .run(existente.id);
        return res.json({ mensaje: "Suscripción reactivada correctamente" });
      }
    }

    // Crear token de confirmación
    const token = crypto.randomBytes(32).toString("hex");

    // Crear nueva suscripción
    dbVentas
      .prepare(
        `INSERT INTO tienda_suscripciones (email, nombre, token_confirmacion, fecha_confirmacion)
         VALUES (?, ?, ?, datetime('now', 'localtime'))`
      )
      .run(emailLimpio, nombre?.trim() || null, token);

    res.json({ mensaje: "Suscripción exitosa. ¡Gracias por unirte!" });
  } catch (err) {
    console.error("Error en suscripción:", err);
    if (err.message.includes("UNIQUE")) {
      return res.status(400).json({ error: "Este email ya está suscrito" });
    }
    res.status(500).json({ error: "Error procesando suscripción" });
  }
});

// Desuscribirse (público)
router.post("/tienda/desuscripcion", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ error: "El email es requerido" });
    }

    const emailLimpio = email.trim().toLowerCase();

    const result = dbVentas
      .prepare("UPDATE tienda_suscripciones SET activo = 0 WHERE email = ?")
      .run(emailLimpio);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Email no encontrado" });
    }

    res.json({ mensaje: "Te has desuscrito correctamente" });
  } catch (err) {
    console.error("Error en desuscripción:", err);
    res.status(500).json({ error: "Error procesando desuscripción" });
  }
});

// ============================================================
// GESTIÓN DE SUSCRIPCIONES (requiere autenticación)
// ============================================================

// Obtener todas las suscripciones
router.get("/tienda/suscripciones", authRequired, async (req, res) => {
  try {
    const suscripciones = dbVentas
      .prepare(
        `SELECT id, email, nombre, activo, fecha_suscripcion, fecha_confirmacion
         FROM tienda_suscripciones
         ORDER BY fecha_suscripcion DESC`
      )
      .all();

    res.json(suscripciones);
  } catch (err) {
    console.error("Error obteniendo suscripciones:", err);
    res.status(500).json({ error: "Error obteniendo suscripciones" });
  }
});

// Crear campaña de email (requiere auth)
router.post("/tienda/campanas", authRequired, async (req, res) => {
  try {
    const { titulo, asunto, contenido } = req.body;

    if (!titulo || !asunto || !contenido) {
      return res.status(400).json({ error: "Faltan datos de la campaña" });
    }

    const result = dbVentas
      .prepare(
        `INSERT INTO tienda_campanas_email (titulo, asunto, contenido, usuario_creo, estado)
         VALUES (?, ?, ?, ?, 'Borrador')`
      )
      .run(titulo, asunto, contenido, req.user?.name || "Admin");

    res.json({ id: result.lastInsertRowid, mensaje: "Campaña creada correctamente" });
  } catch (err) {
    console.error("Error creando campaña:", err);
    res.status(500).json({ error: "Error creando campaña" });
  }
});

// Obtener campañas
router.get("/tienda/campanas", authRequired, async (req, res) => {
  try {
    const campanas = dbVentas
      .prepare(
        `SELECT id, titulo, asunto, fecha_creacion, estado, total_enviados, total_abiertos, total_clics
         FROM tienda_campanas_email
         ORDER BY fecha_creacion DESC`
      )
      .all();

    res.json(campanas);
  } catch (err) {
    console.error("Error obteniendo campañas:", err);
    res.status(500).json({ error: "Error obteniendo campañas" });
  }
});

// Enviar campaña (requiere auth) - Placeholder para integración con servicio de email
router.post("/tienda/campanas/:id/enviar", authRequired, async (req, res) => {
  try {
    const { id } = req.params;

    const campana = dbVentas
      .prepare("SELECT * FROM tienda_campanas_email WHERE id = ?")
      .get(id);

    if (!campana) {
      return res.status(404).json({ error: "Campaña no encontrada" });
    }

    // Obtener suscripciones activas
    const suscripciones = dbVentas
      .prepare("SELECT id, email, nombre FROM tienda_suscripciones WHERE activo = 1")
      .all();

    if (suscripciones.length === 0) {
      return res.status(400).json({ error: "No hay suscripciones activas" });
    }

    // Registrar envíos (placeholder - aquí se integraría con servicio de email real)
    const insertEnvio = dbVentas.prepare(
      `INSERT INTO tienda_campanas_envios (campana_id, suscripcion_id, email, estado)
       VALUES (?, ?, ?, 'Enviado')`
    );

    suscripciones.forEach((susc) => {
      insertEnvio.run(id, susc.id, susc.email);
    });

    // Actualizar campaña
    dbVentas
      .prepare(
        `UPDATE tienda_campanas_email 
         SET estado = 'Enviada', fecha_envio = datetime('now', 'localtime'), total_enviados = ?
         WHERE id = ?`
      )
      .run(suscripciones.length, id);

    res.json({
      mensaje: `Campaña enviada a ${suscripciones.length} suscriptores`,
      total: suscripciones.length,
    });
  } catch (err) {
    console.error("Error enviando campaña:", err);
    res.status(500).json({ error: "Error enviando campaña" });
  }
});

// ============================================================
// AUTENTICACIÓN DE CLIENTES (PÚBLICO)
// ============================================================

// Registro de cliente
router.post("/tienda/clientes/registro", async (req, res) => {
  try {
    const { email, password, nombre, telefono } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ error: "El email es requerido" });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
    }

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: "El nombre es requerido" });
    }

    const emailLimpio = email.trim().toLowerCase();

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailLimpio)) {
      return res.status(400).json({ error: "Email inválido" });
    }

    // Verificar si ya existe
    const existente = dbVentas
      .prepare("SELECT id FROM tienda_clientes WHERE email = ?")
      .get(emailLimpio);

    if (existente) {
      return res.status(400).json({ error: "Este email ya está registrado" });
    }

    // Hashear contraseña
    const passwordHash = await hashPassword(password);

    // Crear cliente
    const result = dbVentas
      .prepare(
        `INSERT INTO tienda_clientes (email, password_hash, nombre, telefono)
         VALUES (?, ?, ?, ?)`
      )
      .run(emailLimpio, passwordHash, nombre.trim(), telefono?.trim() || null);

    // Generar token JWT
    const token = jwt.sign(
      { clienteId: result.lastInsertRowid, email: emailLimpio, tipo: "cliente_tienda" },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      token,
      cliente: {
        id: result.lastInsertRowid,
        email: emailLimpio,
        nombre: nombre.trim(),
        telefono: telefono?.trim() || null,
      },
      mensaje: "Registro exitoso. ¡Bienvenido!",
    });
  } catch (err) {
    console.error("Error en registro de cliente:", err);
    if (err.message.includes("UNIQUE")) {
      return res.status(400).json({ error: "Este email ya está registrado" });
    }
    res.status(500).json({ error: "Error procesando registro" });
  }
});

// Login de cliente
router.post("/tienda/clientes/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email y contraseña son requeridos" });
    }

    const emailLimpio = email.trim().toLowerCase();

    // Buscar cliente
    const cliente = dbVentas
      .prepare("SELECT id, email, password_hash, nombre, telefono, activo FROM tienda_clientes WHERE email = ?")
      .get(emailLimpio);

    if (!cliente) {
      return res.status(401).json({ error: "Email o contraseña incorrectos" });
    }

    if (cliente.activo === 0) {
      return res.status(403).json({ error: "Tu cuenta está desactivada" });
    }

    // Verificar contraseña
    const passwordValida = await verifyPassword(password, cliente.password_hash);
    if (!passwordValida) {
      return res.status(401).json({ error: "Email o contraseña incorrectos" });
    }

    // Actualizar último acceso
    dbVentas
      .prepare("UPDATE tienda_clientes SET ultimo_acceso = datetime('now', 'localtime') WHERE id = ?")
      .run(cliente.id);

    // Generar token JWT
    const token = jwt.sign(
      { clienteId: cliente.id, email: cliente.email, tipo: "cliente_tienda" },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      token,
      cliente: {
        id: cliente.id,
        email: cliente.email,
        nombre: cliente.nombre,
        telefono: cliente.telefono,
      },
    });
  } catch (err) {
    console.error("Error en login de cliente:", err);
    res.status(500).json({ error: "Error procesando login" });
  }
});

// Middleware para autenticación de clientes
const clienteAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "Token requerido" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.tipo !== "cliente_tienda") {
      return res.status(403).json({ error: "Token inválido para clientes" });
    }

    const cliente = dbVentas
      .prepare("SELECT id, email, nombre, telefono, activo FROM tienda_clientes WHERE id = ?")
      .get(decoded.clienteId);

    if (!cliente || cliente.activo === 0) {
      return res.status(403).json({ error: "Cliente no encontrado o desactivado" });
    }

    req.cliente = cliente;
    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token inválido o expirado" });
    }
    console.error("Error en autenticación de cliente:", err);
    res.status(500).json({ error: "Error verificando autenticación" });
  }
};

// ============================================================
// GESTIÓN DE DATOS DE CLIENTES (requiere autenticación)
// ============================================================

// Obtener perfil del cliente
router.get("/tienda/clientes/perfil", clienteAuth, async (req, res) => {
  try {
    const cliente = req.cliente;
    res.json(cliente);
  } catch (err) {
    console.error("Error obteniendo perfil:", err);
    res.status(500).json({ error: "Error obteniendo perfil" });
  }
});

// Actualizar perfil del cliente
router.put("/tienda/clientes/perfil", clienteAuth, async (req, res) => {
  try {
    const { nombre, telefono } = req.body;
    const clienteId = req.cliente.id;

    const updates = [];
    const params = [];

    if (nombre !== undefined && nombre.trim()) {
      updates.push("nombre = ?");
      params.push(nombre.trim());
    }

    if (telefono !== undefined) {
      updates.push("telefono = ?");
      params.push(telefono.trim() || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No se proporcionaron datos para actualizar" });
    }

    params.push(clienteId);
    const query = `UPDATE tienda_clientes SET ${updates.join(", ")} WHERE id = ?`;
    dbVentas.prepare(query).run(...params);

    // Obtener cliente actualizado
    const clienteActualizado = dbVentas
      .prepare("SELECT id, email, nombre, telefono FROM tienda_clientes WHERE id = ?")
      .get(clienteId);

    res.json(clienteActualizado);
  } catch (err) {
    console.error("Error actualizando perfil:", err);
    res.status(500).json({ error: "Error actualizando perfil" });
  }
});

// Cambiar contraseña
router.post("/tienda/clientes/cambiar-password", clienteAuth, async (req, res) => {
  try {
    const { password_actual, password_nueva } = req.body;
    const clienteId = req.cliente.id;

    if (!password_actual || !password_nueva) {
      return res.status(400).json({ error: "Contraseña actual y nueva son requeridas" });
    }

    if (password_nueva.length < 6) {
      return res.status(400).json({ error: "La nueva contraseña debe tener al menos 6 caracteres" });
    }

    // Obtener hash actual
    const cliente = dbVentas
      .prepare("SELECT password_hash FROM tienda_clientes WHERE id = ?")
      .get(clienteId);

    // Verificar contraseña actual
    const passwordValida = await verifyPassword(password_actual, cliente.password_hash);
    if (!passwordValida) {
      return res.status(401).json({ error: "Contraseña actual incorrecta" });
    }

    // Hashear nueva contraseña
    const nuevoHash = await hashPassword(password_nueva);

    // Actualizar contraseña
    dbVentas
      .prepare("UPDATE tienda_clientes SET password_hash = ? WHERE id = ?")
      .run(nuevoHash, clienteId);

    res.json({ mensaje: "Contraseña actualizada correctamente" });
  } catch (err) {
    console.error("Error cambiando contraseña:", err);
    res.status(500).json({ error: "Error cambiando contraseña" });
  }
});

// Obtener direcciones del cliente
router.get("/tienda/clientes/direcciones", clienteAuth, async (req, res) => {
  try {
    const direcciones = dbVentas
      .prepare(
        `SELECT id, nombre, calle, numero_exterior, numero_interior, colonia, ciudad, estado, codigo_postal, pais, referencias, es_principal
         FROM tienda_direcciones
         WHERE cliente_id = ?
         ORDER BY es_principal DESC, fecha_creacion DESC`
      )
      .all(req.cliente.id);

    res.json(direcciones);
  } catch (err) {
    console.error("Error obteniendo direcciones:", err);
    res.status(500).json({ error: "Error obteniendo direcciones" });
  }
});

// Agregar dirección
router.post("/tienda/clientes/direcciones", clienteAuth, async (req, res) => {
  try {
    const {
      nombre,
      calle,
      numero_exterior,
      numero_interior,
      colonia,
      ciudad,
      estado,
      codigo_postal,
      pais,
      referencias,
      es_principal,
    } = req.body;

    if (!nombre || !calle || !ciudad || !estado || !codigo_postal) {
      return res.status(400).json({ error: "Faltan datos requeridos de la dirección" });
    }

    // Si se marca como principal, quitar principal de otras direcciones
    if (es_principal) {
      dbVentas
        .prepare("UPDATE tienda_direcciones SET es_principal = 0 WHERE cliente_id = ?")
        .run(req.cliente.id);
    }

    const result = dbVentas
      .prepare(
        `INSERT INTO tienda_direcciones 
         (cliente_id, nombre, calle, numero_exterior, numero_interior, colonia, ciudad, estado, codigo_postal, pais, referencias, es_principal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.cliente.id,
        nombre.trim(),
        calle.trim(),
        numero_exterior?.trim() || null,
        numero_interior?.trim() || null,
        colonia?.trim() || null,
        ciudad.trim(),
        estado.trim(),
        codigo_postal.trim(),
        pais?.trim() || "México",
        referencias?.trim() || null,
        es_principal ? 1 : 0
      );

    const nuevaDireccion = dbVentas
      .prepare("SELECT * FROM tienda_direcciones WHERE id = ?")
      .get(result.lastInsertRowid);

    res.status(201).json(nuevaDireccion);
  } catch (err) {
    console.error("Error agregando dirección:", err);
    res.status(500).json({ error: "Error agregando dirección" });
  }
});

// Actualizar dirección
router.put("/tienda/clientes/direcciones/:id", clienteAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const clienteId = req.cliente.id;

    // Verificar que la dirección pertenece al cliente
    const direccion = dbVentas
      .prepare("SELECT cliente_id FROM tienda_direcciones WHERE id = ?")
      .get(id);

    if (!direccion || direccion.cliente_id !== clienteId) {
      return res.status(404).json({ error: "Dirección no encontrada" });
    }

    const {
      nombre,
      calle,
      numero_exterior,
      numero_interior,
      colonia,
      ciudad,
      estado,
      codigo_postal,
      pais,
      referencias,
      es_principal,
    } = req.body;

    // Si se marca como principal, quitar principal de otras direcciones
    if (es_principal) {
      dbVentas
        .prepare("UPDATE tienda_direcciones SET es_principal = 0 WHERE cliente_id = ? AND id != ?")
        .run(clienteId, id);
    }

    const updates = [];
    const params = [];

    if (nombre !== undefined) updates.push("nombre = ?"), params.push(nombre.trim());
    if (calle !== undefined) updates.push("calle = ?"), params.push(calle.trim());
    if (numero_exterior !== undefined) updates.push("numero_exterior = ?"), params.push(numero_exterior?.trim() || null);
    if (numero_interior !== undefined) updates.push("numero_interior = ?"), params.push(numero_interior?.trim() || null);
    if (colonia !== undefined) updates.push("colonia = ?"), params.push(colonia?.trim() || null);
    if (ciudad !== undefined) updates.push("ciudad = ?"), params.push(ciudad.trim());
    if (estado !== undefined) updates.push("estado = ?"), params.push(estado.trim());
    if (codigo_postal !== undefined) updates.push("codigo_postal = ?"), params.push(codigo_postal.trim());
    if (pais !== undefined) updates.push("pais = ?"), params.push(pais?.trim() || "México");
    if (referencias !== undefined) updates.push("referencias = ?"), params.push(referencias?.trim() || null);
    if (es_principal !== undefined) updates.push("es_principal = ?"), params.push(es_principal ? 1 : 0);

    if (updates.length === 0) {
      return res.status(400).json({ error: "No se proporcionaron datos para actualizar" });
    }

    params.push(id);
    const query = `UPDATE tienda_direcciones SET ${updates.join(", ")} WHERE id = ?`;
    dbVentas.prepare(query).run(...params);

    const direccionActualizada = dbVentas
      .prepare("SELECT * FROM tienda_direcciones WHERE id = ?")
      .get(id);

    res.json(direccionActualizada);
  } catch (err) {
    console.error("Error actualizando dirección:", err);
    res.status(500).json({ error: "Error actualizando dirección" });
  }
});

// Eliminar dirección
router.delete("/tienda/clientes/direcciones/:id", clienteAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const clienteId = req.cliente.id;

    // Verificar que la dirección pertenece al cliente
    const direccion = dbVentas
      .prepare("SELECT cliente_id FROM tienda_direcciones WHERE id = ?")
      .get(id);

    if (!direccion || direccion.cliente_id !== clienteId) {
      return res.status(404).json({ error: "Dirección no encontrada" });
    }

    dbVentas.prepare("DELETE FROM tienda_direcciones WHERE id = ?").run(id);

    res.json({ mensaje: "Dirección eliminada correctamente" });
  } catch (err) {
    console.error("Error eliminando dirección:", err);
    res.status(500).json({ error: "Error eliminando dirección" });
  }
});

// Obtener tarjetas del cliente (solo últimos 4 dígitos)
router.get("/tienda/clientes/tarjetas", clienteAuth, async (req, res) => {
  try {
    const tarjetas = dbVentas
      .prepare(
        `SELECT id, ultimos_digitos, tipo, nombre_titular, fecha_vencimiento, es_principal
         FROM tienda_tarjetas
         WHERE cliente_id = ?
         ORDER BY es_principal DESC, fecha_creacion DESC`
      )
      .all(req.cliente.id);

    res.json(tarjetas);
  } catch (err) {
    console.error("Error obteniendo tarjetas:", err);
    res.status(500).json({ error: "Error obteniendo tarjetas" });
  }
});

// Agregar tarjeta (encriptada)
router.post("/tienda/clientes/tarjetas", clienteAuth, async (req, res) => {
  try {
    const {
      numero_tarjeta,
      tipo,
      nombre_titular,
      fecha_vencimiento,
      cvv,
      es_principal,
    } = req.body;

    if (!numero_tarjeta || !tipo || !nombre_titular || !fecha_vencimiento) {
      return res.status(400).json({ error: "Faltan datos de la tarjeta" });
    }

    // Validar formato básico de tarjeta (16 dígitos)
    const numeroLimpio = numero_tarjeta.replace(/\s/g, "");
    if (numeroLimpio.length < 13 || numeroLimpio.length > 19) {
      return res.status(400).json({ error: "Número de tarjeta inválido" });
    }

    // Obtener últimos 4 dígitos
    const ultimosDigitos = numeroLimpio.slice(-4);

    // Encriptar datos completos (usar crypto para simplicidad, en producción usar librería de encriptación)
    const tokenEncriptado = crypto
      .createHash("sha256")
      .update(`${numeroLimpio}${cvv}${req.cliente.id}${Date.now()}`)
      .digest("hex");

    // Si se marca como principal, quitar principal de otras tarjetas
    if (es_principal) {
      dbVentas
        .prepare("UPDATE tienda_tarjetas SET es_principal = 0 WHERE cliente_id = ?")
        .run(req.cliente.id);
    }

    const result = dbVentas
      .prepare(
        `INSERT INTO tienda_tarjetas 
         (cliente_id, ultimos_digitos, tipo, nombre_titular, fecha_vencimiento, token_encriptado, es_principal)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.cliente.id,
        ultimosDigitos,
        tipo,
        nombre_titular.trim(),
        fecha_vencimiento,
        tokenEncriptado,
        es_principal ? 1 : 0
      );

    const nuevaTarjeta = dbVentas
      .prepare("SELECT id, ultimos_digitos, tipo, nombre_titular, fecha_vencimiento, es_principal FROM tienda_tarjetas WHERE id = ?")
      .get(result.lastInsertRowid);

    res.status(201).json(nuevaTarjeta);
  } catch (err) {
    console.error("Error agregando tarjeta:", err);
    res.status(500).json({ error: "Error agregando tarjeta" });
  }
});

// Eliminar tarjeta
router.delete("/tienda/clientes/tarjetas/:id", clienteAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const clienteId = req.cliente.id;

    // Verificar que la tarjeta pertenece al cliente
    const tarjeta = dbVentas
      .prepare("SELECT cliente_id FROM tienda_tarjetas WHERE id = ?")
      .get(id);

    if (!tarjeta || tarjeta.cliente_id !== clienteId) {
      return res.status(404).json({ error: "Tarjeta no encontrada" });
    }

    dbVentas.prepare("DELETE FROM tienda_tarjetas WHERE id = ?").run(id);

    res.json({ mensaje: "Tarjeta eliminada correctamente" });
  } catch (err) {
    console.error("Error eliminando tarjeta:", err);
    res.status(500).json({ error: "Error eliminando tarjeta" });
  }
});

// Obtener historial de pedidos del cliente
router.get("/tienda/clientes/pedidos", clienteAuth, async (req, res) => {
  try {
    const pedidos = dbVentas
      .prepare(
        `SELECT id, numero_pedido, total, metodo_pago, direccion_envio, estatus, fecha_pedido, fecha_envio, fecha_entrega
         FROM tienda_pedidos_clientes
         WHERE cliente_id = ?
         ORDER BY fecha_pedido DESC
         LIMIT 50`
      )
      .all(req.cliente.id);

    res.json(pedidos);
  } catch (err) {
    console.error("Error obteniendo pedidos:", err);
    res.status(500).json({ error: "Error obteniendo pedidos" });
  }
});

// ============================================================
// GESTIÓN DE CLIENTES (SOLO ADMIN)
// ============================================================

// Listar todos los clientes (solo admin)
router.get("/tienda/clientes", authRequired, async (req, res) => {
  try {
    // Verificar que el usuario sea admin
    const { getUserBundleByPhone } = await import("../middleware/autenticacion.js");
    const userBundle = getUserBundleByPhone(req.user.phone);
    
    if (!userBundle || !userBundle.roles || !userBundle.roles.includes("admin")) {
      return res.status(403).json({ error: "Solo administradores pueden ver esta información" });
    }

    const clientes = dbVentas
      .prepare(
        `SELECT id, email, nombre, telefono, activo, fecha_registro, ultimo_acceso
         FROM tienda_clientes
         ORDER BY fecha_registro DESC`
      )
      .all();

    res.json(clientes);
  } catch (err) {
    console.error("Error obteniendo clientes:", err);
    res.status(500).json({ error: "Error obteniendo clientes" });
  }
});

// ============================================================
// RECUPERACIÓN DE CONTRASEÑA
// ============================================================

// Solicitar código de recuperación
router.post("/tienda/clientes/recuperar-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ error: "El email es requerido" });
    }

    const emailLimpio = email.trim().toLowerCase();

    // Buscar cliente
    const cliente = dbVentas
      .prepare("SELECT id, nombre FROM tienda_clientes WHERE email = ? AND activo = 1")
      .get(emailLimpio);

    if (!cliente) {
      // Por seguridad, no revelar si el email existe o no
      return res.json({ 
        mensaje: "Si el email existe, se ha enviado un código de recuperación",
        ok: true 
      });
    }

    // Generar código de 6 dígitos
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Calcular fecha de expiración (15 minutos)
    const fechaExpiracion = new Date();
    fechaExpiracion.setMinutes(fechaExpiracion.getMinutes() + 15);

    // Guardar código en base de datos
    dbVentas
      .prepare(
        `UPDATE tienda_clientes 
         SET token_recuperacion = ?, token_recuperacion_expira = ?
         WHERE id = ?`
      )
      .run(codigo, fechaExpiracion.toISOString(), cliente.id);

    // Obtener nombre de la tienda desde personalización
    let nombreTienda = "Nuestra Tienda";
    try {
      const configNombre = dbUsers
        .prepare("SELECT valor FROM personalizacion WHERE clave = ?")
        .get("nombre_tienda");
      if (configNombre && configNombre.valor) {
        try {
          const nombreParsed = JSON.parse(configNombre.valor);
          if (typeof nombreParsed === "string" && nombreParsed.trim()) {
            nombreTienda = nombreParsed.trim();
          }
        } catch {
          // Si no es JSON, usar el valor directamente
          if (configNombre.valor.trim()) {
            nombreTienda = configNombre.valor.trim();
          }
        }
      }
    } catch (err) {
      // Si falla, usar el nombre por defecto
      console.warn("No se pudo obtener el nombre de la tienda, usando por defecto");
    }

    // Enviar código por email
    try {
      const { enviarCodigoRecuperacion } = await import("../utilidades/email.js");
      const emailEnviado = await enviarCodigoRecuperacion(emailLimpio, codigo, nombreTienda);
      
      if (!emailEnviado) {
        console.error(`⚠️ No se pudo enviar el email a ${emailLimpio} (SMTP no configurado o error)`);
        // En desarrollo, retornar el código como fallback
        if (process.env.NODE_ENV === "development") {
          console.log(`🔐 Código de recuperación (dev): ${codigo}`);
          return res.json({ 
            mensaje: "Si el email existe, se ha enviado un código de recuperación",
            ok: true,
            codigo: codigo // Solo en desarrollo
          });
        }
      }
    } catch (err) {
      console.error("Error enviando email de recuperación:", err);
      // En desarrollo, retornar el código como fallback
      if (process.env.NODE_ENV === "development") {
        console.log(`🔐 Código de recuperación (dev): ${codigo}`);
        return res.json({ 
          mensaje: "Si el email existe, se ha enviado un código de recuperación",
          ok: true,
          codigo: codigo // Solo en desarrollo
        });
      }
    }

    res.json({ 
      mensaje: "Si el email existe, se ha enviado un código de recuperación",
      ok: true
    });
  } catch (err) {
    console.error("Error en recuperación de contraseña:", err);
    res.status(500).json({ error: "Error procesando solicitud" });
  }
});

// Restablecer contraseña con código
router.post("/tienda/clientes/restablecer-password", async (req, res) => {
  try {
    const { email, codigo, password_nueva } = req.body;

    if (!email || !codigo || !password_nueva) {
      return res.status(400).json({ error: "Email, código y nueva contraseña son requeridos" });
    }

    if (password_nueva.length < 6) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
    }

    const emailLimpio = email.trim().toLowerCase();

    // Buscar cliente con código válido
    const cliente = dbVentas
      .prepare(
        `SELECT id, token_recuperacion, token_recuperacion_expira 
         FROM tienda_clientes 
         WHERE email = ? AND activo = 1`
      )
      .get(emailLimpio);

    if (!cliente) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    // Verificar código
    if (!cliente.token_recuperacion || cliente.token_recuperacion !== codigo) {
      return res.status(400).json({ error: "Código inválido" });
    }

    // Verificar expiración
    if (!cliente.token_recuperacion_expira) {
      return res.status(400).json({ error: "Código expirado" });
    }

    const fechaExpiracion = new Date(cliente.token_recuperacion_expira);
    if (fechaExpiracion < new Date()) {
      return res.status(400).json({ error: "Código expirado" });
    }

    // Hashear nueva contraseña
    const nuevoHash = await hashPassword(password_nueva);

    // Actualizar contraseña y limpiar código
    dbVentas
      .prepare(
        `UPDATE tienda_clientes 
         SET password_hash = ?, token_recuperacion = NULL, token_recuperacion_expira = NULL
         WHERE id = ?`
      )
      .run(nuevoHash, cliente.id);

    res.json({ mensaje: "Contraseña restablecida correctamente" });
  } catch (err) {
    console.error("Error restableciendo contraseña:", err);
    res.status(500).json({ error: "Error restableciendo contraseña" });
  }
});

export default router;
