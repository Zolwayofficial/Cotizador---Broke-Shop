# Arbol De Decision Del Chat 2026

Este documento deja explicito el flujo conversacional del cotizador para que el
arbol no dependa solo de la implementacion en
`server/agente-conversador-flow.js`.

## Objetivo

El chat debe cubrir los escenarios mas comunes de importacion sin mezclar
respuestas de pasos distintos ni perder datos ya capturados.

## Secuencia Base

1. `productos`
2. `pais_origen`
3. `tipo_sujeto`
4. `canal`
5. `precio_unitario`
6. `incoterm`
7. `tipo_importador`
8. `flete` (opcional, excepto `POSTAL`)
9. `seguro` (opcional, excepto `POSTAL`)
10. `peso_total` (opcional, excepto `POSTAL`)
11. `tipo_cambio` (opcional)
12. `margen_venta` (opcional)
13. `calcular`

## Ramas Principales

### Tipo De Sujeto

- `empresa`
  - opciones de perfil:
    - `general`
    - `nuevo`
    - `buen_contribuyente`
- `persona_natural`
  - opciones de perfil:
    - `nuevo`
    - `general`

### Canal

- `MARITIMO`
- `AEREO`
- `COURIER`
- `POSTAL`

Regla especial:

- `POSTAL` omite `flete`, `seguro` y `peso_total`

## Incoterms Explicitos

No se usa un boton generico `OTRO`. El flujo expone directamente:

- `FOB`
- `CIF`
- `CFR`
- `EXW`
- `FCA`
- `CIP`
- `DAP`
- `DDP`

## Cobertura Minima Obligatoria

Estos escenarios deben mantenerse cubiertos por tests:

1. `empresa + aereo + producto simple`
2. `empresa + courier + courier distinto a ejemplos`
3. `empresa + maritimo + estimaciones opcionales`
4. `persona_natural + postal`
5. `persona_natural + courier`
6. `incoterm distinto de FOB/CIF`
7. `respuesta invalida` que repita la misma pregunta sin romper contexto
8. `confirmacion final` sin perder datos previos

## Reglas De Calidad Del Flujo

- Las respuestas de opciones no deben sobreescribir `productos`.
- El canal debe conservar la diferencia entre `MARITIMO` y `AEREO`.
- Cada paso debe aceptar texto libre y botones cuando aplique.
- Si el usuario no tiene un dato opcional, el sistema debe dejarlo en modo
  estimado o default sin romper el flujo.
- El resultado final debe poder marcar que componentes fueron exactos,
  estimados o referenciales.

## Lo Que Sigue Si Queremos Mas Cobertura

- Agregar tests para productos regulados y permisos por entidad.
- Agregar tests para `DDP` y `DAP` con recomendaciones especificas.
- Agregar tests cruzados por `persona_natural` vs `empresa` y por `courier` vs
  `postal`.
- Agregar smoke tests E2E del chat en navegador para asegurar UX real, no solo
  API.
