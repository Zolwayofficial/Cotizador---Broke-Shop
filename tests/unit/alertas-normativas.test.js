const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');

describe('alertas-normativas', () => {
  let tempDir;
  let previousDbPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cotizador-alertas-'));
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

  it('soporta alertas, suscripciones y limpieza paginada', async () => {
    const db = require('../../server/db');
    await db.init();
    const alertas = require('../../server/alertas-normativas');
    await alertas.init();

    const alertaId = alertas.crearAlerta(
      'restriccion',
      'SUNAT',
      'Nueva restriccion para vinos',
      'Revisar permisos especiales',
      { nivel: 'critico', pais_afectado: 'ES' }
    );

    expect(alertaId).toBeGreaterThan(0);

    const suscripcionId = alertas.suscribirAlertas('miembro@example.com', ['restriccion'], '12345');
    expect(suscripcionId).toBeGreaterThan(0);

    const listado = alertas.obtenerAlertas(1, 10, { entidad: 'SUNAT' });
    expect(listado.alertas).toHaveLength(1);
    expect(listado.pagination.total).toBe(1);

    const noLeidas = alertas.obtenerAlertasNoLeidas();
    expect(noLeidas).toHaveLength(1);

    alertas.marcarAlertaLeida(alertaId);
    expect(alertas.obtenerAlertasNoLeidas()).toHaveLength(0);

    const totalMarcadas = alertas.marcarTodasLeidas();
    expect(totalMarcadas).toBe(0);

    expect(alertas.obtenerEstadisticas().criticas).toBe(1);
    expect(alertas.limpiarAlertasAntiguas(365)).toBe(0);
    expect(alertas.limpiarAlertasLeidas().eliminadas).toBe(1);
  });

  it('no marca como leida una alerta inexistente y revisa el email de suscripcion', async () => {
    const db = require('../../server/db');
    await db.init();
    const alertas = require('../../server/alertas-normativas');
    await alertas.init();

    expect(alertas.marcarAlertaLeida(99999)).toBe(false);
    expect(() => alertas.suscribirAlertas('   ', ['restriccion'])).toThrow('Email requerido');
    expect(alertas._private.normalizeDays(-5, 90)).toBe(90);
  });

  it('mantiene el source con wording honesto de inicializacion', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'alertas-normativas.js'), 'utf8');

    expect(content).toContain('[ALERTAS] Tablas preparadas');
    expect(content).not.toContain('[ALERTAS] Tablas listas');
  });
});
