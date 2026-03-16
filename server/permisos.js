// server/permisos.js — Módulo de permisos y entidades reguladoras del Perú
// Consulta qué permisos necesita una mercancía, de qué entidad, cómo tramitarlo

const nandinaService = require("./nandina");

// ══════════════════════════════════════════
// BASE DE DATOS DE ENTIDADES REGULADORAS
// ══════════════════════════════════════════
const ENTIDADES = {
  "02": {
    codigo: "02", siglas: "SUCAMEC", nombre: "Superintendencia Nacional de Control de Servicios de Seguridad, Armas, Municiones y Explosivos",
    ministerio: "Ministerio del Interior",
    web: "https://www.sucamec.gob.pe",
    vuce: true,
    telefono: "(01) 204-1040",
    tramite: "Autorización de importación de armas, municiones, explosivos y artículos conexos de uso civil",
    pasos: [
      "Obtener RUC activo y Clave SOL",
      "Registrarse en VUCE (vuce.gob.pe)",
      "Solicitar autorización de importación en VUCE → SUCAMEC",
      "Adjuntar: factura proforma, certificado de usuario final, antecedentes penales",
      "Pago de tasa (ver TUPA SUCAMEC)",
      "Esperar resolución (30 días hábiles aprox.)",
    ],
    productos: "Armas de fuego, municiones, explosivos, artículos pirotécnicos, chalecos antibalas",
    icon: "🔫", color: "red",
  },
  "03": {
    codigo: "03", siglas: "DIGEMID", nombre: "Dirección General de Medicamentos, Insumos y Drogas",
    ministerio: "Ministerio de Salud (MINSA)",
    web: "https://www.digemid.minsa.gob.pe",
    vuce: true,
    telefono: "(01) 631-4300",
    tramite: "Registro Sanitario de medicamentos, dispositivos médicos e insumos de salud",
    pasos: [
      "Obtener Registro Sanitario del producto (si es nuevo)",
      "Registrarse en VUCE",
      "Solicitar autorización de importación en VUCE → DIGEMID",
      "Adjuntar: Registro Sanitario, certificado GMP del fabricante, factura, CoA",
      "Pago de tasa según TUPA DIGEMID",
      "Inspección de calidad puede ser requerida",
    ],
    productos: "Medicamentos, dispositivos médicos, reactivos de diagnóstico, insumos de salud, cosméticos medicados",
    icon: "💊", color: "red",
  },
  "04": {
    codigo: "04", siglas: "DIGESA", nombre: "Dirección General de Salud Ambiental e Inocuidad Alimentaria",
    ministerio: "Ministerio de Salud (MINSA)",
    web: "https://www.digesa.minsa.gob.pe",
    vuce: true,
    telefono: "(01) 631-4430",
    tramite: "Registro Sanitario de alimentos, bebidas, cosméticos, artículos de higiene, juguetes y útiles de escritorio",
    pasos: [
      "Obtener Registro Sanitario (Habilitación Sanitaria para alimentos)",
      "Registrarse en VUCE",
      "Solicitar Certificado de Libre Comercialización o Registro Sanitario en VUCE → DIGESA",
      "Adjuntar: certificado de análisis, etiqueta del producto, ficha técnica",
      "Pago de tasa según TUPA DIGESA",
      "Plazo: 7-30 días hábiles según trámite",
    ],
    productos: "Alimentos procesados, bebidas, cosméticos, productos de higiene, desinfectantes, juguetes, útiles de escritorio",
    icon: "🍽", color: "orange",
  },
  "05": {
    codigo: "05", siglas: "SENASA", nombre: "Servicio Nacional de Sanidad Agraria",
    ministerio: "Ministerio de Desarrollo Agrario y Riego (MIDAGRI)",
    web: "https://www.senasa.gob.pe",
    vuce: true,
    telefono: "(01) 313-3300",
    tramite: "Permiso Fitosanitario de Importación (PFI) / Autorización Zoosanitaria",
    pasos: [
      "Verificar requisitos fitosanitarios o zoosanitarios del producto en web SENASA",
      "Registrarse en VUCE",
      "Solicitar PFI o Autorización Zoosanitaria en VUCE → SENASA",
      "Adjuntar: certificado fitosanitario del país de origen, factura proforma",
      "Pago de tasa según TUPA SENASA",
      "Inspección en puerto/aeropuerto al arribo de la mercancía",
      "Plazo PFI: 5-10 días hábiles",
    ],
    productos: "Plantas, frutas, vegetales, semillas, granos, productos de origen animal, animales vivos, plaguicidas",
    icon: "🌿", color: "green",
  },
  "06": {
    codigo: "06", siglas: "SERFOR", nombre: "Servicio Nacional Forestal y de Fauna Silvestre",
    ministerio: "Ministerio de Desarrollo Agrario y Riego (MIDAGRI)",
    web: "https://www.serfor.gob.pe",
    vuce: true,
    telefono: "(01) 225-9005",
    tramite: "Permiso CITES / Autorización de importación de productos forestales y fauna silvestre",
    pasos: [
      "Verificar si el producto está en listados CITES",
      "Solicitar permiso CITES o autorización de importación en VUCE → SERFOR",
      "Adjuntar: permiso CITES del país de origen (si aplica), factura",
      "Inspección al arribo",
    ],
    productos: "Madera, productos forestales, fauna silvestre, especies CITES, cueros de animales silvestres",
    icon: "🌳", color: "green",
  },
  "07": {
    codigo: "07", siglas: "MRREE", nombre: "Ministerio de Relaciones Exteriores",
    ministerio: "Ministerio de Relaciones Exteriores",
    web: "https://www.gob.pe/rree",
    vuce: false,
    telefono: "(01) 204-2400",
    tramite: "Autorización para importación de bienes de uso diplomático o sujetos a convenios internacionales",
    pasos: [
      "Coordinar directamente con la Cancillería",
      "Presentar solicitud según convenio aplicable",
    ],
    productos: "Bienes diplomáticos, equipaje diplomático, bienes bajo convenios internacionales específicos",
    icon: "🏛", color: "blue",
  },
  "08": {
    codigo: "08", siglas: "MTC", nombre: "Ministerio de Transportes y Comunicaciones",
    ministerio: "Ministerio de Transportes y Comunicaciones",
    web: "https://www.gob.pe/mtc",
    vuce: true,
    telefono: "(01) 615-7800",
    tramite: "Homologación de equipos y aparatos de telecomunicaciones",
    pasos: [
      "Verificar si el equipo requiere homologación (equipos que emiten/reciben señales de radio)",
      "Solicitar Certificado de Homologación en VUCE → MTC",
      "Adjuntar: ficha técnica del equipo, certificado FCC/CE del fabricante, fotos del equipo",
      "Pago de tasa según TUPA MTC",
      "Plazo: 10-20 días hábiles",
      "El equipo puede requerir pruebas en laboratorio autorizado",
    ],
    productos: "Celulares, routers, equipos WiFi/Bluetooth, radios, antenas, drones con comunicación, equipos satelitales",
    icon: "📡", color: "blue",
  },
  "11": {
    codigo: "11", siglas: "PRODUCE-PESCA", nombre: "Viceministerio de Pesca y Acuicultura",
    ministerio: "Ministerio de la Producción (PRODUCE)",
    web: "https://www.gob.pe/produce",
    vuce: true,
    telefono: "(01) 616-2222",
    tramite: "Autorización de importación de productos pesqueros y acuícolas",
    pasos: [
      "Solicitar autorización en VUCE → PRODUCE (Pesca)",
      "Adjuntar: certificado sanitario del país de origen, factura",
      "Inspección al arribo por SANIPES",
    ],
    productos: "Productos pesqueros, conservas de pescado, harina de pescado, aceite de pescado, productos acuícolas",
    icon: "🐟", color: "blue",
  },
  "12": {
    codigo: "12", siglas: "MINCUL", nombre: "Ministerio de Cultura",
    ministerio: "Ministerio de Cultura",
    web: "https://www.gob.pe/cultura",
    vuce: true,
    telefono: "(01) 618-9393",
    tramite: "Autorización para importación de bienes culturales y patrimonio",
    pasos: [
      "Solicitar certificado de no pertenecer al patrimonio cultural en VUCE → MINCUL",
      "Adjuntar: fotos del bien, descripción, certificado de procedencia",
    ],
    productos: "Antigüedades, obras de arte, fósiles, restos arqueológicos, bienes con valor cultural",
    icon: "🏛", color: "purple",
  },
  "17": {
    codigo: "17", siglas: "PRODUCE-DOPIF", nombre: "Dirección de Ordenamiento Productivo e Industrial y Fiscalización",
    ministerio: "Ministerio de la Producción (PRODUCE)",
    web: "https://www.gob.pe/produce",
    vuce: true,
    telefono: "(01) 616-2222",
    tramite: "Autorización de importación de insumos químicos y bienes fiscalizados (IQBF)",
    pasos: [
      "Inscribirse en el Registro de IQBF de SUNAT",
      "Obtener Informe Técnico favorable de PRODUCE",
      "Solicitar autorización en VUCE → PRODUCE (DOPIF)",
      "Adjuntar: certificado de usuario final, plan de uso, factura",
      "Control estricto: trazabilidad del producto posterior a importación",
    ],
    productos: "Ácido sulfúrico, acetona, tolueno, permanganato de potasio, éter, y otros precursores químicos",
    icon: "⚗️", color: "red",
  },
  "18": {
    codigo: "18", siglas: "PRODUCE-SAO", nombre: "PRODUCE — Sustancias Agotadoras de la Capa de Ozono",
    ministerio: "Ministerio de la Producción (PRODUCE)",
    web: "https://www.gob.pe/produce",
    vuce: true,
    telefono: "(01) 616-2222",
    tramite: "Autorización para importación de sustancias agotadoras del ozono (SAO)",
    pasos: [
      "Verificar cuota disponible para la sustancia",
      "Solicitar autorización en VUCE → PRODUCE (SAO)",
      "Adjuntar: factura, ficha técnica, declaración de uso",
    ],
    productos: "Refrigerantes (HCFCs, CFCs), halones, bromuro de metilo",
    icon: "🌍", color: "yellow",
  },
  "23": {
    codigo: "23", siglas: "IPEN", nombre: "Instituto Peruano de Energía Nuclear",
    ministerio: "Ministerio de Energía y Minas",
    web: "https://www.ipen.gob.pe",
    vuce: true,
    telefono: "(01) 488-1600",
    tramite: "Autorización para importación de materiales radiactivos y equipos con fuentes radiactivas",
    pasos: [
      "Solicitar Licencia de operación (si no la tiene)",
      "Solicitar autorización de importación en VUCE → IPEN",
      "Adjuntar: licencia vigente, ficha técnica del material, certificado del fabricante",
      "Inspección especializada al arribo",
    ],
    productos: "Materiales radiactivos, equipos de rayos X industriales, fuentes selladas, detectores nucleares",
    icon: "☢️", color: "red",
  },
  "28": {
    codigo: "28", siglas: "SANIPES", nombre: "Organismo Nacional de Sanidad Pesquera",
    ministerio: "Ministerio de la Producción (PRODUCE)",
    web: "https://www.sanipes.gob.pe",
    vuce: true,
    telefono: "(01) 500-6900",
    tramite: "Certificación sanitaria de productos pesqueros y acuícolas",
    pasos: [
      "Solicitar habilitación de establecimiento de procesamiento (si aplica)",
      "Solicitar certificado sanitario de importación en VUCE → SANIPES",
      "Inspección y muestreo al arribo",
    ],
    productos: "Productos hidrobiológicos, pescado, mariscos, algas, productos acuícolas para consumo",
    icon: "🦐", color: "blue",
  },
  "30": {
    codigo: "30", siglas: "SUNAT-IQBF", nombre: "SUNAT — Intendencia Nacional de Insumos Químicos y Bienes Fiscalizados",
    ministerio: "SUNAT",
    web: "https://www.sunat.gob.pe",
    vuce: false,
    telefono: "(01) 315-0730",
    tramite: "Registro y control de usuarios de insumos químicos y bienes fiscalizados",
    pasos: [
      "Inscribirse en el Registro de Usuarios de IQBF (SUNAT)",
      "Mantener libro de registro de operaciones actualizado",
      "Declarar cada operación de importación",
      "Informar sobre el uso y destino final del producto",
    ],
    productos: "Insumos químicos fiscalizados: ácido clorhídrico, hipoclorito de sodio, carbonato de sodio, etc.",
    icon: "🏛", color: "gray",
  },
  "31": {
    codigo: "31", siglas: "MINAM", nombre: "Ministerio del Ambiente",
    ministerio: "Ministerio del Ambiente",
    web: "https://www.gob.pe/minam",
    vuce: true,
    telefono: "(01) 611-6000",
    tramite: "Autorización para importación de residuos, sustancias peligrosas y organismos vivos modificados",
    pasos: [
      "Solicitar autorización en VUCE → MINAM",
      "Adjuntar: ficha de seguridad (MSDS), plan de manejo ambiental",
      "Evaluación ambiental del producto",
    ],
    productos: "Residuos peligrosos, sustancias químicas peligrosas (Convenio de Estocolmo/Rotterdam), OVMs",
    icon: "🌍", color: "green",
  },
  "98": {
    codigo: "98", siglas: "NO-PERMISO", nombre: "No necesita permiso",
    ministerio: "-",
    web: "",
    vuce: false,
    telefono: "",
    tramite: "Esta mercancía no requiere permisos especiales para su importación",
    pasos: ["Proceder con despacho normal"],
    productos: "",
    icon: "✅", color: "green",
  },
};

// ══════════════════════════════════════════
// API DE CONSULTA
// ══════════════════════════════════════════

// Get full restriction info for a partida
function consultaPermisos(hs) {
  const restricciones = nandinaService.getRestriccion(hs);
  const prohibida = nandinaService.isProhibida(hs);

  const result = {
    hs: hs.replace(/\./g, ""),
    prohibida: prohibida ? { si: true, desc: prohibida.desc } : { si: false },
    restringida: false,
    permisos: [],
    resumen: "",
    totalEntidades: 0,
  };

  if (prohibida) {
    result.resumen = `⛔ MERCANCÍA PROHIBIDA: ${prohibida.desc}. No se puede importar al Perú.`;
    return result;
  }

  if (!restricciones || restricciones.length === 0) {
    result.resumen = "✅ Esta mercancía no tiene restricciones. Puede importarse libremente.";
    return result;
  }

  result.restringida = true;
  const entidadesVistas = new Set();

  restricciones.forEach(r => {
    // Only import restrictions
    if (r.regimen && r.regimen !== "I" && r.regimen !== "1") return;

    const entidadCode = r.entidad;
    const entidadInfo = ENTIDADES[entidadCode];

    if (!entidadInfo || entidadesVistas.has(entidadCode)) return;
    entidadesVistas.add(entidadCode);

    result.permisos.push({
      entidad: entidadInfo.siglas,
      nombre: entidadInfo.nombre,
      ministerio: entidadInfo.ministerio,
      icon: entidadInfo.icon,
      color: entidadInfo.color,
      tramite: entidadInfo.tramite,
      pasos: entidadInfo.pasos,
      web: entidadInfo.web,
      vuce: entidadInfo.vuce,
      telefono: entidadInfo.telefono,
      productos: entidadInfo.productos,
      descripcionMrestri: r.desc || "",
    });
  });

  result.totalEntidades = result.permisos.length;

  if (result.permisos.length === 0) {
    result.restringida = false;
    result.resumen = "✅ Esta mercancía no tiene restricciones de importación.";
  } else if (result.permisos.length === 1) {
    const p = result.permisos[0];
    result.resumen = `⚠ Requiere autorización de ${p.entidad} (${p.ministerio}). Trámite: ${p.tramite}.`;
  } else {
    const ents = result.permisos.map(p => p.entidad).join(", ");
    result.resumen = `⚠ Requiere ${result.permisos.length} autorizaciones: ${ents}. Tramitar ANTES del embarque.`;
  }

  return result;
}

// Get info about a specific entity
function infoEntidad(codigo) {
  return ENTIDADES[codigo] || null;
}

// List all entities
function listarEntidades() {
  return Object.values(ENTIDADES).filter(e => e.codigo !== "98").map(e => ({
    codigo: e.codigo,
    siglas: e.siglas,
    nombre: e.nombre,
    ministerio: e.ministerio,
    icon: e.icon,
    web: e.web,
    vuce: e.vuce,
  }));
}

module.exports = { consultaPermisos, infoEntidad, listarEntidades, ENTIDADES };
