// server-minimo.js - Version minima funcional del servidor

const express = require('express');
const { parsePort } = require('./scripts/runtime-script-helpers.cjs');

const app = express();
const PORT = parsePort(process.env.PORT, 3000);

console.log('\n=== INICIANDO SERVIDOR MINIMO ===\n');

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    source: 'demo_local',
    nota: 'Servidor minimo: health local sin chequeos de dependencias reales.',
    status: 'demo_local',
    server: 'ImportAIAgent Cotizador - servidor minimo',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/dashboard', (req, res) => {
  res.json({
    source: 'demo_local',
    nota: 'Servidor minimo: dashboard no conectado a datos reales.',
    kpis: {},
    graficos: {},
  });
});

app.get('/api/membresias/estadisticas', (req, res) => {
  res.json({
    source: 'demo_local',
    total: null,
    porNivel: {},
    ingresosMes: null,
    nota: 'Servidor minimo: estadisticas de membresias no conectadas a datos reales.',
  });
});

app.listen(PORT, () => {
  console.log(`Servidor demo_local minimo escuchando en http://localhost:${PORT}`);
  console.log(`API demo: http://localhost:${PORT}/api`);
  console.log(`Health demo: http://localhost:${PORT}/api/health`);
  console.log(`Dashboard demo: http://localhost:${PORT}/api/dashboard`);
  console.log('\n=== SERVIDOR DEMO DISPONIBLE ===\n');
  console.log(`Abre el dashboard demo local en: http://localhost:${PORT}`);
  console.log(`O prueba el health demo: curl http://localhost:${PORT}/api/health\n`);
});
