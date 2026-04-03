const path = require('path');
const dotenv = require('dotenv');
const { getProjectRoot, resolveEnvFile } = require('../server/runtime-config');

const SUCCESS_MESSAGE = '[CONFIGURACION] Sin bloqueantes de configuracion en esta pasada. Aun falta revisar el despliegue y la operacion real.';

function isPlaceholder(value) {
  if (!value) return true;

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return true;

  return [
    'changeme',
    'change-me',
    'cambiar',
    'cambiar-a-algo-seguro-y-aleatorio-min-32-chars',
    'tudominio',
    'tu-dominio',
    'tu_dominio',
    'example.com',
    'coloca_tu_',
    'coloca-tu-',
    'tu_email',
    'tu-email',
    'tu_password',
    'tu-password',
    'gsk_xxxxxxxxxxxxx',
    'sk-xxxxxxxxxxxxx',
  ].some((fragment) => normalized.includes(fragment));
}

function hasRealValue(env, key) {
  return !isPlaceholder(env[key]);
}

function printSection(title, values) {
  console.log(`\n[${title}]`);
  values.forEach((line) => console.log(`- ${line}`));
}

function evaluateEnvironment(env, envFile) {
  const failures = [];
  const warnings = [];
  const successes = [];

  if (envFile) {
    successes.push(`Archivo cargado: ${path.basename(envFile)}`);
  } else {
    warnings.push('No se encontro .env.production ni .env; se evaluaron solo variables del entorno actual');
  }

  if (env.NODE_ENV !== 'production') {
    failures.push(`NODE_ENV debe ser production y hoy vale "${env.NODE_ENV || ''}"`);
  } else {
    successes.push('NODE_ENV=production');
  }

  if (!hasRealValue(env, 'PORT')) {
    failures.push('PORT no esta configurado con un valor real');
  } else {
    successes.push(`PORT=${env.PORT}`);
  }

  if (!hasRealValue(env, 'WS_PORT')) {
    failures.push('WS_PORT no esta configurado con un valor real');
  } else {
    successes.push(`WS_PORT=${env.WS_PORT}`);
  }

  if (!hasRealValue(env, 'JWT_SECRET') || String(env.JWT_SECRET).length < 32) {
    failures.push('JWT_SECRET falta o es demasiado debil; usa un secreto real de al menos 32 caracteres');
  } else {
    successes.push('JWT_SECRET configurado');
  }

  if (!hasRealValue(env, 'DB_PATH')) {
    failures.push('DB_PATH falta');
  } else {
    successes.push(`DB_PATH=${env.DB_PATH}`);
  }

  if (!hasRealValue(env, 'DATA_DIR')) {
    failures.push('DATA_DIR falta');
  } else {
    successes.push(`DATA_DIR=${env.DATA_DIR}`);
  }

  if (!hasRealValue(env, 'DOMAIN') && !hasRealValue(env, 'ALLOWED_ORIGINS')) {
    failures.push('Configura DOMAIN o ALLOWED_ORIGINS para cerrar CORS en produccion');
  } else {
    successes.push('CORS de produccion configurado');
  }

  if (!hasRealValue(env, 'GROQ_API_KEY')) {
    warnings.push('GROQ_API_KEY no esta configurado; el sistema seguira con fallback, pero sin IA avanzada');
  } else {
    successes.push('GROQ_API_KEY configurado');
  }

  const smtpKeys = ['EMAIL_SMTP_HOST', 'EMAIL_USER', 'EMAIL_PASSWORD'];
  const missingSmtp = smtpKeys.filter((key) => !hasRealValue(env, key));
  if (missingSmtp.length > 0) {
    warnings.push(`Email SMTP incompleto; faltan: ${missingSmtp.join(', ')}. La cotizacion personalizada por email usara fallback.`);
  } else {
    successes.push('SMTP configurado');
  }

  if (!hasRealValue(env, 'EMAIL_FROM')) {
    warnings.push('EMAIL_FROM no esta configurado; se usara el remitente por defecto');
  }

  if (!hasRealValue(env, 'TRACK17_API_KEY')) {
    warnings.push('TRACK17_API_KEY no esta configurado; el tracking universal quedara limitado a enlaces externos');
  }

  if (!hasRealValue(env, 'TRACKINGMORE_API_KEY') && !hasRealValue(env, 'SEARATES_API_KEY')) {
    warnings.push('No hay APIs reales de flete configuradas; el sistema seguira usando tarifas referenciales');
  } else {
    successes.push('Al menos una API real de fletes esta configurada');
  }

  const courierRateKeys = ['SHIPPO_TOKEN', 'EASYPOST_TOKEN', 'INTERPARCEL_TOKEN', 'PARCELMONKEY_TOKEN'];
  const configuredCourierRateKeys = courierRateKeys.filter((key) => hasRealValue(env, key));

  if (configuredCourierRateKeys.length === 0) {
    warnings.push('No hay agregadores de couriers configurados (Shippo, EasyPost, Interparcel, ParcelMonkey); la cotizacion automatica multi-courier dependera de fallbacks o couriers personalizados');
  } else {
    successes.push(`Cotizadores multi-courier configurados: ${configuredCourierRateKeys.join(', ')}`);
  }

  if (!hasRealValue(env, 'AFTERSHIP_TOKEN')) {
    warnings.push('AFTERSHIP_TOKEN no esta configurado; el tracking complementario y el directorio de couriers quedaran limitados');
  }

  const documentOcrEnabled =
    hasRealValue(env, 'DOCUMENT_OCR_ENABLED') &&
    ['1', 'true', 'yes', 'on'].includes(String(env.DOCUMENT_OCR_ENABLED).trim().toLowerCase());
  const documentOcrKeys = ['GOOGLE_CLOUD_PROJECT_ID', 'GOOGLE_DOCUMENT_AI_LOCATION', 'GOOGLE_DOCUMENT_AI_PROCESSOR_ID'];
  const missingDocumentOcr = documentOcrKeys.filter((key) => !hasRealValue(env, key));

  if (documentOcrEnabled && missingDocumentOcr.length > 0) {
    warnings.push(`DOCUMENT_OCR_ENABLED esta activo pero falta configurar: ${missingDocumentOcr.join(', ')}. Los PDFs escaneados seguiran en fallback.`);
  } else if (documentOcrEnabled) {
    successes.push('OCR oficial para documentos escaneados configurado');
  }

  return { failures, warnings, successes };
}

function runCli() {
  const projectRoot = getProjectRoot(__dirname);
  const envFile = resolveEnvFile({ projectRoot, nodeEnv: 'production' });

  if (envFile) {
    dotenv.config({ path: envFile, override: true });
  } else {
    dotenv.config({ override: true });
  }

  const { failures, warnings, successes } = evaluateEnvironment(process.env, envFile);

  if (successes.length > 0) {
    printSection('CONFIGURACION', successes);
  }

  if (warnings.length > 0) {
    printSection('ADVERTENCIAS', warnings);
  }

  if (failures.length > 0) {
    printSection('BLOQUEANTES', failures);
    process.exitCode = 1;
  } else {
    console.log(`\n${SUCCESS_MESSAGE}`);
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  evaluateEnvironment,
  hasRealValue,
  isPlaceholder,
  SUCCESS_MESSAGE,
};
