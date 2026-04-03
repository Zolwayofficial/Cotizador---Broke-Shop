const fs = require('fs');
const path = require('path');

jest.mock('../../server/sunat-proxy', () => ({
  getTipoCambio: jest.fn(),
}));

const sunatProxy = require('../../server/sunat-proxy');
const AgenteNavegadorSUNAT = require('../../server/agentes-navegacion/AgenteNavegadorSUNAT');

describe('AgenteNavegadorSUNAT', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test('no expone referencias mutables desde cache de tipo de cambio', async () => {
    sunatProxy.getTipoCambio.mockResolvedValue({
      compra: 3.68,
      venta: 3.71,
      source: 'SUNAT',
      status: 'ok',
      strategy: 'mirror',
      official: true,
      fecha: '2026-03-27T00:00:00.000Z',
    });

    const agente = new AgenteNavegadorSUNAT();

    const first = await agente.consultarTipoCambio();
    first.venta = 9.99;
    first.fuente = 'mutado';

    const second = await agente.consultarTipoCambio();

    expect(second.venta).toBe(3.71);
    expect(second.fuente).toBe('SUNAT');
    expect(sunatProxy.getTipoCambio).toHaveBeenCalledTimes(1);
  });

  test('mantiene el contrato completo al devolver arancel desde cache', async () => {
    const agente = new AgenteNavegadorSUNAT();
    jest.spyOn(agente, 'navegar').mockResolvedValue({
      exito: true,
      html: 'A/V 6 IGV 16 ISC 0',
    });

    const first = await agente.consultarArancel('8517130000');
    first.adValorem = 99;
    first.fuente = 'mutado';

    const second = await agente.consultarArancel('8517130000');

    expect(second).toMatchObject({
      exito: true,
      partida: '8517130000',
      adValorem: 6,
      igv: 16,
      fuente: 'ADUANET/SUNAT',
    });
    expect(typeof second.actualizado).toBe('string');
    expect(agente.navegar).toHaveBeenCalledTimes(1);
  });

  test('source vivo protege cache con copias serializables y no revive cached.valor directo', () => {
    const content = fs.readFileSync(
      path.join(__dirname, '..', '..', 'server', 'agentes-navegacion', 'AgenteNavegadorSUNAT.js'),
      'utf8',
    );

    expect(content).toContain('function cloneSerializable(value)');
    expect(content).toContain('return cloneSerializable(cached.valor);');
    expect(content).not.toContain('return cached.valor;');
    expect(content).toContain('const arancelResultado = {');
  });
});
