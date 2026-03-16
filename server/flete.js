// server/flete.js — Estimador inteligente de flete internacional
// Sin APIs externas — usa base de datos de tarifas referenciales por ruta/peso/volumen

// Tarifas referenciales USD (actualizadas periódicamente)
// Fuentes: promedios de mercado, cotizaciones públicas de freight forwarders
const TARIFAS = {
  // AEREO: USD por kg (mínimo 45kg para tarifa general, debajo es tarifa mínima)
  aereo: {
    "CN-PE": { perKg: 3.80, min: 120, transit: "5-8 días" },
    "US-PE": { perKg: 2.50, min: 85, transit: "3-5 días" },
    "DE-PE": { perKg: 4.20, min: 150, transit: "5-10 días" },
    "JP-PE": { perKg: 4.50, min: 160, transit: "5-8 días" },
    "KR-PE": { perKg: 3.90, min: 130, transit: "5-8 días" },
    "BR-PE": { perKg: 3.00, min: 90, transit: "3-5 días" },
    "MX-PE": { perKg: 2.80, min: 85, transit: "3-5 días" },
    "IT-PE": { perKg: 4.00, min: 140, transit: "7-12 días" },
    "ES-PE": { perKg: 3.80, min: 135, transit: "7-12 días" },
    "IN-PE": { perKg: 4.00, min: 140, transit: "7-10 días" },
    "TH-PE": { perKg: 4.20, min: 150, transit: "7-10 días" },
    "TW-PE": { perKg: 3.50, min: 120, transit: "5-8 días" },
    default:  { perKg: 4.50, min: 150, transit: "7-14 días" },
  },
  // MARITIMO: USD por CBM (metro cúbico) — FCL y LCL
  maritimo: {
    "CN-PE": { perCBM: 55, min20ft: 1200, min40ft: 2200, transit: "28-35 días" },
    "US-PE": { perCBM: 65, min20ft: 1000, min40ft: 1800, transit: "15-22 días" },
    "DE-PE": { perCBM: 70, min20ft: 1400, min40ft: 2600, transit: "30-40 días" },
    "JP-PE": { perCBM: 50, min20ft: 1100, min40ft: 2000, transit: "25-32 días" },
    "KR-PE": { perCBM: 48, min20ft: 1000, min40ft: 1900, transit: "25-30 días" },
    "BR-PE": { perCBM: 45, min20ft: 800, min40ft: 1500, transit: "12-18 días" },
    "IN-PE": { perCBM: 52, min20ft: 1300, min40ft: 2400, transit: "30-40 días" },
    default:  { perCBM: 65, min20ft: 1400, min40ft: 2600, transit: "30-45 días" },
  },
  // COURIER: USD por kg (peso facturable = mayor entre real y volumétrico)
  courier: {
    "CN-PE": { perKg: 8.50, min: 35, transit: "3-7 días" },
    "US-PE": { perKg: 6.00, min: 25, transit: "2-5 días" },
    "DE-PE": { perKg: 9.00, min: 40, transit: "3-7 días" },
    "JP-PE": { perKg: 9.50, min: 40, transit: "3-7 días" },
    default:  { perKg: 10.00, min: 45, transit: "5-10 días" },
  },
};

// Costos adicionales por puerto (Callao es el principal)
const COSTOS_PUERTO = {
  maritimo: {
    thc: 150,          // Terminal Handling Charge
    bl: 60,            // Bill of Lading
    handling: 80,      // Agencia marítima
    almacen: 0,        // 0 si retiras antes de día libre (5 días generalmente)
    aforo: 45,         // Si sale a aforo físico
    traccion: 120,     // Transporte contenedor → almacén
  },
  aereo: {
    awb: 50,           // Air Waybill
    handling: 65,      // Handling aeroportuario
    almacen: 0,
  },
};

// Calculate volumetric weight (industry standard)
function pesoVolumetrico(largoCm, anchoCm, altoCm, factorDivisor) {
  return (largoCm * anchoCm * altoCm) / (factorDivisor || 5000); // Aéreo: 5000, Marítimo: 1000000 (CBM)
}

// Main estimator
function estimarFlete(params) {
  const {
    origen,          // Country code: "CN", "US", etc.
    destino = "PE",
    canal,           // "AEREO", "MARITIMO", "COURIER"
    pesoRealKg,
    largoCm, anchoCm, altoCm,
    cantidadBultos = 1,
    valorFOB,
  } = params;

  const ruta = `${origen}-${destino}`;
  const result = {
    canal,
    ruta,
    pesoReal: pesoRealKg || 0,
    pesoVolumetrico: 0,
    pesoFacturable: 0,
    flete: 0,
    costosAdicionales: {},
    totalEstimado: 0,
    tiempoTransito: "",
    desglose: [],
    nota: "Estimado referencial. Solicitar cotización formal al freight forwarder.",
  };

  if (canal === "AEREO" || canal === "aereo") {
    const tarifas = TARIFAS.aereo[ruta] || TARIFAS.aereo.default;
    const volKg = pesoVolumetrico(largoCm||0, anchoCm||0, altoCm||0, 6000) * cantidadBultos;
    result.pesoVolumetrico = volKg;
    result.pesoFacturable = Math.max(pesoRealKg || 0, volKg);
    result.flete = Math.max(result.pesoFacturable * tarifas.perKg, tarifas.min);
    result.costosAdicionales = COSTOS_PUERTO.aereo;
    result.tiempoTransito = tarifas.transit;
    result.desglose = [
      { concepto: "Flete aéreo", monto: result.flete, detalle: `${result.pesoFacturable.toFixed(1)}kg × $${tarifas.perKg}/kg` },
      { concepto: "AWB", monto: COSTOS_PUERTO.aereo.awb },
      { concepto: "Handling aeroportuario", monto: COSTOS_PUERTO.aereo.handling },
    ];

  } else if (canal === "MARITIMO" || canal === "maritimo") {
    const tarifas = TARIFAS.maritimo[ruta] || TARIFAS.maritimo.default;
    const cbm = ((largoCm||100) * (anchoCm||100) * (altoCm||100)) / 1000000 * cantidadBultos;
    result.pesoVolumetrico = cbm;
    result.pesoFacturable = cbm;

    // LCL vs FCL
    const fleteLC = cbm * tarifas.perCBM;
    if (cbm < 15) {
      // LCL (Less than Container Load)
      result.flete = Math.max(fleteLC, tarifas.perCBM * 1); // Mínimo 1 CBM
      result.desglose.push({ concepto: "Flete marítimo (LCL)", monto: result.flete, detalle: `${cbm.toFixed(2)} CBM × $${tarifas.perCBM}/CBM` });
    } else if (cbm < 33) {
      // 20ft container
      result.flete = tarifas.min20ft;
      result.desglose.push({ concepto: "Flete marítimo (20ft FCL)", monto: result.flete });
    } else {
      // 40ft container
      result.flete = tarifas.min40ft;
      result.desglose.push({ concepto: "Flete marítimo (40ft FCL)", monto: result.flete });
    }
    result.costosAdicionales = COSTOS_PUERTO.maritimo;
    result.tiempoTransito = tarifas.transit;
    result.desglose.push(
      { concepto: "THC (Terminal)", monto: COSTOS_PUERTO.maritimo.thc },
      { concepto: "B/L", monto: COSTOS_PUERTO.maritimo.bl },
      { concepto: "Handling", monto: COSTOS_PUERTO.maritimo.handling },
      { concepto: "Tracción", monto: COSTOS_PUERTO.maritimo.traccion },
    );

  } else if (canal === "COURIER" || canal === "courier") {
    const tarifas = TARIFAS.courier[ruta] || TARIFAS.courier.default;
    const volKg = pesoVolumetrico(largoCm||0, anchoCm||0, altoCm||0, 5000) * cantidadBultos;
    result.pesoVolumetrico = volKg;
    result.pesoFacturable = Math.max(pesoRealKg || 0, volKg);
    result.flete = Math.max(result.pesoFacturable * tarifas.perKg, tarifas.min);
    result.tiempoTransito = tarifas.transit;
    result.desglose = [
      { concepto: "Flete courier", monto: result.flete, detalle: `${result.pesoFacturable.toFixed(1)}kg × $${tarifas.perKg}/kg` },
    ];
  }

  // Seguro estimado (1-2% del FOB)
  if (valorFOB > 0) {
    const seguro = valorFOB * 0.015;
    result.desglose.push({ concepto: "Seguro estimado (1.5%)", monto: seguro });
    result.seguroEstimado = seguro;
  }

  // Total
  const extras = Object.values(result.costosAdicionales).reduce((s,v) => s+v, 0);
  result.totalEstimado = result.flete + extras + (result.seguroEstimado || 0);

  return result;
}

module.exports = { estimarFlete, TARIFAS, COSTOS_PUERTO };
