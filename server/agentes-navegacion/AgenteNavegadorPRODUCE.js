// server/agentes-navegacion/AgenteNavegadorPRODUCE.js
//
// AGENTE ESPECIALISTA EN PRODUCE (Ministerio de la Produccion)
//
// Caracteristicas:
// - Navega en gob.pe/produce
// - Busca permisos de pesca
// - Detecta permisos de IQBF (Insumos Quimicos)
// - Alertas de restricciones pesqueras
// - Detecta sustancias fiscalizadas

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

class AgenteNavegadorPRODUCE {
  constructor() {
    this.nombreAgente = 'PRODUCE';
    this.memoria = null;
    this.cache = new Map();
  }

  async init() {
    this.memoria = new MemoriaAgente(this.nombreAgente);
  }

  async consultarPermisoPesca(producto) {
    const productoNormalizado = this._normalizarClave(producto);
    const cacheKey = `produce_pesca_${productoNormalizado}`;
    const aprendizajeKey = `permiso_pesca_${productoNormalizado}`;

    const cached = this._obtenerDeCache(cacheKey);
    if (cached) {
      console.log(`PRODUCE: Permiso de cache para ${producto}`);
      return cached;
    }

    const aprendizaje = this.memoria?.obtenerAprendizaje(aprendizajeKey);
    if (aprendizaje) {
      console.log('PRODUCE: Usando aprendizaje previo');
      return cloneSerializable(aprendizaje.valor);
    }

    const resultado = await this._consultarPermisoPescaLocal(producto);

    this._guardarEnCache(cacheKey, resultado, 86400000);
    this.memoria?.guardarAprendizaje(aprendizajeKey, cloneSerializable(resultado), 0.9);

    return cloneSerializable(resultado);
  }

  async detectarSiRequierePermisoPesca(producto, categoria) {
    const productosPesqueros = [
      'pesca', 'pescado', 'marisco', 'mariscos',
      'atun', 'sardina', 'jurel', 'caballa',
      'camaron', 'langostino', 'calamar', 'pulpo',
      'concha', 'choro', 'ostion',
      'alga', 'algae',
      'harina de pescado', 'aceite de pescado',
      'conserva de atun', 'conserva de sardina',
    ];

    const productoNormalizado = this._normalizarClave(producto);
    const categoriaNormalizada = this._normalizarClave(categoria);

    const esPesquero = productosPesqueros.some((termino) =>
      contieneTermino(productoNormalizado, termino) || contieneTermino(categoriaNormalizada, termino)
    );

    const resultado = {
      producto,
      categoria,
      requierePermisoPesca: esPesquero,
      esPesquero,
      entidad: 'PRODUCE-SANIPES',
      tramite: esPesquero ? 'Permiso de Importacion de Productos Pesqueros' : 'No requiere',
      actualizado: new Date().toISOString(),
    };

    this.memoria?.guardarAprendizaje(
      `requiere_pesca_${productoNormalizado}`,
      resultado,
      0.95
    );

    return resultado;
  }

  async detectarInsumosQuimicos(producto) {
    const insumosFiscalizados = [
      'acido sulfurico', 'acido clorhidrico', 'acido nitrico',
      'acetona', 'tolueno', 'metiletilcetona',
      'permanganato de potasio', 'dicromato de potasio',
      'hipoclorito de sodio', 'cloro',
      'carbonato de sodio', 'hidroxido de sodio',
      'eter', 'cloroformo', 'benceno',
    ];

    const productoNormalizado = this._normalizarClave(producto);
    const esFiscalizado = insumosFiscalizados.some((termino) => contieneTermino(productoNormalizado, termino));

    return {
      producto,
      esInsumoFiscalizado: esFiscalizado,
      requiereAutorizacion: esFiscalizado,
      entidad: 'PRODUCE-DOPIF-SUNAT',
      tramite: esFiscalizado ? 'Autorizacion de Importacion de IQBF' : 'No requiere',
      actualizado: new Date().toISOString(),
    };
  }

  async _consultarPermisoPescaLocal(producto) {
    return {
      producto,
      requierePermiso: false,
      tipoPermiso: null,
      estado: 'pendiente_verificacion',
      fuente: 'PRODUCE',
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

module.exports = AgenteNavegadorPRODUCE;
