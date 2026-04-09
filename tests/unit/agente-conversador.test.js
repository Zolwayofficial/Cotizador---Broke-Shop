const fs = require('fs');
const path = require('path');
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

  it('mantiene soporte para entradas con acentos reales al detectar intencion, pais y canal', async () => {
    expect(conversador.detectarIntencion('¿Cuánto cuesta importar esto?').tipo).toBe('consulta_costo');
    expect(conversador.detectarIntencion('¿Qué día demora el embarque?').tipo).toBe('consulta_tiempo');

    const pais = await conversador.agenteConversador('México', {
      datos_previos: {
        productos: [{ cantidad: 5, producto: 'camaras', descripcion: 'camaras fotograficas' }],
      },
      paso_actual: 'pais_origen',
    });

    expect(pais.contexto.datos_previos.pais_origen).toBe('MX');

    const canal = await conversador.agenteConversador('aéreo', {
      datos_previos: {
        productos: [{ cantidad: 5, producto: 'camaras', descripcion: 'camaras fotograficas' }],
        pais_origen: 'MX',
        tipo_sujeto: 'empresa',
      },
      paso_actual: 'canal',
    });

    expect(canal.contexto.datos_previos.canal).toBe('AEREO');
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
    expect(respuesta.opciones).toHaveLength(5);
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
      'POSTAL_FRANQUICIA',
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
        consulta_oficial: { fuente: 'ADUANET' },
        validacion_oficial: { fuente: 'ADUANET' },
      },
      paso_actual: 'pais_origen',
    });

    expect(propuesta.paso).toBe('revisar_correccion');
    expect(propuesta.contexto.paso_actual).toBe('revisar_correccion');
    expect(propuesta.contexto.datos_previos.productos[0].cantidad).toBe(1);
    expect(propuesta.mensaje).toMatch(/quieres corregir productos/i);
    expect(propuesta.hint).toBe('Revisa si realmente quieres reemplazar ese dato.');
    expect(propuesta.opciones.map((item) => item.value)).toEqual([
      'APLICAR_CORRECCION',
      'MANTENER_CORRECCION',
    ]);

    const aplicada = await conversador.agenteConversador('APLICAR_CORRECCION', propuesta.contexto);
    expect(aplicada.paso).toBe('pais_origen');
    expect(aplicada.contexto.paso_actual).toBe('pais_origen');
    expect(aplicada.contexto.datos_previos.productos[0].cantidad).toBe(150);
    expect(aplicada.contexto.datos_previos.productos[0].descripcion).toMatch(/vinos/i);
    expect(aplicada.contexto.datos_previos.consulta_oficial).toBeUndefined();
    expect(aplicada.contexto.datos_previos.validacion_oficial).toBeUndefined();
    expect(aplicada.mensaje).toMatch(/actualice productos/i);
    expect(aplicada.mensaje).not.toMatch(/^listo/i);
    expect(aplicada.mensaje).toMatch(/desde que pais importaras/i);
  });

  it('permite rechazar una correccion y mantiene el valor anterior', async () => {
    const propuesta = await conversador.agenteConversador('150 vinos, no uno', {
      datos_previos: {
        productos: [{ cantidad: 1, producto: 'vinos espanoles', descripcion: 'vinos espanoles' }],
      },
      paso_actual: 'pais_origen',
    });

    const mantenida = await conversador.agenteConversador('MANTENER_CORRECCION', propuesta.contexto);
    expect(mantenida.paso).toBe('pais_origen');
    expect(mantenida.contexto.paso_actual).toBe('pais_origen');
    expect(mantenida.contexto.datos_previos.productos[0].cantidad).toBe(1);
    expect(mantenida.mensaje).toMatch(/mantengo productos/i);
    expect(mantenida.mensaje).not.toMatch(/^perfecto/i);
  });

  it('usa fraseo de revision en el subflujo de correccion y no revive texto anterior del paso previo', async () => {
    const propuesta = await conversador.agenteConversador('150 vinos, no uno', {
      datos_previos: {
        productos: [{ cantidad: 1, producto: 'vinos espanoles', descripcion: 'vinos espanoles' }],
      },
      paso_actual: 'pais_origen',
    });

    const reintento = await conversador.agenteConversador('tal vez', propuesta.contexto);

    expect(reintento.mensaje).toMatch(/revisa o cancela antes de seguir/i);
    expect(reintento.hint).toBe('Puedes revisarlo o mantener el valor actual.');

    const content = fs.readFileSync(
      path.join(__dirname, '..', '..', 'server', 'agente-conversador.js'),
      'utf8'
    );

    expect(content).toContain('Revisa si realmente quieres reemplazar ese dato.');
    expect(content).toContain('Revisa o cancela antes de seguir.');
    expect(content).toContain('Puedes revisarlo o mantener el valor actual.');
    expect(content).not.toContain('Confirma solo si realmente quieres reemplazar ese dato.');
    expect(content).not.toContain('Confirma o cancela antes de seguir.');
    expect(content).not.toContain('Puedes confirmar o mantener el valor actual.');
  });

  it('pide revisar antes de corregir el tipo de sujeto y limpia el perfil importador dependiente', async () => {
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

    expect(propuesta.paso).toBe('revisar_correccion');
    expect(propuesta.mensaje).toMatch(/tipo de sujeto/i);

    const aplicada = await conversador.agenteConversador('si', propuesta.contexto);
    expect(aplicada.contexto.datos_previos.tipo_sujeto).toBe('persona_natural');
    expect(aplicada.contexto.datos_previos.tipo_importador).toBeUndefined();
    expect(aplicada.paso).toBe('tipo_importador');
    expect(aplicada.opciones).toEqual([
      { value: 'nuevo', label: 'Persona natural - primera importacion' },
      { value: 'general', label: 'Persona natural - ya he importado antes' },
    ]);
  });

  it('pide revisar antes de corregir el canal y limpia pasos logisticos dependientes', async () => {
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

    expect(propuesta.paso).toBe('revisar_correccion');

    const content = fs.readFileSync(
      path.join(__dirname, '..', '..', 'server', 'agente-conversador.js'),
      'utf8'
    );

    expect(content).toContain("paso: 'revisar_correccion'");
    expect(content).toContain("paso_actual: 'revisar_correccion'");
    expect(content).toContain("value: 'APLICAR_CORRECCION'");
    expect(content).toContain("value: 'MANTENER_CORRECCION'");
    expect(content).toContain("intencionDetectada: 'correccion_aplicada'");
    expect(content).toContain("intencionDetectada: 'correccion_mantenida'");
    expect(content).toContain('delete actualizados.consulta_oficial;');
    expect(content).not.toContain("paso: 'confirmar_correccion'");
    expect(content).not.toContain("value: 'CONFIRMAR_CORRECCION'");
    expect(content).not.toContain("value: 'CANCELAR_CORRECCION'");
    expect(content).not.toContain("intencionDetectada: 'correccion_confirmada'");
    expect(content).not.toContain("intencionDetectada: 'correccion_rechazada'");
    expect(propuesta.mensaje).toMatch(/canal/i);

    const aplicada = await conversador.agenteConversador('si', propuesta.contexto);
    expect(aplicada.contexto.datos_previos.canal).toBe('POSTAL');
    expect(aplicada.contexto.datos_previos.flete).toBeUndefined();
    expect(aplicada.contexto.datos_previos.seguro).toBeUndefined();
    expect(aplicada.contexto.datos_previos.peso_total).toBeUndefined();
    expect(aplicada.paso).toBe('tipo_cambio');
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

  it('usa prompts y labels de incoterm e importador en ASCII limpio', () => {
    const preguntaIncoterm = conversador.generarPregunta({
      datos_previos: {
        productos: [{ cantidad: 10, producto: 'polos', descripcion: 'polos' }],
        pais_origen: 'US',
        tipo_sujeto: 'empresa',
        canal: 'COURIER',
        objetivo_calculo: 'precio_sugerido',
        precio_unitario: 5,
      },
    });

    const preguntaImportador = conversador.generarPregunta({
      datos_previos: {
        productos: [{ cantidad: 10, producto: 'polos', descripcion: 'polos' }],
        pais_origen: 'US',
        tipo_sujeto: 'empresa',
        canal: 'COURIER',
        objetivo_calculo: 'precio_sugerido',
        precio_unitario: 5,
        incoterm: 'FOB',
      },
    });

    expect(preguntaIncoterm.pregunta).toBe('Que incoterm usa el proveedor?');
    expect(preguntaIncoterm.opciones).toEqual(
      expect.arrayContaining([
        { value: 'FOB', label: 'FOB (Free on Board) - El mas comun' },
        { value: 'CIF', label: 'CIF (Cost, Insurance & Freight)' },
        { value: 'EXW', label: 'EXW (Ex Works) - En fabrica' },
      ])
    );
    expect(preguntaImportador.pregunta).toBe('Cual es el perfil de la empresa importadora?');
    expect(preguntaImportador.opciones).toEqual([
      { value: 'general', label: 'Empresa importadora recurrente' },
      { value: 'nuevo', label: 'Empresa nueva importando' },
      { value: 'buen_contribuyente', label: 'Buen Contribuyente SUNAT' },
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

  it('permite continuar cuando ya hay datos suficientes para calculo', async () => {
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

    expect(respuesta.tipo).toBe('datos_suficientes_para_calculo');
    expect(respuesta.paso).toBe('calcular');
    expect(respuesta.mensaje).toMatch(/datos necesarios/i);
    expect(respuesta.mensaje).not.toMatch(/ya puedes calcular/i);
  });

  it('usa un mensaje neutral cuando recibe datos estructurados directos', async () => {
    const respuesta = await conversador.agenteConversador('{"productos":[{"cantidad":2,"producto":"relojes"}],"pais_origen":"CN"}');

    expect(respuesta.tipo).toBe('datos_recibidos');
    expect(respuesta.contexto.paso_actual).toBe('calcular');
    expect(respuesta.mensaje).toBe('Datos recibidos. Voy a revisarlos antes del calculo.');
  });

  it('no revive el texto enfatico ni el check emoji en agente-conversador.js', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'agente-conversador.js'), 'utf8');

    expect(content).not.toContain('Listo, actualice');
    expect(content).not.toContain('✅ Datos recibidos. Procesando...');
    expect(content).not.toContain('Ya puedes calcular la cotización con los datos capturados.');
    expect(content).toContain('Datos recibidos. Voy a revisarlos antes del calculo.');
  });

  it('usa labels y recomendaciones conversacionales sin emoji fragil', () => {
    const pregunta = conversador.generarPregunta({
      datos_previos: {
        productos: [{ cantidad: 1, producto: 'router', descripcion: 'router wifi' }],
        pais_origen: 'CN',
        tipo_sujeto: 'empresa',
      },
    });
    const recomendaciones = conversador.generarRecomendaciones(
      { pais_origen: 'CN' },
      {
        items: [{ tlc: { preferencia: 100 }, ahorroTLC: 6 }],
        permisos: [{ entidad: 'MTC' }],
        etapas: { flete: { estimado: true } },
        alertas: [{ tipo: 'duda_razonable', mensaje: 'Revisar sustento de valor.' }],
        totales: { flete: 120, margenVenta: { margenPct: 15 } },
      },
    );
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'agente-conversador.js'), 'utf8');

    expect(pregunta.pregunta).toMatch(/canal usaras para importar desde cn/i);
    expect(pregunta.opciones.map((item) => item.label)).toEqual([
      'Maritimo (importacion formal)',
      'Aereo (importacion formal)',
      'Courier express (DHL, FedEx, UPS u otro)',
      'Postal (Serpost / correo postal)',
      'Postal con franquicia (bajo valor)',
    ]);
    expect(recomendaciones.map((item) => item.icono)).toEqual(
      expect.arrayContaining(['trade', 'warning', 'freight', 'review', 'margin_down'])
    );
    expect(content).toContain("icono: 'trade'");
    expect(content).toContain("icono: 'warning'");
    expect(content).toContain('Ya tengo toda la informacion. Calculamos el costo total de importacion?');
    expect(content).not.toContain('📦 Courier express');
    expect(content).not.toContain("icono: '🤝'");
    expect(content).not.toContain("icono: '⚠️'");
    expect(content).not.toContain("icono: '🚢'");
    expect(content).not.toContain("icono: '⚖️'");
    expect(content).not.toContain("icono: '📉'");
    expect(content).not.toContain("icono: '📈'");
  });

  it('usa un saludo inicial neutral y sin emoji en la primera pregunta', () => {
    const pregunta = conversador.generarPregunta({ datos_previos: {} });
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'agente-conversador.js'), 'utf8');

    expect(pregunta.paso).toBe('productos');
    expect(pregunta.pregunta).toBe('Hola. Soy tu asistente de importaciones. Que productos quieres importar?');
    expect(content).toContain('Hola. Soy tu asistente de importaciones. Que productos quieres importar?');
    expect(content).not.toContain('¡Hola! 👋 Soy tu asistente de importaciones. ¿Qué productos quieres importar?');
  });

  it('mantiene hints visibles sin mojibake ni separadores largos en costos opcionales', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'agente-conversador.js'), 'utf8');

    expect(content).toContain("hint: 'Dejalo en blanco si no lo sabes; lo estimaremos'");
    expect(content).toContain("hint: 'Dejalo en blanco; usaremos 1.5% del FOB'");
    expect(content).toContain("hint: 'Opcional; ayuda a estimar flete mas preciso'");
    expect(content).toContain("hint: 'Dejalo en blanco; usaremos el TC SUNAT actual'");
    expect(content).toContain("label: 'FOB (Free on Board) - El mas comun'");
    expect(content).toContain("label: 'EXW (Ex Works) - En fabrica'");
    expect(content).toContain("pregunta: 'Que incoterm usa el proveedor?'");
    expect(content).toContain("pregunta: 'Cual es el perfil de la empresa importadora?'");
    expect(content).toContain("label: 'Empresa importadora recurrente'");
    expect(content).toContain("label: 'Empresa nueva importando'");
    expect(content).not.toContain('Déjalo en blanco si no lo sabes — lo estimaremos');
    expect(content).not.toContain('Déjalo en blanco — usaremos 1.5% del FOB');
    expect(content).not.toContain('Opcional — ayuda a estimar flete más preciso');
    expect(content).not.toContain('Déjalo en blanco — usaremos el TC SUNAT actual');
    expect(content).not.toContain('FOB (Free on Board) — El más común');
    expect(content).not.toContain('EXW (Ex Works) — En fábrica');
    expect(content).not.toContain('Que Incoterm uso el proveedor?');
    expect(content).not.toContain('Que tipo de importador eres?');
    expect(content).not.toContain('General — Ya he importado antes');
    expect(content).not.toContain('Nuevo — Es mi primera importación');
  });

  it('mantiene encabezados y secciones del codigo fuente sin mojibake ni separadores Unicode fragiles', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'agente-conversador.js'), 'utf8');

    expect(content).toContain('// server/agente-conversador.js - Agente 0: El que interactua con el usuario');
    expect(content).toContain('// FUNCION:');
    expect(content).toContain('//   Usuario -> Agente Conversador -> Orquestador -> 16 agentes especializados -> Resultado');
    expect(content).toContain('// SISTEMA EXPERTO: Arbol de decisiones');
    expect(content).toContain('// DETECTOR DE INTENCION');
    expect(content).not.toContain('// server/agente-conversador.js — Agente 0: El que interactúa con el usuario');
    expect(content).not.toContain('// FUNCIÓN:');
    expect(content).not.toContain('Usuario → Agente Conversador → Orquestador → 16 agentes especializados → Resultado');
    expect(content).not.toContain('// SISTEMA EXPERTO: Árbol de decisiones');
    expect(content).not.toContain('// DETECTOR DE INTENCIÓN');
    expect(content).not.toContain('════════');
  });

  it('usa un tipo interno coherente con datos suficientes para pasar al calculo', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'agente-conversador.js'), 'utf8');

    expect(content).toContain("tipo: 'datos_suficientes_para_calculo'");
    expect(content).not.toContain("tipo: 'confirmacion'");
    expect(content).not.toContain("tipo: 'listo_para_calcular'");
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
