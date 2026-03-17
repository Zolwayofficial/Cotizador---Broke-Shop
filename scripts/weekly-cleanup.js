#!/usr/bin/env node
// scripts/weekly-cleanup.js - Limpieza segura de artefactos generados

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const LOG_RETENTION_DAYS = Number(process.env.CLEANUP_LOG_RETENTION_DAYS || 14);
const BACKUP_RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || 30);
const DRY_RUN = process.argv.includes('--dry-run');

const DIRECTORIES_TO_DELETE = [
  path.join(ROOT, 'coverage'),
  path.join(ROOT, 'client', 'dist'),
  path.join(ROOT, 'scripts', '__pycache__'),
  path.join(ROOT, '{server,client'),
];

const FILES_TO_DELETE = [
  path.join(ROOT, 'local-start.err.log'),
  path.join(ROOT, 'local-start.out.log'),
];

const SUMMARY = {
  removedDirectories: [],
  removedFiles: [],
  prunedLogs: [],
  prunedBackups: [],
  skipped: [],
};

function exists(target) {
  return fs.existsSync(target);
}

function removePath(target, bucket) {
  if (!exists(target)) {
    SUMMARY.skipped.push(target);
    return;
  }

  if (DRY_RUN) {
    bucket.push(`${target} (dry-run)`);
    return;
  }

  fs.rmSync(target, { recursive: true, force: true });
  bucket.push(target);
}

function pruneFilesOlderThan(directory, matcher, maxAgeDays, bucket) {
  if (!exists(directory)) return;

  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) return;
    if (!matcher(entry.name, fullPath)) return;

    const stats = fs.statSync(fullPath);
    if (now - stats.mtimeMs < maxAgeMs) return;

    if (DRY_RUN) {
      bucket.push(`${fullPath} (dry-run)`);
      return;
    }

    fs.rmSync(fullPath, { force: true });
    bucket.push(fullPath);
  });
}

function pruneLogs() {
  pruneFilesOlderThan(
    ROOT,
    (name) => /\.(log|err\.log|out\.log)$/i.test(name),
    LOG_RETENTION_DAYS,
    SUMMARY.prunedLogs
  );
}

function pruneBackups() {
  pruneFilesOlderThan(
    BACKUP_DIR,
    (name) => /^cotizador-.*\.db(?:-wal|-shm)?$/i.test(name),
    BACKUP_RETENTION_DAYS,
    SUMMARY.prunedBackups
  );
}

function cleanup() {
  DIRECTORIES_TO_DELETE.forEach((target) => removePath(target, SUMMARY.removedDirectories));
  FILES_TO_DELETE.forEach((target) => removePath(target, SUMMARY.removedFiles));
  pruneLogs();
  pruneBackups();

  console.log(JSON.stringify({
    ok: true,
    dryRun: DRY_RUN,
    summary: SUMMARY,
  }, null, 2));
}

if (require.main === module) {
  cleanup();
}

module.exports = {
  cleanup,
};
