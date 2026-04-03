const workspaceStateHelpers = require('../../client/src/workspace-state-helpers.cjs')

const {
  buildDocumentFieldChangeState,
  buildDocumentUploadSuccessState,
  buildInitializationPatch,
  emptyConversationContext,
} = workspaceStateHelpers

describe('workspace-state-helpers', () => {
  it('limpia dashboard analysis y la conversacion cuando la inicializacion falla', () => {
    const state = buildInitializationPatch({
      healthResult: { status: 'rejected', reason: new Error('sin salud') },
      dashboardResult: { status: 'rejected', reason: new Error('sin dashboard') },
      startResult: { status: 'rejected', reason: new Error('sin inicio') },
      buildStartMessages: () => [{ id: 'old' }],
    })

    expect(state.salud).toBeNull()
    expect(state.dashboard).toBeNull()
    expect(state.dashboardAnalysis).toBeNull()
    expect(state.dashboardError).toMatch(/sin dashboard/i)
    expect(state.messages).toEqual([])
    expect(state.contexto).toEqual(emptyConversationContext())
    expect(state.error).toMatch(/no pude iniciar/i)
  })

  it('arma un estado limpio cuando la inicializacion es exitosa', () => {
    const startPayload = {
      contexto: {
        datos_previos: { productos: [{ descripcion: 'Laptop' }] },
        paso_actual: 'pais_origen'
      }
    }

    const state = buildInitializationPatch({
      healthResult: { status: 'fulfilled', value: { data: { status: 'ok' } } },
      dashboardResult: { status: 'fulfilled', value: { data: { meta: { scope: 'mine' } } } },
      startResult: { status: 'fulfilled', value: { data: startPayload } },
      buildStartMessages: () => [{ id: 'assistant-1', text: 'Hola' }],
    })

    expect(state.salud).toEqual({ status: 'ok' })
    expect(state.dashboard).toEqual({ meta: { scope: 'mine' } })
    expect(state.dashboardAnalysis).toBeNull()
    expect(state.dashboardError).toBeNull()
    expect(state.messages).toEqual([{ id: 'assistant-1', text: 'Hola' }])
    expect(state.contexto).toEqual(startPayload.contexto)
    expect(state.error).toBeNull()
  })

  it('limpia el resultado anterior cuando entra un documento nuevo', () => {
    const uploadState = buildDocumentUploadSuccessState('cotizacion.pdf', {
      ok: true,
      paraRevisar: {
        proveedor: 'Proveedor X',
        pais: 'CN',
        items: [{ desc: 'iPhone', qty: 2, unit: 324 }]
      }
    })

    expect(uploadState.documentDraft.fileName).toBe('cotizacion.pdf')
    expect(uploadState.documentDraft.paraRevisar.items).toHaveLength(1)
    expect(uploadState.documentForm.proveedor).toBe('Proveedor X')
    expect(uploadState.resultado).toBeNull()
  })

  it('limpia el resultado visible cuando se edita el borrador documental', () => {
    const nextState = buildDocumentFieldChangeState({
      currentForm: { proveedor: 'Proveedor X', pais: 'CN' },
      field: 'pais',
      value: 'US'
    })

    expect(nextState.documentForm).toEqual({ proveedor: 'Proveedor X', pais: 'US' })
    expect(nextState.resultado).toBeNull()
  })
})
