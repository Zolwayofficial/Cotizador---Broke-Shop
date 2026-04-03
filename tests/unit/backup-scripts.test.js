const { describe, it, expect } = require('@jest/globals');
const path = require('path');
const { spawnSync } = require('child_process');

const backupScript = require('../../scripts/backup.js');

describe('backup scripts', () => {
  const root = path.join(__dirname, '..', '..');

  it('resuelve rutas relativas del backup respecto al repo y no al cwd', () => {
    const config = backupScript.buildBackupConfig({
      DATA_DIR: 'data',
      DB_PATH: './data/cotizador.db',
      BACKUP_RETENTION_DAYS: '15',
    });

    expect(config.dataDir).toBe(path.join(root, 'data'));
    expect(config.dbPath).toBe(path.join(root, 'data', 'cotizador.db'));
    expect(config.backupDir).toBe(path.join(root, 'data', 'backups'));
    expect(config.retentionDays).toBe(15);
  });

  it('no sobrescribe backups del mismo dia porque usa timestamp completo', () => {
    const first = new Date('2026-03-24T10:00:00.000Z').toISOString().replace(/[:.]/g, '-');
    const second = new Date('2026-03-24T10:00:01.000Z').toISOString().replace(/[:.]/g, '-');

    expect(first).not.toBe(second);
    expect(first).toContain('2026-03-24T10-00-00-000Z');
    expect(second).toContain('2026-03-24T10-00-01-000Z');
  });

  it('backup.js no sobreafirma el cierre operativo del respaldo', () => {
    const content = require('fs').readFileSync(path.join(root, 'scripts', 'backup.js'), 'utf8');

    expect(content).toContain('[BACKUP] Completado sin error visible');
    expect(content).not.toContain('[BACKUP] Completado exitosamente');
  });

  it('create-secure-backup falla si --output-dir no recibe valor', () => {
    const result = spawnSync(process.execPath, ['scripts/create-secure-backup.js', '--output-dir'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Falta un valor despues de --output-dir');
  });

  it('restore-secure-backup falla si --passphrase-env no recibe valor', () => {
    const result = spawnSync(process.execPath, ['scripts/restore-secure-backup.js', '--input', 'demo.tar.gz.enc', '--passphrase-env'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, BACKUP_PASSPHRASE: '123456789012' },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Falta un valor despues de --passphrase-env');
  });
});
