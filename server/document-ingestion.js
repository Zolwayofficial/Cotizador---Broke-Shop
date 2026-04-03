const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const XLSX = require('xlsx');
const { extractDocumentTextWithOcr } = require('./document-ocr');

const ALLOWED_UPLOAD_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'image/jpeg',
  'image/png',
  'text/plain',
  'text/csv',
];

class DocumentIngestionError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'DocumentIngestionError';
    this.statusCode = options.statusCode || 422;
    this.code = options.code || 'document_ingestion_error';
    this.details = options.details || null;
  }
}

function getExtension(file = {}) {
  return path.extname(file.originalname || '').toLowerCase();
}

function decodeXmlEntities(text = '') {
  return String(text)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&#xA;/gi, '\n')
    .replace(/&#10;/g, '\n');
}

function normalizeText(text = '') {
  return String(text)
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

function bufferToImageDataUrl(buffer, mime) {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function createIngestionError(message, options) {
  return new DocumentIngestionError(message, options);
}

async function extractPdfContent(buffer) {
  let text = '';
  let pdfError = null;

  try {
    const pdfParse = require('pdf-parse');
    const pdf = await pdfParse(buffer);
    text = (pdf.text || '').trim();
  } catch (error) {
    pdfError = error;
  }

  if (text.length > 50) {
    return {
      contenido: normalizeText(text),
      tipo: 'text',
      source: 'pdf-text',
    };
  }

  if (pdfError) {
    return {
      contenido: '',
      tipo: 'pdf-unreadable',
      source: 'pdf-unreadable',
      warning: pdfError.message,
    };
  }

  return {
    contenido: '',
    tipo: 'pdf-empty',
    source: 'pdf-empty',
  };
}

async function extractDocxText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const documentFile = zip.file('word/document.xml');

  if (!documentFile) {
    throw createIngestionError('DOCX incompleto: falta word/document.xml', {
      code: 'docx_incomplete',
    });
  }

  const xml = await documentFile.async('string');
  const paragraphs = xml.match(/<w:p[\s\S]*?<\/w:p>/g) || [];

  const text = paragraphs.map((paragraph) => {
    const fragments = [];
    const regex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
    let match = regex.exec(paragraph);

    while (match) {
      fragments.push(decodeXmlEntities(match[1]));
      match = regex.exec(paragraph);
    }

    return fragments.join('');
  }).join('\n');

  return normalizeText(text);
}

function extractSpreadsheetText(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim();

    return rows
      ? `Hoja: ${sheetName}\n${rows}`
      : `Hoja: ${sheetName}`;
  });

  return normalizeText(sheets.join('\n\n'));
}

function isWordDocument(file = {}) {
  const ext = getExtension(file);
  return file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || ext === '.docx'
    || ext === '.doc';
}

function isSpreadsheet(file = {}) {
  const ext = getExtension(file);
  return file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || file.mimetype === 'application/vnd.ms-excel'
    || file.mimetype === 'text/csv'
    || ext === '.xlsx'
    || ext === '.xls'
    || ext === '.csv';
}

async function extractUploadedContent(file) {
  if (!file?.path) {
    throw createIngestionError('Archivo no recibido', {
      statusCode: 400,
      code: 'file_missing',
    });
  }

  const buffer = fs.readFileSync(file.path);
  const mime = file.mimetype || '';
  const ext = getExtension(file);

  if (mime.startsWith('image/')) {
    return {
      contenido: bufferToImageDataUrl(buffer, mime),
      tipo: 'image',
      source: 'image',
    };
  }

  if (mime === 'application/pdf' || ext === '.pdf') {
    const pdf = await extractPdfContent(buffer);

    if (pdf.tipo === 'text') {
      return pdf;
    }

    let ocrResult = null;
    let ocrError = null;
    try {
      ocrResult = await extractDocumentTextWithOcr(buffer, {
        mimeType: 'application/pdf',
        fileName: file.originalname || '',
      });
    } catch (error) {
      ocrError = error;
    }

    if (ocrResult) {
      return ocrResult;
    }

    if (pdf.tipo === 'pdf-unreadable') {
      throw createIngestionError('No se pudo leer el PDF. Sube un PDF legible o conviertelo a imagen, DOCX o XLSX.', {
        code: 'pdf_unreadable',
        details: ocrError?.message || pdf.warning || null,
      });
    }

    throw createIngestionError('El PDF no contiene texto extraible. Si es una cotizacion escaneada, exportala a imagen (PNG/JPG) o usa un PDF con OCR.', {
      code: 'pdf_without_text',
      details: ocrError?.message || pdf.warning || null,
    });
  }

  if (isWordDocument(file)) {
    if (ext === '.doc') {
      throw createIngestionError('Formato .doc no soportado todavia. Convierte el archivo a .docx o PDF.', {
        code: 'legacy_doc_unsupported',
      });
    }

    const text = await extractDocxText(buffer);

    if (!text) {
      throw createIngestionError('No se pudo extraer texto util del archivo Word.', {
        code: 'word_without_text',
      });
    }

    return {
      contenido: text,
      tipo: 'text',
      source: 'docx',
    };
  }

  if (isSpreadsheet(file)) {
    if (mime === 'text/csv' || ext === '.csv') {
      return {
        contenido: normalizeText(buffer.toString('utf8')),
        tipo: 'text',
        source: 'csv',
      };
    }

    const text = extractSpreadsheetText(buffer);

    if (!text) {
      throw createIngestionError('No se pudo extraer texto util del archivo Excel.', {
        code: 'spreadsheet_without_text',
      });
    }

    return {
      contenido: text,
      tipo: 'text',
      source: 'spreadsheet',
    };
  }

  return {
    contenido: normalizeText(buffer.toString('utf8')),
    tipo: 'text',
    source: 'text',
  };
}

module.exports = {
  ALLOWED_UPLOAD_MIMES,
  DocumentIngestionError,
  extractUploadedContent,
  extractDocxText,
  extractPdfContent,
  extractSpreadsheetText,
};
