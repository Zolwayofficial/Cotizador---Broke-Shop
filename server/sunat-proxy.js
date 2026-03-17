const http = require('http');
const https = require('https');
const iconv = require('iconv-lite');

// Cache
let _tcCache = { data: null, ts: 0 };
let _monedasCache = { data: null, ts: 0 };
const CACHE_TTL = 3600000; // 1 hour

function fetch(url, isHttps = false) {
  const mod = isHttps ? https : http;
  return new Promise((resolve, reject) => {
    mod.get(url, { timeout: 15000, headers: { 'User-Agent': 'CotizadorPeru/2.0' } }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

module.exports = {
  // Tipo de cambio SUNAT (USD → PEN)
  async getTipoCambio() {
    if (_tcCache.data && Date.now() - _tcCache.ts < CACHE_TTL) return _tcCache.data;

    try {
      // Primary: decolecta API
      const r = await fetch('https://api.decolecta.com/v1/tipo-cambio/sunat', true);
      const json = JSON.parse(r.body.toString());
      if (json.compra && json.venta) {
        _tcCache = { data: json, ts: Date.now() };
        return json;
      }
    } catch (e) { /* primary provider fallback */ }

    try {
      // Fallback: SBS
      const r = await fetch('https://api.decolecta.com/v1/tipo-cambio/sbs/average', true);
      const json = JSON.parse(r.body.toString());
      _tcCache = { data: json, ts: Date.now() };
      return json;
    } catch (e) { /* secondary provider fallback */ }

    return { compra: 3.70, venta: 3.75, source: 'fallback' };
  },

  // Multi-moneda rates
  async getMonedas() {
    if (_monedasCache.data && Date.now() - _monedasCache.ts < CACHE_TTL) return _monedasCache.data;

    try {
      const r = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', true);
      const json = JSON.parse(r.body.toString());
      if (json.usd) {
        _monedasCache = { data: json, ts: Date.now() };
        return json;
      }
    } catch (e) { /* currency provider fallback */ }

    return { usd: {}, source: 'fallback' };
  },

  // Consulta partida en Aduanet (scrapea HTML)
  async consultaPartida(hs) {
    const clean = hs.replace(/\./g, '').padEnd(10, '0');
    const url = `http://www.aduanet.gob.pe/itarancel/arancelS01Alias?accion=buscarPartida&cod_partida=${clean}&esframe=1`;

    try {
      const r = await fetch(url);
      const html = iconv.decode(r.body, 'latin1');

      // Parse basic info from HTML (Aduanet uses frames and tables)
      const result = { hs: clean, raw: false };

      // Try to extract Ad Valorem from HTML table
      const avMatch = html.match(/Ad[\s-]*Valorem[^<]*?(\d+)%/i) || html.match(/A\/V[^<]*?(\d+)/i);
      if (avMatch) result.advalorem = parseInt(avMatch[1]);

      // Try to extract IGV
      const igvMatch = html.match(/I\.G\.V\.[^<]*?(\d+)%/i) || html.match(/IGV[^<]*?(\d+)/i);
      if (igvMatch) result.igv = parseInt(igvMatch[1]);

      // Try to extract ISC
      const iscMatch = html.match(/I\.S\.C\.[^<]*?(\d+)%/i) || html.match(/ISC[^<]*?(\d+)/i);
      if (iscMatch) result.isc = parseInt(iscMatch[1]);

      // If couldn't parse, return raw indicator
      if (!result.advalorem && result.advalorem !== 0) result.raw = true;

      result.url = url;
      return result;
    } catch (e) {
      return { hs: clean, error: e.message, url };
    }
  },
};
