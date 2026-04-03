// server/couriers/contingencia-api.js
//
// SISTEMA DE CONTINGENCIA PARA APIS
//
// Features:
// - Monitoreo de creditos de APIs
// - Alertas cuando los creditos estan bajos
// - Switch automatico a fallback
// - Priorizacion de APIs sin cuota
// - Registro de uso de APIs

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(process.env.DATA_DIR || './data', 'api-usage.json');

// ------------------------------------------------------------
// CONFIGURACION DE LIMITES DE APIS
// ------------------------------------------------------------

const API_LIMITS = {
  shippo: {
    limite: 5000,
    periodo: 'year',
    alerta: 4000,
    critico: 4500,
  },
  easypost: {
    limite: 120000,
    periodo: 'year',
    alerta: 100000,
    critico: 110000,
  },
  aftership: {
    limite: 100,
    periodo: 'month',
    alerta: 80,
    critico: 90,
  },
  packsend: {
    limite: Infinity,
    periodo: 'forever',
    alerta: null,
    critico: null,
  },
  interparcel: {
    limite: Infinity,
    periodo: 'forever',
    alerta: null,
    critico: null,
  },
  parcelmonkey: {
    limite: Infinity,
    periodo: 'forever',
    alerta: null,
    critico: null,
  },
  maersk: {
    limite: 1000,
    periodo: 'month',
    alerta: 800,
    critico: 900,
  },
  msc: {
    limite: 1000,
    periodo: 'month',
    alerta: 800,
    critico: 900,
  },
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
  'parcel monkey (sin cuota local)': 'parcelmonkey',
  maersk: 'maersk',
  'maersk spot api': 'maersk',
  msc: 'msc',
  'msc spot api': 'msc',
};

function resolveApiKey(api) {
  const normalized = String(api || '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return API_NAME_ALIASES[normalized] || (API_LIMITS[normalized] ? normalized : null);
}

// ------------------------------------------------------------
// CLASE DE CONTINGENCIA
// ------------------------------------------------------------

class ContingenciaAPI {
  constructor() {
    this.uso = this._cargarUso();
    this.couriersPrioridad = [];
    this._inicializarPrioridad();
  }

  // ------------------------------------------------------------
  // CARGAR USO DE APIS
  // ------------------------------------------------------------

  _cargarUso() {
    try {
      if (fs.existsSync(DB_PATH)) {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('[CONTINGENCIA] Error cargando uso:', e.message);
    }

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
        modo: 'normal',
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
      return new Date('2026-01-01').toISOString();
    }

    return inicio.toISOString();
  }

  // ------------------------------------------------------------
  // INICIALIZAR PRIORIDAD DE COURIERS
  // ------------------------------------------------------------

  _inicializarPrioridad() {
    this.couriersPrioridad = [
      { nombre: 'Pack & Send', tipo: 'api', prioridad: 1, cuotaLocalRastreada: false },
      { nombre: 'Interparcel', tipo: 'api', prioridad: 1, cuotaLocalRastreada: false },
      { nombre: 'Parcel Monkey', tipo: 'api', prioridad: 1, cuotaLocalRastreada: false },
      { nombre: 'DHL Directo (Contrato)', tipo: 'personalizado', prioridad: 2, cuotaLocalRastreada: false },
      { nombre: 'FedEx Directo (Contrato)', tipo: 'personalizado', prioridad: 2, cuotaLocalRastreada: false },
      { nombre: 'UPS Directo (Contrato)', tipo: 'personalizado', prioridad: 2, cuotaLocalRastreada: false },
      { nombre: 'TNT Directo (Contrato)', tipo: 'personalizado', prioridad: 2, cuotaLocalRastreada: false },
      { nombre: 'USPS Directo (Contrato)', tipo: 'personalizado', prioridad: 2, cuotaLocalRastreada: false },
      { nombre: 'Maersk', tipo: 'naviera', prioridad: 2, cuotaLocalRastreada: false },
      { nombre: 'MSC', tipo: 'naviera', prioridad: 2, cuotaLocalRastreada: false },
      { nombre: 'Hapag-Lloyd', tipo: 'naviera', prioridad: 2, cuotaLocalRastreada: false },
      { nombre: 'CMA CGM', tipo: 'naviera', prioridad: 2, cuotaLocalRastreada: false },
      { nombre: 'COSCO', tipo: 'naviera', prioridad: 2, cuotaLocalRastreada: false },
      { nombre: 'Shippo', tipo: 'api', prioridad: 3, cuotaLocalRastreada: true },
      { nombre: 'EasyPost', tipo: 'api', prioridad: 3, cuotaLocalRastreada: true },
      { nombre: 'AfterShip', tipo: 'api', prioridad: 3, cuotaLocalRastreada: true },
      { nombre: 'Referencial', tipo: 'fallback', prioridad: 4, cuotaLocalRastreada: false },
    ];
  }

  // ------------------------------------------------------------
  // REGISTRAR USO DE API
  // ------------------------------------------------------------

  registrarUso(api) {
    const apiLower = resolveApiKey(api);

    if (!apiLower || !this.uso[apiLower]) {
      console.warn(`[CONTINGENCIA] API ${api} no configurada`);
      return;
    }

    this.uso[apiLower].count++;
    this._verificarLimites(apiLower);
    this._guardarUso();

    console.log(
      `[CONTINGENCIA] ${api}: ${this.uso[apiLower].count}/${API_LIMITS[apiLower].limite} (${this.uso[apiLower].modo})`
    );
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
      console.error(`[CONTINGENCIA] ALERTA ${api}: CREDITOS AGOTADOS (${uso.count}/${config.limite})`);
    } else if (uso.count >= config.critico) {
      uso.modo = 'critico';
      console.warn(`[CONTINGENCIA] ALERTA ${api}: CRITICO (${uso.count}/${config.limite})`);
    } else if (uso.count >= config.alerta) {
      uso.modo = 'alerta';
      console.warn(`[CONTINGENCIA] ALERTA ${api}: NIVEL DE ALERTA (${uso.count}/${config.limite})`);
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

  // ------------------------------------------------------------
  // VERIFICAR SI LA API ESTA DISPONIBLE
  // ------------------------------------------------------------

  estaDisponible(api) {
    const apiLower = resolveApiKey(api);

    if (!apiLower || !this.uso[apiLower]) {
      return true;
    }

    if (API_LIMITS[apiLower].limite === Infinity) {
      return true;
    }

    return this.uso[apiLower].modo !== 'agotado';
  }

  // ------------------------------------------------------------
  // OBTENER PRIORIDAD DE COURIERS
  // ------------------------------------------------------------

  obtenerPrioridad() {
    const disponibles = this.couriersPrioridad.filter((courier) => {
      if (!courier.cuotaLocalRastreada) {
        return true;
      }

      if (courier.tipo === 'api') {
        return this.estaDisponible(courier.nombre);
      }

      return true;
    });

    disponibles.sort((a, b) => a.prioridad - b.prioridad);
    return disponibles;
  }

  // ------------------------------------------------------------
  // RESETEAR USO DE API
  // ------------------------------------------------------------

  resetearUso(api) {
    const apiLower = resolveApiKey(api);

    if (!apiLower || !this.uso[apiLower]) {
      return false;
    }

    const config = API_LIMITS[apiLower];

    if (config.periodo === 'forever') {
      return false;
    }

    this.uso[apiLower] = {
      count: 0,
      periodoInicio: this._inicioPeriodo(new Date(), config.periodo),
      ultimoReset: new Date().toISOString(),
      activo: true,
      modo: 'normal',
    };

    this._guardarUso();
    console.log(`[CONTINGENCIA] ${api}: uso reiniciado para el nuevo periodo`);

    return true;
  }

  // ------------------------------------------------------------
  // VERIFICAR RESETS AUTOMATICOS
  // ------------------------------------------------------------

  verificarResets() {
    const ahora = new Date();

    for (const [api, uso] of Object.entries(this.uso)) {
      const config = API_LIMITS[api];

      if (config.periodo === 'forever') {
        continue;
      }

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

  // ------------------------------------------------------------
  // OBTENER ESTADO DE APIS
  // ------------------------------------------------------------

  obtenerEstado() {
    const estado = {};

    for (const [api, config] of Object.entries(API_LIMITS)) {
      const uso = this.uso[api];

      estado[api] = {
        count: uso.count,
        limite: config.limite === Infinity ? 'Sin cuota local' : config.limite,
        porcentaje: config.limite === Infinity ? null : Math.round((uso.count / config.limite) * 100),
        modo: uso.modo,
        periodo: config.periodo,
        disponible: this.estaDisponible(api),
      };
    }

    return estado;
  }

  // ------------------------------------------------------------
  // OBTENER ESTADISTICAS
  // ------------------------------------------------------------

  obtenerEstadisticas() {
    const estado = this.obtenerEstado();

    const total = Object.values(estado).reduce((sum, api) => sum + api.count, 0);
    const agotadas = Object.values(estado).filter((api) => api.modo === 'agotado').length;
    const criticas = Object.values(estado).filter((api) => api.modo === 'critico').length;
    const alerta = Object.values(estado).filter((api) => api.modo === 'alerta').length;

    return {
      total_usos: total,
      apis_agotadas: agotadas,
      apis_criticas: criticas,
      apis_alerta: alerta,
      apis_normales: Object.keys(estado).length - agotadas - criticas - alerta,
      detalle: estado,
    };
  }
}

// ------------------------------------------------------------
// EXPORTAR INSTANCIA UNICA
// ------------------------------------------------------------

const contingencia = new ContingenciaAPI();

const contingenciaResetInterval = setInterval(() => {
  contingencia.verificarResets();
}, 3600000);

contingenciaResetInterval.unref?.();

module.exports = contingencia;
