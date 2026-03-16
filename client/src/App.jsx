import { useState, useEffect } from 'react'
import axios from 'axios'
import { LineChart, Line, PieChart, Pie, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'

const API_URL = 'http://localhost:3001'

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']

function App() {
  const [salud, setSalud] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    cargarDatos()
    const interval = setInterval(cargarDatos, 30000) // Actualizar cada 30 segundos
    return () => clearInterval(interval)
  }, [])

  const cargarDatos = async () => {
    try {
      const [saludRes, dashboardRes] = await Promise.all([
        axios.get(`${API_URL}/api/monitor/health`),
        axios.get(`${API_URL}/api/dashboard`)
      ])
      setSalud(saludRes.data)
      setDashboard(dashboardRes.data)
      setLoading(false)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  if (loading) return <div className="loading">Cargando dashboard...</div>
  if (error) return <div className="error">Error: {error}</div>

  return (
    <div className="dashboard">
      <header className="header">
        <h1>🚀 Cotizador Perú Ultimate v3.0</h1>
        <div className="status">
          <span className={`indicator ${salud?.status}`}></span>
          {salud?.status?.toUpperCase()}
        </div>
      </header>

      <div className="kpi-grid">
        <div className="kpi-card">
          <h3>Total Cotizaciones</h3>
          <div className="value">{dashboard?.kpis?.totalCotizaciones?.valor || 0}</div>
          <div className={`variation ${dashboard?.kpis?.totalCotizaciones?.tendencia}`}>
            {dashboard?.kpis?.totalCotizaciones?.variacion || 0}%
          </div>
        </div>

        <div className="kpi-card">
          <h3>Total Dólares</h3>
          <div className="value">${(dashboard?.kpis?.totalDolares?.valor || 0).toLocaleString()}</div>
          <div className={`variation ${dashboard?.kpis?.totalDolares?.tendencia}`}>
            {dashboard?.kpis?.totalDolares?.variacion || 0}%
          </div>
        </div>

        <div className="kpi-card">
          <h3>Ticket Promedio</h3>
          <div className="value">${(dashboard?.kpis?.ticketPromedio?.valor || 0).toLocaleString()}</div>
          <div className={`variation ${dashboard?.kpis?.ticketPromedio?.tendencia}`}>
            {dashboard?.kpis?.ticketPromedio?.variacion || 0}%
          </div>
        </div>

        <div className="kpi-card">
          <h3>Países Activos</h3>
          <div className="value">{dashboard?.kpis?.paisesActivos?.valor || 0}</div>
          <div className={`variation ${dashboard?.kpis?.paisesActivos?.tendencia}`}>
            {dashboard?.kpis?.paisesActivos?.variacion || 0}
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h3>Evolución Mensual</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dashboard?.graficos?.evolucionMensual?.datos || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="cotizaciones" stroke="#8884d8" name="Cotizaciones" />
              <Line type="monotone" dataKey="dolares" stroke="#82ca9d" name="Dólares" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Distribución por País</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={dashboard?.graficos?.distribucionPaises?.datos || []}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ pais, percent }) => `${pais}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="valor"
                nameKey="pais"
              >
                {(dashboard?.graficos?.distribucionPaises?.datos || []).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card full-width">
          <h3>Top Productos</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dashboard?.graficos?.topProductos?.datos || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="producto" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="valor" fill="#8884d8" name="Cotizaciones" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="system-info">
        <h3>📊 Estado del Sistema</h3>
        <div className="info-grid">
          <div>
            <strong>Uptime:</strong> {salud?.uptime || 'N/A'}
          </div>
          <div>
            <strong>Requests:</strong> {salud?.requests?.total || 0}
          </div>
          <div>
            <strong>Errores:</strong> {salud?.requests?.errorRate || 0}%
          </div>
          <div>
            <strong>Memoria:</strong> {salud?.resources?.memory?.heapUsed || 'N/A'}
          </div>
          <div>
            <strong>CPU:</strong> {salud?.resources?.cpu?.load || 'N/A'}
          </div>
          <div>
            <strong>Respuesta:</strong> {salud?.performance?.avgResponseTime || 'N/A'}
          </div>
        </div>
      </div>

      <footer className="footer">
        <p>Dashboard Enterprise - 100% Gratis - Actualizado: {new Date().toLocaleString()}</p>
      </footer>
    </div>
  )
}

export default App
