// server/auto-cotizar.js — Motor de cálculo completo para importación Perú
//
// 7 FEATURES IMPLEMENTADAS:
//   1. Percepción diferenciada (10% nuevo, 5% usado, 3.5% general)
//   2. Costos operativos (agente, almacenaje, transporte, banco)
//   3. Antidumping automático (medidas INDECOPI vigentes)
//   4. Conversión de moneda (CNY/EUR/JPY → USD)
//   5. Margen de venta (precio venta sugerido con % utilidad)
//   6. Modo simplificado DSI (FOB < $2,000 → 4% AV flat)
//   7. Alertas de cambio normativo

const aiProxy = require('./ai-proxy');
const clasificador = require('./clasificador');

const nandinaService = require('./nandina');
const permisos = require('./permisos');
const valoracion = require('./valoracion');
const flete = require('./flete');
const { evaluarPrecisionCotizacion } = require('./cotizacion-precision');
const { dedupePermisos, generarRecomendacionesResultado } = require('./cotizacion-insights');
const { normalizarCodigoPais, normalizarPaisParaRuta } = require('./paises');

const IPM_RATE = 0.02;
const SEGURO_DEFAULT = 0.015;

// ══════════════════════════════════════════
// INCOTERMS — Ajuste del precio según término comercial
// ══════════════════════════════════════════
// El problema: SUNAT calcula tributos sobre CIF (Costo + Seguro + Flete).
// Si el proveedor cotiza en EXW, hay costos que SUMAR al precio para llegar a FOB.
// Si cotiza en CIF, el flete y seguro YA están incluidos y NO deben sumarse otra vez.
//
// Grupos:
//   E (EXW)   → Precio en fábrica. Falta: transporte local origen + despacho export + flete + seguro
//   F (FCA/FAS/FOB) → Entregado al transportista. Falta: flete internacional + seguro
//   C (CFR/CIF/CPT/CIP) → Flete pagado. CIF/CIP incluyen seguro.
//   D (DAP/DPU/DDP) → Entregado en destino. Ya incluye casi todo.

const INCOTERM_INFO = {
  EXW: { grupo: 'E', incluyeFlete: false, incluyeSeguro: false, incluyeDespachoExport: false,
    ajusteDesc: 'Precio en fábrica. Se suman: transporte a puerto origen, despacho exportación, flete internacional, seguro.',
    costoExtraEstimado: 0.08 }, // ~8% del valor para transporte local + despacho export
  FCA: { grupo: 'F', incluyeFlete: false, incluyeSeguro: false, incluyeDespachoExport: true,
    ajusteDesc: 'Entregado al transportista. Se suman: flete internacional, seguro.',
    costoExtraEstimado: 0.03 },
  FAS: { grupo: 'F', incluyeFlete: false, incluyeSeguro: false, incluyeDespachoExport: true,
    ajusteDesc: 'Entregado al costado del buque. Se suman: carga al buque, flete internacional, seguro.',
    costoExtraEstimado: 0.02 },
  FOB: { grupo: 'F', incluyeFlete: false, incluyeSeguro: false, incluyeDespachoExport: true,
    ajusteDesc: 'Entregado a bordo. Se suman: flete internacional, seguro.',
    costoExtraEstimado: 0 },
  CFR: { grupo: 'C', incluyeFlete: true, incluyeSeguro: false, incluyeDespachoExport: true,
    ajusteDesc: 'Costo y flete incluidos. Se suma: seguro.',
    costoExtraEstimado: 0 },
  CIF: { grupo: 'C', incluyeFlete: true, incluyeSeguro: true, incluyeDespachoExport: true,
    ajusteDesc: 'Costo, seguro y flete incluidos. No se suma nada adicional.',
    costoExtraEstimado: 0 },
  CPT: { grupo: 'C', incluyeFlete: true, incluyeSeguro: false, incluyeDespachoExport: true,
    ajusteDesc: 'Transporte pagado hasta destino. Se suma: seguro.',
    costoExtraEstimado: 0 },
  CIP: { grupo: 'C', incluyeFlete: true, incluyeSeguro: true, incluyeDespachoExport: true,
    ajusteDesc: 'Transporte y seguro pagados hasta destino. No se suma nada adicional.',
    costoExtraEstimado: 0 },
  DAP: { grupo: 'D', incluyeFlete: true, incluyeSeguro: true, incluyeDespachoExport: true,
    ajusteDesc: 'Entregado en lugar convenido (sin despacho import). Flete y seguro incluidos.',
    costoExtraEstimado: 0 },
  DPU: { grupo: 'D', incluyeFlete: true, incluyeSeguro: true, incluyeDespachoExport: true,
    ajusteDesc: 'Entregado en lugar de destino descargado. Flete y seguro incluidos.',
    costoExtraEstimado: 0 },
  DDP: { grupo: 'D', incluyeFlete: true, incluyeSeguro: true, incluyeDespachoExport: true,
    ajusteDesc: 'Entregado con derechos pagados. Precio incluye TODOS los costos y tributos.',
    costoExtraEstimado: 0, incluyeTributos: true },
};

// Adjust prices from any Incoterm to FOB equivalent
function ajustarIncoterm(precioUnitario, incoterm, fleteTotal, seguroTotal, _fobTotal) {
  const info = INCOTERM_INFO[(incoterm || 'FOB').toUpperCase()];
  const precision = {
    codigo: (incoterm || 'FOB').toUpperCase(),
    estado: 'exacto',
    fobEstimado: false,
    fleteEstimado: false,
    seguroEstimado: false,
    mensaje: null,
  };

  if (!info) {
    precision.estado = 'estimado';
    precision.mensaje = 'Incoterm no reconocido. Se trato como FOB.';
    return { fob: precioUnitario, flete: fleteTotal, seguro: seguroTotal, ajuste: 'Incoterm no reconocido, tratado como FOB', precision };
  }

  const inc = (incoterm || 'FOB').toUpperCase();

  if (inc === 'FOB' || inc === 'FCA' || inc === 'FAS') {
    // Precio ya es ~FOB (o cercano). Flete y seguro se suman aparte.
    const extraCost = precioUnitario * info.costoExtraEstimado;
    if (info.costoExtraEstimado > 0) {
      precision.estado = 'estimado';
      precision.fobEstimado = true;
      precision.mensaje = 'Se sumaron costos de origen estimados para llevar el precio a FOB.';
    }
    if (!seguroTotal) {
      precision.seguroEstimado = true;
      precision.estado = 'estimado';
      precision.mensaje = precision.mensaje || 'El seguro se completo con una tasa estimada.';
    }
    return {
      fob: precioUnitario + extraCost,
      flete: fleteTotal,
      seguro: seguroTotal || (precioUnitario * SEGURO_DEFAULT),
      ajuste: info.ajusteDesc,
      extraOrigen: extraCost,
      precision,
    };
  }

  if (inc === 'EXW') {
    // EXW = precio en fábrica. Hay que sumar transporte al puerto + despacho export
    const extraCost = precioUnitario * info.costoExtraEstimado; // ~8%
    precision.estado = 'estimado';
    precision.fobEstimado = true;
    precision.mensaje = 'EXW requiere estimar costos de origen para llevar el precio a FOB.';
    if (!seguroTotal) {
      precision.seguroEstimado = true;
    }
    return {
      fob: precioUnitario + extraCost,
      flete: fleteTotal,
      seguro: seguroTotal || ((precioUnitario + extraCost) * SEGURO_DEFAULT),
      ajuste: info.ajusteDesc,
      extraOrigen: extraCost,
      precision,
    };
  }

  if (inc === 'CFR' || inc === 'CPT') {
    // Precio INCLUYE flete pero NO seguro
    // FOB = Precio - Flete (si conocemos el flete)
    if (fleteTotal > 0) {
      const fobEstimado = precioUnitario - fleteTotal;
      if (!seguroTotal) {
        precision.estado = 'estimado';
        precision.seguroEstimado = true;
        precision.mensaje = 'El seguro se completo con una tasa estimada.';
      }
      return { fob: Math.max(0, fobEstimado), flete: fleteTotal, seguro: seguroTotal || (fobEstimado * SEGURO_DEFAULT), ajuste: info.ajusteDesc + ' FOB = precio - flete.', precision };
    }
    // If no flete known, estimate flete as ~10% of price
    const fleteEst = precioUnitario * 0.10;
    precision.estado = 'estimado';
    precision.fleteEstimado = true;
    precision.seguroEstimado = !seguroTotal;
    precision.mensaje = 'Se estimo el flete para desarmar el incoterm.';
    return { fob: precioUnitario - fleteEst, flete: fleteEst, seguro: seguroTotal || ((precioUnitario - fleteEst) * SEGURO_DEFAULT), ajuste: info.ajusteDesc + ' Flete estimado ~10% del precio.', precision };
  }

  if (inc === 'CIF' || inc === 'CIP') {
    // Precio INCLUYE flete Y seguro
    // CIF = FOB + Flete + Seguro → FOB = CIF - Flete - Seguro
    if (fleteTotal > 0 && seguroTotal > 0) {
      return { fob: Math.max(0, precioUnitario - fleteTotal - seguroTotal), flete: fleteTotal, seguro: seguroTotal, ajuste: info.ajusteDesc + ' FOB = precio - flete - seguro.', precision };
    }
    if (fleteTotal > 0) {
      const segEst = (precioUnitario - fleteTotal) * SEGURO_DEFAULT;
      precision.estado = 'estimado';
      precision.seguroEstimado = true;
      precision.mensaje = 'Se estimo el seguro para desarmar el incoterm.';
      return { fob: Math.max(0, precioUnitario - fleteTotal - segEst), flete: fleteTotal, seguro: segEst, ajuste: info.ajusteDesc + ' Seguro estimado.', precision };
    }
    // No flete/seguro known: estimate
    const fleteEst = precioUnitario * 0.08;
    const segEst = precioUnitario * 0.015;
    precision.estado = 'estimado';
    precision.fleteEstimado = true;
    precision.seguroEstimado = true;
    precision.mensaje = 'Se estimaron flete y seguro para desarmar el incoterm.';
    return { fob: precioUnitario - fleteEst - segEst, flete: fleteEst, seguro: segEst, ajuste: info.ajusteDesc + ' Flete ~8%, seguro ~1.5% estimados. Ingresar valores reales para mayor precisión.', precision };
  }

  if (inc === 'DAP' || inc === 'DPU') {
    // Incluye todo hasta destino. Similar a CIF pero puede incluir costos de descarga.
    const fleteEst = fleteTotal || precioUnitario * 0.10;
    const segEst = seguroTotal || precioUnitario * 0.015;
    precision.estado = 'estimado';
    precision.fleteEstimado = !fleteTotal;
    precision.seguroEstimado = !seguroTotal;
    precision.mensaje = 'Se estimaron componentes del incoterm para llevarlo a FOB.';
    return { fob: Math.max(0, precioUnitario - fleteEst - segEst), flete: fleteEst, seguro: segEst, ajuste: info.ajusteDesc + ' FOB estimado descontando flete y seguro.', precision };
  }

  if (inc === 'DDP') {
    // DDP incluye TRIBUTOS. El precio ya tiene todo. Difícil desglosar sin datos.
    precision.estado = 'estimado';
    precision.fobEstimado = true;
    precision.fleteEstimado = true;
    precision.seguroEstimado = true;
    precision.mensaje = 'DDP no puede desglosarse con exactitud sin un FOB real del proveedor.';
    return {
      fob: precioUnitario * 0.65, // Rough estimate: tributos+flete ~35% del DDP
      flete: precioUnitario * 0.08,
      seguro: precioUnitario * 0.015,
      ajuste: '⚠ DDP incluye tributos en el precio. Desglose es estimado (~65% FOB). Para precisión, solicita precio FOB al proveedor.',
      advertencia: true,
      precision,
    };
  }

  return { fob: precioUnitario, flete: fleteTotal, seguro: seguroTotal, ajuste: 'Tratado como FOB', precision };
}

// ══════════════════════════════════════════
// SENSIBILIDAD TC — ¿Cuánto cambia si el dólar sube/baja?
// ══════════════════════════════════════════
function calcularSensibilidadTC(totalUSD, tcBase, variaciones) {
  if (!tcBase || tcBase <= 0) return null;
  const vars = variaciones || [-10, -5, -3, 0, 3, 5, 10];
  return vars.map(pct => {
    const tcAjustado = tcBase * (1 + pct / 100);
    const totalPEN = totalUSD * tcAjustado;
    const diferencia = totalPEN - (totalUSD * tcBase);
    return {
      variacion: `${pct >= 0 ? '+' : ''}${pct}%`,
      tc: parseFloat(tcAjustado.toFixed(4)),
      totalPEN: parseFloat(totalPEN.toFixed(2)),
      diferenciaPEN: parseFloat(diferencia.toFixed(2)),
      diferenciaUSD: parseFloat((diferencia / tcAjustado).toFixed(2)),
    };
  });
}

// ══════════════════════════════════════════
// ANTIDUMPING — Medidas vigentes INDECOPI
// Fuente: https://www.indecopi.gob.pe/dumping-y-subvenciones
// Se deben actualizar cuando INDECOPI emite nuevas resoluciones
// ══════════════════════════════════════════
const ANTIDUMPING_MEDIDAS = [
  { hs: '6109', pais: 'CN', tasa: 5.51, desc: 'Camisetas de algodón', resolucion: '025-2019/CDB-INDECOPI', vigenciaHasta: '2029' },
  { hs: '6105', pais: 'CN', tasa: 3.73, desc: 'Camisas de punto algodón', resolucion: '025-2019/CDB-INDECOPI', vigenciaHasta: '2029' },
  { hs: '6205', pais: 'CN', tasa: 1.98, desc: 'Camisas tejido plano algodón', resolucion: '134-2019/CDB-INDECOPI', vigenciaHasta: '2029' },
  { hs: '5407', pais: 'CN', tasa: 0.18, desc: 'Tejidos de filamentos sintéticos (por kg)', resolucion: '044-2014/CFD-INDECOPI', vigenciaHasta: '2025', porKg: true },
  { hs: '5516', pais: 'CN', tasa: 0.66, desc: 'Tejidos de fibras artificiales discontinuas (por kg)', resolucion: '044-2014/CFD-INDECOPI', vigenciaHasta: '2025', porKg: true },
  { hs: '7213', pais: 'CN', tasa: 12.00, desc: 'Barras de hierro/acero sin alear', resolucion: '023-2021/CDB-INDECOPI', vigenciaHasta: '2026' },
  { hs: '7306', pais: 'CN', tasa: 11.00, desc: 'Tubos y perfiles huecos de acero', resolucion: '015-2018/CDB-INDECOPI', vigenciaHasta: '2028' },
  { hs: '6402', pais: 'CN', tasa: 2.97, desc: 'Calzado de caucho/plástico', resolucion: '060-2020/CDB-INDECOPI', vigenciaHasta: '2030' },
  { hs: '6403', pais: 'CN', tasa: 1.82, desc: 'Calzado con suela de caucho/plástico y parte superior de cuero', resolucion: '060-2020/CDB-INDECOPI', vigenciaHasta: '2030' },
  { hs: '6404', pais: 'CN', tasa: 3.41, desc: 'Calzado con suela de caucho/plástico y parte superior textil', resolucion: '060-2020/CDB-INDECOPI', vigenciaHasta: '2030' },
  { hs: '3920', pais: 'CN', tasa: 19.30, desc: 'Cierres y tapas de plástico', resolucion: '003-2023/CDB-INDECOPI', vigenciaHasta: '2028' },
  { hs: '7304', pais: 'CN', tasa: 15.00, desc: 'Tubos de acero sin costura', resolucion: '080-2017/CDB-INDECOPI', vigenciaHasta: '2027' },
];

function buscarAntidumping(hs, pais) {
  if (!hs || !pais) return null;
  const hsClean = hs.replace(/\./g, '');
  const paisUpper = normalizarCodigoPais(pais);
  // Match by HS prefix (4 or 6 digits) and country
  for (const m of ANTIDUMPING_MEDIDAS) {
    if (hsClean.startsWith(m.hs) && paisUpper && m.pais === paisUpper) {
      // Check vigencia
      const year = new Date().getFullYear();
      if (parseInt(m.vigenciaHasta) >= year) {
        return m;
      }
    }
  }
  return null;
}

// ══════════════════════════════════════════
// CONVERSIÓN DE MONEDA
// ══════════════════════════════════════════
const TASAS_CAMBIO_FALLBACK = {
  USD: 1, EUR: 1.08, GBP: 1.27, CNY: 0.138, JPY: 0.0067,
  KRW: 0.00074, TWD: 0.031, THB: 0.028, INR: 0.012,
  BRL: 0.20, MXN: 0.058, CAD: 0.74, AUD: 0.65, PEN: 0.27,
};

function convertirAUSD(monto, moneda, tcCustom) {
  if (!moneda || moneda === 'USD') return monto;
  if (tcCustom && tcCustom > 0) return monto * tcCustom;
  const tasa = TASAS_CAMBIO_FALLBACK[moneda.toUpperCase()];
  if (tasa) return monto * tasa;
  return monto; // If unknown currency, assume USD
}

// ══════════════════════════════════════════
// COSTOS OPERATIVOS
// ══════════════════════════════════════════
function calcularCostosOperativos(canal, cif, _pesoTotal) {
  const costos = {};

  if (canal === 'DEFINITIVA' || canal === 'MARITIMO' || canal === 'AEREO') {
    costos.agenteAduanas = Math.max(200, cif * 0.015); // ~1.5% del CIF, mín $200
    costos.almacenaje = canal === 'MARITIMO' ? 120 : 80; // Marítimo más caro
    costos.transporteLocal = canal === 'MARITIMO' ? 200 : 100; // Callao → Lima
    costos.comisionBancaria = 40;
    costos.gastosOperativos = 50; // handling, visto bueno, etc.
    costos.aforo = 0; // Solo si sale a aforo físico (~30% de DUAs)
  } else if (canal === 'COURIER') {
    costos.agenteAduanas = 0; // Courier lo incluye
    costos.almacenaje = 0;
    costos.transporteLocal = 0;
    costos.comisionBancaria = 0;
    costos.gastosOperativos = 0;
  } else if (canal === 'POSTAL') {
    costos.agenteAduanas = 0;
    costos.almacenaje = 0;
    costos.transporteLocal = 15; // Serpost cobra envío
    costos.comisionBancaria = 0;
    costos.gastosOperativos = 0;
  }

  costos.totalOperativo = Object.values(costos).reduce((s, v) => s + v, 0);
  return costos;
}

// ══════════════════════════════════════════
// MODO SIMPLIFICADO DSI (< $2,000 FOB)
// Partida simplificada: 4% AV flat + 18% IGV
// Sin ISC, sin percepción, sin antidumping
// ══════════════════════════════════════════
function calcularDSI(fob, fleteTotal, seguroTotal) {
  const seguro = seguroTotal || fob * SEGURO_DEFAULT;
  const cif = fob + fleteTotal + seguro;
  const adValorem = cif * 0.04; // 4% flat
  const baseIGV = cif + adValorem;
  const igv = baseIGV * 0.16;
  const ipm = baseIGV * 0.02;
  const totalTributos = adValorem + igv + ipm;
  return {
    modo: 'DSI',
    nota: 'Despacho Simplificado de Importación (FOB ≤ US$2,000). Partida 9810.00.00.20. AV flat 4%.',
    fob, flete: fleteTotal, seguro, cif,
    adValorem, advRate: 4,
    igv, ipm,
    isc: 0, antidumping: 0, percepcion: 0,
    baseIGV, totalTributos,
    totalLanded: cif + totalTributos,
    costoPorUnidad: null, // No aplica por item en DSI
  };
}

// ══════════════════════════════════════════
// MARGEN DE VENTA
// ══════════════════════════════════════════
function calcularMargen(totalLandedPorUnidad, costosOperativosPorUnidad, margenPct) {
  const costoTotal = totalLandedPorUnidad + costosOperativosPorUnidad;
  const marginSafe = Math.min(Math.max((margenPct || 30), 1), 99); // Cap 1-99% to avoid div/0
  const precioVenta = costoTotal / (1 - marginSafe / 100);
  const utilidad = precioVenta - costoTotal;
  const igvVenta = precioVenta * 0.18; // IGV en la venta (que luego recuperas contra el IGV de importación)
  return {
    costoUnitario: costoTotal,
    margenPct: marginSafe,
    precioVentaSinIGV: precioVenta,
    precioVentaConIGV: precioVenta + igvVenta,
    utilidadPorUnidad: utilidad,
    igvVenta,
  };
}

// ══════════════════════════════════════════
// ALERTAS DE CAMBIO NORMATIVO
// ══════════════════════════════════════════
function verificarAlertas(items, pais) {
  const alertas = [];

  // Ley 32387 (2025): IGV 15% + IPM 2% → efectivo desde julio 2025
  // Verificar si hay cambios programados
  alertas.push({
    tipo: 'normativo', nivel: 'info',
    mensaje: 'ℹ Tasas calculadas según Ley 32387 (IGV 16% + IPM 2% = 18% total). Vigente desde Jul 2025.',
  });

  // Check antidumping vigencia
  items.forEach(item => {
    if (!item.hs) return;
    const ad = buscarAntidumping(item.hs, pais);
    if (ad) {
      const yearNow = new Date().getFullYear();
      const monthsLeft = (parseInt(ad.vigenciaHasta) - yearNow) * 12;
      if (monthsLeft <= 6) {
        alertas.push({
          tipo: 'antidumping_expira', nivel: 'medio',
          mensaje: `⏰ Antidumping ${ad.desc} (Res. ${ad.resolucion}) vence en ${ad.vigenciaHasta}. INDECOPI puede renovar o eliminar.`,
        });
      }
    }
  });

  // TLC alerts
  items.forEach(item => {
    if (item.tlc && item.ahorroTLC > 0) {
      alertas.push({
        tipo: 'tlc_activo', nivel: 'info',
        mensaje: `🤝 TLC activo: ${item.desc} — ahorro AV de ${item.ahorroTLC}% (${item.tlc.acuerdo || 'acuerdo comercial'})`,
      });
    }
  });

  return alertas;
}

// ══════════════════════════════════════════
// PASO 1: EXTRAER (devuelve borrador para revisión)
// ══════════════════════════════════════════
async function extraer(contenido, tipo) {
  if (tipo === 'json') return { ok: true, data: contenido, confianza: 100, advertencias: [] };

  const advertencias = [];
  let data = null;

  const result = await aiProxy.extract(contenido, tipo === 'image' ? 'image' : 'document');
  if (result.ok && result.data) {
    data = result.data;
  } else {
    const retryResult = await extraerConReintento(contenido, tipo);
    if (retryResult) data = retryResult;
  }

  if (!data || !data.items || data.items.length === 0) {
    return { ok: false, error: 'No se pudieron extraer items. ¿Es una cotización de proveedor?', advertencias };
  }

  let confianza = 85;

  data.items.forEach((item, i) => {
    if (item.unit > 100000) { advertencias.push({ item: i, campo: 'unit', mensaje: `Precio unitario muy alto: $${item.unit.toLocaleString()}. ¿Es correcto?`, nivel: 'alto' }); confianza -= 10; }
    if (item.unit > 0 && item.unit < 0.01) { advertencias.push({ item: i, campo: 'unit', mensaje: `Precio unitario muy bajo: $${item.unit}. ¿Falta un decimal?`, nivel: 'alto' }); confianza -= 10; }
    if (item.qty > 100000) { advertencias.push({ item: i, campo: 'qty', mensaje: `Cantidad muy alta: ${item.qty.toLocaleString()}`, nivel: 'medio' }); confianza -= 5; }
    if (!item.desc || item.desc.length < 3) { advertencias.push({ item: i, campo: 'desc', mensaje: 'Descripción vacía o muy corta', nivel: 'alto' }); confianza -= 10; }
  });

  // Moneda no USD
  if (data.currency && data.currency !== 'USD') {
    const tasa = TASAS_CAMBIO_FALLBACK[data.currency.toUpperCase()];
    advertencias.push({
      campo: 'currency', nivel: 'medio',
      mensaje: `Cotización en ${data.currency}. Se convertirá a USD (tasa ref: 1 ${data.currency} ≈ ${tasa || '?'} USD). Verifica el tipo de cambio.`,
    });
  }

  if (data.items.length === 1 && contenido.length > 500) {
    advertencias.push({ campo: 'items', mensaje: 'Solo se extrajo 1 item. ¿El documento tiene más productos?', nivel: 'medio' });
  }

  const sumItems = data.items.reduce((s, it) => s + (it.qty || 1) * (it.unit || 0), 0);
  if (data.total && Math.abs(data.total - sumItems) / data.total > 0.05) {
    advertencias.push({ campo: 'total', mensaje: `Total ($${data.total}) ≠ suma items ($${sumItems.toFixed(2)})`, nivel: 'alto' }); confianza -= 15;
  }

  return {
    ok: true, data, confianza: Math.max(10, confianza), advertencias,
    mensaje: advertencias.length > 0
      ? `⚠ ${advertencias.length} punto(s) requieren verificación.`
      : '✅ Datos extraídos. Verifica y confirma.',
    paraRevisar: {
      items: data.items.map((it, i) => ({
        index: i, desc: it.desc || '', qty: it.qty || 1, unit: it.unit || 0,
        sku: it.sku || '', pesoKg: it.pesoKg || null, bienUsado: false,
        tieneAdvertencia: advertencias.some(a => a.item === i),
      })),
      proveedor: data.supplier || '', pais: data.country || '',
      moneda: data.currency || 'USD', incoterm: data.incoterm || 'FOB',
      flete: data.freight || null, seguro: data.insurance || null,
    },
  };
}

async function extraerConReintento(contenido, tipo) {
  const messages = [
    { role: 'system', content: `Extrae TODOS los items de esta cotización. Responde SOLO JSON:
{"items":[{"desc":"...","qty":N,"unit":N,"sku":"..."}],"total":N,"freight":N,"insurance":N,"currency":"USD","country":"XX","supplier":"...","incoterm":"FOB","payment_terms":"...","validity":"..."}
qty y unit DEBEN ser números.` },
    { role: 'user', content: tipo === 'image'
      ? [{ type: 'image_url', image_url: { url: contenido } }, { type: 'text', text: 'Extrae datos de esta cotización.' }]
      : `Extrae datos:\n\n${contenido}` },
  ];
  try {
    const resp = await aiProxy.call(messages, 'groq');
    const clean = resp.text.replace(/```json|```/g, '').trim();
    const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
    if (s >= 0 && e > s) return JSON.parse(clean.substring(s, e + 1));
  } catch (error) { /* AI extraction fallback */ }
  return null;
}

// ══════════════════════════════════════════
// PASO 2: CALCULAR (después de confirmación)
// ══════════════════════════════════════════
async function calcular(input) {
  const startTime = Date.now();
  const log = [];
  const resultado = { exito: false, items: [], totales: {}, alertas: [], etapas: {}, tiempoMs: 0 };

  try {
    const {
      items,
      pais,
      canal,
      incoterm,
      tc,
      proveedor,
      moneda,
      tcMoneda,
      tipoImportador,
      margenVenta,
    } = input;
    let { fleteManual = 0, seguroManual = 0 } = input;

    if (!items?.length) { resultado.error = 'No hay items para calcular'; return resultado; }

    const country = normalizarCodigoPais(pais) || (pais || '').toUpperCase();
    const canalUpper = (canal || 'DEFINITIVA').toUpperCase();
    const monedaUpper = (moneda || 'USD').toUpperCase();
    const trazabilidad = {
      flete: fleteManual > 0
        ? { estado: 'real', fuente: 'manual', monto: fleteManual }
        : { estado: 'pendiente', fuente: 'sin_definir', monto: 0 },
      seguro: seguroManual > 0
        ? { estado: 'real', fuente: 'manual', monto: seguroManual }
        : { estado: 'pendiente', fuente: 'sin_definir', monto: 0 },
      incoterm: { codigo: (incoterm || 'FOB').toUpperCase(), estado: 'exacto', mensaje: null },
    };

    // ── CONVERTIR MONEDA ──
    if (monedaUpper !== 'USD') {
      log.push(`Convirtiendo ${monedaUpper} → USD...`);
      items.forEach(item => {
        if (item.unit) {
          const originalUnit = item.unit;
          item.unit = convertirAUSD(item.unit, monedaUpper, tcMoneda);
          item.unitOriginal = originalUnit;
          item.monedaOriginal = monedaUpper;
        }
      });
      const tasa = tcMoneda || TASAS_CAMBIO_FALLBACK[monedaUpper] || 1;
      resultado.etapas.conversion = { moneda: monedaUpper, tasaUsada: tasa, nota: 'Precios convertidos a USD' };
      log.push(`✓ Convertido a USD (1 ${monedaUpper} = ${tasa} USD)`);
    }

    // ── CHECK DSI (< $2,000 FOB) ──
    const fobTotal = items.reduce((s, i) => s + ((i.qty || 1) * (i.unit || 0)), 0);

    if (fobTotal <= 2000 && (canalUpper === 'POSTAL' || canalUpper === 'COURIER' || canalUpper === 'DSI')) {
      log.push('Modo DSI: FOB ≤ $2,000 — cálculo simplificado');
      const fleteT = fleteManual || 0;
      const seguroT = seguroManual || 0;
      const dsi = calcularDSI(fobTotal, fleteT, seguroT);
      const costosOp = calcularCostosOperativos(canalUpper, dsi.cif, 0);

      resultado.exito = true;
      resultado.modo = 'DSI';
      resultado.totales = { ...dsi, costosOperativos: costosOp, totalReal: dsi.totalLanded + costosOp.totalOperativo };
      if (tc > 0) resultado.totales.totalPEN = resultado.totales.totalReal * tc;
      resultado.items = items;
      resultado.metadata = { proveedor, pais: country, incoterm, canal: canalUpper, tc, moneda: monedaUpper };
      resultado.alertas = [{ tipo: 'dsi', nivel: 'info', mensaje: '📦 Importación simplificada (DSI). AV 4% flat, sin percepción ni antidumping.' }];
      if (fleteT > 0) {
        trazabilidad.flete = { estado: 'real', fuente: 'manual', monto: fleteT };
      }
      if (seguroT > 0) {
        trazabilidad.seguro = { estado: 'real', fuente: 'manual', monto: seguroT };
      } else {
        trazabilidad.seguro = { estado: 'estimado', fuente: 'default_1_5', monto: dsi.seguro };
      }
      resultado.trazabilidad = trazabilidad;
      resultado.precision = evaluarPrecisionCotizacion({ items, trazabilidad });
      resultado.alertas.unshift({
        tipo: 'precision',
        nivel: resultado.precision.requiereRevision ? 'alto' : (resultado.precision.esReferencial ? 'medio' : 'info'),
        mensaje: resultado.precision.resumen,
      });
      resultado.recomendaciones = generarRecomendacionesResultado({
        pais: country,
        canal: canalUpper,
        incoterm,
        resultado,
      });
      resultado.log = log;
      resultado.tiempoMs = Date.now() - startTime;
      return resultado;
    }

    // ── CLASIFICAR HS ──
    log.push('Clasificando partidas arancelarias...');
    let itemsClasificados = await clasificarItems(items);
    const clasificados = itemsClasificados.filter(i => i.hs);
    resultado.etapas.clasificacion = {
      total: items.length, clasificados: clasificados.length,
      fallidos: items.length - clasificados.length,
      confianzaPromedio: clasificados.length > 0 ? Math.round(clasificados.reduce((s, i) => s + (i.confianza || 0), 0) / clasificados.length) : 0,
    };
    log.push(`✓ ${clasificados.length}/${items.length} clasificados`);

    // ── ENRIQUECER (NANDINA + TLC + permisos + antidumping) ──
    log.push('Consultando NANDINA, TLCs, permisos, antidumping...');
    itemsClasificados = enriquecerConNandina(itemsClasificados, country);

    // Apply antidumping
    let antidumpingCount = 0;
    itemsClasificados.forEach(item => {
      if (!item.hs) return;
      const ad = buscarAntidumping(item.hs, country);
      if (ad) {
        item.antidumpingRate = ad.tasa / 100;
        item.antidumpingInfo = ad;
        antidumpingCount++;
      }
    });

    const conPermisos = itemsClasificados.filter(i => i.permisos?.restringida);
    const prohibidos = itemsClasificados.filter(i => i.prohibida);
    resultado.permisos = dedupePermisos([], itemsClasificados);
    resultado.etapas.regulatorio = {
      conTLC: itemsClasificados.filter(i => i.tlc).length,
      conPermisos: resultado.permisos.length,
      prohibidos: prohibidos.length,
      conAntidumping: antidumpingCount,
    };

    if (prohibidos.length > 0) resultado.alertas.push({ tipo: 'prohibida', nivel: 'critico', mensaje: `⛔ ${prohibidos.length} item(s) PROHIBIDOS: ${prohibidos.map(i => i.desc).join(', ')}` });
    if (conPermisos.length > 0) {
      const ents = [...new Set(conPermisos.flatMap(i => i.permisos?.permisos?.map(p => p.entidad) || []))];
      resultado.alertas.push({ tipo: 'restringida', nivel: 'alto', mensaje: `⚠ ${conPermisos.length} item(s) requieren permisos de: ${ents.join(', ')}`, entidades: ents });
    }
    if (antidumpingCount > 0) {
      resultado.alertas.push({ tipo: 'antidumping', nivel: 'alto', mensaje: `🛡 ${antidumpingCount} item(s) con derechos antidumping INDECOPI` });
    }
    log.push(`✓ Regulatorio: ${resultado.etapas.regulatorio.conTLC} TLC, ${conPermisos.length} permisos, ${antidumpingCount} antidumping`);

    // ── INCOTERM ADJUSTMENT ──
    const incotermUpper = (incoterm || 'FOB').toUpperCase();
    const incInfo = INCOTERM_INFO[incotermUpper];
    if (incInfo && incotermUpper !== 'FOB') {
      log.push(`Ajustando precios de ${incotermUpper} → FOB...`);
      const ajuste = ajustarIncoterm(fobTotal, incotermUpper, fleteManual, seguroManual, fobTotal);
      trazabilidad.incoterm = {
        codigo: incotermUpper,
        estado: ajuste.precision?.estado || 'exacto',
        mensaje: ajuste.precision?.mensaje || null,
      };
      resultado.etapas.incoterm = {
        original: incotermUpper,
        ajuste: ajuste.ajuste,
        fobOriginal: fobTotal,
        fobAjustado: ajuste.fob,
        fleteDelPrecio: incInfo.incluyeFlete ? (fobTotal - ajuste.fob) : 0,
        seguroDelPrecio: incInfo.incluyeSeguro ? ajuste.seguro : 0,
        advertencia: ajuste.advertencia || false,
        precision: ajuste.precision || null,
      };

      // If incoterm includes freight, extract it from the price
      if (incInfo.incluyeFlete && fleteManual === 0) {
        fleteManual = ajuste.flete;
        trazabilidad.flete = {
          estado: ajuste.precision?.fleteEstimado ? 'estimado' : 'real',
          fuente: ajuste.precision?.fleteEstimado ? 'incoterm_estimado' : 'incoterm',
          monto: ajuste.flete,
        };
        log.push(`  Flete extraído del precio ${incotermUpper}: $${ajuste.flete.toFixed(2)}`);
      }
      if (incInfo.incluyeSeguro && seguroManual === 0) {
        seguroManual = ajuste.seguro;
        trazabilidad.seguro = {
          estado: ajuste.precision?.seguroEstimado ? 'estimado' : 'real',
          fuente: ajuste.precision?.seguroEstimado ? 'incoterm_estimado' : 'incoterm',
          monto: ajuste.seguro,
        };
        log.push(`  Seguro extraído del precio ${incotermUpper}: $${ajuste.seguro.toFixed(2)}`);
      }

      // Adjust item prices proportionally to FOB
      if (ajuste.fob !== fobTotal && fobTotal > 0) {
        const ratio = ajuste.fob / fobTotal;
        itemsClasificados.forEach(item => {
          if (item.unit) {
            item.unitIncoterm = item.unit; // Save original
            item.unit = item.unit * ratio;  // Adjust to FOB
          }
        });
        log.push(`  Precios ajustados a FOB (ratio: ${ratio.toFixed(4)})`);
      }

      if (ajuste.advertencia) {
        resultado.alertas.push({ tipo: 'incoterm', nivel: 'medio', mensaje: ajuste.ajuste });
      }
    }
    const fobAjustado = itemsClasificados.reduce((s, i) => s + ((i.qty || 1) * (i.unit || 0)), 0);

    // ── FLETE ──
    let fleteTotal = fleteManual || 0;
    const seguroTotal = seguroManual || 0;
    if (fleteTotal === 0 && country) {
      const pesoTotal = itemsClasificados.reduce((s, i) => s + ((i.pesoKg || 1) * (i.qty || 1)), 0);
      try {
        const est = flete.estimarFlete({
          origen: normalizarPaisParaRuta(country),
          canal: canalUpper === 'DEFINITIVA' ? 'maritimo' : canalUpper.toLowerCase(),
          pesoRealKg: pesoTotal,
          valorFOB: fobAjustado
        });
        fleteTotal = est.flete || 0;
        resultado.etapas.flete = { estimado: true, monto: fleteTotal, transit: est.tiempoTransito, desglose: est.desglose };
        trazabilidad.flete = { estado: 'estimado', fuente: 'tarifa_referencial', monto: fleteTotal };
        log.push(`✓ Flete estimado: $${fleteTotal.toFixed(2)}`);
      } catch (error) { /* freight estimator fallback */ }
    }
    if (fleteTotal > 0 && trazabilidad.flete.estado === 'pendiente') {
      trazabilidad.flete = { estado: 'real', fuente: 'manual', monto: fleteTotal };
    }
    if (seguroTotal > 0 && trazabilidad.seguro.estado === 'pendiente') {
      trazabilidad.seguro = { estado: 'real', fuente: 'manual', monto: seguroTotal };
    } else if (seguroTotal === 0) {
      trazabilidad.seguro = { estado: 'estimado', fuente: 'default_1_5', monto: null };
    }

    // ── TRIBUTOS POR ITEM ──
    log.push('Calculando tributos...');
    const percepcionTipo = tipoImportador || 'general';

    itemsClasificados = itemsClasificados.map(item => {
      const itemFOB = (item.qty || 1) * (item.unit || 0);
      const proporcion = fobAjustado > 0 ? itemFOB / fobAjustado : 1 / itemsClasificados.length;
      const fleteItem = fleteTotal * proporcion;
      const seguroItem = seguroTotal > 0 ? seguroTotal * proporcion : itemFOB * SEGURO_DEFAULT;
      item.tributos = calcularTributos(item, fleteItem, seguroItem, canalUpper, percepcionTipo);
      return item;
    });

    // ── TOTALES ──
    const totales = { fob: 0, flete: fleteTotal, seguro: 0, cif: 0, adValorem: 0, isc: 0, igv: 0, ipm: 0, percepcion: 0, antidumping: 0, totalTributos: 0, totalLanded: 0 };
    itemsClasificados.forEach(it => {
      if (!it.tributos) return;
      for (const k of ['fob','seguro','cif','adValorem','isc','igv','ipm','percepcion','antidumping','totalTributos','totalLanded']) {
        totales[k] += it.tributos[k] || 0;
      }
    });

    // ── COSTOS OPERATIVOS ──
    const pesoTotal = itemsClasificados.reduce((s, i) => s + ((i.pesoKg || 1) * (i.qty || 1)), 0);
    totales.costosOperativos = calcularCostosOperativos(canalUpper, totales.cif, pesoTotal);
    totales.totalReal = totales.totalLanded + totales.costosOperativos.totalOperativo;

    if (tc > 0) {
      totales.totalPEN = totales.totalReal * tc;
      totales.totalLandedPEN = totales.totalLanded * tc;

      // TC SENSITIVITY ANALYSIS
      totales.sensibilidadTC = calcularSensibilidadTC(totales.totalReal, tc);
      log.push('✓ Sensibilidad TC calculada (±3%, ±5%, ±10%)');
    }
    log.push(`✓ Total landed: $${totales.totalLanded.toFixed(2)} + operativos: $${totales.costosOperativos.totalOperativo.toFixed(2)} = $${totales.totalReal.toFixed(2)}`);

    // ── MARGEN DE VENTA ──
    const totalQty = itemsClasificados.reduce((s, i) => s + (i.qty || 1), 0);
    if (totalQty > 0) {
      const costoPorUnidadGlobal = totales.totalReal / totalQty;
      totales.margenVenta = calcularMargen(costoPorUnidadGlobal, 0, margenVenta);
      log.push(`✓ Precio venta sugerido: $${totales.margenVenta.precioVentaConIGV.toFixed(2)} c/u (${totales.margenVenta.margenPct}% margen)`);
    }

    // Per-item margin
    itemsClasificados.forEach(item => {
      if (item.tributos && (item.qty || 1) > 0) {
        const cpuOperativo = totales.costosOperativos.totalOperativo / totalQty;
        item.margenVenta = calcularMargen(item.tributos.costoPorUnidad, cpuOperativo, margenVenta);
      }
    });

    // ── ALERTAS NORMATIVAS ──
    const alertasNormativas = verificarAlertas(itemsClasificados, country);
    resultado.alertas.push(...alertasNormativas);

    // ── DUDA RAZONABLE ──
    try {
      log.push('Verificando duda razonable...');
      const dudas = await verificarDudaRazonable(itemsClasificados, country);
      const riesgosos = dudas.filter(d => d?.riesgo === 'alto' || d?.riesgo === 'critico');
      if (riesgosos.length > 0) {
        resultado.alertas.push({ tipo: 'duda_razonable', nivel: 'alto',
          mensaje: `🔶 ${riesgosos.length} item(s) con riesgo de duda razonable SUNAT`,
          items: riesgosos.map(d => ({ hs: d.hs, desc: d.desc, riesgo: d.riesgo, mensaje: d.mensaje })),
        });
      }
      resultado.etapas.dudaRazonable = { verificados: dudas.length, riesgosos: riesgosos.length };
    } catch (e) { resultado.etapas.dudaRazonable = { error: e.message }; }

    resultado.exito = true;
    resultado.items = itemsClasificados;
    resultado.totales = totales;
    resultado.metadata = { proveedor, pais: country, incoterm, canal: canalUpper, tc, moneda: monedaUpper, tipoImportador: percepcionTipo, margenVentaPct: margenVenta || 30 };
    trazabilidad.seguro.monto = totales.seguro || trazabilidad.seguro.monto;
    trazabilidad.flete.monto = totales.flete || trazabilidad.flete.monto;
    resultado.trazabilidad = trazabilidad;
    resultado.precision = evaluarPrecisionCotizacion({ items: itemsClasificados, trazabilidad });
    resultado.alertas.unshift({
      tipo: 'precision',
      nivel: resultado.precision.requiereRevision ? 'alto' : (resultado.precision.esReferencial ? 'medio' : 'info'),
      mensaje: resultado.precision.resumen,
    });
    resultado.recomendaciones = generarRecomendacionesResultado({
      pais: country,
      canal: canalUpper,
      incoterm,
      resultado,
    });
    resultado.log = log;

  } catch (e) { resultado.error = e.message; resultado.log = log; }

  resultado.tiempoMs = Date.now() - startTime;
  return resultado;
}

// ══════════════════════════════════════════
// MOTOR DE TRIBUTOS (el core)
// ══════════════════════════════════════════
function calcularTributos(item, fleteItem, seguroItem, canal, tipoImportador) {
  const qty = item.qty || 1, unitPrice = item.unit || 0;
  const fob = qty * unitPrice;
  const seguro = seguroItem || fob * SEGURO_DEFAULT;
  const cif = fob + (fleteItem || 0) + seguro;
  const advRate = (item.advConTLC ?? item.adv ?? 0) / 100;

  // ISC
  let iscRate = (item.iscRate || 0) / 100;
  let iscAdvertencia = null;
  if (item.iscRate === -1 || item.iscRate > 900) { iscRate = 0; iscAdvertencia = '⚠ ISC sistema especial — consultar SUNAT'; }

  const adValorem = cif * advRate;
  const isc = (cif + adValorem) * (iscRate > 0 ? iscRate : 0);

  // ANTIDUMPING (now from INDECOPI database!)
  const antidumpingRate = item.antidumpingRate || 0;
  const antidumping = cif * antidumpingRate;

  // IGV por item (from NANDINA)
  const igvItemRate = (item.igvRate != null ? item.igvRate : 16) / 100;
  const baseIGV = cif + adValorem + isc + antidumping;
  const igv = baseIGV * igvItemRate;
  const ipm = baseIGV * IPM_RATE;

  // PERCEPCIÓN DIFERENCIADA
  let percRate = 0;
  let percTipo = 'no_aplica';
  if (canal !== 'POSTAL' && canal !== 'COURIER') {
    if (tipoImportador === 'nuevo' || tipoImportador === 'primera_vez') {
      percRate = 0.10; percTipo = '10% (importador nuevo)';
    } else if (item.bienUsado) {
      percRate = 0.05; percTipo = '5% (bien usado)';
    } else if (tipoImportador === 'buen_contribuyente') {
      percRate = 0.035; percTipo = '3.5% (buen contribuyente)';
    } else {
      percRate = 0.035; percTipo = '3.5% (general)';
    }
  }
  const percepcion = (cif + adValorem + isc + igv + ipm) * percRate;

  const totalTributos = adValorem + isc + igv + ipm + percepcion + antidumping;

  return {
    fob, flete: fleteItem || 0, seguro, cif,
    adValorem, advRate: (item.advConTLC ?? item.adv ?? 0),
    isc, iscRate: item.iscRate || 0, iscAdvertencia,
    antidumping, antidumpingRate: antidumpingRate * 100,
    antidumpingInfo: item.antidumpingInfo || null,
    baseIGV, igv, igvRate: item.igvRate != null ? item.igvRate : 16,
    ipm, percepcion, percTipo, percRate: percRate * 100,
    totalTributos,
    totalLanded: cif + totalTributos,
    costoPorUnidad: qty > 0 ? (cif + totalTributos) / qty : 0,
    tlcAplicado: item.advConTLC != null && item.advConTLC !== item.adv,
  };
}

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════

async function clasificarItems(items) {
  const results = await Promise.allSettled(
    items.map(async (item) => {
      if (item.hs && item.hs.length >= 8) {
        const clean = item.hs.replace(/\./g, '').padEnd(10, '0');
        const match = nandinaService.getData().find(h => h.p === clean);
        if (match) return { ...item, hs: clean, hsFormatted: formatHS(clean), adv: match.a, confianza: 100, descripcionOficial: match.d, metodoClasificacion: 'manual' };
      }
      try {
        const result = await clasificador.clasificarMultiAgente(item.desc);
        if (result.consenso?.hs) {
          const clean = result.consenso.hs.replace(/\./g, '').padEnd(10, '0');
          return { ...item, hs: clean, hsFormatted: formatHS(clean), adv: result.consenso.advalorem ?? 0, confianza: result.consenso.confianza ?? 0, descripcionOficial: result.consenso.descripcionOficial || '', metodoClasificacion: result.consenso.metodo, advertencia: result.consenso.advertencia || null };
        }
      } catch (e) { console.log(`[AUTO] HS failed for "${item.desc}": ${e.message}`); }
      try {
        const simple = await aiProxy.classify([{ role: 'user', content: `Clasifica: ${item.desc}` }], 'groq');
        const hsMatch = simple.text?.match(/\d{4}[.\s]?\d{2}[.\s]?\d{2}[.\s]?\d{2}/);
        if (hsMatch) {
          const clean = hsMatch[0].replace(/[.\s]/g, '').padEnd(10, '0');
          const nandina = nandinaService.getData().find(h => h.p === clean);
          return { ...item, hs: clean, hsFormatted: formatHS(clean), adv: nandina?.a ?? 0, confianza: 60, metodoClasificacion: 'simple' };
        }
      } catch (error) { /* simple classifier fallback */ }
      return { ...item, hs: null, adv: 0, confianza: 0, error: 'No se pudo clasificar' };
    })
  );
  return results.map(r => r.status === 'fulfilled' ? r.value : { error: 'Error' });
}

function enriquecerConNandina(items, country) {
  return items.map(item => {
    if (!item.hs) return item;
    const match = nandinaService.getData().find(h => h.p === item.hs);
    if (match) { item.adv = match.a; item.igvRate = match.g || 16; item.iscRate = match.i || 0; item.seguroRate = match.s || 1.5; item.descripcionOficial = match.d; }
    if (country) {
      const tlc = nandinaService.getTLCPreference(item.hs, country);
      if (tlc?.preferencia > 0) { item.tlc = tlc; item.advConTLC = Math.max(0, item.adv * (1 - tlc.preferencia / 100)); item.ahorroTLC = item.adv - item.advConTLC; }
    }
    const perm = permisos.consultaPermisos(item.hs);
    if (perm.restringida || perm.prohibida?.si) item.permisos = perm;
    const prohib = nandinaService.isProhibida(item.hs);
    if (prohib) { item.prohibida = true; item.prohibidaDesc = prohib.desc; }
    return item;
  });
}

async function verificarDudaRazonable(items, country) {
  const checks = await Promise.allSettled(
    items.filter(it => it.hs && it.unit).map(async (item) => {
      try {
        const stats = await valoracion.getEstadisticas(item.hs);
        return { hs: item.hs, desc: item.desc, ...valoracion.analizarDudaRazonable(item.unit, item.pesoKg || 1, stats, country) };
      } catch { return null; }
    })
  );
  return checks.map(c => c.status === 'fulfilled' ? c.value : null).filter(Boolean);
}

function formatHS(hs) {
  if (!hs || hs.length < 10) return hs;
  return `${hs.slice(0,4)}.${hs.slice(4,6)}.${hs.slice(6,8)}.${hs.slice(8,10)}`;
}

module.exports = { extraer, calcular, calcularTributos, buscarAntidumping, ANTIDUMPING_MEDIDAS, convertirAUSD, ajustarIncoterm, INCOTERM_INFO, calcularSensibilidadTC };
