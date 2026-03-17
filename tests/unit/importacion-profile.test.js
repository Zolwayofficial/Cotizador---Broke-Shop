const { describe, expect, it } = require('@jest/globals');

const { buildImportProfile } = require('../../server/importacion-profile');

describe('importacion-profile', () => {
  it('expone validacion oficial estructurada cuando el resultado la trae', () => {
    const profile = buildImportProfile({
      canal: 'MARITIMO',
      tipoSujeto: 'empresa',
      tipoImportador: 'general',
      objetivoCalculo: 'precio_sugerido',
      proveedor: 'Proveedor Demo',
      incoterm: 'FOB',
      trazabilidad: {
        flete: { estado: 'real', fuente: 'manual', monto: 80 },
        seguro: { estado: 'estimado', fuente: 'seguro_tabla', monto: 17.5 },
      },
      permisos: [],
      seguroModo: 'TABLA',
      resultado: {
        tipoCambio: {
          tasa: 3.64,
          estado: 'manual_usuario',
          fuente: 'manual_usuario',
          referenciaSunat: {
            compra: 3.66,
            venta: 3.68,
          },
          diferencialVsSunat: {
            absoluto: -0.04,
            porcentaje: -1.09,
          },
        },
        totales: {
          fob: 1000,
          flete: 80,
          seguro: 17.5,
          cif: 1097.5,
          totalTributos: 220,
          totalReal: 1360,
        },
        items: [],
        validacionOficial: {
          fuente: 'ADUANET',
          actualizado: '2026-03-17T10:00:00.000Z',
          subpartidas: [
            {
              partida: '8517130000',
              descripcion: 'Telefonos inteligentes',
              oficialEnVivo: true,
              gravamenes: {
                adValorem: 0,
                igv: 15.5,
                ipm: 2.5,
                tipoProducto: 'LEY 29666-IGV 20.02.11',
              },
              resumenTributos: [
                { etiqueta: 'Ad Valorem', valor: '0%' },
                { etiqueta: 'IGV', valor: '15.5%' },
                { etiqueta: 'IPM', valor: '2.5%' },
              ],
              convenio: {
                pais: 'China',
                acuerdo: 'APC Peru-China',
                vigencia: 'Vigente',
                arancelBasePreferencial: 'Base 0% / Preferencial 0%',
                porcentajeLiberadoAdv: '100%',
                observacion: 'Aplica con origen valido',
              },
              restricciones: {
                total: 1,
                entidades: ['MTC'],
                items: [
                  {
                    regimen: 'Importacion para el consumo',
                    codigo: '12',
                    descripcion: 'Homologacion previa',
                    control: 'MTC',
                    desde: '2020-01-01',
                    hasta: '-',
                    baseLegal: 'DS 001-2020',
                  },
                ],
              },
              descripcionesMinimas: [
                { codigo: 'DESCR.1', descripcion: 'Marca y modelo comercial' },
              ],
              enlaces: {
                convenios: 'http://www.aduanet.gob.pe/itarancel/arancelS01Alias?accion=consultarConvenio&cod_partida=8517130000',
              },
            },
          ],
          resumen: {
            consultadas: 1,
            conveniosDetectados: 1,
            restriccionesDetectadas: 1,
            conFuenteOficial: 1,
          },
        },
      },
    });

    expect(profile.validacionOficial).toBeTruthy();
    expect(profile.validacionOficial.fuente).toBe('ADUANET');
    expect(profile.validacionOficial.subpartidas).toHaveLength(1);
    expect(profile.validacionOficial.subpartidas[0].partida).toBe('8517130000');
    expect(profile.validacionOficial.subpartidas[0].convenio.acuerdo).toMatch(/Peru-China/i);
    expect(profile.validacionOficial.subpartidas[0].restricciones.total).toBe(1);
    expect(profile.validacionOficial.subpartidas[0].descripcionesMinimas).toHaveLength(1);
    expect(profile.baseTributaria.some((row) => row.concepto === 'Fuente tributaria oficial')).toBe(true);
    expect(profile.baseTributaria.some((row) => row.concepto === 'Tipo de cambio operativo')).toBe(true);
  });
});
