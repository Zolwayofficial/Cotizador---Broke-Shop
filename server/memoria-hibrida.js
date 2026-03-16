// server/memoria-hibrida.js — Memoria HÍBRIDA simplificada (CON AUTO-REPAIR)
// 
// 3 Tipos de Memoria:
// 1. ESTRUCTURAL (SQLite) — Datos de cotizaciones
// 2. SEMÁNTICA (Embeddings ML) — Búsqueda semántica
// 3. CONTEXTO (SQLite) — Preferencias de usuario
//
// CON AUTO-REPAIR: Aprende de fallos y se auto-corrige

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { generarEmbedding } = require("./embeddings");
const autoRepair = require("./auto-repair");

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
    const Database = require("better-sqlite3");
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    useBetterSqlite3 = true;
    console.log("[MEMORIA] ✅ better-sqlite3 cargado");
  } catch (e) {
    try {
      const initSqlJs = require("sql.js");
      const SQL = await initSqlJs();

      if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
        console.log("[MEMORIA] ✅ sql.js cargado (DB existente)");
      } else {
        db = new SQL.Database();
        console.log("[MEMORIA] ✅ sql.js cargado (DB nueva)");
      }
      useBetterSqlite3 = false;
    } catch (e2) {
      console.error("[MEMORIA] ❌ Error:", e2.message);
    }
  }

  // Crear tablas
  db.exec(`
    CREATE TABLE IF NOT EXISTS memoria_cotizaciones (
      id TEXT PRIMARY KEY,
      usuario_id TEXT,
      ip TEXT,
      productos JSON,
      pais_origen TEXT,
      canal TEXT,
      incoterm TEXT,
      total_landed REAL,
      fob_total REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cot_usuario ON memoria_cotizaciones(usuario_id);
    CREATE INDEX IF NOT EXISTS idx_cot_pais ON memoria_cotizaciones(pais_origen);

    CREATE TABLE IF NOT EXISTS memoria_documentos (
      id TEXT PRIMARY KEY,
      producto TEXT,
      descripcion TEXT,
      hs_code TEXT,
      embedding_json JSON,
      metadata JSON,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_doc_producto ON memoria_documentos(producto);

    CREATE TABLE IF NOT EXISTS memoria_contexto (
      usuario_id TEXT PRIMARY KEY,
      tipo_importador TEXT,
      margen_preferido REAL DEFAULT 30,
      canal_preferido TEXT,
      pais_preferido TEXT,
      incoterm_preferido TEXT,
      productos_frecuentes JSON,
      veces_uso INTEGER DEFAULT 1,
      last_used TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memoria_aprendizajes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT,
      dato TEXT,
      valor REAL DEFAULT 0,
      frecuencia INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_aprendizajes_tipo ON memoria_aprendizajes(tipo);

    console.log("[MEMORIA] ✅ Tablas creadas");
  `);

  // Auto-guardado para sql.js
  if (!useBetterSqlite3) {
    setInterval(() => {
      try {
        const data = db.export();
        fs.writeFileSync(DB_PATH, Buffer.from(data));
      } catch (e) {
        console.error("[MEMORIA] Error guardando:", e.message);
      }
    }, 60000);
  }
}

// ═══════════════════════════════════════════════════
// CLASE MemoriaHibrida (wrapper)
// ═══════════════════════════════════════════════════
class MemoriaHibrida {
  constructor() {
    this.vecDisponible = false; // sqlite-vec no disponible con sql.js
  }

  async init() {
    await init();
  }

  guardarCotizacion(data) {
    return autoRepair.ejecutarConAutoReparacion(
      "memoria-hibrida",
      () => {
        const id = `cot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        db.prepare(`
          INSERT INTO memoria_cotizaciones (id, usuario_id, ip, productos, pais_origen, canal, incoterm, total_landed, fob_total)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, data.usuario_id || 'anon', data.ip,
          JSON.stringify(data.productos || []), data.pais_origen,
          data.canal, data.incoterm, data.total_landed, data.fob_total
        );
        return { id, tipo: 'estructural' };
      },
      data
    );
  }

  buscarCotizaciones(filtros) {
    let query = 'SELECT * FROM memoria_cotizaciones WHERE 1=1';
    const params = [];
    if (filtros.usuario_id) { query += ' AND usuario_id = ?'; params.push(filtros.usuario_id); }
    if (filtros.pais_origen) { query += ' AND pais_origen = ?'; params.push(filtros.pais_origen); }
    query += ' ORDER BY created_at DESC LIMIT ?'; params.push(filtros.limite || 50);

    const stmt = db.prepare(query);
    const results = params.length > 0 ? stmt.all(...params) : stmt.all();
    return results.map(r => ({ ...r, productos: JSON.parse(r.productos || '[]') }));
  }

  guardarContexto(data) {
    if (!data.usuario_id) return { error: 'usuario_id requerido' };
    const existing = db.prepare('SELECT * FROM memoria_contexto WHERE usuario_id = ?').get(data.usuario_id);
    if (existing) {
      db.prepare(`UPDATE memoria_contexto SET tipo_importador = COALESCE(?, tipo_importador), margen_preferido = COALESCE(?, margen_preferido), veces_uso = veces_uso + 1, last_used = datetime('now') WHERE usuario_id = ?`)
        .run(data.tipo_importador, data.margen_preferido, data.usuario_id);
    } else {
      db.prepare(`INSERT INTO memoria_contexto (usuario_id, tipo_importador, margen_preferido) VALUES (?, ?, ?)`)
        .run(data.usuario_id, data.tipo_importador, data.margen_preferido);
    }
    return { usuario_id: data.usuario_id, tipo: 'contexto' };
  }

  obtenerContexto(usuario_id) {
    return db.prepare('SELECT * FROM memoria_contexto WHERE usuario_id = ?').get(usuario_id);
  }

  obtenerEstadisticas() {
    return {
      total_cotizaciones: db.prepare('SELECT COUNT(*) as count FROM memoria_cotizaciones').get().count,
      total_documentos: db.prepare('SELECT COUNT(*) as count FROM memoria_documentos').get().count,
      total_usuarios: db.prepare('SELECT COUNT(DISTINCT usuario_id) as count FROM memoria_contexto').get().count,
      paises_mas_comunes: db.prepare("SELECT dato, frecuencia FROM memoria_aprendizajes WHERE tipo = 'pais_origen' ORDER BY frecuencia DESC LIMIT 5").all(),
      productos_mas_cotizados: db.prepare("SELECT dato, frecuencia FROM memoria_aprendizajes WHERE tipo = 'producto' ORDER BY frecuencia DESC LIMIT 10").all()
    };
  }
}

module.exports = MemoriaHibrida;
