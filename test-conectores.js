// test-conectores.js - Smoke test manual de conectores de gobierno

const conectores = require('./server/conectores-gobierno');

function printDivider() {
  console.log('='.repeat(60));
}

function displayValue(value, fallback = 'N/A') {
  return value === undefined || value === null || value === '' ? fallback : value;
}

async function runCase(index, testCase) {
  console.log(`\nPRUEBA ${index + 1}: ${testCase.title}`);

  try {
    const result = await testCase.run();
    console.log('RESPONDIO');
    testCase.print(result);
    return true;
  } catch (error) {
    console.log(`FAIL FALLIDA: ${error.message}`);
    return false;
  }
}

const TEST_CASES = [
  {
    title: 'SUNAT - Tipo de cambio',
    run: () => conectores.SUNAT.consultarTipoCambio(),
    print: (tc) => {
      console.log(`   Compra: S/ ${displayValue(tc.compra)}`);
      console.log(`   Venta:  S/ ${displayValue(tc.venta)}`);
      console.log(`   Fuente: ${displayValue(tc.fuente)}`);
    },
  },
  {
    title: 'SUNAT - Arancel de partida 8471300000',
    run: () => conectores.SUNAT.consultarArancel('8471300000'),
    print: (arancel) => {
      console.log(`   Ad Valorem: ${displayValue(arancel.adValorem, 0)}%`);
      console.log(`   IGV: ${displayValue(arancel.igv, 16)}%`);
      console.log(`   Fuente: ${displayValue(arancel.fuente)}`);
    },
  },
  {
    title: 'ADUANET - Arancel en tiempo real 6109100010',
    run: () => conectores.ADUANET.consultarArancelTiempoReal('6109100010'),
    print: (arancel) => {
      console.log(`   Ad Valorem: ${displayValue(arancel.adValorem, 0)}%`);
      console.log(`   IGV: ${displayValue(arancel.igv, 16)}%`);
      console.log(`   Fuente: ${displayValue(arancel.fuente)}`);
    },
  },
  {
    title: 'VUCE - Restricciones 8471300000 / CN',
    run: () => conectores.VUCE.consultarRestricciones('8471300000', 'CN'),
    print: (restricciones) => {
      console.log(`   Restricciones: ${displayValue(restricciones.restricciones?.length, 0)}`);
      console.log(`   Permisos: ${displayValue(restricciones.permisos_requeridos?.length, 0)}`);
    },
  },
  {
    title: 'MTC - Homologacion router Cisco',
    run: () => conectores.MTC.consultarHomologacion('router', 'Cisco', 'E4200'),
    print: (homologacion) => {
      console.log(`   Requiere homologacion: ${displayValue(homologacion.requiereHomologacion, false)}`);
      console.log(`   Estado: ${displayValue(homologacion.estado)}`);
    },
  },
  {
    title: 'DIGESA - Registro sanitario',
    run: () => conectores.DIGESA.consultarRegistroSanitario('paracetamol', 'Bayer'),
    print: (registro) => {
      console.log(`   Estado: ${displayValue(registro.estado)}`);
    },
  },
  {
    title: 'SENASA - Permiso fitosanitario',
    run: () => conectores.SENASA.consultarPermisoFitosanitario('manzanas', 'US'),
    print: (permiso) => {
      console.log(`   Requiere permiso: ${displayValue(permiso.requierePermiso, false)}`);
      console.log(`   Tipo: ${displayValue(permiso.tipoPermiso)}`);
    },
  },
  {
    title: 'MINAM - Permiso ambiental',
    run: () => conectores.MINAM.consultarPermisoAmbiental('quimicos'),
    print: (permiso) => {
      console.log(`   Requiere permiso: ${displayValue(permiso.requierePermiso, false)}`);
    },
  },
  {
    title: 'PRODUCE - Permiso de pesca',
    run: () => conectores.PRODUCE.consultarPermisoPesca('conservas_de_atun'),
    print: (permiso) => {
      console.log(`   Requiere permiso: ${displayValue(permiso.requierePermiso, false)}`);
      console.log(`   Tipo: ${displayValue(permiso.tipoPermiso)}`);
    },
  },
  {
    title: 'INDECOPI - Antidumping',
    run: () => conectores.INDECOPI.consultarAntidumping('camisetas', 'CN'),
    print: (antidumping) => {
      console.log(`   Tiene antidumping: ${displayValue(antidumping.tieneAntidumping, false)}`);
      console.log(`   Tasa: ${displayValue(antidumping.tasa, 0)}%`);
    },
  },
  {
    title: 'Consulta integrada completa',
    run: () => conectores.consultarTodo('8471300000', 'laptop', 'CN'),
    print: (resultado) => {
      console.log(`   Arancel: ${displayValue(resultado.arancel?.fuente)}`);
      console.log(`   Tipo de cambio: ${displayValue(resultado.tipo_cambio?.venta)}`);
      console.log(`   Restricciones: ${displayValue(resultado.restricciones?.partida)}`);
      console.log(`   Antidumping: ${displayValue(resultado.antidumping?.tieneAntidumping, false)}`);
    },
  },
];

async function ejecutarPruebas() {
  console.log('INICIANDO PRUEBA DE CONECTORES DE GOBIERNO\n');
  console.log(`Total de pruebas: ${TEST_CASES.length}\n`);
  printDivider();

  let respondieron = 0;

  for (const [index, testCase] of TEST_CASES.entries()) {
    if (await runCase(index, testCase)) {
      respondieron += 1;
    }
  }

  const fallidas = TEST_CASES.length - respondieron;
  const stats = conectores.getCacheStats();

  console.log(`\n${'='.repeat(60)}`);
  console.log('\nRESULTADOS FINALES:');
  console.log(`   Respondieron: ${respondieron}/${TEST_CASES.length}`);
  console.log(`   FAIL Fallidas: ${fallidas}/${TEST_CASES.length}`);
  console.log(`   Respuesta visible: ${((respondieron / TEST_CASES.length) * 100).toFixed(1)}%`);
  console.log('\nCACHE:');
  console.log(`   Entradas: ${displayValue(stats.total_entries, 0)}`);

  if (fallidas === 0) {
    console.log('\nSMOKE MANUAL DE CONECTORES COMPLETADO\n');
    console.log('La bateria manual respondio sin errores visibles, pero no certifica cobertura funcional total de todas las fuentes.\n');
    process.exit(0);
  }

  console.log(`\n${fallidas} prueba(s) fallida(s)\n`);
  process.exit(1);
}

ejecutarPruebas().catch((error) => {
  console.error('\nERROR FATAL:', error.message);
  console.error(error.stack);
  process.exit(1);
});
