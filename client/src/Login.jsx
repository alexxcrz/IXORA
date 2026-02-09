import { useState, useRef, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { useAlert } from "./components/AlertModal";
import { aplicarTema, temas } from "./utils/temas";
import { getServerUrlSync } from "./config/server";
import "./Login.css";
// Logo se carga desde personalización o usa un fallback


export default function Login() {
  const { login } = useAuth();
  const { showAlert } = useAlert();

  const [loginMethod, setLoginMethod] = useState("whatsapp"); // "whatsapp" o "password"
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [cooldownReenvio, setCooldownReenvio] = useState(0);
  const inputsRef = useRef([]);
  const startBtnRef = useRef(null);
  const phoneRef = useRef(null);
  const usernameRef = useRef(null);
  const passwordRef = useRef(null);
  const [toastMsg, setToastMsg] = useState("");
  const [personalizacion, setPersonalizacion] = useState({
    fondoLogin: null,
    fondoLoginTipo: null,
    fondoLoginBranding: null,
    fondoLoginBrandingTipo: null,
    logo: null,
    logoTipo: null,
    tema: null,
    colorFondoPrincipal: "#15192e",
    nombreApp: "IXORA",
  });

  // Obtener URL del servidor - siempre usar la función para obtener la URL actualizada
  const SERVER = getServerUrlSync();
  // Logs removidos para evitar saturar la consola

  // Agregar clase al body para aplicar estilos de login solo en esta página
  useEffect(() => {
    document.body.classList.add('login-page');
    return () => {
      document.body.classList.remove('login-page');
    };
  }, []);

  // Aplicar tema base inmediatamente al montar (antes del async)
  // Esto es solo un fallback temporal mientras se carga la personalización del servidor
  useEffect(() => {
    // Cargar tema del localStorage como fallback temporal mientras se carga la personalización
    // El tema del servidor (predeterminado del administrador) tendrá prioridad cuando se cargue
    // Esto evita un flash de contenido sin estilo
    // Los temas no son sensibles, no necesitan cifrado
    const temaFallback = localStorage.getItem("tema-actual") || "azul";
    if (temas[temaFallback]) {
      aplicarTema(temaFallback);
    }
    // Nota: El tema del servidor se aplicará después y sobrescribirá este fallback
  }, []);

  // Probar conexión al servidor al montar (removido - ya se prueba en cargarPersonalizacion)

  // Cargar personalización de login
  useEffect(() => {
    const cargarPersonalizacion = async () => {
      // Intentar primero con el protocolo configurado, luego con el alternativo si falla
      const tryFetch = async (url) => {
        try {
          console.log("🌐 [LOGIN] Intentando fetch a:", url);
          console.log("🌐 [LOGIN] SERVER:", SERVER);
          
          // Para apps nativas Android, intentar sin mode: 'cors' primero
          // ya que puede causar problemas en WebView
          const isAndroid = window.navigator.userAgent.includes('Android') || 
                           window.navigator.userAgent.includes('wv');
          
          console.log("🌐 [LOGIN] Es Android:", isAndroid);
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            console.warn("⏱️ [LOGIN] Timeout de 15 segundos alcanzado");
            controller.abort();
          }, 15000); // Timeout de 15 segundos (más tiempo para Android)
          
          // Configuración de fetch - simplificada para Android
          const fetchOptions = {
            method: 'GET',
            signal: controller.signal,
            cache: 'no-cache',
            headers: {
              'Accept': 'application/json'
            }
          };
          
          // En Android, NO usar mode: 'cors' ya que puede causar problemas en WebView
          // Solo usar en navegador web
          if (!isAndroid) {
            fetchOptions.mode = 'cors';
            fetchOptions.credentials = 'omit';
            fetchOptions.headers['Content-Type'] = 'application/json';
          }
          
          console.log("🌐 [LOGIN] Opciones de fetch:", JSON.stringify(fetchOptions, null, 2));
          
          const res = await fetch(url, fetchOptions);
          
          clearTimeout(timeoutId);
          
          console.log("✅ [LOGIN] Fetch exitoso:");
          console.log("   Status:", res.status);
          console.log("   Status Text:", res.statusText);
          console.log("   OK:", res.ok);
          
          return res;
        } catch (err) {
          console.error("❌ [LOGIN] Error en tryFetch:");
          console.error("   URL:", url);
          console.error("   Error name:", err.name);
          console.error("   Error message:", err.message);
          console.error("   Error stack:", err.stack);
          
          if (err.name === 'AbortError' || err.name === 'TypeError') {
            console.warn("⚠️ [LOGIN] Error de red - servidor no disponible o timeout");
            return null; // Servidor no disponible
          }
          throw err;
        }
      };
      
      try {
        // Intentar con HTTP
        let res = await tryFetch(`${SERVER}/admin/personalizacion`);
        
        if (!res) {
          // Servidor no disponible, usar tema predeterminado
          console.warn("⚠️ [LOGIN] No se pudo cargar personalización - servidor no disponible");
          aplicarTema("azul");
          return;
        }
        
        if (res.ok) {
          const data = await res.json();
          if (data) {
            // PRIORIDAD: Tema del servidor (predeterminado del administrador) > localStorage > "azul"
            // Si el servidor tiene un tema, siempre usarlo (incluso si es null, el servidor lo estableció)
            const temaServidor = data.tema !== undefined && data.tema !== null ? data.tema : null;
            const temaFinal = temaServidor || localStorage.getItem("tema-actual") || "azul";
            
            const nuevaPersonalizacion = {
              fondoLogin: data.fondoLogin ? data.fondoLogin : null,
              fondoLoginTipo: data.fondoLoginTipo || null,
              fondoLoginBranding: data.fondoLoginBranding ? data.fondoLoginBranding : null,
              fondoLoginBrandingTipo: data.fondoLoginBrandingTipo || null,
              logo: data.logo ? data.logo : null,
              logoTipo: data.logoTipo || null,
              tema: temaFinal,
              colorFondoPrincipal: data.colorFondoPrincipal || null,
              nombreApp: data.nombreApp || "Atlas",
            };
            
            setPersonalizacion(nuevaPersonalizacion);
            
            // Aplicar tema inmediatamente después de cargar (esto actualiza TODAS las variables CSS del tema)
            aplicarTema(temaFinal);
            
            // Guardar en localStorage para persistencia (solo si viene del servidor)
            // Si el tema viene del servidor, actualizar localStorage para mantener consistencia
            if (temaServidor) {
              localStorage.setItem("tema-actual", temaServidor);
              try {
                sessionStorage.setItem("tema-actual", temaServidor);
              } catch (e) {
                // Si sessionStorage no está disponible, continuar
              }
            }
            
            // Aplicar color de fondo principal (después del tema para que lo sobrescriba si es diferente)
            // Si NO hay colorFondoPrincipal personalizado, el tema ya estableció el color correcto
            if (nuevaPersonalizacion.colorFondoPrincipal) {
              // Aplicar inmediatamente sin setTimeout, ya que aplicarTema es síncrono
              document.documentElement.style.setProperty('--fondo-principal', nuevaPersonalizacion.colorFondoPrincipal);
            } else {
              // Si no hay color personalizado, asegurarse de que se use el del tema
              const temaActual = temas[nuevaPersonalizacion.tema];
              if (temaActual && temaActual.colores["--fondo-principal"]) {
                document.documentElement.style.setProperty('--fondo-principal', temaActual.colores["--fondo-principal"]);
              }
            }
            
            // Actualizar favicon si está configurado (funciona sin sesión)
            if (data.favicon) {
              const faviconTipo = data.faviconTipo || "imagen";
              
              // Eliminar todos los favicons existentes
              document.querySelectorAll("link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']").forEach(el => el.remove());
              
              // Usar la ruta GET del servidor que busca automáticamente el favicon
              const timestamp = Date.now();
              const faviconUrl = `${SERVER}/admin/personalizacion/favicon?t=${timestamp}`;
              
              // Intentar también con rutas estáticas directas como fallback
              const posiblesExtensiones = faviconTipo === "gif" ? ["gif"] : 
                                         faviconTipo === "svg" ? ["svg"] : 
                                         ["png", "ico", "jpg", "jpeg"]; // PNG primero (procesado circular)
              
              // Primero intentar con la ruta GET del servidor
              const link = document.createElement("link");
              link.rel = "icon";
              link.type = faviconTipo === "svg" ? "image/svg+xml" : faviconTipo === "gif" ? "image/gif" : "image/png";
              link.href = faviconUrl;
              link.onerror = () => {
                // Si falla, intentar con rutas estáticas directas
                console.warn("⚠️ Favicon no encontrado en ruta GET, intentando rutas estáticas...");
                posiblesExtensiones.forEach((ext, index) => {
                  const fallbackLink = document.createElement("link");
                  fallbackLink.rel = index === 0 ? "icon" : "alternate icon";
                  fallbackLink.type = ext === "svg" ? "image/svg+xml" : ext === "gif" ? "image/gif" : ext === "png" ? "image/png" : "image/x-icon";
                  fallbackLink.href = `${SERVER}/uploads/personalizacion/favicons/favicon.${ext}?t=${timestamp}`;
                  document.head.appendChild(fallbackLink);
                });
              };
              document.head.appendChild(link);
              
              // Agregar shortcut icon
              const shortcutLink = document.createElement("link");
              shortcutLink.rel = "shortcut icon";
              shortcutLink.href = faviconUrl;
              document.head.appendChild(shortcutLink);
              
              // Agregar también apple-touch-icon para mejor compatibilidad
              const appleLink = document.createElement("link");
              appleLink.rel = "apple-touch-icon";
              appleLink.href = faviconUrl;
              document.head.appendChild(appleLink);
              
              console.log(`✅ [LOGIN] Favicon cargado desde: ${faviconUrl}`);
            }
            
            // Actualizar título de la pestaña con el nombre personalizado (funciona sin sesión)
            const nombreApp = data.nombreApp || "IXORA";
            document.title = nombreApp;
          } else {
            // Si no hay datos, aplicar tema predeterminado
            aplicarTema("azul");
            // Establecer título por defecto
            document.title = "IXORA";
          }
        } else {
          // Si falla la petición, aplicar tema predeterminado
          aplicarTema("azul");
          // Establecer título por defecto
          document.title = "Atlas";
        }
      } catch (err) {
        // Solo mostrar error si no es un error de red/abort (servidor no disponible)
        if (err.name !== 'AbortError' && err.name !== 'TypeError') {
          console.error("Error cargando personalización:", err);
        }
        // En caso de error, aplicar tema predeterminado
        aplicarTema("azul");
      }
    };
    cargarPersonalizacion();
  }, [SERVER]);

  // Aplicar tema y color de fondo cuando cambian
  useEffect(() => {
    // Aplicar tema completo primero (esto actualiza TODAS las variables CSS del tema)
    if (personalizacion.tema) {
      aplicarTema(personalizacion.tema);
      
      // IMPORTANTE: Esperar un tick para asegurar que el tema se aplicó completamente
      // antes de sobrescribir con color personalizado
      requestAnimationFrame(() => {
        if (personalizacion.colorFondoPrincipal) {
          // Aplicar color personalizado DESPUÉS del tema
          document.documentElement.style.setProperty('--fondo-principal', personalizacion.colorFondoPrincipal);
        } else {
          // Si no hay color personalizado, asegurarse de que se use el del tema
          const temaActual = temas[personalizacion.tema];
          if (temaActual && temaActual.colores["--fondo-principal"]) {
            document.documentElement.style.setProperty('--fondo-principal', temaActual.colores["--fondo-principal"]);
          }
        }
      });
    }
  }, [personalizacion.colorFondoPrincipal, personalizacion.tema]);

  // Sistema de partículas estáticas con movimiento libre
  useEffect(() => {
    const staticParticles = [];
    const container = document.querySelector('.login-container');
    if (!container) return;

    // Crear partículas estáticas con movimiento libre
    const createStaticParticle = (x, y) => {
      const particle = document.createElement('div');
      particle.className = 'static-particle';
      
      // Posición inicial aleatoria
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      
      // Tamaño aleatorio más grande
      const size = 2 + Math.random() * 2; // 2-4px
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      
      // Color aleatorio más brillante y visible
      const colors = [
        'rgba(59, 130, 246, 1)',
        'rgba(99, 102, 241, 1)',
        'rgba(96, 165, 250, 1)',
        'rgba(129, 140, 248, 1)'
      ];
      particle.style.background = colors[Math.floor(Math.random() * colors.length)];
      particle.style.borderRadius = '50%';
      particle.style.position = 'fixed';
      particle.style.pointerEvents = 'none';
      particle.style.zIndex = '0';
      particle.style.boxShadow = '0 0 6px rgba(59, 130, 246, 0.8), 0 0 12px rgba(99, 102, 241, 0.6)';
      
      // Crear animación completamente libre y aleatoria
      let currentX = 0;
      let currentY = 0;
      let vx = (Math.random() - 0.5) * 2; // Velocidad inicial aleatoria
      let vy = (Math.random() - 0.5) * 2;
      let animationId = null;
      
      const animate = () => {
        // Cambiar dirección aleatoriamente de vez en cuando
        if (Math.random() < 0.05) {
          vx += (Math.random() - 0.5) * 0.5;
          vy += (Math.random() - 0.5) * 0.5;
        }
        
        // Limitar velocidad máxima
        const maxSpeed = 1.5;
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed > maxSpeed) {
          vx = (vx / speed) * maxSpeed;
          vy = (vy / speed) * maxSpeed;
        }
        
        // Actualizar posición
        currentX += vx;
        currentY += vy;
        
        // Rebotar en los bordes de la pantalla
        const maxX = window.innerWidth;
        const maxY = window.innerHeight;
        if (currentX < -maxX || currentX > maxX) {
          vx = -vx;
          currentX = Math.max(-maxX, Math.min(maxX, currentX));
        }
        if (currentY < -maxY || currentY > maxY) {
          vy = -vy;
          currentY = Math.max(-maxY, Math.min(maxY, currentY));
        }
        
        // Aplicar transformación
        particle.style.transform = `translate(${currentX}px, ${currentY}px)`;
        
        animationId = requestAnimationFrame(animate);
      };
      
      animate();
      
      document.body.appendChild(particle);
      staticParticles.push({ element: particle, cancelAnimation: () => cancelAnimationFrame(animationId) });
    };

    // Crear partículas estáticas distribuidas - TODAS con movimiento libre
    const particleCount = 50; // Más partículas para llenar la pantalla
    for (let i = 0; i < particleCount; i++) {
      const x = Math.random() * window.innerWidth;
      const y = Math.random() * window.innerHeight;
      createStaticParticle(x, y);
    }

    // Sistema de partículas dinámicas que siguen el mouse/touch
    let particleId = 0;
    const dynamicParticles = new Set();

    const createDynamicParticle = (x, y) => {
      const particle = document.createElement('div');
      particle.className = 'particle';
      particle.id = `particle-${particleId++}`;
      
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      
      const angle = Math.random() * Math.PI * 2;
      const distance = 50 + Math.random() * 100;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance;
      
      particle.style.setProperty('--dx', `${dx}px`);
      particle.style.setProperty('--dy', `${dy}px`);
      
      // Tamaño más grande para partículas dinámicas
      const size = 2.5 + Math.random() * 1.5; // 2.5-4px
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      particle.style.borderRadius = '50%';
      
      const colors = [
        'rgba(59, 130, 246, 1)',
        'rgba(99, 102, 241, 1)',
        'rgba(96, 165, 250, 1)',
        'rgba(129, 140, 248, 1)'
      ];
      particle.style.background = colors[Math.floor(Math.random() * colors.length)];
      particle.style.boxShadow = '0 0 8px rgba(59, 130, 246, 0.9), 0 0 16px rgba(99, 102, 241, 0.7)';
      
      document.body.appendChild(particle);
      dynamicParticles.add(particle);
      
      setTimeout(() => {
        if (particle.parentNode) {
          particle.parentNode.removeChild(particle);
        }
        dynamicParticles.delete(particle);
      }, 3000);
    };

    const handleMouseMove = (e) => {
      if (Math.random() > 0.7) {
        createDynamicParticle(e.clientX, e.clientY);
      }
    };

    const handleTouchMove = (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (touch && Math.random() > 0.5) {
        createDynamicParticle(touch.clientX, touch.clientY);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });

    // Cleanup
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      
      staticParticles.forEach(({ element, cancelAnimation }) => {
        if (cancelAnimation) cancelAnimation();
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      });
      
      dynamicParticles.forEach(particle => {
        if (particle.parentNode) {
          particle.parentNode.removeChild(particle);
        }
      });
      dynamicParticles.clear();
    };
  }, []);

  // Escuchar cambios en el tema global desde Administrador
  useEffect(() => {
    // Función para aplicar el tema global cuando cambia
    const handleTemaGlobalActualizado = (event) => {
      const nuevoTema = event.detail;
      if (nuevoTema && temas[nuevoTema]) {
        // Aplicar el tema (esto actualiza TODAS las variables CSS)
        aplicarTema(nuevoTema);
        
        // Recargar personalización para obtener el colorFondoPrincipal si existe
        fetch(`${SERVER}/admin/personalizacion`)
          .then(res => res.json())
          .then(data => {
            if (data) {
              setPersonalizacion(prev => ({
                ...prev,
                tema: data.tema || nuevoTema,
                colorFondoPrincipal: data.colorFondoPrincipal || null,
              }));
              
              // Si hay colorFondoPrincipal personalizado, aplicarlo después del tema
              if (data.colorFondoPrincipal) {
                document.documentElement.style.setProperty('--fondo-principal', data.colorFondoPrincipal);
              } else {
                // Si no hay color personalizado, usar el del tema
                const temaActual = temas[data.tema || nuevoTema];
                if (temaActual && temaActual.colores["--fondo-principal"]) {
                  document.documentElement.style.setProperty('--fondo-principal', temaActual.colores["--fondo-principal"]);
                }
              }
            }
          })
          .catch(err => console.error("Error recargando personalización:", err));
      }
    };

    // Escuchar evento de cambio de tema global (desde Administrador)
    window.addEventListener('tema-global-actualizado', handleTemaGlobalActualizado);

    return () => {
      window.removeEventListener('tema-global-actualizado', handleTemaGlobalActualizado);
    };
  }, [SERVER]);

  // AUTOFOCUS
  useEffect(() => {
    if (loginMethod === "whatsapp") {
      if (step === 1) startBtnRef.current?.focus();
      if (step === 2) phoneRef.current?.focus();
      if (step === 3) inputsRef.current[0]?.focus();
    } else {
      if (step === 1) usernameRef.current?.focus();
    }
  }, [step, loginMethod]);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 2500);
  };

  // ENTER GLOBAL
  const handleKeyDown = (e) => {
    if (e.key !== "Enter") return;

    if (loginMethod === "whatsapp") {
      if (step === 1) return setStep(2);
      if (step === 2) return; // NO enviar OTP con Enter
      if (step === 3) return verifyOtp();
    } else {
      if (step === 1) return handlePasswordLogin();
    }
  };

  // LOGIN CON USUARIO Y CONTRASEÑA
  const handlePasswordLogin = async () => {
    if (!username.trim() || !password) {
      return showAlert("Usuario y contraseña requeridos", "warning", { title: "Campos requeridos" });
    }

    if (!SERVER) {
      return showAlert("Servidor no configurado. Por favor, reinicia la aplicación.", "error", { title: "Error de configuración" });
    }

    try {
      const baseUrl = SERVER.endsWith('/') ? SERVER.slice(0, -1) : SERVER;
      const loginUrl = `${baseUrl}/auth/login`;
      
      // Detectar si es Android para ajustar configuración
      const isAndroid = window.navigator.userAgent.includes('Android') || 
                       window.navigator.userAgent.includes('wv');
      
      const fetchOptions = {
        method: "POST",
        cache: 'no-cache',
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username: username.trim(), password }),
      };
      
      // En Android, NO usar mode: 'cors' ya que puede causar problemas en WebView
      if (!isAndroid) {
        fetchOptions.mode = 'cors';
        fetchOptions.credentials = 'omit';
      }
      
      console.log("🌐 [LOGIN] Enviando login request:");
      console.log("   URL:", loginUrl);
      console.log("   Es Android:", isAndroid);
      
      const res = await fetch(loginUrl, fetchOptions);

      if (!res.ok) {
        const errorText = await res.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: `Error HTTP ${res.status}` };
        }
        return showAlert(errorData.error || "Error al iniciar sesión", "error", { title: "Error de autenticación" });
      }

      const data = await res.json();

      // LOGIN REAL
      console.log("🔐 [LOGIN] Recibiendo respuesta del servidor (password)...");
      console.log(`   Token recibido (primeros 30): ${data.token?.substring(0, 30) || 'NULL'}...`);
      console.log(`   Token length: ${data.token?.length || 0}`);
      
      // Llamar a login que actualizará currentToken
      await login(data.user, data.token, data.perms);
      
      // Verificar que el token se actualizó
      const verifyAfterLogin = localStorage.getItem("token");
      console.log(`🔐 [LOGIN] Después de login, token en localStorage (primeros 30): ${verifyAfterLogin?.substring(0, 30) || 'NULL'}...`);
      console.log(`   Coincide con token recibido: ${verifyAfterLogin === data.token ? '✅ SÍ' : '❌ NO'}`);
    } catch (err) {
      console.error("❌ [LOGIN] Error en conexión:", err);
      const errorMsg = err.message || "Error de conexión";
      showAlert(`Error conectando al servidor: ${errorMsg}. Verifica que el servidor esté corriendo en ${SERVER}.`, "error", { title: "Error de conexión" });
    }
  };


  // OTP CHANGE + AUTOVERIFY
  const handleOtpChange = (value, index) => {
    if (!/^[0-9]?$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) inputsRef.current[index + 1]?.focus();

    if (index === 5 && value !== "") {
      const code = newOtp.join("");
      if (code.length === 6 && phone.length === 10) {
        verifyOtp(code);
      }
    }
  };

  // REQUEST OTP
  const requestOtp = async (esReenvio = false) => {
    console.log("🔵 [LOGIN] requestOtp llamado, esReenvio:", esReenvio);
    console.log("🔵 [LOGIN] step actual:", step);
    console.log("🔵 [LOGIN] phone:", phone);
    
    const phoneClean = phone.replace(/\D/g, "");
    if (phoneClean.length !== 10) {
      console.log("❌ [LOGIN] Teléfono inválido, longitud:", phoneClean.length);
      return showAlert("Número inválido (debe tener 10 dígitos)", "warning", { title: "Número inválido" });
    }

    if (!SERVER) {
      console.log("❌ [LOGIN] SERVER no configurado");
      return showAlert("Servidor no configurado. Por favor, reinicia la aplicación.", "error", { title: "Error de configuración" });
    }

    // Si es reenvío y está en cooldown, no hacer nada
    if (esReenvio && cooldownReenvio > 0) {
      console.log("⏳ [LOGIN] Reenvío en cooldown, no hacer nada");
      return;
    }

    // IMPORTANTE: Avanzar al paso 3 INMEDIATAMENTE después de validar el teléfono
    // Esto asegura que el campo OTP se muestre incluso si hay errores de red
    console.log("✅ [LOGIN] Teléfono válido, avanzando a step 3 INMEDIATAMENTE");
    setStep(3);
    setCooldownReenvio(60);
    
    if (!esReenvio) {
      showToast("Solicitando código...");
    }

    try {
      const baseUrl = SERVER.endsWith('/') ? SERVER.slice(0, -1) : SERVER;
      const otpUrl = `${baseUrl}/auth/otp/request`;
      
      // Detectar si es Android para ajustar configuración
      const isAndroid = window.navigator.userAgent.includes('Android') || 
                       window.navigator.userAgent.includes('wv');
      
      const fetchOptions = {
        method: "POST",
        cache: 'no-cache',
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ phone: phoneClean }),
      };
      
      // En Android, NO usar mode: 'cors' ya que puede causar problemas en WebView
      if (!isAndroid) {
        fetchOptions.mode = 'cors';
        fetchOptions.credentials = 'omit';
      }
      
      console.log("🌐 [LOGIN] Enviando OTP request:", esReenvio ? "(Reenvío)" : "");
      console.log("   URL:", otpUrl);
      console.log("   Es Android:", isAndroid);
      console.log("   Opciones:", JSON.stringify(fetchOptions, null, 2));
      
      const res = await fetch(otpUrl, fetchOptions);

      console.log("📥 [LOGIN] Respuesta recibida, status:", res.status, "ok:", res.ok);

      if (!res.ok) {
        const errorText = await res.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: `Error HTTP ${res.status}` };
        }
        
        console.warn("⚠️ [LOGIN] Error en respuesta:", errorData);
        console.log("⚠️ [LOGIN] step actual después del error:", step);
        
        // El step ya se estableció arriba, solo mostrar mensaje
        if (esReenvio) {
          showToast("Error al reenviar código");
        } else {
          showToast("Error al solicitar código, pero puedes ingresarlo si lo recibiste");
        }
        
        // Mostrar alerta pero no bloquear (el campo OTP ya está visible)
        showAlert(errorData.error || "Error enviando código", "warning", { title: "Error" });
        return;
      }

      await res.json(); // La respuesta no contiene datos relevantes, solo confirma que se envió
      console.log("✅ [LOGIN] OTP solicitado exitosamente");

      if (esReenvio) {
        showToast("Código reenviado");
      } else {
        showToast("Código enviado");
      }
      
      console.log("✅ [LOGIN] step final:", step);
    } catch (err) {
      console.error("❌ [LOGIN] Error conectando (OTP):", err);
      const errorMsg = err.message || "Error de conexión";
      
      // El step ya se estableció arriba, solo mostrar mensaje
      console.log("⚠️ [LOGIN] Error de conexión, pero campo OTP ya está visible");
      showToast("Error de conexión, pero puedes ingresar el código si lo recibiste");
      
      // Mostrar alerta informativa pero no bloquear
      const errorDetails = `Error: ${errorMsg}\n\nURL intentada: ${SERVER}/auth/otp/request\n\nVerifica:\n1. Que el servidor esté corriendo en ${SERVER}\n2. Que puedas acceder desde el navegador a ${SERVER}/admin/personalizacion\n3. Que el dispositivo esté en la misma red\n\nSi recibiste el código por chat, puedes ingresarlo ahora.`;
      showAlert(errorDetails, "warning", { title: "Error de conexión" });
    }
  };

  // Efecto para el cooldown del reenvío
  useEffect(() => {
    if (cooldownReenvio > 0) {
      const timer = setTimeout(() => {
        setCooldownReenvio(cooldownReenvio - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldownReenvio]);

  // VERIFY OTP (DEFINITIVO)
  const verifyOtp = async (fromCode = null) => {
    const code = (fromCode ?? otp.join("")).trim();
    const phoneClean = (phone || "").replace(/\D/g, "");

    if (phoneClean.length !== 10) {
      showAlert("Número inválido (debe tener 10 dígitos)", "warning", { title: "Número inválido" });
      return;
    }

    if (code.length !== 6) {
      return;
    }

    if (!SERVER) {
      return showAlert("Servidor no configurado. Por favor, reinicia la aplicación.", "error", { title: "Error de configuración" });
    }

    try {
      const baseUrl = SERVER.endsWith('/') ? SERVER.slice(0, -1) : SERVER;
      const verifyUrl = `${baseUrl}/auth/otp/verify`;
      
      // Detectar si es Android para ajustar configuración
      const isAndroid = window.navigator.userAgent.includes('Android') || 
                       window.navigator.userAgent.includes('wv');
      
      const fetchOptions = {
        method: "POST",
        cache: 'no-cache',
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ phone: phoneClean, code }),
      };
      
      // En Android, NO usar mode: 'cors' ya que puede causar problemas en WebView
      if (!isAndroid) {
        fetchOptions.mode = 'cors';
        fetchOptions.credentials = 'omit';
      }
      
      console.log("🌐 [LOGIN] Verificando OTP:");
      console.log("   URL:", verifyUrl);
      console.log("   Es Android:", isAndroid);
      
      const r = await fetch(verifyUrl, fetchOptions);

      if (!r.ok) {
        const errorText = await r.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: `Error HTTP ${r.status}` };
        }
        showAlert(errorData.error || "Código incorrecto", "error", { title: "Código incorrecto" });
        setOtp(["", "", "", "", "", ""]);
        setTimeout(() => inputsRef.current[0]?.focus(), 80);
        return;
      }

      const data = await r.json();

      // LOGIN REAL
      console.log("🔐 [LOGIN] Recibiendo respuesta del servidor (OTP)...");
      console.log(`   Token recibido (primeros 30): ${data.token?.substring(0, 30) || 'NULL'}...`);
      console.log(`   Token length: ${data.token?.length || 0}`);
      
      // Llamar a login que actualizará currentToken
      await login(data.user, data.token, data.perms);
      
      // Verificar que el token se actualizó
      const verifyAfterLogin = localStorage.getItem("token");
      console.log(`🔐 [LOGIN] Después de login, token en localStorage (primeros 30): ${verifyAfterLogin?.substring(0, 30) || 'NULL'}...`);
      console.log(`   Coincide con token recibido: ${verifyAfterLogin === data.token ? '✅ SÍ' : '❌ NO'}`);
    } catch (err) {
      console.error("❌ [LOGIN] Error en conexión:", err);
      const errorMsg = err.message || "Error de conexión";
      showAlert(`Error conectando al servidor: ${errorMsg}. Verifica que el servidor esté corriendo en ${SERVER}.`, "error", { title: "Error de conexión" });
    }
  };

  // CORREGIR NÚMERO
  const corregirNumero = () => {
    setPhone("");
    setOtp(["", "", "", "", "", ""]);
    setStep(2);
    setTimeout(() => phoneRef.current?.focus(), 80);
  };

  // Obtener URL del fondo de login
  const getFondoLoginUrl = () => {
    if (!personalizacion.fondoLogin) return null;
    const tipo = personalizacion.fondoLoginTipo || "imagen";
    if (tipo === "video") {
      return `${SERVER}/uploads/personalizacion/fondos-login/fondo-login.mp4?t=${Date.now()}`;
    } else if (tipo === "gif") {
      return `${SERVER}/uploads/personalizacion/fondos-login/fondo-login.gif?t=${Date.now()}`;
    } else {
      return `${SERVER}/uploads/personalizacion/fondos-login/fondo-login.png?t=${Date.now()}`;
    }
  };

  // Obtener URL del logo personalizado
  const getLogoUrl = () => {
    if (!SERVER) {
      return null;
    }
    
    try {
      // Asegurarse de que SERVER no termine en barra
      const baseUrl = SERVER.endsWith('/') ? SERVER.slice(0, -1) : SERVER;
      
      if (personalizacion.logo) {
        const logoTipo = personalizacion.logoTipo || "imagen";
        const logoExt = logoTipo === "gif" ? "gif" : logoTipo === "svg" ? "svg" : logoTipo === "jpg" ? "jpg" : "png";
        const logoUrl = `${baseUrl}/uploads/personalizacion/logos/logo.${logoExt}?t=${Date.now()}`;
        return logoUrl;
      }
      // Fallback: logo por defecto desde personalización
      const logoUrl = `${baseUrl}/uploads/personalizacion/logos/logo.png?t=${Date.now()}`;
      return logoUrl;
    } catch (err) {
      console.error("Error obteniendo URL del logo:", err);
      return null;
    }
  };

  const fondoLoginUrl = getFondoLoginUrl();

  return (
    <div 
      className="login-bg" 
      onKeyDown={handleKeyDown}
    >
      {/* Fondo de login personalizado */}
      {fondoLoginUrl && (
        <div className="login-fondo-personalizado">
          {personalizacion.fondoLoginTipo === "video" ? (
            <video
              src={fondoLoginUrl}
              autoPlay
              loop
              muted
              playsInline
              className="login-fondo-video"
            />
          ) : (
            <img
              src={fondoLoginUrl}
              alt="Fondo login"
              className="login-fondo-imagen"
            />
          )}
        </div>
      )}

      {toastMsg && <div className="toast">{toastMsg}</div>}

      <div className="login-container">
        <div className="login-card">
          {/* Branding dentro de la card */}
          <div className="login-branding">
            <div className="login-logo-wrapper">
              {getLogoUrl() ? (
                <img 
                  src={getLogoUrl()} 
                  alt="logo IXORA" 
                  className="login-logo-large"
                  loading="eager"
                  decoding="async"
                  onError={(e) => {
                    // Si falla cargar el logo, mostrar placeholder
                    e.target.style.display = 'none';
                    const wrapper = e.target.parentElement;
                    if (wrapper && !wrapper.querySelector('.logo-placeholder')) {
                      const placeholder = document.createElement('div');
                      placeholder.className = 'logo-placeholder';
                      placeholder.innerHTML = '🏢';
                      placeholder.style.cssText = 'font-size: 60px; text-align: center; width: 100px; height: 100px; display: flex; align-items: center; justify-content: center;';
                      wrapper.appendChild(placeholder);
                    }
                  }}
                />
              ) : (
                <div className="logo-placeholder" style={{fontSize: '60px', textAlign: 'center', width: '100px', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                  🏢
                </div>
              )}
            </div>
            <div className="login-brand-title">Inventario y Control de Operaciones y Recursos Atlas</div>
          </div>

          {/* Formulario */}
          <div className="login-box">
            <div className="login-title">Bienvenido</div>
            <div className="login-welcome-text">Accede a tu cuenta para continuar</div>

            {/* Selector de método de login */}
            <div className="login-method-tabs">
              <button
                className={`login-method-tab ${loginMethod === "whatsapp" ? "active" : ""}`}
                onClick={() => {
                  setLoginMethod("whatsapp");
                  setStep(1);
                  setUsername("");
                  setPassword("");
                  setPhone("");
                  setOtp(["", "", "", "", "", ""]);
                }}
              >
                📱 WhatsApp
              </button>
              <button
                className={`login-method-tab ${loginMethod === "password" ? "active" : ""}`}
                onClick={() => {
                  setLoginMethod("password");
                  setStep(1);
                  setUsername("");
                  setPassword("");
                  setPhone("");
                  setOtp(["", "", "", "", "", ""]);
                }}
              >
                🔐 Usuario
              </button>
            </div>

            {loginMethod === "whatsapp" ? (
              <>
                {/* Debug: mostrar step actual en cada render */}
                {(() => {
                  console.log("🔍 [LOGIN RENDER] loginMethod:", loginMethod, "step:", step, "phone:", phone);
                  return null;
                })()}
                
                {step === 1 && (
                  <>
                    <button
                      className="btn-green"
                      onClick={() => setStep(2)}
                      ref={startBtnRef}
                    >
                      Iniciar sesión
                    </button>
                  </>
                )}

                {step === 2 && (
                  <>
                    <div className="login-input-group">
                      <label className="login-input-label">Número de Teléfono</label>
                      <input
                        type="tel"
                        placeholder="Ingresa tu número de WhatsApp"
                        className="login-input"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                        maxLength={10}
                        ref={phoneRef}
                      />
                    </div>

                    <button 
                      className="btn-green" 
                      onClick={() => {
                        console.log("🔵 [LOGIN] Botón 'Enviar Código' clickeado");
                        console.log("🔵 [LOGIN] step antes de requestOtp:", step);
                        requestOtp();
                      }}
                    >
                      Enviar Código
                    </button>
                  </>
                )}

                {step === 3 && (
                  <>
                    <div className="login-step-title">
                      Verificación de código
                    </div>
                    <div className="login-step-subtitle">
                      Ingresa el código de 6 dígitos que enviamos a {phone}
                    </div>

                    <div className="otp-container">
                      <label className="otp-label">Código OTP</label>
                      <div className="otp-box">
                        {otp.map((v, i) => (
                          <input
                            key={i}
                            ref={(el) => (inputsRef.current[i] = el)}
                            value={v}
                            onChange={(e) => handleOtpChange(e.target.value, i)}
                            maxLength={1}
                            className="otp-input"
                          />
                        ))}
                      </div>
                    </div>

                    <button className="btn-green" onClick={() => verifyOtp()}>
                      Verificar
                    </button>

                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center", marginTop: "15px" }}>
                      <button
                        className="btn-reenviar-otp"
                        onClick={() => requestOtp(true)}
                        disabled={cooldownReenvio > 0}
                        style={{
                          background: cooldownReenvio > 0 ? "rgba(255, 255, 255, 0.1)" : "transparent",
                          border: "1px solid rgba(255, 255, 255, 0.3)",
                          color: cooldownReenvio > 0 ? "rgba(255, 255, 255, 0.5)" : "rgba(255, 255, 255, 0.8)",
                          padding: "8px 16px",
                          borderRadius: "8px",
                          cursor: cooldownReenvio > 0 ? "not-allowed" : "pointer",
                          fontSize: "0.9rem",
                          transition: "all 0.3s ease"
                        }}
                      >
                        {cooldownReenvio > 0 
                          ? `Reenviar código (${cooldownReenvio}s)` 
                          : "🔄 Reenviar código"}
                      </button>

                      <div
                        className="login-mini"
                        onClick={corregirNumero}
                        style={{ cursor: "pointer" }}
                      >
                        ← Verificar / corregir número
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                {step === 1 && (
                  <>
                    <div className="login-input-group">
                      <label className="login-input-label">Usuario</label>
                      <input
                        type="text"
                        placeholder="Ingresa tu nombre de usuario"
                        className="login-input"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        ref={usernameRef}
                      />
                    </div>

                    <div className="login-input-group">
                      <label className="login-input-label">Contraseña</label>
                      <div className="login-input-wrapper">
                        <input
                          type={showPassword ? "text" : "password"}
                          placeholder="Ingresa tu contraseña"
                          className="login-input login-input-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          ref={passwordRef}
                        />
                        <button
                          type="button"
                          className="login-password-toggle"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? "🙈" : "👁️"}
                        </button>
                      </div>
                    </div>

                    <button className="btn-green" onClick={handlePasswordLogin}>
                      Iniciar sesión
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Setup NIP */}
      {/* NIP Modal removed - using temporary codes via chat instead */}
    </div>
  );
}

