// test-agente-sunat-simple.js - Verificacion rapida del agente SUNAT

const agentesNavegacion = require('./server/agentes-navegacion');

function displayValue(value, fallback = 'N/A') {
  return value === undefined || value === null || value === '' ? fallback : value;
}

async function ejecutarPrueba() {
  console.log('PRUEBA RAPIDA DEL AGENTE NAVEGADOR SUNAT\n');
  console.log('='.repeat(60));
  console.log('\nInicializando agentes...');

  try {
    await agentesNavegacion.init();
    console.log('Inicializacion de agentes completada sin error visible\n');
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
    console.log('\nSMOKE RAPIDO DE SUNAT COMPLETADO\n');
    console.log('El resultado muestra inicializacion y lectura de estadisticas, no una revision funcional total del agente.\n');
    process.exit(0);
  } catch (error) {
    console.error('FAIL Error obteniendo estadisticas:', error.message);
    process.exit(1);
  }
}

ejecutarPrueba().catch((error) => {
  console.error('ERROR FATAL:', error.message);
  process.exit(1);
});
