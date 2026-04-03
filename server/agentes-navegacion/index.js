// server/agentes-navegacion/index.js
//
// Indice de todos los agentes de navegacion especialistas.

const { MemoriaAgente, init: initMemoria } = require('./MemoriaAgente');

// Agentes de Gobierno
const AgenteNavegadorSUNAT = require('./AgenteNavegadorSUNAT');
const AgenteNavegadorADUANET = require('./AgenteNavegadorADUANET');
const AgenteNavegadorVUCE = require('./AgenteNavegadorVUCE');
const AgenteNavegadorINDECOPI = require('./AgenteNavegadorINDECOPI');

// Agentes de Ministerios
const AgenteNavegadorMTC = require('./AgenteNavegadorMTC');
const AgenteNavegadorDIGESA = require('./AgenteNavegadorDIGESA');
const AgenteNavegadorSENASA = require('./AgenteNavegadorSENASA');
const AgenteNavegadorMINAM = require('./AgenteNavegadorMINAM');
const AgenteNavegadorPRODUCE = require('./AgenteNavegadorPRODUCE');

// Agentes (se crean pero no se inicializan hasta despues)
const sunat = new AgenteNavegadorSUNAT();
const aduanet = new AgenteNavegadorADUANET();
const vuce = new AgenteNavegadorVUCE();
const indecopi = new AgenteNavegadorINDECOPI();
const mtc = new AgenteNavegadorMTC();
const digesa = new AgenteNavegadorDIGESA();
const senasa = new AgenteNavegadorSENASA();
const minam = new AgenteNavegadorMINAM();
const produce = new AgenteNavegadorPRODUCE();

const NAVEGACION_AGENT_REGISTRY = [
  { id: 'sunat', nombre: 'SUNAT', categoria: 'navegacion' },
  { id: 'aduanet', nombre: 'ADUANET', categoria: 'navegacion' },
  { id: 'vuce', nombre: 'VUCE', categoria: 'navegacion' },
  { id: 'indecopi', nombre: 'INDECOPI', categoria: 'navegacion' },
  { id: 'mtc', nombre: 'MTC', categoria: 'navegacion' },
  { id: 'digesa', nombre: 'DIGESA', categoria: 'navegacion' },
  { id: 'senasa', nombre: 'SENASA', categoria: 'navegacion' },
  { id: 'minam', nombre: 'MINAM', categoria: 'navegacion' },
  { id: 'produce', nombre: 'PRODUCE', categoria: 'navegacion' },
];

let initialized = false;
let initPromise = null;

function safeObtenerEstadisticas(nombre, agente) {
  try {
    return agente.obtenerEstadisticas();
  } catch (error) {
    return {
      agente: nombre,
      error: error.message,
    };
  }
}

// Inicializar memoria compartida primero
async function init() {
  if (initialized) return;
  if (initPromise) {
    await initPromise;
    return;
  }

  console.log('[AGENTES NAVEGACION] Inicializando...');

  initPromise = (async () => {
    await initMemoria();
    console.log('[MEMORIA] Tablas preparadas');

    await sunat.init();
    await aduanet.init();
    await vuce.init();
    await indecopi.init();
    await mtc.init();
    await digesa.init();
    await senasa.init();
    await minam.init();
    await produce.init();

    initialized = true;
    console.log('[AGENTES NAVEGACION] Inicializacion completada');
    console.log('   - SUNAT: inicializado');
    console.log('   - ADUANET: inicializado');
    console.log('   - VUCE: inicializado');
    console.log('   - INDECOPI: inicializado');
    console.log('   - MTC: inicializado');
    console.log('   - DIGESA: inicializado');
    console.log('   - SENASA: inicializado');
    console.log('   - MINAM: inicializado');
    console.log('   - PRODUCE: inicializado');
  })();

  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
}

module.exports = {
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
      agentes_activos: NAVEGACION_AGENT_REGISTRY.map((agent) => agent.nombre),
      memoria: initialized ? 'Preparada' : 'Pendiente de preparacion',
      total_agentes: NAVEGACION_AGENT_REGISTRY.length,
      sunat: safeObtenerEstadisticas('SUNAT', sunat),
      aduanet: safeObtenerEstadisticas('ADUANET', aduanet),
      vuce: safeObtenerEstadisticas('VUCE', vuce),
      indecopi: safeObtenerEstadisticas('INDECOPI', indecopi),
      mtc: safeObtenerEstadisticas('MTC', mtc),
      digesa: safeObtenerEstadisticas('DIGESA', digesa),
      senasa: safeObtenerEstadisticas('SENASA', senasa),
      minam: safeObtenerEstadisticas('MINAM', minam),
      produce: safeObtenerEstadisticas('PRODUCE', produce),
    };
  },

  NAVEGACION_AGENT_REGISTRY,
  _private: {
    safeObtenerEstadisticas,
    resetInitStateForTests() {
      initialized = false;
      initPromise = null;
    },
  },
};
