// Re-exportar todas las bases de datos desde baseDeDatos.js para compatibilidad
export {
  dbInv,
  dbDia,
  dbHist,
  dbUsers,
  dbReenvios,
  dbAud,
  dbDevol,
  dbChat,
  IXORA_PHONE,
  dbVentas, // Se usa en tienda.js
  dbRRHH, // Se usa en administrador.js para sincronizar usuarios con empleados
  dbActivos
} from "./baseDeDatos.js";
