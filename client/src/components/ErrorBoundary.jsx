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
    // Actualizar el estado para que la próxima renderización muestre la UI de fallback
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log del error con contexto completo
    logger.error('Error en componente React', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorInfo,
    }, 'ERROR_BOUNDARY');

    this.setState({
      error,
      errorInfo,
    });

    // Intentar guardar información crítica si hay sesión
    try {
      if (typeof localStorage !== 'undefined') {
        const token = localStorage.getItem('token');
        const user = localStorage.getItem('user');
        if (token || user) {
          logger.warn('Error capturado pero sesión existe en localStorage', {
            hasToken: !!token,
            hasUser: !!user,
          }, 'ERROR_BOUNDARY');
        }
      }
    } catch (e) {
      // Ignorar errores al guardar
    }
  }

  handleReload = () => {
    // Limpiar error y recargar
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleReset = () => {
    // Resetear estado sin recargar
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      // UI de fallback personalizada
      const isDev = process.env.NODE_ENV === 'development';
      const { error, errorInfo } = this.state;

      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          background: '#1a1a1a',
          color: '#fff',
          padding: '20px',
          textAlign: 'center',
        }}>
          <div style={{
            maxWidth: '600px',
            width: '100%',
            background: '#2a2a2a',
            borderRadius: '12px',
            padding: '30px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
            <h1 style={{ 
              fontSize: '24px', 
              marginBottom: '16px',
              color: '#ff6b6b'
            }}>
              Algo salió mal
            </h1>
            <p style={{ 
              fontSize: '16px', 
              marginBottom: '24px',
              color: '#ccc',
              lineHeight: '1.6'
            }}>
              La aplicación encontró un error, pero no se cerró completamente.
              Tu sesión debería estar guardada.
            </p>

            {isDev && error && (
              <details style={{
                marginBottom: '24px',
                textAlign: 'left',
                background: '#1a1a1a',
                padding: '16px',
                borderRadius: '8px',
                overflow: 'auto',
                maxHeight: '300px',
              }}>
                <summary style={{ 
                  cursor: 'pointer', 
                  marginBottom: '12px',
                  color: '#ffd93d',
                  fontWeight: 'bold'
                }}>
                  Detalles del error (solo en desarrollo)
                </summary>
                <pre style={{
                  color: '#ff6b6b',
                  fontSize: '12px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {error.toString()}
                  {errorInfo && errorInfo.componentStack && (
                    <div style={{ marginTop: '12px', color: '#888' }}>
                      {errorInfo.componentStack}
                    </div>
                  )}
                </pre>
              </details>
            )}

            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}>
              <button
                onClick={this.handleReload}
                style={{
                  background: '#4caf50',
                  color: '#fff',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '8px',
                  fontSize: '16px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'opacity 0.2s',
                }}
                onMouseOver={(e) => e.target.style.opacity = '0.8'}
                onMouseOut={(e) => e.target.style.opacity = '1'}
              >
                🔄 Recargar aplicación
              </button>
              {isDev && (
                <button
                  onClick={this.handleReset}
                  style={{
                    background: '#2196f3',
                    color: '#fff',
                    border: 'none',
                    padding: '12px 24px',
                    borderRadius: '8px',
                    fontSize: '16px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    transition: 'opacity 0.2s',
                  }}
                  onMouseOver={(e) => e.target.style.opacity = '0.8'}
                  onMouseOut={(e) => e.target.style.opacity = '1'}
                >
                  🔁 Intentar continuar
                </button>
              )}
            </div>

            <div style={{
              marginTop: '24px',
              padding: '12px',
              background: '#1a1a1a',
              borderRadius: '8px',
              fontSize: '14px',
              color: '#888',
            }}>
              💡 Si el problema persiste, contacta al administrador del sistema.
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
