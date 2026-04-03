// server/membresias/membresias-service.js
//
// SERVICIO DE MEMBRESIAS COMUNITARIAS
//
// Features:
// - Registro con codigo de invitacion
// - Niveles: Gratis, Premium, VIP
// - Control de grupo
// - Control de acceso
// - Referidos

const db = require('../db');

// --------------------------------------------------
// NIVELES DE MEMBRESIA
// --------------------------------------------------

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
    limiteCotizaciones: -1,
    limiteConsultas: -1,
    accesoDashboard: true,
    accesoComunidad: true,
    soporte: 'Prioritario'
  }
};

// --------------------------------------------------
// SERVICIO DE MEMBRESIAS
// --------------------------------------------------

class MembresiasService {
  constructor() {
    // Las tablas se crean en db.js automaticamente
  }

  _asegurarMembresiaBase(usuarioId) {
    const membresia = db.get(`
      SELECT * FROM membresias WHERE usuario_id = ?
    `, [usuarioId]);

    if (membresia) {
      return membresia;
    }

    db.run(`
      INSERT INTO membresias (usuario_id, nivel, activo)
      VALUES (?, 'GRATIS', 1)
    `, [usuarioId]);

    return db.get(`
      SELECT * FROM membresias WHERE usuario_id = ?
    `, [usuarioId]);
  }

  // --------------------------------------------------
  // REGISTRAR USUARIO CON MEMBRESIA
  // --------------------------------------------------

  async registrarUsuario(email, password, nombre, codigoInvitacion = null) {
    if (codigoInvitacion) {
      const codigoDisponible = await this._cargarCodigoInvitacionDisponible(codigoInvitacion);
      if (!codigoDisponible) {
        throw new Error('Codigo de invitacion no disponible o expirado');
      }
    }

    const auth = require('../auth');
    const usuario = auth.register(email, password, nombre);

    db.run(`
      INSERT INTO membresias (usuario_id, nivel, codigo_invitacion, referido_por)
      VALUES (?, 'GRATIS', ?, ?)
    `, [usuario.id, codigoInvitacion, codigoInvitacion ? this._obtenerCreadorCodigo(codigoInvitacion) : null]);

    if (codigoInvitacion) {
      this._incrementarUsoCodigo(codigoInvitacion);
    }

    return {
      ...usuario,
      membresia: 'GRATIS'
    };
  }

  // --------------------------------------------------
  // REVISAR CODIGO DE INVITACION
  // --------------------------------------------------

  async _cargarCodigoInvitacionDisponible(codigo) {
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

  // --------------------------------------------------
  // GENERAR CODIGO DE INVITACION
  // --------------------------------------------------

  generarCodigoInvitacion(creadoPor, tipo = 'NORMAL', usosMaximos = 1) {
    const codigo = 'INV-' + Math.random().toString(36).substring(2, 10).toUpperCase();

    db.run(`
      INSERT INTO codigos_invitacion (codigo, tipo, usos_maximos, creado_por)
      VALUES (?, ?, ?, ?)
    `, [codigo, tipo, usosMaximos, creadoPor]);

    return codigo;
  }

  // --------------------------------------------------
  // ACTUALIZAR NIVEL DE MEMBRESIA
  // --------------------------------------------------

  actualizarNivel(usuarioId, nuevoNivel, fechaVencimiento = null) {
    if (!NIVELES[nuevoNivel]) {
      throw new Error('Nivel de membresia fuera de catalogo');
    }

    this._asegurarMembresiaBase(usuarioId);

    db.run(`
      UPDATE membresias
      SET nivel = ?, fecha_vencimiento = ?, updated_at = datetime('now')
      WHERE usuario_id = ?
    `, [nuevoNivel, fechaVencimiento, usuarioId]);

    return { nivel: nuevoNivel, vencimiento: fechaVencimiento };
  }

  // --------------------------------------------------
  // VERIFICAR LIMITES DE USO
  // --------------------------------------------------

  verificarLimite(usuarioId, tipo) {
    const membresia = this._asegurarMembresiaBase(usuarioId);

    if (!membresia || !membresia.activo) {
      throw new Error('Membresia no encontrada');
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

  // --------------------------------------------------
  // REGISTRAR USO
  // --------------------------------------------------

  registrarUso(usuarioId, tipo) {
    this._asegurarMembresiaBase(usuarioId);

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

  // --------------------------------------------------
  // OBTENER MEMBRESIA DE USUARIO
  // --------------------------------------------------

  obtenerMembresia(usuarioId) {
    this._asegurarMembresiaBase(usuarioId);

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

  // --------------------------------------------------
  // LISTAR MIEMBROS DE LA COMUNIDAD
  // --------------------------------------------------

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

  // --------------------------------------------------
  // REGISTRAR PAGO DE MEMBRESIA
  // --------------------------------------------------

  registrarPago(usuarioId, monto, nivel, periodo, estado = 'pendiente') {
    const fechaPago = estado === 'pagado' ? new Date().toISOString() : null;
    db.run(`
      INSERT INTO pagos_membresia (usuario_id, monto, nivel, periodo, estado, fecha_pago)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [usuarioId, monto, nivel, periodo, estado, fechaPago]);

    const pagoId = db.get(`
      SELECT id
      FROM pagos_membresia
      WHERE usuario_id = ?
      ORDER BY id DESC
      LIMIT 1
    `, [usuarioId])?.id || null;

    if (estado === 'pagado') {
      const fechaVencimiento = this._calcularVencimiento(periodo);
      this.actualizarNivel(usuarioId, nivel, fechaVencimiento);
    }

    return { ok: true, id: pagoId, estado, fecha_pago: fechaPago };
  }

  actualizarEstadoPago(pagoId, estado) {
    const pago = db.get('SELECT * FROM pagos_membresia WHERE id = ?', [pagoId]);

    if (!pago) {
      throw new Error('Pago no encontrado');
    }

    const fechaPago = estado === 'pagado' ? (pago.fecha_pago || new Date().toISOString()) : pago.fecha_pago;

    db.run(`
      UPDATE pagos_membresia
      SET estado = ?, fecha_pago = ?
      WHERE id = ?
    `, [estado, fechaPago, pagoId]);

    if (estado === 'pagado' && pago.estado !== 'pagado') {
      const fechaVencimiento = this._calcularVencimiento(pago.periodo);
      this.actualizarNivel(pago.usuario_id, pago.nivel, fechaVencimiento);
    }

    return { ok: true, id: pagoId, estado, fecha_pago: fechaPago };
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

  // --------------------------------------------------
  // OBTENER ESTADISTICAS DE MEMBRESIAS
  // --------------------------------------------------

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

// --------------------------------------------------
// EXPORTAR INSTANCIA UNICA
// --------------------------------------------------

const membresiasService = new MembresiasService();

module.exports = membresiasService;
