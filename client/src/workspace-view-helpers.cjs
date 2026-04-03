const { normalizeDocumentReviewItems, toNumber } = require('./app-payload-helpers.cjs')

function hasValue(value) {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim() !== ''
  return true
}

function normalizeDraftConfidence(value) {
  if (!hasValue(value)) return null
  return Math.max(0, toNumber(value))
}

function normalizeDraftItemUnit(item) {
  const rawUnit = item?.unit ?? item?.precio_unitario ?? item?.precio
  return hasValue(rawUnit) ? toNumber(rawUnit) : null
}

function normalizeDocumentDraftItems(items) {
  const rawItems = Array.isArray(items)
    ? items.filter((item) => item && typeof item === 'object')
    : []

  return normalizeDocumentReviewItems(rawItems).map((item, index) => {
    const rawItem = rawItems[index]

    return {
      index: Number.isFinite(Number(item.index)) ? Number(item.index) : index + 1,
      desc: item.desc,
      qty: item.qty,
      unit: normalizeDraftItemUnit(rawItem ?? item)
    }
  })
}

function buildDocumentDraftView(documentDraft) {
  const items = normalizeDocumentDraftItems(documentDraft?.paraRevisar?.items)
  const confidence = normalizeDraftConfidence(documentDraft?.confianza)

  return {
    confidence,
    itemCount: items.length,
    items
  }
}

module.exports = {
  buildDocumentDraftView,
  normalizeDocumentDraftItems
}
