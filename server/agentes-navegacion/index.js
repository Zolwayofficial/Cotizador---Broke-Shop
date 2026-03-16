// server/agentes-navegacion/index.js
// 
// ÍNDICE DE TODOS LOS AGENTES DE NAVEGACIÓN ESPECIALISTAS

const { MemoriaAgente, init: initMemoria } = require("./MemoriaAgente");

// Agentes de Gobierno
const AgenteNavegadorSUNAT = require("./AgenteNavegadorSUNAT");
const AgenteNavegadorADUANET = require("./AgenteNavegadorADUANET");
const AgenteNavegadorVUCE = require("./AgenteNavegadorVUCE");
const AgenteNavegadorINDECOPI = require("./AgenteNavegadorINDECOPI");

// Agentes de Ministerios
const AgenteNavegadorMTC = require("./AgenteNavegadorMTC");
const AgenteNavegadorDIGESA = require("./AgenteNavegadorDIGESA");
const AgenteNavegadorSENASA = require("./AgenteNavegadorSENASA");
const AgenteNavegadorMINAM = require("./AgenteNavegadorMINAM");
const AgenteNavegadorPRODUCE = require("./AgenteNavegadorPRODUCE");

// Agentes (se crean PERO no se inicializan hasta después)
const sunat = new AgenteNavegadorSUNAT();
const aduanet = new AgenteNavegadorADUANET();
const vuce = new AgenteNavegadorVUCE();
const indecopi = new AgenteNavegadorINDECOPI();
const mtc = new AgenteNavegadorMTC();
const digesa = new AgenteNavegadorDIGESA();
const senasa = new AgenteNavegadorSENASA();
const minam = new AgenteNavegadorMINAM();
const produce = new AgenteNavegadorPRODUCE();

// Inicializar memoria compartida PRIMERO
async function init() {
  console.log("[AGENTES NAVEGACIÓN] Inicializando...");

  // 1. Inicializar memoria PRIMERO (crea las tablas)
  await initMemoria();
  console.log("[MEMORIA] ✅ Tablas creadas");

  // 2. AHORA inicializar cada agente (ya pueden usar las tablas)
  await sunat.init();
  await aduanet.init();
  await vuce.init();
  await indecopi.init();
  await mtc.init();
  await digesa.init();
  await senasa.init();
  await minam.init();
  await produce.init();

  console.log("[AGENTES NAVEGACIÓN] ✅ Listo");
  console.log(`   - SUNAT: ✅`);
  console.log(`   - ADUANET: ✅`);
  console.log(`   - VUCE: ✅`);
  console.log(`   - INDECOPI: ✅`);
  console.log(`   - MTC: ✅`);
  console.log(`   - DIGESA: ✅`);
  console.log(`   - SENASA: ✅`);
  console.log(`   - MINAM: ✅`);
  console.log(`   - PRODUCE: ✅`);
}

// Exportar todos los agentes
module.exports = {
  // Inicialización
  init,

  // Agentes de Gobierno
  SUNAT: sunat,
  ADUANET: aduanet,
  VUCE: vuce,
  INDECOPI: indecopi,

  // Agentes de Ministerios
  MTC: mtc,
  DIGESA: digesa,
  SENASA: senasa,
  MINAM: minam,
  PRODUCE: produce,

  // Memoria compartida
  MemoriaAgente,

  // Funciones utilitarias
  obtenerEstadisticasGenerales() {
    return {
      agentes_activos: ['SUNAT', 'ADUANET', 'VUCE', 'INDECOPI', 'MTC', 'DIGESA', 'SENASA', 'MINAM', 'PRODUCE'],
      memoria: 'Inicializada',
      total_agentes: 9,
      sunat: sunat.obtenerEstadisticas(),
      aduanet: aduanet.obtenerEstadisticas(),
      vuce: vuce.obtenerEstadisticas(),
      indecopi: indecopi.obtenerEstadisticas(),
      mtc: mtc.obtenerEstadisticas(),
      digesa: digesa.obtenerEstadisticas(),
      senasa: senasa.obtenerEstadisticas(),
      minam: minam.obtenerEstadisticas(),
      produce: produce.obtenerEstadisticas()
    };
  }
};
