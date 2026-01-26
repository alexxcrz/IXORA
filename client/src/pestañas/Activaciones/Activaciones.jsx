import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import "./Activaciones.css";
import { useAuth } from "../../AuthContext";
import { useAlert } from "../../components/AlertModal";

const AREAS = [
  "APP",
  "E-Commerce",
  "Eventos",
  "Guías Manuales",
  "Influencers",
  "Mayoreo/Telemarketing",
  "MX",
  "Sonata",
  "Suscripciones",
  "Venta Directa"
];

const OPCIONES_ACTIVACION = ["Pendiente", "Agotado", "No Aplica"];

const OPCIONES_ESTATUS = [
  { value: "Pendiente", color: "#f59e0b" },
  { value: "Parcializado", color: "#f97316" },
  { value: "Cerrado", color: "#22c55e" },
  { value: "No Aplica", color: "#ef4444" }
];

export default function Activaciones({ SERVER_URL, socket }) {
  const { authFetch, user } = useAuth();
  const { showAlert, showConfirm } = useAlert();

  // Estados principales
  const [registros, setRegistros] = useState([]);
  const [inventario, setInventario] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");

  // Modal de nuevo registro
  const [modalAbierto, setModalAbierto] = useState(false);
  const [pasoModal, setPasoModal] = useState(1);
  const [pedidoNuevo, setPedidoNuevo] = useState("");
  const [fechaPedidoNuevo, setFechaPedidoNuevo] = useState("");
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [productosSeleccionados, setProductosSeleccionados] = useState([]);
  const [areaNueva, setAreaNueva] = useState("APP");
  const [corroborandoNuevo, setCorroborandoNuevo] = useState(false);
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
  const [buscandoProducto, setBuscandoProducto] = useState(false);

  const busquedaTimeoutRef = useRef(null);

  // Cargar inventario para búsqueda
  useEffect(() => {
    const cargarInventario = async () => {
      try {
        const data = await authFetch(`${SERVER_URL}/inventario`);
        setInventario(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Error cargando inventario:", err);
      }
    };
    cargarInventario();
  }, [SERVER_URL, authFetch]);

  // Cargar registros de activaciones
  const cargarRegistros = useCallback(async () => {
    try {
      setCargando(true);
      const data = await authFetch(`${SERVER_URL}/activaciones`);
      setRegistros(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error cargando activaciones:", err);
      setRegistros([]);
    } finally {
      setCargando(false);
    }
  }, [SERVER_URL, authFetch]);

  useEffect(() => {
    cargarRegistros();
  }, [cargarRegistros]);

  // Socket para tiempo real
  useEffect(() => {
    if (!socket) return;

    const handleActualizacion = () => {
      cargarRegistros();
    };

    socket.on("activaciones_actualizadas", handleActualizacion);

    return () => {
      socket.off("activaciones_actualizadas", handleActualizacion);
    };
  }, [socket, SERVER_URL, cargarRegistros]);

  // Búsqueda de productos con debounce
  useEffect(() => {
    if (!busquedaProducto.trim()) {
      setResultadosBusqueda([]);
      return;
    }

    if (busquedaTimeoutRef.current) {
      clearTimeout(busquedaTimeoutRef.current);
    }

    setBuscandoProducto(true);
    busquedaTimeoutRef.current = setTimeout(() => {
      const termino = busquedaProducto.toLowerCase().trim();
      const resultados = inventario
        .filter(p => 
          p.nombre?.toLowerCase().includes(termino) ||
          p.codigo?.toLowerCase().includes(termino)
        )
        .slice(0, 10);
      setResultadosBusqueda(resultados);
      setBuscandoProducto(false);
    }, 300);

    return () => {
      if (busquedaTimeoutRef.current) {
        clearTimeout(busquedaTimeoutRef.current);
      }
    };
  }, [busquedaProducto, inventario]);

  // Agregar producto a la lista de seleccionados
  const agregarProducto = (producto) => {
    if (productosSeleccionados.find(p => p.codigo === producto.codigo)) {
      showAlert("Este producto ya está en la lista", "warning");
      return;
    }
    setProductosSeleccionados([...productosSeleccionados, {
      codigo: producto.codigo,
      nombre: producto.nombre,
      presentacion: producto.presentacion || "",
      piezas: 1
    }]);
    setBusquedaProducto("");
    setResultadosBusqueda([]);
  };

  // Quitar producto de la lista
  const quitarProducto = (codigo) => {
    setProductosSeleccionados(productosSeleccionados.filter(p => p.codigo !== codigo));
  };

  // Actualizar piezas de un producto seleccionado
  const actualizarPiezasSeleccionado = (codigo, piezas) => {
    setProductosSeleccionados(productosSeleccionados.map(p => 
      p.codigo === codigo ? { ...p, piezas: parseInt(piezas) || 1 } : p
    ));
  };

  // Limpiar modal
  const limpiarModal = () => {
    setPasoModal(1);
    setPedidoNuevo("");
    setFechaPedidoNuevo("");
    setBusquedaProducto("");
    setProductosSeleccionados([]);
    setAreaNueva("APP");
    setCorroborandoNuevo(false);
    setResultadosBusqueda([]);
  };

  // Cerrar modal
  const cerrarModal = () => {
    setModalAbierto(false);
    limpiarModal();
  };

  // Guardar registros
  const guardarRegistros = async () => {
    if (!pedidoNuevo.trim()) {
      showAlert("Ingresa el número de pedido", "warning");
      return;
    }
    if (!fechaPedidoNuevo) {
      showAlert("Selecciona la fecha del pedido", "warning");
      return;
    }
    if (productosSeleccionados.length === 0) {
      showAlert("Agrega al menos un producto", "warning");
      return;
    }

    try {
      const registrosNuevos = productosSeleccionados.map(producto => ({
        pedido: pedidoNuevo.trim(),
        fecha_pedido: fechaPedidoNuevo,
        codigo_producto: producto.codigo,
        producto: producto.nombre,
        presentacion: producto.presentacion,
        piezas: producto.piezas,
        area: areaNueva,
        corroborando: corroborandoNuevo ? 1 : 0,
        activacion: 0,
        estado_activacion: "Pendiente",
        estatus: "Pendiente",
        usuario: (user?.name || user?.nombre || "Sistema")
      }));

      await authFetch(`${SERVER_URL}/activaciones`, {
        method: "POST",
        body: JSON.stringify({ registros: registrosNuevos })
      });

      showAlert("Registros guardados correctamente", "success");
      cerrarModal();
      cargarRegistros();
    } catch (err) {
      console.error("Error guardando registros:", err);
      showAlert("Error al guardar los registros", "error");
    }
  };

  // Actualizar un campo de un registro
  const actualizarRegistro = async (id, campo, valor) => {
    try {
      // Actualizar localmente primero (optimistic update)
      setRegistros(prev => prev.map(r => 
        r.id === id ? { ...r, [campo]: valor } : r
      ));

      // Si se activa, agregar hora de activación
      let datos = { [campo]: valor };
      if (campo === "activacion" && valor === 1) {
        const ahora = new Date();
        const horaActivacion = ahora.toTimeString().split(" ")[0];
        datos.hora_activacion = horaActivacion;
        setRegistros(prev => prev.map(r => 
          r.id === id ? { ...r, hora_activacion: horaActivacion } : r
        ));
      }

      await authFetch(`${SERVER_URL}/activaciones/${id}`, {
        method: "PUT",
        body: JSON.stringify(datos)
      });
    } catch (err) {
      console.error("Error actualizando registro:", err);
      // Revertir cambio local
      cargarRegistros();
      showAlert("Error al actualizar el registro", "error");
    }
  };

  // Cerrar día de activaciones
  const cerrarDia = async () => {
    const confirmado = await showConfirm(
      "¿Cerrar el día de activaciones? Solo se guardarán los productos activados, agotados o marcados como 'No Aplica'. Los pendientes permanecerán en la tabla.",
      "Confirmar cierre"
    );
    if (!confirmado) return;

    try {
      await authFetch(`${SERVER_URL}/activaciones/cerrar-dia`, {
        method: "POST"
      });
      showAlert("Día cerrado correctamente", "success");
      cargarRegistros();
    } catch (err) {
      console.error("Error cerrando día:", err);
      showAlert("Error al cerrar el día", "error");
    }
  };

  // Eliminar registro
  const eliminarRegistro = async (id) => {
    const confirmado = await showConfirm(
      "¿Estás seguro de eliminar este registro? Esta acción no se puede deshacer.",
      "Confirmar eliminación"
    );
    if (!confirmado) return;

    try {
      await authFetch(`${SERVER_URL}/activaciones/${id}`, {
        method: "DELETE"
      });
      showAlert("Registro eliminado correctamente", "success");
      cargarRegistros();
    } catch (err) {
      console.error("Error eliminando registro:", err);
      showAlert("Error al eliminar el registro", "error");
    }
  };


  // Formatear fecha
  const formatearFecha = (fecha) => {
    if (!fecha) return "-";
    try {
      return fecha.split("-").reverse().join("/");
    } catch {
      return fecha;
    }
  };

  // Filtrar registros
  const registrosFiltrados = useMemo(() => {
    if (!busqueda.trim()) return registros;
    const termino = busqueda.toLowerCase();
    return registros.filter(r =>
      r.pedido?.toLowerCase().includes(termino) ||
      r.producto?.toLowerCase().includes(termino) ||
      r.area?.toLowerCase().includes(termino) ||
      r.usuario?.toLowerCase().includes(termino)
    );
  }, [registros, busqueda]);

  // Obtener color de estatus
  const getEstatusColor = (estatus) => {
    const opcion = OPCIONES_ESTATUS.find(o => o.value === estatus);
    return opcion?.color || "#6b7280";
  };

  return (
    <div className="activaciones-container">
      <div className="activaciones-header">
        <h2>Activaciones</h2>
        <div className="activaciones-acciones">
          <button 
            className="btn-agregar-activacion"
            onClick={() => setModalAbierto(true)}
            title="Agregar nuevo registro"
          >
            ➕ Nuevo
          </button>
          <button 
            className="btn-cerrar-dia-activacion"
            onClick={cerrarDia}
            title="Cerrar día"
          >
            🔒 Cerrar Día
          </button>
        </div>
      </div>

      <div className="activaciones-buscador">
        <input
          type="text"
          placeholder="🔍 Buscar por pedido, producto, área o nombre..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="input-busqueda-activaciones"
        />
      </div>

      {cargando ? (
        <div className="activaciones-cargando">
          <span>Cargando...</span>
        </div>
      ) : registrosFiltrados.length === 0 ? null : (
        <div className="activaciones-tabla-container">
          <table className="activaciones-tabla">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Fecha</th>
                <th>Pedido</th>
                <th>Fecha Pedido</th>
                <th>Producto</th>
                <th>Piezas</th>
                <th>Área</th>
                <th>Verificando</th>
                <th>Activación</th>
                <th>Fecha Activación</th>
                <th>Estatus</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {registrosFiltrados.map((registro) => (
                <tr key={registro.id}>
                  <td className="col-usuario">{registro.usuario || "-"}</td>
                  <td className="col-fecha-hora">
                    <div className="fecha-hora-combinada">
                      <span className="fecha-texto">{formatearFecha(registro.fecha)}</span>
                      <span className="hora-texto">{registro.hora_solicitud || "-"}</span>
                    </div>
                  </td>
                  <td className="col-pedido">{registro.pedido}</td>
                  <td className="col-fecha-pedido">{formatearFecha(registro.fecha_pedido)}</td>
                  <td className="col-producto">
                    <div className="producto-info">
                      <span className="producto-nombre">{registro.producto}</span>
                      {registro.presentacion && (
                        <span className="producto-presentacion">{registro.presentacion}</span>
                      )}
                    </div>
                  </td>
                  <td className="col-piezas">
                    <input
                      type="number"
                      min="1"
                      defaultValue={registro.piezas || 1}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const valor = parseInt(e.target.value) || 1;
                          actualizarRegistro(registro.id, "piezas", valor);
                          e.target.blur();
                        }
                      }}
                      onBlur={(e) => {
                        const valor = parseInt(e.target.value) || 1;
                        actualizarRegistro(registro.id, "piezas", valor);
                      }}
                      className="input-piezas"
                    />
                  </td>
                  <td className="col-area">
                    <select
                      value={registro.area || "APP"}
                      onChange={(e) => actualizarRegistro(registro.id, "area", e.target.value)}
                      className="select-area"
                    >
                      {AREAS.map(area => (
                        <option key={area} value={area}>{area}</option>
                      ))}
                    </select>
                  </td>
                  <td className="col-verificando">
                    <label className="switch-mini">
                      <input
                        type="checkbox"
                        checked={registro.corroborando === 1}
                        onChange={(e) => actualizarRegistro(registro.id, "corroborando", e.target.checked ? 1 : 0)}
                      />
                      <span className="slider-mini"></span>
                    </label>
                  </td>
                  <td className="col-activacion">
                    <div className="activacion-control">
                      <label className="switch-mini">
                        <input
                          type="checkbox"
                          checked={registro.activacion === 1}
                          onChange={(e) => actualizarRegistro(registro.id, "activacion", e.target.checked ? 1 : 0)}
                        />
                        <span className="slider-mini"></span>
                      </label>
                      <select
                        value={registro.estado_activacion || "Pendiente"}
                        onChange={(e) => actualizarRegistro(registro.id, "estado_activacion", e.target.value)}
                        className="select-activacion-estado"
                      >
                        {OPCIONES_ACTIVACION.map(op => (
                          <option key={op} value={op}>{op}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="col-hora-activacion">
                    {registro.hora_activacion ? (
                      <div className="fecha-hora-combinada">
                        <span className="fecha-texto">{formatearFecha(registro.fecha)}</span>
                        <span className="hora-texto">{registro.hora_activacion}</span>
                      </div>
                    ) : "-"}
                  </td>
                  <td className="col-estatus">
                    <select
                      value={registro.estatus || "Pendiente"}
                      onChange={(e) => actualizarRegistro(registro.id, "estatus", e.target.value)}
                      className="select-estatus"
                      style={{ 
                        backgroundColor: getEstatusColor(registro.estatus),
                        color: "#fff"
                      }}
                    >
                      {OPCIONES_ESTATUS.map(op => (
                        <option 
                          key={op.value} 
                          value={op.value}
                          style={{ backgroundColor: op.color, color: "#fff" }}
                        >
                          {op.value}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="col-acciones">
                    <button
                      className="btn-eliminar-registro"
                      onClick={() => eliminarRegistro(registro.id)}
                      title="Eliminar registro"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de nuevo registro */}
      {modalAbierto && (
        <div className="modal-overlay-activaciones" onClick={cerrarModal}>
          <div className="modal-activaciones" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-activaciones">
              <h3>
                {pasoModal === 1 && "Nuevo Registro - Datos del Pedido"}
                {pasoModal === 2 && "Nuevo Registro - Seleccionar Productos"}
                {pasoModal === 3 && "Nuevo Registro - Área y Corroboración"}
              </h3>
              <button className="btn-cerrar-modal" onClick={cerrarModal}>×</button>
            </div>

            <div className="modal-body-activaciones">
              {/* Paso 1: Pedido y fecha */}
              {pasoModal === 1 && (
                <div className="paso-modal">
                  <div className="campo-modal">
                    <label>Número de Pedido</label>
                    <input
                      type="text"
                      placeholder="Ej: 12345"
                      value={pedidoNuevo}
                      onChange={(e) => setPedidoNuevo(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="campo-modal">
                    <label>Fecha del Pedido</label>
                    <input
                      type="date"
                      value={fechaPedidoNuevo}
                      onChange={(e) => setFechaPedidoNuevo(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Paso 2: Búsqueda de productos */}
              {pasoModal === 2 && (
                <div className="paso-modal">
                  <div className="campo-modal">
                    <label>Buscar Producto por Nombre</label>
                    <input
                      type="text"
                      placeholder="🔍 Escribe el nombre del producto..."
                      value={busquedaProducto}
                      onChange={(e) => setBusquedaProducto(e.target.value)}
                      autoFocus
                    />
                    {buscandoProducto && <span className="buscando">Buscando...</span>}
                    
                    {resultadosBusqueda.length > 0 && (
                      <div className="resultados-busqueda">
                        {resultadosBusqueda.map(producto => (
                          <div 
                            key={producto.codigo}
                            className="resultado-item"
                            onClick={() => agregarProducto(producto)}
                          >
                            <span className="resultado-nombre">{producto.nombre}</span>
                            {producto.presentacion && (
                              <span className="resultado-presentacion">{producto.presentacion}</span>
                            )}
                            <span className="resultado-codigo">{producto.codigo}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {productosSeleccionados.length > 0 && (
                    <div className="productos-seleccionados">
                      <h4>Productos Seleccionados ({productosSeleccionados.length})</h4>
                      <table className="tabla-productos-seleccionados">
                        <thead>
                          <tr>
                            <th>Nombre</th>
                            <th>Presentación</th>
                            <th>Piezas</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {productosSeleccionados.map(producto => (
                            <tr key={producto.codigo}>
                              <td>{producto.nombre}</td>
                              <td>{producto.presentacion || "-"}</td>
                              <td>
                                <input
                                  type="number"
                                  min="1"
                                  value={producto.piezas}
                                  onChange={(e) => actualizarPiezasSeleccionado(producto.codigo, e.target.value)}
                                  className="input-piezas-mini"
                                />
                              </td>
                              <td>
                                <button 
                                  className="btn-quitar-producto"
                                  onClick={() => quitarProducto(producto.codigo)}
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Paso 3: Área y corroboración */}
              {pasoModal === 3 && (
                <div className="paso-modal">
                  <div className="campo-modal">
                    <label>Área</label>
                    <select
                      value={areaNueva}
                      onChange={(e) => setAreaNueva(e.target.value)}
                    >
                      {AREAS.map(area => (
                        <option key={area} value={area}>{area}</option>
                      ))}
                    </select>
                  </div>
                  <div className="campo-modal campo-switch">
                    <label>¿Verificando?</label>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={corroborandoNuevo}
                        onChange={(e) => setCorroborandoNuevo(e.target.checked)}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>

                  <div className="resumen-registro">
                    <h4>Resumen</h4>
                    <p><strong>Pedido:</strong> {pedidoNuevo}</p>
                    <p><strong>Fecha Pedido:</strong> {formatearFecha(fechaPedidoNuevo)}</p>
                    <p><strong>Productos:</strong> {productosSeleccionados.length}</p>
                    <p><strong>Área:</strong> {areaNueva}</p>
                    <p><strong>Verificando:</strong> {corroborandoNuevo ? "Sí" : "No"}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer-activaciones">
              {pasoModal > 1 && (
                <button 
                  className="btn-anterior"
                  onClick={() => setPasoModal(pasoModal - 1)}
                >
                  ← Anterior
                </button>
              )}
              
              {pasoModal < 3 ? (
                <button 
                  className="btn-siguiente"
                  onClick={() => {
                    if (pasoModal === 1) {
                      if (!pedidoNuevo.trim()) {
                        showAlert("Ingresa el número de pedido", "warning");
                        return;
                      }
                      if (!fechaPedidoNuevo) {
                        showAlert("Selecciona la fecha del pedido", "warning");
                        return;
                      }
                    }
                    if (pasoModal === 2 && productosSeleccionados.length === 0) {
                      showAlert("Agrega al menos un producto", "warning");
                      return;
                    }
                    setPasoModal(pasoModal + 1);
                  }}
                >
                  Siguiente →
                </button>
              ) : (
                <button 
                  className="btn-guardar-activacion"
                  onClick={guardarRegistros}
                >
                  💾 Guardar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
