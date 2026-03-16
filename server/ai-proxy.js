const https = require("https");

const SYSTEM_CLASSIFY = `Eres un experto clasificador arancelario peruano. Usas las 6 Reglas Generales Interpretativas (RGI) del Sistema Armonizado para clasificar mercancías.

SIEMPRE responde con:
1. La subpartida nacional (10 dígitos) más probable
2. El razonamiento RGI usado
3. El Ad Valorem estimado (0%, 6%, u 11%)
4. Permisos requeridos (MTC, DIGESA, SENASA, DIGEMID si aplica)

Formato de código HS: XXXX.XX.XX.XX (con puntos)
Base legal: Arancel de Aduanas 2022 (D.S. 342-2016-EF, modificado por D.S. 401-2021-EF).`;

const SYSTEM_EXTRACT = `Eres un extractor de datos de documentos comerciales. Tu trabajo es extraer información de cotizaciones, facturas proforma e invoices de proveedores internacionales.

Extrae en formato JSON:
{
  "items": [{ "desc": "...", "qty": N, "unit": N, "sku": "..." }],
  "freight": N o null,
  "insurance": N o null,
  "country": "XX" (código ISO) o null,
  "currency": "XXX" o null,
  "supplier": "..." o null
}

Responde SOLO con el JSON, sin texto adicional.`;

function httpsPost(hostname, path, body, headers) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({ hostname, path, method: "POST", headers: { ...headers, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } }, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(new Error("Invalid response")); }
      });
    });
    req.on("error", reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(data);
    req.end();
  });
}

async function callGroq(messages, model) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set");
  // Default: model without daily limit (configurable in .env)
  const unlimited = process.env.GROQ_MODEL_UNLIMITED || "llama-3.1-8b-instant";
  const resp = await httpsPost("api.groq.com", "/openai/v1/chat/completions", {
    model: model || unlimited,
    messages, max_tokens: 2000, temperature: 0.3,
  }, { Authorization: `Bearer ${key}` });
  if (resp.error) throw new Error(resp.error.message || JSON.stringify(resp.error));
  return resp.choices?.[0]?.message?.content || "";
}

async function callOpenAI(messages, model) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const resp = await httpsPost("api.openai.com", "/v1/chat/completions", {
    model: model || "gpt-4o-mini",
    messages, max_tokens: 2000, temperature: 0.3,
  }, { Authorization: `Bearer ${key}` });
  if (resp.error) throw new Error(resp.error.message);
  return resp.choices?.[0]?.message?.content || "";
}

module.exports = {
  // Standard classify (with built-in system prompt)
  async classify(messages, provider = "groq") {
    // If first message is system, use it as-is; otherwise prepend default
    const hasSystem = messages[0]?.role === "system";
    const fullMessages = hasSystem ? messages : [{ role: "system", content: SYSTEM_CLASSIFY }, ...messages];
    const fn = provider === "openai" ? callOpenAI : callGroq;
    const text = await fn(fullMessages);
    return { ok: true, text, provider };
  },

  // Raw model call (for multi-agent and custom prompts)
  async call(messages, provider = "groq", model) {
    const fn = provider === "openai" ? callOpenAI : callGroq;
    const text = await fn(messages, model);
    return { ok: true, text, provider };
  },

  async extract(content, type = "document") {
    const messages = [
      { role: "system", content: SYSTEM_EXTRACT },
      { role: "user", content: type === "image"
        ? [{ type: "image_url", image_url: { url: content } }, { type: "text", text: "Extrae los datos de esta imagen." }]
        : `Extrae los datos de este documento:\n\n${content}`
      },
    ];
    // Vision → Llama 4 Scout (has vision). Text → Llama 3.3 70B (best quality, 1K RPD but worth it for extraction)
    const model = type === "image" ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile";
    const text = await callGroq(messages, model);
    try {
      const clean = text.replace(/```json|```/g, "").trim();
      return { ok: true, data: JSON.parse(clean) };
    } catch {
      return { ok: true, text, parsed: false };
    }
  },
};
