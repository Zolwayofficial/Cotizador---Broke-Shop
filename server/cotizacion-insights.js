function dedupePermisos(base = [], items = []) {
  const merged = [];
  const seen = new Map();

  function addPermiso(permiso, itemDesc) {
    if (!permiso?.entidad) return;
    const key = permiso.entidad;
    const current = seen.get(key);

    if (current) {
      if (itemDesc && !current.productosDetectados.includes(itemDesc)) {
        current.productosDetectados.push(itemDesc);
      }
      return;
    }

    const normalized = {
      entidad: permiso.entidad,
      nombre: permiso.nombre || permiso.entidad,
      ministerio: permiso.ministerio || '',
      icon: permiso.icon || 'info',
      color: permiso.color || 'orange',
      tramite: permiso.tramite || '',
      pasos: Array.isArray(permiso.pasos) ? [...permiso.pasos] : [],
      web: permiso.web || '',
      vuce: Boolean(permiso.vuce),
      telefono: permiso.telefono || '',
      productos: permiso.productos || '',
      descripcionMrestri: permiso.descripcionMrestri || '',
      productosDetectados: itemDesc ? [itemDesc] : [],
    };

    merged.push(normalized);
    seen.set(key, normalized);
  }

  base.forEach((permiso) => addPermiso(permiso));

  items.forEach((item) => {
    const itemDesc = item?.desc || item?.descripcion || item?.producto || '';
    const permisos = item?.permisos?.permisos || [];
    permisos.forEach((permiso) => addPermiso(permiso, itemDesc));
  });

  return merged;
}

function generarRecomendacionesResultado({ pais, canal, incoterm, resultado }) {
  const recomendaciones = [];
  const seen = new Set();

  function push(recomendacion) {
    const key = `${recomendacion.tipo}:${recomendacion.titulo}`;
    if (seen.has(key)) return;
    seen.add(key);
    recomendaciones.push(recomendacion);
  }

  if (resultado?.permisos?.length) {
    push({
      tipo: 'permisos',
      nivel: 'critico',
      titulo: 'Permisos antes del embarque',
      mensaje: `Esta operacion requiere ${resultado.permisos.length} permiso(s) o revision(es) previas.`,
      accion: 'Revisa VUCE y tramita cada autorizacion antes de embarcar.',
    });
  }

  const tlcItem = resultado?.items?.find((item) => item?.tlc && item?.ahorroTLC > 0);
  if (tlcItem) {
    push({
      tipo: 'tlc',
      nivel: 'alto',
      titulo: 'Aprovecha el TLC',
      mensaje: `El producto "${tlcItem.desc}" puede aprovechar preferencias arancelarias desde ${pais}.`,
      accion: 'Solicita el Certificado de Origen para aplicar el beneficio.',
    });
  }

  if (resultado?.precision?.componentes?.flete?.referencial) {
    push({
      tipo: 'flete',
      nivel: 'medio',
      titulo: 'Cierra el flete real',
      mensaje: 'El flete aun es estimado o referencial.',
      accion: 'Ingresa una tarifa real de courier/naviera o una cotizacion contractual.',
    });
  }

  if (resultado?.precision?.componentes?.seguro?.referencial) {
    push({
      tipo: 'seguro',
      nivel: 'medio',
      titulo: 'Revisa el seguro',
      mensaje: 'El seguro todavia no viene de una poliza o valor comercial real.',
      accion: 'Ingresa el seguro real del proveedor o de tu corredor.',
    });
  }

  if (resultado?.precision?.componentes?.incoterm?.referencial) {
    push({
      tipo: 'incoterm',
      nivel: 'alto',
      titulo: 'Pide desglose FOB',
      mensaje: `El incoterm ${incoterm || 'actual'} requirio estimaciones para desarmar el CIF.`,
      accion: 'Pide al proveedor una cotizacion FOB o un desglose real de flete y seguro.',
    });
  }

  if (resultado?.alertas?.some((alerta) => alerta.tipo === 'antidumping')) {
    push({
      tipo: 'antidumping',
      nivel: 'alto',
      titulo: 'Verifica antidumping aplicable',
      mensaje: 'El producto quedo alcanzado por medidas antidumping.',
      accion: 'Revisa la resolucion de INDECOPI y valora el impacto antes de cerrar la compra.',
    });
  }

  if (resultado?.alertas?.some((alerta) => alerta.tipo === 'duda_razonable')) {
    push({
      tipo: 'valoracion',
      nivel: 'alto',
      titulo: 'Prepara sustento de valor',
      mensaje: 'SUNAT podria cuestionar el valor declarado.',
      accion: 'Reune contrato, cotizaciones comparativas, comprobantes y lista de precios del proveedor.',
    });
  }

  if ((canal || '').toUpperCase() === 'COURIER') {
    push({
      tipo: 'canal',
      nivel: 'info',
      titulo: 'Revisa limites de courier',
      mensaje: 'El canal courier simplifica la operacion, pero no siempre es el mas eficiente para volumenes altos.',
      accion: 'Compara con importacion definitiva si el peso o el valor siguen creciendo.',
    });
  }

  if (resultado?.totales?.margenVenta?.margenPct < 20) {
    push({
      tipo: 'margen',
      nivel: 'medio',
      titulo: 'Margen apretado',
      mensaje: `El margen de venta proyectado es ${resultado.totales.margenVenta.margenPct}%.`,
      accion: 'Negocia mejor costo o revisa el precio final antes de cerrar el negocio.',
    });
  }

  if ((pais || '').toUpperCase() === 'CN') {
    push({
      tipo: 'origen',
      nivel: 'info',
      titulo: 'Compra desde China',
      mensaje: 'China suele tener buen precio, pero el transito y las medidas comerciales requieren mas control.',
      accion: 'Revisa tiempos, antidumping y documentacion del proveedor antes del embarque.',
    });
  }

  if (recomendaciones.length === 0) {
    push({
      tipo: 'general',
      nivel: 'info',
      titulo: 'Operacion limpia',
      mensaje: 'No se detectaron observaciones criticas adicionales para esta cotizacion.',
      accion: 'Revisa la documentacion comercial y el cronograma de embarque.',
    });
  }

  return recomendaciones;
}

module.exports = {
  dedupePermisos,
  generarRecomendacionesResultado,
};
