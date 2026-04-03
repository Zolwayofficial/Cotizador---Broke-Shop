# Diagnostico Operativo De Agentes

Esta guia sirve para revisar el estado real del sistema multiagente sin caer en
conteos anteriores ni reportes desactualizados.

## Fuente De Verdad

- `server/sistema-agentes.js`
- `server/agente.js`
- `server/agentes-navegacion/index.js`
- `tests/unit/sistema-agentes.test.js`

## Chequeos Basicos

### 1. Suite Local

```bash
npm run lint
npm run client:build
npm test -- --runInBand
```

### 2. Resumen Del Sistema

```bash
node test-sistema-unificado.js
```

Ese smoke debe leer el total real desde `stats.total_agentes`.

### 3. Estado Del Backend

```bash
GET /api/monitor/health
GET /api/agentes/stats
```

`/api/agentes/stats` es la mejor vista para revisar:

- total real de agentes
- desglose por categoria
- estado de memoria
- estadisticas de conectores oficiales
- estado de auto-repair

## Diagnostico Por Zona

### Conversacion

Revisar:

- `server/agente-conversador.js`
- `server/agente-conversador-flow.js`
- `tests/unit/agente-conversador.test.js`
- `tests/unit/agente-conversador-flow.test.js`

Senales de fallo:

- el chat pierde la aclaracion y muestra solo la pregunta siguiente
- una correccion libre termina en el campo equivocado
- el cliente deja visible un resultado anterior despues de editar el borrador

### Agentes Base

Revisar:

- `server/agente.js`
- `server/clasificador.js`
- `server/permisos.js`
- `server/regimenes.js`
- `server/cotizacion-precision.js`

Senales de fallo:

- clasificacion con HS vacio tratado como util
- `0` real sustituido por defaults
- regimen o precision renderizados como si fueran completos cuando faltan datos

### Navegacion Oficial

Revisar:

- `server/agentes-navegacion/index.js`
- `server/agentes-navegacion/*.js`
- `server/memoria-hibrida.js`

Senales de fallo:

- `404` o `500` tratados como respuesta favorable
- cache que oculta vacios o errores
- estadisticas que muestran agentes "pendientes" aunque el registro exista

## Errores Que No Deben Confundirse Con Bugs De Codigo

`npm run production:check` puede seguir fallando por entorno si faltan:

- `WS_PORT`
- `JWT_SECRET`
- `DOMAIN` o `ALLOWED_ORIGINS`

Eso no significa que el motor multiagente este roto; significa que el entorno
todavia no cumple requisitos de produccion.

## Referencias

- `docs/AGENTES_17.md`
- `docs/AGENTES_NAVEGACION.md`
- `docs/AUDITORIA_FINAL.md`
