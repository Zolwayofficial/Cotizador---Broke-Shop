const AgenteNavegadorDIGESA = require('../../server/agentes-navegacion/AgenteNavegadorDIGESA');
const AgenteNavegadorSENASA = require('../../server/agentes-navegacion/AgenteNavegadorSENASA');

describe('agentes sanitarios', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('DIGESA no mezcla registros sanitarios entre laboratorios distintos y normaliza puntuacion', async () => {
    const agent = new AgenteNavegadorDIGESA();
    agent.memoria = {
      obtenerAprendizaje: jest.fn((key) => {
        if (key === 'registro_shampoo anticaspa_x labs') {
          return { valor: { producto: 'shampoo', laboratorio: 'X Labs', estado: 'vigente' } };
        }
        return null;
      }),
      guardarAprendizaje: jest.fn(),
    };
    const consultaSpy = jest.spyOn(agent, '_consultarRegistroLocal');

    const xLabs = await agent.consultarRegistroSanitario('Shampoo / Anticaspa', 'X-Labs.');
    const yLabs = await agent.consultarRegistroSanitario('Shampoo', 'Y Labs');
    const requiere = await agent.detectarSiRequiereRegistro('Shampoo anticaspa', null);

    expect(xLabs.laboratorio).toBe('X Labs');
    expect(yLabs.laboratorio).toBe('Y Labs');
    expect(consultaSpy).toHaveBeenCalledWith('Shampoo', 'Y Labs');
    expect(requiere.requiereRegistroSanitario).toBe(true);
  });

  test('DIGESA tolera llamadas sin init al leer estadisticas', () => {
    const agent = new AgenteNavegadorDIGESA();
    expect(agent.obtenerEstadisticas()).toEqual({});
  });

  test('SENASA no mezcla permisos entre paises y normaliza restricciones', async () => {
    const agent = new AgenteNavegadorSENASA();
    agent.memoria = {
      obtenerAprendizaje: jest.fn((key) => {
        if (key === 'permiso_manzanas premium_CN') {
          return { valor: { producto: 'manzanas', paisOrigen: 'CN', requierePermiso: true } };
        }
        return null;
      }),
      guardarAprendizaje: jest.fn(),
    };
    const consultaSpy = jest.spyOn(agent, '_consultarPermisoLocal');

    const cn = await agent.consultarPermisoFitosanitario('manzanas-premium', 'cn');
    const us = await agent.consultarPermisoFitosanitario('manzanas', 'us');
    const requiere = await agent.detectarSiRequierePermiso('manzana fresca', undefined, ' cn ');

    expect(cn.paisOrigen).toBe('CN');
    expect(us.paisOrigen).toBe('US');
    expect(consultaSpy).toHaveBeenCalledWith('manzanas', 'US');
    expect(requiere.requierePermisoFitosanitario).toBe(true);
    expect(requiere.tieneRestriccionAdicional).toBe(true);
  });

  test('SENASA tolera llamadas sin init al leer estadisticas', () => {
    const agent = new AgenteNavegadorSENASA();
    expect(agent.obtenerEstadisticas()).toEqual({});
  });

  test('DIGESA no marca falsos positivos por subcadenas y SENASA normaliza aliases de pais', async () => {
    const digesa = new AgenteNavegadorDIGESA();
    const senasa = new AgenteNavegadorSENASA();
    senasa.memoria = {
      obtenerAprendizaje: jest.fn(),
      guardarAprendizaje: jest.fn(),
    };
    const consultaSpy = jest.spyOn(senasa, '_consultarPermisoLocal');

    const paraguas = await digesa.detectarSiRequiereRegistro('paraguas impermeable', 'accesorio');
    const requiereUs = await senasa.detectarSiRequierePermiso('manzana fresca', '', 'EE. UU.');
    await senasa.consultarPermisoFitosanitario('manzanas', 'EE. UU.');

    expect(paraguas.requiereRegistroSanitario).toBe(false);
    expect(requiereUs.tieneRestriccionAdicional).toBe(true);
    expect(consultaSpy).toHaveBeenCalledWith('manzanas', 'US');
  });

  test('DIGESA y SENASA no exponen referencias mutables desde cache o aprendizaje', async () => {
    const digesa = new AgenteNavegadorDIGESA();
    const senasa = new AgenteNavegadorSENASA();
    digesa.memoria = {
      obtenerAprendizaje: jest.fn(() => null),
      guardarAprendizaje: jest.fn(),
    };
    senasa.memoria = {
      obtenerAprendizaje: jest.fn(() => null),
      guardarAprendizaje: jest.fn(),
    };
    jest.spyOn(digesa, '_consultarRegistroLocal').mockResolvedValue({
      producto: 'Shampoo',
      laboratorio: 'X Labs',
      registroSanitario: null,
      estado: 'pendiente_verificacion',
      fuente: 'DIGESA',
      actualizado: '2026-03-27T00:00:00.000Z',
    });
    jest.spyOn(senasa, '_consultarPermisoLocal').mockResolvedValue({
      producto: 'manzanas',
      paisOrigen: 'US',
      requierePermiso: true,
      tipoPermiso: 'Fitosanitario',
      estado: 'pendiente_verificacion',
      fuente: 'SENASA',
      actualizado: '2026-03-27T00:00:00.000Z',
    });

    const digesaFirst = await digesa.consultarRegistroSanitario('Shampoo', 'X Labs');
    digesaFirst.estado = 'mutado';
    const digesaSecond = await digesa.consultarRegistroSanitario('Shampoo', 'X Labs');

    const senasaFirst = await senasa.consultarPermisoFitosanitario('manzanas', 'US');
    senasaFirst.estado = 'mutado';
    const senasaSecond = await senasa.consultarPermisoFitosanitario('manzanas', 'US');

    expect(digesaSecond.estado).toBe('pendiente_verificacion');
    expect(senasaSecond.estado).toBe('pendiente_verificacion');
  });
});
