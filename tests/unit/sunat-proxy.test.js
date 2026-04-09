const { describe, it, expect, beforeEach } = require('@jest/globals');

let mockHttpsQueue = [];
const mockStealth = jest.fn();

function mockGet(queue) {
  return jest.fn((_url, _options, callback) => {
    const current = queue.shift() || { status: 500, body: '{"error":"empty"}' };
    const responseHandlers = {};

    const response = {
      statusCode: current.status,
      on(event, handler) {
        responseHandlers[event] = handler;
        return response;
      },
    };

    const request = {
      setTimeout() {
        return request;
      },
      on(event, handler) {
        if (event === 'error' && current.requestError) {
          process.nextTick(() => handler(new Error(current.requestError)));
        }
        return request;
      },
    };

    process.nextTick(() => {
      callback(response);
      if (current.requestError) return;
      if (current.body !== undefined && responseHandlers.data) {
        responseHandlers.data(Buffer.from(current.body));
      }
      if (responseHandlers.end) {
        responseHandlers.end();
      }
    });

    return request;
  });
}

jest.mock('https', () => ({
  get: (...args) => mockGet(mockHttpsQueue)(...args),
}));

jest.mock('http', () => ({
  get: jest.fn(),
}));

jest.mock('../../server/tipo-cambio-oficial-resistente', () => ({
  getTipoCambioOficialResistente: (...args) => mockStealth(...args),
}));

describe('sunat-proxy', () => {
  beforeEach(() => {
    jest.resetModules();
    mockHttpsQueue = [];
    mockStealth.mockReset();
  });

  it('usa la API oficial del BCRP con series SBS cuando responde correctamente', async () => {
    mockHttpsQueue.push({
      status: 200,
      body: JSON.stringify({
        periods: [
          { name: '14.Mar.26', values: ['3.650', '3.670'] },
          { name: '17.Mar.26', values: ['3.680', '3.710'] },
        ],
      }),
    });

    const sunatProxy = require('../../server/sunat-proxy');
    const resultado = await sunatProxy.getTipoCambio();

    expect(resultado.compra).toBeCloseTo(3.68, 4);
    expect(resultado.venta).toBeCloseTo(3.71, 4);
    expect(resultado.status).toBe('oficial_en_vivo');
    expect(resultado.source).toBe('BCRP_SBS_series_api');
    expect(resultado.strategy).toBe('bcrp_series_api');
  });

  it('mantiene un user-agent alineado al contrato actual', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'sunat-proxy.js'), 'utf8');

    expect(content).toContain('ImportAIAgentCotizador/1.0');
    expect(content).not.toContain('CotizadorPeru/3.0');
  });

  it('usa la ruta stealth oficial cuando la API oficial y la pagina publica fallan', async () => {
    mockHttpsQueue.push({
      status: 500,
      body: '{"error":"api down"}',
    });
    mockHttpsQueue.push({
      status: 200,
      body: '<html><head><script src="/_Incapsula_Resource?x=1"></script></head><body></body></html>',
    });
    mockStealth.mockResolvedValue({
      compra: 3.69,
      venta: 3.72,
      source: 'SBS_oficial_stealth',
      status: 'oficial_en_vivo',
      strategy: 'stealth_browser',
      official: true,
    });

    const sunatProxy = require('../../server/sunat-proxy');
    const resultado = await sunatProxy.getTipoCambio();

    expect(resultado.compra).toBeCloseTo(3.69, 4);
    expect(resultado.venta).toBeCloseTo(3.72, 4);
    expect(resultado.status).toBe('oficial_en_vivo');
    expect(resultado.strategy).toBe('stealth_browser');
  });

  it('usa referencia externa cuando la oficial falla y el mirror responde', async () => {
    mockHttpsQueue.push({
      status: 500,
      body: '{"error":"api down"}',
    });
    mockHttpsQueue.push({
      status: 200,
      body: '<html><head><script src="/_Incapsula_Resource?x=1"></script></head><body></body></html>',
    });
    mockStealth.mockResolvedValue(null);
    mockHttpsQueue.push({
      status: 200,
      body: JSON.stringify({ compra: 3.68, venta: 3.71, source: 'SUNAT' }),
    });

    const sunatProxy = require('../../server/sunat-proxy');
    const resultado = await sunatProxy.getTipoCambio();

    expect(resultado.compra).toBeCloseTo(3.68, 4);
    expect(resultado.venta).toBeCloseTo(3.71, 4);
    expect(resultado.status).toBe('referencia_externa');
    expect(resultado.source).toBe('mirror_sunat');
  });

  it('usa BCRP oficial aunque venga atrasado y lo marca como stale para no bloquear la cotizacion', async () => {
    mockHttpsQueue.push({
      status: 200,
      body: JSON.stringify({
        periods: [
          { name: '10.Mar.26', values: ['3.600', '3.620'] },
        ],
      }),
    });

    const sunatProxy = require('../../server/sunat-proxy');
    const resultado = await sunatProxy.getTipoCambio();

    expect(resultado.source).toBe('BCRP_SBS_series_api');
    expect(resultado.status).toBe('oficial_en_vivo');
    expect(resultado.stale).toBe(true);
    expect(resultado.compra).toBeCloseTo(3.6, 4);
    expect(resultado.venta).toBeCloseTo(3.62, 4);
  });

  it('salta respuestas no interpretables y usa fallback local si no hay proveedor utilizable', async () => {
    mockHttpsQueue.push({
      status: 500,
      body: '{"error":"api down"}',
    });
    mockHttpsQueue.push({
      status: 200,
      body: '<html><head><script src="/_Incapsula_Resource?x=1"></script></head><body></body></html>',
    });
    mockStealth.mockResolvedValue(null);
    mockHttpsQueue.push({
      status: 401,
      body: JSON.stringify({ error: 'Apikey Required / Limit Exceeded' }),
    });
    mockHttpsQueue.push({
      status: 401,
      body: JSON.stringify({ error: 'Apikey Required / Limit Exceeded' }),
    });

    const sunatProxy = require('../../server/sunat-proxy');
    const resultado = await sunatProxy.getTipoCambio();

    expect(resultado.source).toBe('fallback_local');
    expect(resultado.status).toBe('fallback');
    expect(resultado.compra).toBeCloseTo(3.7, 4);
    expect(resultado.venta).toBeCloseTo(3.75, 4);
  });
});
