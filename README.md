# ImportAIAgent Cotizador

Plataforma privada de cotizacion para operaciones de importacion con:

- flujo conversacional guiado
- soporte documental y OCR opcional
- consulta oficial en vivo con trazabilidad de fuente
- dashboard historico con lectura operativa
- panel admin para comunidades cerradas

## Estado actual

- Backend `Express` + cliente `Vite/React`
- Suite automatica estable
- Wrappers de despliegue alineados a `importaiagent`
- OCR oficial y conectores externos opcionales

## Arranque local

```bash
npm install
npm run client:install
node start-local.js
```

Si prefieres un arranque directo:

```bash
node server/index.js
```

## Smoke local

Usa siempre el puerto efectivo anunciado por `start-local.js`.
Como referencia operativa, piensa la base local como `http://localhost:PUERTO_REAL`.

Rutas base de referencia:

```text
/
/api/health
/api/monitor/health
```

El dashboard y el panel admin requieren login; no deben evaluarse como lectura publica sin autenticacion.

## Revision antes de despliegue

```bash
npm run production:check
npm run lint
npm run client:build
npm test -- --runInBand
node test-produccion.js
```

## Despliegue

Wrappers vigentes:

- Windows: `deploy-vps.bat`
- PowerShell: `deploy-vps.ps1`
- Unix/macOS: `deploy-vps-unix.sh`
- Python directo: `scripts/deploy_vps_direct.py`

Todos apuntan al flujo moderno de `importaiagent`, usan `ecosystem.config.js` y preservan `data`, `.env.production` y `secure`.

## Requisitos operativos

- `WS_PORT` real para el canal WebSocket
- `JWT_SECRET` fuerte
- `DOMAIN` o `ALLOWED_ORIGINS`
- credenciales externas solo si quieres OCR oficial, tracking real o agregadores de flete

## Documentacion relacionada

- [docs/PRUEBA_PRODUCCION.md](docs/PRUEBA_PRODUCCION.md)
- [DEPLOY.md](DEPLOY.md)
- [URLS_LOCAL.md](URLS_LOCAL.md)
- [docs/ARQUITECTURA_VALIDACION_OFICIAL_IMPORTACION_2026.md](docs/ARQUITECTURA_VALIDACION_OFICIAL_IMPORTACION_2026.md)
- [docs/FLETES_API.md](docs/FLETES_API.md)
