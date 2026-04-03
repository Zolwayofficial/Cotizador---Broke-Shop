const fs = require('fs');
const path = require('path');

describe('root manual scripts', () => {
  const root = path.join(__dirname, '..', '..');

  it('test-produccion.js ejecuta las pruebas async de forma secuencial', () => {
    const content = fs.readFileSync(path.join(root, 'test-produccion.js'), 'utf8');
    expect(content).toContain('async function main()');
    expect(content).toContain('await runner.run(');
    expect(content).toContain('createRunner()');
  });

  it('test-produccion.js usa el contrato real del modulo de exportacion', () => {
    const content = fs.readFileSync(path.join(root, 'test-produccion.js'), 'utf8');

    expect(content).toContain("const exportacion = require('./server/exportar-cotizacion');");
    expect(content).toContain("exportacion.exportarCotizacion(cotizacion, 'pdf')");
    expect(content).toContain("exportacion.exportarCotizacion(cotizacion, 'excel')");
    expect(content).toContain('PRUEBA COMPLETA DE PRODUCCION - IMPORTAIAGENT COTIZADOR');
    expect(content).not.toContain("const pdf = exportarCotizacion(cotizacion, 'pdf');");
    expect(content).not.toContain('PRUEBA COMPLETA DE PRODUCCION - COTIZADOR PERU');
    expect(content).not.toContain('ULTIMATE v3.0');
  });

  it('los smoke scripts HTTP usan tokens configurables y helpers compartidos', () => {
    const endpointsHttp = fs.readFileSync(path.join(root, 'test-endpoints-http.js'), 'utf8');
    const endpointsAgentes = fs.readFileSync(path.join(root, 'test-endpoints-agentes.js'), 'utf8');
    const helpers = fs.readFileSync(path.join(root, 'scripts', 'manual-smoke-helpers.cjs'), 'utf8');

    for (const content of [endpointsHttp, endpointsAgentes]) {
      expect(content).toContain("require('./scripts/manual-smoke-helpers.cjs')");
      expect(content).toContain('AUTH_TOKEN');
      expect(content).toContain('ADMIN_TOKEN');
      expect(content).toContain('buildRequestHeaders');
      expect(content).toContain('classifyManualHttpStatus');
      expect(content).toContain('requestJson(');
      expect(content).toContain('RESPUESTA ${status.label}');
      expect(content).toContain('RESPONDIERON:');
      expect(content).not.toContain('exitosas');
      expect(content).not.toContain('OK ${status.label}');
      expect(content).not.toContain('OK:');
      expect(content).not.toContain('http.get(');
    }

    expect(helpers).toContain("label: 'RESPONDIO'");
    expect(helpers).toContain("label: 'RESPONDIO (400 esperado)'");
    expect(helpers).not.toContain("label: 'EXITOSA'");
    expect(helpers).not.toContain("label: 'EXITOSA (400 esperado)'");
  });

  it('deploy-vps.bat es un wrapper real de PowerShell y no arrastra sintaxis bash', () => {
    const content = fs.readFileSync(path.join(root, 'deploy-vps.bat'), 'utf8');

    expect(content).toContain('Wrapper Windows: la logica local vive en PowerShell.');
    expect(content).toContain('No metas copia ni shell remoto en este .bat; eso vive en deploy-vps.ps1.');
    expect(content).toContain('deploy-vps.ps1');
    expect(content).toContain('powershell -NoProfile -ExecutionPolicy Bypass -File');
    expect(content).toContain('exit /b %EXIT_CODE%');
    expect(content.trim().split(/\r?\n/).length).toBeLessThanOrEqual(15);
    expect(content).not.toContain('scp --exclude');
    expect(content).not.toContain('<< ENDSSH');
    expect(content).not.toContain('2>/dev/null');
    expect(content).not.toContain('if [');
    expect(content).not.toMatch(/\bscp\b/);
    expect(content).not.toMatch(/\bssh\b/);
    expect(content).not.toMatch(/\bbash\b/);
    expect(content).not.toMatch(/\bpscp\b/);
    expect(content).not.toMatch(/\bplink\b/);
    expect(content).not.toMatch(/^\s*fi\s*$/m);
  });

  it('los scripts raiz reescritos no arrastran mojibake ni contratos obsoletos', () => {
    const files = [
      'test-server.js',
      'test-server-simple.js',
      'test-conectores.js',
      'test-agente-sunat.js',
      'test-agente-sunat-simple.js',
      'test-alertas.js',
      'test-sistema-unificado.js',
      'test-todos-agentes.js',
    ];

    for (const file of files) {
      const content = fs.readFileSync(path.join(root, file), 'utf8');
      expect(content).not.toMatch(/[ÃƒÃ°Ã¢]/);
    }
  });

  it('los scripts manuales de agentes usan conteos dinamicos y criterios de exito consistentes', () => {
    const conectores = fs.readFileSync(path.join(root, 'test-conectores.js'), 'utf8');
    const sunat = fs.readFileSync(path.join(root, 'test-agente-sunat.js'), 'utf8');
    const sunatSimple = fs.readFileSync(path.join(root, 'test-agente-sunat-simple.js'), 'utf8');
    const alertas = fs.readFileSync(path.join(root, 'test-alertas.js'), 'utf8');
    const produccion = fs.readFileSync(path.join(root, 'test-produccion.js'), 'utf8');
    const simpleServer = fs.readFileSync(path.join(root, 'test-server-simple.js'), 'utf8');
    const sistema = fs.readFileSync(path.join(root, 'test-sistema-unificado.js'), 'utf8');
    const todos = fs.readFileSync(path.join(root, 'test-todos-agentes.js'), 'utf8');

    expect(conectores).toContain('const TEST_CASES = [');
    expect(conectores).not.toContain('const total = 11');
    expect(conectores).toContain('SMOKE MANUAL DE CONECTORES COMPLETADO');
    expect(conectores).toContain('no certifica cobertura funcional total');
    expect(conectores).toContain('Respondieron:');
    expect(conectores).toContain('Respuesta visible');
    expect(conectores).not.toContain('TODAS LAS PRUEBAS EXITOSAS');
    expect(conectores).not.toContain('OK EXITOSA');
    expect(conectores).not.toContain('OK Exitosas');
    expect(conectores).not.toContain('OK RESPONDIO');
    expect(conectores).not.toContain('OK Respondieron');
    expect(sunat).toContain('const TEST_CASES = [');
    expect(sunat).not.toContain('exitosas >= 4');
    expect(sunat).toContain('SMOKE MANUAL DE SUNAT COMPLETADO');
    expect(sunat).toContain('no sustituye una revision funcional total');
    expect(sunat).not.toContain('no sustituye una validacion funcional total');
    expect(sunat).toContain('Marcadas favorables por el agente');
    expect(sunat).toContain('Tasa interna marcada por el agente');
    expect(sunat).toContain('Respondieron:');
    expect(sunat).toContain('Respuesta visible');
    expect(sunat).not.toContain('Todas las pruebas de esta bateria pasaron');
    expect(sunat).not.toContain('Marcadas exitosas por el agente');
    expect(sunat).not.toContain('OK EXITOSA');
    expect(sunat).not.toContain('OK Exitosas');
    expect(sunat).not.toContain('OK RESPONDIO');
    expect(sunat).not.toContain('OK Respondieron');
    expect(sunat).not.toContain('Tasa de exito:');
    expect(sunat).not.toContain('AGENTE SUNAT FUNCIONA CORRECTAMENTE');
    expect(sunatSimple).toContain('SMOKE RAPIDO DE SUNAT COMPLETADO');
    expect(sunatSimple).toContain('Inicializacion de agentes completada sin error visible');
    expect(sunatSimple).toContain('El resultado muestra inicializacion y lectura de estadisticas, no una revision funcional total del agente.');
    expect(sunatSimple).toContain('no una revision funcional total del agente');
    expect(sunatSimple).not.toContain('no validacion funcional total del agente');
    expect(sunatSimple).not.toContain('El resultado confirma inicializacion y lectura de estadisticas, no validacion funcional total del agente.');
    expect(sunatSimple).not.toContain('OK Agentes inicializados correctamente');
    expect(sunatSimple).not.toContain('AGENTE SUNAT IMPLEMENTADO CORRECTAMENTE');
    expect(alertas).toContain('SMOKE DE ALERTAS NORMATIVAS COMPLETADO');
    expect(alertas).toContain('Inicializacion del sistema completada sin error visible');
    expect(alertas).toContain('alertas de prueba creadas para el smoke');
    expect(alertas).toContain('El resultado muestra inicializacion, creacion y consulta basica de alertas, no cobertura funcional total.');
    expect(alertas).toContain('no cobertura funcional total');
    expect(alertas).not.toContain('El resultado confirma inicializacion, creacion y consulta basica de alertas, no cobertura funcional total.');
    expect(alertas).not.toContain('OK Sistema de alertas inicializado correctamente');
    expect(alertas).not.toContain('alertas creadas\\n');
    expect(alertas).not.toContain('SISTEMA DE ALERTAS NORMATIVAS: FUNCIONAL');
    expect(produccion).toContain('SIN ERROR VISIBLE');
    expect(produccion).toContain('La bateria manual completo sus chequeos sin error visible.');
    expect(produccion).toContain('No sustituye una revision funcional total ni cierre operativo de produccion.');
    expect(produccion).toContain("throw new Error('Documentacion no interpretable');");
    expect(produccion).toContain("throw new Error('Recomendaciones no interpretables');");
    expect(produccion).toContain("throw new Error('Apuntes no interpretables');");
    expect(produccion).not.toContain('No sustituye validacion funcional total ni cierre operativo de produccion.');
    expect(produccion).not.toContain("throw new Error('Documentacion invalida');");
    expect(produccion).not.toContain("throw new Error('Recomendaciones invalidas');");
    expect(produccion).not.toContain("throw new Error('Apuntes invalidos');");
    expect(produccion).not.toContain('OK ');
    expect(produccion).not.toContain('Todas las pruebas manuales pasaron.');
    expect(simpleServer).toContain('process.env.PORT');
    expect(simpleServer).toContain('KEEP_OPEN');
    expect(simpleServer).toContain('express cargado');
    expect(simpleServer).toContain('app creada');
    expect(simpleServer).toContain('Servidor HTTP escuchando en http://localhost:${PORT}');
    expect(simpleServer).toContain('SMOKE DE SERVIDOR COMPLETADO');
    expect(simpleServer).toContain('SERVIDOR EN ESCUCHA PARA SMOKE');
    expect(simpleServer).not.toContain('OK express');
    expect(simpleServer).not.toContain('OK app');
    expect(simpleServer).not.toContain('OK Servidor HTTP escuchando');
    expect(simpleServer).not.toContain('SERVIDOR VERIFICADO');
    expect(simpleServer).not.toContain('SERVIDOR FUNCIONANDO');
    expect(sistema).not.toContain('29 AGENTES');
    expect(sistema).toContain('Inicializacion del sistema unificado completada sin error visible');
    expect(sistema).toContain('stats.total_agentes');
    expect(sistema).toContain('SMOKE DEL SISTEMA UNIFICADO COMPLETADO');
    expect(sistema).toContain('El resultado muestra inicializacion y consultas basicas, no cobertura funcional total de todos los agentes.');
    expect(sistema).toContain('no cobertura funcional total de todos los agentes');
    expect(sistema).not.toContain('El resultado confirma inicializacion y consultas basicas, no cobertura funcional total de todos los agentes.');
    expect(sistema).not.toContain('OK Sistema unificado inicializado correctamente');
    expect(sistema).not.toContain('SISTEMA UNIFICADO DE AGENTES: FUNCIONAL');
    expect(todos).toContain('SMOKE DE NAVEGACION COMPLETADO');
    expect(todos).toContain('El resultado muestra inicializacion y lectura de estadisticas, no una revision funcional total.');
    expect(todos).toContain('no una revision funcional total');
    expect(todos).not.toContain('no validacion funcional total');
    expect(todos).toContain('Inicializacion de agentes sin error visible');
    expect(todos).not.toContain('El resultado confirma inicializacion y lectura de estadisticas, no validacion funcional total.');
    expect(todos).toContain('Tasa interna marcada por el agente');
    expect(todos).not.toContain('TODOS LOS AGENTES IMPLEMENTADOS CORRECTAMENTE');
    expect(todos).not.toContain('OK Todos los agentes inicializados correctamente');
    expect(todos).not.toContain('OK Inicializacion de agentes sin error visible');
    expect(todos).not.toContain('Tasa de exito:');
    const serverSmoke = fs.readFileSync(path.join(root, 'test-server.js'), 'utf8');
    expect(serverSmoke).toContain('[SMOKE] Carga del servidor completada sin error visible');
    expect(serverSmoke).not.toContain('[OK] Servidor cargado correctamente');
  });

  it('dashboard.html no arrastra mojibake ni usa la clave rota de variacion', () => {
    const content = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

    expect(content).not.toMatch(/[Ãðâ]/);
    expect(content).toContain("dashboard?.source === 'demo_local'");
    expect(content).toContain("health?.source === 'demo_local'");
    expect(content).toContain("health?.status === 'demo_local'");
    expect(content).toContain('DEMO LOCAL');
    expect(content).toContain('API RESPONDIENDO');
    expect(content).toContain('.status.demo');
    expect(content).toContain('.status.available');
    expect(content).toContain('function formatVariation(metric)');
    expect(content).toContain('function isCurrencyMetric(key)');
    expect(content).toContain('function formatValue(key, value)');
    expect(content).toContain('No disponible');
    expect(content).toContain('Sin variacion');
    expect(content).toContain("className: 'variation na'");
    expect(content).toContain("return 'N/D';");
    expect(content).toContain('no conectado a datos reales');
    expect(content).toContain("const isDemo = dashboard?.source === 'demo_local';");
    expect(content).toContain('Sin KPIs reales disponibles en este dashboard local.');
    expect(content).toContain('Sin KPIs disponibles');
    expect(content).toContain('El dashboard no devolvio KPIs utilizables en esta carga.');
    expect(content).not.toContain('variaciÃ');
    expect(content).not.toContain('<div class="variation down">');
    expect(content).not.toContain('function formatValue(value)');
    expect(content).not.toContain('SERVIDOR EN LINEA');
    expect(content).not.toContain('const variation = Number.isFinite(Number(data?.variacion)) ? Number(data.variacion) : 0;');
  });

  it('start-local.js anuncia URLs de smoke coherentes con el servidor real', () => {
    const content = fs.readFileSync(path.join(root, 'start-local.js'), 'utf8');

    expect(content).toContain("const app = require(\"./server/index.js\")");
    expect(content).toContain("await app.startServer({ port: PORT, wsPort: WS_PORT })");
    expect(content).toContain('http://localhost:${PORT}/api/health');
    expect(content).toContain('http://localhost:${PORT}/api/monitor/health');
    expect(content).toContain('http://localhost:${PORT}/api/dashboard');
    expect(content).not.toContain('ULTIMATE v3.0');
  });

  it('server-listo.js y server-minimo.js no fijan 3001 como verdad local', () => {
    const listo = fs.readFileSync(path.join(root, 'server-listo.js'), 'utf8');
    const minimo = fs.readFileSync(path.join(root, 'server-minimo.js'), 'utf8');

    for (const content of [listo, minimo]) {
      expect(content).toContain("parsePort(process.env.PORT, 3000)");
      expect(content).not.toContain("parsePort(process.env.PORT, 3001)");
      expect(content).not.toContain('http://localhost:3001');
    }
  });

  it('PRUEBA_PRODUCCION.md no arrastra mojibake ni contratos operativos viejos', () => {
    const content = fs.readFileSync(path.join(root, 'docs', 'PRUEBA_PRODUCCION.md'), 'utf8');

    expect(content).not.toMatch(/[ÃƒÃ°Ã¢]/);
    expect(content).toContain('1. Revisar entorno');
    expect(content).toContain('## Fase 1: Revisar entorno');
    expect(content).toContain('node test-produccion.js');
    expect(content).toContain('Authorization: Bearer %AUTH_TOKEN%');
    expect(content).toContain('/api/monitor/health');
    expect(content).toContain("const exportacion = require('./server/exportar-cotizacion');");
    expect(content).toContain('Este smoke recorre:');
    expect(content).toContain('## Criterio operativo');
    expect(content).toContain('Esta guia revisa el sistema real antes de un despliegue o despues de cambios sensibles.');
    expect(content).toContain('alertasNormativas.obtenerEstadisticas()` devuelve un objeto utilizable');
    expect(content).toContain('los arreglos de documentacion, recomendaciones y apuntes se reciben como listas utilizables');
    expect(content).toContain('conteos desactualizados copiados a mano');
    expect(content).not.toContain('## Criterio de aprobacion');
    expect(content).not.toContain('Esta guia valida el sistema real antes de un despliegue o despues de cambios sensibles.');
    expect(content).not.toContain('1. Validar entorno');
    expect(content).not.toContain('## Fase 1: Validar entorno');
    expect(content).not.toContain('Este smoke valida:');
    expect(content).not.toContain('alertasNormativas.obtenerEstadisticas()` devuelve un objeto valido');
    expect(content).not.toContain('los arreglos de documentacion, recomendaciones y apuntes son validos');
    expect(content).not.toContain('Aprobado para despliegue');
    expect(content).not.toContain('No aprobado si');
    expect(content).not.toContain('conteos de otra etapa copiados a mano');
    expect(content).not.toContain('conteos historicos copiados a mano');
    expect(content).not.toContain('29 agentes especializados');
    expect(content).not.toContain('28+ endpoints HTTP');
  });
  it('README.md ya no arrastra despliegue antiguo ni promesas estaticas rotas', () => {
    const content = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

    expect(content).not.toMatch(/[ÃƒÆ’ÃƒÂ°ÃƒÂ¢]/);
    expect(content).toContain('# ImportAIAgent Cotizador');
    expect(content).toContain('deploy-vps.ps1');
    expect(content).toContain('deploy-vps-unix.sh');
    expect(content).toContain('node start-local.js');
    expect(content).toContain('http://localhost:PUERTO_REAL');
    expect(content).toContain('/api/monitor/health');
    expect(content).toContain('consulta oficial en vivo con trazabilidad de fuente');
    expect(content).toContain('## Revision antes de despliegue');
    expect(content).not.toContain('/var/www/cotizador');
    expect(content).not.toContain('pm2 start server/index.js --name cotizador');
    expect(content).not.toContain('http://localhost:3000');
    expect(content).not.toContain('29 AGENTES');
    expect(content).not.toContain('90+ ENDPOINTS HTTP');
    expect(content).not.toContain('validacion oficial en vivo con trazabilidad de fuente');
    expect(content).not.toContain('## Validacion antes de despliegue');
  });

  it('README_ULTIMATE.md ya no arrastra wording viejo del bloque oficial', () => {
    const content = fs.readFileSync(path.join(root, 'README_ULTIMATE.md'), 'utf8');

    expect(content).toContain('consulta oficial y trazabilidad de fuente');
    expect(content).toContain('agentes de navegacion y consulta oficial');
    expect(content).toContain('docs/PRUEBA_PRODUCCION.md` para smoke y revision');
    expect(content).not.toContain('validacion oficial y trazabilidad de fuente');
    expect(content).not.toContain('agentes de navegacion y validacion oficial');
    expect(content).not.toContain('docs/PRUEBA_PRODUCCION.md` para smoke y validacion');
  });

  it('vite.config.js no fija un backend local incorrecto cuando cambia PORT', () => {
    const content = fs.readFileSync(path.join(root, 'client', 'vite.config.js'), 'utf8');

    expect(content).toContain('loadEnv');
    expect(content).toContain("env.PORT || process.env.PORT || '3000'");
    expect(content).toContain('VITE_API_PROXY_TARGET');
    expect(content).not.toContain("'/api': 'http://localhost:3000'");
  });

  it('App.jsx y los conectores de Aduanet ya no arrastran puertos fantasma ni user agents antiguos', () => {
    const app = fs.readFileSync(path.join(root, 'client', 'src', 'App.jsx'), 'utf8');
    const nandina = fs.readFileSync(path.join(root, 'server', 'nandina.js'), 'utf8');
    const valoracion = fs.readFileSync(path.join(root, 'server', 'valoracion.js'), 'utf8');

    expect(app).toContain('import.meta.env.VITE_API_PROXY_TARGET');
    expect(app).not.toContain('http://localhost:3000');
    expect(nandina).toContain('ImportAIAgentCotizador/1.0');
    expect(valoracion).toContain('ImportAIAgentCotizador/1.0');
    expect(valoracion).toContain('SUNAT tiene muy alta probabilidad de generar una Notificacion de Valor OMC');
    expect(valoracion).toContain('Es muy probable que se exija garantia antes del levante de la mercancia');
    expect(nandina).not.toContain('CotizadorPeru/2.0');
    expect(valoracion).not.toContain('CotizadorPeru/2.0');
    expect(valoracion).not.toContain('SUNAT generara una Notificacion de Valor OMC con certeza');
    expect(valoracion).not.toContain('Se aplicara garantia obligatoria antes del levante de la mercancia');
    expect(nandina).not.toMatch(/[Ãâ�]/);
    expect(valoracion).not.toMatch(/[Ãâ�]/);
  });

  it('DEPLOY.md refleja el flujo moderno de importaiagent y no revive contratos viejos', () => {
    const content = fs.readFileSync(path.join(root, 'DEPLOY.md'), 'utf8');

    expect(content).not.toMatch(/[ÃƒÆ’ÃƒÂ°ÃƒÂ¢]/);
    expect(content).toContain('/var/www/importaiagent');
    expect(content).toContain('pm2 start ecosystem.config.js --only cotizador --update-env');
    expect(content).toContain('.env.production');
    expect(content).toContain('.env.production` real y utilizable');
    expect(content).toContain('BASE_URL=http://localhost:PUERTO_REAL');
    expect(content).toContain('## Revision recomendada');
    expect(content).toContain('no deberia considerarse operativa en produccion');
    expect(content).not.toContain('/var/www/cotizador');
    expect(content).not.toContain('pm2 start server/index.js');
    expect(content).not.toContain('PORT="${PORT:-3000}"');
    expect(content).not.toContain('curl http://localhost:3000/api/monitor/health');
    expect(content).not.toContain('.env.production` real y valido');
    expect(content).not.toContain('la app no queda lista para produccion');
    expect(content).not.toContain('## Validacion recomendada');
  });

  it('URLS_LOCAL.md apunta a la carpeta de trabajo real y no sugiere dashboard sin autenticacion', () => {
    const content = fs.readFileSync(path.join(root, 'URLS_LOCAL.md'), 'utf8');

    expect(content).not.toMatch(/[ÃƒÆ’ÃƒÂ°ÃƒÂ¢]/);
    expect(content).toContain('## Carpeta de trabajo actual');
    expect(content).toContain('C:\\Users\\Billy\\OneDrive\\Documentos\\Playground\\Cotizador---Broke-Shop');
    expect(content).toContain('node start-local.js');
    expect(content).toContain('BASE_URL=http://localhost:PUERTO_REAL');
    expect(content).toContain('/api/monitor/health');
    expect(content).toContain('requieren iniciar sesion');
    expect(content).toContain('Alternativas utiles:');
    expect(content).not.toContain('## Workspace actual');
    expect(content).not.toContain('C:\\Users\\Billy\\AppData\\Local\\Programs\\Antigravity\\cotizador');
    expect(content).not.toContain('http://localhost:3000/api/dashboard');
    expect(content).not.toContain('curl http://localhost:3000/api/health');
    expect(content).not.toContain('Alternativas validas:');
  });
  it('README_ULTIMATE.md ya no arrastra arquitectura fija ni texto roto', () => {
    const content = fs.readFileSync(path.join(root, 'README_ULTIMATE.md'), 'utf8');

    expect(content).toContain('# ImportAIAgent Cotizador - Panorama Ejecutivo');
    expect(content).not.toMatch(/[ÃƒÆ’Ã†â€™ÃƒÆ’Ã‚Â°ÃƒÆ’Ã‚Â¢]/);
    expect(content).toContain('README.md');
    expect(content).toContain('DEPLOY.md');
    expect(content).toContain('docs/PRUEBA_PRODUCCION.md');
    expect(content).toContain('/var/www/importaiagent');
    expect(content).toContain('Las pantallas privadas como dashboard y panel admin requieren sesion autenticada.');
    expect(content).toContain('### Revision local');
    expect(content).toContain('Los conteos puntuales de agentes, endpoints, modulos y fuentes pueden cambiar con');
    expect(content).toContain('conteos congelados o slogans desactualizados.');
    expect(content).not.toContain('# Cotizador Peru - Panorama Ejecutivo');
    expect(content).not.toContain('ULTIMATE v3');
    expect(content).not.toContain('17 Agentes Especializados + Agente 0 Conversacional');
    expect(content).not.toContain('TOP 1% Global');
    expect(content).not.toContain('95%');
    expect(content).not.toContain('Los conteos exactos de agentes, endpoints, modulos y fuentes pueden cambiar con');
    expect(content).not.toContain('conteos congelados o slogans de otra etapa.');
    expect(content).not.toContain('conteos congelados o slogans historicos.');
    expect(content).not.toContain('conteos fijos o slogans historicos.');
    expect(content).not.toContain('Las pantallas privadas como dashboard y panel admin requieren sesion valida.');
    expect(content).not.toContain('### Validacion local');
  });

  it('MEMBRESIAS_COMUNIDAD.md queda alineado al servicio real y sin discurso antiguo', () => {
    const content = fs.readFileSync(path.join(root, 'docs', 'MEMBRESIAS_COMUNIDAD.md'), 'utf8');

    expect(content).not.toMatch(/[ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢]/);
    expect(content).toContain('server/membresias/membresias-service.js');
    expect(content).toContain('Este documento resume el contrato operativo actual del modulo de membresias.');
    expect(content).toContain('POST /api/membresias/registro');
    expect(content).toContain('POST /api/membresias/pago/:id/actualizar');
    expect(content).toContain('## Niveles actuales');
    expect(content).toContain('Los controles de limite usan los contadores almacenados en `membresias`.');
    expect(content).toContain('Los documentos o dashboards privados dependen de autenticacion activa.');
    expect(content).toContain('## Revision util');
    expect(content).not.toContain('JEFE');
    expect(content).not.toContain('LISTO PARA GESTIONAR TU COMUNIDAD');
    expect(content).not.toContain('WhatsApp/Telegram');
    expect(content).not.toContain('Este documento resume el contrato operativo vigente del modulo de membresias.');
    expect(content).not.toContain('Las validaciones de limite usan los contadores almacenados en `membresias`.');
    expect(content).not.toContain('## Niveles vigentes');
    expect(content).not.toContain('Los documentos o dashboards privados dependen de autenticacion valida.');
    expect(content).not.toContain('Los documentos o dashboards privados dependen de autenticacion vigente.');
    expect(content).not.toContain('## Validacion util');
  });

  it('ARBOL_DECISION_CHAT_2026.md refleja el flujo real del chat y no un arbol viejo', () => {
    const content = fs.readFileSync(path.join(root, 'docs', 'ARBOL_DECISION_CHAT_2026.md'), 'utf8');

    expect(content).toContain('objetivo_calculo');
    expect(content).toContain('bien_usado');
    expect(content).toContain('POSTAL_FRANQUICIA');
    expect(content).toContain('POSTAL` y `POSTAL_FRANQUICIA` omiten');
    expect(content).toContain('componentes quedaron con respaldo');
    expect(content).toContain('El material muestra que no siempre basta con pedir "seguro conocido / seguro');
    expect(content).toContain('El PDF muestra que no conviene tratar igual:');
    expect(content).toContain('Para nuestro arbol, esto refuerza que `tipo_sujeto` debe seguir muy arriba y');
    expect(content).toContain('Esto deja claras dos cosas:');
    expect(content).toContain('Este PDF no obliga a ensuciar el flujo base. Lo que hace es respaldar varias');
    expect(content).toContain('El PDF respalda con ejercicios practicos la estructura academica que el motor');
    expect(content).toContain('#### 2. Refuerza La Logica De Percepcion Que Ya Se Venia Afinando');
    expect(content).toContain('Y refuerza que la pregunta sobre mercancia usada no era un detalle menor, sino');
    expect(content).toContain('Y muestra que esos casos tienen:');
    expect(content).toContain('Eso refuerza aun mas la idea de no mezclar estos regimenes con el flujo base de');
    expect(content).toContain('- reforzar que la base tributaria del motor va bien encaminada');
    expect(content).toContain('- reforzar `bien_usado` y `tipo_importador`');
    expect(content).toContain('`revision final` sin perder datos previos');
    expect(content).toContain('`respuesta fuera de opcion` que repita la misma pregunta sin romper contexto');
    expect(content).toContain('`seguro real`');
    expect(content).toContain('producto importado para revender');
    expect(content).not.toContain('8. `flete` (opcional, excepto `POSTAL`)');
    expect(content).not.toContain('componentes quedaron confirmados');
    expect(content).not.toContain('El material confirma que no siempre basta con pedir "seguro conocido / seguro');
    expect(content).not.toContain('El PDF confirma que no conviene tratar igual:');
    expect(content).not.toContain('Para nuestro arbol, esto confirma que `tipo_sujeto` debe seguir muy arriba y');
    expect(content).not.toContain('Esto confirma dos cosas:');
    expect(content).not.toContain('capa de validacion mas fina sobre situacion');
    expect(content).not.toContain('Esto confirma que el sistema no deberia meter estas preguntas dentro del flujo');
    expect(content).not.toContain('Lo que hace es validar varias');
    expect(content).not.toContain('El PDF confirma con ejercicios practicos la estructura academica que el motor');
    expect(content).not.toContain('#### 2. Valida La Logica De Percepcion Que Ya Se Venia Afinando');
    expect(content).not.toContain('Y confirma que la pregunta sobre mercancia usada no era un detalle menor, sino');
    expect(content).not.toContain('Y confirma que esos casos tienen:');
    expect(content).not.toContain('Eso valida aun mas la idea de no mezclar estos regimenes con el flujo base de');
    expect(content).not.toContain('- confirmar que la base tributaria del motor va bien encaminada');
    expect(content).not.toContain('- validar `bien_usado` y `tipo_importador`');
    expect(content).not.toContain('`respuesta invalida` que repita la misma pregunta sin romper contexto');
    expect(content).not.toContain('`confirmacion final` sin perder datos previos');
    expect(content).not.toContain('componentes fueron exactos');
    expect(content).not.toContain('`seguro exacto`');
    expect(content).not.toContain('producto importado listo para revender');
  });

  it('package.json no arrastra descripcion corrupta en la metadata principal', () => {
    const content = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
    const lock = fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8');

    expect(content).not.toMatch(/[ÃƒÆ’Ã†â€™ÃƒÆ’Ã‚Â°ÃƒÆ’Ã‚Â¢]/);
    expect(content).toContain('"name": "importaiagent-cotizador"');
    expect(content).toContain('"description": "ImportAIAgent Cotizador - plataforma privada de cotizacion y gestion"');
    expect(content).not.toContain('"name": "cotizador-peru-ultimate"');
    expect(content).not.toContain('Importación Perú - Ultimate v3.0');
    expect(lock).toContain('"name": "importaiagent-cotizador"');
    expect(lock).not.toContain('"name": "cotizador-peru-ultimate"');
  });

  it('MEJORAS_ROBUSTEZ.md describe el contrato actual y no arrastra comparativas viejas', () => {
    const content = fs.readFileSync(path.join(root, 'MEJORAS_ROBUSTEZ.md'), 'utf8');

    expect(content).not.toMatch(/[ÃƒÆ’Ã†â€™ÃƒÆ’Ã‚Â°ÃƒÆ’Ã‚Â¢]/);
    expect(content).toContain('README.md');
    expect(content).toContain('DEPLOY.md');
    expect(content).toContain('docs/PRUEBA_PRODUCCION.md');
    expect(content).toContain('La referencia viva del despliegue y la revision operativa es:');
    expect(content).toContain('JWT_SECRET');
    expect(content).toContain('DOMAIN');
    expect(content).toContain('como clasificacion util.');
    expect(content).toContain('vacio como fallo real, no como resultado favorable.');
    expect(content).not.toContain('Cotizador v2.0');
    expect(content).not.toContain('TOP 1%');
    expect(content).not.toContain('La referencia viva del despliegue y la validacion es:');
    expect(content).not.toContain('como clasificacion valida.');
    expect(content).not.toContain('vacio como fallo real, no como exito.');
  });

  it('ci-cd.yml usa acciones modernas y el contrato estable de pruebas', () => {
    const content = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci-cd.yml'), 'utf8');

    expect(content).toContain('actions/checkout@v4');
    expect(content).toContain('actions/setup-node@v4');
    expect(content).toContain('actions/upload-artifact@v4');
    expect(content).toContain('codecov/codecov-action@v4');
    expect(content).toContain('npm test -- --runInBand');
    expect(content).not.toContain('actions/checkout@v3');
    expect(content).not.toContain('actions/setup-node@v3');
    expect(content).not.toContain('codecov/codecov-action@v3');
  });

  it('10_10_ENTERPRISE.md ya no arrastra rankings ni conteos como contrato vivo', () => {
    const content = fs.readFileSync(path.join(root, 'docs', '10_10_ENTERPRISE.md'), 'utf8');

    expect(content).not.toMatch(/[ÃƒÆ’Ã†â€™ÃƒÆ’Ã‚Â°ÃƒÆ’Ã‚Â¢]/);
    expect(content).toContain('README.md');
    expect(content).toContain('DEPLOY.md');
    expect(content).toContain('docs/PRUEBA_PRODUCCION.md');
    expect(content).toContain('Para revisar estado real usa:');
    expect(content).toContain('calculo base y consulta tributaria');
    expect(content).toContain('configurados con revision operativa actual');
    expect(content).toContain('una sola puntuacion ni rankings desactualizados.');
    expect(content).toMatch(/parezcan\s+contrato actual/);
    expect(content).toContain('Si una mejora ya no refleja el sistema actual, debe salir de aqui.');
    expect(content).toMatch(/fuera\s+de fecha convertidos en slogans o cifras comerciales\./);
    expect(content).not.toContain('TOP 1%');
    expect(content).not.toContain('17 agentes');
    expect(content).not.toContain('98%');
    expect(content).not.toContain('una sola puntuacion ni rankings de otra etapa.');
    expect(content).not.toContain('puntuacion concluyente ni rankings congelados.');
    expect(content).not.toContain('puntuacion definitiva ni rankings congelados.');
    expect(content).not.toContain('puntuacion absoluta ni rankings fijos.');
    expect(content).not.toContain('una sola puntuacion ni rankings congelados.');
    expect(content).not.toContain('cifras comerciales viejas.');
    expect(content).not.toContain('cifras comerciales congeladas.');
    expect(content).not.toContain('cifras comerciales fijas.');
    expect(content).not.toContain('Para validar estado real usa:');
    expect(content).not.toContain('calculo base y validacion tributaria');
    expect(content).not.toContain('configurados con revision operativa vigente');
    expect(content).not.toContain('contrato vigente');
    expect(content).not.toContain('sistema vigente');
    expect(content).not.toContain('configurados con validacion operativa vigente');
    expect(content).not.toContain('verificados correctamente');
  });

  it('AUDITORIA_FINAL.md no trata produccion como resuelta ignorando bloqueantes reales', () => {
    const content = fs.readFileSync(path.join(root, 'docs', 'AUDITORIA_FINAL.md'), 'utf8');

    expect(content).not.toMatch(/[ÃƒÆ’Ã†â€™ÃƒÆ’Ã‚Â°ÃƒÆ’Ã‚Â¢]/);
    expect(content).toContain('JWT_SECRET');
    expect(content).toContain('DOMAIN');
    expect(content).toContain('npm run production:check');
    expect(content).toContain('no como referencia de trabajo');
    expect(content).not.toContain('no como referencia actual');
    expect(content).toContain('presentar el entorno como operativo ignorando bloqueantes de entorno');
    expect(content).toContain('tratar la cantidad de endpoints, agentes o paquetes como si no cambiara');
    expect(content).toContain('repetir rutas antiguas de despliegue');
    expect(content).not.toContain('aprobado para produccion');
    expect(content).not.toContain('no como certificado eterno');
    expect(content).not.toContain('no como referencia eterna');
    expect(content).not.toContain('no como referencia sostenida');
    expect(content).not.toContain('congelar la cantidad de endpoints, agentes o paquetes como si no cambiara');
    expect(content).not.toContain('fijar cantidad de endpoints, agentes o paquetes como si no cambiaran');
    expect(content).not.toContain('revivir rutas legacy de despliegue');
    expect(content).not.toContain('presentar el entorno como listo ignorando bloqueantes de entorno');
    expect(content).not.toContain('APROBADO PARA PRODUCCIÓN');
    expect(content).not.toContain('/var/www/cotizador');
    expect(content).not.toContain('pm2 start server/index.js');
  });
  it('AUDITORIA_COMPLETA.md ya no arrastra conteos ni contratos viejos', () => {
    const content = fs.readFileSync(path.join(root, 'docs', 'AUDITORIA_COMPLETA.md'), 'utf8');

    expect(content).not.toMatch(/[ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢]/);
    expect(content).toContain('npm run production:check');
    expect(content).toContain('JWT_SECRET');
    expect(content).toContain('DOMAIN');
    expect(content).toContain('## Advertencias conocidas que no comprometen el sistema base');
    expect(content).toContain('foto desactualizada y enganosa');
    expect(content).toContain('cantidades desactualizadas de endpoints, agentes, lineas o paquetes');
    expect(content).toContain('comparativas comerciales desactualizadas');
    expect(content).toContain('rutas antiguas de despliegue');
    expect(content).not.toContain('29 agentes');
    expect(content).not.toContain('90+');
    expect(content).not.toContain('100% Funcional');
    expect(content).not.toContain('## Advertencias conocidas que no invalidan el sistema base');
    expect(content).not.toContain('foto historica enganosa');
    expect(content).not.toContain('snapshot historico enganoso');
    expect(content).not.toContain('cantidades de otra etapa de endpoints, agentes, lineas o paquetes');
    expect(content).not.toContain('comparativas comerciales de otra etapa');
    expect(content).not.toContain('rutas legacy de despliegue');
    expect(content).not.toContain('cantidades heredadas de endpoints, agentes, lineas o paquetes');
    expect(content).not.toContain('comparativas comerciales heredadas');
    expect(content).not.toContain('cantidades congeladas de endpoints, agentes, lineas o paquetes');
    expect(content).not.toContain('comparativas comerciales congeladas');
    expect(content).not.toContain('cantidades fijas de endpoints, agentes, lineas o paquetes');
  });

  it('AUDITORIA_COMPLETA_2026.md queda como criterio de lectura y no como foto fija', () => {
    const content = fs.readFileSync(path.join(root, 'docs', 'AUDITORIA_COMPLETA_2026.md'), 'utf8');

    expect(content).not.toMatch(/[ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢]/);
    expect(content).toContain('asumir que una cifra desactualizada de endpoints o agentes sigue siendo actual');
    expect(content).toContain('No es una referencia de trabajo ni una fotografia inmovil del sistema.');
    expect(content).not.toContain('No es una referencia actual ni una fotografia inmovil del sistema.');
    expect(content).toContain('volver a listar conteos, rankings ni slogans desactualizados.');
    expect(content).not.toContain('volver a listar conteos de otra etapa, rankings ni slogans de otra etapa.');
    expect(content).not.toContain('asumir que una cifra desactualizada de endpoints o agentes sigue siendo vigente');
    expect(content).not.toContain('asumir que una cifra vieja de endpoints o agentes sigue siendo vigente');
    expect(content).not.toContain('asumir que una cifra vieja de endpoints o agentes sigue siendo valida');
    expect(content).not.toContain('No es una referencia estable ni una fotografia inmovil del sistema.');
    expect(content).not.toContain('No es una referencia duradera ni una fotografia inmovil del sistema.');
    expect(content).not.toContain('No es una referencia permanente ni una fotografia inmovil del sistema.');
    expect(content).not.toContain('No es un certificado permanente ni una fotografia inmovil del sistema.');
    expect(content).not.toContain('volver a listar conteos historicos, rankings ni slogans historicos.');
    expect(content).not.toContain('volver a listar conteos heredados, rankings ni slogans historicos.');
    expect(content).not.toContain('volver a listar conteos congelados, rankings ni slogans historicos.');
    expect(content).not.toContain('volver a listar conteos fijos, rankings ni slogans historicos.');
    expect(content).toContain('npm run lint');
    expect(content).toContain('npm test -- --runInBand');
    expect(content).toContain('docs/AUDITORIA_FINAL.md');
    expect(content).toContain('build sin error visible');
    expect(content).not.toContain('TOP 1%');
    expect(content).not.toContain('29 agentes');
    expect(content).not.toContain('100%');
    expect(content).not.toContain('build exitoso');
  });

  it('VERIFICACION_COMPLETA.md no vuelve a tratar produccion como resuelta por fotos desactualizadas', () => {
    const content = fs.readFileSync(path.join(root, 'docs', 'VERIFICACION_COMPLETA.md'), 'utf8');

    expect(content).not.toMatch(/[ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢]/);
    expect(content).toContain('npm run production:check');
    expect(content).toContain('JWT_SECRET');
    expect(content).toContain('DOMAIN');
    expect(content).toMatch(/sin caer en fotos\s+desactualizadas/);
    expect(content).toContain('que hay un numero previo de endpoints o agentes');
    expect(content).toContain('que una URL local anterior describe siempre el contrato real');
    expect(content).not.toContain('100% listo para produccion');
    expect(content).not.toContain('que todo esta listo para produccion por un snapshot viejo');
    expect(content).not.toContain('snapshots viejos');
    expect(content).not.toContain('79 endpoints');
    expect(content).not.toContain('localhost:3000');
    expect(content).not.toContain('que hay un numero fijo de endpoints o agentes');
    expect(content).not.toContain('que hay un numero heredado de endpoints o agentes');
    expect(content).not.toContain('que hay un numero congelado de endpoints o agentes');
    expect(content).not.toContain('que una URL local fija describe siempre el contrato real');
    expect(content).not.toContain('que una URL local vieja describe siempre el contrato real');
    expect(content).not.toContain('que una URL local heredada describe siempre el contrato real');
    expect(content).not.toContain('que una URL local congelada describe siempre el contrato real');
  });
  it('AGENTES_17.md ya no congela el sistema como arquitectura v2 con conteos previos', () => {
    const content = fs.readFileSync(path.join(root, 'docs', 'AGENTES_17.md'), 'utf8');

    expect(content).not.toMatch(/[ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢]/);
    expect(content).toContain('server/sistema-agentes.js');
    expect(content).toMatch(/estados\s+desactualizados\./);
    expect(content).toContain('/api/agentes/stats');
    expect(content).toContain('node test-sistema-unificado.js');
    expect(content).toContain('Para ver el numero actual:');
    expect(content).toContain('reescribirse para reflejar un numero anterior;');
    expect(content).toContain('No asumas porcentajes favorables previos.');
    expect(content).toContain('No uses este archivo como referencia de produccion.');
    expect(content).toContain('revisiones del');
    expect(content).toContain('`Clasificador`: propone HS y contrasta contra NANDINA.');
    expect(content).toContain('`Auth`: revisa identidad, comunidad privada y roles.');
    expect(content).not.toContain('v2.0');
    expect(content).not.toContain('ARQUITECTURA COMPLETA (17 AGENTES)');
    expect(content).not.toContain('8,017 partidas');
    expect(content).not.toContain('Para ver el numero vigente:');
    expect(content).not.toMatch(/estados\s+de otra etapa\./);
    expect(content).not.toMatch(/estados\s+historicos\./);
    expect(content).not.toContain('reescribirse para reflejar un numero fijo;');
    expect(content).not.toContain('reescribirse para reflejar un numero heredado;');
    expect(content).not.toContain('reescribirse para reflejar un numero congelado;');
    expect(content).not.toContain('No asumas porcentajes favorables fijos.');
    expect(content).not.toContain('No asumas porcentajes favorables heredados.');
    expect(content).not.toContain('No asumas porcentajes favorables congelados.');
    expect(content).not.toContain('No asumas porcentajes de exito fijos.');
    expect(content).not.toContain('No uses este archivo como certificado de produccion.');
    expect(content).not.toContain('validaciones del');
    expect(content).not.toContain('`Clasificador`: propone HS y valida contra NANDINA.');
    expect(content).not.toContain('`Auth`: valida identidad, comunidad privada y roles.');
  });

  it('AGENTES_NAVEGACION.md ya no deja agentes implementados como pendientes ni congela un unico ganador', () => {
    const content = fs.readFileSync(path.join(root, 'docs', 'AGENTES_NAVEGACION.md'), 'utf8');

    expect(content).not.toMatch(/[ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢]/);
    expect(content).toContain('NAVEGACION_AGENT_REGISTRY');
    expect(content).toContain('MemoriaAgente');
    expect(content).toContain('SUNAT');
    expect(content).toContain('VUCE');
    expect(content).toContain('foto desactualizada sobre tiempos, conteos o porcentajes');
    expect(content).toContain('porcentajes o tiempos usados como contrato');
    expect(content).toContain('tratar el numero como si no pudiera cambiar.');
    expect(content).not.toContain('IMPLEMENTADO - AGENTE SUNAT COMPLETO');
    expect(content).not.toContain('AgenteNavegadorVUCE (');
    expect(content).not.toContain('Pendiente');
    expect(content).not.toContain('congelar el numero como si fuera contrato eterno.');
    expect(content).not.toContain('porcentajes o tiempos congelados como contrato');
    expect(content).not.toContain('foto historica de tiempos, conteos o porcentajes');
    expect(content).not.toContain('snapshot historico de tiempos, conteos o porcentajes');
  });

  it('AGENTES_DIAGNOSTICO.md queda alineado al diagnostico real y no a una foto vieja', () => {
    const content = fs.readFileSync(path.join(root, 'docs', 'AGENTES_DIAGNOSTICO.md'), 'utf8');

    expect(content).not.toMatch(/[ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢]/);
    expect(content).toContain('conteos anteriores ni reportes desactualizados.');
    expect(content).toContain('clasificacion con HS vacio tratado como util');
    expect(content).not.toContain('clasificacion con HS vacio tratado como valida');
    expect(content).toContain('node test-sistema-unificado.js');
    expect(content).toContain('/api/agentes/stats');
    expect(content).toContain('JWT_SECRET');
    expect(content).toContain('DOMAIN');
    expect(content).toContain('`404` o `500` tratados como respuesta favorable');
    expect(content).not.toContain('v2.0');
    expect(content).not.toContain('8 Sub-Agentes');
    expect(content).not.toContain('2+ modelos');
    expect(content).not.toContain('conteos anteriores ni reportes de otra etapa.');
    expect(content).not.toContain('conteos anteriores ni reportes historicos.');
    expect(content).not.toContain('conteos viejos ni reportes historicos.');
    expect(content).not.toContain('conteos heredados ni reportes historicos.');
    expect(content).not.toContain('conteos congelados ni reportes historicos.');
    expect(content).not.toContain('`404` o `500` tratados como exito');
  });
  it('KPIs_DASHBOARD.md ya no arrastra pantallas demo congeladas ni mojibake', () => {
    const content = fs.readFileSync(path.join(root, 'docs', 'KPIs_DASHBOARD.md'), 'utf8');

    expect(content).not.toMatch(/[ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢]/);
    expect(content).toContain('server/dashboard/dashboard-service.js');
    expect(content).toContain('client/src/dashboard-view-helpers.cjs');
    expect(content).toContain('N/D');
    expect(content).toContain('## Revision Recomendada');
    expect(content).toContain('Las categorias sin `label` o `value` util no deben entrar al grafico.');
    expect(content).toContain('- si no hay puntos utiles: `N/D` y `Sin serie`');
    expect(content).toContain('- si hay puntos utiles con ultimo valor `0`: mostrar `0`');
    expect(content).toContain('- si no hay categorias utiles: `Sin datos`');
    expect(content).not.toContain('156 cotizaciones');
    expect(content).not.toContain('KPIs RECOMENDADOS PARA EL DASHBOARD');
    expect(content).not.toContain('## Validacion Recomendada');
    expect(content).not.toContain('Las categorias sin `label` o `value` valido no deben entrar al grafico.');
    expect(content).not.toContain('- si no hay puntos validos: `N/D` y `Sin serie`');
    expect(content).not.toContain('- si hay puntos validos con ultimo valor `0`: mostrar `0`');
    expect(content).not.toContain('- si no hay categorias validas: `Sin datos`');
  });

  it('ESPECIFICACION_CANONICA_2026.md ya no apunta a una carpeta de trabajo anterior ni a mensajes de marca arrastrados', () => {
    const content = fs.readFileSync(path.join(root, 'docs', 'ESPECIFICACION_CANONICA_2026.md'), 'utf8');

    expect(content).not.toMatch(/[ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢]/);
    expect(content).toContain('node start-local.js');
    expect(content).toContain('JWT_SECRET');
    expect(content).toContain('DOMAIN');
    expect(content).toContain('- consulta oficial');
    expect(content).toContain('- revisiones explicitas para acciones sensibles');
    expect(content).toContain('La salida tecnica actual para revisar antes de desplegar es:');
    expect(content).toContain('2. tests actuales');
    expect(content).toContain('promesas antiguas');
    expect(content).toContain('mensajes de marca antiguos arrastrados');
    expect(content).toContain('4. fotos desactualizadas');
    expect(content).toContain('rutas locales desactualizadas');
    expect(content).toContain('rutas de la carpeta de trabajo anterior');
    expect(content).toContain('no de fotos desactualizadas');
    expect(content).toContain('resultado anterior cuando cambia el borrador');
    expect(content).toContain('agregados desactualizados');
    expect(content).not.toContain('AppData\\Local\\Programs\\Antigravity\\cotizador');
    expect(content).not.toContain('Ultimate v3.0');
    expect(content).not.toContain('30 agentes');
    expect(content).not.toContain('- validacion oficial');
    expect(content).not.toContain('- confirmaciones explicitas para acciones sensibles');
    expect(content).not.toContain('4. fotos de otra etapa');
    expect(content).not.toContain('agregados de otra etapa');
    expect(content).not.toContain('branding');
    expect(content).not.toContain('branding historico arrastrado');
    expect(content).not.toContain('branding historico heredado');
    expect(content).not.toContain('branding historico congelado');
    expect(content).not.toContain('promesas heredadas');
    expect(content).not.toContain('promesas congeladas');
    expect(content).not.toContain('claims congelados');
    expect(content).not.toContain('rutas del workspace anterior');
    expect(content).not.toContain('rutas locales viejas');
    expect(content).not.toContain('no de fotos viejas');
    expect(content).not.toContain('resultado viejo cuando cambia el borrador');
    expect(content).not.toContain('agregados historicos');
    expect(content).not.toContain('Cuando choque un documento viejo con el codigo actual');
    expect(content).not.toContain('4. fotos historicas');
    expect(content).not.toContain('4. snapshots historicos');
    expect(content).not.toContain('snapshots viejos');
    expect(content).not.toContain('La salida tecnica vigente para revisar antes de desplegar es:');
    expect(content).not.toContain('La salida tecnica vigente para validar antes de desplegar es:');
    expect(content).not.toContain('2. tests vigentes');
  });

  it('AUTO_REPAIR.md ya no vende auto-repair como modulo infalible ni arrastra mojibake', () => {
    const content = fs.readFileSync(path.join(root, 'docs', 'AUTO_REPAIR.md'), 'utf8');

    expect(content).not.toMatch(/[ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢]/);
    expect(content).toContain('server/auto-repair.js');
    expect(content).toContain('tests/unit/auto-repair.test.js');
    expect(content).toContain('ideal de perfeccion.');
    expect(content).toContain('que la tasa interna de resolucion puede leerse aislada del contexto');
    expect(content).toContain('la limpieza debe normalizar dias fuera de rango');
    expect(content).toContain('## Revision Recomendada');
    expect(content).not.toContain('promesa de perfeccion.');
    expect(content).not.toContain('TOP 0.1%');
    expect(content).not.toContain('NIVEL NUNCA VISTO');
    expect(content).not.toContain('`100%` cerrado');
    expect(content).not.toContain('certificado de perfeccion.');
    expect(content).not.toContain('que la tasa interna de resolucion queda congelada');
    expect(content).not.toContain('que la tasa interna de resolucion es fija');
    expect(content).not.toContain('que la tasa de exito es fija');
    expect(content).not.toContain('la limpieza debe normalizar dias invalidos');
    expect(content).not.toContain('## Validacion Recomendada');
  });

  it('AUTO_REPAIR_ESTADO.md reemplaza el nombre anterior y no actua como foto puntual', () => {
    const oldPath = path.join(root, 'docs', 'AUTO_REPAIR_100%.md');
    const newPath = path.join(root, 'docs', 'AUTO_REPAIR_ESTADO.md');
    const content = fs.readFileSync(newPath, 'utf8');

    expect(fs.existsSync(oldPath)).toBe(false);
    expect(fs.existsSync(newPath)).toBe(true);

    expect(content).not.toMatch(/[ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢]/);
    expect(content).toContain('tests/unit/auto-repair.test.js');
    expect(content).toContain('## Estado Actual');
    expect(content).toContain('Lo importante no es un porcentaje aislado, sino:');
    expect(content).toMatch(/conserva el nombre\s+anterior/);
    expect(content).toMatch(/ya no debe usarse como foto\s+puntual del sistema\./);
    expect(content).toMatch(/vale mas que cualquier promesa\s+escrita\./);
    expect(content).not.toContain('100% COMPLETADO');
    expect(content).not.toContain('## Estado Vigente');
    expect(content).not.toContain('TOP 0.1% GLOBAL');
    expect(content).not.toContain('cierre absoluto del sistema.');
    expect(content).not.toContain('claim absoluto.');
    expect(content).not.toMatch(/conserva el nombre\s+historico/);
    expect(content).not.toContain('Lo importante no es un porcentaje congelado, sino:');
    expect(content).not.toContain('Lo importante no es un porcentaje fijo, sino:');
    expect(content).not.toContain('vale mas que cualquier promesa congelada.');
    expect(content).not.toContain('vale mas que cualquier promesa fija.');
  });

  it('AUTO_REPAIR_INTEGRACION.md ya no arrastra pendientes o coberturas viejas', () => {
    const content = fs.readFileSync(path.join(root, 'docs', 'AUTO_REPAIR_INTEGRACION.md'), 'utf8');

    expect(content).not.toMatch(/[ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢]/);
    expect(content).toContain('ejecutarConAutoReparacion()');
    expect(content).toContain('no inflar resultados favorables si todos los reintentos fallan');
    expect(content).toContain('arrastrar una lista desactualizada de agentes "pendientes"');
    expect(content).toContain('## Como Revisar');
    expect(content).not.toContain('100% INTEGRADO');
    expect(content).not.toContain('PENDIENTE ENVOLVER');
    expect(content).not.toContain('55%');
    expect(content).not.toContain('`100%` fija');
    expect(content).not.toContain('congelar una lista vieja de agentes "pendientes"');
    expect(content).not.toContain('no inflar exitos si todos los reintentos fallan');
    expect(content).not.toContain('## Como Validar');
  });

  it('CONECTORES_GOBIERNO.md y PRUEBAS_CONECTORES.md ya no venden verificacion total ni estados falsos', () => {
    const oldPath = path.join(root, 'docs', 'CONECTORES_GOBBIERNO.md');
    const newPath = path.join(root, 'docs', 'CONECTORES_GOBIERNO.md');
    const conectores = fs.readFileSync(newPath, 'utf8');
    const pruebas = fs.readFileSync(path.join(root, 'docs', 'PRUEBAS_CONECTORES.md'), 'utf8');

    expect(fs.existsSync(oldPath)).toBe(false);
    expect(fs.existsSync(newPath)).toBe(true);
    for (const content of [conectores, pruebas]) {
      expect(content).not.toMatch(/[ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢]/);
    }

    expect(conectores).toContain('server/conectores-gobierno.js');
    expect(conectores).toContain('tests/unit/conectores-gobierno.test.js');
    expect(conectores).toContain('disponible sin revision puntual');
    expect(conectores).toContain('sin verificacion puntual');
    expect(conectores).toContain('fuente oficial disponible sin verificacion puntual');
    expect(conectores).toContain('que todos los conectores quedan cubiertos sin revision pendiente');
    expect(conectores).toContain('## Revision Recomendada');
    expect(conectores).not.toContain('que todos los conectores quedan completamente cubiertos');
    expect(pruebas).toContain('reporte puntual sin error visible');
    expect(pruebas).toContain('Este documento resume como revisar conectores sin vender una foto desactualizada como si');
    expect(pruebas).toContain('fuera la referencia de trabajo.');
    expect(pruebas).not.toContain('fuera la referencia actual.');
    expect(pruebas).toContain('Requiere backend corriendo y token activo.');
    expect(pruebas).toContain('declarar cobertura total con una foto desactualizada');
    expect(pruebas).toContain('repetir ejemplos demo como si fueran datos actuales');
    expect(pruebas).not.toContain('fuera referencia estable.');
    expect(pruebas).not.toContain('fuera referencia duradera.');
    expect(pruebas).not.toContain('fuera referencia permanente.');
    expect(pruebas).not.toContain('fuera garantia eterna.');
    expect(pruebas).not.toContain('reporte puntual exitoso');
    expect(pruebas).not.toContain('Requiere backend corriendo y token vigente.');
    expect(pruebas).not.toContain('Requiere backend corriendo y token valido.');
    expect(conectores).not.toContain('## Validacion Recomendada');
    expect(pruebas).not.toContain('Este documento resume como revisar conectores sin vender una foto vieja como si');
    expect(pruebas).not.toContain('Este documento resume como validar conectores sin vender una foto vieja como si');
    expect(pruebas).not.toContain('fuera referencia vigente.');
    expect(pruebas).not.toContain('declarar cobertura total historica');
    expect(pruebas).not.toContain('declarar cobertura total heredada');
    expect(pruebas).not.toContain('declarar cobertura total congelada');
    expect(pruebas).not.toContain('congelar ejemplos demo como si fueran datos vigentes');
    expect(pruebas).not.toContain('fijar ejemplos demo como si fueran datos vigentes');
    expect(pruebas).not.toContain('repetir ejemplos demo como si fueran datos vigentes');
    expect(pruebas).not.toContain('declarar cobertura total fija');
    expect(conectores).not.toContain('que todos los conectores quedan totalmente validados');
    expect(conectores).not.toContain('activo definitivo');
    expect(conectores).not.toContain('Pendiente API');
    expect(conectores).not.toContain('pendiente API');
    expect(conectores).not.toContain('IMPLEMENTADO - 9 ENTIDADES CONECTADAS');
    expect(conectores).not.toContain('"100% verificados"');
    expect(conectores).not.toContain('API real activa');

    expect(pruebas).toContain('node test-conectores.js');
    expect(pruebas).toContain('test-endpoints-http.js');
    expect(pruebas).not.toContain('100% EXITOSO');
    expect(pruebas).not.toContain('100% exitoso');
    expect(pruebas).not.toContain('100% VERIFICADO - PRODUCCION');
    expect(pruebas).not.toContain('declarar exito total fijo');
  });

  it('BACKUP_OPERATIVO_GITHUB.md ya no apunta a una carpeta de trabajo anterior ni a secretos en claro', () => {
    const content = fs.readFileSync(path.join(root, 'docs', 'BACKUP_OPERATIVO_GITHUB.md'), 'utf8');

    expect(content).not.toMatch(/[ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢]/);
    expect(content).toContain('scripts/create-secure-backup.js');
    expect(content).toContain('scripts/restore-secure-backup.js');
    expect(content).toContain('C:\\\\ruta\\\\al\\\\repo');
    expect(content).toContain('instantaneas completas del VPS');
    expect(content).toContain('instantanea del VPS para desastre mayor');
    expect(content).not.toContain('C:\\Users\\Billy\\OneDrive\\Documentos\\Playground\\Cotizador---Broke-Shop');
    expect(content).not.toContain('AppData\\Local\\Programs\\Antigravity\\cotizador');
    expect(content).not.toContain('*.tar.gz` sin cifrar');
    expect(content).not.toContain('snapshots completos del VPS');
    expect(content).not.toContain('snapshot del VPS para desastre mayor');
  });

  it('AUDITORIA_PACKAGE_JSON.md y DEPENDENCIAS_SOLUCIONADAS.md ya no venden fotos viejas como contrato vivo', () => {
    const auditoria = fs.readFileSync(path.join(root, 'docs', 'AUDITORIA_PACKAGE_JSON.md'), 'utf8');
    const dependencias = fs.readFileSync(path.join(root, 'docs', 'DEPENDENCIAS_SOLUCIONADAS.md'), 'utf8');

    for (const content of [auditoria, dependencias]) {
      expect(content).not.toMatch(/[ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢]/);
      expect(content).toContain('npm test -- --runInBand');
      expect(content).not.toContain('APROBADO PARA PRODUCCION');
      expect(content).not.toContain('ULTIMATE v3.0');
    }

    expect(auditoria).toContain('package.json');
    expect(auditoria).toContain('npm ls --depth=0');
    expect(auditoria).toContain('## Que Revisar');
    expect(auditoria).toContain('folleto desactualizado.');
    expect(auditoria).toContain('entorno operativo sin revisar bloqueantes reales');
    expect(auditoria).toContain('conteos previos de dependencias');
    expect(auditoria).toContain('texto desactualizado.');
    expect(auditoria).toContain('promesas desactualizadas');
    expect(auditoria).toContain('mensajes de marca, rutas o promesas desactualizadas.');
    expect(auditoria).toContain('rutas antiguas de la carpeta de trabajo anterior');
    expect(auditoria).not.toContain('aprobado para produccion');
    expect(auditoria).not.toContain('## Que Validar');
    expect(auditoria).not.toContain('folleto de otra etapa.');
    expect(auditoria).not.toContain('folleto historico.');
    expect(auditoria).not.toContain('entorno operativo sin validar bloqueantes reales');
    expect(auditoria).not.toContain('entorno listo sin validar bloqueantes reales');
    expect(auditoria).not.toContain('branding, rutas o promesas desactualizadas.');
    expect(auditoria).not.toContain('rutas antiguas del workspace anterior');
    expect(auditoria).not.toContain('rutas legacy del workspace anterior');
    expect(auditoria).not.toContain('cantidades fijas de dependencias');
    expect(auditoria).not.toContain('conteos heredados de dependencias');
    expect(auditoria).not.toContain('cantidades congeladas de dependencias');
    expect(auditoria).not.toContain('texto fijo.');
    expect(auditoria).not.toContain('texto viejo.');
    expect(auditoria).not.toContain('texto heredado.');
    expect(auditoria).not.toContain('texto congelado.');
    expect(auditoria).not.toContain('cantidades exactas de dependencias');
    expect(auditoria).not.toContain('promesas viejas');
    expect(auditoria).not.toContain('promesas heredadas');
    expect(auditoria).not.toContain('promesas congeladas');
    expect(auditoria).not.toContain('claims congelados');
    expect(dependencias).toContain('sql.js');
    expect(dependencias).toContain('El nombre de este archivo conserva un nombre anterior.');
    expect(dependencias).toContain('## Decision Actual');
    expect(dependencias).toContain('tratar comparativas desactualizadas como si siguieran siendo actuales.');
    expect(dependencias).toContain('No debe usarse como prueba unica de que "todo esta resuelto".');
    expect(dependencias).toContain('revision real por `npm ls --depth=0`, `npm run lint`, `npm test -- --runInBand` y `npm run client:build`');
    expect(dependencias).not.toContain('Intentar better-sqlite3 primero');
    expect(dependencias).not.toContain('## Decision Vigente');
    expect(dependencias).not.toContain('better-sqlite3 cargado');
    expect(dependencias).not.toContain('El nombre de este archivo viene de otra etapa.');
    expect(dependencias).not.toContain('El nombre de este archivo es historico.');
    expect(dependencias).not.toContain('tratar comparativas desactualizadas como si siguieran vigentes.');
    expect(dependencias).not.toContain('tratar benchmarks o comparativas desactualizadas como si siguieran vigentes.');
    expect(dependencias).not.toContain('congelar benchmarks o comparativas historicas.');
    expect(dependencias).not.toContain('No debe usarse como prueba eterna de que "todo esta resuelto".');
    expect(dependencias).not.toContain('No debe usarse como certificado eterno de que "todo esta resuelto".');
    expect(dependencias).not.toContain('validacion real por `npm ls --depth=0`, `npm run lint`, `npm test -- --runInBand` y `npm run client:build`');
  });

  it('INVESTIGACION_ARQUITECTURA.md, INVESTIGACION_MEMORIA.md y MEMORIA_HIBRIDA.md quedan alineados al codigo vivo', () => {
    const arquitectura = fs.readFileSync(path.join(root, 'docs', 'INVESTIGACION_ARQUITECTURA.md'), 'utf8');
    const memoriaInvestigacion = fs.readFileSync(path.join(root, 'docs', 'INVESTIGACION_MEMORIA.md'), 'utf8');
    const memoria = fs.readFileSync(path.join(root, 'docs', 'MEMORIA_HIBRIDA.md'), 'utf8');

    for (const content of [arquitectura, memoriaInvestigacion, memoria]) {
      expect(content).not.toMatch(/[ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢]/);
      expect(content).not.toContain('v2.0');
      expect(content).not.toContain('100%');
    }

    expect(arquitectura).toContain('server/sistema-agentes.js');
    expect(arquitectura).toContain('/api/agentes/stats');
    expect(arquitectura).toContain('BASE_URL="http://localhost:PUERTO_REAL"');
    expect(arquitectura).toContain('`client/src/App.jsx` como superficie principal de la carpeta de trabajo');
    expect(arquitectura).toContain('rankings tratados como senal unica frente a terceros');
    expect(arquitectura).toContain('conteos desactualizados de agentes');
    expect(arquitectura).toContain('conteos no deben presentarse como un numero estable en esta guia.');
    expect(arquitectura).not.toContain('17 AGENTES ESPECIALIZADOS');
    expect(arquitectura).not.toContain('rankings absolutos frente a terceros');
    expect(arquitectura).not.toContain('rankings tratados como medida final frente a terceros');
    expect(arquitectura).not.toContain('Los conteos no deben congelarse en esta guia.');
    expect(arquitectura).not.toContain('marketing congelado');
    expect(arquitectura).not.toContain('`client/src/App.jsx` como superficie principal del workspace');
    expect(arquitectura).not.toContain('conteos heredados de agentes');
    expect(arquitectura).not.toContain('conteos congelados de agentes');
    expect(arquitectura).not.toContain('conteos fijos de agentes');
    expect(arquitectura).not.toContain('localhost:3001');
    expect(memoriaInvestigacion).toContain('server/memoria-hibrida.js');
    expect(memoriaInvestigacion).toContain('comparativas desactualizadas');
    expect(memoriaInvestigacion).toContain('porcentajes tratados como senal unica de valor');
    expect(memoriaInvestigacion).toContain('sin convertir una recomendacion puntual en regla inmovil.');
    expect(memoriaInvestigacion).not.toContain('NO implementes memoria vectorial');
    expect(memoriaInvestigacion).not.toContain('benchmarks desactualizados');
    expect(memoriaInvestigacion).not.toContain('benchmarks heredados');
    expect(memoriaInvestigacion).not.toContain('benchmarks congelados');
    expect(memoriaInvestigacion).not.toContain('sin convertir una recomendacion puntual en dogma eterno.');
    expect(memoriaInvestigacion).not.toContain('porcentajes tratados como medida final de valor');
    expect(memoriaInvestigacion).not.toContain('porcentajes usados como veredicto de valor');
    expect(memoriaInvestigacion).not.toContain('porcentajes concluyentes de valor');
    expect(memoriaInvestigacion).not.toContain('porcentajes definitivos de valor');
    expect(memoriaInvestigacion).not.toContain('porcentajes absolutos de valor');
    expect(memoria).toContain('/api/memoria/estadisticas');
    expect(memoria).toContain('embedding_json');
    expect(memoria).toContain('una cobertura vectorial completa');
    expect(memoria).toContain('cantidades desactualizadas de usuarios o cotizaciones');
    expect(memoria).not.toContain('IMPLEMENTADA CON VECTORES (100%)');
    expect(memoria).not.toContain('una cobertura vectorial absoluta');
    expect(memoria).not.toContain('latencias de otra etapa como contrato');
    expect(memoria).not.toContain('cantidades de otra etapa de usuarios o cotizaciones');
    expect(memoria).not.toContain('latencias historicas como contrato');
    expect(memoria).not.toContain('latencias heredadas como contrato');
    expect(memoria).not.toContain('cantidades historicas de usuarios o cotizaciones');
    expect(memoria).not.toContain('cantidades heredadas de usuarios o cotizaciones');
    expect(memoria).not.toContain('latencias congeladas como contrato');
    expect(memoria).not.toContain('cantidades congeladas de usuarios o cotizaciones');
    expect(memoria).not.toContain('cantidades fijas de usuarios o cotizaciones');
  });

  it('los docs residuales nuevos no reviven mensajes de marca arrastrados ni una carpeta de trabajo anterior', () => {
    const prueba = fs.readFileSync(path.join(root, 'docs', 'PRUEBA_PRODUCCION.md'), 'utf8');
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    const arquitectura = fs.readFileSync(path.join(root, 'docs', 'ARQUITECTURA_VALIDACION_OFICIAL_IMPORTACION_2026.md'), 'utf8');
    const fletes = fs.readFileSync(path.join(root, 'docs', 'FLETES_API.md'), 'utf8');

    expect(prueba).not.toContain('ULTIMATE v3.0');
    expect(prueba).not.toContain('Version: 3.0 Ultimate');

    expect(readme).not.toContain('Ultimate v3.0');

    expect(arquitectura).toContain('server/agentes-navegacion/AgenteNavegadorSUNAT.js');
    expect(arquitectura).toContain('server/conectores-gobierno.js');
    expect(arquitectura).toContain('# Arquitectura de consulta oficial en vivo 2026');
    expect(arquitectura).toContain('La consulta oficial debe correr detras del flujo principal.');
    expect(arquitectura).toContain('esto no es consulta oficial en vivo');
    expect(arquitectura).toContain('B --> D["Consulta oficial en vivo"]');
    expect(arquitectura).toContain('consultado oficialmente en esta corrida');
    expect(arquitectura).toContain('## Matriz maestra de consulta');
    expect(arquitectura).toContain('respuestas oficiales por subpartida');
    expect(arquitectura).toContain('no debe frenar todo el flujo si una consulta en vivo falla');
    expect(arquitectura).toContain('ADUANET / SUNAT para revisar tratamiento de la partida, no para adivinar la partida desde cero');
    expect(arquitectura).toContain('- tasas aplicables');
    expect(arquitectura).toContain('Dato: gravamenes aplicables, convenios, restricciones, indicadores y resoluciones por subpartida');
    expect(arquitectura).toContain('tasas aplicables deben revisarse contra la partida');
    expect(arquitectura).toContain('si una tasa no pudo revisarse en vivo, debe salir como `regla_interna`');
    expect(arquitectura).toContain('`pendiente_revision`');
    expect(arquitectura).toContain('`fecha_consulta`');
    expect(arquitectura).toContain('datos desactualizados');
    expect(arquitectura).toContain('cache anterior');
    expect(arquitectura).not.toContain('no debe frenar todo el flujo si una validacion en vivo falla');
    expect(arquitectura).toContain('ADUANET aporta el tratamiento de la subpartida elegida');
    expect(arquitectura).toContain('la fuente oficial aporta tratamiento, no reemplaza la clasificacion automatica');
    expect(arquitectura).toContain('`Consultado: 2026-03-24 10:42 America/Lima`');
    expect(arquitectura).toContain('no debe decir `SUNAT consultado en vivo` cuando uso una regla interna');
    expect(arquitectura).not.toContain('AppData\\Local\\Programs\\Antigravity\\cotizador');
    expect(arquitectura).not.toContain('Antigravity');
    expect(arquitectura).not.toContain('## Matriz maestra de validacion');
    expect(arquitectura).not.toContain('# Arquitectura de validacion oficial en vivo 2026');
    expect(arquitectura).not.toContain('La validacion oficial debe correr detras del flujo principal.');
    expect(arquitectura).not.toContain('`Validado: 2026-03-24 10:42 America/Lima`');
    expect(arquitectura).not.toContain('esto no es validacion oficial en vivo');
    expect(arquitectura).not.toContain('B --> D["Validacion oficial en vivo"]');
    expect(arquitectura).not.toContain('- tasas vigentes');
    expect(arquitectura).not.toContain('Dato: gravamenes vigentes, convenios, restricciones, indicadores y resoluciones por subpartida');
    expect(arquitectura).not.toContain('datos historicos');
    expect(arquitectura).not.toContain('cache viejo');
    expect(arquitectura).not.toContain('confirmado oficialmente');
    expect(arquitectura).not.toContain('confirmaciones oficiales por subpartida');
    expect(arquitectura).not.toContain('no debe decir `SUNAT validado` cuando uso una regla interna');
    expect(arquitectura).not.toContain('ADUANET valida el tratamiento de la subpartida elegida');
    expect(arquitectura).not.toContain('la fuente oficial valida tratamiento, no reemplaza la clasificacion automatica');
    expect(arquitectura).not.toContain('ADUANET / SUNAT para validar tratamiento de la partida, no para adivinar la partida desde cero');
    expect(arquitectura).not.toContain('tasas aplicables deben validarse contra la partida');
    expect(arquitectura).not.toContain('si una tasa no pudo validarse en vivo, debe salir como `regla_interna`');
    expect(arquitectura).not.toContain('`pendiente_validacion`');
    expect(arquitectura).not.toContain('`fecha_validacion`');

    expect(fletes).toContain('Este documento resume el contrato actual de cotizacion de flete.');
    expect(fletes).toContain('## Estrategia actual');
    expect(fletes).toContain('server/flete-api.js');
    expect(fletes).toContain('server/couriers/integrador-logistica.js');
    expect(fletes).toContain('TRACKINGMORE_DAILY_LIMIT');
    expect(fletes).toContain('cuota diaria local');
    expect(fletes).toContain('No debe leerse como tabla oficial ni como cotizacion final.');
    expect(fletes).toContain('No vende precision consistente ni trata proveedores anteriores como si siguieran siendo referencia de trabajo.');
    expect(fletes).not.toContain('Este documento resume el contrato vigente de cotizacion de flete.');
    expect(fletes).not.toContain('## Estrategia vigente');
    expect(fletes).not.toContain('No vende precision consistente ni trata proveedores anteriores como si siguieran siendo referencia actual.');
    expect(fletes).toContain('No hay un numero unico aplicable a todos los casos.');
    expect(fletes).toContain('No representa una cuota oficial publicada por el proveedor.');
    expect(fletes).toContain('nunca presentar un fallback como tarifa con respaldo contractual');
    expect(fletes).toContain('proveedor logistico real, si existe credencial util y respuesta util');
    expect(fletes).toContain('sujeto a revision comercial');
    expect(fletes).toContain('estado local de TrackingMore');
    expect(fletes).not.toContain('proveedor logistico real, si existe credencial util y respuesta valida');
    expect(fletes).not.toContain('No hay un numero unico garantizado.');
    expect(fletes).not.toContain('No debe leerse como tabla oficial ni como cotizacion cerrada.');
    expect(fletes).not.toContain('No representa una cuota oficial garantizada por el proveedor.');
    expect(fletes).not.toContain('No vende precision consistente ni trata proveedores anteriores como si siguieran siendo referencia vigente.');
    expect(fletes).not.toContain('No vende precision consistente ni trata proveedores de otra etapa como si siguieran siendo referencia vigente.');
    expect(fletes).not.toContain('No vende precision consistente ni congela proveedores historicos como si siguieran siendo referencia vigente.');
    expect(fletes).not.toContain('No vende precision uniforme ni congela proveedores historicos como si siguieran siendo referencia vigente.');
    expect(fletes).not.toContain('No vende precision uniforme ni congela proveedores historicos como si fueran garantia permanente.');
    expect(fletes).not.toContain('No vende precision absoluta ni congela proveedores historicos como si fueran garantia permanente.');
    expect(fletes).not.toContain('No vende precision total ni congela proveedores historicos como si fueran garantia permanente.');
    expect(fletes).not.toContain('No vende precision garantizada ni congela proveedores historicos como si fueran garantia permanente.');
    expect(fletes).not.toContain('snapshot local de TrackingMore');
    expect(fletes).not.toContain('TrackingMore API (PRINCIPAL)');
    expect(fletes).not.toContain('| **1. API Real** |');
    expect(fletes).not.toContain('nunca presentar un fallback como tarifa confirmada');
    expect(fletes).not.toContain('sujeto a confirmacion comercial');
    expect(fletes).toContain('no debe prometer cifras desactualizadas de precision');
    expect(fletes).toContain('no debe usar ejemplos demo como si fueran contrato productivo');
    expect(fletes).not.toContain('95%');
    expect(fletes).not.toContain('98%');
    expect(fletes).not.toContain('No vende precision consistente ni trata proveedores historicos como si siguieran siendo referencia vigente.');
    expect(fletes).not.toContain('no debe prometer cifras viejas de precision');
    expect(fletes).not.toContain('no debe congelar ejemplos demo como si fueran contrato productivo');
    expect(fletes).not.toContain('no debe prometer cifras congeladas de precision');
    expect(fletes).not.toContain('no debe prometer cifras fijas de precision');
  });

  it('dashboard.html y .env.example quedan alineados al contrato actual', () => {
    const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
    const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');

    expect(dashboard).toContain('ImportAIAgent Cotizador - Dashboard operativo');
    expect(dashboard).toContain('<h1>ImportAIAgent Cotizador</h1>');
    expect(dashboard).toContain('id="dashboardNotice"');
    expect(dashboard).not.toContain('Cotizador Peru - Dashboard operativo');
    expect(dashboard).not.toContain('<h1>Cotizador Peru</h1>');
    expect(dashboard).not.toContain('Ultimate v3.0');

    expect(envExample).toContain('ImportAIAgent Cotizador - configuracion de ejemplo');
    expect(envExample).toContain('GROQ_API_KEY');
    expect(envExample).toContain('JWT_SECRET');
    expect(envExample).toContain('WS_PORT=3002');
    expect(envExample).toContain('OFFICIAL_FX_STEALTH_ENABLED=false');
    expect(envExample).toContain('OFFICIAL_FX_USE_CAMOUFOX=false');
    expect(envExample).not.toContain('v2.0');
    expect(envExample).not.toContain('ImportaciÃ³n');
    expect(envExample).not.toContain('OFFICIAL_FX_STEALTH_ENABLED=true');
    expect(envExample).not.toContain('OFFICIAL_FX_USE_CAMOUFOX=true');
  });

  it('.env.production.example no activa por defecto la navegacion resistente opcional', () => {
    const envProductionExample = fs.readFileSync(path.join(root, '.env.production.example'), 'utf8');

    expect(envProductionExample).toContain('OFFICIAL_FX_STEALTH_ENABLED=false');
    expect(envProductionExample).toContain('OFFICIAL_FX_USE_CAMOUFOX=false');
    expect(envProductionExample).toContain('Activalo solo si instalaste el helper Python/browser correspondiente.');
    expect(envProductionExample).not.toContain('OFFICIAL_FX_STEALTH_ENABLED=true');
    expect(envProductionExample).not.toContain('OFFICIAL_FX_USE_CAMOUFOX=true');
  });

  it('validate-production-env.js no vende produccion como resuelta solo por pasar configuracion', () => {
    const content = fs.readFileSync(path.join(root, 'scripts', 'validate-production-env.js'), 'utf8');

    expect(content).toContain('Sin bloqueantes de configuracion en esta pasada');
    expect(content).toContain('Aun falta revisar el despliegue y la operacion real');
    expect(content).toContain("[CONFIGURACION] Sin bloqueantes de configuracion en esta pasada.");
    expect(content).toContain("printSection('CONFIGURACION', successes)");
    expect(content).not.toContain("printSection('OK', successes)");
    expect(content).not.toContain('[LISTO] Configuracion suficiente para un despliegue de produccion.');
    expect(content).not.toContain('Aun falta validar el despliegue y la operacion real');
  });
  it('CAMINO_10_DE_10_REALISTA_2026.md y NAVEGACION_RESISTENTE_SUNAT_2026.md ya no arrastran wording viejo ni mojibake', () => {
    const roadmap = fs.readFileSync(path.join(root, 'docs', 'CAMINO_10_DE_10_REALISTA_2026.md'), 'utf8');
    const navigation = fs.readFileSync(path.join(root, 'docs', 'NAVEGACION_RESISTENTE_SUNAT_2026.md'), 'utf8');

    expect(roadmap).toContain('capa basada en navegador');
    expect(roadmap).toContain('Este documento resume lo que todavia falta para que el cotizador llegue a un `10/10 realista` sin vender humo.');
    expect(roadmap).toContain('La meta no es prometer exactitud consistente en todos los casos');
    expect(roadmap).toContain('Ya quedo implementada una mejora concreta y de bajo riesgo:');
    expect(roadmap).toContain('Flujo conversacional con aclaraciones y correcciones aplicadas.');
    expect(roadmap).toContain('exigir revision humana cuando la confianza sea baja o haya conflicto entre agentes;');
    expect(roadmap).toContain('revision obligatoria cuando cambie producto, pais, incoterm, canal o HS;');
    expect(roadmap).toContain('versionar el resultado entre `estimado`, `contrastado` y `con_respaldo`.');
    expect(roadmap).toContain('Consulta oficial viva con ADUANET para gravamenes, convenios y restricciones por subpartida.');
    expect(roadmap).not.toContain('Validacion oficial viva con ADUANET para gravamenes, convenios y restricciones por subpartida.');
    expect(roadmap).not.toContain('Este documento fija lo que todavia falta para que el cotizador llegue a un `10/10 realista` sin vender humo.');
    expect(roadmap).not.toContain('La meta no es prometer exactitud absoluta en todos los casos');
    expect(roadmap).not.toContain('La meta no es prometer exactitud uniforme en todos los casos');
    expect(roadmap).not.toContain('La meta no es prometer exactitud total en todos los casos');
    expect(roadmap).not.toContain('La meta no es prometer exactitud garantizada en todos los casos');
    expect(roadmap).not.toContain('automÃ');
    expect(roadmap).not.toContain('Ya quedo lista una mejora concreta y de bajo riesgo:');
    expect(roadmap).not.toContain('Flujo conversacional con aclaraciones y correcciones confirmadas.');
    expect(roadmap).not.toContain('exigir confirmacion humana cuando la confianza sea baja o haya conflicto entre agentes;');
    expect(roadmap).not.toContain('confirmacion obligatoria cuando cambie producto, pais, incoterm, canal o HS;');
    expect(roadmap).not.toContain('versionar el resultado entre `estimado`, `contrastado` y `confirmado`.');
    expect(roadmap).not.toContain('versionar el resultado entre `estimado`, `validado` y `confirmado`.');
    expect(roadmap).not.toContain('no meter stealth en todos los agentes');

    expect(navigation).toContain('OFFICIAL_FX_STEALTH_ENABLED');
    expect(navigation).toContain('compatibilidad con el runtime actual');
    expect(navigation).not.toContain('anti-bot');
    expect(navigation).not.toContain('huella mas fuerte');
  });

  it('los docs residuales de integracion y auto-repair no fijan conteos ni promesas rigidas', () => {
    const pendientes = fs.readFileSync(path.join(root, 'docs', 'PENDIENTES_INTEGRACION_2026.md'), 'utf8');
    const autoRepairEstado = fs.readFileSync(path.join(root, 'docs', 'AUTO_REPAIR_ESTADO.md'), 'utf8');

    expect(pendientes).toContain('/api/agentes/stats');
    expect(pendientes).toContain('una vez revisados en esta pasada');
    expect(pendientes).toContain('Revision de entorno de produccion.');
    expect(pendientes).not.toContain('Registro oficial de 30 agentes.');
    expect(pendientes).not.toContain('una vez validados');
    expect(pendientes).not.toContain('Validacion de entorno de produccion.');

    expect(autoRepairEstado).not.toContain('100% completado');
    expect(autoRepairEstado).not.toContain('"100%"');
    expect(autoRepairEstado).toMatch(/promesa\s+escrita/);
    expect(autoRepairEstado).not.toMatch(/promesa\s+fija/);
    expect(autoRepairEstado).not.toMatch(/promesa\s+congelada/);
    expect(autoRepairEstado).not.toContain('claim');
  });

  it('DOCTRINA_CLASIFICACION_ARANCELARIA_2026.md no depende de rutas privadas del autor', () => {
    const content = fs.readFileSync(path.join(root, 'docs', 'DOCTRINA_CLASIFICACION_ARANCELARIA_2026.md'), 'utf8');

    expect(content).toContain('material de referencia local no versionado');
    expect(content).not.toContain('C:/Users/Billy/Downloads/');
    expect(content).not.toContain('C:\\Users\\Billy\\Downloads');
  });

  it('API_MATRIX_2026.md usa lenguaje operativo y no conversacional de sesion', () => {
    const content = fs.readFileSync(path.join(root, 'docs', 'API_MATRIX_2026.md'), 'utf8');

    expect(content).toContain('Lo que el repositorio puede dejar preparado');
    expect(content).toContain('Lo que ya tiene base de integracion para conectar');
    expect(content).toContain('Lo que conviene priorizar primero');
    expect(content).toContain('Lo que requiere gestion externa');
    expect(content).toContain('Cuenta propietaria');
    expect(content).toContain('Documentar el flujo actual de alta y uso.');
    expect(content).toContain('Preparar fallbacks y revisiones cuando falte una credencial.');
    expect(content).toContain('Estado oficial revisado en esta pasada');
    expect(content).toContain('Acceso oficial revisado via SOL y endpoints SUNAT');
    expect(content).toContain('Portal y solicitud de API key revisados en esta pasada');
    expect(content).toContain('Portal oficial revisado en esta pasada');
    expect(content).toContain('APIs publicas claras no identificadas en esta pasada');
    expect(content).toContain('En esta pasada no se identifico REST publica; hoy conviene scraping + NANDINA.');
    expect(content).not.toContain('Documentar el flujo vigente de alta y uso.');
    expect(content).not.toContain('Lo que el repositorio puede dejar listo');
    expect(content).not.toContain('dejar listas en el codigo');
    expect(content).not.toContain('Lo que recomiendo activar primero');
    expect(content).not.toContain('Lo que ya esta preparado para conectar');
    expect(content).not.toContain('Lo que ya esta realmente listo para conectar');
    expect(content).not.toContain('### Yo puedo dejarte listo');
    expect(content).not.toContain('### Tu debes crear o conseguir');
    expect(content).not.toContain('Documentar el flujo exacto de alta y uso.');
    expect(content).not.toContain('En esta pasada no confirme REST publica; hoy conviene scraping + NANDINA.');
    expect(content).not.toContain('Preparar fallbacks y validaciones cuando falte una credencial.');
    expect(content).not.toContain('Estado oficial confirmado');
    expect(content).not.toContain('Acceso oficial confirmado via SOL y endpoints SUNAT');
    expect(content).not.toContain('Portal y solicitud de API key confirmados');
    expect(content).not.toContain('Portal oficial confirmado');
    expect(content).not.toContain('APIs publicas claras no confirmadas en esta pasada');
    expect(content).not.toContain('me las pasas');
    expect(content).not.toContain('yo te dejo');
    expect(content).not.toContain('tu cuenta de Groq');
  });

  it('AGENTES_NAVEGACION.md y AUTO_REPAIR.md ya no usan wording fuerte de listo o exitoso', () => {
    const agentes = fs.readFileSync(path.join(root, 'docs', 'AGENTES_NAVEGACION.md'), 'utf8');
    const autoRepair = fs.readFileSync(path.join(root, 'docs', 'AUTO_REPAIR.md'), 'utf8');

    expect(agentes).toContain('marca el conjunto como inicializado');
    expect(agentes).toContain('respuesta util del conector');
    expect(agentes).not.toContain('respuesta valida del conector');
    expect(agentes).not.toContain('marca el conjunto como listo');
    expect(agentes).not.toContain('navegacion exitosa');

    expect(autoRepair).toContain('registrar soluciones aplicadas o fallidas');
    expect(autoRepair).toContain('un reintento solo cuenta como resuelto si realmente funciono');
    expect(autoRepair).toContain('que el sistema puede darse por cubierto ignorando bloqueantes reales');
    expect(autoRepair).not.toContain('registrar soluciones exitosas o fallidas');
    expect(autoRepair).not.toContain('un reintento solo cuenta como exitoso si realmente funciono');
    expect(autoRepair).not.toContain('que el sistema puede darse por validado ignorando bloqueantes reales');
  });

  it('los docs operativos de produccion ya incluyen WS_PORT como requisito real', () => {
    const files = [
      'README.md',
      'DEPLOY.md',
      'MEJORAS_ROBUSTEZ.md',
      'docs/10_10_ENTERPRISE.md',
      'docs/AGENTES_DIAGNOSTICO.md',
      'docs/AUDITORIA_COMPLETA.md',
      'docs/AUDITORIA_COMPLETA_2026.md',
      'docs/AUDITORIA_FINAL.md',
      'docs/ESPECIFICACION_CANONICA_2026.md',
      'docs/MEMBRESIAS_COMUNIDAD.md',
      'docs/PENDIENTES_INTEGRACION_2026.md',
      'docs/PRUEBA_PRODUCCION.md',
      'docs/VERIFICACION_COMPLETA.md',
    ];

    for (const file of files) {
      const content = fs.readFileSync(path.join(root, file), 'utf8');
      expect(content).toContain('WS_PORT');
    }
  });

  it('MEJORAS_ROBUSTEZ.md ya no usa cierre operativo fuerte para bloqueantes de entorno', () => {
    const content = fs.readFileSync(path.join(root, 'MEJORAS_ROBUSTEZ.md'), 'utf8');

    expect(content).toContain('no deberia considerarse operativo sin');
    expect(content).toContain('reservas en este frente');
    expect(content).not.toContain('listo para cerrar');
    expect(content).not.toContain('cerrar la parte operativa');
  });

it('los docs ya no usan "cerrado" como atajo ambiguo de lectura limitada', () => {
    const files = [
      'docs/AUDITORIA_COMPLETA_2026.md',
      'docs/AUTO_REPAIR.md',
      'docs/CONECTORES_GOBIERNO.md',
      'docs/INVESTIGACION_ARQUITECTURA.md',
      'docs/PRUEBAS_CONECTORES.md',
      'docs/VERIFICACION_COMPLETA.md',
    ];

    for (const file of files) {
      const content = fs.readFileSync(path.join(root, file), 'utf8');
      expect(content).not.toContain('entorno de produccion cerrado');
      expect(content).not.toContain('dado por cerrado');
      expect(content).not.toContain('cerrados por completo');
      expect(content).not.toContain('cerrado para produccion');
      expect(content).not.toContain('produccion cerrada');
      expect(content).not.toContain('rankings cerrados');
    }
  });

it('los docs ya no usan lenguaje de aprobacion o "listo para produccion" como lectura limitada', () => {
    const files = [
      'docs/AGENTES_DIAGNOSTICO.md',
      'docs/AUDITORIA_COMPLETA.md',
      'docs/PRUEBAS_CONECTORES.md',
      'docs/PRUEBA_PRODUCCION.md',
      'docs/VERIFICACION_COMPLETA.md',
    ];

    for (const file of files) {
      const content = fs.readFileSync(path.join(root, file), 'utf8');
      expect(content).not.toContain('esta listo para produccion');
      expect(content).not.toContain('listo para produccion');
      expect(content).not.toContain('produccion lista');
      expect(content).not.toContain('Aprobado para despliegue');
      expect(content).not.toContain('Criterio de aprobacion');
    }
  });

  it('scripts no arrastra pycache Python dentro del repo', () => {
    const pycacheDir = path.join(root, 'scripts', '__pycache__');
    const entries = fs.existsSync(pycacheDir) ? fs.readdirSync(pycacheDir) : [];

    expect(entries.filter((entry) => entry.endsWith('.pyc'))).toHaveLength(0);
  });
});
