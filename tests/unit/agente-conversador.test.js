const { describe, it, expect } = require('@jest/globals');

const conversador = require('../../server/agente-conversador');

describe('agente-conversador', () => {
  it('avanza por el nuevo arbol y conserva el producto al responder opciones', async () => {
    const primera = await conversador.agenteConversador('500 camisetas de algodon', {
      datos_previos: {},
      paso_actual: 'productos',
    });

    expect(primera.contexto.datos_previos.productos[0].cantidad).toBe(500);
    expect(primera.contexto.datos_previos.productos[0].producto).toMatch(/camisetas/i);
    expect(primera.paso).toBe('pais_origen');

    const segunda = await conversador.agenteConversador('China', primera.contexto);
    expect(segunda.contexto.datos_previos.pais_origen).toBe('CN');
    expect(segunda.paso).toBe('tipo_sujeto');

    const tercera = await conversador.agenteConversador('Empresa', segunda.contexto);
    expect(tercera.contexto.datos_previos.tipo_sujeto).toBe('empresa');
    expect(tercera.contexto.datos_previos.productos[0].producto).toMatch(/camisetas/i);
    expect(tercera.paso).toBe('canal');

    const cuarta = await conversador.agenteConversador('Aereo', tercera.contexto);
    expect(cuarta.contexto.datos_previos.canal).toBe('AEREO');
    expect(cuarta.contexto.datos_previos.productos[0].producto).toMatch(/camisetas/i);
    expect(cuarta.paso).toBe('precio_unitario');
  });

  it('reconoce nombres de couriers privados aunque no esten en el ejemplo del boton', async () => {
    const respuesta = await conversador.agenteConversador('Aramex', {
      datos_previos: {
        productos: [{ cantidad: 10, producto: 'polos', descripcion: 'polos' }],
        pais_origen: 'US',
        tipo_sujeto: 'empresa',
      },
      paso_actual: 'canal',
    });

    expect(respuesta.contexto.datos_previos.canal).toBe('COURIER');
    expect(respuesta.contexto.datos_previos.productos[0].producto).toBe('polos');
    expect(respuesta.paso).toBe('precio_unitario');
  });

  it('expone todos los incoterms comunes en vez de un boton OTRO roto', () => {
    const pregunta = conversador.generarPregunta({
      datos_previos: {
        productos: [{ cantidad: 10, producto: 'polos', descripcion: 'polos' }],
        pais_origen: 'US',
        tipo_sujeto: 'empresa',
        canal: 'COURIER',
        precio_unitario: 5,
      },
    });

    expect(pregunta.paso).toBe('incoterm');
    expect(pregunta.opciones.map((item) => item.value)).toEqual([
      'FOB',
      'CIF',
      'CFR',
      'EXW',
      'FCA',
      'CIP',
      'DAP',
      'DDP',
    ]);
  });

  it('permite cubrir pasos opcionales con estimaciones y defaults antes de calcular', async () => {
    let respuesta = await conversador.agenteConversador('General', {
      datos_previos: {
        productos: [{ cantidad: 10, producto: 'polos', descripcion: 'polos' }],
        pais_origen: 'US',
        tipo_sujeto: 'empresa',
        canal: 'MARITIMO',
        precio_unitario: 5,
        incoterm: 'FOB',
      },
      paso_actual: 'tipo_importador',
    });

    expect(respuesta.contexto.datos_previos.tipo_importador).toBe('general');
    expect(respuesta.paso).toBe('flete');

    respuesta = await conversador.agenteConversador('ESTIMAR', respuesta.contexto);
    expect(respuesta.contexto.datos_previos.flete).toBe(0);
    expect(respuesta.paso).toBe('seguro');

    respuesta = await conversador.agenteConversador('ESTIMAR', respuesta.contexto);
    expect(respuesta.contexto.datos_previos.seguro).toBe(0);
    expect(respuesta.paso).toBe('peso_total');

    respuesta = await conversador.agenteConversador('OMITIR', respuesta.contexto);
    expect(respuesta.contexto.datos_previos.peso_total).toBe(0);
    expect(respuesta.paso).toBe('tipo_cambio');

    respuesta = await conversador.agenteConversador('OMITIR', respuesta.contexto);
    expect(respuesta.contexto.datos_previos.tipo_cambio).toBe(0);
    expect(respuesta.paso).toBe('margen_venta');

    respuesta = await conversador.agenteConversador('OMITIR', respuesta.contexto);
    expect(respuesta.contexto.datos_previos.margen_venta).toBe(30);
    expect(respuesta.paso).toBe('calcular');
  });

  it('adapta el perfil importador cuando el sujeto es persona natural', () => {
    const pregunta = conversador.generarPregunta({
      datos_previos: {
        productos: [{ cantidad: 2, producto: 'repuestos', descripcion: 'repuestos' }],
        pais_origen: 'US',
        tipo_sujeto: 'persona_natural',
        canal: 'COURIER',
        precio_unitario: 25,
        incoterm: 'FOB',
      },
    });

    expect(pregunta.paso).toBe('tipo_importador');
    expect(pregunta.opciones).toEqual([
      { value: 'nuevo', label: 'Persona natural - primera importacion' },
      { value: 'general', label: 'Persona natural - ya he importado antes' },
    ]);
  });

  it('omite flete, seguro y peso cuando el canal es postal', async () => {
    let respuesta = await conversador.agenteConversador('Nuevo', {
      datos_previos: {
        productos: [{ cantidad: 1, producto: 'libros', descripcion: 'libros' }],
        pais_origen: 'US',
        tipo_sujeto: 'persona_natural',
        canal: 'POSTAL',
        precio_unitario: 15,
        incoterm: 'FOB',
      },
      paso_actual: 'tipo_importador',
    });

    expect(respuesta.contexto.datos_previos.tipo_importador).toBe('nuevo');
    expect(respuesta.paso).toBe('tipo_cambio');

    respuesta = await conversador.agenteConversador('OMITIR', respuesta.contexto);
    expect(respuesta.contexto.datos_previos.tipo_cambio).toBe(0);
    expect(respuesta.paso).toBe('margen_venta');
  });

  it('repite la misma pregunta contextual cuando la respuesta no coincide con las opciones', async () => {
    const respuesta = await conversador.agenteConversador('tu pregunta no tiene relacion con las alternativas', {
      datos_previos: {
        productos: [{ cantidad: 10, producto: 'polos', descripcion: 'polos' }],
        pais_origen: 'CN',
        tipo_sujeto: 'empresa',
        canal: 'COURIER',
        precio_unitario: 5,
        incoterm: 'FOB',
      },
      paso_actual: 'tipo_importador',
    });

    expect(respuesta.paso).toBe('tipo_importador');
    expect(respuesta.mensaje).toMatch(/alternativas/i);
    expect(respuesta.opciones).toEqual([
      { value: 'general', label: 'Empresa importadora recurrente' },
      { value: 'nuevo', label: 'Empresa nueva importando' },
      { value: 'buen_contribuyente', label: 'Buen Contribuyente SUNAT' },
    ]);
  });

  it('permite confirmar cuando ya esta listo para calcular', async () => {
    const respuesta = await conversador.agenteConversador('si', {
      datos_previos: {
        productos: [{ cantidad: 10, producto: 'polos', descripcion: 'polos' }],
        pais_origen: 'CN',
        tipo_sujeto: 'empresa',
        canal: 'COURIER',
        precio_unitario: 5,
        incoterm: 'FOB',
        tipo_importador: 'general',
        flete: 0,
        seguro: 0,
        peso_total: 0,
        tipo_cambio: 0,
        margen_venta: 30,
      },
      paso_actual: 'calcular',
    });

    expect(respuesta.tipo).toBe('listo_para_calcular');
    expect(respuesta.paso).toBe('calcular');
  });
});
