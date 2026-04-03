# APIs de fletes

Este documento resume el contrato actual de cotizacion de flete. No vende precision consistente ni trata proveedores anteriores como si siguieran siendo referencia de trabajo.

## Estrategia actual

El sistema combina tres niveles, en este orden:

1. dato real del usuario o documento
2. proveedor logistico real, si existe credencial util y respuesta util
3. estimacion o fallback referencial claramente etiquetado

Eso implica dos reglas:

- nunca presentar un fallback como tarifa con respaldo contractual
- nunca ocultar que la cotizacion cayo a estimacion o referencia

## Modulos actuales

- `server/flete-api.js`
- `server/flete.js`
- `server/couriers/integrador-logistica.js`
- `server/couriers/contingencia-api.js`
- `tests/unit/flete-api.test.js`
- `tests/unit/flete.test.js`
- `tests/unit/logistica.test.js`
- `tests/unit/contingencia.test.js`

## Estado operativo

Si no configuras APIs reales, el sistema sigue funcionando, pero la salida queda etiquetada como estimada o referencial.

La lectura correcta hoy es:

- con credenciales y respuesta util: `source` real del proveedor
- sin credenciales o sin respuesta util: `referencial`, `estimado` o fallback equivalente

## Variables opcionales

Segun el proveedor que actives, el entorno puede requerir llaves como:

- `TRACKINGMORE_API_KEY`
- `TRACKINGMORE_DAILY_LIMIT` para la cuota diaria local que quieres rastrear
- `SEARATES_API_KEY`
- agregadores o couriers configurados en el integrador logistico

La ausencia de esas variables no rompe el sistema. Solo obliga a degradar con trazabilidad.

## Endpoints utiles

### `POST /api/flete/estimar`

Entrada base:

```json
{
  "origen": "CN",
  "destino": "PE",
  "canal": "maritimo",
  "pesoKg": 500,
  "valorFOB": 10000
}
```

Salida esperada:

- `flete`
- `canal`
- `source`
- `nota`
- `transit` cuando aplique
- tarifa o desglose, si el proveedor lo devuelve

La salida correcta depende del origen del dato. No hay un numero unico aplicable a todos los casos.

### `GET /api/flete/tarifas`

Expone referencias o matrices utiles para fallback y soporte operativo. No debe leerse como tabla oficial ni como cotizacion final.

### `GET /api/flete/status`

Sirve para ver si el entorno tiene proveedores reales configurados, si el fallback sigue disponible y cual es el estado local de TrackingMore.

### `GET /api/flete/usage`

Expone la cuota diaria local rastreada para TrackingMore.

No representa una cuota oficial publicada por el proveedor. Es un control operativo local para saber cuando el modulo ya debe degradar a fallback referencial.

## Reglas de lectura

- `source` real del proveedor: dato operativo util, sujeto a revision comercial
- `referencial`: referencia de mercado o fallback interno
- `estimado`: calculo interno sin proveedor vivo
- `documento_usuario` o equivalente: dato aportado por el usuario

## Recomendaciones

Para produccion:

- configurar al menos un proveedor real si quieres flete con mejor respaldo operativo
- mantener el fallback interno para continuidad
- dejar la UI etiquetando claramente cuando el dato no viene de un proveedor vivo

Para desarrollo:

- puedes trabajar solo con fallback
- las pruebas deben enfocarse en contrato, etiquetado y degradacion correcta

## Lo que no debe decir esta guia

- no debe prometer cifras desactualizadas de precision
- no debe asumir que una API concreta sera siempre la principal
- no debe vender un fallback como tarifa real
- no debe usar ejemplos demo como si fueran contrato productivo
