const { ADUANET } = require('./conectores-gobierno');
const { normalizarCodigoPais } = require('./paises');

const MAX_SUBPARTIDAS_DEFAULT = 3;

function normalizarPartida(value) {
  const clean = String(value || '').replace(/\D/g, '');
  return clean.length >= 8 ? clean.padEnd(10, '0').slice(0, 10) : '';
}

function dedupeItemsPorPartida(items, maxSubpartidas) {
  const seen = new Set();
  const collected = [];

  (items || []).forEach((item) => {
    const partida = normalizarPartida(item?.hs);
    if (!partida || seen.has(partida)) return;

    seen.add(partida);
    collected.push({
      partida,
      descripcion: item?.descOficial || item?.desc || item?.descripcion || '',
      item: item?.desc || item?.descripcion || '',
    });
  });

  return {
    totalDetectadas: collected.length,
    subpartidas: collected.slice(0, maxSubpartidas),
    truncado: collected.length > maxSubpartidas,
  };
}

function pickResumenTributos(gravamenes = {}) {
  const rows = [
    ['Ad Valorem', gravamenes.adValorem],
    ['ISC', gravamenes.isc],
    ['IGV', gravamenes.igv],
    ['IPM', gravamenes.ipm],
    ['Rodaje', gravamenes.rodaje],
    ['Antidumping', gravamenes.derechoAntidumping],
    ['Seguro', gravamenes.seguro],
  ];

  return rows
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([etiqueta, value]) => ({
      etiqueta,
      valor: typeof value === 'number' ? `${value}%` : String(value),
    }));
}

function normalizarTratamiento(tratamiento, entrada) {
  const convenio = tratamiento?.convenios?.mejorCoincidencia || null;
  const restriccionesItems = Array.isArray(tratamiento?.restricciones?.items)
    ? tratamiento.restricciones.items
    : [];
  const descripcionesMinimas = Array.isArray(tratamiento?.descripcionesMinimas)
    ? tratamiento.descripcionesMinimas
    : [];

  return {
    partida: entrada.partida,
    descripcion: entrada.descripcion || '',
    item: entrada.item || '',
    fuente: tratamiento?.fuente || 'ADUANET',
    oficialEnVivo: tratamiento?.oficialEnVivo !== false,
    actualizado: tratamiento?.actualizado || new Date().toISOString(),
    gravamenes: tratamiento?.gravamenes || {},
    resumenTributos: pickResumenTributos(tratamiento?.gravamenes),
    convenio: convenio
      ? {
        pais: convenio.pais,
        acuerdo: convenio.acuerdo,
        vigencia: convenio.vigencia,
        arancelBasePreferencial: convenio.arancelBasePreferencial,
        porcentajeLiberadoAdv: convenio.porcentajeLiberadoAdv,
        observacion: convenio.observacion,
      }
      : null,
    restricciones: {
      total: restriccionesItems.length,
      entidades: tratamiento?.restricciones?.entidades || [],
      items: restriccionesItems.slice(0, 5),
    },
    descripcionesMinimas,
    enlaces: tratamiento?.enlaces || {},
    error: tratamiento?.error || null,
  };
}

async function construirValidacionOficialImportacion({
  items,
  pais,
  maxSubpartidas = MAX_SUBPARTIDAS_DEFAULT,
  enabled = process.env.NODE_ENV !== 'test',
} = {}) {
  if (!enabled) return null;

  const dedupe = dedupeItemsPorPartida(items, maxSubpartidas);
  if (!dedupe.subpartidas.length) return null;

  const paisOrigen = normalizarCodigoPais(pais) || String(pais || '').trim().toUpperCase();

  try {
    const responses = await Promise.allSettled(
      dedupe.subpartidas.map(async (entrada) => {
        const tratamiento = await ADUANET.consultarTratamientoCompleto(entrada.partida, paisOrigen);
        return normalizarTratamiento(tratamiento, entrada);
      })
    );

    const subpartidas = responses
      .filter((response) => response.status === 'fulfilled')
      .map((response) => response.value)
      .filter(Boolean);

    if (!subpartidas.length) return null;

    return {
      fuente: 'ADUANET',
      paisOrigen,
      actualizado: new Date().toISOString(),
      subpartidas,
      totalDetectadas: dedupe.totalDetectadas,
      truncado: dedupe.truncado,
      resumen: {
        consultadas: subpartidas.length,
        conveniosDetectados: subpartidas.filter((subpartida) => Boolean(subpartida.convenio)).length,
        restriccionesDetectadas: subpartidas.reduce((count, subpartida) => count + (subpartida.restricciones?.total || 0), 0),
        conFuenteOficial: subpartidas.filter((subpartida) => subpartida.oficialEnVivo).length,
      },
    };
  } catch (error) {
    return {
      fuente: 'ADUANET',
      paisOrigen,
      actualizado: new Date().toISOString(),
      subpartidas: [],
      totalDetectadas: dedupe.totalDetectadas,
      truncado: dedupe.truncado,
      resumen: {
        consultadas: 0,
        conveniosDetectados: 0,
        restriccionesDetectadas: 0,
        conFuenteOficial: 0,
      },
      error: error.message,
    };
  }
}

module.exports = {
  MAX_SUBPARTIDAS_DEFAULT,
  construirValidacionOficialImportacion,
  _private: {
    dedupeItemsPorPartida,
    pickResumenTributos,
    normalizarTratamiento,
  },
};
