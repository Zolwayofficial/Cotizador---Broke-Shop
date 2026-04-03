# Membresias y Comunidad

Este documento resume el contrato operativo actual del modulo de membresias.
La fuente real de comportamiento sigue siendo:

- `server/membresias/membresias-service.js`
- `server/index.js`
- `tests/integration/api.test.js`

## Niveles actuales

| Nivel | Precio | Cotizaciones | Consultas | Dashboard | Soporte |
| --- | --- | --- | --- | --- | --- |
| `GRATIS` | `0` | `5` | `10` | No | Comunidad |
| `PREMIUM` | `29.99` | `50` | `100` | Si | Email |
| `VIP` | `99.99` | Ilimitadas | Ilimitadas | Si | Prioritario |

Los limites salen de `NIVELES` en `server/membresias/membresias-service.js`. Un
valor `-1` representa uso ilimitado.

## Flujo operativo

1. El usuario puede registrarse con o sin codigo de invitacion.
2. Si no tiene fila previa en `membresias`, el sistema crea la base `GRATIS`.
3. Los controles de limite usan los contadores almacenados en `membresias`.
4. Un pago registrado queda pendiente hasta que el estado pase a `pagado`.
5. Cuando un pago pasa a `pagado`, el backend actualiza nivel y vencimiento.

## Endpoints relevantes

### Registro y acceso

- `POST /api/membresias/registro`
- `POST /api/membresias/generar-codigo`
- `GET /api/membresias/mi-membresia`
- `GET /api/membresias/verificar-limite/:tipo`

### Comunidad y administracion

- `GET /api/membresias/miembros`
- `GET /api/membresias/estadisticas`

### Pagos

- `POST /api/membresias/pago`
- `POST /api/membresias/pago/:id/actualizar`

## Notas de implementacion

- `registrarUso()` incrementa contadores de cotizacion o consulta.
- `obtenerEstadisticas()` calcula miembros activos, distribucion por nivel e
  ingresos del mes a partir de pagos `pagado`.
- `listarMiembros()` permite filtrar por `nivel` y `activo`.
- `generarCodigoInvitacion()` crea codigos `INV-XXXXXXXX`.

## Riesgos a no olvidar

- El codigo de invitacion no equivale por si solo a un beneficio final de pago.
- Los documentos o dashboards privados dependen de autenticacion activa.
- Un entorno puede pasar tests y build locales y seguir pendiente de
  `WS_PORT`, `JWT_SECRET` o `DOMAIN` / `ALLOWED_ORIGINS` en produccion.

## Revision util

```bash
npm test -- --runInBand tests/integration/api.test.js
```

```powershell
Select-String -Path server\index.js -Pattern '/api/membresias/'
```
