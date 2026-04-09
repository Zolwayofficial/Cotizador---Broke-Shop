const {
  calcularDrawback,
  calcularAdmisionTemporal,
  calcularPerfeccionamientoPasivo,
  recomendarRegimen,
} = require('../../server/regimenes');

describe('regimenes', () => {
  test('normaliza decimales con coma en drawback', () => {
    const result = calcularDrawback('1000,5', '400,2');

    expect(result.fobExportacion).toBe(1000.5);
    expect(result.insumosImportados).toBe(400.2);
    expect(result.cumpleTopeInsumos).toBe(true);
    expect(result.montoRestitucion).toBe(30.02);
  });

  test('admision temporal suma tributos como numeros y no concatena strings', () => {
    const result = calcularAdmisionTemporal('5000', '6,5', '0', '180,5', '20', '12');

    expect(result.tributosASuspender).toBe(207);
    expect(result.plazoMaximo).toContain('12 meses');
    expect(result.comparacion.siAdmisionTemporal).toBe(5.18);
  });

  test('perfeccionamiento pasivo normaliza montos y porcentaje', () => {
    const result = calcularPerfeccionamientoPasivo('1200,5', '250,75', '6,5');

    expect(result.valorOriginal).toBe(1200.5);
    expect(result.costoReparacion).toBe(250.75);
    expect(result.tributos.adValorem).toBe(16.3);
  });

  test('recomienda drawback con insumos y FOB expresados como texto', () => {
    const recomendaciones = recomendarRegimen({
      vaATransformar: true,
      fobExport: '1000,5',
      insumosImport: '400,2',
    });

    expect(recomendaciones.some((item) => item.regimen.codigo === 'DB')).toBe(true);
  });

  test('interpreta miles y booleanos stringificados sin sesgar la recomendacion', () => {
    const drawback = calcularDrawback('1,200', '400');
    const admision = calcularAdmisionTemporal('5000', '6', '0', '180', '20', '6');
    const recomendaciones = recomendarRegimen({
      vaATransformar: 'false',
      esDevolucion: 'true',
      esReparacion: 'false',
      fobExport: '1,200',
      insumosImport: '400',
    });

    expect(drawback.fobExportacion).toBe(1200);
    expect(admision.costoEstimadoGarantia).toBe(admision.comparacion.siAdmisionTemporal);
    expect(recomendaciones[0].regimen.codigo).toBe('32');
    expect(recomendaciones.some((item) => item.regimen.codigo === '21')).toBe(false);
  });

test('evita fraseo exagerado de ahorro en regimenes condicionados', () => {
    const temporal = recomendarRegimen({ esTemporalMeses: 6, vaATransformar: false });
    const activo = recomendarRegimen({ vaATransformar: true, fobExport: 1000, insumosImport: 400 });
    const devolucion = recomendarRegimen({ esDevolucion: true });

    expect(temporal[0].ahorro).toContain('Tributos suspendidos');
    expect(temporal[0].ahorro).not.toContain('100%');
    expect(activo[0].ahorro).toContain('Tributos suspendidos sobre insumos');
    expect(activo[0].ahorro).not.toContain('100%');
    expect(devolucion[0].ahorro).toContain('Reingreso sin tributos');
    expect(devolucion[0].ahorro).not.toContain('100%');
  });
});
