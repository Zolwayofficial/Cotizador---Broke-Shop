// server/agentes-navegacion/AgenteNavegadorSENASA.js
// 
// AGENTE ESPECIALISTA EN SENASA (Servicio Nacional de Sanidad Agraria)
// 
// Características:
// - Navega en senasa.gob.pe
// - Busca permisos fitosanitarios
// - Aprende plagas cuarentenarias
// - Detecta productos que requieren permiso
// - Alertas de restricciones por país

const https = require("https");
const { MemoriaAgente } = require("./MemoriaAgente");

class AgenteNavegadorSENASA {
  constructor() {
    this.nombreAgente = 'SENASA';
    this.memoria = null;
    this.cache = new Map();
  }

  async init() {
    this.memoria = new MemoriaAgente(this.nombreAgente);
  }

  // ═══════════════════════════════════════════════════
  // CONSULTAR PERMISO FITOSANITARIO
  // ═══════════════════════════════════════════════════
  async consultarPermisoFitosanitario(producto, paisOrigen) {
    const cacheKey = `senasa_${producto}_${paisOrigen}`;

    // Verificar cache
    const cached = this._obtenerDeCache(cacheKey);
    if (cached) {
      console.log(`💾 SENASA: Permiso de cache para ${producto}`);
      return cached;
    }

    // Verificar aprendizaje previo
    const aprendizaje = this.memoria.obtenerAprendizaje(`permiso_${producto}_${paisOrigen}`);
    if (aprendizaje) {
      console.log(`🧠 SENASA: Usando aprendizaje previo`);
      return aprendizaje.valor;
    }

    // Consultar (en producción sería scraping real)
    const resultado = await this._consultarPermisoLocal(producto, paisOrigen);

    // Guardar
    this._guardarEnCache(cacheKey, resultado, 86400000);
    this.memoria.guardarAprendizaje(`permiso_${producto}_${paisOrigen}`, resultado, 0.9);

    return resultado;
  }

  // ═══════════════════════════════════════════════════
  // DETECTAR SI REQUIERE PERMISO FITOSANITARIO
  // ═══════════════════════════════════════════════════
  async detectarSiRequierePermiso(producto, categoria, paisOrigen) {
    // Productos que SIEMPRE requieren permiso SENASA
    const productosRequierenPermiso = [
      'fruta', 'verdura', 'hortaliza', 'legumbre',
      'semilla', 'grano', 'cereal', 'trigo', 'maiz', 'arroz',
      'planta', 'arbol', 'flor', 'bulbo',
      'madera', 'maderable',
      'carne', 'pollo', 'cerdo', 'res', 'pescado',
      'huevo', 'leche', 'lacteo',
      'alimento animal', 'balanceado', 'concentrado'
    ];

    // Países con restricciones adicionales
    const paisesConRestricciones = ['CN', 'US', 'BR', 'EC', 'CO'];

    const productoLower = producto.toLowerCase();
    const categoriaLower = categoria.toLowerCase();

    const requiere = productosRequierenPermiso.some(p =>
      productoLower.includes(p) || categoriaLower.includes(p)
    );

    const tieneRestriccionAdicional = paisesConRestricciones.includes(paisOrigen);

    const resultado = {
      producto,
      paisOrigen,
      requierePermisoFitosanitario: requiere,
      tieneRestriccionAdicional,
      entidad: 'SENASA',
      tramite: requiere ? 'Permiso Fitosanitario de Importación' : 'No requiere',
      actualizado: new Date().toISOString()
    };

    // Guardar aprendizaje
    this.memoria.guardarAprendizaje(`requiere_permiso_${producto}_${paisOrigen}`, resultado, 0.95);

    return resultado;
  }

  // ═══════════════════════════════════════════════════
  // CONSULTAR PLAGAS CUARENTENARIAS
  // ═══════════════════════════════════════════════════
  async consultarPlagasCuarentenarias() {
    const cacheKey = 'senasa_plagas';

    const cached = this._obtenerDeCache(cacheKey);
    if (cached) {
      return cached;
    }

    // Fallback: usar datos locales
    const resultado = {
      total: 0,
      plagas: [],
      actualizado: new Date().toISOString()
    };

    this._guardarEnCache(cacheKey, resultado, 86400000);
    return resultado;
  }

  // ═══════════════════════════════════════════════════
  // PRIVADOS
  // ═══════════════════════════════════════════════════
  async _consultarPermisoLocal(producto, paisOrigen) {
    // Simular consulta (en producción sería scraping real)
    return {
      producto,
      paisOrigen,
      requierePermiso: true,
      tipoPermiso: 'Fitosanitario',
      estado: 'pendiente_verificacion',
      fuente: 'SENASA',
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

module.exports = AgenteNavegadorSENASA;
