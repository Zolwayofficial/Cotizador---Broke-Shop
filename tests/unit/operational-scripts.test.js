const fs = require('fs');
const path = require('path');

const {
  findPrimaryFunction,
  hasAutoRepairImport,
  insertAutoRepairImport,
} = require('../../scripts/integrar-auto-repair');

describe('scripts/integrar-auto-repair.js', () => {
  it('detecta imports existentes con comillas simples o dobles', () => {
    expect(hasAutoRepairImport("const autoRepair = require('./auto-repair');")).toBe(true);
    expect(hasAutoRepairImport('const autoRepair = require("./auto-repair");')).toBe(true);
  });

  it('inserta el import una sola vez despues del ultimo require', () => {
    const original = [
      "const fs = require('fs');",
      "const api = require('./api');",
      '',
      'async function run() {}',
    ].join('\n');

    const result = insertAutoRepairImport(original);

    expect(result.changed).toBe(true);
    expect(result.reason).toBe('inserted');
    expect(result.content).toContain('const autoRepair = require("./auto-repair");');
    expect(result.content.indexOf('const autoRepair = require("./auto-repair");')).toBeGreaterThan(
      result.content.indexOf("const api = require('./api');"),
    );
  });

  it('no duplica el import si ya existe con comillas simples', () => {
    const original = [
      "const autoRepair = require('./auto-repair');",
      '',
      'async function run() {}',
    ].join('\n');

    const result = insertAutoRepairImport(original);

    expect(result.changed).toBe(false);
    expect(result.reason).toBe('exists');
  });

  it('detecta la funcion principal en declaracion y asignacion async', () => {
    expect(findPrimaryFunction('async function calcular() {}', 'calcular')).toBe(true);
    expect(findPrimaryFunction('const calcular = async () => {}', 'calcular')).toBe(true);
    expect(findPrimaryFunction('function calcular() {}', 'calcular')).toBe(false);
  });

  it('usa logs neutrales y no revive prefijos OK en el barrido operativo', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'integrar-auto-repair.js'),
      'utf8',
    );

    expect(source).toContain("auto-repair import ${write ? 'prepared' : 'detected'}");
    expect(source).toContain("`${agent.file}: primary function ${agent.funcion} found`");
    expect(source).not.toContain("OK ${agent.file}: auto-repair import");
    expect(source).not.toContain("OK ${agent.file}: primary function");
  });
});

describe('operational python scripts', () => {
  const repoRoot = path.join(__dirname, '..', '..');
  const deployPreserve = fs.readFileSync(
    path.join(repoRoot, 'scripts', 'deploy-app-preserve.py'),
    'utf8',
  );
  const provisionOfficialFx = fs.readFileSync(
    path.join(repoRoot, 'scripts', 'provision_official_fx_stealth_vps.py'),
    'utf8',
  );
  const fetchOfficialFx = fs.readFileSync(
    path.join(repoRoot, 'scripts', 'fetch_official_fx.py'),
    'utf8',
  );

  it('deploy-app-preserve no embebe password y preserva secure y la venv oficial', () => {
    expect(deployPreserve).not.toContain('PpnXibJ0jV94750oMH');
    expect(deployPreserve).toContain('parser.add_argument("--password-env", default="VPS_PASSWORD")');
    expect(deployPreserve).toContain('password = args.password or os.environ.get(args.password_env)');
    expect(deployPreserve).toContain('data|secure|.venv-official-fx|.env|.env.production');
    expect(deployPreserve).toContain('if [ ! -f ".env.production" ]; then');
    expect(deployPreserve).toContain('if [ ! -f ".env" ]; then');
    expect(deployPreserve).toContain('grep \'^PORT=\' .env.production');
    expect(deployPreserve).toContain('grep \'^WS_PORT=\' .env.production');
    expect(deployPreserve).toContain('echo "PORT falta en .env.production" >&2');
    expect(deployPreserve).toContain('echo "WS_PORT falta en .env.production" >&2');
    expect(deployPreserve).toContain('HEALTH_URL="http://127.0.0.1:$APP_PORT/api/monitor/health"');
    expect(deployPreserve).toContain('echo "No se pudo comprobar el health check local tras varios intentos." >&2');
    expect(deployPreserve).not.toContain('HEALTH_URL="http://127.0.0.1:3000/api/monitor/health"');
    expect(deployPreserve).not.toContain('echo "No se pudo confirmar el health check local tras varios intentos." >&2');
  });

  it('provision_official_fx_stealth_vps no embebe password ni crea .env.production desde cero', () => {
    expect(provisionOfficialFx).not.toContain('PpnXibJ0jV94750oMH');
    expect(provisionOfficialFx).toContain('parser.add_argument("--password-env", default="VPS_PASSWORD")');
    expect(provisionOfficialFx).toContain('password = args.password or os.environ.get(args.password_env)');
    expect(provisionOfficialFx).toContain('if [ ! -f "$APP_PATH/.env.production" ]; then');
    expect(provisionOfficialFx).toContain('if [ ! -f "$APP_PATH/.env" ]; then');
    expect(provisionOfficialFx).toContain('grep \'^PORT=\' "$APP_PATH/.env.production"');
    expect(provisionOfficialFx).toContain('grep \'^WS_PORT=\' "$APP_PATH/.env.production"');
    expect(provisionOfficialFx).toContain('echo "PORT falta en .env.production" >&2');
    expect(provisionOfficialFx).toContain('echo "WS_PORT falta en .env.production" >&2');
    expect(provisionOfficialFx).toContain('curl -fsS "http://127.0.0.1:$APP_PORT/api/monitor/health"');
    expect(provisionOfficialFx).not.toContain('curl -fsS http://127.0.0.1:3000/api/monitor/health');
  });

  it('fetch_official_fx parsea flags booleanos explicitos y exige timeout positivo', () => {
    expect(fetchOfficialFx).toContain('def _parse_bool_flag(raw, default: bool = True) -> bool:');
    expect(fetchOfficialFx).toContain('def _positive_timeout_ms(raw) -> int:');
    expect(fetchOfficialFx).toContain('parser.add_argument("--timeout-ms", type=_positive_timeout_ms, default=45000)');
    expect(fetchOfficialFx).not.toContain('args.headless != "0"');
    expect(fetchOfficialFx).not.toContain('args.use_camoufox != "0"');
  });
});
