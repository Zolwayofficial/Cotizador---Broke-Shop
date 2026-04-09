const fs = require('fs');
const path = require('path');

const {
  parsePort,
  resolveRepoFile,
} = require('../../scripts/runtime-script-helpers.cjs');

describe('utilidades de scripts de runtime', () => {
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

  it('server/index permite fijar wsPort antes de iniciar el WebSocket', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'server', 'index.js'), 'utf8');
    expect(content).toContain("const wsPort = options.wsPort ?? resolveRuntimePort(process.env.WS_PORT, 3002, 'WS_PORT');");
    expect(content).toContain('websocketServer.setPort?.(wsPort);');
  });

});
