jest.mock("../../server/auto-repair", () => ({
  ejecutarConAutoReparacion: jest.fn(async (_agente, fn) => fn()),
}));

describe("Flete API", () => {
  const originalTrackingMoreKey = process.env.TRACKINGMORE_API_KEY;

  beforeEach(() => {
    jest.resetModules();
    process.env.TRACKINGMORE_API_KEY = "dummy-key";
  });

  afterAll(() => {
    process.env.TRACKINGMORE_API_KEY = originalTrackingMoreKey;
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
});
