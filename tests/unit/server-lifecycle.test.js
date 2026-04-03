describe('server lifecycle', () => {
  let app

  beforeAll(() => {
    app = require('../../server/index')
  })

  afterEach(async () => {
    if (app?.stopServer) {
      await app.stopServer()
    }
  })

  it('serializa startServer concurrente y permite reiniciar despues de stop', async () => {
    const [first, second] = await Promise.all([
      app.startServer({ port: 0 }),
      app.startServer({ port: 0 })
    ])

    expect(first).toBe(second)
    expect(first.address().port).toBeGreaterThan(0)

    await app.stopServer()

    const restarted = await app.startServer({ port: 0 })
    expect(restarted).toBeDefined()
    expect(restarted).not.toBe(first)
    expect(restarted.address().port).toBeGreaterThan(0)
  })

  it('usa el puerto realmente asignado en el banner de arranque', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

    try {
      const server = await app.startServer({ port: 0 })
      const assignedPort = server.address().port
      const banner = logSpy.mock.calls
        .map((call) => String(call[0] ?? ''))
        .find((entry) => entry.includes('Server: http://localhost:'))

      expect(assignedPort).toBeGreaterThan(0)
      expect(banner).toContain(`http://localhost:${assignedPort}`)
      expect(banner).not.toContain('http://localhost:0')
      expect(banner).toContain('ImportAIAgent Cotizador')
      expect(banner).not.toContain('Cotizador de Importacion Peru')
      expect(banner).toContain('/api/agentes/stats')
      expect(banner).not.toContain('TOP 1%')
      expect(banner).not.toContain('ULTIMATE v3.0')
    } finally {
      logSpy.mockRestore()
    }
  })

  it('mantiene solo el banner operativo vivo y no arrastra el formatter anterior', () => {
    const fs = require('fs')
    const path = require('path')
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'index.js'), 'utf8')

    expect(content).toContain('function buildStartupBannerText')
    expect(content).toContain("agentes_1_16: 'Compatibilidad del pipeline base especializado anterior'")
    expect(content).toContain('// AUTO-COTIZAR (compatibilidad con el flujo anterior)')
    expect(content).toContain('Estado: API respondiendo')
    expect(content).not.toContain('function formatStartupBanner')
    expect(content).not.toContain("agentes_1_16: 'Compatibilidad legacy del pipeline base especializado'")
    expect(content).not.toContain('// AUTO-COTIZAR (legacy - mantiene compatibilidad)')
    expect(content).not.toContain('TOP 1% GLOBAL')
    expect(content).not.toContain('ULTIMATE v3.0')
    expect(content).not.toContain('INTEGRACION TOTAL - 30 AGENTES')
    expect(content).not.toContain('Cotizador de Importacion Peru')
    expect(content).not.toContain('Estado: servidor listo')
  })

  it('mantiene limpios los mensajes visibles de arranque, logistica y agente 0', () => {
    const fs = require('fs')
    const path = require('path')
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'index.js'), 'utf8')

    expect(content).toContain('[LOGISTICA] Integrador cargado con el catalogo actual')
    expect(content).toContain('[LOGISTICA] Shippo configurado para consulta')
    expect(content).toContain('[LOGISTICA] EasyPost configurado para consulta')
    expect(content).toContain('[LOGISTICA] AfterShip configurado para consulta')
    expect(content).toContain('[LOGISTICA] Pack & Send configurado para consulta')
    expect(content).toContain('[LOGISTICA] Interparcel configurado para consulta')
    expect(content).toContain('[LOGISTICA] Parcel Monkey configurado para consulta')
    expect(content).toContain('[LOGISTICA] Maersk Spot API configurada para consulta')
    expect(content).toContain('[LOGISTICA] MSC Spot API configurada para consulta')
    expect(content).toContain('[INIT] DB y Auth inicializados')
    expect(content).toContain('[INIT] NANDINA cargada')
    expect(content).toContain('Hola! Soy tu asistente de importaciones Peru. Te guiare paso a paso.')
    expect(content).toContain('Cotizacion incompleta')
    expect(content).toContain('Regimen no encontrado')
    expect(content).toContain('sin cuota local rastreada')
    expect(content).toContain('Tarifa consultada por API. Sujeta a revision del carrier.')
    expect(content).not.toContain('Tarifa consultada por API. Sujeta a confirmacion del carrier.')
    expect(content).toContain("return res.status(400).json({ error: 'confianza fuera de rango' });")
    expect(content).toContain("return res.status(400).json({ error: 'totalUSD y tc numericos requeridos' });")
    expect(content).toContain('Tarifas referenciales de mercado. Sujetas a cambio sin previo aviso.')
    expect(content).toContain("const { version: APP_VERSION } = require('../package.json');")
    expect(content).toContain("server: 'ok', version: APP_VERSION,")
    expect(content).not.toContain('[LOGÃ')
    expect(content).not.toContain('CotizaciÃ')
    expect(content).not.toContain('RÃ©gimen')
    expect(content).not.toContain('(ilimitado)')
    expect(content).not.toContain('API no encontrada o ilimitada')
    expect(content).not.toContain('Tarifa de API real')
    expect(content).not.toContain('Subjecto a cambio sin previo aviso')
    expect(content).not.toContain("version: '2.0'")
    expect(content).not.toContain('[LOGISTICA] OK Integrador inicializado')
    expect(content).not.toContain('TrackingMore activo con cuota diaria local rastreada')
    expect(content).not.toContain('TrackingMore esta habilitado con cuota diaria local rastreada')
    expect(content).not.toContain('para habilitar TrackingMore')
    expect(content).not.toContain('Suscrito correctamente')
    expect(content).toContain('El alta publica no esta disponible. Solo el administrador puede autorizar nuevas cuentas.')
    expect(content).not.toContain('Solo el administrador puede habilitar cuentas.')
    expect(content).not.toContain('Alta publica deshabilitada. Solo el administrador puede autorizar nuevas cuentas.')
    expect(content).not.toContain("return res.status(400).json({ error: 'confianza invalida' });")
    expect(content).not.toContain("return res.status(400).json({ error: 'totalUSD y tc validos requeridos' });")
    expect(content).toContain("return res.status(400).json({ error: 'hs requerido; fobUnitario y pesoKg deben ser numericos positivos' });")
    expect(content).toContain("return res.status(400).json({ error: 'fob y peso deben ser numericos positivos' });")
    expect(content).toContain("return res.status(400).json({ error: 'origen y canal requeridos; pesoKg debe ser numerico positivo' });")
    expect(content).toContain("return res.status(400).json({ error: 'limite fuera de rango' });")
    expect(content).toContain("return res.status(400).json({ error: 'topK fuera de rango' });")
    expect(content).toContain("return res.status(400).json({ error: 'dias fuera de rango' });")
    expect(content).toContain("return res.status(400).json({ error: 'id debe ser numerico positivo' });")
    expect(content).toContain("return res.status(400).json({ error: 'tipo fuera de catalogo o usosMaximos fuera de rango' });")
    expect(content).toContain("return res.status(400).json({ error: 'activo debe ser booleano' });")
    expect(content).toContain("return res.status(400).json({ error: 'Payload debe ser un objeto' });")
    expect(content).not.toContain("return res.status(400).json({ error: 'hs, fobUnitario y pesoKg validos requeridos' });")
    expect(content).not.toContain("return res.status(400).json({ error: 'fob y peso validos requeridos' });")
    expect(content).not.toContain("return res.status(400).json({ error: 'origen, canal y pesoKg validos requeridos' });")
    expect(content).not.toContain("return res.status(400).json({ error: 'limite invalido' });")
    expect(content).not.toContain("return res.status(400).json({ error: 'topK invalido' });")
    expect(content).not.toContain("return res.status(400).json({ error: 'dias invalido' });")
    expect(content).not.toContain("return res.status(400).json({ error: 'id invalido' });")
    expect(content).not.toContain("return res.status(400).json({ error: 'tipo o usosMaximos invalidos' });")
    expect(content).not.toContain("return res.status(400).json({ error: 'activo invalido' });")
    expect(content).not.toContain("return res.status(400).json({ error: 'Payload invalido' });")
    expect(content).not.toContain('[LOGISTICA] OK Shippo configurado')
    expect(content).not.toContain('[LOGISTICA] OK EasyPost configurado')
    expect(content).not.toContain('[LOGISTICA] OK AfterShip configurado')
    expect(content).not.toContain('[LOGISTICA] OK Pack & Send configurado')
    expect(content).not.toContain('[LOGISTICA] OK Interparcel configurado')
    expect(content).not.toContain('[LOGISTICA] OK Parcel Monkey configurado')
    expect(content).not.toContain('[LOGISTICA] OK Maersk Spot API configurado')
    expect(content).not.toContain('[LOGISTICA] OK MSC Spot API configurado')
    expect(content).not.toContain('[INIT] DB y Auth listos')
    expect(content).not.toContain('[INIT] NANDINA lista')
  })
  it('no arrastra mojibake residual en server/index.js', () => {
    const fs = require('fs')
    const path = require('path')
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'index.js'), 'utf8')

    expect(content).not.toMatch(/Ã|â|�/)
    expect(content).not.toContain('Agentes de NavegaciÃ³n')
    expect(content).not.toContain('MEMBRESÃAS')
    expect(content).not.toContain('inicializaciÃ³n')
  })

  it('no arranca con BOM invisible en server/index.js', () => {
    const fs = require('fs')
    const path = require('path')
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'index.js'), 'utf8')

    expect(content.charCodeAt(0)).not.toBe(0xfeff)
  })

  it('conserva operadores criticos intactos en server/index.js', () => {
    const fs = require('fs')
    const path = require('path')
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'index.js'), 'utf8')

    expect(content).toContain("dotenv.config(envFile ? { path: envFile, override: true } : { override: true });")
    expect(content).toContain('uploadCleanupInterval.unref?.();')
    expect(content).toContain('const tlcAV = tlc ? Math.max(0, baseAV * (1 - (tlc.preferencia || 0) / 100)) : baseAV;')
    expect(content).toContain("const normalizedType = typeof type === 'string' ? type.trim().toLowerCase() : 'document';")
    expect(content).toContain("const rawId = cotizacion?.id ?? 'export';")
    expect(content).toContain("const port = options.port ?? resolveRuntimePort(process.env.PORT, 3000, 'PORT');")
    expect(content).toContain("const wsPort = options.wsPort ?? resolveRuntimePort(process.env.WS_PORT, 3002, 'WS_PORT');")
    expect(content).toContain('Date.now() - startTime')
    expect(content).not.toContain('unref-.()')
    expect(content).not.toContain('req.body-.')
    expect(content).not.toContain('obtenerEstadisticas-.()')
    expect(content).not.toContain(' -- ')
  })

  it('resolveRuntimePort usa fallback local y endurece produccion', () => {
    const { resolveRuntimePort } = app._private
    const previousNodeEnv = process.env.NODE_ENV

    try {
      process.env.NODE_ENV = 'development'
      expect(resolveRuntimePort('3010', 3000, 'PORT')).toBe(3010)
      expect(resolveRuntimePort('', 3000, 'PORT')).toBe(3000)

      process.env.NODE_ENV = 'production'
      expect(() => resolveRuntimePort('', 3000, 'PORT')).toThrow('PORT no configurado o fuera de rango en produccion')
      expect(() => resolveRuntimePort('0', 3002, 'WS_PORT')).toThrow('WS_PORT no configurado o fuera de rango en produccion')
    } finally {
      process.env.NODE_ENV = previousNodeEnv
    }
  })
})
