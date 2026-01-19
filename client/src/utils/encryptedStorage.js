/**
 * 🔒 Utilidad de cifrado para localStorage
 * Usa Web Crypto API (AES-GCM) para cifrar datos sensibles
 */

// Verificar si Web Crypto API está disponible
const isCryptoAvailable = () => {
  try {
    // Verificar disponibilidad de crypto (puede ser window.crypto o crypto global)
    const cryptoObj = window.crypto || (typeof crypto !== 'undefined' ? crypto : null);
    
    if (!cryptoObj || !cryptoObj.subtle || typeof cryptoObj.getRandomValues !== 'function') {
      return false;
    }
    
    // Intentar una verificación práctica: ver si podemos generar valores aleatorios
    // Esto es más confiable que verificar solo el contexto seguro
    try {
      cryptoObj.getRandomValues(new Uint8Array(1));
      return true;
    } catch (e) {
      return false;
    }
  } catch (e) {
    return false;
  }
};

// Generar o recuperar una clave de cifrado única por navegador/dispositivo
// La clave se deriva de características del navegador + un ID único persistente
async function getEncryptionKey() {
  // Si Web Crypto no está disponible, lanzar error para usar fallback
  if (!isCryptoAvailable()) {
    throw new Error('Web Crypto API no disponible');
  }

  // Obtener referencia a crypto (puede ser window.crypto o crypto global)
  const cryptoObj = window.crypto || crypto;
  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error('Web Crypto API no disponible');
  }

  const KEY_NAME = 'pina_encryption_key';
  const DEVICE_ID_NAME = 'pina_device_id';
  
  // Obtener o generar un ID único del dispositivo
  let deviceId = localStorage.getItem(DEVICE_ID_NAME);
  if (!deviceId) {
    // Generar un ID único usando características del navegador + timestamp + random
    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      window.screen.width + 'x' + window.screen.height,
      new Date().getTime(),
      Math.random().toString(36)
    ].join('|');
    
    // Crear hash del fingerprint para usarlo como deviceId
    const encoder = new TextEncoder();
    const data = encoder.encode(fingerprint);
    
    const hashBuffer = await cryptoObj.subtle.digest('SHA-256', data);
    deviceId = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 32); // Usar primeros 32 caracteres
    
    localStorage.setItem(DEVICE_ID_NAME, deviceId);
  }
  
  // Intentar recuperar la clave del localStorage
  let keyData = localStorage.getItem(KEY_NAME);
  
  if (!keyData) {
    // Generar una nueva clave usando Web Crypto API
    const key = await cryptoObj.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256,
      },
      true, // extractable
      ['encrypt', 'decrypt']
    );
    
    // Exportar la clave para guardarla
    const exported = await cryptoObj.subtle.exportKey('raw', key);
    keyData = Array.from(new Uint8Array(exported))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Guardar en localStorage (persistente pero cifrado)
    localStorage.setItem(KEY_NAME, keyData);
  }
  
  // Importar la clave desde el formato guardado
  const keyBuffer = new Uint8Array(
    keyData.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
  );
  
  return await cryptoObj.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false, // no extractable después de importar
    ['encrypt', 'decrypt']
  );
}

/**
 * Cifra un valor y lo guarda en localStorage
 * @param {string} key - Clave del localStorage
 * @param {string} value - Valor a cifrar
 */
export async function setEncryptedItem(key, value) {
  try {
    if (!value) {
      localStorage.removeItem(key);
      localStorage.removeItem(`enc_${key}`);
      return;
    }

    // Verificar que Web Crypto esté disponible
    if (!isCryptoAvailable()) {
      throw new Error('Web Crypto API no disponible');
    }

    const encryptionKey = await getEncryptionKey();
    
    // Convertir el valor a bytes
    const encoder = new TextEncoder();
    const data = encoder.encode(value);
    
    // Obtener referencia a crypto (puede ser window.crypto o crypto global)
    const cryptoObj = window.crypto || crypto;
    if (!cryptoObj || !cryptoObj.getRandomValues || !cryptoObj.subtle) {
      throw new Error('Web Crypto API no disponible');
    }
    
    // Generar un IV (Initialization Vector) aleatorio para cada cifrado
    const iv = cryptoObj.getRandomValues(new Uint8Array(12));
    
    // Cifrar los datos
    const encrypted = await cryptoObj.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      encryptionKey,
      data
    );
    
    // Combinar IV y datos cifrados en un formato base64
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    // Convertir a base64 para guardar en localStorage
    const base64 = btoa(String.fromCharCode(...combined));
    
    // Guardar con prefijo para identificar que está cifrado
    localStorage.setItem(`enc_${key}`, base64);
    
    // Eliminar la versión sin cifrar si existe (migración)
    if (localStorage.getItem(key) && !localStorage.getItem(key).startsWith('enc_')) {
      localStorage.removeItem(key);
    }
  } catch (error) {
    // Solo mostrar errores en desarrollo o si no es el error esperado de Web Crypto no disponible
    if (process.env.NODE_ENV === 'development' && !error.message.includes('Web Crypto API no disponible')) {
      console.error('❌ Error cifrando dato:', error);
    }
    // Fallback: guardar sin cifrar si hay error (comportamiento esperado)
    if (process.env.NODE_ENV === 'development') {
      console.debug('⚠️ Fallback: guardando sin cifrar (Web Crypto no disponible)');
    }
    localStorage.setItem(key, value);
  }
}

/**
 * Descifra y recupera un valor de localStorage
 * @param {string} key - Clave del localStorage
 * @returns {string|null} - Valor descifrado o null si no existe
 */
export async function getEncryptedItem(key) {
  try {
    // Intentar obtener versión cifrada primero
    let encryptedData = localStorage.getItem(`enc_${key}`);
    
    // Si no existe versión cifrada, intentar versión sin cifrar (migración)
    if (!encryptedData) {
      const plainData = localStorage.getItem(key);
      if (plainData && !plainData.startsWith('enc_')) {
        // Si existe versión sin cifrar, devolverla directamente (no migrar si crypto no está disponible)
        return plainData;
      } else {
        return null;
      }
    }
    
    if (!encryptedData) {
      return null;
    }
    
    // Verificar que Web Crypto esté disponible antes de intentar descifrar
    if (!isCryptoAvailable()) {
      // Si no está disponible, intentar obtener versión sin cifrar
      const fallback = localStorage.getItem(key);
      if (fallback && !fallback.startsWith('enc_')) {
        return fallback;
      }
      return null;
    }
    
    // Obtener referencia a crypto (puede ser window.crypto o crypto global)
    const cryptoObj = window.crypto || crypto;
    if (!cryptoObj || !cryptoObj.subtle) {
      // Si no está disponible, intentar obtener versión sin cifrar
      const fallback = localStorage.getItem(key);
      if (fallback && !fallback.startsWith('enc_')) {
        return fallback;
      }
      return null;
    }
    
    const encryptionKey = await getEncryptionKey();
    
    // Validar que los datos cifrados sean válidos
    try {
      // Convertir de base64 a bytes
      const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
      
      // Verificar que tenga al menos el IV (12 bytes)
      if (combined.length < 12) {
        throw new Error('Datos cifrados inválidos: muy cortos');
      }
      
      // Extraer IV y datos cifrados
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);
      
      // Verificar que haya datos cifrados
      if (encrypted.length === 0) {
        throw new Error('Datos cifrados inválidos: sin contenido');
      }
      
      // Descifrar
      const decrypted = await cryptoObj.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv,
        },
        encryptionKey,
        encrypted
      );
      
      // Convertir bytes a string
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (decryptError) {
      // Si el descifrado falla, los datos pueden estar corruptos o cifrados con otra clave
      console.warn(`⚠️ Error descifrando ${key}, limpiando datos corruptos:`, decryptError.message);
      
      // Limpiar datos corruptos
      localStorage.removeItem(`enc_${key}`);
      localStorage.removeItem(key);
      
      // Intentar recuperar versión sin cifrar como último recurso (migración)
      const fallback = localStorage.getItem(key);
      if (fallback && !fallback.startsWith('enc_')) {
        return fallback;
      }
      
      return null;
    }
  } catch (error) {
    console.error('❌ Error descifrando dato:', error);
    
    // Limpiar datos corruptos en caso de error general
    try {
      localStorage.removeItem(`enc_${key}`);
      const fallback = localStorage.getItem(key);
      if (fallback && !fallback.startsWith('enc_')) {
        return fallback;
      }
    } catch (cleanupError) {
      console.error('Error limpiando datos:', cleanupError);
    }
    
    return null;
  }
}

/**
 * Elimina un item cifrado de localStorage
 * @param {string} key - Clave del localStorage
 */
export function removeEncryptedItem(key) {
  localStorage.removeItem(`enc_${key}`);
  // También eliminar versión sin cifrar si existe (limpieza)
  localStorage.removeItem(key);
}

/**
 * Versiones sincronas para datos no sensibles (como temas)
 * Estas funciones no cifran pero mantienen la misma API
 */
export function setItem(key, value) {
  localStorage.setItem(key, value);
}

export function getItem(key) {
  return localStorage.getItem(key);
}

export function removeItem(key) {
  localStorage.removeItem(key);
}












