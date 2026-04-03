const fs = require('fs');
const path = require('path');

describe('setup scripts', () => {
  const repoRoot = path.join(__dirname, '..', '..');

  it('package.json ejecuta setup desde Node y no depende de bash directo', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
    );

    expect(packageJson.scripts.setup).toBe('node scripts/setup.js');
  });

  it('setup.js soporta bootstrap local y delega el aprovisionamiento VPS con --vps', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'scripts', 'setup.js'), 'utf8');

    expect(content).toContain("const wantsVps = process.argv.includes('--vps');");
    expect(content).toContain("run('bash', [path.join('scripts', 'setup.sh')]);");
    expect(content).toContain("run(NPM_CMD, ['install', '--prefix', 'client'])");
    expect(content).toContain(".env.example");
    expect(content).toContain("process.platform === 'win32'");
  });

  it('setup.sh usa el flujo actual de importaiagent y revisa produccion antes de arrancar', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'scripts', 'setup.sh'), 'utf8');

    expect(content).toContain('APP_NAME="importaiagent"');
    expect(content).toContain('echo -e "${GREEN}[4/7] Revisando entorno de produccion...${NC}"');
    expect(content).toContain('/etc/nginx/sites-available/$APP_NAME');
    expect(content).toContain('npm run production:check');
    expect(content).toContain('pm2 start ecosystem.config.js --only "$PM2_APP_NAME" --update-env');
    expect(content).toContain("grep '^PORT=' .env.production");
    expect(content).toContain("grep '^WS_PORT=' .env.production");
    expect(content).toContain('echo "PORT falta en .env.production" >&2');
    expect(content).toContain('echo "WS_PORT falta en .env.production" >&2');
    expect(content).toContain('proxy_pass http://127.0.0.1:${APP_PORT};');
    expect(content).toContain('proxy_pass http://127.0.0.1:${WS_PORT};');
    expect(content).toContain('curl -fsS "http://127.0.0.1:${APP_PORT}/api/monitor/health"');
    expect(content).toContain('Falta .env.production. Copialo en el VPS antes de continuar.');
    expect(content).not.toContain('/etc/nginx/sites-available/cotizador');
    expect(content).not.toContain('pm2 start server/index.js --name cotizador');
    expect(content).not.toContain('PORT="${PORT:-3000}" pm2 start ecosystem.config.js --only "$PM2_APP_NAME" --update-env');
    expect(content).not.toContain('APP_PORT="3000"');
    expect(content).not.toContain('WS_PORT="3002"');
    expect(content).not.toContain('echo -e "${GREEN}[4/7] Validando entorno de produccion...${NC}"');
  });
});
