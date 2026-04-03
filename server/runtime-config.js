const fs = require('fs');
const path = require('path');

function getProjectRoot(baseDir = __dirname) {
  return path.resolve(baseDir, '..');
}

function resolveEnvFile(options = {}) {
  const projectRoot = options.projectRoot || getProjectRoot(options.baseDir);
  const nodeEnv = options.nodeEnv || process.env.NODE_ENV;
  const envCandidates = nodeEnv === 'production'
    ? ['.env.production', '.env']
    : ['.env'];

  return envCandidates
    .map((name) => path.join(projectRoot, name))
    .find((filePath) => fs.existsSync(filePath)) || null;
}

function normalizeOrigin(origin) {
  const trimmed = String(origin || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1)(:\d+)?$/i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return `https://${trimmed}`;
}

function buildAllowedOrigins(env = process.env) {
  if (env.ALLOWED_ORIGINS) {
    const origins = String(env.ALLOWED_ORIGINS)
      .split(',')
      .map((origin) => normalizeOrigin(origin))
      .filter(Boolean);

    return origins.length ? origins : true;
  }

  if (env.DOMAIN) {
    const normalizedDomain = normalizeOrigin(env.DOMAIN);
    return normalizedDomain ? [normalizedDomain] : true;
  }

  return true;
}

module.exports = {
  getProjectRoot,
  resolveEnvFile,
  normalizeOrigin,
  buildAllowedOrigins,
};
