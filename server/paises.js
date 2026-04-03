const COUNTRY_ALIASES = {
  CN: ['CN', 'CHN', 'CHINA', 'REPUBLICA POPULAR CHINA', 'PEOPLES REPUBLIC OF CHINA'],
  US: ['US', 'USA', 'EEUU', 'EE UU', 'ESTADOS UNIDOS', 'UNITED STATES', 'UNITED STATES OF AMERICA'],
  BR: ['BR', 'BRA', 'BRASIL', 'BRAZIL'],
  MX: ['MX', 'MEX', 'MEXICO'],
  ES: ['ES', 'ESP', 'ESPANA', 'SPAIN'],
  DE: ['DE', 'DEU', 'ALEMANIA', 'GERMANY'],
  JP: ['JP', 'JPN', 'JAPON', 'JAPAN'],
  KR: ['KR', 'KOR', 'COREA', 'COREA DEL SUR', 'SOUTH KOREA', 'REPUBLIC OF KOREA'],
  TH: ['TH', 'THA', 'TAILANDIA', 'THAILAND'],
  TW: ['TW', 'TWN', 'TAIWAN'],
  IN: ['IN', 'IND', 'INDIA'],
  IT: ['IT', 'ITA', 'ITALIA', 'ITALY'],
  GB: ['GB', 'UK', 'GBR', 'REINO UNIDO', 'UNITED KINGDOM', 'INGLATERRA'],
  CA: ['CA', 'CAN', 'CANADA'],
  AU: ['AU', 'AUS', 'AUSTRALIA'],
  CL: ['CL', 'CHL', 'CHILE'],
  PE: ['PE', 'PER', 'PERU'],
};

const LOOKUP = Object.entries(COUNTRY_ALIASES).reduce((acc, [code, aliases]) => {
  aliases.forEach(alias => {
    acc[alias] = code;
  });
  return acc;
}, {});

function sanitizeCountry(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizarCodigoPais(value) {
  const sanitized = sanitizeCountry(value);
  if (!sanitized) {
    return '';
  }
  if (LOOKUP[sanitized]) {
    return LOOKUP[sanitized];
  }
  if (/^[A-Z]{2}$/.test(sanitized)) {
    return sanitized;
  }
  return '';
}

function normalizarPaisParaRuta(value) {
  return normalizarCodigoPais(value) || sanitizeCountry(value);
}

module.exports = {
  normalizarCodigoPais,
  normalizarPaisParaRuta,
  sanitizeCountry,
};
