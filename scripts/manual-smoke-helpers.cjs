const http = require('http');
const https = require('https');

const DEFAULT_LOCAL_PORT = String(process.env.PORT || '3000').trim() || '3000';
const DEFAULT_BASE_URL = `http://localhost:${DEFAULT_LOCAL_PORT}`;
const MANUAL_HTTP_TIMEOUT_MS = 15000;

function normalizeBaseUrl(value, fallback = DEFAULT_BASE_URL) {
  const candidate = String(value || fallback || '').trim();
  if (!candidate) {
    return DEFAULT_BASE_URL;
  }
  const withProtocol = /^[a-z]+:\/\//i.test(candidate) ? candidate : `http://${candidate}`;
  return withProtocol.replace(/\/+$/, '');
}

function normalizeToken(value) {
  const token = String(value || '').trim();
  return token || '';
}

function buildRequestHeaders(token) {
  const normalizedToken = normalizeToken(token);
  return normalizedToken
    ? { Authorization: `Bearer ${normalizedToken}` }
    : {};
}

function getRequestModuleName(url) {
  const normalizedUrl = normalizeBaseUrl(url);
  return new URL(normalizedUrl).protocol === 'https:' ? 'https' : 'http';
}

function requestJson(url, headers = {}, options = {}) {
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) && Number(options.timeoutMs) > 0
    ? Number(options.timeoutMs)
    : MANUAL_HTTP_TIMEOUT_MS;
  const normalizedUrl = normalizeBaseUrl(url);
  const transport = getRequestModuleName(normalizedUrl) === 'https' ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.get(normalizedUrl, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ statusCode: res.statusCode, data });
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`timeout after ${timeoutMs}ms`));
    });

    req.on('error', reject);
  });
}

function classifyManualHttpStatus(statusCode, options = {}) {
  const {
    requiresAuth = false,
    allowBadRequest = false,
    hasToken = false,
    requiresAdmin = false,
  } = options;

  if (statusCode === 200) {
    return { bucket: 'success', label: 'RESPONDIO' };
  }

  if (allowBadRequest && statusCode === 400) {
    return { bucket: 'success', label: 'RESPONDIO (400 esperado)' };
  }

  if (statusCode === 401 && requiresAuth && !hasToken) {
    return {
      bucket: 'skipped',
      label: 'OMITIDA',
      reason: 'falta token de autenticacion',
    };
  }

  if (statusCode === 403 && requiresAdmin) {
    return {
      bucket: 'skipped',
      label: 'OMITIDA',
      reason: 'se requiere token admin',
    };
  }

  return {
    bucket: 'failed',
    label: 'FALLIDA',
    reason: `HTTP ${statusCode}`,
  };
}

module.exports = {
  DEFAULT_BASE_URL,
  MANUAL_HTTP_TIMEOUT_MS,
  buildRequestHeaders,
  classifyManualHttpStatus,
  getRequestModuleName,
  normalizeBaseUrl,
  normalizeToken,
  requestJson,
};
