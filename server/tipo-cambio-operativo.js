const sunatProxy = require('./sunat-proxy');

function toPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function buildSunatReference(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const compra = toPositiveNumber(raw.compra);
  const venta = toPositiveNumber(raw.venta);

  if (!compra && !venta) return null;

  const fuente = String(raw.fuente || raw.source || 'SUNAT');
  const estado = raw.status || raw.estado || inferReferenceState(fuente);

  return {
    compra: compra || null,
    venta: venta || compra || null,
    fuente,
    fecha: raw.fecha || raw.actualizado || new Date().toISOString(),
    estado,
    estrategia: raw.strategy || null,
    oficial: ['oficial_en_vivo', 'cache_oficial'].includes(estado),
  };
}

function inferReferenceState(source) {
  const normalized = String(source || '').toLowerCase();
  if (!normalized) return 'referencia_externa';
  if (normalized.includes('fallback')) return 'fallback';
  if (normalized.includes('cache_oficial')) return 'cache_oficial';
  if (normalized.includes('cache_externa')) return 'cache_externa';
  if (normalized.includes('mirror')) return 'referencia_externa';
  if (normalized.includes('externa') || normalized.includes('external')) return 'referencia_externa';
  if (normalized.includes('oficial') || normalized === 'sunat' || normalized === 'sbs') return 'oficial_en_vivo';
  return 'referencia_externa';
}

function buildDifferential(tasaAplicada, referenciaVenta) {
  const aplicada = toPositiveNumber(tasaAplicada);
  const referencia = toPositiveNumber(referenciaVenta);

  if (!aplicada || !referencia) return null;

  const absoluto = aplicada - referencia;
  const porcentaje = (absoluto / referencia) * 100;

  return {
    absoluto: Number(absoluto.toFixed(4)),
    porcentaje: Number(porcentaje.toFixed(2)),
  };
}

function construirAlertaTipoCambio(tipoCambio) {
  if (!tipoCambio?.tasa) return null;

  if (tipoCambio.estado === 'manual_usuario') {
    const refVenta = tipoCambio.referenciaSunat?.venta;
    const diff = tipoCambio.diferencialVsSunat;

    if (refVenta && diff) {
      return {
        tipo: 'tipo_cambio',
        nivel: Math.abs(diff.porcentaje) >= 3 ? 'medio' : 'info',
        mensaje:
          `Tipo de cambio manual aplicado: ${tipoCambio.tasa.toFixed(4)} PEN/USD. ` +
          `SUNAT venta de referencia: ${refVenta.toFixed(4)} ` +
          `(${diff.porcentaje >= 0 ? '+' : ''}${diff.porcentaje}%).`,
      };
    }

    return {
      tipo: 'tipo_cambio',
      nivel: 'info',
      mensaje: `Tipo de cambio manual aplicado: ${tipoCambio.tasa.toFixed(4)} PEN/USD.`,
    };
  }

  if (tipoCambio.estado === 'oficial_en_vivo') {
    return {
      tipo: 'tipo_cambio',
      nivel: 'info',
      mensaje: `Tipo de cambio operativo consultado en vivo: SBS/SUNAT ${tipoCambio.tasa.toFixed(4)} PEN/USD.`,
    };
  }

  if (tipoCambio.estado === 'cache_oficial') {
    return {
      tipo: 'tipo_cambio',
      nivel: 'info',
      mensaje: `Tipo de cambio operativo tomado de cache oficial reciente: ${tipoCambio.tasa.toFixed(4)} PEN/USD.`,
    };
  }

  if (tipoCambio.estado === 'referencia_externa' || tipoCambio.estado === 'cache_externa') {
    return {
      tipo: 'tipo_cambio',
      nivel: 'medio',
      mensaje: 'No se pudo consultar la fuente oficial SBS/SUNAT en vivo para esta corrida. ' +
        `Se uso una referencia automatica externa: ${tipoCambio.tasa.toFixed(4)} PEN/USD.`,
    };
  }

  if (tipoCambio.estado === 'fallback') {
    return {
      tipo: 'tipo_cambio',
      nivel: 'medio',
      mensaje: 'No se pudo consultar SUNAT en vivo para esta corrida. ' +
        `Se uso un tipo de cambio de respaldo: ${tipoCambio.tasa.toFixed(4)} PEN/USD.`,
    };
  }

  return null;
}

function buildReferenceMessage(referenciaSunat) {
  if (!referenciaSunat?.venta) {
    return 'No se pudo resolver una referencia automatica para el tipo de cambio.';
  }

  if (referenciaSunat.estado === 'oficial_en_vivo') {
    return `Se consulto SBS/SUNAT en vivo ${referenciaSunat.venta.toFixed(4)} como TC operativo.`;
  }

  if (referenciaSunat.estado === 'cache_oficial') {
    return `Se uso un cache oficial reciente ${referenciaSunat.venta.toFixed(4)} como TC operativo.`;
  }

  if (referenciaSunat.estado === 'referencia_externa' || referenciaSunat.estado === 'cache_externa') {
    return `Se uso una referencia automatica externa ${referenciaSunat.venta.toFixed(4)} por indisponibilidad de la fuente oficial.`;
  }

  return `Se uso TC de respaldo ${referenciaSunat.venta.toFixed(4)} por indisponibilidad de SUNAT/SBS en vivo.`;
}

async function resolverTipoCambioOperativo(tcInput) {
  const manual = toPositiveNumber(tcInput);
  let referenciaSunat = null;

  try {
    referenciaSunat = buildSunatReference(await sunatProxy.getTipoCambio());
  } catch (_error) {
    referenciaSunat = null;
  }

  if (manual) {
    return {
      tasa: manual,
      estado: 'manual_usuario',
      fuente: 'manual_usuario',
      fecha: new Date().toISOString(),
      referenciaSunat,
      diferencialVsSunat: buildDifferential(manual, referenciaSunat?.venta),
      mensaje: referenciaSunat?.venta
        ? `Se uso el TC manual ${manual.toFixed(4)} con referencia SUNAT venta ${referenciaSunat.venta.toFixed(4)}.`
        : `Se uso el TC manual ${manual.toFixed(4)}.`,
    };
  }

  if (referenciaSunat?.venta) {
    return {
      tasa: referenciaSunat.venta,
      estado: referenciaSunat.estado,
      fuente: referenciaSunat.fuente,
      fecha: referenciaSunat.fecha,
      referenciaSunat,
      diferencialVsSunat: buildDifferential(referenciaSunat.venta, referenciaSunat.venta),
      mensaje: buildReferenceMessage(referenciaSunat),
    };
  }

  return {
    tasa: 0,
    estado: 'sin_tipo_cambio',
    fuente: 'sin_tipo_cambio',
    fecha: new Date().toISOString(),
    referenciaSunat: null,
    diferencialVsSunat: null,
    mensaje: 'No se pudo resolver un tipo de cambio operativo.',
  };
}

module.exports = {
  resolverTipoCambioOperativo,
  construirAlertaTipoCambio,
};
