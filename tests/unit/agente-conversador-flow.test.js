const fs = require('fs');
const path = require('path');
const { describe, expect, it } = require('@jest/globals');

const flow = require('../../server/agente-conversador-flow');

describe('agente-conversador-flow', () => {
  it('no arranca con BOM invisible en agente-conversador-flow.js', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'agente-conversador-flow.js'), 'utf8');

    expect(content.charCodeAt(0)).not.toBe(0xfeff);
  });

  it('extrae numeros con miles y coma decimal correctamente', () => {
    expect(flow.interpretarRespuestaPorPaso('1,200 USD', 'precio_unitario')).toEqual({ precio_unitario: 1200 });
    expect(flow.interpretarRespuestaPorPaso('3,58', 'tipo_cambio')).toEqual({ tipo_cambio: 3.58 });
    expect(flow.interpretarRespuestaPorPaso('1.200,50', 'flete')).toEqual({ flete: 1200.5 });
  });

  it('detecta precio unitario aunque el mensaje use dolar o simbolo', () => {
    expect(flow.extraerDeLenguajeNatural('el precio unitario es 25 dolares', 'precio_unitario')).toEqual({ precio_unitario: 25 });
    expect(flow.extraerDeLenguajeNatural('cuesta 25 dolar por unidad', 'precio_unitario')).toEqual({ precio_unitario: 25 });
    expect(flow.extraerDeLenguajeNatural('vale $25 por unidad', 'precio_unitario')).toEqual({ precio_unitario: 25 });
  });

  it('permite pais libre con espacios aunque no exista alias directo', () => {
    expect(flow.interpretarRespuestaPorPaso('Costa Rica', 'pais_origen')).toEqual({ pais_origen: 'COSTA RICA' });
  });

  it('reconoce postal franquicia y omite pasos logisticos posteriores', () => {
    const canal = flow.interpretarRespuestaPorPaso('postal con franquicia', 'canal');
    expect(canal).toEqual({ canal: 'POSTAL_FRANQUICIA' });

    const siguiente = flow.generarPregunta({
      datos_previos: {
        productos: [{ producto: 'reloj', cantidad: 1 }],
        pais_origen: 'CN',
        tipo_sujeto: 'persona_natural',
        canal: 'POSTAL_FRANQUICIA',
        objetivo_calculo: 'costo_importacion',
        precio_unitario: 120,
        incoterm: 'FOB',
        tipo_importador: 'nuevo',
        bien_usado: false,
      },
    });

    expect(siguiente.paso).toBe('tipo_cambio');
  });

  it('pide objetivo de calculo y condicion del producto en el orden real del flujo', () => {
    const objetivoPendiente = flow.generarPregunta({
      datos_previos: {
        productos: [{ producto: 'reloj', cantidad: 1 }],
        pais_origen: 'CN',
        tipo_sujeto: 'empresa',
        canal: 'AEREO',
      },
    });

    expect(objetivoPendiente.paso).toBe('objetivo_calculo');

    const condicionPendiente = flow.generarPregunta({
      datos_previos: {
        productos: [{ producto: 'reloj', cantidad: 1 }],
        pais_origen: 'CN',
        tipo_sujeto: 'empresa',
        canal: 'AEREO',
        objetivo_calculo: 'precio_sugerido',
        precio_unitario: 25,
        incoterm: 'FOB',
        tipo_importador: 'general',
      },
    });

    expect(condicionPendiente.paso).toBe('bien_usado');
  });

  it('emite un tipo coherente cuando ya hay datos suficientes para calcular', () => {
    const siguiente = flow.generarPregunta({
      datos_previos: {
        productos: [{ producto: 'reloj', cantidad: 1 }],
        pais_origen: 'CN',
        tipo_sujeto: 'empresa',
        canal: 'AEREO',
        objetivo_calculo: 'precio_sugerido',
        precio_unitario: 25,
        incoterm: 'FOB',
        tipo_importador: 'general',
        bien_usado: false,
        flete: 15,
        seguro: 3,
        peso_total: 1,
        tipo_cambio: 3.75,
        margen_venta: 25,
      },
    });

    expect(siguiente.paso).toBe('calcular');
    expect(siguiente.tipo).toBe('datos_suficientes_para_calculo');
  });
});
