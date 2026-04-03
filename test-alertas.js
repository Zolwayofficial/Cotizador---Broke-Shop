// test-alertas.js - Smoke test manual del sistema de alertas normativas

const alertasNormativas = require('./server/alertas-normativas');

function printDivider() {
  console.log('='.repeat(60));
}

async function ejecutarPruebas() {
  console.log('PRUEBA DEL SISTEMA DE ALERTAS NORMATIVAS\n');
  printDivider();

  console.log('\nInicializando sistema de alertas...');
  try {
    await alertasNormativas.init();
    console.log('Inicializacion del sistema completada sin error visible\n');
  } catch (error) {
    console.error('FAIL Error en inicializacion:', error.message);
    process.exit(1);
  }

  console.log('Creando alertas de prueba...');
  const alertIds = [
    alertasNormativas.crearAlerta(
      alertasNormativas.TIPOS_ALERTA.CAMBIO_ARANCEL,
      'SUNAT',
      'Cambio de Ad Valorem detectado',
      'Partida 8471.30.00.00: Ad Valorem cambio de 0% a 6%',
      {
        nivel: alertasNormativas.NIVELES_ALERTA.ALTO,
        partida_afectada: '8471.30.00.00',
        pais_afectado: 'CN',
      }
    ),
    alertasNormativas.crearAlerta(
      alertasNormativas.TIPOS_ALERTA.NUEVA_RESTRICCION,
      'DIGESA',
      'Nueva restriccion sanitaria',
      'Productos farmaceuticos requieren registro sanitario adicional',
      {
        nivel: alertasNormativas.NIVELES_ALERTA.MEDIO,
        pais_afectado: 'US',
      }
    ),
    alertasNormativas.crearAlerta(
      alertasNormativas.TIPOS_ALERTA.ANTIDUMPING_VENCE,
      'INDECOPI',
      'Antidumping por vencer',
      'Camisetas de algodon (China) - Antidumping 5.51% vence en 30 dias',
      {
        nivel: alertasNormativas.NIVELES_ALERTA.CRITICO,
        partida_afectada: '6109.10.00.10',
        pais_afectado: 'CN',
        fecha_vigencia: new Date(Date.now() + 30 * 86400000).toISOString(),
      }
    ),
  ];
  console.log(`${alertIds.length} alertas de prueba creadas para el smoke\n`);

  const stats = alertasNormativas.obtenerEstadisticas();
  console.log('Estadisticas:');
  console.log(`   Total alertas: ${stats.total}`);
  console.log(`   No leidas: ${stats.noLeidas}`);
  console.log(`   Criticas: ${stats.criticas}`);

  const noLeidas = alertasNormativas.obtenerAlertasNoLeidas();
  console.log(`\nAlertas no leidas: ${noLeidas.length}`);
  noLeidas.forEach((alerta, index) => {
    console.log(`   ${index + 1}. [${String(alerta.nivel || '').toUpperCase()}] ${alerta.titulo}`);
    console.log(`      Entidad: ${alerta.entidad}`);
    console.log(`      ${alerta.descripcion}`);
  });

  const paginadas = alertasNormativas.obtenerAlertas(1, 10, {});
  console.log('\nPaginacion:');
  console.log(`   Pagina: ${paginadas.pagination.page}/${paginadas.pagination.totalPages}`);
  console.log(`   Total: ${paginadas.pagination.total}`);

  const suscripcionId = alertasNormativas.suscribirAlertas(
    'test@example.com',
    ['cambio_arancel', 'antidumping_vence']
  );

  console.log('\nSuscripcion:');
  console.log(`   ID: ${suscripcionId}`);

  printDivider();
  console.log('\nSMOKE DE ALERTAS NORMATIVAS COMPLETADO\n');
  console.log('El resultado muestra inicializacion, creacion y consulta basica de alertas, no cobertura funcional total.\n');
}

ejecutarPruebas().catch((error) => {
  console.error('ERROR FATAL:', error.message);
  console.error(error.stack);
  process.exit(1);
});
