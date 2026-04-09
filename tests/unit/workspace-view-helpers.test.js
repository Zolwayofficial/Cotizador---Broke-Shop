const helpers = require('../../client/src/workspace-view-helpers.cjs')

describe('utilidades de vista del espacio', () => {
  it('normaliza items del draft documental y descarta entradas no interpretables', () => {
    const items = helpers.normalizeDocumentDraftItems([
      null,
      { desc: '  iPhone 14 Pro  ', qty: '2', unit: '324.50' },
      { descripcion: 'Cable USB', cantidad: 0, precio_unitario: '12,40' },
      'texto-suelto'
    ])

    expect(items).toEqual([
      { index: 1, desc: 'iPhone 14 Pro', qty: 2, unit: 324.5 },
      { index: 2, desc: 'Cable USB', qty: 1, unit: 12.4 }
    ])
  })

  it('construye una vista segura del draft incluso con confianza o items mal formados', () => {
    const view = helpers.buildDocumentDraftView({
      confianza: '82,5',
      paraRevisar: {
        items: [{ producto: 'Router', qty: '1', precio: '44' }, null]
      }
    })

    expect(view.confidence).toBe(82.5)
    expect(view.itemCount).toBe(1)
    expect(view.items).toEqual([
      { index: 1, desc: 'Router', qty: 1, unit: 44 }
    ])
  })

  it('distingue entre datos ausentes y ceros reales en confianza y precio unitario', () => {
    const missingView = helpers.buildDocumentDraftView({
      paraRevisar: {
        items: [{ producto: 'Cable HDMI', qty: '2' }]
      }
    })

    expect(missingView.confidence).toBeNull()
    expect(missingView.items).toEqual([
      { index: 1, desc: 'Cable HDMI', qty: 2, unit: null }
    ])

    const zeroView = helpers.buildDocumentDraftView({
      confianza: 0,
      paraRevisar: {
        items: [{ producto: 'Muestra', qty: '1', precio: 0 }]
      }
    })

    expect(zeroView.confidence).toBe(0)
    expect(zeroView.items).toEqual([
      { index: 1, desc: 'Muestra', qty: 1, unit: 0 }
    ])
  })
})
