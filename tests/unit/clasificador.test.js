jest.mock('../../server/ai-proxy', () => ({
  call: jest.fn().mockRejectedValue(new Error('Connection error')),
}));

const fs = require('fs');
const path = require('path');

const getAiProxy = () => require('../../server/ai-proxy');

describe('Clasificador fallback', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.GROQ_API_KEY;
    delete process.env.ALLOW_LIVE_GROQ_TESTS;
    getAiProxy().call.mockReset();
    getAiProxy().call.mockRejectedValue(new Error('Connection error'));
  });

  test('deberia usar keywords cuando la IA falla', async () => {
    const clasificador = require('../../server/clasificador');
    const result = await clasificador.clasificarMultiAgente('camiseta de algodon');

    expect(result.consenso).toBeTruthy();
    expect(result.consenso.hs).toBe('6109.10.00.10');
    expect(result.consenso.metodo).toBe('consenso_directo');
  });

  test('deberia extraer texto desde payload tipo imagen para el fallback', async () => {
    const clasificador = require('../../server/clasificador');
    const result = await clasificador.clasificarMultiAgente(
      'camiseta de algodon',
      'data:image/png;base64,xxx',
    );

    expect(result.consenso).toBeTruthy();
    expect(result.consenso.hs).toBe('6109.10.00.10');
  });

test('expone contraste con NANDINA sin venderlo como lectura incompleta', async () => {
    const nandina = require('../../server/nandina');
    await nandina.init();

    const clasificador = require('../../server/clasificador');
    const result = await clasificador.clasificarMultiAgente('camiseta de algodon');

    expect(result.consenso).toBeTruthy();
    expect(result.consenso.contrastadoNandina).toBe(true);
    expect(result.consenso).not.toHaveProperty('validadoNandina');
  });

  test('expone contexto doctrinario cuando detecta escenarios complejos', () => {
    const clasificador = require('../../server/clasificador');
    const context = clasificador.buildClassificationContext('kit desmontado de maquina usada con estuche');

    expect(context.triggers.map((item) => item.rule)).toEqual(
      expect.arrayContaining(['RGI 2a', 'RGI 5']),
    );
    expect(context.scenarioNotes.join(' ')).toMatch(/usada o alterada/i);
    expect(context.promptBlock).toMatch(/RGI 1/i);
  });

  test('baja la confianza del fallback cuando el producto sugiere mezcla o mercancia usada', async () => {
    const clasificador = require('../../server/clasificador');
    const result = await clasificador.clasificarMultiAgente('camiseta usada de algodon y poliester');

    expect(result.consenso).toBeTruthy();
    expect(result.consenso.hs).toBe('6109.10.00.10');
    expect(result.consenso.confianza).toBeLessThanOrEqual(18);
    expect(result.consenso.advertencia).toMatch(/Escenarios detectados/i);
  });

  test('normaliza tildes y puntuacion en el fallback por keywords', async () => {
    const clasificador = require('../../server/clasificador');
    const telefono = await clasificador.clasificarMultiAgente('teléfono móvil liberado');
    const plastico = await clasificador.clasificarMultiAgente('lámina de plástico industrial');

    expect(telefono.consenso).toBeTruthy();
    expect(telefono.consenso.hs).toBe('8517.12.00.00');
    expect(plastico.consenso).toBeTruthy();
    expect(plastico.consenso.hs).toBe('3926.90.90.90');
  });

  test('usa el resultado de un solo agente cuando el otro no logra clasificar', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    process.env.ALLOW_LIVE_GROQ_TESTS = '1';
    getAiProxy().call
      .mockResolvedValueOnce({
        text: JSON.stringify({
          hs: '8517.13.00.00',
          confianza: '82,5',
          advalorem: 0,
          razonamiento: 'Telefono inteligente',
        }),
      })
      .mockRejectedValue(new Error('Connection error'));

    const clasificador = require('../../server/clasificador');
    const result = await clasificador.clasificarMultiAgente('telefono inteligente');

    expect(result.consenso).toBeTruthy();
    expect(result.consenso.metodo).toBe('agente_unico');
    expect(result.consenso.hs).toBe('8517.13.00.00');
    expect(result.consenso.confianza).toBeLessThanOrEqual(75);
  });

  test('no infla un hs marcador 0000 como si fuera clasificacion utilizable', async () => {
    const clasificador = require('../../server/clasificador');
    const result = await clasificador.clasificarMultiAgente('   ');

    expect(result.consenso).toBeTruthy();
    expect(result.consenso.hs).toBe('0000.00.00.00');
    expect(result.consenso.metodo).toBe('sin_clasificacion');
    expect(result.consenso.confianza).toBe(0);
  });

  test('prefiere el agente con hs util si el otro devuelve 0000', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    process.env.ALLOW_LIVE_GROQ_TESTS = '1';
    getAiProxy().call
      .mockResolvedValueOnce({
        text: JSON.stringify({
          hs: '0000.00.00.00',
          confianza: 80,
          advalorem: 0,
          razonamiento: 'Sin clasificacion util',
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          hs: '8517.13.00.00',
          confianza: '82,5%',
          advalorem: 0,
          razonamiento: 'Telefono inteligente',
        }),
      });

    const clasificador = require('../../server/clasificador');
    const result = await clasificador.clasificarMultiAgente('telefono inteligente');

    expect(result.consenso).toBeTruthy();
    expect(result.consenso.metodo).toBe('agente_unico');
    expect(result.consenso.hs).toBe('8517.13.00.00');
    expect(result.consenso.confianza).toBeLessThanOrEqual(75);
  });

  test('normaliza hs numerico sin romper', () => {
    const clasificador = require('../../server/clasificador');
    expect(clasificador._private.normalizeHS(8517130000)).toBe('8517130000');
  });

  test('expone normalizacion de texto para busqueda por keywords', () => {
    const clasificador = require('../../server/clasificador');
    expect(clasificador._private.normalizeKeywordText(' Teléfono / móvil. ')).toBe('telefono movil');
  });

  test('normaliza confianza con formato local y porcentaje', () => {
    const clasificador = require('../../server/clasificador');
    expect(clasificador._private.normalizeConfidence('82,5%')).toBe(82.5);
    expect(clasificador._private.normalizeConfidence('1.200,75', 0)).toBe(1200.75);
  });

test('no revive el contrato anterior de lectura incompleta NANDINA en el codigo fuente del clasificador', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'clasificador.js'), 'utf8');

    expect(content).toContain('contrastadoNandina');
    expect(content).not.toContain('validadoNandina');
  });
});
