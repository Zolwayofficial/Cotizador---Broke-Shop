const fs = require('fs');
const path = require('path');
const { describe, expect, it } = require('@jest/globals');

const tracking = require('../../server/tracking');

describe('tracking', () => {
  it('detecta carriers conocidos por formato de guia', () => {
    expect(tracking.detectCarrier('1Z999AA10123456784')).toEqual({
      carrier: 'ups',
      name: 'UPS',
    });

    expect(tracking.detectCarrier('MAEU1234567')).toEqual({
      carrier: 'maersk',
      name: 'Maersk',
    });
  });

  it('devuelve links de tracking y mensaje neutral cuando no hay API configurada', async () => {
    delete process.env.TRACK17_API_KEY;

    const resultado = await tracking.rastrear('1Z999AA10123456784');

    expect(resultado.tracking).toBeNull();
    expect(resultado.recommended).toContain('17track');
    expect(resultado.urls.ups).toContain('ups.com');
    expect(resultado.mensaje).toBe('Tracking disponible en los links. Recomendado: 17track');
  });

  it('mantiene el source de tracking en ASCII limpio y sin emoji visible', () => {
    const content = fs.readFileSync(
      path.join(__dirname, '..', '..', 'server', 'tracking.js'),
      'utf8'
    );

    expect(content).toContain('Estado reportado:');
    expect(content).not.toContain('📦 Estado:');
    expect(content).not.toMatch(/[^\x00-\x7F]/);
  });
});
