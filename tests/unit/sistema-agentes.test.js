const { describe, it, expect } = require("@jest/globals");

const sistemaAgentes = require("../../server/sistema-agentes");
const agentesNavegacion = require("../../server/agentes-navegacion");
const autoRepair = require("../../server/auto-repair");
const fs = require("fs");
const path = require("path");

describe("sistemaAgentes.obtenerRegistroAgentes", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    sistemaAgentes.inicializado = false;
    sistemaAgentes._initPromise = null;
  });

  it("registra 30 agentes contando al Agente 0 y Auth como soporte formal", () => {
    const registro = sistemaAgentes.obtenerRegistroAgentes();

    expect(registro.total).toBe(30);
    expect(registro.conversacion).toHaveLength(1);
    expect(registro.base).toHaveLength(17);
    expect(registro.navegacion).toHaveLength(9);
    expect(registro.soporte).toHaveLength(3);
    expect(registro.soporte.map((agent) => agent.id)).toEqual([
      "memoria-agentes",
      "auto-repair",
      "auth",
    ]);
  });

  it("no inicializa dos veces en paralelo", async () => {
    const initNavSpy = jest.spyOn(agentesNavegacion, "init").mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 20))
    );
    const initRepairSpy = jest.spyOn(autoRepair, "init").mockResolvedValue();

    await Promise.all([sistemaAgentes.inicializar(), sistemaAgentes.inicializar()]);

    expect(initNavSpy).toHaveBeenCalledTimes(1);
    expect(initRepairSpy).toHaveBeenCalledTimes(1);
  });

  it("exige datos requeridos en consultarGobierno", async () => {
    sistemaAgentes.inicializado = true;

    await expect(sistemaAgentes.consultarGobierno("restricciones", { partida: "8517130000" }))
      .rejects.toThrow(/Falta "pais"/);

    await expect(sistemaAgentes.consultarGobierno("restricciones", { partida: "8517130000", pais: "   " }))
      .rejects.toThrow(/Falta "pais"/);
  });

  it("recorta datos string requeridos antes de delegarlos al agente", async () => {
    sistemaAgentes.inicializado = true;
    const restriccionesSpy = jest
      .spyOn(agentesNavegacion.VUCE, "consultarRestricciones")
      .mockResolvedValue({ permisos: [] });

    await sistemaAgentes.consultarGobierno("restricciones", {
      partida: " 8517130000 ",
      pais: " CN ",
    });

    expect(restriccionesSpy).toHaveBeenCalledWith("8517130000", "CN");
  });

  it("normaliza el tipo de consulta antes del switch", async () => {
    sistemaAgentes.inicializado = true;
    const tcSpy = jest.spyOn(agentesNavegacion.SUNAT, "consultarTipoCambio").mockResolvedValue({ venta: 3.71 });

    const result = await sistemaAgentes.consultarGobierno(" TIPO_CAMBIO ");

    expect(tcSpy).toHaveBeenCalledTimes(1);
    expect(result.venta).toBe(3.71);
  });

  it("normaliza categoria y pais vacios en detectarRequisitos", async () => {
    sistemaAgentes.inicializado = true;
    jest.spyOn(agentesNavegacion.MTC, "detectarSiRequiereHomologacion").mockResolvedValue({ requiereHomologacion: false });
    jest.spyOn(agentesNavegacion.DIGESA, "detectarSiRequiereRegistro").mockResolvedValue({ requiereRegistroSanitario: false });
    jest.spyOn(agentesNavegacion.SENASA, "detectarSiRequierePermiso").mockResolvedValue({ requierePermisoFitosanitario: false });
    jest.spyOn(agentesNavegacion.MINAM, "detectarSiRequierePermiso").mockResolvedValue({ requierePermisoAmbiental: false });
    jest.spyOn(agentesNavegacion.PRODUCE, "detectarSiRequierePermisoPesca").mockResolvedValue({ esPesquero: false });
    const indecopiSpy = jest.spyOn(agentesNavegacion.INDECOPI, "consultarAntidumping").mockResolvedValue({ tieneAntidumping: false });

    const result = await sistemaAgentes.detectarRequisitos("router", undefined, undefined);

    expect(result.permisos).toEqual([]);
    expect(indecopiSpy).toHaveBeenCalledWith("router", "");
  });

  it("detecta requisitos en modo best-effort si una fuente falla", async () => {
    sistemaAgentes.inicializado = true;
    jest.spyOn(agentesNavegacion.MTC, "detectarSiRequiereHomologacion").mockRejectedValue(new Error("mtc caido"));
    jest.spyOn(agentesNavegacion.DIGESA, "detectarSiRequiereRegistro").mockResolvedValue({ requiereRegistroSanitario: true });
    jest.spyOn(agentesNavegacion.SENASA, "detectarSiRequierePermiso").mockResolvedValue({ requierePermisoFitosanitario: false });
    jest.spyOn(agentesNavegacion.MINAM, "detectarSiRequierePermiso").mockResolvedValue({ requierePermisoAmbiental: false });
    jest.spyOn(agentesNavegacion.PRODUCE, "detectarSiRequierePermisoPesca").mockResolvedValue({ esPesquero: false });
    jest.spyOn(agentesNavegacion.INDECOPI, "consultarAntidumping").mockResolvedValue({ tieneAntidumping: false });

    const result = await sistemaAgentes.detectarRequisitos("router", "telecom", "CN");

    expect(result.permisos).toEqual([
      {
        entidad: "DIGESA",
        tramite: "Registro Sanitario",
        obligatorio: true,
      },
    ]);
    expect(result.errores_fuente).toEqual([
      {
        fuente: "mtc",
        error: "mtc caido",
      },
    ]);
  });

  it("genera reporte parcial aunque falle una fuente oficial", async () => {
    sistemaAgentes.inicializado = true;
    jest.spyOn(agentesNavegacion.SUNAT, "consultarArancel").mockResolvedValue({ advalorem: 0 });
    jest.spyOn(agentesNavegacion.SUNAT, "consultarTipoCambio").mockResolvedValue({ venta: 3.72 });
    jest.spyOn(agentesNavegacion.VUCE, "consultarRestricciones").mockRejectedValue(new Error("vuce caida"));
    jest.spyOn(agentesNavegacion.INDECOPI, "consultarAntidumping").mockResolvedValue({ tieneAntidumping: false });
    jest.spyOn(sistemaAgentes, "detectarRequisitos").mockResolvedValue({
      permisos: [{ entidad: "MTC", tramite: "Certificado de Homologacion", obligatorio: true }],
      alertas: [],
      errores_fuente: [],
    });

    const result = await sistemaAgentes.generarReporteImportacion("router", "8517130000", "CN");

    expect(result.arancel).toEqual({ advalorem: 0 });
    expect(result.tipo_cambio).toEqual({ venta: 3.72 });
    expect(result.restricciones).toBeNull();
    expect(result.permisos_requeridos).toHaveLength(1);
    expect(result.errores_fuente).toContainEqual({
      fuente: "restricciones",
      error: "vuce caida",
    });
    expect(result.error).toBeUndefined();
  });

  it("mantiene el runtime de inicializacion con wording honesto", () => {
    const content = fs.readFileSync(
      path.join(__dirname, "..", "..", "server", "sistema-agentes.js"),
      "utf8"
    );

    expect(content).toContain("[SISTEMA AGENTES] Inicializacion ya completada");
    expect(content).toContain("Navegacion inicializada:");
    expect(content).toContain("Auto-Repair preparado para autocorreccion");
    expect(content).toContain("memoria: 'Pendiente de preparacion'");
    expect(content).toContain("memoria: 'Preparada con advertencias'");
    expect(content).toContain("estado: 'Pendiente de preparacion'");
    expect(content).toContain("estado: 'Preparado con advertencias'");
    expect(content).toContain("[SISTEMA AGENTES] Inicializacion completada para ${this.agentes.total} agentes");
    expect(content).not.toContain("[SISTEMA AGENTES] OK Ya inicializado");
    expect(content).not.toContain("   OK ${registro.resumen.navegacion} Agentes de Navegacion:");
    expect(content).not.toContain("   OK Auto-Repair: Agentes que se autocorrigen");
    expect(content).not.toContain("Auto-Repair inicializado para autocorreccion");
    expect(content).not.toContain("memoria: 'Pendiente de inicializacion'");
    expect(content).not.toContain("memoria: 'Inicializada con advertencias'");
    expect(content).not.toContain("estado: 'Pendiente de inicializacion'");
    expect(content).not.toContain("estado: 'Inicializado con advertencias'");
    expect(content).not.toContain("[SISTEMA AGENTES] OK ${this.agentes.total} agentes inicializados");
  });
});
