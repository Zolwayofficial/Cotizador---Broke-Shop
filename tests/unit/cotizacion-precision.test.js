const { beforeAll, describe, expect, it } = require('@jest/globals');

const nandina = require('../../server/nandina');
const agente = require('../../server/agente');
const autoCotizar = require('../../server/auto-cotizar');
const { evaluarPrecisionCotizacion } = require('../../server/cotizacion-precision');

beforeAll(async () => {
  await nandina.init();
});

describe('cotizacion-precision', () => {
  it('marca como exacta una cotizacion cerrada con HS manual y costos reales', () => {
    const precision = evaluarPrecisionCotizacion({
      items: [{ desc: 'laptop', hs: '8471300000', metodo: 'manual', confianza: 100 }],
      trazabilidad: {
        flete: { estado: 'real', fuente: 'manual', monto: 120 },
        seguro: { estado: 'real', fuente: 'manual', monto: 12 },
        incoterm: { codigo: 'FOB', estado: 'exacto' },
      },
    });

    expect(precision.nivel).toBe('exacta');
    expect(precision.esExacta).toBe(true);
    expect(precision.motivos).toHaveLength(0);
  });

  it('marca como referencial cuando el motor completa flete y seguro estimados', async () => {
    const resultado = await agente.orquestar({
      items: [{ desc: 'televisor led', qty: 10, unit: 100, hs: '8528.72.00.00' }],
      pais: 'China',
      canal: 'DEFINITIVA',
      incoterm: 'CIF',
    });

    expect(resultado.exito).toBe(true);
    expect(resultado.precision).toBeTruthy();
    expect(resultado.precision.nivel).toBe('referencial');
    expect(resultado.precision.motivos.some((motivo) => motivo.codigo === 'flete_estimado')).toBe(true);
    expect(resultado.precision.motivos.some((motivo) => motivo.codigo === 'seguro_estimado')).toBe(true);
    expect(resultado.precision.componentes.flete.estado).toBe('referencial');
    expect(resultado.precision.componentes.seguro.estado).toBe('referencial');
    expect(resultado.precision.componentes.tributos.estado).toBe('referencial');
  });

  it('marca como alta cuando el HS viene de IA pero los costos son reales', async () => {
    const resultado = await autoCotizar.calcular({
      items: [{ desc: 'televisor led', qty: 5, unit: 100, hs: '8528.72.00.00' }],
      pais: 'China',
      canal: 'DEFINITIVA',
      incoterm: 'FOB',
      fleteManual: 80,
      seguroManual: 12,
      tipoImportador: 'general',
      margenVenta: 30,
    });

    expect(resultado.exito).toBe(true);
    expect(resultado.precision).toBeTruthy();
    expect(['exacta', 'alta']).toContain(resultado.precision.nivel);
  });
});
