// server/membresias/membresias-service.js
// 
// SERVICIO DE MEMBRESÍAS COMUNITARIAS
// 
// Features:
// - Registro con código de invitación
// - Niveles: Gratis, Premium, VIP
// - Validación de grupo
// - Control de acceso
// - Referidos

const db = require('../db');

// ═══════════════════════════════════════════════════
// NIVELES DE MEMBRESÍA
// ═══════════════════════════════════════════════════

const NIVELES = {
  GRATIS: {
    nombre: 'Gratis',
    precio: 0,
    limiteCotizaciones: 5,
    limiteConsultas: 10,
    accesoDashboard: false,
    accesoComunidad: true,
    soporte: 'Comunidad'
  },
  PREMIUM: {
    nombre: 'Premium',
    precio: 29.99,
    limiteCotizaciones: 50,
    limiteConsultas: 100,
    accesoDashboard: true,
    accesoComunidad: true,
    soporte: 'Email'
  },
  VIP: {
    nombre: 'VIP',
    precio: 99.99,
    limiteCotizaciones: -1, // Ilimitado
    limiteConsultas: -1,
    accesoDashboard: true,
    accesoComunidad: true,
    soporte: 'Prioritario'
  }
};

// ═══════════════════════════════════════════════════
// SERVICIO DE MEMBRESÍAS
// ═══════════════════════════════════════════════════

class MembresiasService {
  constructor() {
    // Las tablas se crean en db.js automáticamente
  }

  // ═══════════════════════════════════════════════════
  // REGISTRAR USUARIO CON MEMBRESÍA
  // ═══════════════════════════════════════════════════

  async registrarUsuario(email, password, nombre, codigoInvitacion = null) {
    // Verificar código de invitación si es requerido
    if (codigoInvitacion) {
      const codigoValido = await this._validarCodigoInvitacion(codigoInvitacion);
      if (!codigoValido) {
        throw new Error('Código de invitación inválido o expirado');
      }
    }

    // Registrar usuario (usando auth.js)
    const auth = require('../auth');
    const usuario = auth.register(email, password, nombre);

    // Crear membresía
    db.run(`
      INSERT INTO membresias (usuario_id, nivel, codigo_invitacion, referido_por)
      VALUES (?, 'GRATIS', ?, ?)
    `, [usuario.id, codigoInvitacion, codigoInvitacion ? this._obtenerCreadorCodigo(codigoInvitacion) : null]);

    // Actualizar usos del código
    if (codigoInvitacion) {
      this._incrementarUsoCodigo(codigoInvitacion);
    }

    return {
      ...usuario,
      membresia: 'GRATIS'
    };
  }

  // ═══════════════════════════════════════════════════
  // VALIDAR CÓDIGO DE INVITACIÓN
  // ═══════════════════════════════════════════════════

  async _validarCodigoInvitacion(codigo) {
    const codigoData = db.get(`
      SELECT * FROM codigos_invitacion 
      WHERE codigo = ? AND activo = 1
    `, [codigo]);

    if (!codigoData) return false;
    if (codigoData.usos_maximos > 0 && codigoData.usos_actuales >= codigoData.usos_maximos) return false;

    return true;
  }

  _obtenerCreadorCodigo(codigo) {
    const codigoData = db.get(`
      SELECT creado_por FROM codigos_invitacion WHERE codigo = ?
    `, [codigo]);

    return codigoData ? codigoData.creado_por : null;
  }

  _incrementarUsoCodigo(codigo) {
    db.run(`
      UPDATE codigos_invitacion 
      SET usos_actuales = usos_actuales + 1
      WHERE codigo = ?
    `, [codigo]);
  }

  // ═══════════════════════════════════════════════════
  // GENERAR CÓDIGO DE INVITACIÓN
  // ═══════════════════════════════════════════════════

  generarCodigoInvitacion(creadoPor, tipo = 'NORMAL', usosMaximos = 1) {
    const codigo = 'INV-' + Math.random().toString(36).substring(2, 10).toUpperCase();

    db.run(`
      INSERT INTO codigos_invitacion (codigo, tipo, usos_maximos, creado_por)
      VALUES (?, ?, ?, ?)
    `, [codigo, tipo, usosMaximos, creadoPor]);

    return codigo;
  }

  // ═══════════════════════════════════════════════════
  // ACTUALIZAR NIVEL DE MEMBRESÍA
  // ═══════════════════════════════════════════════════

  actualizarNivel(usuarioId, nuevoNivel, fechaVencimiento = null) {
    if (!NIVELES[nuevoNivel]) {
      throw new Error('Nivel de membresía inválido');
    }

    db.run(`
      UPDATE membresias 
      SET nivel = ?, fecha_vencimiento = ?, updated_at = datetime('now')
      WHERE usuario_id = ?
    `, [nuevoNivel, fechaVencimiento, usuarioId]);

    return { nivel: nuevoNivel, vencimiento: fechaVencimiento };
  }

  // ═══════════════════════════════════════════════════
  // VERIFICAR LÍMITES DE USO
  // ═══════════════════════════════════════════════════

  verificarLimite(usuarioId, tipo) {
    const membresia = db.get(`
      SELECT * FROM membresias WHERE usuario_id = ? AND activo = 1
    `, [usuarioId]);

    if (!membresia) {
      throw new Error('Membresía no encontrada');
    }

    const nivel = NIVELES[membresia.nivel];

    if (tipo === 'cotizacion') {
      if (nivel.limiteCotizaciones === -1) return { permitido: true };

      const permitido = membresia.cotizaciones_usadas < nivel.limiteCotizaciones;
      return {
        permitido,
        usados: membresia.cotizaciones_usadas,
        limite: nivel.limiteCotizaciones,
        restantes: permitido ? nivel.limiteCotizaciones - membresia.cotizaciones_usadas : 0
      };
    }

    if (tipo === 'consulta') {
      if (nivel.limiteConsultas === -1) return { permitido: true };

      const permitido = membresia.consultas_usadas < nivel.limiteConsultas;
      return {
        permitido,
        usados: membresia.consultas_usadas,
        limite: nivel.limiteConsultas,
        restantes: permitido ? nivel.limiteConsultas - membresia.consultas_usadas : 0
      };
    }

    return { permitido: true };
  }

  // ═══════════════════════════════════════════════════
  // REGISTRAR USO
  // ═══════════════════════════════════════════════════

  registrarUso(usuarioId, tipo) {
    if (tipo === 'cotizacion') {
      db.run(`
        UPDATE membresias 
        SET cotizaciones_usadas = cotizaciones_usadas + 1, updated_at = datetime('now')
        WHERE usuario_id = ?
      `, [usuarioId]);
    } else if (tipo === 'consulta') {
      db.run(`
        UPDATE membresias 
        SET consultas_usadas = consultas_usadas + 1, updated_at = datetime('now')
        WHERE usuario_id = ?
      `, [usuarioId]);
    }
  }

  // ═══════════════════════════════════════════════════
  // OBTENER MEMBRESÍA DE USUARIO
  // ═══════════════════════════════════════════════════

  obtenerMembresia(usuarioId) {
    const membresia = db.get(`
      SELECT m.*, u.email, u.name
      FROM membresias m
      JOIN users u ON m.usuario_id = u.id
      WHERE m.usuario_id = ?
    `, [usuarioId]);

    if (!membresia) return null;

    const nivel = NIVELES[membresia.nivel];

    return {
      ...membresia,
      nivelNombre: nivel.nombre,
      beneficios: nivel,
      vencida: membresia.fecha_vencimiento && new Date(membresia.fecha_vencimiento) < new Date()
    };
  }

  // ═══════════════════════════════════════════════════
  // LISTAR MIEMBROS DE LA COMUNIDAD
  // ═══════════════════════════════════════════════════

  listarMiembros(filtros = {}) {
    let query = `
      SELECT m.*, u.email, u.name, u.created_at as fecha_registro
      FROM membresias m
      JOIN users u ON m.usuario_id = u.id
      WHERE m.activo = 1
    `;

    const params = [];

    if (filtros.nivel) {
      query += ' AND m.nivel = ?';
      params.push(filtros.nivel);
    }

    if (filtros.activo !== undefined) {
      query += ' AND m.activo = ?';
      params.push(filtros.activo ? 1 : 0);
    }

    query += ' ORDER BY m.created_at DESC';

    return db.all(query, params);
  }

  // ═══════════════════════════════════════════════════
  // REGISTRAR PAGO DE MEMBRESÍA
  // ═══════════════════════════════════════════════════

  registrarPago(usuarioId, monto, nivel, periodo, estado = 'pendiente') {
    db.run(`
      INSERT INTO pagos_membresia (usuario_id, monto, nivel, periodo, estado)
      VALUES (?, ?, ?, ?, ?)
    `, [usuarioId, monto, nivel, periodo, estado]);

    // Si está pagado, actualizar membresía
    if (estado === 'pagado') {
      const fechaVencimiento = this._calcularVencimiento(periodo);
      this.actualizarNivel(usuarioId, nivel, fechaVencimiento);
    }

    return { ok: true };
  }

  _calcularVencimiento(periodo) {
    const ahora = new Date();

    if (periodo === 'mensual') {
      ahora.setMonth(ahora.getMonth() + 1);
    } else if (periodo === 'anual') {
      ahora.setFullYear(ahora.getFullYear() + 1);
    }

    return ahora.toISOString();
  }

  // ═══════════════════════════════════════════════════
  // OBTENER ESTADÍSTICAS DE MEMBRESÍAS
  // ═══════════════════════════════════════════════════

  obtenerEstadisticas() {
    const total = db.get('SELECT COUNT(*) as count FROM membresias WHERE activo = 1')?.count || 0;
    const gratis = db.get('SELECT COUNT(*) as count FROM membresias WHERE nivel = \'GRATIS\' AND activo = 1')?.count || 0;
    const premium = db.get('SELECT COUNT(*) as count FROM membresias WHERE nivel = \'PREMIUM\' AND activo = 1')?.count || 0;
    const vip = db.get('SELECT COUNT(*) as count FROM membresias WHERE nivel = \'VIP\' AND activo = 1')?.count || 0;

    const ingresosMes = db.get(`
      SELECT SUM(monto) as total FROM pagos_membresia 
      WHERE estado = 'pagado' AND strftime('%m', fecha_pago) = strftime('%m', 'now')
    `)?.total || 0;

    return {
      total,
      porNivel: { gratis, premium, vip },
      ingresosMes
    };
  }
}

// ═══════════════════════════════════════════════════
// EXPORTAR INSTANCIA ÚNICA
// ═══════════════════════════════════════════════════

const membresiasService = new MembresiasService();

module.exports = membresiasService;
