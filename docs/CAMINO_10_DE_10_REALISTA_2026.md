# Camino a 10/10 Realista

Este documento resume lo que todavia falta para que el cotizador llegue a un `10/10 realista` sin vender humo. La meta no es prometer exactitud consistente en todos los casos, sino dejar el sistema:

- fuerte en calculo;
- claro en trazabilidad;
- riguroso con fuentes oficiales;
- y robusto en documentos, logistica y casos dudosos.

## 1. Lo que ya esta fuerte

- Calculo aduanero base y landed cost.
- Consulta oficial viva con ADUANET para gravamenes, convenios y restricciones por subpartida.
- Tipo de cambio con fuente oficial y fallback transparente.
- Flujo conversacional con aclaraciones y correcciones aplicadas.
- Dashboard por alcance y trazabilidad de actividad.

## 2. Lo que todavia impide un 10/10

### 2.1 Clasificacion HS fina

El clasificador ya debate entre modelos y usa doctrina, pero en casos finos todavia necesita mas soporte documental y humano.

Implementacion recomendada:
- seguir usando RGI y doctrina interna;
- priorizar resoluciones y clasificaciones oficiales como evidencia;
- exigir revision humana cuando la confianza sea baja o haya conflicto entre agentes;
- guardar siempre la justificacion de clasificacion y su fuente.

Fuentes base:
- WCO HS Nomenclature: https://www.wcoomd.org/en/topics/nomenclature/overview/what-is-the-harmonized-system.aspx
- WCO Explanatory Notes: https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs_explanatory_notes_2022/hs_explanatory_notes_2022_edition.aspx

### 2.2 Documentos de proveedor complejos

Hoy el intake funciona bien para texto digital, pero el salto real hacia 10/10 es leer mejor PDFs escaneados, listas de empaque, proformas y cotizaciones mezcladas.

Implementacion recomendada:
- mantener extractor local rapido para DOCX, XLSX y PDF con texto;
- usar OCR oficial solo cuando el PDF no traiga texto;
- mantener el OCR como opt-in para no forzar costo o latencia en todos los uploads;
- etiquetar siempre si el dato vino de OCR y si luego fue corregido manualmente.

Referencias evaluadas:
- Google Document AI OCR: https://cloud.google.com/document-ai/docs/process-documents-ocr
- Google Document AI human review: https://cloud.google.com/document-ai/docs/hitl
- Docling: https://github.com/docling-project/docling
- Marker: https://github.com/VikParuchuri/marker
- Unstructured OCR/partitioning: https://docs.unstructured.io/open-source/introduction/overview

Decision para este proyecto:
- Google Document AI como OCR oficial opcional.
- Docling, Marker y Unstructured como alternativas open source si luego quieres reforzar ingestion offline o bulk processing.

### 2.3 Fuentes oficiales protegidas o inestables

No toda fuente oficial responde bien por HTML simple. Algunas requieren capa resistente y otras cambian con el tiempo.

Implementacion recomendada:
- mantener `fetch` y HTML simple para fuentes que ya responden bien;
- usar una capa basada en navegador solo donde haga falta de verdad;
- no meter esa capa pesada en todos los agentes;
- cachear datos oficiales recientes y marcar su estado.

Referencias evaluadas:
- Playwright: https://playwright.dev/
- Camoufox: https://camoufox.com/python/

Decision para este proyecto:
- capa basada en navegador solo para fuentes tipo SUNAT o SBS cuando falle la ruta ligera;
- ADUANET sigue mejor por HTML simple mientras su pagina lo permita.

### 2.4 Tarifas reales de courier, flete y tracking

Sin tarifas reales, el sistema puede orientar muy bien, pero no llega a 10/10 comercial.

Implementacion recomendada:
- priorizar agregadores con rates reales y buena cobertura;
- soportar cuentas propias o tarifas manuales por courier;
- distinguir siempre `real`, `contractual`, `estimado` y `referencial`.

Referencias oficiales:
- EasyPost docs: https://docs.easypost.com/
- Shippo docs: https://docs.goshippo.com/docs/

Decision para este proyecto:
- EasyPost y Shippo como mejora real cuando quieras rates automaticos serios;
- tracking y flete siguen siendo secundarios frente a la precision regulatoria y documental.

### 2.5 Human-in-the-loop obligatorio en casos sensibles

Un 10/10 realista no elimina a la persona; elimina errores silenciosos.

Implementacion recomendada:
- revision obligatoria cuando cambie producto, pais, incoterm, canal o HS;
- cola de revision para casos con baja confianza;
- trazabilidad de quien corrigio que y cuando;
- versionar el resultado entre `estimado`, `contrastado` y `con_respaldo`.

## 3. Lo que se implemento ahora

Ya quedo implementada una mejora concreta y de bajo riesgo:

- OCR oficial opt-in para PDFs escaneados, usando Google Document AI como proveedor opcional.

Archivos relacionados:
- `server/document-ocr.js`
- `server/document-ingestion.js`
- `tests/unit/document-ocr.test.js`
- `tests/unit/document-ingestion.test.js`

Comportamiento:
- si el PDF trae texto, se usa el extractor normal;
- si el PDF no trae texto, se intenta OCR oficial solo si esta configurado;
- si OCR no esta configurado o falla, el sistema mantiene su comportamiento actual y avisa claramente.

## 4. Prioridad recomendada

Orden recomendado para seguir subiendo el sistema:

1. OCR oficial opt-in y despliegue seguro.
2. Cola de revision humana para clasificacion HS dudosa.
3. Resoluciones y clasificaciones oficiales como evidencia interna.
4. Tarifas reales de courier y flete para los canales que mas use tu comunidad.
5. Mejoras de dashboard con mas historial real.

## 5. Regla operativa final

Para este proyecto:

- oficial en vivo cuando exista;
- cache oficial cuando sea razonable;
- regla interna versionada cuando no haya conector vivo;
- manual del usuario por encima del automatico;
- y nunca ocultar que un dato fue OCR, IA, estimado o referencial.
