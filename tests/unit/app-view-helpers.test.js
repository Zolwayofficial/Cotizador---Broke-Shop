const fs = require('fs')
const path = require('path')
const helpers = require('../../client/src/app-view-helpers.cjs')

describe('utilidades de vista de app', () => {
  it('conserva aclaracion y siguiente pregunta cuando ambas llegan en la respuesta del asistente', () => {
    expect(
      helpers.buildAssistantMessageText({
        mensaje: 'La diferencia es que courier usa operador expreso.',
        pregunta: 'Que canal usaras para importar desde ES?'
      })
    ).toBe(
      'La diferencia es que courier usa operador expreso.\n\nQue canal usaras para importar desde ES?'
    )
  })

  it('no duplica el texto si mensaje y pregunta son iguales', () => {
    expect(
      helpers.buildAssistantMessageText({
        mensaje: 'Calculamos el costo total?',
        pregunta: 'Calculamos el costo total?'
      })
    ).toBe('Calculamos el costo total?')
  })

  it('traduce estados de salud demo y sin muestra a una lectura neutral', () => {
    expect(helpers.buildHealthStatusView({ status: 'demo_local' })).toEqual({
      statusClass: 'neutral',
      label: 'Demo local'
    })

    expect(helpers.buildHealthStatusView({ status: 'sin_muestra' })).toEqual({
      statusClass: 'neutral',
      label: 'Sin muestra'
    })
  })

it('presenta saludable como ausencia de alertas, no como estado momentaneo', () => {
    expect(helpers.buildHealthStatusView({ status: 'saludable' })).toEqual({
      statusClass: 'saludable',
      label: 'Sin alertas'
    })
  })

  it('App usa la utilidad de salud y ya no capitaliza el status crudo', () => {
    const appSource = fs.readFileSync(
      path.resolve(__dirname, '../../client/src/App.jsx'),
      'utf8'
    )

    expect(appSource).toContain('const healthStatusView = buildHealthStatusView(salud)')
    expect(appSource).toContain('status-pill ${healthStatusView.statusClass}')
    expect(appSource).toContain('{healthStatusView.label}')
    expect(appSource).not.toContain('function healthLabel(status)')
  })

it('App rotula el bloque oficial como consulta y ya no como lectura incompleta', () => {
    const appSource = fs.readFileSync(
      path.resolve(__dirname, '../../client/src/App.jsx'),
      'utf8'
    )

    expect(appSource).toContain('<h3>Consulta oficial en vivo</h3>')
    expect(appSource).toContain('const officialConsultation = resultado?.perfilImportacion?.validacionOficial || null')
    expect(appSource).toContain('const officialConsultationView = buildOfficialConsultationView(officialConsultation)')
    expect(appSource).toContain('const officialConsultationSummary = officialConsultationView.summary')
    expect(appSource).toContain('{officialConsultationView.truncated ? (')
    expect(appSource).toContain('{officialConsultationView.subpartidas.map((subpartida) => (')
    expect(appSource).not.toContain('<h3>Validacion oficial en vivo</h3>')
    expect(appSource).not.toContain('buildOfficialConsultationSummary,')
    expect(appSource).not.toContain('const officialConsultationView = buildOfficialConsultationView(resultado?.perfilImportacion?.validacionOficial)')
    expect(appSource).not.toContain('{officialConsultation?.truncado ? (')
    expect(appSource).not.toContain('{(officialConsultation?.subpartidas || []).map((subpartida) => (')
  })

it('App usa texto visible de espacio y ya no arrastra ese anglicismo en la interfaz', () => {
    const appSource = fs.readFileSync(
      path.resolve(__dirname, '../../client/src/App.jsx'),
      'utf8'
    )

    expect(appSource).toContain('Tu espacio privado reune cotizacion guiada, historial real y un panel claro para seguir la actividad de tu comunidad sin perder el foco operativo.')
    expect(appSource).toContain('Tu espacio privado reune chat, calculo, permisos y trazabilidad en una sola experiencia para que avances mas rapido y con menos duda.')
    expect(appSource).toContain('<h2>Entra a tu espacio de comunidad</h2>')
    expect(appSource).toContain('Preparando tu espacio privado...')
    expect(appSource).not.toContain('Tu workspace reune')
    expect(appSource).not.toContain('<h2>Entra a tu workspace de comunidad</h2>')
    expect(appSource).not.toContain('Preparando tu workspace privado...')
  })

  it('App muestra el CTA de calcular con el tipo interno homologado del conversador', () => {
    const appSource = fs.readFileSync(
      path.resolve(__dirname, '../../client/src/App.jsx'),
      'utf8'
    )

  expect(appSource).toContain("payload.tipo === 'datos_suficientes_para_calculo'")
  expect(appSource).toContain('resultado?.procesado ? (')
  expect(appSource).not.toContain('resultado?.exito ? (')
    expect(appSource).not.toContain("payload.tipo === 'listo_para_calcular'")
  })

  it('limpia dashboard y analisis cuando falla la recarga del dashboard', () => {
    const patch = helpers.buildDashboardRefreshPatch({
      dashboardResult: { status: 'rejected', reason: new Error('sin dashboard') },
      analysisResult: { status: 'fulfilled', value: { data: { analisis: { insights: ['stale'] } } } }
    })

    expect(patch.dashboard).toBeNull()
    expect(patch.dashboardAnalysis).toBeNull()
    expect(patch.dashboardError).toMatch(/sin dashboard/i)
    expect(patch.error).toBeInstanceOf(Error)
  })

  it('solo aplica respuestas de dashboard si pertenecen a la solicitud activa', () => {
    expect(helpers.isStaleDashboardResponse(1, 2)).toBe(true)
    expect(helpers.isStaleDashboardResponse(3, 3)).toBe(false)
  })

  it('resetea sesion y formularios sensibles al cerrar o limpiar la sesion', () => {
    const nextState = helpers.buildLoggedOutSessionState({
      emptyAdminForm: {
        email: '',
        password: '',
        name: '',
        company: '',
        ruc: '',
        role: 'user'
      }
    })

    expect(nextState.view).toBe('cotizador')
    expect(nextState.loading).toBe(false)
    expect(nextState.sending).toBe(false)
    expect(nextState.calculating).toBe(false)
    expect(nextState.uploadingDocument).toBe(false)
    expect(nextState.currentUser).toBeNull()
    expect(nextState.membership).toBeNull()
    expect(nextState.messages).toEqual([])
    expect(nextState.dashboard).toBeNull()
    expect(nextState.dashboardAnalysis).toBeNull()
    expect(nextState.dashboardError).toBeNull()
    expect(nextState.documentDraft).toBeNull()
    expect(nextState.adminLoading).toBe(false)
    expect(nextState.adminListLoading).toBe(false)
    expect(nextState.adminReview).toBeNull()
    expect(nextState.contexto).toEqual({ datos_previos: {}, paso_actual: null })
    expect(nextState.input).toBe('')
    expect(nextState.loginForm).toEqual({ email: '', password: '' })
    expect(nextState.adminForm).toEqual({
      email: '',
      password: '',
      name: '',
      company: '',
      ruc: '',
      role: 'user'
    })
    expect(nextState).not.toHaveProperty('adminConfirm')
  })

  it('App homologa el modal admin a naming interno de review', () => {
    const appSource = fs.readFileSync(
      path.resolve(__dirname, '../../client/src/App.jsx'),
      'utf8'
    )

    expect(appSource).toContain('const ADMIN_REVIEW_COPY = {')
    expect(appSource).toContain('const [adminReview, setAdminReview] = useState(null)')
    expect(appSource).toContain('const openAdminReview = (config) => {')
    expect(appSource).toContain('const closeAdminReview = () => {')
    expect(appSource).toContain("ADMIN_REVIEW_COPY[adminReview.type]?.actionLabel || 'Revisar'")
    expect(appSource).toContain('className="admin-review-overlay"')
    expect(appSource).toContain('className={`admin-review-dialog ${ADMIN_REVIEW_COPY[adminReview.type]?.tone || \'info\'}`}')
    expect(appSource).toContain('aria-labelledby="admin-review-title"')
    expect(appSource).toContain('<h2 id="admin-review-title">')
    expect(appSource).toContain('className="admin-review-target"')
    expect(appSource).toContain('className="admin-review-field"')
    expect(appSource).toContain('className="admin-review-actions"')
    expect(appSource).not.toContain('const ADMIN_CONFIRM_COPY = {')
    expect(appSource).not.toContain('const [adminConfirm, setAdminConfirm] = useState(null)')
    expect(appSource).not.toContain('const openAdminConfirm = (config) => {')
    expect(appSource).not.toContain('const closeAdminConfirm = () => {')
    expect(appSource).not.toContain('className="admin-confirm-overlay"')
    expect(appSource).not.toContain('aria-labelledby="admin-confirm-title"')
    expect(appSource).not.toContain('<h2 id="admin-confirm-title">')
  })

  it('index.css homologa el modal admin a clases review', () => {
    const cssSource = fs.readFileSync(
      path.resolve(__dirname, '../../client/src/index.css'),
      'utf8'
    )

    expect(cssSource).toContain('.admin-review-overlay {')
    expect(cssSource).toContain('.admin-review-dialog {')
    expect(cssSource).toContain('.admin-review-target {')
    expect(cssSource).toContain('.admin-review-field {')
    expect(cssSource).toContain('.admin-review-actions {')
    expect(cssSource).not.toContain('.admin-confirm-overlay {')
    expect(cssSource).not.toContain('.admin-confirm-dialog {')
    expect(cssSource).not.toContain('.admin-confirm-target {')
    expect(cssSource).not.toContain('.admin-confirm-field {')
    expect(cssSource).not.toContain('.admin-confirm-actions {')
  })

  it('normaliza el email del login sin alterar la contrasena', () => {
    const payload = helpers.normalizeLoginPayload({
      email: '  Miembro@BrokeShop.com ',
      password: '  Clave Temporal  '
    })

    expect(payload).toEqual({
      email: 'miembro@brokeshop.com',
      password: '  Clave Temporal  '
    })
  })
})
