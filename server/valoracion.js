// server/valoracion.js — Módulo de Duda Razonable / Verificación de Precios
// Consulta estadísticas de importación de Aduanet para detectar riesgo de observación SUNAT
//
// SUNAT usa el SIVEP (Sistema de Verificación de Precios) internamente.
// Nosotros usamos la data pública de estadísticas por subpartida/país para estimar
// si el precio declarado está fuera de rango.

const http = require("http");
const iconv = require("iconv-lite");
const autoRepair = require("./auto-repair"); // Auto-corrección

const STATS_URL = "http://www.aduanet.gob.pe/cl-ad-itestadispartida/resumenPPaisS01Alias";

// Cache de consultas (evita bombardear Aduanet)
const _cache = {};
const CACHE_TTL = 86400000; // 24h

function httpPost(url, formData) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(formData).toString();
    const opts = {
      method: "POST",
      hostname: "www.aduanet.gob.pe",
      path: url.replace("http://www.aduanet.gob.pe", ""),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
        "User-Agent": "CotizadorPeru/2.0",
      },
      timeout: 30000,
    };
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(body);
    req.end();
  });
}

// Fetch and GET the stats page
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, { timeout: 30000, headers: { "User-Agent": "CotizadorPeru/2.0" } }, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

// Parse HTML table from Aduanet estadísticas response
// RESILIENT: validates structure, detects changes, falls back to cache
function parseEstadisticas(htmlBuffer) {
  const html = iconv.decode(htmlBuffer, "latin1");
  const results = [];
  const diagnostics = { ok: true, warnings: [] };

  // Step 1: Verify we got a real Aduanet page (not error/redirect)
  if (html.length < 500) {
    diagnostics.ok = false;
    diagnostics.warnings.push("Response too short — Aduanet may be down");
    return { paises: [], total: null, diagnostics };
  }
  if (!html.includes("SUNAT") && !html.includes("Aduanet") && !html.includes("subpartida")) {
    diagnostics.ok = false;
    diagnostics.warnings.push("Response doesn't look like an Aduanet page — possible redirect or block");
    return { paises: [], total: null, diagnostics };
  }

  // Step 2: Fingerprint the HTML structure we expect
  const hasTable = html.includes("<table") || html.includes("<TABLE");
  const hasTdTags = (html.match(/<td/gi) || []).length;
  if (!hasTable || hasTdTags < 5) {
    diagnostics.ok = false;
    diagnostics.warnings.push(`HTML structure changed: ${hasTable ? "has" : "no"} <table>, ${hasTdTags} <td> tags. Parser may need update.`);
    return { paises: [], total: null, diagnostics };
  }

  // Step 3: Try multiple parsing strategies (resilience)
  // Strategy A: regex-based (current)
  const rowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/gi;

  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const pais = match[1].replace(/<[^>]+>/g, "").trim();
    const fob = parseFloat(match[2].replace(/<[^>]+>/g, "").replace(/,/g, "").trim()) || 0;
    const cif = parseFloat(match[3].replace(/<[^>]+>/g, "").replace(/,/g, "").trim()) || 0;
    const pesoNeto = parseFloat(match[4].replace(/<[^>]+>/g, "").replace(/,/g, "").trim()) || 0;

    if (pais && fob > 0 && pais !== "PAIS" && pais !== "TOTAL" && !pais.includes("PAÍS")) {
      results.push({ pais, fob, cif, pesoNeto, fobPorKg: pesoNeto > 0 ? fob / pesoNeto : 0 });
    }
  }

  // Strategy B: if regex found nothing, try splitting by <tr> and extracting numbers
  if (results.length === 0) {
    diagnostics.warnings.push("Primary parser found 0 rows — trying fallback parser");
    const rows = html.split(/<tr/gi).slice(1);
    for (const row of rows) {
      const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
      if (!cells || cells.length < 4) continue;
      const vals = cells.map(c => c.replace(/<[^>]+>/g, "").replace(/,/g, "").trim());
      const pais = vals[0];
      const nums = vals.slice(1).map(v => parseFloat(v) || 0);
      if (pais && nums[0] > 0 && !/PAIS|TOTAL|PAÍS/.test(pais)) {
        results.push({ pais, fob: nums[0], cif: nums[1] || 0, pesoNeto: nums[2] || 0, fobPorKg: nums[2] > 0 ? nums[0] / nums[2] : 0 });
      }
    }
    if (results.length > 0) diagnostics.warnings.push(`Fallback parser found ${results.length} rows`);
  }

  // Step 4: Validate data makes sense
  if (results.length > 0) {
    const avgFob = results.reduce((s, r) => s + r.fob, 0) / results.length;
    if (avgFob > 1e12) diagnostics.warnings.push("FOB values seem unrealistically high — possible parsing error");
    if (results.some(r => r.fob < 0)) diagnostics.warnings.push("Negative FOB values detected");
  }

  // TOTAL row
  const totalMatch = html.match(/TOTAL[\s\S]*?<td[^>]*>([\d,.]+)<\/td>[\s\S]*?<td[^>]*>([\d,.]+)<\/td>[\s\S]*?<td[^>]*>([\d,.]+)<\/td>/i);
  let total = null;
  if (totalMatch) {
    const fob = parseFloat(totalMatch[1].replace(/,/g, "")) || 0;
    const cif = parseFloat(totalMatch[2].replace(/,/g, "")) || 0;
    const peso = parseFloat(totalMatch[3].replace(/,/g, "")) || 0;
    if (fob > 0) total = { fob, cif, pesoNeto: peso, fobPorKg: peso > 0 ? fob / peso : 0 };
  }

  if (results.length === 0 && !total) {
    diagnostics.ok = false;
    diagnostics.warnings.push("No data could be extracted. Aduanet HTML structure may have changed.");
  }

  return { paises: results, total, diagnostics };
}

// Health tracking for scraping
let _scrapeHealth = { lastSuccess: null, lastFail: null, failCount: 0, lastDiagnostics: null };

// Main function: get import statistics for a subpartida (CON AUTO-REPAIR)
async function getEstadisticas(hs, year, country) {
  return await autoRepair.ejecutarConAutoReparacion(
    "valoracion",
    async () => {
      const clean = hs.replace(/\./g, "").padEnd(10, "0");
      const yr = year || new Date().getFullYear();
      const cacheKey = `${clean}:${yr}`;

      // Check cache first (always valid as fallback)
      const cached = _cache[cacheKey];
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        return { ...cached.data, fromCache: true };
      }

      try {
        const url = `${STATS_URL}?accion=cargarFrmResumenPPais&FPais=1&ano=${yr}&codPartida=${clean}&CG_cadu=0&codus=0`;
        const buf = await httpGet(url);
        const parsed = parseEstadisticas(buf);

        _scrapeHealth.lastDiagnostics = parsed.diagnostics;

        // If parsing failed but we have cache, use cache
        if (!parsed.diagnostics.ok) {
          _scrapeHealth.failCount++;
          _scrapeHealth.lastFail = new Date().toISOString();
          console.warn(`[VALORACION] Scrape failed for ${clean}: ${parsed.diagnostics.warnings.join("; ")}`);

          if (cached) {
            console.warn("[VALORACION] Using cached data as fallback");
            return { ...cached.data, fromCache: true, scrapeFailed: true, warnings: parsed.diagnostics.warnings };
          }
          return { hs: clean, year: yr, paises: [], total: null, error: "Scraping failed", warnings: parsed.diagnostics.warnings };
        }

        // Success
        _scrapeHealth.lastSuccess = new Date().toISOString();
        _scrapeHealth.failCount = 0;

        const result = {
          hs: clean, year: yr,
          paises: parsed.paises, total: parsed.total,
          source: "aduanet-live",
          fetchDate: new Date().toISOString(),
          warnings: parsed.diagnostics.warnings.length > 0 ? parsed.diagnostics.warnings : undefined,
        };

        _cache[cacheKey] = { data: result, ts: Date.now() };
        return result;
      } catch (e) {
        _scrapeHealth.failCount++;
        _scrapeHealth.lastFail = new Date().toISOString();
        console.error(`[VALORACION] Error for ${clean}: ${e.message}`);

        // Fallback to cache even if expired
        if (cached) return { ...cached.data, fromCache: true, stale: true };
        return { hs: clean, year: yr, paises: [], total: null, error: e.message };
      }
    },
    { hs, year, country }
  );
}

// Health check for monitoring
function getScrapeHealth() {
  return {
    ..._scrapeHealth,
    status: _scrapeHealth.failCount === 0 ? "healthy" : _scrapeHealth.failCount < 3 ? "degraded" : "broken",
    cacheEntries: Object.keys(_cache).length,
  };
}

// Analyze price risk: compare user's FOB vs SUNAT reference
function analizarDudaRazonable(precioFobUnitario, pesoKg, estadisticas, paisOrigen) {
  const result = {
    riesgo: "desconocido",   // bajo | medio | alto | critico | desconocido
    color: "gray",
    mensaje: "",
    detalle: [],
    recomendaciones: [],
    referencia: null,
  };

  if (!estadisticas || !estadisticas.total) {
    result.mensaje = "No hay datos de referencia disponibles para esta subpartida.";
    result.recomendaciones.push("Verificar manualmente en Aduanet: Estadísticas → Acumulado Subpartida/País");
    return result;
  }

  // Get reference price per kg from SUNAT stats
  const totalStats = estadisticas.total;
  const fobPorKgRef = totalStats.fobPorKg;

  // Find specific country stats
  const paisStats = paisOrigen
    ? estadisticas.paises.find(p => p.pais.toUpperCase().includes(paisOrigen.toUpperCase()))
    : null;

  const fobPorKgPais = paisStats?.fobPorKg || fobPorKgRef;

  // Calculate user's FOB/kg
  const fobPorKgUser = pesoKg > 0 ? precioFobUnitario / pesoKg : 0;

  result.referencia = {
    fobPorKgPromedio: fobPorKgRef,
    fobPorKgPais: fobPorKgPais,
    fobTotalAnual: totalStats.fob,
    cifTotalAnual: totalStats.cif,
    pesoTotalAnual: totalStats.pesoNeto,
    paisData: paisStats,
  };

  // If we can't compare by weight, compare raw FOB
  if (fobPorKgUser <= 0 || fobPorKgRef <= 0) {
    result.riesgo = "desconocido";
    result.color = "gray";
    result.mensaje = "No se puede comparar sin datos de peso. Ingresa el peso del producto.";
    return result;
  }

  // Calculate deviation
  const refPrice = fobPorKgPais > 0 ? fobPorKgPais : fobPorKgRef;
  const deviation = ((fobPorKgUser - refPrice) / refPrice) * 100;

  result.detalle.push(`Tu FOB/kg: $${fobPorKgUser.toFixed(2)}`);
  result.detalle.push(`Promedio SUNAT${paisStats ? ` (${paisStats.pais})` : ""}: $${refPrice.toFixed(2)}/kg`);
  result.detalle.push(`Desviación: ${deviation > 0 ? "+" : ""}${deviation.toFixed(1)}%`);

  if (deviation >= -15) {
    // Price is at or above reference — no risk
    result.riesgo = "bajo";
    result.color = "green";
    result.mensaje = "✅ Precio dentro del rango normal. Riesgo bajo de duda razonable.";
  } else if (deviation >= -30) {
    // 15-30% below reference — some risk
    result.riesgo = "medio";
    result.color = "yellow";
    result.mensaje = `⚠ Tu precio está ${Math.abs(deviation).toFixed(0)}% por debajo del promedio SUNAT. Posible observación.`;
    result.recomendaciones.push("Prepara documentación que justifique el precio: contrato, cotizaciones comparativas, lista de precios del proveedor");
    result.recomendaciones.push("Considera incluir una carta del proveedor explicando descuentos o condiciones especiales");
  } else if (deviation >= -50) {
    // 30-50% below — high risk
    result.riesgo = "alto";
    result.color = "orange";
    result.mensaje = `🔶 Tu precio está ${Math.abs(deviation).toFixed(0)}% por debajo del promedio SUNAT. Alta probabilidad de duda razonable.`;
    result.recomendaciones.push("SUNAT muy probablemente generará una Notificación de Valor OMC");
    result.recomendaciones.push("Deberás constituir garantía (depósito) por la diferencia de tributos");
    result.recomendaciones.push("Prepara: contrato de compraventa, estados de cuenta bancarios, cotizaciones de otros proveedores, lista de precios");
    result.recomendaciones.push("Plazo para responder duda razonable: 5 días hábiles (prorrogable a 10)");
  } else {
    // >50% below — critical
    result.riesgo = "critico";
    result.color = "red";
    result.mensaje = `🔴 Tu precio está ${Math.abs(deviation).toFixed(0)}% por debajo del promedio SUNAT. Duda razonable casi segura.`;
    result.recomendaciones.push("⚠ SUNAT generará Notificación de Valor OMC con certeza");
    result.recomendaciones.push("Se aplicará garantía obligatoria antes del levante de la mercancía");
    result.recomendaciones.push("Si no desvirtúas la duda, SUNAT aplicará el 2do o 3er método de valoración (precios de mercancías idénticas/similares)");
    result.recomendaciones.push("Consulta con un especialista en valoración aduanera antes de embarcar");
    result.recomendaciones.push("Considera negociar un precio mayor con tu proveedor para evitar observaciones");
  }

  // Additional context
  if (deviation < -15) {
    result.detalle.push(`Garantía estimada: $${(Math.abs(refPrice - fobPorKgUser) * (pesoKg || 1) * 0.18).toFixed(2)} (18% sobre diferencia × peso)`);
    result.detalle.push(`Base legal: D.S. 186-99-EF, Procedimiento DESPA-PE.01.10a`);
  }

  return result;
}

module.exports = {
  getEstadisticas,
  analizarDudaRazonable,
  getScrapeHealth,
};
