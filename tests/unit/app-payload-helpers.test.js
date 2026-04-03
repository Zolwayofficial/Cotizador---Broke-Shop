const { describe, it, expect } = require('@jest/globals')

const helpers = require('../../client/src/app-payload-helpers.cjs')

describe('app payload helpers', () => {
  it('convierte comas decimales a numeros utilizables', () => {
    expect(helpers.toNumber('3,58')).toBeCloseTo(3.58, 5)
    expect(helpers.toNumber(' 1 234,50 ')).toBeCloseTo(1234.5, 5)
    expect(helpers.toNumber('1.234,50')).toBeCloseTo(1234.5, 5)
    expect(helpers.toNumber('1,234.50')).toBeCloseTo(1234.5, 5)
    expect(helpers.toNumber('1,200')).toBe(1200)
    expect(helpers.toNumber('1.200')).toBe(1200)
    expect(helpers.toNumber('')).toBe(0)
  })

  it('respeta precios por item y margenes en el payload conversacional', () => {
    const payload = helpers.buildCalculationPayload({
      datos_previos: {
        productos: [
          { descripcion: 'Mouse', cantidad: '2', unit: '12,50' },
          { descripcion: 'Teclado', cantidad: 1, precio_unitario: '25,75' }
        ],
        precio_unitario: '99,99',
        tipo_cambio: '3,77',
        flete: '18,5',
        seguro: '0,45',
        seguro_modo: 'REAL',
        objetivo_calculo: 'precio_sugerido',
        margen_venta: '22,5',
        bien_usado: 'false'
      }
    })

    expect(payload.items).toEqual([
      expect.objectContaining({ desc: 'Mouse', qty: 2, unit: 12.5, bienUsado: false }),
      expect.objectContaining({ desc: 'Teclado', qty: 1, unit: 25.75, bienUsado: false })
    ])
    expect(payload.tc).toBeCloseTo(3.77, 5)
    expect(payload.flete).toBeCloseTo(18.5, 5)
    expect(payload.seguro).toBeCloseTo(0.45, 5)
    expect(payload.margenVenta).toBeCloseTo(22.5, 5)
  })

  it('no marca un documento como usado cuando bienUsado llega como string false', () => {
    const draft = helpers.buildDocumentDraftForm({
      paraRevisar: {
        items: [{ desc: 'Laptop', bienUsado: 'false' }]
      }
    })

    expect(draft.condicionProducto).toBe('nuevo')
  })

  it('reconoce respuestas afirmativas acentuadas al detectar producto usado', () => {
    const draft = helpers.buildDocumentDraftForm({
      paraRevisar: {
        items: [{ desc: 'Laptop', bienUsado: 'sí' }]
      }
    })

    expect(draft.condicionProducto).toBe('usado')
  })

  it('blinda el payload documental ante items mal formados y normaliza cantidades', () => {
    const payload = helpers.buildDocumentCalculationPayload(
      {
        paraRevisar: {
          items: [
            { desc: 'Item utilizable', qty: 0, unit: '10,20', pesoKg: '1,5' }
          ]
        }
      },
      {
        condicionProducto: 'usado',
        pais: 'CN',
        flete: '12,8',
        seguroModo: 'REAL',
        seguro: '0,85',
        tc: '3,61',
        margenVenta: '0'
      }
    )

    expect(payload.items).toEqual([
      expect.objectContaining({
        desc: 'Item utilizable',
        qty: 1,
        unit: 10.2,
        pesoKg: 1.5,
        bienUsado: true
      })
    ])
    expect(payload.margenVenta).toBe(0)
    expect(payload.tc).toBeCloseTo(3.61, 5)
  })

  it('descarta items documentales mal formados antes de calcular y conserva los utilizables', () => {
    const payload = helpers.buildDocumentCalculationPayload(
      {
        paraRevisar: {
          items: [
            'texto-suelto',
            null,
            { descripcion: 'iPhone 14 Pro', cantidad: '2', precio_unitario: '324,50' }
          ]
        }
      },
      {
        condicionProducto: 'nuevo'
      }
    )

    expect(payload.items).toEqual([
      expect.objectContaining({
        desc: 'iPhone 14 Pro',
        qty: 2,
        unit: 324.5,
        bienUsado: false
      })
    ])
  })

  it('ignora review.items si no es un arreglo', () => {
    const payload = helpers.buildDocumentCalculationPayload(
      { paraRevisar: { items: { desc: 'mal' } } },
      { condicionProducto: 'nuevo' }
    )

    expect(payload.items).toEqual([])
  })

  it('recorta textos largos sin partirlos de forma brusca', () => {
    const text = 'Apple iPhone 14 Pro Unlocked 128 GB Gold Seller stock photos device condition'
    const truncated = helpers.truncateText(text, 42)

    expect(truncated.length).toBeLessThanOrEqual(45)
    expect(truncated.endsWith('...')).toBe(true)
    expect(truncated).toMatch(/^Apple iPhone 14 Pro/)
  })
})
