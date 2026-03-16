// server/agentes-navegacion/AgenteNavegadorSUNAT.js
// 
// AGENTE ESPECIALISTA EN SUNAT
// 
// Características:
// - Navega en e-consultaruc.sunat.gob.pe
// - Aprende timeouts óptimos según día/hora
// - Detecta cuándo está caído
// - Recuerda estructura HTML
// - Estrategias de scraping adaptativas
// - Cache inteligente

const https = require("https");
const http = require("http");
const iconv = require("iconv-lite");
const crypto = require("crypto");
const { MemoriaAgente } = require("./MemoriaAgente");

class AgenteNavegadorSUNAT {
  constructor() {
    this.nombreAgente = 'SUNAT';  // Nombre EXPLÍCITO del agente
    this.memoria = null;  // Se inicializa en init()
    this.cache = new Map();
  }

  async init() {
    this.memoria = new MemoriaAgente(this.nombreAgente);
  }

  // ═══════════════════════════════════════════════════
  // NAVEGACIÓN INTELIGENTE
  // ═══════════════════════════════════════════════════
  async navegar(url, opciones = {}) {
    // Validar que memoria esté inicializada
    if (!this.memoria) {
      console.error("[SUNAT] Error: memoria no inicializada. Llamar a init() primero.");
      return { exito: false, error: "Memoria no inicializada", tiempo: 0 };
    }

    const startTime = Date.now();
    const config = this.memoria.obtenerConfig();

    // 1. Verificar si ya navegó aquí antes
    const experiencias = this.memoria.buscarExperiencias(url, 5);

    // 2. Si tuvo éxito reciente, usar misma estrategia
    if (experiencias.length > 0 && experiencias[0].exito === 1) {
      const estrategiaPrevia = JSON.parse(experiencias[0].estrategia_usada);
      console.log(`🧠 SUNAT: Usando estrategia que funcionó (${experiencias[0].tiempo_respuesta_ms}ms antes)`);

      // Ajustar timeout según experiencia previa
      const timeoutAjustado = Math.max(config.timeout_ms, experiencias[0].tiempo_respuesta_ms * 1.5);
      opciones.timeout = timeoutAjustado;
    }

    // 3. Verificar alertas de otros agentes
    const alertas = this.memoria.recibirAlertas();
    for (const alerta of alertas) {
      if (alerta.tipo === 'sitio_caido') {
        console.log(`⚠️ SUNAT: Alerta recibida - ${alerta.mensaje}`);
        this.memoria.marcarAlertaLeida(alerta.id);
      }
    }

    // 4. Intentar navegación con reintentos inteligentes
    let ultimoError = null;
    for (let intento = 1; intento <= config.reintentos; intento++) {
      try {
        console.log(`🌐 SUNAT: Navegando ${url} (intento ${intento}/${config.reintentos})`);

        const resultado = await this._navegarUrl(url, {
          ...config,
          ...opciones,
          intento
        });

        // 5. Guardar experiencia exitosa
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
            intento
          }),
          null,
          htmlHash
        );

        // 6. Actualizar cache
        this._guardarEnCache(url, resultado, config.cache_ttl_ms);

        console.log(`✅ SUNAT: Éxito en ${tiempoTotal}ms`);
        return {
          exito: true,
          ...resultado,
          tiempo: tiempoTotal
        };

      } catch (error) {
        ultimoError = error;
        console.log(`❌ SUNAT: Error en intento ${intento}: ${error.message}`);

        // Backoff exponencial entre reintentos
        if (intento < config.reintentos) {
          const espera = Math.min(5000, 1000 * Math.pow(2, intento));
          console.log(`⏳ SUNAT: Esperando ${espera}ms antes de reintentar`);
          await new Promise(resolve => setTimeout(resolve, espera));
        }
      }
    }

    // 7. Todos los intentos fallaron
    const tiempoTotal = Date.now() - startTime;
    this.memoria.guardarExperiencia(
      url,
      false,
      tiempoTotal,
      JSON.stringify({ ultimo_intento: config.reintentos }),
      ultimoError.message
    );

    console.log(`🔴 SUNAT: Todos los intentos fallaron después de ${tiempoTotal}ms`);

    return {
      exito: false,
      error: ultimoError.message,
      tiempo: tiempoTotal
    };
  }

  // ═══════════════════════════════════════════════════
  // CONSULTA TIPO DE CAMBIO
  // ═══════════════════════════════════════════════════
  async consultarTipoCambio() {
    // Verificar cache primero
    const cached = this._obtenerDeCache('tipo_cambio');
    if (cached) {
      console.log("💾 SUNAT: Tipo de cambio de cache");
      return cached;
    }

    // URLs posibles (múltiples fuentes)
    const urls = [
      'https://e-consultaruc.sunat.gob.pe/cl-tc-itcconsul/TCConsul',
      'https://api.decolecta.com/v1/tipo-cambio/sunat',
      'https://api.decolecta.com/v1/tipo-cambio/sbs/average'
    ];

    for (const url of urls) {
      const resultado = await this.navegar(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/html',
          'User-Agent': this.memoria.obtenerConfig().user_agent
        }
      });

      if (resultado.exito) {
        try {
          // Parsear respuesta
          let tc;

          if (resultado.html.includes('e-consultaruc')) {
            // Scraping de SUNAT directo
            tc = this._parsearTipoCambioSunat(resultado.html);
          } else {
            // API de decolecta
            tc = JSON.parse(resultado.html);
          }

          if (tc && tc.compra && tc.venta) {
            // Guardar en cache
            this._guardarEnCache('tipo_cambio', tc, 3600000);

            // Guardar aprendizaje
            this.memoria.guardarAprendizaje('ultimo_tc', tc, 1.0);
            this.memoria.guardarAprendizaje('tc_fecha', new Date().toISOString(), 1.0);

            return {
              exito: true,
              ...tc,
              fuente: 'SUNAT',
              actualizado: new Date().toISOString()
            };
          }
        } catch (e) {
          console.log(`⚠️ SUNAT: Error parseando respuesta: ${e.message}`);
        }
      }
    }

    // Fallback
    const fallback = { compra: 3.70, venta: 3.75 };
    console.log(`⚠️ SUNAT: Usando fallback: ${JSON.stringify(fallback)}`);

    return {
      exito: false,
      ...fallback,
      fuente: 'fallback',
      actualizado: new Date().toISOString()
    };
  }

  // ═══════════════════════════════════════════════════
  // CONSULTA ARANCEL DE PARTIDA
  // ═══════════════════════════════════════════════════
  async consultarArancel(partida) {
    const clean = partida.replace(/\./g, "").padEnd(10, "0");
    const url = `http://www.aduanet.gob.pe/itarancel/arancelS01Alias?accion=buscarPartida&cod_partida=${clean}&esframe=1`;

    // Verificar cache
    const cacheKey = `arancel_${clean}`;
    const cached = this._obtenerDeCache(cacheKey);
    if (cached) {
      console.log(`💾 SUNAT: Arancel de cache para ${clean}`);
      return cached;
    }

    const resultado = await this.navegar(url, {
      method: 'GET',
      timeout: 45000
    });

    if (resultado.exito) {
      const arancel = this._parsearArancelAduanet(resultado.html, clean);

      // Guardar en cache
      this._guardarEnCache(cacheKey, arancel, 3600000);

      return {
        exito: true,
        ...arancel,
        fuente: 'ADUANET/SUNAT',
        actualizado: new Date().toISOString()
      };
    }

    return {
      exito: false,
      error: resultado.error,
      partida: clean
    };
  }

  // ═══════════════════════════════════════════════════
  // PRIVADOS
  // ═══════════════════════════════════════════════════
  _navegarUrl(url, opciones) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      const req = protocol.get(url, {
        timeout: opciones.timeout,
        headers: opciones.headers
      }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const html = iconv.decode(Buffer.concat(chunks), 'latin1');
          resolve({
            html,
            statusCode: res.statusCode,
            headers: res.headers
          });
        });
        res.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout después de ${opciones.timeout}ms`));
      });
    });
  }

  _parsearTipoCambioSunat(html) {
    // Extraer tipo de cambio del HTML de SUNAT
    const compraMatch = html.match(/Compra[^<]*?(\d+\.?\d*)/i);
    const ventaMatch = html.match(/Venta[^<]*?(\d+\.?\d*)/i);

    if (compraMatch && ventaMatch) {
      return {
        compra: parseFloat(compraMatch[1]),
        venta: parseFloat(ventaMatch[1])
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
      percepcion: 3.5
    };

    // Extraer Ad Valorem
    const avMatch = html.match(/Ad[\s-]*Valorem[^<]*?(\d+)%/i) ||
      html.match(/A\/V[^<]*?(\d+)/i);
    if (avMatch) result.adValorem = parseInt(avMatch[1]);

    // Extraer IGV
    const igvMatch = html.match(/I\.G\.V\.[^<]*?(\d+)%/i) ||
      html.match(/IGV[^<]*?(\d+)/i);
    if (igvMatch) result.igv = parseInt(igvMatch[1]);

    // Extraer ISC
    const iscMatch = html.match(/I\.S\.C\.[^<]*?(\d+)%/i) ||
      html.match(/ISC[^<]*?(\d+)/i);
    if (iscMatch) result.isc = parseInt(iscMatch[1]);

    return result;
  }

  _generarHtmlHash(html) {
    // Hash de la estructura HTML para detectar cambios
    const estructura = html
      .replace(/>\s+</g, '><')
      .replace(/[0-9]/g, 'N')
      .substring(0, 1000);

    return crypto.createHash('md5').update(estructura).digest('hex');
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

module.exports = AgenteNavegadorSUNAT;
