const LOW_CONFIDENCE_METHODS = new Set([
  'simple',
  'simple_fallback',
  'keyword_fallback',
  'fallback',
]);

const AI_METHODS = new Set([
  'consenso_directo',
  'mejor_confianza',
  'arbitraje',
  'simple',
  'simple_fallback',
  'keyword_fallback',
  'fallback',
]);

function pushReason(target, seen, reason) {
  const key = `${reason.codigo}:${reason.campo || ''}`;
  if (seen.has(key)) return;
  seen.add(key);
  target.push(reason);
}

function toNumber(value) {
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asBoolean(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'si', 'sí', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  }

  return Boolean(value);
}

function normalizeIncotermPrecisionState(value) {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (!normalized) return 'con_respaldo';
  return normalized;
}

function buildActions(reasons) {
  const codes = new Set(reasons.map((reason) => reason.codigo));
  const actions = [];

  if (
    codes.has('hs_no_clasificado')
    || codes.has('clasificacion_baja_confianza')
    || codes.has('clasificacion_ia')
  ) {
    actions.push('Revisa manualmente la partida HS y contrasta el codigo con NANDINA antes de usar la cotizacion como valor final.');
  }

  if (codes.has('flete_estimado') || codes.has('flete_pendiente')) {
    actions.push('Ingresa una tarifa real de flete o conecta un courier/naviera con tarifa negociada.');
  }

  if (codes.has('seguro_estimado') || codes.has('seguro_pendiente')) {
    actions.push('Ingresa el seguro real del proveedor o de la poliza para definir un CIF consistente.');
  }

  if (codes.has('incoterm_estimado') || codes.has('ddp_estimado')) {
    actions.push('Pide al proveedor una cotizacion FOB o el desglose real de flete y seguro del incoterm.');
  }

  if (actions.length === 0) {
    actions.push('La cotizacion no uso heuristicas visibles y puede tratarse como calculo consistente con los datos entregados.');
  }

  return actions;
}

function buildComponents(stats, trazabilidad) {
  let hs;

  if (stats.sinHs > 0) {
    hs = {
      clave: 'hs',
      etiqueta: 'Partida HS',
      estado: 'pendiente',
      referencial: true,
      detalle: 'Hay productos sin partida HS con respaldo manual.',
    };
  } else if (stats.bajaConfianza > 0 || stats.noContrastados > 0) {
    hs = {
      clave: 'hs',
      etiqueta: 'Partida HS',
      estado: 'revisar',
      referencial: true,
      detalle: 'La clasificacion HS requiere revision manual o contraste NANDINA adicional.',
    };
  } else if (stats.manuales === stats.total) {
    hs = {
      clave: 'hs',
      etiqueta: 'Partida HS',
      estado: 'con_respaldo',
      referencial: false,
      detalle: 'La partida HS tiene respaldo manual.',
    };
  } else {
    hs = {
      clave: 'hs',
      etiqueta: 'Partida HS',
      estado: 'ia',
      referencial: false,
      detalle: 'La partida HS fue sugerida por IA y no muestra alertas de baja confianza.',
    };
  }

  const fleteEstado = trazabilidad.flete?.estado || 'pendiente';
  const flete = {
    clave: 'flete',
    etiqueta: 'Flete',
    estado: fleteEstado === 'real' ? 'con_respaldo' : fleteEstado === 'estimado' ? 'referencial' : 'pendiente',
    referencial: fleteEstado !== 'real',
    detalle:
      fleteEstado === 'real'
        ? 'El flete proviene de un dato real ingresado o desglosado sin heuristica.'
        : fleteEstado === 'estimado'
          ? 'El flete se estimo con tarifas referenciales.'
          : 'No se ingreso una tarifa real de flete.',
    fuente: trazabilidad.flete?.fuente || null,
  };

  const seguroEstado = trazabilidad.seguro?.estado || 'pendiente';
  const seguro = {
    clave: 'seguro',
    etiqueta: 'Seguro',
    estado: seguroEstado === 'real' ? 'con_respaldo' : seguroEstado === 'estimado' ? 'referencial' : 'pendiente',
    referencial: seguroEstado !== 'real',
    detalle:
      seguroEstado === 'real'
        ? 'El seguro proviene de un valor real ingresado o desglosado sin heuristica.'
        : seguroEstado === 'estimado'
          ? 'El seguro se completo con una tasa estimada.'
          : 'No se ingreso el costo real del seguro.',
    fuente: trazabilidad.seguro?.fuente || null,
  };

  const incotermEstado = normalizeIncotermPrecisionState(trazabilidad.incoterm?.estado);
  const incoterm = {
    clave: 'incoterm',
    etiqueta: 'Incoterm',
    estado: incotermEstado === 'estimado' ? 'referencial' : 'con_respaldo',
    referencial: incotermEstado === 'estimado',
    detalle:
      incotermEstado === 'estimado'
        ? trazabilidad.incoterm?.mensaje || 'El incoterm requirio un desglose estimado.'
        : `El incoterm ${trazabilidad.incoterm?.codigo || 'FOB'} no requirio estimaciones extra.`,
    fuente: trazabilidad.incoterm?.codigo || null,
  };

  const tributos =
    hs.estado === 'pendiente' || hs.estado === 'revisar'
      ? {
        clave: 'tributos',
        etiqueta: 'Tributos',
        estado: 'revisar',
        referencial: true,
        detalle: 'Los tributos dependen de una partida HS que aun requiere revision.',
      }
      : flete.referencial || seguro.referencial || incoterm.referencial
        ? {
          clave: 'tributos',
          etiqueta: 'Tributos',
          estado: 'referencial',
          referencial: true,
          detalle: 'Las tasas son oficiales, pero la base CIF incluye componentes estimados.',
        }
        : {
          clave: 'tributos',
          etiqueta: 'Tributos',
          estado: 'con_respaldo',
          referencial: false,
          detalle: 'Los tributos se calcularon con tasas oficiales y una base CIF definida.',
        };

  return {
    hs,
    flete,
    seguro,
    incoterm,
    tributos,
  };
}

function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildSummary(level, reasons) {
  if (level === 'consistente') {
    return 'Cotizacion consistente con los datos entregados: no se detectaron estimaciones ni clasificaciones pendientes.';
  }

  if (level === 'alta') {
    return 'Cotizacion de alta precision: la base tributaria es solida, pero aun conviene revisar manualmente algunos supuestos.';
  }

  if (level === 'referencial') {
    return 'Cotizacion referencial: el calculo es util, pero incluye al menos un componente estimado.';
  }

  const firstReason = reasons[0]?.mensaje || 'Hay datos que requieren verificacion manual.';
  return `Cotizacion en revision: ${firstReason}`;
}

function evaluateItems(items, reasons, seen) {
  const stats = {
    total: items.length,
    sinHs: 0,
    manuales: 0,
    ia: 0,
    bajaConfianza: 0,
    noContrastados: 0,
  };

  items.forEach((item) => {
    const method = String(item.metodoClasificacion || item.metodo || 'desconocido').trim().toLowerCase();
    const confidence = toNumber(item.confianza || 0);
    const contrastadoNandina = asBoolean(item.contrastadoNandina);

    if (!item.hs) {
      stats.sinHs += 1;
      pushReason(reasons, seen, {
        codigo: 'hs_no_clasificado',
        severidad: 'alta',
        campo: 'hs',
        mensaje: `El item "${item.desc || 'sin descripcion'}" no tiene partida HS con respaldo manual.`,
      });
      return;
    }

    if (method === 'manual') {
      stats.manuales += 1;
    } else if (AI_METHODS.has(method)) {
      stats.ia += 1;
    }

    if (confidence > 0 && confidence < 70) {
      stats.bajaConfianza += 1;
      pushReason(reasons, seen, {
        codigo: 'clasificacion_baja_confianza',
        severidad: 'alta',
        campo: 'hs',
        mensaje: `La clasificacion de "${item.desc || item.hs}" tiene confianza ${confidence}%.`,
      });
    } else if (LOW_CONFIDENCE_METHODS.has(method)) {
      stats.bajaConfianza += 1;
      pushReason(reasons, seen, {
        codigo: 'clasificacion_baja_confianza',
        severidad: 'alta',
        campo: 'hs',
        mensaje: `La clasificacion de "${item.desc || item.hs}" uso un fallback de baja precision.`,
      });
    } else if (method !== 'manual') {
      pushReason(reasons, seen, {
        codigo: 'clasificacion_ia',
        severidad: 'media',
        campo: 'hs',
        mensaje: 'La partida HS fue sugerida por IA. Para tratarla como partida con respaldo manual, debe revisarse manualmente.',
      });
    }

    if (contrastadoNandina === false) {
      stats.noContrastados += 1;
      pushReason(reasons, seen, {
        codigo: 'hs_no_contrastado',
        severidad: 'alta',
        campo: 'hs',
        mensaje: `La partida "${item.hs}" no pudo contrastarse contra NANDINA.`,
      });
    }

    if (item.advertencia) {
      pushReason(reasons, seen, {
        codigo: 'advertencia_clasificacion',
        severidad: 'media',
        campo: 'hs',
        mensaje: String(item.advertencia),
      });
    }
  });

  return stats;
}

function evaluateTrace(trace, reasons, seen) {
  const flete = trace.flete || {};
  const seguro = trace.seguro || {};
  const incoterm = trace.incoterm || {};

  if (flete.estado === 'estimado') {
    pushReason(reasons, seen, {
      codigo: 'flete_estimado',
      severidad: 'alta',
      campo: 'flete',
      mensaje: 'El flete se calculo con una tarifa estimada o referencial.',
    });
  } else if (flete.estado === 'pendiente') {
    pushReason(reasons, seen, {
      codigo: 'flete_pendiente',
      severidad: 'media',
      campo: 'flete',
      mensaje: 'No se ingreso una tarifa real de flete.',
    });
  }

  if (seguro.estado === 'estimado') {
    pushReason(reasons, seen, {
      codigo: 'seguro_estimado',
      severidad: 'media',
      campo: 'seguro',
      mensaje: 'El seguro se calculo con una tasa estimada y no con el valor real de la poliza.',
    });
  } else if (seguro.estado === 'pendiente') {
    pushReason(reasons, seen, {
      codigo: 'seguro_pendiente',
      severidad: 'media',
      campo: 'seguro',
      mensaje: 'No se ingreso el costo real del seguro.',
    });
  }

  if (incoterm.estado === 'estimado') {
    pushReason(reasons, seen, {
      codigo: incoterm.codigo === 'DDP' ? 'ddp_estimado' : 'incoterm_estimado',
      severidad: incoterm.codigo === 'DDP' ? 'alta' : 'media',
      campo: 'incoterm',
      mensaje: incoterm.mensaje || 'El desglose del incoterm requirio una estimacion.',
    });
  }
}

function computeScore(stats, reasons) {
  let score = 100;

  score -= stats.sinHs * 35;
  score -= stats.bajaConfianza * 20;
  score -= stats.noContrastados * 15;

  reasons.forEach((reason) => {
    if (reason.codigo === 'clasificacion_ia') score -= 8;
    if (reason.codigo === 'advertencia_clasificacion') score -= 5;
    if (reason.codigo === 'flete_estimado') score -= 20;
    if (reason.codigo === 'flete_pendiente') score -= 12;
    if (reason.codigo === 'seguro_estimado') score -= 12;
    if (reason.codigo === 'seguro_pendiente') score -= 8;
    if (reason.codigo === 'incoterm_estimado') score -= 10;
    if (reason.codigo === 'ddp_estimado') score -= 18;
  });

  return clampScore(score);
}

function determineLevel(score, reasons) {
  const codes = new Set(reasons.map((reason) => reason.codigo));

  if (reasons.length === 0) return 'consistente';

  if (
    codes.has('hs_no_clasificado')
    || codes.has('clasificacion_baja_confianza')
    || codes.has('hs_no_contrastado')
    || codes.has('ddp_estimado')
    || score < 45
  ) {
    return 'requiere_revision';
  }

  if (
    codes.has('flete_estimado')
    || codes.has('flete_pendiente')
    || codes.has('seguro_estimado')
    || codes.has('seguro_pendiente')
    || codes.has('incoterm_estimado')
  ) {
    return 'referencial';
  }

  return 'alta';
}

function evaluarPrecisionCotizacion({
  items = [],
  trazabilidad = {},
}) {
  const reasons = [];
  const seen = new Set();
  const stats = evaluateItems(items, reasons, seen);

  evaluateTrace(trazabilidad, reasons, seen);

  const puntaje = computeScore(stats, reasons);
  const nivel = determineLevel(puntaje, reasons);
  const componentes = buildComponents(stats, trazabilidad);

  return {
    nivel,
    puntaje,
    esConsistente: nivel === 'consistente',
    esReferencial: nivel === 'referencial',
    requiereRevision: nivel === 'requiere_revision',
    resumen: buildSummary(nivel, reasons),
    checks: {
      hsManualConRespaldo: stats.total > 0 && stats.manuales === stats.total,
      hsClasificado: stats.total > 0 && stats.sinHs === 0,
      fleteReal: trazabilidad.flete?.estado === 'real',
      seguroReal: trazabilidad.seguro?.estado === 'real',
      incotermConRespaldo: normalizeIncotermPrecisionState(trazabilidad.incoterm?.estado) !== 'estimado',
    },
    componentes,
    motivos: reasons,
    acciones: buildActions(reasons),
  };
}

module.exports = {
  evaluarPrecisionCotizacion,
};
