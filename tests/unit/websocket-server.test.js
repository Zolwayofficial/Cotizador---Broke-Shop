const WebSocket = require('ws')
const websocketModule = require('../../server/websocket/websocket-server')

describe('websocket-server', () => {
  const { WebSocketServer, normalizePort } = websocketModule

  it('normaliza puertos utiles y rechaza entradas vacias', () => {
    expect(normalizePort('3002')).toBe(3002)
    expect(normalizePort(4500)).toBe(4500)
    expect(normalizePort('')).toBeNull()
    expect(normalizePort('0')).toBeNull()
  })

  it('rechaza iniciar el servidor si WS_PORT no esta configurado', () => {
    const server = new WebSocketServer()

    expect(() => server.start({ obtenerSalud: () => ({ status: 'ok' }) })).toThrow('WS_PORT no configurado o fuera de rango')
  })

  it('respeta suscripciones de metricas y alertas al hacer broadcast', () => {
    const server = new WebSocketServer(3002)
    const metricClient = { readyState: WebSocket.OPEN, channels: new Set(['metricas']), send: jest.fn() }
    const alertClient = { readyState: WebSocket.OPEN, channels: new Set(['alertas']), send: jest.fn() }
    const closedClient = { readyState: WebSocket.CLOSED, channels: new Set(['metricas', 'alertas']), send: jest.fn() }

    server.clients = new Set([metricClient, alertClient, closedClient])

    server.broadcast('actualizacion', { ok: true }, 'metricas')
    server.enviarAlerta({ tipo: 'warning' })

    expect(metricClient.send).toHaveBeenCalledTimes(1)
    expect(alertClient.send).toHaveBeenCalledTimes(1)
    expect(closedClient.send).not.toHaveBeenCalled()
    expect(server.clients.has(closedClient)).toBe(false)
  })

  it('suscribir y desuscribir actualizan los canales del cliente', () => {
    const server = new WebSocketServer(3002)
    const ws = { channels: new Set(['metricas']), send: jest.fn() }

    server.suscribir(ws, ['alertas'])
    server.desuscribir(ws, ['metricas'])

    expect(Array.from(ws.channels)).toEqual(['alertas'])
    expect(ws.send).toHaveBeenCalledTimes(2)
  })
})
