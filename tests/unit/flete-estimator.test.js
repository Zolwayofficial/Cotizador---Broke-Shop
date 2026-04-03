const fs = require('fs');
const path = require('path');

const { estimarFlete } = require('../../server/flete');

describe('flete estimator', () => {
  it('mantiene payload visible de flete aereo en ASCII estable', () => {
    const resultado = estimarFlete({
      origen: 'CN',
      destino: 'PE',
      canal: 'AEREO',
      pesoRealKg: 10,
      largoCm: 40,
      anchoCm: 40,
      altoCm: 40,
      cantidadBultos: 1,
      valorFOB: 1000,
    });

    expect(resultado.tiempoTransito).toBe('5-8 dias');
    expect(resultado.nota).toBe('Estimado referencial. Solicitar cotizacion formal al freight forwarder.');
    expect(resultado.desglose[0].concepto).toBe('Flete aereo');
    expect(resultado.desglose[0].detalle).toContain('x $');
    expect(resultado.desglose.map((item) => item.concepto)).toContain('Seguro estimado (1.5%)');
  });

  it('mantiene payload visible maritimo sin conceptos con acentos fragiles', () => {
    const resultado = estimarFlete({
      origen: 'CN',
      destino: 'PE',
      canal: 'MARITIMO',
      largoCm: 100,
      anchoCm: 100,
      altoCm: 100,
      cantidadBultos: 2,
      valorFOB: 0,
    });

    expect(resultado.tiempoTransito).toBe('28-35 dias');
    expect(resultado.desglose.some((item) => item.concepto === 'Flete maritimo (LCL)')).toBe(true);
    expect(resultado.desglose.some((item) => item.concepto === 'Traccion')).toBe(true);
  });

  it('no revive unicode fragil en server/flete.js', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'flete.js'), 'utf8');

    expect(source).toContain("// server/flete.js - Estimador inteligente de flete internacional");
    expect(source).toContain("nota: 'Estimado referencial. Solicitar cotizacion formal al freight forwarder.'");
    expect(source).toContain("concepto: 'Flete aereo'");
    expect(source).toContain("concepto: 'Flete maritimo (LCL)'");
    expect(source).toContain("concepto: 'Traccion'");
    expect(source).not.toContain('—');
    expect(source).not.toContain('→');
    expect(source).not.toContain('días');
    expect(source).not.toContain('aéreo');
    expect(source).not.toContain('marítimo');
    expect(source).not.toContain('cotización formal');
    expect(source).not.toContain('almacén');
  });
});
