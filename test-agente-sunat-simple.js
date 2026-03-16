// test-agente-sunat-simple.js — Prueba simplificada del Agente SUNAT

console.log("🔍 PRUEBA RÁPIDA DEL AGENTE NAVEGADOR SUNAT\n");
console.log("═".repeat(60));

const agentesNavegacion = require('./server/agentes-navegacion');

async function ejecutarPrueba() {
  console.log("\n📊 Inicializando agentes...");
  try {
    await agentesNavegacion.init();
    console.log("✅ Agentes inicializados correctamente\n");
  } catch (e) {
    console.log("❌ Error en inicialización:", e.message);
    return;
  }

  console.log("📊 Estadísticas del agente:");
  try {
    const stats = agentesNavegacion.obtenerEstadisticasGenerales();
    console.log("   Agentes activos:", stats.agentes_activos.join(', '));
    console.log("   Memoria:", stats.memoria);
    console.log("\n✅ AGENTE SUNAT IMPLEMENTADO CORRECTAMENTE");
    console.log("\n🚀 LISTO PARA IMPLEMENTAR LOS DEMÁS AGENTES\n");
  } catch (e) {
    console.log("❌ Error:", e.message);
  }
}

ejecutarPrueba().catch(e => {
  console.error("❌ ERROR:", e.message);
});
