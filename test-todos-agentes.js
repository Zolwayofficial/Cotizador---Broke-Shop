// test-todos-agentes.js - Smoke test manual de todos los agentes de navegacion

const agentesNavegacion = require('./server/agentes-navegacion');

const AGENT_KEYS = ['sunat', 'aduanet', 'vuce', 'indecopi', 'mtc', 'digesa', 'senasa', 'minam', 'produce'];

function displayValue(value, fallback = 'N/A') {
  return value === undefined || value === null || value === '' ? fallback : value;
}

async function ejecutarPruebas() {
  console.log('PRUEBA DE TODOS LOS AGENTES DE NAVEGACION\n');
  console.log('='.repeat(60));
  console.log('\nInicializando todos los agentes...');

  try {
    await agentesNavegacion.init();
    console.log('Inicializacion de agentes sin error visible\n');
  } catch (error) {
    console.error('FAIL Error en inicializacion:', error.message);
    process.exit(1);
  }

  try {
    const stats = agentesNavegacion.obtenerEstadisticasGenerales();
    console.log('Estadisticas generales:');
    console.log(`   Agentes activos: ${displayValue(stats.agentes_activos?.join(', '), 'Ninguno')}`);
    console.log(`   Memoria: ${displayValue(stats.memoria)}`);
    console.log(`   Total agentes: ${displayValue(stats.total_agentes, 0)}`);
    console.log('');

    for (const key of AGENT_KEYS) {
      const agentStats = stats[key];
      if (!agentStats || typeof agentStats !== 'object') {
        continue;
      }

      console.log(`   ${key.toUpperCase()}:`);
      console.log(`     - Total navegaciones: ${displayValue(agentStats.total_navegaciones, 0)}`);
      console.log(`     - Tasa interna marcada por el agente: ${displayValue(agentStats.tasa_exito, 0)}%`);
    }

    console.log('\nSMOKE DE NAVEGACION COMPLETADO\n');
    console.log('El resultado muestra inicializacion y lectura de estadisticas, no una revision funcional total.\n');
    process.exit(0);
  } catch (error) {
    console.error('FAIL Error obteniendo estadisticas:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

ejecutarPruebas().catch((error) => {
  console.error('ERROR FATAL:', error.message);
  process.exit(1);
});
