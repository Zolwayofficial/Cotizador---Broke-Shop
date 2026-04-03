const { describe, it, expect } = require('@jest/globals');
const path = require('path');

const weeklyCleanup = require('../../scripts/weekly-cleanup.js');
const verifyImprovements = require('../../scripts/verify-improvements.js');
const updateNandina = require('../../scripts/update-nandina.js');

describe('maintenance scripts', () => {
  it('weekly cleanup no arrastra la ruta rota con llaves ni acepta retenciones fuera de rango', () => {
    expect(weeklyCleanup.DIRECTORIES_TO_DELETE).not.toContain(
      path.join(weeklyCleanup.ROOT, '{server,client')
    );
    expect(weeklyCleanup.parseRetentionDays('-5', 14)).toBe(14);
    expect(weeklyCleanup.parseRetentionDays('0', 14)).toBe(14);
    expect(weeklyCleanup.parseRetentionDays('21', 14)).toBe(21);
  });

  it('verify-improvements ya apunta a contratos actuales del proyecto', () => {
    const summary = verifyImprovements.runChecks();

    expect(summary.failed).toBe(0);
    expect(summary.passed).toBeGreaterThan(0);
  });

  it('verify-improvements usa un reporte neutral y no revive aprobaciones fuertes', () => {
    const source = require('fs').readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'verify-improvements.js'),
      'utf8',
    );

    expect(source).toContain("{ pattern: 'parseRetentionDays', name: 'Retencion acotada' },");
    expect(source).toContain("{ pattern: 'buildDocumentFieldChangeState', name: 'Edicion de borrador reemplaza resultado viejo' },");
    expect(source).toContain("{ pattern: 'Falta un valor despues de --output-dir', name: 'Requiere output-dir explicito' },");
    expect(source).toContain("{ pattern: 'Falta un valor despues de --passphrase-env', name: 'Requiere passphrase-env explicito' },");
    expect(source).toContain("console.log(`  ${result.ok ? 'PRESENTE' : 'FALTA'} ${result.name}`);");
    expect(source).toContain("console.log(`Presentes: ${summary.passed}`);");
    expect(source).toContain("console.log(`Pendientes: ${summary.failed}`);");
    expect(source).toContain("console.log('\\nSin verificaciones pendientes en esta pasada.');");
    expect(source).not.toContain("{ pattern: 'parseRetentionDays', name: 'Retencion validada' },");
    expect(source).not.toContain("{ pattern: 'buildDocumentFieldChangeState', name: 'Edicion de borrador invalida resultado viejo' },");
    expect(source).not.toContain("{ pattern: 'Falta un valor despues de --output-dir', name: 'Valida output-dir explicito' },");
    expect(source).not.toContain("{ pattern: 'Falta un valor despues de --passphrase-env', name: 'Valida passphrase-env explicito' },");
    expect(source).not.toContain("console.log(`  ${result.ok ? 'OK' : 'FAIL'} ${result.name}`);");
    expect(source).not.toContain("console.log(`Aprobadas: ${summary.passed}`);");
    expect(source).not.toContain("console.log(`Fallidas: ${summary.failed}`);");
    expect(source).not.toContain("Todas las verificaciones actuales pasaron.");
  });

  it('update-nandina formatea cambios y tolera listas ausentes', () => {
    expect(updateNandina.asArray(null)).toEqual([]);
    expect(updateNandina.formatChangeLine({ type: 'av_changed', hs: '8517130000', from: 6, to: 0 }))
      .toBe('    * 8517130000 Ad Valorem: 6% -> 0%');
    expect(updateNandina.formatChangeLine({ type: 'desconocido' })).toBeNull();
  });
});
