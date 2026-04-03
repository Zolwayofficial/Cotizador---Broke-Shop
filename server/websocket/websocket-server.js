// server/websocket/websocket-server.js
// Servidor WebSocket para actualizaciones del dashboard y alertas en tiempo real.

const WebSocket = require('ws');

function normalizePort(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

class WebSocketServer {
  constructor(port = null) {
    this.port = normalizePort(port);
    this.wss = null;
    this.clients = new Set();
    this.monitorInterval = null;
    this.monitorService = null;
  }

  setPort(port) {
    this.port = normalizePort(port);
    return this.port;
  }

  start(monitorService) {
    if (!Number.isInteger(this.port) || this.port <= 0) {
      throw new Error('WS_PORT no configurado o fuera de rango');
    }

    this.stop();

    this.monitorService = monitorService;
    this.wss = new WebSocket.Server({ port: this.port });

    this.wss.on('connection', (ws) => {
      console.log('[WS] Cliente conectado');
      ws.channels = new Set(['metricas', 'alertas']);
      this.clients.add(ws);

      ws.send(
        JSON.stringify({
          type: 'connected',
          message: 'Conectado al servidor WebSocket',
          timestamp: new Date().toISOString(),
        }),
      );

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

    this.iniciarMonitoreoTiempoReal();
    console.log(`[WS] Servidor WebSocket iniciado en puerto ${this.port}`);
  }

  enviarDatosIniciales(ws) {
    const salud = this.monitorService?.obtenerSalud?.() || null;

    ws.send(
      JSON.stringify({
        type: 'datos_iniciales',
        data: salud,
        timestamp: new Date().toISOString(),
      }),
    );
  }

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
        ws.send(JSON.stringify({ type: 'error', message: 'Tipo de mensaje no reconocido' }));
      }
    } catch (_error) {
      ws.send(JSON.stringify({ type: 'error', message: 'Error procesando mensaje' }));
    }
  }

  suscribir(ws, channels) {
    const nextChannels = Array.isArray(channels) ? channels : [];
    ws.channels = ws.channels || new Set(['metricas', 'alertas']);
    nextChannels.forEach((channel) => {
      if (channel) ws.channels.add(channel);
    });

    ws.send(
      JSON.stringify({
        type: 'suscrito',
        channels: Array.from(ws.channels),
        timestamp: new Date().toISOString(),
      }),
    );
  }

  desuscribir(ws, channels) {
    const nextChannels = Array.isArray(channels) ? channels : [];
    ws.channels = ws.channels || new Set(['metricas', 'alertas']);
    nextChannels.forEach((channel) => ws.channels.delete(channel));

    ws.send(
      JSON.stringify({
        type: 'desuscrito',
        channels: Array.from(ws.channels),
        timestamp: new Date().toISOString(),
      }),
    );
  }

  isClientSubscribed(client, channel) {
    if (!channel) return true;
    if (!client.channels) return true;
    return client.channels.has(channel);
  }

  broadcast(type, data, requiredChannel = null) {
    const payload = JSON.stringify({
      type,
      data,
      timestamp: new Date().toISOString(),
    });

    this.clients.forEach((client) => {
      if (client.readyState !== WebSocket.OPEN) {
        this.clients.delete(client);
        return;
      }

      if (!this.isClientSubscribed(client, requiredChannel)) {
        return;
      }

      client.send(payload);
    });
  }

  iniciarMonitoreoTiempoReal() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }

    this.monitorInterval = setInterval(() => {
      if (this.clients.size === 0) return;
      const salud = this.monitorService?.obtenerSalud?.() || null;
      this.broadcast('actualizacion', salud, 'metricas');
    }, 5000);

    this.monitorInterval.unref?.();
    console.log('[WS] Monitoreo en tiempo real iniciado');
  }

  enviarAlerta(alerta) {
    this.broadcast('alerta', alerta, 'alertas');
  }

  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    this.clients.forEach((client) => {
      try {
        client.close?.();
      } catch (_error) {
        // best effort
      }
    });
    this.clients.clear();

    if (this.wss) {
      this.wss.close(() => {
        console.log('[WS] Servidor WebSocket detenido');
      });
      this.wss = null;
    }
  }
}

const websocketServer = new WebSocketServer();

module.exports = websocketServer;
module.exports.WebSocketServer = WebSocketServer;
module.exports.normalizePort = normalizePort;
