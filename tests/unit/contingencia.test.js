const fs = require("fs");
const path = require("path");
const { describe, it, expect } = require("@jest/globals");

const contingencia = require("../../server/couriers/contingencia-api");

describe("contingencia de logistica", () => {
  it("mantiene disponibles couriers personalizados no rastreados por cuota", () => {
    expect(contingencia.estaDisponible("DHL Directo (Contrato)")).toBe(true);
  });

  it("acepta alias visibles de APIs configuradas", () => {
    expect(contingencia.estaDisponible("Pack & Send")).toBe(true);
    expect(contingencia.estaDisponible("Parcel Monkey")).toBe(true);
    expect(contingencia.estaDisponible("Shippo")).toBe(true);
  });

  it("expone APIs sin cuota local sin fingir limite numerico", () => {
    const estado = contingencia.obtenerEstado();

    expect(estado.packsend.limite).toBe("Sin cuota local");
    expect(estado.packsend.porcentaje).toBeNull();
    expect(estado.interparcel.limite).toBe("Sin cuota local");
    expect(estado.parcelmonkey.limite).toBe("Sin cuota local");
  });

  it("expone prioridad logistica sin vender disponibilidad ilimitada", () => {
    const prioridad = contingencia.obtenerPrioridad();
    const packsend = prioridad.find((courier) => courier.nombre === "Pack & Send");
    const shippo = prioridad.find((courier) => courier.nombre === "Shippo");

    expect(packsend).toEqual(
      expect.objectContaining({
        tipo: "api",
        cuotaLocalRastreada: false,
      })
    );
    expect(packsend).not.toHaveProperty("ilimitado");

    expect(shippo).toEqual(
      expect.objectContaining({
        tipo: "api",
        cuotaLocalRastreada: true,
      })
    );
  });

it("mantiene el codigo fuente limpio de mojibake y fraseo exagerado", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../../server/couriers/contingencia-api.js"),
      "utf8"
    );

    expect(source).toContain("uso reiniciado para el nuevo periodo");
    expect(source).toContain("CREDITOS AGOTADOS");
    expect(source).not.toContain("APIs ilimitadas siempre disponibles");
    expect(source).toContain("Sin cuota local");
    expect(source).not.toContain("Ilimitado");
    expect(source).not.toContain("ilimitado");
    expect(source).not.toContain("[CONTINGENCIA] OK");
    expect(source).toContain("cuotaLocalRastreada");
    expect(source).not.toContain("\u00f0");
    expect(source).not.toContain("\u00e2");
    expect(source).not.toMatch(/[\u00c3\uFFFD]/);
  });
});
