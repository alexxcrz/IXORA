// src/middleware/upload.js
import multer from "multer";
import path from "path";
import fs from "fs";
import { dbReenvios, dbUsers } from "../config/baseDeDatos.js";

const storageReenvios = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const id = req.params.id;
      if (!id) return cb(new Error("Falta ID de reenvío"), null);

      // Obtener el nombre del pedido desde la base de datos
      const reenvio = dbReenvios
        .prepare("SELECT pedido FROM reenvios WHERE id = ?")
        .get(id);

      if (!reenvio) {
        return cb(new Error("Reenvío no encontrado"), null);
      }

      // Usar el nombre del pedido como nombre de carpeta
      // Limpiar el nombre del pedido para que sea seguro como nombre de carpeta
      const nombrePedido = (reenvio.pedido || String(id))
        .replace(/[<>:"/\\|?*]/g, '_') // Reemplazar caracteres no válidos
        .trim();

      const dir = path.join("uploads", "reenvios", nombrePedido);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      cb(null, dir);
    } catch (err) {
      cb(err, null);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || ".jpg");
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  }
});

export const upload = multer({
  storage: storageReenvios,
});

// Storage específico para upload móvil (usa token en lugar de ID)
const storageReenviosMobile = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const token = req.params.token;
      if (!token) return cb(new Error("Falta token de reenvío"), null);

      // Obtener el ID del reenvío desde el token
      const tokenData = dbUsers
        .prepare(`
          SELECT token, registro_id, expira_en
          FROM mobile_upload_tokens
          WHERE token = ?
        `)
        .get(token);

      if (!tokenData) {
        return cb(new Error("Token inválido"), null);
      }

      // Verificar expiración
      const ahora = new Date();
      const expira = new Date(tokenData.expira_en);
      if (ahora > expira) {
        return cb(new Error("Token expirado"), null);
      }

      const id = tokenData.registro_id;
      if (!id) {
        return cb(new Error("Token sin ID de reenvío"), null);
      }

      // Obtener el nombre del pedido desde la base de datos
      const reenvio = dbReenvios
        .prepare("SELECT pedido FROM reenvios WHERE id = ?")
        .get(id);

      if (!reenvio) {
        return cb(new Error("Reenvío no encontrado"), null);
      }

      // Usar el nombre del pedido como nombre de carpeta
      const nombrePedido = (reenvio.pedido || String(id))
        .replace(/[<>:"/\\|?*]/g, '_')
        .trim();

      const dir = path.join("uploads", "reenvios", nombrePedido);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      cb(null, dir);
    } catch (err) {
      cb(err, null);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || ".jpg");
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  }
});

export const uploadMobile = multer({
  storage: storageReenviosMobile,
});