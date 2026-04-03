# Conectores De Gobierno

Esta guia resume el contrato vivo de `server/conectores-gobierno.js`.

## Fuente De Verdad

- `server/conectores-gobierno.js`
- `server/index.js`
- `tests/unit/conectores-gobierno.test.js`

## Registro Actual

El modulo exporta conectores para:

- `VUCE`
- `SUNAT`
- `MTC`
- `DIGESA`
- `SENASA`
- `MINAM`
- `PRODUCE`
- `INDECOPI`
- `ADUANET`

Tambien expone:

- `consultarTodo()`
- `limpiarCache()`
- `getCacheStats()`

## Lectura Correcta Del Estado

No todos los conectores significan "API oficial autenticada".

Hoy conviven tres tipos de fuente:

- consulta oficial o scraping directo
- reglas o respuestas locales con cache
- fallback util cuando la fuente real no responde

Por eso este documento no debe etiquetar todo como:

- `disponible sin revision puntual`
- `sin verificacion puntual`

sin mirar el codigo y el endpoint real.

## Endpoints Reales

Rutas expuestas desde `server/index.js`:

- `GET /api/conectores/consultar-todo`
- `GET /api/conectores/sunat/tipo-cambio`
- `GET /api/conectores/sunat/arancel/:partida`
- `GET /api/conectores/vuce/restricciones/:partida`
- `GET /api/conectores/mtc/homologacion`
- `GET /api/conectores/digesa/registro`
- `GET /api/conectores/senasa/permiso`
- `GET /api/conectores/minam/permiso`
- `GET /api/conectores/produce/permiso`
- `GET /api/conectores/indecopi/antidumping`
- `GET /api/conectores/aduanet/arancel/:partida`
- `POST /api/conectores/limpiar-cache`
- `GET /api/conectores/cache-stats`

## Lo Que Si Esta Amarrado Por Tests

- parseo de detalle arancelario ADUANET
- parseo de convenios
- parseo de restricciones
- parseo de descripciones minimas

## Lo Que No Debe Decir Este Documento

- que todos los conectores quedan cubiertos sin revision pendiente
- que todas las entidades tienen fuente oficial disponible sin verificacion puntual
- que una respuesta `pendiente_verificacion` significa bug

## Revision Recomendada

```bash
npm test -- --runInBand tests/unit/conectores-gobierno.test.js
npm test -- --runInBand tests/integration/api.test.js
```
