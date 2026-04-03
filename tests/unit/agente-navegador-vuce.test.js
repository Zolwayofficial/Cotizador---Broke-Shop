const AgenteNavegadorVUCE = require('../../server/agentes-navegacion/AgenteNavegadorVUCE');

describe('AgenteNavegadorVUCE', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('normaliza partida y pais al consultar restricciones', async () => {
    const agent = new AgenteNavegadorVUCE();
    agent.memoria = {
      obtenerAprendizaje: jest.fn(() => null),
      guardarAprendizaje: jest.fn(),
    };
    const consultaSpy = jest.spyOn(agent, '_consultarRestriccionesLocales');

    const result = await agent.consultarRestricciones('85.17-13 00/00', 'us');

    expect(consultaSpy).toHaveBeenCalledWith('8517130000', 'US');
    expect(result.partida).toBe('8517130000');
    expect(result.pais).toBe('US');
  });

  test('normaliza alias de pais y no fabrica una partida vacia', async () => {
    const agent = new AgenteNavegadorVUCE();
    agent.memoria = {
      obtenerAprendizaje: jest.fn(() => null),
      guardarAprendizaje: jest.fn(),
    };
    const consultaSpy = jest.spyOn(agent, '_consultarRestriccionesLocales');

    await agent.consultarRestricciones('', 'EE. UU.');

    expect(consultaSpy).toHaveBeenCalledWith('', 'US');
  });

  test('no mezcla aprendizaje entre paises distintos', async () => {
    const agent = new AgenteNavegadorVUCE();
    agent.memoria = {
      obtenerAprendizaje: jest.fn((key) => {
        if (key === 'restricciones_8517130000_CN') {
          return { valor: { partida: '8517130000', pais: 'CN', restricciones: ['permiso-cn'] } };
        }
        return null;
      }),
      guardarAprendizaje: jest.fn(),
    };
    const consultaSpy = jest.spyOn(agent, '_consultarRestriccionesLocales');

    const cn = await agent.consultarRestricciones('8517130000', 'CN');
    const us = await agent.consultarRestricciones('8517130000', 'US');

    expect(cn.pais).toBe('CN');
    expect(us.pais).toBe('US');
    expect(consultaSpy).toHaveBeenCalledWith('8517130000', 'US');
  });

  test('no expone referencias mutables desde cache o aprendizaje', async () => {
    const agent = new AgenteNavegadorVUCE();
    agent.memoria = {
      obtenerAprendizaje: jest.fn(() => null),
      guardarAprendizaje: jest.fn(),
    };
    jest.spyOn(agent, '_consultarRestriccionesLocales').mockResolvedValue({
      partida: '8517130000',
      pais: 'US',
      restricciones: [],
      permisos_requeridos: [],
      actualizado: '2026-03-27T00:00:00.000Z',
    });

    const first = await agent.consultarRestricciones('8517130000', 'US');
    first.restricciones.push('permiso-editado');
    first.permisos_requeridos.push('certificado-editado');

    const second = await agent.consultarRestricciones('8517130000', 'US');

    expect(second.restricciones).toEqual([]);
    expect(second.permisos_requeridos).toEqual([]);
  });

  test('tolerar llamadas sin init en detectar cambios y estadisticas', async () => {
    const agent = new AgenteNavegadorVUCE();

    await expect(agent.detectarNuevosPermisos()).resolves.toEqual([]);
    expect(agent.obtenerEstadisticas()).toEqual({});
  });

  test('source vivo protege el cache con copias serializables', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.join(__dirname, '..', '..', 'server', 'agentes-navegacion', 'AgenteNavegadorVUCE.js'),
      'utf8',
    );

    expect(content).toContain('function cloneSerializable(value)');
    expect(content).toContain('return cloneSerializable(cached.valor);');
    expect(content).not.toContain('return cached.valor;');
  });
});
