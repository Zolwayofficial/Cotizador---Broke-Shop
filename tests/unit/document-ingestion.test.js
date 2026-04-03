const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse');

jest.mock('pdf-parse', () => jest.fn());
jest.mock('../../server/document-ocr', () => ({
  extractDocumentTextWithOcr: jest.fn(),
}));

const {
  extractUploadedContent,
  extractDocxText,
  extractSpreadsheetText,
} = require('../../server/document-ingestion');
const { extractDocumentTextWithOcr } = require('../../server/document-ocr');

async function createTempFile(buffer, extension) {
  const filePath = path.join(os.tmpdir(), `cotizador-test-${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`);
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}

async function createMinimalDocx(text) {
  const zip = new JSZip();

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`);

  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`);

  zip.folder('word').file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:t>${text}</w:t></w:r></w:p>
      </w:body>
    </w:document>`);

  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('document ingestion', () => {
  beforeEach(() => {
    pdfParse.mockReset();
    extractDocumentTextWithOcr.mockReset();
  });

  it('extrae texto util de un DOCX', async () => {
    const docxBuffer = await createMinimalDocx('Proveedor Bobin Corp. FOB USD 26595');
    const text = await extractDocxText(docxBuffer);

    expect(text).toMatch(/Bobin Corp/i);
    expect(text).toMatch(/26595/);
  });

  it('rechaza un DOCX sin word/document.xml con mensaje mas preciso', async () => {
    const zip = new JSZip();
    const brokenDocx = await zip.generateAsync({ type: 'nodebuffer' });

    await expect(extractDocxText(brokenDocx)).rejects.toMatchObject({
      name: 'DocumentIngestionError',
      code: 'docx_incomplete',
      message: 'DOCX incompleto: falta word/document.xml',
    });

    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'server', 'document-ingestion.js'),
      'utf8'
    );
    expect(source).toContain('DOCX incompleto: falta word/document.xml');
    expect(source).toContain("code: 'docx_incomplete'");
    expect(source).not.toContain('DOCX invalido: falta word/document.xml');
    expect(source).not.toContain("code: 'docx_invalid'");
  });

  it('extrae texto util de un XLSX', () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Producto', 'Cantidad', 'Precio'],
      ['Remalladora', 90, 94.5],
      ['Recubridora', 90, 97.8],
    ]);

    XLSX.utils.book_append_sheet(workbook, sheet, 'Cotizacion');
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const text = extractSpreadsheetText(buffer);

    expect(text).toMatch(/Hoja: Cotizacion/);
    expect(text).toMatch(/Remalladora/);
    expect(text).toMatch(/97\.8/);
  });

  it('extrae DOCX y XLSX desde el intake comun', async () => {
    const docxBuffer = await createMinimalDocx('Incoterm FOB');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['Proveedor', 'Pais'],
        ['Bobin Corp.', 'US'],
      ]),
      'Resumen'
    );
    const xlsxBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

    const docxPath = await createTempFile(docxBuffer, '.docx');
    const xlsxPath = await createTempFile(xlsxBuffer, '.xlsx');

    try {
      const docx = await extractUploadedContent({
        path: docxPath,
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        originalname: 'proveedor.docx',
      });
      const xlsx = await extractUploadedContent({
        path: xlsxPath,
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        originalname: 'cotizacion.xlsx',
      });

      expect(docx.tipo).toBe('text');
      expect(docx.contenido).toMatch(/FOB/);
      expect(xlsx.tipo).toBe('text');
      expect(xlsx.contenido).toMatch(/Bobin Corp/);
    } finally {
      await fs.promises.rm(docxPath, { force: true });
      await fs.promises.rm(xlsxPath, { force: true });
    }
  });

  it('rechaza .doc antiguo con mensaje claro', async () => {
    const docPath = await createTempFile(Buffer.from('documento antiguo'), '.doc');

    try {
      await expect(extractUploadedContent({
        path: docPath,
        mimetype: 'application/msword',
        originalname: 'proveedor.doc',
      })).rejects.toThrow(/Convierte el archivo a \.docx o PDF/i);
    } finally {
      await fs.promises.rm(docPath, { force: true });
    }
  });

  it('rechaza PDF sin texto extraible con error tipado en vez de fingir una imagen', async () => {
    pdfParse.mockResolvedValueOnce({ text: '   ' });
    const pdfPath = await createTempFile(Buffer.from('%PDF-1.4 scanned-ish'), '.pdf');

    try {
      await expect(extractUploadedContent({
        path: pdfPath,
        mimetype: 'application/pdf',
        originalname: 'escaneado.pdf',
      })).rejects.toMatchObject({
        name: 'DocumentIngestionError',
        statusCode: 422,
        code: 'pdf_without_text',
      });
    } finally {
      await fs.promises.rm(pdfPath, { force: true });
    }
  });

  it('usa OCR opcional si un PDF escaneado no trae texto directo', async () => {
    pdfParse.mockResolvedValueOnce({ text: '   ' });
    extractDocumentTextWithOcr.mockResolvedValueOnce({
      contenido: 'Factura comercial\nProveedor Asia Corp\nFOB USD 15200',
      tipo: 'text',
      source: 'google-documentai-ocr',
    });
    const pdfPath = await createTempFile(Buffer.from('%PDF-1.4 scanned-ish'), '.pdf');

    try {
      const result = await extractUploadedContent({
        path: pdfPath,
        mimetype: 'application/pdf',
        originalname: 'escaneado.pdf',
      });

      expect(result.source).toBe('google-documentai-ocr');
      expect(result.contenido).toMatch(/Asia Corp/);
      expect(extractDocumentTextWithOcr).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({
        mimeType: 'application/pdf',
      }));
    } finally {
      await fs.promises.rm(pdfPath, { force: true });
    }
  });

  it('rechaza PDF ilegible con mensaje claro', async () => {
    pdfParse.mockRejectedValueOnce(new Error('Invalid PDF structure'));
    const pdfPath = await createTempFile(Buffer.from('%PDF-1.4 broken'), '.pdf');

    try {
      await expect(extractUploadedContent({
        path: pdfPath,
        mimetype: 'application/pdf',
        originalname: 'corrupto.pdf',
      })).rejects.toMatchObject({
        name: 'DocumentIngestionError',
        statusCode: 422,
        code: 'pdf_unreadable',
        message: 'No se pudo leer el PDF. Sube un PDF legible o conviertelo a imagen, DOCX o XLSX.',
      });

      const source = fs.readFileSync(
        path.join(__dirname, '..', '..', 'server', 'document-ingestion.js'),
        'utf8'
      );
      expect(source).toContain('No se pudo leer el PDF. Sube un PDF legible o conviertelo a imagen, DOCX o XLSX.');
      expect(source).not.toContain('No se pudo leer el PDF. Sube un PDF valido o conviertelo a imagen, DOCX o XLSX.');
    } finally {
      await fs.promises.rm(pdfPath, { force: true });
    }
  });
});
