const db = require('../db');
const aiProxy = require('../ai-proxy');

const ENABLE_LIVE_GROQ = process.env.NODE_ENV !== 'test' || process.env.ALLOW_LIVE_GROQ_TESTS === '1';
const HAS_GROQ = Boolean(process.env.GROQ_API_KEY) && ENABLE_LIVE_GROQ;
const MODELOS = {
  RAPIDO: process.env.GROQ_MODEL_DASHBOARD_CHAIN || 'openai/gpt-oss-20b,llama-3.3-70b-versatile,llama-3.1-8b-instant',
  SQL: process.env.GROQ_MODEL_SQL_CHAIN || 'openai/gpt-oss-120b,openai/gpt-oss-20b,llama-3.3-70b-versatile,llama-3.1-8b-instant',
};

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const COUNTRY_LABELS = {
  CN: 'China',
  US: 'Estados Unidos',
  BR: 'Brasil',
  CL: 'Chile',
  MX: 'Mexico',
  PE: 'Peru',
  CO: 'Colombia',
  AR: 'Argentina',
  JP: 'Japon',
  KR: 'Corea del Sur',
  TH: 'Tailandia',
  DE: 'Alemania',
  ES: 'Espana',
  IT: 'Italia',
};

function parseJson(value, fallback) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((toNumber(value) + Number.EPSILON) * factor) / factor;
}

function monthKey(date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}`;
}

function monthLabel(date) {
  return MONTH_LABELS[date.getMonth()];
}

function normalizeCountryCode(value) {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return 'N/D';

  const aliases = {
    CHINA: 'CN',
    USA: 'US',
    'ESTADOS UNIDOS': 'US',
    BRASIL: 'BR',
    CHILE: 'CL',
    MEXICO: 'MX',
    PERU: 'PE',
    COLOMBIA: 'CO',
    ARGENTINA: 'AR',
    JAPON: 'JP',
    COREA: 'KR',
    TAILANDIA: 'TH',
    THAILANDIA: 'TH',
    ALEMANIA: 'DE',
    ESPANA: 'ES',
    ITALIA: 'IT',
  };

  return aliases[text] || text;
}

function countryLabel(code) {
  const normalized = normalizeCountryCode(code);
  return COUNTRY_LABELS[normalized] || normalized;
}

function metricTrend(current, previous) {
  if (current > previous) return 'up';
  if (current < previous) return 'down';
  return 'stable';
}

function metricVariation(current, previous) {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }

  return round(((current - previous) / previous) * 100, 1);
}

function extractProductNames(quotation) {
  const stateProducts = Array.isArray(quotation.state?.productos) ? quotation.state.productos : [];
  const resultItems = Array.isArray(quotation.results?.items) ? quotation.results.items : [];
  const names = [
    ...stateProducts.map((item) => item.descripcion || item.producto || item.desc),
    ...resultItems.map((item) => item.desc || item.description),
  ]
    .map((name) => String(name || '').trim())
    .filter(Boolean);

  if (names.length > 0) {
    return names;
  }

  return quotation.name ? [quotation.name] : [];
}

async function callDashboardAI(messages, modelChain, options = {}) {
  const result = await aiProxy.call(messages, 'groq', modelChain, options);
  return result.text;
}

function fallbackAnalysis(hayDatos) {
  return {
    insights: hayDatos
      ? [
        'El dashboard usa cotizaciones reales guardadas.',
        'Los KPIs reflejan totales y ticket promedio calculados desde la base.',
        'La distribucion por pais y productos se basa en el historial disponible.',
      ]
      : [
        'Todavia no existen cotizaciones guardadas.',
        'Los KPIs se muestran en cero hasta tener actividad real.',
        'El chat principal es el punto de entrada para generar datos.',
      ],
    oportunidades: hayDatos
      ? [
        'Identificar los paises con mayor frecuencia para negociar mejor flete.',
        'Aprovechar los productos mas cotizados como base de catalogo.',
      ]
      : [
        'Generar una primera cotizacion guiada desde el chat.',
        'Guardar cotizaciones para empezar a construir historial operativo.',
      ],
    alerta: hayDatos
      ? 'Revisa cotizaciones sin pais o sin total para no distorsionar el analisis.'
      : 'Sin datos historicos todavia; el dashboard esta en estado vacio.',
    recomendacion: hayDatos
      ? 'Usa el historial guardado para comparar tickets y paises antes de desplegar.'
      : 'Empieza con una cotizacion real y valida el flujo completo antes de produccion.',
  };
}

function resolveDashboardScope(filtros = {}) {
  const requestedScope = String(filtros.scope || '').trim().toLowerCase();
  const isAdmin = filtros.viewerRole === 'admin';

  if (requestedScope === 'community' && isAdmin) {
    return 'community';
  }

  if (requestedScope === 'mine') {
    return 'mine';
  }

  return isAdmin ? 'community' : 'mine';
}

function dashboardScopeLabel(scope) {
  return scope === 'community' ? 'Comunidad' : 'Mi actividad';
}

class DashboardService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000;
  }

  async obtenerDatosDashboard(filtros = {}) {
    const scope = resolveDashboardScope(filtros);
    const viewerUserId = filtros.viewerUserId || null;
    const viewerRole = filtros.viewerRole || 'user';
    const cacheKey = `dashboard:${JSON.stringify({
      ...filtros,
      scope,
      viewerUserId,
      viewerRole,
    })}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    const quotations = this._obtenerCotizaciones({
      ...filtros,
      scope,
      viewerUserId,
      viewerRole,
    });
    const kpis = this._obtenerKPIs(quotations);
    const graficos = this._obtenerDatosGraficos(quotations);
    const datos = {
      meta: {
        hayDatos: quotations.length > 0,
        totalRegistros: quotations.length,
        scope,
        scopeLabel: dashboardScopeLabel(scope),
        viewerRole,
        ultimaActualizacion: new Date().toISOString(),
      },
      kpis,
      graficos,
      tendencias: this._obtenerTendencias(quotations, graficos, kpis),
      tops: this._obtenerTops(quotations),
      alertas: this._obtenerAlertas(quotations, scope),
    };

    this.cache.set(cacheKey, {
      data: datos,
      timestamp: Date.now(),
    });

    return datos;
  }

  _obtenerCotizaciones(filtros = {}) {
    const desde = filtros.desde ? new Date(filtros.desde) : null;
    const hasta = filtros.hasta ? new Date(filtros.hasta) : null;
    const paisFiltro = filtros.pais ? normalizeCountryCode(filtros.pais) : null;
    const courierFiltro = String(filtros.courier || '').trim().toUpperCase();
    const scope = resolveDashboardScope(filtros);
    const rows = scope === 'community'
      ? db.listQuotations()
      : db.listQuotations(filtros.viewerUserId);

    return rows
      .map((row) => {
        const state = parseJson(row.state_json, {});
        const results = parseJson(row.results_json, {});
        const parsedDate = new Date(row.date || row.created_at || Date.now());
        const date = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
        const channel = String(row.channel || state.channel || results.metadata?.canal || '').toUpperCase();
        const originCountry = normalizeCountryCode(
          row.origin_country || state.origin_country || results.metadata?.pais,
        );

        return {
          ...row,
          state,
          results,
          parsedDate: date,
          channel,
          originCountry,
          totalLanded: toNumber(
            row.total_landed || results.totales?.totalReal || results.totales?.totalLanded,
          ),
          productNames: extractProductNames({ ...row, state, results }),
        };
      })
      .filter((quotation) => {
        if (desde && quotation.parsedDate < desde) return false;
        if (hasta && quotation.parsedDate > hasta) return false;
        if (paisFiltro && quotation.originCountry !== paisFiltro) return false;
        if (courierFiltro && quotation.channel !== courierFiltro) return false;
        return true;
      });
  }

  _obtenerKPIs(quotations) {
    if (quotations.length === 0) {
      return {
        totalCotizaciones: { valor: 0, variacion: 0, tendencia: 'stable' },
        totalDolares: { valor: 0, variacion: 0, tendencia: 'stable', formato: 'USD' },
        ticketPromedio: { valor: 0, variacion: 0, tendencia: 'stable', formato: 'USD' },
        paisesActivos: { valor: 0, variacion: 0, tendencia: 'stable' },
      };
    }

    const now = new Date();
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const currentKey = monthKey(now);
    const previousKey = monthKey(previousMonth);
    const currentMonthQuotes = quotations.filter((quotation) => monthKey(quotation.parsedDate) === currentKey);
    const previousMonthQuotes = quotations.filter((quotation) => monthKey(quotation.parsedDate) === previousKey);

    const currentCount = currentMonthQuotes.length;
    const previousCount = previousMonthQuotes.length;
    const currentDollars = currentMonthQuotes.reduce((sum, quotation) => sum + quotation.totalLanded, 0);
    const previousDollars = previousMonthQuotes.reduce((sum, quotation) => sum + quotation.totalLanded, 0);
    const currentTicket = currentCount > 0 ? currentDollars / currentCount : 0;
    const previousTicket = previousCount > 0 ? previousDollars / previousCount : 0;

    const activeCountries = new Set(quotations.map((quotation) => quotation.originCountry).filter(Boolean));
    const previousCountries = new Set(previousMonthQuotes.map((quotation) => quotation.originCountry).filter(Boolean));

    return {
      totalCotizaciones: {
        valor: quotations.length,
        variacion: metricVariation(currentCount, previousCount),
        tendencia: metricTrend(currentCount, previousCount),
      },
      totalDolares: {
        valor: round(quotations.reduce((sum, quotation) => sum + quotation.totalLanded, 0)),
        variacion: metricVariation(currentDollars, previousDollars),
        tendencia: metricTrend(currentDollars, previousDollars),
        formato: 'USD',
      },
      ticketPromedio: {
        valor: round(quotations.reduce((sum, quotation) => sum + quotation.totalLanded, 0) / quotations.length),
        variacion: metricVariation(currentTicket, previousTicket),
        tendencia: metricTrend(currentTicket, previousTicket),
        formato: 'USD',
      },
      paisesActivos: {
        valor: activeCountries.size,
        variacion: activeCountries.size - previousCountries.size,
        tendencia: metricTrend(activeCountries.size, previousCountries.size),
      },
    };
  }

  _obtenerDatosGraficos(quotations) {
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (5 - index));
      return {
        key: monthKey(date),
        mes: monthLabel(date),
        cotizaciones: 0,
        dolares: 0,
      };
    });

    const byMonth = new Map(months.map((entry) => [entry.key, { ...entry }]));
    quotations.forEach((quotation) => {
      const key = monthKey(quotation.parsedDate);
      const current = byMonth.get(key);
      if (!current) return;

      current.cotizaciones += 1;
      current.dolares = round(current.dolares + quotation.totalLanded);
    });

    const countryDistribution = new Map();
    quotations.forEach((quotation) => {
      const label = countryLabel(quotation.originCountry);
      countryDistribution.set(label, (countryDistribution.get(label) || 0) + 1);
    });

    const productDistribution = new Map();
    quotations.forEach((quotation) => {
      quotation.productNames.forEach((name) => {
        productDistribution.set(name, (productDistribution.get(name) || 0) + 1);
      });
    });

    return {
      evolucionMensual: {
        tipo: 'line',
        titulo: 'Evolucion de cotizaciones',
        datos: Array.from(byMonth.values()),
      },
      distribucionPaises: {
        tipo: 'pie',
        titulo: 'Distribucion por pais de origen',
        datos: Array.from(countryDistribution.entries())
          .map(([pais, valor]) => ({ pais, valor }))
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 5),
      },
      topProductos: {
        tipo: 'bar',
        titulo: 'Productos mas cotizados',
        datos: Array.from(productDistribution.entries())
          .map(([producto, valor]) => ({ producto, valor }))
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 5),
      },
    };
  }

  _obtenerTendencias(quotations, graficos, kpis) {
    if (quotations.length === 0) {
      return [];
    }

    const tendencias = [];
    const topCountry = graficos.distribucionPaises.datos[0];
    if (topCountry) {
      tendencias.push({
        titulo: `${topCountry.pais} lidera el origen`,
        descripcion: `${topCountry.valor} cotizacion(es) registradas desde ese pais.`,
        impacto: 'medio',
        tipo: 'info',
      });
    }

    const topProduct = graficos.topProductos.datos[0];
    if (topProduct) {
      tendencias.push({
        titulo: `${topProduct.producto} destaca en la demanda`,
        descripcion: `${topProduct.valor} cotizacion(es) contienen ese producto.`,
        impacto: 'medio',
        tipo: 'oportunidad',
      });
    }

    if (kpis.ticketPromedio.valor > 0) {
      tendencias.push({
        titulo: 'Ticket promedio calculado',
        descripcion: `El valor promedio por cotizacion es USD ${kpis.ticketPromedio.valor.toLocaleString()}.`,
        impacto: 'bajo',
        tipo: 'info',
      });
    }

    return tendencias;
  }

  _obtenerTops(quotations) {
    const byCountry = new Map();
    const byProduct = new Map();
    const byChannel = new Map();

    quotations.forEach((quotation) => {
      const country = countryLabel(quotation.originCountry);
      byCountry.set(country, {
        pais: country,
        codigo: quotation.originCountry,
        total: round((byCountry.get(country)?.total || 0) + quotation.totalLanded),
        variacion: 0,
      });

      quotation.productNames.forEach((name) => {
        byProduct.set(name, {
          producto: name,
          total: (byProduct.get(name)?.total || 0) + 1,
          variacion: 0,
        });
      });

      const channel = quotation.channel || 'SIN_CANAL';
      byChannel.set(channel, {
        courier: channel,
        total: (byChannel.get(channel)?.total || 0) + 1,
        variacion: 0,
      });
    });

    return {
      topPaises: Array.from(byCountry.values()).sort((a, b) => b.total - a.total).slice(0, 5),
      topProductos: Array.from(byProduct.values()).sort((a, b) => b.total - a.total).slice(0, 5),
      topCouriers: Array.from(byChannel.values()).sort((a, b) => b.total - a.total).slice(0, 5),
    };
  }

  _obtenerAlertas(quotations, scope = 'mine') {
    if (quotations.length === 0) {
      return [
        {
          id: 'sin-datos',
          tipo: 'info',
          titulo: 'Sin cotizaciones guardadas',
          mensaje: scope === 'community'
            ? 'Aun no hay cotizaciones reales guardadas por la comunidad. Usa el chat para generar la primera.'
            : 'Aun no hay cotizaciones reales guardadas en tu historial. Usa el chat para generar la primera.',
          timestamp: new Date().toISOString(),
          accion: scope === 'community'
            ? 'Genera o guarda cotizaciones reales para empezar a construir el historial compartido.'
            : 'Inicia una cotizacion guiada desde la pantalla principal',
        },
      ];
    }

    const alertas = [];
    const withoutCountry = quotations.filter((quotation) => quotation.originCountry === 'N/D').length;
    const withoutTotals = quotations.filter((quotation) => quotation.totalLanded <= 0).length;

    if (withoutCountry > 0) {
      alertas.push({
        id: 'pais-faltante',
        tipo: 'alerta',
        titulo: 'Cotizaciones sin pais de origen',
        mensaje: `${withoutCountry} registro(s) necesitan pais para mejorar el analisis.`,
        timestamp: new Date().toISOString(),
        accion: 'Completa el pais al guardar nuevas cotizaciones',
      });
    }

    if (withoutTotals > 0) {
      alertas.push({
        id: 'totales-faltantes',
        tipo: 'alerta',
        titulo: 'Cotizaciones sin total calculado',
        mensaje: `${withoutTotals} registro(s) no tienen total landed guardado.`,
        timestamp: new Date().toISOString(),
        accion: 'Recalcula o vuelve a guardar la cotizacion',
      });
    }

    return alertas;
  }

  async analizarConIA(datos) {
    const hayDatos = Boolean(datos?.meta?.hayDatos);
    if (!HAS_GROQ) {
      return fallbackAnalysis(hayDatos);
    }

    try {
      const content = await callDashboardAI(
        [{
          role: 'user',
          content: [
            'Analiza estos datos de importaciones y responde en JSON con:',
            '- insights (3)',
            '- oportunidades (2)',
            '- alerta',
            '- recomendacion',
            '',
            'Datos:',
            JSON.stringify(datos, null, 2),
          ].join('\n'),
        }],
        MODELOS.RAPIDO,
        {
          response_format: { type: 'json_object' },
          max_tokens: 1000,
        }
      );

      return JSON.parse(content);
    } catch (e) {
      console.error('[DASHBOARD] Error analizando con IA:', e.message);
      return fallbackAnalysis(hayDatos);
    }
  }

  async sugerirGraficos(datos) {
    if (!HAS_GROQ) {
      return [];
    }

    try {
      const content = await callDashboardAI(
        [{
          role: 'user',
          content: [
            'Sugiere graficos utiles para este dashboard de importaciones.',
            'Responde en JSON.',
            '',
            'Datos:',
            JSON.stringify(datos, null, 2),
          ].join('\n'),
        }],
        MODELOS.RAPIDO,
        {
          response_format: { type: 'json_object' },
          max_tokens: 1200,
        }
      );

      return JSON.parse(content);
    } catch (e) {
      console.error('[DASHBOARD] Error sugiriendo graficos:', e.message);
      return [];
    }
  }

  async chatConDatos(pregunta, datos) {
    if (!HAS_GROQ) {
      if (!datos?.meta?.hayDatos) {
        return 'Todavia no hay cotizaciones reales guardadas, asi que no tengo historial para analizar.';
      }

      return 'El dashboard esta usando datos reales guardados, pero la respuesta conversacional avanzada requiere configurar GROQ_API_KEY.';
    }

    try {
      return await callDashboardAI(
        [
          {
            role: 'system',
            content: 'Eres un analista experto en importaciones peruanas. Responde con precision y brevedad.',
          },
          {
            role: 'user',
            content: `${pregunta}\n\nDatos disponibles:\n${JSON.stringify(datos, null, 2)}`,
          },
        ],
        MODELOS.RAPIDO,
        { max_tokens: 1000 }
      );
    } catch (e) {
      console.error('[DASHBOARD] Error en chat:', e.message);

      if (!datos?.meta?.hayDatos) {
        return 'Todavia no hay cotizaciones reales guardadas, asi que no tengo historial para analizar.';
      }

      return 'No pude procesar la pregunta con IA, pero el dashboard si esta alimentado con datos reales guardados.';
    }
  }

  async generarSQL(pregunta, schema) {
    if (!HAS_GROQ) {
      const tablas = Object.keys(schema?.tablas || {});
      const tabla = tablas[0];

      if (!tabla) {
        return 'SELECT 1;';
      }

      const columnas = Array.isArray(schema.tablas[tabla]) && schema.tablas[tabla].length > 0
        ? schema.tablas[tabla].join(', ')
        : '*';

      return `SELECT ${columnas} FROM ${tabla} LIMIT 10;`;
    }

    try {
      const content = await callDashboardAI(
        [{
          role: 'user',
          content: [
            'Genera una consulta SQL para esta pregunta usando este schema.',
            'Responde solo con SQL.',
            '',
            `Pregunta: ${pregunta}`,
            `Schema: ${JSON.stringify(schema, null, 2)}`,
          ].join('\n'),
        }],
        MODELOS.SQL,
        {
          max_tokens: 500,
          temperature: 0.1,
        }
      );

      return content.trim();
    } catch (e) {
      console.error('[DASHBOARD] Error generando SQL:', e.message);
      const tablas = Object.keys(schema?.tablas || {});
      const tabla = tablas[0];

      if (!tabla) {
        return 'SELECT 1;';
      }

      const columnas = Array.isArray(schema.tablas[tabla]) && schema.tablas[tabla].length > 0
        ? schema.tablas[tabla].join(', ')
        : '*';

      return `SELECT ${columnas} FROM ${tabla} LIMIT 10;`;
    }
  }

  limpiarCache() {
    this.cache.clear();
    console.log('[DASHBOARD] Cache limpiada');
  }

  obtenerEstadisticas() {
    return {
      cacheSize: this.cache.size,
      cacheTTL: this.cacheTTL,
      modelos: MODELOS,
    };
  }
}

module.exports = new DashboardService();
