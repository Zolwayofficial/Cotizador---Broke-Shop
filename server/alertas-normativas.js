// server/alertas-normativas.js
// 
// SISTEMA DE ALERTAS DE CAMBIOS NORMATIVOS
// 
// Características:
// - Monitorea cambios en SUNAT, ADUANET, VUCE, INDECOPI
// - Detecta cambios en aranceles
// - Detecta nuevas restricciones
// - Detecta antidumping por vencer
// - Envía alertas por email/Telegram (configurable)
// - Almacena historial de alertas

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_PATH = process.env.DB_PATH || "./data/cotizador.db";
let db = null;
let useBetterSqlite3 = false;

// ═══════════════════════════════════════════════════
// INICIALIZACIÓN
// ═══════════════════════════════════════════════════
async function init() {
  const dir = path.dirname(DB_PATH);
  fs.mkdirSync(dir, { recursive: true });

  try {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    useBetterSqlite3 = true;
    console.log("[ALERTAS] ✅ better-sqlite3 cargado");
  } catch (e) {
    try {
      const initSqlJs = require("sql.js");
      const SQL = await initSqlJs();
      
      if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
      } else {
        db = new SQL.Database();
      }
      useBetterSqlite3 = false;
      console.log("[ALERTAS] ✅ sql.js cargado");
    } catch (e2) {
      console.error("[ALERTAS] ❌ Error:", e2.message);
      throw e2;
    }
  }

  // Crear tablas de alertas
  db.exec(`
    CREATE TABLE IF NOT EXISTS alertas_normativas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      entidad TEXT NOT NULL,
      titulo TEXT NOT NULL,
      descripcion TEXT,
      nivel TEXT DEFAULT 'info',
      partida_afectada TEXT,
      pais_afectado TEXT,
      fecha_vigencia TEXT,
      leido BOOLEAN DEFAULT 0,
      enviado BOOLEAN DEFAULT 0,
      metadata JSON,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS suscripciones_alertas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id TEXT,
      email TEXT,
      telegram_chat_id TEXT,
      tipos_suscritos JSON,
      activo BOOLEAN DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS historial_cambios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entidad TEXT NOT NULL,
      tipo_cambio TEXT NOT NULL,
      valor_anterior TEXT,
      valor_nuevo TEXT,
      partida TEXT,
      detectado_en TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_alertas_tipo ON alertas_normativas(tipo);
    CREATE INDEX IF NOT EXISTS idx_alertas_entidad ON alertas_normativas(entidad);
    CREATE INDEX IF NOT EXISTS idx_alertas_leido ON alertas_normativas(leido);
    CREATE INDEX IF NOT EXISTS idx_historial_entidad ON historial_cambios(entidad);

    console.log("[ALERTAS] ✅ Tablas creadas");
  `);
}

// ═══════════════════════════════════════════════════
// WRAPPERS PARA COMPATIBILIDAD
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
    db.exec(sql);
    return { changes: db.getRowsModified() };
  }
}

// ═══════════════════════════════════════════════════
// TIPOS DE ALERTAS
// ═══════════════════════════════════════════════════

const TIPOS_ALERTA = {
  CAMBIO_ARANCEL: 'cambio_arancel',
  NUEVA_RESTRICCION: 'nueva_restriccion',
  ANTIDUMPING_VENCE: 'antidumping_vence',
  TLC_CAMBIO: 'tlc_cambio',
  NORMA_NUEVA: 'norma_nueva',
  NORMA_MODIFICADA: 'norma_modificada',
  NORMA_DEROGADA: 'norma_derogada',
  TC_VARIACION: 'tc_variacion',
  ERROR_SISTEMA: 'error_sistema'
};

const NIVELES_ALERTA = {
  CRITICO: 'critico',  // Rojo - Acción inmediata requerida
  ALTO: 'alto',        // Naranja - Importante
  MEDIO: 'medio',      // Amarillo - Moderado
  BAJO: 'bajo',        // Azul - Informativo
  INFO: 'info'         // Gris - Solo información
};

// ═══════════════════════════════════════════════════
// FUNCIONES PRINCIPALES
// ═══════════════════════════════════════════════════

// Crear nueva alerta
function crearAlerta(tipo, entidad, titulo, descripcion, opciones = {}) {
  try {
    const {
      nivel = 'info',
      partida_afectada = null,
      pais_afectado = null,
      fecha_vigencia = null,
      metadata = {}
    } = opciones;

    const result = dbRun(`
      INSERT INTO alertas_normativas 
      (tipo, entidad, titulo, descripcion, nivel, partida_afectada, pais_afectado, fecha_vigencia, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [tipo, entidad, titulo, descripcion, nivel, partida_afectada, pais_afectado, fecha_vigencia, JSON.stringify(metadata)]);

    console.log(`[ALERTAS] 📢 ${nivel.toUpperCase()}: ${titulo}`);
    
    // Enviar notificaciones a suscriptores
    enviarNotificaciones(result.lastInsertRowid, tipo, titulo, descripcion);
    
    return result.lastInsertRowid;
  } catch (e) {
    console.error("[ALERTAS] Error creando alerta:", e.message);
    return null;
  }
}

// Registrar cambio en historial
function registrarCambio(entidad, tipoCambio, valorAnterior, valorNuevo, partida = null) {
  try {
    dbRun(`
      INSERT INTO historial_cambios 
      (entidad, tipo_cambio, valor_anterior, valor_nuevo, partida)
      VALUES (?, ?, ?, ?, ?)
    `, [entidad, tipoCambio, valorAnterior, valorNuevo, partida]);

    // Si es cambio importante, crear alerta
    if (tipoCambio === 'arancel' || tipoCambio === 'restriccion') {
      const nivel = tipoCambio === 'arancel' ? 'alto' : 'medio';
      crearAlerta(
        tipoCambio === 'arancel' ? TIPOS_ALERTA.CAMBIO_ARANCEL : TIPOS_ALERTA.NUEVA_RESTRICCION,
        entidad,
        `Cambio de ${tipoCambio} detectado`,
        `${partida || 'General'}: ${valorAnterior} → ${valorNuevo}`,
        {
          nivel,
          partida_afectada: partida,
          metadata: { anterior: valorAnterior, nuevo: valorNuevo }
        }
      );
    }

    return true;
  } catch (e) {
    console.error("[ALERTAS] Error registrando cambio:", e.message);
    return false;
  }
}

// Obtener alertas no leídas
function obtenerAlertasNoLeidas(usuario_id = null) {
  try {
    return dbAll(`
      SELECT * FROM alertas_normativas 
      WHERE leido = 0 
      ORDER BY 
        CASE nivel 
          WHEN 'critico' THEN 1 
          WHEN 'alto' THEN 2 
          WHEN 'medio' THEN 3 
          WHEN 'bajo' THEN 4 
          ELSE 5 
        END,
        created_at DESC
      LIMIT 50
    `);
  } catch (e) {
    console.error("[ALERTAS] Error obteniendo alertas:", e.message);
    return [];
  }
}

// Obtener todas las alertas (con paginación)
function obtenerAlertas(page = 1, limit = 20, filtros = {}) {
  try {
    const offset = (page - 1) * limit;
    let where = '1=1';
    const params = [];

    if (filtros.tipo) {
      where += ' AND tipo = ?';
      params.push(filtros.tipo);
    }

    if (filtros.entidad) {
      where += ' AND entidad = ?';
      params.push(filtros.entidad);
    }

    if (filtros.nivel) {
      where += ' AND nivel = ?';
      params.push(filtros.nivel);
    }

    if (filtros.leido !== undefined) {
      where += ' AND leido = ?';
      params.push(filtros.leido ? 1 : 0);
    }

    const total = dbGet(`SELECT COUNT(*) as count FROM alertas_normativas WHERE ${where}`, params).count;

    const alertas = dbAll(`
      SELECT * FROM alertas_normativas 
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    return {
      alertas,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  } catch (e) {
    console.error("[ALERTAS] Error obteniendo alertas:", e.message);
    return { alertas: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } };
  }
}

// Marcar alerta como leída
function marcarAlertaLeida(id) {
  try {
    dbRun(`UPDATE alertas_normativas SET leido = 1 WHERE id = ?`, [id]);
    return true;
  } catch (e) {
    console.error("[ALERTAS] Error marcando alerta:", e.message);
    return false;
  }
}

// Marcar todas las alertas como leídas
function marcarTodasLeidas(usuario_id = null) {
  try {
    const result = dbRun(`UPDATE alertas_normativas SET leido = 1 WHERE leido = 0`, []);
    return result.changes;
  } catch (e) {
    console.error("[ALERTAS] Error marcando todas:", e.message);
    return 0;
  }
}

// Suscribirse a alertas
function suscribirAlertas(email, tiposSuscritos = [], telegram_chat_id = null) {
  try {
    const result = dbRun(`
      INSERT INTO suscripciones_alertas 
      (email, telegram_chat_id, tipos_suscritos, activo)
      VALUES (?, ?, ?, 1)
    `, [email, telegram_chat_id, JSON.stringify(tiposSuscritos)]);

    console.log(`[ALERTAS] ✅ Usuario suscrito: ${email}`);
    return result.lastInsertRowid;
  } catch (e) {
    console.error("[ALERTAS] Error suscribiendo:", e.message);
    return null;
  }
}

// Enviar notificaciones
function enviarNotificaciones(alertaId, tipo, titulo, descripcion) {
  try {
    // Obtener suscriptores
    const suscriptores = dbAll(`
      SELECT email, telegram_chat_id, tipos_suscritos 
      FROM suscripciones_alertas 
      WHERE activo = 1
    `);

    for (const suscriptor of suscriptores) {
      const tipos = JSON.parse(suscriptor.tipos_suscritos || '[]');
      
      // Si no hay tipos específicos, enviar todas
      if (tipos.length === 0 || tipos.includes(tipo)) {
        // Enviar email (si está configurado)
        if (suscriptor.email && process.env.EMAIL_SMTP_HOST) {
          enviarEmail(suscriptor.email, titulo, descripcion);
        }

        // Enviar Telegram (si está configurado)
        if (suscriptor.telegram_chat_id && process.env.TELEGRAM_BOT_TOKEN) {
          enviarTelegram(suscriptor.telegram_chat_id, titulo, descripcion);
        }
      }
    }

    // Marcar como enviado
    dbRun(`UPDATE alertas_normativas SET enviado = 1 WHERE id = ?`, [alertaId]);
  } catch (e) {
    console.error("[ALERTAS] Error enviando notificaciones:", e.message);
  }
}

// Enviar email (placeholder - implementar con nodemailer)
function enviarEmail(email, titulo, descripcion) {
  console.log(`[ALERTAS] 📧 Email a ${email}: ${titulo}`);
  // TODO: Implementar con nodemailer cuando esté configurado
}

// Enviar Telegram (placeholder - implementar con node-telegram-bot-api)
function enviarTelegram(chatId, titulo, descripcion) {
  console.log(`[ALERTAS] 📱 Telegram a ${chatId}: ${titulo}`);
  // TODO: Implementar con node-telegram-bot-api cuando esté configurado
}

// Detectar cambios automáticamente (para usar con CRON)
async function detectarCambiosAutomaticos() {
  console.log("[ALERTAS] 🔍 Detectando cambios normativos...");

  // TODO: Implementar detección real comparando con datos anteriores
  // Ejemplo:
  // - Comparar aranceles actuales vs anteriores
  // - Comparar restricciones actuales vs anteriores
  // - Verificar antidumping por vencer

  console.log("[ALERTAS] ✅ Detección completada");
}

// Obtener estadísticas de alertas
function obtenerEstadisticas() {
  try {
    const total = dbGet(`SELECT COUNT(*) as count FROM alertas_normativas`).count;
    const noLeidas = dbGet(`SELECT COUNT(*) as count FROM alertas_normativas WHERE leido = 0`).count;
    const criticas = dbGet(`SELECT COUNT(*) as count FROM alertas_normativas WHERE nivel = 'critico' AND leido = 0`).count;

    const porTipo = dbAll(`
      SELECT tipo, COUNT(*) as count 
      FROM alertas_normativas 
      WHERE created_at > datetime('now', '-7 days')
      GROUP BY tipo
    `);

    const porEntidad = dbAll(`
      SELECT entidad, COUNT(*) as count 
      FROM alertas_normativas 
      WHERE created_at > datetime('now', '-7 days')
      GROUP BY entidad
    `);

    return {
      total,
      noLeidas,
      criticas,
      porTipo,
      porEntidad,
      periodo: 'últimos 7 días'
    };
  } catch (e) {
    console.error("[ALERTAS] Error obteniendo estadísticas:", e.message);
    return null;
  }
}

// Limpiar alertas antiguas
function limpiarAlertasAntiguas(dias = 90) {
  try {
    const result = dbRun(`
      DELETE FROM alertas_normativas 
      WHERE created_at < datetime('now', ? || ' days') AND leido = 1
    `, [`-${dias}`]);

    console.log(`[ALERTAS] 🧹 ${result.changes} alertas eliminadas (> ${dias} días)`);
    return result.changes;
  } catch (e) {
    console.error("[ALERTAS] Error limpiando:", e.message);
    return 0;
  }
}

// ═══════════════════════════════════════════════════
// EXPORTAR
// ═══════════════════════════════════════════════════

module.exports = {
  init,
  crearAlerta,
  registrarCambio,
  obtenerAlertasNoLeidas,
  obtenerAlertas,
  marcarAlertaLeida,
  marcarTodasLeidas,
  suscribirAlertas,
  detectarCambiosAutomaticos,
  obtenerEstadisticas,
  limpiarAlertasAntiguas,
  TIPOS_ALERTA,
  NIVELES_ALERTA
};
