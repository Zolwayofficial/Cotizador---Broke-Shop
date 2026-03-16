// server/tracking.js — Seguimiento de embarques
// Usa APIs públicas y gratuitas para tracking
const https = require("https");

const CACHE = {};
const CACHE_TTL = 3600000; // 1 hour
const CACHE_MAX = 200;

function pruneTrackingCache() {
  const keys = Object.keys(CACHE);
  if (keys.length <= CACHE_MAX) return;
  const now = Date.now();
  for (const k of keys) { if (now - CACHE[k].ts > CACHE_TTL) delete CACHE[k]; }
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000, headers: { "User-Agent": "CotizadorPeru/2.0" } }, res => {
      const c = []; res.on("data", d => c.push(d));
      res.on("end", () => { try { resolve(JSON.parse(Buffer.concat(c).toString())); } catch { resolve(null); } });
    }).on("error", reject);
  });
}

// Detect carrier from tracking number format
function detectCarrier(trackingNumber) {
  const tn = (trackingNumber || "").trim().toUpperCase();
  // DHL
  if (/^\d{10,11}$/.test(tn)) return { carrier: "dhl", name: "DHL Express" };
  // FedEx
  if (/^\d{12,22}$/.test(tn) && tn.length >= 12) return { carrier: "fedex", name: "FedEx" };
  // UPS
  if (/^1Z/.test(tn)) return { carrier: "ups", name: "UPS" };
  // USPS
  if (/^(94|93|92|91|90|9[2-5]\d{2})/.test(tn) && tn.length >= 20) return { carrier: "usps", name: "USPS" };
  // Maersk container (MAEU, MSKU, etc.)
  if (/^(MAEU|MSKU|MRKU|MRSU)\d{7}$/.test(tn)) return { carrier: "maersk", name: "Maersk" };
  // MSC
  if (/^MSCU\d{7}$/.test(tn)) return { carrier: "msc", name: "MSC" };
  // Hapag Lloyd
  if (/^HLCU\d{7}$/.test(tn)) return { carrier: "hapag", name: "Hapag-Lloyd" };
  // CMA CGM
  if (/^(CMAU|CGMU)\d{7}$/.test(tn)) return { carrier: "cmacgm", name: "CMA CGM" };
  // Evergreen
  if (/^EGLV\d{7}$/.test(tn)) return { carrier: "evergreen", name: "Evergreen" };
  // Generic container (4 letters + 7 digits)
  if (/^[A-Z]{4}\d{7}$/.test(tn)) return { carrier: "container", name: "Container shipment" };
  // Amazon / China sellers
  if (/^(SF|YT|LP|LB)\d+/.test(tn)) return { carrier: "china_post", name: "China Post/SF Express" };

  return { carrier: "unknown", name: "Transportista no identificado" };
}

// Generate tracking URLs for known carriers
function getTrackingUrls(trackingNumber) {
  const tn = encodeURIComponent(trackingNumber.trim());
  const carrier = detectCarrier(trackingNumber);
  const urls = {
    // Universal trackers
    "17track": `https://t.17track.net/en#nums=${tn}`,
    "aftership": `https://track.aftership.com/${tn}`,
    // Carrier-specific
    dhl: `https://www.dhl.com/pe-es/home/tracking.html?tracking-id=${tn}`,
    fedex: `https://www.fedex.com/fedextrack/?trknbr=${tn}`,
    ups: `https://www.ups.com/track?tracknum=${tn}`,
    maersk: `https://www.maersk.com/tracking/${tn}`,
    msc: `https://www.msc.com/track-a-shipment?query=${tn}`,
    hapag: `https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html?blno=${tn}`,
    cmacgm: `https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=ContainerNumber&Reference=${tn}`,
    serpost: `https://tracking.serpost.com.pe/InquiryTrackEn?tracking=${tn}`,
    olva: `https://www.olvacourier.com/tracking.php`,
  };
  return { carrier, urls, recommended: urls["17track"] };
}

// Try to get tracking info via 17track free tier (if API key available)
async function track17(trackingNumber) {
  const key = process.env.TRACK17_API_KEY;
  if (!key) return null;

  const cacheKey = trackingNumber.trim().toUpperCase();
  if (CACHE[cacheKey] && Date.now() - CACHE[cacheKey].ts < CACHE_TTL) return CACHE[cacheKey].data;

  try {
    // 17track register endpoint
    const registerResp = await new Promise((resolve, reject) => {
      const data = JSON.stringify([{ number: trackingNumber }]);
      const req = https.request({
        hostname: "api.17track.net", path: "/track/v2.2/register",
        method: "POST",
        headers: { "Content-Type": "application/json", "17token": key, "Content-Length": Buffer.byteLength(data) },
        timeout: 10000,
      }, res => {
        const c = []; res.on("data", d => c.push(d));
        res.on("end", () => { try { resolve(JSON.parse(Buffer.concat(c).toString())); } catch { resolve(null); } });
      });
      req.on("error", reject);
      req.write(data);
      req.end();
    });

    // Wait a moment then get status
    await new Promise(r => setTimeout(r, 2000));

    const statusResp = await new Promise((resolve, reject) => {
      const data = JSON.stringify([{ number: trackingNumber }]);
      const req = https.request({
        hostname: "api.17track.net", path: "/track/v2.2/gettrackinfo",
        method: "POST",
        headers: { "Content-Type": "application/json", "17token": key, "Content-Length": Buffer.byteLength(data) },
        timeout: 10000,
      }, res => {
        const c = []; res.on("data", d => c.push(d));
        res.on("end", () => { try { resolve(JSON.parse(Buffer.concat(c).toString())); } catch { resolve(null); } });
      });
      req.on("error", reject);
      req.write(data);
      req.end();
    });

    if (statusResp?.data?.accepted?.[0]) {
      const info = statusResp.data.accepted[0];
      const result = {
        trackingNumber,
        carrier: info.carrier,
        status: info.track_info?.latest_status || "unknown",
        lastEvent: info.track_info?.latest_event || null,
        events: (info.track_info?.tracking?.providers?.[0]?.events || []).map(e => ({
          date: e.time_iso,
          location: e.location,
          description: e.description,
          status: e.status,
        })),
        estimatedDelivery: info.track_info?.time_metrics?.estimated_delivery_date || null,
      };
      CACHE[cacheKey] = { data: result, ts: Date.now() };
      pruneTrackingCache();
      return result;
    }
    return null;
  } catch (e) {
    console.error(`[TRACKING] 17track error: ${e.message}`);
    return null;
  }
}

// Main function
async function rastrear(trackingNumber) {
  const carrier = detectCarrier(trackingNumber);
  const urls = getTrackingUrls(trackingNumber);

  // Try 17track API if available
  const apiResult = await track17(trackingNumber);

  return {
    trackingNumber: trackingNumber.trim(),
    carrier,
    urls: urls.urls,
    recommended: urls.recommended,
    tracking: apiResult || null,
    mensaje: apiResult
      ? `📦 Estado: ${apiResult.status}`
      : `Tracking disponible en los links. Recomendado: 17track`,
  };
}

module.exports = { rastrear, detectCarrier, getTrackingUrls };
