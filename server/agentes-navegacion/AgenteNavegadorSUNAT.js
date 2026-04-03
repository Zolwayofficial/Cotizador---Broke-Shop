const https = require('https');
const http = require('http');
const iconv = require('iconv-lite');
const crypto = require('crypto');
const { MemoriaAgente } = require('./MemoriaAgente');
const sunatProxy = require('../sunat-proxy');

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

class AgenteNavegadorSUNAT {
  constructor() {
    this.nombreAgente = 'SUNAT';
    this.memoria = null;
    this.cache = new Map();
  }

  async init() {
    this.memoria = new MemoriaAgente(this.nombreAgente);
  }

  async navegar(url, opciones = {}) {
    if (!this.memoria) {
      return { exito: false, error: 'Memoria no inicializada', tiempo: 0 };
    }

    const startTime = Date.now();
    const config = this.memoria.obtenerConfig();
    const experiencias = this.memoria.buscarExperiencias(url, 5);

    if (experiencias.length > 0 && experiencias[0].exito === 1) {
      const timeoutAjustado = Math.max(config.timeout_ms, experiencias[0].tiempo_respuesta_ms * 1.5);
      opciones.timeout = timeoutAjustado;
    }

    const alertas = this.memoria.recibirAlertas();
    for (const alerta of alertas) {
      if (alerta.tipo === 'sitio_caido') {
        this.memoria.marcarAlertaLeida(alerta.id);
      }
    }

    let ultimoError = null;
    for (let intento = 1; intento <= config.reintentos; intento += 1) {
      try {
        const resultado = await this._navegarUrl(url, {
          ...config,
          ...opciones,
          intento,
        });

        const tiempoTotal = Date.now() - startTime;
        const htmlHash = this._generarHtmlHash(resultado.html);

        this.memoria.guardarExperiencia(
          url,
          true,
          tiempoTotal,
          JSON.stringify({
            timeout: opciones.timeout,
            headers: opciones.headers,
            htmlHash,
            intento,
          }),
          null,
          htmlHash
        );

        this._guardarEnCache(url, resultado, config.cache_ttl_ms);

        return {
          exito: true,
          ...resultado,
          tiempo: tiempoTotal,
        };
      } catch (error) {
        ultimoError = error;

        if (intento < config.reintentos) {
          const espera = Math.min(5000, 1000 * Math.pow(2, intento));
          await new Promise((resolve) => setTimeout(resolve, espera));
        }
      }
    }

    const tiempoTotal = Date.now() - startTime;
    this.memoria.guardarExperiencia(
      url,
      false,
      tiempoTotal,
      JSON.stringify({ ultimo_intento: config.reintentos }),
      ultimoError?.message || 'Sin detalle'
    );

    return {
      exito: false,
      error: ultimoError?.message || 'No se pudo navegar',
      tiempo: tiempoTotal,
    };
  }

  async consultarTipoCambio() {
    const cached = this._obtenerDeCache('tipo_cambio');
    if (cached) {
      return cached;
    }

    try {
      const tc = await sunatProxy.getTipoCambio();
      const resultado = {
        exito: tc.status !== 'fallback',
        compra: tc.compra,
        venta: tc.venta,
        fuente: tc.source,
        estado: tc.status,
        estrategia: tc.strategy || null,
        oficial: tc.official === true,
        actualizado: tc.fecha || new Date().toISOString(),
      };

      this._guardarEnCache('tipo_cambio', resultado, Number(process.env.OFFICIAL_FX_CACHE_TTL_MS || 900000));

      if (this.memoria) {
        this.memoria.guardarAprendizaje('ultimo_tc', cloneSerializable(resultado), resultado.oficial ? 1.0 : 0.8);
        this.memoria.guardarAprendizaje('tc_fecha', resultado.actualizado, 1.0);
      }

      return cloneSerializable(resultado);
    } catch (error) {
      return {
        exito: false,
        compra: 3.7,
        venta: 3.75,
        fuente: 'fallback_local',
        estado: 'fallback',
        actualizado: new Date().toISOString(),
        error: error.message,
      };
    }
  }

  async consultarArancel(partida) {
    const clean = partida.replace(/\./g, '').padEnd(10, '0');
    const url = `http://www.aduanet.gob.pe/itarancel/arancelS01Alias?accion=buscarPartida&cod_partida=${clean}&esframe=1`;
    const cacheKey = `arancel_${clean}`;
    const cached = this._obtenerDeCache(cacheKey);

    if (cached) {
      return cached;
    }

    const resultado = await this.navegar(url, {
      method: 'GET',
      timeout: 45000,
    });

    if (resultado.exito) {
      const arancel = this._parsearArancelAduanet(resultado.html, clean);
      const arancelResultado = {
        exito: true,
        ...arancel,
        fuente: 'ADUANET/SUNAT',
        actualizado: new Date().toISOString(),
      };
      this._guardarEnCache(cacheKey, arancelResultado, 3600000);

      return cloneSerializable(arancelResultado);
    }

    return {
      exito: false,
      error: resultado.error,
      partida: clean,
    };
  }

  _navegarUrl(url, opciones) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const req = protocol.get(
        url,
        {
          timeout: opciones.timeout,
          headers: opciones.headers,
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const html = iconv.decode(Buffer.concat(chunks), 'latin1');
            resolve({
              html,
              statusCode: res.statusCode,
              headers: res.headers,
            });
          });
          res.on('error', reject);
        }
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout despues de ${opciones.timeout}ms`));
      });
    });
  }

  _parsearTipoCambioSunat(html) {
    const compraMatch = html.match(/Compra[^<]*?(\d+\.?\d*)/i);
    const ventaMatch = html.match(/Venta[^<]*?(\d+\.?\d*)/i);

    if (compraMatch && ventaMatch) {
      return {
        compra: parseFloat(compraMatch[1]),
        venta: parseFloat(ventaMatch[1]),
      };
    }

    return null;
  }

  _parsearArancelAduanet(html, partida) {
    const result = {
      partida,
      adValorem: 0,
      igv: 16,
      isc: 0,
      ipm: 2,
      percepcion: 3.5,
    };

    const avMatch = html.match(/Ad[\s-]*Valorem[^<]*?(\d+)%/i) || html.match(/A\/V[^<]*?(\d+)/i);
    if (avMatch) result.adValorem = parseInt(avMatch[1], 10);

    const igvMatch = html.match(/I\.G\.V\.[^<]*?(\d+)%/i) || html.match(/IGV[^<]*?(\d+)/i);
    if (igvMatch) result.igv = parseInt(igvMatch[1], 10);

    const iscMatch = html.match(/I\.S\.C\.[^<]*?(\d+)%/i) || html.match(/ISC[^<]*?(\d+)/i);
    if (iscMatch) result.isc = parseInt(iscMatch[1], 10);

    return result;
  }

  _generarHtmlHash(html) {
    const estructura = String(html || '')
      .replace(/>\s+</g, '><')
      .replace(/[0-9]/g, 'N')
      .substring(0, 1000);

    return crypto.createHash('md5').update(estructura).digest('hex');
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
    return this.memoria.obtenerEstadisticas();
  }
}

module.exports = AgenteNavegadorSUNAT;
