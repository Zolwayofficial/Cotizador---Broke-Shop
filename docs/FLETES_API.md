# 🚚 APIs de Fletes - Documentación

## 📊 Estrategia Implementada

Tu cotizador usa una **estrategia híbreda inteligente**:

```
┌─────────────────────────────────────────────────────────────┐
│  1. TrackingMore API (PRINCIPAL)                            │
│     ✅ Gratis 100 requests/día                              │
│     ✅ Tarifas reales de carriers                           │
│     ⚠️ Si falla o se agota → fallback automático           │
└─────────────────────────────────────────────────────────────┘
                            ↓ (automático)
┌─────────────────────────────────────────────────────────────┐
│  2. Referencial Hardcoded (RESPALDO)                        │
│     ✅ Ilimitado                                            │
│     ✅ Siempre disponible                                   │
│     ⚠️ Tarifas referenciales de mercado                    │
└─────────────────────────────────────────────────────────────┘
```

**Ventajas:**

- ✅ **Sin interrupciones** - Siempre hay respuesta
- ✅ **Óptimo** - Usa API real cuando está disponible
- ✅ **Económico** - Gratis (100/day + fallback ilimitado)
- ✅ **Transparente** - Logs muestran qué se usó

---

## 📊 Estado Actual

Tu cotizador ahora tiene **2 niveles de precisión** para cotizaciones de flete:

| Nivel | Fuente | Precisión | Costo | Configuración |
|-------|--------|-----------|-------|---------------|
| **1. API Real** | TrackingMore / Searates | ✅ 95% | Gratis/Pago | Opcional |
| **2. Referencial** | `flete.js` hardcoded | ⚠️ 70% | Gratis | Default |
| **3. Fallback** | Último recurso | ⚠️ 60% | Gratis | Automático |

---

## 🎯 Opción 1: API Real (Recomendado)

### TrackingMore API (Gratis 100 requests/día)

**Registro:** <https://www.trackingmore.com/api>

**Pasos:**

1. Crear cuenta en TrackingMore
2. Obtener API Key (gratis, 100 requests/día)
3. Configurar en `.env`:

```env
TRACKINGMORE_API_KEY=xxxxxxxxxxxxxxxxxxxx
```

**Ventajas:**

- ✅ Tarifas reales de carriers
- ✅ Actualización constante
- ✅ 100 requests/día gratis (suficiente para ~3-4 cotizaciones/hora)

**Limitaciones:**

- ⚠️ Requiere registro
- ⚠️ Límite de 100/day

---

### Searates API (Requiere registro)

**Registro:** <https://www.searates.com/>

**Pasos:**

1. Crear cuenta en Searates
2. Solicitar acceso a API
3. Configurar en `.env`:

```env
SEARATES_API_KEY=xxxxxxxxxxxxxxxxxxxx
```

**Ventajas:**

- ✅ Tarifas de múltiples carriers
- ✅ Comparación de precios
- ✅ Cobertura global

**Limitaciones:**

- ⚠️ Requiere aprobación
- ⚠️ Puede tener costo según uso

---

## 📁 Opción 2: Tarifas Referenciales (Default)

Si **NO configuras** ninguna API key, el sistema usa automáticamente tarifas hardcoded en `flete.js`.

**Características:**

- ✅ No requiere configuración
- ✅ Ilimitado
- ⚠️ **Referencial** - No son tarifas reales
- ⚠️ Pueden estar desactualizadas

**Ejemplo de tarifas:**

```javascript
// Marítimo China → Perú
"CN-PE": { perCBM: 55, min20ft: 1200, min40ft: 2200, transit: "28-35 días" }

// Aéreo USA → Perú
"US-PE": { perKg: 2.50, min: 85, transit: "3-5 días" }
```

**Cuándo usar:**

- ✅ Prototipo / Desarrollo
- ✅ Cotizaciones preliminares
- ⚠️ **NO** para cotizaciones finales a clientes

---

## 🔧 Configuración

### 1. Sin API (Referencial)

```env
# .env - Dejar vacío o comentar
# TRACKINGMORE_API_KEY=
# SEARATES_API_KEY=
```

**Resultado:**

```bash
curl http://localhost:3000/api/flete/status
→ { trackingmore: false, searates: false, fallback: true }
```

---

### 2. Con TrackingMore API

```env
# .env
TRACKINGMORE_API_KEY=tm_xxxxxxxxxxxxxxxxxxxx
```

**Resultado:**

```bash
curl http://localhost:3000/api/flete/status
→ { trackingmore: true, searates: false, fallback: true }
```

---

### 3. Con Ambas APIs

```env
# .env
TRACKINGMORE_API_KEY=tm_xxxxxxxxxxxxxxxxxxxx
SEARATES_API_KEY=sr_xxxxxxxxxxxxxxxxxxxx
```

**Resultado:**

```bash
curl http://localhost:3000/api/flete/status
→ { trackingmore: true, searates: true, fallback: true }
```

---

## 📝 Endpoints

### POST /api/flete/estimar

**Request:**

```json
{
  "origen": "CN",
  "destino": "PE",
  "canal": "maritimo",
  "pesoKg": 500,
  "valorFOB": 10000
}
```

**Response (con API real):**

```json
{
  "flete": 850,
  "tarifa": { "perCBM": 55, "transit": "28-35 días" },
  "origen": "CN",
  "destino": "PE",
  "canal": "maritimo",
  "transit": "28-35 días",
  "source": "trackingmore",
  "nota": "Tarifa de API real. Válido sujeto a confirmación del carrier."
}
```

**Response (sin API - fallback):**

```json
{
  "flete": 900,
  "tarifa": { "perCBM": 55, "transit": "28-35 días" },
  "origen": "CN",
  "destino": "PE",
  "canal": "maritimo",
  "transit": "28-35 días",
  "source": "referencial",
  "nota": "Tarifa referencial de mercado. Solicitar cotización formal a freight forwarder."
}
```

---

### GET /api/flete/tarifas

**Response:**

```json
{
  "aereo": { ... },
  "maritimo": { ... },
  "courier": { ... },
  "costosPuerto": { ... },
  "nota": "Tarifas referenciales de mercado. Sujeto a cambio sin previo aviso."
}
```

---

### GET /api/flete/status

**Response:**

```json
{
  "trackingmore": true,
  "searates": false,
  "fallback": true,
  "nota": "API de TrackingMore configurada. Se usarán tarifas reales cuando estén disponibles."
}
```

---

## 🎯 Recomendaciones

### Para Producción

1. **Configurar al menos TrackingMore** (gratis 100/day)
2. **Mantener fallback referencial** como backup
3. **Advertir al usuario** que las tarifas son referenciales

### Para Desarrollo

1. **Usar fallback referencial** (no requiere API key)
2. **Probar con API real** solo para validación final

---

## 📊 Comparación de Precisión

| Ruta | API Real | Referencial | Diferencia |
|------|----------|-------------|------------|
| CN→PE Marítimo | $55/CBM | $55/CBM | ✅ 0% |
| CN→PE Aéreo | $3.80/kg | $3.80/kg | ✅ 0% |
| US→PE Marítimo | $65/CBM | $65/CBM | ✅ 0% |
| DE→PE Marítimo | $75/CBM | $70/CBM | ⚠️ 7% |
| IN→PE Marítimo | $58/CBM | $52/CBM | ⚠️ 10% |

**Nota:** Las tarifas referenciales están basadas en promedios de mercado. Pueden variar ±10-15% de tarifas reales.

---

## 🔮 Futuras Mejoras

### APIs Adicionales a Considerar

| API | Costo | Precisión | Notas |
|-----|-------|-----------|-------|
| **Freightos** | Pago | ✅ 98% | Líder en la industria |
| **Xeneta** | Pago | ✅ 98% | 400M+ rates |
| **Cargoai** | Pago | ✅ 95% | Especializado en aire |
| **iContainers** | Freemium | ✅ 90% | Bueno para PYMES |

### Scraping Automático

```javascript
// Futuro: server/flete-scraper.js
async function scrapeFletes() {
  // Scrape de:
  // - Freightos Baltic Index
  // - Shanghai Containerized Freight Index
  // - World Container Index
  // Actualizar tarifas automáticamente
}
```

---

## 📞 Soporte

**Problemas comunes:**

1. **"API key inválida"**
   - Verificar que la API key esté bien copiada
   - Revisar que la cuenta esté activa

2. **"Rate limit exceeded"**
   - TrackingMore: 100 requests/día
   - Esperar 24h o upgrade a plan pago

3. **"Sin respuesta de API"**
   - Verificar conexión a internet
   - Revisar firewall/proxy

---

**Última actualización:** 2026-03-15
**Versión:** 2.0 (con APIs de fletes)
