// server/embeddings.js - Embeddings locales con Xenova Transformers
//
// Modelo principal: Xenova/all-MiniLM-L6-v2
// - 384 dimensiones
// - ejecucion local sin API externa
// - fallback TF-IDF cuando el modelo no esta disponible

let embedder = null;
let embedderPromise = null;

// Inicializar embedder (lazy loading)
async function initEmbedder() {
  if (embedder) return embedder;
  if (embedderPromise) return embedderPromise;
  
  embedderPromise = (async () => {
    try {
      const { pipeline } = require('@xenova/transformers');
      
      console.log('[EMBEDDINGS] Cargando modelo all-MiniLM-L6-v2 (50MB)...');
      
      embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        quantized: true,
        progress_callback: (progress) => {
          if (progress.status === 'progress') {
            const pct = Math.round(progress.progress * 100);
            console.log(`[EMBEDDINGS] Cargando modelo: ${pct}%`);
          }
        }
      });
      
      console.log('[EMBEDDINGS] Modelo cargado');
      return embedder;
      
    } catch (error) {
      console.error('[EMBEDDINGS] Error cargando modelo:', error.message);
      console.log('[EMBEDDINGS] Usando fallback TF-IDF');
      embedder = null;
      return null;
    } finally {
      if (!embedder) {
        embedderPromise = null;
      }
    }
  })();
  
  return embedderPromise;
}

// Generar embedding
async function generarEmbedding(texto) {
  if (!texto || texto.length < 2) {
    return generarEmbeddingFallback(texto);
  }
  
  try {
    const model = await initEmbedder();
    
    if (!model) {
      // Fallback a TF-IDF si no hay modelo
      return generarEmbeddingFallback(texto);
    }
    
    // Generar embedding con pooling y normalizacion
    const output = await model(texto, {
      pooling: 'mean',
      normalize: true
    });
    
    // Convertir a array JSON (384 dimensiones)
    return JSON.stringify(Array.from(output.data));
    
  } catch (error) {
    console.error('[EMBEDDINGS] Error generando embedding:', error.message);
    return generarEmbeddingFallback(texto);
  }
}

// Fallback: TF-IDF deterministico
function generarEmbeddingFallback(texto) {
  // Implementacion TF-IDF simplificada para 384 dimensiones
  const palabras = texto.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(p => p.length > 2)
    .slice(0, 100);
  
  const embedding = new Array(384).fill(0);
  
  palabras.forEach((palabra) => {
    // Hash consistente de la palabra
    let hash = 0;
    for (let i = 0; i < palabra.length; i++) {
      hash = ((hash << 5) - hash) + palabra.charCodeAt(i);
      hash = hash & hash;
    }
    
    // Ponderacion por frecuencia (TF)
    const tf = palabras.filter(p => p === palabra).length / palabras.length;
    
    // Posicion en el embedding basada en hash
    const posicion = Math.abs(hash) % 384;
    embedding[posicion] += tf;
  });
  
  // Normalizar embedding (L2 norm)
  const norma = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  if (norma > 0) {
    for (let i = 0; i < 384; i++) {
      embedding[i] /= norma;
    }
  }
  
  return JSON.stringify(embedding);
}

// Calcular similitud coseno
function similitudCoseno(embedding1, embedding2) {
  const vec1 = JSON.parse(embedding1);
  const vec2 = JSON.parse(embedding2);
  
  // Producto punto
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }
  
  norm1 = Math.sqrt(norm1);
  norm2 = Math.sqrt(norm2);
  
  if (norm1 === 0 || norm2 === 0) return 0;
  
  return dotProduct / (norm1 * norm2);
}

// Busqueda semantica
async function buscarSemanticamente(query, documentos, topK = 5) {
  // Generar embedding para la query
  const queryEmbedding = await generarEmbedding(query);
  
  // Calcular similitud con cada documento
  const resultados = documentos.map(doc => ({
    ...doc,
    similitud: similitudCoseno(queryEmbedding, doc.embedding)
  }));
  
  // Ordenar por similitud y retornar top K
  return resultados
    .sort((a, b) => b.similitud - a.similitud)
    .slice(0, topK);
}

// Precalentar modelo (opcional, para produccion)
async function precalentarModelo() {
  console.log('[EMBEDDINGS] Precalentando modelo...');
  await initEmbedder();
  
  // Generar embedding de prueba
  await generarEmbedding('camiseta de algodon');
  
  console.log('[EMBEDDINGS] Precalentamiento completado');
}

// Estadisticas del modelo
function getEmbeddingStats() {
  return {
    modelo: embedder ? 'Xenova/all-MiniLM-L6-v2' : 'TF-IDF (fallback)',
    dimensiones: 384,
    tamano: embedder ? '~25MB (quantized)' : '~0MB',
    disponible: !!embedder,
    cargando: !!embedderPromise && !embedder
  };
}

module.exports = {
  initEmbedder,
  generarEmbedding,
  generarEmbeddingFallback,
  similitudCoseno,
  buscarSemanticamente,
  precalentarModelo,
  getEmbeddingStats
};
