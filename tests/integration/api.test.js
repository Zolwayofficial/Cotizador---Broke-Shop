// tests/integration/api.test.js
// Tests de integración para API REST

const { describe, it, expect, beforeAll, afterAll } = require('@jest/globals');
const request = require('supertest');
const db = require('../../server/db');
const benchmarkCase = require('../../server/benchmarks/fixtures/ksarp-pc1.case.json');

describe('API REST Integration Tests', () => {
  let app;

  beforeAll(async () => {
    app = require('../../server/index');
    await app.init();
  });

  afterAll(async () => {
    if (app?.stopServer) {
      await app.stopServer();
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

  describe('Acceso privado', () => {
    it('deberia bloquear el registro publico en produccion', async () => {
      const previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const base = Date.now();
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: `sin-codigo-${base}@example.com`,
            password: 'secret12',
            name: 'Sin Codigo'
          });

        expect(response.status).toBe(403);
        expect(response.body.error).toMatch(/Solo el administrador puede habilitar cuentas/i);
      } finally {
        if (previousNodeEnv === undefined) {
          delete process.env.NODE_ENV;
        } else {
          process.env.NODE_ENV = previousNodeEnv;
        }
      }
    });

    it('deberia permitir invitaciones solo a admin y registrar al invitado', async () => {
      const base = Date.now();
      const adminPassword = 'secret12';

      const adminRegister = await request(app)
        .post('/api/auth/register')
        .send({
          email: `admin-${base}@example.com`,
          password: adminPassword,
          name: 'Admin Comunidad'
        });

      expect(adminRegister.status).toBe(200);

      db.run('UPDATE users SET role = ? WHERE id = ?', ['admin', adminRegister.body.id]);

      const adminLogin = await request(app)
        .post('/api/auth/login')
        .send({
          email: `admin-${base}@example.com`,
          password: adminPassword
        });

      const miembroRegister = await request(app)
        .post('/api/auth/register')
        .send({
          email: `miembro-${base}@example.com`,
          password: adminPassword,
          name: 'Miembro Regular'
        });

      const miembroCodeAttempt = await request(app)
        .post('/api/membresias/generar-codigo')
        .set('Authorization', `Bearer ${miembroRegister.body.token}`)
        .send({ tipo: 'NORMAL', usosMaximos: 1 });

      const codigoResponse = await request(app)
        .post('/api/membresias/generar-codigo')
        .set('Authorization', `Bearer ${adminLogin.body.token}`)
        .send({ tipo: 'NORMAL', usosMaximos: 1 });

      expect(miembroCodeAttempt.status).toBe(403);
      expect(codigoResponse.status).toBe(200);
      expect(codigoResponse.body.codigo).toMatch(/^INV-/);

      const invitado = await request(app)
        .post('/api/membresias/registro')
        .send({
          email: `invitado-${base}@example.com`,
          password: 'secret12',
          nombre: 'Invitado',
          codigoInvitacion: codigoResponse.body.codigo
        });

      expect(invitado.status).toBe(200);
      expect(invitado.body.usuario.token).toBeDefined();
      expect(invitado.body.usuario.membresia).toBe('GRATIS');
    });
  });

  describe('POST /api/agente/calcular', () => {
    it('debería calcular una cotización simple sin romper el rate limiter', async () => {
      const response = await request(app)
        .post('/api/agente/calcular')
        .send({
          items: [{ desc: 'camisetas de algodon', qty: 500, unit: 3.5 }],
          pais: 'CN',
          canal: 'COURIER',
          incoterm: 'FOB',
          tipoImportador: 'general',
          margenVenta: 30,
          moneda: 'USD'
        });

      expect(response.status).toBe(200);
      expect(response.body.exito).toBe(true);
      expect(response.body.totales.totalReal).toBeGreaterThan(0);
    });

    it('deberia aceptar el caso benchmark avanzado sin romper compatibilidad', async () => {
      const response = await request(app)
        .post('/api/agente/calcular')
        .send(benchmarkCase);

      expect(response.status).toBe(200);
      expect(response.body.exito).toBe(true);
      expect(response.body.benchmark).toBeDefined();
      expect(response.body.benchmark.academic).toBeDefined();
      expect(response.body.benchmark.operational).toBeDefined();
      expect(response.body.benchmark.academic.customsValue).toBeCloseTo(29536.54, 2);
      expect(Math.abs(response.body.benchmark.operational.importCost.total - 40902.81)).toBeLessThanOrEqual(0.05);
      expect(response.body.benchmark.differences.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/agente-0/chat', () => {
    it('deberia seguir el nuevo arbol sin perder el producto al responder opciones', async () => {
      const inicio = await request(app).post('/api/agente-0/iniciar');
      expect(inicio.status).toBe(200);
      expect(inicio.body.paso).toBe('productos');

      const productos = await request(app)
        .post('/api/agente-0/chat')
        .send({
          mensaje: '500 camisetas de algodon',
          contexto: inicio.body.contexto
        });

      expect(productos.status).toBe(200);
      expect(productos.body.paso).toBe('pais_origen');

      const pais = await request(app)
        .post('/api/agente-0/chat')
        .send({
          mensaje: 'China',
          contexto: productos.body.contexto
        });

      expect(pais.status).toBe(200);
      expect(pais.body.paso).toBe('tipo_sujeto');

      const sujeto = await request(app)
        .post('/api/agente-0/chat')
        .send({
          mensaje: 'Empresa',
          contexto: pais.body.contexto
        });

      expect(sujeto.status).toBe(200);
      expect(sujeto.body.paso).toBe('canal');

      const canal = await request(app)
        .post('/api/agente-0/chat')
        .send({
          mensaje: 'Aereo',
          contexto: sujeto.body.contexto
        });

      expect(canal.status).toBe(200);
      expect(canal.body.contexto.datos_previos.productos[0].producto).toMatch(/camisetas/i);
      expect(canal.body.contexto.datos_previos.canal).toBe('AEREO');
      expect(canal.body.paso).toBe('precio_unitario');
    });
  });

  describe('Carga de documentos', () => {
    it('deberia responder 422 para .doc legacy en vez de 500', async () => {
      const response = await request(app)
        .post('/api/auto-cotizar/extraer')
        .attach('file', Buffer.from('legacy doc'), {
          filename: 'proveedor.doc',
          contentType: 'application/msword',
        });

      expect(response.status).toBe(422);
      expect(response.body.error).toMatch(/Convierte el archivo a \.docx o PDF/i);
      expect(response.body.code).toBe('legacy_doc_unsupported');
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
