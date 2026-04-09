const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { buildAllowedOrigins, getProjectRoot, resolveEnvFile } = require('./runtime-config');

const PROJECT_ROOT = getProjectRoot(__dirname);
const envFile = resolveEnvFile({
  projectRoot: PROJECT_ROOT,
  nodeEnv: process.env.NODE_ENV,
});

dotenv.config(envFile ? { path: envFile, override: true } : { override: true });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cron = require('node-cron');
const multer = require('multer');
const os = require('os');
const { version: APP_VERSION } = require('../package.json');
const {
  ALLOWED_UPLOAD_MIMES,
  DocumentIngestionError,
  extractUploadedContent,
} = require('./document-ingestion');

// File upload config - ensure dir exists
const UPLOAD_DIR = path.join(os.tmpdir(), 'cotizador-uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_UPLOAD_MIMES.includes(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('text/')) {
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
let serverStartPromise = null;
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

function sendExtractionError(res, error) {
  if (error instanceof DocumentIngestionError) {
    return res.status(error.statusCode || 422).json({
      error: error.message,
      code: error.code,
      details: error.details || undefined,
    });
  }

  return res.status(500).json({ error: error.message });
}

// Core modules
const db = require('./db');
const nandinaService = require('./nandina');
const sunatProxy = require('./sunat-proxy');

// Backup automatico (diario a las 4 AM)
const { backup: backupDB } = require('../scripts/backup');
const backupSchedule = process.env.BACKUP_CRON || '0 4 * * *';

function startBackupCron() {
  if (backupCronTask) return;

  backupCronTask = cron.schedule(backupSchedule, () => {
    console.log('[BACKUP CRON] Iniciando backup automatico...');
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

// Agente Conversador (Agente 0 - Interfaz con usuario)
const agenteConversador = require('./agente-conversador');

// Memoria Hibrida (Estructural + Semantica + Contexto)
const MemoriaHibrida = require('./memoria-hibrida');
const memoria = new MemoriaHibrida();

// State Machine (Patron LangGraph para flujos deterministicos)
// Embeddings ML Real (Xenova Transformers)
const embeddings = require('./embeddings');

// Auto-Repair (Agentes que aprenden de fallos y se auto-corregir)
const autoRepair = require('./auto-repair');

// Conectores de Gobierno (TIEMPO REAL con entidades)
const conectores = require('./conectores-gobierno');

// Agentes de Navegacion Especialistas (CON APRENDIZAJE)
const agentesNavegacion = require('./agentes-navegacion');

// Sistema unificado de agentes con registro dinamico
const sistemaAgentes = require('./sistema-agentes');

// Alertas Normativas (CAMBIOS NORMATIVOS AUTOMATICOS)
const alertasNormativas = require('./alertas-normativas');

// Exportar Cotizaciones (PDF, Excel, Documentacion)
const exportarCotizacion = require('./exportar-cotizacion');

// Integrador de Logistica (Couriers y Navieras - maximo numero de APIs)
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

// Cotizador Personalizado (Email, Telefono, WhatsApp)
const cotizadorPersonalizado = require('./couriers/cotizador-personalizado');

// Dashboard Enterprise (IA con GROQ)
const dashboardService = require('./dashboard/dashboard-service');

// Monitor del Sistema (Monitoreo en tiempo real)
const monitorService = require('./monitor/monitor-service');

// WebSocket Server (Tiempo real)
const websocketServer = require('./websocket/websocket-server');

// Membresias (Comunidad de importadores)
const membresiasService = require('./membresias/membresias-service');

// Inicializar integrador de logistica
const integradorLogistica = new IntegradorLogistica();

// --------------------------------------------------
// CONFIGURAR APIs GRATUITAS
// --------------------------------------------------

// Shippo (5,000 envios/anio - 20+ couriers)
if (process.env.SHIPPO_TOKEN) {
  integradorLogistica.agregarCourierAPI(new ShippoCourier(process.env.SHIPPO_TOKEN));
  console.log('[LOGISTICA] Shippo configurado para consulta (5,000/anio - 20+ couriers)');
}

// EasyPost (120,000 envios/anio - 100+ couriers)
if (process.env.EASYPOST_TOKEN) {
  integradorLogistica.agregarCourierAPI(new EasyPostCourier(process.env.EASYPOST_TOKEN));
  console.log('[LOGISTICA] EasyPost configurado para consulta (120,000/anio - 100+ couriers)');
}

// AfterShip (100/mes - 700+ couriers)
if (process.env.AFTERSHIP_TOKEN) {
  integradorLogistica.agregarCourierAPI(new AfterShipCourier(process.env.AFTERSHIP_TOKEN));
  console.log('[LOGISTICA] AfterShip configurado para consulta (100/mes - 700+ couriers)');
}

// Pack & Send (sin cuota local rastreada - 15+ couriers)
if (process.env.PACKSEND_TOKEN) {
  integradorLogistica.agregarCourierAPI(new PackSendCourier(process.env.PACKSEND_TOKEN));
  console.log('[LOGISTICA] Pack & Send configurado para consulta (sin cuota local rastreada - 15+ couriers)');
}

// Interparcel (sin cuota local rastreada - 25+ couriers)
if (process.env.INTERPARCEL_TOKEN) {
  integradorLogistica.agregarCourierAPI(new InterparcelCourier(process.env.INTERPARCEL_TOKEN));
  console.log('[LOGISTICA] Interparcel configurado para consulta (sin cuota local rastreada - 25+ couriers)');
}

// Parcel Monkey (sin cuota local rastreada)
if (process.env.PARCELMONKEY_TOKEN) {
  integradorLogistica.agregarCourierAPI(new ParcelMonkeyCourier(process.env.PARCELMONKEY_TOKEN));
  console.log('[LOGISTICA] Parcel Monkey configurado para consulta (sin cuota local rastreada)');
}

// Maersk Spot API
if (process.env.MAERSK_TOKEN) {
  integradorLogistica.agregarNaviera(new MaerskNaviera(process.env.MAERSK_TOKEN));
  console.log('[LOGISTICA] Maersk Spot API configurada para consulta');
}

// MSC Spot API
if (process.env.MSC_TOKEN) {
  integradorLogistica.agregarNaviera(new MSCNaviera(process.env.MSC_TOKEN));
  console.log('[LOGISTICA] MSC Spot API configurada para consulta');
}

// --------------------------------------------------
// CONFIGURAR COURIERS PERSONALIZADOS (CONTRATOS DIRECTOS)
// --------------------------------------------------

// DHL Directo
integradorLogistica.agregarCourierPersonalizado({
  nombre: 'DHL Directo (Contrato)',
  servicio: 'Express Worldwide',
  tiempoEntrega: '3-5 dias',
  tarifas: { base: 15, porKg: 6, minimo: 30 }
});

// FedEx Directo
integradorLogistica.agregarCourierPersonalizado({
  nombre: 'FedEx Directo (Contrato)',
  servicio: 'International Priority',
  tiempoEntrega: '4-6 dias',
  tarifas: { base: 12, porKg: 5, minimo: 25 }
});

// UPS Directo
integradorLogistica.agregarCourierPersonalizado({
  nombre: 'UPS Directo (Contrato)',
  servicio: 'Worldwide Express',
  tiempoEntrega: '3-5 dias',
  tarifas: { base: 14, porKg: 5.5, minimo: 28 }
});

// TNT Directo
integradorLogistica.agregarCourierPersonalizado({
  nombre: 'TNT Directo (Contrato)',
  servicio: 'Express',
  tiempoEntrega: '4-7 dias',
  tarifas: { base: 11, porKg: 4.8, minimo: 24 }
});

// USPS Directo
integradorLogistica.agregarCourierPersonalizado({
  nombre: 'USPS Directo (Contrato)',
  servicio: 'Priority Mail International',
  tiempoEntrega: '6-10 dias',
  tarifas: { base: 10, porKg: 4, minimo: 20 }
});

// --------------------------------------------------
// CONFIGURAR NAVIERAS PERSONALIZADAS (CONTRATOS DIRECTOS)
// --------------------------------------------------

// Maersk
integradorLogistica.agregarNaviera({
  nombre: 'Maersk',
  tiempoEntrega: '28-35 dias',
  tarifasContenedores: { '20ft': 1200, '40ft': 2200, '40ftHC': 2500 },
  tarifasLCL: { porCBM: 55, minimo: 1 }
});

// MSC
integradorLogistica.agregarNaviera({
  nombre: 'MSC',
  tiempoEntrega: '30-38 dias',
  tarifasContenedores: { '20ft': 1150, '40ft': 2100, '40ftHC': 2400 },
  tarifasLCL: { porCBM: 52, minimo: 1 }
});

// Hapag-Lloyd
integradorLogistica.agregarNaviera({
  nombre: 'Hapag-Lloyd',
  tiempoEntrega: '30-40 dias',
  tarifasContenedores: { '20ft': 1180, '40ft': 2150, '40ftHC': 2450 },
  tarifasLCL: { porCBM: 54, minimo: 1 }
});

// CMA CGM
integradorLogistica.agregarNaviera({
  nombre: 'CMA CGM',
  tiempoEntrega: '32-42 dias',
  tarifasContenedores: { '20ft': 1100, '40ft': 2000, '40ftHC': 2300 },
  tarifasLCL: { porCBM: 50, minimo: 1 }
});

// COSCO
integradorLogistica.agregarNaviera({
  nombre: 'COSCO',
  tiempoEntrega: '35-45 dias',
  tarifasContenedores: { '20ft': 1050, '40ft': 1900, '40ftHC': 2200 },
  tarifasLCL: { porCBM: 48, minimo: 1 }
});

console.log('[LOGISTICA] Integrador cargado con el catalogo actual');
console.log(`[LOGISTICA] Couriers configurados: ${integradorLogistica.couriers.length}`);
console.log(`[LOGISTICA] Navieras configuradas: ${integradorLogistica.navieras.length}`);
console.log('[LOGISTICA] APIs disponibles: Shippo, EasyPost, AfterShip, Pack&Send, Interparcel, ParcelMonkey');
console.log('[LOGISTICA] Navieras API: Maersk, MSC');
console.log('[LOGISTICA] Couriers personalizados: DHL, FedEx, UPS, TNT, USPS');
console.log('[LOGISTICA] Navieras personalizadas: Maersk, MSC, Hapag-Lloyd, CMA CGM, COSCO');

const app = express();

function resolveRuntimePort(rawValue, fallbackPort, envName) {
  const parsed = Number.parseInt(String(rawValue ?? '').trim(), 10);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${envName} no configurado o fuera de rango en produccion`);
  }

  return fallbackPort;
}

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());

// CORS con lista blanca (permitir multiples origenes si es necesario)
const allowedOrigins = buildAllowedOrigins(process.env);
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// --------------------------------------------------
// AUTH: Registro, login, proteccion de rutas
// --------------------------------------------------

// Rate limiting para login: max 5 intentos cada 15 minutos por IP
const _loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const LOGIN_MAX_ATTEMPTS = 5;

function checkLoginRate(ip) {
  if (process.env.NODE_ENV === 'test') return true;
  const now = Date.now();
  const entry = _loginAttempts.get(ip) || { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + LOGIN_WINDOW_MS;
  }
  if (entry.count >= LOGIN_MAX_ATTEMPTS) return false;
  entry.count++;
  _loginAttempts.set(ip, entry);
  return true;
}

// Limpieza periodica del Map de intentos de login
const loginRateLimitCleanup = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of _loginAttempts) {
    if (now > entry.resetAt) _loginAttempts.delete(ip);
  }
}, LOGIN_WINDOW_MS);
loginRateLimitCleanup.unref?.();

app.post('/api/auth/register', (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        error: 'El alta publica no esta disponible. Solo el administrador puede autorizar nuevas cuentas.'
      });
    }

    const { email, password, name, company, ruc, communityAccessCode, accessCode, codigoComunidad } = req.body;
    const accessCheck = auth.checkCommunityAccessCode(
      communityAccessCode || accessCode || codigoComunidad
    );
    if (!accessCheck.ok) {
      return res.status(403).json({ error: accessCheck.error });
    }
    const user = auth.register(email, password, name, company, ruc);
    res.json(user);
  } catch (e) { res.status(e.statusCode || 400).json({ error: e.message }); }
});

app.post('/api/auth/login', (req, res) => {
  if (!checkLoginRate(req.ip)) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
  }
  try {
    const { email, password } = req.body;
    const user = auth.login(email, password);
    res.json(user);
  } catch (e) { res.status(e.statusCode || 401).json({ error: e.message }); }
});

app.get('/api/auth/me', auth.requireAuth, (req, res) => {
  res.json(req.user);
});

function resolveScopedUserId(req, explicitUserId) {
  const normalizedExplicitUserId = explicitUserId === undefined || explicitUserId === null || explicitUserId === ''
    ? ''
    : String(explicitUserId).trim();
  const normalizedSessionUserId = req.user?.id === undefined || req.user?.id === null || req.user?.id === ''
    ? ''
    : String(req.user.id).trim();

  if (req.user?.role === 'admin' && normalizedExplicitUserId) {
    return normalizedExplicitUserId;
  }

  if (normalizedExplicitUserId && normalizedSessionUserId && normalizedExplicitUserId !== normalizedSessionUserId) {
    const error = new Error('No puedes acceder a datos de otro usuario.');
    error.statusCode = 403;
    throw error;
  }

  return normalizedSessionUserId || normalizedExplicitUserId;
}

function resolveScopedEmail(req, explicitEmail) {
  const normalizedExplicitEmail = String(explicitEmail || '').trim().toLowerCase();
  const normalizedSessionEmail = String(req.user?.email || '').trim().toLowerCase();

  if (req.user?.role === 'admin' && normalizedExplicitEmail) {
    return normalizedExplicitEmail;
  }

  if (normalizedExplicitEmail && normalizedSessionEmail && normalizedExplicitEmail !== normalizedSessionEmail) {
    const error = new Error('No puedes suscribir un email distinto al de tu cuenta.');
    error.statusCode = 403;
    throw error;
  }

  return normalizedSessionEmail || normalizedExplicitEmail;
}

app.get('/api/admin/users', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    res.json({ users: auth.listUsers() });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

app.post('/api/admin/users', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    const user = auth.createUserByAdmin(req.body);
    res.status(201).json({ user });
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message });
  }
});

app.patch('/api/admin/users/:id', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    const user = auth.updateUserAccess(req.params.id, req.body, req.user.id);
    res.json({ user });
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message });
  }
});

app.post('/api/admin/users/:id/reset-password', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    const password = req.body?.password || req.body?.newPassword;
    auth.resetUserPassword(req.params.id, password);
    res.json({ ok: true });
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message });
  }
});

// --------------------------------------------------
// NANDINA: Base arancelaria completa
// --------------------------------------------------
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
  const clean = normalizeHsRouteParam(req.params.hs).padEnd(10, '0');
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
  const clean = normalizeHsRouteParam(hs).padEnd(10, '0');
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

// --------------------------------------------------
// PERMISOS Y RESTRICCIONES
// --------------------------------------------------
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
  const clean = normalizeHsRouteParam(hs).padEnd(10, '0');
  const partida = data.find(h => h.p === clean) || data.find(h => h.p.startsWith(clean.substring(0, 4)));
  const tlc = nandinaService.getTLCPreference(hs, country);
  const baseAV = partida?.a ?? 0;
  const tlcAV = tlc ? Math.max(0, baseAV * (1 - (tlc.preferencia || 0) / 100)) : baseAV;

  res.json({
    partida: partida ? { ...partida, avConTLC: tlcAV, avSinTLC: baseAV } : null,
    permisos: permisos.consultaPermisos(hs),
    tlc: tlc ? { ...tlc, avOriginal: baseAV, avReducido: tlcAV, ahorro: baseAV - tlcAV } : { hasTLC: false },
    prohibida: nandinaService.isProhibida(hs),
    sunatUrl: `http://www.aduanet.gob.pe/itarancel/arancelS01Alias-accion=buscarPartida&cod_partida=${clean}&esframe=1`,
  });
});

// Batch TLC for all items in a quotation
app.post('/api/tlc/batch', auth.requireAuth, (req, res) => {
  if (!isPlainObject(req.body)) {
    return res.status(400).json({ error: 'Payload debe ser un objeto' });
  }

  const { items, country } = req.body;
  const normalizedCountry = String(country || '').trim();

  if (!Array.isArray(items) || items.length === 0 || normalizedCountry.length < 2) {
    return res.status(400).json({ error: 'items y country requeridos' });
  }

  res.json(items.map(item => {
    const tlc = nandinaService.getTLCPreference(item.hs, normalizedCountry);
    const base = item.adv ?? 0;
    if (tlc?.preferencia > 0) {
      return { hs: item.hs, avOriginal: base, avConTLC: Math.max(0, base * (1 - tlc.preferencia / 100)), acuerdo: tlc.acuerdo, applied: true };
    }
    return { hs: item.hs, avOriginal: base, avConTLC: base, applied: false };
  }));
});

// --------------------------------------------------
// DUDA RAZONABLE / VALORACION
// --------------------------------------------------
app.get('/api/valoracion/estadisticas/:hs', auth.requireAuth, async (req, res) => {
  try {
    const stats = await valoracion.getEstadisticas(req.params.hs, req.query.year);
    res.json(stats);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/valoracion/analizar', auth.requireAuth, async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const { hs, fobUnitario, pesoKg, paisOrigen, year } = req.body;
    const fobUnitarioNumeric = parseRequestNumber(fobUnitario, NaN);
    const pesoKgNumeric = parseRequestNumber(pesoKg, NaN);

    if (!String(hs || '').trim() || !Number.isFinite(fobUnitarioNumeric) || fobUnitarioNumeric <= 0 || !Number.isFinite(pesoKgNumeric) || pesoKgNumeric <= 0) {
      return res.status(400).json({ error: 'hs requerido; fobUnitario y pesoKg deben ser numericos positivos' });
    }

    const stats = await valoracion.getEstadisticas(hs, year);
    const analisis = valoracion.analizarDudaRazonable(fobUnitarioNumeric, pesoKgNumeric, stats, paisOrigen);
    res.json({ estadisticas: stats, analisis });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/valoracion/riesgo/:hs/:fob/:peso/:pais', auth.requireAuth, async (req, res) => {
  try {
    const { hs, fob, peso, pais } = req.params;
    const fobNumeric = parseRequestNumber(fob, NaN);
    const pesoNumeric = parseRequestNumber(peso, NaN);
    if (!Number.isFinite(fobNumeric) || fobNumeric <= 0 || !Number.isFinite(pesoNumeric) || pesoNumeric <= 0) {
      return res.status(400).json({ error: 'fob y peso deben ser numericos positivos' });
    }
    const stats = await valoracion.getEstadisticas(hs);
    res.json(valoracion.analizarDudaRazonable(fobNumeric, pesoNumeric, stats, pais));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --------------------------------------------------
// SANCIONES (OFAC, ONU, UE)
// --------------------------------------------------
app.post('/api/sanciones/verificar', auth.requireAuth, async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }
    const { nombre, pais, tipo } = req.body;
    if (typeof nombre !== 'string' || nombre.trim().length < 3) {
      return res.status(400).json({ error: 'nombre requerido' });
    }
    const result = await sanciones.verificar(nombre, pais, tipo);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --------------------------------------------------
// IA: Clasificacion multi-agente + extraccion
// --------------------------------------------------
app.post('/api/ai/classify', auth.requireAuth, async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const { messages, provider } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages requeridos' });
    }

    const normalizedProvider = typeof provider === 'string' && provider.trim() ? provider.trim() : 'groq';
    const result = await aiProxy.classify(messages, normalizedProvider);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Multi-agent classification (high precision)
app.post('/api/ai/classify-multi', auth.requireAuth, async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }
    const { descripcion, imagen } = req.body;
    if (!descripcion && !imagen) return res.status(400).json({ error: 'Descripcion o imagen requerida' });
    const result = await clasificador.clasificarMultiAgente(descripcion, imagen);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ai/extract', auth.requireAuth, async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }
    const { content, type } = req.body;
    const normalizedType = typeof type === 'string' ? type.trim().toLowerCase() : 'document';
    const hasDocumentContent = normalizedType !== 'image' && typeof content === 'string' && content.trim().length > 0;
    const hasImageContent = normalizedType === 'image' && typeof content === 'string' && /^https?:\/\//i.test(content.trim());

    if (!hasDocumentContent && !hasImageContent) {
      return res.status(400).json({ error: 'content requerido' });
    }

    const result = await aiProxy.extract(content, normalizedType);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --------------------------------------------------
// FLETE: Estimador inteligente (API real + fallback)
// --------------------------------------------------
app.post('/api/flete/estimar', auth.requireAuth, async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const { origen, destino, canal, pesoKg, valorFOB } = req.body;
    const pesoKgNumeric = parseRequestNumber(pesoKg, NaN);

    if (!String(origen || '').trim() || !String(canal || '').trim() || !Number.isFinite(pesoKgNumeric) || pesoKgNumeric <= 0) {
      return res.status(400).json({ error: 'origen y canal requeridos; pesoKg debe ser numerico positivo' });
    }

    const payload = {
      ...req.body,
      destino: String(destino || 'PE').trim() || 'PE',
      pesoKg: pesoKgNumeric,
      valorFOB: parseRequestNumber(valorFOB),
    };

    // Intentar API real primero (si hay API key configurada)
    if (process.env.TRACKINGMORE_API_KEY || process.env.SEARATES_API_KEY) {
      try {
        const result = await fleteApi.cotizarFlete(payload);
        if (result && result.source !== 'referencial') {
          // API real funciono
          return res.json({
            ...result,
            nota: 'Tarifa consultada por API. Sujeta a revision del carrier.',
          });
        }
      } catch (e) {
        console.log(`[FLETE] API real fallo: ${e.message}, usando fallback`);
      }
    }

    // Fallback a estimador referencial
    const result = flete.estimarFlete(payload);
    res.json({
      ...result,
      nota: 'Tarifa referencial de mercado. Solicitar cotizacion formal a freight forwarder.',
    });
  } catch (e) {
    sendExtractionError(res, e);
  }
});

app.get('/api/flete/tarifas', auth.requireAuth, (req, res) => {
  res.json({
    aereo: flete.TARIFAS.aereo,
    maritimo: flete.TARIFAS.maritimo,
    courier: flete.TARIFAS.courier,
    costosPuerto: flete.COSTOS_PUERTO,
    nota: 'Tarifas referenciales de mercado. Sujetas a cambio sin previo aviso.'
  });
});

// Endpoint para verificar si hay API de fletes configurada
app.get('/api/flete/status', auth.requireAuth, (req, res) => {
  const trackingmoreUsoLocal = fleteApi.getTrackingMoreUsageState();
  res.json({
    trackingmore: trackingmoreUsoLocal.enabled,
    searates: !!process.env.SEARATES_API_KEY,
    fallback: true,
    trackingmoreUsoLocal,
    nota: trackingmoreUsoLocal.enabled
      ? 'TrackingMore disponible con cuota diaria local rastreada'
      : 'Sin API key configurada, se usan tarifas referenciales',
  });
});

// Endpoint para ver uso diario de TrackingMore
app.get('/api/flete/usage', auth.requireAuth, auth.requireAdmin, (req, res) => {
  const trackingmore = fleteApi.getTrackingMoreUsageState();
  res.json({
    trackingmore,
    nota: 'La cuota diaria local se reinicia automaticamente a medianoche UTC',
    tip: trackingmore.enabled
      ? 'TrackingMore disponible con cuota diaria local rastreada'
      : 'Configura TRACKINGMORE_API_KEY en .env para usar TrackingMore',
  });
});

// --------------------------------------------------
// TRACKING: Rastreo de embarques
// --------------------------------------------------
app.get('/api/tracking/detect/:number', auth.requireAuth, (req, res) => {
  const carrier = tracking.detectCarrier(req.params.number);
  const urls = tracking.getTrackingUrls(req.params.number);
  res.json({ carrier, urls: urls.urls, recommended: urls.recommended });
});

app.get('/api/tracking/:number', auth.requireAuth, async (req, res) => {
  try {
    const result = await tracking.rastrear(req.params.number);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --------------------------------------------------
// PDF: Documentos profesionales
// --------------------------------------------------
app.post('/api/pdf/cotizacion', auth.requireAuth, (req, res) => {
  try {
    const html = pdfDocs.generarCotizacion(req.body);
    res.type('html').send(html);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/pdf/packing-list', auth.requireAuth, (req, res) => {
  try {
    const html = pdfDocs.generarPackingList(req.body);
    res.type('html').send(html);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/pdf/invoice', auth.requireAuth, (req, res) => {
  try {
    const html = pdfDocs.generarInvoice(req.body);
    res.type('html').send(html);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/pdf/permisos', auth.requireAuth, (req, res) => {
  try {
    const html = pdfDocs.generarResumenPermisos(req.body);
    res.type('html').send(html);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --------------------------------------------------
// AGENTE 0: CONVERSADOR - Interfaz natural con el usuario
// --------------------------------------------------
// El Agente 0 sabe QUE preguntar, en QUE ORDEN, y QUE recomendar.
// Guia al usuario paso a paso hasta tener toda la informacion para
// pasarla al Orquestador (agentes 1-16).

app.post('/api/agente-0/chat', auth.requireAuth, async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const mensaje = typeof req.body.mensaje === 'string' ? req.body.mensaje.trim() : '';
    const contexto = isPlainObject(req.body.contexto) ? req.body.contexto : {};

    if (mensaje.length < 2) {
      return res.status(400).json({ error: 'Mensaje requerido' });
    }

    const resultado = await agenteConversador.agenteConversador(mensaje, contexto);
    res.json(resultado);

  } catch (e) {
    console.error('[AGENTE-0] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agente-0/iniciar', auth.requireAuth, async (req, res) => {
  try {
    // Iniciar nueva conversacion
    const primeraPregunta = agenteConversador.generarPregunta({ datos_previos: {} });
    res.json({
      tipo: 'inicio',
      mensaje: 'Hola! Soy tu asistente de importaciones Peru. Te guiare paso a paso.',
      pregunta: primeraPregunta.pregunta,
      paso: primeraPregunta.paso,
      opciones: primeraPregunta.opciones,
      contexto: { datos_previos: {}, paso_actual: primeraPregunta.paso }
    });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

app.get('/api/agente-0/estado', auth.requireAuth, (req, res) => {
  const stats = sistemaAgentes.obtenerEstadisticas?.() || {};
  const resumen = stats.resumen || {};
  const totalAgentes = stats.total_agentes || resumen.total || 30;

  res.json({
    disponible: true,
    agentes_disponibles: totalAgentes,
    agentes_totales_sistema: totalAgentes,
    agente_0: 'Conversador (guia al usuario)',
    agentes_base_orquestador: resumen.originales || 18,
    agentes_navegacion: resumen.navegacion || 9,
    agentes_soporte: resumen.soporte || 3,
    agentes_1_16: 'Compatibilidad del pipeline base especializado anterior',
    nota: `Agente 0: interfaz natural. Sistema actual: ${resumen.originales || 18} base + ${resumen.navegacion || 9} navegacion + ${resumen.soporte || 3} soporte = ${totalAgentes}.`
  });
});

// --------------------------------------------------
// MEMORIA HIBRIDA - Endpoints
// --------------------------------------------------

// Guardar cotizacion en memoria
app.post('/api/memoria/cotizacion', auth.requireAuth, async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const data = req.body;
    const resultado = await memoria.guardarCotizacion({
      ...data,
      usuario_id: resolveScopedUserId(req, data.usuario_id),
      ip: req.ip
    });
    res.json(resultado);
  } catch (e) {
    console.error('[MEMORIA] Error:', e.message);
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// Buscar cotizaciones
app.get('/api/memoria/cotizaciones', auth.requireAuth, async (req, res) => {
  try {
    const limite = parsePositiveInteger(req.query.limite, 50);
    if (req.query.limite !== undefined && limite === null) {
      return res.status(400).json({ error: 'limite fuera de rango' });
    }

    const filtros = {
      usuario_id: resolveScopedUserId(req, req.query.usuario_id),
      pais_origen: req.query.pais,
      canal: req.query.canal,
      limite
    };
    const resultados = memoria.buscarCotizaciones(filtros);
    res.json(resultados);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// Busqueda semantica de productos
app.post('/api/memoria/buscar', auth.requireAuth, async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const query = typeof req.body.query === 'string' ? req.body.query.trim() : '';
    const topK = parsePositiveInteger(req.body.topK, 5);

    if (req.body.topK !== undefined && topK === null) {
      return res.status(400).json({ error: 'topK fuera de rango' });
    }

    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Query requerida (minimo 2 caracteres)' });
    }

    const resultados = memoria.buscarDocumentos(query, topK);
    res.json({
      query,
      resultados,
      vec_disponible: memoria.vecDisponible,
      tipo_busqueda: memoria.vecDisponible ? 'semantica_vec' : 'texto'
    });
  } catch (e) {
    console.error('[MEMORIA] Busqueda error:', e.message);
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// Obtener contexto de usuario
app.get('/api/memoria/contexto/:usuario_id', auth.requireAuth, async (req, res) => {
  try {
    const contexto = memoria.obtenerContexto(resolveScopedUserId(req, req.params.usuario_id));
    res.json(contexto || {});
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// Guardar contexto de usuario
app.post('/api/memoria/contexto', auth.requireAuth, async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }
    const { usuario_id, tipo_importador, margen_preferido, canal_preferido, pais_preferido } = req.body;
    const scopedUserId = resolveScopedUserId(req, usuario_id);

    if (!scopedUserId) {
      return res.status(400).json({ error: 'usuario_id requerido' });
    }

    const resultado = memoria.guardarContexto({
      usuario_id: scopedUserId,
      tipo_importador,
      margen_preferido,
      canal_preferido,
      pais_preferido
    });
    res.json(resultado);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// Obtener sugerencias inteligentes
app.get('/api/memoria/sugerencias/:usuario_id', auth.requireAuth, async (req, res) => {
  try {
    const sugerencias = memoria.obtenerSugerencias(resolveScopedUserId(req, req.params.usuario_id));
    res.json({ sugerencias });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// Estadisticas de memoria
app.get('/api/memoria/estadisticas', auth.requireAuth, auth.requireAdmin, async (req, res) => {
  try {
    const estadisticas = memoria.obtenerEstadisticas();
    res.json(estadisticas);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// Limpieza de memoria antigua
app.post('/api/memoria/limpiar', auth.requireAuth, auth.requireAdmin, async (req, res) => {
  try {
    const dias = parsePositiveInteger(req.body?.dias, 90);
    if (req.body?.dias !== undefined && dias === null) {
      return res.status(400).json({ error: 'dias fuera de rango' });
    }
    const resultado = memoria.limpiarMemoriaAntigua(dias);
    res.json(resultado);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// Exportar datos de usuario
app.get('/api/memoria/exportar/:usuario_id', auth.requireAuth, async (req, res) => {
  try {
    const datos = memoria.exportarDatos(resolveScopedUserId(req, req.params.usuario_id));
    res.json(datos);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// --------------------------------------------------
// STATE MACHINE - Endpoints
// --------------------------------------------------

// Visualizar estado de state machines
app.get('/api/state/status', auth.requireAuth, (req, res) => {
  res.json({
    disponible: true,
    patron: 'LangGraph-inspired',
    caracteristicas: [
      'Deterministico',
      'Testeable sin LLM',
      'Debuggable',
      'Reintentos automaticos'
    ]
  });
});

// --------------------------------------------------
// EMBEDDINGS ML - Endpoints
// --------------------------------------------------

// Obtener estadisticas de embeddings
app.get('/api/embeddings/stats', auth.requireAuth, auth.requireAdmin, (req, res) => {
  res.json(embeddings.getEmbeddingStats());
});

// Precalentar modelo (para produccion)
app.post('/api/embeddings/warmup', auth.requireAuth, auth.requireAdmin, async (req, res) => {
  try {
    await embeddings.precalentarModelo();
    res.json({ ok: true, mensaje: 'Modelo precalentado' });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// Generar embedding para texto custom
app.post('/api/embeddings/generate', auth.requireAuth, async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const texto = typeof req.body.texto === 'string' ? req.body.texto.trim() : '';

    if (!texto || texto.length < 2) {
      return res.status(400).json({ error: 'Texto requerido (minimo 2 caracteres)' });
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

// Busqueda semantica con ML real
app.post('/api/embeddings/search', auth.requireAuth, async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const query = typeof req.body.query === 'string' ? req.body.query.trim() : '';
    const documentos = req.body.documentos;
    const topK = parsePositiveInteger(req.body.topK, 5);

    if (!query || !documentos || !Array.isArray(documentos)) {
      return res.status(400).json({ error: 'Query y documentos requeridos' });
    }

    if (req.body.topK !== undefined && topK === null) {
      return res.status(400).json({ error: 'topK fuera de rango' });
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

// --------------------------------------------------
// CONECTORES DE GOBIERNO - Endpoints (TIEMPO REAL)
// --------------------------------------------------

// Consultar TODO para una cotizacion (arancel + TC + restricciones + antidumping)
app.get('/api/conectores/consultar-todo', auth.requireAuth, async (req, res) => {
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

// SUNAT - Tipo de cambio
app.get('/api/conectores/sunat/tipo-cambio', auth.requireAuth, async (req, res) => {
  try {
    const tc = await conectores.SUNAT.consultarTipoCambio();
    res.json(tc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SUNAT - Arancel de partida
app.get('/api/conectores/sunat/arancel/:partida', auth.requireAuth, async (req, res) => {
  try {
    const { partida } = req.params;
    const arancel = await conectores.SUNAT.consultarArancel(partida);
    res.json(arancel);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// VUCE - Restricciones por partida
app.get('/api/conectores/vuce/restricciones/:partida', auth.requireAuth, async (req, res) => {
  try {
    const { partida } = req.params;
    const { pais } = req.query;
    const restricciones = await conectores.VUCE.consultarRestricciones(partida, pais || 'CN');
    res.json(restricciones);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// MTC - Homologacion de producto
app.get('/api/conectores/mtc/homologacion', auth.requireAuth, async (req, res) => {
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

// DIGESA - Registro sanitario
app.get('/api/conectores/digesa/registro', auth.requireAuth, async (req, res) => {
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

// SENASA - Permiso fitosanitario
app.get('/api/conectores/senasa/permiso', auth.requireAuth, async (req, res) => {
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

// MINAM - Permiso ambiental
app.get('/api/conectores/minam/permiso', auth.requireAuth, async (req, res) => {
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

// PRODUCE - Permiso de pesca
app.get('/api/conectores/produce/permiso', auth.requireAuth, async (req, res) => {
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

// INDECOPI - Antidumping
app.get('/api/conectores/indecopi/antidumping', auth.requireAuth, async (req, res) => {
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

// ADUANET - Arancel en tiempo real
app.get('/api/conectores/aduanet/arancel/:partida', auth.requireAuth, async (req, res) => {
  try {
    const { partida } = req.params;
    const arancel = await conectores.ADUANET.consultarArancelTiempoReal(partida);
    res.json(arancel);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Limpiar cache de conectores
app.post('/api/conectores/limpiar-cache', auth.requireAuth, auth.requireAdmin, (req, res) => {
  conectores.limpiarCache();
  res.json({ ok: true, mensaje: 'Cache limpiada' });
});

// Estadisticas de cache
app.get('/api/conectores/cache-stats', auth.requireAuth, auth.requireAdmin, (req, res) => {
  res.json(conectores.getCacheStats());
});

// --------------------------------------------------
// AGENTES DE NAVEGACION - Endpoints
// --------------------------------------------------

// Estadisticas generales de agentes
app.get('/api/agentes/stats', auth.requireAuth, auth.requireAdmin, (req, res) => {
  res.json(agentesNavegacion.obtenerEstadisticasGenerales());
});

// SUNAT - Tipo de cambio con agente especialista
app.get('/api/agentes/sunat/tipo-cambio', auth.requireAuth, async (req, res) => {
  try {
    const tc = await agentesNavegacion.SUNAT.consultarTipoCambio();
    res.json(tc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SUNAT - Arancel con agente especialista
app.get('/api/agentes/sunat/arancel/:partida', auth.requireAuth, async (req, res) => {
  try {
    const { partida } = req.params;
    const arancel = await agentesNavegacion.SUNAT.consultarArancel(partida);
    res.json(arancel);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SUNAT - Estadisticas del agente
app.get('/api/agentes/sunat/stats', auth.requireAuth, auth.requireAdmin, (req, res) => {
  res.json(agentesNavegacion.SUNAT.obtenerEstadisticas());
});

// ADUANET - Arancel con agente especialista
app.get('/api/agentes/aduanet/arancel/:partida', auth.requireAuth, async (req, res) => {
  try {
    const { partida } = req.params;
    const arancel = await agentesNavegacion.ADUANET.consultarArancel(partida);
    res.json(arancel);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// VUCE - Restricciones con agente especialista
app.get('/api/agentes/vuce/restricciones/:partida', auth.requireAuth, async (req, res) => {
  try {
    const { partida } = req.params;
    const { pais } = req.query;
    const restricciones = await agentesNavegacion.VUCE.consultarRestricciones(partida, pais || 'CN');
    res.json(restricciones);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// INDECOPI - Antidumping con agente especialista
app.get('/api/agentes/indecopi/antidumping', auth.requireAuth, async (req, res) => {
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

// MTC - Homologacion con agente especialista
app.get('/api/agentes/mtc/homologacion', auth.requireAuth, async (req, res) => {
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

// DIGESA - Registro sanitario con agente especialista
app.get('/api/agentes/digesa/registro', auth.requireAuth, async (req, res) => {
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

// SENASA - Permiso fitosanitario con agente especialista
app.get('/api/agentes/senasa/permiso', auth.requireAuth, async (req, res) => {
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

// MINAM - Permiso ambiental con agente especialista
app.get('/api/agentes/minam/permiso', auth.requireAuth, async (req, res) => {
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

// PRODUCE - Permiso de pesca con agente especialista
app.get('/api/agentes/produce/permiso', auth.requireAuth, async (req, res) => {
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

// --------------------------------------------------
// SISTEMA UNIFICADO DE AGENTES - Endpoints
// --------------------------------------------------

// Estadisticas generales de todos los agentes
app.get('/api/sistema/stats', auth.requireAuth, auth.requireAdmin, (req, res) => {
  res.json(sistemaAgentes.obtenerEstadisticas());
});

// Consulta unificada de gobierno (tipo dinamico)
app.get('/api/sistema/consulta', auth.requireAuth, async (req, res) => {
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

// Detectar requisitos automaticos de producto
app.get('/api/sistema/requisitos', auth.requireAuth, async (req, res) => {
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

// Generar reporte completo de importacion
app.get('/api/sistema/reporte', auth.requireAuth, async (req, res) => {
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

// --------------------------------------------------
// AUTO-REPAIR - Endpoints (agentes que se autocorrigen)
// --------------------------------------------------

// Estadisticas de auto-reparacion
app.get('/api/auto-repair/stats', auth.requireAuth, auth.requireAdmin, (req, res) => {
  const stats = autoRepair.getEstadisticas();
  res.json(stats);
});

// Obtener patrones de fallos por agente
app.get('/api/auto-repair/patrones/:agente', auth.requireAuth, auth.requireAdmin, (req, res) => {
  const patrones = autoRepair.obtenerPatrones(req.params.agente);
  res.json({ agente: req.params.agente, patrones });
});

// Obtener conocimiento de un agente
app.get('/api/auto-repair/knowledge/:agente/:clave', auth.requireAuth, auth.requireAdmin, (req, res) => {
  const conocimiento = autoRepair.obtenerConocimiento(req.params.agente, req.params.clave);
  res.json({ agente: req.params.agente, clave: req.params.clave, conocimiento });
});

// Guardar conocimiento manualmente
app.post('/api/auto-repair/knowledge', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const { agente, clave, valor, confianza } = req.body;

    if (!agente || !clave || valor === undefined) {
      return res.status(400).json({ error: 'agente, clave y valor requeridos' });
    }

    const confianzaNormalizada = confianza === undefined ? 1.0 : parseRequestNumber(confianza, NaN);
    if (!Number.isFinite(confianzaNormalizada) || confianzaNormalizada < 0 || confianzaNormalizada > 1) {
      return res.status(400).json({ error: 'confianza fuera de rango' });
    }

    autoRepair.guardarConocimiento(agente, clave, valor, confianzaNormalizada);
    res.json({ ok: true, mensaje: 'Conocimiento guardado' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Limpiar datos antiguos
app.post('/api/auto-repair/cleanup', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    const dias = parsePositiveInteger(req.body?.dias, 30);
    if (req.body?.dias !== undefined && dias === null) {
      return res.status(400).json({ error: 'dias fuera de rango' });
    }
    const resultado = autoRepair.limpiarDatosAntiguos(dias);
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --------------------------------------------------
// ALERTAS NORMATIVAS - Endpoints (cambios normativos)
// --------------------------------------------------

// Obtener estadisticas de alertas
app.get('/api/alertas/stats', auth.requireAuth, auth.requireAdmin, (req, res) => {
  const stats = alertasNormativas.obtenerEstadisticas();
  res.json(stats);
});

// Obtener alertas no leidas
app.get('/api/alertas/no-leidas', auth.requireAuth, (req, res) => {
  const alertas = alertasNormativas.obtenerAlertasNoLeidas();
  res.json({ alertas, total: alertas.length });
});

// Obtener todas las alertas (con paginacion)
app.get('/api/alertas', auth.requireAuth, (req, res) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const limit = parsePositiveInteger(req.query.limit, 20);
    if ((req.query.page !== undefined && page === null) || (req.query.limit !== undefined && limit === null)) {
      return res.status(400).json({ error: 'page y limit deben ser enteros positivos' });
    }
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

// Marcar alerta como leida
app.post('/api/alertas/leida/:id', auth.requireAuth, (req, res) => {
  try {
    const exito = alertasNormativas.marcarAlertaLeida(req.params.id);
    if (!exito) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }
    res.json({ ok: exito });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Marcar todas las alertas como leidas
app.post('/api/alertas/todas-leidas', auth.requireAuth, (req, res) => {
  try {
    const cantidad = alertasNormativas.marcarTodasLeidas();
    res.json({ ok: true, cantidad });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Suscribirse a alertas
app.post('/api/alertas/suscribir', auth.requireAuth, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const { email, tipos, telegram_chat_id } = req.body;
    const scopedEmail = resolveScopedEmail(req, email);
    const tiposNormalizados = tipos === undefined
      ? []
      : Array.isArray(tipos)
        ? tipos.filter((tipo) => typeof tipo === 'string' && tipo.trim())
        : null;

    if (!scopedEmail) {
      return res.status(400).json({ error: 'email requerido' });
    }

    if (!tiposNormalizados) {
      return res.status(400).json({ error: 'tipos debe ser un arreglo' });
    }

    const id = alertasNormativas.suscribirAlertas(scopedEmail, tiposNormalizados, telegram_chat_id);
    res.json({ ok: true, id, mensaje: 'Suscripcion registrada' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Crear alerta manualmente (para testing)
app.post('/api/alertas/crear', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const { tipo, entidad, titulo, descripcion, nivel, partida_afectada, pais_afectado } = req.body;

    if (!tipo || !entidad || !titulo) {
      return res.status(400).json({ error: 'tipo, entidad y titulo requeridos' });
    }

    const id = alertasNormativas.crearAlerta(tipo, entidad, titulo, descripcion, {
      nivel: typeof nivel === 'string' && nivel.trim() ? nivel.trim() : 'info',
      partida_afectada,
      pais_afectado
    });
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Detectar cambios automaticamente (trigger manual)
app.post('/api/alertas/detectar-cambios', auth.requireAuth, auth.requireAdmin, async (req, res) => {
  try {
    await alertasNormativas.detectarCambiosAutomaticos();
    res.json({ ok: true, mensaje: 'Deteccion completada' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Limpiar alertas antiguas
app.post('/api/alertas/limpiar', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    const dias = parsePositiveInteger(req.body?.dias, 90);
    if (req.body?.dias !== undefined && dias === null) {
      return res.status(400).json({ error: 'dias fuera de rango' });
    }
    const resultado = alertasNormativas.limpiarAlertasAntiguas(dias);
    res.json({ ok: true, eliminadas: resultado });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --------------------------------------------------
// LOGISTICA - Endpoints (Couriers y Navieras)
// --------------------------------------------------

// Cotizar con todos los couriers y navieras
app.post('/api/logistica/cotizar', auth.requireAuth, async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const datos = {
      ...req.body,
      peso: parseRequestNumber(req.body.peso, NaN)
    };

    if (!datos.origen || !datos.destino || !Number.isFinite(datos.peso) || datos.peso <= 0) {
      return res.status(400).json({ error: 'origen, destino y peso requeridos' });
    }

    const resultados = await integradorLogistica.cotizarTodo(datos);
    res.json(resultados);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Listar todas las empresas configuradas
app.get('/api/logistica/empresas', auth.requireAuth, (req, res) => {
  try {
    const empresas = integradorLogistica.listarEmpresas();
    res.json(empresas);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener estado de contingencia de APIs
app.get('/api/logistica/contingencia', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    const contingencia = integradorLogistica.obtenerContingencia();
    res.json(contingencia);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener prioridad de couriers
app.get('/api/logistica/prioridad', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    const prioridad = integradorLogistica.obtenerPrioridad();
    res.json(prioridad);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Resetear uso de API (admin)
app.post('/api/logistica/reset/:api', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    const { api } = req.params;
    const contingencia = require('./couriers/contingencia-api');
    const reseteado = contingencia.resetearUso(api);
    res.json({ ok: reseteado, mensaje: reseteado ? `API ${api} reseteada` : 'API no encontrada o sin cuota local rastreada' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --------------------------------------------------
// COTIZACION PERSONALIZADA - Endpoints (Email, Tel, WhatsApp)
// --------------------------------------------------

// Cotizar por email automatico
app.post('/api/logistica/cotizar-email', auth.requireAuth, async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const { courier, datos } = req.body;

    if (!String(courier || '').trim() || !isPlainObject(datos)) {
      return res.status(400).json({ error: 'courier y datos requeridos' });
    }

    const resultado = await cotizadorPersonalizado.cotizarPorEmail(courier, datos);
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cotizar por telefono
app.post('/api/logistica/cotizar-telefono', auth.requireAuth, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const { courier, datos } = req.body;

    if (!String(courier || '').trim() || !isPlainObject(datos)) {
      return res.status(400).json({ error: 'courier y datos requeridos' });
    }

    const resultado = cotizadorPersonalizado.cotizarPorTelefono(courier, datos);
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cotizar por WhatsApp
app.post('/api/logistica/cotizar-whatsapp', auth.requireAuth, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const { courier, datos } = req.body;

    if (!String(courier || '').trim() || !isPlainObject(datos)) {
      return res.status(400).json({ error: 'courier y datos requeridos' });
    }

    const resultado = cotizadorPersonalizado.cotizarPorWhatsApp(courier, datos);
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener tarifas negociadas (contratos)
app.post('/api/logistica/tarifas-negociadas', auth.requireAuth, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const { courier, datos } = req.body;

    if (!String(courier || '').trim() || !isPlainObject(datos)) {
      return res.status(400).json({ error: 'courier y datos requeridos' });
    }

    const resultado = cotizadorPersonalizado.obtenerTarifasNegociadas(courier, datos);
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cotizar con fallback referencial
app.post('/api/logistica/cotizar-fallback', auth.requireAuth, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const datos = {
      ...req.body,
      peso: parseRequestNumber(req.body.peso, NaN)
    };

    if (!datos.origen || !datos.destino || !Number.isFinite(datos.peso) || datos.peso <= 0) {
      return res.status(400).json({ error: 'origen, destino y peso requeridos' });
    }

    const resultado = cotizadorPersonalizado.cotizarFallback(datos);
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener cotizaciones personalizadas
app.get('/api/logistica/cotizaciones-personalizadas', auth.requireAuth, auth.requireAdmin, (req, res) => {
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

// Obtener cotizacion por ID
app.get('/api/logistica/cotizacion-personalizada/:id', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    const cotizacion = cotizadorPersonalizado.obtenerCotizacion(req.params.id);

    if (!cotizacion) {
      return res.status(404).json({ error: 'Cotizacion no encontrada' });
    }

    res.json(cotizacion);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Actualizar cotizacion (respuesta)
app.post('/api/logistica/cotizacion-personalizada/:id/respuesta', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const respuesta = typeof req.body.respuesta === 'string' ? req.body.respuesta.trim() : '';

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
app.get('/api/logistica/contactos', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    const contactos = cotizadorPersonalizado.obtenerContactos();
    res.json(contactos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Agregar contacto de courier
app.post('/api/logistica/contactos', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const { slug, datos } = req.body;

    if (!String(slug || '').trim() || !isPlainObject(datos)) {
      return res.status(400).json({ error: 'slug y datos requeridos' });
    }

    const contacto = cotizadorPersonalizado.agregarContacto(String(slug).trim(), datos);
    res.json(contacto);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener estadisticas de cotizacion personalizada
app.get('/api/logistica/estadisticas-personalizadas', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    const estadisticas = cotizadorPersonalizado.obtenerEstadisticas();
    res.json(estadisticas);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --------------------------------------------------
// DASHBOARD ENTERPRISE - Endpoints (IA con GROQ)
// --------------------------------------------------

// Obtener datos completos del dashboard
app.get('/api/dashboard', auth.requireAuth, async (req, res) => {
  try {
    const filtros = {
      desde: req.query.desde,
      hasta: req.query.hasta,
      pais: req.query.pais,
      courier: req.query.courier,
      scope: req.query.scope,
      viewerUserId: req.user.id,
      viewerRole: req.user.role,
    };

    const datos = await dashboardService.obtenerDatosDashboard(filtros);
    res.json(datos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener analisis con IA
app.get('/api/dashboard/analisis', auth.requireAuth, async (req, res) => {
  try {
    const filtros = {
      desde: req.query.desde,
      hasta: req.query.hasta,
      scope: req.query.scope,
      viewerUserId: req.user.id,
      viewerRole: req.user.role,
    };

    const datos = await dashboardService.obtenerDatosDashboard(filtros);
    const analisis = await dashboardService.analizarConIA(datos);

    res.json({
      datos,
      analisis,
      modelo: 'llama-3.1-8b-instant',
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener graficos sugeridos por IA
app.get('/api/dashboard/graficos-sugeridos', auth.requireAuth, async (req, res) => {
  try {
    const filtros = {
      desde: req.query.desde,
      hasta: req.query.hasta,
      scope: req.query.scope,
      viewerUserId: req.user.id,
      viewerRole: req.user.role,
    };

    const datos = await dashboardService.obtenerDatosDashboard(filtros);
    const graficos = await dashboardService.sugerirGraficos(datos);

    res.json({
      graficos,
      modelo: 'llama-3.1-8b-instant',
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Chat con datos (preguntar cualquier cosa)
app.post('/api/dashboard/chat', auth.requireAuth, async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const pregunta = typeof req.body.pregunta === 'string' ? req.body.pregunta.trim() : '';
    const { scope } = req.body;

    if (!pregunta) {
      return res.status(400).json({ error: 'pregunta requerida' });
    }

    const datos = await dashboardService.obtenerDatosDashboard({
      scope,
      viewerUserId: req.user.id,
      viewerRole: req.user.role,
    });
    const respuesta = await dashboardService.chatConDatos(pregunta, datos);

    res.json({
      pregunta,
      respuesta,
      modelo: 'llama-3.1-8b-instant',
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Generar SQL con IA
app.post('/api/dashboard/generar-sql', auth.requireAuth, async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const pregunta = typeof req.body.pregunta === 'string' ? req.body.pregunta.trim() : '';

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
      modelo: 'qwen-2.5-coder-32b',
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener estadisticas del dashboard
app.get('/api/dashboard/estadisticas', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    const estadisticas = dashboardService.obtenerEstadisticas();
    res.json(estadisticas);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Limpiar cache del dashboard
app.post('/api/dashboard/limpiar-cache', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    dashboardService.limpiarCache();
    res.json({ ok: true, mensaje: 'Cache limpiada' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --------------------------------------------------
// MONITOR DEL SISTEMA - Endpoints (monitoreo)
// --------------------------------------------------

// Salud del sistema
app.get('/api/monitor/health', (req, res) => {
  try {
    const salud = monitorService.obtenerSalud();
    res.json(salud);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Metricas detalladas
app.get('/api/monitor/metricas', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    const metricas = monitorService.obtenerMetricas();
    res.json(metricas);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Alertas del sistema
app.get('/api/monitor/alertas', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    const alertas = monitorService.obtenerAlertas();
    res.json(alertas);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Marcar alerta como leida
app.post('/api/monitor/alertas/:id/leida', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    const alertId = parsePositiveInteger(req.params.id, null);
    if (alertId === null) {
      return res.status(400).json({ error: 'id debe ser numerico positivo' });
    }

    const exito = monitorService.marcarAlertaLeida(alertId);
    if (!exito) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }
    res.json({ ok: exito });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Limpiar alertas leidas
app.post('/api/monitor/alertas/limpiar', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    const resultado = monitorService.limpiarAlertasLeidas();
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Agregar courier personalizado
app.post('/api/logistica/courier', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const config = req.body;

    if (!String(config.nombre || '').trim() || !isPlainObject(config.tarifas)) {
      return res.status(400).json({ error: 'nombre y tarifas requeridos' });
    }

    integradorLogistica.agregarCourierPersonalizado(config);
    res.json({ ok: true, mensaje: 'Courier agregado' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Agregar naviera personalizada
app.post('/api/logistica/naviera', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const config = req.body;

    if (!String(config.nombre || '').trim() || !isPlainObject(config.tarifasContenedores)) {
      return res.status(400).json({ error: 'nombre y tarifasContenedores requeridos' });
    }

    integradorLogistica.agregarNaviera(config);
    res.json({ ok: true, mensaje: 'Naviera agregada' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --------------------------------------------------
// MEMBRESIAS - Endpoints (comunidad)
// --------------------------------------------------

// Registro con codigo de invitacion
app.post('/api/membresias/registro', async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const nombre = typeof req.body.nombre === 'string' ? req.body.nombre.trim() : '';
    const codigoInvitacion = typeof req.body.codigoInvitacion === 'string' ? req.body.codigoInvitacion.trim() : '';

    if (!email || !String(password).trim() || !nombre || !codigoInvitacion) {
      return res.status(400).json({ error: 'email, password, nombre y codigoInvitacion requeridos' });
    }

    const usuario = await membresiasService.registrarUsuario(email, password, nombre, codigoInvitacion);
    res.json({ ok: true, usuario });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Generar codigo de invitacion
app.post('/api/membresias/generar-codigo', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const tipo = typeof req.body.tipo === 'string' && req.body.tipo.trim() ? req.body.tipo.trim().toUpperCase() : 'NORMAL';
    const usosMaximos = req.body.usosMaximos === undefined ? 1 : parsePositiveInteger(req.body.usosMaximos, null);

    if (!['NORMAL', 'PREMIUM', 'VIP'].includes(tipo) || usosMaximos === null) {
      return res.status(400).json({ error: 'tipo fuera de catalogo o usosMaximos fuera de rango' });
    }

    const codigo = membresiasService.generarCodigoInvitacion(req.user.id, tipo, usosMaximos);
    res.json({ ok: true, codigo });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Obtener membresia del usuario actual
app.get('/api/membresias/mi-membresia', auth.requireAuth, (req, res) => {
  try {
    const membresia = membresiasService.obtenerMembresia(req.user.id);
    res.json(membresia);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Verificar limites de uso
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
    const activo = parseBooleanQuery(req.query.activo, undefined);
    if (req.query.activo !== undefined && activo === null) {
      return res.status(400).json({ error: 'activo debe ser booleano' });
    }
    const filtros = {
      nivel: req.query.nivel,
      activo
    };
    const miembros = membresiasService.listarMiembros(filtros);
    res.json(miembros);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Obtener estadisticas de membresias (solo admin)
app.get('/api/membresias/estadisticas', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    const estadisticas = membresiasService.obtenerEstadisticas();
    res.json(estadisticas);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Registrar pago de membresia
app.post('/api/membresias/pago', auth.requireAuth, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const { monto, nivel, periodo } = req.body;
    const montoNormalizado = parseRequestNumber(monto, NaN);
    const nivelNormalizado = typeof nivel === 'string' ? nivel.trim().toUpperCase() : '';
    const periodoNormalizado = typeof periodo === 'string' ? periodo.trim().toLowerCase() : '';

    if (!Number.isFinite(montoNormalizado) || montoNormalizado <= 0 || !['GRATIS', 'PREMIUM', 'VIP'].includes(nivelNormalizado) || !['mensual', 'anual'].includes(periodoNormalizado)) {
      return res.status(400).json({ error: 'monto, nivel y periodo requeridos' });
    }

    const resultado = membresiasService.registrarPago(req.user.id, montoNormalizado, nivelNormalizado, periodoNormalizado, 'pendiente');
    res.json(resultado);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Actualizar estado de pago (solo admin)
app.post('/api/membresias/pago/:id/actualizar', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const pagoId = parsePositiveInteger(req.params.id, null);
    const estado = typeof req.body.estado === 'string' ? req.body.estado.trim().toLowerCase() : '';

    if (pagoId === null || !['pendiente', 'pagado', 'cancelado'].includes(estado)) {
      return res.status(400).json({ error: 'estado requerido' });
    }

    const resultado = membresiasService.actualizarEstadoPago(pagoId, estado);
    res.json(resultado);
  } catch (e) {
    res.status(e.message === 'Pago no encontrado' ? 404 : 400).json({ error: e.message });
  }
});

// --------------------------------------------------
// EXPORTAR COTIZACIONES - Endpoints (PDF, Excel)
// --------------------------------------------------

// Exportar cotizacion a PDF
app.post('/api/exportar/pdf', auth.requireAuth, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }

    const cotizacion = req.body;

    if (!isExportableQuotation(cotizacion)) {
      return res.status(400).json({ error: 'Cotizacion incompleta' });
    }

    const pdf = exportarCotizacion.exportarCotizacion(cotizacion, 'pdf', {
      incluirDocumentacion: true,
      incluirRecomendaciones: true,
      incluirApuntes: true
    });

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="${buildExportFilename(cotizacion, 'html')}"`);
    res.send(pdf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Exportar cotizacion a Excel (CSV)
app.post('/api/exportar/excel', auth.requireAuth, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }
    const cotizacion = req.body;

    if (!isExportableQuotation(cotizacion)) {
      return res.status(400).json({ error: 'Cotizacion incompleta' });
    }

    const excel = exportarCotizacion.exportarCotizacion(cotizacion, 'excel');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${buildExportFilename(cotizacion, 'csv')}"`);
    res.send(excel);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener documentacion requerida
app.post('/api/exportar/documentacion', auth.requireAuth, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }
    const cotizacion = req.body;
    if (!isExportableQuotation(cotizacion)) {
      return res.status(400).json({ error: 'Cotizacion incompleta' });
    }
    const documentacion = exportarCotizacion.generarDocumentacion(cotizacion);
    res.json({ documentos: documentacion });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener recomendaciones
app.post('/api/exportar/recomendaciones', auth.requireAuth, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }
    const cotizacion = req.body;
    if (!isExportableQuotation(cotizacion)) {
      return res.status(400).json({ error: 'Cotizacion incompleta' });
    }
    const recomendaciones = exportarCotizacion.generarRecomendaciones(cotizacion);
    res.json({ recomendaciones });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener apuntes importantes
app.post('/api/exportar/apuntes', auth.requireAuth, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }
    const cotizacion = req.body;
    if (!isExportableQuotation(cotizacion)) {
      return res.status(400).json({ error: 'Cotizacion incompleta' });
    }
    const apuntes = exportarCotizacion.generarApuntes(cotizacion);
    res.json({ apuntes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Simular fallo y solucion (para testing)
app.post('/api/auto-repair/test', auth.requireAuth, auth.requireAdmin, (req, res) => {
  try {
    if (!isPlainObject(req.body) || !isPlainObject(req.body.error)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }
    const { agente, error, solucion } = req.body;

    // Registrar fallo
    const failureId = autoRepair.registrarFallo(agente, {
      type: error.type || 'test_error',
      message: error.message || 'Error de test'
    }, { test: true });

    // Registrar solucion
    const exito = autoRepair.registrarSolucion(failureId, solucion, true, 100);

    res.json({
      ok: exito,
      failure_id: failureId,
      mensaje: exito ? 'Fallo y solucion registrados' : 'Error registrando solucion'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =================================================================
// AGENTE ORQUESTADOR - un solo endpoint, todo automatico
// =================================================================
// El usuario manda lo que tenga (PDF, DOCX, XLSX, imagen, texto o items).

app.post('/api/agente/extraer', auth.requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!checkRate(req.ip)) return res.status(429).json({ error: 'Limite alcanzado' });
    let contenido, tipo;

    if (req.file) {
      try {
        const extraido = await extractUploadedContent(req.file);
        contenido = extraido.contenido;
        tipo = extraido.tipo;
      } finally {
        try { fs.unlinkSync(req.file.path); } catch (error) { /* temp upload cleanup */ }
      }
    } else if (isPlainObject(req.body) && req.body.texto) {
      contenido = req.body.texto;
      tipo = 'text';
    } else {
      return res.status(400).json({ error: 'Sube archivo o pega texto' });
    }

    const resultado = await agente.orquestar({ contenido, tipo, soloExtraer: true });
    res.json(resultado);
  } catch (e) {
    sendExtractionError(res, e);
  }
});

app.post('/api/agente/calcular', auth.requireAuth, async (req, res) => {
  try {
    if (!checkRate(req.ip, 500)) return res.status(429).json({ error: 'Limite alcanzado' });
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }
    const resultado = await agente.orquestar(req.body);
    const quotationId = guardarCotizacionCalculada(req, req.body, resultado);
    res.json({
      ...resultado,
      quotationId: quotationId || resultado.quotationId || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agente', auth.requireAuth, async (req, res) => {
  try {
    if (!checkRate(req.ip, 500)) return res.status(429).json({ error: 'Limite alcanzado' });
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }
    const resultado = await agente.orquestar(req.body);
    const quotationId = guardarCotizacionCalculada(req, req.body, resultado);
    res.json({
      ...resultado,
      quotationId: quotationId || resultado.quotationId || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =================================================================
// AUTO-COTIZAR (compatibilidad con el flujo anterior)
// =================================================================
const _rateLimit = {};
const RATE_LIMIT_CLEANUP_INTERVAL = 3600000;

function checkRate(ip, maxPerHour = 200) {
  const now = Date.now();
  if (!_rateLimit[ip]) _rateLimit[ip] = [];
  _rateLimit[ip] = _rateLimit[ip].filter((t) => now - t < 3600000);

  if (_rateLimit[ip].length >= maxPerHour) return false;
  _rateLimit[ip].push(now);
  return true;
}

const rateLimitCleanupInterval = setInterval(() => {
  const now = Date.now();
  const ips = Object.keys(_rateLimit);
  let cleaned = 0;

  for (const ip of ips) {
    _rateLimit[ip] = _rateLimit[ip].filter((t) => now - t < 3600000);
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

app.post('/api/auto-cotizar/extraer', auth.requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!checkRate(req.ip)) return res.status(429).json({ error: 'Limite de consultas alcanzado. Intenta en 1 hora.' });
    let contenido, tipo;

    if (req.file) {
      try {
        const extraido = await extractUploadedContent(req.file);
        contenido = extraido.contenido;
        tipo = extraido.tipo;
      } finally {
        try { fs.unlinkSync(req.file.path); } catch (error) { /* temp upload cleanup */ }
      }
    } else if (isPlainObject(req.body) && req.body.texto) {
      contenido = req.body.texto;
      tipo = 'text';
    } else {
      return res.status(400).json({ error: 'Sube un archivo o pega el texto de la cotizacion' });
    }

    const resultado = await autoCotizar.extraer(contenido, tipo);
    res.json(resultado);
  } catch (e) {
    console.error('[AUTO-COTIZAR/EXTRAER] Error:', e.message);
    sendExtractionError(res, e);
  }
});

app.post('/api/auto-cotizar/calcular', auth.requireAuth, async (req, res) => {
  try {
    if (!checkRate(req.ip, 500)) return res.status(429).json({ error: 'Limite alcanzado' });
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }
    const { items, pais, canal, incoterm, flete, seguro, tc, proveedor,
      moneda, tcMoneda, tipoImportador, tipoSujeto, objetivoCalculo, seguroModo, margenVenta } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Items requeridos. Primero usa /extraer.' });

    const resultado = await autoCotizar.calcular({
      items, pais, canal, incoterm,
      fleteManual: parseRequestNumber(flete),
      seguroManual: parseRequestNumber(seguro),
      tc: parseRequestNumber(tc),
      proveedor, moneda, tcMoneda: parseRequestNumber(tcMoneda),
      tipoImportador,
      tipoSujeto,
      objetivoCalculo,
      seguroModo,
      margenVenta: parseRequestNumber(margenVenta, 30),
    });

    const quotationId = guardarCotizacionCalculada(req, req.body, resultado);
    res.json({
      ...resultado,
      quotationId: quotationId || resultado.quotationId || null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auto-cotizar/directo', auth.requireAuth, async (req, res) => {
  try {
    if (!checkRate(req.ip, 500)) return res.status(429).json({ error: 'Limite alcanzado' });
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }
    const { items, pais, canal, incoterm, flete, seguro, tc, proveedor,
      moneda, tcMoneda, tipoImportador, tipoSujeto, objetivoCalculo, seguroModo, margenVenta } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Items requeridos' });

    const resultado = await autoCotizar.calcular({
      items, pais, canal, incoterm,
      fleteManual: parseRequestNumber(flete),
      seguroManual: parseRequestNumber(seguro),
      tc: parseRequestNumber(tc),
      proveedor, moneda, tcMoneda: parseRequestNumber(tcMoneda),
      tipoImportador,
      tipoSujeto,
      objetivoCalculo,
      seguroModo,
      margenVenta: parseRequestNumber(margenVenta, 30),
    });

    const quotationId = guardarCotizacionCalculada(req, req.body, resultado);
    res.json({
      ...resultado,
      quotationId: quotationId || resultado.quotationId || null,
    });
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

// Incoterm info - what each term includes/excludes
app.get('/api/incoterms', (req, res) => {
  res.json(autoCotizar.INCOTERM_INFO);
});

// Incoterm adjustment preview
app.post('/api/incoterms/ajustar', auth.requireAuth, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }
    const { precio, incoterm, flete, seguro } = req.body;
    const precioNormalizado = parseRequestNumber(precio, NaN);
    if (!Number.isFinite(precioNormalizado) || precioNormalizado <= 0) {
      return res.status(400).json({ error: 'precio requerido' });
    }
    const resultado = autoCotizar.ajustarIncoterm(
      precioNormalizado,
      incoterm || 'FOB',
      parseRequestNumber(flete),
      parseRequestNumber(seguro),
      precioNormalizado
    );
    res.json(resultado);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// TC Sensitivity analysis
app.post('/api/sensibilidad-tc', auth.requireAuth, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }
    const { totalUSD, tc, variaciones } = req.body;
    const totalUsdNumeric = parseRequestNumber(totalUSD, NaN);
    const tcNumeric = parseRequestNumber(tc, NaN);
    if (!Number.isFinite(totalUsdNumeric) || !Number.isFinite(tcNumeric) || tcNumeric <= 0) {
      return res.status(400).json({ error: 'totalUSD y tc numericos requeridos' });
    }
    if (variaciones !== undefined && !Array.isArray(variaciones)) {
      return res.status(400).json({ error: 'variaciones debe ser un arreglo' });
    }
    const result = autoCotizar.calcularSensibilidadTC(
      totalUsdNumeric,
      tcNumeric,
      variaciones
    );
    res.json(result || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --------------------------------------------------
// REGIMENES ADUANEROS
// --------------------------------------------------

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
  if (!r) return res.status(404).json({ error: 'Regimen no encontrado' });
  res.json(r);
});

// Drawback calculator
app.post('/api/regimenes/drawback', auth.requireAuth, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }
    const { fobExportacion, insumosImportados } = req.body;
    const fobNumeric = parseRequestNumber(fobExportacion, NaN);
    if (!Number.isFinite(fobNumeric) || fobNumeric <= 0) {
      return res.status(400).json({ error: 'fobExportacion requerido' });
    }
    res.json(regimenes.calcularDrawback(fobNumeric, parseRequestNumber(insumosImportados)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admision Temporal calculator (guarantee amount)
app.post('/api/regimenes/admision-temporal', auth.requireAuth, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }
    const { cif, adValorem, isc, igv, ipm, plazoMeses } = req.body;
    const cifNumeric = parseRequestNumber(cif, NaN);
    if (!Number.isFinite(cifNumeric) || cifNumeric <= 0) return res.status(400).json({ error: 'cif requerido' });
    res.json(regimenes.calcularAdmisionTemporal(
      cifNumeric,
      parseRequestNumber(adValorem),
      parseRequestNumber(isc),
      parseRequestNumber(igv),
      parseRequestNumber(ipm),
      parseRequestNumber(plazoMeses, 0)
    ));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Perfeccionamiento Pasivo calculator
app.post('/api/regimenes/perfeccionamiento-pasivo', auth.requireAuth, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }
    const { valorOriginal, costoReparacion, adValoremPct } = req.body;
    const valorOriginalNumeric = parseRequestNumber(valorOriginal, NaN);
    if (!Number.isFinite(valorOriginalNumeric) || valorOriginalNumeric <= 0) {
      return res.status(400).json({ error: 'valorOriginal requerido' });
    }
    res.json(regimenes.calcularPerfeccionamientoPasivo(
      valorOriginalNumeric,
      parseRequestNumber(costoReparacion),
      parseRequestNumber(adValoremPct)
    ));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Regime recommendation based on use case
app.post('/api/regimenes/recomendar', auth.requireAuth, (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Payload debe ser un objeto' });
    }
    res.json(regimenes.recomendarRegimen(req.body));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --------------------------------------------------
// SUNAT PROXY (TC + consulta partida)
// --------------------------------------------------
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

// --------------------------------------------------
// COTIZACIONES (CRUD) - protected by auth
// --------------------------------------------------
function canAccessQuotation(user, quotation) {
  return Boolean(
    user && quotation &&
    (user.role === 'admin' || quotation.user_id === user.id)
  );
}

function buildQuotationNameFromItems(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return 'Cotizacion sin nombre';
  }

  const labels = items
    .map((item) => String(item?.desc || item?.producto || item?.description || '').trim())
    .filter(Boolean);

  if (labels.length === 0) return 'Cotizacion sin nombre';
  if (labels.length === 1) return labels[0];
  return `${labels[0]} + ${labels.length - 1} item(s)`;
}

function parseRequestNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'string') {
    let normalized = value.trim().replace(/\s+/g, '');
    const hasComma = normalized.includes(',');
    const hasDot = normalized.includes('.');

    if (hasComma && hasDot) {
      normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
        ? normalized.replace(/\./g, '').replace(/,/g, '.')
        : normalized.replace(/,/g, '');
    } else if (hasComma) {
      normalized = /^\d{1,3}(,\d{3})+$/.test(normalized)
        ? normalized.replace(/,/g, '')
        : normalized.replace(/\./g, '').replace(/,/g, '.');
    } else if (hasDot) {
      normalized = /^\d{1,3}(\.\d{3})+$/.test(normalized)
        ? normalized.replace(/\./g, '')
        : normalized;
    }

    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parsePositiveInteger(value, fallback = null) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const numeric = parseRequestNumber(value, NaN);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null;
  }

  return numeric;
}

function parseBooleanQuery(value, fallback = null) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'si', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }

  return null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeHsRouteParam(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 10);
}

function isExportableQuotation(cotizacion) {
  if (!isPlainObject(cotizacion)) {
    return false;
  }

  const producto = typeof cotizacion.producto === 'string' ? cotizacion.producto.trim() : '';
  const totalLanded = cotizacion.total_landed ?? cotizacion.totalLanded;
  return producto.length > 0 && totalLanded !== undefined && totalLanded !== null;
}

function buildExportFilename(cotizacion, extension) {
  const rawId = cotizacion?.id ?? 'export';
  const safeId = String(rawId).trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'export';
  return `cotizacion-${safeId}.${extension}`;
}

function resolveQuotationItems(payloadItems, resultItems) {
  if (Array.isArray(payloadItems) && payloadItems.length > 0) {
    return payloadItems;
  }
  if (Array.isArray(resultItems) && resultItems.length > 0) {
    return resultItems;
  }
  return [];
}

function extractFobFromResult(resultado = {}) {
  if (Number.isFinite(Number(resultado?.totales?.fob))) {
    return Number(resultado.totales.fob);
  }

  if (Array.isArray(resultado?.items)) {
    return resultado.items.reduce((sum, item) => {
      const tributos = item?.tributos || {};
      if (Number.isFinite(Number(tributos.fob))) {
        return sum + Number(tributos.fob);
      }

      const qty = Number(item?.qty || 0);
      const unit = Number(item?.unit || 0);
      return sum + (qty * unit);
    }, 0);
  }

  return 0;
}

function extractTotalLandedFromResult(resultado = {}) {
  const candidates = [
    resultado?.totales?.totalReal,
    resultado?.totales?.totalLanded,
    resultado?.benchmark?.academic?.importCost?.total,
    resultado?.benchmark?.operational?.importCost?.total,
  ];

  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return 0;
}

function extractCpuFromResult(resultado = {}) {
  const itemWithCost = Array.isArray(resultado?.items)
    ? resultado.items.find((item) => {
      const costoPorUnidad = Number(item?.tributos?.costoPorUnidad);
      const cpu = Number(item?.tributos?.cpu);
      return Number.isFinite(costoPorUnidad) || Number.isFinite(cpu);
    })
    : null;

  if (itemWithCost) {
    const costoPorUnidad = Number(itemWithCost?.tributos?.costoPorUnidad);
    if (Number.isFinite(costoPorUnidad)) {
      return costoPorUnidad;
    }
    return Number(itemWithCost?.tributos?.cpu) || 0;
  }

  const totalQty = Array.isArray(resultado?.items)
    ? resultado.items.reduce((sum, item) => sum + Number(item?.qty || 0), 0)
    : 0;

  const total = extractTotalLandedFromResult(resultado);
  if (totalQty > 0 && Number.isFinite(total)) {
    return total / totalQty;
  }

  return 0;
}

function guardarCotizacionCalculada(req, payload = {}, resultado = {}) {
  if (!req?.user?.id) return null;

  const quotationId = db.saveQuotation({
    userId: req.user.id,
    name: buildQuotationNameFromItems(resolveQuotationItems(payload.items, resultado.items)),
    date: new Date().toISOString(),
    channel: String(payload.canal || payload.channel || resultado?.metadata?.canal || '').toUpperCase(),
    originCountry: String(
      payload.pais ||
      payload.originCountry ||
      payload.origin_country ||
      resultado?.metadata?.pais ||
      ''
    ).toUpperCase(),
    fobTotal: extractFobFromResult(resultado),
    totalLanded: extractTotalLandedFromResult(resultado),
    cpu: extractCpuFromResult(resultado),
    state: payload,
    results: resultado,
  });

  dashboardService.limpiarCache();
  return quotationId;
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
  if (!isPlainObject(req.body)) {
    return res.status(400).json({ error: 'Payload debe ser un objeto' });
  }

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
  dashboardService.limpiarCache();
  res.json({ id });
});

app.delete('/api/quotations/:id', auth.requireAuth, (req, res) => {
  const q = db.getQuotation(req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  if (!canAccessQuotation(req.user, q)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  db.deleteQuotation(req.params.id);
  dashboardService.limpiarCache();
  res.json({ ok: true });
});

// --------------------------------------------------
// PRODUCTOS (CRUD)
// --------------------------------------------------
app.get('/api/products', auth.requireAuth, (req, res) => res.json(db.listProducts()));
app.post('/api/products', auth.requireAuth, (req, res) => {
  if (!isPlainObject(req.body)) {
    return res.status(400).json({ error: 'Payload debe ser un objeto' });
  }
  res.json({ id: db.saveProduct(req.body) });
});
app.delete('/api/products/:id', auth.requireAuth, (req, res) => {
  db.deleteProduct(req.params.id);
  res.json({ ok: true });
});

// --------------------------------------------------
// CHANGELOG + HEALTH
// --------------------------------------------------
app.get('/api/changelog', (req, res) => res.json(db.getChangelog()));

app.get('/api/health', (req, res) => {
  res.json({
    server: 'ok', version: APP_VERSION,
    nandina: { count: nandinaService.getData().length, lastUpdate: nandinaService.getLastUpdate(), source: nandinaService.getSource() },
    restricciones: Object.keys(nandinaService.getRestricciones()).length,
    prohibidas: Object.keys(nandinaService.getProhibidas()).length,
    tlcs: Object.keys(nandinaService.getTLCs()).length,
    scraping: valoracion.getScrapeHealth(),
    modules: ['nandina', 'permisos', 'valoracion', 'sanciones', 'clasificador', 'flete', 'tracking', 'pdf', 'auth', 'regimenes'],
  });
});

// --------------------------------------------------
// FRONTEND ESTATICO
// --------------------------------------------------
app.use(express.static(path.join(__dirname, '../client/dist')));

// API 404 handler (must be before wildcard)
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// --------------------------------------------------
// CRON: Auto-actualizacion (con proteccion de concurrencia)
// --------------------------------------------------
const cronSchedule = process.env.NANDINA_UPDATE_CRON || '0 3 * * 1';
let cronRunning = false;

// Funcion para adquirir lock (evita multiples instancias)
const CRON_LOCK_FILE = path.join(os.tmpdir(), 'cotizador-cron.lock');

function acquireCronLock() {
  try {
    if (fs.existsSync(CRON_LOCK_FILE)) {
      const pid = parseInt(fs.readFileSync(CRON_LOCK_FILE, 'utf8'));
      try {
        process.kill(pid, 0); // Verificar si el proceso existe
        return false; // Otro proceso esta corriendo el CRON
      } catch {
        // Proceso no existe, archivo huerfano
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

  // Verificar si ya esta corriendo
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
        setTimeout(() => reject(new Error('Timeout despues de 5 min')), 300000)
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
    // En produccion, aqui se podria enviar alerta (email, Telegram, Slack)
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
      safeInit('Memoria Hibrida', () => memoria.init()),
      safeInit('Agentes de Navegacion', () => agentesNavegacion.init()),
      safeInit('Sistema de Agentes', () => sistemaAgentes.inicializar()),
      safeInit('Alertas Normativas', () => alertasNormativas.init()),
    ]);
  })();

  return backgroundServicesPromise;
}

async function stopServer() {
  if (shuttingDown) return;
  shuttingDown = true;
  serverStartPromise = null;
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
  initPromise = null;
  backgroundServicesPromise = null;
  shuttingDown = false;
}

function resolveListeningPort(server, fallbackPort) {
  const address = server?.address?.();
  if (address && typeof address === 'object' && Number.isInteger(address.port) && address.port > 0) {
    return address.port;
  }
  return fallbackPort;
}

function buildStartupBannerText(port, initState) {
  const agentStats = sistemaAgentes.obtenerEstadisticas?.() || {};
  const totalAgents = agentStats.total_agentes || agentStats.resumen?.total || 0;

  return [
    '',
    '====================================================',
    'ImportAIAgent Cotizador',
    'Estado: API respondiendo',
    `Server: http://localhost:${port}`,
    `NANDINA: ${initState.nData} partidas`,
    `Restricciones locales: ${initState.nRestr}`,
    `Preferencias TLC: ${initState.nTLCs}`,
    `Cron: ${cronSchedule}`,
    `Init: ${initState.initTime} ms`,
    `Agentes registrados: ${totalAgents}`,
    'Monitoreo: /api/monitor/health',
    'Registro de agentes: /api/agentes/stats',
    '====================================================',
  ].join('\n');
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

// --------------------------------------------------
// PROCESS ERROR HANDLERS - prevent silent crashes
// --------------------------------------------------
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

  // En produccion, es mejor hacer exit para que PM2 reinicie
  if (process.env.NODE_ENV === 'production') {
    console.error(`[${timestamp}] [WARN] Exiting to allow PM2 restart`);
    setTimeout(() => {
      process.exit(1);
    }, 100);
  }
  // En desarrollo, continuar para facilitar debugging
});

// --------------------------------------------------
// INIT (con inicializacion paralela y timeout)
// --------------------------------------------------
async function init() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const startTime = Date.now();
    console.log('[INIT] Iniciando servidor...');

    await Promise.all([
      (async () => {
        await db.init();
        auth.initUsersTable();
        console.log('[INIT] DB y Auth inicializados');
      })(),
      (async () => {
        await nandinaService.init();
        console.log(`[INIT] NANDINA cargada (${nandinaService.getData().length} partidas)`);
      })()
    ]);

    await Promise.allSettled([
      safeInit('Auto-Repair', () => autoRepair.init()),
      safeInit('Memoria Hibrida', () => memoria.init()),
      safeInit('Alertas Normativas', () => alertasNormativas.init()),
    ]);

    const initState = {
      nData: nandinaService.getData().length,
      nRestr: Object.keys(nandinaService.getRestricciones()).length,
      nTLCs: Object.keys(nandinaService.getTLCs()).length,
      initTime: Date.now() - startTime,
    };

    console.log(`[INIT] Inicializacion completada en ${initState.initTime}ms`);
    return initState;
  })().catch((e) => {
    initPromise = null;
    throw e;
  });

  return initPromise;
}

async function startServer(options = {}) {
  if (httpServer) return httpServer;
  if (serverStartPromise) return serverStartPromise;

  serverStartPromise = (async () => {
    const port = options.port ?? resolveRuntimePort(process.env.PORT, 3000, 'PORT');
    const wsPort = options.wsPort ?? resolveRuntimePort(process.env.WS_PORT, 3002, 'WS_PORT');
    websocketServer.setPort?.(wsPort);
    const initState = await init();
    await startBackgroundServices();

    httpServer = await new Promise((resolve, reject) => {
      const server = app.listen(port, () => {
        startWebSocketServer();
        console.log(buildStartupBannerText(resolveListeningPort(server, port), initState));
        resolve(server);
      });

      server.on('error', reject);
    });

    return httpServer;
  })();

  try {
    return await serverStartPromise;
  } catch (e) {
    serverStartPromise = null;
    throw e;
  } finally {
    if (httpServer || shuttingDown) {
      serverStartPromise = null;
    }
  }
}

if (require.main === module) {
  startServer().catch((e) => {
    console.error('[INIT] Error fatal durante la inicializacion:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}

module.exports = app;
module.exports.init = init;
module.exports.startServer = startServer;
module.exports.stopServer = stopServer;
module.exports._private = {
  buildStartupBannerText,
  resolveListeningPort,
  resolveRuntimePort,
};
