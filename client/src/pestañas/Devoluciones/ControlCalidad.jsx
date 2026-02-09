import React, { useState, useEffect, useRef, useCallback } from 'react';
import './ControlCalidad.css';
import { useAuth } from '../../AuthContext';
import { useAlert } from '../../components/AlertModal';

export default function ControlCalidad({ serverUrl, pushToast, socket }) {
  const { authFetch } = useAuth();
  const { showConfirm } = useAlert();
  
  // Estado para el área seleccionada
  const [areaSeleccionada, setAreaSeleccionada] = useState('Devoluciones');
  const AREAS = ['Devoluciones', 'Fulfilment', 'Inventario', 'Pedidos'];
  
  // Estados para los datos
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Estado para procesos en curso
  const [calidadEnProceso, setCalidadEnProceso] = useState([]);
  
  // Estado para el modal de nuevo registro
  const [modalNuevoRegistro, setModalNuevoRegistro] = useState({
    open: false,
    form: {
      fecha: new Date().toISOString().split('T')[0],
      pedido: '',
      codigo: '',
      producto: '',
      presentacion: '',
      cantidad: 0,
      lote: '',
      caducidad: '',
      laboratorio: '',
      clasificacion_etiqueta: '',
      defecto: '',
      destino: '',
      comentarios_calidad: ''
    },
    evidencias: [],
    subiendo: false
  });
  
  // Refs para el buffer de escaneo
  const scanBufferRef = useRef({});
  const scanTimeoutRef = useRef({});
  const fileInputRefModal = useRef(null);
  const codigoInputRefModal = useRef(null);
  
  // Estados para la cámara del modal
  const [camStreamModal, setCamStreamModal] = useState(null);
  const [showCamModal, setShowCamModal] = useState(false);
  const videoRefModal = useRef(null);
  
  // Estado para el modal de evidencias
  const [modalEvidencias, setModalEvidencias] = useState({
    open: false,
    evidencias: [],
    indiceActual: 0,
    registroId: null, // ID del registro para poder subir nuevas evidencias
    modoEdicion: false, // true = modo edición (puede agregar), false = solo visualización
    nuevasEvidencias: [] // Evidencias nuevas que se van a agregar
  });

  // Estados para la cámara del modal de evidencias
  const [camStreamEvidencias, setCamStreamEvidencias] = useState(null);
  const [showCamModalEvidencias, setShowCamModalEvidencias] = useState(false);
  const videoRefEvidencias = useRef(null);
  const fileInputRefEvidencias = useRef(null);
  
  // Estados para las opciones de los dropdowns (sincronizadas entre todas las áreas)
  const [laboratorios, setLaboratorios] = useState([]);
  const [clasificaciones, setClasificaciones] = useState([]);
  const [defectos, setDefectos] = useState([]);
  const [destinos, setDestinos] = useState([]);
  
  // Estados para agregar nuevas opciones
  const [nuevoLaboratorio, setNuevoLaboratorio] = useState('');
  const [nuevaClasificacion, setNuevaClasificacion] = useState('');
  const [nuevoDefecto, setNuevoDefecto] = useState('');
  const [nuevoDestino, setNuevoDestino] = useState('');
  const [mostrarInputNuevo, setMostrarInputNuevo] = useState({ tipo: null, campo: null });
  
  // Estados para dropdown personalizado
  const [dropdownAbierto, setDropdownAbierto] = useState({ tipo: null, campo: null, registroId: null });
  const [editandoOpcion, setEditandoOpcion] = useState({ tipo: null, id: null, nombre: '' });

  // Cargar opciones de los dropdowns (sincronizadas para todas las áreas)
  const cargarOpcionesDropdowns = useCallback(async () => {
    try {
      const [labData, clasData, defData, destData] = await Promise.all([
        authFetch(`${serverUrl}/devoluciones/calidad/opciones/laboratorio`),
        authFetch(`${serverUrl}/devoluciones/calidad/opciones/clasificacion`),
        authFetch(`${serverUrl}/devoluciones/calidad/opciones/defecto`),
        authFetch(`${serverUrl}/devoluciones/calidad/opciones/destino`)
      ]);
      
      setLaboratorios(Array.isArray(labData) ? labData : []);
      setClasificaciones(Array.isArray(clasData) ? clasData : []);
      setDefectos(Array.isArray(defData) ? defData : []);
      setDestinos(Array.isArray(destData) ? destData : []);
    } catch (error) {
      console.error('Error cargando opciones:', error);
    }
  }, [serverUrl, authFetch]);

  // Cargar registros según el área seleccionada
  const cargarRegistros = useCallback(async () => {
    try {
      setLoading(true);
      const data = await authFetch(`${serverUrl}/devoluciones/calidad/registros?area=${areaSeleccionada}`);
      setRegistros(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error cargando registros:', error);
      pushToast('Error al cargar registros', 'error');
      setRegistros([]);
    } finally {
      setLoading(false);
    }
  }, [areaSeleccionada, serverUrl]); // Removido pushToast y authFetch de dependencias

  // Ref para cargarRegistros para evitar loops en socket
  const cargarRegistrosRef = useRef(cargarRegistros);
  useEffect(() => {
    cargarRegistrosRef.current = cargarRegistros;
  }, [cargarRegistros]);

  // Cargar registros y opciones cuando cambia el área
  useEffect(() => {
    cargarRegistros();
    cargarOpcionesDropdowns();
    // Cargar procesos guardados en localStorage
    if (areaSeleccionada) {
      try {
        const procesosGuardados = localStorage.getItem('calidad_en_proceso');
        if (procesosGuardados) {
          const procesos = JSON.parse(procesosGuardados);
          setCalidadEnProceso(procesos);
        }
      } catch (error) {
        console.error('Error cargando procesos guardados:', error);
      }
    }
  }, [areaSeleccionada, serverUrl]); // Dependencias directas en lugar de funciones

  // Escuchar eventos de actualización de registros de calidad
  useEffect(() => {
    if (!socket) return;
    
    const handleCalidadActualizada = () => {
      // Usar ref para evitar dependencias circulares
      cargarRegistrosRef.current();
    };
    
    socket.on('calidad_registros_actualizados', handleCalidadActualizada);
    socket.on('devoluciones_actualizadas', handleCalidadActualizada);
    
    // Eventos para procesos de calidad en curso
    const handleCalidadEnProceso = (data) => {
      if (!data || !data.pedido) return;
      
      setCalidadEnProceso((prev) => {
        const existe = prev.find((p) => p.pedido === data.pedido);
        if (existe) return prev;
        const nuevaLista = [...prev, data];
        
        // Guardar en localStorage
        try {
          localStorage.setItem('calidad_en_proceso', JSON.stringify(nuevaLista));
        } catch (error) {
          console.error('Error guardando procesos:', error);
        }
        
        return nuevaLista;
      });
    };

    const handleCalidadProcesoTerminado = (data) => {
      if (!data || !data.pedido) return;
      
      setCalidadEnProceso((prev) => {
        const nuevaLista = prev.filter((p) => p.pedido !== data.pedido);
        
        // Actualizar localStorage
        try {
          localStorage.setItem('calidad_en_proceso', JSON.stringify(nuevaLista));
        } catch (error) {
          console.error('Error actualizando procesos:', error);
        }
        
        return nuevaLista;
      });
    };

    socket.on("calidad_en_proceso", handleCalidadEnProceso);
    socket.on("calidad_proceso_terminado", handleCalidadProcesoTerminado);
    
    return () => {
      socket.off('calidad_registros_actualizados', handleCalidadActualizada);
      socket.off('devoluciones_actualizadas', handleCalidadActualizada);
      socket.off("calidad_en_proceso", handleCalidadEnProceso);
      socket.off("calidad_proceso_terminado", handleCalidadProcesoTerminado);
    };
  }, [socket]); // Removido cargarRegistros de dependencias

  // ==========================
  // FUNCIONES DE NOTIFICACIÓN DE PROCESO
  // ==========================
  const notificarInicioProceso = (pedido) => {
    if (socket && pedido) {
      socket.emit("calidad_iniciada", {
        pedido: pedido,
        usuario: "Usuario", // Obtener del contexto si está disponible
        area: areaSeleccionada
      });
    }
  };

  const notificarFinProceso = (pedido) => {
    if (socket && pedido) {
      socket.emit("calidad_finalizada", {
        pedido: pedido,
        area: areaSeleccionada
      });
    }
  };

  // Regresar a un registro en proceso
  const regresarAProceso = async (pedidoNumero) => {
    try {
      const registro = registros.find((r) => r.pedido === pedidoNumero);
      
      if (registro) {
        // Si existe el registro, abrir el modal de evidencias
        setModalEvidencias({ 
          open: true,
          evidencias: Array.isArray(registro.evidencias) ? registro.evidencias : [],
          indiceActual: 0,
          registroId: registro.id,
          modoEdicion: false,
          nuevasEvidencias: []
        });
      } else {
        // Intentar cargar progreso guardado
        const progreso = cargarProgresoLocal(pedidoNumero);
        
        if (progreso) {
          // Restaurar progreso
          abrirModalNuevoRegistro();
          setModalNuevoRegistro(prev => ({
            ...prev,
            form: {
              ...prev.form,
              pedido: progreso.pedido,
              codigo: progreso.codigo || '',
              producto: progreso.producto || '',
              presentacion: progreso.presentacion || '',
              cantidad: progreso.cantidad || 0,
              lote: progreso.lote || '',
              caducidad: progreso.caducidad || '',
              laboratorio: progreso.laboratorio || '',
              clasificacion_etiqueta: progreso.clasificacion_etiqueta || '',
              defecto: progreso.defecto || '',
              destino: progreso.destino || '',
              comentarios_calidad: progreso.comentarios_calidad || ''
            }
          }));
          pushToast?.(`✅ Progreso restaurado`, "ok");
        } else {
          // Si no hay progreso, abrir modal vacío
          abrirModalNuevoRegistro();
          setModalNuevoRegistro(prev => ({
            ...prev,
            form: { ...prev.form, pedido: pedidoNumero }
          }));
        }
      }
    } catch (error) {
      console.error("Error regresando al proceso:", error);
      pushToast?.("❌ Error al regresar al proceso", "error");
    }
  };

  // Guardar progreso en localStorage
  const guardarProgresoLocal = (pedidoKey) => {
    if (!pedidoKey) return;
    
    try {
      const progreso = {
        ...modalNuevoRegistro.form,
        timestamp: Date.now()
      };
      
      localStorage.setItem(`calidad_progreso_${pedidoKey}`, JSON.stringify(progreso));
    } catch (error) {
      console.error("Error guardando progreso:", error);
    }
  };

  // Cargar progreso desde localStorage
  const cargarProgresoLocal = (pedidoKey) => {
    if (!pedidoKey) return null;
    
    try {
      const stored = localStorage.getItem(`calidad_progreso_${pedidoKey}`);
      if (!stored) return null;
      
      const progreso = JSON.parse(stored);
      
      // Verificar que no sea muy antiguo (más de 24 horas)
      const horasTranscurridas = (Date.now() - progreso.timestamp) / (1000 * 60 * 60);
      if (horasTranscurridas > 24) {
        localStorage.removeItem(`calidad_progreso_${pedidoKey}`);
        return null;
      }
      
      return progreso;
    } catch (error) {
      console.error("Error cargando progreso:", error);
      return null;
    }
  };

  // Limpiar progreso guardado
  const limpiarProgresoLocal = (pedidoKey) => {
    if (!pedidoKey) return;
    try {
      localStorage.removeItem(`calidad_progreso_${pedidoKey}`);
    } catch (error) {
      console.error("Error limpiando progreso:", error);
    }
  };

  // Cerrar dropdowns al hacer clic fuera y actualizar posición al hacer scroll
  useEffect(() => {
    const handleClickOutside = (event) => {
      const dropdownContainer = event.target.closest('.custom-dropdown-container');
      const dropdownMenu = event.target.closest('.custom-dropdown-menu');
      
      if (!dropdownContainer && !dropdownMenu) {
        setDropdownAbierto({ tipo: null, campo: null, registroId: null });
        setMostrarInputNuevo({ tipo: null, campo: null });
        setEditandoOpcion({ tipo: null, id: null, nombre: '' });
      }
    };

    const handleScroll = () => {
      // Esta función ya no es necesaria ya que usamos <select> nativo
      // Se mantiene para evitar errores si hay referencias pendientes
    };

    if (dropdownAbierto.tipo) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleScroll);
      
      // También escuchar scroll del modal si existe
      const modalElement = document.querySelector('.activation-modal');
      if (modalElement) {
        modalElement.addEventListener('scroll', handleScroll, true);
      }

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleScroll);
        if (modalElement) {
          modalElement.removeEventListener('scroll', handleScroll, true);
        }
      };
    }
  }, [dropdownAbierto]);

  // Auto-guardar progreso cuando cambia el formulario
  useEffect(() => {
    const pedido = modalNuevoRegistro.form.pedido.trim();
    if (modalNuevoRegistro.open && pedido) {
      const timeoutId = setTimeout(() => {
        guardarProgresoLocal(pedido);
      }, 1000); // Guardar después de 1 segundo de inactividad
      
      return () => clearTimeout(timeoutId);
    }
  }, [modalNuevoRegistro.form, modalNuevoRegistro.open]);

  // Agregar nueva opción a un dropdown
  const agregarNuevaOpcion = async (tipo, valor, campo) => {
    if (!valor.trim()) {
      pushToast('Ingresa un valor', 'warn');
      return;
    }
    
    try {
      await authFetch(`${serverUrl}/devoluciones/calidad/opciones/${tipo}`, {
        method: 'POST',
        body: JSON.stringify({ nombre: valor.trim() })
      });
      
      pushToast(`✅ ${tipo} agregado`, 'ok');
      setMostrarInputNuevo({ tipo: null, campo: null });
      
      // Limpiar inputs
      if (tipo === 'laboratorio') setNuevoLaboratorio('');
      if (tipo === 'clasificacion') setNuevaClasificacion('');
      if (tipo === 'defecto') setNuevoDefecto('');
      if (tipo === 'destino') setNuevoDestino('');
      
      // Recargar opciones
      await cargarOpcionesDropdowns();
    } catch (error) {
      console.error(`Error agregando ${tipo}:`, error);
      pushToast(`❌ Error al agregar ${tipo}`, 'error');
    }
  };

  // Actualizar opción existente
  const actualizarOpcion = async (tipo, id, nuevoNombre) => {
    if (!nuevoNombre || !nuevoNombre.trim()) {
      // Si se borró completamente, eliminar la opción
      await eliminarOpcion(tipo, id);
      return;
    }
    
    try {
      await authFetch(`${serverUrl}/devoluciones/calidad/opciones/${tipo}/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ nombre: nuevoNombre.trim() })
      });
      
      pushToast(`✅ ${tipo} actualizado`, 'ok');
      setEditandoOpcion({ tipo: null, id: null, nombre: '' });
      await cargarOpcionesDropdowns();
    } catch (error) {
      console.error(`Error actualizando ${tipo}:`, error);
      pushToast(`❌ Error al actualizar ${tipo}`, 'error');
    }
  };

  // Eliminar opción
  const eliminarOpcion = async (tipo, id) => {
    try {
      await authFetch(`${serverUrl}/devoluciones/calidad/opciones/${tipo}/${id}`, {
        method: 'DELETE'
      });
      
      pushToast(`✅ ${tipo} eliminado`, 'ok');
      setEditandoOpcion({ tipo: null, id: null, nombre: '' });
      await cargarOpcionesDropdowns();
    } catch (error) {
      console.error(`Error eliminando ${tipo}:`, error);
      pushToast(`❌ Error al eliminar ${tipo}`, 'error');
    }
  };

  // Abrir modal para crear nuevo registro
  const abrirModalNuevoRegistro = () => {
    setModalNuevoRegistro({
      open: true,
      form: {
        fecha: new Date().toISOString().split('T')[0],
        pedido: '',
        codigo: '',
        producto: '',
        presentacion: '',
        cantidad: 0,
        lote: '',
        caducidad: '',
        laboratorio: '',
        clasificacion_etiqueta: '',
        defecto: '',
        destino: '',
        comentarios_calidad: ''
      },
      evidencias: [],
      subiendo: false
    });
    // Notificar inicio después de un pequeño delay cuando se ingrese el pedido
    // (se manejará en el onChange del input de pedido)
    // Enfocar el input de código después de un breve delay
    setTimeout(() => {
      codigoInputRefModal.current?.focus();
    }, 100);
  };

  // Buscar producto por código para el modal
  const buscarProductoModal = async (codigo) => {
    if (!codigo || !codigo.trim()) return;
    
    try {
      const producto = await authFetch(`${serverUrl}/devoluciones/calidad/buscar-producto/${codigo.trim()}`);
      
      if (producto) {
        setModalNuevoRegistro(prev => ({
          ...prev,
          form: {
            ...prev.form,
            codigo: producto.codigo || prev.form.codigo,
            producto: producto.nombre || prev.form.producto,
            presentacion: producto.presentacion || prev.form.presentacion
          }
        }));
        pushToast('✅ Producto cargado desde inventario', 'ok');
      }
    } catch (error) {
      console.error('Error buscando producto:', error);
    }
  };

  // Abrir cámara para el modal
  const abrirCamaraModal = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      setCamStreamModal(stream);
      setShowCamModal(true);

      setTimeout(() => {
        if (videoRefModal.current) {
          videoRefModal.current.srcObject = stream;
          videoRefModal.current.onloadedmetadata = () =>
            videoRefModal.current.play();
        }
      }, 200);
    } catch (err) {
      pushToast("❌ No se pudo abrir la cámara", "error");
      console.error(err);
    }
  };

  const cerrarCamaraModal = () => {
    try {
      if (camStreamModal) {
        camStreamModal.getTracks().forEach((t) => t.stop());
      }
      if (videoRefModal.current) videoRefModal.current.srcObject = null;
      setCamStreamModal(null);
      setShowCamModal(false);
    } catch (e) {
      console.error(e);
    }
  };

  const tomarFotoModal = () => {
    const video = videoRefModal.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" });
        const nuevaEvidencia = {
          file,
          preview: URL.createObjectURL(blob),
          idTemp: Date.now() + Math.random()
        };
        
        setModalNuevoRegistro(prev => ({
          ...prev,
          evidencias: [...(Array.isArray(prev.evidencias) ? prev.evidencias : []), nuevaEvidencia]
        }));
        
        cerrarCamaraModal();
        pushToast("✅ Foto tomada", "ok");
      }
    }, "image/jpeg", 0.9);
  };

  // Funciones para la cámara del modal de evidencias
  const abrirCamaraEvidencias = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      setCamStreamEvidencias(stream);
      setShowCamModalEvidencias(true);

      setTimeout(() => {
        if (videoRefEvidencias.current) {
          videoRefEvidencias.current.srcObject = stream;
          videoRefEvidencias.current.onloadedmetadata = () =>
            videoRefEvidencias.current.play();
        }
      }, 200);
    } catch (err) {
      pushToast("❌ No se pudo abrir la cámara", "error");
      console.error(err);
    }
  };

  const cerrarCamaraEvidencias = () => {
    try {
      if (camStreamEvidencias) {
        camStreamEvidencias.getTracks().forEach((t) => t.stop());
      }
      if (videoRefEvidencias.current) videoRefEvidencias.current.srcObject = null;
      setCamStreamEvidencias(null);
      setShowCamModalEvidencias(false);
    } catch (e) {
      console.error(e);
    }
  };

  const tomarFotoEvidencias = () => {
    const video = videoRefEvidencias.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" });
        const nuevaEvidencia = {
          file,
          preview: URL.createObjectURL(blob),
          idTemp: Date.now() + Math.random()
        };
        
        setModalEvidencias(prev => ({
          ...prev,
          nuevasEvidencias: [...(Array.isArray(prev.nuevasEvidencias) ? prev.nuevasEvidencias : []), nuevaEvidencia]
        }));
        
        cerrarCamaraEvidencias();
        pushToast("✅ Foto tomada", "ok");
      }
    }, "image/jpeg", 0.9);
  };

  // Guardar nuevas evidencias al registro
  const guardarNuevasEvidencias = async () => {
    if (!modalEvidencias.registroId || !Array.isArray(modalEvidencias.nuevasEvidencias) || modalEvidencias.nuevasEvidencias.length === 0) {
      pushToast("⚠️ No hay evidencias nuevas para guardar", "warn");
      return;
    }

    try {
      const formData = new FormData();
      modalEvidencias.nuevasEvidencias.forEach(ev => {
        if (ev && ev.file) {
          formData.append('evidencias', ev.file);
        }
      });

      const uploadResponse = await authFetch(`${serverUrl}/devoluciones/calidad/registros/${modalEvidencias.registroId}/evidencias`, {
        method: 'POST',
        body: formData
      });

      if (uploadResponse && uploadResponse.paths && uploadResponse.paths.length > 0) {
        pushToast(`✅ ${uploadResponse.count} evidencia(s) agregada(s) correctamente`, 'ok');
        
        // Limpiar previews
        if (Array.isArray(modalEvidencias.nuevasEvidencias)) {
          modalEvidencias.nuevasEvidencias.forEach(ev => {
            if (ev && ev.preview) {
              URL.revokeObjectURL(ev.preview);
            }
          });
        }
        
        // Recargar registros para obtener las nuevas evidencias
        await cargarRegistros();
        
        // Recargar el modal con las nuevas evidencias
        const registroActualizado = await authFetch(`${serverUrl}/devoluciones/calidad/registros/${modalEvidencias.registroId}`);
        
        // Normalizar evidencias del registro actualizado
        let evidenciasArray = [];
        if (registroActualizado.evidencias && Array.isArray(registroActualizado.evidencias)) {
          evidenciasArray = registroActualizado.evidencias;
        } else if (registroActualizado.evidencias && typeof registroActualizado.evidencias === 'string') {
          try {
            const parsed = JSON.parse(registroActualizado.evidencias);
            evidenciasArray = Array.isArray(parsed) ? parsed : [registroActualizado.evidencias];
          } catch {
            evidenciasArray = [registroActualizado.evidencias];
          }
        }
        
        const evidenciasNormalizadas = evidenciasArray.map((ev, idx) => {
          let url = '';
          let nombre = `Evidencia ${idx + 1}`;
          
          if (typeof ev === 'string') {
            url = ev;
          } else if (typeof ev === 'object' && ev !== null) {
            url = ev.url || ev.path || ev.preview || ev.src || '';
            nombre = ev.nombre || ev.filename || ev.name || `Evidencia ${idx + 1}`;
          }
          
          if (url) {
            if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('blob:')) {
              if (url.startsWith('/')) {
                url = `${serverUrl}${url}`;
              } else if (url) {
                url = `${serverUrl}/uploads/devoluciones/${url}`;
              }
            }
          }
          
          return { url, nombre, original: ev };
        }).filter(ev => ev.url && ev.url.trim() !== '');
        
        // Cerrar modal y abrir de nuevo con las evidencias actualizadas
        setModalEvidencias({ 
          open: false, 
          evidencias: [], 
          indiceActual: 0,
          registroId: null,
          modoEdicion: false,
          nuevasEvidencias: []
        });
        
        // Abrir modal con las evidencias actualizadas
        setTimeout(() => {
          setModalEvidencias({ 
            open: true, 
            evidencias: evidenciasNormalizadas, 
            indiceActual: 0,
            registroId: modalEvidencias.registroId,
            modoEdicion: false,
            nuevasEvidencias: []
          });
        }, 100);
      } else {
        pushToast('⚠️ Las evidencias se subieron pero puede haber un problema', 'warn');
      }
    } catch (error) {
      console.error('Error subiendo evidencias:', error);
      pushToast('❌ Error al subir evidencias', 'error');
    }
  };

  // Guardar nuevo registro completo
  const guardarNuevoRegistro = async () => {
    const { form, evidencias } = modalNuevoRegistro;
    
    if (!form.codigo.trim() && !form.producto.trim()) {
      pushToast('⚠️ Ingresa código o producto', 'warn');
      return;
    }
    
    setModalNuevoRegistro(prev => ({ ...prev, subiendo: true }));
    
    try {
      // Primero crear el registro
      const nuevoRegistro = await authFetch(`${serverUrl}/devoluciones/calidad/registros`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          area: areaSeleccionada,
          fecha: form.fecha,
          pedido: form.pedido,
          codigo: form.codigo,
          producto: form.producto,
          presentacion: form.presentacion,
          cantidad: Number(form.cantidad) || 0,
          lote: form.lote,
          caducidad: form.caducidad
        })
      });
      
      // Actualizar campos adicionales si existen
      const camposAdicionales = {
        laboratorio: form.laboratorio,
        clasificacion_etiqueta: form.clasificacion_etiqueta,
        defecto: form.defecto,
        destino: form.destino,
        comentarios_calidad: form.comentarios_calidad
      };
      
      const camposParaActualizar = Object.entries(camposAdicionales)
        .filter(([_, value]) => value && value.trim())
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
      
      if (Object.keys(camposParaActualizar).length > 0) {
        await authFetch(`${serverUrl}/devoluciones/calidad/registros/${nuevoRegistro.id}`, {
          method: 'PUT',
          body: JSON.stringify(camposParaActualizar)
        });
      }
      
      // Subir evidencias si hay
      if (Array.isArray(evidencias) && evidencias.length > 0) {
        try {
          const formData = new FormData();
          evidencias.forEach(ev => {
            if (ev && ev.file) {
            formData.append('evidencias', ev.file);
            }
          });
          
          // Subir archivos al servidor
          const uploadResponse = await authFetch(`${serverUrl}/devoluciones/calidad/registros/${nuevoRegistro.id}/evidencias`, {
            method: 'POST',
            body: formData
          });
          
          // El servidor ya actualiza el registro con las evidencias, pero verificamos
          if (uploadResponse && uploadResponse.paths && uploadResponse.paths.length > 0) {
            pushToast(`✅ ${uploadResponse.count} evidencia(s) subida(s) correctamente`, 'ok');
          } else {
            pushToast('⚠️ Las evidencias se subieron pero puede haber un problema', 'warn');
          }
        } catch (error) {
          console.error('Error subiendo evidencias:', error);
          pushToast('⚠️ Error al subir evidencias. Intenta nuevamente.', 'error');
        }
      }
      
      // Limpiar evidencias
      if (Array.isArray(modalNuevoRegistro.evidencias)) {
        modalNuevoRegistro.evidencias.forEach(ev => {
          if (ev && ev.preview) {
            URL.revokeObjectURL(ev.preview);
          }
        });
      }
      
      // Cerrar modal y recargar
      notificarFinProceso(form.pedido);
      limpiarProgresoLocal(form.pedido.trim());
      setModalNuevoRegistro({
        open: false,
        form: {
          fecha: new Date().toISOString().split('T')[0],
          pedido: '',
          codigo: '',
          producto: '',
          presentacion: '',
          cantidad: 0,
          lote: '',
          caducidad: '',
          laboratorio: '',
          clasificacion_etiqueta: '',
          defecto: '',
          destino: '',
          comentarios_calidad: ''
        },
        evidencias: [],
        subiendo: false
      });
      
      await cargarRegistros();
      pushToast('✅ Registro creado exitosamente', 'ok');
    } catch (error) {
      console.error('Error guardando registro:', error);
      pushToast(`❌ Error al guardar registro: ${error.message || 'Error desconocido'}`, 'error');
      notificarFinProceso(form.pedido);
      limpiarProgresoLocal(form.pedido.trim());
      setModalNuevoRegistro(prev => ({ ...prev, subiendo: false }));
    }
  };

  // Buffer de escaneo para capturar el código completo
  const SCAN_DELAY = 50; // Milisegundos de espera para considerar que terminó el escaneo
  
  const handleScanInput = (value, registroId) => {
    // Inicializar buffer si no existe para este registro
    if (!scanBufferRef.current[registroId]) {
      scanBufferRef.current[registroId] = '';
    }
    
    // Actualizar buffer
    scanBufferRef.current[registroId] = value;
    
    // Limpiar timeout anterior
    if (scanTimeoutRef.current[registroId]) {
      clearTimeout(scanTimeoutRef.current[registroId]);
    }
    
    // Esperar a que termine el escaneo
    scanTimeoutRef.current[registroId] = setTimeout(() => {
      const codigoCompleto = scanBufferRef.current[registroId].trim();
      scanBufferRef.current[registroId] = '';
      
      // Si el código tiene más de 3 caracteres, procesarlo
      if (codigoCompleto.length > 3) {
        buscarProductoPorCodigo(codigoCompleto, registroId);
      }
    }, SCAN_DELAY);
  };

  // Buscar producto por código en inventario
  const buscarProductoPorCodigo = async (codigo, registroId) => {
    if (!codigo || !codigo.trim()) {
      return;
    }
    
    try {
      const producto = await authFetch(`${serverUrl}/devoluciones/calidad/buscar-producto/${codigo.trim()}`);
      
      if (producto) {
        // Actualizar todos los campos de una vez para evitar múltiples llamadas
        await authFetch(`${serverUrl}/devoluciones/calidad/registros/${registroId}`, {
          method: 'PUT',
          body: JSON.stringify({
            codigo: producto.codigo,
            producto: producto.nombre,
            presentacion: producto.presentacion
          })
        });
        
        // Actualizar el estado local
        setRegistros(prev => prev.map(r => 
          r.id === registroId 
            ? { ...r, codigo: producto.codigo, producto: producto.nombre, presentacion: producto.presentacion }
            : r
        ));
        
        pushToast('✅ Producto cargado desde inventario', 'ok');
      }
    } catch (error) {
      console.error('Error buscando producto:', error);
      // No mostrar error si el producto no se encuentra, solo log
    }
  };

  // Actualizar un campo de un registro
  const actualizarCampo = async (id, campo, valor, skipAutoSearch = false) => {
    try {
      await authFetch(`${serverUrl}/devoluciones/calidad/registros/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ [campo]: valor })
      });
      
      setRegistros(prev => prev.map(r => r.id === id ? { ...r, [campo]: valor } : r));
      
      // Si se actualiza el código y no se está saltando la búsqueda automática, buscar el producto
      if (campo === 'codigo' && valor && valor.trim() && !skipAutoSearch) {
        buscarProductoPorCodigo(valor, id);
      } else if (campo !== 'codigo') {
        // Solo mostrar toast si no es código (para evitar múltiples toasts)
        pushToast('✅ Actualizado', 'ok');
      }
    } catch (error) {
      console.error('Error actualizando:', error);
      pushToast('❌ Error al actualizar', 'error');
    }
  };

  // Obtener color de fondo según el valor (colores adaptados al tema oscuro)
  const getColorFondo = (tipo, valor) => {
    if (!valor) return 'var(--fondo-input)';
    
    if (tipo === 'clasificacion') {
      if (valor === 'B') return 'rgba(16, 185, 129, 0.2)'; // Verde claro adaptado
      if (valor === 'C') return 'rgba(245, 158, 11, 0.2)'; // Amarillo claro adaptado
      if (valor === 'D') return 'rgba(59, 130, 246, 0.2)'; // Azul claro adaptado
      if (valor === 'Importación') return 'rgba(139, 92, 246, 0.2)'; // Morado claro adaptado
    }
    
    if (tipo === 'destino') {
      if (valor === 'Reacondicionamiento') return 'rgba(249, 115, 22, 0.2)'; // Naranja claro adaptado
      if (valor === 'Outlet') return 'rgba(59, 130, 246, 0.2)'; // Azul claro adaptado
      if (valor === 'Merma') return 'rgba(239, 68, 68, 0.2)'; // Rojo claro adaptado
    }
    
    if (tipo === 'laboratorio') {
      if (valor === 'GCE') return 'rgba(16, 185, 129, 0.2)'; // Verde claro adaptado
      if (valor === 'ZUMA') return 'rgba(59, 130, 246, 0.2)'; // Azul claro adaptado
    }
    
    return 'var(--fondo-input)';
  };

  // Renderizar select normal con opción de agregar/editar/eliminar
  const renderDropdown = (tipo, valor, onChange, opciones, campo, registroId) => {
    const estaEditando = editandoOpcion.tipo === tipo && editandoOpcion.id !== null;
    const estaAgregando = mostrarInputNuevo.tipo === tipo && mostrarInputNuevo.campo === campo;
    
    const inputValue = tipo === 'laboratorio' ? nuevoLaboratorio :
                      tipo === 'clasificacion' ? nuevaClasificacion :
                      tipo === 'defecto' ? nuevoDefecto : nuevoDestino;
    const setInputValue = tipo === 'laboratorio' ? setNuevoLaboratorio :
                         tipo === 'clasificacion' ? setNuevaClasificacion :
                         tipo === 'defecto' ? setNuevoDefecto : setNuevoDestino;
    const colorFondo = getColorFondo(tipo, valor);

    return (
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', width: '100%' }}>
        <select
          value={valor || ''}
          onChange={(e) => {
            const selectedValue = e.target.value;
            if (selectedValue && selectedValue.startsWith('EDIT_')) {
              const optId = parseInt(selectedValue.replace('EDIT_', ''));
              const opt = opciones.find(o => o.id === optId);
              if (opt) {
                setEditandoOpcion({ tipo, id: optId, nombre: opt.nombre || opt });
              }
              e.target.value = valor || '';
            } else if (selectedValue && selectedValue.startsWith('DELETE_')) {
              const optId = parseInt(selectedValue.replace('DELETE_', ''));
              if (window.confirm('¿Estás seguro de eliminar esta opción?')) {
                eliminarOpcion(tipo, optId);
              }
              e.target.value = valor || '';
            } else {
              onChange(selectedValue);
            }
          }}
          onDoubleClick={async (e) => {
            const selectedValue = e.target.value;
            if (selectedValue && selectedValue !== '') {
              const opt = opciones.find(o => (o.nombre || o) === selectedValue);
              if (opt && opt.id) {
                setEditandoOpcion({ tipo, id: opt.id, nombre: opt.nombre || opt });
              }
            }
          }}
          style={{
            flex: 1,
            padding: '6px 10px',
            paddingRight: '30px',
            borderRadius: 'var(--radio-md)',
            border: '1px solid var(--borde-medio)',
            backgroundColor: valor ? colorFondo : 'var(--fondo-input)',
            color: 'var(--texto-principal)',
            fontSize: '0.85rem',
            minWidth: tipo === 'clasificacion' ? '160px' : '120px',
            cursor: 'pointer'
          }}
        >
          <option value="">Seleccione...</option>
          {opciones.map((opt) => {
            const optNombre = opt.nombre || opt;
            const optId = opt.id;
            return (
              <option key={optId || optNombre} value={optNombre}>
                {optNombre}
              </option>
            );
          })}
        </select>
        
        {/* Botón para agregar nueva opción */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (estaAgregando) {
              setMostrarInputNuevo({ tipo: null, campo: null });
              setInputValue('');
            } else {
              setMostrarInputNuevo({ tipo, campo });
              if (tipo === 'laboratorio') setNuevoLaboratorio('');
              if (tipo === 'clasificacion') setNuevaClasificacion('');
              if (tipo === 'defecto') setNuevoDefecto('');
              if (tipo === 'destino') setNuevoDestino('');
            }
          }}
          style={{
            padding: '6px 10px',
            borderRadius: 'var(--radio-md)',
            border: '1px solid var(--borde-visible)',
            backgroundColor: 'transparent',
            color: 'var(--texto-principal)',
            fontSize: '0.85rem',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            minWidth: '30px'
          }}
          title="Agregar nueva opción"
        >
          {estaAgregando ? '✕' : '+'}
        </button>
        
        {/* Input para agregar nueva opción */}
        {estaAgregando && (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flex: 1 }}>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  await agregarNuevaOpcion(tipo, inputValue, campo);
                } else if (e.key === 'Escape') {
                  setMostrarInputNuevo({ tipo: null, campo: null });
                  setInputValue('');
                }
              }}
              placeholder="Nueva opción"
              autoFocus
              style={{
                flex: 1,
                padding: '6px 10px',
                background: 'var(--fondo-input)',
                border: '1px solid var(--azul-primario)',
                borderRadius: 'var(--radio-md)',
                color: 'var(--texto-principal)',
                fontSize: '0.85rem'
              }}
            />
            <button
              type="button"
              onClick={async () => {
                await agregarNuevaOpcion(tipo, inputValue, campo);
              }}
              style={{
                padding: '6px 10px',
                borderRadius: 'var(--radio-md)',
                border: '1px solid var(--exito)',
                backgroundColor: 'var(--exito)',
                color: 'var(--texto-principal)',
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              ✓
            </button>
          </div>
        )}
        
        {/* Input para editar opción */}
        {estaEditando && (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flex: 1 }}>
            <input
              type="text"
              value={editandoOpcion.nombre}
              onChange={(e) => setEditandoOpcion({ ...editandoOpcion, nombre: e.target.value })}
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  await actualizarOpcion(tipo, editandoOpcion.id, editandoOpcion.nombre);
                } else if (e.key === 'Escape') {
                  setEditandoOpcion({ tipo: null, id: null, nombre: '' });
                }
              }}
              autoFocus
              style={{
                flex: 1,
                padding: '6px 10px',
                background: 'var(--fondo-input)',
                border: '1px solid var(--azul-primario)',
                borderRadius: 'var(--radio-md)',
                color: 'var(--texto-principal)',
                fontSize: '0.85rem'
              }}
            />
            <button
              type="button"
              onClick={async () => {
                await actualizarOpcion(tipo, editandoOpcion.id, editandoOpcion.nombre);
              }}
              style={{
                padding: '6px 10px',
                borderRadius: 'var(--radio-md)',
                border: '1px solid var(--exito)',
                backgroundColor: 'var(--exito)',
                color: 'var(--texto-principal)',
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              ✓
            </button>
            <button
              type="button"
              onClick={async () => {
                const confirmado = await showConfirm('¿Estás seguro de eliminar esta opción?');
                if (confirmado) {
                  await eliminarOpcion(tipo, editandoOpcion.id);
                }
              }}
              style={{
                padding: '6px 10px',
                borderRadius: 'var(--radio-md)',
                border: '1px solid var(--error)',
                backgroundColor: 'var(--error)',
                color: 'var(--texto-principal)',
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              🗑️
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="control-calidad">
      <div className="gestion-header">
        <h3>Control de Calidad</h3>
        </div>

      {/* Selector de AREA */}
      <div className="area-selector">
        <label>
          📋 AREA DE PROCESO
        </label>
        <select
          value={areaSeleccionada}
          onChange={(e) => setAreaSeleccionada(e.target.value)}
        >
          {AREAS.map(area => (
            <option key={area} value={area}>{area}</option>
          ))}
        </select>
        <p>
          Mostrando registros de: <strong>{areaSeleccionada}</strong> ({registros.length} {registros.length === 1 ? 'registro' : 'registros'})
        </p>
      </div>

      {/* Indicador de registros de calidad en proceso */}
      {calidadEnProceso.length > 0 && (
        <div className="calidad-en-proceso-indicador">
          {calidadEnProceso.map((proceso, idx) => (
            <div 
              key={idx} 
              className="proceso-item"
              onClick={() => regresarAProceso(proceso.pedido)}
              title="Click para regresar al registro en proceso"
            >
              <span className="proceso-icon">🔬</span>
              <span className="proceso-texto">
                Registrando en {proceso.area}: 
                <strong> {proceso.pedido}</strong>
                {proceso.usuario && ` (${proceso.usuario})`}
              </span>
              <span className="proceso-loading">
                <span className="dot">.</span>
                <span className="dot">.</span>
                <span className="dot">.</span>
              </span>
            </div>
          ))}
        </div>
      )}
        
      {/* Botón para agregar nuevo registro */}
      <div style={{ marginBottom: '16px' }}>
        <button
          onClick={abrirModalNuevoRegistro}
          className="btn-agregar-registro"
        >
          + Agregar Nuevo Registro
        </button>
      </div>

      {/* Tabla de registros */}
      <div className="gestion-table-wrapper">
        {loading ? (
          <div className="gestion-loader">Cargando...</div>
        ) : registros.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p className="gestion-empty">Sin registros en {areaSeleccionada}.</p>
            <button
              onClick={abrirModalNuevoRegistro}
              className="btn-agregar-registro"
              style={{ marginTop: '16px' }}
            >
              Crear Primer Registro
            </button>
          </div>
        ) : (
          <table className="tabla-calidad-completa">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Pedido</th>
                <th>Código</th>
                <th>Producto</th>
                <th>Presentación</th>
                <th>Cantidad</th>
                <th>Lote</th>
                <th>Caducidad</th>
                <th>Laboratorio</th>
                <th style={{ minWidth: '180px' }}>Clasificación de etiqueta</th>
                <th>Defecto</th>
                <th>Recibido por Calidad</th>
                <th>Destino</th>
                <th>Comentarios Calidad</th>
                <th>Todas las evidencias</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((registro) => (
                <tr key={registro.id}>
                  <td>
                    <input
                      type="date"
                      value={registro.fecha ? (registro.fecha.includes('T') ? registro.fecha.split('T')[0] : registro.fecha.split(' ')[0]) : ''}
                      onChange={(e) => actualizarCampo(registro.id, 'fecha', e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--borde-medio)', borderRadius: 'var(--radio-md)', fontSize: '0.85rem', background: 'var(--fondo-input)', color: 'var(--texto-principal)' }}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={registro.pedido || ''}
                      onChange={(e) => actualizarCampo(registro.id, 'pedido', e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--borde-medio)', borderRadius: 'var(--radio-md)', fontSize: '0.85rem', background: 'var(--fondo-input)', color: 'var(--texto-principal)' }}
                      placeholder="Pedido"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={registro.codigo || ''}
                      onChange={(e) => {
                        const valor = e.target.value;
                        // Actualizar el estado inmediatamente para mostrar el valor
                        actualizarCampo(registro.id, 'codigo', valor, true);
                        // Procesar el escaneo con buffer
                        handleScanInput(valor, registro.id);
                      }}
                      onBlur={(e) => {
                        // Si hay un valor y no se procesó automáticamente, buscarlo
                        if (e.target.value && e.target.value.trim()) {
                          const codigo = e.target.value.trim();
                          // Verificar si ya se procesó (evitar doble búsqueda)
                          if (codigo.length > 3) {
                            buscarProductoPorCodigo(codigo, registro.id);
                          }
                        }
                      }}
                      style={{ width: '100%', padding: '4px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.85rem', fontWeight: '600' }}
                      placeholder="Código"
                      title="Escanea o ingresa el código y se llenará automáticamente el producto y presentación"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                  </td>
                  <td>
                      <input
                      type="text"
                      value={registro.producto || ''}
                      onChange={(e) => actualizarCampo(registro.id, 'producto', e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--borde-medio)', borderRadius: 'var(--radio-md)', fontSize: '0.85rem', background: 'var(--fondo-input)', color: 'var(--texto-principal)' }}
                      placeholder="Producto"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={registro.presentacion || ''}
                      onChange={(e) => actualizarCampo(registro.id, 'presentacion', e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--borde-medio)', borderRadius: 'var(--radio-md)', fontSize: '0.85rem', background: 'var(--fondo-input)', color: 'var(--texto-principal)' }}
                      placeholder="Presentación"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={registro.cantidad || ''}
                      onChange={(e) => actualizarCampo(registro.id, 'cantidad', parseInt(e.target.value) || 0)}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--borde-medio)', borderRadius: 'var(--radio-md)', fontSize: '0.85rem', background: 'var(--fondo-input)', color: 'var(--texto-principal)' }}
                      placeholder="Cantidad"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={registro.lote || ''}
                      onChange={(e) => actualizarCampo(registro.id, 'lote', e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--borde-medio)', borderRadius: 'var(--radio-md)', fontSize: '0.85rem', background: 'var(--fondo-input)', color: 'var(--texto-principal)' }}
                      placeholder="Lote"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={registro.caducidad || ''}
                      onChange={(e) => actualizarCampo(registro.id, 'caducidad', e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--borde-medio)', borderRadius: 'var(--radio-md)', fontSize: '0.85rem', background: 'var(--fondo-input)', color: 'var(--texto-principal)' }}
                      placeholder="Caducidad"
                    />
                  </td>
                  <td>
                    {renderDropdown(
                      'laboratorio',
                      registro.laboratorio,
                      (val) => actualizarCampo(registro.id, 'laboratorio', val),
                      laboratorios,
                      'laboratorio',
                      registro.id
                    )}
                  </td>
                  <td>
                    {renderDropdown(
                      'clasificacion',
                      registro.clasificacion_etiqueta,
                      (val) => actualizarCampo(registro.id, 'clasificacion_etiqueta', val),
                      clasificaciones,
                      'clasificacion',
                      registro.id
                    )}
                  </td>
                  <td>
                    {renderDropdown(
                      'defecto',
                      registro.defecto,
                      (val) => actualizarCampo(registro.id, 'defecto', val),
                      defectos,
                      'defecto',
                      registro.id
                    )}
                  </td>
                  <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      <label className="switch" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                        <input
                          type="checkbox"
                        checked={registro.recibido_calidad === 1 || registro.recibido_calidad === 'Si'}
                        onChange={(e) => actualizarCampo(registro.id, 'recibido_calidad', e.target.checked ? 1 : 0)}
                        />
                        <span className="slider" />
                      </label>
                  </td>
                  <td>
                    {renderDropdown(
                      'destino',
                      registro.destino,
                      (val) => actualizarCampo(registro.id, 'destino', val),
                      destinos,
                      'destino',
                      registro.id
                    )}
                  </td>
                  <td>
            <input
              type="text"
                      value={registro.comentarios_calidad || ''}
                      onChange={(e) => actualizarCampo(registro.id, 'comentarios_calidad', e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--borde-medio)', borderRadius: 'var(--radio-md)', fontSize: '0.85rem', background: 'var(--fondo-input)', color: 'var(--texto-principal)' }}
                      placeholder="Comentarios..."
                    />
                  </td>
                  <td>
                    {(() => {
                      let evidenciasArray = [];
                      
                      if (registro.evidencias && Array.isArray(registro.evidencias)) {
                        evidenciasArray = registro.evidencias;
                      } else if (registro.evidencias && typeof registro.evidencias === 'string') {
                        try {
                          const parsed = JSON.parse(registro.evidencias);
                          evidenciasArray = Array.isArray(parsed) ? parsed : [registro.evidencias];
                        } catch {
                          evidenciasArray = [registro.evidencias];
                        }
                      }
                      
                      if (evidenciasArray.length > 0) {
                        // Normalizar las evidencias
                        const evidenciasNormalizadas = evidenciasArray.map((ev, idx) => {
                          let url = '';
                          let nombre = `Evidencia ${idx + 1}`;
                          
                          // Si es un string simple
                          if (typeof ev === 'string') {
                            url = ev;
                            nombre = `Evidencia ${idx + 1}`;
                          } 
                          // Si es un objeto
                          else if (typeof ev === 'object' && ev !== null) {
                            // Intentar obtener la URL de diferentes campos posibles
                            url = ev.url || ev.path || ev.preview || ev.src || '';
                            nombre = ev.nombre || ev.filename || ev.name || `Evidencia ${idx + 1}`;
                          }
                          
                          // Construir URL completa si es necesario
                          if (url) {
                            // Si ya es una URL completa (http, https, blob), usarla tal cual
                            if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) {
                              // URL completa, usar tal cual
                            }
                            // Si empieza con /, agregar serverUrl
                            else if (url.startsWith('/')) {
                              url = `${serverUrl}${url}`;
                            }
                            // Si no empieza con / ni http, asumir que es un path relativo (nombre de archivo)
                            else if (url) {
                              // El path es el nombre del archivo generado por multer
                              // Construir la URL completa
                              url = `${serverUrl}/uploads/devoluciones/${url}`;
                            }
                          }
                          
                          return { url, nombre, original: ev };
                        }).filter(ev => ev.url && ev.url.trim() !== ''); // Filtrar evidencias sin URL válida
                        
                        return (
                          <button
                            onClick={() => setModalEvidencias({ 
                              open: true, 
                              evidencias: evidenciasNormalizadas, 
                              indiceActual: 0,
                              registroId: registro.id,
                              modoEdicion: false
                            })}
                            style={{
                              padding: '4px 8px',
                              background: 'transparent',
                              color: 'var(--texto-principal)',
                              border: '1px solid var(--borde-visible)',
                              borderRadius: 'var(--radio-sm)',
                              cursor: 'pointer',
                              fontSize: '0.65rem',
                              fontWeight: '600',
                              transition: 'all 0.2s',
                              whiteSpace: 'nowrap'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'var(--fondo-card-hover)';
                              e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent';
                              e.currentTarget.style.transform = 'translateY(0)';
                            }}
                          >
                            👁️ Ver evidencias ({evidenciasNormalizadas.length})
                          </button>
                        );
                      } else {
                        return (
                          <button
                            onClick={() => setModalEvidencias({ 
                              open: true, 
                              evidencias: [], 
                              indiceActual: 0,
                              registroId: registro.id,
                              modoEdicion: true
                            })}
                            style={{
                              padding: '4px 8px',
                              background: 'var(--exito)',
                              color: 'var(--texto-principal)',
                              border: 'none',
                              borderRadius: 'var(--radio-sm)',
                              cursor: 'pointer',
                              fontSize: '0.65rem',
                              fontWeight: '600',
                              transition: 'all 0.2s',
                              whiteSpace: 'nowrap'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'var(--fondo-card-hover)';
                              e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'var(--exito)';
                              e.currentTarget.style.transform = 'translateY(0)';
                            }}
                          >
                            ➕ Agregar evidencias
                          </button>
                        );
                      }
                    })()}
                  </td>
                  <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                    <button
                      className="btn-borrar"
                      onClick={async () => {
                        const confirmado = await showConfirm('¿Estás seguro de eliminar este registro?');
                        if (!confirmado) return;
                        try {
                          await authFetch(`${serverUrl}/devoluciones/calidad/registros/${registro.id}`, {
                            method: 'DELETE'
                          });
                          pushToast('✅ Registro eliminado', 'ok');
                          cargarRegistros();
                        } catch (error) {
                          console.error('Error eliminando registro:', error);
                          pushToast('❌ Error al eliminar registro', 'error');
                        }
                      }}
                      style={{
                        padding: '6px 12px',
                        background: 'var(--error)',
                        color: 'var(--texto-principal)',
                        border: 'none',
                        borderRadius: 'var(--radio-md)',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontWeight: '600',
                        transition: 'all var(--transicion-media)'
                      }}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal para agregar nuevo registro */}
      {modalNuevoRegistro.open && (
        <div 
          className="activation-modal-overlay" 
          onClick={() => {
            if (!modalNuevoRegistro.subiendo) {
              if (Array.isArray(modalNuevoRegistro.evidencias)) {
                modalNuevoRegistro.evidencias.forEach(ev => {
                  if (ev && ev.preview) {
                    URL.revokeObjectURL(ev.preview);
                  }
                });
              }
              setModalNuevoRegistro({
                open: false,
                form: {
                  fecha: new Date().toISOString().split('T')[0],
                  pedido: '',
                  codigo: '',
                  producto: '',
                  presentacion: '',
                  cantidad: 0,
                  lote: '',
                  caducidad: '',
                  laboratorio: '',
                  clasificacion_etiqueta: '',
                  defecto: '',
                  destino: '',
                  comentarios_calidad: ''
                },
                evidencias: [],
                subiendo: false
              });
            }
          }}
        >
          <div
            className="activation-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '95vw', width: '800px', maxHeight: '90vh', overflowY: 'auto', zIndex: 10001, position: 'relative' }}
          >
            <div className="activation-modal__header">
              <h4>Nuevo Registro - {areaSeleccionada}</h4>
              <button 
                className="btn-plain" 
                onClick={() => {
                  if (!modalNuevoRegistro.subiendo) {
                    if (Array.isArray(modalNuevoRegistro.evidencias)) {
                      modalNuevoRegistro.evidencias.forEach(ev => {
                        if (ev && ev.preview) {
                          URL.revokeObjectURL(ev.preview);
                        }
                      });
                    }
                    setModalNuevoRegistro({
                      open: false,
                      form: {
                        fecha: new Date().toISOString().split('T')[0],
                        pedido: '',
                        codigo: '',
                        producto: '',
                        presentacion: '',
                        cantidad: 0,
                        lote: '',
                        caducidad: '',
                        laboratorio: '',
                        clasificacion_etiqueta: '',
                        defecto: '',
                        destino: '',
                        comentarios_calidad: ''
                      },
                      evidencias: [],
                      subiendo: false
                    });
                  }
                }}
                disabled={modalNuevoRegistro.subiendo}
              >
                ✕
              </button>
            </div>
            
            <div style={{ padding: '12px' }}>
              {/* Inputs ocultos para archivos */}
              <input
                ref={fileInputRefModal}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  const nuevasEvidencias = files.map(file => ({
                    file,
                    preview: URL.createObjectURL(file),
                    idTemp: Date.now() + Math.random()
                  }));
                  setModalNuevoRegistro(prev => ({
                    ...prev,
                    evidencias: [...prev.evidencias, ...nuevasEvidencias]
                  }));
                }}
                style={{ display: 'none' }}
              />


              {/* Formulario */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <label>
                  Fecha
                  <input
                    type="date"
                    value={modalNuevoRegistro.form.fecha}
                    onChange={(e) => setModalNuevoRegistro(prev => ({
                      ...prev,
                      form: { ...prev.form, fecha: e.target.value }
                    }))}
                    style={{ width: '100%', padding: '6px', marginTop: '4px', fontSize: '0.8rem' }}
                  />
                </label>

                <label>
                  Pedido
                  <input
                    type="text"
                    value={modalNuevoRegistro.form.pedido}
                    onChange={(e) => {
                      const nuevoPedido = e.target.value;
                      setModalNuevoRegistro(prev => ({
                        ...prev,
                        form: { ...prev.form, pedido: nuevoPedido }
                      }));
                      // Notificar inicio cuando se ingresa un pedido
                      if (nuevoPedido.trim() && !modalNuevoRegistro.form.pedido.trim()) {
                        notificarInicioProceso(nuevoPedido);
                      }
                    }}
                    placeholder="Número de pedido"
                    style={{ width: '100%', padding: '6px', marginTop: '4px', fontSize: '0.8rem' }}
                  />
                </label>

                <label>
                  Código *
                  <input
                    ref={codigoInputRefModal}
                    type="text"
                    value={modalNuevoRegistro.form.codigo}
                    onChange={(e) => {
                      setModalNuevoRegistro(prev => ({
                        ...prev,
                        form: { ...prev.form, codigo: e.target.value }
                      }));
                      // Buscar producto después de un delay
                      const codigo = e.target.value.trim();
                      if (codigo.length > 3) {
                        setTimeout(() => buscarProductoModal(codigo), 500);
                      }
                    }}
                    placeholder="Escanea o ingresa código"
                    style={{ width: '100%', padding: '6px', marginTop: '4px', fontSize: '0.8rem' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        buscarProductoModal(modalNuevoRegistro.form.codigo);
                      }
                    }}
                  />
                </label>

                <label>
                  Producto *
                  <input
                    type="text"
                    value={modalNuevoRegistro.form.producto}
                    onChange={(e) => setModalNuevoRegistro(prev => ({
                      ...prev,
                      form: { ...prev.form, producto: e.target.value }
                    }))}
                    placeholder="Nombre del producto"
                    style={{ width: '100%', padding: '6px', marginTop: '4px', fontSize: '0.8rem' }}
                  />
                </label>

                <label>
                  Presentación
                  <input
                    type="text"
                    value={modalNuevoRegistro.form.presentacion}
                    onChange={(e) => setModalNuevoRegistro(prev => ({
                      ...prev,
                      form: { ...prev.form, presentacion: e.target.value }
                    }))}
                    placeholder="Presentación"
                    style={{ width: '100%', padding: '6px', marginTop: '4px', fontSize: '0.8rem' }}
                  />
                </label>

                <label>
                  Cantidad
                  <input
                    type="number"
                    min="0"
                    value={modalNuevoRegistro.form.cantidad}
                    onChange={(e) => setModalNuevoRegistro(prev => ({
                      ...prev,
                      form: { ...prev.form, cantidad: e.target.value }
                    }))}
                    placeholder="0"
                    style={{ width: '100%', padding: '6px', marginTop: '4px', fontSize: '0.8rem' }}
                  />
                </label>

                <label>
                  Lote
                  <input
                    type="text"
                    value={modalNuevoRegistro.form.lote}
                    onChange={(e) => setModalNuevoRegistro(prev => ({
                      ...prev,
                      form: { ...prev.form, lote: e.target.value }
                    }))}
                    placeholder="Lote"
                    style={{ width: '100%', padding: '6px', marginTop: '4px', fontSize: '0.8rem' }}
                  />
                </label>

                <label>
                  Caducidad
                  <input
                    type="text"
                    value={modalNuevoRegistro.form.caducidad}
                    onChange={(e) => setModalNuevoRegistro(prev => ({
                      ...prev,
                      form: { ...prev.form, caducidad: e.target.value }
                    }))}
                    placeholder="Fecha de caducidad"
                    style={{ width: '100%', padding: '6px', marginTop: '4px', fontSize: '0.8rem' }}
                  />
                </label>

                <label>
                  Laboratorio
                  {renderDropdown(
                    'laboratorio',
                    modalNuevoRegistro.form.laboratorio,
                    (val) => setModalNuevoRegistro(prev => ({
                      ...prev,
                      form: { ...prev.form, laboratorio: val }
                    })),
                    laboratorios,
                    'laboratorio',
                    'modal'
                  )}
                </label>

                <label>
                  Clasificación de etiqueta
                  {renderDropdown(
                    'clasificacion',
                    modalNuevoRegistro.form.clasificacion_etiqueta,
                    (val) => setModalNuevoRegistro(prev => ({
                      ...prev,
                      form: { ...prev.form, clasificacion_etiqueta: val }
                    })),
                    clasificaciones,
                    'clasificacion',
                    'modal'
                  )}
                </label>

                <label>
                  Defecto
                  {renderDropdown(
                    'defecto',
                    modalNuevoRegistro.form.defecto,
                    (val) => setModalNuevoRegistro(prev => ({
                      ...prev,
                      form: { ...prev.form, defecto: val }
                    })),
                    defectos,
                    'defecto',
                    'modal'
                  )}
                </label>

                <label>
                  Destino
                  {renderDropdown(
                    'destino',
                    modalNuevoRegistro.form.destino,
                    (val) => setModalNuevoRegistro(prev => ({
                      ...prev,
                      form: { ...prev.form, destino: val }
                    })),
                    destinos,
                    'destino',
                    'modal'
                  )}
                </label>
              </div>

              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem' }}>
                Comentarios Calidad
                <textarea
                  value={modalNuevoRegistro.form.comentarios_calidad}
                  onChange={(e) => setModalNuevoRegistro(prev => ({
                    ...prev,
                    form: { ...prev.form, comentarios_calidad: e.target.value }
                  }))}
                  placeholder="Comentarios adicionales"
                  style={{ width: '100%', padding: '6px', marginTop: '4px', minHeight: '60px', resize: 'vertical', fontSize: '0.8rem' }}
                />
              </label>

              {/* Botones para agregar evidencias y acciones - todos en una línea */}
              <div className="modal-buttons-container">
                <div className="modal-buttons-left">
                  <button
                    className="btn-modal-action"
                    onClick={() => fileInputRefModal.current?.click()}
                    disabled={modalNuevoRegistro.subiendo}
                  >
                    📁 Seleccionar
                  </button>
                  <button
                    className="btn-modal-action"
                    onClick={abrirCamaraModal}
                    disabled={modalNuevoRegistro.subiendo}
                  >
                    📷 Tomar foto
                  </button>
                </div>
                <div className="modal-buttons-right">
                  <button
                    className="btn-modal-action btn-modal-cancel"
                    onClick={() => {
                      if (!modalNuevoRegistro.subiendo) {
                        const pedido = modalNuevoRegistro.form.pedido.trim();
                        if (pedido) {
                          notificarFinProceso(pedido);
                          limpiarProgresoLocal(pedido);
                        }
                        if (Array.isArray(modalNuevoRegistro.evidencias)) {
                          modalNuevoRegistro.evidencias.forEach(ev => {
                            if (ev && ev.preview) {
                              URL.revokeObjectURL(ev.preview);
                            }
                          });
                        }
                        setModalNuevoRegistro({
                          open: false,
                          form: {
                            fecha: new Date().toISOString().split('T')[0],
                            pedido: '',
                            codigo: '',
                            producto: '',
                            presentacion: '',
                            cantidad: 0,
                            lote: '',
                            caducidad: '',
                            laboratorio: '',
                            clasificacion_etiqueta: '',
                            defecto: '',
                            destino: '',
                            comentarios_calidad: ''
                          },
                          evidencias: [],
                          subiendo: false
                        });
                      }
                    }}
                    disabled={modalNuevoRegistro.subiendo}
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn-modal-action btn-modal-save"
                    onClick={guardarNuevoRegistro}
                    disabled={modalNuevoRegistro.subiendo}
                  >
                    {modalNuevoRegistro.subiendo ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>

              {/* Preview de evidencias */}
              {Array.isArray(modalNuevoRegistro.evidencias) && modalNuevoRegistro.evidencias.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h5 style={{ marginBottom: '10px' }}>Evidencias ({modalNuevoRegistro.evidencias.length})</h5>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', 
                    gap: '10px',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    {modalNuevoRegistro.evidencias.map((ev, idx) => (
                      <div key={ev.idTemp} style={{ position: 'relative' }}>
                        <img
                          src={ev.preview}
                          alt={`Evidencia ${idx + 1}`}
                          style={{
                            width: '100%',
                            height: '100px',
                            objectFit: 'cover',
                            borderRadius: 'var(--radio-md)',
                            border: '2px solid var(--borde-medio)'
                          }}
                        />
                        <button
                          onClick={() => {
                            setModalNuevoRegistro(prev => ({
                              ...prev,
                              evidencias: prev.evidencias.filter(e => e.idTemp !== ev.idTemp)
                            }));
                            URL.revokeObjectURL(ev.preview);
                          }}
                          disabled={modalNuevoRegistro.subiendo}
                          style={{
                            position: 'absolute',
                            top: '5px',
                            right: '5px',
                            background: 'var(--error)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Modal de evidencias */}
      {modalEvidencias.open && (
        <div 
          className="activation-modal-overlay"
          onClick={() => {
            // Limpiar previews de nuevas evidencias antes de cerrar
            if (Array.isArray(modalEvidencias.nuevasEvidencias)) {
              modalEvidencias.nuevasEvidencias.forEach(ev => {
                if (ev && ev.preview) {
                  URL.revokeObjectURL(ev.preview);
                }
              });
            }
            setModalEvidencias({ 
              open: false, 
              evidencias: [], 
              indiceActual: 0,
              registroId: null,
              modoEdicion: false,
              nuevasEvidencias: []
            });
          }}
          style={{ zIndex: 100003 }}
        >
          <div
            className="activation-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ 
              maxWidth: '95vw', 
              width: '90vw', 
              maxHeight: '85vh', 
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 100004
            }}
          >
            <div className="activation-modal__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px' }}>
              <h4 style={{ fontSize: '0.85rem', margin: 0 }}>
                {Array.isArray(modalEvidencias.evidencias) && modalEvidencias.evidencias.length > 0 
                  ? `Evidencias (${modalEvidencias.indiceActual + 1} de ${modalEvidencias.evidencias.length})`
                  : 'Agregar evidencias'}
              </h4>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {modalEvidencias.registroId && (
                  <button
                    onClick={() => setModalEvidencias(prev => ({ ...prev, modoEdicion: !prev.modoEdicion }))}
                    style={{
                      padding: '4px 8px',
                      background: modalEvidencias.modoEdicion ? 'var(--exito)' : 'transparent',
                      color: 'var(--texto-principal)',
                      border: '1px solid var(--borde-visible)',
                      borderRadius: 'var(--radio-sm)',
                      cursor: 'pointer',
                      fontSize: '0.7rem',
                      fontWeight: '600'
                    }}
                  >
                    {modalEvidencias.modoEdicion ? '👁️ Ver' : '➕ Agregar'}
                  </button>
                )}
              <button 
                className="btn-plain" 
                  onClick={() => {
                    if (Array.isArray(modalEvidencias.nuevasEvidencias)) {
                      modalEvidencias.nuevasEvidencias.forEach(ev => {
                        if (ev && ev.preview) {
                          URL.revokeObjectURL(ev.preview);
                        }
                      });
                    }
                    setModalEvidencias({ 
                      open: false, 
                      evidencias: [], 
                      indiceActual: 0,
                      registroId: null,
                      modoEdicion: false,
                      nuevasEvidencias: []
                    });
                  }}
                style={{ fontSize: '1.2rem', padding: '4px 8px', minWidth: 'auto' }}
              >
                ✕
              </button>
              </div>
            </div>
            
            {/* Contenido del modal */}
            {modalEvidencias.modoEdicion ? (
              // Modo edición: mostrar formulario para agregar evidencias
              <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Input oculto para archivos */}
                <input
                  ref={fileInputRefEvidencias}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    const nuevasEvidencias = files.map(file => ({
                      file,
                      preview: URL.createObjectURL(file),
                      idTemp: Date.now() + Math.random()
                    }));
                    setModalEvidencias(prev => ({
                      ...prev,
                      nuevasEvidencias: [...(Array.isArray(prev.nuevasEvidencias) ? prev.nuevasEvidencias : []), ...nuevasEvidencias]
                    }));
                    e.target.value = '';
                  }}
                  style={{ display: 'none' }}
                />

                {/* Botones para agregar evidencias */}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button
                    className="btn-green"
                    onClick={() => fileInputRefEvidencias.current?.click()}
                    style={{ padding: '10px 20px', fontSize: '0.9rem' }}
                  >
                    📁 Seleccionar archivos
                  </button>
                  <button
                    className="btn-green"
                    onClick={abrirCamaraEvidencias}
                    style={{ padding: '10px 20px', fontSize: '0.9rem' }}
                  >
                    📷 Abrir cámara
                  </button>
                </div>

                {/* Preview de nuevas evidencias */}
                {Array.isArray(modalEvidencias.nuevasEvidencias) && modalEvidencias.nuevasEvidencias.length > 0 && (
                  <div>
                    <h5 style={{ marginBottom: '10px', fontSize: '0.9rem' }}>
                      Nuevas evidencias ({modalEvidencias.nuevasEvidencias.length})
                    </h5>
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', 
                      gap: '10px',
                      maxHeight: '200px',
                      overflowY: 'auto'
                    }}>
                      {modalEvidencias.nuevasEvidencias.map((ev, idx) => (
                        <div key={ev.idTemp} style={{ position: 'relative' }}>
                          <img
                            src={ev.preview}
                            alt={`Nueva evidencia ${idx + 1}`}
                            style={{
                              width: '100%',
                              height: '100px',
                              objectFit: 'cover',
                              borderRadius: 'var(--radio-md)',
                              border: '2px solid var(--borde-medio)'
                            }}
                          />
                          <button
                            onClick={() => {
                              setModalEvidencias(prev => ({
                                ...prev,
                                nuevasEvidencias: Array.isArray(prev.nuevasEvidencias) ? prev.nuevasEvidencias.filter(e => e.idTemp !== ev.idTemp) : []
                              }));
                              URL.revokeObjectURL(ev.preview);
                            }}
                            style={{
                              position: 'absolute',
                              top: '5px',
                              right: '5px',
                              background: 'var(--error)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '50%',
                              width: '24px',
                              height: '24px',
                              cursor: 'pointer',
                              fontSize: '14px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Botones de acción */}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
                  <button
                    className="btn-plain"
                    onClick={() => {
                      if (Array.isArray(modalEvidencias.nuevasEvidencias)) {
                        modalEvidencias.nuevasEvidencias.forEach(ev => {
                          if (ev && ev.preview) {
                            URL.revokeObjectURL(ev.preview);
                          }
                        });
                      }
                      setModalEvidencias(prev => ({ 
                        ...prev, 
                        modoEdicion: false,
                        nuevasEvidencias: []
                      }));
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn-green"
                    onClick={guardarNuevasEvidencias}
                    disabled={!Array.isArray(modalEvidencias.nuevasEvidencias) || modalEvidencias.nuevasEvidencias.length === 0}
                  >
                    💾 Guardar evidencias
                  </button>
                </div>
              </div>
            ) : Array.isArray(modalEvidencias.evidencias) && modalEvidencias.evidencias.length > 0 ? (
              // Modo visualización: mostrar evidencias existentes
              <>
            <div style={{ 
              flex: 1, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              padding: '12px',
              background: 'var(--fondo-secundario)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <img
                    src={Array.isArray(modalEvidencias.evidencias) && modalEvidencias.evidencias[modalEvidencias.indiceActual] ? modalEvidencias.evidencias[modalEvidencias.indiceActual].url : ''}
                    alt={Array.isArray(modalEvidencias.evidencias) && modalEvidencias.evidencias[modalEvidencias.indiceActual] ? modalEvidencias.evidencias[modalEvidencias.indiceActual].nombre : 'Evidencia'}
                style={{
                  maxWidth: '100%',
                  maxHeight: '65vh',
                  objectFit: 'contain',
                  borderRadius: 'var(--radio-sm)',
                  boxShadow: 'var(--sombra-md)'
                }}
                onError={(e) => {
                      const evidenciaActual = Array.isArray(modalEvidencias.evidencias) && modalEvidencias.evidencias[modalEvidencias.indiceActual] ? modalEvidencias.evidencias[modalEvidencias.indiceActual] : null;
                      if (!evidenciaActual) return;
                      console.error('Error cargando imagen:', evidenciaActual.url);
                      const currentUrl = evidenciaActual.url;
                  if (!currentUrl.includes('blob:') && !currentUrl.startsWith('http')) {
                    const altUrl = `${serverUrl}/uploads/devoluciones/${currentUrl.split('/').pop()}`;
                    if (altUrl !== currentUrl) {
                      e.target.src = altUrl;
                    } else {
                      e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect width="400" height="300" fill="%23ddd"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999"%3EImagen no disponible%3C/text%3E%3C/svg%3E';
                    }
                  } else {
                    e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect width="400" height="300" fill="%23ddd"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999"%3EImagen no disponible%3C/text%3E%3C/svg%3E';
                  }
                }}
                crossOrigin="anonymous"
              />
              
              {/* Botones de navegación */}
                  {Array.isArray(modalEvidencias.evidencias) && modalEvidencias.evidencias.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setModalEvidencias(prev => ({
                        ...prev,
                            indiceActual: Array.isArray(prev.evidencias) && prev.evidencias.length > 0
                              ? (prev.indiceActual > 0 ? prev.indiceActual - 1 : prev.evidencias.length - 1)
                              : 0
                      }));
                    }}
                    style={{
                      position: 'absolute',
                      left: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      padding: '10px 15px',
                      background: 'rgba(0, 0, 0, 0.5)',
                      color: '#ffffff',
                      border: '1px solid var(--borde-visible)',
                      borderRadius: 'var(--radio-full)',
                      cursor: 'pointer',
                      fontSize: '1.2rem',
                      fontWeight: 'bold',
                      boxShadow: 'var(--sombra-md)',
                      zIndex: 10
                    }}
                  >
                    ‹
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setModalEvidencias(prev => ({
                        ...prev,
                            indiceActual: Array.isArray(prev.evidencias) && prev.evidencias.length > 0
                              ? (prev.indiceActual < prev.evidencias.length - 1 ? prev.indiceActual + 1 : 0)
                              : 0
                      }));
                    }}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      padding: '10px 15px',
                      background: 'rgba(0, 0, 0, 0.5)',
                      color: '#ffffff',
                      border: '1px solid var(--borde-visible)',
                      borderRadius: 'var(--radio-full)',
                      cursor: 'pointer',
                      fontSize: '1.2rem',
                      fontWeight: 'bold',
                      boxShadow: 'var(--sombra-md)',
                      zIndex: 10
                    }}
                  >
                    ›
                  </button>
                </>
              )}
            </div>
            
            <div style={{ 
              padding: '10px 12px', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              borderTop: '1px solid var(--borde-sutil)',
              background: 'var(--fondo-card)',
              gap: '8px'
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--texto-secundario)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {Array.isArray(modalEvidencias.evidencias) && modalEvidencias.evidencias[modalEvidencias.indiceActual] ? modalEvidencias.evidencias[modalEvidencias.indiceActual].nombre : ''}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                      const evidencia = Array.isArray(modalEvidencias.evidencias) && modalEvidencias.evidencias[modalEvidencias.indiceActual] ? modalEvidencias.evidencias[modalEvidencias.indiceActual] : null;
                      if (!evidencia) return;
                  const link = document.createElement('a');
                  link.href = evidencia.url;
                  link.download = evidencia.nombre || 'evidencia.jpg';
                  link.target = '_blank';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                style={{
                  padding: '6px 12px',
                  background: 'transparent',
                  color: 'var(--texto-principal)',
                  border: '1px solid var(--borde-visible)',
                  borderRadius: 'var(--radio-sm)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  boxShadow: 'var(--sombra-xs)',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = 'var(--sombra-md)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'var(--sombra-xs)';
                }}
              >
                ⬇️ Descargar
              </button>
            </div>
              </>
            ) : (
              // Sin evidencias: mostrar mensaje y botones para agregar
              <div style={{ padding: '20px', textAlign: 'center' }}>
                <p style={{ marginBottom: '20px', color: 'var(--texto-secundario)' }}>
                  No hay evidencias para este registro
                </p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button
                    className="btn-green"
                    onClick={() => fileInputRefEvidencias.current?.click()}
                    style={{ padding: '10px 20px' }}
                  >
                    📁 Seleccionar archivos
                  </button>
                  <button
                    className="btn-green"
                    onClick={abrirCamaraEvidencias}
                    style={{ padding: '10px 20px' }}
                  >
                    📷 Abrir cámara
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de cámara para evidencias */}
      {showCamModalEvidencias && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            zIndex: 999999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <video 
            ref={videoRefEvidencias} 
            autoPlay 
            playsInline 
            style={{ 
              width: '100%', 
              maxWidth: '800px',
              maxHeight: '70vh',
              borderRadius: 'var(--radio-md)'
            }} 
          />
          
          <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
            <button
              className="btn-green"
              onClick={tomarFotoEvidencias}
              style={{ 
                padding: '15px 30px',
                fontSize: '1.1rem',
                borderRadius: '50%',
                width: '70px',
                height: '70px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              📸
            </button>
            
            <button
              className="btn-plain"
              onClick={cerrarCamaraEvidencias}
              style={{ 
                padding: '15px 30px',
                fontSize: '1rem'
              }}
            >
              ❌ Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal de cámara */}
      {showCamModal && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            zIndex: 999999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <video 
            ref={videoRefModal} 
            autoPlay 
            playsInline 
            style={{ 
              width: '100%', 
              maxWidth: '800px',
              maxHeight: '70vh',
              borderRadius: 'var(--radio-md)'
            }} 
          />
          
          <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
            <button
              className="btn-green"
              onClick={tomarFotoModal}
              style={{ 
                padding: '15px 30px',
                fontSize: '1.1rem',
                borderRadius: '50%',
                width: '70px',
                height: '70px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              📸
            </button>
            
            <button
              className="btn-plain"
              onClick={cerrarCamaraModal}
              style={{ 
                padding: '15px 30px',
                fontSize: '1rem'
              }}
            >
              ❌ Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
