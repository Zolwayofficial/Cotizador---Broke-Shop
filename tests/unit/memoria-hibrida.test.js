const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');

describe('MemoriaHibrida', () => {
  let tempDir;
  let previousDbPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cotizador-memoria-'));
    previousDbPath = process.env.DB_PATH;
    process.env.DB_PATH = path.join(tempDir, 'cotizador.db');
    jest.resetModules();
  });

  afterEach(() => {
    try {
      const db = require('../../server/db');
      db.shutdown?.();
    } catch (_error) {
      // ignore cleanup errors
    }

    if (previousDbPath === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = previousDbPath;
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
    jest.resetModules();
  });

  it('guarda cotizaciones, contexto y exporta datos del usuario', async () => {
    const db = require('../../server/db');
    await db.init();
    const MemoriaHibrida = require('../../server/memoria-hibrida');
    const memoria = new MemoriaHibrida();
    await memoria.init();

    const resultado = await memoria.guardarCotizacion({
      usuario_id: 'user-1',
      productos: [{ producto: '150 vinos espanoles', cantidad: 150 }],
      pais_origen: 'ES',
      canal: 'AEREO',
      incoterm: 'FOB',
      total_landed: 2500,
      fob_total: 1900,
    });

    expect(resultado.id).toMatch(/^cot_/);

    const cotizaciones = memoria.buscarCotizaciones({ usuario_id: 'user-1' });
    expect(cotizaciones).toHaveLength(1);
    expect(cotizaciones[0].productos[0].producto).toMatch(/vinos/i);

    const contexto = memoria.guardarContexto({
      usuario_id: 'user-1',
      tipo_importador: 'general',
      margen_preferido: 28,
      canal_preferido: 'AEREO',
      pais_preferido: 'ES',
    });

    expect(contexto.usuario_id).toBe('user-1');
    expect(memoria.obtenerContexto('user-1').margen_preferido).toBe(28);

    const sugerencias = memoria.obtenerSugerencias('user-1');
    expect(sugerencias.some((item) => item.tipo === 'pais')).toBe(true);

    const exportado = memoria.exportarDatos('user-1');
    expect(exportado.cotizaciones).toHaveLength(1);
    expect(exportado.contexto.usuario_id).toBe('user-1');
  });

  it('normaliza decimales con coma, limites y dias fuera de rango', async () => {
    const db = require('../../server/db');
    await db.init();
    const MemoriaHibrida = require('../../server/memoria-hibrida');
    const memoria = new MemoriaHibrida();
    await memoria.init();

    await memoria.guardarCotizacion({
      usuario_id: ' user-2 ',
      productos: [{ producto: 'laptop gamer' }],
      total_landed: '2500,75',
      fob_total: '1900,50',
    });

    memoria.guardarContexto({
      usuario_id: 'user-2',
      margen_preferido: '28,5',
      productos_frecuentes: ['laptop gamer'],
    });

    const cotizaciones = memoria.buscarCotizaciones({ usuario_id: 'user-2', limite: -5 });
    expect(cotizaciones).toHaveLength(1);
    expect(cotizaciones[0].total_landed).toBeCloseTo(2500.75, 2);
    expect(cotizaciones[0].fob_total).toBeCloseTo(1900.5, 2);

    const contexto = memoria.obtenerContexto(' user-2 ');
    expect(contexto.margen_preferido).toBe(28.5);

    const exportado = memoria.exportarDatos(' user-2 ');
    expect(exportado.usuario_id).toBe('user-2');
    expect(exportado.cotizaciones).toHaveLength(1);

    const limpieza = memoria.limpiarMemoriaAntigua(-10);
    expect(limpieza.dias).toBe(90);
  });

  it('normaliza topK fuera de rango al buscar documentos', async () => {
    const db = require('../../server/db');
    await db.init();
    const MemoriaHibrida = require('../../server/memoria-hibrida');
    const memoria = new MemoriaHibrida();
    await memoria.init();

    db.run(
      `INSERT INTO memoria_documentos (id, producto, descripcion, hs_code, metadata) VALUES (?, ?, ?, ?, ?)`,
      ['doc-1', 'telefono', 'telefono movil', '8517130000', JSON.stringify({ fuente: 'test' })]
    );

    const documentos = memoria.buscarDocumentos('telefono', -3);
    expect(documentos).toHaveLength(1);
    expect(documentos[0].metadata.fuente).toBe('test');
  });

  it('falla limpio si se intenta inicializar antes que la base de datos', async () => {
    const MemoriaHibrida = require('../../server/memoria-hibrida');
    const memoria = new MemoriaHibrida();

    await expect(memoria.init()).rejects.toThrow(/base de datos no inicializada/i);

    const db = require('../../server/db');
    await db.init();
    await expect(memoria.init()).resolves.toBeUndefined();
  });

  it('normaliza miles con coma o punto, permite limpiar productos frecuentes y filtra usuario con espacios', async () => {
    const db = require('../../server/db');
    await db.init();
    const MemoriaHibrida = require('../../server/memoria-hibrida');
    const memoria = new MemoriaHibrida();
    await memoria.init();

    await memoria.guardarCotizacion({
      usuario_id: ' user-3 ',
      productos: [{ producto: 'tablet' }],
      total_landed: '1.234,50',
      fob_total: '1,200.75',
      pais_origen: ' CN ',
      canal: ' MARITIMO ',
    });

    memoria.guardarContexto({
      usuario_id: 'user-3',
      productos_frecuentes: ['tablet', 'router'],
    });

    memoria.guardarContexto({
      usuario_id: 'user-3',
      productos_frecuentes: [],
    });

    const cotizaciones = memoria.buscarCotizaciones({ usuario_id: ' user-3 ', pais_origen: 'CN', canal: 'MARITIMO' });
    expect(cotizaciones).toHaveLength(1);
    expect(cotizaciones[0].total_landed).toBeCloseTo(1234.5, 2);
    expect(cotizaciones[0].fob_total).toBeCloseTo(1200.75, 2);

    const contexto = memoria.obtenerContexto('user-3');
    expect(contexto.productos_frecuentes).toEqual([]);
  });

  it('normaliza productos frecuentes aunque lleguen como string o con entradas vacias', async () => {
    const db = require('../../server/db');
    await db.init();
    const MemoriaHibrida = require('../../server/memoria-hibrida');
    const memoria = new MemoriaHibrida();
    await memoria.init();

    memoria.guardarContexto({
      usuario_id: 'user-4',
      productos_frecuentes: ' router gamer ',
    });

    expect(memoria.obtenerContexto('user-4').productos_frecuentes).toEqual(['router gamer']);

    memoria.guardarContexto({
      usuario_id: 'user-4',
      productos_frecuentes: ['  router gamer  ', '', null, 'switch'],
    });

    expect(memoria.obtenerContexto('user-4').productos_frecuentes).toEqual(['router gamer', 'switch']);
  });

it('mantiene el codigo fuente con fraseo honesto de inicializacion', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'memoria-hibrida.js'), 'utf8');

    expect(content).toContain('[MEMORIA] Tablas preparadas');
    expect(content).not.toContain('[MEMORIA] Tablas listas');
  });
});
