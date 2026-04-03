const AgenteNavegadorMINAM = require('../../server/agentes-navegacion/AgenteNavegadorMINAM');
const AgenteNavegadorPRODUCE = require('../../server/agentes-navegacion/AgenteNavegadorPRODUCE');

describe('agentes ambientales y sectoriales', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('MINAM reutiliza aprendizaje normalizado y tolera categoria vacia', async () => {
    const agent = new AgenteNavegadorMINAM();
    agent.memoria = {
      obtenerAprendizaje: jest.fn((key) => {
        if (key === 'permiso_ambiental_bateria de plomo') {
          return { valor: { producto: 'Bateria de plomo', requierePermiso: true } };
        }
        return null;
      }),
      guardarAprendizaje: jest.fn(),
    };
    const consultaSpy = jest.spyOn(agent, '_consultarPermisoLocal');

    const learned = await agent.consultarPermisoAmbiental('Bateria / de plomo.');
    const fetched = await agent.consultarPermisoAmbiental('Aceite lubricante');
    const requiere = await agent.detectarSiRequierePermiso('residuo toxico industrial', undefined);
    const ozono = await agent.detectarSustanciasOzono('refrigerante con CFC');

    expect(learned.producto).toBe('Bateria de plomo');
    expect(fetched.producto).toBe('Aceite lubricante');
    expect(consultaSpy).toHaveBeenCalledWith('Aceite lubricante');
    expect(requiere.requierePermisoAmbiental).toBe(true);
    expect(ozono.esSustanciaAgotadoraOzono).toBe(true);
  });

  test('MINAM tolera llamadas sin init al leer estadisticas', () => {
    const agent = new AgenteNavegadorMINAM();
    expect(agent.obtenerEstadisticas()).toEqual({});
  });

  test('PRODUCE reutiliza aprendizaje normalizado y tolera categoria vacia', async () => {
    const agent = new AgenteNavegadorPRODUCE();
    agent.memoria = {
      obtenerAprendizaje: jest.fn((key) => {
        if (key === 'permiso_pesca_conserva de atun') {
          return { valor: { producto: 'Conserva de atun', requierePermiso: true } };
        }
        return null;
      }),
      guardarAprendizaje: jest.fn(),
    };
    const consultaSpy = jest.spyOn(agent, '_consultarPermisoPescaLocal');

    const learned = await agent.consultarPermisoPesca('Conserva de atun.');
    const fetched = await agent.consultarPermisoPesca('Camarones congelados');
    const requiere = await agent.detectarSiRequierePermisoPesca('harina de pescado premium', null);
    const iqbf = await agent.detectarInsumosQuimicos('Acetona industrial');

    expect(learned.producto).toBe('Conserva de atun');
    expect(fetched.producto).toBe('Camarones congelados');
    expect(consultaSpy).toHaveBeenCalledWith('Camarones congelados');
    expect(requiere.requierePermisoPesca).toBe(true);
    expect(requiere.esPesquero).toBe(true);
    expect(iqbf.esInsumoFiscalizado).toBe(true);
  });

  test('PRODUCE tolera llamadas sin init al leer estadisticas', () => {
    const agent = new AgenteNavegadorPRODUCE();
    expect(agent.obtenerEstadisticas()).toEqual({});
  });

  test('evita falsos positivos por subcadenas en MINAM y PRODUCE', async () => {
    const minam = new AgenteNavegadorMINAM();
    const produce = new AgenteNavegadorPRODUCE();

    const permisoAmbiental = await minam.detectarSiRequierePermiso('aceitera decorativa', 'hogar');
    const sustanciaOzono = await minam.detectarSustanciasOzono('halonero decorativo');
    const permisoPesca = await produce.detectarSiRequierePermisoPesca('atunera de juguete', 'juguetes');
    const iqbf = await produce.detectarInsumosQuimicos('acetonares textiles');

    expect(permisoAmbiental.requierePermisoAmbiental).toBe(false);
    expect(sustanciaOzono.esSustanciaAgotadoraOzono).toBe(false);
    expect(permisoPesca.esPesquero).toBe(false);
    expect(iqbf.esInsumoFiscalizado).toBe(false);
  });

  test('MINAM y PRODUCE no exponen referencias mutables desde cache o aprendizaje', async () => {
    const minam = new AgenteNavegadorMINAM();
    const produce = new AgenteNavegadorPRODUCE();
    minam.memoria = {
      obtenerAprendizaje: jest.fn(() => null),
      guardarAprendizaje: jest.fn(),
    };
    produce.memoria = {
      obtenerAprendizaje: jest.fn(() => null),
      guardarAprendizaje: jest.fn(),
    };
    jest.spyOn(minam, '_consultarPermisoLocal').mockResolvedValue({
      producto: 'Aceite lubricante',
      requierePermiso: false,
      tipoPermiso: null,
      estado: 'pendiente_verificacion',
      fuente: 'MINAM',
      actualizado: '2026-03-27T00:00:00.000Z',
    });
    jest.spyOn(produce, '_consultarPermisoPescaLocal').mockResolvedValue({
      producto: 'Camarones congelados',
      requierePermiso: false,
      tipoPermiso: null,
      estado: 'pendiente_verificacion',
      fuente: 'PRODUCE',
      actualizado: '2026-03-27T00:00:00.000Z',
    });

    const minamFirst = await minam.consultarPermisoAmbiental('Aceite lubricante');
    minamFirst.estado = 'mutado';
    const minamSecond = await minam.consultarPermisoAmbiental('Aceite lubricante');

    const produceFirst = await produce.consultarPermisoPesca('Camarones congelados');
    produceFirst.estado = 'mutado';
    const produceSecond = await produce.consultarPermisoPesca('Camarones congelados');

    expect(minamSecond.estado).toBe('pendiente_verificacion');
    expect(produceSecond.estado).toBe('pendiente_verificacion');
  });
});
