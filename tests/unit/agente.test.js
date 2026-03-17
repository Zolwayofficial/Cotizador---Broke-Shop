const { describe, it, expect, beforeAll } = require("@jest/globals");

const nandina = require("../../server/nandina");
const agente = require("../../server/agente");

beforeAll(async () => {
  await nandina.init();
});

describe("agente.orquestar", () => {
  it("mantiene flete y seguro extraidos cuando el incoterm es CIF", async () => {
    const resultado = await agente.orquestar({
      items: [{ desc: "televisor led", qty: 10, unit: 100, hs: "8528.72.00.00" }],
      pais: "China",
      canal: "DEFINITIVA",
      incoterm: "CIF",
    });

    expect(resultado.exito).toBe(true);
    expect(resultado.totales.flete).toBeCloseTo(80, 5);
    expect(resultado.totales.seguro).toBeCloseTo(15, 5);
    expect(resultado.totales.cif).toBeCloseTo(1000, 5);
    expect(Array.isArray(resultado.recomendaciones)).toBe(true);
    expect(resultado.recomendaciones.length).toBeGreaterThan(0);
  });
});
