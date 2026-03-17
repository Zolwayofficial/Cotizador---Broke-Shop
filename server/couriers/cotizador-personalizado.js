// server/couriers/cotizador-personalizado.js
// 
// SISTEMA DE COTIZACIÓN PERSONALIZADA
// 
// Features:
// - Email automático a couriers
// - Teléfono / WhatsApp
// - Formulario web para couriers
// - Tarifas negociadas (contratos)
// - Fallback referencial

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const DB_PATH = path.join(process.env.DATA_DIR || './data', 'cotizaciones-personalizadas.json');
const CONTACTOS_PATH = path.join(process.env.DATA_DIR || './data', 'contactos-couriers.json');

// ═══════════════════════════════════════════════════
// CONFIGURACIÓN DE CONTACTOS DE COURIERS
// ═══════════════════════════════════════════════════

const CONTACTOS_DEFAULT = {
  'dhl': {
    nombre: 'DHL Express Perú',
    email: 'ventas@dhl.com.pe',
    telefono: '+51 1 516 2000',
    whatsapp: '+51 9 516 2000',
    pagina: 'https://www.dhl.com/pe-es/home.html',
    contacto: 'Ventas Corporativas',
    horario: 'Lun-Vie 8:00-18:00',
    activo: true
  },
  'fedex': {
    nombre: 'FedEx Perú',
    email: 'ventas@fedex.com.pe',
    telefono: '+51 1 716 2000',
    whatsapp: '+51 9 716 2000',
    pagina: 'https://www.fedex.com/es-pe/home.html',
    contacto: 'Ventas',
    horario: 'Lun-Vie 9:00-18:00',
    activo: true
  },
  'ups': {
    nombre: 'UPS Perú',
    email: 'ventas@ups.com.pe',
    telefono: '+51 1 213 2000',
    whatsapp: '+51 9 213 2000',
    pagina: 'https://www.ups.com/pe/es/Home.page',
    contacto: 'Ventas Corporativas',
    horario: 'Lun-Vie 8:30-17:30',
    activo: true
  },
  'tnt': {
    nombre: 'TNT Express',
    email: 'ventas@tnt.com.pe',
    telefono: '+51 1 415 2000',
    whatsapp: '+51 9 415 2000',
    pagina: 'https://www.tnt.com/express/pe_es/site/home.html',
    contacto: 'Ventas',
    horario: 'Lun-Vie 9:00-18:00',
    activo: true
  },
  'maersk': {
    nombre: 'Maersk Perú',
    email: 'peru.sales@maersk.com',
    telefono: '+51 1 640 2000',
    whatsapp: '+51 9 640 2000',
    pagina: 'https://www.maersk.com/local-information/peru',
    contacto: 'Ventas Marítimas',
    horario: 'Lun-Vie 8:00-17:00',
    activo: true
  },
  'msc': {
    nombre: 'MSC Perú',
    email: 'peru@msc.com',
    telefono: '+51 1 203 2000',
    whatsapp: '+51 9 203 2000',
    pagina: 'https://www.msc.com/peru',
    contacto: 'Ventas',
    horario: 'Lun-Vie 8:30-17:30',
    activo: true
  }
};

// ═══════════════════════════════════════════════════
// CLASE DE COTIZACIÓN PERSONALIZADA
// ═══════════════════════════════════════════════════

class CotizadorPersonalizado {
  constructor() {
    this.contactos = this._cargarContactos();
    this.cotizaciones = this._cargarCotizaciones();
    this.transporter = this._configurarEmail();
  }

  // ═══════════════════════════════════════════════════
  // CARGAR CONTACTOS
  // ═══════════════════════════════════════════════════

  _cargarContactos() {
    try {
      if (fs.existsSync(CONTACTOS_PATH)) {
        const data = fs.readFileSync(CONTACTOS_PATH, 'utf8');
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('[COTIZADOR] Error cargando contactos:', e.message);
    }
    
    // Guardar contactos default
    const contactos = { ...CONTACTOS_DEFAULT };
    this._guardarContactos(contactos);
    return contactos;
  }

  _guardarContactos(contactos = this.contactos) {
    try {
      if (!contactos) return;
      fs.mkdirSync(path.dirname(CONTACTOS_PATH), { recursive: true });
      fs.writeFileSync(CONTACTOS_PATH, JSON.stringify(contactos, null, 2));
    } catch (e) {
      console.error('[COTIZADOR] Error guardando contactos:', e.message);
    }
  }

  // ═══════════════════════════════════════════════════
  // CARGAR COTIZACIONES
  // ═══════════════════════════════════════════════════

  _cargarCotizaciones() {
    try {
      if (fs.existsSync(DB_PATH)) {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('[COTIZADOR] Error cargando cotizaciones:', e.message);
    }
    
    return [];
  }

  _guardarCotizaciones() {
    try {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
      fs.writeFileSync(DB_PATH, JSON.stringify(this.cotizaciones, null, 2));
    } catch (e) {
      console.error('[COTIZADOR] Error guardando cotizaciones:', e.message);
    }
  }

  // ═══════════════════════════════════════════════════
  // CONFIGURAR EMAIL
  // ═══════════════════════════════════════════════════

  _configurarEmail() {
    if (!process.env.EMAIL_SMTP_HOST) {
      console.warn('[COTIZADOR] Email no configurado, usando fallback');
      return null;
    }
    
    return nodemailer.createTransport({
      host: process.env.EMAIL_SMTP_HOST,
      port: process.env.EMAIL_SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }

  // ═══════════════════════════════════════════════════
  // MÉTODOS PÚBLICOS
  // ═══════════════════════════════════════════════════

  // 1. COTIZAR POR EMAIL AUTOMÁTICO
  async cotizarPorEmail(courierSlug, datos) {
    const contacto = this.contactos[courierSlug];
    
    if (!contacto || !contacto.activo) {
      throw new Error(`Courier ${courierSlug} no encontrado o inactivo`);
    }

    if (!this.transporter) {
      throw new Error('Email no configurado en .env');
    }

    // Crear ID de cotización
    const cotizacionId = `COT-${Date.now()}-${courierSlug.toUpperCase()}`;
    
    // Generar email
    const emailHtml = this._generarEmailHTML(cotizacionId, datos, contacto);
    
    // Enviar email
    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || 'cotizador@empresa.com',
        to: contacto.email,
        cc: process.env.EMAIL_CC || null,
        subject: `Solicitud de Cotización - ${cotizacionId}`,
        html: emailHtml
      });

      // Guardar cotización
      this.cotizaciones.push({
        id: cotizacionId,
        courier: courierSlug,
        contacto: contacto.nombre,
        email: contacto.email,
        datos: datos,
        estado: 'enviado',
        fecha: new Date().toISOString(),
        respuesta: null
      });

      this._guardarCotizaciones();

      console.log(`[COTIZADOR] ✅ Email enviado a ${contacto.nombre} (${cotizacionId})`);

      return {
        ok: true,
        cotizacionId: cotizacionId,
        mensaje: `Solicitud enviada a ${contacto.nombre}`,
        contacto: contacto,
        estado: 'enviado'
      };
    } catch (e) {
      console.error('[COTIZADOR] Error enviando email:', e.message);
      
      // Guardar como fallido
      this.cotizaciones.push({
        id: cotizacionId,
        courier: courierSlug,
        contacto: contacto.nombre,
        email: contacto.email,
        datos: datos,
        estado: 'fallido',
        fecha: new Date().toISOString(),
        error: e.message
      });

      this._guardarCotizaciones();

      throw new Error(`Error enviando email: ${e.message}`);
    }
  }

  // 2. COTIZAR POR TELÉFONO / WHATSAPP
  cotizarPorTelefono(courierSlug, datos) {
    const contacto = this.contactos[courierSlug];
    
    if (!contacto || !contacto.activo) {
      throw new Error(`Courier ${courierSlug} no encontrado o inactivo`);
    }

    // Crear ID de cotización
    const cotizacionId = `TEL-${Date.now()}-${courierSlug.toUpperCase()}`;
    
    // Generar script de llamada
    const script = this._generarScriptLlamada(datos, contacto);
    
    // Guardar cotización
    this.cotizaciones.push({
      id: cotizacionId,
      courier: courierSlug,
      contacto: contacto.nombre,
      telefono: contacto.telefono,
      whatsapp: contacto.whatsapp,
      datos: datos,
      estado: 'pendiente_llamada',
      fecha: new Date().toISOString(),
      script: script,
      respuesta: null
    });

    this._guardarCotizaciones();

    console.log(`[COTIZADOR] ✅ Teléfono generado para ${contacto.nombre} (${cotizacionId})`);

    return {
      ok: true,
      cotizacionId: cotizacionId,
      mensaje: `Script generado para llamar a ${contacto.nombre}`,
      contacto: contacto,
      telefono: contacto.telefono,
      whatsapp: contacto.whatsapp,
      script: script,
      estado: 'pendiente_llamada'
    };
  }

  // 3. COTIZAR POR WHATSAPP DIRECTO
  cotizarPorWhatsApp(courierSlug, datos) {
    const contacto = this.contactos[courierSlug];
    
    if (!contacto || !contacto.activo) {
      throw new Error(`Courier ${courierSlug} no encontrado o inactivo`);
    }

    // Crear ID de cotización
    const cotizacionId = `WA-${Date.now()}-${courierSlug.toUpperCase()}`;
    
    // Generar mensaje de WhatsApp
    const mensaje = this._generarMensajeWhatsApp(datos);
    
    // URL de WhatsApp
    const whatsappUrl = `https://wa.me/${contacto.whatsapp.replace(/\+/g, '')}?text=${encodeURIComponent(mensaje)}`;
    
    // Guardar cotización
    this.cotizaciones.push({
      id: cotizacionId,
      courier: courierSlug,
      contacto: contacto.nombre,
      whatsapp: contacto.whatsapp,
      datos: datos,
      estado: 'pendiente_whatsapp',
      fecha: new Date().toISOString(),
      mensaje: mensaje,
      whatsappUrl: whatsappUrl,
      respuesta: null
    });

    this._guardarCotizaciones();

    console.log(`[COTIZADOR] ✅ WhatsApp generado para ${contacto.nombre} (${cotizacionId})`);

    return {
      ok: true,
      cotizacionId: cotizacionId,
      mensaje: `Mensaje generado para WhatsApp de ${contacto.nombre}`,
      contacto: contacto,
      whatsapp: contacto.whatsapp,
      whatsappUrl: whatsappUrl,
      estado: 'pendiente_whatsapp'
    };
  }

  // 4. OBTENER TARIFAS NEGOCIADAS (CONTRATOS)
  obtenerTarifasNegociadas(courierSlug, datos) {
    // Aquí irían las tarifas negociadas por contrato
    // Por ahora usamos tarifas de ejemplo
    
    const tarifasEjemplo = {
      'dhl': { base: 15, porKg: 5.5, descuento: 0.10 },
      'fedex': { base: 14, porKg: 5, descuento: 0.08 },
      'ups': { base: 14.5, porKg: 5.2, descuento: 0.09 },
      'maersk': { '20ft': 1150, '40ft': 2100, '40ftHC': 2400, descuento: 0.05 },
      'msc': { '20ft': 1100, '40ft': 2000, '40ftHC': 2300, descuento: 0.05 }
    };

    const tarifas = tarifasEjemplo[courierSlug];
    
    if (!tarifas) {
      throw new Error(`Tarifas no encontradas para ${courierSlug}`);
    }

    // Calcular precio
    let precio;
    let servicio;
    
    if (datos.peso > 1000 || datos.tipo === 'maritimo') {
      // Flete marítimo
      const cbm = this._calcularCBM(datos.dimensiones);
      const tipoContenedor = cbm >= 68 ? '40ftHC' : cbm >= 33 ? '40ft' : '20ft';
      precio = tarifas[tipoContenedor] * (1 - tarifas.descuento);
      servicio = `FCL ${tipoContenedor}`;
    } else {
      // Courier aéreo
      precio = (tarifas.base + (datos.peso * tarifas.porKg)) * (1 - tarifas.descuento);
      servicio = 'Express';
    }

    return {
      ok: true,
      courier: courierSlug,
      servicio: servicio,
      precio: parseFloat(precio.toFixed(2)),
      moneda: 'USD',
      tiempoEntrega: courierSlug === 'maersk' || courierSlug === 'msc' ? '28-35 días' : '3-5 días',
      tipo: 'negociado',
      descuento: tarifas.descuento * 100,
      origen: datos.origen,
      destino: datos.destino,
      peso: datos.peso,
      dimensiones: datos.dimensiones,
      validoHasta: '30 días',
      metadata: {
        negociado: true,
        contrato: true
      }
    };
  }

  // 5. COTIZAR CON FALLBACK REFERENCIAL
  cotizarFallback(datos) {
    const baseRate = 12;
    const perKg = 4.5;
    const price = baseRate + (datos.peso * perKg);
    
    return {
      courier: 'Referencial (Fallback)',
      servicio: 'Estimado',
      empresa_real: 'Referencial',
      precio: parseFloat(price.toFixed(2)),
      moneda: 'USD',
      tiempoEntrega: '5-10 días',
      tipo: 'fallback',
      origen: datos.origen,
      destino: datos.destino,
      peso: datos.peso,
      dimensiones: datos.dimensiones,
      validoHasta: '30 días',
      metadata: {
        fallback: true,
        nota: 'Tarifa referencial cuando no hay APIs ni contratos disponibles'
      }
    };
  }

  // ═══════════════════════════════════════════════════
  // MÉTODOS AUXILIARES
  // ═══════════════════════════════════════════════════

  _generarEmailHTML(cotizacionId, datos, _contacto) {
    return `
      <html>
        <body style="font-family: Arial, sans-serif;">
          <h2>Solicitud de Cotización</h2>
          <p><strong>ID Cotización:</strong> ${cotizacionId}</p>
          <p><strong>Fecha:</strong> ${new Date().toLocaleDateString('es-PE')}</p>
          
          <h3>Detalles del Envío:</h3>
          <ul>
            <li><strong>Origen:</strong> ${datos.origen}</li>
            <li><strong>Destino:</strong> ${datos.destino}</li>
            <li><strong>Peso:</strong> ${datos.peso} kg</li>
            <li><strong>Dimensiones:</strong> ${datos.dimensiones?.largo || 50} x ${datos.dimensiones?.ancho || 50} x ${datos.dimensiones?.alto || 50} cm</li>
            <li><strong>Valor declarado:</strong> $${datos.valor || 100} USD</li>
            <li><strong>Tipo de envío:</strong> ${datos.tipo || 'aéreo'}</li>
          </ul>
          
          <h3>Información Adicional:</h3>
          <p>${datos.notas || 'Sin notas adicionales'}</p>
          
          <p>Por favor enviar cotización a la brevedad.</p>
          
          <hr>
          <p style="font-size: 12px; color: #666;">
            Este email fue generado automáticamente por el Sistema de Cotización.
          </p>
        </body>
      </html>
    `;
  }

  _generarScriptLlamada(datos, contacto) {
    return `
GUIÓN DE LLAMADA - ${contacto.nombre}
=====================================

DATOS DEL ENVÍO:
- Origen: ${datos.origen}
- Destino: ${datos.destino}
- Peso: ${datos.peso} kg
- Dimensiones: ${datos.dimensiones?.largo || 50} x ${datos.dimensiones?.ancho || 50} x ${datos.dimensiones?.alto || 50} cm
- Valor: $${datos.valor || 100} USD

PREGUNTAS A REALIZAR:
1. ¿Cuál es el costo del envío?
2. ¿Cuál es el tiempo de entrega estimado?
3. ¿Hay descuentos por volumen?
4. ¿Qué documentación se requiere?
5. ¿Hay restricciones para este tipo de carga?

DATOS DE CONTACTO:
- Teléfono: ${contacto.telefono}
- WhatsApp: ${contacto.whatsapp}
- Horario: ${contacto.horario}

NOTAS:
_________________________________
_________________________________
    `.trim();
  }

  _generarMensajeWhatsApp(datos) {
    return `
Hola, solicito cotización de envío:

📦 Origen: ${datos.origen}
📍 Destino: ${datos.destino}
⚖️ Peso: ${datos.peso} kg
📏 Dimensiones: ${datos.dimensiones?.largo || 50}x${datos.dimensiones?.ancho || 50}x${datos.dimensiones?.alto || 50} cm
💰 Valor: $${datos.valor || 100} USD

Gracias por su respuesta.
    `.trim();
  }

  _calcularCBM(dimensiones) {
    if (!dimensiones) return 1;
    const largo = (dimensiones.largo || 50) / 100;
    const ancho = (dimensiones.ancho || 50) / 100;
    const alto = (dimensiones.alto || 50) / 100;
    return largo * ancho * alto;
  }

  // ═══════════════════════════════════════════════════
  // MÉTODOS DE GESTIÓN
  // ═══════════════════════════════════════════════════

  // Obtener todas las cotizaciones
  obtenerCotizaciones(filtros = {}) {
    let cotizaciones = this.cotizaciones;
    
    if (filtros.courier) {
      cotizaciones = cotizaciones.filter(c => c.courier === filtros.courier);
    }
    
    if (filtros.estado) {
      cotizaciones = cotizaciones.filter(c => c.estado === filtros.estado);
    }
    
    return cotizaciones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }

  // Obtener cotización por ID
  obtenerCotizacion(id) {
    return this.cotizaciones.find(c => c.id === id);
  }

  // Actualizar cotización (cuando llega respuesta)
  actualizarCotizacion(id, respuesta) {
    const cotizacion = this.obtenerCotizacion(id);
    
    if (!cotizacion) {
      throw new Error(`Cotización ${id} no encontrada`);
    }
    
    cotizacion.respuesta = respuesta;
    cotizacion.estado = 'respondido';
    cotizacion.fechaRespuesta = new Date().toISOString();
    
    this._guardarCotizaciones();
    
    return cotizacion;
  }

  // Agregar contacto de courier
  agregarContacto(slug, datos) {
    this.contactos[slug] = {
      ...datos,
      activo: true
    };
    
    this._guardarContactos();
    
    return this.contactos[slug];
  }

  // Obtener todos los contactos
  obtenerContactos() {
    return this.contactos;
  }

  // Obtener estadísticas
  obtenerEstadisticas() {
    const total = this.cotizaciones.length;
    const enviados = this.cotizaciones.filter(c => c.estado === 'enviado').length;
    const respondidos = this.cotizaciones.filter(c => c.estado === 'respondido').length;
    const pendientes = this.cotizaciones.filter(c => c.estado.includes('pendiente')).length;
    const fallidos = this.cotizaciones.filter(c => c.estado === 'fallido').length;
    
    return {
      total,
      enviados,
      respondidos,
      pendientes,
      fallidos,
      tasaRespuesta: total > 0 ? ((respondidos / total) * 100).toFixed(2) : 0
    };
  }
}

// ═══════════════════════════════════════════════════
// EXPORTAR INSTANCIA ÚNICA
// ═══════════════════════════════════════════════════

const cotizadorPersonalizado = new CotizadorPersonalizado();

module.exports = cotizadorPersonalizado;
