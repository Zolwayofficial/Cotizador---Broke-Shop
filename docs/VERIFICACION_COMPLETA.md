# Verificacion completa util

Esta guia resume que significa verificar el proyecto hoy sin caer en fotos
desactualizadas.

## Verificacion minima

```bash
npm run lint
npm test -- --runInBand
npm run client:build
npm run production:check
```

## Resultado esperado

- lint limpio
- suite completa limpia
- cliente compilando
- `production:check` con solo estos bloqueantes:
  - `WS_PORT`
  - `JWT_SECRET`
  - `DOMAIN` o `ALLOWED_ORIGINS`

## Advertencias esperables

- `EMAIL_FROM`
- `TRACK17_API_KEY`
- sin APIs reales de flete
- sin agregadores de courier
- `AFTERSHIP_TOKEN`

## Lo que esta verificacion no debe volver a prometer

- que hay un numero previo de endpoints o agentes
- que todo cumple requisitos de produccion por una foto desactualizada
- que una URL local anterior describe siempre el contrato real

## Cuando usar esta guia

- antes de desplegar
- despues de una tanda grande de cambios
- al cerrar una auditoria por bloques

## Referencias vivas

- `docs/PRUEBA_PRODUCCION.md`
- `docs/AUDITORIA_FINAL.md`
- `README.md`
- `DEPLOY.md`
