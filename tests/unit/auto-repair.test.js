const fs = require('fs');
const os = require('os');
const path = require('path');
const AUTO_REPAIR_SOURCE_PATH = path.resolve(__dirname, '../../server/auto-repair.js');

describe('auto-repair', () => {
  let tempDir;
  let previousDbPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cotizador-auto-repair-'));
    previousDbPath = process.env.DB_PATH;
    process.env.DB_PATH = path.join(tempDir, 'cotizador.db');
    jest.resetModules();
  });

  afterEach(() => {
    try {
      const db = require('../../server/db');
      db.shutdown?.();
    } catch (_error) {
      // ignore cleanup errors
    }

    if (previousDbPath === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = previousDbPath;
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
    jest.resetModules();
  });

  test('marca el reintento como exitoso solo cuando el siguiente intento realmente funciona', async () => {
    const db = require('../../server/db');
    await db.init();
    const autoRepair = require('../../server/auto-repair');
    await autoRepair.init();

    let attempts = 0;
    const result = await autoRepair.ejecutarConAutoReparacion('sunat', async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('fallo inicial');
      }
      return { ok: true };
    });

    expect(result).toEqual({ ok: true });

    const solutions = autoRepair.dbAll('SELECT solucion, funciono FROM agent_solutions ORDER BY id ASC');
    expect(solutions).toHaveLength(1);
    expect(solutions[0]).toMatchObject({ solucion: 'reintento_1', funciono: 1 });
  });

  test('no infla soluciones aplicadas cuando todos los intentos fallan', async () => {
    const db = require('../../server/db');
    await db.init();
    const autoRepair = require('../../server/auto-repair');
    await autoRepair.init();

    await expect(
      autoRepair.ejecutarConAutoReparacion('aduanet', async () => {
        throw new Error('siempre falla');
      })
    ).rejects.toThrow('siempre falla');

    const stats = autoRepair.getEstadisticas();
    expect(stats.soluciones_aplicadas).toBe(0);
    expect(stats.soluciones_exitosas).toBeUndefined();

    const solutions = autoRepair.dbAll('SELECT solucion, funciono FROM agent_solutions ORDER BY id ASC');
    expect(solutions.every((row) => row.funciono === 0)).toBe(true);
  });

  test('normaliza dias fuera de rango en limpieza', async () => {
    const db = require('../../server/db');
    await db.init();
    const autoRepair = require('../../server/auto-repair');
    await autoRepair.init();

    expect(autoRepair._private.normalizeDays(-5, 30)).toBe(30);
    expect(autoRepair._private.normalizeDays('15', 30)).toBe(15);
  });

  test('falla limpio si se intenta inicializar antes que la base de datos', async () => {
    const autoRepair = require('../../server/auto-repair');

    await expect(autoRepair.init()).rejects.toThrow(/base de datos no inicializada/i);

    const db = require('../../server/db');
    await db.init();
    await expect(autoRepair.init()).resolves.toBeUndefined();
  });

  test('registra fallos aunque el contexto tenga referencias circulares', async () => {
    const db = require('../../server/db');
    await db.init();
    const autoRepair = require('../../server/auto-repair');
    await autoRepair.init();

    const contexto = { modulo: 'sunat' };
    contexto.self = contexto;

    const failureId = autoRepair.registrarFallo(' sunat ', { type: ' timeout ', message: '' }, contexto);
    const row = autoRepair.dbGet('SELECT agente, error_type, contexto FROM agent_failures WHERE id = ?', [failureId]);

    expect(failureId).toBeGreaterThan(0);
    expect(row.agente).toBe('sunat');
    expect(row.error_type).toBe('timeout');
    expect(row.contexto).toMatch(/\[Circular\]/);
  });

  test('guarda y recupera conocimiento normalizando claves y serializando valores complejos', async () => {
    const db = require('../../server/db');
    await db.init();
    const autoRepair = require('../../server/auto-repair');
    await autoRepair.init();

    const valor = { intentos: 2, serial: 15n };
    valor.self = valor;

    autoRepair.guardarConocimiento(' sunat ', ' ultimo_exito ', valor, '1.2');
    const conocimiento = autoRepair.obtenerConocimiento('sunat', 'ultimo_exito');
    const row = autoRepair.dbGet('SELECT confianza FROM agent_knowledge WHERE clave = ?', ['sunat::ultimo_exito']);

    expect(conocimiento).not.toBeNull();
    expect(conocimiento.valor).toEqual({
      intentos: 2,
      serial: '15',
      self: '[Circular]',
    });
    expect(row.confianza).toBe(1);
  });

  test('expone metadata real de escritura en dbRun', async () => {
    const db = require('../../server/db');
    await db.init();
    const autoRepair = require('../../server/auto-repair');
    await autoRepair.init();

    const insertResult = autoRepair.dbRun(
      'INSERT INTO agent_patterns (agente, patron, solucion_recomendada, frecuencia, exit_rate) VALUES (?, ?, ?, ?, ?)',
      ['sunat', 'timeout_demo', 'reintento', 1, 100],
    );

    const updateResult = autoRepair.dbRun(
      'UPDATE agent_patterns SET frecuencia = ? WHERE id = ?',
      [2, insertResult.lastInsertRowid],
    );

    expect(insertResult.changes).toBe(1);
    expect(insertResult.lastInsertRowid).toBeGreaterThan(0);
    expect(updateResult.changes).toBe(1);
    expect(updateResult.lastInsertRowid).toBe(0);
  });

  test('distingue falta de muestra de una tasa de exito cero real', async () => {
    const db = require('../../server/db');
    await db.init();
    const autoRepair = require('../../server/auto-repair');
    await autoRepair.init();

    const stats = autoRepair.getEstadisticas();

    expect(stats.soluciones_totales).toBe(0);
    expect(stats.soluciones_aplicadas).toBe(0);
    expect(stats.soluciones_exitosas).toBeUndefined();
    expect(stats.tasa_exito).toBeNull();
  });

  test('no sobreafirma la preparacion del runtime en el source vivo', () => {
    const content = fs.readFileSync(AUTO_REPAIR_SOURCE_PATH, 'utf8');

    expect(content).toContain("[AUTO-REPAIR] Base de datos preparada");
    expect(content).toContain('aprenderPatronAplicado(failureId, solucion);');
    expect(content).toContain('soluciones_aplicadas: solucionesAplicadas');
    expect(content).toContain('tasa_exito: tasaExito');
    expect(content).not.toContain("[AUTO-REPAIR] Base de datos inicializada");
    expect(content).not.toContain('aprenderPatronExitoso(failureId, solucion);');
    expect(content).not.toContain('soluciones_exitosas: solucionesExitosas');
    expect(content).not.toContain('const solucionesExitosas =');
    expect(content).not.toContain('return { changes: 0, lastInsertRowid: lastInsert?.id || 0 };');
    expect(content).not.toContain('tasa_exito: `${tasaExito}%`');
  });
});
