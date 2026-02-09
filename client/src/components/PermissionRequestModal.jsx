import React, { useState } from 'react';
import useMediaPermissions from '../hooks/useMediaPermissions';

/**
 * Componente de ejemplo para solicitar y gestionar permisos de media
 * Demuestra cómo usar el hook useMediaPermissions
 */
const PermissionRequestModal = ({ onClose }) => {
  const {
    permissions,
    requestMicrophoneAccess,
    requestCameraAccess,
    requestMediaAccess
  } = useMediaPermissions();

  const [status, setStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleMicrophoneRequest = async () => {
    setStatus('Solicitando acceso al micrófono...');
    setErrorMsg('');
    const granted = await requestMicrophoneAccess();
    if (granted) {
      setStatus('✅ Acceso al micrófono otorgado');
    } else {
      setErrorMsg('❌ Acceso al micrófono denegado');
    }
  };

  const handleCameraRequest = async () => {
    setStatus('Solicitando acceso a la cámara...');
    setErrorMsg('');
    const granted = await requestCameraAccess();
    if (granted) {
      setStatus('✅ Acceso a la cámara otorgado');
    } else {
      setErrorMsg('❌ Acceso a la cámara denegado');
    }
  };

  const handleMediaRequest = async () => {
    setStatus('Solicitando acceso a micrófono y cámara...');
    setErrorMsg('');
    const granted = await requestMediaAccess();
    if (granted) {
      setStatus('✅ Acceso a periféricos otorgado');
    } else {
      setErrorMsg('❌ Acceso a periféricos denegado');
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2>🔐 Solicitar Permisos de Periféricos</h2>
        
        <div style={styles.content}>
          <p>Esta aplicación necesita acceso a tus periféricos para funcionar correctamente.</p>

          <div style={styles.permissionsStatus}>
            <h3>Estado de Permisos:</h3>
            <ul style={styles.list}>
              <li>
                🎤 Micrófono: 
                <span style={{
                  marginLeft: '10px',
                  color: permissions.microphone === true ? '#4CAF50' : 
                         permissions.microphone === false ? '#f44336' : '#FFC107'
                }}>
                  {permissions.microphone === true ? '✅ Permitido' :
                   permissions.microphone === false ? '❌ Denegado' : '⏳ Desconocido'}
                </span>
              </li>
              <li>
                📹 Cámara: 
                <span style={{
                  marginLeft: '10px',
                  color: permissions.camera === true ? '#4CAF50' : 
                         permissions.camera === false ? '#f44336' : '#FFC107'
                }}>
                  {permissions.camera === true ? '✅ Permitido' :
                   permissions.camera === false ? '❌ Denegado' : '⏳ Desconocido'}
                </span>
              </li>
            </ul>
          </div>

          <div style={styles.buttonsContainer}>
            <button
              onClick={handleMicrophoneRequest}
              disabled={permissions.loading}
              style={{...styles.button, ...styles.buttonPrimary}}
            >
              🎤 Solicitar Micrófono
            </button>

            <button
              onClick={handleCameraRequest}
              disabled={permissions.loading}
              style={{...styles.button, ...styles.buttonPrimary}}
            >
              📹 Solicitar Cámara
            </button>

            <button
              onClick={handleMediaRequest}
              disabled={permissions.loading}
              style={{...styles.button, ...styles.buttonSuccess}}
            >
              🎬 Solicitar Ambos
            </button>
          </div>

          {status && (
            <div style={{...styles.message, backgroundColor: '#E8F5E9', color: '#2E7D32'}}>
              {status}
            </div>
          )}

          {errorMsg && (
            <div style={{...styles.message, backgroundColor: '#FFEBEE', color: '#C62828'}}>
              {errorMsg}
            </div>
          )}

          {permissions.error && (
            <div style={{...styles.message, backgroundColor: '#FFEBEE', color: '#C62828'}}>
              ❌ Error: {permissions.error}
            </div>
          )}

          <div style={styles.info}>
            <h4>📋 Información:</h4>
            <p>
              • Los permisos se solicitan bajo demanda<br/>
              • Windows mostrará un diálogo de permiso la primera vez<br/>
              • Los permisos se guardan para usos futuros<br/>
              • Puedes cambiar los permisos en Configuración de Windows
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{...styles.button, ...styles.buttonSecondary}}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '30px',
    maxWidth: '500px',
    width: '90%',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
    maxHeight: '90vh',
    overflowY: 'auto'
  },
  content: {
    marginBottom: '20px'
  },
  permissionsStatus: {
    backgroundColor: '#F5F5F5',
    padding: '15px',
    borderRadius: '4px',
    marginBottom: '20px'
  },
  list: {
    listStyle: 'none',
    padding: 0,
    marginTop: '10px'
  },
  buttonsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '20px'
  },
  button: {
    padding: '12px 20px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
    transition: 'all 0.3s ease'
  },
  buttonPrimary: {
    backgroundColor: '#2196F3',
    color: 'white'
  },
  buttonSuccess: {
    backgroundColor: '#4CAF50',
    color: 'white'
  },
  buttonSecondary: {
    backgroundColor: '#757575',
    color: 'white',
    width: '100%'
  },
  message: {
    padding: '12px 15px',
    borderRadius: '4px',
    marginBottom: '15px',
    fontSize: '14px'
  },
  info: {
    backgroundColor: '#E3F2FD',
    padding: '15px',
    borderRadius: '4px',
    marginBottom: '15px',
    fontSize: '13px',
    color: '#1565C0'
  }
};

export default PermissionRequestModal;
