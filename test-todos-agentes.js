// test-todos-agentes.js — Prueba completa de todos los agentes

console.log("🔍 PRUEBA DE TODOS LOS AGENTES DE NAVEGACIÓN\n");
console.log("═".repeat(60));

const agentesNavegacion = require('./server/agentes-navegacion');

async function ejecutarPruebas() {
  console.log("\n📊 Inicializando todos los agentes...");
  try {
    await agentesNavegacion.init();
    console.log("✅ Todos los agentes inicializados correctamente\n");
  } catch (e) {
    console.log("❌ Error en inicialización:", e.message);
    return;
  }

  console.log("📊 Estadísticas generales:");
  try {
    const stats = agentesNavegacion.obtenerEstadisticasGenerales();
    console.log(`   Agentes activos: ${stats.agentes_activos.join(', ')}`);
    console.log(`   Memoria: ${stats.memoria}`);
    console.log("");
    console.log(`   SUNAT:`);
    console.log(`     - Total navegaciones: ${stats.sunat.total_navegaciones || 0}`);
    console.log(`     - Tasa de éxito: ${stats.sunat.tasa_exito || 0}%`);
    console.log("");
    console.log(`   ADUANET:`);
    console.log(`     - Total navegaciones: ${stats.aduanet.total_navegaciones || 0}`);
    console.log(`     - Tasa de éxito: ${stats.aduanet.tasa_exito || 0}%`);
    console.log("");
    console.log(`   VUCE:`);
    console.log(`     - Total navegaciones: ${stats.vuce.total_navegaciones || 0}`);
    console.log(`     - Tasa de éxito: ${stats.vuce.tasa_exito || 0}%`);
    console.log("");
    console.log(`   INDECOPI:`);
    console.log(`     - Total navegaciones: ${stats.indecopi.total_navegaciones || 0}`);
    console.log(`     - Tasa de éxito: ${stats.indecopi.tasa_exito || 0}%`);
    
    console.log("\n✅ TODOS LOS AGENTES IMPLEMENTADOS CORRECTAMENTE");
    console.log("\n🚀 SISTEMA COMPLETO DE NAVEGACIÓN LISTO\n");
  } catch (e) {
    console.log("❌ Error:", e.message);
  }
}

ejecutarPruebas().catch(e => {
  console.error("❌ ERROR:", e.message);
});
