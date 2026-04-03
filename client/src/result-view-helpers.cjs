function normalizeText(value) {
  return String(value ?? '').trim()
}

function hasValue(value) {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return normalizeText(value) !== ''
  return true
}

function normalizePrecisionLevel(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeComponentStatus(value) {
  const normalized = normalizeText(value).toLowerCase()
  return normalized
}

function formatOptionalMoney(value, formatter, fallback = 'Pendiente') {
  if (!hasValue(value)) return fallback
  return typeof formatter === 'function' ? formatter(value) : value
}

function buildResultAmountSummary(resultado, formatter) {
  const totales = resultado?.totales || {}

  return {
    totalLanded: formatOptionalMoney(totales.totalReal, formatter),
    fob: formatOptionalMoney(totales.fob, formatter),
    flete: formatOptionalMoney(totales.flete, formatter),
    seguro: formatOptionalMoney(totales.seguro, formatter),
    tributos: formatOptionalMoney(totales.totalTributos, formatter),
    totalPEN: hasValue(totales.totalPEN) ? formatOptionalMoney(totales.totalPEN, (value) => formatter(value, 'PEN')) : null
  }
}

function buildOfficialConsultationSummary(consulta) {
  const subpartidas = Array.isArray(consulta?.subpartidas) ? consulta.subpartidas : []
  const resumen = consulta?.resumen || {}

  return {
    consultadas: resumen.consultadas ?? subpartidas.length,
    conveniosDetectados: resumen.conveniosDetectados ?? 0,
    restriccionesDetectadas: resumen.restriccionesDetectadas ?? 0,
  }
}

function buildOfficialConsultationView(consulta) {
  if (!consulta || typeof consulta !== 'object') {
    return {
      shouldRender: false,
      hasSubpartidas: false,
      source: null,
      updatedAt: null,
      emptyMessage: null,
      summary: buildOfficialConsultationSummary(null),
      truncated: false,
      totalDetectadas: null,
      subpartidas: []
    }
  }

  const subpartidas = Array.isArray(consulta.subpartidas) ? consulta.subpartidas : []
  const summary = buildOfficialConsultationSummary(consulta)
  const source = normalizeText(consulta.fuente) || 'ADUANET'
  const updatedAt = normalizeText(consulta.actualizado) || null
  const truncated = consulta.truncado === true
  const totalDetectadas = hasValue(consulta.totalDetectadas) ? consulta.totalDetectadas : null
  let emptyMessage = null

  if (!subpartidas.length) {
    if (normalizeText(consulta.error)) {
      emptyMessage = consulta.error
    } else if (summary.consultadas === 0) {
      emptyMessage = 'La consulta oficial no devolvio subpartidas utilizables para esta cotizacion.'
    } else {
      emptyMessage = 'La consulta oficial se ejecuto, pero no dejo detalle por subpartida para mostrar en esta vista.'
    }
  }

  return {
    shouldRender: true,
    hasSubpartidas: subpartidas.length > 0,
    source,
    updatedAt,
    emptyMessage,
    summary,
    truncated,
    totalDetectadas,
    subpartidas
  }
}

function buildResultOperationSummary(resultado, labels = {}) {
  const metadata = resultado?.metadata || {}
  const perfil = resultado?.perfilImportacion || {}
  const {
    objectiveLabels = {},
    insuranceModeLabels = {},
    subjectLabels = {},
    importerLabels = {}
  } = labels

  return {
    objetivoCalculo: objectiveLabels[metadata.objetivoCalculo] || 'Pendiente',
    seguro:
      normalizeText(perfil?.seguro?.etiqueta) ||
      insuranceModeLabels[metadata.seguroModo] ||
      'Pendiente',
    perfil:
      hasValue(metadata.tipoSujeto) || hasValue(metadata.tipoImportador)
        ? `${subjectLabels[metadata.tipoSujeto] || 'Pendiente'} / ${importerLabels[metadata.tipoImportador] || 'Pendiente'}`
        : 'Pendiente'
  }
}

function buildPrecisionView(precision, labels = {}) {
  if (!precision || typeof precision !== 'object') {
    return {
      shouldRender: false,
      levelLabel: 'Pendiente',
      scoreDisplay: 'N/D',
      summary: 'Sin resumen de precision disponible.',
      motivos: [],
      componentes: []
    }
  }

  const precisionLabels = labels.precisionLabels || {}
  const level = normalizePrecisionLevel(precision.nivel)
  const rawMotivos = Array.isArray(precision.motivos) ? precision.motivos : []
  const rawComponentes = precision.componentes && typeof precision.componentes === 'object'
    ? Object.values(precision.componentes)
    : []

  return {
    shouldRender: true,
    levelLabel: precisionLabels[level] || level || 'Pendiente',
    scoreDisplay: hasValue(precision.puntaje) ? `${precision.puntaje}%` : 'N/D',
    summary: normalizeText(precision.resumen) || 'Sin resumen de precision disponible.',
    motivos: rawMotivos.filter((motivo) => hasValue(motivo?.mensaje)),
    componentes: rawComponentes
      .filter((component) =>
        hasValue(component?.clave) ||
        hasValue(component?.etiqueta) ||
        hasValue(component?.estado) ||
        hasValue(component?.detalle)
      )
      .map((component) => ({
        ...component,
        estado: normalizeComponentStatus(component?.estado)
      }))
  }
}

function buildRegimenView(perfilImportacion) {
  if (!perfilImportacion || typeof perfilImportacion !== 'object') {
    return {
      shouldRender: false,
      title: 'Importacion',
      detail: 'Sin detalle operativo disponible para este escenario.',
      umbral: null
    }
  }

  const regimen = perfilImportacion.regimen && typeof perfilImportacion.regimen === 'object'
    ? perfilImportacion.regimen
    : {}

  return {
    shouldRender: true,
    title: normalizeText(regimen.titulo) || 'Importacion',
    detail: normalizeText(regimen.detalle) || 'Sin detalle operativo disponible para este escenario.',
    umbral: normalizeText(regimen.umbral) || null
  }
}

module.exports = {
  buildOfficialConsultationView,
  buildOfficialConsultationSummary,
  buildResultAmountSummary,
  buildResultOperationSummary,
  buildPrecisionView,
  buildRegimenView
}
