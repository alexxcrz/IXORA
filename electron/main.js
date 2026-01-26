// Archivo principal de Electron
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let serverProcess;

// Función para crear la ventana principal
function createWindow() {
  // Obtener el icono correcto según el entorno
  let iconPath;
  if (app.isPackaged) {
    // En producción empaquetada
    iconPath = path.join(process.resourcesPath, 'app', 'client', 'public', 'favicon.ico');
    if (!fs.existsSync(iconPath)) {
      iconPath = path.join(__dirname, '..', 'client', 'public', 'favicon.ico');
    }
  } else {
    // En desarrollo
    iconPath = path.join(__dirname, '../client/public/favicon.ico');
  }

  // Obtener la ruta del splash screen
  let splashImagePath;
  if (app.isPackaged) {
    splashImagePath = path.join(process.resourcesPath, 'app', 'client', 'public', 'splash.png');
    if (!fs.existsSync(splashImagePath)) {
      splashImagePath = path.join(__dirname, '..', 'client', 'public', 'splash.png');
    }
  } else {
    splashImagePath = path.join(__dirname, '../client/public/splash.png');
  }

  // Crear ventana de splash screen
  const splashWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#15192e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Cargar splash screen HTML con la ruta de la imagen
  const splashHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #15192e;
    }
    #splash-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  </style>
</head>
<body>
  <img id="splash-image" src="file://${splashImagePath.replace(/\\/g, '/')}" alt="IXORA" />
</body>
</html>`;
  
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);

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
    icon: iconPath,
    show: false, // No mostrar hasta que esté listo
    titleBarStyle: 'default',
    title: 'IXORA - Sistema de Gestión' // Título personalizado
  });

  // Mostrar ventana cuando esté lista y cerrar splash
  mainWindow.once('ready-to-show', () => {
    // Cerrar splash screen
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    
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
  console.log('📁 Ruta de la app:', app.getAppPath());
  console.log('📁 Directorio del servidor:', serverDir);
  console.log('📁 process.resourcesPath:', process.resourcesPath);
  console.log('📁 app.isPackaged:', app.isPackaged);
  
  // Determinar la ruta de Node.js
  const nodePath = process.execPath; // Usar el Node.js incluido con Electron
  
  // Obtener la ruta base de la aplicación (funciona en desarrollo y producción)
  let appPath = app.getAppPath();
  
  // En producción empaquetada, verificar si existe resources/app
  if (app.isPackaged && process.resourcesPath) {
    const resourcesAppPath = path.join(process.resourcesPath, 'app');
    if (fs.existsSync(resourcesAppPath)) {
      appPath = resourcesAppPath;
      console.log('📁 Usando resources/app:', appPath);
    }
  }
  
  // Iniciar el servidor
  serverProcess = spawn(nodePath, [serverPath], {
    cwd: serverDir,
    stdio: ['ignore', 'pipe', 'pipe'], // Capturar stdout y stderr
    shell: false,
    env: {
      ...process.env,
      PORT: '3001',
      NODE_ENV: process.env.NODE_ENV || 'production',
      ELECTRON_RUN_AS_NODE: '1', // Permitir que Node.js se ejecute correctamente
      APP_PATH: appPath // Pasar la ruta de la app al servidor
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

  // Esperar un momento para que el servidor inicie y encuentre los archivos
  setTimeout(() => {
    console.log('✅ Servidor iniciado, abriendo ventana...');
    createWindow();
  }, 5000); // Aumentado a 5 segundos para dar más tiempo al servidor
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

