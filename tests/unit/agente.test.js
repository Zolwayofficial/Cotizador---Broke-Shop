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
});
