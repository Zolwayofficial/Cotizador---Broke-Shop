const { MemoriaAgente } = require('./MemoriaAgente');

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

function formatDaysUntilExpiry(vigenciaHasta, nowMs = Date.now()) {
  const vencimiento = new Date(vigenciaHasta).getTime();
  if (!Number.isFinite(vencimiento)) {
    return null;
  }

  const remainingMs = vencimiento - nowMs;
  if (remainingMs <= 0) {
    return null;
  }

  return Math.max(1, Math.ceil(remainingMs / 86400000));
}

function formatDaysLabel(days) {
  return `${days} ${days === 1 ? 'dia' : 'dias'}`;
}

class AgenteNavegadorINDECOPI {
  constructor() {
    this.nombreAgente = 'INDECOPI';
    this.memoria = null;
    this.cache = new Map();
  }

  async init() {
    this.memoria = new MemoriaAgente(this.nombreAgente);
  }

  async consultarAntidumping(producto, pais) {
    const productKey = this._normalizarClave(producto);
    const countryKey = this._normalizarClave(pais);
    const cacheKey = `indecopi_${productKey}_${countryKey}`;

    const cached = this._obtenerDeCache(cacheKey);
    if (cached) {
      console.log(`[INDECOPI] Cache para ${productKey}`);
      return cached;
    }

    const aprendizajeKey = `antidumping_${productKey}_${countryKey}`;
    const aprendizaje = this.memoria ? this.memoria.obtenerAprendizaje(aprendizajeKey) : null;
    if (aprendizaje) {
      console.log('[INDECOPI] Usando aprendizaje previo');
      return cloneSerializable(aprendizaje.valor);
    }

    const resultado = await this._consultarAntidumpingLocal(producto, pais);

    this._guardarEnCache(cacheKey, resultado, 86400000);
    if (this.memoria) {
      this.memoria.guardarAprendizaje(aprendizajeKey, cloneSerializable(resultado), 0.95);
    }

    if (resultado.tieneAntidumping && resultado.vigenciaHasta) {
      this._verificarVencimiento(resultado);
    }

    return cloneSerializable(resultado);
  }

  async listarMedidasAplicables() {
    const cacheKey = 'indecopi_medidas_aplicables';
    const cached = this._obtenerDeCache(cacheKey);
    if (cached) {
      return cached;
    }

    const resultado = {
      total: 0,
      medidas: [],
      actualizado: new Date().toISOString(),
    };

    this._guardarEnCache(cacheKey, resultado, 86400000);
    return resultado;
  }

  async detectarMedidasPorVencer(dias = 30) {
    const medidas = await this.listarMedidasAplicables();
    const porVencer = [];
    const ahora = Date.now();
    const diasNormalizados = Math.max(0, Number(String(dias ?? 0).replace(',', '.')) || 0);
    console.log(`[INDECOPI] Buscando medidas por vencer en ${formatDaysLabel(diasNormalizados)}...`);
    const limite = ahora + diasNormalizados * 86400000;

    for (const medida of medidas.medidas) {
      if (!medida.vigenciaHasta) {
        continue;
      }

      const diasParaVencer = formatDaysUntilExpiry(medida.vigenciaHasta, ahora);
      if (diasParaVencer === null) {
        continue;
      }

      const vencimiento = new Date(medida.vigenciaHasta).getTime();
      if (vencimiento > limite) {
        continue;
      }

      const alerta = {
        ...medida,
        diasParaVencer,
        alerta: true,
      };

      porVencer.push(alerta);

      if (this.memoria) {
        this.memoria.enviarAlerta(
          'antidumping_por_vencer',
          `INDECOPI: ${medida.producto} vence en ${formatDaysLabel(diasParaVencer)}`,
          alerta
        );
      }
    }

    if (porVencer.length > 0) {
      console.log(`[INDECOPI] ${porVencer.length} medidas por vencer`);
    }

    return porVencer;
  }

  async _consultarAntidumpingLocal(producto, pais) {
    return {
      producto,
      pais,
      tieneAntidumping: false,
      tasa: 0,
      resolucion: null,
      vigenciaHasta: null,
      fuente: 'INDECOPI',
      actualizado: new Date().toISOString(),
    };
  }

  _verificarVencimiento(medida) {
    if (!this.memoria || !medida?.vigenciaHasta) {
      return;
    }

    const ahora = Date.now();
    const vencimiento = new Date(medida.vigenciaHasta).getTime();
    if (!Number.isFinite(vencimiento)) {
      return;
    }

    const diasParaVencer = formatDaysUntilExpiry(medida.vigenciaHasta, ahora);
    if (diasParaVencer !== null && diasParaVencer <= 30) {
      this.memoria.guardarAprendizaje(
        `alerta_vencimiento_${this._normalizarClave(medida.producto)}`,
        { dias: diasParaVencer, medida },
        1.0
      );
    }
  }

  _normalizarClave(valor) {
    return String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
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

module.exports = AgenteNavegadorINDECOPI;
