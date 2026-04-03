const helpers = require('../../client/src/workspace-summary-helpers.cjs');
const { toNumber } = require('../../client/src/app-payload-helpers.cjs');

describe('workspace summary helpers', () => {
  const options = {
    toNumber,
    formatMoney: (value) => `USD ${Number(value).toFixed(2)}`,
    channelLabels: { MARITIMO: 'Maritimo formal' },
    objectiveLabels: { precio_sugerido: 'Costo + precio de venta sugerido' },
    subjectLabels: { empresa: 'Empresa' },
    insuranceModeLabels: { REAL: 'Seguro real' },
    importerLabels: { general: 'Importador general' },
    productConditionLabels: { nuevo: 'Producto nuevo', usado: 'Producto usado' },
  };

  it('trata null, string vacio y campos ausentes como pendientes en vez de convertirlos en cero o nuevo', () => {
    const rows = helpers.buildWorkspaceSummaryRows(
      {
        datos_previos: {
          productos: [{ cantidad: 1, descripcion: 'Laptop' }],
          precio_unitario: null,
          bien_usado: null,
          margen_venta: '',
          objetivo_calculo: 'precio_sugerido',
        },
      },
      options,
    );

    expect(rows.find((row) => row.label === 'Precio unitario')).toEqual({
      label: 'Precio unitario',
      value: 'Pendiente',
    });
    expect(rows.find((row) => row.label === 'Condicion del producto')).toEqual({
      label: 'Condicion del producto',
      value: 'Pendiente',
    });
    expect(rows.find((row) => row.label === 'Margen objetivo')).toEqual({
      label: 'Margen objetivo',
      value: 'Pendiente',
    });
  });

  it('resume productos con fallback seguro y preserva cantidades explicitas', () => {
    const summary = helpers.buildProductSummary(
      [
        { cantidad: '0', descripcion: 'Cable USB' },
        { qty: 2, producto: 'Router' },
        {},
      ],
      toNumber,
    );

    expect(summary).toBe('0 x Cable USB, 2 x Router, 1 x Producto 3');
  });

  it('respeta cero como valor utilizable cuando el numero si fue informado', () => {
    const rows = helpers.buildWorkspaceSummaryRows(
      {
        datos_previos: {
          productos: [{ cantidad: 1, descripcion: 'Mouse' }],
          precio_unitario: '0',
          bien_usado: false,
          margen_venta: '0',
          objetivo_calculo: 'precio_sugerido',
          tipo_sujeto: 'empresa',
          canal: 'MARITIMO',
          seguro_modo: 'REAL',
          tipo_importador: 'general',
        },
      },
      options,
    );

    expect(rows.find((row) => row.label === 'Precio unitario')?.value).toBe('USD 0.00');
    expect(rows.find((row) => row.label === 'Condicion del producto')?.value).toBe('Producto nuevo');
    expect(rows.find((row) => row.label === 'Margen objetivo')?.value).toBe('0%');
  });

  it('no interpreta el string false como si el producto fuera usado', () => {
    const rows = helpers.buildWorkspaceSummaryRows(
      {
        datos_previos: {
          productos: [{ cantidad: 1, descripcion: 'Laptop' }],
          bien_usado: 'false',
        },
      },
      options,
    );

    expect(rows.find((row) => row.label === 'Condicion del producto')?.value).toBe('Producto nuevo');
  });
});
