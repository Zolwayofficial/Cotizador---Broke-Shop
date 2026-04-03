#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const IS_WINDOWS = process.platform === 'win32';
const NPM_CMD = IS_WINDOWS ? 'npm.cmd' : 'npm';

function logStep(message) {
  process.stdout.write(`\n${message}\n`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    shell: false,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} fallo con codigo ${result.status}`);
  }
}

function ensureDirectory(relativePath) {
  fs.mkdirSync(path.join(PROJECT_ROOT, relativePath), { recursive: true });
}

function ensureLocalEnv() {
  const envPath = path.join(PROJECT_ROOT, '.env');
  const envExamplePath = path.join(PROJECT_ROOT, '.env.example');

  if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    return true;
  }

  return false;
}

function runLocalSetup() {
  logStep('[1/4] Instalando dependencias del proyecto...');
  run(NPM_CMD, ['install']);

  logStep('[2/4] Instalando dependencias del cliente...');
  run(NPM_CMD, ['install', '--prefix', 'client']);

  logStep('[3/4] Preparando directorios locales...');
  ensureDirectory('data');
  ensureDirectory(path.join('data', 'logs'));

  const createdEnv = ensureLocalEnv();

  logStep('[4/4] Setup local completo');
  process.stdout.write('Siguiente paso recomendado:\n');
  if (createdEnv) {
    process.stdout.write('- Edita .env antes de arrancar servicios que dependan de claves reales.\n');
  }
  process.stdout.write('- Usa "npm run client:build" o "npm run dev" segun tu flujo.\n');
  process.stdout.write('- Para provisionar un VPS Linux usa: npm run setup -- --vps\n');
}

function runVpsSetup() {
  if (IS_WINDOWS) {
    throw new Error('El modo --vps requiere bash; ejecutalo desde Linux, WSL o Git Bash.');
  }

  run('bash', [path.join('scripts', 'setup.sh')]);
}

function main() {
  const wantsVps = process.argv.includes('--vps');

  if (wantsVps) {
    runVpsSetup();
    return;
  }

  runLocalSetup();
}

main();
