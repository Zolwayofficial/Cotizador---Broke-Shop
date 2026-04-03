const fs = require('fs');
const path = require('path');
const { beforeAll, describe, expect, it } = require('@jest/globals');

jest.mock('../../server/tipo-cambio-operativo', () => ({
  resolverTipoCambioOperativo: jest.fn(async (payload = {}) => ({
    tc: Number(payload.tc) || 3.65,
    fuente: payload.tc ? 'manual_usuario' : 'test_fixture',
    oficial: false,
    referenciaAutomatica: 3.65,
    diferenciaVsReferencia: 0,
    alertas: [],
  })),
}));

const nandina = require('../../server/nandina');
const agente = require('../../server/agente');
const autoCotizar = require('../../server/auto-cotizar');
const { evaluarPrecisionCotizacion } = require('../../server/cotizacion-precision');

beforeAll(async () => {
  await nandina.init();
});

describe('cotizacion-precision', () => {
  it('marca como consistente una cotizacion con HS manual y costos reales', () => {
    const precision = evaluarPrecisionCotizacion({
      items: [{ desc: 'laptop', hs: '8471300000', metodo: 'manual', confianza: 100 }],
      trazabilidad: {
        flete: { estado: 'real', fuente: 'manual', monto: 120 },
        seguro: { estado: 'real', fuente: 'manual', monto: 12 },
        incoterm: { codigo: 'FOB', estado: 'con_respaldo' },
      },
    });

    expect(precision.nivel).toBe('consistente');
    expect(precision.esConsistente).toBe(true);
    expect(precision.componentes.hs.detalle).toBe('La partida HS tiene respaldo manual.');
    expect(precision.componentes.hs.detalle).not.toContain('confirmada manualmente');
    expect(precision.componentes.incoterm.estado).toBe('con_respaldo');
    expect(precision.checks.incotermConRespaldo).toBe(true);
    expect(precision.motivos).toHaveLength(0);
  });

  it('marca como referencial cuando el motor completa flete y seguro estimados', async () => {
    const resultado = await agente.orquestar({
      items: [{ desc: 'televisor led', qty: 10, unit: 100, hs: '8528.72.00.00' }],
      pais: 'China',
      canal: 'DEFINITIVA',
      incoterm: 'CIF',
    });

    expect(resultado.procesado).toBe(true);
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

    expect(resultado.procesado).toBe(true);
    expect(resultado.precision).toBeTruthy();
    expect(['consistente', 'alta']).toContain(resultado.precision.nivel);
    if (resultado.precision.nivel === 'alta') {
      expect(resultado.precision.resumen).toBe(
        'Cotizacion de alta precision: la base tributaria es solida, pero aun conviene revisar manualmente algunos supuestos.'
      );
    }
  });

  it('normaliza metodo/confianza y detecta contraste NANDINA faltante aunque venga stringificado', () => {
    const precision = evaluarPrecisionCotizacion({
      items: [
        {
          desc: 'tablet',
          hs: '8471300000',
          metodo: ' SIMPLE_FALLBACK ',
          confianza: '65,5',
          contrastadoNandina: 'false',
        },
      ],
      trazabilidad: {
        flete: { estado: 'real' },
        seguro: { estado: 'real' },
        incoterm: { codigo: 'FOB', estado: 'con_respaldo' },
      },
    });

    expect(precision.requiereRevision).toBe(true);
    expect(precision.motivos.some((motivo) => motivo.codigo === 'clasificacion_baja_confianza')).toBe(true);
    expect(precision.motivos.some((motivo) => motivo.codigo === 'hs_no_contrastado')).toBe(true);
  });

it('no revive el contrato anterior de lectura parcial NANDINA en el source de precision', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'cotizacion-precision.js'), 'utf8');

    expect(content).toContain('contrastadoNandina');
    expect(content).toContain('hs_no_contrastado');
    expect(content).toContain('no pudo contrastarse contra NANDINA');
    expect(content).toContain('Revisa manualmente la partida HS y contrasta el codigo con NANDINA antes de usar la cotizacion como valor final.');
    expect(content).toContain('Cotizacion de alta precision: la base tributaria es solida, pero aun conviene revisar manualmente algunos supuestos.');
    expect(content).not.toContain("normalized === 'exacto'");
    expect(content).not.toContain("normalized === 'confirmado'");
    expect(content).not.toContain('validadoNandina');
    expect(content).not.toContain('hs_no_validado');
    expect(content).not.toContain('no quedo validada contra NANDINA');
    expect(content).not.toContain('Confirma manualmente la partida HS y contrasta el codigo con NANDINA antes de usar la cotizacion como valor final.');
    expect(content).not.toContain('Cotizacion de alta precision: la base tributaria es solida, pero aun conviene validar manualmente algunos supuestos.');
  });

it('evita wording de certeza cerrada cuando la cotizacion sale consistente', () => {
    const precision = evaluarPrecisionCotizacion({
      items: [{ desc: 'laptop', hs: '8471300000', metodo: 'manual', confianza: 100 }],
      trazabilidad: {
        flete: { estado: 'real', fuente: 'manual', monto: 120 },
        seguro: { estado: 'real', fuente: 'manual', monto: 12 },
        incoterm: { codigo: 'FOB', estado: 'con_respaldo' },
      },
    });

    expect(precision.acciones).toContain(
      'La cotizacion no uso heuristicas visibles y puede tratarse como calculo consistente con los datos entregados.'
    );
    expect(precision.acciones.join(' ')).not.toContain('calculo cerrado');
    expect(precision.componentes.tributos.detalle).toBe(
      'Los tributos se calcularon con tasas oficiales y una base CIF definida.'
    );
    expect(precision.componentes.tributos.detalle).not.toContain('base CIF cerrada');
    expect(precision.resumen).toBe(
      'Cotizacion consistente con los datos entregados: no se detectaron estimaciones ni clasificaciones pendientes.'
    );
    expect(precision.resumen).not.toContain('Cotizacion exacta');
  });

  it('evita hablar de CIF exacto en las acciones visibles de precision', () => {
    const precision = evaluarPrecisionCotizacion({
      items: [{ desc: 'tablet', hs: '8471300000', metodo: 'manual', confianza: 100 }],
      trazabilidad: {
        flete: { estado: 'real', fuente: 'manual', monto: 90 },
        seguro: { estado: 'estimado' },
        incoterm: { codigo: 'FOB', estado: 'con_respaldo' },
      },
    });

    expect(precision.acciones).toContain(
      'Ingresa el seguro real del proveedor o de la poliza para definir un CIF consistente.'
    );
    expect(precision.acciones.join(' ')).not.toContain('CIF exacto');
    expect(precision.acciones.join(' ')).not.toContain('CIF confirmado');
  });

  it('evita llamar exacta a una partida sugerida por IA en el motivo visible', () => {
    const precision = evaluarPrecisionCotizacion({
      items: [{ desc: 'tablet', hs: '8471300000', metodo: 'ia_model', confianza: 85 }],
      trazabilidad: {
        flete: { estado: 'real' },
        seguro: { estado: 'real' },
        incoterm: { codigo: 'FOB', estado: 'con_respaldo' },
      },
    });

    const motivoIa = precision.motivos.find((motivo) => motivo.codigo === 'clasificacion_ia');

    expect(motivoIa).toBeTruthy();
    expect(motivoIa.mensaje).toBe(
      'La partida HS fue sugerida por IA. Para tratarla como partida con respaldo manual, debe revisarse manualmente.'
    );
    expect(motivoIa.mensaje).not.toContain('llamarla exacta');
    expect(motivoIa.mensaje).not.toContain('como confirmada');
  });

  it('evita hablar de partida HS confirmada cuando falta respaldo manual', () => {
    const precision = evaluarPrecisionCotizacion({
      items: [{ desc: 'tablet', qty: 1, unit: 100 }],
      trazabilidad: {
        flete: { estado: 'real' },
        seguro: { estado: 'real' },
        incoterm: { codigo: 'FOB', estado: 'con_respaldo' },
      },
    });

    expect(precision.componentes.hs.detalle).toBe('Hay productos sin partida HS con respaldo manual.');
    expect(precision.motivos.some((motivo) => motivo.mensaje.includes('no tiene partida HS con respaldo manual.'))).toBe(
      true
    );
    expect(JSON.stringify(precision)).not.toContain('partida HS confirmada');
  });

  it('evita wording de exactitud absoluta al desglosar DDP en agente y auto-cotizar', async () => {
    const payload = {
      items: [{ desc: 'tablet', qty: 5, unit: 200, hs: '8471300000' }],
      pais: 'China',
      canal: 'DEFINITIVA',
      incoterm: 'DDP',
      tipoImportador: 'general',
      margenVenta: 30,
    };

    const resultadoAgente = await agente.orquestar(payload);
    const resultadoAuto = await autoCotizar.calcular(payload);

    expect(resultadoAgente.procesado).toBe(true);
    expect(resultadoAgente.trazabilidad.incoterm.estado).toBe('estimado');
    expect(resultadoAgente.trazabilidad.incoterm.mensaje).toBe(
      'DDP no puede desglosarse de forma confiable sin un FOB real del proveedor.'
    );
    expect(resultadoAgente.trazabilidad.incoterm.mensaje).not.toContain('con exactitud');

    expect(resultadoAuto.procesado).toBe(true);
    expect(resultadoAuto.trazabilidad.incoterm.estado).toBe('estimado');
    expect(resultadoAuto.trazabilidad.incoterm.mensaje).toBe(
      'DDP no puede desglosarse de forma confiable sin un FOB real del proveedor.'
    );
    expect(resultadoAuto.etapas.incoterm.ajuste).toContain('Para mayor confiabilidad');
    expect(resultadoAuto.etapas.incoterm.ajuste).not.toContain('Para precision');
  });
});
