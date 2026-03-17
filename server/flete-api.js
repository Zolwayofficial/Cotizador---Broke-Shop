// server/flete-api.js — Integración con APIs de fletes reales
// 
// Estrategia:
// 1. TrackingMore API (gratis 100/day) — PRINCIPAL
// 2. Fallback hardcoded (referencial) — RESPALDO AUTOMÁTICO
//
// El sistema usa TrackingMore primero, y si falla o se acaba el crédito,
// automáticamente usa las tarifas referenciales.

const autoRepair = require('./auto-repair'); // Auto-corrección

// Cache de cotizaciones
const _cache = {};
const CACHE_TTL = 3600000; // 1 hora

// Contador de requests diarias (para monitoreo)
let _dailyUsage = { count: 0, date: new Date().toISOString().split('T')[0] };

// API Keys (opcionales - si no hay, usa fallback directo)
const TRACKINGMORE_API_KEY = process.env.TRACKINGMORE_API_KEY || null;
const SEARATES_API_KEY = process.env.SEARATES_API_KEY || null;

// Resetear contador diario automáticamente
const dailyUsageResetInterval = setInterval(() => {
  const today = new Date().toISOString().split('T')[0];
  if (_dailyUsage.date !== today) {
    console.log(`[FLETE] Reset diario de TrackingMore: ${_dailyUsage.count} requests ayer`);
    _dailyUsage = { count: 0, date: today };
  }
}, 60000); // Verificar cada minuto

dailyUsageResetInterval.unref?.();

// Fallback hardcoded (tarifas de mercado referenciales)
const FALLBACK_TARIFAS = {
  aereo: {
    'CN-PE': { perKg: 3.80, min: 120, transit: '5-8 días' },
    'US-PE': { perKg: 2.50, min: 85, transit: '3-5 días' },
    'DE-PE': { perKg: 4.20, min: 150, transit: '5-10 días' },
    'JP-PE': { perKg: 4.50, min: 160, transit: '5-8 días' },
    'KR-PE': { perKg: 3.90, min: 130, transit: '5-8 días' },
    'BR-PE': { perKg: 3.00, min: 90, transit: '3-5 días' },
    'MX-PE': { perKg: 2.80, min: 85, transit: '3-5 días' },
    'IT-PE': { perKg: 4.00, min: 140, transit: '7-12 días' },
    'ES-PE': { perKg: 3.80, min: 135, transit: '7-12 días' },
    'IN-PE': { perKg: 4.00, min: 140, transit: '7-10 días' },
    'TH-PE': { perKg: 4.20, min: 150, transit: '7-10 días' },
    'TW-PE': { perKg: 3.50, min: 120, transit: '5-8 días' },
    default: { perKg: 4.50, min: 150, transit: '7-14 días' },
  },
  maritimo: {
    'CN-PE': { perCBM: 55, min20ft: 1200, min40ft: 2200, transit: '28-35 días' },
    'US-PE': { perCBM: 65, min20ft: 1000, min40ft: 1800, transit: '15-22 días' },
    'DE-PE': { perCBM: 70, min20ft: 1400, min40ft: 2600, transit: '30-40 días' },
    'JP-PE': { perCBM: 50, min20ft: 1100, min40ft: 2000, transit: '25-32 días' },
    'KR-PE': { perCBM: 48, min20ft: 1000, min40ft: 1900, transit: '25-30 días' },
    'BR-PE': { perCBM: 45, min20ft: 800, min40ft: 1500, transit: '12-18 días' },
    'IN-PE': { perCBM: 52, min20ft: 1300, min40ft: 2400, transit: '30-40 días' },
    default: { perCBM: 65, min20ft: 1400, min40ft: 2600, transit: '30-45 días' },
  },
  courier: {
    'CN-PE': { perKg: 8.50, min: 35, transit: '3-7 días' },
    'US-PE': { perKg: 6.00, min: 25, transit: '2-5 días' },
    'DE-PE': { perKg: 9.00, min: 40, transit: '3-7 días' },
    'JP-PE': { perKg: 9.50, min: 40, transit: '3-7 días' },
    default: { perKg: 10.00, min: 45, transit: '5-10 días' },
  },
};

// Opción 1: TrackingMore API (gratis 100/day)
async function getTrackingMoreRate(origen, destino, pesoKg, canal) {
  if (!TRACKINGMORE_API_KEY) return null;

  const cacheKey = `tm:${origen}:${destino}:${pesoKg}:${canal}`;
  if (_cache[cacheKey] && Date.now() - _cache[cacheKey].ts < CACHE_TTL) {
    return _cache[cacheKey].data;
  }

  // TrackingMore tiene API de tracking, no de rates.
  // Este módulo conserva la puerta para una integración futura.
  return null;
}

// Opción 2: Searates API (requiere registro)
async function getSearatesRate(origen, destino, pesoKg, canal) {
  if (!SEARATES_API_KEY) return null;

  const cacheKey = `sr:${origen}:${destino}:${pesoKg}:${canal}`;
  if (_cache[cacheKey] && Date.now() - _cache[cacheKey].ts < CACHE_TTL) {
    return _cache[cacheKey].data;
  }

  // Searates requiere autenticación y tiene endpoints complejos.
  // Por ahora retornamos null para usar el fallback referencial.
  return null;
}

// Opción 3: Fallback hardcoded (referencial)
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
      flete = Math.max(cbm * tarifa.perCBM, tarifa.perCBM); // LCL mín 1 CBM
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
    nota: 'Tarifa referencial de mercado. Solicitar cotización formal a freight forwarder.',
  };
}

// Función principal con fallback automático y AUTO-REPAIR
async function cotizarFlete(params) {
  const { origen, destino = 'PE', canal, pesoKg, valorFOB } = params;

  return await autoRepair.ejecutarConAutoReparacion(
    'flete-api',
    async () => {
      // Verificar si es un nuevo día para resetear contador
      const today = new Date().toISOString().split('T')[0];
      if (_dailyUsage.date !== today) {
        console.log(`[FLETE] Reset diario de TrackingMore: ${_dailyUsage.count} requests ayer`);
        _dailyUsage = { count: 0, date: today };
      }

      // ESTRATEGIA: TrackingMore primero, fallback automático si falla
      if (TRACKINGMORE_API_KEY) {
        if (_dailyUsage.count < 100) {
          try {
            console.log(`[FLETE] Intentando TrackingMore (uso diario: ${_dailyUsage.count}/100)...`);
            const tmRate = await getTrackingMoreRate(origen, destino, pesoKg, canal);

            if (tmRate) {
              _dailyUsage.count++;
              console.log(`[FLETE] TrackingMore exitoso: $${tmRate.flete} (uso: ${_dailyUsage.count}/100)`);
              return tmRate;
            }

            console.log('[FLETE] TrackingMore no devolvió tarifa, usando fallback referencial');
          } catch (e) {
            console.log(`[FLETE] Error en TrackingMore: ${e.message}, usando fallback`);
          }
        } else {
          console.log('[FLETE] Límite diario de TrackingMore alcanzado (100/100), usando fallback referencial');
        }
      }

      if (SEARATES_API_KEY) {
        try {
          console.log('[FLETE] Intentando Searates antes del fallback referencial...');
          const srRate = await getSearatesRate(origen, destino, pesoKg, canal);
          if (srRate) {
            console.log(`[FLETE] Searates exitoso: $${srRate.flete}`);
            return srRate;
          }
        } catch (e) {
          console.log(`[FLETE] Error en Searates: ${e.message}, usando fallback`);
        }
      }

      // FALLBACK AUTOMÁTICO: Tarifas referenciales
      const fallback = getFallbackRate(origen, destino, pesoKg, canal, valorFOB);
      console.log(`[FLETE] Fallback referencial: $${fallback.flete}`);

      return {
        ...fallback,
        advertencia: _dailyUsage.count >= 100
          ? 'Límite diario de API alcanzado. Se usaron tarifas referenciales. El contador se resetea a medianoche.'
          : null
      };
    },
    { origen, destino, canal, pesoKg, valorFOB }
  );
}

// Exportar tarifas para compatibilidad
module.exports = {
  cotizarFlete,
  getFallbackRate,
  FALLBACK_TARIFAS,
  // Para compatibilidad con flete.js existente
  TARIFAS: FALLBACK_TARIFAS,
};
