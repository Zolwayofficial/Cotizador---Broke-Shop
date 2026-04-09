const { describe, expect, it } = require('@jest/globals');
const http = require('http');
const {
  DEFAULT_BASE_URL,
  MANUAL_HTTP_TIMEOUT_MS,
  buildRequestHeaders,
  classifyManualHttpStatus,
  getRequestModuleName,
  normalizeBaseUrl,
  normalizeToken,
  requestJson,
} = require('../../scripts/manual-smoke-helpers.cjs');

describe('utilidades de prueba manual', () => {
  it('normaliza BASE_URL y quita slash final', () => {
    expect(normalizeBaseUrl(' http://localhost:3000/ ')).toBe('http://localhost:3000');
    expect(normalizeBaseUrl('')).toBe(DEFAULT_BASE_URL);
    expect(normalizeBaseUrl('importaiagent.com/')).toBe('http://importaiagent.com');
  });

  it('usa PORT como fallback local cuando BASE_URL no existe', () => {
    const originalPort = process.env.PORT;

    try {
      process.env.PORT = '4100';
      jest.resetModules();

      const freshHelpers = require('../../scripts/manual-smoke-helpers.cjs');

      expect(freshHelpers.DEFAULT_BASE_URL).toBe('http://localhost:4100');
      expect(freshHelpers.normalizeBaseUrl('')).toBe('http://localhost:4100');
    } finally {
      if (originalPort === undefined) {
        delete process.env.PORT;
      } else {
        process.env.PORT = originalPort;
      }
      jest.resetModules();
    }
  });

  it('normaliza tokens y construye Authorization solo cuando existe', () => {
    expect(normalizeToken('  abc  ')).toBe('abc');
    expect(buildRequestHeaders('  abc  ')).toEqual({ Authorization: 'Bearer abc' });
    expect(buildRequestHeaders('')).toEqual({});
  });

  it('clasifica respuestas manuales distinguiendo auth faltante y admin faltante', () => {
    expect(classifyManualHttpStatus(200)).toEqual({ bucket: 'success', label: 'RESPONDIO' });
    expect(classifyManualHttpStatus(400, { allowBadRequest: true })).toEqual({
      bucket: 'success',
      label: 'RESPONDIO (400 esperado)',
    });
    expect(classifyManualHttpStatus(401, { requiresAuth: true, hasToken: false })).toEqual({
      bucket: 'skipped',
      label: 'OMITIDA',
      reason: 'falta token de autenticacion',
    });
    expect(classifyManualHttpStatus(403, { requiresAdmin: true, hasToken: true })).toEqual({
      bucket: 'skipped',
      label: 'OMITIDA',
      reason: 'se requiere token admin',
    });
  });

  it('elige el transporte correcto segun el protocolo', () => {
    expect(getRequestModuleName('http://localhost:3000')).toBe('http');
    expect(getRequestModuleName('https://importaiagent.com')).toBe('https');
  });

  it('requestJson aplica timeout utilizable por defecto', async () => {
    const fakeGet = jest.spyOn(http, 'get').mockImplementation((_url, _options, callback) => {
      const events = {};
      const response = {
        statusCode: 200,
        on(event, handler) {
          events[event] = handler;
        },
      };
      callback(response);
      process.nextTick(() => {
        events.data?.('{"ok":true}');
        events.end?.();
      });
      return {
        setTimeout(timeoutMs) {
          expect(timeoutMs).toBe(MANUAL_HTTP_TIMEOUT_MS);
        },
        on() {},
        destroy() {},
      };
    });

    const result = await requestJson('http://localhost:3000/api/health');

    expect(result).toEqual({ statusCode: 200, data: { ok: true } });
    fakeGet.mockRestore();
  });
});
