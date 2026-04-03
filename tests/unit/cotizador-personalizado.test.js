const fs = require('fs');
const os = require('os');
const path = require('path');

const SOURCE_PATH = path.resolve(
  __dirname,
  '../../server/couriers/cotizador-personalizado.js'
);

describe('cotizador personalizado', () => {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const originalEnv = {
    DATA_DIR: process.env.DATA_DIR,
    EMAIL_SMTP_HOST: process.env.EMAIL_SMTP_HOST,
    EMAIL_SMTP_PORT: process.env.EMAIL_SMTP_PORT,
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_PASSWORD: process.env.EMAIL_PASSWORD,
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

    jest.restoreAllMocks();
    jest.resetModules();
    jest.unmock('nodemailer');
  });

  test('resuelve DATA_DIR relativo desde la raiz del proyecto', () => {
    const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cotizador-personalizado-cwd-'));
    const relativeDataDir = path.join('tmp', `cotizador-personalizado-${Date.now()}`);
    const expectedContactsPath = path.resolve(projectRoot, relativeDataDir, 'contactos-couriers.json');
    const wrongContactsPath = path.resolve(tempCwd, relativeDataDir, 'contactos-couriers.json');
    const expectedDbPath = path.resolve(projectRoot, relativeDataDir, 'cotizaciones-personalizadas.json');

    cleanupPaths.push(tempCwd);
    cleanupPaths.push(path.resolve(projectRoot, relativeDataDir));

    delete process.env.EMAIL_SMTP_HOST;
    delete process.env.EMAIL_SMTP_PORT;
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASSWORD;
    process.env.DATA_DIR = relativeDataDir;
    process.chdir(tempCwd);

    const cotizador = require('../../server/couriers/cotizador-personalizado');

    expect(cotizador._private.CONTACTOS_PATH).toBe(expectedContactsPath);
    expect(cotizador._private.DB_PATH).toBe(expectedDbPath);
    expect(fs.existsSync(expectedContactsPath)).toBe(true);
    expect(fs.existsSync(wrongContactsPath)).toBe(false);
  });

  test('no crea transporter cuando EMAIL_SMTP_HOST existe pero faltan credenciales', () => {
    const tempDataDir = path.join(projectRoot, 'tmp', `cotizador-smtp-incompleto-${Date.now()}`);
    const createTransport = jest.fn(() => ({ sendMail: jest.fn() }));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    cleanupPaths.push(tempDataDir);

    jest.doMock('nodemailer', () => ({
      createTransport,
    }));

    process.env.DATA_DIR = tempDataDir;
    process.env.EMAIL_SMTP_HOST = 'smtp.example.com';
    delete process.env.EMAIL_SMTP_PORT;
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASSWORD;

    const cotizador = require('../../server/couriers/cotizador-personalizado');

    expect(createTransport).not.toHaveBeenCalled();
    expect(cotizador.transporter).toBeNull();
    expect(cotizador._private.getMissingEmailConfig()).toEqual(
      expect.arrayContaining(['EMAIL_USER', 'EMAIL_PASSWORD'])
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Email SMTP incompleto; faltan:')
    );
  });

  test('crea transporter con puerto SMTP parseado como numero', () => {
    const tempDataDir = path.join(projectRoot, 'tmp', `cotizador-smtp-completo-${Date.now()}`);
    const transporter = { sendMail: jest.fn() };
    const createTransport = jest.fn(() => transporter);

    cleanupPaths.push(tempDataDir);

    jest.doMock('nodemailer', () => ({
      createTransport,
    }));

    process.env.DATA_DIR = tempDataDir;
    process.env.EMAIL_SMTP_HOST = 'smtp.example.com';
    process.env.EMAIL_SMTP_PORT = '2525';
    process.env.EMAIL_USER = 'user@example.com';
    process.env.EMAIL_PASSWORD = 'secret';

    const cotizador = require('../../server/couriers/cotizador-personalizado');

    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 2525,
      secure: false,
      auth: {
        user: 'user@example.com',
        pass: 'secret',
      },
    });
    expect(cotizador.transporter).toBe(transporter);
  });

  test('usa fallback de puerto y deja helpers visibles en source', () => {
    const cotizador = require('../../server/couriers/cotizador-personalizado');
    const source = fs.readFileSync(SOURCE_PATH, 'utf8');

    expect(cotizador._private.parseSmtpPort('no-numero')).toBe(587);
    expect(cotizador._private.parseSmtpPort('1025')).toBe(1025);
    expect(source).toMatch(/^[\x00-\x7F]*$/);
    expect(source).toContain('function resolveDataDir()');
    expect(source).toContain('function getMissingEmailConfig()');
    expect(source).toContain('Email SMTP incompleto; faltan:');
    expect(source).toContain("console.log(`[COTIZADOR] Email enviado a ${contacto.nombre} (${cotizacionId})`);");
    expect(source).not.toContain('✅');
    expect(source).not.toContain('if (!process.env.EMAIL_SMTP_HOST) {');
  });
});
