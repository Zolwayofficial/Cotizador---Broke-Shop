#!/usr/bin/env node
// scripts/weekly-cleanup.js - Limpieza segura de artefactos generados

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

function parseRetentionDays(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

function buildCleanupConfig(argv = process.argv, env = process.env) {
  return {
    dryRun: argv.includes('--dry-run'),
    logRetentionDays: parseRetentionDays(env.CLEANUP_LOG_RETENTION_DAYS, 14),
    backupRetentionDays: parseRetentionDays(env.BACKUP_RETENTION_DAYS, 30),
  };
}

function buildSummary() {
  return {
    removedDirectories: [],
    removedFiles: [],
    prunedLogs: [],
    prunedBackups: [],
    skipped: [],
  };
}

const DIRECTORIES_TO_DELETE = [
  path.join(ROOT, 'coverage'),
  path.join(ROOT, 'client', 'dist'),
  path.join(ROOT, 'scripts', '__pycache__'),
];

const FILES_TO_DELETE = [
  path.join(ROOT, 'local-start.err.log'),
  path.join(ROOT, 'local-start.out.log'),
];

function exists(target) {
  return fs.existsSync(target);
}

function removePath(target, bucket, summary, dryRun) {
  if (!exists(target)) {
    summary.skipped.push(target);
    return;
  }

  if (dryRun) {
    bucket.push(`${target} (dry-run)`);
    return;
  }

  fs.rmSync(target, { recursive: true, force: true });
  bucket.push(target);
}

function pruneFilesOlderThan(directory, matcher, maxAgeDays, bucket, dryRun) {
  if (!exists(directory)) return;

  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) return;
    if (!matcher(entry.name, fullPath)) return;

    const stats = fs.statSync(fullPath);
    if (now - stats.mtimeMs < maxAgeMs) return;

    if (dryRun) {
      bucket.push(`${fullPath} (dry-run)`);
      return;
    }

    fs.rmSync(fullPath, { force: true });
    bucket.push(fullPath);
  });
}

function pruneLogs(config, summary) {
  pruneFilesOlderThan(
    ROOT,
    (name) => /\.(log|err\.log|out\.log)$/i.test(name),
    config.logRetentionDays,
    summary.prunedLogs,
    config.dryRun
  );
}

function pruneBackups(config, summary) {
  pruneFilesOlderThan(
    BACKUP_DIR,
    (name) => /^cotizador-.*\.db(?:-wal|-shm)?$/i.test(name),
    config.backupRetentionDays,
    summary.prunedBackups,
    config.dryRun
  );
}

function cleanup(argv = process.argv, env = process.env) {
  const config = buildCleanupConfig(argv, env);
  const summary = buildSummary();

  DIRECTORIES_TO_DELETE.forEach((target) => removePath(target, summary.removedDirectories, summary, config.dryRun));
  FILES_TO_DELETE.forEach((target) => removePath(target, summary.removedFiles, summary, config.dryRun));
  pruneLogs(config, summary);
  pruneBackups(config, summary);

  const result = {
    ok: true,
    dryRun: config.dryRun,
    summary,
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) {
  cleanup();
}

module.exports = {
  BACKUP_DIR,
  DIRECTORIES_TO_DELETE,
  FILES_TO_DELETE,
  ROOT,
  buildCleanupConfig,
  cleanup,
  parseRetentionDays,
};
