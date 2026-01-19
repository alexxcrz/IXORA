/**
 * Utilidades para detectar y manejar el modo oscuro del sistema
 */

/**
 * Detecta si el dispositivo está en modo oscuro
 * @returns {boolean} true si el dispositivo está en modo oscuro
 */
export const isDarkMode = () => {
  if (typeof window === 'undefined') return false;
  
  // Primero intentar con matchMedia (estándar web)
  if (window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  
  // Fallback: detectar modo oscuro en Android/iOS usando Capacitor
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    // En Android, verificar el tema del sistema
    if (window.Capacitor.getPlatform() === 'android') {
      try {
        // El tema se detecta automáticamente por el sistema
        // Si estamos en modo oscuro, el sistema aplicará el tema dark
        return document.documentElement.classList.contains('dark') || 
               document.body.classList.contains('dark');
      } catch (e) {
        console.debug('Error detectando modo oscuro en Android:', e);
      }
    }
  }
  
  // Fallback final: revisar localStorage (por si el usuario tiene preferencia guardada)
  try {
    const savedTheme = localStorage.getItem('system-dark-mode');
    if (savedTheme !== null) {
      return savedTheme === 'true';
    }
  } catch (e) {
    console.debug('Error leyendo preferencia de modo oscuro:', e);
  }
  
  return false;
};

/**
 * Escucha cambios en el modo oscuro del sistema
 * @param {Function} callback - Función que se llama cuando cambia el modo oscuro
 * @returns {Function} Función para desuscribirse del listener
 */
export const watchDarkMode = (callback) => {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => {}; // Retornar función vacía si no hay soporte
  }
  
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  
  // Función handler
  const handleChange = (e) => {
    const isDark = e.matches;
    // Guardar preferencia
    try {
      localStorage.setItem('system-dark-mode', String(isDark));
    } catch (err) {
      console.debug('Error guardando preferencia de modo oscuro:', err);
    }
    callback(isDark);
  };
  
  // Agregar listener (compatibilidad moderna y antigua)
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  } else if (mediaQuery.addListener) {
    // Fallback para navegadores antiguos
    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }
  
  return () => {};
};

/**
 * Aplica el atributo dark al documento según el modo del sistema
 */
export const applySystemDarkMode = () => {
  const isDark = isDarkMode();
  
  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('system-dark-mode');
    document.body.classList.add('system-dark-mode');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.remove('system-dark-mode');
    document.body.classList.remove('system-dark-mode');
  }
  
  // Guardar preferencia
  try {
    localStorage.setItem('system-dark-mode', String(isDark));
  } catch (err) {
    console.debug('Error guardando preferencia de modo oscuro:', err);
  }
  
  return isDark;
};

