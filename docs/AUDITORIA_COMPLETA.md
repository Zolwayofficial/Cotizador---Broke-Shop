# Auditoria completa util

Este documento resume como interpretar una auditoria amplia del repositorio sin
convertirla en una foto desactualizada y enganosa.

## Que debe cubrir una auditoria completa

- backend critico
- cliente y estados visuales
- scripts de despliegue y backup
- documentacion operativa
- contratos de CI

## Senales de una auditoria sana

- `npm run lint` pasa
- `npm test -- --runInBand` pasa
- `npm run client:build` pasa
- `npm run production:check` solo deja visibles:
  - bloqueantes de entorno reales
  - advertencias operativas conocidas

## Bloqueantes reales de entorno

- `WS_PORT`
- `JWT_SECRET`
- `DOMAIN` o `ALLOWED_ORIGINS`

## Advertencias conocidas que no comprometen el sistema base

- `EMAIL_FROM`
- `TRACK17_API_KEY`
- APIs reales de flete no configuradas
- agregadores de courier no configurados
- `AFTERSHIP_TOKEN`

## Lo que no debe volver a afirmar una auditoria

- cantidades desactualizadas de endpoints, agentes, lineas o paquetes
- rutas antiguas de despliegue
- que todo cumple requisitos de produccion ignorando los bloqueantes de entorno
- comparativas comerciales desactualizadas

## Referencias vivas

- `README.md`
- `DEPLOY.md`
- `docs/PRUEBA_PRODUCCION.md`
- `.github/workflows/ci-cd.yml`
- `scripts/validate-production-env.js`

## Nota

Si una pasada de auditoria detecta cambios reales en el repo, este archivo debe
seguir describiendo el metodo y los criterios, no dejar el resultado como si
nada fuera a cambiar despues.
