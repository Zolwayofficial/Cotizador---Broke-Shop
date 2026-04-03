// test-sistema-unificado.js - Smoke test del sistema unificado de agentes

const sistemaAgentes = require('./server/sistema-agentes');

function displayValue(value, fallback = 'N/A') {
  return value === undefined || value === null || value === '' ? fallback : value;
}

async function ejecutarPruebas() {
  console.log('PRUEBA DEL SISTEMA UNIFICADO DE AGENTES\n');
  console.log('='.repeat(60));
  console.log('\nInicializando sistema unificado...');

  try {
    await sistemaAgentes.inicializar();
    console.log('Inicializacion del sistema unificado completada sin error visible\n');
  } catch (error) {
    console.error('FAIL Error en inicializacion:', error.message);
    process.exit(1);
  }

  try {
    const stats = sistemaAgentes.obtenerEstadisticas();
    console.log('Estadisticas generales:');
    console.log(`   Total agentes: ${displayValue(stats.total_agentes, 0)}`);
    console.log(`   Inicializado: ${displayValue(stats.inicializado, false)}`);
    console.log(`   Navegacion: ${displayValue(stats.resumen?.navegacion, 0)}`);
    console.log(`   Originales: ${displayValue(stats.resumen?.originales, 0)}`);
    console.log(`   Soporte: ${displayValue(stats.resumen?.soporte, 0)}`);
    console.log('');

    const tipoCambio = await sistemaAgentes.consultarGobierno('tipo_cambio', {});
    console.log(`   Tipo de cambio: S/ ${displayValue(tipoCambio.venta)}`);

    const requisitos = await sistemaAgentes.detectarRequisitos('paracetamol', 'medicamento', 'US');
    console.log(`   Permisos requeridos: ${displayValue(requisitos.permisos?.length, 0)}`);
    (requisitos.permisos || []).forEach((permiso) => {
      console.log(`      - ${permiso.entidad}: ${permiso.tramite}`);
    });

    console.log('\nSMOKE DEL SISTEMA UNIFICADO COMPLETADO\n');
    console.log('El resultado muestra inicializacion y consultas basicas, no cobertura funcional total de todos los agentes.\n');
    process.exit(0);
  } catch (error) {
    console.error('FAIL Error en pruebas del sistema:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

ejecutarPruebas().catch((error) => {
  console.error('ERROR FATAL:', error.message);
  console.error(error.stack);
  process.exit(1);
});
