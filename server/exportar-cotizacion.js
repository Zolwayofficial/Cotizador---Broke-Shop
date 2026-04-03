// server/exportar-cotizacion.js

const { normalizarCodigoPais } = require('./paises');

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;

  let normalized = String(value).replace(/\s+/g, '');
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');

  if (hasComma && hasDot) {
    normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
      ? normalized.replace(/\./g, '').replace(/,/g, '.')
      : normalized.replace(/,/g, '');
  } else if (hasComma) {
    normalized = /^\d{1,3}(,\d{3})+$/.test(normalized)
      ? normalized.replace(/,/g, '')
      : normalized.replace(/\./g, '').replace(/,/g, '.');
  } else if (hasDot) {
    normalized = /^\d{1,3}(\.\d{3})+$/.test(normalized)
      ? normalized.replace(/\./g, '')
      : normalized;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function normalizeCode(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeCountry(value) {
  return normalizarCodigoPais(value) || normalizeText(value).toUpperCase();
}

function normalizeChannel(value) {
  const normalized = normalizeText(value).toUpperCase();
  switch (normalized) {
  case 'COURIER_EXPRESS':
    return 'COURIER';
  case 'AEREO_FORMAL':
    return 'AEREO';
  case 'MARITIMO_FORMAL':
    return 'MARITIMO';
  default:
    return normalized;
  }
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleDateString('es-PE');
  }
  return date.toLocaleDateString('es-PE');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function normalizeCotizacionBase(cotizacion = {}) {
  return {
    ...cotizacion,
    id: normalizeText(cotizacion.id, 'N/A'),
    producto: normalizeText(cotizacion.producto, 'Producto sin nombre'),
    hs_code: normalizeCode(cotizacion.hs_code),
    pais_origen: normalizeCountry(cotizacion.pais_origen),
    incoterm: normalizeText(cotizacion.incoterm, 'N/A').toUpperCase(),
    canal: normalizeChannel(cotizacion.canal),
    tipo_importador: normalizeText(cotizacion.tipo_importador).toLowerCase(),
    fecha: cotizacion.fecha || new Date().toISOString(),
    tc: toNumber(cotizacion.tc, 0),
    fob: toNumber(cotizacion.fob, 0),
    flete: toNumber(cotizacion.flete, 0),
    seguro: toNumber(cotizacion.seguro, 0),
    cif: toNumber(cotizacion.cif, 0),
    ad_valorem: toNumber(cotizacion.ad_valorem, 0),
    igv: toNumber(cotizacion.igv, 0),
    ipm: toNumber(cotizacion.ipm, 0),
    percepcion: cotizacion.percepcion === null || cotizacion.percepcion === undefined ? null : toNumber(cotizacion.percepcion, 0),
    antidumping: cotizacion.antidumping === null || cotizacion.antidumping === undefined ? null : toNumber(cotizacion.antidumping, 0),
    total_tributos: toNumber(cotizacion.total_tributos, 0),
    costos_operativos: toNumber(cotizacion.costos_operativos, 0),
    total_landed: toNumber(cotizacion.total_landed, 0),
    total_landed_pen: toNumber(cotizacion.total_landed_pen, 0),
    ahorro_tlc: toNumber(cotizacion.ahorro_tlc, 0),
    tributos_pct: toNumber(cotizacion.tributos_pct, 0),
    fob_pct: toNumber(cotizacion.fob_pct, 0),
    flete_pct: toNumber(cotizacion.flete_pct, 0),
    seguro_pct: toNumber(cotizacion.seguro_pct, 0),
    adv_pct: toNumber(cotizacion.adv_pct, 0),
    igv_pct: toNumber(cotizacion.igv_pct, 0),
    ipm_pct: toNumber(cotizacion.ipm_pct, 0),
    perc_pct: toNumber(cotizacion.perc_pct, 0),
    ad_pct: toNumber(cotizacion.ad_pct, 0),
    op_pct: toNumber(cotizacion.op_pct, 0),
    total_pct: toNumber(cotizacion.total_pct, 0),
    adv_rate: toNumber(cotizacion.adv_rate, 0),
    perc_rate: toNumber(cotizacion.perc_rate, 0),
    alertas: Array.isArray(cotizacion.alertas) ? cotizacion.alertas : [],
  };
}

function enrichCotizacion(cotizacion = {}) {
  const enriched = normalizeCotizacionBase(cotizacion);
  return {
    ...enriched,
    documentos: generarDocumentacion(enriched),
    recomendaciones: generarRecomendaciones(enriched),
    apuntes: generarApuntes(enriched),
  };
}

function generarPDF(cotizacion, opciones = {}) {
  const {
    incluirDocumentacion = true,
    incluirRecomendaciones = true,
    incluirApuntes = true,
  } = opciones;
  const data = enrichCotizacion(cotizacion);

  const tableRows = [
    ['FOB (Valor de mercancia)', `$${data.fob.toFixed(2)}`, `${data.fob_pct}%`],
    ['Flete Internacional', `$${data.flete.toFixed(2)}`, `${data.flete_pct}%`],
    ['Seguro', `$${data.seguro.toFixed(2)}`, `${data.seguro_pct}%`],
    ['CIF', `$${data.cif.toFixed(2)}`, '100%'],
    [`Ad Valorem (${data.adv_rate}%)`, `$${data.ad_valorem.toFixed(2)}`, `${data.adv_pct}%`],
    ['IGV (16%)', `$${data.igv.toFixed(2)}`, `${data.igv_pct}%`],
    ['IPM (2%)', `$${data.ipm.toFixed(2)}`, `${data.ipm_pct}%`],
  ];

  if (data.percepcion !== null) {
    tableRows.push([`Percepcion (${data.perc_rate}%)`, `$${data.percepcion.toFixed(2)}`, `${data.perc_pct}%`]);
  }
  if (data.antidumping !== null) {
    tableRows.push(['Antidumping', `$${data.antidumping.toFixed(2)}`, `${data.ad_pct}%`]);
  }

  tableRows.push(
    ['TOTAL TRIBUTOS', `$${data.total_tributos.toFixed(2)}`, `${data.tributos_pct}%`],
    ['Costos Operativos', `$${data.costos_operativos.toFixed(2)}`, `${data.op_pct}%`],
    ['TOTAL LANDED COST', `$${data.total_landed.toFixed(2)}`, `${data.total_pct}%`],
    [`TOTAL EN SOLES (S/ ${data.tc})`, `S/ ${data.total_landed_pen.toFixed(2)}`, '-']
  );

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cotizacion de Importacion - ${escapeHtml(data.producto)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; margin: 0; }
    .page { width: 210mm; min-height: 297mm; padding: 15mm; margin: auto; background: white; }
    .header { background: linear-gradient(135deg, #1a3a5c 0%, #2c5f8d 100%); color: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; }
    .header h1 { font-size: 24px; margin: 0 0 5px; }
    .section { margin-bottom: 20px; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; }
    .section-title { background: #1a3a5c; color: white; padding: 10px 15px; font-size: 14px; font-weight: bold; }
    .section-content { padding: 15px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
    .field { margin-bottom: 10px; }
    .field label { font-size: 9px; color: #666; text-transform: uppercase; display: block; margin-bottom: 3px; }
    .field .value { font-weight: 600; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #e8ecf1; font-size: 10px; text-align: left; padding: 8px 10px; border: 1px solid #ccc; }
    td { padding: 8px 10px; border: 1px solid #ddd; font-size: 10px; }
    .right { text-align: right; }
    .total-row td { background: #f0f4f8; font-weight: 700; }
    .footer { text-align: center; font-size: 9px; color: #999; border-top: 1px solid #ddd; padding-top: 10px; margin-top: 24px; }
    .alert { padding: 10px 15px; border-left: 4px solid #17a2b8; margin: 10px 0; background: #f0f9ff; border-radius: 4px; }
    ul { margin: 0; padding-left: 18px; }
    li { margin-bottom: 6px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1>COTIZACION DE IMPORTACION</h1>
      <div>${escapeHtml(data.producto)} | ${escapeHtml(data.pais_origen)} -> Peru</div>
      <div style="margin-top: 5px;">Fecha: ${escapeHtml(formatDate(data.fecha))} | ID: ${escapeHtml(data.id)}</div>
    </div>

    <div class="section">
      <div class="section-title">INFORMACION GENERAL</div>
      <div class="section-content">
        <div class="grid">
          <div>
            <div class="field"><label>Producto</label><div class="value">${escapeHtml(data.producto)}</div></div>
            <div class="field"><label>Partida Arancelaria</label><div class="value">${escapeHtml(data.hs_code || 'N/A')}</div></div>
            <div class="field"><label>Pais de Origen</label><div class="value">${escapeHtml(data.pais_origen || 'N/A')}</div></div>
          </div>
          <div>
            <div class="field"><label>Incoterm</label><div class="value">${escapeHtml(data.incoterm)}</div></div>
            <div class="field"><label>Canal</label><div class="value">${escapeHtml(data.canal || 'N/A')}</div></div>
            <div class="field"><label>Tipo de Cambio</label><div class="value">S/ ${escapeHtml(data.tc)}</div></div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">DETALLE DE COSTOS (USD)</div>
      <div class="section-content">
        <table>
          <thead>
            <tr><th>Concepto</th><th class="right">Monto</th><th class="right">%</th></tr>
          </thead>
          <tbody>
            ${tableRows.map(([concepto, monto, pct], index) => `
              <tr${index >= tableRows.length - 3 ? ' class="total-row"' : ''}>
                <td>${escapeHtml(concepto)}</td>
                <td class="right">${escapeHtml(monto)}</td>
                <td class="right">${escapeHtml(pct)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    ${incluirDocumentacion ? `
    <div class="section">
      <div class="section-title">DOCUMENTACION REQUERIDA</div>
      <div class="section-content">
        <ul>
          ${data.documentos.length
    ? data.documentos.map((doc) => (
      `<li><strong>${escapeHtml(doc.nombre)}</strong> - ${escapeHtml(doc.descripcion)}${doc.vence ? ` (Vence: ${escapeHtml(doc.vence)})` : ''}</li>`
    )).join('')
    : '<li>No se requiere documentacion especial</li>'}
        </ul>
      </div>
    </div>` : ''}

    ${incluirRecomendaciones ? `
    <div class="section">
      <div class="section-title">RECOMENDACIONES</div>
      <div class="section-content">
        <ul>
          ${data.recomendaciones.length
    ? data.recomendaciones.map((rec) => (
      `<li>${escapeHtml(rec)}</li>`
    )).join('')
    : '<li>No hay recomendaciones especiales</li>'}
        </ul>
      </div>
    </div>` : ''}

    ${incluirApuntes ? `
    <div class="section">
      <div class="section-title">APUNTES IMPORTANTES</div>
      <div class="section-content">
        ${data.apuntes.length
    ? data.apuntes.map((apunte) => (
      `<div class="alert"><strong>${escapeHtml(apunte.titulo)}</strong><br>${escapeHtml(apunte.descripcion)}</div>`
    )).join('')
    : '<p>No hay apuntes importantes</p>'}
      </div>
    </div>` : ''}

    ${data.alertas.length ? `
    <div class="section">
      <div class="section-title">ALERTAS NORMATIVAS</div>
      <div class="section-content">
        ${data.alertas.map((alerta) => `
          <div class="alert">
            <strong>${escapeHtml(alerta.tipo || 'Alerta')}</strong><br>
            ${escapeHtml(alerta.mensaje || '')}
          </div>
        `).join('')}
      </div>
    </div>` : ''}

    <div class="footer">
      Generado por ImportAIAgent Cotizador | ${escapeHtml(formatDate())}<br>
      <small>Documento referencial. Verificar valores con agente de aduanas.</small>
    </div>
  </div>
</body>
</html>
  `;
}

function generarExcel(cotizacion) {
  const data = enrichCotizacion(cotizacion);
  const rows = [
    ['COTIZACION DE IMPORTACION'],
    [''],
    ['Informacion General'],
    ['Producto', data.producto],
    ['Partida Arancelaria', data.hs_code || 'N/A'],
    ['Pais de Origen', data.pais_origen || 'N/A'],
    ['Incoterm', data.incoterm],
    ['Canal', data.canal || 'N/A'],
    ['Tipo de Cambio', `S/ ${data.tc}`],
    ['Fecha', formatDate(data.fecha)],
    [''],
    ['Detalle de Costos (USD)'],
    ['Concepto', 'Monto (USD)', '%'],
    ['FOB', data.fob.toFixed(2), `${data.fob_pct}%`],
    ['Flete', data.flete.toFixed(2), `${data.flete_pct}%`],
    ['Seguro', data.seguro.toFixed(2), `${data.seguro_pct}%`],
    ['CIF', data.cif.toFixed(2), '100%'],
    ['Ad Valorem', data.ad_valorem.toFixed(2), `${data.adv_pct}%`],
    ['IGV', data.igv.toFixed(2), `${data.igv_pct}%`],
    ['IPM', data.ipm.toFixed(2), `${data.ipm_pct}%`],
    data.percepcion !== null ? ['Percepcion', data.percepcion.toFixed(2), `${data.perc_pct}%`] : null,
    data.antidumping !== null ? ['Antidumping', data.antidumping.toFixed(2), `${data.ad_pct}%`] : null,
    ['TOTAL TRIBUTOS', data.total_tributos.toFixed(2), `${data.tributos_pct}%`],
    ['Costos Operativos', data.costos_operativos.toFixed(2), `${data.op_pct}%`],
    ['TOTAL LANDED COST', data.total_landed.toFixed(2), `${data.total_pct}%`],
    ['TOTAL EN SOLES', `S/ ${data.total_landed_pen.toFixed(2)}`, '-'],
    [''],
    ['Documentacion Requerida'],
    ['Documento', 'Obligatorio', 'Vencimiento'],
    ...(data.documentos.map((doc) => [doc.nombre, doc.obligatorio ? 'Si' : 'No', doc.vence || 'N/A'])),
    [''],
    ['Recomendaciones'],
    ...(data.recomendaciones.map((rec) => [rec])),
  ].filter(Boolean);

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function generarDocumentacion(cotizacion) {
  const data = normalizeCotizacionBase(cotizacion);
  const documentos = [
    {
      nombre: 'Factura Comercial',
      obligatorio: true,
      descripcion: 'Emitida por el proveedor con el detalle de la operacion',
      vence: null,
    },
    {
      nombre: 'Bill of Lading (B/L) o Air Waybill (AWB)',
      obligatorio: true,
      descripcion: 'Documento de transporte internacional',
      vence: null,
    },
    {
      nombre: 'Packing List',
      obligatorio: true,
      descripcion: 'Lista detallada de empaque con pesos y dimensiones',
      vence: null,
    },
  ];

  const hs = data.hs_code;
  if (hs.startsWith('3004') || hs.startsWith('3003')) {
    documentos.push({
      nombre: 'Registro Sanitario (DIGEMID)',
      obligatorio: true,
      descripcion: 'Registro sanitario aplicable al producto',
      vence: 'Verificar vigencia',
    });
  }

  if (hs.startsWith('1901') || hs.startsWith('2106')) {
    documentos.push({
      nombre: 'Registro Sanitario (DIGESA)',
      obligatorio: true,
      descripcion: 'Habilitacion sanitaria para alimentos',
      vence: 'Verificar vigencia',
    });
  }

  if (hs.startsWith('61') || hs.startsWith('62')) {
    documentos.push({
      nombre: 'Certificado de Origen (si aplica TLC)',
      obligatorio: false,
      descripcion: 'Para acogerse a preferencias arancelarias',
      vence: null,
    });
  }

  if (data.pais_origen === 'CN') {
    documentos.push({
      nombre: 'Certificado de No Produccion Forzada',
      obligatorio: false,
      descripcion: 'Recomendado para productos de China',
      vence: null,
    });
  }

  return documentos;
}

function generarRecomendaciones(cotizacion) {
  const data = normalizeCotizacionBase(cotizacion);
  const recomendaciones = [];

  if (data.incoterm === 'EXW') {
    recomendaciones.push('Considera cambiar a FOB para mayor control del flete internacional');
    recomendaciones.push('Verifica que el proveedor incluya despacho de exportacion');
  }

  if (data.pais_origen === 'CN') {
    recomendaciones.push('China no tiene TLC con Peru, considera comparar proveedores de paises con preferencia arancelaria');
    recomendaciones.push('Verifica tiempos de transito: 28-35 dias maritimo');
  }

  if (data.ahorro_tlc > 0) {
    recomendaciones.push(`Tienes TLC: solicita Certificado de Origen para ahorrar $${data.ahorro_tlc.toFixed(2)}`);
  }

  if (data.alertas.some((alerta) => alerta.tipo === 'antidumping')) {
    recomendaciones.push('Hay antidumping aplicado, verifica medidas aplicables en INDECOPI');
  }

  if (data.tributos_pct > 25) {
    recomendaciones.push('Los tributos representan mas del 25%, considera revisar alternativas o preferencia arancelaria');
  }

  if (recomendaciones.length === 0) {
    recomendaciones.push('Cotizacion sin observaciones especiales');
    recomendaciones.push('Verifica documentacion antes del embarque');
    recomendaciones.push('Considera seguro de carga para proteger la mercancia');
  }

  return recomendaciones;
}

function generarApuntes(cotizacion) {
  const data = normalizeCotizacionBase(cotizacion);
  const apuntes = [];

  if (data.tipo_importador === 'nuevo') {
    apuntes.push({
      titulo: 'Primera Importacion',
      descripcion: 'Al ser tu primera importacion, requieres agente de aduanas obligatorio y normalmente hay mayor percepcion.',
    });
  }

  if (data.canal === 'AEREO') {
    apuntes.push({
      titulo: 'Importacion Aerea',
      descripcion: 'El flete aereo es mas rapido pero mas costoso. Ideal para productos de alto valor o urgencia.',
    });
  }

  if (data.canal === 'MARITIMO') {
    apuntes.push({
      titulo: 'Importacion Maritima',
      descripcion: 'El flete maritimo es mas economico pero mas lento. Ideal para volumenes grandes.',
    });
  }

  if (data.tc > 3.80) {
    apuntes.push({
      titulo: 'Tipo de Cambio Alto',
      descripcion: `El TC actual (S/ ${data.tc}) esta alto. Considera esperar si no es urgente.`,
    });
  }

  return apuntes;
}

function exportarCotizacion(cotizacion, formato = 'pdf', opciones = {}) {
  const data = enrichCotizacion(cotizacion);
  const normalizedFormat = normalizeText(formato, 'pdf').toLowerCase();

  if (normalizedFormat === 'pdf') {
    return generarPDF(data, opciones);
  }

  if (normalizedFormat === 'excel' || normalizedFormat === 'csv') {
    return generarExcel(data);
  }

  throw new Error(`Formato no soportado: ${formato}`);
}

module.exports = {
  generarPDF,
  generarExcel,
  generarDocumentacion,
  generarRecomendaciones,
  generarApuntes,
  exportarCotizacion,
  _private: {
    toNumber,
    normalizeCode,
    normalizeCountry,
    normalizeChannel,
    normalizeCotizacionBase,
    enrichCotizacion,
    formatDate,
  },
};
