const AgenteNavegadorINDECOPI = require('../../server/agentes-navegacion/AgenteNavegadorINDECOPI');
const AgenteNavegadorMTC = require('../../server/agentes-navegacion/AgenteNavegadorMTC');

describe('agentes regulatorios', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('INDECOPI no mezcla antidumping entre paises con distinto aprendizaje', async () => {
    const agent = new AgenteNavegadorINDECOPI();
    agent.memoria = {
      obtenerAprendizaje: jest.fn((key) => {
        if (key === 'antidumping_ACERO_CN') {
          return { valor: { producto: 'Acero', pais: 'CN', tieneAntidumping: true } };
        }
        return null;
      }),
      guardarAprendizaje: jest.fn(),
      enviarAlerta: jest.fn(),
    };
    const consultaSpy = jest.spyOn(agent, '_consultarAntidumpingLocal');

    const cn = await agent.consultarAntidumping('acero', 'cn');
    const us = await agent.consultarAntidumping('acero', 'us');

    expect(cn.pais).toBe('CN');
    expect(us.pais).toBe('us');
    expect(consultaSpy).toHaveBeenCalledWith('acero', 'us');
  });

  test('INDECOPI solo marca medidas futuras dentro del umbral', async () => {
    const agent = new AgenteNavegadorINDECOPI();
    const enviarAlerta = jest.fn();
    agent.memoria = { enviarAlerta, obtenerEstadisticas: jest.fn(() => ({})) };
    agent.listarMedidasAplicables = jest.fn().mockResolvedValue({
      medidas: [
        { producto: 'Acero', vigenciaHasta: new Date(Date.now() + 10 * 86400000).toISOString() },
        { producto: 'Textil', vigenciaHasta: new Date(Date.now() - 2 * 86400000).toISOString() },
        { producto: 'Vidrio', vigenciaHasta: new Date(Date.now() + 60 * 86400000).toISOString() },
      ],
    });

    const result = await agent.detectarMedidasPorVencer(30);

    expect(result).toHaveLength(1);
    expect(result[0].producto).toBe('Acero');
    expect(enviarAlerta).toHaveBeenCalledTimes(1);
    expect(enviarAlerta.mock.calls[0][1]).toMatch(/vence en/);
  });

  test('INDECOPI no degrada a 0 dias una medida que vence hoy mas tarde', async () => {
    const agent = new AgenteNavegadorINDECOPI();
    const enviarAlerta = jest.fn();
    const guardarAprendizaje = jest.fn();
    agent.memoria = { enviarAlerta, guardarAprendizaje, obtenerEstadisticas: jest.fn(() => ({})) };
    agent.listarMedidasAplicables = jest.fn().mockResolvedValue({
      medidas: [
        { producto: 'Acero', vigenciaHasta: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString() },
      ],
    });

    const result = await agent.detectarMedidasPorVencer(1);
    agent._verificarVencimiento({ producto: 'Acero', vigenciaHasta: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString() });

    expect(result).toHaveLength(1);
    expect(result[0].diasParaVencer).toBe(1);
    expect(enviarAlerta).toHaveBeenCalledWith(
      'antidumping_por_vencer',
      expect.stringContaining('vence en 1 dia'),
      expect.objectContaining({ diasParaVencer: 1 }),
    );
    expect(guardarAprendizaje).toHaveBeenCalledWith(
      'alerta_vencimiento_ACERO',
      expect.objectContaining({ dias: 1 }),
      1.0,
    );
  });

  test('INDECOPI normaliza tildes y no rompe con umbral negativo', async () => {
    const agent = new AgenteNavegadorINDECOPI();
    agent.memoria = {
      obtenerAprendizaje: jest.fn((key) => {
        if (key === 'antidumping_ACERO ESPANOL_ES') {
          return { valor: { producto: 'Acero espanol', pais: 'ES', tieneAntidumping: true } };
        }
        return null;
      }),
      guardarAprendizaje: jest.fn(),
      enviarAlerta: jest.fn(),
      obtenerEstadisticas: jest.fn(() => ({})),
    };
    agent.listarMedidasAplicables = jest.fn().mockResolvedValue({
      medidas: [{ producto: 'Acero', vigenciaHasta: new Date(Date.now() + 2 * 86400000).toISOString() }],
    });

    const aprendizaje = await agent.consultarAntidumping('acero español', 'es');
    const porVencer = await agent.detectarMedidasPorVencer(-5);

    expect(aprendizaje.tieneAntidumping).toBe(true);
    expect(porVencer).toEqual([]);
  });

  test('INDECOPI no expone referencias mutables desde cache o aprendizaje', async () => {
    const agent = new AgenteNavegadorINDECOPI();
    agent.memoria = {
      obtenerAprendizaje: jest.fn(() => null),
      guardarAprendizaje: jest.fn(),
      enviarAlerta: jest.fn(),
      obtenerEstadisticas: jest.fn(() => ({})),
    };
    jest.spyOn(agent, '_consultarAntidumpingLocal').mockResolvedValue({
      producto: 'Acero',
      pais: 'PE',
      tieneAntidumping: true,
      tasa: 12.5,
      resolucion: '123-2026',
      vigenciaHasta: '2026-12-31T00:00:00.000Z',
      fuente: 'INDECOPI',
      actualizado: '2026-03-27T00:00:00.000Z',
    });

    const first = await agent.consultarAntidumping('acero', 'pe');
    first.tasa = 999;
    first.fuente = 'mutado';

    const second = await agent.consultarAntidumping('acero', 'pe');

    expect(second.tasa).toBe(12.5);
    expect(second.fuente).toBe('INDECOPI');
  });

  test('MTC no mezcla homologaciones de modelos distintos y tolera categoria vacia', async () => {
    const agent = new AgenteNavegadorMTC();
    agent.memoria = {
      obtenerAprendizaje: jest.fn((key) => {
        if (key === 'homologacion_ROUTER_ACME_X1') {
          return { valor: { producto: 'router', marca: 'Acme', modelo: 'X1' } };
        }
        return null;
      }),
      guardarAprendizaje: jest.fn(),
      obtenerEstadisticas: jest.fn(() => ({})),
    };
    const consultaSpy = jest.spyOn(agent, '_consultarHomologacionLocal');

    const x1 = await agent.consultarHomologacion('router', 'Acme', 'X1');
    const x2 = await agent.consultarHomologacion('router', 'Acme', 'X2');
    const requiere = await agent.detectarSiRequiereHomologacion('router wifi', null);

    expect(x1.modelo).toBe('X1');
    expect(x2.modelo).toBe('X2');
    expect(consultaSpy).toHaveBeenCalledWith('router', 'Acme', 'X2');
    expect(requiere.requiereHomologacion).toBe(true);
  });

  test('MTC detecta homologacion con acentos y claves normalizadas', async () => {
    const agent = new AgenteNavegadorMTC();
    agent.memoria = {
      obtenerAprendizaje: jest.fn((key) => {
        if (key === 'homologacion_TELEFONO SATELITAL_MARCA X_MODELO Z') {
          return { valor: { producto: 'telefono satelital', marca: 'Marca X', modelo: 'Modelo Z' } };
        }
        return null;
      }),
      guardarAprendizaje: jest.fn(),
      obtenerEstadisticas: jest.fn(() => ({})),
    };

    const cached = await agent.consultarHomologacion('teléfono satelital', 'Marca X', 'Modelo Z');
    const requiere = await agent.detectarSiRequiereHomologacion('teléfono bluetooth', 'equipos de telecomunicaciones');

    expect(cached.producto).toBe('telefono satelital');
    expect(requiere.requiereHomologacion).toBe(true);
  });

  test('MTC no expone referencias mutables desde cache o aprendizaje', async () => {
    const agent = new AgenteNavegadorMTC();
    agent.memoria = {
      obtenerAprendizaje: jest.fn(() => null),
      guardarAprendizaje: jest.fn(),
      obtenerEstadisticas: jest.fn(() => ({})),
    };
    jest.spyOn(agent, '_consultarHomologacionLocal').mockResolvedValue({
      producto: 'router',
      marca: 'Acme',
      modelo: 'X2',
      requiereHomologacion: true,
      estado: 'pendiente_verificacion',
      fuente: 'MTC',
      actualizado: '2026-03-27T00:00:00.000Z',
    });

    const first = await agent.consultarHomologacion('router', 'Acme', 'X2');
    first.estado = 'mutado';

    const second = await agent.consultarHomologacion('router', 'Acme', 'X2');

    expect(second.estado).toBe('pendiente_verificacion');
  });

  test('INDECOPI source no usa redondeo que produzca alertas de 0 dias', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.join(__dirname, '..', '..', 'server', 'agentes-navegacion', 'AgenteNavegadorINDECOPI.js'),
      'utf8',
    );

    expect(content).toContain('function formatDaysUntilExpiry(vigenciaHasta, nowMs = Date.now())');
    expect(content).toContain("return `${days} ${days === 1 ? 'dia' : 'dias'}`;");
    expect(content).toContain('function cloneSerializable(value)');
    expect(content).toContain('return cloneSerializable(cached.valor);');
    expect(content).not.toContain("Math.round((vencimiento - ahora) / 86400000)");
    expect(content).not.toContain('vence en ${diasParaVencer} dias');
    expect(content).not.toContain('return cached.valor;');
  });

  test('MTC source protege cache y aprendizaje con copias serializables', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.join(__dirname, '..', '..', 'server', 'agentes-navegacion', 'AgenteNavegadorMTC.js'),
      'utf8',
    );

    expect(content).toContain('function cloneSerializable(value)');
    expect(content).toContain('return cloneSerializable(cached.valor);');
    expect(content).not.toContain('return cached.valor;');
  });
});
