const fs = require('fs');
const path = require('path');

jest.mock('../../server/conectores-gobierno', () => ({
  ADUANET: {
    consultarTratamientoCompleto: jest.fn(),
  },
}));

const { ADUANET } = require('../../server/conectores-gobierno');
const validacion = require('../../server/validacion-oficial-importacion');

describe('validacion-oficial-importacion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('deduplica usando aliases de hs y normaliza limite fuera de rango', () => {
    const result = validacion._private.dedupeItemsPorPartida([
      { hs_code: '8517.13.00.00', producto: 'Celular' },
      { subpartida: '8517130000', desc: 'Duplicado' },
      { partida: '3923.21.00.00', descripcion: 'Bolsas' },
    ], 0);

    expect(result.totalDetectadas).toBe(2);
    expect(result.subpartidas).toHaveLength(2);
    expect(result.subpartidas[0].partida).toBe('8517130000');
    expect(result.truncado).toBe(false);
  });

  test('construye el bloque oficial usando pais normalizado', async () => {
    ADUANET.consultarTratamientoCompleto.mockResolvedValue({
      fuente: 'ADUANET',
      oficialEnVivo: true,
      gravamenes: { adValorem: 0, igv: 16, ipm: 2 },
      restricciones: { items: [], entidades: [] },
      convenios: { mejorCoincidencia: { pais: 'US', acuerdo: 'TLC', vigencia: 'vigente' } },
    });

    const result = await validacion.construirValidacionOficialImportacion({
      items: [{ hs_code: '8517.13.00.00', producto: 'Celular' }],
      pais: 'EE. UU.',
      maxSubpartidas: -5,
      enabled: true,
    });

    expect(ADUANET.consultarTratamientoCompleto).toHaveBeenCalledWith('8517130000', 'US');
    expect(result.paisOrigen).toBe('US');
    expect(result.subpartidas).toHaveLength(1);
    expect(result.subpartidas[0].convenio.acuerdo).toBe('TLC');
  });

  test('interpreta enabled string false y no consulta ADUANET', async () => {
    const result = await validacion.construirValidacionOficialImportacion({
      items: [{ hs_code: '8517.13.00.00', producto: 'Celular' }],
      pais: 'CN',
      enabled: 'false',
    });

    expect(result).toBeNull();
    expect(ADUANET.consultarTratamientoCompleto).not.toHaveBeenCalled();
  });

  test('devuelve error estructurado cuando todas las consultas oficiales fallan', async () => {
    ADUANET.consultarTratamientoCompleto.mockRejectedValue(new Error('aduanet caido'));

    const result = await validacion.construirValidacionOficialImportacion({
      items: [{ hs_code: '8517.13.00.00', producto: 'Celular' }],
      pais: 'CN',
      enabled: true,
    });

    expect(result.subpartidas).toEqual([]);
    expect(result.error).toBe('aduanet caido');
    expect(result.errores_fuente).toEqual([
      { fuente: 'ADUANET', error: 'aduanet caido' },
    ]);
  });

  test('no revive el wording anterior del bloque oficial en el fallback del source', () => {
    const content = fs.readFileSync(
      path.join(__dirname, '..', '..', 'server', 'validacion-oficial-importacion.js'),
      'utf8'
    );

    expect(content).toContain('No se pudo obtener consulta oficial');
    expect(content).not.toContain('No se pudo obtener validacion oficial');
  });
});
