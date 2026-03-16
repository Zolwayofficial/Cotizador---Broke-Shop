const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = process.env.DB_PATH || "./data/cotizador.db";
let db;

module.exports = {
  raw() { return db; },

  init() {
    const dir = path.dirname(DB_PATH);
    require("fs").mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    db.exec(`
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
      );

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
      );

      CREATE TABLE IF NOT EXISTS changelog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        details_json TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_quotations_date ON quotations(date DESC);
      CREATE INDEX IF NOT EXISTS idx_quotations_user ON quotations(user_id);
      CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
      CREATE INDEX IF NOT EXISTS idx_changelog_date ON changelog(created_at DESC);
    `);

    // Add user_id column if missing (migration for existing dbs)
    try { db.exec("ALTER TABLE quotations ADD COLUMN user_id TEXT DEFAULT 'anon'"); } catch {}

    console.log(`[DB] Initialized at ${DB_PATH}`);
  },

  // Quotations — filtered by user
  listQuotations(userId) {
    if (userId) return db.prepare("SELECT id, name, date, channel, origin_country, fob_total, total_landed, cpu FROM quotations WHERE user_id=? ORDER BY date DESC LIMIT 100").all(userId);
    return db.prepare("SELECT id, name, date, channel, origin_country, fob_total, total_landed, cpu FROM quotations ORDER BY date DESC LIMIT 100").all();
  },

  getQuotation(id) {
    const row = db.prepare("SELECT * FROM quotations WHERE id = ?").get(id);
    if (!row) return null;
    return { ...row, state: JSON.parse(row.state_json || "{}"), results: JSON.parse(row.results_json || "null") };
  },

  saveQuotation(q) {
    const id = q.id || "q_" + Date.now();
    db.prepare(`INSERT OR REPLACE INTO quotations (id, user_id, name, date, channel, origin_country, fob_total, total_landed, cpu, state_json, results_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, q.userId || "anon", q.name || "", q.date || new Date().toISOString(), q.channel || "", q.originCountry || "",
      q.fobTotal || 0, q.totalLanded || 0, q.cpu || 0,
      JSON.stringify(q.state || {}), JSON.stringify(q.results || null)
    );
    return id;
  },

  deleteQuotation(id) {
    db.prepare("DELETE FROM quotations WHERE id = ?").run(id);
  },

  // Products
  listProducts() {
    return db.prepare("SELECT * FROM products ORDER BY last_used DESC LIMIT 200").all();
  },

  saveProduct(p) {
    const id = p.id || "p_" + Date.now();
    db.prepare(`INSERT OR REPLACE INTO products (id, sku, description, hs, adv, weight, reference_price, last_used)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, p.sku || "", p.description || p.desc || "", p.hs || "", p.adv || 0, p.weight || 0, p.referencePrice || p.unit || 0,
      new Date().toISOString()
    );
    return id;
  },

  deleteProduct(id) {
    db.prepare("DELETE FROM products WHERE id = ?").run(id);
  },

  // Changelog
  getChangelog() {
    return db.prepare("SELECT * FROM changelog ORDER BY created_at DESC LIMIT 50").all()
      .map(r => ({ ...r, details: JSON.parse(r.details_json || "[]") }));
  },

  addChangelog(type, message, details = []) {
    db.prepare("INSERT INTO changelog (type, message, details_json) VALUES (?, ?, ?)").run(
      type, message, JSON.stringify(details)
    );
  },
};
