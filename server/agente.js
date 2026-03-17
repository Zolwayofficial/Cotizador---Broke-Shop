// server/agente.js — Sistema Multi-Agente para Cotización de Importación
//
// ARQUITECTURA:
//
//   Usuario: "Quiero importar 500 camisetas de China a $3 c/u"
//     ↓
//   ORQUESTADOR (Agente General)
//     ├→ Agente Clasificador (2+ modelos debaten HS code)
//     ├→ Agente Regulatorio (SUNAT, VUCE, MTC, DIGESA, SENASA...)
//     ├→ Agente Calculista (motor tributario completo)
//     ├→ Agente Valoración (duda razonable, precios referencia)
//     ├→ Agente Logístico (flete, seguro, incoterms, tracking)
//     ├→ Agente Legal (leyes vigentes, antidumping, alertas)
//     └→ Agente Compliance (OFAC, sanciones, prohibiciones)
//     ↓
//   Resultado completo en una sola respuesta
//
// Cada sub-agente tiene funciones específicas y opera independientemente.
// El orquestador decide QUÉ agentes activar según el input.

const clasificador = require('./clasificador');
const nandinaService = require('./nandina');
const permisos = require('./permisos');
const valoracion = require('./valoracion');
const flete = require('./flete');
const sanciones = require('./sanciones');
const regimenes = require('./regimenes');
const aiProxy = require('./ai-proxy');
const { evaluarPrecisionCotizacion } = require('./cotizacion-precision');
const { dedupePermisos, generarRecomendacionesResultado } = require('./cotizacion-insights');
const { buildImportProfile } = require('./importacion-profile');
const { normalizarCodigoPais, normalizarPaisParaRuta } = require('./paises');
const { construirValidacionOficialImportacion } = require('./validacion-oficial-importacion');
const { resolverTipoCambioOperativo, construirAlertaTipoCambio } = require('./tipo-cambio-operativo');
const {
  hasAdvancedBenchmarkInput,
  calculateAdvancedImportBenchmark,
} = require('./benchmarks/advanced-import-benchmark');

const IPM_RATE = 0.02;
const SEGURO_DEFAULT = 0.015;

async function resolverValidacionOficial(resultado, items, pais, log) {
  try {
    const validacionOficial = await construirValidacionOficialImportacion({ items, pais });
    if (validacionOficial?.subpartidas?.length) {
      resultado.validacionOficial = validacionOficial;
      agregarAlertaTributariaOficial(resultado, validacionOficial);
      if (Array.isArray(log)) {
        log.push(
          `[Oficial] ✓ ADUANET validó ${validacionOficial.subpartidas.length} subpartida(s)` +
          `${validacionOficial.truncado ? ' (resultado truncado para mantener velocidad)' : ''}`
        );
      }
    } else if (validacionOficial?.error && Array.isArray(log)) {
      agregarAlertaTributariaOficial(resultado, validacionOficial);
      log.push(`[Oficial] Validacion oficial no disponible: ${validacionOficial.error}`);
    }
    return validacionOficial;
  } catch (error) {
    if (Array.isArray(log)) {
      log.push(`[Oficial] Validacion oficial omitida: ${error.message}`);
    }
    return null;
  }
}

function agregarAlertaTributariaOficial(resultado, validacionOficial) {
  if (!resultado || !Array.isArray(resultado.alertas) || !validacionOficial) return;

  resultado.alertas = resultado.alertas.filter(
    (alerta) => alerta?.tipo !== 'normativo_tributario_oficial'
  );

  const subpartidas = Array.isArray(validacionOficial.subpartidas)
    ? validacionOficial.subpartidas
    : [];
  const conFuenteOficial = subpartidas.filter((subpartida) => subpartida?.oficialEnVivo).length;

  if (subpartidas.length > 0) {
    const hasIsc = subpartidas.some((subpartida) => {
      const isc = Number(subpartida?.gravamenes?.isc);
      return Number.isFinite(isc) && isc > 0;
    });
    const hasConvenio = subpartidas.some((subpartida) => Boolean(subpartida?.convenio));

    resultado.alertas.push({
      tipo: 'normativo_tributario_oficial',
      nivel: conFuenteOficial > 0 ? 'info' : 'medio',
      mensaje: conFuenteOficial > 0
        ? `Validacion tributaria oficial: ADUANET confirmo gravamenes para ${subpartidas.length} subpartida(s). IGV, IPM${hasIsc ? ', ISC' : ''}${hasConvenio ? ' y convenios' : ''} pueden variar por producto y pais; toma como vigente el bloque "Validacion oficial en vivo".`
        : 'No se obtuvo confirmacion oficial en vivo para esta corrida. Confirma IGV, IPM, ISC, convenios y cargos extra en ADUANET/SUNAT antes de cerrar la operacion.',
    });
    return;
  }

  if (validacionOficial.error) {
    resultado.alertas.push({
      tipo: 'normativo_tributario_oficial',
      nivel: 'medio',
      mensaje: 'Validacion oficial tributaria no disponible en esta consulta. Confirma en ADUANET/SUNAT la distribucion IGV/IPM, ISC y convenios aplicables antes de cerrar.',
    });
  }
}

// Tasas de cambio fallback
const TC_FALLBACK = {
  USD:1, EUR:1.08, GBP:1.27, CNY:0.138, JPY:0.0067,
  KRW:0.00074, TWD:0.031, THB:0.028, INR:0.012,
  BRL:0.20, MXN:0.058, CAD:0.74, AUD:0.65, PEN:0.27,
};

// Antidumping INDECOPI vigentes
const ANTIDUMPING = [
  { hs:'6109', pais:'CN', tasa:5.51, desc:'Camisetas algodón', res:'025-2019' },
  { hs:'6105', pais:'CN', tasa:3.73, desc:'Camisas punto algodón', res:'025-2019' },
  { hs:'6205', pais:'CN', tasa:1.98, desc:'Camisas tejido plano', res:'134-2019' },
  { hs:'5407', pais:'CN', tasa:0.18, desc:'Tejidos filamentos sintéticos', res:'044-2014', porKg:true },
  { hs:'5516', pais:'CN', tasa:0.66, desc:'Tejidos fibras artificiales', res:'044-2014', porKg:true },
  { hs:'7213', pais:'CN', tasa:12.0, desc:'Barras acero', res:'023-2021' },
  { hs:'7306', pais:'CN', tasa:11.0, desc:'Tubos perfiles acero', res:'015-2018' },
  { hs:'6402', pais:'CN', tasa:2.97, desc:'Calzado caucho/plástico', res:'060-2020' },
  { hs:'6403', pais:'CN', tasa:1.82, desc:'Calzado cuero', res:'060-2020' },
  { hs:'6404', pais:'CN', tasa:3.41, desc:'Calzado textil', res:'060-2020' },
  { hs:'3920', pais:'CN', tasa:19.3, desc:'Cierres tapas plástico', res:'003-2023' },
  { hs:'7304', pais:'CN', tasa:15.0, desc:'Tubos acero sin costura', res:'080-2017' },
];

// Incoterms info
const INCOTERMS = {
  EXW: { incluyeFlete:false, incluyeSeguro:false, extraPct:0.08, desc:'Precio en fábrica' },
  FCA: { incluyeFlete:false, incluyeSeguro:false, extraPct:0.03, desc:'Entregado al transportista' },
  FAS: { incluyeFlete:false, incluyeSeguro:false, extraPct:0.02, desc:'Al costado del buque' },
  FOB: { incluyeFlete:false, incluyeSeguro:false, extraPct:0,    desc:'A bordo del buque' },
  CFR: { incluyeFlete:true,  incluyeSeguro:false, extraPct:0,    desc:'Costo + flete' },
  CIF: { incluyeFlete:true,  incluyeSeguro:true,  extraPct:0,    desc:'Costo + seguro + flete' },
  CPT: { incluyeFlete:true,  incluyeSeguro:false, extraPct:0,    desc:'Transporte pagado' },
  CIP: { incluyeFlete:true,  incluyeSeguro:true,  extraPct:0,    desc:'Transporte + seguro pagados' },
  DAP: { incluyeFlete:true,  incluyeSeguro:true,  extraPct:0,    desc:'Entregado en destino' },
  DPU: { incluyeFlete:true,  incluyeSeguro:true,  extraPct:0,    desc:'Entregado descargado' },
  DDP: { incluyeFlete:true,  incluyeSeguro:true,  extraPct:0,    desc:'Entregado con derechos pagados', incluyeTributos:true },
};

// ══════════════════════════════════════════════════════
// SUB-AGENTE 1: CLASIFICADOR (2+ modelos debaten)
// ══════════════════════════════════════════════════════
const agenteClasificador = {
  nombre: 'Clasificador HS',
  
  async clasificar(items) {
    const resultados = await Promise.allSettled(
      items.map(async (item) => {
        // Si ya viene con HS manual, validar contra NANDINA
        if (item.hs && item.hs.length >= 8) {
          const clean = item.hs.replace(/\./g,'').padEnd(10,'0');
          const match = nandinaService.getData().find(h => h.p === clean);
          if (match) return { ...item, hs:clean, adv:match.a, igvRate:match.g||16, iscRate:match.i||0, seguroRate:match.s||1.5, descOficial:match.d, confianza:100, metodo:'manual' };
        }
        // Multi-agente: 2 modelos + árbitro + validación NANDINA
        try {
          const r = await clasificador.clasificarMultiAgente(item.desc);
          if (r.consenso?.hs) {
            const clean = r.consenso.hs.replace(/\./g,'').padEnd(10,'0');
            const match = nandinaService.getData().find(h => h.p === clean);
            return {
              ...item, hs:clean,
              adv: match?.a ?? r.consenso.advalorem ?? 0,
              igvRate: match?.g || 16, iscRate: match?.i || 0, seguroRate: match?.s || 1.5,
              descOficial: match?.d || r.consenso.descripcionOficial || '',
              confianza: r.consenso.confianza || 0,
              metodo: r.consenso.metodo,
              advertencia: r.consenso.advertencia,
            };
          }
        } catch(e) { /* fallthrough */ }
        // Fallback simple
        try {
          const s = await aiProxy.classify([{role:'user',content:`Clasifica: ${item.desc}`}],'groq');
          const m = s.text?.match(/\d{4}[.\s]?\d{2}[.\s]?\d{2}[.\s]?\d{2}/);
          if (m) {
            const clean = m[0].replace(/[.\s]/g,'').padEnd(10,'0');
            const match = nandinaService.getData().find(h => h.p === clean);
            return { ...item, hs:clean, adv:match?.a||0, igvRate:match?.g||16, iscRate:match?.i||0, confianza:55, metodo:'simple' };
          }
        } catch (error) { /* fallback simple */ }
        return { ...item, hs:null, adv:0, confianza:0, error:'Sin clasificación' };
      })
    );
    return resultados.map(r => r.status==='fulfilled' ? r.value : {error:'Fallo'});
  },
};

// ══════════════════════════════════════════════════════
// SUB-AGENTE 2: REGULATORIO (SUNAT, VUCE, ministerios)
// ══════════════════════════════════════════════════════
const agenteRegulatorio = {
  nombre: 'Regulatorio',

  analizar(items, pais) {
    const alertas = [];
    const detallePermisos = [];

    items.forEach(item => {
      if (!item.hs) return;

      // Prohibida
      const prohib = nandinaService.isProhibida(item.hs);
      if (prohib) {
        item.prohibida = true;
        alertas.push({ nivel:'critico', tipo:'prohibida', mensaje:`⛔ ${item.desc}: MERCANCÍA PROHIBIDA — ${prohib.desc}` });
      }

      // Restringida (permisos)
      const perm = permisos.consultaPermisos(item.hs);
      if (perm.restringida) {
        item.permisos = perm;
        perm.permisos.forEach(p => {
          if (!detallePermisos.find(d => d.entidad === p.entidad)) {
            detallePermisos.push(p);
          }
        });
        alertas.push({ nivel:'alto', tipo:'restringida', mensaje:`⚠ ${item.desc}: requiere permiso de ${perm.permisos.map(p=>p.entidad).join(', ')}` });
      }

      // TLC
      if (pais) {
        const tlc = nandinaService.getTLCPreference(item.hs, pais);
        if (tlc?.preferencia > 0) {
          item.tlc = tlc;
          item.advConTLC = Math.max(0, item.adv * (1 - tlc.preferencia/100));
          item.ahorroTLC = item.adv - item.advConTLC;
        }
      }

      // Antidumping
      const hsClean = item.hs.replace(/\./g,'');
      const paisUp = normalizarCodigoPais(pais);
      for (const ad of ANTIDUMPING) {
        if (hsClean.startsWith(ad.hs) && paisUp && ad.pais === paisUp) {
          item.antidumpingRate = ad.tasa / 100;
          item.antidumpingInfo = ad;
          alertas.push({ nivel:'alto', tipo:'antidumping', mensaje:`🛡 ${item.desc}: antidumping ${ad.tasa}% (Res. ${ad.res})` });
          break;
        }
      }
    });

    return { items, alertas, detallePermisos };
  },
};

// ══════════════════════════════════════════════════════
// SUB-AGENTE 3: CALCULISTA (motor tributario)
// ══════════════════════════════════════════════════════
const agenteCalculista = {
  nombre: 'Calculista',

  // Ajustar de cualquier Incoterm → FOB
  ajustarIncoterm(items, incoterm, fleteManual, seguroManual) {
    const inc = INCOTERMS[(incoterm||'FOB').toUpperCase()];
    const precision = {
      codigo: (incoterm || 'FOB').toUpperCase(),
      estado: 'exacto',
      fobEstimado: false,
      fleteEstimado: false,
      seguroEstimado: false,
      mensaje: null,
    };
    if (!inc || incoterm === 'FOB') return { items, flete:fleteManual, seguro:seguroManual, ajuste:null, precision };

    const fobTotal = items.reduce((s,i) => s + (i.qty||1)*(i.unit||0), 0);
    let fobAjustado = fobTotal;
    let fleteExtraido = fleteManual;
    let seguroExtraido = seguroManual;

    if (inc.incluyeFlete && inc.incluyeSeguro) {
      // CIF/CIP/DAP/DPU/DDP: precio incluye flete+seguro
      const flEst = fleteManual || fobTotal * 0.08;
      const sgEst = seguroManual || fobTotal * 0.015;
      if (!fleteManual || !seguroManual) {
        precision.estado = 'estimado';
        precision.fleteEstimado = !fleteManual;
        precision.seguroEstimado = !seguroManual;
        precision.mensaje = 'Se estimaron componentes del incoterm para llevarlo a FOB.';
      }
      fobAjustado = Math.max(0, fobTotal - flEst - sgEst);
      fleteExtraido = flEst;
      seguroExtraido = sgEst;
    } else if (inc.incluyeFlete) {
      // CFR/CPT: incluye flete pero no seguro
      const flEst = fleteManual || fobTotal * 0.10;
      if (!fleteManual) {
        precision.estado = 'estimado';
        precision.fleteEstimado = true;
        precision.mensaje = 'Se estimo el flete para desarmar el incoterm.';
      }
      fobAjustado = Math.max(0, fobTotal - flEst);
      fleteExtraido = flEst;
    } else if (inc.extraPct > 0) {
      // EXW/FCA/FAS: sumar costos de origen
      precision.estado = 'estimado';
      precision.fobEstimado = true;
      precision.mensaje = 'Se sumaron costos de origen estimados para llevar el precio a FOB.';
      fobAjustado = fobTotal + fobTotal * inc.extraPct;
    }

    if (inc.incluyeTributos) {
      // DDP: estimar FOB como ~65% del precio
      precision.estado = 'estimado';
      precision.fobEstimado = true;
      precision.fleteEstimado = true;
      precision.seguroEstimado = true;
      precision.mensaje = 'DDP no puede desglosarse con exactitud sin un FOB real del proveedor.';
      fobAjustado = fobTotal * 0.65;
    }

    // Adjust per-item prices proportionally
    const ratio = fobTotal > 0 ? fobAjustado / fobTotal : 1;
    items.forEach(item => {
      if (item.unit) { item.unitOriginal = item.unit; item.unit *= ratio; }
    });

    return {
      items, flete: fleteExtraido, seguro: seguroExtraido,
      ajuste: { incoterm, desc: inc.desc, fobOriginal: fobTotal, fobAjustado, ratio },
      precision,
    };
  },

  // Convertir moneda
  convertirMoneda(items, moneda, tcCustom) {
    if (!moneda || moneda === 'USD') return { items, conversion: null };
    const tasa = tcCustom || TC_FALLBACK[moneda.toUpperCase()] || 1;
    items.forEach(item => {
      if (item.unit) { item.unitMonedaOriginal = item.unit; item.unit *= tasa; }
    });
    return { items, conversion: { moneda, tasa } };
  },

  // Motor tributario por item
  calcularItem(item, fleteItem, seguroItem, canal, tipoImportador) {
    const qty = item.qty||1, unit = item.unit||0;
    const fob = qty * unit;
    const seguro = seguroItem || fob * SEGURO_DEFAULT;
    const cif = fob + (fleteItem||0) + seguro;

    const advRate = (item.advConTLC ?? item.adv ?? 0) / 100;
    let iscRate = (item.iscRate||0) / 100;
    let iscNota = null;
    if (item.iscRate === -1 || item.iscRate > 900) { iscRate = 0; iscNota = 'ISC sistema especial'; }

    const adValorem = cif * advRate;
    const isc = (cif + adValorem) * (iscRate > 0 ? iscRate : 0);
    const antidumping = cif * (item.antidumpingRate || 0);

    const igvRate = (item.igvRate != null ? item.igvRate : 16) / 100;
    const baseIGV = cif + adValorem + isc + antidumping;
    const igv = baseIGV * igvRate;
    const ipm = baseIGV * IPM_RATE;

    // Percepción diferenciada
    let percRate = 0, percTipo = 'no aplica';
    if (canal !== 'POSTAL' && canal !== 'COURIER') {
      if (tipoImportador === 'nuevo') { percRate = 0.10; percTipo = '10% (nuevo)'; }
      else if (item.bienUsado) { percRate = 0.05; percTipo = '5% (usado)'; }
      else { percRate = 0.035; percTipo = '3.5% (general)'; }
    }
    const percepcion = (cif + adValorem + isc + igv + ipm) * percRate;

    const totalTributos = adValorem + isc + igv + ipm + percepcion + antidumping;

    return {
      fob, flete:fleteItem||0, seguro, cif,
      adValorem, advPct: item.advConTLC ?? item.adv ?? 0,
      isc, iscPct: item.iscRate||0, iscNota,
      antidumping, antidumpingPct: (item.antidumpingRate||0)*100,
      baseIGV, igv, igvPct: item.igvRate != null ? item.igvRate : 16,
      ipm, percepcion, percTipo,
      totalTributos, totalLanded: cif + totalTributos,
      cpu: qty > 0 ? (cif + totalTributos) / qty : 0,
      tlcAplicado: item.advConTLC != null && item.advConTLC !== item.adv,
    };
  },

  // DSI simplificado (FOB ≤ $2,000)
  calcularDSI(fob, fleteT, seguroT) {
    const seguro = seguroT || fob * SEGURO_DEFAULT;
    const cif = fob + fleteT + seguro;
    const av = cif * 0.04;
    const base = cif + av;
    return { modo:'DSI', fob, flete:fleteT, seguro, cif, adValorem:av, igv:base*0.16, ipm:base*0.02, totalTributos:av+base*0.18, totalLanded:cif+av+base*0.18 };
  },

  // Costos operativos
  calcularOperativos(canal, cif) {
    if (canal === 'COURIER' || canal === 'POSTAL') return { totalOperativo: canal === 'POSTAL' ? 15 : 0 };
    return {
      agenteAduanas: Math.max(200, cif * 0.015),
      almacenaje: canal === 'MARITIMO' ? 120 : 80,
      transporteLocal: canal === 'MARITIMO' ? 200 : 100,
      comisionBancaria: 40,
      gastosOperativos: 50,
      get totalOperativo() { return this.agenteAduanas + this.almacenaje + this.transporteLocal + this.comisionBancaria + this.gastosOperativos; },
    };
  },

  // Margen de venta
  calcularMargen(cpu, cpuOperativo, pct) {
    const costo = cpu + cpuOperativo;
    const safe = Math.min(Math.max(pct||30, 1), 99);
    const venta = costo / (1 - safe/100);
    return { costoUnit:costo, margen:safe, ventaSinIGV:venta, ventaConIGV:venta*1.18, utilidad:venta-costo };
  },

  // Sensibilidad TC
  sensibilidadTC(totalUSD, tc) {
    if (!tc || tc <= 0) return null;
    return [-10,-5,-3,0,3,5,10].map(pct => {
      const tcA = tc * (1 + pct/100);
      return { variacion:`${pct>=0?'+':''}${pct}%`, tc:+tcA.toFixed(4), totalPEN:+(totalUSD*tcA).toFixed(2), dif:+((totalUSD*tcA)-(totalUSD*tc)).toFixed(2) };
    });
  },
};

// ══════════════════════════════════════════════════════
// SUB-AGENTE 4: VALORACIÓN (duda razonable)
// ══════════════════════════════════════════════════════
const agenteValoracion = {
  nombre: 'Valoración',

  async verificar(items, pais) {
    const resultados = await Promise.allSettled(
      items.filter(i => i.hs && i.unit).map(async item => {
        try {
          const stats = await valoracion.getEstadisticas(item.hs);
          return { hs:item.hs, desc:item.desc, ...valoracion.analizarDudaRazonable(item.unit, item.pesoKg||1, stats, pais) };
        } catch { return null; }
      })
    );
    return resultados.map(r => r.status==='fulfilled'?r.value:null).filter(Boolean);
  },
};

// ══════════════════════════════════════════════════════
// SUB-AGENTE 5: LOGÍSTICO (flete + tracking)
// ══════════════════════════════════════════════════════
const agenteLogistico = {
  nombre: 'Logístico',

  estimarFlete(pais, canal, pesoKg, fobTotal) {
    try {
      return flete.estimarFlete({
        origen: normalizarPaisParaRuta(pais),
        canal: canal === 'DEFINITIVA' ? 'maritimo' : (canal||'maritimo').toLowerCase(),
        pesoRealKg: pesoKg, valorFOB: fobTotal,
      });
    } catch { return null; }
  },
};

// ══════════════════════════════════════════════════════
// SUB-AGENTE 6: COMPLIANCE (OFAC + sanciones)
// ══════════════════════════════════════════════════════
const agenteCompliance = {
  nombre: 'Compliance',

  async verificarProveedor(nombre, pais) {
    if (!nombre || nombre.length < 3) return null;
    try {
      return await sanciones.verificar(nombre, pais, 'empresa');
    } catch { return null; }
  },
};

// ══════════════════════════════════════════════════════
// SUB-AGENTE 7: LEGAL (leyes, regímenes, alertas)
// ══════════════════════════════════════════════════════
const agenteLegal = {
  nombre: 'Legal',

  generarAlertas(items, _pais) {
    const alertas = [];

    items.forEach(item => {
      if (item.antidumpingInfo) {
        const year = new Date().getFullYear();
        if (parseInt(item.antidumpingInfo.vigenciaHasta || '2099') - year <= 1) {
          alertas.push({ tipo:'antidumping_expira', nivel:'medio', mensaje:`⏰ Antidumping ${item.antidumpingInfo.desc} por vencer. Verificar con INDECOPI.` });
        }
      }
      if (item.tlc?.preferencia > 0) {
        alertas.push({ tipo:'tlc', nivel:'info', mensaje:`🤝 ${item.desc}: TLC ahorra ${item.ahorroTLC}% AV` });
      }
    });

    return alertas;
  },

  recomendarRegimen(params) {
    return regimenes.recomendarRegimen(params);
  },
};

// ══════════════════════════════════════════════════════
// SUB-AGENTE 8: EXTRACTOR (lee documentos)
// ══════════════════════════════════════════════════════
const agenteExtractor = {
  nombre: 'Extractor',

  async extraer(contenido, tipo) {
    if (tipo === 'json') return { ok:true, data:contenido };

    const result = await aiProxy.extract(contenido, tipo === 'image' ? 'image' : 'document');
    if (result.ok && result.data) return { ok:true, data:result.data };

    // Retry
    try {
      const msgs = [
        { role:'system', content:'Extrae items de esta cotización. SOLO JSON: {"items":[{"desc":"...","qty":N,"unit":N}],"currency":"USD","country":"XX","supplier":"...","incoterm":"FOB","freight":N}' },
        { role:'user', content: tipo==='image' ? [{type:'image_url',image_url:{url:contenido}},{type:'text',text:'Extrae datos.'}] : contenido },
      ];
      const r = await aiProxy.call(msgs, 'groq');
      const c = r.text.replace(/```json|```/g,'').trim();
      const s = c.indexOf('{'), e = c.lastIndexOf('}');
      if (s>=0 && e>s) return { ok:true, data:JSON.parse(c.substring(s,e+1)) };
    } catch (error) { /* extraction fallback */ }
    return { ok:false, error:'No se pudieron extraer datos' };
  },

  validar(data) {
    const warnings = [];
    if (!data?.items?.length) return { ok:false, error:'Sin items' };
    data.items.forEach((it,i) => {
      if (it.unit > 100000) warnings.push({ item:i, msg:`Precio muy alto: $${it.unit}` });
      if (it.unit > 0 && it.unit < 0.01) warnings.push({ item:i, msg:`Precio muy bajo: $${it.unit}` });
      if (it.qty > 100000) warnings.push({ item:i, msg:`Cantidad muy alta: ${it.qty}` });
      if (!it.desc || it.desc.length < 3) warnings.push({ item:i, msg:'Descripción vacía' });
    });
    return { ok:true, warnings };
  },
};


// ══════════════════════════════════════════════════════════
// ORQUESTADOR — El agente general que coordina todo
// ══════════════════════════════════════════════════════════
async function orquestar(input) {
  const t0 = Date.now();
  const log = [];
  const resultado = {
    exito: false,
    modo: null,           // "completo" | "DSI" | "extraccion"
    items: [],
    totales: {},
    alertas: [],
    permisos: [],
    etapas: {},
    log: [],
    tiempoMs: 0,
  };

  try {
    // ═══ FASE 0: Determinar qué tenemos ═══
    let { items, pais, canal, incoterm, moneda, proveedor } = input;
    const {
      contenido,
      tipo,
      tcMoneda,
      flete: fleteIn,
      seguro: seguroIn,
      seguroModo,
      tc: tcInput,
      tipoImportador,
      tipoSujeto,
      objetivoCalculo,
      margenVenta,
      soloExtraer
    } = input;

    canal = (canal || 'DEFINITIVA').toUpperCase();
    pais = (pais || '').toUpperCase();
    incoterm = (incoterm || 'FOB').toUpperCase();
    moneda = (moneda || 'USD').toUpperCase();
    const seguroMode = String(seguroModo || '').toUpperCase();
    const objetivo = objetivoCalculo || 'precio_sugerido';
    const shouldProjectMargin = objetivo !== 'costo_importacion';
    let fleteManual = parseFloat(fleteIn) || 0;
    let seguroManual = parseFloat(seguroIn) || 0;
    const tipoCambio = await resolverTipoCambioOperativo(tcInput);
    const tc = tipoCambio.tasa || 0;
    const trazabilidad = {
      flete: fleteManual > 0
        ? { estado: 'real', fuente: 'manual', monto: fleteManual }
        : { estado: 'pendiente', fuente: 'sin_definir', monto: 0 },
      seguro: seguroManual > 0
        ? { estado: 'real', fuente: 'manual', monto: seguroManual }
        : (
          seguroMode === 'TABLA'
            ? { estado: 'estimado', fuente: 'seguro_tabla', monto: 0 }
            : (
              seguroMode === 'ESTIMADO'
                ? { estado: 'estimado', fuente: 'default_1_5', monto: 0 }
                : { estado: 'pendiente', fuente: 'sin_definir', monto: 0 }
            )
        ),
      incoterm: { codigo: incoterm, estado: 'exacto', mensaje: null },
      tipoCambio: {
        estado: tipoCambio.estado,
        fuente: tipoCambio.fuente,
        monto: tc,
        mensaje: tipoCambio.mensaje,
        referenciaSunat: tipoCambio.referenciaSunat,
        diferencialVsSunat: tipoCambio.diferencialVsSunat,
      },
    };
    if (tc > 0) {
      log.push(`[TC] ${tipoCambio.mensaje}`);
    }

    // ═══ FASE 1: EXTRACCIÓN (si viene documento en vez de items) ═══
    if (!items?.length && contenido) {
      log.push('[Extractor] Leyendo documento...');
      const ext = await agenteExtractor.extraer(contenido, tipo);
      if (!ext.ok) { resultado.error = ext.error; resultado.log = log; return resultado; }
      const val = agenteExtractor.validar(ext.data);
      resultado.etapas.extraccion = { items: ext.data.items?.length, warnings: val.warnings, proveedor: ext.data.supplier };

      // If soloExtraer=true, return for human review
      if (soloExtraer) {
        resultado.exito = true;
        resultado.modo = 'extraccion';
        resultado.extraccion = {
          data: ext.data,
          paraRevisar: ext.data.items?.map((it,i) => ({ i, desc:it.desc||'', qty:it.qty||1, unit:it.unit||0, sku:it.sku||'' })),
          warnings: val.warnings,
          proveedor: ext.data.supplier, pais: ext.data.country, moneda: ext.data.currency, incoterm: ext.data.incoterm,
        };
        resultado.log = log;
        resultado.tiempoMs = Date.now() - t0;
        return resultado;
      }

      items = ext.data.items;
      if (!pais && ext.data.country) pais = normalizarCodigoPais(ext.data.country) || ext.data.country.toUpperCase();
      if (moneda === 'USD' && ext.data.currency) moneda = ext.data.currency.toUpperCase();
      if (incoterm === 'FOB' && ext.data.incoterm) incoterm = ext.data.incoterm.toUpperCase();
      if (ext.data.supplier) proveedor = ext.data.supplier;
      log.push(`[Extractor] ✓ ${items.length} items de ${proveedor || 'proveedor'}`);
    }

    if (!items?.length) { resultado.error = 'Sin items'; resultado.log = log; return resultado; }

    // ═══ FASE 2: MONEDA ═══
    if (moneda !== 'USD') {
      log.push(`[Calculista] Convirtiendo ${moneda} → USD...`);
      const conv = agenteCalculista.convertirMoneda(items, moneda, tcMoneda);
      resultado.etapas.moneda = conv.conversion;
      log.push(`[Calculista] ✓ 1 ${moneda} = ${conv.conversion?.tasa} USD`);
    }

    // ═══ FASE 3: CLASIFICACIÓN HS ═══
    log.push('[Clasificador] Clasificando partidas (multi-agente)...');
    items = await agenteClasificador.clasificar(items);
    const clasificados = items.filter(i => i.hs);
    resultado.etapas.clasificacion = { total:items.length, ok:clasificados.length, confianza:clasificados.length ? Math.round(clasificados.reduce((s,i)=>s+(i.confianza||0),0)/clasificados.length) : 0 };
    log.push(`[Clasificador] ✓ ${clasificados.length}/${items.length} (confianza ${resultado.etapas.clasificacion.confianza}%)`);

    // ═══ FASE 4: REGULATORIO ═══
    log.push('[Regulatorio] Verificando permisos, TLCs, antidumping...');
    const reg = agenteRegulatorio.analizar(items, pais);
    items = reg.items;
    resultado.alertas.push(...reg.alertas);
    resultado.permisos = dedupePermisos(reg.detallePermisos, items);
    resultado.etapas.regulatorio = { alertas:reg.alertas.length, permisos:resultado.permisos.length };
    log.push(`[Regulatorio] ✓ ${reg.alertas.length} alertas, ${resultado.permisos.length} permisos requeridos`);

    // ═══ FASE 5: INCOTERM → FOB ═══
    if (incoterm !== 'FOB') {
      log.push(`[Calculista] Ajustando ${incoterm} → FOB...`);
      const adj = agenteCalculista.ajustarIncoterm(items, incoterm, fleteManual, seguroManual);
      items = adj.items;
      fleteManual = adj.flete;
      seguroManual = adj.seguro;
      trazabilidad.incoterm = {
        codigo: incoterm,
        estado: adj.precision?.estado || 'exacto',
        mensaje: adj.precision?.mensaje || null,
      };
      if (adj.flete > 0 && trazabilidad.flete.estado !== 'real') {
        trazabilidad.flete = {
          estado: adj.precision?.fleteEstimado ? 'estimado' : 'real',
          fuente: adj.precision?.fleteEstimado ? 'incoterm_estimado' : 'incoterm',
          monto: adj.flete,
        };
      }
      if (adj.seguro > 0 && trazabilidad.seguro.estado !== 'real') {
        trazabilidad.seguro = {
          estado: adj.precision?.seguroEstimado ? 'estimado' : 'real',
          fuente: adj.precision?.seguroEstimado ? 'incoterm_estimado' : 'incoterm',
          monto: adj.seguro,
        };
      }
      resultado.etapas.incoterm = { ...(adj.ajuste || {}), precision: adj.precision || null };
      log.push('[Calculista] ✓ FOB ajustado');
    }

    // ═══ CHECK DSI ═══
    const fobTotal = items.reduce((s,i) => s + (i.qty||1)*(i.unit||0), 0);
    if (fobTotal <= 200 && canal === 'POSTAL') {
      log.push('[Calculista] Modo postal franquicia (FOB <= $200)');
      const seguroPostal = seguroManual || (fobTotal * SEGURO_DEFAULT);
      const cifPostal = fobTotal + fleteManual + seguroPostal;
      const ops = agenteCalculista.calcularOperativos(canal, cifPostal);
      resultado.exito = true;
      resultado.modo = 'POSTAL_FRANQUICIA';
      resultado.items = items;
      resultado.totales = {
        fob: fobTotal,
        flete: fleteManual,
        seguro: seguroPostal,
        cif: cifPostal,
        adValorem: 0,
        isc: 0,
        igv: 0,
        ipm: 0,
        percepcion: 0,
        antidumping: 0,
        totalTributos: 0,
        totalLanded: cifPostal,
        costosOperativos: ops,
        totalReal: cifPostal + (ops.totalOperativo || 0),
      };
      if (tc > 0) resultado.totales.totalPEN = resultado.totales.totalReal * tc;
      resultado.alertas.push({
        tipo: 'postal_franquicia',
        nivel: 'info',
        mensaje: 'Postal de bajo valor: se trato como franquicia postal y sin tributos de importacion en este escenario base.',
      });
      if (fleteManual > 0) {
        trazabilidad.flete = { estado: 'real', fuente: 'manual', monto: fleteManual };
      }
      trazabilidad.seguro = seguroManual > 0
        ? { estado: 'real', fuente: 'manual', monto: seguroPostal }
        : {
          estado: 'estimado',
          fuente: seguroMode === 'TABLA' ? 'seguro_tabla' : 'default_1_5',
          monto: seguroPostal,
        };
      resultado.metadata = {
        proveedor,
        pais,
        canal,
        incoterm,
        moneda,
        tc,
        tcFuente: tipoCambio.fuente,
        tcEstado: tipoCambio.estado,
        tipoSujeto: tipoSujeto || 'empresa',
        tipoImportador: tipoImportador || 'general',
        objetivoCalculo: objetivo,
        margenPct: shouldProjectMargin ? (margenVenta || 30) : null,
        seguroModo: seguroMode || (seguroManual > 0 ? 'REAL' : 'ESTIMADO'),
      };
      resultado.tipoCambio = tipoCambio;
      resultado.trazabilidad = trazabilidad;
      resultado.precision = evaluarPrecisionCotizacion({ items, trazabilidad });
      const alertaTipoCambioPostal = construirAlertaTipoCambio(tipoCambio);
      if (alertaTipoCambioPostal) {
        resultado.alertas.push(alertaTipoCambioPostal);
      }
      resultado.alertas.unshift({
        tipo: 'precision',
        nivel: resultado.precision.requiereRevision ? 'alto' : (resultado.precision.esReferencial ? 'medio' : 'info'),
        mensaje: resultado.precision.resumen,
      });
      resultado.recomendaciones = generarRecomendacionesResultado({
        pais,
        canal,
        incoterm,
        resultado,
      });
      await resolverValidacionOficial(resultado, items, pais, log);
      resultado.perfilImportacion = buildImportProfile({
        canal,
        tipoSujeto,
        tipoImportador,
        objetivoCalculo: objetivo,
        proveedor,
        incoterm,
        trazabilidad,
        permisos: resultado.permisos,
        resultado,
        seguroModo: resultado.metadata.seguroModo,
      });
      if (hasAdvancedBenchmarkInput(input)) {
        resultado.benchmark = calculateAdvancedImportBenchmark(input);
      }
      resultado.log = log;
      resultado.tiempoMs = Date.now() - t0;
      return resultado;
    }

    if (fobTotal <= 2000 && (canal === 'POSTAL' || canal === 'COURIER' || canal === 'DSI')) {
      log.push('[Calculista] Modo DSI (FOB ≤ $2,000)');
      const dsi = agenteCalculista.calcularDSI(fobTotal, fleteManual, seguroManual);
      const ops = agenteCalculista.calcularOperativos(canal, dsi.cif);
      resultado.exito = true; resultado.modo = 'DSI'; resultado.items = items;
      resultado.totales = { ...dsi, costosOperativos:ops, totalReal: dsi.totalLanded + (ops.totalOperativo||0) };
      if (tc > 0) resultado.totales.totalPEN = resultado.totales.totalReal * tc;
      resultado.alertas.push({ tipo:'dsi', nivel:'info', mensaje:'📦 DSI: AV 4% flat, sin percepción.' });
      if (fleteManual > 0) {
        trazabilidad.flete = { estado: 'real', fuente: 'manual', monto: fleteManual };
      }
      if (seguroManual > 0) {
        trazabilidad.seguro = { estado: 'real', fuente: 'manual', monto: seguroManual };
      } else {
        trazabilidad.seguro = {
          estado: 'estimado',
          fuente: seguroMode === 'TABLA' ? 'seguro_tabla' : 'default_1_5',
          monto: dsi.seguro,
        };
      }
      resultado.metadata = {
        proveedor,
        pais,
        canal,
        incoterm,
        moneda,
        tc,
        tcFuente: tipoCambio.fuente,
        tcEstado: tipoCambio.estado,
        tipoSujeto: tipoSujeto || 'empresa',
        tipoImportador: tipoImportador || 'general',
        objetivoCalculo: objetivo,
        margenPct: shouldProjectMargin ? (margenVenta || 30) : null,
        seguroModo: seguroMode || (seguroManual > 0 ? 'REAL' : 'ESTIMADO'),
      };
      resultado.tipoCambio = tipoCambio;
      resultado.trazabilidad = trazabilidad;
      resultado.precision = evaluarPrecisionCotizacion({ items, trazabilidad });
      const alertaTipoCambioDSI = construirAlertaTipoCambio(tipoCambio);
      if (alertaTipoCambioDSI) {
        resultado.alertas.push(alertaTipoCambioDSI);
      }
      resultado.alertas.unshift({
        tipo: 'precision',
        nivel: resultado.precision.requiereRevision ? 'alto' : (resultado.precision.esReferencial ? 'medio' : 'info'),
        mensaje: resultado.precision.resumen,
      });
      resultado.recomendaciones = generarRecomendacionesResultado({
        pais,
        canal,
        incoterm,
        resultado,
      });
      await resolverValidacionOficial(resultado, items, pais, log);
      resultado.perfilImportacion = buildImportProfile({
        canal,
        tipoSujeto,
        tipoImportador,
        objetivoCalculo: objetivo,
        proveedor,
        incoterm,
        trazabilidad,
        permisos: resultado.permisos,
        resultado,
        seguroModo: resultado.metadata.seguroModo,
      });
      if (hasAdvancedBenchmarkInput(input)) {
        resultado.benchmark = calculateAdvancedImportBenchmark(input);
      }
      resultado.log = log; resultado.tiempoMs = Date.now()-t0;
      return resultado;
    }

    // ═══ FASE 6: FLETE ═══
    let fleteTotal = fleteManual;
    const seguroTotal = seguroManual;
    if (fleteTotal === 0 && pais) {
      log.push('[Logístico] Estimando flete...');
      const peso = items.reduce((s,i) => s + ((i.pesoKg||1)*(i.qty||1)), 0);
      const est = agenteLogistico.estimarFlete(pais, canal, peso, fobTotal);
      if (est) {
        fleteTotal = est.flete||0;
        resultado.etapas.flete = { estimado:true, monto:fleteTotal, transit:est.tiempoTransito };
        trazabilidad.flete = { estado: 'estimado', fuente: 'tarifa_referencial', monto: fleteTotal };
      }
      log.push(`[Logístico] ✓ Flete: $${fleteTotal.toFixed(2)}`);
    }
    if (fleteTotal > 0 && trazabilidad.flete.estado === 'pendiente') {
      trazabilidad.flete = { estado: 'real', fuente: 'manual', monto: fleteTotal };
    }
    if (seguroTotal > 0 && trazabilidad.seguro.estado === 'pendiente') {
      trazabilidad.seguro = { estado: 'real', fuente: 'manual', monto: seguroTotal };
    } else if (seguroTotal === 0 && trazabilidad.seguro.estado === 'pendiente') {
      trazabilidad.seguro = {
        estado: 'estimado',
        fuente: seguroMode === 'TABLA' ? 'seguro_tabla' : 'default_1_5',
        monto: null,
      };
    }

    // ═══ FASE 7: CÁLCULO TRIBUTARIO ═══
    log.push('[Calculista] Calculando tributos...');
    items = items.map(item => {
      const itemFOB = (item.qty||1) * (item.unit||0);
      const prop = fobTotal > 0 ? itemFOB/fobTotal : 1/items.length;
      const fl = fleteTotal * prop;
      const sg = seguroTotal > 0 ? seguroTotal * prop : itemFOB * SEGURO_DEFAULT;
      item.tributos = agenteCalculista.calcularItem(item, fl, sg, canal, tipoImportador);
      return item;
    });

    // Totales
    const totales = { fob:0, flete:fleteTotal, seguro:0, cif:0, adValorem:0, isc:0, igv:0, ipm:0, percepcion:0, antidumping:0, totalTributos:0, totalLanded:0 };
    items.forEach(it => {
      if (!it.tributos) return;
      for (const k of ['fob','seguro','cif','adValorem','isc','igv','ipm','percepcion','antidumping','totalTributos','totalLanded']) totales[k] += it.tributos[k]||0;
    });

    // Operativos
    totales.costosOperativos = agenteCalculista.calcularOperativos(canal, totales.cif);
    totales.totalReal = totales.totalLanded + (totales.costosOperativos.totalOperativo||0);

    // TC + Sensibilidad
    if (tc > 0) {
      totales.totalPEN = totales.totalReal * tc;
      totales.sensibilidadTC = agenteCalculista.sensibilidadTC(totales.totalReal, tc);
    }

    // Margen
    const totalQty = items.reduce((s,i) => s + (i.qty||1), 0);
    if (totalQty > 0 && shouldProjectMargin) {
      totales.margenVenta = agenteCalculista.calcularMargen(totales.totalReal/totalQty, 0, margenVenta);
      items.forEach(item => {
        if (item.tributos?.cpu) item.margenVenta = agenteCalculista.calcularMargen(item.tributos.cpu, (totales.costosOperativos.totalOperativo||0)/totalQty, margenVenta);
      });
    }
    log.push(`[Calculista] ✓ Total: $${totales.totalReal.toFixed(2)}`);

    // ═══ FASE 8: VALORACIÓN (paralelo, no bloquea) ═══
    log.push('[Valoración] Verificando duda razonable...');
    try {
      const dudas = await agenteValoracion.verificar(items, pais);
      const riesgosos = dudas.filter(d => d?.riesgo === 'alto' || d?.riesgo === 'critico');
      if (riesgosos.length > 0) {
        resultado.alertas.push({ tipo:'duda_razonable', nivel:'alto', mensaje:`🔶 ${riesgosos.length} item(s) con riesgo SUNAT`, items:riesgosos.map(d=>({hs:d.hs,riesgo:d.riesgo,msg:d.mensaje})) });
      }
      resultado.etapas.valoracion = { verificados:dudas.length, riesgosos:riesgosos.length };
      log.push(`[Valoración] ✓ ${dudas.length} verificados, ${riesgosos.length} riesgosos`);
    } catch(e) { resultado.etapas.valoracion = { error:e.message }; }

    // ═══ FASE 9: COMPLIANCE (si hay proveedor) ═══
    if (proveedor && proveedor.length > 3) {
      log.push('[Compliance] Verificando proveedor en listas OFAC/ONU...');
      try {
        const sanc = await agenteCompliance.verificarProveedor(proveedor, pais);
        if (sanc?.enListaNegra) {
          resultado.alertas.push({ tipo:'sancion', nivel:'critico', mensaje:`🔴 ${proveedor}: coincidencia en listas de sanciones. NO PROCEDER.` });
        }
        resultado.etapas.compliance = sanc ? { verificado:true, enListaNegra:sanc.enListaNegra } : { verificado:false };
        log.push(`[Compliance] ✓ ${sanc?.enListaNegra ? '⚠ EN LISTA NEGRA' : 'Limpio'}`);
      } catch(e) { resultado.etapas.compliance = { error:e.message }; }
    }

    // ═══ FASE 10: ALERTAS LEGALES ═══
    const alertasLegales = agenteLegal.generarAlertas(items, pais);
    resultado.alertas.push(...alertasLegales);

    // ═══ RESULTADO ═══
    resultado.exito = true;
    resultado.modo = 'completo';
    resultado.items = items;
    resultado.totales = totales;
    resultado.metadata = {
      proveedor,
      pais,
      canal,
      incoterm,
      moneda,
      tc,
      tcFuente: tipoCambio.fuente,
      tcEstado: tipoCambio.estado,
      tipoSujeto: tipoSujeto || 'empresa',
      tipoImportador: tipoImportador || 'general',
      objetivoCalculo: objetivo,
      margenPct: shouldProjectMargin ? (margenVenta || 30) : null,
      seguroModo: seguroMode || (seguroManual > 0 ? 'REAL' : 'ESTIMADO'),
    };
    resultado.tipoCambio = tipoCambio;
    trazabilidad.seguro.monto = totales.seguro || trazabilidad.seguro.monto;
    trazabilidad.flete.monto = totales.flete || trazabilidad.flete.monto;
    resultado.trazabilidad = trazabilidad;
    resultado.precision = evaluarPrecisionCotizacion({ items, trazabilidad });
    const alertaTipoCambio = construirAlertaTipoCambio(tipoCambio);
    if (alertaTipoCambio) {
      resultado.alertas.push(alertaTipoCambio);
    }
    resultado.alertas.unshift({
      tipo: 'precision',
      nivel: resultado.precision.requiereRevision ? 'alto' : (resultado.precision.esReferencial ? 'medio' : 'info'),
      mensaje: resultado.precision.resumen,
    });
    resultado.recomendaciones = generarRecomendacionesResultado({
      pais,
      canal,
      incoterm,
      resultado,
    });
    await resolverValidacionOficial(resultado, items, pais, log);
    resultado.perfilImportacion = buildImportProfile({
      canal,
      tipoSujeto,
      tipoImportador,
      objetivoCalculo: objetivo,
      proveedor,
      incoterm,
      trazabilidad,
      permisos: resultado.permisos,
      resultado,
      seguroModo: resultado.metadata.seguroModo,
    });
    if (hasAdvancedBenchmarkInput(input)) {
      resultado.benchmark = calculateAdvancedImportBenchmark(input);
    }
    resultado.log = log;

  } catch(e) {
    resultado.error = e.message;
    resultado.log = log;
  }

  resultado.tiempoMs = Date.now() - t0;
  return resultado;
}

const BASE_AGENT_REGISTRY = [
  { id: 'orquestador-central', nombre: 'Orquestador Central', categoria: 'base' },
  { id: 'clasificador-hs', nombre: agenteClasificador.nombre, categoria: 'base' },
  { id: 'clasificador-hs-a', nombre: 'Clasificador HS A', categoria: 'base' },
  { id: 'clasificador-hs-b', nombre: 'Clasificador HS B', categoria: 'base' },
  { id: 'clasificador-hs-arbitro', nombre: 'Arbitro Arancelario', categoria: 'base' },
  { id: 'regulatorio', nombre: agenteRegulatorio.nombre, categoria: 'base' },
  { id: 'calculista', nombre: agenteCalculista.nombre, categoria: 'base' },
  { id: 'conversor-moneda', nombre: 'Conversor de Moneda', categoria: 'base' },
  { id: 'ajustador-incoterm', nombre: 'Ajustador Incoterm', categoria: 'base' },
  { id: 'motor-dsi', nombre: 'Motor DSI', categoria: 'base' },
  { id: 'valoracion', nombre: agenteValoracion.nombre, categoria: 'base' },
  { id: 'logistico', nombre: agenteLogistico.nombre, categoria: 'base' },
  { id: 'compliance', nombre: agenteCompliance.nombre, categoria: 'base' },
  { id: 'validador-proveedor', nombre: 'Validador de Proveedores', categoria: 'base' },
  { id: 'legal', nombre: agenteLegal.nombre, categoria: 'base' },
  { id: 'analizador-margen', nombre: 'Analizador de Margen', categoria: 'base' },
  { id: 'extractor', nombre: agenteExtractor.nombre, categoria: 'base' },
];

module.exports = {
  orquestar,
  // Sub-agents exposed for direct use
  agenteClasificador,
  agenteRegulatorio,
  agenteCalculista,
  agenteValoracion,
  agenteLogistico,
  agenteCompliance,
  agenteLegal,
  agenteExtractor,
  BASE_AGENT_REGISTRY,
  // Data
  ANTIDUMPING,
  INCOTERMS,
};
