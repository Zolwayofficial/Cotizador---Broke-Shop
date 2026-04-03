# Registro Vivo De Agentes

Este documento resume la arquitectura de agentes sin arrastrar conteos ni estados
desactualizados. La fuente de verdad es el codigo, no este archivo.

## Fuente De Verdad

- `server/sistema-agentes.js` compone el registro completo del sistema.
- `server/agente-conversador.js` y `server/agente-conversador-flow.js`
  describen la capa conversacional.
- `server/agente.js` expone el registro base de agentes de negocio.
- `server/agentes-navegacion/index.js` expone el registro de conectores
  oficiales.
- `server/auto-repair.js` y `server/auth.js` aportan agentes de soporte.

## Como Ver El Total Real

No fijes el total a mano. Para ver el numero actual:

```bash
node test-sistema-unificado.js
```

o, con el backend autenticado:

```bash
GET /api/agentes/stats
```

La respuesta incluye `registro_agentes`, `resumen` y `total_agentes`.

## Grupos Principales

### Conversacion

- `Agente conversador`: interpreta la intencion, decide el siguiente paso y
  coordina aclaraciones o correcciones dentro del flujo.
- `Flow helpers`: mantienen opciones, orden de preguntas y revisiones del
  arbol conversacional.

### Agentes Base De Negocio

- `Extractor documental`: lee cotizaciones, PDF, imagenes y texto.
- `Clasificador`: propone HS y contrasta contra NANDINA.
- `Regulatorio`: permisos, restricciones, TLC y controles por entidad.
- `Calculista`: tributos, Incoterm, tipo de cambio, costo importacion y margen.
- `Valoracion`: riesgo de duda razonable y respaldo documental.
- `Logistica`: flete estimado y sensibilidad operativa.
- `Compliance`: sanciones y screening.
- `Legal`: alertas normativas y regimenes.

### Agentes De Navegacion Oficial

El registro de navegacion se define en
`server/agentes-navegacion/index.js`. Hoy agrupa conectores para:

- SUNAT
- ADUANET
- VUCE
- INDECOPI
- MTC
- DIGESA
- SENASA
- MINAM
- PRODUCE

El total puede cambiar si el registro crece o se reduce. Este documento no debe
reescribirse para reflejar un numero anterior; hay que leer el registro vivo.

### Agentes De Soporte

- `Memoria de agentes`: conserva patrones, aprendizaje y contexto compartido.
- `Auto-Repair`: registra fallos, propone conocimiento reusable y endurece
  rutas fragiles.
- `Auth`: revisa identidad, comunidad privada y roles.

## Contrato Operativo

- No asumas porcentajes favorables previos.
- No marques un agente como "pendiente" si ya existe en el registro vivo.
- No uses este archivo como referencia de produccion.
- Si necesitas diagnostico real, cruza este documento con:
  - `docs/AGENTES_DIAGNOSTICO.md`
  - `docs/AGENTES_NAVEGACION.md`
  - `docs/PRUEBA_PRODUCCION.md`

## Lectura Recomendada

1. `server/sistema-agentes.js`
2. `server/agente.js`
3. `server/agente-conversador.js`
4. `server/agentes-navegacion/index.js`
5. `tests/unit/sistema-agentes.test.js`
