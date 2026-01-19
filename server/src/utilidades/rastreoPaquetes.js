// Utilidad para rastrear paquetes de diferentes paqueterías
import axios from "axios";
import * as cheerio from "cheerio";

/**
 * Rastrea un paquete de Estafeta
 * @param {string} guia - Número de guía
 * @returns {Promise<{estado: string, fecha: string, ubicacion: string, detalles: Array}>}
 */
export async function rastrearEstafeta(guia) {
  try {
    const url = `https://www.estafeta.com/Herramientas/Rastreo?Guias=${guia}`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
      },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);
    
    // Buscar información de rastreo en la página
    const estado = $('.estado-envio, .status, [class*="estado"], [class*="status"]').first().text().trim() || 
                   $('h2, h3').first().text().trim() || 
                   'En proceso';
    
    // Buscar tabla de eventos o historial
    const eventos = [];
    $('table tr, .evento, [class*="evento"], [class*="historial"]').each((i, elem) => {
      const texto = $(elem).text().trim();
      if (texto && texto.length > 5) {
        eventos.push(texto);
      }
    });

    // Buscar fecha más reciente
    let fecha = null;
    $('.fecha, [class*="fecha"], time, [datetime]').each((i, elem) => {
      const fechaTexto = $(elem).text().trim() || $(elem).attr('datetime');
      if (fechaTexto && !fecha) {
        fecha = fechaTexto;
      }
    });

    // Determinar estado basado en el contenido - SER MÁS CONSERVADOR
    let estadoFinal = "En tránsito";
    const contenido = response.data.toLowerCase();
    
    // Solo marcar como "Entregado" si aparece explícitamente "entregado" o "entregada" 
    // Y NO aparece "en camino", "en tránsito", "en ruta", "en proceso"
    const esEntregado = (contenido.includes("entregado") || contenido.includes("entregada")) &&
                       !contenido.includes("en camino") &&
                       !contenido.includes("en tránsito") &&
                       !contenido.includes("en ruta") &&
                       !contenido.includes("en proceso") &&
                       !contenido.includes("enviado");
    
    if (esEntregado) {
      estadoFinal = "Entregado";
    } else if (contenido.includes("en camino") || contenido.includes("en tránsito") || contenido.includes("en ruta") || contenido.includes("en proceso")) {
      estadoFinal = "En tránsito";
    } else if (contenido.includes("enviado") || contenido.includes("despachado")) {
      estadoFinal = "Enviado";
    } else if (contenido.includes("en origen") || contenido.includes("recibido en")) {
      estadoFinal = "En origen";
    }

    return {
      estado: estadoFinal,
      estadoOriginal: estado,
      fecha: fecha || new Date().toISOString().split('T')[0],
      ubicacion: eventos[0] || "No disponible",
      detalles: eventos.slice(0, 5), // Últimos 5 eventos
      tieneInfo: eventos.length > 0 || estadoFinal !== "En proceso"
    };
  } catch (error) {
    console.error("Error rastreando Estafeta:", error.message);
    return {
      estado: "Error",
      error: error.message,
      tieneInfo: false
    };
  }
}

/**
 * Rastrea un paquete de DHL
 * @param {string} guia - Número de guía
 * @returns {Promise<{estado: string, fecha: string, ubicacion: string}>}
 */
export async function rastrearDHL(guia) {
  try {
    const url = `https://www.dhl.com/es-es/home/tracking/tracking-express.html?submit=1&tracking-id=${guia}`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);
    
    const estado = $('.status, [class*="status"], [class*="estado"]').first().text().trim() || "En proceso";
    
    let estadoFinal = "En tránsito";
    const contenido = response.data.toLowerCase();
    
    if (contenido.includes("delivered") || contenido.includes("entregado")) {
      estadoFinal = "Entregado";
    } else if (contenido.includes("in transit") || contenido.includes("en tránsito")) {
      estadoFinal = "En tránsito";
    }

    return {
      estado: estadoFinal,
      estadoOriginal: estado,
      fecha: new Date().toISOString().split('T')[0],
      ubicacion: "No disponible",
      tieneInfo: estadoFinal !== "En proceso"
    };
  } catch (error) {
    console.error("Error rastreando DHL:", error.message);
    return {
      estado: "Error",
      error: error.message,
      tieneInfo: false
    };
  }
}

/**
 * Rastrea un paquete de FedEx
 * @param {string} guia - Número de guía
 * @returns {Promise<{estado: string, fecha: string, ubicacion: string}>}
 */
export async function rastrearFedEx(guia) {
  try {
    const url = `https://www.fedex.com/apps/fedextrack/?tracknumbers=${guia}`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);
    
    // Buscar el estado más reciente en la página
    // FedEx muestra los estados en un timeline, necesitamos el último
    let estado = $('.status, [class*="status"], [class*="tracking-status"]').last().text().trim() || 
                 $('.status, [class*="status"]').first().text().trim() || 
                 "En proceso";
    
    // Buscar también en el texto de la página el estado más reciente
    const contenido = response.data.toLowerCase();
    const contenidoOriginal = response.data; // Mantener original para búsqueda case-sensitive
    
    // Buscar "ENTREGADO" o "DELIVERED" en mayúsculas (FedEx lo muestra así)
    const tieneEntregadoMayus = contenidoOriginal.includes("ENTREGADO") || 
                                contenidoOriginal.includes("DELIVERED") ||
                                contenidoOriginal.includes("Delivered");
    
    // Buscar estados de tránsito
    const tieneEnTransito = contenido.includes("in transit") || 
                           contenido.includes("en tránsito") || 
                           contenido.includes("on the way") ||
                           contenido.includes("en camino");
    
    // Buscar "en proceso" o "processing"
    const tieneEnProceso = contenido.includes("in process") || 
                          contenido.includes("en proceso") ||
                          contenido.includes("processing");
    
    // PRIORIDAD ABSOLUTA: Si aparece "ENTREGADO" o "DELIVERED" (en mayúsculas), es entregado
    // Esto es más confiable que buscar en minúsculas
    // IMPORTANTE: Verificar ENTREGADO PRIMERO antes de cualquier otro estado
    let estadoFinal = "En tránsito";
    
    // Buscar también en minúsculas como fallback
    const tieneEntregadoMinus = contenido.includes("entregado") || 
                                contenido.includes("delivered");
    
    // PRIORIDAD 1: Si aparece "ENTREGADO" o "DELIVERED" en mayúsculas, es entregado
    // Esto tiene prioridad ABSOLUTA sobre cualquier otro estado, incluso "En proceso"
    // FedEx muestra "ENTREGADO" en mayúsculas cuando está entregado
    if (tieneEntregadoMayus) {
      // Si aparece "ENTREGADO" en mayúsculas, es definitivamente entregado
      // No importa si también aparece "en proceso" en el historial
      estadoFinal = "Entregado";
      estado = "ENTREGADO";
    } else if (tieneEntregadoMinus) {
      // Si solo está en minúsculas, verificar que no sea parte de otro texto
      const esRealmenteEntregado = !contenido.includes("listo para entrega") &&
                                   !contenido.includes("ready for delivery") &&
                                   !contenido.includes("preparando entrega") &&
                                   !contenido.includes("preparing for delivery");
      
      if (esRealmenteEntregado) {
        estadoFinal = "Entregado";
        estado = "Entregado";
      } else if (tieneEnTransito) {
        estadoFinal = "En tránsito";
      }
    } else if (tieneEnTransito) {
      estadoFinal = "En tránsito";
    } else if (tieneEnProceso) {
      estadoFinal = "En proceso";
    }
    
    // Intentar extraer ubicación y fecha del último evento
    let ubicacion = "No disponible";
    let fecha = new Date().toISOString().split('T')[0];
    
    // Buscar información de ubicación en el HTML (formato común: "CIUDAD, ESTADO MX")
    const ubicacionMatch = contenidoOriginal.match(/([A-Z][A-Z\s,]+MX|[A-Z][A-Z\s,]+MEXICO)/);
    if (ubicacionMatch) {
      ubicacion = ubicacionMatch[0].trim();
    }
    
    // Buscar fecha en formato DD/MM/YY o DD/MM/YYYY
    const fechaMatch = contenidoOriginal.match(/(\d{2}\/\d{2}\/\d{2,4})/);
    if (fechaMatch) {
      fecha = fechaMatch[0];
    }

    return {
      estado: estadoFinal,
      estadoOriginal: estado || (tieneEntregadoMayus ? "ENTREGADO" : estadoFinal),
      fecha: fecha,
      ubicacion: ubicacion,
      tieneInfo: estadoFinal !== "En proceso" || tieneEntregadoMayus || tieneEntregadoMinus
    };
  } catch (error) {
    console.error("Error rastreando FedEx:", error.message);
    return {
      estado: "Error",
      error: error.message,
      tieneInfo: false
    };
  }
}

/**
 * Rastrea un paquete según su paquetería
 * @param {string} paqueteria - Nombre de la paquetería
 * @param {string} guia - Número de guía
 * @returns {Promise<{estado: string, fecha: string, ubicacion: string, detalles: Array}>}
 */
export async function rastrearPaquete(paqueteria, guia) {
  if (!paqueteria || !guia) {
    return {
      estado: "Error",
      error: "Faltan datos de paquetería o guía",
      tieneInfo: false
    };
  }

  const paq = String(paqueteria).trim().toUpperCase();
  
  if (paq.includes("ESTAFETA")) {
    return await rastrearEstafeta(guia);
  } else if (paq.includes("DHL")) {
    return await rastrearDHL(guia);
  } else if (paq.includes("FEDEX") || paq.includes("FED")) {
    return await rastrearFedEx(guia);
  } else {
    return {
      estado: "No soportado",
      error: `Rastreo automático no disponible para ${paqueteria}`,
      tieneInfo: false
    };
  }
}
