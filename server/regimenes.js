// server/regimenes.js - Regimenes aduaneros del Peru

const REGIMENES = {
  '10': {
    codigo: '10',
    nombre: 'Importacion para el Consumo',
    descripcion: 'Regimen que permite el ingreso de mercancias al territorio aduanero para su consumo, previo pago de derechos e impuestos.',
    tributos: ['AV', 'ISC', 'IGV', 'IPM', 'Percepcion', 'Antidumping'],
    garantia: false,
    plazo: null,
    requisitos: ['DAM', 'Factura comercial', 'B/L o AWB', 'Packing list', 'Poliza de seguro'],
    baseLegal: 'Art. 49 D.L. 1053',
    uso: 'Compra definitiva de mercancias del exterior',
  },
  '20': {
    codigo: '20',
    nombre: 'Admision Temporal para Reexportacion en el Mismo Estado',
    siglas: 'ARER',
    descripcion: 'Permite el ingreso de mercancias con suspension de tributos y obliga a reexportarlas sin modificacion.',
    tributos: [],
    garantia: true,
    garantiaPct: 100,
    plazoMeses: 18,
    requisitos: ['DAM', 'Factura o contrato', 'Garantia bancaria o poliza de caucion', 'Carta compromiso de reexportacion'],
    baseLegal: 'Art. 53 D.L. 1053',
    uso: 'Maquinaria temporal, ferias, muestras comerciales, contenedores',
    ventajas: [
      'No paga tributos (solo garantia)',
      'Plazo de 18 meses (prorrogable)',
      'Ideal para proyectos temporales',
    ],
    riesgos: [
      'Si no reexporta a tiempo paga tributos, intereses y multa',
      'La garantia se ejecuta si incumple',
      'No puede modificar ni transformar la mercancia',
    ],
  },
  '21': {
    codigo: '21',
    nombre: 'Admision Temporal para Perfeccionamiento Activo',
    siglas: 'ATPA',
    descripcion: 'Permite importar insumos con suspension de tributos para transformarlos y exportarlos luego.',
    tributos: [],
    garantia: true,
    garantiaPct: 100,
    plazoMeses: 24,
    requisitos: ['DAM', 'Cuadro Insumo-Producto (CIP)', 'Factura comercial', 'Garantia', 'Resolucion SUNAT'],
    baseLegal: 'Art. 68 D.L. 1053',
    uso: 'Importar insumos para fabricar y exportar producto terminado',
    ventajas: [
      'No paga tributos sobre insumos importados',
      'Permite transformacion, elaboracion, ensamblaje y montaje',
      '24 meses de plazo',
    ],
    riesgos: [
      'Debe exportar el producto terminado dentro del plazo',
      'Necesita Cuadro Insumo-Producto aprobado por SUNAT',
      'Si vende localmente debe regularizar como importacion definitiva',
    ],
  },
  '32': {
    codigo: '32',
    nombre: 'Reimportacion en el Mismo Estado',
    descripcion: 'Permite el reingreso sin tributos de mercancias exportadas definitivamente que vuelven sin transformacion.',
    tributos: [],
    garantia: false,
    plazoMeses: 12,
    requisitos: ['DAM de reimportacion', 'DAM de exportacion original', 'Documentos que acrediten identidad de la mercancia'],
    baseLegal: 'Art. 52 D.L. 1053',
    uso: 'Mercancia rechazada, devoluciones, mercancia no vendida en ferias',
    ventajas: [
      'No paga tributos',
      'Si cobro drawback debe devolverlo',
    ],
    riesgos: [
      'Plazo maximo 12 meses desde la exportacion',
      'La mercancia debe ser la misma',
      'Si cobro drawback, debe devolverlo',
    ],
  },
  '41': {
    codigo: '41',
    nombre: 'Exportacion Temporal para Reimportacion en el Mismo Estado',
    descripcion: 'Permite la salida temporal de mercancias para reimportarlas luego sin modificacion.',
    tributos: [],
    garantia: false,
    plazoMeses: 12,
    requisitos: ['DAM de exportacion temporal', 'Factura o documento que acredite valor'],
    baseLegal: 'Art. 64 D.L. 1053',
    uso: 'Ferias, herramientas para trabajo en exterior, muestras',
    ventajas: [
      'Al reimportar no paga tributos',
      'Plazo de 12 meses',
    ],
    riesgos: [
      'Si no reimporta a tiempo se considera exportacion definitiva',
    ],
  },
  '42': {
    codigo: '42',
    nombre: 'Exportacion Temporal para Perfeccionamiento Pasivo',
    descripcion: 'Permite enviar mercancias a reparar o transformar y reimportarlas pagando tributos solo sobre el valor agregado.',
    tributos: ['AV_diferencial'],
    garantia: false,
    plazoMeses: 12,
    requisitos: ['DAM', 'Factura del servicio en el exterior', 'Documento que acredite la reparacion o transformacion'],
    baseLegal: 'Art. 67 D.L. 1053',
    uso: 'Reparacion o mejora en el exterior',
    ventajas: [
      'Solo paga tributos sobre el valor agregado',
      'Si la reparacion fue por garantia no paga nada',
    ],
    riesgos: [
      'Debe demostrar que la mercancia es la misma',
      'Plazo de 12 meses',
    ],
  },
};

const DRAWBACK = {
  tasa: 0.03,
  tasaAnterior: 0.04,
  topeProducto: 0.50,
  montoMaximo: 20000000,
  requisitos: [
    'Ser productor-exportador',
    'Insumos importados pagaron aranceles',
    'Insumos no superan 50% del valor FOB exportado',
    'Exportacion dentro de los 36 meses de la importacion del insumo',
    'Solicitud dentro de los 180 dias habiles desde el embarque',
  ],
  noAplica: [
    'Si los insumos ingresaron con preferencia arancelaria',
    'Si los insumos ingresaron por admision temporal',
    'Si el producto exportado tiene prohibicion de drawback',
    'Si la empresa tiene deuda tributaria pendiente con SUNAT',
  ],
  baseLegal: 'D.S. 104-95-EF, D.S. 077-2024-EF, Procedimiento DESPA-PG.07',
};

function parseNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;

  let normalized = String(value).replace(/\s+/g, '');
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

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePositiveNumber(value, fallback = 0) {
  return Math.max(0, parseNumber(value, fallback));
}

function parsePositiveInteger(value, fallback) {
  const parsed = Math.floor(parseNumber(value, fallback));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'si', 'sí', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no', ''].includes(normalized)) return false;
  return Boolean(value);
}

function calcularDrawback(fobExportacion, insumosImportados) {
  const fob = parsePositiveNumber(fobExportacion, 0);
  if (fob <= 0) return null;

  const insumos = parsePositiveNumber(insumosImportados, 0);
  const insumosPct = insumos / fob;
  const cumpleTope = insumosPct <= DRAWBACK.topeProducto;
  const montoDrawback = fob * DRAWBACK.tasa;

  return {
    fobExportacion: fob,
    insumosImportados: insumos,
    insumosPctFOB: parseFloat((insumosPct * 100).toFixed(2)),
    cumpleTopeInsumos: cumpleTope,
    tasaDrawback: DRAWBACK.tasa * 100,
    montoRestitucion: cumpleTope ? parseFloat(montoDrawback.toFixed(2)) : 0,
    montoRestitucionPEN: null,
    mensaje: cumpleTope
      ? `Drawback aplicable: ${DRAWBACK.tasa * 100}% x $${fob.toLocaleString()} = $${montoDrawback.toFixed(2)} de restitucion`
      : `Insumos importados (${(insumosPct * 100).toFixed(1)}%) superan el tope de 50% del FOB exportado`,
    requisitos: DRAWBACK.requisitos,
    noAplica: DRAWBACK.noAplica,
    baseLegal: DRAWBACK.baseLegal,
    advertencias: [
      cumpleTope ? null : 'Insumos importados superan el 50% del FOB exportado',
      'Verificar que insumos no ingresaron con preferencia arancelaria',
      'Solicitud dentro de 180 dias habiles del embarque',
    ].filter(Boolean),
  };
}

function calcularAdmisionTemporal(cif, adValorem, isc, igv, ipm, plazoMeses) {
  const tributosQueSeDeberian =
    parsePositiveNumber(adValorem) +
    parsePositiveNumber(isc) +
    parsePositiveNumber(igv) +
    parsePositiveNumber(ipm);
  const garantia = tributosQueSeDeberian;
  const meses = parsePositiveInteger(plazoMeses, 18);
  const plazoDias = meses * 30;
  const costoGarantia = garantia * 0.025 * meses / 12;

  return {
    regimen: 'Admision Temporal para Reexportacion en el Mismo Estado',
    codigo: '20',
    tributosASuspender: parseFloat(tributosQueSeDeberian.toFixed(2)),
    garantiaRequerida: parseFloat(garantia.toFixed(2)),
    tipoGarantia: 'Carta fianza bancaria, poliza de caucion, o deposito en efectivo',
    plazoMaximo: `${meses} meses (${plazoDias} dias)`,
    prorrogable: 'Si, hasta 18 meses adicionales previa solicitud',
    costoEstimadoGarantia: parseFloat(costoGarantia.toFixed(2)),
    nota: 'Al reexportar la mercancia se devuelve la garantia. Si no reexporta, se ejecuta la garantia y se cobran tributos e intereses.',
    comparacion: {
      siImportaDefinitivo: parseFloat(tributosQueSeDeberian.toFixed(2)),
      siAdmisionTemporal: parseFloat(costoGarantia.toFixed(2)),
      ahorro: parseFloat((tributosQueSeDeberian - costoGarantia).toFixed(2)),
    },
  };
}

function calcularPerfeccionamientoPasivo(valorOriginal, costoReparacion, adValoremPct) {
  const valorBase = parsePositiveNumber(valorOriginal, 0);
  const valorAgregado = parsePositiveNumber(costoReparacion, 0);
  const adValoremRate = parsePositiveNumber(adValoremPct, 0);
  const adValorem = valorAgregado * adValoremRate / 100;
  const baseIGV = valorAgregado + adValorem;
  const igv = baseIGV * 0.16;
  const ipm = baseIGV * 0.02;
  const totalTributos = adValorem + igv + ipm;

  return {
    regimen: 'Exportacion Temporal para Perfeccionamiento Pasivo',
    codigo: '42',
    valorOriginal: valorBase,
    costoReparacion: valorAgregado,
    valorAgregado,
    tributos: {
      adValorem: parseFloat(adValorem.toFixed(2)),
      igv: parseFloat(igv.toFixed(2)),
      ipm: parseFloat(ipm.toFixed(2)),
      total: parseFloat(totalTributos.toFixed(2)),
    },
    comparacion: {
      siImportaraNuevo: 'Se pagaria tributos sobre el valor total del bien',
      conPerfeccionamiento: `Solo paga sobre $${valorAgregado} (valor agregado en el exterior)`,
      ahorroEstimado: `~$${((valorBase * (adValoremRate || 6) / 100) + (valorBase * 0.18)).toFixed(2)} vs $${totalTributos.toFixed(2)}`,
    },
    nota: valorAgregado === 0
      ? 'Si la reparacion fue por garantia del fabricante no paga tributos'
      : 'Tributos solo sobre el valor de la reparacion o mejora',
  };
}

function recomendarRegimen(params = {}) {
  const meses = parsePositiveInteger(params.esTemporalMeses, 0);
  const vaATransformar = parseBoolean(params.vaATransformar);
  const esDevolucion = parseBoolean(params.esDevolucion);
  const esReparacion = parseBoolean(params.esReparacion);
  const fob = parsePositiveNumber(params.fobExport, 0);
  const insumos = parsePositiveNumber(params.insumosImport, 0);

  const recomendaciones = [];

  if (meses > 0 && !vaATransformar) {
    recomendaciones.push({
      regimen: REGIMENES['20'],
      razon: `Ingreso temporal por ${meses} meses sin transformacion -> Admision Temporal. No paga tributos, solo garantia.`,
      ahorro: 'Tributos suspendidos mientras cumple el regimen; solo costo de garantia ~2.5% anual',
    });
  }

  if (vaATransformar && fob > 0) {
    recomendaciones.push({
      regimen: REGIMENES['21'],
      razon: 'Importar insumos para transformar y exportar -> Admision Temporal para Perfeccionamiento Activo.',
      ahorro: 'Tributos suspendidos sobre insumos mientras cumple el regimen',
    });

    if (insumos > 0 && insumos / fob <= 0.5) {
      recomendaciones.push({
        regimen: { nombre: 'Drawback', codigo: 'DB' },
        razon: `Alternativa: Importar normal + cobrar Drawback (3% de $${fob} = $${(fob * 0.03).toFixed(2)})`,
        ahorro: `$${(fob * 0.03).toFixed(2)} de restitucion`,
      });
    }
  }

  if (esDevolucion) {
    recomendaciones.push({
      regimen: REGIMENES['32'],
      razon: 'Mercancia que vuelve al Peru sin modificacion -> Reimportacion en el Mismo Estado.',
      ahorro: 'Reingreso sin tributos si mantiene las condiciones del regimen',
    });
  }

  if (esReparacion) {
    recomendaciones.push({
      regimen: REGIMENES['42'],
      razon: 'Enviar a reparar o mejorar al exterior -> Exportacion Temporal para Perfeccionamiento Pasivo.',
      ahorro: 'Solo tributos sobre el valor agregado, no sobre el bien completo',
    });
  }

  if (recomendaciones.length === 0) {
    recomendaciones.push({
      regimen: REGIMENES['10'],
      razon: 'Compra definitiva de mercancias -> Importacion para el Consumo.',
      ahorro: 'N/A - paga todos los tributos',
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
  _private: {
    parseNumber,
    parsePositiveNumber,
    parsePositiveInteger,
    parseBoolean,
  },
};
