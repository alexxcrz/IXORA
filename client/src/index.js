import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { cargarTema } from "./utils/temas";
import { applySystemDarkMode } from "./utils/darkMode";
import ErrorBoundary from "./components/ErrorBoundary";
import logger from "./utils/logger";

// Build version: 7.0.1
// PROTECCIÓN: Manejador global de errores MUY AGRESIVO para evitar crashes
// Este logging será visible en adb logcat
window.addEventListener('error', (event) => {
  try {
    // FILTRAR: Ignorar errores de extensiones de navegador (inofensivos)
    const errorMsg = event.message || '';
    const errorFilename = event.filename || '';
    const errorStack = event.error?.stack || '';
    
    const extensionErrors = [
      'Could not establish connection',
      'Receiving end does not exist',
      'polyfill.js',
      'Extension context invalidated',
      'message handler closed',
      'chrome-extension://',
      'moz-extension://',
      'safari-extension://'
    ];
    
    const isExtensionError = extensionErrors.some(errorText => 
      errorMsg.includes(errorText) || 
      errorFilename.includes(errorText) ||
      errorStack.includes(errorText)
    );
    
    if (isExtensionError) {
      // Silenciar errores de extensiones - son inofensivos y no afectan la app
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
    
    // Logging visible en adb logcat (Android)
    const errorDetails = `File: ${errorFilename}:${event.lineno || '?'}:${event.colno || '?'}`;
    
    // Usar console.error para que aparezca en logcat
    console.error('========================================');
    console.error('🚨 CRASH PREVENIDO - ERROR GLOBAL');
    console.error('========================================');
    console.error(`[IXORA_ERROR] ${errorMsg}`);
    console.error(errorDetails);
    console.error('Stack:', errorStack);
    console.error('Full Error Object:', JSON.stringify({
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error?.toString(),
      stack: event.error?.stack,
    }, null, 2));
    console.error('========================================');
    
    // También usar logger
    try {
      logger.error('Error global capturado', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error?.toString(),
        stack: event.error?.stack,
      }, 'GLOBAL_ERROR');
    } catch (logErr) {
      console.error('[IXORA] Error en logger:', logErr);
    }
    
    // PREVENIR CRASH - Muy importante
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    return true;
  } catch (e) {
    // Si incluso el handler falla, intentar prevenir crash
    console.error('[IXORA] Error en error handler:', e);
    return true;
  }
}, true); // Usar capture phase para atrapar TODO

window.addEventListener('unhandledrejection', (event) => {
  try {
    const reason = event.reason;
    const reasonMsg = reason?.message || reason?.toString() || 'Unknown rejection';
    const reasonStack = reason?.stack || 'No stack trace';
    
    // FILTRAR: Ignorar errores de extensiones de navegador (inofensivos)
    const extensionErrors = [
      'Could not establish connection',
      'Receiving end does not exist',
      'polyfill.js',
      'Extension context invalidated',
      'message handler closed',
      'chrome-extension://',
      'moz-extension://',
      'safari-extension://'
    ];
    
    const isExtensionError = extensionErrors.some(errorText => 
      reasonMsg.includes(errorText) || 
      reasonStack.includes(errorText) ||
      reason?.toString().includes(errorText)
    );
    
    if (isExtensionError) {
      // Silenciar errores de extensiones - son inofensivos y no afectan la app
      event.preventDefault();
      return true;
    }
    
    // Logging visible en adb logcat
    console.error('========================================');
    console.error('🚨 CRASH PREVENIDO - PROMISE RECHAZADA');
    console.error('========================================');
    console.error('Reason:', reasonMsg);
    console.error('Stack:', reasonStack);
    console.error('Full Rejection:', JSON.stringify({
      reason: reason?.toString(),
      stack: reason?.stack,
      message: reason?.message,
    }, null, 2));
    console.error('========================================');
    
    // También usar logger
    try {
      logger.error('Promise rechazada no manejada', {
        reason: reason?.toString(),
        stack: reason?.stack,
        message: reason?.message,
      }, 'GLOBAL_ERROR');
    } catch (logErr) {
      console.error('[IXORA] Error en logger:', logErr);
    }
    
    // PREVENIR CRASH
    event.preventDefault();
    event.stopPropagation();
    return true;
  } catch (e) {
    console.error('[IXORA] Error en rejection handler:', e);
    event.preventDefault();
    return true;
  }
});

// Aplicar modo oscuro del sistema INMEDIATAMENTE antes de que React renderice
try {
  applySystemDarkMode();
} catch (error) {
}

// Aplicar tema INMEDIATAMENTE antes de que React renderice
// Esto evita el flash de colores por defecto y conflictos
try {
  cargarTema();
  // Marcar que el tema está listo
  document.documentElement.removeAttribute('data-theme-loading');
} catch (error) {
  console.error('[IXORA] Error cargando tema:', error);
}

// PROTECCIÓN: Renderizar con múltiples capas de protección
const rootElement = document.getElementById("root");
if (!rootElement) {
  console.error('[IXORA] ❌ No se encontró el elemento root');
  try {
    document.body.innerHTML = '<div style="padding: 20px; color: red;">Error: No se encontró el elemento root</div>';
  } catch (e) {
    console.error('[IXORA] Error al mostrar mensaje de error:', e);
  }
} else {
  try {
    const root = ReactDOM.createRoot(rootElement);
    
    // Logging inicial
    try {
      logger.info('Iniciando aplicación React');
    } catch (logErr) {
      console.error('[IXORA] Error en logger inicial:', logErr);
    }
    
    // Renderizar con protección máxima
    try {
      root.render(
        <React.StrictMode>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </React.StrictMode>
      );
      try {
        logger.info('Aplicación React renderizada correctamente');
      } catch (logErr) {
        console.error('[IXORA] Error en logger después de render:', logErr);
      }
    } catch (renderError) {
      console.error('[IXORA] ========================================');
      console.error('[IXORA] 🚨 ERROR AL RENDERIZAR');
      console.error('[IXORA] ========================================');
      console.error('[IXORA] Error:', renderError);
      console.error('[IXORA] Stack:', renderError?.stack);
      console.error('[IXORA] ========================================');
      
      try {
        logger.error('Error renderizando app', { 
          error: renderError?.toString(), 
          stack: renderError?.stack 
        }, 'ROOT_RENDER');
      } catch (logErr) {
        console.error('[IXORA] Error en logger de error:', logErr);
      }
      
      // Intentar mostrar mensaje de error sin romper más
      try {
        rootElement.innerHTML = '<div style="padding: 20px; color: red; background: white; z-index: 9999;">Error al cargar la aplicación. Por favor, recarga la página.</div>';
      } catch (htmlErr) {
        console.error('[IXORA] Error al mostrar mensaje HTML:', htmlErr);
      }
    }
  } catch (initError) {
    console.error('[IXORA] ========================================');
    console.error('[IXORA] 🚨 ERROR EN INICIALIZACIÓN');
    console.error('[IXORA] ========================================');
    console.error('[IXORA] Error:', initError);
    console.error('[IXORA] Stack:', initError?.stack);
    console.error('[IXORA] ========================================');
    
    try {
      rootElement.innerHTML = '<div style="padding: 20px; color: red;">Error crítico al inicializar la aplicación.</div>';
    } catch (e) {
      console.error('[IXORA] Error crítico al mostrar mensaje:', e);
    }
  }
}
