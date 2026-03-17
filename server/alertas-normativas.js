// server/alertas-normativas.js - Alertas normativas y suscripciones

const db = require('./db');

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

let initialized = false;

async function init() {
  if (initialized) return;

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
      metadata TEXT,
      leido INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS cambios_normativos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entidad TEXT NOT NULL,
      tipo_cambio TEXT NOT NULL,
      valor_anterior TEXT,
      valor_nuevo TEXT,
      detectado_en TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS suscripciones_alertas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      tipos TEXT,
      telegram_chat_id TEXT,
      activo INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_alertas_created_at ON alertas_normativas(created_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_alertas_leido ON alertas_normativas(leido)');

  initialized = true;
  console.log('[ALERTAS] Tablas listas');
}

function hydrateAlerta(row) {
  if (!row) return row;
  return {
    ...row,
    leido: Number(row.leido || 0) === 1,
    metadata: parseJson(row.metadata, {}),
  };
}

function crearAlerta(tipo, entidad, titulo, descripcion, options = {}) {
  db.run(
    `
      INSERT INTO alertas_normativas
      (tipo, entidad, titulo, descripcion, nivel, partida_afectada, pais_afectado, metadata, leido)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `,
    [
      tipo,
      entidad,
      titulo,
      descripcion || '',
      options.nivel || 'info',
      options.partida_afectada || null,
      options.pais_afectado || null,
      JSON.stringify(options.metadata || {}),
    ]
  );

  const inserted = db.get('SELECT last_insert_rowid() AS id');
  return Number(inserted?.id || 0);
}

function agregarAlerta(tipo, mensaje, datos = {}) {
  return crearAlerta(tipo, datos.entidad || 'Sistema', mensaje, datos.descripcion || mensaje, datos);
}

function buildAlertFilters(filtros = {}) {
  const conditions = [];
  const params = [];

  if (filtros.tipo) {
    conditions.push('tipo = ?');
    params.push(filtros.tipo);
  }
  if (filtros.entidad) {
    conditions.push('entidad = ?');
    params.push(filtros.entidad);
  }
  if (filtros.nivel) {
    conditions.push('nivel = ?');
    params.push(filtros.nivel);
  }
  if (filtros.leido !== undefined) {
    conditions.push('leido = ?');
    params.push(filtros.leido ? 1 : 0);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

function obtenerAlertas(page, limit, filtros) {
  if (typeof page === 'object') {
    filtros = page;
    page = 1;
    limit = 50;
  }

  const safePage = Math.max(1, Number(page || 1));
  const safeLimit = Math.max(1, Math.min(100, Number(limit || 20)));
  const offset = (safePage - 1) * safeLimit;
  const { where, params } = buildAlertFilters(filtros);

  const total = Number(
    db.get(`SELECT COUNT(*) AS count FROM alertas_normativas ${where}`, params)?.count || 0
  );

  const rows = db.all(
    `
      SELECT *
      FROM alertas_normativas
      ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `,
    [...params, safeLimit, offset]
  );

  return {
    alertas: rows.map(hydrateAlerta),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}

function obtenerAlertasNoLeidas() {
  return db
    .all('SELECT * FROM alertas_normativas WHERE leido = 0 ORDER BY created_at DESC, id DESC')
    .map(hydrateAlerta);
}

function marcarAlertaLeida(id) {
  db.run('UPDATE alertas_normativas SET leido = 1 WHERE id = ?', [id]);
  return true;
}

function marcarTodasLeidas() {
  const before = Number(db.get('SELECT COUNT(*) AS count FROM alertas_normativas WHERE leido = 0')?.count || 0);
  db.run('UPDATE alertas_normativas SET leido = 1 WHERE leido = 0');
  return before;
}

function limpiarAlertasLeidas() {
  const eliminadas = Number(db.get('SELECT COUNT(*) AS count FROM alertas_normativas WHERE leido = 1')?.count || 0);
  db.run('DELETE FROM alertas_normativas WHERE leido = 1');
  return { eliminadas };
}

function limpiarAlertasAntiguas(dias = 90) {
  const threshold = `-${Number(dias || 90)} days`;
  const eliminadas = Number(
    db.get('SELECT COUNT(*) AS count FROM alertas_normativas WHERE created_at < datetime(\'now\', ?)', [threshold])?.count || 0
  );
  db.run('DELETE FROM alertas_normativas WHERE created_at < datetime(\'now\', ?)', [threshold]);
  return eliminadas;
}

function suscribirAlertas(email, tipos = [], telegramChatId = null) {
  db.run(
    'INSERT INTO suscripciones_alertas (email, tipos, telegram_chat_id, activo) VALUES (?, ?, ?, 1)',
    [String(email || '').trim().toLowerCase(), JSON.stringify(tipos || []), telegramChatId || null]
  );

  const inserted = db.get('SELECT last_insert_rowid() AS id');
  return Number(inserted?.id || 0);
}

async function detectarCambiosAutomaticos() {
  return {
    ok: true,
    revisado_en: new Date().toISOString(),
    nota: 'Monitor automatico ejecutado sin fuente externa acoplada en esta fase.',
  };
}

function registrarCambio(entidad, tipoCambio, valorAnterior, valorNuevo) {
  db.run(
    `
      INSERT INTO cambios_normativos (entidad, tipo_cambio, valor_anterior, valor_nuevo)
      VALUES (?, ?, ?, ?)
    `,
    [entidad, tipoCambio, valorAnterior ?? null, valorNuevo ?? null]
  );
}

function obtenerEstadisticas() {
  const total = Number(db.get('SELECT COUNT(*) AS count FROM alertas_normativas')?.count || 0);
  const noLeidas = Number(db.get('SELECT COUNT(*) AS count FROM alertas_normativas WHERE leido = 0')?.count || 0);
  const criticas = Number(db.get('SELECT COUNT(*) AS count FROM alertas_normativas WHERE nivel = \'critico\'')?.count || 0);

  return {
    total,
    noLeidas,
    criticas,
    alertas: obtenerAlertas(1, 10, {}).alertas,
  };
}

module.exports = {
  init,
  agregarAlerta,
  crearAlerta,
  obtenerAlertas,
  obtenerAlertasNoLeidas,
  marcarAlertaLeida,
  marcarTodasLeidas,
  limpiarAlertasLeidas,
  limpiarAlertasAntiguas,
  suscribirAlertas,
  detectarCambiosAutomaticos,
  registrarCambio,
  obtenerEstadisticas,
};
