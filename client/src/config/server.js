/**
 * Configuración centralizada del servidor
 * SIEMPRE usa la IP del servidor IXORA, nunca localhost
 */

/**
 * Obtiene la URL del servidor
 * Detecta automáticamente la IP del servidor o usa la configurada
 * @returns {string} URL del servidor
 */
export const getServerUrl = async () => {
  // Detectar si estamos en Android (app nativa)
  const isAndroid = typeof window !== 'undefined' && (
    window.navigator?.userAgent?.includes('Android') || 
    window.navigator?.userAgent?.includes('wv') ||
    window.Capacitor?.getPlatform() === 'android'
  );
  
  // Limpiar IP antigua si existe
  const savedUrl = localStorage.getItem('server_url');
  if (savedUrl && savedUrl.includes('172.16.30.160')) {
    localStorage.removeItem('server_url');
  }
  
  // En Android, usar IP directa sin intentar detectar desde window.location
  if (isAndroid) {
    // Intentar usar la URL guardada si existe y es válida
    if (savedUrl && !savedUrl.includes('172.16.30.160') && savedUrl.startsWith('http://')) {
      try {
        // Verificar que el servidor esté disponible
        const response = await fetch(`${savedUrl}/server-info`, { 
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        });
        if (response.ok) {
          return savedUrl;
        }
      } catch (e) {
        // Si falla, continuar con IP por defecto
      }
    }
    // Usar IP por defecto para Android
    const defaultUrl = 'http://172.16.30.12:3001';
    localStorage.setItem('server_url', defaultUrl);
    return defaultUrl;
  }
  
  // En desarrollo web, detectar desde la IP actual de la página
  if (process.env.NODE_ENV === 'development') {
    const currentHost = window.location.hostname;
    if (currentHost && currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
      // En desarrollo, usar la misma IP con puerto 3001
      const devUrl = `http://${currentHost}:3001`;
      try {
        // Intentar obtener la IP real del servidor para verificar
        const response = await fetch(`${devUrl}/server-info`, { 
          method: 'GET',
          signal: AbortSignal.timeout(2000)
        });
        if (response.ok) {
          const data = await response.json();
          const serverUrl = data.url || devUrl;
          if (!serverUrl.includes('172.16.30.160')) {
            localStorage.setItem('server_url', serverUrl);
            return serverUrl;
          }
        }
      } catch (e) {
        // Si falla, usar la URL detectada de todas formas
        localStorage.setItem('server_url', devUrl);
        return devUrl;
      }
    }
  }
  
  // Intentar obtener la IP del servidor automáticamente
  try {
    // Intentar obtener desde localStorage primero (si no es la IP antigua)
    const savedUrl = localStorage.getItem('server_url');
    if (savedUrl && !savedUrl.includes('172.16.30.160')) {
      // Verificar que el servidor esté disponible
      try {
        const response = await fetch(`${savedUrl}/server-info`, { 
          method: 'GET',
          signal: AbortSignal.timeout(2000) // Timeout de 2 segundos
        });
        if (response.ok) {
          const data = await response.json();
          const detectedUrl = data.url || savedUrl;
          if (!detectedUrl.includes('172.16.30.160')) {
            localStorage.setItem('server_url', detectedUrl);
            return detectedUrl;
          }
        }
      } catch (e) {
        // Si falla, intentar detectar automáticamente
      }
    }
    
    // Intentar detectar automáticamente desde la IP actual
    const currentHost = window.location.hostname;
    if (currentHost && currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
      const protocol = window.location.protocol;
      const port = window.location.port || '3001';
      const autoUrl = `${protocol}//${currentHost}:${port}`;
      
      try {
        const response = await fetch(`${autoUrl}/server-info`, { 
          method: 'GET',
          signal: AbortSignal.timeout(2000)
        });
        if (response.ok) {
          const data = await response.json();
          const serverUrl = data.url || autoUrl;
          if (!serverUrl.includes('172.16.30.160')) {
            localStorage.setItem('server_url', serverUrl);
            return serverUrl;
          }
        }
      } catch (e) {
        // Continuar con IP por defecto
      }
    }
  } catch (e) {
    // Si falla la detección automática, usar IP por defecto
  }
  
  // IP por defecto (fallback)
  const serverIp = '172.16.30.12';
  const port = 3001;
  const serverUrl = `http://${serverIp}:${port}`;
  
  // Guardar en localStorage
  try {
    localStorage.setItem('server_url', serverUrl);
  } catch (e) {
    console.warn('⚠️ [getServerUrl] No se pudo guardar en localStorage:', e);
  }
  
  return serverUrl;
};

/**
 * Versión síncrona para compatibilidad (usa la última URL guardada)
 */
export const getServerUrlSync = () => {
  // Detectar si estamos en Android (app nativa)
  const isAndroid = typeof window !== 'undefined' && (
    window.navigator?.userAgent?.includes('Android') || 
    window.navigator?.userAgent?.includes('wv') ||
    window.Capacitor?.getPlatform() === 'android'
  );
  
  // En Android, siempre usar la IP del servidor directamente
  if (isAndroid) {
    const savedUrl = localStorage.getItem('server_url');
    // Solo usar la URL guardada si existe y no es la IP antigua
    if (savedUrl && !savedUrl.includes('172.16.30.160') && savedUrl.startsWith('http://')) {
      return savedUrl;
    }
    // Limpiar IP antigua si existe
    if (savedUrl && savedUrl.includes('172.16.30.160')) {
      localStorage.removeItem('server_url');
    }
    // Usar IP por defecto para Android
    return 'http://172.16.30.12:3001';
  }
  
  // En desarrollo web, detectar desde la IP actual
  if (process.env.NODE_ENV === 'development') {
    const currentHost = window.location.hostname;
    if (currentHost && currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
      // Usar la misma IP pero con puerto 3001 para conexiones directas
      return `http://${currentHost}:3001`;
    }
    // Si es localhost, usar la IP del servidor directamente
    return 'http://172.16.30.12:3001';
  }
  
  // En producción web, usar la URL guardada o fallback
  const savedUrl = localStorage.getItem('server_url');
  if (savedUrl && !savedUrl.includes('172.16.30.160')) {
    // Solo usar la URL guardada si no es la IP antigua
    return savedUrl;
  }
  
  // Limpiar IP antigua si existe
  if (savedUrl && savedUrl.includes('172.16.30.160')) {
    localStorage.removeItem('server_url');
  }
  
  // Fallback a IP por defecto
  return 'http://172.16.30.12:3001';
};

/**
 * Configura la URL del servidor para apps nativas
 * @param {string} url - URL completa del servidor (ej: "http://192.168.1.100:3001")
 */
export const setServerUrl = (url) => {
  localStorage.setItem('server_url', url);
};

/**
 * Constante SERVER_URL - Usa la versión síncrona para compatibilidad
 * Úsala cuando necesites una constante (no una función)
 * Para obtener la URL actualizada, usa getServerUrl() que es asíncrona
 */
export const SERVER_URL = getServerUrlSync();

