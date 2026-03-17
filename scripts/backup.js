#!/usr/bin/env node
// scripts/backup.js — Backup automático de la base de datos
// Ejecutar diariamente vía CRON: 0 4 * * * /usr/bin/node /ruta/cotizador/scripts/backup.js

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = process.env.DB_PATH || './data/cotizador.db';
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS) || 30;

function backup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const backupFile = path.join(BACKUP_DIR, `cotizador-${timestamp}.db`);
  const walFile = DB_PATH + '-wal';
  const shmFile = DB_PATH + '-shm';
  
  try {
    // Crear directorio de backups si no existe
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    
    // Forzar checkpoint para asegurar que todos los datos estén en el DB principal
    const Database = require('better-sqlite3');
    const db = new Database(DB_PATH);
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    
    // Copiar base de datos
    fs.copyFileSync(DB_PATH, backupFile);
    console.log(`[BACKUP] Creado: ${backupFile}`);
    
    // Copiar archivos WAL y SHM si existen (para consistencia)
    if (fs.existsSync(walFile)) {
      fs.copyFileSync(walFile, backupFile + '-wal');
    }
    if (fs.existsSync(shmFile)) {
      fs.copyFileSync(shmFile, backupFile + '-shm');
    }
    
    // Limpieza de backups antiguos
    cleanupOldBackups();
    
    // Estadísticas
    const stats = fs.statSync(backupFile);
    console.log(`[BACKUP] Tamaño: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`[BACKUP] Completado exitosamente`);
    
    return { success: true, file: backupFile, size: stats.size };
    
  } catch (e) {
    console.error(`[BACKUP] Error: ${e.message}`);
    return { success: false, error: e.message };
  }
}

function cleanupOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const now = Date.now();
    const maxAge = RETENTION_DAYS * 86400000; // ms
    let deleted = 0;
    
    for (const file of files) {
      if (!file.startsWith('cotizador-') || !file.endsWith('.db')) continue;
      
      const filePath = path.join(BACKUP_DIR, file);
      const stat = fs.statSync(filePath);
      
      if (now - stat.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        // También eliminar archivos asociados
        try { fs.unlinkSync(filePath + '-wal'); } catch {}
        try { fs.unlinkSync(filePath + '-shm'); } catch {}
        deleted++;
        console.log(`[BACKUP] Eliminado antiguo: ${file}`);
      }
    }
    
    if (deleted > 0) {
      console.log(`[BACKUP] Limpieza: ${deleted} backups eliminados (> ${RETENTION_DAYS} días)`);
    }
  } catch (e) {
    console.error(`[BACKUP] Error en limpieza: ${e.message}`);
  }
}

// Ejecutar si se llama directamente desde CLI
if (require.main === module) {
  console.log(`[BACKUP] Iniciando backup (${new Date().toISOString()})`);
  const result = backup();
  process.exit(result.success ? 0 : 1);
}

module.exports = { backup, cleanupOldBackups };
