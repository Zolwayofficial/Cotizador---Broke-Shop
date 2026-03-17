// server/agentes-navegacion/AgenteNavegadorMINAM.js
// 
// AGENTE ESPECIALISTA EN MINAM (Ministerio del Ambiente)
// 
// Características:
// - Navega en gob.pe/minam
// - Busca permisos ambientales
// - Detecta productos peligrosos
// - Alertas de restricciones ambientales
// - Detecta sustancias controladas

const { MemoriaAgente } = require('./MemoriaAgente');

class AgenteNavegadorMINAM {
  constructor() {
    this.nombreAgente = 'MINAM';
    this.memoria = null;
    this.cache = new Map();
  }

  async init() {
    this.memoria = new MemoriaAgente(this.nombreAgente);
  }

  // ═══════════════════════════════════════════════════
  // CONSULTAR PERMISO AMBIENTAL
  // ═══════════════════════════════════════════════════
  async consultarPermisoAmbiental(producto) {
    const cacheKey = `minam_${producto}`;

    // Verificar cache
    const cached = this._obtenerDeCache(cacheKey);
    if (cached) {
      console.log(`💾 MINAM: Permiso de cache para ${producto}`);
      return cached;
    }

    // Verificar aprendizaje previo
    const aprendizaje = this.memoria.obtenerAprendizaje(`permiso_ambiental_${producto}`);
    if (aprendizaje) {
      console.log('🧠 MINAM: Usando aprendizaje previo');
      return aprendizaje.valor;
    }

    // Consultar (en producción sería scraping real)
    const resultado = await this._consultarPermisoLocal(producto);

    // Guardar
    this._guardarEnCache(cacheKey, resultado, 86400000);
    this.memoria.guardarAprendizaje(`permiso_ambiental_${producto}`, resultado, 0.9);

    return resultado;
  }

  // ═══════════════════════════════════════════════════
  // DETECTAR SI REQUIERE PERMISO AMBIENTAL
  // ═══════════════════════════════════════════════════
  async detectarSiRequierePermiso(producto, categoria) {
    // Productos que PUEDEN requerir permiso ambiental MINAM
    const productosRequierenPermiso = [
      'quimico', 'sustancia', 'compuesto',
      'residuo', 'desecho', 'basura',
      'peligroso', 'toxico', 'inflamable', 'corrosivo',
      'radiactivo', 'nuclear',
      'ozono', 'clorofluorocarbono', 'cfc',
      'mercurio', 'plomo', 'cadmio',
      'aceite', 'petroleo', 'combustible'
    ];

    const productoLower = producto.toLowerCase();
    const categoriaLower = categoria.toLowerCase();

    const requiere = productosRequierenPermiso.some(p =>
      productoLower.includes(p) || categoriaLower.includes(p)
    );

    const resultado = {
      producto,
      categoria,
      requierePermisoAmbiental: requiere,
      entidad: 'MINAM',
      tramite: requiere ? 'Permiso Ambiental' : 'No requiere',
      actualizado: new Date().toISOString()
    };

    // Guardar aprendizaje
    this.memoria.guardarAprendizaje(`requiere_permiso_ambiental_${producto}`, resultado, 0.95);

    return resultado;
  }

  // ═══════════════════════════════════════════════════
  // DETECTAR SUSTANCIAS AGOTADORAS DE CAPA DE OZONO
  // ═══════════════════════════════════════════════════
  async detectarSustanciasOzono(producto) {
    const sustanciasOzono = [
      'cfc', 'clorofluorocarbono',
      'hcfc', 'hidroclorofluorocarbono',
      'halon', 'bromuro de metilo',
      'tetracloruro de carbono', 'metilcloroformo'
    ];

    const productoLower = producto.toLowerCase();

    const esSustanciaOzono = sustanciasOzono.some(s => productoLower.includes(s));

    return {
      producto,
      esSustanciaAgotadoraOzono: esSustanciaOzono,
      requiereAutorizacion: esSustanciaOzono,
      entidad: 'MINAM-PRODUCE',
      actualizado: new Date().toISOString()
    };
  }

  // ═══════════════════════════════════════════════════
  // PRIVADOS
  // ═══════════════════════════════════════════════════
  async _consultarPermisoLocal(producto) {
    // Simular consulta (en producción sería scraping real)
    return {
      producto,
      requierePermiso: false,
      tipoPermiso: null,
      estado: 'pendiente_verificacion',
      fuente: 'MINAM',
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

module.exports = AgenteNavegadorMINAM;
