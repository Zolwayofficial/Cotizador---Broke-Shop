const { describe, it, expect, beforeAll, beforeEach } = require("@jest/globals");

jest.mock("../../server/tipo-cambio-operativo", () => ({
  resolverTipoCambioOperativo: jest.fn(),
  construirAlertaTipoCambio: jest.fn(() => null),
}));

const nandina = require("../../server/nandina");
const { resolverTipoCambioOperativo } = require("../../server/tipo-cambio-operativo");
const agente = require("../../server/agente");

beforeAll(async () => {
  await nandina.init();
});

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

  it("aplica percepcion de 5% para bienes usados cuando el importador es general", async () => {
    const resultado = await agente.orquestar({
      items: [{ desc: "maquinaria usada", qty: 2, unit: 2000, hs: "8479.89.99.00", bienUsado: true }],
      pais: "China",
      canal: "MARITIMO",
      incoterm: "FOB",
      tipoImportador: "general",
      flete: 400,
      seguro: 60,
      tc: 3.75,
    });

    expect(resultado.exito).toBe(true);
    expect(resultado.items[0].tributos.percTipo).toMatch(/5% \(usado\)/i);
    expect(resultado.items[0].tributos.percepcion).toBeGreaterThan(0);
  });

  it("omite la proyeccion comercial cuando el objetivo es solo costo de importacion", async () => {
    const resultado = await agente.orquestar({
      items: [{ desc: "repuestos plasticos", qty: 100, unit: 4, hs: "3920.10.00.00" }],
      pais: "China",
      canal: "MARITIMO",
      incoterm: "FOB",
      tipoImportador: "general",
      tipoSujeto: "empresa",
      objetivoCalculo: "costo_importacion",
      flete: 80,
      seguro: 12,
    });

    expect(resultado.exito).toBe(true);
    expect(resultado.totales.margenVenta).toBeUndefined();
    expect(resultado.metadata.objetivoCalculo).toBe("costo_importacion");
    expect(resultado.perfilImportacion.objetivo.etiqueta).toMatch(/Solo costo/i);
  });

  it("usa el escenario postal de franquicia para envios postales de muy bajo valor", async () => {
    const resultado = await agente.orquestar({
      items: [{ desc: "libros tecnicos", qty: 5, unit: 20 }],
      pais: "Estados Unidos",
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
    expect(resultado.perfilImportacion.regimen.codigo).toBe("postal_franquicia");
    expect(resultado.trazabilidad.seguro.fuente).toBe("seguro_tabla");
  });

  it("usa SUNAT como tipo de cambio operativo cuando no se envia uno manual", async () => {
    const resultado = await agente.orquestar({
      items: [{ desc: "repuestos metalicos", qty: 20, unit: 25, hs: "7326.90.90.00" }],
      pais: "China",
      canal: "MARITIMO",
      incoterm: "FOB",
      tipoImportador: "general",
      flete: 80,
      seguro: 12,
    });

    expect(resultado.exito).toBe(true);
    expect(resultado.tipoCambio.tasa).toBeCloseTo(3.71, 4);
    expect(resultado.tipoCambio.fuente).toBe("SUNAT");
    expect(resultado.metadata.tc).toBeCloseTo(3.71, 4);
    expect(resultado.totales.totalPEN).toBeGreaterThan(0);
  });

  it("respeta el tipo de cambio manual sobre la referencia SUNAT", async () => {
    const resultado = await agente.orquestar({
      items: [{ desc: "componentes electronicos", qty: 10, unit: 50, hs: "8542.31.00.00" }],
      pais: "China",
      canal: "AEREO",
      incoterm: "FOB",
      tipoImportador: "general",
      flete: 60,
      seguro: 10,
      tc: 3.58,
    });

    expect(resultado.exito).toBe(true);
    expect(resultado.tipoCambio.tasa).toBeCloseTo(3.58, 4);
    expect(resultado.tipoCambio.estado).toBe("manual_usuario");
    expect(resultado.trazabilidad.tipoCambio.fuente).toBe("manual_usuario");
    expect(resultado.tipoCambio.referenciaSunat.venta).toBeCloseTo(3.71, 4);
  });
});
