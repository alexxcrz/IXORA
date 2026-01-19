// Rutas para IXORA IA integrado (sin servidor FastAPI separado)
import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { requierePermiso } from '../middleware/permisos.js';
import { dbDia, dbHist, dbDevol, dbReenvios, dbUsers } from '../config/baseDeDatos.js';
import dayjs from 'dayjs';
import ExcelJS from 'exceljs';
import multer from 'multer';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { conocimientosProgramacion, buscarConocimiento } from '../utilidades/conocimientosIA.js';
import { reconocerProductosEnImagen, reconocerProductoSimple, analizarImagenGeneral, reconocerSegunContexto } from '../utilidades/reconocimientoProductos.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurar multer para subir archivos de audio
const upload = multer({
  dest: 'uploads/voices/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB máximo
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato de audio no soportado. Use MP3, WAV, WebM u OGG'));
    }
  }
});

const router = express.Router();

// Memoria de conversaciones (en producción usarías una base de datos)
const memoriaConversaciones = {};

// Respuestas conversacionales
const saludos = [
  "¡Hola! 👋 Me da mucho gusto saludarte. ¿En qué puedo ayudarte hoy?",
  "¡Hola! 😊 ¿Cómo estás? Estoy aquí para lo que necesites.",
  "Hola, encantada de conocerte. ¿En qué puedo asistirte?",
  "¡Hola! ✨ Qué lindo verte. ¿Qué puedo hacer por ti?",
  "Hola, ¿cómo estás? 😊 Me encantaría ayudarte con lo que necesites."
];

const despedidas = [
  "¡Hasta luego! 💕 Fue un placer ayudarte. Que tengas un día maravilloso.",
  "¡Adiós! 😊 Fue hermoso conversar contigo. Cualquier cosa, aquí estaré.",
  "¡Hasta pronto! ✨ Que tengas un excelente día. Nos vemos pronto.",
  "¡Chao! 💖 Fue un gusto ayudarte. Cualquier cosa, no dudes en preguntarme."
];

// Función para detectar saludos
const esSaludo = (mensaje) => {
  const saludosList = ["hola", "hi", "hey", "buenos días", "buenas tardes", "buenas noches", 
                       "qué tal", "como estas", "cómo estás", "saludos"];
  const palabras = mensaje.toLowerCase().split(/\s+/);
  return palabras.some(palabra => saludosList.includes(palabra)) && palabras.length <= 5;
};

// Función para detectar despedidas
const esDespedida = (mensaje) => {
  const despedidasList = ["adiós", "adios", "hasta luego", "chao", "nos vemos", "hasta pronto", 
                         "gracias", "bye", "hasta la vista"];
  return despedidasList.some(despedida => mensaje.toLowerCase().includes(despedida));
};

// Función para detectar comandos de imagen
const esComandoImagen = (mensaje) => {
  const mensajeLower = mensaje.toLowerCase();
  const acciones = ["genera", "generar", "crea", "crear", "haz", "hacer", "dibuja", 
                   "dibujar", "pinta", "pintar", "diseña", "diseñar", "muestra", "muéstrame",
                   "quiero", "necesito", "dame", "dame una", "hazme", "hazme una"];
  const tipos = ["imagen", "imágenes", "imagenes", "foto", "fotos", "dibujo", 
                "dibujos", "diseño", "diseños", "grafico", "gráfico"];
  
  const tieneAccion = acciones.some(accion => mensajeLower.includes(accion));
  const tieneTipo = tipos.some(tipo => mensajeLower.includes(tipo));
  
  return tieneAccion && tieneTipo;
};

// Función para detectar comandos de productos
const esComandoProducto = (mensaje) => {
  const palabras = ["producto", "agregar", "añadir", "surte", "surtir", "busca producto", 
                   "buscar producto", "inventario", "stock"];
  return palabras.some(palabra => mensaje.toLowerCase().includes(palabra));
};

// Función para detectar consultas de información
const esConsultaInformacion = (mensaje) => {
  const consultas = ["reporte", "informe", "estadística", "estadisticas", "cuántos", 
                    "cuantos", "cuántas", "cuantas", "dónde", "donde", "qué productos", 
                    "que productos", "listar", "mostrar todos"];
  return consultas.some(consulta => mensaje.toLowerCase().includes(consulta));
};

// Función para detectar comandos de generación de reportes
const esComandoReporte = (mensaje) => {
  const mensajeLower = mensaje.toLowerCase();
  const acciones = ["genera", "generar", "crea", "crear", "haz", "hacer", "dame", "dame un", 
                   "quiero", "necesito", "exporta", "exportar", "descarga", "descargar",
                   "saca", "sácame", "muéstrame", "muestra", "obtén", "obtener"];
  const tipos = ["reporte", "informe", "excel", "archivo", "pdf", "texto", "txt"];
  const pestañas = ["picking", "devoluciones", "reenvios", "inventario", "clientes", 
                   "calidad", "reacondicionados", "retail", "cubbo", "regulatorio", "reenvíos"];
  
  const tieneAccion = acciones.some(accion => mensajeLower.includes(accion));
  const tieneTipo = tipos.some(tipo => mensajeLower.includes(tipo));
  const tienePestaña = pestañas.some(pestaña => mensajeLower.includes(pestaña));
  
  // También detectar si menciona "reporte" o "reportes" sin acción explícita pero con pestaña
  const mencionaReporte = mensajeLower.includes("reporte") || mensajeLower.includes("reportes");
  
  return (tieneAccion && tieneTipo) || (mencionaReporte && tienePestaña);
};

// Función para detectar consultas de programación (MUY EXPANDIDA)
const esConsultaProgramacion = (mensaje) => {
  const mensajeLower = mensaje.toLowerCase();
  const palabrasProgramacion = [
    // Lenguajes y frameworks
    "programar", "código", "codigo", "javascript", "js", "react", "node", "nodejs", "python", "java",
    "typescript", "ts", "vue", "angular", "svelte", "next", "nextjs", "nest", "nestjs",
    "php", "ruby", "go", "rust", "c++", "c#", "swift", "kotlin", "dart", "flutter",
    
    // Conceptos básicos
    "funcion", "función", "variable", "array", "objeto", "clase", "componente", "hook",
    "constante", "let", "var", "const", "import", "export", "module", "módulo",
    
    // React específico
    "usestate", "use effect", "useeffect", "usecontext", "usecallback", "usememo", "useref",
    "props", "state", "context", "provider", "reducer", "usereducer", "custom hook",
    "jsx", "virtual dom", "rendering", "lifecycle", "ciclo de vida",
    
    // JavaScript avanzado
    "async", "await", "promise", "fetch", "axios", "api", "endpoint", "rest", "graphql",
    "closure", "clausura", "scope", "alcance", "hoisting", "this", "bind", "call", "apply",
    "arrow function", "arrow", "destructuring", "desestructuración", "spread", "rest operator",
    "template literal", "template string", "symbol", "generator", "iterator", "proxy",
    "weakmap", "weakset", "map", "set", "regex", "regexp", "regular expression",
    
    // Node.js y backend
    "express", "router", "middleware", "route", "ruta", "endpoint", "controller",
    "model", "view", "mvc", "mvp", "mvvm", "arquitectura", "architecture",
    "npm", "yarn", "package", "package.json", "dependency", "dependencia",
    
    // Bases de datos
    "sql", "mysql", "postgresql", "postgres", "mongodb", "mongo", "sqlite", "redis",
    "base de datos", "database", "db", "query", "consulta", "schema", "esquema",
    "migration", "migración", "orm", "sequelize", "mongoose", "prisma", "typeorm",
    "join", "inner join", "left join", "right join", "index", "índice", "transaction",
    
    // Autenticación y seguridad
    "autenticacion", "autenticación", "auth", "jwt", "token", "session", "sesión",
    "oauth", "passport", "bcrypt", "hash", "encrypt", "encriptar", "cors", "csrf",
    "xss", "sql injection", "injection", "security", "seguridad", "vulnerabilidad",
    
    // WebSockets y tiempo real
    "socket", "websocket", "socket.io", "ws", "real-time", "tiempo real", "event",
    "emit", "on", "broadcast", "room", "sala",
    
    // Frontend
    "css", "html", "scss", "sass", "less", "stylus", "tailwind", "bootstrap",
    "responsive", "responsive design", "mobile first", "flexbox", "grid", "css grid",
    "dom", "bom", "event listener", "event handler", "bubbling", "capturing",
    "localstorage", "sessionstorage", "cookie", "cache", "service worker", "pwa",
    
    // Testing
    "test", "testing", "unit test", "integration test", "e2e", "jest", "mocha",
    "chai", "cypress", "playwright", "selenium", "tdd", "bdd", "coverage",
    
    // DevOps y herramientas
    "git", "github", "gitlab", "ci/cd", "docker", "kubernetes", "k8s", "aws",
    "azure", "gcp", "deploy", "deployment", "production", "staging", "devops",
    
    // Patrones y arquitectura
    "patron", "patrón", "pattern", "design pattern", "singleton", "factory", "observer",
    "mvc", "mvp", "mvvm", "flux", "redux", "mobx", "zustand", "recoil",
    "microservices", "microservicios", "monolith", "monolito", "serverless",
    
    // Optimización
    "performance", "rendimiento", "optimization", "optimización", "lazy loading",
    "code splitting", "bundle", "webpack", "vite", "parcel", "tree shaking",
    "memoization", "memoización", "debounce", "throttle", "virtualization",
    
    // Problemas y debugging
    "error", "bug", "debug", "debugging", "console.log", "breakpoint", "stack trace",
    "sintaxis", "syntax", "error", "exception", "try catch", "throw", "error handling",
    "problema", "issue", "fix", "solucionar", "resolver", "arreglar",
    
    // Preguntas comunes
    "como hacer", "cómo hacer", "ayuda con", "explicame", "explica", "ejemplo",
    "tutorial", "mejor práctica", "mejores prácticas", "best practice", "how to",
    "que es", "qué es", "para que sirve", "para qué sirve", "cuando usar", "cuándo usar",
    "diferencia entre", "vs", "versus", "comparacion", "comparación",
    
    // Otros
    "frontend", "backend", "fullstack", "full stack", "stack", "framework", "library",
    "librería", "package", "dependency", "dependencia", "version", "versión"
  ];
  
  return palabrasProgramacion.some(palabra => mensajeLower.includes(palabra));
};

// Función para detectar consultas sobre reconocimiento de productos
const esConsultaReconocimiento = (mensaje) => {
  const mensajeLower = mensaje.toLowerCase();
  const palabrasReconocimiento = [
    'reconocer', 'reconocimiento', 'escanear', 'escanear producto', 'detectar producto',
    'identificar producto', 'qué es este producto', 'que es este producto',
    'reconocimiento imagen', 'reconocimiento de imagen', 'ocr', 'reconocimiento texto',
    'visión computadora', 'vision computadora', 'procesamiento imagen',
    'cámara', 'camara', 'foto', 'imagen', 'producto', 'inventario',
    'qué producto es', 'que producto es', 'detectar', 'identificar'
  ];
  
  return palabrasReconocimiento.some(palabra => mensajeLower.includes(palabra));
};

// Función para procesar consultas sobre reconocimiento
const procesarConsultaReconocimiento = (mensajeOriginal, mensajeLower, memoria) => {
  let respuesta = "";
  
  // Buscar conocimiento específico sobre reconocimiento
  const conocimiento = buscarConocimiento(mensajeOriginal);
  
  if (conocimiento) {
    respuesta = conocimiento;
  } else {
    // Respuesta contextual sobre reconocimiento de productos
    const esPregunta = mensajeLower.includes('?') || 
                      mensajeLower.includes('qué') || 
                      mensajeLower.includes('que es') ||
                      mensajeLower.includes('como') ||
                      mensajeLower.includes('cómo');
    
    if (esPregunta) {
      respuesta = `¡Claro! Puedo ayudarte con reconocimiento de productos. 📸

**¿Cómo funciona?**
1. Puedes usar la cámara en vivo o subir una imagen
2. El sistema extrae texto de la imagen usando OCR
3. Busca coincidencias en tu inventario
4. Te muestra los productos encontrados con sus códigos

**Características:**
- ✅ Reconocimiento de texto en imágenes
- ✅ Búsqueda flexible en inventario
- ✅ Detección de nombre, presentación, lote y cantidad
- ✅ Funciona con cámara en vivo o imágenes subidas

**Para usar:**
- Ve a la pestaña "Imágenes" en el menú lateral
- Haz clic en "Cámara en Vivo" o "Subir Imagen"
- El sistema reconocerá automáticamente los productos

**Mejores resultados cuando:**
- La imagen tiene buena iluminación
- El texto es claro y legible
- El producto está centrado en la imagen
- Evitas reflejos y sombras

¿Quieres que te explique algo más específico sobre el reconocimiento?`;
    } else {
      respuesta = `Soy IXORA IA y puedo reconocer productos en imágenes. 📸

**Funcionalidades:**
- Reconocimiento de productos por foto, video o cámara en vivo
- Extracción automática de texto (OCR)
- Búsqueda en tu inventario
- Detección de códigos, nombres, presentaciones, lotes y cantidades

**Para empezar:**
1. Ve a la pestaña "🖼️ Imágenes" en el menú lateral
2. Usa "Cámara en Vivo" para escanear en tiempo real
3. O "Subir Imagen" para analizar una foto

El sistema comparará automáticamente con tu inventario y te mostrará los productos encontrados.

¿Quieres probar el reconocimiento ahora?`;
    }
  }
  
  memoria.historial.push({ tipo: 'bot', texto: respuesta });
  return {
    exito: true,
    mensaje: respuesta,
    datos: { tipo: 'conversacion' }
  };
};

// Función inteligente para procesar consultas de programación
const procesarConsultaProgramacion = (mensajeOriginal, mensajeLower, memoria) => {
  let respuesta = "";
  
  // Primero intentar buscar conocimiento específico
  const conocimiento = buscarConocimiento(mensajeOriginal);
  
  if (conocimiento) {
    respuesta = conocimiento;
  } else {
    // Análisis más profundo del mensaje
    const palabras = mensajeLower.split(/\s+/);
    
    // Detectar intención
    const esPregunta = mensajeLower.includes('?') || 
                      mensajeLower.includes('qué') || 
                      mensajeLower.includes('que es') ||
                      mensajeLower.includes('como') ||
                      mensajeLower.includes('cómo') ||
                      mensajeLower.includes('explica') ||
                      mensajeLower.includes('explicame');
    
    const esProblema = mensajeLower.includes('error') ||
                       mensajeLower.includes('bug') ||
                       mensajeLower.includes('no funciona') ||
                       mensajeLower.includes('problema') ||
                       mensajeLower.includes('solucionar') ||
                       mensajeLower.includes('arreglar');
    
    const esEjemplo = mensajeLower.includes('ejemplo') ||
                     mensajeLower.includes('muestra') ||
                     mensajeLower.includes('dame un');
    
    // Respuesta contextual inteligente
    if (esProblema) {
      respuesta = `Veo que tienes un problema. Te puedo ayudar con:

🔍 **Debugging**: 
- Errores comunes y sus soluciones
- Herramientas de debugging
- Cómo leer stack traces

💡 **Soluciones comunes**:
- "Cannot read property of undefined" → Usa optional chaining (?.)
- Problemas con async/await → Verifica que la función sea async
- Memory leaks en React → Asegúrate de limpiar en useEffect
- Errores de CORS → Configura CORS en el servidor

¿Puedes compartir el error específico o el código que te está dando problemas? Así te puedo ayudar mejor.`;
      
    } else if (esEjemplo) {
      respuesta = `¡Claro! Puedo darte ejemplos de:

📚 **React**: useState, useEffect, useContext, custom hooks
💻 **JavaScript**: async/await, Promises, arrays, objetos, clases
🖥️ **Node.js**: Express, middlewares, routers
🗄️ **SQL**: Queries, JOINs, transacciones
🔐 **Seguridad**: JWT, bcrypt, CORS
📡 **WebSockets**: Socket.IO
🎨 **CSS**: Flexbox, Grid, responsive
🧪 **Testing**: Jest, React Testing Library

¿Sobre qué tema específico quieres un ejemplo? Por ejemplo:
- "Ejemplo de useState"
- "Ejemplo de async/await"
- "Ejemplo de middleware en Express"`;
      
    } else if (esPregunta) {
      respuesta = `Puedo ayudarte con muchas cosas de programación:

📚 **React**: Hooks (useState, useEffect, useContext, useCallback, useMemo, useRef), componentes, performance, custom hooks
💻 **JavaScript**: async/await, Promises, closures, this, destructuring, spread operator, arrays, objetos, clases
🖥️ **Node.js**: Express, middlewares, routers, async handlers
🗄️ **Bases de datos**: SQL, JOINs, índices, transacciones
🔐 **Seguridad**: JWT, bcrypt, CORS, XSS, SQL Injection
📡 **WebSockets**: Socket.IO, comunicación en tiempo real
🎨 **CSS/HTML**: Flexbox, Grid, responsive design
🧪 **Testing**: Jest, React Testing Library
⚡ **Performance**: Debounce, throttle, lazy loading
🏗️ **Patrones**: Singleton, Factory, Observer
🐛 **Debugging**: Herramientas, errores comunes, soluciones
✨ **Mejores prácticas**: Código limpio, Git, arquitectura

¿Sobre qué tema específico quieres que te explique?`;
      
    } else {
      // Respuesta general inteligente
      respuesta = `¡Hola! 👋 Soy IXORA IA y puedo ayudarte con programación. Conozco sobre:

📚 **React**: useState, useEffect, useContext, useCallback, useMemo, useRef, custom hooks, performance
💻 **JavaScript**: async/await, Promises, closures, this, destructuring, spread, arrays, objetos, clases
🖥️ **Node.js**: Express, middlewares, routers, async handlers
🗄️ **Bases de datos**: SQL, JOINs, índices, transacciones, ORMs
🔐 **Seguridad**: JWT, bcrypt, CORS, XSS, SQL Injection
📡 **WebSockets**: Socket.IO, comunicación en tiempo real
🎨 **CSS/HTML**: Flexbox, Grid, responsive design
🧪 **Testing**: Jest, React Testing Library, TDD
⚡ **Performance**: Debounce, throttle, lazy loading, code splitting
🏗️ **Patrones de diseño**: Singleton, Factory, Observer, MVC
🐛 **Debugging**: Herramientas, errores comunes, soluciones
✨ **Mejores prácticas**: Código limpio, Git, arquitectura, DRY, SOLID
📦 **DevOps**: Docker, CI/CD, deployment

Puedo:
- Explicar conceptos con ejemplos
- Ayudar a resolver errores
- Mostrar mejores prácticas
- Dar ejemplos de código
- Responder preguntas técnicas

¿Sobre qué te gustaría que te ayude? Por ejemplo:
- "Explícame useState"
- "Cómo usar async/await"
- "Ejemplo de middleware en Express"
- "Mejores prácticas de programación"
- "Cómo debuggear este error: [tu error]"`;
    }
  }
  
  memoria.historial.push({ tipo: 'bot', texto: respuesta });
  return {
    exito: true,
    mensaje: respuesta,
    datos: { tipo: 'programacion' }
  };
};

// Función para extraer información del comando de reporte
const extraerInfoReporte = (mensaje) => {
  const mensajeLower = mensaje.toLowerCase();
  
  // Detectar pestaña
  let pestaña = null;
  const pestañasMap = {
    "picking": "picking",
    "devoluciones": "devoluciones",
    "reenvios": "reenvios",
    "reenvíos": "reenvios",
    "inventario": "inventario",
    "clientes": "clientes",
    "calidad": "calidad",
    "reacondicionados": "reacondicionados",
    "retail": "retail",
    "cubbo": "cubbo",
    "regulatorio": "regulatorio"
  };
  
  for (const [key, value] of Object.entries(pestañasMap)) {
    if (mensajeLower.includes(key)) {
      pestaña = value;
      break;
    }
  }
  
  // Detectar tipo de reporte (día, mes, quincenal)
  let tipo = "dia"; // por defecto
  if (mensajeLower.includes("mensual") || mensajeLower.includes("mes")) {
    tipo = "mes";
  } else if (mensajeLower.includes("quincenal") || mensajeLower.includes("quincena")) {
    tipo = "quincenal";
  } else if (mensajeLower.includes("dia") || mensajeLower.includes("día") || mensajeLower.includes("hoy")) {
    tipo = "dia";
  }
  
  // Detectar fecha
  let fecha = null;
  const hoy = dayjs().format('YYYY-MM-DD');
  const ayer = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
  
  if (mensajeLower.includes("hoy")) {
    fecha = hoy;
  } else if (mensajeLower.includes("ayer")) {
    fecha = ayer;
  } else {
    // Intentar extraer fecha del formato DD/MM/YYYY o YYYY-MM-DD
    const fechaMatch = mensaje.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
    if (fechaMatch) {
      const fechaStr = fechaMatch[1];
      if (fechaStr.includes('/')) {
        const [d, m, y] = fechaStr.split('/');
        fecha = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      } else {
        fecha = fechaStr;
      }
    }
  }
  
  // Detectar mes
  let mes = null;
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", 
                "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  for (let i = 0; i < meses.length; i++) {
    if (mensajeLower.includes(meses[i])) {
      const añoActual = dayjs().year();
      mes = `${añoActual}-${String(i + 1).padStart(2, '0')}`;
      break;
    }
  }
  
  // Detectar formato solicitado (excel, pdf, texto)
  let formato = "excel"; // por defecto
  if (mensajeLower.includes("pdf")) {
    formato = "pdf";
  } else if (mensajeLower.includes("texto") || mensajeLower.includes("txt")) {
    formato = "texto";
  } else if (mensajeLower.includes("excel") || mensajeLower.includes("xlsx")) {
    formato = "excel";
  }
  
  // Detectar si solicita reporte profesional/detallado
  const esProfesional = mensajeLower.includes("profesional") || 
                        mensajeLower.includes("detallado") || 
                        mensajeLower.includes("completo") ||
                        mensajeLower.includes("métricas") ||
                        mensajeLower.includes("metricas") ||
                        mensajeLower.includes("tiempos") ||
                        mensajeLower.includes("estadísticas") ||
                        mensajeLower.includes("estadisticas") ||
                        mensajeLower.includes("preciso");
  
  return { pestaña, tipo, fecha, mes, formato, esProfesional };
};

// Función para procesar mensaje
const procesarMensaje = (mensaje, usuarioId) => {
  const mensajeLower = mensaje.toLowerCase().trim();
  const mensajeOriginal = mensaje.trim();
  
  // Inicializar memoria si no existe
  if (!memoriaConversaciones[usuarioId]) {
    memoriaConversaciones[usuarioId] = {
      historial: [],
      contadorMensajes: 0
    };
  }
  
  const memoria = memoriaConversaciones[usuarioId];
  memoria.historial.push({ tipo: 'user', texto: mensajeOriginal });
  memoria.contadorMensajes++;
  
  // Detectar saludos
  if (esSaludo(mensajeLower) && mensajeLower.split(/\s+/).length <= 3) {
    const saludo = saludos[Math.floor(Math.random() * saludos.length)];
    memoria.historial.push({ tipo: 'bot', texto: saludo });
    return {
      exito: true,
      mensaje: saludo,
      datos: { tipo: 'conversacion' }
    };
  }
  
  // Detectar despedidas
  if (esDespedida(mensajeLower)) {
    const despedida = despedidas[Math.floor(Math.random() * despedidas.length)];
    memoria.historial.push({ tipo: 'bot', texto: despedida });
    return {
      exito: true,
      mensaje: despedida,
      datos: { tipo: 'conversacion' }
    };
  }
  
  // Detectar comandos de imagen
  if (esComandoImagen(mensajeLower)) {
    // Por ahora, respuesta simple (después se puede integrar generación de imágenes)
    const respuesta = "Por ahora no puedo generar imágenes, pero estoy trabajando en esa funcionalidad. 😊";
    memoria.historial.push({ tipo: 'bot', texto: respuesta });
    return {
      exito: true,
      mensaje: respuesta,
      datos: { tipo: 'conversacion' }
    };
  }
  
  // Detectar comandos de productos
  if (esComandoProducto(mensajeLower)) {
    // Consultar productos del inventario
    try {
      const productos = dbDia.prepare(`
        SELECT codigo, nombre, cajas, piezas 
        FROM productos 
        WHERE disponible = 1 
        LIMIT 10
      `).all();
      
      if (productos.length > 0) {
        const lista = productos.map(p => `- ${p.codigo}: ${p.nombre} (${p.cajas} cajas, ${p.piezas} piezas)`).join('\n');
        const respuesta = `Aquí tienes algunos productos del inventario:\n\n${lista}`;
        memoria.historial.push({ tipo: 'bot', texto: respuesta });
        return {
          exito: true,
          mensaje: respuesta,
          datos: { tipo: 'productos', productos }
        };
      } else {
        const respuesta = "No encontré productos activos en el inventario en este momento.";
        memoria.historial.push({ tipo: 'bot', texto: respuesta });
        return {
          exito: true,
          mensaje: respuesta,
          datos: { tipo: 'conversacion' }
        };
      }
    } catch (err) {
      console.error('Error consultando productos:', err);
      const respuesta = "Lo siento, hubo un error al consultar los productos.";
      memoria.historial.push({ tipo: 'bot', texto: respuesta });
      return {
        exito: false,
        mensaje: respuesta,
        datos: null
      };
    }
  }
  
  // Detectar comandos de generación de reportes
  if (esComandoReporte(mensajeLower)) {
    const infoReporte = extraerInfoReporte(mensajeOriginal);
    
    if (!infoReporte.pestaña) {
      const respuesta = "¿De qué pestaña quieres el reporte? Puedo generar reportes de: Picking, Devoluciones, Reenvíos o Inventario.";
      memoria.historial.push({ tipo: 'bot', texto: respuesta });
      return {
        exito: true,
        mensaje: respuesta,
        datos: { tipo: 'conversacion' }
      };
    }
    
    // Generar URL del reporte según la pestaña y tipo
    let urlReporte = null;
    const baseUrl = process.env.SERVER_URL || 'http://localhost:3001';
    
    try {
      if (infoReporte.pestaña === 'picking') {
        if (infoReporte.tipo === 'dia' && infoReporte.fecha) {
          urlReporte = `${baseUrl}/reportes/exportar-dia/${infoReporte.fecha}`;
        } else if (infoReporte.tipo === 'mes' && infoReporte.mes) {
          urlReporte = `${baseUrl}/reportes/exportar-mes/${infoReporte.mes}`;
        } else if (infoReporte.tipo === 'quincenal' && infoReporte.mes) {
          urlReporte = `${baseUrl}/reportes/quincenal?mes=${infoReporte.mes}`;
        } else {
          // Por defecto, reporte del día de hoy
          const hoy = dayjs().format('YYYY-MM-DD');
          urlReporte = `${baseUrl}/reportes/exportar-dia/${hoy}`;
        }
      } else if (infoReporte.pestaña === 'devoluciones' || ['clientes', 'calidad', 'reacondicionados', 'retail', 'cubbo', 'regulatorio'].includes(infoReporte.pestaña)) {
        const tipoDevolucion = infoReporte.pestaña === 'devoluciones' ? 'clientes' : infoReporte.pestaña;
        if (infoReporte.tipo === 'dia' && infoReporte.fecha) {
          urlReporte = `${baseUrl}/reportes-devoluciones/${tipoDevolucion}/${infoReporte.fecha}/export`;
        } else {
          // Por defecto, reporte del día de hoy
          const hoy = dayjs().format('YYYY-MM-DD');
          urlReporte = `${baseUrl}/reportes-devoluciones/${tipoDevolucion}/${hoy}/export`;
        }
      } else if (infoReporte.pestaña === 'reenvios') {
        if (infoReporte.tipo === 'dia' && infoReporte.fecha) {
          urlReporte = `${baseUrl}/reenvios/exportar/${infoReporte.fecha}`;
        } else {
          const hoy = dayjs().format('YYYY-MM-DD');
          urlReporte = `${baseUrl}/reenvios/exportar/${hoy}`;
        }
      }
      
      // Si es reporte profesional, usar el nuevo endpoint
      if (infoReporte.esProfesional) {
        const respuesta = `¡Perfecto! ✨ Estoy generando un reporte profesional y detallado de ${infoReporte.pestaña}${infoReporte.fecha ? ` del ${infoReporte.fecha}` : infoReporte.mes ? ` del mes ${infoReporte.mes}` : ' de hoy'} en formato ${infoReporte.formato || 'excel'}. Incluirá métricas, tiempos, cantidades y estadísticas completas.`;
        memoria.historial.push({ tipo: 'bot', texto: respuesta });
        return {
          exito: true,
          mensaje: respuesta,
          datos: { 
            tipo: 'reporte_profesional',
            pestaña: infoReporte.pestaña,
            fecha: infoReporte.fecha || null,
            mes: infoReporte.mes || null,
            tipo_periodo: infoReporte.tipo,
            formato: infoReporte.formato || 'excel',
            endpoint: '/api/ixora-ia/generar-reporte-profesional'
          }
        };
      }
      
      if (urlReporte) {
        const respuesta = `¡Perfecto! ✨ Estoy generando el reporte de ${infoReporte.pestaña}${infoReporte.fecha ? ` del ${infoReporte.fecha}` : infoReporte.mes ? ` del mes ${infoReporte.mes}` : ' de hoy'}${infoReporte.formato && infoReporte.formato !== 'excel' ? ` en formato ${infoReporte.formato}` : ''}. Se descargará automáticamente.`;
        memoria.historial.push({ tipo: 'bot', texto: respuesta });
        return {
          exito: true,
          mensaje: respuesta,
          datos: { 
            tipo: 'reporte',
            url: urlReporte,
            pestaña: infoReporte.pestaña,
            fecha: infoReporte.fecha || infoReporte.mes || dayjs().format('YYYY-MM-DD'),
            formato: infoReporte.formato || 'excel'
          }
        };
      } else {
        const respuesta = "Lo siento, no pude determinar qué reporte generar. Por favor, especifica la fecha o el mes. Por ejemplo: 'genera reporte de picking de hoy' o 'genera reporte de devoluciones del 2024-01-15'.";
        memoria.historial.push({ tipo: 'bot', texto: respuesta });
        return {
          exito: true,
          mensaje: respuesta,
          datos: { tipo: 'conversacion' }
        };
      }
    } catch (err) {
      console.error('Error generando reporte:', err);
      const respuesta = "Lo siento, hubo un error al generar el reporte. Por favor intenta de nuevo.";
      memoria.historial.push({ tipo: 'bot', texto: respuesta });
      return {
        exito: false,
        mensaje: respuesta,
        datos: null
      };
    }
  }
  
  // Detectar consultas de programación (PRIORIDAD ALTA)
  if (esConsultaProgramacion(mensajeLower)) {
    return procesarConsultaProgramacion(mensajeOriginal, mensajeLower, memoria);
  }
  
  if (esConsultaReconocimiento(mensajeLower)) {
    return procesarConsultaReconocimiento(mensajeOriginal, mensajeLower, memoria);
  }
  
  // Detectar consultas de información
  if (esConsultaInformacion(mensajeLower)) {
    const respuesta = "Puedo ayudarte con información sobre productos, inventario y reportes. ¿Qué necesitas específicamente?";
    memoria.historial.push({ tipo: 'bot', texto: respuesta });
    return {
      exito: true,
      mensaje: respuesta,
      datos: { tipo: 'conversacion' }
    };
  }
  
  // Respuesta conversacional general
  const respuestasGenerales = [
    "Entiendo. ¿En qué más puedo ayudarte? 😊",
    "Claro, estoy aquí para lo que necesites. ¿Hay algo específico en lo que pueda asistirte?",
    "Perfecto. Si necesitas ayuda con productos, inventario o reportes, solo dímelo. ✨",
    "De acuerdo. ¿Qué te gustaría hacer? Puedo ayudarte con información del sistema."
  ];
  
  const respuesta = respuestasGenerales[Math.floor(Math.random() * respuestasGenerales.length)];
  memoria.historial.push({ tipo: 'bot', texto: respuesta });
  
  return {
    exito: true,
    mensaje: respuesta,
    datos: { tipo: 'conversacion' }
  };
};

// POST /api/ixora-ia/chat - Chat inteligente
router.post('/chat', authRequired, requierePermiso('tab:ixora_ia'), (req, res) => {
  console.log('📨 IXORA IA: Mensaje recibido:', req.body?.comando?.substring(0, 50));
  try {
    const { comando, contexto } = req.body;
    // Usar el ID del usuario autenticado
    const usuarioId = req.user?.id?.toString() || req.user?.username || 'default';
    
    if (!comando || !comando.trim()) {
      return res.status(400).json({
        exito: false,
        mensaje: 'Por favor, escribe un mensaje.',
        datos: null
      });
    }
    
    const resultado = procesarMensaje(comando, usuarioId);
    res.json(resultado);
  } catch (err) {
    console.error('Error procesando mensaje de IXORA IA:', err);
    res.status(500).json({
      exito: false,
      mensaje: 'Lo siento, hubo un error al procesar tu mensaje.',
      datos: null
    });
  }
});

// GET /api/ixora-ia/historial - Obtener historial de conversación
router.get('/historial', authRequired, requierePermiso('tab:ixora_ia'), (req, res) => {
  try {
    const usuarioId = req.user?.id?.toString() || req.user?.username || 'default';
    const memoria = memoriaConversaciones[usuarioId] || { historial: [] };
    res.json({ historial: memoria.historial });
  } catch (err) {
    console.error('Error obteniendo historial:', err);
    res.status(500).json({ historial: [] });
  }
});

// DELETE /api/ixora-ia/historial - Limpiar historial
router.delete('/historial', authRequired, requierePermiso('tab:ixora_ia'), (req, res) => {
  try {
    const usuarioId = req.user?.id?.toString() || req.user?.username || 'default';
    if (memoriaConversaciones[usuarioId]) {
      memoriaConversaciones[usuarioId].historial = [];
      memoriaConversaciones[usuarioId].contadorMensajes = 0;
    }
    res.json({ exito: true, mensaje: 'Historial limpiado' });
  } catch (err) {
    console.error('Error limpiando historial:', err);
    res.status(500).json({ exito: false, mensaje: 'Error al limpiar historial' });
  }
});

// POST /api/ixora-ia/generar-reporte-profesional - Generar reporte profesional con métricas
router.post('/generar-reporte-profesional', authRequired, requierePermiso('tab:ixora_ia'), async (req, res) => {
  try {
    const { pestaña, fecha, mes, tipo_periodo, formato } = req.body;
    
    if (!pestaña) {
      return res.status(400).json({ exito: false, mensaje: 'Falta especificar la pestaña del reporte' });
    }
    
    const formatoFinal = formato || 'excel';
    
    // Generar reporte según la pestaña
    if (pestaña === 'picking') {
      const fechaReporte = fecha || (mes ? null : dayjs().format('YYYY-MM-DD'));
      const periodo = tipo_periodo || 'dia';
      
      // Obtener datos del reporte
      let query, params;
      if (periodo === 'dia' && fechaReporte) {
        query = `
          SELECT
            h.codigo,
            h.nombre,
            COALESCE(r.presentacion, '') AS presentacion,
            h.lote,
            h.cajas,
            COALESCE(h.piezas_por_caja, h.piezas, 0) AS piezas_por_caja,
            h.extras,
            (COALESCE(h.cajas,0) * COALESCE(h.piezas_por_caja, h.piezas, 0) + COALESCE(h.extras,0)) AS total,
            h.observaciones,
            h.hora_solicitud,
            h.hora_surtido,
            COALESCE(r.categoria, '') AS categoria,
            COALESCE(h.origen, 'normal') AS origen,
            CASE 
              WHEN h.hora_solicitud IS NOT NULL AND h.hora_surtido IS NOT NULL 
              THEN (julianday(h.hora_surtido) - julianday(h.hora_solicitud)) * 24 * 60
              ELSE NULL
            END AS tiempo_minutos
          FROM productos_historico h
          LEFT JOIN productos_ref r ON r.codigo = h.codigo
          WHERE h.fecha = ? AND h.surtido = 1
          ORDER BY h.id ASC
        `;
        params = [fechaReporte];
      } else if (periodo === 'mes' && mes) {
        query = `
          SELECT
            h.fecha,
            h.codigo,
            h.nombre,
            COALESCE(r.presentacion, '') AS presentacion,
            h.lote,
            h.cajas,
            COALESCE(h.piezas_por_caja, h.piezas, 0) AS piezas_por_caja,
            h.extras,
            (COALESCE(h.cajas,0) * COALESCE(h.piezas_por_caja, h.piezas, 0) + COALESCE(h.extras,0)) AS total,
            h.observaciones,
            h.hora_solicitud,
            h.hora_surtido,
            COALESCE(r.categoria, '') AS categoria,
            COALESCE(h.origen, 'normal') AS origen,
            CASE 
              WHEN h.hora_solicitud IS NOT NULL AND h.hora_surtido IS NOT NULL 
              THEN (julianday(h.hora_surtido) - julianday(h.hora_solicitud)) * 24 * 60
              ELSE NULL
            END AS tiempo_minutos
          FROM productos_historico h
          LEFT JOIN productos_ref r ON r.codigo = h.codigo
          WHERE strftime('%Y-%m', h.fecha) = ? AND h.surtido = 1
          ORDER BY h.fecha ASC, h.id ASC
        `;
        params = [mes];
      } else {
        return res.status(400).json({ exito: false, mensaje: 'Falta especificar fecha o mes' });
      }
      
      const rows = dbHist.prepare(query).all(...params);
      
      if (rows.length === 0) {
        return res.status(404).json({ exito: false, mensaje: 'No hay datos para el período especificado' });
      }
      
      // Calcular métricas
      const totalProductos = rows.length;
      const totalCajas = rows.reduce((sum, r) => sum + (r.cajas || 0), 0);
      const totalPiezas = rows.reduce((sum, r) => sum + (r.total || 0), 0);
      const tiempos = rows.filter(r => r.tiempo_minutos !== null).map(r => r.tiempo_minutos);
      const tiempoPromedio = tiempos.length > 0 ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : 0;
      const tiempoMin = tiempos.length > 0 ? Math.min(...tiempos) : 0;
      const tiempoMax = tiempos.length > 0 ? Math.max(...tiempos) : 0;
      
      // Generar según formato
      if (formatoFinal === 'excel') {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Reporte Profesional');
        
        // Título
        ws.addRow(['REPORTE PROFESIONAL DE PICKING']);
        ws.addRow([`Período: ${fechaReporte || mes}`]);
        ws.addRow([]);
        
        // Métricas
        ws.addRow(['MÉTRICAS GENERALES']);
        ws.addRow(['Total de productos surtidos', totalProductos]);
        ws.addRow(['Total de cajas', totalCajas]);
        ws.addRow(['Total de piezas', totalPiezas]);
        ws.addRow(['Tiempo promedio (minutos)', tiempoPromedio.toFixed(2)]);
        ws.addRow(['Tiempo mínimo (minutos)', tiempoMin]);
        ws.addRow(['Tiempo máximo (minutos)', tiempoMax]);
        ws.addRow([]);
        
        // Datos detallados
        ws.addRow(['DETALLE DE PRODUCTOS']);
        ws.addRow(['Código', 'Nombre', 'Presentación', 'Lote', 'Cajas', 'Piezas/Caja', 'Extras', 'Total', 'Tiempo (min)', 'Categoría', 'Origen']);
        rows.forEach(row => {
          ws.addRow([
            row.codigo,
            row.nombre,
            row.presentacion,
            row.lote,
            row.cajas,
            row.piezas_por_caja,
            row.extras,
            row.total,
            row.tiempo_minutos ? row.tiempo_minutos.toFixed(2) : 'N/A',
            row.categoria,
            row.origen
          ]);
        });
        
        // Formatear
        ws.getRow(1).font = { bold: true, size: 14 };
        ws.getRow(4).font = { bold: true };
        ws.getRow(12).font = { bold: true };
        
        const nombreArchivo = `Reporte_Profesional_Picking_${fechaReporte || mes}.xlsx`;
        res.setHeader('Content-Disposition', `attachment; filename=${nombreArchivo}`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        await wb.xlsx.write(res);
        res.end();
      } else if (formatoFinal === 'texto') {
        let texto = `REPORTE PROFESIONAL DE PICKING\n`;
        texto += `Período: ${fechaReporte || mes}\n`;
        texto += `Fecha de generación: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}\n\n`;
        texto += `MÉTRICAS GENERALES\n`;
        texto += `Total de productos surtidos: ${totalProductos}\n`;
        texto += `Total de cajas: ${totalCajas}\n`;
        texto += `Total de piezas: ${totalPiezas}\n`;
        texto += `Tiempo promedio (minutos): ${tiempoPromedio.toFixed(2)}\n`;
        texto += `Tiempo mínimo (minutos): ${tiempoMin}\n`;
        texto += `Tiempo máximo (minutos): ${tiempoMax}\n\n`;
        texto += `DETALLE DE PRODUCTOS\n`;
        texto += `Código\tNombre\tPresentación\tLote\tCajas\tPiezas/Caja\tExtras\tTotal\tTiempo (min)\tCategoría\tOrigen\n`;
        rows.forEach(row => {
          texto += `${row.codigo}\t${row.nombre}\t${row.presentacion}\t${row.lote}\t${row.cajas}\t${row.piezas_por_caja}\t${row.extras}\t${row.total}\t${row.tiempo_minutos ? row.tiempo_minutos.toFixed(2) : 'N/A'}\t${row.categoria}\t${row.origen}\n`;
        });
        
        const nombreArchivo = `Reporte_Profesional_Picking_${fechaReporte || mes}.txt`;
        res.setHeader('Content-Disposition', `attachment; filename=${nombreArchivo}`);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(texto);
      } else {
        return res.status(400).json({ exito: false, mensaje: 'Formato no soportado. Use: excel, texto' });
      }
    } else {
      return res.status(400).json({ exito: false, mensaje: `Generación de reportes profesionales para ${pestaña} aún no está implementada` });
    }
  } catch (err) {
    console.error('Error generando reporte profesional:', err);
    res.status(500).json({ exito: false, mensaje: 'Error al generar el reporte profesional' });
  }
});

// ============================================
// ENDPOINTS DE VOZ PERSONALIZADA
// ============================================

// POST /api/ixora-ia/voice/upload - Subir audio y crear voz personalizada
router.post('/voice/upload', authRequired, requierePermiso('tab:ixora_ia'), upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ exito: false, mensaje: 'No se recibió archivo de audio' });
    }

    const userId = req.user.id;
    const { voiceName } = req.body;
    const nombreVoz = voiceName || `Voz de ${req.user.name || 'Usuario'}`;

    // Verificar que ElevenLabs API Key esté configurada
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    if (!ELEVENLABS_API_KEY) {
      // Limpiar archivo subido
      fs.unlinkSync(req.file.path);
      return res.status(500).json({ 
        exito: false, 
        mensaje: 'ElevenLabs API Key no configurada. Configure ELEVENLABS_API_KEY en las variables de entorno.' 
      });
    }

    try {
      // Crear FormData para enviar a ElevenLabs
      const formData = new FormData();
      formData.append('name', nombreVoz);
      formData.append('files', fs.createReadStream(req.file.path), {
        filename: req.file.originalname || path.basename(req.file.path),
        contentType: req.file.mimetype || 'audio/webm'
      });

      // Llamar a ElevenLabs API para crear voz personalizada
      const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          ...formData.getHeaders() // Incluir headers de FormData (boundary, Content-Type, etc.)
        },
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        // Limpiar archivo subido
        fs.unlinkSync(req.file.path);
        return res.status(response.status).json({ 
          exito: false, 
          mensaje: `Error de ElevenLabs: ${data.detail?.message || data.message || 'Error desconocido'}` 
        });
      }

      const voiceId = data.voice_id;

      // Guardar configuración en la base de datos
      const insertOrUpdate = dbUsers.prepare(`
        INSERT INTO user_voice_config (user_id, elevenlabs_voice_id, voice_name, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
          elevenlabs_voice_id = excluded.elevenlabs_voice_id,
          voice_name = excluded.voice_name,
          updated_at = datetime('now')
      `);
      insertOrUpdate.run(userId, voiceId, nombreVoz);

      // Limpiar archivo subido
      fs.unlinkSync(req.file.path);

      res.json({
        exito: true,
        mensaje: `Voz personalizada "${nombreVoz}" creada exitosamente`,
        datos: {
          voiceId,
          voiceName: nombreVoz
        }
      });
    } catch (error) {
      // Limpiar archivo subido en caso de error
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      console.error('Error creando voz personalizada:', error);
      res.status(500).json({ 
        exito: false, 
        mensaje: `Error al crear voz personalizada: ${error.message}` 
      });
    }
  } catch (err) {
    console.error('Error en upload de voz:', err);
    res.status(500).json({ exito: false, mensaje: 'Error al procesar archivo de audio' });
  }
});

// GET /api/ixora-ia/voice/config - Obtener configuración de voz del usuario
router.get('/voice/config', authRequired, requierePermiso('tab:ixora_ia'), (req, res) => {
  try {
    const userId = req.user.id;
    
    const config = dbUsers.prepare(`
      SELECT elevenlabs_voice_id, voice_name, created_at, updated_at
      FROM user_voice_config
      WHERE user_id = ?
    `).get(userId);

    if (!config) {
      return res.json({
        exito: true,
        tieneVozPersonalizada: false,
        datos: null
      });
    }

    res.json({
      exito: true,
      tieneVozPersonalizada: true,
      datos: {
        voiceId: config.elevenlabs_voice_id,
        voiceName: config.voice_name,
        createdAt: config.created_at,
        updatedAt: config.updated_at
      }
    });
  } catch (err) {
    console.error('Error obteniendo configuración de voz:', err);
    res.status(500).json({ exito: false, mensaje: 'Error al obtener configuración de voz' });
  }
});

// PUT /api/ixora-ia/voice/config - Actualizar configuración de voz (usar voz predefinida)
router.put('/voice/config', authRequired, requierePermiso('tab:ixora_ia'), (req, res) => {
  try {
    const userId = req.user.id;
    const { voiceId, voiceName } = req.body;

    if (!voiceId) {
      return res.status(400).json({ exito: false, mensaje: 'voiceId es requerido' });
    }

    const insertOrUpdate = dbUsers.prepare(`
      INSERT INTO user_voice_config (user_id, elevenlabs_voice_id, voice_name, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        elevenlabs_voice_id = excluded.elevenlabs_voice_id,
        voice_name = excluded.voice_name,
        updated_at = datetime('now')
    `);
    insertOrUpdate.run(userId, voiceId, voiceName || 'Voz predefinida');

    res.json({
      exito: true,
      mensaje: 'Configuración de voz actualizada',
      datos: { voiceId, voiceName: voiceName || 'Voz predefinida' }
    });
  } catch (err) {
    console.error('Error actualizando configuración de voz:', err);
    res.status(500).json({ exito: false, mensaje: 'Error al actualizar configuración de voz' });
  }
});

// DELETE /api/ixora-ia/voice/config - Eliminar voz personalizada
router.delete('/voice/config', authRequired, requierePermiso('tab:ixora_ia'), async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Obtener voice_id antes de eliminar
    const config = dbUsers.prepare(`
      SELECT elevenlabs_voice_id FROM user_voice_config WHERE user_id = ?
    `).get(userId);

    // Eliminar de la base de datos
    dbUsers.prepare('DELETE FROM user_voice_config WHERE user_id = ?').run(userId);

    // Intentar eliminar de ElevenLabs (opcional, no crítico si falla)
    if (config?.elevenlabs_voice_id && process.env.ELEVENLABS_API_KEY) {
      try {
        await fetch(`https://api.elevenlabs.io/v1/voices/${config.elevenlabs_voice_id}`, {
          method: 'DELETE',
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY
          }
        });
      } catch (error) {
        console.log('No se pudo eliminar voz de ElevenLabs (puede que ya no exista):', error.message);
      }
    }

    res.json({
      exito: true,
      mensaje: 'Voz personalizada eliminada'
    });
  } catch (err) {
    console.error('Error eliminando configuración de voz:', err);
    res.status(500).json({ exito: false, mensaje: 'Error al eliminar configuración de voz' });
  }
});

// POST /api/ixora-ia/voice/text-to-speech - Generar audio con voz personalizada
router.post('/voice/text-to-speech', authRequired, requierePermiso('tab:ixora_ia'), async (req, res) => {
  try {
    const { texto } = req.body;
    const userId = req.user.id;

    if (!texto || !texto.trim()) {
      return res.status(400).json({ exito: false, mensaje: 'Texto es requerido' });
    }

    // Obtener configuración de voz del usuario
    const config = dbUsers.prepare(`
      SELECT elevenlabs_voice_id FROM user_voice_config WHERE user_id = ?
    `).get(userId);

    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({ 
        exito: false, 
        mensaje: 'ElevenLabs API Key no configurada' 
      });
    }

    // Usar voz personalizada si existe, sino usar voz por defecto
    const voiceId = config?.elevenlabs_voice_id || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY
        },
        body: JSON.stringify({
          text: texto,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return res.status(response.status).json({
          exito: false,
          mensaje: `Error de ElevenLabs: ${errorData.detail?.message || errorData.message || 'Error desconocido'}`
        });
      }

      const audioBuffer = await response.arrayBuffer();
      
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', audioBuffer.byteLength);
      res.send(Buffer.from(audioBuffer));
    } catch (error) {
      console.error('Error generando audio:', error);
      res.status(500).json({ 
        exito: false, 
        mensaje: `Error al generar audio: ${error.message}` 
      });
    }
  } catch (err) {
    console.error('Error en text-to-speech:', err);
    res.status(500).json({ exito: false, mensaje: 'Error al procesar solicitud de voz' });
  }
});

// GET /api/ixora-ia/voice/list - Listar voces disponibles de ElevenLabs
router.get('/voice/list', authRequired, requierePermiso('tab:ixora_ia'), async (req, res) => {
  try {
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    if (!ELEVENLABS_API_KEY || ELEVENLABS_API_KEY.trim() === '') {
      // ElevenLabs es opcional, no mostrar warning
      return res.status(500).json({ 
        exito: false, 
        mensaje: 'ElevenLabs API Key no configurada. Por favor, configura ELEVENLABS_API_KEY en las variables de entorno.',
        detalles: 'La API key de ElevenLabs no está configurada en el servidor.'
      });
    }

    console.log('📞 Llamando a ElevenLabs API para listar voces...');
    
    let response;
    try {
      response = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY
        }
      });
    } catch (fetchError) {
      console.error('❌ Error de red al llamar a ElevenLabs:', fetchError);
      return res.status(500).json({
        exito: false,
        mensaje: 'Error de conexión con ElevenLabs API',
        detalles: fetchError.message || 'No se pudo conectar con el servidor de ElevenLabs'
      });
    }

    if (!response.ok) {
      let errorData = {};
      try {
        const errorText = await response.text();
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { message: `HTTP ${response.status}: ${response.statusText}` };
      }
      
      console.error('❌ Error de ElevenLabs API:', response.status, errorData);
      return res.status(response.status >= 400 && response.status < 500 ? response.status : 500).json({
        exito: false,
        mensaje: errorData.detail?.message || errorData.message || `Error al obtener lista de voces (${response.status})`,
        detalles: errorData.detail || errorData
      });
    }

    let data;
    try {
      const responseText = await response.text();
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ Error parseando respuesta de ElevenLabs:', parseError);
      return res.status(500).json({
        exito: false,
        mensaje: 'Error al procesar respuesta de ElevenLabs',
        detalles: 'La respuesta no es un JSON válido'
      });
    }
    
    console.log(`✅ Voces obtenidas: ${data.voices?.length || 0} voces disponibles`);
    
    res.json({
      exito: true,
      datos: data.voices || []
    });
  } catch (err) {
    console.error('❌ Error inesperado listando voces:', err);
    res.status(500).json({ 
      exito: false, 
      mensaje: 'Error al listar voces',
      detalles: err.message || 'Error desconocido',
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// ===============================================================
// ENDPOINTS DE RECONOCIMIENTO DE PRODUCTOS
// ===============================================================

// POST /api/ixora-ia/reconocer-producto - Reconocer productos en imagen
router.post('/reconocer-producto', authRequired, requierePermiso('tab:ixora_ia'), async (req, res) => {
  try {
    const { imageBase64, modo, pregunta, contexto } = req.body;
    
    if (!imageBase64) {
      return res.status(400).json({
        exito: false,
        mensaje: 'Falta la imagen en base64'
      });
    }

    console.log('📸 Reconocimiento solicitado...', { modo, contexto, tienePregunta: !!pregunta });

    let resultado;
    
    // Si hay una pregunta o contexto, usar reconocimiento inteligente
    if (pregunta || contexto) {
      resultado = await reconocerSegunContexto(imageBase64, pregunta || '');
    } else if (modo === 'simple') {
      // Modo simple: reconocer un solo producto
      resultado = await reconocerProductoSimple(imageBase64);
    } else if (contexto === 'general' || modo === 'general') {
      // Modo general: analizar cualquier cosa
      resultado = await analizarImagenGeneral(imageBase64, contexto || 'general');
    } else {
      // Modo completo: reconocer múltiples productos (por defecto)
      resultado = await reconocerProductosEnImagen(imageBase64);
    }

    res.json({
      exito: true,
      ...resultado
    });
  } catch (err) {
    console.error('❌ Error reconociendo:', err);
    res.status(500).json({
      exito: false,
      mensaje: `Error al reconocer: ${err.message}`,
      error: err.message
    });
  }
});

// POST /api/ixora-ia/reconocer-productos - Reconocer múltiples productos (alias)
router.post('/reconocer-productos', authRequired, requierePermiso('tab:ixora_ia'), async (req, res) => {
  try {
    const { imageBase64, pregunta, contexto } = req.body;
    
    if (!imageBase64) {
      return res.status(400).json({
        exito: false,
        mensaje: 'Falta la imagen en base64'
      });
    }

    // Si hay pregunta o contexto, usar reconocimiento inteligente
    let resultado;
    if (pregunta || contexto) {
      resultado = await reconocerSegunContexto(imageBase64, pregunta || '');
    } else {
      resultado = await reconocerProductosEnImagen(imageBase64);
    }

    res.json({
      exito: true,
      ...resultado
    });
  } catch (err) {
    console.error('❌ Error reconociendo productos:', err);
    res.status(500).json({
      exito: false,
      mensaje: `Error al reconocer productos: ${err.message}`,
      error: err.message
    });
  }
});

// POST /api/ixora-ia/analizar-imagen - Analizar cualquier imagen según contexto
router.post('/analizar-imagen', authRequired, requierePermiso('tab:ixora_ia'), async (req, res) => {
  try {
    const { imageBase64, pregunta, contexto } = req.body;
    
    if (!imageBase64) {
      return res.status(400).json({
        exito: false,
        mensaje: 'Falta la imagen en base64'
      });
    }

    console.log('📸 Análisis de imagen solicitado...', { contexto, pregunta });

    let resultado;
    
    if (pregunta) {
      // Reconocimiento inteligente basado en la pregunta
      resultado = await reconocerSegunContexto(imageBase64, pregunta);
    } else if (contexto) {
      // Análisis según contexto específico
      resultado = await analizarImagenGeneral(imageBase64, contexto);
    } else {
      // Análisis general
      resultado = await analizarImagenGeneral(imageBase64, 'general');
    }

    res.json({
      exito: true,
      ...resultado
    });
  } catch (err) {
    console.error('❌ Error analizando imagen:', err);
    res.status(500).json({
      exito: false,
      mensaje: `Error al analizar imagen: ${err.message}`,
      error: err.message
    });
  }
});

export default router;
