# Backup Operativo Para GitHub

## Objetivo

Guardar en GitHub un respaldo cifrado del estado operativo sin subir secretos en claro.

Este documento acompana a:

- `scripts/create-secure-backup.js`
- `scripts/restore-secure-backup.js`
- `backups/*.tar.gz.enc`
- `backups/*.manifest.json`

## Regla Basica

Se puede subir al repositorio:

- codigo
- documentacion
- artefactos cifrados `*.tar.gz.enc`
- manifiestos `*.manifest.json`

No se debe subir:

- `.env`
- `.env.production`
- `data/` en claro
- backups `.tar.gz` sin cifrar
- copias directas de secretos del VPS

## Flujo Recomendado

En PowerShell:

```powershell
$env:BACKUP_PASSPHRASE="una-frase-larga-y-segura"
$repoRoot = "C:\\ruta\\al\\repo"
Set-Location $repoRoot
npm run backup:secure
```

Eso genera artefactos dentro de `backups/`.

Para restaurar:

```powershell
$env:BACKUP_PASSPHRASE="la-misma-frase-usada-en-el-respaldo"
$repoRoot = "C:\\ruta\\al\\repo"
Set-Location $repoRoot
npm run backup:restore -- --input backups\ops-snapshot-AAAA-MM-DDTHH-MM-SS.enc
```

La restauracion se deja en `restored-backups/`.

## Cobertura

El respaldo cifrado sirve para preservar:

- configuracion local del proyecto
- base de datos y directorios operativos dentro del repo
- scripts y configuracion de despliegue versionados
- archivos externos del VPS si se agregan de forma explicita con `--external`

Ejemplo:

```powershell
$env:BACKUP_PASSPHRASE="una-frase-larga-y-segura"
node scripts/create-secure-backup.js `
  --external /etc/nginx/sites-available/importaiagent=server-config/nginx-importaiagent.conf `
  --external /root/.pm2/dump.pm2=server-config/pm2-dump.json
```

## Lo Que No Sustituye

Este flujo no reemplaza:

- instantaneas completas del VPS
- politicas de retencion largas del hosting
- restauracion total de la maquina

Lo correcto es combinar:

- GitHub para codigo y docs
- backup cifrado para estado operativo
- instantanea del VPS para desastre mayor
