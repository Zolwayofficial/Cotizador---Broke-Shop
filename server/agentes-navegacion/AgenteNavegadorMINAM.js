// server/agentes-navegacion/AgenteNavegadorMINAM.js
//
// AGENTE ESPECIALISTA EN MINAM (Ministerio del Ambiente)
//
// Caracteristicas:
// - Navega en gob.pe/minam
// - Busca permisos ambientales
// - Detecta productos peligrosos
// - Alertas de restricciones ambientales
// - Detecta sustancias controladas

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

class AgenteNavegadorMINAM {
  constructor() {
    this.nombreAgente = 'MINAM';
    this.memoria = null;
    this.cache = new Map();
  }

  async init() {
    this.memoria = new MemoriaAgente(this.nombreAgente);
  }

  async consultarPermisoAmbiental(producto) {
    const productoNormalizado = this._normalizarClave(producto);
    const cacheKey = `minam_${productoNormalizado}`;
    const aprendizajeKey = `permiso_ambiental_${productoNormalizado}`;

    const cached = this._obtenerDeCache(cacheKey);
    if (cached) {
      console.log(`MINAM: Permiso de cache para ${producto}`);
      return cached;
    }

    const aprendizaje = this.memoria?.obtenerAprendizaje(aprendizajeKey);
    if (aprendizaje) {
      console.log('MINAM: Usando aprendizaje previo');
      return cloneSerializable(aprendizaje.valor);
    }

    const resultado = await this._consultarPermisoLocal(producto);

    this._guardarEnCache(cacheKey, resultado, 86400000);
    this.memoria?.guardarAprendizaje(aprendizajeKey, cloneSerializable(resultado), 0.9);

    return cloneSerializable(resultado);
  }

  async detectarSiRequierePermiso(producto, categoria) {
    const productosRequierenPermiso = [
      'quimico', 'sustancia', 'compuesto',
      'residuo', 'desecho', 'basura',
      'peligroso', 'toxico', 'inflamable', 'corrosivo',
      'radiactivo', 'nuclear',
      'ozono', 'clorofluorocarbono', 'cfc',
      'mercurio', 'plomo', 'cadmio',
      'aceite', 'petroleo', 'combustible',
    ];

    const productoNormalizado = this._normalizarClave(producto);
    const categoriaNormalizada = this._normalizarClave(categoria);

    const requiere = productosRequierenPermiso.some((termino) =>
      contieneTermino(productoNormalizado, termino) || contieneTermino(categoriaNormalizada, termino)
    );

    const resultado = {
      producto,
      categoria,
      requierePermisoAmbiental: requiere,
      entidad: 'MINAM',
      tramite: requiere ? 'Permiso Ambiental' : 'No requiere',
      actualizado: new Date().toISOString(),
    };

    this.memoria?.guardarAprendizaje(
      `requiere_permiso_ambiental_${productoNormalizado}`,
      resultado,
      0.95
    );

    return resultado;
  }

  async detectarSustanciasOzono(producto) {
    const sustanciasOzono = [
      'cfc', 'clorofluorocarbono',
      'hcfc', 'hidroclorofluorocarbono',
      'halon', 'bromuro de metilo',
      'tetracloruro de carbono', 'metilcloroformo',
    ];

    const productoNormalizado = this._normalizarClave(producto);
    const esSustanciaOzono = sustanciasOzono.some((termino) => contieneTermino(productoNormalizado, termino));

    return {
      producto,
      esSustanciaAgotadoraOzono: esSustanciaOzono,
      requiereAutorizacion: esSustanciaOzono,
      entidad: 'MINAM-PRODUCE',
      actualizado: new Date().toISOString(),
    };
  }

  async _consultarPermisoLocal(producto) {
    return {
      producto,
      requierePermiso: false,
      tipoPermiso: null,
      estado: 'pendiente_verificacion',
      fuente: 'MINAM',
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

  obtenerEstadisticas() {
    if (!this.memoria) {
      return {};
    }
    return this.memoria.obtenerEstadisticas();
  }
}

module.exports = AgenteNavegadorMINAM;
