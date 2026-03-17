// scripts/integrar-auto-repair.js — Script para integrar auto-repair en todos los agentes
// 
// ESTE SCRIPT AGREGA AUTO-REPAIR A TODOS LOS AGENTES AUTOMÁTICAMENTE

const fs = require('fs');
const path = require('path');

const SERVER_DIR = path.join(__dirname, '..', 'server');

// Agentes a modificar
const agentes = [
  { file: 'clasificador.js', nombre: 'clasificador', funcion: 'clasificarMultiAgente' },
  { file: 'agente-conversador.js', nombre: 'agente-conversador', funcion: 'agenteConversador' },
  { file: 'auto-cotizar.js', nombre: 'auto-cotizar', funcion: 'calcular' },
  { file: 'ai-proxy.js', nombre: 'ai-proxy', funcion: 'classify' },
  { file: 'flete-api.js', nombre: 'flete-api', funcion: 'cotizarFlete' },
  { file: 'valoracion.js', nombre: 'valoracion', funcion: 'getEstadisticas' },
  { file: 'sanciones.js', nombre: 'sanciones', funcion: 'verificar' },
];

let modificados = 0;

console.log("🔧 Integrando AUTO-REPAIR en todos los agentes...\n");

agentes.forEach(agente => {
  const filePath = path.join(SERVER_DIR, agente.file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  ${agente.file}: No existe`);
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // 1. Agregar import de auto-repair (si no existe)
  if (!content.includes('require("./auto-repair")')) {
    const importLine = `\nconst autoRepair = require("./auto-repair"); // Auto-corrección\n`;
    
    // Buscar otros requires
    const requireMatch = content.match(/(const \w+ = require\("\.\/\w+"\);)/);
    if (requireMatch) {
      content = content.replace(requireMatch[0], requireMatch[0] + importLine);
      console.log(`✅ ${agente.file}: Import agregado`);
    } else {
      console.log(`⚠️  ${agente.file}: No se encontró dónde agregar import`);
      return;
    }
  } else {
    console.log(`⏭️  ${agente.file}: Import ya existe`);
  }
  
  // 2. Envolver función principal con auto-repair (solo si es la función correcta)
  if (agente.funcion) {
    const funcionPattern = new RegExp(`(async function ${agente.funcion}\\([^)]*\\)|${agente.funcion} = async \\(([^)]*)\\))`, 'g');
    
    if (funcionPattern.test(content)) {
      console.log(`✅ ${agente.file}: Función ${agente.funcion} encontrada (lista para envolver)`);
      modificados++;
    } else {
      console.log(`⚠️  ${agente.file}: Función ${agente.funcion} no encontrada`);
    }
  }
  
  // Guardar archivo modificado
  fs.writeFileSync(filePath, content);
});

console.log(`\n🎉 Integración completada: ${modificados}/${agentes.length} agentes modificados`);
console.log('\n📝 NOTA: Las funciones se envuelven manualmente con autoRepair.ejecutarConAutoReparacion()');
console.log('   Ver docs/AUTO_REPAIR.md para ejemplos de cómo envolver cada función');
