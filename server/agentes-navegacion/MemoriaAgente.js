// server/agentes-navegacion/MemoriaAgente.js

const dbApi = require('../db');

let initialized = false;

function buildLearningKey(agente, clave) {
  return `${agente}::${clave}`;
}

function dbAll(sql, params = []) {
  if (!initialized) return [];
  return dbApi.all(sql, params);
}

function dbGet(sql, params = []) {
  if (!initialized) return null;
  return dbApi.get(sql, params);
}

function dbRun(sql, params = []) {
  if (!initialized) return { changes: 0, lastInsertRowid: 0 };
  return dbApi.run(sql, params);
}

function safeJsonParse(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function safeJsonStringify(value, fallback = '{}') {
  if (typeof value === 'string') return value;
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? fallback : serialized;
  } catch (_error) {
    return fallback;
  }
}

async function init() {
  if (initialized) return;

  dbApi.exec(`
    CREATE TABLE IF NOT EXISTS agente_experiencias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agente TEXT NOT NULL,
      url TEXT NOT NULL,
      exito INTEGER NOT NULL,
      tiempo_respuesta_ms INTEGER,
      estrategia_usada TEXT,
      error_message TEXT,
      html_structure_hash TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  dbApi.exec(`
    CREATE TABLE IF NOT EXISTS agente_aprendizajes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agente TEXT NOT NULL,
      clave TEXT NOT NULL UNIQUE,
      valor TEXT NOT NULL,
      confianza REAL DEFAULT 1.0,
      veces_verificado INTEGER DEFAULT 0,
      ultima_verificacion TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  dbApi.exec(`
    CREATE TABLE IF NOT EXISTS agente_patrones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agente TEXT NOT NULL,
      patron TEXT NOT NULL,
      descripcion TEXT,
      frecuencia INTEGER DEFAULT 1,
      ultima_ocurrencia TEXT,
      activo INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  dbApi.exec(`
    CREATE TABLE IF NOT EXISTS agente_alertas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agente_origen TEXT NOT NULL,
      agente_destino TEXT,
      tipo TEXT NOT NULL,
      mensaje TEXT NOT NULL,
      datos TEXT,
      leido INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  dbApi.exec(`
    CREATE TABLE IF NOT EXISTS agente_config (
      agente TEXT PRIMARY KEY,
      timeout_ms INTEGER DEFAULT 30000,
      reintentos INTEGER DEFAULT 3,
      cache_ttl_ms INTEGER DEFAULT 3600000,
      user_agent TEXT,
      headers TEXT,
      actualizado TEXT DEFAULT (datetime('now'))
    )
  `);

  dbApi.exec('CREATE INDEX IF NOT EXISTS idx_exp_agente ON agente_experiencias(agente)');
  dbApi.exec('CREATE INDEX IF NOT EXISTS idx_exp_url ON agente_experiencias(url)');
  dbApi.exec('CREATE INDEX IF NOT EXISTS idx_aprendizajes_agente ON agente_aprendizajes(agente)');
  dbApi.exec('CREATE INDEX IF NOT EXISTS idx_patrones_agente ON agente_patrones(agente)');
  dbApi.exec('CREATE INDEX IF NOT EXISTS idx_alertas_leido ON agente_alertas(leido)');

  dbApi.exec(`
    INSERT OR IGNORE INTO agente_config (agente, timeout_ms, reintentos, cache_ttl_ms, user_agent, headers)
    VALUES
      ('SUNAT', 45000, 3, 3600000, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', '{}'),
      ('ADUANET', 45000, 3, 3600000, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', '{}'),
      ('VUCE', 60000, 3, 7200000, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', '{}'),
      ('INDECOPI', 60000, 3, 86400000, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', '{}')
  `);

  initialized = true;
  console.log('[MEMORIA AGENTE] Tablas y configuracion preparadas');
}

class MemoriaAgente {
  constructor(nombreAgente) {
    this.agente = nombreAgente;
    this.config = this._cargarConfig();
  }

  guardarExperiencia(url, exito, tiempoMs, estrategia, error = null, htmlHash = null) {
    if (!this.agente) {
      console.error('[MEMORIA AGENTE] Error: agente no definido al guardar experiencia');
      return;
    }

    try {
      dbRun(
        `
          INSERT INTO agente_experiencias (agente, url, exito, tiempo_respuesta_ms, estrategia_usada, error_message, html_structure_hash)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [this.agente, url, exito ? 1 : 0, tiempoMs, safeJsonStringify(estrategia), error, htmlHash]
      );
    } catch (_error) {
      console.log('[MEMORIA AGENTE] Info: experiencia no guardada (tablas aun no preparadas)');
    }

    this._aprenderDeExperiencia(url, exito, tiempoMs, estrategia, error);
  }

  buscarExperiencias(url, limite = 10) {
    return dbAll(
      `
        SELECT *
        FROM agente_experiencias
        WHERE agente = ? AND url = ?
        ORDER BY created_at DESC
        LIMIT ?
      `,
      [this.agente, url, limite]
    );
  }

  obtenerEstrategiaExitosa(url) {
    const experiencia = dbGet(
      `
        SELECT estrategia_usada, tiempo_respuesta_ms
        FROM agente_experiencias
        WHERE agente = ? AND url = ? AND exito = 1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [this.agente, url]
    );

    return experiencia ? safeJsonParse(experiencia.estrategia_usada, null) : null;
  }

  guardarAprendizaje(clave, valor, confianza = 1.0) {
    if (!this.agente) {
      console.error('[MEMORIA AGENTE] Error: agente no definido al guardar aprendizaje');
      return;
    }

    try {
      const storageKey = buildLearningKey(this.agente, clave);
      const existing = dbGet(
        `
          SELECT *
          FROM agente_aprendizajes
          WHERE agente = ? AND clave = ?
        `,
        [this.agente, storageKey]
      );

      if (existing) {
        dbRun(
          `
            UPDATE agente_aprendizajes
            SET valor = ?, confianza = ?, veces_verificado = veces_verificado + 1,
                ultima_verificacion = datetime('now'), updated_at = datetime('now')
            WHERE agente = ? AND clave = ?
          `,
          [safeJsonStringify(valor, 'null'), confianza, this.agente, storageKey]
        );
      } else {
        dbRun(
          `
            INSERT INTO agente_aprendizajes (agente, clave, valor, confianza)
            VALUES (?, ?, ?, ?)
          `,
          [this.agente, storageKey, safeJsonStringify(valor, 'null'), confianza]
        );
      }
    } catch (_error) {
      console.log('[MEMORIA AGENTE] Info: aprendizaje no guardado (tablas aun no preparadas)');
    }
  }

  obtenerAprendizaje(clave) {
    const storageKey = buildLearningKey(this.agente, clave);
    const row = dbGet(
      `
        SELECT valor, confianza, veces_verificado
        FROM agente_aprendizajes
        WHERE agente = ? AND clave = ? AND confianza > 0.7
      `,
      [this.agente, storageKey]
    );

    if (!row) return null;

    return {
      ...row,
      valor: JSON.parse(row.valor),
    };
  }

  detectarPatron(patron, descripcion) {
    if (!this.agente) {
      console.error('[MEMORIA AGENTE] Error: agente no definido al detectar patron');
      return;
    }

    try {
      const existing = dbGet(
        `
          SELECT *
          FROM agente_patrones
          WHERE agente = ? AND patron = ?
        `,
        [this.agente, patron]
      );

      if (existing) {
        dbRun(
          `
            UPDATE agente_patrones
            SET frecuencia = frecuencia + 1, ultima_ocurrencia = datetime('now')
            WHERE agente = ? AND patron = ?
          `,
          [this.agente, patron]
        );
      } else {
        dbRun(
          `
            INSERT INTO agente_patrones (agente, patron, descripcion)
            VALUES (?, ?, ?)
          `,
          [this.agente, patron, descripcion]
        );
      }
    } catch (_error) {
      console.log('[MEMORIA AGENTE] Info: patron no guardado (tablas aun no preparadas)');
    }
  }

  obtenerPatrones() {
    return dbAll(
      `
        SELECT patron, descripcion, frecuencia, ultima_ocurrencia
        FROM agente_patrones
        WHERE agente = ? AND activo = 1
        ORDER BY frecuencia DESC
      `,
      [this.agente]
    );
  }

  enviarAlerta(tipo, mensaje, datos = {}, agenteDestino = null) {
    if (!this.agente) {
      console.error('[MEMORIA AGENTE] Error: agente no definido al enviar alerta');
      return;
    }

    dbRun(
      `
        INSERT INTO agente_alertas (agente_origen, agente_destino, tipo, mensaje, datos)
        VALUES (?, ?, ?, ?, ?)
      `,
      [this.agente, agenteDestino, tipo, mensaje, safeJsonStringify(datos)]
    );
  }

  recibirAlertas() {
    return dbAll(
      `
        SELECT *
        FROM agente_alertas
        WHERE (agente_destino = ? OR agente_destino IS NULL) AND leido = 0
        ORDER BY created_at DESC
      `,
      [this.agente]
    ).map((alerta) => ({
      ...alerta,
      datos: safeJsonParse(alerta.datos, {}),
    }));
  }

  marcarAlertaLeida(id) {
    dbRun('UPDATE agente_alertas SET leido = 1 WHERE id = ?', [id]);
  }

  obtenerConfig() {
    return this.config;
  }

  actualizarConfig(nuevaConfig) {
    dbRun(
      `
        UPDATE agente_config
        SET timeout_ms = ?, reintentos = ?, cache_ttl_ms = ?, user_agent = ?, headers = ?,
            actualizado = datetime('now')
        WHERE agente = ?
      `,
      [
        nuevaConfig.timeout_ms ?? this.config.timeout_ms,
        nuevaConfig.reintentos ?? this.config.reintentos,
        nuevaConfig.cache_ttl_ms ?? this.config.cache_ttl_ms,
        nuevaConfig.user_agent ?? this.config.user_agent,
        safeJsonStringify(nuevaConfig.headers ?? this.config.headers),
        this.agente,
      ]
    );

    this.config = this._cargarConfig();
  }

  obtenerEstadisticas() {
    const total = Number(
      dbGet('SELECT COUNT(*) as count FROM agente_experiencias WHERE agente = ?', [this.agente])?.count || 0
    );

    const exitosas = Number(
      dbGet('SELECT COUNT(*) as count FROM agente_experiencias WHERE agente = ? AND exito = 1', [this.agente])?.count || 0
    );

    const promedioTiempoRaw = dbGet(
      `
        SELECT AVG(tiempo_respuesta_ms) as avg
        FROM agente_experiencias
        WHERE agente = ? AND exito = 1
      `,
      [this.agente]
    )?.avg;
    const promedioTiempo = promedioTiempoRaw === null || promedioTiempoRaw === undefined
      ? null
      : Number(promedioTiempoRaw);

    const fallosRecientes = Number(
      dbGet(
        `
          SELECT COUNT(*) as count
          FROM agente_experiencias
          WHERE agente = ? AND exito = 0 AND created_at > datetime('now', '-1 hour')
        `,
        [this.agente]
      )?.count || 0
    );

    return {
      agente: this.agente,
      total_navegaciones: total,
      exitosas,
      fallidas: total - exitosas,
      tasa_exito: total > 0 ? ((exitosas / total) * 100).toFixed(2) : null,
      tiempo_promedio_ms: promedioTiempo,
      fallos_ultima_hora: fallosRecientes,
      configuracion: this.config,
      patrones: this.obtenerPatrones(),
    };
  }

  _cargarConfig() {
    const row = dbGet('SELECT * FROM agente_config WHERE agente = ?', [this.agente]);

    return row
      ? {
        timeout_ms: row.timeout_ms,
        reintentos: row.reintentos,
        cache_ttl_ms: row.cache_ttl_ms,
        user_agent: row.user_agent,
        headers: safeJsonParse(row.headers, {}),
      }
      : {
        timeout_ms: 30000,
        reintentos: 3,
        cache_ttl_ms: 3600000,
        user_agent: 'Mozilla/5.0',
        headers: {},
      };
  }

  _aprenderDeExperiencia(url, exito, tiempoMs, estrategia, error) {
    if (exito && tiempoMs > this.config.timeout_ms * 0.8) {
      const nuevoTimeout = Math.min(120000, Math.round(tiempoMs * 1.3));
      this.actualizarConfig({ timeout_ms: nuevoTimeout });
      this.guardarAprendizaje('timeout_optimo', nuevoTimeout, 0.9);
    }

    if (!exito) {
      this.detectarPatron('sitio_caido', `${url} fallo ${error}`);

      const fallosConsecutivos = Number(
        dbGet(
          `
            SELECT COUNT(*) as count
            FROM agente_experiencias
            WHERE agente = ? AND exito = 0 AND created_at > datetime('now', '-1 hour')
          `,
          [this.agente]
        )?.count || 0
      );

      if (fallosConsecutivos >= 3) {
        this.guardarAprendizaje(
          'sitio_no_disponible',
          {
            url,
            desde: new Date().toISOString(),
            fallos: fallosConsecutivos,
          },
          0.95
        );

        this.enviarAlerta(
          'sitio_caido',
          `${this.agente}: ${url} esta caido (${fallosConsecutivos} fallos en 1h)`,
          { url, fallos: fallosConsecutivos }
        );
      }
    }

    if (exito && estrategia) {
      const estratObj = safeJsonParse(estrategia, {});
      if (estratObj.htmlHash) {
        this.guardarAprendizaje('html_structure', estratObj.htmlHash, 1.0);
      }
    }
  }
}

module.exports = {
  MemoriaAgente,
  init,
  _private: {
    safeJsonParse,
    safeJsonStringify,
  },
};
