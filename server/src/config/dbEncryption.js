/**
 * 🔒 Configuración de cifrado para bases de datos SQLite
 * Usa SQLCipher a través de better-sqlite3-multiple-ciphers
 */

// Cargar variables de entorno (solo si no se cargaron antes)
// Nota: dotenv normalmente ya se carga en entorno.js antes de este archivo
import dotenv from "dotenv";
// Solo cargar si las variables de entorno no están disponibles
if (!process.env.DB_ENCRYPTION_KEY) {
  // Suprimir mensajes informativos temporalmente
  const originalLog = console.log;
  console.log = (...args) => {
    const message = args.join(' ');
    if (message.includes('[dotenv@') && (message.includes('injecting env') || message.includes('tip:'))) {
      return;
    }
    originalLog(...args);
  };
  
  dotenv.config();
  
  // Restaurar console.log inmediatamente
  setTimeout(() => {
    console.log = originalLog;
  }, 10);
}

import Database from "better-sqlite3-multiple-ciphers";
import DatabasePlain from "better-sqlite3";
import fs from "fs";
import path from "path";

// Obtener la clave de cifrado desde variables de entorno
const DB_ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY || (() => {
  console.warn("⚠️ ADVERTENCIA: DB_ENCRYPTION_KEY no está definido. Usando valor por defecto (INSEGURO para producción).");
  return "clave-por-defecto-insegura-cambiar-en-produccion";
})();

// Carpeta donde se almacenan las bases de datos
// ORDEN ORIGINAL: server/, luego databases/, luego server/databases/
const DATABASES_DIR_SERVER = path.join(process.cwd(), "server", "databases");
const DATABASES_DIR_ROOT = path.join(process.cwd(), "databases");
const DATABASES_DIR_SERVER_FOLDER = path.join(process.cwd(), "server");

// Asegurar que las carpetas existen
if (!fs.existsSync(DATABASES_DIR_SERVER)) {
  fs.mkdirSync(DATABASES_DIR_SERVER, { recursive: true });
}
if (!fs.existsSync(DATABASES_DIR_ROOT)) {
  fs.mkdirSync(DATABASES_DIR_ROOT, { recursive: true });
}

/**
 * Crea una conexión a base de datos SQLite con cifrado
 * @param {string} dbPath - Ruta al archivo de base de datos (relativa o absoluta)
 * @param {object} options - Opciones adicionales
 * @returns {Database} - Instancia de base de datos cifrada
 */
export function createEncryptedDatabase(dbPath, options = {}) {
  // ORDEN ORIGINAL: Buscar primero en server/, luego databases/, luego server/databases/
  let finalPath = dbPath;
  const fileName = path.basename(dbPath);
  
  // Si es una ruta absoluta, usar directamente
  if (path.isAbsolute(dbPath)) {
    finalPath = dbPath;
  } else {
    // Ruta relativa: Buscar en orden ORIGINAL y usar la que tenga más datos
    const posiblesUbicaciones = [
      path.join(DATABASES_DIR_SERVER_FOLDER, fileName), // Primero: server/ (ORIGINAL)
      path.join(DATABASES_DIR_ROOT, fileName),          // Segundo: databases/ (raíz)
      path.join(DATABASES_DIR_SERVER, fileName),        // Tercero: server/databases/ (nueva)
      path.join(process.cwd(), fileName)                // Cuarto: raíz
    ];
    
    // Encontrar todas las ubicaciones donde existe el archivo
    const archivosExistentes = posiblesUbicaciones.filter(p => fs.existsSync(p));
    
    if (archivosExistentes.length === 0) {
      // No existe en ninguna ubicación, crear en server/ (ubicación original)
      finalPath = path.join(DATABASES_DIR_SERVER_FOLDER, fileName);
    } else {
      // Encontrar el archivo con más datos
      let archivoConMasDatos = archivosExistentes[0];
      let tamanoMaximo = fs.statSync(archivoConMasDatos).size;
      
      for (const archivo of archivosExistentes) {
        const tamano = fs.statSync(archivo).size;
        if (tamano > tamanoMaximo) {
          tamanoMaximo = tamano;
          archivoConMasDatos = archivo;
        }
      }
      
      // Usar el archivo con más datos (sin moverlo, solo usarlo)
      finalPath = archivoConMasDatos;
    }
  }
  
  // Verificar si el archivo existe y es válido
  const archivoExiste = fs.existsSync(finalPath);
  let archivoValido = false;
  let archivoCorrupto = false;
  
  if (archivoExiste) {
    try {
      // Verificar que el archivo no esté vacío
      const stats = fs.statSync(finalPath);
      if (stats.size === 0) {
        // Archivo vacío, marcarlo como corrupto
        archivoCorrupto = true;
      } else {
        // Intentar verificar si es válida (con manejo de errores)
        let testDb = null;
        try {
          // Primero intentar sin cifrado
          testDb = new DatabasePlain(finalPath);
          testDb.prepare("SELECT 1").get();
          archivoValido = true;
          testDb.close();
        } catch (e) {
          // Si falla sin cifrado, intentar con cifrado
          if (testDb) {
            try {
              testDb.close();
            } catch (e2) {
              // Ignorar error al cerrar
            }
          }
          
          try {
            testDb = new Database(finalPath);
            testDb.pragma(`key = '${DB_ENCRYPTION_KEY}'`);
            testDb.prepare("SELECT 1").get();
            archivoValido = true;
            testDb.close();
          } catch (e2) {
            // Archivo corrupto o no es una base de datos válida
            if (testDb) {
              try {
                testDb.close();
              } catch (e3) {
                // Ignorar error al cerrar
              }
            }
            archivoCorrupto = true;
          }
        }
      }
    } catch (e) {
      // Error al verificar el archivo, asumir corrupto
      archivoCorrupto = true;
    }
  }
  
  // Si el archivo está corrupto, hacer backup pero NO eliminarlo automáticamente
  // El usuario debe decidir si quiere restaurar desde backup o intentar recuperar datos
  if (archivoCorrupto) {
    try {
      const backupDir = path.join(DATABASES_DIR_SERVER_FOLDER, "backups");
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const backupPath = path.join(backupDir, `${path.basename(finalPath)}.corrupt.${Date.now()}`);
      fs.copyFileSync(finalPath, backupPath);
      console.warn(`⚠️ Archivo corrupto detectado y respaldado: ${backupPath}`);
      console.warn(`⚠️ IMPORTANTE: El archivo ${finalPath} está corrupto pero NO se eliminará automáticamente.`);
      console.warn(`⚠️ Para restaurar desde backup, ejecuta: node server/restaurar_backups.js`);
      console.warn(`⚠️ Intentando continuar con el archivo corrupto (puede fallar)...`);
    } catch (e) {
      console.warn(`⚠️ No se pudo respaldar archivo corrupto: ${e.message}`);
    }
    
    // NO eliminar automáticamente - dejar que el usuario decida
    // Si el archivo está corrupto, intentaremos abrirlo de todas formas
    // y si falla, el bucle de reintentos manejará el error
  }
  
  // Abrir la base de datos (se creará automáticamente si no existe)
  let db;
  let intentos = 0;
  const maxIntentos = 5; // Aumentar intentos para dar más oportunidades
  
  while (intentos < maxIntentos) {
    try {
      // Si el archivo fue eliminado o no existe, SQLite lo creará automáticamente
      db = new Database(finalPath, options);
      
      // Configurar cifrado usando SQLCipher
      db.pragma(`key = '${DB_ENCRYPTION_KEY}'`);
      
      // Verificar que el cifrado funciona ejecutando una consulta simple
      // Si el archivo es nuevo, esto creará la estructura básica
      db.prepare("SELECT 1").get();
      
      // Si llegamos aquí, la base de datos es válida
      if (!archivoExiste) {
        console.log(`✅ Nueva base de datos creada: ${finalPath}`);
      } else if (archivoCorrupto) {
        console.warn(`⚠️ ADVERTENCIA: Se logró abrir un archivo que estaba marcado como corrupto. Puede haber pérdida de datos.`);
      }
      break; // Salir del bucle si todo está bien
    } catch (error) {
      intentos++;
      
      // Cerrar la conexión si existe
      if (db) {
        try {
          db.close();
        } catch (e) {
          // Ignorar errores al cerrar
        }
        db = null;
      }
      
      // Si el error es que el archivo no es una base de datos válida
      if (error.code === 'SQLITE_NOTADB' || error.message?.includes('not a database')) {
        // Hacer backup del archivo corrupto (si no se hizo antes)
        if (fs.existsSync(finalPath)) {
          try {
            const backupDir = path.join(DATABASES_DIR_SERVER_FOLDER, "backups");
            if (!fs.existsSync(backupDir)) {
              fs.mkdirSync(backupDir, { recursive: true });
            }
            const backupPath = path.join(backupDir, `${path.basename(finalPath)}.corrupt.${Date.now()}`);
            fs.copyFileSync(finalPath, backupPath);
            console.warn(`⚠️ Archivo corrupto respaldado: ${backupPath}`);
          } catch (e) {
            console.warn(`⚠️ No se pudo respaldar archivo corrupto: ${e.message}`);
          }
        }
        
        // Si es el último intento, mover el archivo corrupto y crear uno nuevo
        if (intentos >= maxIntentos) {
          console.error(`\n❌ CRÍTICO: El archivo ${finalPath} está corrupto y no se puede abrir después de ${maxIntentos} intentos.`);
          console.error(`   Se ha respaldado el archivo corrupto en la carpeta de backups.`);
          console.error(`   ⚠️  ADVERTENCIA: Se creará un archivo nuevo VACÍO. Todos los datos del archivo corrupto se perderán.`);
          console.error(`   Si necesitas recuperar datos, revisa los backups en: ${path.join(DATABASES_DIR_SERVER_FOLDER, "backups")}\n`);
          
          // Mover el archivo corrupto a un lugar seguro (no eliminarlo)
          try {
            const backupDir = path.join(DATABASES_DIR_SERVER_FOLDER, "backups");
            if (!fs.existsSync(backupDir)) {
              fs.mkdirSync(backupDir, { recursive: true });
            }
            const corruptBackupPath = path.join(backupDir, `${path.basename(finalPath)}.corrupto_final.${Date.now()}`);
            fs.renameSync(finalPath, corruptBackupPath);
            console.warn(`📦 Archivo corrupto movido a: ${corruptBackupPath}`);
            console.warn(`   Este archivo NO será eliminado. Puedes intentar recuperarlo manualmente más tarde.\n`);
          } catch (e) {
            console.error(`❌ No se pudo mover el archivo corrupto: ${e.message}`);
            // Si no se puede mover, intentar eliminarlo como último recurso
            try {
              fs.unlinkSync(finalPath);
              console.warn(`🗑️  Archivo corrupto eliminado para permitir crear uno nuevo.`);
            } catch (deleteErr) {
              console.error(`❌ No se pudo eliminar el archivo corrupto: ${deleteErr.message}`);
              throw new Error(`FATAL: No se puede crear una nueva base de datos porque el archivo corrupto no se puede mover ni eliminar. Elimínalo MANUALMENTE: ${finalPath}`);
            }
          }
          
          // Intentar crear un archivo nuevo una vez más
          try {
            db = new Database(finalPath, options);
            db.pragma(`key = '${DB_ENCRYPTION_KEY}'`);
            db.prepare("SELECT 1").get();
            console.log(`✅ Nueva base de datos creada después de mover el archivo corrupto: ${finalPath}`);
            break;
          } catch (createError) {
            throw new Error(`FATAL: No se pudo crear una nueva base de datos después de mover el archivo corrupto: ${createError.message}`);
          }
        }
        
        // Si aún tenemos intentos, continuar
        if (intentos < maxIntentos) {
          console.warn(`⚠️ Intento ${intentos}/${maxIntentos} fallido. Reintentando...`);
          continue;
        }
      }
      
      // Si es el último intento o el error no es de archivo corrupto, lanzar el error
      if (intentos >= maxIntentos) {
        console.error(`❌ Error configurando cifrado para ${dbPath}:`, error.message);
        console.error(`   Ruta intentada: ${finalPath}`);
        throw error;
      }
    }
  }
  
  // Verificar que tenemos una base de datos válida
  if (!db) {
    throw new Error(`No se pudo crear o abrir la base de datos después de ${maxIntentos} intentos: ${finalPath}`);
  }
  
  // Para inventario.db, verificar inmediatamente si tiene datos
  if (path.basename(finalPath) === "inventario.db") {
    try {
      const testCount = db.prepare("SELECT COUNT(*) as total FROM productos_ref").get();
      if (testCount.total === 0) {
        const fileSize = fs.statSync(finalPath).size;
        if (fileSize > 10000) {
          console.warn(`⚠️ inventario.db tiene ${fileSize} bytes pero 0 productos. Verificando estructura...`);
          const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
          console.warn(`   Tablas encontradas: ${tablas.map(t => t.name).join(', ')}`);
        }
      }
    } catch (e) {
      // La tabla podría no existir aún, es normal
      console.warn(`⚠️ No se pudo verificar contenido de inventario.db:`, e.message);
    }
  }
  
  return db;
}

/**
 * Verifica si una base de datos está cifrada
 * @param {string} dbPath - Ruta al archivo de base de datos
 * @returns {boolean} - true si está cifrada, false si no
 */
export function isDatabaseEncrypted(dbPath) {
  // Normalizar la ruta igual que en createEncryptedDatabase (orden original)
  let finalPath = dbPath;
  const fileName = path.basename(dbPath);
  
  if (!path.isAbsolute(dbPath)) {
    // Buscar en orden original: server/, databases/, server/databases/
    const pathServer = path.join(DATABASES_DIR_SERVER_FOLDER, fileName);
    const pathRoot = path.join(DATABASES_DIR_ROOT, fileName);
    const pathServerDatabases = path.join(DATABASES_DIR_SERVER, fileName);
    
    if (fs.existsSync(pathServer)) {
      finalPath = pathServer;
    } else if (fs.existsSync(pathRoot)) {
      finalPath = pathRoot;
    } else if (fs.existsSync(pathServerDatabases)) {
      finalPath = pathServerDatabases;
    } else {
      finalPath = pathServer; // Default a server/
    }
  }
  
  try {
    const db = new DatabasePlain(finalPath);
    // Intentar acceder sin clave
    db.prepare("SELECT 1").get();
    db.close();
    return false; // Si puede acceder sin clave, no está cifrada
  } catch (error) {
    // Si hay error, probablemente está cifrada
    return true;
  }
}

/**
 * Migra una base de datos sin cifrar a cifrada
 * @param {string} dbPath - Ruta al archivo de base de datos
 * @returns {boolean} - true si la migración fue exitosa
 */
export function migrateToEncrypted(dbPath) {
  // Normalizar la ruta igual que en createEncryptedDatabase (orden original)
  let finalPath = dbPath;
  const fileName = path.basename(dbPath);
  
  if (!path.isAbsolute(dbPath)) {
    // Buscar en orden original: server/, databases/, server/databases/
    const pathServer = path.join(DATABASES_DIR_SERVER_FOLDER, fileName);
    const pathRoot = path.join(DATABASES_DIR_ROOT, fileName);
    const pathServerDatabases = path.join(DATABASES_DIR_SERVER, fileName);
    
    if (fs.existsSync(pathServer)) {
      finalPath = pathServer;
    } else if (fs.existsSync(pathRoot)) {
      finalPath = pathRoot;
    } else if (fs.existsSync(pathServerDatabases)) {
      finalPath = pathServerDatabases;
    } else {
      finalPath = pathServer; // Default a server/
    }
  }
  
  try {
    console.log(`🔄 Migrando base de datos a cifrada: ${finalPath}`);
    
    // Abrir la base de datos sin cifrar
    const dbUnencrypted = new DatabasePlain(finalPath);
    
    // Crear una copia temporal cifrada
    const tempPath = `${finalPath}.encrypted.tmp`;
    const dbEncrypted = createEncryptedDatabase(tempPath);
    
    // Copiar todos los datos
    // Obtener todas las tablas
    const tables = dbUnencrypted.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all();
    
    for (const table of tables) {
      const tableName = table.name;
      
      // Obtener estructura de la tabla
      const createTable = dbUnencrypted.prepare(`
        SELECT sql FROM sqlite_master 
        WHERE type='table' AND name=?
      `).get(tableName);
      
      if (createTable && createTable.sql) {
        // Crear la tabla en la BD cifrada
        dbEncrypted.exec(createTable.sql);
        
        // Copiar datos
        const rows = dbUnencrypted.prepare(`SELECT * FROM ${tableName}`).all();
        if (rows.length > 0) {
          const columns = Object.keys(rows[0]);
          const placeholders = columns.map(() => '?').join(', ');
          const insert = dbEncrypted.prepare(
            `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`
          );
          
          for (const row of rows) {
            insert.run(...columns.map(col => row[col]));
          }
        }
      }
    }
    
    // Copiar índices
    const indexes = dbUnencrypted.prepare(`
      SELECT sql FROM sqlite_master 
      WHERE type='index' AND name NOT LIKE 'sqlite_%'
    `).all();
    
    for (const index of indexes) {
      if (index.sql) {
        try {
          dbEncrypted.exec(index.sql);
        } catch (e) {
          // Ignorar errores de índices duplicados
        }
      }
    }
    
    // Cerrar ambas bases de datos
    dbUnencrypted.close();
    dbEncrypted.close();
    
    // Hacer backup de la original (en carpeta server/backups si existe)
    const backupsDir = path.join(DATABASES_DIR_SERVER_FOLDER, "backups");
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    const backupPath = path.join(backupsDir, `${path.basename(finalPath)}.backup.${Date.now()}`);
    fs.copyFileSync(finalPath, backupPath);
    console.log(`💾 Backup creado: ${backupPath}`);
    
    // Reemplazar la original con la cifrada
    fs.copyFileSync(tempPath, finalPath);
    fs.unlinkSync(tempPath);
    
    // Migración completada
    return true;
  } catch (error) {
    console.error(`❌ Error migrando ${dbPath}:`, error);
    return false;
  }
}

export { DB_ENCRYPTION_KEY };









