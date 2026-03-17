// server/state-machine.js — Máquina de Estados para Flujos Multi-Agente
// 
// IMPLEMENTACIÓN DEL PATRÓN LANGRAPH (Enterprise-Grade 2026)
//
// Ventajas:
// ✅ Determinístico (mismo input → mismo output)
// ✅ Testeable sin llamar al LLM
// ✅ Debuggable (visualizar grafo)
// ✅ Reintentos automáticos por nodo
// ✅ Observabilidad completa

const EventEmitter = require('events');

class StateMachine extends EventEmitter {
  constructor(config) {
    super();
    this.name = config.name;
    this.nodes = config.nodes || {};
    this.edges = config.edges || {};
    this.initialState = config.initialState || 'start';
    this.context = {};
    this.executionHistory = [];
    this.maxIterations = config.maxIterations || 50;
  }

  // ═══════════════════════════════════════════════════
  // DEFINIR NODOS (pasos de procesamiento)
  // ═══════════════════════════════════════════════════
  addNode(name, handler, options = {}) {
    this.nodes[name] = {
      handler,
      retries: options.retries || 0,
      timeout: options.timeout || 30000,
      onError: options.onError || 'abort' // 'abort' | 'retry' | 'fallback'
    };
    return this;
  }

  // ═══════════════════════════════════════════════════
  // DEFINIR EDGES (transiciones entre nodos)
  // ═══════════════════════════════════════════════════
  addEdge(from, to, condition = null) {
    if (!this.edges[from]) {
      this.edges[from] = [];
    }
    
    this.edges[from].push({
      to,
      condition // Función que decide si ir a este nodo
    });
    
    return this;
  }

  // ═══════════════════════════════════════════════════
  // EJECUTAR FLUJO COMPLETO
  // ═══════════════════════════════════════════════════
  async execute(initialContext) {
    const startTime = Date.now();
    this.context = { ...initialContext };
    this.executionHistory = [];
    
    let currentNode = this.initialState;
    let iterations = 0;
    
    this.emit('start', { context: this.context });
    
    while (currentNode && iterations < this.maxIterations) {
      iterations++;
      const nodeStart = Date.now();
      
      try {
        // Ejecutar nodo actual
        const node = this.nodes[currentNode];
        
        if (!node) {
          throw new Error(`Nodo "${currentNode}" no existe`);
        }
        
        this.emit('node:start', { 
          node: currentNode, 
          context: this.context,
          iteration: iterations 
        });
        
        // Ejecutar handler con timeout
        const result = await Promise.race([
          node.handler(this.context),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Timeout en nodo ${currentNode}`)), node.timeout)
          )
        ]);
        
        // Actualizar contexto con resultado
        if (result) {
          this.context = { ...this.context, ...result };
        }
        
        const nodeDuration = Date.now() - nodeStart;
        
        this.executionHistory.push({
          node: currentNode,
          iteration: iterations,
          duration: nodeDuration,
          status: 'success',
          timestamp: new Date().toISOString()
        });
        
        this.emit('node:success', { 
          node: currentNode, 
          result: this.context,
          duration: nodeDuration 
        });
        
        // Determinar siguiente nodo
        currentNode = this.getNextNode(currentNode);
        
      } catch (error) {
        const nodeDuration = Date.now() - nodeStart;
        
        this.executionHistory.push({
          node: currentNode,
          iteration: iterations,
          duration: nodeDuration,
          status: 'error',
          error: error.message,
          timestamp: new Date().toISOString()
        });
        
        this.emit('node:error', { 
          node: currentNode, 
          error, 
          context: this.context 
        });
        
        // Manejar error según configuración
        const node = this.nodes[currentNode];
        
        if (node.onError === 'retry' && iterations < node.retries) {
          console.log(`[STATE] Reintentando nodo ${currentNode} (intento ${iterations}/${node.retries})`);
          continue; // Reintentar mismo nodo
        } else if (node.onError === 'fallback' && node.fallback) {
          console.log(`[STATE] Usando fallback para nodo ${currentNode}`);
          currentNode = node.fallback;
          continue;
        } else {
          // Abortar
          this.emit('error', { error, context: this.context });
          throw error;
        }
      }
    }
    
    if (iterations >= this.maxIterations) {
      const error = new Error(`Máximo de iteraciones alcanzado (${this.maxIterations})`);
      this.emit('error', { error, context: this.context });
      throw error;
    }
    
    const totalDuration = Date.now() - startTime;
    
    this.emit('complete', { 
      result: this.context, 
      duration: totalDuration,
      iterations,
      history: this.executionHistory
    });
    
    return {
      result: this.context,
      duration: totalDuration,
      iterations,
      history: this.executionHistory
    };
  }

  // ═══════════════════════════════════════════════════
  // DETERMINAR SIGUIENTE NODO
  // ═══════════════════════════════════════════════════
  getNextNode(currentNode) {
    const edges = this.edges[currentNode];
    
    if (!edges || edges.length === 0) {
      return null; // Fin del flujo
    }
    
    // Si hay múltiples edges, evaluar condiciones
    for (const edge of edges) {
      if (!edge.condition) {
        return edge.to; // Edge sin condición (default)
      }
      
      try {
        if (edge.condition(this.context)) {
          return edge.to;
        }
      } catch (error) {
        console.error(`[STATE] Error evaluando condición: ${error.message}`);
      }
    }
    
    // Si ninguna condición se cumple, usar el primer edge como fallback
    return edges[0].to;
  }

  // ═══════════════════════════════════════════════════
  // VISUALIZAR GRAFO (para debugging)
  // ═══════════════════════════════════════════════════
  visualize() {
    console.log(`\n📊 GRAFO: ${this.name}`);
    console.log('═'.repeat(50));
    
    console.log('\nNODOS:');
    Object.keys(this.nodes).forEach(node => {
      const config = this.nodes[node];
      console.log(`  ├─ ${node} (timeout: ${config.timeout}ms, retries: ${config.retries})`);
    });
    
    console.log('\nEDGES:');
    Object.keys(this.edges).forEach(from => {
      this.edges[from].forEach(edge => {
        const condition = edge.condition ? ' [condicional]' : '';
        console.log(`  ├─ ${from} → ${edge.to}${condition}`);
      });
    });
    
    console.log('═'.repeat(50));
  }

  // ═══════════════════════════════════════════════════
  // EXPORTAR HISTORIAL DE EJECUCIÓN
  // ═══════════════════════════════════════════════════
  getExecutionReport() {
    return {
      name: this.name,
      totalNodes: Object.keys(this.nodes).length,
      totalEdges: Object.values(this.edges).reduce((sum, edges) => sum + edges.length, 0),
      executionHistory: this.executionHistory,
      summary: {
        totalIterations: this.executionHistory.length,
        successfulNodes: this.executionHistory.filter(h => h.status === 'success').length,
        failedNodes: this.executionHistory.filter(h => h.status === 'error').length,
        totalDuration: this.executionHistory.reduce((sum, h) => sum + h.duration, 0)
      }
    };
  }
}

module.exports = StateMachine;
