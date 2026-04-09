const fs = require('fs')
const path = require('path')
const {
  buildOfficialConsultationView,
  buildOfficialConsultationSummary,
  buildResultAmountSummary,
  buildResultOperationSummary,
  buildPrecisionView,
  buildRegimenView
} = require('../../client/src/result-view-helpers.cjs')

describe('utilidades de vista de resultados', () => {
  const helperPath = path.join(__dirname, '..', '..', 'client', 'src', 'result-view-helpers.cjs')
  const labels = {
    objectiveLabels: {
      costo_importacion: 'Solo costo de importacion',
      precio_sugerido: 'Costo + precio de venta sugerido'
    },
    insuranceModeLabels: {
      TABLA: 'Seguro de tabla'
    },
    subjectLabels: {
      empresa: 'Empresa'
    },
    importerLabels: {
      general: 'Importador general'
    }
  }

  it('no inventa defaults operativos cuando falta metadata real', () => {
    const summary = buildResultOperationSummary({ metadata: {}, perfilImportacion: {} }, labels)

    expect(summary).toEqual({
      objetivoCalculo: 'Pendiente',
      seguro: 'Pendiente',
      perfil: 'Pendiente'
    })
  })

  it('usa etiquetas reales cuando llegan desde metadata o perfil', () => {
    const summary = buildResultOperationSummary({
      metadata: {
        objetivoCalculo: 'precio_sugerido',
        seguroModo: 'TABLA',
        tipoSujeto: 'empresa',
        tipoImportador: 'general'
      },
      perfilImportacion: {
        seguro: {
          etiqueta: 'Seguro oficial vivo'
        }
      }
    }, labels)

    expect(summary).toEqual({
      objetivoCalculo: 'Costo + precio de venta sugerido',
      seguro: 'Seguro oficial vivo',
      perfil: 'Empresa / Importador general'
    })
  })

  it('no inventa montos en cero cuando faltan totales reales pero conserva ceros informados', () => {
    const formatter = (value, currency = 'USD') => `${currency} ${value}`

    expect(buildResultAmountSummary({ totales: {} }, formatter)).toEqual({
      totalLanded: 'Pendiente',
      fob: 'Pendiente',
      flete: 'Pendiente',
      seguro: 'Pendiente',
      tributos: 'Pendiente',
      totalPEN: null
    })

    expect(buildResultAmountSummary({
      totales: { totalReal: 0, fob: 0, flete: 0, seguro: 0, totalTributos: 0, totalPEN: 0 }
    }, formatter)).toEqual({
      totalLanded: 'USD 0',
      fob: 'USD 0',
      flete: 'USD 0',
      seguro: 'USD 0',
      tributos: 'USD 0',
      totalPEN: 'PEN 0'
    })
  })

  it('preserva conteos oficiales en cero usando nullish en vez de fallback con ||', () => {
    const summary = buildOfficialConsultationSummary({
      resumen: {
        consultadas: 0,
        conveniosDetectados: 0,
        restriccionesDetectadas: 0
      },
      subpartidas: [{ partida: '1' }, { partida: '2' }]
    })

    expect(summary).toEqual({
      consultadas: 0,
      conveniosDetectados: 0,
      restriccionesDetectadas: 0
    })
  })

  it('mantiene visible la consulta oficial aunque no haya subpartidas pero si haya error o trazabilidad', () => {
    const view = buildOfficialConsultationView({
      fuente: '',
      actualizado: '',
      subpartidas: [],
      resumen: {
        consultadas: 0,
        conveniosDetectados: 0,
        restriccionesDetectadas: 0
      },
      error: 'ADUANET no respondio a tiempo'
    })

    expect(view).toEqual({
      shouldRender: true,
      hasSubpartidas: false,
      source: 'ADUANET',
      updatedAt: null,
      emptyMessage: 'ADUANET no respondio a tiempo',
      summary: {
        consultadas: 0,
        conveniosDetectados: 0,
        restriccionesDetectadas: 0
      },
      truncated: false,
      totalDetectadas: null,
      subpartidas: []
    })
  })

it('expone truncado y subpartidas desde la utilidad de vista para no leer el payload crudo en App', () => {
    const view = buildOfficialConsultationView({
      fuente: 'ADUANET',
      actualizado: '2026-04-02T10:00:00Z',
      truncado: true,
      totalDetectadas: 7,
      subpartidas: [{ partida: '850440', descripcion: 'Cargadores' }],
      resumen: {
        consultadas: 1,
        conveniosDetectados: 0,
        restriccionesDetectadas: 0
      }
    })

    expect(view.truncated).toBe(true)
    expect(view.totalDetectadas).toBe(7)
    expect(view.subpartidas).toEqual([{ partida: '850440', descripcion: 'Cargadores' }])
  })

it('ya no presenta el bloque oficial como lectura incompleta cuando falta detalle utilizable', () => {
    const source = fs.readFileSync(helperPath, 'utf8')

    expect(source).toContain('La consulta oficial no devolvio subpartidas utilizables para esta cotizacion.')
    expect(source).toContain('La consulta oficial se ejecuto, pero no dejo detalle por subpartida para mostrar en esta vista.')
    expect(source).toContain('function buildOfficialConsultationSummary(consulta) {')
    expect(source).toContain('function buildOfficialConsultationView(consulta) {')
    expect(source).not.toContain('La validacion oficial no devolvio subpartidas utilizables para esta cotizacion.')
    expect(source).not.toContain('La validacion oficial se ejecuto, pero no dejo detalle por subpartida para mostrar en esta vista.')
    expect(source).not.toContain('function buildOfficialValidationSummary(validacion) {')
    expect(source).not.toContain('function buildOfficialValidationView(validacion) {')
    expect(source).not.toContain('function buildOfficialConsultationSummary(validacion) {')
    expect(source).not.toContain('function buildOfficialConsultationView(validacion) {')
  })

  it('no muestra undefined en precision cuando faltan puntaje o resumen', () => {
    const view = buildPrecisionView({
      nivel: 'consistente',
      puntaje: null,
      resumen: '   ',
      motivos: [{ mensaje: 'FOB con respaldo' }, { mensaje: '   ' }],
      componentes: {
        tc: { clave: 'tc', etiqueta: 'Tipo de cambio', estado: 'con_respaldo', detalle: 'Consultado' },
        vacio: { clave: '', etiqueta: '', estado: '', detalle: '' }
      }
    }, {
      precisionLabels: {
        consistente: 'Consistente'
      }
    })

    expect(view).toEqual({
      shouldRender: true,
      levelLabel: 'Consistente',
      scoreDisplay: 'N/D',
      summary: 'Sin resumen de precision disponible.',
      motivos: [{ mensaje: 'FOB con respaldo' }],
      componentes: [{ clave: 'tc', etiqueta: 'Tipo de cambio', estado: 'con_respaldo', detalle: 'Consultado' }]
    })
  })

it('ya no arrastra aliases antiguos exacta/exacto ni detalle residual de lectura incompleta', () => {
    const content = fs.readFileSync(helperPath, 'utf8')

    expect(content).not.toContain("if (normalized === 'exacta') return 'consistente'")
    expect(content).not.toContain("if (normalized === 'exacto') return 'confirmado'")
    expect(content).not.toContain("return normalized === 'confirmado' ? 'con_respaldo' : normalized")
    expect(content).not.toContain('Validado')
  })

  it('no deja tarjeta vacia de regimen cuando el backend manda un perfil parcial', () => {
    expect(buildRegimenView({})).toEqual({
      shouldRender: true,
      title: 'Importacion',
      detail: 'Sin detalle operativo disponible para este escenario.',
      umbral: null
    })

    expect(buildRegimenView({
      regimen: {
        titulo: '  ',
        detalle: '',
        umbral: ' FOB <= USD 2000 '
      }
    })).toEqual({
      shouldRender: true,
      title: 'Importacion',
      detail: 'Sin detalle operativo disponible para este escenario.',
      umbral: 'FOB <= USD 2000'
    })
  })
})
