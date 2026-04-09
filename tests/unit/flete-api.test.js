jest.mock("../../server/auto-repair", () => ({
  ejecutarConAutoReparacion: jest.fn(async (_agente, fn) => fn()),
}));

const fs = require("fs");
const path = require("path");

describe("Flete API", () => {
  const originalTrackingMoreKey = process.env.TRACKINGMORE_API_KEY;
  const originalTrackingMoreDailyLimit = process.env.TRACKINGMORE_DAILY_LIMIT;

  beforeEach(() => {
    jest.resetModules();
    process.env.TRACKINGMORE_API_KEY = "dummy-key";
    process.env.TRACKINGMORE_DAILY_LIMIT = "100";
  });

  afterAll(() => {
    process.env.TRACKINGMORE_API_KEY = originalTrackingMoreKey;
    process.env.TRACKINGMORE_DAILY_LIMIT = originalTrackingMoreDailyLimit;
  });

  test("deberia cotizar sin lanzar ReferenceError cuando hay API key configurada", async () => {
    const fleteApi = require("../../server/flete-api");

    const result = await fleteApi.cotizarFlete({
      origen: "CN",
      destino: "PE",
      canal: "maritimo",
      pesoKg: 120,
      valorFOB: 5000,
    });

    expect(result).toBeTruthy();
    expect(result.origen).toBe("CN");
    expect(result.destino).toBe("PE");
    expect(result.canal).toBe("maritimo");
  });

  test("deberia exponer una cuota diaria local configurable para TrackingMore", () => {
    process.env.TRACKINGMORE_DAILY_LIMIT = "250";

    const fleteApi = require("../../server/flete-api");
    const usageState = fleteApi.getTrackingMoreUsageState();

    expect(usageState).toEqual(
      expect.objectContaining({
        enabled: true,
        count: 0,
        limit: 250,
      })
    );
    expect(usageState.nota).toMatch(/cuota diaria local/i);
    expect(typeof fleteApi.getTrackingMoreUsageState).toBe("function");
    expect(fleteApi.getTrackingMoreUsageSnapshot).toBeUndefined();
  });

  test("deberia volver al fallback conservador cuando TRACKINGMORE_DAILY_LIMIT queda fuera de rango", () => {
    process.env.TRACKINGMORE_DAILY_LIMIT = "-5";

    const fleteApi = require("../../server/flete-api");

    expect(fleteApi._private.getTrackingMoreDailyLimit()).toBe(100);
  });

  test("deberia advertir cuando la cuota diaria local ya fue alcanzada", async () => {
    process.env.TRACKINGMORE_DAILY_LIMIT = "2";

    const fleteApi = require("../../server/flete-api");
    fleteApi._private.setDailyUsageForTests({ count: 2 });

    const result = await fleteApi.cotizarFlete({
      origen: "CN",
      destino: "PE",
      canal: "aereo",
      pesoKg: 12,
      valorFOB: 500,
    });

    expect(result.source).toBe("referencial");
    expect(result.advertencia).toMatch(/cuota diaria local de TrackingMore alcanzada/i);
  });

  test("deberia mantener el fallback visible en ASCII estable", async () => {
    const fleteApi = require("../../server/flete-api");

    const result = await fleteApi.cotizarFlete({
      origen: "CN",
      destino: "PE",
      canal: "aereo",
      pesoKg: 12,
      valorFOB: 500,
    });

    expect(result.source).toBe("referencial");
    expect(result.transit).toBe("5-8 dias");
    expect(result.nota).toBe("Tarifa referencial de mercado. Solicitar cotizacion formal a freight forwarder.");
  });

test("el codigo fuente no debe vender TrackingMore como gratis 100/day ni congelar 100/100", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../../server/flete-api.js"),
      "utf8"
    );

    expect(source).not.toContain("gratis 100/day");
    expect(source).not.toContain("100/100");
    expect(source).not.toContain("fletes reales");
    expect(source).not.toContain("TrackingMore exitoso");
    expect(source).not.toContain("Searates exitoso");
    expect(source).not.toContain("días");
    expect(source).toContain("function getTrackingMoreUsageState()")
    expect(source).toContain("cuota diaria local configurable");
    expect(source).toContain("Integracion operativa con proveedores de flete");
    expect(source).toContain("TrackingMore devolvio una tarifa disponible");
    expect(source).toContain("Searates devolvio una tarifa disponible");
    expect(source).toContain("transit: '5-8 dias'");
    expect(source).not.toContain("function getTrackingMoreUsageSnapshot()");
  });
});
