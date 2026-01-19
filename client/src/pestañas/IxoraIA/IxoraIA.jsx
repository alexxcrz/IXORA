import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../AuthContext';
import './IxoraIA.css';

export default function IxoraIA({ serverUrl, pushToast }) {
  const { authFetch } = useAuth();
  
  // Estados principales
  const [mensajes, setMensajes] = useState([
    {
      id: 1,
      tipo: 'bot',
      texto: '¡Hola! 👋 Soy IXORA, tu asistente inteligente. Estoy aquí para ayudarte en lo que necesites. ¿En qué puedo asistirte hoy?',
      timestamp: new Date()
    }
  ]);
  const [inputMensaje, setInputMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [vistaActiva, setVistaActiva] = useState('chats');
  const [chatsGuardados] = useState([]);
  
  // Estados para reconocimiento de voz
  const [reconocimientoActivo, setReconocimientoActivo] = useState(false);
  const reconocimientoRef = useRef(null);
  const esperandoIxoraRef = useRef(true); // Solo escuchar "IXORA" inicialmente
  const [modoVoz, setModoVoz] = useState(false);
  
  // Estados para voz personalizada
  const [grabando, setGrabando] = useState(false);
  const [configuracionVoz, setConfiguracionVoz] = useState(null);
  const [vocesDisponibles, setVocesDisponibles] = useState([]);
  const [cargandoVoz, setCargandoVoz] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  
  // Estados para reconocimiento de productos
  const [mostrarCamara, setMostrarCamara] = useState(false);
  const [streamCamara, setStreamCamara] = useState(null);
  const [reconociendo, setReconociendo] = useState(false);
  const [resultadoReconocimiento, setResultadoReconocimiento] = useState(null);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  
  // Referencias
  const mensajesRef = useRef(null);
  const inputRef = useRef(null);

  // Scroll automático al final
  useEffect(() => {
    if (mensajesRef.current) {
      mensajesRef.current.scrollTop = mensajesRef.current.scrollHeight;
    }
  }, [mensajes]);

  // Inicializar reconocimiento de voz - Solo se activa cuando se dice "IXORA"
  useEffect(() => {
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
          
          // Si estamos esperando "IXORA", solo procesar si contiene "ixora"
          if (esperandoIxoraRef.current) {
            if (/ixora/i.test(textoLower)) {
              // Se detectó "IXORA", ahora activar modo voz y escuchar el comando
              esperandoIxoraRef.current = false;
              setModoVoz(true);
              
              // Extraer el comando después de "IXORA"
              const match = textoCompleto.match(/ixora\s*[,:.[!?\s]*\s*(.+)/i);
              const comando = match ? match[1].trim() : textoCompleto.replace(/ixora\s*/i, '').trim();
              
              if (comando && comando.length > 1) {
                // Hay un comando después de "IXORA", procesarlo
                setInputMensaje(comando);
                enviarMensaje(comando, true);
                // Después de procesar, volver a esperar "IXORA"
                setTimeout(() => {
                  esperandoIxoraRef.current = true;
                  setModoVoz(false);
                }, 2000);
              } else {
                // Solo se dijo "IXORA", activar modo voz y esperar siguiente comando
                agregarMensaje('IXORA', 'user');
                agregarMensaje('¡Hola! 👋 Estoy escuchando. ¿En qué puedo ayudarte? 😊', 'bot');
                // Esperar el siguiente comando (ya no esperamos "IXORA")
                esperandoIxoraRef.current = false;
              }
            }
            // Si no contiene "IXORA", ignorar
          } else {
            // Ya se activó con "IXORA", procesar el comando
            if (textoLower.length > 2) {
              setInputMensaje(textoCompleto);
              enviarMensaje(textoCompleto, true);
              // Después de procesar, volver a esperar "IXORA"
              setTimeout(() => {
                esperandoIxoraRef.current = true;
                setModoVoz(false);
              }, 2000);
            }
          }
        }
      };
      
      recognition.onerror = (event) => {
        if (event.error === 'not-allowed') {
          console.error('Permiso de micrófono denegado');
          setReconocimientoActivo(false);
        } else if (event.error === 'no-speech') {
          // No es un error crítico, solo no hay habla
          return;
        }
      };
      
      recognition.onend = () => {
        // Solo reiniciar si está activo y estamos esperando "IXORA"
        if (reconocimientoActivo && esperandoIxoraRef.current) {
          setTimeout(() => {
            try {
              recognition.start();
            } catch (e) {
              console.error('Error reiniciando reconocimiento:', e);
            }
          }, 100);
        }
      };
      
      reconocimientoRef.current = recognition;
      
      // Solicitar permiso de micrófono pero NO iniciar reconocimiento automáticamente
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(() => {
            // Solo marcar como disponible, pero no iniciar hasta que se diga "IXORA"
            setReconocimientoActivo(true);
            // Iniciar reconocimiento para escuchar "IXORA"
            setTimeout(() => {
              try {
                recognition.start();
              } catch (e) {
                console.error('Error iniciando reconocimiento:', e);
              }
            }, 1000);
          })
          .catch(() => {
            console.log('Permiso de micrófono necesario');
            setReconocimientoActivo(false);
          });
      }
    }
    
    return () => {
      if (reconocimientoRef.current) {
        reconocimientoRef.current.stop();
      }
    };
  }, []);

  const agregarMensaje = (texto, tipo, imagen = null) => {
    const nuevoMensaje = {
      id: Date.now(),
      tipo,
      texto,
      timestamp: new Date(),
      imagen: imagen || null
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
          contexto: {}
        })
      });
      
      if (response.exito) {
        // Si hay imagen, mostrarla junto con el mensaje
        if (response.datos && response.datos.tipo === 'imagen' && response.datos.archivo_base64) {
          agregarMensaje(response.mensaje, 'bot', response.datos.archivo_base64);
        } else {
          agregarMensaje(response.mensaje, 'bot');
        }
        
        // Hablar si viene de voz
        if (desdeVoz || modoVoz) {
          hablar(response.mensaje);
        }
      } else {
        agregarMensaje(response.mensaje || 'Lo siento, hubo un error al procesar tu mensaje.', 'bot');
      }
    } catch (err) {
      console.error('Error enviando mensaje:', err);
      agregarMensaje('Lo siento, hubo un error al procesar tu mensaje. Por favor intenta de nuevo.', 'bot');
    } finally {
      setEnviando(false);
    }
  };

  // Cargar configuración de voz al montar
  useEffect(() => {
    cargarConfiguracionVoz();
    cargarVocesDisponibles();
  }, []);

  const cargarConfiguracionVoz = async () => {
    try {
      const data = await authFetch(`${serverUrl}/api/ixora-ia/voice/config`);
      if (data.exito && data.tieneVozPersonalizada) {
        setConfiguracionVoz(data.datos);
      }
    } catch (error) {
      console.error('Error cargando configuración de voz:', error);
    }
  };

  const cargarVocesDisponibles = async () => {
    try {
      const data = await authFetch(`${serverUrl}/api/ixora-ia/voice/list`);
      if (data.exito) {
        setVocesDisponibles(data.datos || []);
      }
    } catch (error) {
      console.error('Error cargando voces:', error);
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
        // Si la respuesta es audio
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
    
    // Buscar voz femenina
    const voces = speechSynthesis.getVoices();
    const vozFemenina = voces.find(voz => {
      const nombre = voz.name.toLowerCase();
      return voz.lang.startsWith('es') && 
             ((nombre.includes('sabina') || nombre.includes('helena') || 
              nombre.includes('zira') || nombre.includes('maria')) ||
              (!nombre.includes('diego') && !nombre.includes('pablo')));
    });
    
    if (vozFemenina) {
      utterance.voice = vozFemenina;
    }
    
    speechSynthesis.speak(utterance);
  };

  // Funciones para grabar voz
  const iniciarGrabacion = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await subirVoz(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setGrabando(true);
    } catch (error) {
      console.error('Error iniciando grabación:', error);
      pushToast('Error al acceder al micrófono', 'err');
    }
  };

  const detenerGrabacion = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setGrabando(false);
    }
  };

  const subirVoz = async (audioBlob) => {
    setCargandoVoz(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'voz-personalizada.webm');
      formData.append('voiceName', `Voz personalizada - ${new Date().toLocaleDateString()}`);

      const data = await authFetch(`${serverUrl}/api/ixora-ia/voice/upload`, {
        method: 'POST',
        body: formData
      });

      if (data.exito) {
        pushToast('✅ Voz personalizada creada exitosamente', 'ok');
        await cargarConfiguracionVoz();
      } else {
        pushToast(`❌ ${data.mensaje || 'Error al crear voz'}`, 'err');
      }
    } catch (error) {
      console.error('Error subiendo voz:', error);
      pushToast('Error al subir voz personalizada', 'err');
    } finally {
      setCargandoVoz(false);
    }
  };

  const seleccionarVozPredefinida = async (voiceId, voiceName) => {
    setCargandoVoz(true);
    try {
      const data = await authFetch(`${serverUrl}/api/ixora-ia/voice/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ voiceId, voiceName })
      });

      if (data.exito) {
        pushToast('✅ Voz actualizada exitosamente', 'ok');
        await cargarConfiguracionVoz();
      } else {
        pushToast(`❌ ${data.mensaje || 'Error al actualizar voz'}`, 'err');
      }
    } catch (error) {
      console.error('Error seleccionando voz:', error);
      pushToast('Error al seleccionar voz', 'err');
    } finally {
      setCargandoVoz(false);
    }
  };

  const eliminarVozPersonalizada = async () => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar tu voz personalizada?')) {
      return;
    }

    setCargandoVoz(true);
    try {
      const data = await authFetch(`${serverUrl}/api/ixora-ia/voice/config`, {
        method: 'DELETE'
      });

      if (data.exito) {
        pushToast('✅ Voz personalizada eliminada', 'ok');
        setConfiguracionVoz(null);
      } else {
        pushToast(`❌ ${data.mensaje || 'Error al eliminar voz'}`, 'err');
      }
    } catch (error) {
      console.error('Error eliminando voz:', error);
      pushToast('Error al eliminar voz', 'err');
    } finally {
      setCargandoVoz(false);
    }
  };

  const toggleModoVoz = () => {
    setModoVoz(!modoVoz);
    if (!modoVoz) {
      agregarMensaje('Modo voz activado. Puedes hablar conmigo ahora. 😊', 'bot');
      hablar('Modo voz activado. Puedes hablar conmigo ahora.');
    } else {
      agregarMensaje('Modo voz desactivado. Puedes activarlo de nuevo cuando quieras. 😊', 'bot');
    }
  };

  const crearNuevoChat = () => {
    setMensajes([
      {
        id: 1,
        tipo: 'bot',
        texto: '¡Hola! 👋 Soy IXORA, tu asistente inteligente. Estoy aquí para ayudarte en lo que necesites. ¿En qué puedo asistirte hoy?',
        timestamp: new Date()
      }
    ]);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviarMensaje();
    }
  };

  // Funciones para cámara y reconocimiento de productos
  const iniciarCamara = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment', // Cámara trasera en móviles
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      setStreamCamara(stream);
      setMostrarCamara(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Error accediendo a la cámara:', error);
      pushToast('Error al acceder a la cámara. Verifica los permisos.', 'err');
    }
  };

  const detenerCamara = () => {
    if (streamCamara) {
      streamCamara.getTracks().forEach(track => track.stop());
      setStreamCamara(null);
    }
    setMostrarCamara(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const capturarFoto = () => {
    if (!videoRef.current) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0);
    
    const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);
    // Usar la pregunta del input si existe
    const pregunta = inputMensaje.trim() || null;
    reconocerProducto(imageBase64, pregunta);
    detenerCamara();
  };

  const manejarArchivoSeleccionado = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      pushToast('Por favor selecciona una imagen', 'err');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      reconocerProducto(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const reconocerProducto = async (imageBase64, pregunta = null) => {
    setReconociendo(true);
    setResultadoReconocimiento(null);
    
    try {
      // Si hay un mensaje en el input que parece una pregunta sobre la imagen, usarlo
      const preguntaContexto = pregunta || inputMensaje.trim() || null;
      
      const data = await authFetch(`${serverUrl}/api/ixora-ia/analizar-imagen`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          imageBase64,
          pregunta: preguntaContexto,
          contexto: preguntaContexto?.toLowerCase().includes('producto') ? 'producto' : 'general'
        })
      });

      if (data.exito) {
        setResultadoReconocimiento(data);
        
        // Agregar mensaje al chat con los resultados según el tipo
        let mensajeResultado = '';
        
        if (data.tipo === 'productos' && data.productos && data.productos.length > 0) {
          mensajeResultado = `📸 **Reconocimiento de productos:**\n\n`;
          data.productos.forEach((prod, idx) => {
            mensajeResultado += `**Producto ${idx + 1}:**\n`;
            if (prod.codigo) {
              mensajeResultado += `✅ Código: ${prod.codigo}\n`;
              mensajeResultado += `📦 Nombre: ${prod.nombre}\n`;
              if (prod.presentacion) mensajeResultado += `💊 Presentación: ${prod.presentacion}\n`;
              if (prod.lote) mensajeResultado += `🏷️ Lote: ${prod.lote}\n`;
              if (prod.cantidad) mensajeResultado += `🔢 Cantidad: ${prod.cantidad}\n`;
            } else {
              mensajeResultado += `⚠️ Detectado: "${prod.nombre}"\n`;
              mensajeResultado += `❌ No se encontró en el inventario\n`;
            }
            mensajeResultado += `\n`;
          });
        } else if (data.tipo === 'general') {
          mensajeResultado = `📸 **Análisis de imagen:**\n\n`;
          mensajeResultado += `${data.descripcion || data.mensaje || 'Imagen analizada'}\n\n`;
          
          if (data.elementosDetectados && data.elementosDetectados.length > 0) {
            mensajeResultado += `**Elementos detectados:**\n`;
            data.elementosDetectados.forEach((elem, idx) => {
              mensajeResultado += `${idx + 1}. **${elem.tipo}**: `;
              if (elem.texto) mensajeResultado += `${elem.texto}\n`;
              if (elem.valores) mensajeResultado += `${elem.valores.join(', ')}\n`;
            });
            mensajeResultado += `\n`;
          }
          
          if (data.textoExtraido && data.textoExtraido.trim().length > 0) {
            mensajeResultado += `**Texto extraído:**\n${data.textoExtraido.substring(0, 300)}${data.textoExtraido.length > 300 ? '...' : ''}\n`;
          }
          
          if (data.sugerencia) {
            mensajeResultado += `\n💡 ${data.sugerencia}\n`;
          }
        } else {
          mensajeResultado = `📸 **Análisis completado:**\n\n`;
          mensajeResultado += `${data.mensaje || 'Imagen procesada correctamente'}\n`;
          if (data.textoExtraido) {
            mensajeResultado += `\n**Texto detectado:**\n${data.textoExtraido.substring(0, 200)}...\n`;
          }
        }

        agregarMensaje(pregunta ? `📷 ${pregunta}` : '📷 Imagen analizada', 'user');
        agregarMensaje(mensajeResultado, 'bot');
        
        // Limpiar el input si había una pregunta
        if (pregunta) {
          setInputMensaje('');
        }
      } else {
        pushToast(data.mensaje || 'Error al analizar imagen', 'err');
      }
    } catch (error) {
      console.error('Error reconociendo producto:', error);
      pushToast('Error al reconocer productos. Intenta con otra imagen.', 'err');
    } finally {
      setReconociendo(false);
    }
  };

  return (
    <div className="ixora-ia-container">
      <div className="ixora-ia-sidebar">
        <div className="ixora-ia-sidebar-header">
          <div className="ixora-ia-logo-container">
            <div className="ixora-ia-logo">✨</div>
            <h1>IXORA IA</h1>
          </div>
          <button className="ixora-ia-btn-new-chat" onClick={crearNuevoChat} title="Nuevo chat">
            <span>+</span>
          </button>
        </div>

        <nav className="ixora-ia-nav">
          <button 
            className={`ixora-ia-nav-item ${vistaActiva === 'chats' ? 'active' : ''}`}
            onClick={() => setVistaActiva('chats')}
          >
            <span className="ixora-ia-nav-icon">💬</span>
            <span className="ixora-ia-nav-text">Chats</span>
          </button>
          <button 
            className={`ixora-ia-nav-item ${vistaActiva === 'imagenes' ? 'active' : ''}`}
            onClick={() => setVistaActiva('imagenes')}
          >
            <span className="ixora-ia-nav-icon">🖼️</span>
            <span className="ixora-ia-nav-text">Imágenes</span>
          </button>
          <button 
            className={`ixora-ia-nav-item ${vistaActiva === 'archivos' ? 'active' : ''}`}
            onClick={() => setVistaActiva('archivos')}
          >
            <span className="ixora-ia-nav-icon">📁</span>
            <span className="ixora-ia-nav-text">Archivos</span>
          </button>
          <button 
            className={`ixora-ia-nav-item ${vistaActiva === 'configuracion' ? 'active' : ''}`}
            onClick={() => setVistaActiva('configuracion')}
          >
            <span className="ixora-ia-nav-icon">⚙️</span>
            <span className="ixora-ia-nav-text">Configuración</span>
          </button>
        </nav>

        <div className="ixora-ia-chats-list">
          <div className="ixora-ia-chats-header">
            <h3>Conversaciones</h3>
          </div>
          <div className="ixora-ia-chats-scroll">
            {chatsGuardados.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--texto-terciario)', fontSize: '0.85em' }}>
                No hay conversaciones guardadas
              </div>
            ) : (
              chatsGuardados.map(chat => (
                <div key={chat.id} className="ixora-ia-chat-item">
                  <div className="ixora-ia-chat-item-title">{chat.titulo}</div>
                  <div className="ixora-ia-chat-item-preview">{chat.preview}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <main className="ixora-ia-main-content">
        {vistaActiva === 'chats' && (
          <>
            <div className="ixora-ia-chat-header">
              <div className="ixora-ia-chat-title">
                <h2>Nueva Conversación</h2>
                <span className="ixora-ia-chat-date">{new Date().toLocaleDateString('es-ES')}</span>
              </div>
              <div className="ixora-ia-chat-actions">
                <button 
                  className={`ixora-ia-btn-action ixora-ia-btn-voice ${modoVoz ? 'active' : ''}`}
                  onClick={toggleModoVoz}
                  title="Conversación por voz"
                >
                  <span>🎤</span>
                </button>
              </div>
            </div>

            <div className="ixora-ia-chat-messages" ref={mensajesRef}>
              {mensajes.map((msg) => (
                <div key={msg.id} className={`ixora-ia-message ${msg.tipo === 'user' ? 'ixora-ia-user-message' : 'ixora-ia-bot-message'}`}>
                  <div className="ixora-ia-message-avatar">
                    {msg.tipo === 'user' ? '👤' : '🤖'}
                  </div>
                  <div className="ixora-ia-message-content">
                    <div className="ixora-ia-message-text">
                      {msg.texto}
                      {msg.imagen && (
                        <img src={msg.imagen} alt="Generada" style={{ maxWidth: '100%', marginTop: '10px', borderRadius: '8px' }} />
                      )}
                    </div>
                    <div className="ixora-ia-message-time">
                      {msg.timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
              {enviando && (
                <div className="ixora-ia-message ixora-ia-bot-message">
                  <div className="ixora-ia-message-avatar">🤖</div>
                  <div className="ixora-ia-message-content">
                    <div className="ixora-ia-message-text">...</div>
                  </div>
                </div>
              )}
            </div>

            <div className="ixora-ia-chat-input-container">
              <div className="ixora-ia-input-actions">
                <button 
                  className="ixora-ia-btn-action" 
                  title="Tomar foto con cámara"
                  onClick={iniciarCamara}
                >
                  <span>📷</span>
                </button>
                <button 
                  className="ixora-ia-btn-action" 
                  title="Subir imagen"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span>📎</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={manejarArchivoSeleccionado}
                />
              </div>
              <div className="ixora-ia-input-wrapper">
                <input
                  ref={inputRef}
                  type="text"
                  id="ixora-ia-chatInput"
                  className="ixora-ia-chat-input"
                  placeholder="Escribe tu mensaje..."
                  value={inputMensaje}
                  onChange={(e) => setInputMensaje(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={enviando}
                />
                <button 
                  className="ixora-ia-btn-send"
                  onClick={() => enviarMensaje()}
                  disabled={enviando || !inputMensaje.trim()}
                >
                  <span>➤</span>
                </button>
              </div>
            </div>
          </>
        )}

        {vistaActiva === 'imagenes' && (
          <div className="ixora-ia-view-container">
            <div className="ixora-ia-gallery-header">
              <h2>Reconocimiento de Imágenes</h2>
              <p style={{ color: '#666', fontSize: '0.9em', marginTop: '5px' }}>
                Escanea cualquier cosa con tu cámara o sube una imagen. Puedes preguntar qué quieres reconocer.
              </p>
            </div>
            
            {/* Cámara en vivo */}
            {mostrarCamara && (
              <div style={{ 
                position: 'fixed', 
                top: 0, 
                left: 0, 
                right: 0, 
                bottom: 0, 
                background: 'rgba(0,0,0,0.9)', 
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  style={{
                    maxWidth: '100%',
                    maxHeight: '70vh',
                    borderRadius: '8px'
                  }}
                />
                <div style={{ 
                  marginTop: '20px', 
                  display: 'flex', 
                  gap: '15px' 
                }}>
                  <button
                    onClick={capturarFoto}
                    style={{
                      padding: '15px 30px',
                      background: '#4CAF50',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '16px',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    📸 Capturar
                  </button>
                  <button
                    onClick={detenerCamara}
                    style={{
                      padding: '15px 30px',
                      background: '#f44336',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '16px',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    ❌ Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Controles */}
            <div style={{ padding: '20px' }}>
              <div style={{ 
                marginBottom: '15px',
                padding: '15px',
                background: '#e3f2fd',
                borderRadius: '8px',
                border: '1px solid #2196F3'
              }}>
                <p style={{ margin: 0, fontSize: '14px', color: '#1976d2' }}>
                  💡 <strong>Tip:</strong> Puedes escribir una pregunta antes de capturar/subir la imagen. 
                  Por ejemplo: "¿Qué producto es este?", "Lee el texto", "Identifica este objeto"
                </p>
              </div>
              
              <div style={{ 
                display: 'flex', 
                gap: '15px', 
                justifyContent: 'center',
                flexWrap: 'wrap'
              }}>
                <button
                  onClick={iniciarCamara}
                  disabled={mostrarCamara || reconociendo}
                  style={{
                    padding: '15px 30px',
                    background: mostrarCamara || reconociendo ? '#ccc' : '#2196F3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    cursor: mostrarCamara || reconociendo ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <span>📷</span> Cámara en Vivo
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={reconociendo}
                  style={{
                    padding: '15px 30px',
                    background: reconociendo ? '#ccc' : '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    cursor: reconociendo ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <span>📁</span> Subir Imagen
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={manejarArchivoSeleccionado}
                />
              </div>
            </div>

            {/* Estado de reconocimiento */}
            {reconociendo && (
              <div style={{ 
                padding: '40px', 
                textAlign: 'center',
                color: '#666'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '15px' }}>🔍</div>
                <p style={{ fontSize: '18px', fontWeight: 'bold' }}>Analizando imagen...</p>
                <p style={{ fontSize: '14px', marginTop: '10px' }}>Esto puede tomar unos segundos</p>
              </div>
            )}

            {/* Resultados */}
            {resultadoReconocimiento && !reconociendo && (
              <div style={{ padding: '20px' }}>
                <h3 style={{ marginBottom: '20px' }}>
                  {resultadoReconocimiento.tipo === 'productos' 
                    ? 'Resultados del Reconocimiento de Productos' 
                    : 'Resultados del Análisis'}
                </h3>
                
                {resultadoReconocimiento.tipo === 'productos' && resultadoReconocimiento.productos && resultadoReconocimiento.productos.length > 0 ? (
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '20px'
                  }}>
                    {resultadoReconocimiento.productos.map((prod, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '20px',
                          background: prod.codigo ? '#e8f5e9' : '#fff3e0',
                          border: `2px solid ${prod.codigo ? '#4CAF50' : '#ff9800'}`,
                          borderRadius: '8px'
                        }}
                      >
                        <div style={{ 
                          fontSize: '24px', 
                          marginBottom: '10px' 
                        }}>
                          {prod.codigo ? '✅' : '⚠️'}
                        </div>
                        <div style={{ marginBottom: '8px' }}>
                          <strong>Nombre:</strong> {prod.nombre}
                        </div>
                        {prod.codigo && (
                          <div style={{ marginBottom: '8px' }}>
                            <strong>Código:</strong> {prod.codigo}
                          </div>
                        )}
                        {prod.presentacion && (
                          <div style={{ marginBottom: '8px' }}>
                            <strong>Presentación:</strong> {prod.presentacion}
                          </div>
                        )}
                        {prod.lote && (
                          <div style={{ marginBottom: '8px' }}>
                            <strong>Lote:</strong> {prod.lote}
                          </div>
                        )}
                        {prod.cantidad && (
                          <div style={{ marginBottom: '8px' }}>
                            <strong>Cantidad:</strong> {prod.cantidad}
                          </div>
                        )}
                        {prod.sinCoincidencia && (
                          <div style={{ 
                            marginTop: '10px', 
                            padding: '10px', 
                            background: '#ffebee', 
                            borderRadius: '4px',
                            color: '#c62828'
                          }}>
                            ⚠️ No encontrado en inventario
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : resultadoReconocimiento.tipo === 'general' ? (
                  <div style={{ 
                    padding: '20px',
                    background: '#e3f2fd',
                    borderRadius: '8px',
                    border: '2px solid #2196F3'
                  }}>
                    <h4 style={{ marginTop: 0, color: '#1976d2' }}>📸 Análisis General</h4>
                    <p style={{ marginBottom: '15px' }}>
                      <strong>Descripción:</strong> {resultadoReconocimiento.descripcion || resultadoReconocimiento.mensaje}
                    </p>
                    
                    {resultadoReconocimiento.elementosDetectados && resultadoReconocimiento.elementosDetectados.length > 0 && (
                      <div style={{ marginBottom: '15px' }}>
                        <strong>Elementos detectados:</strong>
                        <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                          {resultadoReconocimiento.elementosDetectados.map((elem, idx) => (
                            <li key={idx} style={{ marginBottom: '5px' }}>
                              <strong>{elem.tipo}:</strong> {elem.texto || (elem.valores ? elem.valores.join(', ') : '')}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {resultadoReconocimiento.textoExtraido && resultadoReconocimiento.textoExtraido.trim().length > 0 && (
                      <div style={{ 
                        marginTop: '15px', 
                        padding: '15px', 
                        background: '#f5f5f5', 
                        borderRadius: '6px' 
                      }}>
                        <strong>Texto extraído:</strong>
                        <pre style={{ 
                          marginTop: '10px', 
                          whiteSpace: 'pre-wrap', 
                          fontSize: '12px',
                          color: '#666',
                          maxHeight: '200px',
                          overflow: 'auto'
                        }}>
                          {resultadoReconocimiento.textoExtraido}
                        </pre>
                      </div>
                    )}
                    
                    {resultadoReconocimiento.sugerencia && (
                      <div style={{ 
                        marginTop: '15px',
                        padding: '10px',
                        background: '#fff3e0',
                        borderRadius: '6px',
                        border: '1px solid #ff9800'
                      }}>
                        💡 <strong>Sugerencia:</strong> {resultadoReconocimiento.sugerencia}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ 
                    padding: '30px', 
                    textAlign: 'center',
                    background: '#fff3e0',
                    borderRadius: '8px',
                    border: '2px solid #ff9800'
                  }}>
                    <div style={{ fontSize: '48px', marginBottom: '15px' }}>⚠️</div>
                    <p style={{ fontSize: '16px', fontWeight: 'bold' }}>
                      {resultadoReconocimiento.mensaje || 'No se encontraron elementos reconocibles en la imagen'}
                    </p>
                    <p style={{ fontSize: '14px', marginTop: '10px', color: '#666' }}>
                      Intenta con una imagen más clara, con mejor iluminación, o especifica qué quieres reconocer
                    </p>
                  </div>
                )}

                {resultadoReconocimiento.textoExtraido && (
                  <div style={{ 
                    marginTop: '30px', 
                    padding: '15px', 
                    background: '#f5f5f5', 
                    borderRadius: '8px' 
                  }}>
                    <strong>Texto extraído:</strong>
                    <pre style={{ 
                      marginTop: '10px', 
                      whiteSpace: 'pre-wrap', 
                      fontSize: '12px',
                      color: '#666'
                    }}>
                      {resultadoReconocimiento.textoExtraido}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Estado inicial */}
            {!reconociendo && !resultadoReconocimiento && (
              <div className="ixora-ia-gallery-container">
                <div className="ixora-ia-gallery-empty">
                  <span className="ixora-ia-empty-icon">📸</span>
                  <p>Inicia el reconocimiento de imágenes</p>
                  <p className="ixora-ia-empty-hint">
                    Puedes reconocer cualquier cosa: productos, texto, documentos, objetos, etc.
                    <br />
                    Escribe una pregunta antes de capturar/subir para ser más específico.
                    <br />
                    Ejemplos: "¿Qué producto es este?", "Lee el texto", "Identifica este objeto"
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {vistaActiva === 'archivos' && (
          <div className="ixora-ia-view-container">
            <div className="ixora-ia-gallery-header">
              <h2>Archivos Subidos</h2>
            </div>
            <div className="ixora-ia-gallery-container">
              <div className="ixora-ia-gallery-empty">
                <span className="ixora-ia-empty-icon">📁</span>
                <p>No hay archivos subidos aún</p>
                <p className="ixora-ia-empty-hint">Sube archivos usando el botón 📎 en el chat</p>
              </div>
            </div>
          </div>
        )}

        {vistaActiva === 'configuracion' && (
          <div className="ixora-ia-view-container">
            <div className="ixora-ia-settings-container">
              <h2>Configuración de Voz</h2>
              
              {/* Voz Personalizada */}
              <div className="ixora-ia-settings-section">
                <h3>🎤 Voz Personalizada</h3>
                <p style={{ marginBottom: '15px', color: '#666' }}>
                  Graba tu propia voz para que IXORA IA hable con ella. La voz debe ser clara y natural.
                </p>
                
                {configuracionVoz ? (
                  <div style={{ 
                    padding: '15px', 
                    background: '#f0f0f0', 
                    borderRadius: '8px', 
                    marginBottom: '15px' 
                  }}>
                    <p><strong>Voz actual:</strong> {configuracionVoz.voiceName}</p>
                    <p style={{ fontSize: '0.9em', color: '#666' }}>
                      Creada: {new Date(configuracionVoz.createdAt).toLocaleDateString()}
                    </p>
                    <button
                      onClick={eliminarVozPersonalizada}
                      disabled={cargandoVoz}
                      style={{
                        marginTop: '10px',
                        padding: '8px 16px',
                        background: '#ff6b6b',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: cargandoVoz ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {cargandoVoz ? 'Eliminando...' : 'Eliminar voz personalizada'}
                    </button>
                  </div>
                ) : (
                  <p style={{ marginBottom: '15px', color: '#999', fontStyle: 'italic' }}>
                    No tienes una voz personalizada configurada
                  </p>
                )}
                
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    onClick={grabando ? detenerGrabacion : iniciarGrabacion}
                    disabled={cargandoVoz}
                    style={{
                      padding: '12px 24px',
                      background: grabando ? '#ff6b6b' : '#4CAF50',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: cargandoVoz ? 'not-allowed' : 'pointer',
                      fontSize: '16px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    {grabando ? (
                      <>
                        <span>⏹️</span> Detener grabación
                      </>
                    ) : (
                      <>
                        <span>🎤</span> {cargandoVoz ? 'Procesando...' : 'Grabar mi voz'}
                      </>
                    )}
                  </button>
                  
                  {grabando && (
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px',
                      color: '#ff6b6b',
                      fontWeight: 'bold'
                    }}>
                      <span style={{ 
                        width: '12px', 
                        height: '12px', 
                        background: '#ff6b6b', 
                        borderRadius: '50%',
                        animation: 'pulse 1s infinite'
                      }}></span>
                      Grabando...
                    </div>
                  )}
                </div>
                
                <p style={{ 
                  marginTop: '10px', 
                  fontSize: '0.85em', 
                  color: '#666',
                  fontStyle: 'italic'
                }}>
                  💡 Tip: Habla claramente durante 30-60 segundos. Di frases variadas para mejor calidad.
                </p>
              </div>

              {/* Voces Predefinidas */}
              <div className="ixora-ia-settings-section" style={{ marginTop: '30px' }}>
                <h3>🎭 Voces Predefinidas</h3>
                <p style={{ marginBottom: '15px', color: '#666' }}>
                  O selecciona una voz predefinida de ElevenLabs
                </p>
                
                {vocesDisponibles.length > 0 ? (
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '10px',
                    maxHeight: '300px',
                    overflowY: 'auto'
                  }}>
                    {vocesDisponibles.slice(0, 12).map((voz) => (
                      <button
                        key={voz.voice_id}
                        onClick={() => seleccionarVozPredefinida(voz.voice_id, voz.name)}
                        disabled={cargandoVoz || configuracionVoz?.voiceId === voz.voice_id}
                        style={{
                          padding: '12px',
                          background: configuracionVoz?.voiceId === voz.voice_id ? '#4CAF50' : '#f0f0f0',
                          color: configuracionVoz?.voiceId === voz.voice_id ? 'white' : '#333',
                          border: '2px solid',
                          borderColor: configuracionVoz?.voiceId === voz.voice_id ? '#4CAF50' : '#ddd',
                          borderRadius: '8px',
                          cursor: cargandoVoz ? 'not-allowed' : 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (!cargandoVoz && configuracionVoz?.voiceId !== voz.voice_id) {
                            e.target.style.background = '#e0e0e0';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!cargandoVoz && configuracionVoz?.voiceId !== voz.voice_id) {
                            e.target.style.background = '#f0f0f0';
                          }
                        }}
                      >
                        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                          {voz.name}
                        </div>
                        {configuracionVoz?.voiceId === voz.voice_id && (
                          <div style={{ fontSize: '0.85em', opacity: 0.9 }}>
                            ✓ Voz actual
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#999', fontStyle: 'italic' }}>
                    Cargando voces disponibles...
                  </p>
                )}
              </div>

              {/* Información */}
              <div className="ixora-ia-settings-section" style={{ marginTop: '30px' }}>
                <h3>ℹ️ Información</h3>
                <div style={{ padding: '15px', background: '#e3f2fd', borderRadius: '8px' }}>
                  <p style={{ marginBottom: '10px' }}>
                    <strong>Voz personalizada:</strong> Se crea usando tecnología de clonación de voz de ElevenLabs.
                    La voz grabada se procesa y se usa para todas las respuestas de IXORA IA.
                  </p>
                  <p style={{ marginBottom: '10px' }}>
                    <strong>Calidad:</strong> Para mejores resultados, graba en un lugar silencioso y habla claramente.
                    Mínimo recomendado: 30 segundos de audio.
                  </p>
                  <p>
                    <strong>Nota:</strong> Requiere API Key de ElevenLabs configurada en el servidor.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
