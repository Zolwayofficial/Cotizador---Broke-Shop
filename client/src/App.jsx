import { useEffect, useRef, useState } from 'react'
import axios from 'axios'

const API_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')

const CHANNEL_LABELS = {
  DEFINITIVA: 'Importación definitiva',
  COURIER: 'Courier',
  POSTAL: 'Postal'
}

const IMPORTER_LABELS = {
  general: 'Importador general',
  nuevo: 'Nuevo importador',
  buen_contribuyente: 'Buen contribuyente'
}

const QUICK_PROMPTS = [
  '500 camisetas de algodón',
  '120 laptops gamer',
  '80 repuestos automotrices'
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

function normalizeOption(option) {
  if (typeof option === 'string') {
    return { value: option, label: option }
  }

  return {
    value: option?.value ?? option?.label ?? '',
    label: option?.label ?? option?.value ?? ''
  }
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

  const sharedGreeting =
    first.includes('hola') &&
    second.includes('hola') &&
    first.includes('asistente de importaciones') &&
    second.includes('asistente de importaciones')

  return sharedGreeting
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

  return {
    items: productos.map((producto, index) => ({
      desc: producto.descripcion || producto.producto || `Producto ${index + 1}`,
      qty: toNumber(producto.cantidad || producto.qty || 1),
      unit: toNumber(datos.precio_unitario)
    })),
    pais: datos.pais_origen || '',
    canal: datos.canal || 'DEFINITIVA',
    incoterm: datos.incoterm || 'FOB',
    flete: toNumber(datos.flete),
    seguro: toNumber(datos.seguro),
    tc: toNumber(datos.tipo_cambio),
    proveedor: datos.proveedor || '',
    moneda: 'USD',
    tipoImportador: datos.tipo_importador || 'general',
    margenVenta: toNumber(datos.margen_venta || 30)
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
        : 'Aún no definidos'
    },
    {
      label: 'País de origen',
      value: datos.pais_origen || 'Pendiente'
    },
    {
      label: 'Canal',
      value: CHANNEL_LABELS[datos.canal] || 'Pendiente'
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
      label: 'Tipo de importador',
      value: IMPORTER_LABELS[datos.tipo_importador] || 'Pendiente'
    }
  ]
}

function healthLabel(status) {
  if (!status) return 'Sin datos'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function App() {
  const [view, setView] = useState('cotizador')
  const [salud, setSalud] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [messages, setMessages] = useState([])
  const [contexto, setContexto] = useState({ datos_previos: {}, paso_actual: null })
  const [input, setInput] = useState('')
  const [resultado, setResultado] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [error, setError] = useState(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    void inicializar()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, resultado])

  const cargarDashboard = async () => {
    const response = await axios.get(`${API_URL}/api/dashboard`)
    setDashboard(response.data)
  }

  const inicializar = async () => {
    setLoading(true)
    setError(null)

    const [healthRes, dashboardRes, inicioRes] = await Promise.allSettled([
      axios.get(`${API_URL}/api/monitor/health`),
      axios.get(`${API_URL}/api/dashboard`),
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
    } catch (err) {
      setError(err.response?.data?.error || err.message)
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
    await inicializar()
  }

  const calcularCotizacion = async () => {
    const payload = buildCalculationPayload(contexto)

    if (!payload.items.length) {
      setError('Todavía no hay productos capturados para calcular.')
      return
    }

    if (!payload.items.every((item) => item.unit > 0)) {
      setError('Falta capturar un precio unitario válido.')
      return
    }

    setCalculating(true)
    setError(null)

    try {
      const response = await axios.post(`${API_URL}/api/agente/calcular`, payload)
      setResultado(response.data)
      setView('cotizador')
      await cargarDashboard()
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setCalculating(false)
    }
  }

  if (loading) {
    return <div className="page-state">Cargando cotizador...</div>
  }

  return (
    <div className="app-shell">
      <div className="app-backdrop" />

      <main className="app-layout">
        <header className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Cotizador Perú Ultimate v3.0</p>
            <h1>Calcula importaciones paso a paso desde el chat</h1>
            <p className="hero-text">
              La portada ahora abre en modo cotización guiada. El dashboard quedó como panel secundario y solo muestra
              datos reales cuando existen cotizaciones guardadas.
            </p>
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
                Cotizar
              </button>
              <button
                type="button"
                className={`tab-button ${view === 'dashboard' ? 'active' : ''}`}
                onClick={() => setView('dashboard')}
              >
                Dashboard
              </button>
            </div>
          </div>
        </header>

        {error ? <div className="banner-error">{error}</div> : null}

        {view === 'cotizador' ? (
          <section className="workspace">
            <article className="chat-panel">
              <div className="panel-head">
                <div>
                  <h2>Chat de cotización</h2>
                  <p>Responde lo mínimo y el sistema arma tu cotización importadora.</p>
                </div>
                <button type="button" className="ghost-button" onClick={reiniciar}>
                  Reiniciar
                </button>
              </div>

              <div className="quick-prompts">
                {QUICK_PROMPTS.map((prompt) => (
                  <button key={prompt} type="button" className="prompt-chip" onClick={() => enviarMensaje(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>

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
                          {calculating ? 'Calculando...' : 'Calcular cotización'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}

                {sending ? (
                  <div className="message assistant">
                    <div className="message-bubble loading-bubble">Pensando la siguiente pregunta...</div>
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
                    <h2>Resumen capturado</h2>
                    <p>Lo que el chat ya entendió de tu operación.</p>
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

              <section className="panel result-panel">
                <div className="panel-head compact">
                  <div>
                    <h2>Resultado</h2>
                    <p>La cotización calculada aparecerá aquí.</p>
                  </div>
                </div>

                {resultado?.exito ? (
                  <div className="result-content">
                    <div className="result-highlight">
                      <span>Total real</span>
                      <strong>{formatMoney(resultado.totales?.totalReal)}</strong>
                    </div>

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
                  </div>
                ) : (
                  <div className="empty-card">
                    <p>
                      Cuando completes el flujo y pulses <strong>Calcular</strong>, aquí verás totales, tributos y alertas
                      de importación.
                    </p>
                  </div>
                )}
              </section>
            </aside>
          </section>
        ) : (
          <section className="dashboard-panel">
            <div className="panel-head">
              <div>
                <h2>Panel real de actividad</h2>
                <p>Este panel toma datos guardados en la base. Si aún no hay historial, se muestra vacío.</p>
              </div>
            </div>

            <div className="kpi-grid">
              <div className="kpi-card">
                <span>Total cotizaciones</span>
                <strong>{dashboard?.kpis?.totalCotizaciones?.valor || 0}</strong>
              </div>
              <div className="kpi-card">
                <span>Total dólares</span>
                <strong>{formatMoney(dashboard?.kpis?.totalDolares?.valor)}</strong>
              </div>
              <div className="kpi-card">
                <span>Ticket promedio</span>
                <strong>{formatMoney(dashboard?.kpis?.ticketPromedio?.valor)}</strong>
              </div>
              <div className="kpi-card">
                <span>Países activos</span>
                <strong>{dashboard?.kpis?.paisesActivos?.valor || 0}</strong>
              </div>
            </div>

            {dashboard?.meta?.hayDatos ? (
              <div className="dashboard-columns">
                <section className="panel">
                  <div className="panel-head compact">
                    <div>
                      <h2>Tendencias</h2>
                    </div>
                  </div>

                  <div className="simple-list">
                    {(dashboard?.tendencias || []).map((item) => (
                      <article key={item.titulo} className="list-card">
                        <strong>{item.titulo}</strong>
                        <p>{item.descripcion}</p>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-head compact">
                    <div>
                      <h2>Alertas</h2>
                    </div>
                  </div>

                  <div className="simple-list">
                    {(dashboard?.alertas || []).map((item) => (
                      <article key={item.id || item.titulo} className="list-card">
                        <strong>{item.titulo}</strong>
                        <p>{item.mensaje}</p>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            ) : (
              <div className="empty-dashboard">
                <h3>Sin historial todavía</h3>
                <p>
                  Aquí no deberían aparecer métricas ficticias. El panel se activará cuando existan cotizaciones reales
                  guardadas en la base.
                </p>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

export default App
