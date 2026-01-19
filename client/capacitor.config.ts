import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ixora.app',
  appName: 'IXORA',
  webDir: 'build',
  server: {
    // Configuración del servidor para desarrollo
    // En producción, la app usará la IP detectada automáticamente o la configurada
    // url: 'http://172.16.30.12:3001', // Descomentar si necesitas forzar una IP específica
    androidScheme: 'http',
    cleartext: true // Permitir tráfico HTTP (necesario para servidores sin HTTPS)
  },
  android: {
    allowMixedContent: true, // Permitir contenido mixto HTTP/HTTPS
    captureInput: true,
    webContentsDebuggingEnabled: false
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: "#15192e",
      style: "DARK"
    }
  }
};

export default config;
