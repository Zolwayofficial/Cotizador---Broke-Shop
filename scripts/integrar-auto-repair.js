const fs = require('fs');
const path = require('path');

const SERVER_DIR = path.join(__dirname, '..', 'server');
const AUTO_REPAIR_IMPORT = 'const autoRepair = require("./auto-repair");';
const AGENTS = [
  { file: 'clasificador.js', nombre: 'clasificador', funcion: 'clasificarMultiAgente' },
  { file: 'agente-conversador.js', nombre: 'agente-conversador', funcion: 'agenteConversador' },
  { file: 'auto-cotizar.js', nombre: 'auto-cotizar', funcion: 'calcular' },
  { file: 'ai-proxy.js', nombre: 'ai-proxy', funcion: 'classify' },
  { file: 'flete-api.js', nombre: 'flete-api', funcion: 'cotizarFlete' },
  { file: 'valoracion.js', nombre: 'valoracion', funcion: 'getEstadisticas' },
  { file: 'sanciones.js', nombre: 'sanciones', funcion: 'verificar' },
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasAutoRepairImport(content) {
  return /require\((['"])\.\/auto-repair\1\)/.test(content || '');
}

function insertAutoRepairImport(content) {
  if (hasAutoRepairImport(content)) {
    return { changed: false, reason: 'exists', content };
  }

  const requireMatches = [
    ...(content || '').matchAll(/^(const\s+\w+\s*=\s*require\((['"]).+?\2\);.*)$/gm),
  ];
  if (requireMatches.length === 0) {
    return { changed: false, reason: 'no-require-block', content };
  }

  const lastMatch = requireMatches[requireMatches.length - 1];
  const insertionPoint = (lastMatch.index || 0) + lastMatch[0].length;
  const updatedContent =
    `${content.slice(0, insertionPoint)}\n${AUTO_REPAIR_IMPORT}${content.slice(insertionPoint)}`;

  return { changed: true, reason: 'inserted', content: updatedContent };
}

function findPrimaryFunction(content, functionName) {
  if (!functionName) {
    return false;
  }

  const pattern = new RegExp(
    String.raw`(?:async\s+function\s+${escapeRegExp(functionName)}\s*\(|(?:const|let|var)\s+${escapeRegExp(functionName)}\s*=\s*async\s*\()`,
  );
  return pattern.test(content || '');
}

function updateAgentFile(filePath) {
  const originalContent = fs.readFileSync(filePath, 'utf8');
  const importState = insertAutoRepairImport(originalContent);

  if (!importState.changed) {
    return {
      changed: false,
      reason: importState.reason,
      content: originalContent,
    };
  }

  fs.writeFileSync(filePath, importState.content, 'utf8');
  return {
    changed: true,
    reason: importState.reason,
    content: importState.content,
  };
}

function runIntegration({ write = true, log = console.log } = {}) {
  let modifiedImports = 0;
  let functionsFound = 0;

  log('Integrating auto-repair into configured agents...\n');

  AGENTS.forEach((agent) => {
    const filePath = path.join(SERVER_DIR, agent.file);

    if (!fs.existsSync(filePath)) {
      log(`WARN ${agent.file}: file not found`);
      return;
    }

    const originalContent = fs.readFileSync(filePath, 'utf8');
    const functionFound = findPrimaryFunction(originalContent, agent.funcion);
    if (functionFound) {
      functionsFound += 1;
    }

    const importState = insertAutoRepairImport(originalContent);
    if (write && importState.changed) {
      fs.writeFileSync(filePath, importState.content, 'utf8');
    }

    if (importState.changed) {
      modifiedImports += 1;
      log(`${agent.file}: auto-repair import ${write ? 'prepared' : 'detected'}`);
    } else if (importState.reason === 'exists') {
      log(`SKIP ${agent.file}: auto-repair import already present`);
    } else {
      log(`WARN ${agent.file}: no safe require block found for import insertion`);
    }

    if (agent.funcion) {
      log(
        functionFound
          ? `${agent.file}: primary function ${agent.funcion} found`
          : `WARN ${agent.file}: primary function ${agent.funcion} not found`,
      );
    }
  });

  log(`\nCompleted: ${modifiedImports}/${AGENTS.length} imports prepared.`);
  log(`Primary functions found: ${functionsFound}/${AGENTS.length}.`);
  log(
    'Note: function wrapping remains manual with autoRepair.ejecutarConAutoReparacion().',
  );

  return {
    modifiedImports,
    functionsFound,
    totalAgents: AGENTS.length,
  };
}

if (require.main === module) {
  runIntegration();
}

module.exports = {
  AGENTS,
  AUTO_REPAIR_IMPORT,
  escapeRegExp,
  findPrimaryFunction,
  hasAutoRepairImport,
  insertAutoRepairImport,
  runIntegration,
  updateAgentFile,
};
