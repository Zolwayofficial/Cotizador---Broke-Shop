#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'backups');
const DEFAULT_ITEMS = [
  { source: '.env', destination: '.env' },
  { source: '.env.production', destination: '.env.production' },
  { source: 'data', destination: 'data' },
  { source: 'ecosystem.config.js', destination: 'ecosystem.config.js' },
  { source: 'DEPLOY.md', destination: 'DEPLOY.md' },
  { source: 'deploy-vps-direct.ps1', destination: 'deploy-vps-direct.ps1' },
  { source: 'deploy-vps.ps1', destination: 'deploy-vps.ps1' },
  { source: 'deploy-vps-unix.sh', destination: 'deploy-vps-unix.sh' },
  { source: 'deploy-vps.sh', destination: 'deploy-vps.sh' },
];

function fail(message, code = 1) {
  console.error(`[BACKUP-SECURE] ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {
    outputDir: DEFAULT_OUTPUT_DIR,
    dryRun: false,
    passphraseEnv: 'BACKUP_PASSPHRASE',
    extraItems: [],
    externalItems: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (token === '--output-dir') {
      args.outputDir = path.resolve(argv[i + 1] || '');
      i += 1;
      continue;
    }

    if (token === '--passphrase-env') {
      args.passphraseEnv = argv[i + 1] || args.passphraseEnv;
      i += 1;
      continue;
    }

    if (token === '--include') {
      const value = argv[i + 1];
      if (!value) {
        fail('Falta un valor despues de --include');
      }
      args.extraItems.push(value);
      i += 1;
      continue;
    }

    if (token === '--external') {
      const value = argv[i + 1];
      if (!value || !value.includes('=')) {
        fail('Usa --external origen_absoluto=destino_relativo');
      }
      args.externalItems.push(value);
      i += 1;
      continue;
    }

    fail(`Argumento no reconocido: ${token}`);
  }

  return args;
}

function ensureTarAvailable() {
  const tarCommand = process.platform === 'win32' ? 'tar.exe' : 'tar';
  const result = spawnSync(tarCommand, ['--version'], { stdio: 'ignore' });
  if (result.error || result.status !== 0) {
    fail(`No se encontro ${tarCommand}. Instala tar para generar el respaldo.`);
  }
  return tarCommand;
}

function buildItems(args) {
  const items = [...DEFAULT_ITEMS];

  args.extraItems.forEach((relativePath) => {
    items.push({
      source: relativePath,
      destination: relativePath.replace(/\\/g, '/'),
    });
  });

  args.externalItems.forEach((mapping) => {
    const [source, destination] = mapping.split('=');
    items.push({
      source,
      destination,
      external: true,
    });
  });

  return items;
}

function resolveSource(item) {
  return item.external ? path.resolve(item.source) : path.join(ROOT, item.source);
}

function copyRecursive(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function collectSnapshot(items, stageDir) {
  const included = [];
  const skipped = [];

  items.forEach((item) => {
    const source = resolveSource(item);
    if (!fs.existsSync(source)) {
      skipped.push({
        source,
        destination: item.destination,
        reason: 'missing',
      });
      return;
    }

    const destination = path.join(stageDir, item.destination);
    copyRecursive(source, destination);
    const stat = fs.statSync(source);
    included.push({
      source,
      destination: item.destination,
      type: stat.isDirectory() ? 'directory' : 'file',
      size: stat.isFile() ? stat.size : null,
    });
  });

  return { included, skipped };
}

function runTarCreate(tarCommand, stageDir, archivePath) {
  const result = spawnSync(tarCommand, ['-czf', archivePath, '-C', stageDir, '.'], {
    stdio: 'pipe',
  });

  if (result.error || result.status !== 0) {
    fail(`No se pudo crear el archivo tar.gz: ${(result.stderr || '').toString('utf8')}`);
  }
}

function encryptFile(inputPath, outputPath, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = fs.readFileSync(inputPath);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([ciphertext, authTag]);
  fs.writeFileSync(outputPath, payload);
  return {
    algorithm: 'aes-256-gcm',
    kdf: 'scrypt',
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTagLength: authTag.length,
  };
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const passphrase = process.env[args.passphraseEnv];
  const items = buildItems(args);

  if (!args.dryRun && (!passphrase || String(passphrase).trim().length < 12)) {
    fail(`Define ${args.passphraseEnv} con una frase segura de al menos 12 caracteres.`);
  }

  const tarCommand = ensureTarAvailable();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotName = `ops-snapshot-${timestamp}`;
  const outputDir = args.outputDir;
  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cotizador-backup-'));
  const archivePath = path.join(os.tmpdir(), `${snapshotName}.tar.gz`);
  const encryptedPath = path.join(outputDir, `${snapshotName}.tar.gz.enc`);
  const manifestPath = path.join(outputDir, `${snapshotName}.manifest.json`);

  try {
    const snapshotDir = path.join(stageDir, 'snapshot');
    fs.mkdirSync(snapshotDir, { recursive: true });
    const collected = collectSnapshot(items, snapshotDir);

    const preview = {
      dryRun: args.dryRun,
      outputDir,
      encryptedPath,
      manifestPath,
      included: collected.included,
      skipped: collected.skipped,
      note: 'Sube a GitHub solo el archivo .enc y el .manifest.json. Nunca subas el tar.gz sin cifrar.',
    };

    if (args.dryRun) {
      console.log(JSON.stringify(preview, null, 2));
      return;
    }

    fs.mkdirSync(outputDir, { recursive: true });

    fs.writeFileSync(
      path.join(snapshotDir, 'backup-metadata.json'),
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          projectRoot: ROOT,
          hostname: os.hostname(),
          platform: process.platform,
          nodeVersion: process.version,
          included: collected.included,
          skipped: collected.skipped,
        },
        null,
        2
      )
    );

    runTarCreate(tarCommand, snapshotDir, archivePath);
    const encryption = encryptFile(archivePath, encryptedPath, passphrase);
    const manifest = {
      createdAt: new Date().toISOString(),
      encryptedFile: path.basename(encryptedPath),
      checksumSha256: sha256File(encryptedPath),
      encryption,
      included: collected.included,
      skipped: collected.skipped,
      restoreCommand: `set ${args.passphraseEnv}=<tu_clave> && node scripts/restore-secure-backup.js --input ${path.basename(
        encryptedPath
      )}`,
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify({ ok: true, encryptedPath, manifestPath, included: collected.included.length }, null, 2));
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
    if (fs.existsSync(archivePath)) {
      fs.rmSync(archivePath, { force: true });
    }
  }
}

main();
