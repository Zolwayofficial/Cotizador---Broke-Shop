const fs = require('fs');
const path = require('path');

jest.mock('../../server/nandina', () => ({
  getRestriccion: jest.fn(),
  isProhibida: jest.fn(),
}));

const nandinaService = require('../../server/nandina');
const permisos = require('../../server/permisos');

describe('permisos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('normaliza HS antes de consultar restricciones', () => {
    nandinaService.getRestriccion.mockReturnValue([
      { entidad: '08', regimen: 'I', desc: 'Homologacion' },
    ]);
    nandinaService.isProhibida.mockReturnValue(null);

    const result = permisos.consultaPermisos('8517.13.00.00');

    expect(nandinaService.getRestriccion).toHaveBeenCalledWith('8517130000');
    expect(nandinaService.isProhibida).toHaveBeenCalledWith('8517130000');
    expect(result.hs).toBe('8517130000');
    expect(result.totalEntidades).toBe(1);
  });

  test('tolerates HS numerico sin romper', () => {
    nandinaService.getRestriccion.mockReturnValue([]);
    nandinaService.isProhibida.mockReturnValue(null);

    const result = permisos.consultaPermisos(8517130000);

    expect(result.hs).toBe('8517130000');
    expect(result.restringida).toBe(false);
  });

  test('acepta regimen numerico de importacion y entidades con codigo trimmeado', () => {
    nandinaService.getRestriccion.mockReturnValue([
      { entidad: '08', regimen: 1, desc: 'Homologacion' },
    ]);
    nandinaService.isProhibida.mockReturnValue(null);

    const result = permisos.consultaPermisos('8517130000');

    expect(result.totalEntidades).toBe(1);
    expect(result.permisos[0].entidad).toBe('MTC');
    expect(permisos.infoEntidad(' 08 ').siglas).toBe('MTC');
    expect(permisos.infoEntidad(' 08 ').icon).toBe('telecom');
  });

  test('usa un resumen neutral cuando no detecta restricciones especiales', () => {
    nandinaService.getRestriccion.mockReturnValue([]);
    nandinaService.isProhibida.mockReturnValue(null);

    const result = permisos.consultaPermisos('4901990000');

    expect(result.restringida).toBe(false);
    expect(result.resumen).toBe('No se detectaron restricciones especiales para esta mercancia en la revision actual.');
    expect(result.resumen).not.toMatch(/libremente/i);
    expect(permisos.infoEntidad('98')).toMatchObject({
      icon: 'info',
      pasos: ['Continuar con la revision documental general'],
    });
  });

  test('expone iconos ASCII estables para entidades regulatorias', () => {
    const entidades = permisos.listarEntidades();
    const iconos = entidades.map((entidad) => entidad.icon);

    expect(iconos).toEqual(expect.arrayContaining([
      'security',
      'health',
      'food',
      'agro',
      'forest',
      'diplomacy',
      'telecom',
      'fishing',
      'culture',
      'chemicals',
      'ozone',
      'nuclear',
      'seafood',
      'control',
      'environment',
    ]));
    expect(iconos.join(' ')).not.toMatch(/[🔫💊🍽🌿🌳🏛📡🐟⚗☢🦐🌍]/u);
  });

  test('no revive emojis en el source vivo de permisos', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'permisos.js'), 'utf8');

    expect(content).toContain("icon: 'telecom'");
    expect(content).toContain("icon: 'info'");
    expect(content).not.toContain("icon: '📡'");
    expect(content).not.toContain("icon: '✅'");
    expect(content).not.toContain("icon: '🏛'");
    expect(content).not.toContain("icon: '🌍'");
  });
});
