# Criterio 10/10 realista

Este documento ya no intenta vender una sola puntuacion ni rankings desactualizados.
Su objetivo es describir que significaria, para este proyecto, acercarse a un
`10/10` realista sin contradecir el codigo ni la operacion actual.

## Que significa aqui "10/10"

No significa sistema infalible. Significa:

- calculo trazable y deterministico en los caminos criticos
- buena tolerancia a fallos de documentos y fuentes oficiales
- cliente que no inventa datos cuando faltan
- despliegue repetible
- monitoreo, backups y recuperacion razonables

## Pilares que hoy si estan bien orientados

- calculo base y consulta tributaria
- ingestion documental con normalizacion y OCR
- dashboard con diferenciacion entre dato ausente y dato real
- panel admin con estados explicitos
- deploys y backups mas consistentes que antes

## Lo que todavia separa al sistema de un 10/10 operativo

- `JWT_SECRET` fuerte en produccion
- `WS_PORT` definido de forma explicita
- `DOMAIN` o `ALLOWED_ORIGINS` configurados con revision operativa actual
- mas integraciones reales de tracking y flete, si se quiere experiencia plena
- historial real suficiente para que el dashboard tenga mas valor analitico
- documentacion residual aun mas homogenea, sin reportes desactualizados que parezcan
  contrato actual

## Como usar este documento

Toma esta guia como criterio de direccion, no como evidencia de produccion.
Para revisar estado real usa:

- `README.md`
- `DEPLOY.md`
- `docs/PRUEBA_PRODUCCION.md`
- `npm run production:check`

## Regla de mantenimiento

Si una mejora ya no refleja el sistema actual, debe salir de aqui. Este archivo
no debe volver a arrastrar conteos, rankings, porcentajes ni comparativas fuera
de fecha convertidos en slogans o cifras comerciales.
