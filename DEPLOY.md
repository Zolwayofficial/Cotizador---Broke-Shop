# Despliegue al VPS

Esta guia resume el flujo actual de despliegue auditado para `importaiagent`.

## Requisitos

- `.env.production` real y utilizable
- `PORT` y `WS_PORT` reales en `.env.production`
- acceso SSH al VPS
- `npm run production:check` sin bloqueantes locales salvo los secretos que solo existan en el VPS
- `pm2` y `nginx` se instalan o reutilizan segun el wrapper elegido

## Wrappers actuales

### Windows

```powershell
deploy-vps.bat
```

### PowerShell directo

```powershell
.\deploy-vps.ps1
```

### Unix/macOS

```bash
chmod +x deploy-vps-unix.sh
./deploy-vps-unix.sh
```

### Python directo

```bash
python scripts/deploy_vps_direct.py --host TU_IP --user root --domain importaiagent.com --path /var/www/importaiagent
```

## Contrato operativo actual

- la app remota vive en `/var/www/importaiagent`
- el proceso se arranca con `pm2 start ecosystem.config.js --only cotizador --update-env`
- no se despliega `.env.production` falso ni de ejemplo
- los wrappers excluyen secretos y artefactos locales
- el despliegue preserva `data`, `.env.production` y `secure`
- los puertos efectivos deben venir de `.env.production`; los wrappers ya no fuerzan `3000/3002`

## Revision recomendada

Antes de desplegar:

```bash
npm run production:check
npm run lint
npm run client:build
npm test -- --runInBand
```

Despues de desplegar:

```bash
export BASE_URL=http://localhost:PUERTO_REAL
pm2 status cotizador
pm2 logs cotizador --lines 50
curl $BASE_URL/api/monitor/health
```

`BASE_URL` debe apuntar al puerto real definido en `.env.production`.

## Errores comunes

- `JWT_SECRET` debil o ausente: la app no deberia considerarse operativa en produccion.
- `WS_PORT` faltante: el deploy debe detenerse y no improvisar un valor.
- `DOMAIN` o `ALLOWED_ORIGINS` faltantes: CORS queda abierto o bloqueado segun el entorno.
- falta `.env.production` real en el VPS: el deploy debe detenerse, no improvisar un archivo de ejemplo.
- `pm2` levantado con configuracion vieja: vuelve a arrancar con `ecosystem.config.js`.
