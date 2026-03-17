const { EventEmitter } = require('events');

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
          if (current.body !== null) {
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
});
