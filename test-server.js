// test-server.js — Prueba rápida de carga del servidor
try {
  console.log("🔍 Probando carga del servidor...");
  const app = require('./server/index.js');
  console.log("✅ SERVIDOR: CARGA EXITOSA");
  process.exit(0);
} catch (e) {
  console.log("❌ ERROR:", e.message);
  console.log("Stack:", e.stack);
  process.exit(1);
}
