const helpers = require('../../client/src/admin-state-helpers.cjs');

describe('utilidades de estado admin', () => {
  it('normaliza el formulario admin antes de enviarlo al backend', () => {
    const payload = helpers.normalizeAdminFormPayload({
      email: '  MIXED@Example.COM ',
      password: '  secret temp  ',
      name: '  Billy  ',
      company: '  Broke Shop  ',
      ruc: '  12345678901  ',
      role: ' ADMIN ',
    });

    expect(payload).toEqual({
      email: 'mixed@example.com',
      password: '  secret temp  ',
      name: 'Billy',
      company: 'Broke Shop',
      ruc: '12345678901',
      role: 'admin',
    });
  });

  it('fusiona listas admin sin duplicar usuarios por id o email', () => {
    const merged = helpers.mergeAdminUsers(
      [
        { id: 1, email: 'uno@correo.com', name: 'Uno' },
        { email: 'dos@correo.com', name: 'Dos local' },
      ],
      [
        { id: 1, email: 'uno@correo.com', name: 'Uno remoto' },
        { email: 'dos@correo.com', name: 'Dos remoto' },
        { id: 3, email: 'tres@correo.com', name: 'Tres' },
      ],
    );

    expect(merged).toEqual([
      { id: 1, email: 'uno@correo.com', name: 'Uno remoto' },
      { email: 'dos@correo.com', name: 'Dos remoto' },
      { id: 3, email: 'tres@correo.com', name: 'Tres' },
    ]);
  });

  it('normaliza un estado remoto sin arrastrar usuarios que ya no vienen del backend', () => {
    const normalizedUsers = helpers.normalizeAdminUsers([
      { id: 2, email: 'dos@correo.com', name: 'Dos remoto' },
      { id: 2, email: 'dos@correo.com', name: 'Duplicado remoto' },
      { email: 'tres@correo.com', name: 'Tres remoto' },
    ]);

    expect(normalizedUsers).toEqual([
      { id: 2, email: 'dos@correo.com', name: 'Dos remoto' },
      { email: 'tres@correo.com', name: 'Tres remoto' },
    ]);
    expect(typeof helpers.normalizeAdminUsers).toBe('function');
    expect(helpers.snapshotAdminUsers).toBeUndefined();
  });

  it('hace upsert del usuario actualizado y lo agrega si no estaba en pantalla', () => {
    const updated = helpers.upsertAdminUser(
      [{ id: 1, email: 'uno@correo.com', active: true }],
      { id: 2, email: 'dos@correo.com', active: false },
    );

    expect(updated).toEqual([
      { id: 2, email: 'dos@correo.com', active: false },
      { id: 1, email: 'uno@correo.com', active: true },
    ]);

    const replaced = helpers.upsertAdminUser(updated, { id: 1, email: 'uno@correo.com', active: false });
    expect(replaced).toEqual([
      { id: 2, email: 'dos@correo.com', active: false },
      { id: 1, email: 'uno@correo.com', active: false },
    ]);
  });

  it('detecta respuestas admin anteriores cuando cambia la solicitud o hubo mutacion local', () => {
    expect(
      helpers.isStaleAdminResponse({
        requestId: 1,
        latestRequestId: 2,
        mutationVersion: 0,
        latestMutationVersion: 0,
      }),
    ).toBe(true);

    expect(
      helpers.isStaleAdminResponse({
        requestId: 2,
        latestRequestId: 2,
        mutationVersion: 1,
        latestMutationVersion: 2,
      }),
    ).toBe(true);

    expect(
      helpers.isStaleAdminResponse({
        requestId: 3,
        latestRequestId: 3,
        mutationVersion: 4,
        latestMutationVersion: 4,
      }),
    ).toBe(false);
  });

  it('distingue entre carga, error y vacio real en la lista admin', () => {
    expect(
      helpers.buildAdminUsersView({
        users: [],
        isLoading: true,
        error: null,
      }),
    ).toMatchObject({
      hasUsers: false,
      showLoadingState: true,
      showErrorState: false,
      showEmptyState: false,
      loadingMessage: 'Cargando miembros registrados...',
    });

    expect(
      helpers.buildAdminUsersView({
        users: [],
        isLoading: false,
        error: 'No pude cargar usuarios',
      }),
    ).toMatchObject({
      hasUsers: false,
      showLoadingState: false,
      showErrorState: true,
      showEmptyState: false,
      errorMessage: 'No pude cargar usuarios',
    });

    expect(
      helpers.buildAdminUsersView({
        users: [],
        isLoading: false,
        error: null,
      }),
    ).toMatchObject({
      hasUsers: false,
      showLoadingState: false,
      showErrorState: false,
      showEmptyState: true,
      emptyMessage: 'Todavia no hay mas miembros registrados. Usa el formulario para crear la primera cuenta manual.',
    });
  });
});
