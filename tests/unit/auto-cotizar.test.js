const { describe, it, expect, beforeEach } = require("@jest/globals");

jest.mock("../../server/tipo-cambio-operativo", () => ({
  resolverTipoCambioOperativo: jest.fn(),
  construirAlertaTipoCambio: jest.fn(() => null),
}));

const { resolverTipoCambioOperativo } = require("../../server/tipo-cambio-operativo");
const autoCotizar = require("../../server/auto-cotizar");

beforeEach(() => {
  resolverTipoCambioOperativo.mockImplementation(async (input) => {
    const tasa = Number(input);
    if (Number.isFinite(tasa) && tasa > 0) {
      return {
        tasa,
        estado: "manual_usuario",
        fuente: "manual_usuario",
        referenciaSunat: { compra: 3.69, venta: 3.71, estado: "oficial_en_vivo" },
        diferencialVsSunat: { absoluto: Number((tasa - 3.71).toFixed(4)), porcentaje: Number((((tasa - 3.71) / 3.71) * 100).toFixed(2)) },
        mensaje: "TC manual aplicado",
      };
    }

    return {
      tasa: 3.71,
      estado: "oficial_en_vivo",
      fuente: "SUNAT",
      referenciaSunat: { compra: 3.69, venta: 3.71, estado: "oficial_en_vivo" },
      diferencialVsSunat: { absoluto: 0, porcentaje: 0 },
      mensaje: "SUNAT venta aplicada",
    };
  });
});

describe("auto-cotizar", () => {
  it("reconoce antidumping usando nombres de pais y no solo codigos", () => {
    const porCodigo = autoCotizar.buscarAntidumping("6109100000", "CN");
    const porNombre = autoCotizar.buscarAntidumping("6109100000", "China");

    expect(porCodigo).toBeTruthy();
    expect(porNombre).toBeTruthy();
    expect(porNombre.tasa).toBe(porCodigo.tasa);
  });

  it("omite margen cuando el objetivo es solo costo de importacion", async () => {
    const resultado = await autoCotizar.calcular({
      items: [{ desc: "accesorios plasticos", qty: 50, unit: 6 }],
      pais: "China",
      canal: "MARITIMO",
      incoterm: "FOB",
      tipoImportador: "general",
      tipoSujeto: "empresa",
      objetivoCalculo: "costo_importacion",
      fleteManual: 50,
      seguroManual: 8,
    });

    expect(resultado.exito).toBe(true);
    expect(resultado.totales.margenVenta).toBeUndefined();
    expect(resultado.perfilImportacion.objetivo.codigo).toBe("costo_importacion");
  });

  it("resuelve la franquicia postal de bajo valor", async () => {
    const resultado = await autoCotizar.calcular({
      items: [{ desc: "libros importados", qty: 2, unit: 30 }],
      pais: "US",
      canal: "POSTAL",
      incoterm: "FOB",
      tipoImportador: "nuevo",
      tipoSujeto: "persona_natural",
      objetivoCalculo: "precio_sugerido",
      seguroModo: "TABLA",
    });

    expect(resultado.exito).toBe(true);
    expect(resultado.modo).toBe("POSTAL_FRANQUICIA");
    expect(resultado.totales.totalTributos).toBe(0);
    expect(resultado.trazabilidad.seguro.fuente).toBe("seguro_tabla");
  });

  it("usa SUNAT como tipo de cambio operativo cuando no se envia uno manual", async () => {
    const resultado = await autoCotizar.calcular({
      items: [{ desc: "mangueras plasticas", qty: 30, unit: 8 }],
      pais: "China",
      canal: "MARITIMO",
      incoterm: "FOB",
      tipoImportador: "general",
      tipoSujeto: "empresa",
      fleteManual: 40,
      seguroManual: 7,
    });

    expect(resultado.exito).toBe(true);
    expect(resultado.tipoCambio.tasa).toBeCloseTo(3.71, 4);
    expect(resultado.metadata.tcFuente).toBe("SUNAT");
    expect(resultado.totales.totalPEN).toBeGreaterThan(0);
  });

  it("respeta el tipo de cambio manual cuando el usuario lo informa", async () => {
    const resultado = await autoCotizar.calcular({
      items: [{ desc: "sensores industriales", qty: 5, unit: 120 }],
      pais: "China",
      canal: "AEREO",
      incoterm: "FOB",
      tipoImportador: "general",
      tipoSujeto: "empresa",
      fleteManual: 50,
      seguroManual: 8,
      tc: 3.55,
    });

    expect(resultado.exito).toBe(true);
    expect(resultado.tipoCambio.tasa).toBeCloseTo(3.55, 4);
    expect(resultado.tipoCambio.estado).toBe("manual_usuario");
    expect(resultado.trazabilidad.tipoCambio.fuente).toBe("manual_usuario");
    expect(resultado.tipoCambio.referenciaSunat.venta).toBeCloseTo(3.71, 4);
  });
});
