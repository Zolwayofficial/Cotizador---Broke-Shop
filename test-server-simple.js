// test-server.js - Test simple del servidor

console.log("\n=== PROBANDO SERVIDOR ===\n");

try {
  console.log("1. Cargando express...");
  const express = require("express");
  console.log("   OK express");

  console.log("2. Creando app...");
  const app = express();
  console.log("   OK app");

  console.log("3. Escuchando puerto 3000...");
  app.listen(3000, () => {
    console.log("   OK Servidor HTTP escuchando en http://localhost:3000");
    console.log("\n=== SERVIDOR FUNCIONANDO ===\n");
  });
} catch (error) {
  console.error("\nERROR:", error.message);
  console.error(error.stack);
}
