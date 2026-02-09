import { useState, useEffect } from "react";
import "./ConfirmationCodeModal.css";
import { getServerUrlSync } from "../config/server";

export default function ConfirmationCodeModal({ 
  isOpen, 
  onClose, 
  onConfirm,
  accion,
  detalles,
  loading
}) {
  const [paso, setPaso] = useState(1); // 1: solicitar código, 2: ingresar código
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [enviandoCodigo, setEnviandoCodigo] = useState(false);

  // Reiniciar el estado cuando el modal se cierra
  useEffect(() => {
    if (!isOpen) {
      setPaso(1);
      setCodigo("");
      setError("");
      setEnviandoCodigo(false);
    }
  }, [isOpen]);

  const handleSolicitarCodigo = async () => {
    setEnviandoCodigo(true);
    setError("");
    try {
      const serverUrl = getServerUrlSync();
      const res = await fetch(`${serverUrl}/auth/confirmation-code/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          accion,
          detalles,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error generando código");
      }

      setPaso(2);
      setCodigo("");
    } catch (err) {
      setError(err.message || "Error solicitando código");
    } finally {
      setEnviandoCodigo(false);
    }
  };

  const handleConfirmarCodigo = async () => {
    if (!codigo.trim()) {
      setError("Ingresa el código");
      return;
    }

    try {
      const serverUrl = getServerUrlSync();
      const res = await fetch(`${serverUrl}/auth/confirmation-code/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          codigo: codigo.trim(),
          accion,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Código inválido");
      }

      // Código válido, proceder con la acción pasando el código
      await onConfirm(codigo.trim());
    } catch (err) {
      setError(err.message || "Error validando código");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="confirmation-code-overlay" onClick={onClose}>
      <div className="confirmation-code-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirmation-code-header">
          <h3>🔐 Confirmar acción</h3>
          <button className="confirmation-code-close" onClick={onClose}>✕</button>
        </div>

        <div className="confirmation-code-body">
          {paso === 1 ? (
            <>
              <p className="confirmation-code-message">
                Se enviará un código de confirmación a tu chat.
              </p>

              {error && <div className="confirmation-code-error">❌ {error}</div>}

              <button
                className="confirmation-code-btn-primary"
                onClick={handleSolicitarCodigo}
                disabled={enviandoCodigo}
              >
                {enviandoCodigo ? "Enviando..." : "Solicitar código"}
              </button>

              <button
                className="confirmation-code-btn-secondary"
                onClick={onClose}
                disabled={enviandoCodigo}
              >
                Cancelar
              </button>
            </>
          ) : (
            <>
              <p className="confirmation-code-message">
                Revisa tu chat. IXORA te ha enviado el código de 6 dígitos.
              </p>

              <p className="confirmation-code-message" style={{ fontSize: "0.85rem", color: "var(--texto-secundario)" }}>
                Ingresa el código a continuación:
              </p>

              <div className="confirmation-code-input-group">
                <input
                  type="text"
                  value={codigo}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setCodigo(val);
                    setError("");
                  }}
                  placeholder="000000"
                  maxLength="6"
                  className="confirmation-code-input"
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && codigo.length === 6) {
                      handleConfirmarCodigo();
                    }
                  }}
                  autoFocus
                />
              </div>

              {error && <div className="confirmation-code-error">❌ {error}</div>}

              <button
                className="confirmation-code-btn-primary"
                onClick={handleConfirmarCodigo}
                disabled={loading || codigo.length !== 6}
              >
                {loading ? "Confirmando..." : "Confirmar"}
              </button>

              <button
                className="confirmation-code-btn-secondary"
                onClick={() => {
                  setPaso(1);
                  setCodigo("");
                  setError("");
                }}
                disabled={loading}
              >
                Volver
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
