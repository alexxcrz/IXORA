import React from 'react';
import logger from '../utils/logger';

/**
 * Error Boundary para capturar errores de renderizado de React
 * Previene que la app se cierre completamente por errores
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null 
    };
  }

  static getDerivedStateFromError(error) {
    // NO mostrar el modal automáticamente - solo loguear el error
    // Retornar null para no actualizar el estado y evitar mostrar el modal
    // El error se manejará en componentDidCatch donde solo se loguea
    return null; // No actualizar el estado - no mostrar el modal
  }

  componentDidCatch(error, errorInfo) {
    try {
      // Logging MUY DETALLADO visible en adb logcat
      console.error('[IXORA_ERROR_BOUNDARY] ========================================');
      console.error('[IXORA_ERROR_BOUNDARY] 🚨 ERROR CAPTURADO POR ERROR BOUNDARY');
      console.error('[IXORA_ERROR_BOUNDARY] ========================================');
      console.error('[IXORA_ERROR_BOUNDARY] Error Message:', error?.message || 'No message');
      console.error('[IXORA_ERROR_BOUNDARY] Error Name:', error?.name || 'No name');
      console.error('[IXORA_ERROR_BOUNDARY] Error Stack:', error?.stack || 'No stack');
      console.error('[IXORA_ERROR_BOUNDARY] Component Stack:', errorInfo?.componentStack || 'No component stack');
      console.error('[IXORA_ERROR_BOUNDARY] Full Error:', JSON.stringify({
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
        componentStack: errorInfo?.componentStack,
      }, null, 2));
      console.error('[IXORA_ERROR_BOUNDARY] ========================================');
      
      // También usar logger si está disponible
      try {
        logger.error('Error en componente React', {
          error: error?.message || error?.toString(),
          name: error?.name,
          stack: error?.stack,
          componentStack: errorInfo?.componentStack,
          errorInfo: errorInfo?.toString(),
        }, 'ERROR_BOUNDARY');
      } catch (logErr) {
        console.error('[IXORA_ERROR_BOUNDARY] Error en logger:', logErr);
      }

      // Intentar guardar información crítica si hay sesión
      try {
        if (typeof localStorage !== 'undefined') {
          const token = localStorage.getItem('token');
          const user = localStorage.getItem('user');
          if (token || user) {
            console.log('[IXORA_ERROR_BOUNDARY] Sesión existe, token:', !!token, 'user:', !!user);
            try {
              logger.warn('Error capturado pero sesión existe en localStorage', {
                hasToken: !!token,
                hasUser: !!user,
              }, 'ERROR_BOUNDARY');
            } catch (e) {}
          }
        }
      } catch (e) {
        console.error('[IXORA_ERROR_BOUNDARY] Error al leer localStorage:', e);
      }

      // NO actualizar el estado para evitar re-renders que puedan causar más errores
      // Solo loguear el error y continuar
      // En producción, la app continuará funcionando sin mostrar el modal
      
    } catch (catchError) {
      // Si incluso el error handler falla, intentar loguear
      console.error('[IXORA_ERROR_BOUNDARY] ERROR EN ERROR HANDLER:', catchError);
      console.error('[IXORA_ERROR_BOUNDARY] Stack:', catchError?.stack);
    }
    
    // NO actualizar el estado para evitar crashes
    // La app continuará funcionando sin interrupciones
  }

  handleReload = () => {
    // Limpiar error y recargar
    this.setState({ hasError: false, error: null, errorInfo: null });
    
    // Recargar la página
    window.location.reload();
  };

  handleReset = () => {
    // Resetear estado sin recargar
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    // PROTECCIÓN MÁXIMA: NO mostrar el modal de error nunca
    // Los errores se loguean en consola pero la app continúa funcionando
    // Esto evita interrumpir la experiencia del usuario
    
    try {
      // Si hay un error en el estado, solo loguearlo pero NO mostrar UI
      if (this.state.hasError && this.state.error) {
        console.warn('[IXORA_ERROR_BOUNDARY] Error en estado pero continuando...');
        console.warn('[IXORA_ERROR_BOUNDARY] Error:', this.state.error?.message || this.state.error);
        
        // NO resetear el estado con setTimeout porque puede causar más problemas
        // Solo continuar renderizando normalmente
      }

      // SIEMPRE renderizar los children - NUNCA mostrar el modal
      // Si hay un error en el render, se capturará nuevamente por componentDidCatch
      return this.props.children || null;
      
    } catch (renderError) {
      // Si incluso el render falla, intentar loguear y retornar null
      console.error('[IXORA_ERROR_BOUNDARY] ERROR EN RENDER:', renderError);
      console.error('[IXORA_ERROR_BOUNDARY] Stack:', renderError?.stack);
      
      // Retornar null para evitar crashes, pero esto debería ser último recurso
      return null;
    }
  }
}

export default ErrorBoundary;
