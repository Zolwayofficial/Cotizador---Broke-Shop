jest.mock("../../server/ai-proxy", () => ({
  call: jest.fn().mockRejectedValue(new Error("Connection error")),
}));

describe("Clasificador fallback", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("deberia usar keywords cuando la IA falla", async () => {
    const clasificador = require("../../server/clasificador");
    const result = await clasificador.clasificarMultiAgente("camiseta de algodon");

    expect(result.consenso).toBeTruthy();
    expect(result.consenso.hs).toBe("6109.10.00.10");
    expect(result.consenso.metodo).toBe("consenso_directo");
  });

  test("deberia extraer texto desde payload tipo imagen para el fallback", async () => {
    const clasificador = require("../../server/clasificador");
    const result = await clasificador.clasificarMultiAgente(
      "camiseta de algodon",
      "data:image/png;base64,xxx"
    );

    expect(result.consenso).toBeTruthy();
    expect(result.consenso.hs).toBe("6109.10.00.10");
  });
});
