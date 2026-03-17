# Especificacion Canonica 2026

## Proposito

Este documento reemplaza las descripciones mezcladas entre vision, legado y estado real del repo.
Su objetivo es dejar una fuente de verdad util para seguir implementando `Cotizador Peru Ultimate v3.0`
sin confundir promesas de producto con comportamiento actual del codigo.

## 1. Vision Del Producto

`Cotizador Peru Ultimate` es una plataforma de cotizacion de importaciones para Peru con estas metas:

- Tener una entrada principal conversacional guiada por el `Agente 0`.
- Calcular costos de importacion end-to-end: clasificacion, permisos, tributos, flete, sensibilidad y margen.
- Integrar fuentes reales de gobierno, logistica e IA siempre que haya credenciales o conectividad.
- Degradar con fallbacks cuando falle una API externa, sin romper la experiencia.
- Exponer un dashboard operativo como vista complementaria para monitoreo, historial y analisis.
- Soportar dos modos: automatico por documento/API y personalizado para courier, operador o agente.

## 2. Decisiones Canonicas

Estas decisiones quedan como direccion correcta del proyecto:

- La home debe ser el cotizador conversacional, no el dashboard.
- El dashboard es una vista secundaria, no la portada obligatoria.
- Si no hay datos historicos, el dashboard debe mostrar estado vacio honesto, nunca metricas ficticias.
- El sistema debe seguir funcionando sin `GROQ_API_KEY`, `EMAIL_*` o APIs logisticas, usando fallback claro.
- Los conectores gubernamentales y logisticos son parte del valor del producto, no extras cosmeticos.
- La cotizacion final y el dashboard son dos salidas diferentes. No deben mezclarse en la misma estructura.
- La experiencia local principal queda en `http://localhost:3000`, con WebSocket en `3002`, salvo override por env.

## 3. Estado Real Del Repo Hoy

### 3.1 Arranque local

- Script local: [start-local.js](/C:/Users/Billy/AppData/Local/Programs/Antigravity/cotizador/start-local.js)
- Puerto por defecto: `3000`
- WebSocket por defecto: `3002`
- Scripts declarados en [package.json](/C:/Users/Billy/AppData/Local/Programs/Antigravity/cotizador/package.json):
  - `npm start`
  - `npm run dev`
  - `npm test`
  - `npm run client:build`

### 3.2 UI principal

- Frontend activo: [client/src/App.jsx](/C:/Users/Billy/AppData/Local/Programs/Antigravity/cotizador/client/src/App.jsx)
- La portada actual ya abre en vista `cotizador`.
- La UI muestra:
  - Hero principal
  - Chat conversacional
  - Resumen capturado
  - Resultado de cotizacion
  - Dashboard secundario en una pestana aparte

### 3.3 Chat conversacional

- Backend del chat: [server/agente-conversador.js](/C:/Users/Billy/AppData/Local/Programs/Antigravity/cotizador/server/agente-conversador.js)
- Endpoints:
  - `POST /api/agente-0/iniciar`
  - `POST /api/agente-0/chat`
- El flujo actual ya pregunta por:
  - productos
  - pais de origen
  - canal
  - precio unitario
  - incoterm
  - tipo de importador
- El chat ya:
  - interpreta respuestas segun el paso actual
  - evita confundir cantidad con precio
  - repite la misma pregunta contextual cuando la respuesta no coincide con las opciones

### 3.4 Motor de cotizacion

- Orquestador principal: [server/agente.js](/C:/Users/Billy/AppData/Local/Programs/Antigravity/cotizador/server/agente.js)
- Endpoint de calculo actual:
  - `POST /api/agente/calcular`
- El endpoint ya responde correctamente por HTTP y devuelve una cotizacion con `totales.totalReal`.
- El bug del rate limiter que rompia el calculo ya fue corregido en [server/index.js](/C:/Users/Billy/AppData/Local/Programs/Antigravity/cotizador/server/index.js).

### 3.5 Dashboard

- Servicio actual: [server/dashboard/dashboard-service.js](/C:/Users/Billy/AppData/Local/Programs/Antigravity/cotizador/server/dashboard/dashboard-service.js)
- El dashboard ya no devuelve KPIs ficticios por defecto.
- Si no hay cotizaciones guardadas, devuelve:
  - `meta.hayDatos = false`
  - KPIs en cero
  - alertas de estado vacio
- Si hay datos guardados, construye KPIs y distribuciones desde la base.
- Si falta `GROQ_API_KEY`, usa fallback sin generar errores falsos.

### 3.6 Registro real de agentes

Sistema registrado actualmente en [server/sistema-agentes.js](/C:/Users/Billy/AppData/Local/Programs/Antigravity/cotizador/server/sistema-agentes.js):

- Conversacion: `1`
- Base: `17`
- Navegacion: `9`
- Soporte: `3`
- Total real: `30`

Desglose:

- Conversacion:
  - `agente-0`
- Base:
  - orquestador central
  - clasificador hs
  - clasificador hs a
  - clasificador hs b
  - arbitro
  - regulatorio
  - calculista
  - conversor moneda
  - ajustador incoterm
  - motor dsi
  - valoracion
  - logistico
  - compliance
  - validador proveedor
  - legal
  - analizador margen
  - extractor
- Navegacion:
  - sunat
  - aduanet
  - vuce
  - indecopi
  - mtc
  - digesa
  - senasa
  - minam
  - produce
- Soporte:
  - memoria-agentes
  - auto-repair
  - auth

## 4. Contradicciones Ya Resueltas

### Puerto principal

Documentos viejos hablan de `3001`, pero el estado actual del repo local esta estandarizado en `3000`.

Canonico:

- Local web/API: `3000`
- WebSocket: `3002`

### Pantalla principal

Documentos viejos trataban el dashboard como portada principal.

Canonico:

- Portada = chat de cotizacion
- Dashboard = vista complementaria

### React vs HTML legado

Hay restos de una historia donde `dashboard.html` parecia ser la interfaz final.

Canonico:

- La interfaz viva hoy esta en React/Vite.
- [dashboard.html](/C:/Users/Billy/AppData/Local/Programs/Antigravity/cotizador/dashboard.html) se considera legado o referencia, no fuente de verdad principal.

### Conteo de agentes

Algunas descripciones listaban `0-29` y lo llamaban `29 agentes`, lo cual no cuadraba.

Canonico:

- El sistema debe contarse como `30` agentes si se incluye al `Agente 0` y al agente formal de `Auth`.
- El runtime actual ya refleja ese total en el registro unificado.
- No debe volver a escribirse como `0-29 = 29`.

### Estado del chat

La especificacion pegada dice que el chat no estaba implementado.

Canonico:

- El chat si existe.
- Ya esta conectado a la UI principal.
- Sigue en maduracion funcional, pero no debe describirse como ausente.

## 5. Integraciones: Vision vs Estado Actual

### Vision valida

Se mantiene como objetivo legitimo del producto:

- Integraciones gubernamentales en tiempo real
- Integraciones logisticas para couriers/navieras
- IA con Groq para clasificacion, analisis y soporte
- Contingencia y fallbacks
- Cotizacion personalizada por operador/courier/agente

### Estado real hoy

- Existen conectores y modulos de navegacion en el backend.
- Existen integradores logisticos y modos personalizados.
- Existen servicios con fallback cuando falta conectividad.
- No todas las integraciones deben asumirse activas en local sin credenciales.

Canonico:

- La especificacion funcional puede prometer integraciones reales.
- La especificacion tecnica debe distinguir entre:
  - conector existente
  - conector activo con credenciales
  - fallback local

## 6. Salidas Canonicas Del Sistema

### 6.1 Salida de cotizacion

La salida de cotizacion debe contener datos operativos de importacion, por ejemplo:

- items
- metadata del caso
- alertas
- permisos
- etapas
- totales:
  - fob
  - flete
  - seguro
  - cif
  - ad valorem
  - igv
  - ipm
  - percepcion
  - total tributos
  - total landed
  - total real
  - total pen si aplica

No debe mezclar:

- kpis
- graficos
- widgets de dashboard

### 6.2 Salida de dashboard

La salida de dashboard debe contener:

- `meta`
- `kpis`
- `graficos`
- `tendencias`
- `tops`
- `alertas`

Y debe construirse desde historial real o mostrar estado vacio util.

## 7. Requisitos Imprescindibles

### Producto

- Home en modo cotizacion conversacional
- Flujo guiado hasta calculo
- Resultado visible y util
- Dashboard sin datos ficticios

### Plataforma

- `GET /api/health` o equivalente de salud respondiendo
- `GET /api/monitor/health` respondiendo
- `POST /api/agente-0/iniciar` respondiendo
- `POST /api/agente-0/chat` respondiendo
- `POST /api/agente/calcular` respondiendo

### Resiliencia

- Si falta `GROQ_API_KEY`, el sistema degrada con fallback
- Si faltan APIs externas, la UI no se rompe
- Si no hay historial, el dashboard no inventa numeros

## 8. Gaps Reales Pendientes

Estos puntos siguen siendo importantes para alinear el codigo con la vision:

### UI de cotizacion

- Dar formato mas formal al resultado final de cotizacion
- Incorporar salida de cotizacion personalizada por email/WhatsApp/telefono
- Hacer mas clara la diferencia entre modo automatico y personalizado

### Integraciones reales

- Verificar una por una las APIs gubernamentales en modo productivo
- Verificar credenciales y comportamiento de APIs logisticas reales
- Dejar claro en UI cuando la data viene de API real vs fallback

### Persistencia e historial

- Validar el guardado consistente de cotizaciones finales en base
- Confirmar como se alimenta el dashboard desde historial real
- Definir mejor la memoria de usuario y reutilizacion de cotizaciones

### Operacion

- Alinear scripts de arranque/documentacion para no seguir mezclando `3000` y `3001`
- Mantener una sola narrativa oficial de despliegue
- Revisar claims fuertes del README y docs para que no prometan mas de lo realmente validado

## 9. Regla De Oro Para Cambios Futuros

Cuando haya conflicto entre documentos viejos y el estado deseado del producto, usar esta prioridad:

1. Vision funcional validada por el usuario
2. Comportamiento real del codigo actual
3. Documentacion legada

En practica:

- No volver a priorizar el dashboard por encima del chat.
- No volver a meter metricas demo en una experiencia vacia.
- No volver a describir el chat como inexistente.
- No volver a fijar `3001` como verdad local si el arranque real usa `3000`.

## 10. Siguiente Fase Recomendada

La siguiente fase de trabajo deberia seguir este orden:

1. Formalizar la cotizacion final en UI para que parezca documento de negocio, no solo resultado tecnico.
2. Conectar mejor las variantes de cotizacion automatica vs personalizada.
3. Auditar integraciones reales y sus fallbacks con `.env` completo.
4. Limpiar README/docs para que todos apunten a esta version canonica.
