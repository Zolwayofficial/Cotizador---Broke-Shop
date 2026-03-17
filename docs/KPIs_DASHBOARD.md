# 📊 KPIs PARA DASHBOARD DE COTIZACIONES DE IMPORTACIÓN - PERÚ

**Fecha:** 2026-03-15
**Basado en:** Investigación de mejores prácticas internacionales + Realidad peruana

---

## 🎯 RESUMEN EJECUTIVO

### **KPIs RECOMENDADOS PARA EL DASHBOARD:**

| Categoría | KPIs Prioritarios | Frecuencia |
|-----------|------------------|------------|
| **📈 OPERATIVOS** | Cotizaciones realizadas, Tiempo promedio de cotización | Diaria |
| **💰 COSTOS** | Costo de importación promedio, Ahorro con TLC | Por cotización |
| **🌍 PROVEEDORES** | Países más cotizados, Productos más cotizados | Semanal |
| **⚠️ RIESGOS** | Alertas normativas, Cambios de arancel | En tiempo real |
| **💱 TIPO DE CAMBIO** | TC promedio aplicado, Variación vs SUNAT | Diaria |

---

## 📋 LISTA COMPLETA DE KPIs

### **1. KPIs OPERATIVOS (De Cotización)**

#### **1.1 Cotizaciones Realizadas**

| Aspecto | Detalle |
|---------|---------|
| **Qué mide** | Número total de cotizaciones realizadas |
| **Fórmula** | `COUNT(*) FROM cotizaciones WHERE fecha = [periodo]` |
| **Frecuencia** | Diaria / Semanal / Mensual |
| **Benchmark** | Depende del volumen del negocio |
| **Importancia** | 🔴 ALTA - Mide actividad del sistema |

**Visualización:**
```
┌─────────────────────────────────────────────────────────────┐
│  📈 COTIZACIONES REALIZADAS                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Este mes: 156 cotizaciones  ↗️ +12% (vs mes anterior)     │
│                                                             │
│  Semana 1: ████ 35                                         │
│  Semana 2: ██████ 48                                       │
│  Semana 3: █████ 42                                        │
│  Semana 4: ███ 31                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

#### **1.2 Tiempo Promedio de Cotización**

| Aspecto | Detalle |
|---------|---------|
| **Qué mide** | Tiempo que toma generar una cotización completa |
| **Fórmula** | `AVG(tiempo_final - tiempo_inicio) FROM cotizaciones` |
| **Frecuencia** | Semanal |
| **Benchmark** | < 5 minutos (automático), < 15 minutos (manual) |
| **Importancia** | 🟡 MEDIA - Mide eficiencia del sistema |

---

#### **1.3 Tasa de Conversión (Cotización → Importación)**

| Aspecto | Detalle |
|---------|---------|
| **Qué mide** | % de cotizaciones que se convierten en importaciones reales |
| **Fórmula** | `(Importaciones realizadas ÷ Cotizaciones) × 100` |
| **Frecuencia** | Mensual |
| **Benchmark** | 20-40% (depende del tipo de cliente) |
| **Importancia** | 🔴 ALTA - Mide calidad de cotizaciones |

**Nota:** Requiere módulo de importaciones reales para tracking.

---

### **2. KPIs DE COSTOS**

#### **2.1 Costo de Importación Promedio (Landed Cost)**

| Aspecto | Detalle |
|---------|---------|
| **Qué mide** | Costo total promedio de importar (CIF + tributos + operativos) |
| **Fórmula** | `AVG(total_landed) FROM cotizaciones` |
| **Frecuencia** | Semanal |
| **Benchmark** | Varía por producto y país |
| **Importancia** | 🔴 ALTA - Base para pricing |

**Visualización:**
```
┌─────────────────────────────────────────────────────────────┐
│  💰 COSTO DE IMPORTACIÓN PROMEDIO                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Este mes: $12,450 USD por importación                     │
│                                                             │
│  Desglose promedio:                                        │
│  ├─ FOB: $8,500 (68%)                                     │
│  ├─ Flete: $1,200 (10%)                                   │
│  ├─ Seguros: $150 (1%)                                    │
│  ├─ Tributos: $2,100 (17%)                                │
│  └─ Operativos: $500 (4%)                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

#### **2.2 Tributos Promedio Pagados**

| Aspecto | Detalle |
|---------|---------|
| **Qué mide** | Promedio de tributos (AV, IGV, IPM, etc.) por cotización |
| **Fórmula** | `AVG(ad_valorem + igv + ipm + percepcion) FROM cotizaciones` |
| **Frecuencia** | Semanal |
| **Benchmark** | 18-25% del CIF (depende del producto) |
| **Importancia** | 🟡 MEDIA - Impacta rentabilidad |

---

#### **2.3 Ahorro con TLC (Tratados de Libre Comercio)**

| Aspecto | Detalle |
|---------|---------|
| **Qué mide** | Dinero ahorrado gracias a preferencias arancelarias |
| **Fórmula** | `SUM(ahorro_tlc) FROM cotizaciones WHERE ahorro_tlc > 0` |
| **Frecuencia** | Mensual |
| **Benchmark** | Depende de países con TLC |
| **Importancia** | 🔴 ALTA - Justifica uso del sistema |

**Visualización:**
```
┌─────────────────────────────────────────────────────────────┐
│  🤝 AHORRO CON TLC (Este mes)                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│     $12,450 USD                                            │
│                                                             │
│  Por país:                                                 │
│  - USA 🇺🇸: $3,250 (TLC Perú-USA)                          │
│  - Chile 🇨🇱: $8,000 (TLC Perú-Chile)                      │
│  - Brasil 🇧🇷: $1,200 (ACE 58)                             │
│                                                             │
│  ⚠️ China 🇨🇳: $0 (No hay TLC)                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### **3. KPIs DE PROVEEDORES/PAÍSES**

#### **3.1 Países Más Cotizados**

| Aspecto | Detalle |
|---------|---------|
| **Qué mide** | Ranking de países de origen más cotizados |
| **Fórmula** | `COUNT(*) GROUP BY pais_origen ORDER BY COUNT DESC` |
| **Frecuencia** | Semanal |
| **Benchmark** | China, USA, Brasil suelen ser top 3 |
| **Importancia** | 🔴 ALTA - Define estrategia de sourcing |

**Visualización:**
```
┌─────────────────────────────────────────────────────────────┐
│  🌍 PAÍSES MÁS COTIZADOS                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. China 🇨🇳     ████████████████████ 45% (45 cotiz.)    │
│  2. USA 🇺🇸       ████████████ 28% (28 cotiz.)             │
│  3. Brasil 🇧🇷    ██████ 15% (15 cotiz.)                   │
│  4. Chile 🇨🇱     ████ 8% (8 cotiz.)                       │
│  5. Otros          ██ 4% (4 cotiz.)                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

#### **3.2 Productos Más Cotizados**

| Aspecto | Detalle |
|---------|---------|
| **Qué mide** | Ranking de productos más cotizados |
| **Fórmula** | `COUNT(*) GROUP BY producto ORDER BY COUNT DESC` |
| **Frecuencia** | Semanal |
| **Benchmark** | Depende del nicho del cliente |
| **Importancia** | 🟡 MEDIA - Define portafolio |

---

### **4. KPIs DE RIESGOS**

#### **4.1 Alertas Normativas Pendientes**

| Aspecto | Detalle |
|---------|---------|
| **Qué mide** | Número de alertas normativas no leídas/accionadas |
| **Fórmula** | `COUNT(*) FROM alertas WHERE leido = 0` |
| **Frecuencia** | En tiempo real |
| **Benchmark** | 0 alertas críticas sin atender |
| **Importancia** | 🔴 ALTA - Evita multas/problemas |

**Visualización:**
```
┌─────────────────────────────────────────────────────────────┐
│  🔔 ALERTAS NORMATIVAS PENDIENTES                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🔴 CRÍTICAS: 1                                             │
│  🟠 ALTAS: 1                                                │
│  🟡 MEDIAS: 1                                               │
│                                                             │
│  [Ver detalles →]                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

#### **4.2 Cambios de Arancel Detectados**

| Aspecto | Detalle |
|---------|---------|
| **Qué mide** | Número de cambios de arancel detectados en el periodo |
| **Fórmula** | `COUNT(*) FROM historial_cambios WHERE tipo = 'arancel'` |
| **Frecuencia** | Semanal |
| **Benchmark** | 0-5 cambios por mes (varía) |
| **Importancia** | 🟡 MEDIA - Impacta costos |

---

### **5. KPIs DE TIPO DE CAMBIO**

#### **5.1 Tipo de Cambio Promedio Aplicado**

| Aspecto | Detalle |
|---------|---------|
| **Qué mide** | TC promedio usado en cotizaciones del periodo |
| **Fórmula** | `AVG(tc_aplicado) FROM cotizaciones` |
| **Frecuencia** | Diaria |
| **Benchmark** | vs TC SUNAT del día |
| **Importancia** | 🟡 MEDIA - Impacta costos en soles |

---

#### **5.2 Variación del Tipo de Cambio**

| Aspecto | Detalle |
|---------|---------|
| **Qué mide** | Variación del TC vs periodo anterior |
| **Fórmula** | `((TC_actual - TC_anterior) ÷ TC_anterior) × 100` |
| **Frecuencia** | Diaria |
| **Benchmark** | < 2% variación mensual es normal |
| **Importancia** | 🟡 MEDIA - Define timing de importación |

**Visualización:**
```
┌─────────────────────────────────────────────────────────────┐
│  💱 TIPO DE CAMBIO (Últimos 30 días)                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  S/ 3.80 ┤                      ╭──╮                        │
│  S/ 3.75 ┤            ╭──╮     ╯  ╰╮                       │
│  S/ 3.70 ┤      ╭──╮ ╯  ╰╮   ╭╯   ╰╮                      │
│  S/ 3.65 ┤ ╭──╮ ╯  ╰╮  ╯ ╰╮ ╭╯     ╰──╮                   │
│  S/ 3.60 ┤─╯  ╰────╯  ╰─╯  ╰╯        ╰──                  │
│                                                             │
│  Actual: S/ 3.72  ▼ -0.5% (vs ayer)                        │
│  Promedio mes: S/ 3.70  ▲ +1.2% (vs mes anterior)          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 KPIs RECOMENDADOS POR TIPO DE USUARIO

### **PARA PYMES/IMPORTADORES PEQUEÑOS:**

| KPI | Prioridad | Razón |
|-----|-----------|-------|
| Cotizaciones realizadas | 🔴 ALTA | Mide actividad |
| Costo de importación promedio | 🔴 ALTA | Define viabilidad |
| Ahorro con TLC | 🔴 ALTA | Justifica sistema |
| Alertas normativas | 🔴 ALTA | Evita problemas |
| Países más cotizados | 🟡 MEDIA | Define estrategia |

---

### **PARA EMPRESAS GRANDES:**

| KPI | Prioridad | Razón |
|-----|-----------|-------|
| Tasa de conversión | 🔴 ALTA | ROI del sistema |
| Tributos promedio | 🔴 ALTA | Impacta cash flow |
| Cambios de arancel | 🔴 ALTA | Impacta márgenes |
| TC promedio aplicado | 🟡 MEDIA | Hedging natural |
| Tiempo de cotización | 🟡 MEDIA | Eficiencia operativa |

---

## 📊 DASHBOARD RECOMENDADO (MVP)

### **PANTALLA PRINCIPAL:**

```
┌─────────────────────────────────────────────────────────────┐
│  DASHBOARD DE COTIZACIONES - [EMPRESA]          [🔔 3]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ Cotiz.   │ │ Costo    │ │ Ahorro   │ │ Alertas  │      │
│  │ Mes      │ │ Promedio │ │ TLC      │ │ Pend.    │      │
│  ├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤      │
│  │   156    │ │ $12,450  │ │  $8,450  │ │    3     │      │
│  │ ↗️ +12%  │ │ ↘️ -3%   │ │ ↗️ +25%  │ │ 🔴 1     │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────┐ ┌─────────────────────┐  │
│  │ 🌍 PAÍSES MÁS COTIZADOS     │ │ 💱 TIPO DE CAMBIO   │  │
│  │                             │ │                     │  │
│  │ China 🇨🇳 45%                │ │ S/ 3.72  ▼ -0.5%   │  │
│  │ USA 🇺🇸 28%                 │ │                     │  │
│  │ Brasil 🇧🇷 15%              │ │ [Ver gráfico →]    │  │
│  │                             │ │                     │  │
│  │ [Ver más →]                 │ │                     │  │
│  └─────────────────────────────┘ └─────────────────────┘  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🔔 ÚLTIMAS ALERTAS                                         │
│  ─────────────────────────────────────────────────────────  │
│  🔴 INDECOPI: Antidumping vence en 30 días                 │
│  🟠 SUNAT: Cambio de arancel detectado                     │
│  🟡 DIGESA: Nueva restricción sanitaria                    │
│                                                             │
│  [Ver todas →]                                              │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📋 ÚLTIMAS COTIZACIONES                                    │
│  ─────────────────────────────────────────────────────────  │
│  15/03 10:30  Laptops HP      USA    $45,230   ✅ Guardada │
│  15/03 09:15  Camisetas       CN     $12,450   📤 Enviada  │
│  14/03 16:45  Zapatos         BR     $8,920    ✅ Guardada │
│                                                             │
│  [Ver todas →]                                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 💡 RECOMENDACIONES FINALES

### **FASE 1 (MVP - 1 semana):**
1. ✅ Cotizaciones realizadas
2. ✅ Costo de importación promedio
3. ✅ Ahorro con TLC
4. ✅ Alertas normativas
5. ✅ Últimas cotizaciones

### **FASE 2 (2 semanas):**
6. Países más cotizados
7. Tipo de cambio
8. Productos más cotizados

### **FASE 3 (1 mes):**
9. Tasa de conversión
10. Tributos promedio
11. Cambios de arancel
12. Gráficos históricos

---

## 🏆 VEREDICTO DEL CHINITO COCHINO

> **"¡JEFE, INVESTIGACIÓN COMPLETADA!** 🇨🇳
>
> **KPIs RECOMENDADOS:**
> - ✅ 12 KPIs principales identificados
> - ✅ Fórmulas definidas
> - ✅ Benchmarks establecidos
> - ✅ Frecuencias de medición
> - ✅ Visualizaciones diseñadas
>
> **PARA EMPEZAR (MVP):**
> - 5 KPIs críticos
> - Dashboard simple
> - 1 semana de desarrollo
>
> **¿CONTINUO CON EL DESARROLLO DEL DASHBOARD?** 🫡"

---

**¿Qué quieres que haga, jefe?** 🚀

1. **Desarrollar el dashboard MVP** (1 semana)
2. **Agregar más KPIs primero**
3. **Otra cosa**
