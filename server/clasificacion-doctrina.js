const MERCEOLOGY_CHECKLIST = [
  'Origen o procedencia de la mercancia',
  'Propiedades fisicas: material, forma, densidad, dureza, estado',
  'Propiedades quimicas si afectan la naturaleza del producto',
  'Variedad comercial, presentacion y uso final',
  'Alteraciones: usado, deteriorado, reacondicionado, incompleto',
  'Falsificaciones o imitaciones de otra materia o marca',
];

const RGI_SUMMARY = [
  'RGI 1: manda el texto legal de partidas, notas de seccion y notas de capitulo',
  'RGI 2a: cubre articulos incompletos, sin terminar, desmontados o sin montar con caracter esencial',
  'RGI 2b: cubre materias mezcladas o asociadas; deriva al analisis de RGI 3',
  'RGI 3a: prevalece la descripcion mas especifica sobre la generica',
  'RGI 3b: para mezclas, compuestos o surtidos, manda el caracter esencial',
  'RGI 3c: si no resuelven 3a o 3b, usar la ultima partida por orden numerico razonable',
  'RGI 4: usar analogia solo si las reglas anteriores no permiten clasificar',
  'RGI 5a y 5b: estuches, continentes y envases se clasifican con la mercancia en casos tipicos',
  'RGI 6: en subpartidas solo se comparan subpartidas del mismo nivel',
];

const RULE_TRIGGERS = [
  {
    rule: 'RGI 2a',
    label: 'Articulo incompleto o desmontado',
    patterns: [
      /\bincomplet[oa]s?\b/i,
      /\bsin montar\b/i,
      /\bdesmontad[oa]s?\b/i,
      /\bkit\b/i,
      /\bset de piezas\b/i,
      /\bsin puertas\b/i,
      /\bsin tapa\b/i,
    ],
  },
  {
    rule: 'RGI 2b/3',
    label: 'Mezcla, compuesto o asociacion de materias',
    patterns: [
      /\bmezcla\b/i,
      /\bmezclad[oa]s?\b/i,
      /\bcompuest[oa]s?\b/i,
      /\bde [a-z0-9\s]+ y [a-z0-9\s]+\b/i,
      /\bcon [a-z0-9\s]+ y [a-z0-9\s]+\b/i,
      /\bsurtid[oa]s?\b/i,
      /\bjuego\b/i,
      /\bcombo\b/i,
    ],
  },
  {
    rule: 'RGI 5',
    label: 'Estuche, continente o envase relevante',
    patterns: [
      /\bestuche\b/i,
      /\blata\b/i,
      /\bcaja\b/i,
      /\benvase\b/i,
      /\bmaletin\b/i,
      /\bcontenedor\b/i,
      /\bcase\b/i,
    ],
  },
];

const ALTERATION_PATTERNS = [
  /\busad[oa]s?\b/i,
  /\breacondicionad[oa]s?\b/i,
  /\bremanufacturad[oa]s?\b/i,
  /\bdeteriorad[oa]s?\b/i,
  /\bsegunda[\s-]?mano\b/i,
];

const FALSIFICATION_PATTERNS = [
  /\bimitacion(?:es)?\b/i,
  /\breplicas?\b/i,
  /\bno original\b/i,
  /\btipo cuero\b/i,
  /\bparecido a\b/i,
];

function normalizarTexto(value = '') {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function buildClassificationContext(description = '') {
  const text = String(description || '').trim();
  const normalizedText = normalizarTexto(text.replace(/[/+&]+/g, ' y '));
  const triggers = RULE_TRIGGERS
    .filter((item) => item.patterns.some((pattern) => pattern.test(normalizedText)))
    .map((item) => ({ rule: item.rule, label: item.label }));

  const alterationFlags = ALTERATION_PATTERNS
    .filter((pattern) => pattern.test(normalizedText))
    .map((pattern) => pattern.source);

  const falsificationFlags = FALSIFICATION_PATTERNS
    .filter((pattern) => pattern.test(normalizedText))
    .map((pattern) => pattern.source);

  const scenarioNotes = [];
  if (alterationFlags.length) {
    scenarioNotes.push('La mercancia parece usada o alterada; verificar si su estado cambia requisitos, pero no asumir una nueva partida sin sustento legal.');
  }
  if (falsificationFlags.length) {
    scenarioNotes.push('Hay indicios de imitacion o material aparente; revisa composicion y naturaleza real antes de clasificar.');
  }
  if (!triggers.length) {
    scenarioNotes.push('No se detectan atajos claros; aplicar RGI 1 primero y bajar a subpartida con RGI 6.');
  }

  const promptBlock = [
    'Checklist merceologico obligatorio:',
    ...MERCEOLOGY_CHECKLIST.map((item, index) => `${index + 1}. ${item}`),
    'Resumen doctrinario RGI:',
    ...RGI_SUMMARY.map((item) => `- ${item}`),
    triggers.length
      ? `Escenarios detectados: ${triggers.map((item) => `${item.rule} (${item.label})`).join('; ')}`
      : 'Escenarios detectados: ninguno explicito; usa clasificacion base por texto legal.',
    ...scenarioNotes.map((note) => `- ${note}`),
  ].join('\n');

  return {
    merceologyChecklist: [...MERCEOLOGY_CHECKLIST],
    rgiSummary: [...RGI_SUMMARY],
    triggers,
    scenarioNotes,
    promptBlock,
  };
}

module.exports = {
  MERCEOLOGY_CHECKLIST,
  RGI_SUMMARY,
  buildClassificationContext,
  _private: {
    normalizarTexto,
  },
};
