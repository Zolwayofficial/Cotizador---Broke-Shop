const { describe, it, expect } = require("@jest/globals");

function loadDashboardService(rows = []) {
  jest.resetModules();
  jest.doMock("../../server/db", () => ({
    listQuotations: jest.fn(() => rows),
  }));

  return require("../../server/dashboard/dashboard-service");
}

describe("Dashboard Service", () => {
  describe("obtenerDatosDashboard()", () => {
    it("muestra un estado vacio cuando no hay cotizaciones", async () => {
      const dashboardService = loadDashboardService([]);
      const datos = await dashboardService.obtenerDatosDashboard({});

      expect(datos.meta.hayDatos).toBe(false);
      expect(datos.kpis.totalCotizaciones.valor).toBe(0);
      expect(datos.graficos.evolucionMensual.datos).toHaveLength(6);
      expect(datos.alertas[0].titulo).toMatch(/Sin cotizaciones/i);
    });

    it("usa cache para requests repetidos", async () => {
      const dashboardService = loadDashboardService([]);
      const datos1 = await dashboardService.obtenerDatosDashboard({});
      const datos2 = await dashboardService.obtenerDatosDashboard({});

      expect(datos1).toBe(datos2);
    });
  });

  describe("analizarConIA()", () => {
    it("hace fallback si IA falla", async () => {
      const dashboardService = loadDashboardService([]);
      const analisis = await dashboardService.analizarConIA({ meta: { hayDatos: false } });

      expect(analisis).toBeDefined();
      expect(Array.isArray(analisis.insights)).toBe(true);
    });
  });

  describe("sugerirGraficos()", () => {
    it("devuelve una estructura aunque la IA no responda", async () => {
      const dashboardService = loadDashboardService([]);
      const graficos = await dashboardService.sugerirGraficos({ kpis: { totalCotizaciones: { valor: 0 } } });

      expect(graficos).toBeDefined();
    });
  });

  describe("chatConDatos()", () => {
    it("responde en modo fallback cuando no hay historial", async () => {
      const dashboardService = loadDashboardService([]);
      const respuesta = await dashboardService.chatConDatos("¿Qué está pasando?", { meta: { hayDatos: false } });

      expect(typeof respuesta).toBe("string");
      expect(respuesta).toMatch(/no hay cotizaciones reales/i);
    });
  });

  describe("generarSQL()", () => {
    it("genera un fallback SQL valido", async () => {
      const dashboardService = loadDashboardService([]);
      const sql = await dashboardService.generarSQL("Obtener todas las cotizaciones", {
        tablas: {
          cotizaciones: ["id", "producto", "total"],
        },
      });

      expect(typeof sql).toBe("string");
      expect(sql.toLowerCase()).toContain("select");
    });
  });

  describe("limpiarCache()", () => {
    it("limpia la cache", async () => {
      const dashboardService = loadDashboardService([]);
      await dashboardService.obtenerDatosDashboard({});
      dashboardService.limpiarCache();

      expect(dashboardService.obtenerEstadisticas().cacheSize).toBe(0);
    });
  });
});
