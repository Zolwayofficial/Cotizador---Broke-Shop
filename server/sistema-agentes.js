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
    this._initPromise = null;
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
        memoria: 'Pendiente de preparacion',
        total_agentes: agentesActivos.length,
      };
    }

    try {
      return agentesNavegacion.obtenerEstadisticasGenerales();
    } catch (error) {
      return {
        agentes_activos: agentesActivos,
        memoria: 'Preparada con advertencias',
        total_agentes: agentesActivos.length,
        error: error.message,
      };
    }
  }

  _obtenerEstadisticasAutoRepair() {
    if (!this.inicializado || !autoRepair.getEstadisticas) {
      return {
        estado: 'Pendiente de preparacion',
      };
    }

    try {
      return autoRepair.getEstadisticas();
    } catch (error) {
      return {
        estado: 'Preparado con advertencias',
        error: error.message,
      };
    }
  }

  async inicializar() {
    if (this.inicializado) {
      console.log('[SISTEMA AGENTES] Inicializacion ya completada');
      return;
    }

    if (this._initPromise) {
      await this._initPromise;
      return;
    }

    this._initPromise = (async () => {
      const registro = this.obtenerRegistroAgentes();
      console.log(`[SISTEMA AGENTES] Inicializando ${registro.total} agentes...`);

      try {
        await agentesNavegacion.init();
        console.log(`   Navegacion inicializada: ${registro.resumen.navegacion} agentes registrados: ${registro.navegacion.map((agent) => agent.nombre).join(', ')}`);

        await new Promise((resolve) => setTimeout(resolve, 100));

        await autoRepair.init();
        console.log('   Auto-Repair preparado para autocorreccion');

        await new Promise((resolve) => setTimeout(resolve, 100));

        this.agentes.registro = this.obtenerRegistroAgentes();
        this.agentes.total = this.agentes.registro.total;
        this.inicializado = true;

        console.log(`[SISTEMA AGENTES] Inicializacion completada para ${this.agentes.total} agentes\n`);
      } catch (error) {
        console.error('[SISTEMA AGENTES] Error:', error.message);
        throw error;
      } finally {
        this._initPromise = null;
      }
    })();

    await this._initPromise;
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

  async consultarGobierno(tipo, datos = {}) {
    if (!this.inicializado) {
      await this.inicializar();
    }

    switch (String(tipo || '').trim().toLowerCase()) {
    case 'tipo_cambio':
      return await agentesNavegacion.SUNAT.consultarTipoCambio();

    case 'arancel':
      return await agentesNavegacion.SUNAT.consultarArancel(this._requireDato(datos, 'partida', tipo));

    case 'restricciones':
      return await agentesNavegacion.VUCE.consultarRestricciones(
        this._requireDato(datos, 'partida', tipo),
        this._requireDato(datos, 'pais', tipo)
      );

    case 'antidumping':
      return await agentesNavegacion.INDECOPI.consultarAntidumping(
        this._requireDato(datos, 'producto', tipo),
        this._requireDato(datos, 'pais', tipo)
      );

    case 'homologacion':
      return await agentesNavegacion.MTC.consultarHomologacion(
        this._requireDato(datos, 'producto', tipo),
        this._requireDato(datos, 'marca', tipo),
        this._requireDato(datos, 'modelo', tipo)
      );

    case 'registro_sanitario':
      return await agentesNavegacion.DIGESA.consultarRegistroSanitario(
        this._requireDato(datos, 'producto', tipo),
        this._requireDato(datos, 'laboratorio', tipo)
      );

    case 'permiso_fitosanitario':
      return await agentesNavegacion.SENASA.consultarPermisoFitosanitario(
        this._requireDato(datos, 'producto', tipo),
        this._requireDato(datos, 'pais', tipo)
      );

    case 'permiso_ambiental':
      return await agentesNavegacion.MINAM.consultarPermisoAmbiental(this._requireDato(datos, 'producto', tipo));

    case 'permiso_pesca':
      return await agentesNavegacion.PRODUCE.consultarPermisoPesca(this._requireDato(datos, 'producto', tipo));

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
      errores_fuente: [],
    };

    const categoriaNormalizada = categoria || '';
    const paisNormalizado = pais || '';

    await this._ejecutarConsultaSegura(
      requisitos.errores_fuente,
      'mtc',
      async () => agentesNavegacion.MTC.detectarSiRequiereHomologacion(producto, categoriaNormalizada),
      (mtc) => {
        if (mtc?.requiereHomologacion) {
          requisitos.permisos.push({
            entidad: 'MTC',
            tramite: 'Certificado de Homologacion',
            obligatorio: true,
          });
        }
      }
    );

    await this._ejecutarConsultaSegura(
      requisitos.errores_fuente,
      'digesa',
      async () => agentesNavegacion.DIGESA.detectarSiRequiereRegistro(producto, categoriaNormalizada),
      (digesa) => {
        if (digesa?.requiereRegistroSanitario) {
          requisitos.permisos.push({
            entidad: 'DIGESA',
            tramite: 'Registro Sanitario',
            obligatorio: true,
          });
        }
      }
    );

    await this._ejecutarConsultaSegura(
      requisitos.errores_fuente,
      'senasa',
      async () => agentesNavegacion.SENASA.detectarSiRequierePermiso(producto, categoriaNormalizada, paisNormalizado),
      (senasa) => {
        if (senasa?.requierePermisoFitosanitario) {
          requisitos.permisos.push({
            entidad: 'SENASA',
            tramite: 'Permiso Fitosanitario',
            obligatorio: true,
          });
        }
      }
    );

    await this._ejecutarConsultaSegura(
      requisitos.errores_fuente,
      'minam',
      async () => agentesNavegacion.MINAM.detectarSiRequierePermiso(producto, categoriaNormalizada),
      (minam) => {
        if (minam?.requierePermisoAmbiental) {
          requisitos.permisos.push({
            entidad: 'MINAM',
            tramite: 'Permiso Ambiental',
            obligatorio: true,
          });
        }
      }
    );

    await this._ejecutarConsultaSegura(
      requisitos.errores_fuente,
      'produce',
      async () => agentesNavegacion.PRODUCE.detectarSiRequierePermisoPesca(producto, categoriaNormalizada),
      (producePesca) => {
        if (producePesca?.esPesquero) {
          requisitos.permisos.push({
            entidad: 'PRODUCE-SANIPES',
            tramite: 'Permiso de Importacion de Productos Pesqueros',
            obligatorio: true,
          });
        }
      }
    );

    await this._ejecutarConsultaSegura(
      requisitos.errores_fuente,
      'indecopi',
      async () => agentesNavegacion.INDECOPI.consultarAntidumping(producto, paisNormalizado),
      (indecopi) => {
        if (indecopi?.tieneAntidumping) {
          requisitos.alertas.push({
            tipo: 'antidumping',
            entidad: 'INDECOPI',
            mensaje: `Antidumping aplicado: ${indecopi.tasa}%`,
            nivel: 'alto',
          });
        }
      }
    );

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
      errores_fuente: [],
    };

    await this._ejecutarConsultaSegura(
      reporte.errores_fuente,
      'arancel',
      async () => agentesNavegacion.SUNAT.consultarArancel(partida),
      (value) => {
        reporte.arancel = value;
      }
    );
    await this._ejecutarConsultaSegura(
      reporte.errores_fuente,
      'tipo_cambio',
      async () => agentesNavegacion.SUNAT.consultarTipoCambio(),
      (value) => {
        reporte.tipo_cambio = value;
      }
    );
    await this._ejecutarConsultaSegura(
      reporte.errores_fuente,
      'restricciones',
      async () => agentesNavegacion.VUCE.consultarRestricciones(partida, pais),
      (value) => {
        reporte.restricciones = value;
      }
    );
    await this._ejecutarConsultaSegura(
      reporte.errores_fuente,
      'antidumping',
      async () => agentesNavegacion.INDECOPI.consultarAntidumping(producto, pais),
      (value) => {
        reporte.antidumping = value;
      }
    );
    await this._ejecutarConsultaSegura(
      reporte.errores_fuente,
      'requisitos',
      async () => this.detectarRequisitos(producto, '', pais),
      (requisitos) => {
        reporte.permisos_requeridos = requisitos.permisos || [];
        reporte.alertas = requisitos.alertas || [];
        if (Array.isArray(requisitos.errores_fuente) && requisitos.errores_fuente.length > 0) {
          reporte.errores_fuente.push(
            ...requisitos.errores_fuente.map((item) => ({
              fuente: `requisitos:${item.fuente}`,
              error: item.error,
            }))
          );
        }
      }
    );

    if (!reporte.arancel && !reporte.tipo_cambio && !reporte.restricciones && !reporte.antidumping && reporte.errores_fuente.length > 0) {
      reporte.error = 'No se pudo completar ninguna consulta oficial';
    }

    return reporte;
  }

  _requireDato(datos, campo, tipo) {
    const valor = datos?.[campo];
    if (valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '')) {
      throw new Error(`Falta "${campo}" para la consulta ${tipo}`);
    }
    return typeof valor === 'string' ? valor.trim() : valor;
  }

  async _ejecutarConsultaSegura(errores, fuente, consulta, onSuccess) {
    try {
      const result = await consulta();
      onSuccess(result);
      return result;
    } catch (error) {
      errores.push({
        fuente,
        error: error.message,
      });
      return null;
    }
  }
}

const sistemaAgentes = new SistemaUnificadoDeAgentes();

module.exports = sistemaAgentes;
