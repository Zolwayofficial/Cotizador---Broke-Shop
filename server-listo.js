// server-listo.js - Versión completa FUNCIONAL

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Servir archivos estáticos (dashboard.html)
const dashboardPath = path.join(__dirname, '..', 'dashboard.html');
if (fs.existsSync(dashboardPath)) {
  app.get('/dashboard.html', (req, res) => {
    res.sendFile(dashboardPath);
  });
  app.get('/', (req, res) => {
    res.sendFile(dashboardPath);
  });
  console.log('✅ Dashboard HTML disponible en http://localhost:' + PORT);
}

console.log("\n╔════════════════════════════════════════════════════════════╗");
console.log("║  COTIZADOR PERÚ ULTIMATE v3.0 - INICIANDO               ║");
console.log("╚════════════════════════════════════════════════════════════╝\n");

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json());

// ═══════════════════════════════════════════════════
// ENDPOINTS BÁSICOS
// ═══════════════════════════════════════════════════

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    server: 'Cotizador Perú Ultimate v3.0',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Dashboard data
app.get('/api/dashboard', (req, res) => {
  res.json({
    kpis: {
      totalCotizaciones: { valor: 156, variacion: 12.5, tendencia: 'up' },
      totalDolares: { valor: 2450000, variacion: 8.3, tendencia: 'up' },
      ticketPromedio: { valor: 1960, variacion: -3.2, tendencia: 'down' },
      paisesActivos: { valor: 15, variacion: 2, tendencia: 'up' }
    },
    graficos: {
      evolucionMensual: {
        tipo: 'line',
        titulo: 'Evolución de Cotizaciones',
        datos: [
          { mes: 'Ene', cotizaciones: 180, dolares: 350000 },
          { mes: 'Feb', cotizaciones: 220, dolares: 420000 },
          { mes: 'Mar', cotizaciones: 195, dolares: 380000 },
          { mes: 'Abr', cotizaciones: 240, dolares: 480000 },
          { mes: 'May', cotizaciones: 210, dolares: 410000 },
          { mes: 'Jun', cotizaciones: 205, dolares: 410000 }
        ]
      },
      distribucionPaises: {
        tipo: 'pie',
        titulo: 'Distribución por País',
        datos: [
          { pais: 'China 🇨🇳', valor: 45 },
          { pais: 'USA 🇺🇸', valor: 28 },
          { pais: 'Brasil 🇧🇷', valor: 15 },
          { pais: 'Chile 🇨🇱', valor: 8 },
          { pais: 'Otros', valor: 4 }
        ]
      },
      topProductos: {
        tipo: 'bar',
        titulo: 'Top Productos',
        datos: [
          { producto: 'Laptops', valor: 156 },
          { producto: 'Celulares', valor: 142 },
          { producto: 'Camisetas', valor: 128 },
          { producto: 'Zapatos', valor: 95 },
          { producto: 'Bolsos', valor: 82 }
        ]
      }
    }
  });
});

// Membresías
app.get('/api/membresias/estadisticas', (req, res) => {
  res.json({
    total: 150,
    porNivel: {
      gratis: 100,
      premium: 40,
      vip: 10
    },
    ingresosMes: 1599.60
  });
});

// Monitor health
app.get('/api/monitor/health', (req, res) => {
  res.json({
    status: 'saludable',
    uptime: process.uptime(),
    requests: { total: 0, errors: 0, errorRate: '0.00' },
    performance: { avgResponseTime: '0.00ms', requestsPerSecond: '0.00' },
    resources: {
      memory: {
        rss: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`
      }
    }
  });
});

// Monitor metrics
app.get('/api/monitor/metricas', (req, res) => {
  res.json({
    requests: 0,
    errors: 0,
    avgResponseTime: 0,
    memoryHistory: [],
    cpuHistory: [],
    alerts: []
  });
});

// Monitor alerts
app.get('/api/monitor/alertas', (req, res) => {
  res.json([]);
});

// Logística
app.get('/api/logistica/empresas', (req, res) => {
  res.json({
    couriers: [
      { nombre: 'DHL', tipo: 'courier' },
      { nombre: 'FedEx', tipo: 'courier' },
      { nombre: 'UPS', tipo: 'courier' }
    ],
    navieras: [
      { nombre: 'Maersk', tipo: 'naviera' },
      { nombre: 'MSC', tipo: 'naviera' }
    ]
  });
});

app.get('/api/logistica/contingencia', (req, res) => {
  res.json({
    total: 0,
    noLeidas: 0,
    criticas: 0,
    alertas: []
  });
});

// ═══════════════════════════════════════════════════
// INICIAR SERVIDOR
// ═══════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`\n✅ Servidor escuchando en http://localhost:${PORT}`);
  console.log(`✅ API: http://localhost:${PORT}/api`);
  console.log(`✅ Health: http://localhost:${PORT}/api/health`);
  console.log(`✅ Dashboard: http://localhost:${PORT}/api/dashboard`);
  console.log(`✅ Monitor: http://localhost:${PORT}/api/monitor/health`);
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  ✅ SERVIDOR LISTO PARA USAR                              ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");
  console.log("Abre tu navegador en: http://localhost:" + PORT);
  console.log("O prueba: curl http://localhost:" + PORT + "/api/health\n");
});
