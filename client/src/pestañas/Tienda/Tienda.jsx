import React, { useState, useEffect } from "react";
import { getServerUrl } from "../../config/server";
import { useAlert } from "../../components/AlertModal";
import "./Tienda.css";

const SERVER_URL = getServerUrl();

// Estilos inline para asegurar que no se herede nada de PINA
const estiloGlobal = `
  body.tienda-activa {
    overflow-x: hidden !important;
    overflow-y: auto !important;
  }
  body.tienda-activa .menu-trigger,
  body.tienda-activa .menu-panel,
  body.tienda-activa .menu-overlay,
  body.tienda-activa .header-flex,
  body.tienda-activa .fecha-display,
  body.tienda-activa .mensaje-bienvenida,
  body.tienda-activa #mensaje-bienvenida-editable,
  body.tienda-activa .chat-pro-container,
  body.tienda-activa .pina-ia-widget,
  body.tienda-activa .app-fondo-personalizado,
  body.tienda-activa .notifications-container,
  body.tienda-activa .notifications-bell,
  body.tienda-activa .notifications-panel {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }
  .tienda-pro-container {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    overflow-y: auto !important;
    z-index: 9999 !important;
    margin: 0 !important;
    padding: 0 !important;
    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 50%, #dee2e6 100%) !important;
  }
`;

function Tienda() {
  const { showAlert } = useAlert();
  const [productos, setProductos] = useState([]);
  const [productosFiltrados, setProductosFiltrados] = useState([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [carrito, setCarrito] = useState([]);
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [nombreMarca, setNombreMarca] = useState("Nuestra Tienda");
  const [faviconUrl, setFaviconUrl] = useState(null);
  const [mostrarModalPago, setMostrarModalPago] = useState(false);
  const [pestañaActiva, setPestañaActiva] = useState("todos");
  const [filtrosAvanzados, setFiltrosAvanzados] = useState({
    stockMinimo: "",
    stockMaximo: "",
    ordenarPor: "nombre",
    orden: "asc"
  });
  const [mostrarFiltrosAvanzados, setMostrarFiltrosAvanzados] = useState(false);
  const [banners, setBanners] = useState([]);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [mostrarModalProducto, setMostrarModalProducto] = useState(false);
  const [datosCliente, setDatosCliente] = useState({
    nombre: "",
    telefono: "",
    email: "",
    direccion: "",
    metodo_pago: ""
  });
  const [clienteAutenticado, setClienteAutenticado] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [tokenCliente, setTokenCliente] = useState(null);
  const [mostrarModalLogin, setMostrarModalLogin] = useState(false);
  const [mostrarModalRegistro, setMostrarModalRegistro] = useState(false);
  const [mostrarModalRecuperar, setMostrarModalRecuperar] = useState(false);
  const [formRecuperar, setFormRecuperar] = useState({
    email: "",
    codigo: "",
    password_nueva: "",
    password_confirmar: ""
  });
  const [pasoRecuperar, setPasoRecuperar] = useState(1); // 1: solicitar código, 2: restablecer
  const [mostrarModalCuenta, setMostrarModalCuenta] = useState(false);
  const [pestañaActivaCuenta, setPestañaActivaCuenta] = useState("perfil");
  const [formLogin, setFormLogin] = useState({ email: "", password: "" });
  const [formRegistro, setFormRegistro] = useState({ email: "", password: "", nombre: "", telefono: "" });
  const [mostrarPasswordRegistro, setMostrarPasswordRegistro] = useState(false);
  const [direccionesCliente, setDireccionesCliente] = useState([]);
  const [tarjetasCliente, setTarjetasCliente] = useState([]);
  const [pedidosCliente, setPedidosCliente] = useState([]);
  const [direccionSeleccionadaId, setDireccionSeleccionadaId] = useState(null);
  const [usarDireccionNueva, setUsarDireccionNueva] = useState(false);
  const [tarjetaSeleccionadaId, setTarjetaSeleccionadaId] = useState(null);

  const formatearDireccion = (dir) => {
    if (!dir) return "";
    return `${dir.calle || ""} ${dir.numero_exterior || ""} ${dir.colonia || ""}, ${dir.ciudad || ""}, ${dir.estado || ""}, ${dir.codigo_postal || ""}`.replace(/\s+/g, " ").trim();
  };

  useEffect(() => {
    if (clienteAutenticado) {
      setDatosCliente((prev) => ({
        ...prev,
        nombre: clienteAutenticado.nombre || prev.nombre,
        telefono: clienteAutenticado.telefono || prev.telefono,
        email: clienteAutenticado.email || prev.email,
      }));
    }
  }, [clienteAutenticado]);

  useEffect(() => {
    // Aplicar estilos globales para aislar la página
    const style = document.createElement('style');
    style.textContent = estiloGlobal;
    document.head.appendChild(style);
    document.body.classList.add('tienda-activa');

    // Cargar nombre y favicon desde localStorage como respaldo temporal
    const nombreGuardado = localStorage.getItem('tienda_nombre');
    const faviconUrlGuardado = localStorage.getItem('tienda_favicon_url');
    
    // Usar nombre guardado solo como respaldo temporal mientras carga desde el servidor
    if (nombreGuardado) {
      document.title = nombreGuardado;
      setNombreMarca(nombreGuardado);
    } else {
      // Si no hay nombre guardado, usar valor por defecto temporalmente
      document.title = "Tienda";
      setNombreMarca("Nuestra Tienda");
    }

    // Remover favicons anteriores (excepto el de tienda si existe)
    document.querySelectorAll("link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']").forEach(el => {
      if (el.id !== 'tienda-favicon') {
        el.remove();
      }
    });

    // Aplicar favicon guardado inmediatamente si existe
    if (faviconUrlGuardado) {
      const faviconAnterior = document.getElementById('tienda-favicon');
      if (faviconAnterior) {
        document.head.removeChild(faviconAnterior);
      }
      const linkFavicon = document.createElement('link');
      linkFavicon.rel = 'icon';
      linkFavicon.type = 'image/x-icon';
      linkFavicon.id = 'tienda-favicon';
      linkFavicon.href = faviconUrlGuardado;
      document.head.appendChild(linkFavicon);
      setFaviconUrl(faviconUrlGuardado);
    }
    
    cargarProductos();
    cargarNombreMarca();
    cargarFaviconTienda();
    cargarBanners();

    // Verificar si hay un token guardado
    const tokenGuardado = localStorage.getItem("tienda_cliente_token");
    if (tokenGuardado) {
      verificarClienteAutenticado(tokenGuardado);
    }

    return () => {
      document.body.classList.remove('tienda-activa');
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
      // NO restaurar título ni remover favicon - mantenerlos permanentes
    };
  }, []);

  // Escuchar actualizaciones de personalización de la tienda
  useEffect(() => {
    if (window.socket) {
      const socket = window.socket;
      socket.on("tienda_personalizacion_actualizada", () => {
        // Recargar nombre de marca (esto actualizará el título automáticamente)
        cargarNombreMarca();
        // Recargar favicon cuando se actualice la personalización
        cargarFaviconTienda();
      });

      socket.on("tienda_favicon_actualizado", () => {
        // Recargar favicon cuando se actualice específicamente
        cargarFaviconTienda();
      });

      // Escuchar actualizaciones de inventario en tiempo real
      socket.on("inventario_actualizado", () => {
        // Recargar productos cuando se actualice el inventario
        cargarProductos();
      });

      return () => {
        socket.off("tienda_personalizacion_actualizada");
        socket.off("tienda_favicon_actualizado");
        socket.off("inventario_actualizado");
      };
    }
  }, []);

  // Actualizar título cuando cambie nombreMarca y guardarlo en localStorage
  useEffect(() => {
    if (nombreMarca) {
      document.title = nombreMarca;
      localStorage.setItem('tienda_nombre', nombreMarca);
    }
  }, [nombreMarca]);

  // Actualizar favicon cuando cambie faviconUrl y guardarlo en localStorage
  useEffect(() => {
    if (faviconUrl) {
      // Remover favicon anterior si existe
      const faviconAnterior = document.getElementById('tienda-favicon');
      if (faviconAnterior) {
        document.head.removeChild(faviconAnterior);
      }
      
      // Crear elemento link para el favicon
      const linkFavicon = document.createElement('link');
      linkFavicon.rel = 'icon';
      linkFavicon.type = 'image/x-icon';
      linkFavicon.id = 'tienda-favicon';
      linkFavicon.href = faviconUrl;
      document.head.appendChild(linkFavicon);
      
      // Guardar en localStorage para persistencia
      localStorage.setItem('tienda_favicon_url', faviconUrl);
    }
  }, [faviconUrl]);

  // Verificar y corregir el título periódicamente para asegurar que se mantenga
  useEffect(() => {
    const verificarTitulo = () => {
      const nombreGuardado = localStorage.getItem('tienda_nombre');
      if (nombreGuardado && document.title !== nombreGuardado) {
        document.title = nombreGuardado;
      }
    };

    // Establecer el título inmediatamente
    verificarTitulo();

    // Verificar cada segundo si el título cambió y corregirlo
    const intervalo = setInterval(verificarTitulo, 1000);

    return () => clearInterval(intervalo);
  }, []);

  // Verificar y corregir el favicon periódicamente para asegurar que se mantenga
  useEffect(() => {
    const verificarFavicon = () => {
      const faviconGuardado = localStorage.getItem('tienda_favicon_url');
      if (faviconGuardado) {
        const faviconActual = document.getElementById('tienda-favicon');
        if (!faviconActual || faviconActual.href !== faviconGuardado) {
          // Remover favicon anterior si existe
          if (faviconActual) {
            document.head.removeChild(faviconActual);
          }
          
          // Crear elemento link para el favicon
          const linkFavicon = document.createElement('link');
          linkFavicon.rel = 'icon';
          linkFavicon.type = 'image/x-icon';
          linkFavicon.id = 'tienda-favicon';
          linkFavicon.href = faviconGuardado;
          document.head.appendChild(linkFavicon);
        }
      }
    };

    // Establecer el favicon inmediatamente
    verificarFavicon();

    // Verificar cada segundo si el favicon cambió y corregirlo
    const intervalo = setInterval(verificarFavicon, 1000);

    return () => clearInterval(intervalo);
  }, []);

  useEffect(() => {
    filtrarProductos();
  }, [productos, categoriaSeleccionada, busqueda, pestañaActiva, filtrosAvanzados]);

  const cargarNombreMarca = async () => {
    try {
      const response = await fetch(`${SERVER_URL}/admin/personalizacion`);
      if (response.ok) {
        const data = await response.json();
        if (data.nombre_tienda && data.nombre_tienda.trim()) {
          const nombreTienda = data.nombre_tienda.trim();
          setNombreMarca(nombreTienda);
          // Guardar en localStorage para persistencia
          localStorage.setItem('tienda_nombre', nombreTienda);
          // Actualizar título inmediatamente
          document.title = nombreTienda;
        } else {
          // Si no hay nombre en el servidor, mantener el guardado o usar default
          const nombreGuardado = localStorage.getItem('tienda_nombre');
          if (nombreGuardado) {
            setNombreMarca(nombreGuardado);
            document.title = nombreGuardado;
          } else {
            const nombreDefault = "Nuestra Tienda";
            setNombreMarca(nombreDefault);
            localStorage.setItem('tienda_nombre', nombreDefault);
            document.title = nombreDefault;
          }
        }
      } else {
        // Si falla la petición, usar el nombre guardado
        const nombreGuardado = localStorage.getItem('tienda_nombre');
        if (nombreGuardado) {
          setNombreMarca(nombreGuardado);
          document.title = nombreGuardado;
        }
      }
    } catch (error) {
      console.error("Error cargando nombre de marca:", error);
      // Si hay error, usar el nombre guardado
      const nombreGuardado = localStorage.getItem('tienda_nombre');
      if (nombreGuardado) {
        setNombreMarca(nombreGuardado);
        document.title = nombreGuardado;
      } else {
        const nombreDefault = "Nuestra Tienda";
        setNombreMarca(nombreDefault);
        localStorage.setItem('tienda_nombre', nombreDefault);
        document.title = nombreDefault;
      }
    }
  };

  const cargarFaviconTienda = async () => {
    try {
      const faviconUrl = `${SERVER_URL}/tienda/favicon?t=${Date.now()}`;
      
      // Verificar si existe cargando la imagen
      const img = new Image();
      img.onload = () => {
        // Remover favicon anterior si existe
        const faviconAnterior = document.getElementById('tienda-favicon');
        if (faviconAnterior) {
          document.head.removeChild(faviconAnterior);
        }
        
        // Crear elemento link para el favicon
        const linkFavicon = document.createElement('link');
        linkFavicon.rel = 'icon';
        linkFavicon.type = 'image/x-icon';
        linkFavicon.id = 'tienda-favicon';
        linkFavicon.href = faviconUrl;
        document.head.appendChild(linkFavicon);
        
        // Guardar URL del favicon en estado y localStorage
        setFaviconUrl(faviconUrl);
        localStorage.setItem('tienda_favicon_url', faviconUrl);
      };
      img.onerror = () => {
        // Si no existe favicon nuevo, usar el guardado
        const faviconGuardado = localStorage.getItem('tienda_favicon_url');
        if (faviconGuardado) {
          setFaviconUrl(faviconGuardado);
          const faviconAnterior = document.getElementById('tienda-favicon');
          if (faviconAnterior) {
            document.head.removeChild(faviconAnterior);
          }
          const linkFavicon = document.createElement('link');
          linkFavicon.rel = 'icon';
          linkFavicon.type = 'image/x-icon';
          linkFavicon.id = 'tienda-favicon';
          linkFavicon.href = faviconGuardado;
          document.head.appendChild(linkFavicon);
        }
      };
      img.src = faviconUrl;
    } catch (error) {
      console.error("Error cargando favicon de tienda:", error);
      // Si hay error, usar el favicon guardado
      const faviconGuardado = localStorage.getItem('tienda_favicon_url');
      if (faviconGuardado) {
        setFaviconUrl(faviconGuardado);
        const faviconAnterior = document.getElementById('tienda-favicon');
        if (faviconAnterior) {
          document.head.removeChild(faviconAnterior);
        }
        const linkFavicon = document.createElement('link');
        linkFavicon.rel = 'icon';
        linkFavicon.type = 'image/x-icon';
        linkFavicon.id = 'tienda-favicon';
        linkFavicon.href = faviconGuardado;
        document.head.appendChild(linkFavicon);
      }
    }
  };

  const cargarProductos = async () => {
    try {
      setCargando(true);
      const response = await fetch(`${SERVER_URL}/inventario/productos-venta`);
      if (!response.ok) throw new Error("Error cargando productos");
      const data = await response.json();
      setProductos(data);
    } catch (error) {
      console.error("Error cargando productos:", error);
    } finally {
      setCargando(false);
    }
  };

  const cargarBanners = async () => {
    try {
      const response = await fetch(`${SERVER_URL}/tienda/banners`);
      if (response.ok) {
        const data = await response.json();
        setBanners(data || []);
      }
    } catch (error) {
      console.error("Error cargando banners:", error);
      setBanners([]);
    }
  };

  // Autenticación de clientes
  const verificarClienteAutenticado = async (token) => {
    if (!token) {
      setTokenCliente(null);
      setClienteAutenticado(null);
      return;
    }
    
    try {
      const response = await fetch(`${SERVER_URL}/api/tienda/clientes/perfil`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const cliente = await response.json();
        setClienteAutenticado(cliente);
        setTokenCliente(token);
        cargarDatosCliente(token);
      } else {
        // Si el token es inválido o expiró, limpiar sin mostrar error (es normal)
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem("tienda_cliente_token");
          setTokenCliente(null);
          setClienteAutenticado(null);
        }
      }
    } catch (error) {
      // Solo mostrar error si no es un error de autenticación (401/403)
      if (!error.message?.includes('401') && !error.message?.includes('403')) {
        console.error("Error verificando cliente:", error);
      }
      localStorage.removeItem("tienda_cliente_token");
      setTokenCliente(null);
      setClienteAutenticado(null);
    }
  };

  const cargarDatosCliente = async (token) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      // Cargar direcciones
      const dirResponse = await fetch(`${SERVER_URL}/api/tienda/clientes/direcciones`, { headers });
      if (dirResponse.ok) {
        const direcciones = await dirResponse.json();
        setDireccionesCliente(direcciones);
        // Si hay dirección principal, usarla en datosCliente
        const principal = direcciones.find(d => d.es_principal === 1);
        if (direcciones.length > 0) {
          const seleccionada = principal || direcciones[0];
          setDireccionSeleccionadaId(seleccionada.id);
          setUsarDireccionNueva(false);
          setDatosCliente(prev => ({
            ...prev,
            direccion: formatearDireccion(seleccionada),
          }));
        } else {
          setDireccionSeleccionadaId(null);
          setUsarDireccionNueva(true);
          setDatosCliente(prev => ({
            ...prev,
            direccion: "",
          }));
        }
      }

      // Cargar tarjetas
      const tarjResponse = await fetch(`${SERVER_URL}/api/tienda/clientes/tarjetas`, { headers });
      if (tarjResponse.ok) {
        const tarjetas = await tarjResponse.json();
        setTarjetasCliente(tarjetas);
        if (tarjetas.length > 0) {
          const preferida = tarjetas.find(t => t.es_principal === 1) || tarjetas[0];
          setTarjetaSeleccionadaId(preferida.id);
          setDatosCliente(prev => ({
            ...prev,
            metodo_pago: prev.metodo_pago || "Tarjeta",
          }));
        } else {
          setTarjetaSeleccionadaId(null);
        }
      }

      // Cargar pedidos
      const pedResponse = await fetch(`${SERVER_URL}/api/tienda/clientes/pedidos`, { headers });
      if (pedResponse.ok) {
        const pedidos = await pedResponse.json();
        setPedidosCliente(pedidos);
      }
    } catch (error) {
      console.error("Error cargando datos del cliente:", error);
    }
  };

  const seleccionarDireccionGuardada = (id) => {
    setDireccionSeleccionadaId(id);
    setUsarDireccionNueva(false);
    const dir = direccionesCliente.find((d) => d.id === id);
    if (dir) {
      setDatosCliente((prev) => ({
        ...prev,
        direccion: formatearDireccion(dir),
      }));
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${SERVER_URL}/api/tienda/clientes/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formLogin),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error en el login");
      }

      const data = await response.json();
      localStorage.setItem("tienda_cliente_token", data.token);
      setTokenCliente(data.token);
      setClienteAutenticado(data.cliente);
      setFormLogin({ email: "", password: "" });
      setMostrarModalLogin(false);
      cargarDatosCliente(data.token);
      showAlert("¡Bienvenido de nuevo!", "success");
    } catch (error) {
      showAlert(error.message, "error");
    }
  };

  const handleRegistro = async (e) => {
    e.preventDefault();
    try {
      if (formRegistro.password.length < 6) {
        throw new Error("La contraseña debe tener al menos 6 caracteres");
      }

      const response = await fetch(`${SERVER_URL}/api/tienda/clientes/registro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formRegistro),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error en el registro");
      }

      const data = await response.json();
      localStorage.setItem("tienda_cliente_token", data.token);
      setTokenCliente(data.token);
      setClienteAutenticado(data.cliente);
      setFormRegistro({ email: "", password: "", nombre: "", telefono: "" });
      setMostrarModalRegistro(false);
      setDatosCliente(prev => ({
        ...prev,
        nombre: data.cliente.nombre,
        email: data.cliente.email,
        telefono: data.cliente.telefono || "",
      }));
      showAlert("¡Registro exitoso! Bienvenido.", "success");
    } catch (error) {
      showAlert(error.message, "error");
    }
  };

  const handleSolicitarCodigo = async (e) => {
    e.preventDefault();
    try {
      if (!formRecuperar.email || !formRecuperar.email.trim()) {
        showAlert("Por favor ingresa tu email", "warning");
        return;
      }

      const response = await fetch(`${SERVER_URL}/api/tienda/clientes/recuperar-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formRecuperar.email.trim() }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Error al solicitar código");
      }

      // Si estamos en desarrollo, mostrar el código
      if (data.codigo) {
        showAlert(`Código de recuperación: ${data.codigo}\n\n(Esto solo aparece en desarrollo)`, "info");
      } else {
        showAlert("Si el email existe, se ha enviado un código de recuperación a tu correo", "info");
      }

      setPasoRecuperar(2);
    } catch (error) {
      showAlert(error.message, "error");
    }
  };

  const handleRestablecerPassword = async (e) => {
    e.preventDefault();
    try {
      if (!formRecuperar.codigo || !formRecuperar.password_nueva) {
        showAlert("Por favor completa todos los campos", "warning");
        return;
      }

      if (formRecuperar.password_nueva.length < 6) {
        showAlert("La contraseña debe tener al menos 6 caracteres", "warning");
        return;
      }

      if (formRecuperar.password_nueva !== formRecuperar.password_confirmar) {
        showAlert("Las contraseñas no coinciden", "error");
        return;
      }

      const response = await fetch(`${SERVER_URL}/api/tienda/clientes/restablecer-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formRecuperar.email.trim(),
          codigo: formRecuperar.codigo.trim(),
          password_nueva: formRecuperar.password_nueva,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al restablecer contraseña");
      }

      showAlert("Contraseña restablecida correctamente. Ya puedes iniciar sesión.", "success");
      setMostrarModalRecuperar(false);
      setFormRecuperar({ email: "", codigo: "", password_nueva: "", password_confirmar: "" });
      setPasoRecuperar(1);
      setMostrarModalLogin(true);
    } catch (error) {
      showAlert(error.message, "error");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("tienda_cliente_token");
    setTokenCliente(null);
    setClienteAutenticado(null);
    setDireccionesCliente([]);
    setTarjetasCliente([]);
    setPedidosCliente([]);
    setDatosCliente({ nombre: "", telefono: "", email: "", direccion: "", metodo_pago: "" });
    setMostrarModalCuenta(false);
  };

  // Agrupar productos por nombre
  const agruparProductosPorNombre = (productosList) => {
    const agrupados = {};
    
    productosList.forEach(producto => {
      const nombre = producto.nombre?.trim() || "Sin nombre";
      if (!agrupados[nombre]) {
        agrupados[nombre] = {
          nombre: nombre,
          categoria: producto.categoria,
          foto: producto.foto,
          productos: []
        };
      }
      agrupados[nombre].productos.push(producto);
    });
    
    return Object.values(agrupados);
  };

  const filtrarProductos = () => {
    let filtrados = productos;

    // Filtrar por pestaña
    if (pestañaActiva === "destacados") {
      filtrados = filtrados.filter(p => p.disponible).slice(0, 12);
    } else if (pestañaActiva === "stock-bajo") {
      filtrados = filtrados.filter(p => p.disponible && p.piezas_disponibles < 100 && p.piezas_disponibles >= 1);
    } else if (pestañaActiva === "disponibles") {
      filtrados = filtrados.filter(p => p.disponible);
    }

    // Filtrar por categoría
    if (categoriaSeleccionada !== "todas") {
      filtrados = filtrados.filter(p => p.categoria === categoriaSeleccionada);
    }

    // Filtrar por búsqueda
    if (busqueda.trim()) {
      const busquedaLower = busqueda.toLowerCase();
      filtrados = filtrados.filter(p =>
        p.nombre?.toLowerCase().includes(busquedaLower) ||
        p.codigo?.toLowerCase().includes(busquedaLower) ||
        p.presentacion?.toLowerCase().includes(busquedaLower) ||
        p.categoria?.toLowerCase().includes(busquedaLower)
      );
    }

    // Filtros avanzados
    if (filtrosAvanzados.stockMinimo) {
      const min = parseInt(filtrosAvanzados.stockMinimo);
      if (!isNaN(min)) {
        filtrados = filtrados.filter(p => (p.piezas_disponibles || 0) >= min);
      }
    }

    if (filtrosAvanzados.stockMaximo) {
      const max = parseInt(filtrosAvanzados.stockMaximo);
      if (!isNaN(max)) {
        filtrados = filtrados.filter(p => (p.piezas_disponibles || 0) <= max);
      }
    }

    // Ordenar
    filtrados = [...filtrados].sort((a, b) => {
      let aVal, bVal;
      switch (filtrosAvanzados.ordenarPor) {
        case "nombre":
          aVal = a.nombre?.toLowerCase() || "";
          bVal = b.nombre?.toLowerCase() || "";
          break;
        case "stock":
          aVal = a.piezas_disponibles || 0;
          bVal = b.piezas_disponibles || 0;
          break;
        case "codigo":
          aVal = a.codigo?.toLowerCase() || "";
          bVal = b.codigo?.toLowerCase() || "";
          break;
        default:
          aVal = a.nombre?.toLowerCase() || "";
          bVal = b.nombre?.toLowerCase() || "";
      }
      
      if (filtrosAvanzados.orden === "asc") {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });

    // Agrupar productos por nombre
    const productosAgrupados = agruparProductosPorNombre(filtrados);
    setProductosFiltrados(productosAgrupados);
  };

  const categorias = ["todas", ...new Set(productos.map(p => p.categoria).filter(Boolean))];
  
  // Variables calculadas para uso futuro (comentadas para evitar warnings de ESLint)
  // const productosPorCategoria = categorias
  //   .filter(cat => cat !== "todas")
  //   .reduce((acc, cat) => {
  //     acc[cat] = productos.filter(p => p.categoria === cat && p.disponible);
  //     return acc;
  //   }, {});
  // const productosDestacados = productos.filter(p => p.disponible).slice(0, 6);
  // const productosStockBajo = productos.filter(p => p.disponible && p.piezas_disponibles < 100 && p.piezas_disponibles >= 1);

  const abrirModalProducto = (productoAgrupado) => {
    setProductoSeleccionado(productoAgrupado);
    setMostrarModalProducto(true);
  };

  const cerrarModalProducto = () => {
    setProductoSeleccionado(null);
    setMostrarModalProducto(false);
  };

  const agregarAlCarrito = (producto) => {
    if (!producto.disponible) {
      showAlert("Este producto no está disponible en este momento", "warning");
      return;
    }
    
    const existente = carrito.find(item => item.codigo === producto.codigo);
    if (existente) {
      setCarrito(carrito.map(item =>
        item.codigo === producto.codigo
          ? { ...item, cantidad: item.cantidad + 1 }
          : item
      ));
    } else {
      setCarrito([...carrito, { ...producto, cantidad: 1 }]);
    }
    setCarritoAbierto(true);
    cerrarModalProducto();
  };

  const quitarDelCarrito = (codigo) => {
    setCarrito(carrito.filter(item => item.codigo !== codigo));
  };

  const actualizarCantidad = (codigo, cantidad) => {
    if (cantidad <= 0) {
      quitarDelCarrito(codigo);
      return;
    }
    setCarrito(carrito.map(item =>
      item.codigo === codigo ? { ...item, cantidad } : item
    ));
  };

  const obtenerTotalCarrito = () => {
    return carrito.reduce((sum, item) => sum + item.cantidad, 0);
  };

  const abrirModalPago = () => {
    if (carrito.length === 0) {
      showAlert("El carrito está vacío", "warning");
      return;
    }
    // Asegurar que los datos estén prellenados cuando el cliente está autenticado
    if (clienteAutenticado) {
      setDatosCliente((prev) => ({
        ...prev,
        nombre: clienteAutenticado.nombre || prev.nombre,
        telefono: clienteAutenticado.telefono || prev.telefono,
        email: clienteAutenticado.email || prev.email,
      }));
    }
    if (direccionesCliente.length > 0 && !usarDireccionNueva) {
      const dirSeleccionada =
        direccionesCliente.find((d) => d.id === direccionSeleccionadaId) ||
        direccionesCliente.find((d) => d.es_principal === 1) ||
        direccionesCliente[0];
      if (dirSeleccionada) {
        setDireccionSeleccionadaId(dirSeleccionada.id);
        setDatosCliente((prev) => ({ ...prev, direccion: formatearDireccion(dirSeleccionada) }));
      }
    } else if (direccionesCliente.length === 0) {
      setUsarDireccionNueva(true);
    }
    if (tarjetasCliente.length > 0 && !datosCliente.metodo_pago) {
      setDatosCliente((prev) => ({ ...prev, metodo_pago: "Tarjeta" }));
    }
    setMostrarModalPago(true);
  };

  const cerrarModalPago = () => {
    setMostrarModalPago(false);
    const dirBase =
      !usarDireccionNueva && direccionesCliente.length > 0
        ? formatearDireccion(
            direccionesCliente.find((d) => d.id === direccionSeleccionadaId) ||
              direccionesCliente.find((d) => d.es_principal === 1) ||
              direccionesCliente[0]
          )
        : "";
    setDatosCliente({
      nombre: clienteAutenticado?.nombre || "",
      telefono: clienteAutenticado?.telefono || "",
      email: clienteAutenticado?.email || "",
      direccion: dirBase,
      metodo_pago: tarjetasCliente.length > 0 ? "Tarjeta" : ""
    });
    setUsarDireccionNueva(direccionesCliente.length === 0);
  };

  const realizarPedido = async () => {
    if (!datosCliente.nombre || !datosCliente.nombre.trim()) {
      showAlert("El nombre es requerido", "warning");
      return;
    }

    if (!datosCliente.telefono || !datosCliente.telefono.trim()) {
      showAlert("El teléfono es requerido", "warning");
      return;
    }

    if (!datosCliente.direccion || !datosCliente.direccion.trim()) {
      showAlert("La dirección es requerida", "warning");
      return;
    }

    if (!datosCliente.metodo_pago) {
      showAlert("Por favor selecciona un método de pago", "warning");
      return;
    }

    try {
      // Preparar detalle de la orden
      const detalle = carrito.map(item => ({
        codigo_producto: item.codigo,
        nombre_producto: item.nombre,
        cantidad: item.cantidad,
        unidad: "PZA",
        precio_unitario: item.precio || 0,
        descuento: 0,
      }));

      // Crear orden de venta usando endpoint público de tienda
      const ordenResponse = await fetch(`${SERVER_URL}/api/ventas/tienda/orden`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre_cliente: datosCliente.nombre.trim(),
          telefono: datosCliente.telefono.trim(),
          email: datosCliente.email?.trim() || null,
          direccion: datosCliente.direccion.trim(),
          metodo_pago: datosCliente.metodo_pago,
          detalle: detalle,
        }),
      });

      if (!ordenResponse.ok) {
        const error = await ordenResponse.json();
        throw new Error(error.error || "Error al crear la orden");
      }

      const ordenData = await ordenResponse.json();
      showAlert(`Pedido realizado exitosamente!\nNúmero de orden: ${ordenData.numero_orden}\n\nTe contactaremos pronto para confirmar tu pedido.`, "success");
      
      // Limpiar carrito y cerrar modales
      setCarrito([]);
      setCarritoAbierto(false);
      cerrarModalPago();
    } catch (error) {
      console.error("Error realizando pedido:", error);
      showAlert(`Error al realizar el pedido: ${error.message}`, "error");
    }
  };

  if (cargando) {
    return (
      <div className="tienda-pro-container">
        <div className="tienda-pro-loading">
          <div className="tienda-pro-spinner"></div>
          <p>Cargando productos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tienda-pro-container">
      {/* Header Premium */}
      <header className="tienda-pro-header">
        <div className="tienda-pro-header-content">
          <div className="tienda-pro-logo-section">
            <h1 className="tienda-pro-brand">{nombreMarca}</h1>
            <p className="tienda-pro-tagline">Suplementos Premium de Calidad</p>
          </div>
          <div className="tienda-pro-header-actions">
            {clienteAutenticado ? (
              <>
                <button 
                  className="tienda-pro-btn-account"
                  onClick={() => setMostrarModalCuenta(true)}
                  title={clienteAutenticado.nombre || "Mi Cuenta"}
                >
                  <span>👤</span>
                  <span>{(clienteAutenticado.nombre && clienteAutenticado.nombre.length > 15) 
                    ? clienteAutenticado.nombre.substring(0, 15) + "..." 
                    : (clienteAutenticado.nombre || "Mi Cuenta")}</span>
                </button>
                <button 
                  className="tienda-pro-btn-logout"
                  onClick={handleLogout}
                >
                  Salir
                </button>
              </>
            ) : (
              <>
                <button 
                  className="tienda-pro-btn-login"
                  onClick={() => setMostrarModalLogin(true)}
                >
                  Iniciar Sesión
                </button>
                <button 
                  className="tienda-pro-btn-register"
                  onClick={() => setMostrarModalRegistro(true)}
                >
                  Registrarse
                </button>
              </>
            )}
            <div 
              className="tienda-pro-carrito-btn" 
              onClick={() => setCarritoAbierto(!carritoAbierto)}
            >
              <span className="tienda-pro-carrito-icon">🛒</span>
              <span className="tienda-pro-carrito-badge">{obtenerTotalCarrito()}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Banners Publicitarios */}
      {banners.length > 0 && (
        <section className="tienda-pro-banners">
          <div className="tienda-pro-banners-container">
            {banners.map((banner, idx) => (
              <div key={idx} className="tienda-pro-banner-item">
                {banner.tipo === "video" ? (
                  <video 
                    className="tienda-pro-banner-media"
                    autoPlay 
                    loop 
                    muted 
                    playsInline
                    src={banner.url.startsWith('http') ? banner.url : `${SERVER_URL}${banner.url}`}
                  />
                ) : (
                  <img 
                    className="tienda-pro-banner-media"
                    src={banner.url.startsWith('http') ? banner.url : `${SERVER_URL}${banner.url}`}
                    alt={banner.titulo || "Banner promocional"}
                  />
                )}
                {banner.titulo && (
                  <div className="tienda-pro-banner-overlay">
                    <h3>{banner.titulo}</h3>
                    {banner.descripcion && <p>{banner.descripcion}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pestañas de Navegación */}
      <section className="tienda-pro-tabs">
        <div className="tienda-pro-tabs-container">
          <button
            className={`tienda-pro-tab ${pestañaActiva === "todos" ? "active" : ""}`}
            onClick={() => setPestañaActiva("todos")}
          >
            Todos los Productos
          </button>
          <button
            className={`tienda-pro-tab ${pestañaActiva === "destacados" ? "active" : ""}`}
            onClick={() => setPestañaActiva("destacados")}
          >
            Destacados
          </button>
          <button
            className={`tienda-pro-tab ${pestañaActiva === "disponibles" ? "active" : ""}`}
            onClick={() => setPestañaActiva("disponibles")}
          >
            Disponibles
          </button>
          <button
            className={`tienda-pro-tab ${pestañaActiva === "stock-bajo" ? "active" : ""}`}
            onClick={() => setPestañaActiva("stock-bajo")}
          >
            Últimas Unidades
          </button>
        </div>
      </section>

      {/* Buscador y Filtros Avanzados */}
      <section className="tienda-pro-filtros">
        <div className="tienda-pro-filtros-container">
          <div className="tienda-pro-search-box">
            <svg className="tienda-pro-search-icon" width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M12.5 11H11.71L11.43 10.73C12.41 9.59 13 8.11 13 6.5C13 2.91 10.09 0 6.5 0C2.91 0 0 2.91 0 6.5C0 10.09 2.91 13 6.5 13C8.11 13 9.59 12.41 10.73 11.43L11 11.71V12.5L16 17.49L17.49 16L12.5 11ZM6.5 11C4.01 11 2 8.99 2 6.5C2 4.01 4.01 2 6.5 2C8.99 2 11 4.01 11 6.5C11 8.99 8.99 11 6.5 11Z" fill="#9ca3af"/>
            </svg>
            <input
              type="text"
              placeholder="Buscar por nombre, código, categoría..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="tienda-pro-search-input"
            />
          </div>
          <div className="tienda-pro-categoria-filter">
            <select
              value={categoriaSeleccionada}
              onChange={(e) => setCategoriaSeleccionada(e.target.value)}
              className="tienda-pro-select"
            >
              {categorias.map(cat => (
                <option key={cat} value={cat}>
                  {cat === "todas" ? "Todas las categorías" : cat}
                </option>
              ))}
            </select>
          </div>
          <button
            className="tienda-pro-filtros-toggle"
            onClick={() => setMostrarFiltrosAvanzados(!mostrarFiltrosAvanzados)}
          >
            {mostrarFiltrosAvanzados ? "Ocultar" : "Mostrar"} Filtros
          </button>
        </div>

        {/* Panel de Filtros Avanzados */}
        {mostrarFiltrosAvanzados && (
          <div className="tienda-pro-filtros-avanzados">
            <div className="tienda-pro-filtros-avanzados-grid">
              <div className="tienda-pro-filtro-group">
                <label>Stock Mínimo</label>
                <input
                  type="number"
                  placeholder="Ej: 10"
                  value={filtrosAvanzados.stockMinimo}
                  onChange={(e) => setFiltrosAvanzados({...filtrosAvanzados, stockMinimo: e.target.value})}
                  className="tienda-pro-input"
                />
              </div>
              <div className="tienda-pro-filtro-group">
                <label>Stock Máximo</label>
                <input
                  type="number"
                  placeholder="Ej: 100"
                  value={filtrosAvanzados.stockMaximo}
                  onChange={(e) => setFiltrosAvanzados({...filtrosAvanzados, stockMaximo: e.target.value})}
                  className="tienda-pro-input"
                />
              </div>
              <div className="tienda-pro-filtro-group">
                <label>Ordenar por</label>
                <select
                  value={filtrosAvanzados.ordenarPor}
                  onChange={(e) => setFiltrosAvanzados({...filtrosAvanzados, ordenarPor: e.target.value})}
                  className="tienda-pro-select"
                >
                  <option value="nombre">Nombre</option>
                  <option value="codigo">Código</option>
                  <option value="stock">Stock</option>
                </select>
              </div>
              <div className="tienda-pro-filtro-group">
                <label>Orden</label>
                <select
                  value={filtrosAvanzados.orden}
                  onChange={(e) => setFiltrosAvanzados({...filtrosAvanzados, orden: e.target.value})}
                  className="tienda-pro-select"
                >
                  <option value="asc">Ascendente</option>
                  <option value="desc">Descendente</option>
                </select>
              </div>
            </div>
            <button
              className="tienda-pro-limpiar-filtros"
              onClick={() => {
                setFiltrosAvanzados({
                  stockMinimo: "",
                  stockMaximo: "",
                  ordenarPor: "nombre",
                  orden: "asc"
                });
                setBusqueda("");
                setCategoriaSeleccionada("todas");
              }}
            >
              Limpiar Filtros
            </button>
          </div>
        )}
      </section>

      {/* Productos Grid */}
      {!productosFiltrados || productosFiltrados.length === 0 ? (
        <section className="tienda-pro-empty">
          <div className="tienda-pro-empty-content">
            <span className="tienda-pro-empty-icon">📦</span>
            <h3>No se encontraron productos</h3>
            <p>Intenta con otros filtros de búsqueda</p>
          </div>
        </section>
      ) : (
        <section className="tienda-pro-productos">
          <div className="tienda-pro-productos-header">
            <h2 className="tienda-pro-productos-title">
              {productosFiltrados.length} producto{productosFiltrados.length !== 1 ? 's' : ''} encontrado{productosFiltrados.length !== 1 ? 's' : ''}
            </h2>
          </div>
          <div className="tienda-pro-grid">
            {productosFiltrados.map((productoAgrupado, idx) => {
              const productosDisponibles = productoAgrupado.productos.filter(p => p.disponible);
              const presentaciones = productoAgrupado.productos.map(p => p.presentacion).filter(Boolean);
              
              return (
                <div
                  key={`${productoAgrupado.nombre}-${idx}`}
                  className={`tienda-pro-card ${productosDisponibles.length === 0 ? "no-disponible" : ""}`}
                  onClick={() => productosDisponibles.length > 0 && abrirModalProducto(productoAgrupado)}
                  style={{ cursor: productosDisponibles.length > 0 ? 'pointer' : 'default' }}
                >
                  <div className="tienda-pro-card-image-container">
                    {productoAgrupado.foto ? (
                      <img 
                        src={`${SERVER_URL}${productoAgrupado.foto}`} 
                        alt={productoAgrupado.nombre}
                        className="tienda-pro-card-image"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div 
                      className="tienda-pro-card-image-placeholder"
                      style={{ display: productoAgrupado.foto ? 'none' : 'flex' }}
                    >
                      <span>💊</span>
                    </div>
                    {productosDisponibles.length === 0 && (
                      <div className="tienda-pro-badge-out">
                        <span>Agotado</span>
                      </div>
                    )}
                  </div>
                  <div className="tienda-pro-card-content">
                    <div className="tienda-pro-card-category">{productoAgrupado.categoria}</div>
                    <h3 className="tienda-pro-card-title">{productoAgrupado.nombre}</h3>
                    {presentaciones.length > 0 && (
                      <div className="tienda-pro-card-presentaciones">
                        <span className="tienda-pro-presentaciones-label">
                          {presentaciones.length} presentación{presentaciones.length !== 1 ? 'es' : ''} disponible{presentaciones.length !== 1 ? 's' : ''}
                        </span>
                        <div className="tienda-pro-presentaciones-list">
                          {presentaciones.slice(0, 3).map((pres, i) => (
                            <span key={i} className="tienda-pro-presentacion-tag">{pres}</span>
                          ))}
                          {presentaciones.length > 3 && (
                            <span className="tienda-pro-presentacion-tag">+{presentaciones.length - 3} más</span>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="tienda-pro-card-info">
                      <span className="tienda-pro-card-stock" style={{ 
                        color: productosDisponibles.length > 0 ? "#22c55e" : "#ef4444",
                        fontWeight: "600"
                      }}>
                        {productosDisponibles.length > 0 ? "Disponible" : "No disponible"}
                      </span>
                    </div>
                    {productosDisponibles.length > 0 ? (
                      <button
                        className="tienda-pro-btn-add"
                        onClick={(e) => {
                          e.stopPropagation();
                          abrirModalProducto(productoAgrupado);
                        }}
                      >
                        <span>Ver Presentaciones</span>
                        <span className="tienda-pro-btn-icon">→</span>
                      </button>
                    ) : (
                      <button className="tienda-pro-btn-disabled" disabled>
                        No Disponible
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Modal de Detalle de Producto */}
      {mostrarModalProducto && productoSeleccionado && (
        <>
          <div 
            className="tienda-pro-overlay active"
            onClick={cerrarModalProducto}
          ></div>
          <div className="tienda-pro-modal-producto">
            <div className="tienda-pro-modal-producto-header">
              <h3>{productoSeleccionado.nombre}</h3>
              <button 
                onClick={cerrarModalProducto}
                className="tienda-pro-cart-close"
              >
                ✕
              </button>
            </div>
            <div className="tienda-pro-modal-producto-content">
              {productoSeleccionado.foto && (
                <div className="tienda-pro-modal-producto-image">
                  <img 
                    src={`${SERVER_URL}${productoSeleccionado.foto}`} 
                    alt={productoSeleccionado.nombre}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                  <div 
                    className="tienda-pro-card-image-placeholder"
                    style={{ display: productoSeleccionado.foto ? 'none' : 'flex' }}
                  >
                    <span>💊</span>
                  </div>
                </div>
              )}
              <div className="tienda-pro-modal-producto-info">
                <div className="tienda-pro-modal-producto-category">{productoSeleccionado.categoria}</div>
                <h2 className="tienda-pro-modal-producto-title">{productoSeleccionado.nombre}</h2>
                <div className="tienda-pro-modal-presentaciones">
                  <h4 className="tienda-pro-modal-presentaciones-title">Selecciona una presentación:</h4>
                  <div className="tienda-pro-modal-presentaciones-list">
                    {productoSeleccionado.productos
                      .filter(p => p.disponible)
                      .map((producto) => (
                        <div 
                          key={producto.id || producto.codigo}
                          className="tienda-pro-presentacion-item"
                        >
                          <div className="tienda-pro-presentacion-info">
                            <div className="tienda-pro-presentacion-nombre">
                              {producto.presentacion || "Presentación estándar"}
                            </div>
                            <div className="tienda-pro-presentacion-details">
                              <span className="tienda-pro-presentacion-codigo">Código: {producto.codigo}</span>
                              <span className="tienda-pro-presentacion-stock" style={{
                                color: producto.disponible ? "#22c55e" : "#ef4444",
                                fontWeight: "600"
                              }}>
                                {producto.disponible ? "Disponible" : "No disponible"}
                              </span>
                            </div>
                            <div className="tienda-pro-presentacion-precio">
                              {producto.precio && producto.precio > 0 ? (
                                `$${parseFloat(producto.precio).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              ) : (
                                <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Precio no disponible</span>
                              )}
                            </div>
                          </div>
                          <button
                            className="tienda-pro-btn-add-small"
                            onClick={() => agregarAlCarrito(producto)}
                          >
                            Agregar
                          </button>
                        </div>
                      ))}
                    {productoSeleccionado.productos.filter(p => !p.disponible).length > 0 && (
                      <div className="tienda-pro-presentaciones-no-disponibles">
                        <h5>No disponibles:</h5>
                        {productoSeleccionado.productos
                          .filter(p => !p.disponible)
                          .map((producto) => (
                            <div key={producto.id || producto.codigo} className="tienda-pro-presentacion-item no-disponible">
                              <div className="tienda-pro-presentacion-info">
                                <div className="tienda-pro-presentacion-nombre">
                                  {producto.presentacion || "Presentación estándar"}
                                </div>
                                <div className="tienda-pro-presentacion-details">
                                  <span className="tienda-pro-presentacion-codigo">Código: {producto.codigo}</span>
                                  <span className="tienda-pro-presentacion-stock no-disponible">Agotado</span>
                                </div>
                              </div>
                              <button className="tienda-pro-btn-disabled" disabled>
                                Agotado
                              </button>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Carrito Sidebar Premium */}
      {carrito.length > 0 && (
        <>
          <div 
            className={`tienda-pro-overlay ${carritoAbierto ? "active" : ""}`}
            onClick={() => setCarritoAbierto(false)}
          ></div>
          <div className={`tienda-pro-cart ${carritoAbierto ? "open" : ""}`}>
            <div className="tienda-pro-cart-header">
              <h3>Tu Carrito</h3>
              <button 
                onClick={() => setCarritoAbierto(false)}
                className="tienda-pro-cart-close"
              >
                ✕
              </button>
            </div>
            <div className="tienda-pro-cart-items">
              {carrito.map((item) => (
                <div key={item.codigo} className="tienda-pro-cart-item">
                  <div className="tienda-pro-cart-item-image">
                    {item.foto ? (
                      <img src={`${SERVER_URL}${item.foto}`} alt={item.nombre} />
                    ) : (
                      <div className="tienda-pro-cart-placeholder">💊</div>
                    )}
                  </div>
                  <div className="tienda-pro-cart-item-info">
                    <h4>{item.nombre}</h4>
                    <p>{item.codigo}</p>
                  </div>
                  <div className="tienda-pro-cart-item-controls">
                    <button 
                      onClick={() => actualizarCantidad(item.codigo, item.cantidad - 1)}
                      className="tienda-pro-cart-btn-qty"
                    >
                      −
                    </button>
                    <span className="tienda-pro-cart-qty">{item.cantidad}</span>
                    <button 
                      onClick={() => actualizarCantidad(item.codigo, item.cantidad + 1)}
                      className="tienda-pro-cart-btn-qty"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => quitarDelCarrito(item.codigo)}
                    className="tienda-pro-cart-btn-remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="tienda-pro-cart-footer">
              <div className="tienda-pro-cart-total">
                <span>Total: {obtenerTotalCarrito()} productos</span>
              </div>
              <button 
                className="tienda-pro-btn-checkout"
                onClick={abrirModalPago}
              >
                Realizar Pedido
              </button>
              <button 
                onClick={() => setCarrito([])}
                className="tienda-pro-btn-clear"
              >
                Limpiar Carrito
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modal de Pago */}
      {mostrarModalPago && (
        <>
          <div 
            className="tienda-pro-overlay active"
            onClick={cerrarModalPago}
          ></div>
          <div className="tienda-pro-modal-pago">
            <div className="tienda-pro-modal-pago-header">
              <h3>Completa tu Pedido</h3>
              <button 
                onClick={cerrarModalPago}
                className="tienda-pro-cart-close"
              >
                ✕
              </button>
            </div>
            <div className="tienda-pro-modal-pago-content">
            {clienteAutenticado ? (
              <>
                <div className="tienda-pro-form-group">
                  <label>Nombre Completo *</label>
                  <input
                    type="text"
                    value={datosCliente.nombre}
                    readOnly={!!datosCliente.nombre}
                    onChange={(e) => setDatosCliente({ ...datosCliente, nombre: e.target.value })}
                    placeholder="Ingresa tu nombre completo"
                    className="tienda-pro-input"
                  />
                </div>
                <div className="tienda-pro-form-group">
                  <label>Teléfono *</label>
                  <input
                    type="tel"
                    value={datosCliente.telefono}
                    readOnly={!!datosCliente.telefono}
                    onChange={(e) => setDatosCliente({ ...datosCliente, telefono: e.target.value })}
                    placeholder="10 dígitos"
                    className="tienda-pro-input"
                  />
                </div>
                <div className="tienda-pro-form-group">
                  <label>Email (Opcional)</label>
                  <input
                    type="email"
                    value={datosCliente.email}
                    readOnly={!!datosCliente.email}
                    onChange={(e) => setDatosCliente({ ...datosCliente, email: e.target.value })}
                    placeholder="tu@email.com"
                    className="tienda-pro-input"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="tienda-pro-form-group">
                  <label>Nombre Completo *</label>
                  <input
                    type="text"
                    value={datosCliente.nombre}
                    onChange={(e) => setDatosCliente({ ...datosCliente, nombre: e.target.value })}
                    placeholder="Ingresa tu nombre completo"
                    className="tienda-pro-input"
                  />
                </div>
                <div className="tienda-pro-form-group">
                  <label>Teléfono *</label>
                  <input
                    type="tel"
                    value={datosCliente.telefono}
                    onChange={(e) => setDatosCliente({ ...datosCliente, telefono: e.target.value })}
                    placeholder="10 dígitos"
                    className="tienda-pro-input"
                  />
                </div>
                <div className="tienda-pro-form-group">
                  <label>Email (Opcional)</label>
                  <input
                    type="email"
                    value={datosCliente.email}
                    onChange={(e) => setDatosCliente({ ...datosCliente, email: e.target.value })}
                    placeholder="tu@email.com"
                    className="tienda-pro-input"
                  />
                </div>
              </>
            )}
            <div className="tienda-pro-form-group">
              <label>Dirección de Entrega *</label>
              {direccionesCliente.length > 0 && !usarDireccionNueva && (
                <div className="tienda-pro-payment-options">
                  {direccionesCliente.map((dir) => (
                    <label key={dir.id} className="tienda-pro-payment-option tienda-pro-address-option">
                      <input
                        type="radio"
                        name="direccion_guardada"
                        value={dir.id}
                        checked={direccionSeleccionadaId === dir.id}
                        onChange={() => seleccionarDireccionGuardada(dir.id)}
                      />
                      <span>
                        <strong>{dir.nombre || "Dirección"}</strong>
                        <br />
                        {formatearDireccion(dir)}
                      </span>
                      {dir.es_principal === 1 && <span className="tienda-pro-badge">Principal</span>}
                    </label>
                  ))}
                </div>
              )}
              {(usarDireccionNueva || direccionesCliente.length === 0) && (
                <textarea
                  value={datosCliente.direccion}
                  onChange={(e) => setDatosCliente({ ...datosCliente, direccion: e.target.value })}
                  placeholder="Calle, número, colonia, ciudad, estado, CP"
                  className="tienda-pro-textarea"
                  rows="3"
                />
              )}
              {direccionesCliente.length > 0 && (
                <button
                  type="button"
                  className="tienda-pro-btn-clear"
                  onClick={() => {
                    const proximoEstado = !usarDireccionNueva;
                    setUsarDireccionNueva(proximoEstado);
                    if (!proximoEstado) {
                      // Regresar a una dirección guardada
                      const dirSeleccionada =
                        direccionesCliente.find((d) => d.id === direccionSeleccionadaId) ||
                        direccionesCliente.find((d) => d.es_principal === 1) ||
                        direccionesCliente[0];
                      if (dirSeleccionada) {
                        seleccionarDireccionGuardada(dirSeleccionada.id);
                      }
                    } else {
                      setDatosCliente((prev) => ({ ...prev, direccion: "" }));
                    }
                  }}
                >
                  {usarDireccionNueva ? "Usar una dirección guardada" : "Usar otra dirección"}
                </button>
              )}
            </div>
              <div className="tienda-pro-form-group">
                <label>Método de Pago *</label>
                <div className="tienda-pro-payment-options">
                  <label className="tienda-pro-payment-option">
                    <input
                      type="radio"
                      name="metodo_pago"
                      value="Tarjeta"
                      checked={datosCliente.metodo_pago === "Tarjeta"}
                      onChange={(e) => setDatosCliente({...datosCliente, metodo_pago: e.target.value})}
                    />
                    <span>💳 Tarjeta</span>
                  </label>
                  <label className="tienda-pro-payment-option">
                    <input
                      type="radio"
                      name="metodo_pago"
                      value="Transferencia"
                      checked={datosCliente.metodo_pago === "Transferencia"}
                      onChange={(e) => setDatosCliente({...datosCliente, metodo_pago: e.target.value})}
                    />
                    <span>🏦 Transferencia</span>
                  </label>
                  <label className="tienda-pro-payment-option">
                    <input
                      type="radio"
                      name="metodo_pago"
                      value="Depósito"
                      checked={datosCliente.metodo_pago === "Depósito"}
                    onChange={(e) => setDatosCliente({...datosCliente, metodo_pago: e.target.value})}
                    />
                    <span>💰 Depósito</span>
                  </label>
                </div>
              {datosCliente.metodo_pago === "Tarjeta" && tarjetasCliente.length > 0 && (
                <div className="tienda-pro-payment-options tienda-pro-tarjetas-guardadas">
                  {tarjetasCliente.map((tarjeta) => (
                    <label key={tarjeta.id} className="tienda-pro-payment-option">
                      <input
                        type="radio"
                        name="tarjeta_guardada"
                        value={tarjeta.id}
                        checked={tarjetaSeleccionadaId === tarjeta.id}
                        onChange={() => setTarjetaSeleccionadaId(tarjeta.id)}
                      />
                      <span>
                        {tarjeta.tipo} •••• {tarjeta.ultimos_digitos}{" "}
                        {tarjeta.nombre_titular ? `(${tarjeta.nombre_titular})` : ""}
                      </span>
                      {tarjeta.es_principal === 1 && <span className="tienda-pro-badge">Principal</span>}
                    </label>
                  ))}
                </div>
              )}
              </div>
              <div className="tienda-pro-modal-pago-footer">
                <button 
                  className="tienda-pro-btn-checkout"
                  onClick={realizarPedido}
                >
                  Confirmar Pedido
                </button>
                <button 
                  className="tienda-pro-btn-clear"
                  onClick={cerrarModalPago}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal de Login */}
      {mostrarModalLogin && (
        <div className="tienda-pro-modal-overlay" onClick={() => setMostrarModalLogin(false)}>
          <div className="tienda-pro-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tienda-pro-modal-header">
              <h2>Iniciar Sesión</h2>
              <button className="tienda-pro-modal-close" onClick={() => setMostrarModalLogin(false)}>✕</button>
            </div>
            <form onSubmit={handleLogin} className="tienda-pro-form">
              <div className="tienda-pro-form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={formLogin.email}
                  onChange={(e) => setFormLogin({...formLogin, email: e.target.value})}
                  placeholder="tu@email.com"
                  required
                  className="tienda-pro-input"
                />
              </div>
              <div className="tienda-pro-form-group">
                <label>Contraseña</label>
                <input
                  type="password"
                  value={formLogin.password}
                  onChange={(e) => setFormLogin({...formLogin, password: e.target.value})}
                  placeholder="Tu contraseña"
                  required
                  className="tienda-pro-input"
                />
              </div>
              <div className="tienda-pro-modal-footer">
                <button type="submit" className="tienda-pro-btn-checkout">Iniciar Sesión</button>
                <button type="button" className="tienda-pro-btn-clear" onClick={() => {
                  setMostrarModalLogin(false);
                  setMostrarModalRegistro(true);
                }}>¿No tienes cuenta? Regístrate</button>
                <button type="button" className="tienda-pro-btn-clear" style={{ marginTop: "10px", fontSize: "0.9rem" }} onClick={() => {
                  setMostrarModalLogin(false);
                  setMostrarModalRecuperar(true);
                }}>¿Olvidaste tu contraseña?</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Recuperación de Contraseña */}
      {mostrarModalRecuperar && (
        <div className="tienda-pro-modal-overlay" onClick={() => {
          setMostrarModalRecuperar(false);
          setPasoRecuperar(1);
          setFormRecuperar({ email: "", codigo: "", password_nueva: "", password_confirmar: "" });
        }}>
          <div className="tienda-pro-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tienda-pro-modal-header">
              <h2>{pasoRecuperar === 1 ? "Recuperar Contraseña" : "Restablecer Contraseña"}</h2>
              <button className="tienda-pro-modal-close" onClick={() => {
                setMostrarModalRecuperar(false);
                setPasoRecuperar(1);
                setFormRecuperar({ email: "", codigo: "", password_nueva: "", password_confirmar: "" });
              }}>✕</button>
            </div>
            {pasoRecuperar === 1 ? (
              <form onSubmit={handleSolicitarCodigo} className="tienda-pro-form">
                <div className="tienda-pro-form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={formRecuperar.email}
                    onChange={(e) => setFormRecuperar({...formRecuperar, email: e.target.value})}
                    placeholder="tu@email.com"
                    required
                    className="tienda-pro-input"
                  />
                  <p style={{ fontSize: "0.85rem", color: "#666", marginTop: "5px" }}>
                    Te enviaremos un código de recuperación a tu correo electrónico.
                  </p>
                </div>
                <div className="tienda-pro-modal-footer">
                  <button type="submit" className="tienda-pro-btn-checkout">Enviar Código</button>
                  <button type="button" className="tienda-pro-btn-clear" onClick={() => {
                    setMostrarModalRecuperar(false);
                    setPasoRecuperar(1);
                    setFormRecuperar({ email: "", codigo: "", password_nueva: "", password_confirmar: "" });
                    setMostrarModalLogin(true);
                  }}>Volver al Login</button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleRestablecerPassword} className="tienda-pro-form">
                <div className="tienda-pro-form-group">
                  <label>Código de Recuperación</label>
                  <input
                    type="text"
                    value={formRecuperar.codigo}
                    onChange={(e) => setFormRecuperar({...formRecuperar, codigo: e.target.value})}
                    placeholder="Ingresa el código de 6 dígitos"
                    required
                    className="tienda-pro-input"
                    maxLength={6}
                  />
                </div>
                <div className="tienda-pro-form-group">
                  <label>Nueva Contraseña</label>
                  <input
                    type="password"
                    value={formRecuperar.password_nueva}
                    onChange={(e) => setFormRecuperar({...formRecuperar, password_nueva: e.target.value})}
                    placeholder="Mínimo 6 caracteres"
                    required
                    className="tienda-pro-input"
                    minLength={6}
                  />
                </div>
                <div className="tienda-pro-form-group">
                  <label>Confirmar Nueva Contraseña</label>
                  <input
                    type="password"
                    value={formRecuperar.password_confirmar}
                    onChange={(e) => setFormRecuperar({...formRecuperar, password_confirmar: e.target.value})}
                    placeholder="Confirma tu nueva contraseña"
                    required
                    className="tienda-pro-input"
                    minLength={6}
                  />
                </div>
                <div className="tienda-pro-modal-footer">
                  <button type="submit" className="tienda-pro-btn-checkout">Restablecer Contraseña</button>
                  <button type="button" className="tienda-pro-btn-clear" onClick={() => setPasoRecuperar(1)}>
                    Volver
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal de Registro */}
      {mostrarModalRegistro && (
        <div className="tienda-pro-modal-overlay" onClick={() => setMostrarModalRegistro(false)}>
          <div className="tienda-pro-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tienda-pro-modal-header">
              <h2>Crear Cuenta</h2>
              <button className="tienda-pro-modal-close" onClick={() => setMostrarModalRegistro(false)}>✕</button>
            </div>
            <form onSubmit={handleRegistro} className="tienda-pro-form">
              <div className="tienda-pro-form-group">
                <label>Nombre Completo *</label>
                <input
                  type="text"
                  value={formRegistro.nombre}
                  onChange={(e) => setFormRegistro({...formRegistro, nombre: e.target.value})}
                  placeholder="Tu nombre completo"
                  required
                  className="tienda-pro-input"
                />
              </div>
              <div className="tienda-pro-form-group">
                <label>Email *</label>
                <input
                  type="email"
                  value={formRegistro.email}
                  onChange={(e) => setFormRegistro({...formRegistro, email: e.target.value})}
                  placeholder="tu@email.com"
                  required
                  className="tienda-pro-input"
                />
              </div>
              <div className="tienda-pro-form-group">
                <label>Teléfono</label>
                <input
                  type="tel"
                  value={formRegistro.telefono}
                  onChange={(e) => setFormRegistro({...formRegistro, telefono: e.target.value})}
                  placeholder="2221234567"
                  className="tienda-pro-input"
                />
              </div>
              <div className="tienda-pro-form-group">
                <label>Contraseña *</label>
                <div className="tienda-pro-password-input-wrapper">
                  <input
                    type={mostrarPasswordRegistro ? "text" : "password"}
                    value={formRegistro.password}
                    onChange={(e) => setFormRegistro({...formRegistro, password: e.target.value})}
                    placeholder="Mínimo 6 caracteres"
                    required
                    minLength={6}
                    className="tienda-pro-input"
                  />
                  <button
                    type="button"
                    className="tienda-pro-password-toggle"
                    onClick={() => setMostrarPasswordRegistro(!mostrarPasswordRegistro)}
                    tabIndex={-1}
                  >
                    {mostrarPasswordRegistro ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>
              <div className="tienda-pro-modal-footer">
                <button type="submit" className="tienda-pro-btn-checkout">Registrarse</button>
                <button type="button" className="tienda-pro-btn-clear" onClick={() => {
                  setMostrarModalRegistro(false);
                  setMostrarModalLogin(true);
                }}>¿Ya tienes cuenta? Inicia Sesión</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Mi Cuenta */}
      {mostrarModalCuenta && clienteAutenticado && (
        <div className="tienda-pro-modal-overlay" onClick={() => setMostrarModalCuenta(false)}>
          <div className="tienda-pro-modal tienda-pro-modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="tienda-pro-modal-header">
              <h2>Mi Cuenta</h2>
              <button className="tienda-pro-modal-close" onClick={() => setMostrarModalCuenta(false)}>✕</button>
            </div>
            <div className="tienda-pro-cuenta-content">
              <div className="tienda-pro-cuenta-tabs">
                <button 
                  className={pestañaActivaCuenta === "perfil" ? "active" : ""}
                  onClick={() => setPestañaActivaCuenta("perfil")}
                >
                  👤 Perfil
                </button>
                <button 
                  className={pestañaActivaCuenta === "direcciones" ? "active" : ""}
                  onClick={() => setPestañaActivaCuenta("direcciones")}
                >
                  📍 Direcciones
                </button>
                <button 
                  className={pestañaActivaCuenta === "tarjetas" ? "active" : ""}
                  onClick={() => setPestañaActivaCuenta("tarjetas")}
                >
                  💳 Tarjetas
                </button>
                <button 
                  className={pestañaActivaCuenta === "pedidos" ? "active" : ""}
                  onClick={() => setPestañaActivaCuenta("pedidos")}
                >
                  📦 Mis Pedidos
                </button>
              </div>

              {pestañaActivaCuenta === "perfil" && (
                <div className="tienda-pro-cuenta-section">
                  <h3>Información Personal</h3>
                  <div className="tienda-pro-form-group">
                    <label>Nombre</label>
                    <input
                      type="text"
                      value={clienteAutenticado.nombre}
                      readOnly
                      className="tienda-pro-input"
                    />
                  </div>
                  <div className="tienda-pro-form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      value={clienteAutenticado.email}
                      readOnly
                      className="tienda-pro-input"
                    />
                  </div>
                  <div className="tienda-pro-form-group">
                    <label>Teléfono</label>
                    <input
                      type="tel"
                      value={clienteAutenticado.telefono || ""}
                      readOnly
                      className="tienda-pro-input"
                    />
                  </div>
                </div>
              )}

              {pestañaActivaCuenta === "direcciones" && (
                <div className="tienda-pro-cuenta-section">
                  <h3>Mis Direcciones</h3>
                  <button 
                    className="tienda-pro-btn-add"
                    onClick={() => {
                      // Aquí se puede agregar lógica para agregar nueva dirección
                      showAlert("Funcionalidad de agregar dirección próximamente", "info");
                    }}
                  >
                    + Agregar Dirección
                  </button>
                  {direccionesCliente.length === 0 ? (
                    <p>No tienes direcciones guardadas</p>
                  ) : (
                    <div className="tienda-pro-direcciones-list">
                      {direccionesCliente.map(dir => (
                        <div key={dir.id} className="tienda-pro-direccion-item">
                          <div>
                            <strong>{dir.nombre}</strong>
                            {dir.es_principal === 1 && <span className="tienda-pro-badge">Principal</span>}
                            <p>{dir.calle} {dir.numero_exterior} {dir.numero_interior || ""}</p>
                            <p>{dir.colonia}, {dir.ciudad}, {dir.estado}, {dir.codigo_postal}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {pestañaActivaCuenta === "tarjetas" && (
                <div className="tienda-pro-cuenta-section">
                  <h3>Mis Tarjetas</h3>
                  <button 
                    className="tienda-pro-btn-add"
                    onClick={() => {
                      // Aquí se puede agregar lógica para agregar nueva tarjeta
                      showAlert("Funcionalidad de agregar tarjeta próximamente", "info");
                    }}
                  >
                    + Agregar Tarjeta
                  </button>
                  {tarjetasCliente.length === 0 ? (
                    <p>No tienes tarjetas guardadas</p>
                  ) : (
                    <div className="tienda-pro-tarjetas-list">
                      {tarjetasCliente.map(tarjeta => (
                        <div key={tarjeta.id} className="tienda-pro-tarjeta-item">
                          <div>
                            <strong>{tarjeta.tipo} •••• {tarjeta.ultimos_digitos}</strong>
                            {tarjeta.es_principal === 1 && <span className="tienda-pro-badge">Principal</span>}
                            <p>{tarjeta.nombre_titular}</p>
                            <p>Vence: {tarjeta.fecha_vencimiento}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {pestañaActivaCuenta === "pedidos" && (
                <div className="tienda-pro-cuenta-section">
                  <h3>Mis Pedidos</h3>
                  {pedidosCliente.length === 0 ? (
                    <p>No has realizado pedidos aún</p>
                  ) : (
                    <div className="tienda-pro-pedidos-list">
                      {pedidosCliente.map(pedido => (
                        <div key={pedido.id} className="tienda-pro-pedido-item">
                          <div>
                            <strong>Pedido: {pedido.numero_pedido}</strong>
                            <span className={`tienda-pro-estatus ${pedido.estatus.toLowerCase()}`}>{pedido.estatus}</span>
                            <p>Total: ${pedido.total.toFixed(2)}</p>
                            <p>Fecha: {new Date(pedido.fecha_pedido).toLocaleDateString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Tienda;
