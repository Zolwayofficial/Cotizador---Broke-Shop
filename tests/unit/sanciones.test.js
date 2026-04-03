const fs = require('fs');
const path = require('path');

const SOURCE_PATH = path.resolve(__dirname, '../../server/sanciones.js');

describe('sanciones', () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    jest.unmock('https');
  });

  test('no reutiliza una entrada de cache vencida', async () => {
    const httpsPostResponse = {
      responses: [
        {
          score: 0.82,
          caption: 'Proveedor Demo SAC',
          datasets: ['ofac'],
          properties: { country: ['PE'] },
          schema: 'Company',
        },
      ],
    };

    const requestMock = jest.fn((options, callback) => {
      const req = {
        on: jest.fn((event, handler) => {
          if (event === 'error') req._onError = handler;
          if (event === 'timeout') req._onTimeout = handler;
          return req;
        }),
        setTimeout: jest.fn(),
        write: jest.fn(),
        end: jest.fn(() => {
          const res = {
            on: jest.fn((event, handler) => {
              if (event === 'data') {
                handler(Buffer.from(JSON.stringify(httpsPostResponse)));
              }
              if (event === 'end') {
                handler();
              }
              return res;
            }),
          };
          callback(res);
        }),
      };
      return req;
    });

    jest.doMock('https', () => ({
      request: requestMock,
    }));

    const sanciones = require('../../server/sanciones');
    const cacheKey = 'empresa:proveedor demo sac:pe';

    sanciones._private._cache[cacheKey] = {
      ts: Date.now() - sanciones._private.CACHE_TTL - 1,
      data: { consultado: true, nombre: 'dato vencido' },
    };

    const result = await sanciones.verificarProveedor('Proveedor Demo SAC', 'PE');

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(result.consultado).toBe(true);
    expect(result.verificado).toBeUndefined();
    expect(result.nombre).toBe('Proveedor Demo SAC');
    expect(sanciones._private._cache[cacheKey].data.nombre).toBe('Proveedor Demo SAC');
  });

  test('separa cache entre persona y empresa aunque coincidan nombre y pais', async () => {
    const httpsPostResponse = {
      responses: [],
    };

    const requestMock = jest.fn((options, callback) => {
      const req = {
        on: jest.fn((event, handler) => {
          if (event === 'error') req._onError = handler;
          if (event === 'timeout') req._onTimeout = handler;
          return req;
        }),
        setTimeout: jest.fn(),
        write: jest.fn(),
        end: jest.fn(() => {
          const res = {
            on: jest.fn((event, handler) => {
              if (event === 'data') {
                handler(Buffer.from(JSON.stringify(httpsPostResponse)));
              }
              if (event === 'end') {
                handler();
              }
              return res;
            }),
          };
          callback(res);
        }),
      };
      return req;
    });

    jest.doMock('https', () => ({
      request: requestMock,
    }));

    const sanciones = require('../../server/sanciones');

    await sanciones.verificar('Empresa Demo', 'PE', 'empresa');
    await sanciones.verificar('Empresa Demo', 'PE', 'persona');

    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(Object.keys(sanciones._private._cache)).toEqual(
      expect.arrayContaining([
        'empresa:empresa demo:pe',
        'persona:empresa demo:pe',
      ])
    );
  });

  test('genera mensajes visibles mas neutrales', () => {
    const sanciones = require('../../server/sanciones');

    expect(sanciones._private.buildSanctionsMessage([]))
      .toBe('No se encontraron coincidencias en listas de sanciones internacionales.');
    expect(sanciones._private.buildSanctionsMessage([{ score: 0.95 }]))
      .toBe('1 coincidencia(s) en listas de sanciones. Revisar antes de continuar.');
  });

  test('source queda ascii y sin copy duro anterior', () => {
    const source = fs.readFileSync(SOURCE_PATH, 'utf8');

    expect(source).toMatch(/^[\x00-\x7F]*$/);
    expect(source).toContain("const cacheKey = `${tipo || 'empresa'}:${nombre}:${pais || ''}`.toLowerCase();");
    expect(source).toContain('function readFreshCacheEntry(cacheKey)');
    expect(source).toContain('function buildSanctionsMessage(matches)');
    expect(source).toContain('consultado: true,');
    expect(source).toContain('consultado: false,');
    expect(source).not.toContain('verificado: true');
    expect(source).not.toContain('verificado: false');
    expect(source).not.toContain('aœ…');
    expect(source).not.toContain('ðŸ”´');
    expect(source).not.toContain('NO proceder');
    expect(source).not.toContain('30+ listas');
  });
});
