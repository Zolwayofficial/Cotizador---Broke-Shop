// server/memoria-hibrida.js - Memoria hibrida para cotizaciones y contexto

const db = require('./db');
const autoRepair = require('./auto-repair');

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }

  const singleValue = normalizeText(value);
  return singleValue ? [singleValue] : [];
}

function toNumber(value, fallback = 0) {
  if (typeof value === 'string') {
    const compact = value.trim().replace(/\s+/g, '');
    const lastComma = compact.lastIndexOf(',');
    const lastDot = compact.lastIndexOf('.');
    let normalized = compact;

    if (lastComma >= 0 && lastDot >= 0) {
      normalized = lastComma > lastDot
        ? compact.replace(/\./g, '').replace(',', '.')
        : compact.replace(/,/g, '');
    } else if (lastComma >= 0) {
      normalized = /^\d{1,3}(,\d{3})+$/.test(compact)
        ? compact.replace(/,/g, '')
        : compact.replace(',', '.');
    } else if (lastDot >= 0) {
      normalized = /^\d{1,3}(\.\d{3})+$/.test(compact)
        ? compact.replace(/\./g, '')
        : compact;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function createCotizacionId() {
  return `cot_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureDbInitialized() {
  if (typeof db.raw === 'function' && db.raw()) {
    return true;
  }

  throw new Error('Base de datos no inicializada. Ejecuta db.init() antes de memoria-hibrida.init().');
}

class MemoriaHibrida {
  constructor() {
    this.vecDisponible = false;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    ensureDbInitialized();

    db.exec(`
      CREATE TABLE IF NOT EXISTS memoria_cotizaciones (
        id TEXT PRIMARY KEY,
        usuario_id TEXT,
        ip TEXT,
        productos TEXT,
        pais_origen TEXT,
        canal TEXT,
        incoterm TEXT,
        total_landed REAL,
        fob_total REAL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    db.exec('CREATE INDEX IF NOT EXISTS idx_memoria_cot_usuario ON memoria_cotizaciones(usuario_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_memoria_cot_pais ON memoria_cotizaciones(pais_origen)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_memoria_cot_canal ON memoria_cotizaciones(canal)');

    db.exec(`
      CREATE TABLE IF NOT EXISTS memoria_documentos (
        id TEXT PRIMARY KEY,
        producto TEXT,
        descripcion TEXT,
        hs_code TEXT,
        embedding_json TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    db.exec('CREATE INDEX IF NOT EXISTS idx_memoria_doc_producto ON memoria_documentos(producto)');

    db.exec(`
      CREATE TABLE IF NOT EXISTS memoria_contexto (
        usuario_id TEXT PRIMARY KEY,
        tipo_importador TEXT,
        margen_preferido REAL DEFAULT 30,
        canal_preferido TEXT,
        pais_preferido TEXT,
        incoterm_preferido TEXT,
        productos_frecuentes TEXT,
        veces_uso INTEGER DEFAULT 1,
        last_used TEXT DEFAULT (datetime('now'))
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS memoria_aprendizajes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT,
        dato TEXT,
        valor REAL DEFAULT 0,
        frecuencia INTEGER DEFAULT 1,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    db.exec('CREATE INDEX IF NOT EXISTS idx_memoria_aprendizajes_tipo ON memoria_aprendizajes(tipo)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_memoria_aprendizajes_tipo_dato ON memoria_aprendizajes(tipo, dato)');

    this.initialized = true;
    console.log('[MEMORIA] Tablas preparadas');
  }

  registrarAprendizaje(tipo, dato, incremento = 1) {
    const normalizedTipo = normalizeText(tipo);
    const normalizedDato = normalizeText(dato);

    if (!normalizedTipo || !normalizedDato) return;

    const existing = db.get(
      'SELECT id, frecuencia, valor FROM memoria_aprendizajes WHERE tipo = ? AND dato = ?',
      [normalizedTipo, normalizedDato]
    );

    if (existing) {
      db.run(
        'UPDATE memoria_aprendizajes SET frecuencia = ?, valor = ?, updated_at = datetime(\'now\') WHERE id = ?',
        [Number(existing.frecuencia || 0) + incremento, Number(existing.valor || 0) + incremento, existing.id]
      );
      return;
    }

    db.run(
      'INSERT INTO memoria_aprendizajes (tipo, dato, valor, frecuencia) VALUES (?, ?, ?, ?)',
      [normalizedTipo, normalizedDato, incremento, incremento]
    );
  }

  guardarCotizacion(data) {
    return autoRepair.ejecutarConAutoReparacion(
      'memoria-hibrida',
      () => {
        const id = createCotizacionId();
        const productos = Array.isArray(data.productos) ? data.productos : [];

        db.run(
          `
            INSERT INTO memoria_cotizaciones
            (id, usuario_id, ip, productos, pais_origen, canal, incoterm, total_landed, fob_total)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            id,
            normalizeText(data.usuario_id) || 'anon',
            data.ip || '',
            JSON.stringify(productos),
            normalizeText(data.pais_origen),
            normalizeText(data.canal),
            normalizeText(data.incoterm),
            toNumber(data.total_landed || 0),
            toNumber(data.fob_total || 0),
          ]
        );

        if (data.pais_origen) this.registrarAprendizaje('pais_origen', data.pais_origen);
        if (data.canal) this.registrarAprendizaje('canal', data.canal);
        if (data.incoterm) this.registrarAprendizaje('incoterm', data.incoterm);

        for (const producto of productos) {
          const nombre = normalizeText(producto?.producto || producto?.desc || producto?.descripcion || producto);
          if (nombre) this.registrarAprendizaje('producto', nombre);
        }

        return { id, tipo: 'estructural' };
      },
      data
    );
  }

  buscarCotizaciones(filtros = {}) {
    let query = 'SELECT * FROM memoria_cotizaciones WHERE 1=1';
    const params = [];
    const usuarioId = normalizeText(filtros.usuario_id);
    const paisOrigen = normalizeText(filtros.pais_origen);
    const canal = normalizeText(filtros.canal);

    if (usuarioId) {
      query += ' AND usuario_id = ?';
      params.push(usuarioId);
    }
    if (paisOrigen) {
      query += ' AND pais_origen = ?';
      params.push(paisOrigen);
    }
    if (canal) {
      query += ' AND canal = ?';
      params.push(canal);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(normalizePositiveInteger(filtros.limite, 50));

    return db.all(query, params).map((row) => ({
      ...row,
      productos: parseJson(row.productos, []),
    }));
  }

  buscarDocumentos(query, topK = 5) {
    const normalizedQuery = normalizeText(query).toLowerCase();
    if (!normalizedQuery) return [];

    const like = `%${normalizedQuery}%`;
    const rows = db.all(
      `
        SELECT *
        FROM memoria_documentos
        WHERE lower(COALESCE(producto, '')) LIKE ?
           OR lower(COALESCE(descripcion, '')) LIKE ?
           OR lower(COALESCE(hs_code, '')) LIKE ?
        ORDER BY created_at DESC
        LIMIT ?
      `,
      [like, like, like, normalizePositiveInteger(topK, 5)]
    );

    return rows.map((row) => ({
      ...row,
      metadata: parseJson(row.metadata, {}),
      embedding_json: parseJson(row.embedding_json, []),
    }));
  }

  guardarContexto(data) {
    const usuarioId = normalizeText(data.usuario_id);
    if (!usuarioId) {
      return { error: 'usuario_id requerido' };
    }

    const existing = db.get('SELECT * FROM memoria_contexto WHERE usuario_id = ?', [usuarioId]);
    const productosFrecuentes = JSON.stringify(
      data.productos_frecuentes !== undefined
        ? normalizeStringArray(data.productos_frecuentes)
        : normalizeStringArray(parseJson(existing?.productos_frecuentes, []))
    );

    if (existing) {
      db.run(
        `
          UPDATE memoria_contexto
          SET tipo_importador = COALESCE(?, tipo_importador),
              margen_preferido = COALESCE(?, margen_preferido),
              canal_preferido = COALESCE(?, canal_preferido),
              pais_preferido = COALESCE(?, pais_preferido),
              incoterm_preferido = COALESCE(?, incoterm_preferido),
              productos_frecuentes = ?,
              veces_uso = veces_uso + 1,
              last_used = datetime('now')
          WHERE usuario_id = ?
        `,
        [
          data.tipo_importador ?? null,
          data.margen_preferido !== undefined ? toNumber(data.margen_preferido, 30) : null,
          data.canal_preferido ?? null,
          data.pais_preferido ?? null,
          data.incoterm_preferido ?? null,
          productosFrecuentes,
          usuarioId,
        ]
      );
    } else {
      db.run(
        `
          INSERT INTO memoria_contexto
          (usuario_id, tipo_importador, margen_preferido, canal_preferido, pais_preferido, incoterm_preferido, productos_frecuentes)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          usuarioId,
          data.tipo_importador || '',
          data.margen_preferido !== undefined ? toNumber(data.margen_preferido, 30) : 30,
          data.canal_preferido || '',
          data.pais_preferido || '',
          data.incoterm_preferido || '',
          productosFrecuentes,
        ]
      );
    }

    return { usuario_id: usuarioId, tipo: 'contexto' };
  }

  obtenerContexto(usuarioId) {
    const normalizedUserId = normalizeText(usuarioId);
    if (!normalizedUserId) return null;
    const contexto = db.get('SELECT * FROM memoria_contexto WHERE usuario_id = ?', [normalizedUserId]);
    if (!contexto) return null;

    return {
      ...contexto,
      productos_frecuentes: parseJson(contexto.productos_frecuentes, []),
    };
  }

  obtenerSugerencias(usuarioId) {
    const sugerencias = [];
    const contexto = this.obtenerContexto(usuarioId);

    if (contexto?.pais_preferido) {
      sugerencias.push({
        tipo: 'pais',
        valor: contexto.pais_preferido,
        razon: 'pais_preferido',
      });
    }

    if (contexto?.canal_preferido) {
      sugerencias.push({
        tipo: 'canal',
        valor: contexto.canal_preferido,
        razon: 'canal_preferido',
      });
    }

    const productos = db.all(
      `
        SELECT dato, frecuencia
        FROM memoria_aprendizajes
        WHERE tipo = 'producto'
        ORDER BY frecuencia DESC, updated_at DESC
        LIMIT 5
      `
    );

    for (const producto of productos) {
      sugerencias.push({
        tipo: 'producto',
        valor: producto.dato,
        frecuencia: Number(producto.frecuencia || 0),
      });
    }

    return sugerencias;
  }

  obtenerEstadisticas() {
    return {
      total_cotizaciones: Number(db.get('SELECT COUNT(*) as count FROM memoria_cotizaciones')?.count || 0),
      total_documentos: Number(db.get('SELECT COUNT(*) as count FROM memoria_documentos')?.count || 0),
      total_usuarios: Number(db.get('SELECT COUNT(*) as count FROM memoria_contexto')?.count || 0),
      paises_mas_comunes: db.all(
        `
          SELECT dato, frecuencia
          FROM memoria_aprendizajes
          WHERE tipo = 'pais_origen'
          ORDER BY frecuencia DESC
          LIMIT 5
        `
      ),
      productos_mas_cotizados: db.all(
        `
          SELECT dato, frecuencia
          FROM memoria_aprendizajes
          WHERE tipo = 'producto'
          ORDER BY frecuencia DESC
          LIMIT 10
        `
      ),
    };
  }

  limpiarMemoriaAntigua(dias = 90) {
    const safeDays = normalizePositiveInteger(dias, 90);
    const threshold = `-${safeDays} days`;
    const beforeCotizaciones = Number(db.get('SELECT COUNT(*) as count FROM memoria_cotizaciones')?.count || 0);
    const beforeDocumentos = Number(db.get('SELECT COUNT(*) as count FROM memoria_documentos')?.count || 0);

    db.run(
      'DELETE FROM memoria_cotizaciones WHERE created_at < datetime(\'now\', ?)',
      [threshold]
    );
    db.run(
      'DELETE FROM memoria_documentos WHERE created_at < datetime(\'now\', ?)',
      [threshold]
    );

    const afterCotizaciones = Number(db.get('SELECT COUNT(*) as count FROM memoria_cotizaciones')?.count || 0);
    const afterDocumentos = Number(db.get('SELECT COUNT(*) as count FROM memoria_documentos')?.count || 0);

    return {
      cotizaciones_eliminadas: beforeCotizaciones - afterCotizaciones,
      documentos_eliminados: beforeDocumentos - afterDocumentos,
      dias: safeDays,
    };
  }

  exportarDatos(usuarioId) {
    const normalizedUserId = normalizeText(usuarioId);
    return {
      usuario_id: normalizedUserId,
      contexto: this.obtenerContexto(normalizedUserId),
      sugerencias: this.obtenerSugerencias(normalizedUserId),
      cotizaciones: this.buscarCotizaciones({ usuario_id: normalizedUserId, limite: 500 }),
      exportado_en: new Date().toISOString(),
    };
  }
}

MemoriaHibrida._private = {
  ensureDbInitialized,
  normalizeStringArray,
  toNumber,
  normalizePositiveInteger,
};

module.exports = MemoriaHibrida;
