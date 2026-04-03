const { MemoriaAgente } = require('./MemoriaAgente');
const { normalizarCodigoPais, normalizarPaisParaRuta } = require('../paises');

function cloneSerializable(value) {
  if (value === null || value === undefined) {
    return value;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return value;
  }
}

class AgenteNavegadorVUCE {
  constructor() {
    this.nombreAgente = 'VUCE';
    this.memoria = null;
    this.cache = new Map();
  }

  async init() {
    this.memoria = new MemoriaAgente(this.nombreAgente);
  }

  async consultarRestricciones(partida, pais = 'CN') {
    const hs = this._normalizarPartida(partida);
    const country = this._normalizarPais(pais);
    const cacheKey = `vuce_${hs}_${country}`;

    const cached = this._obtenerDeCache(cacheKey);
    if (cached) {
      console.log(`[VUCE] Cache para ${hs}/${country}`);
      return cached;
    }

    const aprendizajeKey = `restricciones_${hs}_${country}`;
    const aprendizaje = this.memoria ? this.memoria.obtenerAprendizaje(aprendizajeKey) : null;
    if (aprendizaje) {
      console.log(`[VUCE] Aprendizaje previo para ${hs}/${country}`);
      return cloneSerializable(aprendizaje.valor);
    }

    const restricciones = await this._consultarRestriccionesLocales(hs, country);

    this._guardarEnCache(cacheKey, restricciones, 7200000);
    if (this.memoria) {
      this.memoria.guardarAprendizaje(aprendizajeKey, cloneSerializable(restricciones), 0.9);
    }

    return cloneSerializable(restricciones);
  }

  async detectarNuevosPermisos() {
    console.log('[VUCE] Buscando nuevos permisos...');

    const permisosActuales = this.memoria ? this.memoria.obtenerAprendizaje('permisos_actuales') : null;
    if (!permisosActuales) {
      console.log('[VUCE] No hay registro previo de permisos');
      return [];
    }

    const cambios = [];

    if (cambios.length > 0 && this.memoria) {
      this.memoria.enviarAlerta('permisos_cambiaron', `VUCE: ${cambios.length} permisos cambiaron`, { cambios });
    }

    return cambios;
  }

  async listarTodasRestricciones() {
    const cacheKey = 'vuce_todas_restricciones';
    const cached = this._obtenerDeCache(cacheKey);
    if (cached) {
      return cached;
    }

    const resultado = {
      total: 0,
      restricciones: [],
      actualizado: new Date().toISOString(),
    };

    this._guardarEnCache(cacheKey, resultado, 86400000);
    return resultado;
  }

  async _consultarRestriccionesLocales(partida, pais) {
    return {
      partida,
      pais,
      restricciones: [],
      permisos_requeridos: [],
      actualizado: new Date().toISOString(),
    };
  }

  _normalizarPartida(partida) {
    const normalized = String(partida || '')
      .replace(/\D/g, '')
      .slice(0, 10);

    if (!normalized) {
      return '';
    }

    return normalized.padEnd(10, '0');
  }

  _normalizarPais(pais) {
    return normalizarCodigoPais(pais) || normalizarPaisParaRuta(pais) || 'CN';
  }

  _guardarEnCache(clave, valor, ttlMs) {
    this.cache.set(clave, {
      valor: cloneSerializable(valor),
      expira: Date.now() + ttlMs,
    });
  }

  _obtenerDeCache(clave) {
    const cached = this.cache.get(clave);
    if (cached && Date.now() < cached.expira) {
      return cloneSerializable(cached.valor);
    }
    this.cache.delete(clave);
    return null;
  }

  obtenerEstadisticas() {
    return this.memoria ? this.memoria.obtenerEstadisticas() : {};
  }
}

module.exports = AgenteNavegadorVUCE;
