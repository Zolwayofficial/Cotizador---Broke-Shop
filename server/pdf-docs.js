// server/pdf-docs.js — Generador de documentos profesionales de comercio exterior
// Genera HTML profesional que se convierte a PDF con puppeteer o se imprime desde el browser
// Si puppeteer no está disponible, devuelve HTML listo para imprimir como PDF

// XSS Protection: escape all user-provided strings before inserting into HTML
function esc(str) {
  if (str == null) return '—';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ══════════════════════════════════════════
// PLANTILLAS
// ══════════════════════════════════════════

const CSS = `
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; }
  .page { width: 210mm; min-height: 297mm; padding: 12mm; margin: auto; background: white; }
  .header { display:flex; justify-content:space-between; border-bottom: 2px solid #1a3a5c; padding-bottom: 8px; margin-bottom: 12px; }
  .header h1 { font-size: 18px; color: #1a3a5c; }
  .header .doc-info { text-align: right; font-size: 10px; }
  .section { margin-bottom: 12px; }
  .section-title { background: #1a3a5c; color: white; padding: 4px 8px; font-size: 11px; font-weight: bold; margin-bottom: 6px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .field { margin-bottom: 4px; }
  .field label { font-size: 9px; color: #666; text-transform: uppercase; display: block; }
  .field value { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0; }
  th { background: #e8ecf1; font-size: 10px; text-align: left; padding: 4px 6px; border: 1px solid #ccc; }
  td { padding: 4px 6px; border: 1px solid #ddd; font-size: 10px; }
  .right { text-align: right; }
  .bold { font-weight: 700; }
  .total-row td { background: #f0f4f8; font-weight: 700; }
  .footer { position: fixed; bottom: 12mm; left: 12mm; right: 12mm; text-align: center; font-size: 8px; color: #999; border-top: 1px solid #ddd; padding-top: 4px; }
  .stamp { border: 2px solid #d32f2f; color: #d32f2f; padding: 4px 12px; display: inline-block; font-weight: bold; transform: rotate(-5deg); font-size: 14px; }
  .warning { background: #fff3e0; border-left: 3px solid #ff9800; padding: 6px 10px; font-size: 10px; margin: 8px 0; }
  .green { color: #2e7d32; }
  .red { color: #d32f2f; }
  @media print { .page { padding:0; width:100%; } .no-print { display:none; } }
</style>`;

function formatMoney(n, currency='USD') { 
  return `${currency} ${(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}
function formatDate(d) { 
  const dt = d ? new Date(d) : new Date();
  return dt.toLocaleDateString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric'});
}

// ══════════════════════════════════════════
// 1. COTIZACIÓN PROFESIONAL
// ══════════════════════════════════════════
function generarCotizacion(data) {
  const { items, canal, incoterm, pais, tc, totales, importador, proveedor, notas, id } = data;
  const itemRows = (items||[]).map((it,i) => `
    <tr>
      <td>${i+1}</td>
      <td>${esc(it.hs)}</td>
      <td>${esc(it.desc)}</td>
      <td class="right">${it.qty||1}</td>
      <td class="right">${formatMoney(it.unit)}</td>
      <td class="right">${formatMoney((it.qty||1)*(it.unit||0))}</td>
      <td class="right">${it.adv||0}%</td>
      <td class="right">${formatMoney(it.tributos)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">${CSS}</head><body>
<div class="page">
  <div class="header">
    <div><h1>COTIZACIÓN DE IMPORTACIÓN</h1><div>Régimen: Importación para el Consumo</div></div>
    <div class="doc-info">
      <div class="bold">N° ${id || 'COT-'+Date.now()}</div>
      <div>Fecha: ${formatDate()}</div>
      <div>Canal: ${esc(canal)}</div>
      <div>TC: ${esc(tc)} PEN/USD</div>
    </div>
  </div>

  <div class="grid">
    <div class="section">
      <div class="section-title">IMPORTADOR</div>
      <div class="field"><label>Razón Social</label><value>${esc(importador?.nombre)}</value></div>
      <div class="field"><label>RUC</label><value>${esc(importador?.ruc)}</value></div>
      <div class="field"><label>Dirección</label><value>${esc(importador?.direccion)}</value></div>
    </div>
    <div class="section">
      <div class="section-title">PROVEEDOR</div>
      <div class="field"><label>Empresa</label><value>${esc(proveedor?.nombre)}</value></div>
      <div class="field"><label>País</label><value>${esc(pais)}</value></div>
      <div class="field"><label>Incoterm</label><value>${esc(incoterm||'FOB')}</value></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">DETALLE DE MERCANCÍAS</div>
    <table>
      <tr><th>#</th><th>Partida</th><th>Descripción</th><th class="right">Cant.</th><th class="right">Unitario</th><th class="right">FOB</th><th class="right">AV%</th><th class="right">Tributos</th></tr>
      ${itemRows}
    </table>
  </div>

  <div class="grid">
    <div class="section">
      <div class="section-title">RESUMEN TRIBUTARIO</div>
      <table>
        <tr><td>FOB Total</td><td class="right bold">${formatMoney(totales?.fob)}</td></tr>
        <tr><td>Flete</td><td class="right">${formatMoney(totales?.flete)}</td></tr>
        <tr><td>Seguro</td><td class="right">${formatMoney(totales?.seguro)}</td></tr>
        <tr><td class="bold">CIF</td><td class="right bold">${formatMoney(totales?.cif)}</td></tr>
        <tr><td>Ad Valorem</td><td class="right">${formatMoney(totales?.advalorem)}</td></tr>
        <tr><td>ISC</td><td class="right">${formatMoney(totales?.isc)}</td></tr>
        <tr><td>IGV (16%)</td><td class="right">${formatMoney(totales?.igv)}</td></tr>
        <tr><td>IPM (2%)</td><td class="right">${formatMoney(totales?.ipm)}</td></tr>
        <tr><td>Percepción</td><td class="right">${formatMoney(totales?.percepcion)}</td></tr>
        <tr><td>Antidumping</td><td class="right">${formatMoney(totales?.antidumping)}</td></tr>
        <tr class="total-row"><td>TOTAL A PAGAR</td><td class="right">${formatMoney(totales?.total)}</td></tr>
        <tr class="total-row"><td>TOTAL EN SOLES</td><td class="right">${formatMoney(totales?.totalPEN,'PEN')}</td></tr>
      </table>
    </div>
    <div class="section">
      <div class="section-title">COSTOS OPERATIVOS</div>
      <table>
        <tr><td>Agente de Aduanas (est.)</td><td class="right">$150-300</td></tr>
        <tr><td>Almacenaje (est.)</td><td class="right">$50-200</td></tr>
        <tr><td>Transporte local (est.)</td><td class="right">$80-250</td></tr>
        <tr><td>Comisión banco (est.)</td><td class="right">$30-50</td></tr>
      </table>
      ${notas ? `<div class="warning">${esc(notas)}</div>` : ''}
    </div>
  </div>

  <div class="footer">
    Documento generado por Cotizador de Importación Perú v2.0 — Valores referenciales sujetos a verificación por SUNAT
  </div>
</div></body></html>`;
}

// ══════════════════════════════════════════
// 2. PACKING LIST
// ══════════════════════════════════════════
function generarPackingList(data) {
  const { items, importador, proveedor, pais, referencia, embarque } = data;
  const rows = (items||[]).map((it,i) => `
    <tr>
      <td>${i+1}</td>
      <td>${esc(it.desc)}</td>
      <td>${esc(it.hs)}</td>
      <td class="right">${it.qty||1}</td>
      <td class="right">${it.pesoNetoKg||'—'}</td>
      <td class="right">${it.pesoBrutoKg||'—'}</td>
      <td class="right">${it.bultos||1}</td>
      <td>${esc(it.marcas)}</td>
    </tr>`).join('');

  const totalNeto = (items||[]).reduce((s,it) => s + (it.pesoNetoKg||0) * (it.qty||1), 0);
  const totalBruto = (items||[]).reduce((s,it) => s + (it.pesoBrutoKg||0) * (it.qty||1), 0);
  const totalBultos = (items||[]).reduce((s,it) => s + (it.bultos||1), 0);

  return `<!DOCTYPE html><html><head><meta charset="utf-8">${CSS}</head><body>
<div class="page">
  <div class="header">
    <div><h1>PACKING LIST</h1><div>Lista de Empaque / Lista de Embalaje</div></div>
    <div class="doc-info">
      <div class="bold">Ref: ${esc(referencia)||'PL-'+Date.now()}</div>
      <div>Fecha: ${formatDate()}</div>
    </div>
  </div>
  <div class="grid">
    <div class="section">
      <div class="section-title">EXPORTADOR (SHIPPER)</div>
      <div class="field"><label>Empresa</label><value>${esc(proveedor?.nombre)}</value></div>
      <div class="field"><label>País</label><value>${esc(pais)}</value></div>
      <div class="field"><label>Dirección</label><value>${esc(proveedor?.direccion)}</value></div>
    </div>
    <div class="section">
      <div class="section-title">CONSIGNATARIO (CONSIGNEE)</div>
      <div class="field"><label>Empresa</label><value>${esc(importador?.nombre)}</value></div>
      <div class="field"><label>RUC</label><value>${esc(importador?.ruc)}</value></div>
      <div class="field"><label>Dirección</label><value>${esc(importador?.direccion||'Lima, Perú')}</value></div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">DATOS DE EMBARQUE</div>
    <div class="grid">
      <div><div class="field"><label>Puerto de Embarque</label><value>${esc(embarque?.puertoOrigen)}</value></div></div>
      <div><div class="field"><label>Puerto de Destino</label><value>${esc(embarque?.puertoDestino||'Callao, Perú')}</value></div></div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">DETALLE DE BULTOS</div>
    <table>
      <tr><th>#</th><th>Descripción</th><th>Partida</th><th class="right">Cant.</th><th class="right">Peso Neto</th><th class="right">Peso Bruto</th><th class="right">Bultos</th><th>Marcas</th></tr>
      ${rows}
      <tr class="total-row"><td colspan="3">TOTALES</td><td></td><td class="right">${totalNeto.toFixed(2)} kg</td><td class="right">${totalBruto.toFixed(2)} kg</td><td class="right">${totalBultos}</td><td></td></tr>
    </table>
  </div>
  <div class="footer">Packing List generado por Cotizador de Importación Perú v2.0</div>
</div></body></html>`;
}

// ══════════════════════════════════════════
// 3. COMMERCIAL INVOICE (Factura Comercial)
// ══════════════════════════════════════════
function generarInvoice(data) {
  const { items, importador, proveedor, pais, incoterm, moneda, referencia } = data;
  const cur = moneda || 'USD';
  const rows = (items||[]).map((it,i) => `
    <tr>
      <td>${i+1}</td>
      <td>${esc(it.desc)}</td>
      <td>${esc(it.hs)}</td>
      <td class="right">${it.qty||1}</td>
      <td class="right">${it.unidad||'PCS'}</td>
      <td class="right">${formatMoney(it.unit,cur)}</td>
      <td class="right">${formatMoney((it.qty||1)*(it.unit||0),cur)}</td>
    </tr>`).join('');
  const totalFOB = (items||[]).reduce((s,it) => s + (it.qty||1)*(it.unit||0), 0);

  return `<!DOCTYPE html><html><head><meta charset="utf-8">${CSS}</head><body>
<div class="page">
  <div class="header">
    <div><h1>COMMERCIAL INVOICE</h1><div>Factura Comercial / Proforma</div></div>
    <div class="doc-info">
      <div class="bold">Invoice: ${esc(referencia)||'INV-'+Date.now()}</div>
      <div>Date: ${formatDate()}</div>
      <div>Terms: ${esc(incoterm||'FOB')}</div>
    </div>
  </div>
  <div class="grid">
    <div class="section">
      <div class="section-title">SELLER / EXPORTER</div>
      <div class="field"><label>Company</label><value>${esc(proveedor?.nombre)}</value></div>
      <div class="field"><label>Country</label><value>${esc(pais)}</value></div>
      <div class="field"><label>Address</label><value>${esc(proveedor?.direccion)}</value></div>
    </div>
    <div class="section">
      <div class="section-title">BUYER / IMPORTER</div>
      <div class="field"><label>Company</label><value>${esc(importador?.nombre)}</value></div>
      <div class="field"><label>Tax ID (RUC)</label><value>${esc(importador?.ruc)}</value></div>
      <div class="field"><label>Address</label><value>${esc(importador?.direccion||'Lima, Peru')}</value></div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">GOODS DESCRIPTION</div>
    <table>
      <tr><th>#</th><th>Description</th><th>HS Code</th><th class="right">Qty</th><th class="right">Unit</th><th class="right">Unit Price</th><th class="right">Amount</th></tr>
      ${rows}
      <tr class="total-row"><td colspan="6">TOTAL ${esc(incoterm||'FOB')}</td><td class="right">${formatMoney(totalFOB,cur)}</td></tr>
    </table>
  </div>
  <div class="section">
    <div class="section-title">DECLARATIONS</div>
    <p style="font-size:10px;padding:6px;">We certify that the information contained in this invoice is true and correct and that the contents of this shipment are as stated above. Country of Origin: ${esc(pais)}. Country of Destination: Peru.</p>
    <div style="margin-top:30px; display:grid; grid-template-columns:1fr 1fr; gap:20px;">
      <div style="border-top:1px solid #333; padding-top:4px; text-align:center; font-size:10px;">Authorized Signature & Stamp (Seller)</div>
      <div style="border-top:1px solid #333; padding-top:4px; text-align:center; font-size:10px;">Date</div>
    </div>
  </div>
  <div class="footer">Generated by Cotizador de Importación Perú v2.0 — Reference document only</div>
</div></body></html>`;
}

// ══════════════════════════════════════════
// 4. RESUMEN DE PERMISOS
// ══════════════════════════════════════════
function generarResumenPermisos(data) {
  const { permisos } = data;
  const permRows = (permisos||[]).map(p => `
    <tr>
      <td>${p.icon||'📋'} ${esc(p.entidad)}</td>
      <td>${esc(p.nombre)}</td>
      <td>${esc(p.tramite)}</td>
      <td>${p.vuce ? '✅ VUCE' : 'Presencial'}</td>
      <td>${esc(p.web)}</td>
    </tr>`).join('');
  const pasosHtml = (permisos||[]).map(p => `
    <div class="section">
      <div class="section-title">${p.icon||'📋'} ${esc(p.entidad)} — ${esc(p.nombre)}</div>
      <div style="padding:6px;">
        <div class="bold">${esc(p.tramite)}</div>
        <ol style="margin:6px 0 6px 20px;font-size:10px;">
          ${(p.pasos||[]).map(paso => `<li style="margin:3px 0;">${paso}</li>`).join('')}
        </ol>
        <div style="font-size:9px;color:#666;">Web: ${esc(p.web)} | Tel: ${esc(p.telefono)} | ${p.vuce?'Tramita por VUCE':'Trámite presencial'}</div>
      </div>
    </div>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">${CSS}</head><body>
<div class="page">
  <div class="header">
    <div><h1>RESUMEN DE PERMISOS</h1><div>Autorizaciones requeridas para importación</div></div>
    <div class="doc-info"><div>Fecha: ${formatDate()}</div></div>
  </div>
  ${permisos?.length > 0 ? `
    <div class="warning">⚠ Esta importación requiere ${permisos.length} autorización(es). Tramitar ANTES del embarque para evitar demoras y sobrecostos de almacenaje.</div>
    <div class="section">
      <div class="section-title">ENTIDADES REGULADORAS</div>
      <table>
        <tr><th>Entidad</th><th>Nombre Completo</th><th>Trámite</th><th>Vía</th><th>Web</th></tr>
        ${permRows}
      </table>
    </div>
    ${pasosHtml}
  ` : '<div style="text-align:center;padding:40px;"><div class="stamp green" style="border-color:#2e7d32;">✅ SIN RESTRICCIONES</div><p style="margin-top:12px;">Esta mercancía no requiere permisos especiales para su importación al Perú.</p></div>'}
  <div class="footer">Generado por Cotizador de Importación Perú v2.0 — Verificar vigencia de requisitos en VUCE y entidades correspondientes</div>
</div></body></html>`;
}

module.exports = {
  generarCotizacion,
  generarPackingList,
  generarInvoice,
  generarResumenPermisos,
};
