const fs = require('fs');
const path = require('path');
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
    expect(permisos[0].icon).toBe('info');
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
    expect(recomendaciones.find((item) => item.tipo === 'permisos')?.mensaje).toBe(
      'Esta operacion requiere 1 permiso(s) o revision(es) previas.'
    );
    expect(recomendaciones.find((item) => item.tipo === 'seguro')?.titulo).toBe('Revisa el seguro');
    expect(recomendaciones.find((item) => item.tipo === 'antidumping')?.titulo).toBe('Verifica antidumping aplicable');
    expect(recomendaciones.find((item) => item.tipo === 'antidumping')?.accion).toBe(
      'Revisa la resolucion de INDECOPI y valora el impacto antes de cerrar la compra.'
    );
    expect(recomendaciones.find((item) => item.tipo === 'origen')?.accion).toBe(
      'Revisa tiempos, antidumping y documentacion del proveedor antes del embarque.'
    );
  });

  it('usa revision comercial en la recomendacion general', () => {
    const recomendaciones = generarRecomendacionesResultado({
      pais: 'US',
      canal: 'AEREO',
      incoterm: 'FOB',
      resultado: {
        permisos: [],
        items: [],
        alertas: [],
        precision: {
          componentes: {},
        },
        totales: {
          margenVenta: { margenPct: 35 },
        },
      },
    });

    expect(recomendaciones).toHaveLength(1);
    expect(recomendaciones[0].tipo).toBe('general');
    expect(recomendaciones[0].accion).toBe(
      'Revisa la documentacion comercial y el cronograma de embarque.'
    );
  });

  it('usa revision previa en permisos y no revive wording anterior en el source', () => {
    const content = fs.readFileSync(
      path.join(__dirname, '..', '..', 'server', 'cotizacion-insights.js'),
      'utf8'
    );

    expect(content).toContain('permiso(s) o revision(es) previas.');
    expect(content).not.toContain('permiso(s) o validacion(es) previas.');
  });

  it('deja el source de insights en ASCII limpio y sin default emoji', () => {
    const content = fs.readFileSync(
      path.join(__dirname, '..', '..', 'server', 'cotizacion-insights.js'),
      'utf8'
    );

    expect(content).toContain("icon: permiso.icon || 'info'");
    expect(content).toContain('Operacion limpia');
    expect(content).toContain("titulo: 'Revisa el seguro'");
    expect(content).toContain("titulo: 'Verifica antidumping aplicable'");
    expect(content).toContain("accion: 'Revisa la resolucion de INDECOPI y valora el impacto antes de cerrar la compra.'");
    expect(content).toContain("accion: 'Revisa la documentacion comercial y el cronograma de embarque.'");
    expect(content).toContain("accion: 'Revisa tiempos, antidumping y documentacion del proveedor antes del embarque.'");
    expect(content).not.toContain("titulo: 'Confirma el seguro'");
    expect(content).not.toContain("titulo: 'Verifica antidumping vigente'");
    expect(content).not.toContain("accion: 'Confirma la resolucion de INDECOPI y valora el impacto antes de cerrar la compra.'");
    expect(content).not.toContain("accion: 'Confirma la documentacion comercial y el cronograma de embarque.'");
    expect(content).not.toContain("accion: 'Valida tiempos, antidumping y documentacion del proveedor antes del embarque.'");
    expect(content).not.toContain("icon: permiso.icon || '⚠'");
    expect(content).not.toMatch(/[^\x00-\x7F]/);
  });
});
