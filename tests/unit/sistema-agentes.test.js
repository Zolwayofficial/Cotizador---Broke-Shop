const { describe, it, expect } = require("@jest/globals");

const sistemaAgentes = require("../../server/sistema-agentes");

describe("sistemaAgentes.obtenerRegistroAgentes", () => {
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
});
