const fs = require('fs');
const path = require('path');
const http = require('http');
const iconv = require('iconv-lite');
const { normalizarCodigoPais } = require('./paises');

const DATA_DIR = process.env.DATA_DIR || './data';
const ADUANET = 'http://www.aduanet.gob.pe/ol-ad-tg/ServletTGConsultaTablas';
const TABLES = ['NANDINA', 'NANDTASA', 'MRESTRI', 'DIMERPRO', 'TABLIBE'];

let _nandina = [];
let _restricciones = {};
let _prohibidas = {};
let _tlcs = {};
let _lastUpdate = null;
let _lastCheck = null;
let _source = 'none';

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      url,
      {
        timeout: 45000,
        headers: {
          'User-Agent': 'ImportAIAgentCotizador/1.0',
          Accept: 'text/plain',
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          httpGet(res.headers.location).then(resolve).catch(reject);
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      },
    );

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error(`Timeout despues de 45s para ${url}`));
    });
  });
}

async function downloadTable(name) {
  try {
    const buffer = await httpGet(`${ADUANET}?ptabla=${name}&accion=bajarTablas`);
    if (buffer.length < 500) return null;
    fs.writeFileSync(path.join(DATA_DIR, `${name}.TXT`), buffer);
    console.log(`  TABLA ${name} descargada: ${(buffer.length / 1024).toFixed(0)}KB`);
    return buffer;
  } catch (error) {
    console.log(`  ERROR ${name}: ${error.message}`);
    return null;
  }
}

const decode = (buffer) => iconv.decode(buffer, 'latin1');
const readF = (name) => {
  const filePath = path.join(DATA_DIR, name);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
};

const AV_CH = {
  '01': 0, '02': 0, '03': 0, '04': 0, '05': 0, '06': 0, '07': 0, '08': 0, '09': 0,
  '10': 0, '11': 0, '12': 0, '13': 0, '14': 0, '15': 0, '16': 6, '17': 0, '18': 6,
  '19': 6, '20': 6, '21': 6, '22': 6, '23': 0, '24': 6, '25': 0, '26': 0, '27': 0,
  '28': 0, '29': 0, '30': 0, '31': 0, '32': 0, '33': 6, '34': 6, '35': 0, '36': 6,
  '37': 6, '38': 0, '39': 6, '40': 6, '41': 0, '42': 11, '43': 11, '44': 6, '45': 6,
  '46': 6, '47': 0, '48': 0, '49': 0, '50': 6, '51': 0, '52': 0, '53': 0, '54': 6,
  '55': 6, '56': 6, '57': 11, '58': 6, '59': 0, '60': 6, '61': 11, '62': 11, '63': 11,
  '64': 11, '65': 11, '66': 6, '67': 6, '68': 6, '69': 6, '70': 6, '71': 0, '72': 0,
  '73': 6, '74': 0, '75': 0, '76': 0, '78': 0, '79': 0, '80': 0, '81': 0, '82': 6,
  '83': 6, '84': 0, '85': 0, '86': 0, '87': 6, '88': 0, '89': 0, '90': 0, '91': 6,
  '92': 6, '93': 6, '94': 6, '95': 6, '96': 6, '97': 0,
};

const AV_4D = {
  '1601': 6,
  '1602': 6,
  '2203': 0,
  '2204': 6,
  '2208': 6,
  '8528': 6,
  '8703': 6,
  '8711': 6,
  '4011': 6,
  '9504': 0,
};

function parseNandina(buffer) {
  return decode(buffer)
    .split('\n')
    .filter((line) => line.includes('99991231'))
    .map((line) => {
      const fields = line.split('\t');
      const partida = fields[0]?.trim();
      const descripcion = fields[1]?.trim();
      if (!partida || partida.length < 4 || !descripcion) return null;
      return {
        p: partida,
        d: descripcion,
        a: AV_4D[partida.substring(0, 4)] ?? AV_CH[partida.substring(0, 2)] ?? 0,
        g: 16,
        i: 0,
        s: 1.5,
      };
    })
    .filter(Boolean);
}

function mergeNandtasa(nandina, buffer) {
  const merged = {};

  decode(buffer)
    .split('\n')
    .filter((line) => line.includes('99991231'))
    .forEach((line) => {
      const fields = line.split('\t');
      const partida = fields[0]?.trim();
      if (!partida) return;

      if (!merged[partida]) {
        merged[partida] = {
          a: parseInt(fields[1], 10) || 0,
          g: parseInt(fields[2], 10) || 0,
          i: parseInt(fields[3], 10) || 0,
          s: parseFloat(fields[7]) || 0,
        };
      }

      if (merged[partida] && merged[partida].i > 900) {
        merged[partida].i = -1;
      }
    });

  return nandina.map((row) => (merged[row.p] ? { ...row, ...merged[row.p] } : row));
}

function parseMrestri(buffer) {
  const rows = {};

  decode(buffer)
    .split('\n')
    .slice(1)
    .forEach((line) => {
      const fields = line.split('\t');
      const partida = fields[0]?.trim();
      const entidad = fields[1]?.trim();
      const regimen = fields[2]?.trim();
      const desc = fields[3]?.trim();
      if (!partida || partida.length < 4) return;

      if (!rows[partida]) rows[partida] = [];
      if (!rows[partida].find((item) => item.entidad === entidad && item.regimen === regimen)) {
        rows[partida].push({ entidad, regimen, desc });
      }
    });

  return rows;
}

function parseDimerpro(buffer) {
  const rows = {};

  decode(buffer)
    .split('\n')
    .slice(1)
    .forEach((line) => {
      const fields = line.split('\t');
      const partida = fields[0]?.trim();
      if (partida && partida.length >= 4) {
        rows[partida] = { desc: fields[1]?.trim() || 'Prohibida' };
      }
    });

  return rows;
}

function parseTablibe(buffer) {
  const rows = {};

  decode(buffer)
    .split('\n')
    .slice(1)
    .forEach((line) => {
      const fields = line.split('\t');
      const partida = fields[0]?.trim();
      const pais = fields[1]?.trim();
      const preferencia = parseFloat(fields[2]) || 0;
      const acuerdo = fields[3]?.trim();
      const hasta = fields[5]?.trim();

      if (!partida || !pais || partida.length < 4) return;
      if (hasta && hasta !== '99991231' && parseInt(hasta, 10) < 20260101) return;

      const key = `${partida}:${pais}`;
      if (!rows[key] || preferencia > rows[key].preferencia) {
        rows[key] = { preferencia, acuerdo, pais };
      }
    });

  return rows;
}

function detectChanges(oldData, newData) {
  const previous = {};
  const changes = [];

  oldData.forEach((row) => {
    previous[row.p] = row;
  });

  newData.forEach((row) => {
    const oldRow = previous[row.p];
    if (!oldRow) {
      changes.push({ type: 'added', hs: row.p, desc: row.d });
    } else {
      if (oldRow.a !== row.a) {
        changes.push({ type: 'av_changed', hs: row.p, desc: row.d, from: oldRow.a, to: row.a });
      }
      if (oldRow.i !== row.i) {
        changes.push({ type: 'isc_changed', hs: row.p, desc: row.d, from: oldRow.i, to: row.i });
      }
      delete previous[row.p];
    }
  });

  Object.values(previous).forEach((row) => {
    changes.push({ type: 'removed', hs: row.p, desc: row.d });
  });

  return changes;
}

function buildFromFiles() {
  const nandinaBuffer = readF('NANDINA.TXT');
  if (!nandinaBuffer) return 0;

  _nandina = parseNandina(nandinaBuffer);

  const nandtasaBuffer = readF('NANDTASA.TXT');
  if (nandtasaBuffer) _nandina = mergeNandtasa(_nandina, nandtasaBuffer);

  const restriccionesBuffer = readF('MRESTRI.TXT');
  if (restriccionesBuffer) _restricciones = parseMrestri(restriccionesBuffer);

  const prohibidasBuffer = readF('DIMERPRO.TXT');
  if (prohibidasBuffer) _prohibidas = parseDimerpro(prohibidasBuffer);

  const tlcBuffer = readF('TABLIBE.TXT');
  if (tlcBuffer) _tlcs = parseTablibe(tlcBuffer);

  const output = {
    nandina: _nandina,
    restricciones: _restricciones,
    prohibidas: _prohibidas,
    tlcs: _tlcs,
    buildDate: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(DATA_DIR, 'nandina.json'), JSON.stringify(_nandina));
  fs.writeFileSync(path.join(DATA_DIR, 'aduanet-full.json'), JSON.stringify(output));
  _lastUpdate = output.buildDate;

  console.log(
    `  [BUILD] ${_nandina.length} partidas | ${Object.keys(_restricciones).length} restricciones | ${Object.keys(_prohibidas).length} prohibidas | ${Object.keys(_tlcs).length} TLCs`,
  );

  return _nandina.length;
}

module.exports = {
  getData: () => _nandina,
  getRestricciones: () => _restricciones,
  getProhibidas: () => _prohibidas,
  getTLCs: () => _tlcs,
  getLastUpdate: () => _lastUpdate,
  getLastCheck: () => _lastCheck,
  getSource: () => _source,

  getRestriccion(hs) {
    const clean = hs.replace(/\./g, '');
    for (const length of [10, 8, 6, 4]) {
      const key = clean.substring(0, length).padEnd(10, '0');
      if (_restricciones[key]) return _restricciones[key];
    }
    return null;
  },

  isProhibida(hs) {
    const clean = hs.replace(/\./g, '');
    return _prohibidas[clean] || _prohibidas[`${clean.substring(0, 8)}00`] || null;
  },

  getTLCPreference(hs, country) {
    const clean = hs.replace(/\./g, '');
    const normalizedCountry = normalizarCodigoPais(country) || country;
    for (const length of [10, 8, 6, 4]) {
      const key = `${clean.substring(0, length).padEnd(10, '0')}:${normalizedCountry}`;
      if (_tlcs[key]) return _tlcs[key];
    }
    return null;
  },

  async init() {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    try {
      const fullPath = path.join(DATA_DIR, 'aduanet-full.json');
      if (fs.existsSync(fullPath)) {
        const record = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        if (record.nandina?.length > 100) {
          _nandina = record.nandina;
          _restricciones = record.restricciones || {};
          _prohibidas = record.prohibidas || {};
          _tlcs = record.tlcs || {};
          _lastUpdate = record.buildDate;
          _source = 'json-full';
          console.log(
            `[ADUANET] Datos cargados: ${_nandina.length} partidas | ${Object.keys(_restricciones).length} restricciones | ${Object.keys(_tlcs).length} TLCs`,
          );
          return;
        }
      }
    } catch (_error) {
      // full json cache unavailable
    }

    try {
      const simplePath = path.join(DATA_DIR, 'nandina.json');
      if (fs.existsSync(simplePath)) {
        const data = JSON.parse(fs.readFileSync(simplePath, 'utf8'));
        if (Array.isArray(data) && data.length > 100) {
          _nandina = data;
          _lastUpdate = new Date(fs.statSync(simplePath).mtime).toISOString();
          _source = 'json';
          console.log(`[ADUANET] Datos cargados desde simple json: ${_nandina.length} partidas`);
          if (readF('MRESTRI.TXT') || readF('TABLIBE.TXT')) {
            buildFromFiles();
            _source = 'json+txt';
          }
          return;
        }
      }
    } catch (_error) {
      // simple json cache unavailable
    }

    if (readF('NANDINA.TXT')) {
      console.log('[ADUANET] Building from TXT...');
      buildFromFiles();
      _source = 'txt';
      if (_nandina.length > 0) return;
    }

    console.log('[ADUANET] No local data. Downloading from Aduanet...');
    await this.downloadAll();
  },

  async downloadAll() {
    let ok = 0;
    for (const table of TABLES) {
      if (await downloadTable(table)) ok += 1;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (ok > 0) {
      buildFromFiles();
      _source = 'auto-download';
    }

    console.log(`[ADUANET] Downloaded ${ok}/${TABLES.length} tables`);
    return ok;
  },

  async checkForUpdates() {
    _lastCheck = new Date().toISOString();
    const oldData = [..._nandina];
    let ok = 0;

    for (const table of TABLES) {
      if (await downloadTable(table)) ok += 1;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (ok === 0) return { updated: false, reason: 'download failed' };

    buildFromFiles();
    const changes = detectChanges(oldData, _nandina);
    return changes.length > 0 ? { updated: true, count: _nandina.length, changes } : { updated: false };
  },
};
