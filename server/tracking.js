// server/tracking.js - Seguimiento de embarques
// Usa APIs publicas y gratuitas para tracking cuando estan configuradas.
const https = require('https');

const CACHE = {};
const CACHE_TTL = 3600000; // 1 hour
const CACHE_MAX = 200;

function normalizeTrackingNumber(trackingNumber) {
  return String(trackingNumber || '').trim();
}

function pruneTrackingCache() {
  const now = Date.now();
  const keys = Object.keys(CACHE);

  // Primero eliminar expirados.
  for (const key of keys) {
    if (now - CACHE[key].ts > CACHE_TTL) {
      delete CACHE[key];
    }
  }

  // Si aun excede el maximo, eliminar los mas antiguos.
  const remaining = Object.entries(CACHE).sort((a, b) => a[1].ts - b[1].ts);
  while (remaining.length > CACHE_MAX) {
    const oldest = remaining.shift();
    if (!oldest) break;
    delete CACHE[oldest[0]];
  }
}

// Limpieza automatica cada hora.
const trackingCacheCleanupInterval = setInterval(() => {
  const before = Object.keys(CACHE).length;
  pruneTrackingCache();
  const after = Object.keys(CACHE).length;
  if (before > after) {
    console.log(`[TRACKING] Limpieza: ${before - after} entradas eliminadas, ${after} restantes`);
  }
}, 3600000);

trackingCacheCleanupInterval.unref?.();

function detectCarrier(trackingNumber) {
  const tn = normalizeTrackingNumber(trackingNumber).toUpperCase();

  if (/^\d{10,11}$/.test(tn)) return { carrier: 'dhl', name: 'DHL Express' };
  if (/^\d{12,22}$/.test(tn) && tn.length >= 12) return { carrier: 'fedex', name: 'FedEx' };
  if (/^1Z/.test(tn)) return { carrier: 'ups', name: 'UPS' };
  if (/^(94|93|92|91|90|9[2-5]\d{2})/.test(tn) && tn.length >= 20) return { carrier: 'usps', name: 'USPS' };
  if (/^(MAEU|MSKU|MRKU|MRSU)\d{7}$/.test(tn)) return { carrier: 'maersk', name: 'Maersk' };
  if (/^MSCU\d{7}$/.test(tn)) return { carrier: 'msc', name: 'MSC' };
  if (/^HLCU\d{7}$/.test(tn)) return { carrier: 'hapag', name: 'Hapag-Lloyd' };
  if (/^(CMAU|CGMU)\d{7}$/.test(tn)) return { carrier: 'cmacgm', name: 'CMA CGM' };
  if (/^EGLV\d{7}$/.test(tn)) return { carrier: 'evergreen', name: 'Evergreen' };
  if (/^[A-Z]{4}\d{7}$/.test(tn)) return { carrier: 'container', name: 'Container shipment' };
  if (/^(SF|YT|LP|LB)\d+/.test(tn)) return { carrier: 'china_post', name: 'China Post/SF Express' };

  return { carrier: 'unknown', name: 'Transportista no identificado' };
}

function getTrackingUrls(trackingNumber) {
  const tn = encodeURIComponent(normalizeTrackingNumber(trackingNumber));
  const carrier = detectCarrier(trackingNumber);
  const urls = {
    '17track': `https://t.17track.net/en#nums=${tn}`,
    aftership: `https://track.aftership.com/${tn}`,
    dhl: `https://www.dhl.com/pe-es/home/tracking.html?tracking-id=${tn}`,
    fedex: `https://www.fedex.com/fedextrack/?trknbr=${tn}`,
    ups: `https://www.ups.com/track?tracknum=${tn}`,
    maersk: `https://www.maersk.com/tracking/${tn}`,
    msc: `https://www.msc.com/track-a-shipment?query=${tn}`,
    hapag: `https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html?blno=${tn}`,
    cmacgm: `https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=ContainerNumber&Reference=${tn}`,
    serpost: `https://tracking.serpost.com.pe/InquiryTrackEn?tracking=${tn}`,
    olva: 'https://www.olvacourier.com/tracking.php',
  };
  return { carrier, urls, recommended: urls['17track'] };
}

async function track17(trackingNumber) {
  const key = process.env.TRACK17_API_KEY;
  if (!key) return null;

  const cacheKey = normalizeTrackingNumber(trackingNumber).toUpperCase();
  if (CACHE[cacheKey] && Date.now() - CACHE[cacheKey].ts < CACHE_TTL) {
    return CACHE[cacheKey].data;
  }

  try {
    await new Promise((resolve, reject) => {
      const data = JSON.stringify([{ number: trackingNumber }]);
      const req = https.request({
        hostname: 'api.17track.net',
        path: '/track/v2.2/register',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          '17token': key,
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: 10000,
      }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()));
          } catch {
            resolve(null);
          }
        });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const statusResp = await new Promise((resolve, reject) => {
      const data = JSON.stringify([{ number: trackingNumber }]);
      const req = https.request({
        hostname: 'api.17track.net',
        path: '/track/v2.2/gettrackinfo',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          '17token': key,
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: 10000,
      }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()));
          } catch {
            resolve(null);
          }
        });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });

    if (statusResp?.data?.accepted?.[0]) {
      const info = statusResp.data.accepted[0];
      const result = {
        trackingNumber,
        carrier: info.carrier,
        status: info.track_info?.latest_status || 'unknown',
        lastEvent: info.track_info?.latest_event || null,
        events: (info.track_info?.tracking?.providers?.[0]?.events || []).map((event) => ({
          date: event.time_iso,
          location: event.location,
          description: event.description,
          status: event.status,
        })),
        estimatedDelivery: info.track_info?.time_metrics?.estimated_delivery_date || null,
      };
      CACHE[cacheKey] = { data: result, ts: Date.now() };
      pruneTrackingCache();
      return result;
    }

    return null;
  } catch (error) {
    console.error(`[TRACKING] 17track error: ${error.message}`);
    return null;
  }
}

async function rastrear(trackingNumber) {
  const normalized = normalizeTrackingNumber(trackingNumber);
  const carrier = detectCarrier(normalized);
  const urls = getTrackingUrls(normalized);
  const apiResult = await track17(normalized);

  return {
    trackingNumber: normalized,
    carrier,
    urls: urls.urls,
    recommended: urls.recommended,
    tracking: apiResult || null,
    mensaje: apiResult
      ? `Estado reportado: ${apiResult.status}`
      : 'Tracking disponible en los links. Recomendado: 17track',
  };
}

module.exports = {
  rastrear,
  detectCarrier,
  getTrackingUrls,
};
