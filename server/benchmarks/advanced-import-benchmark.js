const path = require('path');

const ksarpPc1Case = require('./fixtures/ksarp-pc1.case.json');
const ksarpPc1Expected = require('./fixtures/ksarp-pc1.expected.json');

const IGV_RATE = 0.16;
const IPM_RATE = 0.02;
const SALES_TAX_RATE = 0.18;

/**
 * @typedef {Object} AdvancedImportCase
 * @property {string=} benchmarkCaseId
 * @property {string=} benchmarkMode
 * @property {Array<Object>=} items
 * @property {string=} proveedor
 * @property {string=} pais
 * @property {string=} incoterm
 * @property {number=} flete
 * @property {number=} seguro
 * @property {number=} tc
 * @property {Array<{description:string,amount:number}>=} bankFees
 * @property {{overInsurancePct:number,premiumRatePct:number}=} insurance
 * @property {Array<{name:string,amount:number}>=} localCharges
 * @property {{commissionPct:number,minimum:number}=} customsBroker
 * @property {number=} internalTransport
 * @property {number=} adminExpensePct
 * @property {{installmentsDays:number[],ratePer30DaysPct:number,financedConcepts:string[]}=} financing
 * @property {Array<{name:string,marginPct:number}>=} distributionChain
 */

/**
 * @typedef {Object} BenchmarkExpectedResult
 * @property {Object} academic
 * @property {Object} operational
 * @property {{currency:number}=} tolerances
 */

function round2(value) {
  return Number((Number(value || 0)).toFixed(2));
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sumAmounts(entries = [], field = 'amount') {
  return entries.reduce((total, entry) => total + toNumber(entry?.[field]), 0);
}

function normalizeItems(items = []) {
  return (items || []).map((item) => {
    const qty = toNumber(item.qty ?? item.cantidad, 0);
    const unit = toNumber(item.unit ?? item.precioUnitario, 0);
    const fobTotal = toNumber(item.total, qty * unit);

    return {
      desc: item.desc || item.descripcion || item.articulo || '',
      qty,
      unit,
      fobTotal: round2(fobTotal),
    };
  });
}

function hasAdvancedBenchmarkInput(input = {}) {
  return Boolean(
    input?.benchmarkMode
    || input?.bankFees
    || input?.insurance
    || input?.localCharges
    || input?.customsBroker
    || input?.internalTransport
    || input?.adminExpensePct !== undefined
    || input?.financing
    || input?.distributionChain
  );
}

function loadBenchmarkFixture(caseId) {
  if (caseId === 'ksarp-pc1') {
    return {
      caseData: ksarpPc1Case,
      expected: ksarpPc1Expected,
      casePath: path.join(__dirname, 'fixtures', 'ksarp-pc1.case.json'),
      expectedPath: path.join(__dirname, 'fixtures', 'ksarp-pc1.expected.json'),
    };
  }

  return null;
}

function mergeCaseWithFixture(input = {}) {
  const fixture = loadBenchmarkFixture(input.benchmarkCaseId);
  const base = fixture?.caseData || {};

  return {
    ...base,
    ...input,
    items: normalizeItems(input.items?.length ? input.items : base.items),
    bankFees: input.bankFees || base.bankFees || [],
    localCharges: input.localCharges || base.localCharges || [],
    insurance: { ...(base.insurance || {}), ...(input.insurance || {}) },
    customsBroker: { ...(base.customsBroker || {}), ...(input.customsBroker || {}) },
    financing: { ...(base.financing || {}), ...(input.financing || {}) },
    distributionChain: input.distributionChain || base.distributionChain || [],
    benchmarkMode: (input.benchmarkMode || base.benchmarkMode || 'hybrid').toLowerCase(),
  };
}

function buildInstallments(financingBase, financing = {}) {
  const days = financing.installmentsDays || [];
  const ratePer30DaysPct = toNumber(financing.ratePer30DaysPct);

  if (!days.length || !ratePer30DaysPct || financingBase <= 0) {
    return {
      base: round2(financingBase),
      ratePer30DaysPct: round2(ratePer30DaysPct),
      installments: [],
      totalInterest: 0,
      totalWithInterest: round2(financingBase),
    };
  }

  const principalByInstallment = financingBase / days.length;
  const installments = days.map((day) => {
    const interest = principalByInstallment * (ratePer30DaysPct / 100) * (day / 30);
    const total = principalByInstallment + interest;

    return {
      days: day,
      principal: round2(principalByInstallment),
      interest: round2(interest),
      total: round2(total),
    };
  });

  const totalInterest = installments.reduce((total, item) => total + item.interest, 0);
  const totalWithInterest = installments.reduce((total, item) => total + item.total, 0);

  return {
    base: round2(financingBase),
    ratePer30DaysPct: round2(ratePer30DaysPct),
    installments,
    totalInterest: round2(totalInterest),
    totalWithInterest: round2(totalWithInterest),
  };
}

function allocateByFobShare(items, totalAmount) {
  const fobTotal = items.reduce((total, item) => total + item.fobTotal, 0);

  return items.map((item) => {
    const share = fobTotal > 0 ? item.fobTotal / fobTotal : 0;
    const allocatedTotal = totalAmount * share;
    const unitCost = item.qty > 0 ? allocatedTotal / item.qty : 0;

    return {
      desc: item.desc,
      qty: item.qty,
      fobTotal: round2(item.fobTotal),
      sharePct: round2(share * 100),
      allocatedTotal: round2(allocatedTotal),
      unitCost: round2(unitCost),
    };
  });
}

function buildDistributionForMode(totalCost, allocation, distributionChain = []) {
  let stageBaseTotal = totalCost;
  let currentUnitMap = new Map(
    allocation.map((item) => [item.desc, item.unitCost])
  );

  return distributionChain.map((stage) => {
    const marginPct = toNumber(stage.marginPct);
    const saleTotalWithoutTax = stageBaseTotal * (1 + (marginPct / 100));
    const saleTotalWithTax = saleTotalWithoutTax * (1 + SALES_TAX_RATE);
    const factor = 1 + (marginPct / 100);

    const byProduct = allocation.map((item) => {
      const baseUnitCost = currentUnitMap.get(item.desc) || item.unitCost;
      const saleUnitWithoutTax = baseUnitCost * factor;
      const saleUnitWithTax = saleUnitWithoutTax * (1 + SALES_TAX_RATE);

      return {
        desc: item.desc,
        qty: item.qty,
        baseUnitCost: round2(baseUnitCost),
        saleUnitWithoutTax: round2(saleUnitWithoutTax),
        saleUnitWithTax: round2(saleUnitWithTax),
        saleTotalWithoutTax: round2(saleUnitWithoutTax * item.qty),
        saleTotalWithTax: round2(saleUnitWithTax * item.qty),
      };
    });

    currentUnitMap = new Map(
      byProduct.map((item) => [item.desc, item.saleUnitWithoutTax])
    );
    stageBaseTotal = saleTotalWithoutTax;

    return {
      name: stage.name,
      marginPct: round2(marginPct),
      baseTotal: round2(stageBaseTotal / factor),
      saleTotalWithoutTax: round2(saleTotalWithoutTax),
      saleTotalWithTax: round2(saleTotalWithTax),
      byProduct,
    };
  });
}

function buildCreditFiscal(importCreditTotal, distributionStages = []) {
  const [importador, mayorista] = distributionStages;
  const importerDebit = round2(importador?.saleTotalWithoutTax * SALES_TAX_RATE || 0);
  const wholesalerCredit = importerDebit;
  const wholesalerDebit = round2(mayorista?.saleTotalWithoutTax * SALES_TAX_RATE || 0);

  return {
    importador: {
      creditoFiscal: round2(importCreditTotal),
      debitoFiscal: importerDebit,
      igvPorPagar: round2(importerDebit - importCreditTotal),
    },
    mayorista: {
      creditoFiscal: wholesalerCredit,
      debitoFiscal: wholesalerDebit,
      igvPorPagar: round2(wholesalerDebit - wholesalerCredit),
    },
  };
}

function buildDifferences(academic, operational) {
  const differences = [];

  if (academic.importCost.total !== operational.importCost.total) {
    differences.push({
      key: 'import_cost_total',
      label: 'Costo de importacion total',
      academic: academic.importCost.total,
      operational: operational.importCost.total,
      reason: 'La lectura academica capitaliza el costo financiero de las letras; la operativa lo separa como gasto financiero.',
    });
  }

  if (academic.financing.totalInterest === operational.financing.totalInterest) {
    differences.push({
      key: 'financing_treatment',
      label: 'Tratamiento del financiamiento',
      academic: `Incluido en costo (${academic.financing.totalInterest})`,
      operational: `Separado del costo (${operational.financing.totalInterest})`,
      reason: 'Ambas lecturas calculan las mismas letras, pero no las incorporan igual al costo final.',
    });
  }

  if (academic.distribution[0]?.saleTotalWithoutTax !== operational.distribution[0]?.saleTotalWithoutTax) {
    differences.push({
      key: 'importer_sale_total',
      label: 'Venta del importador sin IGV',
      academic: academic.distribution[0]?.saleTotalWithoutTax,
      operational: operational.distribution[0]?.saleTotalWithoutTax,
      reason: 'La base de costo del importador cambia por el tratamiento del financiamiento.',
    });
  }

  return differences;
}

function calculateMode(caseData, modeName) {
  const items = normalizeItems(caseData.items);
  const fobTotal = round2(
    toNumber(caseData.fobTotal, items.reduce((total, item) => total + item.fobTotal, 0))
  );
  const freight = round2(toNumber(caseData.flete));
  const overInsurancePct = toNumber(caseData.insurance?.overInsurancePct);
  const premiumRatePct = toNumber(caseData.insurance?.premiumRatePct);
  const insuredBase = fobTotal + freight;
  const sumInsured = insuredBase * (1 + (overInsurancePct / 100));
  const insurancePremium = round2(sumInsured * (premiumRatePct / 100));
  const customsValue = round2(fobTotal + freight + insurancePremium);
  const adValoremRate = toNumber(caseData.adValoremRate);
  const adValorem = round2(customsValue * (adValoremRate / 100));
  const isc = 0;
  const taxableBase = customsValue + adValorem + isc;
  const igv = round2(taxableBase * IGV_RATE);
  const ipm = round2(taxableBase * IPM_RATE);
  const perceptionRate = toNumber(caseData.perceptionRatePct, 3.5);
  const perceptionBase = customsValue + adValorem + isc + igv + ipm;
  const perception = round2(perceptionBase * (perceptionRate / 100));
  const taxesTotal = round2(adValorem + isc + igv + ipm + perception);
  const localChargesTotal = round2(sumAmounts(caseData.localCharges));
  const customsBroker = round2(
    Math.max(
      toNumber(caseData.customsBroker?.minimum),
      customsValue * (toNumber(caseData.customsBroker?.commissionPct) / 100)
    )
  );
  const internalTransport = round2(toNumber(caseData.internalTransport));
  const bankFeesTotal = round2(sumAmounts(caseData.bankFees));
  const adminExpense = round2(customsValue * (toNumber(caseData.adminExpensePct) / 100));
  const landedCost = round2(
    customsValue
    + taxesTotal
    + localChargesTotal
    + customsBroker
    + internalTransport
    + bankFeesTotal
  );
  const commercialCost = round2(landedCost + adminExpense);

  const financingBase = round2(
    customsValue
    + taxesTotal
    + localChargesTotal
    + customsBroker
    + internalTransport
  );
  const financing = buildInstallments(financingBase, caseData.financing);

  const totalCost = modeName === 'academic'
    ? round2(commercialCost + financing.totalInterest)
    : commercialCost;

  const allocation = allocateByFobShare(items, totalCost);
  const distribution = buildDistributionForMode(totalCost, allocation, caseData.distributionChain);
  const creditFiscal = buildCreditFiscal(igv + ipm, distribution);

  return {
    mode: modeName,
    customsValue,
    perception,
    insurance: {
      insuredBase: round2(insuredBase),
      overInsurancePct: round2(overInsurancePct),
      sumInsured: round2(sumInsured),
      premiumRatePct: round2(premiumRatePct),
      premium: insurancePremium,
    },
    taxes: {
      adValoremRate: round2(adValoremRate),
      adValorem,
      isc,
      igv,
      ipm,
      perceptionRatePct: round2(perceptionRate),
      perception,
      total: taxesTotal,
    },
    localCosts: {
      chargesTotal: localChargesTotal,
      charges: caseData.localCharges || [],
      customsBroker,
      internalTransport,
      bankFeesTotal,
      adminExpense,
    },
    financing,
    importCost: {
      landedCost,
      commercialCost,
      total: totalCost,
      financeCostSeparated: modeName === 'operational' ? financing.totalInterest : 0,
      byProduct: allocation,
    },
    distribution,
    creditFiscal,
  };
}

function calculateAdvancedImportBenchmark(input = {}) {
  const mergedCase = mergeCaseWithFixture(input);
  const fixture = loadBenchmarkFixture(mergedCase.benchmarkCaseId);
  const academic = calculateMode(mergedCase, 'academic');
  const operational = calculateMode(mergedCase, 'operational');
  const mode = mergedCase.benchmarkMode || 'hybrid';
  const differences = buildDifferences(academic, operational);

  return {
    caseId: mergedCase.benchmarkCaseId || 'custom-advanced-case',
    mode,
    source: {
      fixturePath: fixture?.casePath || null,
      expectedPath: fixture?.expectedPath || null,
    },
    academic: mode === 'operational' ? null : academic,
    operational: mode === 'academic' ? null : operational,
    differences: mode === 'hybrid' ? differences : [],
    expected: fixture?.expected || null,
  };
}

function extractAdvancedImportCaseFromText(text = '') {
  const raw = String(text || '');
  const normalized = raw.replace(/\r/g, '');
  const cleanNumber = (value) => {
    if (!value) return null;
    const input = String(value).trim().replace(/[.,]$/, '');
    let normalizedValue = input;

    if (input.includes('.') && input.includes(',')) {
      if (input.lastIndexOf('.') > input.lastIndexOf(',')) {
        normalizedValue = input.replace(/,/g, '');
      } else {
        const lastComma = input.lastIndexOf(',');
        normalizedValue = `${input.slice(0, lastComma).replace(/[.,]/g, '')}.${input.slice(lastComma + 1)}`;
      }
    } else if (input.includes(',')) {
      const commas = (input.match(/,/g) || []).length;
      if (commas > 1) {
        const lastComma = input.lastIndexOf(',');
        normalizedValue = `${input.slice(0, lastComma).replace(/,/g, '')}.${input.slice(lastComma + 1)}`;
      } else {
        normalizedValue = input.replace(',', '.');
      }
    } else {
      normalizedValue = input;
    }

    normalizedValue = normalizedValue.replace(/[^\d.]/g, '');
    const parsed = Number(normalizedValue);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const capture = (regex) => normalized.match(regex);

  const providerMatch = capture(/empresa\s+([A-Z][A-Z .]+?)\s+de\s+USA/i) || capture(/(BOBIN\s+Corp\.)/i);
  const incotermMatch = capture(/T[ée]rmino de compra\s+(FOB|CIF|CFR|EXW|FCA|CIP|DAP|DDP)/i);
  const fobMatch = capture(/FOB Total\s+US\$\s*([\d.,]+)/i) || capture(/FOB TOTAL US\$\s*([\d.,]+)/i);
  const freightMatch = capture(/Flete de transporte mar[íi]timo de US\$\s*([\d.,]+)/i);
  const insuranceOverMatch = capture(/sobreseguro es de\s*([\d.,]+)\s*%/i);
  const premiumRateMatch = capture(/Prima Neta es de\s*([\d.,]+)\s*%/i);
  const adminExpenseMatch = capture(/gastos administrativos.*?([\d.,]+)\s*%\s*del precio CIF/i);
  const financingDaysMatch = capture(/(\d+)\s*,\s*(\d+)\s*y\s*(\d+)\s*d[ií]as/i);
  const financingRateMatch = capture(/tasa de inter[eé]s de\s*([\d.,]+)\s*%\s*por cada 30 d[ií]as/i);
  const tcMatch = capture(/Tipo de cambio es de S\/\s*([\d.,]+)/i);
  const importerMarginMatch = capture(/IMPORTADOR.*?(\d+)\s*%\s*de utilidad/i);
  const wholesalerMarginMatch = capture(/MAYORISTA.*?(\d+)\s*%\s*de sus costos totales/i);
  const bankFeeMatches = [...normalized.matchAll(/comisi[oó]n de transferencia el importe de US\$\s*([\d.,]+)/gi)];
  const dateMatches = [...normalized.matchAll(/(\d{1,2}\s+de\s+[a-záéíóú]+)/gi)].map((item) => item[1]);
  const chargeMatches = [...normalized.matchAll(/([A-Za-z°/ ]+):\s*US\$\s*([\d.,]+)/g)];
  const itemMatches = [...normalized.matchAll(/(\d+)Unid\.\s*([A-Za-zÁÉÍÓÚáéíóú]+)\s*(\d+\.\d{2})(\d+\.\d{2})/g)];

  const parsedCharges = chargeMatches.map((match) => ({
    name: match[1].replace(/\s+/g, ' ').trim(),
    amount: cleanNumber(match[2]),
  })).filter((item) => item.amount !== null);
  const internalTransportCharge = parsedCharges.find((item) => /transporte interno/i.test(item.name));
  const localCharges = parsedCharges.filter((item) => !/transporte interno/i.test(item.name));

  const items = itemMatches.map((match) => ({
    desc: match[2].trim(),
    qty: Number(match[1]),
    unit: Number(match[3]),
    total: Number(match[4]),
  }));

  const extracted = {
    proveedor: providerMatch ? providerMatch[1].replace(/\s+/g, ' ').trim() : null,
    pais: normalized.includes('de USA') ? 'US' : null,
    incoterm: incotermMatch ? incotermMatch[1].toUpperCase() : null,
    fobTotal: cleanNumber(fobMatch?.[1]),
    flete: cleanNumber(freightMatch?.[1]),
    bankFees: bankFeeMatches.map((match, index) => ({
      description: `Comision bancaria ${index + 1}`,
      amount: cleanNumber(match[1]),
    })),
    insurance: {
      overInsurancePct: cleanNumber(insuranceOverMatch?.[1]),
      premiumRatePct: cleanNumber(premiumRateMatch?.[1]),
    },
    dates: dateMatches,
    localCharges,
    internalTransport: internalTransportCharge?.amount ?? null,
    adminExpensePct: cleanNumber(adminExpenseMatch?.[1]),
    financing: {
      installmentsDays: financingDaysMatch ? financingDaysMatch.slice(1, 4).map(Number) : [],
      ratePer30DaysPct: cleanNumber(financingRateMatch?.[1]),
    },
    distributionChain: [
      { name: 'importador', marginPct: cleanNumber(importerMarginMatch?.[1]) },
      { name: 'mayorista', marginPct: cleanNumber(wholesalerMarginMatch?.[1]) },
    ].filter((item) => item.marginPct !== null),
    tc: cleanNumber(tcMatch?.[1]),
    items,
  };

  const requiredFields = [
    'proveedor',
    'pais',
    'incoterm',
    'fobTotal',
    'flete',
    'adminExpensePct',
    'tc',
  ];
  const missing = requiredFields.filter((field) => !extracted[field]);
  if (!extracted.bankFees.length) missing.push('bankFees');
  if (!extracted.localCharges.length) missing.push('localCharges');
  if (!extracted.financing.installmentsDays.length) missing.push('financing.installmentsDays');
  if (!extracted.financing.ratePer30DaysPct) missing.push('financing.ratePer30DaysPct');
  if (!extracted.insurance.overInsurancePct) missing.push('insurance.overInsurancePct');
  if (!extracted.insurance.premiumRatePct) missing.push('insurance.premiumRatePct');
  if (!extracted.distributionChain.length) missing.push('distributionChain');

  return {
    extracted,
    report: {
      matchedFields: {
        proveedor: Boolean(extracted.proveedor),
        pais: Boolean(extracted.pais),
        incoterm: Boolean(extracted.incoterm),
        fobTotal: Boolean(extracted.fobTotal),
        flete: Boolean(extracted.flete),
        bankFees: extracted.bankFees.length,
        insurance: Boolean(extracted.insurance.overInsurancePct && extracted.insurance.premiumRatePct),
        dates: extracted.dates.length,
        localCharges: extracted.localCharges.length,
        internalTransport: Boolean(extracted.internalTransport),
        adminExpensePct: Boolean(extracted.adminExpensePct),
        financing: Boolean(extracted.financing.installmentsDays.length && extracted.financing.ratePer30DaysPct),
        distributionChain: extracted.distributionChain.length,
      },
      missing,
      confidencePct: round2(Math.max(0, ((requiredFields.length + 6 - missing.length) / (requiredFields.length + 6)) * 100)),
    },
  };
}

module.exports = {
  hasAdvancedBenchmarkInput,
  loadBenchmarkFixture,
  mergeCaseWithFixture,
  calculateAdvancedImportBenchmark,
  extractAdvancedImportCaseFromText,
};
