import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { cargarTema } from "./utils/temas";
import { applySystemDarkMode } from "./utils/darkMode";
import ErrorBoundary from "./components/ErrorBoundary";
import logger from "./utils/logger";

// PROTECCIÓN: Manejador global de errores para evitar crashes
window.addEventListener('error', (event) => {
  logger.error('Error global capturado', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
    stack: event.error?.stack,
  }, 'GLOBAL_ERROR');
  
  // Prevenir que el error cierre la app
  event.preventDefault();
  return true;
});

window.addEventListener('unhandledrejection', (event) => {
  logger.error('Promise rechazada no manejada', {
    reason: event.reason,
    stack: event.reason?.stack,
    message: event.reason?.message,
  }, 'GLOBAL_ERROR');
  
  // Prevenir que el error cierre la app
  event.preventDefault();
});

// PROTECCIÓN: Logging para Android - detectar cuando la app se está cerrando
if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform()) {
  console.log('📱 [ANDROID] App iniciada en modo nativo');
  
  // Detectar si la app se está cerrando
  window.addEventListener('beforeunload', () => {
    console.log('⚠️ [ANDROID] App se está cerrando (beforeunload)');
  });
  
  window.addEventListener('unload', () => {
    console.log('⚠️ [ANDROID] App se está descargando (unload)');
  });
}

// Aplicar modo oscuro del sistema INMEDIATAMENTE antes de que React renderice
try {
  applySystemDarkMode();
} catch (error) {
  console.warn('Error aplicando modo oscuro:', error);
}

// Aplicar tema INMEDIATAMENTE antes de que React renderice
// Esto evita el flash de colores por defecto y conflictos
try {
  cargarTema();
} catch (error) {
  console.warn('Error cargando tema:', error);
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  console.error('❌ No se encontró el elemento root');
  document.body.innerHTML = '<div style="padding: 20px; color: red;">Error: No se encontró el elemento root</div>';
} else {
  const root = ReactDOM.createRoot(rootElement);
  
  try {
    logger.info('Iniciando aplicación React');
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    );
    logger.info('Aplicación React renderizada correctamente');
  } catch (error) {
    logger.error('Error renderizando app', { error, stack: error.stack }, 'ROOT_RENDER');
    rootElement.innerHTML = '<div style="padding: 20px; color: red;">Error al cargar la aplicación. Por favor, recarga la página.</div>';
  }
}
