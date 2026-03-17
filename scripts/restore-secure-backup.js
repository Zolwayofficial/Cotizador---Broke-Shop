#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function fail(message, code = 1) {
  console.error(`[BACKUP-RESTORE] ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {
    input: '',
    outputDir: path.join(ROOT, 'restored-backups'),
    passphraseEnv: 'BACKUP_PASSPHRASE',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--input') {
      args.input = argv[i + 1] || '';
      i += 1;
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

    fail(`Argumento no reconocido: ${token}`);
  }

  if (!args.input) {
    fail('Usa --input <archivo.enc>');
  }

  return args;
}

function ensureTarAvailable() {
  const tarCommand = process.platform === 'win32' ? 'tar.exe' : 'tar';
  const result = spawnSync(tarCommand, ['--version'], { stdio: 'ignore' });
  if (result.error || result.status !== 0) {
    fail(`No se encontro ${tarCommand}. Instala tar para restaurar.`);
  }
  return tarCommand;
}

function decryptFile(inputPath, manifest, passphrase, outputPath) {
  const payload = fs.readFileSync(inputPath);
  const authTagLength = manifest.encryption.authTagLength || 16;
  const ciphertext = payload.subarray(0, payload.length - authTagLength);
  const authTag = payload.subarray(payload.length - authTagLength);
  const key = crypto.scryptSync(passphrase, Buffer.from(manifest.encryption.salt, 'hex'), 32);
  const decipher = crypto.createDecipheriv(
    manifest.encryption.algorithm,
    key,
    Buffer.from(manifest.encryption.iv, 'hex')
  );
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  fs.writeFileSync(outputPath, plaintext);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const passphrase = process.env[args.passphraseEnv];
  if (!passphrase || String(passphrase).trim().length < 12) {
    fail(`Define ${args.passphraseEnv} con la misma frase usada al crear el respaldo.`);
  }

  const tarCommand = ensureTarAvailable();
  const inputPath = path.isAbsolute(args.input) ? args.input : path.join(ROOT, 'backups', args.input);
  const manifestPath = inputPath.replace(/\.tar\.gz\.enc$/i, '.manifest.json');

  if (!fs.existsSync(inputPath)) {
    fail(`No existe el archivo cifrado: ${inputPath}`);
  }
  if (!fs.existsSync(manifestPath)) {
    fail(`No existe el manifiesto asociado: ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const tempArchive = path.join(os.tmpdir(), `restore-${Date.now()}.tar.gz`);
  const restoreDir = path.join(args.outputDir, path.basename(inputPath).replace(/\.tar\.gz\.enc$/i, ''));

  try {
    fs.mkdirSync(restoreDir, { recursive: true });
    decryptFile(inputPath, manifest, passphrase, tempArchive);
    const result = spawnSync(tarCommand, ['-xzf', tempArchive, '-C', restoreDir], { stdio: 'pipe' });
    if (result.error || result.status !== 0) {
      fail(`No se pudo extraer el respaldo: ${(result.stderr || '').toString('utf8')}`);
    }
    console.log(JSON.stringify({ ok: true, restoreDir, manifestPath }, null, 2));
  } finally {
    if (fs.existsSync(tempArchive)) {
      fs.rmSync(tempArchive, { force: true });
    }
  }
}

main();
