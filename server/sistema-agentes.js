// server/sistema-agentes.js
//
// Sistema unificado de agentes y roles activos.

const { BASE_AGENT_REGISTRY } = require('./agente');
const { CONVERSATIONAL_AGENT_REGISTRY } = require('./agente-conversador');
const agentesNavegacion = require('./agentes-navegacion');
const autoRepair = require('./auto-repair');
const { AUTH_AGENT_DESCRIPTOR } = require('./auth');

const SUPPORT_AGENT_REGISTRY = [
  { id: 'memoria-agentes', nombre: 'Memoria de Agentes', categoria: 'soporte' },
  { id: 'auto-repair', nombre: 'Auto-Repair', categoria: 'soporte' },
  { ...AUTH_AGENT_DESCRIPTOR },
];

class SistemaUnificadoDeAgentes {
  constructor() {
    this.agentes = {
      navegacion: agentesNavegacion,
      autoRepair,
      auth: AUTH_AGENT_DESCRIPTOR,
      registro: null,
      total: 0,
    };

    this.inicializado = false;
  }

  _buildRegistroAgentes() {
    const conversacion = CONVERSATIONAL_AGENT_REGISTRY.map((agent) => ({ ...agent }));
    const base = BASE_AGENT_REGISTRY.map((agent) => ({ ...agent }));
    const navegacion = (agentesNavegacion.NAVEGACION_AGENT_REGISTRY || []).map((agent) => ({ ...agent }));
    const soporte = SUPPORT_AGENT_REGISTRY.map((agent) => ({ ...agent }));
    const total = conversacion.length + base.length + navegacion.length + soporte.length;

    return {
      conversacion,
      base,
      navegacion,
      soporte,
      total,
      resumen: {
        originales: conversacion.length + base.length,
        navegacion: navegacion.length,
        soporte: soporte.length,
        total,
      },
    };
  }

  _contarAgentes() {
    return this.obtenerRegistroAgentes().total;
  }

  obtenerRegistroAgentes() {
    const registro = this._buildRegistroAgentes();
    this.agentes.registro = registro;
    this.agentes.total = registro.total;
    return registro;
  }

  _obtenerEstadisticasNavegacion() {
    const agentesActivos = (agentesNavegacion.NAVEGACION_AGENT_REGISTRY || []).map((agent) => agent.nombre);

    if (!this.inicializado) {
      return {
        agentes_activos: agentesActivos,
        memoria: 'Pendiente de inicializacion',
        total_agentes: agentesActivos.length,
      };
    }

    try {
      return agentesNavegacion.obtenerEstadisticasGenerales();
    } catch (error) {
      return {
        agentes_activos: agentesActivos,
        memoria: 'Inicializada con advertencias',
        total_agentes: agentesActivos.length,
        error: error.message,
      };
    }
  }

  _obtenerEstadisticasAutoRepair() {
    if (!this.inicializado || !autoRepair.getEstadisticas) {
      return {
        estado: 'Pendiente de inicializacion',
      };
    }

    try {
      return autoRepair.getEstadisticas();
    } catch (error) {
      return {
        estado: 'Inicializado con advertencias',
        error: error.message,
      };
    }
  }

  async inicializar() {
    if (this.inicializado) {
      console.log('[SISTEMA AGENTES] OK Ya inicializado');
      return;
    }

    const registro = this.obtenerRegistroAgentes();
    console.log(`[SISTEMA AGENTES] Inicializando ${registro.total} agentes...`);

    try {
      await agentesNavegacion.init();
      console.log(`   OK ${registro.resumen.navegacion} Agentes de Navegacion: ${registro.navegacion.map((agent) => agent.nombre).join(', ')}`);

      await new Promise((resolve) => setTimeout(resolve, 100));

      await autoRepair.init();
      console.log('   OK Auto-Repair: Agentes que se autocorrigen');

      await new Promise((resolve) => setTimeout(resolve, 100));

      this.agentes.registro = this.obtenerRegistroAgentes();
      this.agentes.total = this.agentes.registro.total;
      this.inicializado = true;

      console.log(`[SISTEMA AGENTES] OK ${this.agentes.total} agentes inicializados\n`);
    } catch (error) {
      console.error('[SISTEMA AGENTES] Error:', error.message);
      throw error;
    }
  }

  obtenerEstadisticas() {
    const registro = this.obtenerRegistroAgentes();

    return {
      total_agentes: registro.total,
      inicializado: this.inicializado,
      registro_agentes: registro,
      agentes_navegacion: this._obtenerEstadisticasNavegacion(),
      auto_repair: this._obtenerEstadisticasAutoRepair(),
      resumen: registro.resumen,
    };
  }

  async consultarGobierno(tipo, datos) {
    if (!this.inicializado) {
      await this.inicializar();
    }

    switch (tipo) {
    case 'tipo_cambio':
      return await agentesNavegacion.SUNAT.consultarTipoCambio();

    case 'arancel':
      return await agentesNavegacion.SUNAT.consultarArancel(datos.partida);

    case 'restricciones':
      return await agentesNavegacion.VUCE.consultarRestricciones(datos.partida, datos.pais);

    case 'antidumping':
      return await agentesNavegacion.INDECOPI.consultarAntidumping(datos.producto, datos.pais);

    case 'homologacion':
      return await agentesNavegacion.MTC.consultarHomologacion(datos.producto, datos.marca, datos.modelo);

    case 'registro_sanitario':
      return await agentesNavegacion.DIGESA.consultarRegistroSanitario(datos.producto, datos.laboratorio);

    case 'permiso_fitosanitario':
      return await agentesNavegacion.SENASA.consultarPermisoFitosanitario(datos.producto, datos.pais);

    case 'permiso_ambiental':
      return await agentesNavegacion.MINAM.consultarPermisoAmbiental(datos.producto);

    case 'permiso_pesca':
      return await agentesNavegacion.PRODUCE.consultarPermisoPesca(datos.producto);

    default:
      throw new Error(`Tipo de consulta no reconocido: ${tipo}`);
    }
  }

  async detectarRequisitos(producto, categoria, pais) {
    if (!this.inicializado) {
      await this.inicializar();
    }

    const requisitos = {
      producto,
      categoria,
      pais,
      permisos: [],
      alertas: [],
    };

    const mtc = await agentesNavegacion.MTC.detectarSiRequiereHomologacion(producto, categoria);
    if (mtc.requiereHomologacion) {
      requisitos.permisos.push({
        entidad: 'MTC',
        tramite: 'Certificado de Homologacion',
        obligatorio: true,
      });
    }

    const digesa = await agentesNavegacion.DIGESA.detectarSiRequiereRegistro(producto, categoria);
    if (digesa.requiereRegistroSanitario) {
      requisitos.permisos.push({
        entidad: 'DIGESA',
        tramite: 'Registro Sanitario',
        obligatorio: true,
      });
    }

    const senasa = await agentesNavegacion.SENASA.detectarSiRequierePermiso(producto, categoria, pais);
    if (senasa.requierePermisoFitosanitario) {
      requisitos.permisos.push({
        entidad: 'SENASA',
        tramite: 'Permiso Fitosanitario',
        obligatorio: true,
      });
    }

    const minam = await agentesNavegacion.MINAM.detectarSiRequierePermiso(producto, categoria);
    if (minam.requierePermisoAmbiental) {
      requisitos.permisos.push({
        entidad: 'MINAM',
        tramite: 'Permiso Ambiental',
        obligatorio: true,
      });
    }

    const producePesca = await agentesNavegacion.PRODUCE.detectarSiRequierePermisoPesca(producto, categoria);
    if (producePesca.esPesquero) {
      requisitos.permisos.push({
        entidad: 'PRODUCE-SANIPES',
        tramite: 'Permiso de Importacion de Productos Pesqueros',
        obligatorio: true,
      });
    }

    const indecopi = await agentesNavegacion.INDECOPI.consultarAntidumping(producto, pais);
    if (indecopi.tieneAntidumping) {
      requisitos.alertas.push({
        tipo: 'antidumping',
        entidad: 'INDECOPI',
        mensaje: `Antidumping aplicado: ${indecopi.tasa}%`,
        nivel: 'alto',
      });
    }

    return requisitos;
  }

  async generarReporteImportacion(producto, partida, pais) {
    if (!this.inicializado) {
      await this.inicializar();
    }

    const reporte = {
      producto,
      partida,
      pais,
      fecha: new Date().toISOString(),
      arancel: null,
      tipo_cambio: null,
      restricciones: null,
      antidumping: null,
      permisos_requeridos: [],
      alertas: [],
    };

    try {
      reporte.arancel = await agentesNavegacion.SUNAT.consultarArancel(partida);
      reporte.tipo_cambio = await agentesNavegacion.SUNAT.consultarTipoCambio();
      reporte.restricciones = await agentesNavegacion.VUCE.consultarRestricciones(partida, pais);
      reporte.antidumping = await agentesNavegacion.INDECOPI.consultarAntidumping(producto, pais);

      const requisitos = await this.detectarRequisitos(producto, '', pais);
      reporte.permisos_requeridos = requisitos.permisos;
      reporte.alertas = requisitos.alertas;
    } catch (error) {
      reporte.error = error.message;
    }

    return reporte;
  }
}

const sistemaAgentes = new SistemaUnificadoDeAgentes();

module.exports = sistemaAgentes;
