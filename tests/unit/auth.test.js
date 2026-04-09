const fs = require('fs');
const os = require('os');
const path = require('path');
const AUTH_SOURCE_PATH = path.resolve(__dirname, '../../server/auth.js');

describe('auth module', () => {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const originalEnv = {
    JWT_SECRET: process.env.JWT_SECRET,
    DATA_DIR: process.env.DATA_DIR,
    DB_PATH: process.env.DB_PATH,
    NODE_ENV: process.env.NODE_ENV,
    COMMUNITY_ACCESS_CODE: process.env.COMMUNITY_ACCESS_CODE,
  };
  const originalCwd = process.cwd();
  const cleanupPaths = [];

  afterEach(() => {
    process.chdir(originalCwd);

    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });

    cleanupPaths.splice(0).forEach((target) => {
      fs.rmSync(target, { recursive: true, force: true });
    });

    jest.resetModules();
  });

  test('resuelve DATA_DIR relativo desde la raiz del proyecto', () => {
    const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cotizador-auth-cwd-'));
    const relativeDataDir = path.join('tmp', `auth-data-${Date.now()}`);
    const expectedSecretFile = path.resolve(projectRoot, relativeDataDir, '.jwt_secret');
    const wrongSecretFile = path.resolve(tempCwd, relativeDataDir, '.jwt_secret');

    cleanupPaths.push(tempCwd);
    cleanupPaths.push(path.resolve(projectRoot, relativeDataDir));

    delete process.env.JWT_SECRET;
    delete process.env.DB_PATH;
    process.env.DATA_DIR = relativeDataDir;
    process.chdir(tempCwd);

    require('../../server/auth');

    expect(fs.existsSync(expectedSecretFile)).toBe(true);
    expect(fs.existsSync(wrongSecretFile)).toBe(false);
  });

  test('interpreta active y approved stringificados al crear o actualizar usuarios', async () => {
    const tempDbPath = path.join(projectRoot, 'tmp', `auth-db-${Date.now()}.sqlite`);
    cleanupPaths.push(tempDbPath);
    fs.mkdirSync(path.dirname(tempDbPath), { recursive: true });

    process.env.JWT_SECRET = 'unit-test-secret';
    process.env.DB_PATH = tempDbPath;

    const db = require('../../server/db');
    await db.init();

    const auth = require('../../server/auth');

    const created = auth.createUserByAdmin({
      email: `admin-string-${Date.now()}@example.com`,
      password: 'secret12',
      name: 'Admin String',
      active: 'false',
      approved: '0',
    });

    expect(created.active).toBe(false);
    expect(created.approved).toBe(false);

    const updated = auth.updateUserAccess(created.id, {
      active: 'true',
      approved: 'false',
    });

    expect(updated.active).toBe(true);
    expect(updated.approved).toBe(false);

    db.shutdown();
  });

  test('normaliza roles con mayusculas o espacios al crear y actualizar usuarios', async () => {
    const tempDbPath = path.join(projectRoot, 'tmp', `auth-roles-${Date.now()}.sqlite`);
    cleanupPaths.push(tempDbPath);
    fs.mkdirSync(path.dirname(tempDbPath), { recursive: true });

    process.env.JWT_SECRET = 'unit-test-secret';
    process.env.DB_PATH = tempDbPath;

    const db = require('../../server/db');
    await db.init();

    const auth = require('../../server/auth');

    const created = auth.createUserByAdmin({
      email: `admin-role-${Date.now()}@example.com`,
      password: 'secret12',
      name: 'Admin Role',
      role: ' ADMIN ',
    });

    expect(created.role).toBe('admin');

    const updated = auth.updateUserAccess(created.id, { role: ' USER ' });
    expect(updated.role).toBe('user');

    db.shutdown();
  });

  test('rechaza roles fuera de catalogo al crear usuarios admin', async () => {
    const tempDbPath = path.join(projectRoot, 'tmp', `auth-invalid-role-${Date.now()}.sqlite`);
    cleanupPaths.push(tempDbPath);
    fs.mkdirSync(path.dirname(tempDbPath), { recursive: true });

    process.env.JWT_SECRET = 'unit-test-secret';
    process.env.DB_PATH = tempDbPath;

    const db = require('../../server/db');
    await db.init();

    const auth = require('../../server/auth');

    expect(() => auth.createUserByAdmin({
      email: `admin-owner-${Date.now()}@example.com`,
      password: 'secret12',
      name: 'Admin Owner',
      role: 'owner',
    })).toThrow(/Rol fuera de catalogo/i);

    db.shutdown();
  });

  test('regenera el secreto persistido si el archivo existe pero esta vacio', () => {
    const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cotizador-auth-empty-secret-'));
    const relativeDataDir = path.join('tmp', `auth-empty-secret-${Date.now()}`);
    const expectedSecretFile = path.resolve(projectRoot, relativeDataDir, '.jwt_secret');

    cleanupPaths.push(tempCwd);
    cleanupPaths.push(path.resolve(projectRoot, relativeDataDir));

    delete process.env.JWT_SECRET;
    delete process.env.DB_PATH;
    process.env.DATA_DIR = relativeDataDir;
    process.chdir(tempCwd);

    fs.mkdirSync(path.dirname(expectedSecretFile), { recursive: true });
    fs.writeFileSync(expectedSecretFile, '   ');

    require('../../server/auth');

    expect(fs.readFileSync(expectedSecretFile, 'utf8').trim().length).toBeGreaterThan(0);
  });

  test('rechaza booleanos fuera de contrato al crear o actualizar usuarios desde inputs externos', async () => {
    const tempDbPath = path.join(projectRoot, 'tmp', `auth-invalid-bools-${Date.now()}.sqlite`);
    cleanupPaths.push(tempDbPath);
    fs.mkdirSync(path.dirname(tempDbPath), { recursive: true });

    process.env.JWT_SECRET = 'unit-test-secret';
    process.env.DB_PATH = tempDbPath;

    const db = require('../../server/db');
    await db.init();

    const auth = require('../../server/auth');

    expect(() => auth.createUserByAdmin({
      email: `admin-invalid-${Date.now()}@example.com`,
      password: 'secret12',
      name: 'Admin Invalid',
      active: 'quizas',
    })).toThrow(/active debe ser booleano/i);

    const created = auth.createUserByAdmin({
      email: `admin-valid-${Date.now()}@example.com`,
      password: 'secret12',
      name: 'Admin Valid',
      active: true,
      approved: true,
    });

    expect(() => auth.updateUserAccess(created.id, {
      approved: 'quizas',
    })).toThrow(/approved debe ser booleano/i);

    db.shutdown();
  });

  test('mantiene parser tolerante para filas persistidas y parser estricto para inputs', () => {
    const auth = require('../../server/auth');
    const content = fs.readFileSync(AUTH_SOURCE_PATH, 'utf8');

    expect(auth._private.asBool('quizas', false)).toBe(false);
    expect(() => auth._private.parseBooleanInput('quizas', 'active', true)).toThrow(/active debe ser booleano/i);
    expect(content).toContain('function parseBooleanInput(value, fieldName, fallback = true)');
    expect(content).toContain('function assertAllowedRole(role)');
    expect(content).toContain('function assertPasswordStrength(password)');
    expect(content).toContain('checkCommunityAccessCode(code)');
    expect(content).toContain('El alta privada no esta disponible. Configura COMMUNITY_ACCESS_CODE para permitirla.');
    expect(content).toContain('Rol fuera de catalogo');
    expect(content).toContain('Codigo de comunidad incorrecto');
    expect(content).toContain('Token no interpretable o expirado');
    expect(content).not.toContain('Configura COMMUNITY_ACCESS_CODE para habilitar el alta privada.');
    expect(content).not.toContain('Registro cerrado temporalmente. Configura COMMUNITY_ACCESS_CODE para permitir el alta privada.');
    expect(content).not.toContain('Rol invalido');
    expect(content).not.toContain('Codigo de comunidad invalido');
    expect(content).not.toContain('Token invalido o expirado');
    expect(content).not.toContain('function validateRole(role)');
    expect(content).not.toContain('function validatePassword(password)');
    expect(content).not.toContain('validateCommunityAccessCode(code)');
    expect(content).not.toContain('return Number(value) !== 0;');
  });

  test('expone un cierre honesto cuando el alta privada no esta disponible en produccion', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.COMMUNITY_ACCESS_CODE;

    const auth = require('../../server/auth');

    expect(auth.checkCommunityAccessCode()).toEqual({
      ok: false,
      error: 'El alta privada no esta disponible. Configura COMMUNITY_ACCESS_CODE para permitirla.',
    });
  });

  test('expone codigo de comunidad incorrecto cuando no coincide con el configurado', () => {
    process.env.COMMUNITY_ACCESS_CODE = 'BSCOM-2026';

    const auth = require('../../server/auth');

    expect(auth.checkCommunityAccessCode('otro-codigo')).toEqual({
      ok: false,
      error: 'Codigo de comunidad incorrecto',
    });
  });

  test('requireAuth responde con token no interpretable cuando el bearer no se puede leer', () => {
    const auth = require('../../server/auth');
    const req = { headers: { authorization: 'Bearer token-malformado' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    auth.requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token no interpretable o expirado' });
    expect(next).not.toHaveBeenCalled();
  });

  test('membresias-service rechaza codigos de invitacion no disponibles con fraseo mas preciso', async () => {
    const tempDbPath = path.join(projectRoot, 'tmp', `membresias-invalid-code-${Date.now()}.sqlite`);
    cleanupPaths.push(tempDbPath);
    fs.mkdirSync(path.dirname(tempDbPath), { recursive: true });

    process.env.JWT_SECRET = 'unit-test-secret';
    process.env.DB_PATH = tempDbPath;

    const db = require('../../server/db');
    await db.init();

    const membresiasService = require('../../server/membresias/membresias-service');

    await expect(
      membresiasService.registrarUsuario(
        `invite-${Date.now()}@example.com`,
        'secret12',
        'Invitado Test',
        'INV-NO-EXISTE'
      )
    ).rejects.toThrow(/Codigo de invitacion no disponible o expirado/i);

    db.shutdown();
  });

  test('membresias-service marca niveles desconocidos como fuera de catalogo', async () => {
    const tempDbPath = path.join(projectRoot, 'tmp', `membresias-invalid-level-${Date.now()}.sqlite`);
    cleanupPaths.push(tempDbPath);
    fs.mkdirSync(path.dirname(tempDbPath), { recursive: true });

    process.env.JWT_SECRET = 'unit-test-secret';
    process.env.DB_PATH = tempDbPath;

    const db = require('../../server/db');
    await db.init();

    const membresiasService = require('../../server/membresias/membresias-service');

    expect(() => membresiasService.actualizarNivel(1, 'ORO')).toThrow(/Nivel de membresia fuera de catalogo/i);

    db.shutdown();
  });

test('membresias-service no revive fraseo anterior en comentarios operativos', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../server/membresias/membresias-service.js'),
      'utf8'
    );

    expect(source).toContain('// - Control de grupo');
    expect(source).toContain('// REVISAR CODIGO DE INVITACION');
    expect(source).toContain('const codigoDisponible = await this._cargarCodigoInvitacionDisponible(codigoInvitacion);');
    expect(source).toContain('Codigo de invitacion no disponible o expirado');
    expect(source).toContain('Nivel de membresia fuera de catalogo');
    expect(source).not.toContain('// - Validacion de grupo');
    expect(source).not.toContain('// VALIDAR CODIGO DE INVITACION');
    expect(source).not.toContain('const codigoValido = await this._validarCodigoInvitacion(codigoInvitacion);');
    expect(source).not.toContain('Codigo de invitacion invalido o expirado');
    expect(source).not.toContain('Nivel de membresia invalido');
  });
});
