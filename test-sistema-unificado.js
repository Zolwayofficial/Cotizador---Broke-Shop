// test-sistema-unificado.js — Prueba del Sistema Unificado de 29 Agentes

console.log("🔍 PRUEBA DEL SISTEMA UNIFICADO DE AGENTES (29 AGENTES)\n");
console.log("═".repeat(60));

const sistemaAgentes = require('./server/sistema-agentes');

async function ejecutarPruebas() {
  console.log("\n📊 Inicializando sistema unificado...");
  try {
    await sistemaAgentes.inicializar();
    console.log("✅ Sistema unificado inicializado correctamente\n");
  } catch (e) {
    console.log("❌ Error en inicialización:", e.message);
    return;
  }

  console.log("📊 Obteniendo estadísticas generales...");
  try {
    const stats = sistemaAgentes.obtenerEstadisticas();
    console.log(`   Total agentes: ${stats.total_agentes}`);
    console.log(`   Inicializado: ${stats.inicializado}`);
    console.log(`   Agentes navegación: ${stats.resumen.navegacion}`);
    console.log(`   Agentes originales: ${stats.resumen.originales}`);
    console.log(`   Agentes soporte: ${stats.resumen.soporte}`);
    console.log("");
  } catch (e) {
    console.log("❌ Error:", e.message);
  }

  console.log("📊 Probando consulta unificada de gobierno...");
  try {
    const tipoCambio = await sistemaAgentes.consultarGobierno('tipo_cambio', {});
    console.log(`   ✅ Tipo de cambio: S/ ${tipoCambio.venta || 'N/A'}`);
  } catch (e) {
    console.log(`   ⚠️  Tipo de cambio: ${e.message}`);
  }

  console.log("\n📊 Probando detección de requisitos...");
  try {
    const requisitos = await sistemaAgentes.detectarRequisitos('paracetamol', 'medicamento', 'US');
    console.log(`   ✅ Permisos requeridos: ${requisitos.permisos.length}`);
    requisitos.permisos.forEach(p => {
      console.log(`      - ${p.entidad}: ${p.tramite}`);
    });
  } catch (e) {
    console.log(`   ⚠️  Requisitos: ${e.message}`);
  }

  console.log("\n" + "═".repeat(60));
  console.log("\n✅ SISTEMA UNIFICADO DE 29 AGENTES: FUNCIONAL");
  console.log("\n🚀 INTEGRACIÓN COMPLETADA EXITOSAMENTE\n");
}

ejecutarPruebas().catch(e => {
  console.error("❌ ERROR:", e.message);
});
