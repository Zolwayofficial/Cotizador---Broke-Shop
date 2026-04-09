// server/agente-conversador.js - Agente 0: El que interactua con el usuario
//
// FUNCION:
//   - Saber QUE preguntar
//   - Saber en QUE ORDEN preguntar
//   - Saber QUE recomendar segun respuestas
//   - Guiar al usuario paso a paso sin abrumar
//
// ARQUITECTURA:
//   Usuario -> Agente Conversador -> Orquestador -> 16 agentes especializados -> Resultado
//
// El conversador es el "traductor" entre el lenguaje natural del usuario y los 16 agentes.

const aiProxy = require('./ai-proxy');
const flow = require('./agente-conversador-flow');

// -----------------------------------------------------------------
// SISTEMA EXPERTO: Arbol de decisiones
// -----------------------------------------------------------------

const QUESTIONS_TREE = {
  // Nivel 1: Informacion basica (SIEMPRE se necesita)
  nivel1: [
    {
      key: 'productos',
      pregunta: 'Que productos quieres importar?',
      tipo: 'lista',
      required: true,
      hint: 'Ej: 500 camisetas de algodon, 100 laptops, etc.'
    },
    {
      key: 'pais_origen',
      pregunta: 'Desde que pais importaras?',
      tipo: 'texto',
      required: true,
      hint: 'Ej: China, USA, Brasil, etc.'
    },
    {
      key: 'canal',
      pregunta: 'Que canal de importacion usaras?',
      tipo: 'opciones',
      opciones: ['DEFINITIVA', 'COURIER', 'POSTAL'],
      default: 'DEFINITIVA',
      required: true
    }
  ],

  // Nivel 2: Informacion de precios (necesaria para calcular)
  nivel2: [
    {
      key: 'precio_unitario',
      pregunta: 'Precio unitario en USD?',
      tipo: 'numero',
      required: true,
      hint: 'Ej: 3.50'
    },
    {
      key: 'incoterm',
      pregunta: 'Que incoterm usa el proveedor?',
      tipo: 'opciones',
      opciones: ['FOB', 'CIF', 'CFR', 'EXW', 'FCA', 'CIP', 'DAP', 'DDP'],
      default: 'FOB',
      required: true
    },
    {
      key: 'flete',
      pregunta: 'Costo de flete (si lo conoces)?',
      tipo: 'numero',
      required: false,
      hint: 'Dejalo en blanco si no lo sabes; lo estimaremos'
    },
    {
      key: 'seguro',
      pregunta: 'Costo de seguro (si lo conoces)?',
      tipo: 'numero',
      required: false,
      hint: 'Dejalo en blanco; usaremos 1.5% del FOB'
    }
  ],

  // Nivel 3: Informacion del importador (para percepciones)
  nivel3: [
    {
      key: 'tipo_importador',
      pregunta: 'Cual es tu perfil importador?',
      tipo: 'opciones',
      opciones: [
        { value: 'general', label: 'Empresa importadora recurrente' },
        { value: 'buen_contribuyente', label: 'Buen Contribuyente SUNAT' },
        { value: 'nuevo', label: 'Empresa nueva importando' }
      ],
      default: 'general',
      required: true
    },
    {
      key: 'margen_venta',
      pregunta: 'Que margen de utilidad buscas (%)?',
      tipo: 'numero',
      default: 30,
      required: false,
      hint: 'Ej: 30 para 30% de utilidad'
    }
  ],

  // Nivel 4: Informacion opcional avanzada
  nivel4: [
    {
      key: 'peso_total',
      pregunta: 'Peso total de la mercancia (kg)?',
      tipo: 'numero',
      required: false,
      hint: 'Opcional; ayuda a estimar flete mas preciso'
    },
    {
      key: 'tipo_cambio',
      pregunta: 'Tipo de cambio a usar (opcional)?',
      tipo: 'numero',
      required: false,
      hint: 'Dejalo en blanco; usaremos el TC SUNAT actual'
    }
  ]
};

const FLOW_CHANNEL_OPTIONS = [
  { value: 'MARITIMO', label: 'Maritimo (importacion formal)' },
  { value: 'AEREO', label: 'Aereo (importacion formal)' },
  { value: 'COURIER', label: 'Courier express (DHL, FedEx, UPS u otro)' },
  { value: 'POSTAL', label: 'Postal (Serpost / correo postal)' }
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

// -----------------------------------------------------------------
// DETECTOR DE INTENCION
// -----------------------------------------------------------------

function detectarIntencion(mensaje) {
  const msg = sanitizarComparacion(mensaje);
  
  // Si el usuario ya dio informacion estructurada
  if (mensaje.includes('{') && mensaje.includes('}')) {
    return { tipo: 'datos_estructurados', confianza: 90 };
  }
  
  // Si el usuario pregunta algo especifico
  if (msg.includes('cuanto') || msg.includes('precio') || msg.includes('costo') || msg.includes('vale')) {
    return { tipo: 'consulta_costo', confianza: 85 };
  }
  
  if (msg.includes('permiso') || msg.includes('requisito') || msg.includes('documento')) {
    return { tipo: 'consulta_permisos', confianza: 85 };
  }
  
  if (msg.includes('tiempo') || msg.includes('dia') || msg.includes('demora')) {
    return { tipo: 'consulta_tiempo', confianza: 80 };
  }
  
  if (msg.includes('clasific') || msg.includes('partida') || msg.includes('arancel')) {
    return { tipo: 'consulta_clasificacion', confianza: 85 };
  }
  
  // Si el usuario esta respondiendo una pregunta
  if (msg.match(/\d+/) || msg.match(/[a-z]{3,}/i)) {
    return { tipo: 'respuesta', confianza: 70 };
  }
  
  // Default: el usuario quiere iniciar una cotizacion
  return { tipo: 'iniciar_cotizacion', confianza: 60 };
}

// -----------------------------------------------------------------
// EXTRACTOR DE DATOS DE LENGUAJE NATURAL
// -----------------------------------------------------------------

function normalizarTexto(valor) {
  return String(valor || '').trim();
}

function extraerNumero(texto) {
  const limpio = normalizarTexto(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/usd|dolares|s\/|soles|pen/gi, ' ')
    .replace(/,/g, '.');
  const match = limpio.match(/-?\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

function sanitizarComparacion(valor) {
  return normalizarTexto(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%\s/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  const texto = sanitizarComparacion(valor);
  if (!texto) return null;

  const equivalencias = {
    china: 'CN',
    'estados unidos': 'US',
    usa: 'US',
    eeuu: 'US',
    brasil: 'BR',
    brasilia: 'BR',
    mexico: 'MX',
    espana: 'ES',
    alemania: 'DE',
    japon: 'JP',
    corea: 'KR',
    thailandia: 'TH',
    tailandia: 'TH',
    peru: 'PE',
    chile: 'CL',
    colombia: 'CO',
    argentina: 'AR',
    italia: 'IT',
  };

  const entry = Object.entries(equivalencias).find(([alias]) => texto.includes(alias));
  if (entry) return entry[1];

  const upper = sanitizarComparacion(valor).toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) {
    return upper;
  }

  if (allowFreeText && /^[A-Z ]{3,30}$/.test(upper) && upper.split(/\s+/).length <= 3) {
    return upper;
  }

  return null;
}

function normalizarCanal(valor) {
  const texto = sanitizarComparacion(valor);
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
    || texto.includes('formal')
    || texto.includes('barco')
    || texto.includes('avion')
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
  const texto = sanitizarComparacion(valor);
  return [
    'no se',
    'estim',
    'automatic',
    'omitir',
    'luego',
    'ninguno',
    'ninguna',
    'no tengo',
    'desconozco',
    'dejalo',
    'en blanco',
  ].some((fragmento) => texto.includes(fragmento));
}

function esRespuestaPositiva(valor) {
  const texto = sanitizarComparacion(valor);
  return ['si', 'dale', 'ok', 'claro', 'confirmo', 'calcular', 'continuar'].includes(texto);
}

function esRespuestaNegativa(valor) {
  const texto = sanitizarComparacion(valor);
  return ['no', 'cancelar', 'mantener', 'dejar asi', 'deja asi', 'no cambiar'].includes(texto);
}

const CORRECTION_REVIEW_OPTIONS = [
  { value: 'APLICAR_CORRECCION', label: 'Si, corrige' },
  { value: 'MANTENER_CORRECCION', label: 'No, mantenlo' }
];

const CORRECTION_FIELD_LABELS = {
  productos: 'productos',
  pais_origen: 'pais de origen',
  partida_arancelaria: 'codigo arancelario',
  tipo_sujeto: 'tipo de sujeto',
  canal: 'canal',
  objetivo_calculo: 'objetivo del calculo',
  precio_unitario: 'precio unitario',
  incoterm: 'incoterm',
  tipo_importador: 'perfil importador',
  bien_usado: 'condicion del producto',
  flete: 'flete',
  seguro: 'seguro',
  peso_total: 'peso total',
  tipo_cambio: 'tipo de cambio',
  margen_venta: 'margen'
};

const CORRECTION_FIELD_ALIASES = {
  productos: ['producto', 'productos', 'cantidad', 'unidades', 'quiero importar', 'quiero traer', 'quise decir'],
  pais_origen: ['pais', 'origen', 'desde'],
  partida_arancelaria: ['partida', 'arancelario', 'arancel', 'hs', 'subpartida', 'codigo arancelario'],
  tipo_sujeto: ['persona natural', 'empresa', 'ruc', 'juridica'],
  canal: ['canal', 'courier', 'postal', 'maritimo', 'aereo'],
  objetivo_calculo: ['objetivo', 'precio de venta', 'costo de importacion', 'cotizacion cliente'],
  precio_unitario: ['precio', 'precio unitario', 'unitario', 'usd', 'dolar'],
  incoterm: ['incoterm', 'fob', 'cif', 'cfr', 'exw', 'fca', 'cip', 'dap', 'ddp'],
  tipo_importador: ['importador', 'buen contribuyente', 'primera importacion'],
  bien_usado: ['usado', 'nuevo', 'segunda mano', 'reacondicionado'],
  flete: ['flete', 'envio', 'transporte internacional'],
  seguro: ['seguro', 'tabla'],
  peso_total: ['peso', 'kg', 'kilos'],
  tipo_cambio: ['tipo de cambio', 'tc', 'sunat', 'banco', 'cambista'],
  margen_venta: ['margen', 'utilidad', 'ganancia']
};

function tieneIndicadoresDePregunta(valor) {
  const texto = sanitizarComparacion(valor);
  if (!texto) return false;

  if (normalizarTexto(valor).includes('?')) {
    return true;
  }

  return [
    'que ',
    'que diferencia',
    'cual ',
    'como ',
    'por que',
    'para que',
    'conviene',
    'explica',
    'aclara',
    'significa',
    'es lo mismo',
    'me recomiendas',
    'cuando ',
    'porque ',
    'diferencia',
  ].some((fragmento) => texto.startsWith(fragmento) || texto.includes(` ${fragmento}`));
}

function coincideExactamenteConOpcion(valor, opcion) {
  const texto = sanitizarComparacion(valor);
  const label = sanitizarComparacion(opcion?.label || '');
  const optionValue = sanitizarComparacion(opcion?.value || '');
  return texto && (texto === label || texto === optionValue);
}

function esRespuestaDirectaPaso(mensaje, pasoActual, contexto = {}) {
  if (!pasoActual) return false;

  const preguntaActual = flow.generarPregunta(contexto);
  const texto = normalizarTexto(mensaje);
  const textoPlano = sanitizarComparacion(texto);

  if (!preguntaActual || !textoPlano) {
    return false;
  }

  if (preguntaActual.tipo === 'opciones' && Array.isArray(preguntaActual.opciones)) {
    return preguntaActual.opciones.some((opcion) => coincideExactamenteConOpcion(texto, opcion));
  }

  if (preguntaActual.tipo === 'numero') {
    if (esRespuestaOmitida(texto)) return true;
    return /^-?\d+(?:[.,]\d+)?(?:\s*(?:%|usd|kg|s\/|pen|soles|dolares|dolares))?$/.test(textoPlano);
  }

  if (pasoActual === 'productos') {
    return !tieneIndicadoresDePregunta(texto);
  }

  return !tieneIndicadoresDePregunta(texto);
}

function esAclaracionDurantePaso(mensaje, pasoActual, contexto = {}) {
  if (!pasoActual || pasoActual === 'calcular') {
    return false;
  }

  return tieneIndicadoresDePregunta(mensaje) && !esRespuestaDirectaPaso(mensaje, pasoActual, contexto);
}

function explicarPasoCanal(mensaje) {
  const texto = sanitizarComparacion(mensaje);

  if (texto.includes('courier') && texto.includes('aereo')) {
    return 'Courier express se usa para envios rapidos por operadores como DHL, FedEx o UPS, normalmente con paquetes mas pequenos y gestion simplificada. Aereo formal tambien viaja por avion, pero entra como importacion formal de carga, con mas control documental, DAM y operacion aduanera completa.';
  }

  if (texto.includes('courier') && texto.includes('marit')) {
    return 'Courier express prioriza rapidez y simplicidad para envios pequenos o medianos. Maritimo formal suele convenir cuando el volumen o peso es mayor y puedes tolerar mas tiempo de transito para bajar el costo logistico.';
  }

  if (texto.includes('postal')) {
    return 'Postal se refiere a correo postal o Serpost. Suele ser mas basico y lento, mientras que courier express usa operadores privados con mejor trazabilidad y tiempos mas cortos.';
  }

  return 'Puedes pensarlo asi: courier express para envios privados rapidos y mas simples; aereo formal para carga por avion con tramite formal; maritimo para volumen y mejor costo por carga; postal para correo postal tradicional.';
}

function explicarPasoObjetivo() {
  return 'Solo costo de importacion te deja el landed cost. Costo + precio de venta sugerido agrega una salida comercial orientativa. Cotizacion completa para cliente prepara una salida mas presentable para vender o reenviar.';
}

function explicarPasoTipoSujeto() {
  return 'Empresa y persona natural no se tratan igual en documentos, historial importador y algunas recomendaciones operativas. Si importas con RUC de negocio, marca empresa; si compras/importas a tu nombre, marca persona natural.';
}

function explicarPasoTipoImportador() {
  return 'Ese perfil ayuda a ajustar percepcion, riesgos y recomendaciones. Nuevo se usa para primeras operaciones; general para quien ya importa normalmente; buen contribuyente aplica cuando ya tienes ese perfil reconocido.';
}

function explicarPasoIncoterm(mensaje) {
  const texto = sanitizarComparacion(mensaje);

  if (texto.includes('fob')) {
    return 'FOB significa que el proveedor entrega la mercancia a bordo en origen y desde ahi tu asumes flete internacional, seguro y costos posteriores. Es uno de los incoterms mas usados para importar.';
  }

  if (texto.includes('cif')) {
    return 'CIF ya incluye costo, seguro y flete hasta el puerto de destino acordado, pero no significa que todos los gastos aduaneros o locales ya esten cubiertos.';
  }

  if (texto.includes('ddp')) {
    return 'DDP implica que el proveedor asume casi toda la entrega hasta destino con derechos pagados. Para Peru conviene revisarlo bien porque puede ocultar costos o responsabilidades que luego cambian en la practica.';
  }

  return 'El incoterm define hasta donde llega la responsabilidad del proveedor y desde donde empiezan tus costos. Si tienes la proforma o invoice, suele aparecer como FOB, CIF, CFR, EXW, FCA, CIP, DAP o DDP.';
}

function explicarPasoBienUsado() {
  return 'Te lo pregunto porque un producto usado puede cambiar percepcion, restricciones, documentos y nivel de revision. Si la mercancia ya tuvo uso, fue reacondicionada o es de segunda mano, debes marcarla como usada.';
}

function explicarPasoSeguro() {
  return 'Si ya tienes un seguro real, es mejor usarlo. Estimar sirve para no frenar la cotizacion. Seguro de tabla aplica cuando quieres una referencia mas normativa y no cuentas con una prima real del proveedor o del operador.';
}

function explicarPasoTipoCambio() {
  return 'Si tienes un tipo de cambio mejor por banco, cambista o tu operacion real, puedes escribirlo y el sistema lo respeta. Si no, usa la referencia automatica oficial disponible para no inventar el TC.';
}

function explicarPasoFlete() {
  return 'Si ya conoces el flete real, conviene ingresarlo porque mejora bastante la precision. Si todavia no lo tienes, el sistema puede estimarlo para que no se detenga la cotizacion.';
}

function explicarPasoMargen() {
  return 'El margen solo afecta la salida comercial, no los tributos base. Sirve para estimar precio sugerido o cotizacion al cliente segun la utilidad que buscas.';
}

function generarExplicacionContextualPaso(pasoActual, mensaje) {
  switch (pasoActual) {
  case 'canal':
    return explicarPasoCanal(mensaje);
  case 'objetivo_calculo':
    return explicarPasoObjetivo();
  case 'tipo_sujeto':
    return explicarPasoTipoSujeto();
  case 'tipo_importador':
    return explicarPasoTipoImportador();
  case 'incoterm':
    return explicarPasoIncoterm(mensaje);
  case 'bien_usado':
    return explicarPasoBienUsado();
  case 'seguro':
    return explicarPasoSeguro();
  case 'tipo_cambio':
    return explicarPasoTipoCambio();
  case 'flete':
    return explicarPasoFlete();
  case 'margen_venta':
    return explicarPasoMargen();
  default:
    return null;
  }
}

function normalizarDescripcionProductoCorregido(valor) {
  return normalizarTexto(valor)
    .replace(/\b(no|uno|una|unidad|unidades|solamente|solo)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extraerCorreccionProductos(mensaje) {
  const textoOriginal = normalizarTexto(mensaje);
  if (!textoOriginal) return null;

  let base = textoOriginal.split(',')[0].trim();
  base = base.replace(
    /^(quiero importar|quiero traer|quiero cotizar|importare|importaré|traere|traeré|seran|serán|son)\s+/i,
    ''
  );

  const matchCantidad = base.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
  if (!matchCantidad) {
    return null;
  }

  const cantidad = Math.max(1, parseInt(matchCantidad[1], 10));
  const descripcion = normalizarDescripcionProductoCorregido(matchCantidad[2]);
  if (!descripcion || descripcion.length < 2) {
    return null;
  }

  return [{
    cantidad,
    producto: descripcion,
    descripcion,
  }];
}

function tieneIndicadoresDeCorreccion(valor) {
  const texto = sanitizarComparacion(valor);
  if (!texto) return false;

  return [
    'corrige',
    'corregir',
    'cambia',
    'cambiar',
    'me equivoque',
    'quise decir',
    'en realidad',
    'mas bien',
    'mejor',
    'actualiza',
    'actualizar',
    'no era',
    'no es',
    'seria',
  ].some((fragmento) => texto.includes(fragmento));
}

function tieneAnclaCampo(field, mensaje) {
  const texto = sanitizarComparacion(mensaje);
  const aliases = CORRECTION_FIELD_ALIASES[field] || [];
  return aliases.some((fragmento) => texto.includes(sanitizarComparacion(fragmento)));
}

function esMensajePaisPuro(mensaje) {
  const textoOriginal = normalizarTexto(mensaje);
  const texto = sanitizarComparacion(textoOriginal);
  if (!texto) return false;

  if (/^[A-Z]{2}$/.test(textoOriginal)) {
    return true;
  }

  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]+$/.test(textoOriginal)) {
    return false;
  }

  if (texto.split(' ').length > 3) {
    return false;
  }

  return texto.length >= 3 && normalizarPais(textoOriginal) !== null;
}

function obtenerValorActualCampo(field, datosPrevios = {}) {
  switch (field) {
  case 'productos':
    return datosPrevios.productos || [];
  case 'seguro':
    return {
      seguro: datosPrevios.seguro,
      seguro_modo: datosPrevios.seguro_modo || (datosPrevios.seguro > 0 ? 'REAL' : undefined),
    };
  default:
    return datosPrevios[field];
  }
}

function formatearProductos(productos = []) {
  if (!Array.isArray(productos) || productos.length === 0) return 'sin productos';
  if (productos.length === 1) {
    const item = productos[0];
    return `${item.cantidad || 1} ${item.descripcion || item.producto || 'producto'}`;
  }
  return `${productos.length} productos distintos`;
}

function formatearValorCampo(field, value) {
  switch (field) {
  case 'productos':
    return formatearProductos(value);
  case 'pais_origen':
    return String(value || 'sin definir');
  case 'tipo_sujeto':
    return value === 'persona_natural' ? 'persona natural' : value === 'empresa' ? 'empresa' : String(value || 'sin definir');
  case 'canal': {
    const labels = {
      MARITIMO: 'maritimo formal',
      AEREO: 'aereo formal',
      COURIER: 'courier express',
      POSTAL: 'postal'
    };
    return labels[value] || String(value || 'sin definir');
  }
  case 'objetivo_calculo': {
    const labels = {
      costo_importacion: 'solo costo de importacion',
      precio_sugerido: 'costo + precio de venta sugerido',
      cotizacion_cliente: 'cotizacion completa para cliente'
    };
    return labels[value] || String(value || 'sin definir');
  }
  case 'precio_unitario':
  case 'flete':
  case 'seguro':
  case 'tipo_cambio':
    return value === undefined || value === null ? 'sin definir' : String(value);
  case 'incoterm':
    return String(value || 'sin definir');
  case 'tipo_importador': {
    const labels = {
      general: 'general',
      nuevo: 'nuevo',
      buen_contribuyente: 'buen contribuyente'
    };
    return labels[value] || String(value || 'sin definir');
  }
  case 'partida_arancelaria':
    return value ? String(value) : 'auto-detectar';
  case 'bien_usado':
    return value ? 'usado' : 'nuevo';
  case 'peso_total':
    return value === undefined || value === null ? 'sin definir' : `${value} kg`;
  case 'margen_venta':
    return value === undefined || value === null ? 'sin definir' : `${value}%`;
  default:
    if (value && typeof value === 'object' && 'seguro_modo' in value) {
      if (value.seguro_modo === 'TABLA') return 'seguro de tabla';
      if (value.seguro_modo === 'ESTIMADO') return 'seguro estimado';
      if (value.seguro !== undefined) return String(value.seguro);
    }
    return String(value || 'sin definir');
  }
}

function obtenerCambioCampo(field, mensaje) {
  if (field === 'productos') {
    const productos = extraerCorreccionProductos(mensaje);
    return productos ? { productos } : {};
  }

  return flow.interpretarRespuestaPorPaso(mensaje, field);
}

function obtenerValorPropuestoCampo(field, cambio = {}) {
  switch (field) {
  case 'productos':
    return cambio.productos || [];
  case 'seguro':
    return {
      seguro: cambio.seguro,
      seguro_modo: cambio.seguro_modo || (cambio.seguro > 0 ? 'REAL' : undefined),
    };
  default:
    return cambio[field];
  }
}

function sonValoresEquivalentes(field, actual, propuesto) {
  if (field === 'productos') {
    return JSON.stringify(actual || []) === JSON.stringify(propuesto || []);
  }

  if (field === 'seguro') {
    return JSON.stringify(actual || {}) === JSON.stringify(propuesto || {});
  }

  if (typeof actual === 'number' || typeof propuesto === 'number') {
    return Number(actual) === Number(propuesto);
  }

  return actual === propuesto;
}

function esCampoDeOpciones(field) {
  return [
    'tipo_sujeto',
    'canal',
    'objetivo_calculo',
    'incoterm',
    'tipo_importador',
    'bien_usado'
  ].includes(field);
}

function esCampoNumerico(field) {
  return [
    'precio_unitario',
    'flete',
    'seguro',
    'peso_total',
    'tipo_cambio',
    'margen_venta'
  ].includes(field);
}

function tieneSeñalSuficienteDeCorreccion(field, mensaje, correctionHint) {
  if (field === 'productos') {
    return correctionHint || /,/.test(mensaje) || /quiero importar|quise decir|no uno|no una/i.test(mensaje);
  }

  if (esCampoDeOpciones(field)) {
    return correctionHint || tieneAnclaCampo(field, mensaje);
  }

  if (field === 'pais_origen') {
    return tieneAnclaCampo(field, mensaje) || esMensajePaisPuro(mensaje);
  }

  if (esCampoNumerico(field)) {
    return correctionHint || tieneAnclaCampo(field, mensaje);
  }

  return correctionHint || tieneAnclaCampo(field, mensaje);
}

function detectarCorreccionPendiente(mensaje, contextoBase) {
  if (!contextoBase.paso_actual || contextoBase.paso_actual === 'productos' || contextoBase.paso_actual === 'revisar_correccion') {
    return null;
  }

  const correctionHint = tieneIndicadoresDeCorreccion(mensaje);
  const candidateFields = [
    'productos',
    'pais_origen',
    'tipo_sujeto',
    'canal',
    'objetivo_calculo',
    'precio_unitario',
    'incoterm',
    'tipo_importador',
    'bien_usado',
    'flete',
    'seguro',
    'peso_total',
    'tipo_cambio',
    'margen_venta',
  ];

  for (const field of candidateFields) {
    if (field === contextoBase.paso_actual) {
      continue;
    }

    const actual = obtenerValorActualCampo(field, contextoBase.datos_previos);
    const existeActual = field === 'productos'
      ? Array.isArray(actual) && actual.length > 0
      : actual !== undefined && actual !== null;

    if (!existeActual) {
      continue;
    }

    const cambio = obtenerCambioCampo(field, mensaje);
    if (!cambio || Object.keys(cambio).length === 0) {
      continue;
    }

    const propuesto = obtenerValorPropuestoCampo(field, cambio);
    if (propuesto === undefined || propuesto === null || (field === 'productos' && (!Array.isArray(propuesto) || propuesto.length === 0))) {
      continue;
    }

    if (!tieneSeñalSuficienteDeCorreccion(field, mensaje, correctionHint)) {
      continue;
    }

    if (sonValoresEquivalentes(field, actual, propuesto)) {
      continue;
    }

    return {
      field,
      label: CORRECTION_FIELD_LABELS[field] || field,
      from: actual,
      to: propuesto,
      changes: cambio,
      return_step: contextoBase.paso_actual,
    };
  }

  return null;
}

function limpiarDependenciasPorCorreccion(datosPrevios, field, changes = {}) {
  const actualizados = { ...datosPrevios };

  switch (field) {
  case 'tipo_sujeto':
    delete actualizados.tipo_importador;
    break;
  case 'canal':
    delete actualizados.flete;
    delete actualizados.seguro;
    delete actualizados.seguro_modo;
    delete actualizados.peso_total;
    break;
  case 'incoterm':
    delete actualizados.flete;
    delete actualizados.seguro;
    delete actualizados.seguro_modo;
    break;
  case 'objetivo_calculo':
    if (changes.objetivo_calculo === 'costo_importacion') {
      delete actualizados.margen_venta;
    }
    break;
  case 'productos':
    delete actualizados.partida_arancelaria;
    delete actualizados.partida_hs;
    delete actualizados.clasificacion_hs;
    delete actualizados.permisos;
    delete actualizados.restricciones;
    delete actualizados.consulta_oficial;
    delete actualizados.validacion_oficial;
    break;
  case 'pais_origen':
    delete actualizados.consulta_oficial;
    delete actualizados.validacion_oficial;
    delete actualizados.restricciones;
    delete actualizados.convenio_aplicable;
    break;
  default:
    break;
  }

  return actualizados;
}

function construirMensajeRevisionCorreccion(correccionPendiente) {
  return `Detecte que quieres corregir ${correccionPendiente.label} de "${formatearValorCampo(correccionPendiente.field, correccionPendiente.from)}" a "${formatearValorCampo(correccionPendiente.field, correccionPendiente.to)}". Quieres que lo actualice?`;
}

function crearRespuestaRevisionCorreccion(contextoBase, correccionPendiente) {
  return {
    tipo: 'pregunta',
    mensaje: construirMensajeRevisionCorreccion(correccionPendiente),
    paso: 'revisar_correccion',
    opciones: CORRECTION_REVIEW_OPTIONS,
    hint: 'Revisa si realmente quieres reemplazar ese dato.',
    contexto: {
      ...contextoBase,
      paso_actual: 'revisar_correccion',
      correccion_pendiente: correccionPendiente,
    },
    intencionDetectada: 'correccion_pendiente'
  };
}

function resolverRevisionCorreccion(mensaje, contextoBase) {
  const pendiente = contextoBase.correccion_pendiente;
  if (!pendiente) {
    return null;
  }

  if (esRespuestaPositiva(mensaje) || normalizarTexto(mensaje) === 'APLICAR_CORRECCION') {
    const datosCorregidos = limpiarDependenciasPorCorreccion(
      {
        ...contextoBase.datos_previos,
        ...pendiente.changes,
      },
      pendiente.field,
      pendiente.changes
    );

    const contextoCorregido = {
      ...contextoBase,
      datos_previos: datosCorregidos,
    };

    delete contextoCorregido.correccion_pendiente;

    const siguientePregunta = flow.generarPregunta(contextoCorregido);
    contextoCorregido.paso_actual = siguientePregunta?.paso || pendiente.return_step;

    return {
      tipo: 'pregunta',
      mensaje: `Actualice ${pendiente.label} a "${formatearValorCampo(pendiente.field, pendiente.to)}". ${siguientePregunta?.pregunta ? `Seguimos con este punto: ${siguientePregunta.pregunta}` : 'Seguimos con la cotizacion.'}`,
      paso: siguientePregunta?.paso || pendiente.return_step,
      opciones: siguientePregunta?.opciones,
      hint: siguientePregunta?.hint,
      contexto: contextoCorregido,
      intencionDetectada: 'correccion_aplicada'
    };
  }

  if (esRespuestaNegativa(mensaje) || normalizarTexto(mensaje) === 'MANTENER_CORRECCION') {
    const contextoSinPendiente = {
      ...contextoBase,
    };
    delete contextoSinPendiente.correccion_pendiente;

    const preguntaActual = flow.generarPreguntaParaPaso(
      pendiente.return_step,
      contextoSinPendiente
    ) || flow.generarPregunta({
      ...contextoSinPendiente,
      paso_actual: pendiente.return_step,
    });
    contextoSinPendiente.paso_actual = preguntaActual?.paso || pendiente.return_step;

    return {
      tipo: 'pregunta',
      mensaje: `Mantengo ${pendiente.label} como "${formatearValorCampo(pendiente.field, pendiente.from)}". ${preguntaActual?.pregunta ? `Seguimos con este punto: ${preguntaActual.pregunta}` : 'Seguimos con la cotizacion.'}`,
      paso: preguntaActual?.paso || pendiente.return_step,
      opciones: preguntaActual?.opciones,
      hint: preguntaActual?.hint,
      contexto: contextoSinPendiente,
      intencionDetectada: 'correccion_mantenida'
    };
  }

  return {
    tipo: 'pregunta',
    mensaje: `${construirMensajeRevisionCorreccion(pendiente)}\n\nRevisa o cancela antes de seguir.`,
    paso: 'revisar_correccion',
    opciones: CORRECTION_REVIEW_OPTIONS,
    hint: 'Puedes revisarlo o mantener el valor actual.',
    contexto: {
      ...contextoBase,
      paso_actual: 'revisar_correccion'
    },
    intencionDetectada: 'correccion_pendiente'
  };
}

async function resolverAclaracionDurantePaso(mensaje, contextoBase) {
  if (!esAclaracionDurantePaso(mensaje, contextoBase.paso_actual, contextoBase)) {
    return null;
  }

  const preguntaActual = flow.generarPreguntaParaPaso(
    contextoBase.paso_actual,
    contextoBase
  ) || flow.generarPregunta(contextoBase);
  const explicacionContextual = generarExplicacionContextualPaso(contextoBase.paso_actual, mensaje);
  let explicacion = explicacionContextual;

  if (!explicacion) {
    try {
      const messages = [
        {
          role: 'system',
          content: 'Eres un asesor de importaciones peruanas. Responde la duda del usuario sobre el paso actual del flujo en maximo 4 lineas, sin avanzar el formulario y sin inventar datos.'
        },
        {
          role: 'user',
          content: `Paso actual: ${contextoBase.paso_actual}\nPregunta del flujo: ${preguntaActual?.pregunta || 'No disponible'}\nDuda del usuario: ${mensaje}`
        }
      ];
      const iaResponse = await aiProxy.classify(messages, 'groq');
      explicacion = iaResponse?.text || null;
    } catch {
      explicacion = null;
    }
  }

  const mensajeRespuesta = explicacion || 'Te aclaro ese punto y luego seguimos con el mismo paso.';
  const cierre = preguntaActual?.pregunta
    ? `Cuando quieras, seguimos con este punto: ${preguntaActual.pregunta}`
    : 'Cuando quieras, seguimos con la cotizacion.';

  return {
    tipo: 'pregunta',
    mensaje: `${mensajeRespuesta}\n\n${cierre}`,
    paso: preguntaActual?.paso || contextoBase.paso_actual,
    opciones: preguntaActual?.opciones,
    hint: preguntaActual?.hint,
    contexto: {
      ...contextoBase,
      paso_actual: preguntaActual?.paso || contextoBase.paso_actual
    },
    intencionDetectada: 'aclaracion_durante_paso'
  };
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

  if (/(precio|unitario|usd|dolar|\$|cuesta|vale)/i.test(sanitizarComparacion(msg))) {
    const precio = extraerNumero(msg);
    if (precio !== null) {
      datos.precio_unitario = precio;
    }
  }

  return datos;
}

// -----------------------------------------------------------------
// GENERADOR DE PREGUNTAS CONTEXTUALES
// -----------------------------------------------------------------

function generarPregunta(contexto) {
  const { datos_previos } = contexto;
  
  if (!datos_previos.productos) {
    return {
      pregunta: 'Hola. Soy tu asistente de importaciones. Que productos quieres importar?',
      paso: 'productos',
      tipo: 'lista',
      hint: 'Ej: 500 camisetas de algodon, 100 laptops, etc.'
    };
  }
  
  if (!datos_previos.pais_origen) {
    return {
      pregunta: `Perfecto, ${datos_previos.productos.length} producto(s). Desde que pais importaras?`,
      paso: 'pais_origen',
      tipo: 'texto',
      hint: 'Ej: China, USA, Brasil, etc.'
    };
  }
  
  if (!datos_previos.canal) {
    return {
      pregunta: `Importaras desde ${datos_previos.pais_origen} por mar, aire, courier o postal?`,
      opciones: [
        { value: 'DEFINITIVA', label: 'Maritimo/Aereo (importacion formal)' },
        { value: 'COURIER', label: 'Courier express (DHL, FedEx, UPS u otro)' },
        { value: 'POSTAL', label: 'Postal (Serpost / correo postal)' }
      ],
      paso: 'canal',
      tipo: 'opciones'
    };
  }
  
  if (datos_previos.precio_unitario === undefined) {
    return {
      pregunta: 'Cual es el precio unitario en USD?',
      paso: 'precio_unitario',
      tipo: 'numero',
      hint: 'Ej: 3.50'
    };
  }
  
  if (!datos_previos.incoterm) {
    return {
      pregunta: 'Que incoterm usa el proveedor?',
      opciones: [
        { value: 'FOB', label: 'FOB (Free on Board) - El mas comun' },
        { value: 'CIF', label: 'CIF (Cost, Insurance & Freight)' },
        { value: 'EXW', label: 'EXW (Ex Works) - En fabrica' },
        { value: 'OTRO', label: 'Otro (CFR, FCA, DAP, DDP)' }
      ],
      paso: 'incoterm',
      tipo: 'opciones'
    };
  }
  
  if (!datos_previos.tipo_importador) {
    return {
      pregunta: 'Cual es el perfil de la empresa importadora?',
      opciones: [
        { value: 'general', label: 'Empresa importadora recurrente' },
        { value: 'nuevo', label: 'Empresa nueva importando' },
        { value: 'buen_contribuyente', label: 'Buen Contribuyente SUNAT' }
      ],
      paso: 'tipo_importador',
      tipo: 'opciones'
    };
  }
  
  // Si ya tenemos todo, indicar que podemos calcular
  return {
    pregunta: 'Ya tengo toda la informacion. Calculamos el costo total de importacion?',
    paso: 'calcular',
    tipo: 'datos_suficientes_para_calculo'
  };
}

// -----------------------------------------------------------------
// RECOMENDADOR INTELIGENTE
// -----------------------------------------------------------------

function generarRecomendaciones(datos, resultado) {
  const recomendaciones = [];
  
  // Si hay TLC disponible
  if (resultado?.items?.some(i => i.tlc)) {
    const tlc = resultado.items.find(i => i.tlc);
    recomendaciones.push({
      tipo: 'tlc',
      nivel: 'alto',
      icono: 'trade',
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
      icono: 'warning',
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
      icono: 'freight',
      titulo: 'Flete Estimado',
      mensaje: `El flete de $${resultado.totales?.flete} es referencial.`,
      accion: 'Solicita cotizacion formal a un freight forwarder'
    });
  }
  
  // Si hay riesgo de duda razonable
  if (resultado?.alertas?.some(a => a.tipo === 'duda_razonable')) {
    const alerta = resultado.alertas.find(a => a.tipo === 'duda_razonable');
    recomendaciones.push({
      tipo: 'duda_razonable',
      nivel: 'alto',
      icono: 'review',
      titulo: 'Riesgo SUNAT',
      mensaje: alerta.mensaje,
      accion: 'Prepara documentacion que justifique el precio'
    });
  }
  
  // Si el margen es muy bajo o muy alto
  if (resultado?.totales?.margenVenta) {
    const margen = resultado.totales.margenVenta.margenPct;
    if (margen < 20) {
      recomendaciones.push({
        tipo: 'margen_bajo',
        nivel: 'medio',
        icono: 'margin_down',
        titulo: 'Margen Bajo',
        mensaje: `Con ${margen}% de margen, tu utilidad es limitada.`,
        accion: 'Considera negociar mejor precio con el proveedor'
      });
    } else if (margen > 100) {
      recomendaciones.push({
        tipo: 'margen_alto',
        nivel: 'info',
        icono: 'margin_up',
        titulo: 'Margen Alto',
        mensaje: `Con ${margen}% de margen, tu utilidad es excelente.`,
        accion: 'Verifica que el precio de venta sea competitivo en el mercado'
      });
    }
  }
  
  return recomendaciones;
}

// -----------------------------------------------------------------
// AGENTE CONVERSADOR PRINCIPAL
// -----------------------------------------------------------------

async function agenteConversador(mensaje, contexto = {}) {
  const startTime = Date.now();
  const contextoBase = {
    ...contexto,
    datos_previos: { ...(contexto.datos_previos || {}) },
    paso_actual: contexto.paso_actual || null,
  };

  if (contextoBase.paso_actual === 'calcular' && esRespuestaPositiva(mensaje)) {
    return {
      tipo: 'datos_suficientes_para_calculo',
      mensaje: 'Ya tengo los datos necesarios para pasar al calculo.',
      paso: 'calcular',
      contexto: {
        ...contextoBase,
        paso_actual: 'calcular'
      },
      tiempoMs: Date.now() - startTime,
      intencionDetectada: 'respuesta'
    };
  }

  const revisionCorreccion = resolverRevisionCorreccion(mensaje, contextoBase);
  if (revisionCorreccion) {
    revisionCorreccion.tiempoMs = Date.now() - startTime;
    return revisionCorreccion;
  }

  const correccionPendiente = detectarCorreccionPendiente(mensaje, contextoBase);
  if (correccionPendiente) {
    const respuestaCorreccion = crearRespuestaRevisionCorreccion(contextoBase, correccionPendiente);
    respuestaCorreccion.tiempoMs = Date.now() - startTime;
    return respuestaCorreccion;
  }

  const aclaracion = await resolverAclaracionDurantePaso(mensaje, contextoBase);
  if (aclaracion) {
    aclaracion.tiempoMs = Date.now() - startTime;
    return aclaracion;
  }

  // 1. Detectar intencion del usuario
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

  // 3. Actualizar contexto con datos extraidos
  const contextoActualizado = {
    ...contextoBase,
    datos_previos: {
      ...contextoBase.datos_previos,
      ...datosExtraidos
    }
  };
  
  // 4. Generar respuesta segun intencion
  let respuesta;

  if (intencion.tipo === 'iniciar_cotizacion' || intencion.tipo === 'respuesta') {
    if (contextoBase.paso_actual && contextoBase.paso_actual !== 'calcular' && Object.keys(datosPorPaso).length === 0) {
      const preguntaActual = flow.generarPregunta(contextoActualizado);
      const guidance = preguntaActual?.tipo === 'opciones'
        ? 'No pude relacionar tu respuesta con las alternativas. Elige una de estas opciones:'
        : `No logre interpretar bien tu respuesta. ${preguntaActual?.pregunta || 'Puedes intentarlo otra vez?'}`;

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
    // Usuario envio JSON directo
    try {
      const datos = JSON.parse(mensaje.match(/\{[\s\S]*\}/)[0]);
      respuesta = {
        tipo: 'datos_recibidos',
        mensaje: 'Datos recibidos. Voy a revisarlos antes del calculo.',
        datos: datos,
        contexto: { ...contextoActualizado, datos_previos: datos, paso_actual: 'calcular' }
      };
    } catch {
      respuesta = {
        tipo: 'error',
        mensaje: 'No entendi los datos. Puedes reformularlos?',
        contexto: contextoActualizado
      };
    }
  } else if (intencion.tipo === 'consulta_costo' || intencion.tipo === 'consulta_permisos' || intencion.tipo === 'consulta_clasificacion') {
    // Consulta especifica - usar IA para responder
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
        mensaje: 'Tuve un error. Puedes reformular la pregunta?',
        error: e.message,
        contexto: contextoActualizado
      };
    }
  } else {
    // Default
    respuesta = {
      tipo: 'pregunta',
      mensaje: 'Quieres importar algo? Cuentame que productos y desde donde.',
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
