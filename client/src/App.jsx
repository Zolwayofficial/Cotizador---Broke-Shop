import { useEffect, useRef, useState } from 'react'
import axios from 'axios'

const API_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')

const AUTH_STORAGE_KEY = 'broke-shop-session-token'

const CHANNEL_LABELS = {
  MARITIMO: 'Maritimo formal',
  AEREO: 'Aereo formal',
  COURIER: 'Courier express',
  POSTAL: 'Postal'
}

const SUBJECT_LABELS = {
  empresa: 'Empresa',
  persona_natural: 'Persona natural'
}

const IMPORTER_LABELS = {
  general: 'Importador general',
  nuevo: 'Nuevo importador',
  buen_contribuyente: 'Buen contribuyente'
}

const PRODUCT_CONDITION_LABELS = {
  nuevo: 'Producto nuevo',
  usado: 'Producto usado'
}

const OBJECTIVE_LABELS = {
  costo_importacion: 'Solo costo de importacion',
  precio_sugerido: 'Costo + precio de venta sugerido',
  cotizacion_cliente: 'Cotizacion completa para cliente'
}

const INSURANCE_MODE_LABELS = {
  REAL: 'Seguro real',
  TABLA: 'Seguro de tabla',
  ESTIMADO: 'Seguro estimado'
}

const SUBJECT_OPTIONS = [
  { value: 'empresa', label: 'Empresa' },
  { value: 'persona_natural', label: 'Persona natural' }
]

const OBJECTIVE_OPTIONS = [
  { value: 'costo_importacion', label: OBJECTIVE_LABELS.costo_importacion },
  { value: 'precio_sugerido', label: OBJECTIVE_LABELS.precio_sugerido },
  { value: 'cotizacion_cliente', label: OBJECTIVE_LABELS.cotizacion_cliente }
]

const INSURANCE_MODE_OPTIONS = [
  { value: 'ESTIMADO', label: INSURANCE_MODE_LABELS.ESTIMADO },
  { value: 'TABLA', label: INSURANCE_MODE_LABELS.TABLA },
  { value: 'REAL', label: INSURANCE_MODE_LABELS.REAL }
]

const MEMBERSHIP_LABELS = {
  GRATIS: 'Miembro',
  PREMIUM: 'Premium',
  VIP: 'VIP'
}

const ROLE_LABELS = {
  admin: 'Administrador',
  user: 'Miembro'
}

const PRECISION_LABELS = {
  exacta: 'Exacta',
  alta: 'Alta',
  referencial: 'Referencial',
  requiere_revision: 'Requiere revision'
}

const COMPONENT_STATUS_LABELS = {
  exacto: 'Exacto',
  alta: 'Alta',
  referencial: 'Referencial',
  revisar: 'Revisar',
  pendiente: 'Pendiente',
  ia: 'IA'
}

const QUICK_PROMPTS = [
  '500 camisetas de algodon',
  '120 laptops gamer',
  '80 repuestos automotrices'
]

const SUPPLIER_FILE_ACCEPT = '.pdf,.docx,.xlsx,.xls,.csv,.txt,.png,.jpg,.jpeg'
const EMPTY_ADMIN_FORM = {
  email: '',
  password: '',
  name: '',
  company: '',
  ruc: '',
  role: 'user'
}

const ADMIN_CONFIRM_COPY = {
  revoke_approval: {
    title: 'Revocar aprobacion',
    confirmLabel: 'Si, revocar',
    tone: 'danger'
  },
  approve: {
    title: 'Aprobar miembro',
    confirmLabel: 'Si, aprobar',
    tone: 'info'
  },
  suspend: {
    title: 'Suspender acceso',
    confirmLabel: 'Si, suspender',
    tone: 'danger'
  },
  reactivate: {
    title: 'Reactivar acceso',
    confirmLabel: 'Si, reactivar',
    tone: 'info'
  },
  make_admin: {
    title: 'Conceder rol admin',
    confirmLabel: 'Si, hacerlo admin',
    tone: 'warn'
  },
  remove_admin: {
    title: 'Quitar rol admin',
    confirmLabel: 'Si, quitar admin',
    tone: 'danger'
  },
  reset_password: {
    title: 'Resetear contrasena',
    confirmLabel: 'Guardar nueva clave',
    tone: 'warn'
  }
}

const ACCESS_BENEFITS = [
  'Acceso exclusivo para miembros autorizados de la comunidad Broke Shop.',
  'Cada cotizacion muestra precision, permisos y recomendaciones.',
  'El dashboard se alimenta con historial real, no con datos ficticios.'
]

const BRAND_NOTES = [
  'Acceso privado',
  'Cotizacion guiada',
  'Comunidad importadora'
]

const DASHBOARD_CHART_COLORS = [
  '#ffb000',
  '#ffd166',
  '#f4a261',
  '#e76f51',
  '#2a9d8f',
  '#5dade2',
  '#90be6d',
  '#f6bd60'
]

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatMoney(value, currency = 'USD') {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(toNumber(value))
}

function formatDateTime(value) {
  if (!value) return 'Sin actividad'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(parsed)
}

function normalizeOption(option) {
  if (typeof option === 'string') {
    return { value: option, label: option }
  }

  return {
    value: option?.value ?? option?.label ?? '',
    label: option?.label ?? option?.value ?? ''
  }
}

function defaultDashboardScopeFor(role) {
  return role === 'admin' ? 'community' : 'mine'
}

function chartColor(index) {
  return DASHBOARD_CHART_COLORS[index % DASHBOARD_CHART_COLORS.length]
}

function formatPercent(value) {
  return `${toNumber(value).toFixed(0)}%`
}

function formatMetricDelta(metric, mode = 'percent') {
  if (!metric || metric.variacion === undefined || metric.variacion === null) {
    return 'Sin variacion';
  }

  const variation = toNumber(metric.variacion)
  if (variation === 0) return 'Sin variacion'

  const prefix = variation > 0 ? '+' : ''
  if (mode === 'count') {
    return `${prefix}${variation} vs periodo anterior`
  }

  return `${prefix}${variation}% vs periodo anterior`
}

function DashboardScopeToggle({ scope, isAdmin, onChange }) {
  if (isAdmin) {
    return (
      <div className="scope-toggle" role="tablist" aria-label="Alcance del dashboard">
        <button
          type="button"
          className={`scope-toggle-button ${scope === 'community' ? 'active' : ''}`}
          onClick={() => onChange('community')}
        >
          Comunidad
        </button>
        <button
          type="button"
          className={`scope-toggle-button ${scope === 'mine' ? 'active' : ''}`}
          onClick={() => onChange('mine')}
        >
          Mi actividad
        </button>
      </div>
    )
  }

  return <div className="scope-chip">Mi actividad</div>
}

function DashboardLineChart({ title, data }) {
  const items = Array.isArray(data) ? data : []
  const width = 540
  const height = 220
  const padding = 24
  const maxValue = Math.max(1, ...items.map((item) => toNumber(item.cotizaciones)))
  const innerWidth = width - padding * 2
  const innerHeight = height - padding * 2

  const points = items.map((item, index) => {
    const x = padding + (items.length <= 1 ? innerWidth / 2 : (index / (items.length - 1)) * innerWidth)
    const y = padding + innerHeight - (toNumber(item.cotizaciones) / maxValue) * innerHeight
    return { x, y, label: item.mes, value: toNumber(item.cotizaciones), dolares: toNumber(item.dolares) }
  })

  const linePoints = points.map((point) => `${point.x},${point.y}`).join(' ')
  const areaPoints = points.length
    ? `${padding},${height - padding} ${linePoints} ${points[points.length - 1].x},${height - padding}`
    : ''
  const latest = points[points.length - 1]

  return (
    <article className="chart-card chart-card-wide">
      <div className="chart-card-head">
        <div>
          <p className="panel-kicker">Serie principal</p>
          <h3>{title}</h3>
        </div>
        <div className="chart-chip chart-chip-primary">
          <strong>{latest ? latest.value : 0}</strong>
          <span>ultimo mes</span>
        </div>
      </div>

      <div className="chart-shell">
        <svg viewBox={`0 0 ${width} ${height}`} className="line-chart-svg" aria-label={title}>
          <defs>
            <linearGradient id="dashboard-line-fill" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,176,0,0.38)" />
              <stop offset="100%" stopColor="rgba(255,176,0,0.03)" />
            </linearGradient>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = padding + innerHeight * fraction
            return (
              <line
                key={fraction}
                x1={padding}
                y1={y}
                x2={width - padding}
                y2={y}
                stroke="rgba(255, 184, 0, 0.08)"
                strokeWidth="1"
              />
            )
          })}

          {points.length ? <polygon points={areaPoints} fill="url(#dashboard-line-fill)" /> : null}
          {points.length ? (
            <polyline
              points={linePoints}
              fill="none"
              stroke={chartColor(0)}
              strokeWidth="4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          {points.map((point) => (
            <g key={point.label}>
              <circle cx={point.x} cy={point.y} r="5.5" fill={chartColor(0)} stroke="#0b0b0b" strokeWidth="2" />
              <text x={point.x} y={height - 4} textAnchor="middle" className="line-chart-label">
                {point.label}
              </text>
            </g>
          ))}
        </svg>

        <div className="line-chart-dollars">
          {points.map((point) => (
            <div key={`${point.label}-usd`} className="line-chart-dollar-chip">
              <span>{point.label}</span>
              <strong>{formatMoney(point.dolares)}</strong>
            </div>
          ))}
        </div>
      </div>
    </article>
  )
}

function DashboardDonutChart({ title, data, valueKey, labelKey }) {
  const items = Array.isArray(data) ? data : []
  const total = items.reduce((sum, item) => sum + toNumber(item[valueKey]), 0)
  let accumulator = 0
  const segments = items.map((item, index) => {
    const value = toNumber(item[valueKey])
    const start = total > 0 ? (accumulator / total) * 100 : 0
    accumulator += value
    const end = total > 0 ? (accumulator / total) * 100 : 0
    return `${chartColor(index)} ${start}% ${end}%`
  })

  return (
    <article className="chart-card">
      <div className="chart-card-head">
        <div>
          <p className="panel-kicker">Distribucion</p>
          <h3>{title}</h3>
        </div>
        <div className="chart-chip">
          <strong>{total}</strong>
          <span>registros</span>
        </div>
      </div>

      <div className="donut-layout">
        <div
          className="donut-chart"
          style={{
            background: total > 0
              ? `conic-gradient(${segments.join(', ')})`
              : 'conic-gradient(rgba(255,255,255,0.08) 0 100%)',
          }}
        >
          <div className="donut-chart-center">
            <strong>{items.length}</strong>
            <span>series</span>
          </div>
        </div>

        <div className="chart-legend">
          {items.map((item, index) => {
            const value = toNumber(item[valueKey])
            const percent = total > 0 ? (value / total) * 100 : 0
            return (
              <div key={`${item[labelKey]}-${index}`} className="legend-row">
                <span className="legend-swatch" style={{ background: chartColor(index) }} />
                <div className="legend-copy">
                  <strong>{item[labelKey]}</strong>
                  <span>{value} · {formatPercent(percent)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </article>
  )
}

function DashboardBarChart({ title, data, valueKey, labelKey }) {
  const items = Array.isArray(data) ? data : []
  const maxValue = Math.max(1, ...items.map((item) => toNumber(item[valueKey])))

  return (
    <article className="chart-card">
      <div className="chart-card-head">
        <div>
          <p className="panel-kicker">Ranking</p>
          <h3>{title}</h3>
        </div>
      </div>

      <div className="bar-chart">
        {items.map((item, index) => {
          const value = toNumber(item[valueKey])
          const width = `${(value / maxValue) * 100}%`
          return (
            <div key={`${item[labelKey]}-${index}`} className="bar-chart-row">
              <div className="bar-chart-copy">
                <strong>{item[labelKey]}</strong>
                <span>{value}</span>
              </div>
              <div className="bar-chart-track">
                <div
                  className="bar-chart-fill"
                  style={{ width, background: `linear-gradient(90deg, ${chartColor(index)}, rgba(255,255,255,0.24))` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </article>
  )
}

function assistantMessage(payload) {
  return {
    id: createId('assistant'),
    role: 'assistant',
    text: payload.pregunta || payload.mensaje || '',
    step: payload.paso || payload.contexto?.paso_actual || null,
    hint: payload.hint || null,
    options: Array.isArray(payload.opciones) ? payload.opciones.map(normalizeOption) : [],
    showCalculate: payload.paso === 'calcular' || payload.tipo === 'listo_para_calcular'
  }
}

function sanitizeGreeting(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isDuplicateGreeting(message, question) {
  const first = sanitizeGreeting(message)
  const second = sanitizeGreeting(question)

  if (!first || !second) return false

  return (
    first.includes('hola') &&
    second.includes('hola') &&
    first.includes('asistente de importaciones') &&
    second.includes('asistente de importaciones')
  )
}

function buildStartMessages(inicio) {
  const messages = []
  const duplicateGreeting = isDuplicateGreeting(inicio?.mensaje, inicio?.pregunta)

  if (inicio?.mensaje && !duplicateGreeting) {
    messages.push({
      id: createId('assistant'),
      role: 'assistant',
      text: inicio.mensaje,
      step: null,
      hint: null,
      options: [],
      showCalculate: false
    })
  }

  if (inicio?.pregunta) {
    messages.push(
      assistantMessage({
        pregunta: inicio.pregunta,
        paso: inicio.paso,
        opciones: inicio.opciones
      })
    )
  }

  return messages
}

function buildCalculationPayload(contexto) {
  const datos = contexto?.datos_previos || {}
  const productos = Array.isArray(datos.productos) ? datos.productos : []
  const bienUsado = Boolean(datos.bien_usado)
  const objetivoCalculo = datos.objetivo_calculo || 'precio_sugerido'
  const seguroModo = datos.seguro_modo || (toNumber(datos.seguro) > 0 ? 'REAL' : 'ESTIMADO')

  return {
    items: productos.map((producto, index) => ({
      desc: producto.descripcion || producto.producto || `Producto ${index + 1}`,
      qty: toNumber(producto.cantidad || producto.qty || 1),
      unit: toNumber(datos.precio_unitario),
      bienUsado
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
    margenVenta: objetivoCalculo === 'costo_importacion' ? 0 : toNumber(datos.margen_venta || 30)
  }
}

function buildSummaryRows(contexto) {
  const datos = contexto?.datos_previos || {}
  const productos = Array.isArray(datos.productos) ? datos.productos : []

  return [
    {
      label: 'Productos',
      value: productos.length
        ? productos.map((producto) => `${toNumber(producto.cantidad || 1)} x ${producto.descripcion || producto.producto}`).join(', ')
        : 'Aun no definidos'
    },
    {
      label: 'Pais de origen',
      value: datos.pais_origen || 'Pendiente'
    },
    {
      label: 'Canal',
      value: CHANNEL_LABELS[datos.canal] || 'Pendiente'
    },
    {
      label: 'Objetivo',
      value: OBJECTIVE_LABELS[datos.objetivo_calculo] || 'Pendiente'
    },
    {
      label: 'Tipo de sujeto',
      value: SUBJECT_LABELS[datos.tipo_sujeto] || 'Pendiente'
    },
    {
      label: 'Precio unitario',
      value: datos.precio_unitario !== undefined ? formatMoney(datos.precio_unitario) : 'Pendiente'
    },
    {
      label: 'Incoterm',
      value: datos.incoterm || 'Pendiente'
    },
    {
      label: 'Seguro',
      value: INSURANCE_MODE_LABELS[datos.seguro_modo] || 'Pendiente'
    },
    {
      label: 'Tipo de importador',
      value: IMPORTER_LABELS[datos.tipo_importador] || 'Pendiente'
    },
    {
      label: 'Condicion del producto',
      value: datos.bien_usado === undefined
        ? 'Pendiente'
        : (datos.bien_usado ? PRODUCT_CONDITION_LABELS.usado : PRODUCT_CONDITION_LABELS.nuevo)
    },
    {
      label: 'Margen objetivo',
      value: datos.objetivo_calculo === 'costo_importacion'
        ? 'No aplica en este modo'
        : (datos.margen_venta !== undefined ? `${toNumber(datos.margen_venta)}%` : 'Pendiente')
    }
  ]
}

function buildDocumentDraftForm(extraction) {
  const review = extraction?.paraRevisar || {}

  return {
    proveedor: review.proveedor || '',
    pais: review.pais || '',
    moneda: review.moneda || 'USD',
    incoterm: review.incoterm || 'FOB',
    canal: 'MARITIMO',
    flete: review.flete ?? '',
    seguro: review.seguro ?? '',
    seguroModo: review.seguro ? 'REAL' : 'ESTIMADO',
    tc: '',
    tipoSujeto: 'empresa',
    tipoImportador: 'general',
    objetivoCalculo: 'precio_sugerido',
    condicionProducto: Array.isArray(review.items) && review.items.some((item) => item.bienUsado) ? 'usado' : 'nuevo',
    margenVenta: 30
  }
}

function buildDocumentCalculationPayload(extraction, form) {
  const review = extraction?.paraRevisar || {}

  return {
    items: (review.items || []).map((item) => ({
      desc: item.desc || 'Producto',
      qty: toNumber(item.qty || 1),
      unit: toNumber(item.unit || 0),
      pesoKg: item.pesoKg != null ? toNumber(item.pesoKg) : undefined,
      bienUsado: form.condicionProducto === 'usado'
    })),
    pais: form.pais || review.pais || '',
    canal: form.canal || 'MARITIMO',
    incoterm: form.incoterm || review.incoterm || 'FOB',
    flete: toNumber(form.flete),
    seguro: form.seguroModo === 'REAL' ? toNumber(form.seguro) : 0,
    tc: toNumber(form.tc),
    proveedor: form.proveedor || review.proveedor || '',
    moneda: form.moneda || review.moneda || 'USD',
    tipoSujeto: form.tipoSujeto || 'empresa',
    tipoImportador: form.tipoImportador || 'general',
    objetivoCalculo: form.objetivoCalculo || 'precio_sugerido',
    seguroModo: form.seguroModo || (toNumber(form.seguro) > 0 ? 'REAL' : 'ESTIMADO'),
    margenVenta: form.objetivoCalculo === 'costo_importacion' ? 0 : toNumber(form.margenVenta || 30)
  }
}

function precisionTone(precision) {
  if (!precision) return 'info'
  if (precision.requiereRevision) return 'critico'
  if (precision.esReferencial) return 'medio'
  return 'info'
}

function componentTone(component) {
  if (!component) return 'info'
  if (component.estado === 'revisar' || component.estado === 'pendiente') return 'critico'
  if (component.estado === 'referencial') return 'medio'
  return 'info'
}

function healthLabel(status) {
  if (!status) return 'Sin datos'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function setAuthToken(token) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(AUTH_STORAGE_KEY, token)
  }
  axios.defaults.headers.common.Authorization = `Bearer ${token}`
}

function clearAuthToken() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
  }
  delete axios.defaults.headers.common.Authorization
}

function getStoredToken() {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(AUTH_STORAGE_KEY) || ''
}

function BrandBadge() {
  return (
    <div className="brand-lockup">
      <div className="brand-copy">
        <span className="brand-caption">Comunidad privada</span>
        <strong>Broke Shop</strong>
      </div>
    </div>
  )
}

function App() {
  const [view, setView] = useState('cotizador')
  const [salud, setSalud] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [dashboardAnalysis, setDashboardAnalysis] = useState(null)
  const [dashboardScope, setDashboardScope] = useState('mine')
  const [messages, setMessages] = useState([])
  const [contexto, setContexto] = useState({ datos_previos: {}, paso_actual: null })
  const [input, setInput] = useState('')
  const [resultado, setResultado] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [error, setError] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState(null)
  const [authNotice, setAuthNotice] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [membership, setMembership] = useState(null)
  const [adminUsers, setAdminUsers] = useState([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState(null)
  const [adminNotice, setAdminNotice] = useState(null)
  const [adminForm, setAdminForm] = useState({ ...EMPTY_ADMIN_FORM })
  const [adminConfirm, setAdminConfirm] = useState(null)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [uploadingDocument, setUploadingDocument] = useState(false)
  const [documentDraft, setDocumentDraft] = useState(null)
  const [documentForm, setDocumentForm] = useState(buildDocumentDraftForm(null))
  const messagesEndRef = useRef(null)
  const documentInputRef = useRef(null)
  const isAdmin = currentUser?.role === 'admin'
  const heroContent = isAdmin
    ? {
        title: 'Cotiza con precision, valida requisitos y dirige tu operacion con mas claridad.',
        text:
          'El chat sigue siendo el centro operativo, pero ahora tu comunidad trabaja con acceso controlado, historial real y una vista secundaria para monitorear actividad.',
        railA: {
          label: 'Operacion privada',
          title: 'Control total de acceso',
          text: 'Apruebas, suspendes y acompanias a tu comunidad sin sacar el foco de la cotizacion.'
        },
        railB: {
          label: 'Tu ventaja',
          title: 'Chat + trazabilidad',
          text: 'Cotizacion guiada, precision por componente y un panel real para seguir la operacion.'
        },
        status: {
          label: 'Acceso',
          title: 'Solo miembros aprobados',
          text: 'El ingreso queda reservado a personas que habilitas directamente desde tu comunidad.'
        }
      }
    : {
        title: 'Cotiza con precision, valida requisitos y toma decisiones de importacion con mas claridad.',
        text:
          'Tu workspace reune chat, calculo, permisos y trazabilidad en una sola experiencia para que avances mas rapido y con menos duda.',
        railA: {
          label: 'Tu experiencia',
          title: 'Cotizacion guiada',
          text: 'Respondes lo minimo y el sistema arma la operacion paso a paso sin volverte el proceso pesado.'
        },
        railB: {
          label: 'Tu ventaja',
          title: 'Precision visible',
          text: 'Cada cotizacion te muestra que dato es exacto, cual es estimado y que permisos debes revisar.'
        },
        status: {
          label: 'Tu cuenta',
          title: 'Miembro activo',
          text: 'Tu acceso ya esta habilitado para cotizar, revisar historial y operar dentro de la comunidad.'
        }
      }

  const isCurrentAdminTarget = (user) => {
    if (!currentUser?.id || !user?.id) return false
    return String(currentUser.id) === String(user.id)
  }

  useEffect(() => {
    void bootSession()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, resultado])

  useEffect(() => {
    if (isAdmin && view === 'admin') {
      void loadAdminUsers()
    }
  }, [isAdmin, view])

  useEffect(() => {
    if (!isAdmin && view === 'admin') {
      setView('cotizador')
    }
  }, [isAdmin, view])

  useEffect(() => {
    if (!currentUser?.role) return
    if (currentUser.role !== 'admin' && dashboardScope !== 'mine') {
      setDashboardScope('mine')
    }
  }, [currentUser?.role, dashboardScope])

  useEffect(() => {
    if (!currentUser?.id || view !== 'dashboard') return
    void cargarDashboard(dashboardScope)
  }, [currentUser?.id, view, dashboardScope])

  const cargarDashboard = async (scopeOverride) => {
    const resolvedScope = scopeOverride || dashboardScope || defaultDashboardScopeFor(currentUser?.role)
    const [dashboardRes, analysisRes] = await Promise.allSettled([
      axios.get(`${API_URL}/api/dashboard`, { params: { scope: resolvedScope } }),
      axios.get(`${API_URL}/api/dashboard/analisis`, { params: { scope: resolvedScope } })
    ])

    if (dashboardRes.status === 'fulfilled') {
      setDashboard(dashboardRes.value.data)
    } else {
      throw dashboardRes.reason
    }

    if (analysisRes.status === 'fulfilled') {
      setDashboardAnalysis(analysisRes.value.data.analisis || null)
    } else {
      setDashboardAnalysis(null)
    }
  }

  const loadAdminUsers = async () => {
    if (!isAdmin) return

    setAdminLoading(true)
    setAdminError(null)

    try {
      const response = await axios.get(`${API_URL}/api/admin/users`)
      setAdminUsers(response.data.users || [])
    } catch (requestError) {
      setAdminError(requestError.response?.data?.error || requestError.message)
    } finally {
      setAdminLoading(false)
    }
  }

  const inicializar = async (scopeOverride = defaultDashboardScopeFor(currentUser?.role)) => {
    setLoading(true)
    setError(null)

    const resolvedScope = scopeOverride || defaultDashboardScopeFor(currentUser?.role)

    const [healthRes, dashboardRes, inicioRes] = await Promise.allSettled([
      axios.get(`${API_URL}/api/monitor/health`),
      axios.get(`${API_URL}/api/dashboard`, { params: { scope: resolvedScope } }),
      axios.post(`${API_URL}/api/agente-0/iniciar`)
    ])

    if (healthRes.status === 'fulfilled') {
      setSalud(healthRes.value.data)
    }

    if (dashboardRes.status === 'fulfilled') {
      setDashboard(dashboardRes.value.data)
    }

    if (inicioRes.status === 'fulfilled') {
      setMessages(buildStartMessages(inicioRes.value.data))
      setContexto(inicioRes.value.data.contexto || { datos_previos: {}, paso_actual: null })
    } else {
      setError('No pude iniciar el cotizador conversacional.')
    }

    setLoading(false)
  }

  const hydrateAuthenticatedSession = async (token) => {
    setAuthToken(token)

    const [meRes, membershipRes] = await Promise.allSettled([
      axios.get(`${API_URL}/api/auth/me`),
      axios.get(`${API_URL}/api/membresias/mi-membresia`)
    ])

    if (meRes.status !== 'fulfilled') {
      clearAuthToken()
      throw new Error('La sesion ya no es valida.')
    }

    const sessionUser = meRes.value.data
    const nextScope = defaultDashboardScopeFor(sessionUser.role)

    setCurrentUser(sessionUser)
    setMembership(membershipRes.status === 'fulfilled' ? membershipRes.value.data : null)
    setDashboardScope(nextScope)
    await inicializar(nextScope)
  }

  const bootSession = async () => {
    setAuthLoading(true)

    const token = getStoredToken()
    if (!token) {
      clearAuthToken()
      setAuthLoading(false)
      return
    }

    try {
      await hydrateAuthenticatedSession(token)
    } catch (sessionError) {
      setAuthNotice('Tu sesion anterior ya no estaba disponible. Ingresa otra vez.')
      setCurrentUser(null)
      setMembership(null)
    } finally {
      setAuthLoading(false)
    }
  }

  const pushUserMessage = (text) => {
    setMessages((current) => [
      ...current,
      {
        id: createId('user'),
        role: 'user',
        text,
        options: [],
        hint: null,
        showCalculate: false
      }
    ])
  }

  const enviarMensaje = async (rawText, displayText = rawText) => {
    const message = String(rawText || '').trim()
    if (!message) return

    pushUserMessage(displayText)
    setInput('')
    setSending(true)
    setError(null)

    try {
      const response = await axios.post(`${API_URL}/api/agente-0/chat`, {
        mensaje: message,
        contexto
      })

      setContexto(response.data.contexto || contexto)
      setMessages((current) => [...current, assistantMessage(response.data)])
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message)
    } finally {
      setSending(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    await enviarMensaje(input)
  }

  const handleOptionClick = async (option) => {
    const normalized = normalizeOption(option)
    await enviarMensaje(normalized.value, normalized.label)
  }

  const reiniciar = async () => {
    setResultado(null)
    setDocumentDraft(null)
    setDocumentForm(buildDocumentDraftForm(null))
    await inicializar(dashboardScope)
  }

  const abrirSelectorDocumento = () => {
    documentInputRef.current?.click()
  }

  const handleDocumentFieldChange = (field, value) => {
    setDocumentForm((current) => ({ ...current, [field]: value }))
  }

  const handleSupplierDocumentUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadingDocument(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await axios.post(`${API_URL}/api/auto-cotizar/extraer`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      if (!response.data?.ok) {
        throw new Error(response.data?.error || 'No pude extraer la cotizacion del proveedor.')
      }

      setDocumentDraft({
        fileName: file.name,
        ...response.data
      })
      setDocumentForm(buildDocumentDraftForm(response.data))

      setMessages((current) => [
        ...current,
        {
          id: createId('assistant'),
          role: 'assistant',
          text: `Analice ${file.name} y detecte ${response.data.paraRevisar?.items?.length || 0} item(s). Puedes revisar el borrador y calcular directo desde el documento.`,
          options: [],
          hint: response.data.mensaje || null,
          showCalculate: false
        }
      ])
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message)
    } finally {
      setUploadingDocument(false)
      event.target.value = ''
    }
  }

  const calcularDesdeDocumento = async () => {
    if (!documentDraft?.paraRevisar?.items?.length) {
      setError('Todavia no hay un borrador de documento listo para calcular.')
      return
    }

    const payload = buildDocumentCalculationPayload(documentDraft, documentForm)

    if (!payload.items.every((item) => item.unit > 0)) {
      setError('Revisa el documento: todos los items deben tener precio unitario valido.')
      return
    }

    setCalculating(true)
    setError(null)

    try {
      const response = await axios.post(`${API_URL}/api/auto-cotizar/calcular`, payload)
      setResultado(response.data)
      await cargarDashboard()
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message)
    } finally {
      setCalculating(false)
    }
  }

  const calcularCotizacion = async () => {
    const payload = buildCalculationPayload(contexto)

    if (!payload.items.length) {
      setError('Todavia no hay productos capturados para calcular.')
      return
    }

    if (!payload.items.every((item) => item.unit > 0)) {
      setError('Falta capturar un precio unitario valido.')
      return
    }

    setCalculating(true)
    setError(null)

    try {
      const response = await axios.post(`${API_URL}/api/agente/calcular`, payload)
      setResultado(response.data)
      setView('cotizador')
      await cargarDashboard()
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message)
    } finally {
      setCalculating(false)
    }
  }

  const handleLoginSubmit = async (event) => {
    event.preventDefault()
    setAuthError(null)
    setAuthNotice(null)
    setAuthLoading(true)

    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, loginForm)
      await hydrateAuthenticatedSession(response.data.token)
      setAuthNotice('Acceso verificado. Ya estas dentro de la comunidad.')
    } catch (requestError) {
      setAuthError(requestError.response?.data?.error || requestError.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleAdminCreateSubmit = async (event) => {
    event.preventDefault()
    setAdminError(null)
    setAdminNotice(null)
    setAdminLoading(true)

    try {
      const response = await axios.post(`${API_URL}/api/admin/users`, adminForm)
      setAdminUsers((current) => [response.data.user, ...current])
      setAdminForm({ ...EMPTY_ADMIN_FORM })
      setAdminNotice(`Cuenta creada para ${response.data.user.email}.`)
    } catch (requestError) {
      setAdminError(requestError.response?.data?.error || requestError.message)
    } finally {
      setAdminLoading(false)
    }
  }

  const patchAdminUser = async (userId, patch, successMessage) => {
    setAdminError(null)
    setAdminNotice(null)
    setAdminLoading(true)

    try {
      const response = await axios.patch(`${API_URL}/api/admin/users/${userId}`, patch)
      const updatedUser = response.data.user
      setAdminUsers((current) => current.map((user) => (user.id === updatedUser.id ? updatedUser : user)))

      if (String(currentUser?.id || '') === String(updatedUser.id || '')) {
        setCurrentUser(updatedUser)
      }

      setAdminNotice(successMessage)
    } catch (requestError) {
      setAdminError(requestError.response?.data?.error || requestError.message)
    } finally {
      setAdminLoading(false)
    }
  }

  const openAdminConfirm = (config) => {
    setAdminError(null)
    setAdminNotice(null)
    setAdminConfirm(config)
  }

  const closeAdminConfirm = () => {
    if (adminLoading) return
    setAdminConfirm(null)
  }

  const handleAdminToggleActive = async (user) => {
    if (isCurrentAdminTarget(user)) {
      setAdminError('No puedes suspender o reactivar tu propia cuenta desde este panel.')
      return
    }

    openAdminConfirm({
      type: user.active ? 'suspend' : 'reactivate',
      user,
      patch: { active: !user.active },
      successMessage: user.active
        ? `Acceso suspendido para ${user.email}.`
        : `Acceso reactivado para ${user.email}.`,
      message: user.active
        ? `Vas a suspender el acceso de ${user.email}. No podra entrar hasta que lo reactives.`
        : `Vas a reactivar el acceso de ${user.email}. Recuperara el ingreso segun su rol actual.`
    })
  }

  const handleAdminToggleApproved = async (user) => {
    if (isCurrentAdminTarget(user)) {
      setAdminError('No puedes revocar tu propia aprobacion desde este panel.')
      return
    }

    openAdminConfirm({
      type: user.approved ? 'revoke_approval' : 'approve',
      user,
      patch: { approved: !user.approved },
      successMessage: user.approved
        ? `Aprobacion revocada para ${user.email}.`
        : `Aprobacion concedida para ${user.email}.`,
      message: user.approved
        ? `Vas a revocar la aprobacion de ${user.email}. La cuenta seguira existiendo, pero ya no podra operar hasta volver a aprobarla.`
        : `Vas a aprobar a ${user.email}. La cuenta quedara habilitada para operar si tambien esta activa.`
    })
  }

  const handleAdminToggleRole = async (user) => {
    if (isCurrentAdminTarget(user)) {
      setAdminError('No puedes cambiar tu propio rol admin desde este panel.')
      return
    }

    const nextRole = user.role === 'admin' ? 'user' : 'admin'
    openAdminConfirm({
      type: nextRole === 'admin' ? 'make_admin' : 'remove_admin',
      user,
      patch: { role: nextRole },
      successMessage: nextRole === 'admin'
        ? `${user.email} ahora es administrador.`
        : `${user.email} vuelve a ser miembro.`,
      message: nextRole === 'admin'
        ? `Vas a dar permisos de administrador a ${user.email}. Podra gestionar accesos, roles y credenciales.`
        : `Vas a quitar el rol admin a ${user.email}. Mantendra su cuenta, pero ya no podra administrar la comunidad.`
    })
  }

  const handleAdminPasswordReset = async (user) => {
    openAdminConfirm({
      type: 'reset_password',
      user,
      password: '',
      message: `Vas a reemplazar la contrasena de ${user.email}. Define una clave temporal segura para compartirla luego por un canal confiable.`
    })
  }

  const handleAdminConfirmAction = async () => {
    if (!adminConfirm) return

    const action = adminConfirm

    if (action.type === 'reset_password') {
      const password = String(action.password || '').trim()
      if (!password || password.length < 6) {
        setAdminError('La nueva contrasena temporal debe tener al menos 6 caracteres.')
        return
      }

      setAdminError(null)
      setAdminNotice(null)
      setAdminLoading(true)

      try {
        await axios.post(`${API_URL}/api/admin/users/${action.user.id}/reset-password`, { password })
        setAdminNotice(`Contrasena actualizada para ${action.user.email}.`)
        setAdminConfirm(null)
      } catch (requestError) {
        setAdminError(requestError.response?.data?.error || requestError.message)
      } finally {
        setAdminLoading(false)
      }

      return
    }

    setAdminConfirm(null)
    await patchAdminUser(action.user.id, action.patch, action.successMessage)
  }

  const handleLogout = () => {
    clearAuthToken()
    setView('cotizador')
    setCurrentUser(null)
    setMembership(null)
    setAdminUsers([])
    setAdminError(null)
    setAdminNotice(null)
    setAdminForm({ ...EMPTY_ADMIN_FORM })
    setAdminConfirm(null)
    setMessages([])
    setDashboard(null)
    setDashboardAnalysis(null)
    setDashboardScope('mine')
    setSalud(null)
    setResultado(null)
    setDocumentDraft(null)
    setDocumentForm(buildDocumentDraftForm(null))
    setError(null)
    setAuthNotice('Sesion cerrada. El acceso sigue siendo privado.')
  }

  if (authLoading && !currentUser) {
    return <div className="page-state page-state-brand">Verificando acceso privado...</div>
  }

  if (!currentUser) {
    return (
      <div className="access-shell">
        <div className="access-backdrop" />

        <main className="access-layout">
          <section className="brand-stage">
            <div className="brand-stage-top">
              <BrandBadge />
              <div className="brand-notes">
                {BRAND_NOTES.map((note) => (
                  <span key={note}>{note}</span>
                ))}
              </div>
            </div>

            <div className="brand-stage-copy">
              <p className="eyebrow amber">Plataforma privada de importacion</p>
              <h1>Cotiza con precision, valida requisitos y toma decisiones de importacion con mas claridad.</h1>
              <p className="hero-text">
                Una plataforma privada para miembros de Broke Shop que concentra cotizacion, validacion y trazabilidad
                en una sola experiencia.
              </p>
            </div>

            <div className="benefit-grid">
              {ACCESS_BENEFITS.map((item, index) => (
                <article key={item} className="benefit-card">
                  <span className="benefit-index">0{index + 1}</span>
                  <p>{item}</p>
                </article>
              ))}
            </div>

            <section className="signal-card">
              <div>
                <span className="signal-label">Como funciona</span>
                <h2>Acceso controlado, experiencia premium.</h2>
              </div>
              <div className="signal-list">
                <div>
                  <strong>1. El administrador aprueba</strong>
                  <p>El acceso se reserva a miembros autorizados dentro de la comunidad privada de Broke Shop.</p>
                </div>
                <div>
                  <strong>2. Recibes tu acceso</strong>
                  <p>Las credenciales se entregan manualmente para mantener una experiencia exclusiva y controlada.</p>
                </div>
                <div>
                  <strong>3. Operas dentro del ecosistema</strong>
                  <p>Chat, dashboard y trazabilidad viven en una misma experiencia de marca.</p>
                </div>
              </div>
            </section>
          </section>

          <section className="access-panel">
            <div className="access-panel-head">
              <p className="eyebrow">Ingreso privado</p>
              <h2>Entra a tu workspace de comunidad</h2>
              <p>
                Ingreso exclusivo para miembros autorizados por Broke Shop. Si aun no tienes cuenta, contacta al
                administrador.
              </p>
            </div>

            {authError ? <div className="banner-error">{authError}</div> : null}
            {authNotice ? <div className="banner-note">{authNotice}</div> : null}

            <form className="auth-form" onSubmit={handleLoginSubmit}>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={loginForm.email}
                  onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="tu@email.com"
                  autoComplete="email"
                />
              </label>

              <label>
                <span>Contrasena</span>
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Tu acceso privado"
                  autoComplete="current-password"
                />
              </label>

              <button type="submit" className="primary-button auth-button" disabled={authLoading}>
                {authLoading ? 'Verificando...' : 'Entrar a Broke Shop'}
              </button>
            </form>

            <div className="access-footnote">
              <strong>Nota:</strong> este acceso se reserva para la comunidad privada de Broke Shop. Las cuentas se
              habilitan manualmente.
            </div>
          </section>
        </main>
      </div>
    )
  }

  if (loading) {
    return <div className="page-state page-state-brand">Preparando tu workspace privado...</div>
  }

  return (
    <div className="app-shell">
      <div className="app-backdrop" />

      <main className="app-layout">
        <header className="topbar">
          <BrandBadge />

          <div className="topbar-actions">
            <div className="member-chip">
              <span className="member-chip-label">Miembro</span>
              <strong>{currentUser?.name || currentUser?.email}</strong>
              <small>{ROLE_LABELS[currentUser?.role] || 'Miembro'} · {MEMBERSHIP_LABELS[membership?.nivel] || 'Acceso privado'}</small>
            </div>

            <button type="button" className="ghost-button" onClick={handleLogout}>
              Cerrar sesion
            </button>
          </div>
        </header>

        <section className="hero hero-brand">
          <div className="hero-copy">
            <p className="eyebrow amber">Broke Shop import intelligence</p>
            <h1>{heroContent.title}</h1>
            <p className="hero-text">{heroContent.text}</p>

            <div className="hero-rail">
              <div className="rail-card">
                <span>{heroContent.railA.label}</span>
                <strong>{heroContent.railA.title}</strong>
                <p>{heroContent.railA.text}</p>
              </div>
              <div className="rail-card">
                <span>{heroContent.railB.label}</span>
                <strong>{heroContent.railB.title}</strong>
                <p>{heroContent.railB.text}</p>
              </div>
            </div>
          </div>

          <div className="hero-status">
            <div className={`status-pill ${salud?.status || 'neutral'}`}>
              <span className="status-dot" />
              {healthLabel(salud?.status)}
            </div>

            <div className="hero-actions">
              <button
                type="button"
                className={`tab-button ${view === 'cotizador' ? 'active' : ''}`}
                onClick={() => setView('cotizador')}
              >
                Workspace
              </button>
              <button
                type="button"
                className={`tab-button ${view === 'dashboard' ? 'active' : ''}`}
                onClick={() => setView('dashboard')}
              >
                Dashboard
              </button>
              {isAdmin ? (
                <button
                  type="button"
                  className={`tab-button ${view === 'admin' ? 'active' : ''}`}
                  onClick={() => setView('admin')}
                >
                  Panel admin
                </button>
              ) : null}
            </div>

            <div className="status-panel">
              <span>{heroContent.status.label}</span>
              <strong>{heroContent.status.title}</strong>
              <p>{heroContent.status.text}</p>
            </div>
          </div>
        </section>

        {error ? <div className="banner-error">{error}</div> : null}

        {view === 'cotizador' ? (
          <section className="workspace">
            <article className="chat-panel">
              <div className="panel-head">
                <div>
                  <p className="panel-kicker">Agente 0</p>
                  <h2>Chat de cotizacion</h2>
                  <p>Responde lo minimo. El sistema construye tu operacion y te dice que tan exacto es cada dato.</p>
                </div>
                <button type="button" className="ghost-button" onClick={reiniciar}>
                  Reiniciar flujo
                </button>
              </div>

              <div className="quick-prompts">
                {QUICK_PROMPTS.map((prompt) => (
                  <button key={prompt} type="button" className="prompt-chip" onClick={() => enviarMensaje(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>

              <input
                ref={documentInputRef}
                type="file"
                accept={SUPPLIER_FILE_ACCEPT}
                className="hidden-file-input"
                onChange={handleSupplierDocumentUpload}
              />

              <section className="document-intake-card">
                <div className="document-intake-head">
                  <div>
                    <p className="panel-kicker">Documento del proveedor</p>
                    <h3>Sube la cotizacion del chino</h3>
                    <p>PDF, DOCX, XLSX, CSV o imagen. Si tienes valores reales, puedes corregirlos antes de calcular.</p>
                  </div>

                  <button
                    type="button"
                    className="ghost-button"
                    onClick={abrirSelectorDocumento}
                    disabled={uploadingDocument}
                  >
                    {uploadingDocument ? 'Procesando...' : 'Subir archivo'}
                  </button>
                </div>

                {documentDraft ? (
                  <div className="document-draft">
                    <div className="document-draft-meta">
                      <span>Archivo: <strong>{documentDraft.fileName}</strong></span>
                      <span>Confianza: <strong>{documentDraft.confianza || 0}%</strong></span>
                      <span>Items: <strong>{documentDraft.paraRevisar?.items?.length || 0}</strong></span>
                    </div>

                    <div className="document-form-grid">
                      <label>
                        <span>Proveedor</span>
                        <input
                          value={documentForm.proveedor}
                          onChange={(event) => handleDocumentFieldChange('proveedor', event.target.value)}
                          placeholder="Proveedor detectado"
                        />
                      </label>

                      <label>
                        <span>Pais</span>
                        <input
                          value={documentForm.pais}
                          onChange={(event) => handleDocumentFieldChange('pais', event.target.value)}
                          placeholder="CN, US, China..."
                        />
                      </label>

                      <label>
                        <span>Incoterm</span>
                        <input
                          value={documentForm.incoterm}
                          onChange={(event) => handleDocumentFieldChange('incoterm', event.target.value.toUpperCase())}
                          placeholder="FOB"
                        />
                      </label>

                      <label>
                        <span>Canal</span>
                        <select
                          value={documentForm.canal}
                          onChange={(event) => handleDocumentFieldChange('canal', event.target.value)}
                        >
                          <option value="MARITIMO">Maritimo</option>
                          <option value="AEREO">Aereo</option>
                          <option value="COURIER">Courier</option>
                          <option value="POSTAL">Postal</option>
                        </select>
                      </label>

                      <label>
                        <span>Tipo de sujeto</span>
                        <select
                          value={documentForm.tipoSujeto}
                          onChange={(event) => handleDocumentFieldChange('tipoSujeto', event.target.value)}
                        >
                          {SUBJECT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>

                      <label>
                        <span>Objetivo del calculo</span>
                        <select
                          value={documentForm.objetivoCalculo}
                          onChange={(event) => handleDocumentFieldChange('objetivoCalculo', event.target.value)}
                        >
                          {OBJECTIVE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>

                      <label>
                        <span>Flete real</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={documentForm.flete}
                          onChange={(event) => handleDocumentFieldChange('flete', event.target.value)}
                          placeholder="Si ya te lo cotizaron"
                        />
                      </label>

                      <label>
                        <span>Modo de seguro</span>
                        <select
                          value={documentForm.seguroModo}
                          onChange={(event) => handleDocumentFieldChange('seguroModo', event.target.value)}
                        >
                          {INSURANCE_MODE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>

                      <label>
                        <span>Seguro informado</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={documentForm.seguro}
                          onChange={(event) => handleDocumentFieldChange('seguro', event.target.value)}
                          placeholder="Si ya lo tienes"
                          disabled={documentForm.seguroModo !== 'REAL'}
                        />
                      </label>

                      <label>
                        <span>Tipo de cambio</span>
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={documentForm.tc}
                          onChange={(event) => handleDocumentFieldChange('tc', event.target.value)}
                          placeholder="Opcional: en blanco usa SUNAT venta"
                        />
                      </label>

                      <label>
                        <span>Tipo de importador</span>
                        <select
                          value={documentForm.tipoImportador}
                          onChange={(event) => handleDocumentFieldChange('tipoImportador', event.target.value)}
                        >
                          <option value="general">General</option>
                          <option value="nuevo">Nuevo</option>
                          <option value="buen_contribuyente">Buen contribuyente</option>
                        </select>
                      </label>

                      <label>
                        <span>Condicion del producto</span>
                        <select
                          value={documentForm.condicionProducto}
                          onChange={(event) => handleDocumentFieldChange('condicionProducto', event.target.value)}
                        >
                          <option value="nuevo">Producto nuevo</option>
                          <option value="usado">Producto usado / segunda mano</option>
                        </select>
                      </label>

                      <label>
                        <span>Margen de venta (%)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={documentForm.margenVenta}
                          onChange={(event) => handleDocumentFieldChange('margenVenta', event.target.value)}
                          placeholder="30"
                          disabled={documentForm.objetivoCalculo === 'costo_importacion'}
                        />
                      </label>
                    </div>

                    {Array.isArray(documentDraft.advertencias) && documentDraft.advertencias.length ? (
                      <div className="document-warning-list">
                        {documentDraft.advertencias.slice(0, 3).map((warning, index) => (
                          <div key={`${warning.campo || 'warning'}-${index}`} className="document-warning">
                            {warning.mensaje}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="document-items-preview">
                      {(documentDraft.paraRevisar?.items || []).slice(0, 4).map((item) => (
                        <div key={`${item.index}-${item.desc}`} className="document-item-chip">
                          <strong>{item.qty} x {item.desc}</strong>
                          <span>{formatMoney(item.unit || 0)}</span>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="primary-button full-width"
                      onClick={calcularDesdeDocumento}
                      disabled={calculating}
                    >
                      {calculating ? 'Calculando...' : 'Calcular desde documento'}
                    </button>
                  </div>
                ) : (
                  <div className="document-empty-state">
                    Sube una cotizacion del proveedor y el sistema armara un borrador editable antes del calculo.
                  </div>
                )}
              </section>

              <div className="messages">
                {messages.map((message) => (
                  <div key={message.id} className={`message ${message.role}`}>
                    <div className="message-bubble">
                      <p>{message.text}</p>
                      {message.hint ? <span className="message-hint">{message.hint}</span> : null}

                      {message.options?.length ? (
                        <div className="message-options">
                          {message.options.map((option) => (
                            <button
                              key={`${message.id}-${option.value}`}
                              type="button"
                              className="option-button"
                              onClick={() => handleOptionClick(option)}
                              disabled={sending || calculating}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {message.showCalculate ? (
                        <button
                          type="button"
                          className="primary-button inline-action"
                          onClick={calcularCotizacion}
                          disabled={calculating}
                        >
                          {calculating ? 'Calculando...' : 'Calcular cotizacion'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}

                {sending ? (
                  <div className="message assistant">
                    <div className="message-bubble loading-bubble">Preparando la siguiente pregunta...</div>
                  </div>
                ) : null}

                <div ref={messagesEndRef} />
              </div>

              <form className="composer" onSubmit={handleSubmit}>
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Escribe tu respuesta o describe lo que quieres importar..."
                  disabled={sending || calculating}
                />
                <button type="submit" className="primary-button" disabled={sending || calculating || !input.trim()}>
                  Enviar
                </button>
              </form>
            </article>

            <aside className="sidebar">
              <section className="panel summary-panel">
                <div className="panel-head compact">
                  <div>
                    <p className="panel-kicker">Captura activa</p>
                    <h2>Resumen detectado</h2>
                    <p>Lo que el chat ya entiende de tu operacion.</p>
                  </div>
                </div>

                <div className="summary-list">
                  {buildSummaryRows(contexto).map((row) => (
                    <div key={row.label} className="summary-row">
                      <span>{row.label}</span>
                      <strong>{row.value}</strong>
                    </div>
                  ))}
                </div>

                <button type="button" className="primary-button full-width" onClick={calcularCotizacion} disabled={calculating}>
                  {calculating ? 'Calculando...' : 'Calcular ahora'}
                </button>
              </section>

              <section className="panel community-panel">
                <div className="panel-head compact">
                  <div>
                    <p className="panel-kicker">Comunidad</p>
                    <h2>Tu acceso</h2>
                  </div>
                </div>

                <div className="summary-list">
                  <div className="summary-row">
                    <span>Cuenta</span>
                    <strong>{currentUser?.email}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Membresia</span>
                    <strong>{MEMBERSHIP_LABELS[membership?.nivel] || 'Acceso privado'}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Rol</span>
                    <strong>{ROLE_LABELS[currentUser?.role] || 'Miembro'}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Regla de acceso</span>
                    <strong>Solo aprobacion del administrador</strong>
                  </div>
                </div>
              </section>

              <section className="panel result-panel">
                <div className="panel-head compact">
                  <div>
                    <p className="panel-kicker">Salida</p>
                    <h2>Resultado</h2>
                    <p>Tu cotizacion aparece aqui con exactitud por componente.</p>
                  </div>
                </div>

                {resultado?.exito ? (
                  <div className="result-content">
                    <div className="result-highlight">
                      <span>Total landed</span>
                      <strong>{formatMoney(resultado.totales?.totalReal)}</strong>
                    </div>

                    {resultado.precision ? (
                      <div className={`precision-card ${precisionTone(resultado.precision)}`}>
                        <div className="precision-head">
                          <span>Precision global</span>
                          <strong>
                            {PRECISION_LABELS[resultado.precision.nivel] || resultado.precision.nivel} ({resultado.precision.puntaje}%)
                          </strong>
                        </div>
                        <p>{resultado.precision.resumen}</p>

                        {Array.isArray(resultado.precision.motivos) && resultado.precision.motivos.length ? (
                          <div className="precision-reasons">
                            {resultado.precision.motivos.slice(0, 3).map((motivo, index) => (
                              <div key={`${motivo.codigo}-${index}`} className="precision-reason">
                                {motivo.mensaje}
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {resultado.precision.componentes ? (
                          <div className="precision-components">
                            {Object.values(resultado.precision.componentes).map((component) => (
                              <div key={component.clave} className={`precision-component ${componentTone(component)}`}>
                                <div className="precision-component-head">
                                  <span>{component.etiqueta}</span>
                                  <strong>{COMPONENT_STATUS_LABELS[component.estado] || component.estado}</strong>
                                </div>
                                <p>{component.detalle}</p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="result-grid">
                      <div>
                        <span>FOB</span>
                        <strong>{formatMoney(resultado.totales?.fob)}</strong>
                      </div>
                      <div>
                        <span>Flete</span>
                        <strong>{formatMoney(resultado.totales?.flete)}</strong>
                      </div>
                      <div>
                        <span>Seguro</span>
                        <strong>{formatMoney(resultado.totales?.seguro)}</strong>
                      </div>
                      <div>
                        <span>Tributos</span>
                        <strong>{formatMoney(resultado.totales?.totalTributos)}</strong>
                      </div>
                    </div>

                    {resultado.metadata ? (
                      <div className="result-subsection">
                        <div className="result-subsection-head">
                          <h3>Lectura de la operacion</h3>
                          <span>Importacion</span>
                        </div>

                        <div className="simple-list">
                          <article className="list-card result-card">
                            <strong>Objetivo del calculo</strong>
                            <p>{OBJECTIVE_LABELS[resultado.metadata.objetivoCalculo] || OBJECTIVE_LABELS.precio_sugerido}</p>
                          </article>
                          <article className="list-card result-card">
                            <strong>Seguro</strong>
                            <p>{resultado.perfilImportacion?.seguro?.etiqueta || INSURANCE_MODE_LABELS[resultado.metadata.seguroModo] || INSURANCE_MODE_LABELS.ESTIMADO}</p>
                          </article>
                          <article className="list-card result-card">
                            <strong>Perfil</strong>
                            <p>{SUBJECT_LABELS[resultado.metadata.tipoSujeto] || 'Empresa'} / {IMPORTER_LABELS[resultado.metadata.tipoImportador] || 'Importador general'}</p>
                          </article>
                        </div>
                      </div>
                    ) : null}

                    {resultado.perfilImportacion ? (
                      <>
                        <div className="result-subsection">
                          <div className="result-subsection-head">
                            <h3>Escenario aduanero</h3>
                            <span>{resultado.perfilImportacion.regimen?.titulo || 'Importacion'}</span>
                          </div>

                          <div className="simple-list">
                            <article className="list-card result-card">
                              <strong>{resultado.perfilImportacion.regimen?.titulo}</strong>
                              <p>{resultado.perfilImportacion.regimen?.detalle}</p>
                              {resultado.perfilImportacion.regimen?.umbral ? (
                                <p className="muted-line">Tramo: {resultado.perfilImportacion.regimen.umbral}</p>
                              ) : null}
                            </article>

                            {(resultado.perfilImportacion.notasOperativas || []).map((nota, index) => (
                              <article key={`${nota.titulo}-${index}`} className="list-card result-card">
                                <strong>{nota.titulo}</strong>
                                <p>{nota.detalle}</p>
                              </article>
                            ))}
                          </div>
                        </div>

                        {Array.isArray(resultado.perfilImportacion.checklistDocumental) && resultado.perfilImportacion.checklistDocumental.length ? (
                          <div className="result-subsection">
                            <div className="result-subsection-head">
                              <h3>Checklist documental</h3>
                              <span>{resultado.perfilImportacion.checklistDocumental.length} puntos</span>
                            </div>

                            <div className="simple-list">
                              {resultado.perfilImportacion.checklistDocumental.map((documento, index) => (
                                <article key={`${documento.titulo}-${index}`} className="list-card result-card">
                                  <strong>{documento.obligatorio ? 'Obligatorio' : 'Recomendado'} - {documento.titulo}</strong>
                                  <p>{documento.detalle}</p>
                                  {documento.fuente ? <p className="muted-line">Fuente: {documento.fuente}</p> : null}
                                </article>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {Array.isArray(resultado.perfilImportacion.baseTributaria) && resultado.perfilImportacion.baseTributaria.length ? (
                          <div className="result-subsection">
                            <div className="result-subsection-head">
                              <h3>Base tributaria</h3>
                              <span>Lectura del calculo</span>
                            </div>

                            <div className="simple-list">
                              {resultado.perfilImportacion.baseTributaria.map((base, index) => (
                                <article key={`${base.concepto}-${index}`} className="list-card result-card">
                                  <strong>{base.concepto}</strong>
                                  <p>{base.valor}</p>
                                  <p className="muted-line">{base.detalle}</p>
                                </article>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {Array.isArray(resultado.perfilImportacion.validacionOficial?.subpartidas) && resultado.perfilImportacion.validacionOficial.subpartidas.length ? (
                          <div className="result-subsection">
                            <div className="result-subsection-head">
                              <h3>Validacion oficial en vivo</h3>
                              <span>
                                {resultado.perfilImportacion.validacionOficial.fuente || 'ADUANET'} · {formatDateTime(resultado.perfilImportacion.validacionOficial.actualizado)}
                              </span>
                            </div>

                            <div className="simple-list">
                              <article className="list-card result-card">
                                <strong>Resumen oficial por subpartida</strong>
                                <p>
                                  {resultado.perfilImportacion.validacionOficial.resumen?.consultadas || resultado.perfilImportacion.validacionOficial.subpartidas.length}
                                  {' '}subpartida(s) consultadas,{' '}
                                  {resultado.perfilImportacion.validacionOficial.resumen?.conveniosDetectados || 0}
                                  {' '}con convenio(s) detectado(s) y{' '}
                                  {resultado.perfilImportacion.validacionOficial.resumen?.restriccionesDetectadas || 0}
                                  {' '}restriccion(es) oficial(es).
                                </p>
                                {resultado.perfilImportacion.validacionOficial.truncado ? (
                                  <p className="muted-line">
                                    Se consulto una muestra prioritaria para no volver lento el calculo. Detectadas:{' '}
                                    {resultado.perfilImportacion.validacionOficial.totalDetectadas}
                                  </p>
                                ) : null}
                              </article>

                              {resultado.perfilImportacion.validacionOficial.subpartidas.map((subpartida) => (
                                <article key={subpartida.partida} className={`list-card result-card ${subpartida.oficialEnVivo ? 'info' : 'medio'}`}>
                                  <strong>
                                    {subpartida.partida}
                                    {subpartida.descripcion ? ` - ${subpartida.descripcion}` : ''}
                                  </strong>
                                  {subpartida.tipoProducto ? <p>{subpartida.tipoProducto}</p> : null}
                                  {Array.isArray(subpartida.resumenTributos) && subpartida.resumenTributos.length ? (
                                    <p className="muted-line">
                                      {subpartida.resumenTributos.map((tributo) => `${tributo.etiqueta}: ${tributo.valor}`).join(' · ')}
                                    </p>
                                  ) : null}
                                  {subpartida.convenio ? (
                                    <p>
                                      Convenio: {subpartida.convenio.acuerdo} ({subpartida.convenio.pais})
                                      {subpartida.convenio.arancelBasePreferencial ? ` · ${subpartida.convenio.arancelBasePreferencial}` : ''}
                                      {subpartida.convenio.porcentajeLiberadoAdv ? ` · liberacion ${subpartida.convenio.porcentajeLiberadoAdv}` : ''}
                                    </p>
                                  ) : (
                                    <p className="muted-line">Sin convenio preferencial detectado para el pais consultado.</p>
                                  )}
                                  {subpartida.restricciones?.total ? (
                                    <p>
                                      Restricciones: {subpartida.restricciones.total}
                                      {Array.isArray(subpartida.restricciones.entidades) && subpartida.restricciones.entidades.length
                                        ? ` · control: ${subpartida.restricciones.entidades.join(', ')}`
                                        : ''}
                                    </p>
                                  ) : (
                                    <p className="muted-line">Sin restricciones oficiales detectadas en la consulta viva.</p>
                                  )}
                                  {Array.isArray(subpartida.descripcionesMinimas) && subpartida.descripcionesMinimas.length ? (
                                    <p className="muted-line">
                                      Descripciones minimas: {subpartida.descripcionesMinimas.slice(0, 2).map((item) => item.descripcion).join(' | ')}
                                    </p>
                                  ) : null}
                                  <p className="muted-line">
                                    Fuente: {subpartida.fuente} · {subpartida.oficialEnVivo ? 'oficial en vivo' : 'fallback/cache'} · {formatDateTime(subpartida.actualizado)}
                                  </p>
                                  {subpartida.error ? <p className="muted-line">Nota: {subpartida.error}</p> : null}
                                  {Object.values(subpartida.enlaces || {}).filter(Boolean).length ? (
                                    <p className="muted-line official-links">
                                      {subpartida.enlaces.convenios ? <a href={subpartida.enlaces.convenios} target="_blank" rel="noreferrer">Convenios</a> : null}
                                      {subpartida.enlaces.restricciones ? <a href={subpartida.enlaces.restricciones} target="_blank" rel="noreferrer">Restricciones</a> : null}
                                      {subpartida.enlaces.descripcionesMinimas ? <a href={subpartida.enlaces.descripcionesMinimas} target="_blank" rel="noreferrer">Descr. minimas</a> : null}
                                      {subpartida.enlaces.resolucionesClasificacion ? <a href={subpartida.enlaces.resolucionesClasificacion} target="_blank" rel="noreferrer">Resoluciones</a> : null}
                                    </p>
                                  ) : null}
                                </article>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {Array.isArray(resultado.perfilImportacion.alertasValoracion) && resultado.perfilImportacion.alertasValoracion.length ? (
                          <div className="result-subsection">
                            <div className="result-subsection-head">
                              <h3>Alertas de valoracion</h3>
                              <span>{resultado.perfilImportacion.alertasValoracion.length} focos</span>
                            </div>

                            <div className="simple-list">
                              {resultado.perfilImportacion.alertasValoracion.map((alerta, index) => (
                                <article key={`${alerta.titulo}-${index}`} className={`list-card result-card ${alerta.nivel || 'info'}`}>
                                  <strong>{alerta.titulo}</strong>
                                  <p>{alerta.detalle}</p>
                                </article>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : null}

                    {resultado.totales?.totalPEN ? (
                      <div className="result-pen">
                        Total referencial en soles: <strong>{formatMoney(resultado.totales.totalPEN, 'PEN')}</strong>
                      </div>
                    ) : null}

                    {Array.isArray(resultado.alertas) && resultado.alertas.length ? (
                      <div className="alert-stack">
                        {resultado.alertas.slice(0, 4).map((alerta, index) => (
                          <div key={`${alerta.tipo}-${index}`} className={`alert-card ${alerta.nivel || 'info'}`}>
                            {alerta.mensaje}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {Array.isArray(resultado.permisos) && resultado.permisos.length ? (
                      <div className="result-subsection">
                        <div className="result-subsection-head">
                          <h3>Permisos y entidades</h3>
                          <span>{resultado.permisos.length} requeridos</span>
                        </div>

                        <div className="simple-list">
                          {resultado.permisos.map((permiso) => (
                            <article key={`${permiso.entidad}-${permiso.nombre}`} className="list-card result-card">
                              <strong>{permiso.icon} {permiso.entidad} - {permiso.nombre}</strong>
                              <p>{permiso.tramite}</p>
                              <p className="muted-line">
                                {permiso.vuce ? 'Se tramita por VUCE.' : 'Tramite fuera de VUCE.'}
                                {permiso.web ? ` Web: ${permiso.web}` : ''}
                              </p>
                              {Array.isArray(permiso.productosDetectados) && permiso.productosDetectados.length ? (
                                <p className="muted-line">Aplica a: {permiso.productosDetectados.join(', ')}</p>
                              ) : null}
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {Array.isArray(resultado.recomendaciones) && resultado.recomendaciones.length ? (
                      <div className="result-subsection">
                        <div className="result-subsection-head">
                          <h3>Recomendaciones</h3>
                          <span>{resultado.recomendaciones.length} acciones</span>
                        </div>

                        <div className="simple-list">
                          {resultado.recomendaciones.map((recomendacion, index) => (
                            <article key={`${recomendacion.tipo}-${index}`} className={`list-card result-card ${recomendacion.nivel || 'info'}`}>
                              <strong>{recomendacion.titulo}</strong>
                              <p>{recomendacion.mensaje}</p>
                              {recomendacion.accion ? <p className="muted-line">Siguiente paso: {recomendacion.accion}</p> : null}
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="empty-card">
                    <p>
                      Completa el flujo y pulsa <strong>Calcular</strong>. Aqui veras landed cost, precision por modulo,
                      permisos y acciones recomendadas.
                    </p>
                  </div>
                )}
              </section>
            </aside>
          </section>
        ) : view === 'admin' ? (
          <section className="dashboard-panel admin-panel">
            <div className="panel-head">
              <div>
                <p className="panel-kicker">Control total</p>
                <h2>Panel de administracion</h2>
                <p>Aprueba, suspende, cambia roles y resetea credenciales sin salir de la plataforma.</p>
              </div>

              <button type="button" className="ghost-button" onClick={loadAdminUsers} disabled={adminLoading}>
                {adminLoading ? 'Actualizando...' : 'Actualizar lista'}
              </button>
            </div>

            {adminError ? <div className="banner-error">{adminError}</div> : null}
            {adminNotice ? <div className="banner-note">{adminNotice}</div> : null}

            <div className="admin-grid">
              <section className="panel">
                <div className="panel-head compact">
                  <div>
                    <p className="panel-kicker">Alta manual</p>
                    <h2>Crear cuenta</h2>
                    <p>Solo tu decides quien entra. Aqui das de alta nuevas cuentas manualmente.</p>
                  </div>
                </div>

                <form className="auth-form admin-form-grid" onSubmit={handleAdminCreateSubmit}>
                  <label>
                    <span>Nombre</span>
                    <input
                      value={adminForm.name}
                      onChange={(event) => setAdminForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Nombre del miembro"
                    />
                  </label>

                  <label>
                    <span>Email</span>
                    <input
                      type="email"
                      value={adminForm.email}
                      onChange={(event) => setAdminForm((current) => ({ ...current, email: event.target.value }))}
                      placeholder="miembro@correo.com"
                    />
                  </label>

                  <label>
                    <span>Contrasena inicial</span>
                    <input
                      type="text"
                      value={adminForm.password}
                      onChange={(event) => setAdminForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder="Minimo 6 caracteres"
                    />
                  </label>

                  <label>
                    <span>Empresa</span>
                    <input
                      value={adminForm.company}
                      onChange={(event) => setAdminForm((current) => ({ ...current, company: event.target.value }))}
                      placeholder="Empresa opcional"
                    />
                  </label>

                  <label>
                    <span>RUC</span>
                    <input
                      value={adminForm.ruc}
                      onChange={(event) => setAdminForm((current) => ({ ...current, ruc: event.target.value }))}
                      placeholder="RUC opcional"
                    />
                  </label>

                  <label>
                    <span>Rol</span>
                    <select
                      value={adminForm.role}
                      onChange={(event) => setAdminForm((current) => ({ ...current, role: event.target.value }))}
                    >
                      <option value="user">Miembro</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </label>

                  <button type="submit" className="primary-button full-width" disabled={adminLoading}>
                    {adminLoading ? 'Guardando...' : 'Crear cuenta manual'}
                  </button>
                </form>
              </section>

              <section className="panel">
                <div className="panel-head compact">
                  <div>
                    <p className="panel-kicker">Miembros</p>
                    <h2>Accesos activos</h2>
                    <p>Desde aqui controlas aprobaciones, bloqueos y privilegios.</p>
                  </div>
                </div>

                <div className="admin-user-list">
                  {adminUsers.length ? adminUsers.map((user) => (
                    <article key={user.id} className="admin-user-card">
                      <div className="admin-user-head">
                        <div>
                          <strong>{user.name || user.email}</strong>
                          <p>{user.email}</p>
                        </div>

                        <div className="admin-pill-row">
                          <span className={`admin-pill ${user.role === 'admin' ? 'warn' : 'neutral'}`}>
                            {ROLE_LABELS[user.role] || user.role}
                          </span>
                          <span className={`admin-pill ${user.active ? 'ok' : 'danger'}`}>
                            {user.active ? 'Activo' : 'Suspendido'}
                          </span>
                          <span className={`admin-pill ${user.approved ? 'ok' : 'neutral'}`}>
                            {user.approved ? 'Aprobado' : 'Pendiente'}
                          </span>
                        </div>
                      </div>

                      <div className="admin-user-meta">
                        <span><strong>Empresa:</strong> {user.company || 'Sin empresa'}</span>
                        <span><strong>RUC:</strong> {user.ruc || 'Sin RUC'}</span>
                        <span><strong>Creado:</strong> {formatDateTime(user.created_at)}</span>
                        <span><strong>Ultimo ingreso:</strong> {formatDateTime(user.last_login)}</span>
                      </div>

                      <div className="admin-actions">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => handleAdminToggleApproved(user)}
                          disabled={adminLoading || isCurrentAdminTarget(user)}
                        >
                          {user.approved ? 'Revocar aprobacion' : 'Aprobar'}
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => handleAdminToggleActive(user)}
                          disabled={adminLoading || isCurrentAdminTarget(user)}
                        >
                          {user.active ? 'Suspender' : 'Reactivar'}
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => handleAdminToggleRole(user)}
                          disabled={adminLoading || isCurrentAdminTarget(user)}
                        >
                          {user.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                        </button>
                        <button type="button" className="primary-button" onClick={() => handleAdminPasswordReset(user)} disabled={adminLoading}>
                          Resetear clave
                        </button>
                      </div>
                    </article>
                  )) : (
                    <div className="empty-card">
                      <p>Todavia no hay mas miembros registrados. Usa el formulario para crear la primera cuenta manual.</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </section>
        ) : (
          <section className="dashboard-panel">
            <div className="panel-head">
              <div>
                <p className="panel-kicker">Vista secundaria</p>
                <h2>Panel real de actividad</h2>
                <p>Base deterministica con datos reales guardados. La IA aporta lectura ejecutiva sobre ese mismo historial.</p>
              </div>

              <div className="dashboard-toolbar">
                <div className="scope-summary">
                  <span className="panel-kicker">Alcance</span>
                  <strong>{dashboard?.meta?.scopeLabel || (isAdmin ? 'Comunidad' : 'Mi actividad')}</strong>
                </div>
                <DashboardScopeToggle scope={dashboardScope} isAdmin={isAdmin} onChange={setDashboardScope} />
              </div>
            </div>

            <div className="kpi-grid">
              <div className="kpi-card">
                <span>Total cotizaciones</span>
                <strong>{dashboard?.kpis?.totalCotizaciones?.valor || 0}</strong>
                <small>{formatMetricDelta(dashboard?.kpis?.totalCotizaciones)}</small>
              </div>
              <div className="kpi-card">
                <span>Total dolares</span>
                <strong>{formatMoney(dashboard?.kpis?.totalDolares?.valor)}</strong>
                <small>{formatMetricDelta(dashboard?.kpis?.totalDolares)}</small>
              </div>
              <div className="kpi-card">
                <span>Ticket promedio</span>
                <strong>{formatMoney(dashboard?.kpis?.ticketPromedio?.valor)}</strong>
                <small>{formatMetricDelta(dashboard?.kpis?.ticketPromedio)}</small>
              </div>
              <div className="kpi-card">
                <span>Paises activos</span>
                <strong>{dashboard?.kpis?.paisesActivos?.valor || 0}</strong>
                <small>{formatMetricDelta(dashboard?.kpis?.paisesActivos, 'count')}</small>
              </div>
            </div>

            {dashboard?.meta?.hayDatos ? (
              <div className="dashboard-stack">
                <div className="chart-grid">
                  <DashboardLineChart
                    title={dashboard?.graficos?.evolucionMensual?.titulo || 'Evolucion'}
                    data={dashboard?.graficos?.evolucionMensual?.datos || []}
                  />
                  <DashboardDonutChart
                    title={dashboard?.graficos?.distribucionPaises?.titulo || 'Distribucion por pais'}
                    data={dashboard?.graficos?.distribucionPaises?.datos || []}
                    valueKey="valor"
                    labelKey="pais"
                  />
                  <DashboardBarChart
                    title={dashboard?.graficos?.topProductos?.titulo || 'Top productos'}
                    data={dashboard?.graficos?.topProductos?.datos || []}
                    valueKey="valor"
                    labelKey="producto"
                  />
                </div>

                <div className="dashboard-columns">
                  <section className="panel">
                    <div className="panel-head compact">
                      <div>
                        <p className="panel-kicker">IA + historial</p>
                        <h2>Lectura ejecutiva</h2>
                      </div>
                    </div>

                    <div className="analysis-grid">
                      {Array.isArray(dashboardAnalysis?.insights) ? dashboardAnalysis.insights.map((item, index) => (
                        <article key={`insight-${index}`} className="list-card">
                          <strong>Insight {index + 1}</strong>
                          <p>{item}</p>
                        </article>
                      )) : null}

                      {Array.isArray(dashboardAnalysis?.oportunidades) ? dashboardAnalysis.oportunidades.map((item, index) => (
                        <article key={`op-${index}`} className="list-card">
                          <strong>Oportunidad {index + 1}</strong>
                          <p>{item}</p>
                        </article>
                      )) : null}

                      {dashboardAnalysis?.alerta ? (
                        <article className="list-card">
                          <strong>Alerta IA</strong>
                          <p>{dashboardAnalysis.alerta}</p>
                        </article>
                      ) : null}

                      {dashboardAnalysis?.recomendacion ? (
                        <article className="list-card">
                          <strong>Recomendacion</strong>
                          <p>{dashboardAnalysis.recomendacion}</p>
                        </article>
                      ) : null}
                    </div>
                  </section>

                  <section className="panel">
                    <div className="panel-head compact">
                      <div>
                        <p className="panel-kicker">Atencion</p>
                        <h2>Alertas y tendencias</h2>
                      </div>
                    </div>

                    <div className="simple-list">
                      {(dashboard?.tendencias || []).map((item) => (
                        <article key={item.titulo} className="list-card">
                          <strong>{item.titulo}</strong>
                          <p>{item.descripcion}</p>
                        </article>
                      ))}

                      {(dashboard?.alertas || []).map((item) => (
                        <article key={item.id || item.titulo} className="list-card">
                          <strong>{item.titulo}</strong>
                          <p>{item.mensaje}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            ) : (
              <div className="empty-dashboard">
                <h3>Sin historial todavia</h3>
                <p>
                  {isAdmin
                    ? 'El panel de comunidad se activara cuando existan cotizaciones reales guardadas por tus miembros.'
                    : 'Tu panel personal se activara cuando guardes tus primeras cotizaciones reales.'}
                </p>
              </div>
            )}
          </section>
        )}
      </main>

      {adminConfirm ? (
        <div className="admin-confirm-overlay" role="presentation" onClick={closeAdminConfirm}>
          <section
            className={`admin-confirm-dialog ${ADMIN_CONFIRM_COPY[adminConfirm.type]?.tone || 'info'}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="panel-kicker">Confirmacion requerida</p>
            <h2 id="admin-confirm-title">
              {ADMIN_CONFIRM_COPY[adminConfirm.type]?.title || 'Confirmar accion'}
            </h2>
            <p>{adminConfirm.message}</p>

            <div className="admin-confirm-target">
              <strong>{adminConfirm.user?.name || adminConfirm.user?.email}</strong>
              <span>{adminConfirm.user?.email}</span>
            </div>

            {adminConfirm.type === 'reset_password' ? (
              <label className="admin-confirm-field">
                <span>Nueva contrasena temporal</span>
                <input
                  type="text"
                  value={adminConfirm.password || ''}
                  onChange={(event) =>
                    setAdminConfirm((current) => (current ? { ...current, password: event.target.value } : current))
                  }
                  placeholder="Minimo 6 caracteres"
                  autoFocus
                />
              </label>
            ) : null}

            <div className="admin-confirm-actions">
              <button type="button" className="ghost-button" onClick={closeAdminConfirm} disabled={adminLoading}>
                Cancelar
              </button>
              <button type="button" className="primary-button" onClick={handleAdminConfirmAction} disabled={adminLoading}>
                {adminLoading ? 'Procesando...' : (ADMIN_CONFIRM_COPY[adminConfirm.type]?.confirmLabel || 'Confirmar')}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

export default App
