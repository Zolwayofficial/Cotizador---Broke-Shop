const fs = require('fs');
const path = require('path');

const {
  parsePort,
  resolveRepoFile,
} = require('../../scripts/runtime-script-helpers.cjs');

describe('runtime-script-helpers', () => {
  it('usa el puerto enviado cuando es entero positivo', () => {
    expect(parsePort('3005', 3000)).toBe(3005);
  });

  it('vuelve al fallback cuando el puerto queda fuera de rango', () => {
    expect(parsePort(undefined, 3000)).toBe(3000);
    expect(parsePort('abc', 3000)).toBe(3000);
    expect(parsePort('0', 3000)).toBe(3000);
    expect(parsePort('-5', 3000)).toBe(3000);
    expect(parsePort('3000.5', 3000)).toBe(3000);
  });

  it('resuelve archivos del repo relativo al directorio base', () => {
    expect(resolveRepoFile('C:\\repo', 'dashboard.html')).toBe(
      path.join('C:\\repo', 'dashboard.html'),
    );
  });
});

describe('root runtime scripts', () => {
  const repoRoot = path.join(__dirname, '..', '..');

  it('start-local usa parsePort para PORT y WS_PORT y los pasa al arranque real', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'start-local.js'), 'utf8');
    expect(content).toContain("parsePort(process.env.PORT, 3000)");
    expect(content).toContain("parsePort(process.env.WS_PORT, 3002)");
    expect(content).toContain("await app.startServer({ port: PORT, wsPort: WS_PORT })");
    expect(content).toContain('API RESPONDIENDO EN LOCAL');
    expect(content).not.toContain('ULTIMATE v3.0');
    expect(content).not.toContain('SERVIDOR LISTO');
  });

  it('server/index permite fijar wsPort antes de iniciar el WebSocket', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'server', 'index.js'), 'utf8');
    expect(content).toContain("const wsPort = options.wsPort ?? resolveRuntimePort(process.env.WS_PORT, 3002, 'WS_PORT');");
    expect(content).toContain('websocketServer.setPort?.(wsPort);');
  });

  it('server-listo resuelve dashboard.html desde el root del repo', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'server-listo.js'), 'utf8');
    expect(content).toContain("resolveRepoFile(__dirname, 'dashboard.html')");
    expect(content).toContain("parsePort(process.env.PORT, 3000)");
    expect(content).toContain('ImportAIAgent Cotizador - servidor de referencia');
    expect(content).toContain("source: 'demo_local'");
    expect(content).toContain('health local sin chequeos de dependencias reales');
    expect(content).toContain("status: 'demo_local'");
    expect(content).toContain('dashboard no conectado a datos reales');
    expect(content).toContain('estadisticas de membresias no conectadas a datos reales');
    expect(content).toContain('monitor local sin instrumentacion real');
    expect(content).toContain('catalogo logistico referencial');
    expect(content).toContain('alertas logisticas no conectadas a datos reales');
    expect(content).toContain('requests: null');
    expect(content).toContain('total: null');
    expect(content).toContain('Servidor demo_local de referencia escuchando');
    expect(content).toContain('API demo: http://localhost:${PORT}/api');
    expect(content).toContain('Dashboard demo: http://localhost:${PORT}/api/dashboard');
    expect(content).toContain('Abre el dashboard demo local en: http://localhost:${PORT}');
    expect(content).not.toContain('totalCotizaciones: { valor: 156');
    expect(content).not.toContain('gratis: 100');
    expect(content).not.toContain('Cotizador Peru - servidor de referencia');
    expect(content).not.toContain('Ultimate v3.0');
    expect(content).not.toContain('Servidor escuchando en http://localhost:${PORT}');
    expect(content).not.toContain('Abre tu navegador en: http://localhost:${PORT}');
  });

  it('server-minimo usa parsePort para el puerto del servidor', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'server-minimo.js'), 'utf8');
    expect(content).toContain("parsePort(process.env.PORT, 3000)");
    expect(content).toContain('ImportAIAgent Cotizador - servidor minimo');
    expect(content).toContain("source: 'demo_local'");
    expect(content).toContain('health local sin chequeos de dependencias reales');
    expect(content).toContain("status: 'demo_local'");
    expect(content).toContain('dashboard no conectado a datos reales');
    expect(content).toContain('estadisticas de membresias no conectadas a datos reales');
    expect(content).toContain('Servidor demo_local minimo escuchando');
    expect(content).toContain('Health demo: http://localhost:${PORT}/api/health');
    expect(content).toContain('=== SERVIDOR DEMO DISPONIBLE ===');
    expect(content).toContain('Abre el dashboard demo local en: http://localhost:${PORT}');
    expect(content).not.toContain('totalCotizaciones: { valor: 156');
    expect(content).not.toContain('gratis: 100');
    expect(content).not.toContain('Cotizador Peru - servidor minimo');
    expect(content).not.toContain('Ultimate v3.0');
    expect(content).not.toContain('=== SERVIDOR LISTO ===');
    expect(content).not.toContain('Abre tu navegador en: http://localhost:${PORT}');
  });
});
