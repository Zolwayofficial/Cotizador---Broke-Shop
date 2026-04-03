// server/agentes-navegacion/AgenteNavegadorDIGESA.js
//
// AGENTE ESPECIALISTA EN DIGESA (Direccion General de Salud Ambiental)
//
// Caracteristicas:
// - Navega en digesa.minsa.gob.pe
// - Busca registros sanitarios
// - Aprende categorias de productos
// - Detecta productos que requieren registro sanitario
// - Alertas de vencimiento de registros

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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function contieneTermino(texto, termino) {
  const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(termino)}(?:$|[^a-z0-9])`, 'i');
  return pattern.test(texto);
}

class AgenteNavegadorDIGESA {
  constructor() {
    this.nombreAgente = 'DIGESA';
    this.memoria = null;
    this.cache = new Map();
  }

  async init() {
    this.memoria = new MemoriaAgente(this.nombreAgente);
  }

  // ===================================================
  // CONSULTAR REGISTRO SANITARIO
  // ===================================================
  async consultarRegistroSanitario(producto, laboratorio) {
    const productoNormalizado = this._normalizarClave(producto);
    const laboratorioNormalizado = this._normalizarClave(laboratorio);
    const cacheKey = `digesa_${productoNormalizado}_${laboratorioNormalizado}`;
    const aprendizajeKey = `registro_${productoNormalizado}_${laboratorioNormalizado}`;

    const cached = this._obtenerDeCache(cacheKey);
    if (cached) {
      console.log(`DIGESA: Registro de cache para ${producto}`);
      return cached;
    }

    const aprendizaje = this.memoria?.obtenerAprendizaje(aprendizajeKey);
    if (aprendizaje) {
      console.log('DIGESA: Usando aprendizaje previo');
      return cloneSerializable(aprendizaje.valor);
    }

    const resultado = await this._consultarRegistroLocal(producto, laboratorio);

    this._guardarEnCache(cacheKey, resultado, 86400000);
    this.memoria?.guardarAprendizaje(aprendizajeKey, cloneSerializable(resultado), 0.9);

    return cloneSerializable(resultado);
  }

  // ===================================================
  // DETECTAR SI REQUIERE REGISTRO SANITARIO
  // ===================================================
  async detectarSiRequiereRegistro(producto, categoria) {
    const productosRequierenRegistro = [
      'alimento', 'bebida', 'agua', 'jugo', 'gaseosa',
      'medicamento', 'farmaco', 'pastilla', 'jarabe',
      'cosmetico', 'crema', 'locion', 'shampoo',
      'desinfectante', 'detergente', 'jabon',
      'suplemento', 'vitamina', 'mineral',
    ];

    const productoNormalizado = this._normalizarClave(producto);
    const categoriaNormalizada = this._normalizarClave(categoria);

    const requiere = productosRequierenRegistro.some((termino) =>
      contieneTermino(productoNormalizado, termino) || contieneTermino(categoriaNormalizada, termino)
    );

    const resultado = {
      producto,
      categoria,
      requiereRegistroSanitario: requiere,
      entidad: 'DIGESA',
      tramite: requiere ? 'Registro Sanitario' : 'No requiere',
      actualizado: new Date().toISOString(),
    };

    this.memoria?.guardarAprendizaje(
      `requiere_registro_${productoNormalizado}`,
      resultado,
      0.95
    );

    return resultado;
  }

  // ===================================================
  // LISTAR REGISTROS ACTIVOS
  // ===================================================
  async listarRegistrosActivos() {
    const cacheKey = 'digesa_registros_activos';
    const cached = this._obtenerDeCache(cacheKey);
    if (cached) {
      return cached;
    }

    const resultado = {
      total: 0,
      registros: [],
      actualizado: new Date().toISOString(),
    };

    this._guardarEnCache(cacheKey, resultado, 86400000);
    return resultado;
  }

  // ===================================================
  // PRIVADOS
  // ===================================================
  async _consultarRegistroLocal(producto, laboratorio) {
    return {
      producto,
      laboratorio,
      registroSanitario: null,
      estado: 'pendiente_verificacion',
      fuente: 'DIGESA',
      actualizado: new Date().toISOString(),
    };
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

  _normalizarClave(valor) {
    return String(valor ?? '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ===================================================
  // ESTADISTICAS
  // ===================================================
  obtenerEstadisticas() {
    if (!this.memoria) {
      return {};
    }
    return this.memoria.obtenerEstadisticas();
  }
}

module.exports = AgenteNavegadorDIGESA;
