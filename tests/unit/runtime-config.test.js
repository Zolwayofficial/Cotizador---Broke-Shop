const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildAllowedOrigins,
  normalizeOrigin,
  resolveEnvFile,
} = require('../../server/runtime-config');

describe('runtime-config', () => {
  it('resuelve .env.production desde el root del proyecto aunque el cwd sea otro', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-config-'));
    const envPath = path.join(projectRoot, '.env.production');
    fs.writeFileSync(envPath, 'NODE_ENV=production\n');

    const resolved = resolveEnvFile({
      projectRoot,
      nodeEnv: 'production',
    });

    expect(resolved).toBe(envPath);
  });

  it('prioriza .env en desarrollo', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-config-dev-'));
    const envPath = path.join(projectRoot, '.env');
    fs.writeFileSync(envPath, 'NODE_ENV=development\n');

    const resolved = resolveEnvFile({
      projectRoot,
      nodeEnv: 'development',
    });

    expect(resolved).toBe(envPath);
  });

  it('normaliza dominios y allowed origins con espacios, protocolo y slash final', () => {
    expect(normalizeOrigin(' importaiagent.com/ ')).toBe('https://importaiagent.com');
    expect(normalizeOrigin('https://importaiagent.com/')).toBe('https://importaiagent.com');
    expect(normalizeOrigin('localhost:5173')).toBe('http://localhost:5173');
    expect(normalizeOrigin('127.0.0.1:4173')).toBe('http://127.0.0.1:4173');
    expect(normalizeOrigin('[::1]:5173')).toBe('http://[::1]:5173');

    expect(buildAllowedOrigins({
      ALLOWED_ORIGINS: ' https://uno.com/ , dos.com , localhost:5173, 127.0.0.1:4173  ,   ',
    })).toEqual(['https://uno.com', 'https://dos.com', 'http://localhost:5173', 'http://127.0.0.1:4173']);

    expect(buildAllowedOrigins({
      DOMAIN: 'https://importaiagent.com/',
    })).toEqual(['https://importaiagent.com']);
  });

  it('devuelve true cuando no hay configuracion explicita de origenes', () => {
    expect(buildAllowedOrigins({})).toBe(true);
  });
});
