const fs = require('fs');
const path = require('path');

describe('scripts/deploy_vps_direct.py', () => {
  const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'deploy_vps_direct.py');
  const content = fs.readFileSync(scriptPath, 'utf8');

  it('excluye secretos y artefactos locales del paquete de despliegue', () => {
    expect(content).toContain('".env.production"');
    expect(content).toContain('"LOCAL_SECRETS.md"');
    expect(content).toContain('"backups"');
    expect(content).toContain('"restored-backups"');
    expect(content).toContain('"output"');
    expect(content).toContain('"tmp"');
    expect(content).toContain('"secure"');
    expect(content).toContain('".venv-official-fx"');
  });

  it('preserva data, secure, la venv y entornos remotos en lugar de moverlos al backup', () => {
    expect(content).toContain('PRESERVE_ITEMS=(data secure .venv-official-fx .env .env.production)');
    expect(content).toContain('if [ "$base" = "$keep" ]; then');
    expect(content).toContain('if [ "$preserve" = true ]; then');
    expect(content).toContain('mv "${BACKUP_ITEMS[@]}" "$BACKUP_PATH"/');
  });

  it('falla si falta .env.production en el VPS y solo recrea .env desde ese archivo preservado', () => {
    expect(content).toContain('if [ ! -f ".env.production" ]; then');
    expect(content).toContain('echo ".env.production no existe en el VPS y no se desplegara desde local" >&2');
    expect(content).toContain('if [ -f ".env.production" ] && [ ! -f ".env" ]; then');
    expect(content).toContain('cp .env.production .env');
    expect(content).toContain('grep \'^PORT=\' .env.production');
    expect(content).toContain('grep \'^WS_PORT=\' .env.production');
    expect(content).toContain('echo "PORT falta en .env.production" >&2');
    expect(content).toContain('echo "WS_PORT falta en .env.production" >&2');
    expect(content).not.toContain('proxy_pass http://127.0.0.1:3002;');
    expect(content).not.toContain('APP_PORT_FALLBACK');
    expect(content).not.toContain('WS_PORT_FALLBACK');
    expect(content).not.toContain('parser.add_argument("--port", default="3000")');
    expect(content).not.toContain('parser.add_argument("--ws-port", default="3002")');
  });
});
