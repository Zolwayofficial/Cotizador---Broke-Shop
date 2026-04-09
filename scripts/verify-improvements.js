#!/usr/bin/env node
// scripts/verify-improvements.js - Verifica contratos reales del proyecto actual

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const CHECKS = [
  {
    file: 'server/index.js',
    checks: [
      { pattern: 'resolveScopedUserId', name: 'Identidad normalizada para self-scoping' },
      { pattern: "app.get('/api/monitor/health'", name: 'Health endpoint expuesto' },
      { pattern: "app.post('/api/dashboard/chat'", name: 'Chat del dashboard disponible' },
      { pattern: "app.post('/api/auto-cotizar/extraer'", name: 'Extraccion documental disponible' },
    ],
  },
  {
    file: 'client/src/App.jsx',
    checks: [
      { pattern: 'normalizeLoginPayload', name: 'Login normalizado en cliente' },
      { pattern: 'buildDocumentFieldChangeState', name: 'Edicion de borrador reemplaza resultado viejo' },
      { pattern: 'buildDocumentDraftView', name: 'Vista documental normalizada' },
    ],
  },
  {
    file: 'scripts/backup.js',
    checks: [
      { pattern: 'buildBackupConfig', name: 'Configuracion de backup reusable' },
      { pattern: 'parseRetentionDays', name: 'Retencion acotada' },
      { pattern: 'resolveProjectPath', name: 'Rutas relativas resueltas contra el repo' },
    ],
  },
  {
    file: 'scripts/weekly-cleanup.js',
    checks: [
      { pattern: 'buildCleanupConfig', name: 'Configuracion reusable de limpieza' },
      { pattern: 'parseRetentionDays', name: 'Retencion segura en limpieza' },
      { pattern: "path.join(ROOT, 'client', 'dist')", name: 'Limpieza de build del cliente' },
    ],
  },
  {
    file: 'scripts/create-secure-backup.js',
    checks: [
      { pattern: 'Falta un valor despues de --output-dir', name: 'Requiere output-dir explicito' },
      { pattern: 'Falta un valor despues de --passphrase-env', name: 'Requiere passphrase-env explicito' },
    ],
  },
];

function checkFile(filePath, checks) {
  const absolutePath = path.join(ROOT, filePath);
  const fileName = path.basename(filePath);

  if (!fs.existsSync(absolutePath)) {
    return {
      file: fileName,
      ok: false,
      missing: true,
      results: [],
    };
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  const results = checks.map((check) => ({
    name: check.name,
    ok: content.includes(check.pattern),
  }));

  return {
    file: fileName,
    ok: results.every((result) => result.ok),
    missing: false,
    results,
  };
}

function runChecks() {
  const report = CHECKS.map((entry) => checkFile(entry.file, entry.checks));
  const passed = report.reduce((sum, fileReport) => (
    sum + fileReport.results.filter((result) => result.ok).length
  ), 0);
  const failed = report.reduce((sum, fileReport) => (
    sum + fileReport.results.filter((result) => !result.ok).length + (fileReport.missing ? 1 : 0)
  ), 0);

  return { report, passed, failed };
}

function printReport(summary) {
  summary.report.forEach((fileReport) => {
    console.log(`\n[VERIFY] ${fileReport.file}`);

    if (fileReport.missing) {
      console.log('  FALTA archivo no existe');
      return;
    }

    fileReport.results.forEach((result) => {
      console.log(`  ${result.ok ? 'PRESENTE' : 'FALTA'} ${result.name}`);
    });
  });

  console.log('\n' + '='.repeat(50));
  console.log(`Presentes: ${summary.passed}`);
  console.log(`Pendientes: ${summary.failed}`);
  console.log(`Total: ${summary.passed + summary.failed}`);

  if (summary.failed === 0) {
    console.log('\nSin verificaciones pendientes en esta pasada.');
  } else {
    console.log('\nHay verificaciones pendientes o faltantes.');
  }
}

if (require.main === module) {
  const summary = runChecks();
  printReport(summary);
  process.exit(summary.failed === 0 ? 0 : 1);
}

module.exports = {
  CHECKS,
  ROOT,
  checkFile,
  printReport,
  runChecks,
};
