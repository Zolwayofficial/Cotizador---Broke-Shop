# Mejoras de robustez vigentes

Este documento resume mejoras tecnicas que siguen siendo utiles para operar el
proyecto hoy. No pretende congelar tiempos, conteos ni cifras historicas.

La referencia viva del despliegue y la revision operativa es:

- `README.md`
- `DEPLOY.md`
- `docs/PRUEBA_PRODUCCION.md`

## Objetivo

Mantener el cotizador estable frente a:

- documentos defectuosos o ambiguos
- respuestas parciales de fuentes oficiales
- fallos intermitentes de conectores
- estados visuales enganiosos en dashboard y workspace
- despliegues que mezclen secretos o contratos viejos

## Mejoras que siguen activas

### Backend

- `auto-repair` y `memoria-hibrida` normalizan entradas y toleran payloads
  incompletos sin romper aprendizaje ni estadisticas.
- los conectores oficiales y regulatorios distinguen entre:
  - dato real
  - dato ausente
  - error de fuente
- la clasificacion arancelaria ya no acepta HS vacios tipo `0000.00.00.00`
  como clasificacion util.
- la ingestion documental normaliza items, filtra entradas rotas y trata OCR
  vacio como fallo real, no como resultado favorable.
- `startServer()` y el ciclo de vida del servidor ya evitan carreras de inicio y
  anuncian el puerto real de escucha.

### Cliente

- el dashboard diferencia entre `sin datos` y `error de carga`.
- los graficos no convierten series rotas o parciales en ceros aparentes.
- el resumen del workspace y la lectura del resultado ya no inventan defaults de
  negocio cuando el backend no mando ese dato.
- el panel admin distingue carga, error, vacio real y mutacion en curso.
- el chat conserva `mensaje + pregunta` del backend sin perder una de las dos.

### Operacion y deploy

- los wrappers de deploy ya no fuerzan `PORT=3000`.
- los deploys modernos preservan `data`, `.env.production`, `secure/` y otros
  recursos que no deben mezclarse con el paquete.
- los scripts Python de despliegue ya no embeben la clave del VPS.
- `production:check` concentra los bloqueantes reales de entorno para evitar
  despliegues "verdes" pero inseguros.

## Bloqueantes de entorno que siguen importando

Mientras no se configuren, el sistema no deberia considerarse operativo sin
reservas en este frente:

- `JWT_SECRET` fuerte
- `WS_PORT` real para el canal WebSocket
- `DOMAIN` o `ALLOWED_ORIGINS`

## Advertencias operativas conocidas

Estas no rompen el sistema base, pero dejan capacidades limitadas:

- `EMAIL_FROM`
- `TRACK17_API_KEY`
- agregadores reales de courier o flete
- `AFTERSHIP_TOKEN`

## Como comprobar la robustez actual

```bash
npm run lint
npm test -- --runInBand
npm run client:build
npm run production:check
```

## Nota

Si aparece una mejora nueva, este archivo debe actualizarse solo si sigue
siendo una mejora vigente del sistema actual. Las cifras comerciales, rankings o
comparativas historicas deben quedarse fuera de esta guia.
