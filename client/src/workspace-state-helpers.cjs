const { buildDocumentDraftForm } = require('./app-payload-helpers.cjs')

function emptyConversationContext() {
  return {
    datos_previos: {},
    paso_actual: null
  }
}

function buildInitializationPatch({ healthResult, dashboardResult, startResult, buildStartMessages }) {
  const startOk = startResult?.status === 'fulfilled'
  const startPayload = startOk ? startResult.value?.data : null

  return {
    salud: healthResult?.status === 'fulfilled' ? healthResult.value.data : null,
    dashboard: dashboardResult?.status === 'fulfilled' ? dashboardResult.value.data : null,
    dashboardAnalysis: null,
    dashboardError: dashboardResult?.status === 'fulfilled'
      ? null
      : (dashboardResult?.reason?.message || String(dashboardResult?.reason || 'No pude cargar el dashboard.')),
    messages: startOk && typeof buildStartMessages === 'function' ? buildStartMessages(startPayload) : [],
    contexto: startOk ? (startPayload?.contexto || emptyConversationContext()) : emptyConversationContext(),
    error: startOk ? null : 'No pude iniciar el cotizador conversacional.'
  }
}

function buildDocumentUploadSuccessState(fileName, extraction) {
  return {
    documentDraft: {
      fileName,
      ...extraction
    },
    documentForm: buildDocumentDraftForm(extraction),
    resultado: null
  }
}

function buildDocumentFieldChangeState({ currentForm, field, value }) {
  return {
    documentForm: {
      ...(currentForm || {}),
      [field]: value
    },
    resultado: null
  }
}

module.exports = {
  buildDocumentFieldChangeState,
  buildDocumentUploadSuccessState,
  buildInitializationPatch,
  emptyConversationContext
}
