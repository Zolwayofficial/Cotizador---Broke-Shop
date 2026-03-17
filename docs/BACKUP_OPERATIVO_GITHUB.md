# Backup Operativo Seguro Para GitHub

## Objetivo

Subir a GitHub un respaldo que cubra el estado operativo sensible del proyecto sin exponer en texto plano:

- `.env`
- `.env.production`
- `data/`
- configuracion de despliegue

## Regla De Seguridad

No se debe subir a GitHub un respaldo crudo del VPS o del proyecto con secretos visibles.

Lo correcto es subir:

- el archivo cifrado `*.tar.gz.enc`
- su `*.manifest.json`

Y nunca subir:

- `*.tar.gz` sin cifrar
- copias directas de `.env`
- bases de datos en claro

## Scripts

- Crear respaldo cifrado:
  - [create-secure-backup.js](/C:/Users/Billy/AppData/Local/Programs/Antigravity/cotizador/scripts/create-secure-backup.js)
- Restaurar respaldo cifrado:
  - [restore-secure-backup.js](/C:/Users/Billy/AppData/Local/Programs/Antigravity/cotizador/scripts/restore-secure-backup.js)

## Uso Basico

En PowerShell:

```powershell
$env:BACKUP_PASSPHRASE="una-frase-larga-y-segura"
cd C:\Users\Billy\AppData\Local\Programs\Antigravity\cotizador
npm run backup:secure
```

Eso genera:

- `backups/ops-snapshot-....tar.gz.enc`
- `backups/ops-snapshot-....manifest.json`

## Restauracion

```powershell
$env:BACKUP_PASSPHRASE="la-misma-frase-usada-al-crear-el-respaldo"
cd C:\Users\Billy\AppData\Local\Programs\Antigravity\cotizador
npm run backup:restore -- --input ops-snapshot-AAAA-MM-DDTHH-MM-SS-...tar.gz.enc
```

La restauracion quedara en `restored-backups/`.

## Incluir Archivos Externos Del VPS

Si quieres cubrir tambien configuracion del VPS que no vive dentro del repo, puedes agregar rutas externas al crear el respaldo.

Ejemplo:

```powershell
$env:BACKUP_PASSPHRASE="una-frase-larga-y-segura"
node scripts/create-secure-backup.js `
  --external /etc/nginx/sites-available/importaiagent=server-config/nginx-importaiagent.conf `
  --external /root/.pm2/dump.pm2=server-config/pm2-dump.json
```

Eso permite que el respaldo cifrado cubra tambien configuraciones operativas fuera del repo.

## Lo Que Si Cubre

- secretos del proyecto
- base de datos y datos locales
- configuracion de PM2/ecosystem
- scripts de despliegue
- opcionalmente configuracion de Nginx y PM2 del VPS si se agregan como `--external`

## Lo Que No Reemplaza

Este respaldo no reemplaza:

- una imagen completa del VPS
- snapshots del proveedor de hosting
- backups de base de datos historicos con retencion larga

Lo correcto es combinar:

- GitHub para codigo fuente
- respaldo cifrado para estado operativo
- backup del VPS o snapshot del proveedor para desastre mayor
