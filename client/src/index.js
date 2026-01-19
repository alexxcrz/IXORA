import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { cargarTema } from "./utils/temas";
import { applySystemDarkMode } from "./utils/darkMode";

// PROTECCIÓN: Manejador global de errores para evitar crashes
window.addEventListener('error', (event) => {
  console.error('❌ Error global capturado:', event.error);
  console.error('❌ Stack trace:', event.error?.stack);
  console.error('❌ URL:', event.filename);
  console.error('❌ Línea:', event.lineno);
  // Prevenir que el error cierre la app
  event.preventDefault();
  return true;
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('❌ Promise rechazada no manejada:', event.reason);
  console.error('❌ Stack trace:', event.reason?.stack);
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
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error) {
    console.error('❌ Error renderizando app:', error);
    rootElement.innerHTML = '<div style="padding: 20px; color: red;">Error al cargar la aplicación. Por favor, recarga la página.</div>';
  }
}
