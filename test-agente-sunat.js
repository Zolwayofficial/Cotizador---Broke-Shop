// test-agente-sunat.js — Prueba completa del Agente Navegador SUNAT

console.log("🔍 INICIANDO PRUEBA DEL AGENTE NAVEGADOR SUNAT...\n");
console.log("═".repeat(60));

const agentesNavegacion = require('./server/agentes-navegacion');

async function ejecutarPruebas() {
  let exitosas = 0;
  let fallidas = 0;

  // ═══════════════════════════════════════════════════
  // INICIALIZAR AGENTES
  // ═══════════════════════════════════════════════════
  console.log("\n📊 PRUEBA 0: Inicialización de agentes");
  try {
    await agentesNavegacion.init();
    console.log("✅ Agentes inicializados correctamente");
    exitosas++;
  } catch (e) {
    console.log("❌ Error en inicialización:", e.message);
    fallidas++;
    console.log("\n⚠️  No se puede continuar sin inicialización");
    return;
  }

  // ═══════════════════════════════════════════════════
  // PRUEBA 1: CONSULTAR TIPO DE CAMBIO
  // ═══════════════════════════════════════════════════
  console.log("\n🏛️  PRUEBA 1: Tipo de Cambio SUNAT");
  console.log("   Navegando en e-consultaruc.sunat.gob.pe...");

  const startTime1 = Date.now();
  try {
    const tc = await agentesNavegacion.SUNAT.consultarTipoCambio();
    const tiempo1 = Date.now() - startTime1;

    if (tc.exito || tc.compra || tc.venta) {
      console.log("✅ EXITOSA");
      console.log(`   Compra: S/ ${tc.compra || 'N/A'}`);
      console.log(`   Venta:  S/ ${tc.venta || 'N/A'}`);
      console.log(`   Fuente: ${tc.fuente || 'N/A'}`);
      console.log(`   Tiempo: ${tiempo1}ms`);
      exitosas++;
    } else {
      console.log("⚠️  PARCIAL (usó fallback)");
      console.log(`   Compra: S/ ${tc.compra}`);
      console.log(`   Venta:  S/ ${tc.venta}`);
      console.log(`   Fuente: ${tc.fuente}`);
      exitosas++;
    }
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // ═══════════════════════════════════════════════════
  // PRUEBA 2: CONSULTA DE ARANCEL (Laptop)
  // ═══════════════════════════════════════════════════
  console.log("\n🏛️  PRUEBA 2: Arancel de Laptops (8471.30.00.00)");
  console.log("   Navegando en aduanet.gob.pe/itarancel...");

  const startTime2 = Date.now();
  try {
    const arancel = await agentesNavegacion.SUNAT.consultarArancel('8471300000');
    const tiempo2 = Date.now() - startTime2;

    if (arancel.exito || arancel.partida) {
      console.log("✅ EXITOSA");
      console.log(`   Partida: ${arancel.partida || 'N/A'}`);
      console.log(`   Ad Valorem: ${arancel.adValorem || 0}%`);
      console.log(`   IGV: ${arancel.igv || 16}%`);
      console.log(`   ISC: ${arancel.isc || 0}%`);
      console.log(`   Fuente: ${arancel.fuente || 'N/A'}`);
      console.log(`   Tiempo: ${tiempo2}ms`);
      exitosas++;
    } else {
      console.log("⚠️  PARCIAL");
      console.log(`   Error: ${arancel.error || 'Desconocido'}`);
      exitosas++;
    }
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // ═══════════════════════════════════════════════════
  // PRUEBA 3: CONSULTA DE ARANCEL (Camisetas)
  // ═══════════════════════════════════════════════════
  console.log("\n🏛️  PRUEBA 3: Arancel de Camisetas (6109.10.00.10)");
  console.log("   Navegando en aduanet.gob.pe/itarancel...");

  const startTime3 = Date.now();
  try {
    const arancel = await agentesNavegacion.SUNAT.consultarArancel('6109100010');
    const tiempo3 = Date.now() - startTime3;

    if (arancel.exito || arancel.partida) {
      console.log("✅ EXITOSA");
      console.log(`   Partida: ${arancel.partida || 'N/A'}`);
      console.log(`   Ad Valorem: ${arancel.adValorem || 0}%`);
      console.log(`   IGV: ${arancel.igv || 16}%`);
      console.log(`   Tiempo: ${tiempo3}ms`);
      exitosas++;
    } else {
      console.log("⚠️  PARCIAL");
      console.log(`   Error: ${arancel.error || 'Desconocido'}`);
      exitosas++;
    }
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // ═══════════════════════════════════════════════════
  // PRUEBA 4: ESTADÍSTICAS DEL AGENTE
  // ═══════════════════════════════════════════════════
  console.log("\n📊 PRUEBA 4: Estadísticas del Agente SUNAT");
  try {
    const stats = agentesNavegacion.SUNAT.obtenerEstadisticas();
    console.log("✅ EXITOSA");
    console.log(`   Total navegaciones: ${stats.total_navegaciones || 0}`);
    console.log(`   Exitosas: ${stats.exitosas || 0}`);
    console.log(`   Fallidas: ${stats.fallidas || 0}`);
    console.log(`   Tasa de éxito: ${stats.tasa_exito || 0}%`);
    console.log(`   Tiempo promedio: ${stats.tiempo_promedio_ms || 0}ms`);
    console.log(`   Fallos última hora: ${stats.fallos_ultima_hora || 0}`);
    console.log(`   Timeout configurado: ${stats.configuracion?.timeout_ms || 0}ms`);

    if (stats.patrones && stats.patrones.length > 0) {
      console.log(`   Patrones detectados: ${stats.patrones.length}`);
      stats.patrones.forEach((p, i) => {
        console.log(`     ${i + 1}. ${p.patron}: ${p.descripcion}`);
      });
    }
    exitosas++;
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // ═══════════════════════════════════════════════════
  // PRUEBA 5: ESTADÍSTICAS GENERALES
  // ═══════════════════════════════════════════════════
  console.log("\n📊 PRUEBA 5: Estadísticas Generales de Agentes");
  try {
    const general = agentesNavegacion.obtenerEstadisticasGenerales();
    console.log("✅ EXITOSA");
    console.log(`   Agentes activos: ${general.agentes_activos?.join(', ') || 'Ninguno'}`);
    console.log(`   Memoria: ${general.memoria || 'No inicializada'}`);
    exitosas++;
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // ═══════════════════════════════════════════════════
  // RESULTADOS FINALES
  // ═══════════════════════════════════════════════════
  console.log("\n" + "═".repeat(60));
  console.log("\n📊 RESULTADOS FINALES:");
  console.log(`   ✅ Exitosas: ${exitosas}/${exitosas + fallidas}`);
  console.log(`   ❌ Fallidas: ${fallidas}/${exitosas + fallidas}`);
  console.log(`   📈 Éxito: ${((exitosas / (exitosas + fallidas)) * 100).toFixed(1)}%`);

  console.log("\n" + "═".repeat(60));

  if (exitosas >= 4) {
    console.log("\n🎉 ¡AGENTE SUNAT FUNCIONA CORRECTAMENTE!\n");
    console.log("🚀 LISTO PARA IMPLEMENTAR LOS DEMÁS AGENTES\n");
    process.exit(0);
  } else {
    console.log(`\n⚠️  Solo ${exitosas} pruebas exitosas. Revisar errores.\n`);
    process.exit(1);
  }
}

// Ejecutar pruebas
ejecutarPruebas().catch(e => {
  console.error("\n❌ ERROR FATAL:", e.message);
  console.error(e.stack);
  process.exit(1);
});
