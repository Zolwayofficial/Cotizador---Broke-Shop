function normalizeText(value) {
  return String(value ?? '').trim();
}

function hasValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return normalizeText(value) !== '';
  return true;
}

function parseOptionalNumber(value, toNumber) {
  if (!hasValue(value)) return null;
  const parsed = typeof toNumber === 'function' ? toNumber(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalBoolean(value) {
  if (!hasValue(value)) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  if (typeof value === 'string') {
    const normalized = normalizeText(value).toLowerCase();
    if (!normalized) return null;
    if (['true', '1', 'si', 'sí', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }

  return Boolean(value);
}

function buildProductSummary(productos = [], toNumber) {
  const items = Array.isArray(productos) ? productos : [];
  if (!items.length) return 'Aun no definidos';

  return items
    .map((producto, index) => {
      const quantitySource = producto?.cantidad ?? producto?.qty ?? 1;
      const quantity = parseOptionalNumber(quantitySource, toNumber);
      const description =
        normalizeText(producto?.descripcion) ||
        normalizeText(producto?.producto) ||
        `Producto ${index + 1}`;

      return `${quantity ?? 1} x ${description}`;
    })
    .join(', ');
}

function buildWorkspaceSummaryRows(contexto, options = {}) {
  const datos = contexto?.datos_previos || {};
  const {
    toNumber,
    formatMoney,
    channelLabels = {},
    objectiveLabels = {},
    subjectLabels = {},
    insuranceModeLabels = {},
    importerLabels = {},
    productConditionLabels = {},
  } = options;

  const precioUnitario = parseOptionalNumber(datos.precio_unitario, toNumber);
  const margenVenta = parseOptionalNumber(datos.margen_venta, toNumber);
  const bienUsado = parseOptionalBoolean(datos.bien_usado);

  return [
    {
      label: 'Productos',
      value: buildProductSummary(datos.productos, toNumber),
    },
    {
      label: 'Pais de origen',
      value: normalizeText(datos.pais_origen) || 'Pendiente',
    },
    {
      label: 'Canal',
      value: channelLabels[datos.canal] || 'Pendiente',
    },
    {
      label: 'Objetivo',
      value: objectiveLabels[datos.objetivo_calculo] || 'Pendiente',
    },
    {
      label: 'Tipo de sujeto',
      value: subjectLabels[datos.tipo_sujeto] || 'Pendiente',
    },
    {
      label: 'Precio unitario',
      value: precioUnitario === null ? 'Pendiente' : formatMoney(precioUnitario),
    },
    {
      label: 'Incoterm',
      value: normalizeText(datos.incoterm) || 'Pendiente',
    },
    {
      label: 'Seguro',
      value: insuranceModeLabels[datos.seguro_modo] || 'Pendiente',
    },
    {
      label: 'Tipo de importador',
      value: importerLabels[datos.tipo_importador] || 'Pendiente',
    },
    {
      label: 'Condicion del producto',
      value:
        bienUsado === null
          ? 'Pendiente'
          : bienUsado
            ? productConditionLabels.usado
            : productConditionLabels.nuevo,
    },
    {
      label: 'Margen objetivo',
      value:
        datos.objetivo_calculo === 'costo_importacion'
          ? 'No aplica en este modo'
          : margenVenta === null
            ? 'Pendiente'
            : `${margenVenta}%`,
    },
  ];
}

module.exports = {
  buildProductSummary,
  buildWorkspaceSummaryRows,
  parseOptionalBoolean,
  parseOptionalNumber,
};
