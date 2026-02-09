// ===============================================================
//  📸 reconocimientoProductos.js — Reconocimiento de productos sin Gemini
// ===============================================================

import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { dbInv } from '../config/baseDeDatos.js';

// ===============================================================
// Normalizar texto (igual que en escaneoIA.js)
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
// Búsqueda flexible en inventario (igual que en escaneoIA.js)
// ===============================================================
function buscarCoincidenciaFlexible(nombreOriginal = "") {
  const nombre = normalizarTexto(nombreOriginal);
  if (!nombre) return null;

  // Traer todo el inventario
  const productos = dbInv
    .prepare(`SELECT codigo, nombre, presentacion FROM productos_ref`)
    .all();

  if (!productos || productos.length === 0) return null;

  const palabras = nombre.split(" ").filter((p) => p.length > 2);

  const candidatos = productos.map((prod) => {
    const nombreCompleto = `${prod.nombre || ""} ${prod.presentacion || ""}`.trim();
    const norm = normalizarTexto(nombreCompleto);
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
// Preprocesar imagen para OCR
// ===============================================================
async function preprocesarImagenParaOCR(bufferImagen) {
  try {
    // Convertir a escala de grises, mejorar contraste y nitidez
    const imagenProcesada = await sharp(bufferImagen)
      .greyscale() // Escala de grises para mejor OCR
      .normalize() // Normalizar brillo
      .sharpen() // Aumentar nitidez
      .contrast(1.2) // Aumentar contraste
      .resize(2000, 2000, { 
        fit: 'inside',
        withoutEnlargement: true 
      }) // Redimensionar si es muy grande
      .toBuffer();

    return imagenProcesada;
  } catch (error) {
    console.error("❌ Error preprocesando imagen:", error);
    return bufferImagen; // Devolver original si falla
  }
}

// ===============================================================
// Extraer texto de imagen usando OCR
// ===============================================================
async function extraerTextoOCR(bufferImagen) {
  let worker = null;
  try {
    // Crear worker de Tesseract
    worker = await createWorker('spa+eng'); // Español e inglés
    
    // Preprocesar imagen
    const imagenProcesada = await preprocesarImagenParaOCR(bufferImagen);
    
    // Realizar OCR
    const { data: { text } } = await worker.recognize(imagenProcesada);
    
    await worker.terminate();
    
    return text.trim();
  } catch (error) {
    console.error("❌ Error en OCR:", error);
    if (worker) {
      try {
        await worker.terminate();
      } catch (e) {
        // Ignorar errores al terminar
      }
    }
    return "";
  }
}

// ===============================================================
// Analizar texto extraído para encontrar productos
// ===============================================================
function analizarTextoParaProductos(texto) {
  const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const productosEncontrados = [];

  for (const linea of lineas) {
    // Buscar patrones comunes de productos
    // Ejemplo: "PRODUCTO 120 caps LOTE: ABC123 CANT: 5"
    
    // Intentar extraer nombre de producto (generalmente al inicio)
    const palabras = linea.split(/\s+/);
    
    // Buscar indicadores de presentación (caps, tabs, mg, ml, etc.)
    const indicadoresPresentacion = /(\d+\s*(caps?|tabs?|mg|ml|g|kg|pzs?|piezas?))/i;
    const matchPresentacion = linea.match(indicadoresPresentacion);
    
    // Buscar indicadores de lote
    const matchLote = linea.match(/(?:lote|lot|LOTE|LOT)[\s:]*([A-Z0-9]+)/i);
    
    // Buscar indicadores de cantidad
    const matchCantidad = linea.match(/(?:cant|cantidad|qty|CANT)[\s:]*(\d+)/i);
    
    // Extraer nombre (todo antes de presentación, lote o cantidad)
    let nombreProducto = linea;
    if (matchPresentacion) {
      nombreProducto = linea.substring(0, matchPresentacion.index).trim();
    } else if (matchLote) {
      nombreProducto = linea.substring(0, matchLote.index).trim();
    } else if (matchCantidad) {
      nombreProducto = linea.substring(0, matchCantidad.index).trim();
    }
    
    // Si la línea tiene al menos 3 palabras, podría ser un producto
    if (palabras.length >= 3 && nombreProducto.length > 5) {
      const presentacion = matchPresentacion ? matchPresentacion[0] : "";
      const lote = matchLote ? matchLote[1] : "";
      const cantidad = matchCantidad ? parseInt(matchCantidad[1]) : 1;
      
      productosEncontrados.push({
        nombre: nombreProducto,
        presentacion: normalizarPresentacion(presentacion),
        lote,
        cantidad
      });
    }
  }

  return productosEncontrados;
}

// ===============================================================
// Analizar imagen de forma general (cualquier cosa)
// ===============================================================
export async function analizarImagenGeneral(base64Image, contexto = null) {
  try {
    console.log("📸 Analizando imagen de forma general...");

    // Convertir base64 a buffer
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");
    const bufferImagen = Buffer.from(cleanBase64, 'base64');

    // Extraer texto usando OCR
    const textoExtraido = await extraerTextoOCR(bufferImagen);
    
    // Análisis básico de la imagen
    const metadata = await sharp(bufferImagen).metadata();
    
    // Detectar si hay texto
    const tieneTexto = textoExtraido && textoExtraido.trim().length > 0;
    
    // Análisis de contenido basado en el texto extraído
    let descripcion = "";
    let elementosDetectados = [];
    
    if (tieneTexto) {
      // Analizar el texto para detectar diferentes tipos de contenido
      const textoLower = textoExtraido.toLowerCase();
      
      // Detectar productos (si el contexto lo sugiere o si hay palabras clave)
      if (contexto === 'producto' || contexto === 'inventario' || 
          textoLower.match(/\b(caps?|tabs?|mg|ml|g|kg|lote|lot|cant|cantidad)\b/i)) {
        // Usar reconocimiento de productos
        const resultadoProductos = await reconocerProductosEnImagen(base64Image);
        return {
          tipo: 'productos',
          ...resultadoProductos,
          contexto: contexto || 'producto'
        };
      }
      
      // Detectar documentos
      if (textoLower.match(/\b(factura|recibo|ticket|comprobante|documento|cedula|cedula|dni|pasaporte)\b/i)) {
        descripcion = "Documento detectado";
        elementosDetectados.push({
          tipo: 'documento',
          texto: textoExtraido.substring(0, 200)
        });
      }
      
      // Detectar códigos de barras o QR (patrones numéricos largos)
      if (textoLower.match(/\b\d{8,}\b/)) {
        elementosDetectados.push({
          tipo: 'codigo',
          texto: textoExtraido.match(/\b\d{8,}\b/)?.[0] || ''
        });
      }
      
      // Detectar fechas
      const fechas = textoExtraido.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g);
      if (fechas) {
        elementosDetectados.push({
          tipo: 'fechas',
          valores: fechas
        });
      }
      
      // Detectar números (precios, cantidades, etc.)
      const numeros = textoExtraido.match(/\$\s*\d+[\d,.]*\b|\d+[\d,.]*\s*(pesos|dolares|usd|mxn)\b/gi);
      if (numeros) {
        elementosDetectados.push({
          tipo: 'precios',
          valores: numeros
        });
      }
      
      descripcion = `Imagen con texto detectado. ${elementosDetectados.length > 0 ? 'Elementos identificados: ' + elementosDetectados.map(e => e.tipo).join(', ') : ''}`;
    } else {
      descripcion = "Imagen sin texto legible detectado. Puede contener objetos, personas, lugares o elementos visuales.";
    }
    
    return {
      tipo: 'general',
      descripcion,
      textoExtraido: textoExtraido.substring(0, 500),
      elementosDetectados,
      metadata: {
        ancho: metadata.width,
        alto: metadata.height,
        formato: metadata.format
      },
      contexto: contexto || 'general',
      mensaje: tieneTexto 
        ? `Se detectó texto en la imagen. ${descripcion}`
        : "No se detectó texto legible. La imagen puede contener objetos, escenas o elementos visuales que requieren análisis visual avanzado."
    };
  } catch (error) {
    console.error("❌ Error analizando imagen general:", error);
    throw new Error(`Error al analizar imagen: ${error.message}`);
  }
}

// ===============================================================
// Reconocer cualquier cosa según el contexto de la pregunta
// ===============================================================
export async function reconocerSegunContexto(base64Image, preguntaUsuario = "") {
  try {
    const preguntaLower = preguntaUsuario.toLowerCase();
    
    // Determinar el contexto basado en la pregunta
    let contexto = 'general';
    
    if (preguntaLower.includes('producto') || preguntaLower.includes('inventario') || 
        preguntaLower.includes('código') || preguntaLower.includes('codigo')) {
      contexto = 'producto';
    } else if (preguntaLower.includes('texto') || preguntaLower.includes('leer') || 
               preguntaLower.includes('qué dice') || preguntaLower.includes('que dice')) {
      contexto = 'texto';
    } else if (preguntaLower.includes('documento') || preguntaLower.includes('factura') || 
               preguntaLower.includes('recibo') || preguntaLower.includes('ticket')) {
      contexto = 'documento';
    } else if (preguntaLower.includes('código de barras') || preguntaLower.includes('codigo de barras') ||
               preguntaLower.includes('qr') || preguntaLower.includes('barcode')) {
      contexto = 'codigo';
    } else if (preguntaLower.includes('qué es') || preguntaLower.includes('que es') ||
               preguntaLower.includes('identifica') || preguntaLower.includes('reconoce') ||
               preguntaLower.includes('qué hay') || preguntaLower.includes('que hay')) {
      contexto = 'general';
    }
    
    // Si el contexto es producto, usar reconocimiento de productos
    if (contexto === 'producto') {
      const resultado = await reconocerProductosEnImagen(base64Image);
      return {
        ...resultado,
        contexto: 'producto',
        pregunta: preguntaUsuario
      };
    }
    
    // Para otros contextos, usar análisis general
    const resultado = await analizarImagenGeneral(base64Image, contexto);
    return {
      ...resultado,
      pregunta: preguntaUsuario,
      sugerencia: contexto === 'general' 
        ? "Para mejor reconocimiento, puedes ser más específico. Por ejemplo: '¿Qué producto es este?', 'Lee el texto', 'Identifica este objeto'"
        : null
    };
  } catch (error) {
    console.error("❌ Error en reconocimiento contextual:", error);
    throw new Error(`Error al reconocer según contexto: ${error.message}`);
  }
}

// ===============================================================
// Procesar imagen y reconocer productos
// ===============================================================
export async function reconocerProductosEnImagen(base64Image) {
  try {
    console.log("📸 Procesando imagen para reconocimiento de productos...");

    // Convertir base64 a buffer
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");
    const bufferImagen = Buffer.from(cleanBase64, 'base64');

    // Extraer texto usando OCR
    const textoExtraido = await extraerTextoOCR(bufferImagen);
    
    if (!textoExtraido || textoExtraido.trim().length === 0) {
      console.log("⚠️ No se pudo extraer texto de la imagen");
      return {
        productos: [],
        textoExtraido: "",
        mensaje: "No se pudo extraer texto de la imagen. Asegúrate de que la imagen tenga texto legible."
      };
    }

    console.log("📝 Texto extraído:", textoExtraido.substring(0, 200) + "...");

    // Analizar texto para encontrar productos
    const productosEncontrados = analizarTextoParaProductos(textoExtraido);

    // Buscar coincidencias en inventario
    const resultadoFinal = [];

    for (const producto of productosEncontrados) {
      const nombreNormalizado = `${producto.nombre} ${producto.presentacion}`.trim();
      const encontrado = buscarCoincidenciaFlexible(nombreNormalizado);

      resultadoFinal.push({
        codigo: encontrado?.codigo || null,
        nombre: nombreNormalizado,
        nombreOriginal: producto.nombre,
        presentacion: producto.presentacion,
        lote: producto.lote,
        cantidad: producto.cantidad,
        sinCoincidencia: !encontrado,
        coincidencia: encontrado ? {
          codigo: encontrado.codigo,
          nombre: encontrado.nombre,
          presentacion: encontrado.presentacion
        } : null
      });
    }

    // Si no se encontraron productos estructurados, intentar buscar el texto completo
    if (resultadoFinal.length === 0 && textoExtraido.length > 10) {
      const encontrado = buscarCoincidenciaFlexible(textoExtraido);
      if (encontrado) {
        resultadoFinal.push({
          codigo: encontrado.codigo,
          nombre: encontrado.nombre,
          nombreOriginal: textoExtraido.substring(0, 100),
          presentacion: encontrado.presentacion || "",
          lote: "",
          cantidad: 1,
          sinCoincidencia: false,
          coincidencia: {
            codigo: encontrado.codigo,
            nombre: encontrado.nombre,
            presentacion: encontrado.presentacion
          }
        });
      }
    }

    return {
      productos: resultadoFinal,
      textoExtraido: textoExtraido.substring(0, 500), // Primeros 500 caracteres
      mensaje: resultadoFinal.length > 0 
        ? `Se encontraron ${resultadoFinal.length} producto(s) en la imagen.`
        : "No se encontraron productos reconocibles en la imagen. Intenta con una imagen más clara o con texto más legible."
    };

  } catch (error) {
    console.error("❌ Error reconociendo productos:", error);
    throw new Error(`Error al procesar imagen: ${error.message}`);
  }
}

// ===============================================================
// Reconocer un solo producto (modo simple)
// ===============================================================
export async function reconocerProductoSimple(base64Image) {
  try {
    const resultado = await reconocerProductosEnImagen(base64Image);
    
    if (resultado.productos.length === 0) {
      return {
        encontrado: false,
        mensaje: "No se pudo identificar ningún producto en la imagen."
      };
    }

    // Retornar el primer producto encontrado
    const producto = resultado.productos[0];
    
    return {
      encontrado: true,
      producto: {
        codigo: producto.codigo,
        nombre: producto.nombre,
        presentacion: producto.presentacion,
        lote: producto.lote,
        cantidad: producto.cantidad
      },
      sinCoincidencia: producto.sinCoincidencia,
      mensaje: producto.sinCoincidencia
        ? `Se detectó "${producto.nombre}" pero no se encontró en el inventario.`
        : `Producto identificado: ${producto.nombre} (Código: ${producto.codigo})`
    };
  } catch (error) {
    console.error("❌ Error en reconocimiento simple:", error);
    return {
      encontrado: false,
      mensaje: `Error al procesar la imagen: ${error.message}`
    };
  }
}

