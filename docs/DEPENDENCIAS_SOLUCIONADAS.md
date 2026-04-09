# Dependencias Solucionadas

## Nota

El nombre de este archivo conserva un nombre anterior. No debe usarse como prueba aislada de que "todo esta resuelto".

## Decision Actual

El proyecto opera con:

- `sql.js` para SQLite sin compilacion nativa obligatoria
- dependencias de backend definidas en `package.json`
- revision real por `npm ls --depth=0`, `npm run lint`, `npm test -- --runInBand` y `npm run client:build`

## Lo Importante

Hoy el contrato real es este:

- no dependemos de una compilacion nativa obligatoria para la DB
- `server/db.js` esta construido alrededor de `sql.js`
- la compatibilidad estilo `better-sqlite3` es de API interna, no una promesa de fallback nativo en produccion

## Verificacion Minima

```powershell
npm ls --depth=0
node --check server/db.js
npm test -- --runInBand tests/unit/db.test.js
```

## Cuando Actualizar Este Documento

Actualizalo si cambia alguno de estos puntos:

- motor principal de persistencia
- scripts de instalacion
- set de dependencias directas
- criterios de compatibilidad de Node.js

No lo uses para tratar comparativas desactualizadas como si siguieran siendo actuales.
