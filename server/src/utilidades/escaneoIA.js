// ===============================================================
//  📄 scanIA.js — versión GEMINI 2.0 FLASH (flex + fuzzy search)
// ===============================================================

import { GoogleGenerativeAI } from "@google/generative-ai";
import { dbInv } from "../config/baseDeDatos.js";

// ===============================================================
// Inicializar Gemini (opcional - solo si hay API key)
// ===============================================================
let genAI = null;
let model = null;

/**
 * Reinicializa Gemini con la API key actual de las variables de entorno
 * Útil cuando se cambia la API key sin reiniciar el servidor
 */
export function reinicializarGemini() {
  try {
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== "") {
      genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      console.log("✅ Gemini API reinicializada correctamente");
      return true;
    } else {
      console.log("⚠️ GEMINI_API_KEY no configurada - Escaneo con IA deshabilitado");
      genAI = null;
      model = null;
      return false;
    }
  } catch (error) {
    console.error("❌ Error reinicializando Gemini:", error);
    genAI = null;
    model = null;
    return false;
  }
}

// Inicializar al cargar el módulo
try {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== "") {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    // Gemini API configurada
  } else {
    console.log("⚠️ GEMINI_API_KEY no configurada - Escaneo con IA deshabilitado");
  }
} catch (error) {
  console.error("❌ Error inicializando Gemini:", error);
  genAI = null;
  model = null;
}

// ===============================================================
// Normalizar presentación / texto
// ===============================================================
function normalizarTexto(texto = "") {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar acentos
    .replace(/caps?\b/g, "capsulas")
    .replace(/cap\b/g, "capsulas")
    .replace(/mg\b/g, "mg")
    .replace(/[^a-z0-9\s]/g, " ") // quitar caracteres raros
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarPresentacion(texto = "") {
  return normalizarTexto(texto);
}

// ===============================================================
// BÚSQUEDA FLEXIBLE EN INVENTARIO
//  - Busca por nombre completo
//  - Si no encuentra, busca por palabras sueltas (>= 3 letras)
//  - Elige la mejor coincidencia por # de palabras y longitud
// ===============================================================
function buscarCoincidenciaFlexible(nombreOriginal = "") {
  const nombre = normalizarTexto(nombreOriginal);
  if (!nombre) return null;

  // Traer todo el inventario
  const productos = dbInv
    .prepare(`SELECT codigo, nombre FROM productos_ref`)
    .all();

  if (!productos || productos.length === 0) return null;

  const palabras = nombre.split(" ").filter((p) => p.length > 2);

  const candidatos = productos.map((prod) => {
    const norm = normalizarTexto(prod.nombre || "");
    let coincidencias = 0;

    for (const w of palabras) {
      if (norm.includes(w)) coincidencias++;
    }

    const incluyeCompleto =
      norm.includes(nombre) || nombre.includes(norm);

    return {
      prod,
      norm,
      coincidencias,
      incluyeCompleto,
      len: norm.length,
    };
  });

  // 1) primero, los que incluyen el nombre completo
  let mejores = candidatos.filter((c) => c.incluyeCompleto);
  if (mejores.length > 0) {
    mejores.sort((a, b) => a.len - b.len);
    return mejores[0].prod;
  }

  // 2) luego, por # de palabras que coinciden
  mejores = candidatos.filter((c) => c.coincidencias > 0);
  if (mejores.length === 0) return null;

  mejores.sort((a, b) => {
    if (b.coincidencias !== a.coincidencias) {
      return b.coincidencias - a.coincidencias;
    }
    return a.len - b.len;
  });

  return mejores[0].prod;
}

// ===============================================================
// Procesar documento con IA (imagen)
// ===============================================================
export async function procesarDocumentoIA(base64Image) {
  try {
    // Verificar si Gemini está disponible
    if (!model || !genAI) {
      throw new Error("Escaneo con IA no disponible: GEMINI_API_KEY no configurada o tokens agotados. Puedes usar el escaneo manual.");
    }

    console.log("📸 Procesando imagen GEMINI… tamaño:", base64Image.length);

    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");

    const prompt = `
Analiza la imagen como si fuera un documento escaneado de DEVOLUCIONES.

Detecta filas de productos con esta estructura:
- PRODUCTO (texto principal)
- PRESENTACION (ej: 120 caps, 60 tabs, 200 mg)
- LOTE o LOT (si aparece)
- CANTIDAD (última columna o número aislado)

Devuelve ÚNICAMENTE un JSON válido en este formato:

[
  {
    "producto": "",
    "presentacion": "",
    "lote": "",
    "cantidad": ""
  }
]

NO escribas explicación.
NO escribas texto adicional.
NO pongas markdown.
Solo JSON.
    `;

    let result;
    try {
      result = await model.generateContent([
        { text: prompt },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: cleanBase64,
          },
        },
      ]);
    } catch (apiError) {
      // Log detallado del error para diagnóstico
      console.error("❌ Error detallado de Gemini API:", {
        status: apiError.status,
        statusText: apiError.statusText,
        message: apiError.message,
        error: apiError.error,
        code: apiError.code
      });

      // Distinguir entre diferentes tipos de errores
      if (apiError.status === 401 || apiError.status === 403) {
        // API key inválida o sin permisos
        const errorMsg = apiError.message || "API key inválida o sin permisos";
        console.error("❌ Error: API key de Gemini inválida o sin permisos");
        throw new Error(`API key de Gemini inválida o sin permisos. Verifica que la API key sea correcta y tenga los permisos necesarios. Error: ${errorMsg}. Si acabas de cambiar la API key, reinicia el servidor para que cargue la nueva clave.`);
      } else if (apiError.status === 429 || apiError.message?.includes("quota") || apiError.message?.includes("RESOURCE_EXHAUSTED")) {
        // Cuota excedida - analizar el tipo de cuota
        let tiempoEspera = null;
        let esCuotaDiaria = false;
        let esCuotaPorMinuto = false;
        let mensajeCuota = "";
        
        // Intentar extraer el tiempo de espera del mensaje
        const retryMatch = apiError.message?.match(/Please retry in ([\d.]+)s/i);
        if (retryMatch) {
          const segundos = Math.ceil(parseFloat(retryMatch[1]));
          tiempoEspera = segundos;
        }
        
        // Verificar qué tipo de cuota está agotada
        const tieneCuotaDiaria = apiError.message?.includes("PerDay") || 
                                 apiError.message?.includes("PerDayPerProject") ||
                                 apiError.message?.includes("limit: 0");
        const tieneCuotaPorMinuto = apiError.message?.includes("PerMinute") ||
                                    apiError.message?.includes("PerMinutePerProject");
        
        // Si hay múltiples violaciones o "limit: 0", es probablemente cuota diaria
        if (tieneCuotaDiaria || (apiError.message?.match(/limit:\s*0/g) || []).length > 1) {
          esCuotaDiaria = true;
          mensajeCuota = "La cuota diaria de la API de Gemini se ha agotado completamente. La cuota se renueva cada día (generalmente a medianoche hora del servidor de Google). Puedes usar el escaneo manual mientras tanto.";
        } else if (tieneCuotaPorMinuto && tiempoEspera) {
          esCuotaPorMinuto = true;
          mensajeCuota = `Has excedido el límite de solicitudes por minuto. Puedes reintentar en aproximadamente ${tiempoEspera} segundos.`;
        } else if (tiempoEspera) {
          // Si hay tiempo de espera pero no está claro el tipo, asumir que es por minuto
          esCuotaPorMinuto = true;
          mensajeCuota = `Límite de solicitudes excedido. Puedes reintentar en aproximadamente ${tiempoEspera} segundos. Si el error persiste después de esperar, es probable que la cuota diaria también esté agotada.`;
        } else {
          // Sin tiempo de espera = probablemente cuota diaria
          esCuotaDiaria = true;
          mensajeCuota = "La cuota de la API de Gemini se ha agotado. La cuota se renueva diariamente. Puedes usar el escaneo manual mientras tanto.";
        }
        
        console.error("❌ Error: Cuota de Gemini API excedida", {
          tiempoEspera: tiempoEspera || "N/A",
          esCuotaDiaria,
          esCuotaPorMinuto,
          mensaje: mensajeCuota
        });
        
        // Crear un error con información adicional
        const error = new Error(mensajeCuota);
        error.tiempoEspera = tiempoEspera;
        error.esCuotaDiaria = esCuotaDiaria;
        error.esCuotaPorMinuto = esCuotaPorMinuto;
        error.tipoError = "cuota_excedida";
        throw error;
      } else {
        // Otros errores - mostrar el mensaje original
        const errorMsg = apiError.message || apiError.error?.message || "Error desconocido";
        console.error("❌ Error de Gemini API:", errorMsg);
        throw new Error(`Error al procesar imagen con Gemini: ${errorMsg}`);
      }
    }

    const respuestaText = result.response.text().trim();
    console.log("📥 RAW respuesta GEMINI:", respuestaText);

    const match = respuestaText.match(/\[[\s\S]*\]/);
    if (!match) {
      console.log("⚠️ Gemini no devolvió JSON");
      return [];
    }

    const productosDetectados = JSON.parse(match[0]);
    const resultadoFinal = [];

    for (const p of productosDetectados) {
      const producto = (p.producto || "").trim();
      const presentacion = normalizarPresentacion(p.presentacion || "");
      const lote = p.lote || "";
      const cantidad = Number(p.cantidad || 1);

      const nombreNormalizado = `${producto} ${presentacion}`.trim();

      const encontrado = buscarCoincidenciaFlexible(nombreNormalizado);

      resultadoFinal.push({
        codigo: encontrado?.codigo || null,
        // dejo el nombre como lo entiende el sistema, pero tú puedes ajustarlo:
        nombre: nombreNormalizado,
        lote,
        cantidad,
        sinCoincidencia: !encontrado,
      });
    }

    return resultadoFinal;
  } catch (err) {
    console.error("❌ Error GEMINI:", err);
    
    // Si es un error de cuota, tokens agotados, o API no configurada
    if (err.message && (
      err.message.includes("cuota") || 
      err.message.includes("quota") || 
      err.message.includes("tokens") ||
      err.message.includes("no disponible") ||
      err.message.includes("API_KEY") ||
      err.status === 429 ||
      err.status === 401 ||
      err.status === 403
    )) {
      throw err;
    }
    
    // Para otros errores, también lanzarlos para que el endpoint los maneje apropiadamente
    throw err;
  }
}
