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
    expect(cuarta.paso).toBe('objetivo_calculo');

    const quinta = await conversador.agenteConversador('Solo costo de importacion', cuarta.contexto);
    expect(quinta.contexto.datos_previos.objetivo_calculo).toBe('costo_importacion');
    expect(quinta.paso).toBe('precio_unitario');
  });

  it('reconoce nombres de couriers privados aunque no esten en el ejemplo del boton', async () => {
    const respuesta = await conversador.agenteConversador('Aramex', {
      datos_previos: {
        productos: [{ cantidad: 10, producto: 'polos', descripcion: 'polos' }],
        pais_origen: 'US',
        tipo_sujeto: 'empresa',
        objetivo_calculo: 'precio_sugerido',
      },
      paso_actual: 'canal',
    });

    expect(respuesta.contexto.datos_previos.canal).toBe('COURIER');
    expect(respuesta.contexto.datos_previos.productos[0].producto).toBe('polos');
    expect(respuesta.paso).toBe('precio_unitario');
  });

  it('responde una aclaracion sobre courier vs aereo sin avanzar el paso actual', async () => {
    const respuesta = await conversador.agenteConversador('que diferencia entre courier express y aereo importacion formal', {
      datos_previos: {
        productos: [{ cantidad: 12, producto: 'audifonos', descripcion: 'audifonos bluetooth' }],
        pais_origen: 'ES',
        tipo_sujeto: 'empresa',
      },
      paso_actual: 'canal',
    });

    expect(respuesta.paso).toBe('canal');
    expect(respuesta.contexto.paso_actual).toBe('canal');
    expect(respuesta.contexto.datos_previos.canal).toBeUndefined();
    expect(respuesta.mensaje).toMatch(/courier express/i);
    expect(respuesta.mensaje).toMatch(/aereo formal/i);
    expect(Array.isArray(respuesta.opciones)).toBe(true);
    expect(respuesta.opciones).toHaveLength(4);
  });

  it('mantiene el paso activo al aclarar aunque falten campos previos en el contexto', async () => {
    const respuesta = await conversador.agenteConversador('que diferencia hay entre courier express y aereo importacion formal', {
      datos_previos: {
        productos: [{ cantidad: 1, producto: 'vinos espanoles', descripcion: 'vinos espanoles' }],
        pais_origen: 'ES',
      },
      paso_actual: 'canal',
    });

    expect(respuesta.paso).toBe('canal');
    expect(respuesta.contexto.paso_actual).toBe('canal');
    expect(respuesta.contexto.datos_previos.canal).toBeUndefined();
    expect(respuesta.mensaje).toMatch(/courier express/i);
    expect(respuesta.mensaje).toMatch(/seguimos con este punto/i);
    expect(respuesta.mensaje).toMatch(/que canal usaras para importar desde es/i);
    expect(respuesta.opciones.map((item) => item.value)).toEqual([
      'MARITIMO',
      'AEREO',
      'COURIER',
      'POSTAL',
    ]);
  });

  it('aclara el tipo de cambio manual sin consumir el dato pendiente', async () => {
    const respuesta = await conversador.agenteConversador('conviene usar mi tipo de cambio o el de sunat?', {
      datos_previos: {
        productos: [{ cantidad: 1, producto: 'tablet', descripcion: 'tablet' }],
        pais_origen: 'CN',
        tipo_sujeto: 'empresa',
        canal: 'COURIER',
        objetivo_calculo: 'precio_sugerido',
        precio_unitario: 150,
        incoterm: 'FOB',
        tipo_importador: 'general',
        bien_usado: false,
        flete: 0,
        seguro: 0,
        peso_total: 0,
      },
      paso_actual: 'tipo_cambio',
    });

    expect(respuesta.paso).toBe('tipo_cambio');
    expect(respuesta.contexto.paso_actual).toBe('tipo_cambio');
    expect(respuesta.contexto.datos_previos.tipo_cambio).toBeUndefined();
    expect(respuesta.mensaje).toMatch(/tipo de cambio/i);
    expect(respuesta.mensaje).toMatch(/sistema lo respeta/i);
  });

  it('permite corregir el producto mientras espera el pais y luego retoma el mismo paso', async () => {
    const propuesta = await conversador.agenteConversador('150 vinos, no uno', {
      datos_previos: {
        productos: [{ cantidad: 1, producto: 'vinos espanoles', descripcion: 'vinos espanoles' }],
      },
      paso_actual: 'pais_origen',
    });

    expect(propuesta.paso).toBe('confirmar_correccion');
    expect(propuesta.contexto.paso_actual).toBe('confirmar_correccion');
    expect(propuesta.contexto.datos_previos.productos[0].cantidad).toBe(1);
    expect(propuesta.mensaje).toMatch(/quieres corregir productos/i);
    expect(propuesta.opciones.map((item) => item.value)).toEqual([
      'CONFIRMAR_CORRECCION',
      'CANCELAR_CORRECCION',
    ]);

    const confirmada = await conversador.agenteConversador('CONFIRMAR_CORRECCION', propuesta.contexto);
    expect(confirmada.paso).toBe('pais_origen');
    expect(confirmada.contexto.paso_actual).toBe('pais_origen');
    expect(confirmada.contexto.datos_previos.productos[0].cantidad).toBe(150);
    expect(confirmada.contexto.datos_previos.productos[0].descripcion).toMatch(/vinos/i);
    expect(confirmada.mensaje).toMatch(/actualice productos/i);
    expect(confirmada.mensaje).toMatch(/desde que pais importaras/i);
  });

  it('permite rechazar una correccion y mantiene el valor anterior', async () => {
    const propuesta = await conversador.agenteConversador('150 vinos, no uno', {
      datos_previos: {
        productos: [{ cantidad: 1, producto: 'vinos espanoles', descripcion: 'vinos espanoles' }],
      },
      paso_actual: 'pais_origen',
    });

    const rechazada = await conversador.agenteConversador('CANCELAR_CORRECCION', propuesta.contexto);
    expect(rechazada.paso).toBe('pais_origen');
    expect(rechazada.contexto.paso_actual).toBe('pais_origen');
    expect(rechazada.contexto.datos_previos.productos[0].cantidad).toBe(1);
    expect(rechazada.mensaje).toMatch(/mantengo productos/i);
  });

  it('pide confirmar antes de corregir el tipo de sujeto e invalida el perfil importador dependiente', async () => {
    const propuesta = await conversador.agenteConversador('persona natural', {
      datos_previos: {
        productos: [{ cantidad: 10, producto: 'polos', descripcion: 'polos' }],
        pais_origen: 'US',
        tipo_sujeto: 'empresa',
        canal: 'COURIER',
        objetivo_calculo: 'precio_sugerido',
        precio_unitario: 5,
        incoterm: 'FOB',
        tipo_importador: 'general',
      },
      paso_actual: 'bien_usado',
    });

    expect(propuesta.paso).toBe('confirmar_correccion');
    expect(propuesta.mensaje).toMatch(/tipo de sujeto/i);

    const confirmada = await conversador.agenteConversador('si', propuesta.contexto);
    expect(confirmada.contexto.datos_previos.tipo_sujeto).toBe('persona_natural');
    expect(confirmada.contexto.datos_previos.tipo_importador).toBeUndefined();
    expect(confirmada.paso).toBe('tipo_importador');
    expect(confirmada.opciones).toEqual([
      { value: 'nuevo', label: 'Persona natural - primera importacion' },
      { value: 'general', label: 'Persona natural - ya he importado antes' },
    ]);
  });

  it('pide confirmar antes de corregir el canal e invalida pasos logisticos dependientes', async () => {
    const propuesta = await conversador.agenteConversador('mejor postal', {
      datos_previos: {
        productos: [{ cantidad: 10, producto: 'polos', descripcion: 'polos' }],
        pais_origen: 'US',
        tipo_sujeto: 'empresa',
        canal: 'MARITIMO',
        objetivo_calculo: 'precio_sugerido',
        precio_unitario: 5,
        incoterm: 'FOB',
        tipo_importador: 'general',
        bien_usado: false,
        flete: 50,
        seguro: 10,
        peso_total: 8,
      },
      paso_actual: 'tipo_cambio',
    });

    expect(propuesta.paso).toBe('confirmar_correccion');
    expect(propuesta.mensaje).toMatch(/canal/i);

    const confirmada = await conversador.agenteConversador('si', propuesta.contexto);
    expect(confirmada.contexto.datos_previos.canal).toBe('POSTAL');
    expect(confirmada.contexto.datos_previos.flete).toBeUndefined();
    expect(confirmada.contexto.datos_previos.seguro).toBeUndefined();
    expect(confirmada.contexto.datos_previos.peso_total).toBeUndefined();
    expect(confirmada.paso).toBe('tipo_cambio');
  });

  it('muestra un resumen de cantidades mas claro al pedir el pais de origen', () => {
    const pregunta = conversador.generarPregunta({
      datos_previos: {
        productos: [{ cantidad: 150, producto: 'vinos', descripcion: 'vinos espanoles' }],
      },
    });

    expect(pregunta.paso).toBe('pais_origen');
    expect(pregunta.pregunta).toMatch(/150 unidad\(es\)/i);
    expect(pregunta.pregunta).toMatch(/vinos espanoles/i);
  });

  it('expone todos los incoterms comunes en vez de un boton OTRO roto', () => {
    const pregunta = conversador.generarPregunta({
      datos_previos: {
        productos: [{ cantidad: 10, producto: 'polos', descripcion: 'polos' }],
        pais_origen: 'US',
        tipo_sujeto: 'empresa',
        canal: 'COURIER',
        objetivo_calculo: 'precio_sugerido',
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
        objetivo_calculo: 'precio_sugerido',
        precio_unitario: 5,
        incoterm: 'FOB',
      },
      paso_actual: 'tipo_importador',
    });

    expect(respuesta.contexto.datos_previos.tipo_importador).toBe('general');
    expect(respuesta.paso).toBe('bien_usado');

    respuesta = await conversador.agenteConversador('Nuevo', respuesta.contexto);
    expect(respuesta.contexto.datos_previos.bien_usado).toBe(false);
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
        objetivo_calculo: 'precio_sugerido',
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
        objetivo_calculo: 'precio_sugerido',
        precio_unitario: 15,
        incoterm: 'FOB',
      },
      paso_actual: 'tipo_importador',
    });

    expect(respuesta.contexto.datos_previos.tipo_importador).toBe('nuevo');
    expect(respuesta.paso).toBe('bien_usado');

    respuesta = await conversador.agenteConversador('Usado', respuesta.contexto);
    expect(respuesta.contexto.datos_previos.bien_usado).toBe(true);
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
        objetivo_calculo: 'precio_sugerido',
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

  it('guarda explicitamente cuando la mercancia es usada', async () => {
    const respuesta = await conversador.agenteConversador('Producto usado', {
      datos_previos: {
        productos: [{ cantidad: 6, producto: 'maquinaria', descripcion: 'maquinaria usada' }],
        pais_origen: 'US',
        tipo_sujeto: 'empresa',
        canal: 'MARITIMO',
        objetivo_calculo: 'precio_sugerido',
        precio_unitario: 250,
        incoterm: 'FOB',
        tipo_importador: 'general',
      },
      paso_actual: 'bien_usado',
    });

    expect(respuesta.contexto.datos_previos.bien_usado).toBe(true);
    expect(respuesta.paso).toBe('flete');
  });

  it('permite confirmar cuando ya esta listo para calcular', async () => {
    const respuesta = await conversador.agenteConversador('si', {
      datos_previos: {
        productos: [{ cantidad: 10, producto: 'polos', descripcion: 'polos' }],
        pais_origen: 'CN',
        tipo_sujeto: 'empresa',
        canal: 'COURIER',
        objetivo_calculo: 'precio_sugerido',
        precio_unitario: 5,
        incoterm: 'FOB',
        tipo_importador: 'general',
        bien_usado: false,
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

  it('omite el paso de margen cuando el objetivo es solo costo de importacion', async () => {
    let respuesta = await conversador.agenteConversador('General', {
      datos_previos: {
        productos: [{ cantidad: 10, producto: 'polos', descripcion: 'polos' }],
        pais_origen: 'US',
        tipo_sujeto: 'empresa',
        canal: 'MARITIMO',
        objetivo_calculo: 'costo_importacion',
        precio_unitario: 5,
        incoterm: 'FOB',
      },
      paso_actual: 'tipo_importador',
    });

    respuesta = await conversador.agenteConversador('Nuevo', respuesta.contexto);
    respuesta = await conversador.agenteConversador('ESTIMAR', respuesta.contexto);
    respuesta = await conversador.agenteConversador('TABLA', respuesta.contexto);
    expect(respuesta.contexto.datos_previos.seguro_modo).toBe('TABLA');
    respuesta = await conversador.agenteConversador('OMITIR', respuesta.contexto);
    respuesta = await conversador.agenteConversador('OMITIR', respuesta.contexto);

    expect(respuesta.paso).toBe('calcular');
    expect(respuesta.contexto.datos_previos.margen_venta).toBeUndefined();
  });
});
