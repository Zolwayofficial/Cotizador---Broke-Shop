// server/regimenes.js — Regímenes aduaneros del Perú
//
// No todo es "Importación Definitiva". Un importador profesional usa:
//   - Admisión Temporal (maquinaria, ferias, muestras)
//   - Drawback (recupera tributos si re-exporta producto manufacturado)
//   - Reimportación (trae de vuelta lo que exportó)
//   - Exportación Temporal (envía afuera temporalmente)
//
// Base legal: D.L. 1053 (Ley General de Aduanas) + D.S. 010-2009-EF (Reglamento)

// ══════════════════════════════════════════
// CATÁLOGO DE REGÍMENES
// ══════════════════════════════════════════
const REGIMENES = {
  '10': {
    codigo: '10', nombre: 'Importación para el Consumo',
    descripcion: 'Régimen que permite el ingreso de mercancías al territorio aduanero para su consumo, previo pago de los derechos arancelarios y demás impuestos.',
    tributos: ['AV', 'ISC', 'IGV', 'IPM', 'Percepción', 'Antidumping'],
    garantia: false,
    plazo: null,
    requisitos: ['DAM', 'Factura comercial', 'B/L o AWB', 'Packing list', 'Póliza de seguro'],
    baseLegal: 'Art. 49° D.L. 1053',
    uso: 'Compra definitiva de mercancías del exterior',
  },
  '20': {
    codigo: '20', nombre: 'Admisión Temporal para Reexportación en el Mismo Estado',
    siglas: 'ARER',
    descripcion: 'Permite el ingreso de mercancías con suspensión de tributos, con la obligación de reexportarlas en un plazo determinado sin haber sufrido modificación alguna.',
    tributos: [], // Suspendidos — solo se constituye garantía
    garantia: true,
    garantiaPct: 100, // 100% de los tributos que se pagarían
    plazoMeses: 18, // Máximo 18 meses, prorrogable a 18 más
    requisitos: ['DAM', 'Factura o contrato', 'Garantía bancaria o póliza de caución', 'Carta compromiso de reexportación'],
    baseLegal: 'Art. 53° D.L. 1053',
    uso: 'Maquinaria para obras, equipos para ferias/eventos, moldes, muestras comerciales, contenedores',
    ventajas: [
      'No paga tributos (solo garantía)',
      'Plazo de 18 meses (prorrogable)',
      'Ideal para proyectos temporales',
    ],
    riesgos: [
      'Si no reexporta a tiempo → paga tributos + intereses + multa',
      'La garantía se ejecuta si incumple',
      'No puede modificar, transformar ni reparar la mercancía',
    ],
  },
  '21': {
    codigo: '21', nombre: 'Admisión Temporal para Perfeccionamiento Activo',
    siglas: 'ATPA',
    descripcion: 'Permite el ingreso de insumos, materias primas y productos intermedios con suspensión de tributos, para ser transformados y luego exportados como producto terminado.',
    tributos: [], // Suspendidos
    garantia: true,
    garantiaPct: 100,
    plazoMeses: 24, // 24 meses
    requisitos: ['DAM', 'Cuadro Insumo-Producto (CIP)', 'Factura comercial', 'Garantía', 'Resolución de SUNAT autorizando'],
    baseLegal: 'Art. 68° D.L. 1053',
    uso: 'Importar tela para confeccionar polos y exportarlos, importar chips para ensamblar tablets y exportarlas',
    ventajas: [
      'No paga tributos sobre los insumos importados',
      'Permite transformación, elaboración, ensamblaje, montaje',
      '24 meses de plazo',
    ],
    riesgos: [
      'Debe exportar el producto terminado dentro del plazo',
      'Necesita Cuadro Insumo-Producto aprobado por SUNAT',
      'Si vende localmente → regulariza como importación definitiva + tributos + intereses',
    ],
  },
  '32': {
    codigo: '32', nombre: 'Reimportación en el Mismo Estado',
    descripcion: 'Permite el ingreso de mercancías exportadas definitivamente, sin el pago de derechos arancelarios ni impuestos, siempre que no hayan sido sometidas a transformación.',
    tributos: [], // Exonerado
    garantia: false,
    plazoMeses: 12, // Dentro de 12 meses desde la exportación
    requisitos: ['DAM de reimportación', 'DAM de exportación original', 'Documentos que acrediten identidad de la mercancía'],
    baseLegal: 'Art. 52° D.L. 1053',
    uso: 'Mercancía rechazada por el comprador, devoluciones, mercancía no vendida en ferias',
    ventajas: [
      'No paga tributos (regresa lo mismo que salió)',
      'Recupera el drawback si lo cobró (debe devolverlo)',
    ],
    riesgos: [
      'Plazo máximo 12 meses desde la exportación',
      'La mercancía debe ser la misma (verificación de Aduanas)',
      'Si cobró drawback, debe devolverlo',
    ],
  },
  '41': {
    codigo: '41', nombre: 'Exportación Temporal para Reimportación en el Mismo Estado',
    descripcion: 'Permite la salida temporal de mercancías nacionales o nacionalizadas con la obligación de reimportarlas en un plazo determinado, sin haber sufrido modificación.',
    tributos: [], // No aplica (es salida)
    garantia: false,
    plazoMeses: 12,
    requisitos: ['DAM de exportación temporal', 'Factura o documento que acredite valor'],
    baseLegal: 'Art. 64° D.L. 1053',
    uso: 'Enviar maquinaria para exhibición en feria, herramientas para trabajo en el exterior, muestras',
    ventajas: [
      'Al reimportar no paga tributos',
      'Plazo de 12 meses',
    ],
    riesgos: [
      'Si no reimporta a tiempo → se considera exportación definitiva',
    ],
  },
  '42': {
    codigo: '42', nombre: 'Exportación Temporal para Perfeccionamiento Pasivo',
    descripcion: 'Permite la salida de mercancías para ser reparadas, transformadas o procesadas en el exterior y luego reimportarlas.',
    tributos: ['AV_diferencial'], // Solo paga sobre el valor agregado en el exterior
    garantia: false,
    plazoMeses: 12,
    requisitos: ['DAM', 'Factura del servicio en el exterior', 'Documento que acredite la transformación/reparación'],
    baseLegal: 'Art. 67° D.L. 1053',
    uso: 'Enviar motor a reparar al exterior, enviar tela a teñir, enviar joya a engarzar',
    ventajas: [
      'Solo paga tributos sobre el valor agregado (reparación/mejora), no sobre el valor total',
      'Si la reparación fue por garantía → no paga nada',
    ],
    riesgos: [
      'Debe demostrar que la mercancía es la misma',
      'Plazo de 12 meses',
    ],
  },
};

// ══════════════════════════════════════════
// DRAWBACK (Restitución de derechos arancelarios)
// D.S. 104-95-EF modificado por D.S. 077-2024-EF
// ══════════════════════════════════════════
const DRAWBACK = {
  tasa: 0.03, // 3% del valor FOB de exportación (vigente 2024-2026)
  tasaAnterior: 0.04, // Era 4% hasta 2024
  topeProducto: 0.50, // Insumos importados no pueden superar 50% del valor FOB exportado
  montoMaximo: 20000000, // Tope $20M por año por empresa (resolución SUNAT)
  requisitos: [
    'Ser productor-exportador (fabricar el producto que exporta)',
    'Insumos importados pagaron aranceles (no TLC ni admisión temporal)',
    'Insumos no superan 50% del valor FOB exportado',
    'Exportación dentro de los 36 meses de la importación del insumo',
    'Solicitud dentro de los 180 días hábiles desde el embarque',
  ],
  noAplica: [
    'Si los insumos ingresaron con preferencia arancelaria (TLC con 0% AV)',
    'Si los insumos ingresaron por admisión temporal',
    'Si el producto exportado tiene prohibición de drawback (oro, hidrocarburos)',
    'Si la empresa tiene deuda tributaria pendiente con SUNAT',
  ],
  baseLegal: 'D.S. 104-95-EF, D.S. 077-2024-EF, Procedimiento DESPA-PG.07',
};

function calcularDrawback(fobExportacion, insumosImportados) {
  if (!fobExportacion || fobExportacion <= 0) return null;

  const insumosPct = insumosImportados / fobExportacion;
  const cumpleTope = insumosPct <= DRAWBACK.topeProducto;

  const montoDrawback = fobExportacion * DRAWBACK.tasa;

  return {
    fobExportacion,
    insumosImportados,
    insumosPctFOB: parseFloat((insumosPct * 100).toFixed(2)),
    cumpleTopeInsumos: cumpleTope,
    tasaDrawback: DRAWBACK.tasa * 100,
    montoRestitucion: cumpleTope ? parseFloat(montoDrawback.toFixed(2)) : 0,
    montoRestitucionPEN: null, // Se calcula con TC al momento
    mensaje: cumpleTope
      ? `✅ Drawback aplicable: ${DRAWBACK.tasa * 100}% × $${fobExportacion.toLocaleString()} = $${montoDrawback.toFixed(2)} de restitución`
      : `❌ Insumos importados (${(insumosPct * 100).toFixed(1)}%) superan el tope de 50% del FOB exportado`,
    requisitos: DRAWBACK.requisitos,
    noAplica: DRAWBACK.noAplica,
    baseLegal: DRAWBACK.baseLegal,
    advertencias: [
      cumpleTope ? null : 'Insumos importados superan el 50% del FOB exportado',
      'Verificar que insumos NO ingresaron con preferencia arancelaria (TLC con 0% AV)',
      'Solicitud debe presentarse dentro de 180 días hábiles del embarque de exportación',
    ].filter(Boolean),
  };
}

// ══════════════════════════════════════════
// CALCULADORAS POR RÉGIMEN
// ══════════════════════════════════════════

// Admisión Temporal: calcula la GARANTÍA que debe constituir
function calcularAdmisionTemporal(cif, adValorem, isc, igv, ipm, plazoMeses) {
  const tributosQueSeDeberian = adValorem + isc + igv + ipm;
  const garantia = tributosQueSeDeberian * 1.0; // 100% de los tributos
  const plazoDias = (plazoMeses || 18) * 30;

  return {
    regimen: 'Admisión Temporal para Reexportación en el Mismo Estado',
    codigo: '20',
    tributosASuspender: parseFloat(tributosQueSeDeberian.toFixed(2)),
    garantiaRequerida: parseFloat(garantia.toFixed(2)),
    tipoGarantia: 'Carta fianza bancaria, póliza de caución, o depósito en efectivo',
    plazoMaximo: `${plazoMeses || 18} meses (${plazoDias} días)`,
    prorrogable: 'Sí, hasta 18 meses adicionales previa solicitud',
    costoEstimadoGarantia: parseFloat((garantia * 0.025).toFixed(2)), // ~2.5% anual de comisión bancaria
    nota: 'Al reexportar la mercancía, se devuelve la garantía. Si no reexporta, se ejecuta la garantía y se cobran tributos + intereses.',
    comparacion: {
      siImportaDefinitivo: parseFloat(tributosQueSeDeberian.toFixed(2)),
      siAdmisionTemporal: parseFloat((garantia * 0.025 * (plazoMeses || 18) / 12).toFixed(2)),
      ahorro: parseFloat((tributosQueSeDeberian - garantia * 0.025 * (plazoMeses || 18) / 12).toFixed(2)),
    },
  };
}

// Perfeccionamiento Pasivo: solo tributos sobre valor agregado
function calcularPerfeccionamientoPasivo(valorOriginal, costoReparacion, adValoremPct) {
  const valorAgregado = costoReparacion;
  const adValorem = valorAgregado * (adValoremPct || 0) / 100;
  const baseIGV = valorAgregado + adValorem;
  const igv = baseIGV * 0.16;
  const ipm = baseIGV * 0.02;
  const totalTributos = adValorem + igv + ipm;

  return {
    regimen: 'Exportación Temporal para Perfeccionamiento Pasivo',
    codigo: '42',
    valorOriginal,
    costoReparacion,
    valorAgregado,
    tributos: {
      adValorem: parseFloat(adValorem.toFixed(2)),
      igv: parseFloat(igv.toFixed(2)),
      ipm: parseFloat(ipm.toFixed(2)),
      total: parseFloat(totalTributos.toFixed(2)),
    },
    comparacion: {
      siImportaraNuevo: 'Se pagaría tributos sobre el valor total del bien',
      conPerfeccionamiento: `Solo paga sobre $${costoReparacion} (el valor agregado en el exterior)`,
      ahorroEstimado: `~$${((valorOriginal * (adValoremPct || 6) / 100) + (valorOriginal * 0.18)).toFixed(2)} vs $${totalTributos.toFixed(2)}`,
    },
    nota: costoReparacion === 0
      ? '✅ Si la reparación fue por GARANTÍA del fabricante → no paga tributos'
      : 'Tributos solo sobre el valor de la reparación/mejora, no sobre el valor total del bien',
  };
}

// Seleccionar régimen recomendado según el caso de uso
function recomendarRegimen(params) {
  const { esTemporalMeses, vaATransformar, esDevolucion, esReparacion, fobExport, insumosImport } = params;

  const recomendaciones = [];

  if (esTemporalMeses && esTemporalMeses > 0 && !vaATransformar) {
    recomendaciones.push({
      regimen: REGIMENES['20'],
      razon: `Ingreso temporal por ${esTemporalMeses} meses sin transformación → Admisión Temporal. No paga tributos, solo garantía.`,
      ahorro: '100% de tributos (solo costo de la garantía ~2.5%/año)',
    });
  }

  if (vaATransformar && fobExport > 0) {
    recomendaciones.push({
      regimen: REGIMENES['21'],
      razon: 'Importar insumos para transformar y exportar → Admisión Temporal para Perfeccionamiento Activo. Suspensión total de tributos.',
      ahorro: '100% de tributos sobre insumos',
    });

    if (insumosImport && insumosImport / fobExport <= 0.5) {
      recomendaciones.push({
        regimen: { nombre: 'Drawback', codigo: 'DB' },
        razon: `Alternativa: Importar normal + cobrar Drawback (3% de $${fobExport} = $${(fobExport * 0.03).toFixed(2)})`,
        ahorro: `$${(fobExport * 0.03).toFixed(2)} de restitución`,
      });
    }
  }

  if (esDevolucion) {
    recomendaciones.push({
      regimen: REGIMENES['32'],
      razon: 'Mercancía que vuelve al Perú sin modificación → Reimportación en el Mismo Estado. No paga tributos.',
      ahorro: '100% de tributos',
    });
  }

  if (esReparacion) {
    recomendaciones.push({
      regimen: REGIMENES['42'],
      razon: 'Enviar a reparar/mejorar al exterior → Exportación Temporal para Perfeccionamiento Pasivo. Solo paga tributos sobre el valor de la reparación.',
      ahorro: 'Solo tributos sobre el valor agregado, no sobre el bien completo',
    });
  }

  if (recomendaciones.length === 0) {
    recomendaciones.push({
      regimen: REGIMENES['10'],
      razon: 'Compra definitiva de mercancías → Importación para el Consumo (régimen estándar).',
      ahorro: 'N/A — paga todos los tributos',
    });
  }

  return recomendaciones;
}

module.exports = {
  REGIMENES,
  DRAWBACK,
  calcularDrawback,
  calcularAdmisionTemporal,
  calcularPerfeccionamientoPasivo,
  recomendarRegimen,
};
