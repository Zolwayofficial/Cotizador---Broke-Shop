const OBJECTIVE_LABELS = {
  costo_importacion: 'Solo costo de importacion',
  precio_sugerido: 'Costo + precio de venta sugerido',
  cotizacion_cliente: 'Cotizacion completa para cliente',
};

const INSURANCE_MODE_LABELS = {
  REAL: 'Seguro real informado',
  TABLA: 'Seguro de tabla',
  ESTIMADO: 'Seguro estimado',
};

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatUsd(value) {
  return `USD ${toNumber(value).toFixed(2)}`;
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'number' ? `${value}%` : String(value);
}

function inferirRegimenImportacion({ canal, fobTotal }) {
  const normalizedChannel = String(canal || 'MARITIMO').toUpperCase();
  const total = toNumber(fobTotal);

  if (normalizedChannel === 'POSTAL' && total <= 200) {
    return {
      codigo: 'postal_franquicia',
      titulo: 'Postal / franquicia',
      detalle: 'Envio postal de bajo valor. Usualmente se revisa bajo franquicia y control simplificado.',
      umbral: 'Hasta USD 200 FOB',
      validarEnSunat: true,
    };
  }

  if (normalizedChannel === 'POSTAL' && total <= 2000) {
    return {
      codigo: 'postal_importa_facil',
      titulo: 'Postal / Importa Facil',
      detalle: 'Envio postal simplificado. Conviene validar topes y operativa vigente con Serpost y SUNAT.',
      umbral: 'Hasta USD 2,000 FOB',
      validarEnSunat: true,
    };
  }

  if (normalizedChannel === 'POSTAL') {
    return {
      codigo: 'postal_mayor_valor',
      titulo: 'Postal fuera de tramo simplificado',
      detalle: 'El valor supera el tramo postal simple. Puede requerir manejo mas formal o revisiones adicionales.',
      umbral: 'Mayor a USD 2,000 FOB',
      validarEnSunat: true,
    };
  }

  if (normalizedChannel === 'COURIER' && total <= 2000) {
    return {
      codigo: 'courier_express',
      titulo: 'Courier express',
      detalle: 'Operacion courier con trazabilidad privada. Puede resolverse por un esquema simplificado segun valor y operador.',
      umbral: 'Hasta USD 2,000 FOB',
      validarEnSunat: true,
    };
  }

  if (normalizedChannel === 'COURIER') {
    return {
      codigo: 'courier_mayor_valor',
      titulo: 'Courier de mayor valor',
      detalle: 'La carga viaja por courier, pero el valor exige revisar costos, restricciones y tratamiento operativo con mas detalle.',
      umbral: 'Mayor a USD 2,000 FOB',
      validarEnSunat: true,
    };
  }

  if (normalizedChannel === 'AEREO') {
    return {
      codigo: 'importacion_consumo_aerea',
      titulo: 'Importacion formal aerea',
      detalle: 'Importacion para consumo por via aerea. Conviene revisar tiempos, costos de almacen y documentacion comercial.',
      umbral: 'Sin tope simplificado',
      validarEnSunat: true,
    };
  }

  return {
    codigo: 'importacion_consumo_maritima',
    titulo: 'Importacion formal maritima',
    detalle: 'Importacion para consumo por via maritima. Requiere control documental y logistica mas estructurada.',
    umbral: 'Sin tope simplificado',
    validarEnSunat: true,
  };
}

function construirChecklistDocumental({ tipoSujeto, proveedor, incoterm, regimen, permisos }) {
  const checklist = [
    {
      titulo: 'Factura comercial o cotizacion del proveedor',
      detalle: proveedor
        ? `Proveedor capturado: ${proveedor}.`
        : 'Confirma que la factura, proforma o cotizacion este completa y consistente.',
      obligatorio: true,
      fuente: 'documental',
    },
    {
      titulo: 'Packing list / detalle de bultos',
      detalle: 'Ayuda a validar peso, cantidades, presentacion y consistencia logistica.',
      obligatorio: regimen.codigo !== 'postal_franquicia',
      fuente: 'documental',
    },
    {
      titulo: 'Sustento del incoterm',
      detalle: `Confirma que ${incoterm || 'FOB'} este respaldado en la cotizacion del proveedor.`,
      obligatorio: true,
      fuente: 'documental',
    },
    {
      titulo: tipoSujeto === 'persona_natural' ? 'Documento personal del importador' : 'RUC y datos de empresa importadora',
      detalle: tipoSujeto === 'persona_natural'
        ? 'Valida identidad, direccion y trazabilidad del destinatario.'
        : 'Valida razon social, RUC y condiciones del importador.',
      obligatorio: true,
      fuente: 'documental',
    },
  ];

  if (Array.isArray(permisos) && permisos.length > 0) {
    permisos.forEach((permiso) => {
      checklist.push({
        titulo: `Permiso sectorial: ${permiso.entidad} - ${permiso.nombre}`,
        detalle: permiso.tramite || 'Revisa el tramite sectorial antes del embarque.',
        obligatorio: true,
        fuente: permiso.vuce ? 'vuce' : 'sectorial',
      });
    });
  }

  if (regimen.codigo.startsWith('postal')) {
    checklist.push({
      titulo: 'Comprobante de envio postal',
      detalle: 'Conserva tracking, declaracion del operador postal y respaldo de valor.',
      obligatorio: true,
      fuente: 'postal',
    });
  }

  if (regimen.codigo.startsWith('courier')) {
    checklist.push({
      titulo: 'Guia courier y detalle del operador',
      detalle: 'Confirma courier, tracking y desglose de cargos del operador express.',
      obligatorio: true,
      fuente: 'courier',
    });
  }

  return checklist;
}

function construirBaseTributaria({ totales, trazabilidad, resultado }) {
  const validacionOficial = resultado?.validacionOficial;
  const subpartidasOficiales = Array.isArray(validacionOficial?.subpartidas)
    ? validacionOficial.subpartidas
    : [];
  const conFuenteOficial = subpartidasOficiales.filter((subpartida) => subpartida?.oficialEnVivo).length;
  const tipoCambio = resultado?.tipoCambio;
  const base = [
    {
      concepto: 'Valor FOB',
      valor: formatUsd(totales.fob),
      detalle: 'Base comercial de la mercaderia antes de flete y seguro.',
    },
    {
      concepto: 'Flete internacional',
      valor: formatUsd(totales.flete),
      detalle: trazabilidad?.flete?.estado === 'real'
        ? 'Valor informado o extraido con soporte.'
        : 'Valor estimado o referencial.',
    },
    {
      concepto: 'Seguro',
      valor: formatUsd(totales.seguro),
      detalle: trazabilidad?.seguro?.fuente === 'seguro_tabla'
        ? 'Calculado con seguro de tabla.'
        : (
          trazabilidad?.seguro?.estado === 'real'
            ? 'Seguro informado por el usuario o por el documento.'
            : 'Seguro estimado con tasa interna.'
        ),
    },
    {
      concepto: 'Valor en aduana / CIF',
      valor: formatUsd(totales.cif),
      detalle: 'Base clasica de valoracion aduanera: FOB + flete + seguro.',
    },
    {
      concepto: 'Total tributos',
      valor: formatUsd(totales.totalTributos),
      detalle: 'Suma de Ad Valorem, ISC, IGV, IPM, percepcion y antidumping cuando aplique.',
    },
  ];

  if (subpartidasOficiales.length > 0) {
    base.push({
      concepto: 'Fuente tributaria oficial',
      valor: `${subpartidasOficiales.length} subpartida(s) consultadas`,
      detalle: conFuenteOficial > 0
        ? 'El desglose IGV/IPM/ISC, convenios y restricciones puede variar por subpartida y pais. Usa el bloque de validacion oficial en vivo como referencia vigente.'
        : 'La consulta oficial no respondio en vivo para esta corrida; conviene contrastar el desglose tributario y convenios en ADUANET/SUNAT antes de cerrar.',
    });
  }

  if (tipoCambio?.tasa) {
    let detalle = 'Se aplico el tipo de cambio operativo resuelto por el sistema.';

    if (tipoCambio.estado === 'manual_usuario') {
      const ref = tipoCambio.referenciaSunat;
      const diff = tipoCambio.diferencialVsSunat;
      detalle = ref?.venta
        ? `TC manual del usuario. Referencia SUNAT venta ${ref.venta.toFixed(4)}${diff ? ` (${diff.porcentaje >= 0 ? '+' : ''}${diff.porcentaje}% vs SUNAT)` : ''}.`
        : 'TC manual del usuario sin referencia SUNAT disponible en esta corrida.';
    } else if (tipoCambio.estado === 'oficial_en_vivo') {
      detalle = `TC validado con SUNAT en vivo. Compra ${toNumber(tipoCambio.referenciaSunat?.compra).toFixed(4)} / venta ${toNumber(tipoCambio.referenciaSunat?.venta).toFixed(4)}.`;
    } else if (tipoCambio.estado === 'fallback') {
      detalle = 'No hubo respuesta SUNAT en vivo; se uso un TC de respaldo operativo.';
    }

    base.push({
      concepto: 'Tipo de cambio operativo',
      valor: `PEN ${toNumber(tipoCambio.tasa).toFixed(4)} por USD`,
      detalle,
    });
  }

  if (totales.totalPEN) {
    base.push({
      concepto: 'Total referencial en PEN',
      valor: `PEN ${toNumber(totales.totalPEN).toFixed(2)}`,
      detalle: 'Se calcula con el tipo de cambio operativo aplicado en esta corrida.',
    });
  }

  if (resultado?.modo) {
    base.push({
      concepto: 'Modo de calculo',
      valor: resultado.modo,
      detalle: 'Resume el camino tributario y operativo usado por el motor.',
    });
  }

  return base;
}

function construirAlertasValoracion({ items, trazabilidad, regimen }) {
  const alertas = [];
  const riskItems = (items || []).filter((item) =>
    (item.advertencia)
    || item.prohibida
    || item.antidumpingInfo
    || item.tributos?.percTipo?.includes('5%')
  );

  if (trazabilidad?.flete?.estado !== 'real') {
    alertas.push({
      titulo: 'Flete no sustentado',
      detalle: 'Si consigues una tarifa real del operador, la cotizacion mejora bastante su precision.',
      nivel: 'medio',
    });
  }

  if (trazabilidad?.seguro?.estado !== 'real') {
    alertas.push({
      titulo: 'Seguro no sustentado',
      detalle: 'El valor del seguro no vino con soporte directo; conviene validar si el proveedor o el operador lo entrega.',
      nivel: 'medio',
    });
  }

  if (riskItems.some((item) => item.antidumpingInfo)) {
    alertas.push({
      titulo: 'Producto sensible por antidumping',
      detalle: 'Hay partidas con medidas INDECOPI o riesgo de cargos adicionales. Revisa la resolucion vigente.',
      nivel: 'alto',
    });
  }

  if (riskItems.some((item) => item.prohibida)) {
    alertas.push({
      titulo: 'Mercaderia prohibida o critica',
      detalle: 'Al menos un item cae en una zona prohibida o requiere una revision fuerte antes de continuar.',
      nivel: 'critico',
    });
  }

  if (regimen.codigo === 'postal_franquicia') {
    alertas.push({
      titulo: 'Validar tramo postal vigente',
      detalle: 'El tramo postal de bajo valor es sensible a reglas operativas del operador y de SUNAT.',
      nivel: 'medio',
    });
  }

  return alertas;
}

function construirNotasOperativas({ objetivoCalculo, tipoSujeto, regimen, totales, permisos }) {
  const notes = [
    {
      titulo: 'Objetivo del calculo',
      detalle: OBJECTIVE_LABELS[objetivoCalculo] || OBJECTIVE_LABELS.precio_sugerido,
    },
    {
      titulo: 'Perfil del importador',
      detalle: tipoSujeto === 'persona_natural'
        ? 'Se trata como persona natural, asi que conviene validar limites, sustento de valor y documentacion personal.'
        : 'Se trata como empresa, asi que conviene validar RUC, razon social y trazabilidad documental.',
    },
    {
      titulo: 'Escenario operativo',
      detalle: `${regimen.titulo}. ${regimen.detalle}`,
    },
  ];

  if (Array.isArray(permisos) && permisos.length > 0) {
    notes.push({
      titulo: 'Tramites previos',
      detalle: 'Hay permisos sectoriales detectados. Lo ideal es resolverlos antes del embarque o de la llegada de la mercaderia.',
    });
  }

  if (toNumber(totales.totalReal) > 0) {
    notes.push({
      titulo: 'Costo total de importacion',
      detalle: `El costo consolidado actual es ${formatUsd(totales.totalReal)} incluyendo operativos.`,
    });
  }

  return notes;
}

function construirValidacionOficial(validacionOficial) {
  const subpartidas = Array.isArray(validacionOficial?.subpartidas)
    ? validacionOficial.subpartidas
    : [];

  if (!subpartidas.length) return null;

  return {
    fuente: validacionOficial.fuente || 'ADUANET',
    actualizado: validacionOficial.actualizado || null,
    truncado: Boolean(validacionOficial.truncado),
    totalDetectadas: validacionOficial.totalDetectadas || subpartidas.length,
    resumen: validacionOficial.resumen || {
      consultadas: subpartidas.length,
      conveniosDetectados: subpartidas.filter((subpartida) => Boolean(subpartida.convenio)).length,
      restriccionesDetectadas: subpartidas.reduce((count, subpartida) => count + (subpartida.restricciones?.total || 0), 0),
      conFuenteOficial: subpartidas.filter((subpartida) => subpartida.oficialEnVivo).length,
    },
    subpartidas: subpartidas.map((subpartida) => {
      const gravamenes = subpartida.gravamenes || {};
      const resumenTributos = Array.isArray(subpartida.resumenTributos) && subpartida.resumenTributos.length
        ? subpartida.resumenTributos
        : [
          { etiqueta: 'Ad Valorem', valor: formatPercent(gravamenes.adValorem) },
          { etiqueta: 'IGV', valor: formatPercent(gravamenes.igv) },
          { etiqueta: 'IPM', valor: formatPercent(gravamenes.ipm) },
          { etiqueta: 'ISC', valor: formatPercent(gravamenes.isc) },
          { etiqueta: 'Antidumping', valor: formatPercent(gravamenes.derechoAntidumping) },
          { etiqueta: 'Seguro', valor: formatPercent(gravamenes.seguro) },
        ].filter((row) => row.valor);

      return {
        partida: subpartida.partida,
        descripcion: subpartida.descripcion || subpartida.item || '',
        tipoProducto: gravamenes.tipoProducto || null,
        resumenTributos,
        convenio: subpartida.convenio
          ? {
            pais: subpartida.convenio.pais,
            acuerdo: subpartida.convenio.acuerdo,
            vigencia: subpartida.convenio.vigencia,
            arancelBasePreferencial: subpartida.convenio.arancelBasePreferencial,
            porcentajeLiberadoAdv: subpartida.convenio.porcentajeLiberadoAdv,
            observacion: subpartida.convenio.observacion,
          }
          : null,
        restricciones: {
          total: subpartida.restricciones?.total || 0,
          entidades: subpartida.restricciones?.entidades || [],
          items: subpartida.restricciones?.items || [],
        },
        descripcionesMinimas: subpartida.descripcionesMinimas || [],
        enlaces: subpartida.enlaces || {},
        fuente: subpartida.fuente || validacionOficial.fuente || 'ADUANET',
        actualizado: subpartida.actualizado || validacionOficial.actualizado || null,
        oficialEnVivo: subpartida.oficialEnVivo !== false,
        error: subpartida.error || null,
      };
    }),
  };
}

function buildImportProfile({
  canal,
  tipoSujeto,
  tipoImportador,
  objetivoCalculo,
  proveedor,
  incoterm,
  trazabilidad,
  permisos,
  resultado,
  seguroModo,
}) {
  const totales = resultado?.totales || {};
  const regimen = inferirRegimenImportacion({
    canal,
    fobTotal: totales.fob,
  });

  return {
    objetivo: {
      codigo: objetivoCalculo || 'precio_sugerido',
      etiqueta: OBJECTIVE_LABELS[objetivoCalculo] || OBJECTIVE_LABELS.precio_sugerido,
    },
    seguro: {
      modo: seguroModo || 'ESTIMADO',
      etiqueta: INSURANCE_MODE_LABELS[seguroModo] || INSURANCE_MODE_LABELS.ESTIMADO,
    },
    perfilImportador: {
      tipoSujeto: tipoSujeto || 'empresa',
      tipoImportador: tipoImportador || 'general',
    },
    regimen,
    checklistDocumental: construirChecklistDocumental({
      tipoSujeto,
      proveedor,
      incoterm,
      regimen,
      permisos,
    }),
    baseTributaria: construirBaseTributaria({
      totales,
      trazabilidad,
      resultado,
    }),
    alertasValoracion: construirAlertasValoracion({
      items: resultado?.items,
      trazabilidad,
      regimen,
    }),
    validacionOficial: construirValidacionOficial(resultado?.validacionOficial),
    notasOperativas: construirNotasOperativas({
      objetivoCalculo,
      tipoSujeto,
      regimen,
      totales,
      permisos,
    }),
  };
}

module.exports = {
  OBJECTIVE_LABELS,
  INSURANCE_MODE_LABELS,
  inferirRegimenImportacion,
  buildImportProfile,
};
