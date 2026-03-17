# URLs locales

## Arranque correcto

El servidor local real de este proyecto corre en `http://localhost:3000` por defecto.

Usa uno de estos comandos desde `C:\Users\Billy\AppData\Local\Programs\Antigravity\cotizador`:

```powershell
node server/index.js
```

o:

```powershell
node start-local.js
```

Tambien puedes abrir:

```powershell
arrancar-local.bat
```

## URLs principales

Frontend y API:

```text
http://localhost:3000
http://127.0.0.1:3000
```

Health check:

```text
http://localhost:3000/api/health
```

Dashboard:

```text
http://localhost:3000/api/dashboard
```

WebSocket:

```text
ws://localhost:3002
```

## Nota sobre puertos

- `3000` es el puerto local por defecto del servidor Express.
- `3002` es el puerto del WebSocket.
- `3001` solo debe usarse si configuras `PORT=3001` en tu entorno o en produccion detras de Nginx.

## Si el navegador muestra ERR_CONNECTION_REFUSED

Eso significa que no hay ningun proceso escuchando en `localhost:3000`.

Verifica primero:

```powershell
node server/index.js
```

Cuando en consola aparezca `Server:  http://localhost:3000`, recien abre el navegador.

## Pruebas rapidas

```powershell
curl http://localhost:3000/api/health
curl http://localhost:3000/api/dashboard
```
