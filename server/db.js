// server/db.js - SQLite con sql.js, sin compilacion nativa obligatoria
// 
// COMPATIBLE CON:
// - Windows (sin necesidad de Visual Studio)
// - Linux
// - macOS

const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const DEFAULT_DB_PATH = path.resolve(__dirname, '..', 'data', 'cotizador.db');
const DB_PATH = process.env.DB_PATH
  ? (path.isAbsolute(process.env.DB_PATH)
    ? process.env.DB_PATH
    : path.resolve(__dirname, '..', process.env.DB_PATH))
  : DEFAULT_DB_PATH;
let db = null;
let SQL = null;
let autosaveInterval = null;

// -----------------------------------------------------------------------------
// GUARDAR BASE DE DATOS
// -----------------------------------------------------------------------------

function guardarDB() {
  if (!db) return;

  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (e) {
    console.error('[DB] Error guardando:', e.message);
  }
}

function getTableColumns(tableName) {
  const stmt = db.prepare(`PRAGMA table_info(${tableName})`);
  const columns = [];

  while (stmt.step()) {
    const row = stmt.getAsObject();
    columns.push(row.name);
  }

  stmt.free();
  return columns;
}

function ensureColumn(tableName, columnName, definition) {
  const columns = getTableColumns(tableName);
  if (!columns.includes(columnName)) {
    db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function getWriteMetadata(sql) {
  if (!db) return { changes: 0, lastInsertRowid: 0 };

  const changes = Number(get('SELECT changes() AS count')?.count || 0);
  const isInsertLike = /^\s*INSERT\b/i.test(sql);
  const lastInsertRowid = isInsertLike
    ? Number(get('SELECT last_insert_rowid() AS id')?.id || 0)
    : 0;

  return { changes, lastInsertRowid };
}

// -----------------------------------------------------------------------------
// EJECUTAR MIGRACIONES
// -----------------------------------------------------------------------------

function runMigrations() {
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS quotations (
        id TEXT PRIMARY KEY,
        user_id TEXT DEFAULT 'anon',
        name TEXT NOT NULL,
        date TEXT NOT NULL,
        channel TEXT,
        origin_country TEXT,
        fob_total REAL DEFAULT 0,
        total_landed REAL DEFAULT 0,
        cpu REAL DEFAULT 0,
        state_json TEXT,
        results_json TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        sku TEXT,
        description TEXT,
        hs TEXT,
        adv REAL DEFAULT 0,
        weight REAL DEFAULT 0,
        reference_price REAL DEFAULT 0,
        last_used TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS changelog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        details_json TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        company TEXT,
        ruc TEXT,
        active INTEGER DEFAULT 1,
        approved INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        last_login TEXT
      )
    `);

    ensureColumn('users', 'active', 'INTEGER DEFAULT 1');
    ensureColumn('users', 'approved', 'INTEGER DEFAULT 1');
    ensureColumn('users', 'updated_at', 'TEXT');

    db.run('UPDATE users SET active = 1 WHERE active IS NULL');
    db.run('UPDATE users SET approved = 1 WHERE approved IS NULL');
    db.run('UPDATE users SET updated_at = COALESCE(updated_at, created_at, datetime(\'now\'))');

    db.run(`
      CREATE TABLE IF NOT EXISTS membresias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id TEXT UNIQUE NOT NULL,
        nivel TEXT DEFAULT 'GRATIS',
        codigo_invitacion TEXT,
        referido_por TEXT,
        fecha_inicio TEXT DEFAULT (datetime('now')),
        fecha_vencimiento TEXT,
        cotizaciones_usadas INTEGER DEFAULT 0,
        consultas_usadas INTEGER DEFAULT 0,
        activo BOOLEAN DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS codigos_invitacion (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        tipo TEXT DEFAULT 'NORMAL',
        usos_maximos INTEGER DEFAULT 1,
        usos_actuales INTEGER DEFAULT 0,
        creado_por TEXT,
        activo BOOLEAN DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS pagos_membresia (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id TEXT NOT NULL,
        monto REAL NOT NULL,
        nivel TEXT NOT NULL,
        periodo TEXT NOT NULL,
        estado TEXT DEFAULT 'pendiente',
        fecha_pago TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    console.log('[DB] Tablas preparadas');
  } catch (e) {
    console.error('[DB] Error en migraciones:', e.message);
  }
}

// -----------------------------------------------------------------------------
// METODOS DE CONSULTA
// -----------------------------------------------------------------------------

function run(sql, params = []) {
  if (!db) return { changes: 0, lastInsertRowid: 0 };
  db.run(sql, params);
  return getWriteMetadata(sql);
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

// -----------------------------------------------------------------------------
// EXPORTAR API
// -----------------------------------------------------------------------------

module.exports = {
  raw() { return db; },

  async init() {
    if (db) return Promise.resolve();

    const dir = path.dirname(DB_PATH);
    fs.mkdirSync(dir, { recursive: true });

    // Inicializar sql.js
    SQL = await initSqlJs();

    // Cargar base de datos existente o crear nueva
    try {
      if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
        console.log('[DB] Base de datos cargada desde', DB_PATH);
      } else {
        db = new SQL.Database();
        console.log('[DB] Nueva base de datos creada');
      }
    } catch (e) {
      console.error('[DB] Error cargando DB:', e.message);
      db = new SQL.Database();
    }

    // Ejecutar migraciones
    runMigrations();

    // Guardar automaticamente cada 5 minutos
    if (!autosaveInterval) {
      autosaveInterval = setInterval(() => {
        guardarDB();
      }, 300000);
      autosaveInterval.unref?.();
    }

    console.log('[DB] sql.js inicializado (sin compilacion nativa obligatoria)');

    // Devolver promesa resuelta para inicializacion asincrona
    return Promise.resolve();
  },

  shutdown() {
    if (autosaveInterval) {
      clearInterval(autosaveInterval);
      autosaveInterval = null;
    }
    guardarDB();
    db = null;
    SQL = null;
  },

  // Compatibilidad con better-sqlite3
  exec(sql) {
    if (!db) return;
    db.run(sql);
  },

  // Funciones para consultar
  get(sql, params = []) {
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
  },

  run(sql, params = []) {
    if (!db) return { changes: 0, lastInsertRowid: 0 };
    db.run(sql, params);
    return getWriteMetadata(sql);
  },

  all(sql, params = []) {
    if (!db) return [];
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  },

  prepare(sql) {
    return {
      run: (...params) => run(sql, params),
      get: (...params) => get(sql, params),
      all: (...params) => all(sql, params)
    };
  },

  // Metodos especificos usados en el codigo
  listQuotations(userId) {
    if (userId) {
      return all('SELECT * FROM quotations WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', [userId]);
    }
    return all('SELECT * FROM quotations ORDER BY created_at DESC LIMIT 100');
  },

  getQuotation(id) {
    const row = get('SELECT * FROM quotations WHERE id = ?', [id]);
    if (!row) return null;
    return row;
  },

  saveQuotation(q) {
    const id = q.id || 'q_' + Date.now();
    run(`
      INSERT OR REPLACE INTO quotations 
      (id, user_id, name, date, channel, origin_country, fob_total, total_landed, cpu, state_json, results_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, q.userId || 'anon', q.name || '', q.date || new Date().toISOString(),
      q.channel || '', q.originCountry || '', q.fobTotal || 0, q.totalLanded || 0,
      q.cpu || 0, JSON.stringify(q.state || {}), JSON.stringify(q.results || null)
    ]);
    return id;
  },

  deleteQuotation(id) {
    run('DELETE FROM quotations WHERE id = ?', [id]);
  },

  listProducts() {
    return all('SELECT * FROM products ORDER BY last_used DESC LIMIT 200');
  },

  saveProduct(p) {
    const id = p.id || 'p_' + Date.now();
    const referencePrice = p.referencePrice ?? p.unit ?? 0;
    run(`
      INSERT OR REPLACE INTO products 
      (id, sku, description, hs, adv, weight, reference_price, last_used)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, p.sku || '', p.description || p.desc || '', p.hs || '',
      p.adv || 0, p.weight || 0, referencePrice,
      new Date().toISOString()
    ]);
    return id;
  },

  deleteProduct(id) {
    run('DELETE FROM products WHERE id = ?', [id]);
  },

  getChangelog() {
    return all('SELECT * FROM changelog ORDER BY created_at DESC LIMIT 50');
  },

  addChangelog(type, message, details = []) {
    run('INSERT INTO changelog (type, message, details_json) VALUES (?, ?, ?)', [
      type, message, JSON.stringify(details)
    ]);
  }
};
