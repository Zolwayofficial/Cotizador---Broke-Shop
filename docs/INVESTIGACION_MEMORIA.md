# Investigacion De Memoria

## Objetivo

Documentar el criterio vivo de memoria del proyecto sin convertir una recomendacion puntual en regla inmovil.

## Lo Que Existe Hoy

El repo ya tiene una implementacion operativa en:

- `server/memoria-hibrida.js`

Esa implementacion combina:

- cotizaciones estructurales
- contexto por usuario
- documentos y metadatos auxiliares
- sugerencias derivadas de aprendizaje simple

## Lectura Correcta

La investigacion no debe afirmarse como:

- "nunca uses vectores"
- "siempre usa vectores"
- "esta decision ya no puede cambiar"

La decision real depende de:

- tipos de consulta
- costo operativo
- calidad de las fuentes
- complejidad de despliegue

## Estado Actual Del Repo

Hoy la memoria documentada es principalmente:

- SQLite estructural
- busqueda textual y por metadatos en documentos
- contexto persistente por usuario

El campo `embedding_json` existe, pero eso no convierte automaticamente al modulo en una vector DB completa ni garantiza busqueda semantica avanzada en todos los flujos.

## Verificacion Minima

```powershell
npm test -- --runInBand tests/unit/memoria-hibrida.test.js
npm test -- --runInBand tests/integration/api.test.js
```

## Preguntas Que Esta Guia Debe Responder

- donde se guarda el contexto
- como se exportan datos de un usuario
- que endpoints hay para memoria
- que limitaciones sigue teniendo la busqueda documental

## Senales De Deriva

Este documento necesita revision si vuelve a prometer:

- comparativas desactualizadas
- porcentajes tratados como senal aislada de valor
- una prohibicion total de memoria semantica
- o coberturas totales que el codigo no garantiza
