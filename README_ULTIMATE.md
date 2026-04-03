# ImportAIAgent Cotizador - Panorama Ejecutivo

Este archivo queda como panorama ejecutivo del proyecto. La referencia
operativa viva sigue siendo:

- `README.md` para arranque y alcance actual
- `DEPLOY.md` para despliegue
- `docs/PRUEBA_PRODUCCION.md` para smoke y revision

## Que es hoy

Este repositorio es la base privada de `ImportAIAgent`: un cotizador de
importacion para una comunidad cerrada con:

- flujo conversacional guiado
- carga y lectura de documentos del proveedor
- calculo tributario y logistico
- consulta oficial y trazabilidad de fuente
- dashboard de actividad
- panel admin para control de acceso

## Principios del sistema

- El calculo principal debe salir de reglas deterministicas, no de texto libre.
- La IA agrega apoyo, lectura ejecutiva y asistencia conversacional.
- Los conectores oficiales deben dejar trazabilidad de origen, fecha y nivel de
  confianza.
- El dashboard no debe inventar cifras cuando el dato falta o una carga falla.
- El panel admin debe privilegiar acciones explicitas y auditables.

## Arquitectura actual

La app corre sobre `server/index.js` y se apoya en modulos especializados para:

- clasificacion y doctrina arancelaria
- permisos y regimenes
- memoria y auto-repair
- OCR e ingestion documental
- dashboard y monitor
- autenticacion y membresias
- agentes de navegacion y consulta oficial

Los conteos puntuales de agentes, endpoints, modulos y fuentes pueden cambiar con
el tiempo. Por eso este archivo evita fijar cifras desactualizadas a mano.

## Flujo de trabajo recomendado

### Desarrollo local

```bash
npm install
npm run client:install
node start-local.js
```

### Revision local

```bash
npm run lint
npm test -- --runInBand
npm run client:build
npm run production:check
```

### Despliegue

Usa uno de estos flujos documentados:

- `deploy-vps.ps1`
- `deploy-vps-unix.sh`
- `scripts/deploy_vps_direct.py`

El contrato vigente de despliegue depende de `.env.production`,
`ecosystem.config.js` y la ruta remota `/var/www/importaiagent`.

## Salud operativa

Health checks utiles:

- `/api/health`
- `/api/monitor/health`

Las pantallas privadas como dashboard y panel admin requieren sesion autenticada.

## Estado de esta guia

Este documento ya no pretende ser una ficha comercial con nombres de version,
conteos congelados o slogans desactualizados. Su funcion es resumir la direccion tecnica
del proyecto sin contradecir el codigo ni la documentacion operativa viva.
