// test-endpoints-http.js — Prueba de endpoints HTTP de conectores

const http = require('http');

const BASE_URL = 'http://localhost:3000/api/conectores';

console.log("🔍 INICIANDO PRUEBA DE ENDPOINTS HTTP...\n");

async function hacerRequest(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function ejecutarPruebasHTTP() {
  let exitosas = 0;
  let fallidas = 0;

  console.log("═".repeat(60));

  // PRUEBA 1: Tipo de cambio
  console.log("\n🏛️  PRUEBA 1: GET /api/conectores/sunat/tipo-cambio");
  try {
    const result = await hacerRequest('/sunat/tipo-cambio');
    console.log("✅ EXITOSA");
    console.log(`   Compra: S/ ${result.compra || 'N/A'}`);
    console.log(`   Venta:  S/ ${result.venta || 'N/A'}`);
    exitosas++;
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // PRUEBA 2: Arancel
  console.log("\n🏛️  PRUEBA 2: GET /api/conectores/sunat/arancel/8471300000");
  try {
    const result = await hacerRequest('/sunat/arancel/8471300000');
    console.log("✅ EXITOSA");
    console.log(`   Ad Valorem: ${result.adValorem || 0}%`);
    console.log(`   IGV: ${result.igv || 16}%`);
    exitosas++;
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // PRUEBA 3: VUCE
  console.log("\n🏛️  PRUEBA 3: GET /api/conectores/vuce/restricciones/8471300000?pais=CN");
  try {
    const result = await hacerRequest('/vuce/restricciones/8471300000?pais=CN');
    console.log("✅ EXITOSA");
    console.log(`   Partida: ${result.partida || 'N/A'}`);
    exitosas++;
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // PRUEBA 4: MTC
  console.log("\n🏛️  PRUEBA 4: GET /api/conectores/mtc/homologacion?producto=router");
  try {
    const result = await hacerRequest('/mtc/homologacion?producto=router');
    console.log("✅ EXITOSA");
    console.log(`   Requiere: ${result.requiereHomologacion}`);
    exitosas++;
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // PRUEBA 5: DIGESA
  console.log("\n🏛️  PRUEBA 5: GET /api/conectores/digesa/registro?producto=paracetamol");
  try {
    const result = await hacerRequest('/digesa/registro?producto=paracetamol');
    console.log("✅ EXITOSA");
    console.log(`   Estado: ${result.estado || 'N/A'}`);
    exitosas++;
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // PRUEBA 6: SENASA
  console.log("\n🏛️  PRUEBA 6: GET /api/conectores/senasa/permiso?producto=manzanas&pais=US");
  try {
    const result = await hacerRequest('/senasa/permiso?producto=manzanas&pais=US');
    console.log("✅ EXITOSA");
    console.log(`   Requiere: ${result.requierePermiso}`);
    exitosas++;
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // PRUEBA 7: MINAM
  console.log("\n🏛️  PRUEBA 7: GET /api/conectores/minam/permiso?producto=quimicos");
  try {
    const result = await hacerRequest('/minam/permiso?producto=quimicos');
    console.log("✅ EXITOSA");
    console.log(`   Requiere: ${result.requierePermiso}`);
    exitosas++;
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // PRUEBA 8: PRODUCE
  console.log("\n🏛️  PRUEBA 8: GET /api/conectores/produce/permiso?producto=conservas");
  try {
    const result = await hacerRequest('/produce/permiso?producto=conservas');
    console.log("✅ EXITOSA");
    console.log(`   Requiere: ${result.requierePermiso}`);
    exitosas++;
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // PRUEBA 9: INDECOPI
  console.log("\n🏛️  PRUEBA 9: GET /api/conectores/indecopi/antidumping?producto=camisetas&pais=CN");
  try {
    const result = await hacerRequest('/indecopi/antidumping?producto=camisetas&pais=CN');
    console.log("✅ EXITOSA");
    console.log(`   Tiene: ${result.tieneAntidumping}`);
    exitosas++;
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // PRUEBA 10: ADUANET
  console.log("\n🏛️  PRUEBA 10: GET /api/conectores/aduanet/arancel/6109100010");
  try {
    const result = await hacerRequest('/aduanet/arancel/6109100010');
    console.log("✅ EXITOSA");
    console.log(`   Ad Valorem: ${result.adValorem || 0}%`);
    exitosas++;
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // PRUEBA 11: Cache Stats
  console.log("\n🏛️  PRUEBA 11: GET /api/conectores/cache-stats");
  try {
    const result = await hacerRequest('/cache-stats');
    console.log("✅ EXITOSA");
    console.log(`   Entradas: ${result.total_entries || 0}`);
    exitosas++;
  } catch (e) {
    console.log("❌ FALLIDA:", e.message);
    fallidas++;
  }

  // RESULTADOS
  console.log("\n" + "═".repeat(60));
  console.log(`\n📊 RESULTADOS:`);
  console.log(`   ✅ Exitosas: ${exitosas}/${exitosas + fallidas}`);
  console.log(`   ❌ Fallidas: ${fallidas}/${exitosas + fallidas}`);
  console.log(`   📈 Éxito: ${((exitosas/(exitosas+fallidas))*100).toFixed(1)}%`);
  console.log("\n" + "═".repeat(60));

  if (exitosas === 11) {
    console.log("\n🎉 ¡TODOS LOS ENDPOINTS FUNCIONAN!\n");
  } else {
    console.log(`\n⚠️  ${fallidas} endpoint(s) fallido(s)\n`);
  }
}

// Ejecutar
ejecutarPruebasHTTP().catch(e => {
  console.error("\n❌ ERROR:", e.message);
  console.error("Nota: El servidor debe estar corriendo en http://localhost:3000");
});
