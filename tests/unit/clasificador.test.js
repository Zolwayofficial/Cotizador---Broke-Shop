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

  test("expone contexto doctrinario cuando detecta escenarios complejos", () => {
    const clasificador = require("../../server/clasificador");
    const context = clasificador.buildClassificationContext("kit desmontado de maquina usada con estuche");

    expect(context.triggers.map((item) => item.rule)).toEqual(
      expect.arrayContaining(["RGI 2a", "RGI 5"])
    );
    expect(context.scenarioNotes.join(" ")).toMatch(/usada o alterada/i);
    expect(context.promptBlock).toMatch(/RGI 1/i);
  });

  test("baja la confianza del fallback cuando el producto sugiere mezcla o mercancia usada", async () => {
    const clasificador = require("../../server/clasificador");
    const result = await clasificador.clasificarMultiAgente("camiseta usada de algodon y poliester");

    expect(result.consenso).toBeTruthy();
    expect(result.consenso.hs).toBe("6109.10.00.10");
    expect(result.consenso.confianza).toBeLessThanOrEqual(18);
    expect(result.consenso.advertencia).toMatch(/Escenarios detectados/i);
  });
});
