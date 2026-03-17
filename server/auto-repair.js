// server/auto-repair.js - Sistema de auto-correccion y aprendizaje de fallos

const dbApi = require('./db');

let initialized = false;

function buildKnowledgeKey(agente, clave) {
  return `${agente}::${clave}`;
}

function isDbReady() {
  return initialized;
}

async function init() {
  if (initialized) return;

  dbApi.exec(`
    CREATE TABLE IF NOT EXISTS agent_failures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agente TEXT NOT NULL,
      error_type TEXT NOT NULL,
      error_message TEXT,
      contexto TEXT,
      intento_numero INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  dbApi.exec(`
    CREATE TABLE IF NOT EXISTS agent_solutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      failure_id INTEGER,
      solucion TEXT NOT NULL,
      funciono INTEGER NOT NULL,
      tiempo_ejecucion_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (failure_id) REFERENCES agent_failures(id)
    )
  `);

  dbApi.exec(`
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

  dbApi.exec(`
    CREATE TABLE IF NOT EXISTS agent_knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agente TEXT NOT NULL,
      clave TEXT UNIQUE NOT NULL,
      valor TEXT,
      confianza REAL DEFAULT 1.0,
      veces_usado INTEGER DEFAULT 0,
      ultima_verificacion TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  dbApi.exec('CREATE INDEX IF NOT EXISTS idx_failures_agente ON agent_failures(agente)');
  dbApi.exec('CREATE INDEX IF NOT EXISTS idx_failures_tipo ON agent_failures(error_type)');
  dbApi.exec('CREATE INDEX IF NOT EXISTS idx_patterns_agente ON agent_patterns(agente)');
  dbApi.exec('CREATE INDEX IF NOT EXISTS idx_knowledge_agente ON agent_knowledge(agente)');
  dbApi.exec(`
    DELETE FROM agent_patterns
    WHERE id NOT IN (
      SELECT MIN(id) FROM agent_patterns GROUP BY agente, patron
    )
  `);
  dbApi.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_patterns_unique ON agent_patterns(agente, patron)');

  initialized = true;
  console.log('[AUTO-REPAIR] Base de datos inicializada');
}

function dbAll(sql, params = []) {
  if (!isDbReady()) return [];
  return dbApi.all(sql, params);
}

function dbGet(sql, params = []) {
  if (!isDbReady()) return null;
  return dbApi.get(sql, params);
}

function dbRun(sql, params = []) {
  if (!isDbReady()) return { changes: 0, lastInsertRowid: 0 };
  dbApi.run(sql, params);
  const lastInsert = dbApi.get('SELECT last_insert_rowid() AS id');
  return { changes: 0, lastInsertRowid: lastInsert?.id || 0 };
}

function registrarFallo(agente, error, contexto = {}) {
  if (!isDbReady()) return null;
  try {
    const failureId = dbRun(
      `
        INSERT INTO agent_failures (agente, error_type, error_message, contexto, intento_numero)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        agente,
        error.type || 'unknown',
        error.message || JSON.stringify(error),
        JSON.stringify(contexto),
        error.intento || 1,
      ]
    ).lastInsertRowid;

    console.log(`[AUTO-REPAIR] ${agente} fallo: ${error.message || 'Error desconocido'}`);
    verificarPatronRepetitivo(agente, error.type || 'unknown');
    return failureId;
  } catch (e) {
    console.error('[AUTO-REPAIR] Error registrando fallo:', e.message);
    return null;
  }
}

function registrarSolucion(failureId, solucion, funciono, tiempoEjecucion) {
  if (!isDbReady()) return false;
  try {
    dbRun(
      `
        INSERT INTO agent_solutions (failure_id, solucion, funciono, tiempo_ejecucion_ms)
        VALUES (?, ?, ?, ?)
      `,
      [failureId, solucion, funciono ? 1 : 0, tiempoEjecucion]
    );

    if (funciono) {
      aprenderPatronExitoso(failureId, solucion);
      console.log(`[AUTO-REPAIR] Solucion registrada: ${solucion}`);
    }

    return true;
  } catch (e) {
    console.error('[AUTO-REPAIR] Error registrando solucion:', e.message);
    return false;
  }
}

function obtenerSolucionesPrevias(agente, errorType) {
  if (!isDbReady()) return [];
  try {
    const results = dbAll(
      `
        SELECT s.solucion, s.tiempo_ejecucion_ms, COUNT(*) as veces_usado,
               AVG(CASE WHEN s.funciono THEN 1 ELSE 0 END) * 100 as exit_rate
        FROM agent_failures f
        JOIN agent_solutions s ON f.id = s.failure_id
        WHERE f.agente = ? AND f.error_type = ?
        GROUP BY s.solucion
        HAVING exit_rate > 50
        ORDER BY exit_rate DESC, veces_usado DESC
        LIMIT 5
      `,
      [agente, errorType]
    );

    if (results.length > 0) {
      console.log(`[AUTO-REPAIR] ${agente}: ${results.length} solucion(es) previas para ${errorType}`);
    }

    return results;
  } catch (e) {
    console.error('[AUTO-REPAIR] Error obteniendo soluciones:', e.message);
    return [];
  }
}

function verificarPatronRepetitivo(agente, errorType) {
  if (!isDbReady()) return;
  try {
    const count = dbGet(
      `
        SELECT COUNT(*) as count
        FROM agent_failures
        WHERE agente = ? AND error_type = ?
          AND created_at > datetime('now', '-1 hour')
      `,
      [agente, errorType]
    );

    if (count && count.count >= 5) {
      console.warn(`[AUTO-REPAIR] Patron detectado: ${agente} falla ${errorType} ${count.count} veces en 1 hora`);

      dbRun(
        `
          INSERT INTO agent_patterns (agente, patron, solucion_recomendada, frecuencia, exit_rate)
          VALUES (?, ?, NULL, 1, 0)
          ON CONFLICT(agente, patron) DO UPDATE SET
            frecuencia = frecuencia + 1,
            updated_at = datetime('now')
        `,
        [agente, errorType]
      );
    }
  } catch (e) {
    console.error('[AUTO-REPAIR] Error verificando patron:', e.message);
  }
}

function aprenderPatronExitoso(failureId, solucion) {
  if (!isDbReady()) return;
  try {
    const failure = dbGet('SELECT * FROM agent_failures WHERE id = ?', [failureId]);

    if (failure) {
      dbRun(
        `
          INSERT INTO agent_patterns (agente, patron, solucion_recomendada, frecuencia, exit_rate)
          VALUES (?, ?, ?, 1, 100)
          ON CONFLICT(agente, patron) DO UPDATE SET
            solucion_recomendada = excluded.solucion_recomendada,
            frecuencia = frecuencia + 1,
            exit_rate = ((exit_rate * frecuencia) + 100) / (frecuencia + 1),
            updated_at = datetime('now')
        `,
        [failure.agente, failure.error_type, solucion]
      );
    }
  } catch (e) {
    console.error('[AUTO-REPAIR] Error aprendiendo patron:', e.message);
  }
}

function obtenerPatrones(agente) {
  if (!isDbReady()) return [];
  try {
    return dbAll(
      `
        SELECT patron, solucion_recomendada, frecuencia, exit_rate
        FROM agent_patterns
        WHERE agente = ? AND exit_rate > 70
        ORDER BY frecuencia DESC
        LIMIT 10
      `,
      [agente]
    );
  } catch (e) {
    console.error('[AUTO-REPAIR] Error obteniendo patrones:', e.message);
    return [];
  }
}

function guardarConocimiento(agente, clave, valor, confianza = 1.0) {
  if (!isDbReady()) return;
  try {
    const storageKey = buildKnowledgeKey(agente, clave);
    dbRun(
      `
        INSERT INTO agent_knowledge (agente, clave, valor, confianza)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(clave) DO UPDATE SET
          agente = excluded.agente,
          valor = excluded.valor,
          confianza = excluded.confianza,
          veces_usado = veces_usado + 1,
          updated_at = datetime('now')
      `,
      [agente, storageKey, JSON.stringify(valor), confianza]
    );
  } catch (e) {
    console.error('[AUTO-REPAIR] Error guardando conocimiento:', e.message);
  }
}

function obtenerConocimiento(agente, clave) {
  if (!isDbReady()) return null;
  try {
    const storageKey = buildKnowledgeKey(agente, clave);
    const row = dbGet(
      `
        SELECT valor, confianza, veces_usado
        FROM agent_knowledge
        WHERE agente = ? AND clave = ? AND confianza > 0.7
      `,
      [agente, storageKey]
    );

    if (!row) return null;

    dbRun(
      `
        UPDATE agent_knowledge
        SET veces_usado = veces_usado + 1,
            ultima_verificacion = datetime('now')
        WHERE agente = ? AND clave = ?
      `,
      [agente, storageKey]
    );

    return {
      ...row,
      valor: JSON.parse(row.valor),
    };
  } catch (e) {
    console.error('[AUTO-REPAIR] Error obteniendo conocimiento:', e.message);
    return null;
  }
}

async function ejecutarConAutoReparacion(agente, funcion, contexto = {}) {
  const startTime = Date.now();
  const maxIntentos = 3;

  for (let intento = 1; intento <= maxIntentos; intento += 1) {
    try {
      if (intento > 1) {
        const soluciones = obtenerSolucionesPrevias(agente, 'runtime_error');
        if (soluciones.length > 0) {
          console.log(`[AUTO-REPAIR] ${agente}: intentando solucion previa #${intento - 1}`);
        }
      }

      const resultado = await funcion();
      const duracion = Date.now() - startTime;

      guardarConocimiento(agente, 'ultimo_exito', {
        contexto: Object.keys(contexto),
        duracion_promedio: duracion,
      });

      return resultado;
    } catch (error) {
      const duracion = Date.now() - startTime;
      const failureId = registrarFallo(
        agente,
        {
          type: error.type || 'runtime_error',
          message: error.message,
          intento,
        },
        contexto
      );

      if (intento === maxIntentos) {
        console.error(`[AUTO-REPAIR] ${agente}: fallo despues de ${maxIntentos} intentos`);

        guardarConocimiento(
          agente,
          'ultimo_fallo',
          {
            error: error.message,
            contexto: Object.keys(contexto),
            intento: maxIntentos,
          },
          0.5
        );

        throw error;
      }

      registrarSolucion(failureId, `reintento_${intento}`, true, duracion);
      await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, intento)));
    }
  }
}

function getEstadisticas() {
  if (!isDbReady()) return null;
  try {
    const fallosTotales = Number(dbGet('SELECT COUNT(*) as count FROM agent_failures')?.count || 0);
    const solucionesTotales = Number(dbGet('SELECT COUNT(*) as count FROM agent_solutions')?.count || 0);
    const solucionesExitosas = Number(dbGet('SELECT COUNT(*) as count FROM agent_solutions WHERE funciono = 1')?.count || 0);
    const patrones = Number(dbGet('SELECT COUNT(*) as count FROM agent_patterns')?.count || 0);
    const conocimiento = Number(dbGet('SELECT COUNT(*) as count FROM agent_knowledge')?.count || 0);

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
      fallos_por_agente: fallosPorAgente,
    };
  } catch (e) {
    console.error('[AUTO-REPAIR] Error obteniendo estadisticas:', e.message);
    return null;
  }
}

function limpiarDatosAntiguos(dias = 30) {
  if (!isDbReady()) return null;
  try {
    const threshold = `-${dias}`;
    const fallosAntes = Number(
      dbGet('SELECT COUNT(*) as count FROM agent_failures WHERE created_at < datetime(\'now\', ? || \' days\')', [threshold])?.count || 0
    );

    dbRun(
      `
        DELETE FROM agent_failures
        WHERE created_at < datetime('now', ? || ' days')
      `,
      [threshold]
    );

    const solucionesAntes = Number(
      dbGet('SELECT COUNT(*) as count FROM agent_solutions WHERE failure_id NOT IN (SELECT id FROM agent_failures)')?.count || 0
    );
    dbRun('DELETE FROM agent_solutions WHERE failure_id NOT IN (SELECT id FROM agent_failures)');

    return {
      fallos_eliminados: fallosAntes,
      soluciones_eliminadas: solucionesAntes,
    };
  } catch (e) {
    console.error('[AUTO-REPAIR] Error en limpieza:', e.message);
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
  dbRun,
};
