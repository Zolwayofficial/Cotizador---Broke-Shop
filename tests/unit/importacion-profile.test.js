const fs = require('fs');
const path = require('path');
const { describe, expect, it } = require('@jest/globals');

const { buildImportProfile, inferirRegimenImportacion } = require('../../server/importacion-profile');

describe('importacion-profile', () => {
it('expone el bloque oficial estructurado cuando el resultado lo trae', () => {
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
    expect(
      profile.baseTributaria.some(
        (row) =>
          row.concepto === 'Fuente tributaria oficial' &&
          /bloque de consulta oficial en vivo como referencia de trabajo/i.test(row.detalle)
      )
    ).toBe(true);
    expect(profile.baseTributaria.some((row) => row.concepto === 'Tipo de cambio operativo')).toBe(true);
  });

  it('reconoce aliases de canal y decimales con coma en el perfil', () => {
    const regimenPostal = inferirRegimenImportacion({ canal: 'POSTAL_FRANQUICIA', fobTotal: '199,90' });
    const regimenPostalSimplificado = inferirRegimenImportacion({ canal: 'POSTAL', fobTotal: '500,00' });
    const regimenAereo = inferirRegimenImportacion({ canal: 'AEREO_FORMAL', fobTotal: '2500,00' });

    const profile = buildImportProfile({
      canal: 'POSTAL_FRANQUICIA',
      tipoSujeto: 'persona_natural',
      objetivoCalculo: 'costo_importacion',
      trazabilidad: {},
      permisos: [],
      resultado: {
        tipoCambio: {
          tasa: '3,58',
          estado: 'manual_usuario',
        },
        totales: {
          fob: '199,90',
        },
        items: [],
      },
    });

    expect(regimenPostal.codigo).toBe('postal_franquicia');
    expect(regimenPostal.revisarEnSunat).toBe(true);
    expect(regimenPostalSimplificado.codigo).toBe('postal_importa_facil');
    expect(regimenPostalSimplificado.revisarEnSunat).toBe(true);
    expect(regimenAereo.codigo).toBe('importacion_consumo_aerea');
    expect(regimenAereo.revisarEnSunat).toBe(true);
    expect(profile.regimen.codigo).toBe('postal_franquicia');
    expect(profile.regimen.revisarEnSunat).toBe(true);
    expect(profile.baseTributaria.some((row) => row.valor === 'PEN 3.5800 por USD')).toBe(true);
    expect(
      regimenPostalSimplificado.detalle ===
        'Envio postal simplificado. Conviene revisar topes y operativa actual con Serpost y SUNAT.'
    ).toBe(true);
  });

it('describe el tipo de cambio oficial como consulta en vivo y no como lectura parcial', () => {
    const profile = buildImportProfile({
      canal: 'MARITIMO',
      tipoSujeto: 'empresa',
      objetivoCalculo: 'precio_sugerido',
      trazabilidad: {},
      permisos: [],
      resultado: {
        tipoCambio: {
          tasa: 3.71,
          estado: 'oficial_en_vivo',
          referenciaSunat: {
            compra: 3.69,
            venta: 3.71,
          },
        },
        totales: {
          fob: 1000,
        },
        items: [],
      },
    });

    expect(
      profile.baseTributaria.some(
        (row) =>
          row.concepto === 'Tipo de cambio operativo' &&
          /TC consultado en SUNAT en vivo/i.test(row.detalle)
      )
    ).toBe(true);
  });

  it('usa revision documental en checklist visibles y no revive confirma', () => {
    const profile = buildImportProfile({
      canal: 'COURIER',
      tipoSujeto: 'empresa',
      objetivoCalculo: 'precio_sugerido',
      incoterm: 'CIF',
      trazabilidad: {},
      permisos: [],
      resultado: {
        tipoCambio: { tasa: 3.7, estado: 'manual_usuario' },
        totales: { fob: 1000 },
        items: [],
      },
    });

    expect(
      profile.checklistDocumental.some(
        (row) => row.detalle === 'Revisa que la factura, proforma o cotizacion este completa y consistente.'
      )
    ).toBe(true);
    expect(
      profile.checklistDocumental.some(
        (row) => row.detalle === 'Revisa que CIF este respaldado en la cotizacion del proveedor.'
      )
    ).toBe(true);
    expect(
      profile.checklistDocumental.some(
        (row) => row.detalle === 'Revisa razon social, RUC y condiciones del importador.'
      )
    ).toBe(true);
    expect(
      profile.checklistDocumental.some(
        (row) => row.detalle === 'Revisa courier, tracking y desglose de cargos del operador express.'
      )
    ).toBe(true);
  });

it('mantiene el wording de tipo de cambio como consulta y no como lectura parcial', () => {
    const content = fs.readFileSync(
      path.join(__dirname, '..', '..', 'server', 'importacion-profile.js'),
      'utf8'
    );

    expect(content).toContain('Se aplico el tipo de cambio operativo definido en esta corrida.');
    expect(content).toContain('TC consultado en SUNAT en vivo.');
    expect(content).toContain('Usa el bloque de consulta oficial en vivo como referencia de trabajo.');
    expect(content).not.toContain('Usa el bloque de consulta oficial en vivo como referencia actual.');
    expect(content).toContain('Revisa que la factura, proforma o cotizacion este completa y consistente.');
    expect(content).toContain("Revisa que ${incoterm || 'FOB'} este respaldado en la cotizacion del proveedor.");
    expect(content).toContain('Revisa identidad, direccion y trazabilidad del destinatario.');
    expect(content).toContain('Revisa razon social, RUC y condiciones del importador.');
    expect(content).toContain('Revisa courier, tracking y desglose de cargos del operador express.');
    expect(content).toContain('Conviene revisar topes y operativa actual con Serpost y SUNAT.');
    expect(content).toContain('revisarEnSunat: true');
    expect(content).toContain('const consultaOficial = resultado?.validacionOficial;');
    expect(content).toContain('const subpartidasConsultadas = Array.isArray(consultaOficial?.subpartidas)');
    expect(content).toContain('function construirConsultaOficial(consultaOficial) {');
    expect(content).toContain('Ayuda a revisar peso, cantidades, presentacion y consistencia logistica.');
    expect(content).toContain('conviene revisar si el proveedor o el operador lo entrega.');
    expect(content).toContain('Revisar tramo postal actual');
    expect(content).toContain('Revisa la resolucion aplicable.');
    expect(content).toContain('conviene revisar limites, sustento de valor y documentacion personal.');
    expect(content).toContain('conviene revisar RUC, razon social y trazabilidad documental.');
    expect(content).not.toContain('Se aplico el tipo de cambio operativo resuelto por el sistema.');
    expect(content).not.toContain('TC validado con SUNAT en vivo.');
    expect(content).not.toContain('Usa el bloque de consulta oficial en vivo como referencia vigente.');
    expect(content).not.toContain('Usa el bloque de validacion oficial en vivo como referencia vigente.');
    expect(content).not.toContain('Confirma que la factura, proforma o cotizacion este completa y consistente.');
    expect(content).not.toContain("Confirma que ${incoterm || 'FOB'} este respaldado en la cotizacion del proveedor.");
    expect(content).not.toContain('Valida identidad, direccion y trazabilidad del destinatario.');
    expect(content).not.toContain('Valida razon social, RUC y condiciones del importador.');
    expect(content).not.toContain('Confirma courier, tracking y desglose de cargos del operador express.');
    expect(content).not.toContain('Conviene validar topes y operativa vigente con Serpost y SUNAT.');
    expect(content).not.toContain('Conviene revisar topes y operativa vigente con Serpost y SUNAT.');
    expect(content).not.toContain('validarEnSunat: true');
    expect(content).not.toContain('const validacionOficial = resultado?.validacionOficial;');
    expect(content).not.toContain('const subpartidasOficiales = Array.isArray(validacionOficial?.subpartidas)');
    expect(content).not.toContain('function construirValidacionOficial(validacionOficial) {');
    expect(content).not.toContain('Ayuda a validar peso, cantidades, presentacion y consistencia logistica.');
    expect(content).not.toContain('conviene validar si el proveedor o el operador lo entrega.');
    expect(content).not.toContain('Validar tramo postal vigente');
    expect(content).not.toContain('Revisar tramo postal vigente');
    expect(content).not.toContain('Revisa la resolucion vigente.');
    expect(content).not.toContain('conviene validar limites, sustento de valor y documentacion personal.');
    expect(content).not.toContain('conviene validar RUC, razon social y trazabilidad documental.');
  });
});
