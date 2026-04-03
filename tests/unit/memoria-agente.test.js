describe('MemoriaAgente', () => {
  function setupModule() {
    jest.resetModules();

    const dbMock = {
      exec: jest.fn(),
      all: jest.fn().mockReturnValue([]),
      get: jest.fn((sql) => {
        if (sql.includes('last_insert_rowid')) return { id: 1 };
        if (sql.includes('SELECT changes()')) return { count: 1 };
        return null;
      }),
      run: jest.fn(() => ({ changes: 1, lastInsertRowid: 1 })),
    };

    jest.doMock('../../server/db', () => dbMock);
    const moduleUnderTest = require('../../server/agentes-navegacion/MemoriaAgente');
    return { dbMock, moduleUnderTest };
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('no re-stringifica estrategias ya serializadas', async () => {
    const { dbMock, moduleUnderTest } = setupModule();
    await moduleUnderTest.init();
    const memoria = new moduleUnderTest.MemoriaAgente('SUNAT');

    memoria.guardarExperiencia('https://ejemplo.pe', true, 120, '{"foo":1}');

    expect(dbMock.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO agente_experiencias'),
      expect.arrayContaining(['{"foo":1}']),
    );
  });

  test('tolera estrategia no interpretable al recuperarla', async () => {
    const { dbMock, moduleUnderTest } = setupModule();
    await moduleUnderTest.init();
    dbMock.get.mockImplementation((sql) => {
      if (sql.includes('SELECT * FROM agente_config')) return null;
      if (sql.includes('SELECT estrategia_usada')) {
        return { estrategia_usada: 'no-json', tiempo_respuesta_ms: 10 };
      }
      return null;
    });

    const memoria = new moduleUnderTest.MemoriaAgente('SUNAT');

    expect(memoria.obtenerEstrategiaExitosa('https://ejemplo.pe')).toBeNull();
  });

  test('parsea datos de alertas y permite configurar retries en 0', async () => {
    const { dbMock, moduleUnderTest } = setupModule();
    await moduleUnderTest.init();
    dbMock.get.mockImplementation((sql, params) => {
      if (sql.includes('SELECT * FROM agente_config')) {
        if (params?.[0] === 'SUNAT') {
          return {
            timeout_ms: 30000,
            reintentos: 0,
            cache_ttl_ms: 3600000,
            user_agent: 'UA',
            headers: '{"x-test":"1"}',
          };
        }
        return null;
      }
      if (sql.includes('last_insert_rowid')) return { id: 1 };
      if (sql.includes('SELECT changes()')) return { count: 1 };
      return null;
    });
    dbMock.all.mockImplementation((sql) => {
      if (sql.includes('FROM agente_alertas')) {
        return [{ id: 1, tipo: 'sitio_caido', datos: '{"url":"https://ejemplo.pe"}' }];
      }
      return [];
    });

    const memoria = new moduleUnderTest.MemoriaAgente('SUNAT');
    memoria.actualizarConfig({ reintentos: 0, timeout_ms: 0 });
    const alertas = memoria.recibirAlertas();

    expect(dbMock.run).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE agente_config'),
      expect.arrayContaining([0, 0]),
    );
    expect(alertas[0].datos).toEqual({ url: 'https://ejemplo.pe' });
  });

  test('expone helpers json seguros', () => {
    const { moduleUnderTest } = setupModule();

    expect(moduleUnderTest._private.safeJsonParse('no-json', { ok: false })).toEqual({ ok: false });
    expect(moduleUnderTest._private.safeJsonStringify(undefined, 'null')).toBe('null');
  });

  test('distingue sin muestra de una tasa de exito cero real', async () => {
    const { dbMock, moduleUnderTest } = setupModule();
    await moduleUnderTest.init();
    dbMock.get.mockImplementation((sql) => {
      if (sql.includes('SELECT * FROM agente_config')) return null;
      if (sql.includes('COUNT(*) as count')) return { count: 0 };
      if (sql.includes('AVG(tiempo_respuesta_ms) as avg')) return { avg: null };
      return null;
    });

    const memoria = new moduleUnderTest.MemoriaAgente('SUNAT');
    const estadisticas = memoria.obtenerEstadisticas();

    expect(estadisticas.total_navegaciones).toBe(0);
    expect(estadisticas.exitosas).toBe(0);
    expect(estadisticas.fallidas).toBe(0);
    expect(estadisticas.tasa_exito).toBeNull();
    expect(estadisticas.tiempo_promedio_ms).toBeNull();
  });

  test('mantiene wording honesto de inicializacion en el source vivo', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.join(__dirname, '..', '..', 'server', 'agentes-navegacion', 'MemoriaAgente.js'),
      'utf8',
    );

    expect(content).toContain('[MEMORIA AGENTE] Tablas y configuracion preparadas');
    expect(content).toContain('[MEMORIA AGENTE] Info: experiencia no guardada (tablas aun no preparadas)');
    expect(content).toContain('[MEMORIA AGENTE] Info: aprendizaje no guardado (tablas aun no preparadas)');
    expect(content).toContain('[MEMORIA AGENTE] Info: patron no guardado (tablas aun no preparadas)');
    expect(content).toContain("tasa_exito: total > 0 ? ((exitosas / total) * 100).toFixed(2) : null");
    expect(content).not.toContain('[MEMORIA AGENTE] Inicializada');
    expect(content).not.toContain('tablas no listas');
    expect(content).not.toContain("tasa_exito: total > 0 ? ((exitosas / total) * 100).toFixed(2) : 0");
  });
});
