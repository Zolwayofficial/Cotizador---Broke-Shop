// server/dashboard/dashboard-service.js
// 
// SERVICIO DE DASHBOARD ENTERPRISE
// 
// Features:
// - Análisis de datos con IA (GROQ)
// - KPIs en tiempo real
// - Insights automáticos
// - Gráficos sugeridos por IA
// - 100% gratis con GROQ

const Groq = require('groq-sdk');

// Inicializar GROQ
const groq = new Groq({ 
  apiKey: process.env.GROQ_API_KEY || ''
});

// ═══════════════════════════════════════════════════
// MODELOS DE GROQ
// ═══════════════════════════════════════════════════

const MODELOS = {
  // ✅ ILIMITADOS
  RAPIDO: 'llama-3.1-8b-instant',      // ∞ requests/día - Tiempo real
  CODER: 'qwen-2.5-coder-32b',         // ∞ requests/día - SQL/Código
  DEEPSEEK: 'deepseek-r1-distill-llama-70b', // ∞ requests/día - Razonamiento
  
  // ⚠️ CON LÍMITE (pero generoso)
  POTENTE: 'llama-3.3-70b-versatile',  // 14,400/día - Análisis profundo
  MIXTRAL: 'mixtral-8x7b-32768'        // 14,400/día - Balance
};

// ═══════════════════════════════════════════════════
// SERVICIO DE DASHBOARD
// ═══════════════════════════════════════════════════

class DashboardService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutos
  }

  // ═══════════════════════════════════════════════════
  // OBTENER DATOS DEL DASHBOARD
  // ═══════════════════════════════════════════════════

  async obtenerDatosDashboard(filtros = {}) {
    const cacheKey = `dashboard:${JSON.stringify(filtros)}`;
    
    // Verificar cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    // Obtener datos de la base de datos
    const datos = {
      // KPIs principales
      kpis: await this._obtenerKPIs(filtros),
      
      // Datos para gráficos
      graficos: await this._obtenerDatosGraficos(filtros),
      
      // Tendencias
      tendencias: await this._obtenerTendencias(filtros),
      
      // Top productos/países
      tops: await this._obtenerTops(filtros),
      
      // Alertas
      alertas: await this._obtenerAlertas(filtros)
    };

    // Guardar en cache
    this.cache.set(cacheKey, {
      data: datos,
      timestamp: Date.now()
    });

    return datos;
  }

  // ═══════════════════════════════════════════════════
  // KPIs PRINCIPALES
  // ═══════════════════════════════════════════════════

  async _obtenerKPIs(filtros) {
    // Aquí irían las queries reales a la BD
    // Por ahora usamos datos de ejemplo
    
    return {
      totalCotizaciones: {
        valor: 1250,
        variacion: 12.5,
        tendencia: 'up'
      },
      totalDolares: {
        valor: 2450000,
        variacion: 8.3,
        tendencia: 'up',
        formato: 'USD'
      },
      ticketPromedio: {
        valor: 1960,
        variacion: -3.2,
        tendencia: 'down',
        formato: 'USD'
      },
      paisesActivos: {
        valor: 15,
        variacion: 2,
        tendencia: 'up'
      },
      tasaConversion: {
        valor: 68.5,
        variacion: 5.1,
        tendencia: 'up',
        formato: '%'
      },
      ahorroTLC: {
        valor: 125000,
        variacion: 15.7,
        tendencia: 'up',
        formato: 'USD'
      }
    };
  }

  // ═══════════════════════════════════════════════════
  // DATOS PARA GRÁFICOS
  // ═══════════════════════════════════════════════════

  async _obtenerDatosGraficos(filtros) {
    return {
      // Evolución mensual
      evolucionMensual: {
        tipo: 'line',
        titulo: 'Evolución de Cotizaciones (Últimos 6 meses)',
        datos: [
          { mes: 'Ene', cotizaciones: 180, dolares: 350000 },
          { mes: 'Feb', cotizaciones: 220, dolares: 420000 },
          { mes: 'Mar', cotizaciones: 195, dolares: 380000 },
          { mes: 'Abr', cotizaciones: 240, dolares: 480000 },
          { mes: 'May', cotizaciones: 210, dolares: 410000 },
          { mes: 'Jun', cotizaciones: 205, dolares: 410000 }
        ]
      },
      
      // Distribución por país
      distribucionPaises: {
        tipo: 'pie',
        titulo: 'Distribución por País de Origen',
        datos: [
          { pais: 'China 🇨🇳', valor: 45 },
          { pais: 'USA 🇺🇸', valor: 28 },
          { pais: 'Brasil 🇧🇷', valor: 15 },
          { pais: 'Chile 🇨🇱', valor: 8 },
          { pais: 'Otros', valor: 4 }
        ]
      },
      
      // Top productos
      topProductos: {
        tipo: 'bar',
        titulo: 'Top 10 Productos Más Cotizados',
        datos: [
          { producto: 'Laptops', valor: 156 },
          { producto: 'Celulares', valor: 142 },
          { producto: 'Camisetas', valor: 128 },
          { producto: 'Zapatos', valor: 95 },
          { producto: 'Bolsos', valor: 82 }
        ]
      }
    };
  }

  // ═══════════════════════════════════════════════════
  // TENDENCIAS
  // ═══════════════════════════════════════════════════

  async _obtenerTendencias(filtros) {
    return [
      {
        titulo: 'Aumento en importaciones desde China',
        descripcion: '+15% en el último mes',
        impacto: 'alto',
        tipo: 'oportunidad'
      },
      {
        titulo: 'Reducción de costos de flete',
        descripcion: '-8% en fletes marítimos',
        impacto: 'medio',
        tipo: 'oportunidad'
      },
      {
        titulo: 'Nuevas restricciones en textiles',
        descripcion: 'Requiere permisos adicionales',
        impacto: 'alto',
        tipo: 'alerta'
      }
    ];
  }

  // ═══════════════════════════════════════════════════
  // TOPS
  // ═══════════════════════════════════════════════════

  async _obtenerTops(filtros) {
    return {
      topPaises: [
        { pais: 'China', codigo: 'CN', total: 1102500, variacion: 15.2 },
        { pais: 'Estados Unidos', codigo: 'US', total: 686000, variacion: 8.5 },
        { pais: 'Brasil', codigo: 'BR', total: 367500, variacion: -2.3 }
      ],
      topProductos: [
        { producto: 'Laptops HP', total: 245000, variacion: 22.1 },
        { producto: 'Celulares Xiaomi', total: 198000, variacion: 18.5 },
        { producto: 'Camisetas Algodón', total: 156000, variacion: 12.3 }
      ],
      topCouriers: [
        { courier: 'DHL', total: 425, variacion: 5.2 },
        { courier: 'FedEx', total: 380, variacion: 8.1 },
        { courier: 'UPS', total: 295, variacion: -1.5 }
      ]
    };
  }

  // ═══════════════════════════════════════════════════
  // ALERTAS
  // ═══════════════════════════════════════════════════

  async _obtenerAlertas(filtros) {
    return [
      {
        id: 1,
        tipo: 'critico',
        titulo: 'API Shippo cerca del límite',
        mensaje: 'Has usado 3,847 de 5,000 requests este mes',
        timestamp: new Date().toISOString(),
        accion: 'Considera cambiar a contratos directos'
      },
      {
        id: 2,
        tipo: 'alerta',
        titulo: 'Cambio de arancel detectado',
        mensaje: 'Partida 8471.30.00.00: Ad Valorem cambió de 0% a 6%',
        timestamp: new Date().toISOString(),
        accion: 'Revisar cotizaciones pendientes'
      },
      {
        id: 3,
        tipo: 'info',
        titulo: 'Nuevo TLC disponible',
        mensaje: 'TLC con Tailandia ya está activo',
        timestamp: new Date().toISOString(),
        accion: 'Aprovechar para nuevas cotizaciones'
      }
    ];
  }

  // ═══════════════════════════════════════════════════
  // ANÁLISIS CON IA (GROQ)
  // ═══════════════════════════════════════════════════

  async analizarConIA(datos) {
    try {
      // ✅ Usamos modelo ILIMITADO para análisis rápido
      const completion = await groq.chat.completions.create({
        messages: [{
          role: "user",
          content: `
            Analiza estos datos de dashboard de importaciones y proporciona:
            
            1. 3 insights principales
            2. 2 oportunidades detectadas
            3. 1 alerta importante
            4. Recomendación estratégica
            
            Datos:
            ${JSON.stringify(datos, null, 2)}
            
            Responde en JSON estructurado:
            {
              "insights": ["...", "...", "..."],
              "oportunidades": ["...", "..."],
              "alerta": "...",
              "recomendacion": "..."
            }
          `
        }],
        model: MODELOS.RAPIDO, // ✅ ILIMITADO
        response_format: { type: "json_object" },
        max_tokens: 1000
      });

      return JSON.parse(completion.choices[0].message.content);
    } catch (e) {
      console.error('[DASHBOARD] Error analizando con IA:', e.message);
      
      // Fallback sin IA
      return {
        insights: [
          'Total de cotizaciones en aumento',
          'China mantiene como principal país de origen',
          'Tiket promedio estable'
        ],
        oportunidades: [
          'Explorar nuevos proveedores en Brasil',
          'Negociar mejores tarifas con couriers'
        ],
        alerta: 'Monitorear cambios de arancel',
        recomendacion: 'Continuar diversificando países de origen'
      };
    }
  }

  // ═══════════════════════════════════════════════════
  // GENERAR GRÁFICOS SUGERIDOS POR IA
  // ═══════════════════════════════════════════════════

  async sugerirGraficos(datos) {
    try {
      // ✅ Usamos modelo ILIMITADO
      const completion = await groq.chat.completions.create({
        messages: [{
          role: "user",
          content: `
            Basado en estos datos, sugiere los 5 mejores gráficos para visualizar:
            
            ${JSON.stringify(datos, null, 2)}
            
            Para cada gráfico proporciona:
            - tipo: 'bar' | 'line' | 'pie' | 'area' | 'scatter'
            - titulo: Título descriptivo
            - datos: Array de datos para el gráfico
            - insights: Qué se puede inferir
            
            Responde en JSON array:
            [
              {
                "tipo": "line",
                "titulo": "...",
                "datos": [...],
                "insights": "..."
              }
            ]
          `
        }],
        model: MODELOS.RAPIDO, // ✅ ILIMITADO
        response_format: { type: "json_object" },
        max_tokens: 1500
      });

      return JSON.parse(completion.choices[0].message.content);
    } catch (e) {
      console.error('[DASHBOARD] Error sugiriendo gráficos:', e.message);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════
  // CHAT CON DATOS (PREGUNTAR CUALQUIER COSA)
  // ═══════════════════════════════════════════════════

  async chatConDatos(pregunta, datos) {
    try {
      // ✅ Usamos modelo ILIMITADO para chat
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `Eres un analista experto en importaciones peruanas.
            Responde preguntas de forma clara, concisa y profesional.
            Usa datos concretos cuando estén disponibles.
            Si no tienes suficiente información, dilo honestamente.`
          },
          {
            role: "user",
            content: `${pregunta}\n\nDatos disponibles:\n${JSON.stringify(datos, null, 2)}`
          }
        ],
        model: MODELOS.RAPIDO, // ✅ ILIMITADO
        max_tokens: 1000
      });

      return completion.choices[0].message.content;
    } catch (e) {
      console.error('[DASHBOARD] Error en chat:', e.message);
      return 'Lo siento, tuve un error procesando tu pregunta. Por favor intenta de nuevo.';
    }
  }

  // ═══════════════════════════════════════════════════
  // GENERAR QUERY SQL CON IA
  // ═══════════════════════════════════════════════════

  async generarSQL(pregunta, schema) {
    try {
      // ✅ Usamos modelo ESPECIALIZADO en código (ILIMITADO)
      const completion = await groq.chat.completions.create({
        messages: [{
          role: "user",
          content: `
            Genera una query SQL para esta pregunta:
            
            Pregunta: ${pregunta}
            
            Schema de la base de datos:
            ${JSON.stringify(schema, null, 2)}
            
            Proporciona SOLO la query SQL, sin explicaciones.
          `
        }],
        model: MODELOS.CODER, // ✅ ILIMITADO + Especializado
        max_tokens: 500
      });

      return completion.choices[0].message.content.trim();
    } catch (e) {
      console.error('[DASHBOARD] Error generando SQL:', e.message);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════
  // LIMPIAR CACHE
  // ═══════════════════════════════════════════════════

  limpiarCache() {
    this.cache.clear();
    console.log('[DASHBOARD] Cache limpiada');
  }

  // ═══════════════════════════════════════════════════
  // ESTADÍSTICAS DEL DASHBOARD
  // ═══════════════════════════════════════════════════

  obtenerEstadisticas() {
    return {
      cacheSize: this.cache.size,
      cacheTTL: this.cacheTTL,
      modelos: MODELOS
    };
  }
}

// ═══════════════════════════════════════════════════
// EXPORTAR INSTANCIA ÚNICA
// ═══════════════════════════════════════════════════

const dashboardService = new DashboardService();

module.exports = dashboardService;
