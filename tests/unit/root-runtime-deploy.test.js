const fs = require('fs')
const path = require('path')

describe('root runtime and deploy scripts', () => {
  const repoRoot = path.join(__dirname, '..', '..')

  it('deploy-vps-unix usa la ruta moderna de la app y no autogenera secretos de ejemplo', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'deploy-vps-unix.sh'), 'utf8')

    expect(content).toContain('VPS_PATH="${VPS_PATH:-/var/www/importaiagent}"')
    expect(content).toContain('Falta .env.production. Crea el archivo real antes del despliegue.')
    expect(content).toContain('pm2 start ecosystem.config.js --only cotizador --update-env')
    expect(content).not.toContain('PORT="${PORT:-3000}" pm2 start ecosystem.config.js --only cotizador --update-env')
    expect(content).not.toContain('COLOCA_TU_API_KEY_DE_GROQ_AQUI')
  })

  it('deploy-vps-unix excluye secretos y artefactos locales del rsync', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'deploy-vps-unix.sh'), 'utf8')

    expect(content).toContain("--exclude '.env.production'")
    expect(content).toContain("--exclude 'LOCAL_SECRETS.md'")
    expect(content).toContain("--exclude 'backups'")
    expect(content).toContain("--exclude 'output'")
    expect(content).toContain("--exclude 'tmp'")
    expect(content).toContain("--exclude 'secure'")
    expect(content).toContain('Falta .env.production en el VPS. Copialo manualmente antes de continuar.')
    expect(content).toContain('if [ ! -f ".env" ]; then')
  })

  it('deploy-vps-unix usa el sitio nginx moderno de importaiagent', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'deploy-vps-unix.sh'), 'utf8')

    expect(content).toContain('/etc/nginx/sites-available/importaiagent')
    expect(content).toContain('/etc/nginx/sites-enabled/importaiagent')
    expect(content).toContain('APP_PORT_PLACEHOLDER')
    expect(content).toContain('WS_PORT_PLACEHOLDER')
    expect(content).toContain("grep '^PORT=' \"$VPS_PATH/.env.production\"")
    expect(content).toContain("grep '^WS_PORT=' \"$VPS_PATH/.env.production\"")
    expect(content).toContain('echo "PORT falta en .env.production" >&2')
    expect(content).toContain('echo "WS_PORT falta en .env.production" >&2')
    expect(content).not.toContain('/etc/nginx/sites-available/cotizador')
    expect(content).not.toContain('proxy_pass http://127.0.0.1:3000;')
    expect(content).not.toContain('proxy_pass http://127.0.0.1:3002;')
    expect(content).not.toContain('APP_PORT="3000"')
    expect(content).not.toContain('WS_PORT="3002"')
  })

  it('deploy-vps.bat delega a PowerShell y no mezcla sintaxis bash antigua', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'deploy-vps.bat'), 'utf8')

    expect(content).toContain('powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%deploy-vps.ps1" %*')
    expect(content).not.toContain('scp --exclude')
    expect(content).not.toContain('<< ENDSSH')
    expect(content).not.toContain('2>/dev/null')
  })

  it('deploy-vps.sh delega al wrapper unix moderno', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'deploy-vps.sh'), 'utf8')

    expect(content).toContain('exec bash "$SCRIPT_DIR/deploy-vps-unix.sh" "$@"')
    expect(content).not.toContain('/var/www/cotizador')
  })

  it('arrancar-local.bat usa node desde PATH en lugar de una ruta fija', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'arrancar-local.bat'), 'utf8')

    expect(content).toContain('where node >nul 2>&1')
    expect(content).toContain('node start-local.js')
    expect(content).not.toContain('"C:\\Program Files\\nodejs\\node.exe"')
    expect(content).not.toContain('http://localhost:3000')
  })

  it('ecosystem y wrappers de deploy no pisan el PORT definido en .env.production', () => {
    const ecosystem = fs.readFileSync(path.join(repoRoot, 'ecosystem.config.js'), 'utf8')
    const deployPs1 = fs.readFileSync(path.join(repoRoot, 'deploy-vps.ps1'), 'utf8')
    const deployUnix = fs.readFileSync(path.join(repoRoot, 'deploy-vps-unix.sh'), 'utf8')

    expect(ecosystem).not.toContain('PORT: 3000')
    expect(deployPs1).toContain('pm2 start ecosystem.config.js --only cotizador --update-env')
    expect(deployPs1).not.toContain('PORT="${PORT:-3000}" pm2 start ecosystem.config.js --only cotizador --update-env')
    expect(deployUnix).toContain('pm2 start ecosystem.config.js --only cotizador --update-env')
    expect(deployUnix).not.toContain('PORT="${PORT:-3000}" pm2 start ecosystem.config.js --only cotizador --update-env')
    expect(deployPs1).toContain('curl -fsS "http://127.0.0.1:${APP_PORT}/api/monitor/health"')
    expect(deployUnix).toContain('curl -fsS "http://127.0.0.1:${APP_PORT}/api/monitor/health"')
  })

  it('production:check exige tambien WS_PORT como bloqueante de produccion', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'scripts', 'validate-production-env.js'), 'utf8')

    expect(content).toContain("if (!hasRealValue(env, 'WS_PORT')) {")
    expect(content).toContain("failures.push('WS_PORT no esta configurado con un valor real');")
    expect(content).toContain('successes.push(`WS_PORT=${env.WS_PORT}`);')
    expect(content).toContain('module.exports = {')
    expect(content).toContain('evaluateEnvironment,')
  })
})
