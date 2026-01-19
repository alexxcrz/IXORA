import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { cargarTema } from "./utils/temas";
import { applySystemDarkMode } from "./utils/darkMode";

// Aplicar modo oscuro del sistema INMEDIATAMENTE antes de que React renderice
applySystemDarkMode();

// Aplicar tema INMEDIATAMENTE antes de que React renderice
// Esto evita el flash de colores por defecto y conflictos
cargarTema();

const rootElement = document.getElementById("root");
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
