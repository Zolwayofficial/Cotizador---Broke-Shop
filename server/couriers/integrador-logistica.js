// server/couriers/integrador-logistica.js
//
// INTEGRADOR DE LOGISTICA - Couriers y Navieras
//
// Features:
// - APIs gratuitas (Shippo, EasyPost, AfterShip)
// - Couriers personalizados (contratos directos)
// - Navieras personalizadas (Maersk, MSC, etc.)
// - Especifica que empresa cotizo
// - Fallbacks y contratos propios cuando una API externa no responde

const https = require('https');
const contingencia = require('./contingencia-api');

function buildHttpError(statusCode, body, label) {
  let detail = '';

  if (body && body.trim()) {
    try {
      const parsed = JSON.parse(body);
      detail =
        parsed?.error?.message ||
        parsed?.error ||
        parsed?.message ||
        parsed?.detail ||
        '';
    } catch (_error) {
      detail = body.trim();
    }
  }

  return new Error(
    `${label} HTTP ${statusCode}${detail ? `: ${String(detail)}` : ''}`
  );
}

function postJson(url, data, headers, label) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'POST',
        headers
      },
      res => {
        let body = '';

        res.on('data', chunk => {
          body += chunk;
        });

        res.on('end', () => {
          const statusCode = Number.isInteger(res.statusCode) ? res.statusCode : 0;

          if (statusCode >= 400) {
            reject(buildHttpError(statusCode, body, label));
            return;
          }

          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (_error) {
            reject(new Error(`Respuesta no interpretable de ${label}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

// --------------------------------------------------
// CLASE BASE PARA TODOS LOS COURIERS
// --------------------------------------------------

class CourierBase {
  constructor(nombre, tipo = 'courier') {
    this.nombre = nombre;
    this.tipo = tipo;
    this.activo = true;
  }

  async cotizar(_datos) {
    throw new Error('Metodo cotizar() debe ser implementado');
  }

  getNombre() {
    return this.nombre;
  }

  getTipo() {
    return this.tipo;
  }
}

// --------------------------------------------------
// SHIPPO API (GRATIS - 5,000 envios/ano)
// --------------------------------------------------

class ShippoCourier extends CourierBase {
  constructor(apiToken) {
    super('Shippo', 'courier');
    this.apiToken = apiToken;
    this.baseUrl = 'https://api.goshippo.com';
  }

  async cotizar(datos) {
    try {
      const shipment = await this._crearShipment(datos);
      const rates = await this._obtenerRates(shipment);

      return rates.map(rate => ({
        courier: 'Shippo',
        servicio: rate.servicelevel.name,
        empresa_real: rate.provider,
        precio: parseFloat(rate.amount),
        moneda: rate.currency,
        tiempoEntrega: rate.estimated_days || 'N/A',
        tipo: this.tipo,
        origen: datos.origen,
        destino: datos.destino,
        peso: datos.peso,
        dimensiones: datos.dimensiones,
        validoHasta: rate.validity_days ? `${rate.validity_days} dias` : 'N/A',
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
      parcels: [
        {
          length: datos.dimensiones?.largo || 50,
          width: datos.dimensiones?.ancho || 50,
          height: datos.dimensiones?.alto || 50,
          distance_unit: 'cm',
          weight: datos.peso,
          mass_unit: 'kg'
        }
      ]
    };

    return this._httpsPost(`${this.baseUrl}/shipments/`, data);
  }

  async _obtenerRates(shipment) {
    return shipment.rates || [];
  }

  _httpsPost(url, data) {
    return postJson(
      url,
      data,
      {
        'Content-Type': 'application/json',
        Authorization: `Shippo ${this.apiToken}`
      },
      'Shippo'
    );
  }
}

// --------------------------------------------------
// EASYPOST API (GRATIS - 120,000 envios/ano)
// --------------------------------------------------

class EasyPostCourier extends CourierBase {
  constructor(apiToken) {
    super('EasyPost', 'courier');
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
        empresa_real: rate.carrier,
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

    return this._httpsPost(`${this.baseUrl}/shipments`, data);
  }

  _httpsPost(url, data) {
    return postJson(
      url,
      data,
      {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiToken}`
      },
      'EasyPost'
    );
  }
}

// --------------------------------------------------
// COURIER PERSONALIZADO (Contrato directo)
// --------------------------------------------------

class CourierPersonalizado extends CourierBase {
  constructor(config) {
    super(config.nombre, config.tipo || 'courier');
    this.config = config;
    this.tarifas = config.tarifas || {
      base: 10,
      porKg: 5,
      minimo: 25
    };
  }

  async cotizar(datos) {
    const precioBase = this.tarifas.base;
    const precioPeso = datos.peso * this.tarifas.porKg;
    const precioTotal = Math.max(precioBase + precioPeso, this.tarifas.minimo);

    const descuento = this._calcularDescuento(datos.valor);
    const precioFinal = precioTotal * (1 - descuento);

    return [
      {
        courier: this.nombre,
        servicio: this.config.servicio || 'Estandar',
        empresa_real: this.nombre,
        precio: parseFloat(precioFinal.toFixed(2)),
        moneda: 'USD',
        tiempoEntrega: this.config.tiempoEntrega || '5-8 dias',
        tipo: this.tipo,
        origen: datos.origen,
        destino: datos.destino,
        peso: datos.peso,
        dimensiones: datos.dimensiones,
        validoHasta: '30 dias',
        metadata: {
          personalizado: true,
          tarifas: this.tarifas,
          descuento_aplicado: descuento * 100
        }
      }
    ];
  }

  _calcularDescuento(valor) {
    if (valor > 50000) return 0.20;
    if (valor > 20000) return 0.15;
    if (valor > 10000) return 0.10;
    if (valor > 5000) return 0.05;
    return 0;
  }
}

// --------------------------------------------------
// AFTERSHIP API (GRATIS - 100/mes - 700+ couriers)
// --------------------------------------------------

class AfterShipCourier extends CourierBase {
  constructor(apiKey) {
    super('AfterShip', 'courier');
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.aftership.com/v4';
  }

  async cotizar(datos) {
    try {
      const couriers = await this._obtenerCouriersDisponibles();

      return couriers.map(courier => ({
        courier: 'AfterShip',
        servicio: courier.name,
        empresa_real: courier.slug,
        precio: 0,
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
    return [
      { name: 'DHL', slug: 'dhl' },
      { name: 'FedEx', slug: 'fedex' },
      { name: 'UPS', slug: 'ups' },
      { name: 'USPS', slug: 'usps' },
      { name: 'TNT', slug: 'tnt' }
    ];
  }
}

// --------------------------------------------------
// PACK & SEND API (sin cuota local rastreada - 15+ couriers)
// --------------------------------------------------

class PackSendCourier extends CourierBase {
  constructor(apiKey) {
    super('Pack & Send', 'courier');
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

      return (response.quotes || []).map(quote => ({
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
        validoHasta: quote.valid_until || '7 dias',
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
    return postJson(
      url,
      data,
      {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      'Pack & Send'
    );
  }
}

// --------------------------------------------------
// INTERPARCEL API (sin cuota local rastreada - 25+ couriers)
// --------------------------------------------------

class InterparcelCourier extends CourierBase {
  constructor(apiKey) {
    super('Interparcel', 'courier');
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
        parcels: [
          {
            weight: datos.peso,
            length: datos.dimensiones?.largo || 50,
            width: datos.dimensiones?.ancho || 50,
            height: datos.dimensiones?.alto || 50,
            value: datos.valor || 100
          }
        ]
      };

      const response = await this._httpsPost(`${this.baseUrl}/quotes`, data);

      return (response.parcelQuotes || []).map(quote => ({
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
        validoHasta: quote.expiryDate || '7 dias',
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
    return postJson(
      url,
      data,
      {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      'Interparcel'
    );
  }
}

// --------------------------------------------------
// PARCEL MONKEY API (sin cuota local rastreada)
// --------------------------------------------------

class ParcelMonkeyCourier extends CourierBase {
  constructor(apiKey) {
    super('Parcel Monkey', 'courier');
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.parcelmonkey.com/v1';
  }

  async cotizar(datos) {
    try {
      return this._cotizarReferencial(datos);
    } catch (e) {
      console.error(`[Parcel Monkey] Error: ${e.message}`);
      return [];
    }
  }

  _cotizarReferencial(datos) {
    const baseRate = 12;
    const perKg = 4.5;
    const price = baseRate + datos.peso * perKg;

    return [
      {
        courier: 'Parcel Monkey',
        servicio: 'Economy',
        empresa_real: 'Parcel Monkey',
        precio: parseFloat(price.toFixed(2)),
        moneda: 'USD',
        tiempoEntrega: '5-10 dias',
        tipo: this.tipo,
        origen: datos.origen,
        destino: datos.destino,
        peso: datos.peso,
        dimensiones: datos.dimensiones,
        validoHasta: '30 dias',
        metadata: {
          referencial: true
        }
      }
    ];
  }
}

// --------------------------------------------------
// NAVIERA API (Maersk Spot API)
// --------------------------------------------------

class MaerskNaviera extends CourierBase {
  constructor(apiKey) {
    super('Maersk', 'naviera');
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.maersk.com/spot';
  }

  async cotizar(datos) {
    try {
      const data = {
        pickupLocation: { address: datos.origen },
        deliveryLocation: { address: datos.destino },
        cargo: {
          weight: datos.peso,
          volume: this._calcularCBM(datos.dimensiones)
        }
      };

      const response = await this._httpsPost(`${this.baseUrl}/bookings`, data);

      return (response.rates || []).map(rate => ({
        courier: 'Maersk',
        servicio: rate.serviceName,
        empresa_real: 'Maersk',
        precio: parseFloat(rate.totalPrice),
        moneda: 'USD',
        tiempoEntrega: `${rate.transitTime} dias`,
        tipo: this.tipo,
        origen: datos.origen,
        destino: datos.destino,
        peso: datos.peso,
        dimensiones: datos.dimensiones,
        cbm: this._calcularCBM(datos.dimensiones),
        validoHasta: rate.validUntil || '14 dias',
        metadata: {
          booking_id: rate.id,
          service: rate.serviceName,
          transit_time: rate.transitTime
        }
      }));
    } catch (e) {
      console.error(`[Maersk] Error: ${e.message}`);
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
      precio = cbm >= 68 ? 2500 : cbm >= 33 ? 2200 : 1200;
    } else {
      precio = Math.max(cbm * 55, 55);
    }

    return [
      {
        courier: 'Maersk (Manual)',
        servicio: esFCL ? 'FCL' : 'LCL',
        empresa_real: 'Maersk',
        precio: parseFloat(precio.toFixed(2)),
        moneda: 'USD',
        tiempoEntrega: '28-35 dias',
        tipo: this.tipo,
        origen: datos.origen,
        destino: datos.destino,
        peso: datos.peso,
        dimensiones: datos.dimensiones,
        cbm,
        tipoCarga: esFCL ? 'FCL' : 'LCL',
        validoHasta: '15 dias',
        metadata: {
          manual: true,
          cbm
        }
      }
    ];
  }

  _httpsPost(url, data) {
    return postJson(
      url,
      data,
      {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      'Maersk'
    );
  }
}

// --------------------------------------------------
// MSC NAVIERA API
// --------------------------------------------------

class MSCNaviera extends CourierBase {
  constructor(apiKey) {
    super('MSC', 'naviera');
    this.apiKey = apiKey;
    this.baseUrl = 'https://spot.msc.com/api';
  }

  async cotizar(datos) {
    try {
      const data = {
        origin: datos.origen,
        destination: datos.destino,
        cargoWeight: datos.peso,
        cargoVolume: this._calcularCBM(datos.dimensiones)
      };

      const response = await this._httpsPost(`${this.baseUrl}/rates`, data);

      return (response.rates || []).map(rate => ({
        courier: 'MSC',
        servicio: rate.serviceName,
        empresa_real: 'MSC',
        precio: parseFloat(rate.oceanFreight),
        moneda: 'USD',
        tiempoEntrega: `${rate.transitTime} dias`,
        tipo: this.tipo,
        origen: datos.origen,
        destino: datos.destino,
        peso: datos.peso,
        dimensiones: datos.dimensiones,
        cbm: this._calcularCBM(datos.dimensiones),
        validoHasta: rate.validityDate || '14 dias',
        metadata: {
          rate_id: rate.id,
          transit_time: rate.transitTime
        }
      }));
    } catch (e) {
      console.error(`[MSC] Error: ${e.message}`);
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

    return [
      {
        courier: 'MSC (Manual)',
        servicio: esFCL ? 'FCL' : 'LCL',
        empresa_real: 'MSC',
        precio: parseFloat(precio.toFixed(2)),
        moneda: 'USD',
        tiempoEntrega: '30-38 dias',
        tipo: this.tipo,
        origen: datos.origen,
        destino: datos.destino,
        peso: datos.peso,
        dimensiones: datos.dimensiones,
        cbm,
        tipoCarga: esFCL ? 'FCL' : 'LCL',
        validoHasta: '15 dias',
        metadata: {
          manual: true,
          cbm
        }
      }
    ];
  }

  _httpsPost(url, data) {
    return postJson(
      url,
      data,
      {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      'MSC'
    );
  }
}

class NavieraPersonalizada extends CourierBase {
  constructor(config) {
    super(config.nombre, 'naviera');
    this.config = config;

    this.tarifasContenedores = config.tarifasContenedores || {
      '20ft': 1200,
      '40ft': 2200,
      '40ftHC': 2500
    };

    this.tarifasLCL = config.tarifasLCL || {
      porCBM: 55,
      minimo: 1
    };
  }

  async cotizar(datos) {
    const cbm = this._calcularCBM(datos.dimensiones, datos.cantidad);
    const esFCL = cbm >= 15;

    let precio;
    let tipoServicio;

    if (esFCL) {
      const tipoContenedor = this._determinarTipoContenedor(cbm);
      precio = this.tarifasContenedores[tipoContenedor];
      tipoServicio = `FCL ${tipoContenedor}`;
    } else {
      precio = Math.max(
        cbm * this.tarifasLCL.porCBM,
        this.tarifasLCL.minimo * this.tarifasLCL.porCBM
      );
      tipoServicio = 'LCL';
    }

    const recargos = this._calcularRecargos(precio);
    const precioTotal = precio + recargos;

    return [
      {
        courier: this.nombre,
        servicio: tipoServicio,
        empresa_real: this.nombre,
        precio: parseFloat(precioTotal.toFixed(2)),
        moneda: 'USD',
        tiempoEntrega: this.config.tiempoEntrega || '28-35 dias',
        tipo: this.tipo,
        origen: datos.origen,
        destino: datos.destino,
        peso: datos.peso,
        dimensiones: datos.dimensiones,
        cbm,
        tipoCarga: esFCL ? 'FCL' : 'LCL',
        validoHasta: '15 dias',
        metadata: {
          naviera: true,
          cbm,
          recargos,
          tipoContenedor: esFCL ? this._determinarTipoContenedor(cbm) : null
        }
      }
    ];
  }

  _calcularCBM(dimensiones, cantidad = 1) {
    if (!dimensiones) return 1;

    const largo = (dimensiones.largo || 50) / 100;
    const ancho = (dimensiones.ancho || 50) / 100;
    const alto = (dimensiones.alto || 50) / 100;

    return largo * ancho * alto * cantidad;
  }

  _determinarTipoContenedor(cbm) {
    if (cbm >= 68) return '40ftHC';
    if (cbm >= 33) return '40ft';
    return '20ft';
  }

  _calcularRecargos(precioBase) {
    const recargos = {
      combustible: precioBase * 0.15,
      seguridad: 50,
      terminal: 100
    };

    return Object.values(recargos).reduce((sum, value) => sum + value, 0);
  }
}

// --------------------------------------------------
// INTEGRADOR PRINCIPAL
// --------------------------------------------------

class IntegradorLogistica {
  constructor() {
    this.couriers = [];
    this.navieras = [];
  }

  agregarCourierAPI(courier) {
    if (!(courier instanceof CourierBase)) {
      throw new Error('Courier debe extender CourierBase');
    }
    this.couriers.push(courier);
  }

  agregarCourierPersonalizado(config) {
    const courier = new CourierPersonalizado(config);
    this.couriers.push(courier);
  }

  agregarNaviera(config) {
    if (config instanceof CourierBase) {
      this.navieras.push(config);
      return;
    }

    const naviera = new NavieraPersonalizada(config);
    this.navieras.push(naviera);
  }

  async cotizarTodo(datos) {
    const resultados = {
      couriers: [],
      navieras: [],
      mejorOpcion: null,
      todasOpciones: [],
      contingencia: null
    };

    contingencia.verificarResets();

    const prioridad = contingencia.obtenerPrioridad();
    const couriersDisponibles = prioridad.filter(config =>
      datos.tipo === 'maritimo'
        ? config.tipo === 'naviera' || config.tipo === 'fallback'
        : config.tipo !== 'naviera'
    );

    if (datos.tipo === 'aereo' || datos.tipo === 'terrestre' || !datos.tipo) {
      for (const courierConfig of couriersDisponibles) {
        const courier = this.couriers.find(item => item.getNombre() === courierConfig.nombre);

        if (!courier) {
          continue;
        }

        if (!contingencia.estaDisponible(courier.getNombre())) {
          console.log(`[LOGISTICA] WARNING ${courier.getNombre()}: API agotada, saltando`);
          continue;
        }

        try {
          const cotizaciones = await courier.cotizar(datos);
          resultados.couriers.push(...cotizaciones);

          if (courierConfig.tipo === 'api' && cotizaciones.length > 0) {
            contingencia.registrarUso(courier.getNombre());
          }
        } catch (e) {
          console.error(`[LOGISTICA] Error con ${courier.getNombre()}:`, e.message);
        }
      }
    }

    if (datos.tipo === 'maritimo' || !datos.tipo) {
      for (const navieraConfig of couriersDisponibles) {
        const naviera = this.navieras.find(item => item.getNombre() === navieraConfig.nombre);

        if (!naviera) {
          continue;
        }

        if (!contingencia.estaDisponible(naviera.getNombre())) {
          console.log(`[LOGISTICA] WARNING ${naviera.getNombre()}: API agotada, saltando`);
          continue;
        }

        try {
          const cotizaciones = await naviera.cotizar(datos);
          resultados.navieras.push(...cotizaciones);

          if (navieraConfig.tipo === 'api' && cotizaciones.length > 0) {
            contingencia.registrarUso(naviera.getNombre());
          }
        } catch (e) {
          console.error(`[LOGISTICA] Error con ${naviera.getNombre()}:`, e.message);
        }
      }
    }

    if (resultados.couriers.length === 0 && resultados.navieras.length === 0) {
      console.log('[LOGISTICA] WARNING No hay APIs disponibles, usando fallback referencial');
      resultados.couriers.push(this._cotizarFallback(datos));
    }

    resultados.todasOpciones = [...resultados.couriers, ...resultados.navieras].sort(
      (left, right) => left.precio - right.precio
    );

    if (resultados.todasOpciones.length > 0) {
      resultados.mejorOpcion = resultados.todasOpciones[0];
    }

    resultados.contingencia = contingencia.obtenerEstadisticas();

    return resultados;
  }

  _cotizarFallback(datos) {
    const baseRate = 12;
    const perKg = 4.5;
    const price = baseRate + datos.peso * perKg;

    return {
      courier: 'Referencial (Fallback)',
      servicio: 'Estimado',
      empresa_real: 'Referencial',
      precio: parseFloat(price.toFixed(2)),
      moneda: 'USD',
      tiempoEntrega: '5-10 dias',
      tipo: 'fallback',
      origen: datos.origen,
      destino: datos.destino,
      peso: datos.peso,
      dimensiones: datos.dimensiones,
      validoHasta: '30 dias',
      metadata: {
        fallback: true,
        nota: 'Tarifa referencial cuando las APIs no estan disponibles'
      }
    };
  }

  obtenerContingencia() {
    return contingencia.obtenerEstadisticas();
  }

  obtenerPrioridad() {
    return contingencia.obtenerPrioridad();
  }

  listarEmpresas() {
    return {
      couriers: this.couriers.map(courier => ({
        nombre: courier.getNombre(),
        tipo: courier.getTipo(),
        activo: courier.activo
      })),
      navieras: this.navieras.map(naviera => ({
        nombre: naviera.getNombre(),
        tipo: naviera.getTipo(),
        activo: naviera.activo
      }))
    };
  }

  limpiarInactivos() {
    this.couriers = this.couriers.filter(courier => courier.activo);
    this.navieras = this.navieras.filter(naviera => naviera.activo);
  }
}

// --------------------------------------------------
// EXPORTAR TODAS LAS CLASES
// --------------------------------------------------

module.exports = {
  IntegradorLogistica,
  CourierBase,
  ShippoCourier,
  EasyPostCourier,
  AfterShipCourier,
  PackSendCourier,
  InterparcelCourier,
  ParcelMonkeyCourier,
  MaerskNaviera,
  MSCNaviera,
  CourierPersonalizado,
  NavieraPersonalizada
};
