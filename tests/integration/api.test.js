const { describe, it, expect, beforeAll, afterAll } = require('@jest/globals');
const request = require('supertest');
const db = require('../../server/db');
const dashboardService = require('../../server/dashboard/dashboard-service');
const benchmarkCase = require('../../server/benchmarks/fixtures/ksarp-pc1.case.json');

describe('API REST Integration Tests', () => {
  let app;

  async function createAdmin(base = Date.now()) {
    const password = 'secret12';
    const email = `admin-${base}@example.com`;

    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password,
        name: 'Admin Comunidad',
      });

    expect(registerResponse.status).toBe(200);

    db.run('UPDATE users SET role = ?, active = 1, approved = 1 WHERE id = ?', ['admin', registerResponse.body.id]);

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email, password });

    expect(loginResponse.status).toBe(200);

    return {
      email,
      password,
      token: loginResponse.body.token,
      id: loginResponse.body.id,
    };
  }

  async function createUser(base = Date.now()) {
    const password = 'secret12';
    const email = `user-${base}@example.com`;

    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password,
        name: 'Miembro Comunidad',
      });

    expect(registerResponse.status).toBe(200);

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email, password });

    expect(loginResponse.status).toBe(200);

    return {
      email,
      password,
      token: loginResponse.body.token,
      id: loginResponse.body.id,
    };
  }

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
    it('deberia retornar health check', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });
  });

  describe('GET /api/dashboard', () => {
    it('deberia retornar datos del dashboard autenticado', async () => {
      const user = await createUser(Date.now());
      const response = await request(app)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${user.token}`);

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
      expect(response.body.kpis).toBeDefined();
      expect(response.body.meta.scope).toBe('mine');
    });

    it('deberia respetar el scope del usuario y permitir vista comunidad a admin', async () => {
      db.run('DELETE FROM quotations');
      dashboardService.limpiarCache();

      const admin = await createAdmin(Date.now());
      const member = await createUser(Date.now() + 1);

      const adminQuote = await request(app)
        .post('/api/agente/calcular')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          items: [{ desc: 'laptops gamer', qty: 10, unit: 900 }],
          pais: 'US',
          canal: 'AEREO',
          incoterm: 'FOB',
          tipoImportador: 'general',
          margenVenta: 25,
          moneda: 'USD',
        });

      const memberQuote = await request(app)
        .post('/api/agente/calcular')
        .set('Authorization', `Bearer ${member.token}`)
        .send({
          items: [{ desc: 'vinos espanoles', qty: 24, unit: 11 }],
          pais: 'ES',
          canal: 'MARITIMO',
          incoterm: 'FOB',
          tipoImportador: 'general',
          margenVenta: 30,
          moneda: 'USD',
        });

      expect(adminQuote.status).toBe(200);
      expect(memberQuote.status).toBe(200);

      dashboardService.limpiarCache();

      const mineResponse = await request(app)
        .get('/api/dashboard?scope=mine')
        .set('Authorization', `Bearer ${member.token}`);

      expect(mineResponse.status).toBe(200);
      expect(mineResponse.body.meta.scope).toBe('mine');
      expect(mineResponse.body.kpis.totalCotizaciones.valor).toBe(1);
      expect(mineResponse.body.graficos.distribucionPaises.datos[0].pais).toBe('Espana');

      const communityResponse = await request(app)
        .get('/api/dashboard?scope=community')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(communityResponse.status).toBe(200);
      expect(communityResponse.body.meta.scope).toBe('community');
      expect(communityResponse.body.kpis.totalCotizaciones.valor).toBe(2);
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
            name: 'Sin Codigo',
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
          name: 'Admin Comunidad',
        });

      expect(adminRegister.status).toBe(200);

      db.run('UPDATE users SET role = ? WHERE id = ?', ['admin', adminRegister.body.id]);

      const adminLogin = await request(app)
        .post('/api/auth/login')
        .send({
          email: `admin-${base}@example.com`,
          password: adminPassword,
        });

      const miembroRegister = await request(app)
        .post('/api/auth/register')
        .send({
          email: `miembro-${base}@example.com`,
          password: adminPassword,
          name: 'Miembro Regular',
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
          codigoInvitacion: codigoResponse.body.codigo,
        });

      expect(invitado.status).toBe(200);
      expect(invitado.body.usuario.token).toBeDefined();
      expect(invitado.body.usuario.membresia).toBe('GRATIS');
    });
  });

  describe('Panel admin', () => {
    it('deberia bloquear las rutas admin para usuarios no admin', async () => {
      const base = Date.now();
      const miembroRegister = await request(app)
        .post('/api/auth/register')
        .send({
          email: `usuario-${base}@example.com`,
          password: 'secret12',
          name: 'Usuario Regular',
        });

      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${miembroRegister.body.token}`);

      expect(response.status).toBe(403);
    });

    it('deberia permitir al admin crear, suspender y resetear cuentas', async () => {
      const admin = await createAdmin(Date.now());
      const newPassword = 'temporal99';

      const listResponse = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(listResponse.status).toBe(200);
      expect(Array.isArray(listResponse.body.users)).toBe(true);

      const createResponse = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          email: `miembro-admin-${Date.now()}@example.com`,
          password: 'secret12',
          name: 'Miembro Manual',
          company: 'Broke Shop',
          role: 'user',
        });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.user.role).toBe('user');
      expect(createResponse.body.user.active).toBe(true);
      expect(createResponse.body.user.approved).toBe(true);

      const suspendedResponse = await request(app)
        .patch(`/api/admin/users/${createResponse.body.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ active: false });

      expect(suspendedResponse.status).toBe(200);
      expect(suspendedResponse.body.user.active).toBe(false);

      const blockedLogin = await request(app)
        .post('/api/auth/login')
        .send({
          email: createResponse.body.user.email,
          password: 'secret12',
        });

      expect(blockedLogin.status).toBe(403);
      expect(blockedLogin.body.error).toMatch(/suspendido/i);

      const reactivatedResponse = await request(app)
        .patch(`/api/admin/users/${createResponse.body.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ active: true, approved: true });

      expect(reactivatedResponse.status).toBe(200);
      expect(reactivatedResponse.body.user.active).toBe(true);

      const passwordReset = await request(app)
        .post(`/api/admin/users/${createResponse.body.user.id}/reset-password`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ password: newPassword });

      expect(passwordReset.status).toBe(200);
      expect(passwordReset.body.ok).toBe(true);

      const oldPasswordLogin = await request(app)
        .post('/api/auth/login')
        .send({
          email: createResponse.body.user.email,
          password: 'secret12',
        });

      expect(oldPasswordLogin.status).toBe(401);

      const newPasswordLogin = await request(app)
        .post('/api/auth/login')
        .send({
          email: createResponse.body.user.email,
          password: newPassword,
        });

      expect(newPasswordLogin.status).toBe(200);

      const meResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${newPasswordLogin.body.token}`);

      expect(meResponse.status).toBe(200);
      expect(meResponse.body.email).toBe(createResponse.body.user.email);
    });
  });

  describe('Memoria y operaciones sensibles', () => {
    it('deberia exigir auth para memoria y bloquear acceso cruzado entre usuarios', async () => {
      const unauth = await request(app).get('/api/memoria/cotizaciones');
      expect(unauth.status).toBe(401);

      const userA = await createUser(Date.now());
      const userB = await createUser(Date.now() + 1);

      const saveContext = await request(app)
        .post('/api/memoria/contexto')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          usuario_id: userA.id,
          tipo_importador: 'general',
          margen_preferido: 32,
          canal_preferido: 'AEREO',
          pais_preferido: 'CN',
        });

      expect(saveContext.status).toBe(200);

      const ownContext = await request(app)
        .get(`/api/memoria/contexto/${userA.id}`)
        .set('Authorization', `Bearer ${userA.token}`);

      expect(ownContext.status).toBe(200);
      expect(ownContext.body.tipo_importador).toBe('general');

      const crossContext = await request(app)
        .get(`/api/memoria/contexto/${userA.id}`)
        .set('Authorization', `Bearer ${userB.token}`);

      expect(crossContext.status).toBe(403);
      expect(crossContext.body.error).toMatch(/otro usuario/i);
    });

    it('deberia reservar auto-repair y reset logistica para admin', async () => {
      const admin = await createAdmin(Date.now());
      const member = await createUser(Date.now() + 1);

      const memberStats = await request(app)
        .get('/api/auto-repair/stats')
        .set('Authorization', `Bearer ${member.token}`);

      expect(memberStats.status).toBe(403);

      const adminStats = await request(app)
        .get('/api/auto-repair/stats')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(adminStats.status).toBe(200);

      const memberReset = await request(app)
        .post('/api/logistica/reset/shippo')
        .set('Authorization', `Bearer ${member.token}`);

      expect(memberReset.status).toBe(403);

      const adminReset = await request(app)
        .post('/api/logistica/reset/shippo')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(adminReset.status).toBe(200);
      expect(adminReset.body.ok).toBeDefined();
    });
  });

  describe('POST /api/agente/calcular', () => {
    it('deberia exigir autenticacion para cotizar', async () => {
      const response = await request(app)
        .post('/api/agente/calcular')
        .send({
          items: [{ desc: 'camisetas de algodon', qty: 500, unit: 3.5 }],
          pais: 'CN',
          canal: 'COURIER',
          incoterm: 'FOB',
          tipoImportador: 'general',
          margenVenta: 30,
          moneda: 'USD',
        });

      expect(response.status).toBe(401);
    });

    it('deberia guardar la cotizacion autenticada y reflejarla en el dashboard', async () => {
      const admin = await createAdmin(Date.now());
      db.run('DELETE FROM quotations');
      dashboardService.limpiarCache();

      const response = await request(app)
        .post('/api/agente/calcular')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          items: [{ desc: 'audifonos bluetooth', qty: 100, unit: 12.5 }],
          pais: 'CN',
          canal: 'COURIER',
          incoterm: 'FOB',
          tipoImportador: 'general',
          margenVenta: 30,
          moneda: 'USD',
        });

      expect(response.status).toBe(200);
      expect(response.body.exito).toBe(true);
      expect(response.body.quotationId).toBeDefined();

      const quotations = db.listQuotations(admin.id);
      expect(quotations).toHaveLength(1);

      const dashboardResponse = await request(app)
        .get('/api/dashboard?scope=mine')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(dashboardResponse.status).toBe(200);
      expect(dashboardResponse.body.meta?.hayDatos).toBe(true);
      expect(dashboardResponse.body.kpis.totalCotizaciones.valor).toBe(1);
    });

    it('deberia aceptar el caso benchmark avanzado sin romper compatibilidad', async () => {
      const user = await createUser(Date.now());
      const response = await request(app)
        .post('/api/agente/calcular')
        .set('Authorization', `Bearer ${user.token}`)
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
      const user = await createUser(Date.now());
      const inicio = await request(app)
        .post('/api/agente-0/iniciar')
        .set('Authorization', `Bearer ${user.token}`);
      expect(inicio.status).toBe(200);
      expect(inicio.body.paso).toBe('productos');

      const productos = await request(app)
        .post('/api/agente-0/chat')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          mensaje: '500 camisetas de algodon',
          contexto: inicio.body.contexto,
        });

      expect(productos.status).toBe(200);
      expect(productos.body.paso).toBe('pais_origen');

      const pais = await request(app)
        .post('/api/agente-0/chat')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          mensaje: 'China',
          contexto: productos.body.contexto,
        });

      expect(pais.status).toBe(200);
      expect(pais.body.paso).toBe('tipo_sujeto');

      const sujeto = await request(app)
        .post('/api/agente-0/chat')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          mensaje: 'Empresa',
          contexto: pais.body.contexto,
        });

      expect(sujeto.status).toBe(200);
      expect(sujeto.body.paso).toBe('canal');

      const canal = await request(app)
        .post('/api/agente-0/chat')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          mensaje: 'Aereo',
          contexto: sujeto.body.contexto,
        });

      expect(canal.status).toBe(200);
      expect(canal.body.contexto.datos_previos.productos[0].producto).toMatch(/camisetas/i);
      expect(canal.body.contexto.datos_previos.canal).toBe('AEREO');
      expect(canal.body.paso).toBe('objetivo_calculo');
    });
  });

  describe('Carga de documentos', () => {
    it('deberia responder 422 para .doc legacy en vez de 500', async () => {
      const user = await createUser(Date.now());
      const response = await request(app)
        .post('/api/auto-cotizar/extraer')
        .set('Authorization', `Bearer ${user.token}`)
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
    it('deberia retornar analisis con autenticacion', async () => {
      const user = await createUser(Date.now());
      const response = await request(app)
        .get('/api/dashboard/analisis')
        .set('Authorization', `Bearer ${user.token}`);

      expect(response.status).toBe(200);
      expect(response.body.analisis).toBeDefined();
    });
  });

  describe('GET /api/logistica/empresas', () => {
    it('deberia retornar empresas configuradas', async () => {
      const user = await createUser(Date.now());
      const response = await request(app)
        .get('/api/logistica/empresas')
        .set('Authorization', `Bearer ${user.token}`);

      expect(response.status).toBe(200);
      expect(response.body.couriers).toBeDefined();
      expect(response.body.navieras).toBeDefined();
    });
  });

  describe('GET /api/logistica/contingencia', () => {
    it('deberia retornar estado de contingencia', async () => {
      const admin = await createAdmin(Date.now());
      const response = await request(app)
        .get('/api/logistica/contingencia')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(response.status).toBe(200);
      expect(response.body.total_usos).toBeDefined();
    });
  });

  describe('POST /api/logistica/cotizar', () => {
    it('deberia cotizar con todos los couriers', async () => {
      const user = await createUser(Date.now());
      const datos = {
        origen: 'US',
        destino: 'PE',
        peso: 50,
        dimensiones: { largo: 100, ancho: 50, alto: 50 },
        valor: 1000,
      };

      const response = await request(app)
        .post('/api/logistica/cotizar')
        .set('Authorization', `Bearer ${user.token}`)
        .send(datos);

      expect(response.status).toBe(200);
      expect(response.body.couriers).toBeDefined();
      expect(response.body.navieras).toBeDefined();
    });

    it('deberia retornar error sin datos requeridos', async () => {
      const user = await createUser(Date.now());
      const response = await request(app)
        .post('/api/logistica/cotizar')
        .set('Authorization', `Bearer ${user.token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/dashboard/chat', () => {
    it('deberia responder preguntas autenticadas', async () => {
      const user = await createUser(Date.now());
      const response = await request(app)
        .post('/api/dashboard/chat')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ pregunta: 'Cual es el total de cotizaciones?' });

      expect(response.status).toBe(200);
      expect(response.body.respuesta).toBeDefined();
    });
  });
});
