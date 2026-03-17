// server/exportar-cotizacion.js
// 
// EXPORTACIÓN DE COTIZACIONES (PDF, Excel, Documentación)
// 
// Features:
// - PDF detallado de cotización
// - Excel con desglose completo
// - Lista de documentos requeridos
// - Recomendaciones personalizadas
// - Apuntes/notas importantes


// ═══════════════════════════════════════════════════
// GENERAR PDF DE COTIZACIÓN
// ═══════════════════════════════════════════════════

function generarPDF(cotizacion, opciones = {}) {
  const {
    incluirDocumentacion = true,
    incluirRecomendaciones = true,
    incluirApuntes = true
  } = opciones;

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cotización de Importación - ${cotizacion.producto}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Arial', sans-serif; font-size: 11px; color: #1a1a1a; }
    .page { width: 210mm; min-height: 297mm; padding: 15mm; margin: auto; background: white; }
    
    .header { 
      background: linear-gradient(135deg, #1a3a5c 0%, #2c5f8d 100%);
      color: white; 
      padding: 20px; 
      margin-bottom: 20px;
      border-radius: 8px;
    }
    .header h1 { font-size: 24px; margin-bottom: 5px; }
    .header .subtitle { font-size: 12px; opacity: 0.9; }
    
    .section { 
      margin-bottom: 20px; 
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      overflow: hidden;
    }
    .section-title { 
      background: #1a3a5c; 
      color: white; 
      padding: 10px 15px; 
      font-size: 14px; 
      font-weight: bold;
    }
    .section-content { padding: 15px; }
    
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
    
    .field { margin-bottom: 10px; }
    .field label { 
      font-size: 9px; 
      color: #666; 
      text-transform: uppercase; 
      display: block;
      margin-bottom: 3px;
    }
    .field value { 
      font-weight: 600; 
      font-size: 12px;
      color: #1a1a1a;
    }
    
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th { 
      background: #e8ecf1; 
      font-size: 10px; 
      text-align: left; 
      padding: 8px 10px; 
      border: 1px solid #ccc;
      font-weight: 600;
    }
    td { 
      padding: 8px 10px; 
      border: 1px solid #ddd; 
      font-size: 10px;
    }
    .right { text-align: right; }
    .bold { font-weight: 700; }
    .total-row td { 
      background: #f0f4f8; 
      font-weight: 700;
      font-size: 11px;
    }
    
    .alert { 
      padding: 10px 15px; 
      border-left: 4px solid;
      margin: 10px 0;
      border-radius: 4px;
      background: #f8f9fa;
    }
    .alert-critico { border-color: #dc3545; background: #fff5f5; }
    .alert-alto { border-color: #fd7e14; background: #fff8f0; }
    .alert-medio { border-color: #ffc107; background: #fffef0; }
    .alert-info { border-color: #17a2b8; background: #f0f9ff; }
    
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-success { background: #d4edda; color: #155724; }
    .badge-warning { background: #fff3cd; color: #856404; }
    .badge-danger { background: #f8d7da; color: #721c24; }
    .badge-info { background: #d1ecf1; color: #0c5460; }
    
    .document-list { list-style: none; }
    .document-list li {
      padding: 8px 10px;
      border-bottom: 1px solid #e0e0e0;
      display: flex;
      align-items: center;
    }
    .document-list li:last-child { border-bottom: none; }
    .document-list li::before {
      content: "📄";
      margin-right: 10px;
    }
    
    .recommendation-list { list-style: none; }
    .recommendation-list li {
      padding: 8px 10px;
      border-bottom: 1px solid #e0e0e0;
    }
    .recommendation-list li::before {
      content: "💡";
      margin-right: 10px;
    }
    
    .footer {
      position: fixed;
      bottom: 15mm;
      left: 15mm;
      right: 15mm;
      text-align: center;
      font-size: 9px;
      color: #999;
      border-top: 1px solid #ddd;
      padding-top: 10px;
    }
    
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 80px;
      color: rgba(26, 58, 92, 0.05);
      font-weight: bold;
      z-index: 0;
    }
    
    @media print {
      .page { padding: 0; width: 100%; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="watermark">COTIZACIÓN</div>
    
    <!-- HEADER -->
    <div class="header">
      <h1>📋 COTIZACIÓN DE IMPORTACIÓN</h1>
      <div class="subtitle">
        ${cotizacion.producto} | ${cotizacion.pais_origen} → Perú
      </div>
      <div class="subtitle" style="margin-top: 5px;">
        Fecha: ${new Date(cotizacion.fecha).toLocaleDateString('es-PE')} | 
        ID: ${cotizacion.id}
      </div>
    </div>
    
    <!-- INFORMACIÓN GENERAL -->
    <div class="section">
      <div class="section-title">📊 INFORMACIÓN GENERAL</div>
      <div class="section-content">
        <div class="grid">
          <div>
            <div class="field">
              <label>Producto</label>
              <value>${cotizacion.producto}</value>
            </div>
            <div class="field">
              <label>Partida Arancelaria</label>
              <value>${cotizacion.hs_code || 'N/A'}</value>
            </div>
            <div class="field">
              <label>País de Origen</label>
              <value>${cotizacion.pais_origen}</value>
            </div>
          </div>
          <div>
            <div class="field">
              <label>Incoterm</label>
              <value>${cotizacion.incoterm}</value>
            </div>
            <div class="field">
              <label>Canal de Importación</label>
              <value>${cotizacion.canal}</value>
            </div>
            <div class="field">
              <label>Tipo de Cambio</label>
              <value>S/ ${cotizacion.tc}</value>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- DETALLE DE COSTOS -->
    <div class="section">
      <div class="section-title">💰 DETALLE DE COSTOS (USD)</div>
      <div class="section-content">
        <table>
          <thead>
            <tr>
              <th>Concepto</th>
              <th class="right">Monto (USD)</th>
              <th class="right">%</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>FOB (Valor de mercancía)</td>
              <td class="right">$${cotizacion.fob?.toFixed(2) || '0.00'}</td>
              <td class="right">${cotizacion.fob_pct || 0}%</td>
            </tr>
            <tr>
              <td>Flete Internacional</td>
              <td class="right">$${cotizacion.flete?.toFixed(2) || '0.00'}</td>
              <td class="right">${cotizacion.flete_pct || 0}%</td>
            </tr>
            <tr>
              <td>Seguro</td>
              <td class="right">$${cotizacion.seguro?.toFixed(2) || '0.00'}</td>
              <td class="right">${cotizacion.seguro_pct || 0}%</td>
            </tr>
            <tr class="total-row">
              <td>CIF (Costo + Flete + Seguro)</td>
              <td class="right">$${cotizacion.cif?.toFixed(2) || '0.00'}</td>
              <td class="right">100%</td>
            </tr>
            <tr>
              <td>Ad Valorem (${cotizacion.adv_rate || 0}%)</td>
              <td class="right">$${cotizacion.ad_valorem?.toFixed(2) || '0.00'}</td>
              <td class="right">${cotizacion.adv_pct || 0}%</td>
            </tr>
            <tr>
              <td>IGV (16%)</td>
              <td class="right">$${cotizacion.igv?.toFixed(2) || '0.00'}</td>
              <td class="right">${cotizacion.igv_pct || 0}%</td>
            </tr>
            <tr>
              <td>IPM (2%)</td>
              <td class="right">$${cotizacion.ipm?.toFixed(2) || '0.00'}</td>
              <td class="right">${cotizacion.ipm_pct || 0}%</td>
            </tr>
            ${cotizacion.percepcion ? `
            <tr>
              <td>Percepción (${cotizacion.perc_rate || 0}%)</td>
              <td class="right">$${cotizacion.percepcion.toFixed(2)}</td>
              <td class="right">${cotizacion.perc_pct || 0}%</td>
            </tr>
            ` : ''}
            ${cotizacion.antidumping ? `
            <tr>
              <td>Antidumping</td>
              <td class="right">$${cotizacion.antidumping.toFixed(2)}</td>
              <td class="right">${cotizacion.ad_pct || 0}%</td>
            </tr>
            ` : ''}
            <tr class="total-row">
              <td>TOTAL TRIBUTOS</td>
              <td class="right">$${cotizacion.total_tributos?.toFixed(2) || '0.00'}</td>
              <td class="right">${cotizacion.tributos_pct || 0}%</td>
            </tr>
            <tr class="total-row">
              <td>Costos Operativos</td>
              <td class="right">$${cotizacion.costos_operativos?.toFixed(2) || '0.00'}</td>
              <td class="right">${cotizacion.op_pct || 0}%</td>
            </tr>
            <tr class="total-row" style="background: #1a3a5c; color: white;">
              <td>TOTAL LANDED COST</td>
              <td class="right">$${cotizacion.total_landed?.toFixed(2) || '0.00'}</td>
              <td class="right">${cotizacion.total_pct || 0}%</td>
            </tr>
            <tr style="background: #f0f4f8;">
              <td>TOTAL EN SOLES (S/ ${cotizacion.tc})</td>
              <td class="right">S/ ${cotizacion.total_landed_pen?.toFixed(2) || '0.00'}</td>
              <td class="right">-</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    
    ${incluirDocumentacion ? `
    <!-- DOCUMENTACIÓN REQUERIDA -->
    <div class="section">
      <div class="section-title">📄 DOCUMENTACIÓN REQUERIDA</div>
      <div class="section-content">
        <ul class="document-list">
          ${cotizacion.documentos?.map(doc => `
            <li>
              <strong>${doc.nombre}</strong>
              ${doc.obligatorio ? '<span class="badge badge-danger">Obligatorio</span>' : ''}
              ${doc.vence ? `<span class="badge badge-warning">Vence: ${doc.vence}</span>` : ''}
              <br><small style="color: #666; margin-left: 25px;">${doc.descripcion}</small>
            </li>
          `).join('') || '<li>No se requiere documentación especial</li>'}
        </ul>
      </div>
    </div>
    ` : ''}
    
    ${incluirRecomendaciones ? `
    <!-- RECOMENDACIONES -->
    <div class="section">
      <div class="section-title">💡 RECOMENDACIONES</div>
      <div class="section-content">
        <ul class="recommendation-list">
          ${cotizacion.recomendaciones?.map(rec => `
            <li>${rec}</li>
          `).join('') || '<li>No hay recomendaciones especiales</li>'}
        </ul>
      </div>
    </div>
    ` : ''}
    
    ${incluirApuntes ? `
    <!-- APUNTES IMPORTANTES -->
    <div class="section">
      <div class="section-title">📝 APUNTES IMPORTANTES</div>
      <div class="section-content">
        ${cotizacion.apuntes?.map(apunte => `
          <div class="alert alert-info">
            <strong>⚠️ ${apunte.titulo}</strong><br>
            ${apunte.descripcion}
          </div>
        `).join('') || '<p>No hay apuntes importantes</p>'}
      </div>
    </div>
    ` : ''}
    
    <!-- ALERTAS NORMATIVAS -->
    ${cotizacion.alertas?.length > 0 ? `
    <div class="section">
      <div class="section-title">🔔 ALERTAS NORMATIVAS</div>
      <div class="section-content">
        ${cotizacion.alertas.map(alerta => `
          <div class="alert alert-${alerta.nivel || 'info'}">
            <strong>${alerta.tipo}</strong><br>
            ${alerta.mensaje}
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}
    
    <!-- FOOTER -->
    <div class="footer">
      Generado por Cotizador de Importación Perú v3.0 Ultimate | 
      ${new Date().toLocaleDateString('es-PE')} | 
      Página 1 de 1
      <br>
      <small>Este documento es referencial. Verificar valores con agente de aduanas.</small>
    </div>
  </div>
</body>
</html>
  `;

  return html;
}

// ═══════════════════════════════════════════════════
// GENERAR EXCEL DE COTIZACIÓN
// ═══════════════════════════════════════════════════

function generarExcel(cotizacion) {
  // Formato CSV (compatible con Excel)
  const rows = [
    ['COTIZACIÓN DE IMPORTACIÓN'],
    [''],
    ['Información General'],
    ['Producto', cotizacion.producto],
    ['Partida Arancelaria', cotizacion.hs_code || 'N/A'],
    ['País de Origen', cotizacion.pais_origen],
    ['Incoterm', cotizacion.incoterm],
    ['Canal', cotizacion.canal],
    ['Tipo de Cambio', `S/ ${cotizacion.tc}`],
    ['Fecha', new Date(cotizacion.fecha).toLocaleDateString('es-PE')],
    [''],
    ['Detalle de Costos (USD)'],
    ['Concepto', 'Monto (USD)', '%'],
    ['FOB', cotizacion.fob?.toFixed(2) || '0.00', `${cotizacion.fob_pct || 0}%`],
    ['Flete', cotizacion.flete?.toFixed(2) || '0.00', `${cotizacion.flete_pct || 0}%`],
    ['Seguro', cotizacion.seguro?.toFixed(2) || '0.00', `${cotizacion.seguro_pct || 0}%`],
    ['CIF', cotizacion.cif?.toFixed(2) || '0.00', '100%'],
    ['Ad Valorem', cotizacion.ad_valorem?.toFixed(2) || '0.00', `${cotizacion.adv_pct || 0}%`],
    ['IGV', cotizacion.igv?.toFixed(2) || '0.00', `${cotizacion.igv_pct || 0}%`],
    ['IPM', cotizacion.ipm?.toFixed(2) || '0.00', `${cotizacion.ipm_pct || 0}%`],
    cotizacion.percepcion ? ['Percepción', cotizacion.percepcion.toFixed(2), `${cotizacion.perc_pct || 0}%`] : null,
    cotizacion.antidumping ? ['Antidumping', cotizacion.antidumping.toFixed(2), `${cotizacion.ad_pct || 0}%`] : null,
    ['TOTAL TRIBUTOS', cotizacion.total_tributos?.toFixed(2) || '0.00', `${cotizacion.tributos_pct || 0}%`],
    ['Costos Operativos', cotizacion.costos_operativos?.toFixed(2) || '0.00', `${cotizacion.op_pct || 0}%`],
    ['TOTAL LANDED COST', cotizacion.total_landed?.toFixed(2) || '0.00', `${cotizacion.total_pct || 0}%`],
    ['TOTAL EN SOLES', `S/ ${cotizacion.total_landed_pen?.toFixed(2) || '0.00'}`, '-'],
    [''],
    ['Documentación Requerida'],
    ['Documento', 'Obligatorio', 'Vencimiento'],
    ...(cotizacion.documentos?.map(doc => [doc.nombre, doc.obligatorio ? 'Sí' : 'No', doc.vence || 'N/A']) || []),
    [''],
    ['Recomendaciones'],
    ...(cotizacion.recomendaciones?.map(rec => [rec]) || []),
  ].filter(row => row !== null);

  // Convertir a CSV
  const csv = rows.map(row => row.map(cell => `"${cell || ''}"`).join(',')).join('\n');
  
  return csv;
}

// ═══════════════════════════════════════════════════
// GENERAR DOCUMENTACIÓN REQUERIDA
// ═══════════════════════════════════════════════════

function generarDocumentacion(cotizacion) {
  const documentos = [];

  // Documentos básicos (siempre)
  documentos.push({
    nombre: 'Factura Comercial',
    obligatorio: true,
    descripcion: 'Emitida por el proveedor con todos los detalles de la operación',
    vence: null
  });

  documentos.push({
    nombre: 'Bill of Lading (B/L) o Air Waybill (AWB)',
    obligatorio: true,
    descripcion: 'Documento de transporte internacional',
    vence: null
  });

  documentos.push({
    nombre: 'Packing List',
    obligatorio: true,
    descripcion: 'Lista detallada de empaque con pesos y dimensiones',
    vence: null
  });

  // Documentos según producto
  if (cotizacion.hs_code) {
    const hs = cotizacion.hs_code;
    
    // Productos farmacéuticos
    if (hs.startsWith('3004') || hs.startsWith('3003')) {
      documentos.push({
        nombre: 'Registro Sanitario (DIGEMID)',
        obligatorio: true,
        descripcion: 'Registro sanitario vigente del producto',
        vence: 'Verificar vigencia'
      });
    }
    
    // Productos alimenticios
    if (hs.startsWith('1901') || hs.startsWith('2106')) {
      documentos.push({
        nombre: 'Registro Sanitario (DIGESA)',
        obligatorio: true,
        descripcion: 'Habilitación sanitaria para alimentos',
        vence: 'Verificar vigencia'
      });
    }
    
    // Productos textiles
    if (hs.startsWith('61') || hs.startsWith('62')) {
      documentos.push({
        nombre: 'Certificado de Origen (si aplica TLC)',
        obligatorio: false,
        descripcion: 'Para acogerse a preferencias arancelarias',
        vence: null
      });
    }
  }

  // Documentos según país
  if (cotizacion.pais_origen === 'CN') {
    documentos.push({
      nombre: 'Certificado de No Producción Forzada',
      obligatorio: false,
      descripcion: 'Recomendado para productos de China',
      vence: null
    });
  }

  return documentos;
}

// ═══════════════════════════════════════════════════
// GENERAR RECOMENDACIONES
// ═══════════════════════════════════════════════════

function generarRecomendaciones(cotizacion) {
  const recomendaciones = [];

  // Según incoterm
  if (cotizacion.incoterm === 'EXW') {
    recomendaciones.push('🔸 Considera cambiar a FOB para mayor control del flete internacional');
    recomendaciones.push('🔸 Verifica que el proveedor incluya despacho de exportación');
  }

  // Según país
  if (cotizacion.pais_origen === 'CN') {
    recomendaciones.push('🔸 China no tiene TLC con Perú, considera buscar proveedores en Chile o USA');
    recomendaciones.push('🔸 Verifica tiempos de tránsito: 28-35 días marítimo');
  }

  // Según TLC
  if (cotizacion.ahorro_tlc > 0) {
    recomendaciones.push(`🔸 ¡Tienes TLC! Solicita Certificado de Origen para ahorrar $${cotizacion.ahorro_tlc.toFixed(2)}`);
  }

  // Según alertas
  if (cotizacion.alertas?.some(a => a.tipo === 'antidumping')) {
    recomendaciones.push('🔸 Hay antidumping aplicado, verifica si hay medidas vigentes en INDECOPI');
  }

  // Según costo
  if (cotizacion.tributos_pct > 25) {
    recomendaciones.push('🔸 Los tributos representan más del 25%, considera buscar productos con menor carga tributaria');
  }

  // Por defecto
  if (recomendaciones.length === 0) {
    recomendaciones.push('✅ Cotización sin observaciones especiales');
    recomendaciones.push('🔸 Verifica documentación antes del embarque');
    recomendaciones.push('🔸 Considera seguro de carga para proteger la mercancía');
  }

  return recomendaciones;
}

// ═══════════════════════════════════════════════════
// GENERAR APUNTES IMPORTANTES
// ═══════════════════════════════════════════════════

function generarApuntes(cotizacion) {
  const apuntes = [];

  // Según tipo de importador
  if (cotizacion.tipo_importador === 'nuevo') {
    apuntes.push({
      titulo: 'Primera Importación',
      descripcion: 'Al ser tu primera importación, requieres agente de aduanas obligatorio. La percepción es del 10%.'
    });
  }

  // Según canal
  if (cotizacion.canal === 'AEREO') {
    apuntes.push({
      titulo: 'Importación Aérea',
      descripcion: 'El flete aéreo es más rápido (5-8 días) pero más costoso. Ideal para productos de alto valor o urgencia.'
    });
  }

  if (cotizacion.canal === 'MARITIMO') {
    apuntes.push({
      titulo: 'Importación Marítima',
      descripcion: 'El flete marítimo es más económico pero más lento (28-35 días). Ideal para volúmenes grandes.'
    });
  }

  // Según TC
  if (cotizacion.tc > 3.80) {
    apuntes.push({
      titulo: 'Tipo de Cambio Alto',
      descripcion: `El TC actual (S/ ${cotizacion.tc}) está alto. Considera esperar si no es urgente.`
    });
  }

  return apuntes;
}

// ═══════════════════════════════════════════════════
// EXPORTAR TODO
// ═══════════════════════════════════════════════════

function exportarCotizacion(cotizacion, formato = 'pdf', opciones = {}) {
  // Completar cotización con información adicional
  cotizacion.documentos = generarDocumentacion(cotizacion);
  cotizacion.recomendaciones = generarRecomendaciones(cotizacion);
  cotizacion.apuntes = generarApuntes(cotizacion);

  if (formato === 'pdf') {
    return generarPDF(cotizacion, opciones);
  } else if (formato === 'excel' || formato === 'csv') {
    return generarExcel(cotizacion);
  } else {
    throw new Error(`Formato no soportado: ${formato}`);
  }
}

module.exports = {
  generarPDF,
  generarExcel,
  generarDocumentacion,
  generarRecomendaciones,
  generarApuntes,
  exportarCotizacion
};
