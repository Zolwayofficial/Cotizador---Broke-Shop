# Navegacion resistente SUNAT/SBS 2026

## Objetivo

Resolver el tipo de cambio oficial con esta prioridad:

1. API oficial del BCRP con series SBS compra/venta.
2. SBS oficial publica por HTML simple.
3. SBS oficial con navegador resistente.
4. Referencia externa automatica.
5. Cache reciente.
6. Fallback local.

## Por que existe

Las rutas antiguas y algunos mirrors dejaron de ser estables. Ademas, la SBS
puede responder con paginas de proteccion anti-bot cuando se la consulta como
script HTTP simple.

## Componentes

- `server/sunat-proxy.js`
  Orquestador principal del tipo de cambio.
- `server/tipo-cambio-oficial-resistente.js`
  Wrapper Node que invoca el helper Python solo cuando hace falta.
- `scripts/fetch_official_fx.py`
  Helper opcional con `Camoufox` o `Playwright`.

## Fuente oficial prioritaria

La via mas estable encontrada para produccion es:

- `https://estadisticas.bcrp.gob.pe/estadisticas/series/api/PD04639PD-PD04640PD/json`

Esa API publica del BCRP expone las series SBS de compra y venta y, en la VPS
actual, responde mejor que las paginas modernas de la SBS protegidas por Imperva.
Por eficiencia operativa, se usa como fuente oficial principal y se etiqueta con
`stale=true` si la fecha viene atrasada. La capa resistente queda disponible
para otras rutas oficiales complicadas o para futuras estrategias con proxy.

## Estados de fuente

- `oficial_en_vivo`
- `cache_oficial`
- `referencia_externa`
- `cache_externa`
- `fallback`

## Variables de entorno

- `OFFICIAL_FX_STEALTH_ENABLED`
- `OFFICIAL_FX_STEALTH_TIMEOUT_MS`
- `OFFICIAL_FX_STEALTH_HEADLESS`
- `OFFICIAL_FX_USE_CAMOUFOX`
- `OFFICIAL_FX_BROWSER_CHANNEL`
- `OFFICIAL_FX_PYTHON_BIN`
- `OFFICIAL_FX_CACHE_TTL_MS`

## Dependencias opcionales del helper

Instalar solo si quieres la via resistente:

```bash
python -m pip install playwright
python -m playwright install chromium
```

Opcional para una huella mas fuerte:

```bash
python -m pip install camoufox
```

## Nota operacional

El TC manual del usuario sigue teniendo prioridad. La capa resistente solo se
usa para la referencia automatica cuando no llega un TC manual.
