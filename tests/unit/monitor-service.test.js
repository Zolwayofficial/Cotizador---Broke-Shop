const fs = require('fs');
const os = require('os');
const path = require('path');

const MONITOR_SOURCE_PATH = path.resolve(
  __dirname,
  '../../server/monitor/monitor-service.js'
);
const WEBSOCKET_SOURCE_PATH = path.resolve(
  __dirname,
  '../../server/websocket/websocket-server.js'
);

describe('monitor service', () => {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const originalEnv = {
    DATA_DIR: process.env.DATA_DIR,
  };
  const originalCwd = process.cwd();
  const cleanupPaths = [];

  afterEach(() => {
    process.chdir(originalCwd);

    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });

    cleanupPaths.splice(0).forEach((target) => {
      fs.rmSync(target, { recursive: true, force: true });
    });

    jest.resetModules();
  });

  test('resuelve DATA_DIR relativo desde la raiz del proyecto', () => {
    const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cotizador-monitor-cwd-'));
    const relativeDataDir = path.join('tmp', `monitor-data-${Date.now()}`);
    const expectedMonitorFile = path.resolve(projectRoot, relativeDataDir, 'monitor.json');
    const wrongMonitorFile = path.resolve(tempCwd, relativeDataDir, 'monitor.json');

    cleanupPaths.push(tempCwd);
    cleanupPaths.push(path.resolve(projectRoot, relativeDataDir));

    process.env.DATA_DIR = relativeDataDir;
    process.chdir(tempCwd);

    const monitorService = require('../../server/monitor/monitor-service');
    monitorService._guardarMetricas();

    expect(fs.existsSync(expectedMonitorFile)).toBe(true);
    expect(fs.existsSync(wrongMonitorFile)).toBe(false);
  });

  test('genera un requestsPerSecond finito aunque el uptime sea casi cero', () => {
    const monitorService = require('../../server/monitor/monitor-service');
    monitorService.metrics.requests = 5;
    monitorService.metrics.startTime = Date.now();

    const salud = monitorService.obtenerSalud();

    expect(Number.isFinite(Number.parseFloat(salud.performance.requestsPerSecond))).toBe(true);
  });

  test('no vende latencia ni tasa de error como cero real cuando aun no hubo requests', () => {
    const monitorService = require('../../server/monitor/monitor-service');
    monitorService.metrics.requests = 0;
    monitorService.metrics.errors = 0;
    monitorService.metrics.avgResponseTime = 0;

    const salud = monitorService.obtenerSalud();
    const metricas = monitorService.obtenerMetricas();

    expect(salud.requests.errorRate).toBeNull();
    expect(salud.performance.avgResponseTime).toBeNull();
    expect(salud.performance.requestsPerSecond).toBeNull();
    expect(metricas.avgResponseTime).toBeNull();
  });

  test('marca sin_muestra cuando aun no existe trafico utilizable', () => {
    const monitorService = require('../../server/monitor/monitor-service');
    monitorService.metrics.requests = 0;
    monitorService.metrics.errors = 0;
    monitorService.metrics.avgResponseTime = 0;

    const salud = monitorService.obtenerSalud();

    expect(salud.status).toBe('sin_muestra');
  });

  test('continua ids de alertas desde el maximo persistido', () => {
    const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cotizador-monitor-alerts-'));
    const relativeDataDir = path.join('tmp', `monitor-alerts-${Date.now()}`);
    const monitorFile = path.resolve(projectRoot, relativeDataDir, 'monitor.json');

    cleanupPaths.push(tempCwd);
    cleanupPaths.push(path.resolve(projectRoot, relativeDataDir));

    process.env.DATA_DIR = relativeDataDir;
    process.chdir(tempCwd);

    fs.mkdirSync(path.dirname(monitorFile), { recursive: true });
    fs.writeFileSync(
      monitorFile,
      JSON.stringify({
        metrics: { requests: 1, errors: 0, avgResponseTime: 10 },
        alerts: [
          { id: 7, tipo: 'error', mensaje: 'A', timestamp: new Date().toISOString(), leida: false },
          { id: 12, tipo: 'performance', mensaje: 'B', timestamp: new Date().toISOString(), leida: false },
        ],
        timestamp: Date.now(),
      })
    );

    const monitorService = require('../../server/monitor/monitor-service');
    const alerta = monitorService.agregarAlerta('memoria', 'Nueva alerta');

    expect(alerta.id).toBe(13);
  });

test('no deja wording absoluto ni mojibake residual en monitor y websocket', () => {
    const monitorSource = fs.readFileSync(MONITOR_SOURCE_PATH, 'utf8');
    const websocketSource = fs.readFileSync(WEBSOCKET_SOURCE_PATH, 'utf8');

    expect(monitorSource).not.toMatch(/100%\s+gratis/i);
    expect(websocketSource).not.toMatch(/100%\s+gratis/i);
    expect(monitorSource).toMatch(/^[\x00-\x7F]*$/);
    expect(monitorSource).not.toMatch(/\u00C3|\u00E2\u20AC\u00A2|\uFFFD/);
    expect(websocketSource).not.toMatch(/\u00C3|\u00E2\u20AC\u00A2|\uFFFD/);
    expect(monitorSource).toContain('Metricas de rendimiento');
    expect(monitorSource).toContain("console.log('[MONITOR] Monitoreo automatico iniciado');");
    expect(monitorSource).toContain("console.log('[MONITOR] Metricas cargadas desde disco');");
    expect(monitorSource).toContain("console.error('[MONITOR] Error guardando metricas:', e.message);");
    expect(monitorSource).toContain("console.error('[MONITOR] Error cargando metricas:', e.message);");
    expect(monitorSource).not.toContain('Métricas');
    expect(monitorSource).not.toContain('Monitoreo automático iniciado');
    expect(monitorSource).not.toContain('Error guardando métricas:');
    expect(monitorSource).not.toContain('Métricas cargadas desde disco');
  });

  test('monitor source distingue ausencia de trafico de cero medido', () => {
    const monitorSource = fs.readFileSync(MONITOR_SOURCE_PATH, 'utf8');

    expect(monitorSource).toContain('function hasTrafficSample(totalRequests)');
    expect(monitorSource).toContain('function determineMonitorStatus({ requests, errors, avgResponseTime, memoryMB })');
    expect(monitorSource).toContain('errorRate: trafficSample ?');
    expect(monitorSource).toContain('avgResponseTime: trafficSample ?');
    expect(monitorSource).toContain('requestsPerSecond: trafficSample ?');
    expect(monitorSource).toContain("return 'sin_muestra';");
    expect(monitorSource).not.toContain("errorRate: this.metrics.requests > 0 ?");
    expect(monitorSource).not.toContain("avgResponseTime: `${this.metrics.avgResponseTime.toFixed(2)}ms`");
    expect(monitorSource).not.toContain("return 'saludable';\n  }\n\n  _formatearUptime");
  });
});
