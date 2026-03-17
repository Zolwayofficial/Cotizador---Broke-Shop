// server-minimo.js - Versión mínima funcional del servidor

const express = require('express');
const app = express();
const PORT = 3001;

console.log("\n=== INICIANDO SERVIDOR MÍNIMO ===\n");

app.use(express.json());

// Endpoint de health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    server: 'Cotizador Perú Ultimate v3.0',
    timestamp: new Date().toISOString()
  });
});

// Endpoint de dashboard
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
          { mes: 'Ene', cotizaciones: 180 },
          { mes: 'Feb', cotizaciones: 220 },
          { mes: 'Mar', cotizaciones: 195 }
        ]
      }
    }
  });
});

// Endpoint de membresías
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

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`✅ Servidor escuchando en http://localhost:${PORT}`);
  console.log(`✅ API: http://localhost:${PORT}/api`);
  console.log(`✅ Health: http://localhost:${PORT}/api/health`);
  console.log(`✅ Dashboard: http://localhost:${PORT}/api/dashboard`);
  console.log("\n=== SERVIDOR LISTO ===\n");
  console.log("Abre tu navegador en: http://localhost:" + PORT);
  console.log("O prueba: curl http://localhost:" + PORT + "/api/health\n");
});
