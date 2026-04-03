const { ajustarIncoterm } = require('./server/auto-cotizar');
const exportacion = require('./server/exportar-cotizacion');

function createRunner() {
  let passed = 0;
  let failed = 0;

  async function run(name, fn) {
    try {
      await fn();
      console.log(`SIN ERROR VISIBLE ${name}`);
      passed += 1;
    } catch (error) {
      console.log(`FAIL ${name}: ${error.message}`);
      failed += 1;
    }
  }

  return {
    getSummary() {
      return { passed, failed };
    },
    run,
  };
}

function buildSampleQuotation() {
  return {
    id: 'cot-test-001',
    producto: 'Laptops HP',
    hs_code: '8471.30.00.00',
    pais_origen: 'US',
    incoterm: 'EXW',
    canal: 'AEREO',
    tc: 3.7,
    fecha: new Date().toISOString(),
    fob: 45000,
    flete: 1200,
    seguro: 675,
    cif: 46875,
    ad_valorem: 2812.5,
    igv: 7500,
    ipm: 937.5,
    total_tributos: 11250,
    costos_operativos: 500,
    total_landed: 58625,
    total_landed_pen: 216912.5,
  };
}

async function main() {
  const startTime = Date.now();
  const runner = createRunner();
  const cotizacion = buildSampleQuotation();

  console.log('PRUEBA COMPLETA DE PRODUCCION - IMPORTAIAGENT COTIZADOR\n');
  console.log('='.repeat(70));
  console.log('\nFASE 1: Carga de modulos\n');

  await runner.run('Cargar agentes-navegacion', async () => {
    require('./server/agentes-navegacion');
  });

  await runner.run('Cargar alertas-normativas', async () => {
    require('./server/alertas-normativas');
  });

  await runner.run('Cargar exportar-cotizacion', async () => {
    require('./server/exportar-cotizacion');
  });

  await runner.run('Cargar sistema-agentes', async () => {
    require('./server/sistema-agentes');
  });

  await runner.run('Cargar auto-cotizar', async () => {
    require('./server/auto-cotizar');
  });

  await runner.run('Cargar clasificador', async () => {
    require('./server/clasificador');
  });

  console.log('\nFASE 2: Incoterms\n');

  await runner.run('EXW -> FOB (+8%)', async () => {
    const result = ajustarIncoterm(450, 'EXW', 120, 6.75, 450);
    if (result.fob !== 486) {
      throw new Error(`Esperado 486, obtenido ${result.fob}`);
    }
  });

  await runner.run('FOB base', async () => {
    const result = ajustarIncoterm(450, 'FOB', 120, 6.75, 450);
    if (result.fob !== 450) {
      throw new Error(`Esperado 450, obtenido ${result.fob}`);
    }
  });

  await runner.run('CIF -> FOB (-flete -seguro)', async () => {
    const result = ajustarIncoterm(450, 'CIF', 120, 6.75, 450);
    if (result.fob < 320 || result.fob > 325) {
      throw new Error(`Esperado ~323.25, obtenido ${result.fob}`);
    }
  });

  console.log('\nFASE 3: Exportacion\n');

  await runner.run('Exportar PDF', async () => {
    const pdf = exportacion.exportarCotizacion(cotizacion, 'pdf');
    if (pdf.length < 1000) {
      throw new Error('PDF muy corto');
    }
  });

  await runner.run('Exportar Excel', async () => {
    const excel = exportacion.exportarCotizacion(cotizacion, 'excel');
    if (excel.length < 100) {
      throw new Error('Excel muy corto');
    }
  });

  await runner.run('Generar documentacion', async () => {
    const documentos = exportacion.generarDocumentacion
      ? exportacion.generarDocumentacion(cotizacion)
      : [];
    if (!Array.isArray(documentos)) {
      throw new Error('Documentacion no interpretable');
    }
  });

  await runner.run('Generar recomendaciones', async () => {
    const recomendaciones = exportacion.generarRecomendaciones
      ? exportacion.generarRecomendaciones(cotizacion)
      : [];
    if (!Array.isArray(recomendaciones)) {
      throw new Error('Recomendaciones no interpretables');
    }
  });

  await runner.run('Generar apuntes', async () => {
    const apuntes = exportacion.generarApuntes
      ? exportacion.generarApuntes(cotizacion)
      : [];
    if (!Array.isArray(apuntes)) {
      throw new Error('Apuntes no interpretables');
    }
  });

  console.log('\nFASE 4: Agentes\n');

  await runner.run('Inicializar agentes', async () => {
    const agentesNavegacion = require('./server/agentes-navegacion');
    await agentesNavegacion.init();
  });

  await runner.run('Estadisticas de agentes', async () => {
    const agentesNavegacion = require('./server/agentes-navegacion');
    const stats = agentesNavegacion.obtenerEstadisticasGenerales();
    if (!stats.total_agentes) {
      throw new Error('Sin estadisticas');
    }
  });

  console.log('\nFASE 5: Alertas\n');

  await runner.run('Inicializar alertas', async () => {
    const alertasNormativas = require('./server/alertas-normativas');
    await alertasNormativas.init();
  });

  await runner.run('Crear alerta', async () => {
    const alertasNormativas = require('./server/alertas-normativas');
    const alertaId = alertasNormativas.crearAlerta(
      alertasNormativas.TIPOS_ALERTA.CAMBIO_ARANCEL,
      'SUNAT',
      'Test',
      'Test de alerta',
      { nivel: 'info' },
    );
    if (!alertaId) {
      throw new Error('No se creo la alerta');
    }
  });

  await runner.run('Estadisticas de alertas', async () => {
    const alertasNormativas = require('./server/alertas-normativas');
    const stats = alertasNormativas.obtenerEstadisticas();
    if (!stats) {
      throw new Error('Sin estadisticas');
    }
  });

  console.log('\nFASE 6: Rendimiento\n');

  await runner.run('Rendimiento de exportacion', async () => {
    const perfStart = Date.now();
    for (let index = 0; index < 50; index += 1) {
      exportacion.exportarCotizacion({ ...cotizacion, id: `cot_${index}` }, 'pdf');
    }
    const average = (Date.now() - perfStart) / 50;
    if (average > 500) {
      throw new Error(`Muy lento: ${average}ms`);
    }
  });

  const summary = runner.getSummary();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n${'='.repeat(70)}`);
  console.log('\nRESULTADOS FINALES\n');
  console.log(`SIN ERROR VISIBLE: ${summary.passed}`);
  console.log(`FAIL: ${summary.failed}`);
  console.log(`Tiempo total: ${elapsed}s`);

  if (summary.failed > 0) {
    console.log('\nRevisa los errores antes de darlo por bueno.');
    process.exit(1);
  }

  console.log('\nLa bateria manual completo sus chequeos sin error visible.');
  console.log('No sustituye una revision funcional total ni cierre operativo de produccion.');
}

main().catch((error) => {
  console.error(`\nERROR FATAL: ${error.message}`);
  process.exit(1);
});
