const exportador = require('../../server/exportar-cotizacion');

describe('exportar-cotizacion', () => {
  test('no muta la cotizacion original al exportar', () => {
    const cotizacion = {
      producto: 'Celular',
      pais_origen: 'China',
      hs_code: '8517.13.00.00',
      fecha: '2026-03-24T00:00:00.000Z',
    };

    exportador.exportarCotizacion(cotizacion, 'pdf');

    expect(cotizacion.documentos).toBeUndefined();
    expect(cotizacion.recomendaciones).toBeUndefined();
    expect(cotizacion.apuntes).toBeUndefined();
  });

  test('genera documentacion con hs numerico y pais normalizado', () => {
    const documentos = exportador.generarDocumentacion({
      hs_code: 6109100000,
      pais_origen: 'China',
    });

    expect(documentos.some((doc) => doc.nombre.includes('Certificado de Origen'))).toBe(true);
    expect(documentos.some((doc) => doc.nombre.includes('No Produccion Forzada'))).toBe(true);
  });

  test('usa wording aplicable en sanidad y antidumping del exportador', () => {
    const content = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'server', 'exportar-cotizacion.js'),
      'utf8'
    );

    expect(content).toContain('Registro sanitario aplicable al producto');
    expect(content).toContain('verifica medidas aplicables en INDECOPI');
    expect(content).not.toContain('Registro sanitario vigente del producto');
    expect(content).not.toContain('verifica medidas vigentes en INDECOPI');
  });

  test('genera apuntes y recomendaciones con campos normalizados', () => {
    const apuntes = exportador.generarApuntes({
      tipo_importador: 'nuevo',
      canal: 'maritimo',
      tc: '3,81',
    });
    const recomendaciones = exportador.generarRecomendaciones({
      incoterm: 'exw',
      pais_origen: 'cn',
      ahorro_tlc: '15,5',
      tributos_pct: '30,2',
      alertas: [{ tipo: 'antidumping', mensaje: 'vigente' }],
    });

    expect(apuntes.map((item) => item.titulo)).toEqual(expect.arrayContaining([
      'Primera Importacion',
      'Importacion Maritima',
      'Tipo de Cambio Alto',
    ]));
    expect(recomendaciones.some((item) => item.includes('EXW') || item.includes('FOB'))).toBe(true);
    expect(recomendaciones.some((item) => item.includes('antidumping'))).toBe(true);
  });

  test('normaliza miles, aliases de canal y formato con mayusculas', () => {
    const apuntes = exportador.generarApuntes({
      canal: 'AEREO_FORMAL',
      tc: '1.200,50',
    });
    const csv = exportador.exportarCotizacion({
      producto: 'Router',
      total_landed_pen: '1.200,50',
    }, ' CSV ');

    expect(apuntes.map((item) => item.titulo)).toContain('Importacion Aerea');
    expect(csv).toContain('"TOTAL EN SOLES","S/ 1200.50","-"');
  });

  test('usa identidad visual coherente en el HTML exportado', () => {
    const pdf = exportador.exportarCotizacion({
      producto: 'Router',
      total_landed_pen: 1500,
    }, 'pdf');

    expect(pdf).toContain('Generado por ImportAIAgent Cotizador');
    expect(pdf).not.toContain('Generado por Cotizador de Importacion Peru');
  });
});
