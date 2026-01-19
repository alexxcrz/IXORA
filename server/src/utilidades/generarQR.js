import QRCode from "qrcode";
import sharp from "sharp";
import fs from "fs";
import path from "path";

// Función helper para obtener la ruta del logo
const obtenerRutaLogo = () => {
  const logosDir = path.join(process.cwd(), "uploads/personalizacion/logos");
  if (!fs.existsSync(logosDir)) {
    return null;
  }
  
  const archivos = fs.readdirSync(logosDir);
  const logoArchivo = archivos.find(f => f.toLowerCase().startsWith("logo."));
  
  if (logoArchivo) {
    return path.join(logosDir, logoArchivo);
  }
  
  return null;
};

/**
 * Genera un QR code con logo integrado en el centro
 * El logo se integra de manera que forma parte del código QR, no solo se superpone
 * @param {string} textoQR - El texto/datos a codificar en el QR
 * @param {number} qrSize - Tamaño del QR en píxeles (default: 400)
 * @returns {Promise<Buffer>} - Buffer de la imagen PNG del QR con logo
 */
export const generarQRConLogo = async (textoQR, qrSize = 400) => {
  try {
    // Generar QR como buffer con nivel de corrección alto para que funcione con logo
    const qrBuffer = await QRCode.toBuffer(textoQR, {
      errorCorrectionLevel: "H", // Alto nivel de corrección (30%) para que funcione con logo
      type: "png",
      width: qrSize,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF"
      }
    });

    // Intentar cargar el logo
    const logoPath = obtenerRutaLogo();
    
    if (!logoPath || !fs.existsSync(logoPath)) {
      // Si no hay logo, devolver QR sin logo
      return qrBuffer;
    }

    try {
      // Calcular tamaño del logo: aproximadamente 18% del tamaño del QR para mejor integración
      const logoSize = Math.floor(qrSize * 0.18);
      
      // Crear un buffer más grande con borde blanco para que el logo se vea integrado
      const logoConBorde = await sharp(logoPath)
        .resize(logoSize, logoSize, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .extend({
          top: Math.floor(logoSize * 0.15),
          bottom: Math.floor(logoSize * 0.15),
          left: Math.floor(logoSize * 0.15),
          right: Math.floor(logoSize * 0.15),
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .png()
        .toBuffer();

      const logoSizeFinal = logoSize + Math.floor(logoSize * 0.3); // Tamaño con borde

      // Integrar el logo en el centro del QR con borde blanco para que se vea integrado
      const qrConLogo = await sharp(qrBuffer)
        .composite([
          {
            input: logoConBorde,
            top: Math.floor((qrSize - logoSizeFinal) / 2),
            left: Math.floor((qrSize - logoSizeFinal) / 2),
            blend: "over" // Mezclar el logo sobre el QR
          }
        ])
        .png()
        .toBuffer();

      return qrConLogo;
    } catch (logoError) {
      // Si falla el procesamiento del logo, devolver QR sin logo
      return qrBuffer;
    }
  } catch (err) {
    // Si falla completamente, generar QR sin logo como último recurso
    try {
      return await QRCode.toBuffer(textoQR, {
        errorCorrectionLevel: "M",
        type: "png",
        width: qrSize,
        margin: 2,
      });
    } catch (fallbackError) {
      console.error("❌ Error crítico generando QR:", fallbackError.message);
      throw fallbackError;
    }
  }
};
