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

## Aportes Del PDF "Cotiza Hasta El Parcial"

Del material `cotiza pdf hasta le parcial.pdf` salen mejoras claras para una
segunda capa del arbol, mas orientada a costos y fijacion de precio:

### Decision Inicial Que Falta Explicitar

Antes de empujar al usuario directo al calculo final, conviene distinguir si
quiere:

1. `Solo costo de importacion`
2. `Costo + precio de venta sugerido`
3. `Cotizacion completa para cliente`

Esa separacion importa porque el PDF deja claro que no es lo mismo:

- costo de adquisicion/importacion
- gastos de venta
- gastos generales y administrativos
- gastos financieros

### Rama De Modelo De Negocio

Cuando el usuario quiera precio de venta o cotizacion, conviene identificar:

- `empresa comercial`
- `empresa manufacturera`

Para el cotizador actual, la rama mas util por ahora es `empresa comercial`,
porque el flujo hoy trabaja sobre producto importado listo para revender. La
rama `manufacturera` podria activarse luego si el usuario quiere incorporar
transformacion local o costos de produccion.

### Rama Avanzada De Costos

Si el usuario quiere una cotizacion mas real de venta, el chat deberia poder
abrir una capa opcional con:

- `gastos de venta`
- `gastos generales y administrativos`
- `gastos financieros`
- `incluir o no IGV en la vista comercial`

Esto no debe ensuciar el flujo base de importacion. Debe ser una rama
avanzada, no una pregunta obligatoria para todos.

### Conclusion Operativa

Este PDF ayuda menos al arbol aduanero base y mas al arbol de `costeo
comercial posterior a la importacion`.

Por eso, la recomendacion es:

- mantener el flujo base actual para importar
- agregar una decision temprana sobre `objetivo del calculo`
- abrir una rama opcional de `costos comerciales y financieros` cuando el
  usuario quiera precio de venta o cotizacion final

## Aportes Del PDF "Desde Parcial A Semana 13"

Este segundo material si empuja con mas fuerza una ampliacion formal del
arbol, porque aterriza metodos de fijacion de precios, estructura de costos,
capacidad productiva y cadena de comercializacion.

### Nueva Decision Temprana: Objetivo Del Calculo

Antes de preguntar costos avanzados, conviene identificar que quiere obtener el
usuario:

1. `solo_importacion`
2. `importacion + precio de venta`
3. `precio objetivo hacia atras`
4. `cotizacion de exportacion`

Esto evita mezclar en el mismo flujo:

- landed cost de importacion
- pricing comercial indirecto
- fijacion de precio FOB de exportacion
- evaluacion de rentabilidad/capacidad productiva

### Rama De Metodo De Precio

Cuando el usuario no solo quiere importar sino construir precio comercial,
conviene abrir una rama adicional:

- `metodo_directo`
  - parte de costos + margen deseado
- `metodo_indirecto`
  - parte de precio final permitido o precio al consumidor y retrocede hasta
    FOB/CIF/DDP

El PDF deja claro que ambos metodos usan preguntas distintas y no deben
fusionarse como si fueran un solo caso.

### Rama De Cadena Comercial

Si el usuario pide precio de venta o precio maximo al consumidor, el chat debe
preguntar si existe cadena comercial. Como minimo:

- `solo importador`
- `importador + mayorista`
- `importador + mayorista + minorista`

Y para cada etapa, permitir margen sobre:

- `costo`
- `valor de venta`

Esto es clave porque el PDF usa:

- margen del importador sobre costo de importacion
- margen del mayorista sobre costo de adquisicion
- margen del minorista sobre valor de venta

### Rama De Seguro Y CIF Derivado

El material confirma que no siempre basta con pedir "seguro conocido / seguro
estimado". En terminos CIF puede hacer falta una subrama mas precisa:

- `seguro ya conocido`
- `seguro a calcular`

Si el seguro se calcula, el caso academico minimo debe permitir:

- `suma asegurada = 110%`
- `prima`
- `derecho de emision`

Y contemplar dos lecturas posibles:

- sobre `CFR`
- sobre `CIF`, si el ejercicio o la convencion del caso asi lo exige

### Rama De Costos Avanzados

Para costeo de precio y benchmark academico, este PDF refuerza una rama opcional
de costos adicionales:

- `gastos portuarios`
- `transporte local en destino`
- `inspecciones`
- `operador logistico / agente de aduana`
- `otros gastos`
- `comisiones bancarias`
- `gastos financieros`
- `gastos generales y administrativos`
- `comisiones sobre FOB`

Eso no debe contaminar la cotizacion simple. Debe activarse solo cuando el
usuario quiera precision avanzada o pricing completo.

### Rama De Capacidad Productiva Y Tercerizacion

Para exportacion o fabricacion, este PDF agrega una pregunta estrategica que
hoy no existe en el arbol:

- `tienes capacidad productiva disponible?`

Y si la respuesta es no:

- `puedes ampliar capacidad?`
- `puedes subcontratar / tercerizar?`

Esto es especialmente util cuando el sistema se use para cotizaciones de
fabricacion/exportacion, no solo para importacion comercial.

### Rama De Rentabilidad Operativa

El material tambien aporta preguntas utiles para modo exportador o costeo
industrial:

- `precio actual de venta`
- `costos variables unitarios`
- `costos fijos totales`
- `produccion actual`
- `produccion proyectada`
- `tipo de cambio`

Con eso se pueden derivar:

- punto de equilibrio
- margen de contribucion
- utilidad actual
- variacion de utilidad por nuevo pedido
- costo fijo unitario proyectado

### Conclusion Operativa

Este PDF no pide inflar el flujo base para todos. Pide separar mejor los
modos del sistema.

Recomendacion:

- mantener el flujo base actual para cotizacion importadora comun
- agregar una decision inicial `objetivo del calculo`
- abrir una rama `pricing comercial`
- abrir una rama `costeo de exportacion`
- activar `costos avanzados`, `cadena comercial` y `capacidad productiva`
  solo cuando el caso lo requiera

## Aportes Del PDF "pdf24_merged"

Este material no suma tanto a pricing comercial, pero si fortalece mucho la
parte normativa y operativa del cotizador. Abarca operadores, ingreso y salida,
tributacion, valoracion, importacion para el consumo, exportacion, regimens
temporales, drawback, courier e Importa Facil.

### Lo Mas Util Para El Flujo De Importacion

#### 1. Diferenciar Mejor Los Canales Especiales

El PDF confirma que no conviene tratar igual:

- `COURIER` (envios de entrega rapida)
- `POSTAL / SERPOST`
- `IMPORTACION PARA EL CONSUMO` comun

Para el arbol, esto refuerza que la pregunta `canal` no es solo logistica; es
una decision de regimen operativo.

#### 2. Importa Facil Debe Ser Una Rama Propia De Postal

Del material se desprende una estructura concreta para `POSTAL / SERPOST`:

- hasta `US$ 200`:
  - no afecto al pago de tributos
- superior a `US$ 200` y hasta `US$ 2,000`:
  - requiere liquidacion
  - el material menciona arancel de `4%` dentro de la logica academica del
    curso
- superior a `US$ 2,000`:
  - ya no es caso simple de Importa Facil

Esto sugiere que el arbol deberia tener una subrama de `postal/importa_facil`
que pregunte o derive:

- valor FOB total
- si la mercancia es restringida
- si entra por servicio postal nacional

#### 3. Persona Natural Vs Empresa No Solo Es Perfil Comercial

El PDF refuerza que `persona natural` y `empresa` no son solo perfiles de
usuario; afectan documentos, operadores y forma de destinacion.

Para exportacion definitiva, menciona que:

- quien exporta normalmente debe estar en `RUC`
- ciertos sujetos no obligados a RUC pueden operar con `DNI`, `CE` o
  `Pasaporte`

Para nuestro arbol, esto confirma que `tipo_sujeto` debe seguir muy arriba y
deberia luego disparar recomendaciones documentarias, no solo percepcion.

#### 4. Documentacion Exigible Debe Aparecer Como Checklist

El documento repite varias veces el valor de una lista minima de documentos:

- `DAM`
- documento de transporte
- factura / contrato / documento equivalente
- seguro, cuando corresponda
- permisos por naturaleza u origen

Conclusion practica:

- la cotizacion no deberia solo decir `permisos`
- deberia mostrar tambien `documentos base esperados`

#### 5. Valor En Aduana Y Valor Comercial No Son Lo Mismo

Esta distincion es clave para evitar errores de UX y de calculo:

- `valor en aduana` = base imponible aduanera
- `valor comercial` = precio o referencia comercial

Esto refuerza que el sistema debe separar mejor:

- costo comercial del proveedor
- ajustes a valor en aduana
- tributos calculados sobre base imponible

Y explica por que el flujo de precision debe marcar claramente cuando el valor
es `documental`, `estimado` o `referencial`.

#### 6. Valoracion Aduanera Necesita Alertas De Riesgo

El material de valoracion resalta malas practicas como:

- factura falsa
- doble facturacion
- pagos parciales no declarados
- datos inexactos
- contratos falsos

Esto no cambia el arbol base de preguntas, pero si justifica una capa de
alertas de compliance en el resultado cuando:

- el FOB parece demasiado bajo
- hay incoherencia entre factura, seguro y flete
- hay montos no declarados o documentos incompletos

#### 7. Tributacion Aduanera: Reglas Que Conviene Mostrar Mejor

El PDF reafirma formulas academicas utiles para el sistema:

- `VA = FOB + Flete + Seguro + ajustes`
- `IGV = 16%`
- `IPM = 2%`
- `ISC` segun corresponda

Y en percepcion resalta casos especiales como:

- primera operacion aduanera
- bienes usados
- no RUC o RUC no consignado
- no habido / suspension / baja

Esto confirma dos cosas:

- estuvo bien agregar `bien_usado`
- faltaria en el futuro una capa de validacion mas fina sobre situacion
  tributaria real del importador, si alguna vez se conecta con fuentes
  oficiales o padroneo mas detallado

#### 8. Canales De Control Y Levante Son Resultado, No Pregunta Inicial

El documento de despacho deja claro que:

- el canal de control se asigna cuando la declaracion ya esta vinculada al
  manifiesto y la deuda esta cancelada o garantizada
- el `levante` es una etapa posterior del despacho

Para el producto esto implica:

- no debemos preguntar `canal rojo/verde/naranja`
- debemos mostrarlo como `etapa o recomendacion posterior`, no como input del
  usuario

#### 9. Exportacion Y Regimenes Temporales Deben Ser Modos Separados

El PDF compila:

- exportacion definitiva
- exportacion temporal para reimportacion en el mismo estado
- exportacion temporal para perfeccionamiento pasivo
- drawback

Esto confirma que el sistema no deberia meter estas preguntas dentro del flujo
base de importacion. Si se implementan, deberian vivir en:

- `modo exportacion`
- `modo regimen temporal`
- `modo drawback`

### Conclusion Operativa

Este PDF no obliga a ensuciar el flujo base. Lo que hace es validar varias
decisiones que ya estaban bien encaminadas y agregar subramas claras para una
fase posterior:

- `POSTAL / Importa Facil` con umbrales
- checklist documental por caso
- alertas de valoracion aduanera
- mostrar `levante` y `canal de control` como salida, no como pregunta
- separar importacion, exportacion, temporales y drawback en modos distintos

## Aportes Del PDF "pdf24_merged (1)"

Este material refuerza especialmente la parte de tributacion aduanera y agrega
mejor detalle sobre:

- sujetos de la obligacion tributaria aduanera
- determinacion y exigibilidad de la deuda
- intereses moratorios
- liquidacion de tributos en DAM
- otros regimenes de ingreso
- delitos aduaneros y fraude documental

### Lo Que Aporta Directamente Al Cotizador

#### 1. Reafirma La Formula Tributaria Base

El PDF confirma con ejercicios practicos la estructura academica que el motor
ya usa:

- `VA = FOB + Flete + Seguro`
- `Ad Valorem` sobre `VA`
- `IGV = 16%` sobre base imponible ampliada
- `IPM = 2%` sobre base imponible ampliada
- `ISC` cuando aplique

Tambien vuelve a fijar los niveles de `Ad Valorem`:

- `0%`
- `4%`
- `6%`
- `11%`

Y menciona expresamente la `franja de precios` para ciertos productos
agropecuarios, lo que sirve como recordatorio de una futura rama especializada
si el sistema quiere cubrir esos casos con mas precision.

#### 2. Valida La Logica De Percepcion Que Ya Se Venia Afinando

El material deja explicito:

- `10%`: primera operacion o primer regimen aduanero
- `5%`: nacionalizacion de bienes usados
- `3.5%`: importador que ya realiza un segundo despacho

Esto encaja muy bien con la estructura actual de:

- `tipo_importador`
- `bien_usado`

Y confirma que la pregunta sobre mercancia usada no era un detalle menor, sino
una rama tributaria real.

#### 3. Introduce Un Caso Fuerte Para Seguro De Tabla

El ejemplo de autos nuevos muestra un caso donde el importador no cuenta con
poliza y aplica `seguro de tabla`.

Eso sugiere una mejora futura concreta:

- en la rama de `seguro`, no solo ofrecer:
  - `seguro exacto`
  - `estimar automaticamente`
- sino tambien:
  - `usar seguro de tabla`

Eso haria el flujo mas realista en importaciones donde el usuario conoce FOB y
flete pero no tiene poliza emitida.

#### 4. Distingue Mejor Etapas De La Deuda Aduanera

Este PDF no cambia el calculo del landed cost, pero si ayuda mucho a una capa
de trazabilidad o soporte:

- nacimiento de la obligacion tributaria aduanera
- determinacion
- exigibilidad
- extincion
- prescripcion

Para producto, esto no deberia entrar como pregunta del chat, pero si puede
nutrir:

- notas explicativas
- panel de soporte admin
- reportes de seguimiento para casos observados

#### 5. Intereses Moratorios Son Una Rama Posterior, No Base

El documento desarrolla `TIM`, exigibilidad e intereses moratorios. Eso es muy
util, pero no para la cotizacion base.

Conclusion practica:

- no debemos meter `intereses moratorios` en el flujo comun de cotizacion
- si algun dia se implementa, debe activarse solo cuando:
  - el usuario quiera simular pago tardio
  - exista una DAM numerada y deuda exigible

#### 6. Regimenes Temporales De Ingreso Son Modos Separados

Este PDF desarrolla con mas detalle:

- `Admision Temporal para Reexportacion en el Mismo Estado`
- `Reimportacion en el Mismo Estado`

Y confirma que esos casos tienen:

- plazos propios
- garantia
- canal rojo obligatorio o control especial
- requisitos de RUC y condicion tributaria

Eso valida aun mas la idea de no mezclar estos regimenes con el flujo base de
importacion para consumo.

#### 7. Delitos Aduaneros Y Fraude Deben Traducirse A Alertas

El material aporta mucho a compliance:

- contrabando
- defraudacion de rentas de aduana
- informacion falsa o incompleta
- subvaluacion o sobrevaluacion
- indebida asignacion de subpartida
- falsa declaracion de origen
- mercancias prohibidas o restringidas

Esto no significa que el chat tenga que hacer preguntas penales, pero si
justifica alertas mas serias cuando se detecten patrones de riesgo como:

- FOB anormalmente bajo
- origen incompatible con preferencias declaradas
- HS inconsistente con la descripcion
- documentos incompletos
- operacion sobre mercancia restringida sin sustento

### Conclusion Operativa

Este PDF no pide inflar el arbol con mas pasos obligatorios. Lo que hace es:

- confirmar que la base tributaria del motor va bien encaminada
- validar `bien_usado` y `tipo_importador`
- sugerir una futura opcion de `seguro de tabla`
- reforzar que temporales y regimens especiales deben vivir aparte
- justificar una capa mas fuerte de `alertas de fraude, subvaluacion y riesgo`
