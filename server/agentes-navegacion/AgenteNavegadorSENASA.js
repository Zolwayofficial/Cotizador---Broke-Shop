// server/agentes-navegacion/AgenteNavegadorSENASA.js
//
// AGENTE ESPECIALISTA EN SENASA (Servicio Nacional de Sanidad Agraria)
//
// Caracteristicas:
// - Navega en senasa.gob.pe
// - Busca permisos fitosanitarios
// - Aprende plagas cuarentenarias
// - Detecta productos que requieren permiso
// - Alertas de restricciones por pais

const { MemoriaAgente } = require('./MemoriaAgente');
const { normalizarCodigoPais } = require('../paises');

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

class AgenteNavegadorSENASA {
  constructor() {
    this.nombreAgente = 'SENASA';
    this.memoria = null;
    this.cache = new Map();
  }

  async init() {
    this.memoria = new MemoriaAgente(this.nombreAgente);
  }

  // ===================================================
  // CONSULTAR PERMISO FITOSANITARIO
  // ===================================================
  async consultarPermisoFitosanitario(producto, paisOrigen) {
    const productoNormalizado = this._normalizarClave(producto);
    const paisNormalizado = this._normalizarPais(paisOrigen);
    const cacheKey = `senasa_${productoNormalizado}_${paisNormalizado}`;
    const aprendizajeKey = `permiso_${productoNormalizado}_${paisNormalizado}`;

    const cached = this._obtenerDeCache(cacheKey);
    if (cached) {
      console.log(`SENASA: Permiso de cache para ${producto}`);
      return cached;
    }

    const aprendizaje = this.memoria?.obtenerAprendizaje(aprendizajeKey);
    if (aprendizaje) {
      console.log('SENASA: Usando aprendizaje previo');
      return cloneSerializable(aprendizaje.valor);
    }

    const resultado = await this._consultarPermisoLocal(producto, paisNormalizado);

    this._guardarEnCache(cacheKey, resultado, 86400000);
    this.memoria?.guardarAprendizaje(aprendizajeKey, cloneSerializable(resultado), 0.9);

    return cloneSerializable(resultado);
  }

  // ===================================================
  // DETECTAR SI REQUIERE PERMISO FITOSANITARIO
  // ===================================================
  async detectarSiRequierePermiso(producto, categoria, paisOrigen) {
    const productosRequierenPermiso = [
      'fruta', 'verdura', 'hortaliza', 'legumbre',
      'manzana', 'pera', 'uva', 'palta', 'platano', 'banana',
      'semilla', 'grano', 'cereal', 'trigo', 'maiz', 'arroz',
      'planta', 'arbol', 'flor', 'bulbo',
      'madera', 'maderable',
      'carne', 'pollo', 'cerdo', 'res', 'pescado',
      'huevo', 'leche', 'lacteo',
      'alimento animal', 'balanceado', 'concentrado',
    ];

    const paisesConRestricciones = ['CN', 'US', 'BR', 'EC', 'CO'];
    const productoNormalizado = this._normalizarClave(producto);
    const categoriaNormalizada = this._normalizarClave(categoria);
    const paisNormalizado = this._normalizarPais(paisOrigen);

    const requiere = productosRequierenPermiso.some((termino) =>
      contieneTermino(productoNormalizado, termino) || contieneTermino(categoriaNormalizada, termino)
    );

    const tieneRestriccionAdicional = paisesConRestricciones.includes(paisNormalizado);
    const resultado = {
      producto,
      paisOrigen,
      requierePermisoFitosanitario: requiere,
      tieneRestriccionAdicional,
      entidad: 'SENASA',
      tramite: requiere ? 'Permiso Fitosanitario de Importacion' : 'No requiere',
      actualizado: new Date().toISOString(),
    };

    this.memoria?.guardarAprendizaje(
      `requiere_permiso_${productoNormalizado}_${paisNormalizado}`,
      resultado,
      0.95
    );

    return resultado;
  }

  // ===================================================
  // CONSULTAR PLAGAS CUARENTENARIAS
  // ===================================================
  async consultarPlagasCuarentenarias() {
    const cacheKey = 'senasa_plagas';
    const cached = this._obtenerDeCache(cacheKey);
    if (cached) {
      return cached;
    }

    const resultado = {
      total: 0,
      plagas: [],
      actualizado: new Date().toISOString(),
    };

    this._guardarEnCache(cacheKey, resultado, 86400000);
    return resultado;
  }

  // ===================================================
  // PRIVADOS
  // ===================================================
  async _consultarPermisoLocal(producto, paisOrigen) {
    return {
      producto,
      paisOrigen,
      requierePermiso: true,
      tipoPermiso: 'Fitosanitario',
      estado: 'pendiente_verificacion',
      fuente: 'SENASA',
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

  _normalizarPais(valor) {
    return normalizarCodigoPais(valor) || String(valor ?? '').trim().toUpperCase();
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

module.exports = AgenteNavegadorSENASA;
