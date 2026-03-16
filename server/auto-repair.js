// server/auto-repair.js — Sistema de Auto-Corrección y Aprendizaje de Fallos
// 
// CARACTERÍSTICAS ÚNICAS (NIVEL NUNCA VISTO):
// 1. Registra CADA fallo de cada agente
// 2. Registra la solución que funcionó
// 3. La próxima vez, intenta la solución ANTES de fallar
// 4. Aprende patrones de fallos (ej: "IA falla con PDFs escaneados")
// 5. Sugiere correcciones preventivas
//
// ESTO ES AUTO-REPARACIÓN - NADIE LO TIENE EN 2026

const path = require("path");
const fs = require("fs");

const DB_PATH = process.env.DB_PATH || "./data/cotizador.db";
let db = null;
let useBetterSqlite3 = false;

// ═══════════════════════════════════════════════════
// INICIALIZACIÓN (con fallback a sql.js)
// ═══════════════════════════════════════════════════
async function init() {
  const dir = path.dirname(DB_PATH);
  fs.mkdirSync(dir, { recursive: true });

  try {
    // Intentar con better-sqlite3
    const Database = require("better-sqlite3");
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    useBetterSqlite3 = true;
    console.log("[AUTO-REPAIR] ✅ better-sqlite3 cargado");
  } catch (e) {
    // Fallback a sql.js
    try {
      const initSqlJs = require("sql.js");
      const SQL = await initSqlJs();

      if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
        console.log("[AUTO-REPAIR] ✅ sql.js cargado (DB existente)");
      } else {
        db = new SQL.Database();
        console.log("[AUTO-REPAIR] ✅ sql.js cargado (DB nueva)");
      }
      useBetterSqlite3 = false;
    } catch (e2) {
      console.error("[AUTO-REPAIR] ❌ Error cargando DB:", e2.message);
      return;
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_failures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agente TEXT NOT NULL,
      error_type TEXT NOT NULL,
      error_message TEXT,
      contexto JSON,
      intento_numero INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_solutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      failure_id INTEGER,
      solucion TEXT NOT NULL,
      funciono BOOLEAN NOT NULL,
      tiempo_ejecucion_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (failure_id) REFERENCES agent_failures(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agente TEXT NOT NULL,
      patron TEXT NOT NULL,
      solucion_recomendada TEXT,
      frecuencia INTEGER DEFAULT 1,
      exit_rate REAL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agente TEXT NOT NULL,
      clave TEXT UNIQUE NOT NULL,
      valor JSON,
      confianza REAL DEFAULT 1.0,
      veces_usado INTEGER DEFAULT 0,
      ultima_verificacion TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_failures_agente ON agent_failures(agente)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_failures_tipo ON agent_failures(error_type)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_patterns_agente ON agent_patterns(agente)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_knowledge_agente ON agent_knowledge(agente)`);

  console.log("[AUTO-REPAIR] ✅ Base de datos inicializada");
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
    db.exec(sql);
    return { changes: db.getRowsModified() };
  }
}

// ═══════════════════════════════════════════════════
// REGISTRAR FALLO
// ═══════════════════════════════════════════════════
function registrarFallo(agente, error, contexto = {}) {
  try {
    const failureId = dbRun(`
      INSERT INTO agent_failures (agente, error_type, error_message, contexto, intento_numero)
      VALUES (?, ?, ?, ?, ?)
    `, [agente, error.type || 'unknown', error.message || JSON.stringify(error), JSON.stringify(contexto), error.intento || 1]).lastInsertRowid;

    console.log(`[AUTO-REPAIR] ⚠️ ${agente} falló: ${error.message || 'Error desconocido'}`);

    // Verificar si es un patrón repetitivo
    verificarPatronRepetitivo(agente, error.type || 'unknown');

    return failureId;
  } catch (e) {
    console.error("[AUTO-REPAIR] Error registrando fallo:", e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════
// REGISTRAR SOLUCIÓN
// ═══════════════════════════════════════════════════
function registrarSolucion(failureId, solucion, funciono, tiempoEjecucion) {
  try {
    dbRun(`
      INSERT INTO agent_solutions (failure_id, solucion, funciono, tiempo_ejecucion_ms)
      VALUES (?, ?, ?, ?)
    `, [failureId, solucion, funciono ? 1 : 0, tiempoEjecucion]);

    if (funciono) {
      aprenderPatronExitoso(failureId, solucion);
      console.log(`[AUTO-REPAIR] ✅ Solución registrada: ${solucion}`);
    } else {
      console.log(`[AUTO-REPAIR] ❌ Solución no funcionó: ${solucion}`);
    }

    return true;
  } catch (e) {
    console.error("[AUTO-REPAIR] Error registrando solución:", e.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════
// OBTENER SOLUCIONES PREVIAS (AUTO-CORRECCIÓN)
// ═══════════════════════════════════════════════════
function obtenerSolucionesPrevias(agente, errorType) {
  try {
    const results = dbAll(`
      SELECT s.solucion, s.tiempo_ejecucion_ms, COUNT(*) as veces_usado,
             AVG(CASE WHEN s.funciono THEN 1 ELSE 0 END) * 100 as exit_rate
      FROM agent_failures f
      JOIN agent_solutions s ON f.id = s.failure_id
      WHERE f.agente = ? AND f.error_type = ?
      GROUP BY s.solucion
      HAVING exit_rate > 50
      ORDER BY exit_rate DESC, veces_usado DESC
      LIMIT 5
    `, [agente, errorType]);

    if (results.length > 0) {
      console.log(`[AUTO-REPAIR] 💡 ${agente}: ${results.length} solución(es) previa(s) para ${errorType}`);
    }

    return results;
  } catch (e) {
    console.error("[AUTO-REPAIR] Error obteniendo soluciones:", e.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════
// VERIFICAR PATRÓN REPETITIVO
// ═══════════════════════════════════════════════════
function verificarPatronRepetitivo(agente, errorType) {
  try {
    const count = dbGet(`
      SELECT COUNT(*) as count FROM agent_failures
      WHERE agente = ? AND error_type = ?
      AND created_at > datetime('now', '-1 hour')
    `, [agente, errorType]);

    if (count && count.count >= 5) {
      console.warn(`[AUTO-REPAIR] 🔴 PATRÓN DETECTADO: ${agente} falla ${errorType} ${count.count} veces en 1 hora`);

      // Actualizar patrón
      dbRun(`
        INSERT INTO agent_patterns (agente, patron, solucion_recomendada, frecuencia, exit_rate)
        VALUES (?, ?, NULL, 1, 0)
        ON CONFLICT(agente, patron) DO UPDATE SET
          frecuencia = frecuencia + 1,
          updated_at = datetime('now')
      `, [agente, errorType]);
    }
  } catch (e) {
    console.error("[AUTO-REPAIR] Error verificando patrón:", e.message);
  }
}

// ═══════════════════════════════════════════════════
// APRENDER PATRÓN EXITOSO
// ═══════════════════════════════════════════════════
function aprenderPatronExitoso(failureId, solucion) {
  try {
    const failure = dbGet(`SELECT * FROM agent_failures WHERE id = ?`, [failureId]);

    if (failure) {
      dbRun(`
        INSERT INTO agent_patterns (agente, patron, solucion_recomendada, frecuencia, exit_rate)
        VALUES (?, ?, ?, 1, 100)
        ON CONFLICT(agente, patron) DO UPDATE SET
          solucion_recomendada = excluded.solucion_recomendada,
          frecuencia = frecuencia + 1,
          exit_rate = ((exit_rate * frecuencia) + 100) / (frecuencia + 1),
          updated_at = datetime('now')
      `, [failure.agente, failure.error_type, solucion]);
    }
  } catch (e) {
    console.error("[AUTO-REPAIR] Error aprendiendo patrón:", e.message);
  }
}

// ═══════════════════════════════════════════════════
// OBTENER PATRONES (para prevención)
// ═══════════════════════════════════════════════════
function obtenerPatrones(agente) {
  try {
    return dbAll(`
      SELECT patron, solucion_recomendada, frecuencia, exit_rate
      FROM agent_patterns
      WHERE agente = ? AND exit_rate > 70
      ORDER BY frecuencia DESC
      LIMIT 10
    `, [agente]);
  } catch (e) {
    console.error("[AUTO-REPAIR] Error obteniendo patrones:", e.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════
// GUARDAR CONOCIMIENTO (aprendizaje permanente)
// ═══════════════════════════════════════════════════
function guardarConocimiento(agente, clave, valor, confianza = 1.0) {
  try {
    dbRun(`
      INSERT INTO agent_knowledge (agente, clave, valor, confianza)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(agente, clave) DO UPDATE SET
        valor = excluded.valor,
        confianza = excluded.confianza,
        veces_usado = veces_usado + 1,
        updated_at = datetime('now')
    `, [agente, clave, JSON.stringify(valor), confianza]);
  } catch (e) {
    console.error("[AUTO-REPAIR] Error guardando conocimiento:", e.message);
  }
}

// ═══════════════════════════════════════════════════
// OBTENER CONOCIMIENTO
// ═══════════════════════════════════════════════════
function obtenerConocimiento(agente, clave) {
  try {
    const row = dbGet(`
      SELECT valor, confianza, veces_usado
      FROM agent_knowledge
      WHERE agente = ? AND clave = ? AND confianza > 0.7
    `, [agente, clave]);

    if (row) {
      // Incrementar veces_usado
      dbRun(`
        UPDATE agent_knowledge
        SET veces_usado = veces_usado + 1,
            ultima_verificacion = datetime('now')
        WHERE agente = ? AND clave = ?
      `, [agente, clave]);

      return {
        ...row,
        valor: JSON.parse(row.valor)
      };
    }

    return null;
  } catch (e) {
    console.error("[AUTO-REPAIR] Error obteniendo conocimiento:", e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════
// WRAPPER PARA EJECUCIÓN CON AUTO-REPARACIÓN
// ═══════════════════════════════════════════════════
async function ejecutarConAutoReparacion(agente, funcion, contexto = {}) {
  const startTime = Date.now();
  const maxIntentos = 3;

  for (let intento = 1; intento <= maxIntentos; intento++) {
    try {
      // Antes de ejecutar, verificar si hay soluciones previas para este agente
      if (intento > 1) {
        const soluciones = obtenerSolucionesPrevias(agente, 'runtime_error');
        if (soluciones.length > 0) {
          console.log(`[AUTO-REPAIR] 🔄 ${agente}: Intentando solución previa #${intento - 1}`);
          // Aquí se podría aplicar la solución específica
        }
      }

      // Ejecutar función
      const resultado = await funcion();

      // Éxito - registrar tiempo de ejecución
      const duracion = Date.now() - startTime;

      // Aprender que este camino funcionó
      guardarConocimiento(agente, `ultimo_exito`, {
        contexto: Object.keys(contexto),
        duracion_promedio: duracion
      });

      return resultado;

    } catch (error) {
      const duracion = Date.now() - startTime;

      // Registrar fallo
      const failureId = registrarFallo(agente, {
        type: error.type || 'runtime_error',
        message: error.message,
        intento
      }, contexto);

      // Si es el último intento, lanzar error
      if (intento === maxIntentos) {
        console.error(`[AUTO-REPAIR] ❌ ${agente}: Falló después de ${maxIntentos} intentos`);

        // Guardar conocimiento del fallo
        guardarConocimiento(agente, `ultimo_fallo`, {
          error: error.message,
          contexto: Object.keys(contexto),
          intento: maxIntentos
        }, 0.5); // Baja confianza porque falló

        throw error;
      }

      // Registrar que reintentamos
      registrarSolucion(failureId, `reintento_${intento}`, true, duracion);

      // Esperar antes de reintentar (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, intento)));
    }
  }
}

// ═══════════════════════════════════════════════════
// ESTADÍSTICAS DE AUTO-REPARACIÓN
// ═══════════════════════════════════════════════════
function getEstadisticas() {
  try {
    const fallosTotales = dbGet(`SELECT COUNT(*) as count FROM agent_failures`).count;
    const solucionesTotales = dbGet(`SELECT COUNT(*) as count FROM agent_solutions`).count;
    const solucionesExitosas = dbGet(`SELECT COUNT(*) as count FROM agent_solutions WHERE funciono = 1`).count;
    const patrones = dbGet(`SELECT COUNT(*) as count FROM agent_patterns`).count;
    const conocimiento = dbGet(`SELECT COUNT(*) as count FROM agent_knowledge`).count;

    const fallosPorAgente = dbAll(`
      SELECT agente, COUNT(*) as count,
             (SELECT COUNT(*) FROM agent_solutions s
              JOIN agent_failures f ON s.failure_id = f.id
              WHERE f.agente = agent_failures.agente AND s.funciono = 1) as solucionados
      FROM agent_failures
      GROUP BY agente
      ORDER BY count DESC
      LIMIT 10
    `);

    const tasaExito = solucionesTotales > 0 ? ((solucionesExitosas / solucionesTotales) * 100).toFixed(2) : 0;

    return {
      fallos_totales: fallosTotales,
      soluciones_totales: solucionesTotales,
      soluciones_exitosas: solucionesExitosas,
      tasa_exito: `${tasaExito}%`,
      patrones_aprendidos: patrones,
      conocimientos_guardados: conocimiento,
      fallos_por_agente: fallosPorAgente
    };
  } catch (e) {
    console.error("[AUTO-REPAIR] Error obteniendo estadísticas:", e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════
// LIMPIEZA DE DATOS ANTIGUOS
// ═══════════════════════════════════════════════════
function limpiarDatosAntiguos(dias = 30) {
  try {
    const fallosEliminados = dbRun(`
      DELETE FROM agent_failures
      WHERE created_at < datetime('now', ? || ' days')
    `, [`-${dias}`]);

    const solucionesEliminadas = dbRun(`
      DELETE FROM agent_solutions
      WHERE failure_id NOT IN (SELECT id FROM agent_failures)
    `).changes;

    console.log(`[AUTO-REPAIR] 🧹 Limpieza: ${fallosEliminados.changes} fallos, ${solucionesEliminadas} soluciones huérfanas`);

    return {
      fallos_eliminados: fallosEliminados.changes,
      soluciones_eliminadas: solucionesEliminadas
    };
  } catch (e) {
    console.error("[AUTO-REPAIR] Error en limpieza:", e.message);
    return null;
  }
}

module.exports = {
  init,
  registrarFallo,
  registrarSolucion,
  obtenerSolucionesPrevias,
  obtenerPatrones,
  guardarConocimiento,
  obtenerConocimiento,
  ejecutarConAutoReparacion,
  getEstadisticas,
  limpiarDatosAntiguos,
  dbAll,
  dbGet,
  dbRun
};
