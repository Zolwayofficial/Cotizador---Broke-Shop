// test-endpoints-agentes.js — Prueba de TODOS los endpoints de agentes

console.log("🔍 PRUEBA DE ENDPOINTS HTTP DE AGENTES\n");
console.log("═".repeat(60));

const http = require('http');

const BASE_URL = 'http://localhost:3000/api/agentes';

// Lista de endpoints a probar
const endpoints = [
  { nombre: 'Stats Generales', path: '/stats' },
  { nombre: 'SUNAT Tipo Cambio', path: '/sunat/tipo-cambio' },
  { nombre: 'SUNAT Arancel', path: '/sunat/arancel/8471300000' },
  { nombre: 'SUNAT Stats', path: '/sunat/stats' },
  { nombre: 'ADUANET Arancel', path: '/aduanet/arancel/8471300000' },
  { nombre: 'VUCE Restricciones', path: '/vuce/restricciones/8471300000?pais=CN' },
  { nombre: 'INDECOPI Antidumping', path: '/indecopi/antidumping?producto=camisetas&pais=CN' },
  { nombre: 'MTC Homologacion', path: '/mtc/homologacion?producto=router&marca=Cisco&modelo=E4200' },
  { nombre: 'DIGESA Registro', path: '/digesa/registro?producto=paracetamol&laboratorio=Bayer' },
  { nombre: 'SENASA Permiso', path: '/senasa/permiso?producto=manzanas&pais=US' },
  { nombre: 'MINAM Permiso', path: '/minam/permiso?producto=quimicos' },
  { nombre: 'PRODUCE Permiso', path: '/produce/permiso?producto=atun' }
];

async function hacerRequest(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ statusCode: res.statusCode, data });
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function ejecutarPruebas() {
  let exitosas = 0;
  let fallidas = 0;
  let errores = 0;

  console.log(`\n📊 Total de endpoints a probar: ${endpoints.length}\n`);

  for (const endpoint of endpoints) {
    console.log(`🏛️  PRUEBA: ${endpoint.nombre}`);
    console.log(`   GET ${BASE_URL}${endpoint.path}`);
    
    try {
      const result = await hacerRequest(endpoint.path);
      
      if (result.statusCode === 200 || result.statusCode === 400) {
        console.log(`   ✅ EXITOSA (${result.statusCode})`);
        exitosas++;
      } else {
        console.log(`   ⚠️  PARCIAL (${result.statusCode})`);
        fallidas++;
      }
    } catch (e) {
      console.log(`   ❌ FALLIDA: ${e.message}`);
      errores++;
    }
    
    console.log('');
  }

  // RESULTADOS
  console.log("═".repeat(60));
  console.log(`\n📊 RESULTADOS:`);
  console.log(`   ✅ Exitosas: ${exitosas}/${endpoints.length}`);
  console.log(`   ⚠️  Parciales: ${fallidas}/${endpoints.length}`);
  console.log(`   ❌ Errores: ${errores}/${endpoints.length}`);
  console.log(`   📈 Éxito: ${((exitosas/endpoints.length)*100).toFixed(1)}%`);
  console.log("\n" + "═".repeat(60));

  if (exitosas >= endpoints.length - 2) {
    console.log("\n🎉 ¡MAYORÍA DE ENDPOINTS FUNCIONAN!\n");
    console.log("⚠️  Algunos pueden fallar si el servidor no está corriendo\n");
  } else {
    console.log("\n⚠️  Varios endpoints fallaron.\n");
    console.log("💡 Asegúrate de que el servidor esté corriendo:");
    console.log("   npm start\n");
  }
}

// Ejecutar pruebas
ejecutarPruebas().catch(e => {
  console.error("\n❌ ERROR FATAL:", e.message);
  console.error("\n💡 ¿Está el servidor corriendo en http://localhost:3000?");
});
