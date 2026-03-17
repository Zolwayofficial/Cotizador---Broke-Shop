// server/couriers/contingencia-api.js
// 
// SISTEMA DE CONTINGENCIA PARA APIs
// 
// Features:
// - Monitoreo de créditos de APIs
// - Alertas cuando créditos están bajos
// - Switch automático a fallback
// - Priorización de APIs ilimitadas
// - Registro de uso de APIs

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(process.env.DATA_DIR || './data', 'api-usage.json');

// ═══════════════════════════════════════════════════
// CONFIGURACIÓN DE LÍMITES DE APIs
// ═══════════════════════════════════════════════════

const API_LIMITS = {
  // APIs con límites
  'shippo': { 
    limite: 5000, 
    periodo: 'year', 
    alerta: 4000,  // Alerta cuando llegue a 4,000
    critico: 4500  // Crítico cuando llegue a 4,500
  },
  'easypost': { 
    limite: 120000, 
    periodo: 'year', 
    alerta: 100000,
    critico: 110000
  },
  'aftership': { 
    limite: 100, 
    periodo: 'month', 
    alerta: 80,
    critico: 90
  },
  'packsend': { 
    limite: Infinity,  // Ilimitado
    periodo: 'forever',
    alerta: null,
    critico: null
  },
  'interparcel': { 
    limite: Infinity,  // Ilimitado
    periodo: 'forever',
    alerta: null,
    critico: null
  },
  'parcelmonkey': { 
    limite: Infinity,  // Ilimitado
    periodo: 'forever',
    alerta: null,
    critico: null
  },
  'maersk': { 
    limite: 1000, 
    periodo: 'month', 
    alerta: 800,
    critico: 900
  },
  'msc': { 
    limite: 1000, 
    periodo: 'month', 
    alerta: 800,
    critico: 900
  }
};

const API_NAME_ALIASES = {
  shippo: 'shippo',
  'shippo (multi-courier)': 'shippo',
  easypost: 'easypost',
  'easypost (multi-courier)': 'easypost',
  aftership: 'aftership',
  'aftership (700+ couriers)': 'aftership',
  'pack & send': 'packsend',
  packsend: 'packsend',
  'pack & send (15+ couriers)': 'packsend',
  interparcel: 'interparcel',
  'interparcel (25+ couriers)': 'interparcel',
  'parcel monkey': 'parcelmonkey',
  parcelmonkey: 'parcelmonkey',
  'parcel monkey (unlimited)': 'parcelmonkey',
  maersk: 'maersk',
  'maersk spot api': 'maersk',
  msc: 'msc',
  'msc spot api': 'msc'
};

function resolveApiKey(api) {
  const normalized = String(api || '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return API_NAME_ALIASES[normalized] || (API_LIMITS[normalized] ? normalized : null);
}

// ═══════════════════════════════════════════════════
// CLASE DE CONTINGENCIA
// ═══════════════════════════════════════════════════

class ContingenciaAPI {
  constructor() {
    this.uso = this._cargarUso();
    this.couriersPrioridad = [];
    this._inicializarPrioridad();
  }

  // ═══════════════════════════════════════════════════
  // CARGAR USO DE APIs
  // ═══════════════════════════════════════════════════

  _cargarUso() {
    try {
      if (fs.existsSync(DB_PATH)) {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('[CONTINGENCIA] Error cargando uso:', e.message);
    }
    
    // Uso inicial
    return this._crearUsoInicial();
  }

  _crearUsoInicial() {
    const uso = {};
    const ahora = new Date();
    
    for (const [api, config] of Object.entries(API_LIMITS)) {
      uso[api] = {
        count: 0,
        periodoInicio: this._inicioPeriodo(ahora, config.periodo),
        ultimoReset: ahora.toISOString(),
        activo: true,
        modo: 'normal'  // normal, alerta, critico, agotado
      };
    }
    
    return uso;
  }

  _inicioPeriodo(fecha, periodo) {
    const inicio = new Date(fecha);
    
    if (periodo === 'month') {
      inicio.setDate(1);
      inicio.setHours(0, 0, 0, 0);
    } else if (periodo === 'year') {
      inicio.setMonth(0, 1);
      inicio.setHours(0, 0, 0, 0);
    } else {
      // forever - no reset
      return new Date('2026-01-01').toISOString();
    }
    
    return inicio.toISOString();
  }

  // ═══════════════════════════════════════════════════
  // INICIALIZAR PRIORIDAD DE COURIERS
  // ═══════════════════════════════════════════════════

  _inicializarPrioridad() {
    // Prioridad: Ilimitados > Contratos > APIs con límites > Referencial
    this.couriersPrioridad = [
      // Nivel 1: Ilimitados (máxima prioridad)
      { nombre: 'Pack & Send', tipo: 'api', prioridad: 1, ilimitado: true },
      { nombre: 'Interparcel', tipo: 'api', prioridad: 1, ilimitado: true },
      { nombre: 'Parcel Monkey', tipo: 'api', prioridad: 1, ilimitado: true },
      
      // Nivel 2: Contratos directos (sin límites)
      { nombre: 'DHL Directo (Contrato)', tipo: 'personalizado', prioridad: 2, ilimitado: true },
      { nombre: 'FedEx Directo (Contrato)', tipo: 'personalizado', prioridad: 2, ilimitado: true },
      { nombre: 'UPS Directo (Contrato)', tipo: 'personalizado', prioridad: 2, ilimitado: true },
      { nombre: 'TNT Directo (Contrato)', tipo: 'personalizado', prioridad: 2, ilimitado: true },
      { nombre: 'USPS Directo (Contrato)', tipo: 'personalizado', prioridad: 2, ilimitado: true },
      { nombre: 'Maersk', tipo: 'naviera', prioridad: 2, ilimitado: true },
      { nombre: 'MSC', tipo: 'naviera', prioridad: 2, ilimitado: true },
      { nombre: 'Hapag-Lloyd', tipo: 'naviera', prioridad: 2, ilimitado: true },
      { nombre: 'CMA CGM', tipo: 'naviera', prioridad: 2, ilimitado: true },
      { nombre: 'COSCO', tipo: 'naviera', prioridad: 2, ilimitado: true },
      
      // Nivel 3: APIs con límites (prioridad media)
      { nombre: 'Shippo', tipo: 'api', prioridad: 3, ilimitado: false },
      { nombre: 'EasyPost', tipo: 'api', prioridad: 3, ilimitado: false },
      { nombre: 'AfterShip', tipo: 'api', prioridad: 3, ilimitado: false },
      
      // Nivel 4: Referencial (último recurso)
      { nombre: 'Referencial', tipo: 'fallback', prioridad: 4, ilimitado: true }
    ];
  }

  // ═══════════════════════════════════════════════════
  // REGISTRAR USO DE API
  // ═══════════════════════════════════════════════════

  registrarUso(api) {
    const apiLower = resolveApiKey(api);
    
    if (!apiLower || !this.uso[apiLower]) {
      console.warn(`[CONTINGENCIA] API ${api} no configurada`);
      return;
    }
    
    // Incrementar contador
    this.uso[apiLower].count++;
    
    // Verificar límites
    this._verificarLimites(apiLower);
    
    // Guardar
    this._guardarUso();
    
    // Log
    console.log(`[CONTINGENCIA] ${api}: ${this.uso[apiLower].count}/${API_LIMITS[apiLower].limite} (${this.uso[apiLower].modo})`);
  }

  _verificarLimites(api) {
    const config = API_LIMITS[api];
    const uso = this.uso[api];
    
    if (config.limite === Infinity) {
      uso.modo = 'normal';
      return;
    }
    
    if (uso.count >= config.limite) {
      uso.modo = 'agotado';
      console.error(`[CONTINGENCIA] 🔴 ${api}: CRÉDITOS AGOTADOS (${uso.count}/${config.limite})`);
    } else if (uso.count >= config.critico) {
      uso.modo = 'critico';
      console.warn(`[CONTINGENCIA] 🟠 ${api}: CRÍTICO (${uso.count}/${config.limite})`);
    } else if (uso.count >= config.alerta) {
      uso.modo = 'alerta';
      console.warn(`[CONTINGENCIA] 🟡 ${api}: ALERTA (${uso.count}/${config.limite})`);
    } else {
      uso.modo = 'normal';
    }
  }

  _guardarUso() {
    try {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
      fs.writeFileSync(DB_PATH, JSON.stringify(this.uso, null, 2));
    } catch (e) {
      console.error('[CONTINGENCIA] Error guardando uso:', e.message);
    }
  }

  // ═══════════════════════════════════════════════════
  // VERIFICAR SI API ESTÁ DISPONIBLE
  // ═══════════════════════════════════════════════════

  estaDisponible(api) {
    const apiLower = resolveApiKey(api);
    
    if (!apiLower || !this.uso[apiLower]) {
      return true;
    }
    
    // APIs ilimitadas siempre disponibles
    if (API_LIMITS[apiLower].limite === Infinity) {
      return true;
    }
    
    // Verificar modo
    return this.uso[apiLower].modo !== 'agotado';
  }

  // ═══════════════════════════════════════════════════
  // OBTENER PRIORIDAD DE COURIERS
  // ═══════════════════════════════════════════════════

  obtenerPrioridad() {
    // Filtrar couriers disponibles
    const disponibles = this.couriersPrioridad.filter(courier => {
      if (courier.ilimitado) return true;
      
      // Verificar si API está disponible
      if (courier.tipo === 'api') {
        return this.estaDisponible(courier.nombre);
      }
      
      return true;
    });
    
    // Ordenar por prioridad
    disponibles.sort((a, b) => a.prioridad - b.prioridad);
    
    return disponibles;
  }

  // ═══════════════════════════════════════════════════
  // RESETEAR USO DE API (cuando cambia el periodo)
  // ═══════════════════════════════════════════════════

  resetearUso(api) {
    const apiLower = resolveApiKey(api);
    
    if (!apiLower || !this.uso[apiLower]) {
      return false;
    }
    
    const config = API_LIMITS[apiLower];
    
    if (config.periodo === 'forever') {
      return false;  // No reset para ilimitados
    }
    
    this.uso[apiLower] = {
      count: 0,
      periodoInicio: this._inicioPeriodo(new Date(), config.periodo),
      ultimoReset: new Date().toISOString(),
      activo: true,
      modo: 'normal'
    };
    
    this._guardarUso();
    console.log(`[CONTINGENCIA] ✅ ${api}: Uso reseteado`);
    
    return true;
  }

  // ═══════════════════════════════════════════════════
  // VERIFICAR RESETS AUTOMÁTICOS
  // ═══════════════════════════════════════════════════

  verificarResets() {
    const ahora = new Date();
    
    for (const [api, uso] of Object.entries(this.uso)) {
      const config = API_LIMITS[api];
      
      if (config.periodo === 'forever') continue;
      
      const periodoInicio = new Date(uso.periodoInicio);
      let debeResetear = false;
      
      if (config.periodo === 'month' && ahora.getMonth() !== periodoInicio.getMonth()) {
        debeResetear = true;
      } else if (config.periodo === 'year' && ahora.getFullYear() !== periodoInicio.getFullYear()) {
        debeResetear = true;
      }
      
      if (debeResetear) {
        this.resetearUso(api);
      }
    }
  }

  // ═══════════════════════════════════════════════════
  // OBTENER ESTADO DE APIs
  // ═══════════════════════════════════════════════════

  obtenerEstado() {
    const estado = {};
    
    for (const [api, config] of Object.entries(API_LIMITS)) {
      const uso = this.uso[api];
      
      estado[api] = {
        count: uso.count,
        limite: config.limite === Infinity ? 'Ilimitado' : config.limite,
        porcentaje: config.limite === Infinity ? 0 : Math.round((uso.count / config.limite) * 100),
        modo: uso.modo,
        periodo: config.periodo,
        disponible: this.estaDisponible(api)
      };
    }
    
    return estado;
  }

  // ═══════════════════════════════════════════════════
  // OBTENER ESTADÍSTICAS
  // ═══════════════════════════════════════════════════

  obtenerEstadisticas() {
    const estado = this.obtenerEstado();
    
    const total = Object.values(estado).reduce((sum, api) => sum + api.count, 0);
    const agotadas = Object.values(estado).filter(api => api.modo === 'agotado').length;
    const criticas = Object.values(estado).filter(api => api.modo === 'critico').length;
    const alerta = Object.values(estado).filter(api => api.modo === 'alerta').length;
    
    return {
      total_usos: total,
      apis_agotadas: agotadas,
      apis_criticas: criticas,
      apis_alerta: alerta,
      apis_normales: Object.keys(estado).length - agotadas - criticas - alerta,
      detalle: estado
    };
  }
}

// ═══════════════════════════════════════════════════
// EXPORTAR INSTANCIA ÚNICA
// ═══════════════════════════════════════════════════

const contingencia = new ContingenciaAPI();

// Verificar resets cada hora
const contingenciaResetInterval = setInterval(() => {
  contingencia.verificarResets();
}, 3600000);

contingenciaResetInterval.unref?.();

module.exports = contingencia;
