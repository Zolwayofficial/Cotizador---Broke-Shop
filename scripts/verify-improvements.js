#!/usr/bin/env node
// scripts/verify-improvements.js — Verifica que las mejoras estén implementadas

const fs = require('fs');
const path = require('path');

const SERVER_DIR = path.join(__dirname, '..', 'server');
const SCRIPTS_DIR = path.join(__dirname, '..');

let passed = 0;
let failed = 0;

function checkFile(filePath, checks) {
  const fileName = path.basename(filePath);
  console.log(`\n📄 Verificando ${fileName}...`);

  if (!fs.existsSync(filePath)) {
    console.log(`   ❌ Archivo no existe: ${filePath}`);
    failed++;
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');

  for (const check of checks) {
    if (content.includes(check.pattern)) {
      console.log(`   ✅ ${check.name}`);
      passed++;
    } else {
      console.log(`   ❌ ${check.name} - NO ENCONTRADO`);
      failed++;
    }
  }
}

// Verificaciones por archivo
checkFile(path.join(SERVER_DIR, 'index.js'), [
  { pattern: 'RATE_LIMIT_CLEANUP_INTERVAL', name: 'Rate limiter con limpieza' },
  { pattern: 'if (_rateLimit[ip].length === 0)', name: 'Limpieza de IPs vacías' },
  { pattern: 'UPLOAD_DIR', name: 'Directorio de uploads' },
  { pattern: 'setInterval(() =>', name: 'Limpieza periódica de archivos' },
  { pattern: 'allowedMimes', name: 'Validación de MIME types' },
  { pattern: 'acquireCronLock', name: 'Lock de concurrencia para CRON' },
  { pattern: 'CRON_LOCK_FILE', name: 'Archivo de lock para CRON' },
  { pattern: 'pdfError', name: 'Manejo de errores en PDF' },
  { pattern: 'Validar tamaño máximo', name: 'Validación de tamaño de PDF' },
  { pattern: 'allowedOrigins', name: 'CORS con lista blanca' },
  { pattern: 'const timestamp = new Date().toISOString()', name: 'Timestamps en error handlers' },
  { pattern: 'crash.log', name: 'Guardado de crash logs' },
  { pattern: 'const startTime = Date.now()', name: 'Init con timing' },
  { pattern: 'backupDB', name: 'Backup automático integrado' },
]);

checkFile(path.join(SERVER_DIR, 'db.js'), [
  { pattern: 'runMigrations', name: 'Migraciones versionadas' },
  { pattern: 'wal_autocheckpoint', name: 'WAL checkpoint automático' },
  { pattern: 'cache_size = -64000', name: 'Cache de 64MB' },
  { pattern: 'wal_checkpoint(PASSIVE)', name: 'Checkpoint forzado periódico' },
  { pattern: 'busy_timeout = 5000', name: 'Busy timeout' },
]);

checkFile(path.join(SERVER_DIR, 'tracking.js'), [
  { pattern: 'pruneTrackingCache', name: 'Función de prune' },
  { pattern: 'Object.entries(CACHE).sort', name: 'Eliminación por antigüedad' },
  { pattern: 'setInterval', name: 'Limpieza automática' },
]);

checkFile(path.join(SERVER_DIR, 'nandina.js'), [
  { pattern: 'timeout: 45000', name: 'Timeout de 45s (servidores gubernamentales lentos)' },
  { pattern: 'Timeout después de 45s', name: 'Mensaje de timeout' },
]);

checkFile(path.join(SERVER_DIR, 'clasificador.js'), [
  { pattern: 'clasificarPorKeywords', name: 'Fallback por keywords' },
  { pattern: 'keyword_fallback', name: 'Método de fallback' },
  { pattern: 'Todos los modelos fallaron', name: 'Log de fallback' },
  { pattern: 'parseJSON(result.text)', name: 'Validación de respuesta JSON' },
]);

checkFile(path.join(SERVER_DIR, 'flete-api.js'), [
  { pattern: 'TrackingMore', name: 'Integración TrackingMore API' },
  { pattern: 'fallback automático', name: 'Fallback automático' },
  { pattern: '_dailyUsage', name: 'Contador de uso diario' },
  { pattern: '100 requests', name: 'Límite 100 requests/día' },
]);

checkFile(path.join(SCRIPTS_DIR, 'scripts', 'backup.js'), [
  { pattern: 'backup', name: 'Función de backup' },
  { pattern: 'RETENTION_DAYS', name: 'Retención configurable' },
  { pattern: 'cleanupOldBackups', name: 'Limpieza de backups antiguos' },
]);

checkFile(path.join(SCRIPTS_DIR, '.env.example'), [
  { pattern: 'ALLOWED_ORIGINS', name: 'Variable ALLOWED_ORIGINS' },
  { pattern: 'BACKUP_CRON', name: 'Variable BACKUP_CRON' },
  { pattern: 'JWT_TTL_DAYS', name: 'Variable JWT_TTL_DAYS' },
  { pattern: 'TRACKINGMORE_API_KEY', name: 'Variable TRACKINGMORE_API_KEY' },
  { pattern: 'SEARATES_API_KEY', name: 'Variable SEARATES_API_KEY' },
]);

// Resumen
console.log('\n' + '='.repeat(50));
console.log(`\n✅ Aprobadas: ${passed}`);
console.log(`❌ Fallidas: ${failed}`);
console.log(`📊 Total: ${passed + failed}`);

if (failed === 0) {
  console.log('\n🎉 ¡TODAS LAS MEJORAS ESTÁN IMPLEMENTADAS!');
  console.log('\nPuedes reiniciar el servidor con:');
  console.log('  pm2 restart cotizador');
  console.log('  pm2 logs cotizador\n');
  process.exit(0);
} else {
  console.log('\n⚠️  Algunas mejoras faltan. Revisa los archivos marcados.');
  process.exit(1);
}
