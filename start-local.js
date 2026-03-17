// start-local.js - Inicia el servidor local y muestra URLs reales.

const PORT = Number(process.env.PORT || 3000);
const WS_PORT = Number(process.env.WS_PORT || 3002);

function printHeader() {
  console.log("");
  console.log("============================================================");
  console.log("  INICIANDO COTIZADOR PERU ULTIMATE v3.0 - LOCAL");
  console.log("============================================================");
  console.log("");
}

function printUrls() {
  console.log("");
  console.log("SERVIDOR LISTO");
  console.log("");
  console.log(`Frontend y API: http://localhost:${PORT}`);
  console.log(`Health check:   http://localhost:${PORT}/api/health`);
  console.log(`Dashboard API:  http://localhost:${PORT}/api/dashboard`);
  console.log(`WebSocket:      ws://localhost:${WS_PORT}`);
  console.log("");
  console.log("Para detener el servidor usa Ctrl+C.");
  console.log("");
}

async function main() {
  printHeader();
  console.log(`[INIT] Iniciando servidor en http://localhost:${PORT} ...`);

  const app = require("./server/index.js");
  await app.startServer({ port: PORT });

  printUrls();

  try {
    const open = require("open");
    await open(`http://localhost:${PORT}`);
  } catch (error) {
    console.log("[INFO] No se pudo abrir el navegador automaticamente.");
  }
}

main().catch((error) => {
  console.error("");
  console.error("[ERROR] No se pudo iniciar el servidor local.");
  console.error(error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
