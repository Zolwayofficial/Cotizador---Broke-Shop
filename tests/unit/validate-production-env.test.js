const {
  evaluateEnvironment,
  isPlaceholder,
  SUCCESS_MESSAGE,
} = require('../../scripts/validate-production-env');
const fs = require('fs');
const path = require('path');

describe('validate-production-env', () => {
  it('trata placeholders operativos comunes como valores no reales', () => {
    expect(isPlaceholder('COLOCA_TU_API_KEY_DE_GROQ')).toBe(true);
    expect(isPlaceholder('tu_email@gmail.com')).toBe(true);
    expect(isPlaceholder('tu_password_de_aplicacion')).toBe(true);
    expect(isPlaceholder('cambiar-a-algo-seguro-y-aleatorio-min-32-chars')).toBe(true);
    expect(isPlaceholder('sk_live_valor_real')).toBe(false);
  });

  it('marca GROQ y SMTP como incompletos cuando siguen en placeholders', () => {
    const env = {
      NODE_ENV: 'production',
      PORT: '3001',
      WS_PORT: '3002',
      JWT_SECRET: '12345678901234567890123456789012',
      DB_PATH: './data/cotizador.db',
      DATA_DIR: './data',
      DOMAIN: 'importaiagent.com',
      GROQ_API_KEY: 'COLOCA_TU_API_KEY_DE_GROQ',
      EMAIL_SMTP_HOST: 'smtp.gmail.com',
      EMAIL_USER: 'tu_email@gmail.com',
      EMAIL_PASSWORD: 'tu_password_de_aplicacion',
    };

    const { failures, warnings, successes } = evaluateEnvironment(env, '.env.production');

    expect(failures).toHaveLength(0);
    expect(successes).toContain('PORT=3001');
    expect(successes).toContain('WS_PORT=3002');
    expect(successes).not.toContain('GROQ_API_KEY configurado');
    expect(successes).not.toContain('SMTP configurado');
    expect(warnings).toContain('GROQ_API_KEY no esta configurado; el sistema seguira con fallback, pero sin IA avanzada');
    expect(warnings).toContain('Email SMTP incompleto; faltan: EMAIL_USER, EMAIL_PASSWORD. La cotizacion personalizada por email usara fallback.');
  });

  it('usa un cierre honesto y no vende produccion como resuelta solo por configuracion', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'validate-production-env.js'),
      'utf8',
    );

    expect(SUCCESS_MESSAGE).toBe(
      '[CONFIGURACION] Sin bloqueantes de configuracion en esta pasada. Aun falta revisar el despliegue y la operacion real.',
    );
    expect(source).toContain('SUCCESS_MESSAGE');
    expect(source).toContain("printSection('CONFIGURACION', successes)");
    expect(source).not.toContain("printSection('OK', successes)");
    expect(source).not.toContain('[LISTO] Configuracion suficiente para un despliegue de produccion.');
    expect(source).not.toContain('Aun falta validar el despliegue y la operacion real.');
  });
});
