import { useState, useCallback, useEffect } from 'react';

/**
 * Hook personalizado para solicitar y gestionar permisos de media (micrófono, cámara)
 * Compatible con Electron y navegadores web
 */
export const useMediaPermissions = () => {
  const [permissions, setPermissions] = useState({
    microphone: null,
    camera: null,
    loading: false,
    error: null
  });

  // Solicitar acceso al micrófono
  const requestMicrophoneAccess = useCallback(async () => {
    setPermissions(prev => ({ ...prev, loading: true, error: null }));
    try {
      // Intentar solicitar acceso a través de Electron si está disponible
      if (window.electronAPI?.requestMicrophoneAccess) {
        const granted = await window.electronAPI.requestMicrophoneAccess();
        setPermissions(prev => ({
          ...prev,
          microphone: granted,
          loading: false
        }));
        return granted;
      }

      // Fallback: solicitud estándar de navegador
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setPermissions(prev => ({
        ...prev,
        microphone: true,
        loading: false
      }));
      return true;
    } catch (error) {
      console.error('❌ Error al solicitar acceso al micrófono:', error);
      setPermissions(prev => ({
        ...prev,
        microphone: false,
        error: error.message || 'Error al acceder al micrófono',
        loading: false
      }));
      return false;
    }
  }, []);

  // Solicitar acceso a la cámara
  const requestCameraAccess = useCallback(async () => {
    setPermissions(prev => ({ ...prev, loading: true, error: null }));
    try {
      // Intentar solicitar acceso a través de Electron si está disponible
      if (window.electronAPI?.requestCameraAccess) {
        const granted = await window.electronAPI.requestCameraAccess();
        setPermissions(prev => ({
          ...prev,
          camera: granted,
          loading: false
        }));
        return granted;
      }

      // Fallback: solicitud estándar de navegador
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      setPermissions(prev => ({
        ...prev,
        camera: true,
        loading: false
      }));
      return true;
    } catch (error) {
      console.error('❌ Error al solicitar acceso a la cámara:', error);
      setPermissions(prev => ({
        ...prev,
        camera: false,
        error: error.message || 'Error al acceder a la cámara',
        loading: false
      }));
      return false;
    }
  }, []);

  // Solicitar acceso a micrófono y cámara
  const requestMediaAccess = useCallback(async () => {
    setPermissions(prev => ({ ...prev, loading: true, error: null }));
    try {
      // Intentar solicitar acceso a través de Electron si está disponible
      if (window.electronAPI?.requestMediaAccess) {
        const granted = await window.electronAPI.requestMediaAccess();
        setPermissions(prev => ({
          ...prev,
          microphone: granted,
          camera: granted,
          loading: false
        }));
        return granted;
      }

      // Fallback: solicitud estándar de navegador
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });
      stream.getTracks().forEach(track => track.stop());
      setPermissions(prev => ({
        ...prev,
        microphone: true,
        camera: true,
        loading: false
      }));
      return true;
    } catch (error) {
      console.error('❌ Error al solicitar acceso a periféricos:', error);
      setPermissions(prev => ({
        ...prev,
        microphone: false,
        camera: false,
        error: error.message || 'Error al acceder a periféricos',
        loading: false
      }));
      return false;
    }
  }, []);

  // Verificar permisos actuales
  const checkPermissions = useCallback(async () => {
    try {
      if (window.electronAPI?.checkPermissions) {
        const perms = await window.electronAPI.checkPermissions();
        setPermissions(prev => ({
          ...prev,
          ...perms
        }));
        return perms;
      }
    } catch (error) {
      console.error('❌ Error al verificar permisos:', error);
    }
  }, []);

  // Verificar permisos al montar el componente
  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  return {
    permissions,
    requestMicrophoneAccess,
    requestCameraAccess,
    requestMediaAccess,
    checkPermissions
  };
};

export default useMediaPermissions;
