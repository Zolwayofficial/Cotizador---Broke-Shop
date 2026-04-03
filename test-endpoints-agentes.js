const {
  buildRequestHeaders,
  classifyManualHttpStatus,
  normalizeBaseUrl,
  normalizeToken,
  requestJson,
} = require('./scripts/manual-smoke-helpers.cjs');

const BASE_URL = `${normalizeBaseUrl(process.env.BASE_URL)}/api/agentes`;
const AUTH_TOKEN = normalizeToken(process.env.AUTH_TOKEN);
const ADMIN_TOKEN = normalizeToken(process.env.ADMIN_TOKEN);

const endpoints = [
  { nombre: 'Stats Generales', path: '/stats', requiresAuth: true, requiresAdmin: true },
  { nombre: 'SUNAT Tipo Cambio', path: '/sunat/tipo-cambio', requiresAuth: true },
  { nombre: 'SUNAT Arancel', path: '/sunat/arancel/8471300000', requiresAuth: true },
  { nombre: 'SUNAT Stats', path: '/sunat/stats', requiresAuth: true, requiresAdmin: true },
  { nombre: 'ADUANET Arancel', path: '/aduanet/arancel/8471300000', requiresAuth: true },
  { nombre: 'VUCE Restricciones', path: '/vuce/restricciones/8471300000?pais=CN', requiresAuth: true },
  { nombre: 'INDECOPI Antidumping', path: '/indecopi/antidumping?producto=camisetas&pais=CN', requiresAuth: true },
  { nombre: 'MTC Homologacion', path: '/mtc/homologacion?producto=router&marca=Cisco&modelo=E4200', requiresAuth: true },
  { nombre: 'DIGESA Registro', path: '/digesa/registro?producto=paracetamol&laboratorio=Bayer', requiresAuth: true },
  { nombre: 'SENASA Permiso', path: '/senasa/permiso?producto=manzanas&pais=US', requiresAuth: true },
  { nombre: 'MINAM Permiso', path: '/minam/permiso?producto=quimicos', requiresAuth: true },
  { nombre: 'PRODUCE Permiso', path: '/produce/permiso?producto=atun', requiresAuth: true },
];

async function main() {
  console.log('PRUEBA DE ENDPOINTS HTTP DE AGENTES\n');
  console.log('='.repeat(60));
  console.log(`Base URL: ${BASE_URL}`);

  let respondieron = 0;
  let omitidas = 0;
  let fallidas = 0;

  for (const endpoint of endpoints) {
    const token = endpoint.requiresAdmin ? ADMIN_TOKEN : AUTH_TOKEN;
    const headers = buildRequestHeaders(token);
    const url = `${BASE_URL}${endpoint.path}`;

    console.log(`\nPRUEBA: ${endpoint.nombre}`);
    console.log(`GET ${url}`);

    try {
      const result = await requestJson(url, headers);
      const status = classifyManualHttpStatus(result.statusCode, {
        requiresAuth: endpoint.requiresAuth,
        requiresAdmin: endpoint.requiresAdmin,
        hasToken: Boolean(token),
      });

      if (status.bucket === 'success') {
        console.log(`RESPUESTA ${status.label}`);
        respondieron += 1;
      } else if (status.bucket === 'skipped') {
        console.log(`SKIP ${status.label}: ${status.reason}`);
        omitidas += 1;
      } else {
        console.log(`FAIL ${status.reason}`);
        fallidas += 1;
      }
    } catch (error) {
      console.log(`FAIL ${error.message}`);
      fallidas += 1;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('RESULTADOS');
  console.log(`RESPONDIERON: ${respondieron}/${endpoints.length}`);
  console.log(`SKIP: ${omitidas}/${endpoints.length}`);
  console.log(`FAIL: ${fallidas}/${endpoints.length}`);

  if (!AUTH_TOKEN) {
    console.log('\nNota: define AUTH_TOKEN para probar endpoints protegidos.');
  }
  if (!ADMIN_TOKEN) {
    console.log('Nota: define ADMIN_TOKEN para probar endpoints admin.');
  }
}

main().catch((error) => {
  console.error(`\nERROR FATAL: ${error.message}`);
  console.error('Nota: asegurate de que el servidor este corriendo y que BASE_URL sea correcta.');
  process.exit(1);
});
