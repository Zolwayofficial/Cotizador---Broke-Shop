// server/clasificador.js — Multi-agente para clasificación HS de alta precisión
// CON AUTO-REPAIR: Aprende de fallos y se auto-corrige

const aiProxy = require('./ai-proxy');

// Model without daily limit (configure in .env if Groq changes this)
const UNLIMITED = process.env.GROQ_MODEL_UNLIMITED || 'llama-3.1-8b-instant';
const HAS_GROQ = Boolean(process.env.GROQ_API_KEY);

// Each chain: premium → mid → unlimited (3 familias diferentes por agente)
const AGENT_A_CHAIN = [
  'meta-llama/llama-4-scout-17b-16e-instruct',  // Meta Llama 4 (vision, 1K RPD)
  'llama-3.3-70b-versatile',                      // Meta Llama 3.3 (calidad, 1K RPD)
  UNLIMITED,                                       // Sin límite diario
];
const AGENT_B_CHAIN = [
  'qwen/qwen3-32b',                               // Alibaba Qwen 3 (familia diferente, 1K RPD)
  'openai/gpt-oss-20b',                            // OpenAI OSS (otra familia, 1K RPD)
  UNLIMITED,                                       // Sin límite diario
];
const ARBITER_CHAIN = [
  'openai/gpt-oss-120b',                           // OpenAI OSS 120B (el más grande, 1K RPD)
  'llama-3.3-70b-versatile',                        // Llama 3.3 70B (segundo mejor)
  UNLIMITED,                                       // Sin límite diario
];

const SYSTEM_AGENT = (agentId) => `Eres el Agente Clasificador ${agentId}, experto en el Arancel de Aduanas del Perú.
Tu tarea: clasificar un producto en su subpartida nacional de 10 dígitos.

REGLAS ESTRICTAS:
1. Usa las 6 Reglas Generales Interpretativas (RGI) del Sistema Armonizado
2. Prioriza: Regla 1 (texto de partida) > Regla 3 (carácter esencial) > Regla 6 (subpartida)
3. Responde SOLO en formato JSON:
{
  "hs": "XXXX.XX.XX.XX",
  "confianza": 0-100,
  "advalorem": 0|6|11,
  "razonamiento": "Regla X aplicada porque...",
  "alternativas": ["YYYY.YY.YY.YY"]
}
4. Si no estás seguro (confianza <70), incluye 2-3 alternativas
5. Arancel base: D.S. 342-2016-EF modificado por D.S. 401-2021-EF (vigente 2022)
6. Solo 3 tasas Ad Valorem existen: 0%, 6%, 11%`;

const SYSTEM_ARBITER = `Eres el Árbitro de Clasificación Arancelaria. Dos agentes clasificadores han dado su opinión sobre un producto.
Tu trabajo:
1. Analizar ambas clasificaciones
2. Determinar cuál es correcta o proponer una tercera si ambos están mal
3. Explicar por qué, citando RGI específicas
4. Dar la clasificación final con nivel de confianza

Responde SOLO en JSON:
{
  "hs_final": "XXXX.XX.XX.XX",
  "confianza": 0-100,
  "advalorem": 0|6|11,
  "ganador": "agente1"|"agente2"|"arbitro",
  "razonamiento": "...",
  "discrepancia": "resumen de por qué los agentes difirieron",
  "advertencia": "..." o null
}`;

async function clasificarMultiAgente(descripcion, imagenBase64) {
  const startTime = Date.now();
  const resultado = {
    metodo: 'multi-agente',
    agentes: [],
    consenso: null,
    arbitraje: null,
    tiempoMs: 0,
  };

  const userMsg = imagenBase64
    ? [{ type: 'image_url', image_url: { url: imagenBase64 } }, { type: 'text', text: `Clasifica este producto: ${descripcion || 'ver imagen'}` }]
    : `Clasifica este producto para importación al Perú: ${descripcion}`;

  // PASO 1: Dos agentes clasifican con MODELOS DIFERENTES (evita echo)
  const [resp1, resp2] = await Promise.allSettled([
    callAgentWithFallback('A', userMsg, AGENT_A_CHAIN),
    callAgentWithFallback('B', userMsg, AGENT_B_CHAIN),
  ]);

  const agent1 = parseAgentResponse(resp1);
  const agent2 = parseAgentResponse(resp2);
  resultado.agentes = [agent1, agent2];

  // PASO 2: Comparar resultados
  const hs1 = normalizeHS(agent1?.hs);
  const hs2 = normalizeHS(agent2?.hs);

  if (hs1 && hs2 && hs1 === hs2) {
    // CONSENSO: ambos agentes coinciden
    const avgConf = ((agent1.confianza || 80) + (agent2.confianza || 80)) / 2;
    resultado.consenso = {
      hs: agent1.hs,
      confianza: Math.min(99, avgConf + 10), // Boost confidence when both agree
      advalorem: agent1.advalorem,
      razonamiento: agent1.razonamiento,
      metodo: 'consenso_directo',
    };
  } else if (hs1 && hs2 && hs1.substring(0, 6) === hs2.substring(0, 6)) {
    // PARCIAL: mismo capítulo/partida, difieren en subpartida
    // Usar el de mayor confianza, pero advertir
    const best = (agent1.confianza || 0) >= (agent2.confianza || 0) ? agent1 : agent2;
    resultado.consenso = {
      hs: best.hs,
      confianza: Math.min(85, (best.confianza || 70)),
      advalorem: best.advalorem,
      razonamiento: best.razonamiento,
      metodo: 'mejor_confianza',
      advertencia: `Agentes coinciden en partida ${hs1.substring(0, 4)} pero difieren en subpartida. Verificar manualmente.`,
    };
  } else {
    // DESACUERDO: enviar a árbitro
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

  // PASO 3: Validar contra NANDINA local
  if (resultado.consenso?.hs) {
    try {
      const nandinaService = require('./nandina');
      const data = nandinaService.getData();
      const clean = resultado.consenso.hs.replace(/\./g, '').padEnd(10, '0');
      const match = data.find(h => h.p === clean);
      if (match) {
        resultado.consenso.validadoNandina = true;
        resultado.consenso.descripcionOficial = match.d;
        resultado.consenso.advalorem = match.a; // Use official rate
      } else {
        // Try 8-digit match
        const match8 = data.find(h => h.p.startsWith(clean.substring(0, 8)));
        if (match8) {
          resultado.consenso.validadoNandina = true;
          resultado.consenso.hsCorregido = match8.p;
          resultado.consenso.descripcionOficial = match8.d;
          resultado.consenso.advalorem = match8.a;
          resultado.consenso.advertencia = (resultado.consenso.advertencia || '') + ` HS ajustado de ${resultado.consenso.hs} a ${match8.p} según NANDINA oficial.`;
        } else {
          resultado.consenso.validadoNandina = false;
          resultado.consenso.advertencia = (resultado.consenso.advertencia || '') + ' ⚠ HS no encontrado en base NANDINA. Verificar manualmente.';
          resultado.consenso.confianza = Math.max(40, (resultado.consenso.confianza || 70) - 20);
        }
      }
    } catch (e) { /* nandina validation fallback */ }
  }

  resultado.tiempoMs = Date.now() - startTime;
  return resultado;
}

// Call agent with automatic fallback if model returns 429
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

      // Validar que la respuesta sea JSON parseable y válido
      const parsed = parseJSON(result.text);
      if (parsed?.hs && parsed.hs !== 'error') {
        return result.text;
      }

    } catch (e) {
      const is429 = e.message?.includes('429') || e.message?.includes('rate') || e.message?.includes('limit');
      if (is429 && model !== modelChain[modelChain.length - 1]) {
        console.log(`[CLASIFICADOR] ${model} rate limited, trying next...`);
        continue;
      }
      // Last model in chain or non-rate-limit error
    }
  }

  // Fallback último: clasificación por palabras clave
  console.log('[CLASIFICADOR] Todos los modelos fallaron, usando fallback por keywords');
  return JSON.stringify(clasificarPorKeywords(extraerTextoFallback(userMsg)));
}

// Fallback de clasificación por palabras clave (cuando IA falla)
function clasificarPorKeywords(texto) {
  const text = (texto || '').toLowerCase();

  // Mapeo básico de keywords → capítulos HS
  const keywords = [
    { words: ['camiseta', 'polo', 'playera', 'remera'], hs: '6109.10.00.10', cap: 'Textil - Prendas de vestir' },
    { words: ['pantalón', 'pantalon', 'jeans', 'trousers'], hs: '6203.42.00.00', cap: 'Textil - Pantalones' },
    { words: ['zapato', 'shoe', 'footwear'], hs: '6403.99.90.00', cap: 'Calzado' },
    { words: ['laptop', 'notebook', 'computadora', 'ordenador'], hs: '8471.30.00.00', cap: 'Computadoras' },
    { words: ['celular', 'móvil', 'smartphone', 'teléfono'], hs: '8517.12.00.00', cap: 'Telefonía' },
    { words: ['audífono', 'headphone', 'auricular'], hs: '8518.30.00.00', cap: 'Audio' },
    { words: ['reloj', 'watch'], hs: '9102.19.00.00', cap: 'Relojería' },
    { words: ['bolsa', 'bag', 'maleta'], hs: '4202.92.00.00', cap: 'Marroquinería' },
    { words: ['máquina', 'máquina', 'equipment', 'equipo'], hs: '8479.89.90.00', cap: 'Maquinaria' },
    { words: ['plástico', 'plastic'], hs: '3926.90.90.90', cap: 'Plásticos' },
    { words: ['acero', 'steel', 'metal'], hs: '7326.90.99.00', cap: 'Metales' },
  ];

  for (const kw of keywords) {
    if (kw.words.some(w => text.includes(w))) {
      return {
        hs: kw.hs,
        confianza: 30, // Baja confianza - requiere validación humana
        advalorem: 6, // Tasa genérica
        razonamiento: `Clasificación por keyword: "${kw.words.find(w => text.includes(w))}" → Capítulo ${kw.cap}`,
        metodo: 'keyword_fallback',
        advertencia: '⚠ Clasificación automática por palabras clave. VERIFICAR MANUALMENTE con un especialista.'
      };
    }
  }

  // Sin match → HS genérico
  return {
    hs: '0000.00.00.00',
    confianza: 0,
    advalorem: 0,
    razonamiento: 'No se pudo determinar clasificación por keywords',
    metodo: 'fallback',
    advertencia: '⚠ No se pudo clasificar automáticamente. REQUERIR clasificación manual por experto.'
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

  for (const model of ARBITER_CHAIN) {
    try {
      const messages = [
        { role: 'system', content: SYSTEM_ARBITER },
        {
          role: 'user', content: `Producto: "${descripcion}"

Agente A clasificó: ${JSON.stringify(agent1)}
Agente B clasificó: ${JSON.stringify(agent2)}

Son modelos de FAMILIAS DIFERENTES, así que las discrepancias son reales.
Determina la clasificación correcta.` },
      ];
      const result = await aiProxy.call(messages, 'groq', model);
      return parseJSON(result.text);
    } catch (e) {
      const is429 = e.message?.includes('429') || e.message?.includes('rate');
      if (is429 && model !== ARBITER_CHAIN[ARBITER_CHAIN.length - 1]) continue;
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
  if (settled.status !== 'fulfilled') return { error: 'Agent failed' };
  return parseJSON(settled.value) || { raw: settled.value, error: 'Could not parse' };
}

function parseJSON(text) {
  if (!text) return null;
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    // Find JSON object in text
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(clean.substring(start, end + 1));
    return JSON.parse(clean);
  } catch { return null; }
}

module.exports = { clasificarMultiAgente };
