#!/usr/bin/env node
// Run manually: node scripts/update-nandina.js
// Checks Aduanet for NANDINA updates and applies them

require("dotenv").config();
const nandinaService = require("../server/nandina");

async function main() {
  console.log("⬡ Verificando actualizaciones NANDINA...\n");

  await nandinaService.init();
  console.log(`  Estado actual: ${nandinaService.getData().length} partidas`);
  console.log(`  Última actualización: ${nandinaService.getLastUpdate()}`);
  console.log(`  Fuente: ${nandinaService.getSource()}\n`);

  console.log("  Consultando Aduanet...");
  const result = await nandinaService.checkForUpdates();

  if (result.updated) {
    console.log(`\n  ✅ ACTUALIZADO: ${result.count} partidas`);
    if (result.changes?.length > 0) {
      console.log(`  📋 ${result.changes.length} cambios detectados:\n`);
      result.changes.slice(0, 20).forEach(c => {
        if (c.type === "added") console.log(`    + ${c.hs} ${c.desc}`);
        else if (c.type === "removed") console.log(`    - ${c.hs} ${c.desc}`);
        else if (c.type === "av_changed") console.log(`    ∆ ${c.hs} Ad Valorem: ${c.from}% → ${c.to}%`);
        else if (c.type === "isc_changed") console.log(`    ∆ ${c.hs} ISC: ${c.from}% → ${c.to}%`);
      });
      if (result.changes.length > 20) console.log(`    ... y ${result.changes.length - 20} más`);
    }
  } else {
    console.log("\n  ✓ Sin cambios. La base está al día.");
  }

  console.log(`\n  Última verificación: ${nandinaService.getLastCheck()}`);
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
