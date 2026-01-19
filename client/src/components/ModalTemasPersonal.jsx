import React, { useState, useEffect } from "react";
import { temas, aplicarTema, obtenerTemaActual } from "../utils/temas";
import { useAuth } from "../AuthContext";
import "./ModalTemasPersonal.css";

export default function ModalTemasPersonal({ mostrar, cerrar, serverUrl }) {
  const { authFetch, user } = useAuth();
  const [temaActual, setTemaActual] = useState(obtenerTemaActual());
  const [guardando, setGuardando] = useState(false);
  const [tieneTemaPersonal, setTieneTemaPersonal] = useState(false);
  const [temaPorDefecto, setTemaPorDefecto] = useState("azul");

  // Cargar tema personal del usuario al abrir el modal
  useEffect(() => {
    if (mostrar && user) {
      cargarTemaPersonal();
      cargarTemaPorDefecto();
    }
  }, [mostrar, user]);

  const cargarTemaPorDefecto = async () => {
    try {
      const data = await authFetch(`${serverUrl}/admin/personalizacion`);
      if (data && data.tema) {
        setTemaPorDefecto(data.tema);
      } else {
        setTemaPorDefecto("azul");
      }
    } catch (err) {
      console.error("Error cargando tema por defecto:", err);
      setTemaPorDefecto("azul");
    }
  };

  const cargarTemaPersonal = async () => {
    try {
      const data = await authFetch(`${serverUrl}/usuario/tema-personal`);
      if (data && data.tema) {
        setTemaActual(data.tema);
        setTieneTemaPersonal(true);
        aplicarTema(data.tema);
      } else {
        // Si no tiene tema personal, usar el tema global o el predeterminado
        const temaGlobal = obtenerTemaActual();
        setTemaActual(temaGlobal);
        setTieneTemaPersonal(false);
      }
    } catch (err) {
      console.error("Error cargando tema personal:", err);
      const temaGlobal = obtenerTemaActual();
      setTemaActual(temaGlobal);
      setTieneTemaPersonal(false);
    }
  };

  const seleccionarTema = async (nombreTema) => {
    setTemaActual(nombreTema);
    aplicarTema(nombreTema);
    
    // Guardar inmediatamente en el servidor
    setGuardando(true);
    try {
      await authFetch(`${serverUrl}/usuario/tema-personal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tema: nombreTema }),
      });
      
      // Guardar en localStorage con múltiples claves para redundancia
      localStorage.setItem("tema-actual", nombreTema);
      if (user && user.id) {
        localStorage.setItem(`tema-personal-${user.id}`, nombreTema);
      }
      
      setTieneTemaPersonal(true);
      console.log(`✅ Tema personal guardado: ${nombreTema}`);
      
      // Forzar recarga del tema personal en App.jsx
      window.dispatchEvent(new CustomEvent('tema-personal-actualizado', { detail: nombreTema }));
    } catch (err) {
      console.error("Error guardando tema personal:", err);
    } finally {
      setGuardando(false);
    }
  };

  const eliminarTemaPersonal = async () => {
    setGuardando(true);
    try {
      // Cargar el tema por defecto primero para asegurarnos de tener el más actualizado
      let temaDefecto = temaPorDefecto;
      try {
        const data = await authFetch(`${serverUrl}/admin/personalizacion`);
        if (data && data.tema) {
          temaDefecto = data.tema;
          setTemaPorDefecto(data.tema);
        } else {
          temaDefecto = "azul";
          setTemaPorDefecto("azul");
        }
      } catch (err) {
        console.error("Error cargando tema por defecto:", err);
        temaDefecto = temaPorDefecto || "azul";
      }
      
      // Eliminar del servidor enviando null
      await authFetch(`${serverUrl}/usuario/tema-personal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tema: null }),
      });
      
      // Eliminar del localStorage
      if (user && user.id) {
        localStorage.removeItem(`tema-personal-${user.id}`);
      }
      
      // Aplicar el tema por defecto
      setTemaActual(temaDefecto);
      aplicarTema(temaDefecto);
      localStorage.setItem("tema-actual", temaDefecto);
      setTieneTemaPersonal(false);
      
      console.log(`✅ Tema personal eliminado, usando tema por defecto: ${temaDefecto}`);
      
      // Disparar evento para actualizar en App.jsx
      window.dispatchEvent(new CustomEvent('tema-personal-actualizado', { detail: temaDefecto }));
    } catch (err) {
      console.error("Error eliminando tema personal:", err);
    } finally {
      setGuardando(false);
    }
  };

  if (!mostrar) return null;

  return (
    <div className="modal-temas-personal-overlay" onClick={cerrar}>
      <div className="modal-temas-personal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-temas-personal-header">
          <h2>🎨 Personalización de Tema</h2>
          <p className="modal-temas-personal-subtitle">
            Elige un tema que solo afectará tu cuenta. Los demás usuarios verán sus propios temas.
          </p>
          <button className="modal-temas-personal-close" onClick={cerrar}>
            ✕
          </button>
        </div>

        <div className="modal-temas-personal-content">
          <div className="temas-grid-personal">
            {Object.entries(temas).map(([key, tema]) => (
              <div
                key={key}
                className={`tema-option-personal ${temaActual === key ? "tema-activo-personal" : ""}`}
                onClick={() => seleccionarTema(key)}
              >
                <div className="tema-preview-personal">
                  <div 
                    className="tema-preview-color-personal" 
                    style={{ 
                      background: `linear-gradient(135deg, ${tema.colores["--azul-primario"]}, ${tema.colores["--azul-secundario"]})`,
                      borderColor: tema.colores["--borde-visible"]
                    }}
                  />
                  <div
                    className="tema-preview-fondo-personal"
                    style={{ backgroundColor: tema.colores["--fondo-card"] }}
                  />
                  <div
                    className="tema-preview-texto-personal"
                    style={{ color: tema.colores["--texto-principal"] }}
                  >
                    Aa
                  </div>
                </div>
                <div className="tema-info-personal">
                  <h4>{tema.nombre}</h4>
                  <p>{tema.descripcion}</p>
                </div>
                {temaActual === key && (
                  <div className="tema-check-personal">
                    ✓
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {tieneTemaPersonal && (
            <div className="modal-temas-personal-actions">
              <button 
                className="btn-eliminar-tema-personal"
                onClick={eliminarTemaPersonal}
                disabled={guardando}
              >
                🗑️ Eliminar tema personal y usar tema por defecto ({temas[temaPorDefecto]?.nombre || temaPorDefecto})
              </button>
            </div>
          )}
        </div>

        {guardando && (
          <div className="modal-temas-personal-guardando">
            {tieneTemaPersonal ? "Eliminando tema..." : "Guardando tema..."}
          </div>
        )}
      </div>
    </div>
  );
}

