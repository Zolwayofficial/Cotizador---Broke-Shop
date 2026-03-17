const { describe, it, expect } = require("@jest/globals");

const autoCotizar = require("../../server/auto-cotizar");

describe("auto-cotizar", () => {
  it("reconoce antidumping usando nombres de pais y no solo codigos", () => {
    const porCodigo = autoCotizar.buscarAntidumping("6109100000", "CN");
    const porNombre = autoCotizar.buscarAntidumping("6109100000", "China");

    expect(porCodigo).toBeTruthy();
    expect(porNombre).toBeTruthy();
    expect(porNombre.tasa).toBe(porCodigo.tasa);
  });
});
