import { createEncryptedDatabase } from "./dbEncryption.js";
import fs from "fs";
import path from "path";
import bcrypt from "bcrypt";

const dbInv = createEncryptedDatabase("inventario.db");     
const dbDia = createEncryptedDatabase("productos_dia.db");  
const dbHist = createEncryptedDatabase("productos.db");
const dbUsers = createEncryptedDatabase("usuarios.db");     
const dbReenvios = createEncryptedDatabase("reenvios.db"); 
const dbDevol = createEncryptedDatabase("devoluciones.db");
const dbChat = createEncryptedDatabase("chat.db");
const dbActivos = createEncryptedDatabase("activos_informaticos.db");
// Bases de datos usadas en otros módulos (no pestañas eliminadas)
const dbVentas = createEncryptedDatabase("ventas.db"); // Usada en tienda.js
const dbRRHH = createEncryptedDatabase("rrhh.db"); // Usada en administrador.js para sincronizar usuarios con empleados

dbDevol.exec(`
  CREATE TABLE IF NOT EXISTS devoluciones_areas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT UNIQUE NOT NULL
  );
`);

dbDevol.exec(`
  CREATE TABLE IF NOT EXISTS devoluciones_pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido TEXT NOT NULL,
    guia TEXT,
    paqueteria TEXT,
    motivo TEXT,
    area TEXT DEFAULT 'Clientes',
    usuario TEXT,
    fecha TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);
dbDevol.exec(`
  CREATE TABLE IF NOT EXISTS devoluciones_productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    devolucion_id INTEGER NOT NULL,
    codigo TEXT,
    nombre TEXT,
    lote TEXT,
    cantidad INTEGER,
    FOREIGN KEY (devolucion_id) REFERENCES devoluciones_pedidos(id)
  );
`);

try {
  dbDevol.exec(`ALTER TABLE devoluciones_productos ADD COLUMN codigo_calidad TEXT;`);
} catch (e) {
  if (!String(e.message).includes("duplicate") && !String(e.message).includes("exists")) {
    console.error(e);
  }
}

try {
  dbDevol.exec(`ALTER TABLE devoluciones_productos ADD COLUMN activo INTEGER DEFAULT 1;`);
} catch (e) {
  if (!String(e.message).includes("duplicate") && !String(e.message).includes("exists")) {
    console.error(e);
  }
}

try {
  dbDevol.exec(`ALTER TABLE devoluciones_productos ADD COLUMN caducidad TEXT;`);
} catch (e) {
  if (!String(e.message).includes("duplicate") && !String(e.message).includes("exists")) {
    console.error(e);
  }
}

try {
  dbDevol.exec(`ALTER TABLE devoluciones_productos ADD COLUMN apto INTEGER DEFAULT 1;`);
} catch (e) {
  if (!String(e.message).includes("duplicate") && !String(e.message).includes("exists")) {
    console.error(e);
  }
}

try {
  dbDevol.exec(`ALTER TABLE devoluciones_productos ADD COLUMN presentacion TEXT;`);
} catch (e) {
  if (!String(e.message).includes("duplicate") && !String(e.message).includes("exists")) {
    console.error(e);
  }
}

try {
  dbDevol.exec(`ALTER TABLE devoluciones_pedidos ADD COLUMN hora TEXT;`);
} catch (e) {
  if (!String(e.message).includes("duplicate") && !String(e.message).includes("exists")) {
    console.error(e);
  }
}

dbDevol.exec(`
  CREATE TABLE IF NOT EXISTS devoluciones_fotos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    devolucion_id INTEGER NOT NULL,
    path TEXT NOT NULL,
    fecha TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (devolucion_id) REFERENCES devoluciones_pedidos(id)
  );
`);

const dbAud = createEncryptedDatabase("auditoria.db");

dbAud.exec(`
  CREATE TABLE IF NOT EXISTS auditoria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT,
    accion TEXT,
    detalle TEXT,
    tabla_afectada TEXT,
    registro_id INTEGER,
    fecha TEXT DEFAULT CURRENT_TIMESTAMP
  );
  
  -- Tablas para Auditoría de Inventario Físico
  CREATE TABLE IF NOT EXISTS auditorias_inventario (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    usuario TEXT NOT NULL,
    fecha_inicio TEXT DEFAULT (datetime('now', 'localtime')),
    fecha_fin TEXT,
    estado TEXT DEFAULT 'en_proceso',
    total_productos INTEGER DEFAULT 0,
    productos_escaneados INTEGER DEFAULT 0,
    diferencias_encontradas INTEGER DEFAULT 0,
    observaciones TEXT
  );
  
  CREATE TABLE IF NOT EXISTS auditorias_inventario_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auditoria_id INTEGER NOT NULL,
    codigo TEXT NOT NULL,
    nombre TEXT,
    lote TEXT,
    cantidad_sistema INTEGER DEFAULT 0,
    cantidad_fisica INTEGER DEFAULT 0,
    piezas_no_aptas INTEGER DEFAULT 0,
    diferencia INTEGER DEFAULT 0,
    tipo_diferencia TEXT,
    observaciones TEXT,
    usuario TEXT,
    fecha_escaneo TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (auditoria_id) REFERENCES auditorias_inventario(id) ON DELETE CASCADE
  );
  
  CREATE INDEX IF NOT EXISTS idx_auditorias_usuario ON auditorias_inventario(usuario);
  CREATE INDEX IF NOT EXISTS idx_auditorias_estado ON auditorias_inventario(estado);
  CREATE INDEX IF NOT EXISTS idx_auditorias_items_auditoria ON auditorias_inventario_items(auditoria_id);
  CREATE INDEX IF NOT EXISTS idx_auditorias_items_codigo ON auditorias_inventario_items(codigo);
`);

// Agregar columnas si no existen (migración) - DEBE HACERSE ANTES DE CREAR ÍNDICES
try {
  dbAud.exec(`ALTER TABLE auditorias_inventario_items ADD COLUMN usuario TEXT;`);
} catch (e) {
  if (!String(e.message).includes("duplicate") && !String(e.message).includes("exists") && !String(e.message).includes("no such column")) {
    console.error("Error agregando columna usuario a auditorias_inventario_items:", e);
  }
}

try {
  dbAud.exec(`ALTER TABLE auditorias_inventario_items ADD COLUMN piezas_no_aptas INTEGER DEFAULT 0;`);
} catch (e) {
  if (!String(e.message).includes("duplicate") && !String(e.message).includes("exists") && !String(e.message).includes("no such column")) {
    console.error("Error agregando columna piezas_no_aptas a auditorias_inventario_items:", e);
  }
}

// Crear índice de usuario DESPUÉS de agregar la columna
try {
  dbAud.exec(`CREATE INDEX IF NOT EXISTS idx_auditorias_items_usuario ON auditorias_inventario_items(usuario);`);
} catch (e) {
  if (!String(e.message).includes("duplicate") && !String(e.message).includes("exists")) {
    console.error("Error creando índice idx_auditorias_items_usuario:", e);
  }
}

import { DB_ENCRYPTION_KEY } from "./dbEncryption.js";

try {
  const invDbPathServer = path.join(process.cwd(), "server", "databases", "inventario.db");
  const invDbPathRoot = path.join(process.cwd(), "databases", "inventario.db");
  const invDbPath = fs.existsSync(invDbPathServer) ? invDbPathServer : invDbPathRoot;
  dbHist.exec(`ATTACH DATABASE '${invDbPath.replace(/\\/g, '/')}' AS inv KEY '${DB_ENCRYPTION_KEY}'`);
} catch (err) {
  console.log("ℹ️ Base de datos de inventario ya adjunta a histórico");
}

dbReenvios.exec(`
  CREATE TABLE IF NOT EXISTS reenvios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido TEXT NOT NULL, fecha TEXT NOT NULL, hora TEXT NOT NULL,
    estatus TEXT NOT NULL DEFAULT 'Listo para enviar',
    paqueteria TEXT, guia TEXT, observaciones TEXT,
    evidencia_count INTEGER DEFAULT 0,
    fecha_enviado TEXT,
    fecha_en_transito TEXT,
    fecha_entregado TEXT,
    ultima_actualizacion TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_reenvios_pedido ON reenvios(pedido);
  CREATE INDEX IF NOT EXISTS idx_reenvios_estatus ON reenvios(estatus);
  CREATE INDEX IF NOT EXISTS idx_reenvios_guia ON reenvios(guia);
  
  CREATE TABLE IF NOT EXISTS reenvios_historico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido TEXT, paqueteria TEXT, guia TEXT, observaciones TEXT, estatus TEXT,
    fecha TEXT, hora TEXT, evidencia_count INTEGER, fechaCorte TEXT,
    fecha_enviado TEXT, fecha_en_transito TEXT, fecha_entregado TEXT,
    ultima_actualizacion TEXT
  );
  
  -- Tabla para historial de estados de reenvíos
  CREATE TABLE IF NOT EXISTS reenvios_estados_historial (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reenvio_id INTEGER NOT NULL,
    estado_anterior TEXT,
    estado_nuevo TEXT NOT NULL,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL,
    observacion TEXT,
    usuario TEXT,
    FOREIGN KEY (reenvio_id) REFERENCES reenvios(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_reenvios_estados_reenvio ON reenvios_estados_historial(reenvio_id);
  CREATE INDEX IF NOT EXISTS idx_reenvios_estados_fecha ON reenvios_estados_historial(fecha);
  
  -- Tabla para fotos de reenvíos
  CREATE TABLE IF NOT EXISTS reenvios_fotos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reenvio_id INTEGER NOT NULL,
    tipo TEXT DEFAULT 'evidencia',
    archivo TEXT NOT NULL,
    fecha TEXT,
    hora TEXT,
    FOREIGN KEY (reenvio_id) REFERENCES reenvios(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_reenvios_fotos_reenvio ON reenvios_fotos(reenvio_id);
`);

dbDia.exec(`
  CREATE TABLE IF NOT EXISTS fecha_actual (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    fecha TEXT,
    actualizada_por INTEGER,
    fecha_actualizacion TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);

try {
  const existe = dbDia.prepare("SELECT COUNT(*) as count FROM fecha_actual WHERE id = 1").get();
  if (existe.count === 0) {
    dbDia.prepare("INSERT INTO fecha_actual (id, fecha) VALUES (1, '')").run();
  }
} catch (e) {
  console.error("Error inicializando fecha_actual:", e);
}

dbDia.exec(`
CREATE TABLE IF NOT EXISTS reenvios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido TEXT NOT NULL, fecha TEXT NOT NULL, hora TEXT NOT NULL,
  estatus TEXT NOT NULL DEFAULT 'Listo para enviar',
  paqueteria TEXT, guia TEXT, observaciones TEXT,
  evidencia_count INTEGER DEFAULT 0,
  fecha_enviado TEXT,
  fecha_en_transito TEXT,
  fecha_entregado TEXT,
  ultima_actualizacion TEXT
);
CREATE INDEX IF NOT EXISTS idx_reenvios_pedido ON reenvios(pedido);
CREATE INDEX IF NOT EXISTS idx_reenvios_estatus ON reenvios(estatus);
CREATE INDEX IF NOT EXISTS idx_reenvios_guia ON reenvios(guia);

-- Tabla para historial de estados de reenvíos
CREATE TABLE IF NOT EXISTS reenvios_estados_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reenvio_id INTEGER NOT NULL,
  estado_anterior TEXT,
  estado_nuevo TEXT NOT NULL,
  fecha TEXT NOT NULL,
  hora TEXT NOT NULL,
  observacion TEXT,
  usuario TEXT,
  FOREIGN KEY (reenvio_id) REFERENCES reenvios(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reenvios_estados_reenvio ON reenvios_estados_historial(reenvio_id);
CREATE INDEX IF NOT EXISTS idx_reenvios_estados_fecha ON reenvios_estados_historial(fecha);
`);

// Migración: Agregar nuevas columnas si no existen (para bases de datos existentes)
try {
  const columnasReenvios = dbReenvios.prepare("PRAGMA table_info(reenvios)").all();
  const nombresColumnas = columnasReenvios.map(c => c.name);
  
  if (!nombresColumnas.includes("fecha_enviado")) {
    dbReenvios.exec("ALTER TABLE reenvios ADD COLUMN fecha_enviado TEXT");
  }
  if (!nombresColumnas.includes("fecha_en_transito")) {
    dbReenvios.exec("ALTER TABLE reenvios ADD COLUMN fecha_en_transito TEXT");
  }
  if (!nombresColumnas.includes("fecha_entregado")) {
    dbReenvios.exec("ALTER TABLE reenvios ADD COLUMN fecha_entregado TEXT");
  }
  if (!nombresColumnas.includes("ultima_actualizacion")) {
    dbReenvios.exec("ALTER TABLE reenvios ADD COLUMN ultima_actualizacion TEXT");
  }
  
  // Migración para histórico
  const columnasHistorico = dbReenvios.prepare("PRAGMA table_info(reenvios_historico)").all();
  const nombresColumnasHist = columnasHistorico.map(c => c.name);
  
  if (!nombresColumnasHist.includes("fecha_enviado")) {
    dbReenvios.exec("ALTER TABLE reenvios_historico ADD COLUMN fecha_enviado TEXT");
  }
  if (!nombresColumnasHist.includes("fecha_en_transito")) {
    dbReenvios.exec("ALTER TABLE reenvios_historico ADD COLUMN fecha_en_transito TEXT");
  }
  if (!nombresColumnasHist.includes("fecha_entregado")) {
    dbReenvios.exec("ALTER TABLE reenvios_historico ADD COLUMN fecha_entregado TEXT");
  }
  if (!nombresColumnasHist.includes("ultima_actualizacion")) {
    dbReenvios.exec("ALTER TABLE reenvios_historico ADD COLUMN ultima_actualizacion TEXT");
  }
} catch (e) {
  console.warn("⚠️ Error en migración de reenvíos:", e.message);
}

try {
  dbInv.exec(`
  CREATE TABLE IF NOT EXISTS productos_ref (
    id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT UNIQUE, nombre TEXT,
    categoria TEXT, subcategoria TEXT
  );
  CREATE TABLE IF NOT EXISTS codigos_alias (
    id INTEGER PRIMARY KEY AUTOINCREMENT, codigo_extra TEXT UNIQUE NOT NULL,
    codigo_principal TEXT NOT NULL
  );
  `);
  
  try {
    const testQuery = dbInv.prepare("SELECT COUNT(*) as total FROM productos_ref").get();
    
    if (testQuery.total === 0) {
      console.log("🔄 Inventario vacío detectado. Intentando recuperar desde auditoría...");
      try {
        recuperarInventarioDesdeAuditoria();
      } catch (err) {
        console.error("❌ Error en recuperación automática:", err.message);
      }
    }
  } catch (error) {
    console.error(`❌ Error verificando inventario:`, error.message);
  }
} catch (error) {
  console.error("❌ Error inicializando base de datos de inventario:", error.message);
  console.error("   Stack:", error.stack);
  throw error; // Esto es crítico, no continuar si falla
}

try { dbInv.exec("ALTER TABLE productos_ref ADD COLUMN subcategoria TEXT"); } catch (e) {}
try { 
  dbInv.exec("ALTER TABLE productos_ref ADD COLUMN piezas_por_caja INTEGER DEFAULT 0"); 
  // Columna piezas_por_caja agregada
} catch (e) {
  if (!String(e.message).includes("duplicate") && !String(e.message).includes("exists")) console.error(e);
}

try { 
  dbInv.exec("ALTER TABLE productos_ref ADD COLUMN presentacion TEXT"); 
} catch (e) {
  if (!String(e.message).includes("duplicate") && !String(e.message).includes("exists")) {
    console.error("❌ Error agregando presentacion:", e);
  }
}

try { 
  dbInv.exec("ALTER TABLE productos_ref ADD COLUMN precio REAL DEFAULT 0"); 
} catch (e) {
  if (!String(e.message).includes("duplicate") && !String(e.message).includes("exists")) {
    console.error("❌ Error agregando precio:", e);
  }
}

try { 
  dbInv.exec("ALTER TABLE productos_ref ADD COLUMN foto TEXT"); 
} catch (e) {
  if (!String(e.message).includes("duplicate") && !String(e.message).includes("exists")) {
    console.error("❌ Error agregando foto:", e);
  }
}

try { 
  dbInv.exec("ALTER TABLE productos_ref ADD COLUMN activo INTEGER DEFAULT 1"); 
  // Columna activo agregada (1 = activo, 0 = inactivo/agotado)
} catch (e) {
  if (!String(e.message).includes("duplicate") && !String(e.message).includes("exists")) {
    console.error("❌ Error agregando activo:", e);
  }
}

dbInv.exec(`
  CREATE TABLE IF NOT EXISTS productos_lotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_producto TEXT NOT NULL,
    lote TEXT NOT NULL,
    cantidad_piezas INTEGER DEFAULT 0,
    laboratorio TEXT,
    fecha_ingreso TEXT DEFAULT (datetime('now', 'localtime')),
    activo INTEGER DEFAULT 0,
    UNIQUE(codigo_producto, lote),
    FOREIGN KEY (codigo_producto) REFERENCES productos_ref(codigo) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_lotes_codigo ON productos_lotes(codigo_producto);
  CREATE INDEX IF NOT EXISTS idx_lotes_activo ON productos_lotes(activo);
`);

try {
  dbInv.exec("ALTER TABLE productos_lotes ADD COLUMN laboratorio TEXT");
} catch (e) {
  if (!String(e.message).includes("duplicate") && !String(e.message).includes("exists")) {
    console.error("❌ Error agregando columna laboratorio:", e);
  }
}

dbDia.exec(`
CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, nombre TEXT, cajas INTEGER,
  piezas INTEGER DEFAULT 0, observaciones TEXT, surtido INTEGER DEFAULT 0,
  disponible INTEGER DEFAULT 1, hora_solicitud TEXT, hora_surtido TEXT, lote TEXT, canal TEXT DEFAULT 'picking'
);
CREATE TABLE IF NOT EXISTS devoluciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, nombre TEXT, lote TEXT,
  cantidad INTEGER, hora_ultima TEXT
);
CREATE TABLE IF NOT EXISTS surtidos_tiempo (
  codigo TEXT PRIMARY KEY, ultimo_surtido INTEGER
);
`);

try { dbDia.exec(`ALTER TABLE productos ADD COLUMN extras INTEGER DEFAULT 0;`); } catch (e) {}
try { dbDia.exec(`ALTER TABLE productos ADD COLUMN piezas_por_caja INTEGER DEFAULT 0;`); } catch (e) {}
try { dbDia.exec(`ALTER TABLE productos ADD COLUMN origen TEXT DEFAULT 'normal';`); } catch (e) {}
try { dbDia.exec(`ALTER TABLE productos ADD COLUMN devolucion_producto_id INTEGER;`); } catch (e) {}
try { dbDia.exec(`ALTER TABLE productos ADD COLUMN importacion INTEGER DEFAULT 0;`); } catch (e) {}
try { dbDia.exec(`ALTER TABLE productos ADD COLUMN presentacion TEXT;`); } catch (e) {}
try { dbDia.exec(`ALTER TABLE productos ADD COLUMN categoria TEXT;`); } catch (e) {}
try { dbDia.exec(`ALTER TABLE productos ADD COLUMN subcategoria TEXT;`); } catch (e) {}
try { dbDia.exec(`ALTER TABLE productos ADD COLUMN codigo_principal TEXT;`); } catch (e) {}
try { dbDia.exec(`ALTER TABLE productos ADD COLUMN canal TEXT DEFAULT 'picking';`); } catch (e) {}

const DEV_TABLAS_DIA = [
  "devoluciones_clientes",
  "devoluciones_calidad",
  "devoluciones_reacondicionados",
  "devoluciones_retail",
  "devoluciones_cubbo",
  "devoluciones_regulatorio",
];

for (const tabla of DEV_TABLAS_DIA) {
  dbDia.exec(`
    CREATE TABLE IF NOT EXISTS ${tabla} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT,
      nombre TEXT,
      lote TEXT,
      cantidad INTEGER,
      hora_ultima TEXT,
      activo INTEGER DEFAULT 1
    );
  `);

  try {
    dbDia.exec(`ALTER TABLE ${tabla} ADD COLUMN activo INTEGER DEFAULT 1;`);
  } catch (e) {
    if (
      !String(e.message).includes("duplicate") &&
      !String(e.message).includes("exists")
    ) {
      console.error(e);
    }
  }

  try {
    dbDia.exec(`ALTER TABLE ${tabla} ADD COLUMN hora_ultima TEXT;`);
  } catch (e) {
    if (
      !String(e.message).includes("duplicate") &&
      !String(e.message).includes("exists")
    ) {
      console.error(e);
    }
  }

  try {
    dbDia.exec(`ALTER TABLE ${tabla} ADD COLUMN caducidad TEXT;`);
  } catch (e) {
    if (
      !String(e.message).includes("duplicate") &&
      !String(e.message).includes("exists")
    ) {
      console.error(e);
    }
  }

  try {
    dbDia.exec(`ALTER TABLE ${tabla} ADD COLUMN presentacion TEXT;`);
  } catch (e) {
    if (
      !String(e.message).includes("duplicate") &&
      !String(e.message).includes("exists")
    ) {
      console.error(`❌ Error agregando 'presentacion' a ${tabla}:`, e);
    }
  }
}

try {
  dbHist.exec(`
  CREATE TABLE IF NOT EXISTS productos_historico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, nombre TEXT, cajas INTEGER,
    piezas INTEGER, observaciones TEXT, surtido INTEGER, disponible INTEGER,
    hora_solicitud TEXT, hora_surtido TEXT, fecha TEXT, lote TEXT, canal TEXT
  );
  CREATE TABLE IF NOT EXISTS devoluciones_historico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, nombre TEXT, lote TEXT,
    cantidad INTEGER, fecha TEXT, hora_ultima TEXT
  );
  `);
} catch (e) {
  if (e.code === 'SQLITE_NOTADB' || e.message?.includes('not a database')) {
    console.warn("⚠️ Base de datos productos.db no válida o corrupta. Se omitirán las operaciones de histórico.");
  } else {
    console.error("❌ Error creando tablas de histórico:", e.message || e);
  }
}

try { 
  dbHist.exec(`ALTER TABLE productos_historico ADD COLUMN extras INTEGER DEFAULT 0;`); 
} catch (e) {
  if (e.code === 'SQLITE_NOTADB' || e.message?.includes('not a database')) {
  }
}
try { 
  dbHist.exec(`ALTER TABLE productos_historico ADD COLUMN piezas_por_caja INTEGER DEFAULT 0;`); 
} catch (e) {
  if (e.code === 'SQLITE_NOTADB' || e.message?.includes('not a database')) {
  }
}
try { 
  dbHist.exec(`ALTER TABLE productos_historico ADD COLUMN origen TEXT DEFAULT 'normal';`); 
} catch (e) {
  if (e.code === 'SQLITE_NOTADB' || e.message?.includes('not a database')) {
  }
}
try { 
  dbHist.exec(`ALTER TABLE productos_historico ADD COLUMN devolucion_producto_id INTEGER;`); 
} catch (e) {
  if (e.code === 'SQLITE_NOTADB' || e.message?.includes('not a database')) {
  }
}
try { 
  dbHist.exec(`ALTER TABLE productos_historico ADD COLUMN importacion INTEGER DEFAULT 0;`); 
} catch (e) {
  if (e.code === 'SQLITE_NOTADB' || e.message?.includes('not a database')) {
  }
}
try { 
  dbHist.exec(`ALTER TABLE productos_historico ADD COLUMN canal TEXT DEFAULT 'picking';`); 
} catch (e) {
  if (e.code === 'SQLITE_NOTADB' || e.message?.includes('not a database')) {
    console.warn("⚠️ Base de datos productos.db no válida o corrupta. Se omitirá canal en histórico.");
  }
}

try {
  try {
    dbHist.prepare("SELECT 1").get();
  } catch (dbError) {
    if (dbError.code === 'SQLITE_NOTADB' || dbError.message?.includes('not a database')) {
      console.warn("⚠️ Base de datos productos.db no válida o corrupta. Se omitirá el auto-fix de piezas.");
      throw dbError; // Re-lanzar para que el catch externo lo maneje
    }
    throw dbError; // Re-lanzar otros errores
  }
  
  // Verificar que la tabla existe
  const tablaExiste = dbHist.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='productos_historico'
  `).get();
  
  if (tablaExiste) {
    const col = dbHist.prepare(`PRAGMA table_info(productos_historico)`).all();
    const existePiezas = col.some(c => c.name === "piezas");
    if (!existePiezas) {
      console.log("🔧 Agregando columna 'piezas' a productos_historico...");
      dbHist.exec(`ALTER TABLE productos_historico ADD COLUMN piezas INTEGER DEFAULT 0;`);
    }
    dbHist.exec(`
      UPDATE productos_historico
      SET piezas = piezas_por_caja
      WHERE piezas = 0 AND piezas_por_caja > 0;
    `);
  }
} catch (e) {
  if (e.code === 'SQLITE_NOTADB' || e.message?.includes('not a database')) {
    console.warn("⚠️ Base de datos productos.db no válida o corrupta. Se omitirá el auto-fix de piezas.");
  } else {
    console.error("❌ Error aplicando auto-fix de piezas:", e.message || e);
  }
}

try {
  try {
    dbHist.prepare("SELECT 1").get();
  } catch (dbError) {
    if (dbError.code === 'SQLITE_NOTADB' || dbError.message?.includes('not a database')) {
      console.warn("⚠️ Base de datos productos.db no válida o corrupta. Se omitirá la reparación de piezas_por_caja.");
      throw dbError;
    }
    throw dbError;
  }
  
  const tablaExiste = dbHist.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='productos_historico'
  `).get();
  
  if (tablaExiste) {
    const fix = dbHist.prepare(`
      UPDATE productos_historico
      SET piezas_por_caja = (piezas / cajas)
      WHERE (piezas_por_caja = 0 OR piezas_por_caja IS NULL)
        AND piezas > 0
        AND cajas > 0
    `);
    fix.run();
  }
} catch (e) {
  if (e.code === 'SQLITE_NOTADB' || e.message?.includes('not a database')) {
    console.warn("⚠️ Base de datos productos.db no válida o corrupta. Se omitirá la reparación de piezas_por_caja.");
  } else {
    console.error("❌ Error reparando piezas_por_caja:", e.message || e);
  }
}

dbUsers.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL,
  active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL, role_id INTEGER NOT NULL, UNIQUE(user_id, role_id)
);
CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, perm TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL, perm_id INTEGER NOT NULL, UNIQUE(role_id, perm_id)
);
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id INTEGER NOT NULL, perm_id INTEGER NOT NULL, UNIQUE(user_id, perm_id)
);
`);

dbUsers.exec(`
  CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL,
    user_agent TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    last_seen_at TEXT
  );
`);

dbUsers.exec(`
  CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT NOT NULL,
    ip_address TEXT,
    attempts INTEGER DEFAULT 1,
    locked_until TEXT,
    last_attempt TEXT DEFAULT (datetime('now')),
    UNIQUE(identifier)
  );
  CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier ON login_attempts(identifier);
  CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);
`);

// Migraciones: Agregar columnas si no existen
try { 
  dbUsers.exec(`ALTER TABLE users ADD COLUMN nickname TEXT;`); 
  console.log("✅ Columna 'nickname' agregada a users");
} catch (e) {
  if (!e.message?.includes('duplicate column')) {
    console.warn("⚠️ Error agregando columna 'nickname':", e.message);
  }
}
try { 
  dbUsers.exec(`ALTER TABLE users ADD COLUMN photo TEXT;`); 
  console.log("✅ Columna 'photo' agregada a users");
} catch (e) {
  if (!e.message?.includes('duplicate column')) {
    console.warn("⚠️ Error agregando columna 'photo':", e.message);
  }
}
try { 
  dbUsers.exec(`ALTER TABLE users ADD COLUMN tema_personal TEXT;`); 
  console.log("✅ Columna 'tema_personal' agregada a users");
} catch (e) {
  if (!e.message?.includes('duplicate column')) {
    console.warn("⚠️ Error agregando columna 'tema_personal':", e.message);
  }
}
try { 
  dbUsers.exec(`ALTER TABLE users ADD COLUMN username TEXT UNIQUE;`); 
  console.log("✅ Columna 'username' agregada a users");
} catch (e) {
  if (!e.message?.includes('duplicate column')) {
    console.warn("⚠️ Error agregando columna 'username':", e.message);
  }
}
try { 
  dbUsers.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT;`); 
  console.log("✅ Columna 'password_hash' agregada a users");
} catch (e) {
  if (!e.message?.includes('duplicate column')) {
    console.warn("⚠️ Error agregando columna 'password_hash':", e.message);
  }
}
try { 
  dbUsers.exec(`ALTER TABLE users ADD COLUMN password_temporary INTEGER DEFAULT 0;`); 
  console.log("✅ Columna 'password_temporary' agregada a users");
} catch (e) {
  if (!e.message?.includes('duplicate column')) {
    console.warn("⚠️ Error agregando columna 'password_temporary':", e.message);
  }
}
try {
  dbUsers.exec(`ALTER TABLE users ADD COLUMN puesto TEXT;`);
  console.log("✅ Columna 'puesto' agregada a users");
} catch (e) {
  if (!e.message?.includes('duplicate column')) {
    console.warn("⚠️ Error agregando columna 'puesto':", e.message);
  }
}
try {
  dbUsers.exec(`ALTER TABLE users ADD COLUMN correo TEXT;`);
  console.log("✅ Columna 'correo' agregada a users");
} catch (e) {
  if (!e.message?.includes('duplicate column')) {
    console.warn("⚠️ Error agregando columna 'correo':", e.message);
  }
}
try {
  dbUsers.exec(`ALTER TABLE users ADD COLUMN mostrar_telefono INTEGER DEFAULT 1;`);
  console.log("✅ Columna 'mostrar_telefono' agregada a users");
} catch (e) {
  if (!e.message?.includes('duplicate column')) {
    console.warn("⚠️ Error agregando columna 'mostrar_telefono':", e.message);
  }
}
try {
  dbUsers.exec(`ALTER TABLE users ADD COLUMN birthday TEXT;`);
  console.log("✅ Columna 'birthday' agregada a users");
} catch (e) {
  if (!e.message?.includes('duplicate column')) {
    console.warn("⚠️ Error agregando columna 'birthday':", e.message);
  }
}

dbChat.exec(`
  CREATE TABLE IF NOT EXISTS chat_general (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_nickname TEXT NOT NULL,
    usuario_photo TEXT,
    mensaje TEXT NOT NULL,
    fecha TEXT DEFAULT (datetime('now', 'localtime')),
    tipo_mensaje TEXT DEFAULT 'texto',
    archivo_url TEXT,
    archivo_nombre TEXT,
    archivo_tipo TEXT,
    archivo_tamaño INTEGER,
    mensaje_editado INTEGER DEFAULT 0,
    fecha_edicion TEXT,
    menciona TEXT,
    enlace_compartido TEXT,
    reply_to_id INTEGER,
    reply_to_user TEXT,
    reply_to_text TEXT,
    reenviado_de_usuario TEXT,
    reenviado_de_chat TEXT,
    reenviado_de_tipo TEXT
  );
`);

dbChat.exec(`
  CREATE TABLE IF NOT EXISTS chat_privado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    de_nickname TEXT NOT NULL,
    de_photo TEXT,
    para_nickname TEXT NOT NULL,
    mensaje TEXT NOT NULL,
    fecha TEXT DEFAULT (datetime('now', 'localtime')),
    tipo_mensaje TEXT DEFAULT 'texto',
    archivo_url TEXT,
    archivo_nombre TEXT,
    archivo_tipo TEXT,
    archivo_tamaño INTEGER,
    mensaje_editado INTEGER DEFAULT 0,
    fecha_edicion TEXT,
    menciona TEXT,
    enlace_compartido TEXT,
    reply_to_id INTEGER,
    reply_to_user TEXT,
    reply_to_text TEXT,
    reenviado_de_usuario TEXT,
    reenviado_de_chat TEXT,
    reenviado_de_tipo TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_chat_privado_de ON chat_privado(de_nickname);
  CREATE INDEX IF NOT EXISTS idx_chat_privado_para ON chat_privado(para_nickname);
`);

dbChat.exec(`
  CREATE TABLE IF NOT EXISTS chat_privado_leidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mensaje_id INTEGER NOT NULL,
    usuario_nickname TEXT NOT NULL,
    fecha_leido TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (mensaje_id) REFERENCES chat_privado(id) ON DELETE CASCADE,
    UNIQUE(mensaje_id, usuario_nickname)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_privado_leidos_mensaje ON chat_privado_leidos(mensaje_id);
  CREATE INDEX IF NOT EXISTS idx_chat_privado_leidos_usuario ON chat_privado_leidos(usuario_nickname);
`);

dbChat.exec(`
  CREATE TABLE IF NOT EXISTS chat_general_leidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mensaje_id INTEGER NOT NULL,
    usuario_nickname TEXT NOT NULL,
    fecha_leido TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (mensaje_id) REFERENCES chat_general(id) ON DELETE CASCADE,
    UNIQUE(mensaje_id, usuario_nickname)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_general_leidos_mensaje ON chat_general_leidos(mensaje_id);
  CREATE INDEX IF NOT EXISTS idx_chat_general_leidos_usuario ON chat_general_leidos(usuario_nickname);
`);

dbChat.exec(`
  CREATE TABLE IF NOT EXISTS chat_privado_borrados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_nickname TEXT NOT NULL,
    otro_usuario TEXT NOT NULL,
    borrado_en TEXT DEFAULT (datetime('now', 'localtime')),
    UNIQUE(usuario_nickname, otro_usuario)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_privado_borrados_usuario ON chat_privado_borrados(usuario_nickname);
  CREATE INDEX IF NOT EXISTS idx_chat_privado_borrados_otro ON chat_privado_borrados(otro_usuario);
`);

dbChat.exec(`
  CREATE TABLE IF NOT EXISTS chat_grupos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    creado_por TEXT NOT NULL,
    fecha_creacion TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);

dbChat.exec(`
  CREATE TABLE IF NOT EXISTS chat_grupos_miembros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grupo_id INTEGER NOT NULL,
    usuario_nickname TEXT NOT NULL,
    fecha_union TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (grupo_id) REFERENCES chat_grupos(id) ON DELETE CASCADE,
    UNIQUE(grupo_id, usuario_nickname)
  );
  CREATE INDEX IF NOT EXISTS idx_grupos_miembros_grupo ON chat_grupos_miembros(grupo_id);
  CREATE INDEX IF NOT EXISTS idx_grupos_miembros_usuario ON chat_grupos_miembros(usuario_nickname);
`);

dbChat.exec(`
  CREATE TABLE IF NOT EXISTS chat_grupal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grupo_id INTEGER NOT NULL,
    usuario_nickname TEXT NOT NULL,
    usuario_photo TEXT,
    mensaje TEXT NOT NULL,
    fecha TEXT DEFAULT (datetime('now', 'localtime')),
    tipo_mensaje TEXT DEFAULT 'texto',
    archivo_url TEXT,
    archivo_nombre TEXT,
    archivo_tipo TEXT,
    archivo_tamaño INTEGER,
    mensaje_editado INTEGER DEFAULT 0,
    fecha_edicion TEXT,
    menciona TEXT,
    enlace_compartido TEXT,
    reply_to_id INTEGER,
    reply_to_user TEXT,
    reply_to_text TEXT,
    reenviado_de_usuario TEXT,
    reenviado_de_chat TEXT,
    reenviado_de_tipo TEXT,
    FOREIGN KEY (grupo_id) REFERENCES chat_grupos(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_chat_grupal_grupo ON chat_grupal(grupo_id);
`);

dbChat.exec(`
  CREATE TABLE IF NOT EXISTS chat_grupal_leidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mensaje_id INTEGER NOT NULL,
    grupo_id INTEGER NOT NULL,
    usuario_nickname TEXT NOT NULL,
    fecha_leido TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (mensaje_id) REFERENCES chat_grupal(id) ON DELETE CASCADE,
    UNIQUE(mensaje_id, usuario_nickname)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_grupal_leidos_mensaje ON chat_grupal_leidos(mensaje_id);
  CREATE INDEX IF NOT EXISTS idx_chat_grupal_leidos_usuario ON chat_grupal_leidos(usuario_nickname);
  CREATE INDEX IF NOT EXISTS idx_chat_grupal_leidos_grupo ON chat_grupal_leidos(grupo_id);
`);

dbChat.exec(`
  CREATE TABLE IF NOT EXISTS chat_pins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_nickname TEXT NOT NULL,
    tipo_chat TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    mensaje_id INTEGER NOT NULL,
    fecha TEXT DEFAULT (datetime('now', 'localtime')),
    UNIQUE(usuario_nickname, tipo_chat, chat_id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_pins_usuario ON chat_pins(usuario_nickname);
`);

dbChat.exec(`
  CREATE TABLE IF NOT EXISTS chat_destacados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_nickname TEXT NOT NULL,
    tipo_chat TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    mensaje_id INTEGER NOT NULL,
    fecha TEXT DEFAULT (datetime('now', 'localtime')),
    UNIQUE(usuario_nickname, tipo_chat, chat_id, mensaje_id)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_destacados_usuario ON chat_destacados(usuario_nickname);
`);

// Agregar columnas nuevas a tablas existentes si no existen
// Función helper para agregar columnas de forma segura
const agregarColumnaSiNoExiste = (db, tabla, columna, tipo) => {
  try {
    const columnas = db.prepare(`PRAGMA table_info(${tabla})`).all();
    const nombresColumnas = columnas.map(c => c.name);
    if (!nombresColumnas.includes(columna)) {
      db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${tipo}`);
      console.log(`✅ Columna '${columna}' agregada a ${tabla}`);
    }
  } catch (e) {
    if (!String(e.message).includes("duplicate") && !String(e.message).includes("exists")) {
      console.warn(`⚠️ Error agregando columna '${columna}' a ${tabla}:`, e.message);
    }
  }
};

// Migrar chat_general
agregarColumnaSiNoExiste(dbChat, "chat_general", "tipo_mensaje", "TEXT DEFAULT 'texto'");
agregarColumnaSiNoExiste(dbChat, "chat_general", "archivo_url", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_general", "archivo_nombre", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_general", "archivo_tipo", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_general", "archivo_tamaño", "INTEGER");
agregarColumnaSiNoExiste(dbChat, "chat_general", "mensaje_editado", "INTEGER DEFAULT 0");
agregarColumnaSiNoExiste(dbChat, "chat_general", "fecha_edicion", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_general", "menciona", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_general", "enlace_compartido", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_general", "reply_to_id", "INTEGER");
agregarColumnaSiNoExiste(dbChat, "chat_general", "reply_to_user", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_general", "reply_to_text", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_general", "reenviado_de_usuario", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_general", "reenviado_de_chat", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_general", "reenviado_de_tipo", "TEXT");

// Migrar chat_privado
agregarColumnaSiNoExiste(dbChat, "chat_privado", "tipo_mensaje", "TEXT DEFAULT 'texto'");
agregarColumnaSiNoExiste(dbChat, "chat_privado", "archivo_url", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_privado", "archivo_nombre", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_privado", "archivo_tipo", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_privado", "archivo_tamaño", "INTEGER");
agregarColumnaSiNoExiste(dbChat, "chat_privado", "mensaje_editado", "INTEGER DEFAULT 0");
agregarColumnaSiNoExiste(dbChat, "chat_privado", "fecha_edicion", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_privado", "menciona", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_privado", "enlace_compartido", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_privado", "reply_to_id", "INTEGER");
agregarColumnaSiNoExiste(dbChat, "chat_privado", "reply_to_user", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_privado", "reply_to_text", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_privado", "reenviado_de_usuario", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_privado", "reenviado_de_chat", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_privado", "reenviado_de_tipo", "TEXT");

// Migrar chat_grupal
agregarColumnaSiNoExiste(dbChat, "chat_grupal", "reply_to_id", "INTEGER");
agregarColumnaSiNoExiste(dbChat, "chat_grupal", "reply_to_user", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_grupal", "reply_to_text", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_grupal", "reenviado_de_usuario", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_grupal", "reenviado_de_chat", "TEXT");
agregarColumnaSiNoExiste(dbChat, "chat_grupal", "reenviado_de_tipo", "TEXT");

// Agregar campos a grupos para público/privado
try {
  dbChat.exec(`
    ALTER TABLE chat_grupos ADD COLUMN es_publico INTEGER DEFAULT 1;
    ALTER TABLE chat_grupos ADD COLUMN es_archivado INTEGER DEFAULT 0;
  `);
} catch (e) {
  // Las columnas ya existen, ignorar error
}

// Tabla para configuración de notificaciones de chat
dbChat.exec(`
  CREATE TABLE IF NOT EXISTS chat_notificaciones_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_nickname TEXT NOT NULL UNIQUE,
    notificaciones_activas INTEGER DEFAULT 1,
    sonido_activo INTEGER DEFAULT 1,
    horario_inicio TEXT DEFAULT '08:00',
    horario_fin TEXT DEFAULT '22:00',
    dias_semana TEXT DEFAULT '1,2,3,4,5,6,7',
    mencionar_siempre INTEGER DEFAULT 1,
    grupos_activos INTEGER DEFAULT 1,
    privados_activos INTEGER DEFAULT 1,
    general_activo INTEGER DEFAULT 1,
    dispositivo_pc INTEGER DEFAULT 1,
    dispositivo_tablet INTEGER DEFAULT 1,
    dispositivo_movil INTEGER DEFAULT 1,
    notificar_reunion_individual INTEGER DEFAULT 1,
    notificar_reunion_grupal INTEGER DEFAULT 1,
    sonido_mensaje TEXT DEFAULT 'ixora-pulse',
    sonido_video TEXT DEFAULT 'ixora-wave',
    sonido_juntas TEXT DEFAULT 'ixora-alert',
    sonido_video_individual TEXT DEFAULT 'ixora-call',
    sonido_video_grupal TEXT DEFAULT 'ixora-call-group',
    horario_lun_inicio TEXT DEFAULT '08:00',
    horario_lun_fin TEXT DEFAULT '22:00',
    horario_mar_inicio TEXT DEFAULT '08:00',
    horario_mar_fin TEXT DEFAULT '22:00',
    horario_mie_inicio TEXT DEFAULT '08:00',
    horario_mie_fin TEXT DEFAULT '22:00',
    horario_jue_inicio TEXT DEFAULT '08:00',
    horario_jue_fin TEXT DEFAULT '22:00',
    horario_vie_inicio TEXT DEFAULT '08:00',
    horario_vie_fin TEXT DEFAULT '22:00',
    horario_sab_inicio TEXT DEFAULT '08:00',
    horario_sab_fin TEXT DEFAULT '22:00',
    horario_dom_inicio TEXT DEFAULT '08:00',
    horario_dom_fin TEXT DEFAULT '22:00'
  );
  CREATE INDEX IF NOT EXISTS idx_chat_notif_usuario ON chat_notificaciones_config(usuario_nickname);
`);

// Agregar columnas nuevas a configuración de notificaciones si no existen
try {
  dbChat.exec(`
    ALTER TABLE chat_notificaciones_config ADD COLUMN dispositivo_pc INTEGER DEFAULT 1;
    ALTER TABLE chat_notificaciones_config ADD COLUMN dispositivo_tablet INTEGER DEFAULT 1;
    ALTER TABLE chat_notificaciones_config ADD COLUMN dispositivo_movil INTEGER DEFAULT 1;
    ALTER TABLE chat_notificaciones_config ADD COLUMN notificar_reunion_individual INTEGER DEFAULT 1;
    ALTER TABLE chat_notificaciones_config ADD COLUMN notificar_reunion_grupal INTEGER DEFAULT 1;
    ALTER TABLE chat_notificaciones_config ADD COLUMN sonido_mensaje TEXT DEFAULT 'ixora-pulse';
    ALTER TABLE chat_notificaciones_config ADD COLUMN sonido_video TEXT DEFAULT 'ixora-wave';
    ALTER TABLE chat_notificaciones_config ADD COLUMN sonido_juntas TEXT DEFAULT 'ixora-alert';
    ALTER TABLE chat_notificaciones_config ADD COLUMN sonido_video_individual TEXT DEFAULT 'ixora-call';
    ALTER TABLE chat_notificaciones_config ADD COLUMN sonido_video_grupal TEXT DEFAULT 'ixora-call-group';
    ALTER TABLE chat_notificaciones_config ADD COLUMN horario_lun_inicio TEXT DEFAULT '08:00';
    ALTER TABLE chat_notificaciones_config ADD COLUMN horario_lun_fin TEXT DEFAULT '22:00';
    ALTER TABLE chat_notificaciones_config ADD COLUMN horario_mar_inicio TEXT DEFAULT '08:00';
    ALTER TABLE chat_notificaciones_config ADD COLUMN horario_mar_fin TEXT DEFAULT '22:00';
    ALTER TABLE chat_notificaciones_config ADD COLUMN horario_mie_inicio TEXT DEFAULT '08:00';
    ALTER TABLE chat_notificaciones_config ADD COLUMN horario_mie_fin TEXT DEFAULT '22:00';
    ALTER TABLE chat_notificaciones_config ADD COLUMN horario_jue_inicio TEXT DEFAULT '08:00';
    ALTER TABLE chat_notificaciones_config ADD COLUMN horario_jue_fin TEXT DEFAULT '22:00';
    ALTER TABLE chat_notificaciones_config ADD COLUMN horario_vie_inicio TEXT DEFAULT '08:00';
    ALTER TABLE chat_notificaciones_config ADD COLUMN horario_vie_fin TEXT DEFAULT '22:00';
    ALTER TABLE chat_notificaciones_config ADD COLUMN horario_sab_inicio TEXT DEFAULT '08:00';
    ALTER TABLE chat_notificaciones_config ADD COLUMN horario_sab_fin TEXT DEFAULT '22:00';
    ALTER TABLE chat_notificaciones_config ADD COLUMN horario_dom_inicio TEXT DEFAULT '08:00';
    ALTER TABLE chat_notificaciones_config ADD COLUMN horario_dom_fin TEXT DEFAULT '22:00';
  `);
} catch (e) {
  // Las columnas ya existen, ignorar error
}

// Tabla para archivos compartidos
dbChat.exec(`
  CREATE TABLE IF NOT EXISTS chat_archivos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_original TEXT NOT NULL,
    nombre_archivo TEXT NOT NULL,
    tipo_mime TEXT NOT NULL,
    tamaño INTEGER NOT NULL,
    ruta TEXT NOT NULL,
    subido_por TEXT NOT NULL,
    fecha_subida TEXT DEFAULT (datetime('now', 'localtime')),
    mensaje_id INTEGER,
    tipo_chat TEXT,
    grupo_id INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_chat_archivos_subido ON chat_archivos(subido_por);
  CREATE INDEX IF NOT EXISTS idx_chat_archivos_mensaje ON chat_archivos(mensaje_id);
`);

dbUsers.exec(`
  CREATE TABLE IF NOT EXISTS notificaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    titulo TEXT NOT NULL,
    mensaje TEXT NOT NULL,
    tipo TEXT DEFAULT 'info',
    leida INTEGER DEFAULT 0,
    es_confirmacion INTEGER DEFAULT 0,
    admin_only INTEGER DEFAULT 0,
    code_error INTEGER DEFAULT 0,
    reply_token TEXT,
    data TEXT,
    timestamp TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario ON notificaciones(usuario_id);
  CREATE INDEX IF NOT EXISTS idx_notificaciones_leida ON notificaciones(leida);
  CREATE INDEX IF NOT EXISTS idx_notificaciones_timestamp ON notificaciones(timestamp DESC);
`);

try {
  dbUsers.exec(`ALTER TABLE notificaciones ADD COLUMN reply_token TEXT;`);
} catch (e) {
  if (!String(e.message).includes("duplicate") && !String(e.message).includes("exists")) {
    console.error("Error agregando reply_token a notificaciones:", e.message);
  }
}

dbUsers.exec(`
  CREATE TABLE IF NOT EXISTS notificaciones_respuestas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notificacion_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    respuesta TEXT NOT NULL,
    timestamp TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (notificacion_id) REFERENCES notificaciones(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_notif_respuestas_notif ON notificaciones_respuestas(notificacion_id);
  CREATE INDEX IF NOT EXISTS idx_notif_respuestas_usuario ON notificaciones_respuestas(usuario_id);
`);

dbUsers.exec(`
  CREATE TABLE IF NOT EXISTS push_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    plataforma TEXT DEFAULT 'android',
    device_id TEXT,
    actualizado_en TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_push_tokens_usuario ON push_tokens(usuario_id);
`);

// 🔹 FUNCIÓN HELPER: Asignar automáticamente nuevos permisos al rol CEO
function asignarPermisoACEO(permString) {
  try {
    // Obtener el ID del rol CEO (o admin si CEO no existe)
    const ceoRoleId = dbUsers
      .prepare("SELECT id FROM roles WHERE name IN ('CEO', 'admin') ORDER BY CASE WHEN name = 'CEO' THEN 0 ELSE 1 END LIMIT 1")
      .get()?.id;
    
    if (!ceoRoleId) {
      console.warn("⚠️ No se encontró rol CEO o admin para asignar permiso automáticamente");
      return;
    }

    // Obtener el ID del permiso recién creado
    const permObj = dbUsers
      .prepare("SELECT id FROM permissions WHERE perm = ?")
      .get(permString);
    
    if (!permObj) {
      console.warn(`⚠️ No se encontró el permiso '${permString}' para asignar al CEO`);
      return;
    }

    // Asignar el permiso al rol CEO
    dbUsers
      .prepare("INSERT OR IGNORE INTO role_permissions (role_id, perm_id) VALUES (?,?)")
      .run(ceoRoleId, permObj.id);
    
    // Permiso asignado automáticamente al rol CEO (log eliminado)
  } catch (err) {
    console.error(`❌ Error asignando permiso '${permString}' al CEO:`, err.message);
  }
}

// 🧹 Limpiar permisos obsoletos de pestañas que ya no existen
const PERMISOS_OBSOLETOS = [
  "tab:compras",
  "tab:contabilidad",
  "tab:crm",
  "tab:dashboard",
  "tab:produccion",
  "tab:rrhh",
];

try {
  for (const permObsoleto of PERMISOS_OBSOLETOS) {
    const permObj = dbUsers.prepare("SELECT id FROM permissions WHERE perm = ?").get(permObsoleto);
    if (permObj) {
      // Eliminar de user_permissions
      dbUsers.prepare("DELETE FROM user_permissions WHERE perm_id = ?").run(permObj.id);
      // Eliminar de role_permissions
      dbUsers.prepare("DELETE FROM role_permissions WHERE perm_id = ?").run(permObj.id);
      // Eliminar el permiso
      dbUsers.prepare("DELETE FROM permissions WHERE id = ?").run(permObj.id);
      // Permiso obsoleto eliminado silenciosamente
    }
  }
} catch (err) {
  console.error("Error limpiando permisos obsoletos:", err.message);
}

const BASE_PERMS = [
  // Pestañas (tabs)
  "tab:escaneo",
  "tab:registros",
  "tab:devoluciones",
  "tab:reenvios",
  "tab:reportes",
  "tab:rep_devol",
  "tab:rep_reenvios",
  "tab:inventario",
  "tab:activaciones",
  "tab:rep_activaciones",
  "tab:tienda",
  "tab:activos",
  "tab:admin",
  "tab:ixora_ia",
  "tab:auditoria",
  // Permisos de picking/escaneo
  "picking.escaneo",
  "picking.surtir",
  "picking.agregar",
  "picking.eliminar",
  "picking.editar",
  "picking.observaciones",
  // Permisos de registros
  "registros.ver",
  "registros.crear",
  "registros.editar",
  "registros.eliminar",
  "registros.activar",
  "registros.exportar",
  // Permisos de devoluciones
  "devoluciones.ver",
  "devoluciones.crear",
  "devoluciones.editar",
  "devoluciones.eliminar",
  "devoluciones.procesar",
  "devoluciones.fotos",
  "devoluciones.control_calidad",
  "devoluciones.exportar",
  "action:activar-productos",
  // Permisos de reenvíos
  "reenvios.ver",
  "reenvios.crear",
  "reenvios.editar",
  "reenvios.eliminar",
  "reenvios.actualizar_estatus",
  "reenvios.evidencia",
  "reenvios.exportar",
  // Permisos de reportes
  "reportes.ver",
  "reportes.cerrar_dia",
  "reportes.mover",
  "reportes.eliminar",
  "reportes.exportar",
  "reportes.detalle",
  // Permisos de reportes de devoluciones
  "rep_devol.ver",
  "rep_devol.exportar",
  "rep_devol.filtrar",
  "rep_devol.detalle",
  // Permisos de reportes de reenvíos
  "rep_reenvios.ver",
  "rep_reenvios.exportar",
  "rep_reenvios.filtrar",
  "rep_reenvios.detalle",
  // Permisos de activaciones
  "activaciones.ver",
  "activaciones.crear",
  "activaciones.editar",
  "activaciones.eliminar",
  "activaciones.cerrar_dia",
  // Permisos de reportes de activaciones
  "rep_activaciones.ver",
  "rep_activaciones.exportar",
  "rep_activaciones.filtrar",
  "rep_activaciones.detalle",
  "rep_activaciones.eliminar",
  // Permisos de inventario
  "inventario.ver",
  "inventario.crear",
  "inventario.editar",
  "inventario.eliminar",
  "inventario.lotes",
  "inventario.activar_lotes",
  "inventario.mostrar_en_pagina",
  "inventario.activar_productos",
  "inventario.ajustes",
  "inventario.exportar",
  "inventario.importar",
  // Permisos de tienda
  "tienda.ver",
  "tienda.productos.ver",
  "tienda.productos.crear",
  "tienda.productos.editar",
  "tienda.productos.eliminar",
  "tienda.pedidos.ver",
  "tienda.pedidos.procesar",
  "tienda.pedidos.cancelar",
  "tienda.configurar",
  "tienda.exportar",
  // Permisos de activos
  "activos.ver",
  "activos.crear",
  "activos.editar",
  "activos.eliminar",
  "activos.responsables.ver",
  "activos.responsables.crear",
  "activos.responsables.editar",
  "activos.responsables.eliminar",
  "activos.tablets.ver",
  "activos.tablets.crear",
  "activos.tablets.editar",
  "activos.tablets.eliminar",
  "activos.exportar",
  // Permisos de auditoría
  "auditoria.ver",
  "auditoria.registros.ver",
  "auditoria.registros.exportar",
  "auditoria.inventario.crear",
  "auditoria.inventario.editar",
  "auditoria.inventario.eliminar",
  "auditoria.inventario.finalizar",
  "auditoria.filtrar",
  // Permisos de administración de usuarios
  "admin.usuarios.ver",
  "admin.usuarios.crear",
  "admin.usuarios.editar",
  "admin.usuarios.eliminar",
  // Permisos de administración de roles
  "admin.roles.ver",
  "admin.roles.crear",
  "admin.roles.editar",
  "admin.roles.eliminar",
  // Permisos de administración de permisos
  "admin.permisos.ver",
  "admin.permisos.asignar",
  // Permisos de sesiones
  "admin.sesiones.ver",
  "admin.sesiones.cerrar",
  "admin.sesiones.cerrar_todas",
  // Permisos de auditoría
  "admin.actividad.ver",
  "admin.actividad.registrar",
  // Permisos de personalización
  "admin.personalizacion.ver",
  "admin.personalizacion.editar",
  // Permisos de fotos
  "admin.fotos.subir",
  // Permisos de IXORA IA
  "ixora_ia.chat",
  "ixora_ia.comandos_voz",
  "ixora_ia.reconocimiento",
  "ixora_ia.generar_imagen",
  "ixora_ia.reportes",
];

const insPerm = dbUsers.prepare(
  "INSERT OR IGNORE INTO permissions (perm) VALUES (?)"
);
// Primero, obtener el ID del rol CEO/admin
const ceoRoleId = dbUsers
  .prepare("SELECT id FROM roles WHERE name IN ('CEO', 'admin') ORDER BY CASE WHEN name = 'CEO' THEN 0 ELSE 1 END LIMIT 1")
  .get()?.id;

for (const p of BASE_PERMS) {
  const result = insPerm.run(p);
  // Siempre asignar el permiso al CEO, incluso si ya existía
  asignarPermisoACEO(p);
  
  // Si el permiso fue insertado (nuevo), se loguea automáticamente en asignarPermisoACEO
  // Si ya existía, también se intenta asignar (INSERT OR IGNORE en la función evitará duplicados)
}

// Crear roles si no existen
dbUsers.exec(`INSERT OR IGNORE INTO roles (name) VALUES ('admin');`);
dbUsers.exec(`INSERT OR IGNORE INTO roles (name) VALUES ('CEO');`);

const ADMIN_PHONE = "2223415556"; 
const adminRoleId = dbUsers
  .prepare("SELECT id FROM roles WHERE name='admin'")
  .get()?.id;

// Obtener el rol CEO (prioridad sobre admin)
const ceoRoleIdFinal = dbUsers
  .prepare("SELECT id FROM roles WHERE name IN ('CEO', 'admin') ORDER BY CASE WHEN name = 'CEO' THEN 0 ELSE 1 END LIMIT 1")
  .get()?.id;

// Asegurar que el rol admin/CEO tenga TODOS los permisos
if (ceoRoleIdFinal || adminRoleId) {
  const roleIdToUse = ceoRoleIdFinal || adminRoleId;
  const permIds = dbUsers.prepare("SELECT id FROM permissions").all();
  const link = dbUsers.prepare(
    "INSERT OR IGNORE INTO role_permissions (role_id, perm_id) VALUES (?,?)"
  );
  for (const pid of permIds) {
    link.run(roleIdToUse, pid.id);
  }
  // Permisos asignados al rol CEO

  // Verificar si las columnas username y password_hash existen antes de usarlas
  let columnasExisten = false;
  try {
    const columnas = dbUsers.prepare("PRAGMA table_info(users)").all();
    const nombresColumnas = columnas.map(c => c.name);
    columnasExisten = nombresColumnas.includes("username") && nombresColumnas.includes("password_hash");
  } catch (e) {
    console.warn("⚠️ Error verificando columnas de users:", e.message);
  }
  
  let maybeYou;
  if (columnasExisten) {
    maybeYou = dbUsers
      .prepare("SELECT id, username, password_hash FROM users WHERE phone=?")
      .get(ADMIN_PHONE);
  } else {
    // Si las columnas no existen, usar solo las columnas básicas
    maybeYou = dbUsers
      .prepare("SELECT id FROM users WHERE phone=?")
      .get(ADMIN_PHONE);
    if (maybeYou) {
      maybeYou.username = null;
      maybeYou.password_hash = null;
    }
  }

  if (!maybeYou) {
    const info = dbUsers
      .prepare("INSERT INTO users (name, phone, active) VALUES (?,?,1)")
      .run("Alejandro (ADMIN)", ADMIN_PHONE);
    maybeYou = { id: info.lastInsertRowid, username: null, password_hash: null };
  }

  // Asegurar que el usuario administrador tenga username y password_hash
  // Verificar si ya tiene username y password_hash (solo si las columnas existen)
  let usuarioCompleto = null;
  if (columnasExisten) {
    usuarioCompleto = dbUsers
      .prepare("SELECT id, username, password_hash FROM users WHERE id=?")
      .get(maybeYou.id);
  } else {
    // Si las columnas no existen, crear un objeto con valores null
    usuarioCompleto = { id: maybeYou.id, username: null, password_hash: null };
  }
  
  if (!usuarioCompleto || !usuarioCompleto.username || !usuarioCompleto.password_hash) {
    // Configurar username y password_hash de forma síncrona
    try {
      const defaultPassword = "admin123"; // Contraseña por defecto para el admin
      const adminUsername = "admin";
      
      // Usar hashSync para que sea síncrono
      const passwordHash = bcrypt.hashSync(defaultPassword, 10);
      
      try {
        dbUsers
          .prepare("UPDATE users SET username=?, password_hash=? WHERE id=?")
          .run(adminUsername, passwordHash, maybeYou.id);
        console.log(`✅ Usuario administrador configurado: username=${adminUsername}, password=${defaultPassword}`);
      } catch (e) {
        // Si el username ya existe, intentar con otro
        try {
          const altUsername = `admin_${ADMIN_PHONE.slice(-4)}`;
          dbUsers
            .prepare("UPDATE users SET username=?, password_hash=? WHERE id=?")
            .run(altUsername, passwordHash, maybeYou.id);
          console.log(`✅ Usuario administrador configurado: username=${altUsername}, password=${defaultPassword}`);
        } catch (e2) {
          console.error(`❌ Error configurando usuario administrador:`, e2.message);
        }
      }
    } catch (err) {
      console.error(`❌ Error generando hash de contraseña:`, err.message);
      // Si falla, al menos intentar crear el username sin password (el usuario podrá usar OTP)
      try {
        dbUsers
          .prepare("UPDATE users SET username=? WHERE id=? AND (username IS NULL OR username = '')")
          .run("admin", maybeYou.id);
      } catch (e) {
        // Ignorar si falla
      }
    }
  }

  dbUsers
    .prepare(
      "INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?,?)"
    )
    .run(maybeYou.id, adminRoleId);
  
  // IMPORTANTE: Configurar username para TODOS los usuarios que no lo tengan
  // Esto asegura que todos los usuarios puedan hacer login con username
  if (columnasExisten) {
    try {
      const usuariosSinUsername = dbUsers
        .prepare("SELECT id, name, phone FROM users WHERE username IS NULL OR username = ''")
        .all();
      
      for (const usuario of usuariosSinUsername) {
        // Generar username basado en el nombre o teléfono
        let usernameGenerado = null;
        
        if (usuario.name) {
          // Intentar crear username desde el nombre (ej: "Alejandro Cruz" -> "alecruz")
          const nombreLimpio = usuario.name
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // Eliminar acentos
            .replace(/[^a-z0-9\s]/g, "") // Eliminar caracteres especiales
            .trim()
            .split(/\s+/)
            .slice(0, 2) // Tomar máximo 2 palabras
            .map(p => p.substring(0, 6)) // Máximo 6 caracteres por palabra
            .join("");
          
          if (nombreLimpio && nombreLimpio.length >= 3) {
            usernameGenerado = nombreLimpio;
          }
        }
        
        // Si no se pudo generar desde el nombre, usar el teléfono
        if (!usernameGenerado && usuario.phone) {
          usernameGenerado = `user_${usuario.phone.slice(-4)}`;
        }
        
        // Si aún no hay username, usar un genérico
        if (!usernameGenerado) {
          usernameGenerado = `user_${usuario.id}`;
        }
        
        // Verificar si el username ya existe
        let usernameFinal = usernameGenerado;
        let intentos = 0;
        while (intentos < 10) {
          const existe = dbUsers
            .prepare("SELECT id FROM users WHERE username = ?")
            .get(usernameFinal);
          
          if (!existe) {
            break; // Username disponible
          }
          
          // Si existe, agregar un número
          usernameFinal = `${usernameGenerado}${intentos + 1}`;
          intentos++;
        }
        
        // Actualizar el usuario con el username generado
        try {
          dbUsers
            .prepare("UPDATE users SET username = ? WHERE id = ?")
            .run(usernameFinal, usuario.id);
          console.log(`✅ Usuario ${usuario.id} (${usuario.name || usuario.phone}) configurado con username: ${usernameFinal}`);
        } catch (e) {
          console.warn(`⚠️ No se pudo configurar username para usuario ${usuario.id}:`, e.message);
        }
      }
      
      if (usuariosSinUsername.length > 0) {
        console.log(`✅ Configurados ${usuariosSinUsername.length} usuario(s) con username`);
      }
    } catch (e) {
      console.warn("⚠️ Error configurando usernames para usuarios existentes:", e.message);
    }
  }
}

try {
  dbUsers.exec(`ALTER TABLE users ADD COLUMN es_sistema INTEGER DEFAULT 0;`);
} catch (e) {}

try {
  dbUsers.exec(`
    CREATE TABLE IF NOT EXISTS user_voice_config (
      user_id INTEGER PRIMARY KEY,
      elevenlabs_voice_id TEXT,
      voice_name TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
} catch (e) {
  console.error("Error creando tabla user_voice_config:", e);
}

dbUsers.exec(`
  CREATE TABLE IF NOT EXISTS mobile_upload_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    tipo TEXT NOT NULL,
    registro_id INTEGER NOT NULL,
    usuario_id INTEGER,
    expira_en TEXT NOT NULL,
    usado INTEGER DEFAULT 0,
    creado_en TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_mobile_tokens_token ON mobile_upload_tokens(token);
  CREATE INDEX IF NOT EXISTS idx_mobile_tokens_expira ON mobile_upload_tokens(expira_en);
`);

const IXORA_PHONE = "0000000000";
let ixoraUser = dbUsers.prepare("SELECT id FROM users WHERE phone=?").get(IXORA_PHONE);

if (!ixoraUser) {
  const ixoraInfo = dbUsers
    .prepare("INSERT INTO users (name, phone, nickname, active, es_sistema) VALUES (?,?,?,1,1)")
    .run("IXORA", IXORA_PHONE, "IXORA");
  ixoraUser = { id: ixoraInfo.lastInsertRowid };
} else {
  dbUsers.prepare("UPDATE users SET es_sistema=1, active=1, nickname='IXORA' WHERE phone=?").run(IXORA_PHONE);
}

// Tabla de personalización
dbUsers.exec(`
  CREATE TABLE IF NOT EXISTS personalizacion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clave TEXT UNIQUE NOT NULL,
    valor TEXT,
    actualizado_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);


function recuperarInventarioDesdeAuditoria() {
  try {
    console.log("🔍 Buscando productos en auditoría...");
    
    const registros = dbAud
      .prepare(`
        SELECT detalle, fecha, accion, registro_id
        FROM auditoria
        WHERE tabla_afectada = 'productos_ref'
          AND (accion LIKE '%AGREGAR%' OR accion LIKE '%EDITAR%')
        ORDER BY fecha ASC
      `)
      .all();
    
    if (registros.length === 0) {
      console.log("⚠️ No se encontraron registros de productos en auditoría");
      return;
    }
    
    console.log(`📊 Encontrados ${registros.length} registros de auditoría relacionados con productos`);
    
    const productosRecuperados = new Map();
    
    for (const registro of registros) {
      const detalle = registro.detalle || "";
      
      let matchNombre = detalle.match(/producto\s+"([^"]+)"/i);
      if (!matchNombre) {
        matchNombre = detalle.match(/producto\s+([^|(]+)/i);
      }
      
      let matchCodigo = detalle.match(/Código:\s*([^|,)]+)/i);
      if (!matchCodigo) {
        matchCodigo = detalle.match(/Código:\s*([^,)]+)/i);
      }
      
      let matchPresentacion = detalle.match(/Presentación:\s*([^|]+)/i);
      if (!matchPresentacion) {
        matchPresentacion = detalle.match(/presentacion[^:]*:\s*([^|,)]+)/i);
      }
      if (!matchPresentacion) {
        matchPresentacion = detalle.match(/presentacion[^:]*:\s*([^,)]+)/i);
      }
      
      let matchCategoria = detalle.match(/Categoría:\s*([^|]+)/i);
      if (!matchCategoria) {
        matchCategoria = detalle.match(/Categoría:\s*([^,)]+)/i);
      }
      
      let matchSubcategoria = detalle.match(/Subcategoría:\s*([^|]+)/i);
      if (!matchSubcategoria) {
        matchSubcategoria = detalle.match(/Subcategoría:\s*([^,)]+)/i);
      }
      
      let matchLote = detalle.match(/Lote:\s*([^|]+)/i);
      if (!matchLote) {
        matchLote = detalle.match(/Lote:\s*([^,)]+)/i);
      }
      
      let matchPiezas = detalle.match(/Piezas por caja:\s*(\d+)/i);
      if (!matchPiezas) {
        matchPiezas = detalle.match(/piezas[^:]*:\s*(\d+)/i);
      }
      
      if (matchCodigo && matchNombre) {
        const codigo = matchCodigo[1].trim();
        const nombre = matchNombre[1].trim();
        
        let categoria = matchCategoria ? matchCategoria[1].trim() : null;
        let subcategoria = matchSubcategoria ? matchSubcategoria[1].trim() : null;
        let presentacion = matchPresentacion ? matchPresentacion[1].trim() : null;
        let lote = matchLote ? matchLote[1].trim() : null;
        const piezas_por_caja = matchPiezas ? parseInt(matchPiezas[1]) : 0;
        
        if (!categoria || categoria === 'N/A' || categoria === 'null' || categoria === 'undefined' || categoria === '') categoria = null;
        if (!subcategoria || subcategoria === 'N/A' || subcategoria === 'null' || subcategoria === 'undefined' || subcategoria === '') subcategoria = null;
        if (!presentacion || presentacion === 'N/A' || presentacion === 'null' || presentacion === 'undefined' || presentacion === '') presentacion = null;
        if (!lote || lote === 'N/A' || lote === 'null' || lote === 'undefined' || lote === '') lote = null;
        
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
    
    if (productosRecuperados.size === 0) {
      console.log("⚠️ No se pudieron extraer productos desde los registros de auditoría");
      return;
    }
    
    console.log(`✅ Extraídos ${productosRecuperados.size} productos únicos desde auditoría`);
    
    let insertados = 0;
    let actualizados = 0;
    let errores = 0;
    
    const insert = dbInv.prepare(`
      INSERT INTO productos_ref 
      (codigo, nombre, presentacion, categoria, subcategoria, piezas_por_caja)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const update = dbInv.prepare(`
      UPDATE productos_ref
      SET nombre = ?, presentacion = ?, categoria = ?, subcategoria = ?, piezas_por_caja = ?
      WHERE codigo = ?
    `);
    
    const insertLote = dbInv.prepare(`
      INSERT OR IGNORE INTO productos_lotes 
      (codigo_producto, lote, cantidad_piezas, activo, fecha_ingreso)
      VALUES (?, ?, 0, 1, datetime('now', 'localtime'))
    `);
    
    for (const [codigo, producto] of productosRecuperados) {
      try {
        const existe = dbInv.prepare("SELECT codigo FROM productos_ref WHERE codigo = ?").get(codigo);
        
        if (existe) {
          update.run(
            producto.nombre,
            producto.presentacion,
            producto.categoria,
            producto.subcategoria,
            producto.piezas_por_caja,
            codigo
          );
          actualizados++;
        } else {
          insert.run(
            producto.codigo,
            producto.nombre,
            producto.presentacion,
            producto.categoria,
            producto.subcategoria,
            producto.piezas_por_caja
          );
          insertados++;
        }
        
        if (producto.lote && producto.lote.trim() && producto.lote !== 'N/A') {
          try {
            insertLote.run(codigo, producto.lote.trim(), 0, 1);
          } catch (loteErr) {
            if (!String(loteErr.message).includes("UNIQUE")) {
              console.warn(`⚠️ Error insertando lote para ${codigo}:`, loteErr.message);
            }
          }
        }
      } catch (err) {
        if (!String(err.message).includes("UNIQUE")) {
          console.error(`❌ Error procesando producto ${codigo}:`, err.message);
        }
        errores++;
      }
    }
    
    const totalFinal = dbInv.prepare("SELECT COUNT(*) as total FROM productos_ref").get();
    console.log(`✅ Recuperación completada: ${insertados} insertados, ${actualizados} actualizados, ${errores} errores`);
    console.log(`📊 Inventario recuperado: ${totalFinal.total} productos en total`);
  } catch (error) {
    console.error("❌ Error recuperando inventario desde auditoría:", error.message);
  }
}

function recuperarLotesDesdeAuditoria() {
  try {
    console.log("🔍 Buscando lotes en auditoría...");
    
    const registros = dbAud
      .prepare(`
        SELECT detalle, fecha, accion, registro_id, tabla_afectada
        FROM auditoria
        WHERE (tabla_afectada = 'productos_lotes' OR tabla_afectada = 'productos_ref')
          AND (accion LIKE '%LOTE%' OR accion LIKE '%AGREGAR%' OR accion LIKE '%ACTUALIZAR%' OR detalle LIKE '%Lote:%')
        ORDER BY fecha ASC
      `)
      .all();
    
    if (registros.length === 0) {
      console.log("⚠️ No se encontraron registros de lotes en auditoría");
      return;
    }
    
    console.log(`📊 Encontrados ${registros.length} registros de auditoría relacionados con lotes`);
    
    const lotesRecuperados = new Map();
    
    for (const registro of registros) {
      const detalle = registro.detalle || "";
      
      let matchCodigo = detalle.match(/Código:\s*([^|,)]+)/i);
      if (!matchCodigo) {
        matchCodigo = detalle.match(/producto\s+([A-Z0-9\-]+)/i);
      }
      if (!matchCodigo) {
        matchCodigo = detalle.match(/del producto\s+([A-Z0-9\-]+)/i);
      }
      
      let matchLote = detalle.match(/Lote:\s*([^|,)]+)/i);
      if (!matchLote) {
        matchLote = detalle.match(/Lote\s+['"]?([^'",|)]+)/i);
      }
      if (!matchLote) {
        matchLote = detalle.match(/lote\s+['"]?([^'",|)]+)/i);
      }
      
      let matchCantidad = detalle.match(/Cantidad[^:]*:\s*(\d+)/i);
      if (!matchCantidad) {
        matchCantidad = detalle.match(/cantidad[^:]*:\s*(\d+)/i);
      }
      
      let matchLaboratorio = detalle.match(/Laboratorio[^:]*:\s*([^|,)]+)/i);
      
      let matchActivo = detalle.match(/Activo[^:]*:\s*([01])/i);
      if (!matchActivo) {
        matchActivo = detalle.match(/agregado|actualizado/i) ? ['', '1'] : null;
      }
      
      if (matchCodigo && matchLote) {
        const codigo = matchCodigo[1].trim();
        const lote = matchLote[1].trim();
        const cantidad = matchCantidad ? parseInt(matchCantidad[1]) : 0;
        const laboratorio = matchLaboratorio ? matchLaboratorio[1].trim() : null;
        const activo = matchActivo ? parseInt(matchActivo[1]) : 1;
        
        if (!lote || lote === 'N/A' || lote === 'null' || lote === 'undefined' || lote === '' || lote === 'NULL') continue;
        if (!codigo || codigo === 'N/A' || codigo === 'null' || codigo === 'undefined' || codigo === '') continue;
        
        const clave = `${codigo}_${lote}`;
        if (!lotesRecuperados.has(clave)) {
          lotesRecuperados.set(clave, {
            codigo_producto: codigo,
            lote: lote,
            cantidad_piezas: cantidad,
            laboratorio: laboratorio || null,
            activo: activo,
            fecha: registro.fecha
          });
        }
      }
    }
    
    if (lotesRecuperados.size === 0) {
      console.log("⚠️ No se pudieron extraer lotes desde los registros de auditoría");
      return;
    }
    
    console.log(`✅ Extraídos ${lotesRecuperados.size} lotes únicos desde auditoría`);
    
    let insertados = 0;
    let yaExistentes = 0;
    let errores = 0;
    
    const insert = dbInv.prepare(`
      INSERT INTO productos_lotes 
      (codigo_producto, lote, cantidad_piezas, laboratorio, activo, fecha_ingreso)
      VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `);
    
    for (const [clave, lote] of lotesRecuperados) {
      try {
        const existe = dbInv
          .prepare("SELECT id FROM productos_lotes WHERE codigo_producto = ? AND lote = ?")
          .get(lote.codigo_producto, lote.lote);
        
        if (!existe) {
          insert.run(
            lote.codigo_producto,
            lote.lote,
            lote.cantidad_piezas,
            lote.laboratorio,
            lote.activo
          );
          insertados++;
        } else {
          yaExistentes++;
        }
      } catch (err) {
        if (!String(err.message).includes("UNIQUE")) {
          console.error(`❌ Error procesando lote ${lote.codigo_producto} - ${lote.lote}:`, err.message);
        }
        errores++;
      }
    }
    
    const totalLotes = dbInv.prepare("SELECT COUNT(*) as total FROM productos_lotes").get();
    console.log(`✅ Recuperación de lotes completada: ${insertados} insertados, ${yaExistentes} ya existían, ${errores} errores`);
    console.log(`📊 Total de lotes en productos_lotes: ${totalLotes.total}`);
  } catch (error) {
    console.error("❌ Error recuperando lotes desde auditoría:", error.message);
    console.error("   Stack:", error.stack);
  }
}

try {
  const totalLotes = dbInv.prepare("SELECT COUNT(*) as total FROM productos_lotes").get();
  if (totalLotes.total === 0) {
    console.log("🔄 Tabla productos_lotes vacía detectada. Intentando recuperar desde auditoría...");
    try {
      recuperarLotesDesdeAuditoria();
    } catch (err) {
      console.error("❌ Error en recuperación automática de lotes:", err.message);
    }
  }
} catch (error) {
  console.error(`❌ Error verificando lotes:`, error.message);
}

// ==========================================
// ACTIVOS INFORMÁTICOS
// ==========================================
dbActivos.exec(`
  CREATE TABLE IF NOT EXISTS responsables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unidad TEXT NOT NULL,
    responsable TEXT NOT NULL,
    cargo_area TEXT,
    estacion TEXT,
    fecha_creacion TEXT DEFAULT (datetime('now', 'localtime')),
    fecha_actualizacion TEXT DEFAULT (datetime('now', 'localtime'))
  );
  
  CREATE TABLE IF NOT EXISTS activos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    responsable_id INTEGER NOT NULL,
    tipo_equipo TEXT NOT NULL,
    marca_modelo TEXT,
    numero_serie TEXT,
    fecha_asignacion TEXT DEFAULT (datetime('now', 'localtime')),
    fecha_actualizacion TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (responsable_id) REFERENCES responsables(id) ON DELETE CASCADE
  );
  
  CREATE INDEX IF NOT EXISTS idx_activos_responsable ON activos(responsable_id);
  CREATE INDEX IF NOT EXISTS idx_responsables_unidad ON responsables(unidad);
`);

// Migración: Agregar nuevas columnas si no existen
try {
  const columnasResponsables = dbActivos.prepare("PRAGMA table_info(responsables)").all();
  const nombresColumnasResp = columnasResponsables.map(c => c.name);
  
  if (!nombresColumnasResp.includes("estacion")) {
    dbActivos.exec("ALTER TABLE responsables ADD COLUMN estacion TEXT");
    console.log("✅ Columna 'estacion' agregada a responsables");
  }
  
  // Hacer cargo_area opcional (quitar NOT NULL si existe)
  if (nombresColumnasResp.includes("cargo_area")) {
    // SQLite no soporta MODIFY COLUMN directamente, pero podemos hacerlo opcional en nuevas inserciones
  }
  
  const columnasActivos = dbActivos.prepare("PRAGMA table_info(activos)").all();
  const nombresColumnasAct = columnasActivos.map(c => c.name);
  const tieneEquipo = nombresColumnasAct.includes("equipo");
  const tieneTipoEquipo = nombresColumnasAct.includes("tipo_equipo");
  
  if (!nombresColumnasAct.includes("tipo_equipo")) {
    dbActivos.exec("ALTER TABLE activos ADD COLUMN tipo_equipo TEXT");
    console.log("✅ Columna 'tipo_equipo' agregada a activos");
    // Migrar datos existentes: si existe 'equipo', copiarlo a 'tipo_equipo'
    try {
      if (tieneEquipo) {
        dbActivos.exec(`
          UPDATE activos 
          SET tipo_equipo = equipo 
          WHERE tipo_equipo IS NULL AND equipo IS NOT NULL
        `);
        console.log("✅ Datos migrados de 'equipo' a 'tipo_equipo'");
      }
    } catch (e) {
      console.warn("⚠️ No se pudieron migrar datos de equipo:", e.message);
    }
  }
  
  if (!nombresColumnasAct.includes("marca_modelo")) {
    dbActivos.exec("ALTER TABLE activos ADD COLUMN marca_modelo TEXT");
    console.log("✅ Columna 'marca_modelo' agregada a activos");
    // Migrar datos existentes: si existe 'modelo', copiarlo a 'marca_modelo'
    try {
      if (nombresColumnasAct.includes("modelo")) {
        dbActivos.exec(`
          UPDATE activos 
          SET marca_modelo = modelo 
          WHERE marca_modelo IS NULL AND modelo IS NOT NULL
        `);
        console.log("✅ Datos migrados de 'modelo' a 'marca_modelo'");
      }
    } catch (e) {
      console.warn("⚠️ No se pudieron migrar datos de modelo:", e.message);
    }
  }
  
  // Si la tabla tiene 'equipo' como NOT NULL pero también tiene 'tipo_equipo',
  // asegurarnos de que 'equipo' tenga valores para compatibilidad
  if (tieneEquipo && tieneTipoEquipo) {
    try {
      dbActivos.exec(`
        UPDATE activos 
        SET equipo = tipo_equipo 
        WHERE (equipo IS NULL OR equipo = '') AND tipo_equipo IS NOT NULL
      `);
    } catch (e) {
      console.warn("⚠️ No se pudieron actualizar valores de equipo:", e.message);
    }
  }
  
  // Mantener compatibilidad: si existe 'equipo' o 'modelo', mantenerlos por ahora
} catch (e) {
  console.warn("⚠️ Error en migración de activos:", e.message);
}

// Verificar si la tabla pdas existe y obtener sus columnas
let tablaPDAsExiste = false;
let columnasPDAs = [];
let nombresColumnasPDA = [];

try {
  const tableInfo = dbActivos.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pdas'").get();
  if (tableInfo) {
    tablaPDAsExiste = true;
    columnasPDAs = dbActivos.prepare("PRAGMA table_info(pdas)").all();
    nombresColumnasPDA = columnasPDAs.map(c => c.name);
  }
} catch (e) {
  console.warn("⚠️ Error verificando tabla pdas:", e.message);
}

// Si la tabla no existe, crearla con la estructura nueva
if (!tablaPDAsExiste) {
  dbActivos.exec(`
    -- Tabla para PDAs
    CREATE TABLE pdas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pda TEXT NOT NULL,
      imei TEXT,
      modelo_pda TEXT,
      android TEXT,
      impresora TEXT,
      serie_pda TEXT,
      modelo_impresora TEXT,
      encargado TEXT,
      responsable TEXT,
      area TEXT,
      observaciones TEXT,
      orden INTEGER DEFAULT 0,
      fecha_creacion TEXT DEFAULT (datetime('now', 'localtime')),
      fecha_actualizacion TEXT DEFAULT (datetime('now', 'localtime'))
    );
    
    CREATE INDEX IF NOT EXISTS idx_pdas_pda ON pdas(pda);
    CREATE INDEX IF NOT EXISTS idx_pdas_responsable ON pdas(responsable);
    CREATE INDEX IF NOT EXISTS idx_pdas_area ON pdas(area);
    CREATE INDEX IF NOT EXISTS idx_pdas_orden ON pdas(orden);
  `);
  // Tabla pdas creada con estructura nueva
} else {
  // La tabla existe, hacer migración
  
  // Migración: Agregar nuevas columnas a PDAs si no existen
  try {
    // Agregar nuevas columnas si no existen
    if (!nombresColumnasPDA.includes("pda")) {
      // Primero agregar la columna sin NOT NULL para evitar problemas
      dbActivos.exec("ALTER TABLE pdas ADD COLUMN pda TEXT");
      // Migrar datos: si existe equipo_pda, copiarlo a pda
      try {
        if (nombresColumnasPDA.includes("equipo_pda")) {
          dbActivos.exec(`
            UPDATE pdas 
            SET pda = equipo_pda 
            WHERE pda IS NULL AND equipo_pda IS NOT NULL
          `);
          console.log("✅ Datos migrados de 'equipo_pda' a 'pda'");
        }
      } catch (e) {
        console.warn("⚠️ No se pudieron migrar datos de equipo_pda:", e.message);
      }
      // Ahora actualizar los registros que no tienen pda para que tengan un valor por defecto
      try {
        dbActivos.exec(`
          UPDATE pdas 
          SET pda = 'PDA-' || id 
          WHERE pda IS NULL OR pda = ''
        `);
        console.log("✅ Valores por defecto asignados a registros sin 'pda'");
      } catch (e) {
        console.warn("⚠️ No se pudieron asignar valores por defecto:", e.message);
      }
    }
    
    if (!nombresColumnasPDA.includes("imei")) {
      dbActivos.exec("ALTER TABLE pdas ADD COLUMN imei TEXT");
    }
    if (!nombresColumnasPDA.includes("android")) {
      dbActivos.exec("ALTER TABLE pdas ADD COLUMN android TEXT");
    }
    if (!nombresColumnasPDA.includes("impresora")) {
      dbActivos.exec("ALTER TABLE pdas ADD COLUMN impresora TEXT");
    }
    if (!nombresColumnasPDA.includes("modelo_impresora")) {
      dbActivos.exec("ALTER TABLE pdas ADD COLUMN modelo_impresora TEXT");
      // Migrar datos: si existe modelo_complemento, copiarlo a modelo_impresora
      try {
        if (nombresColumnasPDA.includes("modelo_complemento")) {
          dbActivos.exec(`
            UPDATE pdas 
            SET modelo_impresora = modelo_complemento 
            WHERE modelo_impresora IS NULL AND modelo_complemento IS NOT NULL
          `);
          console.log("✅ Datos migrados de 'modelo_complemento' a 'modelo_impresora'");
        }
      } catch (e) {
        console.warn("⚠️ No se pudieron migrar datos de modelo_complemento:", e.message);
      }
    }
    if (!nombresColumnasPDA.includes("encargado")) {
      dbActivos.exec("ALTER TABLE pdas ADD COLUMN encargado TEXT");
    }
    if (!nombresColumnasPDA.includes("area")) {
      dbActivos.exec("ALTER TABLE pdas ADD COLUMN area TEXT");
      // Migrar datos: si existe unidad, copiarlo a area
      try {
        if (nombresColumnasPDA.includes("unidad")) {
          dbActivos.exec(`
            UPDATE pdas 
            SET area = unidad 
            WHERE area IS NULL AND unidad IS NOT NULL
          `);
          console.log("✅ Datos migrados de 'unidad' a 'area'");
        }
      } catch (e) {
        console.warn("⚠️ No se pudieron migrar datos de unidad:", e.message);
      }
    }
    if (!nombresColumnasPDA.includes("observaciones")) {
      dbActivos.exec("ALTER TABLE pdas ADD COLUMN observaciones TEXT");
    }
    
    // Actualizar la lista de columnas después de la migración
    const columnasPDAsActualizadas = dbActivos.prepare("PRAGMA table_info(pdas)").all();
    const nombresColumnasPDAActualizadas = columnasPDAsActualizadas.map(c => c.name);
    
    // Crear índices solo si las columnas existen
    try {
      if (nombresColumnasPDAActualizadas.includes("pda")) {
        dbActivos.exec("CREATE INDEX IF NOT EXISTS idx_pdas_pda ON pdas(pda)");
      }
      if (nombresColumnasPDAActualizadas.includes("responsable")) {
        dbActivos.exec("CREATE INDEX IF NOT EXISTS idx_pdas_responsable ON pdas(responsable)");
      }
      if (nombresColumnasPDAActualizadas.includes("area")) {
        dbActivos.exec("CREATE INDEX IF NOT EXISTS idx_pdas_area ON pdas(area)");
      }
    } catch (e) {
      console.warn("⚠️ Error creando índices:", e.message);
    }
  } catch (e) {
    console.warn("⚠️ Error en migración de PDAs:", e.message);
  }
}

export { 
  dbInv, dbDia, dbHist, dbUsers, dbReenvios, dbAud, dbDevol, dbChat, IXORA_PHONE,
  dbActivos, dbVentas, dbRRHH
};