// server/sanciones.js — Denied Party Screening (OFAC, ONU, UE)
// Uses OpenSanctions.org free API to check if a party is sanctioned
const https = require("https");

const OPENSANCTIONS_API = "https://api.opensanctions.org/match/default";
// Free tier: 500 lookups/month. For more, get API key at opensanctions.org

let _cache = {};
const CACHE_TTL = 86400000 * 7; // 7 days
const CACHE_MAX = 500;

// Prune old cache entries to prevent memory leak
function pruneCache() {
  const now = Date.now();
  const keys = Object.keys(_cache);
  if (keys.length <= CACHE_MAX) return;
  // Remove expired entries first
  for (const k of keys) { if (now - _cache[k].ts > CACHE_TTL) delete _cache[k]; }
  // If still too many, remove oldest
  const remaining = Object.entries(_cache).sort((a, b) => a[1].ts - b[1].ts);
  while (remaining.length > CACHE_MAX) { delete _cache[remaining.shift()[0]]; }
}

function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: "POST",
      headers: { "Content-Type":"application/json", "Content-Length":Buffer.byteLength(data) },
      timeout: 15000,
    }, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch { resolve(null); } });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(data);
    req.end();
  });
}

// Screen a company or person against sanctions lists
async function verificar(nombre, pais, tipo) {
  if (!nombre || nombre.length < 3) return { error: "Nombre muy corto" };

  const cacheKey = `${nombre}:${pais||""}`.toLowerCase();
  if (_cache[cacheKey] && Date.now() - _cache[cacheKey].ts < CACHE_TTL) return _cache[cacheKey].data;

  try {
    const query = {
      schema: tipo === "persona" ? "Person" : "Company",
      properties: {
        name: [nombre],
        ...(pais ? { country: [pais] } : {}),
      },
    };

    const resp = await httpsPost(OPENSANCTIONS_API, query);
    if (!resp || !resp.responses) {
      return { verificado: false, error: "API no disponible", fallback: true };
    }

    const matches = (resp.responses || [])
      .filter(r => r.score > 0.7) // Only high-confidence matches
      .map(r => ({
        nombre: r.caption,
        score: r.score,
        listas: r.datasets || [],
        pais: r.properties?.country?.[0] || "—",
        tipo: r.schema,
        motivo: r.properties?.notes?.[0] || r.properties?.summary?.[0] || "—",
      }));

    const result = {
      verificado: true,
      consultaFecha: new Date().toISOString(),
      nombre,
      pais: pais || null,
      enListaNegra: matches.length > 0,
      matches,
      riesgo: matches.length === 0 ? "limpio" : matches.some(m => m.score > 0.9) ? "alto" : "medio",
      mensaje: matches.length === 0
        ? "✅ No se encontraron coincidencias en listas de sanciones internacionales."
        : `🔴 ${matches.length} coincidencia(s) en listas de sanciones. NO proceder sin verificación legal.`,
      fuentes: "OpenSanctions (OFAC SDN, ONU, UE, UK, y 30+ listas)",
    };

    _cache[cacheKey] = { data: result, ts: Date.now() };
    pruneCache();
    return result;
  } catch (e) {
    return { verificado: false, error: e.message, mensaje: "⚠ No se pudo verificar. Verificar manualmente en sanctionssearch.ofac.treas.gov" };
  }
}

// Quick check for a supplier name
async function verificarProveedor(nombre, pais) {
  return verificar(nombre, pais, "empresa");
}

// Quick check for an importer
async function verificarImportador(nombre, pais) {
  return verificar(nombre, pais || "PE", "empresa");
}

module.exports = { verificar, verificarProveedor, verificarImportador };
