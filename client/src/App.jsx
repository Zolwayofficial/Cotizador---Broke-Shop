import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import appPayloadHelpers from './app-payload-helpers.cjs'
import appViewHelpers from './app-view-helpers.cjs'
import adminStateHelpers from './admin-state-helpers.cjs'
import workspaceInteractionHelpers from './workspace-interaction-helpers.cjs'
import workspaceStateHelpers from './workspace-state-helpers.cjs'
import workspaceViewHelpers from './workspace-view-helpers.cjs'
import workspaceSummaryHelpers from './workspace-summary-helpers.cjs'
import resultViewHelpers from './result-view-helpers.cjs'
import dashboardViewHelpers from './dashboard-view-helpers.cjs'

const {
  buildCalculationPayload,
  buildDocumentCalculationPayload,
  buildDocumentDraftForm,
  toNumber,
  truncateText
} = appPayloadHelpers

const {
  buildAdminUsersView,
  normalizeAdminFormPayload,
  normalizeAdminUsers,
  upsertAdminUser,
  isStaleAdminResponse
} = adminStateHelpers

const {
  isStaleWorkspaceResponse,
  isWorkspaceBusy
} = workspaceInteractionHelpers

const {
  buildDocumentUploadSuccessState,
  buildDocumentFieldChangeState,
  buildInitializationPatch,
  emptyConversationContext
} = workspaceStateHelpers

const { buildDocumentDraftView } = workspaceViewHelpers
const { buildWorkspaceSummaryRows } = workspaceSummaryHelpers
const {
  buildOfficialConsultationView,
  buildResultAmountSummary,
  buildResultOperationSummary,
  buildPrecisionView,
  buildRegimenView
} = resultViewHelpers
const {
  buildDashboardAnalysisView,
  buildDashboardAttentionView,
  buildDashboardMetricDisplay,
  buildDonutChartSummary,
  buildLineChartLatestDisplay,
  normalizeCategoricalChartItems,
  normalizeLineChartItems
} = dashboardViewHelpers

const {
  buildAssistantMessageText,
  buildHealthStatusView,
  buildDashboardRefreshPatch,
  buildLoggedOutSessionState,
  isStaleDashboardResponse,
  normalizeLoginPayload
} = appViewHelpers

const API_URL = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_PROXY_TARGET ||
  (typeof window !== 'undefined' ? window.location.origin : '')
).replace(/\/$/, '')

const AUTH_STORAGE_KEY = 'broke-shop-session-token'

const CHANNEL_LABELS = {
  MARITIMO: 'Maritimo formal',
  AEREO: 'Aereo formal',
  COURIER: 'Courier express',
  POSTAL: 'Postal',
  POSTAL_FRANQUICIA: 'Postal con franquicia'
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
  consistente: 'Consistente',
  alta: 'Alta',
  referencial: 'Referencial',
  requiere_revision: 'Requiere revision'
}

const COMPONENT_STATUS_LABELS = {
  con_respaldo: 'Con respaldo',
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

const ADMIN_REVIEW_COPY = {
  revoke_approval: {
    title: 'Revocar aprobacion',
    actionLabel: 'Si, revocar',
    tone: 'danger'
  },
  approve: {
    title: 'Aprobar miembro',
    actionLabel: 'Si, aprobar',
    tone: 'info'
  },
  suspend: {
    title: 'Suspender acceso',
    actionLabel: 'Si, suspender',
    tone: 'danger'
  },
  reactivate: {
    title: 'Reactivar acceso',
    actionLabel: 'Si, reactivar',
    tone: 'info'
  },
  make_admin: {
    title: 'Conceder rol admin',
    actionLabel: 'Si, hacerlo admin',
    tone: 'warn'
  },
  remove_admin: {
    title: 'Quitar rol admin',
    actionLabel: 'Si, quitar admin',
    tone: 'danger'
  },
  reset_password: {
    title: 'Resetear contrasena',
    actionLabel: 'Guardar nueva clave',
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

const DASHBOARD_SERIES_MARKERS = [
  'solid',
  'split',
  'ring',
  'diagonal',
  'diamond',
  'stripe',
  'square',
  'dot'
]

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
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

function chartSeriesMarker(index) {
  return DASHBOARD_SERIES_MARKERS[index % DASHBOARD_SERIES_MARKERS.length]
}

function chartSeriesBadge(index) {
  return String(index + 1).padStart(2, '0')
}

function formatPercent(value) {
  return `${toNumber(value).toFixed(0)}%`
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
  const items = normalizeLineChartItems(data, { toNumber })
  const width = 540
  const height = 220
  const padding = 24
  const maxValue = Math.max(1, ...items.map((item) => item.cotizaciones))
  const innerWidth = width - padding * 2
  const innerHeight = height - padding * 2

  const points = items.map((item, index) => {
    const x = padding + (items.length <= 1 ? innerWidth / 2 : (index / (items.length - 1)) * innerWidth)
    const y = padding + innerHeight - (item.cotizaciones / maxValue) * innerHeight
    return { x, y, label: item.mes, value: item.cotizaciones, dolares: item.dolares }
  })

  const linePoints = points.map((point) => `${point.x},${point.y}`).join(' ')
  const areaPoints = points.length
    ? `${padding},${height - padding} ${linePoints} ${points[points.length - 1].x},${height - padding}`
    : ''
  const latestDisplay = buildLineChartLatestDisplay(points, { toNumber })

  return (
    <article className="chart-card chart-card-wide">
      <div className="chart-card-head">
        <div>
          <p className="panel-kicker">Serie principal</p>
          <h3>{title}</h3>
        </div>
        <div className="chart-chip chart-chip-primary">
          <strong>{latestDisplay.value}</strong>
          <span>{latestDisplay.caption}</span>
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
              <strong>{point.dolares === null ? 'N/D' : formatMoney(point.dolares)}</strong>
            </div>
          ))}
        </div>
      </div>
    </article>
  )
}

function DashboardDonutChart({ title, data, valueKey, labelKey }) {
  const items = normalizeCategoricalChartItems(data, labelKey, valueKey, { toNumber })
  const summary = buildDonutChartSummary(items, valueKey, { toNumber })
  const total = typeof summary.total === 'number' ? summary.total : 0
  let accumulator = 0
  const segments = items.map((item, index) => {
    const value = item[valueKey]
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
          <strong>{summary.total}</strong>
          <span>{summary.total === 'N/D' ? 'Sin datos' : 'registros'}</span>
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
            <strong>{summary.series}</strong>
            <span>{summary.series === 'N/D' ? 'Sin datos' : 'series'}</span>
          </div>
        </div>

        <div className="chart-legend">
          {items.map((item, index) => {
            const value = item[valueKey]
            const percent = total > 0 ? (value / total) * 100 : 0
            const marker = chartSeriesMarker(index)
            return (
              <div key={`${item[labelKey]}-${index}`} className="legend-row">
                <span className="legend-index">{chartSeriesBadge(index)}</span>
                <span
                  className={`legend-swatch legend-swatch-${marker}`}
                  style={{ '--series-color': chartColor(index) }}
                />
                <div className="legend-copy">
                  <strong title={String(item[labelKey] || '')}>{truncateText(item[labelKey], 42)}</strong>
                  <span className="legend-value">{value} / {formatPercent(percent)}</span>
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
  const items = normalizeCategoricalChartItems(data, labelKey, valueKey, { toNumber })
  const maxValue = Math.max(1, ...items.map((item) => item[valueKey]))

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
          const value = item[valueKey]
          const width = `${(value / maxValue) * 100}%`
          const marker = chartSeriesMarker(index)
          return (
            <div key={`${item[labelKey]}-${index}`} className="bar-chart-row">
              <div className="bar-chart-copy">
                <div className="bar-chart-label-group">
                  <span
                    className={`bar-chart-index bar-chart-index-${marker}`}
                    style={{ '--series-color': chartColor(index) }}
                  >
                    {chartSeriesBadge(index)}
                  </span>
                  <strong title={String(item[labelKey] || '')}>{truncateText(item[labelKey], 44)}</strong>
                </div>
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
    text: buildAssistantMessageText(payload),
    step: payload.paso || payload.contexto?.paso_actual || null,
    hint: payload.hint || null,
    options: Array.isArray(payload.opciones) ? payload.opciones.map(normalizeOption) : [],
    showCalculate: payload.paso === 'calcular' || payload.tipo === 'datos_suficientes_para_calculo'
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
  const [dashboardError, setDashboardError] = useState(null)
  const [dashboardScope, setDashboardScope] = useState('mine')
  const [messages, setMessages] = useState([])
  const [contexto, setContexto] = useState(emptyConversationContext())
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
  const [adminListLoading, setAdminListLoading] = useState(false)
  const [adminError, setAdminError] = useState(null)
  const [adminNotice, setAdminNotice] = useState(null)
  const [adminForm, setAdminForm] = useState({ ...EMPTY_ADMIN_FORM })
  const [adminReview, setAdminReview] = useState(null)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [uploadingDocument, setUploadingDocument] = useState(false)
  const [documentDraft, setDocumentDraft] = useState(null)
  const [documentForm, setDocumentForm] = useState(buildDocumentDraftForm(null))
  const dashboardRequestRef = useRef(0)
  const initRequestRef = useRef(0)
  const adminRequestRef = useRef(0)
  const adminMutationRef = useRef(0)
  const workspaceVersionRef = useRef(0)
  const chatRequestRef = useRef(0)
  const uploadRequestRef = useRef(0)
  const calculationRequestRef = useRef(0)
  const sendingRef = useRef(false)
  const calculatingRef = useRef(false)
  const uploadingDocumentRef = useRef(false)
  const contextoRef = useRef(contexto)
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const isAdmin = currentUser?.role === 'admin'
  const workspaceBusy = isWorkspaceBusy({ loading, sending, calculating, uploadingDocument })
  const documentDraftView = buildDocumentDraftView(documentDraft)
  const heroContent = isAdmin
    ? {
        title: 'Cotiza con precision, revisa requisitos y toma decisiones de importacion con mas claridad.',
        text:
          'Tu espacio privado reune cotizacion guiada, historial real y un panel claro para seguir la actividad de tu comunidad sin perder el foco operativo.',
        railA: {
          label: 'Operacion coordinada',
          title: 'Control sin friccion',
          text: 'Gestionas accesos, acompanias a tus miembros y sigues el avance de la comunidad desde la misma vista.'
        },
        railB: {
          label: 'Tu ventaja',
          title: 'Chat + trazabilidad',
          text: 'Cotizacion guiada, precision por componente y un panel real para seguir la operacion.'
        },
        status: {
          label: 'Visibilidad',
          title: 'Comunidad + actividad propia',
          text: 'Alternas entre la vista de comunidad y tu actividad para detectar movimiento, vacios y oportunidades mas rapido.'
        }
      }
    : {
        title: 'Cotiza con precision, revisa requisitos y toma decisiones de importacion con mas claridad.',
        text:
          'Tu espacio privado reune chat, calculo, permisos y trazabilidad en una sola experiencia para que avances mas rapido y con menos duda.',
        railA: {
          label: 'Tu experiencia',
          title: 'Cotizacion guiada',
          text: 'Respondes lo minimo y el sistema arma la operacion paso a paso sin volverte el proceso pesado.'
        },
        railB: {
          label: 'Tu ventaja',
          title: 'Precision visible',
          text: 'Cada cotizacion te muestra que dato tiene respaldo real, cual es estimado y que permisos debes revisar.'
          },
          status: {
            label: 'Tu cuenta',
            title: 'Acceso disponible',
            text: 'Tu cuenta puede cotizar, revisar historial y operar dentro de la comunidad.'
          }
        }

  const resultOperationSummary = buildResultOperationSummary(resultado, {
    objectiveLabels: OBJECTIVE_LABELS,
    insuranceModeLabels: INSURANCE_MODE_LABELS,
    subjectLabels: SUBJECT_LABELS,
    importerLabels: IMPORTER_LABELS
  })
  const resultAmountSummary = buildResultAmountSummary(resultado, formatMoney)
  const precisionView = buildPrecisionView(resultado?.precision, { precisionLabels: PRECISION_LABELS })
  const officialConsultation = resultado?.perfilImportacion?.validacionOficial || null
  const officialConsultationView = buildOfficialConsultationView(officialConsultation)
  const officialConsultationSummary = officialConsultationView.summary
  const regimenView = buildRegimenView(resultado?.perfilImportacion)
  const dashboardUnavailable = Boolean(dashboardError && !dashboard)
  const totalCotizacionesMetric = buildDashboardMetricDisplay({
    metric: dashboard?.kpis?.totalCotizaciones,
    unavailable: dashboardUnavailable,
    toNumber
  })
  const totalDolaresMetric = buildDashboardMetricDisplay({
    metric: dashboard?.kpis?.totalDolares,
    unavailable: dashboardUnavailable,
    formatter: (value) => formatMoney(value),
    toNumber
  })
  const ticketPromedioMetric = buildDashboardMetricDisplay({
    metric: dashboard?.kpis?.ticketPromedio,
    unavailable: dashboardUnavailable,
    formatter: (value) => formatMoney(value),
    toNumber
  })
  const paisesActivosMetric = buildDashboardMetricDisplay({
    metric: dashboard?.kpis?.paisesActivos,
    unavailable: dashboardUnavailable,
    mode: 'count',
    toNumber
  })
  const dashboardAnalysisView = buildDashboardAnalysisView(dashboardAnalysis)
  const dashboardAttentionView = buildDashboardAttentionView(dashboard)
  const adminUsersView = buildAdminUsersView({ users: adminUsers, isLoading: adminListLoading, error: adminError })

  const isCurrentAdminTarget = (user) => {
    if (!currentUser?.id || !user?.id) return false
    return String(currentUser.id) === String(user.id)
  }

  useEffect(() => {
    void bootSession()
  }, [])

  useEffect(() => {
    const container = messagesContainerRef.current
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, [messages, resultado])

  useEffect(() => {
    contextoRef.current = contexto
  }, [contexto])

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
    void refrescarDashboardSinBloquear(dashboardScope)
  }, [currentUser?.id, view, dashboardScope])

  const cargarDashboard = async (scopeOverride) => {
    const resolvedScope = scopeOverride || dashboardScope || defaultDashboardScopeFor(currentUser?.role)
    const requestId = dashboardRequestRef.current + 1
    dashboardRequestRef.current = requestId
    const [dashboardRes, analysisRes] = await Promise.allSettled([
      axios.get(`${API_URL}/api/dashboard`, { params: { scope: resolvedScope } }),
      axios.get(`${API_URL}/api/dashboard/analisis`, { params: { scope: resolvedScope } })
    ])

    if (isStaleDashboardResponse(requestId, dashboardRequestRef.current)) {
      return false
    }

    const nextState = buildDashboardRefreshPatch({
      dashboardResult: dashboardRes,
      analysisResult: analysisRes
    })

    setDashboard(nextState.dashboard)
    setDashboardAnalysis(nextState.dashboardAnalysis)
    setDashboardError(nextState.dashboardError)

    if (nextState.error) {
      throw nextState.error
    }

    return true
  }

  const refrescarDashboardSinBloquear = async (scopeOverride) => {
    try {
      await cargarDashboard(scopeOverride)
    } catch {
      // El estado visible ya queda normalizado dentro de cargarDashboard.
    }
  }

  const loadAdminUsers = async () => {
    if (!isAdmin) return

    const requestId = adminRequestRef.current + 1
    const mutationVersion = adminMutationRef.current
    adminRequestRef.current = requestId
    setAdminListLoading(true)
    setAdminError(null)

    try {
      const response = await axios.get(`${API_URL}/api/admin/users`)
      if (
        isStaleAdminResponse({
          requestId,
          latestRequestId: adminRequestRef.current,
          mutationVersion,
          latestMutationVersion: adminMutationRef.current
        })
      ) {
        return
      }

      setAdminUsers(normalizeAdminUsers(response.data?.users))
    } catch (requestError) {
      if (
        !isStaleAdminResponse({
          requestId,
          latestRequestId: adminRequestRef.current,
          mutationVersion,
          latestMutationVersion: adminMutationRef.current
        })
      ) {
        setAdminError(requestError.response?.data?.error || requestError.message)
      }
    } finally {
      if (
        !isStaleAdminResponse({
          requestId,
          latestRequestId: adminRequestRef.current,
          mutationVersion,
          latestMutationVersion: adminMutationRef.current
        })
      ) {
        setAdminListLoading(false)
      }
    }
  }

  const inicializar = async (scopeOverride = defaultDashboardScopeFor(currentUser?.role)) => {
    const requestId = initRequestRef.current + 1
    const workspaceVersion = workspaceVersionRef.current
    initRequestRef.current = requestId
    setLoading(true)
    setError(null)

    const resolvedScope = scopeOverride || defaultDashboardScopeFor(currentUser?.role)

    const [healthRes, dashboardRes, inicioRes] = await Promise.allSettled([
      axios.get(`${API_URL}/api/monitor/health`),
      axios.get(`${API_URL}/api/dashboard`, { params: { scope: resolvedScope } }),
      axios.post(`${API_URL}/api/agente-0/iniciar`)
    ])

    const nextState = buildInitializationPatch({
      healthResult: healthRes,
      dashboardResult: dashboardRes,
      startResult: inicioRes,
      buildStartMessages
    })

    if (
      isStaleWorkspaceResponse({
        requestId,
        latestRequestId: initRequestRef.current,
        workspaceVersion,
        latestWorkspaceVersion: workspaceVersionRef.current
      })
    ) {
      return false
    }

    setSalud(nextState.salud)
    setDashboard(nextState.dashboard)
    setDashboardAnalysis(nextState.dashboardAnalysis)
    setDashboardError(nextState.dashboardError)
    setMessages(nextState.messages)
    setContexto(nextState.contexto)

    if (nextState.error) {
      setError(nextState.error)
    }

    setLoading(false)
    return true
  }

  const applyLoggedOutSessionState = (notice = null) => {
    const nextState = buildLoggedOutSessionState({
      emptyAdminForm: EMPTY_ADMIN_FORM
    })

    workspaceVersionRef.current += 1
    initRequestRef.current += 1
    dashboardRequestRef.current += 1
    adminRequestRef.current += 1
    adminMutationRef.current += 1
    chatRequestRef.current += 1
    uploadRequestRef.current += 1
    calculationRequestRef.current += 1
    sendingRef.current = false
    calculatingRef.current = false
    uploadingDocumentRef.current = false
    setView(nextState.view)
    setLoading(nextState.loading)
    setSending(nextState.sending)
    setCalculating(nextState.calculating)
    setUploadingDocument(nextState.uploadingDocument)
    setCurrentUser(nextState.currentUser)
    setMembership(nextState.membership)
    setAdminUsers(nextState.adminUsers)
    setAdminLoading(nextState.adminLoading)
    setAdminListLoading(nextState.adminListLoading)
    setAdminError(nextState.adminError)
    setAdminNotice(nextState.adminNotice)
    setAdminForm(nextState.adminForm)
        setAdminReview(nextState.adminReview)
    setMessages(nextState.messages)
    setDashboard(nextState.dashboard)
    setDashboardAnalysis(nextState.dashboardAnalysis)
    setDashboardError(nextState.dashboardError)
    setDashboardScope(nextState.dashboardScope)
    setSalud(nextState.salud)
    setResultado(nextState.resultado)
    setDocumentDraft(nextState.documentDraft)
    setDocumentForm(nextState.documentForm)
    setContexto(nextState.contexto)
    setInput(nextState.input)
    setError(nextState.error)
    setAuthError(nextState.authError)
    setLoginForm(nextState.loginForm)
    setAuthNotice(notice)
  }

  const hydrateAuthenticatedSession = async (token) => {
    workspaceVersionRef.current += 1
    setAuthToken(token)

    const [meRes, membershipRes] = await Promise.allSettled([
      axios.get(`${API_URL}/api/auth/me`),
      axios.get(`${API_URL}/api/membresias/mi-membresia`)
    ])

    if (meRes.status !== 'fulfilled') {
      clearAuthToken()
      throw new Error('La sesion ya no esta activa.')
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
      clearAuthToken()
      applyLoggedOutSessionState('Tu sesion anterior ya no estaba disponible. Ingresa otra vez.')
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
    if (!message || sendingRef.current || calculatingRef.current) return

    const requestId = chatRequestRef.current + 1
    const workspaceVersion = workspaceVersionRef.current
    chatRequestRef.current = requestId

    pushUserMessage(displayText)
    setInput('')
    sendingRef.current = true
    setSending(true)
    setError(null)

    try {
      const response = await axios.post(`${API_URL}/api/agente-0/chat`, {
        mensaje: message,
        contexto: contextoRef.current
      })

      if (
        isStaleWorkspaceResponse({
          requestId,
          latestRequestId: chatRequestRef.current,
          workspaceVersion,
          latestWorkspaceVersion: workspaceVersionRef.current
        })
      ) {
        return
      }

      setContexto(response.data.contexto || contextoRef.current)
      setMessages((current) => [...current, assistantMessage(response.data)])
    } catch (requestError) {
      if (
        !isStaleWorkspaceResponse({
          requestId,
          latestRequestId: chatRequestRef.current,
          workspaceVersion,
          latestWorkspaceVersion: workspaceVersionRef.current
        })
      ) {
        setError(requestError.response?.data?.error || requestError.message)
      }
    } finally {
      if (
        !isStaleWorkspaceResponse({
          requestId,
          latestRequestId: chatRequestRef.current,
          workspaceVersion,
          latestWorkspaceVersion: workspaceVersionRef.current
        })
      ) {
        sendingRef.current = false
        setSending(false)
      }
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
    workspaceVersionRef.current += 1
    chatRequestRef.current += 1
    uploadRequestRef.current += 1
    calculationRequestRef.current += 1
    sendingRef.current = false
    calculatingRef.current = false
    uploadingDocumentRef.current = false
    setSending(false)
    setCalculating(false)
    setUploadingDocument(false)
    setResultado(null)
    setDocumentDraft(null)
    setDocumentForm(buildDocumentDraftForm(null))
    await inicializar(dashboardScope)
  }

  const handleDocumentFieldChange = (field, value) => {
    setDocumentForm((current) => buildDocumentFieldChangeState({
      currentForm: current,
      field,
      value
    }).documentForm)
    setResultado(null)
  }

  const handleSupplierDocumentUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file || uploadingDocumentRef.current || calculatingRef.current) return

    const requestId = uploadRequestRef.current + 1
    const workspaceVersion = workspaceVersionRef.current + 1
    uploadRequestRef.current = requestId
    workspaceVersionRef.current = workspaceVersion

    uploadingDocumentRef.current = true
    setUploadingDocument(true)
    setError(null)
    setResultado(null)
    setDocumentDraft(null)
    setDocumentForm(buildDocumentDraftForm(null))

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await axios.post(`${API_URL}/api/auto-cotizar/extraer`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      if (!response.data?.ok) {
        throw new Error(response.data?.error || 'No pude extraer la cotizacion del proveedor.')
      }

      if (
        isStaleWorkspaceResponse({
          requestId,
          latestRequestId: uploadRequestRef.current,
          workspaceVersion,
          latestWorkspaceVersion: workspaceVersionRef.current
        })
      ) {
        return
      }

      const uploadState = buildDocumentUploadSuccessState(file.name, response.data)
      const detectedItems = buildDocumentDraftView(uploadState.documentDraft).itemCount
      setDocumentDraft(uploadState.documentDraft)
      setDocumentForm(uploadState.documentForm)
      setResultado(uploadState.resultado)

      setMessages((current) => [
        ...current,
        {
          id: createId('assistant'),
          role: 'assistant',
          text: `Analice ${file.name} y detecte ${detectedItems} item(s). Puedes revisar el borrador y calcular directo desde el documento.`,
          options: [],
          hint: response.data.mensaje || null,
          showCalculate: false
        }
      ])
    } catch (requestError) {
      if (
        !isStaleWorkspaceResponse({
          requestId,
          latestRequestId: uploadRequestRef.current,
          workspaceVersion,
          latestWorkspaceVersion: workspaceVersionRef.current
        })
      ) {
        setError(requestError.response?.data?.error || requestError.message)
      }
    } finally {
      if (
        !isStaleWorkspaceResponse({
          requestId,
          latestRequestId: uploadRequestRef.current,
          workspaceVersion,
          latestWorkspaceVersion: workspaceVersionRef.current
        })
      ) {
        uploadingDocumentRef.current = false
        setUploadingDocument(false)
      }
      event.target.value = ''
    }
  }

  const calcularDesdeDocumento = async () => {
    if (calculatingRef.current || uploadingDocumentRef.current || sendingRef.current) {
      return
    }

      const payload = buildDocumentCalculationPayload(documentDraft, documentForm)

      if (!payload.items.length) {
        setError('Todavia no hay un borrador de documento con datos suficientes para calcular.')
        return
      }

    if (!payload.items.every((item) => item.unit > 0)) {
      setError('Revisa el documento: todos los items deben tener precio unitario numerico positivo.')
      return
    }

    const requestId = calculationRequestRef.current + 1
    const workspaceVersion = workspaceVersionRef.current
    calculationRequestRef.current = requestId

    calculatingRef.current = true
    setCalculating(true)
    setError(null)

    try {
      const response = await axios.post(`${API_URL}/api/auto-cotizar/calcular`, payload)

      if (
        isStaleWorkspaceResponse({
          requestId,
          latestRequestId: calculationRequestRef.current,
          workspaceVersion,
          latestWorkspaceVersion: workspaceVersionRef.current
        })
      ) {
        return
      }

      setResultado(response.data)
      await refrescarDashboardSinBloquear()
    } catch (requestError) {
      if (
        !isStaleWorkspaceResponse({
          requestId,
          latestRequestId: calculationRequestRef.current,
          workspaceVersion,
          latestWorkspaceVersion: workspaceVersionRef.current
        })
      ) {
        setError(requestError.response?.data?.error || requestError.message)
      }
    } finally {
      if (
        !isStaleWorkspaceResponse({
          requestId,
          latestRequestId: calculationRequestRef.current,
          workspaceVersion,
          latestWorkspaceVersion: workspaceVersionRef.current
        })
      ) {
        calculatingRef.current = false
        setCalculating(false)
      }
    }
  }

  const calcularCotizacion = async () => {
    if (calculatingRef.current || sendingRef.current || uploadingDocumentRef.current) {
      return
    }

    const payload = buildCalculationPayload(contextoRef.current)

    if (!payload.items.length) {
      setError('Todavia no hay productos capturados para calcular.')
      return
    }

    if (!payload.items.every((item) => item.unit > 0)) {
      setError('Falta capturar un precio unitario numerico positivo.')
      return
    }

    const requestId = calculationRequestRef.current + 1
    const workspaceVersion = workspaceVersionRef.current
    calculationRequestRef.current = requestId

    calculatingRef.current = true
    setCalculating(true)
    setError(null)

    try {
      const response = await axios.post(`${API_URL}/api/agente/calcular`, payload)

      if (
        isStaleWorkspaceResponse({
          requestId,
          latestRequestId: calculationRequestRef.current,
          workspaceVersion,
          latestWorkspaceVersion: workspaceVersionRef.current
        })
      ) {
        return
      }

      setResultado(response.data)
      setView('cotizador')
      await refrescarDashboardSinBloquear()
    } catch (requestError) {
      if (
        !isStaleWorkspaceResponse({
          requestId,
          latestRequestId: calculationRequestRef.current,
          workspaceVersion,
          latestWorkspaceVersion: workspaceVersionRef.current
        })
      ) {
        setError(requestError.response?.data?.error || requestError.message)
      }
    } finally {
      if (
        !isStaleWorkspaceResponse({
          requestId,
          latestRequestId: calculationRequestRef.current,
          workspaceVersion,
          latestWorkspaceVersion: workspaceVersionRef.current
        })
      ) {
        calculatingRef.current = false
        setCalculating(false)
      }
    }
  }

  const handleLoginSubmit = async (event) => {
    event.preventDefault()
    setAuthError(null)
    setAuthNotice(null)
    setAuthLoading(true)

    try {
        const response = await axios.post(`${API_URL}/api/auth/login`, normalizeLoginPayload(loginForm))
        await hydrateAuthenticatedSession(response.data.token)
        setLoginForm({ email: '', password: '' })
        setAuthNotice('Sesion iniciada. Ya puedes usar la comunidad.')
      } catch (requestError) {
        setLoginForm((current) => ({ ...current, password: '' }))
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
      const response = await axios.post(`${API_URL}/api/admin/users`, normalizeAdminFormPayload(adminForm))
      adminMutationRef.current += 1
      setAdminUsers((current) => upsertAdminUser(current, response.data.user))
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
      adminMutationRef.current += 1
      setAdminUsers((current) => upsertAdminUser(current, updatedUser))

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

  const openAdminReview = (config) => {
    setAdminError(null)
    setAdminNotice(null)
    setAdminReview(config)
  }

  const closeAdminReview = () => {
    if (adminLoading) return
    setAdminReview(null)
  }

  const handleAdminToggleActive = async (user) => {
    if (isCurrentAdminTarget(user)) {
      setAdminError('No puedes suspender o reactivar tu propia cuenta desde este panel.')
      return
    }

    openAdminReview({
      type: user.active ? 'suspend' : 'reactivate',
      user,
      patch: { active: !user.active },
      successMessage: user.active
        ? `Acceso suspendido para ${user.email}.`
        : `Acceso actualizado para ${user.email}.`,
      message: user.active
        ? `Vas a suspender el acceso de ${user.email}. No podra entrar hasta que lo reactives.`
        : `Vas a reactivar el acceso de ${user.email}. Podra volver a ingresar segun su rol actual.`
    })
  }

  const handleAdminToggleApproved = async (user) => {
    if (isCurrentAdminTarget(user)) {
      setAdminError('No puedes revocar tu propia aprobacion desde este panel.')
      return
    }

    openAdminReview({
      type: user.approved ? 'revoke_approval' : 'approve',
      user,
      patch: { approved: !user.approved },
      successMessage: user.approved
        ? `Aprobacion revocada para ${user.email}.`
        : `Aprobacion concedida para ${user.email}.`,
      message: user.approved
        ? `Vas a revocar la aprobacion de ${user.email}. La cuenta seguira existiendo, pero ya no podra operar hasta volver a aprobarla.`
        : `Vas a aprobar a ${user.email}. La cuenta podra operar si tambien esta activa.`
    })
  }

  const handleAdminToggleRole = async (user) => {
    if (isCurrentAdminTarget(user)) {
      setAdminError('No puedes cambiar tu propio rol admin desde este panel.')
      return
    }

    const nextRole = user.role === 'admin' ? 'user' : 'admin'
    openAdminReview({
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
    openAdminReview({
      type: 'reset_password',
      user,
      password: '',
      message: `Vas a reemplazar la contrasena de ${user.email}. Define una clave temporal segura para compartirla luego por un canal confiable.`
    })
  }

  const handleAdminReviewAction = async () => {
    if (!adminReview) return

    const action = adminReview

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
        setAdminReview(null)
      } catch (requestError) {
        setAdminError(requestError.response?.data?.error || requestError.message)
      } finally {
        setAdminLoading(false)
      }

      return
    }

    setAdminReview(null)
    await patchAdminUser(action.user.id, action.patch, action.successMessage)
  }

  const handleLogout = () => {
    clearAuthToken()
    applyLoggedOutSessionState('Sesion cerrada. El acceso sigue siendo privado.')
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
              <h1>Cotiza con precision, revisa requisitos y toma decisiones de importacion con mas claridad.</h1>
              <p className="hero-text">
                Una plataforma privada para miembros de Broke Shop que concentra cotizacion, revision y trazabilidad
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
              <h2>Entra a tu espacio de comunidad</h2>
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
    return <div className="page-state page-state-brand">Preparando tu espacio privado...</div>
  }

  const healthStatusView = buildHealthStatusView(salud)

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
              <small>{ROLE_LABELS[currentUser?.role] || 'Miembro'} / {MEMBERSHIP_LABELS[membership?.nivel] || 'Acceso privado'}</small>
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
            <div className={`status-pill ${healthStatusView.statusClass}`}>
              <span className="status-dot" />
              {healthStatusView.label}
            </div>

            <div className="hero-actions">
              <button
                type="button"
                className={`tab-button ${view === 'cotizador' ? 'active' : ''}`}
                onClick={() => setView('cotizador')}
              >
                Espacio
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
                  <p>Responde lo minimo. El sistema construye tu operacion y te dice que tan confiable es cada dato.</p>
                </div>
                <button type="button" className="ghost-button" onClick={reiniciar} disabled={workspaceBusy}>
                  Reiniciar flujo
                </button>
              </div>

              <div className="quick-prompts">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="prompt-chip"
                    onClick={() => enviarMensaje(prompt)}
                    disabled={workspaceBusy}
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <section className="document-intake-card">
                <div className="document-intake-head">
                  <div>
                    <p className="panel-kicker">Documento del proveedor</p>
                    <h3>Sube la cotizacion del proveedor</h3>
                    <p>PDF, DOCX, XLSX, CSV o imagen. Si tienes valores reales, puedes corregirlos antes de calcular.</p>
                  </div>

                  <label className={`ghost-button file-picker-button ${workspaceBusy ? 'is-disabled' : ''}`}>
                    <input
                      type="file"
                      accept={SUPPLIER_FILE_ACCEPT}
                      className="hidden-file-input"
                      onChange={handleSupplierDocumentUpload}
                      disabled={workspaceBusy}
                    />
                    <span>{uploadingDocument ? 'Procesando...' : (workspaceBusy ? 'Espera...' : 'Subir archivo')}</span>
                  </label>
                </div>

                {documentDraft ? (
                  <div className="document-draft">
                    <div className="document-draft-meta">
                      <span>Archivo: <strong>{documentDraft.fileName}</strong></span>
                      <span>Confianza: <strong>{documentDraftView.confidence === null ? 'N/D' : `${documentDraftView.confidence}%`}</strong></span>
                      <span>Items: <strong>{documentDraftView.itemCount}</strong></span>
                    </div>

                    <div className="document-form-grid">
                      <label>
                        <span>Proveedor</span>
                        <input
                          value={documentForm.proveedor}
                          onChange={(event) => handleDocumentFieldChange('proveedor', event.target.value)}
                          placeholder="Proveedor detectado"
                          disabled={uploadingDocument || calculating}
                        />
                      </label>

                      <label>
                        <span>Pais</span>
                        <input
                          value={documentForm.pais}
                          onChange={(event) => handleDocumentFieldChange('pais', event.target.value)}
                          placeholder="CN, US, China..."
                          disabled={uploadingDocument || calculating}
                        />
                      </label>

                      <label>
                        <span>Incoterm</span>
                        <input
                          value={documentForm.incoterm}
                          onChange={(event) => handleDocumentFieldChange('incoterm', event.target.value.toUpperCase())}
                          placeholder="FOB"
                          disabled={uploadingDocument || calculating}
                        />
                      </label>

                      <label>
                        <span>Canal</span>
                        <select
                          value={documentForm.canal}
                          onChange={(event) => handleDocumentFieldChange('canal', event.target.value)}
                          disabled={uploadingDocument || calculating}
                        >
                          <option value="MARITIMO">Maritimo</option>
                          <option value="AEREO">Aereo</option>
                          <option value="COURIER">Courier</option>
                          <option value="POSTAL">Postal</option>
                          <option value="POSTAL_FRANQUICIA">Postal con franquicia</option>
                        </select>
                      </label>

                      <label>
                        <span>Tipo de sujeto</span>
                        <select
                          value={documentForm.tipoSujeto}
                          onChange={(event) => handleDocumentFieldChange('tipoSujeto', event.target.value)}
                          disabled={uploadingDocument || calculating}
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
                          disabled={uploadingDocument || calculating}
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
                          disabled={uploadingDocument || calculating}
                        />
                      </label>

                      <label>
                        <span>Modo de seguro</span>
                        <select
                          value={documentForm.seguroModo}
                          onChange={(event) => handleDocumentFieldChange('seguroModo', event.target.value)}
                          disabled={uploadingDocument || calculating}
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
                          disabled={uploadingDocument || calculating || documentForm.seguroModo !== 'REAL'}
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
                          disabled={uploadingDocument || calculating}
                        />
                      </label>

                      <label>
                        <span>Tipo de importador</span>
                        <select
                          value={documentForm.tipoImportador}
                          onChange={(event) => handleDocumentFieldChange('tipoImportador', event.target.value)}
                          disabled={uploadingDocument || calculating}
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
                          disabled={uploadingDocument || calculating}
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
                          disabled={uploadingDocument || calculating || documentForm.objetivoCalculo === 'costo_importacion'}
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
                      {documentDraftView.items.slice(0, 4).map((item) => (
                        <div key={`${item.index}-${item.desc}`} className="document-item-chip">
                          <strong title={`${item.qty} x ${item.desc}`}>{truncateText(`${item.qty} x ${item.desc}`, 64)}</strong>
                          <span>{item.unit === null ? 'Pendiente' : formatMoney(item.unit)}</span>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="primary-button full-width"
                      onClick={calcularDesdeDocumento}
                      disabled={sending || calculating || uploadingDocument}
                    >
                      {uploadingDocument ? 'Procesando documento...' : (calculating ? 'Calculando...' : 'Calcular desde documento')}
                    </button>
                  </div>
                ) : (
                  <div className="document-empty-state">
                    Sube una cotizacion del proveedor y el sistema armara un borrador editable antes del calculo.
                  </div>
                )}
              </section>

              <div className="messages" ref={messagesContainerRef}>
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
                            disabled={workspaceBusy}
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
                          disabled={workspaceBusy}
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
                  disabled={sending || calculating || uploadingDocument}
                />
                <button type="submit" className="primary-button" disabled={sending || calculating || uploadingDocument || !input.trim()}>
                  Enviar
                </button>
              </form>
            </article>

            <aside className="sidebar">
              <section className="panel summary-panel">
                <div className="panel-head compact">
                  <div>
                    <p className="panel-kicker">Contexto actual</p>
                    <h2>Resumen detectado</h2>
                    <p>Lo que el chat ya entiende de tu operacion.</p>
                  </div>
                </div>

                <div className="summary-list">
                  {buildWorkspaceSummaryRows(contexto, {
                    toNumber,
                    formatMoney,
                    channelLabels: CHANNEL_LABELS,
                    objectiveLabels: OBJECTIVE_LABELS,
                    subjectLabels: SUBJECT_LABELS,
                    insuranceModeLabels: INSURANCE_MODE_LABELS,
                    importerLabels: IMPORTER_LABELS,
                    productConditionLabels: PRODUCT_CONDITION_LABELS,
                  }).map((row) => (
                    <div key={row.label} className="summary-row">
                      <span>{row.label}</span>
                      <strong title={String(row.value ?? '')}>{truncateText(row.value, row.label === 'Productos' ? 96 : 68)}</strong>
                    </div>
                  ))}
                </div>

                <button type="button" className="primary-button full-width" onClick={calcularCotizacion} disabled={workspaceBusy}>
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
                    <p>Tu cotizacion aparece aqui con confiabilidad por componente.</p>
                  </div>
                </div>

                {resultado?.procesado ? (
                  <div className="result-content">
                    <div className="result-highlight">
                      <span>Total landed</span>
                      <strong>{resultAmountSummary.totalLanded}</strong>
                    </div>

                    {precisionView.shouldRender ? (
                      <div className={`precision-card ${precisionTone(resultado.precision)}`}>
                        <div className="precision-head">
                          <span>Precision global</span>
                          <strong>
                            {precisionView.levelLabel} ({precisionView.scoreDisplay})
                          </strong>
                        </div>
                        <p>{precisionView.summary}</p>

                        {precisionView.motivos.length ? (
                          <div className="precision-reasons">
                            {precisionView.motivos.slice(0, 3).map((motivo, index) => (
                              <div key={`${motivo.codigo}-${index}`} className="precision-reason">
                                {motivo.mensaje}
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {precisionView.componentes.length ? (
                          <div className="precision-components">
                            {precisionView.componentes.map((component) => (
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
                        <strong>{resultAmountSummary.fob}</strong>
                      </div>
                      <div>
                        <span>Flete</span>
                        <strong>{resultAmountSummary.flete}</strong>
                      </div>
                      <div>
                        <span>Seguro</span>
                        <strong>{resultAmountSummary.seguro}</strong>
                      </div>
                      <div>
                        <span>Tributos</span>
                        <strong>{resultAmountSummary.tributos}</strong>
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
                            <p>{resultOperationSummary.objetivoCalculo}</p>
                          </article>
                          <article className="list-card result-card">
                            <strong>Seguro</strong>
                            <p>{resultOperationSummary.seguro}</p>
                          </article>
                          <article className="list-card result-card">
                            <strong>Perfil</strong>
                            <p>{resultOperationSummary.perfil}</p>
                          </article>
                        </div>
                      </div>
                    ) : null}

                    {resultado.perfilImportacion ? (
                      <>
                        <div className="result-subsection">
                          <div className="result-subsection-head">
                            <h3>Escenario aduanero</h3>
                            <span>{regimenView.title}</span>
                          </div>

                          <div className="simple-list">
                            <article className="list-card result-card">
                              <strong>{regimenView.title}</strong>
                              <p>{regimenView.detail}</p>
                              {regimenView.umbral ? (
                                <p className="muted-line">Tramo: {regimenView.umbral}</p>
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

              {officialConsultationView.shouldRender ? (
                          <div className="result-subsection">
                            <div className="result-subsection-head">
                      <h3>Consulta oficial en vivo</h3>
                              <span>
                      {officialConsultationView.source} / {formatDateTime(officialConsultationView.updatedAt)}
                              </span>
                            </div>

                            <div className="simple-list">
                              <article className="list-card result-card">
                                <strong>Resumen oficial por subpartida</strong>
                                <p>
                        {officialConsultationSummary.consultadas}
                                  {' '}subpartida(s) consultadas,{' '}
                        {officialConsultationSummary.conveniosDetectados}
                                  {' '}con convenio(s) detectado(s) y{' '}
                        {officialConsultationSummary.restriccionesDetectadas}
                                  {' '}restriccion(es) oficial(es).
                                </p>
                                {officialConsultationView.truncated ? (
                                  <p className="muted-line">
                                    Se consulto una muestra prioritaria para no volver lento el calculo. Detectadas:{' '}
                                    {officialConsultationView.totalDetectadas}
                                  </p>
                                ) : null}
                              </article>

                      {!officialConsultationView.hasSubpartidas && officialConsultationView.emptyMessage ? (
                                <article className="list-card result-card medio">
                                  <strong>Sin detalle por subpartida</strong>
                          <p>{officialConsultationView.emptyMessage}</p>
                                </article>
                              ) : null}

                              {officialConsultationView.subpartidas.map((subpartida) => (
                                <article key={subpartida.partida} className={`list-card result-card ${subpartida.oficialEnVivo ? 'info' : 'medio'}`}>
                                  <strong>
                                    {subpartida.partida}
                                    {subpartida.descripcion ? ` - ${subpartida.descripcion}` : ''}
                                  </strong>
                                  {subpartida.tipoProducto ? <p>{subpartida.tipoProducto}</p> : null}
                                  {Array.isArray(subpartida.resumenTributos) && subpartida.resumenTributos.length ? (
                                    <p className="muted-line">
                                  {subpartida.resumenTributos.map((tributo) => `${tributo.etiqueta}: ${tributo.valor}`).join(' / ')}
                                    </p>
                                  ) : null}
                                  {subpartida.convenio ? (
                                    <p>
                                      Convenio: {subpartida.convenio.acuerdo} ({subpartida.convenio.pais})
                                  {subpartida.convenio.arancelBasePreferencial ? ` / ${subpartida.convenio.arancelBasePreferencial}` : ''}
                                  {subpartida.convenio.porcentajeLiberadoAdv ? ` / liberacion ${subpartida.convenio.porcentajeLiberadoAdv}` : ''}
                                    </p>
                                  ) : (
                                    <p className="muted-line">Sin convenio preferencial detectado para el pais consultado.</p>
                                  )}
                                  {subpartida.restricciones?.total ? (
                                    <p>
                                      Restricciones: {subpartida.restricciones.total}
                                      {Array.isArray(subpartida.restricciones.entidades) && subpartida.restricciones.entidades.length
                                    ? ` / control: ${subpartida.restricciones.entidades.join(', ')}`
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
                                Fuente: {subpartida.fuente} / {subpartida.oficialEnVivo ? 'oficial en vivo' : 'fallback/cache'} / {formatDateTime(subpartida.actualizado)}
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

                    {resultAmountSummary.totalPEN ? (
                      <div className="result-pen">
                        Total referencial en soles: <strong>{resultAmountSummary.totalPEN}</strong>
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

              <button type="button" className="ghost-button" onClick={loadAdminUsers} disabled={adminListLoading}>
                {adminListLoading ? 'Actualizando...' : 'Actualizar lista'}
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
                  {adminUsersView.hasUsers ? adminUsersView.users.map((user) => (
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
                      <p>
                        {adminUsersView.showLoadingState
                          ? adminUsersView.loadingMessage
                          : adminUsersView.showErrorState
                            ? adminUsersView.errorMessage
                            : adminUsersView.emptyMessage}
                      </p>
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
                <strong>{totalCotizacionesMetric.value}</strong>
                <small>{totalCotizacionesMetric.delta}</small>
              </div>
              <div className="kpi-card">
                <span>Total dolares</span>
                <strong>{totalDolaresMetric.value}</strong>
                <small>{totalDolaresMetric.delta}</small>
              </div>
              <div className="kpi-card">
                <span>Ticket promedio</span>
                <strong>{ticketPromedioMetric.value}</strong>
                <small>{ticketPromedioMetric.delta}</small>
              </div>
              <div className="kpi-card">
                <span>Paises activos</span>
                <strong>{paisesActivosMetric.value}</strong>
                <small>{paisesActivosMetric.delta}</small>
              </div>
            </div>

            {dashboardError ? (
              <div className="empty-dashboard">
                <h3>No pude cargar el dashboard</h3>
                <p>{dashboardError}</p>
              </div>
            ) : dashboard?.meta?.hayDatos ? (
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
                      {dashboardAnalysisView.insights.map((item, index) => (
                        <article key={`insight-${index}`} className="list-card">
                          <strong>Insight {index + 1}</strong>
                          <p>{item}</p>
                        </article>
                      ))}

                      {dashboardAnalysisView.oportunidades.map((item, index) => (
                        <article key={`op-${index}`} className="list-card">
                          <strong>Oportunidad {index + 1}</strong>
                          <p>{item}</p>
                        </article>
                      ))}

                      {dashboardAnalysisView.alerta ? (
                        <article className="list-card">
                          <strong>Alerta IA</strong>
                          <p>{dashboardAnalysisView.alerta}</p>
                        </article>
                      ) : null}

                      {dashboardAnalysisView.recomendacion ? (
                        <article className="list-card">
                          <strong>Recomendacion</strong>
                          <p>{dashboardAnalysisView.recomendacion}</p>
                        </article>
                      ) : null}

                      {!dashboardAnalysisView.hasContent ? (
                        <article className="list-card">
                          <strong>Analisis no disponible</strong>
                          <p>La lectura ejecutiva todavia no devolvio contenido util para este dashboard.</p>
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
                      {dashboardAttentionView.tendencias.map((item) => (
                        <article key={item.titulo} className="list-card">
                          <strong>{item.titulo}</strong>
                          <p>{item.descripcion}</p>
                        </article>
                      ))}

                      {dashboardAttentionView.alertas.map((item) => (
                        <article key={item.id || item.titulo} className="list-card">
                          <strong>{item.titulo}</strong>
                          <p>{item.mensaje}</p>
                        </article>
                      ))}

                      {!dashboardAttentionView.hasContent ? (
                        <article className="list-card">
                          <strong>Sin novedades destacadas</strong>
                          <p>No hay tendencias ni alertas relevantes para mostrar en este momento.</p>
                        </article>
                      ) : null}
                    </div>
                  </section>
                </div>
              </div>
            ) : (
              <div className="empty-dashboard">
                <h3>Sin historial todavia</h3>
                <p>
                  {isAdmin
                    ? 'El panel de comunidad empezara a mostrar actividad cuando existan cotizaciones reales guardadas por tus miembros.'
                    : 'Tu panel personal empezara a mostrar actividad cuando guardes tus primeras cotizaciones reales.'}
                </p>
              </div>
            )}
          </section>
        )}
      </main>

      {adminReview ? (
        <div className="admin-review-overlay" role="presentation" onClick={closeAdminReview}>
          <section
            className={`admin-review-dialog ${ADMIN_REVIEW_COPY[adminReview.type]?.tone || 'info'}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-review-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="panel-kicker">Revision requerida</p>
            <h2 id="admin-review-title">
              {ADMIN_REVIEW_COPY[adminReview.type]?.title || 'Revisar accion'}
            </h2>
            <p>{adminReview.message}</p>

            <div className="admin-review-target">
              <strong>{adminReview.user?.name || adminReview.user?.email}</strong>
              <span>{adminReview.user?.email}</span>
            </div>

            {adminReview.type === 'reset_password' ? (
              <label className="admin-review-field">
                <span>Nueva contrasena temporal</span>
                <input
                  type="text"
                  value={adminReview.password || ''}
                  onChange={(event) =>
                    setAdminReview((current) => (current ? { ...current, password: event.target.value } : current))
                  }
                  placeholder="Minimo 6 caracteres"
                  autoFocus
                />
              </label>
            ) : null}

            <div className="admin-review-actions">
              <button type="button" className="ghost-button" onClick={closeAdminReview} disabled={adminLoading}>
                Cancelar
              </button>
              <button type="button" className="primary-button" onClick={handleAdminReviewAction} disabled={adminLoading}>
                {adminLoading ? 'Procesando...' : (ADMIN_REVIEW_COPY[adminReview.type]?.actionLabel || 'Revisar')}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

export default App
