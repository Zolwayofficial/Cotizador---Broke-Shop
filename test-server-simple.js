// test-server-simple.js - Smoke test minimo de Express

const express = require('express');

const parsedPort = Number.parseInt(String(process.env.PORT || '3000').trim(), 10);
const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;
const KEEP_OPEN = /^(1|true|yes)$/i.test(String(process.env.KEEP_OPEN || '').trim());

console.log('\n=== PROBANDO SERVIDOR EXPRESS ===\n');

try {
  console.log('1. Cargando express...');
  console.log('   express cargado');

  console.log('2. Creando app...');
  const app = express();
  console.log('   app creada');

  console.log(`3. Escuchando puerto ${PORT}...`);
  const server = app.listen(PORT, () => {
    console.log(`   Servidor HTTP escuchando en http://localhost:${PORT}`);

    if (!KEEP_OPEN) {
      console.log('   Cerrando automaticamente el smoke test (usa KEEP_OPEN=true para dejarlo abierto).');
      server.close(() => {
        console.log('\n=== SMOKE DE SERVIDOR COMPLETADO ===\n');
        process.exit(0);
      });
    } else {
      console.log('\n=== SERVIDOR EN ESCUCHA PARA SMOKE ===\n');
    }
  });

  server.on('error', (error) => {
    console.error('\nERROR:', error.message);
    process.exit(1);
  });
} catch (error) {
  console.error('\nERROR:', error.message);
  console.error(error.stack);
  process.exit(1);
}
