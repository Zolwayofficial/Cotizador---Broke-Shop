// server/clasificador.js - Multi-agente para clasificacion HS de alta precision

const aiProxy = require('./ai-proxy');
const doctrina = require('./clasificacion-doctrina');

const UNLIMITED = process.env.GROQ_MODEL_UNLIMITED || 'llama-3.1-8b-instant';
const ENABLE_LIVE_GROQ = process.env.NODE_ENV !== 'test' || process.env.ALLOW_LIVE_GROQ_TESTS === '1';
const HAS_GROQ = Boolean(process.env.GROQ_API_KEY) && ENABLE_LIVE_GROQ;

const AGENT_A_CHAIN = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.3-70b-versatile',
  UNLIMITED,
];

const AGENT_B_CHAIN = [
  'qwen/qwen3-32b',
  'openai/gpt-oss-20b',
  UNLIMITED,
];

const ARBITER_CHAIN = [
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  UNLIMITED,
];

const SYSTEM_AGENT = (agentId) => `Eres el Agente Clasificador ${agentId}, experto en el Arancel de Aduanas del Peru.
Tu tarea: clasificar un producto en su subpartida nacional de 10 digitos.

REGLAS ESTRICTAS:
1. Usa las 6 Reglas Generales Interpretativas (RGI) del Sistema Armonizado.
2. Antes de decidir, realiza analisis merceologico: origen/procedencia, materia, propiedades fisicas, propiedades quimicas si aplican, presentacion comercial, uso final y estado de la mercancia.
3. Si detectas mercancia usada, incompleta, desmontada, mezclas, juegos, estuches o envases, menciona la RGI relevante.
4. Prioriza: Regla 1 (texto de partida) > Regla 3 (caracter esencial) > Regla 6 (subpartida).
5. Responde SOLO en formato JSON:
{
  "hs": "XXXX.XX.XX.XX",
  "confianza": 0-100,
  "advalorem": 0|6|11,
  "razonamiento": "Regla X aplicada porque...",
  "alternativas": ["YYYY.YY.YY.YY"]
}
6. Si no estas seguro (confianza <70), incluye 2-3 alternativas.
7. Arancel base: D.S. 342-2016-EF modificado por D.S. 401-2021-EF (vigente 2022).
8. Solo 3 tasas Ad Valorem existen: 0%, 6%, 11%.

Marco doctrinario resumido:
${doctrina.RGI_SUMMARY.map((item) => `- ${item}`).join('\n')}`;

const SYSTEM_ARBITER = `Eres el Arbitro de Clasificacion Arancelaria. Dos agentes clasificadores han dado su opinion sobre un producto.
Tu trabajo:
1. Analizar ambas clasificaciones.
2. Determinar cual es correcta o proponer una tercera si ambos estan mal.
3. Explicar por que, citando RGI especificas.
4. Verificar si ambos agentes consideraron merceologia, mercancia usada o alterada, mezclas, juegos, estuches, envases y estados incompletos.
5. Dar la clasificacion final con nivel de confianza.

Responde SOLO en JSON:
{
  "hs_final": "XXXX.XX.XX.XX",
  "confianza": 0-100,
  "advalorem": 0|6|11,
  "ganador": "agente1"|"agente2"|"arbitro",
  "razonamiento": "...",
  "discrepancia": "resumen de por que los agentes difirieron",
  "advertencia": "..." o null
}

Marco doctrinario resumido:
${doctrina.RGI_SUMMARY.map((item) => `- ${item}`).join('\n')}`;

function buildClassificationUserMessage(descripcion, imagenBase64) {
  const productDescription = descripcion || 'ver imagen';
  const context = doctrina.buildClassificationContext(descripcion);

  if (imagenBase64) {
    return [
      { type: 'image_url', image_url: { url: imagenBase64 } },
      {
        type: 'text',
        text: `Clasifica este producto para importacion al Peru: ${productDescription}\n\n${context.promptBlock}`,
      },
    ];
  }

  return `Clasifica este producto para importacion al Peru: ${productDescription}\n\n${context.promptBlock}`;
}

async function clasificarMultiAgente(descripcion, imagenBase64) {
  const startTime = Date.now();
  const classificationContext = doctrina.buildClassificationContext(descripcion);
  const resultado = {
    metodo: 'multi-agente',
    agentes: [],
    consenso: null,
    arbitraje: null,
    tiempoMs: 0,
    contextoClasificacion: classificationContext,
  };

  const userMsg = buildClassificationUserMessage(descripcion, imagenBase64);

  const [resp1, resp2] = await Promise.allSettled([
    callAgentWithFallback('A', userMsg, AGENT_A_CHAIN),
    callAgentWithFallback('B', userMsg, AGENT_B_CHAIN),
  ]);

  const agent1 = parseAgentResponse(resp1);
  const agent2 = parseAgentResponse(resp2);
  resultado.agentes = [agent1, agent2];

  const hs1 = normalizeHS(agent1?.hs);
  const hs2 = normalizeHS(agent2?.hs);

  if (hs1 && hs2 && hs1 === hs2) {
    const avgConf = ((agent1.confianza || 80) + (agent2.confianza || 80)) / 2;
    resultado.consenso = {
      hs: agent1.hs,
      confianza: Math.min(99, avgConf + 10),
      advalorem: agent1.advalorem,
      razonamiento: agent1.razonamiento,
      metodo: 'consenso_directo',
    };
  } else if (hs1 && hs2 && hs1.substring(0, 6) === hs2.substring(0, 6)) {
    const best = (agent1.confianza || 0) >= (agent2.confianza || 0) ? agent1 : agent2;
    resultado.consenso = {
      hs: best.hs,
      confianza: Math.min(85, best.confianza || 70),
      advalorem: best.advalorem,
      razonamiento: best.razonamiento,
      metodo: 'mejor_confianza',
      advertencia: `Agentes coinciden en partida ${hs1.substring(0, 4)} pero difieren en subpartida. Verificar manualmente.`,
    };
  } else {
    resultado.arbitraje = await arbitrar(descripcion, agent1, agent2);
    if (resultado.arbitraje) {
      resultado.consenso = {
        hs: resultado.arbitraje.hs_final,
        confianza: resultado.arbitraje.confianza,
        advalorem: resultado.arbitraje.advalorem,
        razonamiento: resultado.arbitraje.razonamiento,
        metodo: 'arbitraje',
        advertencia: resultado.arbitraje.advertencia || `Discrepancia: ${resultado.arbitraje.discrepancia}`,
      };
    }
  }

  if (resultado.consenso?.hs) {
    try {
      const nandinaService = require('./nandina');
      const data = nandinaService.getData();
      const clean = resultado.consenso.hs.replace(/\./g, '').padEnd(10, '0');
      const match = data.find((item) => item.p === clean);

      if (match) {
        resultado.consenso.validadoNandina = true;
        resultado.consenso.descripcionOficial = match.d;
        resultado.consenso.advalorem = match.a;
      } else {
        const match8 = data.find((item) => item.p.startsWith(clean.substring(0, 8)));
        if (match8) {
          resultado.consenso.validadoNandina = true;
          resultado.consenso.hsCorregido = match8.p;
          resultado.consenso.descripcionOficial = match8.d;
          resultado.consenso.advalorem = match8.a;
          resultado.consenso.advertencia = `${resultado.consenso.advertencia || ''} HS ajustado de ${resultado.consenso.hs} a ${match8.p} segun NANDINA oficial.`.trim();
        } else {
          resultado.consenso.validadoNandina = false;
          const fallbackOnly = resultado.agentes.every((agent) => agent?.metodo === 'keyword_fallback');
          const scenarioSuffix = fallbackOnly && classificationContext.triggers.length
            ? ` Escenarios detectados: ${classificationContext.triggers.map((item) => `${item.rule} (${item.label})`).join('; ')}`
            : '';
          resultado.consenso.advertencia = `${resultado.consenso.advertencia || ''} HS no encontrado en base NANDINA. Verificar manualmente.${scenarioSuffix}`.trim();
          const confidenceFloor = fallbackOnly ? 15 : 40;
          resultado.consenso.confianza = Math.max(confidenceFloor, (resultado.consenso.confianza || 70) - 20);
        }
      }
    } catch (_) {
      // Fallback silencioso si NANDINA no esta disponible en este contexto.
    }
  }

  resultado.tiempoMs = Date.now() - startTime;
  return resultado;
}

async function callAgentWithFallback(id, userMsg, modelChain) {
  if (!HAS_GROQ) {
    return JSON.stringify(clasificarPorKeywords(extraerTextoFallback(userMsg)));
  }

  for (const model of modelChain) {
    try {
      const messages = [
        { role: 'system', content: SYSTEM_AGENT(id) },
        { role: 'user', content: userMsg },
      ];
      const result = await aiProxy.call(messages, 'groq', model);
      const parsed = parseJSON(result.text);

      if (parsed?.hs && parsed.hs !== 'error') {
        return result.text;
      }
    } catch (error) {
      const is429 = error.message?.includes('429') || error.message?.includes('rate') || error.message?.includes('limit');
      if (is429 && model !== modelChain[modelChain.length - 1]) {
        console.log(`[CLASIFICADOR] ${model} rate limited, trying next...`);
        continue;
      }
    }
  }

  console.log('[CLASIFICADOR] Todos los modelos fallaron, usando fallback por keywords');
  return JSON.stringify(clasificarPorKeywords(extraerTextoFallback(userMsg)));
}

function clasificarPorKeywords(texto) {
  const text = (texto || '').toLowerCase();
  const classificationContext = doctrina.buildClassificationContext(texto);
  const keywords = [
    { words: ['camiseta', 'polo', 'playera', 'remera'], hs: '6109.10.00.10', cap: 'Textil - Prendas de vestir' },
    { words: ['pantalon', 'jeans', 'trousers'], hs: '6203.42.00.00', cap: 'Textil - Pantalones' },
    { words: ['zapato', 'shoe', 'footwear'], hs: '6403.99.90.00', cap: 'Calzado' },
    { words: ['laptop', 'notebook', 'computadora', 'ordenador'], hs: '8471.30.00.00', cap: 'Computadoras' },
    { words: ['celular', 'movil', 'smartphone', 'telefono'], hs: '8517.12.00.00', cap: 'Telefonia' },
    { words: ['audifono', 'headphone', 'auricular'], hs: '8518.30.00.00', cap: 'Audio' },
    { words: ['reloj', 'watch'], hs: '9102.19.00.00', cap: 'Relojeria' },
    { words: ['bolsa', 'bag', 'maleta'], hs: '4202.92.00.00', cap: 'Marroquineria' },
    { words: ['maquina', 'equipment', 'equipo'], hs: '8479.89.90.00', cap: 'Maquinaria' },
    { words: ['plastico', 'plastic'], hs: '3926.90.90.90', cap: 'Plasticos' },
    { words: ['acero', 'steel', 'metal'], hs: '7326.90.99.00', cap: 'Metales' },
  ];

  for (const keyword of keywords) {
    if (keyword.words.some((word) => text.includes(word))) {
      const complexScenario = classificationContext.triggers.length > 0 || classificationContext.scenarioNotes.length > 1;
      return {
        hs: keyword.hs,
        confianza: complexScenario ? 18 : 30,
        advalorem: 6,
        razonamiento: `Clasificacion por keyword: "${keyword.words.find((word) => text.includes(word))}" -> Capitulo ${keyword.cap}. ${classificationContext.scenarioNotes.join(' ')}`.trim(),
        metodo: 'keyword_fallback',
        advertencia: `Clasificacion automatica por palabras clave. Verificar manualmente con un especialista.${classificationContext.triggers.length ? ` Escenarios detectados: ${classificationContext.triggers.map((item) => `${item.rule} (${item.label})`).join('; ')}` : ''}`,
      };
    }
  }

  return {
    hs: '0000.00.00.00',
    confianza: 0,
    advalorem: 0,
    razonamiento: 'No se pudo determinar clasificacion por keywords',
    metodo: 'fallback',
    advertencia: 'No se pudo clasificar automaticamente. Requerir clasificacion manual por experto.',
  };
}

function extraerTextoFallback(userMsg) {
  if (typeof userMsg === 'string') return userMsg;

  if (Array.isArray(userMsg)) {
    return userMsg
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text') return part.text || '';
        return '';
      })
      .filter(Boolean)
      .join(' ');
  }

  return '';
}

async function arbitrar(descripcion, agent1, agent2) {
  if (!HAS_GROQ) {
    return null;
  }

  const classificationContext = doctrina.buildClassificationContext(descripcion);

  for (const model of ARBITER_CHAIN) {
    try {
      const messages = [
        { role: 'system', content: SYSTEM_ARBITER },
        {
          role: 'user',
          content: `Producto: "${descripcion}"

Agente A clasifico: ${JSON.stringify(agent1)}
Agente B clasifico: ${JSON.stringify(agent2)}

Son modelos de familias diferentes, asi que las discrepancias son reales.
Determina la clasificacion correcta.

${classificationContext.promptBlock}`,
        },
      ];

      const result = await aiProxy.call(messages, 'groq', model);
      return parseJSON(result.text);
    } catch (error) {
      const is429 = error.message?.includes('429') || error.message?.includes('rate');
      if (is429 && model !== ARBITER_CHAIN[ARBITER_CHAIN.length - 1]) {
        continue;
      }
      return null;
    }
  }

  return null;
}

function normalizeHS(hs) {
  if (!hs) return null;
  return hs.replace(/\./g, '').replace(/\s/g, '').substring(0, 10).padEnd(10, '0');
}

function parseAgentResponse(settled) {
  if (settled.status !== 'fulfilled') {
    return { error: 'Agent failed' };
  }
  return parseJSON(settled.value) || { raw: settled.value, error: 'Could not parse' };
}

function parseJSON(text) {
  if (!text) return null;

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');

    if (start >= 0 && end > start) {
      return JSON.parse(clean.substring(start, end + 1));
    }

    return JSON.parse(clean);
  } catch (_) {
    return null;
  }
}

module.exports = {
  clasificarMultiAgente,
  buildClassificationContext: doctrina.buildClassificationContext,
};
