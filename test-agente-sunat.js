// test-agente-sunat.js - Smoke test manual del agente navegador SUNAT

const agentesNavegacion = require('./server/agentes-navegacion');

function printDivider() {
  console.log('='.repeat(60));
}

function displayValue(value, fallback = 'N/A') {
  return value === undefined || value === null || value === '' ? fallback : value;
}

async function runCase(index, testCase) {
  console.log(`\nPRUEBA ${index + 1}: ${testCase.title}`);
  if (testCase.note) {
    console.log(`   ${testCase.note}`);
  }

  const startTime = Date.now();

  try {
    const result = await testCase.run();
    const elapsedMs = Date.now() - startTime;
    console.log('RESPONDIO');
    testCase.print(result, elapsedMs);
    return true;
  } catch (error) {
    console.log(`FAIL FALLIDA: ${error.message}`);
    return false;
  }
}

const TEST_CASES = [
  {
    title: 'Inicializacion de agentes',
    run: async () => {
      await agentesNavegacion.init();
      return agentesNavegacion.obtenerEstadisticasGenerales();
    },
    print: (stats) => {
      console.log(`   Agentes activos: ${displayValue(stats.agentes_activos?.length, 0)}`);
    },
  },
  {
    title: 'Tipo de cambio SUNAT',
    note: 'Navegando en la fuente oficial configurada...',
    run: () => agentesNavegacion.SUNAT.consultarTipoCambio(),
    print: (tc, elapsedMs) => {
      console.log(`   Compra: S/ ${displayValue(tc.compra)}`);
      console.log(`   Venta:  S/ ${displayValue(tc.venta)}`);
      console.log(`   Fuente: ${displayValue(tc.fuente)}`);
      console.log(`   Tiempo: ${elapsedMs}ms`);
    },
  },
  {
    title: 'Arancel laptops 8471300000',
    note: 'Consultando tratamiento arancelario...',
    run: () => agentesNavegacion.SUNAT.consultarArancel('8471300000'),
    print: (arancel, elapsedMs) => {
      console.log(`   Partida: ${displayValue(arancel.partida)}`);
      console.log(`   Ad Valorem: ${displayValue(arancel.adValorem, 0)}%`);
      console.log(`   IGV: ${displayValue(arancel.igv, 16)}%`);
      console.log(`   ISC: ${displayValue(arancel.isc, 0)}%`);
      console.log(`   Tiempo: ${elapsedMs}ms`);
    },
  },
  {
    title: 'Arancel camisetas 6109100010',
    note: 'Consultando otra partida para contraste...',
    run: () => agentesNavegacion.SUNAT.consultarArancel('6109100010'),
    print: (arancel, elapsedMs) => {
      console.log(`   Partida: ${displayValue(arancel.partida)}`);
      console.log(`   Ad Valorem: ${displayValue(arancel.adValorem, 0)}%`);
      console.log(`   IGV: ${displayValue(arancel.igv, 16)}%`);
      console.log(`   Tiempo: ${elapsedMs}ms`);
    },
  },
  {
    title: 'Estadisticas del agente SUNAT',
    run: () => agentesNavegacion.SUNAT.obtenerEstadisticas(),
    print: (stats) => {
      console.log(`   Total navegaciones: ${displayValue(stats.total_navegaciones, 0)}`);
      console.log(`   Marcadas favorables por el agente: ${displayValue(stats.exitosas, 0)}`);
      console.log(`   Fallidas: ${displayValue(stats.fallidas, 0)}`);
      console.log(`   Tasa interna marcada por el agente: ${displayValue(stats.tasa_exito, 0)}%`);
      console.log(`   Tiempo promedio: ${displayValue(stats.tiempo_promedio_ms, 0)}ms`);
    },
  },
  {
    title: 'Estadisticas generales de agentes',
    run: () => agentesNavegacion.obtenerEstadisticasGenerales(),
    print: (stats) => {
      console.log(`   Agentes activos: ${displayValue(stats.agentes_activos?.join(', '), 'Ninguno')}`);
      console.log(`   Memoria: ${displayValue(stats.memoria)}`);
      console.log(`   Total agentes: ${displayValue(stats.total_agentes, 0)}`);
    },
  },
];

async function ejecutarPruebas() {
  console.log('INICIANDO PRUEBA DEL AGENTE NAVEGADOR SUNAT...\n');
  printDivider();

  let respondieron = 0;

  for (const [index, testCase] of TEST_CASES.entries()) {
    if (await runCase(index, testCase)) {
      respondieron += 1;
    }
  }

  const total = TEST_CASES.length;
  const fallidas = total - respondieron;

  console.log(`\n${'='.repeat(60)}`);
  console.log('\nRESULTADOS FINALES:');
  console.log(`   Respondieron: ${respondieron}/${total}`);
  console.log(`   FAIL Fallidas: ${fallidas}/${total}`);
  console.log(`   Respuesta visible: ${((respondieron / total) * 100).toFixed(1)}%`);

  if (fallidas === 0) {
    console.log('\nSMOKE MANUAL DE SUNAT COMPLETADO\n');
    console.log('La bateria manual respondio sin errores visibles, pero eso no sustituye una revision funcional total de la fuente.\n');
    process.exit(0);
  }

  console.log(`\n${fallidas} prueba(s) fallida(s). Revisar salida anterior.\n`);
  process.exit(1);
}

ejecutarPruebas().catch((error) => {
  console.error('\nERROR FATAL:', error.message);
  console.error(error.stack);
  process.exit(1);
});
