// src/lib/state.js
import { dbDia } from "../config/baseDeDatos.js";

// Almacén de fecha de trabajo actual (cache en memoria)
let fechaActual = null; // null = no cargado aún

// Almacén de OTPs en memoria
const otpStore = new Map(); 

// Cargar fecha desde la base de datos
const cargarFechaDesdeBD = () => {
  try {
    const resultado = dbDia.prepare("SELECT fecha FROM fecha_actual WHERE id = 1").get();
    return resultado ? (resultado.fecha || "") : "";
  } catch (e) {
    console.error("Error cargando fecha desde BD:", e);
    return "";
  }
};

// Inicializar fecha al cargar el módulo
fechaActual = cargarFechaDesdeBD();

export const getFechaActual = () => {
  // Si no está cargada, cargar desde BD
  if (fechaActual === null) {
    fechaActual = cargarFechaDesdeBD();
  }
  return fechaActual || "";
};

export const setFechaActual = (fecha, userId = null) => {
  try {
    // Guardar en BD
    dbDia.prepare(`
      UPDATE fecha_actual 
      SET fecha = ?, 
          actualizada_por = ?,
          fecha_actualizacion = datetime('now', 'localtime')
      WHERE id = 1
    `).run(fecha || "", userId);
    
    // Actualizar cache en memoria
    fechaActual = fecha || "";
  } catch (e) {
    console.error("Error guardando fecha en BD:", e);
    // Fallback: solo actualizar en memoria
    fechaActual = fecha || "";
  }
};

export const getOtpStore = () => otpStore;