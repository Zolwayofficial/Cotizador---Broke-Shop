# Auditoria final util

Este archivo queda como cierre operativo breve, no como referencia de trabajo.

## Que debe comprobar una auditoria final aqui

- que `npm run lint` pase
- que `npm test -- --runInBand` pase
- que `npm run client:build` pase
- que `npm run production:check` solo marque:
  - bloqueantes reales de entorno
  - advertencias operativas conocidas

## Bloqueantes de entorno que importan hoy

- `WS_PORT` real para el servidor y el proxy WebSocket
- `JWT_SECRET` fuerte
- `DOMAIN` o `ALLOWED_ORIGINS`

## Advertencias que no bloquean el sistema base

- `EMAIL_FROM`
- `TRACK17_API_KEY`
- agregadores reales de courier o flete
- `AFTERSHIP_TOKEN`

## Lo que no debe volver a hacer esta guia

- tratar la cantidad de endpoints, agentes o paquetes como si no cambiara
- repetir rutas antiguas de despliegue
- sugerir arranques crudos saltandose `ecosystem.config.js`
- presentar el entorno como operativo ignorando bloqueantes de entorno

## Referencias vivas

- `README.md`
- `DEPLOY.md`
- `docs/PRUEBA_PRODUCCION.md`
- `.github/workflows/ci-cd.yml`

## Cierre

Una auditoria final solo vale si refleja el estado actual del repo y del
entorno. Si estos contratos cambian, este documento tambien debe cambiar.
