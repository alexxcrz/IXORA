import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import "./ReportesDevoluciones.css";
import { useAuth } from "../../AuthContext";
import { useAlert } from "../../components/AlertModal";
import ReporteDetalladoDevoluciones from "./ReporteDetalladoDevoluciones";

export default function ReportesDevoluciones({ serverUrl, pushToast }) {
  const { authFetch } = useAuth();
  const { showAlert } = useAlert();
  // 🔹 Pestañas de categorías
  const pestañas = [
    { key: "clientes", label: "Clientes" },
    { key: "calidad", label: "Calidad" },
    { key: "reacondicionados", label: "Reacondicionados" },
    { key: "retail", label: "Retail" },
    { key: "cubbo", label: "Cubbo" },
    { key: "regulatorio", label: "Regulatorio" },
  ];

  const [tabActiva, setTabActiva] = useState("clientes");

  // ENDPOINT dinámico según pestaña
  const endpointBase = `${serverUrl}/reportes-devoluciones/${tabActiva}`;

  // Estados originales
  const [dias, setDias] = useState([]);
  const [detalle, setDetalle] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [viendoDetalle, setViendoDetalle] = useState(false);
  
  // Estados para tarjetas apiladas y modales
  const [pedidosAbiertos, setPedidosAbiertos] = useState(new Set());
  const [buscadorPedido, setBuscadorPedido] = useState("");
  const [detallePedido, setDetallePedido] = useState(null);
  const [detallePedidoOpen, setDetallePedidoOpen] = useState(false);
  const [productosPedidoModal, setProductosPedidoModal] = useState({ open: false, pedido: null, productos: [], loading: false });
  const [viewerFotos, setViewerFotos] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  
  // Estados para reporte detallado
  const [modalReporteDetallado, setModalReporteDetallado] = useState(false);
  const [reporteDetalladoTipo, setReporteDetalladoTipo] = useState(null); // "q1", "q2", "mes"
  const [reporteDetalladoMes, setReporteDetalladoMes] = useState(null);

  const [mesAbierto, setMesAbierto] = useState(null);
  const [paginaMes, setPaginaMes] = useState({});
  const [fechaOrigen, setFechaOrigen] = useState("");
  const [fechaDestino, setFechaDestino] = useState("");
  const [fechaActualDetalle, setFechaActualDetalle] = useState("");
  const cargandoDiasRef = useRef(false);
  const timeoutRef = useRef(null);
  const ultimaSolicitudRef = useRef("");
  const solicitudesEnProcesoRef = useRef(new Set());

  // ──────────────── Cargar días ────────────────
  const cargarDias = useCallback(async () => {
    try {
      const endpoint = `${serverUrl}/reportes-devoluciones/${tabActiva}/dias`;
      const data = await authFetch(endpoint);
      setDias(data || []);
      if (!data || (Array.isArray(data) && data.length === 0)) {
        // Sin datos
      }
    } catch (e) {
      console.error("❌ Frontend: Error cargando días:", e);
      console.error("❌ Frontend: Error details:", e.message, e.stack);
      pushToast?.("❌ No se pudieron cargar los días", "err");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabActiva, serverUrl]);

  useEffect(() => {
    let isMounted = true;
    let timeoutId = null;
    
    // Limpiar timeout anterior si existe
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    // Crear una clave única para esta solicitud
    const solicitudKey = `${serverUrl}-${tabActiva}`;
    
    // Si ya hay una solicitud en proceso para esta clave, ignorar
    if (solicitudesEnProcesoRef.current.has(solicitudKey)) {
      return () => {
        isMounted = false;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (timeoutRef.current === timeoutId) {
          timeoutRef.current = null;
        }
      };
    }
    
    // Si ya se hizo una solicitud reciente para esta combinación, ignorar
    if (ultimaSolicitudRef.current === solicitudKey) {
      return () => {
        isMounted = false;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (timeoutRef.current === timeoutId) {
          timeoutRef.current = null;
        }
      };
    }
    
    // Usar debounce de 2 segundos para evitar solicitudes rápidas
    timeoutId = setTimeout(() => {
      if (!isMounted || cargandoDiasRef.current) return;
      
      // Verificar nuevamente si ya se hizo esta solicitud o está en proceso
      if (ultimaSolicitudRef.current === solicitudKey || solicitudesEnProcesoRef.current.has(solicitudKey)) {
        return;
      }
      
      const cargar = async () => {
        if (cargandoDiasRef.current || !isMounted) return;
        if (ultimaSolicitudRef.current === solicitudKey || solicitudesEnProcesoRef.current.has(solicitudKey)) return;
        
        // Marcar como en proceso
        solicitudesEnProcesoRef.current.add(solicitudKey);
        cargandoDiasRef.current = true;
        ultimaSolicitudRef.current = solicitudKey;
        
        try {
          const endpoint = `${serverUrl}/reportes-devoluciones/${tabActiva}/dias`;
          const data = await authFetch(endpoint);
          if (isMounted) {
            setDias(data || []);
          }
        } catch (e) {
          if (isMounted) {
            // Solo mostrar error si no es 429 (demasiadas solicitudes)
            if (e.message && !e.message.includes("Demasiadas solicitudes")) {
              console.error("❌ Frontend: Error cargando días:", e);
              pushToast?.("❌ No se pudieron cargar los días", "err");
            }
          }
          // Resetear la clave si hay error para permitir reintento
          if (e.message && e.message.includes("Demasiadas solicitudes")) {
            setTimeout(() => {
              ultimaSolicitudRef.current = "";
              solicitudesEnProcesoRef.current.delete(solicitudKey);
            }, 30000); // Resetear después de 30 segundos
          }
        } finally {
          if (isMounted) {
            cargandoDiasRef.current = false;
            solicitudesEnProcesoRef.current.delete(solicitudKey);
          }
        }
      };
      
      cargar();
    }, 2000);
    
    timeoutRef.current = timeoutId;
    
    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (timeoutRef.current === timeoutId) {
        timeoutRef.current = null;
      }
      // Limpiar la solicitud en proceso si el componente se desmonta
      solicitudesEnProcesoRef.current.delete(solicitudKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabActiva, serverUrl]);

  // ──────────────── Escuchar eventos de socket para actualización automática ────────────────
  useEffect(() => {
    // eslint-disable-next-line no-undef
    if (!window.socket) return;
    // eslint-disable-next-line no-undef
    const socket = window.socket;

    const handleReportesActualizados = () => {
      // Recargar días cuando se actualicen los reportes (con debounce)
      if (!cargandoDiasRef.current) {
        setTimeout(() => {
          if (!cargandoDiasRef.current) {
            cargarDias();
          }
        }, 500);
      }
    };

    const handleDevolucionesActualizadas = () => {
      // Si se cierra el día de devoluciones, recargar días (con debounce)
      if (!cargandoDiasRef.current) {
        setTimeout(() => {
          if (!cargandoDiasRef.current) {
            cargarDias();
          }
        }, 500);
      }
    };

    socket.on("reportes_actualizados", handleReportesActualizados);
    socket.on("devoluciones_actualizadas", handleDevolucionesActualizadas);

    return () => {
      socket.off("reportes_actualizados", handleReportesActualizados);
      socket.off("devoluciones_actualizadas", handleDevolucionesActualizadas);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl]);

  // ──────────────── Agrupar por mes ────────────────
  const diasPorMes = useMemo(() => {
    const map = {};
    for (const d of dias) {
      const mes = (d.fecha || "").slice(0, 7);
      if (!map[mes]) map[mes] = [];
      map[mes].push(d);
    }
    for (const m of Object.keys(map)) {
      map[m].sort((a, b) => a.fecha.localeCompare(b.fecha));
    }
    return map;
  }, [dias]);

  const mesesOrdenados = useMemo(
    () => Object.keys(diasPorMes).sort((a, b) => b.localeCompare(a)),
    [diasPorMes]
  );

  const abrirCerrarMes = (mes) => {
    setMesAbierto((prev) => (prev === mes ? null : mes));
    setPaginaMes((prev) => ({ ...prev, [mes]: 0 }));
  };

  const getBloqueDias = (mes) => {
    const page = paginaMes[mes] || 0;
    const start = page * 6;
    return (diasPorMes[mes] || []).slice(start, start + 6);
  };

  const navegarMes = (mes, dir) => {
    const total = Math.ceil((diasPorMes[mes]?.length || 0) / 6);
    if (!total) return;
    setPaginaMes((prev) => {
      const cur = prev[mes] || 0;
      const next = (cur + dir + total) % total;
      return { ...prev, [mes]: next };
    });
  };

  // ──────────────── Ver detalle ────────────────
  const verDetalle = async (fecha) => {
    try {
      const data = await authFetch(`${endpointBase}/dia/${fecha}`);
      // Manejar tanto el formato antiguo (array) como el nuevo (objeto con productos y pedidos)
      if (Array.isArray(data)) {
        setDetalle(data || []);
        setPedidos([]);
      } else {
        setDetalle(data.productos || []);
        setPedidos(data.pedidos || []);
      }
      setFechaActualDetalle(fecha);
      setViendoDetalle(true);
    } catch (e) {
      pushToast?.("❌ No se pudo cargar el detalle", "err");
    }
  };

  // ──────────────── Borrar día ────────────────
  const borrarDia = async (fecha) => {
    if (!window.confirm(`¿Eliminar las devoluciones del ${fecha}?`)) return;

    try {
      await authFetch(`${endpointBase}/dia/${fecha}`, { method: "DELETE" });
      pushToast?.("🗑️ Día eliminado correctamente", "ok");
      await cargarDias();
      if (viendoDetalle) setViendoDetalle(false);
    } catch (err) {
      pushToast?.(`⚠️ ${err?.message || "No se pudo eliminar"}`, "warn");
    }
  };

  // ──────────────── Mover reporte ────────────────
  const moverDia = async () => {
    if (!fechaOrigen || !fechaDestino) return pushToast?.("⚠️ Selecciona ambas fechas", "warn");

    if (fechaOrigen === fechaDestino)
      return pushToast?.("⚠️ La fecha destino debe ser diferente", "warn");

    try {
      await authFetch(`${endpointBase}/mover-dia`, {
        method: "PUT",
        body: JSON.stringify({
          fecha_original: fechaOrigen,
          nueva_fecha: fechaDestino,
        }),
      });
      pushToast?.("✅ Reporte movido correctamente", "ok");
      setFechaOrigen("");
      setFechaDestino("");
      await cargarDias();
    } catch {
      pushToast?.("❌ Error al mover el reporte", "err");
    }
  };

  // ──────────────── Exportaciones ────────────────
  const exportarExcel = async (tipo, mes, fecha) => {
    try {
      // Usar rutas separadas por tipo/pestaña
      const endpoint =
        tipo === "dia"
          ? `/${tabActiva}/${fecha}/export`
          : `/${tabActiva}/exportar-${tipo}/${mes}`;

      const { getEncryptedItem } = await import('../../utils/encryptedStorage');
      const token = await getEncryptedItem("token");
      const res = await fetch(`${serverUrl}/reportes-devoluciones${endpoint}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (!res.ok) throw new Error();

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-${tabActiva}-${tipo}-${fecha || mes}.xlsx`;
      a.click();

      pushToast?.("📄 Reporte generado", "ok");
    } catch {
      pushToast?.("❌ Error al generar reporte", "err");
    }
  };

  const fechasConReporte = useMemo(() => new Set(dias.map((d) => d.fecha)), [dias]);

  // Filtrar pedidos por buscador
  const pedidosFiltrados = useMemo(() => {
    if (!buscadorPedido.trim()) return pedidos;
    const busqueda = buscadorPedido.toLowerCase().trim();
    return pedidos.filter(p => 
      p.pedido?.toLowerCase().includes(busqueda) ||
      p.guia?.toLowerCase().includes(busqueda)
    );
  }, [pedidos, buscadorPedido]);

  // Toggle tarjeta apilada
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

  // Cargar fotos de un pedido histórico
  const cargarFotosPedido = async (pedidoId) => {
    try {
      const fotos = await authFetch(`${serverUrl}/reportes-devoluciones/pedidos/${pedidoId}/fotos`);
            if (Array.isArray(fotos)) {
        const urls = fotos.map(f => {
          // Si ya tiene url, usarla; si no, construirla desde path
          if (f.url) return f.url;
          if (f.path) {
            // Construir URL completa
            return `${serverUrl}/uploads/devoluciones/${f.path}`;
          }
          return f;
        });
                return urls;
      }
      return [];
    } catch (err) {
      console.error("Error cargando fotos:", err);
      return [];
    }
  };

  // Abrir detalle de pedido
  const abrirDetallePedido = async (pedido) => {
    const fotos = await cargarFotosPedido(pedido.id);
    setDetallePedido({ ...pedido, fotos });
    setDetallePedidoOpen(true);
  };

  // Abrir modal de productos de un pedido
  const abrirProductosPedido = async (pedido, e) => {
    if (e) e.stopPropagation();
    setProductosPedidoModal({ open: true, pedido, productos: [], loading: true });
    try {
      const productos = await authFetch(`${serverUrl}/reportes-devoluciones/pedidos/${pedido.id}/productos`);
      setProductosPedidoModal({ open: true, pedido, productos: Array.isArray(productos) ? productos : [], loading: false });
    } catch (err) {
      console.error("Error cargando productos:", err);
      setProductosPedidoModal({ open: true, pedido, productos: [], loading: false });
      pushToast?.("❌ Error cargando productos", "err");
    }
  };

  // Borrar pedido
  const borrarPedido = async (pedido) => {
    const fechaPedido = pedido.fecha_cierre || pedido.fecha;
    
    if (!window.confirm(`¿Eliminar el pedido ${pedido.pedido} del ${fechaPedido}?`)) return;

    try {
      await authFetch(`${serverUrl}/devoluciones/clientes/pedidos/${pedido.id}`, { method: "DELETE" });
      pushToast?.("🗑️ Pedido eliminado correctamente", "ok");
      // Recargar el detalle del día
      await verDetalle(fechaActualDetalle);
    } catch (err) {
      pushToast?.(`⚠️ ${err?.message || "No se pudo eliminar el pedido"}`, "warn");
    }
  };

  // Viewer de fotos
  const abrirViewer = (fotosArray, index = 0) => {
    if (!Array.isArray(fotosArray) || !fotosArray.length) return;
    setViewerFotos(fotosArray);
    setViewerIndex(index);
    setViewerOpen(true);
  };

  const cerrarViewer = () => {
    setViewerOpen(false);
    setViewerFotos([]);
    setViewerIndex(0);
  };

  const viewerPrev = () => {
    if (!viewerFotos.length) return;
    setViewerIndex((idx) => (idx === 0 ? viewerFotos.length - 1 : idx - 1));
  };

  const viewerNext = () => {
    if (!viewerFotos.length) return;
    setViewerIndex((idx) => (idx === viewerFotos.length - 1 ? 0 : idx + 1));
  };

  const marcarDiasPicker = () => {
    setTimeout(() => {
      document.querySelectorAll('input[type="date"]').forEach((input) => {
        const val = input.value;
        if (fechasConReporte.has(val)) input.classList.add("day-dot");
        else input.classList.remove("day-dot");
      });
    }, 80);
  };

  return (
    <div className="reportes-wrapper">
      <div className="reportes-card">
        <h2>Reportes de Devoluciones</h2>

        {/* 🔹 PESTAÑAS Y CAMBIAR FECHA */}
        <div className="tabs-and-date-container">
          <div className="tabs-container">
            {pestañas.map((p) => (
              <button
                key={p.key}
                className={`tab-btn ${tabActiva === p.key ? "active" : ""}`}
                onClick={() => setTabActiva(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
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

        {/* Acordeón */}
        {!viendoDetalle ? (
          mesesOrdenados.length === 0 ? (
            <p className="sin-registros">No hay reportes registrados.</p>
          ) : (
            mesesOrdenados.map((mes) => {
              const visible = getBloqueDias(mes);
              const titulo = new Date(mes + "-02").toLocaleDateString("es-MX", {
                year: "numeric",
                month: "long",
              });

              const total = Math.ceil((diasPorMes[mes]?.length || 0) / 6);
              const pag = paginaMes[mes] || 0;

              return (
                <div key={mes} className="mes-bloque">
                  <h3 className="mes-titulo" onClick={() => abrirCerrarMes(mes)}>
                    <span>{titulo}</span>
                    <span>{mesAbierto === mes ? "▲" : "▼"}</span>
                  </h3>

                  {mesAbierto === mes && (
                    <div className="tabla-container">
                      <table className="tabla-reportes">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Total Productos</th>
                            <th>Total Piezas</th>
                            {tabActiva === "clientes" && <th>Total Pedidos</th>}
                            <th>Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visible.map((d) => (
                            <tr key={d.fecha}>
                              <td>{d.fecha}</td>
                              <td>{d.total_productos}</td>
                              <td>{d.total_piezas || 0}</td>
                              {tabActiva === "clientes" && <td>{d.total_pedidos || 0}</td>}
                              <td>
                                <button className="btn-ver" onClick={() => verDetalle(d.fecha)}>📝</button>
                                <button 
                                  className="btn-export" 
                                  onClick={() => exportarExcel("dia", null, d.fecha)}
                                  style={{ margin: '0 4px', padding: '4px 8px', fontSize: '0.85rem' }}
                                  title="Descargar Excel del día"
                                >
                                  ⬇️
                                </button>
                                <button className="btn-borrar" onClick={() => borrarDia(d.fecha)}>🗑️</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {diasPorMes[mes].length > 6 && (
                        <div className="paginacion-6">
                          <button className="btn-mini" onClick={() => navegarMes(mes, -1)}>◀</button>
                          <span className="pag-idx">{pag + 1}/{total}</span>
                          <button className="btn-mini" onClick={() => navegarMes(mes, 1)}>▶</button>
                        </div>
                      )}

                      <div className="bloque-export">
                        <div className="botones-exportar">
                          <button
                            onClick={() => {
                              setReporteDetalladoTipo("q1");
                              setReporteDetalladoMes(mes);
                              setModalReporteDetallado(true);
                            }}
                            className="btn-export"
                            style={{ marginRight: '8px' }}
                          >
                            🌓 Q1
                          </button>

                          <button
                            onClick={() => {
                              setReporteDetalladoTipo("q2");
                              setReporteDetalladoMes(mes);
                              setModalReporteDetallado(true);
                            }}
                            className="btn-export"
                            style={{ marginRight: '8px' }}
                          >
                            🌕 Q2
                          </button>

                          <button
                            onClick={() => {
                              setReporteDetalladoTipo("mes");
                              setReporteDetalladoMes(mes);
                              setModalReporteDetallado(true);
                            }}
                            className="btn-export"
                          >
                            📅 Mes
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )
        ) : (
          <div className="tabla-container">
            <button className="btn-volver" onClick={() => setViendoDetalle(false)}>
              ← Volver
            </button>

            <button
              className="btn-export"
              onClick={() => {
                const fecha = fechaActualDetalle || detalle[0]?.fecha;
                if (!fecha) {
                  showAlert("Sin fecha para exportar", "warning");
                  return;
                }
                exportarExcel("dia", null, fecha);
              }}
              style={{ marginLeft: '10px' }}
            >
              ⬇ Descargar Excel
            </button>

            {/* APARTADO DE PEDIDOS - Solo para Clientes - TARJETAS APILADAS */}
            {tabActiva === "clientes" && (
              <div style={{ marginBottom: "30px" }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h2 className="titulo-pedidos">
                    📦 Pedidos del Día ({pedidos.length})
                  </h2>
                  {pedidos.length > 0 && (
                    <input
                      type="text"
                      placeholder="🔍 Buscar pedido o guía..."
                      value={buscadorPedido}
                      onChange={(e) => setBuscadorPedido(e.target.value)}
                      className="buscador-pedidos"
                    />
                  )}
                </div>
                {pedidosFiltrados.length > 0 ? (
                  <div style={{ 
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    marginBottom: '20px',
                    maxHeight: '70vh',
                    overflowY: 'auto',
                    paddingRight: '8px'
                  }}>
                    {pedidosFiltrados.map((p) => {
                      const estaAbierto = pedidosAbiertos.has(p.id);
                      const fechaPedido = p.fecha_cierre || p.fecha;
                      
                      return (
                        <div
                          key={`pedido-${p.id}`}
                          className="dia-row tarjeta-pedido"
                          style={{
                            gridTemplateColumns: estaAbierto ? '1fr' : '1.2fr 0.8fr 0.8fr 0.8fr'
                          }}
                        >
                          {/* HEADER - Siempre visible */}
                          <div
                            onClick={() => togglePedido(p.id)}
                            style={{
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gridColumn: estaAbierto ? '1' : '1 / -1',
                              padding: estaAbierto ? '0' : '0'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                              <span className="date-pill">
                                {p.pedido}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span className="fecha-pedido">
                                {fechaPedido}
                              </span>
                              <span className="flecha-pedido" style={{ transform: estaAbierto ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                                {estaAbierto ? '▴' : '▾'}
                              </span>
                            </div>
                          </div>
                          
                          {/* CONTENIDO - Solo visible cuando está abierto */}
                          {estaAbierto && (
                            <div className="contenido-pedido">
                              <div className="info-pedido">
                                <div><strong>Guía:</strong> {p.guia || "–"}</div>
                                <div><strong>Paquetería:</strong> {p.paqueteria || "–"}</div>
                                <div><strong>Motivo:</strong> {p.motivo || "–"}</div>
                                {p.usuario && <div><strong>Usuario:</strong> {p.usuario}</div>}
                              </div>
                              
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button
                                  onClick={(e) => abrirDetallePedido(p)}
                                  className="btn-primary"
                                  style={{
                                    flex: 1,
                                    minWidth: '120px'
                                  }}
                                >
                                  📷 Ver Fotos
                                </button>
                                <button
                                  onClick={(e) => abrirProductosPedido(p, e)}
                                  className="btn-primary"
                                  style={{
                                    flex: 1,
                                    minWidth: '120px'
                                  }}
                                >
                                  📦 Ver Productos
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    borrarPedido(p);
                                  }}
                                  className="btn-borrar"
                                  style={{
                                    minWidth: '100px'
                                  }}
                                  title="Eliminar pedido"
                                >
                                  🗑️ Borrar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="sin-productos">
                    {buscadorPedido ? "No se encontraron pedidos con ese criterio" : "No hay pedidos registrados para este día"}
                  </div>
                )}
              </div>
            )}

            <h3 className="seccion-titulo">Productos ({detalle.length})</h3>
            <table className="tabla-reportes">
              <thead>
                <tr>
                  {tabActiva === "calidad" && <th>Área</th>}
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Cantidad</th>
                  <th>Lote</th>
                  <th>Hora Última</th>
                </tr>
              </thead>
              <tbody>
                {detalle.length > 0 ? (
                  detalle.map((p) => (
                    <tr key={`${p.id}-${p.codigo}`}>
                      {tabActiva === "calidad" && <td>{p.area || "—"}</td>}
                      <td>{p.codigo}</td>
                      <td>{p.nombre}</td>
                      <td>{p.cantidad}</td>
                      <td>{p.lote}</td>
                      <td>{p.hora_ultima}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={tabActiva === "calidad" ? "6" : "5"} className="sin-productos">No hay productos</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===========================================
          MODAL DETALLE DE PEDIDO CON FOTOS
      =========================================== */}
      {detallePedidoOpen && detallePedido && (
        <div 
          className="devModalFondo" 
          onClick={() => {
            setDetallePedidoOpen(false);
            setDetallePedido(null);
          }}
        >
          <div 
            className="devModal devModalGrande"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(90vw, 1200px)',
              maxWidth: '1200px'
            }}
          >
            <div className="devModalHeader">
              <h3>Pedido {detallePedido.pedido}</h3>
              <button onClick={() => {
                setDetallePedidoOpen(false);
                setDetallePedido(null);
              }}>✕</button>
            </div>
            
            <div className="devModalBody">
              <div className="info-pedido-detalle">
                <div><strong>Fecha:</strong> {detallePedido.fecha_cierre || detallePedido.fecha}</div>
                <div><strong>Guía:</strong> {detallePedido.guia || "–"}</div>
                <div><strong>Paquetería:</strong> {detallePedido.paqueteria || "–"}</div>
                <div><strong>Motivo:</strong> {detallePedido.motivo || "–"}</div>
              </div>
              
              <hr className="separador-modal" />
              
              <strong className="titulo-fotos">
                Fotos: {detallePedido.fotos?.length || 0}
              </strong>
              <div className="thumbs" style={{ marginTop: 6, display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {(detallePedido.fotos && detallePedido.fotos.length > 0) ? (
                  detallePedido.fotos.map((src, i) => (
                    <div 
                      key={i} 
                      className="thumb thumb-foto"
                      onClick={() => abrirViewer(detallePedido.fotos, i)}
                      onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      <img 
                        src={src} 
                        alt={`Foto ${i + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          console.error(`❌ Error cargando foto ${i + 1}:`, src);
                          e.target.style.display = 'none';
                          const errorDiv = document.createElement('div');
                          errorDiv.className = 'error-foto';
                          errorDiv.textContent = 'Error cargando';
                          e.target.parentElement.innerHTML = '';
                          e.target.parentElement.appendChild(errorDiv);
                        }}
                        onLoad={() => {}}
                      />
                    </div>
                  ))
                ) : (
                  <div className="sin-fotos">
                    Sin fotos disponibles para este pedido
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===========================================
          MODAL VIEWER DE FOTOS
      =========================================== */}
      {viewerOpen && (
        <div 
          className="devModalFondo"
          onClick={cerrarViewer}
          style={{ zIndex: 4000 }}
        >
          <div 
            className="devModal devModalViewer"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="devModalHeader">
              <h3>Fotos del pedido</h3>
              <button onClick={cerrarViewer}>✕</button>
            </div>
            
            <div className="devModalBody" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '30px', gap: '20px' }}>
              {viewerFotos.length > 0 && (
                <>
                  <div className="viewer-imagen-container">
                    <img
                      src={viewerFotos[viewerIndex]}
                      alt={`Foto ${viewerIndex + 1}`}
                      className="viewer-imagen"
                    />
                  </div>
                  
                  <div className="viewer-controles">
                    <button 
                      onClick={viewerPrev}
                      className="btn-viewer"
                    >
                      ◀ Anterior
                    </button>
                    <span className="viewer-contador">
                      {viewerIndex + 1} / {viewerFotos.length}
                    </span>
                    <button 
                      onClick={viewerNext}
                      className="btn-viewer"
                    >
                      Siguiente ▶
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===========================================
          MODAL PRODUCTOS DE UN PEDIDO
      =========================================== */}
      {productosPedidoModal.open && (
        <div 
          className="devModalFondo" 
          onClick={() => {
            setProductosPedidoModal({ open: false, pedido: null, productos: [], loading: false });
          }}
        >
          <div 
            className="devModal devModalGrande"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(90vw, 1200px)',
              maxWidth: '1200px'
            }}
          >
            <div className="devModalHeader">
              <h3>Productos del Pedido {productosPedidoModal.pedido?.pedido}</h3>
              <button onClick={() => {
                setProductosPedidoModal({ open: false, pedido: null, productos: [], loading: false });
              }}>✕</button>
            </div>
            
            <div className="devModalBody" style={{ overflow: 'auto' }}>
              {productosPedidoModal.loading ? (
                <div className="devModalMensaje">Cargando productos...</div>
              ) : productosPedidoModal.productos.length === 0 ? (
                <div className="devModalMensaje">No hay productos en este pedido</div>
              ) : (
                <table className="devModalTable" style={{ fontSize: '0.95rem' }}>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Nombre</th>
                      <th>Presentación</th>
                      <th>Lote</th>
                      <th style={{ textAlign: 'center' }}>Cantidad</th>
                      <th>Caducidad</th>
                      <th style={{ textAlign: 'center' }}>Apto</th>
                      <th style={{ textAlign: 'center' }}>Activo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosPedidoModal.productos.map((prod, i) => (
                      <tr key={prod.id || i}>
                        <td>{prod.codigo || "–"}</td>
                        <td>{prod.nombre || "–"}</td>
                        <td>{prod.presentacion || "–"}</td>
                        <td>{prod.lote || "–"}</td>
                        <td style={{ textAlign: 'center' }}>{prod.cantidad || 0}</td>
                        <td>{prod.caducidad || "–"}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={prod.apto === 1 ? "badge-apto" : "badge-no-apto"}>
                            {prod.apto === 1 ? "Apto" : "No apto"}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={prod.activo === 1 ? "badge-activo" : "badge-inactivo"}>
                            {prod.activo === 1 ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            
            <div className="devModalFooter">
              <button 
                onClick={() => {
                  setProductosPedidoModal({ open: false, pedido: null, productos: [], loading: false });
                }}
                className="btn-secundario"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Reporte Detallado */}
      {modalReporteDetallado && reporteDetalladoTipo && reporteDetalladoMes && (
        <div className="reportes-modal-ov" onClick={(e) => {
          if (e.target.className === "reportes-modal-ov") {
            setModalReporteDetallado(false);
          }
        }}>
          <div className="reportes-modal-content" onClick={(e) => e.stopPropagation()}>
            <ReporteDetalladoDevoluciones
              tipo={reporteDetalladoTipo}
              periodo={reporteDetalladoMes}
              SERVER_URL={serverUrl}
              onClose={() => setModalReporteDetallado(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
