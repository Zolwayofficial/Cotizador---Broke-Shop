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

const aiProxy = require("./ai-proxy");
const nandinaService = require("./nandina");
const autoRepair = require("./auto-repair"); // Auto-corrección

const permisos = require("./permisos");
const flete = require("./flete");

// ═══════════════════════════════════════════════════════════════
// SISTEMA EXPERTO: Árbol de decisiones
// ═══════════════════════════════════════════════════════════════

const QUESTIONS_TREE = {
  // Nivel 1: Información básica (SIEMPRE se necesita)
  nivel1: [
    {
      key: "productos",
      pregunta: "¿Qué productos quieres importar?",
      tipo: "lista",
      required: true,
      hint: "Ej: 500 camisetas de algodón, 100 laptops, etc."
    },
    {
      key: "pais_origen",
      pregunta: "¿Desde qué país importarás?",
      tipo: "texto",
      required: true,
      hint: "Ej: China, USA, Brasil, etc."
    },
    {
      key: "canal",
      pregunta: "¿Qué canal de importación usarás?",
      tipo: "opciones",
      opciones: ["DEFINITIVA", "COURIER", "POSTAL"],
      default: "DEFINITIVA",
      required: true
    }
  ],

  // Nivel 2: Información de precios (necesaria para calcular)
  nivel2: [
    {
      key: "precio_unitario",
      pregunta: "¿Precio unitario en USD?",
      tipo: "numero",
      required: true,
      hint: "Ej: 3.50"
    },
    {
      key: "incoterm",
      pregunta: "¿Incoterm de la cotización?",
      tipo: "opciones",
      opciones: ["FOB", "CIF", "CFR", "EXW", "FCA", "CIP", "DAP", "DDP"],
      default: "FOB",
      required: true
    },
    {
      key: "flete",
      pregunta: "¿Costo de flete (si lo conoces)?",
      tipo: "numero",
      required: false,
      hint: "Déjalo en blanco si no lo sabes — lo estimaremos"
    },
    {
      key: "seguro",
      pregunta: "¿Costo de seguro (si lo conoces)?",
      tipo: "numero",
      required: false,
      hint: "Déjalo en blanco — usaremos 1.5% del FOB"
    }
  ],

  // Nivel 3: Información del importador (para percepciones)
  nivel3: [
    {
      key: "tipo_importador",
      pregunta: "¿Qué tipo de importador eres?",
      tipo: "opciones",
      opciones: [
        { value: "general", label: "General (3.5% percepción)" },
        { value: "buen_contribuyente", label: "Buen Contribuyente (3.5%)" },
        { value: "nuevo", label: "Nuevo Importador (10%)" }
      ],
      default: "general",
      required: true
    },
    {
      key: "margen_venta",
      pregunta: "¿Qué margen de utilidad buscas (%)?",
      tipo: "numero",
      default: 30,
      required: false,
      hint: "Ej: 30 para 30% de utilidad"
    }
  ],

  // Nivel 4: Información opcional avanzada
  nivel4: [
    {
      key: "peso_total",
      pregunta: "¿Peso total de la mercancía (kg)?",
      tipo: "numero",
      required: false,
      hint: "Opcional — ayuda a estimar flete más preciso"
    },
    {
      key: "tipo_cambio",
      pregunta: "¿Tipo de cambio a usar (opcional)?",
      tipo: "numero",
      required: false,
      hint: "Déjalo en blanco — usaremos el TC SUNAT actual"
    }
  ]
};

// ═══════════════════════════════════════════════════════════════
// DETECTOR DE INTENCIÓN
// ═══════════════════════════════════════════════════════════════

function detectarIntencion(mensaje) {
  const msg = mensaje.toLowerCase();
  
  // Si el usuario ya dio información estructurada
  if (mensaje.includes("{") && mensaje.includes("}")) {
    return { tipo: "datos_estructurados", confianza: 90 };
  }
  
  // Si el usuario pregunta algo específico
  if (msg.includes("cuánto") || msg.includes("precio") || msg.includes("costo") || msg.includes("vale")) {
    return { tipo: "consulta_costo", confianza: 85 };
  }
  
  if (msg.includes("permiso") || msg.includes("requisito") || msg.includes("documento")) {
    return { tipo: "consulta_permisos", confianza: 85 };
  }
  
  if (msg.includes("tiempo") || msg.includes("día") || msg.includes("demora")) {
    return { tipo: "consulta_tiempo", confianza: 80 };
  }
  
  if (msg.includes("clasific") || msg.includes("partida") || msg.includes("arancel")) {
    return { tipo: "consulta_clasificacion", confianza: 85 };
  }
  
  // Si el usuario está respondiendo una pregunta
  if (msg.match(/\d+/) || msg.match(/[a-z]{3,}/i)) {
    return { tipo: "respuesta", confianza: 70 };
  }
  
  // Default: el usuario quiere iniciar una cotización
  return { tipo: "iniciar_cotizacion", confianza: 60 };
}

// ═══════════════════════════════════════════════════════════════
// EXTRACTOR DE DATOS DE LENGUAJE NATURAL
// ═══════════════════════════════════════════════════════════════

function extraerDeLenguajeNatural(mensaje) {
  const datos = {};
  const msg = mensaje.toLowerCase();
  
  // Extraer productos (patrones comunes)
  const matchProductos = msg.match(/(\d+)\s*(camisetas|polos|laptops|computadoras|zapatos|pantalones|bolsas|relojes)/gi);
  if (matchProductos) {
    datos.productos = matchProductos.map(p => {
      const [cantidad, producto] = p.trim().split(/\s+/);
      return { cantidad: parseInt(cantidad), producto };
    });
  }
  
  // Extraer país
  const paises = ["china", "usa", "estados unidos", "brasil", "méxico", "españa", "alemania", "japón", "corea", "tailandia"];
  for (const pais of paises) {
    if (msg.includes(pais)) {
      datos.pais_origen = pais === "usa" || pais === "estados unidos" ? "US" :
                          pais === "china" ? "CN" :
                          pais === "brasil" ? "BR" :
                          pais === "méxico" ? "MX" :
                          pais === "españa" ? "ES" :
                          pais === "alemania" ? "DE" :
                          pais === "japón" ? "JP" :
                          pais === "corea" ? "KR" :
                          pais === "tailandia" ? "TH" : pais.toUpperCase();
      break;
    }
  }
  
  // Extraer precios
  const matchPrecio = msg.match(/[\$]?\s*(\d+\.?\d*)\s*(usd|dólares|dolares)?/i);
  if (matchPrecio) {
    datos.precio_unitario = parseFloat(matchPrecio[1]);
  }
  
  // Extraer incoterm
  const incoterms = ["FOB", "CIF", "CFR", "EXW", "FCA", "CIP", "DAP", "DDP"];
  for (const incoterm of incoterms) {
    if (msg.toUpperCase().includes(incoterm)) {
      datos.incoterm = incoterm;
      break;
    }
  }
  
  // Extraer canal
  if (msg.includes("courier") || msg.includes("dhl") || msg.includes("fedex") || msg.includes("ups")) {
    datos.canal = "COURIER";
  } else if (msg.includes("postal") || msg.includes("serpost")) {
    datos.canal = "POSTAL";
  } else if (msg.includes("marítimo") || msg.includes("aéreo") || msg.includes("definitiva")) {
    datos.canal = "DEFINITIVA";
  }
  
  return datos;
}

// ═══════════════════════════════════════════════════════════════
// GENERADOR DE PREGUNTAS CONTEXTUALES
// ═══════════════════════════════════════════════════════════════

function generarPregunta(contexto) {
  const { paso_actual, datos_previos } = contexto;
  
  // Determinar qué información falta
  const informacionFaltante = [];
  
  if (!datos_previos.productos) {
    return {
      pregunta: "¡Hola! 👋 Soy tu asistente de importaciones. ¿Qué productos quieres importar?",
      paso: "productos",
      tipo: "lista",
      hint: "Ej: 500 camisetas de algodón, 100 laptops, etc."
    };
  }
  
  if (!datos_previos.pais_origen) {
    return {
      pregunta: `Perfecto, ${datos_previos.productos.length} producto(s). ¿Desde qué país importarás?`,
      paso: "pais_origen",
      tipo: "texto",
      hint: "Ej: China, USA, Brasil, etc."
    };
  }
  
  if (!datos_previos.canal) {
    return {
      pregunta: `¿Importarás desde ${datos_previos.pais_origen} por mar, aire o courier?`,
      opciones: [
        { value: "DEFINITIVA", label: "🚢 Marítimo/Aéreo (importación formal)" },
        { value: "COURIER", label: "📦 Courier (DHL, FedEx, UPS)" },
        { value: "POSTAL", label: "📮 Postal (Serpost)" }
      ],
      paso: "canal",
      tipo: "opciones"
    };
  }
  
  if (datos_previos.precio_unitario === undefined) {
    return {
      pregunta: "¿Cuál es el precio unitario en USD?",
      paso: "precio_unitario",
      tipo: "numero",
      hint: "Ej: 3.50"
    };
  }
  
  if (!datos_previos.incoterm) {
    return {
      pregunta: "¿Qué Incoterm usó el proveedor?",
      opciones: [
        { value: "FOB", label: "FOB (Free on Board) — El más común" },
        { value: "CIF", label: "CIF (Cost, Insurance & Freight)" },
        { value: "EXW", label: "EXW (Ex Works) — En fábrica" },
        { value: "OTRO", label: "Otro (CFR, FCA, DAP, DDP)" }
      ],
      paso: "incoterm",
      tipo: "opciones"
    };
  }
  
  if (!datos_previos.tipo_importador) {
    return {
      pregunta: "¿Qué tipo de importador eres?",
      opciones: [
        { value: "general", label: "General — Ya he importado antes" },
        { value: "nuevo", label: "Nuevo — Es mi primera importación" },
        { value: "buen_contribuyente", label: "Buen Contribuyente SUNAT" }
      ],
      paso: "tipo_importador",
      tipo: "opciones"
    };
  }
  
  // Si ya tenemos todo, indicar que podemos calcular
  return {
    pregunta: "¡Perfecto! 🎉 Ya tengo toda la información. ¿Calculamos el costo total de importación?",
    paso: "calcular",
    tipo: "confirmacion"
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
      tipo: "tlc",
      nivel: "alto",
      icono: "🤝",
      titulo: "TLC Disponible",
      mensaje: `Tienes un tratado de libre comercio con ${datos.pais_origen}. Puedes ahorrar ${tlc.ahorroTLC}% de Ad Valorem.`,
      accion: "Solicita Certificado de Origen a tu proveedor"
    });
  }
  
  // Si hay permisos requeridos
  if (resultado?.permisos?.length > 0) {
    recomendaciones.push({
      tipo: "permisos",
      nivel: "critico",
      icono: "⚠️",
      titulo: "Permisos Requeridos",
      mensaje: `Necesitas ${resultado.permisos.length} permiso(s) antes de importar.`,
      accion: "Tramita en VUCE antes del embarque"
    });
  }
  
  // Si el flete fue estimado (no real)
  if (resultado?.etapas?.flete?.estimado) {
    recomendaciones.push({
      tipo: "flete",
      nivel: "medio",
      icono: "🚢",
      titulo: "Flete Estimado",
      mensaje: `El flete de $${resultado.totales?.flete} es referencial.`,
      accion: "Solicita cotización formal a un freight forwarder"
    });
  }
  
  // Si hay riesgo de duda razonable
  if (resultado?.alertas?.some(a => a.tipo === "duda_razonable")) {
    const alerta = resultado.alertas.find(a => a.tipo === "duda_razonable");
    recomendaciones.push({
      tipo: "duda_razonable",
      nivel: "alto",
      icono: "⚖️",
      titulo: "Riesgo SUNAT",
      mensaje: alerta.mensaje,
      accion: "Prepara documentación que justifique el precio"
    });
  }
  
  // Si el margen es muy bajo o muy alto
  if (resultado?.totales?.margenVenta) {
    const margen = resultado.totales.margenVenta.margenPct;
    if (margen < 20) {
      recomendaciones.push({
        tipo: "margen_bajo",
        nivel: "medio",
        icono: "📉",
        titulo: "Margen Bajo",
        mensaje: `Con ${margen}% de margen, tu utilidad es limitada.`,
        accion: "Considera negociar mejor precio con el proveedor"
      });
    } else if (margen > 100) {
      recomendaciones.push({
        tipo: "margen_alto",
        nivel: "info",
        icono: "📈",
        titulo: "Margen Alto",
        mensaje: `Con ${margen}% de margen, tu utilidad es excelente.`,
        accion: "Verifica que el precio de venta sea competitivo en el mercado"
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
  
  // 1. Detectar intención del usuario
  const intencion = detectarIntencion(mensaje);
  
  // 2. Extraer datos del lenguaje natural
  const datosExtraidos = extraerDeLenguajeNatural(mensaje);
  
  // 3. Actualizar contexto con datos extraídos
  const contextoActualizado = {
    ...contexto,
    datos_previos: {
      ...(contexto.datos_previos || {}),
      ...datosExtraidos
    }
  };
  
  // 4. Generar respuesta según intención
  let respuesta;
  
  if (intencion.tipo === "iniciar_cotizacion" || intencion.tipo === "respuesta") {
    // Generar siguiente pregunta
    const pregunta = generarPregunta(contextoActualizado);
    
    respuesta = {
      tipo: "pregunta",
      mensaje: pregunta.pregunta,
      paso: pregunta.paso,
      opciones: pregunta.opciones,
      hint: pregunta.hint,
      contexto: contextoActualizado
    };
  } else if (intencion.tipo === "datos_estructurados") {
    // Usuario envió JSON directo
    try {
      const datos = JSON.parse(mensaje.match(/\{[\s\S]*\}/)[0]);
      respuesta = {
        tipo: "datos_recibidos",
        mensaje: "✅ Datos recibidos. Procesando...",
        datos: datos,
        contexto: { ...contextoActualizado, datos_previos: datos }
      };
    } catch {
      respuesta = {
        tipo: "error",
        mensaje: "No entendí los datos. ¿Puedes reformular?",
        contexto: contextoActualizado
      };
    }
  } else if (intencion.tipo === "consulta_costo" || intencion.tipo === "consulta_permisos" || intencion.tipo === "consulta_clasificacion") {
    // Consulta específica — usar IA para responder
    try {
      const systemPrompt = "Eres un experto en comercio exterior peruano. Responde de forma clara y concisa.";
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: mensaje }
      ];
      
      const iaResponse = await aiProxy.classify(messages, "groq");
      
      respuesta = {
        tipo: "respuesta_ia",
        mensaje: iaResponse.text,
        contexto: contextoActualizado
      };
    } catch (e) {
      respuesta = {
        tipo: "error",
        mensaje: "Tuve un error. ¿Puedes reformular la pregunta?",
        error: e.message,
        contexto: contextoActualizado
      };
    }
  } else {
    // Default
    respuesta = {
      tipo: "pregunta",
      mensaje: "¿Quieres importar algo? Cuéntame qué productos y desde dónde.",
      contexto: contextoActualizado
    };
  }
  
  // 5. Agregar metadata
  respuesta.tiempoMs = Date.now() - startTime;
  respuesta.intencionDetectada = intencion.tipo;
  
  return respuesta;
}

module.exports = {
  agenteConversador,
  generarPregunta,
  extraerDeLenguajeNatural,
  detectarIntencion,
  generarRecomendaciones,
  QUESTIONS_TREE
};
