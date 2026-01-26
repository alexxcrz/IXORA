import React, { useEffect, useMemo, useState } from "react";
import "./ReportesPicking.css";
import { authFetch } from "../../AuthContext";
import { useAlert } from "../../components/AlertModal";
import ReporteDetallado from "./ReporteDetallado";

export default function ReportesPicking({ diasPorMes, verDetalleDia, SERVER_URL }) {
  const { showAlert, showConfirm } = useAlert();
  const [mapMeses, setMapMeses] = useState(diasPorMes || {});
  const [mesAbierto, setMesAbierto] = useState(null);
  const [paginaMes, setPaginaMes] = useState({});
  const [canalFiltro, setCanalFiltro] = useState("picking");

  // ----- Modales -----
  const [modalEdit, setModalEdit] = useState(false);
  const [modalReporteDetallado, setModalReporteDetallado] = useState(false);
  const [reporteDetalladoTipo, setReporteDetalladoTipo] = useState(null); // "q1", "q2", "mes"
  const [reporteDetalladoMes, setReporteDetalladoMes] = useState(null);

  // Datos del día seleccionado
  const [diaSel, setDiaSel] = useState(null);
  const [dataEdit, setDataEdit] = useState([]);
  const [tabReporte, setTabReporte] = useState("todo"); // "todo", "importacion", "devoluciones", "retail", "fulfillment"
  const [fechaOrigen, setFechaOrigen] = useState("");
  const [fechaDestino, setFechaDestino] = useState("");
  
  // Estados para pedidos de devoluciones
  const [pedidosDevoluciones, setPedidosDevoluciones] = useState([]);
  const [pedidosAbiertos, setPedidosAbiertos] = useState(new Set());
  const [buscadorPedido, setBuscadorPedido] = useState("");
  const [cargandoPedidos, setCargandoPedidos] = useState(false);

  // --- Convertir fecha YYYY-MM-DD → DD/MM/YYYY
  const fmtDMY = (f) => {
    if (!f) return "";
    try {
      if (typeof f === 'string' && f.includes("-")) {
        return f.split("-").reverse().join("/");
      }
      // Si es un objeto con fecha
      if (typeof f === 'object' && f.fecha) {
        return f.fecha.split("-").reverse().join("/");
      }
      return String(f);
    } catch (e) {
      return String(f || "");
    }
  };

  // Función para recargar días desde el servidor
  const recargarDias = React.useCallback(async () => {
    try {
      const canalQuery = canalFiltro ? `?canal=${encodeURIComponent(canalFiltro)}` : "";
      const data = await authFetch(`${SERVER_URL}/reportes/dias${canalQuery}`);
      if (Array.isArray(data)) {
        // Agrupar días por mes (formato: YYYY-MM)
        const map = {};
        for (const d of data) {
          const fecha = d.fecha || d;
          if (!fecha) continue;
          const mes = fecha.slice(0, 7); // Extraer YYYY-MM
          if (!map[mes]) map[mes] = [];
          map[mes].push(d);
        }
        // Ordenar días dentro de cada mes
        Object.values(map).forEach((arr) =>
          arr.sort((a, b) => {
            const fechaA = a.fecha || a;
            const fechaB = b.fecha || b;
            return fechaB.localeCompare(fechaA); // Más reciente primero
          })
        );
        setMapMeses(map);
      } else if (data && typeof data === 'object' && !Array.isArray(data)) {
        // Si ya viene agrupado por mes, normalizar
        const dataNormalizado = {};
        Object.keys(data).forEach(key => {
          dataNormalizado[key] = Array.isArray(data[key]) ? data[key] : [];
        });
        setMapMeses(dataNormalizado);
      }
    } catch (err) {
      console.error("Error recargando días:", err);
    }
  }, [SERVER_URL, canalFiltro]);

  // ----- Cargar días por mes -----
  useEffect(() => {
    if (diasPorMes && Object.keys(diasPorMes).length && canalFiltro === "picking") {
      // Asegurar que todos los valores sean arrays
      const dataNormalizado = {};
      Object.keys(diasPorMes).forEach(key => {
        dataNormalizado[key] = Array.isArray(diasPorMes[key]) ? diasPorMes[key] : [];
      });
      setMapMeses(dataNormalizado);
    }
  }, [diasPorMes, canalFiltro]);

  // ----- Escuchar eventos de socket para actualización automática -----
  useEffect(() => {
    if (!window.socket) return;
    const socket = window.socket;

    const handleReportesActualizados = () => {
      console.log("📡 Evento reportes_actualizados recibido, recargando días...");
      // Pequeño delay para asegurar que el servidor haya completado la transacción
      setTimeout(() => {
        recargarDias();
      }, 200);
    };

    const handleFechaActualizada = () => {
      console.log("📡 Evento fecha_actualizada recibido, recargando días...");
      // Si se cierra el día, recargar días
      setTimeout(() => {
        recargarDias();
      }, 200);
    };

    const handleCierreDia = () => {
      console.log("📡 Evento cerrar_dia recibido, recargando días...");
      // Cuando se cierra el día, recargar días inmediatamente
      setTimeout(() => {
        recargarDias();
      }, 300);
    };

    socket.on("reportes_actualizados", handleReportesActualizados);
    socket.on("fecha_actualizada", handleFechaActualizada);
    socket.on("cerrar_dia", handleCierreDia);

    return () => {
      socket.off("reportes_actualizados", handleReportesActualizados);
      socket.off("fecha_actualizada", handleFechaActualizada);
      socket.off("cerrar_dia", handleCierreDia);
    };
  }, [SERVER_URL, recargarDias]);

  // ✅ ORDENAR MESES (El más nuevo primero - Descendente)
  const listaMeses = useMemo(() => {
    // Ordena de forma descendente (e.g., 2024-11, 2024-10, ...)
    const keys = Object.keys(mapMeses || {}).sort((a, b) => b.localeCompare(a));
    return keys;
  }, [mapMeses]);

  const [mesSel, setMesSel] = useState("");

  // ============================
  // MODAL EDITAR DÍA (ABRIR)
  // ============================
  const abrirEditar = async (fecha) => {
    setDiaSel(fecha);
    try {
      const data = await authFetch(`${SERVER_URL}/reportes/dia/${fecha}`);
      setDataEdit(Array.isArray(data) ? data : []);
    } catch {
      setDataEdit([]);
    }
    setModalEdit(true);
    // Cargar pedidos de devoluciones si la pestaña está en devoluciones
    // Usar setTimeout para asegurar que el modal esté abierto
    setTimeout(() => {
      if (tabReporte === "devoluciones") {
        cargarPedidosDevoluciones(fecha);
      }
    }, 100);
  };

  // ============================
  // CARGAR PEDIDOS DE DEVOLUCIONES
  // ============================
  const cargarPedidosDevoluciones = async (fecha) => {
    if (!fecha) {
      console.warn("⚠️ No hay fecha para cargar pedidos de devoluciones");
      return;
    }
    console.log("📦 Iniciando carga de pedidos de devoluciones para:", fecha);
    setCargandoPedidos(true);
    try {
      const url = `${SERVER_URL}/reportes/devoluciones-pedidos/${fecha}`;
      console.log("🔗 URL:", url);
      const data = await authFetch(url);
      console.log("✅ Datos recibidos:", data);
      setPedidosDevoluciones(Array.isArray(data) ? data : []);
      console.log("📊 Pedidos cargados:", Array.isArray(data) ? data.length : 0);
    } catch (err) {
      console.error("❌ Error cargando pedidos de devoluciones:", err);
      console.error("❌ Detalles del error:", err.message, err.stack);
      setPedidosDevoluciones([]);
    } finally {
      setCargandoPedidos(false);
    }
  };

  // Cargar pedidos cuando se cambia a la pestaña de devoluciones
  useEffect(() => {
    if (tabReporte === "devoluciones" && diaSel && modalEdit) {
      console.log("🔄 Cargando pedidos de devoluciones para fecha:", diaSel);
      cargarPedidosDevoluciones(diaSel);
    } else {
      // Limpiar pedidos cuando se cambia de pestaña
      setPedidosDevoluciones([]);
      setPedidosAbiertos(new Set());
      setBuscadorPedido("");
    }
  }, [tabReporte, diaSel, modalEdit]);

  // Toggle tarjeta apilada de pedido
  const togglePedido = (pedidoId) => {
    setPedidosAbiertos(prev => {
      const nuevo = new Set(prev);
      if (nuevo.has(pedidoId)) {
        nuevo.delete(pedidoId);
      } else {
        nuevo.add(pedidoId);
      }
      return nuevo;
    });
  };

  // Filtrar pedidos por buscador
  const pedidosFiltrados = useMemo(() => {
    if (!buscadorPedido.trim()) return pedidosDevoluciones;
    const busqueda = buscadorPedido.toLowerCase().trim();
    return pedidosDevoluciones.filter(p => 
      p.pedido?.toLowerCase().includes(busqueda) ||
      p.guia?.toLowerCase().includes(busqueda) ||
      p.motivo?.toLowerCase().includes(busqueda)
    );
  }, [pedidosDevoluciones, buscadorPedido]);

  // ============================
  // GUARDAR CAMBIOS DE DÍA
  // ============================
  const guardarCambios = async () => {
    // Verificar si estamos editando un día cerrado (histórico)
    // Los días cerrados tienen productos en productos_historico, no en dbDia
    // Por lo tanto, no se pueden editar directamente
    if (diaSel) {
      try {
        // Obtener la fecha actual del servidor
        const fechaActualData = await authFetch(`${SERVER_URL}/fecha-actual`);
        const fechaActual = fechaActualData?.fecha || "";
        
        // Si el día seleccionado no es el día actual, es un día cerrado
        if (diaSel !== fechaActual) {
          await showAlert("⚠️ No se pueden editar productos de días cerrados. Solo puedes editar productos del día actual.", "warning");
          return;
        }
      } catch (err) {
        console.error("Error verificando fecha actual:", err);
        // Continuar intentando guardar si no se puede verificar
      }
    }

    try {
      for (const prod of dataEdit) {
        // Usar URL relativa para que authFetch la procese correctamente
        await authFetch(`/productos/${prod.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(prod),
        });
      }
      showAlert("Cambios guardados", "success");
      setModalEdit(false);
    } catch (err) {
      console.error("Error guardando cambios:", err);
      if (err.isNotFound || err.status === 404) {
        showAlert("Error: El producto no fue encontrado. Solo puedes editar productos del día actual.", "error");
      } else {
        showAlert("Error guardando: " + (err.message || "Error desconocido"), "error");
      }
    }
  };

  const borrarProducto = async (id) => {
    const confirmado = await showConfirm("¿Eliminar este producto?", "Confirmar eliminación");
    if (!confirmado) return;
    await authFetch(`${SERVER_URL}/productos/${id}`, { method: "DELETE" });
    setDataEdit((p) => p.filter((x) => x.id !== id));
  };

  // ============================
  // ABRIR REPORTE DETALLADO
  // ============================
  const abrirReporteDetallado = (tipo) => {
    if (!mesSel) {
      showAlert("⚠️ Selecciona un mes primero", "warning");
      return;
    }
    setReporteDetalladoTipo(tipo);
    setReporteDetalladoMes(mesSel);
    setModalReporteDetallado(true);
  };

  // ============================
  // DESCARGAR REPORTES (solo para día)
  // ============================
  const descargar = (tipo, valor) => {
    if (tipo === "dia") {
      const url = `${SERVER_URL}/reportes/exportar-dia/${valor}`;
      window.open(url, "_blank");
    }
    // Q1, Q2 y Mes ahora abren el reporte detallado
  };

  const borrarDia = async (fecha) => {
    const confirmado = await showConfirm(`¿Borrar permanentemente el día ${fecha}?`, "Confirmar eliminación");
    if (!confirmado) return;

    try {
      await authFetch(`${SERVER_URL}/reportes/dia/${fecha}`, {
        method: "DELETE",
      });
      await showAlert("Día eliminado", "success");
      recargarDias();
    } catch {
      showAlert("Error al borrar el día", "error");
    }
  };

  // ──────────────── Mover reporte ────────────────
  const moverDia = async () => {
    if (!fechaOrigen || !fechaDestino) {
      await showAlert("⚠️ Selecciona ambas fechas", "warning");
      return;
    }

    if (fechaOrigen === fechaDestino) {
      await showAlert("⚠️ La fecha destino debe ser diferente", "warning");
      return;
    }

    try {
      await authFetch(`${SERVER_URL}/reportes/mover-dia`, {
        method: "PUT",
        body: JSON.stringify({
          fecha_original: fechaOrigen,
          nueva_fecha: fechaDestino,
        }),
      });
      await showAlert("✅ Reporte movido correctamente", "success");
      setFechaOrigen("");
      setFechaDestino("");
      recargarDias();
    } catch {
      showAlert("❌ Error al mover el reporte", "error");
    }
  };

  const marcarDiasPicker = () => {
    setTimeout(() => {
      document.querySelectorAll('input[type="date"]').forEach((input) => {
        const val = input.value;
        const fechaExiste = Object.values(mapMeses).some(dias => 
          Array.isArray(dias) && dias.some(d => d.fecha === val)
        );
        if (fechaExiste) input.classList.add("day-dot");
        else input.classList.remove("day-dot");
      });
    }, 80);
  };

  // ============================
  // RENDER
  // ============================
  return (
    <div className="reportes-wrap">
      <h2>Reportes Picking</h2>

      <div className="reportes-modal-tabs" style={{ marginBottom: "16px" }}>
        <button
          className={`reportes-tab-btn ${canalFiltro === 'picking' ? 'active' : ''}`}
          onClick={() => {
            setCanalFiltro("picking");
            recargarDias();
          }}
        >
          ✅ Picking
        </button>
        <button
          className={`reportes-tab-btn ${canalFiltro === 'retail' ? 'active' : ''}`}
          onClick={() => {
            setCanalFiltro("retail");
            recargarDias();
          }}
        >
          🛍️ Retail
        </button>
        <button
          className={`reportes-tab-btn ${canalFiltro === 'fulfillment' ? 'active' : ''}`}
          onClick={() => {
            setCanalFiltro("fulfillment");
            recargarDias();
          }}
        >
          📦 Fulfillment
        </button>
      </div>

      {/* 🔹 CAMBIAR FECHA */}
      <div className="tabs-and-date-container">
        <div className="cambiar-fecha-contenedor">
          <label className="cf-label">Día a mover</label>
          <input
            type="date"
            value={fechaOrigen}
            onChange={(e) => setFechaOrigen(e.target.value)}
            onFocus={marcarDiasPicker}
            onClick={marcarDiasPicker}
            className="cf-input"
          />
          <span className="cf-flecha">→</span>
          <label className="cf-label">Mover a</label>
          <input
            type="date"
            value={fechaDestino}
            onChange={(e) => setFechaDestino(e.target.value)}
            className="cf-input"
          />
          <button className="btn-cambiar" onClick={moverDia}>
            Cambiar
          </button>
        </div>
      </div>

      <div className="meses-list">
        {listaMeses.map((mesKey) => {
          const abierto = mesAbierto === mesKey;
          const total = (mapMeses[mesKey] || []).length;
          const page = paginaMes[mesKey] || 0;
          const maxPage = Math.max(0, Math.floor((total - 1) / 6));

          // ✅ Ordenamos los días para que el más nuevo esté primero.
          const diasDelMes = mapMeses[mesKey];
          const diasOrdenados = Array.isArray(diasDelMes) 
            ? [...diasDelMes].sort((a, b) => b.fecha.localeCompare(a.fecha))
            : [];


          return (
            <div key={mesKey} className={`mes-card ${abierto ? "open" : ""}`}>
              {/* HEADER DEL MES */}
              <button
                className="mes-header"
                onClick={() => {
                  setMesAbierto((prev) => (prev === mesKey ? null : mesKey));
                  setMesSel(mesKey);
                }}
              >
                <span className="mes-txt">
                  {mesKey && mesKey.includes("-") ? (
                    (() => {
                      try {
                        const [year, month] = mesKey.split("-").map(Number);
                        if (isNaN(year) || isNaN(month)) return mesKey;
                        const date = new Date(year, month - 1, 1);
                        if (isNaN(date.getTime())) return mesKey;
                        return date.toLocaleString("es-MX", { month: "long", year: "numeric" });
                      } catch (e) {
                        return mesKey;
                      }
                    })()
                  ) : (
                    mesKey || "Sin fecha"
                  )}
                </span>

                <span className="mes-total">{total} días</span>

                {/* Acciones Q1 / Q2 / MES */}
                <div className="mes-actions">
                  <span className="btn-small" onClick={() => abrirReporteDetallado("q1")}>
                    Q1
                  </span>
                  <span className="btn-small" onClick={() => abrirReporteDetallado("q2")}>
                    Q2
                  </span>
                  <span
                    className="btn-small"
                    onClick={() => abrirReporteDetallado("mes")}
                  >
                    Mes
                  </span>
                </div>

                <span className="chev">{abierto ? "▴" : "▾"}</span>
              </button>

              {/* CUERPO */}
              {abierto && (
                <div className="mes-body">
                  <div className="dias-head">
                    <div className="col-fecha">Fecha</div>
                    <div className="col-tp">Prod. Picking</div>
                    <div className="col-tz">Piezas Picking</div>
                    <div className="col-tp">Prod. Import.</div>
                    <div className="col-tz">Piezas Import.</div>
                    <div className="col-tp">Prod. Devol.</div>
                    <div className="col-tz">Piezas Devol.</div>
                    <div className="col-tp">Total Prod.</div>
                    <div className="col-tz">Total Piezas</div>
                    <div className="col-acc">Acciones</div>
                  </div>

                  <div className="dias-block">
                    {diasOrdenados // Usamos los días ya ordenados
                      .slice(page * 6, page * 6 + 6)
                      .map((d) => {
                        const fecha = d.fecha || (typeof d === 'string' ? d : '');
                        const fechaFormateada = fmtDMY(fecha);
                        return (
                        <div className="dia-row" key={fecha || Math.random()}>
                          <div className="col-fecha">
                            <span className="date-pill">{fechaFormateada || "Sin fecha"}</span>
                          </div>
                          <div className="col-tp">{d.total_productos_picking ?? 0}</div>
                          <div className="col-tz">{d.total_piezas_picking ?? 0}</div>
                          <div className="col-tp">{d.total_productos_importacion ?? 0}</div>
                          <div className="col-tz">{d.total_piezas_importacion ?? 0}</div>
                          <div className="col-tp">{d.total_productos_devoluciones ?? 0}</div>
                          <div className="col-tz">{d.total_piezas_devoluciones ?? 0}</div>
                          <div className="col-tp">{d.total_productos ?? 0}</div>
                          <div className="col-tz">{d.total_piezas ?? 0}</div>

                          <div className="col-acc">
                            {/* ✅ Botón 🌐 Ver ELIMINADO */}
                            <button
                              className="btn-primary"
                              onClick={() => abrirEditar(fecha)}
                            >
                              Editar
                            </button>
                            <button
                              className="btn-borrar"
                              onClick={() => borrarDia(fecha)}
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                        );
                      })}
                  </div>

                  {/* PAGINACIÓN */}
                  {total > 6 && (
                    <div className="pager">
                      <button
                        className="btn-plain"
                        onClick={() =>
                          setPaginaMes((p) => ({
                            ...p,
                            [mesKey]: Math.max((p[mesKey] || 0) - 1, 0),
                          }))
                        }
                        disabled={page === 0}
                      >
                        ◀
                      </button>

                      <span>
                        {page + 1} / {maxPage + 1}
                      </span>

                      <button
                        className="btn-plain"
                        onClick={() =>
                          setPaginaMes((p) => ({
                            ...p,
                            [mesKey]: Math.min((p[mesKey] || 0) + 1, maxPage),
                          }))
                        }
                        disabled={page >= maxPage}
                      >
                        ▶
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ============================
          MODAL EDITAR DÍA (ESTRUCTURA COMPLETA DE REGISTROS)
      ============================ */}
      {modalEdit && (
        <div className="reportes-modal-ov" onClick={() => setModalEdit(false)}>
          <div className="reportes-modal edit" onClick={(e) => e.stopPropagation()}>
            <div className="reportes-modal-head">
              <h4>Reporte {fmtDMY(diaSel)}</h4>
              <button className="btn-plain" onClick={() => setModalEdit(false)}>
                ✕
              </button>
            </div>

            {/* PESTAÑAS */}
            <div className="reportes-modal-tabs">
              <button
                className={`reportes-tab-btn ${tabReporte === 'todo' ? 'active' : ''}`}
                onClick={() => setTabReporte("todo")}
              >
                ✅ Todo
              </button>
              <button
                className={`reportes-tab-btn ${tabReporte === 'importacion' ? 'active' : ''}`}
                onClick={() => setTabReporte("importacion")}
              >
                🌎 Importación
              </button>
              <button
                className={`reportes-tab-btn ${tabReporte === 'retail' ? 'active' : ''}`}
                onClick={() => setTabReporte("retail")}
              >
                🛍️ Retail
              </button>
              <button
                className={`reportes-tab-btn ${tabReporte === 'fulfillment' ? 'active' : ''}`}
                onClick={() => setTabReporte("fulfillment")}
              >
                📦 Fulfillment
              </button>
              <button
                className={`reportes-tab-btn ${tabReporte === 'devoluciones' ? 'active' : ''}`}
                onClick={() => {
                  setTabReporte("devoluciones");
                  // Cargar pedidos cuando se hace clic en la pestaña
                  if (diaSel) {
                    cargarPedidosDevoluciones(diaSel);
                  }
                }}
              >
                🔄 Devoluciones
              </button>
            </div>

            <div className="reportes-modal-body">
              {(() => {
                // Si es la pestaña de devoluciones, mostrar lista de pedidos
                if (tabReporte === "devoluciones") {
                  return (
                    <div style={{ padding: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.2rem' }}>
                          📦 Pedidos de Devoluciones ({pedidosDevoluciones.length})
                        </h3>
                        {pedidosDevoluciones.length > 0 && (
                          <input
                            type="text"
                            placeholder="🔍 Buscar pedido..."
                            value={buscadorPedido}
                            onChange={(e) => setBuscadorPedido(e.target.value)}
                            style={{
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: '1px solid var(--borde-medio)',
                              fontSize: '0.9rem',
                              width: '250px',
                              background: 'var(--fondo-input)',
                              color: 'var(--texto-principal)'
                            }}
                          />
                        )}
                      </div>
                      
                      {cargandoPedidos ? (
                        <div style={{ textAlign: 'center', padding: '40px' }}>
                          <div style={{ fontSize: '1.2rem', marginBottom: '10px' }}>⏳</div>
                          <div>Cargando pedidos de devoluciones...</div>
                        </div>
                      ) : pedidosFiltrados.length > 0 ? (
                        <div style={{ 
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          maxHeight: '500px',
                          overflowY: 'auto',
                          paddingRight: '8px'
                        }}>
                          {pedidosFiltrados.map((p) => {
                            const estaAbierto = pedidosAbiertos.has(p.id);
                            const fechaPedido = p.fecha_cierre || p.fecha;
                            
                            return (
                              <div
                                key={`pedido-${p.id}`}
                                style={{
                                  border: '1px solid var(--borde-medio)',
                                  borderRadius: '8px',
                                  padding: '12px',
                                  background: 'var(--fondo-input)',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-primario)'}
                                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--borde-medio)'}
                              >
                                <div
                                  onClick={() => togglePedido(p.id)}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                    <span style={{ 
                                      background: 'var(--color-primario)',
                                      color: 'white',
                                      padding: '4px 12px',
                                      borderRadius: '6px',
                                      fontSize: '0.9rem',
                                      fontWeight: 'bold'
                                    }}>
                                      {p.pedido}
                                    </span>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--texto-secundario)' }}>
                                      {fechaPedido}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--texto-secundario)' }}>
                                      {p.total_cajas || 0} cajas | {p.total_productos || 0} productos | {p.total_piezas || 0} piezas
                                    </span>
                                    <span style={{ 
                                      transform: estaAbierto ? 'rotate(180deg)' : 'rotate(0deg)',
                                      transition: 'transform 0.2s',
                                      fontSize: '1.2rem'
                                    }}>
                                      {estaAbierto ? '▴' : '▾'}
                                    </span>
                                  </div>
                                </div>
                                
                                {estaAbierto && (
                                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--borde-sutil)' }}>
                                    <div style={{ 
                                      display: 'grid', 
                                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                      gap: '12px',
                                      marginBottom: '16px'
                                    }}>
                                      <div>
                                        <strong>Guía:</strong> {p.guia || "–"}
                                      </div>
                                      <div>
                                        <strong>Paquetería:</strong> {p.paqueteria || "–"}
                                      </div>
                                      <div>
                                        <strong>Motivo:</strong> {p.motivo || "–"}
                                      </div>
                                      {p.usuario && (
                                        <div>
                                          <strong>Usuario:</strong> {p.usuario}
                                        </div>
                                      )}
                                    </div>
                                    
                                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                      <table className="tbl" style={{ fontSize: '0.85rem' }}>
                                        <thead>
                                          <tr>
                                            <th>Código</th>
                                            <th>Nombre</th>
                                            <th>Lote</th>
                                            <th>Cajas</th>
                                            <th>Surtido</th>
                                            <th>Disponible</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {p.productos.map((prod) => (
                                            <tr key={prod.id}>
                                              <td>{prod.codigo}</td>
                                              <td>{prod.nombre}</td>
                                              <td>{prod.lote || "–"}</td>
                                              <td>{prod.cajas || 0}</td>
                                              <td>{prod.surtido ? "✓" : "✗"}</td>
                                              <td>{prod.disponible || 0}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--texto-secundario)' }}>
                          <div style={{ fontSize: '2rem', marginBottom: '10px' }}>📦</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '8px' }}>
                            {buscadorPedido ? "No se encontraron pedidos con ese criterio" : "No hay pedidos de devoluciones registrados para este día"}
                          </div>
                          {!buscadorPedido && (
                            <div style={{ fontSize: '0.9rem', marginTop: '10px', opacity: 0.7 }}>
                              Fecha: {diaSel || 'No seleccionada'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }

                // Filtrar datos según la pestaña activa (para todo e importación)
                const datosFiltrados = dataEdit.filter((p) => {
                  if (tabReporte === "todo") {
                    const esDevolucion = p.origen === 'devoluciones';
                    const categoria = (p.categoria || "").toLowerCase();
                    // Solo excluir importación, todo lo demás (incluyendo alimentos) va a "todo"
                    const esImportado = categoria.includes("import") || categoria.includes("importación");
                    return !esDevolucion && !esImportado && (p.canal || "picking") === "picking";
                  }
                  if (tabReporte === "importacion") {
                    const categoria = (p.categoria || "").toLowerCase();
                    const esImportado = categoria.includes("import") || categoria.includes("importación");
                    return esImportado && (p.canal || "picking") === "picking";
                  }
                  if (tabReporte === "retail") {
                    return (p.canal || "picking") === "retail";
                  }
                  if (tabReporte === "fulfillment") {
                    return (p.canal || "picking") === "fulfillment";
                  }
                  return true;
                });

                return (
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Nombre</th>
                        <th>Lote</th>
                        <th>Cajas</th>
                        <th>P. x Caja</th>
                        <th>Extras</th>
                        <th>Total</th>
                        <th>Observaciones</th>
                        <th>Surtido</th>
                        <th>Disponible</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {datosFiltrados.map((p) => {
                        // Encontrar el índice original en dataEdit
                        const originalIndex = dataEdit.findIndex(prod => prod.id === p.id);
                        return (
                          <tr key={p.id}>
                      <td>{p.codigo}</td>
                      <td>{p.nombre}</td>

                      {/* Lote */}
                      <td>
                        <input
                          value={p.lote || ""}
                          onChange={(e) =>
                            setDataEdit((arr) => {
                              const copy = [...arr];
                              copy[originalIndex].lote = e.target.value;
                              return copy;
                            })
                          }
                        />
                      </td>

                      {/* Cajas */}
                      <td>
                        <input
                          type="number"
                          value={p.cajas}
                          onChange={(e) =>
                            setDataEdit((arr) => {
                              const copy = [...arr];
                              copy[originalIndex].cajas = e.target.value;
                              return copy;
                            })
                          }
                        />
                      </td>

                      {/* P. x Caja (piezas_por_caja) */}
                      <td>
                        <input
                          type="number"
                          value={p.piezas_por_caja}
                          onChange={(e) =>
                            setDataEdit((arr) => {
                              const copy = [...arr];
                              copy[originalIndex].piezas_por_caja = e.target.value;
                              return copy;
                            })
                          }
                        />
                      </td>

                      {/* Extras (Editable Input) */}
                      <td>
                        <input
                          type="number"
                          value={p.extras ?? ""}
                          onChange={(e) =>
                            setDataEdit((arr) => {
                              const copy = [...arr];
                              copy[originalIndex].extras = e.target.value;
                              return copy;
                            })
                          }
                        />
                      </td>

                      {/* Total (Visual/Calculado - Read-only) */}
                      <td>
                        <span style={{ fontWeight: 'bold' }}>
                          {parseInt(p.cajas || 0) * parseInt(p.piezas_por_caja || 0)}
                        </span>
                      </td>

                      {/* Observaciones */}
                      <td>
                        <input
                          value={p.observaciones || ""}
                          onChange={(e) =>
                            setDataEdit((arr) => {
                              const copy = [...arr];
                              copy[originalIndex].observaciones = e.target.value;
                              return copy;
                            })
                          }
                        />
                      </td>

                      {/* Surtido (Editable Checkbox) */}
                      <td>
                        <input
                          type="checkbox"
                          checked={!!p.surtido}
                          onChange={(e) =>
                            setDataEdit((arr) => {
                              const copy = [...arr];
                              copy[originalIndex].surtido = e.target.checked;
                              return copy;
                            })
                          }
                        />
                      </td>

                      {/* Disponible (Editable Input) */}
                      <td>
                        <input
                          type="number"
                          value={p.disponible ?? ""}
                          onChange={(e) =>
                            setDataEdit((arr) => {
                              const copy = [...arr];
                              copy[originalIndex].disponible = e.target.value;
                              return copy;
                            })
                          }
                        />
                      </td>

                      <td>
                        <button
                          className="btn-borrar"
                          onClick={() => borrarProducto(p.id)}
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
                );
              })()}
            </div>

            <div className="reportes-modal-foot">
              <button className="btn-primary" onClick={guardarCambios}>
                Guardar
              </button>
              <button
                className="btn-plain"
                onClick={() => descargar("dia", diaSel)}
              >
                ⬇ Descargar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL REPORTE DETALLADO */}
      {modalReporteDetallado && (
        <div className="modal-reporte-detallado-overlay">
          <div className="modal-reporte-detallado-content">
            <ReporteDetallado
              tipo={reporteDetalladoTipo}
              mes={reporteDetalladoMes}
              SERVER_URL={SERVER_URL}
              onClose={() => setModalReporteDetallado(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}