const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

describe('deploy-vps.ps1', () => {
  const scriptPath = path.join(__dirname, '..', '..', 'deploy-vps.ps1');
  const content = fs.readFileSync(scriptPath, 'utf8');

  it('usa la ruta y el dominio actuales del proyecto', () => {
    expect(content).toContain('"/var/www/importaiagent"');
    expect(content).toContain('"importaiagent.com"');
    expect(content).not.toContain('"/var/www/cotizador"');
  });

  it('excluye secretos y artefactos sensibles del paquete de despliegue', () => {
    expect(content).toContain('".env.production"');
    expect(content).toContain('"LOCAL_SECRETS.md"');
    expect(content).toContain('"backups"');
    expect(content).toContain('"output"');
    expect(content).toContain('"secure"');
  });

  it('limpia archivos anteriores del servidor sin borrar data ni env preservados', () => {
    expect(content).toContain('TMP_EXTRACT_DIR');
    expect(content).toContain('BACKUP_DIR');
    expect(content).toContain('find "$APP_PATH" -mindepth 1 -maxdepth 1');
    expect(content).toContain('! -name "data"');
    expect(content).toContain('! -name ".env"');
    expect(content).toContain('! -name ".env.production"');
    expect(content).toContain('! -name "secure"');
    expect(content).toContain('cp -a "$TMP_EXTRACT_DIR"/. "$APP_PATH"/');
  });

  it('no fabrica .env.production de ejemplo y exige el archivo real en el VPS', () => {
    expect(content).not.toContain('COLOCA_TU_API_KEY_DE_GROQ_AQUI');
    expect(content).toContain('.env.production no existe en el VPS y no se desplegara desde local');
  });

  it('arranca con ecosystem.config.js y configura nginx con importaiagent', () => {
    expect(content).toContain('pm2 start ecosystem.config.js --only cotizador --update-env');
    expect(content).toContain('/etc/nginx/sites-available/importaiagent');
    expect(content).toContain('DOMAIN_PLACEHOLDER');
    expect(content).toContain('APP_PORT_PLACEHOLDER');
    expect(content).toContain('WS_PORT_PLACEHOLDER');
    expect(content).toContain('grep \'^PORT=\' .env.production');
    expect(content).toContain('grep \'^WS_PORT=\' .env.production');
    expect(content).toContain('echo "PORT falta en .env.production" >&2');
    expect(content).toContain('echo "WS_PORT falta en .env.production" >&2');
    expect(content).not.toContain('pm2 start server/index.js --name cotizador');
    expect(content).not.toContain('proxy_pass http://127.0.0.1:3000;');
    expect(content).not.toContain('proxy_pass http://127.0.0.1:3002;');
    expect(content).not.toContain('APP_PORT="3000"');
    expect(content).not.toContain('WS_PORT="3002"');
  });

  it('parsea como PowerShell ejecutable y no rompe scp por interpolacion con ":"', () => {
    expect(content).toContain('"${VpsUser}@${VpsIp}:$VpsPath/$archiveName"');
    expect(content).toContain('"${VpsUser}@${VpsIp}:$VpsPath/$remoteScriptName"');

    execFileSync('powershell', [
      '-NoProfile',
      '-Command',
      `[void][scriptblock]::Create((Get-Content -Raw '${scriptPath.replace(/'/g, "''")}'))`
    ], { stdio: 'pipe' });
  });

  it('mantiene el despliegue local en PowerShell y encapsula bash solo en el script remoto', () => {
    expect(content).toContain("$remoteScript = @'");
    expect(content).toContain('#!/usr/bin/env bash');
    expect(content).toContain('set -euo pipefail');
    expect(content).toContain('& scp $archivePath');
    expect(content).toContain('& scp $remoteScriptPath');
    expect(content).toContain("bash '$VpsPath/$remoteScriptName'");
    expect(content).not.toContain('scp --exclude');
    expect(content).not.toContain('<< ENDSSH');
  });
});
