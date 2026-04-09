const fs = require('fs');
const os = require('os');
const path = require('path');

describe('db module', () => {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const originalEnvDbPath = process.env.DB_PATH;
  const originalCwd = process.cwd();
  const cleanupPaths = [];

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalEnvDbPath === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = originalEnvDbPath;
    }
    cleanupPaths.splice(0).forEach((target) => {
      fs.rmSync(target, { recursive: true, force: true });
    });
    jest.resetModules();
  });

  test('resuelve DB_PATH relativo desde la raiz del proyecto y no desde el cwd', async () => {
    const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cotizador-cwd-'));
    const relativeDbPath = path.join('tmp', `db-relative-${Date.now()}.sqlite`);
    const expectedPath = path.resolve(projectRoot, relativeDbPath);
    const wrongPath = path.resolve(tempCwd, relativeDbPath);
    cleanupPaths.push(tempCwd);
    cleanupPaths.push(expectedPath);

    fs.rmSync(expectedPath, { force: true });
    fs.mkdirSync(path.dirname(expectedPath), { recursive: true });

    process.chdir(tempCwd);
    process.env.DB_PATH = relativeDbPath;

    const db = require('../../server/db');
    await db.init();
    db.shutdown();

    expect(fs.existsSync(expectedPath)).toBe(true);
    expect(fs.existsSync(wrongPath)).toBe(false);
  });

  test('saveProduct preserva referencePrice cero aunque unit tenga valor', async () => {
    const tempDbPath = path.join(projectRoot, 'tmp', `db-product-${Date.now()}.sqlite`);
    cleanupPaths.push(tempDbPath);
    fs.mkdirSync(path.dirname(tempDbPath), { recursive: true });
    fs.rmSync(tempDbPath, { force: true });

    process.env.DB_PATH = tempDbPath;
    const db = require('../../server/db');
    await db.init();

    const id = db.saveProduct({
      id: 'p_zero_ref',
      desc: 'Producto demo',
      unit: 123,
      referencePrice: 0,
    });

    const saved = db.listProducts().find((product) => product.id === id);

    expect(saved).toBeDefined();
    expect(Number(saved.reference_price)).toBe(0);

    db.shutdown();
  });

  test('run y prepare.run exponen metadata real de escritura', async () => {
    const tempDbPath = path.join(projectRoot, 'tmp', `db-write-metadata-${Date.now()}.sqlite`);
    cleanupPaths.push(tempDbPath);
    fs.mkdirSync(path.dirname(tempDbPath), { recursive: true });
    fs.rmSync(tempDbPath, { force: true });

    process.env.DB_PATH = tempDbPath;
    const db = require('../../server/db');
    await db.init();

    db.run('CREATE TABLE IF NOT EXISTS audit_write_test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
    const insertResult = db.run('INSERT INTO audit_write_test (name) VALUES (?)', ['uno']);
    const updateResult = db.prepare('UPDATE audit_write_test SET name = ? WHERE id = ?').run(
      'dos',
      insertResult.lastInsertRowid,
    );

    expect(insertResult.changes).toBe(1);
    expect(insertResult.lastInsertRowid).toBeGreaterThan(0);
    expect(updateResult.changes).toBe(1);
    expect(updateResult.lastInsertRowid).toBe(0);

    db.shutdown();
  });

test('el codigo fuente de db describe sql.js sin sobreafirmar "100% JavaScript"', () => {
    const content = fs.readFileSync(path.join(projectRoot, 'server', 'db.js'), 'utf8');

    expect(content).toContain('sin compilacion nativa obligatoria');
    expect(content).toContain('function getWriteMetadata(sql)');
    expect(content).toContain('[DB] sql.js inicializado');
    expect(content).toContain('[DB] Tablas preparadas');
    expect(content).toContain('[DB] Base de datos cargada desde');
    expect(content).toContain('[DB] Nueva base de datos creada');
    expect(content).not.toContain('100% JavaScript');
    expect(content).not.toContain('[DB] OK sql.js inicializado');
    expect(content).not.toContain('[DB] OK Tablas creadas');
    expect(content).not.toContain('[DB] OK Base de datos cargada desde');
    expect(content).not.toContain('[DB] OK Nueva base de datos creada');
    expect(content).not.toContain('return { changes: 0 };');
    expect(content).not.toMatch(/[^\x00-\x7F]/);
  });
});
