const { buildDocumentDraftForm } = require('./app-payload-helpers.cjs')
const { emptyConversationContext } = require('./workspace-state-helpers.cjs')

function normalizeMessageText(value) {
  return String(value ?? '').trim()
}

function buildAssistantMessageText(payload = {}) {
  const message = normalizeMessageText(payload.mensaje)
  const question = normalizeMessageText(payload.pregunta)

  if (message && question) {
    return message === question ? message : `${message}\n\n${question}`
  }

  return question || message
}

function buildHealthStatusView(health = null) {
  const rawStatus = normalizeMessageText(health?.status).toLowerCase()

  if (!rawStatus) {
    return {
      statusClass: 'neutral',
      label: 'Sin datos'
    }
  }

  if (rawStatus === 'demo_local') {
    return {
      statusClass: 'neutral',
      label: 'Demo local'
    }
  }

  if (rawStatus === 'sin_muestra') {
    return {
      statusClass: 'neutral',
      label: 'Sin muestra'
    }
  }

  if (rawStatus === 'saludable' || rawStatus === 'healthy') {
    return {
      statusClass: 'saludable',
      label: 'Sin alertas'
    }
  }

  if (rawStatus === 'alerta') {
    return {
      statusClass: 'alerta',
      label: 'Alerta'
    }
  }

  if (rawStatus === 'critico') {
    return {
      statusClass: 'critico',
      label: 'Critico'
    }
  }

  return {
    statusClass: 'neutral',
    label: rawStatus
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
  }
}

function buildDashboardRefreshPatch({ dashboardResult, analysisResult }) {
  const dashboardOk = dashboardResult?.status === 'fulfilled'

  if (!dashboardOk) {
    return {
      dashboard: null,
      dashboardAnalysis: null,
      dashboardError: dashboardResult?.reason?.message || String(dashboardResult?.reason || 'No pude actualizar el dashboard.'),
      error: dashboardResult?.reason || new Error('No pude actualizar el dashboard.')
    }
  }

  return {
    dashboard: dashboardResult.value?.data ?? null,
    dashboardAnalysis: analysisResult?.status === 'fulfilled'
      ? (analysisResult.value?.data?.analisis ?? null)
      : null,
    dashboardError: null,
    error: null
  }
}

function isStaleDashboardResponse(requestId, latestRequestId) {
  return requestId !== latestRequestId
}

function buildLoggedOutSessionState({ emptyAdminForm }) {
  return {
    view: 'cotizador',
    loading: false,
    sending: false,
    calculating: false,
    uploadingDocument: false,
    currentUser: null,
    membership: null,
    adminUsers: [],
    adminLoading: false,
    adminListLoading: false,
    adminError: null,
    adminNotice: null,
    adminForm: { ...emptyAdminForm },
    adminReview: null,
    messages: [],
    dashboard: null,
    dashboardAnalysis: null,
    dashboardError: null,
    dashboardScope: 'mine',
    salud: null,
    resultado: null,
    documentDraft: null,
    documentForm: buildDocumentDraftForm(null),
    contexto: emptyConversationContext(),
    input: '',
    error: null,
    authError: null,
    loginForm: { email: '', password: '' }
  }
}

function normalizeLoginPayload(form = {}) {
  return {
    email: String(form.email || '').trim().toLowerCase(),
    password: String(form.password || '')
  }
}

module.exports = {
  buildAssistantMessageText,
  buildHealthStatusView,
  buildDashboardRefreshPatch,
  buildLoggedOutSessionState,
  isStaleDashboardResponse,
  normalizeLoginPayload
}
