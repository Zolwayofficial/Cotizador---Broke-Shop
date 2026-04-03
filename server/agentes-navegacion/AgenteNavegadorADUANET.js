// server/agentes-navegacion/AgenteNavegadorADUANET.js
//
// Agente especialista en ADUANET.
// - Navega en aduanet.gob.pe/itarancel
// - Aprende estructuras HTML
// - Detecta cambios en el sitio
// - Cache de partidas consultadas
// - Estrategias adaptativas de scraping

const http = require('http');
const iconv = require('iconv-lite');
const crypto = require('crypto');
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

function buildAduanetUrl(partida) {
  return `http://www.aduanet.gob.pe/itarancel/arancelS01Alias?accion=buscarPartida&cod_partida=${partida}&esframe=1`;
}

class AgenteNavegadorADUANET {
  constructor() {
    this.nombreAgente = 'ADUANET';
    this.memoria = null;
    this.cache = new Map();
  }

  async init() {
    this.memoria = new MemoriaAgente(this.nombreAgente);
  }

  // Navegacion inteligente.
  async navegar(url, opciones = {}) {
    if (!this.memoria) {
      return { exito: false, error: 'Memoria no inicializada', tiempo: 0 };
    }

    const startTime = Date.now();
    const config = this.memoria.obtenerConfig();

    const cached = this._obtenerDeCache(url);
    if (cached) {
      console.log(`[ADUANET] Cache reutilizado (${cached.tiempo}ms)`);
      return cached;
    }

    const experiencias = this.memoria.buscarExperiencias(url, 3);
    if (experiencias.length > 0 && experiencias[0].exito === 1) {
      console.log(`[ADUANET] Usando estrategia previa (${experiencias[0].tiempo_respuesta_ms}ms)`);
      opciones.timeout = Math.max(config.timeout_ms, experiencias[0].tiempo_respuesta_ms * 1.5);
    }

    let ultimoError = null;
    for (let intento = 1; intento <= config.reintentos; intento += 1) {
      try {
        console.log(`[ADUANET] Navegando ${url} (intento ${intento}/${config.reintentos})`);

        const resultado = await this._navegarUrl(url, {
          ...config,
          ...opciones,
          intento,
        });

        const tiempoTotal = Date.now() - startTime;
        const htmlHash = this._generarHtmlHash(resultado.html);
        const respuesta = { exito: true, ...resultado, tiempo: tiempoTotal };

        this.memoria.guardarExperiencia(
          url,
          true,
          tiempoTotal,
          JSON.stringify({ timeout: opciones.timeout, htmlHash, intento }),
          null,
          htmlHash,
        );

        this._guardarEnCache(url, respuesta, config.cache_ttl_ms);

        console.log(`[ADUANET] Respuesta recibida en ${tiempoTotal}ms`);
        return cloneSerializable(respuesta);
      } catch (error) {
        ultimoError = error;
        console.log(`[ADUANET] Error en intento ${intento}: ${error.message}`);

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
      ultimoError.message,
    );

    return { exito: false, error: ultimoError.message, tiempo: tiempoTotal };
  }

  // Consultar arancel de partida.
  async consultarArancel(partida) {
    const clean = partida.replace(/\./g, '').padEnd(10, '0');
    const url = buildAduanetUrl(clean);
    const resultado = await this.navegar(url, { timeout: 45000 });

    if (resultado.exito) {
      const arancel = this._parsearArancelAduanet(resultado.html, clean);

      if (this.memoria) {
        this.memoria.guardarAprendizaje(`arancel_${clean}`, cloneSerializable(arancel), 1.0);
        this.memoria.guardarAprendizaje('ultima_consulta', new Date().toISOString(), 1.0);
      }

      return cloneSerializable({
        exito: true,
        ...arancel,
        fuente: 'ADUANET',
        actualizado: new Date().toISOString(),
      });
    }

    const fallback = this.memoria ? this.memoria.obtenerAprendizaje(`arancel_${clean}`) : null;
    if (fallback) {
      console.log(`[ADUANET] Usando aprendizaje previo para ${clean}`);
      const valorAprendido = cloneSerializable(fallback.valor);
      return {
        exito: false,
        ...valorAprendido,
        fuente: 'cache_aprendizaje',
        actualizado: valorAprendido.actualizado || new Date().toISOString(),
      };
    }

    return { exito: false, error: resultado.error, partida: clean };
  }

  // Detectar cambios en estructura HTML.
  async detectarCambiosEstructura() {
    const partidasTest = ['8471300000', '6109100010', '0806100000'];
    const cambios = [];

    for (const partida of partidasTest) {
      const resultado = await this.navegar(buildAduanetUrl(partida), { timeout: 45000 });
      if (!resultado.exito || !resultado.html) {
        continue;
      }

      const htmlHash = this._generarHtmlHash(resultado.html);
      const hashPrevio = this.memoria.obtenerAprendizaje(`html_${partida}`);

      if (hashPrevio && hashPrevio.valor !== htmlHash) {
        cambios.push({
          partida,
          tipo: 'estructura_html_cambiada',
          fecha: new Date().toISOString(),
        });

        console.log(`[ADUANET] Estructura HTML cambio para ${partida}`);
      }

      this.memoria.guardarAprendizaje(`html_${partida}`, htmlHash, 1.0);
    }

    return cambios;
  }

  // Privados.
  _navegarUrl(url, opciones) {
    return new Promise((resolve, reject) => {
      const req = http.get(
        url,
        {
          timeout: opciones.timeout,
          headers: {
            'User-Agent': opciones.user_agent,
            Accept: 'text/html',
          },
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
        },
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout despues de ${opciones.timeout}ms`));
      });
    });
  }

  _parsearArancelAduanet(html, partida) {
    const result = {
      partida,
      adValorem: 0,
      igv: 16,
      isc: 0,
      ipm: 2,
      percepcion: 3.5,
      raw: html.length > 0,
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
    const estructura = html
      .replace(/>\s+</g, '><')
      .replace(/[0-9]/g, 'N')
      .substring(0, 1000);

    return crypto.createHash('md5').update(estructura).digest('hex');
  }

  _guardarEnCache(url, valor, ttlMs) {
    this.cache.set(url, {
      valor: cloneSerializable(valor),
      expira: Date.now() + ttlMs,
    });
  }

  _obtenerDeCache(url) {
    const cached = this.cache.get(url);
    if (cached && Date.now() < cached.expira) {
      return cloneSerializable(cached.valor);
    }
    this.cache.delete(url);
    return null;
  }

  // Estadisticas.
  obtenerEstadisticas() {
    return this.memoria.obtenerEstadisticas();
  }
}

module.exports = AgenteNavegadorADUANET;
