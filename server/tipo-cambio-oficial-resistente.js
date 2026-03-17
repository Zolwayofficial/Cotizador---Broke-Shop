const { execFile } = require('child_process');
const path = require('path');

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_SCRIPT = path.join(__dirname, '..', 'scripts', 'fetch_official_fx.py');

function isTruthyEnv(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase());
}

function toPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getConfig(overrides = {}) {
  const disabledByTestEnv = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID;
  const explicitEnv = process.env.OFFICIAL_FX_STEALTH_ENABLED;
  const enabled = overrides.enabled ?? (disabledByTestEnv
    ? false
    : explicitEnv === undefined
      ? false
      : isTruthyEnv(explicitEnv, false));
  const timeoutMs = Number(overrides.timeoutMs || process.env.OFFICIAL_FX_STEALTH_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const pythonBin = overrides.pythonBin || process.env.OFFICIAL_FX_PYTHON_BIN || '';
  const headless = overrides.headless ?? isTruthyEnv(process.env.OFFICIAL_FX_STEALTH_HEADLESS, true);
  const useCamoufox = overrides.useCamoufox ?? isTruthyEnv(process.env.OFFICIAL_FX_USE_CAMOUFOX, true);
  const browserChannel = overrides.browserChannel || process.env.OFFICIAL_FX_BROWSER_CHANNEL || '';
  const scriptPath = overrides.scriptPath || process.env.OFFICIAL_FX_STEALTH_SCRIPT || DEFAULT_SCRIPT;

  return {
    enabled,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
    pythonBin,
    headless,
    useCamoufox,
    browserChannel,
    scriptPath,
  };
}

function buildPythonCandidates(pythonBin) {
  if (pythonBin) return [pythonBin];
  return process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'];
}

function normalizeHelperPayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const compra = toPositiveNumber(raw.compra);
  const venta = toPositiveNumber(raw.venta);

  if (!compra || !venta) return null;

  return {
    compra,
    venta,
    source: raw.source || 'SBS_oficial_stealth',
    fecha: raw.fecha || new Date().toISOString(),
    status: raw.status || 'oficial_en_vivo',
    strategy: raw.strategy || raw.engine || 'stealth_browser',
    official: raw.official !== false,
    engine: raw.engine || null,
  };
}

function execHelper(pythonBin, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(pythonBin, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (parseError) {
        reject(new Error(`Respuesta invalida del helper oficial: ${parseError.message}`));
      }
    });
  });
}

async function getTipoCambioOficialResistente(overrides = {}) {
  const config = getConfig(overrides);
  if (!config.enabled) return null;

  const args = [
    config.scriptPath,
    '--timeout-ms',
    String(config.timeoutMs),
    '--headless',
    config.headless ? '1' : '0',
    '--use-camoufox',
    config.useCamoufox ? '1' : '0',
  ];

  if (config.browserChannel) {
    args.push('--browser-channel', config.browserChannel);
  }

  const candidates = buildPythonCandidates(config.pythonBin);

  for (const pythonBin of candidates) {
    try {
      const payload = await execHelper(pythonBin, args, config.timeoutMs + 5000);
      const normalized = normalizeHelperPayload(payload);
      if (normalized) return normalized;
    } catch (_error) {
      // Try the next available Python binary.
    }
  }

  return null;
}

module.exports = {
  getTipoCambioOficialResistente,
  getTipoCambioOficialResistenteConfig: getConfig,
  normalizeHelperPayload,
};
