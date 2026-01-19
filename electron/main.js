// Archivo principal de Electron
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let serverProcess;

// Función para crear la ventana principal
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
    icon: path.join(__dirname, '../client/public/favicon.ico'),
    show: false, // No mostrar hasta que esté listo
    titleBarStyle: 'default'
  });

  // Mostrar ventana cuando esté lista
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Abrir DevTools en desarrollo (opcional)
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools();
    }
  });

  // Cargar la aplicación
  const isDev = process.env.NODE_ENV === 'development';
  
  if (isDev) {
    // En desarrollo, conectar al servidor de desarrollo
    mainWindow.loadURL('http://localhost:3000');
  } else {
    // En producción, cargar desde el servidor local
    mainWindow.loadURL('http://localhost:3001');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Manejar errores de carga
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Error al cargar:', errorCode, errorDescription);
    
    // Reintentar después de un breve delay
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (isDev) {
          mainWindow.loadURL('http://localhost:3000');
        } else {
          mainWindow.loadURL('http://localhost:3001');
        }
      }
    }, 2000);
  });
}

// Iniciar el servidor Node.js
function startServer() {
  const serverPath = path.join(__dirname, '../server/server.js');
  const serverDir = path.join(__dirname, '../server');
  
  // Verificar que el archivo del servidor existe
  if (!fs.existsSync(serverPath)) {
    console.error('❌ No se encontró el archivo del servidor:', serverPath);
    return;
  }

  console.log('🚀 Iniciando servidor...');
  
  // Determinar la ruta de Node.js
  const nodePath = process.execPath; // Usar el Node.js incluido con Electron
  
  // Iniciar el servidor
  serverProcess = spawn(nodePath, [serverPath], {
    cwd: serverDir,
    stdio: ['ignore', 'pipe', 'pipe'], // Capturar stdout y stderr
    shell: false,
    env: {
      ...process.env,
      PORT: '3001',
      NODE_ENV: process.env.NODE_ENV || 'production',
      ELECTRON_RUN_AS_NODE: '1' // Permitir que Node.js se ejecute correctamente
    }
  });

  // Mostrar logs del servidor en la consola
  serverProcess.stdout.on('data', (data) => {
    console.log(`[Servidor] ${data.toString().trim()}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[Servidor Error] ${data.toString().trim()}`);
  });

  serverProcess.on('error', (error) => {
    console.error('❌ Error al iniciar el servidor:', error);
  });

  serverProcess.on('exit', (code) => {
    console.log(`⚠️ Servidor terminado con código: ${code}`);
    if (code !== 0 && code !== null) {
      console.error('❌ El servidor se cerró inesperadamente');
    }
  });

  // Esperar un momento para que el servidor inicie
  setTimeout(() => {
    console.log('✅ Servidor iniciado, abriendo ventana...');
    createWindow();
  }, 3000);
}

// Cuando Electron esté listo
app.whenReady().then(() => {
  // Solo iniciar el servidor si no estamos en desarrollo con servidor externo
  if (process.env.NODE_ENV !== 'development' || process.env.START_SERVER !== 'false') {
    startServer();
  } else {
    createWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Cerrar cuando todas las ventanas estén cerradas
app.on('window-all-closed', () => {
  // Detener el servidor
  if (serverProcess) {
    console.log('🛑 Deteniendo servidor...');
    serverProcess.kill();
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Manejar cierre de la aplicación
app.on('before-quit', () => {
  if (serverProcess) {
    console.log('🛑 Cerrando servidor...');
    serverProcess.kill();
  }
});

// IPC handlers para comunicación entre procesos
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-app-path', () => {
  return app.getPath('userData');
});

