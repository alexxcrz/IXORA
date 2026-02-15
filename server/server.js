// Servidor principal de IXORA
import "./src/config/entorno.js";

import fs from "fs";
import express from "express";
import http from "http";
import cors from "cors";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

// Para ES modules: obtener __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración y rutas
import "./src/config/baseDeDatos.js";
import { initSocket } from "./src/config/socket.js";
import { dbHist } from "./src/config/baseDeDatos.js";
import authRoutes from "./src/rutas/autenticacion.js";
import inventoryRoutes from "./src/rutas/inventario.js";
import dailyRoutes from "./src/rutas/picking.js";
import ReenviosRoutes from "./src/rutas/reenvios.js";
import reportRoutes from "./src/rutas/reportes.js";
import adminRoutes from "./src/rutas/administrador.js";
import devolucionesRoutes from "./src/rutas/devoluciones.js";
import chatRoutes from "./src/rutas/chat.js";
import notificacionesRoutes from "./src/rutas/notificaciones.js";
import activosRoutes from "./src/rutas/activos.js";
import reunionesRoutes from "./src/rutas/reuniones.js";

const app = express();

// Servidor HTTP (HTTPS eliminado completamente)
let server;
server = http.createServer(app);

initSocket(server);

// Middleware global CORS - Permitir todos los orígenes para acceso desde múltiples dispositivos
app.use(cors({
  origin: function (origin, callback) {
    // Permitir todos los orígenes para acceso desde cualquier dispositivo en la red
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'Content-Type']
}));

// Middleware para logging - Solo errores importantes
app.use((req, res, next) => {
  // NO loguear OPTIONS (preflight requests)
  if (req.method === 'OPTIONS') {
    return next();
  }
  
  // Solo loguear errores críticos (login fallido, etc.)
  const path = req.path || req.url;
  const isCritical = 
    (path.includes('/login') && req.method === 'POST') ||
    path.includes('/error');
  
  // Los logs se harán solo en los handlers de error, no aquí
  next();
});

// Middleware JSON condicional (omite multipart/form-data)
app.use((req, res, next) => {
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("multipart/form-data")) return next();
  express.json({ limit: "50mb" })(req, res, next);
});

// Middleware urlencoded condicional
app.use((req, res, next) => {
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("multipart/form-data")) return next();
  express.urlencoded({ limit: "50mb", extended: true })(req, res, next);
});

// 🔒 Middlewares de seguridad
import { antiVPNMiddleware } from "./src/middleware/antiVPN.js";
import { securityHeaders, detectAnomalies } from "./src/middleware/security.js";
import { inputValidationMiddleware } from "./src/middleware/inputValidation.js";
import { honeypotMiddleware } from "./src/middleware/honeypot.js";
import { geofencingMiddleware } from "./src/middleware/geofencing.js";
import { timeRestrictionsMiddleware } from "./src/middleware/timeRestrictions.js";
import { ipReputationMiddleware } from "./src/middleware/ipReputation.js";
import { sessionSecurityMiddleware } from "./src/middleware/sessionSecurity.js";

// Middleware de seguridad y redirecciones

// Headers de seguridad HTTP (primero)
app.use(securityHeaders);

// Validación y sanitización de entrada
app.use(inputValidationMiddleware);

// Detección de anomalías en requests
app.use(detectAnomalies);

// Honeypot (detectar bots)
app.use(honeypotMiddleware);

// Geofencing (bloquear países)
app.use(geofencingMiddleware);

// Restricciones de tiempo/horario
app.use(timeRestrictionsMiddleware);

// Verificación de reputación de IPs
app.use(ipReputationMiddleware);

// 🔒 Rate limiting general (protección contra ataques) - DESHABILITADO
// app.use(generalRateLimiter);

// 🔒 Anti-VPN (verificación asíncrona para no ralentizar)
app.use(antiVPNMiddleware);

// Seguridad de sesiones (después de autenticación)
// Se aplicará donde sea necesario en las rutas

// Servir archivos estáticos
app.use("/uploads", express.static("uploads"));
app.use("/sounds", express.static("sounds"));
// Alias directo para fondos: permitir /personalizacion/...
app.use(
  "/personalizacion",
  express.static(path.join(process.cwd(), "uploads", "personalizacion"))
);

// Crear carpetas si no existen
const REENVIOS_DIR = path.join(process.cwd(), "uploads", "reenvios");
if (!fs.existsSync(REENVIOS_DIR)) {
  fs.mkdirSync(REENVIOS_DIR, { recursive: true });
}

const PERSONALIZACION_DIR = path.join(process.cwd(), "uploads", "personalizacion");
if (!fs.existsSync(PERSONALIZACION_DIR)) {
  fs.mkdirSync(PERSONALIZACION_DIR, { recursive: true });
}

// Configuración de rutas
app.use(authRoutes);
app.use("/devoluciones", devolucionesRoutes);
app.use("/inventario", inventoryRoutes);
app.use(dailyRoutes);
app.use("/api/reenvios", ReenviosRoutes);
app.use(reportRoutes);
app.use(adminRoutes);
app.use("/chat", chatRoutes);
app.use("/notificaciones", notificacionesRoutes);
app.use("/activos", activosRoutes);
app.use("/reuniones", reunionesRoutes);

// 🔒 Rutas de seguridad administrativas
import seguridadRoutes from "./src/rutas/seguridad.js";
app.use("/api/seguridad", seguridadRoutes);
// Rutas de seguridad montadas

import auditoriaRoutes from "./src/rutas/auditoria.js";
app.use("/api/auditoria", auditoriaRoutes);

import activacionesRoutes from "./src/rutas/activaciones.js";
app.use("/activaciones", activacionesRoutes);

// Health check y endpoints especiales (ANTES del catch-all)
app.get("/health", (_req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

// Endpoint para obtener la IP del servidor
app.get("/server-info", (_req, res) => {
  const interfaces = os.networkInterfaces();
  let localIP = 'localhost';
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIP = iface.address;
        break;
      }
    }
    if (localIP !== 'localhost') break;
  }
  
  const serverUrl = `http://${localIP}:${PORT}`;
  
  res.json({ 
    ip: localIP,
    port: PORT,
    url: serverUrl
  });
});

// Endpoint para actualizar la configuración del servidor desde el cliente
app.post("/server-config", (req, res) => {
  // Este endpoint permite que el cliente informe al servidor sobre cambios de IP
  // El servidor puede usar esta información para logs o configuración
  const { ip, port, url } = req.body;
  
  // Solo loguear si hay cambios significativos
  
  res.json({ 
    ok: true, 
    message: "Configuración recibida",
    current: {
      ip: LOCAL_IP,
      port: PORT,
      url: `http://${LOCAL_IP}:${PORT}`
    }
  });
});

// Endpoint de debug histórico
app.get("/__debug_hist", (req, res) => {
  try {
    const rows = dbHist
      .prepare(
        `
      SELECT id, fecha, codigo, cajas, piezas, piezas_por_caja, extras
      FROM productos_historico
      ORDER BY fecha DESC, id DESC
      LIMIT 100
    `
      )
      .all();

    res.json(rows);
  } catch (e) {
    res.json({ error: e.message });
  }
});



// Fallback SPA: servir index.html para rutas principales de pestañas
import { readFile } from "fs/promises";
const SPA_TABS = [
  "/devoluciones",
  "/inventario",
  "/picking",
  "/registros",
  "/registrospicking",
  "/reportes",
  "/reportesdevoluciones",
  "/reportespicking",
  "/reportesactivaciones",
  // "/reenvios", // Handler dedicado abajo
  "/activaciones",
  "/admin",
  "/auditoria",
  "/activos",
  "/activosinformaticos",
  "/ixoraia",
  "/ixora_ia",
  "/login",
  "/personalizacion",
  "/controlcalidad",
  "/tienda"
];

// Fallback SPA: servir index.html para cualquier ruta no API ni estática
app.get("*", async (req, res, next) => {
  if (
    req.path.startsWith("/api/") ||
    req.path.startsWith("/uploads/") ||
    req.path.startsWith("/sounds/") ||
    req.path.startsWith("/personalizacion/")
  ) {
    return next();
  }
  try {
    const indexPath = path.join(process.cwd(), "client", "public", "index.html");
    const html = await readFile(indexPath, "utf8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    res.status(500).send("No se pudo cargar la aplicación.");
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3001;

// Función para obtener la IP local
const getLocalIP = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Ignorar direcciones internas (no IPv4) y loopback
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost'; // Fallback si no se encuentra IP
};

const LOCAL_IP = getLocalIP();

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ ERROR: El puerto ${PORT} ya está en uso.`);
    console.error(`   Por favor, detén el proceso que está usando el puerto ${PORT}:`);
    console.error(`   Windows: Get-NetTCPConnection -LocalPort ${PORT} | Select-Object OwningProcess`);
    console.error(`   O ejecuta: Get-Process node | Stop-Process -Force\n`);
    process.exit(1);
  } else {
    console.error('❌ Error del servidor:', err);
    process.exit(1);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n✅ SERVIDOR EN LINEA`);
  console.log(`   📍 Local:    http://localhost:${PORT}`);
  console.log(`   🌐 Red:      http://${LOCAL_IP}:${PORT}`);
  console.log(`   🔌 Escuchando en todas las interfaces (0.0.0.0:${PORT})\n`);
});

// Cerrar servidor
process.on('SIGINT', () => {
  console.log('\n🛑 Cerrando servidor...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Cerrando servidor...');
  process.exit(0);
});
