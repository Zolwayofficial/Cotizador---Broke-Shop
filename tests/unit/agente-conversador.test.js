const { describe, it, expect } = require("@jest/globals");

const conversador = require("../../server/agente-conversador");

describe("agente-conversador", () => {
  it("interpreta respuestas segun el paso actual y no confunde cantidad con precio", async () => {
    const primera = await conversador.agenteConversador("500 camisetas de algodon", {
      datos_previos: {},
      paso_actual: "productos",
    });

    expect(primera.contexto.datos_previos.productos[0].cantidad).toBe(500);
    expect(primera.paso).toBe("pais_origen");

    const segunda = await conversador.agenteConversador("China", primera.contexto);
    expect(segunda.contexto.datos_previos.pais_origen).toBe("CN");
    expect(segunda.paso).toBe("canal");

    const tercera = await conversador.agenteConversador("Courier", segunda.contexto);
    expect(tercera.contexto.datos_previos.canal).toBe("COURIER");
    expect(tercera.paso).toBe("precio_unitario");

    const cuarta = await conversador.agenteConversador("3.5 USD", tercera.contexto);
    expect(cuarta.contexto.datos_previos.precio_unitario).toBe(3.5);
    expect(cuarta.paso).toBe("incoterm");
  });

  it("permite confirmar cuando ya esta listo para calcular", async () => {
    const respuesta = await conversador.agenteConversador("si", {
      datos_previos: {
        productos: [{ cantidad: 10, producto: "polos", descripcion: "polos" }],
        pais_origen: "CN",
        canal: "COURIER",
        precio_unitario: 5,
        incoterm: "FOB",
        tipo_importador: "general",
      },
      paso_actual: "calcular",
    });

    expect(respuesta.tipo).toBe("listo_para_calcular");
    expect(respuesta.paso).toBe("calcular");
  });

  it("repite la misma pregunta contextual cuando la respuesta no coincide con las opciones", async () => {
    const respuesta = await conversador.agenteConversador("tu pregunta no tiene relacion con las alternativas", {
      datos_previos: {
        productos: [{ cantidad: 10, producto: "polos", descripcion: "polos" }],
        pais_origen: "CN",
        canal: "COURIER",
        precio_unitario: 5,
        incoterm: "FOB",
      },
      paso_actual: "tipo_importador",
    });

    expect(respuesta.paso).toBe("tipo_importador");
    expect(respuesta.mensaje).toMatch(/alternativas/i);
    expect(respuesta.opciones).toEqual([
      { value: "general", label: "General — Ya he importado antes" },
      { value: "nuevo", label: "Nuevo — Es mi primera importación" },
      { value: "buen_contribuyente", label: "Buen Contribuyente SUNAT" },
    ]);
  });
});
