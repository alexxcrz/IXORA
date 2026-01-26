import React, { useState, useEffect } from "react";
import { useAlertasReuniones } from "../hooks/useAlertasReuniones";
import { useAlert } from "./AlertModal";

export default function ReunionesPerfilUsuario({ reuniones, serverUrl, authFetch, user, setReuniones }) {
  const [pestañaActiva, setPestañaActiva] = useState("proximas"); // "proximas" o "historial"
  const [reunionesProximas, setReunionesProximas] = useState([]);
  const [reunionesHistorial, setReunionesHistorial] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [configNotif, setConfigNotif] = useState(null);
  const { showAlert } = useAlert();

  // Cargar configuración de notificaciones
  useEffect(() => {
    const cargarConfigNotif = async () => {
      if (!user || !serverUrl) return;
      try {
        const c = await authFetch(`${serverUrl}/chat/notificaciones/config`);
        setConfigNotif(c || null);
      } catch {
        setConfigNotif(null);
      }
    };
    if (user && serverUrl) cargarConfigNotif();
  }, [user, serverUrl, authFetch]);

  // Usar hook de alertas de reuniones
  useAlertasReuniones(reunionesProximas, configNotif, showAlert);

  useEffect(() => {
    let isMounted = true;
    let timeoutId = null;
    
    const cargarReuniones = async () => {
      if (!serverUrl || !isMounted) return;
      setCargando(true);
      try {
        const data = await authFetch(`${serverUrl}/reuniones/proximas`);
        if (!isMounted) return;
        
        if (Array.isArray(data)) {
          setReunionesProximas(data);
          if (setReuniones) {
            setReuniones(data);
          }
        } else {
          setReunionesProximas([]);
        }
      } catch (error) {
        if (isMounted) {
          console.error("Error cargando reuniones:", error);
          setReunionesProximas([]);
        }
      } finally {
        if (isMounted) {
          setCargando(false);
        }
      }
    };
    
    cargarReuniones();
    
    // Escuchar eventos de nueva reunión creada con debounce
    const handleNuevaReunion = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (isMounted) {
          cargarReuniones();
          if (pestañaActiva === "historial") {
            cargarHistorial();
          }
        }
      }, 500);
    };
    
    window.addEventListener('reunion-actualizada', handleNuevaReunion);
    
    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('reunion-actualizada', handleNuevaReunion);
    };
  }, [serverUrl, authFetch, pestañaActiva]);
  
  const cargarHistorial = async () => {
    if (!serverUrl) return;
    setCargandoHistorial(true);
    try {
      const data = await authFetch(`${serverUrl}/reuniones/historial`);
      if (Array.isArray(data)) {
        setReunionesHistorial(data);
      } else {
        setReunionesHistorial([]);
      }
    } catch (error) {
      console.error("Error cargando historial:", error);
      setReunionesHistorial([]);
    } finally {
      setCargandoHistorial(false);
    }
  };
  
  useEffect(() => {
    if (pestañaActiva === "historial" && serverUrl) {
      cargarHistorial();
    }
  }, [pestañaActiva, serverUrl]);

  const abrirModal = () => {
    window.dispatchEvent(new CustomEvent('abrir-modal-reuniones'));
  };

  return (
    <div className="chat-profile-info" style={{ padding: "16px" }}>
      {/* Botón Crear Reunión y Pestañas */}
      <div style={{ marginBottom: "16px", display: "flex", gap: "8px", alignItems: "stretch" }}>
        <button
          onClick={abrirModal}
          style={{
            flex: 1,
            padding: "12px",
            background: "linear-gradient(135deg, var(--chat-accent), var(--chat-accent-2))",
            border: "none",
            borderRadius: "8px",
            color: "#ffffff",
            cursor: "pointer",
            fontSize: "0.95rem",
            fontWeight: 600
          }}
        >
          ➕ Crear Reunión
        </button>
        <button
          onClick={() => setPestañaActiva("proximas")}
          style={{
            padding: "12px 16px",
            background: pestañaActiva === "proximas" ? "var(--chat-accent)" : "var(--fondo-input)",
            border: `1px solid ${pestañaActiva === "proximas" ? "var(--chat-accent)" : "var(--chat-border)"}`,
            borderRadius: "8px",
            color: pestañaActiva === "proximas" ? "#ffffff" : "var(--chat-text)",
            cursor: "pointer",
            fontSize: "0.85rem",
            fontWeight: 600,
            whiteSpace: "nowrap"
          }}
        >
          📋 Próximas ({reunionesProximas.length})
        </button>
        <button
          onClick={() => setPestañaActiva("historial")}
          style={{
            padding: "12px 16px",
            background: pestañaActiva === "historial" ? "var(--chat-accent)" : "var(--fondo-input)",
            border: `1px solid ${pestañaActiva === "historial" ? "var(--chat-accent)" : "var(--chat-border)"}`,
            borderRadius: "8px",
            color: pestañaActiva === "historial" ? "#ffffff" : "var(--chat-text)",
            cursor: "pointer",
            fontSize: "0.85rem",
            fontWeight: 600,
            whiteSpace: "nowrap"
          }}
        >
          📜 Historial ({reunionesHistorial.length})
        </button>
      </div>

      {/* Contenido según pestaña activa */}
      {pestañaActiva === "proximas" ? (
        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--chat-text)", marginBottom: "12px" }}>
            📋 Reuniones Próximas
          </h3>
          {cargando ? (
            <div style={{ fontSize: "0.85rem", color: "var(--chat-muted)", marginBottom: "16px" }}>
              Cargando...
            </div>
          ) : reunionesProximas.length === 0 ? (
            <div style={{ fontSize: "0.85rem", color: "var(--chat-muted)", marginBottom: "16px" }}>
              No tienes reuniones próximas programadas.
            </div>
          ) : (
            reunionesProximas
              .sort((a, b) => {
                const fechaA = new Date(`${a.fecha}T${a.hora}`);
                const fechaB = new Date(`${b.fecha}T${b.hora}`);
                return fechaA - fechaB;
              })
              .slice(0, 5)
              .map(reunion => {
                const fechaHora = new Date(`${reunion.fecha}T${reunion.hora}`);
                const esHoy = fechaHora.toDateString() === new Date().toDateString();
                const userNickname = user?.nickname || user?.name;
                const esCreador = reunion.creador_nickname === userNickname;
                
                return (
                  <div key={reunion.id} style={{
                    background: "var(--fondo-input)",
                    border: "1px solid var(--chat-border)",
                    borderRadius: "8px",
                    padding: "12px",
                    marginBottom: "8px"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--chat-text)", marginBottom: "4px" }}>
                          {reunion.titulo}
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "var(--chat-muted)" }}>
                          {esHoy ? 'Hoy' : fechaHora.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} a las {reunion.hora}
                          {reunion.lugar && ` • ${reunion.lugar}`}
                        </div>
                        {reunion.participantes && reunion.participantes.length > 0 && (
                          <div style={{ fontSize: "0.75rem", color: "var(--chat-muted)", marginTop: "4px" }}>
                            👥 {reunion.participantes.join(", ")}
                          </div>
                        )}
                      </div>
                      {!esCreador && (
                        <button
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent('abrir-chat-desde-reunion', {
                              detail: {
                                nickname: reunion.creador_nickname,
                                tipo: 'privado'
                              }
                            }));
                          }}
                          style={{
                            padding: "6px 10px",
                            background: "#10b981",
                            border: "none",
                            borderRadius: "6px",
                            color: "#ffffff",
                            cursor: "pointer",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                            marginLeft: "8px"
                          }}
                          title="Abrir chat con el creador"
                        >
                          💬
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
          )}
        </div>
      ) : (
        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--chat-text)", marginBottom: "12px" }}>
            📜 Historial de Reuniones
          </h3>
          {cargandoHistorial ? (
            <div style={{ fontSize: "0.85rem", color: "var(--chat-muted)", marginBottom: "16px" }}>
              Cargando...
            </div>
          ) : reunionesHistorial.length === 0 ? (
            <div style={{ fontSize: "0.85rem", color: "var(--chat-muted)", marginBottom: "16px" }}>
              No hay reuniones en el historial.
            </div>
          ) : (
            reunionesHistorial
              .sort((a, b) => {
                const fechaA = new Date(`${a.fecha}T${a.hora}`);
                const fechaB = new Date(`${b.fecha}T${b.hora}`);
                return fechaB - fechaA; // Más recientes primero
              })
              .map(reunion => {
                const fechaHora = new Date(`${reunion.fecha}T${reunion.hora}`);
                const userNickname = user?.nickname || user?.name;
                const esCreador = reunion.creador_nickname === userNickname;
                
                return (
                  <div key={reunion.id} style={{
                    background: "var(--fondo-input)",
                    border: "1px solid var(--chat-border)",
                    borderRadius: "8px",
                    padding: "12px",
                    marginBottom: "8px",
                    opacity: reunion.estado === 'cancelada' ? 0.6 : 1
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--chat-text)", marginBottom: "4px" }}>
                          {reunion.titulo}
                          <span style={{ marginLeft: "8px", fontSize: "0.75rem", color: "var(--chat-muted)" }}>
                            {reunion.estado === 'terminada' ? '✅ Terminada' : '❌ Cancelada'}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "var(--chat-muted)" }}>
                          {fechaHora.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })} a las {reunion.hora}
                          {reunion.lugar && ` • ${reunion.lugar}`}
                        </div>
                        {reunion.observaciones && (
                          <div style={{ fontSize: "0.75rem", color: "var(--chat-muted)", marginTop: "4px" }}>
                            📝 {reunion.observaciones}
                          </div>
                        )}
                        {reunion.participantes && reunion.participantes.length > 0 && (
                          <div style={{ fontSize: "0.75rem", color: "var(--chat-muted)", marginTop: "4px" }}>
                            👥 {reunion.participantes.join(", ")}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
          )}
        </div>
      )}
    </div>
  );
}
