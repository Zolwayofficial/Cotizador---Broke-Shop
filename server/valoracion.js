// server/valoracion.js - Modulo de duda razonable / verificacion de precios
// Consulta estadisticas de importacion de Aduanet para detectar riesgo de observacion SUNAT.
// Usa la data publica por subpartida y pais para estimar si el precio declarado esta fuera de rango.

const http = require('http');
const iconv = require('iconv-lite');
const autoRepair = require('./auto-repair');

const STATS_URL = 'http://www.aduanet.gob.pe/cl-ad-itestadispartida/resumenPPaisS01Alias';
const _cache = {};
const CACHE_TTL = 86400000;

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http
      .get(
        url,
        {
          timeout: 30000,
          headers: { 'User-Agent': 'ImportAIAgentCotizador/1.0' },
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        },
      )
      .on('error', reject);
  });
}

function normalizeCountryLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function parseEstadisticas(htmlBuffer) {
  const html = iconv.decode(htmlBuffer, 'latin1');
  const results = [];
  const diagnostics = { ok: true, warnings: [] };

  if (html.length < 500) {
    diagnostics.ok = false;
    diagnostics.warnings.push('Response too short - Aduanet may be down');
    return { paises: [], total: null, diagnostics };
  }

  if (!html.includes('SUNAT') && !html.includes('Aduanet') && !html.includes('subpartida')) {
    diagnostics.ok = false;
    diagnostics.warnings.push('Response does not look like an Aduanet page - possible redirect or block');
    return { paises: [], total: null, diagnostics };
  }

  const hasTable = html.includes('<table') || html.includes('<TABLE');
  const hasTdTags = (html.match(/<td/gi) || []).length;
  if (!hasTable || hasTdTags < 5) {
    diagnostics.ok = false;
    diagnostics.warnings.push(
      `HTML structure changed: ${hasTable ? 'has' : 'no'} <table>, ${hasTdTags} <td> tags. Parser may need update.`,
    );
    return { paises: [], total: null, diagnostics };
  }

  const rowRegex =
    /<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/gi;

  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const pais = match[1].replace(/<[^>]+>/g, '').trim();
    const fob = parseFloat(match[2].replace(/<[^>]+>/g, '').replace(/,/g, '').trim()) || 0;
    const cif = parseFloat(match[3].replace(/<[^>]+>/g, '').replace(/,/g, '').trim()) || 0;
    const pesoNeto = parseFloat(match[4].replace(/<[^>]+>/g, '').replace(/,/g, '').trim()) || 0;
    const normalizedPais = normalizeCountryLabel(pais);

    if (pais && fob > 0 && normalizedPais !== 'PAIS' && normalizedPais !== 'TOTAL') {
      results.push({ pais, fob, cif, pesoNeto, fobPorKg: pesoNeto > 0 ? fob / pesoNeto : 0 });
    }
  }

  if (results.length === 0) {
    diagnostics.warnings.push('Primary parser found 0 rows - trying fallback parser');
    const rows = html.split(/<tr/gi).slice(1);
    for (const row of rows) {
      const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
      if (!cells || cells.length < 4) continue;

      const values = cells.map((cell) => cell.replace(/<[^>]+>/g, '').replace(/,/g, '').trim());
      const pais = values[0];
      const nums = values.slice(1).map((value) => parseFloat(value) || 0);
      const normalizedPais = normalizeCountryLabel(pais);

      if (pais && nums[0] > 0 && normalizedPais !== 'PAIS' && normalizedPais !== 'TOTAL') {
        results.push({
          pais,
          fob: nums[0],
          cif: nums[1] || 0,
          pesoNeto: nums[2] || 0,
          fobPorKg: nums[2] > 0 ? nums[0] / nums[2] : 0,
        });
      }
    }

    if (results.length > 0) {
      diagnostics.warnings.push(`Fallback parser found ${results.length} rows`);
    }
  }

  if (results.length > 0) {
    const avgFob = results.reduce((sum, row) => sum + row.fob, 0) / results.length;
    if (avgFob > 1e12) {
      diagnostics.warnings.push('FOB values seem unrealistically high - possible parsing error');
    }
    if (results.some((row) => row.fob < 0)) {
      diagnostics.warnings.push('Negative FOB values detected');
    }
  }

  const totalMatch = html.match(
    /TOTAL[\s\S]*?<td[^>]*>([\d,.]+)<\/td>[\s\S]*?<td[^>]*>([\d,.]+)<\/td>[\s\S]*?<td[^>]*>([\d,.]+)<\/td>/i,
  );
  let total = null;
  if (totalMatch) {
    const fob = parseFloat(totalMatch[1].replace(/,/g, '')) || 0;
    const cif = parseFloat(totalMatch[2].replace(/,/g, '')) || 0;
    const peso = parseFloat(totalMatch[3].replace(/,/g, '')) || 0;
    if (fob > 0) {
      total = { fob, cif, pesoNeto: peso, fobPorKg: peso > 0 ? fob / peso : 0 };
    }
  }

  if (results.length === 0 && !total) {
    diagnostics.ok = false;
    diagnostics.warnings.push('No data could be extracted. Aduanet HTML structure may have changed.');
  }

  return { paises: results, total, diagnostics };
}

const _scrapeHealth = { lastSuccess: null, lastFail: null, failCount: 0, lastDiagnostics: null };

async function getEstadisticas(hs, year, country) {
  return autoRepair.ejecutarConAutoReparacion(
    'valoracion',
    async () => {
      const clean = hs.replace(/\./g, '').padEnd(10, '0');
      const yr = year || new Date().getFullYear();
      const cacheKey = `${clean}:${yr}`;
      const cached = _cache[cacheKey];

      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        return { ...cached.data, fromCache: true };
      }

      try {
        const url = `${STATS_URL}?accion=cargarFrmResumenPPais&FPais=1&ano=${yr}&codPartida=${clean}&CG_cadu=0&codus=0`;
        const buffer = await httpGet(url);
        const parsed = parseEstadisticas(buffer);

        _scrapeHealth.lastDiagnostics = parsed.diagnostics;

        if (!parsed.diagnostics.ok) {
          _scrapeHealth.failCount += 1;
          _scrapeHealth.lastFail = new Date().toISOString();
          console.warn(`[VALORACION] Scrape failed for ${clean}: ${parsed.diagnostics.warnings.join('; ')}`);

          if (cached) {
            console.warn('[VALORACION] Using cached data as fallback');
            return {
              ...cached.data,
              fromCache: true,
              scrapeFailed: true,
              warnings: parsed.diagnostics.warnings,
            };
          }

          return {
            hs: clean,
            year: yr,
            paises: [],
            total: null,
            error: 'Scraping failed',
            warnings: parsed.diagnostics.warnings,
          };
        }

        _scrapeHealth.lastSuccess = new Date().toISOString();
        _scrapeHealth.failCount = 0;

        const result = {
          hs: clean,
          year: yr,
          paises: parsed.paises,
          total: parsed.total,
          source: 'aduanet-live',
          fetchDate: new Date().toISOString(),
          warnings: parsed.diagnostics.warnings.length > 0 ? parsed.diagnostics.warnings : undefined,
        };

        _cache[cacheKey] = { data: result, ts: Date.now() };
        return result;
      } catch (error) {
        _scrapeHealth.failCount += 1;
        _scrapeHealth.lastFail = new Date().toISOString();
        console.error(`[VALORACION] Error for ${clean}: ${error.message}`);

        if (cached) return { ...cached.data, fromCache: true, stale: true };
        return { hs: clean, year: yr, paises: [], total: null, error: error.message };
      }
    },
    { hs, year, country },
  );
}

function getScrapeHealth() {
  return {
    ..._scrapeHealth,
    status: _scrapeHealth.failCount === 0 ? 'healthy' : _scrapeHealth.failCount < 3 ? 'degraded' : 'broken',
    cacheEntries: Object.keys(_cache).length,
  };
}

function analizarDudaRazonable(precioFobUnitario, pesoKg, estadisticas, paisOrigen) {
  const result = {
    riesgo: 'desconocido',
    color: 'gray',
    mensaje: '',
    detalle: [],
    recomendaciones: [],
    referencia: null,
  };

  if (!estadisticas || !estadisticas.total) {
    result.mensaje = 'No hay datos de referencia disponibles para esta subpartida.';
    result.recomendaciones.push('Verificar manualmente en Aduanet: Estadisticas -> Acumulado Subpartida/Pais');
    return result;
  }

  const totalStats = estadisticas.total;
  const fobPorKgRef = totalStats.fobPorKg;
  const paisStats = paisOrigen
    ? estadisticas.paises.find((row) => row.pais.toUpperCase().includes(paisOrigen.toUpperCase()))
    : null;
  const fobPorKgPais = paisStats?.fobPorKg || fobPorKgRef;
  const fobPorKgUser = pesoKg > 0 ? precioFobUnitario / pesoKg : 0;

  result.referencia = {
    fobPorKgPromedio: fobPorKgRef,
    fobPorKgPais,
    fobTotalAnual: totalStats.fob,
    cifTotalAnual: totalStats.cif,
    pesoTotalAnual: totalStats.pesoNeto,
    paisData: paisStats,
  };

  if (fobPorKgUser <= 0 || fobPorKgRef <= 0) {
    result.riesgo = 'desconocido';
    result.color = 'gray';
    result.mensaje = 'No se puede comparar sin datos de peso. Ingresa el peso del producto.';
    return result;
  }

  const refPrice = fobPorKgPais > 0 ? fobPorKgPais : fobPorKgRef;
  const deviation = ((fobPorKgUser - refPrice) / refPrice) * 100;

  result.detalle.push(`Tu FOB/kg: $${fobPorKgUser.toFixed(2)}`);
  result.detalle.push(`Promedio SUNAT${paisStats ? ` (${paisStats.pais})` : ''}: $${refPrice.toFixed(2)}/kg`);
  result.detalle.push(`Desviacion: ${deviation > 0 ? '+' : ''}${deviation.toFixed(1)}%`);

  if (deviation >= -15) {
    result.riesgo = 'bajo';
    result.color = 'green';
    result.mensaje = 'Precio dentro del rango normal. Riesgo bajo de duda razonable.';
  } else if (deviation >= -30) {
    result.riesgo = 'medio';
    result.color = 'yellow';
    result.mensaje = `Tu precio esta ${Math.abs(deviation).toFixed(0)}% por debajo del promedio SUNAT. Posible observacion.`;
    result.recomendaciones.push(
      'Prepara documentacion que justifique el precio: contrato, cotizaciones comparativas, lista de precios del proveedor',
    );
    result.recomendaciones.push('Considera incluir una carta del proveedor explicando descuentos o condiciones especiales');
  } else if (deviation >= -50) {
    result.riesgo = 'alto';
    result.color = 'orange';
    result.mensaje = `Tu precio esta ${Math.abs(deviation).toFixed(0)}% por debajo del promedio SUNAT. Alta probabilidad de duda razonable.`;
    result.recomendaciones.push('SUNAT muy probablemente generara una Notificacion de Valor OMC');
    result.recomendaciones.push('Deberas constituir garantia (deposito) por la diferencia de tributos');
    result.recomendaciones.push(
      'Prepara: contrato de compraventa, estados de cuenta bancarios, cotizaciones de otros proveedores, lista de precios',
    );
    result.recomendaciones.push('Plazo para responder duda razonable: 5 dias habiles (prorrogable a 10)');
  } else {
    result.riesgo = 'critico';
    result.color = 'red';
    result.mensaje = `Tu precio esta ${Math.abs(deviation).toFixed(0)}% por debajo del promedio SUNAT. Duda razonable casi segura.`;
    result.recomendaciones.push('SUNAT tiene muy alta probabilidad de generar una Notificacion de Valor OMC');
    result.recomendaciones.push('Es muy probable que se exija garantia antes del levante de la mercancia');
    result.recomendaciones.push(
      'Si no desvirtuas la duda, SUNAT aplicara el 2do o 3er metodo de valoracion (precios de mercancias identicas/similares)',
    );
    result.recomendaciones.push('Consulta con un especialista en valoracion aduanera antes de embarcar');
    result.recomendaciones.push('Considera negociar un precio mayor con tu proveedor para evitar observaciones');
  }

  if (deviation < -15) {
    result.detalle.push(
      `Garantia estimada: $${(Math.abs(refPrice - fobPorKgUser) * (pesoKg || 1) * 0.18).toFixed(2)} (18% sobre diferencia x peso)`,
    );
    result.detalle.push('Base legal: D.S. 186-99-EF, Procedimiento DESPA-PE.01.10a');
  }

  return result;
}

module.exports = {
  getEstadisticas,
  analizarDudaRazonable,
  getScrapeHealth,
};
