# Prueba completa de produccion

Fecha: 2026-03-24
Estado: guia operativa alineada al contrato actual

## Objetivo

Esta guia revisa el sistema real antes de un despliegue o despues de cambios sensibles.
No reemplaza la suite automatica; la complementa con smoke manual y verificacion operativa.

Orden recomendado:

1. Revisar entorno
2. Ejecutar pruebas automatizadas
3. Levantar servidor local
4. Probar endpoints base con autenticacion
5. Ejecutar smoke manual de produccion

## Fase 1: Revisar entorno

```bash
npm run production:check
```

Resultado esperado:

- puede mostrar advertencias operativas opcionales
- no debe dejar bloqueantes sin resolver en:
  - `WS_PORT`
  - `JWT_SECRET`
  - `DOMAIN` o `ALLOWED_ORIGINS`

## Fase 2: Suite automatica

```bash
npm run lint
npm run client:build
npm test -- --runInBand
```

Resultado esperado:

- lint ok
- build ok
- toda la suite en verde

## Fase 3: Arranque local

```bash
node start-local.js
```

Resultado esperado:

- el servidor levanta sin errores fatales
- el banner anuncia las rutas reales del puerto efectivo
- el arranque debe anunciar `WS_PORT` y el servidor debe usarlo

## Fase 4: Endpoints base

Muchos endpoints sensibles requieren autenticacion. Exportacion, dashboard, agentes y alertas no deben probarse sin token.

```bash
set AUTH_TOKEN=pega_aqui_tu_token
set BASE_URL=http://localhost:PUERTO_REAL

curl %BASE_URL%/api/health
curl %BASE_URL%/api/monitor/health

curl %BASE_URL%/api/agentes/stats ^
  -H "Authorization: Bearer %AUTH_TOKEN%"

curl %BASE_URL%/api/alertas/stats ^
  -H "Authorization: Bearer %AUTH_TOKEN%"

curl -X POST %BASE_URL%/api/exportar/pdf ^
  -H "Authorization: Bearer %AUTH_TOKEN%" ^
  -H "Content-Type: application/json" ^
  -d "{\"id\":\"cot_test_001\",\"producto\":\"Laptops HP\",\"pais_origen\":\"US\",\"incoterm\":\"EXW\",\"total_landed\":58625}"
```

Resultado esperado:

- `BASE_URL` apunta al puerto real que anuncio `start-local.js`
- `/api/health` responde `200`
- `/api/monitor/health` responde `200`
- agentes, alertas y exportacion responden autenticados
- sin token, esos endpoints protegidos deben devolver `401` o `403`

## Fase 5: Smoke manual de produccion

```bash
node test-produccion.js
```

Este smoke recorre:

- carga de modulos
- ajuste de Incoterms
- exportacion PDF y Excel
- documentacion, recomendaciones y apuntes
- inicializacion de agentes
- inicializacion de alertas
- rendimiento basico de exportacion

Resultado esperado:

- termina con `Todas las pruebas manuales pasaron.`

## Fase 6: Contrato de exportacion

```javascript
const exportacion = require('./server/exportar-cotizacion');

const pdf = exportacion.exportarCotizacion(cotizacion, 'pdf');
const excel = exportacion.exportarCotizacion(cotizacion, 'excel');
const docs = exportacion.generarDocumentacion(cotizacion);
const recs = exportacion.generarRecomendaciones(cotizacion);
const apuntes = exportacion.generarApuntes(cotizacion);
```

Resultado esperado:

- PDF y Excel se generan sin lanzar excepciones
- los arreglos de documentacion, recomendaciones y apuntes se reciben como listas utilizables

## Fase 7: Agentes y alertas

```javascript
const agentesNavegacion = require('./server/agentes-navegacion');
const alertasNormativas = require('./server/alertas-normativas');

async function smoke() {
  await agentesNavegacion.init();
  const statsAgentes = agentesNavegacion.obtenerEstadisticasGenerales();
  console.log(statsAgentes.total_agentes);

  await alertasNormativas.init();
  const statsAlertas = alertasNormativas.obtenerEstadisticas();
  console.log(statsAlertas);
}

smoke();
```

Resultado esperado:

- `agentesNavegacion.init()` no falla
- `statsAgentes.total_agentes` existe
- `alertasNormativas.obtenerEstadisticas()` devuelve un objeto utilizable

## Criterio operativo

Se puede pasar al siguiente control operativo si:

- `production:check` no deja bloqueantes
- lint, build y tests pasan
- `test-produccion.js` termina en verde
- el arranque local y los endpoints base responden como se espera

Requiere ajustes si:

- hay fallos en smoke manual
- hay contratos desalineados entre scripts, docs y servidor
- hay warnings convertidos en lectura enganosa o falsos positivos operativos

Detener y corregir si:

- hay errores criticos
- el servidor no inicia
- los endpoints base no responden
- exportacion o autenticacion fallan en rutas protegidas

## Notas

- el dashboard y la exportacion protegida requieren autenticacion
- las cifras de agentes, endpoints o capacidades deben tomarse del sistema real y no de conteos desactualizados copiados a mano
- si actualizas contratos de smoke, actualiza tambien:
  - `test-produccion.js`
  - `start-local.js`
  - esta guia
