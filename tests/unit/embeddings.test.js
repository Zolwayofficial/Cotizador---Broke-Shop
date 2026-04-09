const fs = require('fs');
const path = require('path');

const SOURCE_PATH = path.resolve(__dirname, '../../server/embeddings.js');

describe('embeddings', () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    jest.unmock('@xenova/transformers');
  });

  test('fallback genera el mismo embedding para el mismo texto', () => {
    const embeddings = require('../../server/embeddings');

    const first = embeddings.generarEmbeddingFallback('camiseta algodon azul');
    const second = embeddings.generarEmbeddingFallback('camiseta algodon azul');
    const parsed = JSON.parse(first);

    expect(first).toBe(second);
    expect(parsed).toHaveLength(384);
  });

  test('permite reintentar la carga del modelo despues de una falla transitoria', async () => {
    const fakeModel = jest.fn(async () => ({
      data: Float32Array.from([1, 0, 0]),
    }));
    const pipeline = jest.fn()
      .mockRejectedValueOnce(new Error('fallo temporal'))
      .mockResolvedValueOnce(fakeModel);

    jest.doMock('@xenova/transformers', () => ({
      pipeline,
    }));

    const embeddings = require('../../server/embeddings');

    await expect(embeddings.initEmbedder()).resolves.toBeNull();
    await expect(embeddings.initEmbedder()).resolves.toBe(fakeModel);
    expect(pipeline).toHaveBeenCalledTimes(2);
  });

test('el codigo fuente queda ASCII y sin aleatoriedad en fallback', () => {
    const source = fs.readFileSync(SOURCE_PATH, 'utf8');

    expect(source).toMatch(/^[\x00-\x7F]*$/);
    expect(source).toContain("console.log('[EMBEDDINGS] Modelo cargado');");
    expect(source).toContain("console.log('[EMBEDDINGS] Precalentamiento completado');");
    expect(source).not.toContain('Math.random()');
    expect(source).not.toContain('✅');
    expect(source).not.toContain('exitosamente');
    expect(source).not.toContain('40%');
    expect(source).not.toContain('Enterprise-Grade');
  });
});
