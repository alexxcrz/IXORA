const { createProxyMiddleware } = require('http-proxy-middleware');

// IP y puerto del servidor - actualizar según sea necesario
const SERVER_IP = process.env.REACT_APP_SERVER_IP || '172.16.30.5';
const SERVER_PORT = process.env.REACT_APP_SERVER_PORT || '3001';
const SERVER_URL = `http://${SERVER_IP}:${SERVER_PORT}`;

module.exports = function(app) {
  // Solo hacer proxy de rutas de API, no de archivos estáticos ni hot-reload
  app.use(
    '/api',
    createProxyMiddleware({
      target: SERVER_URL,
      changeOrigin: true,
      ws: true, // Habilitar WebSocket para socket.io
      logLevel: 'silent', // Reducir logs de proxy
      onProxyReq: (proxyReq, req, res) => {
        // No hacer proxy de archivos de hot-reload
        if (req.url.includes('.hot-update.') || req.url.includes('hot-update.json')) {
          res.status(404).end();
          return;
        }
        // Agregar headers si es necesario
        proxyReq.setHeader('X-Forwarded-Host', req.get('host'));
        proxyReq.setHeader('X-Forwarded-Proto', req.protocol);
      },
      onError: (err, req, res) => {
        // Solo mostrar errores críticos
        if (!req.url.includes('.hot-update.') && !req.url.includes('hot-update.json') && err.code !== 'ECONNREFUSED') {
          console.error('❌ [Proxy API] Error:', err.message);
        }
      }
    })
  );

  // Proxy para otras rutas del backend (sin /api)
  app.use(
    ['/auth', '/admin', '/inventario', '/picking', '/reenvios', '/reportes', 
     '/devoluciones', '/chat', '/notificaciones', '/uploads', 
     '/sounds', '/tienda', '/activaciones', '/activos', '/server-info', '/server-config'],
    createProxyMiddleware({
      target: SERVER_URL,
      changeOrigin: true,
      ws: true,
      logLevel: 'silent',
      onProxyReq: (proxyReq, req, res) => {
        // Agregar headers si es necesario
        proxyReq.setHeader('X-Forwarded-Host', req.get('host'));
        proxyReq.setHeader('X-Forwarded-Proto', req.protocol);
      },
      onError: (err, req, res) => {
        // Solo mostrar errores críticos
        if (!req.url.includes('.hot-update.') && !req.url.includes('hot-update.json') && err.code !== 'ECONNREFUSED') {
          console.error('❌ [Proxy] Error:', err.message);
        }
      }
    })
  );
};
