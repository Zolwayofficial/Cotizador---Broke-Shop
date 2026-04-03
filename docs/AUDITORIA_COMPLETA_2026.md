# Auditoria completa 2026

Esta guia aterriza la auditoria del proyecto al criterio operativo actual de
2026. No es una referencia de trabajo ni una fotografia inmovil del sistema.

## Objetivo

Tener una forma clara de revisar si el repo sigue alineado con su contrato
actual:

- calculo deterministico en lo critico
- cliente que no inventa datos ausentes
- deploy consistente
- documentacion sin contratos desactualizados

## Comprobaciones minimas

```bash
npm run lint
npm test -- --runInBand
npm run client:build
npm run production:check
```

## Como leer el resultado

### Auditoria tecnica razonable

- tests completos en verde
- build del cliente en verde
- sin errores de parseo o arranque en scripts operativos

### Auditoria operativa razonable

- `production:check` solo marca:
  - `WS_PORT`
  - `JWT_SECRET`
  - `DOMAIN` o `ALLOWED_ORIGINS`
  - advertencias operativas ya conocidas

## Errores de lectura que este documento evita

- asumir que una cifra desactualizada de endpoints o agentes sigue siendo actual
- confundir advertencia operativa con bug de codigo
- confundir build sin error visible con cumplimiento real de requisitos de produccion

## Referencias vivas

- `README.md`
- `DEPLOY.md`
- `docs/PRUEBA_PRODUCCION.md`
- `docs/AUDITORIA_FINAL.md`

## Mantenimiento

Si cambia el contrato del sistema, este archivo debe actualizarse. No debe
volver a listar conteos, rankings ni slogans desactualizados.
