// server-listo.js - Version completa funcional para pruebas locales simples

const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const fs = require('fs')
const { parsePort, resolveRepoFile } = require('./scripts/runtime-script-helpers.cjs')

const app = express()
const PORT = parsePort(process.env.PORT, 3000)

// Servir archivos estaticos (dashboard.html)
const dashboardPath = resolveRepoFile(__dirname, 'dashboard.html')
if (fs.existsSync(dashboardPath)) {
  app.get('/dashboard.html', (req, res) => {
    res.sendFile(dashboardPath)
  })
  app.get('/', (req, res) => {
    res.sendFile(dashboardPath)
  })
  console.log(`Dashboard HTML disponible en http://localhost:${PORT}`)
}

console.log('\n============================================================')
console.log('  Servidor local de referencia - iniciando')
console.log('============================================================\n')

// Middleware
app.use(helmet({ contentSecurityPolicy: false }))
app.use(compression())
app.use(cors())
app.use(express.json())

// Endpoints basicos
app.get('/api/health', (req, res) => {
  res.json({
    source: 'demo_local',
    nota: 'Servidor de referencia: health local sin chequeos de dependencias reales.',
    status: 'demo_local',
    server: 'ImportAIAgent Cotizador - servidor de referencia',
    version: 'local-reference',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  })
})

app.get('/api/dashboard', (req, res) => {
  res.json({
    source: 'demo_local',
    nota: 'Servidor de referencia: dashboard no conectado a datos reales.',
    kpis: {},
    graficos: {}
  })
})

app.get('/api/membresias/estadisticas', (req, res) => {
  res.json({
    source: 'demo_local',
    total: null,
    porNivel: {},
    ingresosMes: null,
    nota: 'Servidor de referencia: estadisticas de membresias no conectadas a datos reales.'
  })
})

app.get('/api/monitor/health', (req, res) => {
  res.json({
    source: 'demo_local',
    nota: 'Servidor de referencia: monitor local sin instrumentacion real de requests y latencia.',
    status: 'demo_local',
    uptime: process.uptime(),
    requests: { total: null, errors: null, errorRate: null },
    performance: { avgResponseTime: null, requestsPerSecond: null },
    resources: {
      memory: {
        rss: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`
      }
    }
  })
})

app.get('/api/monitor/metricas', (req, res) => {
  res.json({
    source: 'demo_local',
    nota: 'Servidor de referencia: metricas locales sin instrumentacion real.',
    requests: null,
    errors: null,
    avgResponseTime: null,
    memoryHistory: [],
    cpuHistory: [],
    alerts: []
  })
})

app.get('/api/monitor/alertas', (req, res) => {
  res.json({
    source: 'demo_local',
    nota: 'Servidor de referencia: alertas locales no conectadas a datos reales.',
    alertas: []
  })
})

app.get('/api/logistica/empresas', (req, res) => {
  res.json({
    source: 'demo_local',
    nota: 'Servidor de referencia: catalogo logistico referencial, no conectado a configuracion real.',
    couriers: [
      { nombre: 'DHL', tipo: 'courier' },
      { nombre: 'FedEx', tipo: 'courier' },
      { nombre: 'UPS', tipo: 'courier' }
    ],
    navieras: [
      { nombre: 'Maersk', tipo: 'naviera' },
      { nombre: 'MSC', tipo: 'naviera' }
    ]
  })
})

app.get('/api/logistica/contingencia', (req, res) => {
  res.json({
    source: 'demo_local',
    nota: 'Servidor de referencia: alertas logisticas no conectadas a datos reales.',
    total: null,
    noLeidas: null,
    criticas: null,
    alertas: []
  })
})

app.listen(PORT, () => {
  console.log(`\nServidor demo_local de referencia escuchando en http://localhost:${PORT}`)
  console.log(`API demo: http://localhost:${PORT}/api`)
  console.log(`Health demo: http://localhost:${PORT}/api/health`)
  console.log(`Dashboard demo: http://localhost:${PORT}/api/dashboard`)
  console.log(`Monitor demo: http://localhost:${PORT}/api/monitor/health`)
  console.log(`\nAbre el dashboard demo local en: http://localhost:${PORT}`)
})
