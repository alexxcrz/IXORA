// Script para detectar automáticamente la IP local y abrir el navegador
const os = require('os');
const { exec } = require('child_process');

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const ip = getLocalIP();
const clientPort = process.env.PORT || 3000;
const serverPort = 3001;
const url = `http://${ip}:${clientPort}`;
const serverUrl = `http://${ip}:${serverPort}`;

// Solo mostrar información esencial
if (ip !== 'localhost') {
  console.log(`🌐 Servidor: ${serverUrl} | Cliente: ${url}`);
}

// Abrir navegador según el sistema operativo
const platform = process.platform;
let command;

if (platform === 'win32') {
  command = `start ${url}`;
} else if (platform === 'darwin') {
  command = `open ${url}`;
} else {
  command = `xdg-open ${url}`;
}

exec(command, (error) => {
  if (error) {
    console.warn(`⚠️ No se pudo abrir el navegador automáticamente. Abre manualmente: ${url}`);
  }
});
