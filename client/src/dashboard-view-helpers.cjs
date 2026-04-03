function hasMetricValue(metric) {
  return Boolean(metric) && metric.valor !== undefined && metric.valor !== null
}

function hasItems(items) {
  return Array.isArray(items) && items.length > 0
}

function hasTextContent(value) {
  return String(value ?? '').trim() !== ''
}

function hasValue(value) {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return hasTextContent(value)
  return true
}

function buildDashboardAnalysisView(analysis) {
  const insights = Array.isArray(analysis?.insights)
    ? analysis.insights.filter(hasTextContent)
    : []
  const oportunidades = Array.isArray(analysis?.oportunidades)
    ? analysis.oportunidades.filter(hasTextContent)
    : []
  const alerta = hasTextContent(analysis?.alerta) ? String(analysis.alerta).trim() : null
  const recomendacion = hasTextContent(analysis?.recomendacion) ? String(analysis.recomendacion).trim() : null

  return {
    insights,
    oportunidades,
    alerta,
    recomendacion,
    hasContent: insights.length > 0 || oportunidades.length > 0 || Boolean(alerta) || Boolean(recomendacion)
  }
}

function buildDashboardAttentionView(dashboard) {
  const tendencias = Array.isArray(dashboard?.tendencias)
    ? dashboard.tendencias.filter((item) => hasTextContent(item?.titulo) || hasTextContent(item?.descripcion))
    : []
  const alertas = Array.isArray(dashboard?.alertas)
    ? dashboard.alertas.filter((item) => hasTextContent(item?.titulo) || hasTextContent(item?.mensaje))
    : []

  return {
    tendencias,
    alertas,
    hasContent: tendencias.length > 0 || alertas.length > 0
  }
}

function formatMetricDelta(metric, { mode = 'percent', toNumber }) {
  if (!metric) return 'No disponible'
  if (metric.variacion === undefined || metric.variacion === null) return 'Sin variacion'

  const normalize = typeof toNumber === 'function' ? toNumber : Number
  const variation = normalize(metric.variacion)

  if (!Number.isFinite(variation)) return 'No disponible'
  if (variation === 0) return 'Sin variacion'

  const prefix = variation > 0 ? '+' : ''
  if (mode === 'count') {
    return `${prefix}${variation} vs periodo anterior`
  }

  return `${prefix}${variation}% vs periodo anterior`
}

function normalizeLineChartItems(data, { toNumber } = {}) {
  const items = Array.isArray(data) ? data : []
  const normalize = typeof toNumber === 'function' ? toNumber : Number

  return items
    .filter((item) => hasTextContent(item?.mes) && hasValue(item?.cotizaciones))
    .map((item) => ({
      mes: String(item.mes).trim(),
      cotizaciones: normalize(item.cotizaciones),
      dolares: hasValue(item?.dolares) ? normalize(item.dolares) : null
    }))
}

function buildLineChartLatestDisplay(data, { toNumber } = {}) {
  const items = Array.isArray(data) ? data : []
  const normalize = typeof toNumber === 'function' ? toNumber : Number
  const latest = items[items.length - 1]

  return {
    value: hasItems(items) && hasValue(latest?.value) ? normalize(latest.value) : 'N/D',
    caption: hasItems(items) ? 'ultimo mes' : 'Sin serie'
  }
}

function normalizeCategoricalChartItems(data, labelKey, valueKey, { toNumber } = {}) {
  const items = Array.isArray(data) ? data : []
  const normalize = typeof toNumber === 'function' ? toNumber : Number

  return items
    .filter((item) => hasTextContent(item?.[labelKey]) && hasValue(item?.[valueKey]))
    .map((item) => ({
      ...item,
      [labelKey]: String(item[labelKey]).trim(),
      [valueKey]: normalize(item[valueKey])
    }))
}

function buildDonutChartSummary(data, valueKey, { toNumber } = {}) {
  const items = Array.isArray(data) ? data : []
  const normalize = typeof toNumber === 'function' ? toNumber : Number

  if (!hasItems(items)) {
    return {
      total: 'N/D',
      series: 'N/D'
    }
  }

  const total = items.reduce((sum, item) => sum + normalize(item?.[valueKey]), 0)

  return {
    total,
    series: items.length
  }
}

function buildDashboardMetricDisplay({
  metric,
  formatter,
  unavailable = false,
  mode = 'percent',
  unavailableValue = 'N/D',
  toNumber
} = {}) {
  const metricUnavailable = unavailable || !hasMetricValue(metric)

  return {
    value: metricUnavailable
      ? unavailableValue
      : (typeof formatter === 'function' ? formatter(metric.valor) : metric.valor),
    delta: metricUnavailable
      ? 'No disponible'
      : formatMetricDelta(metric, { mode, toNumber })
  }
}

module.exports = {
  buildDashboardAnalysisView,
  buildDashboardAttentionView,
  buildDonutChartSummary,
  buildDashboardMetricDisplay,
  buildLineChartLatestDisplay,
  formatMetricDelta,
  hasItems,
  hasMetricValue,
  normalizeCategoricalChartItems,
  normalizeLineChartItems
}
