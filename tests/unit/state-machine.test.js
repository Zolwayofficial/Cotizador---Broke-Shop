const StateMachine = require('../../server/state-machine');

describe('StateMachine', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('reintenta nodos segun sus propios intentos y no por iteracion global', async () => {
    const machine = new StateMachine({ name: 'retry-flow', initialState: 'start' });
    const flaky = jest.fn()
      .mockRejectedValueOnce(new Error('fallo temporal'))
      .mockResolvedValueOnce({ paso: 'ok' });

    machine
      .addNode('start', async () => ({ inicio: true }))
      .addNode('procesar', flaky, { onError: 'retry', retries: 1 });
    machine.addEdge('start', 'procesar');

    const result = await machine.execute({});

    expect(flaky).toHaveBeenCalledTimes(2);
    expect(result.result).toMatchObject({ inicio: true, paso: 'ok' });
  });

  test('usa fallback configurado cuando un nodo falla', async () => {
    const machine = new StateMachine({ name: 'fallback-flow', initialState: 'start' });

    machine
      .addNode('start', async () => ({}))
      .addNode('principal', async () => {
        throw new Error('sin servicio');
      }, { onError: 'fallback', fallback: 'respaldo' })
      .addNode('respaldo', async () => ({ fuente: 'fallback' }));

    machine.addEdge('start', 'principal');

    const result = await machine.execute({});

    expect(result.result.fuente).toBe('fallback');
    expect(result.history.some((entry) => entry.node === 'principal' && entry.status === 'error')).toBe(true);
    expect(result.history.some((entry) => entry.node === 'respaldo' && entry.status === 'success')).toBe(true);
  });

  test('rechaza handlers no ejecutables y resultados primitivos no interpretables', async () => {
    const machine = new StateMachine({ name: 'invalid-flow', initialState: 'start' });

    expect(() => machine.addNode('start', null)).toThrow(/Handler no ejecutable/);

    machine.addNode('start', async () => 'texto');

    await expect(machine.execute({})).rejects.toThrow(/resultado no interpretable/);
  });

  test('normaliza timeout, retries y maxIterations fuera de rango', async () => {
    const machine = new StateMachine({
      name: 'normalized-flow',
      initialState: 'start',
      maxIterations: -1,
    });

    machine.addNode('start', async () => ({ ok: true }), {
      retries: -4,
      timeout: 0,
    });

    expect(machine.maxIterations).toBe(50);
    expect(machine.nodes.start.retries).toBe(0);
    expect(machine.nodes.start.timeout).toBe(30000);

    const result = await machine.execute({});

    expect(result.result.ok).toBe(true);
    expect(result.iterations).toBe(1);
  });

  test('no toma una transicion condicional si ninguna coincide', async () => {
    const machine = new StateMachine({ name: 'conditional-flow', initialState: 'start' });

    machine
      .addNode('start', async () => ({ inicio: true }))
      .addNode('destino', async () => ({ destino: true }));

    machine.addEdge('start', 'destino', () => false);

    const result = await machine.execute({});

    expect(result.result).toEqual({ inicio: true });
    expect(result.history).toHaveLength(1);
    expect(result.history[0].node).toBe('start');
  });
});
