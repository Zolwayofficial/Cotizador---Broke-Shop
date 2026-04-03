# Investigacion De Arquitectura

## Objetivo

Describir la arquitectura viva del repo y los motivos practicos de diseno, sin rankings ni marketing desactualizado.

## Punto De Partida

El sistema actual se apoya en:

- `server/index.js` como entrada HTTP principal
- `server/sistema-agentes.js` para el registro unificado de agentes
- `server/agentes-navegacion/index.js` para conectores regulatorios
- `server/memoria-hibrida.js` para memoria estructural y contexto
- `client/src/App.jsx` como superficie principal de la carpeta de trabajo

## Decision Central

El proyecto sigue un monolito modular.

Eso permite:

- menos complejidad operativa que microservicios
- pruebas integradas mas directas
- despliegue simple con PM2
- contratos claros entre backend, cliente y scripts operativos

## Agentes

Los conteos no deben presentarse como un numero estable en esta guia.

La fuente viva es:

- `registro_agentes` en `server/sistema-agentes.js`
- `NAVEGACION_AGENT_REGISTRY` en `server/agentes-navegacion/index.js`
- `/api/agentes/stats`

Si cambia el numero de agentes, este documento no deberia quedar obsoleto por eso.

## Fortalezas Reales

- separacion razonable por dominios
- conectores gubernamentales desacoplados del conversador
- memoria y auto-repair compartiendo persistencia comun
- dashboard y cliente con helpers extraidos para no concentrar toda la logica en `App.jsx`

## Riesgos Reales

- `server/index.js` sigue siendo grande y exige auditorias por bloques
- parte del valor del sistema depende de entorno y credenciales reales
- los conectores web requieren mantenimiento cuando cambian fuentes oficiales

## Como Verificar La Arquitectura Viva

```powershell
npm test -- --runInBand tests/unit/sistema-agentes.test.js
npm test -- --runInBand tests/unit/agentes-navegacion-index.test.js
$env:BASE_URL="http://localhost:PUERTO_REAL"
curl $env:BASE_URL/api/agentes/stats
```

## Regla De Mantenimiento

Si este archivo vuelve a contener:

- versionado desactualizado como contrato vivo
- rankings tratados como senal unica frente a terceros
- conteos desactualizados de agentes
- porcentajes de superioridad frente a terceros

entonces deja de ser investigacion util y vuelve a ser deuda documental.
