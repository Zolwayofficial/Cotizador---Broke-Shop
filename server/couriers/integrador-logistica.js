// server/couriers/integrador-logistica.js
// 
// INTEGRADOR DE LOGÍSTICA - Couriers y Navieras
// 
// Features:
// - APIs gratuitas (Shippo, EasyPost, AfterShip)
// - Couriers personalizados (contratos directos)
// - Navieras personalizadas (Maersk, MSC, etc.)
// - Especifica qué empresa cotizó
// - 100% gratuito

const https = require('https');
const contingencia = require('./contingencia-api');

// ═══════════════════════════════════════════════════
// CLASE BASE PARA TODOS LOS COURIERS
// ═══════════════════════════════════════════════════

class CourierBase {
  constructor(nombre, tipo = 'courier') {
    this.nombre = nombre;
    this.tipo = tipo; // 'courier' o 'naviera'
    this.activo = true;
  }

  async cotizar(datos) {
    throw new Error('Método cotizar() debe ser implementado');
  }

  getNombre() {
    return this.nombre;
  }

  getTipo() {
    return this.tipo;
  }
}

// ═══════════════════════════════════════════════════
// SHIPPO API (GRATIS - 5,000 envíos/año)
// ═══════════════════════════════════════════════════

class ShippoCourier extends CourierBase {
  constructor(apiToken) {
    super('Shippo (Multi-Courier)', 'courier');
    this.apiToken = apiToken;
    this.baseUrl = 'https://api.goshippo.com';
  }

  async cotizar(datos) {
    try {
      // 1. Crear shipment
      const shipment = await this._crearShipment(datos);

      // 2. Obtener rates
      const rates = await this._obtenerRates(shipment);

      // 3. Formatear resultados
      return rates.map(rate => ({
        courier: 'Shippo',
        servicio: rate.servicelevel.name,
        empresa_real: rate.provider, // DHL, FedEx, UPS, etc.
        precio: parseFloat(rate.amount),
        moneda: rate.currency,
        tiempoEntrega: rate.estimated_days || 'N/A',
        tipo: this.tipo,
        origen: datos.origen,
        destino: datos.destino,
        peso: datos.peso,
        dimensiones: datos.dimensiones,
        validoHasta: rate.validity_days ? `${rate.validity_days} días` : 'N/A',
        metadata: {
          rate_id: rate.object_id,
          carrier_account: rate.carrier_account
        }
      }));
    } catch (e) {
      console.error(`[Shippo] Error: ${e.message}`);
      return [];
    }
  }

  async _crearShipment(datos) {
    const data = {
      address_from: {
        country: datos.origen,
        zip: datos.cp_origen || '10001',
        city: datos.ciudad_origen || 'New York',
        street1: datos.direccion_origen || '123 Main St'
      },
      address_to: {
        country: datos.destino,
        zip: datos.cp_destino || '15001',
        city: datos.ciudad_destino || 'Lima',
        street1: datos.direccion_destino || 'Av. Javier Prado 1234'
      },
      parcels: [{
        length: datos.dimensiones?.largo || 50,
        width: datos.dimensiones?.ancho || 50,
        height: datos.dimensiones?.alto || 50,
        distance_unit: 'cm',
        weight: datos.peso,
        mass_unit: 'kg'
      }]
    };

    return await this._httpsPost(`${this.baseUrl}/shipments/`, data);
  }

  async _obtenerRates(shipment) {
    // Shippo devuelve rates directamente en el shipment
    return shipment.rates || [];
  }

  _httpsPost(url, data) {
    return new Promise((resolve, reject) => {
      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Shippo ${this.apiToken}`
        }
      }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Invalid response'));
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify(data));
      req.end();
    });
  }
}

// ═══════════════════════════════════════════════════
// EASYPOST API (GRATIS - 120,000 envíos/año)
// ═══════════════════════════════════════════════════

class EasyPostCourier extends CourierBase {
  constructor(apiToken) {
    super('EasyPost (Multi-Courier)', 'courier');
    this.apiToken = apiToken;
    this.baseUrl = 'https://api.easypost.com/api/v2';
  }

  async cotizar(datos) {
    try {
      const shipment = await this._crearShipment(datos);
      const rates = shipment.rates || [];

      return rates.map(rate => ({
        courier: 'EasyPost',
        servicio: rate.service,
        empresa_real: rate.carrier, // DHL, FedEx, UPS, etc.
        precio: parseFloat(rate.rate),
        moneda: 'USD',
        tiempoEntrega: rate.delivery_days || 'N/A',
        tipo: this.tipo,
        origen: datos.origen,
        destino: datos.destino,
        peso: datos.peso,
        dimensiones: datos.dimensiones,
        validoHasta: rate.use_by || 'N/A',
        metadata: {
          rate_id: rate.id,
          carrier_detail: rate.carrier_detail
        }
      }));
    } catch (e) {
      console.error(`[EasyPost] Error: ${e.message}`);
      return [];
    }
  }

  async _crearShipment(datos) {
    const data = {
      shipment: {
        from_address: {
          country: datos.origen,
          zip: datos.cp_origen || '10001',
          city: datos.ciudad_origen || 'New York',
          street1: datos.direccion_origen || '123 Main St'
        },
        to_address: {
          country: datos.destino,
          zip: datos.cp_destino || '15001',
          city: datos.ciudad_destino || 'Lima',
          street1: datos.direccion_destino || 'Av. Javier Prado 1234'
        },
        parcel: {
          length: datos.dimensiones?.largo || 50,
          width: datos.dimensiones?.ancho || 50,
          height: datos.dimensiones?.alto || 50,
          weight: datos.peso
        }
      }
    };

    return await this._httpsPost(`${this.baseUrl}/shipments`, data);
  }

  _httpsPost(url, data) {
    return new Promise((resolve, reject) => {
      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiToken}`
        }
      }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Invalid response'));
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify(data));
      req.end();
    });
  }
}

// ═══════════════════════════════════════════════════
// COURIER PERSONALIZADO (Contrato directo)
// ═══════════════════════════════════════════════════

class CourierPersonalizado extends CourierBase {
  constructor(config) {
    super(config.nombre, config.tipo || 'courier');
    this.config = config;
    // Tarifas personalizadas (las que negociaste con el courier)
    this.tarifas = config.tarifas || {
      base: 10,      // $10 base
      porKg: 5,      // $5 por kg
      minimo: 25     // $25 mínimo
    };
  }

  async cotizar(datos) {
    // Calcular precio según tarifas personalizadas
    const precioBase = this.tarifas.base;
    const precioPeso = datos.peso * this.tarifas.porKg;
    const precioTotal = Math.max(precioBase + precioPeso, this.tarifas.minimo);

    // Aplicar descuentos por volumen (opcional)
    const descuento = this._calcularDescuento(datos.valor);
    const precioFinal = precioTotal * (1 - descuento);

    return [{
      courier: this.nombre,
      servicio: this.config.servicio || 'Estándar',
      empresa_real: this.nombre,
      precio: parseFloat(precioFinal.toFixed(2)),
      moneda: 'USD',
      tiempoEntrega: this.config.tiempoEntrega || '5-8 días',
      tipo: this.tipo,
      origen: datos.origen,
      destino: datos.destino,
      peso: datos.peso,
      dimensiones: datos.dimensiones,
      validoHasta: '30 días',
      metadata: {
        personalizado: true,
        tarifas: this.tarifas,
        descuento_aplicado: descuento * 100
      }
    }];
  }

  _calcularDescuento(valor) {
    // Descuentos por volumen de envío
    if (valor > 50000) return 0.20; // 20% descuento
    if (valor > 20000) return 0.15; // 15% descuento
    if (valor > 10000) return 0.10; // 10% descuento
    if (valor > 5000) return 0.05;  // 5% descuento
    return 0;
  }
}

// ═══════════════════════════════════════════════════
// AFTER SHIP API (GRATIS - 100/mes - 700+ couriers)
// ═══════════════════════════════════════════════════

class AfterShipCourier extends CourierBase {
  constructor(apiKey) {
    super('AfterShip (700+ Couriers)', 'courier');
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.aftership.com/v4';
  }

  async cotizar(datos) {
    try {
      // AfterShip requiere tracking number, pero podemos usar su API de rates
      // Nota: AfterShip principalmente es para tracking, no para rates
      // Usamos su endpoint de couriers disponibles
      const couriers = await this._obtenerCouriersDisponibles();

      return couriers.map(courier => ({
        courier: 'AfterShip',
        servicio: courier.name,
        empresa_real: courier.slug,
        precio: 0, // AfterShip no provee rates directos
        moneda: 'USD',
        tiempoEntrega: 'N/A',
        tipo: this.tipo,
        origen: datos.origen,
        destino: datos.destino,
        peso: datos.peso,
        dimensiones: datos.dimensiones,
        validoHasta: 'N/A',
        metadata: {
          disponible: true,
          slug: courier.slug,
          nota: 'AfterShip es principalmente para tracking'
        }
      }));
    } catch (e) {
      console.error(`[AfterShip] Error: ${e.message}`);
      return [];
    }
  }

  async _obtenerCouriersDisponibles() {
    // Simular lista de couriers (en producción usar API real)
    return [
      { name: 'DHL', slug: 'dhl' },
      { name: 'FedEx', slug: 'fedex' },
      { name: 'UPS', slug: 'ups' },
      { name: 'USPS', slug: 'usps' },
      { name: 'TNT', slug: 'tnt' }
    ];
  }
}

// ═══════════════════════════════════════════════════
// PACK & SEND API (GRATIS - Ilimitado - 15+ couriers)
// ═══════════════════════════════════════════════════

class PackSendCourier extends CourierBase {
  constructor(apiKey) {
    super('Pack & Send (15+ Couriers)', 'courier');
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.packsend.com.au/v1';
  }

  async cotizar(datos) {
    try {
      const data = {
        pickup_postcode: datos.cp_origen || '10001',
        delivery_postcode: datos.cp_destino || '15001',
        weight: datos.peso,
        length: datos.dimensiones?.largo || 50,
        width: datos.dimensiones?.ancho || 50,
        height: datos.dimensiones?.alto || 50
      };

      const response = await this._httpsPost(`${this.baseUrl}/quotes`, data);

      return response.quotes.map(quote => ({
        courier: 'Pack & Send',
        servicio: quote.service_name,
        empresa_real: quote.carrier,
        precio: parseFloat(quote.price),
        moneda: quote.currency || 'USD',
        tiempoEntrega: quote.delivery_days || 'N/A',
        tipo: this.tipo,
        origen: datos.origen,
        destino: datos.destino,
        peso: datos.peso,
        dimensiones: datos.dimensiones,
        validoHasta: quote.valid_until || '7 días',
        metadata: {
          quote_id: quote.id,
          carrier: quote.carrier
        }
      }));
    } catch (e) {
      console.error(`[Pack & Send] Error: ${e.message}`);
      return [];
    }
  }

  _httpsPost(url, data) {
    return new Promise((resolve, reject) => {
      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        }
      }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Invalid response'));
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify(data));
      req.end();
    });
  }
}

// ═══════════════════════════════════════════════════
// INTERPARCEL API (GRATIS - Ilimitado - 25+ couriers)
// ═══════════════════════════════════════════════════

class InterparcelCourier extends CourierBase {
  constructor(apiKey) {
    super('Interparcel (25+ Couriers)', 'courier');
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.interparcel.com/v2';
  }

  async cotizar(datos) {
    try {
      const data = {
        collectionPostcode: datos.cp_origen || '10001',
        deliveryPostcode: datos.cp_destino || '15001',
        collectionCountry: datos.origen,
        deliveryCountry: datos.destino,
        parcels: [{
          weight: datos.peso,
          length: datos.dimensiones?.largo || 50,
          width: datos.dimensiones?.ancho || 50,
          height: datos.dimensiones?.alto || 50,
          value: datos.valor || 100
        }]
      };

      const response = await this._httpsPost(`${this.baseUrl}/quotes`, data);

      return response.parcelQuotes.map(quote => ({
        courier: 'Interparcel',
        servicio: quote.serviceName,
        empresa_real: quote.courierName,
        precio: parseFloat(quote.price),
        moneda: 'USD',
        tiempoEntrega: quote.deliveryDays || 'N/A',
        tipo: this.tipo,
        origen: datos.origen,
        destino: datos.destino,
        peso: datos.peso,
        dimensiones: datos.dimensiones,
        validoHasta: quote.expiryDate || '7 días',
        metadata: {
          quote_id: quote.id,
          courier: quote.courierName,
          service: quote.serviceName
        }
      }));
    } catch (e) {
      console.error(`[Interparcel] Error: ${e.message}`);
      return [];
    }
  }

  _httpsPost(url, data) {
    return new Promise((resolve, reject) => {
      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        }
      }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Invalid response'));
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify(data));
      req.end();
    });
  }
}

// ═══════════════════════════════════════════════════
// PARCEL MONKEY API (GRATIS - Ilimitado)
// ═══════════════════════════════════════════════════

class ParcelMonkeyCourier extends CourierBase {
  constructor(apiKey) {
    super('Parcel Monkey (Unlimited)', 'courier');
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.parcelmonkey.com/v1';
  }

  async cotizar(datos) {
    try {
      // Parcel Monkey requiere registro para API
      // Usamos tarifas referenciales mejoradas
      return this._cotizarReferencial(datos);
    } catch (e) {
      console.error(`[Parcel Monkey] Error: ${e.message}`);
      return [];
    }
  }

  _cotizarReferencial(datos) {
    // Tarifas referenciales mejoradas
    const baseRate = 12;
    const perKg = 4.5;
    const price = baseRate + (datos.peso * perKg);

    return [{
      courier: 'Parcel Monkey',
      servicio: 'Economy',
      empresa_real: 'Parcel Monkey',
      precio: parseFloat(price.toFixed(2)),
      moneda: 'USD',
      tiempoEntrega: '5-10 días',
      tipo: this.tipo,
      origen: datos.origen,
      destino: datos.destino,
      peso: datos.peso,
      dimensiones: datos.dimensiones,
      validoHasta: '30 días',
      metadata: {
        referencial: true
      }
    }];
  }
}

// ═══════════════════════════════════════════════════
// NAVIERA API (Maersk Spot API)
// ═══════════════════════════════════════════════════

class MaerskNaviera extends CourierBase {
  constructor(apiKey) {
    super('Maersk Spot API', 'naviera');
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.maersk.com/spot';
  }

  async cotizar(datos) {
    try {
      // Maersk Spot API para booking instantáneo
      const data = {
        pickupLocation: { address: datos.origen },
        deliveryLocation: { address: datos.destino },
        cargo: {
          weight: datos.peso,
          volume: this._calcularCBM(datos.dimensiones)
        }
      };

      const response = await this._httpsPost(`${this.baseUrl}/bookings`, data);

      return response.rates.map(rate => ({
        courier: 'Maersk',
        servicio: rate.serviceName,
        empresa_real: 'Maersk',
        precio: parseFloat(rate.totalPrice),
        moneda: 'USD',
        tiempoEntrega: `${rate.transitTime} días`,
        tipo: this.tipo,
        origen: datos.origen,
        destino: datos.destino,
        peso: datos.peso,
        dimensiones: datos.dimensiones,
        cbm: this._calcularCBM(datos.dimensiones),
        validoHasta: rate.validUntil || '14 días',
        metadata: {
          booking_id: rate.id,
          service: rate.serviceName,
          transit_time: rate.transitTime
        }
      }));
    } catch (e) {
      console.error(`[Maersk] Error: ${e.message}`);
      // Fallback a tarifas manuales
      return this._cotizarManual(datos);
    }
  }

  _calcularCBM(dimensiones) {
    if (!dimensiones) return 1;
    const largo = (dimensiones.largo || 50) / 100;
    const ancho = (dimensiones.ancho || 50) / 100;
    const alto = (dimensiones.alto || 50) / 100;
    return largo * ancho * alto;
  }

  _cotizarManual(datos) {
    // Fallback a tarifas negociadas
    const cbm = this._calcularCBM(datos.dimensiones);
    const esFCL = cbm >= 15;

    let precio;
    if (esFCL) {
      precio = cbm >= 68 ? 2500 : cbm >= 33 ? 2200 : 1200;
    } else {
      precio = Math.max(cbm * 55, 55);
    }

    return [{
      courier: 'Maersk (Manual)',
      servicio: esFCL ? 'FCL' : 'LCL',
      empresa_real: 'Maersk',
      precio: parseFloat(precio.toFixed(2)),
      moneda: 'USD',
      tiempoEntrega: '28-35 días',
      tipo: this.tipo,
      origen: datos.origen,
      destino: datos.destino,
      peso: datos.peso,
      dimensiones: datos.dimensiones,
      cbm: cbm,
      tipoCarga: esFCL ? 'FCL' : 'LCL',
      validoHasta: '15 días',
      metadata: {
        manual: true,
        cbm: cbm
      }
    }];
  }

  _httpsPost(url, data) {
    return new Promise((resolve, reject) => {
      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        }
      }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Invalid response'));
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify(data));
      req.end();
    });
  }
}

// ═══════════════════════════════════════════════════
// MSC NAVIERA API
// ═══════════════════════════════════════════════════

class MSCNaviera extends CourierBase {
  constructor(apiKey) {
    super('MSC Spot API', 'naviera');
    this.apiKey = apiKey;
    this.baseUrl = 'https://spot.msc.com/api';
  }

  async cotizar(datos) {
    try {
      // MSC Spot API
      const data = {
        origin: datos.origen,
        destination: datos.destino,
        cargoWeight: datos.peso,
        cargoVolume: this._calcularCBM(datos.dimensiones)
      };

      const response = await this._httpsPost(`${this.baseUrl}/rates`, data);

      return response.rates.map(rate => ({
        courier: 'MSC',
        servicio: rate.serviceName,
        empresa_real: 'MSC',
        precio: parseFloat(rate.oceanFreight),
        moneda: 'USD',
        tiempoEntrega: `${rate.transitTime} días`,
        tipo: this.tipo,
        origen: datos.origen,
        destino: datos.destino,
        peso: datos.peso,
        dimensiones: datos.dimensiones,
        cbm: this._calcularCBM(datos.dimensiones),
        validoHasta: rate.validityDate || '14 días',
        metadata: {
          rate_id: rate.id,
          transit_time: rate.transitTime
        }
      }));
    } catch (e) {
      console.error(`[MSC] Error: ${e.message}`);
      // Fallback
      return this._cotizarManual(datos);
    }
  }

  _calcularCBM(dimensiones) {
    if (!dimensiones) return 1;
    const largo = (dimensiones.largo || 50) / 100;
    const ancho = (dimensiones.ancho || 50) / 100;
    const alto = (dimensiones.alto || 50) / 100;
    return largo * ancho * alto;
  }

  _cotizarManual(datos) {
    const cbm = this._calcularCBM(datos.dimensiones);
    const esFCL = cbm >= 15;

    let precio;
    if (esFCL) {
      precio = cbm >= 68 ? 2400 : cbm >= 33 ? 2100 : 1150;
    } else {
      precio = Math.max(cbm * 52, 52);
    }

    return [{
      courier: 'MSC (Manual)',
      servicio: esFCL ? 'FCL' : 'LCL',
      empresa_real: 'MSC',
      precio: parseFloat(precio.toFixed(2)),
      moneda: 'USD',
      tiempoEntrega: '30-38 días',
      tipo: this.tipo,
      origen: datos.origen,
      destino: datos.destino,
      peso: datos.peso,
      dimensiones: datos.dimensiones,
      cbm: cbm,
      tipoCarga: esFCL ? 'FCL' : 'LCL',
      validoHasta: '15 días',
      metadata: {
        manual: true,
        cbm: cbm
      }
    }];
  }

  _httpsPost(url, data) {
    return new Promise((resolve, reject) => {
      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        }
      }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Invalid response'));
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify(data));
      req.end();
    });
  }
}

class NavieraPersonalizada extends CourierBase {
  constructor(config) {
    super(config.nombre, 'naviera');
    this.config = config;

    // Tarifas de contenedores (negociadas)
    this.tarifasContenedores = config.tarifasContenedores || {
      '20ft': 1200,  // $1,200 por contenedor 20ft
      '40ft': 2200,  // $2,200 por contenedor 40ft
      '40ftHC': 2500 // $2,500 por contenedor 40ft High Cube
    };

    // Tarifas LCL (Less than Container Load)
    this.tarifasLCL = config.tarifasLCL || {
      porCBM: 55,    // $55 por metro cúbico
      minimo: 1      // 1 CBM mínimo
    };
  }

  async cotizar(datos) {
    // Determinar si es FCL o LCL
    const cbm = this._calcularCBM(datos.dimensiones, datos.cantidad);
    const esFCL = cbm >= 15; // 15 CBM o más = contenedor completo

    let precio, tipoServicio;

    if (esFCL) {
      // FCL - Contenedor completo
      const tipoContenedor = this._determinarTipoContenedor(cbm);
      precio = this.tarifasContenedores[tipoContenedor];
      tipoServicio = `FCL ${tipoContenedor}`;
    } else {
      // LCL - Carga consolidada
      precio = Math.max(cbm * this.tarifasLCL.porCBM, this.tarifasLCL.minimo * this.tarifasLCL.porCBM);
      tipoServicio = 'LCL';
    }

    // Agregar recargos (combustible, seguridad, etc.)
    const recargos = this._calcularRecargos(precio);
    const precioTotal = precio + recargos;

    return [{
      courier: this.nombre,
      servicio: tipoServicio,
      empresa_real: this.nombre,
      precio: parseFloat(precioTotal.toFixed(2)),
      moneda: 'USD',
      tiempoEntrega: this.config.tiempoEntrega || '28-35 días',
      tipo: this.tipo,
      origen: datos.origen,
      destino: datos.destino,
      peso: datos.peso,
      dimensiones: datos.dimensiones,
      cbm: cbm,
      tipoCarga: esFCL ? 'FCL' : 'LCL',
      validoHasta: '15 días',
      metadata: {
        naviera: true,
        cbm: cbm,
        recargos: recargos,
        tipoContenedor: esFCL ? this._determinarTipoContenedor(cbm) : null
      }
    }];
  }

  _calcularCBM(dimensiones, cantidad = 1) {
    if (!dimensiones) return 1; // Default 1 CBM

    const largo = (dimensiones.largo || 50) / 100; // cm → m
    const ancho = (dimensiones.ancho || 50) / 100;
    const alto = (dimensiones.alto || 50) / 100;

    return largo * ancho * alto * cantidad;
  }

  _determinarTipoContenedor(cbm) {
    if (cbm >= 68) return '40ftHC'; // 68+ CBM
    if (cbm >= 33) return '40ft';   // 33-68 CBM
    return '20ft';                   // 15-33 CBM
  }

  _calcularRecargos(precioBase) {
    const recargos = {
      combustible: precioBase * 0.15, // 15% BAF (Bunker Adjustment Factor)
      seguridad: 50,                   // $50 seguridad
      terminal: 100                    // $100 terminal
    };

    return Object.values(recargos).reduce((sum, val) => sum + val, 0);
  }
}

// ═══════════════════════════════════════════════════
// INTEGRADOR PRINCIPAL
// ═══════════════════════════════════════════════════

class IntegradorLogistica {
  constructor() {
    this.couriers = [];
    this.navieras = [];
  }

  // Agregar courier API (Shippo, EasyPost)
  agregarCourierAPI(courier) {
    if (!(courier instanceof CourierBase)) {
      throw new Error('Courier debe extender CourierBase');
    }
    this.couriers.push(courier);
  }

  // Agregar courier personalizado
  agregarCourierPersonalizado(config) {
    const courier = new CourierPersonalizado(config);
    this.couriers.push(courier);
  }

  // Agregar naviera personalizada
  agregarNaviera(config) {
    const naviera = new NavieraPersonalizada(config);
    this.navieras.push(naviera);
  }

  // Cotizar con TODOS los couriers y navieras
  async cotizarTodo(datos) {
    const resultados = {
      couriers: [],
      navieras: [],
      mejorOpcion: null,
      todasOpciones: [],
      contingencia: null
    };

    // Verificar resets automáticos
    contingencia.verificarResets();

    // Obtener prioridad de couriers disponibles
    const prioridad = contingencia.obtenerPrioridad();

    // Filtrar couriers por tipo de envío
    const couriersDisponibles = prioridad.filter(c =>
      datos.tipo === 'maritimo' ? c.tipo === 'naviera' || c.tipo === 'fallback' : c.tipo !== 'naviera'
    );

    // 1. Cotizar con couriers disponibles (en orden de prioridad)
    if (datos.tipo === 'aereo' || datos.tipo === 'terrestre' || !datos.tipo) {
      for (const courierConfig of couriersDisponibles) {
        const courier = this.couriers.find(c => c.getNombre() === courierConfig.nombre);

        if (courier) {
          // Verificar si API está disponible
          if (!contingencia.estaDisponible(courier.getNombre())) {
            console.log(`[LOGÍSTICA] ⚠️ ${courier.getNombre()}: API agotada, saltando`);
            continue;
          }

          try {
            const cotizaciones = await courier.cotizar(datos);
            resultados.couriers.push(...cotizaciones);

            // Registrar uso de API
            if (courierConfig.tipo === 'api') {
              contingencia.registrarUso(courier.getNombre());
            }
          } catch (e) {
            console.error(`[LOGÍSTICA] Error con ${courier.getNombre()}:`, e.message);
          }
        }
      }
    }

    // 2. Cotizar con navieras disponibles
    if (datos.tipo === 'maritimo' || !datos.tipo) {
      for (const navieraConfig of couriersDisponibles) {
        const naviera = this.navieras.find(n => n.getNombre() === navieraConfig.nombre);

        if (naviera) {
          if (!contingencia.estaDisponible(naviera.getNombre())) {
            console.log(`[LOGÍSTICA] ⚠️ ${naviera.getNombre()}: API agotada, saltando`);
            continue;
          }

          try {
            const cotizaciones = await naviera.cotizar(datos);
            resultados.navieras.push(...cotizaciones);

            // Registrar uso de API
            if (navieraConfig.tipo === 'api') {
              contingencia.registrarUso(naviera.getNombre());
            }
          } catch (e) {
            console.error(`[LOGÍSTICA] Error con ${naviera.getNombre()}:`, e.message);
          }
        }
      }
    }

    // 3. Si no hay cotizaciones, usar fallback referencial
    if (resultados.couriers.length === 0 && resultados.navieras.length === 0) {
      console.log('[LOGÍSTICA] ⚠️ No hay APIs disponibles, usando fallback referencial');
      const fallback = this._cotizarFallback(datos);
      resultados.couriers.push(fallback);
    }

    // 4. Combinar todas las opciones
    resultados.todasOpciones = [
      ...resultados.couriers,
      ...resultados.navieras
    ].sort((a, b) => a.precio - b.precio);

    // 5. Determinar mejor opción (más barata)
    if (resultados.todasOpciones.length > 0) {
      resultados.mejorOpcion = resultados.todasOpciones[0];
    }

    // 6. Agregar información de contingencia
    resultados.contingencia = contingencia.obtenerEstadisticas();

    return resultados;
  }

  // Fallback referencial cuando todas las APIs fallan
  _cotizarFallback(datos) {
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
        nota: 'Tarifa referencial cuando APIs no están disponibles'
      }
    };
  }

  // Obtener estado de contingencia
  obtenerContingencia() {
    return contingencia.obtenerEstadisticas();
  }

  // Obtener prioridad de couriers
  obtenerPrioridad() {
    return contingencia.obtenerPrioridad();
  }

  // Obtener lista de couriers/navieras configurados
  listarEmpresas() {
    return {
      couriers: this.couriers.map(c => ({
        nombre: c.getNombre(),
        tipo: c.getTipo(),
        activo: c.activo
      })),
      navieras: this.navieras.map(n => ({
        nombre: n.getNombre(),
        tipo: n.getTipo(),
        activo: n.activo
      }))
    };
  }

  // Limpiar couriers/navieras inactivos
  limpiarInactivos() {
    this.couriers = this.couriers.filter(c => c.activo);
    this.navieras = this.navieras.filter(n => n.activo);
  }
}

// ═══════════════════════════════════════════════════
// EXPORTAR TODAS LAS CLASES
// ═══════════════════════════════════════════════════

module.exports = {
  IntegradorLogistica,
  CourierBase,
  // APIs Gratuitas
  ShippoCourier,
  EasyPostCourier,
  AfterShipCourier,
  PackSendCourier,
  InterparcelCourier,
  ParcelMonkeyCourier,
  // Navieras APIs
  MaerskNaviera,
  MSCNaviera,
  // Personalizados
  CourierPersonalizado,
  NavieraPersonalizada
};
