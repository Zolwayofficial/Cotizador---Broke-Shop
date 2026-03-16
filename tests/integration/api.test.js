// tests/integration/api.test.js
// Tests de integración para API REST

const { describe, it, expect, beforeAll, afterAll } = require('@jest/globals');
const request = require('supertest');

describe('API REST Integration Tests', () => {
  let app;
  let server;

  beforeAll(async () => {
    // Cargar app
    app = require('../../server/index');
    
    // Iniciar server en puerto de test
    server = app.listen(3001);
  });

  afterAll(async () => {
    // Cerrar server
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  describe('GET /api/health', () => {
    it('debería retornar health check', async () => {
      const response = await request(app).get('/api/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });
  });

  describe('GET /api/dashboard', () => {
    it('debería retornar datos del dashboard', async () => {
      const response = await request(app).get('/api/dashboard');
      
      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
      expect(response.body.kpis).toBeDefined();
    });
  });

  describe('GET /api/dashboard/analisis', () => {
    it('debería retornar análisis con IA', async () => {
      const response = await request(app).get('/api/dashboard/analisis');
      
      expect(response.status).toBe(200);
      expect(response.body.analisis).toBeDefined();
    });
  });

  describe('GET /api/logistica/empresas', () => {
    it('debería retornar empresas configuradas', async () => {
      const response = await request(app).get('/api/logistica/empresas');
      
      expect(response.status).toBe(200);
      expect(response.body.couriers).toBeDefined();
      expect(response.body.navieras).toBeDefined();
    });
  });

  describe('GET /api/logistica/contingencia', () => {
    it('debería retornar estado de contingencia', async () => {
      const response = await request(app).get('/api/logistica/contingencia');
      
      expect(response.status).toBe(200);
      expect(response.body.total_usos).toBeDefined();
    });
  });

  describe('POST /api/logistica/cotizar', () => {
    it('debería cotizar con todos los couriers', async () => {
      const datos = {
        origen: 'US',
        destino: 'PE',
        peso: 50,
        dimensiones: { largo: 100, ancho: 50, alto: 50 },
        valor: 1000
      };

      const response = await request(app)
        .post('/api/logistica/cotizar')
        .send(datos);
      
      expect(response.status).toBe(200);
      expect(response.body.couriers).toBeDefined();
      expect(response.body.navieras).toBeDefined();
    });

    it('debería retornar error sin datos requeridos', async () => {
      const response = await request(app)
        .post('/api/logistica/cotizar')
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/dashboard/chat', () => {
    it('debería responder preguntas', async () => {
      const response = await request(app)
        .post('/api/dashboard/chat')
        .send({ pregunta: '¿Cuál es el total de cotizaciones?' });
      
      expect(response.status).toBe(200);
      expect(response.body.respuesta).toBeDefined();
    });
  });
});
