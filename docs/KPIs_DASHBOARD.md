# KPIs Del Dashboard

Esta guia define como leer y extender el dashboard sin convertir ausencia de
datos en numeros ficticios.

## Fuente De Verdad

- `server/dashboard/dashboard-service.js`
- `client/src/dashboard-view-helpers.cjs`
- `client/src/result-view-helpers.cjs`

## Regla Base

Un KPI solo puede mostrarse como numero real si el backend envio un valor
utilizable. Si el dato falta o la carga fallo, la UI debe mostrar:

- `N/D`
- `No disponible`
- `Sin datos`

No debe inventarse:

- `0`
- `USD 0.00`
- `0%`

si el dato en realidad no llego.

## KPIs Canonicos

### Actividad

- `Cotizaciones`
- `Valor total`
- `Paises activos`
- `Productos activos`

Estas tarjetas salen del historial real guardado. Si no hay historial, el estado
correcto es vacio honesto, no demo.

### Tendencia

- serie de cotizaciones por periodo
- serie de dolares por periodo

La serie debe filtrar puntos rotos o incompletos antes de renderizar.

### Distribucion

- paises mas frecuentes
- productos mas frecuentes
- alertas y tendencias destacadas

Las categorias sin `label` o `value` util no deben entrar al grafico.

## Contratos Visuales

### KPI Card

- si el dashboard cargo y el valor existe: mostrar valor
- si el dashboard cargo pero el valor falta: mostrar `N/D`
- si el dashboard fallo: mostrar estado de error, no un KPI en cero

### Line Chart

- si no hay puntos utiles: `N/D` y `Sin serie`
- si hay puntos utiles con ultimo valor `0`: mostrar `0`

### Donut / Bar Chart

- si no hay categorias utiles: `Sin datos`
- si el total real es `0`: mostrar `0`, no vacio

### Lectura Ejecutiva

- si la IA devuelve texto o bullets utiles: renderizar
- si la IA no devuelve contenido util: `Analisis no disponible`

### Alertas y Tendencias

- si hay items utiles: renderizar
- si no hay items: `Sin novedades destacadas`

## Fuente De Error Mas Comun

El bug mas repetido en este dashboard ha sido confundir:

- dato ausente
- dato roto
- dato real igual a `0`

Todo cambio futuro debe mantener esa diferencia.

## Revision Recomendada

```bash
npm test -- --runInBand tests/unit/dashboard-view-helpers.test.js
npm test -- --runInBand tests/unit/dashboard.test.js
```

Y luego:

```bash
npm run client:build
```

## Referencias

- `docs/VERIFICACION_COMPLETA.md`
- `docs/AUDITORIA_FINAL.md`
