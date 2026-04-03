# Integracion De Auto-Repair

Esta guia resume como se conecta `auto-repair` con modulos del backend sin
arrastrar una lista desactualizada de agentes "pendientes".

## Fuente De Verdad

- `server/auto-repair.js`
- `tests/unit/auto-repair.test.js`
- `tests/integration/api.test.js`

## Patron De Integracion

Un modulo se integra usando `ejecutarConAutoReparacion()` alrededor de una
operacion fragil, pasando:

- nombre de agente o modulo
- funcion async principal
- contexto util para diagnostico

## Donde Tiene Mas Sentido

- clasificadores y llamadas de IA
- conectores con scraping o APIs externas
- modulos con timeouts, parseo o dependencias remotas

## Contrato Correcto

- no envolver por envolver
- no inflar resultados favorables si todos los reintentos fallan
- no perder `0` real en confianza o estadisticas
- no guardar contexto sin sanear

## Como Revisar

1. verificar tests unitarios del modulo integrado
2. verificar tests de `auto-repair`
3. revisar que el endpoint admin siga respondiendo

## Antipatrones

- listar una cobertura total desactualizada
- marcar modulos como pendientes sin revisar el codigo actual
- asumir que una funcion esta envuelta solo porque existe el import
