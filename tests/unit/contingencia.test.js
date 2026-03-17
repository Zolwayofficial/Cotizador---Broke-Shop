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
});
