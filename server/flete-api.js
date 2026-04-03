// server/flete-api.js - Integracion operativa con proveedores de flete
//
// Estrategia:
// 1. TrackingMore (cuota diaria local configurable) - PRINCIPAL
// 2. Fallback hardcoded (referencial) - RESPALDO AUTOMATICO
//
// El sistema usa TrackingMore primero, y si falla o se agota la cuota local,
// automaticamente usa las tarifas referenciales.

const autoRepair = require('./auto-repair'); // Auto-correccion

// Cache de cotizaciones
const _cache = {};
const CACHE_TTL = 3600000; // 1 hora
const DEFAULT_TRACKINGMORE_DAILY_LIMIT = 100;

// Contador de requests diarias (para monitoreo)
let _dailyUsage = { count: 0, date: new Date().toISOString().split('T')[0] };

// API Keys (opcionales - si no hay, usa fallback directo)
const TRACKINGMORE_API_KEY = process.env.TRACKINGMORE_API_KEY || null;
const SEARATES_API_KEY = process.env.SEARATES_API_KEY || null;
const TRACKINGMORE_DAILY_LIMIT = parseTrackingMoreDailyLimit(process.env.TRACKINGMORE_DAILY_LIMIT);

function parseTrackingMoreDailyLimit(rawValue, fallback = DEFAULT_TRACKINGMORE_DAILY_LIMIT) {
  const parsed = Number.parseInt(String(rawValue ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function syncDailyUsageDate() {
  const today = new Date().toISOString().split('T')[0];
  if (_dailyUsage.date !== today) {
    console.log(`[FLETE] Reset diario de TrackingMore: ${_dailyUsage.count} requests ayer`);
    _dailyUsage = { count: 0, date: today };
  }
}

function getTrackingMoreUsageState() {
  syncDailyUsageDate();
  return {
    enabled: !!TRACKINGMORE_API_KEY,
    count: _dailyUsage.count,
    date: _dailyUsage.date,
    limit: TRACKINGMORE_DAILY_LIMIT,
    nota: TRACKINGMORE_API_KEY
      ? 'Cuota diaria local de TrackingMore'
      : 'TrackingMore sin credencial configurada',
  };
}

// Resetear contador diario automaticamente
const dailyUsageResetInterval = setInterval(() => {
  syncDailyUsageDate();
}, 60000); // Verificar cada minuto

dailyUsageResetInterval.unref?.();

// Fallback hardcoded (tarifas de mercado referenciales)
const FALLBACK_TARIFAS = {
  aereo: {
    'CN-PE': { perKg: 3.80, min: 120, transit: '5-8 dias' },
    'US-PE': { perKg: 2.50, min: 85, transit: '3-5 dias' },
    'DE-PE': { perKg: 4.20, min: 150, transit: '5-10 dias' },
    'JP-PE': { perKg: 4.50, min: 160, transit: '5-8 dias' },
    'KR-PE': { perKg: 3.90, min: 130, transit: '5-8 dias' },
    'BR-PE': { perKg: 3.00, min: 90, transit: '3-5 dias' },
    'MX-PE': { perKg: 2.80, min: 85, transit: '3-5 dias' },
    'IT-PE': { perKg: 4.00, min: 140, transit: '7-12 dias' },
    'ES-PE': { perKg: 3.80, min: 135, transit: '7-12 dias' },
    'IN-PE': { perKg: 4.00, min: 140, transit: '7-10 dias' },
    'TH-PE': { perKg: 4.20, min: 150, transit: '7-10 dias' },
    'TW-PE': { perKg: 3.50, min: 120, transit: '5-8 dias' },
    default: { perKg: 4.50, min: 150, transit: '7-14 dias' },
  },
  maritimo: {
    'CN-PE': { perCBM: 55, min20ft: 1200, min40ft: 2200, transit: '28-35 dias' },
    'US-PE': { perCBM: 65, min20ft: 1000, min40ft: 1800, transit: '15-22 dias' },
    'DE-PE': { perCBM: 70, min20ft: 1400, min40ft: 2600, transit: '30-40 dias' },
    'JP-PE': { perCBM: 50, min20ft: 1100, min40ft: 2000, transit: '25-32 dias' },
    'KR-PE': { perCBM: 48, min20ft: 1000, min40ft: 1900, transit: '25-30 dias' },
    'BR-PE': { perCBM: 45, min20ft: 800, min40ft: 1500, transit: '12-18 dias' },
    'IN-PE': { perCBM: 52, min20ft: 1300, min40ft: 2400, transit: '30-40 dias' },
    default: { perCBM: 65, min20ft: 1400, min40ft: 2600, transit: '30-45 dias' },
  },
  courier: {
    'CN-PE': { perKg: 8.50, min: 35, transit: '3-7 dias' },
    'US-PE': { perKg: 6.00, min: 25, transit: '2-5 dias' },
    'DE-PE': { perKg: 9.00, min: 40, transit: '3-7 dias' },
    'JP-PE': { perKg: 9.50, min: 40, transit: '3-7 dias' },
    default: { perKg: 10.00, min: 45, transit: '5-10 dias' },
  },
};

// Opcion 1: TrackingMore (cuota diaria local configurable)
async function getTrackingMoreRate(origen, destino, pesoKg, canal) {
  if (!TRACKINGMORE_API_KEY) return null;

  const cacheKey = `tm:${origen}:${destino}:${pesoKg}:${canal}`;
  if (_cache[cacheKey] && Date.now() - _cache[cacheKey].ts < CACHE_TTL) {
    return _cache[cacheKey].data;
  }

  // TrackingMore tiene API de tracking, no de rates.
  // Este modulo conserva la puerta para una integracion futura.
  return null;
}

// Opcion 2: Searates API (requiere registro)
async function getSearatesRate(origen, destino, pesoKg, canal) {
  if (!SEARATES_API_KEY) return null;

  const cacheKey = `sr:${origen}:${destino}:${pesoKg}:${canal}`;
  if (_cache[cacheKey] && Date.now() - _cache[cacheKey].ts < CACHE_TTL) {
    return _cache[cacheKey].data;
  }

  // Searates requiere autenticacion y tiene endpoints complejos.
  // Por ahora retornamos null para usar el fallback referencial.
  return null;
}

// Opcion 3: Fallback hardcoded (referencial)
function getFallbackRate(origen, destino, pesoKg, canal, _valorFOB) {
  const ruta = `${origen}-${destino}`;

  const tarifas = canal === 'aereo' ? FALLBACK_TARIFAS.aereo :
    canal === 'maritimo' ? FALLBACK_TARIFAS.maritimo :
      FALLBACK_TARIFAS.courier;

  const tarifa = tarifas[ruta] || tarifas.default;

  let flete = 0;

  if (canal === 'aereo' || canal === 'courier') {
    flete = Math.max(pesoKg * tarifa.perKg, tarifa.min);
  } else if (canal === 'maritimo') {
    // Estimado CBM (asumiendo 1 CBM = 1000kg)
    const cbm = pesoKg / 1000;
    if (cbm < 15) {
      flete = Math.max(cbm * tarifa.perCBM, tarifa.perCBM); // LCL min 1 CBM
    } else if (cbm < 33) {
      flete = tarifa.min20ft; // 20ft FCL
    } else {
      flete = tarifa.min40ft; // 40ft FCL
    }
  }

  return {
    flete,
    tarifa,
    origen: `${origen}`,
    destino: `${destino}`,
    canal,
    pesoKg,
    transit: tarifa.transit,
    source: 'referencial',
    nota: 'Tarifa referencial de mercado. Solicitar cotizacion formal a freight forwarder.',
  };
}

// Funcion principal con fallback automatico y AUTO-REPAIR
async function cotizarFlete(params) {
  const { origen, destino = 'PE', canal, pesoKg, valorFOB } = params;

  return await autoRepair.ejecutarConAutoReparacion(
    'flete-api',
    async () => {
      // Verificar si es un nuevo dia para resetear contador
      syncDailyUsageDate();

      // ESTRATEGIA: TrackingMore primero, fallback automatico si falla
      if (TRACKINGMORE_API_KEY) {
        if (_dailyUsage.count < TRACKINGMORE_DAILY_LIMIT) {
          try {
            console.log(
              `[FLETE] Intentando TrackingMore (uso diario local: ${_dailyUsage.count}/${TRACKINGMORE_DAILY_LIMIT})...`
            );
            const tmRate = await getTrackingMoreRate(origen, destino, pesoKg, canal);

            if (tmRate) {
              _dailyUsage.count++;
              console.log(
                `[FLETE] TrackingMore devolvio una tarifa disponible: $${tmRate.flete} (uso local: ${_dailyUsage.count}/${TRACKINGMORE_DAILY_LIMIT})`
              );
              return tmRate;
            }

            console.log('[FLETE] TrackingMore no devolvio tarifa, usando fallback referencial');
          } catch (e) {
            console.log(`[FLETE] Error en TrackingMore: ${e.message}, usando fallback`);
          }
        } else {
          console.log(
            `[FLETE] Cuota diaria local de TrackingMore alcanzada (${_dailyUsage.count}/${TRACKINGMORE_DAILY_LIMIT}), usando fallback referencial`
          );
        }
      }

      if (SEARATES_API_KEY) {
        try {
          console.log('[FLETE] Intentando Searates antes del fallback referencial...');
          const srRate = await getSearatesRate(origen, destino, pesoKg, canal);
          if (srRate) {
            console.log(`[FLETE] Searates devolvio una tarifa disponible: $${srRate.flete}`);
            return srRate;
          }
        } catch (e) {
          console.log(`[FLETE] Error en Searates: ${e.message}, usando fallback`);
        }
      }

      // FALLBACK AUTOMATICO: Tarifas referenciales
      const fallback = getFallbackRate(origen, destino, pesoKg, canal, valorFOB);
      console.log(`[FLETE] Fallback referencial: $${fallback.flete}`);

      return {
        ...fallback,
        advertencia: _dailyUsage.count >= TRACKINGMORE_DAILY_LIMIT
          ? 'Cuota diaria local de TrackingMore alcanzada. Se usaron tarifas referenciales. El contador se reinicia a medianoche UTC.'
          : null,
      };
    },
    { origen, destino, canal, pesoKg, valorFOB }
  );
}

// Exportar tarifas para compatibilidad
module.exports = {
  cotizarFlete,
  getFallbackRate,
  getTrackingMoreUsageState,
  FALLBACK_TARIFAS,
  // Para compatibilidad con flete.js existente
  TARIFAS: FALLBACK_TARIFAS,
  _private: {
    parseTrackingMoreDailyLimit,
    getTrackingMoreDailyLimit: () => TRACKINGMORE_DAILY_LIMIT,
    setDailyUsageForTests(nextUsage = {}) {
      const count = Number.parseInt(String(nextUsage.count ?? 0).trim(), 10);
      _dailyUsage = {
        count: Number.isFinite(count) && count > 0 ? count : 0,
        date: typeof nextUsage.date === 'string' && nextUsage.date.trim()
          ? nextUsage.date.trim()
          : new Date().toISOString().split('T')[0],
      };
    },
  },
};
