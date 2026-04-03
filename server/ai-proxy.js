const https = require('https');
const autoRepair = require('./auto-repair');

const SYSTEM_CLASSIFY = `Eres un experto clasificador arancelario peruano. Usas las 6 Reglas Generales Interpretativas (RGI) del Sistema Armonizado para clasificar mercancias.

SIEMPRE responde con:
1. La subpartida nacional (10 digitos) mas probable
2. El razonamiento RGI usado
3. El Ad Valorem estimado (0%, 6%, u 11%)
4. Permisos requeridos (MTC, DIGESA, SENASA, DIGEMID si aplica)

Formato de codigo HS: XXXX.XX.XX.XX (con puntos)
Base legal: Arancel de Aduanas 2022 (D.S. 342-2016-EF, modificado por D.S. 401-2021-EF).`;

const SYSTEM_EXTRACT = `Eres un extractor de datos de documentos comerciales. Tu trabajo es extraer informacion de cotizaciones, facturas proforma e invoices de proveedores internacionales.

Extrae en formato JSON:
{
  "items": [{ "desc": "...", "qty": N, "unit": N, "sku": "..." }],
  "freight": N o null,
  "insurance": N o null,
  "country": "XX" (codigo ISO) o null,
  "currency": "XXX" o null,
  "supplier": "..." o null
}

Responde SOLO con el JSON, sin texto adicional.`;

const DEFAULT_FALLBACK_MODEL =
  process.env.GROQ_MODEL_FALLBACK
  || process.env.GROQ_MODEL_UNLIMITED
  || 'llama-3.1-8b-instant';
const DEFAULT_CHAT_CHAIN = [
  'openai/gpt-oss-20b',
  'llama-3.3-70b-versatile',
  DEFAULT_FALLBACK_MODEL,
];
const DEFAULT_TEXT_EXTRACT_CHAIN = [
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-20b',
  DEFAULT_FALLBACK_MODEL,
];
const DEFAULT_VISION_CHAIN = [
  process.env.GROQ_MODEL_VISION || 'meta-llama/llama-4-scout-17b-16e-instruct',
];

function uniqueModels(models) {
  return Array.from(new Set(models.filter(Boolean).map((model) => String(model).trim()).filter(Boolean)));
}

function parseModelChain(value, fallback) {
  if (Array.isArray(value)) {
    const parsed = uniqueModels(value);
    return parsed.length > 0 ? parsed : uniqueModels(fallback || []);
  }

  if (typeof value === 'string') {
    const parsed = uniqueModels(value.split(','));
    if (parsed.length > 0) {
      return parsed;
    }
  }

  return uniqueModels(fallback || []);
}

function buildGroqChain(modelOrChain) {
  return parseModelChain(
    modelOrChain || process.env.GROQ_MODEL_CHAT_CHAIN,
    DEFAULT_CHAT_CHAIN,
  );
}

function httpsPost(hostname, path, body, headers) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname,
      path,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString();
        let parsed = {};

        if (rawBody) {
          try {
            parsed = JSON.parse(rawBody);
          } catch {
            const parseError = new Error('Respuesta no interpretable del proveedor');
            parseError.statusCode = res.statusCode;
            parseError.rawBody = rawBody;
            reject(parseError);
            return;
          }
        }

        if ((res.statusCode || 200) >= 400) {
          const requestError = new Error(
            parsed.error?.message || parsed.message || `HTTP ${res.statusCode}`,
          );
          requestError.statusCode = res.statusCode;
          requestError.payload = parsed;
          reject(requestError);
          return;
        }

        resolve(parsed);
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.write(data);
    req.end();
  });
}

function isFatalGroqError(error) {
  const status = Number(error?.statusCode || error?.payload?.error?.code || 0);
  const message = String(error?.message || '').toLowerCase();

  return status === 401
    || status === 403
    || message.includes('api key')
    || message.includes('unauthorized')
    || message.includes('forbidden');
}

function shouldTryNextGroqModel(error) {
  if (!error || isFatalGroqError(error)) {
    return false;
  }

  const status = Number(error?.statusCode || 0);
  const message = String(error?.message || '').toLowerCase();

  return [
    status === 404,
    status === 408,
    status === 409,
    status === 429,
    status >= 500,
    message.includes('429'),
    message.includes('timeout'),
    message.includes('rate'),
    message.includes('limit'),
    message.includes('overloaded'),
    message.includes('temporarily unavailable'),
    message.includes('service unavailable'),
    message.includes('not found'),
  ].some(Boolean);
}

async function callGroqSingle(messages, model, options = {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set');

  const payload = {
    model,
    messages,
    max_tokens: options.max_tokens || 2000,
    temperature: options.temperature ?? 0.3,
  };

  if (options.response_format) {
    payload.response_format = options.response_format;
  }

  const resp = await httpsPost(
    'api.groq.com',
    '/openai/v1/chat/completions',
    payload,
    { Authorization: `Bearer ${key}` },
  );

  if (resp.error) {
    const responseError = new Error(resp.error.message || JSON.stringify(resp.error));
    responseError.payload = resp;
    throw responseError;
  }

  return {
    text: resp.choices?.[0]?.message?.content || '',
    model,
    raw: resp,
  };
}

async function callGroq(messages, modelOrChain, options = {}) {
  return await autoRepair.ejecutarConAutoReparacion(
    'ai-proxy',
    async () => {
      const models = buildGroqChain(modelOrChain);
      let lastError = null;

      for (let index = 0; index < models.length; index += 1) {
        const currentModel = models[index];
        const hasMoreModels = index < models.length - 1;

        try {
          return await callGroqSingle(messages, currentModel, options);
        } catch (error) {
          lastError = error;

          if (hasMoreModels && shouldTryNextGroqModel(error)) {
            console.warn(`[AI] ${currentModel} no estuvo disponible (${error.message}). Probando siguiente modelo...`);
            continue;
          }

          throw error;
        }
      }

      throw lastError || new Error('No se pudo completar la llamada a Groq');
    },
    { modelOrChain, messagesCount: messages.length }
  );
}

async function callOpenAI(messages, model, options = {}) {
  return await autoRepair.ejecutarConAutoReparacion(
    'ai-proxy',
    async () => {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error('OPENAI_API_KEY not set');
      const resp = await httpsPost('api.openai.com', '/v1/chat/completions', {
        model: model || 'gpt-4o-mini',
        messages,
        max_tokens: options.max_tokens || 2000,
        temperature: options.temperature ?? 0.3,
      }, { Authorization: `Bearer ${key}` });
      if (resp.error) throw new Error(resp.error.message);
      return {
        text: resp.choices?.[0]?.message?.content || '',
        model: model || 'gpt-4o-mini',
        raw: resp,
      };
    },
    { model, messagesCount: messages.length, provider: 'openai' }
  );
}

module.exports = {
  async classify(messages, provider = 'groq') {
    const hasSystem = messages[0]?.role === 'system';
    const fullMessages = hasSystem ? messages : [{ role: 'system', content: SYSTEM_CLASSIFY }, ...messages];
    const fn = provider === 'openai' ? callOpenAI : callGroq;
    const response = await fn(fullMessages);
    return { ok: true, text: response.text, provider, model: response.model };
  },

  async call(messages, provider = 'groq', model, options = {}) {
    const fn = provider === 'openai' ? callOpenAI : callGroq;
    const response = await fn(messages, model, options);
    return { ok: true, text: response.text, provider, model: response.model };
  },

  async extract(content, type = 'document') {
    const messages = [
      { role: 'system', content: SYSTEM_EXTRACT },
      {
        role: 'user',
        content: type === 'image'
          ? [{ type: 'image_url', image_url: { url: content } }, { type: 'text', text: 'Extrae los datos de esta imagen.' }]
          : `Extrae los datos de este documento:\n\n${content}`
      },
    ];

    const modelChain = type === 'image'
      ? parseModelChain(process.env.GROQ_MODEL_VISION_CHAIN, DEFAULT_VISION_CHAIN)
      : parseModelChain(process.env.GROQ_MODEL_EXTRACT_CHAIN, DEFAULT_TEXT_EXTRACT_CHAIN);

    const response = await callGroq(messages, modelChain);

    try {
      const clean = response.text.replace(/```json|```/g, '').trim();
      return { ok: true, data: JSON.parse(clean), model: response.model };
    } catch {
      return { ok: true, text: response.text, parsed: false, model: response.model };
    }
  },

  __private: {
    parseModelChain,
    buildGroqChain,
    shouldTryNextGroqModel,
    isFatalGroqError,
  },
};
