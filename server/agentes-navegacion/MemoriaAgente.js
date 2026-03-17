// server/agentes-navegacion/MemoriaAgente.js
// 
// MEMORIA COMPARTIDA PARA AGENTES ESPECIALISTAS
// 
// Características:
// - Guarda experiencias de navegación
// - Aprende patrones (timeouts, estructuras, fallos)
// - Comparte conocimiento entre agentes
// - Detecta anomalías automáticamente

const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './data/cotizador.db';
let db = null;
let useBetterSqlite3 = false;

function buildLearningKey(agente, clave) {
  return `${agente}::${clave}`;
}

// ═══════════════════════════════════════════════════
// INICIALIZACIÓN
// ═══════════════════════════════════════════════════
async function init() {
  const dir = path.dirname(DB_PATH);
  fs.mkdirSync(dir, { recursive: true });

  try {
    // Intentar con better-sqlite3
    const Database = require('better-sqlite3');
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    useBetterSqlite3 = true;
    console.log('[MEMORIA AGENTE] ✅ better-sqlite3 cargado');
  } catch (e) {
    // Fallback a sql.js
    try {
      const initSqlJs = require('sql.js');
      const SQL = await initSqlJs();

      if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
        console.log('[MEMORIA AGENTE] ✅ sql.js cargado (DB existente)');
      } else {
        db = new SQL.Database();
        console.log('[MEMORIA AGENTE] ✅ sql.js cargado (DB nueva)');
      }
      useBetterSqlite3 = false;
    } catch (e2) {
      console.error('[MEMORIA AGENTE] ❌ Error:', e2.message);
      throw e2;
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS agente_experiencias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agente TEXT NOT NULL,
      url TEXT NOT NULL,
      exito BOOLEAN NOT NULL,
      tiempo_respuesta_ms INTEGER,
      estrategia_usada TEXT,
      error_message TEXT,
      html_structure_hash TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS agente_aprendizajes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agente TEXT NOT NULL,
      clave TEXT NOT NULL UNIQUE,
      valor JSON NOT NULL,
      confianza REAL DEFAULT 1.0,
      veces_verificado INTEGER DEFAULT 0,
      ultima_verificacion TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS agente_patrones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agente TEXT NOT NULL,
      patron TEXT NOT NULL,
      descripcion TEXT,
      frecuencia INTEGER DEFAULT 1,
      ultima_ocurrencia TEXT,
      activo BOOLEAN DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS agente_alertas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agente_origen TEXT NOT NULL,
      agente_destino TEXT,
      tipo TEXT NOT NULL,
      mensaje TEXT NOT NULL,
      datos JSON,
      leido BOOLEAN DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS agente_config (
      agente TEXT PRIMARY KEY,
      timeout_ms INTEGER DEFAULT 30000,
      reintentos INTEGER DEFAULT 3,
      cache_ttl_ms INTEGER DEFAULT 3600000,
      user_agent TEXT,
      headers JSON,
      actualizado TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_exp_agente ON agente_experiencias(agente)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_exp_url ON agente_experiencias(url)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_aprendizajes_agente ON agente_aprendizajes(agente)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_patrones_agente ON agente_patrones(agente)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_alertas_leido ON agente_alertas(leido)');

  try {
    db.exec(`
      INSERT OR IGNORE INTO agente_config (agente, timeout_ms, reintentos, cache_ttl_ms, user_agent)
      VALUES 
        ('SUNAT', 45000, 3, 3600000, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
        ('ADUANET', 45000, 3, 3600000, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
        ('VUCE', 60000, 3, 7200000, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
        ('INDECOPI', 60000, 3, 86400000, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
    `);
  } catch (e) {
    // Ignorar error si las tablas no existen aún
  }

  console.log('[MEMORIA AGENTE] ✅ Inicializada');
}

// ═══════════════════════════════════════════════════
// WRAPPERS PARA COMPATIBILIDAD (sql.js vs better-sqlite3)
// ═══════════════════════════════════════════════════

function dbAll(sql, params = []) {
  if (useBetterSqlite3) {
    return db.prepare(sql).all(...params);
  } else {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const results = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
  }
}

function dbGet(sql, params = []) {
  if (useBetterSqlite3) {
    return db.prepare(sql).get(...params);
  } else {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    let result = null;
    if (stmt.step()) result = stmt.getAsObject();
    stmt.free();
    return result;
  }
}

function dbRun(sql, params = []) {
  if (useBetterSqlite3) {
    return db.prepare(sql).run(...params);
  } else {
    db.run(sql, params);
    const lastInsert = db.exec('SELECT last_insert_rowid() AS id');
    const lastInsertRowid = lastInsert?.[0]?.values?.[0]?.[0] || 0;
    return { changes: db.getRowsModified(), lastInsertRowid };
  }
}

// ═══════════════════════════════════════════════════
// CLASE MemoriaAgente
// ═══════════════════════════════════════════════════
class MemoriaAgente {
  constructor(nombreAgente) {
    this.agente = nombreAgente;
    this.config = this._cargarConfig();
  }

  // ═══════════════════════════════════════════════════
  // GUARDAR EXPERIENCIA
  // ═══════════════════════════════════════════════════
  guardarExperiencia(url, exito, tiempoMs, estrategia, error = null, htmlHash = null) {
    // Validar que this.agente esté definido
    if (!this.agente) {
      console.error('[MEMORIA AGENTE] Error: agente no definido al guardar experiencia');
      return;
    }

    try {
      dbRun(`
        INSERT INTO agente_experiencias (agente, url, exito, tiempo_respuesta_ms, estrategia_usada, error_message, html_structure_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [this.agente, url, exito ? 1 : 0, tiempoMs, estrategia, error, htmlHash]);
    } catch (e) {
      // Si falla (ej: tablas no existen), ignorar silenciosamente
      // Esto puede pasar durante la inicialización
      console.log('[MEMORIA AGENTE] Info: Experiencia no guardada (tablas no listas)');
    }

    // Aprender de la experiencia
    this._aprenderDeExperiencia(url, exito, tiempoMs, estrategia, error);
  }

  // ═══════════════════════════════════════════════════
  // BUSCAR EXPERIENCIAS PREVIAS
  // ═══════════════════════════════════════════════════
  buscarExperiencias(url, limite = 10) {
    return dbAll(`
      SELECT * FROM agente_experiencias 
      WHERE agente = ? AND url = ?
      ORDER BY created_at DESC 
      LIMIT ?
    `, [this.agente, url, limite]);
  }

  // ═══════════════════════════════════════════════════
  // OBTENER ESTRATEGIA QUE FUNCIONÓ ANTES
  // ═══════════════════════════════════════════════════
  obtenerEstrategiaExitosa(url) {
    const experiencia = dbGet(`
      SELECT estrategia_usada, tiempo_respuesta_ms 
      FROM agente_experiencias 
      WHERE agente = ? AND url = ? AND exito = 1
      ORDER BY created_at DESC 
      LIMIT 1
    `, [this.agente, url]);

    return experiencia ? JSON.parse(experiencia.estrategia_usada) : null;
  }

  // ═══════════════════════════════════════════════════
  // GUARDAR APRENDIZAJE
  // ═══════════════════════════════════════════════════
  guardarAprendizaje(clave, valor, confianza = 1.0) {
    // Validar que this.agente esté definido
    if (!this.agente) {
      console.error('[MEMORIA AGENTE] Error: agente no definido al guardar aprendizaje');
      return;
    }

    try {
      const storageKey = buildLearningKey(this.agente, clave);
      const existing = dbGet(`
        SELECT * FROM agente_aprendizajes
        WHERE agente = ? AND clave = ?
      `, [this.agente, storageKey]);

      if (existing) {
        dbRun(`
          UPDATE agente_aprendizajes
          SET valor = ?, confianza = ?, veces_verificado = veces_verificado + 1,
              ultima_verificacion = datetime('now'), updated_at = datetime('now')
          WHERE agente = ? AND clave = ?
        `, [JSON.stringify(valor), confianza, this.agente, storageKey]);
      } else {
        dbRun(`
          INSERT INTO agente_aprendizajes (agente, clave, valor, confianza)
          VALUES (?, ?, ?, ?)
        `, [this.agente, storageKey, JSON.stringify(valor), confianza]);
      }
    } catch (e) {
      // Si falla (ej: tablas no existen), ignorar silenciosamente
      console.log('[MEMORIA AGENTE] Info: Aprendizaje no guardado (tablas no listas)');
    }
  }

  // ═══════════════════════════════════════════════════
  // OBTENER APRENDIZAJE
  // ═══════════════════════════════════════════════════
  obtenerAprendizaje(clave) {
    const storageKey = buildLearningKey(this.agente, clave);
    const row = dbGet(`
      SELECT valor, confianza, veces_verificado 
      FROM agente_aprendizajes 
      WHERE agente = ? AND clave = ? AND confianza > 0.7
    `, [this.agente, storageKey]);

    if (row) {
      return {
        ...row,
        valor: JSON.parse(row.valor)
      };
    }
    return null;
  }

  // ═══════════════════════════════════════════════════
  // DETECTAR PATRÓN (ej: "SUNAT lento los lunes")
  // ═══════════════════════════════════════════════════
  detectarPatron(patron, descripcion) {
    // Validar que this.agente esté definido
    if (!this.agente) {
      console.error('[MEMORIA AGENTE] Error: agente no definido al detectar patrón');
      return;
    }

    try {
      const existing = dbGet(`
        SELECT * FROM agente_patrones
        WHERE agente = ? AND patron = ?
      `, [this.agente, patron]);

      if (existing) {
        dbRun(`
          UPDATE agente_patrones
          SET frecuencia = frecuencia + 1, ultima_ocurrencia = datetime('now')
          WHERE agente = ? AND patron = ?
        `, [this.agente, patron]);
      } else {
        dbRun(`
          INSERT INTO agente_patrones (agente, patron, descripcion)
          VALUES (?, ?, ?)
        `, [this.agente, patron, descripcion]);
      }
    } catch (e) {
      // Si falla (ej: tablas no existen), ignorar silenciosamente
      console.log('[MEMORIA AGENTE] Info: Patrón no guardado (tablas no listas)');
    }
  }

  // ═══════════════════════════════════════════════════
  // OBTENER PATRONES ACTIVOS
  // ═══════════════════════════════════════════════════
  obtenerPatrones() {
    return dbAll(`
      SELECT patron, descripcion, frecuencia, ultima_ocurrencia
      FROM agente_patrones
      WHERE agente = ? AND activo = 1
      ORDER BY frecuencia DESC
    `, [this.agente]);
  }

  // ═══════════════════════════════════════════════════
  // ENVIAR ALERTA A OTROS AGENTES
  // ═══════════════════════════════════════════════════
  enviarAlerta(tipo, mensaje, datos = {}, agenteDestino = null) {
    // Validar que this.agente esté definido
    if (!this.agente) {
      console.error('[MEMORIA AGENTE] Error: agente no definido al enviar alerta');
      return;
    }

    dbRun(`
      INSERT INTO agente_alertas (agente_origen, agente_destino, tipo, mensaje, datos)
      VALUES (?, ?, ?, ?, ?)
    `, [this.agente, agenteDestino, tipo, mensaje, JSON.stringify(datos)]);
  }

  // ═══════════════════════════════════════════════════
  // RECIBIR ALERTAS DE OTROS AGENTES
  // ═══════════════════════════════════════════════════
  recibirAlertas() {
    return dbAll(`
      SELECT * FROM agente_alertas 
      WHERE (agente_destino = ? OR agente_destino IS NULL) AND leido = 0
      ORDER BY created_at DESC
    `, [this.agente]);
  }

  // ═══════════════════════════════════════════════════
  // MARCAR ALERTA COMO LEÍDA
  // ═══════════════════════════════════════════════════
  marcarAlertaLeida(id) {
    dbRun(`
      UPDATE agente_alertas SET leido = 1 WHERE id = ?
    `, [id]);
  }

  // ═══════════════════════════════════════════════════
  // OBTENER CONFIGURACIÓN
  // ═══════════════════════════════════════════════════
  obtenerConfig() {
    return this.config;
  }

  // ═══════════════════════════════════════════════════
  // ACTUALIZAR CONFIGURACIÓN
  // ═══════════════════════════════════════════════════
  actualizarConfig(nuevaConfig) {
    dbRun(`
      UPDATE agente_config 
      SET timeout_ms = ?, reintentos = ?, cache_ttl_ms = ?, user_agent = ?, headers = ?,
          actualizado = datetime('now')
      WHERE agente = ?
    `, [
      nuevaConfig.timeout_ms || this.config.timeout_ms,
      nuevaConfig.reintentos || this.config.reintentos,
      nuevaConfig.cache_ttl_ms || this.config.cache_ttl_ms,
      nuevaConfig.user_agent || this.config.user_agent,
      JSON.stringify(nuevaConfig.headers || this.config.headers),
      this.agente
    ]);

    this.config = this._cargarConfig();
  }

  // ═══════════════════════════════════════════════════
  // ESTADÍSTICAS DEL AGENTE
  // ═══════════════════════════════════════════════════
  obtenerEstadisticas() {
    const total = dbGet(`
      SELECT COUNT(*) as count FROM agente_experiencias WHERE agente = ?
    `, [this.agente]).count;

    const exitosas = dbGet(`
      SELECT COUNT(*) as count FROM agente_experiencias WHERE agente = ? AND exito = 1
    `, [this.agente]).count;

    const promedioTiempo = dbGet(`
      SELECT AVG(tiempo_respuesta_ms) as avg FROM agente_experiencias 
      WHERE agente = ? AND exito = 1
    `, [this.agente]).avg;

    const fallosRecientes = dbGet(`
      SELECT COUNT(*) as count FROM agente_experiencias 
      WHERE agente = ? AND exito = 0 AND created_at > datetime('now', '-1 hour')
    `, [this.agente]).count;

    return {
      agente: this.agente,
      total_navegaciones: total,
      exitosas: exitosas,
      fallidas: total - exitosas,
      tasa_exito: total > 0 ? ((exitosas / total) * 100).toFixed(2) : 0,
      tiempo_promedio_ms: promedioTiempo || 0,
      fallos_ultima_hora: fallosRecientes,
      configuracion: this.config,
      patrones: this.obtenerPatrones()
    };
  }

  // ═══════════════════════════════════════════════════
  // PRIVADOS
  // ═══════════════════════════════════════════════════
  _cargarConfig() {
    const row = dbGet(`
      SELECT * FROM agente_config WHERE agente = ?
    `, [this.agente]);

    return row ? {
      timeout_ms: row.timeout_ms,
      reintentos: row.reintentos,
      cache_ttl_ms: row.cache_ttl_ms,
      user_agent: row.user_agent,
      headers: JSON.parse(row.headers || '{}')
    } : {
      timeout_ms: 30000,
      reintentos: 3,
      cache_ttl_ms: 3600000,
      user_agent: 'Mozilla/5.0',
      headers: {}
    };
  }

  _aprenderDeExperiencia(url, exito, tiempoMs, estrategia, error) {
    // Aprender timeout óptimo
    if (exito && tiempoMs > (this.config.timeout_ms * 0.8)) {
      const nuevoTimeout = Math.min(120000, Math.round(tiempoMs * 1.3));
      this.actualizarConfig({ timeout_ms: nuevoTimeout });
      this.guardarAprendizaje('timeout_optimo', nuevoTimeout, 0.9);
    }

    // Aprender si el sitio está caído
    if (!exito) {
      this.detectarPatron('sitio_caido', `${url} falló ${error}`);

      // Contar fallos consecutivos en la última hora
      const fallosConsecutivos = dbGet(`
        SELECT COUNT(*) as count FROM agente_experiencias 
        WHERE agente = ? AND exito = 0 AND created_at > datetime('now', '-1 hour')
      `, [this.agente]).count;

      if (fallosConsecutivos >= 3) {
        this.guardarAprendizaje('sitio_no_disponible', {
          url,
          desde: new Date().toISOString(),
          fallos: fallosConsecutivos
        }, 0.95);

        // Alertar a otros agentes
        this.enviarAlerta(
          'sitio_caido',
          `${this.agente}: ${url} está caído (${fallosConsecutivos} fallos en 1h)`,
          { url, fallos: fallosConsecutivos }
        );
      }
    }

    // Aprender estructura HTML
    if (exito && estrategia) {
      const estratObj = JSON.parse(estrategia);
      if (estratObj.htmlHash) {
        this.guardarAprendizaje('html_structure', estratObj.htmlHash, 1.0);
      }
    }
  }
}

module.exports = { MemoriaAgente, init };
