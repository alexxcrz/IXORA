import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import './IxoraIAWidget.css';

export default function IxoraIAWidget({ serverUrl, pushToast, contexto = {}, onClose }) {
  const { authFetch, perms } = useAuth();
  const can = (perm) => perms?.includes(perm);
  
  const [abierto, setAbierto] = useState(onClose ? true : false); // Si viene del menú, abrir automáticamente
  
  // Si viene del menú, abrir automáticamente
  useEffect(() => {
    if (onClose) {
      setAbierto(true);
    }
  }, [onClose]);
  const [mensajes, setMensajes] = useState([]);
  const [inputMensaje, setInputMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [modoVoz, setModoVoz] = useState(false);
  const mensajesRef = useRef(null);
  const inputRef = useRef(null);
  const reconocimientoRef = useRef(null);
  const streamRef = useRef(null);

  // Scroll automático
  useEffect(() => {
    if (mensajesRef.current && abierto) {
      mensajesRef.current.scrollTop = mensajesRef.current.scrollHeight;
    }
  }, [mensajes, abierto]);

  // Inicializar reconocimiento de voz solo cuando modoVoz está activo
  useEffect(() => {
    if (!abierto || !modoVoz) {
      // Detener reconocimiento si está activo
      if (reconocimientoRef.current) {
        try {
          reconocimientoRef.current.stop();
        } catch (e) {}
        reconocimientoRef.current = null;
      }
      // Detener y liberar el stream del micrófono
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach(track => track.stop());
        } catch (e) {}
        streamRef.current = null;
      }
      return;
    }
    
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'es-ES';
      recognition.continuous = true;
      recognition.interimResults = false;
      
      recognition.onresult = (event) => {
        let textoCompleto = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            textoCompleto += event.results[i][0].transcript;
          }
        }
        
        if (textoCompleto.trim()) {
          const textoLower = textoCompleto.toLowerCase().trim();
          if (/ixora|ixora\s|ixora,|ixora[.!?]/i.test(textoLower)) {
            const match = textoCompleto.match(/ixora\s*[,:.!?\s]*\s*(.+)/i);
            const comando = match ? match[1].trim() : textoCompleto.replace(/ixora\s*/i, '').trim();
            
            if (comando && comando.length > 1) {
              setInputMensaje(comando);
              enviarMensaje(comando, true);
            } else {
              agregarMensaje('IXORA', 'user');
              agregarMensaje('¡Hola! 👋 Estoy aquí y escuchando. ¿En qué puedo ayudarte? 😊', 'bot');
            }
          } else if (textoLower.length > 2) {
            setInputMensaje(textoCompleto);
            enviarMensaje(textoCompleto, true);
          }
        }
      };
      
      recognition.onend = () => {
        // Solo reiniciar si modoVoz sigue activo y el widget está abierto
        if (abierto && modoVoz && reconocimientoRef.current) {
          setTimeout(() => {
            try {
              recognition.start();
            } catch (e) {}
          }, 100);
        }
      };
      
      reconocimientoRef.current = recognition;
      
      // Solicitar permiso de micrófono explícitamente y empezar reconocimiento
      const solicitarPermisoMicrofono = async () => {
        // Detectar si estamos en Android nativo usando Capacitor
        const isNativeAndroid = typeof window !== 'undefined' && 
          window.Capacitor && 
          window.Capacitor.isNativePlatform && 
          window.Capacitor.isNativePlatform() &&
          window.Capacitor.getPlatform() === 'android';

        console.log('🔍 Detectando plataforma:', {
          isNativeAndroid,
          hasCapacitor: !!window.Capacitor,
          platform: window.Capacitor?.getPlatform(),
          isNative: window.Capacitor?.isNativePlatform?.()
        });

        // Si estamos en Android nativo, el permiso se solicitará automáticamente con getUserMedia
        // Android mostrará el diálogo nativo de permisos cuando se llame a getUserMedia
        if (isNativeAndroid) {
          console.log('📱 Detectado Android nativo - getUserMedia solicitará permiso automáticamente');
        }

        // Verificar soporte de getUserMedia
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          pushToast?.('❌ Tu dispositivo no soporta acceso al micrófono', 'err');
          setModoVoz(false);
          return;
        }

        try {
          // Solicitar acceso al micrófono (esto funcionará después de que Capacitor haya concedido el permiso)
          console.log('🎤 Solicitando acceso al micrófono...');
          const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            } 
          });
          
          console.log('✅ Acceso al micrófono concedido');
          streamRef.current = stream;
          
          setTimeout(() => {
            try {
              recognition.start();
              console.log('🎙️ Reconocimiento de voz iniciado');
            } catch (e) {
              console.error('❌ Error iniciando reconocimiento:', e);
            }
          }, 100);
        } catch (mediaError) {
          console.error('❌ Error accediendo al micrófono:', mediaError);
          setModoVoz(false);
          
          if (mediaError.name === 'NotAllowedError' || mediaError.name === 'PermissionDeniedError') {
            if (isNativeAndroid) {
              pushToast?.('❌ Permiso denegado. Ve a Configuración > Aplicaciones > IXORA > Permisos > Micrófono', 'err');
            } else {
              pushToast?.('❌ Permiso de micrófono denegado. Permite el acceso en la configuración de la aplicación', 'err');
            }
          } else if (mediaError.name === 'NotFoundError' || mediaError.name === 'DevicesNotFoundError') {
            pushToast?.('❌ No se encontró ningún micrófono. Verifica que esté conectado', 'err');
          } else if (mediaError.name === 'NotReadableError' || mediaError.name === 'TrackStartError') {
            pushToast?.('❌ El micrófono está siendo usado por otra aplicación', 'err');
          } else {
            pushToast?.('❌ No se pudo acceder al micrófono. Verifica los permisos', 'err');
          }
        }
      };

      solicitarPermisoMicrofono();
    }
    
    return () => {
      if (reconocimientoRef.current) {
        try {
          reconocimientoRef.current.stop();
        } catch (e) {}
        reconocimientoRef.current = null;
      }
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach(track => track.stop());
        } catch (e) {}
        streamRef.current = null;
      }
    };
  }, [abierto, modoVoz]);

  const agregarMensaje = (texto, tipo) => {
    const nuevoMensaje = {
      id: Date.now(),
      tipo,
      texto,
      timestamp: new Date()
    };
    setMensajes(prev => [...prev, nuevoMensaje]);
    return nuevoMensaje.id;
  };

  const enviarMensaje = async (texto = null, desdeVoz = false) => {
    const mensaje = texto || inputMensaje.trim();
    if (!mensaje) return;
    
    setEnviando(true);
    agregarMensaje(mensaje, 'user');
    if (!texto) setInputMensaje('');
    
    try {
      const response = await authFetch(`${serverUrl}/api/ixora-ia/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          comando: mensaje,
          contexto: {
            ...contexto,
            usuario_id: 'current'
          }
        })
      });
      
      if (response.exito) {
        agregarMensaje(response.mensaje, 'bot');
        
        // Si hay datos de reporte profesional, generarlo
        if (response.datos && response.datos.tipo === 'reporte_profesional') {
          try {
            const { getEncryptedItem } = await import('../utils/encryptedStorage');
            const token = await getEncryptedItem('token');
            const reporteResponse = await fetch(`${serverUrl}${response.datos.endpoint}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                pestaña: response.datos.pestaña,
                fecha: response.datos.fecha,
                mes: response.datos.mes,
                tipo_periodo: response.datos.tipo_periodo,
                formato: response.datos.formato || 'excel'
              })
            });
            
            if (reporteResponse.ok) {
              const blob = await reporteResponse.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              const extension = response.datos.formato === 'texto' ? 'txt' : 'xlsx';
              a.download = `Reporte_Profesional_${response.datos.pestaña}_${response.datos.fecha || response.datos.mes || 'hoy'}.${extension}`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              window.URL.revokeObjectURL(url);
              pushToast?.('✅ Reporte profesional generado y descargado', 'ok');
            } else {
              throw new Error('Error al generar el reporte');
            }
          } catch (err) {
            console.error('Error generando reporte profesional:', err);
            pushToast?.('❌ Error al generar el reporte profesional', 'err');
          }
        }
        // Si hay datos de reporte normal, descargarlo automáticamente
        else if (response.datos && response.datos.tipo === 'reporte' && response.datos.url) {
          window.open(response.datos.url, '_blank');
          pushToast?.('✅ Reporte generado y descargado', 'ok');
        }
        
        if (desdeVoz || modoVoz) {
          hablar(response.mensaje);
        }
      } else {
        agregarMensaje(response.mensaje || 'Lo siento, hubo un error.', 'bot');
      }
    } catch (err) {
      console.error('Error enviando mensaje:', err);
      agregarMensaje('Lo siento, hubo un error al procesar tu mensaje.', 'bot');
    } finally {
      setEnviando(false);
    }
  };

  const hablar = async (texto) => {
    if (!texto || !texto.trim()) return;
    
    // PRIORIDAD 1: Usar ElevenLabs con voz personalizada
    try {
      const response = await authFetch(`${serverUrl}/api/ixora-ia/voice/text-to-speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ texto })
      });

      if (response instanceof Blob || response instanceof ArrayBuffer) {
        const audioBlob = response instanceof Blob ? response : new Blob([response], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
        };
        
        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          hablarFallback(texto);
        };
        
        audio.play();
        return;
      }
    } catch (error) {
      console.log('ElevenLabs no disponible, usando fallback:', error);
    }
    
    // FALLBACK: Usar speechSynthesis del navegador
    hablarFallback(texto);
  };

  const hablarFallback = (texto) => {
    if (!('speechSynthesis' in window)) return;
    
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(texto);
    utterance.lang = 'es-ES';
    utterance.rate = 0.65;
    utterance.pitch = 2.0;
    utterance.volume = 0.95;
    
    const voces = speechSynthesis.getVoices();
    const vozFemenina = voces.find(voz => {
      const nombre = voz.name.toLowerCase();
      return voz.lang.startsWith('es') && 
             (nombre.includes('sabina') || nombre.includes('helena') || 
              nombre.includes('zira') || nombre.includes('maria') ||
              (!nombre.includes('diego') && !nombre.includes('pablo')));
    });
    
    if (vozFemenina) utterance.voice = vozFemenina;
    speechSynthesis.speak(utterance);
  };

  const toggleModoVoz = () => {
    setModoVoz(!modoVoz);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviarMensaje();
    }
  };

  // Si no tiene permiso, no mostrar el widget
  if (!can("tab:ixora_ia")) {
    return null;
  }

  // Si viene desde el menú inferior, siempre mostrar el contenedor cuando está abierto
  if (onClose && !abierto) {
    return null;
  }

  // Si no viene desde el menú inferior y no está abierto, no mostrar nada (botón está oculto)
  if (!onClose && !abierto) {
    return null;
  }

  return (
    <div className="ixora-ia-widget-container">
      <div className="ixora-ia-widget-header">
        <div className="ixora-ia-widget-title">
          <span className="ixora-ia-widget-icon">✨</span>
          <span>IXORA IA</span>
        </div>
        <div className="ixora-ia-widget-actions">
          <button 
            className={`ixora-ia-widget-btn-voice ${modoVoz ? 'active' : ''}`}
            onClick={toggleModoVoz}
            title={modoVoz ? "Desactivar modo voz" : "Activar modo voz"}
          >
            🎤
          </button>
          <button 
            className="ixora-ia-widget-btn-close"
            onClick={() => {
              setAbierto(false);
              setMensajes([]);
              if (onClose) {
                onClose();
              }
            }}
            title="Cerrar"
          >
            ✕
          </button>
        </div>
      </div>
      
      <div className="ixora-ia-widget-messages" ref={mensajesRef}>
        {mensajes.length === 0 ? (
          <div className="ixora-ia-widget-empty">
            <p>¡Hola! 👋 ¿En qué puedo ayudarte?</p>
          </div>
        ) : (
          mensajes.map((msg) => (
            <div key={msg.id} className={`ixora-ia-widget-message ${msg.tipo === 'user' ? 'user' : 'bot'}`}>
              <div className="ixora-ia-widget-message-avatar">
                {msg.tipo === 'user' ? '👤' : '🤖'}
              </div>
              <div className="ixora-ia-widget-message-content">
                <div className="ixora-ia-widget-message-text">{msg.texto}</div>
                <div className="ixora-ia-widget-message-time">
                  {msg.timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))
        )}
        {enviando && (
          <div className="ixora-ia-widget-message bot">
            <div className="ixora-ia-widget-message-avatar">🤖</div>
            <div className="ixora-ia-widget-message-content">
              <div className="ixora-ia-widget-message-text">...</div>
            </div>
          </div>
        )}
      </div>
      
      <div className="ixora-ia-widget-input-container">
        <input
          ref={inputRef}
          type="text"
          className="ixora-ia-widget-input"
          placeholder="Escribe tu mensaje o di 'IXORA'..."
          value={inputMensaje}
          onChange={(e) => setInputMensaje(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={enviando}
        />
        <button 
          className="ixora-ia-widget-btn-send"
          onClick={() => enviarMensaje()}
          disabled={enviando || !inputMensaje.trim()}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
