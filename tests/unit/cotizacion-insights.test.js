const { describe, expect, it } = require('@jest/globals');

const {
  dedupePermisos,
  generarRecomendacionesResultado,
} = require('../../server/cotizacion-insights');

describe('cotizacion-insights', () => {
  it('deduplica permisos y conserva productos detectados', () => {
    const permisos = dedupePermisos(
      [],
      [
        {
          desc: 'router wifi',
          permisos: {
            permisos: [
              {
                entidad: 'MTC',
                nombre: 'Ministerio de Transportes y Comunicaciones',
                tramite: 'Homologacion de equipos',
                vuce: true,
              },
            ],
          },
        },
        {
          desc: 'celular',
          permisos: {
            permisos: [
              {
                entidad: 'MTC',
                nombre: 'Ministerio de Transportes y Comunicaciones',
                tramite: 'Homologacion de equipos',
                vuce: true,
              },
            ],
          },
        },
      ]
    );

    expect(permisos).toHaveLength(1);
    expect(permisos[0].entidad).toBe('MTC');
    expect(permisos[0].productosDetectados).toEqual(expect.arrayContaining(['router wifi', 'celular']));
  });

  it('genera recomendaciones accionables a partir del resultado', () => {
    const recomendaciones = generarRecomendacionesResultado({
      pais: 'CN',
      canal: 'COURIER',
      incoterm: 'CIF',
      resultado: {
        permisos: [{ entidad: 'MTC' }],
        items: [{ desc: 'router wifi', tlc: null }],
        alertas: [{ tipo: 'antidumping' }],
        precision: {
          componentes: {
            flete: { referencial: true },
            seguro: { referencial: true },
            incoterm: { referencial: true },
          },
        },
        totales: {
          margenVenta: { margenPct: 15 },
        },
      },
    });

    expect(recomendaciones.some((item) => item.tipo === 'permisos')).toBe(true);
    expect(recomendaciones.some((item) => item.tipo === 'flete')).toBe(true);
    expect(recomendaciones.some((item) => item.tipo === 'seguro')).toBe(true);
    expect(recomendaciones.some((item) => item.tipo === 'incoterm')).toBe(true);
  });
});
