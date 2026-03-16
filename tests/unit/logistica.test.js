// tests/unit/logistica.test.js
// Tests unitarios para Logística

const { describe, it, expect, beforeEach } = require('@jest/globals');

describe('Integrador Logística', () => {
  let integradorLogistica;

  beforeEach(() => {
    jest.resetModules();
    integradorLogistica = require('../../server/couriers/integrador-logistica');
  });

  describe('IntegradorLogistica class', () => {
    it('debería crear instancia', () => {
      expect(integradorLogistica.IntegradorLogistica).toBeDefined();
      
      const integrador = new integradorLogistica.IntegradorLogistica();
      expect(integrador).toBeDefined();
      expect(integrador.couriers).toBeDefined();
      expect(integrador.navieras).toBeDefined();
    });

    it('debería agregar couriers', () => {
      const integrador = new integradorLogistica.IntegradorLogistica();
      
      integrador.agregarCourierPersonalizado({
        nombre: 'Test Courier',
        tarifas: { base: 10, porKg: 5, minimo: 20 }
      });
      
      expect(integrador.couriers.length).toBeGreaterThan(0);
    });

    it('debería agregar navieras', () => {
      const integrador = new integradorLogistica.IntegradorLogistica();
      
      integrador.agregarNaviera({
        nombre: 'Test Naviera',
        tarifasContenedores: { '20ft': 1000, '40ft': 2000 }
      });
      
      expect(integrador.navieras.length).toBeGreaterThan(0);
    });

    it('debería listar empresas', () => {
      const integrador = new integradorLogistica.IntegradorLogistica();
      const empresas = integrador.listarEmpresas();
      
      expect(empresas).toBeDefined();
      expect(empresas.couriers).toBeDefined();
      expect(empresas.navieras).toBeDefined();
    });
  });

  describe('CourierPersonalizado', () => {
    it('debería cotizar', async () => {
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
  });

  describe('NavieraPersonalizada', () => {
    it('debería cotizar FCL', async () => {
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

    it('debería cotizar LCL', async () => {
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
});
