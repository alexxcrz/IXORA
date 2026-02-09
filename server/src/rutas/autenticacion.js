// src/rutas/autenticacion.js
import express from "express";
import { getOtpStore } from "../utilidades/estado.js";
import { 
  getUserBundleByPhone, 
  getUserBundleByUsername,
  getUserBundleById,
  signToken, 
  authRequired,
  verifyPassword,
  hashPassword
} from "../middleware/autenticacion.js";
import { dbUsers } from "../config/baseDeDatos.js";
import { dbChat } from "../config/baseDeDatos.js";
import { getIO, getSocketsByNickname } from "../config/socket.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import logger from "../utilidades/logger.js";
import { strictAntiVPNMiddleware, getClientIP } from "../middleware/antiVPN.js";
import { bruteForceProtection, recordFailedAttempt, clearAttempts } from "../middleware/bruteForce.js";

const router = express.Router();
const otpStore = getOtpStore();

// 🔥 Asegurar que la carpeta de perfiles exista
const PERFILES_DIR = "uploads/perfiles";
if (!fs.existsSync(PERFILES_DIR)) {
  fs.mkdirSync(PERFILES_DIR, { recursive: true });
  console.log(`📁 [AUTH] Carpeta de perfiles creada: ${PERFILES_DIR}`);
}

const storage = multer.diskStorage({
  destination: PERFILES_DIR,
  filename: (req, file, cb) => {
    const userId = req.user?.id || "unknown";
    const ext = path.extname(file.originalname);
    cb(null, `user_${userId}${ext}`);
  },
});
const upload = multer({ storage });

// =====================================================
// 🔹 SOLICITAR OTP
// =====================================================
router.post("/auth/otp/request", strictAntiVPNMiddleware, bruteForceProtection, (req, res) => {
  console.log('📥 [AUTH] POST /auth/otp/request recibido');
  console.log('   Body:', req.body);
  console.log('   IP:', req.ip || req.connection.remoteAddress);
  
  const { phone } = req.body || {};
  if (!phone) {
    console.log('❌ [AUTH] Error: Falta phone en el body');
    return res.status(400).json({ error: "Falta phone" });
  }

  // Normalizar teléfono (solo números, sin espacios ni guiones)
  const phoneClean = String(phone).replace(/\D/g, "");
  console.log(`📱 [AUTH] Teléfono normalizado: ${phoneClean} (original: ${phone})`);
  
  if (phoneClean.length !== 10) {
    console.log(`❌ [AUTH] Error: Teléfono inválido. Longitud: ${phoneClean.length}, esperado: 10`);
    return res.status(400).json({ error: "Teléfono debe tener 10 dígitos" });
  }

  const code = ("" + Math.floor(100000 + Math.random() * 900000)).slice(-6);
  otpStore.set(phoneClean, { code, exp: Date.now() + 5 * 60 * 1000 });
  console.log(`💾 [AUTH] OTP almacenado en memoria para ${phoneClean}`);

  // Verificar si el usuario es admin
  let esAdmin = false;
  let pack = null;
  try {
    pack = getUserBundleByPhone(phoneClean);
    console.log(`👤 [AUTH] Usuario encontrado: ${pack?.user?.nickname || pack?.user?.name || 'No encontrado'}`);
    if (pack && pack.roles && pack.roles.includes("admin")) {
      esAdmin = true;
      console.log(`👑 [AUTH] Usuario es administrador`);
    }
  } catch (e) {
    console.log(`⚠️ [AUTH] Usuario no encontrado o error al buscar: ${e.message}`);
    // Si no se encuentra el usuario, no es admin
  }

  // Código OTP generado
  console.log(`🔐 [AUTH] OTP generado para ${phoneClean}: ${code}`);

  // Si es admin O no es admin, enviar por chat desde IXORA (SOLO admins reciben notificaciones en el cliente)
  try {
    const io = getIO();
    if (io) {
      // Obtener información del usuario que solicita OTP
      if (!pack) {
        pack = getUserBundleByPhone(phoneClean);
      }
      
      if (!pack || !pack.user) {
        // Usuario no encontrado en BD
        console.log(`⚠️ [AUTH] Usuario no encontrado en BD para ${phoneClean}`);
        return res.json({ ok: true, phone: phoneClean });
      }
      
      // Obtener nickname o name del usuario (mismo método que usa el chat)
      const nicknameDestino = pack.user.nickname || pack.user.name;
      console.log(`📨 [AUTH] Enviando OTP a: ${nicknameDestino}`);
      
      if (!nicknameDestino) {
        // Usuario sin nickname ni name
        console.log(`⚠️ [AUTH] Usuario sin nickname ni name para ${phoneClean}`);
        return res.json({ ok: true, phone: phoneClean });
      }
      
      // Enviar mensaje privado desde IXORA al usuario
      const mensajeOTP = `🔐 Tu código de acceso es: ${code}\n\n⏱️ Válido por 5 minutos`;
      
      // Guardar mensaje en BD
      const nuevoMensaje = dbChat.prepare(
        "INSERT INTO chat_privado (de_nickname, de_photo, para_nickname, mensaje) VALUES (?, ?, ?, ?)"
      ).run("IXORA", null, nicknameDestino, mensajeOTP);
      console.log(`💬 [AUTH] Mensaje OTP guardado en BD con ID: ${nuevoMensaje.lastInsertRowid}`);
      
      // Obtener el mensaje completo de la BD con formato correcto
      const mensajeCompleto = dbChat
        .prepare("SELECT * FROM chat_privado WHERE id = ?")
        .get(nuevoMensaje.lastInsertRowid);
      
      // Obtener sockets del usuario destino
      const socketsDestino = getSocketsByNickname(nicknameDestino);
      console.log(`🔌 [AUTH] Sockets encontrados para ${nicknameDestino}: ${socketsDestino.length}`);
      
      // Enviar mensaje por socket SOLO al usuario destino (no global)
      // Incluir flag esAdmin para que el cliente sepa si debe mostrar notificación
      if (socketsDestino.length > 0) {
        socketsDestino.forEach((socketId) => {
          io.to(socketId).emit("chat_privado_nuevo", {
            ...mensajeCompleto,
            es_admin: esAdmin // Flag para saber si es admin y mostrar notificación
          });
        });
        console.log(`✅ [AUTH] Mensaje OTP enviado por socket a ${socketsDestino.length} socket(s)`);
      } else {
        console.log(`⚠️ [AUTH] Usuario ${nicknameDestino} no tiene sockets activos, mensaje guardado en BD`);
      }
      
      // SIEMPRE emitir evento para actualizar chats activos SOLO al usuario destino
      // Esto asegura que el chat con IXORA aparezca en la lista cuando el usuario abra el chat
      if (socketsDestino.length > 0) {
        socketsDestino.forEach((socketId) => {
          io.to(socketId).emit("chats_activos_actualizados");
        });
      }
    } else {
      console.log(`⚠️ [AUTH] Socket.io no disponible`);
    }
  } catch (e) {
    console.error(`❌ [AUTH] Error enviando OTP por chat:`, e);
  }

  res.json({ ok: true, phone: phoneClean });
});

// =====================================================
// 🔹 VERIFICAR OTP (LOGIN COMPLETAMENTE FIJO)
// =====================================================
router.post("/auth/otp/verify", strictAntiVPNMiddleware, bruteForceProtection, async (req, res) => {
  console.log('🔍 [AUTH] POST /auth/otp/verify recibido');
  console.log('   Body:', { phone: req.body.phone ? '***' + req.body.phone.slice(-4) : 'no phone', code: req.body.code ? '***' : 'no code' });
  console.log('   IP:', req.ip || req.connection.remoteAddress);
  
  const phoneRaw = String(req.body.phone || "");
  const code = String(req.body.code || "");

  if (!phoneRaw || !code) {
    console.log('❌ [AUTH] Error: Faltan datos en verify');
    return res.status(400).json({ error: "Faltan datos" });
  }

  // Normalizar teléfono (igual que en request)
  const phone = phoneRaw.replace(/\D/g, "");
  console.log(`📱 [AUTH] Teléfono normalizado en verify: ${phone} (original: ${phoneRaw})`);
  
  if (phone.length !== 10) {
    console.log(`❌ [AUTH] Error: Teléfono inválido en verify. Longitud: ${phone.length}`);
    return res.status(400).json({ error: "Teléfono inválido" });
  }

  // Verificando código OTP
  const rec = otpStore.get(phone);
  console.log(`🔍 [AUTH] Buscando OTP para ${phone}: ${rec ? 'Encontrado' : 'No encontrado'}`);
  
  if (!rec) {
    // OTP no encontrado
    console.log(`❌ [AUTH] OTP no encontrado para ${phone}`);
    return res.status(401).json({ error: "OTP no solicitado. Por favor, solicita un nuevo código." });
  }

  if (Date.now() > rec.exp) {
    console.log(`⏰ [AUTH] OTP expirado para ${phone}. Exp: ${new Date(rec.exp).toISOString()}, Ahora: ${new Date().toISOString()}`);
    otpStore.delete(phone);
    return res.status(401).json({ error: "OTP expirado" });
  }

  console.log(`🔐 [AUTH] Comparando códigos: Recibido: ${code}, Esperado: ${rec.code}`);
  
  if (rec.code !== code) {
    console.log(`❌ [AUTH] OTP incorrecto para ${phone}. Recibido: ${code}, Esperado: ${rec.code}`);
    // Registrar intento fallido
    const ip = getClientIP(req);
    const phoneClean = phone.replace(/\D/g, "");
    // Ejecutar sin esperar (fire and forget)
    recordFailedAttempt(`account:${phoneClean}`).catch(() => {});
    recordFailedAttempt(`ip:${ip}`).catch(() => {});
    return res.status(401).json({ error: "OTP incorrecto" });
  }

  console.log(`✅ [AUTH] OTP correcto para ${phone}`);
  otpStore.delete(phone);
  
  // Limpiar intentos exitosos
  const ip = getClientIP(req);
  const phoneClean = phone.replace(/\D/g, "");
  clearAttempts(`account:${phoneClean}`);
  clearAttempts(`ip:${ip}`);

  let pack = getUserBundleByPhone(phone);
  console.log(`👤 [AUTH] Usuario encontrado para ${phone}: ${pack?.user?.nickname || pack?.user?.name || 'No encontrado'}`);
  
  if (!pack || !pack.user?.active) {
    console.log(`❌ [AUTH] Usuario inactivo o no registrado para ${phone}`);
    return res.status(403).json({ error: "Usuario inactivo o no registrado" });
  }

  // 🔥 NO LIMPIAR SESIONES AL HACER LOGIN - PERMITIR MÚLTIPLES SESIONES
  // La limpieza de sesiones antiguas se hará de forma asíncrona por el middleware de seguridad
  // NO TOCAR LAS SESIONES EXISTENTES

  // 🔥 FIX 2: RECALCULAR ROLES Y PERMISOS (IMPORTANTE!)
  pack = getUserBundleByPhone(phone);
  console.log(`🔑 [AUTH] Roles: ${pack?.roles?.join(', ') || 'Sin roles'}, Permisos: ${pack?.perms?.length || 0} permisos`);

  // 🔥 GENERAR TOKEN CON PERMISOS YA CORRECTOS
  const token = signToken({
    id: pack.user.id,
    phone: pack.user.phone,
    name: pack.user.name,
    nickname: pack.user.nickname || null,
    roles: pack.roles,
    perms: pack.perms,
    password_temporary: pack.user.password_temporary || 0,
  });

  // 🔥 GUARDAR NUEVA SESIÓN - CRÍTICO: Asegurar que se guarde correctamente
  try {
    // Insertar la sesión con created_at y last_seen_at usando datetime('now') para consistencia
    // datetime('now') en SQLite usa UTC, lo que evita problemas de zona horaria
    dbUsers.prepare(`
      INSERT INTO user_sessions (user_id, token, user_agent, last_seen_at, created_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `).run(pack.user.id, token, req.headers["user-agent"] || "desconocido");
    
    // Verificar inmediatamente que la sesión se creó
    const session = dbUsers.prepare(`
      SELECT id, token, user_id, last_seen_at, created_at FROM user_sessions WHERE token = ?
    `).get(token);
    
    if (session && session.token === token && session.user_id === pack.user.id) {
      // Sesión creada correctamente
    } else {
      console.error(`❌ ERROR CRÍTICO: Sesión no se encontró después de crear. Token: ${token.substring(0, 30)}...`);
      console.error(`   Token length: ${token.length}`);
      if (session) {
        console.error(`   Sesión encontrada pero no coincide:`);
        console.error(`   - Token esperado: ${token.substring(0, 30)}... (length: ${token.length})`);
        console.error(`   - Token en BD: ${session.token?.substring(0, 30)}... (length: ${session.token?.length || 0})`);
        console.error(`   - user_id esperado: ${pack.user.id}, user_id en BD: ${session.user_id}`);
        console.error(`   - Token coincide: ${session.token === token}`);
      }
      // Intentar crear de nuevo como último recurso
      try {
        dbUsers.prepare(`
          INSERT OR IGNORE INTO user_sessions (user_id, token, user_agent, last_seen_at, created_at)
          VALUES (?, ?, ?, datetime('now'), datetime('now'))
        `).run(pack.user.id, token, req.headers["user-agent"] || "desconocido");
        // Verificar de nuevo
        const retrySession = dbUsers.prepare(`
          SELECT id, token, user_id FROM user_sessions WHERE token = ?
        `).get(token);
        if (retrySession) {
          // Sesión creada en segundo intento
        }
      } catch (err2) {
        console.error("❌ Error en segundo intento de crear sesión:", err2);
      }
    }
  } catch (err) {
    console.error("❌ Error creando sesión:", err);
    // Fallback: intentar crear sin especificar last_seen_at
    try {
      dbUsers.prepare(`
        INSERT INTO user_sessions (user_id, token, user_agent)
        VALUES (?, ?, ?)
      `).run(pack.user.id, token, req.headers["user-agent"] || "desconocido");
      // Sesión creada (fallback)
    } catch (err2) {
      console.error("❌ Error crítico en fallback de creación de sesión:", err2);
    }
  }

  const response = {
    token,
    user: {
      id: pack.user.id,
      name: pack.user.name,
      phone: pack.user.phone,
      nickname: pack.user.nickname || null,
      photo: pack.user.photo || null,
      puesto: pack.user.puesto || null,
      correo: pack.user.correo || null,
      mostrar_telefono: pack.user.mostrar_telefono ?? 1,
      birthday: pack.user.birthday || null,
      password_temporary: pack.user.password_temporary || 0,
    },
    roles: pack.roles,
    perms: pack.perms,
  };
  
  res.json(response);
});

// =====================================================
// 🔹 ACTUALIZAR NICKNAME
// =====================================================
router.post("/auth/nickname", authRequired, (req, res) => {
  const { nickname } = req.body || {};
  const userId = req.user.id;

  if (!nickname || nickname.trim().length < 2) {
    return res.status(400).json({ error: "Apodo inválido" });
  }

  try {
    dbUsers.prepare(`UPDATE users SET nickname=? WHERE id=?`).run(
      nickname.trim(),
      userId
    );

    res.json({ ok: true, nickname: nickname.trim() });
  } catch (err) {
    console.error("Error guardando nickname:", err);
    res.status(500).json({ error: "Error al guardar nickname" });
  }
});

router.post(
  "/auth/photo",
  authRequired,
  upload.single("photo"),
  (req, res) => {
    const userId = req.user.id;
    if (!req.file) {
      return res.status(400).json({ error: "No se envió foto" });
    }

    try {
      // 🔥 Obtener foto anterior para eliminarla si tiene extensión diferente
      const userAnterior = dbUsers.prepare(`SELECT photo FROM users WHERE id=?`).get(userId);
      const fotoAnterior = userAnterior?.photo;
      
      const filename = req.file.filename;
      dbUsers.prepare(`UPDATE users SET photo=? WHERE id=?`).run(filename, userId);

      // 🔥 Eliminar foto anterior si existe y tiene extensión diferente
      if (fotoAnterior && fotoAnterior !== filename) {
        const rutaFotoAnterior = path.join(PERFILES_DIR, fotoAnterior);
        if (fs.existsSync(rutaFotoAnterior)) {
          try {
            fs.unlinkSync(rutaFotoAnterior);
            console.log(`🗑️ [AUTH] Foto anterior eliminada: ${fotoAnterior}`);
          } catch (e) {
            console.warn(`⚠️ [AUTH] No se pudo eliminar foto anterior: ${e.message}`);
          }
        }
      }

      res.json({ ok: true, photo: filename });
    } catch (err) {
      console.error("Error guardando foto:", err);
      res.status(500).json({ error: "Error al guardar foto" });
    }
  }
);

// =====================================================
// 🔹 ACTUALIZAR INFORMACIÓN DE PERFIL
// =====================================================
router.put("/auth/perfil-info", authRequired, (req, res) => {
  try {
    const userId = req.user.id;
    const { puesto, correo, mostrar_telefono, birthday } = req.body || {};

    const puestoFinal = puesto ? String(puesto).trim() : null;
    const correoFinal = correo ? String(correo).trim() : null;
    // Validar que birthday sea una fecha válida o null
    let birthdayFinal = null;
    if (birthday && String(birthday).trim()) {
      const birthdayStr = String(birthday).trim();
      // Validar formato de fecha (YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}$/.test(birthdayStr)) {
        birthdayFinal = birthdayStr;
      } else {
        console.warn(`⚠️ Formato de fecha inválido: ${birthdayStr}`);
      }
    }
    // Normalizar mostrar_telefono: debe ser 0 o 1 (INTEGER)
    let mostrarTelefonoFinal = 1; // Por defecto activo
    if (mostrar_telefono === 0 || mostrar_telefono === "0" || mostrar_telefono === false || mostrar_telefono === null) {
      mostrarTelefonoFinal = 0;
    }

    console.log(`📝 Actualizando perfil para usuario ${userId}:`, {
      puesto: puestoFinal,
      correo: correoFinal,
      birthday: birthdayFinal,
      mostrar_telefono_recibido: mostrar_telefono,
      mostrar_telefono_guardado: mostrarTelefonoFinal,
      tipo_recibido: typeof mostrar_telefono
    });

    // Ejecutar la actualización
    const updateResult = dbUsers
      .prepare(
        `UPDATE users
         SET puesto = ?, correo = ?, mostrar_telefono = ?, birthday = ?
         WHERE id = ?`
      )
      .run(puestoFinal, correoFinal, mostrarTelefonoFinal, birthdayFinal, userId);

    console.log(`📝 Resultado de UPDATE:`, {
      changes: updateResult.changes,
      lastInsertRowid: updateResult.lastInsertRowid
    });

    // Verificar que se actualizó correctamente
    if (updateResult.changes === 0) {
      console.warn(`⚠️ No se actualizó ningún registro para el usuario ${userId}`);
    }

    // Obtener los datos actualizados inmediatamente después
    const actualizado = dbUsers
      .prepare("SELECT id, name, phone, nickname, photo, puesto, correo, mostrar_telefono, birthday, password_temporary FROM users WHERE id = ?")
      .get(userId);

    console.log(`✅ Perfil actualizado en BD:`, {
      id: actualizado?.id,
      puesto: actualizado?.puesto || 'null',
      correo: actualizado?.correo || 'null',
      birthday: actualizado?.birthday || 'null',
      mostrar_telefono: actualizado?.mostrar_telefono,
      tipo_mostrar_telefono: typeof actualizado?.mostrar_telefono
    });

    // Verificar que los datos se guardaron correctamente
    if (!actualizado) {
      console.error(`❌ Error: No se pudo obtener el usuario actualizado con id ${userId}`);
      return res.status(500).json({ error: "Error al obtener datos actualizados del usuario" });
    }

    res.json({ ok: true, user: actualizado });
  } catch (err) {
    console.error("❌ Error actualizando perfil:", err);
    res.status(500).json({ error: "Error actualizando perfil", details: err.message });
  }
});

// =====================================================
// 🔒 HELPERS PARA PROTECCIÓN CONTRA FUERZA BRUTA
// =====================================================
const MAX_LOGIN_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS || "5", 10);
const LOCKOUT_DURATION_MINUTES = parseInt(process.env.LOCKOUT_DURATION_MINUTES || "15", 10);

function checkLoginLockout(identifier) {
  const attempt = dbUsers.prepare(`
    SELECT * FROM login_attempts WHERE identifier = ?
  `).get(identifier);

  if (!attempt) return { locked: false };

  // Verificar si está bloqueado
  if (attempt.locked_until) {
    const lockedUntil = new Date(attempt.locked_until);
    const now = new Date();
    if (lockedUntil > now) {
      const minutesLeft = Math.ceil((lockedUntil - now) / 1000 / 60);
      return { 
        locked: true, 
        minutesLeft,
        message: `Cuenta bloqueada. Intenta nuevamente en ${minutesLeft} minuto(s).`
      };
    }
    // El bloqueo expiró, limpiar
    dbUsers.prepare(`
      UPDATE login_attempts 
      SET attempts = 0, locked_until = NULL 
      WHERE identifier = ?
    `).run(identifier);
    return { locked: false };
  }

  return { locked: false, attempts: attempt.attempts || 0 };
}

function recordFailedLogin(identifier, ipAddress) {
  const now = new Date();
  const attempt = dbUsers.prepare(`
    SELECT * FROM login_attempts WHERE identifier = ?
  `).get(identifier);

  if (!attempt) {
    // Primera vez
    dbUsers.prepare(`
      INSERT INTO login_attempts (identifier, ip_address, attempts, last_attempt)
      VALUES (?, ?, 1, ?)
    `).run(identifier, ipAddress, now.toISOString());
  } else {
    const newAttempts = (attempt.attempts || 0) + 1;
    let lockedUntil = null;

    // Si excede el máximo, bloquear
    if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
      const lockoutEnd = new Date(now.getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
      lockedUntil = lockoutEnd.toISOString();
    }

    dbUsers.prepare(`
      UPDATE login_attempts 
      SET attempts = ?, locked_until = ?, last_attempt = ?, ip_address = ?
      WHERE identifier = ?
    `).run(newAttempts, lockedUntil, now.toISOString(), ipAddress, identifier);
  }
}

function clearLoginAttempts(identifier) {
  dbUsers.prepare(`
    DELETE FROM login_attempts WHERE identifier = ?
  `).run(identifier);
}

// =====================================================
// 🔹 LOGIN CON USUARIO Y CONTRASEÑA (CON PROTECCIÓN)
// =====================================================
router.post("/auth/login", strictAntiVPNMiddleware, bruteForceProtection, async (req, res) => {
  console.log('📥 [AUTH] POST /auth/login recibido');
  console.log('   Body:', { username: req.body?.username ? '***' : undefined, password: req.body?.password ? '***' : undefined });
  console.log('   IP:', req.ip || req.connection.remoteAddress);
  
  const { username, password } = req.body || {};

  if (!username || !password) {
    console.log('❌ [AUTH] Error: Usuario o contraseña faltantes');
    return res.status(400).json({ error: "Usuario y contraseña requeridos" });
  }

  try {
    // Buscar usuario por username (trim para eliminar espacios)
    const usernameTrimmed = username.trim();
    const clientIP = getClientIP(req);
    const identifier = usernameTrimmed.toLowerCase();

    // 🔒 Verificar si la cuenta está bloqueada
    const lockoutCheck = checkLoginLockout(identifier);
    if (lockoutCheck.locked) {
      logger.security.loginBlocked(usernameTrimmed, clientIP, lockoutCheck.minutesLeft);
      return res.status(423).json({ 
        error: lockoutCheck.message || "Cuenta temporalmente bloqueada por múltiples intentos fallidos"
      });
    }

    let pack = getUserBundleByUsername(usernameTrimmed);
    
    if (!pack || !pack.user?.active) {
      logger.security.loginAttempt(usernameTrimmed, false, clientIP, "Usuario no encontrado o inactivo");
      recordFailedLogin(identifier, clientIP);
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    }

    // Verificar que el usuario tenga password_hash
    if (!pack.user.password_hash) {
      logger.security.loginAttempt(usernameTrimmed, false, clientIP, "Usuario sin contraseña configurada");
      recordFailedLogin(identifier, clientIP);
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    }

    // Verificar contraseña
    const isValid = await verifyPassword(password, pack.user.password_hash);
    if (!isValid) {
      logger.security.loginAttempt(usernameTrimmed, false, clientIP, "Contraseña incorrecta");
      recordFailedLogin(identifier, clientIP);
      
      // Verificar si ahora está bloqueado después de este intento
      const newLockoutCheck = checkLoginLockout(identifier);
      if (newLockoutCheck.locked) {
        logger.security.loginBlocked(usernameTrimmed, clientIP, newLockoutCheck.minutesLeft);
        return res.status(423).json({ 
          error: newLockoutCheck.message || "Cuenta bloqueada por múltiples intentos fallidos"
        });
      }
      
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    }

    // ✅ Login exitoso - limpiar intentos fallidos
    clearLoginAttempts(identifier);
    logger.security.loginAttempt(usernameTrimmed, true, clientIP);

    // 🔥 NO LIMPIAR SESIONES AL HACER LOGIN - PERMITIR MÚLTIPLES SESIONES
    // La limpieza de sesiones antiguas se hará de forma asíncrona por el middleware de seguridad
    // NO TOCAR LAS SESIONES EXISTENTES

    // 🔥 RECALCULAR ROLES Y PERMISOS
    pack = getUserBundleByUsername(username);

    // � Verificar si el usuario es admin o CEO - Requiere NIP
    const isAdminOrCEO = pack.roles && (pack.roles.includes("admin") || pack.roles.includes("CEO"));
    
    // �🔥 GENERAR TOKEN
    const token = signToken({
      id: pack.user.id,
      phone: pack.user.phone,
      name: pack.user.name,
      nickname: pack.user.nickname || null,
      username: pack.user.username || null,
      roles: pack.roles,
      perms: pack.perms,
      password_temporary: pack.user.password_temporary || 0,
    });

    // 🔥 GUARDAR NUEVA SESIÓN - CRÍTICO: Asegurar que se guarde correctamente
    try {
      // Verificar si el usuario tiene sesiones previas
      const existingSessions = dbUsers.prepare(`
        SELECT COUNT(*) as count FROM user_sessions WHERE user_id = ?
      `).get(pack.user.id);
      
      const isFirstLogin = !existingSessions || existingSessions.count === 0;
      
      // Insertar la sesión
      dbUsers.prepare(`
        INSERT INTO user_sessions (user_id, token, user_agent, last_seen_at, created_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
      `).run(pack.user.id, token, req.headers["user-agent"] || "desconocido");
      
      // Verificar inmediatamente que la sesión se creó
      const session = dbUsers.prepare(`
        SELECT id, token, user_id, last_seen_at, created_at FROM user_sessions WHERE token = ?
      `).get(token);
      
      if (session && session.token === token && session.user_id === pack.user.id) {
        // Sesión creada correctamente
      } else {
        console.error(`❌ ERROR CRÍTICO: Sesión no se encontró después de crear. Token: ${token.substring(0, 20)}...`);
        // Intentar crear de nuevo como último recurso
        try {
          dbUsers.prepare(`
            INSERT OR IGNORE INTO user_sessions (user_id, token, user_agent, last_seen_at, created_at)
            VALUES (?, ?, ?, datetime('now'), datetime('now'))
          `).run(pack.user.id, token, req.headers["user-agent"] || "desconocido");
        } catch (err2) {
          console.error("❌ Error en segundo intento de crear sesión:", err2);
        }
      }

      // 🎯 Si es el primer login, emitir evento de "usuario_unido" a todos los usuarios conectados
      if (isFirstLogin) {
        try {
          const io = getIO();
          if (io) {
            console.log(`✨ [AUTH] Primer login detectado para usuario ${pack.user.name}. Emitiendo evento usuario_unido...`);
            io.emit("usuario_unido", {
              nickname: pack.user.nickname || pack.user.name,
              photo: pack.user.photo || null,
            });
          }
        } catch (e) {
          console.error("Error emitiendo evento usuario_unido:", e);
        }
      }
    } catch (err) {
      console.error("❌ Error creando sesión:", err);
      // Fallback: intentar crear sin especificar last_seen_at
      try {
        dbUsers.prepare(`
          INSERT INTO user_sessions (user_id, token, user_agent)
          VALUES (?, ?, ?)
        `).run(pack.user.id, token, req.headers["user-agent"] || "desconocido");
        // Sesión creada (fallback)
      } catch (err2) {
        console.error("❌ Error crítico en fallback de creación de sesión:", err2);
      }
    }

    res.json({
      token,
      user: {
        id: pack.user.id,
        name: pack.user.name,
        phone: pack.user.phone,
        nickname: pack.user.nickname || null,
        photo: pack.user.photo || null,
        username: pack.user.username || null,
        password_temporary: pack.user.password_temporary || 0,
      },
      roles: pack.roles,
      perms: pack.perms,
    });
  } catch (err) {
    console.error("Error en login:", err);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// =====================================================
// 🔹 CAMBIAR CONTRASEÑA (usuario autenticado)
// =====================================================
router.post("/auth/change-password", authRequired, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const userId = req.user.id;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
  }

  try {
    const user = dbUsers.prepare("SELECT * FROM users WHERE id=?").get(userId);
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    // Si la contraseña NO es temporal, verificar contraseña actual
    const isTemporary = user.password_temporary === 1 || user.password_temporary === true;
    if (!isTemporary && user.password_hash) {
      if (!currentPassword) {
        return res.status(400).json({ error: "Contraseña actual requerida" });
      }
      const isValid = await verifyPassword(currentPassword, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: "Contraseña actual incorrecta" });
      }
    }
    // Si es temporal, no se requiere verificar la contraseña actual

    // Hashear nueva contraseña
    const newHash = await hashPassword(newPassword);

    // Actualizar contraseña y marcar como no temporal
    dbUsers.prepare(`
      UPDATE users 
      SET password_hash = ?, password_temporary = 0 
      WHERE id = ?
    `).run(newHash, userId);

    res.json({ ok: true, message: "Contraseña actualizada correctamente" });
  } catch (err) {
    console.error("Error cambiando contraseña:", err);
    res.status(500).json({ error: "Error al cambiar contraseña" });
  }
});

// =====================================================
// 🔹 OBTENER TEMA PERSONAL DEL USUARIO
// =====================================================
router.get("/usuario/tema-personal", authRequired, (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Usuario no autenticado" });
    }

    const user = dbUsers.prepare("SELECT tema_personal FROM users WHERE id = ?").get(userId);
    let tema = user?.tema_personal;
    
    // Migración: convertir "invertido" a "modoOscuro"
    if (tema === "invertido") {
      tema = "modoOscuro";
      // Actualizar en la base de datos
      dbUsers.prepare("UPDATE users SET tema_personal = ? WHERE id = ?").run(tema, userId);
    }
    
    if (tema) {
      res.json({ tema });
    } else {
      res.json({ tema: null });
    }
  } catch (err) {
    console.error("Error obteniendo tema personal:", err);
    res.status(500).json({ error: "Error obteniendo tema personal" });
  }
});

// =====================================================
// 🔹 GUARDAR TEMA PERSONAL DEL USUARIO
// =====================================================
router.post("/usuario/tema-personal", authRequired, (req, res) => {
  try {
    const userId = req.user?.id;
    const { tema } = req.body || {};

    if (!userId) {
      return res.status(401).json({ error: "Usuario no autenticado" });
    }

    // Verificar que la columna existe
    try {
      dbUsers.exec(`ALTER TABLE users ADD COLUMN tema_personal TEXT;`);
    } catch (e) {
      // La columna ya existe, continuar
    }

    // Guardar el tema
    dbUsers
      .prepare("UPDATE users SET tema_personal = ? WHERE id = ?")
      .run(tema || null, userId);

    // Emitir evento de socket para sincronizar en todos los dispositivos del usuario
    const io = getIO();
    if (io) {
      // Emitir globalmente - el cliente filtrará por userId
      io.emit("tema_personal_actualizado", { 
        userId, 
        tema: tema || null 
      });
    }

    res.json({ ok: true, tema: tema || null });
  } catch (err) {
    console.error("Error guardando tema personal:", err);
    res.status(500).json({ error: "Error guardando tema personal" });
  }
});

// =====================================================
// 🔹 REFRESCAR PERMISOS (sin cerrar sesión)
// =====================================================
router.get("/auth/refresh-perms", authRequired, (req, res) => {
  try {
    const userId = req.user.id;
    
    // Recalcular permisos del usuario usando getUserBundleById
    const pack = getUserBundleById(userId);
    
    if (!pack || !pack.user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    // pack.perms ya contiene todos los permisos (directos, por roles, etc.)
    res.json({
      perms: pack.perms || [],
      roles: pack.roles || []
    });
  } catch (err) {
    console.error("Error refrescando permisos:", err);
    res.status(500).json({ error: "Error refrescando permisos" });
  }
});

// =====================================================
// 🔹 OBTENER DATOS ACTUALIZADOS DEL USUARIO (sin cerrar sesión)
// =====================================================
router.get("/auth/user", authRequired, (req, res) => {
  try {
    const userId = req.user.id;
    
    // Obtener datos actualizados del usuario desde la base de datos
    const pack = getUserBundleById(userId);
    
    if (!pack || !pack.user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    res.json({
      user: {
        id: pack.user.id,
        name: pack.user.name,
        phone: pack.user.phone,
        nickname: pack.user.nickname || null,
        photo: pack.user.photo || null,
        puesto: pack.user.puesto || null,
        correo: pack.user.correo || null,
        mostrar_telefono: pack.user.mostrar_telefono ?? 1,
        birthday: pack.user.birthday || null,
        password_temporary: pack.user.password_temporary || 0,
      },
      perms: pack.perms || [],
      roles: pack.roles || []
    });
  } catch (err) {
    console.error("Error obteniendo datos del usuario:", err);
    res.status(500).json({ error: "Error obteniendo datos del usuario" });
  }
});

// =====================================================
// 🔐 ESTABLECER NIP PARA ADMIN/CEO
// =====================================================
router.post("/auth/set-nip", authRequired, async (req, res) => {
  try {
    const { nip } = req.body || {};
    const userId = req.user.id;

    // Validar que sea admin o CEO
    const pack = getUserBundleById(userId);
    if (!pack || !pack.roles || (!pack.roles.includes("admin") && !pack.roles.includes("CEO"))) {
      return res.status(403).json({ error: "Solo admin o CEO pueden establecer NIP" });
    }

    // Validar NIP: debe ser 6 dígitos
    if (!nip || typeof nip !== "string" || !/^\d{6}$/.test(nip)) {
      return res.status(400).json({ error: "NIP debe ser 6 dígitos" });
    }

    // Hashear el NIP igual que las contraseñas
    const nipHash = await hashPassword(nip);

    // Guardar el NIP en la base de datos
    dbUsers.prepare(`
      UPDATE users SET nip_hash = ? WHERE id = ?
    `).run(nipHash, userId);

    console.log(`🔐 [AUTH] NIP establecido para usuario ${pack.user.name} (ID: ${userId})`);

    res.json({ ok: true, message: "NIP establecido correctamente" });
  } catch (err) {
    console.error("Error estableciendo NIP:", err);
    res.status(500).json({ error: "Error estableciendo NIP" });
  }
});

// =====================================================
// 🔐 VERIFICAR NIP PARA ADMIN/CEO
// =====================================================
router.post("/auth/verify-nip", authRequired, async (req, res) => {
  try {
    const { nip } = req.body || {};
    const userId = req.user.id;

    // Validar que sea admin o CEO
    const pack = getUserBundleById(userId);
    if (!pack || !pack.roles || (!pack.roles.includes("admin") && !pack.roles.includes("CEO"))) {
      return res.status(403).json({ error: "Solo admin o CEO pueden verificar NIP" });
    }

    // Validar NIP: debe ser 6 dígitos
    if (!nip || typeof nip !== "string" || !/^\d{6}$/.test(nip)) {
      return res.status(400).json({ error: "NIP debe ser 6 dígitos" });
    }

    // Obtener el NIP hash del usuario
    const user = dbUsers.prepare(`
      SELECT nip_hash FROM users WHERE id = ?
    `).get(userId);

    if (!user || !user.nip_hash) {
      return res.status(400).json({ error: "Este usuario no tiene NIP configurado" });
    }

    // Verificar el NIP
    const isValid = await verifyPassword(nip, user.nip_hash);
    if (!isValid) {
      console.log(`❌ [AUTH] NIP incorrecto para usuario ${pack.user.name}`);
      return res.status(401).json({ error: "NIP incorrecto" });
    }

    console.log(`✅ [AUTH] NIP verificado correctamente para usuario ${pack.user.name}`);

    res.json({ ok: true, message: "NIP verificado correctamente" });
  } catch (err) {
    console.error("Error verificando NIP:", err);
    res.status(500).json({ error: "Error verificando NIP" });
  }
});

// =====================================================
// 🔹 GENERAR CÓDIGO DE CONFIRMACIÓN Y ENVIAR VIA CHAT
// =====================================================
router.post("/auth/confirmation-code/generate", authRequired, async (req, res) => {
  try {
    const { accion, detalles } = req.body;
    const userId = req.user.id;

    // Validar que la acción sea válida
    const accionesValidas = ["delete_user", "reset_password", "change_permissions", "change_roles", "cambiar_fecha"];
    if (!accionesValidas.includes(accion)) {
      return res.status(400).json({ error: "Acción no válida" });
    }

    // Obtener información del usuario que solicita la acción
    const usuarioSolicitante = getUserBundleById(userId);
    if (!usuarioSolicitante) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    // Generar código aleatorio de 6 dígitos
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Código expira en 10 minutos
    const ahora = new Date();
    const expiracion = new Date(ahora.getTime() + 10 * 60000);

    console.log(`\n🔐 [GENERAR] Creando nuevo código...`);
    console.log(`   Usuario ID: ${userId} (${usuarioSolicitante.user.name})`);
    console.log(`   Código: ${codigo}`);
    console.log(`   Acción: ${accion}`);

    // Guardar el código en la base de datos
    const resultado = dbUsers.prepare(`
      INSERT INTO confirmation_codes (usuario_id, codigo, accion, detalles, expira_en)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, codigo, accion, detalles || null, expiracion.toISOString());

    console.log(`   ✅ Código guardado en BD (ID: ${resultado.lastInsertRowid})`);

    // Buscar usuarios con permiso para recibir códigos
    const usuariosConPermiso = dbUsers.prepare(`
      SELECT DISTINCT u.id, u.name, u.nickname, u.photo
      FROM users u
      JOIN user_permissions up ON u.id = up.user_id
      JOIN permissions p ON up.perm_id = p.id
      WHERE p.perm = 'admin.confirmacion.recibir_codigos'
      AND u.active = 1
    `).all();

    console.log(`\n📋 [CODIGOS] Buscando usuarios con permiso 'admin.confirmacion.recibir_codigos'...`);
    console.log(`   Encontrados: ${usuariosConPermiso.length} usuario(s)`);
    usuariosConPermiso.forEach(u => console.log(`   ✓ ${u.name} (${u.nickname || 'sin nickname'})`));

    // Enviar mensaje privado de chat a cada usuario con permiso
    const io = getIO();
    for (const usuarioDestino of usuariosConPermiso) {
      const destinoNickname = usuarioDestino.nickname || usuarioDestino.name;
      
      // Crear mensaje descriptivo
      let mensajeAccion = "";
      switch(accion) {
        case "cambiar_fecha":
          mensajeAccion = "cambiar la fecha del sistema";
          break;
        case "delete_user":
          mensajeAccion = "eliminar un usuario";
          break;
        case "reset_password":
          mensajeAccion = "restablecer contraseña de un usuario";
          break;
        default:
          mensajeAccion = "realizar una acción administrativa";
      }

      const mensajeTexto = `🔐 ${usuarioSolicitante.user.name} quiere ${mensajeAccion}.\n\nCódigo de confirmación: ${codigo}\n\n⏱️ Válido por 10 minutos`;

      try {
        // Insertar mensaje en chat privado desde "IXORA"
        const resultado = dbChat.prepare(`
          INSERT INTO chat_privado 
          (de_nickname, de_photo, para_nickname, mensaje, tipo_mensaje) 
          VALUES (?, ?, ?, ?, ?)
        `).run(
          "IXORA",
          null,
          destinoNickname,
          mensajeTexto,
          "sistema"
        );

        const nuevoMensaje = dbChat.prepare("SELECT * FROM chat_privado WHERE id = ?")
          .get(resultado.lastInsertRowid);

        // Emitir via Socket.io
        if (io) {
          io.emit("chat_privado_nuevo", nuevoMensaje);
          console.log(`  ✉️ [CHAT] Mensaje enviado a ${destinoNickname} via Socket.io`);
        }

        console.log(`  ✅ [CHAT] Código guardado en chat privado para ${destinoNickname}`);
      } catch (chatErr) {
        console.error(`  ❌ [CHAT] Error enviando mensaje a ${destinoNickname}:`, chatErr.message);
      }
    }

    console.log(`✅ [AUTH] Código de confirmación generado para ${usuarioSolicitante.user.name} - Acción: ${accion}`);
    console.log(`🔐 [CODIGO] Valor: ${codigo} (válido por 10 minutos)`);
    console.log(`📤 [DISTRIBUCION] Mensajes enviados a ${usuariosConPermiso.length} usuario(s)\n`);

    res.json({ 
      ok: true, 
      message: `Código enviado a ${usuariosConPermiso.length} usuario(s) con permiso`,
      expires_in: 600
    });
  } catch (err) {
    console.error("Error generando código de confirmación:", err);
    res.status(500).json({ error: "Error generando código" });
  }
});

// =====================================================
// 🔹 VALIDAR CÓDIGO DE CONFIRMACIÓN
// =====================================================
router.post("/auth/confirmation-code/validate", authRequired, async (req, res) => {
  try {
    const { codigo, accion } = req.body;
    const userId = req.user.id;

    if (!codigo || !accion) {
      return res.status(400).json({ error: "Código y acción son requeridos" });
    }

    console.log(`\n🔍 [VALIDAR] Buscando código...`);
    console.log(`   Usuario ID: ${userId}`);
    console.log(`   Código: ${codigo}`);
    console.log(`   Acción: ${accion}`);

    // Buscar el código en la base de datos
    const codigoRecord = dbUsers.prepare(`
      SELECT * FROM confirmation_codes 
      WHERE usuario_id = ? AND codigo = ? AND accion = ? AND usado = 0
    `).get(userId, codigo, accion);

    if (!codigoRecord) {
      console.log(`   ❌ Código no encontrado`);
      
      // Ver qué códigos existen para este usuario
      const codigosExistentes = dbUsers.prepare(`
        SELECT id, usuario_id, codigo, accion, usado, expira_en FROM confirmation_codes 
        WHERE usuario_id = ? 
        ORDER BY creado_en DESC LIMIT 5
      `).all(userId);
      
      console.log(`   📋 Últimos 5 códigos para usuario ${userId}:`, codigosExistentes.length > 0 ? codigosExistentes : "Ninguno");
      
      // Incrementar intentos fallidos
      dbUsers.prepare(`
        UPDATE confirmation_codes 
        SET intentos_fallidos = intentos_fallidos + 1
        WHERE usuario_id = ? AND codigo = ? AND accion = ?
      `).run(userId, codigo, accion);

      return res.status(400).json({ error: "Código inválido o no encontrado" });
    }

    console.log(`   ✓ Código encontrado`);

    // Verificar que no haya expirado
    const ahora = new Date();
    const expiracion = new Date(codigoRecord.expira_en);
    if (ahora > expiracion) {
      console.log(`   ❌ Código expirado`);
      return res.status(400).json({ error: "Código expirado" });
    }

    console.log(`   ✓ Código válido y no expirado`);

    // Verificar intentos fallidos (máximo 3)
    if (codigoRecord.intentos_fallidos >= 3) {
      return res.status(400).json({ error: "Demasiados intentos fallidos. Solicita un nuevo código" });
    }

    // ⚠️ NO marcar como usado aquí - solo validar
    // El código se marcará como usado en el endpoint que realice la acción final
    // Esto permite que se reutilice el código validado en la siguiente llamada

    console.log(`✅ [AUTH] Código de confirmación validado para usuario ${userId} - Acción: ${accion}`);

    res.json({ 
      ok: true, 
      message: "Código válido",
      accion
    });
  } catch (err) {
    console.error("Error validando código de confirmación:", err);
    res.status(500).json({ error: "Error validando código" });
  }
});

export default router;

