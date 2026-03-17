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
});
