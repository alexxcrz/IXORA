import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import "./Devoluciones.css";
import DevolucionesProceso from "./DevolucionesProceso";
import ControlCalidad from "./ControlCalidad";

import { useAuth } from "../../AuthContext";
import { useNotifications } from "../../components/Notifications";
import { useAlert } from "../../components/AlertModal";

// Componente para el botón de activación de clientes
function BotonActivacionClientes({ serverUrl, pushToast, socket }) {
  const { authFetch, perms } = useAuth();
  const { addNotification } = useNotifications();
  const { showConfirm } = useAlert();
  const can = (perm) => perms?.includes(perm);
  const buttonRef = useRef(null);
  const [resumenModal, setResumenModal] = useState({
    open: false,
    loading: false,
    data: [],
  });
  const [cantidades, setCantidades] = useState({});
  const [caducidades, setCaducidades] = useState({});

  const recargarResumenModal = useCallback(async () => {
    if (!resumenModal.open) return;
    setResumenModal(prev => ({ ...prev, loading: true }));
    try {
      const data = await authFetch(`${serverUrl}/devoluciones/clientes/productos/resumen?area=Clientes`);
      setResumenModal({
        open: true,
        loading: false,
        data: Array.isArray(data) ? data : []
      });
    } catch (err) {
      console.error("❌ Error recargando resumen:", err);
      setResumenModal(prev => ({ ...prev, loading: false }));
    }
  }, [resumenModal.open, serverUrl, authFetch]);

  // Escuchar eventos de socket para actualización en tiempo real
  useEffect(() => {
    if (!socket) return;

    const handleDevolucionesActualizadas = () => {
      // Si el modal está abierto, recargar los datos
      if (resumenModal.open) {
        recargarResumenModal();
      }
    };

    const handleProductosActualizados = () => {
      // Si el modal está abierto, recargar los datos
      if (resumenModal.open) {
        recargarResumenModal();
      }
    };

    socket.on("devoluciones_actualizadas", handleDevolucionesActualizadas);
    socket.on("productos_actualizados", handleProductosActualizados);

    return () => {
      socket.off("devoluciones_actualizadas", handleDevolucionesActualizadas);
      socket.off("productos_actualizados", handleProductosActualizados);
    };
  }, [socket, resumenModal.open, recargarResumenModal]); // Usar recargarResumenModal como dependencia

  const abrirResumen = async () => {
        // Abrir el modal inmediatamente
    setResumenModal({ open: true, loading: true, data: [] });
        try {
      const data = await authFetch(
        `${serverUrl}/devoluciones/clientes/productos/resumen?area=Clientes`
      );
            setResumenModal({
        open: true,
        loading: false,
        data: Array.isArray(data) ? data : [],
      });
    } catch (err) {
      console.error("❌ abrirResumen clientes:", err);
      pushToast("❌ Error al cargar resumen", "err");
      // Mantener el modal abierto pero mostrar error
      setResumenModal({ 
        open: true, 
        loading: false, 
        data: [] 
      });
    }
  };

  const cerrarResumen = () => {
    setResumenModal({ open: false, loading: false, data: [] });
  };

  const toggleResumen = (grupo, value) => {
    // Solo actualizar el estado local, NO guardar todavía
    // El guardado se hará cuando se presione el botón "Guardar cambios"
    setResumenModal((prev) => ({
      ...prev,
      data: prev.data.map((g) =>
        g.nombre === grupo.nombre
          ? {
              ...g,
              todosActivos: value,
              algunoActivo: value,
            }
          : g
      ),
    }));
  };

  const guardarActivaciones = async () => {
    // Verificar permiso para activar/desactivar productos
    if (!can("action:activar-productos")) {
      pushToast("⚠️ No tienes autorización para activar o desactivar productos", "warn");
      return;
    }

    try {
      const gruposActivos = resumenModal.data.filter((g) => g.todosActivos);
      if (gruposActivos.length === 0) {
        pushToast("ℹ️ No hay grupos activos para guardar", "info");
        return;
      }

      // Procesar todos los grupos activos por nombre con cantidad y caducidad
      const promesas = gruposActivos.map((grupo) => {
        const cantidad = cantidades[grupo.nombre] || grupo.total;
        const caducidad = caducidades[grupo.nombre] || null;
        return authFetch(`${serverUrl}/devoluciones/clientes/productos/estado`, {
          method: "PUT",
          body: JSON.stringify({
            nombre: grupo.nombre,
            activo: true,
            cantidad: cantidad,
            caducidad: caducidad,
          }),
        });
      });

      await Promise.all(promesas);
      pushToast(`✅ ${gruposActivos.length} grupo(s) activado(s)`);
      setCantidades({});
      setCaducidades({});
      cerrarResumen();
      // Emitir eventos para actualizar en tiempo real (NO recargar página)
      window.dispatchEvent(new CustomEvent('productosActualizados'));
      window.dispatchEvent(new CustomEvent('devoluciones_actualizadas'));
    } catch (err) {
      console.error("guardarActivaciones:", err);
      const errorMsg = err.message || "Error al guardar activaciones";
      if (errorMsg.includes("no es apto")) {
        pushToast("⚠️ Algunos productos no son aptos y no se pueden activar", "warn");
      } else {
        pushToast("❌ Error al guardar activaciones", "err");
      }
    }
  };

  const editarGrupo = async (grupo) => {
    if (!can("action:activar-productos")) {
      pushToast("⚠️ No tienes autorización para editar productos", "warn");
      return;
    }
    const ids = grupo.ids || [];
    if (!ids.length) {
      pushToast("⚠️ No hay IDs para editar", "warn");
      return;
    }
    const cantidad = cantidades[grupo.nombre] ?? grupo.total;
    const caducidad = caducidades[grupo.nombre] ?? null;
    try {
      await authFetch(`${serverUrl}/devoluciones/clientes/productos/estado`, {
        method: "PUT",
        body: JSON.stringify({
          ids,
          cantidad,
          caducidad,
          activo: grupo.todosActivos,
        }),
      });
      pushToast("✅ Grupo actualizado", "ok");
      await recargarResumenModal();
      window.dispatchEvent(new CustomEvent('productosActualizados'));
    } catch (err) {
      console.error("editarGrupo:", err);
      pushToast("❌ Error al editar grupo", "err");
    }
  };

  const borrarGrupo = async (grupo) => {
    if (!can("action:activar-productos")) {
      pushToast("⚠️ No tienes autorización para borrar productos", "warn");
      return;
    }
    const ids = grupo.ids || [];
    if (!ids.length) {
      pushToast("⚠️ No hay IDs para borrar", "warn");
      return;
    }
    const confirmado = await showConfirm(`¿Borrar ${ids.length} producto(s) del grupo "${grupo.nombre}"?`);
    if (!confirmado) return;
    try {
      await Promise.all(
        ids.map((id) =>
          authFetch(`${serverUrl}/devoluciones/clientes/productos/${id}`, {
            method: "DELETE",
          })
        )
      );
      pushToast(`🗑️ Grupo "${grupo.nombre}" eliminado`, "ok");
      await recargarResumenModal();
      window.dispatchEvent(new CustomEvent('productosActualizados'));
    } catch (err) {
      console.error("borrarGrupo:", err);
      pushToast("❌ Error al borrar grupo", "err");
    }
  };


  // Agregar event listener directamente
  useEffect(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    
    const handleClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      abrirResumen();
    };
    
    btn.addEventListener('click', handleClick);
        return () => {
      btn.removeEventListener('click', handleClick);
    };
  }, []);

  // Escuchar eventos de producto editado para recargar el modal
  useEffect(() => {
    const handleProductoEditado = async () => {
      if (resumenModal.open) {
                // Recargar datos frescos del servidor
        setResumenModal(prev => ({ ...prev, loading: true }));
        try {
          const data = await authFetch(
            `${serverUrl}/devoluciones/clientes/productos/resumen?area=Clientes`
          );
                    setResumenModal({
            open: true,
            loading: false,
            data: Array.isArray(data) ? data : [],
          });
        } catch (err) {
          console.error("❌ Error recargando resumen:", err);
          setResumenModal(prev => ({ ...prev, loading: false }));
        }
      }
    };

    window.addEventListener('productoEditado', handleProductoEditado);
    return () => {
      window.removeEventListener('productoEditado', handleProductoEditado);
    };
  }, [resumenModal.open, serverUrl]);

  const handleImportar = async () => {
    // Verificar permiso para importar productos (requiere activar productos)
    if (!can("action:activar-productos")) {
      pushToast("⚠️ No tienes autorización para importar productos", "warn");
      return;
    }

    try {
      // Obtener todos los productos activos individuales (no agrupados)
      const productosActivos = await authFetch(
        `${serverUrl}/devoluciones/clientes/productos/resumen?area=Clientes&soloActivos=true`
      );
      
      if (!Array.isArray(productosActivos) || productosActivos.length === 0) {
        pushToast("ℹ️ No hay productos activos para importar", "info");
        return;
      }

      // Agrupar por código + presentación + lote para enviar (igual que otras áreas)
      const gruposMap = new Map();
      productosActivos.forEach((item) => {
        const key = `${item.codigo || ''}@@${item.presentacion || ''}@@${item.lote || ''}`;
        if (!gruposMap.has(key)) {
          gruposMap.set(key, {
            nombre: item.nombre,
            codigo: item.codigo,
            presentacion: item.presentacion || '',
            cantidad: 0,
            lote: item.lote || ''
          });
        }
        // Sumar las cantidades de productos individuales
        gruposMap.get(key).cantidad += Number(item.cantidad || 0);
      });
      const grupos = Array.from(gruposMap.values());

      // Enviar notificación con botones de aceptar/rechazar
      addNotification({
        title: "Solicitud de Importación",
        message: `Se solicita importar ${productosActivos.length} producto(s) activo(s) desde Devoluciones (Clientes) a Picking.\n\nProductos: ${grupos.map(g => `${g.nombre} (${g.cantidad} pzs)`).join(", ")}`,
        es_confirmacion: true, // Marcar como confirmación para que se borre al aceptar/rechazar
        data: {
          tipo: "importacion",
          area: "Clientes",
          grupos: grupos,
          serverUrl,
          tipoDevolucion: "clientes"
        },
        read: false,
        onAccept: async () => {
          await importarProductos(grupos, "clientes");
        },
        onReject: () => {
          pushToast("❌ Importación rechazada", "info");
        }
      });

      pushToast("📥 Solicitud de importación enviada. Revisa las notificaciones.", "info");
    } catch (err) {
      console.error("handleImportar:", err);
      pushToast("❌ Error al enviar solicitud de importación", "err");
    }
  };

  const importarProductos = async (grupos, tipoDevolucion) => {
    try {
      const response = await authFetch(`${serverUrl}/devoluciones/importar`, {
        method: "POST",
        body: JSON.stringify({
          grupos: grupos.map(g => ({
            nombre: g.nombre,
            codigo: g.codigo,
            presentacion: g.presentacion || '',
            cantidad: g.cantidad || g.total || 0,
            lote: g.lote || ''
          })),
          area: tipoDevolucion,
          tipo: tipoDevolucion
        })
      });

      if (response && response.ok !== false) {
        pushToast(`✅ ${response.productosImportados || grupos.length} producto(s) importado(s) exitosamente a Picking`, "ok");
        // Recargar productos de picking
        window.dispatchEvent(new CustomEvent('picking_actualizado'));
      } else {
        pushToast("❌ Error al importar productos", "err");
      }
    } catch (err) {
      console.error("importarProductos:", err);
      pushToast("❌ Error al importar productos", "err");
    }
  };

  const handleImportarNoAptos = async () => {
    // Verificar permiso para importar productos (requiere activar productos)
    if (!can("action:activar-productos")) {
      pushToast("⚠️ No tienes autorización para importar productos", "warn");
      return;
    }

    const confirmado = await showConfirm("¿Importar todos los productos NO APTOS a Control de Calidad? Los productos se eliminarán de Clientes.");
    if (!confirmado) {
      return;
    }

    try {
      const response = await authFetch(`${serverUrl}/devoluciones/clientes/importar-no-aptos`, {
        method: "POST"
      });

      if (response.success) {
        pushToast(`✅ ${response.importados} productos no aptos importados a Control de Calidad`, "ok");
        // Recargar datos
        window.dispatchEvent(new CustomEvent('productosActualizados'));
        // Recargar página de control de calidad si está abierta
        window.dispatchEvent(new CustomEvent('calidad_registros_actualizados'));
      } else {
        pushToast(response.message || "❌ Error al importar productos no aptos", "err");
      }
    } catch (err) {
      console.error("handleImportarNoAptos:", err);
      pushToast("❌ Error al importar productos no aptos", "err");
    }
  };

    return (
    <>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button 
          ref={buttonRef}
          className="btn-activacion" 
          type="button"
        >
          ⚡ 
        </button>
        <button
          className="btn-green" 
          onClick={handleImportar}
          type="button"
          title="Importar productos activos a Picking"
        >
          📥 
        </button>
        <button
          className="btn-orange" 
          onClick={handleImportarNoAptos}
          type="button"
          title="Importar productos NO APTOS a Control de Calidad"
        >
          ⚠️
        </button>
      </div>

      {resumenModal.open && (
        <div 
          className="activation-modal-overlay" 
          onClick={cerrarResumen}
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0,
            zIndex: 12000 
          }}
        >
          <div
            className="activation-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ zIndex: 12001 }}
          >
            <div className="activation-modal__header">
              <h4>Activación por producto</h4>
              <button className="btn-plain" onClick={cerrarResumen}>
                ✕
              </button>
            </div>
            {resumenModal.loading ? (
              <p>Cargando...</p>
            ) : resumenModal.data.length === 0 ? (
              <p>No hay productos para mostrar.</p>
            ) : (
              <ul className="activation-list">
                {resumenModal.data.map((grupo) => (
                  <li key={grupo.nombre}>
                    <div>
                      <strong>{grupo.nombre}</strong>
                      {grupo.codigo && grupo.codigo !== "—" && (
                        <span className="activation-code">{grupo.codigo}</span>
                      )}
                      {grupo.lote && grupo.lote !== "—" && (
                        <span className="activation-lote">
                          Lotes: {grupo.lote}
                        </span>
                      )}
                    </div>
                    <div className="activation-controls">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, flexWrap: 'nowrap' }}>
                        <span style={{ minWidth: '45px', fontSize: '0.85rem', flexShrink: 0 }}>{grupo.total} pzs</span>
                        <div style={{ 
                          display: 'flex', 
                          gap: '6px', 
                          flex: '1 1 auto',
                          minWidth: 0,
                          width: '100%',
                          maxWidth: '280px'
                        }}>
                          <input
                            type="number"
                            min="1"
                            value={cantidades[grupo.nombre] || grupo.total}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || grupo.total;
                              setCantidades(prev => ({
                                ...prev,
                                [grupo.nombre]: val
                              }));
                            }}
                            style={{
                              flex: '1 1 50%',
                              width: '50%',
                              padding: '5px 8px',
                              border: '1px solid var(--borde-medio)',
                              borderRadius: 'var(--radio-md)',
                              fontSize: '0.85rem',
                              background: 'var(--fondo-input)',
                              color: 'var(--texto-principal)',
                              boxSizing: 'border-box',
                              minWidth: 0
                            }}
                            placeholder="Cantidad"
                          />
                          <input
                            type="date"
                            value={caducidades[grupo.nombre] || ''}
                            onChange={(e) => {
                              setCaducidades(prev => ({
                                ...prev,
                                [grupo.nombre]: e.target.value
                              }));
                            }}
                            style={{
                              flex: '1 1 50%',
                              width: '50%',
                              padding: '5px 8px',
                              border: '1px solid var(--borde-medio)',
                              borderRadius: 'var(--radio-md)',
                              fontSize: '0.85rem',
                              background: 'var(--fondo-input)',
                              color: 'var(--texto-principal)',
                              boxSizing: 'border-box',
                              minWidth: 0
                            }}
                            placeholder="Caducidad"
                          />
                        </div>
                      </div>
                      <label className="switch" style={{ flexShrink: 0, opacity: !can("action:activar-productos") ? 0.5 : 1 }}>
                        <input
                          type="checkbox"
                          checked={grupo.todosActivos}
                          disabled={!can("action:activar-productos")}
                          title={!can("action:activar-productos") ? "No tienes autorización para activar/desactivar productos" : ""}
                          onChange={(e) =>
                            toggleResumen(grupo, e.target.checked)
                          }
                        />
                        <span className="slider" />
                      </label>
                      <div style={{ display: 'flex', gap: '6px', marginLeft: '8px' }}>
                        <button
                          className="btn-plain"
                          title="Editar grupo"
                          disabled={!can("action:activar-productos")}
                          onClick={() => editarGrupo(grupo)}
                          style={{ opacity: !can("action:activar-productos") ? 0.5 : 1 }}
                        >
                          ✏️
                        </button>
                        <button
                          className="btn-plain"
                          title="Borrar grupo"
                          disabled={!can("action:activar-productos")}
                          onClick={() => borrarGrupo(grupo)}
                          style={{ opacity: !can("action:activar-productos") ? 0.5 : 1 }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {resumenModal.data.length > 0 && (
              <div className="activation-modal__footer">
                <button 
                  className="btn-green" 
                  onClick={guardarActivaciones}
                  style={{ 
                    marginTop: '16px', 
                    padding: '10px 20px',
                    width: '100%'
                  }}
                >
                  💾
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const TAB_DEFINITIONS = [
  { key: "clientes", label: "Clientes" },
  { key: "calidad", label: "Control de Calidad" },
  { key: "reacondicionados", label: "Reacondicionados" },
  { key: "retail", label: "Retail" },
  { key: "cubbo", label: "Cubbo" },
  { key: "regulatorio", label: "AAVC" },
];

const TAB_LABEL_MAP = TAB_DEFINITIONS.reduce((acc, tab) => {
  acc[tab.key] = tab.label;
  return acc;
}, {});

export default function Devoluciones({
  serverUrl,
  devoluciones,
  setDevoluciones,
  pushToast,
  socket,
}) {
  const { authFetch } = useAuth();
  const { showConfirm } = useAlert();
  // 🔹 Pestañas
  const pestañas = TAB_DEFINITIONS;

  const [tabActiva, setTabActiva] = useState("clientes");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tipoParam = params.get("tipo");
    if (tipoParam && TAB_DEFINITIONS.some((t) => t.key === tipoParam)) {
      setTabActiva(tipoParam);
    }
  }, []);

  // ==========================================================
  //  IA: productos detectados por IA (SE CONSERVA TODO)
  // ==========================================================
  const [productosEscaneados, setProductosEscaneados] = useState([]);
  const [inventarioRef, setInventarioRef] = useState([]);
  const fileInputRef = useRef(null);

  // Cámara IA
  const [camStream, setCamStream] = useState(null);
  const [showCamModal, setShowCamModal] = useState(false);
  const [forceCameraOff, setForceCameraOff] = useState(false);
  const videoRef = useRef(null);

  const syncTipo = useCallback((tipoLlave, rows) => {
    if (typeof setDevoluciones !== "function") return;
    setDevoluciones((prev) => {
      const base = Array.isArray(prev) ? prev : [];
      const filtered = base.filter((item) => item.tipo !== tipoLlave);
      const enriched = (rows || []).map((row) => ({
        ...row,
        tipo: tipoLlave,
      }));
      return [...filtered, ...enriched];
    });
  }, [setDevoluciones]);

  // ==========================================================
  // 🔤 Normalizador de texto
  // ==========================================================
  const normalizarTexto = (texto = "") =>
    texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/caps?\b/g, "capsulas")
      .replace(/cap\b/g, "capsulas")
      .replace(/mg\b/g, "mg")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  // ==========================================================
  // 🔍 BÚSQUEDA FLEXIBLE INVENTARIO (IA)
  // ==========================================================
  const buscarCoincidenciaLocal = (nombreBuscado = "") => {
    if (!nombreBuscado || inventarioRef.length === 0) return null;

    const target = normalizarTexto(nombreBuscado);
    if (!target) return null;

    const palabras = target.split(" ").filter((p) => p.length > 2);

    const candidatos = inventarioRef.map((prod) => {
      const norm = normalizarTexto(prod.nombre || "");
      let coincidencias = 0;

      for (const w of palabras) {
        if (norm.includes(w)) coincidencias++;
      }

      const incluyeCompleto =
        norm.includes(target) || target.includes(norm);

      return {
        prod,
        norm,
        coincidencias,
        incluyeCompleto,
        len: norm.length,
      };
    });

    let mejores = candidatos.filter((c) => c.incluyeCompleto);
    if (mejores.length > 0) {
      mejores.sort((a, b) => a.len - b.len);
      return mejores[0].prod;
    }

    mejores = candidatos.filter((c) => c.coincidencias > 0);
    if (mejores.length === 0) return null;

    mejores.sort((a, b) => {
      if (b.coincidencias !== a.coincidencias) {
        return b.coincidencias - a.coincidencias;
      }
      return a.len - b.len;
    });

    return mejores[0].prod;
  };

  // ==========================================================
  // 📦 CARGAR INVENTARIO PARA IA
  // ==========================================================
  const cargarInventarioRef = async () => {
    try {
      const data = await authFetch(`${serverUrl}/inventario`);
      setInventarioRef(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error cargando inventario IA:", err);
    }
  };

  useEffect(() => {
    cargarInventarioRef();
  }, []);

  // ==========================================================
  // 🔌 LISTENERS DE SOCKET PARA SINCRONIZACIÓN
  // ==========================================================
  useEffect(() => {
    if (!socket) return;

    const handleDevolucionesActualizadas = () => {
      // Cuando se cierra el día, limpiar todos los estados
      setDevoluciones([]);
      // Emitir evento personalizado para que los componentes hijos se actualicen
      // No llamar a syncTipo aquí para evitar loops infinitos - los componentes cargarán sus propios datos
      window.dispatchEvent(new CustomEvent('diaCerradoDevoluciones'));
    };

    const handleReportesActualizados = () => {
      // Los reportes se actualizarán automáticamente cuando se consulten
      console.log("📊 Reportes actualizados");
    };

    socket.on("devoluciones_actualizadas", handleDevolucionesActualizadas);
    socket.on("reportes_actualizados", handleReportesActualizados);

    return () => {
      socket.off("devoluciones_actualizadas", handleDevolucionesActualizadas);
      socket.off("reportes_actualizados", handleReportesActualizados);
    };
  }, [socket]); // Removido syncTipo de dependencias para evitar loops

  // ==========================================================
  // 📸 CÁMARA IA — ABRIR
  // ==========================================================
  const abrirCamara = async () => {
    if (forceCameraOff) return;

    // Verificar que el navegador soporte getUserMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      pushToast("❌ Tu navegador no soporta acceso a la cámara", "err");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      setCamStream(stream);
      setShowCamModal(true);

      setTimeout(() => {
        if (!forceCameraOff && videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () =>
            videoRef.current.play();
        }
      }, 200);
    } catch (err) {
      pushToast("❌ No se pudo abrir la cámara", "err");
      console.error(err);
    }
  };

  const stopCamera = () => {
    try {
      if (camStream) {
        camStream.getTracks().forEach((t) => t.stop());
      }
      if (videoRef.current) videoRef.current.srcObject = null;
      setCamStream(null);
    } catch (e) {
      console.error(e);
    }
  };

  const tomarFoto = () => {
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    return canvas.toDataURL("image/jpeg");
  };

  // ==========================================================
  // 📸 IA — PROCESAR FOTO
  // ==========================================================
  const escanearDocumento = async () => {
    const photo = tomarFoto();
    stopCamera();
    setShowCamModal(false);

    try {
      const data = await authFetch(`${serverUrl}/devoluciones/scan`, {
        method: "POST",
        body: JSON.stringify({ imageBase64: photo }),
      });

      if (!data || data.error) throw new Error(data?.error || "Error IA");

      const productosConMatch = (data.productos || []).map((p) => {
        const match = buscarCoincidenciaLocal(p.nombre);
        if (match) {
          return {
            ...p,
            codigo: match.codigo,
            sinCoincidencia: false,
          };
        }
        return { ...p, sinCoincidencia: true };
      });

      setProductosEscaneados(productosConMatch);
    } catch (err) {
      console.error(err);
      
      // Manejar errores específicos de la API
      let mensajeError = "❌ Error IA";
      
      if (err.message) {
        // Si el error viene del servidor con detalles
        if (err.message.includes("cuota") || err.message.includes("Cuota") || err.tipoError === "cuota_excedida") {
          // Si es cuota diaria, mostrar mensaje específico
          if (err.esCuotaDiaria) {
            mensajeError = "⚠️ Cuota diaria agotada - Usa escaneo manual";
          } else if (err.esCuotaPorMinuto && err.tiempoEspera) {
            // Si es cuota por minuto, mostrar tiempo de espera
            mensajeError = `⚠️ Límite por minuto - Reintentar en ${err.tiempoEspera}s`;
          } else {
            mensajeError = "⚠️ Cuota de API excedida";
            // Usar tiempo de espera si está disponible
            if (err.tiempoEspera) {
              mensajeError += ` - Reintentar en ${err.tiempoEspera}s`;
            } else if (err.reintentarEn) {
              mensajeError += ` - ${err.reintentarEn}`;
            } else {
              mensajeError += " - Usa escaneo manual o espera";
            }
          }
        } else if (err.message.includes("API key") || err.message.includes("inválida")) {
          mensajeError = "❌ API key inválida - Contacta al administrador";
        } else {
          // Usar el mensaje del servidor si está disponible, o el mensaje del error
          mensajeError = err.details || err.message || "❌ Error IA";
        }
      }
      
      pushToast(mensajeError, "err");
    }
  };

  // ==========================================================
  // 📤 SUBIR IMÁGENES PARA IA
  // ==========================================================
  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const subirFotosIA = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    pushToast("⏳ Procesando imágenes…", "warn");

    let resultados = [];

    for (const f of files) {
      try {
        const base64 = await fileToBase64(f);

        const data = await authFetch(`${serverUrl}/devoluciones/scan`, {
          method: "POST",
          body: JSON.stringify({ imageBase64: base64 }),
        });

        if (Array.isArray(data.productos)) {
          resultados = [...resultados, ...data.productos];
        }
      } catch (err) {
        console.error(err);
      }
    }

    const unificados = resultados.map((p) => {
      const match = buscarCoincidenciaLocal(p.nombre);
      if (match) {
        return { ...p, codigo: match.codigo, sinCoincidencia: false };
      }
      return { ...p, sinCoincidencia: true };
    });

    setProductosEscaneados(unificados);
    pushToast("📄 Listo", "ok");

    e.target.value = "";
  };

  const actualizarNombreIA = (i, nuevoNombre) => {
    setProductosEscaneados((prev) => {
      const copia = [...prev];
      copia[i] = { ...copia[i], nombre: nuevoNombre, sinCoincidencia: true };
      return copia;
    });
  };

  const revalidarProductoIA = (i) => {
    setProductosEscaneados((prev) => {
      const copia = [...prev];
      const match = buscarCoincidenciaLocal(copia[i].nombre);

      copia[i] = {
        ...copia[i],
        codigo: match ? match.codigo : null,
        sinCoincidencia: !match,
      };

      return copia;
    });
  };

  // ==========================================================
  // 💾 GUARDAR DEVOLUCIONES IA
  // ==========================================================
  const guardarProductosIA = async () => {
    if (productosEscaneados.length === 0) return;

    try {
      await authFetch(
        `${serverUrl}/devoluciones/guardarIA/${tabActiva}`,
        {
          method: "POST",
          body: JSON.stringify({
            productos: productosEscaneados.map((p) => ({
              ...p,
              activo: false,
            })),
          }),
        }
      );

      pushToast("💾 IA guardada", "ok");
      setProductosEscaneados([]);

    } catch (err) {
      console.error(err);
      pushToast("❌ Error al guardar IA", "err");
    }
  };

  // ==========================================================
  // RETURN LIMPIO + IA Mantenida
  // ==========================================================
  // ==========================================================
  // CERRAR DÍA DE DEVOLUCIONES
  // ==========================================================
  const [cerrarDiaLoading, setCerrarDiaLoading] = useState(false);
  
  const cerrarDiaDevoluciones = async () => {
    const confirmado = await showConfirm("¿Cerrar el día de devoluciones? Solo los productos activos y no aptos pasarán a histórico.");
    if (!confirmado) {
      return;
    }

    setCerrarDiaLoading(true);
    try {
      const data = await authFetch(`${serverUrl}/devoluciones/cerrar-dia`, {
        method: "POST",
        body: JSON.stringify({ fecha: new Date().toISOString().split('T')[0] })
      });

      const resumenTexto = Object.entries(data.resumen || {})
        .filter(([_, count]) => count > 0)
        .map(([area, count]) => `${area}: ${count}`)
        .join(", ");
      
      const resumenPedidosTexto = Object.entries(data.resumenPedidos || {})
        .filter(([_, count]) => count > 0)
        .map(([area, count]) => `${area}: ${count}`)
        .join(", ");
      
      let mensaje = `✅ Día cerrado. ${data.movidos || 0} productos movidos al histórico`;
      if (resumenTexto) {
        mensaje += ` (${resumenTexto})`;
      }
      if (data.pedidosMovidos > 0) {
        mensaje += `. ${data.pedidosMovidos} pedidos movidos al histórico`;
        if (resumenPedidosTexto) {
          mensaje += ` (${resumenPedidosTexto})`;
        }
      }
      
      pushToast(mensaje, "ok");

      // Limpiar completamente todo después del cierre
      // Los eventos de socket ya se emitieron desde el servidor
      // Los listeners de socket actualizarán automáticamente la UI
      
      // Limpiar estados locales inmediatamente
      setDevoluciones([]);
      
      // Limpiar todas las pestañas específicamente
      syncTipo("clientes", []);
      syncTipo("calidad", []);
      syncTipo("reacondicionados", []);
      syncTipo("retail", []);
      syncTipo("cubbo", []);
      syncTipo("regulatorio", []);
      
      // Limpiar productos escaneados por IA
      setProductosEscaneados([]);
      
      // Emitir eventos personalizados para componentes que los escuchan
      window.dispatchEvent(new CustomEvent('diaCerradoDevoluciones'));
      window.dispatchEvent(new CustomEvent('productosActualizados'));
      
      // Los listeners de socket se encargarán de actualizar todo automáticamente
    } catch (err) {
      console.error("Error cerrando día de devoluciones:", err);
      const errorMsg = err.message || err.toString() || "Error desconocido";
      pushToast(`❌ Error cerrando día: ${errorMsg}`, "err");
    } finally {
      setCerrarDiaLoading(false);
    }
  };

  return (
    <div className="card">

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>Devoluciones</h2>
        <button
          className="btn-borrar"
          onClick={cerrarDiaDevoluciones}
          disabled={cerrarDiaLoading}
        >
          {cerrarDiaLoading ? "Cerrando..." : "🔒 Cerrar día"}
        </button>
      </div>

      {/* 🔹 PESTAÑAS */}
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

      {/* 🔥 BOTONES SUPERIORES IA (SE CONSERVA) */}
      <div className="actions-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button className="btnCamIA" onClick={abrirCamara}>📇</button>

          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            style={{ display: "none" }}
            multiple
            onChange={subirFotosIA}
          />

          <button
            className="btnCamIA btn-subir-foto"
            onClick={() => fileInputRef.current.click()}
          >
            ⬆️
          </button>
        </div>

        {/* Botones de Activación e Importar al extremo derecho */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {tabActiva === "clientes" ? (
            <BotonActivacionClientes
              serverUrl={serverUrl}
              pushToast={pushToast}
              socket={socket}
            />
          ) : (
            <GestionDevolucionesTab
              key={`activacion-${tabActiva}`}
              tipo={tabActiva}
              serverUrl={serverUrl}
              pushToast={pushToast}
              inventarioRef={inventarioRef}
              realtimeDevoluciones={devoluciones}
              syncTipo={syncTipo}
              soloBotonActivacion={true}
              socket={socket}
            />
          )}
        </div>
      </div>

      {/* 🔥 MÓDULO DE IA COMPLETO */}
      {productosEscaneados.length > 0 && (
        <div className="resultadoIA">
          <h3>Productos detectados (IA)</h3>

          <table className="tabla-devoluciones">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre (editable)</th>
                <th>Lote</th>
                <th>Cantidad</th>
                <th>Estado</th>
              </tr>
            </thead>

            <tbody>
              {productosEscaneados.map((p, i) => (
                <tr key={i}>
                  <td>{p.codigo || "---"}</td>

                  <td>
                    <input
                      className={`ia-input-nombre ${
                        p.sinCoincidencia ? "err" : "ok"
                      }`}
                      value={p.nombre}
                      onChange={(e) => actualizarNombreIA(i, e.target.value)}
                      onBlur={() => revalidarProductoIA(i)}
                    />
                  </td>

                  <td>
                    <input
                      className="ia-input-lote"
                      value={p.lote}
                      onChange={(e) => {
                        const nuevo = e.target.value;
                        setProductosEscaneados((prev) => {
                          const copia = [...prev];
                          copia[i] = { ...copia[i], lote: nuevo };
                          return copia;
                        });
                      }}
                    />
                  </td>

                  <td>
                    <input
                      type="number"
                      value={p.cantidad}
                      className="ia-input-cantidad"
                      onChange={(e) => {
                        const nuevaCantidad = e.target.value;
                        setProductosEscaneados((prev) =>
                          prev.map((item, idx) =>
                            idx === i
                              ? { ...item, cantidad: nuevaCantidad }
                              : item
                          )
                        );
                      }}
                    />
                  </td>

                  <td
                    style={{
                      color: p.sinCoincidencia ? "red" : "green",
                      fontWeight: "bold",
                    }}
                  >
                    {p.sinCoincidencia ? "No encontrado" : "Listo"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button className="btnGuardarIA" onClick={guardarProductosIA}>
            💾 Guardar devoluciones IA (Pendientes)
          </button>
        </div>
      )}

      {/* 🔥 MODAL CÁMARA IA */}
      {showCamModal && (
        <div className="modalCam">
          <video ref={videoRef} autoPlay playsInline style={{ width: "100%" }} />

          <button className="btnTomarFoto" onClick={escanearDocumento}>
            📸 Tomar foto
          </button>

          <button
            className="btnCancelar"
            onClick={() => {
              setForceCameraOff(true);
              stopCamera();
              setShowCamModal(false);
            }}
          >
            ❌ Cancelar
          </button>
        </div>
      )}

      {/* 🔥 CONTENIDO SEGÚN PESTAÑA */}
      {tabActiva === "clientes" ? (
        <DevolucionesProceso 
          serverUrl={serverUrl} 
          pushToast={pushToast}
          socket={socket}
          onProductoEditado={async () => {
            // Recargar modal de activación del botón amarillo si está abierto
            // Esto se hace recargando la página o emitiendo un evento
            // Por ahora, simplemente recargamos la lista de productos
            try {
              await authFetch(`${serverUrl}/devoluciones/clientes/productos/resumen?area=Clientes`);
              // El modal se recargará automáticamente cuando se abra de nuevo
            } catch (err) {
              console.error("Error recargando resumen:", err);
            }
          }}
        />
      ) : tabActiva === "calidad" ? (
        <ControlCalidad serverUrl={serverUrl} pushToast={pushToast} socket={socket} />
      ) : (
        <GestionDevolucionesTab
          key={tabActiva}
          tipo={tabActiva}
          serverUrl={serverUrl}
          pushToast={pushToast}
          inventarioRef={inventarioRef}
          realtimeDevoluciones={devoluciones}
          syncTipo={syncTipo}
          socket={socket}
        />
      )}
    </div>
  );
}

function GestionDevolucionesTab({
  tipo,
  serverUrl,
  pushToast,
  inventarioRef,
  realtimeDevoluciones,
  syncTipo,
  soloBotonActivacion = false,
  socket,
}) {
  const { authFetch, perms, refrescarPermisos } = useAuth();
  const { addNotification } = useNotifications();
  const { showConfirm, showAlert } = useAlert();
  const can = (perm) => {
    const tienePermiso = perms?.includes(perm);
    // Debug: solo mostrar si no tiene el permiso y es action:activar-productos
    if (!tienePermiso && perm === "action:activar-productos") {
      console.log("🔍 [Devoluciones] Permiso action:activar-productos no encontrado. Permisos actuales:", perms);
    }
    return tienePermiso;
  };
  
  // Escuchar eventos de actualización de permisos
  useEffect(() => {
    const handlePermisosActualizados = () => {
      console.log("🔄 [Devoluciones] Evento de permisos actualizados recibido, refrescando...");
      refrescarPermisos();
    };
    
    // Escuchar evento personalizado cuando se actualizan permisos
    window.addEventListener('permisos-actualizados', handlePermisosActualizados);
    
    return () => {
      window.removeEventListener('permisos-actualizados', handlePermisosActualizados);
    };
  }, [refrescarPermisos]);
  
  const [items, setItems] = useState([]);
  const itemsRef = useRef([]); // Ref para evitar loops infinitos con realtimeDevoluciones
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    codigo: "",
    nombre: "",
    presentacion: "",
    lote: "",
    cantidad: "",
    area: "", // Solo para calidad
  });
  const [editing, setEditing] = useState({});
  const [aliasModal, setAliasModal] = useState({
    open: false,
    codigo: "",
    busqueda: "",
    seleccionado: null,
  });

  // ====== COMPARTIR POR CHAT ======
  const [compartirOpen, setCompartirOpen] = useState(false);
  const [compartirRegistro, setCompartirRegistro] = useState(null);
  const [compartirUsuarios, setCompartirUsuarios] = useState([]);
  const [compartirDestino, setCompartirDestino] = useState("");
  const [compartiendo, setCompartiendo] = useState(false);

  const cargarUsuariosChat = async () => {
    try {
      const data = await authFetch(`${serverUrl}/chat/usuarios`);
      setCompartirUsuarios(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Error cargando usuarios de chat:", e);
      setCompartirUsuarios([]);
    }
  };

  const abrirCompartir = async (registro) => {
    setCompartirRegistro(registro);
    setCompartirDestino("");
    setCompartirOpen(true);
    await cargarUsuariosChat();
  };

  const construirMensajeCompartir = (registro) => {
    if (!registro) return "Registro de devolución compartido.";
    const base = new URL(window.location.origin);
    base.searchParams.set("tab", "devoluciones");
    base.searchParams.set("share", "devolucion");
    base.searchParams.set("tipo", tipo);
    if (registro.id) base.searchParams.set("id", String(registro.id));
    return base.toString();
  };

  const enviarCompartir = async () => {
    if (!compartirDestino || !compartirRegistro) {
      showAlert("Selecciona un usuario para compartir.", "warning");
      return;
    }
    try {
      setCompartiendo(true);
      await authFetch(`${serverUrl}/chat/privado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          para_nickname: compartirDestino,
          mensaje: construirMensajeCompartir(compartirRegistro),
          tipo_mensaje: "texto",
        }),
      });
      showAlert("Devolución compartida por chat.", "success");
      setCompartirOpen(false);
    } catch (e) {
      console.error("Error compartiendo devolución:", e);
      showAlert("No se pudo compartir la devolución.", "error");
    } finally {
      setCompartiendo(false);
    }
  };
  const [resumenModal, setResumenModal] = useState({
    open: false,
    loading: false,
    data: [],
  });
  const [guardandoFila, setGuardandoFila] = useState({});
  
  // Áreas de calidad (solo para tipo === "calidad")
  const [areasCalidad, setAreasCalidad] = useState([]);
  const [nuevaAreaInput, setNuevaAreaInput] = useState("");
  const [mostrarInputArea, setMostrarInputArea] = useState(false);
  
  // Modal de evidencias para otras áreas (no "Clientes")
  const [modalEvidencias, setModalEvidencias] = useState({
    open: false,
    registro: null,
    evidencias: [],
    subiendo: false,
    tipo: null // Agregar tipo al estado del modal
  });
  const shareHandledRef = useRef(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  
  // Refs para escaneo automático
  const codigoInputRef = useRef(null);
  const loteInputRef = useRef(null);
  const scanBufferRef = useRef("");
  const scanTimeoutRef = useRef(null);
  const SCAN_DELAY = 40;

  const areaLabel = TAB_LABEL_MAP[tipo] || tipo;

  const mapEditingFromRows = (rows) =>
    rows.reduce((acc, row) => {
      acc[row.id] = {
        lote: row.lote ?? "",
        cantidad: row.cantidad ?? 0,
      };
      return acc;
    }, {});

  const cargarRegistros = useCallback(async () => {
    try {
      setLoading(true);
      const data = await authFetch(
        `${serverUrl}/dia/devoluciones/${tipo}`
      );
      const rows = Array.isArray(data) ? data : [];
      setItems(rows);
      itemsRef.current = rows; // Actualizar ref también
      setEditing(mapEditingFromRows(rows));
      // NO sincronizar con syncTipo aquí para evitar loops infinitos
      // Estas pestañas no necesitan sincronización en tiempo real
    } catch (err) {
      console.error("cargarRegistros devoluciones:", err);
      pushToast("❌ Error al cargar devoluciones", "err");
    } finally {
      setLoading(false);
    }
  }, [tipo, serverUrl]); // Solo dependencias esenciales - authFetch y pushToast son estables

  // Cargar áreas de calidad solo si es tipo calidad
  useEffect(() => {
    if (tipo === "calidad") {
      const cargarAreas = async () => {
        try {
          const data = await authFetch(`${serverUrl}/devoluciones/calidad/areas`);
          setAreasCalidad(Array.isArray(data) ? data : []);
        } catch (err) {
          console.error("Error cargando áreas de calidad:", err);
        }
      };
      cargarAreas();
    }
  }, [tipo, serverUrl, authFetch]);

  useEffect(() => {
    if (shareHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("share") !== "devolucion") return;
    if (params.get("tipo") !== tipo) return;
    const id = Number(params.get("id"));
    if (!id) return;
    const registro = items.find((r) => r.id === id);
    if (!registro) return;
    if (tipo !== "clientes") {
      setModalEvidencias({
        open: true,
        registro,
        evidencias: [],
        subiendo: false,
        tipo,
      });
    }
    shareHandledRef.current = true;
  }, [items, tipo]);

  // Cargar registros solo cuando cambia el tipo o serverUrl - NO depender de cargarRegistros
  useEffect(() => {
    const cargar = async () => {
      try {
        setLoading(true);
        const data = await authFetch(
          `${serverUrl}/dia/devoluciones/${tipo}`
        );
        const rows = Array.isArray(data) ? data : [];
        setItems(rows);
        itemsRef.current = rows;
        setEditing(mapEditingFromRows(rows));
      } catch (err) {
        console.error("cargarRegistros devoluciones:", err);
        pushToast("❌ Error al cargar devoluciones", "err");
      } finally {
        setLoading(false);
      }
    };
    cargar();
  }, [tipo, serverUrl]); // Dependencias directas para evitar loops

  // Deshabilitar actualización desde realtimeDevoluciones para evitar loops infinitos
  // Estas pestañas cargan directamente desde el servidor, no necesitan realtimeDevoluciones
  // useEffect(() => {
  //   if (!Array.isArray(realtimeDevoluciones)) return;
  //   
  //   // Si estamos cargando, no actualizar desde realtimeDevoluciones para evitar conflictos
  //   if (loading) return;
  //   
  //   const subset = realtimeDevoluciones
  //     .filter((item) => item.tipo === tipo)
  //     .map(({ tipo: _omit, ...rest }) => rest);
  //   
  //   // Solo actualizar si realmente hay cambios para evitar loops infinitos
  //   const subsetStr = JSON.stringify(subset);
  //   const currentStr = JSON.stringify(itemsRef.current);
  //   if (subsetStr !== currentStr) {
  //     itemsRef.current = subset;
  //     setItems(subset);
  //     setEditing(mapEditingFromRows(subset));
  //   }
  // }, [realtimeDevoluciones, tipo, loading]);

  // Escuchar eventos de socket para actualización en tiempo real
  useEffect(() => {
    if (!socket) return;

    const handleDevolucionesActualizadas = () => {
      // Recargar registros cuando se actualizan devoluciones
      if (typeof cargarRegistros === "function") {
        cargarRegistros();
      }
    };

    const handleProductosActualizados = () => {
      // Recargar registros cuando se actualizan productos
      if (typeof cargarRegistros === "function") {
        cargarRegistros();
      }
    };

    socket.on("devoluciones_actualizadas", handleDevolucionesActualizadas);
    socket.on("productos_actualizados", handleProductosActualizados);

    return () => {
      socket.off("devoluciones_actualizadas", handleDevolucionesActualizadas);
      socket.off("productos_actualizados", handleProductosActualizados);
    };
  }, [socket, tipo, serverUrl, cargarRegistros]); // Incluir cargarRegistros en dependencias

  // Escuchar evento de día cerrado para limpiar todo
  useEffect(() => {
    const handleDiaCerrado = async () => {
      // Limpiar completamente todos los estados
      setItems([]);
      itemsRef.current = [];
      setEditing({});
      setForm({ codigo: "", nombre: "", presentacion: "", lote: "", cantidad: "", area: "" });
      setAliasModal({ open: false, codigo: "", busqueda: "", seleccionado: null });
      setResumenModal({ open: false, loading: false, data: [] });
      setGuardandoFila({});
      // Recargar registros usando la función directamente para evitar dependencias
      setTimeout(async () => {
        try {
          setLoading(true);
          const data = await authFetch(`${serverUrl}/dia/devoluciones/${tipo}`);
          const rows = Array.isArray(data) ? data : [];
          setItems(rows);
          itemsRef.current = rows;
          setEditing(mapEditingFromRows(rows));
        } catch (err) {
          console.error("Error recargando después de cierre:", err);
        } finally {
          setLoading(false);
        }
      }, 100);
    };

    window.addEventListener('diaCerradoDevoluciones', handleDiaCerrado);
    return () => {
      window.removeEventListener('diaCerradoDevoluciones', handleDiaCerrado);
    };
  }, [tipo, serverUrl, authFetch]); // Dependencias directas

  // Enfocar campo de código para tipos específicos (reacondicionados, retail, cubbo, regulatorio)
  useEffect(() => {
    const tiposConFocoEnCodigo = ["reacondicionados", "retail", "cubbo", "regulatorio"];
    if (tiposConFocoEnCodigo.includes(tipo)) {
      // Pequeño delay para asegurar que el input esté renderizado
      setTimeout(() => {
        codigoInputRef.current?.focus();
      }, 200);
    }
  }, [tipo]);

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const buscarProductoPorCodigo = async (codigoValor) => {
    if (!codigoValor || codigoValor.trim().length < 3) return; // Evitar búsquedas de códigos muy cortos
    const codigoLimpio = codigoValor.trim();
    try {
      const data = await authFetch(`${serverUrl}/inventario/producto/${codigoLimpio}`);
      // Separar nombre y presentación
      setForm((prev) => ({
        ...prev,
        codigo: codigoLimpio,
        nombre: data.nombre || prev.nombre || "",
        presentacion: data.presentacion || prev.presentacion || "",
        lote: data.lote || prev.lote || "",
      }));
      // Pasar foco al input de lote después de detectar
      setTimeout(() => {
        loteInputRef.current?.focus();
        loteInputRef.current?.select();
      }, 50);
      // Función helper para evitar duplicar la presentación si ya está en el nombre
      const obtenerNombreCompleto = (nombre, presentacion) => {
        if (!nombre) return "";
        if (!presentacion || !presentacion.trim()) return nombre;
        
        const nombreTrim = nombre.trim();
        const presentacionTrim = presentacion.trim();
        
        // Verificar si el nombre ya termina con la presentación (con o sin guión)
        const nombreLower = nombreTrim.toLowerCase();
        const presentacionLower = presentacionTrim.toLowerCase();
        
        // Verificar si el nombre ya contiene la presentación al final
        if (nombreLower.endsWith(presentacionLower) || 
            nombreLower.endsWith(` - ${presentacionLower}`) ||
            nombreLower.endsWith(`- ${presentacionLower}`)) {
          return nombreTrim; // Ya contiene la presentación, no agregar
        }
        
        // Si no la contiene, agregarla
        return `${nombreTrim} - ${presentacionTrim}`;
      };
      
      const nombreCompleto = obtenerNombreCompleto(data.nombre, data.presentacion);
      pushToast(`✅ ${nombreCompleto || codigoLimpio} detectado`, "ok");
    } catch (err) {
      // Manejar errores 404 silenciosamente (producto no encontrado es esperado)
      if (err.isNotFound || err.message?.includes('404') || err.message?.includes('No existe')) {
        setAliasModal({
          open: true,
          codigo: codigoLimpio,
          busqueda: "",
          seleccionado: null,
        });
        pushToast("⚠️ Código no existe, agrega un alias", "warn");
      } else {
        // Solo mostrar error para otros tipos de errores
        console.error('Error buscando producto:', err);
        pushToast("❌ Error buscando producto", "err");
      }
    }
  };

  // Escaneo automático como en Registros del día
  const handleScanInput = (value) => {
    scanBufferRef.current = value;
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    
    // Detectar si estamos en la app móvil Android usando Capacitor
    const isMobileApp = typeof window !== 'undefined' && 
      window.Capacitor && 
      window.Capacitor.isNativePlatform && 
      window.Capacitor.isNativePlatform() &&
      window.Capacitor.getPlatform() === 'android';

    // En la app móvil, usar un delay más corto para detectar escaneo rápido
    // En web, usar el delay normal
    const delay = isMobileApp ? 100 : SCAN_DELAY;
    
    scanTimeoutRef.current = setTimeout(() => {
      const finalCode = scanBufferRef.current.trim();
      scanBufferRef.current = "";
      if (finalCode.length > 3) {
        buscarProductoPorCodigo(finalCode);
        // El código se mantiene hasta que se agregue la devolución
        setTimeout(() => {
          loteInputRef.current?.focus();
        }, 100);
      }
    }, delay);
  };

  const aliasResultados = useMemo(() => {
    if (!aliasModal.open) return [];
    const termino = aliasModal.busqueda.trim().toLowerCase();
    if (!termino) return inventarioRef.slice(0, 40);
    return inventarioRef
      .filter(
        (p) =>
          p.nombre?.toLowerCase().includes(termino) ||
          p.codigo?.toLowerCase().includes(termino)
      )
      .slice(0, 40);
  }, [aliasModal, inventarioRef]);

  const guardarAlias = async () => {
    if (!aliasModal.seleccionado) {
      pushToast("Selecciona un producto principal", "warn");
      return;
    }
    
    if (!aliasModal.codigo || !aliasModal.codigo.trim()) {
      pushToast("El código no puede estar vacío", "warn");
      return;
    }
    
    try {
      await authFetch(`${serverUrl}/inventario/alias/crear`, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nuevo_codigo: aliasModal.codigo.trim(),
          codigo_principal: aliasModal.seleccionado.codigo,
        }),
      });
      
      // Si llegamos aquí, el alias se guardó correctamente
      setForm((prev) => ({
        ...prev,
        codigo: aliasModal.codigo.trim(),
        nombre: aliasModal.seleccionado.nombre || prev.nombre || "",
        presentacion: aliasModal.seleccionado.presentacion || prev.presentacion || "",
        lote:
          prev.lote ||
          aliasModal.seleccionado.lote ||
          "",
      }));
      setAliasModal({
        open: false,
        codigo: "",
        busqueda: "",
        seleccionado: null,
      });
      pushToast("✅ Alias guardado correctamente", "ok");
    } catch (err) {
      console.error("guardarAlias error:", err);
      // authFetch lanza un Error con el mensaje del servidor
      const errorMessage = err?.message || err?.error || "Error al guardar alias";
      pushToast(`❌ ${errorMessage}`, "error");
    }
  };

  const handleAgregar = async () => {
    if (!form.codigo.trim()) return pushToast("Escanea un código", "warn");
    if (!form.nombre.trim()) return pushToast("Nombre requerido", "warn");
    if (!form.cantidad || Number(form.cantidad) <= 0)
      return pushToast("Cantidad inválida", "warn");
    
    // Para calidad, validar que se haya seleccionado un área
    if (tipo === "calidad" && !form.area) {
      return pushToast("Selecciona un área", "warn");
    }

    try {
      const body = {
        codigo: form.codigo.trim(),
        nombre: form.nombre.trim(),
        presentacion: form.presentacion?.trim() || "",
        lote: form.lote.trim(),
        cantidad: Number(form.cantidad),
        activo: false,
      };
      
      // Agregar área solo si es calidad
      if (tipo === "calidad" && form.area) {
        body.area = form.area;
      }
      
      await authFetch(`${serverUrl}/dia/devoluciones/${tipo}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      pushToast("✅ Devolución agregada");
      setForm({ codigo: "", nombre: "", presentacion: "", lote: "", cantidad: "", area: "" });
      cargarRegistros();
      
      // Para reacondicionados, retail, cubbo y regulatorio (AAVC), devolver foco a código
      const tiposConFocoEnCodigo = ["reacondicionados", "retail", "cubbo", "regulatorio"];
      if (tiposConFocoEnCodigo.includes(tipo)) {
        setTimeout(() => {
          codigoInputRef.current?.focus();
        }, 100);
      }
    } catch (err) {
      console.error("handleAgregar:", err);
      pushToast("❌ Error al agregar", "err");
    }
  };

  const handleAgregarArea = async () => {
    if (!nuevaAreaInput.trim()) {
      pushToast("Ingresa un nombre para el área", "warn");
      return;
    }
    try {
      const nueva = await authFetch(`${serverUrl}/devoluciones/calidad/areas`, {
        method: "POST",
        body: JSON.stringify({ nombre: nuevaAreaInput.trim() }),
      });
      setAreasCalidad((prev) => [...prev, nueva]);
      setForm((prev) => ({ ...prev, area: nueva.nombre }));
      setNuevaAreaInput("");
      setMostrarInputArea(false);
      pushToast("✅ Área agregada");
    } catch (err) {
      console.error("Error agregando área:", err);
      pushToast("❌ Error al agregar área", "err");
    }
  };

  const handleEditarCampo = (id, campo, valor) => {
    setEditing((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [campo]: valor,
      },
    }));
  };

  const borrarFila = async (id) => {
    const confirmado = await showConfirm("¿Estás seguro de borrar este registro?");
    if (!confirmado) return;
    setGuardandoFila((prev) => ({ ...prev, [id]: true }));
    try {
      await authFetch(`${serverUrl}/dia/devoluciones/${tipo}/${id}`, {
        method: "DELETE",
      });
      pushToast("✅ Registro borrado");
      cargarRegistros();
    } catch (err) {
      console.error("borrarFila:", err);
      pushToast("❌ Error al borrar", "err");
    } finally {
      setGuardandoFila((prev) => ({ ...prev, [id]: false }));
    }
  };

  const toggleActivo = async (row, value) => {
    // Verificar permiso para activar/desactivar productos
    if (!can("action:activar-productos")) {
      pushToast("⚠️ No tienes autorización para activar o desactivar productos", "warn");
      return;
    }

    // En clientes, si el producto está marcado como "no apto" (activo = 0), no permitir activarlo
    if (tipo === "clientes" && value && row.activo === 0) {
      pushToast("⚠️ Este producto no es apto y no se puede activar", "warn");
      return;
    }

    try {
      await authFetch(`${serverUrl}/dia/devoluciones/${tipo}/${row.id}`, {
        method: "PUT",
        body: JSON.stringify({ activo: value }),
      });
      const updated = items.map((item) =>
        item.id === row.id ? { ...item, activo: value ? 1 : 0 } : item
      );
      setItems(updated);
      syncTipo?.(tipo, updated);
      pushToast(`✅ Producto ${value ? 'activado' : 'desactivado'} correctamente`, "ok");
    } catch (err) {
      console.error("toggleActivo:", err);
      const errorMsg = err.message || "Error al actualizar estado";
      if (errorMsg.includes("Sin permiso") || errorMsg.includes("403") || errorMsg.includes("No tienes autorización")) {
        pushToast("⚠️ No tienes autorización para activar o desactivar productos", "warn");
      } else {
        pushToast(`❌ Error al actualizar estado: ${errorMsg}`, "err");
      }
    }
  };

  const abrirResumen = async () => {
        // Abrir el modal inmediatamente
    setResumenModal({ open: true, loading: true, data: [] });
        try {
      const data = await authFetch(
        `${serverUrl}/dia/devoluciones/${tipo}/resumen`
      );
            setResumenModal({
        open: true,
        loading: false,
        data: Array.isArray(data) ? data : [],
      });
    } catch (err) {
      console.error("❌ abrirResumen:", err);
      pushToast("❌ Error al cargar resumen", "err");
      // Mantener el modal abierto pero mostrar error
      setResumenModal({ 
        open: true, 
        loading: false, 
        data: [] 
      });
    }
  };

  const cerrarResumen = () => {
    setResumenModal({ open: false, loading: false, data: [] });
  };

  const toggleResumen = async (grupo, value) => {
    // Verificar permiso para activar/desactivar productos
    if (!can("action:activar-productos")) {
      pushToast("⚠️ No tienes autorización para activar o desactivar productos", "warn");
      return;
    }

    try {
      const payload = {
        nombre: grupo.nombre,
        activo: value,
      };
      const resp = await authFetch(
        `${serverUrl}/dia/devoluciones/${tipo}/activar`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        }
      );
      const updatedRows = Array.isArray(resp?.registros)
        ? resp.registros
        : [];
      // Actualizar todos los items con el mismo nombre
      const merged = items.map((row) => {
        if (row.nombre === grupo.nombre) {
          const match = updatedRows.find((r) => r.id === row.id);
          return match ? { ...match, activo: value ? 1 : 0 } : { ...row, activo: value ? 1 : 0 };
        }
        return row;
      });
      setItems(merged);
      syncTipo?.(tipo, merged);
      setResumenModal((prev) => ({
        ...prev,
        data: prev.data.map((g) =>
          g.nombre === grupo.nombre
            ? {
                ...g,
                todosActivos: value,
                algunoActivo: value,
              }
            : g
        ),
      }));
    } catch (err) {
      console.error("toggleResumen:", err);
      pushToast("❌ Error al actualizar grupo", "err");
    }
  };

  const guardarActivaciones = async () => {
    // Verificar permiso para activar/desactivar productos
    if (!can("action:activar-productos")) {
      pushToast("⚠️ No tienes autorización para activar o desactivar productos", "warn");
      return;
    }

    try {
      const gruposActivos = resumenModal.data.filter((g) => g.todosActivos);
      if (gruposActivos.length === 0) {
        pushToast("ℹ️ No hay grupos activos para guardar", "info");
        return;
      }

      // Procesar todos los grupos activos por nombre
      const promesas = gruposActivos.map((grupo) =>
        authFetch(`${serverUrl}/dia/devoluciones/${tipo}/activar`, {
          method: "PUT",
          body: JSON.stringify({
            nombre: grupo.nombre,
            activo: true,
          }),
        })
      );

      const resultados = await Promise.all(promesas);
      
      // Actualizar la tabla principal con todos los registros actualizados
      const todosLosRegistros = resultados
        .map((r) => Array.isArray(r?.registros) ? r.registros : [])
        .flat();
      
      // Actualizar todos los items con los nombres activados
      const nombresActivos = gruposActivos.map((g) => g.nombre);
      const merged = items.map((row) => {
        if (nombresActivos.includes(row.nombre)) {
          const match = todosLosRegistros.find((r) => r.id === row.id);
          return match ? { ...match, activo: 1 } : { ...row, activo: 1 };
        }
        return row;
      });
      
      setItems(merged);
      syncTipo?.(tipo, merged);
      
      pushToast(`✅ ${gruposActivos.length} grupo(s) activado(s)`);
      cerrarResumen();
    } catch (err) {
      console.error("guardarActivaciones:", err);
      pushToast("❌ Error al guardar activaciones", "err");
    }
  };

  const handleImportar = async () => {
    // Verificar permiso para importar productos (requiere activar productos)
    if (!can("action:activar-productos")) {
      pushToast("⚠️ No tienes autorización para importar productos", "warn");
      return;
    }

    try {
      // Obtener todos los productos activos de la tabla actual
      // Aceptar diferentes formatos: número 1, string "1", booleano true, o cualquier valor truthy
      const productosActivos = items.filter((item) => {
        const activo = item.activo;
        // Convertir a número si es string, luego validar
        const activoNum = typeof activo === 'string' ? Number(activo) : activo;
        // Validar activo: aceptar 1, true, o cualquier valor truthy que no sea 0, false, null, undefined, NaN
        if (activoNum === 1 || activo === true) return true;
        if (activoNum === 0 || activo === false || activo === null || activo === undefined || isNaN(activoNum)) return false;
        // Para cualquier otro valor numérico, verificar si es > 0
        return Number(activoNum) > 0;
      });
      
      if (productosActivos.length === 0) {
        pushToast("ℹ️ No hay productos activos en la tabla para importar", "info");
        return;
      }

      // Agrupar por nombre + presentación + lote para enviar
      const gruposMap = new Map();
      productosActivos.forEach((item) => {
        const key = `${item.nombre}@@${item.presentacion || ''}@@${item.lote || ''}`;
        if (!gruposMap.has(key)) {
          gruposMap.set(key, {
            nombre: item.nombre,
            codigo: item.codigo,
            presentacion: item.presentacion || '',
            cantidad: 0,
            lote: item.lote || ''
          });
        }
        gruposMap.get(key).cantidad += Number(item.cantidad || 0);
      });
      const grupos = Array.from(gruposMap.values());
      const areaLabel = TAB_LABEL_MAP[tipo] || tipo;

      // Enviar notificación con botones de aceptar/rechazar
      addNotification({
        title: "Solicitud de Importación",
        message: `Se solicita importar ${productosActivos.length} producto(s) activo(s) desde Devoluciones (${areaLabel}) a Picking.\n\nProductos: ${grupos.map(g => `${g.nombre} (${g.cantidad} pzs)`).join(", ")}`,
        es_confirmacion: true, // Marcar como confirmación para que se borre al aceptar/rechazar
        data: {
          tipo: "importacion",
          area: tipo,
          grupos: grupos,
          serverUrl,
          tipoDevolucion: tipo
        },
        read: false,
        onAccept: async () => {
          await importarProductos(grupos, tipo);
        },
        onReject: () => {
          pushToast("❌ Importación rechazada", "info");
        }
      });

      pushToast("📥 Solicitud de importación enviada. Revisa las notificaciones.", "info");
    } catch (err) {
      console.error("handleImportar:", err);
      pushToast("❌ Error al enviar solicitud de importación", "err");
    }
  };

  const importarProductos = async (grupos, tipoDevolucion) => {
    try {
      const response = await authFetch(`${serverUrl}/devoluciones/importar`, {
        method: "POST",
        body: JSON.stringify({
          grupos: grupos.map(g => ({
            nombre: g.nombre,
            codigo: g.codigo,
            presentacion: g.presentacion || '',
            cantidad: g.cantidad || g.total || 0,
            lote: g.lote || ''
          })),
          area: tipoDevolucion,
          tipo: tipoDevolucion
        })
      });

      if (response && response.ok !== false) {
        pushToast(`✅ ${response.productosImportados || grupos.length} producto(s) importado(s) exitosamente a Picking`, "ok");
        // Recargar productos de picking
        window.dispatchEvent(new CustomEvent('picking_actualizado'));
      } else {
        pushToast("❌ Error al importar productos", "err");
      }
    } catch (err) {
      console.error("importarProductos:", err);
      pushToast("❌ Error al importar productos", "err");
    }
  };

  const handleImportarNoAptos = async () => {
    // Verificar permiso para importar productos (requiere activar productos)
    if (!can("action:activar-productos")) {
      pushToast("⚠️ No tienes autorización para importar productos", "warn");
      return;
    }

    const confirmado = await showConfirm("¿Importar todos los productos NO APTOS a Control de Calidad? Los productos se eliminarán de Clientes.");
    if (!confirmado) {
      return;
    }

    try {
      const response = await authFetch(`${serverUrl}/devoluciones/clientes/importar-no-aptos`, {
        method: "POST"
      });

      if (response.success) {
        pushToast(`✅ ${response.importados} productos no aptos importados a Control de Calidad`, "ok");
        // Recargar datos
        window.dispatchEvent(new CustomEvent('productosActualizados'));
        // Recargar página de control de calidad si está abierta
        window.dispatchEvent(new CustomEvent('calidad_registros_actualizados'));
      } else {
        pushToast(response.message || "❌ Error al importar productos no aptos", "err");
      }
    } catch (err) {
      console.error("handleImportarNoAptos:", err);
      pushToast("❌ Error al importar productos no aptos", "err");
    }
  };

  // Si solo se necesita el botón de activación
  const buttonRefActivacion = useRef(null);
  
  useEffect(() => {
    if (!soloBotonActivacion) return;
    
    const btn = buttonRefActivacion.current;
    if (!btn) return;
    
    const handleClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      abrirResumen();
    };
    
    btn.addEventListener('click', handleClick);
    
    return () => {
      btn.removeEventListener('click', handleClick);
    };
  }, [soloBotonActivacion, tipo]);
  
  if (soloBotonActivacion) {
    return (
      <>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            ref={buttonRefActivacion}
            className="btn-activacion" 
            type="button"
          >
            ⚡ 
          </button>
          <button
            className="btn-green" 
            onClick={handleImportar}
            type="button"
            title="Importar productos activos a Picking"
          >
            📥
          </button>
          {tipo === "clientes" && (
            <button
              className="btn-orange" 
              onClick={handleImportarNoAptos}
              type="button"
              title="Importar productos NO APTOS a Control de Calidad"
            >
              ⚠️
            </button>
          )}
        </div>

        {resumenModal.open && (
          <div 
            className="activation-modal-overlay" 
            onClick={cerrarResumen}
            style={{ 
              position: 'fixed', 
              top: 0, 
              left: 0, 
              right: 0, 
              bottom: 0,
              zIndex: 12000 
            }}
          >
            <div
              className="activation-modal"
              onClick={(e) => e.stopPropagation()}
              style={{ zIndex: 12001 }}
            >
              <div className="activation-modal__header">
                <h4>Activación por producto</h4>
                <button className="btn-plain" onClick={cerrarResumen}>
                  ✕
                </button>
              </div>
              {resumenModal.loading ? (
                <p>Cargando...</p>
              ) : resumenModal.data.length === 0 ? (
                <p>No hay productos para mostrar.</p>
              ) : (
                <>
                  <ul className="activation-list">
                    {resumenModal.data.map((grupo) => (
                      <li key={grupo.nombre}>
                        <div>
                          <strong>{grupo.nombre}</strong>
                          {grupo.codigo && grupo.codigo !== "—" && (
                            <span className="activation-code">{grupo.codigo}</span>
                          )}
                          {grupo.lote && grupo.lote !== "—" && (
                            <span className="activation-lote">
                              Lotes: {grupo.lote}
                            </span>
                          )}
                        </div>
                        <div className="activation-controls">
                          <span>{grupo.total} pzs</span>
                          <label className="switch" style={{ opacity: !can("action:activar-productos") ? 0.5 : 1 }}>
                            <input
                              type="checkbox"
                              checked={grupo.todosActivos}
                              disabled={!can("action:activar-productos")}
                              title={!can("action:activar-productos") ? "No tienes autorización para activar/desactivar productos" : ""}
                              onChange={(e) =>
                                toggleResumen(grupo, e.target.checked)
                              }
                            />
                            <span className="slider" />
                          </label>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="activation-modal__footer">
                    <button 
                      className="btn-green" 
                      onClick={guardarActivaciones}
                      style={{ 
                        marginTop: '16px', 
                        padding: '10px 20px',
                        width: '100%'
                      }}
                    >
                      💾
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  // Identificar tablas específicas que necesitan estilos reducidos
  const tablasReducidas = ["reacondicionados", "retail", "cubbo", "regulatorio"];
  const esTablaReducida = tablasReducidas.includes(tipo);
  
  return (
    <div 
      className={`gestion-devoluciones ${tipo !== "calidad" ? "gestion-pda-tabs" : ""} ${esTablaReducida ? "tabla-reducida" : ""}`}
      data-tipo={tipo}
    >
      <div className="gestion-header">
        <h3>{areaLabel}</h3>
      </div>

      <div className="gestion-form">
        <div className="gestion-form-row">
          {/* Campo Área solo para Calidad - al principio */}
          {tipo === "calidad" && (
            <label>
              Área
              <div style={{ display: "flex", gap: "8px", alignItems: "center", width: "100%" }}>
                <select
                  value={form.area}
                  onChange={(e) => handleFormChange("area", e.target.value)}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <option value="">Seleccione un área</option>
                  {areasCalidad.map((area) => (
                    <option key={area.id} value={area.nombre}>
                      {area.nombre}
                    </option>
                  ))}
                </select>
                {!mostrarInputArea ? (
                  <button
                    className="btn-plain"
                    onClick={() => setMostrarInputArea(true)}
                    style={{ whiteSpace: "nowrap" }}
                    type="button"
                    title="Agregar nueva área"
                  >
                    ➕
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: "4px" }}>
                    <input
                      type="text"
                      value={nuevaAreaInput}
                      onChange={(e) => setNuevaAreaInput(e.target.value)}
                      placeholder="Nombre área"
                      style={{ width: "120px", padding: "6px 10px", border: "1px solid var(--borde-medio)", borderRadius: "var(--radio-md)", background: "var(--fondo-input)", color: "var(--texto-principal)", fontSize: "0.85rem" }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAgregarArea();
                      }}
                    />
                    <button
                      className="btn-green"
                      onClick={handleAgregarArea}
                      type="button"
                    >
                      ✓
                    </button>
                    <button
                      className="btn-plain"
                      onClick={() => {
                        setMostrarInputArea(false);
                        setNuevaAreaInput("");
                      }}
                      type="button"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </label>
          )}

          <label>
            Código
            <input
              type="text"
              ref={codigoInputRef}
              value={form.codigo}
              onChange={(e) => {
                const val = e.target.value;
                handleFormChange("codigo", val);
                handleScanInput(val);
              }}
              onBlur={() => {
                if (form.codigo.trim()) {
                  buscarProductoPorCodigo(form.codigo.trim());
                }
              }}
              onKeyDown={(e) => {
                // Capturar Enter de DataWedge (puede venir como Enter, Return, o keyCode 13)
                const isEnter = e.key === "Enter" || 
                                e.key === "Return" || 
                                e.keyCode === 13 || 
                                e.which === 13;
                if (isEnter) {
                  e.preventDefault();
                  e.stopPropagation();
                  const codigoLimpio = form.codigo.trim();
                  if (codigoLimpio.length > 3) {
                    console.log("📱 [DataWedge] Enter detectado en Devoluciones, procesando código:", codigoLimpio);
                    buscarProductoPorCodigo(codigoLimpio);
                  }
                }
              }}
              onKeyPress={(e) => {
                // Capturar también keyPress para DataWedge
                if (e.key === "Enter" || e.charCode === 13) {
                  e.preventDefault();
                  const codigoLimpio = form.codigo.trim();
                  if (codigoLimpio.length > 3) {
                    buscarProductoPorCodigo(codigoLimpio);
                  }
                }
              }}
              placeholder="Escanea el código"
              inputMode="none"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>

          <label style={{ flex: "0 0 220px", width: "220px", minWidth: "220px" }}>
            Nombre
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => handleFormChange("nombre", e.target.value)}
              placeholder="Nombre detectado"
              readOnly
              style={{ width: "100%" }}
            />
          </label>

          <label style={{ flex: "0 0 200px", width: "200px", minWidth: "200px" }}>
            Presentación
            <input
              type="text"
              value={form.presentacion}
              onChange={(e) => handleFormChange("presentacion", e.target.value)}
              placeholder="Presentación detectada"
              readOnly
              style={{ width: "100%" }}
            />
          </label>

          <label style={{ flex: "0 0 220px", width: "220px", minWidth: "220px" }}>
            Lote
            <input
              type="text"
              ref={loteInputRef}
              value={form.lote}
              onChange={(e) => handleFormChange("lote", e.target.value)}
              placeholder="Lote (editable)"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  document.querySelector('input[type="number"]')?.focus();
                }
              }}
              style={{ width: "100%" }}
            />
          </label>

          <label>
            Cantidad
            <input
              type="number"
              min="1"
              value={form.cantidad}
              onChange={(e) => handleFormChange("cantidad", e.target.value)}
              placeholder="Ej. 10"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleAgregar();
                }
              }}
            />
          </label>
        </div>

        <div className="gestion-form-row-boton">
          <button 
            className={`btn-green ${esTablaReducida ? 'btn-reducido' : ''}`}
            onClick={handleAgregar}
          >
            + Agregar
          </button>
        </div>
      </div>

      <div className="gestion-table-wrapper">
        {loading ? (
          <div className="gestion-loader">Cargando...</div>
        ) : items.length === 0 ? (
          <p className="gestion-empty">Sin devoluciones registradas.</p>
        ) : (
          <table className="gestion-table" style={{ tableLayout: 'auto', width: '100%', borderCollapse: 'separate', borderSpacing: '0' }}>
            <thead>
              <tr>
                {tipo === "calidad" && <th>Área</th>}
                <th>Código</th>
                <th>Nombre</th>
                <th>Presentación</th>
                <th>Lote</th>
                <th>Cantidad</th>
                <th>Activo</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const edit = editing[row.id] || {
                  lote: row.lote ?? "",
                  cantidad: row.cantidad ?? 0,
                };
                return (
                  <tr 
                    key={row.id} 
                    style={{ position: 'relative', cursor: tipo !== "clientes" ? 'pointer' : 'default' }}
                    onClick={(e) => {
                      // Solo abrir modal si no es "Clientes" y no se hizo clic en un input o botón
                      if (tipo !== "clientes" && !e.target.closest('input, button, label')) {
                        setModalEvidencias({
                          open: true,
                          registro: row,
                          evidencias: [],
                          subiendo: false,
                          tipo: tipo // Guardar el tipo en el estado del modal
                        });
                      }
                    }}
                  >
                    {tipo === "calidad" && <td style={{ overflow: 'visible', position: 'relative', padding: esTablaReducida ? '4px 3px' : '10px', fontSize: esTablaReducida ? '0.7rem' : 'inherit' }}>{row.area || "—"}</td>}
                    <td style={{ overflow: 'visible', position: 'relative', padding: esTablaReducida ? '4px 3px' : '10px', fontSize: esTablaReducida ? '0.7rem' : 'inherit' }}>{row.codigo || "—"}</td>
                    <td style={{ overflow: 'visible', position: 'relative', padding: esTablaReducida ? '4px 3px' : '10px', fontSize: esTablaReducida ? '0.7rem' : 'inherit' }}>{row.nombre || "—"}</td>
                    <td style={{ overflow: 'visible', position: 'relative', padding: esTablaReducida ? '4px 3px' : '10px', fontSize: esTablaReducida ? '0.7rem' : 'inherit' }}>{row.presentacion || "—"}</td>
                    <td style={{ overflow: 'visible', position: 'relative', padding: esTablaReducida ? '4px 3px' : '10px', minWidth: esTablaReducida ? '100px' : '180px', width: esTablaReducida ? '100px' : '180px' }}>
                      <input
                        type="text"
                        value={edit.lote}
                        onChange={(e) =>
                          handleEditarCampo(row.id, "lote", e.target.value)
                        }
                        className={`gestion-table-input-lote ${esTablaReducida ? 'input-reducido' : ''}`}
                        style={{
                          width: '100%',
                          minWidth: esTablaReducida ? '90px' : '160px',
                          padding: esTablaReducida ? '4px 6px' : '14px 16px',
                          fontSize: esTablaReducida ? '0.75rem' : '20px',
                          fontWeight: esTablaReducida ? '500' : '600',
                          minHeight: esTablaReducida ? '28px' : '55px',
                          height: esTablaReducida ? '28px' : 'auto',
                          boxSizing: 'border-box',
                          display: 'block',
                          visibility: 'visible',
                          opacity: 1,
                          background: 'var(--fondo-input)',
                          color: 'var(--texto-principal)',
                          border: esTablaReducida ? '1px solid var(--azul-primario)' : '2px solid var(--azul-primario)',
                          borderRadius: esTablaReducida ? 'var(--radio-sm)' : 'var(--radio-md)',
                          position: 'relative',
                          zIndex: 99999,
                          pointerEvents: 'auto',
                          touchAction: 'manipulation',
                          WebkitAppearance: 'none',
                          MozAppearance: 'none',
                          appearance: 'none',
                          boxShadow: 'var(--sombra-sm)',
                          lineHeight: '1.5',
                          margin: '0'
                        }}
                      />
                    </td>
                    <td style={{ overflow: 'visible', position: 'relative', padding: esTablaReducida ? '4px 3px' : '10px', minWidth: esTablaReducida ? '100px' : '180px', width: esTablaReducida ? '100px' : '180px' }}>
                      <input
                        type="number"
                        min="0"
                        value={edit.cantidad}
                        onChange={(e) =>
                          handleEditarCampo(row.id, "cantidad", e.target.value)
                        }
                        className={`gestion-table-input-cantidad ${esTablaReducida ? 'input-reducido' : ''}`}
                        style={{
                          width: '100%',
                          minWidth: esTablaReducida ? '90px' : '160px',
                          padding: esTablaReducida ? '4px 6px' : '14px 16px',
                          fontSize: esTablaReducida ? '0.75rem' : '20px',
                          fontWeight: esTablaReducida ? '500' : '600',
                          minHeight: esTablaReducida ? '28px' : '55px',
                          height: esTablaReducida ? '28px' : 'auto',
                          boxSizing: 'border-box',
                          display: 'block',
                          visibility: 'visible',
                          opacity: 1,
                          background: 'var(--fondo-input)',
                          color: 'var(--texto-principal)',
                          border: esTablaReducida ? '1px solid var(--azul-primario)' : '2px solid var(--azul-primario)',
                          borderRadius: esTablaReducida ? 'var(--radio-sm)' : 'var(--radio-md)',
                          position: 'relative',
                          zIndex: 99999,
                          pointerEvents: 'auto',
                          touchAction: 'manipulation',
                          WebkitAppearance: 'none',
                          MozAppearance: 'none',
                          appearance: 'none',
                          boxShadow: 'var(--sombra-sm)',
                          lineHeight: '1.5',
                          margin: '0'
                        }}
                      />
                    </td>
                    <td>
                      <label className="switch" style={{ opacity: tipo === "clientes" && row.activo === 0 ? 0.5 : (!can("action:activar-productos") ? 0.5 : 1) }}>
                        <input
                          type="checkbox"
                          checked={Boolean(row.activo)}
                          disabled={(tipo === "clientes" && row.activo === 0) || !can("action:activar-productos")}
                          onChange={(e) => toggleActivo(row, e.target.checked)}
                          title={!can("action:activar-productos") ? "No tienes autorización para activar/desactivar productos" : ""}
                        />
                        <span className="slider" />
                      </label>
                      {tipo === "clientes" && row.activo === 0 && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--error)', marginLeft: '8px' }}>
                          ⚠️ No apto
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <button
                          type="button"
                          className="btn-plain"
                          onClick={(e) => {
                            e.stopPropagation();
                            abrirCompartir(row);
                          }}
                          title="Compartir por chat"
                        >
                          📤
                        </button>
                        <button
                          className="btn-borrar"
                          disabled={guardandoFila[row.id]}
                          onClick={(e) => {
                            e.stopPropagation();
                            borrarFila(row.id);
                          }}
                        >
                          {guardandoFila[row.id] ? "..." : "🗑️ Borrar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {compartirOpen && (
        <div className="modal-overlay" onClick={() => setCompartirOpen(false)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "520px", width: "92%" }}
          >
            <div className="modal-header">
              <h3>📤 Compartir devolución por chat</h3>
              <button className="modal-close" onClick={() => setCompartirOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <label style={{ display: "block", marginBottom: "8px", fontWeight: "600" }}>
                Enviar a
              </label>
              <select
                value={compartirDestino}
                onChange={(e) => setCompartirDestino(e.target.value)}
                style={{ width: "100%" }}
              >
                <option value="">Selecciona un usuario</option>
                {compartirUsuarios.map((u) => {
                  const value = u.nickname || u.name;
                  if (!value) return null;
                  const nombre = value || `Usuario ${u.id}`;
                  return (
                    <option key={u.id} value={value}>
                      {nombre}
                    </option>
                  );
                })}
              </select>

              <div style={{ marginTop: "12px", fontSize: "0.85rem", color: "var(--texto-secundario)" }}>
                Vista previa:
              </div>
              <pre
                style={{
                  marginTop: "6px",
                  background: "var(--fondo-input)",
                  border: "1px solid var(--borde-sutil)",
                  borderRadius: "8px",
                  padding: "10px",
                  fontSize: "0.85rem",
                  whiteSpace: "pre-wrap",
                }}
              >
                {construirMensajeCompartir(compartirRegistro)}
              </pre>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setCompartirOpen(false)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={enviarCompartir} disabled={compartiendo}>
                {compartiendo ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {resumenModal.open && (
    <div className="activation-modal-overlay" onClick={cerrarResumen}>
      <div
        className="activation-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="activation-modal__header">
          <h4>Activación por producto</h4>
          <button className="btn-plain" onClick={cerrarResumen}>
            ✕
          </button>
        </div>
        {resumenModal.loading ? (
          <p>Cargando...</p>
        ) : resumenModal.data.length === 0 ? (
          <p>No hay productos para mostrar.</p>
        ) : (
          <>
            <ul className="activation-list">
              {resumenModal.data.map((grupo) => (
                <li key={`${grupo.nombre}-${grupo.lote}`}>
                  <div>
                    <strong>{grupo.nombre}</strong>
                    <span className="activation-code">{grupo.codigo || "—"}</span>
                    <span className="activation-lote">
                      Lote: {grupo.lote || "—"}
                    </span>
                  </div>
                  <div className="activation-controls">
                    <span>{grupo.total} pzs</span>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={grupo.todosActivos}
                        onChange={(e) =>
                          toggleResumen(grupo, e.target.checked)
                        }
                      />
                      <span className="slider" />
                    </label>
                  </div>
                </li>
              ))}
            </ul>
            <div className="activation-modal__footer">
              <button 
                className="btn-green" 
                onClick={guardarActivaciones}
              >
                💾 Guardar cambios
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )}

  {aliasModal.open && (
    <div
      className="activation-modal-overlay"
      onClick={() =>
        setAliasModal({ open: false, codigo: "", busqueda: "", seleccionado: null })
      }
    >
      <div
        className="activation-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '500px', width: '90vw', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ padding: '12px', borderBottom: '1px solid var(--borde-sutil)' }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>Agregar código alterno</h4>
          <p style={{ 
            margin: 0,
            padding: '6px 10px', 
            background: 'var(--fondo-secundario)', 
            borderRadius: 'var(--radio-sm)',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            fontSize: '0.85rem'
          }}>
            <strong>Nuevo código:</strong> <span style={{ color: 'var(--azul-primario)', fontWeight: '600' }}>{aliasModal.codigo}</span>
          </p>
        </div>
        <div style={{ padding: '12px', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <input
            type="text"
            placeholder="Buscar en inventario (nombre o código)"
            value={aliasModal.busqueda}
            onChange={(e) =>
              setAliasModal((prev) => ({ ...prev, busqueda: e.target.value }))
            }
            style={{ 
              marginBottom: '8px', 
              padding: '6px 10px',
              fontSize: '0.85rem'
            }}
          />
          <div className="alias-results" style={{ flex: 1, minHeight: 0 }}>
            {aliasResultados.length === 0 ? (
              <div style={{ padding: '15px', textAlign: 'center', color: 'var(--texto-secundario)', fontSize: '0.8rem' }}>
                {aliasModal.busqueda.trim() ? 'No se encontraron productos' : 'Escribe para buscar productos'}
              </div>
            ) : (
              aliasResultados.map((prod) => (
                <button
                  key={prod.codigo}
                  className={`alias-item ${
                    aliasModal.seleccionado?.codigo === prod.codigo ? "selected" : ""
                  }`}
                  onClick={() =>
                    setAliasModal((prev) => ({ ...prev, seleccionado: prod }))
                  }
                  title={`${prod.codigo} - ${prod.nombre}${prod.presentacion ? ` (${prod.presentacion})` : ''}`}
                >
                  <strong>{prod.codigo}</strong>
                  <span>{prod.nombre}</span>
                  {prod.presentacion && (
                    <span style={{ 
                      fontSize: '0.7rem', 
                      opacity: 0.7,
                      fontStyle: 'italic',
                      flexShrink: 0
                    }}>
                      ({prod.presentacion})
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
        <div className="alias-actions">
          <button className="btn-plain" onClick={guardarAlias}>
            Guardar alias
          </button>
          <button
            className="btn-plain"
            onClick={() =>
              setAliasModal({
                open: false,
                codigo: "",
                busqueda: "",
                seleccionado: null,
              })
            }
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )}

      {/* Modal de evidencias para otras áreas */}
      {modalEvidencias.open && modalEvidencias.registro && (
    <div 
      className="activation-modal-overlay" 
      onClick={() => setModalEvidencias({ open: false, registro: null, evidencias: [], subiendo: false, tipo: null })}
    >
      <div
        className="activation-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '90vw', width: '600px' }}
      >
        <div className="activation-modal__header">
          <h4>Evidencias - {modalEvidencias.registro.nombre || modalEvidencias.registro.codigo}</h4>
          <button 
            className="btn-plain" 
            onClick={() => setModalEvidencias({ open: false, registro: null, evidencias: [], subiendo: false, tipo: null })}
          >
            ✕
          </button>
        </div>
        
        <div style={{ padding: '20px' }}>
          {/* Datos del registro */}
          <div style={{ marginBottom: '20px', padding: '15px', background: 'var(--fondo-secundario)', borderRadius: 'var(--radio-md)' }}>
            <h5 style={{ marginTop: 0, marginBottom: '10px' }}>Datos del registro</h5>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.9rem' }}>
              <div><strong>Código:</strong> {modalEvidencias.registro.codigo || "—"}</div>
              <div><strong>Nombre:</strong> {modalEvidencias.registro.nombre || "—"}</div>
              {modalEvidencias.registro.presentacion && (
                <div><strong>Presentación:</strong> {modalEvidencias.registro.presentacion}</div>
              )}
              <div><strong>Lote:</strong> {modalEvidencias.registro.lote || "—"}</div>
              <div><strong>Cantidad:</strong> {modalEvidencias.registro.cantidad || 0}</div>
              {modalEvidencias.registro.area && (
                <div><strong>Área:</strong> {modalEvidencias.registro.area}</div>
              )}
            </div>
          </div>

          {/* Inputs ocultos para archivos */}
          <input
            ref={fileInputRef}
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
                evidencias: [...prev.evidencias, ...nuevasEvidencias]
              }));
            }}
            style={{ display: 'none' }}
          />

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              const nuevasEvidencias = files.map(file => ({
                file,
                preview: URL.createObjectURL(file),
                idTemp: Date.now() + Math.random()
              }));
              setModalEvidencias(prev => ({
                ...prev,
                evidencias: [...prev.evidencias, ...nuevasEvidencias]
              }));
            }}
            style={{ display: 'none' }}
          />

          {/* Botones para agregar evidencias */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <button
              className="btn-green"
              onClick={() => fileInputRef.current?.click()}
              style={{ flex: 1, minWidth: '150px' }}
            >
              📁 Seleccionar archivos
            </button>
            <button
              className="btn-green"
              onClick={() => cameraInputRef.current?.click()}
              style={{ flex: 1, minWidth: '150px' }}
            >
              📷 Tomar foto
            </button>
          </div>

          {/* Preview de evidencias */}
          {modalEvidencias.evidencias.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h5 style={{ marginBottom: '10px' }}>Evidencias ({modalEvidencias.evidencias.length})</h5>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', 
                gap: '10px',
                maxHeight: '300px',
                overflowY: 'auto'
              }}>
                {modalEvidencias.evidencias.map((ev, idx) => (
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
                        setModalEvidencias(prev => ({
                          ...prev,
                          evidencias: prev.evidencias.filter(e => e.idTemp !== ev.idTemp)
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
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              className="btn-plain"
              onClick={() => {
                // Limpiar previews
                modalEvidencias.evidencias.forEach(ev => URL.revokeObjectURL(ev.preview));
                setModalEvidencias({ open: false, registro: null, evidencias: [], subiendo: false });
              }}
            >
              Cancelar
            </button>
            <button
              className="btn-green"
              disabled={modalEvidencias.subiendo || modalEvidencias.evidencias.length === 0}
              onClick={async () => {
                if (modalEvidencias.evidencias.length === 0) return;
                
                setModalEvidencias(prev => ({ ...prev, subiendo: true }));
                
                try {
                  const formData = new FormData();
                  modalEvidencias.evidencias.forEach((ev, idx) => {
                    formData.append('evidencias', ev.file);
                  });
                  
                  await authFetch(`${serverUrl}/devoluciones/${modalEvidencias.tipo || tipo}/${modalEvidencias.registro.id}/evidencias`, {
                    method: 'POST',
                    body: formData
                  });
                  
                  pushToast(`✅ ${modalEvidencias.evidencias.length} evidencia(s) guardada(s)`, 'ok');
                  
                  // Limpiar previews
                  modalEvidencias.evidencias.forEach(ev => URL.revokeObjectURL(ev.preview));
                  setModalEvidencias({ open: false, registro: null, evidencias: [], subiendo: false });
                  cargarRegistros();
                } catch (err) {
                  console.error('Error guardando evidencias:', err);
                  pushToast('❌ Error al guardar evidencias', 'err');
                  setModalEvidencias(prev => ({ ...prev, subiendo: false }));
                }
              }}
            >
              {modalEvidencias.subiendo ? 'Guardando...' : 'Guardar evidencias'}
            </button>
          </div>
        </div>
      </div>
    </div>
      )}
    </div>
  );
}
