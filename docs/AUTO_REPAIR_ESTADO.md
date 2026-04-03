# Estado De Auto-Repair

Este archivo conserva el nombre anterior, pero ya no debe usarse como foto
puntual del sistema.

## Lectura Correcta

Lo importante no es un porcentaje aislado, sino:

- si `server/auto-repair.js` inicializa bien
- si las tablas existen
- si los endpoints administrativos responden
- si los tests de regresion siguen pasando

## Fuente De Verdad

- `server/auto-repair.js`
- `tests/unit/auto-repair.test.js`
- `tests/integration/api.test.js`

## Estado Actual

`auto-repair` esta integrado como modulo real del backend, pero sigue siendo una
capa de soporte. No convierte el sistema en infalible ni sustituye pruebas,
fallbacks o monitoreo.

## Checklist Real

- `db.init()` antes de `autoRepair.init()`
- serializacion segura de contexto y conocimiento
- patrones por agente y tipo de error
- endpoints protegidos por `auth.requireAuth` y `auth.requireAdmin`
- regresiones unitarias e integracion para casos criticos

## Verificacion

```bash
npm test -- --runInBand tests/unit/auto-repair.test.js
npm test -- --runInBand tests/integration/api.test.js
```

Si esas pruebas pasan, el estado operativo vale mas que cualquier promesa
escrita.
