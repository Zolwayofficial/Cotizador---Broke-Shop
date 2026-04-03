# Agentes De Navegacion Especialistas

Esta guia describe la capa de conectores oficiales y su contrato actual. No
debe usarse como foto desactualizada sobre tiempos, conteos o porcentajes.

## Fuente De Verdad

- `server/agentes-navegacion/index.js`
- `server/agentes-navegacion/MemoriaAgente.js`
- `server/sistema-agentes.js`

El registro actual de navegacion sale de `NAVEGACION_AGENT_REGISTRY`.

## Registro Actual

Hoy el registro expone conectores para:

- SUNAT
- ADUANET
- VUCE
- INDECOPI
- MTC
- DIGESA
- SENASA
- MINAM
- PRODUCE

Si el registro cambia, este archivo debe seguir describiendo el mecanismo, no
tratar el numero como si no pudiera cambiar.

## Componentes Clave

### Memoria Compartida

`MemoriaAgente` guarda:

- estrategias de navegacion
- patrones de error
- configuraciones reutilizables
- aprendizaje compartido entre conectores

### Inicializacion

`init()` en `server/agentes-navegacion/index.js`:

1. inicializa memoria compartida
2. crea cada agente
3. marca el conjunto como inicializado

La inicializacion ya esta protegida contra llamadas paralelas.

### Estadisticas

Para leer el estado vivo:

```bash
GET /api/agentes/stats
```

o:

```bash
node test-todos-agentes.js
node test-sistema-unificado.js
```

`obtenerEstadisticasGenerales()` devuelve:

- agentes activos
- total actual
- memoria inicializada o con advertencias
- estadisticas por fuente

## Contrato De Los Conectores

- Un error de fuente debe quedar visible como error, no como "sin datos".
- Un `404` o `500` no debe tratarse como respuesta util del conector.
- Una partida o clave mal formada debe sanearse antes de consultar.
- El cache no debe ocultar un fallo repetido ni mentir con datos inexistentes.
- Los agentes ya presentes en el registro no deben documentarse como
  "pendientes".

## Uso Operativo

- `SUNAT`: tipo de cambio y consultas tributarias oficiales.
- `ADUANET`: arancel y soporte de valoracion.
- `VUCE`: restricciones y requisitos por partida/pais.
- `INDECOPI`: medidas y controles regulatorios complementarios.
- `MTC`, `DIGESA`, `SENASA`, `MINAM`, `PRODUCE`: requisitos sectoriales.

## Que No Debe Volver A Aparecer

- mojibake
- "agente SUNAT completo" como si fuera el unico implementado
- porcentajes o tiempos usados como contrato
- estados "pendiente" para agentes que ya existen en el registro

## Referencias

- `docs/AGENTES_17.md`
- `docs/AGENTES_DIAGNOSTICO.md`
- `tests/unit/agentes-navegacion-index.test.js`
