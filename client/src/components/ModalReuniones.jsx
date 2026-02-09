import React, { useState, useEffect } from "react";
import { useAuth } from "../AuthContext";
import { useAlert } from "./AlertModal";
import { getServerUrl } from "../config/server";
import "./ModalReuniones.css";

export default function ModalReuniones({ mostrar, cerrar }) {
  const { authFetch, user } = useAuth();
  const { showAlert, showConfirm } = useAlert();
  const [serverUrl, setServerUrl] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [reunionTerminando, setReunionTerminando] = useState(null);
  const [observacionesTerminar, setObservacionesTerminar] = useState("");
  
  // Formulario de creación
  const [formReunion, setFormReunion] = useState({
    titulo: "",
    descripcion: "",
    fecha: "",
    hora: "",
    lugar: "",
    es_videollamada: false,
    tipo_videollamada: "", // "link" o "app"
    link_videollamada: "",
    participantes: []
  });
  
  const [reunionEditando, setReunionEditando] = useState(null);
  const [buscadorParticipantes, setBuscadorParticipantes] = useState("");
  const [mostrarSelectorParticipantes, setMostrarSelectorParticipantes] = useState(false);

  useEffect(() => {
    const loadServerUrl = async () => {
      const url = await getServerUrl();
      setServerUrl(url);
    };
    loadServerUrl();
  }, []);

  // Cargar datos cuando se abre el modal
  useEffect(() => {
    if (mostrar && serverUrl) {
      cargarReuniones();
      cargarUsuarios();
    }
  }, [mostrar, serverUrl]);

  const cargarUsuarios = async () => {
    try {
      const data = await authFetch(`${serverUrl}/chat/usuarios`);
      setUsuarios(data || []);
    } catch (error) {
      console.error("Error cargando usuarios:", error);
    }
  };

  const cargarReuniones = async () => {
    try {
      // Cargar todas las reuniones (aunque no se usen directamente, se recargan para mantener consistencia)
      await authFetch(`${serverUrl}/reuniones`);
    } catch (error) {
      console.error("Error cargando reuniones:", error);
    }
  };

  // Función para obtener la URL del avatar del usuario
  const getAvatarUrl = (usuarioObj) => {
    if (!usuarioObj || !usuarioObj.photo) {
      // Avatar por defecto si no hay foto
      return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23e0e0e0'/%3E%3Ctext x='16' y='22' font-size='20' text-anchor='middle' fill='%23999'%3E👤%3C/text%3E%3C/svg%3E";
    }
    
    if (!serverUrl) return usuarioObj.photo;
    
    const cacheKey = usuarioObj.photoTimestamp || usuarioObj.id || Date.now();
    
    if (usuarioObj.photo.startsWith("http")) {
      return `${usuarioObj.photo}?t=${cacheKey}`;
    }
    
    // Si empieza con /uploads, agregar el serverUrl
    if (usuarioObj.photo.startsWith("/uploads")) {
      return `${serverUrl}${usuarioObj.photo}?t=${cacheKey}`;
    }
    
    // Si es solo el nombre del archivo, construir la ruta completa
    return `${serverUrl}/uploads/perfiles/${usuarioObj.photo}?t=${cacheKey}`;
  };

  const usuariosFiltrados = usuarios.filter(u => {
    const nombre = (u.nickname || u.name || "").toLowerCase();
    const busca = buscadorParticipantes.toLowerCase();
    return nombre.includes(busca) && !formReunion.participantes.includes(u.nickname || u.name);
  });

  const agregarParticipante = (nickname) => {
    if (!formReunion.participantes.includes(nickname)) {
      setFormReunion({
        ...formReunion,
        participantes: [...formReunion.participantes, nickname]
      });
    }
    setBuscadorParticipantes("");
    setMostrarSelectorParticipantes(false);
  };

  const eliminarParticipante = (nickname) => {
    setFormReunion({
      ...formReunion,
      participantes: formReunion.participantes.filter(p => p !== nickname)
    });
  };

  const verificarConflictos = async () => {
    if (!formReunion.fecha || !formReunion.hora || formReunion.participantes.length === 0) {
      return { conflictos: [] };
    }

    try {
      const response = await authFetch(`${serverUrl}/reuniones/verificar-conflictos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha: formReunion.fecha,
          hora: formReunion.hora,
          participantes: formReunion.participantes,
          reunion_id_excluir: reunionEditando?.id
        })
      });
      return response;
    } catch (error) {
      console.error("Error verificando conflictos:", error);
      return { conflictos: [] };
    }
  };

  const guardarReunion = async () => {
    if (!formReunion.titulo.trim() || !formReunion.fecha || !formReunion.hora) {
      showAlert("Completa todos los campos obligatorios (título, fecha y hora)", "warning");
      return;
    }

    // Validar que si es videollamada, tenga tipo seleccionado
    if (formReunion.es_videollamada && !formReunion.tipo_videollamada) {
      showAlert("Selecciona el tipo de videollamada (Link externo o Por la app)", "warning");
      return;
    }

    // Validar que si es videollamada con link, tenga el link proporcionado
    if (formReunion.es_videollamada && formReunion.tipo_videollamada === "link" && !formReunion.link_videollamada.trim()) {
      showAlert("Proporciona el link de la videollamada", "warning");
      return;
    }

    setCargando(true);

    try {
      // Verificar conflictos antes de guardar
      const { conflictos } = await verificarConflictos();
      
      if (conflictos && conflictos.length > 0) {
        const mensajeConflictos = conflictos.map(c => 
          `• ${c.usuario} tiene otra reunión: "${c.reunion_titulo}" (creada por ${c.reunion_creador})`
        ).join("\n");
        
        const confirmar = await showConfirm(
          `⚠️ Conflicto de horario detectado:\n\n${mensajeConflictos}\n\n¿Deseas crear la reunión de todas formas?`,
          "Conflicto de horario"
        );
        
        if (!confirmar) {
          setCargando(false);
          return;
        }
      }

      const url = reunionEditando 
        ? `${serverUrl}/reuniones/${reunionEditando.id}`
        : `${serverUrl}/reuniones`;
      
      const method = reunionEditando ? "PUT" : "POST";

      console.log("📤 Enviando reunión:", formReunion);
      const response = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formReunion)
      });

      console.log("📥 Respuesta del servidor:", response);

      if (response.error && response.error.includes("Conflicto")) {
        const mensajeConflictos = response.conflictos?.map(c => 
          `• ${c.usuario} tiene otra reunión: "${c.reunion_titulo}" (creada por ${c.reunion_creador})`
        ).join("\n");
        
        showAlert(
          `Conflicto de horario:\n\n${mensajeConflictos}\n\nNo se pudo crear la reunión.`,
          "error"
        );
        setCargando(false);
        return;
      }

      if (response.error) {
        console.error("❌ Error en respuesta:", response.error);
        showAlert(`Error: ${response.error}`, "error");
        setCargando(false);
        return;
      }

      if (!response.id) {
        console.error("❌ Respuesta sin ID de reunión:", response);
        showAlert("Error: La reunión no se creó correctamente", "error");
        setCargando(false);
        return;
      }

      console.log("✅ Reunión guardada exitosamente con ID:", response.id);
      showAlert(reunionEditando ? "Reunión actualizada exitosamente" : "Reunión creada exitosamente", "success");
      
      // Limpiar formulario
      setFormReunion({
        titulo: "",
        descripcion: "",
        fecha: "",
        hora: "",
        lugar: "",
        es_videollamada: false,
        tipo_videollamada: "",
        link_videollamada: "",
        participantes: []
      });
      setReunionEditando(null);
      
      // Recargar reuniones con un pequeño delay para asegurar que la BD esté actualizada
      await new Promise(resolve => setTimeout(resolve, 100));
      await cargarReuniones();
      
      // Emitir evento para que otros componentes se actualicen
      window.dispatchEvent(new CustomEvent('reunion-actualizada'));
      
      // Cerrar el modal después de guardar
      cerrar();
    } catch (error) {
      console.error("❌ Error guardando reunión:", error);
      showAlert(`Error al guardar la reunión: ${error.message || "Error desconocido"}`, "error");
    } finally {
      setCargando(false);
    }
  };

  /* eslint-disable-next-line no-unused-vars */
  const editarReunion = (reunion) => {
    setReunionEditando(reunion);
    // Determinar tipo de videollamada basado en si tiene link o no
    const tipoVideollamada = reunion.es_videollamada 
      ? (reunion.link_videollamada ? "link" : "app")
      : "";
    
    setFormReunion({
      titulo: reunion.titulo || "",
      descripcion: reunion.descripcion || "",
      fecha: reunion.fecha || "",
      hora: reunion.hora || "",
      lugar: reunion.lugar || "",
      es_videollamada: reunion.es_videollamada || false,
      tipo_videollamada: tipoVideollamada,
      link_videollamada: reunion.link_videollamada || "",
      participantes: reunion.participantes || []
    });
  };

  /* eslint-disable-next-line no-unused-vars */
  const terminarReunion = async (reunion) => {
    if (!reunionTerminando) {
      setReunionTerminando(reunion);
      setObservacionesTerminar("");
      return;
    }
    
    try {
      await authFetch(`${serverUrl}/reuniones/${reunion.id}/terminar`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observaciones: observacionesTerminar })
      });
      
      showAlert("Reunión terminada exitosamente", "success");
      setReunionTerminando(null);
      setObservacionesTerminar("");
      await cargarReuniones();
      window.dispatchEvent(new CustomEvent('reunion-actualizada'));
    } catch (error) {
      console.error("Error terminando reunión:", error);
      showAlert("Error al terminar la reunión", "error");
    }
  };

  /* eslint-disable-next-line no-unused-vars */
  const cancelarReunion = async (reunion) => {
    const confirmar = await showConfirm(
      `¿Estás seguro de cancelar la reunión "${reunion.titulo}"?`,
      "Cancelar reunión"
    );
    
    if (!confirmar) return;

    try {
      await authFetch(`${serverUrl}/reuniones/${reunion.id}`, {
        method: "DELETE"
      });
      
      showAlert("Reunión cancelada exitosamente", "success");
      await cargarReuniones();

      window.dispatchEvent(new CustomEvent('reunion-actualizada'));
    } catch (error) {
      console.error("Error cancelando reunión:", error);
      showAlert("Error al cancelar la reunión", "error");
    }
  };

  /* eslint-disable-next-line no-unused-vars */
  const abrirChatConCreador = (reunion, onChatOpen) => {
    // Esta función será pasada desde el componente padre para abrir el chat
    if (onChatOpen) {
      onChatOpen(reunion.creador_nickname, "privado");
    }
  };

  if (!mostrar) return null;

  const userNickname = user?.nickname || user?.name;

  return (
    <div className="modal-reuniones-backdrop" onClick={cerrar}>
      <div className="modal-reuniones" onClick={(e) => e.stopPropagation()}>
        <div className="modal-reuniones-header">
          <h2>📅 Crear Reunión</h2>
          <button className="modal-reuniones-close" onClick={cerrar}>✕</button>
        </div>

        <div className="modal-reuniones-content">
          <div className="modal-reuniones-form">
              <div className="form-group">
                <label>Título *</label>
                <input
                  type="text"
                  value={formReunion.titulo}
                  onChange={(e) => setFormReunion({ ...formReunion, titulo: e.target.value })}
                  placeholder="Ej: Reunión de equipo"
                />
              </div>

              <div className="form-group">
                <label>Descripción</label>
                <textarea
                  value={formReunion.descripcion}
                  onChange={(e) => setFormReunion({ ...formReunion, descripcion: e.target.value })}
                  placeholder="Descripción de la reunión..."
                  rows="3"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Fecha *</label>
                  <input
                    type="date"
                    value={formReunion.fecha}
                    onChange={(e) => setFormReunion({ ...formReunion, fecha: e.target.value })}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>

                <div className="form-group">
                  <label>Hora *</label>
                  <input
                    type="time"
                    value={formReunion.hora}
                    onChange={(e) => setFormReunion({ ...formReunion, hora: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Lugar</label>
                <input
                  type="text"
                  value={formReunion.lugar}
                  onChange={(e) => setFormReunion({ ...formReunion, lugar: e.target.value })}
                  placeholder="Ej: Sala de juntas, Zoom, etc."
                />
              </div>

              <div className="form-group">
                <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={formReunion.es_videollamada}
                      onChange={(e) => {
                        const esVideollamada = e.target.checked;
                        setFormReunion({
                          ...formReunion,
                          es_videollamada: esVideollamada,
                          tipo_videollamada: esVideollamada ? formReunion.tipo_videollamada || "" : "",
                          link_videollamada: esVideollamada && formReunion.tipo_videollamada === "link" ? formReunion.link_videollamada : ""
                        });
                      }}
                    />
                    <span className="slider"></span>
                  </label>
                  <span>📹 Es videollamada</span>
                </label>
              </div>

              {formReunion.es_videollamada && (
                <div className="form-group" style={{ marginLeft: "20px", marginTop: "-10px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <label style={{ fontSize: "0.85rem", color: "var(--texto-secundario, rgba(255, 255, 255, 0.7))" }}>
                      Tipo de videollamada:
                    </label>
                    <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                        <input
                          type="radio"
                          name="tipo_videollamada"
                          value="link"
                          checked={formReunion.tipo_videollamada === "link"}
                          onChange={(e) => setFormReunion({
                            ...formReunion,
                            tipo_videollamada: "link",
                            link_videollamada: formReunion.link_videollamada || ""
                          })}
                          style={{ cursor: "pointer" }}
                        />
                        <span>Link externo (Zoom, Meet, etc.)</span>
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                        <input
                          type="radio"
                          name="tipo_videollamada"
                          value="app"
                          checked={formReunion.tipo_videollamada === "app"}
                          onChange={(e) => setFormReunion({
                            ...formReunion,
                            tipo_videollamada: "app",
                            link_videollamada: ""
                          })}
                          style={{ cursor: "pointer" }}
                        />
                        <span>Por la app</span>
                      </label>
                    </div>
                    {formReunion.tipo_videollamada === "link" && (
                      <div style={{ marginTop: "8px" }}>
                        <input
                          type="text"
                          value={formReunion.link_videollamada}
                          onChange={(e) => setFormReunion({ ...formReunion, link_videollamada: e.target.value })}
                          placeholder="https://zoom.us/j/... o https://meet.google.com/..."
                          className="form-group input[type='text']"
                          style={{
                            width: "100%",
                            background: "var(--fondo-input, rgba(255, 255, 255, 0.1))",
                            border: "1px solid var(--borde, rgba(255, 255, 255, 0.2))",
                            borderRadius: "var(--radio-md, 8px)",
                            padding: "10px 14px",
                            color: "var(--texto-principal, #ffffff)",
                            fontSize: "0.95rem",
                            transition: "all 0.2s"
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = "var(--azul-primario, #3b82f6)";
                            e.target.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = "var(--borde, rgba(255, 255, 255, 0.2))";
                            e.target.style.boxShadow = "none";
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Participantes</label>
                <div className="participantes-selector">
                  <div className="participantes-seleccionados">
                    {formReunion.participantes.map((nickname) => {
                      const usuario = usuarios.find(u => (u.nickname || u.name) === nickname);
                      return (
                        <span key={nickname} className="participante-tag">
                          <span className="participante-nombre">
                            {usuario?.nickname || usuario?.name || nickname}
                          </span>
                          <button
                            type="button"
                            onClick={() => eliminarParticipante(nickname)}
                            className="participante-remove"
                          >
                            ✕
                          </button>
                        </span>
                      );
                    })}
                  </div>
                  <div className="participantes-input-wrapper">
                    <input
                      type="text"
                      value={buscadorParticipantes}
                      onChange={(e) => {
                        setBuscadorParticipantes(e.target.value);
                        setMostrarSelectorParticipantes(true);
                      }}
                      onFocus={() => setMostrarSelectorParticipantes(true)}
                      placeholder="@ Etiquetar participantes..."
                    />
                    {mostrarSelectorParticipantes && usuariosFiltrados.length > 0 && (
                      <div className="participantes-dropdown">
                        {usuariosFiltrados.map((usuario) => {
                          const nickname = usuario.nickname || usuario.name;
                          if (nickname === userNickname) return null; // No agregar al creador
                          return (
                            <div
                              key={nickname}
                              className="participante-option"
                              onClick={() => agregarParticipante(nickname)}
                            >
                              <img 
                                src={getAvatarUrl(usuario)} 
                                alt={nickname} 
                                className="participante-photo"
                                style={{ display: 'block' }}
                                onError={(e) => {
                                  // Si falla la carga, ocultar imagen y mostrar inicial
                                  e.target.style.display = 'none';
                                  const initial = e.target.nextElementSibling;
                                  if (initial) {
                                    initial.style.display = 'flex';
                                  }
                                }}
                              />
                              <span 
                                className="participante-initial"
                                style={{ display: 'none' }}
                              >
                                {nickname[0]?.toUpperCase()}
                              </span>
                              <span>{nickname}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-reuniones-actions">
                {reunionEditando && (
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setReunionEditando(null);
                      setFormReunion({
                        titulo: "",
                        descripcion: "",
                        fecha: "",
                        hora: "",
                        lugar: "",
                        es_videollamada: false,
                        tipo_videollamada: "",
                        link_videollamada: "",
                        participantes: []
                      });
                    }}
                  >
                    Cancelar edición
                  </button>
                )}
                <button
                  className="btn-primary"
                  onClick={guardarReunion}
                  disabled={cargando}
                >
                  {cargando ? "Guardando..." : reunionEditando ? "Actualizar" : "Crear"} Reunión
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
