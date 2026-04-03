#!/usr/bin/env node
// scripts/backup.js - Backup automatico de la base de datos
// Ejecutar diariamente via CRON: 0 4 * * * /usr/bin/node /ruta/cotizador/scripts/backup.js

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function resolveProjectPath(targetPath, fallback) {
  const value = String(targetPath || fallback || '').trim();
  if (!value) {
    return ROOT;
  }
  return path.isAbsolute(value) ? value : path.join(ROOT, value);
}

function parseRetentionDays(value, fallback = 30) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

function buildBackupConfig(env = process.env) {
  const dataDir = resolveProjectPath(env.DATA_DIR, 'data');
  const dbPath = resolveProjectPath(env.DB_PATH, path.join('data', 'cotizador.db'));
  return {
    dataDir,
    dbPath,
    backupDir: path.join(dataDir, 'backups'),
    retentionDays: parseRetentionDays(env.BACKUP_RETENTION_DAYS, 30),
  };
}

function backup() {
  const { dbPath, backupDir } = buildBackupConfig();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `cotizador-${timestamp}.db`);
  const walFile = dbPath + '-wal';
  const shmFile = dbPath + '-shm';

  try {
    fs.mkdirSync(backupDir, { recursive: true });

    const Database = require('better-sqlite3');
    const db = new Database(dbPath);
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();

    fs.copyFileSync(dbPath, backupFile);
    console.log(`[BACKUP] Creado: ${backupFile}`);

    if (fs.existsSync(walFile)) {
      fs.copyFileSync(walFile, backupFile + '-wal');
    }
    if (fs.existsSync(shmFile)) {
      fs.copyFileSync(shmFile, backupFile + '-shm');
    }

    cleanupOldBackups();

    const stats = fs.statSync(backupFile);
    console.log(`[BACKUP] Tamano: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log('[BACKUP] Completado sin error visible');

    return { success: true, file: backupFile, size: stats.size };
  } catch (error) {
    console.error(`[BACKUP] Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

function cleanupOldBackups() {
  try {
    const { backupDir, retentionDays } = buildBackupConfig();
    const files = fs.readdirSync(backupDir);
    const now = Date.now();
    const maxAge = retentionDays * 86400000;
    let deleted = 0;

    for (const file of files) {
      if (!file.startsWith('cotizador-') || !file.endsWith('.db')) continue;

      const filePath = path.join(backupDir, file);
      const stat = fs.statSync(filePath);

      if (now - stat.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        try { fs.unlinkSync(filePath + '-wal'); } catch {}
        try { fs.unlinkSync(filePath + '-shm'); } catch {}
        deleted += 1;
        console.log(`[BACKUP] Eliminado antiguo: ${file}`);
      }
    }

    if (deleted > 0) {
      console.log(`[BACKUP] Limpieza: ${deleted} backups eliminados (> ${retentionDays} dias)`);
    }
  } catch (error) {
    console.error(`[BACKUP] Error en limpieza: ${error.message}`);
  }
}

if (require.main === module) {
  console.log(`[BACKUP] Iniciando backup (${new Date().toISOString()})`);
  const result = backup();
  process.exit(result.success ? 0 : 1);
}

module.exports = {
  backup,
  buildBackupConfig,
  cleanupOldBackups,
  parseRetentionDays,
  resolveProjectPath,
};
