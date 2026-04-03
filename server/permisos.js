// server/permisos.js - Modulo de permisos y entidades reguladoras del Peru

const nandinaService = require('./nandina');

const ENTIDADES = {
  '02': {
    codigo: '02', siglas: 'SUCAMEC', nombre: 'Superintendencia Nacional de Control de Servicios de Seguridad, Armas, Municiones y Explosivos',
    ministerio: 'Ministerio del Interior', web: 'https://www.sucamec.gob.pe', vuce: true, telefono: '(01) 204-1040',
    tramite: 'Autorizacion de importacion de armas, municiones, explosivos y articulos conexos de uso civil',
    pasos: [
      'Obtener RUC activo y Clave SOL',
      'Registrarse en VUCE (vuce.gob.pe)',
      'Solicitar autorizacion de importacion en VUCE -> SUCAMEC',
      'Adjuntar factura proforma, certificado de usuario final y antecedentes',
      'Pago de tasa segun TUPA SUCAMEC',
      'Esperar resolucion',
    ],
    productos: 'Armas de fuego, municiones, explosivos, articulos pirotecnicos, chalecos antibalas',
    icon: 'security', color: 'red',
  },
  '03': {
    codigo: '03', siglas: 'DIGEMID', nombre: 'Direccion General de Medicamentos, Insumos y Drogas',
    ministerio: 'Ministerio de Salud (MINSA)', web: 'https://www.digemid.minsa.gob.pe', vuce: true, telefono: '(01) 631-4300',
    tramite: 'Registro Sanitario de medicamentos, dispositivos medicos e insumos de salud',
    pasos: [
      'Obtener Registro Sanitario del producto',
      'Registrarse en VUCE',
      'Solicitar autorizacion de importacion en VUCE -> DIGEMID',
      'Adjuntar Registro Sanitario, certificado GMP, factura y CoA',
      'Pago de tasa segun TUPA DIGEMID',
      'Inspeccion de calidad si aplica',
    ],
    productos: 'Medicamentos, dispositivos medicos, reactivos de diagnostico e insumos de salud',
    icon: 'health', color: 'red',
  },
  '04': {
    codigo: '04', siglas: 'DIGESA', nombre: 'Direccion General de Salud Ambiental e Inocuidad Alimentaria',
    ministerio: 'Ministerio de Salud (MINSA)', web: 'https://www.digesa.minsa.gob.pe', vuce: true, telefono: '(01) 631-4430',
    tramite: 'Registro Sanitario de alimentos, bebidas, cosmeticos, articulos de higiene, juguetes y utiles de escritorio',
    pasos: [
      'Obtener Registro Sanitario o habilitacion sanitaria',
      'Registrarse en VUCE',
      'Solicitar tramite en VUCE -> DIGESA',
      'Adjuntar certificado de analisis, etiqueta y ficha tecnica',
      'Pago de tasa segun TUPA DIGESA',
    ],
    productos: 'Alimentos procesados, bebidas, cosmeticos, productos de higiene, juguetes y utiles',
    icon: 'food', color: 'orange',
  },
  '05': {
    codigo: '05', siglas: 'SENASA', nombre: 'Servicio Nacional de Sanidad Agraria',
    ministerio: 'Ministerio de Desarrollo Agrario y Riego (MIDAGRI)', web: 'https://www.senasa.gob.pe', vuce: true, telefono: '(01) 313-3300',
    tramite: 'Permiso Fitosanitario de Importacion / Autorizacion Zoosanitaria',
    pasos: [
      'Verificar requisitos fitosanitarios o zoosanitarios',
      'Registrarse en VUCE',
      'Solicitar PFI o Autorizacion Zoosanitaria en VUCE -> SENASA',
      'Adjuntar certificado fitosanitario o zoosanitario y factura proforma',
      'Pago de tasa segun TUPA SENASA',
      'Inspeccion al arribo',
    ],
    productos: 'Plantas, frutas, vegetales, semillas, granos, productos de origen animal y animales vivos',
    icon: 'agro', color: 'green',
  },
  '06': {
    codigo: '06', siglas: 'SERFOR', nombre: 'Servicio Nacional Forestal y de Fauna Silvestre',
    ministerio: 'Ministerio de Desarrollo Agrario y Riego (MIDAGRI)', web: 'https://www.serfor.gob.pe', vuce: true, telefono: '(01) 225-9005',
    tramite: 'Permiso CITES / Autorizacion de importacion de productos forestales y fauna silvestre',
    pasos: [
      'Verificar si el producto esta en listados CITES',
      'Solicitar permiso en VUCE -> SERFOR',
      'Adjuntar permiso CITES del pais de origen si aplica y factura',
      'Inspeccion al arribo',
    ],
    productos: 'Madera, productos forestales, fauna silvestre, especies CITES',
    icon: 'forest', color: 'green',
  },
  '07': {
    codigo: '07', siglas: 'MRREE', nombre: 'Ministerio de Relaciones Exteriores',
    ministerio: 'Ministerio de Relaciones Exteriores', web: 'https://www.gob.pe/rree', vuce: false, telefono: '(01) 204-2400',
    tramite: 'Autorizacion para bienes de uso diplomatico o sujetos a convenios internacionales',
    pasos: ['Coordinar directamente con la Cancilleria', 'Presentar solicitud segun convenio aplicable'],
    productos: 'Bienes diplomaticos y bajo convenios internacionales especificos',
    icon: 'diplomacy', color: 'blue',
  },
  '08': {
    codigo: '08', siglas: 'MTC', nombre: 'Ministerio de Transportes y Comunicaciones',
    ministerio: 'Ministerio de Transportes y Comunicaciones', web: 'https://www.gob.pe/mtc', vuce: true, telefono: '(01) 615-7800',
    tramite: 'Homologacion de equipos y aparatos de telecomunicaciones',
    pasos: [
      'Verificar si el equipo requiere homologacion',
      'Solicitar Certificado de Homologacion en VUCE -> MTC',
      'Adjuntar ficha tecnica, certificados del fabricante y fotos',
      'Pago de tasa segun TUPA MTC',
      'Pruebas de laboratorio si aplica',
    ],
    productos: 'Celulares, routers, equipos WiFi/Bluetooth, radios, antenas y equipos satelitales',
    icon: 'telecom', color: 'blue',
  },
  '11': {
    codigo: '11', siglas: 'PRODUCE-PESCA', nombre: 'Viceministerio de Pesca y Acuicultura',
    ministerio: 'Ministerio de la Produccion (PRODUCE)', web: 'https://www.gob.pe/produce', vuce: true, telefono: '(01) 616-2222',
    tramite: 'Autorizacion de importacion de productos pesqueros y acuicolas',
    pasos: [
      'Solicitar autorizacion en VUCE -> PRODUCE (Pesca)',
      'Adjuntar certificado sanitario y factura',
      'Inspeccion al arribo por SANIPES',
    ],
    productos: 'Productos pesqueros y acuicolas',
    icon: 'fishing', color: 'blue',
  },
  '12': {
    codigo: '12', siglas: 'MINCUL', nombre: 'Ministerio de Cultura',
    ministerio: 'Ministerio de Cultura', web: 'https://www.gob.pe/cultura', vuce: true, telefono: '(01) 618-9393',
    tramite: 'Autorizacion para importacion de bienes culturales y patrimonio',
    pasos: [
      'Solicitar certificado de no pertenecer al patrimonio cultural en VUCE -> MINCUL',
      'Adjuntar fotos, descripcion y certificado de procedencia',
    ],
    productos: 'Antiguedades, obras de arte, fosiles y bienes con valor cultural',
    icon: 'culture', color: 'purple',
  },
  '17': {
    codigo: '17', siglas: 'PRODUCE-DOPIF', nombre: 'Direccion de Ordenamiento Productivo e Industrial y Fiscalizacion',
    ministerio: 'Ministerio de la Produccion (PRODUCE)', web: 'https://www.gob.pe/produce', vuce: true, telefono: '(01) 616-2222',
    tramite: 'Autorizacion de importacion de insumos quimicos y bienes fiscalizados (IQBF)',
    pasos: [
      'Inscribirse en el Registro de IQBF de SUNAT',
      'Obtener Informe Tecnico favorable de PRODUCE',
      'Solicitar autorizacion en VUCE -> PRODUCE (DOPIF)',
      'Adjuntar certificado de usuario final, plan de uso y factura',
    ],
    productos: 'Acido sulfurico, acetona, tolueno, permanganato y otros precursores',
    icon: 'chemicals', color: 'red',
  },
  '18': {
    codigo: '18', siglas: 'PRODUCE-SAO', nombre: 'PRODUCE - Sustancias Agotadoras de la Capa de Ozono',
    ministerio: 'Ministerio de la Produccion (PRODUCE)', web: 'https://www.gob.pe/produce', vuce: true, telefono: '(01) 616-2222',
    tramite: 'Autorizacion para importacion de sustancias agotadoras del ozono (SAO)',
    pasos: [
      'Verificar cuota disponible',
      'Solicitar autorizacion en VUCE -> PRODUCE (SAO)',
      'Adjuntar factura, ficha tecnica y declaracion de uso',
    ],
    productos: 'Refrigerantes, halones y bromuro de metilo',
    icon: 'ozone', color: 'yellow',
  },
  '23': {
    codigo: '23', siglas: 'IPEN', nombre: 'Instituto Peruano de Energia Nuclear',
    ministerio: 'Ministerio de Energia y Minas', web: 'https://www.ipen.gob.pe', vuce: true, telefono: '(01) 488-1600',
    tramite: 'Autorizacion para importacion de materiales radiactivos y equipos con fuentes radiactivas',
    pasos: [
      'Solicitar licencia de operacion si no la tiene',
      'Solicitar autorizacion en VUCE -> IPEN',
      'Adjuntar licencia, ficha tecnica y certificado del fabricante',
      'Inspeccion especializada al arribo',
    ],
    productos: 'Materiales radiactivos, equipos de rayos X, fuentes selladas y detectores nucleares',
    icon: 'nuclear', color: 'red',
  },
  '28': {
    codigo: '28', siglas: 'SANIPES', nombre: 'Organismo Nacional de Sanidad Pesquera',
    ministerio: 'Ministerio de la Produccion (PRODUCE)', web: 'https://www.sanipes.gob.pe', vuce: true, telefono: '(01) 500-6900',
    tramite: 'Certificacion sanitaria de productos pesqueros y acuicolas',
    pasos: [
      'Solicitar habilitacion de establecimiento si aplica',
      'Solicitar certificado sanitario en VUCE -> SANIPES',
      'Inspeccion y muestreo al arribo',
    ],
    productos: 'Productos hidrobiologicos y acuicolas',
    icon: 'seafood', color: 'blue',
  },
  '30': {
    codigo: '30', siglas: 'SUNAT-IQBF', nombre: 'SUNAT - Intendencia Nacional de Insumos Quimicos y Bienes Fiscalizados',
    ministerio: 'SUNAT', web: 'https://www.sunat.gob.pe', vuce: false, telefono: '(01) 315-0730',
    tramite: 'Registro y control de usuarios de insumos quimicos y bienes fiscalizados',
    pasos: [
      'Inscribirse en el Registro de Usuarios de IQBF',
      'Mantener libro de registro de operaciones',
      'Declarar cada operacion de importacion',
      'Informar uso y destino final del producto',
    ],
    productos: 'Insumos quimicos fiscalizados',
    icon: 'control', color: 'gray',
  },
  '31': {
    codigo: '31', siglas: 'MINAM', nombre: 'Ministerio del Ambiente',
    ministerio: 'Ministerio del Ambiente', web: 'https://www.gob.pe/minam', vuce: true, telefono: '(01) 611-6000',
    tramite: 'Autorizacion para importacion de residuos, sustancias peligrosas y organismos vivos modificados',
    pasos: [
      'Solicitar autorizacion en VUCE -> MINAM',
      'Adjuntar ficha de seguridad y plan de manejo ambiental',
      'Evaluacion ambiental del producto',
    ],
    productos: 'Residuos peligrosos, sustancias quimicas peligrosas y OVMs',
    icon: 'environment', color: 'green',
  },
  '98': {
    codigo: '98', siglas: 'NO-PERMISO', nombre: 'No necesita permiso',
    ministerio: '-', web: '', vuce: false, telefono: '',
    tramite: 'Esta mercancia no requiere permisos especiales para su importacion',
    pasos: ['Continuar con la revision documental general'],
    productos: '',
    icon: 'info', color: 'green',
  },
};

function normalizarHs(value) {
  return String(value || '').replace(/\D/g, '');
}

function esRegimenImportacion(regimen) {
  const normalizado = String(regimen ?? '').trim().toUpperCase();
  return normalizado === '' || normalizado === 'I' || normalizado === '1';
}

function consultaPermisos(hs) {
  const hsNormalizado = normalizarHs(hs);
  const restriccionesRaw = nandinaService.getRestriccion(hsNormalizado);
  const restricciones = Array.isArray(restriccionesRaw) ? restriccionesRaw : [];
  const prohibida = nandinaService.isProhibida(hsNormalizado);

  const result = {
    hs: hsNormalizado,
    prohibida: prohibida ? { si: true, desc: prohibida.desc } : { si: false },
    restringida: false,
    permisos: [],
    resumen: '',
    totalEntidades: 0,
  };

  if (prohibida) {
    result.resumen = `Mercancia prohibida: ${prohibida.desc}. No se puede importar al Peru.`;
    return result;
  }

  if (!restricciones || restricciones.length === 0) {
    result.resumen = 'No se detectaron restricciones especiales para esta mercancia en la revision actual.';
    return result;
  }

  result.restringida = true;
  const entidadesVistas = new Set();

  restricciones.forEach((r) => {
    if (!esRegimenImportacion(r.regimen)) return;

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
      descripcionMrestri: r.desc || '',
    });
  });

  result.totalEntidades = result.permisos.length;

  if (result.permisos.length === 0) {
    result.restringida = false;
    result.resumen = 'No se detectaron restricciones de importacion para este regimen en la revision actual.';
  } else if (result.permisos.length === 1) {
    const permiso = result.permisos[0];
    result.resumen = `Requiere autorizacion de ${permiso.entidad} (${permiso.ministerio}). Tramite: ${permiso.tramite}.`;
  } else {
    const entidades = result.permisos.map((permiso) => permiso.entidad).join(', ');
    result.resumen = `Requiere ${result.permisos.length} autorizaciones: ${entidades}. Tramitar antes del embarque.`;
  }

  return result;
}

function infoEntidad(codigo) {
  const key = String(codigo ?? '').trim();
  return ENTIDADES[key] || null;
}

function listarEntidades() {
  return Object.values(ENTIDADES)
    .filter((entidad) => entidad.codigo !== '98')
    .map((entidad) => ({
      codigo: entidad.codigo,
      siglas: entidad.siglas,
      nombre: entidad.nombre,
      ministerio: entidad.ministerio,
      icon: entidad.icon,
      web: entidad.web,
      vuce: entidad.vuce,
    }));
}

module.exports = {
  consultaPermisos,
  infoEntidad,
  listarEntidades,
  ENTIDADES,
  _private: {
    normalizarHs,
    esRegimenImportacion,
  },
};
