// server/agentes-navegacion/AgenteNavegadorDIGESA.js
// 
// AGENTE ESPECIALISTA EN DIGESA (Dirección General de Salud Ambiental)
// 
// Características:
// - Navega en digesa.minsa.gob.pe
// - Busca registros sanitarios
// - Aprende categorías de productos
// - Detecta productos que requieren registro sanitario
// - Alertas de vencimiento de registros

const https = require("https");
const { MemoriaAgente } = require("./MemoriaAgente");

class AgenteNavegadorDIGESA {
  constructor() {
    this.nombreAgente = 'DIGESA';
    this.memoria = null;
    this.cache = new Map();
  }

  async init() {
    this.memoria = new MemoriaAgente(this.nombreAgente);
  }

  // ═══════════════════════════════════════════════════
  // CONSULTAR REGISTRO SANITARIO
  // ═══════════════════════════════════════════════════
  async consultarRegistroSanitario(producto, laboratorio) {
    const cacheKey = `digesa_${producto}_${laboratorio}`;

    // Verificar cache
    const cached = this._obtenerDeCache(cacheKey);
    if (cached) {
      console.log(`💾 DIGESA: Registro de cache para ${producto}`);
      return cached;
    }

    // Verificar aprendizaje previo
    const aprendizaje = this.memoria.obtenerAprendizaje(`registro_${producto}`);
    if (aprendizaje) {
      console.log(`🧠 DIGESA: Usando aprendizaje previo`);
      return aprendizaje.valor;
    }

    // Consultar (en producción sería scraping real)
    const resultado = await this._consultarRegistroLocal(producto, laboratorio);

    // Guardar
    this._guardarEnCache(cacheKey, resultado, 86400000);
    this.memoria.guardarAprendizaje(`registro_${producto}`, resultado, 0.9);

    return resultado;
  }

  // ═══════════════════════════════════════════════════
  // DETECTAR SI REQUIERE REGISTRO SANITARIO
  // ═══════════════════════════════════════════════════
  async detectarSiRequiereRegistro(producto, categoria) {
    // Productos que SIEMPRE requieren registro sanitario DIGESA
    const productosRequierenRegistro = [
      'alimento', 'bebida', 'agua', 'jugo', 'gaseosa',
      'medicamento', 'farmaco', 'pastilla', 'jarabe',
      'cosmetico', 'crema', 'locion', 'shampoo',
      'desinfectante', 'detergente', 'jabon',
      'suplemento', 'vitamina', 'mineral'
    ];

    const productoLower = producto.toLowerCase();
    const categoriaLower = categoria.toLowerCase();

    const requiere = productosRequierenRegistro.some(p =>
      productoLower.includes(p) || categoriaLower.includes(p)
    );

    const resultado = {
      producto,
      categoria,
      requiereRegistroSanitario: requiere,
      entidad: 'DIGESA',
      tramite: requiere ? 'Registro Sanitario' : 'No requiere',
      actualizado: new Date().toISOString()
    };

    // Guardar aprendizaje
    this.memoria.guardarAprendizaje(`requiere_registro_${producto}`, resultado, 0.95);

    return resultado;
  }

  // ═══════════════════════════════════════════════════
  // LISTAR REGISTROS ACTIVOS
  // ═══════════════════════════════════════════════════
  async listarRegistrosActivos() {
    const cacheKey = 'digesa_registros_activos';

    const cached = this._obtenerDeCache(cacheKey);
    if (cached) {
      return cached;
    }

    // Fallback: usar datos locales
    const resultado = {
      total: 0,
      registros: [],
      actualizado: new Date().toISOString()
    };

    this._guardarEnCache(cacheKey, resultado, 86400000);
    return resultado;
  }

  // ═══════════════════════════════════════════════════
  // PRIVADOS
  // ═══════════════════════════════════════════════════
  async _consultarRegistroLocal(producto, laboratorio) {
    // Simular consulta (en producción sería scraping real)
    return {
      producto,
      laboratorio,
      registroSanitario: null,
      estado: 'pendiente_verificacion',
      fuente: 'DIGESA',
      actualizado: new Date().toISOString()
    };
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

module.exports = AgenteNavegadorDIGESA;
