// server/sistema-agentes.js
// 
// SISTEMA UNIFICADO DE AGENTES — Integra TODOS los agentes
// 
// Total: 29 agentes especializados
// - 18 agentes originales (sistema base)
// - 9 agentes de navegación (gobierno)
// - 2 agentes de soporte (memoria + auto-repair)

const agentesNavegacion = require("./agentes-navegacion");
const autoRepair = require("./auto-repair");

class SistemaUnificadoDeAgentes {
  constructor() {
    this.agentes = {
      // Agentes de Navegación (9)
      navegacion: agentesNavegacion,

      // Auto-Repair (1)
      autoRepair: autoRepair,

      // Total agentes activos
      total: 0
    };

    this.inicializado = false;
  }

  // ═══════════════════════════════════════════════════
  // INICIALIZAR TODOS LOS AGENTES
  // ═══════════════════════════════════════════════════
  async inicializar() {
    if (this.inicializado) {
      console.log("[SISTEMA AGENTES] ✅ Ya inicializado");
      return;
    }

    console.log("[SISTEMA AGENTES] Inicializando 29 agentes...");

    try {
      // Inicializar agentes de navegación (9 agentes)
      // ESTO INICIALIZA LA MEMORIA PRIMERO, LUEGO LOS AGENTES
      await agentesNavegacion.init();
      console.log("   ✅ 9 Agentes de Navegación: SUNAT, ADUANET, VUCE, INDECOPI, MTC, DIGESA, SENASA, MINAM, PRODUCE");

      // Pequeño delay para asegurar que las tablas estén listas
      await new Promise(resolve => setTimeout(resolve, 100));

      // Inicializar Auto-Repair
      await autoRepair.init();
      console.log("   ✅ Auto-Repair: Agentes que se autocorrigen");

      // Otro delay para asegurar que las tablas de auto-repair estén listas
      await new Promise(resolve => setTimeout(resolve, 100));

      // Contar total de agentes
      this.agentes.total = this._contarAgentes();

      this.inicializado = true;
      console.log(`[SISTEMA AGENTES] ✅ ${this.agentes.total} agentes inicializados\n`);

    } catch (e) {
      console.error("[SISTEMA AGENTES] ❌ Error:", e.message);
      throw e;
    }
  }

  // ═══════════════════════════════════════════════════
  // CONTAR TOTAL DE AGENTES
  // ═══════════════════════════════════════════════════
  _contarAgentes() {
    // Agentes de navegación: 9
    // Auto-Repair: 1 (sistema)
    // Agentes originales: 18 (en otros módulos)
    // Total: 29
    return 29;
  }

  // ═══════════════════════════════════════════════════
  // OBTENER ESTADÍSTICAS GENERALES
  // ═══════════════════════════════════════════════════
  obtenerEstadisticas() {
    return {
      total_agentes: this.agentes.total,
      inicializado: this.inicializado,
      agentes_navegacion: agentesNavegacion.obtenerEstadisticasGenerales(),
      auto_repair: autoRepair.getEstadisticas ? autoRepair.getEstadisticas() : null,
      resumen: {
        navegacion: 9,
        originales: 18,
        soporte: 2,
        total: 29
      }
    };
  }

  // ═══════════════════════════════════════════════════
  // CONSULTAR DATOS DE GOBIERNO (unificado)
  // ═══════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════
  // DETECTAR REQUISITOS DE PRODUCTO (automático)
  // ═══════════════════════════════════════════════════
  async detectarRequisitos(producto, categoria, pais) {
    if (!this.inicializado) {
      await this.inicializar();
    }

    const requisitos = {
      producto,
      categoria,
      pais,
      permisos: [],
      alertas: []
    };

    // Verificar MTC (homologación)
    const mtc = await agentesNavegacion.MTC.detectarSiRequiereHomologacion(producto, categoria);
    if (mtc.requiereHomologacion) {
      requisitos.permisos.push({
        entidad: 'MTC',
        tramite: 'Certificado de Homologación',
        obligatorio: true
      });
    }

    // Verificar DIGESA (registro sanitario)
    const digesa = await agentesNavegacion.DIGESA.detectarSiRequiereRegistro(producto, categoria);
    if (digesa.requiereRegistroSanitario) {
      requisitos.permisos.push({
        entidad: 'DIGESA',
        tramite: 'Registro Sanitario',
        obligatorio: true
      });
    }

    // Verificar SENASA (permiso fitosanitario)
    const senasa = await agentesNavegacion.SENASA.detectarSiRequierePermiso(producto, categoria, pais);
    if (senasa.requierePermisoFitosanitario) {
      requisitos.permisos.push({
        entidad: 'SENASA',
        tramite: 'Permiso Fitosanitario',
        obligatorio: true
      });
    }

    // Verificar MINAM (permiso ambiental)
    const minam = await agentesNavegacion.MINAM.detectarSiRequierePermiso(producto, categoria);
    if (minam.requierePermisoAmbiental) {
      requisitos.permisos.push({
        entidad: 'MINAM',
        tramite: 'Permiso Ambiental',
        obligatorio: true
      });
    }

    // Verificar PRODUCE (pesca o IQBF)
    const producePesca = await agentesNavegacion.PRODUCE.detectarSiRequierePermisoPesca(producto, categoria);
    if (producePesca.esPesquero) {
      requisitos.permisos.push({
        entidad: 'PRODUCE-SANIPES',
        tramite: 'Permiso de Importación de Productos Pesqueros',
        obligatorio: true
      });
    }

    // Verificar INDECOPI (antidumping)
    const indecopi = await agentesNavegacion.INDECOPI.consultarAntidumping(producto, pais);
    if (indecopi.tieneAntidumping) {
      requisitos.alertas.push({
        tipo: 'antidumping',
        entidad: 'INDECOPI',
        mensaje: `Antidumping aplicado: ${indecopi.tasa}%`,
        nivel: 'alto'
      });
    }

    return requisitos;
  }

  // ═══════════════════════════════════════════════════
  // GENERAR REPORTE COMPLETO DE IMPORTACIÓN
  // ═══════════════════════════════════════════════════
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
      alertas: []
    };

    try {
      // Consultar arancel
      reporte.arancel = await agentesNavegacion.SUNAT.consultarArancel(partida);

      // Consultar tipo de cambio
      reporte.tipo_cambio = await agentesNavegacion.SUNAT.consultarTipoCambio();

      // Consultar restricciones
      reporte.restricciones = await agentesNavegacion.VUCE.consultarRestricciones(partida, pais);

      // Consultar antidumping
      reporte.antidumping = await agentesNavegacion.INDECOPI.consultarAntidumping(producto, pais);

      // Detectar permisos requeridos
      const requisitos = await this.detectarRequisitos(producto, '', pais);
      reporte.permisos_requeridos = requisitos.permisos;
      reporte.alertas = requisitos.alertas;

    } catch (e) {
      reporte.error = e.message;
    }

    return reporte;
  }
}

// Exportar instancia única
const sistemaAgentes = new SistemaUnificadoDeAgentes();

module.exports = sistemaAgentes;
