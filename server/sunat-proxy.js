const http = require('http');
const https = require('https');
const iconv = require('iconv-lite');
const { getTipoCambioOficialResistente } = require('./tipo-cambio-oficial-resistente');

let _tcCache = { data: null, ts: 0 };
let _monedasCache = { data: null, ts: 0 };

const TC_CACHE_TTL = Number(process.env.OFFICIAL_FX_CACHE_TTL_MS || 900000);
const MONEDAS_CACHE_TTL = 3600000;
const MAX_OFFICIAL_TC_AGE_DAYS = Number(process.env.OFFICIAL_FX_MAX_AGE_DAYS || 3);
const SBS_TC_PUBLIC_URL = 'https://www.sbs.gob.pe/app/pp/sistip_portal/paginas/publicacion/tipocambiopromedio.aspx';
const BCRP_TC_API_URL = 'https://estadisticas.bcrp.gob.pe/estadisticas/series/api/PD04639PD-PD04640PD/json';
const MONTH_MAP = {
  ene: '01',
  feb: '02',
  mar: '03',
  abr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  ago: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dic: '12',
};

function toPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeSourceStatus(sourceHint = '', explicitStatus = '') {
  if (explicitStatus) return explicitStatus;

  const normalized = String(sourceHint).toLowerCase();
  if (!normalized) return 'referencia_externa';
  if (normalized.includes('fallback')) return 'fallback';
  if (normalized.includes('cache_oficial')) return 'cache_oficial';
  if (normalized.includes('cache_externa')) return 'cache_externa';
  if (normalized.includes('mirror')) return 'referencia_externa';
  if (normalized.includes('externa') || normalized.includes('external')) return 'referencia_externa';
  if (normalized.includes('oficial') || normalized === 'sunat' || normalized === 'sbs') return 'oficial_en_vivo';
  return 'referencia_externa';
}

function normalizeTipoCambio(raw, sourceHint = 'desconocido', overrides = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const compra = toPositiveNumber(
    raw.compra ?? raw.buy ?? raw.bid ?? raw.price_buy ?? raw.precio_compra
  );
  const venta = toPositiveNumber(
    raw.venta ?? raw.sell ?? raw.ask ?? raw.price_sell ?? raw.precio_venta
  );

  if (!compra || !venta) return null;

  const source = overrides.source || raw.source || raw.fuente || sourceHint;
  const status = normalizeSourceStatus(source, overrides.status || raw.status);

  return {
    compra,
    venta,
    source,
    fecha: overrides.fecha || raw.fecha || raw.date || raw.actualizado || new Date().toISOString(),
    status,
    strategy: overrides.strategy || raw.strategy || 'http_fetch',
    official: overrides.official ?? raw.official ?? ['oficial_en_vivo', 'cache_oficial'].includes(status),
  };
}

function fetch(url, isHttps = false) {
  const mod = isHttps ? https : http;
  return new Promise((resolve, reject) => {
    const request = mod.get(url, { timeout: 15000, headers: { 'User-Agent': 'CotizadorPeru/3.0' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      res.on('aborted', () => reject(new Error(`Respuesta abortada para ${url}`)));
      res.on('error', reject);
    });

    request.setTimeout(15000, () => {
      request.destroy(new Error(`Timeout consultando ${url}`));
    });
    request.on('error', reject);
  });
}

function parseTipoCambioHtml(html) {
  const compact = String(html || '').replace(/\s+/g, ' ').trim();
  const directMatch = compact.match(/Compra[^0-9]{0,20}(\d+(?:[.,]\d{3,4}))[^0-9]{0,80}Venta[^0-9]{0,20}(\d+(?:[.,]\d{3,4}))/i);
  if (directMatch) {
    return {
      compra: Number(directMatch[1].replace(',', '.')),
      venta: Number(directMatch[2].replace(',', '.')),
      fecha: (compact.match(/(\d{2}\/\d{2}\/\d{4})/) || [])[1] || new Date().toISOString(),
    };
  }

  return null;
}

function parseBcrpPeriodDate(periodName) {
  const raw = String(periodName || '').trim();
  const match = raw.match(/^(\d{1,2})\.([A-Za-zÁÉÍÓÚáéíóú]{3})\.(\d{2}|\d{4})$/);
  if (!match) return null;

  const day = match[1].padStart(2, '0');
  const month = MONTH_MAP[match[2].slice(0, 3).toLowerCase()];
  if (!month) return null;

  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${month}-${day}`;
}

function looksLikeProtectionPage(html) {
  const text = String(html || '');
  return /_Incapsula_Resource/i.test(text) || /noindex,nofollow/i.test(text);
}

function buildCachedTipoCambio(tc) {
  if (!tc) return null;

  const status = tc.status === 'oficial_en_vivo'
    ? 'cache_oficial'
    : tc.status === 'referencia_externa'
      ? 'cache_externa'
      : tc.status;

  return {
    ...tc,
    status,
    source: tc.source || (status === 'cache_oficial' ? 'cache_oficial' : 'cache_externa'),
    fecha: tc.fecha || new Date(_tcCache.ts).toISOString(),
    official: ['cache_oficial', 'oficial_en_vivo'].includes(status),
  };
}

function getDateAgeDays(isoDate) {
  const normalized = String(isoDate || '').slice(0, 10);
  const parsed = Date.parse(`${normalized}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((todayUtc - parsed) / 86400000);
}

async function fetchOfficialTipoCambioBcrp() {
  try {
    const response = await fetch(BCRP_TC_API_URL, true);
    if (response.status < 200 || response.status >= 300) return null;

    const payload = JSON.parse(response.body.toString('utf8'));
    const periods = Array.isArray(payload?.periods) ? payload.periods : [];
    const latest = [...periods].reverse().find((period) => {
      const values = Array.isArray(period?.values) ? period.values : [];
      return toPositiveNumber(values[0]) && toPositiveNumber(values[1]);
    });

    if (!latest) return null;

    return normalizeTipoCambio({
      compra: latest.values[0],
      venta: latest.values[1],
      fecha: parseBcrpPeriodDate(latest.name) || new Date().toISOString(),
    }, 'BCRP_SBS_series_api', {
      source: 'BCRP_SBS_series_api',
      status: 'oficial_en_vivo',
      strategy: 'bcrp_series_api',
      official: true,
    });
  } catch (_error) {
    return null;
  }
}

async function fetchOfficialTipoCambioHtml() {
  try {
    const response = await fetch(SBS_TC_PUBLIC_URL, true);
    if (response.status < 200 || response.status >= 300) return null;

    const html = response.body.toString('utf8');
    if (looksLikeProtectionPage(html)) return null;

    return normalizeTipoCambio(parseTipoCambioHtml(html), 'SBS_oficial_publica', {
      status: 'oficial_en_vivo',
      strategy: 'http_html',
      official: true,
    });
  } catch (_error) {
    return null;
  }
}

async function fetchMirrorTipoCambio(url, source) {
  try {
    const response = await fetch(url, true);
    if (response.status < 200 || response.status >= 300) return null;

    const json = JSON.parse(response.body.toString());
    return normalizeTipoCambio(json, source, {
      source,
      status: 'referencia_externa',
      strategy: 'mirror_api',
      official: false,
    });
  } catch (_error) {
    return null;
  }
}

function cacheTipoCambio(tc) {
  _tcCache = { data: tc, ts: Date.now() };
  return tc;
}

module.exports = {
  async getTipoCambio() {
    if (_tcCache.data && Date.now() - _tcCache.ts < TC_CACHE_TTL) {
      return buildCachedTipoCambio(_tcCache.data);
    }

    const officialBcrp = await fetchOfficialTipoCambioBcrp();
    if (officialBcrp) {
      return cacheTipoCambio({
        ...officialBcrp,
        stale: getDateAgeDays(officialBcrp.fecha) > MAX_OFFICIAL_TC_AGE_DAYS,
      });
    }

    const officialHtml = await fetchOfficialTipoCambioHtml();
    if (officialHtml) {
      return cacheTipoCambio(officialHtml);
    }

    const officialStealth = await getTipoCambioOficialResistente();
    if (officialStealth) {
      return cacheTipoCambio(officialStealth);
    }

    const mirrors = [
      { url: 'https://api.decolecta.com/v1/tipo-cambio/sunat', source: 'mirror_sunat' },
      { url: 'https://api.decolecta.com/v1/tipo-cambio/sbs/average', source: 'mirror_sbs' },
    ];

    for (const provider of mirrors) {
      const tc = await fetchMirrorTipoCambio(provider.url, provider.source);
      if (tc) {
        return cacheTipoCambio(tc);
      }
    }

    if (_tcCache.data) {
      return buildCachedTipoCambio(_tcCache.data);
    }

    return {
      compra: 3.70,
      venta: 3.75,
      source: 'fallback_local',
      fecha: new Date().toISOString(),
      status: 'fallback',
      strategy: 'fallback_local',
      official: false,
    };
  },

  async getMonedas() {
    if (_monedasCache.data && Date.now() - _monedasCache.ts < MONEDAS_CACHE_TTL) return _monedasCache.data;

    try {
      const r = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', true);
      const json = JSON.parse(r.body.toString());
      if (json.usd) {
        _monedasCache = { data: json, ts: Date.now() };
        return json;
      }
    } catch (_error) {
      // currency provider fallback
    }

    return { usd: {}, source: 'fallback' };
  },

  async consultaPartida(hs) {
    const clean = hs.replace(/\./g, '').padEnd(10, '0');
    const url = `http://www.aduanet.gob.pe/itarancel/arancelS01Alias?accion=buscarPartida&cod_partida=${clean}&esframe=1`;

    try {
      const r = await fetch(url);
      const html = iconv.decode(r.body, 'latin1');

      const result = { hs: clean, raw: false };

      const avMatch = html.match(/Ad[\s-]*Valorem[^<]*?(\d+)%/i) || html.match(/A\/V[^<]*?(\d+)/i);
      if (avMatch) result.advalorem = parseInt(avMatch[1], 10);

      const igvMatch = html.match(/I\.G\.V\.[^<]*?(\d+)%/i) || html.match(/IGV[^<]*?(\d+)/i);
      if (igvMatch) result.igv = parseInt(igvMatch[1], 10);

      const iscMatch = html.match(/I\.S\.C\.[^<]*?(\d+)%/i) || html.match(/ISC[^<]*?(\d+)/i);
      if (iscMatch) result.isc = parseInt(iscMatch[1], 10);

      if (!result.advalorem && result.advalorem !== 0) result.raw = true;

      result.url = url;
      return result;
    } catch (e) {
      return { hs: clean, error: e.message, url };
    }
  },
};
