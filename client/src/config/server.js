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
  // Detectar si estamos en Electron (app de escritorio)
  const isElectron = typeof window !== 'undefined' && (
    window.navigator?.userAgent?.includes('Electron') ||
    window.process?.type === 'renderer' ||
    window.require // Electron expone require globalmente
  );
  
  // Detectar si estamos en Android (app nativa)
  const isAndroid = typeof window !== 'undefined' && (
    window.navigator?.userAgent?.includes('Android') || 
    window.navigator?.userAgent?.includes('wv') ||
    window.Capacitor?.getPlatform() === 'android'
  );
  
  // En Electron, usar localhost porque el servidor corre localmente
  if (isElectron) {
    // En Electron, el servidor se ejecuta en localhost:3001
    const localhostUrl = 'http://localhost:3001';
    
    // Primero intentar con localhost
    try {
      const response = await fetch(`${localhostUrl}/server-info`, { 
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      if (response.ok) {
        localStorage.setItem('server_url', localhostUrl);
        return localhostUrl;
      }
    } catch (e) {
    }
    
    // Si localhost no funciona, esperar un poco y reintentar
    // (el servidor puede estar iniciando)
    try {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const response = await fetch(`${localhostUrl}/server-info`, { 
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      if (response.ok) {
        localStorage.setItem('server_url', localhostUrl);
        return localhostUrl;
      }
    } catch (e) {
      console.error('❌ Error conectando al servidor local:', e);
    }
    
    // Fallback a localhost (el servidor debería estar ahí)
    localStorage.setItem('server_url', localhostUrl);
    return localhostUrl;
  }
  
  // Limpiar IP antigua si existe
  const savedUrl = localStorage.getItem('server_url');
  if (savedUrl && savedUrl.includes('172.16.30.160')) {
    localStorage.removeItem('server_url');
  }
  
  // En Android, intentar detectar automáticamente la IP del servidor
  if (isAndroid) {
    // Intentar usar la URL guardada si existe y es válida
    if (savedUrl && !savedUrl.includes('172.16.30.160') && savedUrl.startsWith('http://')) {
      try {
        // Verificar que el servidor esté disponible (con timeout corto para no bloquear)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // Timeout de 2 segundos
        
        try {
          const response = await fetch(`${savedUrl}/server-info`, { 
            method: 'GET',
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (response && response.ok) {
            const data = await response.json();
            const detectedUrl = data.url || savedUrl;
            if (detectedUrl !== savedUrl) {
              localStorage.setItem('server_url', detectedUrl);
            }
            return detectedUrl;
          }
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          // Si falla, intentar detectar automáticamente
        }
      } catch (e) {
        // Si falla, intentar detectar automáticamente
      }
    }
    
    // Intentar detectar automáticamente la IP del servidor
    // Escanear posibles IPs comunes en la red local
    const possibleIPs = [
      '172.16.30.5',
      '192.168.1.100',
      '192.168.0.100',
      '192.168.1.1',
      '192.168.0.1',
      '10.0.0.2',
      '172.16.30.1'
    ];
    
    // Obtener la IP actual del dispositivo si es posible
    try {
      // Intentar obtener desde window.location si está disponible
      const currentHost = window.location?.hostname;
      if (currentHost && currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
        possibleIPs.unshift(currentHost); // Priorizar la IP actual
      }
    } catch (e) {
      // Ignorar errores
    }
    
    // Intentar conectar con cada IP posible
    for (const ip of possibleIPs) {
      const testUrl = `http://${ip}:3001`;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);
        
        try {
          const response = await fetch(`${testUrl}/server-info`, { 
            method: 'GET',
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          
          if (response && response.ok) {
            const data = await response.json();
            const detectedUrl = data.url || testUrl;
            localStorage.setItem('server_url', detectedUrl);
            console.log(`✅ [getServerUrl] Servidor detectado automáticamente: ${detectedUrl}`);
            return detectedUrl;
          }
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          // Continuar con la siguiente IP
        }
      } catch (e) {
        // Continuar con la siguiente IP
      }
    }
    
    // Si no se encontró ninguna IP, usar la IP por defecto
    const defaultUrl = 'http://172.16.30.5:3001';
    try {
      localStorage.setItem('server_url', defaultUrl);
    } catch (localStorageErr) {
      console.warn('⚠️ [getServerUrl] Error guardando en localStorage:', localStorageErr);
    }
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
            // Si la IP detectada es diferente a la guardada, actualizar
            if (detectedUrl !== savedUrl) {
              localStorage.setItem('server_url', detectedUrl);
              console.log(`✅ [getServerUrl] IP actualizada: ${savedUrl} -> ${detectedUrl}`);
            }
            return detectedUrl;
          }
        }
      } catch (e) {
        // Si falla, intentar detectar automáticamente
        console.log(`⚠️ [getServerUrl] No se pudo conectar con ${savedUrl}, intentando detectar automáticamente...`);
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
            console.log(`✅ [getServerUrl] Servidor detectado desde IP actual: ${serverUrl}`);
            return serverUrl;
          }
        }
      } catch (e) {
        // Continuar con escaneo de red
      }
    }
    
    // Si no se encontró, intentar escanear posibles IPs en la red local
    const possibleIPs = [
      '172.16.30.5',
      '192.168.1.100',
      '192.168.0.100',
      '192.168.1.1',
      '192.168.0.1',
      '10.0.0.2',
      '172.16.30.1'
    ];
    
    // Agregar la IP actual si está disponible
    if (currentHost && currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
      possibleIPs.unshift(currentHost);
    }
    
    // Intentar conectar con cada IP posible (en paralelo con Promise.race)
    const detectionPromises = possibleIPs.map(ip => {
      const testUrl = `http://${ip}:3001`;
      return fetch(`${testUrl}/server-info`, { 
        method: 'GET',
        signal: AbortSignal.timeout(1500)
      })
      .then(response => {
        if (response.ok) {
          return response.json().then(data => ({
            url: data.url || testUrl,
            ip: ip
          }));
        }
        throw new Error('Response not ok');
      })
      .catch(() => null);
    });
    
    // Esperar a que alguna IP responda
    const results = await Promise.allSettled(detectionPromises);
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        const detectedUrl = result.value.url;
        if (!detectedUrl.includes('172.16.30.160')) {
          localStorage.setItem('server_url', detectedUrl);
          console.log(`✅ [getServerUrl] Servidor detectado automáticamente: ${detectedUrl}`);
          return detectedUrl;
        }
      }
    }
  } catch (e) {
    // Si falla la detección automática, usar IP por defecto
    console.warn('⚠️ [getServerUrl] Error en detección automática:', e);
  }
  
    // IP por defecto (fallback)
  const serverIp = '172.16.30.5';
  const port = 3001;
  const serverUrl = `http://${serverIp}:${port}`;
  
  // Guardar en localStorage
  try {
    localStorage.setItem('server_url', serverUrl);
  } catch (e) {
  }
  
  return serverUrl;
};

/**
 * Versión síncrona para compatibilidad (usa la última URL guardada)
 */
export const getServerUrlSync = () => {
  // Detectar si estamos en Electron (app de escritorio)
  const isElectron = typeof window !== 'undefined' && (
    window.navigator?.userAgent?.includes('Electron') ||
    window.process?.type === 'renderer' ||
    window.require // Electron expone require globalmente
  );
  
  // Detectar si estamos en Android (app nativa)
  const isAndroid = typeof window !== 'undefined' && (
    window.navigator?.userAgent?.includes('Android') || 
    window.navigator?.userAgent?.includes('wv') ||
    window.Capacitor?.getPlatform() === 'android'
  );
  
  // En Electron, usar localhost porque el servidor corre localmente
  if (isElectron) {
    const savedUrl = localStorage.getItem('server_url');
    // Si hay una URL guardada que es localhost, usarla
    if (savedUrl && savedUrl.includes('localhost')) {
      return savedUrl;
    }
    // Limpiar IP externa si existe (en Electron debe ser localhost)
    if (savedUrl && !savedUrl.includes('localhost')) {
      localStorage.removeItem('server_url');
    }
    // En Electron, siempre usar localhost:3001
    return 'http://localhost:3001';
  }
  
  // En Android, siempre usar la IP del servidor directamente
  if (isAndroid) {
    try {
      const savedUrl = localStorage.getItem('server_url');
      // Solo usar la URL guardada si existe y no es la IP antigua
      if (savedUrl && !savedUrl.includes('172.16.30.160') && savedUrl.startsWith('http://')) {
        return savedUrl;
      }
      // Limpiar IP antigua si existe
      if (savedUrl && savedUrl.includes('172.16.30.160')) {
        try {
          localStorage.removeItem('server_url');
        } catch (removeErr) {
          console.warn('⚠️ [getServerUrlSync] Error removiendo URL antigua:', removeErr);
        }
      }
    } catch (localStorageErr) {
    }
    // Usar IP por defecto para Android
    return 'http://172.16.30.5:3001';
  }
  
  // En desarrollo web, detectar desde la IP actual
  if (process.env.NODE_ENV === 'development') {
    const currentHost = window.location.hostname;
    if (currentHost && currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
      // Usar la misma IP pero con puerto 3001 para conexiones directas
      return `http://${currentHost}:3001`;
    }
    // Si es localhost, usar la IP del servidor directamente
    return 'http://172.16.30.5:3001';
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
  return 'http://172.16.30.5:3001';
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

