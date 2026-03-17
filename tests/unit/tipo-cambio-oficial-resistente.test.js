const { describe, it, expect, beforeEach } = require('@jest/globals');

const mockExecFile = jest.fn();

jest.mock('child_process', () => ({
  execFile: (...args) => mockExecFile(...args),
}));

describe('tipo-cambio-oficial-resistente', () => {
  beforeEach(() => {
    jest.resetModules();
    mockExecFile.mockReset();
    delete process.env.OFFICIAL_FX_PYTHON_BIN;
  });

  it('normaliza la salida del helper oficial cuando devuelve compra y venta validas', async () => {
    process.env.OFFICIAL_FX_PYTHON_BIN = 'python-test';
    mockExecFile.mockImplementation((_bin, _args, _options, callback) => {
      callback(null, JSON.stringify({
        compra: 3.66,
        venta: 3.7,
        source: 'SBS_oficial_stealth',
        status: 'oficial_en_vivo',
        strategy: 'stealth_browser',
        official: true,
      }), '');
    });

    const helper = require('../../server/tipo-cambio-oficial-resistente');
    const resultado = await helper.getTipoCambioOficialResistente({ enabled: true });

    expect(resultado.compra).toBeCloseTo(3.66, 4);
    expect(resultado.venta).toBeCloseTo(3.7, 4);
    expect(resultado.status).toBe('oficial_en_vivo');
    expect(resultado.strategy).toBe('stealth_browser');
  });

  it('devuelve null cuando el helper falla o no entrega json valido', async () => {
    process.env.OFFICIAL_FX_PYTHON_BIN = 'python-test';
    mockExecFile.mockImplementation((_bin, _args, _options, callback) => {
      callback(new Error('boom'), '', 'helper error');
    });

    const helper = require('../../server/tipo-cambio-oficial-resistente');
    const resultado = await helper.getTipoCambioOficialResistente({ enabled: true });

    expect(resultado).toBeNull();
  });
});
