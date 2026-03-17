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
});
