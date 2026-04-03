# Memoria Hibrida

## Modulo

- Archivo: `server/memoria-hibrida.js`
- Dependencias clave: `server/db.js`, `server/auto-repair.js`

## Que Hace

El modulo concentra tres responsabilidades practicas:

1. guardar cotizaciones y aprendizaje estructural
2. mantener contexto por usuario
3. almacenar documentos y permitir busqueda util sobre ese material

## Tablas Principales

- `memoria_cotizaciones`
- `memoria_documentos`
- `memoria_contexto`
- `memoria_aprendizajes`

## Endpoints Relacionados

Desde `server/index.js`:

- `POST /api/memoria/cotizacion`
- `GET /api/memoria/cotizaciones`
- `POST /api/memoria/buscar`
- `GET /api/memoria/contexto/:usuario_id`
- `POST /api/memoria/contexto`
- `GET /api/memoria/sugerencias/:usuario_id`
- `GET /api/memoria/estadisticas`
- `POST /api/memoria/limpiar`
- `GET /api/memoria/exportar/:usuario_id`

## Contrato Actual

- la memoria estructural usa SQLite
- el contexto se normaliza por usuario
- los aprendizajes se agregan por frecuencia
- la busqueda documental actual es compatible con texto y metadatos
- `embedding_json` puede almacenarse, pero no debe documentarse como garantia de busqueda vectorial completa

## Lo Que No Debe Fingir

Este documento no debe volver a prometer:

- una cobertura vectorial completa
- latencias desactualizadas como contrato
- cantidades desactualizadas de usuarios o cotizaciones
- sugerencias perfectas o automaticas en todos los casos

## Verificacion

```powershell
npm test -- --runInBand tests/unit/memoria-hibrida.test.js
npm test -- --runInBand tests/integration/api.test.js
```

## Mantenimiento

Si cambian tablas, endpoints o el modo de busqueda documental, esta guia debe actualizarse junto con el codigo y sus pruebas.
