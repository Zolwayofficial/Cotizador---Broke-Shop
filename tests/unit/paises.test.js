const { normalizarCodigoPais, normalizarPaisParaRuta, sanitizeCountry } = require('../../server/paises')

describe('paises', () => {
  test('normaliza alias con puntuacion como EE. UU.', () => {
    expect(sanitizeCountry('EE. UU.')).toBe('EE UU')
    expect(normalizarCodigoPais('EE. UU.')).toBe('US')
    expect(normalizarPaisParaRuta('EE. UU.')).toBe('US')
  })
})
