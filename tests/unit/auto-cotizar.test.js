const fs = require('fs');
const path = require('path');
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

    expect(resultado.procesado).toBe(true);
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

    expect(resultado.procesado).toBe(true);
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

    expect(resultado.procesado).toBe(true);
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

    expect(resultado.procesado).toBe(true);
    expect(resultado.tipoCambio.tasa).toBeCloseTo(3.55, 4);
    expect(resultado.tipoCambio.estado).toBe("manual_usuario");
    expect(resultado.trazabilidad.tipoCambio.fuente).toBe("manual_usuario");
    expect(resultado.tipoCambio.referenciaSunat.venta).toBeCloseTo(3.71, 4);
  });

  it("usa un ajuste DDP neutral y sin iconografia fuerte", () => {
    const ajuste = autoCotizar.ajustarIncoterm(100, "DDP", 0, 0, 100);

    expect(ajuste.advertencia).toBe(true);
    expect(ajuste.ajuste).toContain("DDP incluye tributos en el precio.");
    expect(ajuste.ajuste).toContain("El desglose es estimado (~65% FOB).");
    expect(ajuste.ajuste).not.toMatch(/[⚠✅🔶📦⛔🛡🤝⏰]/);
  });

  it("mantiene los ajustes de incoterm en ASCII estable", () => {
    const ajusteExw = autoCotizar.ajustarIncoterm(100, "EXW", 0, 0, 100);
    const ajusteCif = autoCotizar.ajustarIncoterm(100, "CIF", 10, 5, 100);

    expect(ajusteExw.ajuste).toContain("Precio en fabrica.");
    expect(ajusteExw.ajuste).toContain("despacho exportacion");
    expect(ajusteCif.ajuste).toContain("Costo, seguro y flete incluidos.");
    expect(ajusteExw.ajuste).not.toContain("Precio en fábrica.");
    expect(ajusteExw.ajuste).not.toContain("despacho exportación");
  });

  it("no revive emojis ni mojibake en los mensajes visibles de auto-cotizar", () => {
    const content = fs.readFileSync(
      path.join(__dirname, "..", "..", "server", "auto-cotizar.js"),
      "utf8"
    );

    expect(content).toContain("Datos extraidos. Revisa antes de continuar.");
    expect(content).toContain("punto(s) requieren revision.");
    expect(content).toContain("difiere de la suma de items");
    expect(content).not.toContain("Datos extraidos. Verifica y confirma.");
    expect(content).toContain("ISC sistema especial; consultar SUNAT");
    expect(content).toContain("// server/auto-cotizar.js - Motor de calculo completo para importacion Peru");
    expect(content).toContain("// INCOTERMS - Ajuste del precio segun termino comercial");
    expect(content).toContain("// ALERTAS NORMATIVAS");
    expect(content).toContain("// DUDA RAZONABLE");
    expect(content).toContain("// PASO 2: CALCULAR (despues de revision)");
    expect(content).toContain("mayor precision.");
    expect(content).toContain("Despacho Simplificado de Importacion (FOB <= US$2,000).");
    expect(content).toContain("No se pudieron extraer items. Es una cotizacion de proveedor?");
    expect(content).toContain("Descripcion vacia o muy corta");
    expect(content).toContain("ajusteDesc: 'Precio en fabrica. Se suman: transporte a puerto origen, despacho exportacion, flete internacional, seguro.'");
    expect(content).toContain("Extrae TODOS los items de esta cotizacion. Responde SOLO JSON:");
    expect(content).toContain("qty y unit DEBEN ser numeros.");
    expect(content).toContain("Extrae datos de esta cotizacion.");
    expect(content).toContain("Flete extraido del precio");
    expect(content).toContain("Seguro extraido del precio");
    expect(content).toContain("TLC aplicable segun datos:");
    expect(content).toContain("Consulta tributaria oficial: ADUANET devolvio gravamenes");
    expect(content).toContain('toma como referencia de trabajo el bloque "Consulta oficial en vivo".');
    expect(content).toContain("No hubo respuesta oficial en vivo para esta corrida.");
    expect(content).toContain("Consulta oficial tributaria no disponible en esta corrida.");
    expect(content).toContain("[ADUANET] Consulta oficial:");
    expect(content).toContain("Consulta oficial no disponible:");
    expect(content).toContain("Consulta oficial omitida:");
    expect(content).toContain('//   3. Antidumping automatico (medidas INDECOPI aplicables)');
    expect(content).toContain('// ANTIDUMPING - Medidas aplicables INDECOPI');
    expect(content).toContain("async function resolverConsultaOficial(resultado, items, pais, log) {");
    expect(content).toContain("const consultaOficial = await construirValidacionOficialImportacion({ items, pais });");
    expect(content).toContain("agregarAlertaConsultaTributaria(resultado, consultaOficial);");
    expect(content).toContain("tipo: 'tlc_aplicable', nivel: 'info'");
    expect(content).toContain("resultado.etapas.dudaRazonable = { revisados: dudas.length, riesgosos: riesgosos.length };");
    expect(content).toContain("const resultado = { procesado: false, items: [], totales: {}, alertas: [], etapas: {}, tiempoMs: 0 };");
    expect(content).toContain("item(s) con riesgo de duda razonable SUNAT");
    expect(content).not.toContain("const resultado = { exito: false, items: [], totales: {}, alertas: [], etapas: {}, tiempoMs: 0 };");
    expect(content).not.toContain("resultado.exito = true;");
    expect(content).not.toContain("TLC activo:");
    expect(content).not.toContain('toma como vigente el bloque "Consulta oficial en vivo".');
    expect(content).not.toContain("Validacion tributaria oficial: ADUANET confirmo gravamenes");
    expect(content).not.toContain("No se obtuvo confirmacion oficial en vivo para esta corrida.");
    expect(content).not.toContain("Validacion oficial tributaria no disponible en esta consulta.");
    expect(content).not.toContain("[ADUANET] Validacion oficial:");
    expect(content).not.toContain('//   3. Antidumping automatico (medidas INDECOPI vigentes)');
    expect(content).not.toContain('// ANTIDUMPING - Medidas vigentes INDECOPI');
    expect(content).not.toContain("Validacion oficial no disponible:");
    expect(content).not.toContain("Validacion oficial omitida:");
    expect(content).not.toContain("async function resolverValidacionOficial(resultado, items, pais, log) {");
    expect(content).not.toContain("const validacionOficial = await construirValidacionOficialImportacion({ items, pais });");
    expect(content).not.toContain("agregarAlertaTributariaOficial(resultado, validacionOficial);");
    expect(content).not.toContain("tipo: 'tlc_activo', nivel: 'info'");
    expect(content).not.toContain("resultado.etapas.dudaRazonable = { verificados: dudas.length, riesgosos: riesgosos.length };");
    expect(content).not.toContain("⚠");
    expect(content).not.toContain("✅");
    expect(content).not.toContain("🔶");
    expect(content).not.toContain("📦");
    expect(content).not.toContain("⛔");
    expect(content).not.toContain("🛡");
    expect(content).not.toContain("🤝");
    expect(content).not.toContain("⏰");
    expect(content).not.toContain("â‰");
    expect(content).not.toContain("ðŸ");
    expect(content).not.toContain("—");
    expect(content).not.toContain("→");
    expect(content).not.toContain("═");
    expect(content).not.toContain("── ALERTAS NORMATIVAS ──");
    expect(content).not.toContain("── DUDA RAZONABLE ──");
    expect(content).not.toContain("// PASO 2: CALCULAR (después de confirmación)");
    expect(content).not.toContain("mayor precisión.");
    expect(content).not.toContain("Despacho Simplificado de Importación (FOB ≤ US$2,000).");
    expect(content).not.toContain("No se pudieron extraer items. ¿Es una cotización de proveedor?");
    expect(content).not.toContain("Descripción vacía o muy corta");
    expect(content).not.toContain("ajusteDesc: 'Precio en fábrica. Se suman: transporte a puerto origen, despacho exportación, flete internacional, seguro.'");
    expect(content).not.toContain("Extrae TODOS los items de esta cotización. Responde SOLO JSON:");
    expect(content).not.toContain("qty y unit DEBEN ser números.");
    expect(content).not.toContain("Extrae datos de esta cotización.");
    expect(content).not.toContain("Flete extraído del precio");
    expect(content).not.toContain("Seguro extraído del precio");
  });
});
