// server/sanciones.js - Screening de sanciones (OFAC, ONU, UE)
// Usa la API publica de OpenSanctions para verificar coincidencias.
const https = require('https');
const autoRepair = require('./auto-repair');

const OPENSANCTIONS_API = 'https://api.opensanctions.org/match/default';
// OpenSanctions ofrece una capa publica limitada para este tipo de consulta.

const _cache = {};
const CACHE_TTL = 86400000 * 7; // 7 days
const CACHE_MAX = 500;

function pruneCache() {
  const now = Date.now();
  const keys = Object.keys(_cache);

  for (const k of keys) {
    if (now - _cache[k].ts > CACHE_TTL) {
      delete _cache[k];
    }
  }

  const remainingKeys = Object.keys(_cache);
  if (remainingKeys.length <= CACHE_MAX) return;

  const remaining = Object.entries(_cache).sort((a, b) => a[1].ts - b[1].ts);
  while (remaining.length > CACHE_MAX) {
    delete _cache[remaining.shift()[0]];
  }
}

function readFreshCacheEntry(cacheKey) {
  const entry = _cache[cacheKey];
  if (!entry) return null;

  if (Date.now() - entry.ts >= CACHE_TTL) {
    delete _cache[cacheKey];
    return null;
  }

  return entry.data;
}

function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 15000,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch { resolve(null); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

function buildSanctionsMessage(matches) {
  if (!matches.length) {
    return 'No se encontraron coincidencias en listas de sanciones internacionales.';
  }

  return `${matches.length} coincidencia(s) en listas de sanciones. Revisar antes de continuar.`;
}

// Screen a company or person against sanctions lists
async function verificar(nombre, pais, tipo) {
  return await autoRepair.ejecutarConAutoReparacion(
    'sanciones',
    async () => {
      if (!nombre || nombre.length < 3) return { error: 'Nombre muy corto' };

      const cacheKey = `${tipo || 'empresa'}:${nombre}:${pais || ''}`.toLowerCase();
      const cached = readFreshCacheEntry(cacheKey);
      if (cached) return cached;

      try {
        const query = {
          schema: tipo === 'persona' ? 'Person' : 'Company',
          properties: {
            name: [nombre],
            ...(pais ? { country: [pais] } : {}),
          },
        };

        const resp = await httpsPost(OPENSANCTIONS_API, query);
        if (!resp || !resp.responses) {
          return { consultado: false, error: 'API no disponible', fallback: true };
        }

        const matches = (resp.responses || [])
          .filter(r => r.score > 0.7)
          .map(r => ({
            nombre: r.caption,
            score: r.score,
            listas: r.datasets || [],
            pais: r.properties?.country?.[0] || 'N/D',
            tipo: r.schema,
            motivo: r.properties?.notes?.[0] || r.properties?.summary?.[0] || 'N/D',
          }));

        const result = {
          consultado: true,
          consultaFecha: new Date().toISOString(),
          nombre,
          pais: pais || null,
          enListaNegra: matches.length > 0,
          matches,
          riesgo: matches.length === 0 ? 'limpio' : matches.some(m => m.score > 0.9) ? 'alto' : 'medio',
          mensaje: buildSanctionsMessage(matches),
          fuentes: 'OpenSanctions (OFAC SDN, ONU, UE, UK y otras listas integradas)',
        };

        _cache[cacheKey] = { data: result, ts: Date.now() };
        pruneCache();
        return result;
      } catch (e) {
        return {
          consultado: false,
          error: e.message,
          mensaje: 'No se pudo verificar. Revisar manualmente en sanctionssearch.ofac.treas.gov',
        };
      }
    },
    { nombre, pais, tipo }
  );
}

// Quick check for a supplier name
async function verificarProveedor(nombre, pais) {
  return verificar(nombre, pais, 'empresa');
}

// Quick check for an importer
async function verificarImportador(nombre, pais) {
  return verificar(nombre, pais || 'PE', 'empresa');
}

module.exports = {
  verificar,
  verificarProveedor,
  verificarImportador,
  _private: {
    pruneCache,
    readFreshCacheEntry,
    buildSanctionsMessage,
    CACHE_TTL,
    CACHE_MAX,
    _cache,
  },
};
