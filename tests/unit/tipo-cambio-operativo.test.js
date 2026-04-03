const { describe, it, expect, beforeEach } = require("@jest/globals");
const fs = require("fs");
const path = require("path");

jest.mock("../../server/sunat-proxy", () => ({
  getTipoCambio: jest.fn(),
}));

const sunatProxy = require("../../server/sunat-proxy");
const {
  resolverTipoCambioOperativo,
  construirAlertaTipoCambio,
} = require("../../server/tipo-cambio-operativo");

describe("tipo-cambio-operativo", () => {
  beforeEach(() => {
    sunatProxy.getTipoCambio.mockReset();
  });

  it("usa SUNAT venta cuando no llega tipo de cambio manual", async () => {
    sunatProxy.getTipoCambio.mockResolvedValue({
      compra: 3.69,
      venta: 3.71,
      source: "SUNAT",
    });

    const resultado = await resolverTipoCambioOperativo(0);

    expect(resultado.tasa).toBeCloseTo(3.71, 4);
    expect(resultado.estado).toBe("oficial_en_vivo");
    expect(resultado.referenciaSunat.venta).toBeCloseTo(3.71, 4);
    expect(resultado.mensaje).toMatch(/se consulto sbs\/sunat en vivo/i);
  });

  it("mantiene el tipo de cambio manual y conserva la referencia SUNAT para comparar", async () => {
    sunatProxy.getTipoCambio.mockResolvedValue({
      compra: 3.69,
      venta: 3.71,
      source: "SUNAT",
    });

    const resultado = await resolverTipoCambioOperativo(3.58);

    expect(resultado.tasa).toBeCloseTo(3.58, 4);
    expect(resultado.estado).toBe("manual_usuario");
    expect(resultado.referenciaSunat.venta).toBeCloseTo(3.71, 4);
    expect(resultado.diferencialVsSunat.porcentaje).toBeLessThan(0);
  });

  it("marca fallback cuando SUNAT no responde", async () => {
    sunatProxy.getTipoCambio.mockResolvedValue({
      compra: 3.7,
      venta: 3.75,
      source: "fallback",
    });

    const resultado = await resolverTipoCambioOperativo(null);
    const alerta = construirAlertaTipoCambio(resultado);

    expect(resultado.estado).toBe("fallback");
    expect(resultado.tasa).toBeCloseTo(3.75, 4);
    expect(alerta.nivel).toBe("medio");
    expect(alerta.mensaje).toMatch(/no se pudo consultar sunat en vivo/i);
  });

  it("distingue una referencia externa de una fuente oficial en vivo", async () => {
    sunatProxy.getTipoCambio.mockResolvedValue({
      compra: 3.68,
      venta: 3.71,
      source: "mirror_sbs",
      status: "referencia_externa",
    });

    const resultado = await resolverTipoCambioOperativo(null);
    const alerta = construirAlertaTipoCambio(resultado);

    expect(resultado.estado).toBe("referencia_externa");
    expect(resultado.tasa).toBeCloseTo(3.71, 4);
    expect(alerta.nivel).toBe("medio");
    expect(alerta.mensaje).toMatch(/referencia automatica externa/i);
  });

it("mantiene el wording de tipo de cambio como consulta y ya no como lectura parcial", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "..", "server", "tipo-cambio-operativo.js"),
      "utf8"
    );

    expect(source).toContain("Tipo de cambio operativo consultado en vivo");
    expect(source).toContain("No se pudo consultar la fuente oficial SBS/SUNAT en vivo");
    expect(source).toContain("No se pudo consultar SUNAT en vivo para esta corrida.");
    expect(source).toContain("Se consulto SBS/SUNAT en vivo");
    expect(source).not.toContain("Tipo de cambio operativo validado en vivo");
    expect(source).not.toContain("No se pudo validar la fuente oficial SBS/SUNAT en vivo");
    expect(source).not.toContain("No se pudo validar SUNAT en vivo para esta corrida.");
    expect(source).not.toContain("Se uso SBS/SUNAT en vivo");
  });
});
