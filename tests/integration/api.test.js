const { describe, it, expect, beforeAll, afterAll } = require('@jest/globals');
const request = require('supertest');
const db = require('../../server/db');
const dashboardService = require('../../server/dashboard/dashboard-service');
const monitorService = require('../../server/monitor/monitor-service');
const benchmarkCase = require('../../server/benchmarks/fixtures/ksarp-pc1.case.json');
const { version: APP_VERSION } = require('../../package.json');

jest.setTimeout(15000);

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
      expect(response.body.version).toBe(APP_VERSION);
      expect(response.body.version).not.toBe('2.0');
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
    }, 30000);
  });

  describe('GET /api/flete/usage', () => {
    it('deberia exponer el snapshot de cuota diaria local para administradores', async () => {
      const admin = await createAdmin(Date.now());
      const response = await request(app)
        .get('/api/flete/usage')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(response.status).toBe(200);
    expect(response.body.trackingmore).toEqual(expect.objectContaining({
      enabled: expect.any(Boolean),
      count: expect.any(Number),
      limit: expect.any(Number),
      date: expect.any(String),
      nota: expect.any(String),
    }));
    expect(response.body.trackingmore.limit).toBeGreaterThan(0);
    expect(response.body.nota).toMatch(/cuota diaria local/i);
    expect(response.body.tip).toMatch(/disponible con cuota diaria local rastreada|para usar TrackingMore/i);
    expect(response.body.tip).not.toMatch(/habilitado/i);
  });
});

  describe('Fletes', () => {
    it('deberia mantener una nota honesta para el estimador referencial', async () => {
      const user = await createUser(Date.now());
      const previousTrackingMoreKey = process.env.TRACKINGMORE_API_KEY;
      const previousSeaRatesKey = process.env.SEARATES_API_KEY;

      delete process.env.TRACKINGMORE_API_KEY;
      delete process.env.SEARATES_API_KEY;

      try {
        const response = await request(app)
          .post('/api/flete/estimar')
          .set('Authorization', `Bearer ${user.token}`)
          .send({
            origen: 'CN',
            destino: 'PE',
            canal: 'AEREO',
            pesoKg: 15,
            valorFOB: 850,
          });

        expect(response.status).toBe(200);
        expect(response.body.nota).toBe('Tarifa referencial de mercado. Solicitar cotizacion formal a freight forwarder.');
        expect(response.body.nota).not.toContain('Tarifa de API real');
        expect(response.body.nota).not.toContain('Subjecto');
      } finally {
        if (previousTrackingMoreKey === undefined) {
          delete process.env.TRACKINGMORE_API_KEY;
        } else {
          process.env.TRACKINGMORE_API_KEY = previousTrackingMoreKey;
        }

        if (previousSeaRatesKey === undefined) {
          delete process.env.SEARATES_API_KEY;
        } else {
          process.env.SEARATES_API_KEY = previousSeaRatesKey;
        }
      }
    });

    it('deberia exponer notas limpias y sin typos en /api/flete/tarifas', async () => {
      const user = await createUser(Date.now());
      const response = await request(app)
        .get('/api/flete/tarifas')
        .set('Authorization', `Bearer ${user.token}`);

      expect(response.status).toBe(200);
      expect(response.body.nota).toBe('Tarifas referenciales de mercado. Sujetas a cambio sin previo aviso.');
      expect(response.body.nota).not.toContain('Subjecto');
    });
  });

  describe('GET /api/logistica/prioridad', () => {
    it('deberia exponer prioridad sin vender couriers ilimitados', async () => {
      const admin = await createAdmin(Date.now());
      const response = await request(app)
        .get('/api/logistica/prioridad')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      const packsend = response.body.find((courier) => courier.nombre === 'Pack & Send');
      const shippo = response.body.find((courier) => courier.nombre === 'Shippo');

      expect(packsend).toEqual(expect.objectContaining({
        cuotaLocalRastreada: false,
      }));
      expect(packsend).not.toHaveProperty('ilimitado');

      expect(shippo).toEqual(expect.objectContaining({
        cuotaLocalRastreada: true,
      }));
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
        expect(response.body.error).toBe('El alta publica no esta disponible. Solo el administrador puede autorizar nuevas cuentas.');
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

    it('deberia rechazar booleanos fuera de formato al crear o actualizar usuarios admin', async () => {
      const admin = await createAdmin(Date.now());

      const createResponse = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          email: `miembro-bool-${Date.now()}@example.com`,
          password: 'secret12',
          name: 'Miembro Bool',
          active: 'quizas',
        });

      expect(createResponse.status).toBe(400);
      expect(createResponse.body.error).toMatch(/active debe ser booleano/i);

      const created = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          email: `miembro-ok-${Date.now()}@example.com`,
          password: 'secret12',
          name: 'Miembro Ok',
          active: true,
          approved: true,
        });

      expect(created.status).toBe(201);

      const updateResponse = await request(app)
        .patch(`/api/admin/users/${created.body.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ approved: 'quizas' });

      expect(updateResponse.status).toBe(400);
      expect(updateResponse.body.error).toMatch(/approved debe ser booleano/i);
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

    it('deberia normalizar identidad propia y rechazar payloads fuera de contrato en memoria y embeddings', async () => {
      const user = await createUser(Date.now());

      const ownQuotes = await request(app)
        .get('/api/memoria/cotizaciones')
        .query({ usuario_id: `  ${user.id}  ` })
        .set('Authorization', `Bearer ${user.token}`);

      expect(ownQuotes.status).toBe(200);

      const suscripcion = await request(app)
        .post('/api/alertas/suscribir')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          email: `  ${String(user.email).toUpperCase()}  `,
          tipos: [],
        });

      expect(suscripcion.status).toBe(200);
      expect(suscripcion.body.mensaje).toBe('Suscripcion registrada');

      const memoriaPayload = await request(app)
        .post('/api/memoria/cotizacion')
        .set('Authorization', `Bearer ${user.token}`)
        .send([]);

      expect(memoriaPayload.status).toBe(400);

      const memoriaBuscar = await request(app)
        .post('/api/memoria/buscar')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          query: 'iphone',
          topK: 0,
        });

      expect(memoriaBuscar.status).toBe(400);
      expect(memoriaBuscar.body.error).toBe('topK fuera de rango');

      const embeddingGenerate = await request(app)
        .post('/api/embeddings/generate')
        .set('Authorization', `Bearer ${user.token}`)
        .send([]);

      expect(embeddingGenerate.status).toBe(400);

      const embeddingSearch = await request(app)
        .post('/api/embeddings/search')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          query: 'iphone',
          documentos: [],
          topK: 0,
        });

      expect(embeddingSearch.status).toBe(400);
      expect(embeddingSearch.body.error).toBe('topK fuera de rango');
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
      expect(response.body.procesado).toBe(true);
      expect(response.body.exito).toBeUndefined();
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
      expect(response.body.procesado).toBe(true);
      expect(response.body.exito).toBeUndefined();
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

    it('deberia responder 422 tambien en /api/agente/extraer para .doc legacy', async () => {
      const user = await createUser(Date.now());
      const response = await request(app)
        .post('/api/agente/extraer')
        .set('Authorization', `Bearer ${user.token}`)
        .attach('file', Buffer.from('legacy doc'), {
          filename: 'proveedor.doc',
          contentType: 'application/msword',
        });

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('legacy_doc_unsupported');
    });
  });

  describe('Legacy auto-cotizar y exportacion', () => {
    it('deberia rechazar payloads basura en las rutas legacy de auto-cotizar', async () => {
      const user = await createUser(Date.now());

      const calcularResponse = await request(app)
        .post('/api/auto-cotizar/calcular')
        .set('Authorization', `Bearer ${user.token}`)
        .send([]);

      expect(calcularResponse.status).toBe(400);
      expect(calcularResponse.body.error).toMatch(/payload debe ser un objeto/i);

      const directoResponse = await request(app)
        .post('/api/auto-cotizar/directo')
        .set('Authorization', `Bearer ${user.token}`)
        .send([]);

      expect(directoResponse.status).toBe(400);
      expect(directoResponse.body.error).toMatch(/payload debe ser un objeto/i);
    });

    it('deberia rechazar payload no objeto al exportar excel', async () => {
      const user = await createUser(Date.now());

      const response = await request(app)
        .post('/api/exportar/excel')
        .set('Authorization', `Bearer ${user.token}`)
        .send([]);

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/payload debe ser un objeto/i);
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
      expect(response.body.modelo).toBe('llama-3.1-8b-instant');
      expect(response.body.modelo).not.toMatch(/ilimitado/i);
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
      expect(response.body.detalle.packsend.limite).toBe('Sin cuota local');
      expect(response.body.detalle.packsend.porcentaje).toBeNull();
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

  describe('Contratos numericos y payloads de guardado', () => {
    it('deberia aceptar coma decimal en incoterms y sensibilidad TC', async () => {
      const user = await createUser(Date.now());

      const incotermResponse = await request(app)
        .post('/api/incoterms/ajustar')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          precio: '100,5',
          incoterm: 'FOB',
          flete: '12,5',
          seguro: '3,5',
        });

      expect(incotermResponse.status).toBe(200);
      expect(incotermResponse.body.fob).toBeCloseTo(100.5, 5);
      expect(incotermResponse.body.flete).toBeCloseTo(12.5, 5);
      expect(incotermResponse.body.seguro).toBeCloseTo(3.5, 5);

      const sensibilidadResponse = await request(app)
        .post('/api/sensibilidad-tc')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          totalUSD: '100',
          tc: '3,5',
          variaciones: [0],
        });

      expect(sensibilidadResponse.status).toBe(200);
      expect(sensibilidadResponse.body[0].tc).toBeCloseTo(3.5, 5);
      expect(sensibilidadResponse.body[0].totalPEN).toBeCloseTo(350, 5);
    });

    it('deberia devolver 400 para sensibilidad TC fuera de rango y payloads basura en guardado', async () => {
      const user = await createUser(Date.now());

      const sensibilidadFueraDeContrato = await request(app)
        .post('/api/sensibilidad-tc')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          totalUSD: '100',
          tc: '',
        });

      expect(sensibilidadFueraDeContrato.status).toBe(400);
      expect(sensibilidadFueraDeContrato.body.error).toBe('totalUSD y tc numericos requeridos');

      const quotationResponse = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${user.token}`)
        .send([]);

      expect(quotationResponse.status).toBe(400);

      const productResponse = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${user.token}`)
        .send([]);

      expect(productResponse.status).toBe(400);

      const agentePayloadFueraDeContrato = await request(app)
        .post('/api/agente/calcular')
        .set('Authorization', `Bearer ${user.token}`)
        .send([]);

      expect(agentePayloadFueraDeContrato.status).toBe(400);
    });

    it('deberia parsear numeros de regimenes con coma decimal', async () => {
      const user = await createUser(Date.now());

      const admisionResponse = await request(app)
        .post('/api/regimenes/admision-temporal')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          cif: '1000,5',
          adValorem: '40,5',
          isc: '0',
          igv: '180,09',
          ipm: '22,51',
          plazoMeses: '6',
        });

      expect(admisionResponse.status).toBe(200);
      expect(admisionResponse.body.tributosASuspender).toBeCloseTo(243.1, 1);
      expect(admisionResponse.body.plazoMaximo).toMatch(/6 meses/);

      const perfeccionamientoResponse = await request(app)
        .post('/api/regimenes/perfeccionamiento-pasivo')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          valorOriginal: '2000,5',
          costoReparacion: '100,5',
          adValoremPct: '4',
        });

      expect(perfeccionamientoResponse.status).toBe(200);
      expect(perfeccionamientoResponse.body.valorOriginal).toBeCloseTo(2000.5, 5);
      expect(perfeccionamientoResponse.body.tributos.adValorem).toBeCloseTo(4.02, 2);

      const drawbackResponse = await request(app)
        .post('/api/regimenes/drawback')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          fobExportacion: '1000,5',
          insumosImportados: '400,2',
        });

      expect(drawbackResponse.status).toBe(200);
      expect(drawbackResponse.body.fobExportacion).toBeCloseTo(1000.5, 5);
      expect(drawbackResponse.body.insumosImportados).toBeCloseTo(400.2, 5);

      const drawbackFueraDeRango = await request(app)
        .post('/api/regimenes/drawback')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          fobExportacion: '0',
        });

      expect(drawbackFueraDeRango.status).toBe(400);
    });
  });

  describe('Controles estrictos de rutas auxiliares', () => {
    it('deberia devolver 400 para payloads fuera de contrato en TLC, valoracion, IA, flete y chat', async () => {
      const user = await createUser(Date.now());

      const tlcResponse = await request(app)
        .post('/api/tlc/batch')
        .set('Authorization', `Bearer ${user.token}`)
        .send({});

      expect(tlcResponse.status).toBe(400);

      const valoracionResponse = await request(app)
        .post('/api/valoracion/analizar')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          hs: '8517130000',
          fobUnitario: '',
          pesoKg: '2',
        });

      expect(valoracionResponse.status).toBe(400);
      expect(valoracionResponse.body.error).toBe('hs requerido; fobUnitario y pesoKg deben ser numericos positivos');

      const riesgoResponse = await request(app)
        .get('/api/valoracion/riesgo/8517130000/foo/2/CN')
        .set('Authorization', `Bearer ${user.token}`);

      expect(riesgoResponse.status).toBe(400);
      expect(riesgoResponse.body.error).toBe('fob y peso deben ser numericos positivos');

      const aiResponse = await request(app)
        .post('/api/ai/classify')
        .set('Authorization', `Bearer ${user.token}`)
        .send({});

      expect(aiResponse.status).toBe(400);

      const fleteResponse = await request(app)
        .post('/api/flete/estimar')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          origen: 'CN',
          canal: 'AEREO',
          pesoKg: '0',
        });

      expect(fleteResponse.status).toBe(400);
      expect(fleteResponse.body.error).toBe('origen y canal requeridos; pesoKg debe ser numerico positivo');

      const chatResponse = await request(app)
        .post('/api/agente-0/chat')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          mensaje: { texto: 'hola' },
        });

      expect(chatResponse.status).toBe(400);
    });

    it('deberia rechazar limites fuera de rango en memoria, alertas y limpiezas administrativas', async () => {
      const admin = await createAdmin(Date.now());
      const user = await createUser(Date.now() + 1);

      const memoriaResponse = await request(app)
        .get('/api/memoria/cotizaciones?limite=-5')
        .set('Authorization', `Bearer ${user.token}`);

      expect(memoriaResponse.status).toBe(400);
      expect(memoriaResponse.body.error).toBe('limite fuera de rango');

      const alertasResponse = await request(app)
        .get('/api/alertas?page=-1&limit=0')
        .set('Authorization', `Bearer ${user.token}`);

      expect(alertasResponse.status).toBe(400);

      const alertaInexistente = await request(app)
        .post('/api/alertas/leida/no-existe')
        .set('Authorization', `Bearer ${user.token}`);

      expect(alertaInexistente.status).toBe(404);

      const suscripcionFueraDeContrato = await request(app)
        .post('/api/alertas/suscribir')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          tipos: 'normativa',
        });

      expect(suscripcionFueraDeContrato.status).toBe(400);

      const memoriaLimpiar = await request(app)
        .post('/api/memoria/limpiar')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ dias: -2 });

      expect(memoriaLimpiar.status).toBe(400);
      expect(memoriaLimpiar.body.error).toBe('dias fuera de rango');

      const alertasLimpiar = await request(app)
        .post('/api/alertas/limpiar')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ dias: -10 });

      expect(alertasLimpiar.status).toBe(400);
      expect(alertasLimpiar.body.error).toBe('dias fuera de rango');
    });

    it('deberia conservar confidence 0 en auto-repair y rechazar cleanup fuera de rango', async () => {
      const admin = await createAdmin(Date.now());
      const clave = `confidence-cero-${Date.now()}`;

      const guardarResponse = await request(app)
        .post('/api/auto-repair/knowledge')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          agente: 'auditoria',
          clave,
          valor: { origen: 'test' },
          confianza: 0,
        });

      expect(guardarResponse.status).toBe(200);

      const knowledgeRow = db.get(
        'SELECT confianza FROM agent_knowledge WHERE agente = ? AND clave = ?',
        ['auditoria', `auditoria::${clave}`]
      );

      expect(knowledgeRow.confianza).toBe(0);

      const cleanupFueraDeRango = await request(app)
        .post('/api/auto-repair/cleanup')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ dias: 0 });

      expect(cleanupFueraDeRango.status).toBe(400);
      expect(cleanupFueraDeRango.body.error).toBe('dias fuera de rango');
    });
  });

  describe('Persistencia y contratos de logistica, membresias y exportacion', () => {
    it('deberia rechazar payloads logisticos fuera de contrato y manejar alertas de monitor inexistentes', async () => {
      const admin = await createAdmin(Date.now());
      const user = await createUser(Date.now() + 1);

      const cotizarFueraDeContrato = await request(app)
        .post('/api/logistica/cotizar')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          origen: 'CN',
          destino: 'PE',
          peso: '0',
        });

      expect(cotizarFueraDeContrato.status).toBe(400);

      const whatsappFueraDeContrato = await request(app)
        .post('/api/logistica/cotizar-whatsapp')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          courier: 'dhl',
          datos: 'no-es-objeto',
        });

      expect(whatsappFueraDeContrato.status).toBe(400);

      const dashboardChatFueraDeContrato = await request(app)
        .post('/api/dashboard/chat')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          pregunta: '   ',
        });

      expect(dashboardChatFueraDeContrato.status).toBe(400);

      const nuevaAlerta = monitorService.agregarAlerta('latencia', 'warning', 'Alerta de prueba');

      const marcarAlerta = await request(app)
        .post(`/api/monitor/alertas/${nuevaAlerta.id}/leida`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(marcarAlerta.status).toBe(200);
      expect(marcarAlerta.body.ok).toBe(true);

      const alertaInexistente = await request(app)
        .post('/api/monitor/alertas/999999/leida')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(alertaInexistente.status).toBe(404);

      const alertaIdNoNumerico = await request(app)
        .post('/api/monitor/alertas/nope/leida')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(alertaIdNoNumerico.status).toBe(400);
      expect(alertaIdNoNumerico.body.error).toBe('id debe ser numerico positivo');
    });

    it('deberia persistir pagos de membresia y actualizarlos realmente al marcar pagado', async () => {
      const admin = await createAdmin(Date.now());
      const member = await createUser(Date.now() + 1);

      const membresiaInicial = await request(app)
        .get('/api/membresias/mi-membresia')
        .set('Authorization', `Bearer ${member.token}`);

      expect(membresiaInicial.status).toBe(200);
      expect(membresiaInicial.body.nivel).toBe('GRATIS');

      const pagoResponse = await request(app)
        .post('/api/membresias/pago')
        .set('Authorization', `Bearer ${member.token}`)
        .send({
          monto: '29,99',
          nivel: 'premium',
          periodo: 'mensual',
        });

      expect(pagoResponse.status).toBe(200);
      expect(pagoResponse.body.id).toEqual(expect.any(Number));

      const pagoPendiente = db.get('SELECT estado, fecha_pago FROM pagos_membresia WHERE id = ?', [pagoResponse.body.id]);
      expect(pagoPendiente.estado).toBe('pendiente');
      expect(pagoPendiente.fecha_pago).toBeNull();

      const actualizarPago = await request(app)
        .post(`/api/membresias/pago/${pagoResponse.body.id}/actualizar`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ estado: 'pagado' });

      expect(actualizarPago.status).toBe(200);
      expect(actualizarPago.body.estado).toBe('pagado');

      const pagoActualizado = db.get('SELECT estado, fecha_pago FROM pagos_membresia WHERE id = ?', [pagoResponse.body.id]);
      expect(pagoActualizado.estado).toBe('pagado');
      expect(pagoActualizado.fecha_pago).toBeTruthy();

      const membresiaResponse = await request(app)
        .get('/api/membresias/mi-membresia')
        .set('Authorization', `Bearer ${member.token}`);

      expect(membresiaResponse.status).toBe(200);
      expect(membresiaResponse.body.nivel).toBe('PREMIUM');
    });

    it('deberia aceptar total_landed igual a 0 en exportacion y revisar contratos admin', async () => {
      const admin = await createAdmin(Date.now());

      const exportPdf = await request(app)
        .post('/api/exportar/pdf')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          id: 'demo/0',
          producto: 'muestra sin landed',
          total_landed: 0,
        });

      expect(exportPdf.status).toBe(200);
      expect(exportPdf.headers['content-disposition']).toContain('cotizacion-demo-0.html');

      const generarCodigoFueraDeCatalogo = await request(app)
        .post('/api/membresias/generar-codigo')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          tipo: 'normal',
          usosMaximos: 0,
        });

      expect(generarCodigoFueraDeCatalogo.status).toBe(400);
      expect(generarCodigoFueraDeCatalogo.body.error).toBe('tipo fuera de catalogo o usosMaximos fuera de rango');

      const autoRepairTestFueraDeContrato = await request(app)
        .post('/api/auto-repair/test')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          agente: 'sunat',
          solucion: 'reintento',
        });

      expect(autoRepairTestFueraDeContrato.status).toBe(400);
    });

    it('deberia recortar credenciales de invitacion, revisar booleanos de miembros y devolver 404 al actualizar pagos inexistentes', async () => {
      const base = Date.now();
      const admin = await createAdmin(base);

      const codigoResponse = await request(app)
        .post('/api/membresias/generar-codigo')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ tipo: 'NORMAL', usosMaximos: 1 });

      expect(codigoResponse.status).toBe(200);

      const invitado = await request(app)
        .post('/api/membresias/registro')
        .send({
          email: `  invitado-${base}@example.com  `,
          password: '  secret12  ',
          nombre: '  Invitado literal  ',
          codigoInvitacion: `  ${codigoResponse.body.codigo}  `,
        });

      expect(invitado.status).toBe(200);
      expect(invitado.body.usuario.email).toBe(`invitado-${base}@example.com`);
      expect(invitado.body.usuario.name).toBe('Invitado literal');

      const miembrosActivoCero = await request(app)
        .get('/api/membresias/miembros?activo=0')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(miembrosActivoCero.status).toBe(200);
      expect(Array.isArray(miembrosActivoCero.body)).toBe(true);

      const miembrosActivoFueraDeFormato = await request(app)
        .get('/api/membresias/miembros?activo=quizas')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(miembrosActivoFueraDeFormato.status).toBe(400);
      expect(miembrosActivoFueraDeFormato.body.error).toBe('activo debe ser booleano');

      const pagoInexistente = await request(app)
        .post('/api/membresias/pago/999999/actualizar')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ estado: 'pagado' });

      expect(pagoInexistente.status).toBe(404);
    });

    it('deberia rechazar exportacion auxiliar si la cotizacion no es exportable', async () => {
      const admin = await createAdmin(Date.now());

      for (const endpoint of [
        '/api/exportar/documentacion',
        '/api/exportar/recomendaciones',
        '/api/exportar/apuntes',
      ]) {
        const response = await request(app)
          .post(endpoint)
          .set('Authorization', `Bearer ${admin.token}`)
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/cotizacion incompleta/i);
      }
    });
  });

  describe('Contratos auxiliares y parser numerico compartido', () => {
    it('deberia rechazar payloads fuera de contrato en sanciones, memoria contextual, IA y regimenes', async () => {
      const user = await createUser(Date.now());

      const sancionesResponse = await request(app)
        .post('/api/sanciones/verificar')
        .set('Authorization', `Bearer ${user.token}`)
        .send([]);

      expect(sancionesResponse.status).toBe(400);

      const memoriaContexto = await request(app)
        .post('/api/memoria/contexto')
        .set('Authorization', `Bearer ${user.token}`)
        .send([]);

      expect(memoriaContexto.status).toBe(400);

      const aiExtract = await request(app)
        .post('/api/ai/extract')
        .set('Authorization', `Bearer ${user.token}`)
        .send([]);

      expect(aiExtract.status).toBe(400);

      const regimenResponse = await request(app)
        .post('/api/regimenes/recomendar')
        .set('Authorization', `Bearer ${user.token}`)
        .send([]);

      expect(regimenResponse.status).toBe(400);
    });

    it('deberia revisar variaciones en sensibilidad TC para evitar errores silenciosos', async () => {
      const user = await createUser(Date.now());

      const response = await request(app)
        .post('/api/sensibilidad-tc')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          totalUSD: 1000,
          tc: '3,58',
          variaciones: { porcentaje: 5 },
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/variaciones/i);
    });

    it('deberia normalizar miles y comas en incoterms y drawback', async () => {
      const user = await createUser(Date.now());

      const incotermResponse = await request(app)
        .post('/api/incoterms/ajustar')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          precio: '1.200,50',
          incoterm: 'CIF',
          flete: '100,25',
          seguro: '10,50',
        });

      expect(incotermResponse.status).toBe(200);
      expect(incotermResponse.body.fob).toBeCloseTo(1089.75, 2);
      expect(incotermResponse.body.flete).toBeCloseTo(100.25, 2);
      expect(incotermResponse.body.seguro).toBeCloseTo(10.5, 2);

      const drawbackResponse = await request(app)
        .post('/api/regimenes/drawback')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          fobExportacion: '12.500,75',
          insumosImportados: '6.000,25',
        });

      expect(drawbackResponse.status).toBe(200);
      expect(drawbackResponse.body.fobExportacion).toBeCloseTo(12500.75, 2);
      expect(drawbackResponse.body.insumosImportados).toBeCloseTo(6000.25, 2);
    });
  });
});
