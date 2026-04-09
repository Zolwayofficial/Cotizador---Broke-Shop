const fs = require("fs");
const path = require("path");
const { describe, it, expect } = require("@jest/globals");

describe("nandina fraseo de runtime", () => {
  it("mantiene los mensajes de carga y descarga sin sobreafirmar con OK", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../../server/nandina.js"),
      "utf8"
    );

    expect(source).toContain("TABLA ${name} descargada");
    expect(source).toContain("[ADUANET] Datos cargados:");
    expect(source).toContain("[ADUANET] Datos cargados desde simple json:");
    expect(source).not.toContain("  OK ${name}:");
    expect(source).not.toContain("[ADUANET] OK ${_nandina.length} partidas |");
    expect(source).not.toContain("[ADUANET] OK ${_nandina.length} partidas (simple json)");
  });
});
