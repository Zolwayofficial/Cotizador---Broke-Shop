# Matriz de APIs e Integraciones 2026

Este documento separa tres cosas:

1. Que integraciones puedo investigar, documentar y dejar listas en el codigo.
2. Que credenciales o convenios debes crear tu.
3. Que partes del proyecto hoy son API real, tracking o scraping/fallback.

## Resumen rapido

### Yo puedo dejarte listo

- Conectar el codigo a la variable de entorno correcta.
- Ajustar endpoints, cabeceras y payloads segun documentacion oficial.
- Preparar fallbacks y validaciones cuando falte una credencial.
- Probar que la integracion responde bien cuando pongas la key.
- Documentar el flujo exacto de alta y uso.

### Tu debes crear o conseguir

- API keys privadas.
- Cuentas de proveedor.
- Credenciales de empresa o negocio.
- Credenciales SOL o registros oficiales cuando el portal del gobierno lo exija.
- Convenios comerciales si la plataforma no ofrece acceso self-service.

## Matriz canonica

| Servicio | Uso real en el proyecto | Estado oficial confirmado | Variable en el repo | Quien consigue acceso | Nota honesta |
| --- | --- | --- | --- | --- | --- |
| Groq | IA para clasificacion, dashboard y chat | API oficial con key privada | `GROQ_API_KEY` | Tu | Yo no puedo generar tu key; se obtiene desde tu cuenta de Groq. |
| Shippo | Cotizacion multi-courier real | API oficial publica | `SHIPPO_TOKEN` | Tu | Buena opcion para rates reales; el repo ya la soporta. |
| EasyPost | Cotizacion multi-courier real | API oficial publica | `EASYPOST_TOKEN` | Tu | Muy buena opcion para rates reales; el repo ya la soporta. |
| AfterShip | Tracking y directorio de couriers | API oficial publica | `AFTERSHIP_TOKEN` | Tu | Sirve para tracking; no es una solucion real de rates en este repo. |
| 17TRACK | Tracking universal | API oficial publica | `TRACK17_API_KEY` | Tu | Util para tracking; no resuelve cotizaciones multi-courier. |
| TrackingMore | Tracking | API oficial publica | `TRACKINGMORE_API_KEY` | Tu | En el repo aparece en `flete-api`, pero hoy no entrega rates reales ahi. |
| SeaRates | Freight maritimo/logistica | API oficial publica | `SEARATES_API_KEY` | Tu | Requiere cuenta; mejor para freight que para courier liviano. |
| Interparcel | Agregador logistico | API oficial publica encontrada | `INTERPARCEL_TOKEN` | Tu | Hay pagina oficial para developers; el acceso sigue dependiendo de cuenta. |
| ParcelMonkey | Agregador logistico | No confirme docs publicas claras en esta pasada | `PARCELMONKEY_TOKEN` | Tu | Puede requerir acuerdo comercial o acceso no publico. |
| SUNAT SOL + APIs CPE/SIRE | APIs oficiales SUNAT por servicio | Acceso oficial confirmado via SOL y endpoints SUNAT | No parametrizado aun en el repo | Tu | No uses `apiportal.sunat.gob.pe`; hoy lo correcto es generar credenciales dentro de SOL y consumir endpoints oficiales por servicio. |
| SUNAT paginas publicas | Tipo de cambio y consultas publicas | Portal publico oficial | Sin key | Yo | Esto si puedo integrarlo via scraping/control de fallos donde aplique. |
| ADUANET | Aranceles/consulta de partidas | Portal publico oficial | Sin key | Yo | En esta pasada no confirme REST publica; hoy conviene scraping + NANDINA. |
| OLCE API (MINCETUR) | API oficial relacionada a comercio exterior | Portal y solicitud de API key confirmados | No parametrizado aun en el repo | Tu | Buen candidato oficial para integrar mas data sin scraping. |
| VUCE portal | Tramites y restricciones | Portal oficial confirmado | Sin key directa hoy | Mixto | No confirme una API publica equivalente a lo que hoy hace el agente; hoy sigue mejor con scraping/fallback. |
| INDECOPI / MTC / DIGESA / SENASA / MINAM / PRODUCE | Restricciones, registros y permisos | Portales oficiales si; APIs publicas claras no confirmadas en esta pasada | Sin key hoy | Mixto | Lo realista hoy es scraping dirigido o reglas locales, salvo que tu entidad/empresa tenga acceso formal. |

## Lo que recomiendo activar primero

### Imprescindible

1. `GROQ_API_KEY`
2. `SHIPPO_TOKEN` o `EASYPOST_TOKEN`
3. `TRACK17_API_KEY`

### Muy recomendables

1. `SEARATES_API_KEY` si haras maritimo real.
2. `EMAIL_SMTP_HOST`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM`
3. `INTERPARCEL_TOKEN` si quieres otro agregador adicional.

### Opcionales o de siguiente fase

1. `AFTERSHIP_TOKEN`
2. `TRACKINGMORE_API_KEY`
3. `PARCELMONKEY_TOKEN`
4. Integracion mas formal con SUNAT SOL APIs u OLCE API.

## Lectura honesta del codigo actual

### Lo que ya esta realmente listo para conectar

- `server/ai-proxy.js`
- `server/dashboard/dashboard-service.js`
- `server/index.js`
- `server/tracking.js`
- `server/couriers/integrador-logistica.js`

### Lo que hoy esta en modo aspiracional o fallback

- `server/flete-api.js`: `TrackingMore` y `SeaRates` estan modelados, pero hoy la ruta real termina cayendo a fallback referencial.
- `server/couriers/integrador-logistica.js`: `AfterShip` esta tratado como tracking/directorio, no como cotizador real.
- `server/conectores-gobierno.js`: mezcla scraping, cache y fuentes auxiliares; no todo es API oficial autenticada.

## Fuentes oficiales consultadas

- Groq Docs: <https://console.groq.com/docs/overview>
- Shippo API: <https://docs.goshippo.com/shippoapi/public-api/>
- EasyPost Rates: <https://docs.easypost.com/docs/shipments/rates>
- AfterShip Tracking Docs: <https://www.aftership.com/docs/tracking>
- 17TRACK API: <https://developers.17track.net/en>
- TrackingMore Docs: <https://www.trackingmore.com/docs/tracking/tracking-api>
- SeaRates Docs: <https://docs.searates.com/reference/introduction>
- Interparcel Developers: <https://uk.interparcel.com/developers/api>
- SUNAT SOL login: <https://api-seguridad.sunat.gob.pe/oauth2/login>
- SUNAT servicios web y manuales: <https://orientacion.sunat.gob.pe/guias-manuales-y-servicios-web>
- SUNAT manual de Consulta Integrada API: <https://cpe.sunat.gob.pe/sites/default/files/inline-files/Manual-de-Consulta-Integrada-de-Comprobante-de-Pago-por-ServicioWEB_v2_0.pdf>
- OLCE API / MINCETUR: <https://olce.mincetur.gob.pe/olceapi/>
- VUCE Peru: <https://www.vuce.gob.pe/>

## Proxima accion recomendada

Primero crea o consigue estas credenciales:

- `GROQ_API_KEY`
- `SHIPPO_TOKEN` o `EASYPOST_TOKEN`
- `TRACK17_API_KEY`
- SMTP basico

Luego me las pasas o las colocas en `.env.production`, y yo te dejo la activacion real, pruebas y smoke de cada integracion.
