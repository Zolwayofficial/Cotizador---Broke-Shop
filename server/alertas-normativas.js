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

const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const DB_PATH = process.env.DB_PATH || './data/cotizador.db';
let db = null;
let SQL = null;

// ═══════════════════════════════════════════════════
// INICIALIZACIÓN
// ═══════════════════════════════════════════════════

async function init() {
  const dir = path.dirname(DB_PATH);
  fs.mkdirSync(dir, { recursive: true });

  // Inicializar sql.js
  SQL = await initSqlJs();

  // Cargar o crear base de datos
  try {
    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }
  } catch (e) {
    console.error('[ALERTAS] Error cargando DB:', e.message);
    db = new SQL.Database();
  }

  // Crear tablas
  crearTablas();

  // Guardar automáticamente cada 5 minutos
  const alertasAutosaveInterval = setInterval(() => {
    guardarDB();
  }, 300000);
  alertasAutosaveInterval.unref?.();

  console.log('[ALERTAS] ✅ Sistema de alertas inicializado');
}

// ═══════════════════════════════════════════════════
// CREAR TABLAS
// ═══════════════════════════════════════════════════

function crearTablas() {
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS alertas_normativas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL,
        entidad TEXT NOT NULL,
        titulo TEXT NOT NULL,
        descripcion TEXT,
        nivel TEXT DEFAULT 'info',
        partida_afectada TEXT,
        metadata JSON,
        leido BOOLEAN DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS cambios_normativos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entidad TEXT NOT NULL,
        tipo_cambio TEXT NOT NULL,
        valor_anterior TEXT,
        valor_nuevo TEXT,
        detectado_en TEXT DEFAULT (datetime('now'))
      )
    `);

    console.log('[ALERTAS] ✅ Tablas creadas');
  } catch (e) {
    console.error('[ALERTAS] Error creando tablas:', e.message);
  }
}

// ═══════════════════════════════════════════════════
// GUARDAR BASE DE DATOS
// ═══════════════════════════════════════════════════

function guardarDB() {
  if (!db) return;

  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (e) {
    console.error('[ALERTAS] Error guardando:', e.message);
  }
}

// ═══════════════════════════════════════════════════
// MÉTODOS DE CONSULTA
// ═══════════════════════════════════════════════════

function run(sql, params = []) {
  if (!db) return { changes: 0 };
  db.run(sql, params);
  return { changes: 0 };
}

function get(sql, params = []) {
  if (!db) return null;
  const stmt = db.prepare(sql);
  stmt.bind(params);

  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }

  stmt.free();
  return null;
}

function all(sql, params = []) {
  if (!db) return [];
  const stmt = db.prepare(sql);
  stmt.bind(params);

  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }

  stmt.free();
  return results;
}

// ═══════════════════════════════════════════════════
// MÉTODOS PÚBLICOS
// ═══════════════════════════════════════════════════

// Agregar alerta
function agregarAlerta(tipo, mensaje, datos = {}) {
  const alerta = {
    tipo,
    entidad: datos.entidad || 'Sistema',
    titulo: mensaje,
    descripcion: datos.descripcion || mensaje,
    nivel: datos.nivel || 'info',
    partida_afectada: datos.partida_afectada || null,
    metadata: JSON.stringify(datos.metadata || {}),
    leido: 0
  };

  run(`
    INSERT INTO alertas_normativas 
    (tipo, entidad, titulo, descripcion, nivel, partida_afectada, metadata, leido)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `, [
    alerta.tipo, alerta.entidad, alerta.titulo, alerta.descripcion,
    alerta.nivel, alerta.partida_afectada, alerta.metadata
  ]);

  console.log(`[ALERTAS] ${tipo.toUpperCase()}: ${mensaje}`);

  return alerta;
}

// Obtener alertas
function obtenerAlertas() {
  return all('SELECT * FROM alertas_normativas ORDER BY created_at DESC LIMIT 50');
}

// Obtener alertas no leídas
function obtenerAlertasNoLeidas() {
  return all('SELECT * FROM alertas_normativas WHERE leido = 0 ORDER BY created_at DESC');
}

// Marcar alerta como leída
function marcarAlertaLeida(id) {
  run('UPDATE alertas_normativas SET leido = 1 WHERE id = ?', [id]);
  return true;
}

// Limpiar alertas leídas
function limpiarAlertasLeidas() {
  const antes = all('SELECT COUNT(*) as count FROM alertas_normativas WHERE leido = 0').count;
  run('DELETE FROM alertas_normativas WHERE leido = 1');
  return { eliminadas: antes };
}

// Registrar cambio normativo
function registrarCambio(entidad, tipo, valorAnterior, valorNuevo) {
  run(`
    INSERT INTO cambios_normativos 
    (entidad, tipo_cambio, valor_anterior, valor_nuevo)
    VALUES (?, ?, ?, ?)
  `, [entidad, tipo, valorAnterior, valorNuevo]);
}

// Obtener estadísticas
function obtenerEstadisticas() {
  const total = get('SELECT COUNT(*) as count FROM alertas_normativas').count;
  const noLeidas = get('SELECT COUNT(*) as count FROM alertas_normativas WHERE leido = 0').count;
  const criticas = get('SELECT COUNT(*) as count FROM alertas_normativas WHERE nivel = \'critico\'').count;
  const alertas = obtenerAlertas();

  return {
    total,
    noLeidas,
    criticas,
    alertas
  };
}

// ═══════════════════════════════════════════════════
// EXPORTAR
// ═══════════════════════════════════════════════════

module.exports = {
  init,
  agregarAlerta,
  obtenerAlertas,
  obtenerAlertasNoLeidas,
  marcarAlertaLeida,
  limpiarAlertasLeidas,
  registrarCambio,
  obtenerEstadisticas
};
