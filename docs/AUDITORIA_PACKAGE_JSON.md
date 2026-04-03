# Auditoria De package.json

## Objetivo

Usar `package.json` como contrato vivo del proyecto, no como folleto desactualizado.

Este archivo se debe leer junto con:

- `package.json`
- `package-lock.json`
- `scripts/validate-production-env.js`
- `tests/unit/root-manual-scripts.test.js`

## Que Revisar

1. Que los scripts principales sigan siendo ejecutables:
   - `npm run lint`
   - `npm test -- --runInBand`
   - `npm run client:build`
   - `npm run production:check`
2. Que las dependencias declaradas existan realmente en `node_modules`.
3. Que la metadata no arrastre mensajes de marca, rutas o promesas desactualizadas.
4. Que los engines y scripts sigan alineados al repo actual.

## Comandos Utiles

```powershell
npm ls --depth=0
npm audit
node -p "Object.keys(require('./package.json').dependencies).sort()"
node -p "Object.keys(require('./package.json').scripts).sort()"
```

## Criterio De Lectura

No se deben arrastrar en esta guia:

- conteos previos de dependencias
- tamano de `node_modules`
- promesas de entorno operativo sin revisar bloqueantes reales
- versiones externas que cambian con el tiempo

Los datos temporales se verifican con comandos, no con texto desactualizado.

## Estado Esperado

Hoy el archivo debe seguir describiendo:

- backend Express en `server/index.js`
- cliente Vite en `client/`
- suite Jest con `--runInBand` en auditorias estables
- `sql.js` como base SQLite sin compilacion nativa obligatoria
- chequeo explicito de entorno de produccion

## Senales De Deriva

Hay que corregir el documento si vuelve a introducir:

- mojibake
- versiones o conteos desactualizados como contrato vivo
- rutas antiguas de la carpeta de trabajo anterior
- instrucciones que ignoren `production:check`
