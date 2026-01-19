import React, { useState } from "react";
import "./AlertModal.css";

const AlertModalContext = React.createContext();

export function AlertModalProvider({ children }) {
  const [alert, setAlert] = useState(null);

  const showAlert = (message, type = "info", options = {}) => {
    return new Promise((resolve) => {
      setAlert({
        message,
        type,
        onClose: (result) => {
          setAlert(null);
          resolve(result !== undefined ? result : (options.result !== undefined ? options.result : true));
        },
        title: options.title,
        showCancel: options.showCancel || false,
        confirmText: options.confirmText || "Aceptar",
        cancelText: options.cancelText || "Cancelar",
      });
    });
  };

  const showConfirm = (message, title = "Confirmar") => {
    return new Promise((resolve) => {
      setAlert({
        message,
        type: "confirm",
        onClose: (result) => {
          setAlert(null);
          resolve(result === true);
        },
      title,
      showCancel: true,
      confirmText: "Aceptar",
      cancelText: "Cancelar",
      });
    });
  };

  return (
    <AlertModalContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {alert && (
        <div className="alert-modal-overlay" onClick={() => !alert.showCancel && alert.onClose()}>
          <div className="alert-modal" onClick={(e) => e.stopPropagation()}>
            {alert.title && (
              <div className="alert-modal-header">
                <h3>{alert.title}</h3>
              </div>
            )}
            <div className="alert-modal-body">
              <div className={`alert-modal-icon alert-modal-icon-${alert.type}`}>
                {alert.type === "success" && "✅"}
                {alert.type === "error" && "❌"}
                {alert.type === "warning" && "⚠️"}
                {alert.type === "info" && "ℹ️"}
                {alert.type === "confirm" && "❓"}
              </div>
              <p className="alert-modal-message">{alert.message}</p>
            </div>
            <div className="alert-modal-actions">
              {alert.showCancel && (
                <button
                  className="alert-modal-btn alert-modal-btn-cancel"
                  onClick={() => alert.onClose(false)}
                >
                  {alert.cancelText}
                </button>
              )}
              <button
                className={`alert-modal-btn alert-modal-btn-${alert.type}`}
                onClick={() => alert.onClose(true)}
              >
                {alert.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </AlertModalContext.Provider>
  );
}

export function useAlert() {
  const context = React.useContext(AlertModalContext);
  if (!context) {
    // Error si se usa fuera del provider
    throw new Error("useAlert debe ser usado dentro de un AlertModalProvider");
  }
  return context;
}
