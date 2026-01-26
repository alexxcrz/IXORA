import React, { useState, useEffect, useRef } from "react";
import "./Auditoria.css";
import { useAuth } from "../../AuthContext";
import { useAlert } from "../../components/AlertModal";
import { safeFocus, puedeHacerFocus } from "../../utils/focusHelper";
import ExcelJS from "exceljs";
import { Document, Packer, Paragraph, AlignmentType, TextRun, Table, TableRow, TableCell, WidthType } from "docx";

export default function Auditoria({ SERVER_URL, socket }) {
  const { authFetch, can } = useAuth();
  const { showAlert, showConfirm } = useAlert();
  
  const [auditorias, setAuditorias] = useState([]);
  const [auditoriaActual, setAuditoriaActual] = useState(null);
  const [itemsEscaneados, setItemsEscaneados] = useState([]);
  
  // Verificar si el usuario puede ver todos los items (admin o tiene permiso de inventario)
  const puedeVerTodo = can("admin") || can("tab:inventario");
  const [codigoInput, setCodigoInput] = useState("");
  const [nombreProducto, setNombreProducto] = useState("");
  const [lotesInput, setLotesInput] = useState([{ lote: "", cantidad: "", caducidad: "", piezasNoAptas: "" }]);
  const [mostrarNuevaAuditoria, setMostrarNuevaAuditoria] = useState(false);
  const [nombreAuditoria, setNombreAuditoria] = useState("");
  const [inventarios, setInventarios] = useState([]);
  const [inventarioSeleccionado, setInventarioSeleccionado] = useState(null);
  const [filtroDiferencias, setFiltroDiferencias] = useState("todos"); // todos, diferencias, coincidencias
  const [busqueda, setBusqueda] = useState("");
  const [exportando, setExportando] = useState(false);
  const [estadisticasInventario, setEstadisticasInventario] = useState({ totalProductos: 0, totalPiezas: 0 });
  const [showModalEliminarAuditoria, setShowModalEliminarAuditoria] = useState(false);
  const [auditoriaAEliminar, setAuditoriaAEliminar] = useState(null);
  const [passwordEliminar, setPasswordEliminar] = useState("");
  const [cargandoAuditoria, setCargandoAuditoria] = useState(false);
  const [cargandoItems, setCargandoItems] = useState(false);
  
  const codigoInputRef = useRef(null);
  const primerLoteInputRef = useRef(null);
  const procesandoRef = useRef(false);
  const auditoriaActualRef = useRef(null);
  const itemsEscaneadosRef = useRef([]);
  
  // Mantener refs sincronizados con el estado
  useEffect(() => {
    auditoriaActualRef.current = auditoriaActual;
  }, [auditoriaActual]);
  
  useEffect(() => {
    itemsEscaneadosRef.current = itemsEscaneados;
  }, [itemsEscaneados]);

  // Cargar auditorías y estadísticas del inventario al montar
  useEffect(() => {
    let mounted = true;
    
    const cargarDatos = async () => {
      try {
        await Promise.all([
          cargarAuditorias(),
          cargarEstadisticasInventario(),
          cargarInventarios()
        ]);
      } catch (err) {
        console.error("Error cargando datos iniciales:", err);
        if (mounted) {
          await showAlert("Error cargando datos iniciales. Por favor, recarga la página.", "error");
        }
      }
    };
    
    cargarDatos();
    
    return () => {
      mounted = false;
    };
  }, []);

  // Cargar inventarios disponibles
  const cargarInventarios = async () => {
    try {
      const data = await authFetch(`${SERVER_URL}/inventario/inventarios`);
      if (Array.isArray(data) && data.length > 0) {
        setInventarios(data);
      } else {
        // Si no hay inventarios, crear el por defecto
        const inventarioDefault = { id: 1, nombre: "Inventario", alias: "CEDIS" };
        setInventarios([inventarioDefault]);
      }
    } catch (err) {
      console.error("❌ Error cargando inventarios:", err);
      // En caso de error, usar inventario por defecto
      const inventarioDefault = { id: 1, nombre: "Inventario", alias: "CEDIS" };
      setInventarios([inventarioDefault]);
    }
  };

  // Sincronización en tiempo real con Socket.IO
  useEffect(() => {
    if (!socket) return;
    
    const handleAuditoriaCreada = (nuevaAuditoria) => {
      setAuditorias(prev => {
        // Evitar duplicados
        if (prev.find(a => a.id === nuevaAuditoria.id)) {
          return prev;
        }
        return [nuevaAuditoria, ...prev];
      });
    };

    const handleAuditoriasActualizadas = async () => {
      try {
        const data = await authFetch(`${SERVER_URL}/api/auditoria/listar`);
        setAuditorias(data || []);
      } catch (err) {
        console.error("Error cargando auditorías:", err);
      }
    };

    const handleAuditoriaActualizada = async ({ auditoriaId }) => {
      // Usar ref para evitar dependencias que causen re-renderizados infinitos
      const audActual = auditoriaActualRef.current;
      if (audActual && audActual.id === auditoriaId) {
        try {
          setCargandoItems(true);
          const data = await authFetch(`${SERVER_URL}/api/auditoria/${auditoriaId}/items`);
          setItemsEscaneados(data || []);
        } catch (err) {
          console.error("Error recargando items de auditoría:", err);
        } finally {
          setCargandoItems(false);
        }
      }
      // También recargar la lista de auditorías solo si no hay auditoría abierta
      if (!audActual) {
        handleAuditoriasActualizadas();
      }
    };

    const handleItemAgregado = ({ auditoriaId, item }) => {
      // Usar ref para evitar dependencias
      const audActual = auditoriaActualRef.current;
      if (audActual && audActual.id === auditoriaId) {
        setItemsEscaneados(prev => {
          // Evitar duplicados
          if (prev.find(i => i.id === item.id)) {
            return prev.map(i => i.id === item.id ? item : i);
          }
          return [item, ...prev];
        });
      }
    };

    const handleItemEliminado = ({ auditoriaId, itemId }) => {
      // Usar ref para evitar dependencias
      const audActual = auditoriaActualRef.current;
      if (audActual && audActual.id === auditoriaId) {
        setItemsEscaneados(prev => prev.filter(i => i.id !== itemId));
      }
    };

    const handleAuditoriaFinalizada = (auditoriaFinalizada) => {
      setAuditorias(prev => prev.map(a => a.id === auditoriaFinalizada.id ? auditoriaFinalizada : a));
      // Usar ref para evitar dependencias
      const audActual = auditoriaActualRef.current;
      if (audActual && audActual.id === auditoriaFinalizada.id) {
        setAuditoriaActual(auditoriaFinalizada);
      }
    };

    const handleEstadisticasInventarioActualizadas = async () => {
      // Solo actualizar si no hay auditoría abierta o si está cargando
      const audActual = auditoriaActualRef.current;
      if (!audActual || !cargandoItems) {
        try {
          const inventarioId = audActual?.inventario_id;
          const url = inventarioId 
            ? `${SERVER_URL}/api/auditoria/estadisticas-inventario?inventario_id=${inventarioId}`
            : `${SERVER_URL}/api/auditoria/estadisticas-inventario`;
          const data = await authFetch(url);
          setEstadisticasInventario(data || { totalProductos: 0, totalPiezas: 0 });
        } catch (err) {
          console.error("Error cargando estadísticas de inventario:", err);
        }
      }
    };

    socket.on("auditoria_creada", handleAuditoriaCreada);
    socket.on("auditorias_actualizadas", handleAuditoriasActualizadas);
    socket.on("auditoria_actualizada", handleAuditoriaActualizada);
    socket.on("auditoria_item_agregado", handleItemAgregado);
    socket.on("auditoria_item_eliminado", handleItemEliminado);
    socket.on("auditoria_finalizada", handleAuditoriaFinalizada);
    socket.on("auditoria_estadisticas_inventario_actualizadas", handleEstadisticasInventarioActualizadas);
    socket.on("inventario_actualizado", handleEstadisticasInventarioActualizadas);

    return () => {
      socket.off("auditoria_creada", handleAuditoriaCreada);
      socket.off("auditorias_actualizadas", handleAuditoriasActualizadas);
      socket.off("auditoria_actualizada", handleAuditoriaActualizada);
      socket.off("auditoria_item_agregado", handleItemAgregado);
      socket.off("auditoria_item_eliminado", handleItemEliminado);
      socket.off("auditoria_finalizada", handleAuditoriaFinalizada);
      socket.off("auditoria_estadisticas_inventario_actualizadas", handleEstadisticasInventarioActualizadas);
      socket.off("inventario_actualizado", handleEstadisticasInventarioActualizadas);
    };
  }, [socket, authFetch, SERVER_URL]); // Removido auditoriaActual de las dependencias

  const cargarEstadisticasInventario = async () => {
    // Evitar cargar si ya está cargando una auditoría
    if (cargandoAuditoria) return;
    
    try {
      // Usar ref para obtener el valor actual sin causar re-renderizados
      const audActual = auditoriaActualRef.current;
      
      // Si hay una auditoría activa con inventario_id, usar ese inventario
      if (audActual && audActual.inventario_id) {
        const data = await authFetch(`${SERVER_URL}/api/auditoria/estadisticas-inventario?inventario_id=${audActual.inventario_id}`);
        setEstadisticasInventario(data || { totalProductos: 0, totalPiezas: 0 });
      } else {
        // Si no hay auditoría activa, cargar estadísticas generales (inventario por defecto)
        const data = await authFetch(`${SERVER_URL}/api/auditoria/estadisticas-inventario`);
        setEstadisticasInventario(data || { totalProductos: 0, totalPiezas: 0 });
      }
    } catch (err) {
      console.error("Error cargando estadísticas de inventario:", err);
    }
  };

  // Recargar estadísticas cuando cambia la auditoría actual
  useEffect(() => {
    if (auditoriaActual && !cargandoAuditoria) {
      cargarEstadisticasInventario();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditoriaActual?.id]); // Solo cuando cambia el ID, no el objeto completo

  // Auto-focus en el input de código
  useEffect(() => {
    if (auditoriaActual && auditoriaActual.estado === "en_proceso") {
      setTimeout(() => {
        if (codigoInputRef.current && puedeHacerFocus()) {
          safeFocus(codigoInputRef.current, 0);
        }
      }, 200);
    }
  }, [auditoriaActual]);

  const cargarAuditorias = async () => {
    try {
      const data = await authFetch(`${SERVER_URL}/api/auditoria/listar`);
      setAuditorias(data || []);
    } catch (err) {
      console.error("Error cargando auditorías:", err);
      await showAlert(err.message || "Error cargando lista de auditorías", "error");
    }
  };

  const crearNuevaAuditoria = async () => {
    if (!nombreAuditoria.trim()) {
      await showAlert("Debes ingresar un nombre para la auditoría", "warning");
      return;
    }

    if (!inventarioSeleccionado) {
      await showAlert("Debes seleccionar un inventario para la auditoría", "warning");
      return;
    }

    // BARRERA: Verificar que no haya otra auditoría activa
    const auditoriasActivas = auditorias.filter(a => a.estado === "en_proceso");
    if (auditoriasActivas.length > 0) {
      const confirmado = await showConfirm(
        `Ya existe una auditoría en proceso: "${auditoriasActivas[0].nombre}". Solo puede haber una auditoría activa a la vez. ¿Deseas cerrar la auditoría actual y crear una nueva?`,
        "Auditoría Activa Existente"
      );
      
      if (!confirmado) {
        return;
      }
      
      // Cerrar todas las auditorías activas
      for (const aud of auditoriasActivas) {
        try {
          await authFetch(`${SERVER_URL}/api/auditoria/${aud.id}/finalizar`, {
            method: "POST",
          });
        } catch (err) {
          console.error("Error finalizando auditoría activa:", err);
        }
      }
      
      // Recargar auditorías
      await cargarAuditorias();
    }

    try {
      const data = await authFetch(`${SERVER_URL}/api/auditoria/crear`, {
        method: "POST",
        body: JSON.stringify({ 
          nombre: nombreAuditoria.trim(),
          inventario_id: inventarioSeleccionado
        }),
      });

      setAuditoriaActual(data);
      setItemsEscaneados([]);
      setMostrarNuevaAuditoria(false);
      setNombreAuditoria("");
      setInventarioSeleccionado(null);
      await cargarAuditorias();
      await cargarEstadisticasInventario();
      await showAlert("Auditoría creada exitosamente", "success");
    } catch (err) {
      await showAlert(err.message || "Error creando auditoría", "error");
    }
  };

  const abrirAuditoria = async (auditoria) => {
    if (cargandoAuditoria) return; // Evitar múltiples llamadas simultáneas
    
    // Si ya está abierta esta auditoría, no hacer nada
    if (auditoriaActual?.id === auditoria.id && !cargandoItems) {
      return;
    }
    
    setCargandoAuditoria(true);
    setCargandoItems(true);
    
    // Timeout de seguridad (30 segundos)
    let timeoutId;
    try {
      timeoutId = setTimeout(() => {
        setCargandoAuditoria(false);
        setCargandoItems(false);
        showAlert("La carga está tardando demasiado. Por favor, intenta nuevamente.", "warning");
      }, 30000);
      
      // Cargar la auditoría completa para obtener el inventario_id
      const auditoriaCompleta = await authFetch(`${SERVER_URL}/api/auditoria/${auditoria.id}`);
      if (!auditoriaCompleta) {
        throw new Error("No se pudo cargar la información de la auditoría");
      }
      
      // Cargar items de la auditoría
      const data = await authFetch(`${SERVER_URL}/api/auditoria/${auditoria.id}/items`);
      
      // Actualizar estados de una vez para evitar múltiples re-renderizados
      setAuditoriaActual(auditoriaCompleta);
      setItemsEscaneados(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error cargando auditoría:", err);
      await showAlert(err.message || "Error cargando auditoría. Por favor, intenta nuevamente.", "error");
      // Limpiar estado en caso de error
      setAuditoriaActual(null);
      setItemsEscaneados([]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setCargandoAuditoria(false);
      setCargandoItems(false);
    }
  };

  // Función para obtener el nombre del producto al escanear código
  const obtenerNombreProducto = async (codigo) => {
    if (!codigo || !codigo.trim()) {
      setNombreProducto("");
      return;
    }

    if (!auditoriaActual || !auditoriaActual.inventario_id) {
      setNombreProducto("");
      return;
    }

    try {
      // Validar código en el inventario específico de la auditoría
      const validacion = await authFetch(`${SERVER_URL}/inventario/inventarios/${auditoriaActual.inventario_id}/validar-codigo/${codigo.trim()}`);
      
      if (validacion.existe) {
        const producto = await authFetch(`${SERVER_URL}/inventario/inventarios/${auditoriaActual.inventario_id}/producto/${validacion.codigo_principal}`);
        setNombreProducto(producto.nombre || "");
        
        // Pasar foco al primer input de lote automáticamente
        setTimeout(() => {
          const primerLoteInput = document.querySelector(`input[data-lote-index="0"][data-campo="lote"]`);
          if (primerLoteInput) {
            primerLoteInput.focus();
            primerLoteInput.select();
          } else if (primerLoteInputRef.current) {
            safeFocus(primerLoteInputRef.current, 0);
          }
        }, 150);
      } else {
        setNombreProducto("");
      }
    } catch (err) {
      setNombreProducto("");
    }
  };

  const procesarCodigo = async () => {
    if (procesandoRef.current) return;
    
    const codigo = codigoInput.trim();
    if (!codigo) return;

    if (!auditoriaActual) {
      await showAlert("Debes seleccionar o crear una auditoría primero", "warning");
      return;
    }

    if (auditoriaActual.estado !== "en_proceso") {
      await showAlert("Esta auditoría ya está finalizada", "warning");
      return;
    }

    procesandoRef.current = true;

    // BARRERA: Verificar que la auditoría tenga inventario_id
    if (!auditoriaActual.inventario_id) {
      await showAlert("Esta auditoría no tiene un inventario asociado. Por favor, crea una nueva auditoría.", "error");
      procesandoRef.current = false;
      return;
    }

    try {
      // Validar código en el inventario específico de la auditoría
      const validacion = await authFetch(`${SERVER_URL}/inventario/inventarios/${auditoriaActual.inventario_id}/validar-codigo/${codigo}`);
      
      if (!validacion.existe) {
        await showAlert(`Código ${codigo} no existe en el inventario seleccionado`, "warning");
        setCodigoInput("");
        procesandoRef.current = false;
        if (codigoInputRef.current) safeFocus(codigoInputRef.current, 0);
        return;
      }

      const codigoPrincipal = validacion.codigo_principal;
      
      // Obtener información del producto del inventario específico
      const producto = await authFetch(`${SERVER_URL}/inventario/inventarios/${auditoriaActual.inventario_id}/producto/${codigoPrincipal}`);
      
      // Validar que haya al menos un lote con número de lote
      // Validación más permisiva: cualquier lote que tenga algún valor en el campo lote
      const lotesNoVacios = lotesInput.filter(l => {
        if (!l) return false;
        // Verificar si tiene lote (puede ser string, number, etc.)
        const loteValue = l.lote;
        if (loteValue === null || loteValue === undefined) return false;
        // Convertir a string y verificar que no esté vacío después de trim
        const loteStr = String(loteValue).trim();
        return loteStr.length > 0;
      });
      
      console.log("🔍 Debug - lotesInput:", lotesInput);
      console.log("🔍 Debug - lotesNoVacios:", lotesNoVacios);
      console.log("🔍 Debug - lotesNoVacios.length:", lotesNoVacios.length);
      
      if (lotesNoVacios.length === 0) {
        await showAlert("Debes agregar al menos un lote con número de lote. Verifica que los lotes tengan un número ingresado.", "warning");
        procesandoRef.current = false;
        // Pasar foco al primer input de lote
        setTimeout(() => {
          const primerLoteInput = document.querySelector(`input[data-lote-index="0"][data-campo="lote"]`);
          if (primerLoteInput) primerLoteInput.focus();
        }, 100);
        return;
      }

      // Usar los lotes validados (pueden venir del DOM o del estado)
      // Normalizar los lotes para asegurar que tengan todos los campos necesarios
      const lotesValidos = lotesNoVacios.map(l => ({
        lote: (l.lote || "").trim(),
        cantidad: l.cantidad || "",
        caducidad: l.caducidad || "",
        piezasNoAptas: l.piezasNoAptas || ""
      }));

      // Calcular cantidad física total (suma de todas las cantidades de lotes, usando 0 si no hay cantidad)
      const cantidadFisica = lotesValidos.reduce((sum, l) => sum + (parseInt(l.cantidad) || 0), 0);
      
      // Calcular total de piezas no aptas (suma de todas las piezas no aptas de los lotes)
      const piezasNoAptas = lotesValidos.reduce((sum, l) => sum + (parseInt(l.piezasNoAptas) || 0), 0);

      // Obtener cantidad del sistema (suma de lotes activos) del inventario específico
      const lotes = await authFetch(`${SERVER_URL}/inventario/inventarios/${auditoriaActual.inventario_id}/lotes/${codigoPrincipal}/completo`);
      const cantidadSistema = lotes.reduce((sum, l) => sum + (l.cantidad_piezas || 0), 0);

      // Calcular diferencia
      const diferencia = cantidadFisica - cantidadSistema;
      const tipoDiferencia = diferencia > 0 ? "sobrante" : diferencia < 0 ? "faltante" : "coincide";

      // Preparar lotes con formato para guardar (incluyendo piezas no aptas por lote)
      // Normalizar valores: usar valores por defecto si faltan y asegurar que sean válidos
      const lotesParaGuardar = lotesValidos.map(l => {
        // Asegurar que todos los valores sean válidos para JSON
        const lote = String(l.lote || "").trim();
        const cantidad = parseInt(String(l.cantidad || 0)) || 0;
        const caducidad = String(l.caducidad || "").trim();
        const piezasNoAptas = parseInt(String(l.piezasNoAptas || 0)) || 0;
        
        return {
          lote: lote,
          cantidad: cantidad,
          caducidad: caducidad,
          piezasNoAptas: piezasNoAptas
        };
      }).filter(l => l.lote && l.lote.length > 0); // Filtrar lotes sin número

      // Validar que haya al menos un lote después de normalizar
      if (lotesParaGuardar.length === 0) {
        await showAlert("Debes agregar al menos un lote con número de lote válido", "warning");
        procesandoRef.current = false;
        return;
      }

      // Validar que los lotes sean válidos (sin stringificar aún, el body lo hará)
      try {
        // Validar que sea un array válido
        if (!Array.isArray(lotesParaGuardar)) {
          throw new Error("Lotes no es un array válido");
        }
        // Validar que cada lote tenga estructura válida
        lotesParaGuardar.forEach(l => {
          if (typeof l.lote !== 'string') throw new Error("Lote debe ser string");
          if (typeof l.cantidad !== 'number') throw new Error("Cantidad debe ser número");
          if (typeof l.caducidad !== 'string') throw new Error("Caducidad debe ser string");
          if (typeof l.piezasNoAptas !== 'number') throw new Error("PiezasNoAptas debe ser número");
        });
      } catch (jsonErr) {
        console.error("❌ Error validando lotes:", jsonErr);
        console.error("Lotes a convertir:", lotesParaGuardar);
        await showAlert("Error preparando lotes. Por favor, verifica que todos los campos sean válidos.", "error");
        procesandoRef.current = false;
        return;
      }

      // Agregar o actualizar item en la auditoría
      // Enviar lotes como array directamente, el backend lo convertirá a string si es necesario
      const itemData = {
        codigo: codigoPrincipal,
        nombre: producto.nombre,
        lote: lotesParaGuardar[0]?.lote || "", // Lote principal (primer lote) para compatibilidad
        lotes: lotesParaGuardar, // Enviar como array, no como string JSON
        cantidad_sistema: cantidadSistema,
        cantidad_fisica: cantidadFisica,
        piezas_no_aptas: piezasNoAptas,
        lote_piezas_no_aptas: null, // Ya no necesario, cada lote tiene sus propias piezas no aptas
        diferencia: diferencia,
        tipo_diferencia: tipoDiferencia,
      };

      const resultado = await authFetch(`${SERVER_URL}/api/auditoria/${auditoriaActual.id}/agregar-item`, {
        method: "POST",
        body: JSON.stringify(itemData),
      });

      // Actualizar lista local (buscar por código ya que ahora puede haber múltiples lotes)
      const itemExistente = itemsEscaneados.find(i => i.codigo === codigoPrincipal);
      if (itemExistente) {
        setItemsEscaneados(itemsEscaneados.map(i => 
          i.id === itemExistente.id ? resultado : i
        ));
      } else {
        setItemsEscaneados([...itemsEscaneados, resultado]);
      }

      // Limpiar inputs
      setCodigoInput("");
      setNombreProducto("");
      setLotesInput([{ lote: "", cantidad: "", caducidad: "", piezasNoAptas: "" }]);
      
      // Actualizar estadísticas de la auditoría
      await cargarAuditorias();
      const auditoriaActualizada = await authFetch(`${SERVER_URL}/api/auditoria/${auditoriaActual.id}`);
      setAuditoriaActual(auditoriaActualizada);

      // Focus de vuelta al input de código
      setTimeout(() => {
        if (codigoInputRef.current) safeFocus(codigoInputRef.current, 0);
      }, 100);

    } catch (err) {
      await showAlert(err.message || "Error procesando código", "error");
    } finally {
      procesandoRef.current = false;
    }
  };

  // Funciones para manejar múltiples lotes
  const agregarLote = () => {
    setLotesInput([...lotesInput, { lote: "", cantidad: "", caducidad: "", piezasNoAptas: "" }]);
  };

  const eliminarLote = (index) => {
    if (lotesInput.length > 1) {
      setLotesInput(lotesInput.filter((_, i) => i !== index));
    }
  };

  const actualizarLote = (index, campo, valor) => {
    const nuevosLotes = [...lotesInput];
    nuevosLotes[index] = { ...nuevosLotes[index], [campo]: valor };
    setLotesInput(nuevosLotes);
  };

  const handleKeyDown = async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      
      // Navegación entre inputs con Enter
      if (e.target.id === "codigoInput") {
        // Al presionar Enter en código, obtener nombre y pasar foco al primer lote
        await obtenerNombreProducto(codigoInput);
      } else if (e.target.dataset.loteIndex !== undefined) {
        // Si está en un input de lote, pasar al siguiente campo
        const index = parseInt(e.target.dataset.loteIndex);
        const campo = e.target.dataset.campo;
        
        if (campo === "lote") {
          // Lote -> Cantidad
          const cantidadInput = document.querySelector(`input[data-lote-index="${index}"][data-campo="cantidad"]`);
          if (cantidadInput) {
            cantidadInput.focus();
            cantidadInput.select();
          }
        } else if (campo === "cantidad") {
          // Cantidad -> Caducidad
          const caducidadInput = document.querySelector(`input[data-lote-index="${index}"][data-campo="caducidad"]`);
          if (caducidadInput) {
            caducidadInput.focus();
            // Intentar abrir calendario
            try {
              caducidadInput.showPicker && caducidadInput.showPicker();
            } catch (err) {
              // Si showPicker no está disponible, solo focus
            }
          }
        } else if (campo === "caducidad") {
          // Caducidad -> Piezas No Aptas
          const noAptasInput = document.querySelector(`input[data-lote-index="${index}"][data-campo="piezasNoAptas"]`);
          if (noAptasInput) {
            noAptasInput.focus();
            noAptasInput.select();
          }
        } else if (campo === "piezasNoAptas") {
          // Piezas No Aptas -> Agregar el lote automáticamente y preparar para siguiente lote
          // Verificar que el lote actual tenga datos mínimos
          const loteActual = lotesInput[index];
          if (loteActual && loteActual.lote && loteActual.lote.trim()) {
            // Si ya hay más de un lote o este es el primero completo, agregar nuevo lote
            if (index === lotesInput.length - 1) {
              // Es el último lote, agregar uno nuevo y pasar foco
              agregarLote();
              // Esperar un poco para que React renderice el nuevo lote
              setTimeout(() => {
                const nuevoLoteInput = document.querySelector(`input[data-lote-index="${lotesInput.length}"][data-campo="lote"]`);
                if (nuevoLoteInput) {
                  nuevoLoteInput.focus();
                  nuevoLoteInput.select();
                }
              }, 100);
            } else {
              // Hay más lotes, pasar al siguiente
              const siguienteLote = document.querySelector(`input[data-lote-index="${index + 1}"][data-campo="lote"]`);
              if (siguienteLote) {
                siguienteLote.focus();
                siguienteLote.select();
              }
            }
          }
        }
      }
    }
  };

  const finalizarAuditoria = async () => {
    const confirmado = await showConfirm(
      "¿Estás seguro de finalizar esta auditoría? No podrás agregar más productos.",
      "Finalizar Auditoría"
    );
    
    if (!confirmado) return;

    try {
      await authFetch(`${SERVER_URL}/api/auditoria/${auditoriaActual.id}/finalizar`, {
        method: "POST",
      });

      await cargarAuditorias();
      const auditoriaActualizada = await authFetch(`${SERVER_URL}/api/auditoria/${auditoriaActual.id}`);
      setAuditoriaActual(auditoriaActualizada);
      
      await showAlert("Auditoría finalizada exitosamente", "success");
    } catch (err) {
      await showAlert(err.message || "Error finalizando auditoría", "error");
    }
  };

  const eliminarItem = async (itemId) => {
    const confirmado = await showConfirm(
      "¿Estás seguro de eliminar este item de la auditoría?",
      "Eliminar Item"
    );
    
    if (!confirmado) return;

    try {
      await authFetch(`${SERVER_URL}/api/auditoria/item/${itemId}/eliminar`, {
        method: "DELETE",
      });

      setItemsEscaneados(itemsEscaneados.filter(i => i.id !== itemId));
      await cargarAuditorias();
      const auditoriaActualizada = await authFetch(`${SERVER_URL}/api/auditoria/${auditoriaActual.id}`);
      setAuditoriaActual(auditoriaActualizada);
    } catch (err) {
      await showAlert(err.message || "Error eliminando item", "error");
    }
  };

  // Filtrar items según filtros
  const itemsFiltrados = itemsEscaneados.filter(item => {
    // Filtro de diferencias
    if (filtroDiferencias === "diferencias" && item.diferencia === 0) return false;
    if (filtroDiferencias === "coincidencias" && item.diferencia !== 0) return false;
    
    // Filtro de búsqueda
    if (busqueda) {
      const busquedaLower = busqueda.toLowerCase();
      return (
        item.codigo?.toLowerCase().includes(busquedaLower) ||
        item.nombre?.toLowerCase().includes(busquedaLower) ||
        item.lote?.toLowerCase().includes(busquedaLower)
      );
    }
    
    return true;
  });

  // Estadísticas
  const estadisticas = {
    total: itemsEscaneados.length,
    coincidencias: itemsEscaneados.filter(i => i.diferencia === 0).length,
    sobrantes: itemsEscaneados.filter(i => i.diferencia > 0).length, // Cantidad de productos con sobrante
    sobrantesPiezas: itemsEscaneados
      .filter(i => i.diferencia > 0)
      .reduce((sum, i) => sum + i.diferencia, 0), // Total de piezas sobrantes
    faltantes: itemsEscaneados.filter(i => i.diferencia < 0).length, // Cantidad de productos con faltante
    faltantesPiezas: Math.abs(itemsEscaneados
      .filter(i => i.diferencia < 0)
      .reduce((sum, i) => sum + i.diferencia, 0)), // Total de piezas faltantes (valor absoluto)
    piezasNoAptas: itemsEscaneados.reduce((sum, i) => sum + (parseInt(i.piezas_no_aptas) || 0), 0), // Total de piezas no aptas
    diferenciaTotal: itemsEscaneados.reduce((sum, i) => sum + i.diferencia, 0),
  };

  // Exportar a Excel
  const exportarExcel = async () => {
    if (!auditoriaActual || itemsEscaneados.length === 0) {
      await showAlert("No hay datos para exportar", "warning");
      return;
    }

    setExportando(true);
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Auditoría de Inventario");

      // Título
      worksheet.mergeCells("A1:H1");
      worksheet.getCell("A1").value = `AUDITORÍA DE INVENTARIO - ${auditoriaActual.nombre}`;
      worksheet.getCell("A1").font = { size: 16, bold: true };
      worksheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };

      // Información de la auditoría
      worksheet.getCell("A2").value = "Información de la Auditoría";
      worksheet.getCell("A2").font = { bold: true, size: 12 };
      worksheet.addRow(["Usuario:", auditoriaActual.usuario]);
      worksheet.addRow(["Fecha Inicio:", new Date(auditoriaActual.fecha_inicio).toLocaleString()]);
      if (auditoriaActual.fecha_fin) {
        worksheet.addRow(["Fecha Fin:", new Date(auditoriaActual.fecha_fin).toLocaleString()]);
      }
      worksheet.addRow(["Estado:", auditoriaActual.estado === "en_proceso" ? "En Proceso" : "Finalizada"]);
      worksheet.addRow([]);

      // Estadísticas
      const rowInicioStats = worksheet.rowCount + 1;
      worksheet.getCell(`A${rowInicioStats}`).value = "Estadísticas";
      worksheet.getCell(`A${rowInicioStats}`).font = { bold: true, size: 12 };
      worksheet.addRow(["Total Escaneados:", estadisticas.total]);
      worksheet.addRow(["Coincidencias:", estadisticas.coincidencias]);
      worksheet.addRow(["Sobrantes:", estadisticas.sobrantes]);
      worksheet.addRow(["Faltantes:", estadisticas.faltantes]);
      worksheet.addRow(["Diferencia Total:", estadisticas.diferenciaTotal]);
      worksheet.addRow([]);

      // Encabezados de la tabla
      const headerRow = worksheet.addRow([
        "Código",
        "Nombre",
        "Lote",
        "Cantidad Sistema",
        "Cantidad Física",
        "Diferencia",
        "Tipo Diferencia",
        "Observaciones"
      ]);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF3B82F6" }
      };
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.alignment = { horizontal: "center", vertical: "middle" };

      // Datos
      itemsEscaneados.forEach(item => {
        const row = worksheet.addRow([
          item.codigo,
          item.nombre,
          item.lote || "-",
          item.cantidad_sistema,
          item.cantidad_fisica,
          item.piezas_no_aptas || 0,
          item.diferencia,
          item.tipo_diferencia === "sobrante" ? "Sobrante" :
          item.tipo_diferencia === "faltante" ? "Faltante" : "Coincide",
          item.observaciones || "-"
        ]);

        // Colorear filas según diferencia
        if (item.diferencia > 0) {
          row.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFDBEAFE" }
          };
        } else if (item.diferencia < 0) {
          row.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFEE2E2" }
          };
        } else {
          row.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFD1FAE5" }
          };
        }

        // Colorear columna de piezas no aptas
        const noAptasCell = row.getCell(6);
        if (item.piezas_no_aptas > 0) {
          noAptasCell.font = { color: { argb: "FFEF4444" }, bold: true };
        }

        // Colorear columna de diferencia
        const diferenciaCell = row.getCell(7);
        if (item.diferencia > 0) {
          diferenciaCell.font = { color: { argb: "FF3B82F6" }, bold: true };
        } else if (item.diferencia < 0) {
          diferenciaCell.font = { color: { argb: "FFEF4444" }, bold: true };
        } else {
          diferenciaCell.font = { color: { argb: "FF22C55E" }, bold: true };
        }
      });

      // Ajustar ancho de columnas
      worksheet.columns.forEach((column, index) => {
        if (index === 1) { // Nombre
          column.width = 40;
        } else if (index === 7) { // Observaciones
          column.width = 30;
        } else {
          column.width = 18;
        }
      });

      // Generar archivo
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Auditoria_${auditoriaActual.nombre.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);

      await showAlert("Reporte exportado exitosamente", "success");
    } catch (err) {
      console.error("Error exportando a Excel:", err);
      await showAlert("Error al exportar el reporte", "error");
    } finally {
      setExportando(false);
    }
  };

  // Exportar a Word (PDF)
  const exportarPDF = async () => {
    if (!auditoriaActual || itemsEscaneados.length === 0) {
      await showAlert("No hay datos para exportar", "warning");
      return;
    }

    setExportando(true);
    try {
      const children = [];

      // Título
      children.push(
        new Paragraph({
          text: `AUDITORÍA DE INVENTARIO - ${auditoriaActual.nombre}`,
          heading: "Heading1",
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        })
      );

      // Información de la auditoría
      children.push(
        new Paragraph({
          text: "Información de la Auditoría",
          heading: "Heading2",
          spacing: { before: 200, after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Usuario: ", bold: true }),
            new TextRun({ text: auditoriaActual.usuario }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Fecha Inicio: ", bold: true }),
            new TextRun({ text: new Date(auditoriaActual.fecha_inicio).toLocaleString() }),
          ],
        }),
        ...(auditoriaActual.fecha_fin ? [
          new Paragraph({
            children: [
              new TextRun({ text: "Fecha Fin: ", bold: true }),
              new TextRun({ text: new Date(auditoriaActual.fecha_fin).toLocaleString() }),
            ],
          })
        ] : []),
        new Paragraph({
          children: [
            new TextRun({ text: "Estado: ", bold: true }),
            new TextRun({ text: auditoriaActual.estado === "en_proceso" ? "En Proceso" : "Finalizada" }),
          ],
        }),
        new Paragraph({ text: "", spacing: { after: 400 } })
      );

      // Estadísticas
      children.push(
        new Paragraph({
          text: "Estadísticas",
          heading: "Heading2",
          spacing: { before: 200, after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Total Escaneados: ", bold: true }),
            new TextRun({ text: estadisticas.total.toString() }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Coincidencias: ", bold: true }),
            new TextRun({ text: estadisticas.coincidencias.toString() }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Sobrantes: ", bold: true }),
            new TextRun({ text: estadisticas.sobrantes.toString() }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Faltantes: ", bold: true }),
            new TextRun({ text: estadisticas.faltantes.toString() }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Diferencia Total: ", bold: true }),
            new TextRun({ text: estadisticas.diferenciaTotal.toString() }),
          ],
        }),
        new Paragraph({ text: "", spacing: { after: 400 } })
      );

      // Tabla de productos
      children.push(
        new Paragraph({
          text: "Productos Escaneados",
          heading: "Heading2",
          spacing: { before: 200, after: 200 },
        })
      );

      // Crear tabla
      const tableRows = [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph("Código")] }),
            new TableCell({ children: [new Paragraph("Nombre")] }),
            new TableCell({ children: [new Paragraph("Lote")] }),
            new TableCell({ children: [new Paragraph("Sistema")] }),
            new TableCell({ children: [new Paragraph("Físico")] }),
            new TableCell({ children: [new Paragraph("Diferencia")] }),
            new TableCell({ children: [new Paragraph("Estado")] }),
          ],
        }),
        ...itemsEscaneados.map(item => 
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(item.codigo || "-")] }),
              new TableCell({ children: [new Paragraph(item.nombre || "-")] }),
              new TableCell({ children: [new Paragraph(item.lote || "-")] }),
              new TableCell({ children: [new Paragraph(item.cantidad_sistema?.toString() || "0")] }),
              new TableCell({ children: [new Paragraph(item.cantidad_fisica?.toString() || "0")] }),
              new TableCell({ 
                children: [new Paragraph({
                  children: [
                    new TextRun({ 
                      text: (item.piezas_no_aptas || 0).toString(),
                      color: item.piezas_no_aptas > 0 ? "EF4444" : "666666",
                      bold: item.piezas_no_aptas > 0,
                    }),
                  ],
                })],
              }),
              new TableCell({ 
                children: [new Paragraph({
                  children: [
                    new TextRun({ 
                      text: item.diferencia > 0 ? `+${item.diferencia}` : item.diferencia.toString(),
                      color: item.diferencia > 0 ? "3B82F6" : item.diferencia < 0 ? "EF4444" : "22C55E",
                      bold: true,
                    }),
                  ],
                })],
              }),
              new TableCell({ 
                children: [new Paragraph(
                  item.tipo_diferencia === "sobrante" ? "Sobrante" :
                  item.tipo_diferencia === "faltante" ? "Faltante" : "Coincide"
                )],
              }),
            ],
          })
        ),
      ];

      const table = new Table({
        rows: tableRows,
        width: { size: 100, type: WidthType.PERCENTAGE },
      });

      children.push(table);

      // Crear documento
      const doc = new Document({
        sections: [{
          children: children,
        }],
      });

      // Generar y descargar
      const blob = await Packer.toBlob(doc);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Auditoria_${auditoriaActual.nombre.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.docx`;
      link.click();
      window.URL.revokeObjectURL(url);

      await showAlert("Reporte exportado exitosamente", "success");
    } catch (err) {
      console.error("Error exportando a Word:", err);
      await showAlert("Error al exportar el reporte", "error");
    } finally {
      setExportando(false);
    }
  };

  // Función para eliminar auditoría
  const eliminarAuditoria = async () => {
    if (!passwordEliminar.trim()) {
      await showAlert("Debes ingresar tu contraseña de administrador", "warning");
      return;
    }

    if (!auditoriaAEliminar) {
      await showAlert("No se ha seleccionado una auditoría para eliminar", "error");
      return;
    }

    try {
      const data = await authFetch(`${SERVER_URL}/api/auditoria/${auditoriaAEliminar.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordEliminar })
      });

      // Recargar lista de auditorías
      await cargarAuditorias();
      
      // Si la auditoría eliminada era la actual, cerrarla
      if (auditoriaAEliminar.id === auditoriaActual?.id) {
        setAuditoriaActual(null);
        setItemsEscaneados([]);
      }
      
      // Cerrar modal y limpiar
      setShowModalEliminarAuditoria(false);
      setAuditoriaAEliminar(null);
      setPasswordEliminar("");
      
      await showAlert(
        `✅ Auditoría "${auditoriaAEliminar.nombre}" eliminada exitosamente (${data.items_eliminados || 0} items eliminados)`, 
        "success"
      );
    } catch (err) {
      await showAlert(err.message || "Error eliminando auditoría", "error");
      setPasswordEliminar(""); // Limpiar contraseña en caso de error
    }
  };

  return (
    <div className="auditoria-container">
      {/* Modal Nueva Auditoría */}
      {mostrarNuevaAuditoria && (
        <div className="modal-overlay" onClick={() => setMostrarNuevaAuditoria(false)}>
          <div 
            className="modal modal-sm" 
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: window.innerWidth <= 768 ? 'calc(100vw - 20px)' : undefined,
              width: window.innerWidth <= 768 ? 'calc(100vw - 20px)' : undefined
            }}
          >
            <div className="modal-header">
              <h3>Nueva Auditoría</h3>
              <button className="modal-close" onClick={() => setMostrarNuevaAuditoria(false)}>×</button>
            </div>
            <div className="modal-body">
              <label>
                Inventario *
                <select
                  value={inventarioSeleccionado || ""}
                  onChange={(e) => setInventarioSeleccionado(e.target.value ? parseInt(e.target.value) : null)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid var(--borde-medio)",
                    borderRadius: "var(--radio-full)",
                    background: "var(--fondo-input)",
                    color: "var(--texto-principal)",
                    fontSize: "0.9rem",
                    marginBottom: "12px"
                  }}
                  required
                >
                  <option value="">Selecciona un inventario...</option>
                  {inventarios.map(inv => (
                    <option key={inv.id} value={inv.id}>
                      {inv.nombre} {inv.alias ? `(${inv.alias})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Nombre de la Auditoría *
                <input
                  type="text"
                  value={nombreAuditoria}
                  onChange={(e) => setNombreAuditoria(e.target.value)}
                  placeholder="Ej: Auditoría Enero 2025"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      crearNuevaAuditoria();
                    }
                  }}
                />
              </label>
              {inventarioSeleccionado && (
                <div style={{
                  padding: "10px",
                  background: "rgba(59, 130, 246, 0.1)",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                  borderRadius: "8px",
                  marginTop: "10px",
                  fontSize: "0.85rem",
                  color: "var(--texto-principal)"
                }}>
                  ⚠️ <strong>Importante:</strong> Esta auditoría solo trabajará con el inventario seleccionado. 
                  Solo se actualizará ese inventario al finalizar la auditoría.
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setMostrarNuevaAuditoria(false)}>Cancelar</button>
              <button className="btn-primary" onClick={crearNuevaAuditoria}>Crear</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Eliminar Auditoría */}
      {showModalEliminarAuditoria && auditoriaAEliminar && (
        <div className="modal-overlay" onClick={() => {
          setShowModalEliminarAuditoria(false);
          setAuditoriaAEliminar(null);
          setPasswordEliminar("");
        }}>
          <div 
            className="modal modal-sm" 
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: window.innerWidth <= 768 ? 'calc(100vw - 20px)' : undefined,
              width: window.innerWidth <= 768 ? 'calc(100vw - 20px)' : undefined
            }}
          >
            <div className="modal-header">
              <h3>🗑️ Eliminar Auditoría</h3>
              <button className="modal-close" onClick={() => {
                setShowModalEliminarAuditoria(false);
                setAuditoriaAEliminar(null);
                setPasswordEliminar("");
              }}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: "15px", color: "var(--color-warning, #f59e0b)", fontWeight: "600" }}>
                ⚠️ Esta acción no se puede deshacer
              </p>
              <p style={{ marginBottom: "15px" }}>
                Estás a punto de eliminar la auditoría: <strong>{auditoriaAEliminar.nombre}</strong>
              </p>
              <p style={{ marginBottom: "20px", fontSize: "0.9rem", color: "var(--texto-secundario)" }}>
                Todos los items de esta auditoría también serán eliminados permanentemente.
              </p>
              <label>
                Contraseña de Administrador *
                <input
                  type="password"
                  value={passwordEliminar}
                  onChange={(e) => setPasswordEliminar(e.target.value)}
                  placeholder="Ingresa tu contraseña para confirmar"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      eliminarAuditoria();
                    }
                  }}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button onClick={() => {
                setShowModalEliminarAuditoria(false);
                setAuditoriaAEliminar(null);
                setPasswordEliminar("");
              }}>Cancelar</button>
              <button 
                className="btn-primary" 
                onClick={eliminarAuditoria}
                style={{ background: "var(--color-danger, #ef4444)" }}
              >
                Eliminar Auditoría
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="auditoria-card-wrapper">
        <div className="auditoria-header">
          <h2>📊 Auditoría de Inventario</h2>
          <button 
            className="btn-primary"
            onClick={() => setMostrarNuevaAuditoria(true)}
          >
            + Nueva Auditoría
          </button>
        </div>

        {/* Lista de Auditorías */}
        {!auditoriaActual && (
          <div className="auditorias-lista">
            <h3>Auditorías Existentes</h3>
            {auditorias.length === 0 ? (
              <p className="sin-datos">No hay auditorías creadas aún</p>
            ) : (
              <div className="auditorias-grid">
                {auditorias.map(aud => (
                  <div 
                    key={aud.id} 
                    className="auditoria-card"
                  >
                    <div 
                      onClick={() => abrirAuditoria(aud)}
                      style={{ cursor: "pointer" }}
                    >
                      <div className="auditoria-card-header">
                        <h4>{aud.nombre}</h4>
                        <span className={`auditoria-estado ${aud.estado}`}>
                          {aud.estado === "en_proceso" ? "🟢 En Proceso" : "✅ Finalizada"}
                        </span>
                      </div>
                      <div className="auditoria-card-info">
                        <p><strong>Usuario:</strong> {aud.usuario}</p>
                        <p><strong>Fecha:</strong> {new Date(aud.fecha_inicio).toLocaleDateString()}</p>
                        <p><strong>Productos:</strong> {aud.productos_escaneados} / {aud.total_productos}</p>
                        {aud.diferencias_encontradas > 0 && (
                          <p className="diferencias-badge">
                            ⚠️ {aud.diferencias_encontradas} diferencia(s)
                          </p>
                        )}
                      </div>
                    </div>
                    <div style={{ marginTop: "10px", display: "flex", justifyContent: "flex-end" }}>
                      <button
                        className="btn btn-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAuditoriaAEliminar(aud);
                          setShowModalEliminarAuditoria(true);
                        }}
                        style={{ fontSize: "0.85rem", padding: "6px 12px" }}
                      >
                        🗑️ Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Vista de Auditoría Activa */}
        {cargandoAuditoria ? (
          <div style={{ 
            textAlign: "center", 
            padding: "60px 20px", 
            color: "var(--texto-principal)",
            fontSize: "1.1rem"
          }}>
            <div style={{ marginBottom: "15px", fontSize: "1.2rem" }}>⏳ Cargando auditoría...</div>
            <div style={{ fontSize: "0.9rem", color: "var(--texto-secundario)", opacity: 0.8 }}>
              Por favor espera mientras se cargan los datos
            </div>
          </div>
        ) : auditoriaActual && (
        <div className="auditoria-activa">
          <div className="auditoria-activa-header">
            <div>
              <h3>{auditoriaActual.nombre}</h3>
              <p className="auditoria-meta">
                {auditoriaActual.estado === "en_proceso" ? "🟢 En Proceso" : "✅ Finalizada"} • 
                Creada por: {auditoriaActual.usuario} • 
                Fecha: {new Date(auditoriaActual.fecha_inicio).toLocaleString()}
                {auditoriaActual.inventario_id && (
                  <>
                    {" • "}
                    <strong>Inventario:</strong> {
                      inventarios.find(inv => inv.id === auditoriaActual.inventario_id)?.nombre || 
                      `ID: ${auditoriaActual.inventario_id}`
                    }
                  </>
                )}
              </p>
              {auditoriaActual.inventario_id && (
                <div style={{
                  marginTop: "8px",
                  padding: "8px 12px",
                  background: "rgba(59, 130, 246, 0.1)",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                  borderRadius: "6px",
                  fontSize: "0.85rem",
                  color: "var(--texto-principal)"
                }}>
                  🔒 Esta auditoría está vinculada a un inventario específico. Solo se trabajará con productos de ese inventario.
                </div>
              )}
            </div>
            <div className="auditoria-actions">
              <div className="auditoria-actions-group">
                <button 
                  className="btn btn-export" 
                  onClick={exportarExcel}
                  disabled={exportando || itemsEscaneados.length === 0}
                >
                  {exportando ? "⏳ Exportando..." : "📊 Excel"}
                </button>
                <button 
                  className="btn btn-export" 
                  onClick={exportarPDF}
                  disabled={exportando || itemsEscaneados.length === 0}
                >
                  {exportando ? "⏳ Exportando..." : "📄 Word"}
                </button>
              </div>
              <div className="auditoria-actions-group">
                {auditoriaActual.estado === "en_proceso" && (
                  <button className="btn-primary" onClick={finalizarAuditoria}>
                    Finalizar Auditoría
                  </button>
                )}
                <button className="btn" onClick={() => {
                  setAuditoriaActual(null);
                  setItemsEscaneados([]);
                }}>
                  Volver
                </button>
              </div>
            </div>
          </div>

          {/* Estadísticas del Inventario */}
          <div className="auditoria-stats" style={{ marginBottom: "20px", borderBottom: "2px solid var(--borde-sutil)", paddingBottom: "20px" }}>
            <div className="stat-card" style={{ background: "linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.05))", border: "1px solid rgba(59, 130, 246, 0.3)" }}>
              <div className="stat-value" style={{ color: "var(--azul-primario)", fontSize: "1.8rem" }}>
                {estadisticasInventario.totalProductos.toLocaleString()}
              </div>
              <div className="stat-label">Total Productos Registrados</div>
            </div>
            <div className="stat-card" style={{ background: "linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.05))", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
              <div className="stat-value" style={{ color: "#10b981", fontSize: "1.8rem" }}>
                {estadisticasInventario.totalPiezas.toLocaleString()}
              </div>
              <div className="stat-label">Total Piezas en Inventario</div>
            </div>
          </div>

          {/* Estadísticas de la Auditoría */}
          <div className="auditoria-stats">
            <div className="stat-card">
              <div className="stat-value">{estadisticas.total}</div>
              <div className="stat-label">
                {puedeVerTodo ? "Total Escaneados" : "Mis Escaneados"}
              </div>
            </div>
            <div className="stat-card stat-coincide">
              <div className="stat-value">{estadisticas.coincidencias}</div>
              <div className="stat-label">Coinciden</div>
            </div>
            <div className="stat-card stat-sobrante">
              <div className="stat-value">{estadisticas.sobrantesPiezas}</div>
              <div className="stat-label">Piezas Sobrantes</div>
            </div>
            <div className="stat-card stat-faltante">
              <div className="stat-value">{estadisticas.faltantesPiezas}</div>
              <div className="stat-label">Piezas Faltantes</div>
            </div>
            <div className="stat-card stat-no-aptas">
              <div className="stat-value">{estadisticas.piezasNoAptas}</div>
              <div className="stat-label">Piezas No Aptas</div>
            </div>
            <div className="stat-card stat-diferencia">
              <div className="stat-value">{estadisticas.diferenciaTotal > 0 ? "+" : ""}{estadisticas.diferenciaTotal}</div>
              <div className="stat-label">Diferencia Total</div>
            </div>
          </div>
          
          {/* Indicador de vista */}
          {!puedeVerTodo && (
            <div style={{ 
              padding: "12px", 
              background: "rgba(59, 130, 246, 0.1)", 
              border: "1px solid rgba(59, 130, 246, 0.3)", 
              borderRadius: "8px", 
              marginBottom: "16px",
              textAlign: "center",
              fontSize: "0.9rem",
              color: "var(--texto-principal)"
            }}>
              👤 Estás viendo solo tus escaneos. Los administradores pueden ver todos los escaneos.
            </div>
          )}

          {/* Formulario de Escaneo */}
          {auditoriaActual.estado === "en_proceso" && (
            <div className="auditoria-escaneo">
              <h4>Escanear Producto</h4>
              <div className="escaneo-inputs">
                <div className="input-group">
                  <label>Código</label>
                  <input
                    id="codigoInput"
                    ref={codigoInputRef}
                    type="text"
                    value={codigoInput}
                    onChange={(e) => {
                      setCodigoInput(e.target.value);
                      obtenerNombreProducto(e.target.value);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Escanear o escribir código..."
                    autoFocus
                  />
                </div>
                <div className="input-group">
                  <label>Nombre del Producto</label>
                  <input
                    type="text"
                    value={nombreProducto}
                    readOnly
                    placeholder="Aparecerá automáticamente al escanear código..."
                    style={{ 
                      padding: "10px", 
                      borderRadius: "6px", 
                      border: "1px solid #ddd",
                      background: "#f9fafb",
                      color: "#666",
                      cursor: "not-allowed"
                    }}
                  />
                </div>
                {/* Múltiples lotes */}
                <div className="input-group" style={{ gridColumn: "1 / -1" }}>
                  <label>Lotes * (Obligatorio - Agregar cantidad y caducidad para cada lote)</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {lotesInput.map((loteItem, index) => (
                      <div key={index} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto", gap: "8px", alignItems: "center" }}>
                        <input
                          ref={index === 0 ? primerLoteInputRef : null}
                          type="text"
                          value={loteItem.lote}
                          onChange={(e) => actualizarLote(index, "lote", e.target.value)}
                          onKeyDown={handleKeyDown}
                          data-lote-index={index}
                          data-campo="lote"
                          placeholder="Lote *"
                          required
                          style={{ padding: "10px", borderRadius: "6px", border: "1px solid #ddd" }}
                        />
                        <input
                          type="number"
                          value={loteItem.cantidad}
                          onChange={(e) => actualizarLote(index, "cantidad", e.target.value)}
                          onKeyDown={handleKeyDown}
                          data-lote-index={index}
                          data-campo="cantidad"
                          placeholder="Cantidad *"
                          min="1"
                          required
                          style={{ padding: "10px", borderRadius: "6px", border: "1px solid #ddd" }}
                        />
                        <input
                          type="date"
                          value={loteItem.caducidad}
                          onChange={(e) => {
                            actualizarLote(index, "caducidad", e.target.value);
                            // Cuando se selecciona fecha, pasar automáticamente a no aptas
                            if (e.target.value) {
                              setTimeout(() => {
                                const noAptasInput = document.querySelector(`input[data-lote-index="${index}"][data-campo="piezasNoAptas"]`);
                                if (noAptasInput) {
                                  noAptasInput.focus();
                                  noAptasInput.select();
                                }
                              }, 100);
                            }
                          }}
                          onKeyDown={handleKeyDown}
                          data-lote-index={index}
                          data-campo="caducidad"
                          placeholder="Caducidad *"
                          required
                          style={{ padding: "10px", borderRadius: "6px", border: "1px solid #ddd" }}
                        />
                        <input
                          type="number"
                          value={loteItem.piezasNoAptas}
                          onChange={(e) => actualizarLote(index, "piezasNoAptas", e.target.value)}
                          onKeyDown={handleKeyDown}
                          data-lote-index={index}
                          data-campo="piezasNoAptas"
                          placeholder="No Aptas"
                          min="0"
                          style={{ padding: "10px", borderRadius: "6px", border: "1px solid #ddd" }}
                          title="Piezas no aptas que se descontarán de este lote"
                        />
                        {lotesInput.length > 1 && (
                          <button
                            type="button"
                            onClick={() => eliminarLote(index)}
                            style={{
                              padding: "10px",
                              background: "#ef4444",
                              color: "white",
                              border: "none",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontSize: "18px"
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={agregarLote}
                      style={{
                        padding: "8px",
                        background: "#10b981",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        alignSelf: "flex-start"
                      }}
                    >
                      + Agregar otro lote
                    </button>
                  </div>
                </div>
                <button className="btn-primary btn-escaneo" onClick={procesarCodigo}>
                  Agregar
                </button>
              </div>
            </div>
          )}

          {/* Filtros y Búsqueda */}
          <div className="auditoria-filtros">
            <div className="filtros-group">
              <label>Filtrar:</label>
              <select value={filtroDiferencias} onChange={(e) => setFiltroDiferencias(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="diferencias">Solo Diferencias</option>
                <option value="coincidencias">Solo Coincidencias</option>
              </select>
            </div>
            <div className="busqueda-group">
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="🔍 Buscar por código, nombre o lote..."
              />
            </div>
          </div>

          {/* Lista de Items */}
          <div className="auditoria-items">
            <h4>
              {puedeVerTodo ? "Productos Escaneados" : "Mis Productos Escaneados"} ({itemsFiltrados.length})
            </h4>
            {cargandoItems ? (
              <div style={{ 
                textAlign: "center", 
                padding: "40px", 
                color: "var(--texto-secundario)",
                fontSize: "1rem"
              }}>
                <div style={{ marginBottom: "10px" }}>⏳ Cargando items de auditoría...</div>
                <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>
                  Total de registros: {itemsEscaneados.length}
                </div>
              </div>
            ) : itemsFiltrados.length === 0 ? (
              <p className="sin-datos">No hay productos escaneados aún</p>
            ) : (
              <div className="items-table">
                <table>
                  <colgroup>
                    <col className="col-codigo" />
                    <col className="col-nombre" />
                    <col className="col-lote" />
                    <col className="col-cant-lote" />
                    <col className="col-sistema" />
                    <col className="col-fisico" />
                    <col className="col-no-aptas" />
                    <col className="col-diferencia" />
                    <col className="col-estado" />
                    {puedeVerTodo && <col className="col-usuario" />}
                    {auditoriaActual.estado === "en_proceso" && <col className="col-acciones" />}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="col-codigo">Código</th>
                      <th className="col-nombre">Nombre</th>
                      <th className="col-lote">Lote / Caducidad</th>
                      <th className="col-cant-lote">Cant. Lote</th>
                      <th className="col-sistema">Sistema</th>
                      <th className="col-fisico">Físico</th>
                      <th className="col-no-aptas">No Aptas</th>
                      <th className="col-diferencia">Diferencia</th>
                      <th className="col-estado">Estado</th>
                      {puedeVerTodo && <th className="col-usuario">Usuario</th>}
                      {auditoriaActual.estado === "en_proceso" && <th className="col-acciones">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {itemsFiltrados.map(item => {
                      // Intentar parsear lotes del JSON
                      let lotesMostrar = [];
                      if (item.lotes) {
                        try {
                          lotesMostrar = typeof item.lotes === 'string' ? JSON.parse(item.lotes) : item.lotes;
                        } catch (e) {
                          // Si falla, usar lote único
                          if (item.lote) {
                            lotesMostrar = [{ lote: item.lote, cantidad: item.cantidad_fisica || 0, caducidad: "" }];
                          }
                        }
                      } else if (item.lote) {
                        lotesMostrar = [{ lote: item.lote, cantidad: item.cantidad_fisica || 0, caducidad: "" }];
                      }

                      return (
                        <React.Fragment key={item.id}>
                          {lotesMostrar.map((loteItem, loteIndex) => (
                            <tr key={`${item.id}-${loteIndex}`} className={item.diferencia !== 0 ? "con-diferencia" : ""}>
                              {loteIndex === 0 && (
                                <>
                                  <td className="col-codigo" rowSpan={lotesMostrar.length}>{item.codigo}</td>
                                  <td className="col-nombre" rowSpan={lotesMostrar.length}>{item.nombre}</td>
                                </>
                              )}
                              <td className="col-lote">
                                {loteItem.lote}
                                {loteItem.caducidad && (
                                  <div style={{ fontSize: "0.8rem", color: "#666", marginTop: "2px" }}>
                                    Cad: {new Date(loteItem.caducidad).toLocaleDateString()}
                                  </div>
                                )}
                              </td>
                              <td className="col-cant-lote center">{loteItem.cantidad || 0} pz</td>
                              {loteIndex === 0 && (
                                <>
                                  <td className="col-sistema center" rowSpan={lotesMostrar.length}>{item.cantidad_sistema}</td>
                                  <td className="col-fisico center" rowSpan={lotesMostrar.length}>{item.cantidad_fisica}</td>
                                  <td className="col-no-aptas center" rowSpan={lotesMostrar.length} style={{ color: item.piezas_no_aptas > 0 ? "#ef4444" : "var(--texto-secundario)", fontWeight: item.piezas_no_aptas > 0 ? 600 : 400 }}>
                                    {item.piezas_no_aptas || 0}
                                  </td>
                                  <td className={`col-diferencia center ${item.diferencia > 0 ? "sobrante" : item.diferencia < 0 ? "faltante" : "coincide"}`} rowSpan={lotesMostrar.length}>
                                    {item.diferencia > 0 ? "+" : ""}{item.diferencia}
                                  </td>
                                  <td className="col-estado center" rowSpan={lotesMostrar.length}>
                                    <span className={`badge-${item.tipo_diferencia}`}>
                                      {item.tipo_diferencia === "sobrante" ? "📈 Sobrante" :
                                       item.tipo_diferencia === "faltante" ? "📉 Faltante" :
                                       "✅ Coincide"}
                                    </span>
                                  </td>
                                  {puedeVerTodo && (
                                    <td className="col-usuario" rowSpan={lotesMostrar.length} style={{ fontSize: "0.85rem", color: "var(--texto-secundario)" }}>
                                      {item.usuario || "-"}
                                    </td>
                                  )}
                                  {auditoriaActual.estado === "en_proceso" && (
                                    <td className="col-acciones center" rowSpan={lotesMostrar.length}>
                                      <button 
                                        className="btn-danger btn-sm"
                                        onClick={() => eliminarItem(item.id)}
                                      >
                                        Eliminar
                                      </button>
                                    </td>
                                  )}
                                </>
                              )}
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

