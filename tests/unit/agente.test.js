const fs = require("fs");
const path = require("path");
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

    expect(resultado.procesado).toBe(true);
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

    expect(resultado.procesado).toBe(true);
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

    expect(resultado.procesado).toBe(true);
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

    expect(resultado.procesado).toBe(true);
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

    expect(resultado.procesado).toBe(true);
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

    expect(resultado.procesado).toBe(true);
    expect(resultado.tipoCambio.tasa).toBeCloseTo(3.58, 4);
    expect(resultado.tipoCambio.estado).toBe("manual_usuario");
    expect(resultado.trazabilidad.tipoCambio.fuente).toBe("manual_usuario");
    expect(resultado.tipoCambio.referenciaSunat.venta).toBeCloseTo(3.71, 4);
  });

  it("no revive alertas ni logs absolutos en el source vivo de compliance y valoracion", () => {
    const content = fs.readFileSync(
      path.join(__dirname, "..", "..", "server", "agente.js"),
      "utf8",
    );

    expect([...content].every((char) => char.charCodeAt(0) <= 127)).toBe(true);
    expect(content).toContain("// SUB-AGENTE 4: VALORACION (duda razonable)");
    expect(content).toContain("nombre: 'Valoracion'");
    expect(content).toContain("// SUB-AGENTE 5: LOGISTICO (flete + tracking)");
    expect(content).toContain("nombre: 'Logistico'");
    expect(content).toContain("// SUB-AGENTE 7: LEGAL (leyes, regimenes, alertas)");
    expect(content).toContain("// ORQUESTADOR - El agente general que coordina todo");
    expect(content).toContain("// FASE 0: Determinar que tenemos");
    expect(content).toContain("// FASE 1: EXTRACCION (si viene documento en vez de items)");
    expect(content).toContain("Extrae items de esta cotizacion.");
    expect(content).toContain("revisarDatos(data)");
    expect(content).toContain("const val = agenteExtractor.revisarDatos(ext.data);");
    expect(content).toContain("Descripcion vacia");
    expect(content).toContain("[Oficial] ADUANET reporto");
    expect(content).toContain("Consulta tributaria oficial: ADUANET devolvio gravamenes");
    expect(content).toContain('toma como referencia de trabajo el bloque "Consulta oficial en vivo".');
    expect(content).toContain('No hubo respuesta oficial en vivo para esta corrida.');
    expect(content).toContain('Consulta oficial tributaria no disponible en esta corrida.');
    expect(content).toContain("[Oficial] Consulta oficial no disponible:");
    expect(content).toContain("[Oficial] Consulta oficial omitida:");
    expect(content).toContain('async function resolverConsultaOficial(resultado, items, pais, log) {');
    expect(content).toContain('const consultaOficial = await construirValidacionOficialImportacion({ items, pais });');
    expect(content).toContain('agregarAlertaConsultaTributaria(resultado, consultaOficial);');
    expect(content).toContain("[Extractor] Items extraidos:");
    expect(content).toContain("[Calculista] Tipo de cambio aplicado:");
    expect(content).toContain("[Clasificador] Partidas clasificadas:");
    expect(content).toContain('//     |- Agente Legal (leyes aplicables, antidumping, alertas)');
    expect(content).toContain('// Antidumping INDECOPI aplicables');
    expect(content).toContain("// Si ya viene con HS manual, contrastar con NANDINA");
    expect(content).toContain("// Multi-agente: 2 modelos + arbitro + contraste NANDINA");
    expect(content).toContain("[Regulatorio] Alertas:");
    expect(content).toContain("[Calculista] FOB ajustado para calculo");
    expect(content).toContain("[Calculista] Total calculado:");
    expect(content).toContain("Revisar antes de continuar.");
    expect(content).toContain("[Compliance] Estado:");
    expect(content).toContain("{ id: 'revisor-proveedor', nombre: 'Revisor de Proveedores', categoria: 'base' },");
    expect(content).toContain("procesado: false,");
    expect(content).toContain("resultado.etapas.compliance = sanc ? { consultado:true, enListaNegra:sanc.enListaNegra } : { consultado:false };");
    expect(content).not.toContain("resultado.etapas.compliance = sanc ? { verificado:true, enListaNegra:sanc.enListaNegra } : { verificado:false };");
    expect(content).toContain("resultado.etapas.valoracion = { revisados:dudas.length, riesgosos:riesgosos.length };");
    expect(content).not.toContain("resultado.etapas.valoracion = { verificados:dudas.length, riesgosos:riesgosos.length };");
    expect(content).not.toContain("Validacion tributaria oficial: ADUANET confirmo gravamenes");
    expect(content).not.toContain('toma como vigente el bloque "Consulta oficial en vivo".');
    expect(content).not.toContain('No se obtuvo confirmacion oficial en vivo para esta corrida.');
    expect(content).not.toContain('Validacion oficial tributaria no disponible en esta consulta.');
    expect(content).not.toContain("[Oficial] Validacion oficial no disponible:");
    expect(content).not.toContain("[Oficial] Validacion oficial omitida:");
    expect(content).not.toContain('//     |- Agente Legal (leyes vigentes, antidumping, alertas)');
    expect(content).not.toContain('// Antidumping INDECOPI vigentes');
    expect(content).not.toContain('async function resolverValidacionOficial(resultado, items, pais, log) {');
    expect(content).not.toContain('const validacionOficial = await construirValidacionOficialImportacion({ items, pais });');
    expect(content).not.toContain('agregarAlertaTributariaOficial(resultado, validacionOficial);');
    expect(content).not.toContain("// Si ya viene con HS manual, validar contra NANDINA");
    expect(content).not.toContain("// Multi-agente: 2 modelos + arbitro + validacion NANDINA");
    expect(content).not.toContain("validar(data)");
    expect(content).not.toContain("const val = agenteExtractor.validar(ext.data);");
    expect(content).not.toContain("exito: false,");
    expect(content).not.toContain("resultado.exito = true;");
    expect(content).not.toContain("{ id: 'validador-proveedor', nombre: 'Validador de Proveedores', categoria: 'base' },");
    expect(content).toContain("[Valoracion] Revisados:");
    expect(content).toContain("[Logistico] Estimando flete...");
    expect(content).toContain("[Logistico] Flete estimado:");
    expect(content).toContain("// FASE 7: CALCULO TRIBUTARIO");
    expect(content).toContain("// FASE 9: COMPLIANCE (si hay proveedor)");
    expect(content).toContain("// FASE 10: ALERTAS LEGALES");
    expect(content).toContain("// RESULTADO");
    expect(content).not.toContain("Valoraci\u00f3n");
    expect(content).not.toContain("Log\u00edstico");
    expect(content).not.toContain("reg\u00edmenes");
    expect(content).not.toContain("cotizaci\u00f3n");
    expect(content).not.toContain("Descripci\u00f3n vac\u00eda");
    expect(content).not.toContain("qu\u00e9 tenemos");
    expect(content).not.toContain("EXTRACCI\u00d3N");
    expect(content).not.toContain("C\u00c1LCULO TRIBUTARIO");
    expect(content).not.toContain("\u00c3");
    expect(content).not.toContain("\u00e2");
  });

  it("mantiene alertas regulatorias y legales sin emoji ni copy duro", () => {
    const legales = agente.agenteLegal.generarAlertas([
      {
        desc: "camisetas",
        ahorroTLC: 6,
        tlc: { preferencia: 100 },
        antidumpingInfo: { desc: "camisetas de algodon", vigenciaHasta: String(new Date().getFullYear()) },
      },
    ]);
    const content = fs.readFileSync(
      path.join(__dirname, "..", "..", "server", "agente.js"),
      "utf8",
    );

    expect(legales.some((item) => item.mensaje.includes("TLC con ahorro de 6% AV"))).toBe(true);
    expect(legales.some((item) => item.mensaje.includes("Antidumping camisetas de algodon por vencer."))).toBe(true);
    expect(content).toContain("mercancia prohibida.");
    expect(content).toContain("TLC con ahorro de");
    expect(content).toContain("DSI: AV 4% flat, sin percepcion.");
    expect(content).not.toContain("⛔");
    expect(content).not.toContain("⚠");
    expect(content).not.toContain("🛡");
    expect(content).not.toContain("⏰");
    expect(content).not.toContain("📦");
  });
});
