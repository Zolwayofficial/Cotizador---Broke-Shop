// server/websocket/websocket-server.js
// 
// SERVIDOR WEB SOCKET PARA TIEMPO REAL
// 
// Features:
// - Actualizaciones en tiempo real del dashboard
// - Notificaciones de alertas
// - Monitoreo en vivo
// - 100% gratis

const WebSocket = require('ws');

class WebSocketServer {
  constructor(port = 3002) {
    this.port = port;
    this.wss = null;
    this.clients = new Set();
    this.monitorInterval = null;
  }

  // Iniciar servidor WebSocket
  start(monitorService) {
    this.wss = new WebSocket.Server({ port: this.port });
    this.monitorService = monitorService;

    this.wss.on('connection', (ws) => {
      console.log('[WS] Cliente conectado');
      this.clients.add(ws);

      // Enviar saludo inicial
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Conectado al servidor WebSocket',
        timestamp: new Date().toISOString()
      }));

      // Enviar datos iniciales
      this.enviarDatosIniciales(ws);

      ws.on('message', (message) => {
        this.manejarMensaje(ws, message);
      });

      ws.on('close', () => {
        console.log('[WS] Cliente desconectado');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('[WS] Error:', error.message);
        this.clients.delete(ws);
      });
    });

    // Iniciar monitoreo en tiempo real
    this.iniciarMonitoreoTiempoReal();

    console.log(`[WS] Servidor WebSocket iniciado en puerto ${this.port}`);
  }

  // Enviar datos iniciales al cliente
  enviarDatosIniciales(ws) {
    const salud = this.monitorService.obtenerSalud();
    
    ws.send(JSON.stringify({
      type: 'datos_iniciales',
      data: salud,
      timestamp: new Date().toISOString()
    }));
  }

  // Manejar mensajes del cliente
  manejarMensaje(ws, message) {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          break;
        
        case 'suscribir':
          this.suscribir(ws, data.channels);
          break;
        
        case 'desuscribir':
          this.desuscribir(ws, data.channels);
          break;
        
        default:
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Tipo de mensaje no reconocido' 
          }));
      }
    } catch (error) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'Error procesando mensaje' 
      }));
    }
  }

  // Suscribir a canales
  suscribir(ws, channels) {
    ws.channels = ws.channels || new Set();
    channels.forEach(channel => ws.channels.add(channel));
    
    ws.send(JSON.stringify({
      type: 'suscrito',
      channels: Array.from(ws.channels),
      timestamp: new Date().toISOString()
    }));
  }

  // Desuscribir de canales
  desuscribir(ws, channels) {
    if (!ws.channels) return;
    channels.forEach(channel => ws.channels.delete(channel));
    
    ws.send(JSON.stringify({
      type: 'desuscrito',
      channels: Array.from(ws.channels),
      timestamp: new Date().toISOString()
    }));
  }

  // Iniciar monitoreo en tiempo real
  iniciarMonitoreoTiempoReal() {
    // Enviar actualizaciones cada 5 segundos
    this.monitorInterval = setInterval(() => {
      if (this.clients.size === 0) return;

      const salud = this.monitorService.obtenerSalud();
      const mensaje = JSON.stringify({
        type: 'actualizacion',
        data: salud,
        timestamp: new Date().toISOString()
      });

      // Enviar a todos los clientes
      this.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(mensaje);
        }
      });
    }, 5000);

    console.log('[WS] Monitoreo en tiempo real iniciado');
  }

  // Enviar alerta a todos los clientes
  enviarAlerta(alerta) {
    const mensaje = JSON.stringify({
      type: 'alerta',
      data: alerta,
      timestamp: new Date().toISOString()
    });

    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(mensaje);
      }
    });
  }

  // Detener servidor
  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }

    if (this.wss) {
      this.wss.close(() => {
        console.log('[WS] Servidor WebSocket detenido');
      });
    }
  }
}

// ═══════════════════════════════════════════════════
// EXPORTAR INSTANCIA ÚNICA
// ═══════════════════════════════════════════════════

const websocketServer = new WebSocketServer();

module.exports = websocketServer;
