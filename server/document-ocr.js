const path = require('path');
const { GoogleAuth } = require('google-auth-library');

const SUPPORTED_OCR_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
]);

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_PROVIDER = 'google_documentai';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const PROJECT_ROOT = path.join(__dirname, '..');

function isTruthyEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase());
}

function hasRealValue(value) {
  if (value === undefined || value === null) return false;
  return String(value).trim().length > 0;
}

function normalizeText(text = '') {
  return String(text)
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

function getDocumentOcrConfig(overrides = {}) {
  const provider = String(overrides.provider || process.env.DOCUMENT_OCR_PROVIDER || DEFAULT_PROVIDER).trim().toLowerCase();
  const projectId = overrides.projectId || process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GCLOUD_PROJECT || '';
  const location = overrides.location || process.env.GOOGLE_DOCUMENT_AI_LOCATION || 'us';
  const processorId = overrides.processorId || process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID || '';
  const credentialsPathRaw = overrides.credentialsPath || process.env.GOOGLE_APPLICATION_CREDENTIALS || '';
  const enabledFlag = overrides.enabled ?? isTruthyEnv(process.env.DOCUMENT_OCR_ENABLED, false);
  const timeoutMs = Number(overrides.timeoutMs || process.env.DOCUMENT_OCR_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const minTextLength = Number(overrides.minTextLength || process.env.DOCUMENT_OCR_MIN_TEXT_LENGTH || 40);
  const credentialsPath = hasRealValue(credentialsPathRaw)
    ? (path.isAbsolute(credentialsPathRaw)
      ? credentialsPathRaw
      : path.resolve(PROJECT_ROOT, credentialsPathRaw))
    : '';

  const configured = provider === DEFAULT_PROVIDER
    && hasRealValue(projectId)
    && hasRealValue(location)
    && hasRealValue(processorId);

  return {
    provider,
    projectId,
    location,
    processorId,
    enabled: Boolean(enabledFlag && configured),
    configured,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
    minTextLength: Number.isFinite(minTextLength) && minTextLength > 0 ? minTextLength : 40,
    endpoint: `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process`,
    credentialsPath,
  };
}

async function getAccessToken(authOverride = null) {
  const config = getDocumentOcrConfig();
  const auth = authOverride || new GoogleAuth({
    scopes: [GOOGLE_SCOPE],
    keyFile: config.credentialsPath || undefined,
  });
  const client = await auth.getClient();
  const rawToken = await client.getAccessToken();
  return typeof rawToken === 'string' ? rawToken : rawToken?.token || '';
}

async function extractDocumentTextWithOcr(buffer, options = {}) {
  const config = getDocumentOcrConfig(options.configOverrides);
  const mimeType = String(options.mimeType || '').toLowerCase();

  if (!config.enabled) return null;
  if (!SUPPORTED_OCR_MIMES.has(mimeType)) return null;
  if (!buffer || !buffer.length) return null;

  const accessToken = await getAccessToken(options.auth);
  if (!accessToken) {
    throw new Error('No se pudo obtener un access token de Google Cloud para OCR.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        skipHumanReview: true,
        rawDocument: {
          mimeType,
          content: buffer.toString('base64'),
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Document AI respondio ${response.status}: ${detail.slice(0, 300)}`);
    }

    const payload = await response.json();
    const text = normalizeText(payload?.document?.text || '');
    if (text.length < config.minTextLength) return null;

    return {
      contenido: text,
      tipo: 'text',
      source: 'google-documentai-ocr',
      provider: config.provider,
      details: {
        mimeType,
        pageCount: Array.isArray(payload?.document?.pages) ? payload.document.pages.length : null,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  SUPPORTED_OCR_MIMES,
  extractDocumentTextWithOcr,
  getDocumentOcrConfig,
};
