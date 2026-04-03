// tests/unit/logistica.test.js
// Tests unitarios para logistica

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { describe, it, expect, beforeEach } = require('@jest/globals');

const MODULE_PATH = '../../server/couriers/integrador-logistica';
const SOURCE_PATH = path.resolve(
  __dirname,
  '../../server/couriers/integrador-logistica.js'
);

describe('Integrador Logistica', () => {
  let integradorLogistica;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.dontMock('https');
    integradorLogistica = require(MODULE_PATH);
  });

  describe('IntegradorLogistica class', () => {
    it('deberia crear instancia', () => {
      expect(integradorLogistica.IntegradorLogistica).toBeDefined();

      const integrador = new integradorLogistica.IntegradorLogistica();
      expect(integrador).toBeDefined();
      expect(integrador.couriers).toBeDefined();
      expect(integrador.navieras).toBeDefined();
    });

    it('deberia agregar couriers', () => {
      const integrador = new integradorLogistica.IntegradorLogistica();

      integrador.agregarCourierPersonalizado({
        nombre: 'Test Courier',
        tarifas: { base: 10, porKg: 5, minimo: 20 }
      });

      expect(integrador.couriers.length).toBeGreaterThan(0);
    });

    it('deberia agregar navieras', () => {
      const integrador = new integradorLogistica.IntegradorLogistica();

      integrador.agregarNaviera({
        nombre: 'Test Naviera',
        tarifasContenedores: { '20ft': 1000, '40ft': 2000 }
      });

      expect(integrador.navieras.length).toBeGreaterThan(0);
    });

    it('deberia conservar navieras API sin convertirlas a manuales', () => {
      const integrador = new integradorLogistica.IntegradorLogistica();
      const maersk = new integradorLogistica.MaerskNaviera('token-demo');

      integrador.agregarNaviera(maersk);

      expect(integrador.navieras[0]).toBe(maersk);
      expect(integrador.navieras[0] instanceof integradorLogistica.MaerskNaviera).toBe(true);
    });

    it('deberia listar empresas', () => {
      const integrador = new integradorLogistica.IntegradorLogistica();
      const empresas = integrador.listarEmpresas();

      expect(empresas).toBeDefined();
      expect(empresas.couriers).toBeDefined();
      expect(empresas.navieras).toBeDefined();
    });
  });

  describe('CourierPersonalizado', () => {
    it('deberia cotizar', async () => {
      const { CourierPersonalizado } = integradorLogistica;
      const courier = new CourierPersonalizado({
        nombre: 'Test',
        tarifas: { base: 10, porKg: 5, minimo: 20 }
      });

      const datos = {
        origen: 'US',
        destino: 'PE',
        peso: 50,
        valor: 1000
      };

      const cotizaciones = await courier.cotizar(datos);

      expect(cotizaciones).toBeDefined();
      expect(Array.isArray(cotizaciones)).toBe(true);
      expect(cotizaciones.length).toBeGreaterThan(0);
      expect(cotizaciones[0].precio).toBeGreaterThan(0);
    });

    it('deberia usarse en cotizarTodo sin caer al fallback por contingencia', async () => {
      const integrador = new integradorLogistica.IntegradorLogistica();

      integrador.agregarCourierPersonalizado({
        nombre: 'DHL Directo (Contrato)',
        tarifas: { base: 10, porKg: 5, minimo: 20 }
      });

      const resultado = await integrador.cotizarTodo({
        origen: 'CN',
        destino: 'PE',
        tipo: 'aereo',
        peso: 10,
        valor: 1000
      });

      expect(resultado.couriers[0].courier).toBe('DHL Directo (Contrato)');
      expect(resultado.mejorOpcion.courier).toBe('DHL Directo (Contrato)');
    });
  });

  describe('NavieraPersonalizada', () => {
    it('deberia cotizar FCL', async () => {
      const { NavieraPersonalizada } = integradorLogistica;
      const naviera = new NavieraPersonalizada({
        nombre: 'Test',
        tarifasContenedores: { '20ft': 1000, '40ft': 2000, '40ftHC': 2500 },
        tarifasLCL: { porCBM: 50, minimo: 1 }
      });

      const datos = {
        origen: 'CN',
        destino: 'PE',
        peso: 5000,
        dimensiones: { largo: 200, ancho: 200, alto: 200 },
        cantidad: 10
      };

      const cotizaciones = await naviera.cotizar(datos);

      expect(cotizaciones).toBeDefined();
      expect(Array.isArray(cotizaciones)).toBe(true);
      expect(cotizaciones.length).toBeGreaterThan(0);
    });

    it('deberia cotizar LCL', async () => {
      const { NavieraPersonalizada } = integradorLogistica;
      const naviera = new NavieraPersonalizada({
        nombre: 'Test',
        tarifasContenedores: { '20ft': 1000, '40ft': 2000 },
        tarifasLCL: { porCBM: 50, minimo: 1 }
      });

      const datos = {
        origen: 'CN',
        destino: 'PE',
        peso: 100,
        dimensiones: { largo: 50, ancho: 50, alto: 50 }
      };

      const cotizaciones = await naviera.cotizar(datos);

      expect(cotizaciones).toBeDefined();
      expect(cotizaciones[0].tipoCarga).toBe('LCL');
    });
  });

  describe('Robustez', () => {
    it('rechaza respuestas HTTP >= 400 en ShippoCourier._httpsPost', async () => {
      jest.resetModules();
      jest.doMock('https', () => ({
        request: jest.fn((_url, _options, callback) => {
          const response = new EventEmitter();
          response.statusCode = 401;

          const request = new EventEmitter();
          request.write = jest.fn();
          request.end = jest.fn(() => {
            callback(response);
            response.emit('data', JSON.stringify({ error: { message: 'Unauthorized' } }));
            response.emit('end');
          });

          return request;
        })
      }));

      const { ShippoCourier } = require(MODULE_PATH);
      const courier = new ShippoCourier('token-demo');

      await expect(
        courier._httpsPost('https://api.goshippo.com/shipments/', { peso: 1 })
      ).rejects.toThrow('Shippo HTTP 401');
    });

    it('rechaza bodies no JSON con un error no interpretable en ShippoCourier._httpsPost', async () => {
      jest.resetModules();
      jest.doMock('https', () => ({
        request: jest.fn((_url, _options, callback) => {
          const response = new EventEmitter();
          response.statusCode = 200;

          const request = new EventEmitter();
          request.write = jest.fn();
          request.end = jest.fn(() => {
            callback(response);
            response.emit('data', '<html>upstream error</html>');
            response.emit('end');
          });

          return request;
        })
      }));

      const { ShippoCourier } = require(MODULE_PATH);
      const courier = new ShippoCourier('token-demo');

      await expect(
        courier._httpsPost('https://api.goshippo.com/shipments/', { peso: 1 })
      ).rejects.toThrow('Respuesta no interpretable de Shippo');
    });

    it('no consume cuota de contingencia cuando una API devuelve lista vacia', async () => {
      const registrarUso = jest.fn();

      jest.resetModules();
      jest.doMock('../../server/couriers/contingencia-api', () => ({
        verificarResets: jest.fn(),
        obtenerPrioridad: jest.fn(() => [{ nombre: 'Shippo', tipo: 'api' }]),
        estaDisponible: jest.fn(() => true),
        registrarUso,
        obtenerEstadisticas: jest.fn(() => ({ uso: 0 }))
      }));

      const modulo = require(MODULE_PATH);
      const integrador = new modulo.IntegradorLogistica();
      const shippo = new modulo.ShippoCourier('token-demo');

      shippo.cotizar = jest.fn().mockResolvedValue([]);
      integrador.couriers.push(shippo);

      const resultado = await integrador.cotizarTodo({
        origen: 'CN',
        destino: 'PE',
        tipo: 'aereo',
        peso: 2,
        valor: 100
      });

      expect(registrarUso).not.toHaveBeenCalled();
      expect(resultado.couriers[0].courier).toBe('Referencial (Fallback)');
    });

it('no deja mojibake residual ni wording absoluto en integrador-logistica.js', () => {
      const source = fs.readFileSync(SOURCE_PATH, 'utf8');

      expect(source).not.toMatch(/\u00C3|\u00E2\u20AC\u00A2|\uFFFD/);
      expect(source).not.toMatch(/100%\s+gratuito/i);
      expect(source).not.toContain('Ilimitado');
      expect(source).not.toContain('ilimitado');
      expect(source).toContain('sin cuota local rastreada');
      expect(source).toContain("new Error(`Respuesta no interpretable de ${label}`)");
      expect(source).not.toContain('invalid response');
    });
  });
});
