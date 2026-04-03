const doctrina = require('../../server/clasificacion-doctrina');

describe('clasificacion-doctrina', () => {
  test('normaliza acentos y separadores para detectar mezclas con RGI 2b/3', () => {
    const result = doctrina.buildClassificationContext('Camisa de algodon y poliester');
    const resultConAcentos = doctrina.buildClassificationContext('Camisa de algodón/poliéster');

    expect(result.triggers.some((item) => item.rule === 'RGI 2b/3')).toBe(true);
    expect(resultConAcentos.triggers.some((item) => item.rule === 'RGI 2b/3')).toBe(true);
  });

  test('detecta alteraciones y falsificaciones con variaciones comunes', () => {
    const result = doctrina.buildClassificationContext('Zapatillas replicas usadas de segunda-mano');

    expect(result.scenarioNotes).toEqual(
      expect.arrayContaining([
        expect.stringContaining('usada o alterada'),
        expect.stringContaining('imitacion o material aparente'),
        expect.stringContaining('revisa composicion y naturaleza real antes de clasificar'),
      ]),
    );
    expect(result.scenarioNotes.join(' ')).not.toContain('validar composicion y naturaleza real antes de clasificar');
  });

  test('expone normalizacion reutilizable', () => {
    expect(doctrina._private.normalizarTexto(' Réplica   usada / segunda-mano ')).toBe('replica usada segunda mano');
  });
});
