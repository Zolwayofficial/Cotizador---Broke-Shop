// server/state-machine.js - Maquina de Estados para Flujos Multi-Agente
//
// IMPLEMENTACION DEL PATRON LANGRAPH (Enterprise-Grade 2026)
//
// Ventajas:
// - Deterministico (mismo input -> mismo output)
// - Testeable sin llamar al LLM
// - Debuggable (visualizar grafo)
// - Reintentos automaticos por nodo
// - Observabilidad completa

const EventEmitter = require('events');

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toNonNegativeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

class StateMachine extends EventEmitter {
  constructor(config = {}) {
    super();
    this.name = config.name;
    this.nodes = config.nodes || {};
    this.edges = config.edges || {};
    this.initialState = config.initialState || 'start';
    this.context = {};
    this.executionHistory = [];
    this.maxIterations = toPositiveInteger(config.maxIterations, 50);
  }

  // ===================================================
  // DEFINIR NODOS (pasos de procesamiento)
  // ===================================================
  addNode(name, handler, options = {}) {
    if (typeof handler !== 'function') {
      throw new Error(`Handler no ejecutable para nodo "${name}"`);
    }

    this.nodes[name] = {
      handler,
      retries: toNonNegativeInteger(options.retries, 0),
      timeout: toPositiveInteger(options.timeout, 30000),
      onError: options.onError || 'abort',
      fallback: options.fallback || null,
    };
    return this;
  }

  // ===================================================
  // DEFINIR EDGES (transiciones entre nodos)
  // ===================================================
  addEdge(from, to, condition = null) {
    if (!this.edges[from]) {
      this.edges[from] = [];
    }

    this.edges[from].push({
      to,
      condition,
    });

    return this;
  }

  // ===================================================
  // EJECUTAR FLUJO COMPLETO
  // ===================================================
  async execute(initialContext) {
    const startTime = Date.now();
    const safeInitialContext =
      initialContext && typeof initialContext === 'object' && !Array.isArray(initialContext)
        ? initialContext
        : {};
    const retryCounts = new Map();

    this.context = { ...safeInitialContext };
    this.executionHistory = [];

    let currentNode = this.initialState;
    let iterations = 0;

    this.emit('start', { context: this.context });

    while (currentNode && iterations < this.maxIterations) {
      iterations++;
      const nodeStart = Date.now();

      try {
        const node = this.nodes[currentNode];
        if (!node) {
          throw new Error(`Nodo "${currentNode}" no existe`);
        }

        this.emit('node:start', {
          node: currentNode,
          context: this.context,
          iteration: iterations,
        });

        const result = await this._executeNodeWithTimeout(currentNode, node);

        if (result !== undefined && result !== null) {
          if (typeof result !== 'object' || Array.isArray(result)) {
            throw new Error(`Nodo "${currentNode}" devolvio un resultado no interpretable`);
          }
          this.context = { ...this.context, ...result };
        }

        retryCounts.delete(currentNode);

        const nodeDuration = Date.now() - nodeStart;
        this.executionHistory.push({
          node: currentNode,
          iteration: iterations,
          duration: nodeDuration,
          status: 'success',
          timestamp: new Date().toISOString(),
        });

        this.emit('node:success', {
          node: currentNode,
          result: this.context,
          duration: nodeDuration,
        });

        currentNode = this.getNextNode(currentNode);
      } catch (error) {
        const nodeDuration = Date.now() - nodeStart;
        this.executionHistory.push({
          node: currentNode,
          iteration: iterations,
          duration: nodeDuration,
          status: 'error',
          error: error.message,
          timestamp: new Date().toISOString(),
        });

        this.emit('node:error', {
          node: currentNode,
          error,
          context: this.context,
        });

        const node = this.nodes[currentNode];
        if (!node) {
          this.emit('error', { error, context: this.context });
          throw error;
        }

        const retryCount = retryCounts.get(currentNode) || 0;

        if (node.onError === 'retry' && retryCount < node.retries) {
          retryCounts.set(currentNode, retryCount + 1);
          console.log(`[STATE] Reintentando nodo ${currentNode} (intento ${retryCount + 1}/${node.retries})`);
          continue;
        }

        if (node.onError === 'fallback' && node.fallback) {
          console.log(`[STATE] Usando fallback para nodo ${currentNode}`);
          retryCounts.delete(currentNode);
          currentNode = node.fallback;
          continue;
        }

        this.emit('error', { error, context: this.context });
        throw error;
      }
    }

    if (iterations >= this.maxIterations) {
      const error = new Error(`Maximo de iteraciones alcanzado (${this.maxIterations})`);
      this.emit('error', { error, context: this.context });
      throw error;
    }

    const totalDuration = Date.now() - startTime;
    this.emit('complete', {
      result: this.context,
      duration: totalDuration,
      iterations,
      history: this.executionHistory,
    });

    return {
      result: this.context,
      duration: totalDuration,
      iterations,
      history: this.executionHistory,
    };
  }

  // ===================================================
  // DETERMINAR SIGUIENTE NODO
  // ===================================================
  getNextNode(currentNode) {
    const edges = this.edges[currentNode];
    if (!edges || edges.length === 0) {
      return null;
    }

    let fallbackEdge = null;
    for (const edge of edges) {
      if (!edge.condition) {
        fallbackEdge = fallbackEdge || edge;
        continue;
      }

      try {
        if (edge.condition(this.context)) {
          return edge.to;
        }
      } catch (error) {
        console.error(`[STATE] Error evaluando condicion: ${error.message}`);
      }
    }

    return fallbackEdge ? fallbackEdge.to : null;
  }

  // ===================================================
  // VISUALIZAR GRAFO (para debugging)
  // ===================================================
  visualize() {
    console.log(`\nGRAFO: ${this.name}`);
    console.log('='.repeat(50));

    console.log('\nNODOS:');
    Object.keys(this.nodes).forEach((node) => {
      const config = this.nodes[node];
      console.log(`  |- ${node} (timeout: ${config.timeout}ms, retries: ${config.retries})`);
    });

    console.log('\nEDGES:');
    Object.keys(this.edges).forEach((from) => {
      this.edges[from].forEach((edge) => {
        const condition = edge.condition ? ' [condicional]' : '';
        console.log(`  |- ${from} -> ${edge.to}${condition}`);
      });
    });

    console.log('='.repeat(50));
  }

  // ===================================================
  // EXPORTAR HISTORIAL DE EJECUCION
  // ===================================================
  getExecutionReport() {
    return {
      name: this.name,
      totalNodes: Object.keys(this.nodes).length,
      totalEdges: Object.values(this.edges).reduce((sum, edges) => sum + edges.length, 0),
      executionHistory: this.executionHistory,
      summary: {
        totalIterations: this.executionHistory.length,
        successfulNodes: this.executionHistory.filter((h) => h.status === 'success').length,
        failedNodes: this.executionHistory.filter((h) => h.status === 'error').length,
        totalDuration: this.executionHistory.reduce((sum, h) => sum + h.duration, 0),
      },
    };
  }

  async _executeNodeWithTimeout(currentNode, node) {
    let timeoutId;
    try {
      return await Promise.race([
        Promise.resolve().then(() => node.handler(this.context)),
        new Promise((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error(`Timeout en nodo ${currentNode}`)),
            node.timeout
          );
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}

module.exports = StateMachine;
