# Verificacion De Conectores

Este documento resume como revisar conectores sin vender una foto desactualizada como si
fuera la referencia de trabajo.

## Fuente De Verdad

- `test-conectores.js`
- `test-endpoints-http.js`
- `tests/unit/conectores-gobierno.test.js`
- `tests/integration/api.test.js`

## Capas De Verificacion

### Smoke Local

```bash
node test-conectores.js
```

Sirve para revisar utilidades y contrato basico del modulo.

### Smoke HTTP

```bash
node test-endpoints-http.js
```

Requiere backend corriendo y token activo.

### Suite Automatizada

```bash
npm test -- --runInBand tests/unit/conectores-gobierno.test.js
npm test -- --runInBand tests/integration/api.test.js
```

## Lectura Correcta De Resultados

- una respuesta con `pendiente_verificacion` puede ser contrato esperado
- un conector puede estar disponible con cache o fallback sin ser una API plena
- un reporte puntual sin error visible no autoriza decir "todo funciona para siempre"

## Antipatrones

- declarar cobertura total con una foto desactualizada
- declarar `cumplimiento operativo total`
- repetir ejemplos demo como si fueran datos actuales
- asumir que todas las entidades usan API oficial autenticada

## Referencias

- `docs/CONECTORES_GOBIERNO.md`
- `docs/PRUEBA_PRODUCCION.md`
