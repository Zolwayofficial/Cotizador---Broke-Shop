// test-conectores.js — Prueba completa de todos los conectores de gobierno

console.log("🔍 INICIANDO PRUEBA DE CONECTORES DE GOBIERNO...\n");

const conectores = require('./server/conectores-gobierno');

async function ejecutarPruebas() {
  let exitosas = 0;
  let fallidas = 0;
  const total = 11;

  console.log(`📊 Total de pruebas: ${total}\n`);
  console.log("═".repeat(60));

  // ═══════════════════════════════════════════════════
  // PRUEBA 1: SUNAT — Tipo de Cambio
  // ═══════════════════════════════════════════════════
  console.log("\n🏛️  PRUEBA 1: SUNAT — Tipo de Cambio");
  try {
    const tc = await conectores.SUNAT.consultarTipoCambio();
    console.log("✅ EXITOSA");
    console.log(`   Compra: S/ ${tc.compra}`);
    console.log(`   Venta:  S/ ${tc.venta}`);
    console.log(`   Fuente: ${tc.fuente}`);
    exitosas++;
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // ═══════════════════════════════════════════════════
  // PRUEBA 2: SUNAT — Arancel de Partida
  // ═══════════════════════════════════════════════════
  console.log("\n🏛️  PRUEBA 2: SUNAT — Arancel de Partida (8471.30.00.00)");
  try {
    const arancel = await conectores.SUNAT.consultarArancel('8471300000');
    console.log("✅ EXITOSA");
    console.log(`   Ad Valorem: ${arancel.adValorem || 0}%`);
    console.log(`   IGV: ${arancel.igv || 16}%`);
    console.log(`   Fuente: ${arancel.fuente}`);
    exitosas++;
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // ═══════════════════════════════════════════════════
  // PRUEBA 3: ADUANET — Arancel en Tiempo Real
  // ═══════════════════════════════════════════════════
  console.log("\n🏛️  PRUEBA 3: ADUANET — Arancel en Tiempo Real (6109.10.00.10)");
  try {
    const arancel = await conectores.ADUANET.consultarArancelTiempoReal('6109100010');
    console.log("✅ EXITOSA");
    console.log(`   Ad Valorem: ${arancel.adValorem || 0}%`);
    console.log(`   IGV: ${arancel.igv || 16}%`);
    console.log(`   Fuente: ${arancel.fuente}`);
    exitosas++;
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // ═══════════════════════════════════════════════════
  // PRUEBA 4: VUCE — Restricciones
  // ═══════════════════════════════════════════════════
  console.log("\n🏛️  PRUEBA 4: VUCE — Restricciones (8471.30.00.00, China)");
  try {
    const restricciones = await conectores.VUCE.consultarRestricciones('8471300000', 'CN');
    console.log("✅ EXITOSA");
    console.log(`   Restricciones: ${restricciones.restricciones?.length || 0}`);
    console.log(`   Permisos: ${restricciones.permisos_requeridos?.length || 0}`);
    exitosas++;
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // ═══════════════════════════════════════════════════
  // PRUEBA 5: MTC — Homologación
  // ═══════════════════════════════════════════════════
  console.log("\n🏛️  PRUEBA 5: MTC — Homologación (Router, Cisco)");
  try {
    const homologacion = await conectores.MTC.consultarHomologacion('router', 'Cisco', 'E4200');
    console.log("✅ EXITOSA");
    console.log(`   Requiere homologación: ${homologacion.requiereHomologacion}`);
    console.log(`   Estado: ${homologacion.estado}`);
    exitosas++;
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // ═══════════════════════════════════════════════════
  // PRUEBA 6: DIGESA — Registro Sanitario
  // ═══════════════════════════════════════════════════
  console.log("\n🏛️  PRUEBA 6: DIGESA — Registro Sanitario (Paracetamol)");
  try {
    const registro = await conectores.DIGESA.consultarRegistroSanitario('paracetamol', 'Bayer');
    console.log("✅ EXITOSA");
    console.log(`   Estado: ${registro.estado}`);
    exitosas++;
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // ═══════════════════════════════════════════════════
  // PRUEBA 7: SENASA — Permiso Fitosanitario
  // ═══════════════════════════════════════════════════
  console.log("\n🏛️  PRUEBA 7: SENASA — Permiso Fitosanitario (Manzanas, USA)");
  try {
    const permiso = await conectores.SENASA.consultarPermisoFitosanitario('manzanas', 'US');
    console.log("✅ EXITOSA");
    console.log(`   Requiere permiso: ${permiso.requierePermiso}`);
    console.log(`   Tipo: ${permiso.tipoPermiso}`);
    exitosas++;
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // ═══════════════════════════════════════════════════
  // PRUEBA 8: MINAM — Permiso Ambiental
  // ═══════════════════════════════════════════════════
  console.log("\n🏛️  PRUEBA 8: MINAM — Permiso Ambiental (Químicos)");
  try {
    const permiso = await conectores.MINAM.consultarPermisoAmbiental('quimicos');
    console.log("✅ EXITOSA");
    console.log(`   Requiere permiso: ${permiso.requierePermiso}`);
    exitosas++;
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // ═══════════════════════════════════════════════════
  // PRUEBA 9: PRODUCE — Permiso de Pesca
  // ═══════════════════════════════════════════════════
  console.log("\n🏛️  PRUEBA 9: PRODUCE — Permiso de Pesca (Conservas de Atún)");
  try {
    const permiso = await conectores.PRODUCE.consultarPermisoPesca('conservas_de_atun');
    console.log("✅ EXITOSA");
    console.log(`   Requiere permiso: ${permiso.requierePermiso}`);
    console.log(`   Tipo: ${permiso.tipoPermiso}`);
    exitosas++;
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // ═══════════════════════════════════════════════════
  // PRUEBA 10: INDECOPI — Antidumping
  // ═══════════════════════════════════════════════════
  console.log("\n🏛️  PRUEBA 10: INDECOPI — Antidumping (Camisetas, China)");
  try {
    const antidumping = await conectores.INDECOPI.consultarAntidumping('camisetas', 'CN');
    console.log("✅ EXITOSA");
    console.log(`   Tiene antidumping: ${antidumping.tieneAntidumping}`);
    console.log(`   Tasa: ${antidumping.tasa}%`);
    exitosas++;
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // ═══════════════════════════════════════════════════
  // PRUEBA 11: CONSULTAR TODO (Integración)
  // ═══════════════════════════════════════════════════
  console.log("\n🏛️  PRUEBA 11: CONSULTAR TODO (Integración completa)");
  try {
    const resultado = await conectores.consultarTodo('8471300000', 'laptop', 'CN');
    console.log("✅ EXITOSA");
    console.log(`   Arancel: ${resultado.arancel?.fuente || 'N/A'}`);
    console.log(`   Tipo Cambio: ${resultado.tipo_cambio?.venta || 'N/A'}`);
    console.log(`   Restricciones: ${resultado.restricciones?.partida || 'N/A'}`);
    console.log(`   Antidumping: ${resultado.antidumping?.tieneAntidumping || false}`);
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
  console.log(`   ✅ Exitosas: ${exitosas}/${total}`);
  console.log(`   ❌ Fallidas: ${fallidas}/${total}`);
  console.log(`   📈 Éxito: ${((exitosas/total)*100).toFixed(1)}%`);

  // Estadísticas de cache
  const stats = conectores.getCacheStats();
  console.log(`\n💾 CACHE:`);
  console.log(`   Entradas: ${stats.total_entries}`);

  console.log("\n" + "═".repeat(60));

  if (exitosas === total) {
    console.log("\n🎉 ¡TODAS LAS PRUEBAS EXITOSAS!\n");
    process.exit(0);
  } else {
    console.log(`\n⚠️  ${fallidas} prueba(s) fallida(s)\n`);
    process.exit(1);
  }
}

// Ejecutar pruebas
ejecutarPruebas().catch(e => {
  console.error("\n❌ ERROR FATAL:", e.message);
  console.error(e.stack);
  process.exit(1);
});
