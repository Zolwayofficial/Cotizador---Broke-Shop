require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const cron = require("node-cron");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const os = require("os");

// File upload config — ensure dir exists
const UPLOAD_DIR = path.join(os.tmpdir(), "cotizador-uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 10 * 1024 * 1024 } });

// Core modules
const db = require("./db");
const nandinaService = require("./nandina");
const sunatProxy = require("./sunat-proxy");

// Intelligence modules
const aiProxy = require("./ai-proxy");
const clasificador = require("./clasificador");

// Regulatory modules
const permisos = require("./permisos");
const sanciones = require("./sanciones");
const valoracion = require("./valoracion");

// Operations modules
const flete = require("./flete");
const tracking = require("./tracking");
const pdfDocs = require("./pdf-docs");
const autoCotizar = require("./auto-cotizar");
const regimenes = require("./regimenes");
const agente = require("./agente");

// Auth
const auth = require("./auth");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: process.env.DOMAIN ? `https://${process.env.DOMAIN}` : "*" }));
app.use(express.json({ limit: "10mb" }));

// ══════════════════════════════════════════════════
// AUTH: Registro, login, protección de rutas
// ══════════════════════════════════════════════════
app.post("/api/auth/register", (req, res) => {
  try {
    const { email, password, name, company, ruc } = req.body;
    const user = auth.register(email, password, name, company, ruc);
    res.json(user);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post("/api/auth/login", (req, res) => {
  try {
    const { email, password } = req.body;
    const user = auth.login(email, password);
    res.json(user);
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.get("/api/auth/me", auth.requireAuth, (req, res) => {
  res.json(req.user);
});

// ══════════════════════════════════════════════════
// NANDINA: Base arancelaria completa
// ══════════════════════════════════════════════════
app.get("/api/nandina", (req, res) => {
  const data = nandinaService.getData();
  res.json({ count: data.length, updated: nandinaService.getLastUpdate(), data });
});

app.get("/api/nandina/search", (req, res) => {
  const q = (req.query.q || "").toLowerCase();
  if (q.length < 2) return res.json([]);
  const data = nandinaService.getData();
  const results = data.filter(h =>
    h.p.startsWith(q.replace(/\./g, "")) || h.d.toLowerCase().includes(q)
  ).slice(0, 15);
  res.json(results);
});

app.get("/api/nandina/lookup/:hs", (req, res) => {
  const clean = req.params.hs.replace(/\./g, "").padEnd(10, "0");
  const data = nandinaService.getData();
  const match = data.find(h => h.p === clean) || data.find(h => h.p.startsWith(clean.substring(0, 4)));
  res.json(match || null);
});

app.get("/api/nandina/status", (req, res) => {
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

app.get("/api/nandina/restriccion/:hs", (req, res) => {
  res.json(nandinaService.getRestriccion(req.params.hs) || { restricted: false });
});

app.get("/api/nandina/prohibida/:hs", (req, res) => {
  res.json(nandinaService.isProhibida(req.params.hs) || { prohibited: false });
});

app.get("/api/nandina/tlc/:hs/:country", (req, res) => {
  res.json(nandinaService.getTLCPreference(req.params.hs, req.params.country) || { hasTLC: false });
});

app.get("/api/nandina/full/:hs/:country", (req, res) => {
  const { hs, country } = req.params;
  const data = nandinaService.getData();
  const clean = hs.replace(/\./g, "").padEnd(10, "0");
  const partida = data.find(h => h.p === clean) || data.find(h => h.p.startsWith(clean.substring(0, 4)));
  res.json({
    partida: partida || null,
    restriccion: nandinaService.getRestriccion(hs),
    prohibida: nandinaService.isProhibida(hs),
    tlc: nandinaService.getTLCPreference(hs, country),
  });
});

// Admin: force re-download
app.post("/api/admin/update-aduanet", auth.requireAuth, auth.requireAdmin, async (req, res) => {
  try {
    const count = await nandinaService.downloadAll();
    res.json({ ok: true, count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════
// PERMISOS Y RESTRICCIONES
// ══════════════════════════════════════════════════
app.get("/api/permisos/:hs", (req, res) => {
  res.json(permisos.consultaPermisos(req.params.hs));
});

app.get("/api/entidades", (req, res) => {
  res.json(permisos.listarEntidades());
});

app.get("/api/entidades/:codigo", (req, res) => {
  const info = permisos.infoEntidad(req.params.codigo);
  if (!info) return res.status(404).json({ error: "Entidad no encontrada" });
  res.json(info);
});

// MEGA CONSULTA: partida + permisos + TLC + prohibida + AV ajustado
app.get("/api/consulta/:hs/:country", (req, res) => {
  const { hs, country } = req.params;
  const data = nandinaService.getData();
  const clean = hs.replace(/\./g, "").padEnd(10, "0");
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
app.post("/api/tlc/batch", (req, res) => {
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
app.get("/api/valoracion/estadisticas/:hs", async (req, res) => {
  try {
    const stats = await valoracion.getEstadisticas(req.params.hs, req.query.year);
    res.json(stats);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/valoracion/analizar", async (req, res) => {
  try {
    const { hs, fobUnitario, pesoKg, paisOrigen, year } = req.body;
    const stats = await valoracion.getEstadisticas(hs, year);
    const analisis = valoracion.analizarDudaRazonable(fobUnitario, pesoKg, stats, paisOrigen);
    res.json({ estadisticas: stats, analisis });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/valoracion/riesgo/:hs/:fob/:peso/:pais", async (req, res) => {
  try {
    const { hs, fob, peso, pais } = req.params;
    const stats = await valoracion.getEstadisticas(hs);
    res.json(valoracion.analizarDudaRazonable(parseFloat(fob), parseFloat(peso), stats, pais));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════
// SANCIONES (OFAC, ONU, UE)
// ══════════════════════════════════════════════════
app.post("/api/sanciones/verificar", async (req, res) => {
  try {
    const { nombre, pais, tipo } = req.body;
    const result = await sanciones.verificar(nombre, pais, tipo);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════
// IA: Clasificación multi-agente + extracción
// ══════════════════════════════════════════════════
app.post("/api/ai/classify", async (req, res) => {
  try {
    const { messages, provider } = req.body;
    const result = await aiProxy.classify(messages, provider || "groq");
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Multi-agent classification (high precision)
app.post("/api/ai/classify-multi", async (req, res) => {
  try {
    const { descripcion, imagen } = req.body;
    if (!descripcion && !imagen) return res.status(400).json({ error: "Descripción o imagen requerida" });
    const result = await clasificador.clasificarMultiAgente(descripcion, imagen);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/ai/extract", async (req, res) => {
  try {
    const { content, type } = req.body;
    const result = await aiProxy.extract(content, type);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════
// FLETE: Estimador inteligente
// ══════════════════════════════════════════════════
app.post("/api/flete/estimar", (req, res) => {
  try {
    const result = flete.estimarFlete(req.body);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/flete/tarifas", (req, res) => {
  res.json({ aereo: flete.TARIFAS.aereo, maritimo: flete.TARIFAS.maritimo, courier: flete.TARIFAS.courier, costosPuerto: flete.COSTOS_PUERTO });
});

// ══════════════════════════════════════════════════
// TRACKING: Rastreo de embarques
// ══════════════════════════════════════════════════
app.get("/api/tracking/detect/:number", (req, res) => {
  const carrier = tracking.detectCarrier(req.params.number);
  const urls = tracking.getTrackingUrls(req.params.number);
  res.json({ carrier, urls: urls.urls, recommended: urls.recommended });
});

app.get("/api/tracking/:number", async (req, res) => {
  try {
    const result = await tracking.rastrear(req.params.number);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════
// PDF: Documentos profesionales
// ══════════════════════════════════════════════════
app.post("/api/pdf/cotizacion", (req, res) => {
  try {
    const html = pdfDocs.generarCotizacion(req.body);
    res.type("html").send(html);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/pdf/packing-list", (req, res) => {
  try {
    const html = pdfDocs.generarPackingList(req.body);
    res.type("html").send(html);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/pdf/invoice", (req, res) => {
  try {
    const html = pdfDocs.generarInvoice(req.body);
    res.type("html").send(html);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/pdf/permisos", (req, res) => {
  try {
    const html = pdfDocs.generarResumenPermisos(req.body);
    res.type("html").send(html);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// AGENTE ORQUESTADOR — UN SOLO ENDPOINT, TODO AUTOMÁTICO
// ═══════════════════════════════════════════════════════════════
// El usuario manda lo que tenga (PDF, texto, items, lo que sea)
// El orquestador decide qué sub-agentes activar y devuelve TODO.

// Paso 1: Solo extraer (para revisión humana)
app.post("/api/agente/extraer", upload.single("file"), async (req, res) => {
  try {
    if (!checkRate(req.ip)) return res.status(429).json({ error: "Límite alcanzado" });
    let contenido, tipo;
    if (req.file) {
      const buf = fs.readFileSync(req.file.path);
      const mime = req.file.mimetype;
      if (mime.startsWith("image/")) { contenido = `data:${mime};base64,${buf.toString("base64")}`; tipo = "image"; }
      else if (mime === "application/pdf") {
        let text = "";
        try { const pp = require("pdf-parse"); text = (await pp(buf)).text?.trim() || ""; } catch{}
        if (text.length > 50) { contenido = text; tipo = "text"; }
        else { contenido = `data:image/png;base64,${buf.toString("base64")}`; tipo = "image"; }
      } else { contenido = buf.toString("utf8"); tipo = "text"; }
      try { fs.unlinkSync(req.file.path); } catch{}
    } else if (req.body.texto) { contenido = req.body.texto; tipo = "text"; }
    else { return res.status(400).json({ error: "Sube archivo o pega texto" }); }

    const resultado = await agente.orquestar({ contenido, tipo, soloExtraer: true });
    res.json(resultado);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Paso 2: Calcular todo (después de revisión)
app.post("/api/agente/calcular", async (req, res) => {
  try {
    if (!checkRate(req.ip, 500)) return res.status(429).json({ error: "Límite alcanzado" });
    const resultado = await agente.orquestar(req.body);
    res.json(resultado);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Todo en uno (para API/integraciones — sin revisión humana)
app.post("/api/agente", async (req, res) => {
  try {
    if (!checkRate(req.ip, 500)) return res.status(429).json({ error: "Límite alcanzado" });
    const resultado = await agente.orquestar(req.body);
    res.json(resultado);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// AUTO-COTIZAR (legacy — mantiene compatibilidad)
// ═══════════════════════════════════════════════════════════════

// Rate limiter (generous — Groq free tier allows 14,400 RPD on 8B model)
const _rateLimit = {};
function checkRate(ip, maxPerHour = 200) {
  const now = Date.now();
  if (!_rateLimit[ip]) _rateLimit[ip] = [];
  _rateLimit[ip] = _rateLimit[ip].filter(t => now - t < 3600000);
  if (_rateLimit[ip].length >= maxPerHour) return false;
  _rateLimit[ip].push(now);
  return true;
}

// PASO 1: Subir archivo → IA extrae → DEVUELVE BORRADOR para que el usuario revise
app.post("/api/auto-cotizar/extraer", upload.single("file"), async (req, res) => {
  try {
    if (!checkRate(req.ip)) return res.status(429).json({ error: "Límite de consultas alcanzado. Intenta en 1 hora." });

    let contenido, tipo;

    if (req.file) {
      const filePath = req.file.path;
      const mime = req.file.mimetype;

      if (mime.startsWith("image/")) {
        const buf = fs.readFileSync(filePath);
        contenido = `data:${mime};base64,${buf.toString("base64")}`;
        tipo = "image";

      } else if (mime === "application/pdf") {
        // Smart PDF detection: try text extraction first
        let textoExtraido = "";
        try {
          const pdfParse = require("pdf-parse");
          const buf = fs.readFileSync(filePath);
          const pdf = await pdfParse(buf);
          textoExtraido = (pdf.text || "").trim();
        } catch {}

        if (textoExtraido.length > 50) {
          // PDF tiene texto real → usar texto
          contenido = textoExtraido;
          tipo = "text";
        } else {
          // PDF escaneado (< 50 chars) → enviar como imagen a IA con visión
          const buf = fs.readFileSync(filePath);
          contenido = `data:image/png;base64,${buf.toString("base64")}`;
          tipo = "image";
        }

      } else if (mime.includes("spreadsheet") || mime.includes("excel") || mime === "text/csv") {
        contenido = fs.readFileSync(filePath, "utf8");
        tipo = "text";
      } else {
        contenido = fs.readFileSync(filePath, "utf8");
        tipo = "text";
      }

      try { fs.unlinkSync(filePath); } catch {} // cleanup temp file

    } else if (req.body.texto) {
      contenido = req.body.texto;
      tipo = "text";
    } else {
      return res.status(400).json({ error: "Sube un archivo o pega el texto de la cotización" });
    }

    // Extraer datos (SOLO extracción, NO calcula aún)
    const resultado = await autoCotizar.extraer(contenido, tipo);
    res.json(resultado);

  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PASO 2: Usuario revisó/corrigió los datos → AHORA calcular todo
app.post("/api/auto-cotizar/calcular", async (req, res) => {
  try {
    if (!checkRate(req.ip, 500)) return res.status(429).json({ error: "Límite alcanzado" });

    const { items, pais, canal, incoterm, flete, seguro, tc, proveedor,
            moneda, tcMoneda, tipoImportador, margenVenta } = req.body;
    if (!items?.length) return res.status(400).json({ error: "Items requeridos. Primero usa /extraer." });

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
app.post("/api/auto-cotizar/directo", async (req, res) => {
  try {
    if (!checkRate(req.ip, 500)) return res.status(429).json({ error: "Límite alcanzado" });
    const { items, pais, canal, incoterm, flete, seguro, tc, proveedor,
            moneda, tcMoneda, tipoImportador, margenVenta } = req.body;
    if (!items?.length) return res.status(400).json({ error: "Items requeridos" });
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
app.get("/api/antidumping/:hs/:pais", (req, res) => {
  const result = autoCotizar.buscarAntidumping(req.params.hs, req.params.pais);
  res.json(result || { activo: false });
});

// List all active antidumping measures
app.get("/api/antidumping", (req, res) => {
  res.json(autoCotizar.ANTIDUMPING_MEDIDAS);
});

// Incoterm info — what each term includes/excludes
app.get("/api/incoterms", (req, res) => {
  res.json(autoCotizar.INCOTERM_INFO);
});

// Incoterm adjustment preview
app.post("/api/incoterms/ajustar", (req, res) => {
  try {
    const { precio, incoterm, flete, seguro } = req.body;
    const resultado = autoCotizar.ajustarIncoterm(
      parseFloat(precio) || 0,
      incoterm || "FOB",
      parseFloat(flete) || 0,
      parseFloat(seguro) || 0,
      parseFloat(precio) || 0
    );
    res.json(resultado);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// TC Sensitivity analysis
app.post("/api/sensibilidad-tc", (req, res) => {
  try {
    const { totalUSD, tc, variaciones } = req.body;
    const result = autoCotizar.calcularSensibilidadTC(
      parseFloat(totalUSD) || 0,
      parseFloat(tc) || 0,
      variaciones
    );
    res.json(result || { error: "TC requerido" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════
// REGÍMENES ADUANEROS
// ══════════════════════════════════════════════════

// List all regimes
app.get("/api/regimenes", (req, res) => {
  res.json(Object.values(regimenes.REGIMENES).map(r => ({
    codigo: r.codigo, nombre: r.nombre, descripcion: r.descripcion,
    garantia: r.garantia, plazoMeses: r.plazoMeses, uso: r.uso,
  })));
});

// Drawback info (MUST be before :codigo route)
app.get("/api/regimenes/drawback/info", (req, res) => {
  res.json(regimenes.DRAWBACK);
});

// Get details of a specific regime
app.get("/api/regimenes/:codigo", (req, res) => {
  const r = regimenes.REGIMENES[req.params.codigo];
  if (!r) return res.status(404).json({ error: "Régimen no encontrado" });
  res.json(r);
});

// Drawback calculator
app.post("/api/regimenes/drawback", (req, res) => {
  try {
    const { fobExportacion, insumosImportados } = req.body;
    if (!fobExportacion) return res.status(400).json({ error: "fobExportacion requerido" });
    res.json(regimenes.calcularDrawback(fobExportacion, insumosImportados || 0));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admisión Temporal calculator (guarantee amount)
app.post("/api/regimenes/admision-temporal", (req, res) => {
  try {
    const { cif, adValorem, isc, igv, ipm, plazoMeses } = req.body;
    if (!cif) return res.status(400).json({ error: "cif requerido" });
    res.json(regimenes.calcularAdmisionTemporal(cif, adValorem || 0, isc || 0, igv || 0, ipm || 0, plazoMeses));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Perfeccionamiento Pasivo calculator
app.post("/api/regimenes/perfeccionamiento-pasivo", (req, res) => {
  try {
    const { valorOriginal, costoReparacion, adValoremPct } = req.body;
    if (!valorOriginal) return res.status(400).json({ error: "valorOriginal requerido" });
    res.json(regimenes.calcularPerfeccionamientoPasivo(valorOriginal, costoReparacion || 0, adValoremPct));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Regime recommendation based on use case
app.post("/api/regimenes/recomendar", (req, res) => {
  try {
    res.json(regimenes.recomendarRegimen(req.body));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════
// SUNAT PROXY (TC + consulta partida)
// ══════════════════════════════════════════════════
app.get("/api/tc", async (req, res) => {
  try { res.json(await sunatProxy.getTipoCambio()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/sunat/partida/:hs", async (req, res) => {
  try { res.json(await sunatProxy.consultaPartida(req.params.hs)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/monedas", async (req, res) => {
  try { res.json(await sunatProxy.getMonedas()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════
// COTIZACIONES (CRUD) — protected by auth
// ══════════════════════════════════════════════════
app.get("/api/quotations", auth.optionalAuth, (req, res) => {
  const userId = req.user?.id;
  const list = db.listQuotations(userId);
  res.json(list);
});

app.get("/api/quotations/:id", auth.optionalAuth, (req, res) => {
  const q = db.getQuotation(req.params.id);
  if (!q) return res.status(404).json({ error: "Not found" });
  res.json(q);
});

app.post("/api/quotations", auth.optionalAuth, (req, res) => {
  const data = { ...req.body, userId: req.user?.id || "anon" };
  const id = db.saveQuotation(data);
  res.json({ id });
});

app.delete("/api/quotations/:id", auth.optionalAuth, (req, res) => {
  db.deleteQuotation(req.params.id);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════
// PRODUCTOS (CRUD)
// ══════════════════════════════════════════════════
app.get("/api/products", (req, res) => res.json(db.listProducts()));
app.post("/api/products", (req, res) => res.json({ id: db.saveProduct(req.body) }));
app.delete("/api/products/:id", (req, res) => { db.deleteProduct(req.params.id); res.json({ ok: true }); });

// ══════════════════════════════════════════════════
// CHANGELOG + HEALTH
// ══════════════════════════════════════════════════
app.get("/api/changelog", (req, res) => res.json(db.getChangelog()));

app.get("/api/health", (req, res) => {
  res.json({
    server: "ok", version: "2.0",
    nandina: { count: nandinaService.getData().length, lastUpdate: nandinaService.getLastUpdate(), source: nandinaService.getSource() },
    restricciones: Object.keys(nandinaService.getRestricciones()).length,
    prohibidas: Object.keys(nandinaService.getProhibidas()).length,
    tlcs: Object.keys(nandinaService.getTLCs()).length,
    scraping: valoracion.getScrapeHealth(),
    modules: ["nandina","permisos","valoracion","sanciones","clasificador","flete","tracking","pdf","auth","regimenes"],
  });
});

// ══════════════════════════════════════════════════
// FRONTEND ESTÁTICO
// ══════════════════════════════════════════════════
app.use(express.static(path.join(__dirname, "../client/dist")));

// API 404 handler (must be before wildcard)
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: "Endpoint not found", path: req.path });
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});

// ══════════════════════════════════════════════════
// CRON: Auto-actualización
// ══════════════════════════════════════════════════
const cronSchedule = process.env.NANDINA_UPDATE_CRON || "0 3 * * 1";
cron.schedule(cronSchedule, async () => {
  console.log("[CRON] Checking Aduanet for updates...");
  try {
    const result = await nandinaService.checkForUpdates();
    if (result.updated) {
      console.log(`[CRON] Updated: ${result.count} partidas, ${result.changes?.length || 0} changes`);
      db.addChangelog("nandina", `Updated: ${result.count} partidas`, result.changes || []);
    } else console.log("[CRON] No changes");
  } catch (e) { console.error("[CRON] Error:", e.message); }
});

// ══════════════════════════════════════════════════
// PROCESS ERROR HANDLERS — prevent silent crashes
// ══════════════════════════════════════════════════
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err.message);
  console.error(err.stack);
  // Let PM2 restart us after logging
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[WARN] Unhandled rejection:", reason);
  // Don't crash — log and continue
});

// ══════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════
async function init() {
  db.init();
  auth.initUsersTable();
  await nandinaService.init();

  const nData = nandinaService.getData().length;
  const nRestr = Object.keys(nandinaService.getRestricciones()).length;
  const nTLCs = Object.keys(nandinaService.getTLCs()).length;

  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════╗
║  ⬡ Cotizador de Importación Perú v2.0       ║
╠══════════════════════════════════════════════╣
║  Server:  http://localhost:${PORT}              ║
║  NANDINA: ${String(nData).padEnd(6)} partidas               ║
║  Restric: ${String(nRestr).padEnd(6)} partidas restringidas  ║
║  TLCs:    ${String(nTLCs).padEnd(6)} preferencias            ║
║  Modules: 11 (nandina, permisos, valoracion, ║
║           sanciones, clasificador, flete,     ║
║           tracking, pdf, auth, ai, sunat)     ║
║  Cron:    ${cronSchedule.padEnd(20)}             ║
╚══════════════════════════════════════════════╝`);
  });
}

init().catch(console.error);
