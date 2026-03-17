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

const QUESTIONS_TREE = {
  nivel1: [
    { key: 'productos', pregunta: '¿Que productos quieres importar?', tipo: 'lista', required: true, hint: 'Ej: 500 camisetas de algodon, 100 laptops, etc.' },
    { key: 'pais_origen', pregunta: '¿Desde que pais importaras?', tipo: 'texto', required: true, hint: 'Ej: China, USA, Brasil, etc.' },
    { key: 'tipo_sujeto', pregunta: '¿Importas como persona natural o empresa?', tipo: 'opciones', opciones: FLOW_SUBJECT_OPTIONS, required: true },
    { key: 'canal', pregunta: '¿Que canal de importacion usaras?', tipo: 'opciones', opciones: FLOW_CHANNEL_OPTIONS, required: true }
  ],
  nivel2: [
    { key: 'precio_unitario', pregunta: '¿Precio unitario en USD?', tipo: 'numero', required: true, hint: 'Ej: 3.50' },
    { key: 'incoterm', pregunta: '¿Que incoterm usa el proveedor?', tipo: 'opciones', opciones: FLOW_INCOTERM_OPTIONS, required: true },
    { key: 'tipo_importador', pregunta: '¿Cual es tu perfil importador?', tipo: 'opciones', opciones: FLOW_IMPORTER_OPTIONS.empresa, required: true }
  ],
  nivel3: [
    { key: 'flete', pregunta: '¿Conoces el costo de flete internacional?', tipo: 'numero', required: false, hint: 'Escribe el monto o elige estimarlo.', opciones: OPTIONAL_ESTIMATE_OPTIONS },
    { key: 'seguro', pregunta: '¿Conoces el costo del seguro?', tipo: 'numero', required: false, hint: 'Escribe el monto o elige estimarlo.', opciones: OPTIONAL_ESTIMATE_OPTIONS },
    { key: 'peso_total', pregunta: '¿Peso total de la mercancia (kg)?', tipo: 'numero', required: false, hint: 'Ayuda a estimar mejor el flete.', opciones: OPTIONAL_ESTIMATE_OPTIONS },
    { key: 'tipo_cambio', pregunta: '¿Quieres usar un tipo de cambio manual?', tipo: 'numero', required: false, hint: 'Escribe el TC o elige usar SUNAT.', opciones: OPTIONAL_ESTIMATE_OPTIONS },
    { key: 'margen_venta', pregunta: '¿Que margen de utilidad buscas (%)?', tipo: 'numero', required: false, hint: 'Puedes escribir otro porcentaje o usar 30%.', opciones: FLOW_MARGIN_OPTIONS }
  ]
};

function normalizarTexto(valor) {
  return String(valor || '').trim();
}

function sanitizar(valor) {
  return normalizarTexto(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function extraerNumero(texto) {
  const limpio = normalizarTexto(texto)
    .replace(/usd|dolares|dolares|s\/|soles|pen/gi, ' ')
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
      descripcion
    };
  });
}

function normalizarPais(valor, allowFreeText = false) {
  const texto = sanitizar(valor);
  if (!texto) return null;

  const equivalencias = {
    china: 'CN',
    'estados unidos': 'US',
    usa: 'US',
    eeuu: 'US',
    'united states': 'US',
    brasil: 'BR',
    brazil: 'BR',
    mexico: 'MX',
    espana: 'ES',
    spain: 'ES',
    alemania: 'DE',
    germany: 'DE',
    japon: 'JP',
    japan: 'JP',
    corea: 'KR',
    'corea del sur': 'KR',
    'south korea': 'KR',
    thailandia: 'TH',
    thailand: 'TH',
    peru: 'PE',
    chile: 'CL',
    colombia: 'CO',
    argentina: 'AR',
    italia: 'IT',
    italy: 'IT',
    canada: 'CA',
    india: 'IN',
    taiwan: 'TW',
    'reino unido': 'GB',
    uk: 'GB',
    'united kingdom': 'GB'
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
  const texto = sanitizar(valor);
  if (!texto) return null;

  if (texto.includes('postal') || texto.includes('serpost') || texto.includes('correo postal')) {
    return 'POSTAL';
  }

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

  if (
    texto.includes('aereo')
    || texto.includes('air')
    || texto.includes('avion')
  ) {
    return 'AEREO';
  }

  if (
    texto.includes('marit')
    || texto.includes('barco')
    || texto.includes('contenedor')
    || texto.includes('fcl')
    || texto.includes('lcl')
  ) {
    return 'MARITIMO';
  }

  if (texto.includes('definitiva') || texto.includes('formal')) {
    return 'MARITIMO';
  }

  return null;
}

function normalizarIncoterm(valor) {
  const texto = normalizarTexto(valor).toUpperCase();
  const incoterms = ['FOB', 'CIF', 'CFR', 'EXW', 'FCA', 'CIP', 'DAP', 'DDP'];
  return incoterms.find((incoterm) => texto.includes(incoterm)) || null;
}

function normalizarTipoSujeto(valor) {
  const texto = sanitizar(valor);
  if (!texto) return null;

  if (texto.includes('persona natural') || texto.includes('natural') || texto.includes('personal')) {
    return 'persona_natural';
  }

  if (texto.includes('empresa') || texto.includes('juridica') || texto.includes('ruc')) {
    return 'empresa';
  }

  return null;
}

function normalizarTipoImportador(valor) {
  const texto = sanitizar(valor);
  if (!texto) return null;

  if (texto.includes('buen')) return 'buen_contribuyente';
  if (texto.includes('nuevo') || texto.includes('primera')) return 'nuevo';
  if (texto.includes('general') || texto.includes('recurrente')) return 'general';

  return null;
}

function esRespuestaOmitida(valor) {
  const texto = sanitizar(valor);
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
    'usar sunat',
    'por defecto'
  ].some((fragmento) => texto.includes(fragmento));
}

function obtenerOpcionesTipoImportador(datosPrevios = {}) {
  return FLOW_IMPORTER_OPTIONS[datosPrevios.tipo_sujeto] || FLOW_IMPORTER_OPTIONS.empresa;
}

function tieneProductosCapturados(datosPrevios = {}) {
  return Array.isArray(datosPrevios.productos) && datosPrevios.productos.length > 0;
}

function requierePaso(stepKey, datosPrevios = {}) {
  switch (stepKey) {
  case 'productos':
    return !tieneProductosCapturados(datosPrevios);
  case 'pais_origen':
    return !datosPrevios.pais_origen;
  case 'tipo_sujeto':
    return !datosPrevios.tipo_sujeto;
  case 'canal':
    return !datosPrevios.canal;
  case 'precio_unitario':
    return datosPrevios.precio_unitario === undefined;
  case 'incoterm':
    return !datosPrevios.incoterm;
  case 'tipo_importador':
    return !datosPrevios.tipo_importador;
  case 'flete':
    return datosPrevios.flete === undefined && datosPrevios.canal !== 'POSTAL';
  case 'seguro':
    return datosPrevios.seguro === undefined && datosPrevios.canal !== 'POSTAL';
  case 'peso_total':
    return datosPrevios.peso_total === undefined && datosPrevios.canal !== 'POSTAL';
  case 'tipo_cambio':
    return datosPrevios.tipo_cambio === undefined;
  case 'margen_venta':
    return datosPrevios.margen_venta === undefined;
  default:
    return false;
  }
}

function extraerDeLenguajeNatural(mensaje, pasoActual = null) {
  const datos = {};
  const msg = normalizarTexto(mensaje);
  const productos = extraerProductosDesdeTexto(msg);
  const paisOrigen = normalizarPais(msg);
  const canal = normalizarCanal(msg);
  const incoterm = normalizarIncoterm(msg);
  const tipoSujeto = normalizarTipoSujeto(msg);
  const tipoImportador = normalizarTipoImportador(msg);

  const allowProductExtraction = !pasoActual || pasoActual === 'productos';
  const allowPriceExtraction = !pasoActual || pasoActual === 'productos' || pasoActual === 'precio_unitario';

  if (allowProductExtraction && productos.length > 0) {
    datos.productos = productos;
  }

  if (paisOrigen) {
    datos.pais_origen = paisOrigen;
  }

  if (tipoSujeto) {
    datos.tipo_sujeto = tipoSujeto;
  }

  if (canal) {
    datos.canal = canal;
  }

  if (incoterm) {
    datos.incoterm = incoterm;
  }

  if (tipoImportador) {
    datos.tipo_importador = tipoImportador;
  }

  if (allowPriceExtraction && /(precio|unitario|usd|dolar|dólar|\$|cuesta|vale|c\/u)/i.test(msg)) {
    const precio = extraerNumero(msg);
    if (precio !== null) {
      datos.precio_unitario = precio;
    }
  }

  return datos;
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
  case 'tipo_sujeto': {
    const tipoSujeto = normalizarTipoSujeto(texto);
    return tipoSujeto ? { tipo_sujeto: tipoSujeto } : {};
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
  case 'tipo_importador': {
    const tipoImportador = normalizarTipoImportador(texto);
    return tipoImportador ? { tipo_importador: tipoImportador } : {};
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
  case 'peso_total': {
    if (esRespuestaOmitida(texto)) return { peso_total: 0 };
    const pesoTotal = extraerNumero(texto);
    return pesoTotal !== null ? { peso_total: pesoTotal } : {};
  }
  case 'tipo_cambio': {
    if (esRespuestaOmitida(texto)) return { tipo_cambio: 0 };
    const tipoCambio = extraerNumero(texto);
    return tipoCambio !== null ? { tipo_cambio: tipoCambio } : {};
  }
  case 'margen_venta': {
    if (esRespuestaOmitida(texto)) return { margen_venta: 30 };
    const margenVenta = extraerNumero(texto);
    return margenVenta !== null ? { margen_venta: margenVenta } : {};
  }
  default:
    return {};
  }
}

function generarPregunta(contexto = {}) {
  const datosPrevios = contexto?.datos_previos || {};
  const productos = datosPrevios.productos || [];

  if (requierePaso('productos', datosPrevios)) {
    return {
      pregunta: '¡Hola! Soy tu asistente de importaciones. ¿Que productos quieres importar?',
      paso: 'productos',
      tipo: 'lista',
      hint: 'Ej: 500 camisetas de algodon, 100 laptops, etc.'
    };
  }

  if (requierePaso('pais_origen', datosPrevios)) {
    return {
      pregunta: `Perfecto, ${productos.length} producto(s). ¿Desde que pais importaras?`,
      paso: 'pais_origen',
      tipo: 'texto',
      hint: 'Ej: China, USA, Brasil, etc.'
    };
  }

  if (requierePaso('tipo_sujeto', datosPrevios)) {
    return {
      pregunta: '¿Importas como persona natural o empresa?',
      opciones: FLOW_SUBJECT_OPTIONS,
      paso: 'tipo_sujeto',
      tipo: 'opciones'
    };
  }

  if (requierePaso('canal', datosPrevios)) {
    return {
      pregunta: `¿Que canal usaras para importar desde ${datosPrevios.pais_origen}?`,
      opciones: FLOW_CHANNEL_OPTIONS,
      paso: 'canal',
      tipo: 'opciones'
    };
  }

  if (requierePaso('precio_unitario', datosPrevios)) {
    return {
      pregunta: '¿Cual es el precio unitario en USD?',
      paso: 'precio_unitario',
      tipo: 'numero',
      hint: 'Ej: 3.50'
    };
  }

  if (requierePaso('incoterm', datosPrevios)) {
    return {
      pregunta: '¿Que incoterm usa el proveedor?',
      opciones: FLOW_INCOTERM_OPTIONS,
      paso: 'incoterm',
      tipo: 'opciones'
    };
  }

  if (requierePaso('tipo_importador', datosPrevios)) {
    return {
      pregunta: datosPrevios.tipo_sujeto === 'persona_natural'
        ? '¿Como describirias tu experiencia importando como persona natural?'
        : '¿Cual es el perfil de la empresa importadora?',
      opciones: obtenerOpcionesTipoImportador(datosPrevios),
      paso: 'tipo_importador',
      tipo: 'opciones'
    };
  }

  if (requierePaso('flete', datosPrevios)) {
    return {
      pregunta: '¿Conoces el costo de flete internacional?',
      opciones: OPTIONAL_ESTIMATE_OPTIONS,
      paso: 'flete',
      tipo: 'numero',
      hint: 'Escribe el monto si ya lo tienes o elige estimarlo.'
    };
  }

  if (requierePaso('seguro', datosPrevios)) {
    return {
      pregunta: '¿Conoces el costo del seguro?',
      opciones: OPTIONAL_ESTIMATE_OPTIONS,
      paso: 'seguro',
      tipo: 'numero',
      hint: 'Escribe el monto si ya lo tienes o elige estimarlo.'
    };
  }

  if (requierePaso('peso_total', datosPrevios)) {
    return {
      pregunta: '¿Peso total de la mercancia en kg?',
      opciones: OPTIONAL_ESTIMATE_OPTIONS,
      paso: 'peso_total',
      tipo: 'numero',
      hint: 'Ayuda a estimar mejor el flete.'
    };
  }

  if (requierePaso('tipo_cambio', datosPrevios)) {
    return {
      pregunta: '¿Quieres usar un tipo de cambio manual?',
      opciones: OPTIONAL_ESTIMATE_OPTIONS,
      paso: 'tipo_cambio',
      tipo: 'numero',
      hint: 'Escribe el TC o elige usar el actual de SUNAT.'
    };
  }

  if (requierePaso('margen_venta', datosPrevios)) {
    return {
      pregunta: '¿Que margen de utilidad buscas (%)?',
      opciones: FLOW_MARGIN_OPTIONS,
      paso: 'margen_venta',
      tipo: 'numero',
      hint: 'Puedes escribir otro porcentaje si quieres.'
    };
  }

  return {
    pregunta: '¡Perfecto! Ya tengo la informacion principal. ¿Calculamos el costo total de importacion?',
    paso: 'calcular',
    tipo: 'confirmacion'
  };
}

module.exports = {
  QUESTIONS_TREE,
  generarPregunta,
  interpretarRespuestaPorPaso,
  extraerDeLenguajeNatural,
  FLOW_CHANNEL_OPTIONS,
  FLOW_SUBJECT_OPTIONS,
  FLOW_INCOTERM_OPTIONS
};
