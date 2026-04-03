# Auto-Repair

Esta guia describe el sistema de auto-repair como contrato operativo, no como
ideal de perfeccion.

## Fuente De Verdad

- `server/auto-repair.js`
- `server/db.js`
- `server/index.js`
- `tests/unit/auto-repair.test.js`

## Que Hace

`auto-repair` registra fallos, soluciones, patrones y conocimiento reusable
para endurecer modulos fragiles del backend.

Hoy cubre capacidades como:

- registrar fallos con contexto serializable
- registrar soluciones aplicadas o fallidas
- aprender patrones por agente y tipo de error
- guardar conocimiento persistente por clave
- ejecutar operaciones con reintentos y fallback controlado

## Tablas Principales

- `agent_failures`
- `agent_solutions`
- `agent_patterns`
- `agent_knowledge`

Todas se crean en `init()` y dependen de que la base de datos ya este
inicializada.

## Endpoints

Rutas reales expuestas desde `server/index.js`:

- `GET /api/auto-repair/stats`
- `GET /api/auto-repair/patrones/:agente`
- `GET /api/auto-repair/knowledge/:agente/:clave`
- `POST /api/auto-repair/knowledge`
- `POST /api/auto-repair/cleanup`
- `POST /api/auto-repair/test`

Estas rutas son administrativas y requieren autenticacion.

## Reglas Que Ya Estan Amarradas

- un contexto circular no debe romper el registro de fallo
- un `BigInt` no debe romper el guardado de conocimiento
- `confidence = 0` debe conservarse como `0`, no ser pisado
- un reintento solo cuenta como resuelto si realmente funciono
- la limpieza debe normalizar dias fuera de rango

## Que No Debe Decir Este Documento

- que el sistema puede darse por cubierto ignorando bloqueantes reales
- que todos los fallos se corrigen solos
- que la tasa interna de resolucion puede leerse aislada del contexto
- que el modulo reemplaza monitoreo o pruebas

## Revision Recomendada

```bash
npm test -- --runInBand tests/unit/auto-repair.test.js
npm test -- --runInBand tests/integration/api.test.js
```

## Referencias

- `docs/AUDITORIA_FINAL.md`
- `docs/ESPECIFICACION_CANONICA_2026.md`
