import React, { useState, useEffect, useMemo, useCallback } from "react";
import "./ReportesActivaciones.css";
import { useAuth } from "../../AuthContext";
import { useAlert } from "../../components/AlertModal";

export default function ReportesActivaciones({ SERVER_URL }) {
  const { authFetch } = useAuth();
  const { showAlert, showConfirm } = useAlert();

  const [diasCerrados, setDiasCerrados] = useState([]);
  const [mesAbierto, setMesAbierto] = useState(null);
  const [paginaMes, setPaginaMes] = useState({});
  const [cargando, setCargando] = useState(true);

  // Modal de detalle
  const [modalDetalle, setModalDetalle] = useState(false);
  const [fechaDetalle, setFechaDetalle] = useState(null);
  const [registrosDetalle, setRegistrosDetalle] = useState([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  // Cargar días cerrados
  const cargarDias = useCallback(async () => {
    try {
      setCargando(true);
      const data = await authFetch(`${SERVER_URL}/activaciones/reportes/dias`);
      setDiasCerrados(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error cargando días:", err);
      setDiasCerrados([]);
    } finally {
      setCargando(false);
    }
  }, [SERVER_URL, authFetch]);

  useEffect(() => {
    cargarDias();
  }, [cargarDias]);

  // Socket para tiempo real
  useEffect(() => {
    const socket = window.socket;

    const handleActualizacion = () => {
      cargarDias();
    };

    socket.on("reportes_activaciones_actualizados", handleActualizacion);

    return () => {
      socket.off("reportes_activaciones_actualizados", handleActualizacion);
    };
  }, [SERVER_URL, cargarDias]);

  // Agrupar días por mes
  const diasPorMes = useMemo(() => {
    const map = {};
    for (const d of diasCerrados) {
      const fecha = d.fecha || "";
      const mes = fecha.slice(0, 7);
      if (!map[mes]) map[mes] = [];
      map[mes].push(d);
    }
    // Ordenar días dentro de cada mes (más reciente primero)
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))
    );
    return map;
  }, [diasCerrados]);

  // Lista de meses ordenados (más reciente primero)
  const listaMeses = useMemo(() => {
    return Object.keys(diasPorMes).sort((a, b) => b.localeCompare(a));
  }, [diasPorMes]);

  // Formatear fecha
  const formatearFecha = (fecha) => {
    if (!fecha) return "-";
    try {
      return fecha.split("-").reverse().join("/");
    } catch {
      return fecha;
    }
  };

  // Formatear nombre del mes
  const formatearMes = (mesKey) => {
    if (!mesKey || !mesKey.includes("-")) return mesKey;
    try {
      const [year, month] = mesKey.split("-").map(Number);
      const date = new Date(year, month - 1, 1);
      return date.toLocaleString("es-MX", { month: "long", year: "numeric" });
    } catch {
      return mesKey;
    }
  };

  // Ver detalle de un día
  const verDetalle = async (fecha) => {
    try {
      setCargandoDetalle(true);
      setFechaDetalle(fecha);
      setModalDetalle(true);

      const data = await authFetch(`${SERVER_URL}/activaciones/reportes/dia/${fecha}`);
      setRegistrosDetalle(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error cargando detalle:", err);
      showAlert("Error al cargar el detalle del día", "error");
    } finally {
      setCargandoDetalle(false);
    }
  };

  // Eliminar día
  const eliminarDia = async (fecha) => {
    const confirmado = await showConfirm(
      `¿Eliminar permanentemente el día ${formatearFecha(fecha)}?`,
      "Confirmar eliminación"
    );
    if (!confirmado) return;

    try {
      await authFetch(`${SERVER_URL}/activaciones/reportes/dia/${fecha}`, {
        method: "DELETE"
      });
      showAlert("Día eliminado correctamente", "success");
      cargarDias();
    } catch (err) {
      console.error("Error eliminando día:", err);
      showAlert("Error al eliminar el día", "error");
    }
  };

  // Cerrar modal
  const cerrarModal = () => {
    setModalDetalle(false);
    setFechaDetalle(null);
    setRegistrosDetalle([]);
  };

  // Obtener color de estatus
  const getEstatusColor = (estatus) => {
    switch (estatus) {
      case "Cerrado": return "#22c55e";
      case "Pendiente": return "#f59e0b";
      case "Parcializado": return "#f97316";
      case "No Aplica": return "#ef4444";
      default: return "#6b7280";
    }
  };

  return (
    <div className="reportes-activaciones-container">
      <h2>Reportes de Activaciones</h2>

      {cargando ? (
        <div className="reportes-cargando">
          <span>Cargando reportes...</span>
        </div>
      ) : listaMeses.length === 0 ? (
        <div className="reportes-vacio">
          <span>📊</span>
          <p>No hay días cerrados de activaciones</p>
        </div>
      ) : (
        <div className="meses-lista">
          {listaMeses.map((mesKey) => {
            const abierto = mesAbierto === mesKey;
            const dias = diasPorMes[mesKey] || [];
            const total = dias.length;
            const page = paginaMes[mesKey] || 0;
            const maxPage = Math.max(0, Math.floor((total - 1) / 6));

            return (
              <div key={mesKey} className={`mes-card-rep ${abierto ? "open" : ""}`}>
                <button
                  className="mes-header-rep"
                  onClick={() => setMesAbierto(prev => prev === mesKey ? null : mesKey)}
                >
                  <span className="mes-txt-rep">{formatearMes(mesKey)}</span>
                  <span className="mes-total-rep">{total} días</span>
                  <span className="chev-rep">{abierto ? "▴" : "▾"}</span>
                </button>

                {abierto && (
                  <div className="mes-body-rep">
                    <div className="dias-head-rep">
                      <div className="col-fecha-rep">Fecha</div>
                      <div className="col-registros-rep">Registros</div>
                      <div className="col-piezas-rep">Piezas</div>
                      <div className="col-acc-rep">Acciones</div>
                    </div>

                    <div className="dias-block-rep">
                      {dias.slice(page * 6, page * 6 + 6).map((d) => (
                        <div key={d.fecha} className="dia-row-rep">
                          <div className="col-fecha-rep">
                            <span className="date-pill-rep">{formatearFecha(d.fecha)}</span>
                          </div>
                          <div className="col-registros-rep">{d.total_registros || 0}</div>
                          <div className="col-piezas-rep">{d.total_piezas || 0}</div>
                          <div className="col-acc-rep">
                            <button
                              className="btn-ver-rep"
                              onClick={() => verDetalle(d.fecha)}
                            >
                              👁️ Ver
                            </button>
                            <button
                              className="btn-borrar-rep"
                              onClick={() => eliminarDia(d.fecha)}
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {total > 6 && (
                      <div className="pager-rep">
                        <button
                          className="btn-plain-rep"
                          onClick={() => setPaginaMes(p => ({
                            ...p,
                            [mesKey]: Math.max((p[mesKey] || 0) - 1, 0)
                          }))}
                          disabled={page === 0}
                        >
                          ◀
                        </button>
                        <span>{page + 1} / {maxPage + 1}</span>
                        <button
                          className="btn-plain-rep"
                          onClick={() => setPaginaMes(p => ({
                            ...p,
                            [mesKey]: Math.min((p[mesKey] || 0) + 1, maxPage)
                          }))}
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
      )}

      {/* Modal de detalle */}
      {modalDetalle && (
        <div className="modal-overlay-rep" onClick={cerrarModal}>
          <div className="modal-rep" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-rep">
              <h3>Detalle del {formatearFecha(fechaDetalle)}</h3>
              <button className="btn-cerrar-rep" onClick={cerrarModal}>×</button>
            </div>

            <div className="modal-body-rep">
              {cargandoDetalle ? (
                <div className="cargando-detalle">Cargando...</div>
              ) : registrosDetalle.length === 0 ? (
                <div className="sin-registros">No hay registros para este día</div>
              ) : (
                <div className="tabla-detalle-container">
                  <table className="tabla-detalle-rep">
                    <thead>
                      <tr>
                        <th>Pedido</th>
                        <th>Producto</th>
                        <th>Piezas</th>
                        <th>Área</th>
                        <th>Hora Solicitud</th>
                        <th>Hora Activación</th>
                        <th>Estatus</th>
                        <th>Usuario</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registrosDetalle.map((r) => (
                        <tr key={r.id}>
                          <td>{r.pedido}</td>
                          <td>
                            <div>
                              <span>{r.producto}</span>
                              {r.presentacion && (
                                <small style={{ display: "block", color: "var(--texto-secundario)" }}>
                                  {r.presentacion}
                                </small>
                              )}
                            </div>
                          </td>
                          <td>{r.piezas}</td>
                          <td>{r.area}</td>
                          <td>{r.hora_solicitud || "-"}</td>
                          <td>{r.hora_activacion || "-"}</td>
                          <td>
                            <span
                              className="estatus-badge"
                              style={{ backgroundColor: getEstatusColor(r.estatus) }}
                            >
                              {r.estatus || "-"}
                            </span>
                          </td>
                          <td>{r.usuario || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
