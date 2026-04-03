const helpers = require('../../client/src/dashboard-view-helpers.cjs')
const { toNumber } = require('../../client/src/app-payload-helpers.cjs')

describe('dashboard view helpers', () => {
  it('normaliza la lectura IA y evita paneles vacios cuando el analisis no trae contenido util', () => {
    expect(
      helpers.buildDashboardAnalysisView({
        insights: ['  ', 'Insight real'],
        oportunidades: [null, 'Oportunidad real'],
        alerta: '   ',
        recomendacion: ''
      })
    ).toEqual({
      insights: ['Insight real'],
      oportunidades: ['Oportunidad real'],
      alerta: null,
      recomendacion: null,
      hasContent: true
    })

    expect(helpers.buildDashboardAnalysisView(null)).toEqual({
      insights: [],
      oportunidades: [],
      alerta: null,
      recomendacion: null,
      hasContent: false
    })
  })

  it('normaliza alertas y tendencias para no dejar la columna de atencion en blanco', () => {
    expect(
      helpers.buildDashboardAttentionView({
        tendencias: [{ titulo: '  ', descripcion: '  ' }, { titulo: 'Pais lider', descripcion: '' }],
        alertas: [{ titulo: '', mensaje: '' }, { titulo: 'Totales faltantes', mensaje: 'Revisa 2 registros' }]
      })
    ).toEqual({
      tendencias: [{ titulo: 'Pais lider', descripcion: '' }],
      alertas: [{ titulo: 'Totales faltantes', mensaje: 'Revisa 2 registros' }],
      hasContent: true
    })
  })

  it('no inventa ultimos valores cuando la serie del grafico viene vacia', () => {
    expect(helpers.buildLineChartLatestDisplay([], { toNumber })).toEqual({
      value: 'N/D',
      caption: 'Sin serie'
    })
  })

  it('filtra puntos incompletos para que una serie rota no parezca un cero real', () => {
    expect(
      helpers.normalizeLineChartItems([
        { mes: 'Ene', cotizaciones: 4, dolares: null },
        { mes: '  ', cotizaciones: 3, dolares: 20 },
        { mes: 'Feb', cotizaciones: null, dolares: 30 }
      ], { toNumber })
    ).toEqual([
      { mes: 'Ene', cotizaciones: 4, dolares: null }
    ])

    expect(
      helpers.buildLineChartLatestDisplay([{ label: 'Ene', value: null }], { toNumber })
    ).toEqual({
      value: 'N/D',
      caption: 'ultimo mes'
    })
  })

  it('distingue grafico sin series de un grafico con totales reales en cero', () => {
    expect(helpers.buildDonutChartSummary([], 'valor', { toNumber })).toEqual({
      total: 'N/D',
      series: 'N/D'
    })

    expect(helpers.buildDonutChartSummary([{ valor: 0 }], 'valor', { toNumber })).toEqual({
      total: 0,
      series: 1
    })
  })

  it('filtra categorias sin etiqueta o valor para no renderizar leyendas vacias como 0', () => {
    expect(
      helpers.normalizeCategoricalChartItems([
        { pais: ' Peru ', valor: 0 },
        { pais: '', valor: 5 },
        { pais: 'Chile', valor: null }
      ], 'pais', 'valor', { toNumber })
    ).toEqual([
      { pais: 'Peru', valor: 0 }
    ])
  })

  it('marca la metrica como no disponible cuando el dashboard falla', () => {
    const metric = helpers.buildDashboardMetricDisplay({
      metric: { valor: 12, variacion: 4 },
      unavailable: true,
      toNumber
    })

    expect(metric).toEqual({
      value: 'N/D',
      delta: 'No disponible'
    })
  })

  it('no inventa ceros cuando falta valor real en la metrica', () => {
    const metric = helpers.buildDashboardMetricDisplay({
      metric: { valor: null, variacion: null },
      formatter: (value) => `USD ${value}`,
      toNumber
    })

    expect(metric).toEqual({
      value: 'N/D',
      delta: 'No disponible'
    })
  })

  it('formatea variaciones de conteo con signo conservando el valor real', () => {
    const metric = helpers.buildDashboardMetricDisplay({
      metric: { valor: 3, variacion: '2' },
      mode: 'count',
      toNumber
    })

    expect(metric).toEqual({
      value: 3,
      delta: '+2 vs periodo anterior'
    })
  })
})
