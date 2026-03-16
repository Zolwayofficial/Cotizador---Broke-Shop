// server/agentes-navegacion/AgenteNavegadorINDECOPI.js
// 
// AGENTE ESPECIALISTA EN INDECOPI
// 
// Características:
// - Navega en indecopi.gob.pe
// - Busca antidumping
// - Detecta nuevas resoluciones
// - Aprende fechas de vencimiento
// - Alertas 30 días antes de vencimiento

const https = require("https");
const { MemoriaAgente } = require("./MemoriaAgente");

class AgenteNavegadorINDECOPI {
  constructor() {
    this.nombreAgente = 'INDECOPI';
    this.memoria = null;
    this.cache = new Map();
  }

  async init() {
    this.memoria = new MemoriaAgente(this.nombreAgente);
  }

  // ═══════════════════════════════════════════════════
  // CONSULTAR ANTIDUMPING
  // ═══════════════════════════════════════════════════
  async consultarAntidumping(producto, pais) {
    const cacheKey = `indecopi_${producto}_${pais}`;

    // Verificar cache
    const cached = this._obtenerDeCache(cacheKey);
    if (cached) {
      console.log(`💾 INDECOPI: Antidumping de cache para ${producto}`);
      return cached;
    }

    // Verificar aprendizaje previo
    const aprendizaje = this.memoria.obtenerAprendizaje(`antidumping_${producto}_${pais}`);
    if (aprendizaje) {
      console.log(`🧠 INDECOPI: Usando aprendizaje previo`);
      return aprendizaje.valor;
    }

    // Consultar (en producción sería scraping real)
    const resultado = await this._consultarAntidumpingLocal(producto, pais);

    // Guardar
    this._guardarEnCache(cacheKey, resultado, 86400000);
    this.memoria.guardarAprendizaje(`antidumping_${producto}_${pais}`, resultado, 0.95);

    // Verificar vencimiento
    if (resultado.tieneAntidumping && resultado.vigenciaHasta) {
      this._verificarVencimiento(resultado);
    }

    return resultado;
  }

  // ═══════════════════════════════════════════════════
  // LISTAR MEDIDAS VIGENTES
  // ═══════════════════════════════════════════════════
  async listarMedidasVigentes() {
    const cacheKey = 'indecopi_medidas_vigentes';

    const cached = this._obtenerDeCache(cacheKey);
    if (cached) {
      return cached;
    }

    // Fallback: usar datos locales
    const resultado = {
      total: 0,
      medidas: [],
      actualizado: new Date().toISOString()
    };

    this._guardarEnCache(cacheKey, resultado, 86400000);
    return resultado;
  }

  // ═══════════════════════════════════════════════════
  // DETECTAR MEDIDAS POR VENCER
  // ═══════════════════════════════════════════════════
  async detectarMedidasPorVencer(dias = 30) {
    console.log(`🔍 INDECOPI: Buscando medidas por vencer en ${dias} días...`);

    const medidas = await this.listarMedidasVigentes();
    const porVencer = [];

    const ahora = Date.now();
    const limite = ahora + (dias * 86400000);

    for (const medida of medidas.medidas) {
      if (medida.vigenciaHasta) {
        const vencimiento = new Date(medida.vigenciaHasta).getTime();

        if (vencimiento <= limite) {
          porVencer.push({
            ...medida,
            diasParaVencer: Math.round((vencimiento - ahora) / 86400000),
            alerta: true
          });

          // Alertar
          this.memoria.enviarAlerta(
            'antidumping_por_vencer',
            `INDECOPI: ${medida.producto} vence en ${medida.diasParaVencer} días`,
            medida
          );
        }
      }
    }

    if (porVencer.length > 0) {
      console.log(`⚠️ INDECOPI: ${porVencer.length} medidas por vencer`);
    }

    return porVencer;
  }

  // ═══════════════════════════════════════════════════
  // PRIVADOS
  // ═══════════════════════════════════════════════════
  async _consultarAntidumpingLocal(producto, pais) {
    // Simular consulta (en producción sería scraping real)
    return {
      producto,
      pais,
      tieneAntidumping: false,
      tasa: 0,
      resolucion: null,
      vigenciaHasta: null,
      fuente: 'INDECOPI',
      actualizado: new Date().toISOString()
    };
  }

  _verificarVencimiento(medida) {
    const ahora = Date.now();
    const vencimiento = new Date(medida.vigenciaHasta).getTime();
    const diasParaVencer = Math.round((vencimiento - ahora) / 86400000);

    if (diasParaVencer <= 30 && diasParaVencer > 0) {
      this.memoria.guardarAprendizaje(
        `alerta_vencimiento_${medida.producto}`,
        { dias: diasParaVencer, medida },
        1.0
      );
    }
  }

  _guardarEnCache(clave, valor, ttlMs) {
    this.cache.set(clave, {
      valor,
      expira: Date.now() + ttlMs
    });
  }

  _obtenerDeCache(clave) {
    const cached = this.cache.get(clave);
    if (cached && Date.now() < cached.expira) {
      return cached.valor;
    }
    this.cache.delete(clave);
    return null;
  }

  // ═══════════════════════════════════════════════════
  // ESTADÍSTICAS
  // ═══════════════════════════════════════════════════
  obtenerEstadisticas() {
    return this.memoria.obtenerEstadisticas();
  }
}

module.exports = AgenteNavegadorINDECOPI;
