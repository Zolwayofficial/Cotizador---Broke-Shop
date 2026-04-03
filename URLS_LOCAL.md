# URLs locales

## Carpeta de trabajo actual

```text
C:\Users\Billy\OneDrive\Documentos\Playground\Cotizador---Broke-Shop
```

## Arranque recomendado

```powershell
node start-local.js
```

Alternativas utiles:

```powershell
node server/index.js
arrancar-local.bat
```

## Puertos

- App HTTP: usa `PORT` si esta definido; si no, el valor local por defecto suele ser `3000`
- WebSocket: usa `WS_PORT` si esta definido; si no, el valor local por defecto suele ser `3002`

La referencia correcta siempre es el puerto que anuncia `start-local.js` al arrancar.

## Rutas utiles

Usa placeholders ligados al puerto real:

```text
BASE_URL=http://localhost:PUERTO_REAL
WS_URL=ws://localhost:WS_PORT_REAL

%BASE_URL%/
%BASE_URL%/api/health
%BASE_URL%/api/monitor/health
%WS_URL%
```

Reemplaza `PUERTO_REAL` y `WS_PORT_REAL` por los valores anunciados por `start-local.js`.

El dashboard y el panel admin requieren iniciar sesion; no debes probarlos como si fueran endpoints publicos sin token.

## Smoke rapido

```powershell
curl %BASE_URL%/api/health
curl %BASE_URL%/api/monitor/health
node test-produccion.js
```
