// Preload script para Electron (contexto aislado)
const { contextBridge, ipcRenderer } = require('electron');

// Exponer APIs seguras al renderer
contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  
  // Puedes agregar más APIs aquí según necesites
  platform: process.platform,
  versions: process.versions
});








