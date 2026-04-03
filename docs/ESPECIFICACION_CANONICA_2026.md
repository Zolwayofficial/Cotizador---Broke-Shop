# Especificacion Canonica 2026

Este documento resume el contrato vivo del proyecto sin arrastrar mensajes de marca,
rutas locales desactualizadas ni promesas antiguas.

## Proposito

La prioridad canonica del producto es:

1. cotizacion conversacional
2. calculo operativo de importacion
3. soporte documental
4. dashboard secundario
5. panel admin para comunidad privada

## Fuente De Verdad

- `server/index.js`
- `server/agente-conversador.js`
- `server/agente.js`
- `server/sistema-agentes.js`
- `server/dashboard/dashboard-service.js`
- `client/src/App.jsx`

## Puertos Y Arranque

El arranque local sale del codigo, no de fotos desactualizadas.

- app local por defecto: `3000`
- WebSocket por defecto: `3002`
- script recomendado: `node start-local.js`

No deben reaparecer como contrato:

- `3001` como verdad universal
- rutas de la carpeta de trabajo anterior
- mensajes de marca antiguos arrastrados

## Superficies Principales

### Cotizador

- home principal
- chat guiado
- resumen capturado
- resultado de cotizacion
- soporte documental

### Dashboard

- vista secundaria
- lectura de historial real
- no inventa datos cuando no hay historial
- distingue entre dato ausente y `0` real

### Panel Admin

- gestion de miembros
- aprobacion, suspension, rol y reseteo
- revisiones explicitas para acciones sensibles

## Contrato Del Chat

- debe conservar `mensaje + pregunta` si el backend devuelve ambos
- no debe dejar visible un resultado anterior cuando cambia el borrador
- debe distinguir entre aclaracion y correccion
- debe mostrar estados pendientes en vez de inventar defaults operativos

## Contrato Del Resultado

La salida de cotizacion puede incluir:

- items
- metadata del caso
- alertas
- permisos
- precision
- consulta oficial
- perfil de importacion
- regimen
- totales

No debe mezclarse con:

- KPIs de dashboard
- widgets de tendencia
- agregados desactualizados

## Contrato Del Dashboard

Debe construirse desde historial real y mostrar:

- `meta`
- `kpis`
- `graficos`
- `tops`
- `alertas`
- lectura ejecutiva opcional

Si no hay datos o una fuente falla:

- usar `N/D`, `Sin datos` o mensaje explicito
- no pintar ceros ficticios
- no dejar paneles vacios sin explicacion

## Registro De Agentes

El total de agentes debe leerse desde:

- `server/sistema-agentes.js`
- `/api/agentes/stats`

No fijes el numero a mano en este documento.

## Entorno Y Produccion

La salida tecnica actual para revisar antes de desplegar es:

```bash
npm run production:check
npm run lint
npm run client:build
npm test -- --runInBand
```

Hoy siguen siendo bloqueantes reales:

- `WS_PORT`
- `JWT_SECRET`
- `DOMAIN` o `ALLOWED_ORIGINS`

## Regla De Oro

Cuando choque un documento desactualizado con el codigo actual, manda este orden:

1. comportamiento real del codigo
2. tests actuales
3. documentacion canonicamente actualizada
4. fotos desactualizadas

## Referencias

- `README.md`
- `DEPLOY.md`
- `docs/PRUEBA_PRODUCCION.md`
- `docs/AUDITORIA_FINAL.md`
