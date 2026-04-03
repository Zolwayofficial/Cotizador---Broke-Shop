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

class AgenteNavegadorMTC {
  constructor() {
    this.nombreAgente = 'MTC';
    this.memoria = null;
    this.cache = new Map();
  }

  async init() {
    this.memoria = new MemoriaAgente(this.nombreAgente);
  }

  async consultarHomologacion(producto, marca, modelo) {
    const productKey = this._normalizarClave(producto);
    const brandKey = this._normalizarClave(marca);
    const modelKey = this._normalizarClave(modelo);
    const cacheKey = `mtc_${productKey}_${brandKey}_${modelKey}`;

    const cached = this._obtenerDeCache(cacheKey);
    if (cached) {
      console.log(`[MTC] Cache para ${productKey}`);
      return cached;
    }

    const aprendizajeKey = `homologacion_${productKey}_${brandKey}_${modelKey}`;
    const aprendizaje = this.memoria ? this.memoria.obtenerAprendizaje(aprendizajeKey) : null;
    if (aprendizaje) {
      console.log('[MTC] Usando aprendizaje previo');
      return cloneSerializable(aprendizaje.valor);
    }

    const resultado = await this._consultarHomologacionLocal(producto, marca, modelo);

    this._guardarEnCache(cacheKey, resultado, 86400000);
    if (this.memoria) {
      this.memoria.guardarAprendizaje(aprendizajeKey, cloneSerializable(resultado), 0.9);
    }

    return cloneSerializable(resultado);
  }

  async listarProductosHomologados() {
    const cacheKey = 'mtc_homologados';
    const cached = this._obtenerDeCache(cacheKey);
    if (cached) {
      return cached;
    }

    const resultado = {
      total: 0,
      productos: [],
      actualizado: new Date().toISOString(),
    };

    this._guardarEnCache(cacheKey, resultado, 86400000);
    return resultado;
  }

  async detectarSiRequiereHomologacion(producto, categoria) {
    const productosRequierenHomologacion = [
      'router', 'switch', 'modem', 'antena', 'radio',
      'celular', 'telefono', 'smartphone',
      'wifi', 'bluetooth', 'gps', 'transmisor',
      'equipos de telecomunicaciones', 'equipos de radio',
    ];

    const productoLower = this._normalizarTexto(producto).toLowerCase();
    const categoriaLower = this._normalizarTexto(categoria).toLowerCase();

    const requiere = productosRequierenHomologacion.some((keyword) =>
      productoLower.includes(keyword) || categoriaLower.includes(keyword)
    );

    const resultado = {
      producto,
      categoria,
      requiereHomologacion: requiere,
      entidad: 'MTC',
      tramite: 'Certificado de Homologacion',
      actualizado: new Date().toISOString(),
    };

    if (this.memoria) {
      this.memoria.guardarAprendizaje(`requiere_homologacion_${this._normalizarClave(producto)}`, resultado, 0.95);
    }

    return resultado;
  }

  async _consultarHomologacionLocal(producto, marca, modelo) {
    return {
      producto,
      marca,
      modelo,
      requiereHomologacion: true,
      estado: 'pendiente_verificacion',
      fuente: 'MTC',
      actualizado: new Date().toISOString(),
    };
  }

  _normalizarClave(valor) {
    return this._normalizarTexto(valor).toUpperCase();
  }

  _normalizarTexto(valor) {
    return String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
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

module.exports = AgenteNavegadorMTC;
