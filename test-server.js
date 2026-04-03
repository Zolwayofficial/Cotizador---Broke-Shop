// test-server.js - Smoke test de carga del servidor principal

try {
  console.log('[SMOKE] Probando carga del servidor...');
  require('./server/index.js');
  console.log('[SMOKE] Carga del servidor completada sin error visible');
  process.exit(0);
} catch (error) {
  console.error('[FAIL] No pude cargar el servidor:', error.message);
  console.error(error.stack);
  process.exit(1);
}
