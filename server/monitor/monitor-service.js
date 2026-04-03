// server/monitor/monitor-service.js
//
// SERVICIO DE MONITOREO DEL SISTEMA
//
// Features:
// - Monitoreo de salud del sistema
// - Metricas de rendimiento
// - Alertas automaticas
// - Logs centralizados
// - Enfoque conservador sin dependencias de pago obligatorias

const os = require('os');
const fs = require('fs');
const path = require('path');

const DEFAULT_DATA_DIR = path.resolve(__dirname, '..', '..', 'data');

function resolveDataDir() {
  if (!process.env.DATA_DIR) {
    return DEFAULT_DATA_DIR;
  }

  return path.isAbsolute(process.env.DATA_DIR)
    ? process.env.DATA_DIR
    : path.resolve(__dirname, '..', '..', process.env.DATA_DIR);
}

const DB_PATH = path.join(resolveDataDir(), 'monitor.json');

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasTrafficSample(totalRequests) {
  return Number.isFinite(totalRequests) && totalRequests > 0;
}

function determineMonitorStatus({ requests, errors, avgResponseTime, memoryMB }) {
  const errorRate = hasTrafficSample(requests)
    ? ((errors / requests) * 100)
    : 0;

  if (errorRate > 10 || memoryMB > 500 || avgResponseTime > 1000) {
    return 'critico';
  }

  if (errorRate > 5 || memoryMB > 400 || avgResponseTime > 500) {
    return 'alerta';
  }

  if (!hasTrafficSample(requests)) {
    return 'sin_muestra';
  }

  return 'saludable';
}

class MonitorService {
  constructor() {
    this.metrics = {
      startTime: Date.now(),
      requests: 0,
      errors: 0,
      avgResponseTime: 0,
      memoryUsage: [],
      cpuUsage: []
    };

    this.alerts = [];
    this.maxMetrics = 1000; // Mantener ultimos 1000 registros
    this.monitoringIntervals = [];
    this.started = false;
    this.nextAlertId = 1;

    this._cargarMetricas();
  }

  // METODOS PUBLICOS

  // Registrar request
  registrarRequest(tiempoRespuesta, error = null) {
    this.metrics.requests++;

    if (error) {
      this.metrics.errors++;
    }

    // Actualizar promedio de tiempo de respuesta
    this.metrics.avgResponseTime = (
      (this.metrics.avgResponseTime * (this.metrics.requests - 1) + tiempoRespuesta) /
      this.metrics.requests
    );

    // Guardar metricas periodicamente
    if (this.metrics.requests % 100 === 0) {
      this._guardarMetricas();
    }
  }

  // Obtener salud del sistema
  obtenerSalud() {
    const uptime = Date.now() - this.metrics.startTime;
    const memory = process.memoryUsage();
    const cpu = os.loadavg();
    const uptimeSeconds = Math.max(uptime / 1000, 0.001);
    const cpuInfo = os.cpus();
    const trafficSample = hasTrafficSample(this.metrics.requests);

    return {
      status: this._determinarEstado(),
      uptime: this._formatearUptime(uptime),
      uptimeMs: uptime,
      requests: {
        total: this.metrics.requests,
        errors: this.metrics.errors,
        errorRate: trafficSample ?
          ((this.metrics.errors / this.metrics.requests) * 100).toFixed(2) : null
      },
      performance: {
        avgResponseTime: trafficSample ? `${this.metrics.avgResponseTime.toFixed(2)}ms` : null,
        requestsPerSecond: trafficSample ? (this.metrics.requests / uptimeSeconds).toFixed(2) : null
      },
      resources: {
        memory: {
          rss: `${(memory.rss / 1024 / 1024).toFixed(2)} MB`,
          heapUsed: `${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
          heapTotal: `${(memory.heapTotal / 1024 / 1024).toFixed(2)} MB`
        },
        cpu: {
          load: cpu.map(c => c.toFixed(2)).join(', '),
          cores: cpuInfo.length,
          model: cpuInfo[0]?.model || 'Desconocido'
        },
        disk: this._obtenerUsoDisco()
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        uptime: this._formatearUptime(process.uptime() * 1000)
      }
    };
  }

  // Obtener metricas detalladas
  obtenerMetricas() {
    const trafficSample = hasTrafficSample(this.metrics.requests);

    return {
      requests: this.metrics.requests,
      errors: this.metrics.errors,
      avgResponseTime: trafficSample ? this.metrics.avgResponseTime : null,
      memoryHistory: this.metrics.memoryUsage.slice(-100),
      cpuHistory: this.metrics.cpuUsage.slice(-100),
      alerts: this.alerts.slice(-50)
    };
  }

  // Obtener alertas
  obtenerAlertas() {
    return this.alerts.slice(-50);
  }

  // Agregar alerta
  agregarAlerta(tipo, mensaje, datos = {}) {
    const alerta = {
      id: this.nextAlertId++,
      tipo,
      mensaje,
      datos,
      timestamp: new Date().toISOString(),
      leida: false
    };

    this.alerts.push(alerta);

    // Limitar alertas
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }

    console.log(`[MONITOR] ALERTA [${tipo}]: ${mensaje}`);

    return alerta;
  }

  // Marcar alerta como leida
  marcarAlertaLeida(id) {
    const alerta = this.alerts.find(a => a.id === id);

    if (alerta) {
      alerta.leida = true;
      return true;
    }

    return false;
  }

  // Limpiar alertas leidas
  limpiarAlertasLeidas() {
    const antes = this.alerts.length;
    this.alerts = this.alerts.filter(a => !a.leida);
    return { eliminadas: antes - this.alerts.length };
  }

  start() {
    if (this.started) return;
    this.started = true;
    this._iniciarMonitoreoAutomatico();
  }

  stop() {
    this.monitoringIntervals.forEach(interval => clearInterval(interval));
    this.monitoringIntervals = [];
    this.started = false;
  }

  // METODOS PRIVADOS

  _iniciarMonitoreoAutomatico() {
    // Monitorear cada 10 segundos
    const metricsInterval = setInterval(() => {
      this._registrarMetricasSistema();
      this._verificarAlertas();
    }, 10000);

    // Guardar cada 5 minutos
    const saveInterval = setInterval(() => {
      this._guardarMetricas();
    }, 300000);

    this.monitoringIntervals.push(metricsInterval, saveInterval);
    this.monitoringIntervals.forEach(interval => interval.unref?.());

    console.log('[MONITOR] Monitoreo automatico iniciado');
  }

  _registrarMetricasSistema() {
    const memory = process.memoryUsage();
    const cpu = os.loadavg();

    this.metrics.memoryUsage.push({
      timestamp: Date.now(),
      rss: memory.rss,
      heapUsed: memory.heapUsed
    });

    this.metrics.cpuUsage.push({
      timestamp: Date.now(),
      load: cpu[0]
    });

    // Limitar historial
    if (this.metrics.memoryUsage.length > this.maxMetrics) {
      this.metrics.memoryUsage.shift();
      this.metrics.cpuUsage.shift();
    }
  }

  _verificarAlertas() {
    const salud = this.obtenerSalud();

    // Verificar errores
    const errorRate = toFiniteNumber(salud.requests.errorRate);
    if (errorRate > 5) {
      this.agregarAlerta('error', `Tasa de errores alta: ${errorRate}%`, { errorRate });
    }

    // Verificar memoria
    const memoryMB = toFiniteNumber(salud.resources.memory.heapUsed);
    if (memoryMB > 400) { // 400 MB
      this.agregarAlerta('memoria', `Uso de memoria alto: ${memoryMB} MB`, { memoryMB });
    }

    // Verificar tiempo de respuesta
    const avgTime = toFiniteNumber(salud.performance.avgResponseTime);
    if (avgTime > 500) { // 500ms
      this.agregarAlerta('performance', `Tiempo de respuesta alto: ${avgTime}ms`, { avgTime });
    }
  }

  _determinarEstado() {
    const memoryMB = parseFloat((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2));
    return determineMonitorStatus({
      requests: this.metrics.requests,
      errors: this.metrics.errors,
      avgResponseTime: this.metrics.avgResponseTime,
      memoryMB,
    });
  }

  _formatearUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    }

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }

    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }

    return `${seconds}s`;
  }

  _obtenerUsoDisco() {
    try {
      const stats = fs.statfsSync(path.dirname(DB_PATH));
      const total = stats.bsize * stats.blocks;
      const free = stats.bsize * stats.bfree;
      const used = total - free;

      return {
        total: `${(total / 1024 / 1024 / 1024).toFixed(2)} GB`,
        used: `${(used / 1024 / 1024 / 1024).toFixed(2)} GB`,
        free: `${(free / 1024 / 1024 / 1024).toFixed(2)} GB`,
        percent: ((used / total) * 100).toFixed(2)
      };
    } catch (e) {
      return { error: e.message };
    }
  }

  _guardarMetricas() {
    try {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
      fs.writeFileSync(DB_PATH, JSON.stringify({
        metrics: this.metrics,
        alerts: this.alerts,
        timestamp: Date.now()
      }, null, 2));
    } catch (e) {
      console.error('[MONITOR] Error guardando metricas:', e.message);
    }
  }

  _cargarMetricas() {
    try {
      if (fs.existsSync(DB_PATH)) {
        const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        this.metrics = { ...this.metrics, ...data.metrics };
        this.alerts = data.alerts || [];
        this.nextAlertId = this.alerts.reduce((maxId, alerta) => {
          return Math.max(maxId, toFiniteNumber(alerta?.id, 0));
        }, 0) + 1;
        console.log('[MONITOR] Metricas cargadas desde disco');
      }
    } catch (e) {
      console.error('[MONITOR] Error cargando metricas:', e.message);
    }
  }
}

const monitorService = new MonitorService();

module.exports = monitorService;
module.exports._private = {
  resolveDataDir,
  DB_PATH,
  hasTrafficSample,
  determineMonitorStatus,
};
