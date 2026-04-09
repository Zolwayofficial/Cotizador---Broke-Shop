function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === 'string') {
    const compact = value.trim().replace(/\s+/g, '')
    const lastComma = compact.lastIndexOf(',')
    const lastDot = compact.lastIndexOf('.')
    let normalized = compact

    if (lastComma >= 0 && lastDot >= 0) {
      normalized = lastComma > lastDot
        ? compact.replace(/\./g, '').replace(',', '.')
        : compact.replace(/,/g, '')
    } else if (lastComma >= 0) {
      normalized = /^\d{1,3}(,\d{3})+$/.test(compact)
        ? compact.replace(/,/g, '')
        : compact.replace(',', '.')
    } else if (lastDot >= 0) {
      normalized = /^\d{1,3}(\.\d{3})+$/.test(compact)
        ? compact.replace(/\./g, '')
        : compact
    }

    if (!normalized) return 0
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : 0
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return false
    if (['true', '1', 'si', 's\u00ed', 'yes', 'y'].includes(normalized)) return true
    if (['false', '0', 'no', 'n'].includes(normalized)) return false
  }

  return Boolean(value)
}

function ensureQuantity(value) {
  const quantity = Math.trunc(toNumber(value))
  return quantity >= 1 ? quantity : 1
}

function arrayOfItems(value) {
  return Array.isArray(value) ? value : []
}

function normalizeDocumentReviewItems(items) {
  return arrayOfItems(items)
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => ({
      desc: String(item.desc || item.descripcion || item.producto || '').trim() || `Producto ${index + 1}`,
      qty: ensureQuantity(item.qty ?? item.cantidad ?? 1),
      unit: toNumber(item.unit ?? item.precio_unitario ?? item.precio ?? 0),
      pesoKg: item.pesoKg != null ? toNumber(item.pesoKg) : undefined,
      bienUsado: toBoolean(item.bienUsado ?? item.bien_usado)
    }))
}

function truncateText(value, maxLength = 96) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  if (text.length <= maxLength) return text

  const clipped = text.slice(0, maxLength + 1)
  const lastSpace = clipped.lastIndexOf(' ')
  const safeBase = lastSpace >= Math.floor(maxLength * 0.6)
    ? clipped.slice(0, lastSpace)
    : clipped.slice(0, maxLength)

  return `${safeBase.trim()}...`
}

function buildCalculationPayload(contexto) {
  const datos = contexto?.datos_previos || {}
  const productos = arrayOfItems(datos.productos)
  const bienUsado = toBoolean(datos.bien_usado)
  const objetivoCalculo = datos.objetivo_calculo || 'precio_sugerido'
  const seguroModo = datos.seguro_modo || (toNumber(datos.seguro) > 0 ? 'REAL' : 'ESTIMADO')
  const precioUnitarioGlobal = toNumber(datos.precio_unitario)
  const hsCode = datos.partida_arancelaria || null

  return {
    items: productos.map((producto, index) => ({
      desc: producto.descripcion || producto.producto || `Producto ${index + 1}`,
      qty: ensureQuantity(producto.cantidad ?? producto.qty ?? 1),
      unit: toNumber(producto.unit ?? producto.precio_unitario ?? precioUnitarioGlobal),
      bienUsado,
      ...(hsCode ? { hs: hsCode } : {})
    })),
    pais: datos.pais_origen || '',
    canal: datos.canal || 'MARITIMO',
    incoterm: datos.incoterm || 'FOB',
    flete: toNumber(datos.flete),
    seguro: seguroModo === 'REAL' ? toNumber(datos.seguro) : 0,
    tc: toNumber(datos.tipo_cambio),
    proveedor: datos.proveedor || '',
    moneda: 'USD',
    tipoSujeto: datos.tipo_sujeto || 'empresa',
    tipoImportador: datos.tipo_importador || 'general',
    objetivoCalculo,
    seguroModo,
    margenVenta: objetivoCalculo === 'costo_importacion' ? 0 : toNumber(datos.margen_venta ?? 30)
  }
}

function buildDocumentDraftForm(extraction) {
  const review = extraction?.paraRevisar || {}
  const reviewItems = arrayOfItems(review.items)

  return {
    proveedor: review.proveedor || '',
    pais: review.pais || '',
    moneda: review.moneda || 'USD',
    incoterm: review.incoterm || 'FOB',
    canal: 'MARITIMO',
    flete: review.flete ?? '',
    seguro: review.seguro ?? '',
    seguroModo: toNumber(review.seguro) > 0 ? 'REAL' : 'ESTIMADO',
    tc: '',
    tipoSujeto: 'empresa',
    tipoImportador: 'general',
    objetivoCalculo: 'precio_sugerido',
    condicionProducto: reviewItems.some((item) => toBoolean(item?.bienUsado)) ? 'usado' : 'nuevo',
    margenVenta: 30
  }
}

function buildDocumentCalculationPayload(extraction, form) {
  const review = extraction?.paraRevisar || {}
  const reviewItems = normalizeDocumentReviewItems(review.items)

  return {
    items: reviewItems.map((item) => ({
      desc: item.desc,
      qty: item.qty,
      unit: item.unit,
      pesoKg: item.pesoKg,
      bienUsado: form?.condicionProducto === 'usado'
    })),
    pais: form?.pais || review.pais || '',
    canal: form?.canal || 'MARITIMO',
    incoterm: form?.incoterm || review.incoterm || 'FOB',
    flete: toNumber(form?.flete),
    seguro: form?.seguroModo === 'REAL' ? toNumber(form?.seguro) : 0,
    tc: toNumber(form?.tc),
    proveedor: form?.proveedor || review.proveedor || '',
    moneda: form?.moneda || review.moneda || 'USD',
    tipoSujeto: form?.tipoSujeto || 'empresa',
    tipoImportador: form?.tipoImportador || 'general',
    objetivoCalculo: form?.objetivoCalculo || 'precio_sugerido',
    seguroModo: form?.seguroModo || (toNumber(form?.seguro) > 0 ? 'REAL' : 'ESTIMADO'),
    margenVenta: form?.objetivoCalculo === 'costo_importacion' ? 0 : toNumber(form?.margenVenta ?? 30)
  }
}

module.exports = {
  buildCalculationPayload,
  buildDocumentCalculationPayload,
  buildDocumentDraftForm,
  normalizeDocumentReviewItems,
  toNumber,
  truncateText
}
