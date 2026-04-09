const fs = require('fs');
const path = require('path');
const { describe, test, expect, afterEach } = require('@jest/globals');

describe('AgenteNavegadorADUANET', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('detecta cambios de estructura usando el HTML real devuelto por navegar', async () => {
    const aprendizajes = new Map();

    jest.doMock('../../server/agentes-navegacion/MemoriaAgente', () => ({
      MemoriaAgente: class MemoriaAgente {
        obtenerConfig() {
          return {
            timeout_ms: 45000,
            reintentos: 3,
            cache_ttl_ms: 3600000,
            user_agent: 'jest-agent',
          };
        }

        buscarExperiencias() {
          return [];
        }

        guardarExperiencia() {}

        guardarAprendizaje(clave, valor) {
          aprendizajes.set(clave, { valor });
        }

        obtenerAprendizaje(clave) {
          return aprendizajes.get(clave) || null;
        }
      },
    }));

    const AgenteNavegadorADUANET = require('../../server/agentes-navegacion/AgenteNavegadorADUANET');
    const agente = new AgenteNavegadorADUANET();
    await agente.init();

    aprendizajes.set('html_8471300000', { valor: agente._generarHtmlHash('<html>anterior</html>') });
    aprendizajes.set('html_6109100010', { valor: agente._generarHtmlHash('<html>sin-cambio-uno</html>') });
    aprendizajes.set('html_0806100000', { valor: agente._generarHtmlHash('<html>sin-cambio-dos</html>') });

    agente.navegar = jest.fn()
      .mockResolvedValueOnce({ exito: true, html: '<html>nuevo</html>' })
      .mockResolvedValueOnce({ exito: true, html: '<html>sin-cambio-uno</html>' })
      .mockResolvedValueOnce({ exito: true, html: '<html>sin-cambio-dos</html>' });

    const cambios = await agente.detectarCambiosEstructura();

    expect(cambios).toHaveLength(1);
    expect(cambios[0]).toMatchObject({
      partida: '8471300000',
      tipo: 'estructura_html_cambiada',
    });
    expect(agente.navegar).toHaveBeenCalledTimes(3);
    expect(agente.navegar.mock.calls[0][0]).toContain('cod_partida=8471300000');
    expect(aprendizajes.get('html_8471300000').valor).toBe(agente._generarHtmlHash('<html>nuevo</html>'));
  });

  test('navegar mantiene contrato completo y no expone referencias mutables desde cache', async () => {
    const AgenteNavegadorADUANET = require('../../server/agentes-navegacion/AgenteNavegadorADUANET');
    const agente = new AgenteNavegadorADUANET();
    agente.memoria = {
      obtenerConfig() {
        return {
          timeout_ms: 45000,
          reintentos: 2,
          cache_ttl_ms: 3600000,
        };
      },
      buscarExperiencias() {
        return [];
      },
      guardarExperiencia() {},
    };
    jest.spyOn(agente, '_navegarUrl').mockResolvedValue({
      html: '<html>ok</html>',
      statusCode: 200,
      headers: { server: 'aduanet' },
    });

    const first = await agente.navegar('http://aduanet.test/consulta');
    first.exito = false;
    first.headers.server = 'mutado';

    const second = await agente.navegar('http://aduanet.test/consulta');

    expect(second.exito).toBe(true);
    expect(second.headers.server).toBe('aduanet');
    expect(agente._navegarUrl).toHaveBeenCalledTimes(1);
  });

  test('consultarArancel no expone referencias mutables desde aprendizaje fallback', async () => {
    jest.doMock('../../server/agentes-navegacion/MemoriaAgente', () => ({
      MemoriaAgente: class MemoriaAgente {
        obtenerConfig() {
          return {
            timeout_ms: 45000,
            reintentos: 2,
            cache_ttl_ms: 3600000,
            user_agent: 'jest-agent',
          };
        }

        buscarExperiencias() {
          return [];
        }

        guardarExperiencia() {}

        guardarAprendizaje() {}

        obtenerAprendizaje(clave) {
          if (clave === 'arancel_8517130000') {
            return {
              valor: {
                partida: '8517130000',
                adValorem: 6,
                detalle: { origen: 'memoria' },
              },
            };
          }
          return null;
        }
      },
    }));

    const AgenteNavegadorADUANET = require('../../server/agentes-navegacion/AgenteNavegadorADUANET');
    const agente = new AgenteNavegadorADUANET();
    await agente.init();
    agente.navegar = jest.fn().mockResolvedValue({ exito: false, error: 'sin respuesta' });

    const first = await agente.consultarArancel('8517130000');
    first.detalle.origen = 'mutado';

    const second = await agente.consultarArancel('8517130000');

    expect(second.detalle.origen).toBe('memoria');
    expect(second.fuente).toBe('cache_aprendizaje');
  });

test('el codigo fuente actual protege cache con copias serializables y ya no arrastra mojibake', () => {
    const content = fs.readFileSync(
      path.join(__dirname, '..', '..', 'server', 'agentes-navegacion', 'AgenteNavegadorADUANET.js'),
      'utf8',
    );

    expect(content).toContain('function cloneSerializable(value)');
    expect(content).toContain('function buildAduanetUrl(partida)');
    expect(content).toContain('const resultado = await this.navegar(buildAduanetUrl(partida), { timeout: 45000 });');
    expect(content).toContain('return cloneSerializable(cached.valor);');
    expect(content).toContain('this._guardarEnCache(url, respuesta, config.cache_ttl_ms);');
    expect(content).toContain('[ADUANET] Respuesta recibida en');
    expect(content).toContain('[ADUANET] Estructura HTML cambio para');
    expect(content).not.toContain('return cached.valor;');
    expect(content).not.toContain('CaracterÃ');
    expect(content).not.toContain('â•');
    expect(content).not.toContain('âœ… ADUANET: Ã‰xito');
    expect(content).not.toContain('âš ï¸ ADUANET: Estructura HTML cambiÃ³');
    expect(content).not.toContain('ðŸ’¾ ADUANET');
    expect(content).not.toContain('ðŸ§  ADUANET');
    expect(content).not.toContain('ðŸŒ ADUANET');
    expect(content).not.toContain('âŒ ADUANET');
    expect(content).not.toContain('Timeout despuÃ©s');
  });
});
