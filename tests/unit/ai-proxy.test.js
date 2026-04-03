const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

const AI_PROXY_SOURCE_PATH = path.resolve(__dirname, '../../server/ai-proxy.js');

function buildHttpsMock(sequence, seenBodies) {
  return {
    request: jest.fn((options, callback) => {
      const req = new EventEmitter();
      req.setTimeout = jest.fn();
      req.write = jest.fn((chunk) => {
        seenBodies.push(JSON.parse(chunk.toString()));
      });
      req.end = jest.fn(() => {
        const current = sequence.shift();

        if (current.error) {
          process.nextTick(() => req.emit('error', current.error));
          return;
        }

        const res = new EventEmitter();
        res.statusCode = current.statusCode || 200;

        process.nextTick(() => {
          callback(res);
          if (current.rawBody !== undefined) {
            res.emit('data', Buffer.from(String(current.rawBody)));
          } else if (current.body !== null) {
            res.emit('data', Buffer.from(JSON.stringify(current.body)));
          }
          res.emit('end');
        });
      });

      return req;
    }),
  };
}

describe('ai-proxy', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.GROQ_API_KEY = 'test-groq-key';
    process.env.GROQ_MODEL_CHAT_CHAIN = 'model-primary,model-secondary';
  });

  it('prueba el siguiente modelo cuando el primero cae por rate limit', async () => {
    const seenBodies = [];
    const httpsMock = buildHttpsMock(
      [
        {
          statusCode: 429,
          body: { error: { message: 'rate limit exceeded' } },
        },
        {
          statusCode: 200,
          body: { choices: [{ message: { content: 'respuesta-ok' } }] },
        },
      ],
      seenBodies
    );

    jest.doMock('https', () => httpsMock);
    jest.doMock('../../server/auto-repair', () => ({
      ejecutarConAutoReparacion: jest.fn(async (_agent, fn) => await fn()),
    }));

    const aiProxy = require('../../server/ai-proxy');
    const result = await aiProxy.call([{ role: 'user', content: 'hola' }], 'groq');

    expect(result.text).toBe('respuesta-ok');
    expect(result.model).toBe('model-secondary');
    expect(seenBodies.map((body) => body.model)).toEqual(['model-primary', 'model-secondary']);
  });

  it('expone un error mas preciso cuando el proveedor devuelve body no JSON', async () => {
    const seenBodies = [];
    const httpsMock = buildHttpsMock(
      [
        {
          statusCode: 502,
          rawBody: 'upstream html error',
        },
      ],
      seenBodies
    );

    jest.doMock('https', () => httpsMock);
    jest.doMock('../../server/auto-repair', () => ({
      ejecutarConAutoReparacion: jest.fn(async (_agent, fn) => await fn()),
    }));

    const aiProxy = require('../../server/ai-proxy');

    await expect(aiProxy.call([{ role: 'user', content: 'hola' }], 'groq', 'model-primary')).rejects.toMatchObject({
      message: 'Respuesta no interpretable del proveedor',
      statusCode: 502,
      rawBody: 'upstream html error',
    });

    expect(seenBodies.map((body) => body.model)).toEqual(['model-primary']);
  });

  it('prioriza un modelo fallback explicito sin seguir vendiendolo como unlimited', () => {
    const content = fs.readFileSync(AI_PROXY_SOURCE_PATH, 'utf8');

    expect(content).toContain('const DEFAULT_FALLBACK_MODEL =');
    expect(content).toContain('process.env.GROQ_MODEL_FALLBACK');
    expect(content).toContain('process.env.GROQ_MODEL_UNLIMITED');
    expect(content).toContain("new Error('Respuesta no interpretable del proveedor')");
    expect(content).not.toContain('const DEFAULT_UNLIMITED_MODEL =');
    expect(content).not.toContain("new Error('Invalid response')");
  });
});
