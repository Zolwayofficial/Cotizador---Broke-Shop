// server/agente-conversador.js — Agente 0: El que interactúa con el usuario
//
// FUNCIÓN:
//   - Saber QUÉ preguntar
//   - Saber en QUÉ ORDEN preguntar
//   - Saber QUÉ recomendar según respuestas
//   - Guiar al usuario paso a paso sin abrumar
//
// ARQUITECTURA:
//   Usuario → Agente Conversador → Orquestador → 16 agentes especializados → Resultado
//
// El conversador es el "traductor" entre el lenguaje natural del usuario y los 16 agentes.

const aiProxy = require('./ai-proxy');
const flow = require('./agente-conversador-flow');

// ═══════════════════════════════════════════════════════════════
// SISTEMA EXPERTO: Árbol de decisiones
// ═══════════════════════════════════════════════════════════════

const QUESTIONS_TREE = {
  // Nivel 1: Información básica (SIEMPRE se necesita)
  nivel1: [
    {
      key: 'productos',
      pregunta: '¿Qué productos quieres importar?',
      tipo: 'lista',
      required: true,
      hint: 'Ej: 500 camisetas de algodón, 100 laptops, etc.'
    },
    {
      key: 'pais_origen',
      pregunta: '¿Desde qué país importarás?',
      tipo: 'texto',
      required: true,
      hint: 'Ej: China, USA, Brasil, etc.'
    },
    {
      key: 'canal',
      pregunta: '¿Qué canal de importación usarás?',
      tipo: 'opciones',
      opciones: ['DEFINITIVA', 'COURIER', 'POSTAL'],
      default: 'DEFINITIVA',
      required: true
    }
  ],

  // Nivel 2: Información de precios (necesaria para calcular)
  nivel2: [
    {
      key: 'precio_unitario',
      pregunta: '¿Precio unitario en USD?',
      tipo: 'numero',
      required: true,
      hint: 'Ej: 3.50'
    },
    {
      key: 'incoterm',
      pregunta: '¿Incoterm de la cotización?',
      tipo: 'opciones',
      opciones: ['FOB', 'CIF', 'CFR', 'EXW', 'FCA', 'CIP', 'DAP', 'DDP'],
      default: 'FOB',
      required: true
    },
    {
      key: 'flete',
      pregunta: '¿Costo de flete (si lo conoces)?',
      tipo: 'numero',
      required: false,
      hint: 'Déjalo en blanco si no lo sabes — lo estimaremos'
    },
    {
      key: 'seguro',
      pregunta: '¿Costo de seguro (si lo conoces)?',
      tipo: 'numero',
      required: false,
      hint: 'Déjalo en blanco — usaremos 1.5% del FOB'
    }
  ],

  // Nivel 3: Información del importador (para percepciones)
  nivel3: [
    {
      key: 'tipo_importador',
      pregunta: '¿Qué tipo de importador eres?',
      tipo: 'opciones',
      opciones: [
        { value: 'general', label: 'General (3.5% percepción)' },
        { value: 'buen_contribuyente', label: 'Buen Contribuyente (3.5%)' },
        { value: 'nuevo', label: 'Nuevo Importador (10%)' }
      ],
      default: 'general',
      required: true
    },
    {
      key: 'margen_venta',
      pregunta: '¿Qué margen de utilidad buscas (%)?',
      tipo: 'numero',
      default: 30,
      required: false,
      hint: 'Ej: 30 para 30% de utilidad'
    }
  ],

  // Nivel 4: Información opcional avanzada
  nivel4: [
    {
      key: 'peso_total',
      pregunta: '¿Peso total de la mercancía (kg)?',
      tipo: 'numero',
      required: false,
      hint: 'Opcional — ayuda a estimar flete más preciso'
    },
    {
      key: 'tipo_cambio',
      pregunta: '¿Tipo de cambio a usar (opcional)?',
      tipo: 'numero',
      required: false,
      hint: 'Déjalo en blanco — usaremos el TC SUNAT actual'
    }
  ]
};

const FLOW_CHANNEL_OPTIONS = [
  { value: 'MARITIMO', label: '🚢 Maritimo (importacion formal)' },
  { value: 'AEREO', label: '✈️ Aereo (importacion formal)' },
  { value: 'COURIER', label: '📦 Courier express (DHL, FedEx, UPS u otro)' },
  { value: 'POSTAL', label: '📮 Postal (Serpost / correo postal)' }
];

const FLOW_INCOTERM_OPTIONS = [
  { value: 'FOB', label: 'FOB (Free on Board) - El mas comun' },
  { value: 'CIF', label: 'CIF (Cost, Insurance & Freight)' },
  { value: 'CFR', label: 'CFR (Cost and Freight)' },
  { value: 'EXW', label: 'EXW (Ex Works) - En fabrica' },
  { value: 'FCA', label: 'FCA (Free Carrier)' },
  { value: 'CIP', label: 'CIP (Carriage and Insurance Paid To)' },
  { value: 'DAP', label: 'DAP (Delivered at Place)' },
  { value: 'DDP', label: 'DDP (Delivered Duty Paid)' }
];

const FLOW_SUBJECT_OPTIONS = [
  { value: 'empresa', label: 'Empresa / persona juridica' },
  { value: 'persona_natural', label: 'Persona natural' }
];

const FLOW_IMPORTER_OPTIONS = {
  empresa: [
    { value: 'general', label: 'Empresa importadora recurrente' },
    { value: 'nuevo', label: 'Empresa nueva importando' },
    { value: 'buen_contribuyente', label: 'Buen Contribuyente SUNAT' }
  ],
  persona_natural: [
    { value: 'nuevo', label: 'Persona natural - primera importacion' },
    { value: 'general', label: 'Persona natural - ya he importado antes' }
  ]
};

const OPTIONAL_ESTIMATE_OPTIONS = [
  { value: 'ESTIMAR', label: 'Estimar automaticamente' },
  { value: 'OMITIR', label: 'No lo tengo' }
];

const FLOW_MARGIN_OPTIONS = [
  { value: '20', label: '20% - conservador' },
  { value: '30', label: '30% - recomendado' },
  { value: '50', label: '50% - agresivo' },
  { value: 'OMITIR', label: 'Usar 30% por defecto' }
];

// ═══════════════════════════════════════════════════════════════
// DETECTOR DE INTENCIÓN
// ═══════════════════════════════════════════════════════════════

function detectarIntencion(mensaje) {
  const msg = mensaje.toLowerCase();
  
  // Si el usuario ya dio información estructurada
  if (mensaje.includes('{') && mensaje.includes('}')) {
    return { tipo: 'datos_estructurados', confianza: 90 };
  }
  
  // Si el usuario pregunta algo específico
  if (msg.includes('cuánto') || msg.includes('precio') || msg.includes('costo') || msg.includes('vale')) {
    return { tipo: 'consulta_costo', confianza: 85 };
  }
  
  if (msg.includes('permiso') || msg.includes('requisito') || msg.includes('documento')) {
    return { tipo: 'consulta_permisos', confianza: 85 };
  }
  
  if (msg.includes('tiempo') || msg.includes('día') || msg.includes('demora')) {
    return { tipo: 'consulta_tiempo', confianza: 80 };
  }
  
  if (msg.includes('clasific') || msg.includes('partida') || msg.includes('arancel')) {
    return { tipo: 'consulta_clasificacion', confianza: 85 };
  }
  
  // Si el usuario está respondiendo una pregunta
  if (msg.match(/\d+/) || msg.match(/[a-z]{3,}/i)) {
    return { tipo: 'respuesta', confianza: 70 };
  }
  
  // Default: el usuario quiere iniciar una cotización
  return { tipo: 'iniciar_cotizacion', confianza: 60 };
}

// ═══════════════════════════════════════════════════════════════
// EXTRACTOR DE DATOS DE LENGUAJE NATURAL
// ═══════════════════════════════════════════════════════════════

function normalizarTexto(valor) {
  return String(valor || '').trim();
}

function extraerNumero(texto) {
  const limpio = normalizarTexto(texto)
    .replace(/usd|dolares|dólares|s\/|soles|pen/gi, ' ')
    .replace(/,/g, '.');
  const match = limpio.match(/-?\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

function extraerProductosDesdeTexto(texto) {
  const limpio = normalizarTexto(texto);
  if (!limpio) return [];

  const segmentos = limpio
    .split(/,| y /i)
    .map((segmento) => segmento.trim())
    .filter(Boolean);

  return segmentos.map((segmento) => {
    const match = segmento.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
    const cantidad = match ? Math.max(1, parseInt(match[1], 10)) : 1;
    const descripcion = match ? match[2].trim() : segmento;
    const producto = descripcion
      .replace(/\b(de|del|la|el|los|las)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      cantidad,
      producto: producto || descripcion,
      descripcion,
    };
  });
}

function normalizarPais(valor, allowFreeText = false) {
  const texto = normalizarTexto(valor).toLowerCase();
  if (!texto) return null;

  const equivalencias = {
    china: 'CN',
    'estados unidos': 'US',
    usa: 'US',
    eeuu: 'US',
    brasil: 'BR',
    brasilia: 'BR',
    mexico: 'MX',
    'méxico': 'MX',
    espana: 'ES',
    'españa': 'ES',
    alemania: 'DE',
    japon: 'JP',
    'japón': 'JP',
    corea: 'KR',
    thailandia: 'TH',
    tailandia: 'TH',
    peru: 'PE',
    'perú': 'PE',
    chile: 'CL',
    colombia: 'CO',
    argentina: 'AR',
    italia: 'IT',
  };

  const entry = Object.entries(equivalencias).find(([alias]) => texto.includes(alias));
  if (entry) return entry[1];

  const upper = normalizarTexto(valor).toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) {
    return upper;
  }

  if (allowFreeText && /^[A-ZÁÉÍÓÚÜÑ ]{3,30}$/.test(upper) && upper.split(/\s+/).length <= 3) {
    return upper;
  }

  return null;
}

function normalizarCanal(valor) {
  const texto = normalizarTexto(valor).toLowerCase();
  if (!texto) return null;

  if (
    texto.includes('courier')
    || texto.includes('dhl')
    || texto.includes('fedex')
    || texto.includes('ups')
    || texto.includes('tnt')
    || texto.includes('usps')
    || texto.includes('aramex')
    || texto.includes('skypostal')
    || texto.includes('boxberry')
    || texto.includes('express')
  ) {
    return 'COURIER';
  }

  if (texto.includes('postal') || texto.includes('serpost')) {
    return 'POSTAL';
  }

  if (
    texto.includes('definitiva')
    || texto.includes('marit')
    || texto.includes('mar ')
    || texto.includes('aere')
    || texto.includes('aé')
    || texto.includes('formal')
    || texto.includes('barco')
    || texto.includes('avion')
    || texto.includes('avión')
  ) {
    return 'DEFINITIVA';
  }

  return null;
}

function normalizarIncoterm(valor) {
  const texto = normalizarTexto(valor).toUpperCase();
  const incoterms = ['FOB', 'CIF', 'CFR', 'EXW', 'FCA', 'CIP', 'DAP', 'DDP'];
  return incoterms.find((incoterm) => texto.includes(incoterm)) || null;
}

function normalizarTipoImportador(valor) {
  const texto = normalizarTexto(valor).toLowerCase();
  if (!texto) return null;

  if (texto.includes('buen')) return 'buen_contribuyente';
  if (texto.includes('nuevo') || texto.includes('primera')) return 'nuevo';
  if (texto.includes('general')) return 'general';

  return null;
}

function esRespuestaOmitida(valor) {
  const texto = normalizarTexto(valor).toLowerCase();
  return [
    'no se',
    'no sé',
    'estim',
    'automatic',
    'automát',
    'omitir',
    'luego',
    'ninguno',
    'ninguna',
    'no tengo',
    'desconozco',
    'dejalo',
    'déjalo',
    'en blanco',
  ].some((fragmento) => texto.includes(fragmento));
}

function esConfirmacionPositiva(valor) {
  const texto = normalizarTexto(valor).toLowerCase();
  return ['si', 'sí', 'dale', 'ok', 'claro', 'confirmo', 'calcular', 'continuar'].includes(texto);
}

function interpretarRespuestaPorPaso(mensaje, pasoActual) {
  const texto = normalizarTexto(mensaje);
  if (!texto || !pasoActual) return {};

  switch (pasoActual) {
  case 'productos':
    return { productos: extraerProductosDesdeTexto(texto) };
  case 'pais_origen': {
    const pais = normalizarPais(texto, true);
    return pais ? { pais_origen: pais } : {};
  }
  case 'canal': {
    const canal = normalizarCanal(texto);
    return canal ? { canal } : {};
  }
  case 'precio_unitario': {
    const precio = extraerNumero(texto);
    return precio !== null ? { precio_unitario: precio } : {};
  }
  case 'incoterm': {
    const incoterm = normalizarIncoterm(texto);
    return incoterm ? { incoterm } : {};
  }
  case 'flete': {
    if (esRespuestaOmitida(texto)) return { flete: 0 };
    const fleteManual = extraerNumero(texto);
    return fleteManual !== null ? { flete: fleteManual } : {};
  }
  case 'seguro': {
    if (esRespuestaOmitida(texto)) return { seguro: 0 };
    const seguroManual = extraerNumero(texto);
    return seguroManual !== null ? { seguro: seguroManual } : {};
  }
  case 'tipo_importador': {
    const tipoImportador = normalizarTipoImportador(texto);
    return tipoImportador ? { tipo_importador: tipoImportador } : {};
  }
  case 'margen_venta': {
    const margenVenta = extraerNumero(texto);
    return margenVenta !== null ? { margen_venta: margenVenta } : {};
  }
  case 'peso_total': {
    const pesoTotal = extraerNumero(texto);
    return pesoTotal !== null ? { peso_total: pesoTotal } : {};
  }
  case 'tipo_cambio': {
    const tipoCambio = extraerNumero(texto);
    return tipoCambio !== null ? { tipo_cambio: tipoCambio } : {};
  }
  default:
    return {};
  }
}

function extraerDeLenguajeNatural(mensaje) {
  const datos = {};
  const msg = normalizarTexto(mensaje);
  const productos = extraerProductosDesdeTexto(msg);
  const paisOrigen = normalizarPais(msg);
  const canal = normalizarCanal(msg);
  const incoterm = normalizarIncoterm(msg);

  if (productos.length > 0) {
    datos.productos = productos;
  }

  if (paisOrigen) {
    datos.pais_origen = paisOrigen;
  }

  if (canal) {
    datos.canal = canal;
  }

  if (incoterm) {
    datos.incoterm = incoterm;
  }

  if (/(precio|unitario|usd|dolar|dólar|\$|cuesta|vale)/i.test(msg)) {
    const precio = extraerNumero(msg);
    if (precio !== null) {
      datos.precio_unitario = precio;
    }
  }

  return datos;
}

// ═══════════════════════════════════════════════════════════════
// GENERADOR DE PREGUNTAS CONTEXTUALES
// ═══════════════════════════════════════════════════════════════

function generarPregunta(contexto) {
  const { datos_previos } = contexto;
  
  if (!datos_previos.productos) {
    return {
      pregunta: '¡Hola! 👋 Soy tu asistente de importaciones. ¿Qué productos quieres importar?',
      paso: 'productos',
      tipo: 'lista',
      hint: 'Ej: 500 camisetas de algodón, 100 laptops, etc.'
    };
  }
  
  if (!datos_previos.pais_origen) {
    return {
      pregunta: `Perfecto, ${datos_previos.productos.length} producto(s). ¿Desde qué país importarás?`,
      paso: 'pais_origen',
      tipo: 'texto',
      hint: 'Ej: China, USA, Brasil, etc.'
    };
  }
  
  if (!datos_previos.canal) {
    return {
      pregunta: `¿Importarás desde ${datos_previos.pais_origen} por mar, aire, courier o postal?`,
      opciones: [
        { value: 'DEFINITIVA', label: '🚢 Marítimo/Aéreo (importación formal)' },
        { value: 'COURIER', label: '📦 Courier express (DHL, FedEx, UPS u otro)' },
        { value: 'POSTAL', label: '📮 Postal (Serpost / correo postal)' }
      ],
      paso: 'canal',
      tipo: 'opciones'
    };
  }
  
  if (datos_previos.precio_unitario === undefined) {
    return {
      pregunta: '¿Cuál es el precio unitario en USD?',
      paso: 'precio_unitario',
      tipo: 'numero',
      hint: 'Ej: 3.50'
    };
  }
  
  if (!datos_previos.incoterm) {
    return {
      pregunta: '¿Qué Incoterm usó el proveedor?',
      opciones: [
        { value: 'FOB', label: 'FOB (Free on Board) — El más común' },
        { value: 'CIF', label: 'CIF (Cost, Insurance & Freight)' },
        { value: 'EXW', label: 'EXW (Ex Works) — En fábrica' },
        { value: 'OTRO', label: 'Otro (CFR, FCA, DAP, DDP)' }
      ],
      paso: 'incoterm',
      tipo: 'opciones'
    };
  }
  
  if (!datos_previos.tipo_importador) {
    return {
      pregunta: '¿Qué tipo de importador eres?',
      opciones: [
        { value: 'general', label: 'General — Ya he importado antes' },
        { value: 'nuevo', label: 'Nuevo — Es mi primera importación' },
        { value: 'buen_contribuyente', label: 'Buen Contribuyente SUNAT' }
      ],
      paso: 'tipo_importador',
      tipo: 'opciones'
    };
  }
  
  // Si ya tenemos todo, indicar que podemos calcular
  return {
    pregunta: '¡Perfecto! 🎉 Ya tengo toda la información. ¿Calculamos el costo total de importación?',
    paso: 'calcular',
    tipo: 'confirmacion'
  };
}

// ═══════════════════════════════════════════════════════════════
// RECOMENDADOR INTELIGENTE
// ═══════════════════════════════════════════════════════════════

function generarRecomendaciones(datos, resultado) {
  const recomendaciones = [];
  
  // Si hay TLC disponible
  if (resultado?.items?.some(i => i.tlc)) {
    const tlc = resultado.items.find(i => i.tlc);
    recomendaciones.push({
      tipo: 'tlc',
      nivel: 'alto',
      icono: '🤝',
      titulo: 'TLC Disponible',
      mensaje: `Tienes un tratado de libre comercio con ${datos.pais_origen}. Puedes ahorrar ${tlc.ahorroTLC}% de Ad Valorem.`,
      accion: 'Solicita Certificado de Origen a tu proveedor'
    });
  }
  
  // Si hay permisos requeridos
  if (resultado?.permisos?.length > 0) {
    recomendaciones.push({
      tipo: 'permisos',
      nivel: 'critico',
      icono: '⚠️',
      titulo: 'Permisos Requeridos',
      mensaje: `Necesitas ${resultado.permisos.length} permiso(s) antes de importar.`,
      accion: 'Tramita en VUCE antes del embarque'
    });
  }
  
  // Si el flete fue estimado (no real)
  if (resultado?.etapas?.flete?.estimado) {
    recomendaciones.push({
      tipo: 'flete',
      nivel: 'medio',
      icono: '🚢',
      titulo: 'Flete Estimado',
      mensaje: `El flete de $${resultado.totales?.flete} es referencial.`,
      accion: 'Solicita cotización formal a un freight forwarder'
    });
  }
  
  // Si hay riesgo de duda razonable
  if (resultado?.alertas?.some(a => a.tipo === 'duda_razonable')) {
    const alerta = resultado.alertas.find(a => a.tipo === 'duda_razonable');
    recomendaciones.push({
      tipo: 'duda_razonable',
      nivel: 'alto',
      icono: '⚖️',
      titulo: 'Riesgo SUNAT',
      mensaje: alerta.mensaje,
      accion: 'Prepara documentación que justifique el precio'
    });
  }
  
  // Si el margen es muy bajo o muy alto
  if (resultado?.totales?.margenVenta) {
    const margen = resultado.totales.margenVenta.margenPct;
    if (margen < 20) {
      recomendaciones.push({
        tipo: 'margen_bajo',
        nivel: 'medio',
        icono: '📉',
        titulo: 'Margen Bajo',
        mensaje: `Con ${margen}% de margen, tu utilidad es limitada.`,
        accion: 'Considera negociar mejor precio con el proveedor'
      });
    } else if (margen > 100) {
      recomendaciones.push({
        tipo: 'margen_alto',
        nivel: 'info',
        icono: '📈',
        titulo: 'Margen Alto',
        mensaje: `Con ${margen}% de margen, tu utilidad es excelente.`,
        accion: 'Verifica que el precio de venta sea competitivo en el mercado'
      });
    }
  }
  
  return recomendaciones;
}

// ═══════════════════════════════════════════════════════════════
// AGENTE CONVERSADOR PRINCIPAL
// ═══════════════════════════════════════════════════════════════

async function agenteConversador(mensaje, contexto = {}) {
  const startTime = Date.now();
  const contextoBase = {
    ...contexto,
    datos_previos: { ...(contexto.datos_previos || {}) },
    paso_actual: contexto.paso_actual || null,
  };

  // 1. Detectar intención del usuario
  let intencion = detectarIntencion(mensaje);
  if (contextoBase.paso_actual && contextoBase.paso_actual !== 'calcular') {
    intencion = { tipo: 'respuesta', confianza: 95 };
  }

  // 2. Extraer datos del lenguaje natural
  const datosPorPaso = flow.interpretarRespuestaPorPaso(mensaje, contextoBase.paso_actual);
  const datosExtraidos = {
    ...flow.extraerDeLenguajeNatural(mensaje, contextoBase.paso_actual),
    ...datosPorPaso,
  };

  // 3. Actualizar contexto con datos extraídos
  const contextoActualizado = {
    ...contextoBase,
    datos_previos: {
      ...contextoBase.datos_previos,
      ...datosExtraidos
    }
  };
  
  // 4. Generar respuesta según intención
  let respuesta;

  if (contextoBase.paso_actual === 'calcular' && esConfirmacionPositiva(mensaje)) {
    respuesta = {
      tipo: 'listo_para_calcular',
      mensaje: 'Perfecto. Ya puedes calcular la cotización con los datos capturados.',
      paso: 'calcular',
      contexto: {
        ...contextoActualizado,
        paso_actual: 'calcular'
      }
    };
  } else if (intencion.tipo === 'iniciar_cotizacion' || intencion.tipo === 'respuesta') {
    if (contextoBase.paso_actual && contextoBase.paso_actual !== 'calcular' && Object.keys(datosPorPaso).length === 0) {
      const preguntaActual = flow.generarPregunta(contextoActualizado);
      const guidance = preguntaActual?.tipo === 'opciones'
        ? 'No pude relacionar tu respuesta con las alternativas. Elige una de estas opciones:'
        : `No logré interpretar bien tu respuesta. ${preguntaActual?.pregunta || '¿Puedes intentarlo otra vez?'}`;

      respuesta = {
        tipo: 'pregunta',
        mensaje: guidance,
        paso: preguntaActual?.paso || contextoBase.paso_actual,
        opciones: preguntaActual?.opciones,
        hint: preguntaActual?.hint,
        contexto: {
          ...contextoActualizado,
          paso_actual: preguntaActual?.paso || contextoBase.paso_actual
        }
      };
    } else {
    // Generar siguiente pregunta
      const pregunta = flow.generarPregunta(contextoActualizado);

      respuesta = {
        tipo: 'pregunta',
        mensaje: pregunta.pregunta,
        paso: pregunta.paso,
        opciones: pregunta.opciones,
        hint: pregunta.hint,
        contexto: {
          ...contextoActualizado,
          paso_actual: pregunta.paso
        }
      };
    }
  } else if (intencion.tipo === 'datos_estructurados') {
    // Usuario envió JSON directo
    try {
      const datos = JSON.parse(mensaje.match(/\{[\s\S]*\}/)[0]);
      respuesta = {
        tipo: 'datos_recibidos',
        mensaje: '✅ Datos recibidos. Procesando...',
        datos: datos,
        contexto: { ...contextoActualizado, datos_previos: datos, paso_actual: 'calcular' }
      };
    } catch {
      respuesta = {
        tipo: 'error',
        mensaje: 'No entendí los datos. ¿Puedes reformular?',
        contexto: contextoActualizado
      };
    }
  } else if (intencion.tipo === 'consulta_costo' || intencion.tipo === 'consulta_permisos' || intencion.tipo === 'consulta_clasificacion') {
    // Consulta específica — usar IA para responder
    try {
      const systemPrompt = 'Eres un experto en comercio exterior peruano. Responde de forma clara y concisa.';
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: mensaje }
      ];
      
      const iaResponse = await aiProxy.classify(messages, 'groq');
      
      respuesta = {
        tipo: 'respuesta_ia',
        mensaje: iaResponse.text,
        contexto: contextoActualizado
      };
    } catch (e) {
      respuesta = {
        tipo: 'error',
        mensaje: 'Tuve un error. ¿Puedes reformular la pregunta?',
        error: e.message,
        contexto: contextoActualizado
      };
    }
  } else {
    // Default
    respuesta = {
      tipo: 'pregunta',
      mensaje: '¿Quieres importar algo? Cuéntame qué productos y desde dónde.',
      contexto: contextoActualizado
    };
  }
  
  // 5. Agregar metadata
  respuesta.tiempoMs = Date.now() - startTime;
  respuesta.intencionDetectada = intencion.tipo;
  
  return respuesta;
}

const CONVERSATIONAL_AGENT_REGISTRY = [
  { id: 'agente-0', nombre: 'Conversador', categoria: 'base' },
];

const LEGACY_FLOW_REFERENCE = {
  QUESTIONS_TREE,
  FLOW_CHANNEL_OPTIONS,
  FLOW_INCOTERM_OPTIONS,
  FLOW_SUBJECT_OPTIONS,
  FLOW_IMPORTER_OPTIONS,
  OPTIONAL_ESTIMATE_OPTIONS,
  FLOW_MARGIN_OPTIONS,
  interpretarRespuestaPorPaso,
  extraerDeLenguajeNatural,
  generarPregunta,
};

module.exports = {
  agenteConversador,
  generarPregunta: flow.generarPregunta,
  extraerDeLenguajeNatural: flow.extraerDeLenguajeNatural,
  interpretarRespuestaPorPaso: flow.interpretarRespuestaPorPaso,
  detectarIntencion,
  generarRecomendaciones,
  QUESTIONS_TREE: flow.QUESTIONS_TREE,
  CONVERSATIONAL_AGENT_REGISTRY,
  LEGACY_FLOW_REFERENCE
};
