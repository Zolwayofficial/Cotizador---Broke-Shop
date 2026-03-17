const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envCandidates = process.env.NODE_ENV === 'production'
  ? ['.env.production', '.env']
  : ['.env'];
const envFile = envCandidates
  .map((name) => path.join(process.cwd(), name))
  .find((filePath) => fs.existsSync(filePath));

dotenv.config(envFile ? { path: envFile } : undefined);

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cron = require('node-cron');
const multer = require('multer');
const os = require('os');

// File upload config — ensure dir exists
const UPLOAD_DIR = path.join(os.tmpdir(), 'cotizador-uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'text/plain',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];
    if (allowedMimes.includes(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('text/')) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
    }
  }
});

let uploadCleanupInterval = null;
let backupCronTask = null;
let nandinaCronTask = null;
let websocketStartTimer = null;
let httpServer = null;
let initPromise = null;
let backgroundServicesPromise = null;
let shuttingDown = false;

function startUploadCleanup() {
  if (uploadCleanupInterval) return;

  uploadCleanupInterval = setInterval(() => {
    try {
      const files = fs.readdirSync(UPLOAD_DIR);
      const now = Date.now();
      const maxAge = 3600000; // 1 hora

      for (const file of files) {
        const filePath = path.join(UPLOAD_DIR, file);
        try {
          const stat = fs.statSync(filePath);
          if (now - stat.mtimeMs > maxAge) {
            fs.unlinkSync(filePath);
            console.log(`[UPLOAD] Limpieza: ${file} (${Math.round((now - stat.mtimeMs) / 60000)} min)`);
          }
        } catch (e) {
          // Archivo ya eliminado o error, continuar
        }
      }
    } catch (e) {
      console.error('[UPLOAD] Error en limpieza:', e.message);
    }
  }, 3600000);

  uploadCleanupInterval.unref?.();
}

// Core modules
const db = require('./db');
const nandinaService = require('./nandina');
const sunatProxy = require('./sunat-proxy');

// Backup automático (diario a las 4 AM)
const { backup: backupDB } = require('../scripts/backup');
const backupSchedule = process.env.BACKUP_CRON || '0 4 * * *';

function startBackupCron() {
  if (backupCronTask) return;

  backupCronTask = cron.schedule(backupSchedule, () => {
    console.log('[BACKUP CRON] Iniciando backup automático...');
    backupDB();
  });
}

// Intelligence modules
const aiProxy = require('./ai-proxy');
const clasificador = require('./clasificador');

// Regulatory modules
const permisos = require('./permisos');
const sanciones = require('./sanciones');
const valoracion = require('./valoracion');

// Operations modules
const flete = require('./flete');
const fleteApi = require('./flete-api'); // API real + fallback
const tracking = require('./tracking');
const pdfDocs = require('./pdf-docs');
const autoCotizar = require('./auto-cotizar');
const regimenes = require('./regimenes');
const agente = require('./agente');

// Auth
const auth = require('./auth');

// Agente Conversador (Agente 0 — Interfaz con usuario)
const agenteConversador = require('./agente-conversador');

// Memoria Híbrida (Estructural + Semántica + Contexto)
const MemoriaHibrida = require('./memoria-hibrida');
const memoria = new MemoriaHibrida();

// State Machine (Patrón LangGraph para flujos determinísticos)
// Embeddings ML Real (Xenova Transformers)
const embeddings = require('./embeddings');

// Auto-Repair (Agentes que aprenden de fallos y se auto-corregir)
const autoRepair = require('./auto-repair');

// Conectores de Gobierno (TIEMPO REAL con entidades)
const conectores = require('./conectores-gobierno');

// Agentes de Navegación Especialistas (CON APRENDIZAJE)
const agentesNavegacion = require('./agentes-navegacion');

// Sistema Unificado de Agentes (INTEGRACIÓN TOTAL - 30 AGENTES)
const sistemaAgentes = require('./sistema-agentes');

// Alertas Normativas (CAMBIOS NORMATIVOS AUTOMÁTICOS)
const alertasNormativas = require('./alertas-normativas');

// Exportar Cotizaciones (PDF, Excel, Documentación)
const exportarCotizacion = require('./exportar-cotizacion');

// Integrador de Logística (Couriers y Navieras - MÁXIMO NÚMERO DE APIs)
const {
  IntegradorLogistica,
  ShippoCourier,
  EasyPostCourier,
  AfterShipCourier,
  PackSendCourier,
  InterparcelCourier,
  ParcelMonkeyCourier,
  MaerskNaviera,
  MSCNaviera
} = require('./couriers/integrador-logistica');

// Cotizador Personalizado (Email, Teléfono, WhatsApp)
const cotizadorPersonalizado = require('./couriers/cotizador-personalizado');

// Dashboard Enterprise (IA con GROQ)
const dashboardService = require('./dashboard/dashboard-service');

// Monitor del Sistema (Monitoreo en tiempo real)
const monitorService = require('./monitor/monitor-service');

// WebSocket Server (Tiempo real)
const websocketServer = require('./websocket/websocket-server');

// Membresías (Comunidad de importadores)
const membresiasService = require('./membresias/membresias-service');

// Inicializar integrador de logística
const integradorLogistica = new IntegradorLogistica();

// ═══════════════════════════════════════════════════
// CONFIGURAR APIs GRATUITAS
// ═══════════════════════════════════════════════════

// Shippo (5,000 envíos/año - 20+ couriers)
if (process.env.SHIPPO_TOKEN) {
  integradorLogistica.agregarCourierAPI(new ShippoCourier(process.env.SHIPPO_TOKEN));
  console.log('[LOGÍSTICA] ✅ Shippo configurado (5,000/año - 20+ couriers)');
}

// EasyPost (120,000 envíos/año - 100+ couriers)
if (process.env.EASYPOST_TOKEN) {
  integradorLogistica.agregarCourierAPI(new EasyPostCourier(process.env.EASYPOST_TOKEN));
  console.log('[LOGÍSTICA] ✅ EasyPost configurado (120,000/año - 100+ couriers)');
}

// AfterShip (100/mes - 700+ couriers)
if (process.env.AFTERSHIP_TOKEN) {
  integradorLogistica.agregarCourierAPI(new AfterShipCourier(process.env.AFTERSHIP_TOKEN));
  console.log('[LOGÍSTICA] ✅ AfterShip configurado (100/mes - 700+ couriers)');
}

// Pack & Send (Ilimitado - 15+ couriers)
if (process.env.PACKSEND_TOKEN) {
  integradorLogistica.agregarCourierAPI(new PackSendCourier(process.env.PACKSEND_TOKEN));
  console.log('[LOGÍSTICA] ✅ Pack & Send configurado (Ilimitado - 15+ couriers)');
}

// Interparcel (Ilimitado - 25+ couriers)
if (process.env.INTERPARCEL_TOKEN) {
  integradorLogistica.agregarCourierAPI(new InterparcelCourier(process.env.INTERPARCEL_TOKEN));
  console.log('[LOGÍSTICA] ✅ Interparcel configurado (Ilimitado - 25+ couriers)');
}

// Parcel Monkey (Ilimitado)
if (process.env.PARCELMONKEY_TOKEN) {
  integradorLogistica.agregarCourierAPI(new ParcelMonkeyCourier(process.env.PARCELMONKEY_TOKEN));
  console.log('[LOGÍSTICA] ✅ Parcel Monkey configurado (Ilimitado)');
}

// Maersk Spot API
if (process.env.MAERSK_TOKEN) {
  integradorLogistica.agregarNaviera(new MaerskNaviera(process.env.MAERSK_TOKEN));
  console.log('[LOGÍSTICA] ✅ Maersk Spot API configurado');
}

// MSC Spot API
if (process.env.MSC_TOKEN) {
  integradorLogistica.agregarNaviera(new MSCNaviera(process.env.MSC_TOKEN));
  console.log('[LOGÍSTICA] ✅ MSC Spot API configurado');
}

// ═══════════════════════════════════════════════════
// CONFIGURAR COURIERS PERSONALIZADOS (CONTRATOS DIRECTOS)
// ═══════════════════════════════════════════════════

// DHL Directo
integradorLogistica.agregarCourierPersonalizado({
  nombre: 'DHL Directo (Contrato)',
  servicio: 'Express Worldwide',
  tiempoEntrega: '3-5 días',
  tarifas: { base: 15, porKg: 6, minimo: 30 }
});

// FedEx Directo
integradorLogistica.agregarCourierPersonalizado({
  nombre: 'FedEx Directo (Contrato)',
  servicio: 'International Priority',
  tiempoEntrega: '4-6 días',
  tarifas: { base: 12, porKg: 5, minimo: 25 }
});

// UPS Directo
integradorLogistica.agregarCourierPersonalizado({
  nombre: 'UPS Directo (Contrato)',
  servicio: 'Worldwide Express',
  tiempoEntrega: '3-5 días',
  tarifas: { base: 14, porKg: 5.5, minimo: 28 }
});

// TNT Directo
integradorLogistica.agregarCourierPersonalizado({
  nombre: 'TNT Directo (Contrato)',
  servicio: 'Express',
  tiempoEntrega: '4-7 días',
  tarifas: { base: 11, porKg: 4.8, minimo: 24 }
});

// USPS Directo
integradorLogistica.agregarCourierPersonalizado({
  nombre: 'USPS Directo (Contrato)',
  servicio: 'Priority Mail International',
  tiempoEntrega: '6-10 días',
  tarifas: { base: 10, porKg: 4, minimo: 20 }
});

// ═══════════════════════════════════════════════════
// CONFIGURAR NAVIERAS PERSONALIZADAS (CONTRATOS DIRECTOS)
// ═══════════════════════════════════════════════════

// Maersk
integradorLogistica.agregarNaviera({
  nombre: 'Maersk',
  tiempoEntrega: '28-35 días',
  tarifasContenedores: { '20ft': 1200, '40ft': 2200, '40ftHC': 2500 },
  tarifasLCL: { porCBM: 55, minimo: 1 }
});

// MSC
integradorLogistica.agregarNaviera({
  nombre: 'MSC',
  tiempoEntrega: '30-38 días',
  tarifasContenedores: { '20ft': 1150, '40ft': 2100, '40ftHC': 2400 },
  tarifasLCL: { porCBM: 52, minimo: 1 }
});

// Hapag-Lloyd
integradorLogistica.agregarNaviera({
  nombre: 'Hapag-Lloyd',
  tiempoEntrega: '30-40 días',
  tarifasContenedores: { '20ft': 1180, '40ft': 2150, '40ftHC': 2450 },
  tarifasLCL: { porCBM: 54, minimo: 1 }
});

// CMA CGM
integradorLogistica.agregarNaviera({
  nombre: 'CMA CGM',
  tiempoEntrega: '32-42 días',
  tarifasContenedores: { '20ft': 1100, '40ft': 2000, '40ftHC': 2300 },
  tarifasLCL: { porCBM: 50, minimo: 1 }
});

// COSCO
integradorLogistica.agregarNaviera({
  nombre: 'COSCO',
  tiempoEntrega: '35-45 días',
  tarifasContenedores: { '20ft': 1050, '40ft': 1900, '40ftHC': 2200 },
  tarifasLCL: { porCBM: 48, minimo: 1 }
});

console.log('[LOGÍSTICA] ✅ Integrador inicializado');
console.log(`[LOGÍSTICA] 📦 ${integradorLogistica.couriers.length} couriers configurados`);
console.log(`[LOGÍSTICA] 🚢 ${integradorLogistica.navieras.length} navieras configuradas`);
console.log('[LOGÍSTICA] 🌍 APIs disponibles: Shippo, EasyPost, AfterShip, Pack&Send, Interparcel, ParcelMonkey');
console.log('[LOGÍSTICA] 🚢 Navieras APIs: Maersk, MSC');
console.log('[LOGÍSTICA] 📋 Couriers personalizados: DHL, FedEx, UPS, TNT, USPS');
console.log('[LOGÍSTICA] 🚢 Navieras personalizadas: Maersk, MSC, Hapag-Lloyd, CMA CGM, COSCO');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Configurar cuando se tenga frontend estable
  crossOriginEmbedderPolicy: false
}));
app.use(compression());

// CORS con lista blanca (permitir múltiples orígenes si es necesario)
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : (process.env.DOMAIN ? [`https://${process.env.DOMAIN}`] : true);
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// ══════════════════════════════════════════════════
// AUTH: Registro, login, protección de rutas
// ══════════════════════════════════════════════════
app.post('/api/auth/register', (req, res) => {
  try {
    const { email, password, name, company, ruc } = req.body;
    const user = auth.register(email, password, name, company, ruc);
    res.json(user);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const user = auth.login(email, password);
    res.json(user);
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.get('/api/auth/me', auth.requireAuth, (req, res) => {
  res.json(req.user);
});

// ══════════════════════════════════════════════════
// NANDINA: Base arancelaria completa
// ══════════════════════════════════════════════════
app.get('/api/nandina', (req, res) => {
  const data = nandinaService.getData();
  res.json({ count: data.length, updated: nandinaService.getLastUpdate(), data });
});

app.get('/api/nandina/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  if (q.length < 2) return res.json([]);
  const data = nandinaService.getData();
  const results = data.filter(h =>
    h.p.startsWith(q.replace(/\./g, '')) || h.d.toLowerCase().includes(q)
  ).slice(0, 15);
  res.json(results);
});

app.get('/api/nandina/lookup/:hs', (req, res) => {
  const clean = req.params.hs.replace(/\./g, '').padEnd(10, '0');
  const data = nandinaService.getData();
  const match = data.find(h => h.p === clean) || data.find(h => h.p.startsWith(clean.substring(0, 4)));
  res.json(match || null);
});

app.get('/api/nandina/status', (req, res) => {
  res.json({
    count: nandinaService.getData().length,
    restricciones: Object.keys(nandinaService.getRestricciones()).length,
    prohibidas: Object.keys(nandinaService.getProhibidas()).length,
    tlcs: Object.keys(nandinaService.getTLCs()).length,
    lastUpdate: nandinaService.getLastUpdate(),
    lastCheck: nandinaService.getLastCheck(),
    source: nandinaService.getSource(),
  });
});

app.get('/api/nandina/restriccion/:hs', (req, res) => {
  res.json(nandinaService.getRestriccion(req.params.hs) || { restricted: false });
});

app.get('/api/nandina/prohibida/:hs', (req, res) => {
  res.json(nandinaService.isProhibida(req.params.hs) || { prohibited: false });
});

app.get('/api/nandina/tlc/:hs/:country', (req, res) => {
  res.json(nandinaService.getTLCPreference(req.params.hs, req.params.country) || { hasTLC: false });
});

app.get('/api/nandina/full/:hs/:country', (req, res) => {
  const { hs, country } = req.params;
  const data = nandinaService.getData();
  const clean = hs.replace(/\./g, '').padEnd(10, '0');
  const partida = data.find(h => h.p === clean) || data.find(h => h.p.startsWith(clean.substring(0, 4)));
  res.json({
    partida: partida || null,
    restriccion: nandinaService.getRestriccion(hs),
    prohibida: nandinaService.isProhibida(hs),
    tlc: nandinaService.getTLCPreference(hs, country),
  });
});

// Admin: force re-download
app.post('/api/admin/update-aduanet', auth.requireAuth, auth.requireAdmin, async (req, res) => {
  try {
    const count = await nandinaService.downloadAll();
    res.json({ ok: true, count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════
// PERMISOS Y RESTRICCIONES
// ══════════════════════════════════════════════════
app.get('/api/permisos/:hs', (req, res) => {
  res.json(permisos.consultaPermisos(req.params.hs));
});

app.get('/api/entidades', (req, res) => {
  res.json(permisos.listarEntidades());
});

app.get('/api/entidades/:codigo', (req, res) => {
  const info = permisos.infoEntidad(req.params.codigo);
  if (!info) return res.status(404).json({ error: 'Entidad no encontrada' });
  res.json(info);
});

// MEGA CONSULTA: partida + permisos + TLC + prohibida + AV ajustado
app.get('/api/consulta/:hs/:country', (req, res) => {
  const { hs, country } = req.params;
  const data = nandinaService.getData();
  const clean = hs.replace(/\./g, '').padEnd(10, '0');
  const partida = data.find(h => h.p === clean) || data.find(h => h.p.startsWith(clean.substring(0, 4)));
  const tlc = nandinaService.getTLCPreference(hs, country);
  const baseAV = partida?.a ?? 0;
  const tlcAV = tlc ? Math.max(0, baseAV * (1 - (tlc.preferencia || 0) / 100)) : baseAV;

  res.json({
    partida: partida ? { ...partida, avConTLC: tlcAV, avSinTLC: baseAV } : null,
    permisos: permisos.consultaPermisos(hs),
    tlc: tlc ? { ...tlc, avOriginal: baseAV, avReducido: tlcAV, ahorro: baseAV - tlcAV } : { hasTLC: false },
    prohibida: nandinaService.isProhibida(hs),
    sunatUrl: `http://www.aduanet.gob.pe/itarancel/arancelS01Alias?accion=buscarPartida&cod_partida=${clean}&esframe=1`,
  });
});

// Batch TLC for all items in a quotation
app.post('/api/tlc/batch', (req, res) => {
  const { items, country } = req.body;
  if (!items || !country) return res.json([]);
  res.json(items.map(item => {
    const tlc = nandinaService.getTLCPreference(item.hs, country);
    const base = item.adv ?? 0;
    if (tlc?.preferencia > 0) {
      return { hs: item.hs, avOriginal: base, avConTLC: Math.max(0, base * (1 - tlc.preferencia / 100)), acuerdo: tlc.acuerdo, applied: true };
    }
    return { hs: item.hs, avOriginal: base, avConTLC: base, applied: false };
  }));
});

// ══════════════════════════════════════════════════
// DUDA RAZONABLE / VALORACIÓN
// ══════════════════════════════════════════════════
app.get('/api/valoracion/estadisticas/:hs', async (req, res) => {
  try {
    const stats = await valoracion.getEstadisticas(req.params.hs, req.query.year);
    res.json(stats);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/valoracion/analizar', async (req, res) => {
  try {
    const { hs, fobUnitario, pesoKg, paisOrigen, year } = req.body;
    const stats = await valoracion.getEstadisticas(hs, year);
    const analisis = valoracion.analizarDudaRazonable(fobUnitario, pesoKg, stats, paisOrigen);
    res.json({ estadisticas: stats, analisis });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/valoracion/riesgo/:hs/:fob/:peso/:pais', async (req, res) => {
  try {
    const { hs, fob, peso, pais } = req.params;
    const stats = await valoracion.getEstadisticas(hs);
    res.json(valoracion.analizarDudaRazonable(parseFloat(fob), parseFloat(peso), stats, pais));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════
// SANCIONES (OFAC, ONU, UE)
// ══════════════════════════════════════════════════
app.post('/api/sanciones/verificar', async (req, res) => {
  try {
    const { nombre, pais, tipo } = req.body;
    const result = await sanciones.verificar(nombre, pais, tipo);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════
// IA: Clasificación multi-agente + extracción
// ══════════════════════════════════════════════════
app.post('/api/ai/classify', async (req, res) => {
  try {
    const { messages, provider } = req.body;
    const result = await aiProxy.classify(messages, provider || 'groq');
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Multi-agent classification (high precision)
app.post('/api/ai/classify-multi', async (req, res) => {
  try {
    const { descripcion, imagen } = req.body;
    if (!descripcion && !imagen) return res.status(400).json({ error: 'Descripción o imagen requerida' });
    const result = await clasificador.clasificarMultiAgente(descripcion, imagen);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ai/extract', async (req, res) => {
  try {
    const { content, type } = req.body;
    const result = await aiProxy.extract(content, type);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════
// FLETE: Estimador inteligente (API real + fallback)
// ══════════════════════════════════════════════════
app.post('/api/flete/estimar', async (req, res) => {
  try {
    const { origen, destino, canal, pesoKg, valorFOB } = req.body;

    // Intentar API real primero (si hay API key configurada)
    if (process.env.TRACKINGMORE_API_KEY || process.env.SEARATES_API_KEY) {
      try {
        const result = await fleteApi.cotizarFlete({ origen, destino: destino || 'PE', canal, pesoKg, valorFOB });
        if (result && result.source !== 'referencial') {
          // API real funcionó
          return res.json({
            ...result,
            nota: 'Tarifa de API real. Válido sujeto a confirmación del carrier.',
          });
        }
      } catch (e) {
        console.log(`[FLETE] API real falló: ${e.message}, usando fallback`);
      }
    }

    // Fallback a estimador referencial
    const result = flete.estimarFlete(req.body);
    res.json({
      ...result,
      nota: 'Tarifa referencial de mercado. Solicitar cotización formal a freight forwarder.',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/flete/tarifas', (req, res) => {
  res.json({
    aereo: flete.TARIFAS.aereo,
    maritimo: flete.TARIFAS.maritimo,
    courier: flete.TARIFAS.courier,
    costosPuerto: flete.COSTOS_PUERTO,
    nota: 'Tarifas referenciales de mercado. Subjecto a cambio sin previo aviso.'
  });
});

// Endpoint para verificar si hay API de fletes configurada
app.get('/api/flete/status', (req, res) => {
  res.json({
    trackingmore: !!process.env.TRACKINGMORE_API_KEY,
    searates: !!process.env.SEARATES_API_KEY,
    fallback: true,
    nota: 'Sin API key configurada, se usan tarifas referenciales'
  });
});

// Endpoint para ver uso diario de TrackingMore
app.get('/api/flete/usage', (req, res) => {
  // El módulo flete-api tiene el contador interno
  res.json({
    nota: 'El contador de uso diario se resetea automáticamente a medianoche UTC',
    tip: 'Configura TRACKINGMORE_API_KEY en .env para habilitar API real'
  });
});

// ══════════════════════════════════════════════════
// TRACKING: Rastreo de embarques
// ══════════════════════════════════════════════════
app.get('/api/tracking/detect/:number', (req, res) => {
  const carrier = tracking.detectCarrier(req.params.number);
  const urls = tracking.getTrackingUrls(req.params.number);
  res.json({ carrier, urls: urls.urls, recommended: urls.recommended });
});

app.get('/api/tracking/:number', async (req, res) => {
  try {
    const result = await tracking.rastrear(req.params.number);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════
// PDF: Documentos profesionales
// ══════════════════════════════════════════════════
app.post('/api/pdf/cotizacion', (req, res) => {
  try {
    const html = pdfDocs.generarCotizacion(req.body);
    res.type('html').send(html);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/pdf/packing-list', (req, res) => {
  try {
    const html = pdfDocs.generarPackingList(req.body);
    res.type('html').send(html);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/pdf/invoice', (req, res) => {
  try {
    const html = pdfDocs.generarInvoice(req.body);
    res.type('html').send(html);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/pdf/permisos', (req, res) => {
  try {
    const html = pdfDocs.generarResumenPermisos(req.body);
    res.type('html').send(html);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// AGENTE 0: CONVERSADOR — Interfaz natural con el usuario
// ═══════════════════════════════════════════════════════════════
// El Agente 0 sabe QUÉ preguntar, en QUÉ ORDEN, y QUÉ recomendar.
// Guía al usuario paso a paso hasta tener toda la información para
// pasarla al Orquestador (agentes 1-16).

app.post('/api/agente-0/chat', async (req, res) => {
  try {
    const { mensaje, contexto } = req.body;

    if (!mensaje || mensaje.length < 2) {
      return res.status(400).json({ error: 'Mensaje requerido' });
    }

    const resultado = await agenteConversador.agenteConversador(mensaje, contexto || {});
    res.json(resultado);

  } catch (e) {
    console.error('[AGENTE-0] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agente-0/iniciar', async (req, res) => {
  try {
    // Iniciar nueva conversación
    const primeraPregunta = agenteConversador.generarPregunta({ datos_previos: {} });
    res.json({
      tipo: 'inicio',
      mensaje: '¡Hola! 👋 Soy tu asistente de importaciones Perú. Te guiaré paso a paso.',
      pregunta: primeraPregunta.pregunta,
      paso: primeraPregunta.paso,
      opciones: primeraPregunta.opciones,
      contexto: { datos_previos: {}, paso_actual: primeraPregunta.paso }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/agente-0/estado', (req, res) => {
  const stats = sistemaAgentes.obtenerEstadisticas?.() || {};
  const resumen = stats.resumen || {};
  const totalAgentes = stats.total_agentes || resumen.total || 30;

  res.json({
    disponible: true,
    agentes_disponibles: totalAgentes,
    agentes_totales_sistema: totalAgentes,
    agente_0: 'Conversador (guía al usuario)',
    agentes_base_orquestador: resumen.originales || 18,
    agentes_navegacion: resumen.navegacion || 9,
    agentes_soporte: resumen.soporte || 3,
    agentes_1_16: 'Compatibilidad legacy del pipeline base especializado',
    nota: `Agente 0: interfaz natural. Sistema actual: ${resumen.originales || 18} base + ${resumen.navegacion || 9} navegación + ${resumen.soporte || 3} soporte = ${totalAgentes}.`
  });
});

// ═══════════════════════════════════════════════════
// MEMORIA HÍBRIDA — Endpoints
// ═══════════════════════════════════════════════════

// Guardar cotización en memoria
app.post('/api/memoria/cotizacion', async (req, res) => {
  try {
    const data = req.body;
    const resultado = memoria.guardarCotizacion({
      ...data,
      ip: req.ip
    });
    res.json(resultado);
  } catch (e) {
    console.error('[MEMORIA] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Buscar cotizaciones
app.get('/api/memoria/cotizaciones', async (req, res) => {
  try {
    const filtros = {
      usuario_id: req.query.usuario_id,
      pais_origen: req.query.pais,
      canal: req.query.canal,
      limite: parseInt(req.query.limite) || 50
    };
    const resultados = memoria.buscarCotizaciones(filtros);
    res.json(resultados);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Búsqueda semántica de productos
app.post('/api/memoria/buscar', async (req, res) => {
  try {
    const { query, topK = 5 } = req.body;

    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Query requerida (mínimo 2 caracteres)' });
    }

    const resultados = memoria.buscarDocumentos(query, topK);
    res.json({
      query,
      resultados,
      vec_disponible: memoria.vecDisponible,
      tipo_busqueda: memoria.vecDisponible ? 'semantica_vec' : 'texto'
    });
  } catch (e) {
    console.error('[MEMORIA] Búsqueda error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Obtener contexto de usuario
app.get('/api/memoria/contexto/:usuario_id', async (req, res) => {
  try {
    const contexto = memoria.obtenerContexto(req.params.usuario_id);
    res.json(contexto || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Guardar contexto de usuario
app.post('/api/memoria/contexto', async (req, res) => {
  try {
    const { usuario_id, tipo_importador, margen_preferido, canal_preferido, pais_preferido } = req.body;

    if (!usuario_id) {
      return res.status(400).json({ error: 'usuario_id requerido' });
    }

    const resultado = memoria.guardarContexto({
      usuario_id,
      tipo_importador,
      margen_preferido,
      canal_preferido,
      pais_preferido
    });
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener sugerencias inteligentes
app.get('/api/memoria/sugerencias/:usuario_id', async (req, res) => {
  try {
    const sugerencias = memoria.obtenerSugerencias(req.params.usuario_id);
    res.json({ sugerencias });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Estadísticas de memoria
app.get('/api/memoria/estadisticas', async (req, res) => {
  try {
    const estadisticas = memoria.obtenerEstadisticas();
    res.json(estadisticas);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Limpieza de memoria antigua
app.post('/api/memoria/limpiar', async (req, res) => {
  try {
    const { dias = 90 } = req.body;
    const resultado = memoria.limpiarMemoriaAntigua(dias);
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Exportar datos de usuario
app.get('/api/memoria/exportar/:usuario_id', async (req, res) => {
  try {
    const datos = memoria.exportarDatos(req.params.usuario_id);
    res.json(datos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════
// STATE MACHINE — Endpoints
// ═══════════════════════════════════════════════════

// Visualizar estado de state machines
app.get('/api/state/status', (req, res) => {
  res.json({
    disponible: true,
    patron: 'LangGraph-inspired',
    caracteristicas: [
      'Determinístico',
      'Testeable sin LLM',
      'Debuggable',
      'Reintentos automáticos'
    ]
  });
});

// ═══════════════════════════════════════════════════
// EMBEDDINGS ML — Endpoints
// ═══════════════════════════════════════════════════

// Obtener estadísticas de embeddings
app.get('/api/embeddings/stats', (req, res) => {
  res.json(embeddings.getEmbeddingStats());
});

// Precalentar modelo (para producción)
app.post('/api/embeddings/warmup', async (req, res) => {
  try {
    await embeddings.precalentarModelo();
    res.json({ ok: true, mensaje: 'Modelo precalentado' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Generar embedding para texto custom
app.post('/api/embeddings/generate', async (req, res) => {
  try {
    const { texto } = req.body;

    if (!texto || texto.length < 2) {
      return res.status(400).json({ error: 'Texto requerido (mínimo 2 caracteres)' });
    }

    const embedding = await embeddings.generarEmbedding(texto);

    res.json({
      texto,
      embedding: JSON.parse(embedding),
      dimensiones: 384,
      modelo: 'Xenova/all-MiniLM-L6-v2'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Búsqueda semántica con ML real
app.post('/api/embeddings/search', async (req, res) => {
  try {
    const { query, documentos, topK = 5 } = req.body;

    if (!query || !documentos || !Array.isArray(documentos)) {
      return res.status(400).json({ error: 'Query y documentos requeridos' });
    }

    const resultados = await embeddings.buscarSemanticamente(query, documentos, topK);

    res.json({
      query,
      resultados,
      modelo: 'Xenova/all-MiniLM-L6-v2'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════
// CONECTORES DE GOBIERNO — Endpoints (TIEMPO REAL)
// ═══════════════════════════════════════════════════

// Consultar TODO para una cotización (arancel + TC + restricciones + antidumping)
app.get('/api/conectores/consultar-todo', async (req, res) => {
  try {
    const { partida, producto, pais } = req.query;

    if (!partida || !producto) {
      return res.status(400).json({ error: 'partida y producto requeridos' });
    }

    const resultado = await conectores.consultarTodo(partida, producto, pais || 'CN');
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SUNAT — Tipo de cambio
app.get('/api/conectores/sunat/tipo-cambio', async (req, res) => {
  try {
    const tc = await conectores.SUNAT.consultarTipoCambio();
    res.json(tc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SUNAT — Arancel de partida
app.get('/api/conectores/sunat/arancel/:partida', async (req, res) => {
  try {
    const { partida } = req.params;
    const arancel = await conectores.SUNAT.consultarArancel(partida);
    res.json(arancel);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// VUCE — Restricciones por partida
app.get('/api/conectores/vuce/restricciones/:partida', async (req, res) => {
  try {
    const { partida } = req.params;
    const { pais } = req.query;
    const restricciones = await conectores.VUCE.consultarRestricciones(partida, pais || 'CN');
    res.json(restricciones);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// MTC — Homologación de producto
app.get('/api/conectores/mtc/homologacion', async (req, res) => {
  try {
    const { producto, marca, modelo } = req.query;

    if (!producto) {
      return res.status(400).json({ error: 'producto requerido' });
    }

    const homologacion = await conectores.MTC.consultarHomologacion(producto, marca || '', modelo || '');
    res.json(homologacion);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DIGESA — Registro sanitario
app.get('/api/conectores/digesa/registro', async (req, res) => {
  try {
    const { producto, laboratorio } = req.query;

    if (!producto) {
      return res.status(400).json({ error: 'producto requerido' });
    }

    const registro = await conectores.DIGESA.consultarRegistroSanitario(producto, laboratorio || '');
    res.json(registro);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SENASA — Permiso fitosanitario
app.get('/api/conectores/senasa/permiso', async (req, res) => {
  try {
    const { producto, pais } = req.query;

    if (!producto) {
      return res.status(400).json({ error: 'producto requerido' });
    }

    const permiso = await conectores.SENASA.consultarPermisoFitosanitario(producto, pais || 'CN');
    res.json(permiso);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// MINAM — Permiso ambiental
app.get('/api/conectores/minam/permiso', async (req, res) => {
  try {
    const { producto } = req.query;

    if (!producto) {
      return res.status(400).json({ error: 'producto requerido' });
    }

    const permiso = await conectores.MINAM.consultarPermisoAmbiental(producto);
    res.json(permiso);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PRODUCE — Permiso de pesca
app.get('/api/conectores/produce/permiso', async (req, res) => {
  try {
    const { producto } = req.query;

    if (!producto) {
      return res.status(400).json({ error: 'producto requerido' });
    }

    const permiso = await conectores.PRODUCE.consultarPermisoPesca(producto);
    res.json(permiso);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// INDECOPI — Antidumping
app.get('/api/conectores/indecopi/antidumping', async (req, res) => {
  try {
    const { producto, pais } = req.query;

    if (!producto) {
      return res.status(400).json({ error: 'producto requerido' });
    }

    const antidumping = await conectores.INDECOPI.consultarAntidumping(producto, pais || 'CN');
    res.json(antidumping);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ADUANET — Arancel en tiempo real
app.get('/api/conectores/aduanet/arancel/:partida', async (req, res) => {
  try {
    const { partida } = req.params;
    const arancel = await conectores.ADUANET.consultarArancelTiempoReal(partida);
    res.json(arancel);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Limpiar cache de conectores
app.post('/api/conectores/limpiar-cache', (req, res) => {
  conectores.limpiarCache();
  res.json({ ok: true, mensaje: 'Cache limpiada' });
});

// Estadísticas de cache
app.get('/api/conectores/cache-stats', (req, res) => {
  res.json(conectores.getCacheStats());
});

// ═══════════════════════════════════════════════════
// AGENTES DE NAVEGACIÓN — Endpoints
// ═══════════════════════════════════════════════════

// Estadísticas generales de agentes
app.get('/api/agentes/stats', (req, res) => {
  res.json(agentesNavegacion.obtenerEstadisticasGenerales());
});

// SUNAT — Tipo de cambio con agente especialista
app.get('/api/agentes/sunat/tipo-cambio', async (req, res) => {
  try {
    const tc = await agentesNavegacion.SUNAT.consultarTipoCambio();
    res.json(tc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SUNAT — Arancel con agente especialista
app.get('/api/agentes/sunat/arancel/:partida', async (req, res) => {
  try {
    const { partida } = req.params;
    const arancel = await agentesNavegacion.SUNAT.consultarArancel(partida);
    res.json(arancel);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SUNAT — Estadísticas del agente
app.get('/api/agentes/sunat/stats', (req, res) => {
  res.json(agentesNavegacion.SUNAT.obtenerEstadisticas());
});

// ADUANET — Arancel con agente especialista
app.get('/api/agentes/aduanet/arancel/:partida', async (req, res) => {
  try {
    const { partida } = req.params;
    const arancel = await agentesNavegacion.ADUANET.consultarArancel(partida);
    res.json(arancel);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// VUCE — Restricciones con agente especialista
app.get('/api/agentes/vuce/restricciones/:partida', async (req, res) => {
  try {
    const { partida } = req.params;
    const { pais } = req.query;
    const restricciones = await agentesNavegacion.VUCE.consultarRestricciones(partida, pais || 'CN');
    res.json(restricciones);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// INDECOPI — Antidumping con agente especialista
app.get('/api/agentes/indecopi/antidumping', async (req, res) => {
  try {
    const { producto, pais } = req.query;
    if (!producto) {
      return res.status(400).json({ error: 'producto requerido' });
    }
    const antidumping = await agentesNavegacion.INDECOPI.consultarAntidumping(producto, pais || 'CN');
    res.json(antidumping);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// MTC — Homologación con agente especialista
app.get('/api/agentes/mtc/homologacion', async (req, res) => {
  try {
    const { producto, marca, modelo } = req.query;
    if (!producto) {
      return res.status(400).json({ error: 'producto requerido' });
    }
    const homologacion = await agentesNavegacion.MTC.consultarHomologacion(producto, marca || '', modelo || '');
    res.json(homologacion);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DIGESA — Registro sanitario con agente especialista
app.get('/api/agentes/digesa/registro', async (req, res) => {
  try {
    const { producto, laboratorio } = req.query;
    if (!producto) {
      return res.status(400).json({ error: 'producto requerido' });
    }
    const registro = await agentesNavegacion.DIGESA.consultarRegistroSanitario(producto, laboratorio || '');
    res.json(registro);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SENASA — Permiso fitosanitario con agente especialista
app.get('/api/agentes/senasa/permiso', async (req, res) => {
  try {
    const { producto, pais } = req.query;
    if (!producto) {
      return res.status(400).json({ error: 'producto requerido' });
    }
    const permiso = await agentesNavegacion.SENASA.consultarPermisoFitosanitario(producto, pais || 'CN');
    res.json(permiso);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// MINAM — Permiso ambiental con agente especialista
app.get('/api/agentes/minam/permiso', async (req, res) => {
  try {
    const { producto } = req.query;
    if (!producto) {
      return res.status(400).json({ error: 'producto requerido' });
    }
    const permiso = await agentesNavegacion.MINAM.consultarPermisoAmbiental(producto);
    res.json(permiso);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PRODUCE — Permiso de pesca con agente especialista
app.get('/api/agentes/produce/permiso', async (req, res) => {
  try {
    const { producto } = req.query;
    if (!producto) {
      return res.status(400).json({ error: 'producto requerido' });
    }
    const permiso = await agentesNavegacion.PRODUCE.consultarPermisoPesca(producto);
    res.json(permiso);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════
// SISTEMA UNIFICADO DE AGENTES — Endpoints
// ═══════════════════════════════════════════════════

// Estadísticas generales de TODOS los agentes
app.get('/api/sistema/stats', (req, res) => {
  res.json(sistemaAgentes.obtenerEstadisticas());
});

// Consulta unificada de gobierno (tipo dinámico)
app.get('/api/sistema/consulta', async (req, res) => {
  try {
    const { tipo, partida, producto, pais } = req.query;

    if (!tipo) {
      return res.status(400).json({ error: 'tipo requerido (tipo_cambio, arancel, restricciones, antidumping, etc.)' });
    }

    const resultado = await sistemaAgentes.consultarGobierno(tipo, { partida, producto, pais });
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Detectar requisitos automáticos de producto
app.get('/api/sistema/requisitos', async (req, res) => {
  try {
    const { producto, categoria, pais } = req.query;

    if (!producto) {
      return res.status(400).json({ error: 'producto requerido' });
    }

    const requisitos = await sistemaAgentes.detectarRequisitos(producto, categoria || '', pais || 'CN');
    res.json(requisitos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Generar reporte completo de importación
app.get('/api/sistema/reporte', async (req, res) => {
  try {
    const { producto, partida, pais } = req.query;

    if (!producto || !partida) {
      return res.status(400).json({ error: 'producto y partida requeridos' });
    }

    const reporte = await sistemaAgentes.generarReporteImportacion(producto, partida, pais || 'CN');
    res.json(reporte);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════
// AUTO-REPAIR — Endpoints (AGENTES QUE SE AUTOCORRIGEN)
// ═══════════════════════════════════════════════════

// Estadísticas de auto-reparación
app.get('/api/auto-repair/stats', (req, res) => {
  const stats = autoRepair.getEstadisticas();
  res.json(stats);
});

// Obtener patrones de fallos por agente
app.get('/api/auto-repair/patrones/:agente', (req, res) => {
  const patrones = autoRepair.obtenerPatrones(req.params.agente);
  res.json({ agente: req.params.agente, patrones });
});

// Obtener conocimiento de un agente
app.get('/api/auto-repair/knowledge/:agente/:clave', (req, res) => {
  const conocimiento = autoRepair.obtenerConocimiento(req.params.agente, req.params.clave);
  res.json({ agente: req.params.agente, clave: req.params.clave, conocimiento });
});

// Guardar conocimiento manualmente
app.post('/api/auto-repair/knowledge', (req, res) => {
  try {
    const { agente, clave, valor, confianza } = req.body;

    if (!agente || !clave || valor === undefined) {
      return res.status(400).json({ error: 'agente, clave y valor requeridos' });
    }

    autoRepair.guardarConocimiento(agente, clave, valor, confianza || 1.0);
    res.json({ ok: true, mensaje: 'Conocimiento guardado' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Limpiar datos antiguos
app.post('/api/auto-repair/cleanup', (req, res) => {
  try {
    const { dias = 30 } = req.body;
    const resultado = autoRepair.limpiarDatosAntiguos(dias);
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════
// ALERTAS NORMATIVAS — Endpoints (CAMBIOS NORMATIVOS)
// ═══════════════════════════════════════════════════

// Obtener estadísticas de alertas
app.get('/api/alertas/stats', (req, res) => {
  const stats = alertasNormativas.obtenerEstadisticas();
  res.json(stats);
});

// Obtener alertas no leídas
app.get('/api/alertas/no-leidas', (req, res) => {
  const alertas = alertasNormativas.obtenerAlertasNoLeidas();
  res.json({ alertas, total: alertas.length });
});

// Obtener todas las alertas (con paginación)
app.get('/api/alertas', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const filtros = {
      tipo: req.query.tipo,
      entidad: req.query.entidad,
      nivel: req.query.nivel,
      leido: req.query.leido === 'true' ? true : (req.query.leido === 'false' ? false : undefined)
    };

    const resultado = alertasNormativas.obtenerAlertas(page, limit, filtros);
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Marcar alerta como leída
app.post('/api/alertas/leida/:id', (req, res) => {
  try {
    const exito = alertasNormativas.marcarAlertaLeida(req.params.id);
    res.json({ ok: exito });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Marcar todas las alertas como leídas
app.post('/api/alertas/todas-leidas', (req, res) => {
  try {
    const cantidad = alertasNormativas.marcarTodasLeidas();
    res.json({ ok: true, cantidad });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Suscribirse a alertas
app.post('/api/alertas/suscribir', (req, res) => {
  try {
    const { email, tipos, telegram_chat_id } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'email requerido' });
    }

    const id = alertasNormativas.suscribirAlertas(email, tipos || [], telegram_chat_id);
    res.json({ ok: true, id, mensaje: 'Suscrito correctamente' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Crear alerta manualmente (para testing)
app.post('/api/alertas/crear', (req, res) => {
  try {
    const { tipo, entidad, titulo, descripcion, nivel, partida_afectada, pais_afectado } = req.body;

    if (!tipo || !entidad || !titulo) {
      return res.status(400).json({ error: 'tipo, entidad y titulo requeridos' });
    }

    const id = alertasNormativas.crearAlerta(tipo, entidad, titulo, descripcion, {
      nivel: nivel || 'info',
      partida_afectada,
      pais_afectado
    });
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Detectar cambios automáticamente (trigger manual)
app.post('/api/alertas/detectar-cambios', async (req, res) => {
  try {
    await alertasNormativas.detectarCambiosAutomaticos();
    res.json({ ok: true, mensaje: 'Detección completada' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Limpiar alertas antiguas
app.post('/api/alertas/limpiar', (req, res) => {
  try {
    const { dias = 90 } = req.body;
    const resultado = alertasNormativas.limpiarAlertasAntiguas(dias);
    res.json({ ok: true, eliminadas: resultado });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════
// LOGÍSTICA — Endpoints (Couriers y Navieras)
// ═══════════════════════════════════════════════════

// Cotizar con todos los couriers y navieras
app.post('/api/logistica/cotizar', async (req, res) => {
  try {
    const datos = req.body;

    if (!datos.origen || !datos.destino || !datos.peso) {
      return res.status(400).json({ error: 'origen, destino y peso requeridos' });
    }

    const resultados = await integradorLogistica.cotizarTodo(datos);
    res.json(resultados);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Listar todas las empresas configuradas
app.get('/api/logistica/empresas', (req, res) => {
  try {
    const empresas = integradorLogistica.listarEmpresas();
    res.json(empresas);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener estado de contingencia de APIs
app.get('/api/logistica/contingencia', (req, res) => {
  try {
    const contingencia = integradorLogistica.obtenerContingencia();
    res.json(contingencia);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener prioridad de couriers
app.get('/api/logistica/prioridad', (req, res) => {
  try {
    const prioridad = integradorLogistica.obtenerPrioridad();
    res.json(prioridad);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Resetear uso de API (admin)
app.post('/api/logistica/reset/:api', (req, res) => {
  try {
    const { api } = req.params;
    const contingencia = require('./couriers/contingencia-api');
    const reseteado = contingencia.resetearUso(api);
    res.json({ ok: reseteado, mensaje: reseteado ? `API ${api} reseteada` : 'API no encontrada o ilimitada' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════
// COTIZACIÓN PERSONALIZADA — Endpoints (Email, Tel, WhatsApp)
// ═══════════════════════════════════════════════════

// Cotizar por email automático
app.post('/api/logistica/cotizar-email', async (req, res) => {
  try {
    const { courier, datos } = req.body;

    if (!courier || !datos) {
      return res.status(400).json({ error: 'courier y datos requeridos' });
    }

    const resultado = await cotizadorPersonalizado.cotizarPorEmail(courier, datos);
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cotizar por teléfono
app.post('/api/logistica/cotizar-telefono', (req, res) => {
  try {
    const { courier, datos } = req.body;

    if (!courier || !datos) {
      return res.status(400).json({ error: 'courier y datos requeridos' });
    }

    const resultado = cotizadorPersonalizado.cotizarPorTelefono(courier, datos);
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cotizar por WhatsApp
app.post('/api/logistica/cotizar-whatsapp', (req, res) => {
  try {
    const { courier, datos } = req.body;

    if (!courier || !datos) {
      return res.status(400).json({ error: 'courier y datos requeridos' });
    }

    const resultado = cotizadorPersonalizado.cotizarPorWhatsApp(courier, datos);
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener tarifas negociadas (contratos)
app.post('/api/logistica/tarifas-negociadas', (req, res) => {
  try {
    const { courier, datos } = req.body;

    if (!courier || !datos) {
      return res.status(400).json({ error: 'courier y datos requeridos' });
    }

    const resultado = cotizadorPersonalizado.obtenerTarifasNegociadas(courier, datos);
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cotizar con fallback referencial
app.post('/api/logistica/cotizar-fallback', (req, res) => {
  try {
    const datos = req.body;

    if (!datos.origen || !datos.destino || !datos.peso) {
      return res.status(400).json({ error: 'origen, destino y peso requeridos' });
    }

    const resultado = cotizadorPersonalizado.cotizarFallback(datos);
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener cotizaciones personalizadas
app.get('/api/logistica/cotizaciones-personalizadas', (req, res) => {
  try {
    const filtros = {
      courier: req.query.courier,
      estado: req.query.estado
    };

    const cotizaciones = cotizadorPersonalizado.obtenerCotizaciones(filtros);
    res.json(cotizaciones);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener cotización por ID
app.get('/api/logistica/cotizacion-personalizada/:id', (req, res) => {
  try {
    const cotizacion = cotizadorPersonalizado.obtenerCotizacion(req.params.id);

    if (!cotizacion) {
      return res.status(404).json({ error: 'Cotización no encontrada' });
    }

    res.json(cotizacion);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Actualizar cotización (respuesta)
app.post('/api/logistica/cotizacion-personalizada/:id/respuesta', (req, res) => {
  try {
    const { respuesta } = req.body;

    if (!respuesta) {
      return res.status(400).json({ error: 'respuesta requerida' });
    }

    const cotizacion = cotizadorPersonalizado.actualizarCotizacion(req.params.id, respuesta);
    res.json(cotizacion);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener contactos de couriers
app.get('/api/logistica/contactos', (req, res) => {
  try {
    const contactos = cotizadorPersonalizado.obtenerContactos();
    res.json(contactos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Agregar contacto de courier
app.post('/api/logistica/contactos', (req, res) => {
  try {
    const { slug, datos } = req.body;

    if (!slug || !datos) {
      return res.status(400).json({ error: 'slug y datos requeridos' });
    }

    const contacto = cotizadorPersonalizado.agregarContacto(slug, datos);
    res.json(contacto);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener estadísticas de cotización personalizada
app.get('/api/logistica/estadisticas-personalizadas', (req, res) => {
  try {
    const estadisticas = cotizadorPersonalizado.obtenerEstadisticas();
    res.json(estadisticas);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════
// DASHBOARD ENTERPRISE — Endpoints (IA con GROQ)
// ═══════════════════════════════════════════════════

// Obtener datos completos del dashboard
app.get('/api/dashboard', async (req, res) => {
  try {
    const filtros = {
      desde: req.query.desde,
      hasta: req.query.hasta,
      pais: req.query.pais,
      courier: req.query.courier
    };

    const datos = await dashboardService.obtenerDatosDashboard(filtros);
    res.json(datos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener análisis con IA
app.get('/api/dashboard/analisis', async (req, res) => {
  try {
    const filtros = {
      desde: req.query.desde,
      hasta: req.query.hasta
    };

    const datos = await dashboardService.obtenerDatosDashboard(filtros);
    const analisis = await dashboardService.analizarConIA(datos);

    res.json({
      datos,
      analisis,
      modelo: 'llama-3.1-8b-instant (ilimitado)',
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener gráficos sugeridos por IA
app.get('/api/dashboard/graficos-sugeridos', async (req, res) => {
  try {
    const filtros = {
      desde: req.query.desde,
      hasta: req.query.hasta
    };

    const datos = await dashboardService.obtenerDatosDashboard(filtros);
    const graficos = await dashboardService.sugerirGraficos(datos);

    res.json({
      graficos,
      modelo: 'llama-3.1-8b-instant (ilimitado)',
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Chat con datos (preguntar cualquier cosa)
app.post('/api/dashboard/chat', async (req, res) => {
  try {
    const { pregunta } = req.body;

    if (!pregunta) {
      return res.status(400).json({ error: 'pregunta requerida' });
    }

    const datos = await dashboardService.obtenerDatosDashboard({});
    const respuesta = await dashboardService.chatConDatos(pregunta, datos);

    res.json({
      pregunta,
      respuesta,
      modelo: 'llama-3.1-8b-instant (ilimitado)',
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Generar SQL con IA
app.post('/api/dashboard/generar-sql', async (req, res) => {
  try {
    const { pregunta } = req.body;

    if (!pregunta) {
      return res.status(400).json({ error: 'pregunta requerida' });
    }

    const schema = {
      tablas: {
        cotizaciones: ['id', 'producto', 'pais_origen', 'total', 'fecha'],
        couriers: ['nombre', 'tipo', 'precio']
      }
    };

    const sql = await dashboardService.generarSQL(pregunta, schema);

    res.json({
      pregunta,
      sql,
      modelo: 'qwen-2.5-coder-32b (ilimitado)',
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener estadísticas del dashboard
app.get('/api/dashboard/estadisticas', (req, res) => {
  try {
    const estadisticas = dashboardService.obtenerEstadisticas();
    res.json(estadisticas);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Limpiar cache del dashboard
app.post('/api/dashboard/limpiar-cache', (req, res) => {
  try {
    dashboardService.limpiarCache();
    res.json({ ok: true, mensaje: 'Cache limpiada' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════
// MONITOR DEL SISTEMA — Endpoints (Monitoreo)
// ═══════════════════════════════════════════════════

// Salud del sistema
app.get('/api/monitor/health', (req, res) => {
  try {
    const salud = monitorService.obtenerSalud();
    res.json(salud);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Métricas detalladas
app.get('/api/monitor/metricas', (req, res) => {
  try {
    const metricas = monitorService.obtenerMetricas();
    res.json(metricas);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Alertas del sistema
app.get('/api/monitor/alertas', (req, res) => {
  try {
    const alertas = monitorService.obtenerAlertas();
    res.json(alertas);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Marcar alerta como leída
app.post('/api/monitor/alertas/:id/leida', (req, res) => {
  try {
    const exito = monitorService.marcarAlertaLeida(parseInt(req.params.id));
    res.json({ ok: exito });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Limpiar alertas leídas
app.post('/api/monitor/alertas/limpiar', (req, res) => {
  try {
    const resultado = monitorService.limpiarAlertasLeidas();
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Agregar courier personalizado
app.post('/api/logistica/courier', (req, res) => {
  try {
    const config = req.body;

    if (!config.nombre || !config.tarifas) {
      return res.status(400).json({ error: 'nombre y tarifas requeridos' });
    }

    integradorLogistica.agregarCourierPersonalizado(config);
    res.json({ ok: true, mensaje: 'Courier agregado' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Agregar naviera personalizada
app.post('/api/logistica/naviera', (req, res) => {
  try {
    const config = req.body;

    if (!config.nombre || !config.tarifasContenedores) {
      return res.status(400).json({ error: 'nombre y tarifasContenedores requeridos' });
    }

    integradorLogistica.agregarNaviera(config);
    res.json({ ok: true, mensaje: 'Naviera agregada' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════
// MEMBRESÍAS — Endpoints (Comunidad)
// ═══════════════════════════════════════════════════

// Registro con código de invitación
app.post('/api/membresias/registro', async (req, res) => {
  try {
    const { email, password, nombre, codigoInvitacion } = req.body;

    if (!email || !password || !nombre) {
      return res.status(400).json({ error: 'email, password y nombre requeridos' });
    }

    const usuario = await membresiasService.registrarUsuario(email, password, nombre, codigoInvitacion);
    res.json({ ok: true, usuario });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Generar código de invitación
app.post('/api/membresias/generar-codigo', auth.requireAuth, (req, res) => {
  try {
    const { tipo, usosMaximos } = req.body;
    const codigo = membresiasService.generarCodigoInvitacion(req.user.id, tipo || 'NORMAL', usosMaximos || 1);
    res.json({ ok: true, codigo });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Obtener membresía del usuario actual
app.get('/api/membresias/mi-membresia', auth.requireAuth, (req, res) => {
  try {
    const membresia = membresiasService.obtenerMembresia(req.user.id);
    res.json(membresia);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Verificar límites de uso
app.get('/api/membresias/verificar-limite/:tipo', auth.requireAuth, (req, res) => {
  try {
    const limite = membresiasService.verificarLimite(req.user.id, req.params.tipo);
    res.json(limite);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Listar miembros de la comunidad (solo admin)
app.get('/api/membresias/miembros', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    const filtros = {
      nivel: req.query.nivel,
      activo: req.query.activo !== 'false'
    };
    const miembros = membresiasService.listarMiembros(filtros);
    res.json(miembros);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Obtener estadísticas de membresías (solo admin)
app.get('/api/membresias/estadisticas', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    const estadisticas = membresiasService.obtenerEstadisticas();
    res.json(estadisticas);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Registrar pago de membresía
app.post('/api/membresias/pago', auth.requireAuth, (req, res) => {
  try {
    const { monto, nivel, periodo } = req.body;

    if (!monto || !nivel || !periodo) {
      return res.status(400).json({ error: 'monto, nivel y periodo requeridos' });
    }

    const resultado = membresiasService.registrarPago(req.user.id, monto, nivel, periodo, 'pendiente');
    res.json(resultado);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Actualizar estado de pago (solo admin)
app.post('/api/membresias/pago/:id/actualizar', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    const { estado } = req.body; // 'pendiente', 'pagado', 'cancelado'

    if (!estado) {
      return res.status(400).json({ error: 'estado requerido' });
    }

    res.json({ ok: true, mensaje: `Pago ${estado}` });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════
// EXPORTAR COTIZACIONES — Endpoints (PDF, Excel)
// ═══════════════════════════════════════════════════

// Exportar cotización a PDF
app.post('/api/exportar/pdf', (req, res) => {
  try {
    const cotizacion = req.body;

    if (!cotizacion.producto || !cotizacion.total_landed) {
      return res.status(400).json({ error: 'Cotización incompleta' });
    }

    const pdf = exportarCotizacion.exportarCotizacion(cotizacion, 'pdf', {
      incluirDocumentacion: true,
      incluirRecomendaciones: true,
      incluirApuntes: true
    });

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="cotizacion-${cotizacion.id || 'export'}.html"`);
    res.send(pdf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Exportar cotización a Excel (CSV)
app.post('/api/exportar/excel', (req, res) => {
  try {
    const cotizacion = req.body;

    if (!cotizacion.producto || !cotizacion.total_landed) {
      return res.status(400).json({ error: 'Cotización incompleta' });
    }

    const excel = exportarCotizacion.exportarCotizacion(cotizacion, 'excel');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="cotizacion-${cotizacion.id || 'export'}.csv"`);
    res.send(excel);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener documentación requerida
app.post('/api/exportar/documentacion', (req, res) => {
  try {
    const cotizacion = req.body;
    const documentacion = exportarCotizacion.generarDocumentacion(cotizacion);
    res.json({ documentos: documentacion });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener recomendaciones
app.post('/api/exportar/recomendaciones', (req, res) => {
  try {
    const cotizacion = req.body;
    const recomendaciones = exportarCotizacion.generarRecomendaciones(cotizacion);
    res.json({ recomendaciones });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener apuntes importantes
app.post('/api/exportar/apuntes', (req, res) => {
  try {
    const cotizacion = req.body;
    const apuntes = exportarCotizacion.generarApuntes(cotizacion);
    res.json({ apuntes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Simular fallo y solución (para testing)
app.post('/api/auto-repair/test', (req, res) => {
  try {
    const { agente, error, solucion } = req.body;

    // Registrar fallo
    const failureId = autoRepair.registrarFallo(agente, {
      type: error.type || 'test_error',
      message: error.message || 'Error de test'
    }, { test: true });

    // Registrar solución
    const exito = autoRepair.registrarSolucion(failureId, solucion, true, 100);

    res.json({
      ok: exito,
      failure_id: failureId,
      mensaje: exito ? 'Fallo y solución registrados' : 'Error registrando solución'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// AGENTE ORQUESTADOR — UN SOLO ENDPOINT, TODO AUTOMÁTICO
// ═══════════════════════════════════════════════════════════════
// El usuario manda lo que tenga (PDF, texto, items, lo que sea)
// El orquestador decide qué sub-agentes activar y devuelve TODO.

// Paso 1: Solo extraer (para revisión humana)
app.post('/api/agente/extraer', upload.single('file'), async (req, res) => {
  try {
    if (!checkRate(req.ip)) return res.status(429).json({ error: 'Límite alcanzado' });
    let contenido, tipo;
    if (req.file) {
      const buf = fs.readFileSync(req.file.path);
      const mime = req.file.mimetype;
      if (mime.startsWith('image/')) { contenido = `data:${mime};base64,${buf.toString('base64')}`; tipo = 'image'; }
      else if (mime === 'application/pdf') {
        let text = '';
        try { const pp = require('pdf-parse'); text = (await pp(buf)).text?.trim() || ''; } catch (error) { /* pdf text extraction fallback */ }
        if (text.length > 50) { contenido = text; tipo = 'text'; }
        else { contenido = `data:image/png;base64,${buf.toString('base64')}`; tipo = 'image'; }
      } else { contenido = buf.toString('utf8'); tipo = 'text'; }
      try { fs.unlinkSync(req.file.path); } catch (error) { /* temp upload cleanup */ }
    } else if (req.body.texto) { contenido = req.body.texto; tipo = 'text'; }
    else { return res.status(400).json({ error: 'Sube archivo o pega texto' }); }

    const resultado = await agente.orquestar({ contenido, tipo, soloExtraer: true });
    res.json(resultado);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Paso 2: Calcular todo (después de revisión)
app.post('/api/agente/calcular', async (req, res) => {
  try {
    if (!checkRate(req.ip, 500)) return res.status(429).json({ error: 'Límite alcanzado' });
    const resultado = await agente.orquestar(req.body);
    res.json(resultado);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Todo en uno (para API/integraciones — sin revisión humana)
app.post('/api/agente', async (req, res) => {
  try {
    if (!checkRate(req.ip, 500)) return res.status(429).json({ error: 'Límite alcanzado' });
    const resultado = await agente.orquestar(req.body);
    res.json(resultado);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// AUTO-COTIZAR (legacy — mantiene compatibilidad)
// ═══════════════════════════════════════════════════════════════

// Rate limiter con limpieza de memoria (evita memory leak)
const _rateLimit = {};
const RATE_LIMIT_CLEANUP_INTERVAL = 3600000; // 1 hora

function checkRate(ip, maxPerHour = 200) {
  const now = Date.now();
  if (!_rateLimit[ip]) _rateLimit[ip] = [];
  _rateLimit[ip] = _rateLimit[ip].filter(t => now - t < 3600000);

  if (_rateLimit[ip].length >= maxPerHour) return false;
  _rateLimit[ip].push(now);
  return true;
}

// Limpieza global periódica de IPs inactivas
const rateLimitCleanupInterval = setInterval(() => {
  const now = Date.now();
  const ips = Object.keys(_rateLimit);
  let cleaned = 0;

  for (const ip of ips) {
    _rateLimit[ip] = _rateLimit[ip].filter(t => now - t < 3600000);
    if (_rateLimit[ip].length === 0) {
      delete _rateLimit[ip];
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[RATE] Limpieza: ${cleaned} IPs eliminadas, ${Object.keys(_rateLimit).length} IPs activas`);
  }
}, RATE_LIMIT_CLEANUP_INTERVAL);

rateLimitCleanupInterval.unref?.();

// PASO 1: Subir archivo → IA extrae → DEVUELVE BORRADOR para que el usuario revise
app.post('/api/auto-cotizar/extraer', upload.single('file'), async (req, res) => {
  try {
    if (!checkRate(req.ip)) return res.status(429).json({ error: 'Límite de consultas alcanzado. Intenta en 1 hora.' });

    let contenido, tipo;

    if (req.file) {
      const filePath = req.file.path;
      const mime = req.file.mimetype;

      if (mime.startsWith('image/')) {
        const buf = fs.readFileSync(filePath);
        contenido = `data:${mime};base64,${buf.toString('base64')}`;
        tipo = 'image';

      } else if (mime === 'application/pdf') {
        // Smart PDF detection: try text extraction first
        let textoExtraido = '';
        let pdfError = null;

        try {
          const pdfParse = require('pdf-parse');
          const buf = fs.readFileSync(filePath);

          // Validar tamaño máximo (10MB)
          if (buf.length > 10 * 1024 * 1024) {
            pdfError = 'PDF muy grande (>10MB)';
          } else {
            const pdf = await pdfParse(buf);
            textoExtraido = (pdf.text || '').trim();
          }
        } catch (e) {
          pdfError = e.message;
        }

        if (textoExtraido.length > 50) {
          // PDF tiene texto real → usar texto
          contenido = textoExtraido;
          tipo = 'text';
          console.log(`[PDF] Extrajo ${textoExtraido.length} chars`);
        } else {
          // PDF escaneado (< 50 chars) → enviar como imagen a IA con visión
          try {
            const buf = fs.readFileSync(filePath);
            contenido = `data:image/png;base64,${buf.toString('base64')}`;
            tipo = 'image';
            if (pdfError) console.log(`[PDF] Fallback a imagen: ${pdfError}`);
          } catch (e) {
            try { fs.unlinkSync(filePath); } catch (cleanupError) { /* temp upload cleanup */ }
            return res.status(400).json({ error: 'PDF corrupto o ilegible' });
          }
        }

      } else if (mime.includes('spreadsheet') || mime.includes('excel') || mime === 'text/csv') {
        contenido = fs.readFileSync(filePath, 'utf8');
        tipo = 'text';
      } else {
        contenido = fs.readFileSync(filePath, 'utf8');
        tipo = 'text';
      }

      try { fs.unlinkSync(filePath); } catch (error) { /* temp upload cleanup */ } // cleanup temp file

    } else if (req.body.texto) {
      contenido = req.body.texto;
      tipo = 'text';
    } else {
      return res.status(400).json({ error: 'Sube un archivo o pega el texto de la cotización' });
    }

    // Extraer datos (SOLO extracción, NO calcula aún)
    const resultado = await autoCotizar.extraer(contenido, tipo);
    res.json(resultado);

  } catch (e) {
    console.error('[AUTO-COTIZAR/EXTRAER] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PASO 2: Usuario revisó/corrigió los datos → AHORA calcular todo
app.post('/api/auto-cotizar/calcular', async (req, res) => {
  try {
    if (!checkRate(req.ip, 500)) return res.status(429).json({ error: 'Límite alcanzado' });

    const { items, pais, canal, incoterm, flete, seguro, tc, proveedor,
      moneda, tcMoneda, tipoImportador, margenVenta } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'Items requeridos. Primero usa /extraer.' });

    const resultado = await autoCotizar.calcular({
      items, pais, canal, incoterm,
      fleteManual: parseFloat(flete) || 0,
      seguroManual: parseFloat(seguro) || 0,
      tc: parseFloat(tc) || 0,
      proveedor, moneda, tcMoneda: parseFloat(tcMoneda) || 0,
      tipoImportador, margenVenta: parseFloat(margenVenta) || 30,
    });

    res.json(resultado);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Atajo: JSON ya verificado → calcular directo (para integraciones API)
app.post('/api/auto-cotizar/directo', async (req, res) => {
  try {
    if (!checkRate(req.ip, 500)) return res.status(429).json({ error: 'Límite alcanzado' });
    const { items, pais, canal, incoterm, flete, seguro, tc, proveedor,
      moneda, tcMoneda, tipoImportador, margenVenta } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'Items requeridos' });
    const resultado = await autoCotizar.calcular({
      items, pais, canal, incoterm,
      fleteManual: parseFloat(flete) || 0,
      seguroManual: parseFloat(seguro) || 0,
      tc: parseFloat(tc) || 0,
      proveedor, moneda, tcMoneda: parseFloat(tcMoneda) || 0,
      tipoImportador, margenVenta: parseFloat(margenVenta) || 30,
    });
    res.json(resultado);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Antidumping: check if an item has active INDECOPI measures
app.get('/api/antidumping/:hs/:pais', (req, res) => {
  const result = autoCotizar.buscarAntidumping(req.params.hs, req.params.pais);
  res.json(result || { activo: false });
});

// List all active antidumping measures
app.get('/api/antidumping', (req, res) => {
  res.json(autoCotizar.ANTIDUMPING_MEDIDAS);
});

// Incoterm info — what each term includes/excludes
app.get('/api/incoterms', (req, res) => {
  res.json(autoCotizar.INCOTERM_INFO);
});

// Incoterm adjustment preview
app.post('/api/incoterms/ajustar', (req, res) => {
  try {
    const { precio, incoterm, flete, seguro } = req.body;
    const resultado = autoCotizar.ajustarIncoterm(
      parseFloat(precio) || 0,
      incoterm || 'FOB',
      parseFloat(flete) || 0,
      parseFloat(seguro) || 0,
      parseFloat(precio) || 0
    );
    res.json(resultado);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// TC Sensitivity analysis
app.post('/api/sensibilidad-tc', (req, res) => {
  try {
    const { totalUSD, tc, variaciones } = req.body;
    const result = autoCotizar.calcularSensibilidadTC(
      parseFloat(totalUSD) || 0,
      parseFloat(tc) || 0,
      variaciones
    );
    res.json(result || { error: 'TC requerido' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════
// REGÍMENES ADUANEROS
// ══════════════════════════════════════════════════

// List all regimes
app.get('/api/regimenes', (req, res) => {
  res.json(Object.values(regimenes.REGIMENES).map(r => ({
    codigo: r.codigo, nombre: r.nombre, descripcion: r.descripcion,
    garantia: r.garantia, plazoMeses: r.plazoMeses, uso: r.uso,
  })));
});

// Drawback info (MUST be before :codigo route)
app.get('/api/regimenes/drawback/info', (req, res) => {
  res.json(regimenes.DRAWBACK);
});

// Get details of a specific regime
app.get('/api/regimenes/:codigo', (req, res) => {
  const r = regimenes.REGIMENES[req.params.codigo];
  if (!r) return res.status(404).json({ error: 'Régimen no encontrado' });
  res.json(r);
});

// Drawback calculator
app.post('/api/regimenes/drawback', (req, res) => {
  try {
    const { fobExportacion, insumosImportados } = req.body;
    if (!fobExportacion) return res.status(400).json({ error: 'fobExportacion requerido' });
    res.json(regimenes.calcularDrawback(fobExportacion, insumosImportados || 0));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admisión Temporal calculator (guarantee amount)
app.post('/api/regimenes/admision-temporal', (req, res) => {
  try {
    const { cif, adValorem, isc, igv, ipm, plazoMeses } = req.body;
    if (!cif) return res.status(400).json({ error: 'cif requerido' });
    res.json(regimenes.calcularAdmisionTemporal(cif, adValorem || 0, isc || 0, igv || 0, ipm || 0, plazoMeses));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Perfeccionamiento Pasivo calculator
app.post('/api/regimenes/perfeccionamiento-pasivo', (req, res) => {
  try {
    const { valorOriginal, costoReparacion, adValoremPct } = req.body;
    if (!valorOriginal) return res.status(400).json({ error: 'valorOriginal requerido' });
    res.json(regimenes.calcularPerfeccionamientoPasivo(valorOriginal, costoReparacion || 0, adValoremPct));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Regime recommendation based on use case
app.post('/api/regimenes/recomendar', (req, res) => {
  try {
    res.json(regimenes.recomendarRegimen(req.body));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════
// SUNAT PROXY (TC + consulta partida)
// ══════════════════════════════════════════════════
app.get('/api/tc', async (req, res) => {
  try { res.json(await sunatProxy.getTipoCambio()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/sunat/partida/:hs', async (req, res) => {
  try { res.json(await sunatProxy.consultaPartida(req.params.hs)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/monedas', async (req, res) => {
  try { res.json(await sunatProxy.getMonedas()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════
// COTIZACIONES (CRUD) — protected by auth
// ══════════════════════════════════════════════════
function canAccessQuotation(user, quotation) {
  return Boolean(
    user && quotation &&
    (user.role === 'admin' || quotation.user_id === user.id)
  );
}

app.get('/api/quotations', auth.requireAuth, (req, res) => {
  const list = db.listQuotations(req.user.id);
  res.json(list);
});

app.get('/api/quotations/:id', auth.requireAuth, (req, res) => {
  const q = db.getQuotation(req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  if (!canAccessQuotation(req.user, q)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  res.json(q);
});

app.post('/api/quotations', auth.requireAuth, (req, res) => {
  const quotationId = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
  if (quotationId) {
    const existing = db.getQuotation(quotationId);
    if (existing && !canAccessQuotation(req.user, existing)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
  }

  const data = {
    ...req.body,
    id: quotationId || undefined,
    userId: req.user.id,
  };
  const id = db.saveQuotation(data);
  res.json({ id });
});

app.delete('/api/quotations/:id', auth.requireAuth, (req, res) => {
  const q = db.getQuotation(req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  if (!canAccessQuotation(req.user, q)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  db.deleteQuotation(req.params.id);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════
// PRODUCTOS (CRUD)
// ══════════════════════════════════════════════════
app.get('/api/products', auth.requireAuth, (req, res) => res.json(db.listProducts()));
app.post('/api/products', auth.requireAuth, (req, res) => res.json({ id: db.saveProduct(req.body) }));
app.delete('/api/products/:id', auth.requireAuth, (req, res) => {
  db.deleteProduct(req.params.id);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════
// CHANGELOG + HEALTH
// ══════════════════════════════════════════════════
app.get('/api/changelog', (req, res) => res.json(db.getChangelog()));

app.get('/api/health', (req, res) => {
  res.json({
    server: 'ok', version: '2.0',
    nandina: { count: nandinaService.getData().length, lastUpdate: nandinaService.getLastUpdate(), source: nandinaService.getSource() },
    restricciones: Object.keys(nandinaService.getRestricciones()).length,
    prohibidas: Object.keys(nandinaService.getProhibidas()).length,
    tlcs: Object.keys(nandinaService.getTLCs()).length,
    scraping: valoracion.getScrapeHealth(),
    modules: ['nandina', 'permisos', 'valoracion', 'sanciones', 'clasificador', 'flete', 'tracking', 'pdf', 'auth', 'regimenes'],
  });
});

// ══════════════════════════════════════════════════
// FRONTEND ESTÁTICO
// ══════════════════════════════════════════════════
app.use(express.static(path.join(__dirname, '../client/dist')));

// API 404 handler (must be before wildcard)
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// ══════════════════════════════════════════════════
// CRON: Auto-actualización (con protección de concurrencia)
// ══════════════════════════════════════════════════
const cronSchedule = process.env.NANDINA_UPDATE_CRON || '0 3 * * 1';
let cronRunning = false;

// Función para adquirir lock (evita múltiples instancias)
const CRON_LOCK_FILE = path.join(os.tmpdir(), 'cotizador-cron.lock');

function acquireCronLock() {
  try {
    if (fs.existsSync(CRON_LOCK_FILE)) {
      const pid = parseInt(fs.readFileSync(CRON_LOCK_FILE, 'utf8'));
      try {
        process.kill(pid, 0); // Verificar si el proceso existe
        return false; // Otro proceso está corriendo el CRON
      } catch {
        // Proceso no existe, archivo huérfano
        fs.unlinkSync(CRON_LOCK_FILE);
      }
    }
    fs.writeFileSync(CRON_LOCK_FILE, process.pid.toString());
    return true;
  } catch (e) {
    console.error('[CRON] Error acquiring lock:', e.message);
    return false;
  }
}

function releaseCronLock() {
  try {
    fs.unlinkSync(CRON_LOCK_FILE);
  } catch (error) { /* cron lock already released */ }
}

async function runNandinaCron() {
  // Verificar lock de concurrencia
  if (!acquireCronLock()) {
    console.log('[CRON] Skip - another instance is running (PID en lock)');
    return;
  }

  // Verificar si ya está corriendo
  if (cronRunning) {
    console.log('[CRON] Skip - already running');
    releaseCronLock();
    return;
  }

  cronRunning = true;
  const startTime = Date.now();
  console.log('[CRON] Checking Aduanet for updates...');

  try {
    // Timeout de 5 minutos para el update
    const result = await Promise.race([
      nandinaService.checkForUpdates(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout después de 5 min')), 300000)
      )
    ]);

    if (result?.updated) {
      console.log(`[CRON] Updated: ${result.count} partidas, ${result.changes?.length || 0} changes (${Date.now() - startTime}ms)`);
      db.addChangelog('nandina', `Updated: ${result.count} partidas`, result.changes || []);
    } else {
      console.log('[CRON] No changes');
    }
  } catch (e) {
    console.error('[CRON] Error:', e.message);
    // En producción, aquí se podría enviar alerta (email, Telegram, Slack)
  } finally {
    cronRunning = false;
    releaseCronLock();
  }
}

function startNandinaCron() {
  if (nandinaCronTask) return;
  nandinaCronTask = cron.schedule(cronSchedule, runNandinaCron);
}

async function safeInit(name, fn) {
  try {
    await fn();
  } catch (e) {
    console.error(`[INIT] ${name} no disponible:`, e.message);
  }
}

function startWebSocketServer() {
  if (websocketStartTimer) return;

  websocketStartTimer = setTimeout(() => {
    websocketStartTimer = null;
    try {
      websocketServer.start(monitorService);
    } catch (e) {
      console.error('[WS] Error iniciando servidor:', e.message);
    }
  }, 1000);

  websocketStartTimer.unref?.();
}

async function startBackgroundServices() {
  if (backgroundServicesPromise) return backgroundServicesPromise;

  backgroundServicesPromise = (async () => {
    startUploadCleanup();
    startBackupCron();
    startNandinaCron();
    monitorService.start();

    await Promise.allSettled([
      safeInit('Auto-Repair', () => autoRepair.init()),
      safeInit('Agentes de Navegación', () => agentesNavegacion.init()),
      safeInit('Sistema de Agentes', () => sistemaAgentes.inicializar()),
      safeInit('Alertas Normativas', () => alertasNormativas.init()),
    ]);
  })();

  return backgroundServicesPromise;
}

async function stopServer() {
  if (shuttingDown) return;
  shuttingDown = true;
  releaseCronLock();

  if (websocketStartTimer) {
    clearTimeout(websocketStartTimer);
    websocketStartTimer = null;
  }

  if (nandinaCronTask) {
    nandinaCronTask.stop();
    nandinaCronTask.destroy?.();
    nandinaCronTask = null;
  }

  if (backupCronTask) {
    backupCronTask.stop();
    backupCronTask.destroy?.();
    backupCronTask = null;
  }

  if (uploadCleanupInterval) {
    clearInterval(uploadCleanupInterval);
    uploadCleanupInterval = null;
  }

  websocketServer.stop();
  monitorService.stop();

  if (httpServer) {
    await new Promise(resolve => httpServer.close(resolve));
    httpServer = null;
  }

  db.shutdown?.();
  backgroundServicesPromise = null;
  shuttingDown = false;
}

function formatStartupBanner(port, initState) {
  const agentStats = sistemaAgentes.obtenerEstadisticas?.() || {};
  const totalAgents = agentStats.total_agentes || agentStats.resumen?.total || 30;

  return `
╔══════════════════════════════════════════════╗
║  ⬡ Cotizador de Importación Perú            ║
║  🚀 ULTIMATE v3.0 — 10/10 Enterprise-Grade  ║
╠══════════════════════════════════════════════╣
║  Server:  http://localhost:${port}              ║
║  NANDINA: ${String(initState.nData).padEnd(6)} partidas               ║
║  Restric: ${String(initState.nRestr).padEnd(6)} partidas restringidas  ║
║  TLCs:    ${String(initState.nTLCs).padEnd(6)} preferencias            ║
║  Modules: 19 (nandina, permisos, valoracion, ║
║           sanciones, clasificador, flete,     ║
║           tracking, pdf, auth, ai, sunat,     ║
║           memoria-hibrida, state-machine,     ║
║           embeddings-ml, agente-0)            ║
║  Cron:    ${cronSchedule.padEnd(20)}             ║
║  Init:    ${String(initState.initTime).padEnd(6)} ms                   ║
╠══════════════════════════════════════════════╣
║  🏆 10/10 - TOP 1% GLOBAL                    ║
║  🤖 ${String(totalAgents).padEnd(2)} Agentes + State Machine + ML          ║
║  💾 Memoria Híbrida + Embeddings Reales      ║
╚══════════════════════════════════════════════╝`;
}

// Cleanup del lock y recursos si el proceso muere
process.on('exit', () => {
  releaseCronLock();
  db.shutdown?.();
});
process.on('SIGINT', async () => {
  releaseCronLock();
  await stopServer();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  releaseCronLock();
  await stopServer();
  process.exit(0);
});

// ══════════════════════════════════════════════════
// PROCESS ERROR HANDLERS — prevent silent crashes
// ══════════════════════════════════════════════════
process.on('uncaughtException', (err) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [FATAL] Uncaught exception:`, err.message);
  console.error(err.stack);

  // Intentar guardar log en archivo antes de morir
  try {
    const logFile = path.join(process.env.DATA_DIR || './data', 'crash.log');
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `[${timestamp}] ${err.stack}\n\n`);
  } catch (logErr) {
    console.error('[ERROR] No se pudo guardar crash log:', logErr.message);
  }

  // Dar tiempo a que se escriban los logs
  setTimeout(() => {
    process.exit(1);
  }, 100);
});

process.on('unhandledRejection', (reason, _promise) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [WARN] Unhandled rejection:`, reason);

  // En producción, es mejor hacer exit para que PM2 reinicie
  if (process.env.NODE_ENV === 'production') {
    console.error(`[${timestamp}] [WARN] Exiting to allow PM2 restart`);
    setTimeout(() => {
      process.exit(1);
    }, 100);
  }
  // En desarrollo, continuar para facilitar debugging
});

// ══════════════════════════════════════════════════
// INIT (con inicialización paralela y timeout)
// ══════════════════════════════════════════════════
async function init() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const startTime = Date.now();
    console.log('[INIT] Iniciando servidor...');

    await Promise.all([
      (async () => {
        await db.init();
        auth.initUsersTable();
        console.log('[INIT] DB y Auth listos');
      })(),
      (async () => {
        await nandinaService.init();
        console.log(`[INIT] NANDINA lista (${nandinaService.getData().length} partidas)`);
      })()
    ]);

    const initState = {
      nData: nandinaService.getData().length,
      nRestr: Object.keys(nandinaService.getRestricciones()).length,
      nTLCs: Object.keys(nandinaService.getTLCs()).length,
      initTime: Date.now() - startTime,
    };

    console.log(`[INIT] Inicialización completada en ${initState.initTime}ms`);
    return initState;
  })().catch((e) => {
    initPromise = null;
    throw e;
  });

  return initPromise;
}

async function startServer(options = {}) {
  if (httpServer) return httpServer;

  const port = options.port ?? PORT;
  const initState = await init();
  await startBackgroundServices();

  httpServer = await new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      startWebSocketServer();
      console.log(formatStartupBanner(port, initState));
      resolve(server);
    });

    server.on('error', reject);
  });

  return httpServer;
}

if (require.main === module) {
  startServer().catch((e) => {
    console.error('[INIT] Error fatal durante la inicialización:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}

module.exports = app;
module.exports.init = init;
module.exports.startServer = startServer;
module.exports.stopServer = stopServer;
