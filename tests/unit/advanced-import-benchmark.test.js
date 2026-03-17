const fs = require('fs');
const path = require('path');

const {
  calculateAdvancedImportBenchmark,
  extractAdvancedImportCaseFromText,
} = require('../../server/benchmarks/advanced-import-benchmark');

const caseFixture = require('../../server/benchmarks/fixtures/ksarp-pc1.case.json');
const expectedFixture = require('../../server/benchmarks/fixtures/ksarp-pc1.expected.json');

const textFixture = fs.readFileSync(
  path.join(__dirname, '../../server/benchmarks/fixtures/ksarp-pc1.txt'),
  'utf8'
);

function expectCurrencyClose(actual, expected, tolerance = expectedFixture.tolerances.currency) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

describe('advanced import benchmark', () => {
  it('extrae los campos clave del texto del examen', () => {
    const resultado = extractAdvancedImportCaseFromText(textFixture);

    expect(resultado.extracted.proveedor).toBe('BOBIN Corp.');
    expect(resultado.extracted.pais).toBe('US');
    expect(resultado.extracted.incoterm).toBe('FOB');
    expect(resultado.extracted.fobTotal).toBe(26595);
    expect(resultado.extracted.flete).toBe(2800);
    expect(resultado.extracted.bankFees.map((item) => item.amount)).toEqual([45, 54]);
    expect(resultado.extracted.insurance.overInsurancePct).toBe(7);
    expect(resultado.extracted.insurance.premiumRatePct).toBe(0.45);
    expect(resultado.extracted.internalTransport).toBe(1350);
    expect(resultado.extracted.adminExpensePct).toBe(4.6);
    expect(resultado.extracted.financing.installmentsDays).toEqual([45, 60, 75]);
    expect(resultado.extracted.financing.ratePer30DaysPct).toBe(2.3);
    expect(resultado.extracted.distributionChain.map((item) => item.marginPct)).toEqual([35, 45]);
    expect(resultado.extracted.localCharges).toHaveLength(10);
    expect(resultado.report.missing).toEqual([]);
  });

  it('calcula el benchmark academico con los resultados esperados', () => {
    const resultado = calculateAdvancedImportBenchmark({
      ...caseFixture,
      benchmarkMode: 'academic',
    });

    expect(resultado.academic).toBeTruthy();
    expect(resultado.operational).toBeNull();

    expectCurrencyClose(resultado.academic.customsValue, expectedFixture.academic.customsValue);
    expectCurrencyClose(resultado.academic.perception, expectedFixture.academic.perception);
    expectCurrencyClose(resultado.academic.insurance.sumInsured, expectedFixture.academic.sumInsured);
    expectCurrencyClose(resultado.academic.insurance.premium, expectedFixture.academic.premium);
    expectCurrencyClose(resultado.academic.importCost.total, expectedFixture.academic.totalImportCost);

    resultado.academic.financing.installments.forEach((installment, index) => {
      expect(installment.days).toBe(expectedFixture.academic.letters[index].days);
      expectCurrencyClose(installment.total, expectedFixture.academic.letters[index].total);
    });

    resultado.academic.importCost.byProduct.forEach((item, index) => {
      expect(item.desc).toBe(expectedFixture.academic.byProduct[index].desc);
      expectCurrencyClose(item.allocatedTotal, expectedFixture.academic.byProduct[index].allocatedTotal);
      expectCurrencyClose(item.unitCost, expectedFixture.academic.byProduct[index].unitCost);
    });

    expectCurrencyClose(
      resultado.academic.distribution[0].saleTotalWithoutTax,
      expectedFixture.academic.distribution.importadorSaleTotalWithoutTax
    );
    expectCurrencyClose(
      resultado.academic.distribution[1].saleTotalWithoutTax,
      expectedFixture.academic.distribution.mayoristaSaleTotalWithoutTax
    );
    expectCurrencyClose(
      resultado.academic.creditFiscal.importador.creditoFiscal,
      expectedFixture.academic.creditFiscal.importador.creditoFiscal
    );
    expectCurrencyClose(
      resultado.academic.creditFiscal.importador.debitoFiscal,
      expectedFixture.academic.creditFiscal.importador.debitoFiscal
    );
    expectCurrencyClose(
      resultado.academic.creditFiscal.mayorista.igvPorPagar,
      expectedFixture.academic.creditFiscal.mayorista.igvPorPagar
    );
  });

  it('calcula la lectura operativa y marca diferencias relevantes', () => {
    const resultado = calculateAdvancedImportBenchmark({
      ...caseFixture,
      benchmarkMode: 'hybrid',
    });

    expect(resultado.academic).toBeTruthy();
    expect(resultado.operational).toBeTruthy();
    expect(resultado.differences.length).toBeGreaterThanOrEqual(2);

    expectCurrencyClose(resultado.operational.customsValue, expectedFixture.operational.customsValue);
    expectCurrencyClose(resultado.operational.perception, expectedFixture.operational.perception);
    expectCurrencyClose(resultado.operational.insurance.sumInsured, expectedFixture.operational.sumInsured);
    expectCurrencyClose(resultado.operational.insurance.premium, expectedFixture.operational.premium);
    expectCurrencyClose(resultado.operational.importCost.total, expectedFixture.operational.totalImportCost);
    expectCurrencyClose(
      resultado.operational.importCost.financeCostSeparated,
      expectedFixture.operational.financeCostSeparated
    );

    resultado.operational.importCost.byProduct.forEach((item, index) => {
      expect(item.desc).toBe(expectedFixture.operational.byProduct[index].desc);
      expectCurrencyClose(item.allocatedTotal, expectedFixture.operational.byProduct[index].allocatedTotal);
      expectCurrencyClose(item.unitCost, expectedFixture.operational.byProduct[index].unitCost);
    });

    expectCurrencyClose(
      resultado.operational.distribution[0].saleTotalWithoutTax,
      expectedFixture.operational.distribution.importadorSaleTotalWithoutTax
    );
    expectCurrencyClose(
      resultado.operational.distribution[1].saleTotalWithoutTax,
      expectedFixture.operational.distribution.mayoristaSaleTotalWithoutTax
    );

    const diffKeys = resultado.differences.map((item) => item.key);
    expect(diffKeys).toContain('import_cost_total');
    expect(diffKeys).toContain('financing_treatment');
  });
});
