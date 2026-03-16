// tests/unit/dashboard.test.js
// Tests unitarios para Dashboard Service

const { describe, it, expect, beforeEach } = require('@jest/globals');

describe('Dashboard Service', () => {
  let dashboardService;

  beforeEach(() => {
    // Resetear módulo para tests limpios
    jest.resetModules();
    dashboardService = require('../../server/dashboard/dashboard-service');
  });

  describe('obtenerDatosDashboard()', () => {
    it('debería obtener datos del dashboard', async () => {
      const datos = await dashboardService.obtenerDatosDashboard({});
      
      expect(datos).toBeDefined();
      expect(datos.kpis).toBeDefined();
      expect(datos.graficos).toBeDefined();
      expect(datos.tendencias).toBeDefined();
    });

    it('debería usar cache para requests repetidos', async () => {
      const datos1 = await dashboardService.obtenerDatosDashboard({});
      const datos2 = await dashboardService.obtenerDatosDashboard({});
      
      // Debería ser el mismo objeto (cache)
      expect(datos1).toBe(datos2);
    });
  });

  describe('analizarConIA()', () => {
    it('debería analizar datos con IA', async () => {
      const datos = {
        kpis: { totalCotizaciones: { valor: 100 } }
      };
      
      const analisis = await dashboardService.analizarConIA(datos);
      
      expect(analisis).toBeDefined();
      expect(analisis.insights).toBeDefined();
      expect(Array.isArray(analisis.insights)).toBe(true);
    });

    it('debería hacer fallback si IA falla', async () => {
      const datos = {};
      
      const analisis = await dashboardService.analizarConIA(datos);
      
      expect(analisis).toBeDefined();
      expect(analisis.insights).toBeDefined();
    });
  });

  describe('sugerirGraficos()', () => {
    it('debería sugerir gráficos', async () => {
      const datos = {
        kpis: { totalCotizaciones: { valor: 100 } }
      };
      
      const graficos = await dashboardService.sugerirGraficos(datos);
      
      expect(graficos).toBeDefined();
    });
  });

  describe('chatConDatos()', () => {
    it('debería responder preguntas', async () => {
      const pregunta = '¿Cuál es el total de cotizaciones?';
      const datos = {
        kpis: { totalCotizaciones: { valor: 100 } }
      };
      
      const respuesta = await dashboardService.chatConDatos(pregunta, datos);
      
      expect(respuesta).toBeDefined();
      expect(typeof respuesta).toBe('string');
    });
  });

  describe('generarSQL()', () => {
    it('debería generar SQL', async () => {
      const pregunta = 'Obtener todas las cotizaciones';
      const schema = {
        tablas: {
          cotizaciones: ['id', 'producto', 'total']
        }
      };
      
      const sql = await dashboardService.generarSQL(pregunta, schema);
      
      expect(sql).toBeDefined();
      expect(typeof sql).toBe('string');
      expect(sql.toLowerCase()).toContain('select');
    });
  });

  describe('limpiarCache()', () => {
    it('debería limpiar la cache', () => {
      dashboardService.limpiarCache();
      expect(dashboardService.obtenerEstadisticas().cacheSize).toBe(0);
    });
  });
});
