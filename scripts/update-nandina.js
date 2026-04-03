#!/usr/bin/env node
// Run manually: node scripts/update-nandina.js
// Checks Aduanet for NANDINA updates and applies them

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const nandinaService = require('../server/nandina');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatChangeLine(change) {
  if (!change || typeof change !== 'object') return null;
  if (change.type === 'added') return `    + ${change.hs} ${change.desc}`;
  if (change.type === 'removed') return `    - ${change.hs} ${change.desc}`;
  if (change.type === 'av_changed') return `    * ${change.hs} Ad Valorem: ${change.from}% -> ${change.to}%`;
  if (change.type === 'isc_changed') return `    * ${change.hs} ISC: ${change.from}% -> ${change.to}%`;
  return null;
}

async function main() {
  console.log('Verificando actualizaciones NANDINA...\n');

  await nandinaService.init();
  const currentData = asArray(nandinaService.getData?.());
  console.log(`  Estado actual: ${currentData.length} partidas`);
  console.log(`  Ultima actualizacion: ${nandinaService.getLastUpdate?.() || 'sin dato'}`);
  console.log(`  Fuente: ${nandinaService.getSource?.() || 'sin dato'}\n`);

  console.log('  Consultando Aduanet...');
  const result = await nandinaService.checkForUpdates();
  const changes = asArray(result?.changes);

  if (result?.updated) {
    console.log(`\n  ACTUALIZADO: ${result.count || currentData.length} partidas`);
    if (changes.length > 0) {
      console.log(`  ${changes.length} cambios detectados:\n`);
      changes.slice(0, 20).forEach((change) => {
        const line = formatChangeLine(change);
        if (line) console.log(line);
      });
      if (changes.length > 20) console.log(`    ... y ${changes.length - 20} mas`);
    }
  } else {
    console.log('\n  Sin cambios. La base esta al dia.');
  }

  console.log(`\n  Ultima verificacion: ${nandinaService.getLastCheck?.() || 'sin dato'}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

module.exports = {
  asArray,
  formatChangeLine,
  main,
};
