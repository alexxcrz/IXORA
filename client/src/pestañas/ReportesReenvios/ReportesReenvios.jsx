import React, { useEffect, useMemo, useState } from "react";
import "./ReportesReenvios.css";
import { authFetch } from "../../AuthContext";
import { useAlert } from "../../components/AlertModal";
import { getServerUrl } from "../../config/server";

export default function ReportesReenvios({ serverUrl, SERVER_URL, socket }) {
  const SERVER = serverUrl || SERVER_URL || getServerUrl();
  const { showAlert, showConfirm } = useAlert();
  const [meses, setMeses] = useState({});
  const [mesAbierto, setMesAbierto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paginaMes, setPaginaMes] = useState({});

  const [modalEdit, setModalEdit] = useState(false);
  const [diaSel, setDiaSel] = useState(null);
  const [dataEdit, setDataEdit] = useState([]);
  const [fechaOrigen, setFechaOrigen] = useState("");
  const [fechaDestino, setFechaDestino] = useState("");

  // Viewer de fotos
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerFotos, setViewerFotos] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const fmtDMY = (f) => (f ? f.split("-").reverse().join("/") : "");

  // ==========================================================
  // CARGAR REPORTE PRINCIPAL
  // ==========================================================
  const cargarReportes = async () => {
    try {
      setLoading(true);
      const data = await authFetch(`${SERVER}/api/reenvios/reportes`);
      setMeses(data || {});
      // No abrir automáticamente ningún mes
    } catch (err) {
      console.error("❌ Error cargando reportes:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarReportes();
  }, [SERVER]);

  // ==========================================================
  // ESCUCHAR EVENTOS DE SOCKET PARA ACTUALIZACIÓN AUTOMÁTICA
  // ==========================================================
  useEffect(() => {
    if (!socket) return;

    const handleReenviosActualizados = () => {
      // Pequeño delay para asegurar que el servidor haya completado la transacción
      setTimeout(() => {
        cargarReportes();
      }, 200);
    };

    const handleReportesActualizados = () => {
      setTimeout(() => {
        cargarReportes();
      }, 200);
    };

    socket.on("reenvios_actualizados", handleReenviosActualizados);
    socket.on("reportes_actualizados", handleReportesActualizados);

    return () => {
      socket.off("reenvios_actualizados", handleReenviosActualizados);
      socket.off("reportes_actualizados", handleReportesActualizados);
    };
  }, [socket, SERVER]);

  const listaMeses = useMemo(
    () => Object.keys(meses || {}).sort().reverse(),
    [meses]
  );

  // ==========================================================
  // ABRIR DÍA PARA EDITAR
  // ==========================================================
  const abrirEditar = async (fecha) => {
    setDiaSel(fecha);
    try {
      const data = await authFetch(`${SERVER}/api/reenvios/dia/${fecha}`);
      setDataEdit(Array.isArray(data) ? data : []);
      setModalEdit(true);
    } catch {
      showAlert("Error cargando detalle", "error");
    }
  };

  // ==========================================================
  // VIEWER DE FOTOS
  // ==========================================================
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
    setViewerIndex((idx) =>
      idx === viewerFotos.length - 1 ? 0 : idx + 1
    );
  };

  // ==========================================================
  // GUARDAR EDICIÓN (uno por uno)
  // ==========================================================
  const guardarCambios = async () => {
    try {
      for (const item of dataEdit) {
        await authFetch(`${SERVER}/api/reenvios/${item.id}/editar-reporte`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
      }

      showAlert("Cambios guardados", "success");
      setModalEdit(false);
      cargarReportes();
    } catch (err) {
      console.error("Error guardando:", err);
      showAlert("Error guardando: " + (err.message || "Error desconocido"), "error");
    }
  };

  // ==========================================================
  // BORRAR REENVÍO
  // ==========================================================
  const borrarReenvio = async (id, pedido) => {
    const confirmado = await showConfirm(`¿Estás seguro de eliminar el reenvío ${pedido}? Esta acción no se puede deshacer.`, "Confirmar eliminación");
    if (!confirmado) {
      return;
    }

    try {
      await authFetch(`${SERVER}/api/reenvios/${id}`, {
        method: "DELETE"
      });
      await showAlert("✅ Reenvío eliminado", "success");
      cargarReportes();
      setModalEdit(false);
    } catch (err) {
      // Si es un error 404 (not found), manejar silenciosamente
      if (err.isNotFound || err.message?.includes("404") || err.message?.includes("no encontrado") || err.message?.includes("Not Found") || err.message?.includes("No encontrado")) {
        showAlert("ℹ️ El reenvío ya no existe o fue eliminado previamente", "info");
        cargarReportes();
        setModalEdit(false);
        return; // Salir silenciosamente sin loguear error
      }
      
      // Solo loguear errores que no sean 404
      console.error("Error eliminando:", err);
      const errorMessage = err.message || err.toString() || "";
      showAlert("❌ Error al eliminar: " + errorMessage, "error");
    }
  };

  // ==========================================================
  // BORRAR DÍA
  // ==========================================================
  const borrarDia = async (fecha) => {
    const confirmado = await showConfirm(
      `¿Estás seguro de eliminar el día ${fmtDMY(fecha)}? Esta acción eliminará todos los reenvíos de ese día y no se puede deshacer.`,
      "Confirmar eliminación"
    );
    if (!confirmado) {
      return;
    }

    try {
      // Primero obtener todos los reenvíos del día para eliminarlos
      const reenviosDelDia = await authFetch(`${SERVER}/api/reenvios/dia/${fecha}`);
      
      if (Array.isArray(reenviosDelDia) && reenviosDelDia.length > 0) {
        // Eliminar cada reenvío del día
        for (const reenvio of reenviosDelDia) {
          try {
            await authFetch(`${SERVER}/api/reenvios/${reenvio.id}`, {
              method: "DELETE"
            });
          } catch (err) {
            // Continuar aunque falle alguno
            console.warn(`Error eliminando reenvío ${reenvio.id}:`, err);
          }
        }
      }

      // Eliminar del histórico
      await authFetch(`${SERVER}/api/reenvios/reportes/borrar-dia`, {
        method: "DELETE",
        body: JSON.stringify({ fecha })
      });

      await showAlert(`✅ Día ${fmtDMY(fecha)} eliminado correctamente`, "success");
      cargarReportes();
    } catch (err) {
      console.error("Error eliminando día:", err);
      showAlert("❌ Error al eliminar el día: " + (err.message || "Error desconocido"), "error");
    }
  };

  // ==========================================================
  // DESCARGAS
  // ==========================================================
  const descargarDia = (f) => {
    window.open(`${SERVER}/api/reenvios/exportar-dia/${f}`, "_blank");
  };

  const descargarMes = (m) => {
    window.open(`${SERVER}/api/reenvios/exportar-mes/${m}`, "_blank");
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
      await authFetch(`${SERVER}/api/reenvios/reportes/mover-dia`, {
        method: "PUT",
        body: JSON.stringify({
          fecha_original: fechaOrigen,
          nueva_fecha: fechaDestino,
        }),
      });
      await showAlert("✅ Reporte movido correctamente", "success");
      setFechaOrigen("");
      setFechaDestino("");
      cargarReportes();
    } catch {
      showAlert("❌ Error al mover el reporte", "error");
    }
  };

  const marcarDiasPicker = () => {
    setTimeout(() => {
      document.querySelectorAll('input[type="date"]').forEach((input) => {
        const val = input.value;
        const fechaExiste = Object.values(meses).some(dias => 
          Array.isArray(dias) && dias.some(d => d.fecha === val)
        );
        if (fechaExiste) input.classList.add("day-dot");
        else input.classList.remove("day-dot");
      });
    }, 80);
  };

  // ==========================================================
  // RENDER
  // ==========================================================
  return (
    <div className="reportes-wrap">
      <div className="header-row">
        <h2>Reportes de Reenvíos</h2>
        <button className="btn" onClick={cargarReportes}>
          ↻ Actualizar
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

      {loading && <div className="cargando">Cargando reportes…</div>}

      {!loading && listaMeses.length === 0 && (
        <div className="sinDatos">No hay datos en el histórico.</div>
      )}

      <div className="meses-list">
        {listaMeses.map((mKey) => {
          const abierto = mesAbierto === mKey;
          const dias = meses[mKey] || [];

          const diasOrd = [...dias].sort((a, b) =>
            b.fecha.localeCompare(a.fecha)
          );

          const totalDias = diasOrd.length;
          const page = paginaMes[mKey] || 0;
          const maxPage = Math.max(0, Math.floor((totalDias - 1) / 6));

          let nombreMes = mKey;
          try {
            const [y, mo] = mKey.split("-");
            nombreMes = new Date(parseInt(y), parseInt(mo) - 1).toLocaleString(
              "es-MX",
              { month: "long", year: "numeric" }
            );
            nombreMes = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);
          } catch {}

          return (
            <div key={mKey} className={`mes-card ${abierto ? "open" : ""}`}>
              <div
                className="mes-header"
                onClick={() => {
                  setMesAbierto((prev) => (prev === mKey ? null : mKey));
                  setPaginaMes((prev) => ({ ...prev, [mKey]: 0 }));
                }}
              >
                <span className="mes-txt">{nombreMes}</span>
                <span className="mes-total">{totalDias} días</span>
                <div className="mes-actions">
                  <button
                    className="btn-small"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`${SERVER}/api/reenvios/exportar-q1/${mKey}`, "_blank");
                    }}
                  >
                    Q1
                  </button>
                  <button
                    className="btn-small"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`${SERVER}/api/reenvios/exportar-q2/${mKey}`, "_blank");
                    }}
                  >
                    Q2
                  </button>
                  <button
                    className="btn-small"
                    onClick={(e) => {
                      e.stopPropagation();
                      descargarMes(mKey);
                    }}
                  >
                    Mes
                  </button>
                </div>
                <span className="chev">{abierto ? "▴" : "▾"}</span>
              </div>

              {abierto && (
                <div className="mes-body">
                  <div className="dias-head">
                    <div className="col-fecha">Fecha</div>
                    <div className="col-tp">Reenvíos</div>
                    <div className="col-tz">Fotos</div>
                    <div className="col-tp">FedEx</div>
                    <div className="col-tp">DHL</div>
                    <div className="col-tp">Estafeta</div>
                    <div className="col-acc">Acciones</div>
                  </div>

                  <div className="dias-block">
                    {diasOrd
                      .slice(page * 6, page * 6 + 6)
                      .map((d) => (
                        <div key={d.fecha} className="dia-row">
                          <div className="col-fecha">
                            <span className="date-pill">{fmtDMY(d.fecha)}</span>
                          </div>
                          <div className="col-tp">{d.total_envios ?? 0}</div>
                          <div className="col-tz">{d.total_fotos ?? 0}</div>
                          <div className="col-tp">{d.fedex ?? 0}</div>
                          <div className="col-tp">{d.dhl ?? 0}</div>
                          <div className="col-tp">{d.estafeta ?? 0}</div>
                          <div className="col-acc">
                            <button
                              className="btn-primary"
                              onClick={() => abrirEditar(d.fecha)}
                            >
                              Editar
                            </button>
                            <button
                              className="btn-borrar"
                              onClick={() => descargarDia(d.fecha)}
                              title="Descargar Excel del día"
                            >
                              ⬇
                            </button>
                            <button
                              className="btn-borrar"
                              onClick={() => borrarDia(d.fecha)}
                              title="Borrar día completo"
                              style={{
                                background: "#e74c3c",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                padding: "6px 12px",
                                cursor: "pointer",
                                fontSize: "0.85rem",
                                fontWeight: "600",
                                marginLeft: "6px"
                              }}
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>

                  {/* PAGINACIÓN */}
                  {totalDias > 6 && (
                    <div className="pager">
                      <button
                        className="btn-plain"
                        onClick={() =>
                          setPaginaMes((p) => ({
                            ...p,
                            [mKey]: Math.max((p[mKey] || 0) - 1, 0),
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
                            [mKey]: Math.min((p[mKey] || 0) + 1, maxPage),
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

      {/* =======================================================
          MODAL EDICIÓN
      ======================================================= */}
      {modalEdit && (
        <div className="reportes-modal-ov" onClick={() => setModalEdit(false)}>
          <div
            className="reportes-modal edit"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="reportes-modal-head">
              <h4>Editar reporte del {fmtDMY(diaSel)}</h4>
              <button className="btn-plain" onClick={() => setModalEdit(false)}>
                ✕
              </button>
            </div>

            <div className="reportes-modal-body">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Paquetería</th>
                    <th>Guía</th>
                    <th>Motivo</th>
                    <th>Estatus</th>
                    <th>Fotos</th>
                    <th>Acción</th>
                  </tr>
                </thead>

                <tbody>
                  {dataEdit.map((row, i) => (
                    <tr key={row.id}>
                      <td>{row.pedido}</td>
                      <td>
                        <input
                          value={row.paqueteria || ""}
                          onChange={(e) => {
                            const arr = [...dataEdit];
                            arr[i].paqueteria = e.target.value;
                            setDataEdit(arr);
                          }}
                        />
                      </td>
                      <td>
                        <input
                          value={row.guia || ""}
                          onChange={(e) => {
                            const arr = [...dataEdit];
                            arr[i].guia = e.target.value;
                            setDataEdit(arr);
                          }}
                        />
                      </td>
                      <td>
                        <textarea
                          rows={1}
                          value={row.observaciones || ""}
                          onChange={(e) => {
                            const arr = [...dataEdit];
                            arr[i].observaciones = e.target.value;
                            setDataEdit(arr);
                          }}
                        />
                      </td>
                      <td>
                        <input
                          value={row.estatus || ""}
                          onChange={(e) => {
                            const arr = [...dataEdit];
                            arr[i].estatus = e.target.value;
                            setDataEdit(arr);
                          }}
                        />
                      </td>
                      <td>
                        {row.fotos && row.fotos.length > 0 ? (
                          <div className="thumbs">
                            {row.fotos.map((src, idx) => (
                              <div
                                key={idx}
                                className="thumb"
                                onClick={() => abrirViewer(row.fotos, idx)}
                              >
                                <img src={src} alt={`Foto ${idx + 1}`} />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: "#999", fontSize: "0.85rem" }}>
                            Sin fotos
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn-borrar"
                          onClick={() => borrarReenvio(row.id, row.pedido)}
                          style={{
                            padding: "6px 12px",
                            background: "#e74c3c",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "0.85rem",
                            fontWeight: "600"
                          }}
                        >
                          🗑️ Borrar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="reportes-modal-foot">
              <button className="btn-primary" onClick={guardarCambios}>
                Guardar cambios
              </button>
              <button
                className="btn-plain"
                onClick={() => descargarDia(diaSel)}
                style={{ marginLeft: '10px' }}
              >
                ⬇ Descargar Excel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =======================================================
          MODAL VIEWER DE FOTOS
      ======================================================= */}
      {viewerOpen && (
        <div className="reportes-modal-ov" onClick={cerrarViewer}>
          <div
            className="reportes-modal viewer-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="reportes-modal-head">
              <h4>Fotos del reenvío</h4>
              <button className="btn-plain" onClick={cerrarViewer}>
                ✕
              </button>
            </div>

            <div className="reportes-modal-body viewer-body">
              {viewerFotos.length > 0 && (
                <>
                  <div className="viewer-img-wrap">
                    <img
                      src={viewerFotos[viewerIndex]}
                      alt={`Foto ${viewerIndex + 1}`}
                      className="viewer-img"
                    />
                  </div>

                  <div className="viewer-controls">
                    <button className="btn" onClick={viewerPrev}>
                      ◀
                    </button>
                    <span>
                      {viewerIndex + 1} / {viewerFotos.length}
                    </span>
                    <button className="btn" onClick={viewerNext}>
                      ▶
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
