const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const cwd = process.cwd();
const envCandidates = ['.env.production', '.env'];
const envFile = envCandidates
  .map((name) => path.join(cwd, name))
  .find((filePath) => fs.existsSync(filePath));

if (envFile) {
  dotenv.config({ path: envFile });
} else {
  dotenv.config();
}

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
    'example.com',
    'gsk_xxxxxxxxxxxxx',
    'sk-xxxxxxxxxxxxx',
  ].some((fragment) => normalized.includes(fragment));
}

function hasRealValue(key) {
  return !isPlaceholder(process.env[key]);
}

function printSection(title, values) {
  console.log(`\n[${title}]`);
  values.forEach((line) => console.log(`- ${line}`));
}

const failures = [];
const warnings = [];
const successes = [];

if (envFile) {
  successes.push(`Archivo cargado: ${path.basename(envFile)}`);
} else {
  warnings.push('No se encontro .env.production ni .env; se evaluaron solo variables del entorno actual');
}

if (process.env.NODE_ENV !== 'production') {
  failures.push(`NODE_ENV debe ser production y hoy vale "${process.env.NODE_ENV || ''}"`);
} else {
  successes.push('NODE_ENV=production');
}

if (!hasRealValue('PORT')) {
  failures.push('PORT no esta configurado con un valor real');
} else {
  successes.push(`PORT=${process.env.PORT}`);
}

if (!hasRealValue('JWT_SECRET') || String(process.env.JWT_SECRET).length < 32) {
  failures.push('JWT_SECRET falta o es demasiado debil; usa un secreto real de al menos 32 caracteres');
} else {
  successes.push('JWT_SECRET configurado');
}

if (!hasRealValue('DB_PATH')) {
  failures.push('DB_PATH falta');
} else {
  successes.push(`DB_PATH=${process.env.DB_PATH}`);
}

if (!hasRealValue('DATA_DIR')) {
  failures.push('DATA_DIR falta');
} else {
  successes.push(`DATA_DIR=${process.env.DATA_DIR}`);
}

if (!hasRealValue('DOMAIN') && !hasRealValue('ALLOWED_ORIGINS')) {
  failures.push('Configura DOMAIN o ALLOWED_ORIGINS para cerrar CORS en produccion');
} else {
  successes.push('CORS de produccion configurado');
}

if (!hasRealValue('GROQ_API_KEY')) {
  warnings.push('GROQ_API_KEY no esta configurado; el sistema seguira con fallback, pero sin IA avanzada');
} else {
  successes.push('GROQ_API_KEY configurado');
}

const smtpKeys = ['EMAIL_SMTP_HOST', 'EMAIL_USER', 'EMAIL_PASSWORD'];
const missingSmtp = smtpKeys.filter((key) => !hasRealValue(key));
if (missingSmtp.length > 0) {
  warnings.push(`Email SMTP incompleto; faltan: ${missingSmtp.join(', ')}. La cotizacion personalizada por email usara fallback.`);
} else {
  successes.push('SMTP configurado');
}

if (!hasRealValue('EMAIL_FROM')) {
  warnings.push('EMAIL_FROM no esta configurado; se usara el remitente por defecto');
}

if (!hasRealValue('TRACK17_API_KEY')) {
  warnings.push('TRACK17_API_KEY no esta configurado; el tracking universal quedara limitado a enlaces externos');
}

if (!hasRealValue('TRACKINGMORE_API_KEY') && !hasRealValue('SEARATES_API_KEY')) {
  warnings.push('No hay APIs reales de flete configuradas; el sistema seguira usando tarifas referenciales');
} else {
  successes.push('Al menos una API real de fletes esta configurada');
}

const courierRateKeys = ['SHIPPO_TOKEN', 'EASYPOST_TOKEN', 'INTERPARCEL_TOKEN', 'PARCELMONKEY_TOKEN'];
const configuredCourierRateKeys = courierRateKeys.filter((key) => hasRealValue(key));

if (configuredCourierRateKeys.length === 0) {
  warnings.push('No hay agregadores de couriers configurados (Shippo, EasyPost, Interparcel, ParcelMonkey); la cotizacion automatica multi-courier dependera de fallbacks o couriers personalizados');
} else {
  successes.push(`Cotizadores multi-courier configurados: ${configuredCourierRateKeys.join(', ')}`);
}

if (!hasRealValue('AFTERSHIP_TOKEN')) {
  warnings.push('AFTERSHIP_TOKEN no esta configurado; el tracking complementario y el directorio de couriers quedaran limitados');
}

const documentOcrEnabled = hasRealValue('DOCUMENT_OCR_ENABLED') && ['1', 'true', 'yes', 'on'].includes(String(process.env.DOCUMENT_OCR_ENABLED).trim().toLowerCase());
const documentOcrKeys = ['GOOGLE_CLOUD_PROJECT_ID', 'GOOGLE_DOCUMENT_AI_LOCATION', 'GOOGLE_DOCUMENT_AI_PROCESSOR_ID'];
const missingDocumentOcr = documentOcrKeys.filter((key) => !hasRealValue(key));

if (documentOcrEnabled && missingDocumentOcr.length > 0) {
  warnings.push(`DOCUMENT_OCR_ENABLED esta activo pero falta configurar: ${missingDocumentOcr.join(', ')}. Los PDFs escaneados seguiran en fallback.`);
} else if (documentOcrEnabled) {
  successes.push('OCR oficial para documentos escaneados configurado');
}

if (successes.length > 0) {
  printSection('OK', successes);
}

if (warnings.length > 0) {
  printSection('ADVERTENCIAS', warnings);
}

if (failures.length > 0) {
  printSection('BLOQUEANTES', failures);
  process.exitCode = 1;
} else {
  console.log('\n[LISTO] Configuracion suficiente para un despliegue de produccion.');
}
