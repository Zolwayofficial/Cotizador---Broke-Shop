describe('agentes-navegacion/index', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('no inicializa dos veces en paralelo', async () => {
    const initMemoria = jest.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 10)));
    const initAgent = jest.fn().mockResolvedValue();

    jest.doMock('../../server/agentes-navegacion/MemoriaAgente', () => ({
      MemoriaAgente: class MemoriaAgente {},
      init: initMemoria,
    }));

    const createAgentClass = () => jest.fn().mockImplementation(() => ({
      init: initAgent,
      obtenerEstadisticas: jest.fn().mockReturnValue({ ok: true }),
    }));

    jest.doMock('../../server/agentes-navegacion/AgenteNavegadorSUNAT', () => createAgentClass());
    jest.doMock('../../server/agentes-navegacion/AgenteNavegadorADUANET', () => createAgentClass());
    jest.doMock('../../server/agentes-navegacion/AgenteNavegadorVUCE', () => createAgentClass());
    jest.doMock('../../server/agentes-navegacion/AgenteNavegadorINDECOPI', () => createAgentClass());
    jest.doMock('../../server/agentes-navegacion/AgenteNavegadorMTC', () => createAgentClass());
    jest.doMock('../../server/agentes-navegacion/AgenteNavegadorDIGESA', () => createAgentClass());
    jest.doMock('../../server/agentes-navegacion/AgenteNavegadorSENASA', () => createAgentClass());
    jest.doMock('../../server/agentes-navegacion/AgenteNavegadorMINAM', () => createAgentClass());
    jest.doMock('../../server/agentes-navegacion/AgenteNavegadorPRODUCE', () => createAgentClass());

    const agentesNavegacion = require('../../server/agentes-navegacion');

    await Promise.all([agentesNavegacion.init(), agentesNavegacion.init()]);

    expect(initMemoria).toHaveBeenCalledTimes(1);
    expect(initAgent).toHaveBeenCalledTimes(9);
  });

  test('protege estadisticas generales si un agente falla', () => {
    const agentesNavegacion = require('../../server/agentes-navegacion');

    agentesNavegacion._private.resetInitStateForTests();
    const original = agentesNavegacion.SUNAT.obtenerEstadisticas;
    agentesNavegacion.SUNAT.obtenerEstadisticas = jest.fn(() => {
      throw new Error('sunat roto');
    });

    const result = agentesNavegacion.obtenerEstadisticasGenerales();

    expect(result.memoria).toBe('Pendiente de preparacion');
    expect(result.sunat).toEqual({
      agente: 'SUNAT',
      error: 'sunat roto',
    });

    agentesNavegacion.SUNAT.obtenerEstadisticas = original;
  });

test('no sobreafirma el cierre de inicializacion en el codigo fuente actual', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.join(__dirname, '..', '..', 'server', 'agentes-navegacion', 'index.js'),
      'utf8',
    );

    expect(content).toContain('[AGENTES NAVEGACION] Inicializacion completada');
    expect(content).toContain("[MEMORIA] Tablas preparadas");
    expect(content).toContain('   - SUNAT: inicializado');
    expect(content).toContain('   - PRODUCE: inicializado');
    expect(content).toContain("memoria: initialized ? 'Preparada' : 'Pendiente de preparacion'");
    expect(content).not.toContain("[AGENTES NAVEGACION] Listo");
    expect(content).not.toContain("[MEMORIA] Tablas creadas");
    expect(content).not.toContain("memoria: initialized ? 'Inicializada' : 'Pendiente de inicializacion'");
    expect(content).not.toContain('   - SUNAT: ok');
    expect(content).not.toContain('   - ADUANET: ok');
    expect(content).not.toContain('   - VUCE: ok');
    expect(content).not.toContain('   - INDECOPI: ok');
    expect(content).not.toContain('   - MTC: ok');
    expect(content).not.toContain('   - DIGESA: ok');
    expect(content).not.toContain('   - SENASA: ok');
    expect(content).not.toContain('   - MINAM: ok');
    expect(content).not.toContain('   - PRODUCE: ok');
  });
});
